import fs from 'fs/promises';
import path from 'path';

async function detailedTokenAnalysis() {
  try {
    console.log('🔍 DETAILED TOKEN ANALYSIS: NUB, FWOG, GIGA, UFD\n');

    // Load tokens from backend cache
    const tokensPath = path.join('backend', 'cache', 'tokens-cache.json');
    const tokensData = await fs.readFile(tokensPath, 'utf8');
    const tokens = JSON.parse(tokensData);

    // Target tokens to analyze
    const targetTokens = ['NUB', 'FWOG', 'GIGA', 'UFD'];
    
    console.log(`📊 Total tokens in cache: ${tokens.length}\n`);

    for (const targetSymbol of targetTokens) {
      const token = tokens.find(t => t.symbol === targetSymbol);
      
      if (!token) {
        console.log(`❌ ${targetSymbol}: Not found in cache\n`);
        continue;
      }

      console.log(`🎯 ===== ${targetSymbol} CALCULATION BREAKDOWN =====`);
      console.log(`📍 Name: ${token.name}`);
      console.log(`📍 Contract: ${token.contractAddress}`);
      
      // 1. OVERALL SCORE ANALYSIS
      console.log(`\n📊 OVERALL SCORE: ${token.overallScore || token.score || 0}/10`);
      console.log(`⚡ Enhanced Score: ${token.enhancedScore || 'N/A'}/10`);
      
      // 2. COMMUNITY SCORE ANALYSIS
      console.log(`\n🏆 COMMUNITY SCORE: ${token.communityScore || 0}/10`);
      
      // Check if Twitter data exists
      if (token.twitterData) {
        console.log(`✅ HAS TWITTER DATA:`);
        const twitter = token.twitterData;
        
        console.log(`   📊 Raw Twitter Metrics:`);
        console.log(`      • Mentions: ${twitter.mentions || 0}`);
        console.log(`      • 24h Mentions: ${twitter.mentions24h || 0}`);
        console.log(`      • Followers: ${twitter.followers || 0}`);
        console.log(`      • Engagement Rate: ${twitter.engagementRate || 0}`);
        console.log(`      • Recent Activity: ${twitter.recentActivity || 0}`);
        console.log(`      • Quality Indicators: ${twitter.qualityIndicators || 0}`);
        console.log(`      • Official Handle: ${twitter.officialHandle || 'None'}`);
        
        // Calculate community score components with NEW WEIGHTS
        console.log(`\n   🧮 Community Score Calculation (New Weights):`);
        const mentions = twitter.mentions || 0;
        const engagement = twitter.engagementRate || 0;
        const followers = twitter.followers || 0;
        const recentActivity = twitter.recentActivity || 0;
        const quality = twitter.qualityIndicators || 0;
        
        // New weights: Mentions 5%, Engagement 30%, Followers 5%, Recent Activity 50%, Quality 10%
        const mentionsComponent = Math.min(mentions / 100, 10) * 0.05;
        const engagementComponent = Math.min(engagement * 10, 10) * 0.30;
        const followersComponent = Math.min(Math.log10(followers + 1), 10) * 0.05;
        const activityComponent = Math.min(recentActivity * 10, 10) * 0.50;
        const qualityComponent = Math.min(quality * 10, 10) * 0.10;
        
        console.log(`      • Mentions (5%): ${mentions} → ${mentionsComponent.toFixed(3)}`);
        console.log(`      • Engagement (30%): ${engagement} → ${engagementComponent.toFixed(3)}`);
        console.log(`      • Followers (5%): ${followers} → ${followersComponent.toFixed(3)}`);
        console.log(`      • Recent Activity (50%): ${recentActivity} → ${activityComponent.toFixed(3)}`);
        console.log(`      • Quality (10%): ${quality} → ${qualityComponent.toFixed(3)}`);
        
        const calculatedCommunityScore = mentionsComponent + engagementComponent + followersComponent + activityComponent + qualityComponent;
        console.log(`      • CALCULATED TOTAL: ${calculatedCommunityScore.toFixed(3)}/10`);
        console.log(`      • STORED COMMUNITY SCORE: ${token.communityScore || 0}/10`);
        console.log(`      • DIFFERENCE: ${Math.abs(calculatedCommunityScore - (token.communityScore || 0)).toFixed(3)}`);
        
      } else {
        console.log(`❌ NO TWITTER DATA - Community Score defaults to 0`);
      }
      
      // 3. JUPITER DATA ANALYSIS
      if (token.jupiterData) {
        const jupiter = token.jupiterData;
        console.log(`\n🪐 JUPITER DATA CONTRIBUTION:`);
        console.log(`   • Market Cap: $${jupiter.marketCap || 'N/A'}`);
        console.log(`   • FDV: $${jupiter.fdv || 'N/A'}`);
        console.log(`   • Liquidity: $${jupiter.liquidity || 'N/A'}`);
        console.log(`   • Holder Count: ${jupiter.holderCount || 'N/A'}`);
        console.log(`   • Organic Score: ${jupiter.organicScore || 'N/A'}/10`);
        
        // Analyze how Jupiter data might contribute to overall score
        if (jupiter.organicScore) {
          console.log(`   📊 Jupiter Organic Score Analysis:`);
          console.log(`      • Raw Organic Score: ${jupiter.organicScore}`);
          console.log(`      • Normalized (0-10): ${Math.min(jupiter.organicScore / 10, 10).toFixed(2)}`);
        }
      } else {
        console.log(`\n❌ NO JUPITER DATA`);
      }
      
      // 4. OVERALL SCORE CALCULATION ANALYSIS
      console.log(`\n🎯 OVERALL SCORE CALCULATION ANALYSIS:`);
      console.log(`   Current Overall Score: ${token.overallScore || token.score || 0}/10`);
      
      // Try to reverse-engineer the calculation
      const communityScore = token.communityScore || 0;
      const jupiterOrganic = token.jupiterData?.organicScore ? Math.min(token.jupiterData.organicScore / 10, 10) : 0;
      
      console.log(`   📊 Potential Components:`);
      console.log(`      • Community Score (45%): ${communityScore} × 0.45 = ${(communityScore * 0.45).toFixed(2)}`);
      console.log(`      • Jupiter Organic (30%): ${jupiterOrganic.toFixed(2)} × 0.30 = ${(jupiterOrganic * 0.30).toFixed(2)}`);
      console.log(`      • Market Data (15%): ${token.technicalScore || 0} × 0.15 = ${((token.technicalScore || 0) * 0.15).toFixed(2)}`);
      console.log(`      • Volume/Trend (10%): ${token.volumeScore || 0} × 0.10 = ${((token.volumeScore || 0) * 0.10).toFixed(2)}`);
      
      const estimatedOverall = (communityScore * 0.45) + (jupiterOrganic * 0.30) + ((token.technicalScore || 0) * 0.15) + ((token.volumeScore || 0) * 0.10);
      console.log(`      • ESTIMATED TOTAL: ${estimatedOverall.toFixed(2)}/10`);
      console.log(`      • ACTUAL STORED: ${token.overallScore || token.score || 0}/10`);
      console.log(`      • DIFFERENCE: ${Math.abs(estimatedOverall - (token.overallScore || token.score || 0)).toFixed(2)}`);
      
      // 5. PROCESSING STATUS
      console.log(`\n🔧 PROCESSING STATUS:`);
      console.log(`   • Stage: ${token.stage || 'N/A'}`);
      console.log(`   • Last Updated: ${token.lastUpdated || 'N/A'}`);
      console.log(`   • Has Twitter Data: ${token.twitterData ? '✅ YES' : '❌ NO'}`);
      console.log(`   • Has Jupiter Data: ${token.jupiterData ? '✅ YES' : '❌ NO'}`);
      console.log(`   • Has Social Links: ${token.socials ? '✅ YES' : '❌ NO'}`);
      
      console.log(`\n${'='.repeat(80)}\n`);
    }

    // Summary Analysis
    console.log(`📋 SUMMARY ANALYSIS:`);
    console.log(`\n🔍 Key Findings:`);
    
    const analyzedTokens = targetTokens.map(symbol => tokens.find(t => t.symbol === symbol)).filter(Boolean);
    
    console.log(`   • All tokens have Jupiter data: ${analyzedTokens.every(t => t.jupiterData) ? '✅' : '❌'}`);
    console.log(`   • All tokens have Twitter data: ${analyzedTokens.every(t => t.twitterData) ? '✅' : '❌'}`);
    console.log(`   • All tokens completed processing: ${analyzedTokens.every(t => t.stage === 'completed') ? '✅' : '❌'}`);
    console.log(`   • All tokens have same overall score: ${new Set(analyzedTokens.map(t => t.overallScore || t.score)).size === 1 ? '✅' : '❌'}`);
    
    const avgCommunityScore = analyzedTokens.reduce((sum, t) => sum + (t.communityScore || 0), 0) / analyzedTokens.length;
    console.log(`   • Average Community Score: ${avgCommunityScore.toFixed(2)}/10`);
    
    const avgOverallScore = analyzedTokens.reduce((sum, t) => sum + (t.overallScore || t.score || 0), 0) / analyzedTokens.length;
    console.log(`   • Average Overall Score: ${avgOverallScore.toFixed(2)}/10`);

  } catch (error) {
    console.error('❌ Error analyzing tokens:', error.message);
  }
}

detailedTokenAnalysis();




