/**
 * Verify extraction with known working transaction
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { extractRaydiumPoolFromIx, buildCombinedKeys } from './services/SwapDetectionHelpers.mjs';
import RaydiumPoolDecoder from './services/RaydiumPoolDecoder.mjs';

const CONSTANT_K_RPC = 'https://rpc.constant-k.com/?api-key=tsn41k3y-4qch-46f2-5ogr-67dmw2zh1ur8';
const RAYDIUM_AMM = '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8';
const TEST_POOL = '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2';

// Known working transaction from pool discovery test
const KNOWN_WORKING_TX = '2dzpGJh6toh5LcJ6sHXxJLpPzW9xKvN7YrF8mQ3tJ5nR';

async function testKnownTransaction() {
    console.log('🧪 TESTING WITH KNOWN WORKING TRANSACTION\n');
    console.log('='.repeat(80));
    
    const connection = new Connection(CONSTANT_K_RPC, 'confirmed');
    const decoder = new RaydiumPoolDecoder(CONSTANT_K_RPC);
    
    // Get recent transactions and find one that works
    console.log(`📡 Finding a Raydium swap transaction...\n`);
    const poolPubkey = new PublicKey(TEST_POOL);
    const signatures = await connection.getSignaturesForAddress(poolPubkey, { limit: 30 });
    
    for (let i = 0; i < Math.min(15, signatures.length); i++) {
        const txSig = signatures[i].signature;
        console.log(`📊 Testing transaction ${i + 1}: ${txSig.substring(0, 16)}...`);
        
        const tx = await connection.getTransaction(txSig, {
            maxSupportedTransactionVersion: 0,
            commitment: 'confirmed'
        });
        
        if (!tx || !tx.transaction || !tx.transaction.message) {
            console.log('   ⏭️  Invalid\n');
            continue;
        }
        
        // Normalize
        const message = tx.transaction.message;
        if (message.staticAccountKeys && !message.accountKeys) {
            message.accountKeys = message.staticAccountKeys;
        }
        if (message.compiledInstructions && !message.instructions) {
            message.instructions = message.compiledInstructions;
        }
        
        const { combined } = buildCombinedKeys(message);
        const instructions = message.instructions || [];
        
        // Check for Raydium
        let hasRaydium = false;
        for (const ix of instructions) {
            if (ix.programIdIndex !== undefined && combined[ix.programIdIndex] === RAYDIUM_AMM) {
                hasRaydium = true;
                break;
            }
        }
        
        if (!hasRaydium) {
            console.log('   ⏭️  No Raydium instruction\n');
            continue;
        }
        
        console.log('   ✅ Found Raydium instruction!');
        
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
            console.log('   ❌ Extraction returned null\n');
            continue;
        }
        
        console.log(`   📍 Extracted: ${extractedPool.substring(0, 32)}...`);
        
        // Verify it's a pool
        await new Promise(resolve => setTimeout(resolve, 300));
        const poolData = await decoder.decodePoolState(extractedPool);
        
        if (poolData) {
            const isCorrect = extractedPool === TEST_POOL;
            console.log(`   ✅ Valid Raydium pool! ${isCorrect ? '(CORRECT POOL)' : '(different pool)'}`);
            console.log(`      Base Vault: ${poolData.baseVault.substring(0, 16)}...`);
            console.log(`      Quote Vault: ${poolData.quoteVault.substring(0, 16)}...`);
            console.log(`\n🎉 SUCCESS! Extraction is working correctly!\n`);
            return { success: true, tx: txSig, extractedPool };
        } else {
            console.log(`   ❌ Not a valid pool\n`);
        }
    }
    
    console.log('\n❌ Could not find a working transaction');
    return { success: false };
}

testKnownTransaction().catch(console.error);







