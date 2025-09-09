#!/usr/bin/env node

/**
 * FULL CACHE RESTORE
 * Restore the complete cache by sending minimal essential data only
 */

import fs from 'fs/promises';
import path from 'path';

async function fullCacheRestore() {
  console.log('🔄 FULL CACHE RESTORE');
  console.log('=' .repeat(60));
  
  try {
    // Load our complete local cache
    const localCachePath = './cache/tokens-cache.json';
    const localData = await fs.readFile(localCachePath, 'utf8');
    const localTokens = JSON.parse(localData);
    
    console.log(`📁 Loaded ${localTokens.length} tokens from local cache`);
    
    // Create ultra-minimal tokens to reduce payload size
    const minimalTokens = localTokens.map(token => {
      const minimal = {
        symbol: token.symbol,
        name: token.name,
        contractAddress: token.contractAddress,
        source: token.source || 'jupiter',
        stage: token.stage || 'jupiter'
      };
      
      // Add only essential Jupiter data
      if (token.jupiterData) {
        minimal.jupiterData = {
          mcap: token.jupiterData.mcap,
          price: token.jupiterData.price
        };
        minimal.hasJupiterData = true;
      }
      
      // Add social data if present
      if (token.twitterData) {
        minimal.twitterData = {
          mentions: token.twitterData.mentions || 0,
          lastRefreshed: token.twitterData.lastRefreshed || new Date().toISOString()
        };
        minimal.communityHealthScore = token.communityHealthScore || 2.0;
      }
      
      return minimal;
    });
    
    // Calculate payload size
    const payload = JSON.stringify(minimalTokens);
    const sizeKB = (payload.length / 1024).toFixed(2);
    console.log(`📊 Minimal payload size: ${sizeKB} KB`);
    
    if (payload.length > 500000) { // 500KB limit
      console.log('⚠️ Payload still too large, splitting into chunks...');
      
      // Split into chunks of 100 tokens
      const chunkSize = 100;
      const chunks = [];
      for (let i = 0; i < minimalTokens.length; i += chunkSize) {
        chunks.push(minimalTokens.slice(i, i + chunkSize));
      }
      
      console.log(`🔄 Sending ${chunks.length} chunks of ~${chunkSize} tokens each...`);
      
      // Send first chunk as full restore, others as incremental
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        console.log(`📦 Sending chunk ${i + 1}/${chunks.length} (${chunk.length} tokens)...`);
        
        try {
          const response = await fetch('https://api.degen-oracle.com/api/admin/cache/emergency-restore', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              tokens: chunk,
              source: i === 0 ? 'full_cache_restore_base' : `full_cache_restore_chunk_${i + 1}`,
              timestamp: new Date().toISOString()
            })
          });
          
          if (!response.ok) {
            const errorText = await response.text();
            console.error(`❌ Chunk ${i + 1} failed: ${response.status} ${response.statusText}`);
            
            if (response.status === 413) {
              console.log('💡 Payload still too large, trying smaller chunks...');
              break;
            }
            continue;
          }
          
          const result = await response.json();
          console.log(`✅ Chunk ${i + 1} success: ${result.restored?.totalTokens || 'unknown'} total tokens`);
          
          // Delay between chunks
          await new Promise(resolve => setTimeout(resolve, 2000));
          
        } catch (error) {
          console.error(`❌ Chunk ${i + 1} error:`, error.message);
        }
      }
      
    } else {
      console.log('🌐 Sending complete minimal cache...');
      
      const response = await fetch('https://api.degen-oracle.com/api/admin/cache/emergency-restore', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tokens: minimalTokens,
          source: 'full_cache_restore_complete',
          timestamp: new Date().toISOString()
        })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ Full restore failed: ${response.status} ${response.statusText}`);
        console.error(`Response: ${errorText.substring(0, 500)}...`);
        return;
      }
      
      const result = await response.json();
      console.log('✅ Full restore success:', result);
    }
    
    // Final verification
    console.log('🔍 Verifying full restore...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    const verifyResponse = await fetch('https://api.degen-oracle.com/api/tokens');
    const verifyTokens = await verifyResponse.json();
    
    const verifyWithSocial = verifyTokens.filter(t => t.twitterData && t.communityHealthScore > 2).length;
    
    console.log('');
    console.log('✅ FULL RESTORE VERIFICATION');
    console.log(`📊 Production tokens: ${verifyTokens.length} (was 10)`);
    console.log(`📊 With social data: ${verifyWithSocial} (${((verifyWithSocial/verifyTokens.length)*100).toFixed(1)}%)`);
    console.log(`📊 Recovery rate: ${((verifyTokens.length / localTokens.length) * 100).toFixed(1)}%`);
    
    if (verifyTokens.length >= localTokens.length * 0.8) {
      console.log('🎉 SUCCESS! Full cache restored to production!');
    } else if (verifyTokens.length > 50) {
      console.log('⚠️ PARTIAL SUCCESS: Significant tokens restored but not complete.');
    } else {
      console.log('❌ FAILED: Cache not properly restored.');
    }
    
  } catch (error) {
    console.error('❌ Full cache restore failed:', error);
  }
}

// Run the full cache restore
fullCacheRestore().catch(console.error);



