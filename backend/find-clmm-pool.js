/**
 * Find a Raydium CLMM pool address via DexScreener
 * 
 * This script searches DexScreener for active CLMM pools.
 */

import axios from 'axios';

const DEXSCREENER_API = 'https://api.dexscreener.com/latest/dex';

async function findCLMMPool() {
    console.log('🔍 Searching for Raydium CLMM pools via DexScreener...\n');
    
    try {
        // Search for popular pairs on Raydium CLMM
        // Common pairs: SOL/USDC, SOL/USDT, BONK/USDC, etc.
        const popularPairs = [
            'SOL/USDC',
            'SOL/USDT',
            'BONK/USDC',
            'USDC/USDT'
        ];
        
        for (const pair of popularPairs) {
            try {
                console.log(`📊 Searching for ${pair} on Raydium...`);
                const response = await axios.get(`${DEXSCREENER_API}/search`, {
                    params: { q: pair },
                    timeout: 10000
                });
                
                if (response.data && response.data.pairs) {
                    // Look for Raydium CLMM pools
                    const clmmPools = response.data.pairs.filter(pair => 
                        pair.dexId === 'raydium' && 
                        pair.url && pair.url.includes('clmm')
                    );
                    
                    if (clmmPools.length > 0) {
                        const pool = clmmPools[0];
                        console.log(`\n✅ Found CLMM pool for ${pair}:`);
                        console.log(`   Pair: ${pool.pairAddress}`);
                        console.log(`   Base: ${pool.baseToken?.symbol || 'N/A'} (${pool.baseToken?.address || 'N/A'})`);
                        console.log(`   Quote: ${pool.quoteToken?.symbol || 'N/A'} (${pool.quoteToken?.address || 'N/A'})`);
                        console.log(`   Liquidity: $${(pool.liquidity?.usd || 0).toLocaleString()}`);
                        console.log(`   Volume 24h: $${(pair.volume?.h24 || 0).toLocaleString()}`);
                        console.log(`\n   Pool Address: ${pool.pairAddress}`);
                        console.log(`\n   Test command:`);
                        console.log(`   node backend/test-clmm-decoder.js ${pool.pairAddress}`);
                        return pool.pairAddress;
                    }
                }
            } catch (error) {
                console.error(`   ⚠️  Error searching for ${pair}:`, error.message);
            }
        }
        
        // Alternative: Try searching directly for "Raydium CLMM"
        console.log('\n📊 Trying direct search for "Raydium CLMM"...');
        try {
            const response = await axios.get(`${DEXSCREENER_API}/tokens/0x...`, {
                timeout: 10000
            });
            
            // This might not work directly, but worth a try
        } catch (error) {
            // Expected to fail, DexScreener needs specific format
        }
        
        console.log('\n⚠️  Could not find CLMM pool automatically');
        console.log('   You can:');
        console.log('   1. Visit https://dexscreener.com and search for "Raydium CLMM"');
        console.log('   2. Find a pool address (pairAddress) from the URL or pool details');
        console.log('   3. Run: node backend/test-clmm-decoder.js <POOL_ADDRESS>');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

// Run
findCLMMPool().catch(console.error);



