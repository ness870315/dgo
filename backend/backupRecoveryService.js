import fs from 'fs/promises';
import path from 'path';

class BackupRecoveryService {
  constructor(enhancedBackend) {
    this.backend = enhancedBackend;
    this.isRunning = false;
    this.backupInterval = 30 * 60 * 1000; // 30 minutes
    this.recoveryCheckInterval = 5 * 60 * 1000; // 5 minutes
    
    // Backup file paths
    const dataDir = process.env.DATA_DIR || '/var/data/dgo';
    this.mainCachePath = path.join(dataDir, 'cache', 'tokens-cache.json');
    this.backupCachePath = path.join(dataDir, 'cache', 'tokens-cache-backup.json');
    this.backupMetadataPath = path.join(dataDir, 'cache', 'backup-metadata.json');
    
    console.log('🛡️ Backup Recovery Service initialized');
    console.log(`📂 Main cache: ${this.mainCachePath}`);
    console.log(`💾 Backup cache: ${this.backupCachePath}`);
  }

  async start() {
    if (this.isRunning) {
      console.log('⚠️ Backup Recovery Service already running');
      return;
    }

    this.isRunning = true;
    console.log('🛡️ Starting Backup Recovery Service...');
    
    // Initial backup
    await this.createBackup();
    
    // Start backup interval (every 30 minutes)
    this.backupTimer = setInterval(async () => {
      try {
        await this.createBackup();
      } catch (error) {
        console.error('❌ Scheduled backup failed:', error.message);
      }
    }, this.backupInterval);
    
    // Start recovery check interval (every 5 minutes)
    this.recoveryTimer = setInterval(async () => {
      try {
        await this.checkAndRecover();
      } catch (error) {
        console.error('❌ Recovery check failed:', error.message);
      }
    }, this.recoveryCheckInterval);
    
    console.log('✅ Backup Recovery Service started successfully');
    console.log(`📅 Backup interval: ${this.backupInterval / 60000} minutes`);
    console.log(`🔍 Recovery check interval: ${this.recoveryCheckInterval / 60000} minutes`);
  }

  async stop() {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    
    if (this.backupTimer) {
      clearInterval(this.backupTimer);
      this.backupTimer = null;
    }
    
    if (this.recoveryTimer) {
      clearInterval(this.recoveryTimer);
      this.recoveryTimer = null;
    }
    
    console.log('🛡️ Backup Recovery Service stopped');
  }

  async createBackup() {
    try {
      console.log('💾 Creating automated backup...');
      
      // Check if main cache exists and has data
      let mainTokens = [];
      let mainCacheExists = false;
      
      try {
        const mainData = await fs.readFile(this.mainCachePath, 'utf8');
        mainTokens = JSON.parse(mainData);
        mainCacheExists = true;
      } catch (error) {
        console.log('⚠️ Main cache not accessible for backup:', error.message);
        return;
      }
      
      if (mainTokens.length === 0) {
        console.log('⚠️ Main cache is empty, skipping backup');
        return;
      }
      
      // Create backup metadata
      const metadata = {
        backupTimestamp: new Date().toISOString(),
        tokenCount: mainTokens.length,
        mainCacheSize: (await fs.stat(this.mainCachePath)).size,
        backupReason: 'scheduled',
        version: '1.0'
      };
      
      // Write backup files
      await fs.writeFile(this.backupCachePath, JSON.stringify(mainTokens, null, 2));
      await fs.writeFile(this.backupMetadataPath, JSON.stringify(metadata, null, 2));
      
      console.log(`✅ Backup created successfully: ${mainTokens.length} tokens`);
      console.log(`📅 Backup timestamp: ${metadata.backupTimestamp}`);
      
    } catch (error) {
      console.error('❌ Backup creation failed:', error.message);
    }
  }

  async checkAndRecover() {
    try {
      console.log('🔍 Checking cache health...');
      
      // Check main cache status
      let mainTokens = [];
      let needsRecovery = false;
      let recoveryReason = '';
      
      try {
        const mainData = await fs.readFile(this.mainCachePath, 'utf8');
        mainTokens = JSON.parse(mainData);
        
        if (mainTokens.length === 0) {
          needsRecovery = true;
          recoveryReason = 'Main cache is empty (0 tokens)';
        } else if (mainTokens.length < 10) {
          needsRecovery = true;
          recoveryReason = `Main cache has suspiciously few tokens (${mainTokens.length}) - possible corruption`;
        } else {
          // Cache has 10+ tokens - this is acceptable for production
          console.log(`📊 Cache has ${mainTokens.length} tokens - within acceptable range`);
        }
        
      } catch (error) {
        needsRecovery = true;
        recoveryReason = `Main cache not accessible: ${error.message}`;
      }
      
      if (!needsRecovery) {
        console.log(`✅ Cache health OK: ${mainTokens.length} tokens`);
        return;
      }
      
      console.log(`🚨 CACHE FAILURE DETECTED: ${recoveryReason}`);
      await this.performAutomaticRecovery(recoveryReason);
      
    } catch (error) {
      console.error('❌ Cache health check failed:', error.message);
    }
  }

