import fs from 'fs/promises';
import axios from 'axios';

async function debugContractMatching() {
  try {
    // Load our current tokens
    console.log('Loading current tokens...');
    const data = await fs.readFile('cache/tokens-cache.json', 'utf8');
    const tokens = JSON.parse(data);

    // Get tokens without contract addresses
    const tokensWithoutContracts = tokens.filter(t => t.coinGeckoId && !t.contractAddress);

    console.log(`\n=== CONTRACT MATCHING DEBUG ===`);
    console.log(`Total tokens: ${tokens.length}`);
    console.log(`Tokens without contract addresses: ${tokensWithoutContracts.length}`);
    console.log(`Tokens with contract addresses: ${tokens.length - tokensWithoutContracts.length}`);

    // Fetch fresh CoinGecko data
    console.log('\nFetching fresh CoinGecko data...');
    const response = await axios.get('https://api.coingecko.com/api/v3/coins/list?include_platform=true', {
      timeout: 30000
    });

    // Create contract map
    const contractMap = new Map();
    let solanaCoinsCount = 0;
    let totalCoinsInCG = response.data.length;

    response.data.forEach(coin => {
      if (coin.platforms && coin.platforms.solana) {
        contractMap.set(coin.id, coin.platforms.solana);
        solanaCoinsCount++;
      }
    });

    console.log(`CoinGecko total coins: ${totalCoinsInCG}`);
    console.log(`CoinGecko Solana coins: ${solanaCoinsCount}`);

    // Test matching for first 20 problematic tokens
    console.log('\n=== TESTING CONTRACT MATCHING ===');
    const testTokens = tokensWithoutContracts.slice(0, 20);
    let foundCount = 0;
    let notFoundCount = 0;

    testTokens.forEach(token => {
      const hasMatch = contractMap.has(token.coinGeckoId);
      const contract = contractMap.get(token.coinGeckoId);

      if (hasMatch) {
        console.log(`✅ ${token.symbol} (${token.coinGeckoId}): FOUND - ${contract}`);
        foundCount++;
      } else {
        console.log(`❌ ${token.symbol} (${token.coinGeckoId}): NOT FOUND`);
        notFoundCount++;

        // Check for case insensitive match
        const caseInsensitiveMatch = Array.from(contractMap.keys()).find(
          id => id.toLowerCase() === token.coinGeckoId.toLowerCase()
        );
        if (caseInsensitiveMatch) {
          console.log(`   💡 Case mismatch: Expected "${caseInsensitiveMatch}", Got "${token.coinGeckoId}"`);
        }
      }
    });

    console.log(`\n=== SUMMARY ===`);
    console.log(`Tested: ${testTokens.length} tokens`);
    console.log(`Found contracts: ${foundCount}`);
    console.log(`Not found: ${notFoundCount}`);
    console.log(`Match rate: ${(foundCount/testTokens.length*100).toFixed(1)}%`);

    // Check if there are any tokens that should have contracts but don't
    console.log('\n=== CHECKING KNOWN WORKING TOKENS ===');
    const knownWorkingTokens = [
      { symbol: 'SLOTH', id: 'slothana' },
      { symbol: 'RETIRE', id: 'the-last-play' },
      { symbol: 'GIKO', id: 'giko-cat' },
      { symbol: 'TITCOIN', id: 'titcoin-2' },
      { symbol: 'PUNDU', id: 'pundu' }
    ];

    knownWorkingTokens.forEach(token => {
      const contract = contractMap.get(token.id);
      if (contract) {
        console.log(`✅ ${token.symbol} (${token.id}): ${contract}`);
      } else {
        console.log(`❌ ${token.symbol} (${token.id}): NOT FOUND IN COINGECKO`);
      }
    });

  } catch (error) {
    console.error('❌ Debug error:', error.message);
  }
}

debugContractMatching();