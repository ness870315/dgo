/**
 * Test CPMM pool extraction for specific pool: Q2sPHPdUWFMg7M7wwrQKLrn619cAucfRsmhVJffodSp
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { extractRaydiumPoolFromIx, buildCombinedKeys } from './services/SwapDetectionHelpers.mjs';
import RaydiumCPMMDecoder from './services/RaydiumCPMMDecoder.mjs';

const CONSTANT_K_RPC = 'https://rpc.constant-k.com/?api-key=tsn41k3y-4qch-46f2-5ogr-67dmw2zh1ur8';
const RAYDIUM_CPMM = 'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C';
const TEST_POOL = 'Q2sPHPdUWFMg7M7wwrQKLrn619cAucfRsmhVJffodSp';

async function testCPMMPool() {
    console.log('🧪 TESTING CPMM POOL EXTRACTION\n');
    console.log('='.repeat(80));
    console.log(`📦 Pool: ${TEST_POOL}`);
    console.log(`📦 Program: ${RAYDIUM_CPMM.substring(0, 24)}...\n`);
    
    const connection = new Connection(CONSTANT_K_RPC, 'confirmed');
    const decoder = new RaydiumCPMMDecoder(CONSTANT_K_RPC);
    
    // Pre-cache pool
    console.log('📦 Pre-caching pool...');
    await decoder.decodePoolState(TEST_POOL);
    console.log('✅ Pool cached\n');
    
    // Get recent transactions
    console.log('📡 Fetching recent transactions for this pool...');
    const poolPubkey = new PublicKey(TEST_POOL);
    const signatures = await connection.getSignaturesForAddress(poolPubkey, { limit: 50 });
    
    console.log(`✅ Found ${signatures.length} transactions\n`);
    
    let tested = 0;
    let success = 0;
    let failed = 0;
    let foundCorrectPool = false;
    
    // Test transactions
    for (let sigIdx = 0; sigIdx < Math.min(15, signatures.length); sigIdx++) {
        const txSig = signatures[sigIdx].signature;
        
        // Rate limit
        if (sigIdx > 0) {
            await new Promise(resolve => setTimeout(resolve, 300));
        }
        
        const tx = await connection.getTransaction(txSig, {
            maxSupportedTransactionVersion: 0,
            commitment: 'confirmed'
        });
        
        if (!tx || !tx.transaction || !tx.transaction.message) {
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
        
        // Check for CPMM program
        let hasCPMM = false;
        for (const ix of instructions) {
            if (ix.programIdIndex !== undefined && combined[ix.programIdIndex] === RAYDIUM_CPMM) {
                hasCPMM = true;
                break;
            }
        }
        
        if (!hasCPMM) {
            console.log(`⏭️  [${sigIdx + 1}] ${txSig.substring(0, 16)}... - No CPMM instruction`);
            continue;
        }
        
        tested++;
        console.log(`\n📊 [${tested}] Testing: ${txSig.substring(0, 16)}...`);
        
        // Test extraction
        const txWrapper = {
            transaction: {
                message: tx.transaction.message,
                signatures: tx.transaction.signatures
            },
            meta: tx.meta
        };
        
        const extractedPool = extractRaydiumPoolFromIx(txWrapper, RAYDIUM_CPMM);
        
        if (!extractedPool) {
            console.log(`   ❌ Extraction returned null`);
            failed++;
            
            // Debug: Show what accounts are in the instruction
            for (const ix of instructions) {
                if (ix.programIdIndex !== undefined && combined[ix.programIdIndex] === RAYDIUM_CPMM) {
                    let accountIndices = [];
                    if (Array.isArray(ix.accounts) && ix.accounts.length > 0) {
                        accountIndices = ix.accounts;
                    } else if (Array.isArray(ix.accountKeyIndexes) && ix.accountKeyIndexes.length > 0) {
                        accountIndices = ix.accountKeyIndexes;
                    }
                    
                    console.log(`   📋 CPMM instruction has ${accountIndices.length} accounts`);
                    console.log(`   📋 First 5 indices: ${accountIndices.slice(0, 5).join(', ')}`);
                    
                    // Check if pool is in the instruction
                    for (let i = 0; i < accountIndices.length; i++) {
                        const accIdx = accountIndices[i];
                        if (accIdx >= 0 && accIdx < combined.length) {
                            if (combined[accIdx] === TEST_POOL) {
                                console.log(`   ✅ Pool found at instruction account index ${i} (idx=${accIdx})`);
                            }
                        }
                    }
                    break;
                }
            }
            continue;
        }
        
        console.log(`   📍 Extracted: ${extractedPool.substring(0, 32)}...`);
        
        // Verify it's a valid pool
        await new Promise(resolve => setTimeout(resolve, 300));
        const poolData = await decoder.decodePoolState(extractedPool);
        
        if (poolData) {
            const isCorrect = extractedPool === TEST_POOL;
            console.log(`   ✅ Valid CPMM pool! ${isCorrect ? '(CORRECT POOL ✓)' : '(different pool)'}`);
            if (isCorrect) {
                console.log(`      Token0 Vault: ${poolData.token0Vault.substring(0, 16)}...`);
                console.log(`      Token1 Vault: ${poolData.token1Vault.substring(0, 16)}...`);
            }
            success++;
            if (isCorrect) {
                foundCorrectPool = true;
            }
        } else {
            console.log(`   ❌ Not a valid pool (owner check failed)`);
            failed++;
        }
    }
    
    console.log('\n' + '='.repeat(80));
    console.log(`📊 RESULTS:`);
    console.log(`   Tested: ${tested} transactions with CPMM instructions`);
    console.log(`   Success: ${success} (${tested > 0 ? ((success/tested)*100).toFixed(1) : 0}%)`);
    console.log(`   Failed: ${failed}`);
    console.log(`   Found correct pool: ${foundCorrectPool ? '✅ YES' : '❌ NO'}`);
    console.log('='.repeat(80));
    
    if (foundCorrectPool) {
        console.log('\n🎉 SUCCESS! Index 1 extraction works for CPMM!');
    } else if (tested === 0) {
        console.log('\n⚠️  No CPMM swap transactions found - these might be other operations (LP add/remove, etc.)');
    } else {
        console.log('\n⚠️  Extraction working but not finding correct pool - may need to check index position');
    }
    
    return { tested, success, failed, foundCorrectPool };
}

testCPMMPool().catch(console.error);





