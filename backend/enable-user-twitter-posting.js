#!/usr/bin/env node

/**
 * Quick script to enable Twitter posting for a specific user
 * Usage: node enable-user-twitter-posting.js <userId>
 */

import OAuthXService from './oauthXService.js';

async function enableUserTwitterPosting(userId) {
  if (!userId) {
    console.error('❌ Usage: node enable-user-twitter-posting.js <userId>');
    process.exit(1);
  }
  
  console.log(`🔧 Enabling Twitter posting for user ${userId}...`);
  
  const oauthService = new OAuthXService();
  
  try {
    // Check current status
    const currentStatus = await oauthService.hasTwitterPostingEnabled(userId);
    console.log(`📊 Current Twitter posting status: ${currentStatus}`);
    
    if (currentStatus) {
      console.log('✅ User already has Twitter posting enabled!');
      return;
    }
    
    // Enable Twitter posting
    await oauthService.setTwitterPostingEnabled(userId, true);
    
    // Verify it worked
    const newStatus = await oauthService.hasTwitterPostingEnabled(userId);
    
    if (newStatus) {
      console.log('✅ Successfully enabled Twitter posting for user!');
    } else {
      console.error('❌ Failed to enable Twitter posting - status still false');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Get userId from command line arguments
const userId = process.argv[2];
enableUserTwitterPosting(userId).catch(console.error);
