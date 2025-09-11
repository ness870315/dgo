#!/usr/bin/env node

/**
 * CHECK TOKENS UNDER 8K MARKET CAP
 * Analyze production cache for tokens under $8,000 market cap
 */

import fs from 'fs/promises';
import path from 'path';

async function checkTokensUnder8k() {
  console.log('🔍 TOKENS UNDER $8K MARKET CAP ANALYSIS');
  console.log('=' .repeat(60));
  
  try {
    // Check production API
    console.log('🌐 PRODUCTION API ANALYSIS:');
    const prodResponse = await fetch('https://api.degen-oracle.com/api/tokens');
    const prodTokens = await prodResponse.json();
    
    console.log(`📊 Total tokens in production: ${prodTokens.length}`);
    
    // Filter tokens under 8k market cap
    const tokensUnder8k = prodTokens.filter(token => {
      const mcap = token.jupiterData?.mcap || token.marketCap || 0;
      return mcap > 0 && mcap < 8000; // Under $8,000
    });
    
    console.log(`💰 Tokens under $8k: ${tokensUnder8k.length} (${((tokensUnder8k.length/prodTokens.length)*100).toFixed(1)}%)`);
    
    // Break down by market cap ranges
    const ranges = [
      { min: 0, max: 1000, label: 'Under $1k' },
      { min: 1000, max: 2000, label: '$1k - $2k' },
      { min: 2000, max: 4000, label: '$2k - $4k' },
      { min: 4000, max: 8000, label: '$4k - $8k' }
    ];
    
    console.log('');
    console.log('📈 MARKET CAP BREAKDOWN:');
    ranges.forEach(range => {
      const count = prodTokens.filter(token => {
        const mcap = token.jupiterData?.mcap || token.marketCap || 0;
        return mcap >= range.min && mcap < range.max;
      }).length;
      
      const percentage = ((count / prodTokens.length) * 100).toFixed(1);
      console.log(`   ${range.label}: ${count} tokens (${percentage}%)`);
    });
    
    // Show sample tokens under 8k
    console.log('');
    console.log('🎯 SAMPLE TOKENS UNDER $8K:');
    const sampleTokens = tokensUnder8k
      .sort((a, b) => (b.jupiterData?.mcap || 0) - (a.jupiterData?.mcap || 0))
      .slice(0, 10);
    
    sampleTokens.forEach((token, i) => {
      const mcap = token.jupiterData?.mcap || token.marketCap || 0;
      const price = token.jupiterData?.usdPrice || token.price || 0;
      const socialScore = token.communityHealthScore || 0;
      const overallScore = token.overallScore || token.score || 0;
      
      console.log(`   ${i+1}. ${token.symbol} - ${token.name}`);
      console.log(`      Market Cap: $${mcap.toLocaleString()}`);
      console.log(`      Price: $${price.toFixed(6)}`);
      console.log(`      Social Score: ${socialScore.toFixed(1)}/10`);
      console.log(`      Overall Score: ${overallScore.toFixed(1)}/10`);
      console.log('');
    });
    
    // Check social data coverage for tokens under 8k
    const withSocialData = tokensUnder8k.filter(token => 
      token.twitterData && token.communityHealthScore > 2
    ).length;
    
    console.log('📱 SOCIAL DATA COVERAGE (Under $8k):');
    console.log(`   With social data: ${withSocialData}/${tokensUnder8k.length} (${((withSocialData/tokensUnder8k.length)*100).toFixed(1)}%)`);
    
    // Check score distribution for tokens under 8k
    const scoreRanges = [
      { min: 0, max: 2, label: 'Low (0-2)' },
      { min: 2, max: 4, label: 'Below Average (2-4)' },
      { min: 4, max: 6, label: 'Average (4-6)' },
      { min: 6, max: 8, label: 'Good (6-8)' },
      { min: 8, max: 10, label: 'Excellent (8-10)' }
    ];
    
    console.log('');
    console.log('⭐ SCORE DISTRIBUTION (Under $8k):');
    scoreRanges.forEach(range => {
      const count = tokensUnder8k.filter(token => {
        const score = token.overallScore || token.score || 0;
        return score >= range.min && score < range.max;
      }).length;
      
      const percentage = tokensUnder8k.length > 0 ? ((count / tokensUnder8k.length) * 100).toFixed(1) : '0.0';
      console.log(`   ${range.label}: ${count} tokens (${percentage}%)`);
    });
    
    // Check if we have any high-scoring tokens under 8k
    const highScoringUnder8k = tokensUnder8k.filter(token => {
      const score = token.overallScore || token.score || 0;
      return score >= 7;
    });
    
    console.log('');
    console.log('🚀 HIGH-SCORING TOKENS UNDER $8K (Score ≥7):');
    console.log(`   Count: ${highScoringUnder8k.length}`);
    
    if (highScoringUnder8k.length > 0) {
      console.log('   Top performers:');
      highScoringUnder8k
        .sort((a, b) => (b.overallScore || b.score || 0) - (a.overallScore || a.score || 0))
        .slice(0, 5)
        .forEach((token, i) => {
          const mcap = token.jupiterData?.mcap || token.marketCap || 0;
          const score = token.overallScore || token.score || 0;
          console.log(`     ${i+1}. ${token.symbol} - $${mcap.toLocaleString()} (Score: ${score.toFixed(1)})`);
        });
    }
    
  } catch (error) {
    console.error('❌ Error analyzing tokens:', error.message);
  }
}

checkTokensUnder8k().catch(console.error);
