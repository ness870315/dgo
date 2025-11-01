/**
 * Live test: Monitor active Raydium tokens and test pool extraction on REAL swaps
 */

import { extractRaydiumPoolFromIx, buildCombinedKeys } from './services/SwapDetectionHelpers.mjs';
import GrpcWrapper from './services/GrpcWrapper.cjs';
import RaydiumPoolDecoder from './services/RaydiumPoolDecoder.mjs';
import RaydiumCPMMDecoder from './services/RaydiumCPMMDecoder.mjs';
import RaydiumCLMMDecoder from './services/RaydiumCLMMDecoder.mjs';

const CONSTANT_K_RPC = 'https://rpc.constant-k.com/?api-key=tsn41k3y-4qch-46f2-5ogr-67dmw2zh1ur8';
const CONSTANT_K_GRPC_ENDPOINT = 'https://yellowstone.constant-k.com:443';
const CONSTANT_K_GRPC_TOKEN = '39facrmt-om2u-4al5-5k4h-g8pls2y5vhui';

const RAYDIUM_AMM = '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8';
const RAYDIUM_CPMM = 'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C';
const RAYDIUM_CLMM = 'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK';

// Known active tokens on different Raydium pools
const TEST_TOKENS = [
    'Dz9mQ9NzkBcCsuGPFJ3r1bS4wgqKMHBPiVuniW8Mbonk', // USELESS (CPMM)
    'So11111111111111111111111111111111111111112', // SOL (many AMM pools)
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'  // USDC (many pools)
];

const decoders = {
    [RAYDIUM_AMM]: new RaydiumPoolDecoder(CONSTANT_K_RPC),
    [RAYDIUM_CPMM]: new RaydiumCPMMDecoder(CONSTANT_K_RPC),
    [RAYDIUM_CLMM]: new RaydiumCLMMDecoder(CONSTANT_K_RPC)
};

let testResults = {
    total: 0,
    successful: 0,
    failed: 0,
    details: []
};

