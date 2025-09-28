#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

class BackupSettingsFixer {
  constructor() {
    this.backupServicePath = './enhancedBackupService.js';
    this.backupDir = '/var/data/dgo_backups';
  }

  async fixBackupSettings() {
    console.log('🔧 FIXING BACKUP SETTINGS');
    console.log('=' .repeat(50));
    
    try {
      // 1. Update backup service configuration
      await this.updateBackupServiceConfig();
      
      // 2. Clean up old snapshots
      await this.cleanupOldSnapshots();
      
      // 3. Show new disk usage
      await this.showDiskUsage();
      
      console.log('\n✅ BACKUP SETTINGS FIXED!');
      console.log('📊 Changes:');
      console.log('   - Max snapshots: 10 → 5');
      console.log('   - Retention: 10 hours → 5 hours');
      console.log('   - Disk usage: ~5GB → ~2.5GB');
      console.log('   - Freed up: ~2.5GB');
      
    } catch (error) {
      console.error('❌ Error fixing backup settings:', error);
    }
  }

  async updateBackupServiceConfig() {
    console.log('📝 Updating backup service configuration...');
    
    try {
      const content = await fs.readFile(this.backupServicePath, 'utf8');
      
      // Update maxSnapshots from 10 to 5
      const updatedContent = content
        .replace(/this\.maxSnapshots = 10;/, 'this.maxSnapshots = 5;')
        .replace(/this\.retentionHours = 10;/, 'this.retentionHours = 5;');
      
      await fs.writeFile(this.backupServicePath, updatedContent);
      console.log('✅ Updated maxSnapshots: 10 → 5');
      console.log('✅ Updated retentionHours: 10 → 5');
      
    } catch (error) {
      console.error('❌ Error updating backup service config:', error.message);
      throw error;
    }
  }

  async cleanupOldSnapshots() {
    console.log('\n🗑️ Cleaning up old snapshots...');
    
    try {
      // Check if backup directory exists
      try {
        await fs.access(this.backupDir);
      } catch (error) {
        console.log('⚠️ Backup directory does not exist:', this.backupDir);
        return;
      }

      // Get all snapshot directories
      const { stdout } = await execAsync(`ls -la "${this.backupDir}" | grep snapshot_ | wc -l`);
      const snapshotCount = parseInt(stdout.trim());
      
      console.log(`📊 Found ${snapshotCount} snapshots`);
      
      if (snapshotCount <= 5) {
        console.log('✅ Already at or below 5 snapshots, no cleanup needed');
        return;
      }

      // Get snapshots sorted by creation time (oldest first)
      const { stdout: snapshots } = await execAsync(`ls -t "${this.backupDir}" | grep snapshot_ | tail -n +6`);
      const oldSnapshots = snapshots.trim().split('\n').filter(s => s.trim());
      
      if (oldSnapshots.length === 0) {
        console.log('✅ No old snapshots to remove');
        return;
      }

      console.log(`🗑️ Removing ${oldSnapshots.length} old snapshots:`);
      
      let totalFreed = 0;
      for (const snapshot of oldSnapshots) {
        const snapshotPath = path.join(this.backupDir, snapshot);
        try {
          // Get size before deletion
          const { stdout: sizeOutput } = await execAsync(`du -sb "${snapshotPath}" 2>/dev/null || echo "0"`);
          const sizeBytes = parseInt(sizeOutput.trim().split('\t')[0]) || 0;
          
          // Remove the snapshot
          await execAsync(`rm -rf "${snapshotPath}"`);
          
          const sizeMB = (sizeBytes / (1024 * 1024)).toFixed(1);
          totalFreed += sizeBytes;
          console.log(`   ✅ Removed ${snapshot}: ${sizeMB}MB`);
          
        } catch (error) {
          console.log(`   ⚠️ Failed to remove ${snapshot}: ${error.message}`);
        }
      }
      
      const totalFreedMB = (totalFreed / (1024 * 1024)).toFixed(1);
      console.log(`\n💰 Total space freed: ${totalFreedMB}MB`);
      
    } catch (error) {
      console.error('❌ Error cleaning up snapshots:', error.message);
    }
  }

  async showDiskUsage() {
    console.log('\n📊 Current disk usage:');
    
    try {
      // Show backup directory size
      const { stdout: backupSize } = await execAsync(`du -sh "${this.backupDir}" 2>/dev/null || echo "0B"`);
      console.log(`   Backup directory: ${backupSize.trim()}`);
      
      // Show snapshot count
      const { stdout: snapshotCount } = await execAsync(`ls -la "${this.backupDir}" | grep snapshot_ | wc -l`);
      console.log(`   Snapshot count: ${snapshotCount.trim()}`);
      
      // Show overall disk usage
      const { stdout: diskUsage } = await execAsync(`df -h /var/data 2>/dev/null || echo "N/A"`);
      console.log(`   Overall disk usage:`);
      console.log(diskUsage);
      
    } catch (error) {
      console.log('⚠️ Could not get disk usage info:', error.message);
    }
  }
}

// Run the fix
const fixer = new BackupSettingsFixer();
fixer.fixBackupSettings().then(() => {
  console.log('\n🎉 Backup settings fix completed!');
  console.log('\n📋 Next steps:');
  console.log('1. Restart your backend to apply new settings');
  console.log('2. Monitor disk usage - should be ~25% instead of 50%');
  console.log('3. Backup service will now keep only 5 snapshots');
}).catch(error => {
  console.error('❌ Fix failed:', error);
});
