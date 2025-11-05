import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import { Connection, PublicKey } from '@solana/web3.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Updated to new Constant K gRPC endpoint (Nov 2025)
const CONSTANT_K_GRPC_ENDPOINT = 'http://grpc.constant-k.com/';
const CONSTANT_K_GRPC_TOKEN = '39facrmt-om2u-4al5-5k4h-g8pls2y5vhui';
const CONSTANT_K_RPC = 'https://rpc.constant-k.com/v1/39facrmt-om2u-4al5-5k4h-g8pls2y5vhui';

// DEX Programs to monitor
const DEX_PROGRAMS = [
    '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8', // Raydium AMM
    'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc',  // Orca
    'Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB',  // Meteora
    // '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P',  // Pump.fun (DISABLED - bonding curve)
    'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',  // Jupiter Aggregator
    'PhoeNiXZ8ByJGLkxNfZRnkUfjvmuYqLR89jjFHGqdXY'   // Phoenix
];

const NULL_PUBKEY = '11111111111111111111111111111111';

// Exclude SOL and stablecoins
const EXCLUDED_TOKENS = new Set([
    'So11111111111111111111111111111111111111112', // Wrapped SOL
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
    'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
    'EX8AQmPLGAKuJ1HGaDCu5ZwyPQK1xn8Y9REMN8soyvEs', // TeslaAI (scam)
    'BAZ2uNKcANstKoqSzzbMd89eDVhLRKdFdQAZsPdwUQ4Q', // Scam token
    'EHVebVwCTrqvdGLKisU5M5ikW5VHRALx93XvHa7zJLBR', // TRUMPET (scam)
]);

class gRPCTrendingService {
    constructor(enhancedHybridPriceService = null, enhancedTokenProcessor = null) {
        this.grpcClient = null;
        this.grpcWrapper = null;
        this.stream = null;
        this.rpcConnection = new Connection(CONSTANT_K_RPC, 'confirmed');
        this.isRunning = false;
        this.continuousMode = false;
        
        // Integration with swap tracking
        this.enhancedHybridPriceService = enhancedHybridPriceService;
        
        // Integration with token processor for Twitter/scoring workflow
        this.enhancedTokenProcessor = enhancedTokenProcessor;
        
        // Stats tracking
        this.stats = {
            totalTransactions: 0,
            swapsDetected: 0,
            poolsDiscovered: new Set(),
            tokensSeen: new Set(),
            startTime: Date.now(),
            errors: 0,
            cyclesCompleted: 0,
            tokensDiscovered: 0
        };
        
        // Token tracking
        this.tokenSwaps = new Map(); // tokenAddress -> swapCount
        this.tokenVolumes = new Map(); // tokenAddress -> totalVolume
        this.tokenData = new Map(); // tokenAddress -> Jupiter data
        this.tokenAuthorities = new Map(); // tokenAddress -> {mintAuthority, freezeAuthority}
        this.fetching = new Map(); // Track pending fetches
        
        // Cache directory
        const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
        this.cacheDir = path.join(dataDir, 'cache');
        try {
            fsSync.mkdirSync(this.cacheDir, { recursive: true });
            console.log(`📁 [gRPCTrending] Cache directory: ${this.cacheDir}`);
        } catch (err) {
            console.error(`❌ [gRPCTrending] Failed to create cache directory: ${err.message}`);
        }
        
        // Monitoring configuration
        this.monitoringDuration = 5 * 60 * 1000; // 5 minutes
        this.reportInterval = 30 * 1000; // 30 seconds
        this.topTokensCount = 20;
    }

    async initialize() {
        console.log('🔌 [gRPCTrending] Initializing gRPC client...');
        
        try {
            const { createRequire } = await import('module');
            const require = createRequire(import.meta.url);
            const GrpcWrapper = require('./GrpcWrapper.cjs');
            
            this.grpcWrapper = new GrpcWrapper(
                CONSTANT_K_GRPC_ENDPOINT,
                CONSTANT_K_GRPC_TOKEN
            );
            
            this.grpcClient = this.grpcWrapper.getClient();
            console.log('✅ [gRPCTrending] gRPC client initialized');
            return true;
        } catch (error) {
            console.error('❌ [gRPCTrending] Failed to initialize:', error);
            return false;
        }
    }

