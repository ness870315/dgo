import axios from 'axios';
import fs from 'fs/promises';

// We'll use the existing gRPC setup
const CONSTANT_K_RPC = 'https://rpc.constant-k.com/?api-key=tsn41k3y-4qch-46f2-5ogr-67dmw2zh1ur8';
const CONSTANT_K_GRPC_ENDPOINT = 'https://yellowstone.constant-k.com:443';
const CONSTANT_K_GRPC_TOKEN = '39facrmt-om2u-4al5-5k4h-g8pls2y5vhui';

// Test with ONE DEX program first: Raydium AMM
const RAYDIUM_AMM_PROGRAM = '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8';

// DEX Program mapping
const DEX_PROGRAMS = {
    '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8': 'Raydium AMM'
};

class ProgramFilteringPoC {
    constructor() {
        this.grpcClient = null;
        this.grpcWrapper = null;
        this.stream = null;
        this.stats = {
            totalTransactions: 0,
            swapsDetected: 0,
            poolsDiscovered: new Set(),
            tokensSeen: new Set(),
            swapsByPool: new Map(),
            volumeByToken: new Map(), // Track volume per token
            swapCountByToken: new Map(), // Track swap count per token
            startTime: Date.now(),
            errors: 0
        };
    }

    async initialize() {
        console.log('🔌 Initializing gRPC client...');
        
        try {
            // Load gRPC wrapper
            const { createRequire } = await import('module');
            const require = createRequire(import.meta.url);
            const GrpcWrapper = require('./services/GrpcWrapper.cjs');
            
            this.grpcWrapper = new GrpcWrapper();
            this.grpcClient = await this.grpcWrapper.createClient(
                CONSTANT_K_GRPC_ENDPOINT, 
                CONSTANT_K_GRPC_TOKEN
            );
            
            console.log('✅ gRPC client initialized');
            return true;
        } catch (error) {
            console.error('❌ Failed to initialize gRPC:', error.message);
            return false;
        }
    }

    async startMonitoring() {
        console.log(`\n🚀 Starting PoC: Filter by DEX Program ID`);
        console.log(`   DEX: Raydium AMM`);
        console.log(`   Program ID: ${RAYDIUM_AMM_PROGRAM}`);
        console.log(`   Duration: 60 seconds`);
        console.log(`\n📊 Monitoring...\n`);

        try {
            // Get CommitmentLevel from grpcWrapper
            const CommitmentLevel = this.grpcWrapper.getCommitmentLevel() || { CONFIRMED: 'confirmed' };
            
            // ✅ FILTER BY PROGRAM ID (not pools!)
            // Format matches existing EnhancedHybridPriceService pattern
            const transactionFilters = {
                client: {
                    accountInclude: [RAYDIUM_AMM_PROGRAM], // Only Raydium AMM program
                    accountExclude: [],
                    accountRequired: [],
                    vote: false,
                    failed: false
                }
            };

            console.log(`📊 Transaction filters:`, JSON.stringify(transactionFilters, null, 2));

            // Create stream - match exact parameters from EnhancedHybridPriceService
            this.stream = await this.grpcClient.subscribeOnce(
                {}, // slots
                {}, // accounts
                transactionFilters, // transactions
                {}, // transactions
                {}, // blocks
                {}, // blocksMeta
                {}, // accountsData
                CommitmentLevel.CONFIRMED, // commitment
                [] // ping
            );

            // Process transactions
            this.stream.on('data', (msg) => {
                this.processTransaction(msg);
            });

            this.stream.on('error', (error) => {
                console.error('❌ Stream error:', error.message);
                this.stats.errors++;
            });

            // Report stats every 10 seconds
            const statsInterval = setInterval(() => {
                this.reportStats();
            }, 10000);

            // Stop after 60 seconds (full test)
            setTimeout(async () => {
                clearInterval(statsInterval);
                await this.finalReport();
                if (this.stream) this.stream.end();
                process.exit(0);
            }, 60000);

        } catch (error) {
            console.error('❌ Failed to start monitoring:', error.message);
            console.error(error.stack);
            process.exit(1);
        }
    }

