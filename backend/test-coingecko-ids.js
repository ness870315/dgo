import axios from 'axios';

async function testCoinGeckoIds() {
  try {
    console.log('Fetching CoinGecko data...');
    const response = await axios.get('https://api.coingecko.com/api/v3/coins/list?include_platform=true');

    console.log(`Total coins in CoinGecko: ${response.data.length}`);

    const solanaCoins = response.data.filter(coin => coin.platforms && coin.platforms.solana);
    console.log(`Solana coins: ${solanaCoins.length}`);

    // Check some specific problematic IDs from our cache
    const problematicIds = ['-6', '-5', 'c-users-desktop-memes', 'just-buy-1-worth-of-this-coin'];

    console.log('\nChecking problematic IDs:');
    problematicIds.forEach(id => {
      const found = response.data.find(coin => coin.id === id);
      console.log(`ID '${id}': ${found ? 'EXISTS' : 'NOT FOUND'}`);
      if (found) {
        console.log(`  - Name: ${found.name}, Symbol: ${found.symbol}, Solana: ${found.platforms?.solana || 'N/A'}`);
      }
    });

  } catch (error) {
    console.error('Error:', error.message);
  }
}

testCoinGeckoIds();

