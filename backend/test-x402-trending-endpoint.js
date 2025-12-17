/**
 * Test x402 Trending AI Analysis Endpoint
 * Tests the 402 response format and structure
 */

import fetch from 'node-fetch';

const API_BASE = process.env.API_BASE || 'https://api.degen-oracle.com';
const ENDPOINT = `${API_BASE}/api/tokens/trending/ai-analysis`;

async function testX402Endpoint() {
  console.log('🧪 Testing x402 Trending AI Analysis Endpoint\n');
  console.log('='.repeat(80));
  
  try {
    // Test 1: Request without X-PAYMENT header (should get 402)
    console.log('\n📋 TEST 1: Request without payment (should get 402)\n');
    console.log(`GET ${ENDPOINT}\n`);
    
    const response = await fetch(ENDPOINT, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log(`Status: ${response.status}`);
    console.log(`Content-Type: ${response.headers.get('content-type')}`);
    
    if (response.status === 402) {
      console.log('✅ Got 402 Payment Required (expected)\n');
      
      const data = await response.json();
      console.log('Response structure:');
      console.log(JSON.stringify(data, null, 2));
      
      // Validate response structure
      console.log('\n🔍 Validating response structure...\n');
      
      const errors = [];
      
      if (!data.x402Version) {
        errors.push('❌ Missing x402Version');
      } else {
        console.log(`✅ x402Version: ${data.x402Version}`);
      }
      
      if (!data.accepts || !Array.isArray(data.accepts)) {
        errors.push('❌ Missing or invalid accepts array');
      } else {
        console.log(`✅ accepts array: ${data.accepts.length} item(s)`);
        
        if (data.accepts.length > 0) {
          const accept = data.accepts[0];
          
          const requiredFields = [
            'scheme', 'network', 'maxAmountRequired', 'resource', 
            'description', 'mimeType', 'payTo', 'maxTimeoutSeconds', 'asset'
          ];
          
          requiredFields.forEach(field => {
            if (!accept[field]) {
              errors.push(`❌ Missing required field: ${field}`);
            } else {
              console.log(`✅ ${field}: ${accept[field]}`);
            }
          });
          
          if (accept.outputSchema) {
            console.log('✅ outputSchema: present');
          } else {
            errors.push('❌ Missing outputSchema');
          }
        } else {
          errors.push('❌ accepts array is empty');
        }
      }
      
      if (errors.length > 0) {
        console.log('\n❌ Validation errors:');
        errors.forEach(err => console.log(`  ${err}`));
        process.exit(1);
      } else {
        console.log('\n✅ All validations passed!');
      }
      
    } else {
      console.log(`❌ Expected 402, got ${response.status}`);
      const text = await response.text();
      console.log(`Response: ${text.substring(0, 500)}`);
      process.exit(1);
    }
    
    // Test 2: Request with format parameter
    console.log('\n' + '='.repeat(80));
    console.log('\n📋 TEST 2: Request with format=text parameter\n');
    console.log(`GET ${ENDPOINT}?format=text\n`);
    
    const response2 = await fetch(`${ENDPOINT}?format=text`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log(`Status: ${response2.status}`);
    
    if (response2.status === 402) {
      const data2 = await response2.json();
      if (data2.accepts && data2.accepts[0]) {
        const resource = data2.accepts[0].resource;
        if (resource.includes('format=text')) {
          console.log('✅ Resource URL includes format=text parameter');
        } else {
          console.log('❌ Resource URL missing format=text parameter');
          process.exit(1);
        }
      }
    } else {
      console.log(`❌ Expected 402, got ${response2.status}`);
      process.exit(1);
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('\n✅ All tests passed!\n');
    
  } catch (error) {
    console.error('\n❌ Test failed with error:');
    console.error(error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run tests
testX402Endpoint();

