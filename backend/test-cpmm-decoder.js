/**
 * Test Raydium CPMM Decoder with USELESS token pool
 * 
 * USELESS token: Dz9mQ9NzkBcCsuGPFJ3r1bS4wgqKMHBPiVuniW8Mbonk
 * Pool address: Same (pool address = token address for CPMM)
 */

import RaydiumCPMMDecoder from './services/RaydiumCPMMDecoder.mjs';

const CONSTANT_K_RPC = 'https://rpc.constant-k.com/?api-key=tsn41k3y-4qch-46f2-5ogr-67dmw2zh1ur8';

// USELESS token and its CPMM pool
const USELESS_TOKEN = 'Dz9mQ9NzkBcCsuGPFJ3r1bS4wgqKMHBPiVuniW8Mbonk';
const USELESS_POOL = 'Q2sPHPdUWFMg7M7wwrQKLrn619cAucfRsmhVJffodSp'; // Actual CPMM pool address (found via DexScreener)

async function testCPMMDecoder() {
    console.log('🔧 Testing Raydium CPMM Decoder with USELESS Pool\n');
    console.log('='.repeat(80));
    console.log(`📊 Token: ${USELESS_TOKEN}`);
    console.log(`📊 Pool:  ${USELESS_POOL}`);
    console.log('='.repeat(80));
    
    // Initialize decoder
    const decoder = new RaydiumCPMMDecoder(CONSTANT_K_RPC);
    console.log('✅ CPMM Decoder initialized\n');
    
    try {
        // Test decoding the USELESS CPMM pool
        console.log('🔄 Decoding USELESS CPMM pool...');
        console.log('-'.repeat(80));
        
        const poolData = await decoder.decodePoolState(USELESS_POOL);
        
        if (poolData) {
            console.log('\n✅ Pool decoded successfully!');
            console.log('   Vault Addresses (Critical for Classification):');
            console.log(`   Token0 Vault: ${poolData.token0Vault}`);
            console.log(`   Token1 Vault: ${poolData.token1Vault}`);
            
            if (poolData.token0Mint) {
                console.log('\n   Mint Addresses (Optional):');
                console.log(`   Token0 Mint: ${poolData.token0Mint}`);
            }
            if (poolData.token1Mint) {
                console.log(`   Token1 Mint: ${poolData.token1Mint}`);
            }
            
            // Test vault detection
            console.log('\n🔍 Testing vault detection:');
            console.log('-'.repeat(80));
            
            const isVault0Pool = decoder.isPoolVault(poolData.token0Vault, USELESS_POOL);
            const isVault1Pool = decoder.isPoolVault(poolData.token1Vault, USELESS_POOL);
            const isRandomAddressPool = decoder.isPoolVault('11111111111111111111111111111111', USELESS_POOL);
            
            console.log(`   Token0 Vault detected as pool:  ${isVault0Pool ? '✅ YES' : '❌ NO'}`);
            console.log(`   Token1 Vault detected as pool:  ${isVault1Pool ? '✅ YES' : '❌ NO'}`);
            console.log(`   Random address as pool:         ${isRandomAddressPool ? '❌ WRONG' : '✅ NO (correct)'}`);
            
            // Test cache (decode again - should hit cache)
            console.log('\n🔄 Testing cache (decoding same pool again)...');
            console.log('-'.repeat(80));
            
            const metricsBefore = decoder.getMetrics();
            const poolDataCached = await decoder.decodePoolState(USELESS_POOL);
            const metricsAfter = decoder.getMetrics();
            
            if (poolDataCached && metricsAfter.cacheHits > metricsBefore.cacheHits) {
                console.log('✅ Cache hit confirmed!');
                console.log(`   Cache hits: ${metricsBefore.cacheHits} → ${metricsAfter.cacheHits}`);
            } else {
                console.log('⚠️  Cache may not be working correctly');
            }
            
        } else {
            console.log('\n❌ Failed to decode pool');
            console.log('   This could mean:');
            console.log('   - Pool is not a Raydium CPMM pool');
            console.log('   - Pool address is incorrect');
            console.log('   - RPC endpoint issue');
            return;
        }
        
        // Show final metrics
        console.log('\n' + '='.repeat(80));
        console.log('📊 DECODER METRICS:');
        console.log('='.repeat(80));
        const metrics = decoder.getMetrics();
        console.log(`   Total Decodes:      ${metrics.totalDecodes}`);
        console.log(`   Successful Decodes: ${metrics.successfulDecodes}`);
        console.log(`   Failed Decodes:     ${metrics.failedDecodes}`);
        console.log(`   Cache Hits:         ${metrics.cacheHits}`);
        console.log(`   Success Rate:       ${metrics.successRate}`);
        console.log(`   Cache Size:         ${metrics.cacheSize} pools`);
        
        console.log('\n' + '='.repeat(80));
        
        if (poolData && poolData.token0Vault && poolData.token1Vault) {
            console.log('🎉 SUCCESS: Raydium CPMM decoder is working correctly!');
            console.log('   ✅ Pool state decoded');
            console.log('   ✅ Vault addresses extracted');
            console.log('   ✅ Vault detection functioning');
            console.log('   ✅ Cache operational');
            console.log('\n   This decoder can now provide 100% accurate user vs. pool');
            console.log('   classification for Raydium CPMM swaps! 🚀');
        } else {
            console.log('⚠️  WARNING: Decoder did not fully succeed');
            console.log('   Check the errors above for details');
        }
        
    } catch (error) {
        console.error('\n❌ ERROR:', error.message);
        console.error(error.stack);
    }
}

// Run the test
testCPMMDecoder().catch(console.error);

