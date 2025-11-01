/**
 * DIRECT TEST: USELESS CPMM swaps
 * Query token mint address to find actual swap transactions
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { extractRaydiumPoolFromIx, buildCombinedKeys } from './services/SwapDetectionHelpers.mjs';
import RaydiumCPMMDecoder from './services/RaydiumCPMMDecoder.mjs';

const CONSTANT_K_RPC = 'https://rpc.constant-k.com/?api-key=tsn41k3y-4qch-46f2-5ogr-67dmw2zh1ur8';
const RAYDIUM_CPMM = 'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C';

// USELESS token and CPMM pool
const USELESS_MINT = 'Dz9mQ9NzkBcCsuGPFJ3r1bS4wgqKMHBPiVuniW8Mbonk';
const USELESS_POOL = 'Q2sPHPdUWFMg7M7wwrQKLrn619cAucfRsmhVJffodSp';

async function testUSELESSCPMMSwaps() {
    console.log('🧪 DIRECT TEST: USELESS CPMM SWAP TRANSACTIONS\n');
    console.log('='.repeat(80));
    console.log(`📦 Token Mint: ${USELESS_MINT}`);
    console.log(`📦 CPMM Pool:  ${USELESS_POOL}`);
    console.log('='.repeat(80));
    
    const connection = new Connection(CONSTANT_K_RPC, 'confirmed');
    const decoder = new RaydiumCPMMDecoder(CONSTANT_K_RPC);
    
    // Pre-cache pool
    console.log('\n📦 Pre-caching CPMM pool...');
    await decoder.decodePoolState(USELESS_POOL);
    console.log('✅ Pool cached\n');
    
    // Query TOKEN MINT address - this will give us actual swaps!
    console.log('📡 Fetching transactions for TOKEN MINT (will find swaps)...');
    const mintPubkey = new PublicKey(USELESS_MINT);
    const signatures = await connection.getSignaturesForAddress(mintPubkey, { limit: 200 });
    
    console.log(`✅ Found ${signatures.length} transactions\n`);
    
    let tested = 0;
    let success = 0;
    let failed = 0;
    let foundCorrectPool = false;
    let noCPMMInstruction = 0;
    let poolFoundInTx = 0;
    
    // Test transactions
    for (let sigIdx = 0; sigIdx < Math.min(100, signatures.length); sigIdx++) {
        const txSig = signatures[sigIdx].signature;
        
        // Rate limit
        if (sigIdx > 0) {
            await new Promise(resolve => setTimeout(resolve, 200));
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
        let instructions = message.instructions || [];
        
        // Check for inner instructions (v0 transactions)
        if (tx.meta?.innerInstructions && tx.meta.innerInstructions.length > 0) {
            for (const innerIxGroup of tx.meta.innerInstructions) {
                if (innerIxGroup.instructions && Array.isArray(innerIxGroup.instructions)) {
                    // Add inner instructions to check
                    innerIxGroup.instructions.forEach(innerIx => {
                        if (innerIx.programIdIndex !== undefined) {
                            instructions.push(innerIx);
                        }
                    });
                }
            }
        }
        
        // Check for CPMM program OR Jupiter (which routes to CPMM)
        const JUPITER_AGG = 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4';
        let hasCPMM = false;
        let cpmmInstruction = null;
        let hasJupiter = false;
        
        for (const ix of instructions) {
            if (ix.programIdIndex !== undefined) {
                const progId = combined[ix.programIdIndex];
                if (progId === RAYDIUM_CPMM) {
                    hasCPMM = true;
                    cpmmInstruction = ix;
                    break;
                } else if (progId === JUPITER_AGG) {
                    hasJupiter = true;
                    // Jupiter routes to CPMM, check inner instructions or accounts
                }
            }
        }
        
        // If Jupiter or other aggregator, check if CPMM pool is in accounts
        if (!hasCPMM && (hasJupiter || combined.some(addr => addr === USELESS_POOL))) {
            // Check if CPMM pool is in the transaction accounts
            for (let i = 0; i < combined.length; i++) {
                if (combined[i] === USELESS_POOL) {
                    console.log(`   💡 Found CPMM pool in transaction at combined[${i}]`);
                    
                    // Find which instruction contains this account
                    for (const ix of instructions) {
                        if (ix.programIdIndex !== undefined) {
                            let accIdxs = [];
                            if (Array.isArray(ix.accounts) && ix.accounts.length > 0) {
                                accIdxs = ix.accounts;
                            } else if (Array.isArray(ix.accountKeyIndexes) && ix.accountKeyIndexes.length > 0) {
                                accIdxs = ix.accountKeyIndexes;
                            }
                            
                            // Check if pool index is in this instruction
                            if (accIdxs.includes(i)) {
                                const progId = combined[ix.programIdIndex];
                                console.log(`      Pool is in instruction for program: ${progId.substring(0, 16)}...`);
                                
                                // If it's not CPMM directly, it might be routed through aggregator
                                // But we can still test extraction by treating it as if it's a CPMM instruction
                                if (progId === JUPITER_AGG || progId === RAYDIUM_CPMM) {
                                    cpmmInstruction = ix;
                                    hasCPMM = true; // Test extraction anyway
                                    console.log(`      ✅ Will test extraction from this instruction`);
                                    break;
                                }
                            }
                        }
                    }
                    break;
                }
            }
        }
        
        // Even if no direct CPMM instruction, check if pool is in transaction
        const poolInTx = combined.some(addr => addr === USELESS_POOL);
        if (poolInTx && !hasCPMM) {
            poolFoundInTx++;
            console.log(`\n💡 [${sigIdx + 1}] ${txSig.substring(0, 16)}... - Pool found in TX! (${poolFoundInTx} found so far)`);
            
            // Find where pool is in the accounts
            for (let i = 0; i < combined.length; i++) {
                if (combined[i] === USELESS_POOL) {
                    console.log(`   📍 Pool at combined[${i}]`);
                    
                    // Find which instruction contains this index
                    for (const ix of instructions) {
                        let accIdxs = [];
                        if (Array.isArray(ix.accounts) && ix.accounts.length > 0) {
                            accIdxs = ix.accounts;
                        } else if (Array.isArray(ix.accountKeyIndexes) && ix.accountKeyIndexes.length > 0) {
                            accIdxs = ix.accountKeyIndexes;
                        }
                        
                        if (accIdxs.includes(i)) {
                            const progId = ix.programIdIndex !== undefined ? combined[ix.programIdIndex] : 'unknown';
                            const poolPos = accIdxs.indexOf(i);
                            console.log(`   📋 Pool is in instruction for: ${progId.substring(0, 24)}...`);
                            console.log(`   📋 Pool position in instruction accounts: ${poolPos}`);
                            
                            // Test extraction by simulating CPMM instruction (even if routed through aggregator)
                            cpmmInstruction = ix;
                            hasCPMM = true;
                            console.log(`   ✅ Will test extraction (treating as CPMM even if routed)`);
                            break;
                        }
                    }
                    break;
                }
            }
        }
        
        if (!hasCPMM) {
            noCPMMInstruction++;
            if (noCPMMInstruction <= 3) {
                // Show what programs ARE in this transaction
                const programs = new Set();
                instructions.forEach(ix => {
                    if (ix.programIdIndex !== undefined) {
                        const progId = combined[ix.programIdIndex];
                        if (progId) {
                            programs.add(progId);
                        }
                    }
                });
                
                const programList = Array.from(programs).slice(0, 5).map(p => p.substring(0, 16) + '...').join(', ');
                console.log(`⏭️  [${sigIdx + 1}] ${txSig.substring(0, 16)}... - No CPMM (has: ${programList}${programs.size > 5 ? '...' : ''})`);
            }
            continue;
        }
        
        tested++;
        console.log(`\n📊 [${tested}] CPMM Swap: ${txSig.substring(0, 16)}...`);
        
        // Check if this transaction has token balance changes (actual swap)
        const hasTokenChanges = tx.meta?.preTokenBalances?.length > 0 || tx.meta?.postTokenBalances?.length > 0;
        if (!hasTokenChanges) {
            console.log(`   ⚠️  No token balance changes (might be instruction only)`);
            continue;
        }
        
        // Show account indices
        let accountIndices = [];
        if (Array.isArray(cpmmInstruction.accounts) && cpmmInstruction.accounts.length > 0) {
            accountIndices = cpmmInstruction.accounts;
        } else if (Array.isArray(cpmmInstruction.accountKeyIndexes) && cpmmInstruction.accountKeyIndexes.length > 0) {
            accountIndices = cpmmInstruction.accountKeyIndexes;
        }
        
        console.log(`   📋 CPMM instruction has ${accountIndices.length} accounts`);
        
        // Check ALL indices to find where pool actually is
        console.log(`   🔍 Searching for pool in all accounts...`);
        let poolFoundAt = -1;
        for (let i = 0; i < accountIndices.length; i++) {
            const accIdx = accountIndices[i];
            if (accIdx >= 0 && accIdx < combined.length) {
                const addr = combined[accIdx];
                if (addr === USELESS_POOL) {
                    poolFoundAt = i;
                    console.log(`   ✅ POOL FOUND AT INDEX ${i} (idx=${accIdx})!`);
                    break;
                }
            }
        }
        
        if (poolFoundAt === -1) {
            console.log(`   ❌ Pool not found in instruction accounts`);
            // Show first 5 accounts for debugging
            console.log(`   📋 First 5 accounts:`);
            for (let i = 0; i < Math.min(5, accountIndices.length); i++) {
                const accIdx = accountIndices[i];
                if (accIdx >= 0 && accIdx < combined.length) {
                    const addr = combined[accIdx];
                    console.log(`      [${i}] idx=${accIdx}: ${addr.substring(0, 32)}...`);
                }
            }
        }
        
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
            
            // Debug: show what's at each index
            console.log(`   🔍 Debugging: Checking instruction accounts...`);
            for (let i = 0; i < Math.min(10, accountIndices.length); i++) {
                const accIdx = accountIndices[i];
                if (accIdx >= 0 && accIdx < combined.length) {
                    const addr = combined[accIdx];
                    const isPool = addr === USELESS_POOL;
                    console.log(`      [${i}] idx=${accIdx}: ${addr.substring(0, 32)}... ${isPool ? '✅ POOL!' : ''}`);
                }
            }
            continue;
        }
        
        console.log(`   📍 Extracted: ${extractedPool.substring(0, 32)}...`);
        
        // Check if correct
        if (extractedPool === USELESS_POOL) {
            console.log(`   ✅ CORRECT POOL!`);
            foundCorrectPool = true;
        }
        
        // Verify it's a valid pool
        await new Promise(resolve => setTimeout(resolve, 300));
        const poolData = await decoder.decodePoolState(extractedPool);
        
        if (poolData) {
            const isCorrect = extractedPool === USELESS_POOL;
            console.log(`   ✅ Valid CPMM pool! ${isCorrect ? '(CORRECT ✓)' : '(different pool)'}`);
            if (isCorrect) {
                console.log(`      Token0 Vault: ${poolData.token0Vault.substring(0, 16)}...`);
                console.log(`      Token1 Vault: ${poolData.token1Vault.substring(0, 16)}...`);
            }
            success++;
        } else {
            console.log(`   ❌ Not a valid pool`);
            failed++;
        }
    }
    
    console.log('\n' + '='.repeat(80));
    console.log(`📊 RESULTS:`);
    console.log(`   Transactions with CPMM/pool: ${tested}`);
    console.log(`   Transactions with pool in TX: ${poolFoundInTx}`);
    console.log(`   Transactions without CPMM: ${noCPMMInstruction}`);
    console.log(`   Success: ${success} (${tested > 0 ? ((success/tested)*100).toFixed(1) : 0}%)`);
    console.log(`   Failed: ${failed}`);
    console.log(`   Found correct pool: ${foundCorrectPool ? '✅ YES' : '❌ NO'}`);
    console.log('='.repeat(80));
    
    if (foundCorrectPool) {
        console.log('\n🎉 SUCCESS! Index 1 extraction works for CPMM!');
        return { success: true, tested, success, failed, foundCorrectPool };
    } else if (tested === 0) {
        console.log('\n❌ No CPMM swap transactions found');
        return { success: false, tested, success, failed, foundCorrectPool };
    } else {
        console.log('\n⚠️  Extraction working but not finding correct pool - may need adjustment');
        return { success: false, tested, success, failed, foundCorrectPool };
    }
}

testUSELESSCPMMSwaps().catch(console.error);

