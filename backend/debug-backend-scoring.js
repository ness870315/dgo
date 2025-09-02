import axios from 'axios';
import EnhancedTokenProcessor from './enhancedTokenProcessor.js';

/**
 * DEBUG BACKEND SCORING DISCREPANCY
 * Find out exactly why FWOG's backend score (3.65) doesn't match our calculations
 */
async function debugBackendScoring() {
  console.log('🔍 DEBUGGING BACKEND SCORING DISCREPANCY');
  console.log('=' .repeat(60));

  try {
    // 1. Get FWOG data from backend API
    console.log('📡 Step 1: Fetching FWOG from backend API...');
    const response = await axios.get('http://localhost:4000/api/tokens');
    const tokens = response.data.tokens || response.data;
    const fwog = tokens.find(token => token.symbol === 'FWOG');
    
    if (!fwog) {
      console.log('❌ FWOG not found in backend response');
      return;
    }

    console.log(`✅ Found FWOG with overallScore: ${fwog.overallScore}`);

    // 2. Examine FWOG's data structure
    console.log('\n📊 Step 2: FWOG Data Structure Analysis');
    console.log('=====================================');
    
    console.log('🔍 Available Data Sources:');
    console.log(`   coingeckoData: ${fwog.coingeckoData ? 'EXISTS' : 'MISSING'}`);
    console.log(`   jupiterData: ${fwog.jupiterData ? 'EXISTS' : 'MISSING'}`);
    console.log(`   twitterData: ${fwog.twitterData ? 'EXISTS' : 'MISSING'}`);
    console.log(`   communityHealthScore: ${fwog.communityHealthScore || 'MISSING'}`);

    // 3. Check CoinGecko data (used by backend algorithm)
    if (fwog.coingeckoData) {
      console.log('\n💰 CoinGecko Data (Backend Algorithm Source):');
      console.log(`   marketCap: ${fwog.coingeckoData.marketCap || 'MISSING'}`);
      console.log(`   volume24h: ${fwog.coingeckoData.volume24h || 'MISSING'}`);
      console.log(`   priceChange24h: ${fwog.coingeckoData.priceChange24h || 'MISSING'}`);
    } else {
      console.log('\n❌ CoinGecko Data: COMPLETELY MISSING');
    }

    // 4. Check Jupiter data
    if (fwog.jupiterData) {
      console.log('\n🪐 Jupiter Data:');
      console.log(`   volume1h: ${fwog.jupiterData.volume1h || 'MISSING'}`);
      console.log(`   mcap: ${fwog.jupiterData.mcap || fwog.mcap || 'MISSING'}`);
      console.log(`   stats6h: ${fwog.jupiterData.stats6h ? 'EXISTS' : 'MISSING'}`);
    } else {
      console.log('\n❌ Jupiter Data: MISSING');
    }

    // 5. Manually run backend algorithm
    console.log('\n🧮 Step 3: Manual Backend Algorithm Execution');
    console.log('=============================================');
    
    const processor = new EnhancedTokenProcessor();
    
    // Test each component of backend algorithm
    console.log('\n📊 Backend Algorithm Components:');
    
    // Market Tier (uses coingeckoData.marketCap)
    const marketCapValue = fwog.coingeckoData?.marketCap;
    const marketTier = processor.calculateMarketTier(marketCapValue);
    console.log(`Market Tier: calculateMarketTier(${marketCapValue}) = ${marketTier}`);
    
    // Volume 1h (uses jupiterData.volume1h)
    const volume1hValue = fwog.jupiterData?.volume1h || 0;
    const volume1h = processor.calculateVolumeScore(volume1hValue);
    console.log(`Volume 1h: calculateVolumeScore(${volume1hValue}) = ${volume1h}`);
    
    // Volume 24h (uses coingeckoData.volume24h)
    const volume24hValue = fwog.coingeckoData?.volume24h || 0;
    const volume24h = processor.calculateVolumeScore(volume24hValue);
    console.log(`Volume 24h: calculateVolumeScore(${volume24hValue}) = ${volume24h}`);
    
    // Price Change (uses coingeckoData.priceChange24h)
    const priceChangeValue = fwog.coingeckoData?.priceChange24h || 0;
    const priceChange = processor.calculatePriceChangeScore(priceChangeValue);
    console.log(`Price Change: calculatePriceChangeScore(${priceChangeValue}) = ${priceChange}`);
    
    // Organic Volume Ratio (hardcoded to 5.0)
    const organicRatio = processor.calculateOrganicVolumeRatio(fwog);
    console.log(`Organic Ratio: calculateOrganicVolumeRatio() = ${organicRatio}`);
    
    // Community Health (from token.communityHealthScore)
    const communityHealth = fwog.communityHealthScore || 5.0;
    console.log(`Community Health: ${communityHealth}`);
    
    // Uniqueness Factor (hardcoded to 5.0)
    const uniqueness = processor.calculateUniquenessFactor(fwog);
    console.log(`Uniqueness: calculateUniquenessFactor() = ${uniqueness}`);

    // 6. Calculate manual score
    console.log('\n⚖️ Step 4: Manual Score Calculation');
    console.log('===================================');
    
    let manualScore = 0;
    manualScore += marketTier * 0.05;
    manualScore += volume1h * 0.10;
    manualScore += volume24h * 0.15;
    manualScore += priceChange * 0.10;
    manualScore += organicRatio * 0.10;
    manualScore += communityHealth * 0.45;
    manualScore += uniqueness * 0.05;
    
    console.log(`Market Tier: ${marketTier} × 5% = ${(marketTier * 0.05).toFixed(3)}`);
    console.log(`Volume 1h: ${volume1h} × 10% = ${(volume1h * 0.10).toFixed(3)}`);
    console.log(`Volume 24h: ${volume24h} × 15% = ${(volume24h * 0.15).toFixed(3)}`);
    console.log(`Price Change: ${priceChange} × 10% = ${(priceChange * 0.10).toFixed(3)}`);
    console.log(`Organic Ratio: ${organicRatio} × 10% = ${(organicRatio * 0.10).toFixed(3)}`);
    console.log(`Community Health: ${communityHealth} × 45% = ${(communityHealth * 0.45).toFixed(3)}`);
    console.log(`Uniqueness: ${uniqueness} × 5% = ${(uniqueness * 0.05).toFixed(3)}`);
    
    // Check for fuel bonus
    if (fwog.isPaid || fwog.isFueled) {
      const fuelBonus = Math.min(1.0, manualScore * 0.2);
      manualScore += fuelBonus;
      console.log(`Fuel Bonus: +${fuelBonus.toFixed(3)}`);
    }
    
    const finalManualScore = Math.min(manualScore, 10);
    
    console.log(`\n🏆 MANUAL CALCULATION: ${finalManualScore.toFixed(2)}`);
    console.log(`🏆 BACKEND REPORTED: ${fwog.overallScore}`);
    console.log(`🏆 DISCREPANCY: ${Math.abs(finalManualScore - fwog.overallScore).toFixed(2)}`);

    // 7. Test the actual backend method
    console.log('\n🔧 Step 5: Testing Backend Method Directly');
    console.log('==========================================');
    
    try {
      const backendCalculatedScore = processor.calculateEnhancedOverallScore(fwog);
      console.log(`Backend Method Result: ${backendCalculatedScore.toFixed(2)}`);
      
      if (Math.abs(backendCalculatedScore - fwog.overallScore) > 0.1) {
        console.log(`⚠️ Backend method doesn't match stored score!`);
        console.log(`This suggests the score is cached/stale or calculated elsewhere.`);
      }
    } catch (error) {
      console.log(`❌ Backend method failed: ${error.message}`);
    }

    // 8. Check for other scoring methods
    console.log('\n🔍 Step 6: Checking for Alternative Scoring');
    console.log('==========================================');
    
    // Check if there are other score fields
    const scoreFields = Object.keys(fwog).filter(key => 
      key.toLowerCase().includes('score') || 
      key.toLowerCase().includes('rating')
    );
    
    console.log('Score-related fields in FWOG:');
    scoreFields.forEach(field => {
      console.log(`   ${field}: ${fwog[field]}`);
    });

    // 9. Check timestamps to see when score was calculated
    console.log('\n⏰ Step 7: Timestamp Analysis');
    console.log('=============================');
    
    const timestampFields = Object.keys(fwog).filter(key => 
      key.toLowerCase().includes('timestamp') || 
      key.toLowerCase().includes('time') ||
      key.toLowerCase().includes('updated')
    );
    
    console.log('Timestamp fields in FWOG:');
    timestampFields.forEach(field => {
      console.log(`   ${field}: ${fwog[field]}`);
    });

    console.log('\n💡 CONCLUSION:');
    console.log('==============');
    if (Math.abs(finalManualScore - fwog.overallScore) < 0.1) {
      console.log('✅ Manual calculation matches backend - algorithm is working correctly');
    } else {
      console.log('❌ Manual calculation does NOT match backend');
      console.log('   Possible causes:');
      console.log('   1. Score is cached/stale');
      console.log('   2. Different algorithm is being used');
      console.log('   3. Data is missing/corrupted');
      console.log('   4. Score calculated by different service');
    }

  } catch (error) {
    console.error('❌ Debug failed:', error);
    console.error('Stack:', error.stack);
  }
}

debugBackendScoring();




