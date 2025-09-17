import TokenCleanupService from './tokenCleanupService.js';
import fs from 'fs/promises';
import path from 'path';

class AutomatedTokenCleanup {
  constructor() {
    this.cleanupService = new TokenCleanupService();
    this.isRunning = false;
    this.lastCleanup = null;
    this.cleanupInterval = 4 * 60 * 60 * 1000; // 4 hours
    this.logFile = path.join(process.env.DATA_DIR || '/var/data/dgo', 'logs', 'automated-cleanup.log');
  }

  /**
   * Initialize the automated cleanup system
   */
  async initialize() {
    try {
      // Ensure log directory exists
      const logDir = path.dirname(this.logFile);
      await fs.mkdir(logDir, { recursive: true });
      
      console.log('🤖 Automated Token Cleanup initialized');
      console.log(`📝 Log file: ${this.logFile}`);
      console.log(`⏰ Cleanup interval: ${this.cleanupInterval / (60 * 60 * 1000)} hours`);
      
      // Start the cleanup loop
      this.startCleanupLoop();
      
    } catch (error) {
      console.error('❌ Failed to initialize automated cleanup:', error.message);
    }
  }

  /**
   * Start the automated cleanup loop
   */
  startCleanupLoop() {
    console.log('🔄 Starting automated cleanup loop...');
    
    // Run cleanup immediately on startup
    this.runCleanup().catch(console.error);
    
    // Schedule periodic cleanups
    setInterval(() => {
      this.runCleanup().catch(console.error);
    }, this.cleanupInterval);
  }

  /**
   * Run automated cleanup for CRITICAL tokens
   */
  async runCleanup() {
    if (this.isRunning) {
      console.log('⏳ Cleanup already running, skipping...');
      return;
    }

    this.isRunning = true;
    const startTime = new Date();
    
    try {
      console.log(`🤖 Starting automated cleanup at ${startTime.toISOString()}`);
      
      // Analyze tokens for cleanup
      const analysis = await this.cleanupService.analyzeTokensForCleanup();
      
      if (!analysis || analysis.toDelete.length === 0) {
        await this.logCleanup('No tokens need cleanup', { deleted: 0, remaining: analysis?.total || 0 });
        return;
      }

      // Filter to CRITICAL tokens only
      const criticalTokens = analysis.toDelete.filter(token => 
        token.severity.toUpperCase() === 'CRITICAL'
      );

      if (criticalTokens.length === 0) {
        await this.logCleanup('No CRITICAL tokens found', { 
          deleted: 0, 
          remaining: analysis.total,
          totalToDelete: analysis.toDelete.length,
          severityBreakdown: analysis.stats
        });
        return;
      }

      console.log(`🚨 Found ${criticalTokens.length} CRITICAL tokens to delete automatically`);
      
      // Log what will be deleted
      criticalTokens.forEach(token => {
        console.log(`   • ${token.symbol}: ${token.reason}`);
      });

      // Delete the CRITICAL tokens
      const result = await this.cleanupService.deleteTokens(criticalTokens);
      
      if (result) {
        const endTime = new Date();
        const duration = endTime - startTime;
        
        console.log(`✅ Automated cleanup completed:`);
        console.log(`   🗑️ Deleted: ${result.deleted} CRITICAL tokens`);
        console.log(`   📊 Remaining: ${result.remaining} tokens`);
        console.log(`   ⏱️ Duration: ${duration}ms`);
        
        await this.logCleanup('CRITICAL tokens deleted', {
          deleted: result.deleted,
          remaining: result.remaining,
          duration: duration,
          deletedTokens: criticalTokens.map(t => ({
            symbol: t.symbol,
            reason: t.reason,
            marketCap: t.marketCap,
            volumeChange24h: t.volumeChange24h
          }))
        });
        
      } else {
        await this.logCleanup('Failed to delete tokens', { error: 'Delete operation failed' });
      }
      
    } catch (error) {
      console.error('❌ Automated cleanup failed:', error.message);
      await this.logCleanup('Cleanup failed', { error: error.message });
    } finally {
      this.isRunning = false;
      this.lastCleanup = new Date();
    }
  }

  /**
   * Log cleanup results to file
   */
  async logCleanup(message, data = {}) {
    try {
      const logEntry = {
        timestamp: new Date().toISOString(),
        message,
        data,
        isRunning: this.isRunning,
        lastCleanup: this.lastCleanup?.toISOString() || null
      };
      
      const logLine = JSON.stringify(logEntry) + '\n';
      await fs.appendFile(this.logFile, logLine);
      
    } catch (error) {
      console.error('❌ Failed to log cleanup:', error.message);
    }
  }

  /**
   * Get cleanup status and statistics
   */
  async getStatus() {
    try {
      const analysis = await this.cleanupService.analyzeTokensForCleanup();
      
      return {
        isRunning: this.isRunning,
        lastCleanup: this.lastCleanup?.toISOString() || null,
        nextCleanup: this.lastCleanup ? 
          new Date(this.lastCleanup.getTime() + this.cleanupInterval).toISOString() : 
          'Not scheduled',
        cleanupInterval: this.cleanupInterval,
        logFile: this.logFile,
        currentStats: analysis ? {
          total: analysis.total,
          toDelete: analysis.toDelete.length,
          critical: analysis.stats.critical,
          high: analysis.stats.high,
          medium: analysis.stats.medium,
          low: analysis.stats.low
        } : null
      };
      
    } catch (error) {
      return {
        error: error.message,
        isRunning: this.isRunning,
        lastCleanup: this.lastCleanup?.toISOString() || null
      };
    }
  }

  /**
   * Force immediate cleanup (for manual triggers)
   */
  async forceCleanup() {
    console.log('🔧 Force cleanup triggered');
    return this.runCleanup();
  }

  /**
   * Update cleanup interval
   */
  setCleanupInterval(hours) {
    this.cleanupInterval = hours * 60 * 60 * 1000;
    console.log(`⏰ Cleanup interval updated to ${hours} hours`);
  }
}

export default AutomatedTokenCleanup;
