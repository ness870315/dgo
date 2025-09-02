#!/usr/bin/env node

/**
 * Test script for Twitter Service API
 * Run this to test the deployed service endpoints
 */

const fetch = require('node-fetch');

const BASE_URL = process.env.TWITTER_SERVICE_URL || 'https://your-twitter-service.onrender.com';

async function testEndpoint(endpoint, description) {
  console.log(`\n🧪 Testing: ${description}`);
  console.log(`📡 URL: ${BASE_URL}${endpoint}`);

  try {
    const response = await fetch(`${BASE_URL}${endpoint}`);
    const data = await response.json();

    console.log(`📊 Status: ${response.status}`);
    console.log(`✅ Response:`, JSON.stringify(data, null, 2));

    if (data.tweets && data.tweets.length > 0) {
      console.log(`📈 Found ${data.tweets.length} tweets`);
      console.log(`🎯 Sample tweet: "${data.tweets[0].text.substring(0, 100)}..."`);
    }

  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
  }
}

async function runTests() {
  console.log('🚀 Twitter Service API Test Suite');
  console.log('=' .repeat(50));
  console.log(`🔗 Service URL: ${BASE_URL}`);

  // Test health endpoint
  await testEndpoint('/health', 'Health Check');

  // Test main search endpoint
  await testEndpoint('/api/twitter/search?q=bitcoin&count=5', 'Search Bitcoin Tweets');

  // Test Selenium-only endpoint
  await testEndpoint('/api/twitter/selenium/search?q=ethereum&count=3', 'Selenium Bitcoin Search');

  // Test different queries
  await testEndpoint('/api/twitter/search?q=crypto&count=5', 'Search Crypto Tweets');

  console.log('\n🎉 Test suite completed!');
  console.log('\n💡 To use in your app, set:');
  console.log(`   REACT_APP_TWITTER_SERVICE_URL=${BASE_URL}`);
}

// Run tests if called directly
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = { testEndpoint, runTests };
