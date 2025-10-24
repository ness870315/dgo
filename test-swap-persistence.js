import ChartDatabase from './backend/services/ChartDatabase.js';

async function testSwapPersistence() {
    console.log('🔍 Testing Swap Persistence...');
    
    try {
        const chartDb = new ChartDatabase();
        await chartDb.ensureLoaded();
        
        console.log('\n📊 Database Statistics:');
        const stats = await chartDb.getStats();
        console.log(`   Total Tokens: ${stats.totalTokens}`);
        console.log(`   Total Swaps: ${stats.totalSwaps}`);
        console.log(`   Total Pools: ${stats.totalPools}`);
        console.log(`   Active Pools: ${stats.activePools}`);
        
        // Check if PROBITY swaps exist
        const probityToken = '9N9V585yTpmosZacAcXLZWxKJEK7PbaH4RJ8gEKLD9sc';
        const probityPool = '98rxcGXHxfAQ39rgpN9qMGPLhgWfze1RmQ4PHprTvZFN';
        
        console.log(`\n🔍 Checking PROBITY swaps (${probityToken.substring(0, 8)}...)`);
        
        // Check if PROBITY has a database file
        const probitySwaps = await chartDb.getRecentSwaps(probityPool, 10);
        console.log(`   PROBITY swaps found: ${probitySwaps.length}`);
        
        if (probitySwaps.length > 0) {
            console.log('\n📝 Recent PROBITY Swaps:');
            probitySwaps.forEach((swap, index) => {
                console.log(`   ${index + 1}. ${swap.type} - ${swap.volumeUsd?.toFixed(2) || 'N/A'} USD - ${new Date(swap.timestamp).toLocaleString()}`);
            });
        } else {
            console.log('   ❌ No PROBITY swaps found in database');
        }
        
        // Check shared metadata
        console.log('\n📋 Shared Metadata:');
        console.log(`   Pools in sharedData: ${chartDb.sharedData.pools.size}`);
        console.log(`   Candles: ${chartDb.sharedData.candles.size}`);
        console.log(`   Backfill Progress: ${chartDb.sharedData.backfillProgress.size}`);
        
        // List some pools
        if (chartDb.sharedData.pools.size > 0) {
            console.log('\n🏊 Active Pools:');
            let count = 0;
            for (const [tokenAddress, poolData] of chartDb.sharedData.pools.entries()) {
                if (count < 5) {
                    console.log(`   ${tokenAddress.substring(0, 8)}... -> ${poolData.poolAddress?.substring(0, 8) || 'N/A'}... (Active: ${poolData.isActive})`);
                    count++;
                }
            }
            if (chartDb.sharedData.pools.size > 5) {
                console.log(`   ... and ${chartDb.sharedData.pools.size - 5} more pools`);
            }
        }
        
        console.log('\n✅ Swap persistence test completed!');
        
    } catch (error) {
        console.error('❌ Error testing swap persistence:', error.message);
        console.error('Stack:', error.stack);
    }
}

testSwapPersistence();
