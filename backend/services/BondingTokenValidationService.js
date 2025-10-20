import fs from 'fs/promises';
import path from 'path';

/**
 * Bonding Token Validation Service
 * Validates pre-bonding tokens using Jupiter API to check if they still have bondingCurve
 */
class BondingTokenValidationService {
  constructor() {
    this.cachePath = '/var/data/PreBonded-BackendCache.json';
    this.jupiterApiUrl = 'https://lite-api.jup.ag/tokens/v2/search';
    this.batchSize = 100; // Jupiter API limit
    this.requestDelay = 100; // ms between requests
  }

  /**
   * Load bonding tokens from backend cache
   */
  async loadBondingTokens() {
    try {
      const data = await fs.readFile(this.cachePath, 'utf8');
      const cache = JSON.parse(data);
      return cache.tokens || [];
    } catch (error) {
      console.error('[BondingValidation] ❌ Failed to load bonding tokens:', error.message);
      return [];
    }
  }

  /**
   * Save bonding tokens to backend cache
   */
  async saveBondingTokens(tokens) {
    try {
      const cache = {
        tokens,
        lastUpdated: new Date().toISOString(),
        totalTokens: tokens.length
      };
      
      await fs.writeFile(this.cachePath, JSON.stringify(cache, null, 2));
      console.log(`[BondingValidation] ✅ Saved ${tokens.length} tokens to backend cache`);
    } catch (error) {
      console.error('[BondingValidation] ❌ Failed to save bonding tokens:', error.message);
      throw error;
    }
  }

  /**
   * Validate tokens in batches using Jupiter API (comma-separated, up to 100)
   */
  async validateTokensBatch(tokenAddresses) {
    try {
      console.log(`[BondingValidation] 🔍 Validating ${tokenAddresses.length} tokens with Jupiter API (batch mode)`);
      
      const results = {
        valid: [],
        invalid: [],
        notFound: []
      };

      // Process in batches of 100 (Jupiter API limit)
      for (let i = 0; i < tokenAddresses.length; i += this.batchSize) {
        const batch = tokenAddresses.slice(i, i + this.batchSize);
        const batchNumber = Math.floor(i / this.batchSize) + 1;
        const totalBatches = Math.ceil(tokenAddresses.length / this.batchSize);
        
        console.log(`[BondingValidation] 📦 Processing batch ${batchNumber}/${totalBatches} (${batch.length} tokens)`);
        
        try {
          // Create comma-separated query string
          const queryString = batch.join(',');
          const url = `${this.jupiterApiUrl}?query=${queryString}`;
          
          console.log(`[BondingValidation] 🔗 Batch API URL: ${url.substring(0, 100)}...`);
          
          const response = await fetch(url);
          
          if (!response.ok) {
            console.log(`[BondingValidation] ⚠️ HTTP ${response.status} for batch ${batchNumber}`);
            // Add all tokens in this batch to not found
            batch.forEach(address => results.notFound.push(address));
            continue;
          }
          
          const data = await response.json();
          
          if (!Array.isArray(data)) {
            console.log(`[BondingValidation] ❌ Invalid response format for batch ${batchNumber}`);
            batch.forEach(address => results.notFound.push(address));
            continue;
          }
          
          console.log(`[BondingValidation] ✅ Batch ${batchNumber}: Received ${data.length} tokens from Jupiter API`);
          
          // Process each token in the batch
          batch.forEach(address => {
            const token = data.find(t => t.id === address);
            
            if (!token) {
              console.log(`[BondingValidation] ❌ ${address}: Not found in Jupiter API response`);
              results.notFound.push(address);
              return;
            }
            
            const hasBondingCurve = token.bondingCurve !== undefined && token.bondingCurve !== null;
            const bondingCurveValue = parseFloat(token.bondingCurve) || 0;
            const isFullyGraduated = bondingCurveValue >= 100;
            
            if (hasBondingCurve && !isFullyGraduated) {
              console.log(`[BondingValidation] ✅ ${address}: HAS bondingCurve (${token.bondingCurve}) - KEEP`);
              results.valid.push({
                address,
                name: token.name,
                symbol: token.symbol,
                bondingCurve: token.bondingCurve,
                launchpad: token.launchpad,
                stats5m: token.stats5m || {},
                priceChange5m: token.stats5m?.priceChange || 0
              });
            } else if (isFullyGraduated) {
              console.log(`[BondingValidation] 🎓 ${address}: bondingCurve = ${token.bondingCurve} (100%) - MIGRATE`);
              results.invalid.push({
                address,
                name: token.name,
                symbol: token.symbol,
                bondingCurve: token.bondingCurve,
                graduatedPool: token.graduatedPool,
                graduatedAt: token.graduatedAt,
                migrationReason: 'bondingCurve_100_percent'
              });
            } else {
              console.log(`[BondingValidation] ❌ ${address}: NO bondingCurve - REMOVE`);
              results.invalid.push({
                address,
                name: token.name,
                symbol: token.symbol,
                graduatedPool: token.graduatedPool,
                graduatedAt: token.graduatedAt,
                migrationReason: 'no_bonding_curve'
              });
            }
          });
          
          // Small delay between batches to respect rate limits
          if (i + this.batchSize < tokenAddresses.length) {
            await new Promise(resolve => setTimeout(resolve, this.requestDelay));
          }
          
        } catch (error) {
          console.error(`[BondingValidation] ❌ Error processing batch ${batchNumber}:`, error.message);
          // Add all tokens in this batch to not found
          batch.forEach(address => results.notFound.push(address));
        }
      }
      
      console.log(`[BondingValidation] 📊 Batch validation completed: ${results.valid.length} valid, ${results.invalid.length} invalid, ${results.notFound.length} not found`);
      
      return results;
      
    } catch (error) {
      console.error('[BondingValidation] ❌ Batch validation failed:', error.message);
      throw error;
    }
  }

