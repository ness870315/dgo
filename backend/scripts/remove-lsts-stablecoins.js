import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Known LST (Liquid Staking Token) addresses
const LST_ADDRESSES = new Set([
  'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So', // mSOL (Marinade Staked SOL)
  '7Q2afV64in6N6SeYsVqLVDGk9ub1xXd4fG6usKpdZ9BY', // bSOL (BlazeStake)
  'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn', // jitoSOL
  'bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HPvpi2F', // bSOL (alternative)
  '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs', // ETH (Wormhole)
  'So11111111111111111111111111111111111111112', // SOL (native)
]);

// LST symbols/names to match
const LST_PATTERNS = [
  /^m?sol$/i,
  /^bsol$/i,
  /^jitosol$/i,
  /^staked\s*sol/i,
  /^liquid\s*stake/i,
  /^marinade/i,
  /^blazestake/i,
];

// Known Stablecoin addresses
const STABLECOIN_ADDRESSES = new Set([
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
  'EchesyfXePKdLdxi9dsAIsARcSdskBVqJj8ny8FxSyaT', // DAI (Solana)
  '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R', // RAY (Raydium - sometimes mistaken)
  'A9mUU4qviSctJVPJdBJWkb28deg915LYJKrzQ19ji3FM', // USTC (Terra Classic)
  'CASHVDm2wsJXfhj6VWxb7YiM94Y36Z3m8MywcnGhQbvZ', // CASH
  'UST98SepV2cFwEFN1b3xSqHrJqK3mZdXNFBUg1nTTvx', // UST
]);

// Stablecoin symbols/names to match
const STABLECOIN_PATTERNS = [
  /^usdc?$/i,
  /^usdt$/i,
  /^dai$/i,
  /^ust$/i,
  /^usd\s*coin/i,
  /^tether/i,
  /^terra\s*usd/i,
  /^stablecoin/i,
  /^usd\s*stable/i,
];

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
    
    // Filter out LSTs and stablecoins
    const tokensToRemove = [];
    const cleanedTokens = tokens.filter(token => {
      const address = (token.contractAddress || token.tokenAddress || '').trim();
      const symbol = (token.symbol || '').trim();
      const name = (token.name || '').trim();
      
      // Check if it's a known LST address
      if (LST_ADDRESSES.has(address)) {
        tokensToRemove.push({ symbol, name, address, reason: 'LST address' });
        return false;
      }
      
      // Check if symbol/name matches LST patterns
      if (LST_PATTERNS.some(pattern => pattern.test(symbol) || pattern.test(name))) {
        tokensToRemove.push({ symbol, name, address, reason: 'LST pattern match' });
        return false;
      }
      
      // Check if it's a known stablecoin address
      if (STABLECOIN_ADDRESSES.has(address)) {
        tokensToRemove.push({ symbol, name, address, reason: 'Stablecoin address' });
        return false;
      }
      
      // Check if symbol/name matches stablecoin patterns
      if (STABLECOIN_PATTERNS.some(pattern => pattern.test(symbol) || pattern.test(name))) {
        tokensToRemove.push({ symbol, name, address, reason: 'Stablecoin pattern match' });
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
