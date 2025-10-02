import React, { useState, useEffect, useCallback } from 'react';
import { Star, X, ExternalLink } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import watchlistService from '../services/watchlistService';

const WatchlistPanel = ({ isOpen, onClose, onTokenSelect, allTokensData = [] }) => {
  const { isAuthenticated } = useAuth();
  const [watchlist, setWatchlist] = useState([]);
  const [fullTokensData, setFullTokensData] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadFullTokenData = useCallback(async (symbols) => {
    try {
      // Use already-loaded token data from App.js instead of making API calls
      // Filter tokens that are in the watchlist
      const watchlistTokens = allTokensData.filter(token => 
        symbols.includes(token.symbol.toUpperCase())
      );
      
      // Find missing tokens that aren't in cache
      const missingSymbols = symbols.filter(s => !watchlistTokens.some(t => t.symbol.toUpperCase() === s));
      
      // If there are missing tokens, fetch them from API
      if (missingSymbols.length > 0) {
        const API_BASE = process.env.REACT_APP_API_BASE_URL || 'https://api.degen-oracle.com';
        
        for (const symbol of missingSymbols) {
          try {
            const url = `${API_BASE}/api/tokens?search=${encodeURIComponent(symbol)}`;
            const response = await fetch(url);
            const data = await response.json();
            
            // Handle both response formats: array directly or {tokens: [...]}
            const tokensArray = Array.isArray(data) ? data : (data.tokens || []);
            
            if (tokensArray.length > 0) {
              // Find exact symbol match (case-insensitive, trim whitespace)
              const matchedToken = tokensArray.find(t => 
                t.symbol && t.symbol.trim().toUpperCase() === symbol.trim().toUpperCase()
              );
              if (matchedToken) {
                watchlistTokens.push(matchedToken);
              }
            }
          } catch (fetchError) {
            console.error(`Failed to fetch ${symbol}:`, fetchError);
          }
        }
      }
      
      setFullTokensData(watchlistTokens);
    } catch (error) {
      console.error('Error loading watchlist tokens:', error);
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

  // Listen for watchlist updates from AI chat or other sources
  useEffect(() => {
    const handleWatchlistUpdate = (event) => {
      if (isAuthenticated) {
        // Add small delay to ensure backend has processed the update
        setTimeout(() => {
          loadWatchlist();
        }, 300); // 300ms delay to ensure backend processing
      }
    };

    window.addEventListener('watchlistUpdated', handleWatchlistUpdate);
    return () => {
      window.removeEventListener('watchlistUpdated', handleWatchlistUpdate);
    };
  }, [isAuthenticated, loadWatchlist, isOpen]);

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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
      <div className="bg-dark-card border border-gray-700 rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] sm:max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-3 sm:p-4 md:p-6 border-b border-gray-700 flex-shrink-0">
          <div className="flex items-center space-x-2 sm:space-x-3">
            <Star className="text-yellow-400 flex-shrink-0" size={20} fill="currentColor" />
            <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-white">My Watchlist</h2>
            <span className="bg-solana-purple px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap">
              {watchlist.length}
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors p-2 -mr-2 flex-shrink-0"
            aria-label="Close watchlist"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-3 sm:p-4 md:p-6 flex-1 overflow-y-auto">
          {!isAuthenticated ? (
            <div className="text-center py-8 sm:py-12">
              <Star className="mx-auto text-gray-500 mb-3 sm:mb-4" size={40} />
              <h3 className="text-lg sm:text-xl font-medium text-gray-400 mb-2">Login Required</h3>
              <p className="text-sm sm:text-base text-gray-500 px-4">Please login to view your watchlist</p>
            </div>
          ) : loading ? (
            <div className="text-center py-8 sm:py-12">
              <div className="w-8 h-8 border-2 border-solana-purple border-t-transparent rounded-full animate-spin mx-auto mb-3 sm:mb-4"></div>
              <p className="text-sm sm:text-base text-gray-400">Loading your watchlist...</p>
            </div>
          ) : watchlist.length === 0 ? (
            <div className="text-center py-8 sm:py-12">
              <Star className="mx-auto text-gray-500 mb-3 sm:mb-4" size={40} />
              <h3 className="text-lg sm:text-xl font-medium text-gray-400 mb-2">No Favorites Yet</h3>
              <p className="text-sm sm:text-base text-gray-500 px-4">Click the star button on any token to add it to your watchlist</p>
            </div>
          ) : fullTokensData.length === 0 ? (
            <div className="text-center py-8 sm:py-12">
              <div className="w-8 h-8 border-2 border-solana-purple border-t-transparent rounded-full animate-spin mx-auto mb-3 sm:mb-4"></div>
              <p className="text-sm sm:text-base text-gray-400">Loading token details...</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              {fullTokensData.map((token) => (
                <div
                  key={token.symbol}
                  className="bg-dark-bg border border-gray-700 rounded-lg p-3 sm:p-4 hover:border-solana-purple transition-colors cursor-pointer active:scale-98 flex-shrink-0"
                  onClick={() => {
                    // Pass the full token data
                    onTokenSelect(token);
                    onClose();
                  }}
                >
                  {/* Token Header */}
                  <div className="flex items-center justify-between mb-2 sm:mb-3">
                    <div className="flex items-center space-x-2 sm:space-x-3 min-w-0">
                      {/* Token Image or Fallback */}
                      {(token.image || token.jupiterData?.icon) ? (
                        <img 
                          src={token.jupiterData?.icon || token.image} 
                          alt={token.name}
                          className="w-8 h-8 sm:w-10 sm:h-10 rounded-full flex-shrink-0"
                          onError={(e) => {
                            e.target.style.display = 'none';
                            e.target.nextSibling.style.display = 'flex';
                          }}
                        />
                      ) : null}
                      <div className={`w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center flex-shrink-0 ${(token.image || token.jupiterData?.icon) ? 'hidden' : ''}`}>
                        <span className="text-white font-bold text-xs sm:text-sm">
                          {token.symbol.charAt(0)}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold text-white text-sm sm:text-base truncate">{token.symbol}</h3>
                        <p className="text-xs sm:text-sm text-gray-400 truncate">{token.name}</p>
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFromWatchlist(token.symbol);
                      }}
                      className="text-red-400 hover:text-red-300 transition-colors p-2 -mr-2 flex-shrink-0"
                      title="Remove from watchlist"
                      aria-label="Remove from watchlist"
                    >
                      <X size={16} />
                    </button>
                  </div>

                  {/* Real Token Stats */}
                  <div className="space-y-1.5 sm:space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-400">Market Cap</span>
                      <span className="text-xs sm:text-sm text-white font-medium">
                        ${((token.marketCap || 0) / 1000000).toFixed(1)}M
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-400">24h Change</span>
                      <span className={`text-xs sm:text-sm font-medium ${(token.priceChange24h || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {(token.priceChange24h || 0) >= 0 ? '+' : ''}{(token.priceChange24h || 0).toFixed(2)}%
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-400">Score</span>
                      <span className="text-xs sm:text-sm text-white font-medium">
                        {(token.score || token.overallScore || 0).toFixed(1)}/10
                      </span>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="mt-2 sm:mt-3 pt-2 sm:pt-3 border-t border-gray-700">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500">Tap to view</span>
                      <ExternalLink size={12} className="text-gray-400" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {isAuthenticated && fullTokensData.length > 0 && (
          <div className="p-3 sm:p-4 border-t border-gray-700 bg-dark-bg flex-shrink-0">
            <p className="text-center text-xs sm:text-sm text-gray-400">
              <span className="hidden sm:inline">Click on any token to view full details • </span>
              <span className="sm:hidden">Tap to view • </span>
              Total: {fullTokensData.length} coin{fullTokensData.length !== 1 ? 's' : ''}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default WatchlistPanel;