#!/usr/bin/env node

/**
 * Twitter Data Coverage Report
 * Analyzes how many tokens have Twitter data and their quality
 */

import fs from 'fs/promises';
import path from 'path';

async function generateTwitterDataReport() {
  console.log('📊 TWITTER DATA COVERAGE REPORT');
  console.log('=' .repeat(60));
  
  try {
    // Load main token cache
    const cachePath = path.join(process.cwd(), 'cache', 'tokens-cache.json');
    
    let tokens = [];
    try {
      const data = await fs.readFile(cachePath, 'utf8');
      tokens = JSON.parse(data);
      console.log(`📁 Loaded ${tokens.length} tokens from cache`);
    } catch (error) {
      console.log('❌ Could not load tokens cache:', error.message);
      return;
    }
    
    // Load Twitter metrics cache
    const twitterCachePath = path.join(process.cwd(), 'cache', 'twitter_metrics.json');
    let twitterMetrics = {};
    try {
      const twitterData = await fs.readFile(twitterCachePath, 'utf8');
      twitterMetrics = JSON.parse(twitterData);
      console.log(`📁 Loaded Twitter metrics cache with ${Object.keys(twitterMetrics).length} entries`);
    } catch (error) {
      console.log('⚠️ Could not load Twitter metrics cache:', error.message);
    }
    
    console.log('');
    
    // Analyze Twitter data coverage
    const stats = {
      total: tokens.length,
      withTwitterData: 0,
      withoutTwitterData: 0,
      withMentions: 0,
      withFollowers: 0,
      withOfficialHandle: 0,
      withCommunityScore: 0,
      freshData: 0,
      staleData: 0,
      preservedData: 0,
      errorFallback: 0,
      jupiterEnhanced: 0,
      byFreshness: {},
      mentionRanges: {
        '0': 0,
        '1-10': 0,
        '11-50': 0,
        '51-100': 0,
        '100+': 0
      },
      communityScoreRanges: {
        '0-2': 0,
        '2-4': 0,
        '4-6': 0,
        '6-8': 0,
        '8-10': 0
      }
    };
    
    const detailedTokens = [];
    
    // Analyze each token
    for (const token of tokens) {
      const analysis = {
        symbol: token.symbol,
        name: token.name,
        hasTwitterData: !!token.twitterData,
        mentions: 0,
        followers: 0,
        communityScore: 0,
        officialHandle: 'N/A',
        dataFreshness: 'unknown',
        lastUpdated: 'never'
      };
      
      if (token.twitterData) {
        stats.withTwitterData++;
        analysis.mentions = token.twitterData.mentions || 0;
        analysis.followers = token.twitterData.followers || 0;
        analysis.officialHandle = token.twitterData.officialHandle || 'N/A';
        analysis.dataFreshness = token.twitterData._dataFreshness || 'unknown';
        analysis.lastUpdated = token.twitterData.lastUpdated || token.twitterTimestamp || 'unknown';
        
        // Count mentions
        if (analysis.mentions > 0) stats.withMentions++;
        
        // Count followers
        if (analysis.followers > 0) stats.withFollowers++;
        
        // Count official handles
        if (analysis.officialHandle && analysis.officialHandle !== 'N/A' && analysis.officialHandle !== 'not found') {
          stats.withOfficialHandle++;
        }
        
        // Mention ranges
        if (analysis.mentions === 0) stats.mentionRanges['0']++;
        else if (analysis.mentions <= 10) stats.mentionRanges['1-10']++;
        else if (analysis.mentions <= 50) stats.mentionRanges['11-50']++;
        else if (analysis.mentions <= 100) stats.mentionRanges['51-100']++;
        else stats.mentionRanges['100+']++;
        
        // Data freshness tracking
        const freshness = analysis.dataFreshness;
        stats.byFreshness[freshness] = (stats.byFreshness[freshness] || 0) + 1;
        
        if (freshness === 'fresh') stats.freshData++;
        else if (freshness.includes('preserved')) stats.preservedData++;
        else if (freshness.includes('error')) stats.errorFallback++;
        else if (freshness.includes('jupiter')) stats.jupiterEnhanced++;
        else stats.staleData++;
        
      } else {
        stats.withoutTwitterData++;
      }
      
      // Community score analysis
      const communityScore = token.communityHealthScore || token.communityScore || 0;
      analysis.communityScore = communityScore;
      
      if (communityScore > 0) stats.withCommunityScore++;
      
      // Community score ranges
      if (communityScore < 2) stats.communityScoreRanges['0-2']++;
      else if (communityScore < 4) stats.communityScoreRanges['2-4']++;
      else if (communityScore < 6) stats.communityScoreRanges['4-6']++;
      else if (communityScore < 8) stats.communityScoreRanges['6-8']++;
      else stats.communityScoreRanges['8-10']++;
      
      detailedTokens.push(analysis);
    }
    
    // Generate report
    console.log('📊 TWITTER DATA COVERAGE SUMMARY');
    console.log('-'.repeat(40));
    console.log(`Total Tokens: ${stats.total}`);
    console.log(`With Twitter Data: ${stats.withTwitterData} (${((stats.withTwitterData/stats.total)*100).toFixed(1)}%)`);
    console.log(`Without Twitter Data: ${stats.withoutTwitterData} (${((stats.withoutTwitterData/stats.total)*100).toFixed(1)}%)`);
    console.log('');
    
    console.log('📈 TWITTER ENGAGEMENT METRICS');
    console.log('-'.repeat(40));
    console.log(`Tokens with Mentions: ${stats.withMentions} (${((stats.withMentions/stats.total)*100).toFixed(1)}%)`);
    console.log(`Tokens with Followers: ${stats.withFollowers} (${((stats.withFollowers/stats.total)*100).toFixed(1)}%)`);
    console.log(`Tokens with Official Handle: ${stats.withOfficialHandle} (${((stats.withOfficialHandle/stats.total)*100).toFixed(1)}%)`);
    console.log(`Tokens with Community Score: ${stats.withCommunityScore} (${((stats.withCommunityScore/stats.total)*100).toFixed(1)}%)`);
    console.log('');
    
    console.log('📊 MENTION DISTRIBUTION');
    console.log('-'.repeat(40));
    Object.entries(stats.mentionRanges).forEach(([range, count]) => {
      const percent = ((count/stats.total)*100).toFixed(1);
      console.log(`${range.padEnd(8)}: ${count.toString().padStart(4)} tokens (${percent}%)`);
    });
    console.log('');
    
    console.log('🏆 COMMUNITY SCORE DISTRIBUTION');
    console.log('-'.repeat(40));
    Object.entries(stats.communityScoreRanges).forEach(([range, count]) => {
      const percent = ((count/stats.total)*100).toFixed(1);
      console.log(`${range.padEnd(8)}: ${count.toString().padStart(4)} tokens (${percent}%)`);
    });
    console.log('');
    
    console.log('🔄 DATA FRESHNESS BREAKDOWN');
    console.log('-'.repeat(40));
    console.log(`Fresh Data: ${stats.freshData} (${((stats.freshData/stats.total)*100).toFixed(1)}%)`);
    console.log(`Preserved Data: ${stats.preservedData} (${((stats.preservedData/stats.total)*100).toFixed(1)}%)`);
    console.log(`Jupiter Enhanced: ${stats.jupiterEnhanced} (${((stats.jupiterEnhanced/stats.total)*100).toFixed(1)}%)`);
    console.log(`Error Fallback: ${stats.errorFallback} (${((stats.errorFallback/stats.total)*100).toFixed(1)}%)`);
    console.log(`Other/Stale: ${stats.staleData} (${((stats.staleData/stats.total)*100).toFixed(1)}%)`);
    console.log('');
    
    console.log('📋 DETAILED FRESHNESS BREAKDOWN');
    console.log('-'.repeat(40));
    Object.entries(stats.byFreshness).forEach(([freshness, count]) => {
      const percent = ((count/stats.total)*100).toFixed(1);
      console.log(`${freshness.padEnd(25)}: ${count.toString().padStart(4)} (${percent}%)`);
    });
    console.log('');
    
    // Top tokens by mentions
    const topMentions = detailedTokens
      .filter(t => t.mentions > 0)
      .sort((a, b) => b.mentions - a.mentions)
      .slice(0, 10);
    
    console.log('🔥 TOP 10 TOKENS BY MENTIONS');
    console.log('-'.repeat(40));
    topMentions.forEach((token, i) => {
      console.log(`${(i+1).toString().padStart(2)}. ${token.symbol.padEnd(10)} - ${token.mentions.toString().padStart(4)} mentions`);
    });
    console.log('');
    
    // Tokens without Twitter data
    const noTwitterData = detailedTokens.filter(t => !t.hasTwitterData).slice(0, 10);
    
    console.log('⚠️  TOKENS WITHOUT TWITTER DATA (Sample)');
    console.log('-'.repeat(40));
    noTwitterData.forEach((token, i) => {
      console.log(`${(i+1).toString().padStart(2)}. ${token.symbol.padEnd(10)} - ${token.name}`);
    });
    console.log('');
    
    // Save detailed report
    const reportData = {
      generatedAt: new Date().toISOString(),
      summary: stats,
      tokens: detailedTokens
    };
    
    const reportPath = path.join(process.cwd(), 'cache', 'twitter-data-report.json');
    await fs.writeFile(reportPath, JSON.stringify(reportData, null, 2));
    console.log(`💾 Detailed report saved to: ${reportPath}`);
    
    console.log('');
    console.log('✅ Twitter Data Report Complete!');
    
  } catch (error) {
    console.error('❌ Error generating report:', error);
  }
}

// Run the report
generateTwitterDataReport().catch(console.error);
