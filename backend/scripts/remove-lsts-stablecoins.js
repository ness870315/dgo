import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { isExcludedToken, getExclusionReason } from '../utils/excludedTokens.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function removeLSTsAndStablecoins() {
  const dataDir = process.env.DATA_DIR || '/var/data/dgo';
  const cachePath = path.join(dataDir, 'cache', 'tokens-cache.json');
  const backupPath = path.join(dataDir, 'cache', 'tokens-cache-backup.json');

  try {
    console.log('🧹 Starting cleanup of LSTs and Stablecoins...');
    
    // Read current cache
    console.log(`📂 Reading cache from: ${cachePath}`);
    const cacheData = await fs.readFile(cachePath, 'utf8');
    const tokens = JSON.parse(cacheData);
    
    console.log(`📊 Found ${tokens.length} tokens in cache`);
    
    // Create backup
    console.log(`💾 Creating backup: ${backupPath}`);
    await fs.writeFile(backupPath, cacheData, 'utf8');
    
    // Filter out LSTs and stablecoins using centralized exclusion list
    const tokensToRemove = [];
    const cleanedTokens = tokens.filter(token => {
      const address = (token.contractAddress || token.tokenAddress || '').trim();
      const symbol = (token.symbol || '').trim();
      const name = (token.name || '').trim();
      
      // Use centralized exclusion list
      if (isExcludedToken(token)) {
        const reason = getExclusionReason(token) || 'Excluded token';
        tokensToRemove.push({ symbol, name, address, reason });
        return false;
      }
      
      return true;
    });
    
    console.log(`\n🗑️  Found ${tokensToRemove.length} tokens to remove:`);
    tokensToRemove.forEach(token => {
      console.log(`   - ${token.symbol} (${token.address.substring(0, 8)}...): ${token.reason}`);
    });
    
    console.log(`\n✅ Remaining tokens: ${cleanedTokens.length} (removed ${tokens.length - cleanedTokens.length})`);
    
    // Write cleaned cache
    console.log(`\n💾 Writing cleaned cache...`);
    await fs.writeFile(cachePath, JSON.stringify(cleanedTokens, null, 2), 'utf8');
    
    console.log(`\n✅ Cleanup complete! Removed ${tokens.length - cleanedTokens.length} tokens.`);
    console.log(`📋 Backup saved to: ${backupPath}`);
    
    return {
      total: tokens.length,
      removed: tokensToRemove.length,
      remaining: cleanedTokens.length,
      removedTokens: tokensToRemove
    };
    
  } catch (error) {
    console.error('❌ Error during cleanup:', error.message);
    console.error(error.stack);
    throw error;
  }
}

// Run if executed directly (via node)
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  removeLSTsAndStablecoins()
    .then(result => {
      console.log('\n📊 Summary:');
      console.log(`   Total tokens: ${result.total}`);
      console.log(`   Removed: ${result.removed}`);
      console.log(`   Remaining: ${result.remaining}`);
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Script failed:', error);
      process.exit(1);
    });
}

export default removeLSTsAndStablecoins;
