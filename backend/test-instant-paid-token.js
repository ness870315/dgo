import axios from 'axios';

async function testInstantPaidToken() {
  console.log('⚡ Testing INSTANT Paid Token Processing...\n');

  const testToken = {
    tokenData: {
      symbol: 'TESTPAID',
      name: 'Test Paid Token',
      contractAddress: '5EpbKX221NYVidK6A2nJGhtuLPvrPiQ6shknLbtjBAGS'
    },
    paymentData: {
      id: 'TEST_INSTANT_' + Date.now(),
      type: 'test_mode',
      amount: 0.1,
      currency: 'SOL',
      status: 'completed_test_mode'
    },
    socialLinks: {
      twitter: 'testpaidtoken',
      website: 'https://testpaid.com'
    }
  };

  try {
    console.log('🚀 Sending paid token for INSTANT processing...');
    const startTime = Date.now();
    
    const response = await axios.post('http://localhost:4000/api/tokens/add-paid-token', testToken);
    
    const endTime = Date.now();
    const processingTime = endTime - startTime;
    
    if (response.data.success) {
      console.log('✅ INSTANT PROCESSING SUCCESS!');
      console.log(`⚡ Processing Time: ${processingTime}ms`);
      console.log(`📊 Token: ${response.data.token.symbol} (${response.data.token.name})`);
      console.log(`🎯 Stage: ${response.data.token.stage}`);
      console.log(`🐦 Mentions: ${response.data.token.mentions}`);
      console.log(`⭐ Community Score: ${response.data.token.communityScore}`);
      console.log(`📱 Twitter Data: ${response.data.token.hasTwitterData ? 'YES' : 'NO'}`);
      console.log(`🚀 Jupiter Data: ${response.data.token.hasJupiterData ? 'YES' : 'NO'}`);
      console.log(`💰 Processing: ${response.data.token.processingTime}`);
      
      // Verify token is immediately available in API
      console.log('\n🔍 Verifying token is immediately available...');
      const tokensResponse = await axios.get('http://localhost:4000/api/tokens');
      const foundToken = tokensResponse.data.find(t => t.symbol === 'TESTPAID');
      
      if (foundToken) {
        console.log('✅ Token IMMEDIATELY available in main API!');
        console.log(`📊 API Token: ${foundToken.symbol} - ${foundToken.mentions} mentions`);
      } else {
        console.log('❌ Token NOT found in main API (this should not happen)');
      }
      
    } else {
      console.log('❌ Processing failed:', response.data.error);
    }

  } catch (error) {
    if (error.response) {
      console.log(`❌ Error ${error.response.status}: ${error.response.data.error || error.response.statusText}`);
    } else {
      console.log(`❌ Network Error: ${error.message}`);
      console.log('💡 Make sure backend is running: node enhancedBackend.js');
    }
  }

  console.log('\n🎯 Benefits of Instant Processing:');
  console.log('✅ No queuing - processes immediately');
  console.log('✅ Runs in parallel with background processing');
  console.log('✅ Complete data (CoinGecko + Jupiter + Twitter)');
  console.log('✅ Immediately available in API');
  console.log('✅ Perfect for paid services');
}

testInstantPaidToken();




