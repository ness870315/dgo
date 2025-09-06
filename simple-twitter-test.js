#!/usr/bin/env node

/**
 * Simple Twitter API Test
 * Quick test to check if Twitter search endpoint is working
 */

const https = require('https');

const BASE_URL = 'api.degen-oracle.com';
const PATH = '/api/twitter/search?q=bitcoin&count=2';

console.log('🧪 Testing Twitter Search API...');
console.log(`URL: https://${BASE_URL}${PATH}`);
console.log('─'.repeat(50));

const options = {
  hostname: BASE_URL,
  path: PATH,
  method: 'GET',
  headers: {
    'User-Agent': 'Mozilla/5.0 (compatible; TwitterTest/1.0)'
  }
};

const req = https.request(options, (res) => {
  console.log(`📊 Status: ${res.statusCode}`);
  console.log(`📝 Headers:`, res.headers);

  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    console.log('\n📄 Response Body:');
    try {
      const jsonData = JSON.parse(data);
      console.log(JSON.stringify(jsonData, null, 2));
    } catch (e) {
      console.log('Raw response:', data);
    }
  });
});

req.on('error', (err) => {
  console.error('❌ Request failed:', err.message);
});

req.setTimeout(10000, () => {
  console.error('⏰ Request timed out');
  req.destroy();
});

req.end();
