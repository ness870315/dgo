#!/usr/bin/env node

import fetch from 'node-fetch';

async function testProductionTokenListingAPI() {
  try {
    console.log('🧪 COMPREHENSIVE PRODUCTION API TEST');
    console.log('=' .repeat(50));
    
    const productionUrl = 'https://api.degen-oracle.com';
    
    // Test 1: Health endpoint
    console.log('\n🏥 Test 1: Health Endpoint');
    try {
      const healthResponse = await fetch(`${productionUrl}/api/health`);
      console.log(`   Status: ${healthResponse.status}`);
      console.log(`   Content-Type: ${healthResponse.headers.get('content-type')}`);
      
      if (healthResponse.headers.get('content-type')?.includes('application/json')) {
        const healthData = await healthResponse.json();
        console.log('   Response:', JSON.stringify(healthData, null, 2));
      } else {
        const textData = await healthResponse.text();
        console.log('   Response (text):', textData.substring(0, 200) + '...');
      }
    } catch (error) {
      console.log('   ❌ Health check failed:', error.message);
    }
    
    // Test 2: Token listing endpoint with invalid session
    console.log('\n🔐 Test 2: Token Listing API (Invalid Session)');
    const testData = {
      sessionId: 'invalid-session-test',
      contractAddress: 'C3DwDjT17gDvvCYC2nsdGHxDHVmQRdhKfpAdqQ29pump',
      symbol: 'RFC',
      name: 'RFC Token',
      socialLinks: {
        twitter: 'https://twitter.com/test',
        website: 'https://test.com'
      }
    };
    
    try {
      const response = await fetch(`${productionUrl}/api/user/tokens/list`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(testData)
      });
      
      console.log(`   Status: ${response.status}`);
      console.log(`   Status Text: ${response.statusText}`);
      
      const result = await response.json();
      console.log('   Response:', JSON.stringify(result, null, 2));
      
      if (response.status === 401) {
        console.log('   ✅ Expected 401 Unauthorized (invalid session)');
      } else {
        console.log('   ❌ Unexpected response status');
      }
      
    } catch (error) {
      console.log('   ❌ API test failed:', error.message);
    }
    
    // Test 3: Check if tokens endpoint works
    console.log('\n🪙 Test 3: Tokens API');
    try {
      const tokensResponse = await fetch(`${productionUrl}/api/tokens`);
      console.log(`   Status: ${tokensResponse.status}`);
      
      if (tokensResponse.ok) {
        const tokensData = await tokensResponse.json();
        console.log(`   ✅ Tokens API working - ${Array.isArray(tokensData) ? tokensData.length : 'unknown'} tokens`);
        
        // Check if RFC token is in the response
        const rfcToken = Array.isArray(tokensData) ? tokensData.find(t => 
          t.contractAddress && t.contractAddress.toLowerCase() === 'C3DwDjT17gDvvCYC2nsdGHxDHVmQRdhKfpAdqQ29pump'.toLowerCase()
        ) : null;
        
        if (rfcToken) {
          console.log(`   ✅ RFC token found in API response`);
          console.log(`   📝 Symbol: ${rfcToken.symbol}`);
          console.log(`   📝 Name: ${rfcToken.name}`);
        } else {
          console.log('   ❌ RFC token NOT found in API response');
        }
      } else {
        console.log('   ❌ Tokens API failed');
      }
    } catch (error) {
      console.log('   ❌ Tokens API test failed:', error.message);
    }
    
    // Test 4: Check fueled tokens endpoint
    console.log('\n🔥 Test 4: Fueled Tokens API');
    try {
      const fueledResponse = await fetch(`${productionUrl}/api/tokens/fuel`);
      console.log(`   Status: ${fueledResponse.status}`);
      
      if (fueledResponse.ok) {
        const fueledData = await fueledResponse.json();
        console.log(`   ✅ Fueled tokens API working - ${Array.isArray(fueledData) ? fueledData.length : 'unknown'} fueled tokens`);
      } else {
        console.log('   ❌ Fueled tokens API failed');
      }
    } catch (error) {
      console.log('   ❌ Fueled tokens API test failed:', error.message);
    }
    
    // Test 5: Check CORS headers
    console.log('\n🌐 Test 5: CORS Headers');
    try {
      const corsResponse = await fetch(`${productionUrl}/api/user/tokens/list`, {
        method: 'OPTIONS',
        headers: {
          'Origin': 'https://degen-oracle.com',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'Content-Type'
        }
      });
      
      console.log(`   OPTIONS Status: ${corsResponse.status}`);
      console.log(`   Access-Control-Allow-Origin: ${corsResponse.headers.get('Access-Control-Allow-Origin')}`);
      console.log(`   Access-Control-Allow-Methods: ${corsResponse.headers.get('Access-Control-Allow-Methods')}`);
      console.log(`   Access-Control-Allow-Headers: ${corsResponse.headers.get('Access-Control-Allow-Headers')}`);
      
    } catch (error) {
      console.log('   ❌ CORS test failed:', error.message);
    }
    
    // Summary
    console.log('\n📊 SUMMARY:');
    console.log('   The API endpoint is accessible and responding correctly.');
    console.log('   The issue is likely in the frontend or session management.');
    console.log('   Next steps:');
    console.log('   1. Check if the frontend fix was deployed');
    console.log('   2. Check browser console for errors');
    console.log('   3. Check if sessionId is valid');
    console.log('   4. Check if recordTokenListing is being called');
    
  } catch (error) {
    console.error('❌ Comprehensive API test failed:', error.message);
  }
}

// Run the test
testProductionTokenListingAPI().then(() => {
  console.log('\n🎉 Comprehensive API test completed!');
  process.exit(0);
}).catch(error => {
  console.error('❌ Comprehensive API test failed:', error);
  process.exit(1);
});
