#!/usr/bin/env node

/**
 * TEST CALL CREATION AND RECORDING
 * Test the complete flow from call creation to thesis/receipts recording
 */

import fs from 'fs/promises';
import path from 'path';

async function testCallCreation() {
  console.log('🧪 TESTING CALL CREATION AND RECORDING');
  console.log('=' .repeat(60));
  
  try {
    // Test 1: Check if calls are being saved to the database
    console.log('📊 TEST 1: Checking saved calls in database...');
    
    const dataDir = process.env.DATA_DIR || './data';
    const usersDir = path.join(dataDir, 'users');
    
    try {
      const userDirs = await fs.readdir(usersDir);
      console.log(`Found ${userDirs.length} user directories`);
      
      let totalCalls = 0;
      let callsWithThesis = 0;
      let callsWithTwitter = 0;
      
      for (const userDir of userDirs) {
        const userPath = path.join(usersDir, userDir);
        const callsFile = path.join(userPath, 'kol-calls.json');
        
        try {
          const callsData = await fs.readFile(callsFile, 'utf8');
          const calls = JSON.parse(callsData);
          
          if (Array.isArray(calls)) {
            totalCalls += calls.length;
            
            calls.forEach(call => {
              if (call.thesis) callsWithThesis++;
              if (call.twitterPostId) callsWithTwitter++;
              
              console.log(`   Call: ${call.token?.symbol} - Thesis: ${!!call.thesis} - Twitter: ${!!call.twitterPostId}`);
              if (call.thesis) {
                console.log(`     Thesis: ${call.thesis.substring(0, 100)}...`);
              }
              if (call.twitterPostId) {
                console.log(`     Twitter Post ID: ${call.twitterPostId}`);
              }
            });
          }
        } catch (error) {
          // User might not have calls file yet
        }
      }
      
      console.log(`\n📈 SUMMARY:`);
      console.log(`   Total calls: ${totalCalls}`);
      console.log(`   Calls with thesis: ${callsWithThesis}`);
      console.log(`   Calls with Twitter posts: ${callsWithTwitter}`);
      
    } catch (error) {
      console.log(`❌ Error reading user data: ${error.message}`);
    }
    
    // Test 2: Check leaderboard data
    console.log('\n🏆 TEST 2: Checking leaderboard data...');
    
    try {
      const leaderboardFile = path.join(dataDir, 'global', 'leaderboard.json');
      const leaderboardData = await fs.readFile(leaderboardFile, 'utf8');
      const leaderboard = JSON.parse(leaderboardData);
      
      console.log(`Leaderboard entries: ${leaderboard.length}`);
      leaderboard.slice(0, 5).forEach((entry, i) => {
        console.log(`   ${i + 1}. ${entry.username} - Calls: ${entry.totalCalls} - Efficiency: ${entry.efficiencyScore?.toFixed(2) || 'N/A'}`);
      });
      
    } catch (error) {
      console.log(`❌ Error reading leaderboard: ${error.message}`);
    }
    
    // Test 3: Check recent API calls
    console.log('\n🌐 TEST 3: Testing API endpoints...');
    
    try {
      const API_BASE = 'https://api.degen-oracle.com';
      
      // Test KOL calls endpoint
      console.log('Testing KOL calls endpoint...');
      const callsResponse = await fetch(`${API_BASE}/api/user/kol-calls`);
      console.log(`KOL calls status: ${callsResponse.status}`);
      
      if (callsResponse.ok) {
        const callsData = await callsResponse.json();
        console.log(`KOL calls response: ${JSON.stringify(callsData, null, 2)}`);
      }
      
      // Test leaderboard endpoint
      console.log('\nTesting leaderboard endpoint...');
      const leaderboardResponse = await fetch(`${API_BASE}/api/kol/leaderboard`);
      console.log(`Leaderboard status: ${leaderboardResponse.status}`);
      
      if (leaderboardResponse.ok) {
        const leaderboardData = await leaderboardResponse.json();
        console.log(`Leaderboard response: ${JSON.stringify(leaderboardData, null, 2)}`);
      }
      
    } catch (error) {
      console.log(`❌ Error testing API: ${error.message}`);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testCallCreation().catch(console.error);
