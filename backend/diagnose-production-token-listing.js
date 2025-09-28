#!/usr/bin/env node

import HybridDatabaseService from './hybridDatabaseService.js';
import path from 'path';

const db = new HybridDatabaseService();

async function diagnoseProductionTokenListingTracking() {
  try {
    console.log('🔍 PRODUCTION TOKEN LISTING TRACKING DIAGNOSIS');
    console.log('=' .repeat(60));
    console.log(`🌐 Environment: PRODUCTION`);
    console.log(`📂 Data Directory: ${process.env.DATA_DIR || '/var/data/dgo'}`);
    
    // Check GracieQuant's current stats
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
        console.log('   ❌ tokensListed: 0 (NOT WORKING)');
      }
      
    } catch (error) {
      console.log('   ❌ Cannot read profile:', error.message);
    }
    
    // Check if RFC token exists in cache
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
      } else {
        console.log('   ❌ RFC token NOT found in cache');
      }
      
    } catch (error) {
      console.log('   ❌ Cannot read tokens cache:', error.message);
    }
    
    // Check recent API logs (if available)
    console.log('\n📝 RECENT ACTIVITY CHECK:');
    console.log('   Look for these log patterns in production:');
    console.log('   - "[🛡️ Enhanced Backend] 📝 Token listing request received"');
    console.log('   - "[🛡️ Enhanced Backend] 📝 Token listing request from user: GracieQuant"');
    console.log('   - "[updateUserStats] Starting update for user 1868019393512325120"');
    console.log('   - "[updateUserStats] Successfully updated tokensListed"');
    
    // Check if the issue is frontend or backend
    console.log('\n🔍 ISSUE ANALYSIS:');
    console.log('   If RFC token exists in cache but tokensListed = 0:');
    console.log('   → Frontend recordTokenListing() was NOT called');
    console.log('   → OR API call failed silently');
    console.log('   → OR sessionId was invalid');
    
    console.log('\n   If RFC token does NOT exist in cache:');
    console.log('   → Token processing failed');
    console.log('   → Payment was not completed');
    console.log('   → Different issue entirely');
    
    // Test the API endpoint
    console.log('\n🧪 API ENDPOINT TEST:');
    console.log('   To test the API endpoint in production:');
    console.log('   curl -X POST https://api.degen-oracle.com/api/user/tokens/list \\');
    console.log('     -H "Content-Type: application/json" \\');
    console.log('     -d \'{"sessionId":"test","contractAddress":"test","symbol":"TEST","name":"Test Token"}\'');
    
    // Check for common issues
    console.log('\n🚨 COMMON ISSUES TO CHECK:');
    console.log('   1. Frontend: Check browser console for errors');
    console.log('   2. Frontend: Verify sessionId is valid');
    console.log('   3. Frontend: Check if recordTokenListing() is called');
    console.log('   4. Backend: Check if API endpoint is accessible');
    console.log('   5. Backend: Check if updateUserStats() is working');
    console.log('   6. Backend: Check file permissions on profile.json');
    
    // Recommendations
    console.log('\n💡 RECOMMENDATIONS:');
    console.log('   1. Check production logs for API calls');
    console.log('   2. Test API endpoint manually');
    console.log('   3. Verify frontend is calling recordTokenListing()');
    console.log('   4. Check if sessionId is valid in production');
    console.log('   5. Manually fix GracieQuant\'s stats if needed');
    
  } catch (error) {
    console.error('❌ Production diagnostic failed:', error);
  }
}

// Run the diagnostic
diagnoseProductionTokenListingTracking().then(() => {
  console.log('\n✅ Production diagnostic completed!');
  process.exit(0);
}).catch(error => {
  console.error('❌ Production diagnostic failed:', error);
  process.exit(1);
});
