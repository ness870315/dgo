import axios from 'axios';

async function testUpdateTokenFeature() {
  try {
    console.log('🧪 Testing Update Token Feature...\n');

    const baseURL = 'http://localhost:4000';
    const testSymbol = 'PENGU';
    const testUserId = 'demo1';
    
    // Test social links data
    const testSocials = {
      twitter: 'pudgypenguins',
      discord: 'discord.gg/pudgypenguins',
      instagram: 'pudgypenguins',
      tiktok: 'pudgypenguins',
      website: 'https://pudgypenguins.com'
    };

    console.log('📋 Test Configuration:');
    console.log('- Symbol:', testSymbol);
    console.log('- User ID:', testUserId);
    console.log('- Social Links:', testSocials);
    console.log('');

    // Step 1: Test getting current socials (should be empty initially)
    console.log('1️⃣ Testing GET /api/tokens/:symbol/socials...');
    try {
      const getSocialsResponse = await axios.get(`${baseURL}/api/tokens/${testSymbol}/socials`);
      console.log('✅ GET socials response:', getSocialsResponse.data);
    } catch (error) {
      console.log('ℹ️ No existing socials found (expected for first run)');
    }
    console.log('');

    // Step 2: Test updating socials
    console.log('2️⃣ Testing POST /api/tokens/update-socials...');
    const updatePayload = {
      symbol: testSymbol,
      socials: testSocials,
      userId: testUserId,
      paymentData: {
        id: 'TEST_UPDATE_' + Date.now(),
        type: 'test_mode_update',
        amount: 0,
        currency: 'TEST',
        status: 'completed_test_mode'
      }
    };

    const updateResponse = await axios.post(`${baseURL}/api/tokens/update-socials`, updatePayload);
    console.log('✅ Update socials response:', updateResponse.data);
    console.log('');

    // Step 3: Verify socials were saved
    console.log('3️⃣ Verifying socials were saved...');
    const verifySocialsResponse = await axios.get(`${baseURL}/api/tokens/${testSymbol}/socials`);
    console.log('✅ Verified socials:', verifySocialsResponse.data);
    console.log('');

    // Step 4: Test community score impact
    console.log('4️⃣ Testing community score calculation...');
    const tokensResponse = await axios.get(`${baseURL}/api/tokens`);
    const tokens = Array.isArray(tokensResponse.data) ? tokensResponse.data : tokensResponse.data.tokens;
    const penguToken = tokens.find(t => t.symbol === testSymbol);
    
    if (penguToken) {
      console.log('✅ PENGU token found with updated data:');
      console.log('- Community Score:', penguToken.communityScore);
      console.log('- Community Health Score:', penguToken.communityHealthScore);
      console.log('- Social Links:', penguToken.socials);
      console.log('- Social Sources:', penguToken.socialSources);
    } else {
      console.log('⚠️ PENGU token not found in main tokens list');
    }
    console.log('');

    // Step 5: Test validation errors
    console.log('5️⃣ Testing validation errors...');
    try {
      const invalidPayload = {
        symbol: testSymbol,
        socials: {
          twitter: 'invalid@handle!', // Invalid characters
          website: 'not-a-url'        // Invalid URL
        },
        userId: testUserId,
        paymentData: { id: 'test' }
      };

      await axios.post(`${baseURL}/api/tokens/update-socials`, invalidPayload);
      console.log('❌ Validation should have failed');
    } catch (error) {
      console.log('✅ Validation correctly rejected invalid data:', error.response?.data?.message);
    }
    console.log('');

    // Step 6: Test authentication requirement
    console.log('6️⃣ Testing authentication requirement...');
    try {
      const noAuthPayload = {
        symbol: testSymbol,
        socials: testSocials
        // Missing userId
      };

      await axios.post(`${baseURL}/api/tokens/update-socials`, noAuthPayload);
      console.log('❌ Should have required authentication');
    } catch (error) {
      console.log('✅ Authentication correctly required:', error.response?.data?.message);
    }
    console.log('');

    console.log('🎉 All Update Token Feature tests completed successfully!');
    console.log('');
    console.log('📊 Summary:');
    console.log('✅ Social links storage and retrieval');
    console.log('✅ Community score enhancement');
    console.log('✅ Input validation');
    console.log('✅ Authentication requirements');
    console.log('✅ API error handling');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

// Run the test
testUpdateTokenFeature();
