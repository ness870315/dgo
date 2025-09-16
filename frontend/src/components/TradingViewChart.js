import React, { useEffect, useRef, useState } from 'react';
import chartService from '../services/chartService';

const TradingViewChart = ({ token, timeframe = '1D', onClose }) => {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const volumeSeriesRef = useRef(null);
  const resizeObsRef = useRef(null);
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Use timeframe prop directly instead of local state
  const [indicators, setIndicators] = useState({
    sma: { enabled: false, period: 20 },
    ema: { enabled: false, period: 20 },
    rsi: { enabled: false, period: 14 },
    macd: { enabled: false, fast: 12, slow: 26, signal: 9 },
    bollinger: { enabled: false, period: 20, stdDev: 2 }
  });
  const [showIndicators, setShowIndicators] = useState(false);

  // Helper: ensure seconds & sorted ascending
  const normalizeCandles = (rows) => {
    console.log('Normalizing candles, input:', rows.length, 'rows');
    console.log('Sample input row:', rows[0]);
    
    if (!Array.isArray(rows)) {
      console.log('Input is not an array');
      return [];
    }
    
    const toSec = (t) => (t > 1e12 ? Math.floor(t / 1000) : t); // ms -> s
    const out = rows.map((d, index) => {
      const normalized = {
        time: toSec(d.time ?? d.t),
        open: +d.open ?? +d.o ?? +d.value,
        high: +d.high ?? +d.h ?? +d.value,
        low: +d.low ?? +d.l ?? +d.value,
        close: +d.close ?? +d.c ?? +d.value,
        volume: +d.volume ?? 0,
      };
      
      if (index === 0) {
        console.log('Sample normalized candle:', normalized);
        console.log('Time finite?', Number.isFinite(normalized.time));
        console.log('Close finite?', Number.isFinite(normalized.close));
      }
      
      return normalized;
    }).filter(c => Number.isFinite(c.time) && Number.isFinite(c.close));
    
    console.log('After filtering:', out.length, 'valid candles');
    out.sort((a, b) => a.time - b.time); // Always ascending
    console.log('After sorting, first candle time:', out[0]?.time, 'last candle time:', out[out.length - 1]?.time);
    return out;
  };

  // INIT (once) - Client-only initialization
  useEffect(() => {
    console.log('Chart initialization useEffect triggered');
    let destroyed = false;

    const init = async (retryCount = 0) => {
      console.log('Init function called, retry:', retryCount);
      console.log('Window check:', typeof window !== "undefined");
      console.log('Container ref current:', !!containerRef.current);
      console.log('Chart ref current:', !!chartRef.current);
      
      if (typeof window === "undefined") {
        console.log('SSR guard triggered, returning');
        return;               // SSR guard
      }
      
      if (chartRef.current) {
        console.log('Chart already exists, returning');
        return;   // already created
      }
      
      if (!containerRef.current) {
        console.log('Container not ready, retry count:', retryCount);
        if (retryCount < 10) { // Retry up to 10 times
          console.log('Retrying init in 200ms...');
          setTimeout(() => init(retryCount + 1), 200);
          return;
        } else {
          console.error('Container ref never became ready after 10 retries');
          setError('Chart container failed to initialize');
          return;
        }
      }

      try {
        console.log('Attempting to import lightweight-charts...');
        const { createChart, ColorType } = await import("lightweight-charts");
        console.log('Successfully imported lightweight-charts');

        // Get container dimensions safely
        const container = containerRef.current;
        const containerWidth = container.clientWidth || container.offsetWidth || 800;
        const containerHeight = container.clientHeight || container.offsetHeight || 400;

        console.log('Creating chart with dimensions:', containerWidth, 'x', containerHeight);

        const chart = createChart(container, {
          layout: { 
            background: { type: ColorType.Solid, color: "#131722" }, 
            textColor: "#d1d4dc",
            fontSize: 12,
            fontFamily: 'Trebuchet MS, sans-serif',
          },
          grid: { 
            vertLines: { color: "#363c4e", style: 2, visible: true }, 
            horzLines: { color: "#363c4e", style: 2, visible: true } 
          },
          rightPriceScale: { 
            borderColor: "#485c7b",
            textColor: '#b2b5be',
            scaleMargins: { top: 0.1, bottom: 0.1 },
          },
          timeScale: { 
            borderColor: "#485c7b",
            textColor: '#b2b5be',
            timeVisible: true,
            secondsVisible: false,
            rightOffset: 12,
            barSpacing: 6,
          },
          crosshair: { 
            mode: 1,
            vertLine: { color: '#758696', width: 1, style: 3, visible: true, labelVisible: true },
            horzLine: { color: '#758696', width: 1, style: 3, visible: true, labelVisible: true },
          },
          handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: true },
          handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true, axisDoubleClickReset: true },
          kineticScroll: { touch: true, mouse: false },
          width: containerWidth,
          height: containerHeight,
        });

        console.log('Chart created successfully:', !!chart);
        console.log('Chart methods:', Object.getOwnPropertyNames(chart));
        console.log('Has addCandlestickSeries?', typeof chart.addCandlestickSeries);

        // Create candlestick series
        const series = chart.addCandlestickSeries({
          upColor: '#089981',
          downColor: '#f23645',
          borderDownColor: '#f23645',
          borderUpColor: '#089981',
          wickDownColor: '#f23645',
          wickUpColor: '#089981',
          priceFormat: { type: "price", precision: 6, minMove: 1e-6 }, // High precision for crypto
          priceLineVisible: true,
          lastValueVisible: true,
          title: token?.symbol || 'Price',
        });

        chartRef.current = chart;
        seriesRef.current = series;

        console.log('Chart and series created successfully:', {
          chart: !!chart,
          series: !!series,
          chartRef: !!chartRef.current,
          seriesRef: !!seriesRef.current
        });

        // Apply any existing data immediately after chart creation
        if (chartData.length > 0) {
          console.log('Applying existing data to newly created chart');
          const candles = normalizeCandles(chartData);
          if (candles.length > 0) {
            series.setData(candles);
            chart.timeScale().fitContent();
            console.log('Initial data applied successfully');
          }
        }

        // Responsive resize
        const ro = new ResizeObserver(() => {
          if (!containerRef.current || !chartRef.current) return;
          const container = containerRef.current;
          const newWidth = container.clientWidth || container.offsetWidth || 800;
          const newHeight = container.clientHeight || container.offsetHeight || 400;
          chartRef.current.applyOptions({
            width: newWidth,
            height: newHeight,
          });
        });
        ro.observe(containerRef.current);
        resizeObsRef.current = ro;

        console.log('Chart initialized successfully');
        
        // Trigger data application after successful initialization
        setTimeout(() => {
          if (chartData.length > 0 && seriesRef.current) {
            console.log('Triggering data application after chart init');
            const candles = normalizeCandles(chartData);
            if (candles.length > 0) {
              seriesRef.current.setData(candles);
              chartRef.current?.timeScale().fitContent();
              console.log('Post-init data applied successfully');
            }
          }
        }, 100);
        
      } catch (error) {
        console.error('Failed to initialize chart:', error);
        setError('Failed to initialize chart: ' + error.message);
      }
    };

    // Add a small delay to ensure DOM is fully rendered
    console.log('Setting timeout for init function...');
    const timeoutId = setTimeout(init, 100);

    return () => {
      console.log('Chart useEffect cleanup called');
      clearTimeout(timeoutId);
      destroyed = true;
      try { resizeObsRef.current?.disconnect(); } catch {}
      try { chartRef.current?.remove(); } catch {}
      chartRef.current = null;
      seriesRef.current = null;
      volumeSeriesRef.current = null;
      resizeObsRef.current = null;
    };
  }, []);


  // Load chart data when token or timeframe changes
  useEffect(() => {
    if (token?.contractAddress) {
      loadChartData();
    }
  }, [token?.contractAddress, timeframe]);

  // APPLY DATA (whenever data changes)
  useEffect(() => {
    console.log('Data effect triggered:', {
      seriesReady: !!seriesRef.current,
      chartReady: !!chartRef.current,
      dataLength: chartData.length
    });

    if (!seriesRef.current || !chartRef.current) {
      console.log('Chart or series not ready yet, waiting...');
      return; // not ready yet
    }
    
    const candles = normalizeCandles(chartData);
    console.log('Normalized candles:', candles.length);
    console.log('Sample normalized candle:', candles[0]);
    
    if (candles.length === 0) {
      console.log('No valid candles after normalization');
      return;
    }

    console.log('Applying', candles.length, 'normalized candles to chart via data effect');

    try {
      // Set whole dataset atomically
      seriesRef.current.setData(candles);
      console.log('Data set successfully via data effect');

      // Optional: fit content
      chartRef.current.timeScale().fitContent();
      console.log('Chart fitted to content via data effect');
    } catch (error) {
      console.error('Error setting chart data:', error);
      setError('Failed to set chart data: ' + error.message);
    }
  }, [chartData, timeframe]);



  const loadChartData = async () => {
    if (!token?.contractAddress) {
      console.log('No token contract address');
      return;
    }

    console.log('Loading chart data for:', token.contractAddress, 'timeframe:', timeframe);
    setLoading(true);
    setError(null);

    try {
      const response = await chartService.getPriceChart(token.contractAddress, timeframe, 1000);
      console.log('Chart service response:', response);
      
      if (response.success && response.data) {
        console.log('Raw chart data:', response.data);
        console.log('Raw data sample:', response.data.slice(0, 2));
        
        // Validate and format OHLCV data
        const formattedData = response.data
          .filter(item => {
            // Validate required fields
            const hasValidTime = item.time && !isNaN(item.time);
            const hasValidPrice = (item.open || item.value) && 
                                 (item.high || item.value) && 
                                 (item.low || item.value) && 
                                 (item.close || item.value);
            return hasValidTime && hasValidPrice;
          })
          .map(item => {
            const open = parseFloat(item.open || item.value);
            const high = parseFloat(item.high || item.value);
            const low = parseFloat(item.low || item.value);
            const close = parseFloat(item.close || item.value);
            
            // Ensure OHLC values are valid numbers
            if (isNaN(open) || isNaN(high) || isNaN(low) || isNaN(close)) {
              return null;
            }
            
            return {
              time: Math.floor(item.time), // Ensure time is integer seconds
              open: open,
              high: Math.max(open, high, low, close), // Ensure high is highest
              low: Math.min(open, high, low, close),  // Ensure low is lowest
              close: close,
              volume: parseFloat(item.volume || 0)
            };
          })
          .filter(item => item !== null) // Remove invalid entries
          .sort((a, b) => a.time - b.time); // Sort by time

        console.log('Formatted chart data:', formattedData);
        console.log('Data sample for chart:', formattedData.slice(0, 2));
        setChartData(formattedData);
      } else {
        console.error('Chart service failed:', response);
        throw new Error(response.message || 'Failed to load chart data');
      }
    } catch (error) {
      console.error('Failed to load chart data:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };



  if (!token) return null;

  return (
    <div className="bg-gray-900 rounded-lg border border-gray-700 p-4">


      {/* Chart Container */}
      <div className="relative">
        {loading ? (
          <div className="flex items-center justify-center h-96 bg-gray-800 rounded-lg">
            <div className="text-gray-400">Loading chart data...</div>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-96 bg-gray-800 rounded-lg">
            <div className="text-red-400 mb-4">Error: {error}</div>
            <button 
              onClick={() => {
                setError(null);
                setChartData([]);
                // Clean up chart
                try { resizeObsRef.current?.disconnect(); } catch {}
                try { chartRef.current?.remove(); } catch {}
                chartRef.current = null;
                seriesRef.current = null;
                volumeSeriesRef.current = null;
                resizeObsRef.current = null;
                // Trigger re-initialization
                setTimeout(() => {
                  if (token?.contractAddress) {
                    loadChartData();
                  }
                }, 100);
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Retry Chart
            </button>
          </div>
        ) : (
          <div
            ref={containerRef}
            className="w-full bg-gray-800 rounded-lg"
            style={{ width: "100%", height: "400px", position: "relative" }}
          />
        )}
      </div>

      {/* Indicators Panel */}
      {showIndicators && (
        <div className="mt-4 p-4 bg-gray-800 rounded-lg border border-gray-700">
          <h4 className="text-white font-medium mb-4">Technical Indicators</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* SMA */}
            <div className="flex items-center justify-between">
              <label className="flex items-center space-x-2 text-gray-300">
                <input
                  type="checkbox"
                  checked={indicators.sma.enabled}
                  onChange={(e) => setIndicators(prev => ({
                    ...prev,
                    sma: { ...prev.sma, enabled: e.target.checked }
                  }))}
                  className="rounded"
                />
                <span>SMA</span>
              </label>
              <input
                type="number"
                value={indicators.sma.period}
                onChange={(e) => setIndicators(prev => ({
                  ...prev,
                  sma: { ...prev.sma, period: parseInt(e.target.value) || 20 }
                }))}
                className="w-16 px-2 py-1 bg-gray-700 text-white rounded text-sm"
                min="1"
                max="200"
              />
            </div>

            {/* EMA */}
            <div className="flex items-center justify-between">
              <label className="flex items-center space-x-2 text-gray-300">
                <input
                  type="checkbox"
                  checked={indicators.ema.enabled}
                  onChange={(e) => setIndicators(prev => ({
                    ...prev,
                    ema: { ...prev.ema, enabled: e.target.checked }
                  }))}
                  className="rounded"
                />
                <span>EMA</span>
              </label>
              <input
                type="number"
                value={indicators.ema.period}
                onChange={(e) => setIndicators(prev => ({
                  ...prev,
                  ema: { ...prev.ema, period: parseInt(e.target.value) || 20 }
                }))}
                className="w-16 px-2 py-1 bg-gray-700 text-white rounded text-sm"
                min="1"
                max="200"
              />
            </div>

            {/* RSI */}
            <div className="flex items-center justify-between">
              <label className="flex items-center space-x-2 text-gray-300">
                <input
                  type="checkbox"
                  checked={indicators.rsi.enabled}
                  onChange={(e) => setIndicators(prev => ({
                    ...prev,
                    rsi: { ...prev.rsi, enabled: e.target.checked }
                  }))}
                  className="rounded"
                />
                <span>RSI</span>
              </label>
              <input
                type="number"
                value={indicators.rsi.period}
                onChange={(e) => setIndicators(prev => ({
                  ...prev,
                  rsi: { ...prev.rsi, period: parseInt(e.target.value) || 14 }
                }))}
                className="w-16 px-2 py-1 bg-gray-700 text-white rounded text-sm"
                min="1"
                max="200"
              />
            </div>

            {/* Bollinger Bands */}
            <div className="flex items-center justify-between">
              <label className="flex items-center space-x-2 text-gray-300">
                <input
                  type="checkbox"
                  checked={indicators.bollinger.enabled}
                  onChange={(e) => setIndicators(prev => ({
                    ...prev,
                    bollinger: { ...prev.bollinger, enabled: e.target.checked }
                  }))}
                  className="rounded"
                />
                <span>Bollinger</span>
              </label>
              <div className="flex space-x-1">
                <input
                  type="number"
                  value={indicators.bollinger.period}
                  onChange={(e) => setIndicators(prev => ({
                    ...prev,
                    bollinger: { ...prev.bollinger, period: parseInt(e.target.value) || 20 }
                  }))}
                  className="w-12 px-1 py-1 bg-gray-700 text-white rounded text-xs"
                  min="1"
                  max="200"
                  placeholder="Period"
                />
                <input
                  type="number"
                  value={indicators.bollinger.stdDev}
                  onChange={(e) => setIndicators(prev => ({
                    ...prev,
                    bollinger: { ...prev.bollinger, stdDev: parseFloat(e.target.value) || 2 }
                  }))}
                  className="w-12 px-1 py-1 bg-gray-700 text-white rounded text-xs"
                  min="0.1"
                  max="5"
                  step="0.1"
                  placeholder="Std"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Chart Controls */}
      <div className="flex items-center justify-between mt-4">
        <div className="flex items-center space-x-4">
          <button 
            onClick={() => setShowIndicators(!showIndicators)}
            className={`px-4 py-2 rounded-lg transition-colors ${
              showIndicators 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            Indicators
          </button>
          <button className="px-4 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition-colors">
            Drawing Tools
          </button>
          <button className="px-4 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition-colors">
            Settings
          </button>
        </div>

        <div className="flex items-center space-x-2">
          <button className="p-2 text-gray-400 hover:text-white transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          <button className="p-2 text-gray-400 hover:text-white transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};

export default TradingViewChart;
