#!/usr/bin/env node

/**
 * LST Registry Service Test Script
 * 
 * This script tests the basic functionality of the LST Registry Service
 */

import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3001';

async function testLSTRegistry() {
  console.log('🧪 [LST Registry Test] Starting tests...\n');

  try {
    // Test 1: Health Check
    console.log('1️⃣ Testing health check...');
    const healthResponse = await fetch(`${BASE_URL}/health`);
    const healthData = await healthResponse.json();
    
    if (healthResponse.ok) {
      console.log('✅ Health check passed');
      console.log(`   Service: ${healthData.service}`);
      console.log(`   Status: ${healthData.status}`);
    } else {
      console.log('❌ Health check failed');
      return;
    }

    // Test 2: Get All LSTs
    console.log('\n2️⃣ Testing get all LSTs...');
    const lstsResponse = await fetch(`${BASE_URL}/api/lsts?limit=5`);
    const lstsData = await lstsResponse.json();
    
    if (lstsResponse.ok) {
      console.log('✅ Get all LSTs passed');
      console.log(`   Count: ${lstsData.count}`);
      console.log(`   Sample LSTs:`);
      lstsData.data.slice(0, 3).forEach(lst => {
        console.log(`     - ${lst.symbol}: ${lst.apr.toFixed(2)}% APR, Risk: ${lst.riskScore.toFixed(2)}`);
      });
    } else {
      console.log('❌ Get all LSTs failed');
    }

    // Test 3: Get Top LSTs
    console.log('\n3️⃣ Testing get top LSTs...');
    const topResponse = await fetch(`${BASE_URL}/api/lsts/top/3`);
    const topData = await topResponse.json();
    
    if (topResponse.ok) {
      console.log('✅ Get top LSTs passed');
      console.log(`   Top 3 LSTs by APR:`);
      topData.data.forEach((lst, index) => {
        console.log(`     ${index + 1}. ${lst.symbol}: ${lst.apr.toFixed(2)}% APR`);
      });
    } else {
      console.log('❌ Get top LSTs failed');
    }

    // Test 4: Search LSTs
    console.log('\n4️⃣ Testing search LSTs...');
    const searchResponse = await fetch(`${BASE_URL}/api/lsts/search/sol`);
    const searchData = await searchResponse.json();
    
    if (searchResponse.ok) {
      console.log('✅ Search LSTs passed');
      console.log(`   Found ${searchData.count} LSTs matching "sol"`);
      if (searchData.data.length > 0) {
        console.log(`   First result: ${searchData.data[0].symbol}`);
      }
    } else {
      console.log('❌ Search LSTs failed');
    }

    // Test 5: Get Registry Stats
    console.log('\n5️⃣ Testing registry stats...');
    const statsResponse = await fetch(`${BASE_URL}/api/stats`);
    const statsData = await statsResponse.json();
    
    if (statsResponse.ok) {
      console.log('✅ Registry stats passed');
      console.log(`   Total LSTs: ${statsData.data.totalLSTs}`);
      console.log(`   Verified LSTs: ${statsData.data.verifiedLSTs}`);
      console.log(`   Average APR: ${statsData.data.averageAPR.toFixed(2)}%`);
      console.log(`   Total TVL: $${statsData.data.totalTVL.toLocaleString()}`);
    } else {
      console.log('❌ Registry stats failed');
    }

    // Test 6: Database Health
    console.log('\n6️⃣ Testing database health...');
    const dbHealthResponse = await fetch(`${BASE_URL}/api/admin/health`);
    const dbHealthData = await dbHealthResponse.json();
    
    if (dbHealthResponse.ok) {
      console.log('✅ Database health check passed');
      console.log(`   Status: ${dbHealthData.data.status}`);
      console.log(`   Connected: ${dbHealthData.data.connected}`);
      console.log(`   Total LSTs in DB: ${dbHealthData.data.totalLSTs}`);
    } else {
      console.log('❌ Database health check failed');
    }

    console.log('\n🎉 [LST Registry Test] All tests completed!');

  } catch (error) {
    console.error('❌ [LST Registry Test] Test failed:', error.message);
    console.log('\n💡 Make sure the LST Registry service is running:');
    console.log('   npm start');
    console.log('   or');
    console.log('   node index.js');
  }
}

// Run tests
testLSTRegistry();
