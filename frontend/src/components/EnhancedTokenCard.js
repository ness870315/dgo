import React, { useState } from 'react';
import { TrendingUp, TrendingDown, ExternalLink, Twitter, MessageCircle, Globe, BarChart3, Activity, DollarSign, Users, Clock } from 'lucide-react';

const EnhancedTokenCard = ({ token, onTokenSelect }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // Helper functions for formatting
  const formatNumber = (num) => {
    if (!num || isNaN(num)) return '0';
    if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
    if (num >= 1e3) return `$${(num / 1e3).toFixed(2)}K`;
    return `$${num.toFixed(2)}`;
  };

  const formatPercentage = (num) => {
    if (!num || isNaN(num)) return '0%';
    return `${num > 0 ? '+' : ''}${num.toFixed(2)}%`;
  };

  const formatVolume = (volume) => {
    if (!volume || isNaN(volume)) return '0';
    if (volume >= 1e9) return `$${(volume / 1e9).toFixed(2)}B`;
    if (volume >= 1e6) return `$${(volume / 1e6).toFixed(2)}M`;
    if (volume >= 1e3) return `$${(volume / 1e3).toFixed(2)}K`;
    return `$${volume.toFixed(2)}`;
  };

  const getPriceChangeColor = (change) => {
    if (!change || isNaN(change)) return 'text-gray-400';
    return change >= 0 ? 'text-green-500' : 'text-red-500';
  };

  const getBuyPressureColor = (pressure) => {
    if (pressure >= 0.6) return 'text-green-500';
    if (pressure >= 0.4) return 'text-yellow-500';
    return 'text-red-500';
  };

  const getBuyPressureLabel = (pressure) => {
    if (pressure >= 0.6) return 'Strong Buy';
    if (pressure >= 0.4) return 'Neutral';
    return 'Strong Sell';
  };

  return (
    <div className="bg-dark-card border border-gray-700 rounded-lg p-4 hover:border-solana-purple transition-all duration-200 cursor-pointer">
      {/* Header Section */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className="w-12 h-12 rounded-full overflow-hidden bg-gray-700 flex items-center justify-center">
            {token.image ? (
              <img 
                src={token.image} 
                alt={token.symbol} 
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.target.style.display = 'none';
                  e.target.nextSibling.style.display = 'flex';
                }}
              />
            ) : null}
            <div className="w-full h-full bg-gradient-to-br from-solana-purple to-purple-600 flex items-center justify-center text-white font-bold text-lg">
              {token.symbol?.charAt(0) || '?'}
            </div>
          </div>
          
          <div>
            <h3 className="text-white font-bold text-lg">{token.symbol}</h3>
            <p className="text-gray-400 text-sm">{token.name}</p>
            <div className="flex items-center space-x-2 mt-1">
              <span className="text-xs bg-blue-600 text-white px-2 py-1 rounded">{token.chainId}</span>
              <span className="text-xs bg-green-600 text-white px-2 py-1 rounded">{token.dexId}</span>
            </div>
          </div>
        </div>

        <div className="text-right">
          <div className="text-white font-bold text-xl">
            {formatNumber(token.currentPrice)}
          </div>
          <div className={`text-sm font-medium ${getPriceChangeColor(token.priceChange24h)}`}>
            {formatPercentage(token.priceChange24h)}
          </div>
        </div>
      </div>

      {/* Market Data Grid */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-gray-800 rounded-lg p-3">
          <div className="flex items-center space-x-2 mb-2">
            <DollarSign className="w-4 h-4 text-green-500" />
            <span className="text-gray-400 text-sm">Market Cap</span>
          </div>
          <div className="text-white font-semibold">{formatNumber(token.marketCap)}</div>
        </div>

        <div className="bg-gray-800 rounded-lg p-3">
          <div className="flex items-center space-x-2 mb-2">
            <BarChart3 className="w-4 h-4 text-blue-500" />
            <span className="text-gray-400 text-sm">24h Volume</span>
          </div>
          <div className="text-white font-semibold">{formatVolume(token.volume24h)}</div>
        </div>

        <div className="bg-gray-800 rounded-lg p-3">
          <div className="flex items-center space-x-2 mb-2">
            <Users className="w-4 h-4 text-purple-500" />
            <span className="text-gray-400 text-sm">Buy Pressure</span>
          </div>
          <div className={`font-semibold ${getBuyPressureColor(token.buyPressure)}`}>
            {getBuyPressureLabel(token.buyPressure)}
          </div>
          <div className="text-gray-400 text-xs">
            {(token.buyPressure * 100).toFixed(1)}% buys
          </div>
        </div>

        <div className="bg-gray-800 rounded-lg p-3">
          <div className="flex items-center space-x-2 mb-2">
            <Activity className="w-4 h-4 text-orange-500" />
            <span className="text-gray-400 text-sm">Activity</span>
          </div>
          <div className="text-white font-semibold">
            {token.transactions24h?.buys + token.transactions24h?.sells || 0}
          </div>
          <div className="text-gray-400 text-xs">24h txns</div>
        </div>
      </div>

      {/* Price Changes Timeline */}
      <div className="mb-4">
        <h4 className="text-white font-semibold mb-3 flex items-center">
          <Clock className="w-4 h-4 mr-2" />
          Price Changes
        </h4>
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: '5m', value: token.priceChange5m },
            { label: '1h', value: token.priceChange1h },
            { label: '6h', value: token.priceChange6h },
            { label: '24h', value: token.priceChange24h }
          ].map((change, index) => (
            <div key={index} className="text-center">
              <div className="text-gray-400 text-xs">{change.label}</div>
              <div className={`text-sm font-medium ${getPriceChangeColor(change.value)}`}>
                {formatPercentage(change.value)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Volume Timeline */}
      <div className="mb-4">
        <h4 className="text-white font-semibold mb-3 flex items-center">
          <BarChart3 className="w-4 h-4 mr-2" />
          Volume Timeline
        </h4>
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: '1h', value: token.volume1h },
            { label: '6h', value: token.volume6h },
            { label: '24h', value: token.volume24h }
          ].map((volume, index) => (
            <div key={index} className="text-center">
              <div className="text-gray-400 text-xs">{volume.label}</div>
              <div className="text-white text-sm font-medium">
                {formatVolume(volume.value)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Transaction Data */}
      <div className="mb-4">
        <h4 className="text-white font-semibold mb-3 flex items-center">
          <Activity className="w-4 h-4 mr-2" />
          Transaction Activity
        </h4>
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: '5m', data: token.transactions5m },
            { label: '1h', data: token.transactions1h },
            { label: '6h', data: token.transactions6h },
            { label: '24h', data: token.transactions24h }
          ].map((period, index) => (
            <div key={index} className="text-center">
              <div className="text-gray-400 text-xs">{period.label}</div>
              <div className="text-green-500 text-xs">
                +{period.data?.buys || 0}
              </div>
              <div className="text-red-500 text-xs">
                -{period.data?.sells || 0}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Social Links */}
      {(token.socialLinks?.twitter || token.socialLinks?.telegram || token.socialLinks?.website) && (
        <div className="mb-4">
          <h4 className="text-white font-semibold mb-3 flex items-center">
            <Globe className="w-4 h-4 mr-2" />
            Links
          </h4>
          <div className="flex space-x-2">
            {token.socialLinks?.twitter && (
              <a
                href={token.socialLinks.twitter}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-blue-600 hover:bg-blue-700 text-white p-2 rounded-lg transition-colors"
                title="Twitter"
              >
                <Twitter className="w-4 h-4" />
              </a>
            )}
            {token.socialLinks?.telegram && (
              <a
                href={token.socialLinks.telegram}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-blue-500 hover:bg-blue-600 text-white p-2 rounded-lg transition-colors"
                title="Telegram"
              >
                <MessageCircle className="w-4 h-4" />
              </a>
            )}
            {token.socialLinks?.website && (
              <a
                href={token.socialLinks.website}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-gray-600 hover:bg-gray-700 text-white p-2 rounded-lg transition-colors"
                title="Website"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
          </div>
        </div>
      )}

      {/* Additional Metrics */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-gray-800 rounded-lg p-3">
          <div className="text-gray-400 text-xs mb-1">Liquidity</div>
          <div className="text-white font-semibold">{formatNumber(token.liquidity?.usd)}</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-3">
          <div className="text-gray-400 text-xs mb-1">FDV</div>
          <div className="text-white font-semibold">{formatNumber(token.fdv)}</div>
        </div>
      </div>

      {/* Expandable Details */}
      <div className="border-t border-gray-700 pt-4">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full text-center text-gray-400 hover:text-white transition-colors"
        >
          {isExpanded ? 'Show Less' : 'Show More Details'}
        </button>
        
        {isExpanded && (
          <div className="mt-4 space-y-3">
            <div className="text-xs text-gray-500">
              <div>Contract: {token.contractAddress?.substring(0, 8)}...</div>
              <div>Pair: {token.pairAddress?.substring(0, 8)}...</div>
              <div>Source: {token.dataSource}</div>
              <div>Last Updated: {new Date(token.lastUpdated).toLocaleString()}</div>
            </div>
            
            {token.boosts > 0 && (
              <div className="bg-yellow-600 bg-opacity-20 border border-yellow-600 rounded-lg p-2">
                <div className="text-yellow-400 text-sm font-medium">
                  🚀 {token.boosts} Active Boosts
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default EnhancedTokenCard;




