#!/usr/bin/env node

/**
 * Script to delete a user and all associated data
 * Usage: node delete-user.js <username>
 */

import HybridDatabaseService from './hybridDatabaseService.js';
import fs from 'fs/promises';
import path from 'path';

async function deleteUser(username) {
  try {
    console.log(`🔍 Looking for user: ${username}`);
    
    const db = new HybridDatabaseService();
    
    // Get all users to find the user by username
    const users = await db.getAllUsers();
    const user = users.find(u => u.username === username || u.username === `@${username}`);
    
    if (!user) {
      console.log(`❌ User '${username}' not found`);
      console.log('Available users:', users.map(u => u.username).slice(0, 10));
      return;
    }
    
    console.log(`✅ Found user: ${user.username} (ID: ${user.id})`);
    console.log(`   Display Name: ${user.displayName}`);
    console.log(`   Created: ${user.createdAt}`);
    
    // Get user data summary
    const premium = await db.getPremiumStatus(user.id).catch(() => null);
    const calls = await db.getKolCalls(user.id).catch(() => []);
    
    console.log(`\n📊 User Data Summary:`);
    console.log(`   Premium Status: ${premium?.isPremium ? 'Yes' : 'No'}`);
    console.log(`   KOL Calls: ${calls.length}`);
    console.log(`   Referral Code: ${user.referralCode || 'None'}`);
    
    console.log(`\n⚠️  This will DELETE:`);
    console.log(`   - User profile and account data`);
    console.log(`   - All KOL calls (${calls.length})`);
    console.log(`   - Premium status and payment history`);
    console.log(`   - Watchlist and preferences`);
    console.log(`   - Activity logs`);
    console.log(`   - All sessions`);
    
    // Delete user directory
    const userDir = path.join(db.usersDir, `user-${user.id}`);
    console.log(`\n🗑️  Deleting user directory: ${userDir}`);
    
    try {
      await fs.rm(userDir, { recursive: true, force: true });
      console.log(`✅ User directory deleted`);
    } catch (err) {
      console.log(`⚠️  Could not delete user directory: ${err.message}`);
    }
    
    // Remove from users index
    console.log(`\n🗑️  Removing from users index...`);
    const updatedUsers = users.filter(u => u.id !== user.id);
    const usersIndexPath = path.join(db.globalDir, 'users-index.json');
    await fs.writeFile(usersIndexPath, JSON.stringify(updatedUsers, null, 2));
    console.log(`✅ Removed from users index (${users.length} → ${updatedUsers.length})`);
    
    // Remove sessions
    console.log(`\n🗑️  Removing sessions...`);
    const sessionsPath = path.join(db.globalDir, 'sessions.json');
    try {
      const sessionsData = await fs.readFile(sessionsPath, 'utf8');
      const sessions = JSON.parse(sessionsData);
      const sessionKeys = Object.keys(sessions);
      const userSessions = sessionKeys.filter(key => sessions[key].userId === user.id);
      
      userSessions.forEach(key => delete sessions[key]);
      
      await fs.writeFile(sessionsPath, JSON.stringify(sessions, null, 2));
      console.log(`✅ Removed ${userSessions.length} session(s)`);
    } catch (err) {
      console.log(`⚠️  Could not remove sessions: ${err.message}`);
    }
    
    // Remove from referral codes (if they created any)
    console.log(`\n🗑️  Checking referral codes...`);
    const referralCodesPath = path.join(db.globalDir, 'referral-codes.json');
    try {
      const codesData = await fs.readFile(referralCodesPath, 'utf8');
      const codes = JSON.parse(codesData);
      const userCodes = codes.filter(c => c.createdBy === user.id);
      const updatedCodes = codes.filter(c => c.createdBy !== user.id);
      
      if (userCodes.length > 0) {
        await fs.writeFile(referralCodesPath, JSON.stringify(updatedCodes, null, 2));
        console.log(`✅ Removed ${userCodes.length} referral code(s)`);
      } else {
        console.log(`   No referral codes to remove`);
      }
    } catch (err) {
      console.log(`⚠️  Could not check referral codes: ${err.message}`);
    }
    
    console.log(`\n✅ User '${user.username}' has been completely deleted`);
    console.log(`🏁 Deletion completed successfully`);
    
  } catch (error) {
    console.error('❌ Error deleting user:', error.message);
    console.error(error.stack);
  }
}

// Get username from command line arguments
const username = process.argv[2];

if (!username) {
  console.log('Usage: node delete-user.js <username>');
  console.log('Example: node delete-user.js degen_oracle1');
  process.exit(1);
}

deleteUser(username).then(() => {
  console.log('\n🏁 Script completed');
  process.exit(0);
}).catch(error => {
  console.error('💥 Script failed:', error);
  process.exit(1);
});
