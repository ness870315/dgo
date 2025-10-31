import React, { useState, useEffect } from 'react';
import { Flame } from 'lucide-react';
import websocketService from '../services/websocketService';

const TokenRankedList = ({ tokens, fueledTokens = [], onTokenSelect }) => {
  const [rankings, setRankings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);

  // Format numbers
  const formatNumber = (num) => {
    if (!num || num === 0) return '$0';
    if (num >= 1000000000) return `$${(num / 1000000000).toFixed(2)}B`;
    if (num >= 1000000) return `$${(num / 1000000).toFixed(2)}M`;
    if (num >= 1000) return `$${(num / 1000).toFixed(2)}K`;
    return `$${num.toFixed(2)}`;
  };

  const formatPrice = (price) => {
    if (!price || price === 0) return '$0.00';
    if (price < 0.0001) return `$${price.toExponential(2)}`;
    if (price < 1) return `$${price.toFixed(6)}`;
    return `$${price.toFixed(2)}`;
  };

  const formatPercentage = (val) => {
    if (val === null || val === undefined || isNaN(val)) return '0.00%';
    return `${val >= 0 ? '+' : ''}${val.toFixed(2)}%`;
  };

  // Check if token is fueled
  const getFuelInfo = (tokenSymbol) => {
    const fueledTokensArray = fueledTokens.value || fueledTokens;
    const fueledToken = fueledTokensArray.find(fueled =>
      fueled.symbol?.toLowerCase() === tokenSymbol?.toLowerCase()
    );
    
    if (fueledToken) {
      return {
        isFueled: true,
        multiplier: fueledToken.fuelType || '10x'
      };
    }
    
    return { isFueled: false, multiplier: null };
  };

  // Fetch real-time rankings
  const fetchRankings = async () => {
    try {
      setLoading(true);
      const API_BASE = process.env.REACT_APP_API_BASE_URL || 'https://api.degen-oracle.com';
      const response = await fetch(`${API_BASE}/api/tokens/ranking/realtime`);
      const data = await response.json();
      
      if (data.success && data.data && data.data.length > 0) {
        // Use real-time data from gRPC
        console.log('✅ Using real-time gRPC data:', data.data.length, 'tokens');
        setRankings(data.data);
        setLastUpdate(new Date());
      } else {
        // Merge cache tokens with any available real-time data
        console.log('⚠️ No real-time data, using cache tokens with fallback values');
        const enrichedTokens = tokens.map(token => ({
          ...token,
          address: token.contractAddress || token.tokenAddress,
          price: token.jupiterData?.price || token.price || 0,
          age: calculateTokenAge(token),
          txns24h: 0,
          volume24h: 0,
          makers24h: 0,
          priceChange5m: 0,
          priceChange1h: 0,
          priceChange6h: 0,
          priceChange24h: token.jupiterData?.priceChange24h || 0,
          liquidity: token.jupiterData?.liquidity || 0,
          marketCap: token.jupiterData?.marketCap || token.jupiterData?.mcap || token.marketCap || 0,
          isLive: false
        }));
        setRankings(enrichedTokens);
      }
    } catch (err) {
      console.error('Error fetching rankings:', err);
      // Fallback to provided tokens with enrichment
      const enrichedTokens = tokens.map(token => ({
        ...token,
        address: token.contractAddress || token.tokenAddress,
        price: token.jupiterData?.price || token.price || 0,
        age: calculateTokenAge(token),
        txns24h: 0,
        volume24h: 0,
        makers24h: 0,
        priceChange5m: 0,
        priceChange1h: 0,
        priceChange6h: 0,
        priceChange24h: token.jupiterData?.priceChange24h || 0,
        liquidity: token.jupiterData?.liquidity || 0,
        marketCap: token.jupiterData?.marketCap || token.jupiterData?.mcap || token.marketCap || 0,
        isLive: false
      }));
      setRankings(enrichedTokens);
    } finally {
      setLoading(false);
    }
  };

  // Calculate token age
  const calculateTokenAge = (token) => {
    const createdAt = token.createdAt || token.timestamp || token.jupiterData?.createdAt;
    if (!createdAt) return 'N/A';
    
    const now = Date.now();
    const created = typeof createdAt === 'number' ? createdAt : new Date(createdAt).getTime();
    const diff = now - created;
    
    const days = Math.floor(diff / (24 * 60 * 60 * 1000));
    const hours = Math.floor(diff / (60 * 60 * 1000));
    const minutes = Math.floor(diff / (60 * 1000));
    
    if (days > 0) return `${days}d`;
    if (hours > 0) return `${hours}h`;
    if (minutes > 0) return `${minutes}m`;
    return 'Just now';
  };

  // Subscribe to WebSocket updates
  useEffect(() => {
    fetchRankings();

    // Poll every 10 seconds as fallback
    const pollInterval = setInterval(fetchRankings, 10000);

    // Subscribe to WebSocket updates
    const handleRankingUpdate = (data) => {
      if (data.rankings && data.rankings.length > 0) {
        setRankings(data.rankings);
        setLastUpdate(new Date());
      }
    };

    websocketService.on('rankingUpdate', handleRankingUpdate);

    return () => {
      clearInterval(pollInterval);
      websocketService.off('rankingUpdate', handleRankingUpdate);
    };
  }, []);

  // Update when tokens prop changes
  useEffect(() => {
    if (rankings.length === 0 && tokens.length > 0) {
      setRankings(tokens);
    }
  }, [tokens]);

  const displayTokens = rankings.length > 0 ? rankings : tokens;

  if (loading && displayTokens.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-400">Loading rankings...</div>
      </div>
    );
  }

  return (
    <div className="w-full h-full overflow-y-auto bg-gray-900">
      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs table-fixed">
          <thead className="text-xs text-gray-400 uppercase bg-gray-800 sticky top-0 z-20">
            <tr className="border-b border-gray-700">
              <th colSpan="12" className="px-2 py-2 text-left">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-white font-bold text-sm">📊 Token Rankings</span>
            </div>
                  {lastUpdate && (
                    <span className="text-xs text-gray-400 normal-case">
                      Updated: {lastUpdate.toLocaleTimeString()}
                    </span>
                  )}
          </div>
              </th>
            </tr>
            <tr className="border-b border-gray-700">
              <th className="px-2 py-2 text-left w-8">#</th>
              <th className="px-2 py-2 text-left w-32">Token</th>
              <th className="px-2 py-2 text-right w-20">Price</th>
              <th className="px-2 py-2 text-right w-12">Txns</th>
              <th className="px-2 py-2 text-right w-16">Volume</th>
              <th className="px-2 py-2 text-right w-12">Makers</th>
              <th className="px-2 py-2 text-right w-16">5M</th>
              <th className="px-2 py-2 text-right w-16">1H</th>
              <th className="px-2 py-2 text-right w-16">6H</th>
              <th className="px-2 py-2 text-right w-16">24H</th>
              <th className="px-2 py-2 text-right w-20">Liquidity</th>
              <th className="px-2 py-2 text-right w-20">MCap</th>
            </tr>
          </thead>
          <tbody>
            {displayTokens.map((token, index) => {
              const fuelInfo = getFuelInfo(token.symbol);

            return (
                <tr
                  key={token.address || token.contractAddress || index}
                  className="border-b border-gray-700 hover:bg-gray-800/30 cursor-pointer transition-colors"
                onClick={() => onTokenSelect(token)}
              >
                      {/* Rank */}
                  <td className="px-2 py-2 font-medium text-gray-300">
                    #{index + 1}
                  </td>

                  {/* Token */}
                  <td className="px-2 py-2">
                    <div className="flex items-center gap-1.5">
                      {/* Token icon */}
                      {token.jupiterData?.icon || token.logo ? (
                          <img 
                            src={token.jupiterData?.icon || token.logo} 
                            alt={token.symbol} 
                          className="w-5 h-5 rounded-full flex-shrink-0"
                          onError={(e) => e.target.style.display = 'none'}
                        />
                      ) : (
                        <div className="w-5 h-5 rounded-full bg-gray-700 flex items-center justify-center flex-shrink-0">
                          <span className="text-xs text-gray-400">{token.symbol?.charAt(0) || '?'}</span>
                        </div>
                      )}
                      
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-white flex items-center gap-1 text-xs">
                          <span className="truncate">{token.symbol}</span>
                        {fuelInfo.isFueled && (
                            <div className="flex items-center space-x-0.5 px-1 py-0.5 bg-orange-900 border border-orange-500 rounded-full flex-shrink-0">
                            <Flame className="w-2 h-2 text-orange-400" />
                            <span className="text-orange-400 text-xs font-bold">
                              {fuelInfo.multiplier}
                            </span>
                          </div>
                        )}
                      </div>
                        <div className="text-xs text-gray-400 truncate">{token.name}</div>
                      </div>
                    </div>
                  </td>

                  {/* Price */}
                  <td className="px-2 py-2 text-right font-mono text-white text-xs">
                    {formatPrice(token.price || token.jupiterData?.price)}
                  </td>

                  {/* Txns */}
                  <td className="px-2 py-2 text-right text-gray-300 text-xs">
                    {token.txns24h ? token.txns24h.toLocaleString() : '0'}
                  </td>

                  {/* Volume */}
                  <td className="px-2 py-2 text-right font-medium text-white text-xs">
                    {formatNumber(token.volume24h || 0)}
                  </td>

                  {/* Makers */}
                  <td className="px-2 py-2 text-right text-gray-300 text-xs">
                    {token.makers24h ? token.makers24h.toLocaleString() : '0'}
                  </td>

                  {/* 5M Change */}
                  <td className={`px-2 py-2 text-right font-medium text-xs ${
                    (token.priceChange5m || 0) >= 0 ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {formatPercentage(token.priceChange5m || 0)}
                  </td>

                  {/* 1H Change */}
                  <td className={`px-2 py-2 text-right font-medium text-xs ${
                    (token.priceChange1h || 0) >= 0 ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {formatPercentage(token.priceChange1h || 0)}
                  </td>

                  {/* 6H Change */}
                  <td className={`px-2 py-2 text-right font-medium text-xs ${
                    (token.priceChange6h || 0) >= 0 ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {formatPercentage(token.priceChange6h || 0)}
                  </td>

                  {/* 24H Change */}
                  <td className={`px-2 py-2 text-right font-medium text-xs ${
                    (token.priceChange24h || 0) >= 0 ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {formatPercentage(token.priceChange24h || 0)}
                  </td>

                  {/* Liquidity */}
                  <td className="px-2 py-2 text-right text-gray-300 text-xs">
                    {formatNumber(token.liquidity || token.jupiterData?.liquidity || 0)}
                  </td>

                      {/* Market Cap */}
                  <td className="px-2 py-2 text-right font-medium text-white text-xs">
                    {formatNumber(token.marketCap || token.jupiterData?.marketCap || token.jupiterData?.mcap || 0)}
                  </td>
                </tr>
            );
          })}
          </tbody>
        </table>
        </div>

      {/* Empty state */}
      {displayTokens.length === 0 && !loading && (
        <div className="flex items-center justify-center p-8">
          <div className="text-gray-400">No tokens available</div>
        </div>
      )}
    </div>
  );
};

export default TokenRankedList;
