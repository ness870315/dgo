/**
 * Test pool extraction with REAL transaction data from the live stream
 * This will capture actual Raydium swap transactions and test extraction
 */

import { extractRaydiumPoolFromIx, buildCombinedKeys } from './services/SwapDetectionHelpers.mjs';
import GrpcWrapper from './services/GrpcWrapper.cjs';

const CONSTANT_K_GRPC_ENDPOINT = 'http://grpc.constant-k.com';
const CONSTANT_K_GRPC_TOKEN = '39facrmt-om2u-4al5-5k4h-g8pls2y5vhui';

// Known Raydium program IDs
const RAYDIUM_AMM = '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8';
const RAYDIUM_CPMM = 'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C';
const RAYDIUM_CLMM = 'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK';

let capturedTxs = [];
let testCount = 0;
const MAX_CAPTURES = 5;

async function testWithRealTransactions() {
    console.log('🧪 Testing Pool Extraction with REAL Raydium Transactions\n');
    console.log('='.repeat(80));
    console.log('📡 Connecting to Constant K gRPC...');
    
    try {
        const grpcWrapper = new GrpcWrapper();
        const client = await grpcWrapper.createClient(CONSTANT_K_GRPC_ENDPOINT, CONSTANT_K_GRPC_TOKEN);
        
        console.log('✅ Connected. Monitoring for Raydium swaps...\n');
        console.log('   Looking for Raydium AMM, CPMM, and CLMM swaps...');
        console.log('   Will capture 5 transactions and test extraction.\n');
        
        const CommitmentLevel = grpcWrapper.getCommitmentLevel();
        
        // Monitor a known active token that uses Raydium (e.g., USELESS on CPMM)
        const testToken = 'Dz9mQ9NzkBcCsuGPFJ3r1bS4wgqKMHBPiVuniW8Mbonk'; // USELESS
        
        const stream = await client.subscribeOnce(
            {}, {},
            {
                client: {
                    accountInclude: [testToken],
                    accountExclude: [],
                    accountRequired: [],
                    vote: false,
                    failed: false
                }
            },
            {}, {}, {}, {},
            CommitmentLevel.CONFIRMED,
            []
        );
        
        stream.on('data', (msg) => {
            const tx = msg.transaction?.transaction;
            if (!tx) return;
            
            const message = tx.message || {};
            const { combined } = buildCombinedKeys(message);
            const instructions = message.instructions || [];
            
            // Check if this is a Raydium swap
            let raydiumProgram = null;
            for (const ix of instructions) {
                if (ix.programIdIndex !== undefined) {
                    const progId = combined[ix.programIdIndex];
                    if (progId === RAYDIUM_AMM || progId === RAYDIUM_CPMM || progId === RAYDIUM_CLMM) {
                        raydiumProgram = progId;
                        break;
                    }
                }
            }
            
            if (!raydiumProgram) return; // Not a Raydium swap
            
            testCount++;
            console.log(`\n📊 [${testCount}/${MAX_CAPTURES}] Captured Raydium ${raydiumProgram === RAYDIUM_AMM ? 'AMM' : raydiumProgram === RAYDIUM_CPMM ? 'CPMM' : 'CLMM'} swap`);
            
            // Test extraction
            const extractedPool = extractRaydiumPoolFromIx(tx, raydiumProgram);
            
            // Log instruction structure
            const raydiumIx = instructions.find(ix => {
                if (ix.programIdIndex !== undefined) {
                    return combined[ix.programIdIndex] === raydiumProgram;
                }
                return false;
            });
            
            console.log(`   Instruction structure:`);
            console.log(`      programIdIndex: ${raydiumIx?.programIdIndex}`);
            console.log(`      accounts: ${Array.isArray(raydiumIx?.accounts) ? `Array[${raydiumIx.accounts.length}]` : typeof raydiumIx?.accounts}`);
            console.log(`      accountKeyIndexes: ${Array.isArray(raydiumIx?.accountKeyIndexes) ? `Array[${raydiumIx.accountKeyIndexes.length}]` : typeof raydiumIx?.accountKeyIndexes}`);
            console.log(`      accountKeys: ${Array.isArray(raydiumIx?.accountKeys) ? `Array[${raydiumIx.accountKeys.length}]` : typeof raydiumIx?.accountKeys}`);
            
            if (raydiumIx?.accounts && Array.isArray(raydiumIx.accounts)) {
                console.log(`      accounts[0]: ${raydiumIx.accounts[0]}`);
                console.log(`      accounts content: ${JSON.stringify(raydiumIx.accounts.slice(0, 3))}`);
            }
            
            console.log(`   Extracted pool: ${extractedPool || 'null'}`);
            console.log(`   Combined keys length: ${combined.length}`);
            console.log(`   First few combined: ${combined.slice(0, 5).map(k => k?.substring(0, 8) + '...').join(', ')}`);
            
            if (!extractedPool) {
                console.log(`   ⚠️  EXTRACTION FAILED - Need to fix instruction parsing`);
            } else {
                console.log(`   ✅ Extraction successful`);
            }
            
            capturedTxs.push({
                tx,
                program: raydiumProgram,
                extracted: extractedPool,
                instruction: raydiumIx
            });
            
            if (testCount >= MAX_CAPTURES) {
                console.log(`\n✅ Captured ${MAX_CAPTURES} transactions. Stopping...`);
                stream.cancel();
                
                // Summary
                const successCount = capturedTxs.filter(t => t.extracted).length;
                console.log(`\n📊 SUMMARY:`);
                console.log(`   Total captures: ${capturedTxs.length}`);
                console.log(`   Successful extractions: ${successCount}`);
                console.log(`   Failed extractions: ${capturedTxs.length - successCount}`);
                
                process.exit(0);
            }
        });
        
        stream.on('error', (error) => {
            console.error('❌ Stream error:', error);
            process.exit(1);
        });
        
        // Timeout after 60 seconds if we don't capture enough
        setTimeout(() => {
            if (capturedTxs.length < MAX_CAPTURES) {
                console.log(`\n⏱️  Timeout after 60s. Captured ${capturedTxs.length} transactions.`);
                const successCount = capturedTxs.filter(t => t.extracted).length;
                console.log(`   Successful: ${successCount}/${capturedTxs.length}`);
                stream.cancel();
                process.exit(0);
            }
        }, 60000);
        
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

testWithRealTransactions().catch(console.error);








