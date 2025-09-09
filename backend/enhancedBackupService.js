import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Enhanced Backup Service
 * 
 * Features:
 * - 5 snapshots per day (every 4.8 hours)
 * - 48-hour retention (10 total snapshots max)
 * - Automatic rotation and cleanup
 * - Backs up entire persistent disk to local cache
 * - Date/time stamped backups
 * - Health monitoring and recovery
 */
class EnhancedBackupService {
  constructor(hybridDatabaseService = null) {
    this.hybridDb = hybridDatabaseService;
    this.isRunning = false;
    
    // Backup configuration
    this.snapshotsPerDay = 5;
    this.retentionHours = 48;
    this.maxSnapshots = this.snapshotsPerDay * (this.retentionHours / 24); // 10 snapshots
    this.backupIntervalMs = (24 * 60 * 60 * 1000) / this.snapshotsPerDay; // 4.8 hours
    
    // Paths
    this.persistentDir = process.env.DATA_DIR || '/var/data/dgo';
    // Store snapshots on persistent disk to survive reboots (fallback to DATA_DIR/backups)
    this.localCacheDir = process.env.BACKUP_DIR || path.join(this.persistentDir, 'backups');
    this.backupMetadataPath = path.join(this.localCacheDir, 'backup-metadata.json');
    this.schedulerStatePath = path.join(this.localCacheDir, 'backup-scheduler.json');
    
    // Ensure local cache directory exists
    this.initializeLocalCache();
    
    console.log('🔄 Enhanced Backup Service initialized');
    console.log(`📂 Persistent disk: ${this.persistentDir}`);
    console.log(`💾 Local backup cache: ${this.localCacheDir}`);
    console.log(`⏰ Backup interval: ${(this.backupIntervalMs / (60 * 60 * 1000)).toFixed(1)} hours`);
    console.log(`📊 Max snapshots: ${this.maxSnapshots} (${this.retentionHours}h retention)`);
  }

  async initializeLocalCache() {
    try {
      await fs.mkdir(this.localCacheDir, { recursive: true });
      console.log(`✅ Local backup cache directory ready: ${this.localCacheDir}`);
      // One-time migration from legacy path inside code directory if present
      await this.migrateLegacyCacheIfNeeded();
    } catch (error) {
      console.error('❌ Failed to create local backup cache directory:', error.message);
      throw error;
    }
  }

  /**
   * Migrate legacy snapshots from backend/local-backup-cache to persistent location
   */
  async migrateLegacyCacheIfNeeded() {
    try {
      const legacyDir = path.join(__dirname, 'local-backup-cache');
      // If legacyDir equals current dir, nothing to do
      if (path.resolve(legacyDir) === path.resolve(this.localCacheDir)) return;

      const legacyExists = fsSync.existsSync(legacyDir);
      if (!legacyExists) return;

      // If new location already has metadata or any snapshot directories, skip migration
      const newHasMetadata = fsSync.existsSync(this.backupMetadataPath);
      let newHasSnapshots = false;
      try {
        const items = await fs.readdir(this.localCacheDir, { withFileTypes: true });
        newHasSnapshots = items.some(d => d.isDirectory() && d.name.startsWith('snapshot_'));
      } catch (_) {}
      if (newHasMetadata || newHasSnapshots) {
        console.log('ℹ️ Persistent backup directory already initialized, skipping legacy migration');
        return;
      }

      console.log(`🚚 Migrating legacy snapshots from ${legacyDir} → ${this.localCacheDir} ...`);
      // Copy all contents from legacy to new location
      await this.restoreDirectory(legacyDir, this.localCacheDir, []);
      // Attempt to remove legacy directory after successful copy
      try {
        await fs.rm(legacyDir, { recursive: true, force: true });
      } catch (_) {}
      console.log('✅ Legacy snapshots migrated to persistent storage');
    } catch (error) {
      console.warn('⚠️ Legacy backup migration failed (continuing):', error.message);
    }
  }

