import fs from 'fs';

const CACHE_FILE_PATH = './cache/tokens-cache.json';
const CACHE_METADATA_PATH = './cache/cache-metadata.json';

function loadCacheFromFile() {
  try {
    console.log('🔍 Testing cache loading...');
    
    console.log('📄 Checking if files exist:');
    console.log('  tokens-cache.json:', fs.existsSync(CACHE_FILE_PATH));
    console.log('  cache-metadata.json:', fs.existsSync(CACHE_METADATA_PATH));
    
    if (fs.existsSync(CACHE_FILE_PATH) && fs.existsSync(CACHE_METADATA_PATH)) {
      console.log('📖 Reading cache files...');
      
      const cacheData = JSON.parse(fs.readFileSync(CACHE_FILE_PATH, 'utf8'));
      const metadata = JSON.parse(fs.readFileSync(CACHE_METADATA_PATH, 'utf8'));
      
      console.log('📊 Cache data summary:');
      console.log('  Token count:', cacheData.tokens ? cacheData.tokens.length : 'undefined');
      console.log('  IsRealData:', cacheData.isRealData);
      console.log('  Timestamp:', cacheData.timestamp);
      
      // Check if cache is valid and contains real data
      if (cacheData.isRealData && cacheData.tokens && cacheData.tokens.length >= 50) {
        const ageMinutes = (Date.now() - cacheData.timestamp) / (1000 * 60);
        
        console.log('✅ Cache validation passed!');
        console.log('📅 Cache age:', ageMinutes.toFixed(1), 'minutes');
        console.log('📊 Last update:', metadata.lastUpdate);
        
        return {
          tokens: cacheData.tokens,
          timestamp: cacheData.timestamp,
          metadata: metadata
        };
      } else {
        console.log('❌ Cache validation failed:');
        console.log('  - isRealData:', cacheData.isRealData);
        console.log('  - hasTokens:', !!cacheData.tokens);
        console.log('  - tokenCount:', cacheData.tokens ? cacheData.tokens.length : 0);
        console.log('  - meetsThreshold:', cacheData.tokens && cacheData.tokens.length >= 50);
      }
    } else {
      console.log('❌ Cache files not found');
    }
  } catch (error) {
    console.error('❌ Error loading cache from file:', error.message);
  }
  
  return null;
}

// Test the function
const result = loadCacheFromFile();
console.log('🎯 Final result:', result ? `${result.tokens.length} tokens loaded` : 'No cache loaded');
