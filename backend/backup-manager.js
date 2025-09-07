#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import EnhancedBackupService from './enhancedBackupService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Backup Manager CLI Tool
 * 
 * Usage:
 * node backup-manager.js status          - Show backup status
 * node backup-manager.js list           - List all snapshots
 * node backup-manager.js create         - Create manual snapshot
 * node backup-manager.js restore <id>   - Restore from snapshot
 * node backup-manager.js start          - Start backup service
 * node backup-manager.js stop           - Stop backup service
 * node backup-manager.js health         - Check backup health
 * node backup-manager.js cleanup        - Force cleanup old snapshots
 */

class BackupManager {
  constructor() {
    this.backupService = new EnhancedBackupService();
  }

  async run() {
    const args = process.argv.slice(2);
    const command = args[0];

    if (!command) {
      this.showUsage();
      return;
    }

    try {
      switch (command.toLowerCase()) {
        case 'status':
          await this.showStatus();
          break;
        case 'list':
          await this.listSnapshots();
          break;
        case 'create':
          await this.createSnapshot();
          break;
        case 'restore':
          const snapshotId = args[1];
          if (!snapshotId) {
            console.error('❌ Please provide snapshot ID to restore');
            console.log('Usage: node backup-manager.js restore <snapshot-id>');
            process.exit(1);
          }
          await this.restoreSnapshot(snapshotId);
          break;
        case 'start':
          await this.startService();
          break;
        case 'stop':
          await this.stopService();
          break;
        case 'health':
          await this.checkHealth();
          break;
        case 'cleanup':
          await this.forceCleanup();
          break;
        default:
          console.error(`❌ Unknown command: ${command}`);
          this.showUsage();
          process.exit(1);
      }
    } catch (error) {
      console.error(`❌ Command failed: ${error.message}`);
      process.exit(1);
    }
  }

  showUsage() {
    console.log(`
🔄 Enhanced Backup Manager

Usage: node backup-manager.js <command> [options]

Commands:
  status              Show backup service status and statistics
  list               List all available snapshots
  create             Create a manual snapshot
  restore <id>       Restore from a specific snapshot
  start              Start the backup service
  stop               Stop the backup service  
  health             Check backup system health
  cleanup            Force cleanup of old snapshots

Examples:
  node backup-manager.js status
  node backup-manager.js create
  node backup-manager.js restore snapshot_1703123456789
  node backup-manager.js list
`);
  }

  async showStatus() {
    console.log('📊 Backup Service Status\n');
    
    const status = await this.backupService.getBackupStatus();
    
    if (status.error) {
      console.error(`❌ Error getting status: ${status.error}`);
      return;
    }

    // Service status
    console.log(`🔄 Service: ${status.isRunning ? '✅ Running' : '❌ Stopped'}`);
    console.log(`📂 Persistent Dir: ${status.directories.persistentDir}`);
    console.log(`💾 Local Cache: ${status.directories.localCacheDir}`);
    console.log('');

    // Configuration
    console.log('⚙️ Configuration:');
    console.log(`   Snapshots per day: ${status.configuration.snapshotsPerDay}`);
    console.log(`   Retention: ${status.configuration.retentionHours} hours`);
    console.log(`   Max snapshots: ${status.configuration.maxSnapshots}`);
    console.log(`   Backup interval: ${status.configuration.backupIntervalHours.toFixed(1)} hours`);
    console.log('');

    // Snapshots
    if (status.snapshots.error) {
      console.log(`⚠️ Snapshots: Error - ${status.snapshots.error}`);
    } else {
      console.log(`📸 Snapshots: ${status.snapshots.total} total`);
      if (status.snapshots.lastBackup) {
        const lastBackup = new Date(status.snapshots.lastBackup);
        const age = Math.round((Date.now() - lastBackup.getTime()) / (60 * 1000));
        console.log(`   Last backup: ${lastBackup.toLocaleString()} (${age} minutes ago)`);
      } else {
        console.log('   Last backup: Never');
      }
    }
    console.log('');

    // Health
    const healthIcon = status.health.status === 'healthy' ? '✅' : 
                      status.health.status === 'warning' ? '⚠️' : '❌';
    console.log(`🏥 Health: ${healthIcon} ${status.health.status.toUpperCase()}`);
    
    if (status.health.issues.length > 0) {
      console.log('   Issues:');
      status.health.issues.forEach(issue => {
        console.log(`   - ${issue}`);
      });
    }
  }

