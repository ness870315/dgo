import axios from 'axios';

/**
 * Standalone Moralis service for pre-bonding tokens
 * This service fetches chart data WITHOUT triggering HybridChartService,
 * background workers, WebSocket monitoring, or any chart database operations.
 */
class PreBondingMoralisService {
  constructor() {
    this.moralisApiKey = process.env.MORALIS_API_KEY;
    this.pairAddressCache = new Map(); // Simple in-memory cache
  }

  /**
   * Convert our timeframe format to Moralis format
   */
  convertTimeframeToMoralis(timeframe) {
    const timeframeMap = {
      '1MIN': '1min',
      '5MIN': '5min',
      '15MIN': '15min',
      '30MIN': '30min',
      '1H': '1hour',
      '4H': '4hour',
      '1D': '1day'
    };
    return timeframeMap[timeframe] || '5min';
  }

  /**
   * Calculate time range for Moralis API
   */
  calculateTimeRange(timeframe, beforeTime, afterTime) {
    const now = Date.now();
    const timeRanges = {
      '1MIN': 60 * 60 * 1000,        // 1 hour
      '5MIN': 5 * 60 * 60 * 1000,    // 5 hours
      '15MIN': 15 * 60 * 60 * 1000,  // 15 hours
      '30MIN': 30 * 60 * 60 * 1000,  // 30 hours
      '1H': 7 * 24 * 60 * 60 * 1000, // 7 days
      '4H': 30 * 24 * 60 * 60 * 1000, // 30 days
      '1D': 90 * 24 * 60 * 60 * 1000  // 90 days
    };

    const range = timeRanges[timeframe] || timeRanges['5MIN'];
    const to = beforeTime || now;
    const from = afterTime || (to - range);

    // Format as ISO8601
    return {
      from: new Date(from).toISOString(),
      to: new Date(to).toISOString()
    };
  }

  /**
   * Get pair address from Jupiter API (for pool address)
   * Simple cache, no database interaction
   */
  async getPairAddress(contractAddress) {
    // Check cache first
    if (this.pairAddressCache.has(contractAddress)) {
      return this.pairAddressCache.get(contractAddress);
    }

    try {
      const JUPITER_API_ENDPOINT = process.env.JUP_API_ENDPOINT || 'https://api.jup.ag';
      const JUPITER_API_KEY = process.env.JUP_API_KEY || '';
      
      const headers = {};
      if (JUPITER_API_KEY) {
        headers['x-api-key'] = JUPITER_API_KEY;
      }
      
      const response = await axios.get(`${JUPITER_API_ENDPOINT}/tokens/v2/search?query=${contractAddress}`, {
        headers: headers,
        timeout: 10000
      });
      
      if (response.data && Array.isArray(response.data) && response.data.length > 0) {
        const rawJupiterData = response.data[0];
        let pairAddress = rawJupiterData.graduatedPool || rawJupiterData.firstPool?.id;
        
        // If no pool from Jupiter, try Moralis
        if (!pairAddress) {
          const pairsResponse = await axios.get(`https://solana-gateway.moralis.io/token/mainnet/${contractAddress}/pairs`, {
            headers: {
              'X-API-Key': this.moralisApiKey,
              'Accept': 'application/json'
            },
            timeout: 10000
          });
          
          if (pairsResponse.data?.result && pairsResponse.data.result.length > 0) {
            pairAddress = pairsResponse.data.result[0].pair_address;
          }
        }
        
        if (pairAddress) {
          // Cache it
          this.pairAddressCache.set(contractAddress, pairAddress);
          return pairAddress;
        }
      }
    } catch (error) {
      console.log(`⚠️ [PreBonding-Moralis] Failed to get pair address: ${error.message}`);
    }

    throw new Error('Unable to find pair address for pre-bonding token');
  }

  /**
   * Try multiple timeframes to find data
   */
  async tryMultipleTimeframes(pairAddress, timeRange, limit) {
    const timeframes = ['5min', '15min', '30min', '1hour', '4hour', '1day'];
    
    for (const timeframe of timeframes) {
      try {
        console.log(`🔄 [PreBonding-Moralis] Trying ${timeframe} timeframe...`);
        
        const response = await axios.get(`https://solana-gateway.moralis.io/token/mainnet/pairs/${pairAddress}/ohlcv`, {
          params: {
            timeframe: timeframe,
            currency: 'usd',
            fromDate: timeRange.from,
            toDate: timeRange.to,
            limit: limit
          },
          headers: {
            'X-API-Key': this.moralisApiKey,
            'Accept': 'application/json'
          },
          timeout: 10000
        });

        if (response.data?.result && response.data.result.length > 0) {
          const chartData = response.data.result.map(item => ({
            time: Math.floor(new Date(item.timestamp).getTime() / 1000),
            value: item.close,
            open: item.open,
            high: item.high,
            low: item.low,
            close: item.close,
            timeframe: timeframe
          }));
          
          console.log(`✅ [PreBonding-Moralis] Got ${chartData.length} data points with ${timeframe}`);
          return chartData;
        }
      } catch (error) {
        console.log(`⚠️ [PreBonding-Moralis] ${timeframe} failed: ${error.message}`);
      }
    }
    
    return [];
  }

