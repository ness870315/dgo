import axios from 'axios';

const MORALIS_API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJub25jZSI6IjM1MDZiMzhjLTY5ZjUtNDkxZi1hYWZiLWZiMWU1OTkwZjE0YyIsIm9yZ0lkIjoiMzg5MzI4IiwidXNlcklkIjoiNDAwMDYwIiwidHlwZUlkIjoiNzBiNTgxMTItMGQ2MS00NmFlLWI2ODgtNGNmNWRkOWQ0MjExIiwidHlwZSI6IlBST0pFQ1QiLCJpYXQiOjE3NjA5MDEyNjQsImV4cCI6NDkxNjY2MTI2NH0.BMO8_NLNDwFvWE-3nFM4A7aLrTbDqfrHeb-Yptt1018';

/**
 * Test Moralis API pagination for bonding tokens
 */
async function testMoralisPagination() {
  console.log('🧪 Testing Moralis API Pagination for Bonding Tokens');
  console.log('=' .repeat(60));
  
  try {
    const allTokens = [];
    let cursor = null;
    let page = 1;
    const maxPages = 5; // Limit to 5 pages for testing (500 tokens max)
    
    while (page <= maxPages) {
      console.log(`\n📄 Fetching page ${page}...`);
      
      const params = { limit: 100 };
      if (cursor) {
        params.cursor = cursor;
      }
      
      const url = 'https://solana-gateway.moralis.io/token/mainnet/exchange/pumpfun/bonding';
      console.log(`🔗 API URL: ${url}`);
      console.log(`📋 Params:`, params);
      
      const response = await axios.get(url, {
        headers: {
          'accept': 'application/json',
          'X-API-Key': MORALIS_API_KEY
        },
        params,
        timeout: 30000
      });
      
      if (!response.data || !response.data.result) {
        console.log(`❌ Page ${page}: No data received`);
        break;
      }
      
      const tokens = response.data.result;
      const nextCursor = response.data.cursor;
      
      console.log(`✅ Page ${page}: Received ${tokens.length} tokens`);
      console.log(`📊 Next cursor: ${nextCursor || 'null'}`);
      
      // Add tokens to our collection
      allTokens.push(...tokens);
      
      // Check if we have a next cursor
      if (!nextCursor) {
        console.log(`📄 No more pages available`);
        break;
      }
      
      cursor = nextCursor;
      page++;
      
      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log(`\n📈 Pagination Test Results:`);
    console.log('=' .repeat(60));
    console.log(`📄 Total pages fetched: ${page - 1}`);
    console.log(`🔢 Total tokens collected: ${allTokens.length}`);
    
    // Check for duplicates
    const tokenAddresses = allTokens.map(t => t.tokenAddress);
    const uniqueAddresses = new Set(tokenAddresses);
    const duplicates = allTokens.length - uniqueAddresses.size;
    
    console.log(`🔄 Duplicates found: ${duplicates}`);
    console.log(`✅ Unique tokens: ${uniqueAddresses.size}`);
    
    // Look for our target token
    const targetToken = allTokens.find(t => t.tokenAddress === 'Uu6B7UK3o2o8q14UzZwhP8wc9uBVVuqKp9YDRKgpump');
    
    if (targetToken) {
      console.log(`\n🎯 Target token found!`);
      console.log(`  Name: ${targetToken.name}`);
      console.log(`  Symbol: ${targetToken.symbol}`);
      console.log(`  Bonding Progress: ${targetToken.bondingCurveProgress}%`);
      console.log(`  Price USD: $${targetToken.priceUsd}`);
      console.log(`  Liquidity: $${targetToken.liquidity}`);
    } else {
      console.log(`\n❌ Target token NOT found in ${allTokens.length} tokens`);
    }
    
    // Show sample tokens from different pages
    console.log(`\n📋 Sample tokens from different pages:`);
    const sampleSize = Math.min(5, allTokens.length);
    for (let i = 0; i < sampleSize; i++) {
      const token = allTokens[i];
      console.log(`  ${i + 1}. ${token.symbol} (${token.tokenAddress.substring(0, 8)}...) - ${token.bondingCurveProgress}%`);
    }
    
    return {
      totalTokens: allTokens.length,
      uniqueTokens: uniqueAddresses.size,
      duplicates,
      targetTokenFound: !!targetToken,
      pages: page - 1
    };
    
  } catch (error) {
    console.error('❌ Pagination test failed:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    return null;
  }
}

/**
 * Test single page fetch for comparison
 */
async function testSinglePage() {
  console.log('\n\n🔬 Testing Single Page Fetch (for comparison)');
  console.log('=' .repeat(60));
  
  try {
    const url = 'https://solana-gateway.moralis.io/token/mainnet/exchange/pumpfun/bonding';
    const response = await axios.get(url, {
      headers: {
        'accept': 'application/json',
        'X-API-Key': MORALIS_API_KEY
      },
      params: { limit: 100 },
      timeout: 30000
    });
    
    if (response.data && response.data.result) {
      const tokens = response.data.result;
      console.log(`✅ Single page: Received ${tokens.length} tokens`);
      console.log(`📊 Cursor available: ${response.data.cursor ? 'Yes' : 'No'}`);
      
      const targetToken = tokens.find(t => t.tokenAddress === 'Uu6B7UK3o2o8q14UzZwhP8wc9uBVVuqKp9YDRKgpump');
      
      if (targetToken) {
        console.log(`🎯 Target token found in first page!`);
      } else {
        console.log(`❌ Target token NOT in first page`);
      }
      
      return tokens.length;
    }
    
    return 0;
  } catch (error) {
    console.error('❌ Single page test failed:', error.message);
    return 0;
  }
}

/**
 * Main test function
 */
async function main() {
  console.log('🚀 Starting Moralis API Pagination Test');
  console.log(`⏰ Test started at: ${new Date().toISOString()}`);
  
  // Test single page first
  const singlePageCount = await testSinglePage();
  
  // Test pagination
  const paginationResults = await testMoralisPagination();
  
  console.log('\n🏁 Test completed');
  console.log(`⏰ Test finished at: ${new Date().toISOString()}`);
  
  if (paginationResults) {
    console.log('\n📋 Final Comparison:');
    console.log(`Single page: ${singlePageCount} tokens`);
    console.log(`With pagination: ${paginationResults.totalTokens} tokens`);
    console.log(`Improvement: ${paginationResults.totalTokens - singlePageCount} additional tokens`);
    console.log(`Target token found: ${paginationResults.targetTokenFound ? 'Yes' : 'No'}`);
  }
}

// Run the test
main().catch(console.error);
