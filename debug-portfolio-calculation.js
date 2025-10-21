#!/usr/bin/env node

/**
 * Debug Portfolio Calculation
 * 
 * This script debugs the portfolio calculation issue
 * by examining the raw Moralis API response
 */

const fetch = require('node-fetch');

const API_BASE = 'https://api.degen-oracle.com';
const TEST_WALLET = '82ytegx28N1rhU7e4rxY8MKoCTmuyZcuctx8LJL87Un8';

async function debugPortfolioCalculation() {
  console.log('🔍 DEBUGGING PORTFOLIO CALCULATION');
  console.log('==================================');
  console.log(`🔗 API: ${API_BASE}`);
  console.log(`👛 Test Wallet: ${TEST_WALLET}\n`);

  try {
    // Test portfolio analysis
    console.log('📤 Testing portfolio analysis...');
    
    const response = await fetch(`${API_BASE}/api/portfolio/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'DebugTest/1.0',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        walletAddress: TEST_WALLET,
        includeTokens: true,
        includeLSTs: true
      })
    });
    
    console.log(`📥 Response Status: ${response.status} ${response.statusText}`);
    
    if (response.ok) {
      const data = await response.json();
      
      console.log('\n📋 RAW PORTFOLIO DATA:');
      console.log('======================');
      console.log(JSON.stringify(data, null, 2));
      
      console.log('\n🔍 ANALYSIS:');
      console.log('============');
      console.log(`SOL Balance: ${data.sol} SOL`);
      console.log(`Total Value: $${data.totalValue}`);
      console.log(`Current Yield: ${data.currentYield}%`);
      console.log(`LST Count: ${data.lsts ? data.lsts.length : 0}`);
      
      // Check if there are any tokens with high values
      if (data.lsts && data.lsts.length > 0) {
        console.log('\n📈 LST BREAKDOWN:');
        console.log('================');
        data.lsts.forEach((lst, index) => {
          console.log(`${index + 1}. ${lst.symbol}: ${lst.amount} tokens (${lst.apr}% APR)`);
        });
      }
      
      // Calculate what the value should be
      const expectedSOLValue = data.sol * 190; // Approximate SOL price
      console.log(`\n💰 EXPECTED VALUES:`);
      console.log(`Expected SOL Value: $${expectedSOLValue.toFixed(2)}`);
      console.log(`Actual Total Value: $${data.totalValue}`);
      
      if (data.totalValue > expectedSOLValue * 1000) {
        console.log('❌ ISSUE DETECTED: Total value is significantly higher than expected');
        console.log('   This suggests there may be tokens with incorrect pricing');
      }
      
    } else {
      const errorData = await response.text();
      console.log(`❌ Portfolio analysis failed: ${response.status}`);
      console.log(`Error Details: ${errorData}`);
    }

  } catch (error) {
    console.error('❌ Debug test failed:', error.message);
  }
}

debugPortfolioCalculation().catch(console.error);
