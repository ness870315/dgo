import axios from 'axios';

async function testApiResponse() {
  try {
    console.log('🔍 Testing /api/tokens endpoint...');
    
    const response = await axios.get('http://localhost:4000/api/tokens');
    const data = response.data;
    
    console.log('📊 Response structure:', Object.keys(data));
    
    const tokens = data.tokens || data;
    
    if (!Array.isArray(tokens)) {
      console.log('❌ Tokens is not an array:', typeof tokens);
      return;
    }
    
    console.log(`📊 Received ${tokens.length} tokens`);
    
    // Find PENGU specifically
    const pengu = tokens.find(t => t.symbol === 'PENGU');
    
    if (pengu) {
      console.log('\n🐧 PENGU Token Analysis:');
      console.log('- Symbol:', pengu.symbol);
      console.log('- Name:', pengu.name);
      console.log('- Mentions:', pengu.mentions);
      console.log('- Community Score:', pengu.communityScore);
      console.log('- Twitter Data:', pengu.twitterData ? 'EXISTS' : 'UNDEFINED');
      
      if (pengu.twitterData) {
        console.log('  - Twitter mentions:', pengu.twitterData.mentions);
        console.log('  - Twitter tweets:', pengu.twitterData.tweets?.length || 0);
        console.log('  - Community score:', pengu.twitterData.communityScore);
      }
    } else {
      console.log('❌ PENGU token not found in response');
    }
    
    // Check first 3 tokens for Twitter data
    console.log('\n📊 First 3 tokens Twitter data check:');
    tokens.slice(0, 3).forEach((token, i) => {
      console.log(`${i + 1}. ${token.symbol}: twitterData = ${token.twitterData ? 'EXISTS' : 'UNDEFINED'}`);
    });
    
  } catch (error) {
    console.error('❌ Error testing API:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

testApiResponse();




