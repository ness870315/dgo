#!/usr/bin/env node

/**
 * TEST PRODUCTION CALL CREATION AND RECORDING
 * Test the complete flow in production at api.degen-oracle.com
 */

async function testProductionCalls() {
  console.log('🧪 TESTING PRODUCTION CALL CREATION AND RECORDING');
  console.log('=' .repeat(60));
  
  try {
    const API_BASE = 'https://api.degen-oracle.com';
    
    // Test 1: Check if we can access the KOL calls endpoint
    console.log('🌐 TEST 1: Testing KOL calls endpoint access...');
    
    try {
      const callsResponse = await fetch(`${API_BASE}/api/user/kol-calls`);
      console.log(`KOL calls status: ${callsResponse.status}`);
      
      if (callsResponse.status === 401) {
        console.log('✅ Expected 401 - endpoint requires authentication');
      } else if (callsResponse.ok) {
        const callsData = await callsResponse.json();
        console.log(`KOL calls response: ${JSON.stringify(callsData, null, 2)}`);
      } else {
        console.log(`❌ Unexpected status: ${callsResponse.status}`);
      }
    } catch (error) {
      console.log(`❌ Error testing KOL calls endpoint: ${error.message}`);
    }
    
    // Test 2: Check leaderboard endpoint
    console.log('\n🏆 TEST 2: Testing leaderboard endpoint...');
    
    try {
      const leaderboardResponse = await fetch(`${API_BASE}/api/kol/leaderboard`);
      console.log(`Leaderboard status: ${leaderboardResponse.status}`);
      
      if (leaderboardResponse.ok) {
        const leaderboardData = await leaderboardResponse.json();
        console.log(`Leaderboard response: ${JSON.stringify(leaderboardData, null, 2)}`);
      } else {
        console.log(`❌ Leaderboard endpoint failed: ${leaderboardResponse.status}`);
      }
    } catch (error) {
      console.log(`❌ Error testing leaderboard endpoint: ${error.message}`);
    }
    
    // Test 3: Check admin KOL calls summary
    console.log('\n📊 TEST 3: Testing admin KOL calls summary...');
    
    try {
      const summaryResponse = await fetch(`${API_BASE}/api/admin/kol-calls/summary`);
      console.log(`Admin summary status: ${summaryResponse.status}`);
      
      if (summaryResponse.ok) {
        const summaryData = await summaryResponse.json();
        console.log(`Admin summary response: ${JSON.stringify(summaryData, null, 2)}`);
      } else {
        console.log(`❌ Admin summary endpoint failed: ${summaryResponse.status}`);
      }
    } catch (error) {
      console.log(`❌ Error testing admin summary: ${error.message}`);
    }
    
    // Test 4: Check if there are any existing calls in the system
    console.log('\n🔍 TEST 4: Checking for existing calls...');
    
    try {
      // Try to get calls without authentication to see if we get any data
      const publicCallsResponse = await fetch(`${API_BASE}/api/admin/kol-calls/summary`);
      if (publicCallsResponse.ok) {
        const publicCallsData = await publicCallsResponse.json();
        console.log(`Public calls data: ${JSON.stringify(publicCallsData, null, 2)}`);
      }
    } catch (error) {
      console.log(`❌ Error checking public calls: ${error.message}`);
    }
    
    // Test 5: Check if the call creation endpoint exists
    console.log('\n📝 TEST 5: Testing call creation endpoint...');
    
    try {
      // Try to POST to the call creation endpoint without auth to see what happens
      const createResponse = await fetch(`${API_BASE}/api/user/kol-calls/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ test: true })
      });
      console.log(`Call creation status: ${createResponse.status}`);
      
      if (createResponse.status === 400) {
        console.log('✅ Expected 400 - missing required fields');
      } else if (createResponse.status === 401) {
        console.log('✅ Expected 401 - requires authentication');
      } else {
        const responseText = await createResponse.text();
        console.log(`Unexpected response: ${responseText}`);
      }
    } catch (error) {
      console.log(`❌ Error testing call creation: ${error.message}`);
    }
    
    // Test 6: Check if there are any recent calls by looking at the admin endpoint
    console.log('\n📈 TEST 6: Checking recent call activity...');
    
    try {
      const recentResponse = await fetch(`${API_BASE}/api/admin/kol-calls/summary`);
      if (recentResponse.ok) {
        const recentData = await recentResponse.json();
        console.log(`Recent calls summary:`);
        console.log(`  Total calls: ${recentData.totalCalls || 0}`);
        console.log(`  Users with calls: ${recentData.byUser ? Object.keys(recentData.byUser).length : 0}`);
        
        if (recentData.byUser) {
          console.log(`  Top users:`);
          Object.entries(recentData.byUser)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 5)
            .forEach(([userId, count]) => {
              console.log(`    User ${userId}: ${count} calls`);
            });
        }
      }
    } catch (error) {
      console.log(`❌ Error checking recent activity: ${error.message}`);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testProductionCalls().catch(console.error);
