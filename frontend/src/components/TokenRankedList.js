import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Flame } from 'lucide-react';
import GraduationStatusBar from './GraduationStatusBar';
import websocketService from '../services/websocketService';

const TokenRankedList = ({ tokens, liveTokenDataRef, fueledTokens = [], onTokenSelect, categoryFilters }) => {
  const [rankings, setRankings] = useState([]);
  const [lastUpdate, setLastUpdate] = useState(null);
  const hasFetchedInitialRef = useRef(false); // Prevent multiple initial fetches
  
  // ✅ DEXSCREENER APPROACH: Merge live data from ref when rendering
  // This gives us live updates WITHOUT triggering React re-renders
  const tokensWithLiveData = useMemo(() => {
    if (!tokens || tokens.length === 0) return [];
    if (!liveTokenDataRef || !liveTokenDataRef.current) return tokens;
    
    return tokens.map(token => {
      const address = token.contractAddress || token.tokenAddress;
      const liveData = liveTokenDataRef.current.get(address);
      
      if (liveData) {
        // Merge live data with token metadata
        return {
          ...token,
          ...liveData,
          name: token.name, // Preserve from metadata
          symbol: token.symbol,
          logoURI: token.logoURI
        };
      }
      
      return token;
    });
  }, [tokens, liveTokenDataRef]);

  // Format numbers
  const formatNumber = (num) => {
    // Convert to number if string, handle all edge cases
    const numValue = typeof num === 'string' ? parseFloat(num) : Number(num);
    if (!numValue || numValue === 0 || isNaN(numValue)) return '$0';
    if (numValue >= 1000000000) return `$${(numValue / 1000000000).toFixed(2)}B`;
    if (numValue >= 1000000) return `$${(numValue / 1000000).toFixed(2)}M`;
    if (numValue >= 1000) return `$${(numValue / 1000).toFixed(2)}K`;
    return `$${numValue.toFixed(2)}`;
  };

  const formatPrice = (price) => {
    // Convert to number if string, handle all edge cases
    const numPrice = typeof price === 'string' ? parseFloat(price) : Number(price);
    if (!numPrice || numPrice === 0 || isNaN(numPrice)) return '$0.00';
    if (numPrice < 0.0001) return `$${numPrice.toExponential(2)}`;
    if (numPrice < 1) return `$${numPrice.toFixed(6)}`;
    return `$${numPrice.toFixed(2)}`;
  };

  const formatPercentage = (val) => {
    // Convert to number if string, handle all edge cases
    const numVal = typeof val === 'string' ? parseFloat(val) : Number(val);
    if (val === null || val === undefined || isNaN(numVal)) return '0.00%';
    return `${numVal >= 0 ? '+' : ''}${numVal.toFixed(2)}%`;
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

  // ✅ Initialize and update rankings from tokens with live data merged
  // Live data comes from liveTokenDataRef (updated by WebSocket, no re-render)
  useEffect(() => {
    if (tokensWithLiveData && tokensWithLiveData.length > 0) {
      console.log('🔍 [TokenRankedList] Updating rankings with live data:', tokensWithLiveData.length, 'tokens');
      setRankings(tokensWithLiveData);
      setLastUpdate(new Date());
    }
  }, [tokensWithLiveData]);

  // ✅ REAL-TIME: Listen to WebSocket ranking updates (NO HTTP POLLING)
  // This provides LIVE updates for volume, marketcap, makers, price changes without page refreshes
  useEffect(() => {
    const handleRankingUpdate = ({ rankings: wsRankings, timestamp }) => {
      console.log('📡 [TokenRankedList] WebSocket ranking update received (LIVE volume/marketcap/makers update), filtering...');
      
      // Check if ALL tokens are bonding tokens
      const allAreBonding = tokens && tokens.length > 0 && tokens.every(t => t.isBondingToken);
      
      if (allAreBonding) {
        // For bonding tokens, don't update from WS (they use their own UI)
        return;
      }
      
      // ✅ SILENT BACKGROUND UPDATE: Merge WebSocket ranking data without causing full table reconstruction
      // ✅ IMPORTANT: Merge with existing rankings to preserve priceChange24h if WebSocket doesn't include it
      if (wsRankings && wsRankings.length > 0) {
        setRankings(prevRankings => {
          // If we don't have previous rankings yet, wait for initial fetch (prevents empty table flash)
          if (prevRankings.length === 0) {
            if (process.env.NODE_ENV === 'development') {
              console.log('⏳ [TokenRankedList] Waiting for initial rankings, skipping WebSocket update');
            }
            return prevRankings;
          }
          
          // Create a map of existing rankings by address for merging
          const existingMap = new Map();
          prevRankings.forEach(token => {
            const addr = token.contractAddress || token.tokenAddress;
            if (addr) existingMap.set(addr, token);
          });
          
          // Filter and merge WebSocket rankings - SILENT UPDATE (only update changed values)
          const filteredRankings = wsRankings.filter(rankedToken => {
            const address = rankedToken.contractAddress || rankedToken.tokenAddress;
            return tokens.some(filteredToken => 
              (filteredToken.contractAddress || filteredToken.tokenAddress) === address
            );
          }).map(rankedToken => {
            const address = rankedToken.contractAddress || rankedToken.tokenAddress;
            const existing = existingMap.get(address);
            
            // If existing token found, merge only changed fields to prevent unnecessary re-renders
            if (existing) {
              // Only merge if there are actual changes (optimization to prevent re-renders)
              const hasChanges = 
                rankedToken.price !== existing.price ||
                rankedToken.marketCap !== existing.marketCap ||
                rankedToken.volume24h !== existing.volume24h ||
                rankedToken.makers24h !== existing.makers24h ||
                rankedToken.priceChange1h !== existing.priceChange1h ||
                rankedToken.priceChange24h !== existing.priceChange24h;
              
              if (!hasChanges) {
                // No changes, return existing to prevent re-render
                return existing;
              }
            }
            
            // Merge: Use WebSocket data but preserve priceChange24h from existing if WebSocket doesn't have it or has 0
            const getPriceChange = (wsValue, existingValue) => {
              if (wsValue !== undefined && wsValue !== null) {
                if (wsValue === 0 && existingValue !== undefined && existingValue !== null && existingValue !== 0) {
                  return existingValue;
                }
                return wsValue;
              }
              return existingValue ?? wsValue ?? 0;
            };
            
            return {
              ...(existing || rankedToken), // Start with existing to preserve order and other fields
              ...rankedToken, // Override with WebSocket data
              // Use smarter merge logic that checks if existing has better data
              priceChange24h: getPriceChange(rankedToken.priceChange24h, existing?.priceChange24h),
              priceChange1h: getPriceChange(rankedToken.priceChange1h, existing?.priceChange1h),
              priceChange6h: getPriceChange(rankedToken.priceChange6h, existing?.priceChange6h),
              priceChange5m: getPriceChange(rankedToken.priceChange5m, existing?.priceChange5m),
            };
          });
          
          if (filteredRankings.length > 0) {
            // ✅ SILENT UPDATE: Only update timestamp, don't log (reduces console noise)
            setLastUpdate(new Date(timestamp));
            return filteredRankings;
          }
          return prevRankings;
        });
      }
    };

    // Connect WebSocket service if not already connected
    if (!websocketService.isConnected) {
      websocketService.connect();
    }

    // Subscribe to ranking updates
    websocketService.on('rankingUpdate', handleRankingUpdate);

    // Cleanup
    return () => {
      websocketService.removeListener('rankingUpdate', handleRankingUpdate);
    };
  }, [tokens]);

  // ✅ MEMOIZE displayTokens to prevent unnecessary recalculations
  const displayTokens = useMemo(() => {
    return rankings.length > 0 ? rankings : tokens;
  }, [rankings, tokens]);
  
  // Check if we have mixed results (both bonding and regular tokens)
  const hasMixedResults = useMemo(() => {
    return displayTokens && displayTokens.length > 0 && 
      displayTokens.some(t => t.isBondingToken) && 
      displayTokens.some(t => !t.isBondingToken);
  }, [displayTokens]);
  
  // Check if all tokens are bonding
  const allAreBonding = useMemo(() => {
    return displayTokens && displayTokens.length > 0 && displayTokens.every(t => t.isBondingToken);
  }, [displayTokens]);
  
  // Only log in development to reduce console noise
  if (process.env.NODE_ENV === 'development') {
    console.log('🎨 [TokenRankedList] Render - displayTokens:', displayTokens?.length, 'allBonding:', allAreBonding, 'mixed:', hasMixedResults);
  }

  // Mixed results UI - show bonding tokens with graduation bar, regular tokens with full columns
  if (hasMixedResults) {
    console.log('🎯 Rendering MIXED results with', displayTokens.length, 'tokens');
    return (
      <div className="w-full h-full overflow-y-auto bg-gray-900">
        {/* Mobile Card View */}
        <div className="block md:hidden">
          <div className="px-4 py-3 border-b border-gray-700 bg-gray-800/50">
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
          </div>
          <div className="divide-y divide-gray-700">
            {displayTokens.map((token, index) => {
              const fuelInfo = getFuelInfo(token.symbol);
              const isBonding = token.isBondingToken;
              
              return (
                <div
                  key={token?.contractAddress || token?.address || index}
                  className="p-3 hover:bg-gray-800/30 cursor-pointer transition-colors"
                  onClick={() => onTokenSelect(token)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {token.jupiterData?.icon || token.logo ? (
                        <img 
                          src={token.jupiterData?.icon || token.logo} 
                          alt={token.symbol} 
                          className="w-8 h-8 rounded-full flex-shrink-0"
                          onError={(e) => e.target.style.display = 'none'}
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center flex-shrink-0">
                          <span className="text-base text-gray-400 font-bold">{token.symbol?.charAt(0) || '?'}</span>
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-white flex items-center gap-2">
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
                        <div className="text-sm text-gray-400 truncate">{token.name}</div>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="font-bold text-white font-mono">{formatPrice(isBonding ? token.priceUsd : (token.price || token.jupiterData?.price))}</div>
                      <div className="flex items-center justify-end gap-2 mt-0.5">
                        <span className={`text-sm font-semibold ${(token.priceChange1h || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {isBonding ? '-' : formatPercentage(token.priceChange1h || 0)}
                        </span>
                        <span className={`text-sm font-semibold ${(token.priceChange24h || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {isBonding ? '-' : formatPercentage(token.priceChange24h || 0)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <div className="px-2 py-1 bg-gray-800 rounded-full text-sm">
                      <span className="text-gray-400">VOL </span>
                      <span className="text-white font-semibold">{formatNumber(isBonding ? token.volume24h : (token.volume24h || 0))}</span>
                    </div>
                    <div className="px-2 py-1 bg-gray-800 rounded-full text-sm">
                      <span className="text-gray-400">LIQ </span>
                      <span className="text-white font-semibold">{formatNumber(isBonding ? token.liquidity : (token.liquidity || token.jupiterData?.liquidity || 0))}</span>
                    </div>
                    <div className="px-2 py-1 bg-gray-800 rounded-full text-sm">
                      <span className="text-gray-400">MCAP </span>
                      <span className="text-white font-semibold">{formatNumber(isBonding ? (token.marketCap || token.fullyDilutedValuation || 0) : (token.marketCap || token.jupiterData?.marketCap || token.jupiterData?.mcap || 0))}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
            <thead className="text-sm text-gray-400 uppercase bg-gray-800 sticky top-0 z-20">
              <tr className="border-b border-gray-700">
                <th colSpan="12" className="px-2 py-2 text-left">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-white font-bold text-base">📊 Search Results</span>
                    </div>
                    {lastUpdate && (
                      <span className="text-sm text-gray-400 normal-case">
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
                          <div className="font-bold text-white flex items-center gap-2 text-sm">
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
                          <div className="text-sm text-gray-400 truncate">{token.name}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-2 text-right font-mono text-white text-sm">
                      {formatPrice(isBonding ? token.priceUsd : (token.price || token.jupiterData?.price))}
                    </td>
                    <td className="px-2 py-2 text-right text-gray-300 text-sm">
                      {isBonding ? '-' : (token.txns24h ? token.txns24h.toLocaleString() : '0')}
                    </td>
                    <td className="px-2 py-2 text-right font-medium text-white text-sm">
                      {formatNumber(isBonding ? token.volume24h : (token.volume24h || 0))}
                    </td>
                    <td className="px-2 py-2 text-right text-gray-300 text-sm">
                      {isBonding ? '-' : (token.makers24h ? token.makers24h.toLocaleString() : '0')}
                    </td>
                    <td className={`px-2 py-2 text-right font-medium text-sm ${
                      isBonding ? 'text-gray-500' : ((token.priceChange5m || 0) >= 0 ? 'text-green-400' : 'text-red-400')
                    }`}>
                      {isBonding ? '-' : formatPercentage(token.priceChange5m || 0)}
                    </td>
                    <td className={`px-2 py-2 text-right font-medium text-sm ${
                      isBonding ? 'text-gray-500' : ((token.priceChange1h || 0) >= 0 ? 'text-green-400' : 'text-red-400')
                    }`}>
                      {isBonding ? '-' : formatPercentage(token.priceChange1h || 0)}
                    </td>
                    <td className={`px-2 py-2 text-right font-medium text-sm ${
                      isBonding ? 'text-gray-500' : ((token.priceChange6h || 0) >= 0 ? 'text-green-400' : 'text-red-400')
                    }`}>
                      {isBonding ? '-' : formatPercentage(token.priceChange6h || 0)}
                    </td>
                    <td className={`px-2 py-2 text-right font-medium text-sm ${
                      isBonding ? 'text-gray-500' : ((token.priceChange24h || 0) >= 0 ? 'text-green-400' : 'text-red-400')
                    }`}>
                      {isBonding ? '-' : formatPercentage(token.priceChange24h || 0)}
                    </td>
                    <td className="px-2 py-2 text-right text-gray-300 text-sm">
                      {formatNumber(isBonding ? token.liquidity : (token.liquidity || token.jupiterData?.liquidity || 0))}
                    </td>
                    <td className="px-2 py-2 text-right font-medium text-white text-sm">
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
        {/* Mobile Card View */}
        <div className="block md:hidden">
          <div className="px-4 py-3 border-b border-gray-700 bg-gray-800/50">
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
          </div>
          <div className="divide-y divide-gray-700">
            {displayTokens.map((token, index) => {
              try {
                return (
                  <div
                    key={token?.contractAddress || index}
                    className="p-3 hover:bg-gray-800/30 cursor-pointer transition-colors"
                    onClick={() => onTokenSelect(token)}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        {token?.logo && (
                          <img src={token.logo} alt={token.symbol || 'Token'} className="w-8 h-8 rounded-full flex-shrink-0" onError={(e) => e.target.style.display = 'none'} />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-white">{token?.symbol || 'Unknown'}</div>
                          <div className="text-xs text-gray-400 truncate">{token?.name || 'N/A'}</div>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="font-bold text-white font-mono">{formatPrice(token?.priceUsd || 0)}</div>
                      </div>
                    </div>
                    <div className="mt-2">
                      <GraduationStatusBar 
                        bondingProgress={token?.bondingCurveProgress || 0} 
                        proximityLevel={token?.graduationProximity || 'FAR_FROM_GRADUATION'}
                        compact={true}
                      />
                    </div>
                  </div>
                );
              } catch (err) {
                console.error('❌ Error rendering bonding token row:', err, token);
                return null;
              }
            })}
          </div>
        </div>

        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm" style={{ fontSize: '14px' }}>
            <thead className="text-xs text-gray-400 uppercase bg-gray-800 sticky top-0 z-20">
              <tr className="border-b border-gray-700">
                <th colSpan="5" className="px-2 py-2 text-left">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-white font-bold text-base">🏗️ Trenches</span>
                    </div>
                    {lastUpdate && (
                      <span className="text-sm text-gray-400 normal-case">
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
                            <div className="font-bold text-white" style={{ fontSize: '14px' }}>{token?.symbol || 'Unknown'}</div>
                            <div className="text-gray-400 truncate" style={{ fontSize: '12px' }}>{token?.name || 'N/A'}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ paddingLeft: '0px', paddingRight: '0px' }} className="py-1 text-right font-mono text-white">
                         <div style={{ fontSize: '14px' }}>{formatPrice(token?.priceUsd || 0)}</div>
                      </td>
                      <td style={{ paddingLeft: '2px', paddingRight: '0px' }} className="py-1 text-right font-medium text-white">
                         <div style={{ fontSize: '14px' }}>{formatNumber(parseFloat(token?.marketCap || token?.fullyDilutedValuation || 0))}</div>
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

  // Format price in Dexscreener style (e.g., "$0.0₃ 1607")
  const formatPriceDexscreener = (price) => {
    const numPrice = typeof price === 'string' ? parseFloat(price) : Number(price);
    if (!numPrice || numPrice === 0 || isNaN(numPrice)) return '$0.00';
    
    if (numPrice < 0.0001) {
      // For very small prices, show in scientific notation or with subscript
      const str = numPrice.toExponential(2);
      const match = str.match(/^(\d\.\d+)e([+-]\d+)$/);
      if (match) {
        const [, base, exp] = match;
        const expNum = parseInt(exp);
        if (expNum < 0) {
          const zeros = Math.abs(expNum) - 1;
          const significant = base.replace('.', '');
          return `$0.0${String.fromCharCode(8320 + zeros)} ${significant}`;
        }
      }
      return `$${numPrice.toExponential(2)}`;
    }
    if (numPrice < 1) {
      return `$${numPrice.toFixed(6)}`;
    }
    return `$${numPrice.toFixed(2)}`;
  };

  // Regular token UI with full columns (no bonding tokens)
  return (
    <div className="w-full h-full overflow-y-auto bg-gray-900">
      {/* Mobile Card View - Dexscreener Style */}
      <div className="block md:hidden">
        <div className="px-3 py-2.5 border-b border-gray-700 bg-gray-800/50">
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
        </div>
        <div className="divide-y divide-gray-700">
            {displayTokens.map((token, index) => {
              const fuelInfo = getFuelInfo(token.symbol);
              const price = token.price || token.jupiterData?.price || 0;
              const priceChange1h = Number(token.priceChange1h) || 0;
              const priceChange24h = Number(token.priceChange24h) || 0;
              const liquidity = token.liquidity || token.jupiterData?.liquidity || 0;
              const volume = token.volume24h || 0;
              const marketCap = token.marketCap || token.jupiterData?.marketCap || token.jupiterData?.mcap || 0;
            
            return (
              <div
                key={token.address || token.contractAddress || index}
                className="px-3 py-3 hover:bg-gray-800/30 cursor-pointer transition-colors"
                onClick={() => onTokenSelect(token)}
              >
                <div className="flex items-start justify-between gap-3">
                  {/* Left Section - Token Info (Dexscreener Style) */}
                  <div className="flex items-start gap-2 flex-1 min-w-0">
                    {/* Token Icon */}
                    {token.jupiterData?.icon || token.logo ? (
                      <img 
                        src={token.jupiterData?.icon || token.logo} 
                        alt={token.symbol} 
                        className="w-8 h-8 rounded flex-shrink-0"
                        onError={(e) => e.target.style.display = 'none'}
                      />
                    ) : (
                      <div className="w-8 h-8 rounded bg-gray-700 flex items-center justify-center flex-shrink-0">
                        <span className="text-sm text-gray-400 font-bold">{token.symbol?.charAt(0) || '?'}</span>
                      </div>
                    )}
                    
                    {/* Token Name & Info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1 flex-wrap mb-0.5">
                        <span className="font-bold text-white text-base truncate">{token.symbol}</span>
                        {/* Fuel icon for fueled tokens (using existing icon system) */}
                        {fuelInfo.isFueled && (
                          <div className="flex items-center space-x-0.5 px-0.5 py-0 bg-orange-900 border border-orange-500 rounded-full flex-shrink-0">
                            <Flame className="w-1.5 h-1.5 text-orange-400" />
                            <span className="text-orange-400 text-[9px] font-bold">
                              {fuelInfo.multiplier}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="text-xs text-gray-400 truncate">{token.name || token.symbol}</div>
                    </div>
                  </div>
                  
                  {/* Right Section - Price & Changes (Dexscreener Style) */}
                  <div className="flex flex-col items-end flex-shrink-0 min-w-[90px]">
                    {/* Price - Large, top */}
                    <div className="font-bold text-white font-mono text-base mb-1 leading-tight">
                      {formatPriceDexscreener(price)}
                    </div>
                    {/* Percentage Changes - Top row */}
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[10px] font-semibold ${
                        priceChange1h >= 0 ? 'text-green-400' : priceChange1h < 0 ? 'text-red-400' : 'text-white'
                      }`}>
                        1H {formatPercentage(priceChange1h).replace('%', '')}
                      </span>
                      <span className={`text-[10px] font-semibold ${
                        priceChange24h >= 0 ? 'text-green-400' : priceChange24h < 0 ? 'text-red-400' : 'text-white'
                      }`}>
                        24H {formatPercentage(priceChange24h).replace('%', '')}
                      </span>
                    </div>
                  </div>
                </div>
                
                {/* Metrics Pills - Bottom Row (Dexscreener Style) */}
                <div className="flex items-center justify-end gap-2 mt-2.5">
                  <div className="px-2 py-1 bg-gray-700/60 rounded-full text-[10px]">
                    <span className="text-gray-400">LIQ </span>
                    <span className="text-white font-semibold">{formatNumber(liquidity)}</span>
                  </div>
                  <div className="px-2 py-1 bg-gray-700/60 rounded-full text-[10px]">
                    <span className="text-gray-400">VOL </span>
                    <span className="text-white font-semibold">{formatNumber(volume)}</span>
                  </div>
                  <div className="px-2 py-1 bg-gray-700/60 rounded-full text-[10px]">
                    <span className="text-gray-400">MCAP </span>
                    <span className="text-white font-semibold">{formatNumber(marketCap)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-xs table-fixed">
          <thead className="text-xs text-gray-400 uppercase bg-gray-800 sticky top-0 z-20">
            <tr className="border-b border-gray-700">
              <th colSpan="12" className="px-2 py-2 text-left">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-white font-bold text-base">📊 Token Rankings</span>
            </div>
                  {lastUpdate && (
                    <span className="text-sm text-gray-400 normal-case">
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
                        <div className="font-bold text-white flex items-center gap-2 text-xs">
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
                        <div className="text-sm text-gray-400 truncate">{token.name}</div>
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
