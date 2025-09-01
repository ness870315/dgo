import fs from 'fs/promises';
import path from 'path';

async function analyzeTokenCalculations() {
  try {
    console.log('🔍 Analyzing Token Calculations for NUB, FWOG, GIGA, UFD...\n');

    // Load tokens from backend cache
    const tokensPath = path.join('backend', 'cache', 'tokens-cache.json');
    const tokensData = await fs.readFile(tokensPath, 'utf8');
    const tokens = JSON.parse(tokensData);

    // Target tokens to analyze
    const targetTokens = ['NUB', 'FWOG', 'GIGA', 'UFD'];
    
    console.log(`📊 Found ${tokens.length} total tokens in cache\n`);

    for (const targetSymbol of targetTokens) {
      const token = tokens.find(t => t.symbol === targetSymbol);
      
      if (!token) {
        console.log(`❌ ${targetSymbol}: Not found in cache\n`);
        continue;
      }

      console.log(`🎯 ===== ${targetSymbol} (${token.name}) =====`);
      console.log(`📍 Contract Address: ${token.contractAddress || 'N/A'}`);
      
      // Overall Score
      console.log(`\n📊 OVERALL SCORE: ${token.overallScore || token.score || 0}/10`);
      
      // Community Score Breakdown
      if (token.communityScore !== undefined) {
        console.log(`\n🏆 COMMUNITY SCORE: ${token.communityScore}/10 (45% weight in overall)`);
        
        if (token.twitterData) {
          const twitter = token.twitterData;
          console.log(`\n🐦 TWITTER DATA:`);
          console.log(`   • Mentions: ${twitter.mentions || 0}`);
          console.log(`   • 24h Mentions: ${twitter.mentions24h || 0}`);
          console.log(`   • Followers: ${twitter.followers || 0}`);
          console.log(`   • Engagement Rate: ${twitter.engagementRate || 0}`);
          console.log(`   • Recent Activity: ${twitter.recentActivity || 0}`);
          console.log(`   • Quality Indicators: ${twitter.qualityIndicators || 0}`);
          console.log(`   • Official Handle: ${twitter.officialHandle || 'N/A'}`);
          console.log(`   • Recent Mentions Count: ${twitter.recentMentions?.length || 0}`);
          
          // Community Score Components (New Weights)
          console.log(`\n🧮 COMMUNITY SCORE COMPONENTS:`);
          const mentions = twitter.mentions || 0;
          const engagement = twitter.engagementRate || 0;
          const followers = twitter.followers || 0;
          const recentActivity = twitter.recentActivity || 0;
          const quality = twitter.qualityIndicators || 0;
          
          // New weights: Mentions 5%, Engagement 30%, Followers 5%, Recent Activity 50%, Quality 10%
          const mentionsScore = Math.min(mentions / 100, 10) * 0.05;
          const engagementScore = Math.min(engagement * 10, 10) * 0.30;
          const followersScore = Math.min(Math.log10(followers + 1), 10) * 0.05;
          const activityScore = Math.min(recentActivity * 10, 10) * 0.50;
          const qualityScore = Math.min(quality * 10, 10) * 0.10;
          
          console.log(`   • Mentions Component: ${mentionsScore.toFixed(2)} (${mentions} mentions × 5%)`);
          console.log(`   • Engagement Component: ${engagementScore.toFixed(2)} (${engagement} rate × 30%)`);
          console.log(`   • Followers Component: ${followersScore.toFixed(2)} (${followers} followers × 5%)`);
          console.log(`   • Recent Activity Component: ${activityScore.toFixed(2)} (${recentActivity} activity × 50%)`);
          console.log(`   • Quality Component: ${qualityScore.toFixed(2)} (${quality} quality × 10%)`);
          
          const calculatedCommunityScore = mentionsScore + engagementScore + followersScore + activityScore + qualityScore;
          console.log(`   • Calculated Total: ${calculatedCommunityScore.toFixed(2)}/10`);
          console.log(`   • Stored Community Score: ${token.communityScore}/10`);
        }
      }
      
      // Jupiter Data
      if (token.jupiterData) {
        const jupiter = token.jupiterData;
        console.log(`\n🪐 JUPITER DATA:`);
        console.log(`   • Market Cap: $${jupiter.marketCap || 'N/A'}`);
        console.log(`   • Price: $${jupiter.usdPrice || 'N/A'}`);
        console.log(`   • Liquidity: $${jupiter.liquidity || 'N/A'}`);
        console.log(`   • Holder Count: ${jupiter.holderCount || 'N/A'}`);
        console.log(`   • Volume 24h: $${jupiter.volume24h || 'N/A'}`);
        console.log(`   • FDV: $${jupiter.fdv || 'N/A'}`);
        console.log(`   • Organic Score: ${jupiter.organicScore || 'N/A'}/10`);
        
        if (jupiter.stats24h) {
          console.log(`\n📈 24H STATS:`);
          console.log(`   • Price Change: ${jupiter.stats24h.priceChangePercentage || 0}%`);
          console.log(`   • Holder Change: ${jupiter.stats24h.holderChange || 0}%`);
          console.log(`   • Liquidity Change: ${jupiter.stats24h.liquidityChange || 0}%`);
          console.log(`   • Volume Change: ${jupiter.stats24h.volumeChange || 0}%`);
        }
      }
      
      // Other Score Components
      console.log(`\n🎯 OTHER SCORE COMPONENTS:`);
      console.log(`   • Sentiment Score: ${token.sentimentScore || 0}/10`);
      console.log(`   • Technical Score: ${token.technicalScore || 0}/10`);
      console.log(`   • Volume Score: ${token.volumeScore || 0}/10`);
      console.log(`   • Trending Score: ${token.trendingScore || 0}/10`);
      console.log(`   • Risk Level: ${token.riskLevel || 'N/A'}`);
      
      // Enhanced Score Calculation (if available)
      if (token.enhancedScore !== undefined) {
        console.log(`\n⚡ ENHANCED SCORE: ${token.enhancedScore}/10`);
      }
      
      // Social Links
      if (token.socials) {
        console.log(`\n🔗 SOCIAL LINKS:`);
        Object.entries(token.socials).forEach(([platform, link]) => {
          console.log(`   • ${platform}: ${link}`);
        });
      }
      
      // Processing Info
      console.log(`\n🔧 PROCESSING INFO:`);
      console.log(`   • Stage: ${token.stage || 'N/A'}`);
      console.log(`   • Last Updated: ${token.lastUpdated || 'N/A'}`);
      console.log(`   • Calculation Time: ${token.calculationTime || 'N/A'}ms`);
      
      console.log(`\n${'='.repeat(60)}\n`);
    }

  } catch (error) {
    console.error('❌ Error analyzing tokens:', error.message);
  }
}

analyzeTokenCalculations();
