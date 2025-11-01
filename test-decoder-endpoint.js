/**
 * Test the new decoder test endpoint with known pools
 */

import axios from 'axios';

const API_BASE = 'https://api.degen-oracle.com';

// Known good pools from tests
const TEST_POOLS = [
  {
    name: 'USELESS CPMM Pool',
    poolAddress: 'Q2sPHPdUWFMg7M7wwrQKLrn619cAucfRsmhVJffodSp',
    programId: 'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C'
  }
];

async function testDecoderEndpoint() {
  console.log('🧪 Testing Decoder Endpoint\n');
  console.log('='.repeat(80));
  
  for (const testPool of TEST_POOLS) {
    console.log(`\n📊 Testing: ${testPool.name}`);
    console.log(`   Pool: ${testPool.poolAddress}`);
    console.log(`   Program: ${testPool.programId.substring(0, 16)}...`);
    
    try {
      const response = await axios.post(`${API_BASE}/api/decoders/test`, {
        poolAddress: testPool.poolAddress,
        programId: testPool.programId
      }, {
        timeout: 30000
      });
      
      const result = response.data;
      
      if (result.success) {
        console.log(`   ✅ SUCCESS!`);
        console.log(`   Decoder: ${result.decoderType}`);
        console.log(`   Elapsed: ${result.elapsedMs}ms`);
        console.log(`   Token0 Vault: ${result.poolData.token0Vault}`);
        console.log(`   Token1 Vault: ${result.poolData.token1Vault}`);
      } else {
        console.log(`   ❌ FAILED`);
        console.log(`   Decoder: ${result.decoderType}`);
        console.log(`   Metrics: ${JSON.stringify(result.decoderMetrics, null, 2)}`);
      }
      
    } catch (error) {
      console.log(`   ❌ ERROR: ${error.message}`);
      if (error.response?.data) {
        console.log(`   Response: ${JSON.stringify(error.response.data, null, 2)}`);
      }
    }
  }
  
  console.log('\n' + '='.repeat(80));
  
  // Also show current stats
  console.log('\n📊 Current Decoder Stats:\n');
  try {
    const statsResponse = await axios.get(`${API_BASE}/api/decoders/stats`);
    const stats = statsResponse.data.data;
    
    console.log(`   CPMM Usage: ${stats.raydiumCPMM.usage}`);
    console.log(`   CPMM Total Decodes: ${stats.raydiumCPMM.totalDecodes}`);
    console.log(`   CPMM Success Rate: ${stats.raydiumCPMM.successRate}`);
    console.log(`   CPMM Cache Size: ${stats.raydiumCPMM.cacheSize}`);
    
  } catch (error) {
    console.log(`   ❌ Could not fetch stats: ${error.message}`);
  }
}

testDecoderEndpoint().catch(console.error);

