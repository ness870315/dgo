#!/usr/bin/env node

/**
 * CHECK WIZI HYPE DATA FROM PRODUCTION API
 * Check the actual hype chart data being served by api.degen-oracle.com
 */

async function checkWiziProductionHype() {
  console.log('🔍 WIZI PRODUCTION HYPE DATA CHECK');
  console.log('=' .repeat(60));
  
  try {
    const API_BASE = 'https://api.degen-oracle.com';
    
    // First get WIZI token data
    console.log('🌐 Fetching WIZI token data from production...');
    const tokensResponse = await fetch(`${API_BASE}/api/tokens`);
    const tokens = await tokensResponse.json();
    
    const wizi = tokens.find(t => t.symbol === 'WIZI');
    if (!wizi) {
      console.log('❌ WIZI not found in production tokens');
      return;
    }
    
    console.log(`✅ Found WIZI:`);
    console.log(`   Symbol: ${wizi.symbol}`);
    console.log(`   Name: ${wizi.name}`);
    console.log(`   Contract: ${wizi.contractAddress}`);
    console.log(`   Current Score: ${wizi.overallScore || wizi.score || 'N/A'}`);
    console.log(`   Community Score: ${wizi.communityHealthScore || 'N/A'}`);
    console.log(`   Last Updated: ${wizi.lastUpdated || 'N/A'}`);
    
    // Check what label should be based on current score
    const currentScore = wizi.overallScore || wizi.score || 0;
    const expectedLabel = currentScore >= 8 ? 'Viral' : 
                         currentScore >= 5 ? 'Trending' : 
                         currentScore >= 3 ? 'Building' : 'Sleeping';
    console.log(`   Expected Label: ${expectedLabel} (score: ${currentScore})`);
    
    // Now check hype data for different time ranges
    console.log('\n📊 CHECKING HYPE CHART DATA:');
    
    const timeRanges = ['1d', '3d', '7d', '15d', '30d'];
    
    for (const range of timeRanges) {
      try {
        console.log(`\n🔍 Checking ${range} hype data...`);
        const hypeResponse = await fetch(`${API_BASE}/api/tokens/${wizi.contractAddress}/hype?range=${range}`);
        
        if (!hypeResponse.ok) {
          console.log(`   ❌ Failed to fetch ${range} data: ${hypeResponse.status} ${hypeResponse.statusText}`);
          continue;
        }
        
        const hypeData = await hypeResponse.json();
        console.log(`   ✅ ${range} data fetched successfully`);
        
        if (hypeData.success && hypeData.data && Array.isArray(hypeData.data)) {
          const dataPoints = hypeData.data;
          console.log(`   📈 Data points: ${dataPoints.length}`);
          
          if (dataPoints.length > 0) {
            // Show last few data points
            const recent = dataPoints.slice(-3);
            console.log(`   📊 Recent data points:`);
            recent.forEach((point, i) => {
              const date = new Date(point.timestamp).toLocaleString();
              const score = point.score || 0;
              const label = point.label || 'Unknown';
              const expectedLabel = score >= 8 ? 'Viral' : 
                                   score >= 6 ? 'Trending' : 
                                   score >= 4 ? 'Building' : 'Sleeping';
              
              console.log(`      ${i + 1}. ${date}`);
              console.log(`         Score: ${score.toFixed(2)} | Label: ${label} | Expected: ${expectedLabel}`);
              
              if (label !== expectedLabel) {
                console.log(`         ⚠️  MISMATCH: Label "${label}" doesn't match expected "${expectedLabel}"`);
              }
            });
            
            // Check for any mismatches in all data
            const mismatches = dataPoints.filter(point => {
              const score = point.score || 0;
              const expectedLabel = score >= 8 ? 'Viral' : 
                                   score >= 6 ? 'Trending' : 
                                   score >= 4 ? 'Building' : 'Sleeping';
              return point.label !== expectedLabel;
            });
            
            if (mismatches.length > 0) {
              console.log(`   ⚠️  Found ${mismatches.length} label mismatches in ${range} data`);
            } else {
              console.log(`   ✅ All labels match expected values in ${range} data`);
            }
          } else {
            console.log(`   📊 No data points available for ${range}`);
          }
        } else {
          console.log(`   ❌ Invalid data structure for ${range}:`, hypeData);
        }
        
      } catch (error) {
        console.log(`   ❌ Error fetching ${range} data: ${error.message}`);
      }
    }
    
    // Also check if there's a specific hype endpoint
    console.log('\n🔍 CHECKING DIRECT HYPE ENDPOINT:');
    try {
      const directHypeResponse = await fetch(`${API_BASE}/api/tokens/${wizi.contractAddress}/hype`);
      if (directHypeResponse.ok) {
        const directHypeData = await directHypeResponse.json();
        console.log('   ✅ Direct hype endpoint accessible');
        console.log('   📊 Response:', JSON.stringify(directHypeData, null, 2));
      } else {
        console.log(`   ❌ Direct hype endpoint failed: ${directHypeResponse.status}`);
      }
    } catch (error) {
      console.log(`   ❌ Direct hype endpoint error: ${error.message}`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkWiziProductionHype().catch(console.error);
