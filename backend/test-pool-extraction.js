/**
 * Test pool address extraction from actual Raydium swap transactions
 * This will help us understand the real transaction structure
 */

import { extractRaydiumPoolFromIx, buildCombinedKeys } from './services/SwapDetectionHelpers.mjs';

// Sample transaction structure (we'll use real data from logs)
async function testExtraction() {
    console.log('🧪 Testing Pool Address Extraction\n');
    console.log('='.repeat(80));
    
    // Test case 1: Instruction with accounts array
    console.log('\n📋 Test Case 1: Instruction with accounts array');
    const tx1 = {
        transaction: {
            message: {
                header: {
                    numRequiredSignatures: 1
                },
                accountKeys: [
                    'signer1...',
                    '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8', // Raydium AMM program
                    'poolAccount123...',
                    'tokenAccount1...',
                    'tokenAccount2...'
                ],
                instructions: [{
                    programIdIndex: 1,
                    accounts: [2, 3, 4] // poolAccount, tokenAccount1, tokenAccount2
                }],
                loadedAddresses: {
                    writable: [],
                    readonly: []
                }
            }
        },
        meta: {
            preTokenBalances: [
                { accountIndex: 3, mint: 'tokenMint1...' }
            ],
            postTokenBalances: [
                { accountIndex: 3, mint: 'tokenMint1...' },
                { accountIndex: 4, mint: 'tokenMint2...' }
            ]
        }
    };
    
    const result1 = extractRaydiumPoolFromIx(tx1, '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8');
    console.log(`   Result: ${result1 || 'null'}`);
    console.log(`   Expected: poolAccount123...`);
    console.log(`   ✅ ${result1 === 'poolAccount123...' ? 'PASS' : 'FAIL'}`);
    
    // Test case 2: Instruction with accountKeyIndexes (different format)
    console.log('\n📋 Test Case 2: Instruction with accountKeyIndexes');
    const tx2 = {
        transaction: {
            message: {
                header: {
                    numRequiredSignatures: 1
                },
                accountKeys: [
                    'signer1...',
                    'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C', // Raydium CPMM program
                    'cpmmPool456...',
                    'tokenMint1...',
                    'tokenMint2...'
                ],
                instructions: [{
                    programIdIndex: 1,
                    accountKeyIndexes: [2, 3, 4] // Different format!
                }],
                loadedAddresses: {
                    writable: [],
                    readonly: []
                }
            }
        },
        meta: {
            preTokenBalances: [
                { accountIndex: 0, mint: 'tokenMint1...' }
            ],
            postTokenBalances: [
                { accountIndex: 0, mint: 'tokenMint1...' }
            ]
        }
    };
    
    const result2 = extractRaydiumPoolFromIx(tx2, 'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C');
    console.log(`   Result: ${result2 || 'null'}`);
    console.log(`   Expected: cpmmPool456...`);
    console.log(`   ✅ ${result2 === 'cpmmPool456...' ? 'PASS' : 'FAIL'}`);
    
    // Test case 3: v0 transaction with loadedAddresses
    console.log('\n📋 Test Case 3: v0 transaction with loadedAddresses');
    const tx3 = {
        transaction: {
            message: {
                header: {
                    numRequiredSignatures: 1
                },
                accountKeys: [
                    'signer1...',
                    'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK' // Raydium CLMM program
                ],
                instructions: [{
                    programIdIndex: 1,
                    accounts: [0] // Reference to loadedAddresses
                }],
                loadedAddresses: {
                    writable: ['clmmPool789...'],
                    readonly: []
                }
            }
        },
        meta: {
            preTokenBalances: [],
            postTokenBalances: []
        }
    };
    
    const result3 = extractRaydiumPoolFromIx(tx3, 'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK');
    console.log(`   Result: ${result3 || 'null'}`);
    console.log(`   Expected: clmmPool789...`);
    console.log(`   ✅ ${result3 === 'clmmPool789...' ? 'PASS' : 'FAIL'}`);
    
    console.log('\n' + '='.repeat(80));
    console.log('🔍 If tests fail, the instruction structure is different than expected');
    console.log('   Check the debug logs for actual transaction structure');
}

// Run tests
testExtraction().catch(console.error);





