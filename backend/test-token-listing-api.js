#!/usr/bin/env node

import fetch from 'node-fetch';

async function testTokenListingAPI() {
  try {
    console.log('🧪 TESTING TOKEN LISTING API');
    console.log('=' .repeat(50));
    
    const testData = {
      sessionId: 'test-session-123',
      contractAddress: 'C3DwDjT17gDvvCYC2nsdGHxDHVmQRdhKfpAdqQ29pump',
      symbol: 'TEST',
      name: 'Test Token',
      socialLinks: {
        twitter: 'https://twitter.com/test',
        website: 'https://test.com'
      }
    };
    
    console.log('📤 Sending test request:');
    console.log('   URL: http://localhost:4000/api/user/tokens/list');
    console.log('   Method: POST');
    console.log('   Data:', JSON.stringify(testData, null, 2));
    
    const response = await fetch('http://localhost:4000/api/user/tokens/list', {
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
      console.log('\n✅ API call successful!');
    } else {
      console.log('\n❌ API call failed!');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the test
testTokenListingAPI().then(() => {
  console.log('\n🎉 Test completed!');
  process.exit(0);
}).catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
