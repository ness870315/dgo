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

  // Helper: normalize candles data (fixed NaN propagation)
  const normalizeCandles = (rows) => {
    if (!Array.isArray(rows)) return [];
    const pick = (...xs) => xs.find(v => v != null);
    const toNum = (v) => v == null ? null : Number(v);
    const toSec = (t) => (t > 1e12 ? Math.floor(t / 1000) : t);

    const out = rows.map((d) => {
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
    console.log('🚀 Chart initialization effect starting...');
    let mounted = true;

    const init = async () => {
      console.log('🔧 Init function called, containerRef.current:', !!containerRef.current);
      if (!containerRef.current) {
        console.log('❌ No container ref, skipping init');
        return;
      }
      
      const el = containerRef.current;
      
      // Quick diagnostic - check container state
      const computedStyle = getComputedStyle(el);
      console.log('🔍 Container diagnostic:', {
        clientWidth: el.clientWidth,
        clientHeight: el.clientHeight,
        offsetWidth: el.offsetWidth,
        offsetHeight: el.offsetHeight,
        display: computedStyle.display,
        visibility: computedStyle.visibility,
        position: computedStyle.position,
        zIndex: computedStyle.zIndex
      });
      
      // Wait until container has size with retry mechanism
      let retries = 0;
      while ((el.clientWidth === 0 || (el.clientHeight || 0) === 0) && retries < 10) {
        console.log(`⏳ Container has no size, retry ${retries + 1}/10...`);
        await new Promise(resolve => setTimeout(resolve, 100));
        retries++;
      }
      
      if (el.clientWidth === 0 || (el.clientHeight || 0) === 0) {
        console.log('❌ Container still has no size after retries, using fallback dimensions');
        // Use fallback dimensions but still try to create chart
      }

      // Dynamic import to avoid SSR/ESM issues
      const { createChart, ColorType } = await import('lightweight-charts');

      const containerWidth = el.clientWidth || 800;
      const containerHeight = el.clientHeight || 400;
      
      console.log('📊 Creating chart with dimensions:', { containerWidth, containerHeight });

      const chart = createChart(el, {
        layout: { 
          background: { type: ColorType.Solid, color: '#000000' }, 
          textColor: '#ffffff',
          fontSize: 12,
          fontFamily: 'Trebuchet MS, sans-serif',
        },
        grid: { 
          vertLines: { color: '#1e1e1e', style: 2, visible: true }, 
          horzLines: { color: '#1e1e1e', style: 2, visible: true } 
        },
        rightPriceScale: {
          borderColor: "#333333",
          textColor: "#ffffff",
          scaleMargins: { top: 0.1, bottom: 0.1 },
          autoScale: true,
          alignLabels: true,
          borderVisible: true,
          entireTextOnly: false,
        },
        timeScale: {
          borderColor: "#333333",
          textColor: "#ffffff",
          timeVisible: true,
          secondsVisible: false,
          rightOffset: 12,
          barSpacing: 6,
          fixLeftEdge: false,
          fixRightEdge: false,
        },
        crosshair: { mode: 1 },
        handleScroll: { 
          mouseWheel: true, 
          pressedMouseMove: true, 
          horzTouchDrag: true, 
          vertTouchDrag: true 
        },
        handleScale: { 
          axisPressedMouseMove: true, 
          mouseWheel: true, 
          pinch: true, 
          axisDoubleClickReset: true 
        },
        width: containerWidth,
        height: containerHeight,
      });

      const series = chart.addCandlestickSeries({
        priceFormat: { type: 'price', precision: 9, minMove: 1e-9 },
        upColor: '#089981', 
        downColor: '#f23645', 
        wickUpColor: '#089981', 
        wickDownColor: '#f23645', 
        borderVisible: false,
        priceLineVisible: true,
        lastValueVisible: true,
      });

      chartRef.current = { chart, series };
      
      // Check if canvas elements are created
      const canvasElements = el.querySelectorAll('canvas');
      console.log('✅ Chart created successfully:', {
        hasChart: !!chart,
        hasSeries: !!series,
        chartWidth: chart.options().width,
        chartHeight: chart.options().height,
        containerElement: el.tagName,
        containerClasses: el.className,
        containerStyle: el.style.cssText,
        canvasCount: canvasElements.length,
        canvasElements: Array.from(canvasElements).map(canvas => ({
          width: canvas.width,
          height: canvas.height,
          style: canvas.style.cssText,
          display: getComputedStyle(canvas).display,
          visibility: getComputedStyle(canvas).visibility,
          opacity: getComputedStyle(canvas).opacity
        }))
      });

      // Resize observer
      const ro = new ResizeObserver(() => {
        if (!chartRef.current || !containerRef.current) return;
        const el = containerRef.current;
        chartRef.current.chart.applyOptions({
          width: el.clientWidth,
          height: el.clientHeight || 400,
        });
        console.log('📏 Chart resized to:', { width: el.clientWidth, height: el.clientHeight });
      });
      ro.observe(el);
      roRef.current = ro;
    };

    init();

    return () => {
      console.log('🧹 Chart initialization cleanup running...');
      try { roRef.current?.disconnect(); } catch {}
      try { chartRef.current?.chart.remove(); } catch {}
      chartRef.current = null;
      roRef.current = null;
    };
  }, []);

  // APPLY DATA - Update chart data (separate effect, doesn't destroy chart)
  useEffect(() => {
    const ref = chartRef.current;
    if (!ref || !chartData?.length) {
      console.log('📊 Data application skipped:', { 
        hasRef: !!ref, 
        hasData: !!chartData?.length,
        dataLength: chartData?.length || 0 
      });
      return;
    }
    
    console.log('📊 Applying data to chart...');
    const candles = normalizeCandles(chartData);
    if (!candles.length) {
      console.log('❌ No valid candles after normalization');
      return;
    }

    // mcap transform (optional): prefer price * circulatingSupply
    let final = candles;
    if (displayMode === 'mcap' && Number.isFinite(token?.circulatingSupply)) {
      const s = token.circulatingSupply;
      final = candles.map(c => ({ 
        ...c, 
        open: c.open * s, 
        high: c.high * s, 
        low: c.low * s, 
        close: c.close * s 
      }));
    }

    // precision from last close
    const last = final.at(-1)?.close ?? 1;
    const fmt = displayMode === 'mcap'
      ? { type: 'price', precision: 0, minMove: 1 }
      : (last >= 1    ? { type:'price', precision:6, minMove:1e-6 }
        : last >= 0.01? { type:'price', precision:8, minMove:1e-8 }
                      : { type:'price', precision:9, minMove:1e-9 });

    ref.series.applyOptions({ 
      priceFormat: fmt, 
      title: `${token?.symbol || 'Token'} ${displayMode==='mcap'?'MCap':'Price'}` 
    });
    ref.series.setData(final);
    
    // For small datasets, reduce padding to prevent off-screen rendering
    if (final.length < 50) {
      ref.chart.applyOptions({ 
        timeScale: { 
          rightOffset: 2, 
          barSpacing: 2,
          fixLeftEdge: false,
          fixRightEdge: false
        } 
      });
      console.log(`📊 Small dataset (${final.length} bars) - reduced padding`);
    }
    
    ref.chart.timeScale().fitContent();
    
    // Check canvas state after data application
    const canvasElements = containerRef.current?.querySelectorAll('canvas');
    console.log(`✅ Data applied successfully: ${final.length} candles with precision ${fmt.precision}`, {
      canvasCount: canvasElements?.length || 0,
      canvasVisible: canvasElements ? Array.from(canvasElements).every(canvas => 
        getComputedStyle(canvas).display !== 'none' && 
        getComputedStyle(canvas).visibility !== 'hidden' &&
        getComputedStyle(canvas).opacity !== '0'
      ) : false
    });
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