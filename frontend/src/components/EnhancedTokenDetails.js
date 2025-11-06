import React, { useState, useEffect, useMemo, useRef } from 'react';
import { X, ExternalLink, Twitter, MessageCircle, BarChart3, Users, Flame, Star, Brain } from 'lucide-react';
import SVGChart from './SVGChart';
import SwapTable from './SwapTable';
import websocketService from '../services/websocketService';
import { useHybridPrice } from '../hooks/useHybridPrice';
import kolCallsService from '../services/kolCallsService';
import watchlistService from '../services/watchlistService';
import priorityService from '../services/priorityService';
import { useAuth } from '../contexts/AuthContext';
import EnhancedCallModal from './EnhancedCallModal';
import HoldersInsightsModal from './HoldersInsightsModal';
import AIAnalysisModalNew from './AIAnalysisModal_new';
import { getTokenStatus } from '../utils/statusUtils';

// Test token - ONLY show enhanced view for this specific token
const TEST_TOKEN_ADDRESS = 'HqVZaYJnEcmKQKRf4K5N8eEuBjkTgpRzVfF7AYBFpump'; // ANON

const EnhancedTokenDetails = ({ token, fueledTokens = [], onClose, onTokenUpdated, onNavigateToPremium }) => {
  // Early validation - check BEFORE any hooks to prevent black screen
  if (!token) {
    return null;
  }
  
  const tokenAddress = token?.contractAddress || token?.tokenAddress;
  const isTestToken = tokenAddress === TEST_TOKEN_ADDRESS;

  // If not the test token, don't render enhanced view (return null BEFORE hooks)
  // This prevents the black overlay from rendering for non-ANON tokens
  if (!isTestToken || !tokenAddress) {
    return null;
  }

  const { isAuthenticated } = useAuth();
  const [realTimeData, setRealTimeData] = useState(null);

  // Hybrid price updates
  const { 
    priceData, 
    isLoading: priceLoading, 
    error: priceError,
    isLive, 
    formatPrice, 
    formatLiquidity,
    formatMarketCap,
    getPriceUsd,
    getMarketCap,
    getLiquidity
  } = useHybridPrice(tokenAddress);

  // TokenDetails state management
  const [isInWatchlist, setIsInWatchlist] = useState(false);
  const [showHoldersInsightsModal, setShowHoldersInsightsModal] = useState(false);
  const [showAIAnalysis, setShowAIAnalysis] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(null);
  const [showEnhancedCallModal, setShowEnhancedCallModal] = useState(false);

  // Watchlist management
  useEffect(() => {
    const checkWatchlistStatus = async () => {
      try {
        if (!token?.symbol) return;
        const inList = await watchlistService.isInWatchlist(token.symbol, token.contractAddress);
        setIsInWatchlist(!!inList);
      } catch (err) {
        const fallback = JSON.parse(localStorage.getItem('watchlist') || '[]');
        setIsInWatchlist(fallback.some(item => item.symbol === token?.symbol));
      }
    };

    checkWatchlistStatus();
    
    if (token?.contractAddress) {
      priorityService.boostTokenOnView(token.contractAddress, token.symbol);
    }
  }, [token]);

  // Load real-time data and swap history
  useEffect(() => {
    if (!tokenAddress) return;

    const loadRealTimeData = async () => {
      try {
        const API_BASE = process.env.REACT_APP_API_BASE_URL || 'https://api.degen-oracle.com';
        
        // Fetch real-time data
        const realTimeResponse = await fetch(`${API_BASE}/api/tokens/${tokenAddress}/realtime-data`);
        let realTimeDataObj = {};
        
        if (realTimeResponse.ok) {
          const data = await realTimeResponse.json();
          realTimeDataObj = data.data || {};
        }

        // Fetch swap history if not in real-time data
        if (!realTimeDataObj.swapHistory && !realTimeDataObj.recentSwaps) {
          try {
            const swapsResponse = await fetch(`${API_BASE}/api/charts/swaps/${tokenAddress}`);
            if (swapsResponse.ok) {
              const swapsData = await swapsResponse.json();
              if (swapsData.swaps && Array.isArray(swapsData.swaps)) {
                realTimeDataObj.swapHistory = swapsData.swaps;
                console.log(`📊 Loaded ${swapsData.swaps.length} swaps from API`);
              }
            }
          } catch (swapError) {
            console.warn('Could not load swap history:', swapError);
          }
        }

        setRealTimeData(realTimeDataObj);
      } catch (error) {
        console.error('Error loading real-time data:', error);
      }
    };

    loadRealTimeData();
    
    websocketService.subscribeToToken(tokenAddress);
    
    const handleSwapUpdate = (data) => {
      if (data.tokenAddress === tokenAddress && data.swapData) {
        setRealTimeData(prev => ({
          ...prev,
          swapHistory: [data.swapData, ...(prev?.swapHistory || [])],
          recentSwaps: [data.swapData, ...(prev?.recentSwaps || [])]
        }));
      }
    };
    
    websocketService.on('swapUpdate', handleSwapUpdate);
    
    return () => {
      websocketService.unsubscribeFromToken(tokenAddress);
      websocketService.removeListener('swapUpdate', handleSwapUpdate);
    };
  }, [tokenAddress]);

  // Toggle watchlist
  const toggleWatchlist = async () => {
    if (!token?.symbol) return;
    const next = !isInWatchlist;
    setIsInWatchlist(next);
    try {
      if (next) {
        await watchlistService.addToWatchlist(token.symbol, token.contractAddress);
      } else {
        await watchlistService.removeFromWatchlist(token.symbol, token.contractAddress);
      }
    } catch (err) {
      setIsInWatchlist(!next);
      console.error('Watchlist toggle error:', err);
    }
  };

  // AI Analysis
  const fetchAIAnalysis = async () => {
    if (!token?.contractAddress) return;
    
    setAiLoading(true);
    setAiError(null);
    setShowAIAnalysis(true);

    try {
      const API_BASE = process.env.REACT_APP_API_BASE_URL || 'https://api.degen-oracle.com';
      const response = await fetch(`${API_BASE}/api/tokens/${token.contractAddress}/ai-analysis`);
      
      if (!response.ok) throw new Error('Analysis failed');
      
      const data = await response.json();
      setAiAnalysis(data);
    } catch (error) {
      setAiError(error.message);
      console.error('AI Analysis error:', error);
    } finally {
      setAiLoading(false);
    }
  };

  // Call it handler
  const handleConfirmCall = async (callData) => {
    try {
      const payload = {
        token: {
          symbol: callData.token.symbol,
          name: callData.token.name,
          contractAddress: callData.token.contractAddress
        },
        thesis: callData.thesis,
        twitterEnabled: callData.twitterEnabled,
        tone: callData.tone
      };
      
      await kolCallsService.addCall(payload);
      window.dispatchEvent(new CustomEvent('kol-call-added'));
      alert('✅ You\'ve made your call with AI thesis and Twitter posting!');
    } catch (err) {
      if (err?.code === 'limit_exceeded' && onNavigateToPremium) {
        const upgrade = window.confirm('🚀 ' + err.message + '\n\nWould you like to upgrade now?');
        if (upgrade) onNavigateToPremium();
      } else {
        alert(err?.message || 'Failed to make call');
      }
    }
  };

  // Check if token is fueled
  const getFuelInfo = () => {
    if (!token?.symbol || !fueledTokens?.length) return null;
    const fueledArray = Array.isArray(fueledTokens) ? fueledTokens : (fueledTokens.value || []);
    const fueledToken = fueledArray.find(fuel => 
      fuel.symbol?.toLowerCase() === token.symbol?.toLowerCase()
    );
    return fueledToken ? { isFueled: true, multiplier: fueledToken.fuelType } : null;
  };

  const fuelInfo = getFuelInfo();
  const hypeLevel = getTokenStatus({ overallScore: token?.score || token?.overallScore || 0 });

  // Format helpers
  const formatNumber = (num) => {
    if (!num || isNaN(num)) return 'N/A';
    if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
    if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
    if (num >= 1e3) return (num / 1e3).toFixed(2) + 'K';
    return num.toFixed(2);
  };

  const formatPercentage = (num) => {
    if (!num || isNaN(num)) return 'N/A';
    return (num >= 0 ? '+' : '') + num.toFixed(2) + '%';
  };

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50 overflow-hidden">
        {/* Full-screen layout matching wireframe */}
        <div className="w-full h-full flex flex-col bg-gray-900">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700 flex-shrink-0">
            <div className="flex items-center gap-3">
              {token.jupiterData?.icon || token.logo ? (
                <img 
                  src={token.jupiterData?.icon || token.logo} 
                  alt={token.symbol} 
                  className="w-10 h-10 rounded-full"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center">
                  <span className="text-white font-bold">{token.symbol?.charAt(0) || '?'}</span>
                </div>
              )}
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  {token.symbol}
                  {fuelInfo?.isFueled && (
                    <div className="flex items-center space-x-0.5 px-1 py-0 bg-orange-900 border border-orange-500 rounded-full">
                      <Flame className="w-3 h-3 text-orange-400" />
                      <span className="text-orange-400 text-xs font-bold">{fuelInfo.multiplier}</span>
                    </div>
                  )}
                </h2>
                <p className="text-sm text-gray-400">{token.name}</p>
              </div>
              <span className="ml-4 px-2 py-1 bg-purple-600 text-white text-xs rounded">TEST MODE</span>
            </div>
            <div className="flex items-center gap-2">
              {/* Oracle AI Button */}
              <button
                onClick={() => {
                  if (isAuthenticated && !aiLoading) {
                    fetchAIAnalysis();
                  }
                }}
                disabled={!isAuthenticated || aiLoading}
                className={`px-3 py-1.5 rounded border border-purple-500/60 bg-transparent text-sm flex items-center gap-2 ${
                  (!isAuthenticated || aiLoading)
                    ? 'text-gray-500 cursor-not-allowed opacity-60' 
                    : 'text-gray-200 hover:bg-gray-700'
                }`}
              >
                {aiLoading ? (
                  <>
                    <div className="animate-spin w-4 h-4 border-2 border-purple-400 border-t-transparent rounded-full"></div>
                    <span>Analyzing...</span>
                  </>
                ) : (
                  <>
                    <Brain size={16} />
                    <span>Oracle AI</span>
                  </>
                )}
              </button>

              {/* Call it! Button */}
              <button
                onClick={isAuthenticated ? () => setShowEnhancedCallModal(true) : undefined}
                disabled={!isAuthenticated}
                className={`px-3 py-1.5 rounded border border-purple-500/60 bg-transparent text-sm ${
                  !isAuthenticated ? 'text-gray-500 cursor-not-allowed opacity-60' : 'text-gray-200 hover:bg-gray-700'
                }`}
              >
                Call it!
              </button>

              {/* Watchlist Star */}
              <button
                onClick={isAuthenticated ? toggleWatchlist : undefined}
                disabled={!isAuthenticated}
                className={`p-2 rounded-lg transition-all ${
                  !isAuthenticated
                    ? 'text-gray-500 cursor-not-allowed opacity-60'
                    : isInWatchlist 
                      ? 'text-yellow-400 bg-yellow-400/10 hover:bg-yellow-400/20' 
                      : 'text-gray-400 hover:text-yellow-400 hover:bg-yellow-400/10'
                }`}
              >
                <Star 
                  size={20} 
                  stroke="currentColor"
                  fill={isInWatchlist ? 'currentColor' : 'none'} 
                />
              </button>

              {/* Close Button */}
              <button
                onClick={onClose}
                className="p-2 text-gray-400 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Main Content Grid - 3 columns as per wireframe */}
          <div className="flex-1 overflow-y-auto p-2 sm:p-4" style={{ height: 'calc(100vh - 80px)', display: 'flex', flexDirection: 'column' }}>
            <div className="grid grid-cols-12 gap-2 lg:gap-4" style={{ flex: '1 1 auto', minHeight: 0 }}>
              
              {/* LEFT COLUMN - Token Detail (Full Height) - Real TokenDetails content */}
              <div className="col-span-12 lg:col-span-3 overflow-y-auto bg-gray-800 rounded-lg p-4 lg:p-5" style={{ height: 'calc(100vh - 200px)', minHeight: '400px', maxHeight: 'calc(100vh - 200px)' }}>
                <div className="space-y-6">
                  {/* Performance Overview */}
                  <div>
                    <h3 className="text-lg font-bold mb-4 text-white">⭐ Performance Overview</h3>
                    <div className="grid grid-cols-2 gap-3">
                      {/* Market Cap */}
                      <button
                        onClick={() => setShowHoldersInsightsModal(true)}
                        className="flex flex-col items-center justify-center p-4 bg-gradient-to-br from-blue-600/20 to-cyan-600/20 rounded border border-blue-500/30 hover:from-blue-600/30 hover:to-cyan-600/30 transition-all aspect-square"
                      >
                        <span className="text-blue-200 text-sm mb-1">🏦 Market Cap</span>
                        <span className="text-white font-bold text-base">
                          {formatMarketCap(getMarketCap() || token?.jupiterData?.mcap || token?.marketCap)}
                        </span>
                        {isLive && (
                          <div className="text-xs text-green-400 mt-1">📡 Live</div>
                        )}
                        <div className="flex items-center mt-1">
                          <span className={`text-xs font-medium ${
                            (token?.jupiterData?.stats24h?.priceChange || 0) >= 0 ? 'text-green-400' : 'text-red-400'
                          }`}>
                            {(token?.jupiterData?.stats24h?.priceChange || 0) >= 0 ? '↗' : '↘'} 
                            {formatPercentage(token?.jupiterData?.stats24h?.priceChange || 0)}
                          </span>
                        </div>
                      </button>

                      {/* Price */}
                      <div className="flex flex-col items-center justify-center p-4 bg-gradient-to-br from-green-600/20 to-emerald-600/20 rounded border border-green-500/30 aspect-square">
                        <span className="text-green-200 text-sm mb-1">📈 Price</span>
                        <span className="text-white font-bold text-base">
                          {formatPrice(getPriceUsd() || token?.jupiterData?.usdPrice || token?.price)}
                        </span>
                        {isLive && priceData && (
                          <div className="text-xs text-green-400 mt-1">📡 Live</div>
                        )}
                        <div className="flex items-center mt-1">
                          <span className={`text-xs font-medium ${
                            (token?.jupiterData?.stats24h?.priceChangePercentage || 0) >= 0 ? 'text-green-400' : 'text-red-400'
                          }`}>
                            {(token?.jupiterData?.stats24h?.priceChangePercentage || 0) >= 0 ? '↗' : '↘'} 
                            {formatPercentage(token?.jupiterData?.stats24h?.priceChangePercentage || 0)}
                          </span>
                        </div>
                      </div>

                      {/* Liquidity */}
                      <div className="flex flex-col items-center justify-center p-4 bg-gradient-to-br from-purple-600/20 to-violet-600/20 rounded border border-purple-500/30 aspect-square">
                        <span className="text-purple-200 text-sm mb-1">💰 Liquidity</span>
                        <span className="text-white font-bold text-base">
                          {formatLiquidity(getLiquidity() || token?.jupiterData?.liquidity)}
                        </span>
                        {isLive && priceData && (
                          <div className="text-xs text-green-400 mt-1">📡 Live</div>
                        )}
                        <div className="flex items-center mt-1">
                          <span className={`text-xs font-medium ${
                            (token?.jupiterData?.stats24h?.liquidityChange || 0) >= 0 ? 'text-green-400' : 'text-red-400'
                          }`}>
                            {(token?.jupiterData?.stats24h?.liquidityChange || 0) >= 0 ? '↗' : '↘'} 
                            {formatPercentage(token?.jupiterData?.stats24h?.liquidityChange || 0)}
                          </span>
                        </div>
                      </div>

                      {/* Holders */}
                      <button
                        onClick={() => setShowHoldersInsightsModal(true)}
                        className="flex flex-col items-center justify-center p-4 bg-gradient-to-br from-orange-600/20 to-amber-600/20 rounded border border-orange-500/30 hover:from-orange-600/30 hover:to-amber-600/30 transition-all aspect-square"
                      >
                        <span className="text-orange-200 text-sm mb-1">👥 Holders</span>
                        <span className="text-white font-bold text-base">
                          {formatNumber(token?.jupiterData?.holderCount)}
                        </span>
                        <div className="flex items-center mt-1">
                          <span className={`text-xs font-medium ${
                            (token?.jupiterData?.stats24h?.holderChange || 0) >= 0 ? 'text-green-400' : 'text-red-400'
                          }`}>
                            {(token?.jupiterData?.stats24h?.holderChange || 0) >= 0 ? '↗' : '↘'} 
                            {formatPercentage(token?.jupiterData?.stats24h?.holderChange || 0)}
                          </span>
                        </div>
                      </button>
                    </div>

                    {/* Overall Score */}
                    <div className="mt-4 p-4 bg-gradient-to-br from-blue-600/20 to-purple-600/20 rounded border border-blue-500/30">
                      <span className="text-blue-300 text-sm mb-2 block">📊 Overall Score</span>
                      <div className="flex items-center gap-3">
                        <div className="flex-1 bg-gray-700 rounded-full h-2">
                          <div 
                            className="bg-gradient-to-r from-green-500 to-blue-500 h-full rounded-full transition-all"
                            style={{ width: `${((token?.overallScore || token?.score || 0) / 10) * 100}%` }}
                          />
                        </div>
                        <span className="text-white font-bold text-2xl">
                          {(token?.score || token?.overallScore || 0).toFixed(1)}/10
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Social Metrics */}
                  <div className="space-y-3 pt-4 border-t border-gray-700">
                    <div className="flex items-center justify-between">
                      <div className="text-gray-400 text-sm flex items-center gap-2">
                        <Twitter className="w-4 h-4" />
                        Mentions
                      </div>
                      <div className="text-white font-semibold">
                        {formatNumber(token?.twitterData?.displayMentions || token?.twitterData?.mentions || 0)}
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="text-gray-400 text-sm flex items-center gap-2">
                        <Users className="w-4 h-4" />
                        Community Score
                      </div>
                      <div className="text-white font-semibold">
                        {(token?.communityHealthScore || token?.communityScore || 0).toFixed(1)}/10
                      </div>
                    </div>
                  </div>

                  {/* Contract Address */}
                  <div className="pt-4 border-t border-gray-700">
                    <div className="text-gray-400 text-sm mb-2">Contract Address</div>
                    <div className="flex items-center gap-2">
                      <code className="text-white font-mono text-xs break-all bg-gray-900 p-2 rounded flex-1">
                        {tokenAddress}
                      </code>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(tokenAddress);
                        }}
                        className="text-gray-400 hover:text-gray-300"
                        title="Copy"
                      >
                        📋
                      </button>
                    </div>
                  </div>

                  {/* Insights Section */}
                  {(token?.jupiterData?.stats24h || token?.jupiterData?.fdv) && (
                    <div className="pt-4 border-t border-gray-700">
                      <h3 className="text-white font-semibold mb-3">🔍 Insights</h3>
                      <div className="space-y-2">
                        {token?.jupiterData?.fdv && (
                          <div className="flex items-center justify-between p-2 bg-gray-900 rounded">
                            <span className="text-gray-400 text-sm">💎 FDV:</span>
                            <span className="text-white font-semibold text-sm">
                              ${formatNumber(token.jupiterData.fdv)}
                            </span>
                          </div>
                        )}
                        <div className="flex items-center justify-between p-2 bg-gray-900 rounded">
                          <span className="text-gray-400 text-sm">📊 Volume (24h):</span>
                          <span className="text-white font-semibold text-sm">
                            ${formatNumber((token?.jupiterData?.stats24h?.buyVolume || 0) + (token?.jupiterData?.stats24h?.sellVolume || 0))}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* MIDDLE COLUMN - Split vertically - MAJOR ENLARGEMENT (PROTAGONIST) */}
              <div className="col-span-12 lg:col-span-7 xl:col-span-7 flex flex-col gap-4" style={{ minHeight: '600px', height: 'calc(100vh - 200px)' }}>
                {/* Desktop/14-inch: Use flex layout for proper spacing */}
                {/* CENTER-UP: Price Chart (Decoupled) - MAJOR ENLARGEMENT - NO HEADER */}
                <div className="bg-gray-800 rounded-lg overflow-hidden flex flex-col flex-1" style={{ minHeight: '350px', flexShrink: 0 }}>
                  <SVGChart token={token} onClose={null} />
                </div>

                {/* CENTER-DOWN: Swap Table (Decoupled) - MAJOR ENLARGEMENT - ALIGNED WITH BUBBLEMAPS */}
                {/* Starts after chart with gap-4 (16px) to prevent overlap */}
                <div className="bg-gray-800 rounded-lg flex flex-col border-2 border-green-500 flex-1" style={{ minHeight: '350px', flexShrink: 0 }}>
                  <div className="px-4 pt-2 pb-2 border-b border-gray-700 flex-shrink-0">
                    <h3 className="text-white font-semibold flex items-center gap-2">
                      <BarChart3 className="w-5 h-5" />
                      Swap History
                    </h3>
                  </div>
                    <div className="flex-1 overflow-y-auto p-4" style={{ minHeight: '300px' }}>
                      {realTimeData?.swapHistory?.length > 0 || realTimeData?.recentSwaps?.length > 0 ? (
                        <SwapTable token={token} realTimeData={realTimeData} />
                      ) : (
                        <div className="text-gray-400 text-center py-8">
                          <p>Loading swap history...</p>
                          <p className="text-xs mt-2">Swaps will appear here as they occur</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Mobile Layout - Stacked vertically (only on small screens) */}
                <div className="lg:hidden flex flex-col gap-2">
                  {/* Chart */}
                  <div className="bg-gray-800 rounded-lg overflow-hidden flex flex-col" style={{ height: '350px', minHeight: '300px', flexShrink: 0 }}>
                    <SVGChart token={token} onClose={null} />
                  </div>
                  {/* Swap Table */}
                  <div className="bg-gray-800 rounded-lg flex flex-col border-2 border-green-500" style={{ height: '350px', minHeight: '300px', flexShrink: 0 }}>
                    <div className="px-4 pt-2 pb-2 border-b border-gray-700 flex-shrink-0">
                      <h3 className="text-white font-semibold flex items-center gap-2">
                        <BarChart3 className="w-5 h-5" />
                        Swap History
                      </h3>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4" style={{ minHeight: '200px' }}>
                      {realTimeData?.swapHistory?.length > 0 || realTimeData?.recentSwaps?.length > 0 ? (
                        <SwapTable token={token} realTimeData={realTimeData} />
                      ) : (
                        <div className="text-gray-400 text-center py-8">
                          <p>Loading swap history...</p>
                          <p className="text-xs mt-2">Swaps will appear here as they occur</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* RIGHT COLUMN - Split vertically into 2 sections - SIGNIFICANTLY REDUCED */}
              <div className="col-span-12 lg:col-span-2 flex flex-col gap-4" style={{ minHeight: '600px', height: 'calc(100vh - 200px)' }}>
                {/* Desktop/14-inch: Use flex layout for proper spacing */}
                {/* RIGHT-UP: Jupiter Integrated Plugin - SMALLER THAN CHART - WIDER TO PREVENT SQUEEZING */}
                <div className="bg-gray-800 rounded-lg flex flex-col flex-1" style={{ minHeight: '200px', flexShrink: 0 }}>
                  <div className="px-3 lg:px-4 pt-3 pb-2 border-b border-gray-700 flex-shrink-0">
                    <h3 className="text-white font-semibold text-xs lg:text-sm">Swap Token</h3>
                  </div>
                  <div className="flex-1 overflow-hidden" style={{ minHeight: '150px', padding: '10px' }}>
                    <JupiterSwapWidget token={token} />
                  </div>
                </div>

                {/* RIGHT-BOTTOM: Bubblemaps Holder Distribution - ALIGNED WITH SWAP TABLE */}
                {/* Starts after Jupiter with gap-4 (16px) to prevent overlap, aligned with swap table */}
                <div className="bg-gray-800 rounded-lg border-2 border-red-500 overflow-hidden flex-1" style={{ minHeight: '350px', flexShrink: 0 }}>
                  <BubblemapsIframe token={token} />
                </div>

                {/* Mobile Layout - Stacked vertically (only on small screens) */}
                <div className="lg:hidden flex flex-col gap-2">
                  {/* Jupiter Widget */}
                  <div className="bg-gray-800 rounded-lg flex flex-col" style={{ height: '300px', minHeight: '250px', flexShrink: 0 }}>
                    <div className="px-4 pt-3 pb-2 border-b border-gray-700 flex-shrink-0">
                      <h3 className="text-white font-semibold text-sm">Swap Token</h3>
                    </div>
                    <div className="flex-1 overflow-hidden" style={{ minHeight: '200px', padding: '4px' }}>
                      <JupiterSwapWidget token={token} />
                    </div>
                  </div>
                  {/* Bubblemaps */}
                  <div className="bg-gray-800 rounded-lg border-2 border-red-500 overflow-hidden" style={{ height: '350px', minHeight: '300px', flexShrink: 0 }}>
                    <BubblemapsIframe token={token} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      {showEnhancedCallModal && (
        <EnhancedCallModal
          token={token}
          onClose={() => setShowEnhancedCallModal(false)}
          onConfirm={handleConfirmCall}
        />
      )}

      {showHoldersInsightsModal && (
        <HoldersInsightsModal
          token={token}
          onClose={() => setShowHoldersInsightsModal(false)}
        />
      )}

      {showAIAnalysis && (
        <AIAnalysisModalNew
          token={token}
          analysis={aiAnalysis}
          loading={aiLoading}
          error={aiError}
          onClose={() => {
            setShowAIAnalysis(false);
            setAiAnalysis(null);
            setAiError(null);
          }}
        />
      )}
    </>
  );
};

    // Jupiter Swap Widget Component - Using Official Plugin
    const JupiterSwapWidget = ({ token }) => {
      const [isLoaded, setIsLoaded] = useState(false);
      const [isInitialized, setIsInitialized] = useState(false);
      const initRef = useRef(false); // Track if plugin has been initialized
      const checkIntervalRef = useRef(null); // Track the check interval

      useEffect(() => {
        // Check if script already exists
        if (document.querySelector('script[src="https://plugin.jup.ag/plugin-v1.js"]')) {
          if (window.Jupiter) {
            setIsLoaded(true);
          }
          return;
        }

        // Load Jupiter Plugin script
        const script = document.createElement('script');
        script.src = 'https://plugin.jup.ag/plugin-v1.js';
        script.async = true;
        script.defer = true;
        script.setAttribute('data-preload', '');
        script.onload = () => {
          // Wait a bit for Jupiter to be available
          const checkJupiter = setInterval(() => {
            if (window.Jupiter) {
              setIsLoaded(true);
              clearInterval(checkJupiter);
            }
          }, 100);
          
          // Timeout after 5 seconds
          setTimeout(() => {
            clearInterval(checkJupiter);
            if (!window.Jupiter) {
              console.error('Jupiter plugin failed to load');
            }
          }, 5000);
        };
        script.onerror = () => {
          console.error('Failed to load Jupiter plugin script');
        };
        document.head.appendChild(script);
      }, []);

      // Initialize Jupiter plugin
      useEffect(() => {
        if (!isLoaded || !window.Jupiter || !token?.contractAddress) return;
        
        // If already initialized, just verify it's still there
        if (initRef.current) {
          const targetElement = document.getElementById('jupiter-plugin');
          if (targetElement && targetElement.children.length > 0) {
            // Plugin is already initialized and rendered
            return;
          }
          // Plugin disappeared, reset and re-initialize
          console.warn('Jupiter plugin disappeared, re-initializing...');
          initRef.current = false;
          setIsInitialized(false);
        }

        // Wait for DOM element to be available
        const initJupiter = () => {
          const targetElement = document.getElementById('jupiter-plugin');
          if (!targetElement) {
            console.warn('Jupiter plugin target element not found, retrying...');
            setTimeout(initJupiter, 100);
            return;
          }

          try {
            // Initialize Jupiter Plugin with integrated mode
            window.Jupiter.init({
              displayMode: "integrated",
              integratedTargetId: "jupiter-plugin",
              formProps: {
                initialInputMint: "So11111111111111111111111111111111111111112", // SOL
                initialOutputMint: token.contractAddress,
                swapMode: "ExactIn",
              },
              containerStyles: {
                width: "100%",
                height: "100%",
              },
              containerClassName: "jupiter-plugin-container"
            });
            
            initRef.current = true;
            setIsInitialized(true);
            console.log('Jupiter plugin initialized successfully');
          } catch (error) {
            console.error("Error initializing Jupiter plugin:", error);
            // Retry after a delay
            setTimeout(() => {
              if (!initRef.current) {
                initJupiter();
              }
            }, 1000);
          }
        };

        // Small delay to ensure DOM is ready
        const timeoutId = setTimeout(initJupiter, 100);

        return () => {
          clearTimeout(timeoutId);
        };
      }, [isLoaded, token?.contractAddress]);

      // Periodic check to ensure plugin is still rendered
      useEffect(() => {
        if (!isInitialized) return;

        checkIntervalRef.current = setInterval(() => {
          const targetElement = document.getElementById('jupiter-plugin');
          if (targetElement && targetElement.children.length === 0 && initRef.current) {
            // Plugin disappeared, re-initialize
            console.warn('Jupiter plugin disappeared, re-initializing...');
            initRef.current = false;
            setIsInitialized(false);
            // Trigger re-initialization by updating state
            if (window.Jupiter && token?.contractAddress) {
              setTimeout(() => {
                try {
                  window.Jupiter.init({
                    displayMode: "integrated",
                    integratedTargetId: "jupiter-plugin",
                    formProps: {
                      initialInputMint: "So11111111111111111111111111111111111111112",
                      initialOutputMint: token.contractAddress,
                      swapMode: "ExactIn",
                    },
                    containerStyles: {
                      width: "100%",
                      height: "100%",
                    },
                    containerClassName: "jupiter-plugin-container"
                  });
                  initRef.current = true;
                  setIsInitialized(true);
                } catch (error) {
                  console.error("Error re-initializing Jupiter plugin:", error);
                }
              }, 100);
            }
          }
        }, 2000); // Check every 2 seconds

        return () => {
          if (checkIntervalRef.current) {
            clearInterval(checkIntervalRef.current);
            checkIntervalRef.current = null;
          }
        };
      }, [isInitialized, token?.contractAddress]);

      // Cleanup on actual unmount only
      useEffect(() => {
        return () => {
          if (checkIntervalRef.current) {
            clearInterval(checkIntervalRef.current);
          }
          if (initRef.current && window.Jupiter && window.Jupiter.close) {
            try {
              window.Jupiter.close();
              initRef.current = false;
              setIsInitialized(false);
            } catch (e) {
              // Ignore cleanup errors
            }
          }
        };
      }, []); // Empty deps - only runs on unmount

      return (
        <div className="w-full h-full" style={{ minHeight: '200px' }}>
          {!isLoaded && (
            <div className="flex items-center justify-center h-full text-gray-400 text-xs">
              Loading Jupiter swap widget...
            </div>
          )}
          <div 
            id="jupiter-plugin" 
            className="w-full h-full" 
            style={{ 
              display: (isLoaded && isInitialized) ? 'block' : 'none',
              minHeight: '200px',
              width: '100%',
              height: '100%'
            }}
          ></div>
        </div>
      );
    };

// Social Links Component
const SocialLinks = ({ token }) => {
  const twitterUrl = token?.twitterUrl || token?.twitterData?.url || 
                     (token?.symbol ? `https://twitter.com/${token.symbol}` : null);
  const website = token?.website || token?.twitterData?.website;
  const telegram = token?.telegram || token?.twitterData?.telegram;
  const discord = token?.discord || token?.twitterData?.discord;

  return (
    <div className="space-y-3">
      {twitterUrl && (
        <a
          href={twitterUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 p-3 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
        >
          <Twitter className="w-5 h-5 text-blue-400" />
          <span className="text-white text-sm font-medium">Twitter</span>
          <ExternalLink className="w-4 h-4 text-gray-400 ml-auto" />
        </a>
      )}
      {website && (
        <a
          href={website}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 p-3 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
        >
          <ExternalLink className="w-5 h-5 text-blue-400" />
          <span className="text-white text-sm font-medium">Website</span>
        </a>
      )}
      {telegram && (
        <a
          href={telegram}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 p-3 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
        >
          <MessageCircle className="w-5 h-5 text-blue-400" />
          <span className="text-white text-sm font-medium">Telegram</span>
          <ExternalLink className="w-4 h-4 text-gray-400 ml-auto" />
        </a>
      )}
      {discord && (
        <a
          href={discord}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 p-3 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
        >
          <MessageCircle className="w-5 h-5 text-purple-400" />
          <span className="text-white text-sm font-medium">Discord</span>
          <ExternalLink className="w-4 h-4 text-gray-400 ml-auto" />
        </a>
      )}
      {!twitterUrl && !website && !telegram && !discord && (
        <div className="text-gray-400 text-sm py-4 text-center">
          No social links available
        </div>
      )}
    </div>
  );
};

// Bubblemaps Iframe Component
const BubblemapsIframe = ({ token }) => {
  const tokenAddress = token?.contractAddress || token?.tokenAddress || token?.mint || token?.address;
  
  if (!tokenAddress) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        Token address required
      </div>
    );
  }

  // Use the new iframe.bubblemaps.io URL format with partnerId
  const bubblemapsUrl = `https://iframe.bubblemaps.io/map?address=${tokenAddress}&chain=solana&partnerId=dgo`;

  return (
    <div className="w-full h-full min-h-[300px]">
      <iframe
        src={bubblemapsUrl}
        className="w-full h-full border-0"
        title="Bubblemaps Holder Distribution"
        allow="clipboard-read; clipboard-write"
        style={{ minHeight: '542px' }}
      />
    </div>
  );
};

export default EnhancedTokenDetails;
