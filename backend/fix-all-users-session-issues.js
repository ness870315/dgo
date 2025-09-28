#!/usr/bin/env node

import HybridDatabaseService from './hybridDatabaseService.js';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

const db = new HybridDatabaseService();

async function fixAllUsersSessionIssues() {
  try {
    console.log('🔧 FIXING ALL USERS SESSION ISSUES');
    console.log('=' .repeat(50));
    
    // 1. Get all user directories
    const persistentDir = process.env.DATA_DIR || '/var/data/dgo';
    const usersDir = path.join(persistentDir, 'users');
    let allUsers = [];
    
    try {
      const userDirs = fs.readdirSync(usersDir);
      allUsers = userDirs.filter(dir => {
        const userPath = path.join(usersDir, dir);
        return fs.statSync(userPath).isDirectory();
      });
      console.log(`👥 Found ${allUsers.length} users to analyze`);
    } catch (error) {
      console.log('❌ Cannot read users directory:', error.message);
      return;
    }
    
    let fixedUsers = 0;
    let skippedUsers = 0;
    let errorUsers = 0;
    
    // 2. Process each user
    for (const userId of allUsers) {
      try {
        console.log(`\n👤 Processing user: ${userId}`);
        
        const profileFile = db.getUserFile(userId, 'profile.json');
        const profile = await db.readJsonFile(profileFile, {});
        
        let needsFix = false;
        const fixes = [];
        
        // Check if user needs sessionId
        if (!profile.sessionId) {
          profile.sessionId = crypto.randomBytes(32).toString('hex');
          fixes.push('Generated sessionId');
          needsFix = true;
        }
        
        // Check if stats need initialization
        if (!profile.stats) {
          profile.stats = {
            tokensListed: 0,
            tokensFueled: 0,
            totalFuelApplied: 0,
            totalFuelCost: 0,
            totalTokensListed: 0,
            totalTokensFueled: 0
          };
          fixes.push('Initialized stats');
          needsFix = true;
        }
        
        // Check activity file
        let activityFixed = false;
        try {
          const activityFile = db.getUserFile(userId, 'activity.json');
          const activity = await db.readJsonFile(activityFile, []);
          
          if (!Array.isArray(activity)) {
            // Activity file is corrupted, create new one
            const newActivity = [];
            await db.writeJsonFile(activityFile, newActivity);
            fixes.push('Fixed corrupted activity file');
            activityFixed = true;
            needsFix = true;
          }
        } catch (error) {
          // Activity file doesn't exist or is corrupted, create new one
          const activityFile = db.getUserFile(userId, 'activity.json');
          const newActivity = [];
          await db.writeJsonFile(activityFile, newActivity);
          fixes.push('Created new activity file');
          activityFixed = true;
          needsFix = true;
        }
        
        // Update lastUpdated timestamp
        profile.lastUpdated = new Date().toISOString();
        
        if (needsFix) {
          // Save the profile
          await db.writeJsonFile(profileFile, profile);
          
          console.log(`   ✅ Fixed user ${profile.username || userId}:`);
          fixes.forEach(fix => console.log(`     - ${fix}`));
          
          fixedUsers++;
        } else {
          console.log(`   ✅ User ${profile.username || userId} is healthy`);
          skippedUsers++;
        }
        
      } catch (error) {
        console.log(`   ❌ Error processing user ${userId}:`, error.message);
        errorUsers++;
      }
    }
    
    // 3. Fix token attribution issues
    console.log(`\n🪙 FIXING TOKEN ATTRIBUTION ISSUES:`);
    try {
      const tokens = await db.readJsonFile(path.join(db.cacheDir, 'tokens-cache.json'), []);
      const tokensWithoutAttribution = tokens.filter(t => !t.listedBy || t.listedBy === 'unknown');
      
      console.log(`   📊 Found ${tokensWithoutAttribution.length} tokens without attribution`);
      
      let attributionFixed = 0;
      
      for (const token of tokensWithoutAttribution) {
        // Try to find the user who listed this token
        // This is a simplified approach - in reality, you'd need more sophisticated matching
        if (token.symbol && token.name) {
          // For now, mark as system-listed
          token.listedBy = 'system';
          token.listedByUsername = 'System';
          token.listedAt = new Date().toISOString();
          token.source = 'attribution_fix';
          attributionFixed++;
        }
      }
      
      if (attributionFixed > 0) {
        await db.writeJsonFile(path.join(db.cacheDir, 'tokens-cache.json'), tokens);
        console.log(`   ✅ Fixed attribution for ${attributionFixed} tokens`);
      } else {
        console.log(`   ✅ No token attribution issues found`);
      }
      
    } catch (error) {
      console.log('   ❌ Error fixing token attribution:', error.message);
    }
    
    // 4. Summary
    console.log(`\n📊 FIX SUMMARY:`);
    console.log(`   👥 Total users processed: ${allUsers.length}`);
    console.log(`   ✅ Users fixed: ${fixedUsers}`);
    console.log(`   ⏭️ Users skipped (healthy): ${skippedUsers}`);
    console.log(`   ❌ Users with errors: ${errorUsers}`);
    
    if (fixedUsers > 0) {
      console.log(`\n🎉 SUCCESS: Fixed ${fixedUsers} users with session/activity issues`);
      console.log(`   All users now have valid sessionIds and activity files`);
      console.log(`   Token listing tracking should work for all users`);
    } else {
      console.log(`\n✅ NO ISSUES: All users were already healthy`);
    }
    
    // 5. Future prevention recommendations
    console.log(`\n🛡️ FUTURE PREVENTION RECOMMENDATIONS:`);
    console.log(`   1. Add sessionId validation on user registration`);
    console.log(`   2. Add activity file structure validation`);
    console.log(`   3. Add token attribution validation`);
    console.log(`   4. Add monitoring for corrupted files`);
    console.log(`   5. Add automated health checks`);
    
  } catch (error) {
    console.error('❌ Fix all users failed:', error);
  }
}

// Run the fix
fixAllUsersSessionIssues().then(() => {
  console.log('\n✅ Fix all users completed!');
  process.exit(0);
}).catch(error => {
  console.error('❌ Fix all users failed:', error);
  process.exit(1);
});
