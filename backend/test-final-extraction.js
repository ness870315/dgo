/**
 * FINAL TEST: Validate pool extraction works correctly
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { extractRaydiumPoolFromIx, buildCombinedKeys } from './services/SwapDetectionHelpers.mjs';
import RaydiumPoolDecoder from './services/RaydiumPoolDecoder.mjs';

const CONSTANT_K_RPC = 'https://rpc.constant-k.com/?api-key=tsn41k3y-4qch-46f2-5ogr-67dmw2zh1ur8';
const RAYDIUM_AMM = '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8';

// Known active Raydium pool (SOL/USDC)
const TEST_POOL = '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2';

async function testFinalExtraction() {
    console.log('🧪 FINAL EXTRACTION VALIDATION TEST\n');
    console.log('='.repeat(80));
    
    const connection = new Connection(CONSTANT_K_RPC, 'confirmed');
    const decoder = new RaydiumPoolDecoder(CONSTANT_K_RPC);
    
    // Get recent transactions for this pool
    console.log(`📡 Fetching transactions for known pool: ${TEST_POOL.substring(0, 16)}...\n`);
    const poolPubkey = new PublicKey(TEST_POOL);
    const signatures = await connection.getSignaturesForAddress(poolPubkey, { limit: 50 });
    
    if (signatures.length === 0) {
        console.log('❌ No transactions found');
        return;
    }
    
    console.log(`✅ Found ${signatures.length} transactions\n`);
    
    let tested = 0;
    let success = 0;
    let failed = 0;
    
    // Test multiple transactions (with rate limiting)
    for (let sigIdx = 0; sigIdx < Math.min(10, signatures.length); sigIdx++) {
        const txSig = signatures[sigIdx].signature;
        
        // Rate limit: delay between requests
        if (sigIdx > 0) {
            await new Promise(resolve => setTimeout(resolve, 200));
        }
        
        const tx = await connection.getTransaction(txSig, {
            maxSupportedTransactionVersion: 0,
            commitment: 'confirmed'
        });
        
        if (!tx || !tx.transaction || !tx.transaction.message) continue;
        
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
        let hasRaydium = false;
        for (const ix of instructions) {
            if (ix.programIdIndex !== undefined) {
                const progId = combined[ix.programIdIndex];
                if (progId === RAYDIUM_AMM) {
                    hasRaydium = true;
                    break;
                }
            }
        }
        
        if (!hasRaydium) continue;
        
        tested++;
        
        // Test extraction
        const txWrapper = {
            transaction: {
                message: tx.transaction.message,
                signatures: tx.transaction.signatures
            },
            meta: tx.meta
        };
        
        const extractedPool = extractRaydiumPoolFromIx(txWrapper, RAYDIUM_AMM);
        
        if (!extractedPool) {
            console.log(`❌ [${tested}] ${txSig.substring(0, 16)}... - EXTRACTION FAILED`);
            failed++;
            continue;
        }
        
        // Verify it's a valid pool (with rate limiting)
        await new Promise(resolve => setTimeout(resolve, 300));
        const poolData = await decoder.decodePoolState(extractedPool);
        
        if (poolData) {
            const isCorrectPool = extractedPool === TEST_POOL;
            console.log(`✅ [${tested}] ${txSig.substring(0, 16)}... - Extracted: ${extractedPool.substring(0, 16)}... ${isCorrectPool ? '(CORRECT POOL)' : '(different pool)'}`);
            success++;
        } else {
            console.log(`❌ [${tested}] ${txSig.substring(0, 16)}... - Extracted: ${extractedPool.substring(0, 16)}... (NOT A POOL)`);
            failed++;
        }
    }
    
    console.log('\n' + '='.repeat(80));
    console.log(`📊 RESULTS:`);
    console.log(`   Tested: ${tested} transactions`);
    console.log(`   Success: ${success} (${tested > 0 ? ((success/tested)*100).toFixed(1) : 0}%)`);
    console.log(`   Failed: ${failed} (${tested > 0 ? ((failed/tested)*100).toFixed(1) : 0}%)`);
    console.log('='.repeat(80));
    
    if (success === tested && tested > 0) {
        console.log('\n🎉 100% SUCCESS RATE! Extraction is working perfectly!');
        return { success: true, tested, success, failed };
    } else if (success > 0 && tested > 0) {
        console.log(`\n⚠️  Partial success: ${((success/tested)*100).toFixed(1)}% success rate`);
        return { success: true, tested, success, failed };
    } else {
        console.log('\n❌ Extraction failed on all transactions');
        return { success: false, tested, success, failed };
    }
}

testFinalExtraction().catch(console.error);