  /**
   * Start the enhanced backup service
   */
  async start() {
    if (this.isRunning) {
      console.log('⚠️ Enhanced Backup Service already running');
      return;
    }

    this.isRunning = true;
    console.log('🔄 Starting Enhanced Backup Service...');
    
    // Load scheduler state
    const now = Date.now();
    const state = await this.loadSchedulerState();
    let lastRunAt = state?.lastRunAt || 0;
    let nextRunAt = state?.nextRunAt || 0;

    const scheduleNext = (delayMs) => {
      if (this.backupTimer) clearInterval(this.backupTimer);
      if (this.backupTimeout) clearTimeout(this.backupTimeout);
      // One-shot timeout, then switch to steady interval
      this.backupTimeout = setTimeout(async () => {
        try {
          await this.createSnapshot();
        } catch (e) {
          console.error('❌ Scheduled backup failed:', e.message);
        }
        // After first execution, continue at steady interval
        this.backupTimer = setInterval(async () => {
          try {
            await this.createSnapshot();
          } catch (error) {
            console.error('❌ Scheduled backup failed:', error.message);
          }
        }, this.backupIntervalMs);
      }, Math.max(0, delayMs));
    };

    if (!lastRunAt || !nextRunAt) {
      // First run: create snapshot immediately and schedule next
      await this.createSnapshot();
      scheduleNext(this.backupIntervalMs);
    } else if (now >= nextRunAt) {
      // Missed at least one run while down → catch up immediately
      await this.createSnapshot();
      scheduleNext(this.backupIntervalMs);
    } else {
      // Schedule for remaining time until nextRunAt
      const delay = nextRunAt - now;
      console.log(`⏳ Next snapshot in ${(delay / (60*1000)).toFixed(1)} minutes`);
      scheduleNext(delay);
    }
    
    // Health check every 30 minutes
    this.healthTimer = setInterval(async () => {
      try {
        await this.performHealthCheck();
      } catch (error) {
        console.error('❌ Health check failed:', error.message);
      }
    }, 30 * 60 * 1000);
    
    console.log('✅ Enhanced Backup Service started successfully');
  }

  /**
   * Stop the backup service
   */
  async stop() {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    
    if (this.backupTimer) { clearInterval(this.backupTimer); this.backupTimer = null; }
    if (this.backupTimeout) { clearTimeout(this.backupTimeout); this.backupTimeout = null; }
    
    if (this.healthTimer) {
      clearInterval(this.healthTimer);
      this.healthTimer = null;
    }
    
    console.log('🔄 Enhanced Backup Service stopped');
  }

  /**
   * Create a complete snapshot of the persistent disk
   */
  async createSnapshot() {
    const startTime = Date.now();
    const timestamp = new Date().toISOString();
    const snapshotId = `snapshot_${Date.now()}`;
    
    console.log(`📸 Creating snapshot: ${snapshotId}`);
    
    try {
      // Check if persistent directory exists
      if (!fsSync.existsSync(this.persistentDir)) {
        console.log('⚠️ Persistent directory not found, skipping backup');
        return null;
      }

      // Create snapshot directory
      const snapshotDir = path.join(this.localCacheDir, snapshotId);
      await fs.mkdir(snapshotDir, { recursive: true });

      // Backup all directories and files
      const backupStats = await this.backupDirectory(this.persistentDir, snapshotDir);
      
      // Create snapshot metadata
      const metadata = {
        snapshotId,
        timestamp,
        duration: Date.now() - startTime,
        sourceDir: this.persistentDir,
        backupDir: snapshotDir,
        stats: backupStats,
        version: '1.0'
      };

      // Save snapshot metadata
      const snapshotMetadataPath = path.join(snapshotDir, 'snapshot-metadata.json');
      await fs.writeFile(snapshotMetadataPath, JSON.stringify(metadata, null, 2));

      // Update global backup metadata
      await this.updateBackupMetadata(metadata);

      // Update scheduler state (persist next run)
      await this.saveSchedulerState({
        lastRunAt: Date.now(),
        nextRunAt: Date.now() + this.backupIntervalMs
      });

      // Clean up old snapshots
      await this.cleanupOldSnapshots();

      console.log(`✅ Snapshot created successfully: ${snapshotId}`);
      console.log(`📊 Files: ${backupStats.fileCount}, Dirs: ${backupStats.dirCount}, Size: ${this.formatBytes(backupStats.totalSize)}`);
      console.log(`⏱️ Duration: ${metadata.duration}ms`);

      return metadata;

    } catch (error) {
      console.error(`❌ Snapshot creation failed: ${error.message}`);
      
      // Clean up failed snapshot directory
      try {
        const failedSnapshotDir = path.join(this.localCacheDir, snapshotId);
        if (fsSync.existsSync(failedSnapshotDir)) {
          await fs.rm(failedSnapshotDir, { recursive: true, force: true });
        }
      } catch (cleanupError) {
        console.error('❌ Failed to cleanup failed snapshot:', cleanupError.message);
      }
      
      throw error;
    }
  }

