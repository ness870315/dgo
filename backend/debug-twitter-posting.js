#!/usr/bin/env node

/**
 * 🐦 Debug Twitter Posting
 * Test script to debug why tweets aren't being posted when calls are made
 */

import OAuthXService from './oauthXService.js';

async function debugTwitterPosting() {
  try {
    console.log('🐦 DeGen Oracle - Twitter Posting Debug');
    console.log('=======================================');
    
    const oauthService = new OAuthXService();
    
    // Get all users to find one with Twitter access
    console.log('\n📋 Checking users with Twitter access...');
    
    // Read users directory to find available users
    const fs = await import('fs/promises');
    const path = await import('path');
    
    const usersDir = path.join(process.cwd(), 'users');
    
    try {
      const userDirs = await fs.readdir(usersDir);
      console.log(`Found ${userDirs.length} user directories`);
      
      for (const userId of userDirs.slice(0, 3)) { // Check first 3 users
        try {
          const user = await oauthService.getUserById(userId);
          
          if (user) {
            console.log(`\n👤 User: ${user.username} (${userId})`);
            console.log(`  Has Access Token: ${!!user.accessToken}`);
            console.log(`  Token Length: ${user.accessToken?.length || 0}`);
            console.log(`  Token Preview: ${user.accessToken?.substring(0, 20)}...`);
            
            // Check if user has Twitter posting enabled
            const hasTwitterPosting = await oauthService.hasTwitterPostingEnabled(userId);
            console.log(`  Twitter Posting Enabled: ${hasTwitterPosting}`);
            
            // Test posting a tweet if user has access token
            if (user.accessToken && hasTwitterPosting) {
              console.log(`\n🧪 Testing tweet posting for ${user.username}...`);
              
              const testTweet = `🧪 Test tweet from DeGen Oracle - ${new Date().toISOString()}`;
              
              try {
                const result = await oauthService.postTweet(userId, testTweet);
                console.log(`✅ Tweet posted successfully!`);
                console.log(`  Tweet ID: ${result.id}`);
                console.log(`  Tweet Text: ${result.text}`);
                break; // Success, no need to test more users
              } catch (error) {
                console.error(`❌ Tweet posting failed for ${user.username}:`);
                console.error(`  Error: ${error.message}`);
                console.error(`  Status: ${error.response?.status}`);
                console.error(`  Response: ${JSON.stringify(error.response?.data, null, 2)}`);
                
                // Check if it's a token issue
                if (error.response?.status === 401) {
                  console.log(`🔍 Checking token validity...`);
                  
                  // Try to get user profile with the token
                  try {
                    const profile = await oauthService.getUserProfile(user.accessToken);
                    console.log(`✅ Token is valid - got profile: ${profile.username}`);
                  } catch (profileError) {
                    console.error(`❌ Token is invalid: ${profileError.message}`);
                    console.error(`  Profile error: ${JSON.stringify(profileError.response?.data, null, 2)}`);
                  }
                }
              }
            } else {
              console.log(`  ⚠️ Skipping - no access token or Twitter posting disabled`);
            }
          }
        } catch (userError) {
          console.error(`❌ Error loading user ${userId}:`, userError.message);
        }
      }
      
    } catch (dirError) {
      console.error('❌ Error reading users directory:', dirError.message);
    }
    
    console.log('\n🔍 Twitter API Configuration:');
    console.log(`  Client ID: ${process.env.X_CLIENT_ID ? 'Set' : 'Missing'}`);
    console.log(`  Client Secret: ${process.env.X_CLIENT_SECRET ? 'Set' : 'Missing'}`);
    console.log(`  Redirect URI: ${process.env.X_REDIRECT_URI || 'Not set'}`);
    
  } catch (error) {
    console.error('❌ Debug failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

// Handle command line arguments
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
🐦 DeGen Oracle Twitter Posting Debug Tool

Usage: node debug-twitter-posting.js [options]

Options:
  --help, -h        Show this help message

This tool will:
1. Find users with Twitter access tokens
2. Test posting a tweet for each user
3. Diagnose any authentication issues
4. Check Twitter API configuration

Examples:
  node debug-twitter-posting.js     # Run full debug
`);
  process.exit(0);
}

// Run the debug
debugTwitterPosting();
