import fs from 'fs/promises';

/**
 * Check the actual Jupiter data structure to see what fields are available
 */
async function checkJupiterDataStructure() {
  console.log('🔍 CHECKING JUPITER DATA STRUCTURE');
  console.log('=' .repeat(50));

  try {
    // Load tokens from cache
    console.log('📡 Loading tokens from cache...');
    const cacheData = await fs.readFile('./cache/tokens-cache.json', 'utf8');
    const tokens = JSON.parse(cacheData);
    
    console.log(`✅ Loaded ${tokens.length} tokens`);

    // Find tokens with Jupiter data
    const tokensWithJupiter = tokens.filter(token => token.jupiterData);
    console.log(`🪐 Tokens with Jupiter data: ${tokensWithJupiter.length}`);

    if (tokensWithJupiter.length > 0) {
      // Show structure of first few tokens
      console.log('\n📊 JUPITER DATA STRUCTURE SAMPLES:');
      console.log('==================================');
      
      for (let i = 0; i < Math.min(3, tokensWithJupiter.length); i++) {
        const token = tokensWithJupiter[i];
        console.log(`\n${i + 1}. ${token.symbol} (${token.name}):`);
        console.log('   Jupiter Data Keys:', Object.keys(token.jupiterData));
        
        // Check for volume-related fields
        console.log('   Volume-related fields:');
        Object.keys(token.jupiterData).forEach(key => {
          if (key.toLowerCase().includes('volume') || key.toLowerCase().includes('vol')) {
            console.log(`      ${key}: ${token.jupiterData[key]}`);
          }
        });
        
        // Check stats1h structure if it exists
        if (token.jupiterData.stats1h) {
          console.log('   stats1h structure:');
          console.log('      Keys:', Object.keys(token.jupiterData.stats1h));
          
          // Show volume-related fields in stats1h
          const stats1h = token.jupiterData.stats1h;
          if (stats1h.buyVolume !== undefined) console.log(`      buyVolume: ${stats1h.buyVolume}`);
          if (stats1h.sellVolume !== undefined) console.log(`      sellVolume: ${stats1h.sellVolume}`);
          if (stats1h.volume !== undefined) console.log(`      volume: ${stats1h.volume}`);
          if (stats1h.totalVolume !== undefined) console.log(`      totalVolume: ${stats1h.totalVolume}`);
        }
        
        // Check if volume1h field exists
        if (token.jupiterData.volume1h !== undefined) {
          console.log(`   ✅ volume1h: ${token.jupiterData.volume1h}`);
        } else {
          console.log('   ❌ volume1h: MISSING');
        }
      }
      
      // Check what volume fields are actually available
      console.log('\n📈 VOLUME FIELD AVAILABILITY ANALYSIS:');
      console.log('=====================================');
      
      const volumeFields = {};
      tokensWithJupiter.forEach(token => {
        Object.keys(token.jupiterData).forEach(key => {
          if (key.toLowerCase().includes('volume') || key.toLowerCase().includes('vol')) {
            if (!volumeFields[key]) volumeFields[key] = 0;
            volumeFields[key]++;
          }
        });
        
        // Check stats1h volume fields
        if (token.jupiterData.stats1h) {
          Object.keys(token.jupiterData.stats1h).forEach(key => {
            if (key.toLowerCase().includes('volume') || key.toLowerCase().includes('vol')) {
              const fullKey = `stats1h.${key}`;
              if (!volumeFields[fullKey]) volumeFields[fullKey] = 0;
              volumeFields[fullKey]++;
            }
          });
        }
        
        // Check stats6h volume fields
        if (token.jupiterData.stats6h) {
          Object.keys(token.jupiterData.stats6h).forEach(key => {
            if (key.toLowerCase().includes('volume') || key.toLowerCase().includes('vol')) {
              const fullKey = `stats6h.${key}`;
              if (!volumeFields[fullKey]) volumeFields[fullKey] = 0;
              volumeFields[fullKey]++;
            }
          });
        }
        
        // Check stats24h volume fields
        if (token.jupiterData.stats24h) {
          Object.keys(token.jupiterData.stats24h).forEach(key => {
            if (key.toLowerCase().includes('volume') || key.toLowerCase().includes('vol')) {
              const fullKey = `stats24h.${key}`;
              if (!volumeFields[fullKey]) volumeFields[fullKey] = 0;
              volumeFields[fullKey]++;
            }
          });
        }
      });
      
      console.log('Available volume fields:');
      Object.entries(volumeFields)
        .sort(([,a], [,b]) => b - a)
        .forEach(([field, count]) => {
          const percentage = ((count / tokensWithJupiter.length) * 100).toFixed(1);
          console.log(`   ${field}: ${count}/${tokensWithJupiter.length} tokens (${percentage}%)`);
        });
      
      // Show recommended fix
      console.log('\n💡 RECOMMENDED FIX:');
      console.log('==================');
      
      if (volumeFields['stats1h.buyVolume'] && volumeFields['stats1h.sellVolume']) {
        console.log('✅ Found stats1h.buyVolume and stats1h.sellVolume');
        console.log('🔧 SOLUTION: Calculate volume1h = buyVolume + sellVolume');
        console.log('   Update scoring to use: (jupiterData.stats1h.buyVolume || 0) + (jupiterData.stats1h.sellVolume || 0)');
      } else if (volumeFields['stats1h.volume']) {
        console.log('✅ Found stats1h.volume');
        console.log('🔧 SOLUTION: Use stats1h.volume for 1h volume scoring');
      } else {
        console.log('❌ No 1h volume data found in Jupiter structure');
        console.log('🔧 SOLUTION: Use 6h or 24h volume as fallback, or fix Jupiter data collection');
      }
      
      // Sample calculation
      if (tokensWithJupiter.length > 0) {
        const sampleToken = tokensWithJupiter[0];
        if (sampleToken.jupiterData.stats1h) {
          const buyVol = sampleToken.jupiterData.stats1h.buyVolume || 0;
          const sellVol = sampleToken.jupiterData.stats1h.sellVolume || 0;
          const totalVol = buyVol + sellVol;
          
          console.log(`\n🧮 SAMPLE CALCULATION (${sampleToken.symbol}):`);
          console.log(`   Buy Volume: $${buyVol.toLocaleString()}`);
          console.log(`   Sell Volume: $${sellVol.toLocaleString()}`);
          console.log(`   Total 1h Volume: $${totalVol.toLocaleString()}`);
        }
      }
    } else {
      console.log('❌ No tokens with Jupiter data found');
    }

  } catch (error) {
    console.error('❌ Error checking Jupiter data structure:', error);
    console.error('Stack:', error.stack);
  }
}

checkJupiterDataStructure();




