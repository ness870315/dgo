import axios from 'axios';

async function testAdminFix() {
  console.log('🧪 Testing Admin Dashboard Fix...\n');

  try {
    // Test the system status endpoint that was failing
    console.log('📊 Testing System Status...');
    const response = await axios.get('http://localhost:4000/api/admin/system/status');
    
    if (response.data.success) {
      console.log('✅ System Status: WORKING!');
      console.log(`   - Backend: ${response.data.system.backend}`);
      console.log(`   - Total Tokens: ${response.data.tokens.total}`);
      console.log(`   - Twitter Rate Limited: ${response.data.twitter.isRateLimited}`);
      console.log(`   - Processing: ${response.data.processing.isProcessing ? 'Running' : 'Stopped'}`);
    } else {
      console.log('❌ System Status: Failed');
    }

  } catch (error) {
    if (error.response) {
      console.log(`❌ Error ${error.response.status}: ${error.response.data.error || error.response.statusText}`);
    } else {
      console.log(`❌ Network Error: ${error.message}`);
      console.log('💡 Make sure backend is running: node enhancedBackend.js');
    }
  }

  console.log('\n🎯 Next Steps:');
  console.log('1. Restart your backend server: node enhancedBackend.js');
  console.log('2. Open admin dashboard: http://localhost:4000/admin-dashboard.html');
  console.log('3. The 500 errors should be fixed!');
}

testAdminFix();




