/**
 * Test script to check what image URL production is serving for USELESS token
 */

import https from 'https';

const API_URL = 'https://api.degen-oracle.com/api/tokens?search=USELESS';

console.log('🔍 Checking USELESS token image from production API...\n');
console.log(`📡 Fetching: ${API_URL}\n`);

https.get(API_URL, (res) => {
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    try {
      const tokens = JSON.parse(data);
      const uselessToken = tokens.find(t => t.symbol === 'USELESS');
      
      if (uselessToken) {
        console.log('✅ USELESS token found!');
        console.log('📊 Token Details:');
        console.log(`   Symbol: ${uselessToken.symbol}`);
        console.log(`   Name: ${uselessToken.name}`);
        console.log(`   Contract: ${uselessToken.contractAddress}`);
        console.log(`   Icon URL: ${uselessToken.jupiterData?.icon || 'NONE'}`);
        console.log('');
        
        const expectedURL = 'https://i.imgur.com/IHFXNnH.png';
        const actualURL = uselessToken.jupiterData?.icon;
        
        if (actualURL === expectedURL) {
          console.log('✅ SUCCESS: Image override is working!');
          console.log(`   Expected: ${expectedURL}`);
          console.log(`   Actual:   ${actualURL}`);
        } else {
          console.log('❌ ISSUE: Image override NOT applied');
          console.log(`   Expected: ${expectedURL}`);
          console.log(`   Actual:   ${actualURL || 'NONE'}`);
          console.log('');
          console.log('🔧 Possible causes:');
          console.log('   1. Backend needs to restart/redeploy');
          console.log('   2. image-overrides.json not deployed to production');
          console.log('   3. Code not yet deployed from latest push');
        }
      } else {
        console.log('❌ USELESS token not found in API response');
        console.log(`📊 Total tokens returned: ${tokens.length}`);
      }
    } catch (error) {
      console.error('❌ Error parsing response:', error.message);
    }
  });
}).on('error', (error) => {
  console.error('❌ Request failed:', error.message);
});

