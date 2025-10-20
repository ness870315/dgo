import React from 'react';
import { TrendingUp, TrendingDown, Minus, Star, Flame } from 'lucide-react';
import { getStatusFromScore } from '../utils/statusUtils';
import GraduationStatusBar from './GraduationStatusBar';

const TokenRankedList = ({ tokens, fueledTokens = [], onTokenSelect, isTrenchesFilter = false }) => {
  // Sort tokens by overall score (highest first)
  const sortedTokens = [...tokens].sort((a, b) => {
    const scoreA = a.overallScore || a.score || 0;
    const scoreB = b.overallScore || b.score || 0;
    return scoreB - scoreA;
  });

  // Check if token is fueled and get fuel multiplier
  const getFuelInfo = (token) => {
    const fueledTokensArray = fueledTokens.value || fueledTokens;
    const fueledToken = fueledTokensArray.find(fueled =>
      fueled.symbol?.toLowerCase() === token.symbol?.toLowerCase()
    );
    
    if (fueledToken) {
      return {
        isFueled: true,
        multiplier: fueledToken.fuelType || '10x'
      };
    }
    
    return { isFueled: false, multiplier: null };
  };

  // Format market cap
  const formatMarketCap = (marketCap) => {
    if (!marketCap || isNaN(marketCap) || marketCap === 0) return '$0';
    const numMarketCap = Number(marketCap);
    if (isNaN(numMarketCap)) return '$0';
    
    if (numMarketCap >= 1e9) return `$${(numMarketCap / 1e9).toFixed(1)}B`;
    if (numMarketCap >= 1e6) return `$${(numMarketCap / 1e6).toFixed(1)}M`;
    if (numMarketCap >= 1e3) return `$${(numMarketCap / 1e3).toFixed(1)}K`;
    return `$${numMarketCap.toFixed(0)}`;
  };

  // Format price
  const formatPrice = (price) => {
    if (!price || isNaN(price) || price === 0) return '$0';
    const numPrice = Number(price);
    if (isNaN(numPrice)) return '$0';
    
    if (numPrice >= 1) return `$${numPrice.toFixed(2)}`;
    if (numPrice >= 0.01) return `$${numPrice.toFixed(4)}`;
    return `$${numPrice.toFixed(8)}`;
  };

  // Get price change icon and color
  const getPriceChangeDisplay = (priceChange) => {
    if (!priceChange || isNaN(priceChange)) return { icon: Minus, color: 'text-gray-400' };
    
    const change = Number(priceChange);
    if (change > 0) return { icon: TrendingUp, color: 'text-green-400' };
    if (change < 0) return { icon: TrendingDown, color: 'text-red-400' };
    return { icon: Minus, color: 'text-gray-400' };
  };

  // Get score color based on value using centralized utility
  const getScoreColor = (score) => {
    return getStatusFromScore(score).textColor;
  };

  // Get score label using centralized utility
  const getScoreLabel = (score) => {
    return getStatusFromScore(score).level;
  };

  return (
    <div className="w-full h-full overflow-y-auto">
      <div className="space-y-2 p-2 sm:p-4">
        {/* Header */}
        <div className="sticky top-0 bg-dark-bg border-b border-gray-700 pb-2 sm:pb-3 mb-2 sm:mb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-1 sm:space-y-0">
            <h3 className="text-sm sm:text-lg font-semibold text-white mobile-compact-header">
              Token Rankings ({sortedTokens.length})
            </h3>
            <div className="text-xs text-gray-400 mobile-compact-subheader">
              Sorted by Overall Score
            </div>
          </div>
        </div>

        {/* Token List */}
        <div className="space-y-2 mobile-token-list">
          {sortedTokens.map((token, index) => {
            const rank = index + 1;
            const score = token.overallScore || token.score || 0;
            const priceChange = isTrenchesFilter 
              ? (token.priceChange5m || token.jupiterData?.stats5m?.priceChange || 0)
              : (token.jupiterData?.priceChange24h || token.priceChange24h || 0);
            const marketCap = token.jupiterData?.marketCap || token.marketCap || 0;
            const price = token.jupiterData?.price || token.price || 0;
            // Use displayMentions (smart projection) for consistency with TokenDetails
            const mentions = token.twitterData?.displayMentions || token.displayMentions || token.mentions || token.twitterData?.mentions || 0;
            const fuelInfo = getFuelInfo(token);
            
            const { icon: PriceIcon, color: priceColor } = getPriceChangeDisplay(priceChange);
            const scoreColor = getScoreColor(score);
            const scoreLabel = getScoreLabel(score);

            return (
              <div
                key={token.contractAddress || token.symbol || index}
                className="bg-dark-card border border-gray-700 rounded-lg p-3 sm:p-4 hover:border-solana-purple transition-all duration-200 cursor-pointer group"
                onClick={() => onTokenSelect(token)}
              >
                {/* Mobile Layout - Dexscreener Style Compact */}
                <div className="block sm:hidden mobile-token-box">
                  <div className="flex items-center justify-between py-2">
                    {/* Left side - Rank, Icon, Symbol */}
                    <div className="flex items-center space-x-2 flex-1 min-w-0">
                      {/* Rank */}
                      <div className="flex-shrink-0">
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                          rank <= 3 
                            ? 'bg-gradient-to-r from-yellow-400 to-orange-500 text-black' 
                            : 'bg-gray-700 text-gray-300'
                        }`}>
                          {rank}
                        </div>
                      </div>

                      {/* Token Icon */}
                      <div className="flex-shrink-0">
                        {(token.jupiterData?.icon || token.logo) ? (
                          <img 
                            src={token.jupiterData?.icon || token.logo} 
                            alt={token.symbol} 
                            className="w-6 h-6 rounded-full"
                            onError={(e) => {
                              e.target.style.display = 'none';
                              e.target.nextSibling.style.display = 'flex';
                            }}
                          />
                        ) : null}
                        <div className="w-6 h-6 rounded-full bg-gray-700 flex items-center justify-center" style={{ display: (token.jupiterData?.icon || token.logo) ? 'none' : 'flex' }}>
                          <span className="text-xs text-gray-400">?</span>
                        </div>
                      </div>

                      {/* Symbol & Fuel Badge */}
                      <div className="flex items-center space-x-1 min-w-0 flex-1">
                        <h4 className="text-white font-semibold text-sm truncate">
                          {token.symbol || 'Unknown'}
                        </h4>
                        {fuelInfo.isFueled && (
                          <div className="flex items-center space-x-1 px-1 py-0.5 bg-orange-900 border border-orange-500 rounded-full flex-shrink-0">
                            <Flame className="w-2 h-2 text-orange-400" />
                            <span className="text-orange-400 text-xs font-bold">
                              {fuelInfo.multiplier}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Right side - All Desktop Fields */}
                    <div className="flex items-center space-x-2 flex-shrink-0">
                      {/* Overall Score - Hide for Trenches filter */}
                      {!isTrenchesFilter && (
                        <div className="text-center">
                          <div className={`text-sm font-bold ${scoreColor}`}>
                            {score.toFixed(1)}
                          </div>
                          <div className="text-xs text-gray-400">
                            Score
                          </div>
                        </div>
                      )}

                      {/* Price Change % */}
                      <div className="text-center">
                        <div className={`text-sm font-bold ${priceColor}`}>
                          {priceChange > 0 ? '+' : ''}{priceChange.toFixed(1)}%
                        </div>
                        <div className="text-xs text-gray-400">
                          %
                        </div>
                      </div>

                      {/* Market Cap */}
                      <div className="text-center">
                        <div className="text-white font-semibold text-xs">
                          {formatMarketCap(marketCap)}
                        </div>
                        <div className="text-xs text-gray-400">
                          MC
                        </div>
                      </div>

                      {/* Mentions - Hide for Trenches filter */}
                      {!isTrenchesFilter && (
                        <div className="text-center">
                          <div className="text-white font-semibold text-xs">
                            {mentions}
                          </div>
                          <div className="text-xs text-gray-400">
                            Mentions
                          </div>
                        </div>
                      )}

                      {/* Arrow */}
                      <div className="text-gray-400 group-hover:text-solana-purple transition-colors">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Graduation Status Bar for Bonding Tokens */}
                {token.bondingCurveProgress && (
                  <div className="mt-3 px-2">
                    <GraduationStatusBar 
                      bondingProgress={token.bondingCurveProgress}
                      proximityLevel={token.graduationProximity}
                      showLabel={false}
                      compact={true}
                    />
                  </div>
                )}

                {/* Desktop Layout */}
                <div className="hidden sm:block">
                  <div className="flex items-center justify-between">
                    {/* Left side - Rank, Token Info */}
                    <div className="flex items-center space-x-4">
                      {/* Rank */}
                      <div className="flex-shrink-0">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                          rank <= 3 
                            ? 'bg-gradient-to-r from-yellow-400 to-orange-500 text-black' 
                            : 'bg-gray-700 text-gray-300'
                        }`}>
                          {rank}
                        </div>
                      </div>

                      {/* Token Icon & Info */}
                      <div className="flex items-center space-x-3">
                        {(token.jupiterData?.icon || token.logo) && (
                          <img 
                            src={token.jupiterData?.icon || token.logo} 
                            alt={token.symbol} 
                            className="w-10 h-10 rounded-full border-2 border-gray-600"
                            onError={(e) => {
                              e.target.style.display = 'none';
                            }}
                          />
                        )}
                        <div>
                          <div className="flex items-center space-x-2">
                            <h4 className="text-white font-semibold text-lg">
                              {token.symbol || 'Unknown'}
                            </h4>
                            {fuelInfo.isFueled && (
                              <div className="flex items-center space-x-1 px-2 py-1 bg-orange-900 border border-orange-500 rounded-full">
                                <Flame className="w-3 h-3 text-orange-400" />
                                <span className="text-orange-400 text-xs font-bold">
                                  {fuelInfo.multiplier}
                                </span>
                              </div>
                            )}
                          </div>
                          <p className="text-gray-400 text-sm">
                            {token.name || token.jupiterData?.name || 'Unknown Token'}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Right side - Stats */}
                    <div className="flex items-center space-x-6">
                      {/* Score - Hide for Trenches filter */}
                      {!isTrenchesFilter && (
                        <div className="text-center">
                          <div className={`text-2xl font-bold ${scoreColor}`}>
                            {score.toFixed(1)}
                          </div>
                          <div className="text-xs text-gray-400">
                            {scoreLabel}
                          </div>
                        </div>
                      )}

                      {/* Price Change */}
                      <div className="text-center">
                        <div className={`text-2xl font-bold ${priceColor}`}>
                          {priceChange > 0 ? '+' : ''}{priceChange.toFixed(1)}%
                        </div>
                        <div className="text-xs text-gray-400">
                          %
                        </div>
                      </div>

                      {/* Market Cap */}
                      <div className="text-center">
                        <div className="text-white font-semibold">
                          {formatMarketCap(marketCap)}
                        </div>
                        <div className="text-xs text-gray-400">
                          Market Cap
                        </div>
                      </div>

                      {/* Mentions - Hide for Trenches filter */}
                      {!isTrenchesFilter && (
                        <div className="text-center">
                          <div className="text-white font-semibold">
                            {mentions}
                          </div>
                          <div className="text-xs text-gray-400">
                            Mentions
                          </div>
                        </div>
                      )}

                      {/* Arrow indicator */}
                      <div className="text-gray-400 group-hover:text-solana-purple transition-colors">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="pt-3 sm:pt-4 border-t border-gray-700 mt-4 sm:mt-6">
          <div className="text-center text-xs text-gray-500 px-2">
            <div className="block sm:hidden">
              Tap any token to view details
            </div>
            <div className="hidden sm:block">
              Click any token to view details • Rankings update in real-time
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TokenRankedList;
