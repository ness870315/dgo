#!/usr/bin/env node

/**
 * Test script to verify GracieQuant's Premium status
 */

import HybridDatabaseService from './hybridDatabaseService.js';

async function testGraciePremium() {
  try {
    const db = new HybridDatabaseService();
    const userId = '1868019393512325120'; // GracieQuant
    
    console.log('🔍 Testing GracieQuant Premium Status\n');
    
    // Get premium status
    const premiumStatus = await db.getPremiumStatus(userId);
    console.log('📊 Premium Status from Database:');
    console.log(JSON.stringify(premiumStatus, null, 2));
    
    // Check if premium is active
    const isPremium = premiumStatus?.isPremium && 
      (!premiumStatus.expiresAt || new Date(premiumStatus.expiresAt) > new Date());
    
    console.log('\n✅ Computed isPremium:', isPremium);
    console.log('📅 Expiry Date:', premiumStatus?.expiresAt || 'None');
    
    if (premiumStatus?.expiresAt) {
      const expiryDate = new Date(premiumStatus.expiresAt);
      const now = new Date();
      console.log('⏰ Is Expired:', expiryDate <= now);
      console.log('🕐 Time until expiry:', expiryDate > now ? `${Math.round((expiryDate - now) / (1000 * 60 * 60 * 24))} days` : 'Already expired');
    }
    
    console.log('\n🎯 Expected Result: isPremium should be FALSE');
    console.log('🎯 Actual Result: isPremium is', isPremium ? 'TRUE ❌' : 'FALSE ✅');
    
    if (!isPremium) {
      console.log('\n✅ SUCCESS: GracieQuant is correctly set as FREE user');
      console.log('🧪 Ready for NFT-gated access testing');
    } else {
      console.log('\n❌ ERROR: GracieQuant still shows as Premium!');
      console.log('💡 This might be a frontend cache issue');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  }
}

testGraciePremium().then(() => {
  console.log('\n🏁 Test completed');
  process.exit(0);
}).catch(error => {
  console.error('💥 Test failed:', error);
  process.exit(1);
});
