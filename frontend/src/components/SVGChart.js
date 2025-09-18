import React, { useState, useEffect, useRef } from 'react';
import chartService from '../services/chartService';

const SVGChart = ({ token, onClose }) => {
  console.log('📊 SVGChart rendered with token:', token);
  
  const [timeframe, setTimeframe] = useState('1D');
  const [displayMode, setDisplayMode] = useState('price');
  const [chartData, setChartData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [hoveredPoint, setHoveredPoint] = useState(null);
  const svgRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 400 });

  // Timeframe options
  const timeframes = [
    { id: '1MIN', label: '1m' },
    { id: '5MIN', label: '5m' },
    { id: '15MIN', label: '15m' },
    { id: '1H', label: '1h' },
    { id: '4H', label: '4h' },
    { id: '1D', label: '1D' },
    { id: '1W', label: '1W' },
    { id: '1M', label: '1M' }
  ];

  // Load chart data
  useEffect(() => {
    console.log('🔍 SVGChart useEffect triggered with token:', token);
    console.log('🔍 Current timeframe state:', timeframe);
    console.log('🔍 Contract address check:', {
      contractAddress: token?.contractAddress,
      contract: token?.contract,
      hasContractAddress: !!token?.contractAddress,
      hasContract: !!token?.contract
    });
    
    if (!token?.contractAddress && !token?.contract) {
      console.log('❌ No contract address found in token:', token);
      return;
    }
    
    const loadData = async () => {
      setLoading(true);
      try {
        const contract = token.contractAddress || token.contract || token.mint || token.address;
        console.log('Loading chart data for contract:', contract, 'timeframe:', timeframe);
        const response = await chartService.getPriceChartRD(contract, timeframe);
        console.log('Chart data response:', response);
        console.log('Response success:', response?.success);
        console.log('Response data length:', response?.data?.length);
        setChartData(response);
      } catch (error) {
        console.error('Failed to load chart data:', error);
        setChartData(null);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [token, timeframe]);

  // Handle resize
  useEffect(() => {
    const handleResize = () => {
      if (svgRef.current) {
        const rect = svgRef.current.getBoundingClientRect();
        setDimensions({ width: rect.width, height: rect.height });
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Process data for SVG rendering
  const processData = () => {
    if (!chartData?.data?.length) {
      console.log('No chart data available:', chartData);
      return { points: [], min: 0, max: 0, timeRange: 0 };
    }

    const candles = chartData.data.map(d => ({
      time: Math.floor(d.time),
      open: Number(d.open),
      high: Number(d.high),
      low: Number(d.low),
      close: Number(d.close),
      volume: Number(d.volume) || 0
    }));

    // Apply market cap transform if needed
    if (displayMode === 'mcap' && token?.circulatingSupply) {
      candles.forEach(candle => {
        candle.close = candle.close * token.circulatingSupply;
        candle.open = candle.open * token.circulatingSupply;
        candle.high = candle.high * token.circulatingSupply;
        candle.low = candle.low * token.circulatingSupply;
      });
    }

    const prices = candles.map(c => c.close);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const timeRange = candles[candles.length - 1]?.time - candles[0]?.time || 1;

    // Convert to SVG coordinates
    const points = candles.map((candle, index) => {
      const x = (index / (candles.length - 1)) * (dimensions.width - 100) + 50;
      const y = dimensions.height - 50 - ((candle.close - min) / (max - min)) * (dimensions.height - 100);
      return {
        x,
        y,
        time: candle.time,
        price: candle.close,
        volume: candle.volume
      };
    });

    return { points, min, max, timeRange };
  };

  // Create SVG path for the line
  const createPath = (points) => {
    if (points.length < 2) return '';
    
    const firstPoint = points[0];
    const lastPoint = points[points.length - 1];
    const bottomY = dimensions.height - 50; // Bottom padding
    
    let path = `M ${firstPoint.x} ${bottomY}`;
    path += ` L ${firstPoint.x} ${firstPoint.y}`;
    
    for (let i = 1; i < points.length; i++) {
      path += ` L ${points[i].x} ${points[i].y}`;
    }
    
    path += ` L ${lastPoint.x} ${bottomY}`;
    path += ` Z`;
    
    return path;
  };

  // Format price for display
  const formatPrice = (price) => {
    if (!price || typeof price !== 'number' || isNaN(price)) {
      return '$0.00';
    }
    
    if (displayMode === 'mcap') {
      if (price >= 1e9) return `$${(price / 1e9).toFixed(1)}B`;
      if (price >= 1e6) return `$${(price / 1e6).toFixed(1)}M`;
      if (price >= 1e3) return `$${(price / 1e3).toFixed(1)}K`;
      return `$${price.toFixed(0)}`;
    } else {
      if (price < 0.01) return `$${price.toFixed(6)}`;
      if (price < 1) return `$${price.toFixed(4)}`;
      if (price < 100) return `$${price.toFixed(2)}`;
      return `$${price.toFixed(2)}`;
    }
  };

  // Format time for display
  const formatTime = (timestamp) => {
    const date = new Date(timestamp * 1000);
    if (timeframe === '1MIN' || timeframe === '5MIN' || timeframe === '15MIN') {
      return date.toLocaleTimeString();
    } else if (timeframe === '1H' || timeframe === '4H') {
      return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
    } else {
      return date.toLocaleDateString();
    }
  };

  // Handle mouse move for tooltip
  const handleMouseMove = (event) => {
    if (!chartData?.data?.length) return;
    
    const rect = svgRef.current.getBoundingClientRect();
    const x = event.clientX - rect.left;
    
    const { points } = processData();
    const closestPoint = points.reduce((closest, point) => {
      const distance = Math.abs(point.x - x);
      const closestDistance = Math.abs(closest.x - x);
      return distance < closestDistance ? point : closest;
    });
    
    setHoveredPoint(closestPoint);
  };

  const { points, min, max } = processData();
  const path = createPath(points);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96 bg-gray-900 rounded-lg">
        <div className="text-white">Loading chart data...</div>
      </div>
    );
  }

  if (!chartData?.data?.length) {
    return (
      <div className="flex items-center justify-center h-96 bg-gray-900 rounded-lg">
        <div className="text-white text-center">
          <div className="text-lg mb-2">No chart data available</div>
          <div className="text-sm text-gray-400">
            {token?.symbol || 'Token'} - {timeframe}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 rounded-lg p-4">
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center space-x-4">
          <h3 className="text-white text-lg font-semibold">
            {token?.symbol || 'Token'} {displayMode === 'mcap' ? 'Market Cap' : 'Price'}
          </h3>
          <div className="text-white text-sm">
            {formatPrice(points[points.length - 1]?.price)}
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            ✕
          </button>
        )}
      </div>

      {/* Controls */}
      <div className="flex justify-between items-center mb-4">
        <div className="flex space-x-2">
          {timeframes.map(tf => (
            <button
              key={tf.id}
              onClick={() => setTimeframe(tf.id)}
              className={`px-3 py-1 rounded text-sm transition-colors ${
                timeframe === tf.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {tf.label}
            </button>
          ))}
        </div>
        
        <div className="flex space-x-2">
          <button
            onClick={() => setDisplayMode('price')}
            className={`px-3 py-1 rounded text-sm transition-colors ${
              displayMode === 'price'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            Price
          </button>
          <button
            onClick={() => setDisplayMode('mcap')}
            className={`px-3 py-1 rounded text-sm transition-colors ${
              displayMode === 'mcap'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            Market Cap
          </button>
        </div>
      </div>

      {/* Chart */}
      <div className="relative">
        <svg
          ref={svgRef}
          width="100%"
          height={400}
          className="bg-gray-800 rounded"
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoveredPoint(null)}
        >
          {/* Grid lines */}
          <defs>
            <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
              <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#374151" strokeWidth="1"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
          
          {/* Price line */}
          <path
            d={path}
            fill="none"
            stroke="#ec4899"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          
          {/* Hovered point */}
          {hoveredPoint && (
            <>
              <circle
                cx={hoveredPoint.x}
                cy={hoveredPoint.y}
                r="6"
                fill="#ec4899"
                stroke="#fff"
                strokeWidth="2"
              />
              <line
                x1={hoveredPoint.x}
                y1="0"
                x2={hoveredPoint.x}
                y2={dimensions.height}
                stroke="#ec4899"
                strokeWidth="1"
                strokeDasharray="5,5"
              />
            </>
          )}
        </svg>

        {/* Tooltip */}
        {hoveredPoint && (
          <div
            className="absolute bg-gray-800 border border-gray-600 rounded-lg p-3 text-white text-sm pointer-events-none"
            style={{
              left: Math.min(hoveredPoint.x + 10, dimensions.width - 200),
              top: Math.max(hoveredPoint.y - 50, 10),
            }}
          >
            <div className="font-semibold">{formatTime(hoveredPoint.time)}</div>
            <div className="text-pink-400">{formatPrice(hoveredPoint.price)}</div>
            {hoveredPoint.volume > 0 && (
              <div className="text-gray-400 text-xs">
                Vol: {hoveredPoint.volume.toLocaleString()}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Price range info */}
      <div className="flex justify-between text-sm text-gray-400 mt-2">
        <div>Min: {formatPrice(min)}</div>
        <div>Max: {formatPrice(max)}</div>
        <div>Range: {formatPrice(max - min)}</div>
      </div>
    </div>
  );
};

export default SVGChart;
