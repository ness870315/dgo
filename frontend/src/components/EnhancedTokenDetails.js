import React, { useState, useEffect } from 'react';
import { X, ExternalLink } from 'lucide-react';
import SVGChart from './SVGChart';
import SwapTable from './SwapTable';
import websocketService from '../services/websocketService';

// Test token - ONLY show enhanced view for this specific token
const TEST_TOKEN_ADDRESS = 'HqVZaYJnEcmKQKRf4K5N8eEuBjkTgpRzVfF7AYBFpump'; // ANON

const EnhancedTokenDetails = ({ token, fueledTokens = [], onClose, onTokenUpdated, onNavigateToPremium }) => {
  const [realTimeData, setRealTimeData] = useState(null);
  const [currentPrice, setCurrentPrice] = useState(null);
  
  const tokenAddress = token?.contractAddress || token?.tokenAddress;
  const isTestToken = tokenAddress === TEST_TOKEN_ADDRESS;

  // If not the test token, don't render enhanced view
  if (!isTestToken) {
    return null; // Should not happen, but safety check
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
          
          // Extract current price
          if (data.data?.price || data.data?.priceUsd) {
            setCurrentPrice(data.data.price || data.data.priceUsd);
          }
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

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 overflow-y-auto">
      <div className="bg-gray-900 w-full max-w-[95vw] max-h-[95vh] rounded-lg shadow-2xl flex flex-col">
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
              <h2 className="text-xl font-bold text-white">{token.symbol}</h2>
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

        {/* Main Content Grid */}
        <div className="flex-1 overflow-hidden p-4">
          <div className="grid grid-cols-12 gap-4 h-full">
            {/* Left Column - Original Token Details (simplified) */}
            <div className="col-span-12 lg:col-span-4 overflow-y-auto bg-gray-800 rounded-lg p-4">
              <h3 className="text-white font-semibold mb-4">Token Information</h3>
              <div className="space-y-4">
                <div>
                  <div className="text-gray-400 text-sm">Price</div>
                  <div className="text-white font-bold text-lg">
                    ${currentPrice ? currentPrice.toFixed(6) : 'Loading...'}
                  </div>
                </div>
                <div>
                  <div className="text-gray-400 text-sm">Market Cap</div>
                  <div className="text-white font-semibold">
                    ${formatNumber(token.marketCap || token.jupiterData?.mcap || 0)}
                  </div>
                </div>
                <div>
                  <div className="text-gray-400 text-sm">Liquidity</div>
                  <div className="text-white font-semibold">
                    ${formatNumber(token.liquidity || token.jupiterData?.liquidity || 0)}
                  </div>
                </div>
                <div>
                  <div className="text-gray-400 text-sm">Volume (24h)</div>
                  <div className="text-white font-semibold">
                    ${formatNumber(token.volume24h || 0)}
                  </div>
                </div>
                <div>
                  <div className="text-gray-400 text-sm">Contract Address</div>
                  <div className="text-white font-mono text-xs break-all">
                    {tokenAddress}
                  </div>
                </div>
              </div>
            </div>

            {/* Center Column */}
            <div className="col-span-12 lg:col-span-5 flex flex-col gap-4 h-full">
              {/* Center Up - Price Chart (decoupled) */}
              <div className="bg-gray-800 rounded-lg overflow-hidden flex-1 min-h-[400px]">
                <div className="h-full">
                  <SVGChart token={token} onClose={onClose} />
                </div>
              </div>

              {/* Center Down - Swap Table (decoupled) */}
              <div className="bg-gray-800 rounded-lg p-4 flex-1 overflow-y-auto min-h-[300px]">
                <h3 className="text-white font-semibold mb-4">Swap History</h3>
                <SwapTable token={token} realTimeData={realTimeData} />
              </div>
            </div>

            {/* Right Column */}
            <div className="col-span-12 lg:col-span-3 flex flex-col gap-4 h-full">
              {/* Right Up - Jupiter Swap Widget */}
              <div className="bg-gray-800 rounded-lg p-4 flex-1 min-h-[400px]">
                <h3 className="text-white font-semibold mb-4">Swap Token</h3>
                <JupiterSwapWidget token={token} />
              </div>

              {/* Right Middle - Social Links */}
              <div className="bg-gray-800 rounded-lg p-4">
                <h3 className="text-white font-semibold mb-4">Social Links</h3>
                <SocialLinks token={token} />
              </div>

              {/* Right Bottom - Bubblemaps */}
              <div className="bg-gray-800 rounded-lg p-4 flex-1 min-h-[300px]">
                <h3 className="text-white font-semibold mb-4">Holder Distribution</h3>
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

// Jupiter Swap Widget Component (Inline version)
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
      document.body.appendChild(script);
    } else {
      setIsLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!isLoaded || !window.Jupiter || !token?.contractAddress || !widgetRef.current) return;

    try {
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
        },
        containerClassName: "jupiter-embedded-widget"
      });
    } catch (error) {
      console.error("Error initializing Jupiter widget:", error);
    }
  }, [isLoaded, token?.contractAddress]);

  return (
    <div ref={widgetRef} id="jupiter-embedded-widget" className="w-full h-full">
      {!isLoaded && (
        <div className="text-gray-400 text-sm">Loading Jupiter swap widget...</div>
      )}
    </div>
  );
};

// Social Links Component
const SocialLinks = ({ token }) => {
  const twitterUrl = token?.twitterUrl || token?.twitterData?.url || 
                     (token?.symbol ? `https://twitter.com/${token.symbol}` : null);
  const website = token?.website || token?.twitterData?.website;

  return (
    <div className="space-y-2">
      {twitterUrl && (
        <a
          href={twitterUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-blue-400 hover:text-blue-300 transition-colors"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
          </svg>
          <span className="text-sm">Twitter</span>
        </a>
      )}
      {website && (
        <a
          href={website}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-blue-400 hover:text-blue-300 transition-colors"
        >
          <ExternalLink className="w-5 h-5" />
          <span className="text-sm">Website</span>
        </a>
      )}
      {!twitterUrl && !website && (
        <div className="text-gray-400 text-sm">No social links available</div>
      )}
    </div>
  );
};

// Bubblemaps Iframe Component
const BubblemapsIframe = ({ token }) => {
  const tokenAddress = token?.contractAddress || token?.tokenAddress;
  
  if (!tokenAddress) {
    return <div className="text-gray-400 text-sm">Token address required</div>;
  }

  // Bubblemaps iframe URL format
  const bubblemapsUrl = `https://app.bubblemaps.io/iframe?chain=solana&token=${tokenAddress}`;

  return (
    <div className="w-full h-full">
      <iframe
        src={bubblemapsUrl}
        className="w-full h-full min-h-[300px] border-0 rounded-lg"
        title="Bubblemaps Holder Distribution"
        allow="clipboard-read; clipboard-write"
      />
    </div>
  );
};

export default EnhancedTokenDetails;