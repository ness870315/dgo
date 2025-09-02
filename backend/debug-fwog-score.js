import EnhancedScoringAlgorithm from './enhancedScoringAlgorithm.js';
import axios from 'axios';

/**
 * DEBUG FWOG OVERALL SCORE CALCULATION
 * Get actual FWOG data and show detailed score breakdown
 */
async function debugFwogScore() {
  console.log('🔍 DEBUGGING FWOG OVERALL SCORE CALCULATION');
  console.log('=' .repeat(60));

  try {
    // Get FWOG data from the backend API
    console.log('📡 Fetching FWOG data from backend...');
    const response = await axios.get('http://localhost:4000/api/tokens');
    const tokens = response.data.tokens || response.data;
    
    const fwog = tokens.find(token => token.symbol === 'FWOG');
    
    if (!fwog) {
      console.log('❌ FWOG not found in token list');
      return;
    }

    console.log('\n📊 FWOG RAW DATA:');
    console.log('================');
    console.log(`Symbol: ${fwog.symbol}`);
    console.log(`Name: ${fwog.name}`);
    console.log(`Market Cap: $${(fwog.marketCap || fwog.mcap || 0).toLocaleString()}`);
    console.log(`Price: $${fwog.price || fwog.usdPrice || 'N/A'}`);
    console.log(`Volume 24h: $${(fwog.volume24h || 0).toLocaleString()}`);
    console.log(`Volume 1h: $${(fwog.volume1h || 0).toLocaleString()}`);
    console.log(`Price Change 6h: ${fwog.priceChange6h || fwog.stats6h?.priceChangePercentage || 'N/A'}%`);
    console.log(`Liquidity: $${(fwog.liquidity || 0).toLocaleString()}`);
    console.log(`Holder Count: ${(fwog.holderCount || 0).toLocaleString()}`);
    console.log(`Overall Score: ${fwog.overallScore || 'N/A'}`);
    
    // Show Jupiter data if available
    if (fwog.jupiterData || fwog.stats1h || fwog.stats6h || fwog.stats24h) {
      console.log('\n📈 JUPITER DATA:');
      console.log('================');
      console.log(`Stats 1h:`, fwog.stats1h || 'N/A');
      console.log(`Stats 6h:`, fwog.stats6h || 'N/A');
      console.log(`Stats 24h:`, fwog.stats24h || 'N/A');
      console.log(`Organic Score: ${fwog.organicScore || 'N/A'}`);
      console.log(`Buy Volume 24h: $${(fwog.buyOrganicVolume24h || 0).toLocaleString()}`);
      console.log(`Sell Volume 24h: $${(fwog.sellOrganicVolume24h || 0).toLocaleString()}`);
    }

    // Show Twitter data
    if (fwog.twitterData) {
      console.log('\n🐦 TWITTER DATA:');
      console.log('================');
      console.log(`Mentions: ${fwog.twitterData.mentions || 0}`);
      console.log(`Likes: ${fwog.twitterData.likes || 0}`);
      console.log(`Retweets: ${fwog.twitterData.retweets || 0}`);
      console.log(`Replies: ${fwog.twitterData.replies || 0}`);
      console.log(`Followers: ${fwog.twitterData.followers || 0}`);
      console.log(`Community Health Score: ${fwog.twitterData.communityHealthScore || 'N/A'}`);
    }

    // Now calculate the enhanced score step by step
    console.log('\n🧮 DETAILED SCORE CALCULATION:');
    console.log('==============================');
    
    const scoringAlgorithm = new EnhancedScoringAlgorithm();
    
    // Calculate each component manually to show the breakdown
    const marketTierScore = scoringAlgorithm.calculateMarketTierScore(fwog);
    const volume1hScore = scoringAlgorithm.calculateVolume1hScore(fwog);
    const volume24hScore = scoringAlgorithm.calculateVolume24hScore(fwog);
    const priceChange6hScore = scoringAlgorithm.calculatePriceChange6hScore(fwog);
    const organicVolumeRatio = scoringAlgorithm.calculateOrganicVolumeRatio(fwog);
    const uniquenessFactor = scoringAlgorithm.calculateUniquenessFactor(fwog.symbol, fwog);
    
    console.log(`\n📊 COMPONENT SCORES:`);
    console.log(`Market Tier (5%): ${marketTierScore.toFixed(2)}/10`);
    console.log(`Volume 1h (10%): ${volume1hScore.toFixed(2)}/10`);
    console.log(`Volume 24h (15%): ${volume24hScore.toFixed(2)}/10`);
    console.log(`Price Change 6h (10%): ${priceChange6hScore.toFixed(2)}/10`);
    console.log(`Organic Volume Ratio (10%): ${organicVolumeRatio.toFixed(2)}/10`);
    console.log(`Uniqueness Factor (5%): ${uniquenessFactor.toFixed(2)}/10`);
    console.log(`Community Health (45%): ${fwog.twitterData?.communityHealthScore || 'Calculating...'}/10`);

    // Calculate weighted contributions
    console.log(`\n⚖️ WEIGHTED CONTRIBUTIONS:`);
    console.log(`Market Tier: ${marketTierScore.toFixed(2)} × 5% = ${(marketTierScore * 0.05).toFixed(3)}`);
    console.log(`Volume 1h: ${volume1hScore.toFixed(2)} × 10% = ${(volume1hScore * 0.10).toFixed(3)}`);
    console.log(`Volume 24h: ${volume24hScore.toFixed(2)} × 15% = ${(volume24hScore * 0.15).toFixed(3)}`);
    console.log(`Price Change 6h: ${priceChange6hScore.toFixed(2)} × 10% = ${(priceChange6hScore * 0.10).toFixed(3)}`);
    console.log(`Organic Volume Ratio: ${organicVolumeRatio.toFixed(2)} × 10% = ${(organicVolumeRatio * 0.10).toFixed(3)}`);
    console.log(`Uniqueness Factor: ${uniquenessFactor.toFixed(2)} × 5% = ${(uniquenessFactor * 0.05).toFixed(3)}`);
    
    const communityHealthScore = fwog.twitterData?.communityHealthScore || 8.3;
    console.log(`Community Health: ${communityHealthScore.toFixed(2)} × 45% = ${(communityHealthScore * 0.45).toFixed(3)}`);

    // Calculate total
    const totalScore = (marketTierScore * 0.05) + 
                      (volume1hScore * 0.10) + 
                      (volume24hScore * 0.15) + 
                      (priceChange6hScore * 0.10) + 
                      (organicVolumeRatio * 0.10) + 
                      (uniquenessFactor * 0.05) + 
                      (communityHealthScore * 0.45);

    console.log(`\n🏆 CALCULATED TOTAL: ${totalScore.toFixed(2)}/10`);
    console.log(`🏆 BACKEND REPORTED: ${fwog.overallScore || 'N/A'}/10`);
    
    if (Math.abs(totalScore - (fwog.overallScore || 0)) > 0.1) {
      console.log(`⚠️ DISCREPANCY DETECTED! Difference: ${Math.abs(totalScore - (fwog.overallScore || 0)).toFixed(2)}`);
    }

    // Show what's dragging the score down
    console.log(`\n🔍 ANALYSIS:`);
    console.log(`Strongest Component: Community Health (${(communityHealthScore * 0.45).toFixed(3)} points)`);
    
    const components = [
      { name: 'Market Tier', score: marketTierScore * 0.05 },
      { name: 'Volume 1h', score: volume1hScore * 0.10 },
      { name: 'Volume 24h', score: volume24hScore * 0.15 },
      { name: 'Price Change 6h', score: priceChange6hScore * 0.10 },
      { name: 'Organic Volume Ratio', score: organicVolumeRatio * 0.10 },
      { name: 'Uniqueness Factor', score: uniquenessFactor * 0.05 }
    ];
    
    const weakestComponent = components.reduce((min, comp) => comp.score < min.score ? comp : min);
    console.log(`Weakest Component: ${weakestComponent.name} (${weakestComponent.score.toFixed(3)} points)`);

  } catch (error) {
    console.error('❌ Debug failed:', error);
    console.error('Stack:', error.stack);
  }
}

debugFwogScore();