  /**
   * Scheduler state persistence
   */
  async loadSchedulerState() {
    try {
      const raw = await fs.readFile(this.schedulerStatePath, 'utf8');
      return JSON.parse(raw || '{}');
    } catch (_) {
      return null;
    }
  }

  async saveSchedulerState(state) {
    try {
      await fs.writeFile(this.schedulerStatePath, JSON.stringify(state, null, 2));
    } catch (e) {
      console.warn('⚠️ Failed to persist backup scheduler state:', e.message);
    }
  }

  /**
   * Recursively backup a directory
   */
  async backupDirectory(sourceDir, targetDir) {
    const stats = {
      fileCount: 0,
      dirCount: 0,
      totalSize: 0,
      errors: []
    };

    try {
      const items = await fs.readdir(sourceDir, { withFileTypes: true });

      for (const item of items) {
        const sourcePath = path.join(sourceDir, item.name);
        const targetPath = path.join(targetDir, item.name);

        try {
          if (item.isDirectory()) {
            // Create directory and recurse
            await fs.mkdir(targetPath, { recursive: true });
            stats.dirCount++;
            
            const subStats = await this.backupDirectory(sourcePath, targetPath);
            stats.fileCount += subStats.fileCount;
            stats.dirCount += subStats.dirCount;
            stats.totalSize += subStats.totalSize;
            stats.errors.push(...subStats.errors);
            
          } else if (item.isFile()) {
            // Copy file
            await fs.copyFile(sourcePath, targetPath);
            const fileStats = await fs.stat(sourcePath);
            stats.fileCount++;
            stats.totalSize += fileStats.size;
          }
        } catch (error) {
          stats.errors.push({
            path: sourcePath,
            error: error.message
          });
          console.error(`⚠️ Failed to backup ${sourcePath}: ${error.message}`);
        }
      }

    } catch (error) {
      stats.errors.push({
        path: sourceDir,
        error: error.message
      });
      console.error(`⚠️ Failed to read directory ${sourceDir}: ${error.message}`);
    }

    return stats;
  }

  /**
   * Update the global backup metadata
   */
  async updateBackupMetadata(snapshotMetadata) {
    let backupMetadata = {
      snapshots: [],
      lastBackup: null,
      totalSnapshots: 0
    };

    // Load existing metadata
    try {
      const data = await fs.readFile(this.backupMetadataPath, 'utf8');
      backupMetadata = JSON.parse(data);
    } catch (error) {
      // New metadata file
    }

    // Add new snapshot
    backupMetadata.snapshots.push({
      snapshotId: snapshotMetadata.snapshotId,
      timestamp: snapshotMetadata.timestamp,
      duration: snapshotMetadata.duration,
      fileCount: snapshotMetadata.stats.fileCount,
      totalSize: snapshotMetadata.stats.totalSize,
      errorCount: snapshotMetadata.stats.errors.length
    });

    // Sort by timestamp (newest first)
    backupMetadata.snapshots.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Update counters
    backupMetadata.lastBackup = snapshotMetadata.timestamp;
    backupMetadata.totalSnapshots = backupMetadata.snapshots.length;

    // Save metadata
    await fs.writeFile(this.backupMetadataPath, JSON.stringify(backupMetadata, null, 2));
  }

