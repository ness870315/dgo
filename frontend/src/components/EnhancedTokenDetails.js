import React, { useState, useEffect } from 'react';
import { X, ExternalLink, Twitter, MessageCircle, BarChart3, Users, Flame, Star } from 'lucide-react';
import SVGChart from './SVGChart';
import SwapTable from './SwapTable';
import websocketService from '../services/websocketService';
import { useHybridPrice } from '../hooks/useHybridPrice';

// Test token - ONLY show enhanced view for this specific token
const TEST_TOKEN_ADDRESS = 'HqVZaYJnEcmKQKRf4K5N8eEuBjkTgpRzVfF7AYBFpump'; // ANON

const EnhancedTokenDetails = ({ token, fueledTokens = [], onClose, onTokenUpdated, onNavigateToPremium }) => {
  const [realTimeData, setRealTimeData] = useState(null);
  const tokenAddress = token?.contractAddress || token?.tokenAddress;
  const isTestToken = tokenAddress === TEST_TOKEN_ADDRESS;

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

  // If not the test token, don't render enhanced view
  if (!isTestToken) {
    return null;
  }

  // Load real-time data
  useEffect(() => {
    if (!tokenAddress) return;

    const loadRealTimeData = async () => {
      try {
        const API_BASE = process.env.REACT_APP_API_BASE_URL || 'https://api.degen-oracle.com';
        const response = await fetch(`${API_BASE}/api/tokens/${tokenAddress}/realtime-data`);
        
        if (response.ok) {
          const data = await response.json();
          setRealTimeData(data.data);
        }
      } catch (error) {
        console.error('Error loading real-time data:', error);
      }
    };

    loadRealTimeData();
    
    // Subscribe to WebSocket updates
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

  return (
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
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Main Content Grid - 3 columns as per wireframe */}
        <div className="flex-1 overflow-hidden p-4">
          <div className="grid grid-cols-12 gap-4 h-full">
            
            {/* LEFT COLUMN - Token Detail Modal (Full Height) */}
            <div className="col-span-12 lg:col-span-3 overflow-y-auto bg-gray-800 rounded-lg p-6">
              <div className="space-y-6">
                {/* Price Section */}
                <div>
                  <div className="text-gray-400 text-sm mb-1">Price</div>
                  <div className="text-white font-bold text-2xl">
                    {priceLoading ? '$Loading...' : formatPrice(getPriceUsd())}
                    {isLive && (
                      <span className="ml-2 inline-block w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                    )}
                  </div>
                </div>

                {/* Market Stats */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-gray-400 text-sm mb-1">Market Cap</div>
                    <div className="text-white font-semibold text-lg">
                      {formatMarketCap(getMarketCap())}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-400 text-sm mb-1">Liquidity</div>
                    <div className="text-white font-semibold text-lg">
                      {formatLiquidity(getLiquidity())}
                    </div>
                  </div>
                </div>

                <div>
                  <div className="text-gray-400 text-sm mb-1">Volume (24h)</div>
                  <div className="text-white font-semibold">
                    {formatNumber(token.volume24h || token.jupiterData?.stats24h?.buyVolume + token.jupiterData?.stats24h?.sellVolume || 0)}
                  </div>
                </div>

                {/* Contract Address */}
                <div>
                  <div className="text-gray-400 text-sm mb-2">Contract Address</div>
                  <div className="text-white font-mono text-xs break-all bg-gray-900 p-2 rounded">
                    {tokenAddress}
                  </div>
                </div>

                {/* Social Metrics */}
                {(token.mentions || token.communityScore) && (
                  <div className="space-y-3 pt-4 border-t border-gray-700">
                    {token.mentions && (
                      <div className="flex items-center justify-between">
                        <div className="text-gray-400 text-sm flex items-center gap-2">
                          <MessageCircle className="w-4 h-4" />
                          Mentions
                        </div>
                        <div className="text-white font-semibold">{token.mentions}</div>
                      </div>
                    )}
                    {token.communityScore && (
                      <div className="flex items-center justify-between">
                        <div className="text-gray-400 text-sm flex items-center gap-2">
                          <Users className="w-4 h-4" />
                          Community Score
                        </div>
                        <div className="text-white font-semibold">{token.communityScore.toFixed(1)}</div>
                      </div>
                    )}
                  </div>
                )}

                {/* Overall Score */}
                {(token.overallScore || token.score) && (
                  <div className="pt-4 border-t border-gray-700">
                    <div className="text-gray-400 text-sm mb-2">Overall Score</div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-gray-700 rounded-full h-2">
                        <div 
                          className="bg-gradient-to-r from-green-500 to-blue-500 h-full rounded-full transition-all"
                          style={{ width: `${((token.overallScore || token.score || 0) / 10) * 100}%` }}
                        />
                      </div>
                      <div className="text-white font-bold text-lg">
                        {(token.overallScore || token.score || 0).toFixed(1)}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* MIDDLE COLUMN - Split vertically */}
            <div className="col-span-12 lg:col-span-5 flex flex-col gap-4 h-full">
              
              {/* CENTER-UP: Price Chart Modal (Decoupled) */}
              <div className="flex-1 bg-gray-800 rounded-lg overflow-hidden min-h-0">
                <SVGChart token={token} onClose={onClose} />
              </div>

              {/* CENTER-DOWN: Swap Table (Decoupled) */}
              <div className="flex-1 bg-gray-800 rounded-lg p-4 overflow-y-auto min-h-0">
                <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
                  <BarChart3 className="w-5 h-5" />
                  Swap History
                </h3>
                <SwapTable token={token} realTimeData={realTimeData} />
              </div>
            </div>

            {/* RIGHT COLUMN - Split vertically into 3 sections */}
            <div className="col-span-12 lg:col-span-4 flex flex-col gap-4 h-full">
              
              {/* RIGHT-UP: Jupiter Integrated Plugin */}
              <div className="flex-1 bg-gray-800 rounded-lg p-4 overflow-hidden min-h-0">
                <h3 className="text-white font-semibold mb-4">Swap Token</h3>
                <div className="h-full">
                  <JupiterSwapWidget token={token} />
                </div>
              </div>

              {/* RIGHT-MIDDLE: Social Links */}
              <div className="bg-gray-800 rounded-lg p-4 flex-shrink-0">
                <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
                  <Twitter className="w-5 h-5" />
                  Social Links
                </h3>
                <SocialLinks token={token} />
              </div>

              {/* RIGHT-BOTTOM: Social Activity (Bubblemaps) */}
              <div className="flex-1 bg-gray-800 rounded-lg p-4 overflow-hidden min-h-[300px]">
                <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  Holder Distribution
                </h3>
                <BubblemapsIframe token={token} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Format number helper
const formatNumber = (num) => {
  if (!num || num === 0) return '$0';
  if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
  if (num >= 1e3) return `$${(num / 1e3).toFixed(2)}K`;
  return `$${num.toFixed(2)}`;
};

// Jupiter Swap Widget Component
const JupiterSwapWidget = ({ token }) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const widgetRef = React.useRef(null);

  useEffect(() => {
    // Load Jupiter script if not already loaded
    if (!window.Jupiter) {
      const script = document.createElement('script');
      script.src = 'https://quote-api.jup.ag/v6/script.js';
      script.async = true;
      script.onload = () => {
        setIsLoaded(true);
      };
      script.onerror = () => {
        console.error('Failed to load Jupiter script');
      };
      document.body.appendChild(script);
    } else {
      setIsLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!isLoaded || !window.Jupiter || !token?.contractAddress || !widgetRef.current) return;

    try {
      // Clear any existing widget
      widgetRef.current.innerHTML = '';
      
      // Initialize Jupiter in embedded mode
      window.Jupiter.init({
        displayMode: "default",
        endpoint: "https://quote-api.jup.ag/v6",
        formProps: {
          initialInputMint: "So11111111111111111111111111111111111111112", // SOL
          initialOutputMint: token.contractAddress,
          swapMode: "ExactIn",
        },
        containerStyles: {
          width: "100%",
          height: "100%",
        },
        containerClassName: "jupiter-embedded-widget"
      });
    } catch (error) {
      console.error("Error initializing Jupiter widget:", error);
    }
  }, [isLoaded, token?.contractAddress]);

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        Loading Jupiter swap widget...
      </div>
    );
  }

  return (
    <div ref={widgetRef} id="jupiter-embedded-widget" className="w-full h-full">
      {/* Jupiter will inject content here */}
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
  const tokenAddress = token?.contractAddress || token?.tokenAddress;
  
  if (!tokenAddress) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        Token address required
      </div>
    );
  }

  // Bubblemaps iframe URL format
  const bubblemapsUrl = `https://app.bubblemaps.io/iframe?chain=solana&token=${tokenAddress}`;

  return (
    <div className="w-full h-full min-h-[300px]">
      <iframe
        src={bubblemapsUrl}
        className="w-full h-full border-0 rounded-lg"
        title="Bubblemaps Holder Distribution"
        allow="clipboard-read; clipboard-write"
      />
    </div>
  );
};

export default EnhancedTokenDetails;
