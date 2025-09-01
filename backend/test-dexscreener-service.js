import DexscreenerApiService from './dexscreenerApiService.js';

async function testDexscreenerService() {
  console.log('🚀 Testing Dexscreener Service...\n');

  const dexscreenerService = new DexscreenerApiService();

  try {
    // Test 1: Basic connection test
    console.log('📡 Test 1: Basic API Connection');
    console.log('=' .repeat(50));

    const connectionTest = await dexscreenerService.testConnection();
    console.log('Connection Test Result:', connectionTest);

    if (!connectionTest.success) {
      console.log('❌ API connection failed.');
      return;
    }

    console.log('\n✅ API connection successful!\n');

    // Test 2: Get trending pairs
    console.log('📊 Test 2: Fetch Trending Pairs');
    console.log('=' .repeat(50));

    const trendingPairs = await dexscreenerService.getTrendingPairs(100); // Test with 100 to see actual limits

    if (trendingPairs && trendingPairs.length > 0) {
      console.log(`\n🎉 Successfully retrieved ${trendingPairs.length} trending pairs!\n`);

      trendingPairs.forEach((pair, index) => {
        console.log(`${index + 1}. ${pair.symbol} (${pair.name})`);
        console.log(`   Contract: ${pair.contractAddress}`);
        console.log(`   Pair: ${pair.pair.base.symbol}/${pair.pair.target.symbol}`);
        console.log(`   Price: $${pair.price?.toFixed(6) || 'N/A'}`);
        console.log(`   24h Volume: $${pair.volume24h?.toLocaleString() || 'N/A'}`);
        console.log(`   24h Change: ${pair.priceChange24h?.toFixed(2) || 'N/A'}%`);
        console.log(`   Trend Score: ${pair.trendScore?.toFixed(0) || 'N/A'}`);
        console.log(`   Liquidity: $${pair.liquidity?.toLocaleString() || 'N/A'}`);
        console.log(`   Market Cap: $${pair.marketCap?.toLocaleString() || 'N/A'}`);
        console.log(`   DEX: ${pair.dex.protocolName}`);
        console.log('');
      });
    } else {
      console.log('\n⚠️ No trending pairs retrieved.');
    }

    // Test 3: Search for a specific token
    console.log('\n🔍 Test 3: Search for Specific Token');
    console.log('=' .repeat(50));

    const searchQuery = 'BONK'; // Popular Solana meme coin
    console.log(`Searching for "${searchQuery}"...`);

    const searchResults = await dexscreenerService.searchPairs(searchQuery, 3);

    console.log('\n💡 Note: TESTING HIGHER LIMITS - Can we get 100+ tokens?');
    console.log('   We now search 30+ trending terms and 13+ DEXes for maximum discovery.');
    console.log('   Smart filtering ensures only Solana memecoins with real volume.');
    console.log('   This should give us a comprehensive view of the Solana memecoin ecosystem! 🚀');

    if (searchResults && searchResults.length > 0) {
      console.log(`\n✅ Found ${searchResults.length} results for "${searchQuery}":\n`);

      searchResults.forEach((pair, index) => {
        console.log(`${index + 1}. ${pair.symbol}/${pair.pair.target.symbol}`);
        console.log(`   Price: $${pair.price?.toFixed(6) || 'N/A'}`);
        console.log(`   Volume: $${pair.volume24h?.toLocaleString() || 'N/A'}`);
        console.log(`   Pair Address: ${pair.pairAddress}`);
        console.log('');
      });
    } else {
      console.log(`\n⚠️ No search results found for "${searchQuery}".`);
    }

    // Test 4: Get detailed pair info (using workaround)
    if (searchResults && searchResults.length > 0) {
      console.log('\n📈 Test 4: Get Detailed Pair Info (Workaround)');
      console.log('=' .repeat(50));

      const samplePair = searchResults[0];
      console.log(`Fetching detailed info for ${samplePair.symbol}/${samplePair.pair.target.symbol}...`);
      console.log('Note: Using search-based workaround since direct pair endpoint doesn\'t exist.');

      const pairInfo = await dexscreenerService.getPairInfo(samplePair.pairAddress);

      if (pairInfo) {
        console.log('\n✅ Detailed pair info retrieved via search workaround:');
        console.log(`   Symbol: ${pairInfo.symbol}`);
        console.log(`   Name: ${pairInfo.name}`);
        console.log(`   Contract: ${pairInfo.contractAddress}`);
        console.log(`   Current Price: $${pairInfo.price?.toFixed(8) || 'N/A'}`);
        console.log(`   24h Volume: $${pairInfo.volume24h?.toLocaleString() || 'N/A'}`);
        console.log(`   24h Change: ${pairInfo.priceChange24h?.toFixed(2) || 'N/A'}%`);
        console.log(`   Liquidity: $${pairInfo.liquidity?.toLocaleString() || 'N/A'}`);
        console.log(`   Market Cap: $${pairInfo.marketCap?.toLocaleString() || 'N/A'}`);
      } else {
        console.log('\n⚠️ Could not retrieve detailed pair info (this is expected with the workaround).');
      }
    }

    // Test 5: Test different limits to find maximum
    console.log('\n📊 Test 5: Testing Different Limits');
    console.log('=' .repeat(50));

    const limitsToTest = [50, 100, 150, 200];

    for (const testLimit of limitsToTest) {
      try {
        console.log(`\n🧪 Testing limit: ${testLimit}`);
        const testPairs = await dexscreenerService.getTrendingPairs(testLimit);
        console.log(`✅ Limit ${testLimit}: Retrieved ${testPairs.length} pairs`);

        if (testPairs.length < testLimit * 0.8) {
          console.log(`⚠️ Only got ${((testPairs.length / testLimit) * 100).toFixed(1)}% of requested limit`);
          console.log('   This might indicate API limits or filtering constraints');
        }
      } catch (error) {
        console.log(`❌ Limit ${testLimit}: Failed - ${error.message}`);
      }
    }

    console.log('\n📋 LIMIT TESTING COMPLETE');
    console.log('Based on results above, we can determine the optimal limit for production.');

  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
    console.error('Stack:', error.stack);
  }
}

// Run the test
testDexscreenerService().catch(console.error);
