#!/usr/bin/env node

/**
 * EMERGENCY PRODUCTION RESTORE - COMPACT VERSION
 * Sends only essential social data to avoid payload size limits
 */

import fs from 'fs/promises';
import path from 'path';

async function emergencyProductionRestoreCompact() {
  console.log('🚨 EMERGENCY PRODUCTION RESTORE - COMPACT');
  console.log('=' .repeat(60));
  
  try {
    // Load the restored local cache
    const cacheDir = './cache';
    const tokensCachePath = path.join(cacheDir, 'tokens-cache.json');
    
    console.log('📁 Loading restored local cache...');
    const tokensData = await fs.readFile(tokensCachePath, 'utf8');
    const tokens = JSON.parse(tokensData);
    
    console.log(`✅ Loaded ${tokens.length} tokens from local cache`);
    
    // Create compact tokens with only essential social data
    const compactTokens = tokens.map(token => ({
      symbol: token.symbol,
      name: token.name,
      contractAddress: token.contractAddress,
      
      // Essential social data only
      twitterData: token.twitterData ? {
        mentions: token.twitterData.mentions || 0,
        followers: token.twitterData.followers || 0,
        likes: token.twitterData.likes || 0,
        retweets: token.twitterData.retweets || 0,
        replies: token.twitterData.replies || 0,
        lastRefreshed: token.twitterData.lastRefreshed || new Date().toISOString()
      } : null,
      
      communityHealthScore: token.communityHealthScore || 2.0,
      communityScore: token.communityScore || token.communityHealthScore || 2.0,
      twitterTimestamp: token.twitterTimestamp,
      
      // Keep other essential fields
      source: token.source,
      stage: token.stage,
      createdAt: token.createdAt,
      lastDiscoveredAt: token.lastDiscoveredAt,
      hasJupiterData: token.hasJupiterData,
      jupiterData: token.jupiterData
    }));
    
    // Count tokens with social data
    const withTwitter = compactTokens.filter(t => t.twitterData && t.communityHealthScore > 2).length;
    console.log(`📊 Compact tokens with social data: ${withTwitter} (${((withTwitter/compactTokens.length)*100).toFixed(1)}%)`);
    
    if (withTwitter === 0) {
      console.error('❌ No social data found in local cache. Run emergency-restore-social-data.js first!');
      return;
    }
    
    // Split into smaller batches to avoid payload limits
    const batchSize = 100;
    const batches = [];
    for (let i = 0; i < compactTokens.length; i += batchSize) {
      batches.push(compactTokens.slice(i, i + batchSize));
    }
    
    console.log(`🔄 Sending ${batches.length} batches of ~${batchSize} tokens each...`);
    
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      console.log(`📦 Sending batch ${i + 1}/${batches.length} (${batch.length} tokens)...`);
      
      const response = await fetch('https://api.degen-oracle.com/api/admin/cache/emergency-restore', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tokens: batch,
          source: `emergency_local_restore_batch_${i + 1}`,
          timestamp: new Date().toISOString()
        })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ Batch ${i + 1} failed: ${response.status} ${response.statusText}`);
        console.error(`Response: ${errorText.substring(0, 200)}...`);
        continue;
      }
      
      const result = await response.json();
      console.log(`✅ Batch ${i + 1} success:`, result.stats || result);
      
      // Small delay between batches
      if (i < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    // Verify the restore worked
    console.log('🔍 Verifying production restore...');
    await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 seconds
    
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
emergencyProductionRestoreCompact().catch(console.error);


