#!/usr/bin/env node

/**
 * MICRO BATCH RESTORE
 * Restore social data in very small batches (5-10 tokens at a time)
 */

import fs from 'fs/promises';
import path from 'path';

async function microBatchRestore() {
  console.log('🔬 MICRO BATCH RESTORE');
  console.log('=' .repeat(60));
  
  try {
    // First, get current production state
    console.log('🌐 Getting current production tokens...');
    const prodResponse = await fetch('https://api.degen-oracle.com/api/tokens');
    const prodTokens = await prodResponse.json();
    console.log(`📊 Production currently has: ${prodTokens.length} tokens`);
    
    // Load our restored local cache
    const cacheDir = './cache';
    const tokensCachePath = path.join(cacheDir, 'tokens-cache.json');
    
    console.log('📁 Loading restored local cache...');
    const tokensData = await fs.readFile(tokensCachePath, 'utf8');
    const localTokens = JSON.parse(tokensData);
    
    console.log(`✅ Loaded ${localTokens.length} tokens from local cache`);
    
    // Create a map of social data by contract address and symbol
    const socialDataMap = new Map();
    let socialCount = 0;
    
    localTokens.forEach(token => {
      if (token.twitterData && token.communityHealthScore > 2) {
        // Try contract address first, then symbol
        const keys = [];
        if (token.contractAddress) {
          keys.push(token.contractAddress.toLowerCase());
        }
        if (token.symbol) {
          keys.push(`symbol:${token.symbol.toUpperCase()}`);
        }
        
        const socialData = {
          twitterData: token.twitterData,
          communityHealthScore: token.communityHealthScore,
          communityScore: token.communityScore || token.communityHealthScore,
          twitterTimestamp: token.twitterTimestamp || new Date().toISOString()
        };
        
        keys.forEach(key => {
          socialDataMap.set(key, socialData);
        });
        socialCount++;
      }
    });
    
    console.log(`📊 Social data available for ${socialCount} tokens`);
    
    // Match production tokens with social data and update them
    const tokensToUpdate = [];
    let matched = 0;
    
    prodTokens.forEach(prodToken => {
      const keys = [];
      if (prodToken.contractAddress) {
        keys.push(prodToken.contractAddress.toLowerCase());
      }
      if (prodToken.symbol) {
        keys.push(`symbol:${prodToken.symbol.toUpperCase()}`);
      }
      
      let socialData = null;
      for (const key of keys) {
        if (socialDataMap.has(key)) {
          socialData = socialDataMap.get(key);
          break;
        }
      }
      
      if (socialData) {
        tokensToUpdate.push({
          ...prodToken,
          ...socialData,
          _socialUpdated: true
        });
        matched++;
      } else {
        tokensToUpdate.push(prodToken);
      }
    });
    
    console.log(`📊 Matched ${matched}/${prodTokens.length} production tokens with social data`);
    
    if (matched === 0) {
      console.log('❌ No matches found. Cannot proceed.');
      return;
    }
    
    // Send in micro batches of 5 tokens
    const batchSize = 5;
    const batches = [];
    for (let i = 0; i < tokensToUpdate.length; i += batchSize) {
      batches.push(tokensToUpdate.slice(i, i + batchSize));
    }
    
    console.log(`🔄 Processing ${batches.length} micro-batches of ${batchSize} tokens each...`);
    
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const batchWithSocial = batch.filter(t => t._socialUpdated).length;
      
      console.log(`📦 Batch ${i + 1}/${batches.length}: ${batch.length} tokens (${batchWithSocial} with social data)`);
      
      try {
        const response = await fetch('https://api.degen-oracle.com/api/admin/cache/emergency-restore', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            tokens: batch,
            source: `micro_batch_${i + 1}`,
            timestamp: new Date().toISOString()
          })
        });
        
        if (!response.ok) {
          console.error(`❌ Batch ${i + 1} failed: ${response.status}`);
          errorCount++;
        } else {
          const result = await response.json();
          console.log(`✅ Batch ${i + 1} success`);
          successCount++;
        }
        
        // Delay between batches
        await new Promise(resolve => setTimeout(resolve, 1500));
        
      } catch (error) {
        console.error(`❌ Batch ${i + 1} error:`, error.message);
        errorCount++;
      }
      
      // Progress update every 20 batches
      if ((i + 1) % 20 === 0) {
        console.log(`📊 Progress: ${i + 1}/${batches.length} batches (${successCount} success, ${errorCount} errors)`);
      }
    }
    
    console.log('');
    console.log('📊 MICRO BATCH RESTORE COMPLETE');
    console.log(`✅ Successful batches: ${successCount}`);
    console.log(`❌ Failed batches: ${errorCount}`);
    console.log(`📊 Success rate: ${((successCount / batches.length) * 100).toFixed(1)}%`);
    
    // Final verification
    console.log('🔍 Final verification...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    const finalResponse = await fetch('https://api.degen-oracle.com/api/tokens');
    const finalTokens = await finalResponse.json();
    
    const finalWithSocial = finalTokens.filter(t => t.twitterData && t.communityHealthScore > 2).length;
    
    console.log('');
    console.log('✅ FINAL VERIFICATION');
    console.log(`📊 Production tokens: ${finalTokens.length}`);
    console.log(`📊 With social data: ${finalWithSocial} (${((finalWithSocial/finalTokens.length)*100).toFixed(1)}%)`);
    
    if (finalWithSocial >= matched * 0.8) {
      console.log('🎉 SUCCESS! Social data restored to production!');
    } else {
      console.log('⚠️ PARTIAL SUCCESS: Some social data may have been lost.');
    }
    
  } catch (error) {
    console.error('❌ Micro batch restore failed:', error);
  }
}

// Run the micro batch restore
microBatchRestore().catch(console.error);



