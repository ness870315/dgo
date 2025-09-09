#!/usr/bin/env node

/**
 * SOCIAL DATA INJECTION
 * Injects only social data into existing production tokens without overwriting
 */

import fs from 'fs/promises';
import path from 'path';

async function injectSocialData() {
  console.log('💉 SOCIAL DATA INJECTION');
  console.log('=' .repeat(60));
  
  try {
    // Load the restored local cache
    const cacheDir = './cache';
    const tokensCachePath = path.join(cacheDir, 'tokens-cache.json');
    
    console.log('📁 Loading restored local cache...');
    const tokensData = await fs.readFile(tokensCachePath, 'utf8');
    const localTokens = JSON.parse(tokensData);
    
    console.log(`✅ Loaded ${localTokens.length} tokens from local cache`);
    
    // Get current production tokens
    console.log('🌐 Fetching current production tokens...');
    const prodResponse = await fetch('https://api.degen-oracle.com/api/tokens');
    const prodTokens = await prodResponse.json();
    
    console.log(`📊 Production has ${prodTokens.length} tokens`);
    
    // Create social data map from local tokens
    const socialDataMap = new Map();
    let localWithSocial = 0;
    
    localTokens.forEach(token => {
      if (token.twitterData && token.communityHealthScore > 2) {
        const key = token.contractAddress?.toLowerCase() || `symbol:${token.symbol?.toUpperCase()}`;
        if (key) {
          socialDataMap.set(key, {
            twitterData: token.twitterData,
            communityHealthScore: token.communityHealthScore,
            communityScore: token.communityScore || token.communityHealthScore,
            twitterTimestamp: token.twitterTimestamp
          });
          localWithSocial++;
        }
      }
    });
    
    console.log(`📊 Local tokens with social data: ${localWithSocial}`);
    console.log(`📊 Social data map size: ${socialDataMap.size}`);
    
    // Inject social data into production tokens
    let injected = 0;
    const updatedTokens = prodTokens.map(token => {
      const key = token.contractAddress?.toLowerCase() || `symbol:${token.symbol?.toUpperCase()}`;
      
      if (key && socialDataMap.has(key)) {
        const socialData = socialDataMap.get(key);
        injected++;
        
        return {
          ...token,
          ...socialData,
          _socialDataInjected: true,
          _injectedAt: new Date().toISOString()
        };
      }
      
      return token;
    });
    
    console.log(`💉 Social data injected into ${injected}/${prodTokens.length} tokens`);
    
    if (injected === 0) {
      console.log('❌ No matching tokens found for social data injection');
      return;
    }
    
    // Send updated tokens back in small batches
    const batchSize = 25; // Smaller batches for social data
    const batches = [];
    for (let i = 0; i < updatedTokens.length; i += batchSize) {
      batches.push(updatedTokens.slice(i, i + batchSize));
    }
    
    console.log(`🔄 Sending ${batches.length} batches of ~${batchSize} tokens each...`);
    
    let successfulBatches = 0;
    
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const batchWithSocial = batch.filter(t => t._socialDataInjected).length;
      
      if (batchWithSocial === 0) {
        console.log(`⏭️ Skipping batch ${i + 1}/${batches.length} (no social data)`);
        continue;
      }
      
      console.log(`📦 Sending batch ${i + 1}/${batches.length} (${batch.length} tokens, ${batchWithSocial} with social data)...`);
      
      try {
        const response = await fetch('https://api.degen-oracle.com/api/admin/cache/emergency-restore', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            tokens: batch,
            source: `social_data_injection_batch_${i + 1}`,
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
        console.log(`✅ Batch ${i + 1} success: ${result.restored?.restoredTokens || 'unknown'} tokens restored`);
        successfulBatches++;
        
        // Small delay between batches
        await new Promise(resolve => setTimeout(resolve, 2000));
        
      } catch (error) {
        console.error(`❌ Batch ${i + 1} error:`, error.message);
      }
    }
    
    console.log(`📊 Successful batches: ${successfulBatches}/${batches.length}`);
    
    // Final verification
    console.log('🔍 Final verification...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    const finalResponse = await fetch('https://api.degen-oracle.com/api/tokens');
    const finalTokens = await finalResponse.json();
    
    const finalWithSocial = finalTokens.filter(t => t.twitterData && t.communityHealthScore > 2).length;
    
    console.log('');
    console.log('✅ SOCIAL DATA INJECTION COMPLETE');
    console.log(`📊 Final production tokens: ${finalTokens.length}`);
    console.log(`📊 With social data: ${finalWithSocial} (${((finalWithSocial/finalTokens.length)*100).toFixed(1)}%)`);
    
    if (finalWithSocial > injected * 0.5) {
      console.log('🎉 SUCCESS! Social data successfully injected!');
    } else {
      console.log('⚠️ PARTIAL SUCCESS: Some social data may not have been preserved.');
    }
    
  } catch (error) {
    console.error('❌ Social data injection failed:', error);
  }
}

// Run the social data injection
injectSocialData().catch(console.error);



