#!/usr/bin/env node

import HybridDatabaseService from './hybridDatabaseService.js';
import path from 'path';

const db = new HybridDatabaseService();

async function fixGracieQuantTokenListing() {
  try {
    console.log('🔧 FIXING GRACIEQUANT TOKEN LISTING');
    console.log('=' .repeat(50));
    
    const userId = '1868019393512325120'; // GracieQuant
    const contractAddress = 'C3DwDjT17gDvvCYC2nsdGHxDHVmQRdhKfpAdqQ29pump'; // RFC
    const tokenSymbol = 'RFC';
    const tokenName = 'Retard Finder Coin';
    
    // 1. Update user stats
    console.log('\n📊 UPDATING USER STATS:');
    const profileFile = db.getUserFile(userId, 'profile.json');
    
    try {
      const profile = await db.readJsonFile(profileFile, {});
      console.log('   Current stats:', profile.stats);
      
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
      
      console.log(`   ✅ Updated tokensListed: ${currentTokensListed} → ${profile.stats.tokensListed}`);
      
      // Update lastUpdated timestamp
      profile.lastUpdated = new Date().toISOString();
      
      // Save the profile
      await db.writeJsonFile(profileFile, profile);
      console.log('   ✅ Profile saved successfully');
      
      // Verify the save
      const verifyProfile = await db.readJsonFile(profileFile, {});
      console.log('   ✅ Verification - tokensListed:', verifyProfile.stats.tokensListed);
      
    } catch (error) {
      console.log('   ❌ Failed to update profile:', error.message);
      return;
    }
    
    // 2. Add token listing activity
    console.log('\n📝 ADDING TOKEN LISTING ACTIVITY:');
    const activityFile = db.getUserFile(userId, 'activity.json');
    
    try {
      const activity = await db.readJsonFile(activityFile, []);
      
      // Create new activity entry
      const newActivity = {
        id: `token_listed_${Date.now()}`,
        type: 'token_listed',
        timestamp: new Date().toISOString(),
        description: `Listed token ${tokenSymbol} (${tokenName})`,
        details: {
          contractAddress: contractAddress,
          symbol: tokenSymbol,
          name: tokenName,
          source: 'manual_fix',
          stage: 'paid'
        },
        metadata: {
          fixed: true,
          fixedAt: new Date().toISOString(),
          reason: 'Frontend token listing tracking was not working'
        }
      };
      
      activity.push(newActivity);
      
      // Save the activity
      await db.writeJsonFile(activityFile, activity);
      console.log('   ✅ Activity added successfully');
      console.log(`   📝 Activity ID: ${newActivity.id}`);
      console.log(`   📝 Description: ${newActivity.description}`);
      
    } catch (error) {
      console.log('   ❌ Failed to add activity:', error.message);
    }
    
    // 3. Update token attribution
    console.log('\n🪙 UPDATING TOKEN ATTRIBUTION:');
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
    
    // 4. Final verification
    console.log('\n✅ FINAL VERIFICATION:');
    try {
      const finalProfile = await db.readJsonFile(profileFile, {});
      console.log(`   📊 Final tokensListed: ${finalProfile.stats.tokensListed}`);
      console.log(`   📊 Final tokensFueled: ${finalProfile.stats.tokensFueled}`);
      
      const finalActivity = await db.readJsonFile(activityFile, []);
      const tokenActivities = finalActivity.filter(act => act.type === 'token_listed');
      console.log(`   📝 Total token listing activities: ${tokenActivities.length}`);
      
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
    
    console.log('\n🎉 GRACIEQUANT TOKEN LISTING FIX COMPLETED!');
    console.log('   The user stats have been updated and the token attribution fixed.');
    console.log('   This should resolve the dashboard display issue.');
    
  } catch (error) {
    console.error('❌ Fix failed:', error);
  }
}

// Run the fix
fixGracieQuantTokenListing().then(() => {
  console.log('\n✅ Fix completed successfully!');
  process.exit(0);
}).catch(error => {
  console.error('❌ Fix failed:', error);
  process.exit(1);
});
