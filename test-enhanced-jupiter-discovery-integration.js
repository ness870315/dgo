#!/usr/bin/env node

/**
 * Test Enhanced Jupiter Discovery Service Integration
 * 
 * This script tests the integration between:
 * 1. Enhanced Jupiter Discovery Service (trending tokens + AI Router)
 * 2. Enhanced Backend (x402 payment handling)
 */

import axios from 'axios';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const ENHANCED_BACKEND_URL = process.env.ENHANCED_BACKEND_URL || 'http://localhost:3000';
const JUP_DISCOVERY_URL = process.env.JUP_DISCOVERY_URL || 'http://localhost:3000';
const INTERNAL_TOKEN = process.env.INTERNAL_TOKEN;

console.log('🧪 Testing Enhanced Jupiter Discovery Service Integration');
console.log('================================================');
console.log(`Enhanced Backend URL: ${ENHANCED_BACKEND_URL}`);
console.log(`Jupiter Discovery URL: ${JUP_DISCOVERY_URL}`);
console.log(`Internal Token: ${INTERNAL_TOKEN ? 'Set' : 'Not Set'}`);
console.log('');

async function testEnhancedBackendHealth() {
  console.log('🔍 Testing Enhanced Backend Health...');
  try {
    const response = await axios.get(`${ENHANCED_BACKEND_URL}/health`, {
      timeout: 10000
    });
    
    if (response.status === 200) {
      console.log('✅ Enhanced Backend is healthy');
      console.log(`   Service: ${response.data.service}`);
      console.log(`   Status: ${response.data.status}`);
      return true;
    } else {
      console.log('❌ Enhanced Backend health check failed');
      return false;
    }
  } catch (error) {
    console.log('❌ Enhanced Backend is not responding');
    console.log(`   Error: ${error.message}`);
    return false;
  }
}

async function testJupiterDiscoveryHealth() {
  console.log('🔍 Testing Jupiter Discovery Service Health...');
  try {
    const response = await axios.get(`${JUP_DISCOVERY_URL}/health`, {
      timeout: 10000
    });
    
    if (response.status === 200) {
      console.log('✅ Jupiter Discovery Service is healthy');
      console.log(`   Service: ${response.data.service}`);
      console.log(`   Status: ${response.data.status}`);
      console.log(`   Modules: ${JSON.stringify(response.data.modules, null, 2)}`);
      return true;
    } else {
      console.log('❌ Jupiter Discovery Service health check failed');
      return false;
    }
  } catch (error) {
    console.log('❌ Jupiter Discovery Service is not responding');
    console.log(`   Error: ${error.message}`);
    return false;
  }
}

async function testLSTRegistry() {
  console.log('🔍 Testing LST Registry...');
  try {
    const response = await axios.get(`${JUP_DISCOVERY_URL}/api/lsts`, {
      timeout: 10000
    });
    
    if (response.status === 200) {
      console.log('✅ LST Registry is working');
      console.log(`   LSTs found: ${response.data.data?.length || 0}`);
      return true;
    } else {
      console.log('❌ LST Registry failed');
      return false;
    }
  } catch (error) {
    console.log('❌ LST Registry error');
    console.log(`   Error: ${error.message}`);
    return false;
  }
}

async function testPortfolioAnalyzer() {
  console.log('🔍 Testing Portfolio Analyzer...');
  try {
    const testWallet = '82ytegx28N1rhU7e4rxY8MKoCTmuyZcuctx8LJL87Un8'; // Test wallet
    const response = await axios.get(`${JUP_DISCOVERY_URL}/api/portfolio/analyze/${testWallet}`, {
      timeout: 15000
    });
    
    if (response.status === 200) {
      console.log('✅ Portfolio Analyzer is working');
      console.log(`   Wallet: ${testWallet}`);
      console.log(`   SOL Balance: ${response.data.data?.solBalance || 'N/A'}`);
      console.log(`   LSTs Found: ${response.data.data?.lsts?.length || 0}`);
      return true;
    } else {
      console.log('❌ Portfolio Analyzer failed');
      return false;
    }
  } catch (error) {
    console.log('❌ Portfolio Analyzer error');
    console.log(`   Error: ${error.message}`);
    return false;
  }
}

