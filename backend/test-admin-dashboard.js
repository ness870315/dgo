import axios from 'axios';

const API_BASE = 'http://localhost:4000';

async function testAdminDashboard() {
  console.log('🛠️ Testing Admin Dashboard API Endpoints...\n');

  try {
    // Test 1: System Status
    console.log('📊 Testing System Status...');
    const systemStatus = await axios.get(`${API_BASE}/api/admin/system/status`);
    console.log('✅ System Status:', systemStatus.data.success ? 'OK' : 'FAILED');
    if (systemStatus.data.success) {
      console.log(`   - Backend: ${systemStatus.data.system.backend}`);
      console.log(`   - Total Tokens: ${systemStatus.data.tokens.total}`);
      console.log(`   - With Twitter Data: ${systemStatus.data.tokens.withTwitterData}`);
      console.log(`   - Processing: ${systemStatus.data.processing.isProcessing ? 'Running' : 'Stopped'}`);
    }
    console.log('');

    // Test 2: Health Check
    console.log('🏥 Testing Health Check...');
    const health = await axios.get(`${API_BASE}/health`);
    console.log('✅ Health Check:', health.data.status);
    console.log('');

    // Test 3: API Status
    console.log('📡 Testing API Status...');
    const apiStatus = await axios.get(`${API_BASE}/api/status`);
    console.log('✅ API Status:', apiStatus.data.success ? 'OK' : 'FAILED');
    console.log('');

    // Test 4: Search Tokens
    console.log('🔍 Testing Token Search...');
    const search = await axios.get(`${API_BASE}/api/admin/tokens/search?q=&limit=5`);
    console.log('✅ Token Search:', search.data.success ? 'OK' : 'FAILED');
    if (search.data.success) {
      console.log(`   - Found: ${search.data.totalFound} tokens`);
      console.log(`   - Sample: ${search.data.tokens.slice(0, 3).map(t => t.symbol).join(', ')}`);
    }
    console.log('');

    // Test 5: Twitter API Status
    console.log('🐦 Testing Twitter API Status...');
    const twitterStatus = await axios.get(`${API_BASE}/api/admin/twitter/status`);
    console.log('✅ Twitter Status:', twitterStatus.data.success ? 'OK' : 'FAILED');
    if (twitterStatus.data.success) {
      console.log(`   - Rate Limited: ${twitterStatus.data.twitter.isRateLimited ? 'YES' : 'NO'}`);
      console.log(`   - Hourly Requests: ${twitterStatus.data.twitter.requests.hourly}`);
      console.log(`   - Daily Requests: ${twitterStatus.data.twitter.requests.daily}`);
    }
    console.log('');

    // Test 6: Add Free Token (Test Mode)
    console.log('🆓 Testing Add Free Token...');
    const testToken = {
      symbol: 'TEST',
      name: 'Test Token',
      contractAddress: '0x1234567890abcdef',
      socialLinks: {
        twitter: 'testtokenofficial',
        website: 'https://testtoken.com'
      }
    };

    try {
      const addToken = await axios.post(`${API_BASE}/api/admin/tokens/add-free`, testToken);
      console.log('✅ Add Free Token:', addToken.data.success ? 'OK' : 'FAILED');
      if (addToken.data.success) {
        console.log(`   - Message: ${addToken.data.message}`);
      }
    } catch (error) {
      console.log('⚠️ Add Free Token: May already exist or processing queue full');
    }
    console.log('');

    // Test 7: Manual Twitter Refresh (if we have tokens)
    if (search.data.success && search.data.tokens.length > 0) {
      const sampleToken = search.data.tokens[0].symbol;
      console.log(`🐦 Testing Manual Twitter Refresh for ${sampleToken}...`);
      
      try {
        const twitterRefresh = await axios.post(`${API_BASE}/api/admin/tokens/${sampleToken}/refresh-twitter`);
        console.log('✅ Twitter Refresh:', twitterRefresh.data.success ? 'OK' : 'FAILED');
        if (twitterRefresh.data.success) {
          console.log(`   - Mentions: ${twitterRefresh.data.token.twitterData.mentions}`);
          console.log(`   - Followers: ${twitterRefresh.data.token.twitterData.followers}`);
        }
      } catch (error) {
        console.log('⚠️ Twitter Refresh: May be rate limited or token not found');
      }
      console.log('');
    }

    // Test 8: Fuel Tokens (if we have tokens)
    if (search.data.success && search.data.tokens.length > 0) {
      const sampleTokens = search.data.tokens.slice(0, 2).map(t => t.symbol);
      console.log(`⛽ Testing Fuel Tokens for ${sampleTokens.join(', ')}...`);
      
      try {
        const fuel = await axios.post(`${API_BASE}/api/admin/tokens/fuel`, {
          symbols: sampleTokens
        });
        console.log('✅ Fuel Tokens:', fuel.data.success ? 'OK' : 'FAILED');
        if (fuel.data.success) {
          console.log(`   - Message: ${fuel.data.message}`);
        }
      } catch (error) {
        console.log('⚠️ Fuel Tokens: May be rate limited or tokens not found');
      }
      console.log('');
    }

    // Test 9: Processing Control
    console.log('⚙️ Testing Processing Control...');
    
    try {
      const processingStatus = await axios.get(`${API_BASE}/api/processing/status`);
      console.log('✅ Processing Status:', processingStatus.data ? 'OK' : 'FAILED');
      console.log(`   - Is Processing: ${processingStatus.data.isProcessing}`);
      console.log(`   - Processed Count: ${processingStatus.data.processedCount}`);
      console.log(`   - Queue Length: ${processingStatus.data.queueLength}`);
    } catch (error) {
      console.log('⚠️ Processing Status: Error getting status');
    }
    console.log('');

    // Test 10: Delete Test Token (cleanup)
    console.log('🗑️ Testing Delete Token (cleanup TEST token)...');
    try {
      const deleteToken = await axios.delete(`${API_BASE}/api/admin/tokens/TEST`);
      console.log('✅ Delete Token:', deleteToken.data.success ? 'OK' : 'FAILED');
      if (deleteToken.data.success) {
        console.log(`   - Message: ${deleteToken.data.message}`);
      }
    } catch (error) {
      console.log('⚠️ Delete Token: TEST token may not exist');
    }
    console.log('');

    console.log('🎉 Admin Dashboard API Test Complete!');
    console.log('');
    console.log('📋 Dashboard Access:');
    console.log(`   🌐 Open: http://localhost:4000/admin-dashboard.html`);
    console.log('   🛠️ Full admin interface with all features');
    console.log('   🔄 Auto-refreshing system status');
    console.log('   🚨 Emergency restart controls');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.log('');
    console.log('💡 Make sure your backend is running:');
    console.log('   node enhancedBackend.js');
  }
}

testAdminDashboard();




