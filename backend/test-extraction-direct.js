/**
 * Direct test: Fetch a known Raydium swap transaction and test extraction
 */

import { extractRaydiumPoolFromIx, buildCombinedKeys } from './services/SwapDetectionHelpers.mjs';
import { Connection, PublicKey } from '@solana/web3.js';
import RaydiumPoolDecoder from './services/RaydiumPoolDecoder.mjs';
import RaydiumCPMMDecoder from './services/RaydiumCPMMDecoder.mjs';
import RaydiumCLMMDecoder from './services/RaydiumCLMMDecoder.mjs';

const CONSTANT_K_RPC = 'https://rpc.constant-k.com/?api-key=tsn41k3y-4qch-46f2-5ogr-67dmw2zh1ur8';
const RAYDIUM_AMM = '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8';
const RAYDIUM_CPMM = 'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C';
const RAYDIUM_CLMM = 'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK';
const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';

// Known active Raydium pool (SOL/USDC on Raydium AMM)
const TEST_POOL = '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2'; // SOL/USDC Raydium AMM

async function fetchRecentSwap() {
    console.log('🔍 Fetching recent Raydium swap transaction...\n');
    
    const connection = new Connection(CONSTANT_K_RPC, 'confirmed');
    
    // Get recent signatures for the pool
    try {
        const poolPubkey = new PublicKey(TEST_POOL);
        const signatures = await connection.getSignaturesForAddress(
            poolPubkey,
            { limit: 10 }
        );
        
        if (signatures.length === 0) {
            console.log('❌ No recent transactions found for test pool');
            return null;
        }
        
        console.log(`✅ Found ${signatures.length} recent transactions\n`);
        
        // Try multiple transactions until we find one with Raydium
        for (let sigIdx = 0; sigIdx < Math.min(10, signatures.length); sigIdx++) {
            const txSig = signatures[sigIdx].signature;
            console.log(`📊 Fetching transaction ${sigIdx + 1}/${Math.min(10, signatures.length)}: ${txSig.substring(0, 16)}...`);
            
            const tx = await connection.getTransaction(txSig, {
                maxSupportedTransactionVersion: 0,
                commitment: 'confirmed'
            });
            
            if (!tx) {
                console.log('   ❌ Failed to fetch, trying next...');
                continue;
            }
            
            // Quick check: does this transaction have Raydium?
            const message = tx.transaction?.message ?? {};
            if (message.staticAccountKeys && !message.accountKeys) {
                message.accountKeys = message.staticAccountKeys;
            }
            if (message.compiledInstructions && !message.instructions) {
                message.instructions = message.compiledInstructions;
            }
            const { combined } = buildCombinedKeys(message);
            const instructions = message.instructions || [];
            let hasRaydium = false;
            for (const ix of instructions) {
                if (ix.programIdIndex !== undefined) {
                    const progId = combined[ix.programIdIndex];
                    if (progId === RAYDIUM_AMM || progId === RAYDIUM_CPMM || progId === RAYDIUM_CLMM) {
                        hasRaydium = true;
                        break;
                    }
                }
            }
            
            if (hasRaydium) {
                console.log(`   ✅ Found Raydium instruction!`);
                return { tx, signature: txSig };
            } else {
                console.log(`   ⏭️  No Raydium, trying next...`);
            }
        }
        
        console.log('❌ No transactions with Raydium found');
        return null;
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        return null;
    }
}

