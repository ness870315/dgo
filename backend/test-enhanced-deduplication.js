import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import the enhanced token processor
import EnhancedTokenProcessor from './enhancedTokenProcessor.js';

async function testEnhancedDeduplication() {
  console.log('🧪 Testing Enhanced Deduplication Logic\n');

  const processor = new EnhancedTokenProcessor();

  // Create test tokens with various scenarios
  const testTokens = [
    // Scenario 1: Same token from different sources with contract
    {
      symbol: 'GARY',
      name: 'Gary Token',
      contractAddress: '5SRer48NRfmhsut1n4ZwSAVUJAErNjdKcXTMVaxdpump',
      source: 'jupiter',
      price: 0.00233
    },
    {
      symbol: 'GARY',
      name: 'GARY',
      contractAddress: '5SRer48NRfmhsut1n4ZwSAVUJAErNjdKcXTMVaxdpump',
      source: 'coingecko',
      price: 0.00230
    },

    // Scenario 2: Same symbol, one with contract, one without
    {
      symbol: 'BONK',
      name: 'Bonk',
      contractAddress: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
      source: 'dexscreener',
      price: 0.000025
    },
    {
      symbol: 'BONK',
      name: 'Bonk Token',
      contractAddress: null,
      source: 'coingecko',
      price: 0.000024
    },

    // Scenario 3: Different tokens with same symbol (should both be kept if both have contracts)
    {
      symbol: 'TEST',
      name: 'Test Token A',
      contractAddress: 'TestContractA123456789012345678901234567890',
      source: 'jupiter',
      price: 1.0
    },
    {
      symbol: 'TEST',
      name: 'Test Token B',
      contractAddress: 'TestContractB123456789012345678901234567890',
      source: 'dexscreener',
      price: 2.0
    },

    // Scenario 4: Tokens without contracts (should dedupe by symbol)
    {
      symbol: 'NOCONTRACT',
      name: 'No Contract Token',
      contractAddress: null,
      source: 'coingecko',
      price: 0.1
    },
    {
      symbol: 'NOCONTRACT',
      name: 'No Contract Token Dupe',
      contractAddress: null,
      source: 'birdeye',
      price: 0.11
    },

    // Scenario 5: Invalid tokens (should be removed)
    {
      symbol: '',
      name: 'Invalid Token',
      contractAddress: null,
      source: 'coingecko'
    },
    {
      symbol: null,
      name: 'Another Invalid',
      contractAddress: '',
      source: 'coingecko'
    },

    // Scenario 6: Short contract addresses (should be treated as invalid)
    {
      symbol: 'SHORT',
      name: 'Short Contract',
      contractAddress: '123',
      source: 'coingecko',
      price: 0.5
    }
  ];

  console.log(`📊 Input: ${testTokens.length} test tokens`);
  console.log('Test scenarios:');
  console.log('  1. Same token (GARY) from jupiter + coingecko (should keep jupiter)');
  console.log('  2. Same symbol (BONK) with/without contract (should keep with contract)');
  console.log('  3. Different tokens with same symbol (TEST) (should keep both)');
  console.log('  4. Tokens without contracts (NOCONTRACT) (should keep higher priority)');
  console.log('  5. Invalid tokens (should be removed)');
  console.log('  6. Short contract addresses (should be treated as invalid)');

  // Test the deduplication
  console.log('\n🔍 Running enhanced deduplication...');
  const result = processor.deduplicateTokens(testTokens);

  console.log(`\n📊 Output: ${result.length} unique tokens`);
  console.log(`🗑️ Removed: ${testTokens.length - result.length} duplicates/invalid tokens`);

  // Analyze results
  console.log('\n📋 Final tokens:');
  result.forEach((token, i) => {
    const contract = token.contractAddress ? 
      `${token.contractAddress.substring(0, 8)}...${token.contractAddress.substring(-8)}` : 
      'no contract';
    console.log(`  ${i + 1}. ${token.symbol} (${token.name}) - ${contract} - ${token.source}`);
  });

  // Verify expected results
  console.log('\n✅ Verification:');
  
  // Should have only one GARY (from jupiter - higher priority)
  const garyTokens = result.filter(t => t.symbol === 'GARY');
  console.log(`  GARY tokens: ${garyTokens.length} (expected: 1)`);
  if (garyTokens.length === 1 && garyTokens[0].source === 'jupiter') {
    console.log('    ✅ Kept jupiter version as expected');
  } else {
    console.log('    ❌ Unexpected GARY result');
  }

  // Should have only one BONK (with contract address)
  const bonkTokens = result.filter(t => t.symbol === 'BONK');
  console.log(`  BONK tokens: ${bonkTokens.length} (expected: 1)`);
  if (bonkTokens.length === 1 && bonkTokens[0].contractAddress) {
    console.log('    ✅ Kept version with contract as expected');
  } else {
    console.log('    ❌ Unexpected BONK result');
  }

  // Should have two TEST tokens (different contracts)
  const testTokensResult = result.filter(t => t.symbol === 'TEST');
  console.log(`  TEST tokens: ${testTokensResult.length} (expected: 2)`);
  if (testTokensResult.length === 2) {
    console.log('    ✅ Kept both TEST tokens with different contracts');
  } else {
    console.log('    ❌ Unexpected TEST result');
  }

  // Should have one NOCONTRACT (higher priority source)
  const noContractTokens = result.filter(t => t.symbol === 'NOCONTRACT');
  console.log(`  NOCONTRACT tokens: ${noContractTokens.length} (expected: 1)`);
  if (noContractTokens.length === 1 && noContractTokens[0].source === 'birdeye') {
    console.log('    ✅ Kept birdeye version (higher priority than coingecko)');
  } else {
    console.log('    ❌ Unexpected NOCONTRACT result');
  }

  // Should have no invalid tokens
  const invalidTokens = result.filter(t => !t.symbol || !t.name);
  console.log(`  Invalid tokens: ${invalidTokens.length} (expected: 0)`);
  if (invalidTokens.length === 0) {
    console.log('    ✅ All invalid tokens removed');
  } else {
    console.log('    ❌ Some invalid tokens remain');
  }

  // Should have no SHORT token (invalid contract)
  const shortTokens = result.filter(t => t.symbol === 'SHORT');
  console.log(`  SHORT tokens: ${shortTokens.length} (expected: 0)`);
  if (shortTokens.length === 0) {
    console.log('    ✅ Token with short contract removed');
  } else {
    console.log('    ❌ Token with short contract not removed');
  }

  console.log('\n🎉 Enhanced deduplication test completed!');
}

