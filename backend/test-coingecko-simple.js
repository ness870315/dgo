// Simple test for CoinGecko API
import axios from 'axios';

async function testCoinGeckoAPI() {
  console.log('🪙 Testing CoinGecko API...\n');

  try {
    const url = 'https://api.coingecko.com/api/v3/coins/markets';
    const params = {
      vs_currency: 'usd',
      category: 'solana-meme-coins',
      order: 'market_cap_desc',
      per_page: 10, // Start small
      page: 1,
      sparkline: false,
      price_change_percentage: '1h,24h,7d'
    };

    console.log('🌐 Making CoinGecko API request...');
    console.log('📊 URL:', url);
    console.log('📊 Params:', JSON.stringify(params, null, 2));

    const response = await axios.get(url, { 
      params,
      timeout: 20000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    console.log('✅ Response Status:', response.status);
    console.log('📊 Response Headers:', JSON.stringify(response.headers, null, 2));
    console.log('📊 Data Length:', response.data?.length || 0);

    if (response.data && Array.isArray(response.data) && response.data.length > 0) {
      console.log('\n🎯 First Token Sample:');
      const firstToken = response.data[0];
      console.log('  Symbol:', firstToken.symbol);
      console.log('  Name:', firstToken.name);
      console.log('  Price:', firstToken.current_price);
      console.log('  Market Cap:', firstToken.market_cap);
      console.log('  ID:', firstToken.id);
    } else {
      console.log('❌ No data returned or invalid format');
    }

  } catch (error) {
    console.error('❌ CoinGecko API Error:');
    console.error('  Status:', error.response?.status);
    console.error('  Status Text:', error.response?.statusText);
    console.error('  Headers:', JSON.stringify(error.response?.headers, null, 2));
    console.error('  Message:', error.message);
    
    if (error.response?.status === 429) {
      console.log('🚨 Rate Limited! Need to implement better rate limiting.');
    }
  }
}

testCoinGeckoAPI().catch(console.error);





