import React, { useEffect, useRef, useState } from 'react';
import chartService from '../services/chartService';

const TradingViewChart = ({ token, timeframe = '1D', onClose }) => {
  const svgRef = useRef(null);
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hoveredPoint, setHoveredPoint] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [chartDimensions, setChartDimensions] = useState({ width: 800, height: 400 });
  
  // Use timeframe prop directly instead of local state
  const [indicators, setIndicators] = useState({
    sma: { enabled: false, period: 20 },
    ema: { enabled: false, period: 20 },
    rsi: { enabled: false, period: 14 },
    macd: { enabled: false, fast: 12, slow: 26, signal: 9 },
    bollinger: { enabled: false, period: 20, stdDev: 2 }
  });
  const [showIndicators, setShowIndicators] = useState(false);

  // Handle resize
  useEffect(() => {
    const handleResize = () => {
      if (svgRef.current) {
        const container = svgRef.current.parentElement;
        if (container) {
          setChartDimensions({
            width: container.clientWidth,
            height: 400
          });
        }
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize(); // Initial size

    return () => {
      window.removeEventListener('resize', handleResize);
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
    if (chartData.length > 0) {
      console.log('Updating chart with data length:', chartData.length);
      renderChart();
    }
  }, [chartData, indicators, chartDimensions]);



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

  const getTimeScale = (data, width) => {
    if (data.length === 0) return { min: 0, max: 0, scale: () => 0 };
    
    const times = data.map(d => d.time);
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    
    return {
      min: minTime,
      max: maxTime,
      scale: (time) => ((time - minTime) / (maxTime - minTime)) * width
    };
  };

  const getPriceScale = (data, height) => {
    if (data.length === 0) return { min: 0, max: 0, scale: () => 0 };
    
    const prices = data.flatMap(d => [d.open, d.high, d.low, d.close].filter(p => p !== undefined));
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const padding = (maxPrice - minPrice) * 0.1; // 10% padding
    
    return {
      min: minPrice - padding,
      max: maxPrice + padding,
      scale: (price) => height - ((price - (minPrice - padding)) / ((maxPrice + padding) - (minPrice - padding))) * height
    };
  };

  const generateChartSVG = (data, timeScale, priceScale, padding, width, height) => {
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    // Sample data for better performance (show every nth point based on data density)
    const maxCandles = Math.min(200, data.length);
    const step = Math.max(1, Math.floor(data.length / maxCandles));
    const sampledData = data.filter((_, index) => index % step === 0);

    // Generate candlestick paths with improved rendering
    const candlesticks = sampledData.map((d, index) => {
      const x = padding.left + timeScale.scale(d.time);
      const openY = padding.top + priceScale.scale(d.open);
      const highY = padding.top + priceScale.scale(d.high);
      const lowY = padding.top + priceScale.scale(d.low);
      const closeY = padding.top + priceScale.scale(d.close);
      
      const isUp = d.close >= d.open;
      const color = isUp ? '#26a69a' : '#ef5350';
      const bodyHeight = Math.max(1, Math.abs(closeY - openY)); // Minimum 1px height
      
      return `
        <g class="candlestick" data-index="${index}">
          <!-- Wick (high-low line) -->
          <line x1="${x}" y1="${highY}" x2="${x}" y2="${lowY}" 
                stroke="${color}" stroke-width="1" opacity="0.8"/>
          <!-- Body (open-close rectangle) -->
          <rect x="${x - 2}" y="${Math.min(openY, closeY)}" 
                width="4" height="${bodyHeight}" 
                fill="${color}" opacity="0.9"/>
        </g>
      `;
    }).join('');

    // Generate horizontal grid lines (price levels)
    const priceLevels = 5;
    const gridLines = Array.from({ length: priceLevels }, (_, i) => {
      const y = padding.top + (chartHeight / (priceLevels - 1)) * i;
      const price = priceScale.min + (priceScale.max - priceScale.min) * (1 - i / (priceLevels - 1));
      return `
        <g>
          <line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" 
                stroke="#2B2B43" stroke-width="1" opacity="0.3"/>
          <text x="${padding.left - 10}" y="${y + 4}" fill="#666" font-size="12" text-anchor="end">
            ${price.toFixed(6)}
          </text>
        </g>
      `;
    }).join('');

    // Generate vertical grid lines (time levels)
    const timeLevels = 6;
    const timeGridLines = Array.from({ length: timeLevels }, (_, i) => {
      const x = padding.left + (chartWidth / (timeLevels - 1)) * i;
      const time = timeScale.min + (timeScale.max - timeScale.min) * (i / (timeLevels - 1));
      const date = new Date(time * 1000);
      return `
        <g>
          <line x1="${x}" y1="${padding.top}" x2="${x}" y2="${height - padding.bottom}" 
                stroke="#2B2B43" stroke-width="1" opacity="0.3"/>
          <text x="${x}" y="${height - padding.bottom + 20}" fill="#666" font-size="12" text-anchor="middle">
            ${date.toLocaleTimeString()}
          </text>
        </g>
      `;
    }).join('');

    return `
      <defs>
        <linearGradient id="upGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" style="stop-color:#26a69a;stop-opacity:1" />
          <stop offset="100%" style="stop-color:#1e7d6b;stop-opacity:0.8" />
        </linearGradient>
        <linearGradient id="downGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" style="stop-color:#ef5350;stop-opacity:1" />
          <stop offset="100%" style="stop-color:#c62828;stop-opacity:0.8" />
        </linearGradient>
      </defs>
      <!-- Background -->
      <rect width="${width}" height="${height}" fill="#1a1a1a"/>
      <!-- Grid lines -->
      ${gridLines}
      ${timeGridLines}
      <!-- Candlesticks -->
      <g class="candlesticks">
        ${candlesticks}
      </g>
    `;
  };

  const renderChart = () => {
    if (!svgRef.current || chartData.length === 0) {
      return;
    }

    try {
      console.log('Rendering custom chart with', chartData.length, 'data points');
      
      const { width, height } = chartDimensions;
      const padding = { top: 20, right: 60, bottom: 40, left: 60 };
      const chartWidth = width - padding.left - padding.right;
      const chartHeight = height - padding.top - padding.bottom;

      // Calculate scales
      const timeScale = getTimeScale(chartData, chartWidth);
      const priceScale = getPriceScale(chartData, chartHeight);

      // Generate SVG content
      const svgContent = generateChartSVG(chartData, timeScale, priceScale, padding, width, height);
      
      // Update SVG
      svgRef.current.innerHTML = svgContent;
      
      console.log('Chart rendered successfully');
    } catch (error) {
      console.error('Failed to render chart:', error);
      setError('Failed to render chart: ' + error.message);
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
          <div className="w-full bg-gray-800 rounded-lg" style={{ height: '500px', minHeight: '400px' }}>
            <svg
              ref={svgRef}
              width="100%"
              height="100%"
              viewBox={`0 0 ${chartDimensions.width} ${chartDimensions.height}`}
              className="w-full h-full"
              style={{ background: '#1a1a1a' }}
            />
          </div>
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
