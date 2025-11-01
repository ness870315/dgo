import React, { useState, useEffect, useRef } from 'react';
import { X, ChevronDown, TrendingUp } from 'lucide-react';
import chartService from '../services/chartService';
import SVGChart from './SVGChart';
import TechnicalAnalysisPanel from './TechnicalAnalysisPanel';
import SwapTable from './SwapTable';
import { useAuth } from '../contexts/AuthContext';
import websocketService from '../services/websocketService';

// Error Boundary Component
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('❌ [ErrorBoundary] SVGChart Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full h-96 flex items-center justify-center bg-red-800 rounded-lg border-4 border-red-400">
          <div className="text-center">
            <div className="text-white font-bold text-lg mb-2">❌ SVGChart Error</div>
            <div className="text-red-200 text-sm">Error: {this.state.error?.message}</div>
            <button 
              onClick={() => this.setState({ hasError: false, error: null })}
              className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
            >
              Retry
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const PriceChartModal = ({ token, onClose }) => {
  const { user, isAuthenticated } = useAuth();
  const [currentPrice, setCurrentPrice] = useState(null);
  const [priceChange, setPriceChange] = useState(0);
  const [showTechnicalAnalysis, setShowTechnicalAnalysis] = useState(false);
  const [chartData, setChartData] = useState(null);
  const [timeframe, setTimeframe] = useState('5MIN');
  const [volume, setVolume] = useState(0);
  const [tokenAnalytics, setTokenAnalytics] = useState(null);
  const [realTimeData, setRealTimeData] = useState(null);
  
  // Use ref to track previous price for accurate change calculation
  const previousPriceRef = useRef(null);
  
  const isPremiumUser = isAuthenticated && user?.isPremium;

  const handlePriceUpdate = (priceData) => {
    console.log(`📡 [PRICE-MODAL] 🚀 Real-time price update received:`, priceData);
    
    // Extract price from the correct data structure
    const price = priceData.price || priceData.priceUsd || priceData.data?.price || priceData.data?.priceUsd || priceData.currentPrice;
    
    if (!price) {
      console.warn(`📡 [PRICE-MODAL] ⚠️ No price found in data:`, priceData);
      return;
    }
    
    // Calculate price change using the ref (previous price)
    if (previousPriceRef.current !== null && previousPriceRef.current !== price) {
      const change = ((price - previousPriceRef.current) / previousPriceRef.current) * 100;
      setPriceChange(change);
      console.log(`📡 [PRICE-MODAL] 📊 Price change: ${change.toFixed(2)}% (${previousPriceRef.current} → ${price})`);
    }
    
    // Update the current price and ref
    setCurrentPrice(price);
    previousPriceRef.current = price;
    
    console.log(`📡 [PRICE-MODAL] ✅ Updated price for ${token.symbol}: ${price}`);
  };

  // Subscribe to WebSocket on mount, unsubscribe on unmount
  useEffect(() => {
    const contractAddress = token?.contractAddress;
    if (contractAddress) {
      websocketService.subscribeToToken(contractAddress);
    }
    
    return () => {
      if (contractAddress) {
        websocketService.unsubscribeFromToken(contractAddress);
      }
    };
  }, []); // Empty dependency array - only run on mount/unmount

  // Load data when token changes
  useEffect(() => {
    if (token?.contractAddress) {
      // Load initial price from Jupiter API (more reliable than our cached data)
      loadCurrentPriceFromJupiter();
      loadTokenAnalytics();
      loadRealTimeData();
    }
  }, [token?.contractAddress]);

  useEffect(() => {
    if (tokenAnalytics && timeframe) {
      updateVolumeForTimeframe();
    }
  }, [timeframe, tokenAnalytics]);

  // WebSocket event listeners for real-time updates
  useEffect(() => {
    const handleSwapUpdate = (data) => {
      if (data.tokenAddress === token?.contractAddress) {
        console.log('🔄 [PriceChartModal] Real-time swap update received:', data.swapData);
        
        // ✅ CRITICAL FIX: Append new swap to existing data instead of reloading
        setRealTimeData(prevData => {
          if (!prevData) return prevData;
          
          const newSwap = data.swapData;
          const updatedSwapHistory = [newSwap, ...(prevData.swapHistory || [])];
          const updatedRecentSwaps = [newSwap, ...(prevData.recentSwaps || [])];
          
          console.log(`✅ [PriceChartModal] Added live swap to table (now ${updatedSwapHistory.length} total swaps)`);
          
          return {
            ...prevData,
            swapHistory: updatedSwapHistory,
            recentSwaps: updatedRecentSwaps,
            totalSwaps: updatedSwapHistory.length
          };
        });
      }
    };

    const handleWebSocketPriceUpdate = (data) => {
      if (data.tokenAddress === token?.contractAddress) {
        console.log('📈 [PriceChartModal] Real-time price update received:', data);
        handlePriceUpdate(data);
      }
    };

    // Add event listeners
    websocketService.on('swapUpdate', handleSwapUpdate);
    websocketService.on('priceUpdate', handleWebSocketPriceUpdate);

    // Cleanup
    return () => {
      websocketService.off('swapUpdate', handleSwapUpdate);
      websocketService.off('priceUpdate', handleWebSocketPriceUpdate);
    };
  }, [token?.contractAddress]);

  const loadCurrentPriceFromJupiter = async () => {
    try {
      console.log(`📡 [PRICE-MODAL] Loading initial price from Jupiter API...`);
      const API_BASE = process.env.REACT_APP_API_BASE_URL || 'https://api.degen-oracle.com';
      const response = await fetch(`${API_BASE}/api/jupiter/raw/${token.contractAddress}`);
      const data = await response.json();
      
      if (data.success && data.data?.[0]?.usdPrice) {
        const jupiterPrice = data.data[0].usdPrice;
        setCurrentPrice(jupiterPrice);
        previousPriceRef.current = jupiterPrice; // Initialize the ref with Jupiter price
        console.log(`📡 [PRICE-MODAL] ✅ Initial price loaded from Jupiter: ${jupiterPrice}`);
      } else {
        console.log(`📡 [PRICE-MODAL] ⚠️ Failed to get Jupiter price, falling back to chart service`);
        loadCurrentPrice(); // Fallback to original method
      }
    } catch (error) {
      console.error('Failed to load current price from Jupiter:', error);
      loadCurrentPrice(); // Fallback to original method
    }
  };

  const loadCurrentPrice = async () => {
    try {
      const response = await chartService.getCurrentPrice(token.contractAddress);
      if (response.success) {
        setCurrentPrice(response.price);
        previousPriceRef.current = response.price; // Initialize the ref with initial price
        console.log(`📡 [PRICE-MODAL] 📊 Initial price loaded: ${response.price}`);
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

  const loadRealTimeData = async (retryCount = 0) => {
    try {
      console.log(`🔍 [PriceChartModal] Loading real-time data for ${token.contractAddress} (attempt ${retryCount + 1})`);
      const API_BASE = process.env.REACT_APP_API_BASE_URL || 'https://api.degen-oracle.com';
      const response = await fetch(`${API_BASE}/api/tokens/${token.contractAddress}/realtime-data`);
      console.log(`📡 [PriceChartModal] Response status: ${response.status}`);
      
      if (response.ok) {
        const data = await response.json();
        console.log('📊 [PriceChartModal] Loaded real-time data:', data.data);
        setRealTimeData(data.data);
      } else {
        console.error('❌ [PriceChartModal] Failed to load real-time data:', response.status, response.statusText);
        // Try to get error details
        const errorText = await response.text();
        console.error('❌ [PriceChartModal] Error details:', errorText);
        
        // Retry up to 3 times for 404 errors (deployment might be in progress)
        if (response.status === 404 && retryCount < 3) {
          console.log(`🔄 [PriceChartModal] Retrying in 2 seconds... (${retryCount + 1}/3)`);
          setTimeout(() => loadRealTimeData(retryCount + 1), 2000);
        }
      }
    } catch (error) {
      console.error('❌ [PriceChartModal] Error loading real-time data:', error);
      
      // Retry on network errors
      if (retryCount < 3) {
        console.log(`🔄 [PriceChartModal] Retrying in 2 seconds... (${retryCount + 1}/3)`);
        setTimeout(() => loadRealTimeData(retryCount + 1), 2000);
      }
    }
  };

  const updateVolumeForTimeframe = () => {
    if (!tokenAnalytics) return;




    let volumeValue = 0;
    switch (timeframe) {
      case '1MIN':
      case '5MIN':
        // For 5m, use 5m data or fallback to 1h if 5m is empty
        const buyVol5m = parseFloat(tokenAnalytics.totalBuyVolume?.['5m']) || 0;
        const sellVol5m = parseFloat(tokenAnalytics.totalSellVolume?.['5m']) || 0;
        volumeValue = buyVol5m + sellVol5m;
        // If 5m is empty, use 1h data
        if (volumeValue === 0) {
          const buyVol1h = parseFloat(tokenAnalytics.totalBuyVolume?.['1h']) || 0;
          const sellVol1h = parseFloat(tokenAnalytics.totalSellVolume?.['1h']) || 0;
          volumeValue = buyVol1h + sellVol1h;
        }
        break;
      case '15MIN':
      case '1H':
        const buyVol1h = parseFloat(tokenAnalytics.totalBuyVolume?.['1h']) || 0;
        const sellVol1h = parseFloat(tokenAnalytics.totalSellVolume?.['1h']) || 0;
        volumeValue = buyVol1h + sellVol1h;
        break;
      case '4H':
      case '6H':
        const buyVol6h = parseFloat(tokenAnalytics.totalBuyVolume?.['6h']) || 0;
        const sellVol6h = parseFloat(tokenAnalytics.totalSellVolume?.['6h']) || 0;
        volumeValue = buyVol6h + sellVol6h;
        break;
      case '1D':
      default:
        const buyVol24h = parseFloat(tokenAnalytics.totalBuyVolume?.['24h']) || 0;
        const sellVol24h = parseFloat(tokenAnalytics.totalSellVolume?.['24h']) || 0;
        volumeValue = buyVol24h + sellVol24h;
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

  if (!token) {
    console.log('❌ [PriceChartModal] No token provided');
    return null;
  }

  console.log('🚀 [PriceChartModal] Rendering modal for token:', token.symbol, token.contractAddress);

  return (
    <div 
      className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-1 sm:p-4"
      onClick={(e) => {
        // Only close if clicking the backdrop, not the modal content
        if (e.target === e.currentTarget) {
          console.log('🚀 [PriceChartModal] Backdrop clicked, closing modal');
          onClose();
        }
      }}
    >
      <div 
        className="bg-gray-900 rounded-xl sm:rounded-2xl w-full max-w-4xl max-h-[95vh] sm:max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-2 sm:p-4 border-b border-gray-700 flex-shrink-0">
          <div className="flex items-center space-x-2 sm:space-x-4 min-w-0 flex-1">
            {/* Token Icon */}
            <div className="w-6 h-6 sm:w-12 sm:h-12 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center flex-shrink-0">
              {token.jupiterData?.icon ? (
                <img 
                  src={token.jupiterData.icon} 
                  alt={token.symbol}
                  className="w-6 h-6 sm:w-8 sm:h-8 rounded-full"
                />
              ) : (
                <span className="text-white font-bold text-sm sm:text-lg">
                  {token.symbol?.charAt(0) || '?'}
                </span>
              )}
            </div>
            
            <div className="min-w-0 flex-1">
              <h2 className="text-base sm:text-xl font-bold text-white truncate">{token.symbol}</h2>
              <p className="text-gray-400 text-xs sm:text-sm truncate">{token.name}</p>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center space-x-1 sm:space-x-4 flex-shrink-0">
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
        <div className="px-3 sm:px-6 py-3 sm:py-4 border-b border-gray-700">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-2 sm:space-y-0">
            <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-6 space-y-2 sm:space-y-0">
              <div>
                <div className="text-2xl sm:text-3xl font-bold text-white">
                  {currentPrice ? formatPrice(currentPrice) : 'Loading...'}
                </div>
                <div className={`text-sm font-medium ${
                  priceChange >= 0 ? 'text-green-400' : 'text-red-400'
                }`}>
                  {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)}%
                </div>
              </div>
              
              <div className="text-xs sm:text-sm text-gray-400 space-y-1">
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
          
                 <ErrorBoundary>
                   <SVGChart token={token} onClose={onClose} />
                 </ErrorBoundary>
          
          {/* Swap Table - COMPLETELY ISOLATED TO PREVENT EVENT BUBBLING */}
          <div 
            className="mt-6"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onMouseUp={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            onKeyUp={(e) => e.stopPropagation()}
          >
            <ErrorBoundary>
              <SwapTable 
                key={`swaptable-${token.contractAddress}`}
                token={token} 
                realTimeData={realTimeData} 
              />
            </ErrorBoundary>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PriceChartModal;
