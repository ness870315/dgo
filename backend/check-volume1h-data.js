import fs from 'fs/promises';

/**
 * Check how many tokens have volume1h data from Jupiter
 */
async function checkVolume1hData() {
  console.log('🔍 CHECKING VOLUME 1H DATA AVAILABILITY');
  console.log('=' .repeat(50));

  try {
    // Load tokens from cache
    console.log('📡 Loading tokens from cache...');
    const cacheData = await fs.readFile('./cache/tokens-cache.json', 'utf8');
    const tokens = JSON.parse(cacheData);
    
    console.log(`✅ Loaded ${tokens.length} tokens`);

    // Analyze volume1h data availability
    let totalTokens = 0;
    let tokensWithJupiterData = 0;
    let tokensWithVolume1h = 0;
    let tokensWithValidVolume1h = 0;
    
    const volume1hStats = {
      undefined: 0,
      null: 0,
      zero: 0,
      valid: 0
    };
    
    const sampleTokensWithVolume1h = [];
    const sampleTokensWithoutVolume1h = [];
    
    tokens.forEach(token => {
      totalTokens++;
      
      // Check if token has Jupiter data
      if (token.jupiterData) {
        tokensWithJupiterData++;
        
        const volume1h = token.jupiterData.volume1h;
        
        // Check volume1h status
        if (volume1h === undefined) {
          volume1hStats.undefined++;
          if (sampleTokensWithoutVolume1h.length < 5) {
            sampleTokensWithoutVolume1h.push({
              symbol: token.symbol,
              name: token.name,
              volume1h: 'undefined',
              hasJupiterData: true
            });
          }
        } else if (volume1h === null) {
          volume1hStats.null++;
          if (sampleTokensWithoutVolume1h.length < 5) {
            sampleTokensWithoutVolume1h.push({
              symbol: token.symbol,
              name: token.name,
              volume1h: 'null',
              hasJupiterData: true
            });
          }
        } else if (volume1h === 0) {
          volume1hStats.zero++;
          tokensWithVolume1h++;
        } else if (volume1h > 0) {
          volume1hStats.valid++;
          tokensWithVolume1h++;
          tokensWithValidVolume1h++;
          if (sampleTokensWithVolume1h.length < 10) {
            sampleTokensWithVolume1h.push({
              symbol: token.symbol,
              name: token.name,
              volume1h: volume1h,
              volume1hFormatted: `$${volume1h.toLocaleString()}`
            });
          }
        }
      } else {
        if (sampleTokensWithoutVolume1h.length < 5) {
          sampleTokensWithoutVolume1h.push({
            symbol: token.symbol,
            name: token.name,
            volume1h: 'no Jupiter data',
            hasJupiterData: false
          });
        }
      }
    });

    // Calculate percentages
    const jupiterDataPercentage = ((tokensWithJupiterData / totalTokens) * 100).toFixed(1);
    const volume1hPercentage = ((tokensWithVolume1h / totalTokens) * 100).toFixed(1);
    const validVolume1hPercentage = ((tokensWithValidVolume1h / totalTokens) * 100).toFixed(1);

    // Display results
    console.log('\n📊 VOLUME 1H DATA ANALYSIS:');
    console.log('============================');
    console.log(`Total Tokens: ${totalTokens}`);
    console.log(`Tokens with Jupiter Data: ${tokensWithJupiterData} (${jupiterDataPercentage}%)`);
    console.log(`Tokens with volume1h field: ${tokensWithVolume1h} (${volume1hPercentage}%)`);
    console.log(`Tokens with valid volume1h (>0): ${tokensWithValidVolume1h} (${validVolume1hPercentage}%)`);

    console.log('\n📈 VOLUME 1H STATUS BREAKDOWN:');
    console.log('==============================');
    console.log(`✅ Valid (>0): ${volume1hStats.valid} tokens`);
    console.log(`🔄 Zero: ${volume1hStats.zero} tokens`);
    console.log(`❌ Undefined: ${volume1hStats.undefined} tokens`);
    console.log(`❌ Null: ${volume1hStats.null} tokens`);
    console.log(`❌ No Jupiter Data: ${totalTokens - tokensWithJupiterData} tokens`);

    // Show impact on scoring
    console.log('\n🎯 SCORING IMPACT:');
    console.log('==================');
    console.log(`Tokens getting DEFAULT score (5.0): ${volume1hStats.undefined + volume1hStats.null + (totalTokens - tokensWithJupiterData)} tokens`);
    console.log(`Tokens getting ZERO score (1.0): ${volume1hStats.zero} tokens`);
    console.log(`Tokens getting CALCULATED score: ${volume1hStats.valid} tokens`);

    // Sample tokens with volume1h
    if (sampleTokensWithVolume1h.length > 0) {
      console.log('\n🚀 SAMPLE TOKENS WITH VALID VOLUME 1H:');
      console.log('======================================');
      sampleTokensWithVolume1h.forEach((token, index) => {
        console.log(`${index + 1}. ${token.symbol} (${token.name}): ${token.volume1hFormatted}`);
      });
    }

    // Sample tokens without volume1h
    if (sampleTokensWithoutVolume1h.length > 0) {
      console.log('\n❌ SAMPLE TOKENS WITHOUT VALID VOLUME 1H:');
      console.log('==========================================');
      sampleTokensWithoutVolume1h.forEach((token, index) => {
        console.log(`${index + 1}. ${token.symbol} (${token.name}): ${token.volume1h} ${token.hasJupiterData ? '(has Jupiter data)' : '(no Jupiter data)'}`);
      });
    }

    // Volume distribution for valid tokens
    if (volume1hStats.valid > 0) {
      console.log('\n💰 VOLUME 1H DISTRIBUTION (Valid tokens only):');
      console.log('==============================================');
      
      const volumeRanges = {
        '1M+': 0,
        '100K-1M': 0,
        '10K-100K': 0,
        '1K-10K': 0,
        '100-1K': 0,
        '1-100': 0
      };
      
      tokens.forEach(token => {
        const volume1h = token.jupiterData?.volume1h;
        if (volume1h > 0) {
          if (volume1h >= 1000000) volumeRanges['1M+']++;
          else if (volume1h >= 100000) volumeRanges['100K-1M']++;
          else if (volume1h >= 10000) volumeRanges['10K-100K']++;
          else if (volume1h >= 1000) volumeRanges['1K-10K']++;
          else if (volume1h >= 100) volumeRanges['100-1K']++;
          else volumeRanges['1-100']++;
        }
      });
      
      Object.entries(volumeRanges).forEach(([range, count]) => {
        const percentage = ((count / volume1hStats.valid) * 100).toFixed(1);
        console.log(`   ${range}: ${count} tokens (${percentage}%)`);
      });
    }

    // Recommendations
    console.log('\n💡 RECOMMENDATIONS:');
    console.log('===================');
    
    if (volume1hStats.undefined + volume1hStats.null > tokensWithValidVolume1h) {
      console.log('🚨 MAJOR ISSUE: More tokens missing volume1h than have it!');
      console.log('   - Check Jupiter API data collection');
      console.log('   - Verify volume1h field mapping');
      console.log('   - Consider fallback to volume24h for scoring');
    }
    
    if (tokensWithValidVolume1h < totalTokens * 0.5) {
      console.log('⚠️  WARNING: Less than 50% of tokens have valid volume1h data');
      console.log('   - This significantly impacts overall score accuracy');
      console.log('   - Many tokens getting default 5.0 score instead of calculated');
    }
    
    if (volume1hStats.valid > 0) {
      console.log('✅ GOOD: Some tokens have valid volume1h data');
      console.log('   - Volume-based scoring is working for these tokens');
    }

  } catch (error) {
    console.error('❌ Error checking volume1h data:', error);
    console.error('Stack:', error.stack);
  }
}

checkVolume1hData();




