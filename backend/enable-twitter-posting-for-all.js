#!/usr/bin/env node

/**
 * Migration script to enable Twitter posting for all existing users
 * This fixes the issue where users authenticated before the fix don't have twitterPostingEnabled set
 */

import OAuthXService from './oauthXService.js';

async function enableTwitterPostingForAll() {
  console.log('🔧 Starting Twitter posting enablement for all users...');
  
  const oauthService = new OAuthXService();
  
  try {
    // Get all users from the database
    const users = await oauthService.db.getAllUsers();
    console.log(`📊 Found ${users.length} users to check`);
    
    let updatedCount = 0;
    let alreadyEnabledCount = 0;
    
    for (const user of users) {
      try {
        // Check if user has Twitter posting enabled
        if (user.twitterPostingEnabled === undefined || user.twitterPostingEnabled === null) {
          // Enable Twitter posting for this user
          await oauthService.setTwitterPostingEnabled(user.id, true);
          console.log(`✅ Enabled Twitter posting for user ${user.username} (${user.id})`);
          updatedCount++;
        } else if (user.twitterPostingEnabled === true) {
          console.log(`✓ User ${user.username} already has Twitter posting enabled`);
          alreadyEnabledCount++;
        } else {
          console.log(`⚠️ User ${user.username} has Twitter posting explicitly disabled - skipping`);
        }
      } catch (error) {
        console.error(`❌ Error updating user ${user.id}:`, error.message);
      }
    }
    
    console.log('\n🎯 Migration Summary:');
    console.log(`   Total users: ${users.length}`);
    console.log(`   Updated: ${updatedCount}`);
    console.log(`   Already enabled: ${alreadyEnabledCount}`);
    console.log(`   Explicitly disabled: ${users.length - updatedCount - alreadyEnabledCount}`);
    console.log('\n✅ Twitter posting enablement completed!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

// Run the migration
enableTwitterPostingForAll().catch(console.error);
