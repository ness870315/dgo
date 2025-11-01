/**
 * Find the correct account index for pool address in AMM and CPMM
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { buildCombinedKeys } from './services/SwapDetectionHelpers.mjs';
import RaydiumPoolDecoder from './services/RaydiumPoolDecoder.mjs';
import RaydiumCPMMDecoder from './services/RaydiumCPMMDecoder.mjs';

const CONSTANT_K_RPC = 'https://rpc.constant-k.com/?api-key=tsn41k3y-4qch-46f2-5ogr-67dmw2zh1ur8';
const RAYDIUM_AMM = '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8';
const RAYDIUM_CPMM = 'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C';

const TEST_POOLS = {
    AMM: '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2',
    CPMM: 'Q2sPHPdUWFMg7M7wwrQKLrn619cAucfRsmhVJffodSp',
};

async function findPoolIndex(poolType, poolAddress, programId, decoder) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`🔍 FINDING CORRECT INDEX FOR ${poolType}`);
    console.log(`${'='.repeat(80)}`);
    console.log(`📦 Target Pool: ${poolAddress}\n`);
    
    const connection = new Connection(CONSTANT_K_RPC, 'confirmed');
    
    // Pre-cache pool
    await decoder.decodePoolState(poolAddress);
    
    // Get transactions
    const poolPubkey = new PublicKey(poolAddress);
    const signatures = await connection.getSignaturesForAddress(poolPubkey, { limit: 20 });
    
    console.log(`✅ Found ${signatures.length} transactions\n`);
    
    // Test transactions
    for (let sigIdx = 0; sigIdx < Math.min(5, signatures.length); sigIdx++) {
        const txSig = signatures[sigIdx].signature;
        
        if (sigIdx > 0) {
            await new Promise(resolve => setTimeout(resolve, 300));
        }
        
        const tx = await connection.getTransaction(txSig, {
            maxSupportedTransactionVersion: 0,
            commitment: 'confirmed'
        });
        
        if (!tx || !tx.transaction || !tx.transaction.message) continue;
        
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
        
        // Find program instruction
        let programIx = null;
        let programIxIndex = -1;
        for (let i = 0; i < instructions.length; i++) {
            const ix = instructions[i];
            if (ix.programIdIndex !== undefined && combined[ix.programIdIndex] === programId) {
                programIx = ix;
                programIxIndex = i;
                break;
            }
        }
        
        if (!programIx) {
            console.log(`   ⚠️  No ${poolType} instruction found in this transaction`);
            continue;
        }
        
        console.log(`   ✅ Found ${poolType} instruction at instruction index ${programIxIndex}`);
        
        console.log(`\n📊 Transaction: ${txSig.substring(0, 16)}...`);
        
        // Get account indices
        let accountIndices = [];
        if (Array.isArray(programIx.accounts) && programIx.accounts.length > 0) {
            accountIndices = programIx.accounts;
        } else if (Array.isArray(programIx.accountKeyIndexes) && programIx.accountKeyIndexes.length > 0) {
            accountIndices = programIx.accountKeyIndexes;
        } else {
            console.log('   ❌ No account indices');
            continue;
        }
        
        console.log(`   📋 ${accountIndices.length} accounts in instruction`);
        console.log(`   🔍 Searching for pool address...`);
        console.log(`   📋 Account indices: ${accountIndices.slice(0, 10).join(', ')}${accountIndices.length > 10 ? '...' : ''}\n`);
        
        // Check each account
        let foundInInstruction = false;
        for (let i = 0; i < accountIndices.length; i++) {
            const accIdx = accountIndices[i];
            
            if (accIdx < 0 || accIdx >= combined.length) {
                continue;
            }
            
            const accountAddress = combined[accIdx];
            if (!accountAddress || typeof accountAddress !== 'string') continue;
            
            if (accountAddress === poolAddress) {
                console.log(`   ✅ FOUND POOL AT INDEX ${i} (idx=${accIdx})!`);
                console.log(`      This is the correct extraction position for ${poolType}\n`);
                foundInInstruction = true;
                return { success: true, index: i, poolAddress: accountAddress };
            }
        }
        
        if (!foundInInstruction) {
            console.log(`   ❌ Pool not found in this transaction's ${poolType} instruction accounts`);
            console.log(`   💡 This transaction might not be a swap, or uses a different instruction format`);
            
            // Show what we did find
            console.log(`   📋 Checking all accounts in transaction...`);
            let foundInTx = false;
            for (let i = 0; i < combined.length; i++) {
                if (combined[i] === poolAddress) {
                    console.log(`   ✅ Pool found in transaction at combined[${i}], but not in ${poolType} instruction`);
                    foundInTx = true;
                }
            }
            if (!foundInTx) {
                console.log(`   ❌ Pool not found anywhere in transaction`);
            }
        }
    }
    
    console.log(`\n❌ Could not find pool in any transaction`);
    return { success: false };
}

async function main() {
    console.log('🧪 FINDING CORRECT POOL INDEX FOR AMM AND CPMM\n');
    
    const ammDecoder = new RaydiumPoolDecoder(CONSTANT_K_RPC);
    const cpmmDecoder = new RaydiumCPMMDecoder(CONSTANT_K_RPC);
    
    console.log('\n🔍 Testing AMM...');
    const ammResult = await findPoolIndex('AMM', TEST_POOLS.AMM, RAYDIUM_AMM, ammDecoder);
    
    console.log('\n🔍 Testing CPMM...');
    const cpmmResult = await findPoolIndex('CPMM', TEST_POOLS.CPMM, RAYDIUM_CPMM, cpmmDecoder);
    
    console.log('\n' + '='.repeat(80));
    console.log('📊 SUMMARY');
    console.log('='.repeat(80));
    
    if (ammResult.success) {
        console.log(`✅ AMM: Pool found at instruction account index ${ammResult.index}`);
    } else {
        console.log(`❌ AMM: Could not find pool`);
    }
    
    if (cpmmResult.success) {
        console.log(`✅ CPMM: Pool found at instruction account index ${cpmmResult.index}`);
    } else {
        console.log(`❌ CPMM: Could not find pool`);
    }
    
    return { ammResult, cpmmResult };
}

main().catch(console.error);

