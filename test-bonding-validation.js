import fs from 'fs/promises';
import path from 'path';

// Test contracts provided by user
const TEST_CONTRACTS = [
  'HAw8QdzzRS3gmLao48E3YGqBqRKXGEktu73rQQxEpump',
  'EGedTSu2zdFNT1k7phURksCpcwHNyxepLzSMYGApump', 
  'FQUViAMMM8zPM5dhiVKePBBA8ud29sP1gdyHdhXDpump'
];

/**
 * Test Jupiter API bonding curve validation using batch approach
 */
async function testBondingValidation() {
  console.log('🧪 Testing Jupiter API Bonding Curve Validation (Batch Mode)');
  console.log('=' .repeat(60));
  
  const results = {
    valid: [],
    invalid: [],
    notFound: []
  };
  
  console.log(`📋 Testing ${TEST_CONTRACTS.length} contracts in batch mode`);
  
  try {
    // Create comma-separated query string
    const queryString = TEST_CONTRACTS.join(',');
    const url = `https://lite-api.jup.ag/tokens/v2/search?query=${queryString}`;
    
    console.log(`🔗 Batch API URL: ${url}`);
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (!Array.isArray(data)) {
      throw new Error('Invalid response format - expected array');
    }
    
    console.log(`✅ Batch API Response received: ${data.length} tokens`);
    
    // Process each contract
    TEST_CONTRACTS.forEach(contract => {
      console.log(`\n🔍 Processing: ${contract}`);
      
      const token = data.find(t => t.id === contract);
      
      if (!token) {
        console.log(`❌ ${contract}: NOT FOUND in Jupiter API response`);
        results.notFound.push(contract);
        return;
      }
      
      console.log(`✅ ${contract}: Found in Jupiter API`);
      console.log(`  📊 Token: ${token.name || 'N/A'} (${token.symbol || 'N/A'})`);
      console.log(`  🏭 Launchpad: ${token.launchpad || 'N/A'}`);
      console.log(`  🔍 Bonding Curve: ${token.bondingCurve !== undefined ? token.bondingCurve : 'NOT FOUND'}`);
      console.log(`  🎓 Graduated Pool: ${token.graduatedPool || 'N/A'}`);
      console.log(`  📅 Graduated At: ${token.graduatedAt || 'N/A'}`);
      
      // Check if token has bondingCurve field
      const hasBondingCurve = token.bondingCurve !== undefined && token.bondingCurve !== null;
      
      if (hasBondingCurve) {
        console.log(`✅ ${contract}: HAS bondingCurve (${token.bondingCurve}) - KEEP`);
        results.valid.push({
          contract,
          name: token.name,
          symbol: token.symbol,
          launchpad: token.launchpad,
          bondingCurve: token.bondingCurve,
          graduatedPool: token.graduatedPool,
          graduatedAt: token.graduatedAt
        });
      } else {
        console.log(`❌ ${contract}: NO bondingCurve - SHOULD BE REMOVED`);
        results.invalid.push({
          contract,
          name: token.name,
          symbol: token.symbol,
          launchpad: token.launchpad,
          bondingCurve: token.bondingCurve,
          graduatedPool: token.graduatedPool,
          graduatedAt: token.graduatedAt
        });
      }
    });
    
  } catch (error) {
    console.error('❌ Batch test failed:', error.message);
    console.error('Stack:', error.stack);
    return null;
  }
  
  // Summary
  console.log('\n📈 Validation Summary:');
  console.log('=' .repeat(60));
  console.log(`✅ Valid (keep): ${results.valid.length}`);
  console.log(`❌ Invalid (remove): ${results.invalid.length}`);
  console.log(`🔍 Not found: ${results.notFound.length}`);
  
  if (results.valid.length > 0) {
    console.log('\n✅ Valid Tokens (HAS bondingCurve):');
    results.valid.forEach(token => {
      console.log(`  - ${token.contract}: ${token.name} (${token.symbol}) - bondingCurve: ${token.bondingCurve}`);
    });
  }
  
  if (results.invalid.length > 0) {
    console.log('\n❌ Invalid Tokens (NO bondingCurve - should be removed):');
    results.invalid.forEach(token => {
      console.log(`  - ${token.contract}: ${token.name} (${token.symbol}) - bondingCurve: ${token.bondingCurve || 'NOT FOUND'}`);
    });
  }
  
  if (results.notFound.length > 0) {
    console.log('\n🔍 Not Found Tokens:');
    results.notFound.forEach(contract => {
      console.log(`  - ${contract}: Not found in Jupiter API`);
    });
  }
  
  // Test cleanup simulation
  console.log('\n🧹 Cleanup Simulation:');
  console.log('-'.repeat(60));
  
  if (results.invalid.length > 0) {
    console.log('Would remove these tokens from PreBonded-BackendCache:');
    results.invalid.forEach(token => {
      console.log(`  🗑️ Remove: ${token.contract}`);
    });
  } else {
    console.log('✅ No tokens need to be removed');
  }
  
  return results;
}

/**
 * Test with individual contract calls
 */
async function testIndividualContracts() {
  console.log('\n\n🔬 Testing Individual Contract Calls');
  console.log('=' .repeat(60));
  
  for (const contract of TEST_CONTRACTS) {
    try {
      console.log(`\n🔍 Testing: ${contract}`);
      
      const url = `https://lite-api.jup.ag/tokens/v2/search?mintAddresses=${contract}`;
      const response = await fetch(url);
      
      if (!response.ok) {
        console.log(`❌ HTTP ${response.status}: ${response.statusText}`);
        continue;
      }
      
      const data = await response.json();
      const token = data.find(t => t.address === contract);
      
      if (!token) {
        console.log(`❌ Token not found`);
        continue;
      }
      
      console.log(`✅ Token found: ${token.name} (${token.symbol})`);
      console.log(`📊 Bonding Curve: ${token.bondingCurve !== undefined ? token.bondingCurve : 'NOT FOUND'}`);
      console.log(`💰 Price: ${token.price || 'N/A'}`);
      console.log(`📈 Market Cap: ${token.marketCap || 'N/A'}`);
      
    } catch (error) {
      console.error(`❌ Error testing ${contract}:`, error.message);
    }
  }
}

/**
 * Main test function
 */
async function main() {
  console.log('🚀 Starting Bonding Token Validation Test');
  console.log(`⏰ Test started at: ${new Date().toISOString()}`);
  
  // Test 1: Batch validation
  const batchResults = await testBondingValidation();
  
  // Test 2: Individual validation
  await testIndividualContracts();
  
  console.log('\n🏁 Test completed');
  console.log(`⏰ Test finished at: ${new Date().toISOString()}`);
  
  if (batchResults) {
    console.log('\n📋 Final Results:');
    console.log(`✅ Valid tokens: ${batchResults.valid.length}`);
    console.log(`❌ Invalid tokens: ${batchResults.invalid.length}`);
    console.log(`🔍 Not found: ${batchResults.notFound.length}`);
  }
}

// Run the test
main().catch(console.error);