  /**
   * Run validation on all bonding tokens
   */
  async runValidation() {
    try {
      console.log('[BondingValidation] 🚀 Starting bonding token validation');
      
      // Load current bonding tokens
      const tokens = await this.loadBondingTokens();
      
      if (tokens.length === 0) {
        console.log('[BondingValidation] ℹ️ No bonding tokens to validate');
        return {
          processed: 0,
          valid: 0,
          invalid: 0,
          notFound: 0,
          removed: []
        };
      }
      
      console.log(`[BondingValidation] 📋 Found ${tokens.length} tokens to validate`);
      
      // Blocklist of tokens to exclude from validation and processing
      const BLOCKED_TOKENS = [
        'FQUViAMMM8zPM5dhiVKePBBA8ud29sP1gdyHdhXDpump'
      ];
      
      // Filter out blocked tokens
      const filteredTokens = tokens.filter(token => {
        const address = token.contractAddress || token.tokenAddress;
        const isBlocked = BLOCKED_TOKENS.includes(address);
        if (isBlocked) {
          console.log(`🚫 [BondingValidation] BLOCKED token excluded: ${token.symbol} (${address})`);
        }
        return !isBlocked;
      });
      
      console.log(`🔄 [BondingValidation] Filtered: ${tokens.length} → ${filteredTokens.length} tokens (${tokens.length - filteredTokens.length} blocked)`);
      
      // Extract token addresses from filtered tokens
      const tokenAddresses = filteredTokens.map(token => token.contractAddress || token.tokenAddress);
      
      // Validate in batches
      const results = await this.validateTokensBatch(tokenAddresses);
      
      // Create address lookup for quick access (using filtered tokens)
      const addressToToken = {};
      filteredTokens.forEach(token => {
        const address = token.contractAddress || token.tokenAddress;
        addressToToken[address] = token;
      });
      
      // Filter valid tokens
      const validTokens = results.valid.map(result => {
        const originalToken = addressToToken[result.address];
        return {
          ...originalToken,
          // Update bonding curve progress from Jupiter
          bondingCurveProgress: result.bondingCurve,
          // Update price change data from Jupiter
          priceChange5m: result.priceChange5m,
          stats5m: result.stats5m,
          // Update validation timestamp
          lastValidated: new Date().toISOString()
        };
      });
      
      // Separate tokens for migration vs removal
      const tokensToMigrate = results.invalid.filter(result => result.migrationReason === 'bondingCurve_100_percent');
      const tokensToRemove = results.invalid.filter(result => result.migrationReason === 'no_bonding_curve');
      
      // Get removed tokens for logging
      const removedTokens = tokensToRemove.map(result => ({
        address: result.address,
        name: result.name,
        symbol: result.symbol,
        graduatedPool: result.graduatedPool,
        graduatedAt: result.graduatedAt,
        reason: 'no_bonding_curve'
      }));
      
      // Get migrated tokens for logging
      const migratedTokens = tokensToMigrate.map(result => ({
        address: result.address,
        name: result.name,
        symbol: result.symbol,
        bondingCurve: result.bondingCurve,
        graduatedPool: result.graduatedPool,
        graduatedAt: result.graduatedAt,
        reason: 'bondingCurve_100_percent'
      }));
      
      // Migrate tokens with bondingCurve = 100 to main token cache
      if (tokensToMigrate.length > 0) {
        console.log(`[BondingValidation] 🎓 Migrating ${tokensToMigrate.length} graduated tokens to main cache...`);
        await this.migrateGraduatedTokens(tokensToMigrate);
      }
      
      // Save updated tokens (only valid ones remain)
      await this.saveBondingTokens(validTokens);
      
      // Log summary
      console.log('[BondingValidation] 📈 Validation Summary:');
      console.log(`  ✅ Valid (kept): ${results.valid.length}`);
      console.log(`  🎓 Migrated (bondingCurve=100): ${tokensToMigrate.length}`);
      console.log(`  ❌ Removed (no bonding curve): ${tokensToRemove.length}`);
      console.log(`  🔍 Not found: ${results.notFound.length}`);
      
      if (tokensToMigrate.length > 0) {
        console.log('[BondingValidation] 🎓 Migrated tokens:');
        migratedTokens.forEach(token => {
          console.log(`  - ${token.address}: ${token.name} (${token.symbol}) - bondingCurve: ${token.bondingCurve}`);
        });
      }
      
      if (tokensToRemove.length > 0) {
        console.log('[BondingValidation] 🗑️ Removed tokens:');
        removedTokens.forEach(token => {
          console.log(`  - ${token.address}: ${token.name} (${token.symbol})`);
        });
      }
      
      return {
        processed: tokens.length,
        valid: results.valid.length,
        migrated: tokensToMigrate.length,
        invalid: tokensToRemove.length,
        notFound: results.notFound.length,
        migratedTokens: migratedTokens,
        removed: removedTokens
      };
      
    } catch (error) {
      console.error('[BondingValidation] ❌ Validation failed:', error.message);
      throw error;
    }
  }

