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
        // Use real-time data
        setRankings(data.data);
        setLastUpdate(new Date());
      } else {
        // Fallback to provided tokens
        console.log('Using fallback tokens from props');
        setRankings(tokens);
      }
    } catch (err) {
      console.error('Error fetching rankings:', err);
      // Fallback to provided tokens
      setRankings(tokens);
    } finally {
      setLoading(false);
    }
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
      {/* Header */}
      <div className="sticky top-0 bg-gray-900 z-10 px-4 py-3 border-b border-gray-700">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            📊 Token Rankings
            {rankings.length > 0 && rankings[0].isLive && (
              <span className="text-xs text-green-400">📡 Live</span>
            )}
          </h2>
          {lastUpdate && (
            <div className="text-xs text-gray-400">
              Updated: {lastUpdate.toLocaleTimeString()}
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-gray-400 uppercase bg-gray-800/50 sticky top-[57px] z-10">
            <tr>
              <th className="px-4 py-3 text-left">#</th>
              <th className="px-4 py-3 text-left">Token</th>
              <th className="px-4 py-3 text-right">Price</th>
              <th className="px-4 py-3 text-center">Age</th>
              <th className="px-4 py-3 text-right">Txns</th>
              <th className="px-4 py-3 text-right">Volume</th>
              <th className="px-4 py-3 text-right">Makers</th>
              <th className="px-4 py-3 text-right">5M</th>
              <th className="px-4 py-3 text-right">1H</th>
              <th className="px-4 py-3 text-right">6H</th>
              <th className="px-4 py-3 text-right">24H</th>
              <th className="px-4 py-3 text-right">Liquidity</th>
              <th className="px-4 py-3 text-right">MCap</th>
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
                  <td className="px-4 py-3 font-medium text-gray-300">
                    #{index + 1}
                  </td>

                  {/* Token */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {/* Token icons */}
                      <div className="flex items-center -space-x-2">
                        {token.jupiterData?.icon || token.logo ? (
                          <img 
                            src={token.jupiterData?.icon || token.logo} 
                            alt={token.symbol}
                            className="w-6 h-6 rounded-full border-2 border-gray-900"
                            onError={(e) => e.target.style.display = 'none'}
                          />
                        ) : null}
                      </div>
                      
                      <div>
                        <div className="font-bold text-white flex items-center gap-1">
                          {token.symbol}
                          {token.isLive && (
                            <span className="text-xs text-green-400">📡</span>
                          )}
                          {fuelInfo.isFueled && (
                            <div className="flex items-center space-x-1 px-1 py-0.5 bg-orange-900 border border-orange-500 rounded-full">
                              <Flame className="w-2 h-2 text-orange-400" />
                              <span className="text-orange-400 text-xs font-bold">
                                {fuelInfo.multiplier}
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="text-xs text-gray-400">{token.name}</div>
                      </div>
                    </div>
                  </td>

                  {/* Price */}
                  <td className="px-4 py-3 text-right font-mono text-white">
                    {formatPrice(token.price || token.jupiterData?.price)}
                  </td>

                  {/* Age */}
                  <td className="px-4 py-3 text-center text-gray-300">
                    {token.age || 'N/A'}
                  </td>

                  {/* Txns */}
                  <td className="px-4 py-3 text-right text-gray-300">
                    {token.txns24h ? token.txns24h.toLocaleString() : '0'}
                  </td>

                  {/* Volume */}
                  <td className="px-4 py-3 text-right font-medium text-white">
                    {formatNumber(token.volume24h || 0)}
                  </td>

                  {/* Makers */}
                  <td className="px-4 py-3 text-right text-gray-300">
                    {token.makers24h ? token.makers24h.toLocaleString() : '0'}
                  </td>

                  {/* 5M Change */}
                  <td className={`px-4 py-3 text-right font-medium ${
                    (token.priceChange5m || 0) >= 0 ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {formatPercentage(token.priceChange5m || 0)}
                  </td>

                  {/* 1H Change */}
                  <td className={`px-4 py-3 text-right font-medium ${
                    (token.priceChange1h || 0) >= 0 ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {formatPercentage(token.priceChange1h || 0)}
                  </td>

                  {/* 6H Change */}
                  <td className={`px-4 py-3 text-right font-medium ${
                    (token.priceChange6h || 0) >= 0 ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {formatPercentage(token.priceChange6h || 0)}
                  </td>

                  {/* 24H Change */}
                  <td className={`px-4 py-3 text-right font-medium ${
                    (token.priceChange24h || 0) >= 0 ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {formatPercentage(token.priceChange24h || 0)}
                  </td>

                  {/* Liquidity */}
                  <td className="px-4 py-3 text-right text-gray-300">
                    {formatNumber(token.liquidity || token.jupiterData?.liquidity || 0)}
                  </td>

                  {/* Market Cap */}
                  <td className="px-4 py-3 text-right font-medium text-white">
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
