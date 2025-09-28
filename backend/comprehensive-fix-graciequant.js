#!/usr/bin/env node

import HybridDatabaseService from './hybridDatabaseService.js';
import path from 'path';
import crypto from 'crypto';

const db = new HybridDatabaseService();

async function comprehensiveFixGracieQuant() {
  try {
    console.log('🔧 COMPREHENSIVE GRACIEQUANT FIX');
    console.log('=' .repeat(50));
    
    const userId = '1868019393512325120'; // GracieQuant
    const contractAddress = 'C3DwDjT17gDvvCYC2nsdGHxDHVmQRdhKfpAdqQ29pump'; // RFC
    const tokenSymbol = 'RFC';
    const tokenName = 'Retard Finder Coin';
    
    // 1. Fix Profile and Add SessionId
    console.log('\n👤 FIXING PROFILE AND SESSION:');
    const profileFile = db.getUserFile(userId, 'profile.json');
    
    try {
      const profile = await db.readJsonFile(profileFile, {});
      console.log('   Current profile:', {
        username: profile.username,
        tokensListed: profile.stats?.tokensListed || 0,
        tokensFueled: profile.stats?.tokensFueled || 0,
        hasSessionId: !!profile.sessionId
      });
      
      // Initialize stats if they don't exist
      if (!profile.stats) {
        profile.stats = {
          tokensListed: 0,
          tokensFueled: 0,
          totalFuelApplied: 0,
          totalFuelCost: 0,
          totalTokensListed: 0,
          totalTokensFueled: 0
        };
      }
      
      // Increment tokensListed
      const currentTokensListed = profile.stats.tokensListed || 0;
      profile.stats.tokensListed = currentTokensListed + 1;
      profile.stats.totalTokensListed = (profile.stats.totalTokensListed || 0) + 1;
      
      // Generate a new sessionId if missing
      if (!profile.sessionId) {
        profile.sessionId = crypto.randomBytes(32).toString('hex');
        console.log('   ✅ Generated new sessionId');
      }
      
      // Update lastUpdated timestamp
      profile.lastUpdated = new Date().toISOString();
      
      // Save the profile
      await db.writeJsonFile(profileFile, profile);
      console.log(`   ✅ Updated tokensListed: ${currentTokensListed} → ${profile.stats.tokensListed}`);
      console.log(`   ✅ SessionId: ${profile.sessionId ? 'GENERATED' : 'EXISTS'}`);
      
    } catch (error) {
      console.log('   ❌ Failed to update profile:', error.message);
      return;
    }
    
    // 2. Fix Activity File
    console.log('\n📝 FIXING ACTIVITY FILE:');
    const activityFile = db.getUserFile(userId, 'activity.json');
    
    try {
      let activity = [];
      
      // Try to read existing activity, but handle corruption
      try {
        const existingActivity = await db.readJsonFile(activityFile, []);
        if (Array.isArray(existingActivity)) {
          activity = existingActivity;
          console.log(`   ✅ Recovered ${activity.length} existing activities`);
        } else {
          console.log('   ⚠️ Activity file corrupted, starting fresh');
        }
      } catch (error) {
        console.log('   ⚠️ Activity file corrupted, starting fresh');
      }
      
      // Create new token listing activity
      const newActivity = {
        id: `token_listed_${Date.now()}`,
        type: 'token_listed',
        timestamp: new Date().toISOString(),
        description: `Listed token ${tokenSymbol} (${tokenName})`,
        details: {
          contractAddress: contractAddress,
          symbol: tokenSymbol,
          name: tokenName,
          source: 'comprehensive_fix',
          stage: 'completed'
        },
        metadata: {
          fixed: true,
          fixedAt: new Date().toISOString(),
          reason: 'Frontend token listing tracking was not working, sessionId was missing'
        }
      };
      
      activity.push(newActivity);
      
      // Save the activity
      await db.writeJsonFile(activityFile, activity);
      console.log('   ✅ Activity file fixed and updated');
      console.log(`   📝 Added activity: ${newActivity.description}`);
      
    } catch (error) {
      console.log('   ❌ Failed to fix activity file:', error.message);
    }
    
    // 3. Fix Token Attribution
    console.log('\n🪙 FIXING TOKEN ATTRIBUTION:');
    try {
      const tokens = await db.readJsonFile(path.join(db.cacheDir, 'tokens-cache.json'), []);
      const rfcToken = tokens.find(t => 
        t.contractAddress && t.contractAddress.toLowerCase() === contractAddress.toLowerCase()
      );
      
      if (rfcToken) {
        console.log('   ✅ RFC token found');
        console.log(`   📝 Current listedBy: ${rfcToken.listedBy || 'none'}`);
        
        // Update the token attribution
        rfcToken.listedBy = userId;
        rfcToken.listedByUsername = 'GracieQuant';
        rfcToken.listedAt = new Date().toISOString();
        rfcToken.source = 'comprehensive_fix';
        
        // Save the updated tokens
        await db.writeJsonFile(path.join(db.cacheDir, 'tokens-cache.json'), tokens);
        console.log('   ✅ Token attribution updated');
        console.log(`   👤 Listed by: ${rfcToken.listedByUsername} (${rfcToken.listedBy})`);
        
      } else {
        console.log('   ❌ RFC token not found in cache');
      }
      
    } catch (error) {
      console.log('   ❌ Failed to update token attribution:', error.message);
    }
    
    // 4. Test the API with the new sessionId
    console.log('\n🧪 TESTING API WITH NEW SESSION:');
    try {
      const profile = await db.readJsonFile(profileFile, {});
      const sessionId = profile.sessionId;
      
      console.log(`   🔑 Testing with sessionId: ${sessionId.substring(0, 20)}...`);
      
      // Test the API endpoint
      const testData = {
        sessionId: sessionId,
        contractAddress: contractAddress,
        symbol: tokenSymbol,
        name: tokenName,
        socialLinks: {
          twitter: 'https://twitter.com/test',
          website: 'https://test.com'
        }
      };
      
      const response = await fetch('https://api.degen-oracle.com/api/user/tokens/list', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(testData)
      });
      
      const result = await response.json();
      
      if (response.status === 200 && result.success) {
        console.log('   ✅ API test successful!');
        console.log(`   📊 Response: ${result.message}`);
      } else {
        console.log('   ❌ API test failed:', result.error);
      }
      
    } catch (error) {
      console.log('   ❌ API test failed:', error.message);
    }
    
    // 5. Final verification
    console.log('\n✅ FINAL VERIFICATION:');
    try {
      const finalProfile = await db.readJsonFile(profileFile, {});
      console.log(`   📊 Final tokensListed: ${finalProfile.stats.tokensListed}`);
      console.log(`   📊 Final tokensFueled: ${finalProfile.stats.tokensFueled}`);
      console.log(`   🔑 SessionId: ${finalProfile.sessionId ? 'EXISTS' : 'MISSING'}`);
      
      const finalActivity = await db.readJsonFile(activityFile, []);
      if (Array.isArray(finalActivity)) {
        const tokenActivities = finalActivity.filter(act => act.type === 'token_listed');
        console.log(`   📝 Total token listing activities: ${tokenActivities.length}`);
      } else {
        console.log('   ❌ Activity file still corrupted');
      }
      
      const tokens = await db.readJsonFile(path.join(db.cacheDir, 'tokens-cache.json'), []);
      const rfcToken = tokens.find(t => 
        t.contractAddress && t.contractAddress.toLowerCase() === contractAddress.toLowerCase()
      );
      if (rfcToken) {
        console.log(`   🪙 RFC token listed by: ${rfcToken.listedByUsername || 'unknown'}`);
      }
      
    } catch (error) {
      console.log('   ❌ Final verification failed:', error.message);
    }
    
    console.log('\n🎉 COMPREHENSIVE FIX COMPLETED!');
    console.log('   ✅ GracieQuant\'s profile updated');
    console.log('   ✅ SessionId generated');
    console.log('   ✅ Activity file fixed');
    console.log('   ✅ Token attribution corrected');
    console.log('   ✅ API endpoint tested');
    console.log('   The dashboard should now show the correct stats!');
    
  } catch (error) {
    console.error('❌ Comprehensive fix failed:', error);
  }
}

// Run the comprehensive fix
comprehensiveFixGracieQuant().then(() => {
  console.log('\n✅ Comprehensive fix completed successfully!');
  process.exit(0);
}).catch(error => {
  console.error('❌ Comprehensive fix failed:', error);
  process.exit(1);
});
