#!/usr/bin/env node

/**
 * AI Liquid Staking Router x402 Integration Test
 * 
 * This script tests the x402 payment integration for the AI Router
 */

import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3000'; // Enhanced Backend
const TEST_STRATEGY_ID = 'strategy_test_123';

async function testX402Integration() {
  console.log('🧪 [AI Router x402 Test] Starting x402 integration tests...\n');

  try {
    // Test 1: Health Check
    console.log('1️⃣ Testing Enhanced Backend health check...');
    const healthResponse = await fetch(`${BASE_URL}/health`);
    const healthData = await healthResponse.json();
    
    if (healthResponse.ok) {
      console.log('✅ Enhanced Backend health check passed');
      console.log(`   Service: ${healthData.service}`);
      console.log(`   Status: ${healthData.status}`);
    } else {
      console.log('❌ Enhanced Backend health check failed');
      return;
    }

    // Test 2: x402 Strategy Execution Endpoint (402 Payment Required)
    console.log('\n2️⃣ Testing x402 strategy execution endpoint...');
    const strategyResponse = await fetch(`${BASE_URL}/api/x402/execute-strategy/${TEST_STRATEGY_ID}`);
    
    if (strategyResponse.status === 402) {
      console.log('✅ x402 strategy execution endpoint returned 402 Payment Required');
      const paymentData = await strategyResponse.json();
      console.log(`   Payment Required: $${paymentData.amount / 1e6} USDC`);
      console.log(`   Description: ${paymentData.description}`);
      console.log(`   Resource: ${paymentData.resource}`);
    } else {
      console.log('❌ x402 strategy execution endpoint failed');
      console.log(`   Status: ${strategyResponse.status}`);
      const errorData = await strategyResponse.json();
      console.log(`   Error: ${errorData.error}`);
    }

    // Test 3: AI Router Payment Webhook
    console.log('\n3️⃣ Testing AI Router payment webhook...');
    const webhookResponse = await fetch(`${BASE_URL}/api/x402/ai-router-payment-webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        metadata: {
          strategyId: TEST_STRATEGY_ID,
          strategyType: 'basic',
          userWallet: '82ytegx28N1rhU7e4rxY8MKoCTmuyZcuctx8LJL87Un8'
        },
        transactionHash: 'test_tx_hash_123',
        amount: 1.20
      })
    });
    
    const webhookData = await webhookResponse.json();
    
    if (webhookResponse.ok) {
      console.log('✅ AI Router payment webhook passed');
      console.log(`   Success: ${webhookData.success}`);
      console.log(`   Message: ${webhookData.message}`);
      console.log(`   Strategy ID: ${webhookData.strategyId}`);
      console.log(`   Amount: $${webhookData.amount}`);
    } else {
      console.log('❌ AI Router payment webhook failed');
      console.log(`   Error: ${webhookData.error}`);
    }

    // Test 4: Test with Advanced Strategy
    console.log('\n4️⃣ Testing advanced strategy pricing...');
    const advancedWebhookResponse = await fetch(`${BASE_URL}/api/x402/ai-router-payment-webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        metadata: {
          strategyId: 'strategy_advanced_456',
          strategyType: 'advanced',
          userWallet: '82ytegx28N1rhU7e4rxY8MKoCTmuyZcuctx8LJL87Un8'
        },
        transactionHash: 'test_tx_hash_456',
        amount: 2.00
      })
    });
    
    const advancedWebhookData = await advancedWebhookResponse.json();
    
    if (advancedWebhookResponse.ok) {
      console.log('✅ Advanced strategy webhook passed');
      console.log(`   Strategy Type: advanced`);
      console.log(`   Amount: $${advancedWebhookData.amount}`);
    } else {
      console.log('❌ Advanced strategy webhook failed');
      console.log(`   Error: ${advancedWebhookData.error}`);
    }

    console.log('\n🎉 [AI Router x402 Test] All tests completed!');

  } catch (error) {
    console.error('❌ [AI Router x402 Test] Test failed:', error.message);
    console.log('\n💡 Make sure the Enhanced Backend service is running:');
    console.log('   npm start');
    console.log('   or');
    console.log('   node enhancedBackend.js');
    console.log('\n💡 Also ensure you have:');
    console.log('   - X402_PAY_TO_ADDRESS in your .env file');
    console.log('   - X402_FACILITATOR_URL configured');
    console.log('   - AI Strategy Engine service running on port 3003');
  }
}

// Run tests
testX402Integration();
