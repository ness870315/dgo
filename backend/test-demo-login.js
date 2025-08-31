// Test the demo login endpoint
import axios from 'axios';

async function testDemoLogin() {
  console.log('🔍 Testing Demo Login Endpoint...\n');

  const testUsers = ['trader1', 'hodler', 'analyst', 'invalid_user'];

  for (const username of testUsers) {
    console.log(`\n🧪 Testing login for: ${username}`);
    
    try {
      const response = await axios.post('http://localhost:4000/auth/demo-login', {
        username: username
      });

      console.log(`✅ Status: ${response.status}`);
      console.log(`📊 Response:`, JSON.stringify(response.data, null, 2));

      if (response.data.success) {
        console.log(`🎯 Login successful for ${username}`);
        console.log(`   User: ${response.data.user.displayName} (@${response.data.user.username})`);
        console.log(`   Session ID: ${response.data.sessionId}`);
      }

    } catch (error) {
      console.log(`❌ Error for ${username}:`);
      console.log(`   Status: ${error.response?.status || 'No response'}`);
      console.log(`   Message: ${error.response?.data?.message || error.message}`);
    }
  }

  console.log('\n✅ Demo login testing completed!');
}

testDemoLogin().catch(console.error);