    processTransaction(msg) {
        this.stats.totalTransactions++;

        // Debug: Log first transaction to see structure
        if (this.stats.totalTransactions === 1) {
            console.log(`\n🔍 Sample transaction structure:`);
            console.log(`   Top-level keys: ${Object.keys(msg).join(', ')}`);
            if (msg.transactionStatus) {
                console.log(`   TransactionStatus keys: ${Object.keys(msg.transactionStatus).join(', ')}`);
                console.log(`   TransactionStatus.meta exists: ${!!msg.transactionStatus.meta}`);
                if (msg.transactionStatus.meta) {
                    console.log(`   Meta keys: ${Object.keys(msg.transactionStatus.meta).join(', ')}`);
                    console.log(`   PreTokenBalances: ${msg.transactionStatus.meta.preTokenBalances?.length || 0}`);
                    console.log(`   PostTokenBalances: ${msg.transactionStatus.meta.postTokenBalances?.length || 0}`);
                }
            }
            if (msg.transaction?.transaction) {
                console.log(`   Transaction.transaction keys: ${Object.keys(msg.transaction.transaction).join(', ')}`);
            }
        }

        try {
            // Parse transaction to detect swaps
            const swap = this.parseRaydiumSwap(msg);
            
            if (swap) {
                this.stats.swapsDetected++;
                this.stats.poolsDiscovered.add(swap.poolAddress);
                this.stats.tokensSeen.add(swap.tokenMintA);
                this.stats.tokensSeen.add(swap.tokenMintB);

                // Track swaps per pool
                const poolSwaps = this.stats.swapsByPool.get(swap.poolAddress) || 0;
                this.stats.swapsByPool.set(swap.poolAddress, poolSwaps + 1);

                // Track activity per token (both tokens in the pair)
                [swap.tokenMintA, swap.tokenMintB].forEach(tokenAddress => {
                    if (tokenAddress) {
                        // Increment swap count
                        const tokenSwaps = this.stats.swapCountByToken.get(tokenAddress) || 0;
                        this.stats.swapCountByToken.set(tokenAddress, tokenSwaps + 1);
                        
                        // Track volume (approximate - using absolute delta)
                        // Note: Real USD volume would require price oracle
                        const volume = this.stats.volumeByToken.get(tokenAddress) || 0;
                        const estimatedVolume = Math.abs(swap.amountIn || swap.amountOut || 1);
                        this.stats.volumeByToken.set(tokenAddress, volume + estimatedVolume);
                    }
                });

                if (this.stats.swapsDetected % 10 === 0) {
                    console.log(`✅ Swap #${this.stats.swapsDetected}: Pool ${swap.poolAddress.substring(0, 16)}... | Tokens: ${swap.tokenMintA.substring(0, 8)}... / ${swap.tokenMintB.substring(0, 8)}...`);
                }
            }
        } catch (error) {
            this.stats.errors++;
            if (this.stats.errors % 100 === 0) {
                console.error(`⚠️ Errors: ${this.stats.errors}`);
            }
        }
    }

