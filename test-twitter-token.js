#!/usr/bin/env node

/**
 * Test Twitter Bearer Token
 * Tests if the Bearer token in twitter-service is working
 */

const axios = require('axios');

async function testTwitterToken() {
  console.log('🔑 Testing Twitter Bearer Token');
  console.log('===============================');

  try {
    // Test Twitter API directly
    console.log('Testing Twitter API with Bearer token...');
    const response = await axios.get('https://api.twitter.com/2/tweets/search/recent', {
      params: {
        query: 'crypto',
        max_results: 10,
        'tweet.fields': 'created_at,public_metrics,author_id,text',
        expansions: 'author_id',
        'user.fields': 'name,username'
      },
      headers: {
        'Authorization': `Bearer ${process.env.TWITTER_BEARER_TOKEN || 'YOUR_BEARER_TOKEN'}`
      },
      timeout: 10000
    });

    console.log(`✅ Twitter API Response: ${response.status}`);
    console.log(`📊 Results: ${response.data.data?.length || 0} tweets`);

    if (response.data.data && response.data.data.length > 0) {
      console.log('\n📝 Sample Tweet:');
      console.log(`"${response.data.data[0].text.substring(0, 100)}..."`);
    }

  } catch (error) {
    console.log(`❌ Twitter API Error: ${error.response?.status || 'Network Error'}`);

    if (error.response?.status === 401) {
      console.log('🚫 Authentication failed - Bearer token invalid');
    } else if (error.response?.status === 429) {
      console.log('⏰ Rate limited - try again later');
    } else if (error.response?.data) {
      console.log('Error details:', error.response.data);
    }
  }
}

// Test twitter-service
async function testTwitterService() {
  console.log('\n🔗 Testing Twitter Service');
  console.log('==========================');

  try {
    const response = await axios.get('https://dgo-2.onrender.com/api/twitter/search', {
      params: { q: 'crypto', count: 3 },
      timeout: 15000
    });

    console.log(`✅ Twitter Service Response: ${response.status}`);
    console.log(`📊 Results: ${response.data.count} tweets`);
    console.log(`🔍 Source: ${response.data.source}`);

    if (response.data.tweets && response.data.tweets.length > 0) {
      console.log('\n📝 First Tweet:');
      console.log(`"${response.data.tweets[0].text?.substring(0, 100)}..."`);
    } else {
      console.log('⚠️  No tweets returned - check Bearer token or query');
    }

  } catch (error) {
    console.log(`❌ Twitter Service Error: ${error.message}`);
  }
}

// Run tests
async function runTests() {
  await testTwitterToken();
  await testTwitterService();

  console.log('\n🎯 Tests Complete!');
}

if (require.main === module) {
  runTests().catch(console.error);
}
