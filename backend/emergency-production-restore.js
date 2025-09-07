#!/usr/bin/env node

/**
 * EMERGENCY PRODUCTION RESTORE
 * Calls the production API to restore social data from twitter_metrics.json
 */

import fs from 'fs/promises';
import path from 'path';

async function emergencyProductionRestore() {
  console.log('🚨 EMERGENCY PRODUCTION RESTORE');
  console.log('=' .repeat(60));
  
  try {
    // Load the restored local cache
    const cacheDir = './cache';
    const tokensCachePath = path.join(cacheDir, 'tokens-cache.json');
    
    console.log('📁 Loading restored local cache...');
    const tokensData = await fs.readFile(tokensCachePath, 'utf8');
    const tokens = JSON.parse(tokensData);
    
    console.log(`✅ Loaded ${tokens.length} tokens from local cache`);
    
    // Count tokens with social data
    const withTwitter = tokens.filter(t => t.twitterData && t.communityHealthScore > 2).length;
    console.log(`📊 Tokens with social data: ${withTwitter} (${((withTwitter/tokens.length)*100).toFixed(1)}%)`);
    
    if (withTwitter === 0) {
      console.error('❌ No social data found in local cache. Run emergency-restore-social-data.js first!');
      return;
    }
    
    console.log('🌐 Calling production emergency restore endpoint...');
    
    const response = await fetch('https://api.degen-oracle.com/api/admin/cache/emergency-restore', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tokens: tokens,
        source: 'emergency_local_restore',
        timestamp: new Date().toISOString()
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Production restore failed: ${response.status} ${response.statusText}`);
      console.error(`Response: ${errorText}`);
      return;
    }
    
    const result = await response.json();
    console.log('✅ Production restore response:', result);
    
    // Verify the restore worked
    console.log('🔍 Verifying production restore...');
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
    
    const verifyResponse = await fetch('https://api.degen-oracle.com/api/tokens');
    const verifyData = await verifyResponse.json();
    
    const productionWithTwitter = verifyData.filter(t => t.twitterData && t.communityHealthScore > 2).length;
    
    console.log('');
    console.log('✅ PRODUCTION RESTORE VERIFICATION');
    console.log(`📊 Production tokens: ${verifyData.length}`);
    console.log(`📊 With social data: ${productionWithTwitter} (${((productionWithTwitter/verifyData.length)*100).toFixed(1)}%)`);
    
    if (productionWithTwitter > 0) {
      console.log('🎉 SUCCESS! Social data restored to production!');
    } else {
      console.log('❌ FAILED! Social data not restored to production.');
    }
    
  } catch (error) {
    console.error('❌ Emergency production restore failed:', error);
  }
}

// Run the emergency production restore
emergencyProductionRestore().catch(console.error);
