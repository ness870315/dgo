import fs from 'fs/promises';
import EnhancedTokenProcessor from './enhancedTokenProcessor.js';

/**
 * Test the new organic volume ratio calculation
 */
async function testOrganicVolumeCalculation() {
  console.log('🔍 TESTING ORGANIC VOLUME RATIO CALCULATION');
  console.log('=' .repeat(50));

  try {
    // Load tokens from cache
    console.log('📡 Loading tokens from cache...');
    const cacheData = await fs.readFile('./cache/tokens-cache.json', 'utf8');
    const tokens = JSON.parse(cacheData);
    
    console.log(`✅ Loaded ${tokens.length} tokens`);

    // Initialize processor
    const processor = new EnhancedTokenProcessor();

    // Find tokens with organic volume data
    const tokensWithOrganicData = tokens.filter(token => 
      token.jupiterData?.stats24h?.buyOrganicVolume !== undefined ||
      token.jupiterData?.stats24h?.sellOrganicVolume !== undefined
    );

    console.log(`🪐 Tokens with organic volume data: ${tokensWithOrganicData.length}`);

    // Test organic volume calculation for top tokens
    console.log('\n📊 ORGANIC VOLUME RATIO ANALYSIS:');
    console.log('=================================');

    const testTokens = tokensWithOrganicData.slice(0, 10);
    
    testTokens.forEach((token, index) => {
      const organicBuyVolume = token.jupiterData?.stats24h?.buyOrganicVolume || 0;
      const organicSellVolume = token.jupiterData?.stats24h?.sellOrganicVolume || 0;
      const totalBuyVolume = token.jupiterData?.stats24h?.buyVolume || 0;
      const totalSellVolume = token.jupiterData?.stats24h?.sellVolume || 0;
      
      const totalOrganicVolume = organicBuyVolume + organicSellVolume;
      const totalVolume = totalBuyVolume + totalSellVolume;
      
      const organicRatio = totalVolume > 0 ? (totalOrganicVolume / totalVolume) : 0;
      const organicScore = processor.calculateOrganicVolumeRatio(token);
      
      console.log(`\n${index + 1}. ${token.symbol} (${token.name}):`);
      console.log(`   Total Volume: $${totalVolume.toLocaleString()}`);
      console.log(`   Organic Volume: $${totalOrganicVolume.toLocaleString()}`);
      console.log(`   Organic Ratio: ${(organicRatio * 100).toFixed(1)}%`);
      console.log(`   Organic Score: ${organicScore.toFixed(1)}/10`);
      
      // Show breakdown
      console.log(`   Breakdown:`);
      console.log(`     Buy Volume: $${totalBuyVolume.toLocaleString()} (Organic: $${organicBuyVolume.toLocaleString()})`);
      console.log(`     Sell Volume: $${totalSellVolume.toLocaleString()} (Organic: $${organicSellVolume.toLocaleString()})`);
    });

    // Show organic ratio distribution
    console.log('\n📈 ORGANIC RATIO DISTRIBUTION:');
    console.log('==============================');
    
    const organicRatios = tokensWithOrganicData.map(token => {
      const organicBuyVolume = token.jupiterData?.stats24h?.buyOrganicVolume || 0;
      const organicSellVolume = token.jupiterData?.stats24h?.sellOrganicVolume || 0;
      const totalBuyVolume = token.jupiterData?.stats24h?.buyVolume || 0;
      const totalSellVolume = token.jupiterData?.stats24h?.sellVolume || 0;
      
      const totalOrganicVolume = organicBuyVolume + organicSellVolume;
      const totalVolume = totalBuyVolume + totalSellVolume;
      
      return totalVolume > 0 ? (totalOrganicVolume / totalVolume) : 0;
    });

    const ranges = {
      '80-100%': organicRatios.filter(r => r >= 0.8).length,
      '60-80%': organicRatios.filter(r => r >= 0.6 && r < 0.8).length,
      '40-60%': organicRatios.filter(r => r >= 0.4 && r < 0.6).length,
      '20-40%': organicRatios.filter(r => r >= 0.2 && r < 0.4).length,
      '10-20%': organicRatios.filter(r => r >= 0.1 && r < 0.2).length,
      '0-10%': organicRatios.filter(r => r >= 0 && r < 0.1).length
    };

    Object.entries(ranges).forEach(([range, count]) => {
      const percentage = ((count / tokensWithOrganicData.length) * 100).toFixed(1);
      console.log(`   ${range} organic: ${count} tokens (${percentage}%)`);
    });

    // Show score distribution
    console.log('\n🎯 ORGANIC SCORE DISTRIBUTION:');
    console.log('==============================');
    
    const organicScores = tokensWithOrganicData.map(token => 
      processor.calculateOrganicVolumeRatio(token)
    );

    const scoreRanges = {
      '9-10': organicScores.filter(s => s >= 9).length,
      '7-9': organicScores.filter(s => s >= 7 && s < 9).length,
      '5-7': organicScores.filter(s => s >= 5 && s < 7).length,
      '3-5': organicScores.filter(s => s >= 3 && s < 5).length,
      '1-3': organicScores.filter(s => s >= 1 && s < 3).length
    };

    Object.entries(scoreRanges).forEach(([range, count]) => {
      const percentage = ((count / tokensWithOrganicData.length) * 100).toFixed(1);
      console.log(`   Score ${range}: ${count} tokens (${percentage}%)`);
    });

    console.log('\n💡 INSIGHTS:');
    console.log('============');
    const avgOrganicRatio = organicRatios.reduce((a, b) => a + b, 0) / organicRatios.length;
    const avgOrganicScore = organicScores.reduce((a, b) => a + b, 0) / organicScores.length;
    
    console.log(`Average Organic Ratio: ${(avgOrganicRatio * 100).toFixed(1)}%`);
    console.log(`Average Organic Score: ${avgOrganicScore.toFixed(1)}/10`);
    
    const highOrganicTokens = tokensWithOrganicData.filter(token => {
      const organicScore = processor.calculateOrganicVolumeRatio(token);
      return organicScore >= 8.0;
    });
    
    console.log(`Tokens with high organic scores (8+): ${highOrganicTokens.length}`);
    
    if (highOrganicTokens.length > 0) {
      console.log('\n🏆 TOP ORGANIC TOKENS:');
      console.log('======================');
      highOrganicTokens.slice(0, 5).forEach(token => {
        const organicScore = processor.calculateOrganicVolumeRatio(token);
        console.log(`   ${token.symbol}: ${organicScore.toFixed(1)}/10`);
      });
    }

  } catch (error) {
    console.error('❌ Error testing organic volume calculation:', error);
    console.error('Stack:', error.stack);
  }
}

testOrganicVolumeCalculation();




