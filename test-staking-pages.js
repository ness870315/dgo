#!/usr/bin/env node

/**
 * Test script for AI Liquid Staking Router Landing Page and dApp
 * 
 * This script tests the new staking pages:
 * - /staking (Landing Page)
 * - /staking/ai-lst-router (dApp)
 * 
 * Run with: node test-staking-pages.js
 */

const https = require('https');

const BASE_URL = 'https://degen-oracle.com';

async function testEndpoint(path, description) {
  return new Promise((resolve) => {
    const url = `${BASE_URL}${path}`;
    
    console.log(`\n🔍 Testing ${description}...`);
    console.log(`   URL: ${url}`);
    
    const req = https.get(url, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode === 200) {
          console.log(`   ✅ Status: ${res.statusCode}`);
          console.log(`   📄 Content-Type: ${res.headers['content-type']}`);
          
          // Check if it's HTML content
          if (res.headers['content-type']?.includes('text/html')) {
            console.log(`   📝 HTML Content Length: ${data.length} characters`);
            
            // Check for key elements
            if (data.includes('AI-Liquid Staking Router')) {
              console.log(`   🎯 Found: Landing page title`);
            }
            if (data.includes('AI Liquid Staking Router')) {
              console.log(`   🎯 Found: dApp title`);
            }
            if (data.includes('x402 protocol')) {
              console.log(`   🎯 Found: x402 protocol mention`);
            }
            if (data.includes('solana-purple')) {
              console.log(`   🎨 Found: Degen Oracle styling`);
            }
          }
          
          resolve({ success: true, status: res.statusCode, data });
        } else {
          console.log(`   ❌ Status: ${res.statusCode}`);
          resolve({ success: false, status: res.statusCode, data });
        }
      });
    });
    
    req.on('error', (error) => {
      console.log(`   ❌ Error: ${error.message}`);
      resolve({ success: false, error: error.message });
    });
    
    req.setTimeout(10000, () => {
      console.log(`   ⏰ Timeout: Request took too long`);
      req.destroy();
      resolve({ success: false, error: 'Timeout' });
    });
  });
}

async function runTests() {
  console.log('🧪 Testing AI Liquid Staking Router Pages');
  console.log('==========================================');
  console.log(`Base URL: ${BASE_URL}`);
  
  const tests = [
    {
      path: '/staking',
      description: 'AI Staking Landing Page'
    },
    {
      path: '/staking/ai-lst-router',
      description: 'AI Liquid Staking Router dApp'
    }
  ];
  
  const results = [];
  
  for (const test of tests) {
    const result = await testEndpoint(test.path, test.description);
    results.push({ ...test, ...result });
    
    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // Summary
  console.log('\n📊 Test Results Summary');
  console.log('======================');
  
  const passed = results.filter(r => r.success).length;
  const total = results.length;
  
  results.forEach(result => {
    const status = result.success ? '✅' : '❌';
    console.log(`${status} ${result.description}: ${result.status || 'Error'}`);
  });
  
  console.log(`\n📈 Success Rate: ${passed}/${total} (${Math.round(passed/total*100)}%)`);
  
  if (passed === total) {
    console.log('\n🎉 All tests passed! AI Liquid Staking Router is ready!');
    console.log('\n🚀 Available Pages:');
    console.log('   • Landing Page: https://degen-oracle.com/staking');
    console.log('   • dApp: https://degen-oracle.com/staking/ai-lst-router');
  } else {
    console.log('\n⚠️ Some tests failed. Check the deployment and routing.');
  }
}

// Run the tests
runTests().catch(error => {
  console.error('❌ Test runner error:', error.message);
  process.exit(1);
});
