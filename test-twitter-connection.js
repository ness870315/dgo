#!/usr/bin/env node

/**
 * Test Twitter Service Connection
 * Tests if main backend can connect to twitter-service
 */

const axios = require('axios');

const MAIN_BACKEND = 'https://api.degen-oracle.com';
const TWITTER_SERVICE = 'https://dgo-2.onrender.com';

async function testConnection() {
  console.log('🔗 Testing Twitter Service Connection');
  console.log('=====================================');

  // Test twitter-service directly
  console.log('1️⃣ Testing Twitter Service Directly...');
  try {
    const twitterHealth = await axios.get(`${TWITTER_SERVICE}/health`, { timeout: 5000 });
    console.log(`✅ Twitter Service Health: ${twitterHealth.status}`);
    console.log(`   Version: ${twitterHealth.data.version}`);
    console.log(`   Bearer Token: ${twitterHealth.data.bearer_token}`);
  } catch (error) {
    console.log(`❌ Twitter Service Error: ${error.message}`);
    return;
  }

  // Test twitter-service search endpoint
  console.log('\n2️⃣ Testing Twitter Service Search...');
  try {
    const twitterSearch = await axios.get(`${TWITTER_SERVICE}/api/twitter/search?q=test&count=1`, { timeout: 10000 });
    console.log(`✅ Twitter Search: ${twitterSearch.status}`);
    console.log(`   Source: ${twitterSearch.data.source}`);
    console.log(`   Count: ${twitterSearch.data.count}`);
  } catch (error) {
    console.log(`❌ Twitter Search Error: ${error.message}`);
  }

  // Test main backend search (should proxy to twitter-service)
  console.log('\n3️⃣ Testing Main Backend Search...');
  try {
    const mainSearch = await axios.get(`${MAIN_BACKEND}/api/twitter/search?q=test&count=1`, { timeout: 10000 });
    console.log(`✅ Main Backend Search: ${mainSearch.status}`);
    console.log(`   Source: ${mainSearch.data.source}`);
    console.log(`   Count: ${mainSearch.data.count}`);

    if (mainSearch.data.source === 'microservice') {
      console.log('🎉 SUCCESS: Main backend is connected to Twitter service!');
    } else if (mainSearch.data.source === 'backend_integration') {
      console.log('⚠️  WARNING: Main backend is using mock data (not connected to Twitter service)');
      console.log('💡 SOLUTION: Check TWITTER_SERVICE_URL environment variable in main backend');
    } else {
      console.log('❓ UNKNOWN: Unexpected source type');
    }
  } catch (error) {
    console.log(`❌ Main Backend Error: ${error.message}`);
  }

  console.log('\n🎯 Connection Test Complete!');
}

// Run the test
if (require.main === module) {
  testConnection().catch(console.error);
}

module.exports = { testConnection };
