#!/usr/bin/env node

/**
 * CHECK PRODUCTION CALL DETAILS
 * Check if existing calls have thesis and Twitter data
 */

async function checkProductionCallDetails() {
  console.log('🔍 CHECKING PRODUCTION CALL DETAILS');
  console.log('=' .repeat(60));
  
  try {
    const API_BASE = 'https://api.degen-oracle.com';
    
    // Get the admin summary to see existing calls
    console.log('📊 Getting existing calls...');
    const summaryResponse = await fetch(`${API_BASE}/api/admin/kol-calls/summary`);
    
    if (!summaryResponse.ok) {
      console.log(`❌ Failed to get summary: ${summaryResponse.status}`);
      return;
    }
    
    const summaryData = await summaryResponse.json();
    console.log(`✅ Found ${summaryData.totalCalls} total calls`);
    
    if (summaryData.sample && summaryData.sample.length > 0) {
      console.log('\n📋 SAMPLE CALL DETAILS:');
      
      for (let i = 0; i < Math.min(3, summaryData.sample.length); i++) {
        const call = summaryData.sample[i];
        console.log(`\n${i + 1}. Call ID: ${call.id}`);
        console.log(`   Token: ${call.token.symbol} (${call.token.name})`);
        console.log(`   User: ${call.userId}`);
        console.log(`   Called At: ${call.calledAt}`);
        console.log(`   Called MC: $${call.calledMC?.toFixed(2) || 'N/A'}`);
        console.log(`   Has Thesis: ${!!call.thesis}`);
        console.log(`   Has Twitter Post: ${!!call.twitterPostId}`);
        console.log(`   Twitter Enabled: ${!!call.twitterEnabled}`);
        console.log(`   Tone: ${call.tone || 'N/A'}`);
        
        if (call.thesis) {
          console.log(`   Thesis: ${call.thesis.substring(0, 100)}...`);
        }
        
        if (call.twitterPostId) {
          console.log(`   Twitter Post ID: ${call.twitterPostId}`);
        }
      }
    }
    
    // Test the correct leaderboard endpoint
    console.log('\n🏆 TESTING CORRECT LEADERBOARD ENDPOINT...');
    
    try {
      const leaderboardResponse = await fetch(`${API_BASE}/api/leaderboard`);
      console.log(`Leaderboard status: ${leaderboardResponse.status}`);
      
      if (leaderboardResponse.ok) {
        const leaderboardData = await leaderboardResponse.json();
        console.log(`✅ Leaderboard response: ${JSON.stringify(leaderboardData, null, 2)}`);
      } else {
        const errorText = await leaderboardResponse.text();
        console.log(`❌ Leaderboard error: ${errorText}`);
      }
    } catch (error) {
      console.log(`❌ Error testing leaderboard: ${error.message}`);
    }
    
    // Test the winners endpoint
    console.log('\n🏆 TESTING LEADERBOARD WINNERS ENDPOINT...');
    
    try {
      const winnersResponse = await fetch(`${API_BASE}/api/leaderboard/winners`);
      console.log(`Winners status: ${winnersResponse.status}`);
      
      if (winnersResponse.ok) {
        const winnersData = await winnersResponse.json();
        console.log(`✅ Winners response: ${JSON.stringify(winnersData, null, 2)}`);
      } else {
        const errorText = await winnersResponse.text();
        console.log(`❌ Winners error: ${errorText}`);
      }
    } catch (error) {
      console.log(`❌ Error testing winners: ${error.message}`);
    }
    
  } catch (error) {
    console.error('❌ Check failed:', error.message);
  }
}

checkProductionCallDetails().catch(console.error);
