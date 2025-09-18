import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class HolderCacheService {
  constructor() {
    this.CACHE_DIR = path.join(__dirname, '../cache/holders');
    this.CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
    this.ensureCacheDir();
  }

  /**
   * Ensure cache directory exists
   */
  async ensureCacheDir() {
    try {
      await fs.mkdir(this.CACHE_DIR, { recursive: true });
    } catch (error) {
      console.error('❌ Failed to create holder cache directory:', error.message);
    }
  }

  /**
   * Generate cache key for a token and data type
   * @param {string} tokenAddress - Token contract address
   * @param {string} dataType - Type of data (insights, top, stats, timeseries)
   * @returns {string} Cache key
   */
  getCacheKey(tokenAddress, dataType) {
    return `${tokenAddress}_${dataType}`;
  }

  /**
   * Get cache file path
   * @param {string} cacheKey - Cache key
   * @returns {string} File path
   */
  getCacheFilePath(cacheKey) {
    return path.join(this.CACHE_DIR, `${cacheKey}.json`);
  }

  /**
   * Check if cached data exists and is still valid
   * @param {string} tokenAddress - Token contract address
   * @param {string} dataType - Type of data
   * @returns {Promise<boolean>} True if valid cache exists
   */
  async isCacheValid(tokenAddress, dataType) {
    try {
      const cacheKey = this.getCacheKey(tokenAddress, dataType);
      const filePath = this.getCacheFilePath(cacheKey);
      
      const stats = await fs.stat(filePath);
      const now = Date.now();
      const cacheAge = now - stats.mtime.getTime();
      
      return cacheAge < this.CACHE_DURATION;
    } catch (error) {
      // File doesn't exist or other error
      return false;
    }
  }

  /**
   * Get cached data if valid
   * @param {string} tokenAddress - Token contract address
   * @param {string} dataType - Type of data
   * @returns {Promise<Object|null>} Cached data or null
   */
  async getCachedData(tokenAddress, dataType) {
    try {
      const isValid = await this.isCacheValid(tokenAddress, dataType);
      if (!isValid) {
        return null;
      }

      const cacheKey = this.getCacheKey(tokenAddress, dataType);
      const filePath = this.getCacheFilePath(cacheKey);
      
      const data = await fs.readFile(filePath, 'utf8');
      const parsedData = JSON.parse(data);
      
      console.log(`✅ Cache HIT for ${tokenAddress}:${dataType} (age: ${this.getCacheAge(filePath)})`);
      return parsedData;
    } catch (error) {
      console.error(`❌ Failed to read cache for ${tokenAddress}:${dataType}:`, error.message);
      return null;
    }
  }

  /**
   * Save data to cache
   * @param {string} tokenAddress - Token contract address
   * @param {string} dataType - Type of data
   * @param {Object} data - Data to cache
   * @returns {Promise<boolean>} Success status
   */
  async setCachedData(tokenAddress, dataType, data) {
    try {
      const cacheKey = this.getCacheKey(tokenAddress, dataType);
      const filePath = this.getCacheFilePath(cacheKey);
      
      // Add cache metadata
      const cacheData = {
        tokenAddress,
        dataType,
        cachedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + this.CACHE_DURATION).toISOString(),
        data: data
      };
      
      await fs.writeFile(filePath, JSON.stringify(cacheData, null, 2), 'utf8');
      console.log(`💾 Cache SAVED for ${tokenAddress}:${dataType}`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to save cache for ${tokenAddress}:${dataType}:`, error.message);
      return false;
    }
  }

  /**
   * Get cache age in human-readable format
   * @param {string} filePath - Path to cache file
   * @returns {string} Cache age
   */
  async getCacheAge(filePath) {
    try {
      const stats = await fs.stat(filePath);
      const ageMs = Date.now() - stats.mtime.getTime();
      const ageHours = Math.floor(ageMs / (60 * 60 * 1000));
      const ageMinutes = Math.floor((ageMs % (60 * 60 * 1000)) / (60 * 1000));
      
      if (ageHours > 0) {
        return `${ageHours}h ${ageMinutes}m`;
      } else {
        return `${ageMinutes}m`;
      }
    } catch (error) {
      return 'unknown';
    }
  }

  /**
   * Clear cache for a specific token
   * @param {string} tokenAddress - Token contract address
   * @returns {Promise<number>} Number of files deleted
   */
  async clearTokenCache(tokenAddress) {
    try {
      const files = await fs.readdir(this.CACHE_DIR);
      const tokenFiles = files.filter(file => file.startsWith(`${tokenAddress}_`));
      
      let deletedCount = 0;
      for (const file of tokenFiles) {
        try {
          await fs.unlink(path.join(this.CACHE_DIR, file));
          deletedCount++;
        } catch (error) {
          console.error(`❌ Failed to delete cache file ${file}:`, error.message);
        }
      }
      
      console.log(`🗑️ Cleared ${deletedCount} cache files for token ${tokenAddress}`);
      return deletedCount;
    } catch (error) {
      console.error(`❌ Failed to clear cache for token ${tokenAddress}:`, error.message);
      return 0;
    }
  }

  /**
   * Clear all expired cache files
   * @returns {Promise<number>} Number of files deleted
   */
  async clearExpiredCache() {
    try {
      const files = await fs.readdir(this.CACHE_DIR);
      let deletedCount = 0;
      
      for (const file of files) {
        try {
          const filePath = path.join(this.CACHE_DIR, file);
          const stats = await fs.stat(filePath);
          const ageMs = Date.now() - stats.mtime.getTime();
          
          if (ageMs > this.CACHE_DURATION) {
            await fs.unlink(filePath);
            deletedCount++;
          }
        } catch (error) {
          console.error(`❌ Failed to process cache file ${file}:`, error.message);
        }
      }
      
      if (deletedCount > 0) {
        console.log(`🗑️ Cleared ${deletedCount} expired holder cache files`);
      }
      
      return deletedCount;
    } catch (error) {
      console.error('❌ Failed to clear expired cache:', error.message);
      return 0;
    }
  }

  /**
   * Get cache statistics
   * @returns {Promise<Object>} Cache statistics
   */
  async getCacheStats() {
    try {
      const files = await fs.readdir(this.CACHE_DIR);
      let totalSize = 0;
      let validFiles = 0;
      let expiredFiles = 0;
      
      for (const file of files) {
        try {
          const filePath = path.join(this.CACHE_DIR, file);
          const stats = await fs.stat(filePath);
          totalSize += stats.size;
          
          const ageMs = Date.now() - stats.mtime.getTime();
          if (ageMs < this.CACHE_DURATION) {
            validFiles++;
          } else {
            expiredFiles++;
          }
        } catch (error) {
          // Skip files that can't be read
        }
      }
      
      return {
        totalFiles: files.length,
        validFiles,
        expiredFiles,
        totalSizeBytes: totalSize,
        totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2),
        cacheDurationHours: this.CACHE_DURATION / (60 * 60 * 1000)
      };
    } catch (error) {
      console.error('❌ Failed to get cache stats:', error.message);
      return {
        totalFiles: 0,
        validFiles: 0,
        expiredFiles: 0,
        totalSizeBytes: 0,
        totalSizeMB: '0.00',
        cacheDurationHours: 24,
        error: error.message
      };
    }
  }

  /**
   * Get or set cached data with automatic fallback
   * @param {string} tokenAddress - Token contract address
   * @param {string} dataType - Type of data
   * @param {Function} fetchFunction - Function to fetch fresh data if cache miss
   * @returns {Promise<Object>} Data (cached or fresh)
   */
  async getOrFetch(tokenAddress, dataType, fetchFunction) {
    try {
      // Try to get cached data first
      const cachedData = await this.getCachedData(tokenAddress, dataType);
      if (cachedData) {
        return {
          success: true,
          data: cachedData.data,
          cached: true,
          cachedAt: cachedData.cachedAt
        };
      }

      // Cache miss - fetch fresh data
      console.log(`🔄 Cache MISS for ${tokenAddress}:${dataType} - fetching fresh data`);
      const freshData = await fetchFunction();
      
      if (freshData && freshData.success) {
        // Cache the fresh data
        await this.setCachedData(tokenAddress, dataType, freshData);
        
        return {
          success: true,
          data: freshData,
          cached: false,
          fetchedAt: new Date().toISOString()
        };
      } else {
        return freshData || { success: false, error: 'Failed to fetch data' };
      }
    } catch (error) {
      console.error(`❌ getOrFetch failed for ${tokenAddress}:${dataType}:`, error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

export default HolderCacheService;