  /**
   * Get data from DexScreener as fallback
   */
  async getDexScreenerData(contractAddress, timeRange) {
    try {
      console.log(`🔄 [PreBonding-DexScreener] Trying DexScreener fallback for ${contractAddress.substring(0, 8)}...`);
      
      const response = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${contractAddress}`, {
        timeout: 10000
      });

      if (response.data?.pairs && response.data.pairs.length > 0) {
        const pair = response.data.pairs[0];
        
        if (pair.priceUsd && pair.priceChange) {
          // Create synthetic data points based on current price
          const now = Math.floor(Date.now() / 1000);
          const price = parseFloat(pair.priceUsd);
          const change = parseFloat(pair.priceChange.h24 || 0);
          
          // Create 5 data points over the last 5 hours
          const chartData = [];
          for (let i = 0; i < 5; i++) {
            const time = now - (i * 3600); // 1 hour intervals
            const syntheticPrice = price * (1 + (change / 100) * (i / 5)); // Gradual price change
            
            chartData.push({
              time: time,
              value: syntheticPrice,
              open: syntheticPrice,
              high: syntheticPrice * 1.02,
              low: syntheticPrice * 0.98,
              close: syntheticPrice,
              timeframe: 'dexscreen-synthetic'
            });
          }
          
          console.log(`✅ [PreBonding-DexScreener] Got synthetic data from DexScreener`);
          return chartData;
        }
      }
    } catch (error) {
      console.log(`⚠️ [PreBonding-DexScreener] DexScreener failed: ${error.message}`);
    }
    
    return [];
  }

  /**
   * Get OHLCV price data from Moralis with multiple timeframe fallbacks and DexScreener
   * STANDALONE - no database, no workers, no WebSocket
   */
  async getChartData(contractAddress, timeframe = '5MIN', limit = 100, beforeTime = null, afterTime = null) {
    if (!this.moralisApiKey) {
      throw new Error('Moralis API key not configured');
    }

    try {
      // Get pair address
      const pairAddress = await this.getPairAddress(contractAddress);
      
      // Calculate time range
      const timeRange = this.calculateTimeRange(timeframe, beforeTime, afterTime);
      const moralisTimeframe = this.convertTimeframeToMoralis(timeframe);
      
      console.log(`📊 [PreBonding-Moralis] Fetching ${moralisTimeframe} data for ${contractAddress.substring(0, 8)}`);
      console.log(`📊 [PreBonding-Moralis] Time range: ${timeRange.from} to ${timeRange.to}`);
      
      // Try primary timeframe first
      const response = await axios.get(`https://solana-gateway.moralis.io/token/mainnet/pairs/${pairAddress}/ohlcv`, {
        params: {
          timeframe: moralisTimeframe,
          currency: 'usd',
          fromDate: timeRange.from,
          toDate: timeRange.to,
          limit: limit
        },
        headers: {
          'X-API-Key': this.moralisApiKey,
          'Accept': 'application/json'
        },
        timeout: 15000
      });

      if (response.data?.result && response.data.result.length > 0) {
        const chartData = response.data.result.map(item => ({
          time: Math.floor(new Date(item.timestamp).getTime() / 1000),
          value: item.close,
          open: item.open,
          high: item.high,
          low: item.low,
          close: item.close,
          timeframe: moralisTimeframe
        }));

        console.log(`✅ [PreBonding-Moralis] Got ${chartData.length} data points`);
        return chartData;
      }

      console.log(`⚠️ [PreBonding-Moralis] No data available for ${timeframe}`);
      
      // Try multiple timeframes
      const multiTimeframeData = await this.tryMultipleTimeframes(pairAddress, timeRange, limit);
      if (multiTimeframeData.length > 0) {
        return multiTimeframeData;
      }
      
      // Try DexScreener as final fallback
      const dexScreenerData = await this.getDexScreenerData(contractAddress, timeRange);
      if (dexScreenerData.length > 0) {
        return dexScreenerData;
      }
      
      console.log(`❌ [PreBonding-Moralis] No data available from any source`);
      return [];
      
    } catch (error) {
      console.error(`❌ [PreBonding-Moralis] Error: ${error.message}`);
      
      // Try DexScreener as fallback on error
      try {
        const timeRange = this.calculateTimeRange(timeframe, beforeTime, afterTime);
        const dexScreenerData = await this.getDexScreenerData(contractAddress, timeRange);
        if (dexScreenerData.length > 0) {
          console.log(`✅ [PreBonding-Moralis] Using DexScreener fallback after error`);
          return dexScreenerData;
        }
      } catch (fallbackError) {
        console.error(`❌ [PreBonding-Moralis] DexScreener fallback also failed: ${fallbackError.message}`);
      }
      
      throw error;
    }
  }
}

export default PreBondingMoralisService;

