import React, { useEffect, useRef, useState } from 'react';
import { createChart } from 'lightweight-charts';
import chartService from '../services/chartService';

const TradingViewChart = ({ token, timeframe = '1D', onClose }) => {
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [chartInitialized, setChartInitialized] = useState(false);
  
  // Use timeframe prop directly instead of local state
  const [indicators, setIndicators] = useState({
    sma: { enabled: false, period: 20 },
    ema: { enabled: false, period: 20 },
    rsi: { enabled: false, period: 14 },
    macd: { enabled: false, fast: 12, slow: 26, signal: 9 },
    bollinger: { enabled: false, period: 20, stdDev: 2 }
  });
  const [showIndicators, setShowIndicators] = useState(false);

  // Initialize chart
  useEffect(() => {
    const initializeChart = () => {
      if (!chartContainerRef.current) {
        console.log('Chart container ref not available, retrying...');
        setTimeout(initializeChart, 100);
        return;
      }

      // Clean up any existing chart
      if (chartRef.current) {
        try {
          chartRef.current.remove();
        } catch (error) {
          console.log('Error removing existing chart:', error);
        }
        chartRef.current = null;
      }

      try {
        const chart = createChart(chartContainerRef.current, {
          width: chartContainerRef.current.clientWidth,
          height: 400,
          layout: {
            background: { type: 'solid', color: '#131722' },
            textColor: '#d1d4dc',
            fontSize: 12,
            fontFamily: 'Trebuchet MS, sans-serif',
          },
          grid: {
            vertLines: { 
              color: '#363c4e',
              style: 2, // dotted
              visible: true,
            },
            horzLines: { 
              color: '#363c4e',
              style: 2, // dotted
              visible: true,
            },
          },
          crosshair: {
            mode: 1, // normal crosshair
            vertLine: {
              color: '#758696',
              width: 1,
              style: 3, // dashed
              visible: true,
              labelVisible: true,
            },
            horzLine: {
              color: '#758696',
              width: 1,
              style: 3, // dashed
              visible: true,
              labelVisible: true,
            },
          },
          rightPriceScale: {
            borderColor: '#485c7b',
            textColor: '#b2b5be',
            entireTextOnly: false,
            visible: true,
            borderVisible: true,
            scaleMargins: {
              top: 0.1,
              bottom: 0.1,
            },
          },
          leftPriceScale: {
            visible: false,
          },
          timeScale: {
            borderColor: '#485c7b',
            textColor: '#b2b5be',
            timeVisible: true,
            secondsVisible: false,
            borderVisible: true,
            rightOffset: 12,
            barSpacing: 6,
            fixLeftEdge: false,
            lockVisibleTimeRangeOnResize: true,
          },
          handleScroll: {
            mouseWheel: true,
            pressedMouseMove: true,
            horzTouchDrag: true,
            vertTouchDrag: true,
          },
          handleScale: {
            axisPressedMouseMove: true,
            mouseWheel: true,
            pinch: true,
            axisDoubleClickReset: true,
          },
          kineticScroll: {
            touch: true,
            mouse: false,
          },
        });

        chartRef.current = chart;
        setChartInitialized(true);
        console.log('Chart initialized successfully');

        // Add crosshair move handler for tooltip functionality
        chart.subscribeCrosshairMove(param => {
          if (param.point === undefined || !param.time || param.point.x < 0 || param.point.y < 0) {
            return;
          }

          // Get data for the current crosshair position
          const data = param.seriesData;
          if (data && data.size > 0) {
            // Find candlestick data
            for (const [series, seriesData] of data.entries()) {
              if (seriesData && typeof seriesData === 'object' && 'open' in seriesData) {
                // This is candlestick data
                const candleData = seriesData;
                const time = new Date(param.time * 1000);
                
                // You can add custom tooltip logic here
                console.log('Crosshair data:', {
                  time: time.toLocaleString(),
                  open: candleData.open,
                  high: candleData.high,
                  low: candleData.low,
                  close: candleData.close,
                });
                break;
              }
            }
          }
        });

        // Handle resize
        const handleResize = () => {
          if (chartContainerRef.current && chartRef.current) {
            chartRef.current.applyOptions({
              width: chartContainerRef.current.clientWidth,
            });
          }
        };

        window.addEventListener('resize', handleResize);

        return () => {
          window.removeEventListener('resize', handleResize);
          if (chartRef.current) {
            chartRef.current.remove();
          }
          setChartInitialized(false);
        };
      } catch (error) {
        console.error('Failed to initialize chart:', error);
        setError('Failed to initialize chart: ' + error.message);
      }
    };

    // Add a small delay to ensure DOM is ready
    const timeoutId = setTimeout(initializeChart, 100);

    return () => {
      clearTimeout(timeoutId);
      if (chartRef.current) {
        chartRef.current.remove();
      }
      setChartInitialized(false);
    };
  }, []);


  // Load chart data when token or timeframe changes
  useEffect(() => {
    if (token?.contractAddress) {
      loadChartData();
    }
  }, [token?.contractAddress, timeframe]);

  // Update chart when data changes
  useEffect(() => {
    if (chartInitialized && chartRef.current && chartData.length > 0) {
      console.log('Updating chart with data length:', chartData.length);
      // Add a small delay to ensure chart is fully ready
      setTimeout(() => {
        if (chartRef.current && chartData.length > 0) {
          updateChart();
        }
      }, 100);
    } else if (chartData.length > 0) {
      console.log('Chart not ready, data available:', chartData.length, 'initialized:', chartInitialized);
    }
  }, [chartData, indicators, chartInitialized]);



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

  // Technical indicator calculations
  const calculateSMA = (data, period) => {
    const result = [];
    for (let i = period - 1; i < data.length; i++) {
      const sum = data.slice(i - period + 1, i + 1).reduce((acc, item) => acc + item.close, 0);
      result.push({
        time: data[i].time,
        value: sum / period
      });
    }
    return result;
  };

  const calculateEMA = (data, period) => {
    const result = [];
    const multiplier = 2 / (period + 1);
    
    // First value is SMA
    const firstSMA = data.slice(0, period).reduce((acc, item) => acc + item.close, 0) / period;
    result.push({ time: data[period - 1].time, value: firstSMA });
    
    for (let i = period; i < data.length; i++) {
      const ema = (data[i].close * multiplier) + (result[result.length - 1].value * (1 - multiplier));
      result.push({ time: data[i].time, value: ema });
    }
    return result;
  };

  const calculateRSI = (data, period) => {
    const result = [];
    const gains = [];
    const losses = [];
    
    for (let i = 1; i < data.length; i++) {
      const change = data[i].close - data[i - 1].close;
      gains.push(change > 0 ? change : 0);
      losses.push(change < 0 ? Math.abs(change) : 0);
    }
    
    for (let i = period - 1; i < gains.length; i++) {
      const avgGain = gains.slice(i - period + 1, i + 1).reduce((acc, gain) => acc + gain, 0) / period;
      const avgLoss = losses.slice(i - period + 1, i + 1).reduce((acc, loss) => acc + loss, 0) / period;
      const rs = avgGain / (avgLoss || 0.0001);
      const rsi = 100 - (100 / (1 + rs));
      result.push({ time: data[i + 1].time, value: rsi });
    }
    return result;
  };

  const calculateBollingerBands = (data, period, stdDev) => {
    const sma = calculateSMA(data, period);
    const result = [];
    
    for (let i = period - 1; i < data.length; i++) {
      const slice = data.slice(i - period + 1, i + 1);
      const mean = slice.reduce((acc, item) => acc + item.close, 0) / period;
      const variance = slice.reduce((acc, item) => acc + Math.pow(item.close - mean, 2), 0) / period;
      const standardDeviation = Math.sqrt(variance);
      
      result.push({
        time: data[i].time,
        upper: mean + (standardDeviation * stdDev),
        middle: mean,
        lower: mean - (standardDeviation * stdDev)
      });
    }
    return result;
  };

  const updateChart = () => {
    if (!chartRef.current) {
      console.log('Chart update skipped - no chart ref');
      return;
    }
    
    if (chartData.length === 0) {
      console.log('Chart update skipped - no data');
      return;
    }

    try {
      console.log('Updating chart with', chartData.length, 'data points');
      console.log('Chart data sample:', chartData.slice(0, 3));
      
      // Check if chart is properly initialized
      if (typeof chartRef.current.removeAllSeries !== 'function') {
        console.error('Chart instance is corrupted, skipping update');
        setError('Chart instance corrupted - please refresh the page');
        return;
      }
      
      // Remove existing series
      chartRef.current.removeAllSeries();

      // Check if we have proper OHLCV data or just price data
      const hasOHLCV = chartData.every(item => 
        item.open !== undefined && item.high !== undefined && 
        item.low !== undefined && item.close !== undefined
      );

      if (hasOHLCV) {
        // Create candlestick series with professional TradingView styling
        const candlestickSeries = chartRef.current.addCandlestickSeries({
          upColor: '#089981', // TradingView green
          downColor: '#f23645', // TradingView red
          borderDownColor: '#f23645',
          borderUpColor: '#089981',
          wickDownColor: '#f23645',
          wickUpColor: '#089981',
          priceFormat: {
            type: 'price',
            precision: 6,
            minMove: 0.000001,
          },
          priceLineVisible: true,
          lastValueVisible: true,
          title: token?.symbol || 'Price',
        });

        // Set data with proper formatting
        const formattedCandleData = chartData.map(item => ({
          time: item.time,
          open: parseFloat(item.open),
          high: parseFloat(item.high),
          low: parseFloat(item.low),
          close: parseFloat(item.close),
        }));
        candlestickSeries.setData(formattedCandleData);
        
        // Create volume series with professional styling
        const volumeSeries = chartRef.current.addHistogramSeries({
          color: '#26a69a',
          priceFormat: {
            type: 'volume',
          },
          priceScaleId: 'volume',
          scaleMargins: {
            top: 0.7, // Volume takes bottom 30% of chart
            bottom: 0,
          },
          title: 'Volume',
          lastValueVisible: false,
          priceLineVisible: false,
        });

        // Configure volume price scale
        chartRef.current.priceScale('volume').applyOptions({
          scaleMargins: {
            top: 0.7,
            bottom: 0,
          },
        });

        // Add volume data with proper coloring
        const volumeData = chartData
          .filter(item => item.volume > 0) // Only show non-zero volume
          .map(item => ({
            time: item.time,
            value: parseFloat(item.volume),
            color: item.close >= item.open ? '#089981' : '#f23645'
          }));
        
        if (volumeData.length > 0) {
          volumeSeries.setData(volumeData);
        }
      } else {
        // Create line series for price data only
        const lineSeries = chartRef.current.addLineSeries({
          color: '#26a69a',
          lineWidth: 2,
          title: 'Price'
        });

        const lineData = chartData.map(item => ({
          time: item.time,
          value: item.close || item.value
        }));
        
        lineSeries.setData(lineData);
        console.log('Using line chart for price data');
      }

      // Add technical indicators with professional styling
      if (indicators.sma.enabled && chartData.length >= indicators.sma.period) {
        const smaData = calculateSMA(chartData, indicators.sma.period);
        const smaSeries = chartRef.current.addLineSeries({
          color: '#ff6d00', // TradingView orange
          lineWidth: 2,
          lineStyle: 0, // solid
          crosshairMarkerVisible: true,
          lastValueVisible: true,
          priceLineVisible: false,
          title: `SMA(${indicators.sma.period})`,
          priceFormat: {
            type: 'price',
            precision: 6,
            minMove: 0.000001,
          },
        });
        smaSeries.setData(smaData);
      }

      if (indicators.ema.enabled && chartData.length >= indicators.ema.period) {
        const emaData = calculateEMA(chartData, indicators.ema.period);
        const emaSeries = chartRef.current.addLineSeries({
          color: '#2962ff', // TradingView blue
          lineWidth: 2,
          lineStyle: 0, // solid
          crosshairMarkerVisible: true,
          lastValueVisible: true,
          priceLineVisible: false,
          title: `EMA(${indicators.ema.period})`,
          priceFormat: {
            type: 'price',
            precision: 6,
            minMove: 0.000001,
          },
        });
        emaSeries.setData(emaData);
      }

      if (indicators.bollinger.enabled && chartData.length >= indicators.bollinger.period) {
        const bbData = calculateBollingerBands(chartData, indicators.bollinger.period, indicators.bollinger.stdDev);
        
        // Upper band
        const upperBand = chartRef.current.addLineSeries({
          color: '#787b86', // TradingView gray
          lineWidth: 1,
          lineStyle: 2, // dotted
          crosshairMarkerVisible: false,
          lastValueVisible: false,
          priceLineVisible: false,
          title: `BB Upper(${indicators.bollinger.period}, ${indicators.bollinger.stdDev})`,
        });
        
        // Middle band (SMA)
        const middleBand = chartRef.current.addLineSeries({
          color: '#787b86',
          lineWidth: 1,
          lineStyle: 1, // dashed
          crosshairMarkerVisible: true,
          lastValueVisible: true,
          priceLineVisible: false,
          title: `BB Middle(${indicators.bollinger.period})`,
        });
        
        // Lower band
        const lowerBand = chartRef.current.addLineSeries({
          color: '#787b86',
          lineWidth: 1,
          lineStyle: 2, // dotted
          crosshairMarkerVisible: false,
          lastValueVisible: false,
          priceLineVisible: false,
          title: `BB Lower(${indicators.bollinger.period}, ${indicators.bollinger.stdDev})`,
        });
        
        upperBand.setData(bbData.map(item => ({ time: item.time, value: item.upper })));
        middleBand.setData(bbData.map(item => ({ time: item.time, value: item.middle })));
        lowerBand.setData(bbData.map(item => ({ time: item.time, value: item.lower })));
      }

      // Fit content
      chartRef.current.timeScale().fitContent();
      console.log('Chart updated successfully');
    } catch (error) {
      console.error('Failed to update chart:', error);
      setError('Failed to update chart: ' + error.message);
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
                setChartInitialized(false);
                if (chartRef.current) {
                  chartRef.current.remove();
                  chartRef.current = null;
                }
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
            ref={chartContainerRef}
            className="w-full bg-gray-800 rounded-lg"
            style={{ height: '500px', minHeight: '400px' }}
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