async function testAIStrategyEngine() {
  console.log('🔍 Testing AI Strategy Engine...');
  try {
    const testWallet = '82ytegx28N1rhU7e4rxY8MKoCTmuyZcuctx8LJL87Un8'; // Test wallet
    const response = await axios.post(`${JUP_DISCOVERY_URL}/api/strategy/generate-and-build`, {
      walletAddress: testWallet,
      strategyType: 'basic',
      userPreferences: {}
    }, {
      headers: {
        'Authorization': `Bearer ${INTERNAL_TOKEN}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });
    
    if (response.status === 200) {
      console.log('✅ AI Strategy Engine is working');
      console.log(`   Strategy ID: ${response.data.data?.strategy?.id || 'N/A'}`);
      console.log(`   Strategy Type: ${response.data.data?.strategy?.type || 'N/A'}`);
      console.log(`   Expected Yield: ${response.data.data?.strategy?.expectedYield || 'N/A'}%`);
      console.log(`   Payment Required: $${response.data.data?.payment?.amount || 'N/A'}`);
      return true;
    } else {
      console.log('❌ AI Strategy Engine failed');
      return false;
    }
  } catch (error) {
    console.log('❌ AI Strategy Engine error');
    console.log(`   Error: ${error.message}`);
    return false;
  }
}

async function testX402StrategyExecution() {
  console.log('🔍 Testing x402 Strategy Execution...');
  try {
    const testStrategyId = 'test-strategy-123';
    const response = await axios.get(`${ENHANCED_BACKEND_URL}/api/x402/execute-strategy/${testStrategyId}`, {
      timeout: 10000
    });
    
    if (response.status === 402) {
      console.log('✅ x402 Strategy Execution endpoint is working');
      console.log(`   Status: 402 Payment Required (expected)`);
      console.log(`   Payment Amount: $${response.data.payment?.amount || 'N/A'}`);
      console.log(`   Currency: ${response.data.payment?.currency || 'N/A'}`);
      return true;
    } else {
      console.log('❌ x402 Strategy Execution failed');
      console.log(`   Unexpected status: ${response.status}`);
      return false;
    }
  } catch (error) {
    console.log('❌ x402 Strategy Execution error');
    console.log(`   Error: ${error.message}`);
    return false;
  }
}

async function testInternalCommunication() {
  console.log('🔍 Testing Internal Communication...');
  try {
    if (!INTERNAL_TOKEN) {
      console.log('⚠️ No INTERNAL_TOKEN set, skipping internal communication test');
      return true;
    }
    
    // Test that enhancedBackend can communicate with jup-discovery
    const response = await axios.get(`${JUP_DISCOVERY_URL}/api/strategy/health`, {
      headers: {
        'Authorization': `Bearer ${INTERNAL_TOKEN}`
      },
      timeout: 10000
    });
    
    if (response.status === 200) {
      console.log('✅ Internal communication is working');
      console.log(`   Service: ${response.data.service}`);
      return true;
    } else {
      console.log('❌ Internal communication failed');
      return false;
    }
  } catch (error) {
    console.log('❌ Internal communication error');
    console.log(`   Error: ${error.message}`);
    return false;
  }
}

async function runAllTests() {
  console.log('🚀 Starting Enhanced Jupiter Discovery Integration Tests');
  console.log('=====================================================');
  
  const tests = [
    { name: 'Enhanced Backend Health', fn: testEnhancedBackendHealth },
    { name: 'Jupiter Discovery Health', fn: testJupiterDiscoveryHealth },
    { name: 'LST Registry', fn: testLSTRegistry },
    { name: 'Portfolio Analyzer', fn: testPortfolioAnalyzer },
    { name: 'AI Strategy Engine', fn: testAIStrategyEngine },
    { name: 'x402 Strategy Execution', fn: testX402StrategyExecution },
    { name: 'Internal Communication', fn: testInternalCommunication }
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const test of tests) {
    console.log('');
    try {
      const result = await test.fn();
      if (result) {
        passed++;
      } else {
        failed++;
      }
    } catch (error) {
      console.log(`❌ ${test.name} threw an error: ${error.message}`);
      failed++;
    }
  }
  
  console.log('');
  console.log('📊 Test Results Summary');
  console.log('======================');
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📈 Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);
  
  if (failed === 0) {
    console.log('');
    console.log('🎉 All tests passed! Enhanced Jupiter Discovery Service is ready for deployment.');
  } else {
    console.log('');
    console.log('⚠️ Some tests failed. Please check the service configurations.');
  }
}

// Run the tests
runAllTests().catch(error => {
  console.error('❌ Test suite failed:', error.message);
  process.exit(1);
});
