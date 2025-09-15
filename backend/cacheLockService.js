import fs from 'fs/promises';
import path from 'path';

/**
 * CACHE LOCK SERVICE
 * Provides atomic file locking for cache operations to prevent race conditions
 */
class CacheLockService {
  constructor(cachePath) {
    this.cachePath = cachePath;
    this.lockPath = cachePath + '.lock';
    this.lockFile = null;
    this.maxRetries = 10;
    this.retryDelay = 1000; // 1 second
    this.lockTimeout = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Acquire exclusive lock for cache operations
   */
  async acquireLock(retryCount = 0) {
    try {
      this.lockFile = await fs.open(this.lockPath, 'wx'); // Exclusive write lock
      console.log(`🔒 Acquired cache lock for ${path.basename(this.cachePath)}`);
      return true;
    } catch (lockError) {
      if (lockError.code === 'EEXIST') {
        console.log(`⏳ Cache lock exists, waiting... (attempt ${retryCount + 1})`);
        
        // Check if lock file is stale (older than lockTimeout)
        try {
          const lockStats = await fs.stat(this.lockPath);
          const lockAge = Date.now() - lockStats.mtime.getTime();
          if (lockAge > this.lockTimeout) {
            console.log(`🗑️ Removing stale lock file (${Math.round(lockAge / 1000)}s old)`);
            await fs.unlink(this.lockPath);
            // Retry immediately after removing stale lock
            return await this.acquireLock(retryCount);
          }
        } catch (statError) {
          // Lock file doesn't exist anymore, retry
          return await this.acquireLock(retryCount);
        }
        
        // Wait and retry
        if (retryCount < this.maxRetries) {
          await new Promise(resolve => setTimeout(resolve, this.retryDelay));
          return await this.acquireLock(retryCount + 1);
        } else {
          throw new Error('Cache lock timeout - another process is writing');
        }
      } else {
        throw lockError;
      }
    }
  }

  /**
   * Release the cache lock
   */
  async releaseLock() {
    try {
      if (this.lockFile) {
        await this.lockFile.close();
        this.lockFile = null;
      }
      await fs.unlink(this.lockPath);
      console.log(`🔓 Released cache lock for ${path.basename(this.cachePath)}`);
    } catch (error) {
      console.warn(`⚠️ Error releasing cache lock: ${error.message}`);
    }
  }

  /**
   * Execute a function with cache lock
   */
  async withLock(operation) {
    await this.acquireLock();
    try {
      return await operation();
    } finally {
      await this.releaseLock();
    }
  }

  /**
   * Atomic write with lock protection
   */
  async atomicWrite(data, options = {}) {
    return await this.withLock(async () => {
      const timestamp = Date.now();
      const tempPath = this.cachePath + `.tmp.${timestamp}`;
      
      try {
        const jsonData = JSON.stringify(data, null, 2);
        
        // Write to temporary file first
        await fs.writeFile(tempPath, jsonData, 'utf8');
        
        // Verify temp file exists before rename
        try {
          await fs.access(tempPath);
        } catch (accessError) {
          throw new Error(`Temp file not accessible before rename: ${accessError.message}`);
        }
        
        // Atomic move
        await fs.rename(tempPath, this.cachePath);
        
        console.log(`✅ Atomic write completed for ${path.basename(this.cachePath)}`);
        return true;
      } catch (error) {
        // Cleanup temp file if it exists
        try {
          await fs.unlink(tempPath);
        } catch (_) {}
        
        throw error;
      }
    });
  }
}

export default CacheLockService;
