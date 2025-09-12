import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * MANUAL TWITTER DATA MERGE SERVICE
 * Safely merges Twitter data from twitter_metrics.json into tokens-cache.json
 * NO API CALLS - Only uses existing collected data
 */
class TwitterDataMergeService {
  constructor() {
    this.cacheDir = path.join(__dirname, 'cache');
    this.tokensCachePath = path.join(this.cacheDir, 'tokens-cache.json');
    this.twitterMetricsPath = path.join(this.cacheDir, 'twitter_metrics.json');
    this.backupDir = path.join(this.cacheDir, 'backups');
    this.maxBackups = 5;
  }

  /**
   * Manual merge - only uses existing Twitter data, no API calls
   */
  async manualMerge() {
    console.log('🔄 Starting MANUAL Twitter Data Merge (NO API CALLS)...');
    
    try {
      // 1. Create backup of current tokens cache
      const backupPath = await this.createBackup();
      console.log(`✅ Backup created: ${backupPath}`);

      // 2. Load existing data
      const tokens = await this.loadTokensCache();
      const twitterMetrics = await this.loadTwitterMetrics();
      
      console.log(`📊 Loaded ${tokens.length} tokens from main cache`);
      console.log(`📊 Loaded ${Object.keys(twitterMetrics).length} Twitter metrics entries`);

      // 3. Perform merge
      const mergeResults = await this.mergeTwitterData(tokens, twitterMetrics);
      
      // 4. Validate merged data
      await this.validateMergedData(mergeResults.mergedTokens);
      
      // 5. Atomic save
      await this.atomicSave(mergeResults.mergedTokens);
      
      console.log(`✅ Manual merge completed successfully:`);
      console.log(`   📊 Tokens processed: ${mergeResults.processed}`);
      console.log(`   📊 Tokens updated: ${mergeResults.updated}`);
      console.log(`   📊 Tokens skipped: ${mergeResults.skipped}`);
      
      return {
        success: true,
        processed: mergeResults.processed,
        updated: mergeResults.updated,
        skipped: mergeResults.skipped,
        backupPath: backupPath
      };
      
    } catch (error) {
      console.error('❌ Manual merge failed:', error.message);
      console.error('Stack trace:', error.stack);
      
      // Attempt rollback
      try {
        await this.rollback();
        console.log('✅ Rollback completed successfully');
      } catch (rollbackError) {
        console.error('❌ Rollback failed:', rollbackError.message);
      }
      
      throw error;
    }
  }

  /**
   * Create timestamped backup of tokens cache
   */
  async createBackup() {
    try {
      // Ensure backup directory exists
      await fs.mkdir(this.backupDir, { recursive: true });
      
      // Create timestamped backup
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(this.backupDir, `tokens-cache-backup-${timestamp}.json`);
      
      // Copy current tokens cache to backup
      await fs.copyFile(this.tokensCachePath, backupPath);
      
      // Cleanup old backups (keep only maxBackups)
      await this.cleanupOldBackups();
      
      return backupPath;
    } catch (error) {
      throw new Error(`Failed to create backup: ${error.message}`);
    }
  }

  /**
   * Load tokens from main cache
   */
  async loadTokensCache() {
    try {
      const data = await fs.readFile(this.tokensCachePath, 'utf8');
      const tokens = JSON.parse(data);
      
      if (!Array.isArray(tokens)) {
        throw new Error('Tokens cache is not an array');
      }
      
      return tokens;
    } catch (error) {
      throw new Error(`Failed to load tokens cache: ${error.message}`);
    }
  }

  /**
   * Load Twitter metrics data
   */
  async loadTwitterMetrics() {
    try {
      const data = await fs.readFile(this.twitterMetricsPath, 'utf8');
      const metrics = JSON.parse(data);
      
      if (typeof metrics !== 'object' || metrics === null) {
        throw new Error('Twitter metrics is not an object');
      }
      
      return metrics;
    } catch (error) {
      throw new Error(`Failed to load Twitter metrics: ${error.message}`);
    }
  }

  /**
   * Merge Twitter data into tokens
   */
  async mergeTwitterData(tokens, twitterMetrics) {
    let processed = 0;
    let updated = 0;
    let skipped = 0;
    
    const mergedTokens = tokens.map(token => {
      processed++;
      
      try {
        // Try to find matching Twitter data
        const twitterData = this.findMatchingTwitterData(token, twitterMetrics);
        
        if (twitterData) {
          // Merge Twitter data into token
          const updatedToken = {
            ...token,
            twitterData: twitterData,
            twitterTimestamp: twitterData.lastRefreshed || new Date().toISOString(),
            _twitterDataMerged: true,
            _twitterDataMergedAt: new Date().toISOString()
          };
          
          // Recalculate community health score if needed
          if (twitterData.mentions !== undefined) {
            updatedToken.communityHealthScore = this.calculateCommunityHealthScore(twitterData);
            updatedToken.communityScore = updatedToken.communityHealthScore;
          }
          
          updated++;
          console.log(`🔄 Updated ${token.symbol}: ${twitterData.mentions} mentions, ${twitterData.likes} likes`);
          
          return updatedToken;
        } else {
          skipped++;
          console.log(`⏭️ Skipped ${token.symbol}: No Twitter data found`);
          return token;
        }
      } catch (error) {
        console.error(`❌ Error processing ${token.symbol}:`, error.message);
        skipped++;
        return token;
      }
    });
    
    return {
      mergedTokens,
      processed,
      updated,
      skipped
    };
  }

