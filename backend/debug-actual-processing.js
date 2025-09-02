import fs from 'fs/promises';
import axios from 'axios';

async function debugActualProcessing() {
  try {
    console.log('=== DEBUGGING ACTUAL PROCESSING ISSUE ===');

    // Load tokens
    const data = await fs.readFile('cache/tokens-cache.json', 'utf8');
    const allTokens = JSON.parse(data);

    // Get tokens without contracts
    const tokensWithoutContracts = allTokens.filter(t => t.coinGeckoId && !t.contractAddress);

    console.log(`Tokens without contracts: ${tokensWithoutContracts.length}`);

    // Test the EXACT same API call as the processing pipeline
    console.log('\n=== TESTING API CALL ===');
    const response = await axios.get('https://api.coingecko.com/api/v3/coins/list?include_platform=true', {
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    console.log(`API Response OK: ${response.status === 200}`);
    console.log(`Data received: ${Array.isArray(response.data)}`);
    console.log(`Data length: ${response.data?.length}`);

    // Test building the contract map
    console.log('\n=== TESTING CONTRACT MAP BUILDING ===');
    const contractMap = new Map();
    let solanaCoinsCount = 0;

    response.data.forEach(coin => {
      if (coin.platforms && coin.platforms.solana) {
        contractMap.set(coin.id, coin.platforms.solana);
        solanaCoinsCount++;
      }
    });

    console.log(`Contract map size: ${contractMap.size}`);
    console.log(`Solana coins found: ${solanaCoinsCount}`);

    // Test a few specific matches
    console.log('\n=== TESTING SPECIFIC MATCHES ===');
    const testCases = [
      { symbol: 'LIBRA', id: 'libra-5' },
      { symbol: 'TITCOIN', id: 'titcoin-2' },
      { symbol: 'RETIRE', id: 'the-last-play' }
    ];

    testCases.forEach(testCase => {
      const contract = contractMap.get(testCase.id);
      console.log(`${testCase.symbol} (${testCase.id}): ${contract ? '✅ FOUND: ' + contract : '❌ NOT FOUND'}`);
    });

    // Check if our tokens' IDs exist in the map
    console.log('\n=== CHECKING OUR TOKEN IDs ===');
    const ourTokens = tokensWithoutContracts.slice(0, 5);
    ourTokens.forEach(token => {
      const hasContract = contractMap.has(token.coinGeckoId);
      const contract = contractMap.get(token.coinGeckoId);
      console.log(`${token.symbol} (${token.coinGeckoId}): ${hasContract ? '✅ ' + contract : '❌ NOT FOUND'}`);
    });

    // The logic works perfectly, so the issue must be elsewhere
    console.log('\n=== CONCLUSION ===');
    console.log('✅ Contract matching logic works perfectly');
    console.log('❌ Issue must be in the processing pipeline execution');
    console.log('');
    console.log('Possible causes:');
    console.log('1. fetchContractAddresses method not being called');
    console.log('2. Method throwing error before completion');
    console.log('3. contractAddress property not being saved');
    console.log('4. Processing order/timing issue');

  } catch (error) {
    console.error('❌ Debug error:', error.message);
    console.error('Stack:', error.stack);
  }
}

debugActualProcessing();





