import axios from 'axios';

class DexScreenerService {
  constructor() {
    this.baseURL = 'https://api.dexscreener.com/latest';
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes cache
  }

  /**
   * Clear cache to force fresh data
   */
  clearCache() {
    this.cache.clear();
    console.log('🧹 DexScreener cache cleared');
  }

  /**
   * Get top performing Solana tokens by volume and transactions from DexScreener
   */
  async getTrendingSolanaTokens() {
    try {
      const cacheKey = 'trending_solana';
      const cached = this.cache.get(cacheKey);
      
      if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
        console.log('🟢 Using cached DexScreener trending data');
        return cached.data;
      }

      console.log('🔍 Fetching top Solana tokens by volume and transactions from DexScreener...');
      
      let allPairs = [];
      
      // Dynamic approach: Search for high-volume tokens using various strategies
      const searchStrategies = [
        // Popular meme tokens
        { terms: ['meme', 'pepe', 'doge', 'shib', 'floki'], category: 'meme' },
        // DeFi tokens  
        { terms: ['defi', 'swap', 'pool', 'farm', 'stake'], category: 'defi' },
        // Recent trending
        { terms: ['pump', 'moon', 'gem', 'alpha', 'based'], category: 'trending' },
        // Solana ecosystem
        { terms: ['solana', 'sol', 'raydium', 'orca', 'jupiter'], category: 'ecosystem' }
      ];

      for (const strategy of searchStrategies) {
        for (const term of strategy.terms) {
          try {
            console.log(`🔍 Searching for "${term}" tokens (${strategy.category})...`);
            
            const searchResponse = await axios.get(`${this.baseURL}/dex/search/?q=${term}`, {
              timeout: 15000,
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
              }
            });
            
            if (searchResponse.data && searchResponse.data.pairs) {
              const qualifyingPairs = searchResponse.data.pairs.filter(pair => {
                // Strict filtering for quality tokens
                const isValidSolana = pair.chainId === 'solana';
                const hasTokenData = pair.baseToken && pair.baseToken.symbol && pair.baseToken.address;
                const hasVolume = pair.volume?.h24 && parseFloat(pair.volume.h24) > 50000; // Min $50K volume
                const hasMarketCap = pair.fdv && parseFloat(pair.fdv) > 100000; // Min $100K market cap
                const hasTransactions = pair.txns?.h24?.buys > 10 && pair.txns?.h24?.sells > 5; // Active trading
                const hasLiquidity = pair.liquidity?.usd && parseFloat(pair.liquidity.usd) > 25000; // Min $25K liquidity
                
                return isValidSolana && hasTokenData && hasVolume && hasMarketCap && hasTransactions && hasLiquidity;
              });
              
              console.log(`   Found ${qualifyingPairs.length} qualifying tokens for "${term}"`);
              allPairs.push(...qualifyingPairs);
            }
            
            // Rate limiting delay
            await new Promise(resolve => setTimeout(resolve, 200));
            
          } catch (searchError) {
            console.log(`   Search for "${term}" failed:`, searchError.message);
          }
        }
      }

      // Remove duplicates based on contract address
      const uniquePairs = allPairs.filter((pair, index, self) => 
        index === self.findIndex(p => p.baseToken.address === pair.baseToken.address)
      );

      console.log(`📊 Found ${uniquePairs.length} unique qualifying Solana tokens`);

      // Advanced sorting by multiple metrics
      const solanaPairs = uniquePairs
        .sort((a, b) => {
          // Multi-factor scoring system
          const aVolume = parseFloat(a.volume?.h24) || 0;
          const bVolume = parseFloat(b.volume?.h24) || 0;
          const aTxns = (a.txns?.h24?.buys || 0) + (a.txns?.h24?.sells || 0);
          const bTxns = (b.txns?.h24?.buys || 0) + (b.txns?.h24?.sells || 0);
          const aPriceChange = Math.abs(parseFloat(a.priceChange?.h24) || 0);
          const bPriceChange = Math.abs(parseFloat(b.priceChange?.h24) || 0);
          const aMarketCap = parseFloat(a.fdv) || 0;
          const bMarketCap = parseFloat(b.fdv) || 0;
          
          // Weighted score: Volume (40%) + Transactions (30%) + Price momentum (20%) + Market cap tier (10%)
          const aScore = (aVolume / 1000000) * 0.4 + (aTxns / 100) * 0.3 + (aPriceChange / 10) * 0.2 + Math.log10(aMarketCap) * 0.1;
          const bScore = (bVolume / 1000000) * 0.4 + (bTxns / 100) * 0.3 + (bPriceChange / 10) * 0.2 + Math.log10(bMarketCap) * 0.1;
          
          return bScore - aScore;
        })
        .slice(0, 30); // Top 30 performers

