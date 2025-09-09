#!/usr/bin/env node

/**
 * Live Twitter Data Coverage Report
 * Analyzes Twitter data from the LIVE production API at api.degen-oracle.com
 */

import https from 'https';
import fs from 'fs/promises';

const API_BASE = 'https://api.degen-oracle.com';

async function fetchFromAPI(endpoint) {
  return new Promise((resolve, reject) => {
    const url = `${API_BASE}${endpoint}`;
    console.log(`🌐 Fetching: ${url}`);
    
    https.get(url, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          resolve(jsonData);
        } catch (error) {
          reject(new Error(`Failed to parse JSON: ${error.message}`));
        }
      });
    }).on('error', (error) => {
      reject(error);
    });
  });
}

async function generateLiveTwitterDataReport() {
  console.log('📊 LIVE TWITTER DATA COVERAGE REPORT');
  console.log('🌐 Source: api.degen-oracle.com (Production Render Deployment)');
  console.log('=' .repeat(70));
  
  try {
    // Fetch live tokens from production API
    console.log('🔄 Fetching live token data from production...');
    const tokens = await fetchFromAPI('/api/tokens');
    
    if (!Array.isArray(tokens)) {
      throw new Error('API did not return an array of tokens');
    }
    
    console.log(`📁 Loaded ${tokens.length} tokens from LIVE production API`);
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
      apiManagerBlocked: 0,
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
      },
      twitterTimestamps: {
        'last24h': 0,
        'last7d': 0,
        'last30d': 0,
        'older': 0,
        'never': 0
      }
    };
    
    const detailedTokens = [];
    const now = new Date();
    
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
        lastUpdated: 'never',
        blockReason: null,
        twitterTimestamp: null
      };
      
      if (token.twitterData) {
        stats.withTwitterData++;
        analysis.mentions = token.twitterData.mentions || 0;
        analysis.followers = token.twitterData.followers || 0;
        analysis.officialHandle = token.twitterData.officialHandle || 'N/A';
        analysis.dataFreshness = token.twitterData._dataFreshness || 'unknown';
        analysis.lastUpdated = token.twitterData.lastUpdated || token.twitterTimestamp || 'unknown';
        analysis.blockReason = token.twitterData._blockReason || null;
        analysis.twitterTimestamp = token.twitterTimestamp || token.twitterData.lastUpdated || null;
        
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
        else if (freshness.includes('api_manager_blocked')) stats.apiManagerBlocked++;
        else stats.staleData++;
        
        // Twitter timestamp analysis
        if (analysis.twitterTimestamp) {
          const twitterDate = new Date(analysis.twitterTimestamp);
          const hoursSince = (now - twitterDate) / (1000 * 60 * 60);
          
          if (hoursSince <= 24) stats.twitterTimestamps.last24h++;
          else if (hoursSince <= 168) stats.twitterTimestamps.last7d++; // 7 days
          else if (hoursSince <= 720) stats.twitterTimestamps.last30d++; // 30 days
          else stats.twitterTimestamps.older++;
        } else {
          stats.twitterTimestamps.never++;
        }
        
      } else {
        stats.withoutTwitterData++;
        stats.twitterTimestamps.never++;
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
    console.log('📊 LIVE TWITTER DATA COVERAGE SUMMARY');
    console.log('-'.repeat(50));
    console.log(`Total Tokens: ${stats.total}`);
    console.log(`With Twitter Data: ${stats.withTwitterData} (${((stats.withTwitterData/stats.total)*100).toFixed(1)}%)`);
    console.log(`Without Twitter Data: ${stats.withoutTwitterData} (${((stats.withoutTwitterData/stats.total)*100).toFixed(1)}%)`);
    console.log('');
    
    console.log('📈 TWITTER ENGAGEMENT METRICS');
    console.log('-'.repeat(50));
    console.log(`Tokens with Mentions: ${stats.withMentions} (${((stats.withMentions/stats.total)*100).toFixed(1)}%)`);
    console.log(`Tokens with Followers: ${stats.withFollowers} (${((stats.withFollowers/stats.total)*100).toFixed(1)}%)`);
    console.log(`Tokens with Official Handle: ${stats.withOfficialHandle} (${((stats.withOfficialHandle/stats.total)*100).toFixed(1)}%)`);
    console.log(`Tokens with Community Score: ${stats.withCommunityScore} (${((stats.withCommunityScore/stats.total)*100).toFixed(1)}%)`);
    console.log('');
    
    console.log('📊 MENTION DISTRIBUTION');
    console.log('-'.repeat(50));
    Object.entries(stats.mentionRanges).forEach(([range, count]) => {
      const percent = ((count/stats.total)*100).toFixed(1);
      console.log(`${range.padEnd(8)}: ${count.toString().padStart(4)} tokens (${percent}%)`);
    });
    console.log('');
    
    console.log('🏆 COMMUNITY SCORE DISTRIBUTION');
    console.log('-'.repeat(50));
    Object.entries(stats.communityScoreRanges).forEach(([range, count]) => {
      const percent = ((count/stats.total)*100).toFixed(1);
      console.log(`${range.padEnd(8)}: ${count.toString().padStart(4)} tokens (${percent}%)`);
    });
    console.log('');
    
    console.log('🔄 DATA FRESHNESS BREAKDOWN');
    console.log('-'.repeat(50));
    console.log(`Fresh Data: ${stats.freshData} (${((stats.freshData/stats.total)*100).toFixed(1)}%)`);
    console.log(`Preserved Data: ${stats.preservedData} (${((stats.preservedData/stats.total)*100).toFixed(1)}%)`);
    console.log(`API Manager Blocked: ${stats.apiManagerBlocked} (${((stats.apiManagerBlocked/stats.total)*100).toFixed(1)}%)`);
    console.log(`Jupiter Enhanced: ${stats.jupiterEnhanced} (${((stats.jupiterEnhanced/stats.total)*100).toFixed(1)}%)`);
    console.log(`Error Fallback: ${stats.errorFallback} (${((stats.errorFallback/stats.total)*100).toFixed(1)}%)`);
    console.log(`Other/Stale: ${stats.staleData} (${((stats.staleData/stats.total)*100).toFixed(1)}%)`);
    console.log('');
    
    console.log('⏰ TWITTER DATA FRESHNESS (by timestamp)');
    console.log('-'.repeat(50));
    Object.entries(stats.twitterTimestamps).forEach(([period, count]) => {
      const percent = ((count/stats.total)*100).toFixed(1);
      console.log(`${period.padEnd(12)}: ${count.toString().padStart(4)} tokens (${percent}%)`);
    });
    console.log('');
    
    console.log('📋 DETAILED FRESHNESS BREAKDOWN');
    console.log('-'.repeat(50));
    Object.entries(stats.byFreshness).forEach(([freshness, count]) => {
      const percent = ((count/stats.total)*100).toFixed(1);
      console.log(`${freshness.padEnd(30)}: ${count.toString().padStart(4)} (${percent}%)`);
    });
    console.log('');
    
    // Top tokens by mentions
    const topMentions = detailedTokens
      .filter(t => t.mentions > 0)
      .sort((a, b) => b.mentions - a.mentions)
      .slice(0, 10);
    
    console.log('🔥 TOP 10 TOKENS BY MENTIONS');
    console.log('-'.repeat(50));
    topMentions.forEach((token, i) => {
      const freshness = token.dataFreshness === 'unknown' ? '' : ` [${token.dataFreshness}]`;
      console.log(`${(i+1).toString().padStart(2)}. ${token.symbol.padEnd(10)} - ${token.mentions.toString().padStart(4)} mentions${freshness}`);
    });
    console.log('');
    
    // Tokens with API manager blocks
    const blockedTokens = detailedTokens.filter(t => t.blockReason).slice(0, 10);
    
    if (blockedTokens.length > 0) {
      console.log('🚨 TOKENS BLOCKED BY API MANAGER (Sample)');
      console.log('-'.repeat(50));
      blockedTokens.forEach((token, i) => {
        console.log(`${(i+1).toString().padStart(2)}. ${token.symbol.padEnd(10)} - ${token.blockReason}`);
      });
      console.log('');
    }
    
    // Tokens without Twitter data
    const noTwitterData = detailedTokens.filter(t => !t.hasTwitterData).slice(0, 10);
    
    if (noTwitterData.length > 0) {
      console.log('⚠️  TOKENS WITHOUT TWITTER DATA (Sample)');
      console.log('-'.repeat(50));
      noTwitterData.forEach((token, i) => {
        console.log(`${(i+1).toString().padStart(2)}. ${token.symbol.padEnd(10)} - ${token.name}`);
      });
      console.log('');
    }
    
    // Save detailed report
    const reportData = {
      source: 'LIVE Production API (api.degen-oracle.com)',
      generatedAt: new Date().toISOString(),
      summary: stats,
      tokens: detailedTokens
    };
    
    const reportPath = './cache/live-twitter-data-report.json';
    await fs.writeFile(reportPath, JSON.stringify(reportData, null, 2));
    console.log(`💾 Detailed LIVE report saved to: ${reportPath}`);
    
    console.log('');
    console.log('✅ LIVE Twitter Data Report Complete!');
    console.log(`🌐 Data source: ${API_BASE}/api/tokens`);
    
  } catch (error) {
    console.error('❌ Error generating LIVE report:', error.message);
    if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
      console.error('🌐 Network issue: Cannot reach api.degen-oracle.com');
      console.error('   - Check if the production server is running');
      console.error('   - Verify the API endpoint is accessible');
    }
  }
}

// Run the live report
generateLiveTwitterDataReport().catch(console.error);