  /**
   * Clean up old snapshots beyond retention period
   */
  async cleanupOldSnapshots() {
    try {
      console.log('🧹 Cleaning up old snapshots...');
      
      // Load metadata
      let backupMetadata;
      try {
        const data = await fs.readFile(this.backupMetadataPath, 'utf8');
        backupMetadata = JSON.parse(data);
      } catch (error) {
        console.log('⚠️ No backup metadata found for cleanup');
        return;
      }

      const now = Date.now();
      const retentionMs = this.retentionHours * 60 * 60 * 1000;
      
      // Find snapshots to delete
      const snapshotsToDelete = [];
      const snapshotsToKeep = [];

      for (const snapshot of backupMetadata.snapshots) {
        const snapshotTime = new Date(snapshot.timestamp).getTime();
        const age = now - snapshotTime;
        
        if (age > retentionMs || snapshotsToKeep.length >= this.maxSnapshots) {
          snapshotsToDelete.push(snapshot);
        } else {
          snapshotsToKeep.push(snapshot);
        }
      }

      // Delete old snapshot directories
      for (const snapshot of snapshotsToDelete) {
        try {
          const snapshotDir = path.join(this.localCacheDir, snapshot.snapshotId);
          if (fsSync.existsSync(snapshotDir)) {
            await fs.rm(snapshotDir, { recursive: true, force: true });
            console.log(`🗑️ Deleted old snapshot: ${snapshot.snapshotId}`);
          }
        } catch (error) {
          console.error(`❌ Failed to delete snapshot ${snapshot.snapshotId}: ${error.message}`);
        }
      }

      // Update metadata with remaining snapshots
      backupMetadata.snapshots = snapshotsToKeep;
      backupMetadata.totalSnapshots = snapshotsToKeep.length;
      await fs.writeFile(this.backupMetadataPath, JSON.stringify(backupMetadata, null, 2));

      if (snapshotsToDelete.length > 0) {
        console.log(`✅ Cleaned up ${snapshotsToDelete.length} old snapshots`);
        console.log(`📊 Remaining snapshots: ${snapshotsToKeep.length}/${this.maxSnapshots}`);
      }

    } catch (error) {
      console.error('❌ Cleanup failed:', error.message);
    }
  }

