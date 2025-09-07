#!/usr/bin/env node

/**
 * RESTORE VIA DIRECT FILE COPY
 * Copy the restored cache directly to production via admin endpoint
 */

import fs from 'fs/promises';
import path from 'path';

async function restoreViaFileCopy() {
  console.log('📁 RESTORE VIA DIRECT FILE COPY');
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
      console.error('❌ No social data found in local cache.');
      return;
    }
    
    // Create a compressed version with only essential data
    const essentialTokens = tokens.map(token => {
      const essential = {
        symbol: token.symbol,
        name: token.name,
        contractAddress: token.contractAddress,
        source: token.source || 'jupiter',
        stage: token.stage || 'jupiter',
        createdAt: token.createdAt || new Date().toISOString(),
        lastDiscoveredAt: token.lastDiscoveredAt || new Date().toISOString(),
        hasJupiterData: token.hasJupiterData || false
      };
      
      // Add Jupiter data if present (compressed)
      if (token.jupiterData) {
        essential.jupiterData = {
          mcap: token.jupiterData.mcap,
          price: token.jupiterData.price,
          volume24h: token.jupiterData.volume24h,
          priceChange24h: token.jupiterData.priceChange24h,
          liquidity: token.jupiterData.liquidity,
          holders: token.jupiterData.holders
        };
      }
      
      // Add social data if present
      if (token.twitterData) {
        essential.twitterData = {
          mentions: token.twitterData.mentions || 0,
          followers: token.twitterData.followers || 0,
          likes: token.twitterData.likes || 0,
          retweets: token.twitterData.retweets || 0,
          replies: token.twitterData.replies || 0,
          lastRefreshed: token.twitterData.lastRefreshed || new Date().toISOString()
        };
        essential.communityHealthScore = token.communityHealthScore || 2.0;
        essential.communityScore = token.communityScore || token.communityHealthScore || 2.0;
        essential.twitterTimestamp = token.twitterTimestamp;
      }
      
      return essential;
    });
    
    console.log('💾 Creating compressed cache file...');
    const compressedPath = path.join(cacheDir, 'tokens-cache-compressed.json');
    await fs.writeFile(compressedPath, JSON.stringify(essentialTokens, null, 0)); // No formatting to save space
    
    const stats = await fs.stat(compressedPath);
    console.log(`📊 Compressed cache size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    
    if (stats.size > 10 * 1024 * 1024) { // 10MB limit
      console.error('❌ Compressed cache still too large for HTTP payload');
      return;
    }
    
    console.log('🌐 Sending compressed cache to production...');
    
    const response = await fetch('https://api.degen-oracle.com/api/admin/cache/emergency-restore', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tokens: essentialTokens,
        source: 'compressed_full_restore',
        timestamp: new Date().toISOString()
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Restore failed: ${response.status} ${response.statusText}`);
      console.error(`Response: ${errorText.substring(0, 500)}...`);
      return;
    }
    
    const result = await response.json();
    console.log('✅ Restore response:', result);
    
    // Verify the restore worked
    console.log('🔍 Verifying production restore...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const verifyResponse = await fetch('https://api.degen-oracle.com/api/tokens');
    const verifyData = await verifyResponse.json();
    
    const productionWithTwitter = verifyData.filter(t => t.twitterData && t.communityHealthScore > 2).length;
    
    console.log('');
    console.log('✅ PRODUCTION RESTORE VERIFICATION');
    console.log(`📊 Production tokens: ${verifyData.length}`);
    console.log(`📊 With social data: ${productionWithTwitter} (${((productionWithTwitter/verifyData.length)*100).toFixed(1)}%)`);
    
    if (productionWithTwitter > withTwitter * 0.8) {
      console.log('🎉 SUCCESS! Full cache restored to production!');
    } else {
      console.log('❌ FAILED! Cache not properly restored.');
    }
    
  } catch (error) {
    console.error('❌ File copy restore failed:', error);
  }
}

// Run the file copy restore
restoreViaFileCopy().catch(console.error);


