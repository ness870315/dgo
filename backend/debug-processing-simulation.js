import fs from 'fs/promises';
import axios from 'axios';

async function simulateContractMatching() {
  try {
    console.log('=== SIMULATING CONTRACT MATCHING PROCESS ===');

    // Load tokens
    const data = await fs.readFile('cache/tokens-cache.json', 'utf8');
    const allTokens = JSON.parse(data);

    // Get tokens without contracts (simulate what would be passed to fetchContractAddresses)
    const tokensWithoutContracts = allTokens.filter(t => t.coinGeckoId && !t.contractAddress);
    const tokensToProcess = tokensWithoutContracts.slice(0, 10); // Test with first 10

    console.log(`Testing with ${tokensToProcess.length} tokens without contracts`);
    console.log('Tokens to process:');
    tokensToProcess.forEach(t => console.log(`  - ${t.symbol} (${t.coinGeckoId})`));

    // Simulate the exact same logic as fetchContractAddresses
    console.log('\n=== STEP 1: Fetching CoinGecko data ===');
    const response = await axios.get('https://api.coingecko.com/api/v3/coins/list?include_platform=true', {
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    console.log(`Received ${response.data.length} coins from CoinGecko`);

    // Create contract map
    console.log('\n=== STEP 2: Building contract map ===');
    const contractMap = new Map();
    let solanaCoinsCount = 0;

    response.data.forEach(coin => {
      if (coin.platforms && coin.platforms.solana) {
        contractMap.set(coin.id, coin.platforms.solana);
        solanaCoinsCount++;
      }
    });

    console.log(`Found ${solanaCoinsCount} coins with Solana contracts`);

    // Match tokens
    console.log('\n=== STEP 3: Matching tokens ===');
    let matchedCount = 0;
    tokensToProcess.forEach(token => {
      if (token.coinGeckoId && contractMap.has(token.coinGeckoId)) {
        const contract = contractMap.get(token.coinGeckoId);
        console.log(`✅ ${token.symbol}: Found contract ${contract}`);
        matchedCount++;
      } else {
        console.log(`❌ ${token.symbol}: No Solana contract found for ID "${token.coinGeckoId}"`);

        // Debug: check if ID exists at all
        const coinExists = response.data.find(coin => coin.id === token.coinGeckoId);
        if (coinExists) {
          console.log(`   📋 Coin exists in CG but no Solana platform: ${JSON.stringify(coinExists.platforms)}`);
        } else {
          console.log(`   🚫 Coin ID "${token.coinGeckoId}" not found in CoinGecko at all`);
        }
      }
    });

    console.log(`\n=== RESULT ===`);
    console.log(`Matched: ${matchedCount}/${tokensToProcess.length} tokens`);
    console.log(`Match rate: ${(matchedCount/tokensToProcess.length*100).toFixed(1)}%`);

    if (matchedCount === tokensToProcess.length) {
      console.log('\n🎉 CONTRACT MATCHING WORKS PERFECTLY!');
      console.log('The issue must be elsewhere in the processing pipeline.');
    } else {
      console.log('\n❌ CONTRACT MATCHING HAS ISSUES!');
      console.log('Some tokens are not being matched properly.');
    }

  } catch (error) {
    console.error('❌ Simulation error:', error.message);
    console.error('Stack:', error.stack);
  }
}

simulateContractMatching();





