/**
 * Test pool extraction for ALL Raydium pool types: AMM, CPMM, CLMM
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { extractRaydiumPoolFromIx, buildCombinedKeys } from './services/SwapDetectionHelpers.mjs';
import RaydiumPoolDecoder from './services/RaydiumPoolDecoder.mjs';
import RaydiumCPMMDecoder from './services/RaydiumCPMMDecoder.mjs';
import RaydiumCLMMDecoder from './services/RaydiumCLMMDecoder.mjs';

const CONSTANT_K_RPC = 'https://rpc.constant-k.com/?api-key=tsn41k3y-4qch-46f2-5ogr-67dmw2zh1ur8';
const RAYDIUM_AMM = '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8';
const RAYDIUM_CPMM = 'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C';
const RAYDIUM_CLMM = 'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK';

// Known pools for each type
const TEST_POOLS = {
    AMM: '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2', // SOL/USDC Raydium AMM
    CPMM: 'Q2sPHPdUWFMg7M7wwrQKLrn619cAucfRsmhVJffodSp', // USELESS CPMM pool
    CLMM: 'Dn8MW6qFVMTafFvkP71PbHmhUJF91QM3JZsTeKAMWjqv', // Known CLMM pool
};

async function testPoolType(poolType, poolAddress, programId, decoder) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`🧪 TESTING ${poolType} POOL TYPE`);
    console.log(`${'='.repeat(80)}`);
    console.log(`📦 Pool: ${poolAddress.substring(0, 24)}...`);
    console.log(`📦 Program: ${programId.substring(0, 24)}...\n`);
    
    const connection = new Connection(CONSTANT_K_RPC, 'confirmed');
    
    // Pre-cache pool
    console.log('📦 Pre-caching pool...');
    await decoder.decodePoolState(poolAddress);
    console.log('✅ Pool cached\n');
    
    // Get recent transactions
    console.log('📡 Fetching recent transactions...');
    const poolPubkey = new PublicKey(poolAddress);
    const signatures = await connection.getSignaturesForAddress(poolPubkey, { limit: 30 });
    
    if (signatures.length === 0) {
        console.log('❌ No transactions found');
        return { tested: 0, success: 0, failed: 0 };
    }
    
    console.log(`✅ Found ${signatures.length} transactions\n`);
    
    let tested = 0;
    let success = 0;
    let failed = 0;
    let foundCorrectPool = false;
    
    // Test transactions
    for (let sigIdx = 0; sigIdx < Math.min(10, signatures.length); sigIdx++) {
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
        
        // Check for correct program
        let hasProgram = false;
        for (const ix of instructions) {
            if (ix.programIdIndex !== undefined && combined[ix.programIdIndex] === programId) {
                hasProgram = true;
                break;
            }
        }
        
        if (!hasProgram) {
            continue;
        }
        
        tested++;
        console.log(`📊 [${tested}] Testing: ${txSig.substring(0, 16)}...`);
        
        // Test extraction
        const txWrapper = {
            transaction: {
                message: tx.transaction.message,
                signatures: tx.transaction.signatures
            },
            meta: tx.meta
        };
        
        const extractedPool = extractRaydiumPoolFromIx(txWrapper, programId);
        
        if (!extractedPool) {
            console.log(`   ❌ Extraction returned null`);
            failed++;
            continue;
        }
        
        console.log(`   📍 Extracted: ${extractedPool.substring(0, 32)}...`);
        
        // Verify it's a valid pool
        await new Promise(resolve => setTimeout(resolve, 300));
        const poolData = await decoder.decodePoolState(extractedPool);
        
        if (poolData) {
            const isCorrect = extractedPool === poolAddress;
            console.log(`   ✅ Valid ${poolType} pool! ${isCorrect ? '(CORRECT POOL ✓)' : '(different pool)'}`);
            success++;
            if (isCorrect) {
                foundCorrectPool = true;
            }
        } else {
            console.log(`   ❌ Not a valid pool`);
            failed++;
        }
    }
    
    console.log(`\n📊 ${poolType} RESULTS:`);
    console.log(`   Tested: ${tested}`);
    console.log(`   Success: ${success} (${tested > 0 ? ((success/tested)*100).toFixed(1) : 0}%)`);
    console.log(`   Failed: ${failed}`);
    console.log(`   Found correct pool: ${foundCorrectPool ? '✅' : '❌'}`);
    
    return { tested, success, failed, foundCorrectPool };
}

async function testAllPoolTypes() {
    console.log('🧪 COMPREHENSIVE TEST: ALL RAYDIUM POOL TYPES\n');
    console.log('Testing pool extraction for AMM, CPMM, and CLMM\n');
    
    const ammDecoder = new RaydiumPoolDecoder(CONSTANT_K_RPC);
    const cpmmDecoder = new RaydiumCPMMDecoder(CONSTANT_K_RPC);
    const clmmDecoder = new RaydiumCLMMDecoder(CONSTANT_K_RPC);
    
    const results = {};
    
    // Test AMM
    results.AMM = await testPoolType('AMM', TEST_POOLS.AMM, RAYDIUM_AMM, ammDecoder);
    
    // Test CPMM
    results.CPMM = await testPoolType('CPMM', TEST_POOLS.CPMM, RAYDIUM_CPMM, cpmmDecoder);
    
    // Test CLMM
    results.CLMM = await testPoolType('CLMM', TEST_POOLS.CLMM, RAYDIUM_CLMM, clmmDecoder);
    
    // Summary
    console.log('\n' + '='.repeat(80));
    console.log('📊 FINAL SUMMARY');
    console.log('='.repeat(80));
    
    for (const [type, result] of Object.entries(results)) {
        const rate = result.tested > 0 ? ((result.success / result.tested) * 100).toFixed(1) : 0;
        const status = result.foundCorrectPool ? '✅' : result.tested > 0 ? '⚠️' : '❌';
        console.log(`${status} ${type}: ${result.success}/${result.tested} (${rate}%) - Correct pool found: ${result.foundCorrectPool}`);
    }
    
    const allCorrect = Object.values(results).every(r => r.foundCorrectPool);
    const allHaveTests = Object.values(results).every(r => r.tested > 0);
    
    if (allCorrect && allHaveTests) {
        console.log('\n🎉 ALL POOL TYPES WORKING! Index 1 extraction works for AMM, CPMM, and CLMM!');
    } else {
        console.log('\n⚠️  Some pool types may need adjustment');
    }
    
    return results;
}

testAllPoolTypes().catch(console.error);





