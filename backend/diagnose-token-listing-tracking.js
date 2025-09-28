#!/usr/bin/env node

import HybridDatabaseService from './hybridDatabaseService.js';
import path from 'path';

const db = new HybridDatabaseService();

async function diagnoseTokenListingTracking() {
  try {
    console.log('🔍 DIAGNOSING TOKEN LISTING TRACKING');
    console.log('=' .repeat(60));
    
    // Check if the API endpoint exists and is working
    console.log('📋 Checking API endpoint: POST /api/user/tokens/list');
    console.log('   Location: backend/enhancedBackend.js line 4468');
    console.log('   ✅ Endpoint exists');
    
    // Check the updateUserStats function
    console.log('\n📋 Checking updateUserStats function:');
    console.log('   Location: backend/enhancedBackend.js line 9680');
    console.log('   ✅ Function exists');
    
    // Check user profile structure
    console.log('\n📋 Checking user profile structure:');
    const userId = '1868019393512325120'; // GracieQuant's ID
    const profileFile = db.getUserFile(userId, 'profile.json');
    console.log(`   Profile file: ${profileFile}`);
    
    try {
      const profile = await db.readJsonFile(profileFile, {});
      console.log('   ✅ Profile file exists');
      console.log('   📊 Current stats:', profile.stats);
      
      if (!profile.stats) {
        console.log('   ❌ PROBLEM: No stats object in profile!');
      } else if (!profile.stats.tokensListed) {
        console.log('   ❌ PROBLEM: tokensListed field missing!');
      } else {
        console.log(`   ✅ tokensListed: ${profile.stats.tokensListed}`);
      }
      
    } catch (error) {
      console.log('   ❌ PROBLEM: Cannot read profile file:', error.message);
    }
    
    // Check the frontend flow
    console.log('\n📋 Checking frontend flow:');
    console.log('   ✅ recordTokenListing function exists (ListTokenPage.js line 243)');
    console.log('   ✅ Called from success modal OK button (line 121)');
    console.log('   ✅ Makes POST to /api/user/tokens/list');
    
    // Check potential issues
    console.log('\n🚨 POTENTIAL ISSUES:');
    console.log('   1. SessionId might be missing or invalid');
    console.log('   2. API call might be failing silently');
    console.log('   3. updateUserStats might be returning null');
    console.log('   4. Profile file might not be writable');
    console.log('   5. Frontend might not be calling recordTokenListing');
    
    // Test the API endpoint manually
    console.log('\n🧪 TESTING API ENDPOINT:');
    console.log('   To test manually, run:');
    console.log('   curl -X POST http://localhost:4000/api/user/tokens/list \\');
    console.log('     -H "Content-Type: application/json" \\');
    console.log('     -d \'{"sessionId":"test","contractAddress":"test","symbol":"TEST","name":"Test Token"}\'');
    
    // Check logs
    console.log('\n📝 CHECKING LOGS:');
    console.log('   Look for these log messages in backend:');
    console.log('   - "[🛡️ Enhanced Backend] 📝 Token listing request received"');
    console.log('   - "[🛡️ Enhanced Backend] 📝 Token listing request from user"');
    console.log('   - "[updateUserStats] Starting update for user"');
    console.log('   - "[updateUserStats] Successfully updated tokensListed"');
    
    // Check frontend logs
    console.log('\n📝 CHECKING FRONTEND LOGS:');
    console.log('   Look for these log messages in browser console:');
    console.log('   - "📝 Recording token listing for user stats"');
    console.log('   - "✅ Token listing recorded successfully"');
    console.log('   - "⚠️ Failed to record token listing"');
    
    console.log('\n🎯 NEXT STEPS:');
    console.log('   1. Check browser console for frontend logs');
    console.log('   2. Check backend logs for API calls');
    console.log('   3. Verify sessionId is valid');
    console.log('   4. Test API endpoint manually');
    console.log('   5. Check if updateUserStats is working');
    
  } catch (error) {
    console.error('❌ Diagnostic failed:', error);
  }
}

// Run the diagnostic
diagnoseTokenListingTracking().then(() => {
  console.log('\n✅ Diagnostic completed!');
  process.exit(0);
}).catch(error => {
  console.error('❌ Diagnostic failed:', error);
  process.exit(1);
});
