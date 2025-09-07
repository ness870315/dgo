import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class TokenCleanupService {
  constructor() {
    this.cacheDir = path.join(__dirname, 'cache');
    this.tokensCachePath = path.join(this.cacheDir, 'tokens-cache.json');
    this.backupPath = path.join(this.cacheDir, `tokens-cache-backup-${Date.now()}.json`);
    
    // Source priority for conflict resolution (higher number = higher priority)
    this.sourcePriority = {
      'jupiter': 4,      // Highest priority - most complete data
      'dexscreener': 3,  // High priority - has contract addresses
      'birdeye': 2,      // Medium priority
      'coingecko': 1     // Lowest priority - often missing contracts
    };
  }

  async loadTokens() {
    try {
      const data = await fs.readFile(this.tokensCachePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('❌ Error loading tokens cache:', error);
      return [];
    }
  }

  async saveTokens(tokens) {
    try {
      await fs.writeFile(this.tokensCachePath, JSON.stringify(tokens, null, 2));
      console.log(`✅ Saved ${tokens.length} tokens to cache`);
    } catch (error) {
      console.error('❌ Error saving tokens cache:', error);
    }
  }

  async createBackup(tokens) {
    try {
      await fs.writeFile(this.backupPath, JSON.stringify(tokens, null, 2));
      console.log(`💾 Created backup at: ${this.backupPath}`);
    } catch (error) {
      console.error('❌ Error creating backup:', error);
    }
  }

  isValidContract(contractAddress) {
    return contractAddress && 
           contractAddress !== null && 
           contractAddress !== 'null' && 
           typeof contractAddress === 'string' && 
           contractAddress.length > 10;
  }

  analyzeTokens(tokens) {
    const stats = {
      total: tokens.length,
      withValidContract: 0,
      withoutContract: 0,
      nullContract: 0,
      duplicatesByContract: 0,
      duplicatesBySymbol: 0,
      sources: {}
    };

    const contractMap = new Map();
    const symbolMap = new Map();

    for (const token of tokens) {
      // Source statistics
      const source = token.source || 'unknown';
      stats.sources[source] = (stats.sources[source] || 0) + 1;

      // Contract analysis
      if (this.isValidContract(token.contractAddress)) {
        stats.withValidContract++;
        
        // Check for contract duplicates
        const contractKey = token.contractAddress.toLowerCase();
        if (contractMap.has(contractKey)) {
          stats.duplicatesByContract++;
        } else {
          contractMap.set(contractKey, token);
        }
      } else {
        if (token.contractAddress === null) {
          stats.nullContract++;
        }
        stats.withoutContract++;

        // Check for symbol duplicates (only for tokens without contracts)
        const symbolKey = token.symbol?.toUpperCase();
        if (symbolKey) {
          if (symbolMap.has(symbolKey)) {
            stats.duplicatesBySymbol++;
          } else {
            symbolMap.set(symbolKey, token);
          }
        }
      }
    }

    return stats;
  }

  deduplicateTokens(tokens) {
    console.log('\n🔍 Starting enhanced deduplication...');
    
    const seen = new Set();
    const firstByContract = new Map();
    const firstBySymbol = new Map();
    const uniqueTokens = [];
    const removed = [];

    for (const token of tokens) {
      const contractKey = token.contractAddress?.toLowerCase();
      const symbolKey = token.symbol?.toUpperCase();
      const hasValidContract = this.isValidContract(token.contractAddress);
      
      let isDuplicate = false;
      let duplicateReason = '';
      let shouldKeep = true;
      
      if (hasValidContract) {
        // Primary deduplication by contract address
        if (seen.has(`contract:${contractKey}`)) {
          const existingToken = firstByContract.get(contractKey);
          const currentPriority = this.sourcePriority[token.source] || 0;
          const existingPriority = this.sourcePriority[existingToken?.source] || 0;
          
          if (currentPriority > existingPriority) {
            // Replace existing token with higher priority one
            console.log(`🔄 Replacing lower priority token: ${existingToken?.symbol} (${existingToken?.source}) -> ${token.symbol} (${token.source})`);
            const existingIndex = uniqueTokens.findIndex(t => 
              t.contractAddress?.toLowerCase() === contractKey
            );
            if (existingIndex >= 0) {
              removed.push(uniqueTokens[existingIndex]);
              uniqueTokens[existingIndex] = token;
              firstByContract.set(contractKey, token);
            }
            shouldKeep = false;
          } else {
            isDuplicate = true;
            duplicateReason = `contract address (kept higher priority: ${existingToken?.source})`;
            shouldKeep = false;
          }
        } else {
          // New contract address
          seen.add(`contract:${contractKey}`);
          firstByContract.set(contractKey, token);
        }
      } else if (symbolKey) {
        // Fallback deduplication by symbol for tokens without valid contract addresses
        if (seen.has(`symbol:${symbolKey}`)) {
          const existingToken = firstBySymbol.get(symbolKey);
          const existingHasContract = this.isValidContract(existingToken?.contractAddress);
          
          if (existingHasContract) {
            // Always prefer token with contract address
            isDuplicate = true;
            duplicateReason = `symbol (kept version with contract address)`;
            shouldKeep = false;
          } else {
            // Both tokens lack contract addresses, use source priority
            const currentPriority = this.sourcePriority[token.source] || 0;
            const existingPriority = this.sourcePriority[existingToken?.source] || 0;
            
            if (currentPriority > existingPriority) {
              console.log(`🔄 Replacing lower priority token without contract: ${existingToken?.symbol} (${existingToken?.source}) -> ${token.symbol} (${token.source})`);
              const existingIndex = uniqueTokens.findIndex(t => 
                t.symbol?.toUpperCase() === symbolKey && 
                !this.isValidContract(t.contractAddress)
              );
              if (existingIndex >= 0) {
                removed.push(uniqueTokens[existingIndex]);
                uniqueTokens[existingIndex] = token;
                firstBySymbol.set(symbolKey, token);
              }
              shouldKeep = false;
            } else {
              isDuplicate = true;
              duplicateReason = `symbol without contract (kept higher priority: ${existingToken?.source})`;
              shouldKeep = false;
            }
          }
        } else {
          // New symbol without contract
          seen.add(`symbol:${symbolKey}`);
          firstBySymbol.set(symbolKey, token);
        }
      } else {
        // Token has neither valid contract nor symbol - remove it
        console.log(`⚠️ Removing token without valid contract or symbol: ${JSON.stringify({name: token.name, symbol: token.symbol, contract: token.contractAddress})}`);
        shouldKeep = false;
        duplicateReason = 'no valid contract or symbol';
      }
      
      if (shouldKeep && !isDuplicate) {
        uniqueTokens.push(token);
      } else {
        removed.push(token);
        if (isDuplicate) {
          console.log(`🔄 Removed duplicate by ${duplicateReason}: ${token.symbol} (${token.contractAddress || 'no contract'}) from ${token.source}`);
        }
      }
    }
    
    return { uniqueTokens, removed };
  }

  async cleanupTokens() {
    console.log('🚀 Starting Token Cleanup Process...\n');

    // Load current tokens
    const tokens = await this.loadTokens();
    if (tokens.length === 0) {
      console.log('❌ No tokens found in cache');
      return;
    }

    console.log(`📊 Loaded ${tokens.length} tokens from cache`);

    // Create backup
    await this.createBackup(tokens);

    // Analyze current state
    console.log('\n📈 Analyzing current token state...');
    const beforeStats = this.analyzeTokens(tokens);
    console.log('📊 Before cleanup statistics:');
    console.log(`   Total tokens: ${beforeStats.total}`);
    console.log(`   With valid contracts: ${beforeStats.withValidContract}`);
    console.log(`   Without contracts: ${beforeStats.withoutContract}`);
    console.log(`   Null contracts: ${beforeStats.nullContract}`);
    console.log(`   Potential contract duplicates: ${beforeStats.duplicatesByContract}`);
    console.log(`   Potential symbol duplicates: ${beforeStats.duplicatesBySymbol}`);
    console.log('   Sources:', beforeStats.sources);

    // Perform deduplication and cleanup
    const { uniqueTokens, removed } = this.deduplicateTokens(tokens);

    // Analyze after cleanup
    console.log('\n📈 Analyzing cleaned token state...');
    const afterStats = this.analyzeTokens(uniqueTokens);
    console.log('📊 After cleanup statistics:');
    console.log(`   Total tokens: ${afterStats.total}`);
    console.log(`   With valid contracts: ${afterStats.withValidContract}`);
    console.log(`   Without contracts: ${afterStats.withoutContract}`);
    console.log(`   Null contracts: ${afterStats.nullContract}`);
    console.log('   Sources:', afterStats.sources);

    // Show cleanup results
    console.log('\n🧹 Cleanup Results:');
    console.log(`   Tokens removed: ${removed.length}`);
    console.log(`   Tokens kept: ${uniqueTokens.length}`);
    console.log(`   Space saved: ${((removed.length / tokens.length) * 100).toFixed(1)}%`);

    // Show examples of removed tokens
    if (removed.length > 0) {
      console.log('\n🗑️ Examples of removed tokens:');
      removed.slice(0, 10).forEach((token, i) => {
        console.log(`   ${i + 1}. ${token.symbol} (${token.name}) - ${token.contractAddress || 'no contract'} - source: ${token.source}`);
      });
      if (removed.length > 10) {
        console.log(`   ... and ${removed.length - 10} more`);
      }
    }

    // Save cleaned tokens
    await this.saveTokens(uniqueTokens);

    console.log('\n✅ Token cleanup completed successfully!');
    console.log(`💾 Backup saved to: ${this.backupPath}`);
    console.log(`📁 Cleaned cache saved to: ${this.tokensCachePath}`);

    return {
      before: beforeStats,
      after: afterStats,
      removed: removed.length,
      kept: uniqueTokens.length
    };
  }
}

// Main execution
async function main() {
  try {
    const cleanupService = new TokenCleanupService();
    const results = await cleanupService.cleanupTokens();
    
    console.log('\n🎉 Cleanup process completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Cleanup process failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default TokenCleanupService;
