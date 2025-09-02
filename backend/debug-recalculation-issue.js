import EnhancedTokenProcessor from './enhancedTokenProcessor.js';
import fs from 'fs/promises';

/**
 * DEBUG RECALCULATION ISSUE
 * Find out why FWOG's score isn't changing during recalculation
 */
async function debugRecalculationIssue() {
  console.log('🔍 DEBUGGING RECALCULATION ISSUE');
  console.log('=' .repeat(50));

  try {
    // 1. Load FWOG from cache
    console.log('📡 Loading FWOG from cache...');
    const cacheData = await fs.readFile('./cache/tokens-cache.json', 'utf8');
    const tokens = JSON.parse(cacheData);
    const fwog = tokens.find(token => token.symbol === 'FWOG');
    
    if (!fwog) {
      console.log('❌ FWOG not found in cache');
      return;
    }

    console.log(`✅ Found FWOG with current overallScore: ${fwog.overallScore}`);

    // 2. Show FWOG's current data structure
    console.log('\n📊 FWOG CURRENT DATA STRUCTURE:');
    console.log('===============================');
    console.log(`communityHealthScore: ${fwog.communityHealthScore}`);
    console.log(`twitterData.mentions: ${fwog.twitterData?.mentions}`);
    console.log(`coingeckoData exists: ${!!fwog.coingeckoData}`);
    console.log(`jupiterData exists: ${!!fwog.jupiterData}`);
    
    if (fwog.coingeckoData) {
      console.log(`coingeckoData.marketCap: ${fwog.coingeckoData.marketCap}`);
      console.log(`coingeckoData.volume24h: ${fwog.coingeckoData.volume24h}`);
      console.log(`coingeckoData.priceChange24h: ${fwog.coingeckoData.priceChange24h}`);
    }
    
    if (fwog.jupiterData) {
      console.log(`jupiterData.volume1h: ${fwog.jupiterData.volume1h}`);
      console.log(`jupiterData.mcap: ${fwog.jupiterData.mcap}`);
    }

    // 3. Initialize processor and test calculation
    console.log('\n🔧 TESTING CALCULATION:');
    console.log('=======================');
    const processor = new EnhancedTokenProcessor();
    
    // Test each component step by step
    console.log('\n📊 COMPONENT BREAKDOWN:');
    
    // Market Tier - uses coingeckoData.marketCap
    const marketCapValue = fwog.coingeckoData?.marketCap;
    console.log(`Market Cap Value: ${marketCapValue}`);
    const marketTier = processor.calculateMarketTier(marketCapValue);
    console.log(`Market Tier Score: ${marketTier}`);
    
    // Volume 1h - uses jupiterData.volume1h
    const volume1hValue = fwog.jupiterData?.volume1h || 0;
    console.log(`Volume 1h Value: ${volume1hValue}`);
    const volume1h = processor.calculateVolumeScore(volume1hValue);
    console.log(`Volume 1h Score: ${volume1h}`);
    
    // Volume 24h - uses coingeckoData.volume24h
    const volume24hValue = fwog.coingeckoData?.volume24h || 0;
    console.log(`Volume 24h Value: ${volume24hValue}`);
    const volume24h = processor.calculateVolumeScore(volume24hValue);
    console.log(`Volume 24h Score: ${volume24h}`);
    
    // Price Change - uses coingeckoData.priceChange24h
    const priceChangeValue = fwog.coingeckoData?.priceChange24h || 0;
    console.log(`Price Change Value: ${priceChangeValue}`);
    const priceChange = processor.calculatePriceChangeScore(priceChangeValue);
    console.log(`Price Change Score: ${priceChange}`);
    
    // Community Health - uses communityHealthScore
    const communityHealth = fwog.communityHealthScore || 5.0;
    console.log(`Community Health Value: ${communityHealth}`);
    
    // 4. Manual calculation
    console.log('\n🧮 MANUAL CALCULATION:');
    console.log('======================');
    let manualScore = 0;
    manualScore += marketTier * 0.05;
    manualScore += volume1h * 0.10;
    manualScore += volume24h * 0.15;
    manualScore += priceChange * 0.10;
    manualScore += 5.0 * 0.10; // organic ratio (hardcoded)
    manualScore += communityHealth * 0.45;
    manualScore += 5.0 * 0.05; // uniqueness (hardcoded)
    
    console.log(`Market Tier: ${marketTier} × 5% = ${(marketTier * 0.05).toFixed(3)}`);
    console.log(`Volume 1h: ${volume1h} × 10% = ${(volume1h * 0.10).toFixed(3)}`);
    console.log(`Volume 24h: ${volume24h} × 15% = ${(volume24h * 0.15).toFixed(3)}`);
    console.log(`Price Change: ${priceChange} × 10% = ${(priceChange * 0.10).toFixed(3)}`);
    console.log(`Organic Ratio: 5.0 × 10% = 0.500`);
    console.log(`Community Health: ${communityHealth} × 45% = ${(communityHealth * 0.45).toFixed(3)}`);
    console.log(`Uniqueness: 5.0 × 5% = 0.250`);
    
    const finalScore = Math.min(manualScore, 10);
    console.log(`\n🏆 MANUAL TOTAL: ${finalScore.toFixed(2)}`);
    
    // 5. Test the actual backend method
    console.log('\n🔧 BACKEND METHOD TEST:');
    console.log('=======================');
    const backendScore = processor.calculateEnhancedOverallScore(fwog);
    console.log(`Backend Method Result: ${backendScore.toFixed(2)}`);
    
    // 6. Compare with stored score
    console.log('\n📊 COMPARISON:');
    console.log('==============');
    console.log(`Stored Score: ${fwog.overallScore}`);
    console.log(`Manual Calculation: ${finalScore.toFixed(2)}`);
    console.log(`Backend Method: ${backendScore.toFixed(2)}`);
    
    if (Math.abs(backendScore - fwog.overallScore) < 0.01) {
      console.log('✅ Backend method matches stored score - no recalculation happening');
      console.log('🔍 ISSUE: The backend method is returning the same score as stored');
      console.log('💡 SOLUTION: The method might be reading from cache instead of calculating');
    } else {
      console.log('❌ Backend method differs from stored score');
      console.log('🔍 ISSUE: Calculation works but not being saved properly');
    }
    
    // 7. Check if there's a caching mechanism in the processor
    console.log('\n🔍 CHECKING FOR CACHING ISSUES:');
    console.log('===============================');
    
    // Look for any score caching in the token object
    const scoreFields = Object.keys(fwog).filter(key => 
      key.toLowerCase().includes('score')
    );
    
    console.log('All score fields in FWOG:');
    scoreFields.forEach(field => {
      console.log(`   ${field}: ${fwog[field]}`);
    });
    
    // 8. Test if the issue is in the calculation method itself
    console.log('\n🧪 TESTING CALCULATION METHOD INTERNALS:');
    console.log('========================================');
    
    // Check if calculateEnhancedOverallScore is using cached values
    console.log('Testing with modified communityHealthScore...');
    const originalCommunityScore = fwog.communityHealthScore;
    fwog.communityHealthScore = 9.5; // Temporarily change it
    
    const testScore = processor.calculateEnhancedOverallScore(fwog);
    console.log(`With communityHealthScore=9.5: ${testScore.toFixed(2)}`);
    
    // Restore original
    fwog.communityHealthScore = originalCommunityScore;
    
    if (Math.abs(testScore - backendScore) < 0.01) {
      console.log('❌ Score didn\'t change when community health changed!');
      console.log('🔍 ISSUE: Method is not using the communityHealthScore properly');
    } else {
      console.log('✅ Score changed when community health changed');
      console.log('🔍 Method is working, issue is elsewhere');
    }

  } catch (error) {
    console.error('❌ Debug failed:', error);
    console.error('Stack:', error.stack);
  }
}

debugRecalculationIssue();