      console.log(`✅ Found ${solanaPairs.length} trending Solana pairs from DexScreener`);

      // Extract token information with enhanced metrics
      const trendingTokens = solanaPairs.map(pair => {
        const baseToken = pair.baseToken;
        const transactions = (pair.txns?.h24?.buys || 0) + (pair.txns?.h24?.sells || 0);
        
        return {
          symbol: baseToken.symbol?.toUpperCase() || 'UNKNOWN',
          name: baseToken.name || baseToken.symbol || 'Unknown Token',
          contractAddress: baseToken.address,
          dexScreenerData: {
            pairAddress: pair.pairAddress,
            priceUsd: parseFloat(pair.priceUsd) || 0,
            volume24h: parseFloat(pair.volume?.h24) || 0,
            priceChange24h: parseFloat(pair.priceChange?.h24) || 0,
            priceChange1h: parseFloat(pair.priceChange?.h1) || 0,
            liquidity: parseFloat(pair.liquidity?.usd) || 0,
            marketCap: parseFloat(pair.fdv) || 0, // Fully Diluted Valuation
            transactions: transactions, // Total 24h transactions
            transactionDetails: {
              buys: pair.txns?.h24?.buys || 0,
              sells: pair.txns?.h24?.sells || 0,
              volume_buys: parseFloat(pair.txns?.h24?.volume_buys) || 0,
              volume_sells: parseFloat(pair.txns?.h24?.volume_sells) || 0
            },
            dexId: pair.dexId,
            url: pair.url,
            boosts: pair.boosts || {},
            qualityScore: this.calculateQualityScore(pair)
          }
        };
      }).filter(token => {
        // Filter out invalid tokens with stricter validation
        const hasValidSymbol = token.symbol && token.symbol !== 'UNKNOWN' && token.symbol.length <= 10;
        const hasValidContract = token.contractAddress && token.contractAddress.length > 20;
        const meetsMinRequirements = token.dexScreenerData.volume24h >= 50000 && 
                                   token.dexScreenerData.marketCap >= 100000 &&
                                   token.dexScreenerData.transactions >= 15;
        
        return hasValidSymbol && hasValidContract && meetsMinRequirements;
      });

      // Cache the results
      this.cache.set(cacheKey, {
        data: trendingTokens,
        timestamp: Date.now()
      });

