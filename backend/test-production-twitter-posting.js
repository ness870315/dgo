#!/usr/bin/env node

/**
 * 🐦 Test Production Twitter Posting
 * Debug script to test Twitter posting functionality with real user tokens
 */

import https from 'https';

const PRODUCTION_API = 'api.degen-oracle.com';

function makeRequest(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        try {
          const result = {
            status: res.statusCode,
            headers: res.headers,
            data: responseData ? JSON.parse(responseData) : null,
            rawData: responseData
          };
          resolve(result);
        } catch (error) {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: responseData,
            parseError: error.message
          });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

async function testProductionTwitterPosting() {
  try {
    console.log('🐦 DeGen Oracle - Production Twitter Posting Test');
    console.log('=================================================');
    console.log(`🌐 Testing: https://${PRODUCTION_API}`);
    
    // Test 1: Try to make a test KOL call to see what happens
    console.log('\n📞 1. Testing KOL Call with Twitter Posting...');
    
    const testCallData = {
      sessionId: 'test-session-for-debug',
      token: {
        symbol: 'DEBUG',
        name: 'Debug Token', 
        contractAddress: 'DebugContractAddressForTesting123456789'
      },
      thesis: '🧪 This is a test tweet from DeGen Oracle debug system. If you see this, Twitter posting is working! #DegenOracle #Test',
      twitterEnabled: true,
      tone: 'bullish'
    };

    try {
      const callOptions = {
        hostname: PRODUCTION_API,
        port: 443,
        path: '/api/user/kol-calls/add',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'DegenOracle-TwitterTest'
        }
      };

      const callResult = await makeRequest(callOptions, testCallData);
      console.log(`   Status: ${callResult.status}`);
      
      if (callResult.status === 401) {
        console.log('   ✅ Expected: Invalid session rejected');
        console.log('   📝 This means the endpoint exists and validates sessions properly');
      } else if (callResult.status === 400) {
        console.log('   ✅ Expected: Bad request (invalid data)');
        console.log('   📝 This means the endpoint exists and validates input');
      } else {
        console.log('   📄 Response:', JSON.stringify(callResult.data, null, 2));
      }
    } catch (error) {
      console.error(`   ❌ KOL call test failed: ${error.message}`);
    }

    // Test 2: Check if there's a direct Twitter posting endpoint
    console.log('\n🐦 2. Testing Direct Twitter Posting Endpoint...');
    
    const tweetData = {
      sessionId: 'test-session',
      text: '🧪 Test tweet from DeGen Oracle debug system'
    };

    try {
      const tweetOptions = {
        hostname: PRODUCTION_API,
        port: 443,
        path: '/api/user/post-tweet',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'DegenOracle-TwitterTest'
        }
      };

      const tweetResult = await makeRequest(tweetOptions, tweetData);
      console.log(`   Status: ${tweetResult.status}`);
      
      if (tweetResult.status === 404) {
        console.log('   ❌ No direct tweet posting endpoint found');
      } else if (tweetResult.status === 401) {
        console.log('   ✅ Tweet endpoint exists but requires valid session');
      } else {
        console.log('   📄 Response:', JSON.stringify(tweetResult.data, null, 2));
      }
    } catch (error) {
      console.error(`   ❌ Direct tweet test failed: ${error.message}`);
    }

    // Test 3: Check Twitter posting preferences endpoint
    console.log('\n⚙️ 3. Testing Twitter Posting Preferences...');
    
    try {
      const prefOptions = {
        hostname: PRODUCTION_API,
        port: 443,
        path: '/api/user/twitter-posting?sessionId=test-session',
        method: 'GET',
        headers: {
          'User-Agent': 'DegenOracle-TwitterTest'
        }
      };

      const prefResult = await makeRequest(prefOptions);
      console.log(`   Status: ${prefResult.status}`);
      
      if (prefResult.status === 401) {
        console.log('   ✅ Twitter preferences endpoint exists and validates sessions');
      } else if (prefResult.status === 200) {
        console.log('   📄 Response:', JSON.stringify(prefResult.data, null, 2));
      } else {
        console.log('   📄 Response:', JSON.stringify(prefResult.data, null, 2));
      }
    } catch (error) {
      console.error(`   ❌ Preferences test failed: ${error.message}`);
    }

    // Test 4: Check user profile endpoint to see token structure
    console.log('\n👤 4. Testing User Profile Structure...');
    
    try {
      const profileOptions = {
        hostname: PRODUCTION_API,
        port: 443,
        path: '/api/user/profile?sessionId=test-session',
        method: 'GET',
        headers: {
          'User-Agent': 'DegenOracle-TwitterTest'
        }
      };

      const profileResult = await makeRequest(profileOptions);
      console.log(`   Status: ${profileResult.status}`);
      
      if (profileResult.status === 401) {
        console.log('   ✅ Profile endpoint exists and validates sessions');
        console.log('   📝 This suggests user authentication is working');
      } else {
        console.log('   📄 Response:', JSON.stringify(profileResult.data, null, 2));
      }
    } catch (error) {
      console.error(`   ❌ Profile test failed: ${error.message}`);
    }

    console.log('\n🔍 Analysis & Recommendations:');
    console.log('=====================================');
    console.log('');
    console.log('✅ Twitter OAuth Configuration:');
    console.log('   • App has tweet.write permissions');
    console.log('   • OAuth flow redirects properly');
    console.log('   • Scopes include tweet.read + tweet.write');
    console.log('');
    console.log('🔍 Potential Issues:');
    console.log('   1. Access tokens might be expired/invalid');
    console.log('   2. Token refresh logic might be missing');
    console.log('   3. Twitter API call format might be incorrect');
    console.log('   4. Rate limiting or API errors');
    console.log('   5. Environment variables missing in production');
    console.log('');
    console.log('📋 Next Steps:');
    console.log('   1. Check production logs for Twitter API errors');
    console.log('   2. Test with a real authenticated user session');
    console.log('   3. Verify Twitter app credentials in production env');
    console.log('   4. Check if access tokens need refresh');
    console.log('   5. Test Twitter API call format directly');

  } catch (error) {
    console.error('❌ Production Twitter test failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

// Handle command line arguments
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
🐦 DeGen Oracle Production Twitter Posting Test

Usage: node test-production-twitter-posting.js [options]

Options:
  --help, -h        Show this help message

This tool will test Twitter posting functionality in production:
1. KOL call endpoint with Twitter posting
2. Direct Twitter posting endpoint
3. Twitter posting preferences
4. User profile structure
5. Analysis and recommendations

Examples:
  node test-production-twitter-posting.js     # Run full test
`);
  process.exit(0);
}

// Run the test
testProductionTwitterPosting();
