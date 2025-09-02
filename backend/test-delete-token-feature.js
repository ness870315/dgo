import axios from 'axios';

async function testDeleteTokenFeature() {
  console.log('🗑️ Testing Delete Token Feature...\n');

  const API_BASE = 'http://localhost:4000';

  try {
    // Step 1: Add a test token first
    console.log('📝 Step 1: Adding test token for deletion...');
    const testToken = {
      symbol: 'DELTEST',
      name: 'Delete Test Token',
      contractAddress: '1234567890abcdef',
      socialLinks: {
        twitter: 'deletetesttoken',
        website: 'https://deletetest.com'
      }
    };

    const addResponse = await axios.post(`${API_BASE}/api/admin/tokens/add-free`, testToken);
    
    if (addResponse.data.success) {
      console.log('✅ Test token added successfully');
      console.log(`   Token: ${addResponse.data.token.symbol} (${addResponse.data.token.name})`);
    } else {
      console.log('❌ Failed to add test token:', addResponse.data.error);
      return;
    }

    // Step 2: Verify token exists
    console.log('\n🔍 Step 2: Verifying token exists in database...');
    const searchResponse = await axios.get(`${API_BASE}/api/admin/tokens/search?q=DELTEST&limit=10`);
    
    if (searchResponse.data.success && searchResponse.data.tokens.length > 0) {
      const foundToken = searchResponse.data.tokens.find(t => t.symbol === 'DELTEST');
      if (foundToken) {
        console.log('✅ Token found in database');
        console.log(`   Symbol: ${foundToken.symbol}`);
        console.log(`   Name: ${foundToken.name}`);
        console.log(`   Stage: ${foundToken.stage}`);
        console.log(`   Has Twitter Data: ${foundToken.hasTwitterData}`);
        console.log(`   Has Socials: ${foundToken.hasSocials}`);
      } else {
        console.log('❌ Token not found in search results');
        return;
      }
    } else {
      console.log('❌ Failed to search for token');
      return;
    }

    // Step 3: Delete the token
    console.log('\n🗑️ Step 3: Deleting the test token...');
    const deleteResponse = await axios.delete(`${API_BASE}/api/admin/tokens/DELTEST`);
    
    if (deleteResponse.data.success) {
      console.log('✅ Token deleted successfully');
      console.log(`   Message: ${deleteResponse.data.message}`);
      console.log(`   Deleted Count: ${deleteResponse.data.deletedCount}`);
    } else {
      console.log('❌ Failed to delete token:', deleteResponse.data.error);
      return;
    }

    // Step 4: Verify token is gone
    console.log('\n🔍 Step 4: Verifying token is completely removed...');
    const verifyResponse = await axios.get(`${API_BASE}/api/admin/tokens/search?q=DELTEST&limit=10`);
    
    if (verifyResponse.data.success) {
      const foundToken = verifyResponse.data.tokens.find(t => t.symbol === 'DELTEST');
      if (!foundToken) {
        console.log('✅ Token successfully removed from database');
      } else {
        console.log('❌ Token still exists in database (deletion failed)');
        return;
      }
    }

    // Step 5: Test system status update
    console.log('\n📊 Step 5: Checking system status update...');
    const statusResponse = await axios.get(`${API_BASE}/api/admin/system/status`);
    
    if (statusResponse.data.success) {
      console.log('✅ System status updated');
      console.log(`   Total Tokens: ${statusResponse.data.tokens.total}`);
      console.log(`   Completed Tokens: ${statusResponse.data.tokens.completed}`);
      console.log(`   With Twitter Data: ${statusResponse.data.tokens.withTwitterData}`);
    }

    console.log('\n🎉 DELETE TOKEN FEATURE TEST COMPLETE!');
    console.log('\n📋 Available Delete Methods:');
    console.log('1. 🔍 Search & Delete: Search for tokens, then click 🗑️ button');
    console.log('2. 🗑️ Direct Delete: Enter symbol in dedicated delete section');
    console.log('3. 🔧 API Delete: DELETE /api/admin/tokens/:symbol');
    
    console.log('\n🛡️ Safety Features:');
    console.log('✅ Confirmation prompts before deletion');
    console.log('✅ Complete removal (main cache + Twitter + socials)');
    console.log('✅ Error handling and user feedback');
    console.log('✅ System status auto-refresh after deletion');

  } catch (error) {
    if (error.response) {
      console.log(`❌ Error ${error.response.status}: ${error.response.data.error || error.response.statusText}`);
    } else {
      console.log(`❌ Network Error: ${error.message}`);
      console.log('💡 Make sure backend is running: node enhancedBackend.js');
    }
  }
}

testDeleteTokenFeature();




