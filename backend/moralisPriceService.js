import axios from 'axios';

/**
 * MORALIS PRICE SERVICE
 * Fetches historical price data for Solana tokens using Moralis API
 * Based on: https://docs.moralis.com/web3-data-api/evm/token-api/how-to-build-tradingview-crypto-charts
 */
class MoralisPriceService {
  constructor() {
    this.apiKey = process.env.MORALIS_API_KEY;
    this.baseURL = 'https://solana-gateway.moralis.io';
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes cache
  }

  /**
   * Get historical price data for a Solana token
   * @param {string} contractAddress - Token contract address
   * @param {string} timeframe - Timeframe: '1D', '1W', '1M', '3M', '1Y', 'ALL'
   * @param {number} limit - Number of data points (max 2000)
   * @returns {Object} Chart data in TradingView format
   */
  async getHistoricalPrices(contractAddress, timeframe = '1D', limit = 1000) {
    try {
      if (!this.apiKey) {
        throw new Error('Moralis API key not configured');
      }

      const cacheKey = `moralis_${contractAddress}_${timeframe}_${limit}`;
      const cached = this.cache.get(cacheKey);

      if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
        console.log(`🟢 Using cached Moralis price data for ${contractAddress.substring(0, 8)}`);
        return cached.data;
      }

      console.log(`🔍 Fetching historical price data from Moralis for ${contractAddress.substring(0, 8)} (${timeframe})`);

      // Calculate time range based on timeframe
      const timeRange = this.calculateTimeRange(timeframe);
      const fromDate = timeRange.from;
      const toDate = timeRange.to;

      // Try the correct Moralis Solana API endpoint
      const response = await axios.get(`${this.baseURL}/token/${contractAddress}/price/history`, {
        params: {
          chain: 'solana',
          from_date: fromDate,
          to_date: toDate,
          limit: Math.min(limit, 2000)
        },
        headers: {
          'X-API-Key': this.apiKey,
          'Accept': 'application/json'
        },
        timeout: 15000
      });

      if (!response.data || !response.data.result) {
        throw new Error('No price data received from Moralis API');
      }

      // Transform Moralis data to TradingView format
      const chartData = this.transformToTradingViewFormat(response.data.result, contractAddress);

      // Cache the results
      this.cache.set(cacheKey, {
        data: chartData,
        timestamp: Date.now()
      });

      console.log(`✅ Retrieved ${chartData.length} price data points for ${contractAddress.substring(0, 8)}`);
      return chartData;

    } catch (error) {
      console.error('❌ Error fetching Moralis price data:', error.message);
      
      // Return cached data if available
      const cached = this.cache.get(`moralis_${contractAddress}_${timeframe}_${limit}`);
      if (cached) {
        console.log('🔄 Returning cached data due to API error');
        return cached.data;
      }
      
      throw error;
    }
  }

  /**
   * Calculate time range based on timeframe
   */
  calculateTimeRange(timeframe) {
    const now = new Date();
    const toDate = now.toISOString();

    let fromDate;
    switch (timeframe) {
      case '1D':
        fromDate = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
        break;
      case '1W':
        fromDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
        break;
      case '1M':
        fromDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
        break;
      case '3M':
        fromDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
        break;
      case '1Y':
        fromDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString();
        break;
      case 'ALL':
        // Go back 2 years for "ALL" timeframe
        fromDate = new Date(now.getTime() - 2 * 365 * 24 * 60 * 60 * 1000).toISOString();
        break;
      default:
        fromDate = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    }

    return { from: fromDate, to: toDate };
  }

  /**
   * Transform Moralis data to TradingView format
   * @param {Array} moralisData - Raw data from Moralis API
   * @param {string} contractAddress - Token contract address
   * @returns {Array} TradingView format data
   */
  transformToTradingViewFormat(moralisData, contractAddress) {
    if (!Array.isArray(moralisData)) {
      console.warn('⚠️ Moralis data is not an array:', moralisData);
      return [];
    }

    return moralisData.map((item, index) => {
      // Moralis returns data in format: { date: "2025-01-15T00:00:00.000Z", value: "0.0322" }
      const timestamp = new Date(item.date).getTime() / 1000; // Convert to Unix timestamp
      const price = parseFloat(item.value) || 0;

      return {
        time: timestamp,
        value: price,
        // Additional data for enhanced chart features
        volume: item.volume || 0,
        marketCap: item.marketCap || 0,
        // TradingView format
        open: price,
        high: price,
        low: price,
        close: price
      };
    }).sort((a, b) => a.time - b.time); // Sort by time ascending
  }

  /**
   * Get current price for a token
   * @param {string} contractAddress - Token contract address
   * @returns {Object} Current price data
   */
  async getCurrentPrice(contractAddress) {
    try {
      if (!this.apiKey) {
        throw new Error('Moralis API key not configured');
      }

      const cacheKey = `moralis_current_${contractAddress}`;
      const cached = this.cache.get(cacheKey);

      if (cached && Date.now() - cached.timestamp < 60000) { // 1 minute cache for current price
        return cached.data;
      }

      console.log(`🔍 Fetching current price from Moralis for ${contractAddress.substring(0, 8)}`);

      const response = await axios.get(`${this.baseURL}/token/${contractAddress}/price`, {
        params: {
          chain: 'solana'
        },
        headers: {
          'X-API-Key': this.apiKey,
          'Accept': 'application/json'
        },
        timeout: 10000
      });

      if (!response.data || !response.data.usdPrice) {
        throw new Error('No current price data received from Moralis API');
      }

      const priceData = {
        price: parseFloat(response.data.usdPrice),
        timestamp: new Date().toISOString(),
        contractAddress: contractAddress
      };

      // Cache the results
      this.cache.set(cacheKey, {
        data: priceData,
        timestamp: Date.now()
      });

      console.log(`✅ Current price for ${contractAddress.substring(0, 8)}: $${priceData.price}`);
      return priceData;

    } catch (error) {
      console.error('❌ Error fetching current price from Moralis:', error.message);
      throw error;
    }
  }

  /**
   * Get available timeframes
   */
  getAvailableTimeframes() {
    return [
      { value: '1D', label: '1 Day', days: 1 },
      { value: '1W', label: '1 Week', days: 7 },
      { value: '1M', label: '1 Month', days: 30 },
      { value: '3M', label: '3 Months', days: 90 },
      { value: '1Y', label: '1 Year', days: 365 },
      { value: 'ALL', label: 'All Time', days: 730 }
    ];
  }

  /**
   * Check if service is properly configured
   */
  isConfigured() {
    return !!this.apiKey;
  }

  /**
   * Get service status
   */
  getStatus() {
    return {
      configured: this.isConfigured(),
      cacheSize: this.cache.size,
      apiKey: this.apiKey ? `${this.apiKey.substring(0, 8)}...` : 'Not set'
    };
  }
}

export default MoralisPriceService;
