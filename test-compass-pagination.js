#!/usr/bin/env node

/**
 * Solana Compass API Pagination Test
 * 
 * This script tests if we can fetch more than 100 LSTs from Solana Compass
 * by implementing pagination and exploring different endpoints
 */

const fetch = require('node-fetch');

async function testCompassPagination() {
  console.log('🔍 SOLANA COMPASS API PAGINATION TEST');
  console.log('=====================================');
  console.log('Testing if we can fetch more than 100 LSTs\n');

  try {
    // Test 1: Check different pagination parameters
    console.log('1️⃣ TESTING DIFFERENT PAGINATION PARAMETERS');
    console.log('==========================================');
    
    const paginationTests = [
      { limit: 100, offset: 0, description: 'Default (100 LSTs)' },
      { limit: 200, offset: 0, description: '200 LSTs (double limit)' },
      { limit: 500, offset: 0, description: '500 LSTs (5x limit)' },
      { limit: 100, offset: 100, description: 'Next 100 LSTs (offset 100)' },
      { limit: 100, offset: 200, description: 'Next 100 LSTs (offset 200)' },
      { limit: 50, offset: 0, description: '50 LSTs (smaller batch)' },
      { limit: 1000, offset: 0, description: '1000 LSTs (max attempt)' }
    ];

    const results = [];

    for (const test of paginationTests) {
      try {
        console.log(`\nTesting: ${test.description}`);
        console.log(`   Limit: ${test.limit}, Offset: ${test.offset}`);
        
        const url = `https://solanacompass.com/api/v1/lsts?limit=${test.limit}&offset=${test.offset}&sort=totalLamports&order=desc`;
        console.log(`   URL: ${url}`);
        
        const response = await fetch(url, {
          timeout: 10000,
          headers: {
            'User-Agent': 'LST-Router/1.0',
            'Accept': 'application/json'
          }
        });
        
        console.log(`   Status: ${response.status} ${response.statusText}`);
        
        if (response.ok) {
          const data = await response.json();
          const lstCount = data.data ? data.data.length : 0;
          const totalCount = data.total || data.count || 'Unknown';
          
          console.log(`   ✅ Success: ${lstCount} LSTs returned`);
          console.log(`   📊 Total available: ${totalCount}`);
          
          if (lstCount > 0) {
            console.log(`   📈 Sample LSTs:`);
            data.data.slice(0, 3).forEach((lst, index) => {
              const symbol = lst.token?.symbol || 'Unknown';
              const tvl = lst.totalLamports ? (lst.totalLamports / 1e9).toFixed(2) : 'N/A';
              console.log(`     ${index + 1}. ${symbol}: ${tvl} SOL TVL`);
            });
          }
          
          results.push({
            ...test,
            success: true,
            lstCount,
            totalCount,
            data: data
          });
        } else {
          console.log(`   ❌ Failed: ${response.status}`);
          const errorText = await response.text();
          console.log(`   Error: ${errorText.substring(0, 200)}...`);
          
          results.push({
            ...test,
            success: false,
            error: response.statusText
          });
        }
      } catch (error) {
        console.log(`   ❌ Error: ${error.message}`);
        results.push({
          ...test,
          success: false,
          error: error.message
        });
      }
    }

    console.log('\n' + '='.repeat(60) + '\n');

    // Test 2: Try different API endpoints
    console.log('2️⃣ TESTING DIFFERENT API ENDPOINTS');
    console.log('==================================');
    
    const endpointTests = [
      { url: 'https://solanacompass.com/api/v1/lsts', description: 'Basic LSTs endpoint' },
      { url: 'https://solanacompass.com/api/v1/lsts?limit=1000', description: 'LSTs with high limit' },
      { url: 'https://solanacompass.com/api/v1/lsts?limit=100&page=1', description: 'LSTs with page parameter' },
      { url: 'https://solanacompass.com/api/v1/lsts?limit=100&page=2', description: 'LSTs page 2' },
      { url: 'https://solanacompass.com/api/v1/lsts?limit=100&page=3', description: 'LSTs page 3' },
      { url: 'https://solanacompass.com/api/v1/stake-pools', description: 'Stake pools endpoint' },
      { url: 'https://solanacompass.com/api/v1/stake-pools?limit=1000', description: 'Stake pools with high limit' }
    ];

    for (const test of endpointTests) {
      try {
        console.log(`\nTesting: ${test.description}`);
        console.log(`   URL: ${test.url}`);
        
        const response = await fetch(test.url, {
          timeout: 10000,
          headers: {
            'User-Agent': 'LST-Router/1.0',
            'Accept': 'application/json'
          }
        });
        
        console.log(`   Status: ${response.status} ${response.statusText}`);
        
        if (response.ok) {
          const data = await response.json();
          const lstCount = data.data ? data.data.length : 0;
          const totalCount = data.total || data.count || 'Unknown';
          
          console.log(`   ✅ Success: ${lstCount} items returned`);
          console.log(`   📊 Total available: ${totalCount}`);
          
          if (lstCount > 0) {
            console.log(`   📈 Sample items:`);
            data.data.slice(0, 2).forEach((item, index) => {
              const symbol = item.token?.symbol || item.symbol || 'Unknown';
              const tvl = item.totalLamports ? (item.totalLamports / 1e9).toFixed(2) : 'N/A';
              console.log(`     ${index + 1}. ${symbol}: ${tvl} SOL TVL`);
            });
          }
        } else {
          console.log(`   ❌ Failed: ${response.status}`);
        }
      } catch (error) {
        console.log(`   ❌ Error: ${error.message}`);
      }
    }

    console.log('\n' + '='.repeat(60) + '\n');

    // Test 3: Implement pagination loop
    console.log('3️⃣ IMPLEMENTING PAGINATION LOOP');
    console.log('===============================');
    
    let allLSTs = [];
    let page = 1;
    let hasMore = true;
    const maxPages = 10; // Safety limit
    
    console.log('Fetching LSTs page by page...\n');
    
    while (hasMore && page <= maxPages) {
      try {
        console.log(`Fetching page ${page}...`);
        
        const url = `https://solanacompass.com/api/v1/lsts?limit=100&page=${page}&sort=totalLamports&order=desc`;
        const response = await fetch(url, {
          timeout: 10000,
          headers: {
            'User-Agent': 'LST-Router/1.0',
            'Accept': 'application/json'
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          const lsts = data.data || [];
          
          console.log(`   ✅ Page ${page}: ${lsts.length} LSTs`);
          
          if (lsts.length > 0) {
            allLSTs = allLSTs.concat(lsts);
            console.log(`   📊 Total LSTs so far: ${allLSTs.length}`);
            
            // Show sample from this page
            if (lsts.length > 0) {
              const sample = lsts[0];
              const symbol = sample.token?.symbol || 'Unknown';
              const tvl = sample.totalLamports ? (sample.totalLamports / 1e9).toFixed(2) : 'N/A';
              console.log(`   📈 Sample: ${symbol} (${tvl} SOL TVL)`);
            }
            
            // Check if there are more pages
            if (lsts.length < 100) {
              hasMore = false;
              console.log(`   🏁 Last page reached (${lsts.length} < 100)`);
            } else {
              page++;
            }
          } else {
            hasMore = false;
            console.log(`   🏁 No more LSTs found`);
          }
        } else {
          console.log(`   ❌ Page ${page} failed: ${response.status}`);
          hasMore = false;
        }
        
        // Small delay between requests
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.log(`   ❌ Page ${page} error: ${error.message}`);
        hasMore = false;
      }
    }
    
    console.log(`\n📊 PAGINATION RESULTS:`);
    console.log(`   Total LSTs fetched: ${allLSTs.length}`);
    console.log(`   Pages processed: ${page - 1}`);
    
    if (allLSTs.length > 0) {
      // Analyze the LSTs
      const uniqueSymbols = new Set();
      const tvlStats = [];
      
      allLSTs.forEach(lst => {
        const symbol = lst.token?.symbol;
        if (symbol) uniqueSymbols.add(symbol);
        
        if (lst.totalLamports) {
          tvlStats.push(lst.totalLamports / 1e9);
        }
      });
      
      console.log(`   Unique LST symbols: ${uniqueSymbols.size}`);
      
      if (tvlStats.length > 0) {
        const maxTVL = Math.max(...tvlStats);
        const minTVL = Math.min(...tvlStats);
        const avgTVL = tvlStats.reduce((sum, tvl) => sum + tvl, 0) / tvlStats.length;
        
        console.log(`   TVL Range: ${minTVL.toFixed(2)} - ${maxTVL.toFixed(2)} SOL`);
        console.log(`   Average TVL: ${avgTVL.toFixed(2)} SOL`);
      }
      
      // Show top LSTs by TVL
      const sortedLSTs = allLSTs
        .filter(lst => lst.totalLamports)
        .sort((a, b) => b.totalLamports - a.totalLamports)
        .slice(0, 10);
      
      console.log(`\n📈 TOP 10 LSTs BY TVL:`);
      sortedLSTs.forEach((lst, index) => {
        const symbol = lst.token?.symbol || 'Unknown';
        const tvl = (lst.totalLamports / 1e9).toFixed(2);
        console.log(`   ${index + 1}. ${symbol}: ${tvl} SOL TVL`);
      });
    }

    console.log('\n' + '='.repeat(60) + '\n');

    // Test 4: Check for alternative endpoints
    console.log('4️⃣ CHECKING ALTERNATIVE ENDPOINTS');
    console.log('=================================');
    
    const alternativeEndpoints = [
      'https://solanacompass.com/api/v1/lsts?limit=100&sort=totalLamports&order=desc',
      'https://solanacompass.com/api/v1/lsts?limit=100&sort=validatorCount&order=desc',
      'https://solanacompass.com/api/v1/lsts?limit=100&sort=createdAt&order=desc',
      'https://solanacompass.com/api/v1/stake-pools?limit=100&sort=totalLamports&order=desc',
      'https://solanacompass.com/api/v1/validators?limit=100&sort=totalLamports&order=desc'
    ];

    for (const endpoint of alternativeEndpoints) {
      try {
        console.log(`\nTesting: ${endpoint}`);
        
        const response = await fetch(endpoint, {
          timeout: 5000,
          headers: {
            'User-Agent': 'LST-Router/1.0',
            'Accept': 'application/json'
          }
        });
        
        console.log(`   Status: ${response.status}`);
        
        if (response.ok) {
          const data = await response.json();
          const count = data.data ? data.data.length : 0;
          console.log(`   ✅ Success: ${count} items`);
          
          if (count > 0) {
            const sample = data.data[0];
            const symbol = sample.token?.symbol || sample.symbol || 'Unknown';
            console.log(`   📈 Sample: ${symbol}`);
          }
        } else {
          console.log(`   ❌ Failed: ${response.status}`);
        }
      } catch (error) {
        console.log(`   ❌ Error: ${error.message}`);
      }
    }

    console.log('\n' + '='.repeat(60) + '\n');

    // Summary
    console.log('📊 PAGINATION TEST SUMMARY');
    console.log('=========================');
    
    const successfulTests = results.filter(r => r.success);
    const maxLSTs = Math.max(...successfulTests.map(r => r.lstCount));
    
    console.log(`✅ Successful tests: ${successfulTests.length}/${results.length}`);
    console.log(`📊 Maximum LSTs fetched: ${maxLSTs}`);
    console.log(`📈 Total LSTs via pagination: ${allLSTs.length}`);
    
    if (allLSTs.length > 100) {
      console.log(`\n🎉 SUCCESS: Can fetch more than 100 LSTs!`);
      console.log(`   Improvement: ${allLSTs.length} LSTs vs 100 LSTs`);
      console.log(`   Increase: +${((allLSTs.length - 100) / 100 * 100).toFixed(1)}%`);
    } else {
      console.log(`\n⚠️ Limited to 100 LSTs per request`);
    }
    
    console.log('\n💡 Recommendations:');
    console.log('• Implement pagination loop for comprehensive LST data');
    console.log('• Use multiple sorting options to discover more LSTs');
    console.log('• Cache results to avoid repeated API calls');
    console.log('• Implement fallback to other LST data sources');
    
    console.log('\n🚀 Next Steps:');
    console.log('• Integrate pagination into Twitter service');
    console.log('• Update LST data fetching logic');
    console.log('• Test with enhanced strategy generation');

  } catch (error) {
    console.error('❌ Pagination test failed:', error.message);
  }
}

testCompassPagination().catch(console.error);