// Test with real cache data
async function testWithRealData() {
  console.log('\n🔍 Testing with real cache data...');
  
  try {
    const cachePath = path.join(__dirname, 'cache', 'tokens-cache.json');
    const data = await fs.readFile(cachePath, 'utf8');
    const tokens = JSON.parse(data);
    
    console.log(`📊 Loaded ${tokens.length} real tokens from cache`);
    
    // Analyze current duplicates
    const contractMap = new Map();
    const symbolMap = new Map();
    let duplicatesByContract = 0;
    let duplicatesBySymbol = 0;
    let tokensWithoutContract = 0;
    
    for (const token of tokens) {
      if (token.contractAddress && token.contractAddress !== null && token.contractAddress.length > 10) {
        const key = token.contractAddress.toLowerCase();
        if (contractMap.has(key)) {
          duplicatesByContract++;
        } else {
          contractMap.set(key, token);
        }
      } else {
        tokensWithoutContract++;
        if (token.symbol) {
          const key = token.symbol.toUpperCase();
          if (symbolMap.has(key)) {
            duplicatesBySymbol++;
          } else {
            symbolMap.set(key, token);
          }
        }
      }
    }
    
    console.log(`📈 Current state:`);
    console.log(`   Tokens without contracts: ${tokensWithoutContract}`);
    console.log(`   Potential contract duplicates: ${duplicatesByContract}`);
    console.log(`   Potential symbol duplicates: ${duplicatesBySymbol}`);
    
    // Test deduplication on real data (just first 100 tokens for speed)
    const processor = new EnhancedTokenProcessor();
    const sampleTokens = tokens.slice(0, 100);
    const deduplicated = processor.deduplicateTokens(sampleTokens);
    
    console.log(`📊 Sample test (first 100 tokens):`);
    console.log(`   Before: ${sampleTokens.length} tokens`);
    console.log(`   After: ${deduplicated.length} tokens`);
    console.log(`   Removed: ${sampleTokens.length - deduplicated.length} duplicates`);
    
  } catch (error) {
    console.log('⚠️ Could not test with real data:', error.message);
  }
}

// Main execution
async function main() {
  await testEnhancedDeduplication();
  await testWithRealData();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
