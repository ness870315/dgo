import fs from 'fs';
import path from 'path';

console.log('🔍 Testing cache file parsing...');
const cachePath = './cache/tokens-cache.json';
const metadataPath = './cache/cache-metadata.json';

console.log('📊 Cache file exists:', fs.existsSync(cachePath));
console.log('📊 Metadata file exists:', fs.existsSync(metadataPath));

if (fs.existsSync(cachePath) && fs.existsSync(metadataPath)) {
  try {
    console.log('📊 Reading cache file...');
    const cacheData = fs.readFileSync(cachePath, 'utf8');
    console.log('📊 Cache file length:', cacheData.length);
    console.log('📊 First 50 chars:', cacheData.substring(0, 50));
    console.log('📊 Last 50 chars:', cacheData.substring(cacheData.length - 50));
    
    console.log('📊 Parsing JSON...');
    const parsed = JSON.parse(cacheData);
    console.log('✅ SUCCESS: Parsed', parsed.tokens.length, 'tokens');
  } catch (error) {
    console.log('❌ ERROR:', error.message);
    console.log('❌ Position:', error.message.match(/position (\d+)/)?.[1] || 'unknown');
  }
} else {
  console.log('❌ Missing required files');
}
