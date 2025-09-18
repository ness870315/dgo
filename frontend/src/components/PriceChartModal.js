import React, { useState, useEffect } from 'react';
import { X, ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, TrendingUp } from 'lucide-react';
import chartService from '../services/chartService';
import SVGChart from './SVGChart';

const PriceChartModal = ({ token, onClose }) => {
  const [currentPrice, setCurrentPrice] = useState(null);
  const [priceChange, setPriceChange] = useState(0);

  useEffect(() => {
    if (token?.contractAddress) {
      loadCurrentPrice();
    }
  }, [token?.contractAddress]);

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
            {/* Chart Type - SVG Chart */}
            <div className="flex bg-gray-800 rounded-lg p-1">
              <div className="flex items-center space-x-2 px-3 py-2 rounded-md bg-blue-600 text-white">
                <TrendingUp size={16} />
                <span>SVG Chart</span>
              </div>
            </div>

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
          <SVGChart 
            token={token} 
            onClose={onClose}
          />
        </div>
      </div>
    </div>
  );
};

export default PriceChartModal;
