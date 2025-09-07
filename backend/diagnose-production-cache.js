#!/usr/bin/env node

/**
 * DIAGNOSE PRODUCTION CACHE
 * Check what's happening with the production cache vs local cache
 */

import fs from 'fs/promises';
import path from 'path';

async function diagnoseProductionCache() {
  console.log('🔍 PRODUCTION CACHE DIAGNOSIS');
  console.log('=' .repeat(60));
  
  try {
    // Check local cache
    console.log('📁 LOCAL CACHE STATUS:');
    const localCachePath = './cache/tokens-cache.json';
    const localData = await fs.readFile(localCachePath, 'utf8');
    const localTokens = JSON.parse(localData);
    const localWithSocial = localTokens.filter(t => t.twitterData && t.communityHealthScore > 2).length;
    
    console.log(`   Tokens: ${localTokens.length}`);
    console.log(`   With social data: ${localWithSocial} (${((localWithSocial/localTokens.length)*100).toFixed(1)}%)`);
    
    // Check production API
    console.log('');
    console.log('🌐 PRODUCTION API STATUS:');
    const prodResponse = await fetch('https://api.degen-oracle.com/api/tokens');
    const prodTokens = await prodResponse.json();
    const prodWithSocial = prodTokens.filter(t => t.twitterData && t.communityHealthScore > 2).length;
    
    console.log(`   Tokens: ${prodTokens.length}`);
    console.log(`   With social data: ${prodWithSocial} (${((prodWithSocial/prodTokens.length)*100).toFixed(1)}%)`);
    
    // Sample comparison
    console.log('');
    console.log('📊 SAMPLE TOKEN COMPARISON:');
    
    if (localTokens.length > 0 && prodTokens.length > 0) {
      console.log('');
      console.log('Local sample tokens:');
      localTokens.slice(0, 5).forEach((token, i) => {
        console.log(`   ${i+1}. ${token.symbol} - ${token.name} (Social: ${token.twitterData ? 'YES' : 'NO'})`);
      });
      
      console.log('');
      console.log('Production sample tokens:');
      prodTokens.slice(0, 5).forEach((token, i) => {
        console.log(`   ${i+1}. ${token.symbol} - ${token.name} (Social: ${token.twitterData ? 'YES' : 'NO'})`);
      });
      
      // Check for overlaps
      const localSymbols = new Set(localTokens.map(t => t.symbol));
      const prodSymbols = new Set(prodTokens.map(t => t.symbol));
      
      const overlap = [...localSymbols].filter(s => prodSymbols.has(s));
      console.log('');
      console.log(`📊 Symbol overlap: ${overlap.length} tokens exist in both`);
      
      if (overlap.length > 0) {
        console.log('   Overlapping symbols:', overlap.slice(0, 10).join(', '));
      }
    }
    
    // Check if production has any backup info
    console.log('');
    console.log('🔍 PRODUCTION BACKUP STATUS:');
    try {
      const backupResponse = await fetch('https://api.degen-oracle.com/api/admin/backup/status');
      const backupData = await backupResponse.json();
      
      console.log('   Backup system:', backupData.success ? 'ACTIVE' : 'INACTIVE');
      if (backupData.backup) {
        console.log(`   Main cache tokens: ${backupData.backup.mainCache?.tokenCount || 'unknown'}`);
        console.log(`   Backup running: ${backupData.backup.isRunning ? 'YES' : 'NO'}`);
      }
    } catch (error) {
      console.log('   Backup status: ERROR -', error.message);
    }
    
    // Diagnosis
    console.log('');
    console.log('🎯 DIAGNOSIS:');
    
    if (localTokens.length > prodTokens.length * 10) {
      console.log('❌ CRITICAL: Production has significantly fewer tokens than local cache');
      console.log('   This suggests the production cache was overwritten or corrupted');
      console.log('   Recommendation: Restore production cache from local backup');
    } else if (localTokens.length === prodTokens.length) {
      console.log('✅ Token counts match - checking social data...');
      if (localWithSocial > prodWithSocial * 2) {
        console.log('❌ Social data missing in production');
        console.log('   Recommendation: Inject social data only');
      } else {
        console.log('✅ Caches appear to be in sync');
      }
    } else {
      console.log('⚠️ Token counts differ - investigating...');
    }
    
  } catch (error) {
    console.error('❌ Diagnosis failed:', error);
  }
}

// Run the diagnosis
diagnoseProductionCache().catch(console.error);


