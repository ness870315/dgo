#!/usr/bin/env node

import HybridDatabaseService from './hybridDatabaseService.js';
import path from 'path';

const db = new HybridDatabaseService();

async function troubleshootProductionTokenListing() {
  try {
    console.log('🔍 PRODUCTION TOKEN LISTING TROUBLESHOOTING');
    console.log('=' .repeat(60));
    console.log(`🌐 Environment: PRODUCTION`);
    console.log(`📂 Data Directory: ${process.env.DATA_DIR || '/var/data/dgo'}`);
    
    // 1. Check GracieQuant's current stats
    console.log('\n👤 GRACIEQUANT USER ANALYSIS:');
    const userId = '1868019393512325120';
    const profileFile = db.getUserFile(userId, 'profile.json');
    console.log(`   Profile file: ${profileFile}`);
    
    try {
      const profile = await db.readJsonFile(profileFile, {});
      console.log('   ✅ Profile file exists');
      console.log('   📊 Current stats:', profile.stats);
      console.log(`   📝 Username: ${profile.username}`);
      console.log(`   📅 Last Updated: ${profile.lastUpdated}`);
      
      if (profile.stats && profile.stats.tokensListed > 0) {
        console.log(`   ✅ tokensListed: ${profile.stats.tokensListed} (WORKING)`);
      } else {
        console.log('   ❌ tokensListed: 0 (STILL NOT WORKING)');
      }
      
    } catch (error) {
      console.log('   ❌ Cannot read profile:', error.message);
    }
    
    // 2. Check if RFC token exists in cache
    console.log('\n🪙 RFC TOKEN ANALYSIS:');
    const contractAddress = 'C3DwDjT17gDvvCYC2nsdGHxDHVmQRdhKfpAdqQ29pump';
    console.log(`   Contract: ${contractAddress}`);
    
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
      } else {
        console.log('   ❌ RFC token NOT found in cache');
      }
      
    } catch (error) {
      console.log('   ❌ Cannot read tokens cache:', error.message);
    }
    
    // 3. Check recent user activity logs
    console.log('\n📝 RECENT USER ACTIVITY:');
    try {
      const activityFile = db.getUserFile(userId, 'activity.json');
      const activity = await db.readJsonFile(activityFile, []);
      
      console.log(`   Activity file: ${activityFile}`);
      console.log(`   Total activities: ${activity.length}`);
      
      // Show last 5 activities
      const recentActivities = activity.slice(-5);
      console.log('   Recent activities:');
      recentActivities.forEach((act, index) => {
        console.log(`     ${index + 1}. ${act.type || 'unknown'} - ${act.timestamp || 'no timestamp'}`);
      });
      
    } catch (error) {
      console.log('   ❌ Cannot read activity file:', error.message);
    }
    
    // 4. Check if there are any recent API calls in logs
    console.log('\n🔍 CHECKING FOR API CALL LOGS:');
    console.log('   Look for these patterns in production logs:');
    console.log('   - "[🛡️ Enhanced Backend] 📝 Token listing request received"');
    console.log('   - "[🛡️ Enhanced Backend] 📝 Token listing request from user: GracieQuant"');
    console.log('   - "[updateUserStats] Starting update for user 1868019393512325120"');
    console.log('   - "[updateUserStats] Successfully updated tokensListed"');
    console.log('   - "📝 Recording token listing for user stats"');
    console.log('   - "✅ Token listing recorded successfully"');
    
    // 5. Test the API endpoint with a real session
    console.log('\n🧪 API ENDPOINT TESTING:');
    console.log('   To test with a real session, you need:');
    console.log('   1. A valid sessionId from GracieQuant');
    console.log('   2. Test the API endpoint manually');
    console.log('   3. Check if the session is still valid');
    
    // 6. Check frontend issues
    console.log('\n🌐 FRONTEND ISSUES TO CHECK:');
    console.log('   1. Browser console errors during payment success');
    console.log('   2. Network tab - check if API call is made');
    console.log('   3. Check if sessionId is valid in browser');
    console.log('   4. Check if recordTokenListing function is called');
    console.log('   5. Check if success modal is shown');
    
    // 7. Check backend issues
    console.log('\n🖥️ BACKEND ISSUES TO CHECK:');
    console.log('   1. Check if API endpoint is accessible');
    console.log('   2. Check if updateUserStats function works');
    console.log('   3. Check file permissions on profile.json');
    console.log('   4. Check if session validation works');
    console.log('   5. Check if there are any errors in logs');
    
    // 8. Potential fixes
    console.log('\n💡 POTENTIAL FIXES:');
    console.log('   1. Check if the frontend fix was deployed');
    console.log('   2. Check if there are caching issues');
    console.log('   3. Check if the session expired');
    console.log('   4. Check if there are JavaScript errors');
    console.log('   5. Check if the API call is being made');
    
    // 9. Manual verification steps
    console.log('\n🔧 MANUAL VERIFICATION STEPS:');
    console.log('   1. Open browser dev tools');
    console.log('   2. Go to Network tab');
    console.log('   3. Complete a token listing');
    console.log('   4. Check if POST to /api/user/tokens/list is made');
    console.log('   5. Check the response status and body');
    console.log('   6. Check browser console for errors');
    
    // 10. Check if the fix was actually deployed
    console.log('\n🚀 DEPLOYMENT CHECK:');
    console.log('   1. Check if the App.js fix was deployed to production');
    console.log('   2. Check if the frontend was rebuilt');
    console.log('   3. Check if there are any build errors');
    console.log('   4. Check if the changes are in the production code');
    
  } catch (error) {
    console.error('❌ Production troubleshooting failed:', error);
  }
}

// Run the troubleshooting
troubleshootProductionTokenListing().then(() => {
  console.log('\n✅ Production troubleshooting completed!');
  process.exit(0);
}).catch(error => {
  console.error('❌ Production troubleshooting failed:', error);
  process.exit(1);
});
