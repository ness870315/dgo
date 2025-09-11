#!/usr/bin/env node

/**
 * CHECK SAVED CALL DATA
 * Verify that the CLIPPY call was actually saved with thesis and Twitter data
 */

async function checkSavedCallData() {
  console.log('🔍 CHECKING SAVED CALL DATA');
  console.log('=' .repeat(60));
  
  try {
    const API_BASE = 'https://api.degen-oracle.com';
    
    // Get the admin summary to see the latest calls
    console.log('📊 Getting latest calls from admin summary...');
    const summaryResponse = await fetch(`${API_BASE}/api/admin/kol-calls/summary`);
    
    if (!summaryResponse.ok) {
      console.log(`❌ Failed to get summary: ${summaryResponse.status}`);
      return;
    }
    
    const summaryData = await summaryResponse.json();
    console.log(`✅ Found ${summaryData.totalCalls} total calls`);
    
    if (summaryData.sample && summaryData.sample.length > 0) {
      console.log('\n📋 LATEST CALLS (including CLIPPY):');
      
      // Look for CLIPPY specifically
      const clippyCall = summaryData.sample.find(call => 
        call.token?.symbol === 'CLIPPY'
      );
      
      if (clippyCall) {
        console.log('\n🎯 CLIPPY CALL FOUND:');
        console.log(`   Call ID: ${clippyCall.id}`);
        console.log(`   Token: ${clippyCall.token.symbol} (${clippyCall.token.name})`);
        console.log(`   User: ${clippyCall.userId}`);
        console.log(`   Called At: ${clippyCall.calledAt}`);
        console.log(`   Called MC: $${clippyCall.calledMC?.toFixed(2) || 'N/A'}`);
        console.log(`   Has Thesis: ${!!clippyCall.thesis}`);
        console.log(`   Has Twitter Post: ${!!clippyCall.twitterPostId}`);
        console.log(`   Twitter Enabled: ${!!clippyCall.twitterEnabled}`);
        console.log(`   Tone: ${clippyCall.tone || 'N/A'}`);
        
        if (clippyCall.thesis) {
          console.log(`   Thesis: ${clippyCall.thesis}`);
        }
        
        if (clippyCall.twitterPostId) {
          console.log(`   Twitter Post ID: ${clippyCall.twitterPostId}`);
        }
      } else {
        console.log('\n❌ CLIPPY call not found in sample');
      }
      
      // Show all recent calls
      console.log('\n📋 ALL RECENT CALLS:');
      for (let i = 0; i < Math.min(5, summaryData.sample.length); i++) {
        const call = summaryData.sample[i];
        console.log(`\n${i + 1}. ${call.token.symbol} (${call.calledAt})`);
        console.log(`   Has Thesis: ${!!call.thesis}`);
        console.log(`   Has Twitter Post: ${!!call.twitterPostId}`);
        console.log(`   Twitter Enabled: ${!!call.twitterEnabled}`);
      }
    }
    
    // Test the KOL calls endpoint with authentication
    console.log('\n🔐 TESTING AUTHENTICATED KOL CALLS ENDPOINT...');
    
    try {
      // Try to get calls for the user who made the CLIPPY call
      const userId = '1868019393512325120'; // From the logs
      const callsResponse = await fetch(`${API_BASE}/api/user/kol-calls?userId=${userId}`);
      console.log(`KOL calls status: ${callsResponse.status}`);
      
      if (callsResponse.ok) {
        const callsData = await callsResponse.json();
        console.log(`✅ KOL calls response: ${JSON.stringify(callsData, null, 2)}`);
      } else {
        const errorText = await callsResponse.text();
        console.log(`❌ KOL calls error: ${errorText}`);
      }
    } catch (error) {
      console.log(`❌ Error testing KOL calls: ${error.message}`);
    }
    
  } catch (error) {
    console.error('❌ Check failed:', error.message);
  }
}

checkSavedCallData().catch(console.error);
