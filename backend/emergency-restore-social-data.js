#!/usr/bin/env node

/**
 * EMERGENCY SOCIAL DATA RESTORE
 * Restores Twitter data from twitter_metrics.json backup to tokens-cache.json
 */

import fs from 'fs/promises';
import path from 'path';

async function emergencyRestoreSocialData() {
  console.log('🚨 EMERGENCY SOCIAL DATA RESTORE');
  console.log('=' .repeat(60));
  
  try {
    // Paths
    const cacheDir = './cache';
    const tokensCachePath = path.join(cacheDir, 'tokens-cache.json');
    const twitterMetricsPath = path.join(cacheDir, 'twitter_metrics.json');
    const backupPath = path.join(cacheDir, 'tokens-cache-backup-' + Date.now() + '.json');
    
    console.log('📁 Loading current tokens cache...');
    let tokens = [];
    try {
      const tokensData = await fs.readFile(tokensCachePath, 'utf8');
      tokens = JSON.parse(tokensData);
      console.log(`✅ Loaded ${tokens.length} tokens from cache`);
    } catch (error) {
      console.error('❌ Could not load tokens cache:', error.message);
      return;
    }
    
    console.log('📁 Loading Twitter metrics backup...');
    let twitterMetrics = {};
    try {
      const metricsData = await fs.readFile(twitterMetricsPath, 'utf8');
      twitterMetrics = JSON.parse(metricsData);
      console.log(`✅ Loaded Twitter metrics with ${Object.keys(twitterMetrics).length} entries`);
    } catch (error) {
      console.error('❌ Could not load Twitter metrics:', error.message);
      return;
    }
    
    // Create backup of current state
    console.log('💾 Creating backup of current tokens cache...');
    await fs.writeFile(backupPath, JSON.stringify(tokens, null, 2));
    console.log(`✅ Backup saved to: ${backupPath}`);
    
    // Restore social data
    let restored = 0;
    let notFound = 0;
    
    console.log('🔄 Restoring social data to tokens...');
    
    for (const token of tokens) {
      const symbol = token.symbol;
      const name = token.name || symbol;
      
      // Try different cache key formats
      const possibleKeys = [
        `${symbol}_${name}`,
        `${symbol}_${symbol}`,
        symbol,
        name
      ];
      
      let twitterData = null;
      let cacheKey = null;
      
      for (const key of possibleKeys) {
        if (twitterMetrics[key] && twitterMetrics[key].data) {
          twitterData = twitterMetrics[key].data;
          cacheKey = key;
          break;
        }
      }
      
      if (twitterData) {
        // Restore Twitter data
        token.twitterData = twitterData;
        token.twitterTimestamp = twitterData.lastRefreshed || new Date().toISOString();
        
        // Restore community health score
        if (twitterData.mentions !== undefined) {
          // Calculate community health score based on Twitter data
          const mentions = twitterData.mentions || 0;
          const followers = twitterData.followers || 0;
          const engagement = (twitterData.likes || 0) + (twitterData.retweets || 0) + (twitterData.replies || 0);
          
          let score = 2.0; // Base score
          
          // Mentions contribution (0-3 points)
          if (mentions > 0) score += Math.min(mentions / 20, 3);
          
          // Followers contribution (0-2 points)
          if (followers > 0) score += Math.min(Math.log10(followers) / 2, 2);
          
          // Engagement contribution (0-3 points)
          if (engagement > 0) score += Math.min(engagement / 50, 3);
          
          token.communityHealthScore = Math.min(score, 10);
          token.communityScore = token.communityHealthScore; // Ensure both fields
        }
        
        restored++;
        if (restored % 50 === 0) {
          console.log(`📊 Restored ${restored} tokens...`);
        }
      } else {
        notFound++;
      }
    }
    
    console.log('💾 Saving restored tokens cache...');
    await fs.writeFile(tokensCachePath, JSON.stringify(tokens, null, 2));
    
    console.log('');
    console.log('✅ EMERGENCY RESTORE COMPLETE!');
    console.log(`📊 Results:`);
    console.log(`   - Total tokens: ${tokens.length}`);
    console.log(`   - Social data restored: ${restored}`);
    console.log(`   - Not found in backup: ${notFound}`);
    console.log(`   - Success rate: ${((restored / tokens.length) * 100).toFixed(1)}%`);
    console.log(`💾 Backup saved to: ${backupPath}`);
    
  } catch (error) {
    console.error('❌ Emergency restore failed:', error);
  }
}

// Run the emergency restore
emergencyRestoreSocialData().catch(console.error);



