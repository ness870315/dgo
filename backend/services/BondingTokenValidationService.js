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
   * Validate tokens in batches using Jupiter API
   */
  async validateTokensBatch(tokenAddresses) {
    try {
      console.log(`[BondingValidation] 🔍 Validating ${tokenAddresses.length} tokens with Jupiter API`);
      
      const results = {
        valid: [],
        invalid: [],
        notFound: []
      };

      for (const address of tokenAddresses) {
        try {
          const url = `${this.jupiterApiUrl}?query=${address}`;
          const response = await fetch(url);
          
          if (!response.ok) {
            console.log(`[BondingValidation] ⚠️ HTTP ${response.status} for ${address}`);
            results.notFound.push(address);
            continue;
          }
          
          const data = await response.json();
          
          if (!Array.isArray(data) || data.length === 0) {
            console.log(`[BondingValidation] ❌ ${address}: Not found in Jupiter API`);
            results.notFound.push(address);
            continue;
          }
          
          const token = data.find(t => t.id === address);
          
          if (!token) {
            console.log(`[BondingValidation] ❌ ${address}: Not found in Jupiter API response`);
            results.notFound.push(address);
            continue;
          }
          
          const hasBondingCurve = token.bondingCurve !== undefined && token.bondingCurve !== null;
          
          if (hasBondingCurve) {
            console.log(`[BondingValidation] ✅ ${address}: HAS bondingCurve (${token.bondingCurve}) - KEEP`);
            results.valid.push({
              address,
              name: token.name,
              symbol: token.symbol,
              bondingCurve: token.bondingCurve,
              launchpad: token.launchpad
            });
          } else {
            console.log(`[BondingValidation] ❌ ${address}: NO bondingCurve - REMOVE`);
            results.invalid.push({
              address,
              name: token.name,
              symbol: token.symbol,
              graduatedPool: token.graduatedPool,
              graduatedAt: token.graduatedAt
            });
          }
          
          // Small delay between requests to respect rate limits
          await new Promise(resolve => setTimeout(resolve, this.requestDelay));
          
        } catch (error) {
          console.error(`[BondingValidation] ❌ Error validating ${address}:`, error.message);
          results.notFound.push(address);
        }
      }
      
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
      
      // Extract token addresses
      const tokenAddresses = tokens.map(token => token.contractAddress || token.tokenAddress);
      
      // Validate in batches
      const results = await this.validateTokensBatch(tokenAddresses);
      
      // Create address lookup for quick access
      const addressToToken = {};
      tokens.forEach(token => {
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
          // Update validation timestamp
          lastValidated: new Date().toISOString()
        };
      });
      
      // Get removed tokens for logging
      const removedTokens = results.invalid.map(result => ({
        address: result.address,
        name: result.name,
        symbol: result.symbol,
        graduatedPool: result.graduatedPool,
        graduatedAt: result.graduatedAt
      }));
      
      // Save updated tokens
      await this.saveBondingTokens(validTokens);
      
      // Log summary
      console.log('[BondingValidation] 📈 Validation Summary:');
      console.log(`  ✅ Valid (kept): ${results.valid.length}`);
      console.log(`  ❌ Invalid (removed): ${results.invalid.length}`);
      console.log(`  🔍 Not found: ${results.notFound.length}`);
      
      if (results.invalid.length > 0) {
        console.log('[BondingValidation] 🗑️ Removed tokens:');
        removedTokens.forEach(token => {
          console.log(`  - ${token.address}: ${token.name} (${token.symbol})`);
        });
      }
      
      return {
        processed: tokens.length,
        valid: results.valid.length,
        invalid: results.invalid.length,
        notFound: results.notFound.length,
        removed: removedTokens
      };
      
    } catch (error) {
      console.error('[BondingValidation] ❌ Validation failed:', error.message);
      throw error;
    }
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