    parseRaydiumSwap(msg) {
        try {
            // Yellowstone format: msg.transaction.transaction contains the actual transaction
            const txWrapper = msg.transaction?.transaction || msg.transaction || msg;
            const transaction = txWrapper.transaction || txWrapper;
            const meta = txWrapper.meta || msg.transactionStatus?.meta || msg.meta || {};
            
            if (!transaction) return null;

            // Method 1: Check balance changes (like we do now)
            const preTokenBalances = meta.preTokenBalances || [];
            const postTokenBalances = meta.postTokenBalances || [];
            
            if (preTokenBalances && postTokenBalances && 
                preTokenBalances.length > 0 && postTokenBalances.length > 0) {
                
                // This is likely a swap - token balances changed
                const accountKeys = transaction.message?.accountKeys || [];
                
                // Find pool address (usually first account that's not system program)
                const poolAddress = accountKeys.find((key, idx) => {
                    const pubkey = key.pubkey || key;
                    return pubkey && pubkey !== '11111111111111111111111111111111' && idx < 10;
                })?.pubkey || accountKeys[0]?.pubkey || accountKeys[0];

                if (!poolAddress) return null;

                // Extract token mints from token balance changes
                const tokenChanges = postTokenBalances.filter(post => {
                    const pre = preTokenBalances.find(p => 
                        p.accountIndex === post.accountIndex && 
                        p.mint === post.mint
                    );
                    return pre && pre.uiTokenAmount?.uiAmount !== post.uiTokenAmount?.uiAmount;
                });

                if (tokenChanges.length >= 2) {
                    const tokenMintA = tokenChanges[0].mint;
                    const tokenMintB = tokenChanges[1].mint;

                    return {
                        poolAddress,
                        tokenMintA,
                        tokenMintB,
                        amountIn: 0,
                        amountOut: 0,
                        signature: transaction.signatures?.[0] || msg.signature || 'unknown',
                        slot: msg.slot
                    };
                }
            }

            // Method 2: Parse instruction data (if available)
            const message = transaction.message || transaction;
            const accountKeys = message.accountKeys || [];
            const instructions = message.instructions || [];

            for (const instruction of instructions) {
                if (!instruction.data) continue;

                const data = Array.isArray(instruction.data) 
                    ? Buffer.from(instruction.data) 
                    : Buffer.from(instruction.data, 'base64');

                if (data.length < 4) continue;

                // Check if this looks like a swap instruction
                // Raydium swap can have various discriminators
                const firstBytes = data.slice(0, 4);
                
                // If instruction has accounts, likely a swap
                const accountIndices = instruction.accounts || instruction.accountKeyIndexes || [];
                if (accountIndices.length >= 6) {
                    
                    // Pool address is typically first account
                    const poolIndex = accountIndices[0];
                    const poolAddress = accountKeys[poolIndex]?.pubkey || accountKeys[poolIndex];
                    
                    if (poolAddress && poolAddress !== '11111111111111111111111111111111') {
                        // Token mints might be at different indices, try multiple
                        const tokenAIndex = accountIndices[Math.min(5, accountIndices.length - 2)];
                        const tokenBIndex = accountIndices[Math.min(6, accountIndices.length - 1)];
                        
                        if (tokenAIndex !== undefined && tokenBIndex !== undefined) {
                            const tokenMintA = accountKeys[tokenAIndex]?.pubkey || accountKeys[tokenAIndex];
                            const tokenMintB = accountKeys[tokenBIndex]?.pubkey || accountKeys[tokenBIndex];

                            if (tokenMintA && tokenMintB) {
                                return {
                                    poolAddress,
                                    tokenMintA,
                                    tokenMintB,
                                    amountIn: 0,
                                    amountOut: 0,
                                    signature: transaction.signatures?.[0] || msg.signature || 'unknown',
                                    slot: msg.slot
                                };
                            }
                        }
                    }
                }
            }

            return null;
        } catch (error) {
            if (this.stats.errors < 5) {
                console.error('Parse error:', error.message);
            }
            return null;
        }
    }

    reportStats() {
        const duration = (Date.now() - this.stats.startTime) / 1000;
        const swapsPerSec = (this.stats.swapsDetected / duration).toFixed(2);
        const txsPerSec = (this.stats.totalTransactions / duration).toFixed(2);

        console.log(`\n📊 [${Math.floor(duration)}s] Stats:`);
        console.log(`   Transactions: ${this.stats.totalTransactions.toLocaleString()} (${txsPerSec}/s)`);
        console.log(`   Swaps detected: ${this.stats.swapsDetected.toLocaleString()} (${swapsPerSec}/s)`);
        console.log(`   Pools discovered: ${this.stats.poolsDiscovered.size}`);
        console.log(`   Unique tokens: ${this.stats.tokensSeen.size}`);
        console.log(`   Errors: ${this.stats.errors}`);
    }

