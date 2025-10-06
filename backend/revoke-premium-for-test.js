#!/usr/bin/env node

/**
 * Script to revoke Premium access while preserving history
 * Usage: node revoke-premium-for-test.js <username>
 * 
 * This script:
 * - Revokes Premium access (sets isPremium: false)
 * - Preserves ALL history (calls, referrals, earnings, etc.)
 * - Keeps the premium.json file with history for reference
 */

import HybridDatabaseService from './hybridDatabaseService.js';

async function revokePremiumForTest(username) {
  try {
    console.log(`🔍 Looking for user: ${username}`);
    
    const db = new HybridDatabaseService();
    
    // Get all users to find the user by username
    const users = await db.getAllUsers();
    const user = users.find(u => u.username === username);
    
    if (!user) {
      console.log(`❌ User '${username}' not found`);
      console.log('Available users:', users.map(u => u.username).slice(0, 10));
      return;
    }
    
    console.log(`✅ Found user: ${user.username} (ID: ${user.id})`);
    
    // Get current premium status
    const currentPremium = await db.getPremiumStatus(user.id);
    console.log(`📊 Current premium status:`, JSON.stringify(currentPremium, null, 2));
    
    if (!currentPremium.isPremium) {
      console.log(`⚠️ User '${username}' is already not Premium`);
      return;
    }
    
    // Revoke Premium but preserve history
    const revokedStatus = {
      ...currentPremium, // Keep all existing data
      isPremium: false,
      subscriptionType: currentPremium.subscriptionType, // Keep original type for history
      expiresAt: currentPremium.expiresAt, // Keep original expiry for history
      revokedAt: new Date().toISOString(),
      revokedReason: 'Testing NFT-gated access',
      previousStatus: {
        isPremium: currentPremium.isPremium,
        subscriptionType: currentPremium.subscriptionType,
        expiresAt: currentPremium.expiresAt,
        lastActivatedAt: currentPremium.lastActivatedAt
      }
    };
    
    await db.setPremiumStatus(user.id, revokedStatus);
    
    console.log(`✅ Successfully revoked Premium for '${username}'`);
    console.log(`📊 New premium status:`, JSON.stringify(await db.getPremiumStatus(user.id), null, 2));
    console.log(`\n📝 Note: All history preserved (calls, referrals, earnings remain intact)`);
    console.log(`🧪 User can now test NFT-gated access`);
    
  } catch (error) {
    console.error('❌ Error revoking Premium:', error.message);
    console.error(error.stack);
  }
}

// Get username from command line arguments
const username = process.argv[2];

if (!username) {
  console.log('Usage: node revoke-premium-for-test.js <username>');
  console.log('Example: node revoke-premium-for-test.js graciequant');
  process.exit(1);
}

revokePremiumForTest(username).then(() => {
  console.log('🏁 Script completed');
  process.exit(0);
}).catch(error => {
  console.error('💥 Script failed:', error);
  process.exit(1);
});
