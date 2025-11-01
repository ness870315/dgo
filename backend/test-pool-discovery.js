/**
 * Comprehensive pool discovery test
 * Tries every account in the instruction to find which one is the pool
 */

import { Connection, PublicKey } from '@solana/web3.js';
import RaydiumPoolDecoder from './services/RaydiumPoolDecoder.mjs';
import { buildCombinedKeys } from './services/SwapDetectionHelpers.mjs';

const CONSTANT_K_RPC = 'https://rpc.constant-k.com/?api-key=tsn41k3y-4qch-46f2-5ogr-67dmw2zh1ur8';
const RAYDIUM_AMM = '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8';

// Known active Raydium pool (SOL/USDC)
const TEST_POOL = '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2';

async function testPoolDiscovery() {
    console.log('🔍 COMPREHENSIVE POOL DISCOVERY TEST\n');
    console.log('='.repeat(80));
    
    const connection = new Connection(CONSTANT_K_RPC, 'confirmed');
    const decoder = new RaydiumPoolDecoder(CONSTANT_K_RPC);
    
    // Pre-cache the known pool
    console.log(`\n📦 Pre-caching known pool: ${TEST_POOL}...`);
    await decoder.decodePoolState(TEST_POOL);
    
    // Get recent transactions for this pool
    console.log(`\n📡 Fetching recent transactions for pool...`);
    const poolPubkey = new PublicKey(TEST_POOL);
    const signatures = await connection.getSignaturesForAddress(poolPubkey, { limit: 20 });
    
    if (signatures.length === 0) {
        console.log('❌ No transactions found');
        return;
    }
    
    console.log(`✅ Found ${signatures.length} transactions\n`);
    
    // Try multiple transactions until we find one that works
    for (let sigIdx = 0; sigIdx < Math.min(10, signatures.length); sigIdx++) {
        const txSig = signatures[sigIdx].signature;
        console.log(`\n${'='.repeat(80)}`);
        console.log(`📊 Transaction ${sigIdx + 1}: ${txSig.substring(0, 16)}...`);
        console.log('='.repeat(80));
        
        const tx = await connection.getTransaction(txSig, {
            maxSupportedTransactionVersion: 0,
            commitment: 'confirmed'
        });
        
        if (!tx || !tx.transaction || !tx.transaction.message) {
            console.log('   ⏭️  Invalid transaction, skipping...');
            continue;
        }
        
        // Normalize v0 format
        const message = tx.transaction.message;
        if (message.staticAccountKeys && !message.accountKeys) {
            message.accountKeys = message.staticAccountKeys;
        }
        if (message.compiledInstructions && !message.instructions) {
            message.instructions = message.compiledInstructions;
        }
        
        const { combined } = buildCombinedKeys(message);
        const instructions = message.instructions || [];
        
        // Find Raydium instruction
        let raydiumIx = null;
        let raydiumProgramIdx = null;
        
        for (const ix of instructions) {
            if (ix.programIdIndex !== undefined) {
                const progId = combined[ix.programIdIndex];
                if (progId === RAYDIUM_AMM) {
                    raydiumIx = ix;
                    raydiumProgramIdx = ix.programIdIndex;
                    break;
                }
            }
        }
        
        if (!raydiumIx) {
            console.log('   ⏭️  No Raydium instruction, skipping...');
            continue;
        }
        
        console.log(`\n✅ Found Raydium AMM instruction`);
        console.log(`   Program ID at index: ${raydiumProgramIdx}`);
        console.log(`   Program ID: ${combined[raydiumProgramIdx]}`);
        
        // Get account indices
        let accountIndices = [];
        
        if (Array.isArray(raydiumIx.accounts) && raydiumIx.accounts.length > 0) {
            accountIndices = raydiumIx.accounts;
        } else if (Array.isArray(raydiumIx.accountKeyIndexes) && raydiumIx.accountKeyIndexes.length > 0) {
            accountIndices = raydiumIx.accountKeyIndexes;
        } else {
            console.log('   ❌ No account indices found');
            continue;
        }
        
        console.log(`\n📋 Analyzing ${accountIndices.length} accounts in instruction:`);
        console.log('   '.repeat(40) + '-'.repeat(40));
        
        // Test each account to see if it's the pool
        let foundPool = false;
        
        for (let i = 0; i < accountIndices.length; i++) {
            const accIdx = accountIndices[i];
            
            // Skip out of bounds
            if (accIdx < 0 || accIdx >= combined.length) {
                console.log(`   [${i.toString().padStart(3)}] idx=${accIdx.toString().padStart(3)}: OUT_OF_BOUNDS`);
                continue;
            }
            
            const accountAddress = combined[accIdx];
            if (!accountAddress || typeof accountAddress !== 'string') {
                console.log(`   [${i.toString().padStart(3)}] idx=${accIdx.toString().padStart(3)}: INVALID`);
                continue;
            }
            
            // Check if this account is owned by Raydium AMM program
            try {
                const accountInfo = await connection.getAccountInfo(new PublicKey(accountAddress));
                
                if (!accountInfo) {
                    console.log(`   [${i.toString().padStart(3)}] idx=${accIdx.toString().padStart(3)}: ${accountAddress.substring(0, 16)}... (NOT_EXISTS)`);
                    continue;
                }
                
                const isRaydiumOwned = accountInfo.owner.toBase58() === RAYDIUM_AMM;
                const isPool = accountAddress === TEST_POOL;
                
                // Try to decode as pool
                let poolData = null;
                if (isRaydiumOwned) {
                    poolData = await decoder.decodePoolState(accountAddress);
                }
                
                const status = isPool ? '✅ KNOWN_POOL' : 
                             poolData ? '✅ IS_POOL' : 
                             isRaydiumOwned ? '⚠️  RAYDIUM_OWNED (not pool)' :
                             '   ';
                
                console.log(`   [${i.toString().padStart(3)}] idx=${accIdx.toString().padStart(3)}: ${accountAddress.substring(0, 24)}... ${status}`);
                
                if (poolData) {
                    console.log(`       └─ Base Vault: ${poolData.baseVault.substring(0, 16)}...`);
                    console.log(`       └─ Quote Vault: ${poolData.quoteVault.substring(0, 16)}...`);
                    
                    if (isPool) {
                        console.log(`\n🎉 FOUND KNOWN POOL AT INDEX ${i} (idx=${accIdx})!`);
                        console.log(`   This is the correct extraction position!\n`);
                        foundPool = true;
                        return { success: true, accountIndex: i, poolAddress: accountAddress, isKnownPool: true };
                    } else {
                        console.log(`       ⚠️  Different pool found at index ${i}`);
                        foundPool = true;
                    }
                }
                
            } catch (err) {
                console.log(`   [${i.toString().padStart(3)}] idx=${accIdx.toString().padStart(3)}: ${accountAddress.substring(0, 16)}... (ERROR: ${err.message.substring(0, 30)})`);
            }
        }
        
        if (foundPool && isPool) {
            console.log('\n✅ Found known pool in this transaction!');
            break;
        } else {
            console.log('\n⚠️  No known pool found in this transaction, trying next...');
        }
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('❌ Could not find pool in any transaction');
    return { success: false };
}

testPoolDiscovery().catch(console.error);

