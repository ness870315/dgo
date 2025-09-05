import axios from 'axios';

const JUPITER_API_KEY = process.env.JUPITER_API_KEY || '';
const FORCE_LITE_API = (process.env.FORCE_LITE_API || 'true') === 'true';
const JUP_BASE = process.env.JUP_BASE || (FORCE_LITE_API ? 'https://lite-api.jup.ag/tokens/v2' : (JUPITER_API_KEY ? 'https://api.jup.ag/tokens/v2' : 'https://lite-api.jup.ag/tokens/v2'));

const SEARCHES = [
  { key: 'JupTrending5m', category: 'toptrending', interval: '5m' },
  { key: 'JupOrganic5m', category: 'toporganicscore', interval: '5m' },
  { key: 'JupTraded5m', category: 'toptraded', interval: '5m' }
];

async function testJupiterEndpoint(category, interval, limit = 10) {
  const url = `${JUP_BASE}/${encodeURIComponent(category)}/${encodeURIComponent(interval)}`;
  
  console.log(`\n🧪 Testing: ${category}/${interval}`);
  console.log(`   URL: ${url}`);
  console.log(`   API Key: ${JUPITER_API_KEY ? 'Present' : 'None'}`);
  console.log(`   Force Lite: ${FORCE_LITE_API}`);
  
  try {
    const res = await axios.get(url, {
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36',
        'Cache-Control': 'no-cache',
        'Origin': 'https://jup.ag',
        'Referer': 'https://jup.ag/',
        ...(JUPITER_API_KEY && !FORCE_LITE_API ? { 'Authorization': `Bearer ${JUPITER_API_KEY}` } : {})
      },
      params: { limit },
      timeout: 20000,
      validateStatus: () => true // Accept all status codes
    });

    console.log(`   Status: ${res.status}`);
    console.log(`   Headers:`, Object.keys(res.headers).join(', '));
    
    if (res.status === 200) {
      const data = Array.isArray(res.data) ? res.data : (res.data?.tokens || []);
      console.log(`   ✅ Success: ${data.length} items returned`);
      
      if (data.length > 0) {
        const sample = data[0];
        console.log(`   📊 Sample item keys:`, Object.keys(sample).join(', '));
        console.log(`   📊 Sample item:`, JSON.stringify(sample, null, 2).substring(0, 300) + '...');
        
        // Test our normalization
        const normalized = {
          symbol: (sample.symbol || '').toUpperCase(),
          name: sample.name || sample.symbol || 'Unknown',
          contractAddress: sample.contractAddress || sample.address || sample.mint || null,
          price: sample.price ?? sample.uiPrice ?? sample.currentPrice ?? sample.priceUsd ?? null,
          mcap: sample.mcap ?? sample.marketCap ?? null,
          liquidity: sample.liquidity ?? sample.liq ?? null,
          volume1h: sample.volume1h ?? (sample.volume && (sample.volume['1h'] || sample.volume.h1)) ?? null,
          trades1h: sample.trades1h ?? (sample.trades && (sample.trades['1h'] || sample.trades.h1)) ?? null,
          change1hPct: sample.change1hPct ?? (sample.priceChange && (sample.priceChange['1h'] || sample.priceChange.h1)) ?? null,
          holders: sample.holders ?? sample.holderCount ?? null,
          graduatedAt: sample.graduatedAt || sample.graduated_at || null
        };
        
        console.log(`   🔄 Normalized:`, JSON.stringify(normalized, null, 2));
        
        // Check if it would pass our filters
        const hasContract = normalized.contractAddress && normalized.contractAddress.length >= 10;
        const hasSymbol = normalized.symbol && normalized.symbol !== '';
        const isStable = ['SOL', 'JUP', 'WETH', 'WSOL', 'WBTC', 'USDC'].includes(normalized.symbol);
        
        console.log(`   🔍 Filter check:`);
        console.log(`      Has contract (>=10 chars): ${hasContract}`);
        console.log(`      Has symbol: ${hasSymbol}`);
        console.log(`      Is stable coin: ${isStable}`);
        console.log(`      Would pass filters: ${hasContract && hasSymbol && !isStable}`);
      }
    } else {
      console.log(`   ❌ Error: HTTP ${res.status}`);
      console.log(`   Response:`, res.data ? JSON.stringify(res.data, null, 2).substring(0, 500) : 'No data');
    }
    
  } catch (error) {
    console.log(`   ❌ Exception: ${error.message}`);
    if (error.response) {
      console.log(`   Response status: ${error.response.status}`);
      console.log(`   Response data:`, error.response.data ? JSON.stringify(error.response.data, null, 2).substring(0, 500) : 'No data');
    }
  }
}

async function main() {
  console.log('🚀 Jupiter Discovery API Test');
  console.log('===============================');
  console.log(`JUP_BASE: ${JUP_BASE}`);
  console.log(`FORCE_LITE_API: ${FORCE_LITE_API}`);
  console.log(`JUPITER_API_KEY: ${JUPITER_API_KEY ? 'Set' : 'Not set'}`);
  
  for (const search of SEARCHES) {
    await testJupiterEndpoint(search.category, search.interval, 5);
    await new Promise(resolve => setTimeout(resolve, 2000)); // 2s delay between tests
  }
  
  console.log('\n✅ Test completed');
}

main().catch(console.error);
