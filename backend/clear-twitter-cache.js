import fs from 'fs/promises';
import path from 'path';

async function clearTwitterCache() {
  try {
    const cacheDir = './cache';

    // Check if cache directory exists
    try {
      await fs.access(cacheDir);
    } catch {
      console.log('📁 Cache directory does not exist');
      return;
    }

    const cacheFiles = [
      path.join(cacheDir, 'tokens-cache.json'),
      path.join(cacheDir, 'twitter_metrics.json')
    ];

    for (const cacheFile of cacheFiles) {
      try {
        await fs.access(cacheFile);
        await fs.unlink(cacheFile);
        console.log(`✅ Deleted cache file: ${cacheFile}`);
      } catch {
        console.log(`⚠️ Cache file not found: ${cacheFile}`);
      }
    }

    console.log('🧹 Twitter cache cleared successfully!');
    console.log('🔄 Backend will now fetch fresh Twitter data on next request');

  } catch (error) {
    console.error('❌ Error clearing cache:', error.message);
  }
}

clearTwitterCache();



