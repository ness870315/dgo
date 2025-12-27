import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import { Connection, PublicKey } from '@solana/web3.js';
import { processTxForSwap } from './SwapDetectionHelpers.mjs';

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

// Exclude SOL, stablecoins, wrapped tokens, and staking tokens
const EXCLUDED_TOKENS = new Set([
    'So11111111111111111111111111111111111111112', // Wrapped SOL
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
    'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
    '2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo', // PayPal USD (PYUSD)
    'cbbtcf3aa214zXHbiAZQwf4122FBYbraNdFqgw4iMij', // Coinbase Wrapped BTC (cbBTC)
    '3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh', // Wrapped BTC (Portal) (WBTC)
    '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs', // Ether (Portal) (ETH)
    'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So', // Marinade staked SOL (mSOL)
    'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn', // Jito Staked SOL (JitoSOL)
    'jupSoLaHXQiZZTSfEWMTRRgpnyFm8f6sZdosWBjx93v', // Jupiter Staked SOL (JupSOL)
    'EX8AQmPLGAKuJ1HGaDCu5ZwyPQK1xn8Y9REMN8soyvEs', // TeslaAI (scam)
    'BAZ2uNKcANstKoqSzzbMd89eDVhLRKdFdQAZsPdwUQ4Q', // Scam token
    'EHVebVwCTrqvdGLKisU5M5ikW5VHRALx93XvHa7zJLBR', // TRUMPET (scam)
]);

