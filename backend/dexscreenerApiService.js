import axios from 'axios';

class DexscreenerApiService {
  constructor() {
    // Dexscreener API endpoints
    this.baseURL = 'https://api.dexscreener.com';
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes cache (data changes frequently)
  }

  /**
   * Clear cache to force fresh data
   */
  clearCache() {
    this.cache.clear();
    console.log('🧹 Dexscreener API cache cleared');
  }

  /**
   * Get trending Solana memecoin pairs dynamically from Dexscreener
   * Uses intelligent discovery to find trending tokens without hardcoding
   */
  async getTrendingPairs(limit = 100) {
    // Dexscreener allows more than 30, let's test higher limits
    limit = Math.min(limit, 200); // Allow up to 200 for testing

    try {
      const cacheKey = `dexscreener_trending_${limit}`;
      const cached = this.cache.get(cacheKey);

      if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
        console.log('🟢 Using cached Dexscreener trending data');
        return cached.data;
      }

      console.log(`🔍 Dynamically discovering trending Solana memecoins from Dexscreener...`);

      // STRATEGY 1: Reduced trending terms to avoid rate limits (403 errors)
      const trendingSearchTerms = [
        'meme', 'pump', 'wif', 'pepe', 'doge'  // Only top 5 most effective terms
      ];

      // STRATEGY 2: Reduced DEX terms to avoid rate limits
      const dexSearchTerms = [
        'raydium', 'orca', 'jupiter'  // Only top 3 most active DEXes
      ];

      const allSearchTerms = [...trendingSearchTerms, ...dexSearchTerms];
      const discoveredTokens = new Map(); // symbol -> pair data
      const processedPairs = new Set(); // pair address deduplication

      // Discover trending tokens dynamically
      for (const searchTerm of allSearchTerms) {
        if (discoveredTokens.size >= limit * 1.5) break; // Get 50% more than needed for better selection

        try {
          console.log(`🔍 Searching for: "${searchTerm}"`);
          const searchResults = await this.searchPairs(searchTerm, 20); // Get more results per search

          for (const pair of searchResults) {
            if (processedPairs.has(pair.pairAddress)) continue;

            // SMART FILTERING: Identify true Solana memecoins
            const isSolanaMemecoin = this.isSolanaMemecoin(pair);

            if (isSolanaMemecoin && pair.volume24h > 1000) { // Minimum volume threshold
              discoveredTokens.set(pair.symbol, pair);
              processedPairs.add(pair.pairAddress);
              console.log(`🎯 Discovered Solana memecoin: ${pair.symbol} ($${pair.volume24h?.toLocaleString()} vol)`);
            }
          }

          // Increased delay to prevent 403 rate limit errors
          await new Promise(resolve => setTimeout(resolve, 20000)); // 20 seconds between searches

        } catch (error) {
          console.log(`⚠️ Search failed for "${searchTerm}":`, error.message);
          continue;
        }
      }

      // Convert to array and sort by multiple factors for "trendiness"
      const trendingPairs = Array.from(discoveredTokens.values())
        .map(pair => ({
          ...pair,
          // Calculate trend score: volume + recent price action
          trendScore: (pair.volume24h || 0) * (Math.abs(pair.priceChange24h || 0) + 1)
        }))
        .sort((a, b) => b.trendScore - a.trendScore) // Sort by trendiness
        .slice(0, limit); // Take top N

      console.log(`✅ Dynamically discovered ${trendingPairs.length} trending Solana memecoins`);

      // Cache the results
      this.cache.set(cacheKey, {
        data: trendingPairs,
        timestamp: Date.now()
      });

      return trendingPairs;

    } catch (error) {
      console.error('❌ Error in dynamic trending discovery:', error.message);
      const cached = this.cache.get(`dexscreener_trending_${limit}`);
      return cached ? cached.data : [];
    }
  }

  /**
   * Smart filtering to identify true Solana memecoins
   */
  isSolanaMemecoin(pair) {
    // Must be on Solana
    const isSolana = pair.chainId === 'solana' ||
                    (pair.contractAddress && (
                      pair.contractAddress.startsWith('So') ||
                      pair.contractAddress.length === 43 ||
                      pair.contractAddress.includes('pump')
                    ));

    if (!isSolana) return false;

    // Must NOT be a stablecoin or major token
    const symbol = pair.symbol || '';
    const isStablecoin = symbol.includes('SOL') ||
                        symbol.includes('USDC') ||
                        symbol.includes('USDT') ||
                        symbol.includes('UST') ||
                        symbol.includes('wBNB') ||
                        symbol.includes('wETH');

    const isMajorToken = ['BTC', 'ETH', 'BNB', 'ADA', 'DOT', 'LINK', 'UNI', 'AAVE'].includes(symbol);

    // Must NOT be a stablecoin contract
    const stableContracts = [
      'So11111111111111111111111111111111111111112', // Wrapped SOL
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
      'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'  // USDT
    ];

    const isStableContract = stableContracts.includes(pair.contractAddress);

    // Must have reasonable market cap (not too big for a memecoin)
    const isReasonableSize = !pair.marketCap || pair.marketCap < 1000000000; // Under $1B

    return !isStablecoin && !isMajorToken && !isStableContract && isReasonableSize;
  }

  /**
   * Process the raw Dexscreener response into structured token data
   */
  processTrendingPairs(rawPairs) {
    const processedTokens = [];

    for (const pair of rawPairs) {
      try {
        // Skip if not a valid pair
        if (!pair || !pair.baseToken || !pair.quoteToken) {
          continue;
        }

        const baseToken = pair.baseToken;
        const quoteToken = pair.quoteToken;

        // Create structured token data
        const processedToken = {
          // Token being traded (the non-stablecoin)
          contractAddress: baseToken.address,
          symbol: baseToken.symbol || 'UNKNOWN',
          name: baseToken.name || baseToken.symbol || 'Unknown Token',

          // Trading pair information
          pair: {
            base: {
              symbol: baseToken.symbol || 'UNKNOWN',
              address: baseToken.address,
              name: baseToken.name || 'Unknown'
            },
            target: {
              symbol: quoteToken.symbol || 'UNKNOWN',
              address: quoteToken.address,
              name: quoteToken.name || 'Unknown'
            }
          },

          // DEX information
          dex: {
            protocolName: pair.dexId || 'Unknown',
            protocolFamily: 'DEX'
          },

          // Trading metrics from Dexscreener
          price: pair.priceUsd ? parseFloat(pair.priceUsd) : 0,
          volume24h: pair.volume?.h24 ? parseFloat(pair.volume.h24) : 0,
          priceChange24h: pair.priceChange?.h24 ? parseFloat(pair.priceChange.h24) : 0,
          liquidity: pair.liquidity?.usd ? parseFloat(pair.liquidity.usd) : 0,
          marketCap: pair.marketCap ? parseFloat(pair.marketCap) : 0,

          // Dexscreener specific data
          pairAddress: pair.pairAddress,
          chainId: pair.chainId || 'unknown',

          // Metadata
          source: 'DEXSCREENER',
          fetchedAt: new Date().toISOString(),
          dataCompleteness: 'full' // Dexscreener provides comprehensive data
        };

        processedTokens.push(processedToken);

      } catch (processingError) {
        console.error('⚠️ Error processing pair data:', processingError.message);
        continue;
      }
    }

    return processedTokens;
  }

  /**
   * Get detailed information for a specific token pair
   * Note: Dexscreener doesn't have a direct pair info endpoint, so we'll use search
   */
  async getPairInfo(pairAddress) {
    try {
      const cacheKey = `dexscreener_pair_${pairAddress}`;
      const cached = this.cache.get(cacheKey);

      if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
        console.log('🟢 Using cached Dexscreener pair data');
        return cached.data;
      }

      console.log(`🔍 Fetching pair info from Dexscreener for ${pairAddress.substring(0, 8)}...`);

      // Since direct pair endpoint doesn't work, we'll search for the pair address
      // This is a workaround since Dexscreener's API structure is different
      const response = await axios.get(
        `${this.baseURL}/latest/dex/search`,
        {
          params: {
            q: pairAddress
          },
          timeout: 15000
        }
      );

      if (response.data && response.data.pairs && response.data.pairs.length > 0) {
        // Find the exact pair by address
        const exactPair = response.data.pairs.find(pair => pair.pairAddress === pairAddress);

        if (exactPair) {
          const processedPair = this.processTrendingPairs([exactPair])[0];

          // Cache the results
          this.cache.set(cacheKey, {
            data: processedPair,
            timestamp: Date.now()
          });

          console.log(`✅ Retrieved pair info for ${pairAddress.substring(0, 8)}`);
          return processedPair;
        } else {
          console.log(`⚠️ Pair ${pairAddress.substring(0, 8)} not found in search results`);
          return null;
        }
      } else {
        console.log('❌ No pair data received from Dexscreener API');
        return null;
      }

    } catch (error) {
      console.error('❌ Error fetching Dexscreener pair info:', error.message);

      // Return cached data if available
      const cached = this.cache.get(`dexscreener_pair_${pairAddress}`);
      return cached ? cached.data : null;
    }
  }

  /**
   * Search for pairs by token symbol or name
   */
  async searchPairs(query, limit = 10) {
    try {
      const cacheKey = `dexscreener_search_${query}_${limit}`;
      const cached = this.cache.get(cacheKey);

      if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
        console.log('🟢 Using cached Dexscreener search data');
        return cached.data;
      }

      console.log(`🔍 Searching Dexscreener for "${query}" (limit: ${limit})...`);

      const response = await axios.get(
        `${this.baseURL}/latest/dex/search`,
        {
          params: {
            q: query
          },
          timeout: 15000
        }
      );

      if (response.data && response.data.pairs) {
        const limitedPairs = response.data.pairs.slice(0, limit);
        const processedPairs = this.processTrendingPairs(limitedPairs);

        // Cache the results
        this.cache.set(cacheKey, {
          data: processedPairs,
          timestamp: Date.now()
        });

        console.log(`✅ Found ${processedPairs.length} pairs for "${query}"`);
        return processedPairs;
      } else {
        console.log('❌ No search results received from Dexscreener API');
        return [];
      }

    } catch (error) {
      console.error('❌ Error searching Dexscreener:', error.message);

      // Return cached data if available
      const cached = this.cache.get(`dexscreener_search_${query}_${limit}`);
      return cached ? cached.data : [];
    }
  }

  /**
   * Test the API connection and basic functionality
   */
  async testConnection() {
    try {
      console.log('🧪 Testing Dexscreener API connection...');

      const result = await this.getTrendingPairs(5); // Test with just 5 pairs

      if (result && result.length > 0) {
        console.log('✅ Dexscreener API connection successful!');
        console.log(`📊 Retrieved ${result.length} test pairs`);

        // Show a sample result
        const sample = result[0];
        console.log(`📈 Sample pair: ${sample.symbol}/${sample.pair.target.symbol}`);
        console.log(`💰 Price: $${sample.price?.toFixed(6) || 'N/A'}`);
        console.log(`📊 24h Volume: $${sample.volume24h?.toLocaleString() || 'N/A'}`);

        return { success: true, pairCount: result.length };
      } else {
        console.log('⚠️ Dexscreener API connected but returned no data');
        return { success: true, pairCount: 0 };
      }

    } catch (error) {
      console.error('❌ Dexscreener API connection failed:', error.message);
      return { success: false, error: error.message };
    }
  }
}

export default DexscreenerApiService;
