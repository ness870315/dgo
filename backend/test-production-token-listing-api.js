#!/usr/bin/env node

import fetch from 'node-fetch';

async function testProductionTokenListingAPI() {
  try {
    console.log('🧪 TESTING PRODUCTION TOKEN LISTING API');
    console.log('=' .repeat(50));
    
    const productionUrl = 'https://api.degen-oracle.com';
    const testData = {
      sessionId: 'test-session-production',
      contractAddress: 'C3DwDjT17gDvvCYC2nsdGHxDHVmQRdhKfpAdqQ29pump',
      symbol: 'RFC',
      name: 'RFC Token',
      socialLinks: {
        twitter: 'https://twitter.com/test',
        website: 'https://test.com'
      }
    };
    
    console.log('📤 Testing production API:');
    console.log(`   URL: ${productionUrl}/api/user/tokens/list`);
    console.log('   Method: POST');
    console.log('   Data:', JSON.stringify(testData, null, 2));
    
    const response = await fetch(`${productionUrl}/api/user/tokens/list`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(testData)
    });
    
    console.log('\n📥 Response:');
    console.log('   Status:', response.status);
    console.log('   Status Text:', response.statusText);
    
    const result = await response.json();
    console.log('   Body:', JSON.stringify(result, null, 2));
    
    if (response.ok) {
      console.log('\n✅ API endpoint is accessible!');
      console.log('   The issue is likely in the frontend or session handling.');
    } else {
      console.log('\n❌ API endpoint returned error!');
      if (response.status === 401) {
        console.log('   → Authentication required (expected for test session)');
      } else {
        console.log('   → Unexpected error, check backend logs');
      }
    }
    
    // Test health endpoint
    console.log('\n🏥 Testing health endpoint:');
    try {
      const healthResponse = await fetch(`${productionUrl}/api/health`);
      const healthData = await healthResponse.json();
      console.log('   Health Status:', healthResponse.status);
      console.log('   Health Data:', JSON.stringify(healthData, null, 2));
    } catch (healthError) {
      console.log('   Health check failed:', healthError.message);
    }
    
  } catch (error) {
    console.error('❌ Production test failed:', error.message);
    console.log('\n🔍 Possible issues:');
    console.log('   - Network connectivity');
    console.log('   - API server down');
    console.log('   - CORS issues');
    console.log('   - SSL certificate problems');
  }
}

// Run the test
testProductionTokenListingAPI().then(() => {
  console.log('\n🎉 Production test completed!');
  process.exit(0);
}).catch(error => {
  console.error('❌ Production test failed:', error);
  process.exit(1);
});
