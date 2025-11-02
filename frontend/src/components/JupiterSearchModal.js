import React from 'react';
import { X, Loader2 } from 'lucide-react';

const JupiterSearchModal = ({ 
  isOpen, 
  onClose, 
  searchTerm, 
  results = [], 
  isLoading, 
  onSelectToken 
}) => {
  if (!isOpen) return null;

  const formatNumber = (num) => {
    if (!num || num === 0) return '$0';
    if (num >= 1000000000) return `$${(num / 1000000000).toFixed(2)}B`;
    if (num >= 1000000) return `$${(num / 1000000).toFixed(2)}M`;
    if (num >= 1000) return `$${(num / 1000).toFixed(2)}K`;
    return `$${num.toFixed(2)}`;
  };

  const formatPrice = (price) => {
    const numPrice = typeof price === 'string' ? parseFloat(price) : price;
    if (!numPrice || numPrice === 0) return '$0.00';
    if (numPrice < 0.0001) return `$${numPrice.toExponential(2)}`;
    if (numPrice < 1) return `$${numPrice.toFixed(6)}`;
    return `$${numPrice.toFixed(2)}`;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-900 border border-gray-700 rounded-lg w-full max-w-4xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              🔍 Search Results
              {isLoading && <Loader2 className="w-5 h-5 animate-spin text-solana-purple" />}
            </h2>
            <p className="text-sm text-gray-400 mt-1">
              Searching for: <span className="text-white font-medium">{searchTerm}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-12 h-12 animate-spin text-solana-purple mb-4" />
              <p className="text-gray-400">Searching Jupiter API...</p>
            </div>
          ) : results.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <p className="text-gray-400 text-lg">No tokens found on Jupiter</p>
              <p className="text-gray-500 text-sm mt-2">Try a different search term</p>
            </div>
          ) : (
            <div className="space-y-2">
              {results.map((token, index) => (
                <button
                  key={token.address || token.mint || index}
                  onClick={() => onSelectToken(token)}
                  className="w-full bg-gray-800 hover:bg-gray-750 border border-gray-700 rounded-lg p-4 transition-colors text-left"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1">
                      {/* Token Icon */}
                      {token.logoURI ? (
                        <img
                          src={token.logoURI}
                          alt={token.symbol}
                          className="w-10 h-10 rounded-full"
                          onError={(e) => {
                            e.target.style.display = 'none';
                            e.target.nextSibling.style.display = 'flex';
                          }}
                        />
                      ) : null}
                      <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center" style={{ display: token.logoURI ? 'none' : 'flex' }}>
                        <span className="text-lg">{token.symbol?.charAt(0) || '?'}</span>
                      </div>

                      {/* Token Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-white">{token.symbol || 'Unknown'}</h3>
                          {token.name && (
                            <span className="text-gray-400 text-sm truncate">{token.name}</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 font-mono truncate">
                          {token.address || token.mint}
                        </p>
                      </div>

                      {/* Market Data */}
                      <div className="text-right flex-shrink-0 min-w-[200px]">
                        {token.extensions?.coingeckoId && (
                          <div className="text-sm font-medium text-solana-purple mb-1">
                            ✨ Verified
                          </div>
                        )}
                        <div className="space-y-0.5">
                          <div className="flex items-center justify-end gap-2">
                            {token.usdPrice || token.price ? (
                              <div className="text-white font-bold text-base">
                                {formatPrice(token.usdPrice || token.price)}
                              </div>
                            ) : (
                              <div className="text-gray-500 text-xs">Price: N/A</div>
                            )}
                            {token.priceChange?.['24h'] && (
                              <span className={`text-xs font-medium ${
                                token.priceChange['24h'] >= 0 ? 'text-green-400' : 'text-red-400'
                              }`}>
                                {token.priceChange['24h'] >= 0 ? '+' : ''}{token.priceChange['24h'].toFixed(2)}%
                              </span>
                            )}
                          </div>
                          <div className="text-gray-300 text-xs">
                            {token.marketCap || token.mcap ? formatNumber(token.marketCap || token.mcap) : 'Mkt Cap: N/A'}
                          </div>
                          <div className="text-gray-400 text-xs">
                            Liq: {token.liquidity ? formatNumber(token.liquidity) : 'N/A'}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-700 bg-gray-900">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-400">
              {results.length > 0 ? `${results.length} token${results.length > 1 ? 's' : ''} found` : 'Click a token to add it to the system'}
            </p>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-md transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default JupiterSearchModal;

