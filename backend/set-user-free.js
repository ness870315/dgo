#!/usr/bin/env node

/**
 * Script to set a user as free (non-premium)
 * Usage: node set-user-free.js <username>
 */

import HybridDatabaseService from './hybridDatabaseService.js';

async function setUserAsFree(username) {
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
    console.log(`📊 Current premium status:`, currentPremium);
    
    // Set user as free (non-premium)
    const freeStatus = {
      isPremium: false,
      subscriptionType: null,
      expiresAt: null,
      features: [],
      updatedAt: new Date().toISOString(),
      lastActivatedAt: null,
      durationDays: 0,
      reason: 'Manually set to free by admin'
    };
    
    await db.setPremiumStatus(user.id, freeStatus);
    
    console.log(`✅ Successfully set user '${username}' as free`);
    console.log(`📊 New premium status:`, await db.getPremiumStatus(user.id));
    
  } catch (error) {
    console.error('❌ Error setting user as free:', error.message);
  }
}

// Get username from command line arguments
const username = process.argv[2];

if (!username) {
  console.log('Usage: node set-user-free.js <username>');
  console.log('Example: node set-user-free.js nessbit_15');
  process.exit(1);
}

setUserAsFree(username).then(() => {
  console.log('🏁 Script completed');
  process.exit(0);
}).catch(error => {
  console.error('💥 Script failed:', error);
  process.exit(1);
});
