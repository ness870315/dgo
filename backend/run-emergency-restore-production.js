#!/usr/bin/env node

/**
 * Run emergency restore on PRODUCTION via SSH/API
 */

import fetch from 'node-fetch';

const API_BASE = 'https://api.degen-oracle.com';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'ness870315';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '1E132730!';

async function triggerEmergencyRestore() {
  try {
    console.log('🚨 Triggering EMERGENCY RESTORE on production...\n');
    
    const auth = Buffer.from(`${ADMIN_USERNAME}:${ADMIN_PASSWORD}`).toString('base64');
    
    console.log(`📡 POST ${API_BASE}/api/admin/emergency-restore-users`);
    
    const response = await fetch(`${API_BASE}/api/admin/emergency-restore-users`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json'
      }
    });
    
    const data = await response.json();
    
    if (response.ok && data.success) {
      console.log('✅ RESTORE SUCCESSFUL!\n');
      console.log(`📊 Recovered ${data.usersCount} users`);
      if (data.users && data.users.length > 0) {
        console.log('\n📋 Recovered users:');
        data.users.forEach(u => console.log(`   - ${u.username} (${u.id})`));
      }
    } else {
      console.log('❌ RESTORE FAILED:', data);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

triggerEmergencyRestore().then(() => {
  console.log('\n🏁 Script completed');
  process.exit(0);
}).catch(error => {
  console.error('💥 Script failed:', error);
  process.exit(1);
});