async function testLiveExtraction() {
    console.log('🧪 LIVE TEST: Raydium Pool Extraction\n');
    console.log('='.repeat(80));
    console.log('📡 Connecting to Constant K gRPC...\n');
    
    try {
        const grpcWrapper = new GrpcWrapper();
        const client = await grpcWrapper.createClient(CONSTANT_K_GRPC_ENDPOINT, CONSTANT_K_GRPC_TOKEN);
        const CommitmentLevel = grpcWrapper.getCommitmentLevel();
        
        console.log('✅ Connected. Monitoring active tokens...\n');
        console.log(`   Monitoring ${TEST_TOKENS.length} tokens for Raydium swaps\n`);
        console.log('='.repeat(80));
        
        // Monitor active tokens (they use Raydium pools)
        const stream = await client.subscribeOnce(
            {}, {},
            {
                client: {
                    accountInclude: TEST_TOKENS,
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
        
        stream.on('data', async (msg) => {
            const tx = msg.transaction?.transaction;
            if (!tx) return;
            
            const message = tx.message || {};
            const { combined } = buildCombinedKeys(message);
            const instructions = message.instructions || [];
            
            // Find Raydium instruction
            let raydiumProgram = null;
            let raydiumIx = null;
            
            for (const ix of instructions) {
                if (ix.programIdIndex !== undefined) {
                    const progId = combined[ix.programIdIndex];
                    if (progId === RAYDIUM_AMM || progId === RAYDIUM_CPMM || progId === RAYDIUM_CLMM) {
                        raydiumProgram = progId;
                        raydiumIx = ix;
                        break;
                    }
                }
            }
            
            if (!raydiumProgram || !raydiumIx) return; // Not a Raydium swap
            
            testResults.total++;
            const programName = raydiumProgram === RAYDIUM_AMM ? 'AMM' : raydiumProgram === RAYDIUM_CPMM ? 'CPMM' : 'CLMM';
            
            console.log(`\n[${testResults.total}] 📊 Testing ${programName} swap`);
            
            // Show instruction structure
            console.log(`   Instruction structure:`);
            console.log(`      accounts type: ${typeof raydiumIx.accounts}, isArray: ${Array.isArray(raydiumIx.accounts)}, length: ${Array.isArray(raydiumIx.accounts) ? raydiumIx.accounts.length : 'N/A'}`);
            console.log(`      accountKeyIndexes type: ${typeof raydiumIx.accountKeyIndexes}, isArray: ${Array.isArray(raydiumIx.accountKeyIndexes)}, length: ${Array.isArray(raydiumIx.accountKeyIndexes) ? raydiumIx.accountKeyIndexes.length : 'N/A'}`);
            console.log(`      accountKeys type: ${typeof raydiumIx.accountKeys}, isArray: ${Array.isArray(raydiumIx.accountKeys)}, length: ${Array.isArray(raydiumIx.accountKeys) ? raydiumIx.accountKeys.length : 'N/A'}`);
            console.log(`      All keys: ${Object.keys(raydiumIx).join(', ')}`);
            
            if (Array.isArray(raydiumIx.accounts) && raydiumIx.accounts.length > 0) {
                console.log(`      accounts[0-2]: ${raydiumIx.accounts.slice(0, 3).join(', ')}`);
                if (raydiumIx.accounts[0] !== undefined && combined[raydiumIx.accounts[0]]) {
                    console.log(`      combined[accounts[0]]: ${combined[raydiumIx.accounts[0]].substring(0, 16)}...`);
                }
            }
            if (Array.isArray(raydiumIx.accountKeyIndexes) && raydiumIx.accountKeyIndexes.length > 0) {
                console.log(`      accountKeyIndexes[0-2]: ${raydiumIx.accountKeyIndexes.slice(0, 3).join(', ')}`);
                if (raydiumIx.accountKeyIndexes[0] !== undefined && combined[raydiumIx.accountKeyIndexes[0]]) {
                    console.log(`      combined[accountKeyIndexes[0]]: ${combined[raydiumIx.accountKeyIndexes[0]].substring(0, 16)}...`);
                }
            }
            if (Array.isArray(raydiumIx.accountKeys) && raydiumIx.accountKeys.length > 0) {
                console.log(`      accountKeys[0-2]: ${raydiumIx.accountKeys.slice(0, 3).map(k => k?.substring(0, 16) + '...').join(', ')}`);
            }
            
            // Test extraction
            console.log(`   Testing extraction...`);
            const extractedPool = extractRaydiumPoolFromIx(tx, raydiumProgram);
            
            console.log(`   Extracted pool: ${extractedPool || 'null'}`);
            
            if (!extractedPool) {
                testResults.failed++;
                console.log(`   ❌ EXTRACTION FAILED`);
                testResults.details.push({
                    program: programName,
                    extracted: null,
                    reason: 'extraction returned null',
                    structure: {
                        accounts: Array.isArray(raydiumIx.accounts) ? raydiumIx.accounts.length : 'not array',
                        accountKeyIndexes: Array.isArray(raydiumIx.accountKeyIndexes) ? raydiumIx.accountKeyIndexes.length : 'not array',
                        accountKeys: Array.isArray(raydiumIx.accountKeys) ? raydiumIx.accountKeys.length : 'not array'
                    }
                });
            } else {
                // Test decoding
                const decoder = decoders[raydiumProgram];
                console.log(`   Testing decoder with extracted address...`);
                
                try {
                    const poolData = await decoder.decodePoolState(extractedPool);
                    if (poolData) {
                        testResults.successful++;
                        console.log(`   ✅ SUCCESS: Pool decoded!`);
                        const vault = poolData.baseVault || poolData.token0Vault || poolData.vaultA;
                        console.log(`      Vault: ${vault?.substring(0, 16)}...`);
                        testResults.details.push({
                            program: programName,
                            extracted: extractedPool.substring(0, 16) + '...',
                            decoded: true
                        });
                    } else {
                        testResults.failed++;
                        console.log(`   ⚠️  Decoder failed (extracted address is not a pool)`);
                        testResults.details.push({
                            program: programName,
                            extracted: extractedPool.substring(0, 16) + '...',
                            decoded: false,
                            reason: 'decoder returned null'
                        });
                    }
                } catch (error) {
                    testResults.failed++;
                    console.log(`   ⚠️  Decoder error: ${error.message}`);
                    testResults.details.push({
                        program: programName,
                        extracted: extractedPool.substring(0, 16) + '...',
                        decoded: false,
                        error: error.message
                    });
                }
            }
            
            // Stop after 10 tests
            if (testResults.total >= 10) {
                console.log(`\n${'='.repeat(80)}`);
                console.log('📊 FINAL RESULTS:');
                console.log(`${'='.repeat(80)}`);
                console.log(`   Total swaps tested: ${testResults.total}`);
                console.log(`   Successful extractions + decodes: ${testResults.successful}`);
                console.log(`   Failed: ${testResults.failed}`);
                console.log(`   Success rate: ${((testResults.successful / testResults.total) * 100).toFixed(1)}%`);
                console.log(`\n   Details:`);
                testResults.details.forEach((d, i) => {
                    if (d.decoded) {
                        console.log(`   ${i + 1}. ${d.program}: ${d.extracted} - ✅ Decoded`);
                    } else {
                        console.log(`   ${i + 1}. ${d.program}: ${d.extracted || 'null'} - ❌ ${d.reason || d.error || 'Failed'}`);
                        if (d.structure) {
                            console.log(`      Structure: accounts=${d.structure.accounts}, accountKeyIndexes=${d.structure.accountKeyIndexes}, accountKeys=${d.structure.accountKeys}`);
                        }
                    }
                });
                console.log(`\n`);
                
                stream.cancel();
                process.exit(0);
            }
        });
        
        stream.on('error', (error) => {
            console.error('❌ Stream error:', error);
            process.exit(1);
        });
        
        // Timeout after 120 seconds
        setTimeout(() => {
            console.log(`\n⏱️  Timeout after 120s. Captured ${testResults.total} swaps.`);
            if (testResults.total > 0) {
                console.log(`   Successful: ${testResults.successful}/${testResults.total}`);
                console.log(`   Success rate: ${((testResults.successful / testResults.total) * 100).toFixed(1)}%`);
                console.log(`\n   Details:`);
                testResults.details.forEach((d, i) => {
                    if (d.decoded) {
                        console.log(`   ${i + 1}. ${d.program}: ${d.extracted} - ✅ Decoded`);
                    } else {
                        console.log(`   ${i + 1}. ${d.program}: ${d.extracted || 'null'} - ❌ ${d.reason || d.error || 'Failed'}`);
                        if (d.structure) {
                            console.log(`      Structure: accounts=${d.structure.accounts}, accountKeyIndexes=${d.structure.accountKeyIndexes}, accountKeys=${d.structure.accountKeys}`);
                        }
                    }
                });
            }
            stream.cancel();
            process.exit(0);
        }, 120000);
        
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

testLiveExtraction().catch(console.error);
