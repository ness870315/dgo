#!/usr/bin/env node

/**
 * Portfolio Analyzer Service Test Script
 * 
 * This script tests the portfolio analysis functionality
 */

import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3002';
const TEST_WALLET = '82ytegx28N1rhU7e4rxY8MKoCTmuyZcuctx8LJL87Un8'; // Example wallet from Moralis docs

async function testPortfolioAnalyzer() {
  console.log('🧪 [Portfolio Analyzer Test] Starting tests...\n');

  try {
    // Test 1: Health Check
    console.log('1️⃣ Testing health check...');
    const healthResponse = await fetch(`${BASE_URL}/health`);
    const healthData = await healthResponse.json();
    
    if (healthResponse.ok) {
      console.log('✅ Health check passed');
      console.log(`   Service: ${healthData.service}`);
      console.log(`   Status: ${healthData.status}`);
    } else {
      console.log('❌ Health check failed');
      return;
    }

    // Test 2: Portfolio Analysis
    console.log('\n2️⃣ Testing portfolio analysis...');
    const analysisResponse = await fetch(`${BASE_URL}/api/analyze/${TEST_WALLET}`);
    const analysisData = await analysisResponse.json();
    
    if (analysisResponse.ok) {
      console.log('✅ Portfolio analysis passed');
      console.log(`   Wallet: ${analysisData.data.walletAddress}`);
      console.log(`   Total Value: $${analysisData.data.totalValue.toFixed(2)}`);
      console.log(`   Current Yield: ${analysisData.data.currentYield.toFixed(2)}%`);
      console.log(`   SOL Balance: ${analysisData.data.solBalance.sol.toFixed(4)} SOL`);
      console.log(`   LST Holdings: ${analysisData.data.lstHoldings.length} tokens`);
      console.log(`   Insights: ${analysisData.data.insights.length} recommendations`);
      
      // Show LST holdings
      if (analysisData.data.lstHoldings.length > 0) {
        console.log('   LST Holdings:');
        analysisData.data.lstHoldings.forEach(lst => {
          console.log(`     - ${lst.symbol}: ${lst.amount.toFixed(4)} (${lst.apr.toFixed(2)}% APR)`);
        });
      }
      
      // Show insights
      if (analysisData.data.insights.length > 0) {
        console.log('   Insights:');
        analysisData.data.insights.forEach(insight => {
          console.log(`     - ${insight.title}: ${insight.description}`);
        });
      }
    } else {
      console.log('❌ Portfolio analysis failed');
      console.log('   Error:', analysisData.error);
    }

    // Test 3: Portfolio Summary
    console.log('\n3️⃣ Testing portfolio summary...');
    const summaryResponse = await fetch(`${BASE_URL}/api/summary/${TEST_WALLET}`);
    const summaryData = await summaryResponse.json();
    
    if (summaryResponse.ok) {
      console.log('✅ Portfolio summary passed');
      console.log(`   Total Value: $${summaryData.data.totalValue.toFixed(2)}`);
      console.log(`   Current Yield: ${summaryData.data.currentYield.toFixed(2)}%`);
      console.log(`   SOL Balance: ${summaryData.data.solBalance.toFixed(4)} SOL`);
      console.log(`   LST Count: ${summaryData.data.lstCount}`);
      console.log(`   Insights: ${summaryData.data.insights}`);
    } else {
      console.log('❌ Portfolio summary failed');
    }

    // Test 4: Optimal Comparison
    console.log('\n4️⃣ Testing optimal comparison...');
    const compareResponse = await fetch(`${BASE_URL}/api/compare/${TEST_WALLET}`);
    const compareData = await compareResponse.json();
    
    if (compareResponse.ok) {
      console.log('✅ Optimal comparison passed');
      console.log(`   Current Yield: ${compareData.data.currentYield.toFixed(2)}%`);
      console.log(`   Optimal Yield: ${compareData.data.optimalYield.toFixed(2)}%`);
      console.log(`   Improvement: ${compareData.data.improvement.toFixed(2)}%`);
      console.log(`   Top LSTs:`);
      compareData.data.topLSTs.forEach(lst => {
        console.log(`     - ${lst.symbol}: ${lst.apr.toFixed(2)}% APR (Risk: ${lst.riskScore.toFixed(2)})`);
      });
    } else {
      console.log('❌ Optimal comparison failed');
    }

    // Test 5: Cache Stats
    console.log('\n5️⃣ Testing cache stats...');
    const cacheResponse = await fetch(`${BASE_URL}/api/cache/stats`);
    const cacheData = await cacheResponse.json();
    
    if (cacheResponse.ok) {
      console.log('✅ Cache stats passed');
      console.log(`   Cache Size: ${cacheData.data.size}`);
      console.log(`   Cache Timeout: ${cacheData.data.timeout / 1000} seconds`);
      console.log(`   Cached Wallets: ${cacheData.data.entries.length}`);
    } else {
      console.log('❌ Cache stats failed');
    }

    console.log('\n🎉 [Portfolio Analyzer Test] All tests completed!');

  } catch (error) {
    console.error('❌ [Portfolio Analyzer Test] Test failed:', error.message);
    console.log('\n💡 Make sure the Portfolio Analyzer service is running:');
    console.log('   npm start');
    console.log('   or');
    console.log('   node index.js');
    console.log('\n💡 Also ensure you have:');
    console.log('   - MORALIS_API_KEY in your .env file');
    console.log('   - LST Registry service running on port 3001');
  }
}

// Run tests
testPortfolioAnalyzer();
