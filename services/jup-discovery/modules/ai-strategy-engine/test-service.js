#!/usr/bin/env node

/**
 * AI Strategy Engine Service Test Script
 * 
 * This script tests the AI strategy generation functionality
 */

import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3003';
const TEST_WALLET = '82ytegx28N1rhU7e4rxY8MKoCTmuyZcuctx8LJL87Un8'; // Example wallet

async function testAIStrategyEngine() {
  console.log('🧪 [AI Strategy Engine Test] Starting tests...\n');

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

    // Test 2: Get Strategy Types
    console.log('\n2️⃣ Testing get strategy types...');
    const typesResponse = await fetch(`${BASE_URL}/api/types`);
    const typesData = await typesResponse.json();
    
    if (typesResponse.ok) {
      console.log('✅ Get strategy types passed');
      console.log(`   Available types: ${typesData.data.length}`);
      typesData.data.forEach(type => {
        console.log(`     - ${type.name}: $${type.price} (${type.complexity})`);
      });
    } else {
      console.log('❌ Get strategy types failed');
    }

    // Test 3: Generate and Build Basic Strategy (Bundled)
    console.log('\n3️⃣ Testing bundled basic strategy generation...');
    const basicStrategyResponse = await fetch(`${BASE_URL}/api/generate-and-build`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        walletAddress: TEST_WALLET,
        strategyType: 'basic',
        userPreferences: {
          maxRisk: 6.0,
          minAPR: 4.5,
          diversification: 'medium'
        }
      })
    });
    
    const basicStrategyData = await basicStrategyResponse.json();
    
    if (basicStrategyResponse.ok) {
      console.log('✅ Bundled basic strategy generation passed');
      console.log(`   Strategy ID: ${basicStrategyData.data.strategy.id}`);
      console.log(`   Strategy Name: ${basicStrategyData.data.strategy.name}`);
      console.log(`   Expected Yield: ${basicStrategyData.data.strategy.expectedYield.toFixed(2)}%`);
      console.log(`   Current Yield: ${basicStrategyData.data.strategy.currentYield.toFixed(2)}%`);
      console.log(`   Improvement: ${basicStrategyData.data.strategy.improvement.toFixed(2)}%`);
      console.log(`   Risk Score: ${basicStrategyData.data.strategy.riskScore.toFixed(2)}`);
      console.log(`   Payment Required: $${basicStrategyData.data.payment.amount}`);
      console.log(`   Transaction Count: ${basicStrategyData.data.execution.transactionCount}`);
      console.log(`   Ready to Execute: ${basicStrategyData.data.execution.readyToExecute}`);
      
      // Show allocation
      if (basicStrategyData.data.strategy.allocation.length > 0) {
        console.log('   Allocation:');
        basicStrategyData.data.strategy.allocation.forEach(item => {
          console.log(`     - ${item.symbol}: ${item.percentage}% (${item.apr.toFixed(2)}% APR)`);
        });
      }
      
      // Show actions
      if (basicStrategyData.data.strategy.actions.length > 0) {
        console.log('   Actions:');
        basicStrategyData.data.strategy.actions.forEach(action => {
          console.log(`     - ${action.type}: ${action.from} → ${action.to} (${action.amount.toFixed(2)})`);
        });
      }
      
      // Store strategy ID for next test
      global.testStrategyId = basicStrategyData.data.strategy.id;
      
    } else {
      console.log('❌ Bundled basic strategy generation failed');
      console.log('   Error:', basicStrategyData.error);
    }

    // Test 4: Generate and Build Advanced Strategy (Bundled)
    console.log('\n4️⃣ Testing bundled advanced strategy generation...');
    const advancedStrategyResponse = await fetch(`${BASE_URL}/api/generate-and-build`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        walletAddress: TEST_WALLET,
        strategyType: 'advanced',
        userPreferences: {
          maxRisk: 5.0,
          minAPR: 5.0,
          diversification: 'high'
        }
      })
    });
    
    const advancedStrategyData = await advancedStrategyResponse.json();
    
    if (advancedStrategyResponse.ok) {
      console.log('✅ Bundled advanced strategy generation passed');
      console.log(`   Strategy ID: ${advancedStrategyData.data.strategy.id}`);
      console.log(`   Strategy Name: ${advancedStrategyData.data.strategy.name}`);
      console.log(`   Expected Yield: ${advancedStrategyData.data.strategy.expectedYield.toFixed(2)}%`);
      console.log(`   Improvement: ${advancedStrategyData.data.strategy.improvement.toFixed(2)}%`);
      console.log(`   Risk Score: ${advancedStrategyData.data.strategy.riskScore.toFixed(2)}`);
      console.log(`   Payment Required: $${advancedStrategyData.data.payment.amount}`);
      console.log(`   Transaction Count: ${advancedStrategyData.data.execution.transactionCount}`);
      console.log(`   Ready to Execute: ${advancedStrategyData.data.execution.readyToExecute}`);
      
      // Show benefits and risks
      if (advancedStrategyData.data.strategy.benefits.length > 0) {
        console.log('   Benefits:');
        advancedStrategyData.data.strategy.benefits.forEach(benefit => {
          console.log(`     - ${benefit}`);
        });
      }
      
      if (advancedStrategyData.data.strategy.risks.length > 0) {
        console.log('   Risks:');
        advancedStrategyData.data.strategy.risks.forEach(risk => {
          console.log(`     - ${risk}`);
        });
      }
      
    } else {
      console.log('❌ Bundled advanced strategy generation failed');
      console.log('   Error:', advancedStrategyData.error);
    }

    // Test 5: Get Strategy by ID
    if (global.testStrategyId) {
      console.log('\n5️⃣ Testing get strategy by ID...');
      const getStrategyResponse = await fetch(`${BASE_URL}/api/strategy/${global.testStrategyId}`);
      const getStrategyData = await getStrategyResponse.json();
      
      if (getStrategyResponse.ok) {
        console.log('✅ Get strategy by ID passed');
        console.log(`   Strategy: ${getStrategyData.data.name}`);
        console.log(`   Generated: ${getStrategyData.data.generatedAt}`);
      } else {
        console.log('❌ Get strategy by ID failed');
      }
    }

    // Test 6: Cache Stats
    console.log('\n6️⃣ Testing cache stats...');
    const cacheResponse = await fetch(`${BASE_URL}/api/cache/stats`);
    const cacheData = await cacheResponse.json();
    
    if (cacheResponse.ok) {
      console.log('✅ Cache stats passed');
      console.log(`   Cache Size: ${cacheData.data.size}`);
      console.log(`   Cache Timeout: ${cacheData.data.timeout / 1000} seconds`);
      console.log(`   Cached Strategies: ${cacheData.data.entries.length}`);
    } else {
      console.log('❌ Cache stats failed');
    }

    console.log('\n🎉 [AI Strategy Engine Test] All tests completed!');

  } catch (error) {
    console.error('❌ [AI Strategy Engine Test] Test failed:', error.message);
    console.log('\n💡 Make sure the AI Strategy Engine service is running:');
    console.log('   npm start');
    console.log('   or');
    console.log('   node index.js');
    console.log('\n💡 Also ensure you have:');
    console.log('   - OPENAI_API_KEY in your .env file');
    console.log('   - LST Registry service running on port 3001');
    console.log('   - Portfolio Analyzer service running on port 3002');
  }
}

// Run tests
testAIStrategyEngine();
