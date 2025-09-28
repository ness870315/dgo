#!/usr/bin/env node

import HybridDatabaseService from './hybridDatabaseService.js';
import path from 'path';

const db = new HybridDatabaseService();

async function debugFrontendTokenListing() {
  try {
    console.log('🔍 FRONTEND TOKEN LISTING DEBUG');
    console.log('=' .repeat(50));
    
    const userId = '1868019393512325120'; // GracieQuant
    const contractAddress = 'C3DwDjT17gDvvCYC2nsdGHxDHVmQRdhKfpAdqQ29pump'; // RFC
    
    // 1. Check GracieQuant's profile and session
    console.log('\n👤 GRACIEQUANT PROFILE ANALYSIS:');
    const profileFile = db.getUserFile(userId, 'profile.json');
    
    try {
      const profile = await db.readJsonFile(profileFile, {});
      console.log('   ✅ Profile exists');
      console.log(`   📝 Username: ${profile.username}`);
      console.log(`   📊 tokensListed: ${profile.stats?.tokensListed || 0}`);
      console.log(`   📊 tokensFueled: ${profile.stats?.tokensFueled || 0}`);
      console.log(`   🔑 SessionId: ${profile.sessionId ? 'EXISTS' : 'MISSING'}`);
      console.log(`   📅 Last Updated: ${profile.lastUpdated}`);
      
      if (profile.sessionId) {
        console.log(`   🔑 SessionId (first 20 chars): ${profile.sessionId.substring(0, 20)}...`);
      }
      
    } catch (error) {
      console.log('   ❌ Cannot read profile:', error.message);
    }
    
    // 2. Check if RFC token was actually processed
    console.log('\n🪙 RFC TOKEN PROCESSING ANALYSIS:');
    try {
      const tokens = await db.readJsonFile(path.join(db.cacheDir, 'tokens-cache.json'), []);
      const rfcToken = tokens.find(t => 
        t.contractAddress && t.contractAddress.toLowerCase() === contractAddress.toLowerCase()
      );
      
      if (rfcToken) {
        console.log('   ✅ RFC token found in cache');
        console.log(`   📝 Symbol: ${rfcToken.symbol}`);
        console.log(`   📝 Name: ${rfcToken.name}`);
        console.log(`   📅 Created: ${rfcToken.createdAt}`);
        console.log(`   🎯 Stage: ${rfcToken.stage}`);
        console.log(`   💰 Is Paid: ${rfcToken.isPaid || false}`);
        console.log(`   🔗 Source: ${rfcToken.source || 'unknown'}`);
        console.log(`   👤 Listed By: ${rfcToken.listedBy || 'unknown'}`);
        
        // Check if it has the correct user info
        if (rfcToken.listedBy === userId) {
          console.log('   ✅ Token correctly attributed to GracieQuant');
        } else {
          console.log(`   ❌ Token attributed to different user: ${rfcToken.listedBy}`);
        }
        
      } else {
        console.log('   ❌ RFC token NOT found in cache');
      }
      
    } catch (error) {
      console.log('   ❌ Cannot read tokens cache:', error.message);
    }
    
    // 3. Check user activity for token listing attempts
    console.log('\n📝 USER ACTIVITY ANALYSIS:');
    try {
      const activityFile = db.getUserFile(userId, 'activity.json');
      const activity = await db.readJsonFile(activityFile, []);
      
      console.log(`   Total activities: ${activity.length}`);
      
      // Look for token listing activities
      const tokenActivities = activity.filter(act => 
        act.type === 'token_listed' || 
        act.type === 'token_listing' ||
        act.description?.includes('token') ||
        act.description?.includes('RFC') ||
        act.description?.includes('listing')
      );
      
      console.log(`   Token-related activities: ${tokenActivities.length}`);
      
      if (tokenActivities.length > 0) {
        console.log('   Recent token activities:');
        tokenActivities.slice(-3).forEach((act, index) => {
          console.log(`     ${index + 1}. ${act.type || 'unknown'} - ${act.timestamp || 'no timestamp'}`);
          console.log(`        Description: ${act.description || 'no description'}`);
        });
      } else {
        console.log('   ❌ No token listing activities found');
      }
      
      // Show last 5 activities regardless of type
      console.log('   Last 5 activities:');
      activity.slice(-5).forEach((act, index) => {
        console.log(`     ${index + 1}. ${act.type || 'unknown'} - ${act.timestamp || 'no timestamp'}`);
      });
      
    } catch (error) {
      console.log('   ❌ Cannot read activity file:', error.message);
    }
    
    // 4. Check if there are any error logs
    console.log('\n🚨 ERROR LOG ANALYSIS:');
    console.log('   Check production logs for these patterns:');
    console.log('   - "Error recording token listing"');
    console.log('   - "Failed to record token listing"');
    console.log('   - "updateUserStats" errors');
    console.log('   - "Invalid session" errors');
    console.log('   - "Cannot read profile" errors');
    
    // 5. Frontend debugging steps
    console.log('\n🌐 FRONTEND DEBUGGING STEPS:');
    console.log('   1. Open browser dev tools');
    console.log('   2. Go to Application tab > Local Storage');
    console.log('   3. Check if "pendingTokenListing" exists');
    console.log('   4. Go to Network tab');
    console.log('   5. Complete a token listing');
    console.log('   6. Look for POST to /api/user/tokens/list');
    console.log('   7. Check the request payload');
    console.log('   8. Check the response');
    console.log('   9. Check Console tab for errors');
    
    // 6. Specific things to check
    console.log('\n🔍 SPECIFIC CHECKS:');
    console.log('   A. Is showProfessionalSuccessModal being called?');
    console.log('   B. Is recordTokenListing function passed to it?');
    console.log('   C. Is the API call being made?');
    console.log('   D. Is the sessionId valid?');
    console.log('   E. Are there any JavaScript errors?');
    console.log('   F. Is the payment success flow working?');
    
    // 7. Test with a new token listing
    console.log('\n🧪 TEST WITH NEW TOKEN LISTING:');
    console.log('   1. Have GracieQuant list a new token');
    console.log('   2. Monitor the browser dev tools');
    console.log('   3. Check if the API call is made');
    console.log('   4. Check if the response is successful');
    console.log('   5. Check if tokensListed is updated');
    
    // 8. Manual fix if needed
    console.log('\n🔧 MANUAL FIX OPTIONS:');
    console.log('   1. Increment tokensListed manually');
    console.log('   2. Add token listing activity');
    console.log('   3. Update token attribution');
    console.log('   4. Fix frontend deployment');
    
  } catch (error) {
    console.error('❌ Frontend debugging failed:', error);
  }
}

// Run the debugging
debugFrontendTokenListing().then(() => {
  console.log('\n✅ Frontend debugging completed!');
  process.exit(0);
}).catch(error => {
  console.error('❌ Frontend debugging failed:', error);
  process.exit(1);
});
