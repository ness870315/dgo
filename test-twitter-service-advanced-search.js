/**
 * Test script for TwitterAPI.io advanced search via twitter-service microservice
 * This tests the new /api/twitter/advanced_search endpoint
 */

const axios = require('axios');

// Configuration
const TWITTER_SERVICE_URL = process.env.TWITTER_SERVICE_URL || 'https://dgo-2.onrender.com';
const TEST_SYMBOL = 'WIZI'; // Test symbol

async function testTwitterAPIioAdvancedSearch() {
  console.log('🧪 Testing TwitterAPI.io Advanced Search via twitter-service microservice');
  console.log('=' .repeat(70));
  
  try {
    // Test the new advanced search endpoint
    const query = `($${TEST_SYMBOL} OR #${TEST_SYMBOL})`;
    const endpoint = '/api/twitter/advanced_search';
    
    console.log(`🔍 Testing: ${TWITTER_SERVICE_URL}${endpoint}`);
    console.log(`📝 Query: ${query}`);
    console.log(`📊 Count: 20, QueryType: Latest`);
    
    const response = await axios.get(`${TWITTER_SERVICE_URL}${endpoint}`, {
      params: {
        query: query,
        count: 20,
        queryType: 'Latest'
      },
      timeout: 30000
    });
    
    console.log('\n✅ Response received:');
    console.log(`   Status: ${response.status}`);
    console.log(`   Success: ${response.data.success}`);
    console.log(`   Source: ${response.data.source}`);
    console.log(`   Count: ${response.data.count}`);
    
    if (response.data.error) {
      console.log(`   ❌ Error: ${response.data.error}`);
    }
    
    if (response.data.tweets && response.data.tweets.length > 0) {
      console.log(`\n📱 Sample tweets (${Math.min(3, response.data.tweets.length)} of ${response.data.tweets.length}):`);
      response.data.tweets.slice(0, 3).forEach((tweet, index) => {
        console.log(`   ${index + 1}. @${tweet.user.screen_name}: "${tweet.text.substring(0, 80)}..."`);
        console.log(`      📊 Likes: ${tweet.favorite_count}, RT: ${tweet.retweet_count}, Replies: ${tweet.reply_count}`);
        console.log(`      🕒 ${tweet.created_at}`);
        console.log(`      🔗 ${tweet.url || 'No URL'}`);
        console.log('');
      });
    } else {
      console.log('\n📭 No tweets found');
    }
    
    // Test pagination info
    if (response.data.has_next_page !== undefined) {
      console.log(`📄 Pagination: has_next_page=${response.data.has_next_page}`);
      if (response.data.next_cursor) {
        console.log(`   Next cursor: ${response.data.next_cursor}`);
      }
    }
    
  } catch (error) {
    console.error('\n❌ Test failed:');
    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(`   Data: ${JSON.stringify(error.response.data, null, 2)}`);
    } else {
      console.error(`   Error: ${error.message}`);
    }
  }
}

async function testFallbackSearch() {
  console.log('\n🔄 Testing fallback Twitter API v2 search');
  console.log('=' .repeat(50));
  
  try {
    const endpoint = '/api/twitter/search';
    const params = {
      q: `has:hashtags #${TEST_SYMBOL} -is:retweet lang:en`,
      count: 8
    };
    
    console.log(`🔍 Testing: ${TWITTER_SERVICE_URL}${endpoint}`);
    console.log(`📝 Query: ${params.q}`);
    
    const response = await axios.get(`${TWITTER_SERVICE_URL}${endpoint}`, {
      params: params,
      timeout: 30000
    });
    
    console.log('\n✅ Fallback response:');
    console.log(`   Status: ${response.status}`);
    console.log(`   Success: ${response.data.success}`);
    console.log(`   Source: ${response.data.source}`);
    console.log(`   Count: ${response.data.count}`);
    
    if (response.data.error) {
      console.log(`   ❌ Error: ${response.data.error}`);
    }
    
  } catch (error) {
    console.error('\n❌ Fallback test failed:');
    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(`   Data: ${JSON.stringify(error.response.data, null, 2)}`);
    } else {
      console.error(`   Error: ${error.message}`);
    }
  }
}

async function testMicroserviceHealth() {
  console.log('🏥 Testing microservice health');
  console.log('=' .repeat(40));
  
  try {
    const response = await axios.get(`${TWITTER_SERVICE_URL}/health`, { timeout: 5000 });
    console.log('✅ Health check passed:');
    console.log(`   Status: ${response.data.status}`);
    console.log(`   Bearer Token: ${response.data.bearer_token}`);
    console.log(`   TwitterAPI.io Key: ${response.data.twitterapiio_key || 'Not checked'}`);
  } catch (error) {
    console.error('❌ Health check failed:', error.message);
  }
}

// Run tests
async function runAllTests() {
  console.log('🚀 Starting TwitterAPI.io Microservice Integration Tests');
  console.log('=' .repeat(70));
  console.log(`🌐 Twitter Service URL: ${TWITTER_SERVICE_URL}`);
  console.log(`🎯 Test Symbol: ${TEST_SYMBOL}`);
  console.log('');
  
  await testMicroserviceHealth();
  await testTwitterAPIioAdvancedSearch();
  await testFallbackSearch();
  
  console.log('\n🏁 All tests completed!');
  console.log('\n📋 Summary:');
  console.log('   • TwitterAPI.io advanced search endpoint added to twitter-service');
  console.log('   • Backend updated to use new microservice endpoint');
  console.log('   • Fallback to Twitter API v2 maintained');
  console.log('   • Environment variable TWITTERAPIIO_API_KEY required in twitter-service');
}

// Execute if run directly
if (require.main === module) {
  runAllTests().catch(console.error);
}

module.exports = {
  testTwitterAPIioAdvancedSearch,
  testFallbackSearch,
  testMicroserviceHealth,
  runAllTests
};
