#!/usr/bin/env node

/**
 * EMERGENCY: Restore users from backup or user directories
 */

import fs from 'fs/promises';
import path from 'path';

async function emergencyRestore() {
  try {
    console.log('🚨 EMERGENCY USER RESTORE INITIATED');
    
    const dataDir = process.env.DATA_DIR || '/var/data/dgo';
    const usersDir = path.join(dataDir, 'users');
    const globalDir = path.join(dataDir, 'global');
    const usersIndexPath = path.join(globalDir, 'users-index.json');
    
    console.log(`📂 Data directory: ${dataDir}`);
    console.log(`📂 Users directory: ${usersDir}`);
    console.log(`📂 Users index: ${usersIndexPath}`);
    
    // Check for backup files
    console.log('\n🔍 Checking for backup files...');
    const globalFiles = await fs.readdir(globalDir);
    const backupFiles = globalFiles.filter(f => f.includes('users-index') && f.includes('backup'));
    
    if (backupFiles.length > 0) {
      console.log(`✅ Found ${backupFiles.length} backup file(s):`);
      backupFiles.forEach(f => console.log(`   - ${f}`));
      
      // Use the most recent backup
      const mostRecent = backupFiles.sort().reverse()[0];
      const backupPath = path.join(globalDir, mostRecent);
      console.log(`\n📦 Using most recent backup: ${mostRecent}`);
      
      const backupData = await fs.readFile(backupPath, 'utf8');
      const users = JSON.parse(backupData);
      
      console.log(`✅ Backup contains ${users.length} users`);
      
      // Restore
      await fs.writeFile(usersIndexPath, JSON.stringify(users, null, 2));
      console.log(`✅ Restored users-index.json from backup`);
      
      return users;
    }
    
    // No backup found - try to rebuild from user directories
    console.log('⚠️  No backup found. Attempting to rebuild from user directories...');
    
    const userDirs = await fs.readdir(usersDir);
    const userFolders = userDirs.filter(d => d.startsWith('user-'));
    
    console.log(`📂 Found ${userFolders.length} user directories`);
    
    const rebuiltUsers = [];
    
    for (const folder of userFolders) {
      try {
        const userId = folder.replace('user-', '');
        const profilePath = path.join(usersDir, folder, 'profile.json');
        
        const profileData = await fs.readFile(profilePath, 'utf8');
        const profile = JSON.parse(profileData);
        
        rebuiltUsers.push({
          id: userId,
          username: profile.username,
          displayName: profile.displayName,
          profileImageUrl: profile.profileImageUrl,
          createdAt: profile.createdAt,
          referralCode: profile.referralCode
        });
        
        console.log(`✅ Rebuilt: ${profile.username} (${userId})`);
      } catch (err) {
        console.log(`⚠️  Could not rebuild ${folder}: ${err.message}`);
      }
    }
    
    if (rebuiltUsers.length > 0) {
      await fs.writeFile(usersIndexPath, JSON.stringify(rebuiltUsers, null, 2));
      console.log(`\n✅ Rebuilt users-index.json with ${rebuiltUsers.length} users`);
      return rebuiltUsers;
    }
    
    console.log('\n❌ Could not restore users - no backup or user directories found');
    return [];
    
  } catch (error) {
    console.error('❌ Emergency restore failed:', error.message);
    console.error(error.stack);
    return [];
  }
}

emergencyRestore().then(users => {
  console.log(`\n🏁 Restore completed: ${users.length} users recovered`);
  if (users.length > 0) {
    console.log('\n📋 Recovered users:');
    users.forEach(u => console.log(`   - ${u.username} (${u.id})`));
  }
  process.exit(0);
}).catch(error => {
  console.error('💥 Script failed:', error);
  process.exit(1);
});