  /**
   * Migrate graduated tokens to main token cache
   */
  async migrateGraduatedTokens(graduatedTokens) {
    try {
      console.log(`[BondingValidation] 🎓 Migrating ${graduatedTokens.length} graduated tokens to main cache...`);
      
      // Read main token cache
      const mainCachePath = '/var/data/dgo/cache/tokens-cache.json';
      let mainTokens = [];
      
      try {
        const mainCacheData = await fs.readFile(mainCachePath, 'utf8');
        mainTokens = JSON.parse(mainCacheData);
        if (!Array.isArray(mainTokens)) {
          mainTokens = [];
        }
      } catch (error) {
        console.log('[BondingValidation] ⚠️ Main cache not found, creating new cache');
        mainTokens = [];
      }
      
      // Transform graduated tokens to main token format
      const migratedTokens = graduatedTokens.map(result => {
        const originalToken = this.findOriginalToken(result.address);
        
        return {
          symbol: result.symbol || originalToken?.symbol || 'UNKNOWN',
          name: result.name || originalToken?.name || 'Unknown Token',
          contractAddress: result.address,
          source: 'jupiter',
          stage: 'jupiter',
          createdAt: new Date().toISOString(),
          lastDiscoveredAt: new Date().toISOString(),
          discoveredVia: [{ source: 'bonding-validation', category: 'graduated', interval: 'validation', at: new Date().toISOString() }],
          hasJupiterData: true,
          jupiterData: {
            price: originalToken?.priceUsd || 0,
            mcap: originalToken?.fullyDilutedValuation || 0,
            liquidity: originalToken?.liquidity || 0,
            holders: originalToken?.holders || 0,
            graduatedAt: result.graduatedAt,
            graduatedPool: result.graduatedPool,
            bondingCurve: result.bondingCurve,
            launchpad: 'pump.fun',
            updatedAt: new Date().toISOString(),
            sourceCategory: 'graduated',
            sourceInterval: 'validation'
          },
          // Add graduation metadata
          graduationDate: new Date().toISOString(),
          migratedFrom: 'bonding-validation',
          originalProgress: result.bondingCurve,
          // Add mock data for compatibility
          score: 8.5, // High score for graduated tokens
          marketCap: originalToken?.fullyDilutedValuation || 0,
          volume24h: originalToken?.liquidity || 0,
          priceChange24h: 0,
          twitter: null,
          website: null,
          telegram: null,
          discord: null
        };
      });
      
      // Add migrated tokens to main cache
      const updatedMainTokens = [...mainTokens, ...migratedTokens];
      
      // Save updated main cache
      await fs.writeFile(mainCachePath, JSON.stringify(updatedMainTokens, null, 2));
      
      console.log(`[BondingValidation] ✅ Successfully migrated ${migratedTokens.length} tokens to main cache`);
      
      return migratedTokens;
      
    } catch (error) {
      console.error('[BondingValidation] ❌ Migration failed:', error.message);
      throw error;
    }
  }

  /**
   * Find original token data by address
   */
  findOriginalToken(address) {
    // This would need to be implemented to find the original token data
    // For now, return null - the migration will use Jupiter API data
    return null;
  }

  /**
   * Get validation statistics
   */
  async getValidationStats() {
    try {
      const tokens = await this.loadBondingTokens();
      
      const stats = {
        totalTokens: tokens.length,
        lastValidated: null,
        validationHistory: []
      };
      
      if (tokens.length > 0) {
        const lastValidatedTokens = tokens.filter(t => t.lastValidated);
        if (lastValidatedTokens.length > 0) {
          stats.lastValidated = lastValidatedTokens[0].lastValidated;
        }
      }
      
      return stats;
      
    } catch (error) {
      console.error('[BondingValidation] ❌ Failed to get stats:', error.message);
      return null;
    }
  }
}

export default BondingTokenValidationService;
