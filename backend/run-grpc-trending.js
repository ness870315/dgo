import gRPCTrendingService from './services/gRPCTrendingService.js';

async function main() {
    console.log('🚀 Starting gRPC Trending Service...\n');
    
    const service = new gRPCTrendingService();
    
    try {
        await service.runDiscoveryCycle();
        console.log('\n✅ Discovery cycle completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('\n❌ Discovery cycle failed:', error);
        process.exit(1);
    }
}

main();

