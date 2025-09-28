#!/usr/bin/env node

import HybridDatabaseService from './hybridDatabaseService.js';
import path from 'path';
import fs from 'fs';

const db = new HybridDatabaseService();

async function analyzeAllUsersSessionIssues() {
  try {
    console.log('🔍 ANALYZING ALL USERS FOR SESSION ISSUES');
    console.log('=' .repeat(60));
    
    // 1. Get all user directories
    const persistentDir = process.env.DATA_DIR || '/var/data/dgo';
    const usersDir = path.join(persistentDir, 'users');
    console.log(`📂 Persistent directory: ${persistentDir}`);
    console.log(`📂 Users directory: ${usersDir}`);
    
    let allUsers = [];
    try {
      const userDirs = fs.readdirSync(usersDir);
      allUsers = userDirs.filter(dir => {
        const userPath = path.join(usersDir, dir);
        return fs.statSync(userPath).isDirectory();
      });
      console.log(`👥 Total users found: ${allUsers.length}`);
    } catch (error) {
      console.log('❌ Cannot read users directory:', error.message);
      return;
    }
    
    // 2. Analyze each user's profile
    console.log('\n📊 USER PROFILE ANALYSIS:');
    let usersWithSessionId = 0;
    let usersWithoutSessionId = 0;
    let usersWithTokensListed = 0;
    let usersWithTokensFueled = 0;
    let corruptedProfiles = 0;
    let corruptedActivities = 0;
    
    const userAnalysis = [];
    
    for (const userId of allUsers) {
      try {
        const profileFile = db.getUserFile(userId, 'profile.json');
        const profile = await db.readJsonFile(profileFile, {});
        
        const analysis = {
          userId: userId,
          username: profile.username || 'unknown',
          hasSessionId: !!profile.sessionId,
          tokensListed: profile.stats?.tokensListed || 0,
          tokensFueled: profile.stats?.tokensFueled || 0,
          lastUpdated: profile.lastUpdated,
          profileCorrupted: false
        };
        
        // Check activity file
        try {
          const activityFile = db.getUserFile(userId, 'activity.json');
          const activity = await db.readJsonFile(activityFile, []);
          analysis.activityCorrupted = !Array.isArray(activity);
          analysis.activityCount = Array.isArray(activity) ? activity.length : 0;
        } catch (error) {
          analysis.activityCorrupted = true;
          analysis.activityCount = 0;
        }
        
        userAnalysis.push(analysis);
        
        // Count statistics
        if (analysis.hasSessionId) usersWithSessionId++;
        else usersWithoutSessionId++;
        
        if (analysis.tokensListed > 0) usersWithTokensListed++;
        if (analysis.tokensFueled > 0) usersWithTokensFueled++;
        if (analysis.profileCorrupted) corruptedProfiles++;
        if (analysis.activityCorrupted) corruptedActivities++;
        
      } catch (error) {
        console.log(`❌ Error analyzing user ${userId}:`, error.message);
        corruptedProfiles++;
      }
    }
    
    // 3. Display statistics
    console.log(`\n📈 STATISTICS:`);
    console.log(`   👥 Total users: ${allUsers.length}`);
    console.log(`   🔑 Users with sessionId: ${usersWithSessionId}`);
    console.log(`   ❌ Users without sessionId: ${usersWithoutSessionId}`);
    console.log(`   📝 Users with tokensListed > 0: ${usersWithTokensListed}`);
    console.log(`   🔥 Users with tokensFueled > 0: ${usersWithTokensFueled}`);
    console.log(`   💥 Corrupted profiles: ${corruptedProfiles}`);
    console.log(`   💥 Corrupted activities: ${corruptedActivities}`);
    
    // 4. Show users without sessionId
    console.log(`\n❌ USERS WITHOUT SESSIONID:`);
    const usersWithoutSession = userAnalysis.filter(u => !u.hasSessionId);
    if (usersWithoutSession.length > 0) {
      usersWithoutSession.forEach(user => {
        console.log(`   👤 ${user.username} (${user.userId}) - tokensListed: ${user.tokensListed}, tokensFueled: ${user.tokensFueled}`);
      });
    } else {
      console.log('   ✅ All users have sessionId');
    }
    
    // 5. Show users with corrupted activity files
    console.log(`\n💥 USERS WITH CORRUPTED ACTIVITY FILES:`);
    const usersWithCorruptedActivity = userAnalysis.filter(u => u.activityCorrupted);
    if (usersWithCorruptedActivity.length > 0) {
      usersWithCorruptedActivity.forEach(user => {
        console.log(`   👤 ${user.username} (${user.userId}) - Activity file corrupted`);
      });
    } else {
      console.log('   ✅ All activity files are healthy');
    }
    
    // 6. Show users with tokens but no sessionId (potential issues)
    console.log(`\n⚠️ USERS WITH TOKENS BUT NO SESSIONID (POTENTIAL ISSUES):`);
    const usersWithTokensButNoSession = userAnalysis.filter(u => 
      !u.hasSessionId && (u.tokensListed > 0 || u.tokensFueled > 0)
    );
    if (usersWithTokensButNoSession.length > 0) {
      usersWithTokensButNoSession.forEach(user => {
        console.log(`   👤 ${user.username} (${user.userId}) - tokensListed: ${user.tokensListed}, tokensFueled: ${user.tokensFueled}`);
      });
    } else {
      console.log('   ✅ No users with tokens but no sessionId');
    }
    
    // 7. Analyze token attribution issues
    console.log(`\n🪙 TOKEN ATTRIBUTION ANALYSIS:`);
    try {
      const tokens = await db.readJsonFile(path.join(db.cacheDir, 'tokens-cache.json'), []);
      const tokensWithoutAttribution = tokens.filter(t => !t.listedBy || t.listedBy === 'unknown');
      const tokensWithAttribution = tokens.filter(t => t.listedBy && t.listedBy !== 'unknown');
      
      console.log(`   📊 Total tokens: ${tokens.length}`);
      console.log(`   ✅ Tokens with attribution: ${tokensWithAttribution.length}`);
      console.log(`   ❌ Tokens without attribution: ${tokensWithoutAttribution.length}`);
      
      if (tokensWithoutAttribution.length > 0) {
        console.log(`   🚨 Tokens missing attribution:`);
        tokensWithoutAttribution.slice(0, 5).forEach(token => {
          console.log(`     🪙 ${token.symbol} (${token.name}) - listedBy: ${token.listedBy || 'none'}`);
        });
        if (tokensWithoutAttribution.length > 5) {
          console.log(`     ... and ${tokensWithoutAttribution.length - 5} more`);
        }
      }
      
    } catch (error) {
      console.log('   ❌ Cannot analyze token attribution:', error.message);
    }
    
    // 8. Recommendations
    console.log(`\n💡 RECOMMENDATIONS:`);
    
    if (usersWithoutSessionId > 0) {
      console.log(`   🔧 ${usersWithoutSessionId} users need sessionId generation`);
    }
    
    if (corruptedActivities > 0) {
      console.log(`   🔧 ${corruptedActivities} users need activity file repair`);
    }
    
    if (tokensWithoutAttribution && tokensWithoutAttribution.length > 0) {
      console.log(`   🔧 ${tokensWithoutAttribution.length} tokens need attribution fixes`);
    }
    
    if (usersWithoutSessionId === 0 && corruptedActivities === 0 && tokensWithoutAttribution === 0) {
      console.log(`   ✅ All users and tokens are healthy!`);
    }
    
    // 9. Systemic issue assessment
    console.log(`\n🎯 SYSTEMIC ISSUE ASSESSMENT:`);
    
    const issuePercentage = ((usersWithoutSessionId + corruptedActivities) / allUsers.length) * 100;
    
    if (issuePercentage > 50) {
      console.log(`   🚨 CRITICAL: ${issuePercentage.toFixed(1)}% of users affected - This is a systemic issue`);
      console.log(`   🔧 Action: Run comprehensive fix for all affected users`);
    } else if (issuePercentage > 20) {
      console.log(`   ⚠️ MODERATE: ${issuePercentage.toFixed(1)}% of users affected - Some users have issues`);
      console.log(`   🔧 Action: Fix affected users individually`);
    } else if (issuePercentage > 0) {
      console.log(`   ✅ MINOR: ${issuePercentage.toFixed(1)}% of users affected - Isolated issues`);
      console.log(`   🔧 Action: Fix specific users as needed`);
    } else {
      console.log(`   ✅ HEALTHY: No systemic issues detected`);
    }
    
    // 10. Future prevention
    console.log(`\n🛡️ FUTURE PREVENTION:`);
    console.log(`   ✅ Ensure all new users get sessionId on registration`);
    console.log(`   ✅ Add validation for activity file structure`);
    console.log(`   ✅ Add token attribution validation`);
    console.log(`   ✅ Add monitoring for corrupted files`);
    
  } catch (error) {
    console.error('❌ User analysis failed:', error);
  }
}

// Run the analysis
analyzeAllUsersSessionIssues().then(() => {
  console.log('\n✅ User analysis completed!');
  process.exit(0);
}).catch(error => {
  console.error('❌ User analysis failed:', error);
  process.exit(1);
});
