/**
 * Price Monitoring Service
 * Monitors crypto prices and tracks prediction accuracy
 */

class PriceMonitoringService {
  constructor() {
    this.apiKey = process.env.COINGECKO_API_KEY || null;
    this.baseUrl = 'https://api.coingecko.com/api/v3';
    this.priceCache = new Map();
    this.cacheTimeout = 60000; // 1 minute cache
    
    // Rate limiting
    this.lastApiCall = 0;
    this.minApiInterval = 1000; // 1 second between calls
    
    console.log('💰 [PRICE MONITOR] Price Monitoring Service initialized');
  }

  /**
   * Get current price for a token
   */
  async getCurrentPrice(token) {
    try {
      // Check cache first
      const cacheKey = token.toLowerCase();
      const cached = this.priceCache.get(cacheKey);
      
      if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
        return cached.price;
      }

      // Rate limiting
      await this.enforceRateLimit();

      // Fetch from API
      const price = await this.fetchPriceFromAPI(token);
      
      // Cache the result
      this.priceCache.set(cacheKey, {
        price,
        timestamp: Date.now()
      });

      return price;

    } catch (error) {
      console.error(`❌ [PRICE MONITOR] Failed to get price for ${token}:`, error.message);
      return null;
    }
  }

  /**
   * Get historical price for a token
   */
  async getHistoricalPrice(token, timestamp) {
    try {
      // Rate limiting
      await this.enforceRateLimit();

      const url = `${this.baseUrl}/coins/${token.toLowerCase()}/history`;
      const params = new URLSearchParams({
        date: new Date(timestamp).toISOString().split('T')[0] // YYYY-MM-DD format
      });

      const response = await fetch(`${url}?${params}`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.market_data && data.market_data.current_price) {
        return data.market_data.current_price.usd;
      }

      return null;

    } catch (error) {
      console.error(`❌ [PRICE MONITOR] Failed to get historical price for ${token}:`, error.message);
      return null;
    }
  }

  /**
   * Calculate price change percentage
   */
  calculatePriceChange(currentPrice, previousPrice) {
    if (!previousPrice || previousPrice === 0) {
      return 0;
    }
    
    return ((currentPrice - previousPrice) / previousPrice) * 100;
  }

  /**
   * Check prediction accuracy
   */
  async checkPredictionAccuracy(prediction) {
    try {
      const { token, predictedValue, predictionType, createdAt } = prediction;
      
      // Get current price
      const currentPrice = await this.getCurrentPrice(token);
      if (!currentPrice) {
        return null;
      }

      // Get price at prediction time
      const predictionTimePrice = await this.getHistoricalPrice(token, createdAt);
      if (!predictionTimePrice) {
        console.warn(`⚠️ [PRICE MONITOR] Could not get historical price for ${token} at ${createdAt}`);
        return null;
      }

      // Calculate predicted price based on type
      let targetPrice;
      
      if (predictionType === 'multiplier_target') {
        targetPrice = predictionTimePrice * predictedValue.value;
      } else if (predictionType === 'percentage_move') {
        const percentageChange = predictedValue.value / 100;
        targetPrice = predictionTimePrice * (1 + percentageChange);
      } else {
        targetPrice = predictedValue.value;
      }

      // Calculate accuracy
      const accuracy = this.calculateAccuracy(targetPrice, currentPrice);
      
      // Determine status
      const status = this.determinePredictionStatus(accuracy, prediction);

      return {
        currentPrice,
        targetPrice,
        predictionTimePrice,
        priceChange: this.calculatePriceChange(currentPrice, predictionTimePrice),
        accuracy,
        status,
        checkedAt: new Date().toISOString()
      };

    } catch (error) {
      console.error(`❌ [PRICE MONITOR] Failed to check prediction accuracy:`, error.message);
      return null;
    }
  }

  /**
   * Calculate accuracy percentage
   */
  calculateAccuracy(targetPrice, actualPrice) {
    if (!targetPrice || !actualPrice) {
      return 0;
    }

    // Calculate accuracy as percentage (100% = perfect match)
    const error = Math.abs(targetPrice - actualPrice) / targetPrice;
    const accuracy = Math.max(0, (1 - error) * 100);
    
    return Math.round(accuracy * 100) / 100; // Round to 2 decimal places
  }

  /**
   * Determine prediction status
   */
  determinePredictionStatus(accuracy, prediction) {
    if (accuracy >= 90) {
      return 'excellent';
    } else if (accuracy >= 75) {
      return 'good';
    } else if (accuracy >= 50) {
      return 'fair';
    } else if (accuracy >= 25) {
      return 'poor';
    } else {
      return 'very_poor';
    }
  }

  /**
   * Fetch price from CoinGecko API
   */
  async fetchPriceFromAPI(token) {
    try {
      const url = `${this.baseUrl}/simple/price`;
      const params = new URLSearchParams({
        ids: token.toLowerCase(),
        vs_currencies: 'usd',
        include_24hr_change: 'true'
      });

      const response = await fetch(`${url}?${params}`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data[token.toLowerCase()] && data[token.toLowerCase()].usd) {
        return data[token.toLowerCase()].usd;
      }

      throw new Error(`Price not found for token: ${token}`);

    } catch (error) {
      console.error(`❌ [PRICE MONITOR] API fetch failed for ${token}:`, error.message);
      throw error;
    }
  }

  /**
   * Enforce rate limiting
   */
  async enforceRateLimit() {
    const now = Date.now();
    const timeSinceLastCall = now - this.lastApiCall;
    
    if (timeSinceLastCall < this.minApiInterval) {
      const waitTime = this.minApiInterval - timeSinceLastCall;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastApiCall = Date.now();
  }

  /**
   * Get multiple token prices at once
   */
  async getMultiplePrices(tokens) {
    try {
      // Rate limiting
      await this.enforceRateLimit();

      const url = `${this.baseUrl}/simple/price`;
      const params = new URLSearchParams({
        ids: tokens.map(t => t.toLowerCase()).join(','),
        vs_currencies: 'usd',
        include_24hr_change: 'true'
      });

      const response = await fetch(`${url}?${params}`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      const prices = {};
      tokens.forEach(token => {
        const tokenData = data[token.toLowerCase()];
        if (tokenData && tokenData.usd) {
          prices[token] = {
            price: tokenData.usd,
            change24h: tokenData.usd_24h_change || 0
          };
        }
      });

      return prices;

    } catch (error) {
      console.error(`❌ [PRICE MONITOR] Failed to get multiple prices:`, error.message);
      return {};
    }
  }

  /**
   * Get price statistics for a token
   */
  async getTokenPriceStats(token, days = 7) {
    try {
      // Rate limiting
      await this.enforceRateLimit();

      const url = `${this.baseUrl}/coins/${token.toLowerCase()}/market_chart`;
      const params = new URLSearchParams({
        vs_currency: 'usd',
        days: days.toString(),
        interval: days <= 1 ? 'hourly' : 'daily'
      });

      const response = await fetch(`${url}?${params}`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.prices && data.prices.length > 0) {
        const prices = data.prices.map(([timestamp, price]) => ({ timestamp, price }));
        const volumes = data.total_volumes.map(([timestamp, volume]) => ({ timestamp, volume }));
        
        return {
          prices,
          volumes,
          priceRange: {
            min: Math.min(...prices.map(p => p.price)),
            max: Math.max(...prices.map(p => p.price))
          },
          averagePrice: prices.reduce((sum, p) => sum + p.price, 0) / prices.length,
          priceChange: prices.length > 1 ? 
            ((prices[prices.length - 1].price - prices[0].price) / prices[0].price) * 100 : 0
        };
      }

      return null;

    } catch (error) {
      console.error(`❌ [PRICE MONITOR] Failed to get price stats for ${token}:`, error.message);
      return null;
    }
  }

  /**
   * Clear price cache
   */
  clearCache() {
    this.priceCache.clear();
    console.log('🧹 [PRICE MONITOR] Price cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      size: this.priceCache.size,
      tokens: Array.from(this.priceCache.keys()),
      oldestEntry: this.priceCache.size > 0 ? 
        Math.min(...Array.from(this.priceCache.values()).map(v => v.timestamp)) : null
    };
  }
}

export default PriceMonitoringService;
