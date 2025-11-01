import gRPCTrendingService from './services/gRPCTrendingService.js';
import EnhancedTokenProcessor from './enhancedTokenProcessor.js';

async function main() {
    console.log('🚀 Starting gRPC Trending Service with Token Processor Integration...\n');
    
    // Initialize EnhancedTokenProcessor for full workflow (Jupiter → Twitter → Scoring)
    console.log('📊 Initializing EnhancedTokenProcessor...');
    const tokenProcessor = new EnhancedTokenProcessor();
    await tokenProcessor.initialize();
    console.log('✅ EnhancedTokenProcessor initialized\n');
    
    // Initialize gRPC Trending Service with processor integration
    const service = new gRPCTrendingService(null, tokenProcessor);
    
    try {
        await service.runDiscoveryCycle();
        console.log('\n✅ Discovery cycle completed successfully!');
        console.log('📊 Tokens have been processed through full workflow (Twitter + Scoring)');
        process.exit(0);
    } catch (error) {
        console.error('\n❌ Discovery cycle failed:', error);
        process.exit(1);
    }
}

main();

