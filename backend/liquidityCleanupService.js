/**
 * 🧹 Liquidity Cleanup Service
 * Removes tokens with extremely low liquidity from the database
 */

import fs from 'fs/promises';
import path from 'path';

class LiquidityCleanupService {
  constructor() {
    this.cachePath = path.join(process.cwd(), 'cache', 'tokens-cache.json');
    this.backupPath = path.join(process.cwd(), 'cache', 'tokens-backup-before-cleanup.json');
    
    // Cleanup thresholds
    this.config = {
      minLiquidity: 1000,        // $1,000 minimum liquidity
      minMarketCap: 5000,        // $5,000 minimum market cap
      maxLiquidityDrop: -95,     // -95% liquidity drop = delete
      minHolders: 5,             // Minimum 5 holders
      dryRun: false              // Set to true for testing
    };
  }

  /**
   * 🧹 Main cleanup function
   */
  async cleanupLowLiquidityTokens() {
    try {
      console.log('🧹 Starting liquidity-based token cleanup...');
      
      // Load current tokens
      const tokens = await this.loadTokens();
      if (!tokens || tokens.length === 0) {
        console.log('⚠️ No tokens found to clean up');
        return { removed: 0, remaining: 0 };
      }

      console.log(`📊 Analyzing ${tokens.length} tokens for cleanup...`);

      // Create backup before cleanup
      await this.createBackup(tokens);

      // Analyze tokens for removal
      const analysis = this.analyzeTokensForRemoval(tokens);
      
      console.log('📋 CLEANUP ANALYSIS:');
      console.log(`  💧 Low liquidity (< $${this.config.minLiquidity}): ${analysis.lowLiquidity.length}`);
      console.log(`  📉 Low market cap (< $${this.config.minMarketCap}): ${analysis.lowMarketCap.length}`);
      console.log(`  🚨 Liquidity crash (< ${this.config.maxLiquidityDrop}%): ${analysis.liquidityCrash.length}`);
      console.log(`  👥 Low holders (< ${this.config.minHolders}): ${analysis.lowHolders.length}`);
      console.log(`  🗑️ Total for removal: ${analysis.toRemove.length}`);

      if (analysis.toRemove.length === 0) {
        console.log('✅ No tokens need cleanup');
        return { removed: 0, remaining: tokens.length };
      }

      // Show examples of tokens to be removed
      this.showRemovalExamples(analysis.toRemove);

      if (this.config.dryRun) {
        console.log('🔍 DRY RUN: No tokens actually removed');
        return { removed: 0, remaining: tokens.length, wouldRemove: analysis.toRemove.length };
      }

      // Remove tokens
      const cleanTokens = tokens.filter(token => 
        !analysis.toRemove.some(removeToken => 
          removeToken.contractAddress === token.contractAddress
        )
      );

      // Save cleaned tokens
      await this.saveTokens(cleanTokens);

      console.log(`✅ Cleanup complete!`);
      console.log(`  🗑️ Removed: ${analysis.toRemove.length} tokens`);
      console.log(`  ✅ Remaining: ${cleanTokens.length} tokens`);
      console.log(`  💾 Backup saved to: tokens-backup-before-cleanup.json`);

      return {
        removed: analysis.toRemove.length,
        remaining: cleanTokens.length,
        removedTokens: analysis.toRemove.map(t => ({
          symbol: t.symbol,
          liquidity: t.liquidity,
          marketCap: t.marketCap,
          reason: t.removalReason
        }))
      };

    } catch (error) {
      console.error('❌ Cleanup failed:', error.message);
      throw error;
    }
  }

  /**
   * 📊 Analyze tokens and determine which should be removed
   */
  analyzeTokensForRemoval(tokens) {
    const lowLiquidity = [];
    const lowMarketCap = [];
    const liquidityCrash = [];
    const lowHolders = [];
    const toRemove = [];

    for (const token of tokens) {
      const liquidity = this.extractLiquidity(token);
      const marketCap = this.extractMarketCap(token);
      const liquidityChange = this.extractLiquidityChange(token);
      const holders = this.extractHolders(token);

      let shouldRemove = false;
      let reasons = [];

      // Check liquidity
      if (liquidity < this.config.minLiquidity) {
        lowLiquidity.push(token);
        shouldRemove = true;
        reasons.push(`Low liquidity ($${liquidity.toFixed(0)})`);
      }

      // Check market cap
      if (marketCap < this.config.minMarketCap) {
        lowMarketCap.push(token);
        shouldRemove = true;
        reasons.push(`Low market cap ($${marketCap.toFixed(0)})`);
      }

      // Check liquidity crash
      if (liquidityChange < this.config.maxLiquidityDrop) {
        liquidityCrash.push(token);
        shouldRemove = true;
        reasons.push(`Liquidity crash (${liquidityChange.toFixed(1)}%)`);
      }

      // Check holders
      if (holders < this.config.minHolders) {
        lowHolders.push(token);
        shouldRemove = true;
        reasons.push(`Low holders (${holders})`);
      }

      if (shouldRemove) {
        toRemove.push({
          ...token,
          removalReason: reasons.join(', '),
          liquidity,
          marketCap,
          liquidityChange,
          holders
        });
      }
    }

    return {
      lowLiquidity,
      lowMarketCap,
      liquidityCrash,
      lowHolders,
      toRemove
    };
  }

