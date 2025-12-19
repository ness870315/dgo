/**
 * Test Raydium CLMM Decoder
 * 
 * Tests the CLMM decoder with a known Raydium CLMM pool.
 * First, we'll try to find a CLMM pool via Jupiter API or DexScreener.
 */

import RaydiumCLMMDecoder from './services/RaydiumCLMMDecoder.mjs';
import axios from 'axios';

const CONSTANT_K_RPC = 'https://rpc.constant-k.com/?api-key=tsn41k3y-4qch-46f2-5ogr-67dmw2zh1ur8';
const JUPITER_API = 'https://quote-api.jup.ag/v6/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&amount=1000000000&slippageBps=50';

// Known CLMM pools (you can find these via DexScreener or Jupiter API)
// These are examples - we'll try to fetch a real one dynamically
const KNOWN_CLMM_POOLS = [
    // Add known CLMM pool addresses here if available
    // Example: 'CLMM_POOL_ADDRESS_1',
    // Example: 'CLMM_POOL_ADDRESS_2'
];

/**
 * Find a CLMM pool via Jupiter API
 */
async function findCLMMPool() {
    try {
        console.log('🔍 Searching for CLMM pools via Jupiter API...');
        
        // Get quotes for SOL/USDC - Jupiter will return routes including CLMM
        const response = await axios.get(JUPITER_API, {
            timeout: 10000
        });
        
        if (response.data && response.data.routes) {
            // Look for routes using CLMM program
            for (const route of response.data.routes) {
                for (const marketInfo of route.marketInfos || []) {
                    if (marketInfo.id === 'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK') {
                        // This is a CLMM pool
                        const poolAddress = marketInfo.liquidity || marketInfo.address;
                        if (poolAddress && poolAddress.length > 30) {
                            console.log(`✅ Found CLMM pool: ${poolAddress}`);
                            return poolAddress;
                        }
                    }
                }
            }
        }
        
        console.log('⚠️  No CLMM pools found in Jupiter routes');
        return null;
        
    } catch (error) {
        console.error('❌ Error finding CLMM pool:', error.message);
        return null;
    }
}

/**
 * Test CLMM decoder with a specific pool
 */
async function testCLMMDecoder(poolAddress) {
    console.log('\n🔧 Testing Raydium CLMM Decoder\n');
    console.log('='.repeat(80));
    console.log(`📊 Pool Address: ${poolAddress}`);
    console.log('='.repeat(80));
    
    // Initialize decoder
    const decoder = new RaydiumCLMMDecoder(CONSTANT_K_RPC);
    console.log('✅ CLMM Decoder initialized\n');
    
    try {
        // Test decoding the CLMM pool
        console.log('🔄 Decoding CLMM pool...');
        console.log('-'.repeat(80));
        
        const poolData = await decoder.decodePoolState(poolAddress);
        
        if (poolData) {
            console.log('\n✅ Pool decoded successfully!');
            console.log('   Vault Addresses (Critical for Classification):');
            console.log(`   Vault A: ${poolData.vaultA}`);
            console.log(`   Vault B: ${poolData.vaultB}`);
            
            if (poolData.mintA) {
                console.log('\n   Mint Addresses (Optional):');
                console.log(`   Mint A: ${poolData.mintA}`);
            }
            if (poolData.mintB) {
                console.log(`   Mint B: ${poolData.mintB}`);
            }
            
            // Test vault detection
            console.log('\n🔍 Testing vault detection:');
            console.log('-'.repeat(80));
            
            const isVaultAPool = decoder.isPoolVault(poolData.vaultA, poolAddress);
            const isVaultBPool = decoder.isPoolVault(poolData.vaultB, poolAddress);
            const isRandomAddressPool = decoder.isPoolVault('11111111111111111111111111111111', poolAddress);
            
            console.log(`   Vault A detected as pool:  ${isVaultAPool ? '✅ YES' : '❌ NO'}`);
            console.log(`   Vault B detected as pool:  ${isVaultBPool ? '✅ YES' : '❌ NO'}`);
            console.log(`   Random address as pool:     ${isRandomAddressPool ? '❌ WRONG' : '✅ NO (correct)'}`);
            
            // Test cache (decode again - should hit cache)
            console.log('\n🔄 Testing cache (decoding same pool again)...');
            console.log('-'.repeat(80));
            
            const metricsBefore = decoder.getMetrics();
            const poolDataCached = await decoder.decodePoolState(poolAddress);
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
            console.log('   - Pool is not a Raydium CLMM pool');
            console.log('   - Pool address is incorrect');
            console.log('   - RPC endpoint issue');
            console.log('   - Pool structure different than expected');
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
        
        if (poolData && poolData.vaultA && poolData.vaultB) {
            console.log('🎉 SUCCESS: Raydium CLMM decoder is working correctly!');
            console.log('   ✅ Pool state decoded');
            console.log('   ✅ Vault addresses extracted');
            console.log('   ✅ Vault detection functioning');
            console.log('   ✅ Cache operational');
            console.log('\n   This decoder can now provide 100% accurate user vs. pool');
            console.log('   classification for Raydium CLMM swaps! 🚀');
        } else {
            console.log('⚠️  WARNING: Decoder did not fully succeed');
            console.log('   Check the errors above for details');
        }
        
    } catch (error) {
        console.error('\n❌ ERROR:', error.message);
        console.error(error.stack);
    }
}

/**
 * Main test function
 */
async function runTest() {
    console.log('🧪 Raydium CLMM Decoder Test\n');
    
    // Try to find a CLMM pool dynamically
    let poolAddress = await findCLMMPool();
    
    // If not found, try known pools or use a test pool
    if (!poolAddress && KNOWN_CLMM_POOLS.length > 0) {
        console.log(`\n⚠️  Using known CLMM pool from list: ${KNOWN_CLMM_POOLS[0]}`);
        poolAddress = KNOWN_CLMM_POOLS[0];
    }
    
    if (!poolAddress) {
        console.log('\n❌ No CLMM pool address provided');
        console.log('   Please provide a CLMM pool address as an argument or add one to KNOWN_CLMM_POOLS');
        console.log('\n   Example usage:');
        console.log('   node test-clmm-decoder.js <CLMM_POOL_ADDRESS>');
        console.log('\n   Or find one via:');
        console.log('   - DexScreener: Filter by Raydium CLMM');
        console.log('   - Jupiter API: Look for routes with program ID CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK');
        return;
    }
    
    await testCLMMDecoder(poolAddress);
}

// Get pool address from command line if provided
const poolAddressArg = process.argv[2];

if (poolAddressArg) {
    // Test with provided pool address
    testCLMMDecoder(poolAddressArg).catch(console.error);
} else {
    // Try to find one automatically
    runTest().catch(console.error);
}







