#!/usr/bin/env node

/**
 * Force recalculation of KOL leaderboard on production
 * This will clear any cached trust levels and recalculate with current thresholds
 */

import fetch from 'node-fetch';

const API_BASE = 'https://api.degen-oracle.com';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'ness870315';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '1E132730!';

async function forceLeaderboardRecalc() {
  try {
    console.log('🔄 Forcing leaderboard recalculation on production...\n');
    
    const auth = Buffer.from(`${ADMIN_USERNAME}:${ADMIN_PASSWORD}`).toString('base64');
    
    // Take a new snapshot to force recalculation
    console.log(`📡 POST ${API_BASE}/api/admin/take-snapshot`);
    
    const response = await fetch(`${API_BASE}/api/admin/take-snapshot`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json'
      }
    });
    
    const data = await response.json();
    
    if (response.ok && data.success) {
      console.log('✅ SUCCESS!\n');
      console.log('📊 Snapshot taken:', JSON.stringify(data.snapshot, null, 2));
      console.log('\n🎯 Leaderboard has been recalculated with current thresholds');
      console.log('📝 New trust levels:');
      console.log('   - Elite KOL: 70+');
      console.log('   - Expert KOL: 60-69');
      console.log('   - Trusted KOL: 50-59');
      console.log('   - Rising KOL: 40-49');
      console.log('   - Developing KOL: 20-39');
    } else {
      console.log('❌ FAILED:', data);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  }
}

forceLeaderboardRecalc().then(() => {
  console.log('\n🏁 Script completed');
  process.exit(0);
}).catch(error => {
  console.error('💥 Script failed:', error);
  process.exit(1);
});
