#!/usr/bin/env node

/**
 * 🐦 Debug Production Twitter Posting
 * Test script to debug Twitter posting issues on api.degen-oracle.com
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
            data: responseData ? JSON.parse(responseData) : null
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

async function debugProductionTwitter() {
  try {
    console.log('🐦 DeGen Oracle - Production Twitter Debug');
    console.log('==========================================');
    console.log(`🌐 Testing: https://${PRODUCTION_API}`);
    
    // 1. Test basic API health
    console.log('\n📡 1. Testing API Health...');
    try {
      const healthOptions = {
        hostname: PRODUCTION_API,
        port: 443,
        path: '/health',
        method: 'GET',
        headers: {
          'User-Agent': 'DegenOracle-TwitterDebug'
        }
      };

      const healthResult = await makeRequest(healthOptions);
      console.log(`   Status: ${healthResult.status}`);
      console.log(`   Response: ${JSON.stringify(healthResult.data, null, 2)}`);
    } catch (error) {
      console.error(`   ❌ Health check failed: ${error.message}`);
    }

    // 2. Test OAuth X callback endpoint
    console.log('\n🔐 2. Testing OAuth X Endpoints...');
    try {
      const oauthOptions = {
        hostname: PRODUCTION_API,
        port: 443,
        path: '/auth/x',
        method: 'GET',
        headers: {
          'User-Agent': 'DegenOracle-TwitterDebug'
        }
      };

      const oauthResult = await makeRequest(oauthOptions);
      console.log(`   OAuth X Status: ${oauthResult.status}`);
      
      if (oauthResult.status === 302) {
        console.log(`   ✅ OAuth redirect working (redirects to X)`);
        console.log(`   Location: ${oauthResult.headers.location}`);
      } else {
        console.log(`   Response: ${JSON.stringify(oauthResult.data, null, 2)}`);
      }
    } catch (error) {
      console.error(`   ❌ OAuth test failed: ${error.message}`);
    }

    // 3. Test user session validation
    console.log('\n👤 3. Testing User Session Validation...');
    try {
      const sessionOptions = {
        hostname: PRODUCTION_API,
        port: 443,
        path: '/api/user/profile?sessionId=test-invalid-session',
        method: 'GET',
        headers: {
          'User-Agent': 'DegenOracle-TwitterDebug'
        }
      };

      const sessionResult = await makeRequest(sessionOptions);
      console.log(`   Session Test Status: ${sessionResult.status}`);
      
      if (sessionResult.status === 401) {
        console.log(`   ✅ Session validation working (rejects invalid sessions)`);
      } else {
        console.log(`   Response: ${JSON.stringify(sessionResult.data, null, 2)}`);
      }
    } catch (error) {
      console.error(`   ❌ Session test failed: ${error.message}`);
    }

    // 4. Test KOL calls endpoint structure
    console.log('\n📞 4. Testing KOL Calls Endpoint...');
    try {
      const callOptions = {
        hostname: PRODUCTION_API,
        port: 443,
        path: '/api/user/kol-calls/add',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'DegenOracle-TwitterDebug'
        }
      };

      const testCallData = {
        sessionId: 'test-invalid-session',
        token: {
          symbol: 'TEST',
          name: 'Test Token',
          contractAddress: '11111111111111111111111111111111'
        },
        thesis: 'Test thesis for debugging',
        twitterEnabled: true,
        tone: 'bullish'
      };

      const callResult = await makeRequest(callOptions, testCallData);
      console.log(`   KOL Call Status: ${callResult.status}`);
      
      if (callResult.status === 401) {
        console.log(`   ✅ KOL calls endpoint exists and validates sessions`);
      } else if (callResult.status === 400) {
        console.log(`   ✅ KOL calls endpoint exists and validates input`);
      } else {
        console.log(`   Response: ${JSON.stringify(callResult.data, null, 2)}`);
      }
    } catch (error) {
      console.error(`   ❌ KOL calls test failed: ${error.message}`);
    }

    // 5. Check Twitter posting status endpoint
    console.log('\n🐦 5. Testing Twitter Status Endpoint...');
    try {
      const twitterStatusOptions = {
        hostname: PRODUCTION_API,
        port: 443,
        path: '/api/user/twitter/status?sessionId=test-invalid-session',
        method: 'GET',
        headers: {
          'User-Agent': 'DegenOracle-TwitterDebug'
        }
      };

      const twitterResult = await makeRequest(twitterStatusOptions);
      console.log(`   Twitter Status: ${twitterResult.status}`);
      
      if (twitterResult.status === 401) {
        console.log(`   ✅ Twitter status endpoint exists and validates sessions`);
      } else {
        console.log(`   Response: ${JSON.stringify(twitterResult.data, null, 2)}`);
      }
    } catch (error) {
      console.error(`   ❌ Twitter status test failed: ${error.message}`);
    }

    // 6. Test environment configuration
    console.log('\n⚙️ 6. Production Environment Analysis...');
    console.log('   Expected Twitter OAuth Flow:');
    console.log('   1. User clicks "Login with X"');
    console.log('   2. Redirects to X OAuth');
    console.log('   3. X redirects back with code');
    console.log('   4. Backend exchanges code for access token');
    console.log('   5. Access token stored in user profile');
    console.log('   6. When making call, token used to post tweet');
    
    console.log('\n🔍 Common Issues:');
    console.log('   • X_CLIENT_ID not set in production env');
    console.log('   • X_CLIENT_SECRET not set in production env');
    console.log('   • X_REDIRECT_URI mismatch');
    console.log('   • Access tokens expired/invalid');
    console.log('   • Twitter API v2 permissions not granted');
    console.log('   • Rate limiting on Twitter API');

    console.log('\n📋 Next Steps:');
    console.log('   1. Check production environment variables');
    console.log('   2. Verify Twitter app permissions include "Write"');
    console.log('   3. Test with a real user session');
    console.log('   4. Check production logs for Twitter API errors');

  } catch (error) {
    console.error('❌ Production debug failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

// Handle command line arguments
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
🐦 DeGen Oracle Production Twitter Debug Tool

Usage: node debug-production-twitter.js [options]

Options:
  --help, -h        Show this help message

This tool will test the production API endpoints related to Twitter posting:
1. API health check
2. OAuth X endpoints
3. User session validation
4. KOL calls endpoint
5. Twitter status endpoint
6. Environment analysis

Examples:
  node debug-production-twitter.js     # Run full production debug
`);
  process.exit(0);
}

// Run the production debug
debugProductionTwitter();
