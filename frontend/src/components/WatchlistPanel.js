import React, { useState, useEffect, useCallback } from 'react';
import { Star, X, ExternalLink } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import watchlistService from '../services/watchlistService';

const WatchlistPanel = ({ isOpen, onClose, onTokenSelect, allTokensData = [] }) => {
  const { isAuthenticated } = useAuth();
  const [watchlist, setWatchlist] = useState([]);
  const [fullTokensData, setFullTokensData] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadFullTokenData = useCallback((symbols) => {
    try {
      // Use already-loaded token data from App.js instead of making API calls
      // Filter tokens that are in the watchlist
      const watchlistTokens = allTokensData.filter(token => 
        symbols.includes(token.symbol.toUpperCase())
      );
      
      console.log(`📋 Watchlist: Found ${watchlistTokens.length} tokens from cache (no API calls made)`);
      setFullTokensData(watchlistTokens);
    } catch (error) {
      console.error('Error filtering watchlist tokens from cache:', error);
      setFullTokensData([]);
    }
  }, [allTokensData]);

  const loadWatchlist = useCallback(async () => {
    setLoading(true);
    try {
      const data = await watchlistService.getWatchlist();
      // Normalize to array of UPPERCASE symbols regardless of backend shape
      const symbols = (Array.isArray(data) ? data : [])
        .map(item => typeof item === 'string' ? item.toUpperCase() : (item?.symbol || '').toUpperCase())
        .filter(Boolean);
      setWatchlist(symbols);
      
      // Get full token data for each symbol in watchlist from already-loaded cache
      if (symbols.length > 0) {
        loadFullTokenData(symbols);
      } else {
        setFullTokensData([]);
      }
    } catch (error) {
      console.error('Error loading watchlist:', error);
      setWatchlist([]);
      setFullTokensData([]);
    }
    setLoading(false);
  }, [loadFullTokenData]);

  useEffect(() => {
    if (isOpen && isAuthenticated) {
      loadWatchlist();
    }
  }, [isOpen, isAuthenticated, loadWatchlist]);

  // Update watchlist token data when main app token data changes
  useEffect(() => {
    if (watchlist.length > 0 && allTokensData.length > 0) {
      loadFullTokenData(watchlist);
    }
  }, [allTokensData, watchlist, loadFullTokenData]);

  const removeFromWatchlist = async (symbol) => {
    try {
      await watchlistService.removeFromWatchlist(symbol);
      // Reload watchlist
      loadWatchlist();
    } catch (error) {
      console.error('Error removing from watchlist:', error);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-dark-card border border-gray-700 rounded-xl shadow-2xl max-w-4xl w-full max-h-[80vh] mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <div className="flex items-center space-x-3">
            <Star className="text-yellow-400" size={24} fill="currentColor" />
            <h2 className="text-2xl font-bold text-white">My Watchlist</h2>
            <span className="bg-solana-purple px-2 py-1 rounded-full text-xs font-medium">
              {watchlist.length} coins
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {!isAuthenticated ? (
            <div className="text-center py-12">
              <Star className="mx-auto text-gray-500 mb-4" size={48} />
              <h3 className="text-xl font-medium text-gray-400 mb-2">Login Required</h3>
              <p className="text-gray-500">Please login to view your watchlist</p>
            </div>
          ) : loading ? (
            <div className="text-center py-12">
              <div className="w-8 h-8 border-2 border-solana-purple border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-gray-400">Loading your watchlist...</p>
            </div>
          ) : watchlist.length === 0 ? (
            <div className="text-center py-12">
              <Star className="mx-auto text-gray-500 mb-4" size={48} />
              <h3 className="text-xl font-medium text-gray-400 mb-2">No Favorites Yet</h3>
              <p className="text-gray-500">Click the star button on any token to add it to your watchlist</p>
            </div>
          ) : fullTokensData.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-8 h-8 border-2 border-solana-purple border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-gray-400">Loading token details...</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-96 overflow-y-auto">
              {fullTokensData.map((token) => (
                <div
                  key={token.symbol}
                  className="bg-dark-bg border border-gray-700 rounded-lg p-4 hover:border-solana-purple transition-colors cursor-pointer"
                  onClick={() => {
                    // Pass the full token data
                    onTokenSelect(token);
                    onClose();
                  }}
                >
                  {/* Token Header */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-3">
                      {/* Token Image or Fallback */}
                      {(token.image || token.jupiterData?.icon) ? (
                        <img 
                          src={token.jupiterData?.icon || token.image} 
                          alt={token.name}
                          className="w-10 h-10 rounded-full"
                          onError={(e) => {
                            e.target.style.display = 'none';
                            e.target.nextSibling.style.display = 'flex';
                          }}
                        />
                      ) : null}
                      <div className={`w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center ${(token.image || token.jupiterData?.icon) ? 'hidden' : ''}`}>
                        <span className="text-white font-bold text-sm">
                          {token.symbol.charAt(0)}
                        </span>
                      </div>
                      <div>
                        <h3 className="font-semibold text-white">{token.symbol}</h3>
                        <p className="text-sm text-gray-400">{token.name}</p>
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFromWatchlist(token.symbol);
                      }}
                      className="text-red-400 hover:text-red-300 transition-colors p-1"
                      title="Remove from watchlist"
                    >
                      <X size={16} />
                    </button>
                  </div>

                  {/* Real Token Stats */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-400">Market Cap</span>
                      <span className="text-sm text-white font-medium">
                        ${((token.marketCap || 0) / 1000000).toFixed(1)}M
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-400">24h Change</span>
                      <span className={`text-sm font-medium ${(token.priceChange24h || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {(token.priceChange24h || 0) >= 0 ? '+' : ''}{(token.priceChange24h || 0).toFixed(2)}%
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-400">Score</span>
                      <span className="text-sm text-white font-medium">
                        {(token.score || token.overallScore || 0).toFixed(1)}/10
                      </span>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="mt-3 pt-3 border-t border-gray-700">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500">In watchlist</span>
                      <ExternalLink size={14} className="text-gray-400" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {isAuthenticated && fullTokensData.length > 0 && (
          <div className="p-4 border-t border-gray-700 bg-dark-bg">
            <p className="text-center text-sm text-gray-400">
              Click on any token to view full details • Total: {fullTokensData.length} coins
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default WatchlistPanel;