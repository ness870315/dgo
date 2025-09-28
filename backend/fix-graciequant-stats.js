#!/usr/bin/env node

import HybridDatabaseService from './hybridDatabaseService.js';
import path from 'path';

const db = new HybridDatabaseService();

async function fixGracieQuantStats() {
  try {
    console.log('🔧 Fixing GracieQuant stats...');
    
    const userId = '1868019393512325120';
    const profileFile = db.getUserFile(userId, 'profile.json');
    
    console.log('📁 Profile file path:', profileFile);
    
    // Read current profile
    const profile = await db.readJsonFile(profileFile, {});
    console.log('📊 Current profile stats:', profile.stats);
    
    // Update stats - assuming they listed 1 token
    if (!profile.stats) {
      profile.stats = {
        tokensListed: 0,
        tokensFueled: 0,
        tokensUpdated: 0,
        totalSpent: 0
      };
    }
    
    // Increment tokensListed by 1
    profile.stats.tokensListed = (profile.stats.tokensListed || 0) + 1;
    
    // Update lastUpdated timestamp
    profile.lastUpdated = new Date().toISOString();
    
    console.log('💾 Saving profile with stats:', profile.stats);
    
    // Save updated profile
    await db.writeJsonFile(profileFile, profile);
    
    console.log('✅ Updated GracieQuant stats:', profile.stats);
    console.log('📝 Tokens Listed:', profile.stats.tokensListed);
    console.log('🔥 Tokens Fueled:', profile.stats.tokensFueled);
    
    // Verify the save worked
    const verifyProfile = await db.readJsonFile(profileFile, {});
    console.log('🔍 Verification - saved stats:', verifyProfile.stats);
    
  } catch (error) {
    console.error('❌ Error fixing GracieQuant stats:', error);
  }
}

// Run the fix
fixGracieQuantStats().then(() => {
  console.log('🎉 GracieQuant stats fix completed!');
  process.exit(0);
}).catch(error => {
  console.error('💥 Fix failed:', error);
  process.exit(1);
});