  /**
   * 💧 Extract liquidity from token data
   */
  extractLiquidity(token) {
    return token.liquidity || 
           token.jupiterData?.liquidity || 
           token.birdEyeRaw?.liquidity || 
           0;
  }

  /**
   * 💰 Extract market cap from token data
   */
  extractMarketCap(token) {
    return token.marketCap || 
           token.jupiterData?.mcap || 
           token.jupiterData?.fdv || 
           token.birdEyeRaw?.marketcap || 
           0;
  }

  /**
   * 📉 Extract liquidity change from token data
   */
  extractLiquidityChange(token) {
    return token.jupiterData?.stats24h?.liquidityChange ||
           token.jupiterData?.stats6h?.liquidityChange ||
           token.liquidityChange ||
           0;
  }

  /**
   * 👥 Extract holder count from token data
   */
  extractHolders(token) {
    return token.jupiterData?.holderCount ||
           token.holders ||
           0;
  }

  /**
   * 📋 Show examples of tokens to be removed
   */
  showRemovalExamples(tokensToRemove) {
    console.log('\n🗑️ TOKENS TO BE REMOVED (first 5 examples):');
    
    tokensToRemove.slice(0, 5).forEach((token, i) => {
      console.log(`  ${i + 1}. ${token.symbol}`);
      console.log(`     💧 Liquidity: $${token.liquidity.toFixed(0)}`);
      console.log(`     💰 Market Cap: $${token.marketCap.toFixed(0)}`);
      console.log(`     👥 Holders: ${token.holders}`);
      console.log(`     📉 Liquidity Change: ${token.liquidityChange.toFixed(1)}%`);
      console.log(`     ❌ Reason: ${token.removalReason}`);
      console.log('');
    });

    if (tokensToRemove.length > 5) {
      console.log(`     ... and ${tokensToRemove.length - 5} more tokens`);
    }
  }

  /**
   * 📁 Load tokens from cache
   */
  async loadTokens() {
    try {
      const data = await fs.readFile(this.cachePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('❌ Failed to load tokens:', error.message);
      return [];
    }
  }

  /**
   * 💾 Save tokens to cache
   */
  async saveTokens(tokens) {
    try {
      await fs.writeFile(this.cachePath, JSON.stringify(tokens, null, 2));
      console.log(`💾 Saved ${tokens.length} tokens to cache`);
    } catch (error) {
      console.error('❌ Failed to save tokens:', error.message);
      throw error;
    }
  }

  /**
   * 🔄 Create backup before cleanup
   */
  async createBackup(tokens) {
    try {
      const backupData = {
        timestamp: new Date().toISOString(),
        tokenCount: tokens.length,
        tokens: tokens
      };
      
      await fs.writeFile(this.backupPath, JSON.stringify(backupData, null, 2));
      console.log(`💾 Backup created: ${tokens.length} tokens`);
    } catch (error) {
      console.error('❌ Failed to create backup:', error.message);
      throw error;
    }
  }

  /**
   * ⚙️ Update cleanup configuration
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    console.log('⚙️ Cleanup config updated:', this.config);
  }

  /**
   * 🔍 Get cleanup statistics without removing tokens
   */
  async getCleanupStats() {
    const tokens = await this.loadTokens();
    if (!tokens || tokens.length === 0) {
      return { total: 0, toRemove: 0, categories: {} };
    }

    const analysis = this.analyzeTokensForRemoval(tokens);
    
    return {
      total: tokens.length,
      toRemove: analysis.toRemove.length,
      categories: {
        lowLiquidity: analysis.lowLiquidity.length,
        lowMarketCap: analysis.lowMarketCap.length,
        liquidityCrash: analysis.liquidityCrash.length,
        lowHolders: analysis.lowHolders.length
      },
      examples: analysis.toRemove.slice(0, 3).map(t => ({
        symbol: t.symbol,
        liquidity: t.liquidity,
        marketCap: t.marketCap,
        reason: t.removalReason
      }))
    };
  }
}

export default LiquidityCleanupService;
