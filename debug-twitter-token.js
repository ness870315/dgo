#!/usr/bin/env node

/**
 * Debug Twitter Bearer Token
 * Helps debug Bearer token issues in twitter-service
 */

const axios = require('axios');

async function testTwitterServiceToken() {
  console.log('🔍 Debugging Twitter Service Bearer Token');
  console.log('==========================================');

  try {
    // Test twitter-service health
    console.log('1️⃣ Checking Twitter Service Health...');
    const healthResponse = await axios.get('https://dgo-2.onrender.com/health');
    console.log(`✅ Health Status: ${healthResponse.status}`);
    console.log(`📊 Bearer Token Status: ${healthResponse.data.bearer_token}`);

    // Test twitter-service search
    console.log('\n2️⃣ Testing Twitter Service Search...');
    const searchResponse = await axios.get('https://dgo-2.onrender.com/api/twitter/search?q=crypto&count=2');
    console.log(`✅ Search Status: ${searchResponse.status}`);
    console.log(`📊 Results: ${searchResponse.data.count} tweets`);
    console.log(`🔍 Source: ${searchResponse.data.source}`);

    if (searchResponse.data.count === 0 && searchResponse.data.source === 'twitter_api_v2') {
      console.log('\n⚠️  DIAGNOSIS: Twitter service is calling Twitter API but getting 0 results');
      console.log('💡 POSSIBLE CAUSES:');
      console.log('   • Bearer token is invalid/expired');
      console.log('   • Bearer token has insufficient permissions');
      console.log('   • Twitter API rate limiting');
      console.log('   • Query returning no results (unlikely for "crypto")');

      console.log('\n🔧 SOLUTION: Update TWITTER_BEARER_TOKEN in Render');
    }

  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
    if (error.response) {
      console.log(`Status: ${error.response.status}`);
      console.log(`Data:`, error.response.data);
    }
  }
}

async function validateBearerToken(token) {
  console.log('\n🔑 Testing Bearer Token Directly...');

  if (!token || token === 'YOUR_BEARER_TOKEN') {
    console.log('❌ No valid Bearer token provided');
    return;
  }

  try {
    const response = await axios.get('https://api.twitter.com/2/tweets/search/recent', {
      params: {
        query: 'test',
        max_results: 5
      },
      headers: {
        'Authorization': `Bearer ${token}`
      },
      timeout: 10000
    });

    console.log('✅ Bearer token is VALID!');
    console.log(`📊 Results: ${response.data.data?.length || 0} tweets`);

  } catch (error) {
    console.log('❌ Bearer token is INVALID');

    if (error.response?.status === 401) {
      console.log('🚫 Authentication failed - token is wrong or expired');
    } else if (error.response?.status === 403) {
      console.log('🚫 Forbidden - token lacks required permissions');
    } else if (error.response?.status === 429) {
      console.log('⏰ Rate limited - try again later');
    } else {
      console.log(`📊 Status: ${error.response?.status}`);
      console.log(`📝 Error: ${error.response?.data?.title || error.message}`);
    }
  }
}

// Main execution
async function main() {
  await testTwitterServiceToken();

  // If user provides a token, test it
  const userToken = process.argv[2];
  if (userToken) {
    await validateBearerToken(userToken);
  } else {
    console.log('\n💡 To test your Bearer token directly, run:');
    console.log('node debug-twitter-token.js YOUR_BEARER_TOKEN_HERE');
  }
}

if (require.main === module) {
  main().catch(console.error);
}
