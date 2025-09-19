import React, { useState, useEffect } from 'react';
import { X, ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, TrendingUp } from 'lucide-react';
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
  
  const isPremiumUser = isAuthenticated && user?.isPremium;
  
  // Debug logging
  console.log('🔍 PriceChartModal Debug:', {
    isAuthenticated,
    isPremiumUser,
    showTechnicalAnalysis,
    user: user ? { id: user.id, isPremium: user.isPremium } : null
  });

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
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-2 sm:p-4">
      <div className="bg-gray-900 rounded-2xl w-full max-w-4xl max-h-[90vh] sm:max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-3 sm:p-4 border-b border-gray-700">
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
                console.log('🔘 Oracle Chart button clicked!', { 
                  currentState: showTechnicalAnalysis, 
                  willBecome: !showTechnicalAnalysis,
                  isPremiumUser,
                  isAuthenticated 
                });
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
        <div className="p-2 sm:p-4">
          {/* Technical Analysis Panel */}
          {showTechnicalAnalysis && isPremiumUser && (
            <div>
              <div className="text-white text-sm mb-2">🔍 Debug: Technical Analysis Panel should render here</div>
              <TechnicalAnalysisPanel
                contractAddress={token.contractAddress}
                chartData={chartData}
                timeframe={timeframe}
                isVisible={showTechnicalAnalysis}
              />
            </div>
          )}
          {showTechnicalAnalysis && !isPremiumUser && (
            <div className="text-red-400 text-sm mb-2">🔍 Debug: User is not premium, panel hidden</div>
          )}
          {!showTechnicalAnalysis && (
            <div className="text-gray-400 text-sm mb-2">🔍 Debug: Technical Analysis is OFF</div>
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
