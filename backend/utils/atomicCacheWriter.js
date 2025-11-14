import fs from 'fs/promises';
import path from 'path';

/**
 * Atomic Cache Writer with File Locking
 * Prevents race conditions when multiple services write to tokens-cache.json
 * 
 * Uses:
 * 1. Lock file mechanism to prevent concurrent writes
 * 2. Temp file + rename for atomic writes
 * 3. Automatic lock timeout (30s) to prevent deadlocks
 * 4. Retry logic for failed lock acquisitions
 */
class AtomicCacheWriter {
  constructor() {
    this.cachePath = path.join(process.cwd(), 'backend', 'data', 'tokens-cache.json');
    this.lockPath = `${this.cachePath}.lock`;
    this.lockTimeout = 30000; // 30 seconds
    this.maxRetries = 5;
    this.retryDelay = 1000; // 1 second
  }

  /**
   * Acquire lock with timeout
   */
  async acquireLock(retryCount = 0) {
    try {
      // Try to create lock file (exclusive)
      await fs.writeFile(this.lockPath, JSON.stringify({
        pid: process.pid,
        timestamp: Date.now(),
        service: 'DexScreenerStyleMonitor'
      }), { flag: 'wx' }); // 'wx' = create only if doesn't exist
      
      console.log(`   🔒 Lock acquired`);
      return true;
      
    } catch (error) {
      if (error.code === 'EEXIST') {
        // Lock file exists - check if it's stale
        try {
          const lockData = await fs.readFile(this.lockPath, 'utf8');
          const lock = JSON.parse(lockData);
          const lockAge = Date.now() - lock.timestamp;
          
          if (lockAge > this.lockTimeout) {
            // Stale lock - remove it
            console.warn(`   ⚠️ Removing stale lock (age: ${lockAge}ms)`);
            await fs.unlink(this.lockPath).catch(() => {});
            
            // Retry acquiring lock
            if (retryCount < this.maxRetries) {
              await new Promise(resolve => setTimeout(resolve, this.retryDelay));
              return await this.acquireLock(retryCount + 1);
            }
          } else {
            // Active lock - wait and retry
            if (retryCount < this.maxRetries) {
              console.log(`   ⏳ Lock held by ${lock.service} (PID ${lock.pid}), waiting...`);
              await new Promise(resolve => setTimeout(resolve, this.retryDelay));
              return await this.acquireLock(retryCount + 1);
            }
          }
        } catch (lockError) {
          console.error(`   ❌ Error reading lock file:`, lockError.message);
        }
        
        console.error(`   ❌ Failed to acquire lock after ${retryCount} retries`);
        return false;
      }
      
      throw error;
    }
  }

  /**
   * Release lock
   */
  async releaseLock() {
    try {
      await fs.unlink(this.lockPath);
      console.log(`   🔓 Lock released`);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error(`   ⚠️ Error releasing lock:`, error.message);
      }
    }
  }

  /**
   * Update tokens cache with a callback function
   * @param {Function} updateFn - Callback that receives current tokens and returns updated tokens
   * @param {String} serviceName - Name of the service performing the update
   */
  async updateCache(updateFn, serviceName = 'Unknown') {
    let lockAcquired = false;
    
    try {
      console.log(`   📝 [${serviceName}] Acquiring lock for cache update...`);
      
      // Acquire lock
      lockAcquired = await this.acquireLock();
      if (!lockAcquired) {
        throw new Error('Failed to acquire lock');
      }
      
      // Read current cache
      let currentTokens = [];
      try {
        const cacheData = await fs.readFile(this.cachePath, 'utf8');
        currentTokens = JSON.parse(cacheData);
        console.log(`   📂 [${serviceName}] Loaded ${currentTokens.length} tokens from cache`);
      } catch (error) {
        if (error.code !== 'ENOENT') {
          console.warn(`   ⚠️ [${serviceName}] Could not load cache: ${error.message}`);
        }
        currentTokens = [];
      }
      
      // Apply update function
      const updatedTokens = await updateFn(currentTokens);
      
      if (!Array.isArray(updatedTokens)) {
        throw new Error('Update function must return an array');
      }
      
      // Atomic write: temp file + rename
      const tempPath = `${this.cachePath}.tmp`;
      await fs.writeFile(tempPath, JSON.stringify(updatedTokens, null, 2), 'utf8');
      await fs.rename(tempPath, this.cachePath);
      
      console.log(`   ✅ [${serviceName}] Cache updated: ${currentTokens.length} → ${updatedTokens.length} tokens`);
      
      return {
        success: true,
        previousCount: currentTokens.length,
        newCount: updatedTokens.length
      };
      
    } catch (error) {
      console.error(`   ❌ [${serviceName}] Cache update failed:`, error.message);
      return {
        success: false,
        error: error.message
      };
      
    } finally {
      // Always release lock
      if (lockAcquired) {
        await this.releaseLock();
      }
    }
  }

  /**
   * Convenience method: Update specific tokens by contract address
   * @param {Map} updatesMap - Map of contractAddress → updates object
   * @param {String} serviceName - Name of the service
   */
  async updateTokens(updatesMap, serviceName = 'Unknown') {
    return await this.updateCache((currentTokens) => {
      let updatedCount = 0;
      
      const updatedTokens = currentTokens.map(token => {
        const updates = updatesMap.get(token.contractAddress);
        if (updates) {
          updatedCount++;
          return {
            ...token,
            ...updates,
            lastUpdated: new Date().toISOString()
          };
        }
        return token;
      });
      
      console.log(`   📊 [${serviceName}] Updated ${updatedCount}/${currentTokens.length} tokens`);
      
      return updatedTokens;
    }, serviceName);
  }
}

// Singleton instance
const atomicCacheWriter = new AtomicCacheWriter();

export default atomicCacheWriter;

