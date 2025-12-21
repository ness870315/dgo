import React, { useEffect, useRef, useState } from 'react';
import chartService from '../services/chartService';

const TradingViewChart = ({ token, timeframe = '5MIN', onClose }) => {
  const containerRef = useRef(null);
  const chartRef = useRef(null);     // { chart, series }
  const roRef = useRef(null);        // ResizeObserver
  const ioRef = useRef(null);        // IntersectionObserver
  const pendingInitRef = useRef(false);
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [displayMode, setDisplayMode] = useState('price'); // 'price' or 'mcap'
  const [timeZone, setTimeZone] = useState('UTC'); // 'UTC' or 'Local'
  const [selectedTimeframe, setSelectedTimeframe] = useState(timeframe);

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
          background: { type: ColorType.Solid, color: "#1e293b" }, // Dark gray background
          textColor: "#cbd5e1" 
        },
        grid: { 
          vertLines: { color: "#334155", style: 0 }, // Subtle gray grid lines
          horzLines: { color: "#334155", style: 0 } 
        },
        rightPriceScale: { 
          visible: false  // Hide right price scale
        },
        leftPriceScale: {
          visible: true,
          borderColor: "#374151",
          scaleMargins: { top: 0.1, bottom: 0.15 },
          autoScale: true
        },
        timeScale: { 
          borderColor: "#374151", 
          timeVisible: true 
        },
        crosshair: { mode: 1 },
        width: el.clientWidth,
        height: el.clientHeight || 400,
      });

      const series = chart.addAreaSeries({
        lineColor: "#ec4899", // Pink line
        topColor: "rgba(139, 92, 246, 0.4)", // Purple gradient area
        bottomColor: "rgba(139, 92, 246, 0.05)",
        lineWidth: 2,
        priceFormat: { type: "price", precision: 8, minMove: 1e-8 },
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
        
        // Reapply close view after resize
        if (chartData?.length) {
          ensureCloseView(chartRef.current.chart, containerRef.current, timeframe, chartData);
        }
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
  const TF_SEC = { '1MIN':60, '5MIN':300, '15MIN':900, '1H':3600, '4H':14400, '1D':86400, '1W':604800, '1M':2592000 };

  const VIEW_BARS = {
    '1MIN': 180,   // ~3h
    '5MIN': 144,   // ~12h
    '15MIN': 96,   // ~1 day
    '1H': 240,     // ~10 days
    '4H': 180,     // ~30 days
    '1D': 120,     // ~4 months
    '1W': 156,     // ~3 years
    '1M': 120,     // ~10 years
  };

  function ensureCloseView(chart, containerEl, timeframe, data) {
    if (!data?.length) return;
    const step = TF_SEC[timeframe] || 60;
    const n = VIEW_BARS[timeframe] || 200;
    const last = data[data.length - 1].time;
    const from = last - step * Math.max(1, n - 1);

    // Bar width target ~6–8px
    const width = containerEl?.clientWidth || 800;
    const barSpacing = Math.max(2, Math.min(12, Math.floor((width / n) * 0.7)));

    chart.applyOptions({
      timeScale: {
        rightOffset: 1.5,   // small gap to the right
        barSpacing,
        fixRightEdge: true, // keep last bar against the right edge
      },
    });

    chart.timeScale().setVisibleRange({ from, to: last });

    // ⛔ Do NOT call fitContent() here, it will zoom back out.
  }

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
    const candles = normalizeCandles(chartData, selectedTimeframe);
    if (!candles.length) {
      console.log('📊 No valid candles after normalization');
      return;
    }

    // Transform data for market cap if needed
    let finalData = candles.map(c => ({ time: c.time, value: c.close }));
    let yAxisTitle = `${token?.symbol || 'Token'}/USD`;
    
    if (displayMode === 'mcap' && token?.circulatingSupply) {
      const supply = token.circulatingSupply;
      finalData = candles.map(c => ({
        time: c.time,
        value: c.close * supply
      }));
      yAxisTitle = `${token?.symbol || 'Token'}/MCap`;
    }

    // precision from last close
    const last = candles.at(-1).close;
    
    // Better price formatting with custom formatter
    const formatPrice = (price) => {
      if (displayMode === 'mcap') {
        return price.toFixed(0);
      } else if (price >= 1) {
        return price.toFixed(2);
      } else if (price < 0.0001) {
        return price.toExponential(2);
      } else {
        return price.toFixed(6); // 6 decimals for prices < 1
      }
    };

    ref.series.applyOptions({ 
      priceFormat: {
        type: 'custom',
        formatter: formatPrice
      },
      lastValueVisible: true
    });
    
    // Apply better price scale formatting
    ref.chart.applyOptions({
      leftPriceScale: {
        autoScale: true,
        borderColor: "#374151",
        scaleMargins: { top: 0.1, bottom: 0.15 }
      }
    });
    
    ref.series.setData(finalData);

    // Use close view helper instead of fitContent
    ensureCloseView(ref.chart, containerRef.current, selectedTimeframe, finalData);

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
    console.log('🔄 applyData effect triggered:', { chartDataLength: chartData?.length, selectedTimeframe, displayMode });
    applyData(); 
  }, [chartData, selectedTimeframe, displayMode]);

  // Load chart data
  useEffect(() => {
    const contract = token?.contract || token?.contractAddress || token?.mint || token?.address;
    console.log('🔄 Data loading effect triggered:', { contract, timeframe: selectedTimeframe });
    console.log('Fetching chart for contract:', contract, 'timeframe:', selectedTimeframe);
    if (!contract) {
      console.log('❌ No token contract, skipping data load');
      return;
    }

    const loadChartData = async () => {
      setLoading(true);
      setError(null);
      
      try {
        console.log(`Loading chart data for: ${contract} timeframe: ${selectedTimeframe} (RD tier)`);
        const response = await chartService.getPriceChartRD(contract, selectedTimeframe);
        
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
  }, [token?.contract, token?.contractAddress, token?.mint, token?.address, selectedTimeframe]);

  // Calculate current price and price change
  const currentPrice = chartData && chartData.length > 0 ? chartData[chartData.length - 1]?.close : token?.price || 0;
  const priceChange = chartData && chartData.length > 0 && chartData.length >= 2 
    ? ((currentPrice - chartData[chartData.length - 2]?.close) / chartData[chartData.length - 2]?.close) * 100 
    : 0;
  const marketCap = token?.mcap || 0;
  const volume5min = token?.volume24h || 0; // This should be calculated from 5MIN data

  const formatPrice = (price) => {
    if (!price) return '$0.000000';
    if (price < 0.000001) return `$${price.toExponential(2)}`;
    if (price < 0.01) return `$${price.toFixed(6)}`;
    return `$${price.toFixed(4)}`;
  };

  const formatMCap = (mcap) => {
    if (!mcap) return 'N/A';
    if (mcap >= 1e9) return `${(mcap / 1e9).toFixed(1)}B`;
    if (mcap >= 1e6) return `${(mcap / 1e6).toFixed(1)}M`;
    if (mcap >= 1e3) return `${(mcap / 1e3).toFixed(1)}K`;
    return mcap.toFixed(0);
  };

  const formatVolume = (vol) => {
    if (!vol) return 'N/A';
    if (vol >= 1e9) return `${(vol / 1e9).toFixed(1)}B`;
    if (vol >= 1e6) return `${(vol / 1e6).toFixed(1)}M`;
    if (vol >= 1e3) return `${(vol / 1e3).toFixed(1)}K`;
    return vol.toFixed(0);
  };

  return (
    <div className="w-full bg-black rounded-lg border border-gray-700 p-4 relative">
      {/* Top Information Bar */}
      <div className="mb-4">
        <div className="text-4xl font-bold text-white mb-1">
          {formatPrice(currentPrice)}
        </div>
        <div className={`text-lg mb-2 ${priceChange >= 0 ? 'text-green-500' : 'text-red-500'}`}>
          {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)}%
        </div>
        <div className="flex justify-between items-end">
          <div>
            <div className="text-sm text-gray-400">Market Cap: {formatMCap(marketCap)}</div>
            <div className="text-sm text-gray-400">Volume ({selectedTimeframe}): {formatVolume(volume5min)}</div>
          </div>
        </div>
      </div>

      {/* Control Panel */}
      <div className="flex flex-wrap gap-2 mb-4">
        {/* Timeframe Buttons */}
        <div className="flex items-center gap-1">
          {['1MIN', '5MIN', '15MIN', '1H', '4H', '1D', 'ALL'].map(tf => (
            <button
              key={tf}
              onClick={() => setSelectedTimeframe(tf)}
              className={`px-3 py-1 rounded text-sm ${
                selectedTimeframe === tf
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>

        {/* Mode Buttons */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setDisplayMode('price')}
            className={`px-3 py-1 rounded text-sm ${
              displayMode === 'price'
                ? 'bg-green-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            Price
          </button>
          <button
            onClick={() => setDisplayMode('mcap')}
            className={`px-3 py-1 rounded text-sm ${
              displayMode === 'mcap'
                ? 'bg-green-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            Market Cap
          </button>
        </div>

        {/* Time Zone Buttons */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setTimeZone('UTC')}
            className={`px-3 py-1 rounded text-sm ${
              timeZone === 'UTC'
                ? 'bg-purple-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            UTC
          </button>
          <button
            onClick={() => setTimeZone('Local')}
            className={`px-3 py-1 rounded text-sm ${
              timeZone === 'Local'
                ? 'bg-purple-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            Local
          </button>
        </div>
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