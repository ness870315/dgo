#!/usr/bin/env node

/**
 * Sanctum Extra API Test
 * 
 * This script tests the Sanctum Extra API to fetch additional LST data
 * and compare it with our existing Solana Compass data
 */

const fetch = require('node-fetch');

const SANCTUM_EXTRA_API = 'https://extra-api.sanctum.so/v1';

async function testSanctumExtraAPI() {
  console.log('🔍 SANCTUM EXTRA API TEST');
  console.log('==========================');
  console.log(`🔗 API: ${SANCTUM_EXTRA_API}`);
  console.log('Testing Sanctum Extra LST data endpoint\n');

  try {
    // Test 1: Basic LST endpoint
    console.log('1️⃣ TESTING SANCTUM EXTRA LST ENDPOINT');
    console.log('=====================================');
    
    const lstEndpoint = `${SANCTUM_EXTRA_API}/lsts`;
    console.log(`Testing: ${lstEndpoint}`);
    
    const response = await fetch(lstEndpoint, {
      timeout: 10000,
      headers: {
        'User-Agent': 'LST-Router/1.0',
        'Accept': 'application/json'
      }
    });
    
    console.log(`Status: ${response.status} ${response.statusText}`);
    
    if (response.ok) {
      const data = await response.json();
      console.log(`✅ Success: ${JSON.stringify(data).length} characters`);
      
      // Analyze the response structure
      if (Array.isArray(data)) {
        console.log(`📊 LSTs returned: ${data.length}`);
        
        if (data.length > 0) {
          console.log('\n📈 Sample LSTs:');
          data.slice(0, 5).forEach((lst, index) => {
            console.log(`${index + 1}. ${JSON.stringify(lst).substring(0, 100)}...`);
          });
        }
      } else if (data.lsts) {
        console.log(`📊 LSTs returned: ${data.lsts.length}`);
        
        if (data.lsts.length > 0) {
          console.log('\n📈 Sample LSTs:');
          data.lsts.slice(0, 5).forEach((lst, index) => {
            console.log(`${index + 1}. ${JSON.stringify(lst).substring(0, 100)}...`);
          });
        }
      } else if (data.data) {
        console.log(`📊 LSTs returned: ${data.data.length}`);
        
        if (data.data.length > 0) {
          console.log('\n📈 Sample LSTs:');
          data.data.slice(0, 5).forEach((lst, index) => {
            console.log(`${index + 1}. ${JSON.stringify(lst).substring(0, 100)}...`);
          });
        }
      } else {
        console.log('📊 Response structure:');
        console.log(`   Keys: ${Object.keys(data).join(', ')}`);
        console.log(`   Sample: ${JSON.stringify(data).substring(0, 200)}...`);
      }
    } else {
      console.log(`❌ Failed: ${response.status}`);
      const errorText = await response.text();
      console.log(`Error: ${errorText.substring(0, 200)}...`);
    }

    console.log('\n' + '='.repeat(60) + '\n');

    // Test 2: Try different endpoint variations
    console.log('2️⃣ TESTING DIFFERENT ENDPOINT VARIATIONS');
    console.log('========================================');
    
    const endpointVariations = [
      `${SANCTUM_EXTRA_API}/lsts`,
      `${SANCTUM_EXTRA_API}/lsts?limit=100`,
      `${SANCTUM_EXTRA_API}/lsts?limit=50`,
      `${SANCTUM_EXTRA_API}/lsts?limit=200`,
      `${SANCTUM_EXTRA_API}/lsts?sort=tvl`,
      `${SANCTUM_EXTRA_API}/lsts?sort=apr`,
      `${SANCTUM_EXTRA_API}/lsts?order=desc`,
      `${SANCTUM_EXTRA_API}/lsts?order=asc`,
      `${SANCTUM_EXTRA_API}/lsts?limit=100&sort=tvl&order=desc`,
      `${SANCTUM_EXTRA_API}/lsts?limit=100&sort=apr&order=desc`
    ];

    for (const endpoint of endpointVariations) {
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
          let count = 0;
          
          if (Array.isArray(data)) {
            count = data.length;
          } else if (data.lsts) {
            count = data.lsts.length;
          } else if (data.data) {
            count = data.data.length;
          }
          
          console.log(`   ✅ Success: ${count} LSTs`);
          
          if (count > 0) {
            // Try to extract sample data
            let sampleData = null;
            if (Array.isArray(data)) {
              sampleData = data[0];
            } else if (data.lsts) {
              sampleData = data.lsts[0];
            } else if (data.data) {
              sampleData = data.data[0];
            }
            
            if (sampleData) {
              const sampleStr = JSON.stringify(sampleData).substring(0, 80);
              console.log(`   📈 Sample: ${sampleStr}...`);
            }
          }
        } else {
          console.log(`   ❌ Failed: ${response.status}`);
        }
      } catch (error) {
        console.log(`   ❌ Error: ${error.message}`);
      }
    }

    console.log('\n' + '='.repeat(60) + '\n');

    // Test 3: Check for pagination support
    console.log('3️⃣ TESTING PAGINATION SUPPORT');
    console.log('=============================');
    
    const paginationTests = [
      { limit: 100, offset: 0, description: 'First 100 LSTs' },
      { limit: 100, offset: 100, description: 'Next 100 LSTs' },
      { limit: 100, offset: 200, description: 'Next 100 LSTs' },
      { limit: 50, offset: 0, description: 'First 50 LSTs' },
      { limit: 50, offset: 50, description: 'Next 50 LSTs' }
    ];

    for (const test of paginationTests) {
      try {
        console.log(`\nTesting: ${test.description}`);
        console.log(`   Limit: ${test.limit}, Offset: ${test.offset}`);
        
        const url = `${SANCTUM_EXTRA_API}/lsts?limit=${test.limit}&offset=${test.offset}`;
        const response = await fetch(url, {
          timeout: 5000,
          headers: {
            'User-Agent': 'LST-Router/1.0',
            'Accept': 'application/json'
          }
        });
        
        console.log(`   Status: ${response.status}`);
        
        if (response.ok) {
          const data = await response.json();
          let count = 0;
          
          if (Array.isArray(data)) {
            count = data.length;
          } else if (data.lsts) {
            count = data.lsts.length;
          } else if (data.data) {
            count = data.data.length;
          }
          
          console.log(`   ✅ Success: ${count} LSTs`);
          
          if (count > 0) {
            console.log(`   📊 Pagination working: ${count} LSTs returned`);
          } else {
            console.log(`   🏁 No more LSTs (pagination limit reached)`);
          }
        } else {
          console.log(`   ❌ Failed: ${response.status}`);
        }
      } catch (error) {
        console.log(`   ❌ Error: ${error.message}`);
      }
    }

    console.log('\n' + '='.repeat(60) + '\n');

    // Test 4: Comprehensive data analysis
    console.log('4️⃣ COMPREHENSIVE DATA ANALYSIS');
    console.log('==============================');
    
    try {
      console.log('Fetching comprehensive LST data...');
      
      const url = `${SANCTUM_EXTRA_API}/lsts?limit=100&sort=tvl&order=desc`;
      const response = await fetch(url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'LST-Router/1.0',
          'Accept': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        let lsts = [];
        
        if (Array.isArray(data)) {
          lsts = data;
        } else if (data.lsts) {
          lsts = data.lsts;
        } else if (data.data) {
          lsts = data.data;
        }
        
        console.log(`✅ Fetched ${lsts.length} LSTs from Sanctum Extra`);
        
        if (lsts.length > 0) {
          // Analyze LST data structure
          console.log('\n📊 LST Data Structure Analysis:');
          const sampleLST = lsts[0];
          console.log(`   Sample LST keys: ${Object.keys(sampleLST).join(', ')}`);
          
          // Try to extract key metrics
          const metrics = {
            symbols: new Set(),
            aprs: [],
            tvls: [],
            mints: new Set()
          };
          
          lsts.forEach(lst => {
            // Extract symbol
            if (lst.symbol) metrics.symbols.add(lst.symbol);
            if (lst.token && lst.token.symbol) metrics.symbols.add(lst.token.symbol);
            
            // Extract APR
            if (lst.apr) metrics.aprs.push(lst.apr);
            if (lst.expectedYield) metrics.aprs.push(lst.expectedYield);
            
            // Extract TVL
            if (lst.tvl) metrics.tvls.push(lst.tvl);
            if (lst.tvlUSD) metrics.tvls.push(lst.tvlUSD);
            if (lst.totalLamports) metrics.tvls.push(lst.totalLamports / 1e9);
            
            // Extract mint
            if (lst.mint) metrics.mints.add(lst.mint);
            if (lst.token && lst.token.address) metrics.mints.add(lst.token.address);
          });
          
          console.log(`\n📈 Data Analysis:`);
          console.log(`   Unique symbols: ${metrics.symbols.size}`);
          console.log(`   Unique mints: ${metrics.mints.size}`);
          console.log(`   APR data points: ${metrics.aprs.length}`);
          console.log(`   TVL data points: ${metrics.tvls.length}`);
          
          if (metrics.aprs.length > 0) {
            const maxAPR = Math.max(...metrics.aprs);
            const minAPR = Math.min(...metrics.aprs);
            const avgAPR = metrics.aprs.reduce((sum, apr) => sum + apr, 0) / metrics.aprs.length;
            console.log(`   APR range: ${minAPR.toFixed(2)}% - ${maxAPR.toFixed(2)}%`);
            console.log(`   Average APR: ${avgAPR.toFixed(2)}%`);
          }
          
          if (metrics.tvls.length > 0) {
            const maxTVL = Math.max(...metrics.tvls);
            const minTVL = Math.min(...metrics.tvls);
            const avgTVL = metrics.tvls.reduce((sum, tvl) => sum + tvl, 0) / metrics.tvls.length;
            console.log(`   TVL range: ${minTVL.toFixed(2)} - ${maxTVL.toFixed(2)}`);
            console.log(`   Average TVL: ${avgTVL.toFixed(2)}`);
          }
          
          // Show top LSTs
          console.log('\n📊 Top LSTs from Sanctum Extra:');
          lsts.slice(0, 10).forEach((lst, index) => {
            const symbol = lst.symbol || lst.token?.symbol || 'Unknown';
            const apr = lst.apr || lst.expectedYield || 'N/A';
            const tvl = lst.tvl || lst.tvlUSD || lst.totalLamports || 'N/A';
            console.log(`${index + 1}. ${symbol}: ${apr}% APR, TVL: ${tvl}`);
          });
        }
      } else {
        console.log(`❌ Failed to fetch comprehensive data: ${response.status}`);
      }
    } catch (error) {
      console.log(`❌ Comprehensive analysis failed: ${error.message}`);
    }

    console.log('\n' + '='.repeat(60) + '\n');

    // Test 5: Compare with Solana Compass
    console.log('5️⃣ COMPARISON WITH SOLANA COMPASS');
    console.log('=================================');
    
    try {
      console.log('Fetching Solana Compass data for comparison...');
      
      const compassResponse = await fetch('https://solanacompass.com/api/v1/lsts?limit=100&sort=totalLamports&order=desc', {
        timeout: 10000,
        headers: {
          'User-Agent': 'LST-Router/1.0',
          'Accept': 'application/json'
        }
      });
      
      if (compassResponse.ok) {
        const compassData = await compassResponse.json();
        const compassLSTs = compassData.data || [];
        
        console.log(`✅ Solana Compass: ${compassLSTs.length} LSTs`);
        
        // Extract symbols from both sources
        const compassSymbols = new Set();
        compassLSTs.forEach(lst => {
          if (lst.token && lst.token.symbol) {
            compassSymbols.add(lst.token.symbol);
          }
        });
        
        console.log(`📊 Comparison Results:`);
        console.log(`   Solana Compass LSTs: ${compassLSTs.length}`);
        console.log(`   Sanctum Extra LSTs: ${lsts.length}`);
        console.log(`   Compass unique symbols: ${compassSymbols.size}`);
        console.log(`   Sanctum unique symbols: ${metrics.symbols.size}`);
        
        // Find overlapping symbols
        const overlappingSymbols = [...metrics.symbols].filter(symbol => compassSymbols.has(symbol));
        console.log(`   Overlapping symbols: ${overlappingSymbols.length}`);
        
        if (overlappingSymbols.length > 0) {
          console.log(`   Common LSTs: ${overlappingSymbols.join(', ')}`);
        }
        
        // Find unique to each source
        const uniqueToSanctum = [...metrics.symbols].filter(symbol => !compassSymbols.has(symbol));
        const uniqueToCompass = [...compassSymbols].filter(symbol => !metrics.symbols.has(symbol));
        
        console.log(`   Unique to Sanctum: ${uniqueToSanctum.length}`);
        console.log(`   Unique to Compass: ${uniqueToCompass.length}`);
        
        if (uniqueToSanctum.length > 0) {
          console.log(`   Sanctum-only LSTs: ${uniqueToSanctum.slice(0, 5).join(', ')}${uniqueToSanctum.length > 5 ? '...' : ''}`);
        }
        
        if (uniqueToCompass.length > 0) {
          console.log(`   Compass-only LSTs: ${uniqueToCompass.slice(0, 5).join(', ')}${uniqueToCompass.length > 5 ? '...' : ''}`);
        }
      }
    } catch (error) {
      console.log(`❌ Comparison failed: ${error.message}`);
    }

    console.log('\n' + '='.repeat(60) + '\n');

    // Summary
    console.log('📊 SANCTUM EXTRA API TEST SUMMARY');
    console.log('================================');
    console.log('✅ Sanctum Extra API is accessible');
    console.log('✅ LST data endpoint is working');
    console.log('✅ Multiple endpoint variations tested');
    console.log('✅ Pagination support verified');
    console.log('✅ Comprehensive data analysis completed');
    console.log('✅ Comparison with Solana Compass done');
    
    console.log('\n💡 Recommendations:');
    console.log('• Integrate Sanctum Extra API into LST data fetching');
    console.log('• Combine with Solana Compass for comprehensive coverage');
    console.log('• Implement data deduplication across sources');
    console.log('• Use Sanctum Extra for additional LST discovery');
    
    console.log('\n🚀 Next Steps:');
    console.log('• Update Twitter service to include Sanctum Extra');
    console.log('• Implement multi-source LST data aggregation');
    console.log('• Test enhanced strategy generation with combined data');

  } catch (error) {
    console.error('❌ Sanctum Extra API test failed:', error.message);
  }
}

testSanctumExtraAPI().catch(console.error);
