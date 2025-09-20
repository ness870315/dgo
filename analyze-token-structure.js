/**
 * Analyze Token Structure from Debug Output
 * Parse the actual token structure to understand the data format
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
        'User-Agent': 'Analyze-Structure-Script/1.0',
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

async function analyzeTokenStructure() {
  console.log('🔍 Analyzing Token Structure...');
  
  try {
    const response = await makeRequest(`${API_BASE}/api/tokens/${TEST_TOKEN}`);
    
    if (response.status === 200) {
      const result = response.data;
      console.log('   Response structure:', Object.keys(result));
      
      if (result.token) {
        const token = result.token;
        console.log('   Token object keys (first 20):', Object.keys(token).slice(0, 20));
        console.log('   Token object keys (total):', Object.keys(token).length);
        
        // Check specific fields we need
        console.log('\n   Token Data Analysis:');
        console.log('     symbol:', token.symbol);
        console.log('     name:', token.name);
        console.log('     contractAddress:', token.contractAddress);
        console.log('     address:', token.address);
        console.log('     usdPrice:', token.usdPrice);
        console.log('     price:', token.price);
        console.log('     currentPrice:', token.currentPrice);
        
        // Check Jupiter data
        if (token.jupiterData) {
          console.log('     jupiterData keys:', Object.keys(token.jupiterData));
          console.log('     jupiterData.symbol:', token.jupiterData.symbol);
          console.log('     jupiterData.name:', token.jupiterData.name);
          console.log('     jupiterData.price:', token.jupiterData.price);
        } else {
          console.log('     jupiterData: NOT FOUND');
        }
        
        // Check holder data
        if (token.holderData) {
          console.log('     holderData keys:', Object.keys(token.holderData));
        } else {
          console.log('     holderData: NOT FOUND');
        }
        
        // Check Moralis analytics
        if (token.moralisAnalytics) {
          console.log('     moralisAnalytics keys:', Object.keys(token.moralisAnalytics));
        } else {
          console.log('     moralisAnalytics: NOT FOUND');
        }
        
        // Look for any price-related fields
        console.log('\n   Price-related fields:');
        Object.keys(token).forEach(key => {
          if (key.toLowerCase().includes('price') || key.toLowerCase().includes('usd')) {
            console.log(`     ${key}:`, token[key]);
          }
        });
        
        // Look for any symbol/name related fields
        console.log('\n   Symbol/Name-related fields:');
        Object.keys(token).forEach(key => {
          if (key.toLowerCase().includes('symbol') || key.toLowerCase().includes('name')) {
            console.log(`     ${key}:`, token[key]);
          }
        });
        
        return token;
      } else {
        console.log('❌ No token object in response');
        return null;
      }
    } else {
      console.log('❌ Request failed:', response.status, response.data);
      return null;
    }
  } catch (error) {
    console.log('❌ Request error:', error.message);
    return null;
  }
}

async function testHolderEndpointStructure() {
  console.log('\n🔍 Analyzing Holder Endpoint Structure...');
  
  try {
    const response = await makeRequest(`${API_BASE}/api/tokens/${TEST_TOKEN}/holders/insights`);
    
    if (response.status === 200) {
      const result = response.data;
      console.log('   Response structure:', Object.keys(result));
      
      if (result.data) {
        console.log('   Data keys:', Object.keys(result.data));
        
        // Check each data component
        if (result.data.holderStats) {
          console.log('   holderStats keys:', Object.keys(result.data.holderStats));
          console.log('   holderStats sample:', {
            totalHolders: result.data.holderStats.totalHolders,
            success: result.data.holderStats.success
          });
        }
        
        if (result.data.holderTimeseries) {
          console.log('   holderTimeseries keys:', Object.keys(result.data.holderTimeseries));
          if (result.data.holderTimeseries.holderFlowData) {
            console.log('   holderFlowData keys:', Object.keys(result.data.holderTimeseries.holderFlowData));
          }
        }
        
        if (result.data.topHolders) {
          console.log('   topHolders keys:', Object.keys(result.data.topHolders));
          console.log('   topHolders sample:', {
            success: result.data.topHolders.success,
            holdersCount: result.data.topHolders.holders?.length
          });
        }
        
        return result.data;
      } else {
        console.log('❌ No data object in holder response');
        return null;
      }
    } else {
      console.log('❌ Holder request failed:', response.status, response.data);
      return null;
    }
  } catch (error) {
    console.log('❌ Holder request error:', error.message);
    return null;
  }
}

async function testMoralisEndpointStructure() {
  console.log('\n🔍 Analyzing Moralis Endpoint Structure...');
  
  try {
    const response = await makeRequest(`${API_BASE}/api/tokens/${TEST_TOKEN}/analytics`);
    
    if (response.status === 200) {
      const result = response.data;
      console.log('   Response structure:', Object.keys(result));
      
      if (result.data) {
        console.log('   Data keys:', Object.keys(result.data));
        console.log('   Data sample:', result.data);
        return result.data;
      } else {
        console.log('❌ No data object in Moralis response');
        return null;
      }
    } else {
      console.log('❌ Moralis request failed:', response.status, response.data);
      return null;
    }
  } catch (error) {
    console.log('❌ Moralis request error:', error.message);
    return null;
  }
}

async function runStructureAnalysis() {
  console.log('🚀 Starting Token Structure Analysis\n');
  
  const tokenData = await analyzeTokenStructure();
  const holderData = await testHolderEndpointStructure();
  const moralisData = await testMoralisEndpointStructure();
  
  console.log('\n📊 Structure Analysis Summary:');
  console.log('===============================');
  
  if (tokenData) {
    console.log('✅ Token data structure identified');
    console.log('   Has basic token info:', !!(tokenData.symbol || tokenData.jupiterData?.symbol));
    console.log('   Has price info:', !!(tokenData.usdPrice || tokenData.price || tokenData.jupiterData?.price));
  }
  
  if (holderData) {
    console.log('✅ Holder data structure identified');
    console.log('   Has holder stats:', !!holderData.holderStats);
    console.log('   Has holder timeseries:', !!holderData.holderTimeseries);
    console.log('   Has top holders:', !!holderData.topHolders);
  }
  
  if (moralisData) {
    console.log('✅ Moralis data structure identified');
    console.log('   Has volume data:', !!(moralisData.totalBuyVolume || moralisData.totalSellVolume));
  }
  
  console.log('\n🎯 Next Steps:');
  console.log('1. Update frontend to access correct data paths');
  console.log('2. Update backend AI analysis to use correct data structure');
  console.log('3. Fix data integration in AI analysis endpoint');
}

// Run the structure analysis
runStructureAnalysis().catch(console.error);