    async startMonitoring() {
        if (this.isRunning) {
            console.log('⚠️ [gRPCTrending] Already running');
            return;
        }

        console.log(`\n🚀 [gRPCTrending] Starting token discovery...`);
        console.log(`   Monitoring: Raydium + Orca + Meteora + Jupiter + Phoenix`);
        console.log(`   Duration: ${this.monitoringDuration / 60000} minutes`);
        console.log(`   Filtering: Bonding curve tokens excluded\n`);

        this.isRunning = true;
        this.stats.startTime = Date.now();

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

            this.stream = await this.grpcClient.subscribeTransactions(
                transactionFilters,
                CommitmentLevel.CONFIRMED
            );

            this.stream.on('data', (msg) => {
                this.processTransaction(msg);
            });

            this.stream.on('error', (error) => {
                console.error('❌ [gRPCTrending] Stream error:', error.message);
                this.stats.errors++;
            });

            this.stream.on('end', () => {
                console.log('🔚 [gRPCTrending] Stream ended');
            });

            // Report stats periodically
            const statsInterval = setInterval(() => {
                const elapsed = Math.floor((Date.now() - this.stats.startTime) / 1000);
                const swapsPerSec = (this.stats.swapsDetected / elapsed).toFixed(2);
                console.log(`📊 [${elapsed}s] Swaps: ${this.stats.swapsDetected} (${swapsPerSec}/s) | Pools: ${this.stats.poolsDiscovered.size} | Tokens: ${this.tokenSwaps.size}`);
            }, this.reportInterval);

            // Stop after monitoring duration
            setTimeout(async () => {
                clearInterval(statsInterval);
                await this.stopMonitoring();
                await this.processAndSaveTokens();
            }, this.monitoringDuration);

        } catch (error) {
            console.error('❌ [gRPCTrending] Error starting monitoring:', error);
            this.isRunning = false;
            return false;
        }
    }

    processTransaction(msg) {
        try {
            this.stats.totalTransactions++;
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
                    return pre && pre.uiTokenAmount.uiAmount !== post.uiTokenAmount.uiAmount;
                });

                if (tokenChanges.length >= 2) {
                    return {
                        poolAddress,
                        tokenMintA: tokenChanges[0].mint,
                        tokenMintB: tokenChanges[1].mint,
                        amountIn: tokenChanges[0].uiTokenAmount.uiAmount,
                        amountOut: tokenChanges[1].uiTokenAmount.uiAmount,
                        signature: msg.signature || 'unknown'
                    };
                }
            }
            return null;
        } catch (error) {
            return null;
        }
    }

    async fetchJupiterDataBatch(tokenAddresses) {
        const BATCH_SIZE = 100;
        const batches = [];
        
        for (let i = 0; i < tokenAddresses.length; i += BATCH_SIZE) {
            batches.push(tokenAddresses.slice(i, i + BATCH_SIZE));
        }
        
        console.log(`\n📡 [gRPCTrending] Fetching token data from Jupiter API (${tokenAddresses.length} tokens in ${batches.length} batch${batches.length > 1 ? 'es' : ''})...`);
        
        const allResults = new Map();
        
        for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
            const batch = batches[batchIndex];
            try {
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
                                symbol: tokenData.symbol || 'UNKNOWN',
                                name: tokenData.name || 'Unknown Token',
                                logo: tokenData.icon || null,
                                decimals: tokenData.decimals || 9,
                                marketCap: tokenData.mcap || tokenData.fdv || 0,
                                liquidity: tokenData.liquidity || 0,
                                priceUsd: tokenData.usdPrice || 0,
                                volume24h: (tokenData.stats24h?.buyVolume || 0) + (tokenData.stats24h?.sellVolume || 0),
                                audit: tokenData.audit || {},
                                organicScore: tokenData.organicScore || null,
                                organicScoreLabel: tokenData.organicScoreLabel || null,
                                stats24h: tokenData.stats24h || {}
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
        
        // If no Jupiter data at all, likely bonding curve
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
        if (!tokenData) return false;
        
        const audit = tokenData.audit || {};
        
        // Check for Blockaid scam indicators
        if (audit.isSus === true || audit.isSus === 'true') return true;
        if (audit.blockaidRugpull === true) return true;
        if (audit.blockaidWashTrading === true) return true;
        if (audit.blockaidHiddenKeyHolder === true) return true;
        
        // Check mint/freeze authority
        if (audit.mintAuthorityDisabled === false) return true;
        if (audit.freezeAuthorityDisabled === false) return true;
        
        // Check top holders percentage (if > 50%, suspicious)
        if (audit.topHoldersPercentage && audit.topHoldersPercentage > 50) return true;
        
        // Filter tokens with market cap < $100K
        if (tokenData.marketCap && tokenData.marketCap < 100000) return true;
        
        // Check liquidity/market cap ratio (should be at least 2%)
        if (tokenData.marketCap && tokenData.liquidity) {
            const liquidityRatio = (tokenData.liquidity / tokenData.marketCap) * 100;
            if (liquidityRatio < 2) return true;
        }
        
        // Check dev balance (if dev holds more than 10%, suspicious)
        if (audit.devBalancePercentage && audit.devBalancePercentage > 10) return true;
        
        // Check organic score (if === 0, likely scam)
        if (tokenData.organicScore === 0) return true;
        
        return false;
    }

    calculateScore(tokenData, swapCount) {
        let score = 5.0; // Base score
        
        // Swap activity score (0-2 points)
        if (swapCount > 100) score += 2.0;
        else if (swapCount > 50) score += 1.5;
        else if (swapCount > 20) score += 1.0;
        else if (swapCount > 10) score += 0.5;
        
        // Market cap score (0-1.5 points)
        if (tokenData.marketCap > 10000000) score += 1.5; // > $10M
        else if (tokenData.marketCap > 1000000) score += 1.0; // > $1M
        else if (tokenData.marketCap > 100000) score += 0.5; // > $100K
        
        // Liquidity score (0-1.5 points)
        if (tokenData.liquidity > 1000000) score += 1.5; // > $1M
        else if (tokenData.liquidity > 100000) score += 1.0; // > $100K
        else if (tokenData.liquidity > 10000) score += 0.5; // > $10K
        
        // Organic score bonus (0-1 point)
        if (tokenData.organicScore > 80) score += 1.0;
        else if (tokenData.organicScore > 50) score += 0.5;
        
        // Cap at 9.9 (no perfect 10)
        return Math.min(score, 9.9);
    }

    async processAndSaveTokens() {
        console.log(`\n${'='.repeat(80)}`);
        console.log(`🏁 [gRPCTrending] Processing discovered tokens...`);
        console.log(`${'='.repeat(80)}`);
        
        // Fetch Jupiter data for all tokens
        const allTokenAddresses = Array.from(this.tokenSwaps.keys());
        const jupiterData = await this.fetchJupiterDataBatch(allTokenAddresses);
        
        // Store the fetched data
        jupiterData.forEach((data, address) => {
            this.tokenData.set(address, data);
        });
        
        // Filter and rank tokens
        const validTokens = Array.from(this.tokenSwaps.entries())
            .filter(([token]) => {
                if (EXCLUDED_TOKENS.has(token)) return false;
                if (this.isBondingCurve(token)) {
                    console.log(`🌊 [gRPCTrending] Filtering bonding curve: ${token.substring(0,8)}...`);
                    return false;
                }
                if (this.isSuspiciousToken(token)) {
                    console.log(`🚫 [gRPCTrending] Filtering suspicious: ${token.substring(0,8)}...`);
                    return false;
                }
                return true;
            })
            .map(([token, swapCount]) => {
                const tokenData = this.tokenData.get(token) || {};
                const score = this.calculateScore(tokenData, swapCount);
                
                return {
                    contractAddress: token,
                    symbol: tokenData.symbol || 'UNKNOWN',
                    name: tokenData.name || 'Unknown Token',
                    logo: tokenData.logo || null,
                    decimals: tokenData.decimals || 9,
                    priceUsd: tokenData.priceUsd || 0,
                    marketCap: tokenData.marketCap || 0,
                    liquidity: tokenData.liquidity || 0,
                    volume24h: tokenData.volume24h || 0,
                    swapCount5min: swapCount,
                    score: score,
                    organicScore: tokenData.organicScore,
                    organicScoreLabel: tokenData.organicScoreLabel,
                    source: 'gRPC-Trending',
                    discoveredAt: new Date().toISOString(),
                    lastUpdated: new Date().toISOString()
                };
            })
            .sort((a, b) => b.score - a.score)
            .slice(0, this.topTokensCount);

        console.log(`\n💎 [gRPCTrending] Found ${validTokens.length} valid tokens`);
        
        // Feed tokens into EnhancedTokenProcessor for full workflow (Twitter + Scoring)
        if (this.enhancedTokenProcessor && validTokens.length > 0) {
            console.log(`🔄 [gRPCTrending] Feeding ${validTokens.length} tokens into EnhancedTokenProcessor...`);
            await this.feedTokensIntoProcessor(validTokens);
        } else {
            console.log(`⚠️ [gRPCTrending] No token processor available, saving directly to cache`);
            await this.saveToTokensCache(validTokens);
        }
        
        return validTokens;
    }

    async feedTokensIntoProcessor(tokens) {
        try {
            console.log(`📥 [gRPCTrending] Adding ${tokens.length} tokens to processor queue...`);
            
            // Add tokens to the processor's queue
            // The processor will handle: Jupiter data enrichment → Twitter data → Scoring → Saving
            for (const token of tokens) {
                this.enhancedTokenProcessor.processingQueue.push(token);
            }
            
            console.log(`✅ [gRPCTrending] Added ${tokens.length} tokens to processor queue (total queue: ${this.enhancedTokenProcessor.processingQueue.length})`);
            
            // Trigger the processor to run if it's not already processing
            if (!this.enhancedTokenProcessor.isProcessing) {
                console.log(`🚀 [gRPCTrending] Starting EnhancedTokenProcessor workflow...`);
                // Run through Jupiter → Twitter → Scoring → Saving stages
                await this.enhancedTokenProcessor.processJupiterStage();
                await this.enhancedTokenProcessor.processTwitterStage();
                await this.enhancedTokenProcessor.processScoringStage();
                await this.enhancedTokenProcessor.saveFinalDatabase();
                console.log(`✅ [gRPCTrending] Processor workflow completed`);
            } else {
                console.log(`⏳ [gRPCTrending] Processor already running, tokens will be picked up in next cycle`);
            }
            
        } catch (error) {
            console.error('❌ [gRPCTrending] Error feeding tokens into processor:', error.message);
            // Fallback to direct save
            console.log(`⚠️ [gRPCTrending] Falling back to direct cache save`);
            await this.saveToTokensCache(tokens);
        }
    }

    async saveToTokensCache(newTokens) {
        try {
            const cachePath = path.join(this.cacheDir, 'tokens-cache.json');
            
            // Load existing cache
            let existingTokens = [];
            try {
                if (await fs.access(cachePath).then(() => true).catch(() => false)) {
                    const cacheData = await fs.readFile(cachePath, 'utf8');
                    const parsed = JSON.parse(cacheData);
                    existingTokens = Array.isArray(parsed) ? parsed : (parsed.tokens || []);
                    console.log(`📊 [gRPCTrending] Loaded ${existingTokens.length} existing tokens from cache`);
                }
            } catch (error) {
                console.warn('⚠️ [gRPCTrending] Could not load existing cache, starting fresh:', error.message);
            }
            
            // Merge new tokens with existing (deduplicate by contractAddress)
            const existingMap = new Map(existingTokens.map(t => [t.contractAddress, t]));
            
            newTokens.forEach(token => {
                const existing = existingMap.get(token.contractAddress);
                if (existing) {
                    // Update existing token with new data
                    existingMap.set(token.contractAddress, {
                        ...existing,
                        ...token,
                        lastUpdated: new Date().toISOString()
                    });
                } else {
                    // Add new token
                    existingMap.set(token.contractAddress, token);
                }
            });
            
            const finalTokens = Array.from(existingMap.values());
            
            // Atomic write
            const tempPath = cachePath + '.tmp';
            const jsonData = JSON.stringify(finalTokens, null, 2);
            
            await fs.writeFile(tempPath, jsonData, 'utf8');
            await fs.rename(tempPath, cachePath);
            
            console.log(`💾 [gRPCTrending] Saved ${newTokens.length} new tokens to cache (total: ${finalTokens.length})`);
            
            return true;
        } catch (error) {
            console.error('❌ [gRPCTrending] Error saving to cache:', error);
            return false;
        }
    }

    async stopMonitoring() {
        console.log('\n🛑 [gRPCTrending] Stopping monitoring...');
        
        if (this.stream) {
            this.stream.end();
            this.stream = null;
        }
        
        this.isRunning = false;
        
        const duration = (Date.now() - this.stats.startTime) / 1000;
        console.log(`\n📊 [gRPCTrending] Final Stats:`);
        console.log(`   Duration: ${duration.toFixed(1)}s`);
        console.log(`   Total swaps: ${this.stats.swapsDetected}`);
        console.log(`   Swaps/sec: ${(this.stats.swapsDetected / duration).toFixed(2)}`);
        console.log(`   Unique tokens: ${this.tokenSwaps.size}`);
        console.log(`   Pools discovered: ${this.stats.poolsDiscovered.size}`);
    }

    // Public method to run a discovery cycle
    async runDiscoveryCycle() {
        if (this.isRunning) {
            console.log('⚠️ [gRPCTrending] Discovery cycle already running');
            return null;
        }

        const initialized = await this.initialize();
        if (!initialized) {
            console.error('❌ [gRPCTrending] Failed to initialize');
            return null;
        }

        await this.startMonitoring();
        
        // Wait for monitoring to complete
        return new Promise((resolve) => {
            const checkInterval = setInterval(() => {
                if (!this.isRunning) {
                    clearInterval(checkInterval);
                    resolve(true);
                }
            }, 1000);
        });
    }
}

export default gRPCTrendingService;

