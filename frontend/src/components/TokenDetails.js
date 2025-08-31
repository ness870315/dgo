import React, { useState, useEffect } from 'react';
import { X, Twitter, MessageCircle, ExternalLink, Star } from 'lucide-react';

const TokenDetails = ({ token, onClose }) => {
  const [isInWatchlist, setIsInWatchlist] = useState(false);

  useEffect(() => {
    // Check if token is in watchlist on component mount
    const checkWatchlistStatus = () => {
      const watchlist = JSON.parse(localStorage.getItem('watchlist') || '[]');
      setIsInWatchlist(watchlist.some(item => item.symbol === token?.symbol));
    };

    checkWatchlistStatus();
  }, [token]);

  const toggleWatchlist = () => {
    const watchlist = JSON.parse(localStorage.getItem('watchlist') || '[]');
    let newWatchlist;

    if (isInWatchlist) {
      newWatchlist = watchlist.filter(item => item.symbol !== token?.symbol);
    } else {
      newWatchlist = [...watchlist, {
        symbol: token?.symbol,
        name: token?.name,
        image: token?.image,
        contractAddress: token?.contractAddress
      }];
    }

    localStorage.setItem('watchlist', JSON.stringify(newWatchlist));
    setIsInWatchlist(!isInWatchlist);
  };

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

  const formatPrice = (price) => {
    if (!price || isNaN(price)) return 'N/A';
    if (price < 0.000001) return price.toExponential(4);
    if (price < 0.01) return price.toFixed(6);
    if (price < 1) return price.toFixed(4);
    return price.toFixed(2);
  };



  const getRiskLevel = (score) => {
    if (!score || score >= 8) return { level: 'Low Risk', icon: '🟢', color: 'text-green-400' };
    if (score >= 6) return { level: 'Medium Risk', icon: '🟡', color: 'text-yellow-400' };
    if (score >= 4) return { level: 'High Risk', icon: '🟠', color: 'text-orange-400' };
    return { level: 'Very High Risk', icon: '🔴', color: 'text-red-400' };
  };

  const sentimentEmoji = getSentimentEmoji(token?.sentimentScore || 5);
  const riskLevel = getRiskLevel(token?.score || token?.overallScore || 0);

  function getSentimentEmoji(score) {
    if (score >= 8) return '😊';
    if (score >= 6) return '😐';
    if (score >= 4) return '😟';
    return '😢';
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-2">
      <div className="bg-dark-bg border border-gray-700 rounded-xl max-w-4xl w-full max-h-[80vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-dark-bg border-b border-gray-700 p-3 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            {token?.image && (
              <img src={token.image} alt={token.name} className="w-16 h-16 rounded-full border-2 border-blue-500" />
            )}
            <div>
              <h2 className="text-xl font-bold text-white">{token?.name || 'Unknown Token'}</h2>
              <p className="text-gray-400">${token?.symbol || 'UNKNOWN'}</p>
              <div className="flex items-center space-x-2 mt-1">
                <code className="text-xs text-gray-500 font-mono">
                  {token?.contractAddress ? 
                    `${token.contractAddress.slice(0, 8)}...${token.contractAddress.slice(-6)}` : 
                    'No Contract Address'
                  }
                </code>
                {token?.contractAddress && (
                  <button
                    onClick={(event) => {
                      navigator.clipboard.writeText(token.contractAddress);
                      const button = event.target;
                      const originalText = button.innerHTML;
                      button.innerHTML = '✅';
                      setTimeout(() => {
                        button.innerHTML = originalText;
                      }, 2000);
                    }}
                    className="text-gray-500 hover:text-gray-300 transition-colors text-xs"
                    title="Copy contract address"
                  >
                    📋
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {/* Watchlist Star */}
            <button
              onClick={toggleWatchlist}
              className={`p-2 rounded-lg transition-all duration-200 ${
                isInWatchlist
                  ? 'text-yellow-400 bg-yellow-400/10 hover:bg-yellow-400/20'
                  : 'text-gray-400 hover:text-yellow-400 hover:bg-yellow-400/10'
              }`}
              title={isInWatchlist ? 'Remove from watchlist' : 'Add to watchlist'}
            >
              <Star
                size={20}
                fill={isInWatchlist ? 'currentColor' : 'none'}
              />
            </button>

            {/* Close Button */}
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-white transition-colors"
              title="Close"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-3 space-y-4">
          {/* ⭐ Section 1 – Performance Overview */}
          <div className="bg-gray-800 rounded-lg p-3 border border-gray-600">
            <h3 className="text-lg font-bold mb-3 text-white flex items-center">
              ⭐ Performance Overview
            </h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left Section - Market Data (2x2 Square Grid) */}
              <div className="grid grid-cols-2 gap-3">
                {/* Market Cap - Blue Gradient */}
                <div className="flex flex-col items-center justify-center p-4 bg-gradient-to-br from-blue-600/20 to-cyan-600/20 rounded border border-blue-500/30 aspect-square relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-blue-600/5 to-transparent"></div>
                  <span className="text-blue-200 text-sm mb-1 relative z-10">🏦 Market Cap</span>
                  <span className="text-white font-bold text-base text-center relative z-10">
                    ${formatNumber(token?.jupiterData?.marketCap || token?.marketCap)}
                  </span>
                  <div className="flex items-center mt-1 relative z-10">
                    <span className={`text-xs font-medium ${
                      (token?.jupiterData?.stats24h?.marketCapChange || 0) >= 0 ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {(token?.jupiterData?.stats24h?.marketCapChange || 0) >= 0 ? '↗' : '↘'} 
                      {formatPercentage(token?.jupiterData?.stats24h?.marketCapChange || 0)}
                    </span>
                  </div>
                </div>

                {/* Price - Green Gradient */}
                <div className="flex flex-col items-center justify-center p-4 bg-gradient-to-br from-green-600/20 to-emerald-600/20 rounded border border-green-500/30 aspect-square relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-green-600/5 to-transparent"></div>
                  <span className="text-green-200 text-sm mb-1 relative z-10">📈 Price</span>
                  <span className="text-white font-bold text-base text-center relative z-10">
                    ${formatPrice(token?.jupiterData?.usdPrice || token?.price)}
                  </span>
                  <div className="flex items-center mt-1 relative z-10">
                    <span className={`text-xs font-medium ${
                      (token?.jupiterData?.stats24h?.priceChangePercentage || 0) >= 0 ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {(token?.jupiterData?.stats24h?.priceChangePercentage || 0) >= 0 ? '↗' : '↘'} 
                      {formatPercentage(token?.jupiterData?.stats24h?.priceChangePercentage || 0)}
                    </span>
                  </div>
                </div>

                {/* Liquidity - Purple Gradient */}
                <div className="flex flex-col items-center justify-center p-4 bg-gradient-to-br from-purple-600/20 to-violet-600/20 rounded border border-purple-500/30 aspect-square relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-purple-600/5 to-transparent"></div>
                  <span className="text-purple-200 text-sm mb-1 relative z-10">💰 Liquidity</span>
                  <span className="text-white font-bold text-base text-center relative z-10">
                    ${formatNumber(token?.jupiterData?.liquidity)}
                  </span>
                  <div className="flex items-center mt-1 relative z-10">
                    <span className={`text-xs font-medium ${
                      (token?.jupiterData?.stats24h?.liquidityChange || 0) >= 0 ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {(token?.jupiterData?.stats24h?.liquidityChange || 0) >= 0 ? '↗' : '↘'} 
                      {formatPercentage(token?.jupiterData?.stats24h?.liquidityChange || 0)}
                    </span>
                  </div>
                </div>

                {/* Holders - Orange Gradient */}
                <div className="flex flex-col items-center justify-center p-4 bg-gradient-to-br from-orange-600/20 to-amber-600/20 rounded border border-orange-500/30 aspect-square relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-orange-600/5 to-transparent"></div>
                  <span className="text-orange-200 text-sm mb-1 relative z-10">👥 Holders</span>
                  <span className="text-white font-bold text-base text-center relative z-10">
                    {formatNumber(token?.jupiterData?.holderCount)}
                  </span>
                  <div className="flex items-center mt-1 relative z-10">
                    <span className={`text-xs font-medium ${
                      (token?.jupiterData?.stats24h?.holderChange || 0) >= 0 ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {(token?.jupiterData?.stats24h?.holderChange || 0) >= 0 ? '↗' : '↘'} 
                      {formatPercentage(token?.jupiterData?.stats24h?.holderChange || 0)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Right Section - Scores & Social (2x2 Grid) */}
              <div className="grid grid-cols-2 gap-3">
                {/* Overall Score - Takes up 2 squares (spans both columns) - TOP POSITION */}
                <div className="col-span-2 flex flex-col items-center justify-center p-4 bg-gradient-to-br from-blue-600/20 to-purple-600/20 rounded border border-blue-500/30 aspect-[2/1]">
                  <span className="text-blue-300 text-sm mb-2">📊 Overall Score</span>
                  <span className="text-white font-bold text-3xl">
                    {(token?.score || token?.overallScore || 0).toFixed(1)}/10
                  </span>
                </div>
                <div className="flex flex-col items-center justify-center p-3 bg-dark-bg rounded border border-gray-700 aspect-square">
                  <div className="flex items-center space-x-1 mb-2">
                    <svg className="w-3 h-3 text-blue-400" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z"/>
                    </svg>
                    <span className="text-gray-400 text-xs">Mentions</span>
                  </div>
                  <div className="text-center">
                    <span className="text-white font-semibold text-sm block">
                      {formatNumber(token?.mentions || 0)}
                    </span>
                    <span className={`text-xs font-medium ${
                      (token?.mentionsChange24h || 0) >= 0 ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {(token?.mentionsChange24h || 0) >= 0 ? '↗' : '↘'} {formatPercentage(token?.mentionsChange24h || 0)}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col items-center justify-center p-3 bg-dark-bg rounded border border-gray-700 aspect-square">
                  <span className="text-gray-400 text-xs mb-2">🏆 Community</span>
                  <span className="text-white font-semibold text-sm">
                    {(token?.communityScore || 0).toFixed(1)}/10
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* 🔍 Section 2 – Insights (Market Data) */}
          <div className="bg-gray-800 rounded-lg p-3 border border-gray-600">
            <h3 className="text-lg font-bold mb-3 text-white flex items-center">
              🔍 Insights (Market Data)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between p-2 bg-dark-bg rounded border border-gray-700">
                  <span className="text-gray-400 text-sm">💎 FDV:</span>
                  <span className="text-white font-semibold text-sm">
                    ${formatNumber(token?.jupiterData?.fdv)}
                  </span>
                </div>
                <div className="flex items-center justify-between p-2 bg-dark-bg rounded border border-gray-700">
                  <span className="text-gray-400 text-sm">📊 Volume (24h):</span>
                  <span className="text-white font-semibold text-sm">
                    ${formatNumber(token?.jupiterData?.volume24h)}
                  </span>
                </div>
                <div className="flex items-center justify-between p-2 bg-dark-bg rounded border border-gray-700">
                  <span className="text-gray-400 text-sm">🔄 Price Change (1h):</span>
                  <span className={`font-semibold text-sm ${
                    (token?.jupiterData?.stats1h?.priceChangePercentage || 0) >= 0 ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {formatPercentage(token?.jupiterData?.stats1h?.priceChangePercentage)}
                  </span>
                </div>
                <div className="flex items-center justify-between p-2 bg-dark-bg rounded border border-gray-700">
                  <span className="text-gray-400 text-sm">📈 Price Change (24h):</span>
                  <span className={`font-semibold text-sm ${
                    (token?.jupiterData?.stats24h?.priceChangePercentage || 0) >= 0 ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {formatPercentage(token?.jupiterData?.stats24h?.priceChangePercentage)}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between p-2 bg-dark-bg rounded border border-gray-700">
                  <span className="text-gray-400 text-sm">🎯 Organic Score:</span>
                  <span className="text-white font-semibold text-sm">
                    {(token?.jupiterData?.organicScore || 0).toFixed(1)}/10
                  </span>
                </div>
                <div className="flex items-center justify-between p-2 bg-dark-bg rounded border border-gray-700">
                  <span className="text-gray-400 text-sm">💰 Total Supply:</span>
                  <span className="text-white font-semibold text-sm">
                    {formatNumber(token?.jupiterData?.totalSupply)}
                  </span>
                </div>
                <div className="flex items-center justify-between p-2 bg-dark-bg rounded border border-gray-700">
                  <span className="text-gray-400 text-sm">🔄 Circulating Supply:</span>
                  <span className="text-white font-semibold text-sm">
                    {formatNumber(token?.jupiterData?.circSupply)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* 🛡️ Section 3 – Audit Information */}
          {token?.jupiterData?.audit && (
            <div className="bg-gray-800 rounded-lg p-3 border border-gray-600">
              <h3 className="text-lg font-bold mb-3 text-white flex items-center">
                🛡️ Audit Information
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-2 bg-dark-bg rounded border border-gray-700">
                    <span className="text-gray-400 text-sm">👨‍💻 Dev Balance %:</span>
                    <span className="text-white font-semibold text-sm">
                      {((token.jupiterData.audit.devBalancePercentage || 0) * 100).toFixed(2)}%
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-2 bg-dark-bg rounded border border-gray-700">
                    <span className="text-gray-400 text-sm">🏆 Top Holders %:</span>
                    <span className="text-white font-semibold text-sm">
                      {(token.jupiterData.audit.topHoldersPercentage || 0).toFixed(2)}%
                    </span>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-2 bg-dark-bg rounded border border-gray-700">
                    <span className="text-gray-400 text-sm">📅 Creation Date:</span>
                    <span className="text-white font-semibold text-sm">
                      {token.jupiterData.audit.creationDate ? 
                        new Date(token.jupiterData.audit.creationDate).toLocaleDateString() : 
                        token.jupiterData.firstPool ? 
                        new Date(token.jupiterData.firstPool).toLocaleDateString() : 
                        'N/A'
                      }
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-2 bg-dark-bg rounded border border-gray-700">
                    <span className="text-gray-400 text-sm">🚀 Launchpad:</span>
                    <span className="text-white font-semibold text-sm">
                      {token.jupiterData.launchpad || token.jupiterData.audit?.launchpad || 'N/A'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 📈 Section 4 – Detailed Stats Timeline */}
          {(token?.jupiterData?.stats1h || token?.jupiterData?.stats6h || token?.jupiterData?.stats24h) && (
            <div className="bg-gray-800 rounded-lg p-3 border border-gray-600">
              <h3 className="text-lg font-bold mb-3 text-white flex items-center">
                📈 Detailed Stats Timeline
              </h3>
              
              {/* 1 Hour Stats */}
              {token?.jupiterData?.stats1h && (
                <div className="mb-4">
                  <h4 className="text-md font-semibold text-blue-400 mb-2">⏰ 1 Hour Stats</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-dark-bg p-2 rounded border border-gray-700">
                      <div className="text-gray-400 text-xs mb-1">📈 Price Change</div>
                      <div className={`font-semibold text-xs ${
                        (token.jupiterData.stats1h.priceChange || 0) >= 0 ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {formatPercentage(token.jupiterData.stats1h.priceChange)}
                      </div>
                    </div>
                    <div className="bg-dark-bg p-2 rounded border border-gray-700">
                      <div className="text-gray-400 text-xs mb-1">👥 Holder Change</div>
                      <div className={`font-semibold text-xs ${
                        (token.jupiterData.stats1h.holderChange || 0) >= 0 ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {formatPercentage(token.jupiterData.stats1h.holderChange)}
                      </div>
                    </div>
                    <div className="bg-dark-bg p-2 rounded border border-gray-700">
                      <div className="text-gray-400 text-xs mb-1">💰 Liquidity Change</div>
                      <div className={`font-semibold text-xs ${
                        (token.jupiterData.stats1h.liquidityChange || 0) >= 0 ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {formatPercentage(token.jupiterData.stats1h.liquidityChange)}
                      </div>
                    </div>
                    <div className="bg-dark-bg p-2 rounded border border-gray-700">
                      <div className="text-gray-400 text-xs mb-1">📊 Volume Change</div>
                      <div className={`font-semibold text-xs ${
                        (token.jupiterData.stats1h.volumeChange || 0) >= 0 ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {formatPercentage(token.jupiterData.stats1h.volumeChange)}
                      </div>
                    </div>
                    <div className="bg-dark-bg p-2 rounded border border-gray-700">
                      <div className="text-gray-400 text-xs mb-1">💸 Buy Volume</div>
                      <div className="text-white font-semibold text-xs">
                        ${formatNumber(token.jupiterData.stats1h.buyVolume || 0)}
                      </div>
                    </div>
                    <div className="bg-dark-bg p-2 rounded border border-gray-700">
                      <div className="text-gray-400 text-xs mb-1">💸 Sell Volume</div>
                      <div className="text-white font-semibold text-xs">
                        ${formatNumber(token.jupiterData.stats1h.sellVolume || 0)}
                      </div>
                    </div>
                    <div className="bg-dark-bg p-2 rounded border border-gray-700">
                      <div className="text-gray-400 text-xs mb-1">🎯 Organic Buys</div>
                      <div className="text-white font-semibold text-xs">
                        ${formatNumber(token.jupiterData.stats1h.buyOrganicVolume || 0)}
                      </div>
                    </div>
                    <div className="bg-dark-bg p-2 rounded border border-gray-700">
                      <div className="text-gray-400 text-xs mb-1">🎯 Organic Sells</div>
                      <div className="text-white font-semibold text-xs">
                        ${formatNumber(token.jupiterData.stats1h.sellOrganicVolume || 0)}
                      </div>
                    </div>
                    <div className="bg-dark-bg p-2 rounded border border-gray-700">
                      <div className="text-gray-400 text-xs mb-1">🔢 Buys</div>
                      <div className="text-white font-semibold text-xs">
                        {formatNumber(token.jupiterData.stats1h.numBuys || 0)}
                      </div>
                    </div>
                    <div className="bg-dark-bg p-2 rounded border border-gray-700">
                      <div className="text-gray-400 text-xs mb-1">🔢 Sells</div>
                      <div className="text-white font-semibold text-xs">
                        {formatNumber(token.jupiterData.stats1h.numSells || 0)}
                      </div>
                    </div>
                    <div className="bg-dark-bg p-2 rounded border border-gray-700">
                      <div className="text-gray-400 text-xs mb-1">👤 Traders</div>
                      <div className="text-white font-semibold text-xs">
                        {formatNumber(token.jupiterData.stats1h.numTraders || 0)}
                      </div>
                    </div>
                    <div className="bg-dark-bg p-2 rounded border border-gray-700">
                      <div className="text-gray-400 text-xs mb-1">🌱 Organic Buyers</div>
                      <div className="text-white font-semibold text-xs">
                        {formatNumber(token.jupiterData.stats1h.numOrganicBuyers || 0)}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 6 Hour Stats */}
              {token?.jupiterData?.stats6h && (
                <div className="mb-4">
                  <h4 className="text-md font-semibold text-yellow-400 mb-2">⏰ 6 Hour Stats</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-dark-bg p-2 rounded border border-gray-700">
                      <div className="text-gray-400 text-xs mb-1">📈 Price Change</div>
                      <div className={`font-semibold text-xs ${
                        (token.jupiterData.stats6h.priceChange || 0) >= 0 ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {formatPercentage(token.jupiterData.stats6h.priceChange)}
                      </div>
                    </div>
                    <div className="bg-dark-bg p-2 rounded border border-gray-700">
                      <div className="text-gray-400 text-xs mb-1">👥 Holder Change</div>
                      <div className={`font-semibold text-xs ${
                        (token.jupiterData.stats6h.holderChange || 0) >= 0 ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {formatPercentage(token.jupiterData.stats6h.holderChange)}
                      </div>
                    </div>
                    <div className="bg-dark-bg p-2 rounded border border-gray-700">
                      <div className="text-gray-400 text-xs mb-1">💰 Liquidity Change</div>
                      <div className={`font-semibold text-xs ${
                        (token.jupiterData.stats6h.liquidityChange || 0) >= 0 ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {formatPercentage(token.jupiterData.stats6h.liquidityChange)}
                      </div>
                    </div>
                    <div className="bg-dark-bg p-2 rounded border border-gray-700">
                      <div className="text-gray-400 text-xs mb-1">📊 Volume Change</div>
                      <div className={`font-semibold text-xs ${
                        (token.jupiterData.stats6h.volumeChange || 0) >= 0 ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {formatPercentage(token.jupiterData.stats6h.volumeChange)}
                      </div>
                    </div>
                    <div className="bg-dark-bg p-2 rounded border border-gray-700">
                      <div className="text-gray-400 text-xs mb-1">💸 Buy Volume</div>
                      <div className="text-white font-semibold text-xs">
                        ${formatNumber(token.jupiterData.stats6h.buyVolume || 0)}
                      </div>
                    </div>
                    <div className="bg-dark-bg p-2 rounded border border-gray-700">
                      <div className="text-gray-400 text-xs mb-1">💸 Sell Volume</div>
                      <div className="text-white font-semibold text-xs">
                        ${formatNumber(token.jupiterData.stats6h.sellVolume || 0)}
                      </div>
                    </div>
                    <div className="bg-dark-bg p-2 rounded border border-gray-700">
                      <div className="text-gray-400 text-xs mb-1">🎯 Organic Buys</div>
                      <div className="text-white font-semibold text-xs">
                        ${formatNumber(token.jupiterData.stats6h.buyOrganicVolume || 0)}
                      </div>
                    </div>
                    <div className="bg-dark-bg p-2 rounded border border-gray-700">
                      <div className="text-gray-400 text-xs mb-1">🎯 Organic Sells</div>
                      <div className="text-white font-semibold text-xs">
                        ${formatNumber(token.jupiterData.stats6h.sellOrganicVolume || 0)}
                      </div>
                    </div>
                    <div className="bg-dark-bg p-2 rounded border border-gray-700">
                      <div className="text-gray-400 text-xs mb-1">🔢 Buys</div>
                      <div className="text-white font-semibold text-xs">
                        {formatNumber(token.jupiterData.stats6h.numBuys || 0)}
                      </div>
                    </div>
                    <div className="bg-dark-bg p-2 rounded border border-gray-700">
                      <div className="text-gray-400 text-xs mb-1">🔢 Sells</div>
                      <div className="text-white font-semibold text-xs">
                        {formatNumber(token.jupiterData.stats6h.numSells || 0)}
                      </div>
                    </div>
                    <div className="bg-dark-bg p-2 rounded border border-gray-700">
                      <div className="text-gray-400 text-xs mb-1">👤 Traders</div>
                      <div className="text-white font-semibold text-xs">
                        {formatNumber(token.jupiterData.stats6h.numTraders || 0)}
                      </div>
                    </div>
                    <div className="bg-dark-bg p-2 rounded border border-gray-700">
                      <div className="text-gray-400 text-xs mb-1">🌱 Organic Buyers</div>
                      <div className="text-white font-semibold text-xs">
                        {formatNumber(token.jupiterData.stats6h.numOrganicBuyers || 0)}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 24 Hour Stats */}
              {token?.jupiterData?.stats24h && (
                <div>
                  <h4 className="text-md font-semibold text-green-400 mb-2">⏰ 24 Hour Stats</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-dark-bg p-2 rounded border border-gray-700">
                      <div className="text-gray-400 text-xs mb-1">📈 Price Change</div>
                      <div className={`font-semibold text-xs ${
                        (token.jupiterData.stats24h.priceChange || 0) >= 0 ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {formatPercentage(token.jupiterData.stats24h.priceChange)}
                      </div>
                    </div>
                    <div className="bg-dark-bg p-2 rounded border border-gray-700">
                      <div className="text-gray-400 text-xs mb-1">👥 Holder Change</div>
                      <div className={`font-semibold text-xs ${
                        (token.jupiterData.stats24h.holderChange || 0) >= 0 ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {formatPercentage(token.jupiterData.stats24h.holderChange)}
                      </div>
                    </div>
                    <div className="bg-dark-bg p-2 rounded border border-gray-700">
                      <div className="text-gray-400 text-xs mb-1">💰 Liquidity Change</div>
                      <div className={`font-semibold text-xs ${
                        (token.jupiterData.stats24h.liquidityChange || 0) >= 0 ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {formatPercentage(token.jupiterData.stats24h.liquidityChange)}
                      </div>
                    </div>
                    <div className="bg-dark-bg p-2 rounded border border-gray-700">
                      <div className="text-gray-400 text-xs mb-1">📊 Volume Change</div>
                      <div className={`font-semibold text-xs ${
                        (token.jupiterData.stats24h.volumeChange || 0) >= 0 ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {formatPercentage(token.jupiterData.stats24h.volumeChange)}
                      </div>
                    </div>
                    <div className="bg-dark-bg p-2 rounded border border-gray-700">
                      <div className="text-gray-400 text-xs mb-1">💸 Buy Volume</div>
                      <div className="text-white font-semibold text-xs">
                        ${formatNumber(token.jupiterData.stats24h.buyVolume || 0)}
                      </div>
                    </div>
                    <div className="bg-dark-bg p-2 rounded border border-gray-700">
                      <div className="text-gray-400 text-xs mb-1">💸 Sell Volume</div>
                      <div className="text-white font-semibold text-xs">
                        ${formatNumber(token.jupiterData.stats24h.sellVolume || 0)}
                      </div>
                    </div>
                    <div className="bg-dark-bg p-2 rounded border border-gray-700">
                      <div className="text-gray-400 text-xs mb-1">🎯 Organic Buys</div>
                      <div className="text-white font-semibold text-xs">
                        ${formatNumber(token.jupiterData.stats24h.buyOrganicVolume || 0)}
                      </div>
                    </div>
                    <div className="bg-dark-bg p-2 rounded border border-gray-700">
                      <div className="text-gray-400 text-xs mb-1">🎯 Organic Sells</div>
                      <div className="text-white font-semibold text-xs">
                        ${formatNumber(token.jupiterData.stats24h.sellOrganicVolume || 0)}
                      </div>
                    </div>
                    <div className="bg-dark-bg p-2 rounded border border-gray-700">
                      <div className="text-gray-400 text-xs mb-1">🔢 Buys</div>
                      <div className="text-white font-semibold text-xs">
                        {formatNumber(token.jupiterData.stats24h.numBuys || 0)}
                      </div>
                    </div>
                    <div className="bg-dark-bg p-2 rounded border border-gray-700">
                      <div className="text-gray-400 text-xs mb-1">🔢 Sells</div>
                      <div className="text-white font-semibold text-xs">
                        {formatNumber(token.jupiterData.stats24h.numSells || 0)}
                      </div>
                    </div>
                    <div className="bg-dark-bg p-2 rounded border border-gray-700">
                      <div className="text-gray-400 text-xs mb-1">👤 Traders</div>
                      <div className="text-white font-semibold text-xs">
                        {formatNumber(token.jupiterData.stats24h.numTraders || 0)}
                      </div>
                    </div>
                    <div className="bg-dark-bg p-2 rounded border border-gray-700">
                      <div className="text-gray-400 text-xs mb-1">🌱 Organic Buyers</div>
                      <div className="text-white font-semibold text-xs">
                        {formatNumber(token.jupiterData.stats24h.numOrganicBuyers || 0)}
                      </div>
                    </div>
                    <div className="bg-dark-bg p-2 rounded border border-gray-700">
                      <div className="text-gray-400 text-xs mb-1">📊 Net Buyers</div>
                      <div className="text-white font-semibold text-xs">
                        {formatNumber(token.jupiterData.stats24h.numNetBuyers || 0)}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 🪪 Section 5 – Profile Information */}
          <div className="bg-gray-800 rounded-lg p-3 border border-gray-600">
            <h3 className="text-lg font-bold mb-3 text-white flex items-center">
              🪪 Profile Information
            </h3>
            {/* Centered 4-box layout */}
            <div className="grid grid-cols-2 gap-4 max-w-2xl mx-auto">
              {/* Official Profile */}
              <div className="flex items-center justify-between p-3 bg-dark-bg rounded border border-gray-700">
                <span className="text-gray-400 text-sm">🏷️ Official Profile:</span>
                <span className={`px-2 py-1 rounded-full text-sm font-medium ${
                  (token?.socials?.twitter || token?.jupiterData?.twitter || token?.twitterHandle) ? 'bg-green-400/10 text-green-400' : 'bg-red-400/10 text-red-400'
                }`}>
                  {(token?.socials?.twitter || token?.jupiterData?.twitter || token?.twitterHandle) ? '✅ Found' : '❌ Not Found'}
                </span>
              </div>

              {/* Community Type */}
              <div className="flex items-center justify-between p-3 bg-dark-bg rounded border border-gray-700">
                <span className="text-gray-400 text-sm">🌍 Community Type:</span>
                <span className={`px-2 py-1 rounded-full text-sm font-medium ${
                  (token?.jupiterData?.audit?.devBalancePercentage || 0) <= 0.0001 ? 'bg-green-400/10 text-green-400' : 'bg-blue-400/10 text-blue-400'
                }`}>
                  {(token?.jupiterData?.audit?.devBalancePercentage || 0) <= 0.0001 ? '🟢 Community Takeover' : '🔵 Official'}
                </span>
              </div>

              {/* Twitter Link */}
              {(token?.socials?.twitter || token?.jupiterData?.twitter || token?.twitterHandle) && (
                <div className="p-3 bg-dark-bg rounded border border-gray-700">
                  <a
                    href={
                      token?.socials?.twitter ||
                      token?.jupiterData?.twitter ||
                      `https://twitter.com/${token?.twitterHandle}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white p-2 rounded transition-colors w-full"
                  >
                    <Twitter className="w-4 h-4" />
                    <span className="text-sm font-medium">Twitter</span>
                  </a>
                </div>
              )}

              {/* Website Link */}
              {(token?.socials?.website || token?.jupiterData?.website) && (
                <div className="p-3 bg-dark-bg rounded border border-gray-700">
                  <a
                    href={token?.socials?.website || token?.jupiterData?.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center space-x-2 bg-gray-600 hover:bg-gray-700 text-white p-2 rounded transition-colors w-full"
                  >
                    <ExternalLink className="w-4 h-4" />
                    <span className="text-sm font-medium">Website</span>
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* 🐦 Section 6 – Social Activity */}
          <div className="bg-gray-800 rounded-lg p-3 border border-gray-600">
            <h3 className="text-lg font-bold mb-3 text-white flex items-center">
              🐦 Social Activity
            </h3>
            {(() => {
              // Get tweets from Twitter API data collected by our backend
              let tweets = [];

              // Try different possible sources for tweet data
              if (token?.twitterData?.tweets) {
                tweets = token.twitterData.tweets;
              } else if (token?.jupiterData?.twitterData?.tweets) {
                tweets = token.jupiterData.twitterData.tweets;
              } else if (token?.recentPosts) {
                tweets = token.recentPosts;
              } else if (token?.tweets) {
                tweets = token.tweets;
              }

              // Sort by likes (highest first) - convert to numbers for proper sorting
              const sortedTweets = [...tweets].sort((a, b) => {
                const likesA = typeof a.likes === 'number' ? a.likes : parseInt(a.likes) || 0;
                const likesB = typeof b.likes === 'number' ? b.likes : parseInt(b.likes) || 0;
                return likesB - likesA;
              });
              
              if (sortedTweets.length === 0) {
                return (
                  <div className="bg-dark-bg p-3 rounded border border-gray-700 text-center">
                    <div className="text-gray-400 text-sm">
                      <Twitter className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      No recent social activity found
                    </div>
                  </div>
                );
              }

              return (
                <div className="space-y-2">
                  {sortedTweets.slice(0, 5).map((post, index) => (
                    <div key={index} className="bg-dark-bg p-3 rounded border border-gray-700">
                      <div className="flex items-start space-x-3">
                        <div className="flex-shrink-0">
                          <Twitter className="w-5 h-5 text-blue-400 mt-1" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-sm leading-relaxed mb-2">
                            {post.text || post.content || 'No content available'}
                          </p>
                          <div className="flex items-center space-x-4 text-xs text-gray-400">
                            <span className="flex items-center space-x-1">
                              <span>❤️</span>
                              <span>{post.likes || 0}</span>
                            </span>
                            <span className="flex items-center space-x-1">
                              <span>🔄</span>
                              <span>{post.retweets || 0}</span>
                            </span>
                            <span className="flex items-center space-x-1">
                              <span>💬</span>
                              <span>{post.replies || 0}</span>
                            </span>
                            {post.date && (
                              <span className="text-gray-500">
                                {new Date(post.date).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>

          {/* 📊 Section 7 – Metrics Breakdown */}
          <div className="bg-gray-800 rounded-lg p-3 border border-gray-600">
            <h3 className="text-lg font-bold mb-3 text-white flex items-center">
              📊 Metrics Breakdown
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between p-2 bg-dark-bg rounded border border-gray-700">
                  <span className="text-gray-400 text-sm">😊 Sentiment Score:</span>
                  <span className="text-white font-semibold text-sm">
                    {sentimentEmoji} {(token?.sentimentScore || 5).toFixed(1)}/10
                  </span>
                </div>
                <div className="flex items-center justify-between p-2 bg-dark-bg rounded border border-gray-700">
                  <span className="text-gray-400 text-sm">📣 Engagement Rate:</span>
                  <span className="text-white font-semibold text-sm">
                    {((token?.engagementRate || 0.05) * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="flex items-center justify-between p-2 bg-dark-bg rounded border border-gray-700">
                  <span className="text-gray-400 text-sm">🧑‍🤝‍🧑 Unique Mentions:</span>
                  <span className="text-white font-semibold text-sm">
                    {(token?.uniqueMentions || Math.floor((token?.mentions || 0) * 0.7)).toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center justify-between p-2 bg-dark-bg rounded border border-gray-700">
                  <span className="text-gray-400 text-sm">⚠️ Risk Level:</span>
                  <span className={`px-2 py-1 rounded-full text-sm font-medium ${riskLevel.color}`}>
                    {riskLevel.icon} {riskLevel.level}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between p-2 bg-dark-bg rounded border border-gray-700">
                  <span className="text-gray-400 text-sm">🔥 Trending Score:</span>
                  <span className="text-white font-semibold text-sm">
                    {(token?.trendingScore || 5).toFixed(1)}/10
                  </span>
                </div>
                <div className="flex items-center justify-between p-2 bg-dark-bg rounded border border-gray-700">
                  <span className="text-gray-400 text-sm">📊 Volume Score:</span>
                  <span className="text-white font-semibold text-sm">
                    {(token?.volumeScore || 5).toFixed(1)}/10
                  </span>
                </div>
                <div className="flex items-center justify-between p-2 bg-dark-bg rounded border border-gray-700">
                  <span className="text-gray-400 text-sm">🎯 Technical Score:</span>
                  <span className="text-white font-semibold text-sm">
                    {(token?.technicalScore || 5).toFixed(1)}/10
                  </span>
                </div>
                <div className="flex items-center justify-between p-2 bg-dark-bg rounded border border-gray-700">
                  <span className="text-gray-400 text-sm">⏰ Last Updated:</span>
                  <span className="text-white font-semibold text-sm">
                    {token?.lastUpdated ? new Date(token.lastUpdated).toLocaleTimeString() : 'N/A'}
                  </span>
                </div>
              </div>
            </div>

            {token?.enhancedScore?.calculationTime && (
              <div className="mt-3 pt-2 border-t border-gray-600">
                <div className="text-center text-gray-400 text-xs">
                  Last calculated: {new Date(token.enhancedScore.calculationTime).toLocaleString()}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TokenDetails;