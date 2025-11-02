import React, { useState, useEffect } from 'react';
import { Flame } from 'lucide-react';
import GraduationStatusBar from './GraduationStatusBar';

const TokenRankedList = ({ tokens, fueledTokens = [], onTokenSelect, categoryFilters }) => {
  const [rankings, setRankings] = useState([]);
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
    // Convert to number if string
    const numPrice = typeof price === 'string' ? parseFloat(price) : price;
    if (!numPrice || numPrice === 0) return '$0.00';
    if (numPrice < 0.0001) return `$${numPrice.toExponential(2)}`;
    if (numPrice < 1) return `$${numPrice.toFixed(6)}`;
    return `$${numPrice.toFixed(2)}`;
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

  // ✅ Fetch real-time rankings and merge with category-filtered tokens
  useEffect(() => {
    console.log('🔍 [TokenRankedList] tokens prop:', tokens?.length, 'tokens');
    const fetchAndMergeRankings = async () => {
      try {
        // Check if ALL tokens are bonding tokens
        const allAreBonding = tokens && tokens.length > 0 && tokens.every(t => t.isBondingToken);
        
        if (allAreBonding) {
          console.log('✅ [TokenRankedList] All tokens are bonding, using bonding UI');
          // For bonding tokens, just use the tokens prop directly
          setRankings(tokens);
          setLastUpdate(new Date());
          return;
        }
        
        const API_BASE = process.env.REACT_APP_API_BASE_URL || 'https://api.degen-oracle.com';
        const response = await fetch(`${API_BASE}/api/tokens/ranking/realtime`);
        const data = await response.json();
        
        if (data.success && data.data && data.data.length > 0) {
          // ✅ Merge ranking data with filtered tokens
          const filteredRankings = data.data.filter(rankedToken => {
            // Check if ranked token is in our filtered tokens list
            const address = rankedToken.contractAddress || rankedToken.tokenAddress;
            return tokens.some(filteredToken => 
              (filteredToken.contractAddress || filteredToken.tokenAddress) === address
            );
          });
          
          // Preserve the ranking order from the API (sorted by Overall Score)
          setRankings(filteredRankings);
          setLastUpdate(new Date());
        } else {
          // Fallback to tokens prop if API fails
          if (tokens && tokens.length > 0) {
            setRankings(tokens);
          }
        }
      } catch (err) {
        console.error('Error fetching rankings:', err);
        // Fallback to tokens prop on error
        if (tokens && tokens.length > 0) {
          setRankings(tokens);
        }
      }
    };
    
    fetchAndMergeRankings();
  }, [tokens]);

  const displayTokens = rankings.length > 0 ? rankings : tokens;
  
  // Check if we have mixed results (both bonding and regular tokens)
  const hasMixedResults = displayTokens && displayTokens.length > 0 && 
    displayTokens.some(t => t.isBondingToken) && 
    displayTokens.some(t => !t.isBondingToken);
  
  // Check if all tokens are bonding
  const allAreBonding = displayTokens && displayTokens.length > 0 && displayTokens.every(t => t.isBondingToken);
  
  console.log('🎨 [TokenRankedList] Render - displayTokens:', displayTokens?.length, 'allBonding:', allAreBonding, 'mixed:', hasMixedResults);

  // Mixed results UI - show bonding tokens with graduation bar, regular tokens with full columns
  if (hasMixedResults) {
    console.log('🎯 Rendering MIXED results with', displayTokens.length, 'tokens');
    return (
      <div className="w-full h-full overflow-y-auto bg-gray-900">
        <div className="overflow-x-auto">
          <table className="w-full text-xs md:text-xs" style={{ fontSize: '11px' }}>
            <thead className="text-xs text-gray-400 uppercase bg-gray-800 sticky top-0 z-20">
              <tr className="border-b border-gray-700">
                <th colSpan="12" className="px-2 py-2 text-left">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-white font-bold text-sm">📊 Search Results</span>
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
                const isBonding = token.isBondingToken;
                
                return (
                  <tr
                    key={token?.contractAddress || token?.address || index}
                    className="border-b border-gray-700 hover:bg-gray-800/30 cursor-pointer transition-colors"
                    onClick={() => onTokenSelect(token)}
                  >
                    <td className="px-2 py-2 font-medium text-gray-300">#{index + 1}</td>
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-1.5">
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
                              <div className="flex items-center space-x-0.5 px-0.5 py-0 bg-orange-900 border border-orange-500 rounded-full flex-shrink-0">
                                <Flame className="w-1.5 h-1.5 text-orange-400" />
                                <span className="text-orange-400 text-[9px] font-bold">
                                  {fuelInfo.multiplier}
                                </span>
                              </div>
                            )}
                          </div>
                          <div className="text-xs text-gray-400 truncate">{token.name}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-2 text-right font-mono text-white text-xs">
                      {formatPrice(isBonding ? token.priceUsd : (token.price || token.jupiterData?.price))}
                    </td>
                    <td className="px-2 py-2 text-right text-gray-300 text-xs">
                      {isBonding ? '-' : (token.txns24h ? token.txns24h.toLocaleString() : '0')}
                    </td>
                    <td className="px-2 py-2 text-right font-medium text-white text-xs">
                      {formatNumber(isBonding ? token.volume24h : (token.volume24h || 0))}
                    </td>
                    <td className="px-2 py-2 text-right text-gray-300 text-xs">
                      {isBonding ? '-' : (token.makers24h ? token.makers24h.toLocaleString() : '0')}
                    </td>
                    <td className={`px-2 py-2 text-right font-medium text-xs ${
                      isBonding ? 'text-gray-500' : ((token.priceChange5m || 0) >= 0 ? 'text-green-400' : 'text-red-400')
                    }`}>
                      {isBonding ? '-' : formatPercentage(token.priceChange5m || 0)}
                    </td>
                    <td className={`px-2 py-2 text-right font-medium text-xs ${
                      isBonding ? 'text-gray-500' : ((token.priceChange1h || 0) >= 0 ? 'text-green-400' : 'text-red-400')
                    }`}>
                      {isBonding ? '-' : formatPercentage(token.priceChange1h || 0)}
                    </td>
                    <td className={`px-2 py-2 text-right font-medium text-xs ${
                      isBonding ? 'text-gray-500' : ((token.priceChange6h || 0) >= 0 ? 'text-green-400' : 'text-red-400')
                    }`}>
                      {isBonding ? '-' : formatPercentage(token.priceChange6h || 0)}
                    </td>
                    <td className={`px-2 py-2 text-right font-medium text-xs ${
                      isBonding ? 'text-gray-500' : ((token.priceChange24h || 0) >= 0 ? 'text-green-400' : 'text-red-400')
                    }`}>
                      {isBonding ? '-' : formatPercentage(token.priceChange24h || 0)}
                    </td>
                    <td className="px-2 py-2 text-right text-gray-300 text-xs">
                      {formatNumber(isBonding ? token.liquidity : (token.liquidity || token.jupiterData?.liquidity || 0))}
                    </td>
                    <td className="px-2 py-2 text-right font-medium text-white text-xs">
                      {formatNumber(isBonding ? (token.marketCap || token.fullyDilutedValuation || 0) : (token.marketCap || token.jupiterData?.marketCap || token.jupiterData?.mcap || 0))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {displayTokens.length === 0 && (
          <div className="flex items-center justify-center p-8">
            <div className="text-gray-400">No tokens available</div>
          </div>
        )}
      </div>
    );
  }

  // Simple bonding token UI with graduation bar (all tokens are bonding)
  if (allAreBonding) {
    console.log('🎯 Rendering all bonding tokens UI with', displayTokens.length, 'tokens');
    return (
      <div className="w-full h-full overflow-y-auto bg-gray-900">
        <div className="overflow-x-auto">
          <table className="w-full text-xs md:text-xs" style={{ fontSize: '11px' }}>
            <thead className="text-xs text-gray-400 uppercase bg-gray-800 sticky top-0 z-20">
              <tr className="border-b border-gray-700">
                <th colSpan="5" className="px-2 py-2 text-left">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-white font-bold text-sm">🏗️ Trenches</span>
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
                <th style={{ paddingLeft: '4px', paddingRight: '0px', width: '30px' }} className="py-1 text-left">#</th>
                <th style={{ paddingLeft: '2px', paddingRight: '0px', width: '120px' }} className="py-1 text-left">Token</th>
                <th style={{ paddingLeft: '0px', paddingRight: '0px', width: '70px' }} className="py-1 text-right">Price</th>
                <th style={{ paddingLeft: '2px', paddingRight: '0px', width: '80px' }} className="py-1 text-right">M Cap</th>
                <th style={{ paddingLeft: '8px', width: 'auto' }} className="py-1 text-left">Grad</th>
              </tr>
            </thead>
            <tbody>
              {displayTokens.map((token, index) => {
                try {
                  return (
                    <tr
                      key={token?.contractAddress || index}
                      className="border-b border-gray-700 hover:bg-gray-800/30 cursor-pointer transition-colors"
                      onClick={() => onTokenSelect(token)}
                    >
                      <td style={{ paddingLeft: '4px', paddingRight: '0px' }} className="py-1 font-medium text-gray-300">#{index + 1}</td>
                      <td style={{ paddingLeft: '2px', paddingRight: '0px' }} className="py-1">
                        <div className="flex items-center">
                          {token?.logo && (
                            <img src={token.logo} alt={token.symbol || 'Token'} className="w-6 h-6 rounded-full" style={{ marginRight: '4px' }} onError={(e) => e.target.style.display = 'none'} />
                          )}
                          <div>
                            <div className="font-bold text-white" style={{ fontSize: '11px' }}>{token?.symbol || 'Unknown'}</div>
                            <div className="text-gray-400 truncate" style={{ fontSize: '9px' }}>{token?.name || 'N/A'}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ paddingLeft: '0px', paddingRight: '0px' }} className="py-1 text-right font-mono text-white">
                        <div style={{ fontSize: '11px' }}>{formatPrice(token?.priceUsd || 0)}</div>
                      </td>
                      <td style={{ paddingLeft: '2px', paddingRight: '0px' }} className="py-1 text-right font-medium text-white">
                        <div style={{ fontSize: '11px' }}>{formatNumber(parseFloat(token?.marketCap || token?.fullyDilutedValuation || 0))}</div>
                      </td>
                      <td style={{ paddingLeft: '8px' }} className="py-1">
                        <GraduationStatusBar 
                          bondingProgress={token?.bondingCurveProgress || 0} 
                          proximityLevel={token?.graduationProximity || 'FAR_FROM_GRADUATION'}
                          compact={true}
                        />
                      </td>
                    </tr>
                  );
                } catch (err) {
                  console.error('❌ Error rendering bonding token row:', err, token);
                  return null;
                }
              })}
            </tbody>
          </table>
        </div>
        {displayTokens.length === 0 && (
          <div className="flex items-center justify-center p-8">
            <div className="text-gray-400">No bonding tokens available</div>
          </div>
        )}
      </div>
    );
  }

  // Regular token UI with full columns (no bonding tokens)
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
                            <div className="flex items-center space-x-0.5 px-0.5 py-0 bg-orange-900 border border-orange-500 rounded-full flex-shrink-0">
                            <Flame className="w-1.5 h-1.5 text-orange-400" />
                            <span className="text-orange-400 text-[9px] font-bold">
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
      {displayTokens.length === 0 && (
        <div className="flex items-center justify-center p-8">
          <div className="text-gray-400">No tokens available</div>
        </div>
      )}
    </div>
  );
};

export default TokenRankedList;
