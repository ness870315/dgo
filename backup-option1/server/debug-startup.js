import fs from 'fs';

console.log('🔍 Debugging startup sequence...');

// Simulate the exact startup logic
const CACHE_FILE_PATH = './cache/tokens-cache.json';
const CACHE_METADATA_PATH = './cache/cache-metadata.json';
let cachedTokens = [];

console.log('🔍 Checking for persistent cache...');

function loadCacheFromFile() {
  try {
    if (fs.existsSync(CACHE_FILE_PATH) && fs.existsSync(CACHE_METADATA_PATH)) {
      const cacheData = JSON.parse(fs.readFileSync(CACHE_FILE_PATH, 'utf8'));
      const metadata = JSON.parse(fs.readFileSync(CACHE_METADATA_PATH, 'utf8'));
      
      // Check if cache is valid and contains real data
      if (cacheData.isRealData && cacheData.tokens && cacheData.tokens.length >= 50) {
        const ageMinutes = (Date.now() - cacheData.timestamp) / (1000 * 60);
        
        console.log(`💾 Found persistent cache: ${cacheData.tokens.length} tokens`);
        console.log(`📅 Cache age: ${ageMinutes.toFixed(1)} minutes`);
        console.log(`📊 Last update: ${metadata.lastUpdate}`);
        
        return {
          tokens: cacheData.tokens,
          timestamp: cacheData.timestamp,
          metadata: metadata
        };
      } else {
        console.log('❌ Cache validation failed');
      }
    } else {
      console.log('❌ Cache files not found');
    }
  } catch (error) {
    console.error('❌ Error loading cache from file:', error.message);
  }
  
  return null;
}

const persistentCache = loadCacheFromFile();

if (persistentCache && persistentCache.tokens.length > 0) {
  cachedTokens = persistentCache.tokens;
  console.log(`✅ Loaded ${cachedTokens.length} tokens from persistent cache`);
} else {
  console.log('❌ No cache loaded');
}

console.log('📊 Final cachedTokens length:', cachedTokens.length);

// Test the TEST_MODE logic
if (process.env.TEST_MODE === 'true') {
  console.log('⚡ TEST MODE activated');
  
  if (cachedTokens.length === 0) {
    console.log('🎨 Would create sample tokens (cache is empty)');
  } else {
    console.log(`🛡️ PROTECTED: Using ${cachedTokens.length} real tokens from persistent cache in test mode`);
    console.log('💡 Real data is preserved - test mode will not override it');
  }
} else {
  console.log('🚀 Production mode');
}