  async performAutomaticRecovery(reason) {
    try {
      console.log('🚨 PERFORMING AUTOMATIC RECOVERY...');
      console.log(`📋 Reason: ${reason}`);
      
      // Check if backup exists
      let backupTokens = [];
      let backupMetadata = null;
      
      try {
        const backupData = await fs.readFile(this.backupCachePath, 'utf8');
        backupTokens = JSON.parse(backupData);
        
        const metadataData = await fs.readFile(this.backupMetadataPath, 'utf8');
        backupMetadata = JSON.parse(metadataData);
        
      } catch (error) {
        console.error('❌ No backup available for recovery:', error.message);
        
        // Alert - this is critical!
        console.error('🚨 CRITICAL: NO BACKUP AVAILABLE - MANUAL INTERVENTION REQUIRED');
        return;
      }
      
      if (backupTokens.length === 0) {
        console.error('❌ Backup is also empty - cannot recover');
        return;
      }
      
      console.log(`💾 Backup found: ${backupTokens.length} tokens from ${backupMetadata.backupTimestamp}`);
      
      // Create emergency backup of current state (even if broken)
      const emergencyBackupPath = this.mainCachePath.replace('.json', `-emergency-${Date.now()}.json`);
      try {
        const currentData = await fs.readFile(this.mainCachePath, 'utf8');
        await fs.writeFile(emergencyBackupPath, currentData);
        console.log(`📁 Current state backed up to: ${emergencyBackupPath}`);
      } catch (error) {
        console.log('⚠️ Could not backup current state:', error.message);
      }
      
      // Restore from backup
      await fs.writeFile(this.mainCachePath, JSON.stringify(backupTokens, null, 2));
      
      // Update recovery metadata
      const recoveryMetadata = {
        recoveryTimestamp: new Date().toISOString(),
        recoveryReason: reason,
        restoredTokenCount: backupTokens.length,
        backupSource: backupMetadata.backupTimestamp,
        emergencyBackupPath: emergencyBackupPath
      };
      
      const recoveryLogPath = path.join(path.dirname(this.mainCachePath), 'recovery-log.json');
      let recoveryLog = [];
      try {
        const logData = await fs.readFile(recoveryLogPath, 'utf8');
        recoveryLog = JSON.parse(logData);
      } catch (error) {
        // New log file
      }
      
      recoveryLog.push(recoveryMetadata);
      await fs.writeFile(recoveryLogPath, JSON.stringify(recoveryLog, null, 2));
      
      console.log('✅ AUTOMATIC RECOVERY COMPLETED SUCCESSFULLY');
      console.log(`📊 Restored ${backupTokens.length} tokens from backup`);
      console.log(`📅 Recovery timestamp: ${recoveryMetadata.recoveryTimestamp}`);
      console.log(`📋 Recovery logged to: ${recoveryLogPath}`);
      
      // Trigger a cache reload in the backend
      if (this.backend && typeof this.backend.getTokensFromCache === 'function') {
        console.log('🔄 Triggering backend cache reload...');
        setTimeout(() => {
          this.backend.getTokensFromCache().catch(error => {
            console.error('⚠️ Cache reload failed:', error.message);
          });
        }, 1000);
      }
      
    } catch (error) {
      console.error('❌ AUTOMATIC RECOVERY FAILED:', error.message);
      console.error('🚨 CRITICAL: MANUAL INTERVENTION REQUIRED');
    }
  }

  async getBackupStatus() {
    try {
      const status = {
        isRunning: this.isRunning,
        backupInterval: this.backupInterval,
        recoveryCheckInterval: this.recoveryCheckInterval
      };
      
      // Check main cache
      try {
        const mainData = await fs.readFile(this.mainCachePath, 'utf8');
        const mainTokens = JSON.parse(mainData);
        const mainStats = await fs.stat(this.mainCachePath);
        
        status.mainCache = {
          exists: true,
          tokenCount: mainTokens.length,
          size: mainStats.size,
          lastModified: mainStats.mtime
        };
      } catch (error) {
        status.mainCache = {
          exists: false,
          error: error.message
        };
      }
      
      // Check backup
      try {
        const backupData = await fs.readFile(this.backupCachePath, 'utf8');
        const backupTokens = JSON.parse(backupData);
        const backupStats = await fs.stat(this.backupCachePath);
        
        const metadataData = await fs.readFile(this.backupMetadataPath, 'utf8');
        const metadata = JSON.parse(metadataData);
        
        status.backup = {
          exists: true,
          tokenCount: backupTokens.length,
          size: backupStats.size,
          lastModified: backupStats.mtime,
          metadata: metadata
        };
      } catch (error) {
        status.backup = {
          exists: false,
          error: error.message
        };
      }
      
      // Check recovery log
      try {
        const recoveryLogPath = path.join(path.dirname(this.mainCachePath), 'recovery-log.json');
        const logData = await fs.readFile(recoveryLogPath, 'utf8');
        const recoveryLog = JSON.parse(logData);
        
        status.recoveryHistory = {
          totalRecoveries: recoveryLog.length,
          lastRecovery: recoveryLog[recoveryLog.length - 1] || null,
          recentRecoveries: recoveryLog.slice(-5)
        };
      } catch (error) {
        status.recoveryHistory = {
          totalRecoveries: 0,
          lastRecovery: null,
          recentRecoveries: []
        };
      }
      
      return status;
      
    } catch (error) {
      return {
        error: error.message,
        isRunning: this.isRunning
      };
    }
  }

  async forceBackup() {
    console.log('🔧 Manual backup requested...');
    await this.createBackup();
  }

  async forceRecovery(reason = 'Manual recovery requested') {
    console.log('🔧 Manual recovery requested...');
    await this.performAutomaticRecovery(reason);
  }
}

export default BackupRecoveryService;