  /**
   * Restore from a specific snapshot
   */
  async restoreFromSnapshot(snapshotId) {
    console.log(`🔄 Restoring from snapshot: ${snapshotId}`);
    
    try {
      const snapshotDir = path.join(this.localCacheDir, snapshotId);
      
      // Check if snapshot exists
      if (!fsSync.existsSync(snapshotDir)) {
        throw new Error(`Snapshot not found: ${snapshotId}`);
      }

      // Load snapshot metadata
      const snapshotMetadataPath = path.join(snapshotDir, 'snapshot-metadata.json');
      const metadataData = await fs.readFile(snapshotMetadataPath, 'utf8');
      const metadata = JSON.parse(metadataData);

      console.log(`📅 Snapshot timestamp: ${metadata.timestamp}`);
      console.log(`📊 Files: ${metadata.stats.fileCount}, Size: ${this.formatBytes(metadata.stats.totalSize)}`);

      // Create backup of current state
      const emergencyBackupId = `emergency_${Date.now()}`;
      console.log(`💾 Creating emergency backup: ${emergencyBackupId}`);
      
      try {
        await this.createSnapshot();
      } catch (error) {
        console.warn('⚠️ Could not create emergency backup:', error.message);
      }

      // Restore from snapshot
      await this.restoreDirectory(snapshotDir, this.persistentDir, ['snapshot-metadata.json']);

      console.log(`✅ Successfully restored from snapshot: ${snapshotId}`);
      
      // Log the restoration
      await this.logRestoration(snapshotId, metadata);

      return metadata;

    } catch (error) {
      console.error(`❌ Restoration failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Recursively restore a directory
   */
  async restoreDirectory(sourceDir, targetDir, excludeFiles = []) {
    try {
      // Ensure target directory exists
      await fs.mkdir(targetDir, { recursive: true });

      const items = await fs.readdir(sourceDir, { withFileTypes: true });

      for (const item of items) {
        // Skip excluded files
        if (excludeFiles.includes(item.name)) {
          continue;
        }

        const sourcePath = path.join(sourceDir, item.name);
        const targetPath = path.join(targetDir, item.name);

        if (item.isDirectory()) {
          await this.restoreDirectory(sourcePath, targetPath, excludeFiles);
        } else if (item.isFile()) {
          await fs.copyFile(sourcePath, targetPath);
        }
      }

    } catch (error) {
      console.error(`❌ Failed to restore directory ${sourceDir}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Log restoration activity
   */
  async logRestoration(snapshotId, metadata) {
    const restorationLog = {
      timestamp: new Date().toISOString(),
      snapshotId,
      snapshotTimestamp: metadata.timestamp,
      restoredFiles: metadata.stats.fileCount,
      restoredSize: metadata.stats.totalSize
    };

    const logPath = path.join(this.localCacheDir, 'restoration-log.json');
    let logs = [];

    try {
      const data = await fs.readFile(logPath, 'utf8');
      logs = JSON.parse(data);
    } catch (error) {
      // New log file
    }

    logs.push(restorationLog);
    
    // Keep only last 50 restoration logs
    if (logs.length > 50) {
      logs = logs.slice(-50);
    }

    await fs.writeFile(logPath, JSON.stringify(logs, null, 2));
  }

  /**
   * Perform health check on backup system
   */
  async performHealthCheck() {
    console.log('🔍 Performing backup health check...');
    
    const health = {
      timestamp: new Date().toISOString(),
      status: 'healthy',
      issues: []
    };

    try {
      // Check if local cache directory exists
      if (!fsSync.existsSync(this.localCacheDir)) {
        health.issues.push('Local backup cache directory missing');
        health.status = 'warning';
      }

      // Check backup metadata
      try {
        const data = await fs.readFile(this.backupMetadataPath, 'utf8');
        const metadata = JSON.parse(data);
        
        if (metadata.snapshots.length === 0) {
          health.issues.push('No snapshots available');
          health.status = 'warning';
        } else {
          const lastBackup = new Date(metadata.lastBackup);
          const timeSinceLastBackup = Date.now() - lastBackup.getTime();
          const maxInterval = this.backupIntervalMs * 1.5; // Allow 50% tolerance
          
          if (timeSinceLastBackup > maxInterval) {
            health.issues.push(`Last backup too old: ${Math.round(timeSinceLastBackup / (60 * 60 * 1000))} hours ago`);
            health.status = 'warning';
          }
        }
      } catch (error) {
        health.issues.push('Cannot read backup metadata');
        health.status = 'error';
      }

      // Check persistent directory
      if (!fsSync.existsSync(this.persistentDir)) {
        health.issues.push('Persistent directory not accessible');
        health.status = 'error';
      }

      if (health.issues.length === 0) {
        console.log('✅ Backup system health check passed');
      } else {
        console.log(`⚠️ Backup system health issues (${health.status}):`, health.issues);
      }

    } catch (error) {
      health.status = 'error';
      health.issues.push(`Health check failed: ${error.message}`);
      console.error('❌ Backup health check failed:', error.message);
    }

    return health;
  }

  /**
   * Get backup status and statistics
   */
  async getBackupStatus() {
    try {
      const status = {
        isRunning: this.isRunning,
        configuration: {
          snapshotsPerDay: this.snapshotsPerDay,
          retentionHours: this.retentionHours,
          maxSnapshots: this.maxSnapshots,
          backupIntervalHours: this.backupIntervalMs / (60 * 60 * 1000)
        },
        directories: {
          persistentDir: this.persistentDir,
          localCacheDir: this.localCacheDir
        }
      };

      // Load backup metadata
      try {
        const data = await fs.readFile(this.backupMetadataPath, 'utf8');
        const metadata = JSON.parse(data);
        
        status.snapshots = {
          total: metadata.totalSnapshots,
          lastBackup: metadata.lastBackup,
          snapshots: metadata.snapshots.map(s => ({
            id: s.snapshotId,
            timestamp: s.timestamp,
            fileCount: s.fileCount,
            size: this.formatBytes(s.totalSize),
            duration: s.duration,
            hasErrors: s.errorCount > 0
          }))
        };
      } catch (error) {
        status.snapshots = {
          total: 0,
          lastBackup: null,
          snapshots: [],
          error: error.message
        };
      }

      // Get health status
      status.health = await this.performHealthCheck();

      return status;

    } catch (error) {
      return {
        error: error.message,
        isRunning: this.isRunning
      };
    }
  }

  /**
   * List available snapshots
   */
  async listSnapshots() {
    try {
      const data = await fs.readFile(this.backupMetadataPath, 'utf8');
      const metadata = JSON.parse(data);
      
      return metadata.snapshots.map(s => ({
        id: s.snapshotId,
        timestamp: s.timestamp,
        age: this.formatAge(new Date(s.timestamp)),
        fileCount: s.fileCount,
        size: this.formatBytes(s.totalSize),
        duration: `${s.duration}ms`,
        hasErrors: s.errorCount > 0
      }));
    } catch (error) {
      return [];
    }
  }

  /**
   * Force create a snapshot manually
   */
  async forceSnapshot(reason = 'Manual snapshot') {
    console.log(`🔧 Manual snapshot requested: ${reason}`);
    return await this.createSnapshot();
  }

  /**
   * Utility: Format bytes to human readable
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Utility: Format age to human readable
   */
  formatAge(date) {
    const now = new Date();
    const diff = now - date;
    const hours = Math.floor(diff / (60 * 60 * 1000));
    const minutes = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000));
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ago`;
    } else {
      return `${minutes}m ago`;
    }
  }
}

export default EnhancedBackupService;
