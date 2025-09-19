import React, { useState, useEffect } from 'react';
import { X, ChevronDown, TrendingUp } from 'lucide-react';
import chartService from '../services/chartService';
import SVGChart from './SVGChartEnhanced';
import TechnicalAnalysisPanel from './TechnicalAnalysisPanel';
import { useAuth } from '../contexts/AuthContext';

const PriceChartModal = ({ token, onClose }) => {
  const { user, isAuthenticated } = useAuth();
  const [currentPrice, setCurrentPrice] = useState(null);
  const [priceChange, setPriceChange] = useState(0);
  const [showTechnicalAnalysis, setShowTechnicalAnalysis] = useState(false);
  const [chartData, setChartData] = useState(null);
  const [timeframe, setTimeframe] = useState('1D');
  const [volume, setVolume] = useState(0);
  const [tokenAnalytics, setTokenAnalytics] = useState(null);
  
  const isPremiumUser = isAuthenticated && user?.isPremium;

  useEffect(() => {
    if (token?.contractAddress) {
      loadCurrentPrice();
      loadTokenAnalytics();
    }
  }, [token?.contractAddress]);

  useEffect(() => {
    if (tokenAnalytics && timeframe) {
      updateVolumeForTimeframe();
    }
  }, [timeframe, tokenAnalytics]);

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

  const loadTokenAnalytics = async () => {
    try {
      const response = await chartService.getTokenAnalytics(token.contractAddress);
      if (response.success) {
        setTokenAnalytics(response.data);
      }
    } catch (error) {
      console.error('Failed to load token analytics:', error);
    }
  };

  const updateVolumeForTimeframe = () => {
    if (!tokenAnalytics) return;

    let volumeValue = 0;
    switch (timeframe) {
      case '1MIN':
      case '5MIN':
        volumeValue = tokenAnalytics.totalVolume?.['5m'] || 0;
        break;
      case '15MIN':
      case '1H':
        volumeValue = tokenAnalytics.totalVolume?.['1h'] || 0;
        break;
      case '4H':
      case '6H':
        volumeValue = tokenAnalytics.totalVolume?.['6h'] || 0;
        break;
      case '1D':
      default:
        volumeValue = tokenAnalytics.totalVolume?.['24h'] || 0;
        break;
    }
    setVolume(volumeValue);
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
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-2 sm:p-4">
      <div className="bg-gray-900 rounded-2xl w-full max-w-4xl max-h-[90vh] sm:max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-3 sm:p-4 border-b border-gray-700 flex-shrink-0">
          <div className="flex items-center space-x-2 sm:space-x-4 min-w-0 flex-1">
            {/* Token Icon */}
            <div className="w-8 h-8 sm:w-12 sm:h-12 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center flex-shrink-0">
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
            
            <div className="min-w-0 flex-1">
              <h2 className="text-lg sm:text-xl font-bold text-white truncate">{token.symbol}</h2>
              <p className="text-gray-400 text-xs sm:text-sm truncate">{token.name}</p>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center space-x-2 sm:space-x-4 flex-shrink-0">
            {/* Oracle Chart Button - Premium only for AI Analysis toggle */}
            <button
              onClick={() => {
                setShowTechnicalAnalysis(!showTechnicalAnalysis);
              }}
              disabled={!isAuthenticated || !isPremiumUser}
              className={`flex items-center space-x-1 sm:space-x-2 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg transition-colors border text-xs sm:text-sm ${
                !isAuthenticated || !isPremiumUser
                  ? 'bg-gray-600 text-gray-400 border-gray-500 cursor-not-allowed opacity-60'
                  : showTechnicalAnalysis
                  ? 'bg-purple-600 text-white border-purple-500 hover:bg-purple-700'
                  : 'bg-gray-600 text-white border-purple-500 hover:bg-gray-500'
              }`}
            >
              <TrendingUp size={16} />
              <span>Oracle Chart</span>
              {showTechnicalAnalysis && isPremiumUser && (
                <span className="text-xs bg-purple-500 px-2 py-0.5 rounded-full">
                  AI Analysis
                </span>
              )}
            </button>

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
                <div>Volume ({timeframe}): {formatNumber(volume)}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Chart Container - Scrollable */}
        <div className="flex-1 overflow-y-auto p-2 sm:p-4 scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800 hover:scrollbar-thumb-gray-500">
          {/* Technical Analysis Panel */}
          {showTechnicalAnalysis && isPremiumUser && (
            <div className="mb-4">
              <TechnicalAnalysisPanel
                contractAddress={token.contractAddress}
                chartData={chartData}
                timeframe={timeframe}
                isVisible={showTechnicalAnalysis}
              />
            </div>
          )}
          
          <SVGChart 
            token={token} 
            onClose={onClose}
            onChartDataChange={setChartData}
            onTimeframeChange={setTimeframe}
          />
        </div>
      </div>
    </div>
  );
};

export default PriceChartModal;
