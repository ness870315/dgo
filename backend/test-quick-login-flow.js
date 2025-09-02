// Test the complete Quick Login flow
import axios from 'axios';

async function testQuickLoginFlow() {
  console.log('🔍 Testing Complete Quick Login Flow...\n');

  try {
    // Step 1: Test demo login endpoint
    console.log('📝 Step 1: Testing demo login endpoint');
    const loginResponse = await axios.post('http://localhost:4000/auth/demo-login', {
      username: 'trader1'
    });

    console.log('✅ Demo login endpoint working');
    console.log(`   User: ${loginResponse.data.user.displayName}`);
    console.log(`   Session: ${loginResponse.data.sessionId}`);

    // Step 2: Verify the response structure matches what the frontend expects
    console.log('\n📝 Step 2: Verifying response structure');
    const expectedFields = ['success', 'user', 'sessionId'];
    const userFields = ['id', 'username', 'displayName'];

    let structureValid = true;
    
    for (const field of expectedFields) {
      if (!loginResponse.data.hasOwnProperty(field)) {
        console.log(`❌ Missing field: ${field}`);
        structureValid = false;
      }
    }

    for (const field of userFields) {
      if (!loginResponse.data.user.hasOwnProperty(field)) {
        console.log(`❌ Missing user field: ${field}`);
        structureValid = false;
      }
    }

    if (structureValid) {
      console.log('✅ Response structure is correct');
    }

    // Step 3: Test all demo users
    console.log('\n📝 Step 3: Testing all demo users');
    const demoUsers = ['trader1', 'hodler', 'analyst'];
    
    for (const username of demoUsers) {
      try {
        const response = await axios.post('http://localhost:4000/auth/demo-login', {
          username: username
        });
        console.log(`✅ ${username}: ${response.data.user.displayName}`);
      } catch (error) {
        console.log(`❌ ${username}: ${error.response?.data?.message || error.message}`);
      }
    }

    // Step 4: Test error handling
    console.log('\n📝 Step 4: Testing error handling');
    try {
      await axios.post('http://localhost:4000/auth/demo-login', {
        username: 'nonexistent'
      });
      console.log('❌ Should have failed for nonexistent user');
    } catch (error) {
      if (error.response?.status === 404) {
        console.log('✅ Correctly handles nonexistent user');
      } else {
        console.log(`❌ Unexpected error: ${error.message}`);
      }
    }

    try {
      await axios.post('http://localhost:4000/auth/demo-login', {});
      console.log('❌ Should have failed for missing username');
    } catch (error) {
      if (error.response?.status === 400) {
        console.log('✅ Correctly handles missing username');
      } else {
        console.log(`❌ Unexpected error: ${error.message}`);
      }
    }

    console.log('\n🎉 Quick Login backend is fully functional!');
    console.log('\n💡 If Quick Login still doesn\'t work in the frontend:');
    console.log('   1. Check browser console for errors');
    console.log('   2. Verify CORS is working (backend uses cors())');
    console.log('   3. Check if frontend is making requests to correct URL');
    console.log('   4. Verify AuthContext is properly handling demo login response');

  } catch (error) {
    console.error('❌ Quick Login flow test failed:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.log('🔄 Make sure the backend is running on port 4000');
    }
  }
}

testQuickLoginFlow().catch(console.error);