    async finalReport() {
        const duration = (Date.now() - this.stats.startTime) / 1000;
        
        console.log(`\n${'='.repeat(60)}`);
        console.log(`🏁 FINAL RESULTS (${duration.toFixed(1)}s test)`);
        console.log(`${'='.repeat(60)}`);
        console.log(`\n📈 Performance:`);
        console.log(`   Total transactions: ${this.stats.totalTransactions.toLocaleString()}`);
        console.log(`   Swaps detected: ${this.stats.swapsDetected.toLocaleString()}`);
        console.log(`   Transactions/sec: ${(this.stats.totalTransactions / duration).toFixed(2)}`);
        console.log(`   Swaps/sec: ${(this.stats.swapsDetected / duration).toFixed(2)}`);
        console.log(`   Success rate: ${((this.stats.swapsDetected / this.stats.totalTransactions) * 100).toFixed(2)}%`);
        
        console.log(`\n🔍 Discovery:`);
        console.log(`   Pools discovered: ${this.stats.poolsDiscovered.size}`);
        console.log(`   Unique tokens: ${this.stats.tokensSeen.size}`);
        
        console.log(`\n🏊 Top 10 Most Active Pools (by swap count):`);
        const sortedPools = Array.from(this.stats.swapsByPool.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);
        
        if (sortedPools.length === 0) {
            console.log(`   No pools found with swaps`);
        } else {
            sortedPools.forEach(([pool, count], index) => {
                const poolStr = typeof pool === 'string' ? pool : String(pool);
                console.log(`   ${index + 1}. ${poolStr} : ${count} swaps`);
            });
        }

        console.log(`\n💎 Top 10 Most Active Token Contracts Discovered:`);
        // Sort tokens by swap count
        const tokenActivity = Array.from(this.stats.tokensSeen).map(tokenAddress => ({
            address: tokenAddress,
            swapCount: this.stats.swapCountByToken.get(tokenAddress) || 0,
            volume: this.stats.volumeByToken.get(tokenAddress) || 0
        })).sort((a, b) => b.swapCount - a.swapCount);
        
        if (tokenActivity.length === 0) {
            console.log(`   No tokens discovered yet`);
        } else {
            tokenActivity.slice(0, 10).forEach((token, index) => {
                console.log(`   ${index + 1}. ${token.address}`);
                console.log(`      - Swaps: ${token.swapCount}`);
                console.log(`      - Volume: ${token.volume.toLocaleString()} tokens`);
            });
        }

        console.log(`\n💾 Memory Usage:`);
        const memUsage = process.memoryUsage();
        console.log(`   Heap used: ${(memUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`);
        console.log(`   Heap total: ${(memUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`);
        console.log(`   RSS: ${(memUsage.rss / 1024 / 1024).toFixed(2)} MB`);

        // Save results to file
        const results = {
            duration,
            totalTransactions: this.stats.totalTransactions,
            swapsDetected: this.stats.swapsDetected,
            poolsDiscovered: Array.from(this.stats.poolsDiscovered),
            tokensSeen: Array.from(this.stats.tokensSeen),
            topPools: sortedPools.map(([pool, count]) => ({ pool, swaps: count })),
            memoryUsage: {
                heapUsed: memUsage.heapUsed,
                heapTotal: memUsage.heapTotal,
                rss: memUsage.rss
            },
            timestamp: new Date().toISOString()
        };

        await fs.writeFile('poc-test-results.json', JSON.stringify(results, null, 2));
        console.log(`\n✅ Results saved to poc-test-results.json`);
        
        console.log(`\n${'='.repeat(60)}`);
        console.log(`✅ PoC Test Complete!`);
        console.log(`${'='.repeat(60)}`);
    }
}

// Run the test
async function main() {
    const poc = new ProgramFilteringPoC();
    
    const initialized = await poc.initialize();
    if (!initialized) {
        console.error('❌ Failed to initialize, exiting');
        process.exit(1);
    }

    await poc.startMonitoring();
}

main().catch(console.error);

