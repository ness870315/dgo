import fs from 'fs/promises';
import axios from 'axios';
import { Connection, PublicKey } from '@solana/web3.js';

const CONSTANT_K_GRPC_ENDPOINT = 'https://yellowstone.constant-k.com:443';
const CONSTANT_K_GRPC_TOKEN = '39facrmt-om2u-4al5-5k4h-g8pls2y5vhui';
const CONSTANT_K_RPC = 'https://rpc.constant-k.com/v1/39facrmt-om2u-4al5-5k4h-g8pls2y5vhui';

// DEX Programs to monitor
const DEX_PROGRAMS = [
    '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8', // Raydium AMM
    'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc',  // Orca
    'Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB',  // Meteora
    '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P',  // Pump.fun
    'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',  // Jupiter Aggregator
    'PhoeNiXZ8ByJGLkxNfZRnkUfjvmuYqLR89jjFHGqdXY'   // Phoenix
];

const NULL_PUBKEY = '11111111111111111111111111111111';

// Exclude SOL and stablecoins
const EXCLUDED_TOKENS = new Set([
    'So11111111111111111111111111111111111111112', // Wrapped SOL
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
    'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
    'EX8AQmPLGAKuJ1HGaDCu5ZwyPQK1xn8Y9REMN8soyvEs', // TeslaAI (scam - flagged in audit)
    'BAZ2uNKcANstKoqSzzbMd89eDVhLRKdFdQAZsPdwUQ4Q', // Scam token (user-identified)
    'EHVebVwCTrqvdGLKisU5M5ikW5VHRALx93XvHa7zJLBR', // TRUMPET (scam - 0.38% liquidity ratio)
]);

