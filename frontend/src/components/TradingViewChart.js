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

  // Helper: normalize candles data with timeframe bucketing
  const TF_SEC = { '1MIN':60, '5MIN':300, '15MIN':900, '1H':3600, '4H':14400, '1D':86400, '1W':604800, '1M':2592000 };

  const toSecBucket = (t, timeframe) => {
    if (t == null) return null;
    const s = t > 1e12 ? t / 1000 : t;          // ms -> s if needed
    const sec = Math.floor(s);                  // <- integer seconds
    const step = TF_SEC[timeframe] || 60;
    return Math.floor(sec / step) * step;       // align to candle boundary
  };

  const normalizeCandles = (rows = [], timeframe) => {
    const pick  = (...xs) => xs.find(v => v != null);
    const toNum = v => v == null ? null : Number(v);

    // build by time to de-dup if backend sends multiple points per bucket
    const byTime = new Map();

    for (const d of rows) {
      const time = toSecBucket(pick(d.time, d.t, d.timestamp), timeframe);
      const o = toNum(pick(d.open, d.o, d.value));
      const h = toNum(pick(d.high, d.h, d.value));
      const l = toNum(pick(d.low , d.l, d.value));
      const c = toNum(pick(d.close, d.c, d.value));
      const v = toNum(pick(d.volume, d.v)) ?? 0;
      if (![time,o,h,l,c].every(Number.isFinite)) continue;
      byTime.set(time, { time, open:o, high:h, low:l, close:c, volume:v });
    }

    const out = [...byTime.values()].sort((a,b) => a.time - b.time);
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

      // 🛑 wait until the container is visible & measurable
      if (el.clientWidth === 0 || (el.clientHeight || 0) === 0) {
        console.log('⏳ Container not measurable, skipping init');
        return;
      }

      console.log('🔍 Container diagnostic:', {
        width: el.clientWidth,
        height: el.clientHeight,
        display: getComputedStyle(el).display,
        position: getComputedStyle(el).position,
      });
      
      // Quick size check right before chart creation
      console.log('size', el?.clientWidth, el?.clientHeight, getComputedStyle(el).display);

      const { createChart, ColorType } = await import('lightweight-charts');

      const chart = createChart(el, {
        layout: { background: { type: ColorType.Solid, color: '#0b0f17' }, textColor: '#cbd5e1' },
        grid: { vertLines: { color: '#2e3a4a' }, horzLines: { color: '#2e3a4a' } }, // brighter so you SEE it
        rightPriceScale: { borderColor: '#374151', scaleMargins: { top: 0.1, bottom: 0.15 } },
        timeScale: { borderColor: '#374151', timeVisible: true },
        crosshair: { mode: 1 },
        width: el.clientWidth,
        height: el.clientHeight || 400,
        autoSize: true, // Let the chart auto-size to container
      });

      const series = chart.addCandlestickSeries({
        upColor: '#10b981', downColor: '#ef4444',
        wickUpColor: '#10b981', wickDownColor: '#ef4444',
        borderVisible: false,
        priceFormat: { type: 'price', precision: 9, minMove: 1e-9 },
      });

      chartRef.current = { chart, series };

      // Force initial resize to ensure proper dimensions
      chart.applyOptions({
        width: el.clientWidth,
        height: el.clientHeight || 400,
      });

      // keep chart sized to container
      ro = new ResizeObserver(() => {
        if (!chartRef.current || !containerRef.current) return;
        chartRef.current.chart.applyOptions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight || 400,
        });
      });
      ro.observe(el);

      // quick viz that canvas exists
      console.log('🖼️ canvases:',
        el.querySelectorAll('canvas').length,
        [...el.querySelectorAll('canvas')].map(c => [c.width, c.height, getComputedStyle(c).zIndex]));
    })();

    return () => {
      try { ro?.disconnect(); } catch {}
      try { chartRef.current?.chart.remove(); } catch {}
      chartRef.current = null;
      roRef.current = null;
    };
  }, []);

  // APPLY DATA - Update chart data (separate effect, doesn't destroy chart)
  useEffect(() => {
    const ref = chartRef.current;
    if (!ref || !chartData?.length) return;

    const candles = normalizeCandles(chartData, timeframe);
    if (!candles.length) return;

    // Bullet-proof data application sequence
    ref.series.applyOptions({
      priceFormat: (()=>{
        const last = candles.at(-1).close;
        if (displayMode === 'mcap') return { type:'price', precision:0, minMove:1 };
        if (last >= 1) return { type:'price', precision:6, minMove:1e-6 };
        if (last >= 0.01) return { type:'price', precision:8, minMove:1e-8 };
        return { type:'price', precision:9, minMove:1e-9 };
      })(),
      title: `${token?.symbol || 'Token'} ${displayMode==='mcap'?'MCap':'Price'}`
    });

    ref.series.setData(candles);

    const small = candles.length < 60;
    ref.chart.applyOptions({ timeScale: { rightOffset: small ? 2 : 8, barSpacing: small ? 2 : 6 } });

    const from = candles[0].time, to = candles.at(-1).time;
    ref.chart.timeScale().setVisibleRange({ from, to });
    ref.chart.timeScale().fitContent();
    
    console.log(`✅ Data applied successfully: ${candles.length} candles`);
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
          minHeight: "400px"
        }}
      />
    </div>
  );
};

export default TradingViewChart;