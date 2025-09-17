import React, { useEffect, useRef, useState } from 'react';
import { createChart, ColorType } from 'lightweight-charts';
import chartService from '../services/chartService';

const TradingViewChart = ({ token, timeframe = '1MIN', onClose }) => {
  const containerRef = useRef(null);
  const chartRef = useRef(null); // { chart, series }
  const roRef = useRef(null);
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [displayMode, setDisplayMode] = useState('price'); // 'price' or 'mcap'

  // Helper: normalize candles data (safe version)
  const normalizeCandles = (rows=[]) => {
    const pick = (...xs) => xs.find(v => v != null);
    const toNum = (v) => v == null ? null : Number(v);
    const toSec = (t) => (t > 1e12 ? Math.floor(t / 1000) : t);

    const out = rows.map(d => {
      const time = toSec(pick(d.time, d.t));
      const o = toNum(pick(d.open, d.o, d.value));
      const h = toNum(pick(d.high, d.h, d.value));
      const l = toNum(pick(d.low, d.l, d.value));
      const c = toNum(pick(d.close, d.c, d.value));
      const v = toNum(pick(d.volume, d.v)) ?? 0;
      if (![time, o, h, l, c].every(Number.isFinite)) return null;
      return { time, open: o, high: h, low: l, close: c, volume: v };
    }).filter(Boolean);
    out.sort((a, b) => a.time - b.time);
    return out;
  };

  // Load chart data
  const loadChartData = async () => {
    if (!token?.contractAddress) return;
    
    setLoading(true);
    setError(null);
    
    try {
      console.log('Loading chart data for:', token.contractAddress, 'timeframe:', timeframe);
      const response = await chartService.getPriceChart(token.contractAddress, timeframe);
      
      if (response.success && response.data) {
        console.log('Chart service response:', response);
        const formattedData = response.data.map(item => ({
          time: item.time,
          open: item.open,
          high: item.high,
          low: item.low,
          close: item.close,
          volume: item.volume || 0
        }));
        
        console.log('Formatted chart data:', formattedData);
        console.log('Data quality check:', {
          totalPoints: formattedData.length,
          validPrices: formattedData.filter(d => d.close > 0).length,
          priceRange: {
            min: Math.min(...formattedData.map(d => d.close)),
            max: Math.max(...formattedData.map(d => d.close))
          },
          timeRange: {
            start: new Date(Math.min(...formattedData.map(d => d.time * 1000))).toISOString(),
            end: new Date(Math.max(...formattedData.map(d => d.time * 1000))).toISOString()
          }
        });
        setChartData(formattedData);
      } else {
        throw new Error('No data received from chart service');
      }
    } catch (error) {
      console.error('Failed to load chart data:', error);
      setError('Failed to load chart data: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Load data when token or timeframe changes
  useEffect(() => {
    if (token?.contractAddress) {
      loadChartData();
    }
  }, [token?.contractAddress, timeframe]);

  // INIT ONCE - Chart initialization (run once, never destroy on data changes)
  useEffect(() => {
    let ro;
    (async () => {
      const el = containerRef.current;
      if (!el) return;
      
      // Wait until visible/measurable
      if (!el.clientWidth || !el.clientHeight) {
        console.log('⏳ Container has no size, skipping init');
        return;
      }

      console.log('🔍 Container diagnostic:', {
        clientWidth: el.clientWidth,
        clientHeight: el.clientHeight,
        display: getComputedStyle(el).display
      });

      const { createChart, ColorType } = await import('lightweight-charts');
      const chart = createChart(el, {
        layout: { background: { type: ColorType.Solid, color: '#000' }, textColor: '#fff' },
        grid: { vertLines: { color: '#2e3a4a' }, horzLines: { color: '#2e3a4a' } },
        width: el.clientWidth,
        height: el.clientHeight || 400,
        crosshair: { mode: 1 },
      });
      const series = chart.addCandlestickSeries({
        upColor:'#089981', downColor:'#f23645', wickUpColor:'#089981', wickDownColor:'#f23645', borderVisible:false,
        priceFormat: { type:'price', precision:9, minMove:1e-9 },
      });
      chartRef.current = { chart, series };

      // Keep chart sized with container
      ro = new ResizeObserver(() => {
        const w = el.clientWidth, h = el.clientHeight || 400;
        chart.applyOptions({ width:w, height:h });
      });
      ro.observe(el);
      
      console.log('✅ Chart created successfully');
    })();

    return () => { 
      try{ro?.disconnect()}catch{}; 
      try{chartRef.current?.chart.remove()}catch{}; 
      chartRef.current = null; 
    };
  }, []);

  // APPLY DATA - Update chart data (separate effect, doesn't destroy chart)
  useEffect(() => {
    const ref = chartRef.current;
    if (!ref || !chartData?.length) return;

    const candles = normalizeCandles(chartData);
    if (!candles.length) return;

    const last = candles.at(-1)?.close ?? 1;
    const format =
      displayMode === 'mcap' ? { type:'price', precision:0, minMove:1 }
      : last >= 1          ? { type:'price', precision:6, minMove:1e-6 }
      : last >= 0.01       ? { type:'price', precision:8, minMove:1e-8 }
                            : { type:'price', precision:9, minMove:1e-9 };

    ref.series.applyOptions({ priceFormat: format, title: `${token?.symbol||'Token'} ${displayMode==='mcap'?'MCap':'Price'}` });
    ref.series.setData(candles);

    // Force into view (protect against offsets/barSpacing pushing data off-screen)
    ref.chart.timeScale().setVisibleRange({ from: candles[0].time, to: candles.at(-1).time });
    ref.chart.timeScale().fitContent();

    // Tiny datasets: reduce padding/spacing
    if (candles.length < 50) {
      ref.chart.applyOptions({ timeScale: { rightOffset: 2, barSpacing: 2 } });
      ref.chart.timeScale().fitContent();
    }
    
    console.log(`✅ Data applied successfully: ${candles.length} candles with precision ${format.precision}`);
  }, [chartData, displayMode, timeframe]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96 bg-black rounded-lg border border-gray-700">
        <div className="text-white">Loading chart data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-96 bg-black rounded-lg border border-gray-700">
        <div className="text-red-400 mb-4">Error: {error}</div>
        <button 
          onClick={loadChartData}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Price/Market Cap Toggle */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <span className="text-gray-400 text-sm">Display:</span>
          <div className="flex bg-gray-800 rounded-lg p-1">
            <button
              onClick={() => setDisplayMode('price')}
              className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                displayMode === 'price'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Price
            </button>
            <button
              onClick={() => setDisplayMode('mcap')}
              className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                displayMode === 'mcap'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Market Cap
            </button>
          </div>
        </div>
        
        {/* Token Symbol Display */}
        <div className="text-white font-medium">
          {token?.symbol || 'Token'} / {displayMode === 'mcap' ? 'MCap' : 'USD'}
        </div>
      </div>

      {/* Chart Container */}
      <div
        ref={containerRef}
        className="w-full bg-black rounded-lg border border-gray-700"
        style={{ 
          width: "100%", 
          height: "400px", 
          position: "relative",
          minWidth: "400px",
          minHeight: "400px",
          border: "2px dashed #f00", // Temporary debug border
          overflow: "visible", // Ensure canvas isn't clipped
          zIndex: 1 // Ensure chart is above other elements
        }}
      />
    </div>
  );
};

export default TradingViewChart;