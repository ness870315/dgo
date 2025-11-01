/**
 * Find the actual CPMM pool address for USELESS token
 */

import { Connection, PublicKey } from '@solana/web3.js';
import axios from 'axios';

const CONSTANT_K_RPC = 'https://rpc.constant-k.com/?api-key=tsn41k3y-4qch-46f2-5ogr-67dmw2zh1ur8';
const RAYDIUM_CPMM_PROGRAM = 'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C';
const USELESS_TOKEN = 'Dz9mQ9NzkBcCsuGPFJ3r1bS4wgqKMHBPiVuniW8Mbonk';

async function findUSELESSCPMMPool() {
    console.log('🔍 Finding CPMM Pool for USELESS Token\n');
    console.log('='.repeat(80));
    console.log(`Token Mint: ${USELESS_TOKEN}`);
    console.log(`CPMM Program: ${RAYDIUM_CPMM_PROGRAM}`);
    console.log('='.repeat(80));
    
    try {
        // Method 1: Check Jupiter API for pool information
        console.log('\n📊 Method 1: Checking Jupiter API...');
        const jupiterResponse = await axios.get(`https://lite-api.jup.ag/tokens/v2/search`, {
            params: {
                query: USELESS_TOKEN
            }
        });
        
        if (jupiterResponse.data?.tokens) {
            const token = jupiterResponse.data.tokens.find(t => t.address === USELESS_TOKEN);
            if (token) {
                console.log('✅ Found token in Jupiter:');
                console.log(`   Symbol: ${token.symbol}`);
                console.log(`   Name: ${token.name}`);
                
                // Check for pools
                if (token.pools) {
                    console.log(`   Pools found: ${token.pools.length}`);
                    for (const pool of token.pools) {
                        console.log(`   Pool: ${pool.id}`);
                        console.log(`   DEX: ${pool.name || 'Unknown'}`);
                        if (pool.mintX === USELESS_TOKEN || pool.mintY === USELESS_TOKEN) {
                            console.log(`   ✅ This pool contains USELESS!`);
                        }
                    }
                }
                
                // Check Jupiter metadata for pool addresses
                const tokenData = token;
                if (tokenData.firstPool) {
                    console.log(`\n   First Pool ID: ${tokenData.firstPool.id}`);
                    console.log(`   First Pool Name: ${tokenData.firstPool.name || 'Unknown'}`);
                    if (tokenData.firstPool.id) {
                        console.log(`\n🎯 Potential Pool Address: ${tokenData.firstPool.id}`);
                        return tokenData.firstPool.id;
                    }
                }
            }
        }
        
        // Method 2: Query program accounts for CPMM pools containing this token
        console.log('\n📊 Method 2: Querying CPMM program accounts...');
        const connection = new Connection(CONSTANT_K_RPC, 'confirmed');
        
        // Get program-derived accounts or search for pools
        // We'll try to find accounts owned by CPMM program that might be pools
        const programAccounts = await connection.getProgramAccounts(
            new PublicKey(RAYDIUM_CPMM_PROGRAM),
            {
                filters: [
                    {
                        dataSize: 1000 // CPMM pools are typically around this size
                    }
                ]
            }
        );
        
        console.log(`   Found ${programAccounts.length} accounts owned by CPMM program`);
        console.log(`   (This might take a while, limiting to first 10...)`);
        
        // Check first few accounts to see if any contain our token
        for (let i = 0; i < Math.min(10, programAccounts.length); i++) {
            const account = programAccounts[i];
            const data = account.account.data;
            
            // Try to find the token mint in the account data
            const tokenMintStr = USELESS_TOKEN;
            const tokenMintBytes = new PublicKey(tokenMintStr).toArray();
            
            // Check if token mint appears in account data
            for (let j = 0; j <= data.length - 32; j++) {
                const slice = Array.from(data.slice(j, j + 32));
                if (slice.every((byte, idx) => byte === tokenMintBytes[idx])) {
                    console.log(`   ✅ Found potential pool containing USELESS token:`);
                    console.log(`      Pool Address: ${account.pubkey.toBase58()}`);
                    return account.pubkey.toBase58();
                }
            }
        }
        
        // Method 3: Check DexScreener
        console.log('\n📊 Method 3: Checking DexScreener...');
        const dexscreenerResponse = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${USELESS_TOKEN}`);
        
        if (dexscreenerResponse.data?.pairs) {
            const pairs = dexscreenerResponse.data.pairs;
            console.log(`   Found ${pairs.length} pairs on DexScreener`);
            
            for (const pair of pairs.slice(0, 5)) {
                console.log(`   Pair: ${pair.pairAddress}`);
                console.log(`   DEX: ${pair.dexId}`);
                console.log(`   Base: ${pair.baseToken?.symbol || 'N/A'}`);
                console.log(`   Quote: ${pair.quoteToken?.symbol || 'N/A'}`);
                
                if (pair.dexId === 'raydium' || pair.dexId === 'raydium-cpmm') {
                    console.log(`   ✅ This looks like a Raydium pool!`);
                    if (pair.pairAddress) {
                        console.log(`\n🎯 Potential Pool Address: ${pair.pairAddress}`);
                        return pair.pairAddress;
                    }
                }
            }
        }
        
        console.log('\n⚠️  Could not find CPMM pool address automatically');
        console.log('   You may need to check:');
        console.log('   - DexScreener for the exact pool address');
        console.log('   - Raydium website/explorer');
        console.log('   - Token metadata from Jupiter');
        
    } catch (error) {
        console.error('\n❌ ERROR:', error.message);
    }
}

findUSELESSCPMMPool().catch(console.error);

