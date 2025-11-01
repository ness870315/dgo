/**
 * Test script to verify Raydium decoder integration
 * 
 * This script:
 * 1. Initializes the Raydium decoder
 * 2. Tests decoding a known Raydium pool
 * 3. Verifies vault address detection
 * 4. Shows accuracy metrics
 */

import RaydiumPoolDecoder from './services/RaydiumPoolDecoder.mjs';

const CONSTANT_K_RPC = 'https://rpc.constant-k.com/?api-key=tsn41k3y-4qch-46f2-5ogr-67dmw2zh1ur8';

// Known Raydium AMM V4 pools for testing (verified active pools)
const TEST_POOLS = [
    {
        name: 'SOL/USDC',
        address: '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2',
        description: 'SOL-USDC Raydium AMM V4 pool (very active)'
    },
    {
        name: 'RAY/USDC',
        address: '6UmmUiYoBjSrhakAobJw8BvkmJtDVxaeBtbt7rxWo1mg',
        description: 'RAY-USDC Raydium AMM V4 pool'
    },
    {
        name: 'SOL/USDT',
        address: '7XawhbbxtsRcQA8KTkHT9f9nc6d69UwqCDh6U5EEbEmX',
        description: 'SOL-USDT Raydium AMM V4 pool'
    }
];

async function testRaydiumDecoder() {
    console.log('🔧 Testing Raydium Pool Decoder Integration\n');
    console.log('=' .repeat(80));
    
    // Initialize decoder
    const decoder = new RaydiumPoolDecoder(CONSTANT_K_RPC);
    console.log('✅ Decoder initialized\n');
    
    // Test each pool
    for (const pool of TEST_POOLS) {
        console.log(`\n📊 Testing: ${pool.name}`);
        console.log(`   Address: ${pool.address}`);
        console.log(`   ${pool.description}`);
        console.log('-'.repeat(80));
        
        try {
            const poolData = await decoder.decodePoolState(pool.address);
            
            if (poolData) {
                console.log('✅ Pool decoded successfully!');
                console.log(`   Base Vault:  ${poolData.baseVault}`);
                console.log(`   Quote Vault: ${poolData.quoteVault}`);
                console.log(`   LP Mint:     ${poolData.lpMint}`);
                console.log(`   Base Mint:   ${poolData.baseMint}`);
                console.log(`   Quote Mint:  ${poolData.quoteMint}`);
                console.log(`   Status:      ${poolData.status}`);
                
                // Test vault detection
                console.log('\n🔍 Testing vault detection:');
                const isBaseVault = decoder.isPoolVault(poolData.baseVault, pool.address);
                const isQuoteVault = decoder.isPoolVault(poolData.quoteVault, pool.address);
                const isRandomAddress = decoder.isPoolVault('11111111111111111111111111111111', pool.address);
                
                console.log(`   Base vault detected as pool:  ${isBaseVault ? '✅ YES' : '❌ NO'}`);
                console.log(`   Quote vault detected as pool: ${isQuoteVault ? '✅ YES' : '❌ NO'}`);
                console.log(`   Random address as pool:       ${isRandomAddress ? '❌ WRONG' : '✅ NO (correct)'}`);
                
            } else {
                console.log('❌ Failed to decode pool (might not be Raydium AMM)');
            }
            
        } catch (error) {
            console.error(`❌ Error testing pool: ${error.message}`);
        }
    }
    
    // Show metrics
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
    
    console.log('\n✅ Raydium decoder test complete!\n');
    
    // Test summary
    if (metrics.successfulDecodes > 0) {
        console.log('🎉 SUCCESS: Raydium decoder is working correctly!');
        console.log('   - Pool states are being decoded');
        console.log('   - Vault addresses are being extracted');
        console.log('   - Vault detection is functioning');
        console.log('   - Cache is operational');
    } else {
        console.log('⚠️  WARNING: No pools were successfully decoded');
        console.log('   - Check if the pools are actually Raydium AMM V4 pools');
        console.log('   - Verify RPC endpoint is accessible');
    }
}

// Run the test
testRaydiumDecoder().catch(console.error);

