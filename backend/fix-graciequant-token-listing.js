#!/usr/bin/env node

import HybridDatabaseService from './hybridDatabaseService.js';
import path from 'path';

const db = new HybridDatabaseService();

async function fixGracieQuantTokenListing() {
  try {
    console.log('🔧 Fixing GracieQuant token listing stats...');
    
    // GracieQuant's user ID
    const userId = '1868019393512325120';
    const contractAddress = 'C3DwDjT17gDvvCYC2nsdGHxDHVmQRdhKfpAdqQ29pump';
    
    console.log(`👤 User ID: ${userId}`);
    console.log(`🪙 Contract: ${contractAddress}`);
    
    // Get user profile file path
    const profileFile = db.getUserFile(userId, 'profile.json');
    console.log(`📁 Profile file: ${profileFile}`);
    
    // Read current profile
    const profile = await db.readJsonFile(profileFile, {});
    console.log('📊 Current profile stats:', profile.stats);
    
    // Initialize stats if they don't exist
    if (!profile.stats) {
      profile.stats = {
        tokensListed: 0,
        tokensFueled: 0,
        tokensUpdated: 0,
        totalSpent: 0
      };
      console.log('🆕 Initialized new stats object');
    }
    
    // Store old value
    const oldTokensListed = profile.stats.tokensListed || 0;
    
    // Increment tokensListed by 1
    profile.stats.tokensListed = oldTokensListed + 1;
    
    // Update lastUpdated timestamp
    profile.lastUpdated = new Date().toISOString();
    
    console.log(`🔄 Updating tokensListed: ${oldTokensListed} → ${profile.stats.tokensListed}`);
    
    // Save updated profile
    await db.writeJsonFile(profileFile, profile);
    console.log('✅ Profile saved successfully');
    
    // Verify the save worked
    const verifyProfile = await db.readJsonFile(profileFile, {});
    const verifyTokensListed = verifyProfile.stats?.tokensListed || 0;
    
    console.log('🔍 Verification:');
    console.log(`   Expected: ${profile.stats.tokensListed}`);
    console.log(`   Actual: ${verifyTokensListed}`);
    
    if (verifyTokensListed === profile.stats.tokensListed) {
      console.log('✅ Verification successful!');
    } else {
      console.log('❌ Verification failed!');
    }
    
    console.log('\n📊 Final Stats:');
    console.log(`   Tokens Listed: ${verifyTokensListed}`);
    console.log(`   Tokens Fueled: ${verifyProfile.stats?.tokensFueled || 0}`);
    console.log(`   Tokens Updated: ${verifyProfile.stats?.tokensUpdated || 0}`);
    console.log(`   Total Spent: ${verifyProfile.stats?.totalSpent || 0}`);
    
    console.log('\n🎉 GracieQuant token listing fix completed!');
    
  } catch (error) {
    console.error('❌ Error fixing GracieQuant token listing:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack
    });
  }
}

// Run the fix
fixGracieQuantTokenListing().then(() => {
  console.log('\n✅ Script completed successfully!');
  process.exit(0);
}).catch(error => {
  console.error('❌ Script failed:', error);
  process.exit(1);
});
