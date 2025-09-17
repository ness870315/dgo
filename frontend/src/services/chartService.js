class ChartService {
  constructor() {
    this.API_BASE = process.env.REACT_APP_API_BASE_URL || 'https://api.degen-oracle.com';
    
    // In-memory cache for chart data (per timeframe)
    this.chartCache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Get cache key for chart data
   */
  getCacheKey(contractAddress, timeframe) {
    return `${contractAddress}_${timeframe}`;
  }

  /**
   * Check if cached data is still valid
   */
  isCacheValid(cacheEntry) {
    return cacheEntry && (Date.now() - cacheEntry.timestamp) < this.cacheTimeout;
  }

  /**
   * Get cached chart data if available and valid
   */
  getCachedChart(contractAddress, timeframe) {
    const cacheKey = this.getCacheKey(contractAddress, timeframe);
    const cached = this.chartCache.get(cacheKey);
    
    if (this.isCacheValid(cached)) {
      console.log(`📦 Using cached chart data for ${timeframe}`);
      return cached.data;
    }
    
    return null;
  }

  /**
   * Cache chart data
   */
  setCachedChart(contractAddress, timeframe, data) {
    const cacheKey = this.getCacheKey(contractAddress, timeframe);
    this.chartCache.set(cacheKey, {
      data: data,
      timestamp: Date.now(),
      oldestTime: data?.data?.[0]?.time || null,
      newestTime: data?.data?.[data?.data?.length - 1]?.time || null
    });
    console.log(`💾 Cached chart data for ${timeframe} (${data?.data?.length || 0} candles)`);
  }

  /**
   * Lazy load older bars when user scrolls left
   * @param {string} contractAddress - Token contract address
   * @param {string} timeframe - Current timeframe
   * @param {number} beforeTime - Load bars before this timestamp
   * @param {number} limit - Number of older bars to load
   */
  async loadOlderBars(contractAddress, timeframe, beforeTime, limit = 500) {
    try {
      console.log(`📜 Loading ${limit} older bars for ${timeframe} before ${new Date(beforeTime * 1000).toISOString()}`);
      
      const response = await fetch(
        `${this.API_BASE}/api/tokens/${contractAddress}/price-chart?timeframe=${timeframe}&limit=${limit}&before=${beforeTime}`
      );
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const olderData = await response.json();
      
      // Merge with existing cached data
      const cacheKey = this.getCacheKey(contractAddress, timeframe);
      const existing = this.chartCache.get(cacheKey);
      
      if (existing && olderData?.data?.length > 0) {
        // Prepend older data (maintain ascending time order)
        const mergedData = {
          ...existing.data,
          data: [...olderData.data, ...existing.data.data],
          count: existing.data.count + olderData.data.length
        };
        
        // Update cache with merged data
        this.chartCache.set(cacheKey, {
          data: mergedData,
          timestamp: existing.timestamp,
          oldestTime: olderData.data[0]?.time || existing.oldestTime,
          newestTime: existing.newestTime
        });
        
        console.log(`🔄 Merged ${olderData.data.length} older bars. Total: ${mergedData.data.length} candles`);
        return mergedData;
      }
      
      return olderData;
    } catch (error) {
      console.error('Failed to load older bars:', error);
      throw error;
    }
  }

  /**
   * Diff-append new candles instead of refetching entire dataset
   * @param {string} contractAddress - Token contract address  
   * @param {string} timeframe - Current timeframe
   */
  async appendNewCandles(contractAddress, timeframe) {
    try {
      const cacheKey = this.getCacheKey(contractAddress, timeframe);
      const existing = this.chartCache.get(cacheKey);
      
      if (!existing || !existing.newestTime) {
        // No existing data, fetch normally
        return await this.getPriceChart(contractAddress, timeframe);
      }
      
      console.log(`🔄 Fetching new candles for ${timeframe} after ${new Date(existing.newestTime * 1000).toISOString()}`);
      
      const response = await fetch(
        `${this.API_BASE}/api/tokens/${contractAddress}/price-chart?timeframe=${timeframe}&after=${existing.newestTime}&limit=100`
      );
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const newData = await response.json();
      
      if (newData?.data?.length > 0) {
        // Append new data (maintain ascending time order)
        const mergedData = {
          ...existing.data,
          data: [...existing.data.data, ...newData.data],
          count: existing.data.count + newData.data.length
        };
        
        // Update cache with merged data
        this.chartCache.set(cacheKey, {
          data: mergedData,
          timestamp: Date.now(), // Update timestamp for fresh data
          oldestTime: existing.oldestTime,
          newestTime: newData.data[newData.data.length - 1]?.time || existing.newestTime
        });
        
        console.log(`➕ Appended ${newData.data.length} new candles. Total: ${mergedData.data.length} candles`);
        return mergedData;
      }
      
      // No new data, return existing
      return existing.data;
    } catch (error) {
      console.error('Failed to append new candles:', error);
      // Fallback to full refresh
      return await this.getPriceChart(contractAddress, timeframe);
    }
  }

  async getMcapChart(contractAddress, calledAt) {
    try {
      const response = await fetch(
        `${this.API_BASE}/api/tokens/${contractAddress}/mcap-chart?calledAt=${encodeURIComponent(calledAt)}`
      );
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Failed to fetch mcap chart:', error);
      throw error;
    }
  }

  /**
   * Get historical price data for a token (with caching)
   * @param {string} contractAddress - Token contract address
   * @param {string} timeframe - Timeframe: '1MIN', '5MIN', '15MIN', '1H', '4H', '1D', '1W', '1M'
   * @param {number} limit - Number of data points (auto-optimized if not specified)
   * @returns {Promise<Object>} Chart data response
   */
  async getPriceChart(contractAddress, timeframe = '1D', limit = null) {
    try {
      // Check cache first
      const cached = this.getCachedChart(contractAddress, timeframe);
      if (cached) {
        return cached;
      }

      // Fetch from API (limit is auto-optimized on backend if null)
      const url = limit 
        ? `${this.API_BASE}/api/tokens/${contractAddress}/price-chart?timeframe=${timeframe}&limit=${limit}`
        : `${this.API_BASE}/api/tokens/${contractAddress}/price-chart?timeframe=${timeframe}`;
        
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data = await response.json();
      
      // Cache the result
      this.setCachedChart(contractAddress, timeframe, data);
      
      return data;
    } catch (error) {
      console.error('Failed to fetch price chart:', error);
      throw error;
    }
  }

  /**
   * Get current price for a token
   * @param {string} contractAddress - Token contract address
   * @returns {Promise<Object>} Current price data
   */
  async getCurrentPrice(contractAddress) {
    try {
      const response = await fetch(
        `${this.API_BASE}/api/tokens/${contractAddress}/current-price`
      );
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Failed to fetch current price:', error);
      throw error;
    }
  }

  /**
   * Get available timeframes for price charts
   * @returns {Promise<Object>} Available timeframes
   */
  async getTimeframes() {
    try {
      const response = await fetch(
        `${this.API_BASE}/api/tokens/price-chart/timeframes`
      );
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Failed to fetch timeframes:', error);
      throw error;
    }
  }

  /**
   * Get price chart service status
   * @returns {Promise<Object>} Service status
   */
  async getStatus() {
    try {
      const response = await fetch(
        `${this.API_BASE}/api/tokens/price-chart/status`
      );
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Failed to fetch price chart status:', error);
      throw error;
    }
  }
}

const chartService = new ChartService();
export default chartService;
