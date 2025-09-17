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

  // Helper: normalize candles data
  const normalizeCandles = (rows) => {
    if (!Array.isArray(rows)) return [];
    const toSec = (t) => (t > 1e12 ? Math.floor(t / 1000) : t); // ms -> s
    const out = rows.map((d) => ({
      time: toSec(d.time ?? d.t),
      open: +d.open ?? +d.o ?? +d.value,
      high: +d.high ?? +d.h ?? +d.value,
      low: +d.low ?? +d.l ?? +d.value,
      close: +d.close ?? +d.c ?? +d.value,
      volume: +d.volume ?? 0,
    })).filter(c => Number.isFinite(c.time) && Number.isFinite(c.close));
    out.sort((a, b) => a.time - b.time); // Always ascending
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

  // Chart creation and data application - following the clean structure
  useEffect(() => {
    console.log('Chart useEffect triggered - data length:', chartData.length);
    
    if (!chartContainerRef.current) {
      console.log('Container not ready yet');
      return;
    }

    if (!chartRef.current) {
      console.log('Creating new chart...');
      
      // Create chart with professional dark theme
      const chart = createChart(chartContainerRef.current, {
        width: chartContainerRef.current.offsetWidth || 800,
        height: 400,
        layout: {
          background: { type: ColorType.Solid, color: "#000000" }, // Pure black background
          textColor: "#ffffff",       // White text
          fontSize: 12,
          fontFamily: 'Trebuchet MS, sans-serif',
        },
        grid: {
          vertLines: { 
            color: "#1e1e1e",         // Dark grid lines
            style: 2,
            visible: true 
          },
          horzLines: { 
            color: "#1e1e1e",         // Dark grid lines
            style: 2,
            visible: true 
          },
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
        crosshair: {
          mode: 0, // Normal crosshair mode (user controlled)
          vertLine: { 
            color: '#758696', 
            width: 1, 
            style: 2, // Dashed line
            visible: true, 
            labelVisible: true 
          },
          horzLine: { 
            color: '#758696', 
            width: 1, 
            style: 2, // Dashed line
            visible: true, 
            labelVisible: true 
          },
        },
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
      });

      // Memecoin precision - all tokens are memecoins, use maximum precision
      const samplePrice = chartData[0]?.close || token?.price || 1;
      let precision = 9;      // Maximum precision for memecoins
      let minMove = 1e-9;     // Maximum precision for tiny price movements
      
      // Adjust precision based on price range for better display
      if (samplePrice >= 1) {
        precision = 6;
        minMove = 0.000001;
      } else if (samplePrice >= 0.01) {
        precision = 8;
        minMove = 1e-8;
      }
      // else: keep maximum precision (9) for very small prices

      const candlestickSeries = chart.addCandlestickSeries({
        upColor: "#089981",
        downColor: "#f23645",
        borderVisible: false,
        wickUpColor: "#089981",
        wickDownColor: "#f23645",
        priceFormat: {
          type: 'price',
          precision: precision,
          minMove: minMove,
        },
        title: token?.symbol || 'Price',
        priceLineVisible: true,
        lastValueVisible: true,
      });

      chartRef.current = { chart, candlestickSeries };
      console.log('Chart created successfully');
    }

    // Apply data if available
    if (chartData.length > 0) {
      console.log('Applying data to chart...');
      const candles = normalizeCandles(chartData);
      
      if (candles.length > 0) {
        // Transform data based on display mode
        const transformedCandles = candles.map(candle => {
          if (displayMode === 'mcap' && token?.marketCap) {
            // Calculate market cap based on price ratio
            const priceRatio = candle.close / candles[candles.length - 1].close;
            const baseMcap = token.marketCap;
            
            return {
              ...candle,
              open: (candle.open / candles[candles.length - 1].close) * baseMcap,
              high: (candle.high / candles[candles.length - 1].close) * baseMcap,
              low: (candle.low / candles[candles.length - 1].close) * baseMcap,
              close: (candle.close / candles[candles.length - 1].close) * baseMcap,
            };
          }
          return candle;
        });
        
        // Update series title and price format based on display mode
        const title = displayMode === 'mcap' ? `${token?.symbol || 'Token'} Market Cap` : `${token?.symbol || 'Token'} Price`;
        const priceFormat = displayMode === 'mcap' 
          ? { type: 'price', precision: 0, minMove: 1 }
          : { type: 'price', precision: 6, minMove: 0.000001 };
        
        chartRef.current.candlestickSeries.applyOptions({
          title: title,
          priceFormat: priceFormat
        });
        
        // Check for flat data and data quality
        const flatCandles = transformedCandles.filter(c => c.open === c.high && c.high === c.low && c.low === c.close);
        const validCandles = transformedCandles.filter(c => c.open > 0 && c.high > 0 && c.low > 0 && c.close > 0);
        console.log(`Data analysis: ${transformedCandles.length} total, ${flatCandles.length} flat (${((flatCandles.length/transformedCandles.length)*100).toFixed(1)}%), ${validCandles.length} valid`);
        
        if (flatCandles.length > transformedCandles.length * 0.8) {
          console.warn('⚠️ Most candles are flat (no price movement) - chart may appear empty');
        }
        
        if (validCandles.length < transformedCandles.length * 0.5) {
          console.warn('⚠️ More than 50% of data points are invalid - chart may appear incomplete');
        }
        
        // Use valid candles only
        const finalCandles = validCandles.length > 0 ? validCandles : transformedCandles;
        
        chartRef.current.candlestickSeries.setData(finalCandles);
        chartRef.current.chart.timeScale().fitContent();
        console.log(`Data applied successfully: ${finalCandles.length} candles`);
      }
    }

    return () => {
      if (chartRef.current) {
        console.log('Cleaning up chart');
        chartRef.current.chart.remove();
        chartRef.current = null;
      }
    };
  }, [chartData, timeframe, displayMode]);

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
        style={{ width: "100%", height: "400px", position: "relative" }}
      />
    </div>
  );
};

export default TradingViewChart;