  async listSnapshots() {
    console.log('📸 Available Snapshots\n');
    
    const snapshots = await this.backupService.listSnapshots();
    
    if (snapshots.length === 0) {
      console.log('No snapshots available');
      return;
    }

    console.log('ID'.padEnd(25) + 'Timestamp'.padEnd(25) + 'Age'.padEnd(15) + 'Files'.padEnd(10) + 'Size'.padEnd(12) + 'Status');
    console.log('-'.repeat(95));
    
    snapshots.forEach(snapshot => {
      const status = snapshot.hasErrors ? '⚠️ Errors' : '✅ OK';
      const id = snapshot.id.length > 22 ? snapshot.id.substring(0, 22) + '...' : snapshot.id;
      
      console.log(
        id.padEnd(25) +
        new Date(snapshot.timestamp).toLocaleString().padEnd(25) +
        snapshot.age.padEnd(15) +
        snapshot.fileCount.toString().padEnd(10) +
        snapshot.size.padEnd(12) +
        status
      );
    });
    
    console.log(`\nTotal: ${snapshots.length} snapshots`);
  }

  async createSnapshot() {
    console.log('📸 Creating manual snapshot...\n');
    
    const startTime = Date.now();
    const metadata = await this.backupService.forceSnapshot('Manual CLI snapshot');
    
    if (metadata) {
      console.log('✅ Snapshot created successfully!');
      console.log(`📋 Snapshot ID: ${metadata.snapshotId}`);
      console.log(`📅 Timestamp: ${metadata.timestamp}`);
      console.log(`📊 Files: ${metadata.stats.fileCount}`);
      console.log(`📁 Directories: ${metadata.stats.dirCount}`);
      console.log(`💾 Total size: ${this.formatBytes(metadata.stats.totalSize)}`);
      console.log(`⏱️ Duration: ${metadata.duration}ms`);
      
      if (metadata.stats.errors.length > 0) {
        console.log(`⚠️ Errors: ${metadata.stats.errors.length}`);
      }
    } else {
      console.log('❌ Snapshot creation failed');
    }
  }

  async restoreSnapshot(snapshotId) {
    console.log(`🔄 Restoring from snapshot: ${snapshotId}\n`);
    
    // Confirm restoration
    console.log('⚠️ WARNING: This will overwrite the current persistent disk data!');
    console.log('An emergency backup will be created before restoration.');
    console.log('');
    
    // In a real CLI, you'd want to prompt for confirmation
    // For now, we'll proceed (you can add readline for interactive confirmation)
    
    try {
      const metadata = await this.backupService.restoreFromSnapshot(snapshotId);
      
      console.log('✅ Restoration completed successfully!');
      console.log(`📅 Restored from: ${metadata.timestamp}`);
      console.log(`📊 Files restored: ${metadata.stats.fileCount}`);
      console.log(`💾 Data restored: ${this.formatBytes(metadata.stats.totalSize)}`);
      
    } catch (error) {
      console.error(`❌ Restoration failed: ${error.message}`);
      throw error;
    }
  }

  async startService() {
    console.log('🔄 Starting Enhanced Backup Service...\n');
    
    await this.backupService.start();
    
    console.log('✅ Backup service started successfully!');
    console.log('The service will now create snapshots automatically.');
    console.log('Use "node backup-manager.js status" to monitor progress.');
  }

  async stopService() {
    console.log('🛑 Stopping Enhanced Backup Service...\n');
    
    await this.backupService.stop();
    
    console.log('✅ Backup service stopped successfully!');
  }

  async checkHealth() {
    console.log('🏥 Checking Backup System Health...\n');
    
    const health = await this.backupService.performHealthCheck();
    
    const statusIcon = health.status === 'healthy' ? '✅' : 
                      health.status === 'warning' ? '⚠️' : '❌';
    
    console.log(`Overall Status: ${statusIcon} ${health.status.toUpperCase()}`);
    console.log(`Check Time: ${health.timestamp}`);
    console.log('');
    
    if (health.issues.length === 0) {
      console.log('🎉 All systems healthy!');
    } else {
      console.log('Issues Found:');
      health.issues.forEach((issue, index) => {
        console.log(`${index + 1}. ${issue}`);
      });
    }
  }

  async forceCleanup() {
    console.log('🧹 Force cleaning up old snapshots...\n');
    
    await this.backupService.cleanupOldSnapshots();
    
    console.log('✅ Cleanup completed!');
    console.log('Use "node backup-manager.js list" to see remaining snapshots.');
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

// Run the CLI if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const manager = new BackupManager();
  manager.run().catch(error => {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
  });
}

export default BackupManager;
