import EnhancedBackupService from './enhancedBackupService.js';
import HybridDatabaseService from './hybridDatabaseService.js';

/**
 * Backup Integration Module
 * 
 * This module integrates the Enhanced Backup Service with the existing
 * Hybrid Database Service to provide seamless backup functionality.
 */

class BackupIntegration {
  constructor() {
    this.hybridDb = null;
    this.backupService = null;
    this.isInitialized = false;
  }

  /**
   * Initialize the backup integration
   */
  async initialize(hybridDatabaseService = null) {
    try {
      console.log('🔗 Initializing Backup Integration...');

      // Initialize or use provided HybridDatabaseService
      this.hybridDb = hybridDatabaseService || new HybridDatabaseService();
      
      // Initialize Enhanced Backup Service with hybrid DB reference
      this.backupService = new EnhancedBackupService(this.hybridDb);
      
      this.isInitialized = true;
      
      console.log('✅ Backup Integration initialized successfully');
      console.log(`📂 Monitoring: ${this.hybridDb.baseDir}`);
      
      return this;
      
    } catch (error) {
      console.error('❌ Backup Integration initialization failed:', error.message);
      throw error;
    }
  }

  /**
   * Start the integrated backup system
   */
  async start() {
    if (!this.isInitialized) {
      throw new Error('Backup integration not initialized. Call initialize() first.');
    }

    console.log('🚀 Starting integrated backup system...');
    
    // Start the enhanced backup service
    await this.backupService.start();
    
    // Set up database change monitoring (if needed)
    this.setupDatabaseMonitoring();
    
    console.log('✅ Integrated backup system started successfully');
  }

  /**
   * Stop the integrated backup system
   */
  async stop() {
    if (!this.isInitialized) {
      return;
    }

    console.log('🛑 Stopping integrated backup system...');
    
    await this.backupService.stop();
    
    console.log('✅ Integrated backup system stopped');
  }

  /**
   * Set up monitoring for database changes (optional enhancement)
   */
  setupDatabaseMonitoring() {
    // This could be enhanced to trigger backups on significant database changes
    // For now, we rely on the time-based backup schedule
    console.log('📊 Database change monitoring ready (time-based backups active)');
  }

  /**
   * Create an immediate backup with context
   */
  async createContextualBackup(reason = 'Manual backup', metadata = {}) {
    if (!this.isInitialized) {
      throw new Error('Backup integration not initialized');
    }

    console.log(`📸 Creating contextual backup: ${reason}`);
    
    // Add database context to the backup
    const dbStats = await this.getDatabaseStats();
    
    const backupMetadata = {
      reason,
      databaseStats: dbStats,
      ...metadata
    };

    return await this.backupService.forceSnapshot(reason);
  }

  /**
   * Get database statistics for backup context
   */
  async getDatabaseStats() {
    try {
      const stats = {
        timestamp: new Date().toISOString(),
        directories: {
          base: this.hybridDb.baseDir,
          users: this.hybridDb.usersDir,
          global: this.hybridDb.globalDir,
          cache: this.hybridDb.cacheDir
        }
      };

      // Try to get user count and other metrics
      try {
        const userIndexPath = `${this.hybridDb.globalDir}/users-index.json`;
        const userIndex = await this.hybridDb.readGlobalData('users-index');
        stats.userCount = Object.keys(userIndex || {}).length;
      } catch (error) {
        stats.userCount = 'unknown';
      }

      return stats;
      
    } catch (error) {
      console.warn('⚠️ Could not gather database stats:', error.message);
      return {
        timestamp: new Date().toISOString(),
        error: error.message
      };
    }
  }

  /**
   * Get comprehensive backup status including database info
   */
  async getStatus() {
    if (!this.isInitialized) {
      return {
        error: 'Backup integration not initialized',
        initialized: false
      };
    }

    const backupStatus = await this.backupService.getBackupStatus();
    const dbStats = await this.getDatabaseStats();

    return {
      initialized: true,
      integration: {
        version: '1.0',
        startTime: this.startTime || null
      },
      database: dbStats,
      backup: backupStatus
    };
  }

  /**
   * Restore from backup with database service restart
   */
  async restoreWithRestart(snapshotId) {
    if (!this.isInitialized) {
      throw new Error('Backup integration not initialized');
    }

    console.log(`🔄 Restoring with service restart: ${snapshotId}`);
    
    try {
      // Perform the restoration (no automatic backup creation)
      const result = await this.backupService.restoreFromSnapshot(snapshotId);
      
      // Restart database service to reload data
      console.log('🔄 Restarting database service...');
      
      // Re-initialize the hybrid database service to reload from restored data
      this.hybridDb = new HybridDatabaseService();
      
      console.log('✅ Restoration with restart completed successfully');
      
      return result;
      
    } catch (error) {
      console.error('❌ Restoration with restart failed:', error.message);
      throw error;
    }
  }

  /**
   * Get backup service instance (for direct access if needed)
   */
  getBackupService() {
    return this.backupService;
  }

  /**
   * Get database service instance (for direct access if needed)
   */
  getDatabaseService() {
    return this.hybridDb;
  }
}

/**
 * Factory function to create and initialize backup integration
 */
export async function createBackupIntegration(hybridDatabaseService = null) {
  const integration = new BackupIntegration();
  await integration.initialize(hybridDatabaseService);
  return integration;
}

/**
 * Singleton instance for global use
 */
let globalBackupIntegration = null;

export async function getGlobalBackupIntegration(hybridDatabaseService = null) {
  if (!globalBackupIntegration) {
    globalBackupIntegration = await createBackupIntegration(hybridDatabaseService);
  }
  return globalBackupIntegration;
}

export default BackupIntegration;
