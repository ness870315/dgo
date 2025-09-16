import React, { useState, useEffect, useRef } from 'react';
import { X, ChevronDown, Maximize2, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, BarChart3, TrendingUp } from 'lucide-react';
import chartService from '../services/chartService';
import TradingViewChart from './TradingViewChart';

const PriceChartModal = ({ token, onClose }) => {
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [timeframe, setTimeframe] = useState('1D');
  const [timeframes, setTimeframes] = useState([]);
  const [currentPrice, setCurrentPrice] = useState(null);
  const [priceChange, setPriceChange] = useState(0);
  const [showTimeframeDropdown, setShowTimeframeDropdown] = useState(false);
  const [isLogScale, setIsLogScale] = useState(false);
  const [hoveredPoint, setHoveredPoint] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [chartType, setChartType] = useState('tradingview'); // 'tradingview' or 'custom'
  
  const svgRef = useRef(null);
  const chartContainerRef = useRef(null);
  const [chartDimensions, setChartDimensions] = useState({ width: 800, height: 400 });

  // Chart configuration
  const margin = { top: 20, right: 40, bottom: 60, left: 80 };
  const chartWidth = chartDimensions.width - margin.left - margin.right;
  const chartHeight = chartDimensions.height - margin.top - margin.bottom;

  useEffect(() => {
    if (token?.contractAddress) {
      loadTimeframes();
      loadChartData();
      loadCurrentPrice();
    }
  }, [token?.contractAddress]);

  useEffect(() => {
    if (token?.contractAddress) {
      loadChartData();
    }
  }, [timeframe]);

  useEffect(() => {
    const handleResize = () => {
      if (chartContainerRef.current) {
        const containerWidth = chartContainerRef.current.offsetWidth;
        const containerHeight = Math.min(400, window.innerHeight * 0.6);
        setChartDimensions({ 
          width: Math.max(400, containerWidth - 40), 
          height: containerHeight 
        });
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const loadTimeframes = async () => {
    try {
      const response = await chartService.getTimeframes();
      if (response.success) {
        setTimeframes(response.timeframes);
      }
    } catch (error) {
      console.error('Failed to load timeframes:', error);
    }
  };

  const loadCurrentPrice = async () => {
    try {
      const response = await chartService.getCurrentPrice(token.contractAddress);
      if (response.success) {
        setCurrentPrice(response.price);
      }
    } catch (error) {
      console.error('Failed to load current price:', error);
    }
  };

  const loadChartData = async () => {
    if (!token?.contractAddress) return;

    setLoading(true);
    setError(null);

    try {
      const response = await chartService.getPriceChart(token.contractAddress, timeframe, 1000);
      
      if (response.success && response.data) {
        setChartData(response.data);
        
        // Calculate price change
        if (response.data.length >= 2) {
          const firstPrice = response.data[0].value;
          const lastPrice = response.data[response.data.length - 1].value;
          const change = ((lastPrice - firstPrice) / firstPrice) * 100;
          setPriceChange(change);
        }
      } else {
        throw new Error(response.message || 'Failed to load chart data');
      }
    } catch (error) {
      console.error('Failed to load chart data:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const formatPrice = (price) => {
    if (price === null || price === undefined) return 'N/A';
    if (price < 0.01) return `$${price.toFixed(6)}`;
    if (price < 1) return `$${price.toFixed(4)}`;
    if (price < 100) return `$${price.toFixed(2)}`;
    return `$${price.toFixed(2)}`;
  };

  const formatNumber = (num) => {
    if (num >= 1e9) return `${(num / 1e9).toFixed(1)}B`;
    if (num >= 1e6) return `${(num / 1e6).toFixed(1)}M`;
    if (num >= 1e3) return `${(num / 1e3).toFixed(1)}K`;
    return num.toString();
  };

  const formatDate = (timestamp) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: 'numeric'
    });
  };

  const formatTime = (timestamp) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit'
    });
  };

  // Calculate chart scales
  const getScales = () => {
    if (chartData.length === 0) return { xScale: null, yScale: null };

    const prices = chartData.map(d => d.value);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceRange = maxPrice - minPrice;
    const padding = priceRange * 0.1; // 10% padding

    const yMin = Math.max(0, minPrice - padding);
    const yMax = maxPrice + padding;

    const xScale = (x) => margin.left + (x / (chartData.length - 1)) * chartWidth;
    const yScale = (y) => {
      const logY = isLogScale ? Math.log10(y) : y;
      const logYMin = isLogScale ? Math.log10(yMin) : yMin;
      const logYMax = isLogScale ? Math.log10(yMax) : yMax;
      return margin.top + ((logYMax - logY) / (logYMax - logYMin)) * chartHeight;
    };

    return { xScale, yScale, yMin, yMax };
  };

  const { xScale, yScale, yMin, yMax } = getScales();

  // Generate chart path
  const generatePath = () => {
    if (!xScale || !yScale || chartData.length === 0) return '';

    const points = chartData.map((point, index) => {
      const x = xScale(index);
      const y = yScale(point.value);
      return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
    }).join(' ');

    return points;
  };

  // Generate area path
  const generateAreaPath = () => {
    if (!xScale || !yScale || chartData.length === 0) return '';

    const points = chartData.map((point, index) => {
      const x = xScale(index);
      const y = yScale(point.value);
      return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
    }).join(' ');

    const lastX = xScale(chartData.length - 1);
    const bottomY = margin.top + chartHeight;

    return `${points} L ${lastX} ${bottomY} L ${margin.left} ${bottomY} Z`;
  };

  // Handle mouse move for tooltip
  const handleMouseMove = (event) => {
    if (!xScale || !yScale || chartData.length === 0) return;

    const rect = svgRef.current.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    // Find closest data point
    const dataIndex = Math.round(((x - margin.left) / chartWidth) * (chartData.length - 1));
    const clampedIndex = Math.max(0, Math.min(dataIndex, chartData.length - 1));
    const point = chartData[clampedIndex];

    if (point) {
      setHoveredPoint({
        x: xScale(clampedIndex),
        y: yScale(point.value),
        data: point,
        index: clampedIndex
      });
      setSelectedDate(point.time);
    }
  };

  const handleMouseLeave = () => {
    setHoveredPoint(null);
    setSelectedDate(null);
  };

  // Generate Y-axis labels
  const generateYAxisLabels = () => {
    if (!yScale || chartData.length === 0) return [];

    const numLabels = 5;
    const labels = [];
    
    for (let i = 0; i <= numLabels; i++) {
      const value = yMin + (yMax - yMin) * (i / numLabels);
      const y = yScale(value);
      labels.push({
        value: isLogScale ? Math.pow(10, value) : value,
        y: y
      });
    }

    return labels;
  };

  // Generate X-axis labels
  const generateXAxisLabels = () => {
    if (!xScale || chartData.length === 0) return [];

    const numLabels = 8;
    const labels = [];
    
    for (let i = 0; i <= numLabels; i++) {
      const index = Math.round((i / numLabels) * (chartData.length - 1));
      const point = chartData[index];
      if (point) {
        labels.push({
          label: formatDate(point.time),
          x: xScale(index)
        });
      }
    }

    return labels;
  };

  if (!token) return null;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <div className="flex items-center space-x-4">
            {/* Token Icon */}
            <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center">
              {token.jupiterData?.icon ? (
                <img 
                  src={token.jupiterData.icon} 
                  alt={token.symbol}
                  className="w-8 h-8 rounded-full"
                />
              ) : (
                <span className="text-white font-bold text-lg">
                  {token.symbol?.charAt(0) || '?'}
                </span>
              )}
            </div>
            
            <div>
              <h2 className="text-2xl font-bold text-white">{token.symbol}</h2>
              <p className="text-gray-400">{token.name}</p>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center space-x-4">
            {/* Timeframe Dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowTimeframeDropdown(!showTimeframeDropdown)}
                className="flex items-center space-x-2 px-4 py-2 bg-gray-800 rounded-lg border border-gray-600 hover:bg-gray-700 transition-colors"
              >
                <span className="text-white">{timeframe}</span>
                <ChevronDown size={16} className="text-gray-400" />
              </button>

              {showTimeframeDropdown && (
                <div className="absolute top-full left-0 mt-2 bg-gray-800 rounded-lg border border-gray-600 shadow-xl z-10 min-w-[120px]">
                  {timeframes.map((tf) => (
                    <button
                      key={tf.value}
                      onClick={() => {
                        setTimeframe(tf.value);
                        setShowTimeframeDropdown(false);
                      }}
                      className={`w-full text-left px-4 py-2 hover:bg-gray-700 transition-colors first:rounded-t-lg last:rounded-b-lg ${
                        timeframe === tf.value ? 'bg-blue-600 text-white' : 'text-gray-300'
                      }`}
                    >
                      {tf.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Chart Type Toggle */}
            <div className="flex bg-gray-800 rounded-lg p-1">
              <button
                onClick={() => setChartType('tradingview')}
                className={`flex items-center space-x-2 px-3 py-2 rounded-md transition-colors ${
                  chartType === 'tradingview'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-300 hover:bg-gray-700'
                }`}
              >
                <TrendingUp size={16} />
                <span>TradingView</span>
              </button>
              <button
                onClick={() => setChartType('custom')}
                className={`flex items-center space-x-2 px-3 py-2 rounded-md transition-colors ${
                  chartType === 'custom'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-300 hover:bg-gray-700'
                }`}
              >
                <BarChart3 size={16} />
                <span>Custom</span>
              </button>
            </div>

            {/* Log Scale Toggle (only for custom chart) */}
            {chartType === 'custom' && (
              <button
                onClick={() => setIsLogScale(!isLogScale)}
                className={`px-4 py-2 rounded-lg border transition-colors ${
                  isLogScale 
                    ? 'bg-blue-600 border-blue-500 text-white' 
                    : 'bg-gray-800 border-gray-600 text-gray-300 hover:bg-gray-700'
                }`}
              >
                LOG
              </button>
            )}

            {/* Close Button */}
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-white transition-colors"
            >
              <X size={24} />
            </button>
          </div>
        </div>

        {/* Price Info */}
        <div className="px-6 py-4 border-b border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-6">
              <div>
                <div className="text-3xl font-bold text-white">
                  {currentPrice ? formatPrice(currentPrice) : 'Loading...'}
                </div>
                <div className={`text-sm font-medium ${
                  priceChange >= 0 ? 'text-green-400' : 'text-red-400'
                }`}>
                  {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)}%
                </div>
              </div>
              
              <div className="text-sm text-gray-400">
                <div>Market Cap: {formatNumber(token.jupiterData?.mcap || token.marketCap || 0)}</div>
                <div>Volume: {formatNumber(token.jupiterData?.volume24h || 0)}</div>
              </div>
            </div>

            {/* Navigation Controls */}
            <div className="flex items-center space-x-2">
              <button className="p-2 text-gray-400 hover:text-white transition-colors">
                <ChevronsLeft size={16} />
              </button>
              <button className="p-2 text-gray-400 hover:text-white transition-colors">
                <ChevronLeft size={16} />
              </button>
              <button className="p-2 text-gray-400 hover:text-white transition-colors">
                <ChevronRight size={16} />
              </button>
              <button className="p-2 text-gray-400 hover:text-white transition-colors">
                <ChevronsRight size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* Chart Container */}
        <div className="p-6">
          {chartType === 'tradingview' ? (
            <TradingViewChart 
              token={token} 
              timeframe={timeframe}
              onClose={onClose}
            />
          ) : (
            <div 
              ref={chartContainerRef}
              className="relative bg-gray-800 rounded-lg border border-gray-700"
              style={{ height: chartDimensions.height }}
            >
              {loading ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-gray-400">Loading chart data...</div>
                </div>
              ) : error ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-red-400">Error: {error}</div>
                </div>
              ) : chartData.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-gray-400">No chart data available</div>
                </div>
              ) : (
                <svg
                  ref={svgRef}
                  width={chartDimensions.width}
                  height={chartDimensions.height}
                  className="w-full h-full"
                  onMouseMove={handleMouseMove}
                  onMouseLeave={handleMouseLeave}
                >
                  {/* Grid Lines */}
                  <defs>
                    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                      <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#374151" strokeWidth="1"/>
                    </pattern>
                  </defs>
                  <rect width="100%" height="100%" fill="url(#grid)" opacity="0.3"/>

                  {/* Y-axis labels */}
                  {generateYAxisLabels().map((label, index) => (
                    <g key={index}>
                      <line
                        x1={margin.left}
                        y1={label.y}
                        x2={chartDimensions.width - margin.right}
                        y2={label.y}
                        stroke="#374151"
                        strokeWidth="1"
                      />
                      <text
                        x={margin.left - 10}
                        y={label.y + 4}
                        textAnchor="end"
                        className="text-xs fill-gray-400"
                      >
                        {formatPrice(label.value)}
                      </text>
                    </g>
                  ))}

                  {/* X-axis labels */}
                  {generateXAxisLabels().map((label, index) => (
                    <text
                      key={index}
                      x={label.x}
                      y={chartDimensions.height - margin.bottom + 20}
                      textAnchor="middle"
                      className="text-xs fill-gray-400"
                    >
                      {label.label}
                    </text>
                  ))}

                  {/* Area Chart */}
                  <path
                    d={generateAreaPath()}
                    fill="url(#areaGradient)"
                    opacity="0.3"
                  />

                  {/* Line Chart */}
                  <path
                    d={generatePath()}
                    fill="none"
                    stroke="#e91e63"
                    strokeWidth="2"
                  />

                  {/* Hovered Point */}
                  {hoveredPoint && (
                    <g>
                      <line
                        x1={hoveredPoint.x}
                        y1={margin.top}
                        x2={hoveredPoint.x}
                        y2={margin.top + chartHeight}
                        stroke="#ffffff"
                        strokeWidth="1"
                        strokeDasharray="4,4"
                      />
                      <circle
                        cx={hoveredPoint.x}
                        cy={hoveredPoint.y}
                        r="4"
                        fill="#e91e63"
                        stroke="#ffffff"
                        strokeWidth="2"
                      />
                    </g>
                  )}

                  {/* Gradients */}
                  <defs>
                    <linearGradient id="areaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#e91e63" stopOpacity="0.6"/>
                      <stop offset="100%" stopColor="#e91e63" stopOpacity="0"/>
                    </linearGradient>
                  </defs>
                </svg>
              )}

              {/* Tooltip */}
              {hoveredPoint && (
                <div
                  className="absolute bg-gray-800 border border-gray-600 rounded-lg p-3 shadow-xl pointer-events-none"
                  style={{
                    left: Math.min(hoveredPoint.x + 10, chartDimensions.width - 200),
                    top: Math.max(10, hoveredPoint.y - 60)
                  }}
                >
                  <div className="text-sm text-white font-medium">
                    {formatPrice(hoveredPoint.data.value)}
                  </div>
                  <div className="text-xs text-gray-400">
                    {formatDate(hoveredPoint.data.time)} • {formatTime(hoveredPoint.data.time)}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PriceChartModal;
