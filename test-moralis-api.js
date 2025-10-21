#!/usr/bin/env node

/**
 * Simple Moralis API Test
 * 
 * This script tests the Moralis API directly to see
 * what data it's returning for the problematic wallet
 */

const fetch = require('node-fetch');

async function testMoralisAPI() {
  const walletAddress = '82ytegx28N1rhU7e4rxY8MKoCTmuyZcuctx8LJL87Un8';
  
  console.log('🔍 TESTING MORALIS API DIRECTLY');
  console.log('================================');
  console.log(`👛 Wallet: ${walletAddress}\n`);

  try {
    // Test 1: Check if this is a valid Solana wallet address
    console.log('1️⃣ Wallet Address Validation:');
    console.log(`   Length: ${walletAddress.length} characters`);
    console.log(`   Format: ${walletAddress.match(/^[1-9A-HJ-NP-Za-km-z]+$/) ? 'Valid Base58' : 'Invalid Base58'}`);
    
    // Test 2: Try a different wallet address for comparison
    console.log('\n2️⃣ Testing with a known wallet for comparison:');
    const knownWallet = '3hn5fWZEf2yUZcwU2CV2Wkvk7YDiysM8xBwmesFg7sN1';
    
    const response1 = await fetch(`https://api.degen-oracle.com/api/portfolio/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'MoralisTest/1.0',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        walletAddress: knownWallet,
        includeTokens: true,
        includeLSTs: true
      })
    });
    
    if (response1.ok) {
      const data1 = await response1.json();
      console.log(`   Known wallet SOL: ${data1.sol}`);
      console.log(`   Known wallet value: $${data1.totalValue}`);
    }
    
    // Test 3: Test the problematic wallet again
    console.log('\n3️⃣ Testing problematic wallet again:');
    const response2 = await fetch(`https://api.degen-oracle.com/api/portfolio/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'MoralisTest/1.0',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        walletAddress: walletAddress,
        includeTokens: true,
        includeLSTs: true
      })
    });
    
    if (response2.ok) {
      const data2 = await response2.json();
      console.log(`   Problematic wallet SOL: ${data2.sol}`);
      console.log(`   Problematic wallet value: $${data2.totalValue}`);
      
      // Check if the values are exactly the same (suggesting caching issue)
      if (response1.ok) {
        const data1 = await response1.json();
        if (data1.totalValue === data2.totalValue) {
          console.log('   ⚠️ VALUES ARE IDENTICAL - Possible caching issue!');
        }
      }
    }
    
    // Test 4: Try with a completely different wallet
    console.log('\n4️⃣ Testing with a third wallet:');
    const thirdWallet = '11111111111111111111111111111112'; // System program wallet
    
    const response3 = await fetch(`https://api.degen-oracle.com/api/portfolio/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'MoralisTest/1.0',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        walletAddress: thirdWallet,
        includeTokens: true,
        includeLSTs: true
      })
    });
    
    if (response3.ok) {
      const data3 = await response3.json();
      console.log(`   Third wallet SOL: ${data3.sol}`);
      console.log(`   Third wallet value: $${data3.totalValue}`);
    }

  } catch (error) {
    console.error('❌ Moralis API test failed:', error.message);
  }
}

testMoralisAPI().catch(console.error);
