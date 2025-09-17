import TokenCleanupService from './tokenCleanupService.js';

class TokenCleanupRunner {
  constructor() {
    this.cleanupService = new TokenCleanupService();
  }

  async runAnalysis() {
    console.log('🧹 Starting Token Cleanup Analysis...\n');
    
    try {
      // Analyze tokens for cleanup
      const analysis = await this.cleanupService.analyzeTokensForCleanup();
      
      if (!analysis) {
        console.log('❌ Failed to analyze tokens');
        return;
      }
      
      // Generate and display report
      const report = this.cleanupService.generateReport(analysis);
      console.log(report);
      
      // Ask for confirmation if there are tokens to delete
      if (analysis.toDelete.length > 0) {
        console.log(`\n🤔 Found ${analysis.toDelete.length} tokens that should be deleted.`);
        console.log(`💡 To delete them, run: node run-token-cleanup.js --delete`);
        console.log(`⚠️ This will permanently remove these tokens from the database!`);
      } else {
        console.log(`\n✅ No tokens need to be deleted at this time.`);
      }
      
    } catch (error) {
      console.error('❌ Error running cleanup analysis:', error.message);
    }
  }

  async deleteTokens() {
    console.log('🗑️ Starting Token Deletion Process...\n');
    
    try {
      // Analyze tokens first
      const analysis = await this.cleanupService.analyzeTokensForCleanup();
      
      if (!analysis || analysis.toDelete.length === 0) {
        console.log('✅ No tokens need to be deleted.');
        return;
      }
      
      console.log(`🚨 Found ${analysis.toDelete.length} tokens to delete:`);
      analysis.toDelete.forEach(token => {
        console.log(`   • ${token.symbol}: ${token.reason}`);
      });
      
      console.log(`\n⚠️ This will permanently delete these tokens from the database!`);
      console.log(`💡 To proceed, run: node run-token-cleanup.js --delete --confirm`);
      
    } catch (error) {
      console.error('❌ Error preparing deletion:', error.message);
    }
  }

  async confirmDelete() {
    console.log('🗑️ CONFIRMING Token Deletion...\n');
    
    try {
      // Analyze tokens first
      const analysis = await this.cleanupService.analyzeTokensForCleanup();
      
      if (!analysis || analysis.toDelete.length === 0) {
        console.log('✅ No tokens need to be deleted.');
        return;
      }
      
      console.log(`🚨 DELETING ${analysis.toDelete.length} tokens:`);
      analysis.toDelete.forEach(token => {
        console.log(`   • ${token.symbol}: ${token.reason}`);
      });
      
      // Delete the tokens
      const result = await this.cleanupService.deleteTokens(analysis.toDelete);
      
      if (result) {
        console.log(`\n✅ Successfully deleted ${result.deleted} tokens`);
        console.log(`📊 Remaining tokens: ${result.remaining}`);
        
        // Show what was deleted
        console.log(`\n🗑️ Deleted tokens:`);
        result.deletedTokens.forEach(token => {
          console.log(`   • ${token.symbol} (${token.name})`);
        });
      } else {
        console.log('❌ Failed to delete tokens');
      }
      
    } catch (error) {
      console.error('❌ Error deleting tokens:', error.message);
    }
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const runner = new TokenCleanupRunner();

if (args.includes('--delete') && args.includes('--confirm')) {
  runner.confirmDelete().catch(console.error);
} else if (args.includes('--delete')) {
  runner.deleteTokens().catch(console.error);
} else {
  runner.runAnalysis().catch(console.error);
}
