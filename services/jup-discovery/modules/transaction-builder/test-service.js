#!/usr/bin/env node

/**
 * Transaction Builder Service Test Script
 * 
 * This script tests the transaction building functionality
 */

import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3004';
const TEST_WALLET = '82ytegx28N1rhU7e4rxY8MKoCTmuyZcuctx8LJL87Un8';

// Sample strategy for testing
const SAMPLE_STRATEGY = {
  id: 'strategy_test_123',
  name: 'Test Strategy',
  type: 'basic',
  actions: [
    {
      type: 'swap',
      from: 'SOL',
      to: 'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn', // jitoSOL
      amount: 1.0,
      reasoning: 'Convert SOL to jitoSOL for higher yield'
    },
    {
      type: 'swap',
      from: 'SOL',
      to: 'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So', // mSOL
      amount: 0.5,
      reasoning: 'Diversify with mSOL'
    }
  ]
};

async function testTransactionBuilder() {
  console.log('🧪 [Transaction Builder Test] Starting tests...\n');

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

    // Test 2: Get Quote
    console.log('\n2️⃣ Testing Jupiter quote...');
    const quoteResponse = await fetch(`${BASE_URL}/api/quote?` + new URLSearchParams({
      inputMint: 'So11111111111111111111111111111111111111112', // SOL
      outputMint: 'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn', // jitoSOL
      amount: '1.0',
      slippageBps: '50'
    }));
    
    const quoteData = await quoteResponse.json();
    
    if (quoteResponse.ok) {
      console.log('✅ Jupiter quote passed');
      console.log(`   Input: ${quoteData.data.inAmount}`);
      console.log(`   Output: ${quoteData.data.outAmount}`);
      console.log(`   Price Impact: ${quoteData.data.priceImpactPct}%`);
      console.log(`   Route: ${quoteData.data.routePlan?.length || 0} hops`);
    } else {
      console.log('❌ Jupiter quote failed');
      console.log('   Error:', quoteData.error);
    }

    // Test 3: Build Transactions
    console.log('\n3️⃣ Testing transaction building...');
    const buildResponse = await fetch(`${BASE_URL}/api/build`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        strategy: SAMPLE_STRATEGY,
        userWallet: TEST_WALLET
      })
    });
    
    const buildData = await buildResponse.json();
    
    if (buildResponse.ok) {
      console.log('✅ Transaction building passed');
      console.log(`   Strategy: ${buildData.data.strategyName}`);
      console.log(`   Transaction Count: ${buildData.data.transactionCount}`);
      console.log(`   Estimated Gas: ${buildData.data.estimatedGasCost.sol.toFixed(6)} SOL`);
      console.log(`   Slippage Protection: ${buildData.data.slippageProtection / 100}%`);
      
      // Show individual transactions
      if (buildData.data.individualTransactions.length > 0) {
        console.log('   Individual Transactions:');
        buildData.data.individualTransactions.forEach((tx, index) => {
          console.log(`     ${index + 1}. ${tx.type}: ${tx.from} → ${tx.to} (${tx.amount})`);
          console.log(`        Expected Output: ${tx.expectedOutput}`);
          console.log(`        Instructions: ${tx.instructions}`);
        });
      }
      
      // Store transaction for validation test
      global.testTransaction = buildData.data.bundledTransaction;
      
    } else {
      console.log('❌ Transaction building failed');
      console.log('   Error:', buildData.error);
    }

    // Test 4: Validate Transaction
    if (global.testTransaction) {
      console.log('\n4️⃣ Testing transaction validation...');
      const validateResponse = await fetch(`${BASE_URL}/api/validate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          transaction: global.testTransaction,
          userWallet: TEST_WALLET
        })
      });
      
      const validateData = await validateResponse.json();
      
      if (validateResponse.ok) {
        console.log('✅ Transaction validation passed');
        console.log(`   Valid: ${validateData.data.valid}`);
        console.log(`   Balance: ${validateData.data.balance.toFixed(4)} SOL`);
        console.log(`   Size: ${validateData.data.size} bytes`);
        console.log(`   Estimated Fees: ${validateData.data.estimatedFees} SOL`);
      } else {
        console.log('❌ Transaction validation failed');
        console.log('   Error:', validateData.error);
      }
    }

    // Test 5: Get Transaction by Strategy ID
    console.log('\n5️⃣ Testing get transaction by strategy ID...');
    const getTxResponse = await fetch(`${BASE_URL}/api/transaction/${SAMPLE_STRATEGY.id}/${TEST_WALLET}`);
    const getTxData = await getTxResponse.json();
    
    if (getTxResponse.ok) {
      console.log('✅ Get transaction by strategy ID passed');
      console.log(`   Strategy: ${getTxData.data.strategyName}`);
      console.log(`   Created: ${getTxData.data.createdAt}`);
    } else {
      console.log('❌ Get transaction by strategy ID failed');
      console.log('   Error:', getTxData.error);
    }

    // Test 6: Cache Stats
    console.log('\n6️⃣ Testing cache stats...');
    const cacheResponse = await fetch(`${BASE_URL}/api/cache/stats`);
    const cacheData = await cacheResponse.json();
    
    if (cacheResponse.ok) {
      console.log('✅ Cache stats passed');
      console.log(`   Cache Size: ${cacheData.data.size}`);
      console.log(`   Cache Timeout: ${cacheData.data.timeout / 1000} seconds`);
      console.log(`   Cached Transactions: ${cacheData.data.entries.length}`);
    } else {
      console.log('❌ Cache stats failed');
    }

    console.log('\n🎉 [Transaction Builder Test] All tests completed!');

  } catch (error) {
    console.error('❌ [Transaction Builder Test] Test failed:', error.message);
    console.log('\n💡 Make sure the Transaction Builder service is running:');
    console.log('   npm start');
    console.log('   or');
    console.log('   node index.js');
    console.log('\n💡 Also ensure you have:');
    console.log('   - SOLANA_RPC_URL in your .env file');
    console.log('   - Internet connection for Jupiter API');
    console.log('   - Valid Solana RPC endpoint');
  }
}

// Run tests
testTransactionBuilder();
