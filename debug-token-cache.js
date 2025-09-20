/**
 * Debug Token Cache Issues
 * Check what's actually in the token cache
 */

import https from 'https';
import { URL } from 'url';

const API_BASE = 'https://api.degen-oracle.com';
const TEST_TOKEN = 'H8xQ6poBjB9DTPMDTKWzWPrnxu4bDEhybxiouF8Ppump'; // CLIPPY token

function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Debug-Cache-Script/1.0',
        ...options.headers
      }
    };

    const req = https.request(requestOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed, headers: res.headers });
        } catch (e) {
          resolve({ status: res.statusCode, data: data, headers: res.headers, parseError: e.message });
        }
      });
    });

    req.on('error', reject);
    
    if (options.body) {
      req.write(JSON.stringify(options.body));
    }
    
    req.end();
  });
}

async function debugTokensEndpoint() {
  console.log('🔍 Debugging All Tokens Endpoint...');
  
  try {
    const response = await makeRequest(`${API_BASE}/api/tokens`);
    
    console.log('   Status:', response.status);
    if (response.status === 200) {
      const result = response.data;
      console.log('   Response keys:', Object.keys(result));
      
      if (result.tokens && Array.isArray(result.tokens)) {
        console.log('   Total tokens in cache:', result.tokens.length);
        
        // Find our test token
        const testToken = result.tokens.find(t => 
          t.contractAddress?.toLowerCase() === TEST_TOKEN.toLowerCase() ||
          t.address?.toLowerCase() === TEST_TOKEN.toLowerCase()
        );
        
        if (testToken) {
          console.log('   ✅ Test token found in cache');
          console.log('   Token keys:', Object.keys(testToken));
          console.log('   Symbol:', testToken.symbol);
          console.log('   Name:', testToken.name);
          console.log('   Contract:', testToken.contractAddress || testToken.address);
          console.log('   USD Price:', testToken.usdPrice);
          console.log('   Has Jupiter data:', !!testToken.jupiterData);
          console.log('   Has holder data:', !!testToken.holderData);
          console.log('   Has Moralis analytics:', !!testToken.moralisAnalytics);
          
          // Check if it's a complete token
          if (testToken.symbol && testToken.name && testToken.usdPrice) {
            console.log('   ✅ Token has basic data');
          } else {
            console.log('   ❌ Token is missing basic data');
          }
        } else {
          console.log('   ❌ Test token NOT found in cache');
          
          // Show a few sample tokens to understand the structure
          console.log('   Sample tokens (first 3):');
          result.tokens.slice(0, 3).forEach((token, i) => {
            console.log(`     [${i}] Symbol: ${token.symbol}, Contract: ${token.contractAddress || token.address}`);
          });
        }
        
        return result.tokens;
      } else {
        console.log('   ❌ No tokens array found in response');
        return null;
      }
    } else {
      console.log('❌ Tokens request failed:', response.data);
      return null;
    }
  } catch (error) {
    console.log('❌ Tokens request error:', error.message);
    return null;
  }
}

async function debugSpecificToken() {
  console.log('\n🔍 Debugging Specific Token Response...');
  
  try {
    const response = await makeRequest(`${API_BASE}/api/tokens/${TEST_TOKEN}`);
    
    console.log('   Status:', response.status);
    console.log('   Response structure:', JSON.stringify(response.data, null, 2));
    
    return response.data;
  } catch (error) {
    console.log('❌ Specific token request error:', error.message);
    return null;
  }
}

async function searchForClippy() {
  console.log('\n🔍 Searching for CLIPPY token...');
  
  try {
    const response = await makeRequest(`${API_BASE}/api/tokens`);
    
    if (response.status === 200 && response.data.tokens) {
      const tokens = response.data.tokens;
      
      // Search for CLIPPY by symbol
      const clippyBySymbol = tokens.filter(t => 
        t.symbol?.toLowerCase().includes('clippy') ||
        t.name?.toLowerCase().includes('clippy')
      );
      
      console.log('   Tokens with "clippy" in name/symbol:', clippyBySymbol.length);
      clippyBySymbol.forEach((token, i) => {
        console.log(`     [${i}] ${token.symbol} - ${token.name} - ${token.contractAddress || token.address}`);
      });
      
      // Search for tokens with our contract address
      const tokenByContract = tokens.find(t => 
        (t.contractAddress || t.address)?.toLowerCase() === TEST_TOKEN.toLowerCase()
      );
      
      if (tokenByContract) {
        console.log('   ✅ Found token by contract address:');
        console.log('     Symbol:', tokenByContract.symbol);
        console.log('     Name:', tokenByContract.name);
        console.log('     Contract:', tokenByContract.contractAddress || tokenByContract.address);
        console.log('     All keys:', Object.keys(tokenByContract));
      } else {
        console.log('   ❌ No token found with contract address:', TEST_TOKEN);
      }
      
      return { clippyBySymbol, tokenByContract };
    }
  } catch (error) {
    console.log('❌ Search error:', error.message);
    return null;
  }
}

async function runCacheDebug() {
  console.log('🚀 Starting Token Cache Debug Session\n');
  
  const allTokens = await debugTokensEndpoint();
  const specificToken = await debugSpecificToken();
  const searchResults = await searchForClippy();
  
  console.log('\n📊 Cache Debug Summary:');
  console.log('========================');
  console.log('✅ All tokens endpoint accessible:', !!allTokens);
  console.log('✅ Specific token endpoint accessible:', !!specificToken);
  console.log('✅ Search completed:', !!searchResults);
  
  if (allTokens) {
    console.log(`📈 Total tokens in cache: ${allTokens.length}`);
  }
  
  if (searchResults?.tokenByContract) {
    console.log('✅ Target token found in cache');
  } else {
    console.log('❌ Target token NOT in cache - this explains the empty data');
  }
  
  console.log('\n🎯 Recommendations:');
  if (!searchResults?.tokenByContract) {
    console.log('1. The token might not be in the cache yet');
    console.log('2. The contract address might be incorrect');
    console.log('3. The token might need to be added to the system first');
  } else {
    console.log('1. Token is in cache but data structure might be different');
    console.log('2. Check why holder/moralis data is not attached to token');
  }
}

// Run the cache debug
runCacheDebug().catch(console.error);