async function testExtraction() {
    console.log('🧪 DIRECT TEST: Pool Extraction on Real Transaction\n');
    console.log('='.repeat(80));
    
    const result = await fetchRecentSwap();
    if (!result) {
        console.log('❌ Could not fetch transaction for testing');
        process.exit(1);
    }
    
    const { tx, signature } = result;
    console.log(`✅ Transaction fetched: ${signature.substring(0, 16)}...\n`);
    
    // Check transaction structure
    if (!tx.transaction || !tx.transaction.message) {
        console.log('\n❌ Invalid transaction structure');
        console.log('   Available keys:', Object.keys(tx).join(', '));
        process.exit(1);
    }
    
    // Convert to the format our functions expect
    const txWrapper = {
        transaction: {
            message: tx.transaction.message,
            signatures: tx.transaction.signatures
        },
        meta: tx.meta
    };
    
    // Normalize v0 transaction format
    const message = tx.transaction.message;
    
    // v0 transactions use staticAccountKeys instead of accountKeys
    if (message.staticAccountKeys && !message.accountKeys) {
        message.accountKeys = message.staticAccountKeys;
    }
    
    // v0 transactions use compiledInstructions instead of instructions
    if (message.compiledInstructions && !message.instructions) {
        message.instructions = message.compiledInstructions;
    }
    
    const { combined } = buildCombinedKeys(message);
    const instructions = message.instructions || [];
    
    // Get token accounts and mints for analysis
    const tokenAccounts = new Set();
    const tokenMints = new Set();
    const meta = tx.meta || {};
    const preTokenBalances = meta.preTokenBalances || [];
    const postTokenBalances = meta.postTokenBalances || [];
    [...preTokenBalances, ...postTokenBalances].forEach(bal => {
        if (bal.accountIndex !== undefined && bal.accountIndex < combined.length) {
            tokenAccounts.add(combined[bal.accountIndex]);
        }
        if (bal.mint) {
            tokenMints.add(bal.mint);
        }
    });
    const numSig = message?.header?.numRequiredSignatures ?? 0;
    
    console.log('📋 Analyzing transaction structure:\n');
    console.log(`   Total instructions: ${instructions.length}`);
    console.log(`   Total accounts: ${combined.length}`);
    console.log(`   Static accounts: ${message.accountKeys?.length || 0}`);
    console.log(`   Loaded addresses: ${message.loadedAddresses ? (message.loadedAddresses.writable?.length || 0) + (message.loadedAddresses.readonly?.length || 0) : 0}`);
    console.log(`   Signers: ${numSig}`);
    console.log(`   Token accounts: ${tokenAccounts.size}`);
    console.log(`   Token mints: ${tokenMints.size}`);
    
    let raydiumProgram = null;
    let raydiumIx = null;
    
    for (let i = 0; i < instructions.length; i++) {
        const ix = instructions[i];
        if (ix.programIdIndex !== undefined) {
            const progId = combined[ix.programIdIndex];
            if (progId === RAYDIUM_AMM || progId === RAYDIUM_CPMM || progId === RAYDIUM_CLMM) {
                raydiumProgram = progId;
                raydiumIx = ix;
                console.log(`\n✅ Found Raydium instruction at index ${i}:`);
                console.log(`   Program: ${progId === RAYDIUM_AMM ? 'AMM' : progId === RAYDIUM_CPMM ? 'CPMM' : 'CLMM'}`);
                break;
            }
        }
    }
    
    if (!raydiumProgram || !raydiumIx) {
        console.log('\n❌ No Raydium instruction found in transaction');
        console.log('   Programs found:');
        instructions.forEach((ix, i) => {
            if (ix.programIdIndex !== undefined) {
                console.log(`   [${i}] ${combined[ix.programIdIndex]?.substring(0, 16)}...`);
            }
        });
        process.exit(1);
    }
    
    console.log(`\n📋 Instruction structure:`);
    console.log(`   programIdIndex: ${raydiumIx.programIdIndex}`);
    console.log(`   accounts type: ${typeof raydiumIx.accounts}`);
    console.log(`   accounts isArray: ${Array.isArray(raydiumIx.accounts)}`);
    console.log(`   accounts length: ${Array.isArray(raydiumIx.accounts) ? raydiumIx.accounts.length : 'N/A'}`);
    console.log(`   accountKeyIndexes: ${Array.isArray(raydiumIx.accountKeyIndexes) ? `Array[${raydiumIx.accountKeyIndexes.length}]` : typeof raydiumIx.accountKeyIndexes}`);
    console.log(`   accountKeys: ${Array.isArray(raydiumIx.accountKeys) ? `Array[${raydiumIx.accountKeys.length}]` : typeof raydiumIx.accountKeys}`);
    console.log(`   accountMetas: ${Array.isArray(raydiumIx.accountMetas) ? `Array[${raydiumIx.accountMetas.length}]` : typeof raydiumIx.accountMetas}`);
    console.log(`   All keys: ${Object.keys(raydiumIx).join(', ')}`);
    
    if (Array.isArray(raydiumIx.accounts) && raydiumIx.accounts.length > 0) {
        console.log(`\n   accounts[0-5]: ${raydiumIx.accounts.slice(0, 6).join(', ')}`);
        raydiumIx.accounts.slice(0, 3).forEach((idx, i) => {
            if (combined[idx]) {
                console.log(`   combined[accounts[${i}]] = ${combined[idx].substring(0, 16)}...`);
            }
        });
    }
    
    if (Array.isArray(raydiumIx.accountKeyIndexes) && raydiumIx.accountKeyIndexes.length > 0) {
        console.log(`\n   All accountKeyIndexes: ${raydiumIx.accountKeyIndexes.join(', ')}`);
        console.log(`\n   All accounts in instruction:`);
        raydiumIx.accountKeyIndexes.forEach((idx, i) => {
            if (combined[idx]) {
                const addr = combined[idx];
                const isSigner = i < numSig;
                const isToken = tokenAccounts.has(addr) || tokenMints.has(addr);
                const isSystem = addr === '11111111111111111111111111111111' || 
                                 addr === 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' ||
                                 addr === TOKEN_PROGRAM;
                const isKnownPool = addr === TEST_POOL || addr === '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2';
                console.log(`   [${i}] idx=${idx}: ${addr} (signer=${isSigner}, token=${isToken}, system=${isSystem}, knownPool=${isKnownPool})`);
            }
        });
    }
    
    // Test extraction
    console.log(`\n🔧 Testing extraction...`);
    const extractedPool = extractRaydiumPoolFromIx(txWrapper, raydiumProgram);
    
    console.log(`   Extracted: ${extractedPool || 'null'}`);
    
    if (!extractedPool) {
        console.log(`\n❌ EXTRACTION FAILED`);
        console.log(`   This means the instruction format is different than expected`);
        process.exit(1);
    }
    
    // Test decoder
    const programName = raydiumProgram === RAYDIUM_AMM ? 'AMM' : raydiumProgram === RAYDIUM_CPMM ? 'CPMM' : 'CLMM';
    const decoder = raydiumProgram === RAYDIUM_AMM 
        ? new RaydiumPoolDecoder(CONSTANT_K_RPC)
        : raydiumProgram === RAYDIUM_CPMM
        ? new RaydiumCPMMDecoder(CONSTANT_K_RPC)
        : new RaydiumCLMMDecoder(CONSTANT_K_RPC);
    
    // First, check account info to see what we extracted
    const connection = new Connection(CONSTANT_K_RPC, 'confirmed');
    try {
        const accountInfo = await connection.getAccountInfo(new PublicKey(extractedPool));
        if (accountInfo) {
            console.log(`\n📋 Extracted address account info:`);
            console.log(`   Owner: ${accountInfo.owner.toBase58()}`);
            console.log   (`   Executable: ${accountInfo.executable}`);
            console.log(`   Lamports: ${accountInfo.lamports}`);
            console.log(`   Data length: ${accountInfo.data.length} bytes`);
            
            const isRaydiumOwned = raydiumProgram === RAYDIUM_AMM 
                ? accountInfo.owner.toBase58() === RAYDIUM_AMM
                : raydiumProgram === RAYDIUM_CPMM
                ? accountInfo.owner.toBase58() === RAYDIUM_CPMM
                : accountInfo.owner.toBase58() === RAYDIUM_CLMM;
            
            console.log(`   Is Raydium-owned: ${isRaydiumOwned}`);
            
            if (!isRaydiumOwned) {
                console.log(`\n⚠️  Extracted address is NOT owned by Raydium - it's a different account type`);
                console.log(`   This might be a user account, token account, or another program account`);
            }
        } else {
            console.log(`\n❌ Extracted address does not exist on-chain`);
        }
    } catch (err) {
        console.log(`\n❌ Error checking account: ${err.message}`);
    }
    
    console.log(`\n🔧 Testing ${programName} decoder...`);
    const poolData = await decoder.decodePoolState(extractedPool);
    
    if (poolData) {
        console.log(`\n✅ SUCCESS! Pool decoded successfully:`);
        const vault = poolData.baseVault || poolData.token0Vault || poolData.vaultA;
        const vault2 = poolData.quoteVault || poolData.token1Vault || poolData.vaultB;
        console.log(`   Pool: ${extractedPool.substring(0, 16)}...`);
        console.log(`   Vault 1: ${vault?.substring(0, 16)}...`);
        console.log(`   Vault 2: ${vault2?.substring(0, 16)}...`);
        console.log(`\n🎉 Extraction and decoding working correctly!`);
    } else {
        console.log(`\n⚠️  Decoder failed - extracted address might not be the pool`);
        console.log(`   Extracted: ${extractedPool.substring(0, 16)}...`);
        console.log(`   (This address might be a different account type)`);
    }
}

testExtraction().catch(console.error);

