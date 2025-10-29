import axios from 'axios';
import fs from 'fs/promises';

const CONSTANT_K_GRPC_ENDPOINT = 'https://yellowstone.constant-k.com:443';
const CONSTANT_K_GRPC_TOKEN = '39facrmt-om2u-4al5-5k4h-g8pls2y5vhui';
const RAYDIUM_AMM_PROGRAM = '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8';

// Sliding window configuration
const WINDOWS = {
    '1m': 60,
    '5m': 300,
    '1h': 3600
};

// Activity thresholds
const THRESHOLDS = {
    minSwaps5m: 5,
    minSwaps1h: 20,
    minVolume1h: 1000  // in token units (approximate)
};

class EnhancedPoC {
    constructor() {
        this.grpcClient = null;
        this.grpcWrapper = null;
        this.stream = null;
        this.stats = {
            totalTransactions: 0,
            swapsDetected: 0,
            poolsDiscovered: new Set(),
            tokensSeen: new Set(),
            startTime: Date.now(),
            errors: 0
        };
        
        // Activity tracking with sliding windows
        this.tokenActivity = new Map(); // tokenAddress -> { windows: { '1m': [], '5m': [], '1h': [] } }
        this.poolActivity = new Map();
    }

    async initialize() {
        console.log('🔌 Initializing gRPC client...');
        
        try {
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
        console.log(`\n🚀 Enhanced PoC: Program-Based Filtering + Sliding Windows`);
        console.log(`   DEX: Raydium AMM`);
        console.log(`   Duration: 60 seconds`);
        console.log(`\n📊 Monitoring...\n`);

        try {
            const CommitmentLevel = this.grpcWrapper.getCommitmentLevel() || { CONFIRMED: 'confirmed' };
            
            const transactionFilters = {
                client: {
                    accountInclude: [RAYDIUM_AMM_PROGRAM],
                    accountExclude: [],
                    accountRequired: [],
                    vote: false,
                    failed: false
                }
            };

            this.stream = await this.grpcClient.subscribeOnce(
                {}, {}, transactionFilters, {}, {}, {}, {}, 
                CommitmentLevel.CONFIRMED, []
            );

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

            // Stop after 60 seconds
            setTimeout(async () => {
                clearInterval(statsInterval);
                await this.finalReport();
                if (this.stream) this.stream.end();
                process.exit(0);
            }, 60000);

        } catch (error) {
            console.error('❌ Failed to start monitoring:', error.message);
            process.exit(1);
        }
    }

    processTransaction(msg) {
        this.stats.totalTransactions++;

        try {
            const swap = this.parseRaydiumSwap(msg);
            
            if (swap) {
                this.stats.swapsDetected++;
                this.stats.poolsDiscovered.add(swap.poolAddress);
                this.stats.tokensSeen.add(swap.tokenMintA);
                this.stats.tokensSeen.add(swap.tokenMintB);

                const timestamp = Date.now();
                const volume = Math.abs(swap.amountIn || swap.amountOut || 1);

                // Track activity with sliding windows
                [swap.tokenMintA, swap.tokenMintB].forEach(tokenAddress => {
                    if (tokenAddress) {
                        this.addActivity(tokenAddress, volume, timestamp);
                    }
                });

                // Track pool activity
                this.addPoolActivity(swap.poolAddress, timestamp);
            }
        } catch (error) {
            this.stats.errors++;
        }
    }

    addActivity(tokenAddress, volume, timestamp) {
        let tokenData = this.tokenActivity.get(tokenAddress);
        if (!tokenData) {
            tokenData = { windows: {} };
            for (const windowName of Object.keys(WINDOWS)) {
                tokenData.windows[windowName] = [];
            }
            this.tokenActivity.set(tokenAddress, tokenData);
        }

        // Add to all windows
        const entry = { volume, timestamp };
        for (const [windowName, windowSec] of Object.entries(WINDOWS)) {
            tokenData.windows[windowName].push(entry);
            
            // Remove old entries
            const cutoff = timestamp - (windowSec * 1000);
            tokenData.windows[windowName] = tokenData.windows[windowName].filter(e => e.timestamp > cutoff);
        }
    }

    addPoolActivity(poolAddress, timestamp) {
        let poolData = this.poolActivity.get(poolAddress);
        if (!poolData) {
            poolData = { windows: {}, swapTimes: [] };
            for (const windowName of Object.keys(WINDOWS)) {
                poolData.windows[windowName] = [];
            }
            this.poolActivity.set(poolAddress, poolData);
        }

        poolData.swapTimes.push(timestamp);

        // Update windows
        for (const [windowName, windowSec] of Object.entries(WINDOWS)) {
            const cutoff = timestamp - (windowSec * 1000);
            poolData.windows[windowName] = poolData.swapTimes.filter(t => t > cutoff);
        }
    }

    getActivityMetrics(tokenAddress, window = '1h') {
        const tokenData = this.tokenActivity.get(tokenAddress);
        if (!tokenData || !tokenData.windows[window]) {
            return null;
        }

        const entries = tokenData.windows[window];
        const swaps = entries.length;
        const volume = entries.reduce((sum, e) => sum + e.volume, 0);
        const avgVolume = swaps > 0 ? volume / swaps : 0;

        return { swaps, volume, avgVolume };
    }

    calculateActivityScore(tokenAddress) {
        const activity1h = this.getActivityMetrics(tokenAddress, '1h');
        const activity5m = this.getActivityMetrics(tokenAddress, '5m');
        
        if (!activity1h || activity1h.swaps === 0) return 0;

        // Score components
        const swaps1hScore = Math.min(activity1h.swaps / 100, 1) * 40; // Max 40 points
        const volume1hScore = Math.min(activity1h.volume / 1000000, 1) * 30; // Max 30 points
        const swaps5mScore = activity5m ? Math.min(activity5m.swaps / 20, 1) * 30 : 0; // Max 30 points (velocity)

        return swaps1hScore + volume1hScore + swaps5mScore;
    }

    isActive(tokenAddress) {
        const activity1h = this.getActivityMetrics(tokenAddress, '1h');
        const activity5m = this.getActivityMetrics(tokenAddress, '5m');

        if (!activity1h || activity1h.swaps === 0) return false;

        return activity5m.swaps >= THRESHOLDS.minSwaps5m || 
               activity1h.swaps >= THRESHOLDS.minSwaps1h ||
               activity1h.volume >= THRESHOLDS.minVolume1h;
    }

    parseRaydiumSwap(msg) {
        try {
            const txWrapper = msg.transaction?.transaction || msg.transaction || msg;
            const transaction = txWrapper.transaction || txWrapper;
            const meta = txWrapper.meta || msg.transactionStatus?.meta || msg.meta || {};
            
            if (!transaction) return null;

            const preTokenBalances = meta.preTokenBalances || [];
            const postTokenBalances = meta.postTokenBalances || [];
            
            if (preTokenBalances.length > 0 && postTokenBalances.length > 0) {
                const accountKeys = transaction.message?.accountKeys || [];
                const poolAddress = accountKeys.find((key, idx) => {
                    const pubkey = key.pubkey || key;
                    return pubkey && pubkey !== '11111111111111111111111111111111' && idx < 10;
                })?.pubkey || accountKeys[0]?.pubkey || accountKeys[0];

                if (!poolAddress) return null;

                const tokenChanges = postTokenBalances.filter(post => {
                    const pre = preTokenBalances.find(p => 
                        p.accountIndex === post.accountIndex && 
                        p.mint === post.mint
                    );
                    return pre && pre.uiTokenAmount?.uiAmount !== post.uiTokenAmount?.uiAmount;
                });

                if (tokenChanges.length >= 2) {
                    return {
                        poolAddress,
                        tokenMintA: tokenChanges[0].mint,
                        tokenMintB: tokenChanges[1].mint,
                        amountIn: 0,
                        amountOut: 0,
                        signature: transaction.signatures?.[0] || 'unknown',
                        slot: msg.slot
                    };
                }
            }

            return null;
        } catch (error) {
            return null;
        }
    }

    reportStats() {
        const duration = (Date.now() - this.stats.startTime) / 1000;
        const swapsPerSec = (this.stats.swapsDetected / duration).toFixed(2);
        const activeTokens = Array.from(this.stats.tokensSeen).filter(t => this.isActive(t)).length;

        console.log(`\n📊 [${Math.floor(duration)}s] Stats:`);
        console.log(`   Transactions: ${this.stats.totalTransactions.toLocaleString()}`);
        console.log(`   Swaps detected: ${this.stats.swapsDetected.toLocaleString()} (${swapsPerSec}/s)`);
        console.log(`   Pools discovered: ${this.stats.poolsDiscovered.size}`);
        console.log(`   Active tokens: ${activeTokens}/${this.stats.tokensSeen.size}`);
    }

    async finalReport() {
        const duration = (Date.now() - this.stats.startTime) / 1000;
        
        console.log(`\n${'='.repeat(70)}`);
        console.log(`🏁 ENHANCED PoC RESULTS (${duration.toFixed(1)}s test)`);
        console.log(`${'='.repeat(70)}`);
        
        // Calculate activity scores for all tokens
        const tokenScores = Array.from(this.stats.tokensSeen).map(tokenAddress => {
            const activity1h = this.getActivityMetrics(tokenAddress, '1h');
            const activity5m = this.getActivityMetrics(tokenAddress, '5m');
            const score = this.calculateActivityScore(tokenAddress);
            const active = this.isActive(tokenAddress);
            
            return {
                address: tokenAddress,
                score,
                active,
                swaps1h: activity1h?.swaps || 0,
                swaps5m: activity5m?.swaps || 0,
                volume1h: activity1h?.volume || 0
            };
        }).sort((a, b) => b.score - a.score);

        console.log(`\n💎 TOP 10 MOST ACTIVE TOKEN CONTRACTS:`);
        console.log(`${'='.repeat(70)}`);
        tokenScores.slice(0, 10).forEach((token, index) => {
            console.log(`\n${index + 1}. ${token.address}`);
            console.log(`   Score: ${token.score.toFixed(2)}/100 ${token.active ? '✅ ACTIVE' : '⏸️  INACTIVE'}`);
            console.log(`   Swaps (1h): ${token.swaps1h}`);
            console.log(`   Swaps (5m): ${token.swaps5m}`);
            console.log(`   Volume (1h): ${token.volume1h.toLocaleString()} tokens`);
        });

        const activeTokens = tokenScores.filter(t => t.active);
        console.log(`\n📊 SUMMARY:`);
        console.log(`   Total tokens discovered: ${tokenScores.length}`);
        console.log(`   Active tokens: ${activeTokens.length}`);
        console.log(`   Top score: ${tokenScores[0]?.score.toFixed(2)}`);
        console.log(`   Pools discovered: ${this.stats.poolsDiscovered.size}`);
        console.log(`   Total swaps: ${this.stats.swapsDetected.toLocaleString()}`);
        console.log(`   Swaps/sec: ${(this.stats.swapsDetected / duration).toFixed(2)}`);

        // Save results
        const results = {
            duration,
            totalTransactions: this.stats.totalTransactions,
            swapsDetected: this.stats.swapsDetected,
            poolsDiscovered: Array.from(this.stats.poolsDiscovered),
            top10Tokens: tokenScores.slice(0, 10),
            activeTokens: activeTokens.length,
            timestamp: new Date().toISOString()
        };

        await fs.writeFile('poc-enhanced-results.json', JSON.stringify(results, null, 2));
        console.log(`\n✅ Results saved to poc-enhanced-results.json`);
        console.log(`${'='.repeat(70)}`);
    }
}

async function main() {
    const poc = new EnhancedPoC();
    const initialized = await poc.initialize();
    if (!initialized) process.exit(1);
    await poc.startMonitoring();
}

main().catch(console.error);

