class ChartService {
  constructor() {
    this.API_BASE = process.env.REACT_APP_API_BASE_URL || 'https://api.degen-oracle.com';
    
    // Persistent cache for chart data (per timeframe) using localStorage
    this.chartCache = new Map();
    this.cacheKey = 'xtrend_chart_cache';
    
    // Cache size limits to prevent localStorage quota exceeded
    this.MAX_CACHE_ENTRIES = 50; // Maximum number of cache entries
    this.MAX_CACHE_SIZE_MB = 5;  // Maximum cache size in MB

    // Maximum bars per timeframe to prevent unbounded arrays
    this.MAX_BARS = {
      '1MIN': 1200, '5MIN': 1200, '15MIN': 1200, '1H': 1200,
      '4H': 1200, '1D': 1500, '1W': 600, '1M': 300
    };
    
    // Timeframe-specific cache durations (shorter for frequent updates)
    this.cacheTimeouts = {
      '1MIN': 30 * 1000,        // 30 seconds
      '5MIN': 2 * 60 * 1000,    // 2 minutes
      '15MIN': 5 * 60 * 1000,   // 5 minutes
      '1H': 10 * 60 * 1000,     // 10 minutes
      '4H': 30 * 60 * 1000,     // 30 minutes
      '1D': 60 * 60 * 1000,     // 1 hour
      '1W': 4 * 60 * 60 * 1000, // 4 hours
      '1M': 24 * 60 * 60 * 1000 // 24 hours
    };
    
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

        }
      }
    } catch (error) {
      console.warn(`⚠️ Failed to load persistent chart cache: ${error.message}`);
      this.chartCache = new Map(); // Reset to empty cache
    }
  }

  /**
   * Trim data series to maximum bars per timeframe
   */
  trimSeries(timeframe, arr) {
    if (!Array.isArray(arr)) return arr;
    const n = this.MAX_BARS[timeframe] ?? 1200;
    return arr.length > n ? arr.slice(-n) : arr;
  }

  /**
   * True LRU cleanup by both count and size
   */
  cleanupCache() {
    if (this.chartCache.size <= this.MAX_CACHE_ENTRIES) {
      return; // No cleanup needed
    }



    // Sort by timestamp (oldest first) and remove until under entry limit
    const keys = [...this.chartCache.keys()]
      .sort((a, b) => (this.chartCache.get(a)?.timestamp ?? 0) - (this.chartCache.get(b)?.timestamp ?? 0));

    while (this.chartCache.size > this.MAX_CACHE_ENTRIES) {
      const oldestKey = keys.shift();
      if (oldestKey) {
        this.chartCache.delete(oldestKey);
      }
    }


  }

  /**
   * Get cache timeout for a specific timeframe
   */
  getCacheTimeout(timeframe) {
    return this.cacheTimeouts[timeframe] || this.cacheTimeouts['1D'];
  }

  /**
   * Save cache to localStorage (atomic write) with size limits
   */
  savePersistentCache() {
    try {
      // First, trim all entries per timeframe to prevent unbounded arrays
      const trimmed = new Map(
        [...this.chartCache.entries()].map(([k, v]) => {
          const tf = v?.timeframe ?? '1D';
          const arr = Array.isArray(v?.data?.data) ? this.trimSeries(tf, v.data.data) : v?.data?.data;
          return [k, { ...v, data: { ...v.data, data: arr } }];
        })
      );
      this.chartCache = trimmed;

      // LRU cleanup by entry count (oldest first)
      if (this.chartCache.size > this.MAX_CACHE_ENTRIES) {
        const keys = [...this.chartCache.keys()]
          .sort((a, b) => (this.chartCache.get(a)?.timestamp ?? 0) - (this.chartCache.get(b)?.timestamp ?? 0));

        while (this.chartCache.size > this.MAX_CACHE_ENTRIES && keys.length > 0) {
          const oldestKey = keys.shift();
          if (oldestKey) {
            this.chartCache.delete(oldestKey);
          }
        }
      }

      // Prepare data for serialization
      const snapshot = {
        entries: [...this.chartCache.entries()],
        timestamp: Date.now(),
        version: '1.1'
      };
      const json = JSON.stringify(snapshot);

      // Size check with fallback for Safari/private mode
      let sizeMB = 0;
      try {
        sizeMB = new Blob([json]).size / (1024 * 1024);
      } catch (blobError) {
        // Fallback for environments where Blob.size throws (Safari private mode, etc.)
        sizeMB = json.length / (1024 * 1024);

      }

      // LRU cleanup by size if still over limit
      if (sizeMB > this.MAX_CACHE_SIZE_MB) {
        console.warn(`⚠️ Cache size ${sizeMB.toFixed(2)}MB exceeds limit ${this.MAX_CACHE_SIZE_MB}MB, LRU cleanup by size...`);

        const keys = [...this.chartCache.keys()]
          .sort((a, b) => (this.chartCache.get(a)?.timestamp ?? 0) - (this.chartCache.get(b)?.timestamp ?? 0));

        while (keys.length > 0 && sizeMB > this.MAX_CACHE_SIZE_MB) {
          const oldestKey = keys.shift();
          if (oldestKey) {
            this.chartCache.delete(oldestKey);

            // Recalculate size after each removal
            const snap2 = { entries: [...this.chartCache.entries()], timestamp: Date.now(), version: '1.1' };
            const json2 = JSON.stringify(snap2);
            try {
              sizeMB = new Blob([json2]).size / (1024 * 1024);
            } catch (blobError) {
              sizeMB = json2.length / (1024 * 1024);
            }
          }
        }


      }

      // Final attempt to save
      localStorage.setItem(this.cacheKey, json);


    } catch (error) {
      console.warn(`⚠️ Failed to save persistent chart cache: ${error.message}`);

      // Handle different failure scenarios
      if (error.message.includes('quota') || error.name === 'QuotaExceededError') {


        // Try saving with minimal cache (just most recent entries)
        try {
          const keys = [...this.chartCache.keys()]
            .sort((a, b) => (this.chartCache.get(b)?.timestamp ?? 0) - (this.chartCache.get(a)?.timestamp ?? 0)); // newest first

          // Keep only the 10 most recent entries
          const minimalCache = new Map();
          for (let i = 0; i < Math.min(10, keys.length); i++) {
            const key = keys[i];
            minimalCache.set(key, this.chartCache.get(key));
          }

          const minimalSnapshot = { entries: [...minimalCache.entries()], timestamp: Date.now(), version: '1.1' };
          localStorage.setItem(this.cacheKey, JSON.stringify(minimalSnapshot));


          // Update our in-memory cache to match
          this.chartCache = minimalCache;

        } catch (minimalError) {

          try {
            localStorage.removeItem(this.cacheKey);
            this.chartCache.clear();

          } catch (clearError) {
            console.warn(`⚠️ Failed to clear cache: ${clearError.message}`);
          }
        }
      } else if (error.name === 'SecurityError') {
        // Safari private mode or other security restrictions

        // Cache continues to work in-memory only
      }
    }
  }

  /**
   * Returns the recommended RD bar count for a timeframe
   */
  getRDLimit(timeframe) {
    return this.getOptimalLimitForTier(timeframe, 'RD');
  }

  /**
   * Get price chart with RD limit and auto-top-up if server returns too few bars
   */
  async getPriceChartRD(contractAddress, timeframe) {
    const desired = this.getRDLimit(timeframe); // e.g., 1000 for 15MIN

    
    const base = await this.getPriceChart(contractAddress, timeframe, desired, 'RD');

    // If server gave us way less (e.g., only 24 bars), try backfilling older bars
    if (Array.isArray(base?.data) && base.data.length < Math.min(200, desired)) {

      const oldest = base.data[0]?.time;
      if (oldest) {
        try {
          const older = await this.loadOlderBars(contractAddress, timeframe, oldest, 'MP');
          if (older?.data?.length > base.data.length) {

            return older; // merged in loadOlderBars
          }
        } catch (e) {
          console.warn('Failed to load older bars:', e.message);
        }
      }
    }
    

    return base;
  }

  /**
   * Get optimal limit for MV/RD/MP tier system (memecoin optimized)
   */
  getOptimalLimitForTier(timeframe, tier = 'RD') {
    const limits = {
      '1MIN': { MV: 150, RD: 100, MP: 1000 },   // 4 hours (100 bars - Helius limit)
      '5MIN': { MV: 150, RD: 96, MP: 500 },    // 8 hours (96 bars)  
      '15MIN': { MV: 150, RD: 48, MP: 500 },   // 12 hours (48 bars)
      '1H': { MV: 200, RD: 168, MP: 800 },     // 7 days (168 bars)
      '4H': { MV: 200, RD: 90, MP: 400 },      // 15 days (90 bars)
      '1D': { MV: 200, RD: 90, MP: 300 },      // 90 days (90 bars)
      '1W': { MV: 300, RD: 260, MP: 520 },     // ~5 years
      '1M': { MV: 300, RD: 120, MP: 240 },     // ~10 years
      '3M': { MV: 300, RD: 120, MP: 240 },     // ~30 years
      '1Y': { MV: 300, RD: 120, MP: 240 },     // ~120 years
      'ALL': { MV: 300, RD: 500, MP: 1000 }    // All time since token creation
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
   * Check if cached data is still valid for a specific timeframe
   */
  isCacheValid(cacheEntry, timeframe = '1D') {
    if (!cacheEntry) return false;
    
    const timeout = this.getCacheTimeout(timeframe);
    const isValid = (Date.now() - cacheEntry.timestamp) < timeout;
    
    if (!isValid) {

    }
    
    return isValid;
  }

  /**
   * Get cached chart data if available and valid
   */
  getCachedChart(contractAddress, timeframe, tier = 'RD') {
    const cacheKey = this.getCacheKey(contractAddress, timeframe, tier);
    const cached = this.chartCache.get(cacheKey);
    
    if (this.isCacheValid(cached, timeframe)) {

      return cached.data;
    }
    
    return null;
  }

  /**
   * Cache chart data (atomic and persistent) with cleanup and trimming
   */
  setCachedChart(contractAddress, timeframe, data, tier = 'RD') {
    const cacheKey = this.getCacheKey(contractAddress, timeframe, tier);

    // Trim data series to prevent unbounded arrays
    const trimmed = Array.isArray(data?.data) ? this.trimSeries(timeframe, data.data) : data?.data;
    const trimmedData = { ...data, data: trimmed };

    this.chartCache.set(cacheKey, {
      data: trimmedData,
      timestamp: Date.now(),
      oldestTime: trimmedData?.data?.[0]?.time || null,
      newestTime: trimmedData?.data?.[trimmedData?.data?.length - 1]?.time || null,
      timeframe: timeframe,
      tier: tier
    });

    // Atomic write to persistent storage (includes cleanup)
    this.savePersistentCache();


  }

  /**
   * Lazy load older bars when user scrolls left (MP tier for extended history)
   * @param {string} contractAddress - Token contract address
   * @param {string} timeframe - Current timeframe
   * @param {number} beforeTime - Load bars before this timestamp
   * @param {string} tier - MV/RD/MP tier ('MP' for lazy loading)
   */
  async loadOlderBars(contractAddress, timeframe, beforeTime, tier = 'MP', chunkSize = null) {
    try {
      // Get optimal limit for the tier (MP = max prefetch for lazy loading)
      // Use chunkSize if provided, otherwise use tier-based limit
      const optimalLimit = chunkSize || this.getOptimalLimitForTier(timeframe, tier);
      

      
      const response = await fetch(
        `${this.API_BASE}/api/tokens/${contractAddress}/price-chart?timeframe=${timeframe}&limit=${optimalLimit}&before=${beforeTime}&tier=${tier}`
      );
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const olderData = await response.json();
      
      // Merge with existing cached data
      const cacheKey = this.getCacheKey(contractAddress, timeframe, tier);
      const existing = this.chartCache.get(cacheKey);
      
      if (existing && olderData?.data?.length > 0) {
        // Prepend older data (maintain ascending time order) and trim to prevent unbounded growth
        const mergedCandles = [...olderData.data, ...existing.data.data];
        const trimmedCandles = this.trimSeries(timeframe, mergedCandles);
        const mergedData = {
          ...existing.data,
          data: trimmedCandles,
          count: trimmedCandles.length
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
      const cacheKey = this.getCacheKey(contractAddress, timeframe, 'RD');
      const existing = this.chartCache.get(cacheKey);
      
      if (!existing || !existing.newestTime) {
        // No existing data, fetch normally
        return await this.getPriceChart(contractAddress, timeframe);
      }
      

      
      const response = await fetch(
        `${this.API_BASE}/api/tokens/${contractAddress}/price-chart?timeframe=${timeframe}&after=${existing.newestTime}&limit=100`
      );
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const newData = await response.json();
      
      if (newData?.data?.length > 0) {
        // Append new data (maintain ascending time order) and trim to prevent unbounded growth
        const mergedCandles = [...existing.data.data, ...newData.data];
        const trimmedCandles = this.trimSeries(timeframe, mergedCandles);
        const mergedData = {
          ...existing.data,
          data: trimmedCandles,
          count: trimmedCandles.length
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
  async getPriceChart(contractAddress, timeframe = '5MIN', limit = null, tier = 'RD') {
    try {
      // Check cache first (tier-specific)
      const cached = this.getCachedChart(contractAddress, timeframe, tier);
      if (cached) {
        return cached;
      }

      // If limit not provided, use RD for this timeframe
      const effLimit = Number.isFinite(limit) ? limit : this.getRDLimit(timeframe);

      // Fetch from API with tier parameter
      const params = new URLSearchParams({
        timeframe: timeframe,
        tier: tier,
        limit: String(effLimit)  // ensure server gets the count
      });
        
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
   * Get price chart with specific time range (for ALL timeframe)
   * @param {string} contractAddress - Token contract address
   * @param {string} timeframe - Timeframe (e.g., '4H' for all-time view)
   * @param {number} fromTimestamp - Start timestamp (seconds)
   * @param {number} toTimestamp - End timestamp (seconds)
   * @returns {Promise<Object>} Chart data
   */
  async getPriceChartWithTimeRange(contractAddress, timeframe, fromTimestamp, toTimestamp) {
    try {
      const params = new URLSearchParams({
        timeframe: timeframe,
        tier: 'RD',
        limit: '1000',
        from: fromTimestamp.toString(),
        to: toTimestamp.toString()
      });
        
      const response = await fetch(`${this.API_BASE}/api/tokens/${contractAddress}/price-chart?${params}`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data = await response.json();
      

      
      return data;
    } catch (error) {
      console.error('Failed to fetch time range chart:', error);
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

  /**
   * Get cache statistics for debugging
   */
  getCacheStats() {
    const entries = Array.from(this.chartCache.entries());
    const now = Date.now();
    
    const stats = {
      totalEntries: this.chartCache.size,
      maxEntries: this.MAX_CACHE_ENTRIES,
      maxSizeMB: this.MAX_CACHE_SIZE_MB,
      timeframes: {},
      oldestEntry: null,
      newestEntry: null
      eframe
    entries.forEach(([key, entry]) => {
      const timeframe = entry.timeframe || 'unknown';
      if (!stats.timeframes[timeframe]) {
        stats.timeframes[timeframe] = { count: 0, totalCandles: 0 };
      }
      stats.timeframes[timeframe].count++;
      stats.timeframes[timeframe].totalCandles += entry.data?.data?.length || 0;
    });
    
    // Find oldest and newest entries
    if (entries.length > 0) {
      const sortedByTime = entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      stats.oldestEntry = {
        key: sortedByTime[0][0],
        age: Math.round((now - sortedByTime[0][1].timestamp) / 1000),
        timeframe: sortedByTime[0][1].timeframe
      };
      stats.newestEntry = {
        key: sortedByTime[sortedByTime.length - 1][0],
        age: Math.round((now - sortedByTime[sortedByTime.length - 1][1].timestamp) / 1000),
        timeframe: sortedByTime[sortedByTime.length - 1][1].timeframe
      };
    }
    
    return stats;
  }

  async getTokenAnalytics(contractAddress) {
    try {
      const response = await fetch(
        `${this.API_BASE}/api/tokens/${contractAddress}/analytics`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Failed to fetch token analytics:', error);
      return { success: false, error: error.message };
    }
  }
}

const chartService = new ChartService();
export default chartService;