  /**
   * Find matching Twitter data for a token
   */
  findMatchingTwitterData(token, twitterMetrics) {
    const symbol = token.symbol;
    const name = token.name;
    
    // Try different cache key formats
    const possibleKeys = [
      `${symbol}_${name}`,
      `${symbol}_${symbol}`,
      symbol,
      name
    ];
    
    for (const key of possibleKeys) {
      if (twitterMetrics[key] && twitterMetrics[key].data) {
        const twitterData = twitterMetrics[key].data;
        
        // Validate Twitter data structure
        if (this.isValidTwitterData(twitterData)) {
          return twitterData;
        }
      }
    }
    
    return null;
  }

  /**
   * Validate Twitter data structure
   */
  isValidTwitterData(twitterData) {
    return (
      twitterData &&
      typeof twitterData === 'object' &&
      twitterData.mentions !== undefined &&
      typeof twitterData.mentions === 'number' &&
      twitterData.likes !== undefined &&
      typeof twitterData.likes === 'number'
    );
  }

  /**
   * Calculate community health score from Twitter data
   */
  calculateCommunityHealthScore(twitterData) {
    const mentions = twitterData.mentions || 0;
    const followers = twitterData.followers || 0;
    const engagement = (twitterData.likes || 0) + (twitterData.retweets || 0) + (twitterData.replies || 0);
    
    let score = 2.0; // Base score
    
    // Mentions contribution (0-3 points)
    if (mentions > 0) {
      score += Math.min(mentions / 20, 3);
    }
    
    // Followers contribution (0-2 points)
    if (followers > 0) {
      score += Math.min(Math.log10(followers) / 2, 2);
    }
    
    // Engagement contribution (0-3 points)
    if (engagement > 0) {
      score += Math.min(engagement / 50, 3);
    }
    
    return Math.min(score, 10);
  }

  /**
   * Validate merged data integrity
   */
  async validateMergedData(tokens) {
    console.log('🔍 Validating merged data...');
    
    // Check array structure
    if (!Array.isArray(tokens)) {
      throw new Error('Merged data is not an array');
    }
    
    // Check token structure
    for (const token of tokens) {
      if (!token.symbol || !token.name) {
        throw new Error(`Invalid token structure: missing symbol or name`);
      }
      
      // If token has Twitter data, validate it
      if (token.twitterData) {
        if (!this.isValidTwitterData(token.twitterData)) {
          throw new Error(`Invalid Twitter data for token ${token.symbol}`);
        }
      }
    }
    
    console.log('✅ Data validation passed');
  }

  /**
   * Atomic save with rollback capability
   */
  async atomicSave(tokens) {
    console.log('💾 Saving merged data...');
    
    try {
      // Write to temporary file first
      const tempPath = this.tokensCachePath + '.tmp';
      await fs.writeFile(tempPath, JSON.stringify(tokens, null, 2), 'utf8');
      
      // Atomic move
      await fs.rename(tempPath, this.tokensCachePath);
      
      console.log('✅ Data saved successfully');
    } catch (error) {
      // Cleanup temp file if it exists
      try {
        await fs.unlink(this.tokensCachePath + '.tmp');
      } catch (_) {}
      
      throw new Error(`Failed to save merged data: ${error.message}`);
    }
  }

  /**
   * Rollback to most recent backup
   */
  async rollback() {
    console.log('🔄 Attempting rollback...');
    
    try {
      // Find most recent backup
      const backupFiles = await fs.readdir(this.backupDir);
      const tokenBackups = backupFiles
        .filter(file => file.startsWith('tokens-cache-backup-') && file.endsWith('.json'))
        .sort()
        .reverse();
      
      if (tokenBackups.length === 0) {
        throw new Error('No backup files found for rollback');
      }
      
      const latestBackup = path.join(this.backupDir, tokenBackups[0]);
      
      // Restore from backup
      await fs.copyFile(latestBackup, this.tokensCachePath);
      
      console.log(`✅ Rollback completed from: ${tokenBackups[0]}`);
    } catch (error) {
      throw new Error(`Rollback failed: ${error.message}`);
    }
  }

  /**
   * Cleanup old backup files
   */
  async cleanupOldBackups() {
    try {
      const backupFiles = await fs.readdir(this.backupDir);
      const tokenBackups = backupFiles
        .filter(file => file.startsWith('tokens-cache-backup-') && file.endsWith('.json'))
        .sort()
        .reverse();
      
      // Keep only the most recent backups
      const backupsToDelete = tokenBackups.slice(this.maxBackups);
      
      for (const backup of backupsToDelete) {
        await fs.unlink(path.join(this.backupDir, backup));
        console.log(`🗑️ Deleted old backup: ${backup}`);
      }
    } catch (error) {
      console.warn('⚠️ Failed to cleanup old backups:', error.message);
    }
  }

  /**
   * Get merge status and statistics
   */
  async getMergeStatus() {
    try {
      const tokens = await this.loadTokensCache();
      const twitterMetrics = await this.loadTwitterMetrics();
      
      const tokensWithTwitterData = tokens.filter(t => t.twitterData && t._twitterDataMerged);
      const tokensWithFreshTwitterData = tokens.filter(t => 
        t.twitterData && 
        t._twitterDataMerged && 
        t.twitterData._dataFreshness !== 'cohort_baseline'
      );
      
      return {
        totalTokens: tokens.length,
        tokensWithTwitterData: tokensWithTwitterData.length,
        tokensWithFreshTwitterData: tokensWithFreshTwitterData.length,
        twitterMetricsEntries: Object.keys(twitterMetrics).length,
        lastMerge: tokensWithTwitterData.length > 0 ? 
          tokensWithTwitterData[0]._twitterDataMergedAt : null
      };
    } catch (error) {
      return {
        error: error.message
      };
    }
  }
}

export default TwitterDataMergeService;
