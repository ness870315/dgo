import React, { useEffect, useRef, useState } from 'react';
import { createChart, ColorType } from 'lightweight-charts';
import chartService from '../services/chartService';

const TradingViewChart = ({ token, timeframe = '1MIN', onClose }) => {
  const chartContainerRef = useRef();
  const chartRef = useRef();
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

  // Chart initialization (separate effect to avoid race conditions)
  useEffect(() => {
    let ro, chart, series, mounted = true;
    
    (async () => {
      if (!chartContainerRef.current || chartRef.current) return;
      
      console.log('🎯 Chart container dimensions:', {
        clientWidth: chartContainerRef.current.clientWidth,
        clientHeight: chartContainerRef.current.clientHeight,
        offsetWidth: chartContainerRef.current.offsetWidth,
        offsetHeight: chartContainerRef.current.offsetHeight
      });
      
      // Wait for container to have proper dimensions with retry
      let retries = 0;
      while (chartContainerRef.current.clientWidth === 0 && retries < 10) {
        console.log(`⏳ Container has no width, retry ${retries + 1}/10...`);
        await new Promise(resolve => setTimeout(resolve, 100));
        retries++;
      }
      
      if (chartContainerRef.current.clientWidth === 0) {
        console.log('❌ Container still has no width after retries, using fallback dimensions');
      }
      
      // Dynamic import for better performance
      const { createChart, ColorType } = await import('lightweight-charts');

      const containerWidth = chartContainerRef.current.clientWidth || 800;
      const containerHeight = chartContainerRef.current.clientHeight || 400;
      
      console.log('📊 Creating chart with dimensions:', { containerWidth, containerHeight });

      chart = createChart(chartContainerRef.current, {
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
        crosshair: { mode: 1 }, // Normal crosshair mode
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
      
      series = chart.addCandlestickSeries({ 
        upColor: "#089981",
        downColor: "#f23645",
        borderVisible: false,
        wickUpColor: "#089981",
        wickDownColor: "#f23645",
        priceFormat: { type: 'price', precision: 9, minMove: 1e-9 },
        priceLineVisible: true,
        lastValueVisible: true,
      });
      
      chartRef.current = { chart, candlestickSeries: series };
      console.log('✅ Chart created successfully');

      // ResizeObserver for responsive charts
      ro = new ResizeObserver(() => {
        const el = chartContainerRef.current;
        if (el && chartRef.current) {
          const newWidth = el.clientWidth;
          const newHeight = el.clientHeight || 400;
          console.log('📏 Chart resizing to:', { newWidth, newHeight });
          chartRef.current.chart.applyOptions({
            width: newWidth, 
            height: newHeight
          });
        }
      });
      ro.observe(chartContainerRef.current);
    })();

    return () => {
      try { ro?.disconnect(); } catch {}
      try { chartRef.current?.chart.remove(); } catch {}
      chartRef.current = null;
    };
  }, []);

  // Apply data (separate effect to avoid race conditions)
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

    console.log('📊 Normalized candles:', {
      count: candles.length,
      firstCandle: candles[0],
      lastCandle: candles[candles.length - 1],
      priceRange: {
        min: Math.min(...candles.map(c => c.close)),
        max: Math.max(...candles.map(c => c.close))
      }
    });

    // Transform data based on display mode (improved mcap calculation)
    const transformedCandles = candles.map(candle => {
      if (displayMode === 'mcap' && token?.circulatingSupply) {
        // Use circulating supply for more accurate mcap calculation
        const supply = token.circulatingSupply;
        return {
          ...candle,
          open: candle.open * supply,
          high: candle.high * supply,
          low: candle.low * supply,
          close: candle.close * supply,
        };
      }
      return candle;
    });

    // Compute precision based on actual data (not sample price)
    const lastClose = transformedCandles.at(-1)?.close ?? 1;
    const format = displayMode === 'mcap'
      ? { type: 'price', precision: 0, minMove: 1 }
      : lastClose >= 1
        ? { type: 'price', precision: 6, minMove: 1e-6 }
        : lastClose >= 0.01
          ? { type: 'price', precision: 8, minMove: 1e-8 }
          : { type: 'price', precision: 9, minMove: 1e-9 };

    const title = `${token?.symbol || 'Token'} ${displayMode === 'mcap' ? 'Market Cap' : 'Price'}`;
    
    console.log('📊 Setting chart options:', { title, format, lastClose });
    
    ref.candlestickSeries.applyOptions({ 
      priceFormat: format, 
      title: title 
    });
    
    console.log('📊 Setting chart data...');
    ref.candlestickSeries.setData(transformedCandles);
    ref.chart.timeScale().fitContent();
    
    console.log(`✅ Data applied successfully: ${transformedCandles.length} candles with precision ${format.precision}`);
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
        ref={chartContainerRef}
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