import React, { useState, useEffect } from 'react';
import { X, TrendingUp, TrendingDown } from 'lucide-react';

const PreBondingChart = ({ token, onClose }) => {
  const [chartData, setChartData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchChartData();
  }, [token]);

  const fetchChartData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const apiBase = process.env.REACT_APP_API_BASE_URL || 'https://api.degen-oracle.com';
      const response = await fetch(`${apiBase}/api/tokens/${token.contractAddress || token.tokenAddress}/price-chart?timeframe=5MIN&limit=100`);
      const data = await response.json();
      
      if (data.success && data.data && data.data.length > 0) {
        setChartData(data.data);
        console.log('Chart data loaded:', data.data.length, 'candles');
      } else {
        setError('Chart data not available');
      }
    } catch (err) {
      console.log('Failed to fetch chart data:', err.message);
      setError('Failed to load chart data');
    } finally {
      setLoading(false);
    }
  };

  const formatPrice = (price) => {
    const numPrice = typeof price === 'string' ? parseFloat(price) : price;
    if (isNaN(numPrice)) return '$0.000000';
    
    if (numPrice < 0.000001) {
      return `$${numPrice.toExponential(2)}`;
    } else if (numPrice < 0.01) {
      return `$${numPrice.toFixed(6)}`;
    } else {
      return `$${numPrice.toFixed(4)}`;
    }
  };

  const getPriceChange = () => {
    if (!chartData || chartData.length < 2) return { change: 0, percentage: 0 };
    
    const firstPrice = chartData[0].close;
    const lastPrice = chartData[chartData.length - 1].close;
    const change = lastPrice - firstPrice;
    const percentage = (change / firstPrice) * 100;
    
    return { change, percentage };
  };

  const renderSimpleChart = () => {
    if (!chartData || chartData.length === 0) return null;
    
    const maxPrice = Math.max(...chartData.map(c => c.high));
    const minPrice = Math.min(...chartData.map(c => c.low));
    const priceRange = maxPrice - minPrice;
    
    if (priceRange === 0) return null;
    
    const points = chartData.map((candle, index) => {
      const x = (index / (chartData.length - 1)) * 100;
      const y = 100 - ((candle.close - minPrice) / priceRange) * 100;
      return `${x},${y}`;
    }).join(' ');
    
    const { change, percentage } = getPriceChange();
    const isPositive = change >= 0;
    
    return (
      <div className="space-y-4">
        {/* Price Info */}
        <div className="flex items-center justify-between">
          <div>
            <div className="text-2xl font-bold text-white">
              {formatPrice(chartData[chartData.length - 1].close)}
            </div>
            <div className={`text-sm flex items-center space-x-1 ${
              isPositive ? 'text-green-400' : 'text-red-400'
            }`}>
              {isPositive ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
              <span>{formatPrice(Math.abs(change))} ({percentage.toFixed(2)}%)</span>
            </div>
          </div>
          <div className="text-sm text-gray-400">
            5M Chart
          </div>
        </div>
        
        {/* Simple Line Chart */}
        <div className="relative h-48 bg-gray-800 rounded-lg p-4">
          <svg width="100%" height="100%" className="absolute inset-0">
            {/* Grid lines */}
            <defs>
              <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#374151" strokeWidth="0.5"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
            
            {/* Price line */}
            <polyline
              fill="none"
              stroke={isPositive ? "#10B981" : "#EF4444"}
              strokeWidth="2"
              points={points}
            />
            
            {/* Data points */}
            {chartData.map((candle, index) => {
              const x = (index / (chartData.length - 1)) * 100;
              const y = 100 - ((candle.close - minPrice) / priceRange) * 100;
              return (
                <circle
                  key={index}
                  cx={`${x}%`}
                  cy={`${y}%`}
                  r="2"
                  fill={isPositive ? "#10B981" : "#EF4444"}
                />
              );
            })}
          </svg>
        </div>
        
        {/* Chart Info */}
        <div className="text-xs text-gray-400 text-center">
          Simplified 5-minute chart • Data from Moralis
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <div className="flex items-center space-x-3">
            <img 
              src={token.logo} 
              alt={token.symbol} 
              className="w-8 h-8 rounded-full"
              onError={(e) => { e.target.style.display = 'none'; }}
            />
            <div>
              <h2 className="text-xl font-bold text-white">{token.name}</h2>
              <p className="text-gray-400">{token.symbol}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X size={24} />
          </button>
        </div>
        
        {/* Chart Content */}
        <div className="p-6">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-gray-400">Loading chart...</div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-red-400">{error}</div>
            </div>
          ) : (
            renderSimpleChart()
          )}
        </div>
      </div>
    </div>
  );
};

export default PreBondingChart;