class gRPCTrendingService {
    constructor(enhancedHybridPriceService = null, enhancedTokenProcessor = null) {
        this.grpcClient = null;
        this.grpcInitialized = false;
        this.grpcWrapper = null;
        this.stream = null;
        this.clientInstanceId = `gtr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
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
        this.topTokensCount = parseInt(process.env.TOP_TRENDING_TOKENS_COUNT || '50', 10);
        this.continuousInterval = null; // For continuous mode
        this.solPrice = 200; // Default SOL price, will be updated from enhancedHybridPriceService
    }

    async initialize() {
        console.log(`🔌 [gRPCTrending] Initializing gRPC client (instance ${this.clientInstanceId})...`);

        if (this.grpcInitialized && this.grpcClient) {
            console.log(`⚠️ [gRPCTrending] gRPC client already initialized (instance ${this.clientInstanceId})`);
            return true;
        }

        try {
            if (!this.grpcWrapper) {
                const { createRequire } = await import('module');
                const require = createRequire(import.meta.url);
                const GrpcWrapper = require('./GrpcWrapper.cjs');
                this.grpcWrapper = new GrpcWrapper();
            }

            this.grpcClient = await this.grpcWrapper.createClient(CONSTANT_K_GRPC_ENDPOINT, CONSTANT_K_GRPC_TOKEN);
            this.grpcInitialized = true;
            console.log(`✅ [gRPCTrending] gRPC client initialized (instance ${this.clientInstanceId})`);
            return true;
        } catch (error) {
            console.error('❌ [gRPCTrending] Failed to initialize:', error);
            this.grpcInitialized = false;
            this.grpcClient = null;
            return false;
        }
    }

    async startMonitoring() {
        if (this.isRunning) {
            console.log('⚠️ [gRPCTrending] Already running');
            return;
        }

        if (!this.grpcInitialized || !this.grpcClient) {
            const ok = await this.initialize();
            if (!ok) {
                console.error('❌ [gRPCTrending] Cannot start monitoring without gRPC client');
                return;
            }
        }

        if (this.stream) {
            console.warn(`⚠️ [gRPCTrending] Existing stream detected, closing before starting new one (instance ${this.clientInstanceId})`);
            this.stream.end();
            this.stream = null;
        }

        console.log(`\n🚀 [gRPCTrending] Starting token discovery...`);
        console.log(`   Monitoring: Raydium + Orca + Meteora + Jupiter + Phoenix`);
        console.log(`   Duration: ${this.monitoringDuration / 60000} minutes`);
        console.log(`   Filtering: Bonding curve tokens excluded\n`);

        this.isRunning = true;
        this.stats.startTime = Date.now();

        try {
            const CommitmentLevel = this.grpcWrapper.getCommitmentLevel() || { CONFIRMED: 1 };
            const commitmentLevel = CommitmentLevel.CONFIRMED || 1; // Use numeric value (1 = CONFIRMED)
            
            const transactionFilters = {
                client: {
                    accountInclude: DEX_PROGRAMS,
                    accountExclude: [],
                    accountRequired: [],
                    vote: false,
                    failed: false
                }
            };

            // Use subscribeOnce (same as DexScreenerStyleMonitor and EnhancedHybridPriceService)
            this.stream = await this.grpcClient.subscribeOnce(
                {}, // accounts
                {}, // slots
                transactionFilters, // transactions
                {}, // blocks
                {}, // blocksMeta
                {}, // entry
                {}, // transactionsStatus
                commitmentLevel, // CONFIRMED (numeric: 1)
                [] // accountsDataSlice
            );

            console.log(`✅ [gRPCTrending] Subscribed to transaction stream (instance ${this.clientInstanceId})`);

            this.stream.on('data', (msg) => {
                // Only process if message has transaction (same as DexScreenerStyleMonitor)
                if (msg.transaction) {
                    this.processTransaction(msg);
                } else {
                    // Debug: Log first few non-transaction messages
                    if (this.stats.totalTransactions === 0) {
                        console.log(`🔍 [gRPCTrending] First message (no transaction):`, {
                            keys: Object.keys(msg),
                            type: typeof msg,
                            hasTransaction: !!msg.transaction
                        });
                    }
                }
            });

            this.stream.on('error', (error) => {
                console.error(`❌ [gRPCTrending] Stream error (instance ${this.clientInstanceId}):`, error.message);
                this.stats.errors++;
            });

            this.stream.on('end', () => {
                console.log(`🔚 [gRPCTrending] Stream ended (instance ${this.clientInstanceId})`);
                this.stream = null;
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
            
            // Get SOL price from enhancedHybridPriceService if available
            const solPrice = this.enhancedHybridPriceService?.solPriceUSD || this.solPrice || 200;
            
            // Extract transaction data structure (match DexScreenerStyleMonitor exactly)
            const txData = msg.transaction;
            if (!txData || !txData.transaction) {
                if (this.stats.totalTransactions <= 3) {
                    console.log(`⚠️ [gRPCTrending] Transaction ${this.stats.totalTransactions}: Missing txData or txData.transaction`);
                }
                return;
            }
            
            // Build transaction object for processTxForSwap (match DexScreenerStyleMonitor structure)
            const tx = {
                transaction: txData.transaction,
                meta: txData.meta || msg.meta,
                signature: txData.transaction?.signatures?.[0] || msg.signature,
                slot: msg.slot || txData.slot,
                blockTime: msg.blockTime || txData.blockTime
            };
            
            // Debug: Log first few transactions to understand structure
            if (this.stats.totalTransactions <= 3) {
                console.log(`🔍 [gRPCTrending] Transaction ${this.stats.totalTransactions} structure:`, {
                    hasTransaction: !!tx.transaction,
                    hasMeta: !!tx.meta,
                    hasSignature: !!tx.signature,
                    msgKeys: Object.keys(msg),
                    txDataKeys: txData ? Object.keys(txData) : 'no txData'
                });
            }
            
            if (!tx.transaction || !tx.meta) {
                if (this.stats.totalTransactions <= 3) {
                    console.log(`⚠️ [gRPCTrending] Skipping transaction ${this.stats.totalTransactions}: missing transaction or meta`);
                }
                return;
            }

            // Extract all token mints from pre/post token balances
            const preTokenBalances = tx.meta.preTokenBalances || [];
            const postTokenBalances = tx.meta.postTokenBalances || [];
            const tokenMints = new Set();
            
            [...preTokenBalances, ...postTokenBalances].forEach(balance => {
                if (balance.mint && !EXCLUDED_TOKENS.has(balance.mint)) {
                    tokenMints.add(balance.mint);
                }
            });
            
            if (tokenMints.size === 0) {
                if (this.stats.totalTransactions <= 3) {
                    console.log(`⚠️ [gRPCTrending] Transaction ${this.stats.totalTransactions}: No token mints found (pre: ${preTokenBalances.length}, post: ${postTokenBalances.length})`);
                }
                return;
            }
            
            if (this.stats.totalTransactions <= 3) {
                console.log(`✅ [gRPCTrending] Transaction ${this.stats.totalTransactions}: Found ${tokenMints.size} token mints`);
            }

            // Try to decode swaps for each token mint found
            const tokenPriceCache = new Map();
            const processedSwaps = new Set(); // Track swap signatures to avoid duplicates
            
            tokenMints.forEach(mint => {
                try {
                    const swap = processTxForSwap(
                        tx,
                        mint,
                        solPrice,
                        tokenPriceCache,
                        null, // midPriceUsd = null (disable price outlier filter)
                        null, // raydiumDecoder
                        null  // knownPoolAddress (let it discover)
                    );
                    
                    if (swap && swap.signature && !processedSwaps.has(swap.signature)) {
                        processedSwaps.add(swap.signature);
                        this.stats.swapsDetected++;
                        
                        // Debug: Log first few swaps
                        if (this.stats.swapsDetected <= 3) {
                            console.log(`✅ [gRPCTrending] Swap ${this.stats.swapsDetected} detected:`, {
                                mintAddress: swap.mintAddress?.substring(0, 8),
                                counterMint: swap.counterMint?.substring(0, 8),
                                volumeUsd: swap.volumeUsd?.toFixed(2),
                                poolAddress: swap.poolAddress?.substring(0, 8)
                            });
                        }
                        
                        // Track both token mints from the swap
                        // processTxForSwap returns: mintAddress (target) and counterMint (what we're trading against)
                        const tokenA = swap.mintAddress || swap.tokenMint; // The target token we're looking for
                        const tokenB = swap.counterMint; // What we're trading against (SOL, USDC, etc.)
                        
                        // Track the target token (mintAddress)
                        if (tokenA && !EXCLUDED_TOKENS.has(tokenA)) {
                            this.stats.tokensSeen.add(tokenA);
                            const count = this.tokenSwaps.get(tokenA) || 0;
                            this.tokenSwaps.set(tokenA, count + 1);
                            
                            const volume = this.tokenVolumes.get(tokenA) || 0;
                            this.tokenVolumes.set(tokenA, volume + (swap.volumeUsd || 0));
                        }
                        
                        // Also track the counter token if it's not excluded (for completeness)
                        if (tokenB && !EXCLUDED_TOKENS.has(tokenB)) {
                            this.stats.tokensSeen.add(tokenB);
                            const count = this.tokenSwaps.get(tokenB) || 0;
                            this.tokenSwaps.set(tokenB, count + 1);
                            
                            const volume = this.tokenVolumes.get(tokenB) || 0;
                            this.tokenVolumes.set(tokenB, volume + (swap.volumeUsd || 0));
                        }
                        
                        if (swap.poolAddress) {
                            this.stats.poolsDiscovered.add(swap.poolAddress);
                        }
                    }
                } catch (error) {
                    // Silent fail for individual token decoding
                }
            });
        } catch (error) {
            this.stats.errors++;
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
                const JUPITER_API_ENDPOINT = process.env.JUP_API_ENDPOINT || 'https://api.jup.ag';
                const JUPITER_API_KEY = process.env.JUP_API_KEY || '';
                
                const headers = {};
                if (JUPITER_API_KEY) {
                  headers['x-api-key'] = JUPITER_API_KEY;
                }
                
                const query = batch.join(',');
                const response = await axios.get(`${JUPITER_API_ENDPOINT}/tokens/v2/search?query=${query}`, {
                    headers: headers,
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
                                stats1h: tokenData.stats1h || {},
                                stats6h: tokenData.stats6h || {},
                                stats24h: tokenData.stats24h || {},
                                bondingCurve: tokenData.bondingCurve || null,
                                graduatedAt: tokenData.graduatedAt || null,
                                launchpad: tokenData.launchpad || null
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
    
    /**
     * L2 Filter: Check if token is valid (has price, market cap, liquidity, volume)
     */
    isValidToken(tokenAddress) {
        const tokenData = this.tokenData.get(tokenAddress);
        if (!tokenData) return false;
        
        // Must have at least a price OR market cap OR liquidity to be valid
        const hasPrice = tokenData.priceUsd && tokenData.priceUsd > 0;
        const hasMarketCap = tokenData.marketCap && tokenData.marketCap > 0;
        const hasLiquidity = tokenData.liquidity && tokenData.liquidity > 0;
        
        // If token has none of these, it's invalid/non-tradeable
        if (!hasPrice && !hasMarketCap && !hasLiquidity) {
            return false;
        }
        
        // Minimum market cap requirement: must be strictly greater than $10,000
        const MIN_MARKET_CAP = 10000;
        if (hasMarketCap && tokenData.marketCap <= MIN_MARKET_CAP) {
            return false;
        }
        
        // Also check if market cap is missing or 0 - require at least $10,000
        if (!hasMarketCap || tokenData.marketCap === 0) {
            return false;
        }
        
        // Minimum 24h volume requirement: must be at least $5,000
        const MIN_VOLUME_24H = 5000;
        const volume24h = tokenData.volume24h || 0;
        if (volume24h < MIN_VOLUME_24H) {
            return false;
        }
        
        return true;
    }

    /**
     * L2 Filter: Check if token has rugged (crashed significantly)
     */
    isRuggedToken(tokenAddress) {
        const tokenData = this.tokenData.get(tokenAddress);
        if (!tokenData) return false;
        
        const stats1h = tokenData.stats1h || {};
        const stats6h = tokenData.stats6h || {};
        const stats24h = tokenData.stats24h || {};
        
        // Check for large negative price changes (indicating a rug pull or crash)
        // 1h: > -20% drop is suspicious
        const priceChange1h = stats1h.priceChange || 0;
        if (priceChange1h < -20) return true;
        
        // 6h: > -30% drop is very suspicious
        const priceChange6h = stats6h.priceChange || 0;
        if (priceChange6h < -30) return true;
        
        // 24h: > -50% drop indicates a major crash/rug
        const priceChange24h = stats24h.priceChange || 0;
        if (priceChange24h < -50) return true;
        
        // Check for large liquidity drops (rug pull indicator)
        const liquidityChange1h = stats1h.liquidityChange || 0;
        const liquidityChange6h = stats6h.liquidityChange || 0;
        const liquidityChange24h = stats24h.liquidityChange || 0;
        
        // If liquidity dropped > 50% in 6h or 24h, likely rugged
        if (liquidityChange6h < -50 || liquidityChange24h < -50) return true;
        
        // Check if market cap is very low compared to volume (indicates recent crash)
        // If volume is high but market cap is very low, it likely crashed
        const volume24h = tokenData.volume24h || 0;
        const marketCap = tokenData.marketCap || 0;
        
        // If 24h volume is > 3x the current market cap, likely crashed
        // (e.g., had $100k mcap, did $300k volume, now at $9k mcap = rugged)
        if (volume24h > 0 && marketCap > 0 && volume24h > marketCap * 3) {
            // Additional check: if price dropped significantly, confirm it's rugged
            if (priceChange24h < -40 || priceChange6h < -25) {
                return true;
            }
        }
        
        return false;
    }

    isBondingCurve(tokenAddress) {
        const tokenData = this.tokenData.get(tokenAddress);
        
        // Check bonding curve progress from Jupiter data
        const bondingCurveProgress = tokenData?.bondingCurve !== null && tokenData?.bondingCurve !== undefined 
            ? parseFloat(tokenData.bondingCurve) 
            : null;
        
        // If bonding curve progress is < 100%, it's a bonding curve token
        if (bondingCurveProgress !== null && bondingCurveProgress < 100) {
            return true;
        }
        
        // Legacy check: If no Jupiter data at all, likely bonding curve
        if (!tokenData) return true;
        
        // Legacy check: If no market cap or liquidity, likely bonding curve
        if (!tokenData.marketCap || tokenData.marketCap === 0) return true;
        if (!tokenData.liquidity || tokenData.liquidity === 0) return true;
        
        // Very low liquidity compared to market cap (<0.1%) = bonding curve
        if (tokenData.marketCap && tokenData.liquidity) {
            const liquidityRatio = (tokenData.liquidity / tokenData.marketCap) * 100;
            if (liquidityRatio < 0.1) return true;
        }
        
        return false;
    }

    isStableOrWrappedToken(tokenAddress) {
        const tokenData = this.tokenData.get(tokenAddress);
        if (!tokenData) return false;
        
        const symbol = (tokenData.symbol || '').toUpperCase();
        const name = (tokenData.name || '').toUpperCase();
        
        // Stablecoin patterns
        const stablePatterns = ['USD', 'USDT', 'USDC', 'PYUSD', 'BUSD', 'DAI', 'TUSD', 'PAX', 'GUSD', 'HUSD'];
        if (stablePatterns.some(pattern => symbol.includes(pattern) || name.includes(pattern))) {
            return true;
        }
        
        // Wrapped token patterns
        const wrappedPatterns = ['WBTC', 'WETH', 'WBNB', 'WAVAX', 'WMATIC', 'WRAPPED', 'CBTC'];
        if (wrappedPatterns.some(pattern => symbol.includes(pattern) || name.includes(pattern))) {
            return true;
        }
        
        // Staking token patterns
        const stakingPatterns = ['STAKED', 'STSOL', 'MSOL', 'JSOL', 'JITOSOL', 'JUPITERSOL', 'MARINADE'];
        if (stakingPatterns.some(pattern => symbol.includes(pattern) || name.includes(pattern))) {
            return true;
        }
        
        // Portal/wormhole wrapped tokens
        if (name.includes('PORTAL') || name.includes('WORMHOLE')) {
            return true;
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
        
        // Check mint/freeze authority (handle both boolean and string formats)
        // mintAuthorityDisabled === false means mint authority is ENABLED (suspicious)
        // freezeAuthorityDisabled === false means freeze authority is ENABLED (suspicious)
        if (audit.mintAuthorityDisabled === false) return true;
        if (audit.freezeAuthorityDisabled === false) return true;
        
        // Also check string format (mintAuth=enabled, freezeAuth=enabled)
        if (audit.mintAuth === 'enabled' || audit.mintAuthority === 'enabled') return true;
        if (audit.freezeAuth === 'enabled' || audit.freezeAuthority === 'enabled') return true;
        
        // Check top holders percentage (if > 50%, suspicious)
        if (audit.topHoldersPercentage && audit.topHoldersPercentage > 50) return true;
        
        // Check liquidity/market cap ratio (should be at least 5%)
        // Very low liquidity ratio indicates unlocked liquidity (scam risk)
        // Legitimate tokens typically have 5-20% liquidity locked
        if (tokenData.marketCap && tokenData.liquidity) {
            const liquidityRatio = (tokenData.liquidity / tokenData.marketCap) * 100;
            
            // If liquidity is < 2% of market cap, it's very suspicious (likely unlocked)
            if (liquidityRatio < 2) return true;
            
            // If liquidity is < 5% of market cap, it's suspicious (unlocked liquidity risk)
            const volume24h = tokenData.volume24h || 0;
            if (liquidityRatio < 5) {
                // If volume is significant (> $10K), low liquidity is risky
                if (volume24h > 10000) {
                    return true;
                }
            }
            
            // If liquidity is < 7% of market cap AND has meaningful volume, it's suspicious
            // (unlocked liquidity can be pulled easily)
            if (liquidityRatio < 7 && volume24h > 20000) {
                return true;
            }
            
            // If liquidity is < 10% AND volume > liquidity, it's suspicious
            // (can be rugged easily with high volume but low locked liquidity)
            if (liquidityRatio < 10 && volume24h > tokenData.liquidity) {
                return true;
            }
        }
        
        // Check liquidity vs 24h volume ratio
        // If liquidity is very low compared to volume, it can be rugged easily
        const volume24h = tokenData.volume24h || 0;
        const liquidity = tokenData.liquidity || 0;
        if (liquidity > 0 && volume24h > 0) {
            // If 24h volume is > 5x liquidity, it's risky (unlocked liquidity can be pulled)
            if (volume24h > liquidity * 5) {
                return true;
            }
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
        
        // Filter and rank tokens (apply filters in order)
        const validTokens = Array.from(this.tokenSwaps.entries())
            .filter(([token]) => {
                // L1 Filter: Exclude SOL/stables (already done, but double-check)
                if (EXCLUDED_TOKENS.has(token)) {
                    return false;
                }
                
                const tokenData = this.tokenData.get(token);
                
                // L2 Filter: Valid token check (must have price/market cap/liquidity/volume)
                if (!this.isValidToken(token)) {
                    return false;
                }
                
                // L2 Filter: Stable/wrapped/staking tokens
                if (this.isStableOrWrappedToken(token)) {
                    console.log(`💵 [gRPCTrending] Filtering stable/wrapped/staking: ${token.substring(0,8)}... (${tokenData?.symbol || 'UNKNOWN'})`);
                    return false;
                }
                
                // L2 Filter: Rugged token check (crashed significantly)
                if (this.isRuggedToken(token)) {
                    console.log(`💥 [gRPCTrending] Filtering rugged token: ${token.substring(0,8)}... (${tokenData?.symbol || 'UNKNOWN'})`);
                    return false;
                }
                
                // L2 Filter: Bonding curve tokens (EXCLUDE FOR NOW)
                if (this.isBondingCurve(token)) {
                    console.log(`🌊 [gRPCTrending] Filtering bonding curve: ${token.substring(0,8)}... (${tokenData?.symbol || 'UNKNOWN'})`);
                    return false;
                }
                
                // L2 Filter: Suspicious token check
                if (this.isSuspiciousToken(token)) {
                    console.log(`🚫 [gRPCTrending] Filtering suspicious: ${token.substring(0,8)}... (${tokenData?.symbol || 'UNKNOWN'})`);
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

        console.log(`\n💎 [gRPCTrending] Found ${validTokens.length} valid trending tokens`);
        
        // Log discovered trending tokens
        if (validTokens.length > 0) {
            console.log(`\n${'='.repeat(80)}`);
            console.log(`📊 [gRPCTrending] DISCOVERED TRENDING TOKENS (${validTokens.length}):`);
            console.log(`${'='.repeat(80)}`);
            validTokens.forEach((token, index) => {
                console.log(`${index + 1}. ${token.symbol || 'UNKNOWN'} (${token.name || 'Unknown Token'})`);
                console.log(`   Contract: ${token.contractAddress}`);
                console.log(`   Score: ${token.score.toFixed(2)}/9.9 | Swaps (5min): ${token.swapCount5min}`);
                console.log(`   Market Cap: $${(token.marketCap / 1000000).toFixed(2)}M | Volume 24h: $${(token.volume24h / 1000).toFixed(2)}K`);
                console.log(`   Liquidity: $${(token.liquidity / 1000000).toFixed(2)}M | Organic Score: ${token.organicScore || 'N/A'}`);
                console.log('');
            });
            console.log(`${'='.repeat(80)}\n`);
        }
        
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
            console.log(`📥 [gRPCTrending] Checking ${tokens.length} tokens for duplicates...`);
            
            // Get existing tokens from processor's database to check for duplicates
            const existingTokens = this.enhancedTokenProcessor.processedTokens || [];
            const existingContracts = new Set(
                existingTokens
                    .filter(t => t.contractAddress)
                    .map(t => t.contractAddress.toLowerCase())
            );
            
            // Also check tokens already in processing queue
            const queuedContracts = new Set(
                this.enhancedTokenProcessor.processingQueue
                    .filter(t => t.contractAddress)
                    .map(t => t.contractAddress.toLowerCase())
            );
            
            // Filter out tokens that already exist in database or are already queued
            const newTokens = tokens.filter(token => {
                if (!token.contractAddress) return false;
                
                const contractLower = token.contractAddress.toLowerCase();
                
                // Skip if already in database
                if (existingContracts.has(contractLower)) {
                    console.log(`⏭️ [gRPCTrending] Skipping existing token: ${token.symbol || 'UNKNOWN'} (${token.contractAddress.substring(0, 8)}...) - already in database`);
                    return false;
                }
                
                // Skip if already in processing queue
                if (queuedContracts.has(contractLower)) {
                    console.log(`⏭️ [gRPCTrending] Skipping queued token: ${token.symbol || 'UNKNOWN'} (${token.contractAddress.substring(0, 8)}...) - already in queue`);
                    return false;
                }
                
                return true;
            });
            
            if (newTokens.length === 0) {
                console.log(`✅ [gRPCTrending] All ${tokens.length} tokens already exist in database or queue - nothing to process`);
                return;
            }
            
            console.log(`🆕 [gRPCTrending] Found ${newTokens.length} new tokens (${tokens.length - newTokens.length} duplicates filtered out)`);
            
            // Log tokens that will be processed
            console.log(`\n${'='.repeat(80)}`);
            console.log(`🚀 [gRPCTrending] TOKENS TO BE PROCESSED (${newTokens.length}):`);
            console.log(`${'='.repeat(80)}`);
            newTokens.forEach((token, index) => {
                console.log(`${index + 1}. ${token.symbol || 'UNKNOWN'} (${token.name || 'Unknown Token'})`);
                console.log(`   Contract: ${token.contractAddress}`);
                console.log(`   Score: ${token.score.toFixed(2)}/9.9 | Swaps (5min): ${token.swapCount5min}`);
                console.log(`   Market Cap: $${(token.marketCap / 1000000).toFixed(2)}M | Volume 24h: $${(token.volume24h / 1000).toFixed(2)}K`);
                console.log(`   Will go through: Jupiter → Twitter → Scoring → Database`);
                console.log('');
            });
            console.log(`${'='.repeat(80)}\n`);
            
            // Add only new tokens to the processor's queue
            // The processor will handle: Jupiter data enrichment → Twitter data → Scoring → Saving
            for (const token of newTokens) {
                this.enhancedTokenProcessor.processingQueue.push(token);
            }
            
            console.log(`✅ [gRPCTrending] Added ${newTokens.length} new tokens to processor queue (total queue: ${this.enhancedTokenProcessor.processingQueue.length})`);
            
            // Trigger the processor to run if it's not already processing
            if (!this.enhancedTokenProcessor.isProcessing) {
                console.log(`🚀 [gRPCTrending] Starting EnhancedTokenProcessor workflow...`);
                
                // Store the contract addresses of tokens we're processing to track them
                const processingContracts = new Set(newTokens.map(t => t.contractAddress.toLowerCase()));
                const processingContractsArray = Array.from(processingContracts);
                
                // Get count of tokens in database before processing
                const tokensBeforeSave = (this.enhancedTokenProcessor.processedTokens || []).length;
                
                // Run through Jupiter → Twitter → Scoring → Saving stages
                await this.enhancedTokenProcessor.processJupiterStage();
                await this.enhancedTokenProcessor.processTwitterStage();
                await this.enhancedTokenProcessor.processScoringStage();
                await this.enhancedTokenProcessor.saveFinalDatabase();
                
                // Check which tokens were successfully saved to database
                // Look for tokens that match our processing contracts and were just added
                const allProcessedTokens = this.enhancedTokenProcessor.processedTokens || [];
                const savedTokens = allProcessedTokens
                    .filter(t => {
                        if (!t.contractAddress) return false;
                        const contractLower = t.contractAddress.toLowerCase();
                        return processingContracts.has(contractLower);
                    });
                
                if (savedTokens.length > 0) {
                    console.log(`\n${'='.repeat(80)}`);
                    console.log(`✅ [gRPCTrending] TOKENS ADDED TO DATABASE (${savedTokens.length}):`);
                    console.log(`${'='.repeat(80)}`);
                    savedTokens.forEach((token, index) => {
                        console.log(`${index + 1}. ${token.symbol || 'UNKNOWN'} (${token.name || 'Unknown Token'})`);
                        console.log(`   Contract: ${token.contractAddress}`);
                        console.log(`   Overall Score: ${token.overallScore ? token.overallScore.toFixed(2) : 'N/A'}`);
                        console.log(`   Market Cap: $${token.marketCap ? (token.marketCap / 1000000).toFixed(2) + 'M' : 'N/A'}`);
                        console.log(`   Volume 24h: $${token.volume24h ? (token.volume24h / 1000).toFixed(2) + 'K' : 'N/A'}`);
                        console.log(`   Twitter Mentions: ${token.twitterData?.mentions || 0}`);
                        console.log(`   Source: ${token.source || 'gRPC-Trending'}`);
                        console.log(`   ✅ Successfully saved to database`);
                        console.log('');
                    });
                    console.log(`${'='.repeat(80)}\n`);
                } else {
                    console.log(`⚠️ [gRPCTrending] No tokens from this batch were found in database yet (may still be processing or failed)`);
                    console.log(`   Expected: ${processingContractsArray.length} tokens`);
                    console.log(`   Processing contracts: ${processingContractsArray.slice(0, 5).join(', ')}${processingContractsArray.length > 5 ? '...' : ''}`);
                }
                
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
        console.log(`\n🛑 [gRPCTrending] Stopping monitoring (instance ${this.clientInstanceId})...`);

        if (this.stream) {
            try {
                this.stream.end();
            } catch (err) {
                console.warn(`⚠️ [gRPCTrending] Error ending stream (instance ${this.clientInstanceId}):`, err.message);
            }
            this.stream = null;
        }

        this.isRunning = false;
        
        const duration = (Date.now() - this.stats.startTime) / 1000;
        console.log(`\n📊 [gRPCTrending] Cycle Stats:`);
        console.log(`   Duration: ${duration.toFixed(1)}s`);
        console.log(`   Total swaps: ${this.stats.swapsDetected}`);
        console.log(`   Swaps/sec: ${(this.stats.swapsDetected / duration).toFixed(2)}`);
        console.log(`   Unique tokens: ${this.tokenSwaps.size}`);
        console.log(`   Pools discovered: ${this.stats.poolsDiscovered.size}`);
    }

    /**
     * Start continuous monitoring mode (runs every 5 minutes)
     */
    async startContinuousMonitoring() {
        if (this.continuousMode) {
            console.log('⚠️ [gRPCTrending] Continuous monitoring already running');
            return;
        }

        this.continuousMode = true;
        console.log(`\n🔄 [gRPCTrending] Starting continuous monitoring mode (every ${this.monitoringDuration / 60000} minutes)...`);

        // Run first cycle immediately
        await this.runDiscoveryCycle();

        // Then run every 5 minutes
        this.continuousInterval = setInterval(async () => {
            if (!this.continuousMode) {
                clearInterval(this.continuousInterval);
                return;
            }

            // Reset swap tracking for next cycle (keep token data for reference)
            this.tokenSwaps.clear();
            this.tokenVolumes.clear();
            this.stats.swapsDetected = 0;
            this.stats.poolsDiscovered.clear();
            this.stats.tokensSeen.clear();

            console.log(`\n${'='.repeat(80)}`);
            console.log(`🔄 [gRPCTrending] Starting next discovery cycle...`);
            console.log(`${'='.repeat(80)}`);

            await this.runDiscoveryCycle();
        }, this.monitoringDuration);
    }

    /**
     * Stop continuous monitoring mode
     */
    stopContinuousMonitoring() {
        if (this.continuousInterval) {
            clearInterval(this.continuousInterval);
            this.continuousInterval = null;
        }
        this.continuousMode = false;
        console.log('🛑 [gRPCTrending] Continuous monitoring stopped');
    }

    isGrpcInitialized() {
        return !!this.grpcInitialized && !!this.grpcClient;
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

        // Reset stats for this cycle
        this.stats.startTime = Date.now();
        this.stats.swapsDetected = 0;
        this.stats.poolsDiscovered.clear();
        this.stats.tokensSeen.clear();
        this.stats.totalTransactions = 0;
        this.stats.errors = 0;

        await this.startMonitoring();
        
        // Wait for monitoring to complete (startMonitoring sets up a timeout that stops after monitoringDuration)
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

