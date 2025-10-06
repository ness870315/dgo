#!/usr/bin/env node

/**
 * Test the NFT verification endpoint on production
 */

import fetch from 'node-fetch';

const API_BASE = 'https://api.degen-oracle.com';

async function testNFTEndpoint() {
  try {
    console.log('🧪 Testing NFT verification endpoint...\n');
    
    // Use a dummy session and wallet for testing
    const testData = {
      sessionId: 'test-session-id',
      walletAddress: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU'
    };
    
    console.log(`📡 POST ${API_BASE}/api/user/premium/verify-nft`);
    console.log(`📦 Body:`, testData);
    console.log('');
    
    const response = await fetch(`${API_BASE}/api/user/premium/verify-nft`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testData)
    });
    
    console.log(`📊 Status: ${response.status} ${response.statusText}`);
    console.log(`📋 Content-Type: ${response.headers.get('content-type')}`);
    console.log('');
    
    const contentType = response.headers.get('content-type');
    
    if (contentType && contentType.includes('application/json')) {
      const data = await response.json();
      console.log('✅ Response is JSON:');
      console.log(JSON.stringify(data, null, 2));
    } else {
      const text = await response.text();
      console.log('❌ Response is NOT JSON (HTML/Text):');
      console.log(text.substring(0, 500)); // Show first 500 chars
      
      if (text.includes('Cannot find module')) {
        console.log('\n🔍 Detected: Module not found error');
        console.log('💡 Solution: The production server may need to restart/redeploy');
      } else if (text.includes('Error')) {
        console.log('\n🔍 Detected: Runtime error');
      }
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testNFTEndpoint().then(() => {
  console.log('\n🏁 Test completed');
  process.exit(0);
}).catch(error => {
  console.error('💥 Test failed:', error);
  process.exit(1);
});