class FinalPoC {
    constructor() {
        this.grpcClient = null;
        this.grpcWrapper = null;
        this.stream = null;
        this.rpcConnection = new Connection(CONSTANT_K_RPC, 'confirmed');
        this.stats = {
            totalTransactions: 0,
            swapsDetected: 0,
            poolsDiscovered: new Set(),
            tokensSeen: new Set(),
            startTime: Date.now(),
            errors: 0
        };
        
        // Track swaps per token
        this.tokenSwaps = new Map(); // tokenAddress -> swapCount
        this.tokenVolumes = new Map(); // tokenAddress -> totalVolume
        this.tokenData = new Map(); // tokenAddress -> {audit, organicScore, etc} from Jupiter
        this.tokenAuthorities = new Map(); // tokenAddress -> {mintAuthority, freezeAuthority}
        this.fetching = new Map(); // Track pending fetches to avoid duplicates
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
        console.log(`\n🚀 PoC: Discover Top 20 Active Tokens (Real-time)`);
        console.log(`   Monitoring: Raydium + Orca + Meteora + Pump.fun + Jupiter + Phoenix`);
        console.log(`   Classification: Bonding Curve vs Liquidity Pool`);
        console.log(`   Duration: 5 minutes\n`);

        try {
            const CommitmentLevel = this.grpcWrapper.getCommitmentLevel() || { CONFIRMED: 'confirmed' };
            
            const transactionFilters = {
                client: {
                    accountInclude: DEX_PROGRAMS,
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

            // Report every 30 seconds
            const statsInterval = setInterval(() => {
                const duration = (Date.now() - this.stats.startTime) / 1000;
                const swapsPerSec = (this.stats.swapsDetected / duration).toFixed(2);
                console.log(`📊 [${Math.floor(duration)}s] Swaps: ${this.stats.swapsDetected} (${swapsPerSec}/s) | Pools: ${this.stats.poolsDiscovered.size} | Tokens: ${this.stats.tokensSeen.size}`);
            }, 30000);

            // Stop after 5 minutes
            setTimeout(async () => {
                clearInterval(statsInterval);
                await this.finalReport();
                if (this.stream) this.stream.end();
                process.exit(0);
            }, 300000);

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

                // Track swaps per token (exclude SOL/stables)
                [swap.tokenMintA, swap.tokenMintB].forEach((tokenAddress) => {
                    if (tokenAddress && !EXCLUDED_TOKENS.has(tokenAddress)) {
                        const count = this.tokenSwaps.get(tokenAddress) || 0;
                        this.tokenSwaps.set(tokenAddress, count + 1);
                        
                        const volume = this.tokenVolumes.get(tokenAddress) || 0;
                        this.tokenVolumes.set(tokenAddress, volume + Math.abs(swap.amountIn || swap.amountOut || 1));
                    }
                });
            }
        } catch (error) {
            this.stats.errors++;
        }
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

    async fetchJupiterDataBatch(tokenAddresses) {
        // Jupiter /search endpoint supports comma-separated mint addresses (up to 100)
        const BATCH_SIZE = 100;
        const batches = [];
        
        for (let i = 0; i < tokenAddresses.length; i += BATCH_SIZE) {
            batches.push(tokenAddresses.slice(i, i + BATCH_SIZE));
        }
        
        console.log(`\n📡 Fetching token data from Jupiter API (${tokenAddresses.length} tokens in ${batches.length} batch${batches.length > 1 ? 'es' : ''})...`);
        
        const allResults = new Map();
        
        for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
            const batch = batches[batchIndex];
            try {
                // Use comma-separated addresses in query parameter
                const query = batch.join(',');
                const response = await axios.get(`https://lite-api.jup.ag/tokens/v2/search?query=${query}`, {
                    timeout: 10000
                });
                
                if (response.data && Array.isArray(response.data)) {
                    response.data.forEach(tokenData => {
                        if (tokenData && (tokenData.address || tokenData.id)) {
                            const address = tokenData.address || tokenData.id;
                            allResults.set(address, {
                                address: address,
                                marketCap: tokenData.mcap || tokenData.fdv || 0,
                                liquidity: tokenData.liquidity || 0,
                                priceUsd: tokenData.usdPrice || 0,
                                volume24h: tokenData.stats24h?.buyVolume || 0,
                                audit: tokenData.audit || {},
                                organicScore: tokenData.organicScore || null,
                                organicScoreLabel: tokenData.organicScoreLabel || null
                            });
                        }
                    });
                }
                
                console.log(`   ✅ Batch ${batchIndex + 1}/${batches.length} complete (${response.data?.length || 0} tokens found)`);
            } catch (error) {
                console.log(`   ⚠️ Batch ${batchIndex + 1}/${batches.length} failed: ${error.message}`);
            }
        }
        
        return allResults;
    }
    
    isBondingCurve(tokenAddress) {
        const tokenData = this.tokenData.get(tokenAddress);
        
        // If no Jupiter data at all, likely bonding curve (not indexed yet)
        if (!tokenData) return true;
        
        // If no market cap or liquidity, likely bonding curve
        if (!tokenData.marketCap || tokenData.marketCap === 0) return true;
        if (!tokenData.liquidity || tokenData.liquidity === 0) return true;
        
        // Very low liquidity compared to market cap (<0.1%) = bonding curve
        if (tokenData.marketCap && tokenData.liquidity) {
            const liquidityRatio = (tokenData.liquidity / tokenData.marketCap) * 100;
            if (liquidityRatio < 0.1) return true;
        }
        
        return false;
    }

    isSuspiciousToken(tokenAddress) {
        const tokenData = this.tokenData.get(tokenAddress);
        if (!tokenData) return false; // If no data, don't filter yet
        
        const audit = tokenData.audit || {};
        
        // Check for Blockaid scam indicators
        if (audit.isSus === true || audit.isSus === 'true') return true;
        if (audit.blockaidRugpull === true) return true;
        if (audit.blockaidWashTrading === true) return true;
        if (audit.blockaidHiddenKeyHolder === true) return true;
        if (audit.topHoldersPercentage && audit.topHoldersPercentage > 50) return true;
        
        // Check organic score - filter if ZERO organic activity
        if (tokenData.organicScore === 0) {
            return true; // No organic activity = likely scam
        }
        
        // Filter tokens with market cap < $100K
        if (tokenData.marketCap && tokenData.marketCap < 100000) {
            return true;
        }
        
        // NEW: Check liquidity/market cap ratio (should be at least 2%)
        if (tokenData.marketCap && tokenData.liquidity) {
            const liquidityRatio = (tokenData.liquidity / tokenData.marketCap) * 100;
            if (liquidityRatio < 2) {
                return true; // Less than 2% liquidity = likely pump & dump
            }
        }
        
        // NEW: Check dev balance (if dev holds more than 10%, suspicious)
        if (audit.devBalancePercentage && audit.devBalancePercentage > 10) {
            return true;
        }
        
        return false;
    }

    async finalReport() {
        const duration = (Date.now() - this.stats.startTime) / 1000;
        
        console.log(`\n${'='.repeat(80)}`);
        console.log(`🏁 FINAL RESULTS (${duration.toFixed(1)}s test)`);
        console.log(`${'='.repeat(80)}`);
        
        // Fetch Jupiter data for all tokens in batches
        const allTokenAddresses = Array.from(this.tokenSwaps.keys());
        const jupiterData = await this.fetchJupiterDataBatch(allTokenAddresses);
        
        // Store the fetched data
        jupiterData.forEach((data, address) => {
            this.tokenData.set(address, data);
        });
        
        // Get top 20 tokens by SWAP ACTIVITY (excluding SOL/stables and scams)
        // Ranking: Most swaps detected in 5 minutes = highest activity
        const tokenList = Array.from(this.tokenSwaps.entries())
            .filter(([token]) => {
                if (EXCLUDED_TOKENS.has(token)) return false;
                if (this.isSuspiciousToken(token)) {
                    console.log(`🚫 Filtering out suspicious token: ${token}...`);
                    return false;
                }
                return true;
            })
            .map(([token, swapCount]) => {
                const tokenData = this.tokenData.get(token);
                const stats24h = tokenData?.stats24h || {};
                
                // Calculate metrics
                const totalVolume24h = (stats24h.buyVolume || 0) + (stats24h.sellVolume || 0);
                const numTraders = stats24h.numTraders || 0;
                const marketCap = tokenData?.marketCap || 1;
                const volumeToMcapRatio = totalVolume24h > 0 ? (totalVolume24h / marketCap) * 100 : 0;
                
                return {
                    address: token,
                    swapCount,
                    volume24h: totalVolume24h,
                    numTraders,
                    volumeToMcapRatio,
                    marketCap: tokenData?.marketCap || null,
                    liquidity: tokenData?.liquidity || null,
                    isBondingCurve: this.isBondingCurve(token),
                    isSuspicious: tokenData?.audit?.isSus || false,
                    rugpull: tokenData?.audit?.blockaidRugpull || false
                };
            })
            .sort((a, b) => b.swapCount - a.swapCount)
            .slice(0, 20);

        console.log(`\n🔥 TOP 20 TRENDING TOKENS (Ranked by Swap Activity):`);
        console.log(`${'='.repeat(80)}`);
        
        if (tokenList.length === 0) {
            console.log(`   No valid tokens found`);
        } else {
            tokenList.forEach((token, index) => {
                console.log(`\n${index + 1}. ${token.address}`);
                
                // Show bonding curve label
                if (token.isBondingCurve) {
                    console.log(`   🌊 Type: BONDING CURVE`);
                } else {
                    console.log(`   💎 Type: LIQUIDITY POOL`);
                }
                
                console.log(`   🔥 Swaps Detected (5min): ${token.swapCount}`);
                if (token.volume24h > 0) {
                    console.log(`   📊 24h Volume: $${token.volume24h.toLocaleString()}`);
                }
                if (token.numTraders > 0) {
                    console.log(`   👥 Unique Traders (24h): ${token.numTraders}`);
                }
                if (token.volumeToMcapRatio > 0) {
                    console.log(`   📈 Volume/MC Ratio: ${token.volumeToMcapRatio.toFixed(2)}%`);
                }
                if (token.marketCap) {
                    console.log(`   💰 Market Cap: $${(token.marketCap).toLocaleString()}`);
                }
                if (token.liquidity) {
                    console.log(`   💧 Liquidity: $${(token.liquidity).toLocaleString()}`);
                }
                console.log(`   🔐 Mint Authority: ${token.mintAuthorityEnabled ? '⚠️ ENABLED' : '✅ Disabled'}`);
                console.log(`   🔐 Freeze Authority: ${token.freezeAuthorityEnabled ? '⚠️ ENABLED' : '✅ Disabled'}`);
            });
        }

        console.log(`\n📊 SUMMARY:`);
        console.log(`   Total swaps detected: ${this.stats.swapsDetected.toLocaleString()}`);
        console.log(`   Swaps/sec: ${(this.stats.swapsDetected / duration).toFixed(2)}`);
        console.log(`   Pools discovered: ${this.stats.poolsDiscovered.size}`);
        console.log(`   Unique tokens (excluding SOL): ${tokenList.length > 0 ? this.tokenSwaps.size : 0}`);
        console.log(`   Top token swaps: ${tokenList[0]?.swapCount || 0}`);
        console.log(`${'='.repeat(80)}`);
    }
}

async function main() {
    const poc = new FinalPoC();
    const initialized = await poc.initialize();
    if (!initialized) process.exit(1);
    await poc.startMonitoring();
}

main().catch(console.error);

