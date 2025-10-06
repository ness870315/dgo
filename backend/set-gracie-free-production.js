#!/usr/bin/env node

/**
 * Script to set GracieQuant as free user on PRODUCTION server via API
 */

import fetch from 'node-fetch';

const API_BASE = 'https://api.degen-oracle.com';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'ness870315';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '1E132730!';

async function setGracieFree() {
  try {
    console.log('🔍 Setting GracieQuant as free user on PRODUCTION...\n');
    
    const username = 'GracieQuant';
    const auth = Buffer.from(`${ADMIN_USERNAME}:${ADMIN_PASSWORD}`).toString('base64');
    
    console.log(`📡 Calling: POST ${API_BASE}/api/admin/users/${username}/set-free`);
    
    const response = await fetch(`${API_BASE}/api/admin/users/${username}/set-free`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json'
      }
    });
    
    const data = await response.json();
    
    if (response.ok && data.success) {
      console.log('✅ SUCCESS!\n');
      console.log('📊 Previous Status:', JSON.stringify(data.previousStatus, null, 2));
      console.log('\n📊 New Status:', JSON.stringify(data.newStatus, null, 2));
      console.log('\n🎯 GracieQuant is now a FREE user on production');
      console.log('🧪 Ready for NFT-gated access testing');
    } else {
      console.log('❌ FAILED:', data);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  }
}

setGracieFree().then(() => {
  console.log('\n🏁 Script completed');
  process.exit(0);
}).catch(error => {
  console.error('💥 Script failed:', error);
  process.exit(1);
});
