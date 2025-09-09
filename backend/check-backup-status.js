#!/usr/bin/env node

/**
 * CHECK BACKUP STATUS
 * Check what backups are available in production
 */

async function checkBackupStatus() {
  console.log('🔍 CHECKING BACKUP STATUS');
  console.log('=' .repeat(60));
  
  try {
    console.log('🌐 Fetching backup status...');
    const response = await fetch('https://api.degen-oracle.com/api/admin/backup/status');
    
    if (!response.ok) {
      console.error(`❌ Failed to get backup status: ${response.status} ${response.statusText}`);
      return;
    }
    
    const status = await response.json();
    console.log('📊 Backup Status:');
    console.log(JSON.stringify(status, null, 2));
    
    // Check if there are recent backups we can recover from
    if (status.backup && status.backup.recentBackups) {
      console.log('');
      console.log('📁 Available Backups:');
      status.backup.recentBackups.forEach((backup, i) => {
        console.log(`${i + 1}. ${backup.filename} - ${backup.tokenCount} tokens (${backup.size} bytes) - ${backup.timestamp}`);
      });
      
      // Find the largest backup (likely the one before the data loss)
      const largestBackup = status.backup.recentBackups.reduce((max, backup) => 
        backup.tokenCount > max.tokenCount ? backup : max
      );
      
      if (largestBackup.tokenCount > 100) {
        console.log('');
        console.log(`🎯 RECOMMENDED RESTORE: ${largestBackup.filename}`);
        console.log(`   - ${largestBackup.tokenCount} tokens`);
        console.log(`   - Created: ${largestBackup.timestamp}`);
        console.log('');
        console.log('💡 To restore this backup, run:');
        console.log(`   curl -X POST https://api.degen-oracle.com/api/admin/backup/recover -H "Content-Type: application/json" -d '{"filename":"${largestBackup.filename}"}'`);
      }
    }
    
  } catch (error) {
    console.error('❌ Failed to check backup status:', error);
  }
}

// Run the backup status check
checkBackupStatus().catch(console.error);