      console.log(`🎯 Processed ${trendingTokens.length} valid trending tokens from DexScreener`);
      return trendingTokens;

    } catch (error) {
      console.error('❌ Error fetching from DexScreener:', error.message);
      
      // Return cached data if available, even if stale
      const cached = this.cache.get('trending_solana');
      if (cached) {
        console.log('⚠️ Using stale cached DexScreener data due to error');
        return cached.data;
      }
      
      return [];
    }
  }

  /**
   * Calculate overall quality score for a token pair
   */
  calculateQualityScore(pair) {
    const volume = parseFloat(pair.volume?.h24) || 0;
    const transactions = (pair.txns?.h24?.buys || 0) + (pair.txns?.h24?.sells || 0);
    const liquidity = parseFloat(pair.liquidity?.usd) || 0;
    const marketCap = parseFloat(pair.fdv) || 0;
    
    // Quality scoring: normalize and weight different factors
    const volumeScore = Math.min(10, volume / 1000000); // Volume in millions, capped at 10
    const txnScore = Math.min(10, transactions / 50); // Txns per 50, capped at 10
    const liquidityScore = Math.min(10, liquidity / 100000); // Liquidity per 100K, capped at 10
    const marketCapScore = Math.min(10, Math.log10(marketCap) - 4); // Log scale starting at 100K
    
    // Weighted average: Volume 35%, Transactions 30%, Liquidity 20%, MarketCap 15%
    const qualityScore = (volumeScore * 0.35) + (txnScore * 0.30) + (liquidityScore * 0.20) + (marketCapScore * 0.15);
    
    return Math.round(qualityScore * 100) / 100; // Round to 2 decimal places
  }

  /**
   * Calculate trending bonus based on DexScreener metrics (enhanced for volume/transaction focus)
   */
  calculateDexScreenerBonus(dexData) {
    let bonus = 0;

    // Volume-based bonus (0-2.5 points) - Primary factor
    const volume24h = dexData.volume24h || 0;
    if (volume24h > 20000000) bonus += 2.5;      // $20M+ volume (mega trending)
    else if (volume24h > 10000000) bonus += 2.0; // $10M+ volume
    else if (volume24h > 5000000) bonus += 1.5;  // $5M+ volume  
    else if (volume24h > 2000000) bonus += 1.0;  // $2M+ volume
    else if (volume24h > 500000) bonus += 0.7;   // $500K+ volume
    else if (volume24h > 100000) bonus += 0.4;   // $100K+ volume (minimum threshold)

    // Transaction activity bonus (0-1.5 points) - New focus on TX count
    const transactions = dexData.transactions || 0;
    if (transactions > 500) bonus += 1.5;        // 500+ transactions (very active)
    else if (transactions > 200) bonus += 1.0;   // 200+ transactions
    else if (transactions > 100) bonus += 0.7;   // 100+ transactions
    else if (transactions > 50) bonus += 0.4;    // 50+ transactions
    else if (transactions > 15) bonus += 0.2;    // Minimum activity (15+ txns from our filter)

    // Market cap tier bonus (0-1 point) - Reward quality projects above 100K
    const marketCap = dexData.marketCap || 0;
    if (marketCap > 100000000) bonus += 1.0;     // $100M+ (established)
    else if (marketCap > 50000000) bonus += 0.8; // $50M+ 
    else if (marketCap > 10000000) bonus += 0.6; // $10M+
    else if (marketCap > 1000000) bonus += 0.4;  // $1M+
    else if (marketCap > 100000) bonus += 0.2;   // $100K+ (our minimum)

    // Price momentum bonus (0-1 point)
    const priceChange24h = dexData.priceChange24h || 0;
    const priceChange1h = dexData.priceChange1h || 0;
    
    if (priceChange24h > 100) bonus += 1.0;      // +100% in 24h (moonshot)
    else if (priceChange24h > 50) bonus += 0.8;  // +50% in 24h
    else if (priceChange24h > 20) bonus += 0.5;  // +20% in 24h
    else if (priceChange24h > 10) bonus += 0.3;  // +10% in 24h
    else if (priceChange24h < -30) bonus -= 0.5; // -30% penalty (falling knife)

    if (priceChange1h > 15) bonus += 0.3;        // +15% in 1h momentum
    else if (priceChange1h < -15) bonus -= 0.3;  // -15% momentum penalty

    // Liquidity quality bonus (0-0.5 points)
    const liquidity = dexData.liquidity || 0;
    if (liquidity > 2000000) bonus += 0.5;       // $2M+ liquidity (excellent)
    else if (liquidity > 1000000) bonus += 0.4;  // $1M+ liquidity
    else if (liquidity > 500000) bonus += 0.3;   // $500K+ liquidity
    else if (liquidity > 100000) bonus += 0.2;   // $100K+ liquidity
    else if (liquidity > 25000) bonus += 0.1;    // $25K+ liquidity (our minimum)

    // DexScreener features bonus (0-0.3 points)
    if (dexData.boosts && Object.keys(dexData.boosts).length > 0) {
      bonus += 0.3; // Boosted tokens get extra points
    }

    return Math.min(4.0, Math.max(-1.0, bonus)); // Cap between -1 and +4 (increased max for high-quality tokens)
  }

  /**
   * Get detailed token info from DexScreener
   */
  async getTokenDetails(contractAddress) {
    try {
      console.log(`🔍 Getting detailed data for ${contractAddress.substring(0, 8)}... from DexScreener`);
      
      const response = await axios.get(`${this.baseURL}/dex/tokens/${contractAddress}`, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      if (response.data && response.data.pairs && response.data.pairs.length > 0) {
        const pair = response.data.pairs[0]; // Get the most liquid pair
        return {
          symbol: pair.baseToken.symbol,
          name: pair.baseToken.name,
          contractAddress: pair.baseToken.address,
          dexScreenerData: {
            pairAddress: pair.pairAddress,
            priceUsd: parseFloat(pair.priceUsd) || 0,
            volume24h: parseFloat(pair.volume?.h24) || 0,
            priceChange24h: parseFloat(pair.priceChange?.h24) || 0,
            liquidity: parseFloat(pair.liquidity?.usd) || 0,
            marketCap: parseFloat(pair.fdv) || 0,
            dexId: pair.dexId,
            url: pair.url
          }
        };
      }

      return null;
    } catch (error) {
      console.error(`❌ Error getting token details for ${contractAddress}:`, error.message);
      return null;
    }
  }

  /**
   * Check if DexScreener API is accessible
   */
  async healthCheck() {
    try {
      const response = await axios.get(`${this.baseURL}/dex/tokens/trending`, {
        timeout: 5000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      return response.status === 200;
    } catch (error) {
      console.error('❌ DexScreener health check failed:', error.message);
      return false;
    }
  }
}

const dexScreenerService = new DexScreenerService();
export default dexScreenerService;
