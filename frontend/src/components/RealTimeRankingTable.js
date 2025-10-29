import React, { useState, useEffect } from 'react';
import websocketService from '../services/websocketService';

const RealTimeRankingTable = ({ onTokenSelect }) => {
  const [rankings, setRankings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
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

  // Fetch initial data
  const fetchRankings = async () => {
    try {
      setLoading(true);
      const API_BASE = process.env.REACT_APP_API_BASE_URL || 'https://api.degen-oracle.com';
      const response = await fetch(`${API_BASE}/api/tokens/ranking/realtime`);
      const data = await response.json();
      
      if (data.success) {
        setRankings(data.data);
        setLastUpdate(new Date());
        setError(null);
      } else {
        setError(data.error || 'Failed to fetch rankings');
      }
    } catch (err) {
      console.error('Error fetching rankings:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Subscribe to WebSocket updates
  useEffect(() => {
    // Initial fetch
    fetchRankings();

    // Set up polling (every 10 seconds)
    const pollInterval = setInterval(fetchRankings, 10000);

    // Subscribe to WebSocket updates
    const handleRankingUpdate = (data) => {
      console.log('📊 [RankingTable] Received ranking update:', data);
      if (data.rankings) {
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

  if (loading && rankings.length === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-gray-400">Loading real-time rankings...</div>
      </div>
    );
  }

  if (error && rankings.length === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-red-400">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="w-full overflow-x-auto">
      {/* Header with last update time */}
      <div className="flex items-center justify-between mb-4 px-4">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          📊 Real-Time Rankings
          <span className="text-xs text-green-400">📡 Live</span>
        </h2>
        {lastUpdate && (
          <div className="text-xs text-gray-400">
            Last update: {lastUpdate.toLocaleTimeString()}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-gray-400 uppercase bg-gray-800/50 sticky top-0">
            <tr>
              <th className="px-4 py-3">#</th>
              <th className="px-4 py-3">Token</th>
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
            {rankings.map((token, index) => (
              <tr
                key={token.address}
                className="border-b border-gray-700 hover:bg-gray-800/30 cursor-pointer transition-colors"
                onClick={() => onTokenSelect && onTokenSelect(token)}
              >
                {/* Rank */}
                <td className="px-4 py-3 font-medium text-gray-300">
                  #{index + 1}
                </td>

                {/* Token */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div>
                      <div className="font-bold text-white flex items-center gap-1">
                        {token.symbol}
                        {token.isLive && (
                          <span className="text-xs text-green-400">📡</span>
                        )}
                      </div>
                      <div className="text-xs text-gray-400">{token.name}</div>
                    </div>
                  </div>
                </td>

                {/* Price */}
                <td className="px-4 py-3 text-right font-mono text-white">
                  {formatPrice(token.price)}
                </td>

                {/* Age */}
                <td className="px-4 py-3 text-center text-gray-300">
                  {token.age}
                </td>

                {/* Txns */}
                <td className="px-4 py-3 text-right text-gray-300">
                  {token.txns24h.toLocaleString()}
                </td>

                {/* Volume */}
                <td className="px-4 py-3 text-right font-medium text-white">
                  {formatNumber(token.volume24h)}
                </td>

                {/* Makers */}
                <td className="px-4 py-3 text-right text-gray-300">
                  {token.makers24h.toLocaleString()}
                </td>

                {/* 5M Change */}
                <td className={`px-4 py-3 text-right font-medium ${
                  token.priceChange5m >= 0 ? 'text-green-400' : 'text-red-400'
                }`}>
                  {formatPercentage(token.priceChange5m)}
                </td>

                {/* 1H Change */}
                <td className={`px-4 py-3 text-right font-medium ${
                  token.priceChange1h >= 0 ? 'text-green-400' : 'text-red-400'
                }`}>
                  {formatPercentage(token.priceChange1h)}
                </td>

                {/* 6H Change */}
                <td className={`px-4 py-3 text-right font-medium ${
                  token.priceChange6h >= 0 ? 'text-green-400' : 'text-red-400'
                }`}>
                  {formatPercentage(token.priceChange6h)}
                </td>

                {/* 24H Change */}
                <td className={`px-4 py-3 text-right font-medium ${
                  token.priceChange24h >= 0 ? 'text-green-400' : 'text-red-400'
                }`}>
                  {formatPercentage(token.priceChange24h)}
                </td>

                {/* Liquidity */}
                <td className="px-4 py-3 text-right text-gray-300">
                  {formatNumber(token.liquidity)}
                </td>

                {/* Market Cap */}
                <td className="px-4 py-3 text-right font-medium text-white">
                  {formatNumber(token.marketCap)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Empty state */}
      {rankings.length === 0 && !loading && (
        <div className="flex items-center justify-center p-8">
          <div className="text-gray-400">No tokens currently being monitored</div>
        </div>
      )}
    </div>
  );
};

export default RealTimeRankingTable;

