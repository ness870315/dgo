import React, { useEffect, useRef, useState } from 'react';
import chartService from '../services/chartService';

const TradingViewChart = ({ token, timeframe = '1MIN', onClose }) => {
  const containerRef = useRef(null);
  const chartRef = useRef(null);     // { chart, series }
  const roRef = useRef(null);        // ResizeObserver
  const ioRef = useRef(null);        // IntersectionObserver
  const pendingInitRef = useRef(false);
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [displayMode, setDisplayMode] = useState('price'); // 'price' or 'mcap'

  // ---- A) WAIT UNTIL VISIBLE + MEASURABLE, THEN INIT ONCE
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // If already initialized, do nothing
    if (chartRef.current) return;

    // Guard to avoid double init races
    if (pendingInitRef.current) return;

    // If the tab/panel is hidden OR has no size yet, use IntersectionObserver
    const isMeasurable = () => el.clientWidth > 0 && el.clientHeight > 0;
    const waitForStableSize = async (el, tries = 20) => {
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      let w1=0,h1=0,w2=0,h2=0;
      for (let i=0; i<tries; i++) {
        await sleep(16); // ~1 frame
        w1 = el.clientWidth;  h1 = el.clientHeight;
        await sleep(16);
        w2 = el.clientWidth;  h2 = el.clientHeight;
        if (w1>50 && h1>50 && w1===w2 && h1===h2) {
          console.log('✅ Size stable:', w2, 'x', h2);
          return {w:w2, h:h2};
        }
      }
      console.log('⚠️ Size not stable after', tries, 'tries, using best effort');
      return { w: el.clientWidth, h: el.clientHeight }; // best effort
    };

    const tryInit = async () => {
      if (chartRef.current || pendingInitRef.current) return;
      if (!isMeasurable()) return;

      pendingInitRef.current = true;
      console.log('🚀 Initializing chart when visible and measurable...');
      console.log('🔍 Container diagnostic:', {
        display: getComputedStyle(el).display,
        height: el.clientHeight,
        position: getComputedStyle(el).position,
        width: el.clientWidth
      });
      console.log('size', el.clientWidth, el.clientHeight, getComputedStyle(el).display);
      
      // Wait for stable size before creating chart
      await waitForStableSize(el);
      
      const { createChart, ColorType } = await import("lightweight-charts");

      const chart = createChart(el, {
        layout: { 
          background: { type: ColorType.Solid, color: "#0b0f17" }, 
          textColor: "#cbd5e1" 
        },
        grid: { 
          vertLines: { color: "#2e3a4a" }, 
          horzLines: { color: "#2e3a4a" } 
        },
        rightPriceScale: { 
          borderColor: "#374151", 
          scaleMargins: { top: 0.1, bottom: 0.15 } 
        },
        timeScale: { 
          borderColor: "#374151", 
          timeVisible: true 
        },
        crosshair: { mode: 1 },
        width: el.clientWidth,
        height: el.clientHeight || 400,
      });

      const series = chart.addCandlestickSeries({
        upColor: "#10b981", 
        downColor: "#ef4444",
        wickUpColor: "#10b981", 
        wickDownColor: "#ef4444",
        borderVisible: false,
        priceFormat: { type: "price", precision: 9, minMove: 1e-9 },
      });

      chartRef.current = { chart, series };
      pendingInitRef.current = false;

      console.log('✅ Chart initialized with dimensions:', el.clientWidth, el.clientHeight);
      
      // Check canvas dimensions after creation
      setTimeout(() => {
        const canvases = el.querySelectorAll('canvas');
        console.log('🖼️ canvases:', [...canvases].map(c => [c.width, c.height, c.style.zIndex]));
        
        // Validate canvas dimensions - if any are tiny, force resize
        const bad = [...canvases].some(c => c.width <= 1 || c.height <= 1);
        if (bad) {
          console.log('🚨 Tiny canvas detected, forcing resize...');
          chart.applyOptions({ width: el.clientWidth, height: el.clientHeight });
          
          // Check again after resize
          setTimeout(() => {
            const canvasesAfter = el.querySelectorAll('canvas');
            console.log('🖼️ canvases after resize:', [...canvasesAfter].map(c => [c.width, c.height, c.style.zIndex]));
          }, 50);
        }
      }, 100);

      // Keep chart in sync with container size
      const ro = new ResizeObserver(() => {
        if (!chartRef.current || !containerRef.current) return;
        chartRef.current.chart.applyOptions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight || 400,
        });
      });
      ro.observe(el);
      roRef.current = ro;

      // If data already loaded while hidden, apply it now
      console.log('🔄 Checking for existing data to apply...');
      applyData();
    };

    // If already visible and measurable → init now
    if (isMeasurable() && el.offsetParent !== null) {
      tryInit();
    } else {
      console.log('👁️ Panel not visible yet, waiting with IntersectionObserver...');
      // Wait until the panel is actually visible
      const io = new IntersectionObserver((entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting) {
          console.log('👁️ Panel became visible, initializing chart...');
          // rAF + setTimeout: give layout a tick to compute final size
          requestAnimationFrame(() => setTimeout(tryInit, 0));
        }
      }, { root: null, threshold: 0.01 });
      io.observe(el);
      ioRef.current = io;
    }

    return () => {
      try { ioRef.current?.disconnect(); } catch {}
      try { roRef.current?.disconnect(); } catch {}
      try { chartRef.current?.chart.remove(); } catch {}
      chartRef.current = null;
      roRef.current = null;
      ioRef.current = null;
      pendingInitRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // INIT ONCE

  // ---- B) APPLY/UPDATE DATA (safe even if tab was hidden earlier)
  const normalizeCandles = (rows = [], tf = "1MIN") => {
    const TF_SEC = { "1MIN":60, "5MIN":300, "15MIN":900, "1H":3600, "4H":14400, "1D":86400, "1W":604800, "1M":2592000 };
    const step = TF_SEC[tf] || 60;
    const pick  = (...xs) => xs.find(v => v != null);
    const toNum = v => v == null ? null : Number(v);
    const toSecBucket = (t) => {
      if (t == null) return null;
      const s = t > 1e12 ? t / 1000 : t;
      return Math.floor(Math.floor(s) / step) * step; // integer seconds, bucketed
    };
    const map = new Map();
    for (const d of rows) {
      const time = toSecBucket(pick(d.time, d.t, d.timestamp));
      const o = toNum(pick(d.open, d.o, d.value));
      const h = toNum(pick(d.high, d.h, d.value));
      const l = toNum(pick(d.low , d.l, d.value));
      const c = toNum(pick(d.close, d.c, d.value));
      const v = toNum(pick(d.volume, d.v)) ?? 0;
      if (![time,o,h,l,c].every(Number.isFinite)) continue;
      map.set(time, { time, open:o, high:h, low:l, close:c, volume:v });
    }
    const out = [...map.values()].sort((a,b) => a.time - b.time);
    return out;
  };

  const applyData = () => {
    const ref = chartRef.current;
    if (!ref || !chartData?.length) {
      console.log('📊 Data application skipped:', { hasRef: !!ref, dataLength: chartData?.length });
      return;
    }

    console.log('📊 Applying data to chart...');
    const candles = normalizeCandles(chartData, timeframe);
    if (!candles.length) {
      console.log('📊 No valid candles after normalization');
      return;
    }

    // precision from last close
    const last = candles.at(-1).close;
    const fmt = last >= 1 ? { type:"price", precision:6, minMove:1e-6 }
            : last >= 0.01 ? { type:"price", precision:8, minMove:1e-8 }
                           : { type:"price", precision:9, minMove:1e-9 };

    ref.series.applyOptions({ priceFormat: fmt });
    ref.series.setData(candles);

    // keep bars in view (handles previous scroll/rightOffset state)
    const from = candles[0].time, to = candles.at(-1).time;
    ref.chart.applyOptions({ 
      timeScale: { 
        rightOffset: candles.length < 60 ? 2 : 8, 
        barSpacing: candles.length < 60 ? 2 : 6 
      } 
    });
    ref.chart.timeScale().setVisibleRange({ from, to });
    ref.chart.timeScale().fitContent();

    // one more tick to ensure canvases pick up final size
    requestAnimationFrame(() => {
      const el = containerRef.current;
      if (el) {
        ref.chart.applyOptions({ width: el.clientWidth, height: el.clientHeight || 400 });
        
        // Enhanced canvas validation
        const cvs = [...el.querySelectorAll('canvas')];
        console.log('🖼️ Final canvas check:', cvs.map(c => [c.width, c.height, getComputedStyle(c).zIndex]));
        console.log('🖼️ Canvas count:', cvs.length, 'Container size:', el.clientWidth, 'x', el.clientHeight);
        console.log('🖼️ Container display:', getComputedStyle(el).display);
        
        // Check for tiny canvases after data application
        const bad = cvs.some(c => c.width <= 1 || c.height <= 1);
        if (bad) {
          console.log('🚨 Tiny canvas after data application, forcing final resize...');
          ref.chart.applyOptions({ width: el.clientWidth, height: el.clientHeight || 400 });
        }
      }
    });

    console.log('✅ Data applied successfully:', candles.length, 'candles');
  };

  useEffect(() => { 
    console.log('🔄 applyData effect triggered:', { chartDataLength: chartData?.length, timeframe, displayMode });
    applyData(); 
  }, [chartData, timeframe, displayMode]);

  // Load chart data
  useEffect(() => {
    const contract = token?.contract || token?.contractAddress || token?.mint || token?.address;
    console.log('🔄 Data loading effect triggered:', { contract, timeframe });
    console.log('Fetching chart for contract:', contract, 'timeframe:', timeframe);
    if (!contract) {
      console.log('❌ No token contract, skipping data load');
      return;
    }

    const loadChartData = async () => {
      setLoading(true);
      setError(null);
      
      try {
        console.log(`Loading chart data for: ${contract} timeframe: ${timeframe} (RD tier)`);
        const response = await chartService.getPriceChartRD(contract, timeframe);
        
        if (response && response.data && Array.isArray(response.data)) {
          console.log('Chart service response:', response);
          setChartData(response.data);
          console.log('Formatted chart data:', response.data);
          console.log('📊 Data loaded, will trigger applyData effect...');
          console.log('Data quality check:', {
            totalPoints: response.data.length,
            validPrices: response.data.filter(d => d.close && !isNaN(d.close) && d.close > 0).length,
            priceRange: response.data.reduce((acc, d) => ({
              min: Math.min(acc.min, d.close || Infinity),
              max: Math.max(acc.max, d.close || 0)
            }), { min: Infinity, max: 0 }),
            timeRange: response.data.length > 0 ? {
              start: new Date(response.data[0].time * 1000).toISOString(),
              end: new Date(response.data[response.data.length - 1].time * 1000).toISOString()
            } : { start: null, end: null }
          });
        } else {
          setError('Failed to load chart data - invalid response format');
        }
      } catch (err) {
        console.error('Chart data loading error:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    loadChartData();
  }, [token?.contract, token?.contractAddress, token?.mint, token?.address, timeframe]);

  return (
    <div className="w-full bg-black rounded-lg border border-gray-700 p-4 relative">
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center space-x-4">
          <h3 className="text-white text-lg font-semibold">
            {token?.symbol || 'Token'} Chart
          </h3>
          <div className="flex space-x-2">
            <button
              onClick={() => setDisplayMode('price')}
              className={`px-3 py-1 rounded text-sm ${
                displayMode === 'price' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              Price
            </button>
            <button
              onClick={() => setDisplayMode('mcap')}
              className={`px-3 py-1 rounded text-sm ${
                displayMode === 'mcap' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              Market Cap
            </button>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white transition-colors"
        >
          ✕
        </button>
      </div>

      {/* Chart Container */}
      <div
        ref={containerRef}
        style={{ width: "100%", height: 400, position: "relative" }}
        className="bg-black rounded-lg border border-gray-700"
      />

      {/* Loading/Error States */}
      {loading && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70">
          <div className="text-white">Loading chart data...</div>
        </div>
      )}
      
      {error && (
        <div className="mt-4 p-3 bg-red-900 border border-red-700 rounded text-red-200">
          Error: {error}
        </div>
      )}
    </div>
  );
};

export default TradingViewChart;