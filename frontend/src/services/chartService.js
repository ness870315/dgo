class ChartService {
  constructor() {
    this.API_BASE = process.env.REACT_APP_API_BASE_URL || 'https://api.degen-oracle.com';
    
    // Persistent cache for chart data (per timeframe) using localStorage
    this.chartCache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
    this.cacheKey = 'xtrend_chart_cache';
    
    // Load persistent cache on initialization
    this.loadPersistentCache();
  }

  /**
   * Load persistent cache from localStorage (atomic read)
   */
  loadPersistentCache() {
    try {
      const cached = localStorage.getItem(this.cacheKey);
      if (cached) {
        const data = JSON.parse(cached);
        
        // Restore Map from stored object
        if (data.entries && Array.isArray(data.entries)) {
          this.chartCache = new Map(data.entries);
          console.log(`📦 Loaded ${this.chartCache.size} cached chart entries from persistent storage`);
        }
      }
    } catch (error) {
      console.warn(`⚠️ Failed to load persistent chart cache: ${error.message}`);
      this.chartCache = new Map(); // Reset to empty cache
    }
  }

  /**
   * Save cache to localStorage (atomic write)
   */
  savePersistentCache() {
    try {
      const data = {
        entries: Array.from(this.chartCache.entries()),
        timestamp: Date.now(),
        version: '1.0'
      };
      
      // Atomic write to localStorage
      localStorage.setItem(this.cacheKey, JSON.stringify(data));
      console.log(`💾 Saved ${this.chartCache.size} chart entries to persistent storage (atomic)`);
    } catch (error) {
      console.warn(`⚠️ Failed to save persistent chart cache: ${error.message}`);
    }
  }

  /**
   * Get optimal limit for MV/RD/MP tier system (memecoin optimized)
   */
  getOptimalLimitForTier(timeframe, tier = 'RD') {
    const limits = {
      '1MIN': { MV: 300, RD: 1440, MP: 5000 },  // ~24 hours
      '5MIN': { MV: 300, RD: 1000, MP: 3000 },  // ~3.5 days  
      '15MIN': { MV: 300, RD: 1000, MP: 3000 }, // ~10.4 days
      '1H': { MV: 300, RD: 1000, MP: 2000 },    // ~41.7 days
      '4H': { MV: 300, RD: 800, MP: 2000 },     // ~133 days
      '1D': { MV: 300, RD: 750, MP: 1500 },     // ~2.1 years
      '1W': { MV: 300, RD: 260, MP: 520 },      // ~5 years
      '1M': { MV: 300, RD: 120, MP: 240 },      // ~10 years
      '3M': { MV: 300, RD: 120, MP: 240 },      // ~30 years
      '1Y': { MV: 300, RD: 120, MP: 240 },      // ~120 years
      'ALL': { MV: 300, RD: 240, MP: 480 }      // All time
    };
    
    const timeframeLimits = limits[timeframe] || limits['1D'];
    return timeframeLimits[tier] || timeframeLimits.RD;
  }

  /**
   * Get cache key for chart data (include tier to prevent collisions)
   */
  getCacheKey(contractAddress, timeframe, tier = 'RD') {
    return `${contractAddress}_${timeframe}_${tier}`;
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
  getCachedChart(contractAddress, timeframe, tier = 'RD') {
    const cacheKey = this.getCacheKey(contractAddress, timeframe, tier);
    const cached = this.chartCache.get(cacheKey);
    
    if (this.isCacheValid(cached)) {
      console.log(`📦 Using cached chart data for ${timeframe} (${tier} tier)`);
      return cached.data;
    }
    
    return null;
  }

  /**
   * Cache chart data (atomic and persistent)
   */
  setCachedChart(contractAddress, timeframe, data, tier = 'RD') {
    const cacheKey = this.getCacheKey(contractAddress, timeframe, tier);
    this.chartCache.set(cacheKey, {
      data: data,
      timestamp: Date.now(),
      oldestTime: data?.data?.[0]?.time || null,
      newestTime: data?.data?.[data?.data?.length - 1]?.time || null
    });
    
    // Atomic write to persistent storage
    this.savePersistentCache();
    
    console.log(`💾 Cached chart data for ${timeframe} (${tier} tier, ${data?.data?.length || 0} candles) - persistent`);
  }

  /**
   * Lazy load older bars when user scrolls left (MP tier for extended history)
   * @param {string} contractAddress - Token contract address
   * @param {string} timeframe - Current timeframe
   * @param {number} beforeTime - Load bars before this timestamp
   * @param {string} tier - MV/RD/MP tier ('MP' for lazy loading)
   */
  async loadOlderBars(contractAddress, timeframe, beforeTime, tier = 'MP') {
    try {
      // Get optimal limit for the tier (MP = max prefetch for lazy loading)
      const optimalLimit = this.getOptimalLimitForTier(timeframe, tier);
      
      console.log(`📜 Loading ${optimalLimit} older bars (${tier} tier) for ${timeframe} before ${new Date(beforeTime * 1000).toISOString()}`);
      
      const response = await fetch(
        `${this.API_BASE}/api/tokens/${contractAddress}/price-chart?timeframe=${timeframe}&limit=${optimalLimit}&before=${beforeTime}&tier=${tier}`
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
        
        // Update cache with merged data (atomic and persistent)
        this.chartCache.set(cacheKey, {
          data: mergedData,
          timestamp: existing.timestamp,
          oldestTime: olderData.data[0]?.time || existing.oldestTime,
          newestTime: existing.newestTime
        });
        
        // Atomic write to persistent storage
        this.savePersistentCache();
        
        console.log(`🔄 Merged ${olderData.data.length} older bars. Total: ${mergedData.data.length} candles - persistent`);
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
        
        // Update cache with merged data (atomic and persistent)
        this.chartCache.set(cacheKey, {
          data: mergedData,
          timestamp: Date.now(), // Update timestamp for fresh data
          oldestTime: existing.oldestTime,
          newestTime: newData.data[newData.data.length - 1]?.time || existing.newestTime
        });
        
        // Atomic write to persistent storage
        this.savePersistentCache();
        
        console.log(`➕ Appended ${newData.data.length} new candles. Total: ${mergedData.data.length} candles - persistent`);
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
   * @param {string} tier - MV/RD/MP tier for memecoin optimization
   * @returns {Promise<Object>} Chart data response
   */
  async getPriceChart(contractAddress, timeframe = '1D', limit = null, tier = 'RD') {
    try {
      // Check cache first (tier-specific)
      const cached = this.getCachedChart(contractAddress, timeframe, tier);
      if (cached) {
        return cached;
      }

      // Fetch from API with tier parameter
      const params = new URLSearchParams({
        timeframe: timeframe,
        tier: tier
      });
      
      if (limit) {
        params.append('limit', limit.toString());
      }
        
      const response = await fetch(`${this.API_BASE}/api/tokens/${contractAddress}/price-chart?${params}`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data = await response.json();
      
      // Cache the result with tier
      this.setCachedChart(contractAddress, timeframe, data, tier);
      
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
