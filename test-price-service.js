#!/usr/bin/env node

/**
 * Test Real-Time Price Service
 * 
 * This script tests the real-time price service
 * to see if it's returning incorrect SOL prices
 */

const fetch = require('node-fetch');

async function testPriceService() {
  console.log('🔍 TESTING REAL-TIME PRICE SERVICE');
  console.log('==================================');

  try {
    // Test multiple price sources directly
    console.log('1️⃣ Testing Coinbase API:');
    try {
      const coinbaseResponse = await fetch('https://api.coinbase.com/v2/exchange-rates?currency=SOL');
      if (coinbaseResponse.ok) {
        const data = await coinbaseResponse.json();
        const price = parseFloat(data.data.rates.USD);
        console.log(`   Coinbase SOL price: $${price.toFixed(2)}`);
      } else {
        console.log(`   Coinbase failed: ${coinbaseResponse.status}`);
      }
    } catch (e) {
      console.log(`   Coinbase error: ${e.message}`);
    }

    console.log('\n2️⃣ Testing Binance API:');
    try {
      const binanceResponse = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=SOLUSDT');
      if (binanceResponse.ok) {
        const data = await binanceResponse.json();
        const price = parseFloat(data.price);
        console.log(`   Binance SOL price: $${price.toFixed(2)}`);
      } else {
        console.log(`   Binance failed: ${binanceResponse.status}`);
      }
    } catch (e) {
      console.log(`   Binance error: ${e.message}`);
    }

    console.log('\n3️⃣ Testing CoinGecko API:');
    try {
      const coingeckoResponse = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
      if (coingeckoResponse.ok) {
        const data = await coingeckoResponse.json();
        const price = data.solana.usd;
        console.log(`   CoinGecko SOL price: $${price.toFixed(2)}`);
      } else {
        console.log(`   CoinGecko failed: ${coingeckoResponse.status}`);
      }
    } catch (e) {
      console.log(`   CoinGecko error: ${e.message}`);
    }

    console.log('\n4️⃣ Testing Jupiter API:');
    try {
      const jupiterResponse = await fetch('https://price.jup.ag/v4/price?ids=So11111111111111111111111111111111111111112');
      if (jupiterResponse.ok) {
        const data = await jupiterResponse.json();
        const solMint = 'So11111111111111111111111111111111111111112';
        if (data.data && data.data[solMint]) {
          const price = data.data[solMint].price;
          console.log(`   Jupiter SOL price: $${price.toFixed(2)}`);
        } else {
          console.log(`   Jupiter: SOL mint not found`);
        }
      } else {
        console.log(`   Jupiter failed: ${jupiterResponse.status}`);
      }
    } catch (e) {
      console.log(`   Jupiter error: ${e.message}`);
    }

    console.log('\n5️⃣ Testing Portfolio Analysis with Debug:');
    const walletAddress = '82ytegx28N1rhU7e4rxY8MKoCTmuyZcuctx8LJL87Un8';
    
    const response = await fetch(`https://api.degen-oracle.com/api/portfolio/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'PriceTest/1.0',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        walletAddress: walletAddress,
        includeTokens: true,
        includeLSTs: true
      })
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log(`   Portfolio SOL: ${data.sol}`);
      console.log(`   Portfolio Value: $${data.totalValue}`);
      
      // Calculate what the value should be
      const expectedValue = data.sol * 190; // Approximate SOL price
      console.log(`   Expected Value: $${expectedValue.toFixed(2)}`);
      
      if (data.totalValue > expectedValue * 1000) {
        console.log('   ❌ ISSUE: Portfolio value is massively inflated');
        console.log('   🔍 This suggests a bug in the price calculation or data processing');
      }
    }

  } catch (error) {
    console.error('❌ Price service test failed:', error.message);
  }
}

testPriceService().catch(console.error);
