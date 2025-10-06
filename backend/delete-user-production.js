#!/usr/bin/env node

/**
 * Script to delete a user on PRODUCTION via admin API
 */

import fetch from 'node-fetch';

const API_BASE = 'https://api.degen-oracle.com';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'ness870315';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '1E132730!';

async function deleteUserProduction(username) {
  try {
    console.log(`🔍 Deleting user '${username}' on PRODUCTION...\n`);
    
    const auth = Buffer.from(`${ADMIN_USERNAME}:${ADMIN_PASSWORD}`).toString('base64');
    
    console.log(`📡 POST ${API_BASE}/api/admin/users/${username}/delete`);
    
    const response = await fetch(`${API_BASE}/api/admin/users/${username}/delete`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json'
      }
    });
    
    const data = await response.json();
    
    if (response.ok && data.success) {
      console.log('✅ SUCCESS!\n');
      console.log('📊 User Data Deleted:');
      console.log(`   Username: ${data.user?.username}`);
      console.log(`   User ID: ${data.user?.id}`);
      console.log(`   Display Name: ${data.user?.displayName}`);
      console.log(`   KOL Calls: ${data.deletedData?.kolCalls || 0}`);
      console.log(`   Sessions: ${data.deletedData?.sessions || 0}`);
      console.log(`   Referral Codes: ${data.deletedData?.referralCodes || 0}`);
      console.log('\n🎯 User has been completely removed from production');
    } else {
      console.log('❌ FAILED:', data);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  }
}

const username = process.argv[2] || 'degen_oracle1';

deleteUserProduction(username).then(() => {
  console.log('\n🏁 Script completed');
  process.exit(0);
}).catch(error => {
  console.error('💥 Script failed:', error);
  process.exit(1);
});
