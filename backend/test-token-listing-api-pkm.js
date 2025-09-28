#!/usr/bin/env node

import fetch from 'node-fetch';

async function testTokenListingAPI() {
  try {
    console.log('🧪 TESTING TOKEN LISTING API');
    console.log('=' .repeat(40));
    
    const productionUrl = 'https://api.degen-oracle.com';
    const sessionId = 'bb37b228-f145-49cc-a40e-30eb1c4cf6b1'; // GracieQuant's sessionId
    
    // Test the token listing API
    const testData = {
      sessionId: sessionId,
      contractAddress: '6LH9NDBYUf7thDx8sMZppZpxAsdXtsQ9VN37gKMpZRSp', // PKM token
      symbol: 'PKM',
      name: 'PKM Token',
      socialLinks: {
        twitter: 'https://twitter.com/test',
        website: 'https://test.com'
      }
    };
    
    console.log('📝 Testing with PKM token data:');
    console.log('   Contract:', testData.contractAddress);
    console.log('   Symbol:', testData.symbol);
    console.log('   SessionId:', sessionId.substring(0, 20) + '...');
    
    const response = await fetch(`${productionUrl}/api/user/tokens/list`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(testData)
    });
    
    console.log(`\n📊 API Response:`);
    console.log(`   Status: ${response.status}`);
    console.log(`   Status Text: ${response.statusText}`);
    
    const result = await response.json();
    console.log('   Response:', JSON.stringify(result, null, 2));
    
    if (response.status === 200 && result.success) {
      console.log('\n✅ SUCCESS: Token listing API is working!');
      console.log(`   Message: ${result.message}`);
      console.log(`   Current tokensListed: ${result.currentTokensListed}`);
      
      if (result.currentTokensListed === 2) {
        console.log('   🎉 tokensListed correctly updated to 2!');
      } else {
        console.log(`   ⚠️ tokensListed is ${result.currentTokensListed}, expected 2`);
      }
    } else {
      console.log('\n❌ FAILED: Token listing API error');
      console.log(`   Error: ${result.error}`);
    }
    
    // Test the profile API to see current stats
    console.log('\n📊 CHECKING CURRENT PROFILE STATS:');
    try {
      const profileResponse = await fetch(`${productionUrl}/api/user/profile?sessionId=${sessionId}`);
      const profileData = await profileResponse.json();
      
      if (profileResponse.ok && profileData.success) {
        console.log('   ✅ Profile API working');
        console.log(`   📊 Current tokensListed: ${profileData.user?.tokensListed || 0}`);
        console.log(`   📊 Current tokensFueled: ${profileData.user?.tokensFueled || 0}`);
      } else {
        console.log('   ❌ Profile API failed:', profileData.error);
      }
    } catch (error) {
      console.log('   ❌ Profile API error:', error.message);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the test
testTokenListingAPI().then(() => {
  console.log('\n🎉 Token listing API test completed!');
  process.exit(0);
}).catch(error => {
  console.error('❌ Token listing API test failed:', error);
  process.exit(1);
});
