#!/usr/bin/env node

/**
 * Twitter Endpoints Test Script
 * Tests the Twitter search endpoints to troubleshoot functionality
 */

const axios = require('axios');

const BASE_URL = 'https://api.degen-oracle.com';

async function testEndpoint(name, url, expectedSuccess = true) {
  console.log(`\n🧪 Testing ${name}...`);
  console.log(`URL: ${url}`);

  try {
    const startTime = Date.now();
    const response = await axios.get(url, { timeout: 30000 });
    const duration = Date.now() - startTime;

    console.log(`✅ Status: ${response.status} (${duration}ms)`);
    console.log(`📊 Response:`, JSON.stringify(response.data, null, 2));

    if (expectedSuccess) {
      if (response.data.success) {
        console.log(`🎉 SUCCESS: ${name} is working!`);
      } else {
        console.log(`⚠️  PARTIAL: Endpoint responded but success=false`);
        console.log(`Error: ${response.data.error || 'Unknown error'}`);
      }
    }

    return response.data;
  } catch (error) {
    console.log(`❌ ERROR: ${error.message}`);
    if (error.response) {
      console.log(`Status: ${error.response.status}`);
      console.log(`Response:`, error.response.data);
    }
    return null;
  }
}

async function runTests() {
  console.log('🚀 Twitter Endpoints Test Suite');
  console.log('================================');

  // Test main backend health
  await testEndpoint('Main Backend Health', `${BASE_URL}/health`);

  // Test Twitter search endpoints
  const tests = [
    {
      name: 'Twitter Search - Bitcoin',
      url: `${BASE_URL}/api/twitter/search?q=bitcoin&count=3`,
      expectedSuccess: true
    },
    {
      name: 'Twitter Search - Crypto',
      url: `${BASE_URL}/api/twitter/search?q=crypto&count=2`,
      expectedSuccess: true
    },
    {
      name: 'Twitter Search - Empty Query',
      url: `${BASE_URL}/api/twitter/search`,
      expectedSuccess: false // Should fail due to missing query
    },
    {
      name: 'Twitter User Tweets',
      url: `${BASE_URL}/api/twitter/user/elonmusk/tweets?count=2`,
      expectedSuccess: true
    },
    {
      name: 'Twitter Mentions',
      url: `${BASE_URL}/api/twitter/mentions/bitcoin?count=2`,
      expectedSuccess: true
    }
  ];

  for (const test of tests) {
    await testEndpoint(test.name, test.url, test.expectedSuccess);
  }

  console.log('\n🎯 Test Suite Complete!');
  console.log('=======================');
}

// Run the tests
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = { testEndpoint, runTests };
