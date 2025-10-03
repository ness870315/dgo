/**
 * Test script to check a token's Twitter handle data
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONTRACT_ADDRESS = '6MQpbiTC2YcogidTmKqMLK82qvE9z5QEm7EP3AEDpump';

async function checkTokenTwitterData() {
  try {
    // Read from cache
    const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');
    const cachePath = path.join(dataDir, 'cache', 'tokens-cache.json');
    
    console.log(`📁 Reading cache from: ${cachePath}\n`);
    
    const data = await fs.readFile(cachePath, 'utf8');
    const tokens = JSON.parse(data);
    
    const token = tokens.find(t => t.contractAddress === CONTRACT_ADDRESS);
    
    if (!token) {
      console.log('❌ Token not found in cache!');
      return;
    }
    
    console.log(`✅ Found token: ${token.symbol} (${token.name})`);
    console.log(`   Contract: ${CONTRACT_ADDRESS}\n`);
    
    console.log('🐦 Twitter Handle Sources:');
    console.log(`   token.socials?.twitter: ${token.socials?.twitter || 'NOT SET'}`);
    console.log(`   token.jupiterData?.twitter: ${token.jupiterData?.twitter || 'NOT SET'}`);
    console.log(`   token.twitterHandle: ${token.twitterHandle || 'NOT SET'}\n`);
    
    // Check which one would be used
    let twitterHandle = null;
    let source = null;
    
    if (token.socials?.twitter && token.socials.twitter !== 'not_found' && token.socials.twitter !== '') {
      twitterHandle = token.socials.twitter;
      source = 'token.socials.twitter';
    } else if (token.jupiterData?.twitter && token.jupiterData.twitter !== 'not_found' && token.jupiterData.twitter !== '') {
      twitterHandle = token.jupiterData.twitter;
      source = 'token.jupiterData.twitter';
    } else if (token.twitterHandle && token.twitterHandle !== 'not_found' && token.twitterHandle !== '') {
      twitterHandle = token.twitterHandle;
      source = 'token.twitterHandle';
    }
    
    if (twitterHandle) {
      console.log(`✅ Twitter handle FOUND: ${twitterHandle}`);
      console.log(`   Source: ${source}`);
      
      // Extract handle from URL if needed
      if (twitterHandle.includes('twitter.com/') || twitterHandle.includes('x.com/')) {
        const urlMatch = twitterHandle.match(/(?:twitter\.com|x\.com)\/([^/?#]+)/);
        if (urlMatch && urlMatch[1]) {
          const extractedHandle = urlMatch[1];
          console.log(`   Extracted from URL: @${extractedHandle}`);
        }
      } else {
        console.log(`   Normalized: ${twitterHandle.startsWith('@') ? twitterHandle : '@' + twitterHandle}`);
      }
    } else {
      console.log('❌ No Twitter handle found!');
      console.log('   This is why the handle was not included in the fuel post.');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkTokenTwitterData();

