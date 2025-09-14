#!/usr/bin/env node

/**
 * 🧹 Run Liquidity Cleanup
 * Script to clean up tokens with extremely low liquidity
 */

import LiquidityCleanupService from './liquidityCleanupService.js';

async function runCleanup() {
  const cleanup = new LiquidityCleanupService();
  
  try {
    console.log('🚀 DeGen Oracle - Liquidity Cleanup Tool');
    console.log('==========================================');
    
    // Get current stats first
    console.log('\n📊 Current Database Stats:');
    const stats = await cleanup.getCleanupStats();
    console.log(`  Total tokens: ${stats.total}`);
    console.log(`  Tokens to remove: ${stats.toRemove}`);
    console.log(`  Categories:`);
    console.log(`    💧 Low liquidity: ${stats.categories.lowLiquidity}`);
    console.log(`    💰 Low market cap: ${stats.categories.lowMarketCap}`);
    console.log(`    📉 Liquidity crash: ${stats.categories.liquidityCrash}`);
    console.log(`    👥 Low holders: ${stats.categories.lowHolders}`);
    
    if (stats.examples.length > 0) {
      console.log('\n🔍 Examples of tokens to remove:');
      stats.examples.forEach((token, i) => {
        console.log(`  ${i + 1}. ${token.symbol} - ${token.reason}`);
      });
    }

    if (stats.toRemove === 0) {
      console.log('\n✅ No cleanup needed - all tokens meet minimum requirements');
      return;
    }

    console.log('\n🧹 Starting cleanup...');
    
    // Run the actual cleanup
    const result = await cleanup.cleanupLowLiquidityTokens();
    
    console.log('\n🎉 CLEANUP COMPLETE!');
    console.log(`  🗑️ Removed: ${result.removed} tokens`);
    console.log(`  ✅ Remaining: ${result.remaining} tokens`);
    console.log(`  💾 Backup saved for safety`);
    
    if (result.removedTokens && result.removedTokens.length > 0) {
      console.log('\n📋 Removed tokens summary:');
      result.removedTokens.slice(0, 10).forEach((token, i) => {
        console.log(`  ${i + 1}. ${token.symbol} - ${token.reason}`);
      });
      
      if (result.removedTokens.length > 10) {
        console.log(`  ... and ${result.removedTokens.length - 10} more`);
      }
    }

  } catch (error) {
    console.error('\n❌ Cleanup failed:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Handle command line arguments
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
🧹 DeGen Oracle Liquidity Cleanup Tool

Usage: node run-liquidity-cleanup.js [options]

Options:
  --dry-run, -d     Show what would be removed without actually removing
  --stats, -s       Show cleanup statistics only
  --help, -h        Show this help message

Cleanup Criteria:
  💧 Minimum liquidity: $1,000
  💰 Minimum market cap: $5,000  
  📉 Max liquidity drop: -95%
  👥 Minimum holders: 5

Examples:
  node run-liquidity-cleanup.js           # Run full cleanup
  node run-liquidity-cleanup.js --dry-run # Preview what would be removed
  node run-liquidity-cleanup.js --stats   # Show statistics only
`);
  process.exit(0);
}

if (args.includes('--stats') || args.includes('-s')) {
  // Stats only mode
  const cleanup = new LiquidityCleanupService();
  const stats = await cleanup.getCleanupStats();
  
  console.log('📊 CLEANUP STATISTICS');
  console.log('====================');
  console.log(`Total tokens: ${stats.total}`);
  console.log(`Tokens to remove: ${stats.toRemove} (${((stats.toRemove / stats.total) * 100).toFixed(1)}%)`);
  console.log(`Would remain: ${stats.total - stats.toRemove}`);
  
  process.exit(0);
}

if (args.includes('--dry-run') || args.includes('-d')) {
  // Dry run mode
  const cleanup = new LiquidityCleanupService();
  cleanup.updateConfig({ dryRun: true });
  console.log('🔍 DRY RUN MODE - No tokens will actually be removed\n');
}

// Run the cleanup
runCleanup();
