import axios from 'axios';
import EventEmitter from 'events';
import fs from 'fs/promises';
import path from 'path';
import bs58 from 'bs58';
import ChartDatabase from './ChartDatabase.js';
import { processTxForSwap, buildCombinedKeys, guessPoolFromIx, extractRaydiumPoolFromIx } from './SwapDetectionHelpers.mjs';
import RaydiumPoolDecoder from './RaydiumPoolDecoder.mjs';
import RaydiumCPMMDecoder from './RaydiumCPMMDecoder.mjs';
import RaydiumCLMMDecoder from './RaydiumCLMMDecoder.mjs';
import SolanaVibeStationSSE from './SolanaVibeStationSSE.js';

// Use CommonJS wrapper for gRPC loading
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
let GrpcWrapper = null;

// Updated to new Constant K RPC endpoint with correct API key (Nov 2025)
const CONSTANT_K_RPC = 'https://rpc.constant-k.com/?api-key=39facrmt-om2u-4al5-5k4h-g8pls2y5vhui';
// Updated to new Constant K gRPC endpoint (Nov 2025)
const CONSTANT_K_GRPC_ENDPOINT = 'http://grpc.constant-k.com/';
const CONSTANT_K_GRPC_TOKEN = '39facrmt-om2u-4al5-5k4h-g8pls2y5vhui';
const JUPITER_API_BASE = 'https://lite-api.jup.ag/tokens/v2';
const DEXSCREENER_API_BASE = 'https://api.dexscreener.com/latest/dex';
const WSOL = 'So11111111111111111111111111111111111111112';

// DEX Program IDs for pool detection
const DEX_PROGRAMS = {
    'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA': 'PumpSwap', // Raydium-based
    'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C': 'PumpSwap CPMM',
    'cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG': 'Meteora DLMM', // Meteora Dynamic Liquidity Market Maker
    'HLnpSz9h2S4hiLQ43rnSD9XkcUThA7B8hQMKmDaiTLcC': 'Meteora Pool Authority', // Meteora pool authority PDA
    'OrcaEKTdK7LKz57vaAYr9QeNsVEPfiuwmQ9MUWfbx': 'Orca',
    'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK': 'Raydium CLMM',
    '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8': 'Raydium AMM'
};

// Addresses to exclude from swap detection (pool authorities, PDAs, etc.)
const EXCLUDED_SWAP_ADDRESSES = new Set([
    'HLnpSz9h2S4hiLQ43rnSD9XkcUThA7B8hQMKmDaiTLcC', // Meteora Pool Authority
    '11111111111111111111111111111111' // System Program (for safety)
]);

class EnhancedHybridPriceService extends EventEmitter {
    constructor(webSocketServer = null) {
        super();
        
        // 🚀 NEW: WebSocket server for real-time broadcasting
        this.webSocketServer = webSocketServer;
        
        // 🚀 NEW: Real-time streaming architecture
        this.grpcClient = null;
        this.grpcStreams = new Map(); // Map<tokenAddress, stream>
        this.activeStreams = new Map(); // Map<tokenAddress, stream> - for stats
        this.poolAddresses = new Map(); // Map<tokenAddress, poolAddress>
        this.realTimeUpdates = new Map(); // Map<tokenAddress, lastUpdate>
        this.swapHistory = new Map(); // Map<tokenAddress, swaps[]>
        
        // Reference point for slot-based timestamp estimation
        this.referenceSlot = null;
        this.referenceTimestamp = null;
        
        // 🚀 CRITICAL: Single shared stream for ALL tokens (efficiency!)
        this.sharedStreams = []; // Shared gRPC streams (batched token filters)
        this.sharedStreamPoolCount = 0; // Track how many tokens are attached to streams
        this._sharedStreamRestartScheduled = false;
        this.sharedStreamRetryCount = 0;
        this.sharedStreamBaseDelay = parseInt(process.env.CONSTANT_K_STREAM_BASE_DELAY || '120000', 10); // 2 minutes base delay
        this.sharedStreamMaxDelay = parseInt(process.env.CONSTANT_K_STREAM_MAX_DELAY || '180000', 10); // 3 minutes max delay
        this.sharedStreamJitter = parseInt(process.env.CONSTANT_K_STREAM_JITTER || '10000', 10); // 10 seconds jitter
        this.sharedStreamSubscribeDelay = parseInt(process.env.CONSTANT_K_STREAM_SUBSCRIBE_DELAY || '1000', 10);
        
        // 🚀 NEW: Token metadata cache (decimals, graduatedPool, etc.)
        this.tokenMetadataCache = new Map(); // Map<tokenAddress, tokenInfo>
        
        // 🚀 NEW: Token price cache for counter-token USD pricing
        this.tokenPriceCache = new Map(); // Map<mintAddress, usdPrice>
        
        // 🚀 NEW: Mid-price tracking for outlier detection
        this.midPriceUsd = new Map(); // Map<tokenAddress, midPriceUsd>
        
        // 🚀 NEW: Slot-to-timestamp estimation
        this.referenceSlot = null;
        this.referenceTimestamp = null;
        
        // Existing architecture
        this.priceCache = new Map();
        this.lastUpdate = new Map();
        this.updateInterval = 10000; // 10 seconds (for API requests)
        this.backgroundUpdateInterval = 5000; // 5 seconds (for WebSocket broadcasts)
        this.requestDelay = 1000; // 1 second delay between requests
        this.solPriceUSD = 0;
        this.lastSolPriceUpdate = 0;
        this.solPriceCacheDuration = 60000; // 1 minute
        
        // Request deduplication
        this.pendingRequests = new Map();
        this.activeConnections = new Map();
        
        // WebSocket integration
        this.webSocketServer = webSocketServer;
        this.subscribedTokens = new Set();
        this.priceUpdateInterval = null;
        
        // ✅ NEW: Periodic ranking broadcast
        this.rankingBroadcastInterval = null;
        
        // ✅ NEW: Periodic decoder stats logging
        this.decoderStatsInterval = null;

        // 🔍 Connection tracking
        this.grpcInitialized = false;
        this.clientInstanceId = `ehps-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        
        // 🚀 NEW: Token cache management (use persistent disk)
        this.tokenCache = [];
        const dataDir = process.env.DATA_DIR || '/var/data/dgo';
        this.cachePath = path.join(dataDir, 'cache', 'tokens-cache.json');
        
        // 🚀 NEW: Persistent swap storage
        this.chartDatabase = new ChartDatabase();
        
        // 🚀 NEW: Raydium decoders for 100% accurate swap detection
        this.raydiumDecoder = new RaydiumPoolDecoder(CONSTANT_K_RPC);
        this.raydiumCPMMDecoder = new RaydiumCPMMDecoder(CONSTANT_K_RPC);
        this.raydiumCLMMDecoder = new RaydiumCLMMDecoder(CONSTANT_K_RPC);
        console.log('✅ [EnhancedHybridPriceService] Raydium AMM decoder initialized');
        console.log('✅ [EnhancedHybridPriceService] Raydium CPMM decoder initialized');
        console.log('✅ [EnhancedHybridPriceService] Raydium CLMM decoder initialized');
        
        // 🚀 NEW: Solana Vibe Station SSE for real-time prices (primary source)
        this.sseService = null;
        this.useSolanaVibeSSE = process.env.ENABLE_SOLANA_VIBE_SSE !== 'false'; // Enabled by default
        this.ssePriceSource = new Map(); // Track which tokens are using SSE prices
        console.log(`📡 [EnhancedHybridPriceService] Solana Vibe Station SSE: ${this.useSolanaVibeSSE ? 'ENABLED' : 'DISABLED'}`);
        
        // Rate limiting protection for Jupiter API
        this.jupiterRequestQueue = [];
        this.jupiterRequestDelay = 1000; // 1 second between requests
        this.lastJupiterRequest = 0;
        this.jupiterCache = new Map();
        this.jupiterCacheDuration = 10 * 60 * 1000; // 10 minutes cache
        
        // 🚀 Rate limiting for pool decoding (prevent RPC 429 errors)
        this.poolDecodeQueue = [];
        this.poolDecodeInProgress = new Set(); // Track pools currently being decoded
        this.poolDecodeDelay = 500; // 500ms delay between pool decode requests
        this.lastPoolDecode = 0;
        this.poolDecodeProcessing = false;
        
        // Initialize asynchronously
        this.initializeAsync();
    }

    /**
     * Estimate timestamp from Solana slot
     * Solana produces approximately 2 slots per second
     */
    estimateTimestampFromSlot(slot) {
        // Get current slot and timestamp as reference
        const currentTime = Date.now();
        
        // Solana produces ~2 slots per second (approximately)
        // We'll track the slot difference from a known reference point
        if (!this.referenceSlot || !this.referenceTimestamp) {
            // First time: use current time as reference
            this.referenceSlot = slot;
            this.referenceTimestamp = currentTime;
            return currentTime;
        }
        
        // Calculate slot difference
        const slotDiff = slot - this.referenceSlot;
        
        // Convert slot difference to milliseconds (2 slots per second = 500ms per slot)
        const estimatedElapsed = slotDiff * 500;
        
        // Estimate timestamp
        const estimatedTimestamp = this.referenceTimestamp + estimatedElapsed;
        
        // Update reference if it's been too long
        if (Math.abs(slotDiff) > 1000) {
            this.referenceSlot = slot;
            this.referenceTimestamp = currentTime;
        }
        
        return estimatedTimestamp;
    }

    async initializeAsync() {
        try {
            await this.initializeGrpcClient();
            await this.loadTokenCache();
            await this.updateSolPrice(); // ✅ CRITICAL FIX: Initialize SOL price for swap detection
            
            // 🚀 NEW: Initialize Solana Vibe Station SSE (primary price source)
            if (this.useSolanaVibeSSE) {
                await this.initializeSSE();
            }
            
            // 🚀 NEW: Initialize persistent swap storage
            await this.chartDatabase.ensureDataDir(); // Ensure data directory exists
            this.chartDatabase.startBatchWriter(); // Start batch writer
            
            // ✅ CRITICAL FIX: Add PROBITY for continuous real-time monitoring
            this.poolAddresses.set('9N9V585yTpmosZacAcXLZWxKJEK7PbaH4RJ8gEKLD9sc', '98rxcGXHxfAQ39rgpN9qMGPLhgWfze1RmQ4PHprTvZFN');
            this.swapHistory.set('9N9V585yTpmosZacAcXLZWxKJEK7PbaH4RJ8gEKLD9sc', []);
            
            // ✅ CRITICAL FIX: Add E7NgL19JbN8BhUDgWjkH8MtnbhJoaGaWJqosxZZepump with ACTIVE PumpSwap pool!
            this.poolAddresses.set('E7NgL19JbN8BhUDgWjkH8MtnbhJoaGaWJqosxZZepump', 'GQU4GZjCPam77cpnCgfnavXDqMNiXgksnTidyhwfRAKN');
            this.swapHistory.set('E7NgL19JbN8BhUDgWjkH8MtnbhJoaGaWJqosxZZepump', []);
            
            // ✅ ADD MEMEPUTER for testing
            this.poolAddresses.set('5EpbKX221NYVidK6A2nJGhtuLPvrPiQ6shknLbtjBAGS', 'c9EQnny8sBVrkMCKvVua1AQTRSXW1TDw1zLwFLHvRXh');
            this.swapHistory.set('5EpbKX221NYVidK6A2nJGhtuLPvrPiQ6shknLbtjBAGS', []);
            
            // Also register in ChartDatabase for API access
            await this.chartDatabase.setPoolMapping('5EpbKX221NYVidK6A2nJGhtuLPvrPiQ6shknLbtjBAGS', 'c9EQnny8sBVrkMCKvVua1AQTRSXW1TDw1zLwFLHvRXh');
            
            // 🚀 NEW: Load and add ALL tokens from cache for gRPC monitoring
            await this.loadTopTokens();
            
            // 🚀 NEW: Automatically start SIMPLIFIED single-token monitoring after initialization
            if (this.grpcClient && this.poolAddresses.size > 0) {
                await this.startRealTimeMonitoring(); // This will call the simplified version
            }
            
            // ✅ NEW: Start periodic ranking broadcasts (every 30 seconds)
            if (this.webSocketServer) {
                this.startRankingBroadcasts(30000);
                
                // 🚀 NEW: Listen for client subscriptions to send recent swaps
                this.webSocketServer.on('tokenSubscription', ({ clientId, tokenAddress, sendRecentSwaps }) => {
                    if (sendRecentSwaps && this.swapHistory.has(tokenAddress)) {
                        // Send ALL swaps in memory (up to 1000, kept in swapHistory)
                        const allSwaps = this.swapHistory.get(tokenAddress);
                        this.webSocketServer.sendRecentSwapsToClient(clientId, tokenAddress, allSwaps);
                    }
                });
            }
            
            // ✅ NEW: Start periodic decoder stats logging (every 5 minutes)
            this.startDecoderStatsLogging(300000);
        } catch (error) {
            console.error('❌ [EnhancedHybridPriceService] Async initialization failed:', error.message);
        }
    }

    async initializeGrpcClient() {
        try {
            if (this.grpcClient) {
                console.log(`⚠️ [EnhancedHybridPriceService] gRPC client already initialized (instance ${this.clientInstanceId})`);
                return;
            }

            if (!GrpcWrapper) {
                GrpcWrapper = require('./GrpcWrapper.cjs');
            }
            
            this.grpcWrapper = new GrpcWrapper();
            this.grpcClient = await this.grpcWrapper.createClient(CONSTANT_K_GRPC_ENDPOINT, CONSTANT_K_GRPC_TOKEN);
            this.grpcInitialized = true;
            console.log(`✅ [EnhancedHybridPriceService] gRPC client initialized (instance ${this.clientInstanceId})`);
            
        } catch (error) {
            console.error('❌ [EnhancedHybridPriceService] Failed to initialize gRPC client:', error.message);
            this.grpcClient = null;
            this.grpcInitialized = false;
        }
    }

    isGrpcInitialized() {
        return !!this.grpcInitialized && !!this.grpcClient;
    }

    /**
     * Initialize Solana Vibe Station SSE service
     */
    async initializeSSE() {
        try {
            console.log('📡 [EnhancedHybridPriceService] Initializing Solana Vibe Station SSE...');
            
            // Create SSE service with reference to token metadata cache
            this.sseService = new SolanaVibeStationSSE(this.tokenMetadataCache);
            
            // Listen for price updates
            this.sseService.on('priceUpdate', (data) => {
                this.handleSSEPriceUpdate(data);
            });
            
            // Listen for connection events
            this.sseService.on('connected', (data) => {
                console.log(`✅ [SolanaVibeSSE] Connected with ${data.mintCount} mints`);
            });
            
            this.sseService.on('disconnected', () => {
                console.warn('⚠️ [SolanaVibeSSE] Disconnected - falling back to Constant K');
            });
            
            this.sseService.on('error', (error) => {
                console.error('❌ [SolanaVibeSSE] Error:', error.message);
            });
            
            this.sseService.on('maxReconnectAttemptsReached', () => {
                console.error('❌ [SolanaVibeSSE] Max reconnect attempts reached - SSE disabled');
                this.useSolanaVibeSSE = false;
            });
            
            console.log('✅ [EnhancedHybridPriceService] SSE service initialized');
            
        } catch (error) {
            console.error('❌ [EnhancedHybridPriceService] Failed to initialize SSE:', error.message);
            this.sseService = null;
            this.useSolanaVibeSSE = false;
        }
    }

    /**
     * Handle price update from SSE
     */
    handleSSEPriceUpdate(data) {
        try {
            const { mint, price, marketCap, avgPrice1min, avgPrice15min, avgPrice1h, avgPrice24h } = data;
            
            // Update price cache
            this.priceCache.set(mint, {
                price,
                marketCap,
                timestamp: Date.now(),
                source: 'sse',
                avgPrice1min,
                avgPrice15min,
                avgPrice1h,
                avgPrice24h
            });
            
            // Track that this mint is using SSE prices
            this.ssePriceSource.set(mint, Date.now());
            
            // Update last update time
            this.lastUpdate.set(mint, Date.now());
            
            // Broadcast to WebSocket clients if available
            if (this.webSocketServer) {
                this.webSocketServer.broadcast({
                    type: 'priceUpdate',
                    data: {
                        mint,
                        price,
                        marketCap,
                        source: 'sse',
                        timestamp: Date.now()
                    }
                });
            }
            
        } catch (error) {
            console.error('❌ [EnhancedHybridPriceService] Error handling SSE price update:', error.message);
        }
    }

    async loadTokenCache() {
        try {
            const data = await fs.readFile(this.cachePath, 'utf8');
            this.tokenCache = JSON.parse(data);
            
            // ✅ LOAD ALL TOKENS for monitoring (not just completed)
            const tokensToMonitor = this.tokenCache.filter(token => 
                token.contractAddress && // Must have contract address
                (token.jupiterData?.firstPool?.id || token.graduatedPool || token.birdEyeRaw?.firstPool?.id) // Must have a pool
            );
            
            // Extract pool addresses for real-time monitoring
            await this.extractPoolAddresses(tokensToMonitor);
            
        } catch (error) {
            console.error('❌ [EnhancedHybridPriceService] Failed to load token cache:', error.message);
            this.tokenCache = [];
        }
    }
    
    async extractPoolAddresses(tokens) {
        
        for (const token of tokens) {
            const contractAddress = token.contractAddress || token.tokenAddress;
            if (!contractAddress) continue;
            
            // Try to get pool address from existing data
            let poolAddress = null;
            
            // Check Jupiter data first
            if (token.jupiterData?.firstPool?.id) {
                poolAddress = token.jupiterData.firstPool.id;
            }
            // Check BirdEye data
            else if (token.birdEyeRaw?.firstPool?.id) {
                poolAddress = token.birdEyeRaw.firstPool.id;
            }
            // Check graduatedPool
            else if (token.graduatedPool) {
                poolAddress = typeof token.graduatedPool === 'string' ? token.graduatedPool : token.graduatedPool?.address;
            }
            
            if (poolAddress) {
                this.poolAddresses.set(contractAddress, poolAddress);
                this.swapHistory.set(contractAddress, []);
            }
        }
    }
    
    async loadTopTokens() {
        try {
            // ✅ Filter out stablecoins (known stablecoin addresses)
            const STABLECOIN_ADDRESSES = new Set([
                'USDSwr9ApdHk5bvJKMjzff41FfuX8bSxdKcR81vTwcA', // USDS
                'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So', // mSOL
                '6FrrzDk5mQARGc1TDYoyVnSyRdds1t4PbtohCD6p3tgG', // Unknown stablecoin
                'HzwqbKZw8HxMN6bF2yFZNrht3c2iXXzpKcFu7uBEDKtr'  // Unknown stablecoin
            ]);
            
            // Read tokens cache
            const cacheData = await fs.readFile(this.cachePath, 'utf8');
            const tokens = JSON.parse(cacheData);
            
            // Filter for tokens with pools, exclude stablecoins, and sort by score
            const tokensWithPools = tokens
                .filter(token => {
                    const address = token.contractAddress;
                    const hasPool = token.jupiterData?.firstPool?.id || 
                                   token.graduatedPool || 
                                   token.birdEyeRaw?.firstPool?.id;
                    return hasPool && address && !STABLECOIN_ADDRESSES.has(address);
                })
                .sort((a, b) => {
                    const scoreA = a.overallScore || a.score || 0;
                    const scoreB = b.overallScore || b.score || 0;
                    return scoreB - scoreA; // Sort descending
                });
                // ✅ REMOVED LIMIT: Process ALL tokens with pools, not just top 200
            
            // Add each token to monitoring AND populate metadata cache
            let addedCount = 0;
            let metadataCount = 0;
            for (const token of tokensWithPools) {
                const tokenAddress = token.contractAddress;
                // ✅ CRITICAL: Prioritize graduatedPool over firstPool
                const poolAddress = token.jupiterData?.graduatedPool ||
                                   token.graduatedPool || 
                                   token.jupiterData?.firstPool?.id || 
                                   token.birdEyeRaw?.firstPool?.id;
                
                if (poolAddress) {
                    // Add to poolAddresses if not already there
                    if (!this.poolAddresses.has(tokenAddress)) {
                        this.poolAddresses.set(tokenAddress, poolAddress);
                        this.swapHistory.set(tokenAddress, []);
                        addedCount++;
                    }
                    
                    // ✅ CRITICAL: ALWAYS populate metadata cache (even if token already in poolAddresses)
                    // This is important because extractPoolAddresses() adds tokens but doesn't populate metadata
                    // Extract price from multiple possible sources
                    const price = token.currentPrice || 
                                 token.price || 
                                 token.jupiterData?.price || 
                                 token.birdEyeRaw?.price || 
                                 0;
                    
                    const marketCap = token.marketCap || 
                                     token.jupiterData?.marketCap || 
                                     token.jupiterData?.mcap ||
                                     token.birdEyeRaw?.marketcap ||
                                     token.birdEyeRaw?.fdv ||
                                     0;
                    
                    const liquidity = token.jupiterData?.liquidity || 
                                     token.birdEyeRaw?.liquidity || 
                                     0;
                    
                    const supply = token.jupiterData?.totalSupply || 
                                  token.jupiterData?.circSupply ||
                                  token.supply || 
                                  0;
                    
                    const createdAt = token.jupiterData?.firstPool?.createdAt || 
                                     token.birdEyeRaw?.firstPool?.createdAt ||
                                     token.createdAt || 
                                     token.timestamp ||
                                     Date.now();
                    
                    this.tokenMetadataCache.set(tokenAddress, {
                        symbol: token.symbol,
                        name: token.name,
                        address: tokenAddress,
                        price: price,
                        priceSol: token.priceSol || 0,
                        marketCap: marketCap,
                        liquidity: liquidity,
                        supply: supply,
                        createdAt: createdAt,
                        graduatedPool: token.graduatedPool || token.jupiterData?.graduatedPool,
                        // ✅ CRITICAL: Store logo and jupiterData for frontend display
                        logo: token.logo || token.jupiterData?.icon,
                        jupiterData: token.jupiterData // Store full jupiterData object
                    });
                    
                    // 🚀 Initialize mid-price for outlier detection
                    if (price && price > 0) {
                        this.midPriceUsd.set(tokenAddress, price);
                    }
                    
                    metadataCount++;
                }
            }
            
            console.log(`✅ [EnhancedHybridPriceService] Added ${addedCount} new tokens for monitoring, total ${this.poolAddresses.size} tokens`);
            
            // 🚀 NEW: Subscribe all tokens to SSE for real-time prices
            if (this.sseService && this.useSolanaVibeSSE) {
                const allMints = Array.from(this.poolAddresses.keys());
                await this.sseService.subscribe(allMints);
                console.log(`📡 [EnhancedHybridPriceService] Subscribed ${allMints.length} tokens to SSE`);
            }
            
        } catch (error) {
            console.error('❌ [EnhancedHybridPriceService] Failed to load top tokens:', error.message);
        }
    }

    /**
     * Add a new token to monitoring (both gRPC and SSE)
     */
    async addTokenToMonitoring(tokenAddress, poolAddress, tokenMetadata = {}) {
        try {
            // Add to gRPC monitoring
            if (!this.poolAddresses.has(tokenAddress)) {
                this.poolAddresses.set(tokenAddress, poolAddress);
                this.swapHistory.set(tokenAddress, []);
                
                // Add metadata to cache
                if (tokenMetadata && Object.keys(tokenMetadata).length > 0) {
                    this.tokenMetadataCache.set(tokenAddress, tokenMetadata);
                }
                
                // Initialize mid-price if available
                if (tokenMetadata.price && tokenMetadata.price > 0) {
                    this.midPriceUsd.set(tokenAddress, tokenMetadata.price);
                }
                
                console.log(`✅ [EnhancedHybridPriceService] Added token ${tokenAddress} to monitoring`);
                
                // Add to SSE subscription
                if (this.sseService && this.useSolanaVibeSSE) {
                    await this.sseService.subscribe([tokenAddress]);
                    console.log(`📡 [EnhancedHybridPriceService] Added token ${tokenAddress} to SSE`);
                }
                
                return true;
            }
            
            return false; // Already monitoring
            
        } catch (error) {
            console.error(`❌ [EnhancedHybridPriceService] Failed to add token ${tokenAddress}:`, error.message);
            return false;
        }
    }

    /**
     * Remove a token from monitoring (both gRPC and SSE)
     */
    async removeTokenFromMonitoring(tokenAddress) {
        try {
            if (this.poolAddresses.has(tokenAddress)) {
                this.poolAddresses.delete(tokenAddress);
                this.swapHistory.delete(tokenAddress);
                this.tokenMetadataCache.delete(tokenAddress);
                this.midPriceUsd.delete(tokenAddress);
                this.priceCache.delete(tokenAddress);
                this.ssePriceSource.delete(tokenAddress);
                
                console.log(`✅ [EnhancedHybridPriceService] Removed token ${tokenAddress} from monitoring`);
                
                // Remove from SSE subscription
                if (this.sseService && this.useSolanaVibeSSE) {
                    await this.sseService.unsubscribe([tokenAddress]);
                    console.log(`📡 [EnhancedHybridPriceService] Removed token ${tokenAddress} from SSE`);
                }
                
                return true;
            }
            
            return false; // Not monitoring
            
        } catch (error) {
            console.error(`❌ [EnhancedHybridPriceService] Failed to remove token ${tokenAddress}:`, error.message);
            return false;
        }
    }

    async startRealTimeMonitoring(forceRestart = false) {
        if (!this.grpcClient) {
            console.error('❌ [EnhancedHybridPriceService] Cannot start monitoring - gRPC client not initialized');
            return;
        }

        const hasActiveStreams = Array.isArray(this.sharedStreams) && this.sharedStreams.length > 0;

        // ✅ Allow restart when new tokens are added
        if (hasActiveStreams && !forceRestart) {
            return;
        }
        
        // ✅ End existing streams before creating new ones
        if (hasActiveStreams && forceRestart) {
            await this.stopSharedStreams();
            // Wait a moment for cleanup
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        // ✅ CRITICAL FIX: Filter by TOKEN ADDRESSES, not pool addresses
        // Swaps often don't directly touch pool accounts, but always involve the token mint
        const allTokenAddresses = Array.from(this.poolAddresses.keys());
        if (allTokenAddresses.length === 0) {
            console.log('⚠️ [EnhancedHybridPriceService] No token addresses available for monitoring');
            return;
        }

        const requestedStreamCount = parseInt(process.env.CONSTANT_K_MAX_STREAMS, 10);
        const MAX_SHARED_STREAMS = 1; // Enforce single shared stream to stay under Constant K limits
        if (requestedStreamCount && requestedStreamCount > 1) {
            console.warn(`⚠️ [EnhancedHybridPriceService] CONSTANT_K_MAX_STREAMS=${requestedStreamCount} overridden to ${MAX_SHARED_STREAMS} to comply with single-stream requirement.`);
        }

        const MAX_TOKENS_PER_STREAM = parseInt(process.env.CONSTANT_K_MAX_TOKENS_PER_STREAM, 10) || 1024;
        let computedBatchSize = Math.ceil(allTokenAddresses.length / MAX_SHARED_STREAMS);
        if (computedBatchSize > MAX_TOKENS_PER_STREAM) {
            computedBatchSize = MAX_TOKENS_PER_STREAM;
        }
        const batches = [];
        for (let i = 0; i < allTokenAddresses.length && batches.length < MAX_SHARED_STREAMS; i += computedBatchSize) {
            batches.push(allTokenAddresses.slice(i, i + computedBatchSize));
        }
        if (batches.length === MAX_SHARED_STREAMS && (MAX_SHARED_STREAMS * computedBatchSize) < allTokenAddresses.length) {
            const remaining = allTokenAddresses.length - (MAX_SHARED_STREAMS * computedBatchSize);
            console.warn(`⚠️ [EnhancedHybridPriceService] Reached stream cap (${MAX_SHARED_STREAMS}). ${remaining} tokens skipped from real-time monitoring until slots free up.`);
        }

        console.log(`🔁 [EnhancedHybridPriceService] Starting shared streams (instance ${this.clientInstanceId}): ${batches.length} batches, up to ${computedBatchSize} tokens each (total tokens=${allTokenAddresses.length})`);
        
        let CommitmentLevel;
        try {
            CommitmentLevel = this.grpcWrapper.getCommitmentLevel();
        } catch (error) {
            CommitmentLevel = { CONFIRMED: 'confirmed' };
        }
        
        const newStreams = [];
        for (let index = 0; index < batches.length; index++) {
            const batch = batches[index];
            const transactionFilters = {
                client: {
                    accountInclude: batch,
                    accountExclude: [],
                    accountRequired: [],
                    vote: false,
                    failed: false
                }
            };

            if (this.sharedStreamSubscribeDelay > 0 && index > 0) {
                await new Promise(resolve => setTimeout(resolve, this.sharedStreamSubscribeDelay));
            }

            const stream = await this.grpcClient.subscribeOnce(
                {}, {}, transactionFilters, {}, {}, {}, {},
                CommitmentLevel.CONFIRMED, []
            );

            console.log(`✅ [EnhancedHybridPriceService] Shared stream created for batch ${index + 1}/${batches.length} (${batch.length} tokens, max ${computedBatchSize})`);

            stream._batchIndex = index;
            stream._tokenCount = batch.length;

            stream.on("data", async (msg) => {
                await this.processSharedStreamUpdate(msg);
            });

            stream.on("error", (error) => {
                console.error(`❌ [EnhancedHybridPriceService] Shared stream error (batch ${index + 1}):`, error.message);
                this.scheduleSharedStreamRestart(index, error);
            });

            stream.on("end", () => {
                console.warn(`⚠️ [EnhancedHybridPriceService] Shared stream ended (batch ${index + 1})`);
                this.scheduleSharedStreamRestart(index);
            });

            newStreams.push(stream);
        }

        this.sharedStreams = newStreams;
        this.sharedStreamPoolCount = allTokenAddresses.length;
        console.log(`✅ [EnhancedHybridPriceService] Monitoring ${this.sharedStreamPoolCount} tokens across ${this.sharedStreams.length} streams`);
        this.sharedStreamRetryCount = 0;
    }

    async stopSharedStreams() {
        if (!Array.isArray(this.sharedStreams) || this.sharedStreams.length === 0) {
            this.sharedStreams = [];
            return;
        }

        console.log(`🔌 [EnhancedHybridPriceService] Stopping ${this.sharedStreams.length} shared gRPC stream(s) (instance ${this.clientInstanceId})`);

        for (const stream of this.sharedStreams) {
            if (!stream) continue;
            try {
                stream.removeAllListeners();
                stream.end();
            } catch (error) {
                console.error('⚠️ [EnhancedHybridPriceService] Error stopping stream:', error.message);
            }
        }

        this.sharedStreams = [];
        this.sharedStreamPoolCount = 0;
    }

    scheduleSharedStreamRestart(batchIndex = null, lastError = null) {
        if (this._sharedStreamRestartScheduled) {
            return;
        }
        
        const attempt = this.sharedStreamRetryCount + 1;
        const exponentialDelay = Math.min(
            this.sharedStreamBaseDelay * Math.pow(2, this.sharedStreamRetryCount),
            this.sharedStreamMaxDelay
        );
        const jitter = Math.floor(Math.random() * Math.max(this.sharedStreamJitter, 1));
        const delayMs = exponentialDelay + jitter;
        
        this.sharedStreamRetryCount = attempt;
        this._sharedStreamRestartScheduled = true;
        
        const batchInfo = batchIndex !== null ? ` (batch ${batchIndex + 1})` : '';
        console.warn(`⚠️ [EnhancedHybridPriceService] Scheduling shared stream restart${batchInfo} in ${delayMs}ms (attempt ${attempt}${lastError ? `, reason: ${lastError.message}` : ''})`);

        setTimeout(async () => {
            this._sharedStreamRestartScheduled = false;
            try {
                await this.startRealTimeMonitoring(true);
            } catch (error) {
                console.error('❌ [EnhancedHybridPriceService] Failed to restart shared streams:', error.message);
            }
        }, delayMs);
    }

    // ✅ NEW: Process updates from shared stream
    async processSharedStreamUpdate(msg) {
        if (!msg.transaction?.transaction) return;
        
        const tx = msg.transaction.transaction;
        const slot = msg.transaction.slot;
        
        // Extract signature
        let rawSignature = tx.signature || tx.transaction?.signatures?.[0] || msg.transaction?.signature || null;
        let transactionSignature = null;
        if (rawSignature) {
            if (Buffer.isBuffer(rawSignature)) {
                transactionSignature = bs58.encode(rawSignature);
            } else if (typeof rawSignature === 'string') {
                transactionSignature = rawSignature;
            } else if (rawSignature.data && Array.isArray(rawSignature.data)) {
                transactionSignature = bs58.encode(Buffer.from(rawSignature.data));
            }
        }
        
        // Check for swaps
        if (tx.meta?.preTokenBalances?.length > 0) {
            const balanceChanges = [];
            
            tx.meta.preTokenBalances.forEach((preBalance, index) => {
                const postBalance = tx.meta.postTokenBalances[index];
                if (preBalance && postBalance) {
                    const preAmount = preBalance.uiTokenAmount?.uiAmount || 0;
                    const postAmount = postBalance.uiTokenAmount?.uiAmount || 0;
                    const change = postAmount - preAmount;
                    
                    if (Math.abs(change) > 0.000001) {
                        balanceChanges.push({
                            mint: preBalance.mint,
                            change: change,
                            owner: preBalance.owner,
                            preAmount: preAmount,
                            postAmount: postAmount
                        });
                    }
                }
            });
            
            if (balanceChanges.length > 0) {
                // ✅ ENHANCED: Check if ANY token in the swap is being monitored
                const involvedMints = [...new Set(balanceChanges.map(bc => bc.mint))];
                
                // Find which token this swap is for by matching pool address
                for (const [tokenAddress, poolAddress] of this.poolAddresses.entries()) {
                    // ✅ FIX: Check if this transaction involves our monitored token
                    const hasMonitoredToken = involvedMints.includes(tokenAddress);
                    
                    if (hasMonitoredToken) {
                        // Get changes for our specific token
                        const tokenChanges = balanceChanges.filter(bc => 
                            bc.mint === tokenAddress // Match the exact token we're monitoring
                        );
                        const userTokenChanges = tokenChanges.filter(tokenChange => {
                            const isPoolAddress = tokenChange.owner === poolAddress;
                            const isTokenMint = tokenChange.owner === tokenAddress;
                            const isExcludedAddress = EXCLUDED_SWAP_ADDRESSES.has(tokenChange.owner);
                            return !isPoolAddress && !isTokenMint && !isExcludedAddress;
                        });
                        
                        if (userTokenChanges.length > 0) {
                            // Found a swap for this token!
                            await this.processSwapForToken(msg, tokenAddress, poolAddress, slot, transactionSignature);
                        }
                    }
                }
            }
        }
    }
    
    // ✅ NEW: Process swap for a specific token from shared stream
    // 🚀 ROBUST: Uses production-grade swap detection with v0 tx support
    async processSwapForToken(msg, tokenAddress, poolAddress, slot, signature) {
        const tx = msg.transaction.transaction;
        
        // 🚀 DETECT PROGRAM ID AND SELECT APPROPRIATE DECODER
        let decoder = null;
        let isRaydiumSwap = false; // ✅ Track if this is actually a Raydium swap
        const message = tx.transaction?.message ?? {};
        const { combined } = buildCombinedKeys(message); // ✅ FIX: Extract combined array
        
        // Check instructions to find program ID
        const instructions = message.instructions || [];
        for (const instruction of instructions) {
            if (instruction.programIdIndex !== undefined) {
                const programId = combined[instruction.programIdIndex]; // ✅ FIX: Use combined array
                if (programId && DEX_PROGRAMS[programId]) {
                    // Select decoder based on program (only Raydium has decoders for now)
                    if (programId === 'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C') {
                        decoder = this.raydiumCPMMDecoder;
                        isRaydiumSwap = true; // ✅ Confirmed Raydium CPMM swap
                        this._cpmmDecoderUsed = (this._cpmmDecoderUsed || 0) + 1;
                        break;
                    } else if (programId === 'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK') {
                        decoder = this.raydiumCLMMDecoder;
                        isRaydiumSwap = true; // ✅ Confirmed Raydium CLMM swap
                        this._clmmDecoderUsed = (this._clmmDecoderUsed || 0) + 1;
                        break;
                    } else if (programId === '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8') {
                        decoder = this.raydiumDecoder;
                        isRaydiumSwap = true; // ✅ Confirmed Raydium AMM swap
                        this._ammDecoderUsed = (this._ammDecoderUsed || 0) + 1;
                        break;
                    }
                    // Note: Other AMM programs (Orca, Meteora) don't have decoders yet
                    // They will fall back to heuristic detection (no decoder usage counter increment)
                }
            }
        }
        
        // Fallback to AMM decoder if no Raydium program detected (for backward compatibility)
        // This handles swaps from Orca, Meteora, etc. (they use heuristic detection, not decoder)
        if (!decoder) {
            decoder = this.raydiumDecoder; // Will be passed but may not be used for non-Raydium swaps
            // ✅ DO NOT set isRaydiumSwap = true here - we didn't detect Raydium!
        }
        
        // 🚀 PROACTIVE POOL DECODING: Only decode if we confirmed it's a Raydium swap
        // ✅ CRITICAL: Extract pool address FROM TRANSACTION (not cached metadata)
        // The pool address from cache might be a different format or identifier
        // For Raydium swaps, we need the actual pool account address from the transaction
        let actualPoolAddressForDecoding = null;
        if (isRaydiumSwap && decoder) {
            // Find the Raydium program ID for extraction
            let raydiumProgramId = null;
            for (const instruction of instructions) {
                if (instruction.programIdIndex !== undefined) {
                    const progId = combined[instruction.programIdIndex];
                    if (progId === '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8' ||
                        progId === 'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C' ||
                        progId === 'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK') {
                        raydiumProgramId = progId;
                        break;
                    }
                }
            }
            
            // Try Raydium-specific extraction (more accurate)
            if (raydiumProgramId) {
                actualPoolAddressForDecoding = extractRaydiumPoolFromIx(tx, raydiumProgramId);
            }
            
            // Fallback to generic guess if Raydium-specific extraction failed
            if (!actualPoolAddressForDecoding) {
                actualPoolAddressForDecoding = guessPoolFromIx(tx);
            }
            
            // Final fallback to cached pool address
            if (!actualPoolAddressForDecoding) {
                actualPoolAddressForDecoding = poolAddress;
            }
            
            if (actualPoolAddressForDecoding && (decoder === this.raydiumDecoder || decoder === this.raydiumCPMMDecoder || decoder === this.raydiumCLMMDecoder)) {
                this.queuePoolDecode(decoder, actualPoolAddressForDecoding);
            }
        }
        
        // 🚀 USE ROBUST SWAP DETECTION with appropriate decoder
        const midPriceUsd = this.midPriceUsd.get(tokenAddress);
        const swapRecord = processTxForSwap(
            tx,
            tokenAddress,
            this.solPriceUSD,
            this.tokenPriceCache,
            midPriceUsd,
            decoder,      // ✅ Pass appropriate decoder (AMM, CPMM, or CLMM)
            poolAddress   // ✅ Pass known pool address (for swap detection heuristics)
        );
        
        if (!swapRecord) {
            // Swap was filtered out (no legs, dust, outlier, etc.)
            return;
        }
        
        // 🚀 HARDENING: Update mid-price using EWMA (alpha=0.2)
        if (swapRecord.priceUsd && isFinite(swapRecord.priceUsd) && swapRecord.priceUsd > 0) {
            const currentMid = this.midPriceUsd.get(tokenAddress);
            if (currentMid && currentMid > 0) {
                // Exponential moving average: (1-α)*old + α*new, where α=0.2
                const alpha = 0.2;
                const newMid = (1 - alpha) * currentMid + alpha * swapRecord.priceUsd;
                this.midPriceUsd.set(tokenAddress, newMid);
            } else {
                // First price, set as mid
                this.midPriceUsd.set(tokenAddress, swapRecord.priceUsd);
            }
        }
        
        // Save to database
        try {
            // Add tokenAddress to swapRecord before saving
            const swapRecordWithToken = { ...swapRecord, tokenAddress };
            await this.chartDatabase.storeSwaps([swapRecordWithToken]);
        } catch (error) {
            console.error(`❌ [EnhancedHybridPriceService] Failed to save swap:`, error.message);
        }
        
        // Broadcast to WebSocket clients
        if (this.webSocketServer) {
            try {
                this.webSocketServer.broadcastSwapUpdate(tokenAddress, swapRecord);
            } catch (error) {
                console.error(`❌ [EnhancedHybridPriceService] Failed to broadcast swap:`, error.message);
            }
        }
        
        // Update internal tracking
        if (!this.swapHistory.has(tokenAddress)) {
            this.swapHistory.set(tokenAddress, []);
        }
        const history = this.swapHistory.get(tokenAddress);
        history.push(swapRecord);
        
        // Keep only last 1000 swaps in memory
        if (history.length > 1000) {
            history.shift();
        }
    }
    
    // ✅ DEPRECATED: Old per-token stream method (KEPT FOR REFERENCE - NOT USED)
    async startSingleTokenMonitoring_DEPRECATED(tokenAddress, poolAddress = null) {
        try {
            console.log(`🚀 [EnhancedHybridPriceService] Starting UNIVERSAL monitoring for ${tokenAddress}`);
            
            // Find or discover the pool address for this token
            // Get pool address - prioritize cached metadata
            let actualPoolAddress = poolAddress || this.poolAddresses.get(tokenAddress);
            
            // ✅ CRITICAL FIX: Use cached graduatedPool from token metadata
            if (!actualPoolAddress) {
                const tokenMetadata = this.tokenMetadataCache.get(tokenAddress);
                if (tokenMetadata && tokenMetadata.graduatedPool) {
                    actualPoolAddress = tokenMetadata.graduatedPool;
                    console.log(`🔧 [EnhancedHybridPriceService] Using graduatedPool from cached metadata: ${actualPoolAddress}`);
                }
            }
            
            if (!actualPoolAddress) {
                console.log(`🔍 [EnhancedHybridPriceService] Pool not cached for ${tokenAddress}, discovering...`);
                actualPoolAddress = await this.discoverPoolAddress(tokenAddress);
                
                if (actualPoolAddress) {
                    this.poolAddresses.set(tokenAddress, actualPoolAddress);
                    this.swapHistory.set(tokenAddress, []);
                    console.log(`✅ [EnhancedHybridPriceService] Discovered pool ${actualPoolAddress} for ${tokenAddress}`);
                } else {
                    console.log(`❌ [EnhancedHybridPriceService] Could not discover pool for ${tokenAddress}`);
                    return;
                }
            } else {
                // Add to maps if not already there
                this.poolAddresses.set(tokenAddress, actualPoolAddress);
                this.swapHistory.set(tokenAddress, []);
                console.log(`✅ [EnhancedHybridPriceService] Using provided pool ${actualPoolAddress} for ${tokenAddress}`);
            }
            
            console.log(`📊 [EnhancedHybridPriceService] Monitoring ${tokenAddress} -> ${actualPoolAddress}`);
            
            // Safe commitment level access with fallback
            let CommitmentLevel;
            try {
                CommitmentLevel = this.grpcWrapper.getCommitmentLevel();
                console.log(`📊 [EnhancedHybridPriceService] CommitmentLevel:`, CommitmentLevel);
            } catch (error) {
                console.log(`⚠️ [EnhancedHybridPriceService] Failed to get CommitmentLevel, using fallback:`, error.message);
                CommitmentLevel = { CONFIRMED: 'confirmed' }; // Fallback
            }
            
            // ✅ UNIVERSAL TRANSACTION monitoring for ANY token
            // 🚀 CRITICAL: Monitor ALL token addresses in a SINGLE stream for efficiency
            const allTokenAddresses = Array.from(this.poolAddresses.keys());
            const transactionFilters = {
                client: {
                    accountInclude: allTokenAddresses, // Monitor transactions involving ALL token mint addresses
                    accountExclude: [], // Exclude vote transactions
                    accountRequired: [], // Don't use accountRequired (too restrictive)
                    vote: false,
                    failed: false
                }
            };
            
            console.log(`📊 [EnhancedHybridPriceService] Starting TRANSACTION monitoring for ${tokenAddress} -> ${actualPoolAddress}`);
            
            const stream = await this.grpcClient.subscribeOnce(
                {}, // accounts - NOT using account monitoring
                {}, // slots  
                transactionFilters, // transactions - THIS IS THE KEY!
                {}, // transactionsStatus
                {}, // entry
                {}, // blocks
                {}, // blocksMeta
                CommitmentLevel.CONFIRMED,
                []  // accountsDataSlice
            );
            
            console.log(`✅ [EnhancedHybridPriceService] Transaction stream created for ${tokenAddress}`);
            
            let totalUpdateCount = 0;
            let swapCount = 0;
            
            stream.on("data", async (msg) => {
                try {
                    // ✅ Process TRANSACTION data for ANY token
                    if (msg.transaction?.transaction) {
                        totalUpdateCount++;
                        const tx = msg.transaction.transaction;
                        const slot = msg.transaction.slot;
                        
                        // ✅ EXTRACT REAL TRANSACTION SIGNATURE
                        // Try multiple sources for signature
                        let rawSignature = tx.signature || 
                                          tx.transaction?.signatures?.[0] || 
                                          msg.transaction?.signature ||
                                          null;
                        
                        // Convert Buffer to base58 string if needed
                        let transactionSignature = null;
                        if (rawSignature) {
                            if (Buffer.isBuffer(rawSignature)) {
                                // Convert Buffer to base58
                                transactionSignature = bs58.encode(rawSignature);
                                // console.log(`🔍 [EnhancedHybridPriceService] Converted signature from Buffer to base58: ${transactionSignature}`);
                            } else if (typeof rawSignature === 'string') {
                                transactionSignature = rawSignature;
                            } else if (rawSignature.data && Array.isArray(rawSignature.data)) {
                                // Convert Buffer object to base58
                                const buffer = Buffer.from(rawSignature.data);
                                transactionSignature = bs58.encode(buffer);
                                // console.log(`🔍 [EnhancedHybridPriceService] Converted signature from Buffer object to base58: ${transactionSignature}`);
                            }
                        }
                        
                        // ✅ CRITICAL: Log when signature is missing for debugging
                        if (!transactionSignature && rawSignature) {
                            console.warn(`⚠️ [EnhancedHybridPriceService] Could not extract signature from:`, rawSignature);
                        }
                        
                        // Rate limit logging
                        // let lastLogTime = 0;
                        // const LOG_INTERVAL = 10000; // Log every 10 seconds max
                        // const now = Date.now();
                        // if (now - lastLogTime > LOG_INTERVAL) {
                        //     console.log(`🔍 [EnhancedHybridPriceService] Processing transaction #${totalUpdateCount} for ${tokenAddress} at slot ${slot}`);
                        //     lastLogTime = now;
                        // }
                        
                        // Check for token balance changes (SWAPS!)
                        if (tx.meta?.preTokenBalances?.length > 0) {
                            // console.log(`🎉 [EnhancedHybridPriceService] TOKEN BALANCE CHANGES DETECTED for ${tokenAddress}!`);
                            
                            // 🔍 DEBUG: Log full transaction structure (first 5 swaps, then every 100th)
                            this._txDebugCounter = (this._txDebugCounter || 0) + 1;
                            if (this._txDebugCounter <= 5 || this._txDebugCounter % 100 === 0) {
                                console.log(`\n📋 [DEBUG] TRANSACTION JSON STRUCTURE (#${this._txDebugCounter}):`);
                                console.log(JSON.stringify({
                                    signature: transactionSignature?.substring(0, 16) + '...',
                                    slot: slot,
                                    blockTime: tx.blockTime,
                                    meta: {
                                        err: tx.meta.err,
                                        fee: tx.meta.fee,
                                        preBalances: tx.meta.preBalances?.slice(0, 5),
                                        postBalances: tx.meta.postBalances?.slice(0, 5),
                                        preTokenBalances: tx.meta.preTokenBalances?.map(b => ({
                                            accountIndex: b.accountIndex,
                                            mint: b.mint?.substring(0, 16) + '...',
                                            owner: b.owner?.substring(0, 16) + '...',
                                            uiTokenAmount: b.uiTokenAmount
                                        })),
                                        postTokenBalances: tx.meta.postTokenBalances?.map(b => ({
                                            accountIndex: b.accountIndex,
                                            mint: b.mint?.substring(0, 16) + '...',
                                            owner: b.owner?.substring(0, 16) + '...',
                                            uiTokenAmount: b.uiTokenAmount
                                        }))
                                    },
                                    transaction: {
                                        message: {
                                            accountKeys: tx.transaction?.message?.accountKeys?.slice(0, 10).map(k => k?.substring(0, 16) + '...'),
                                            instructions: tx.transaction?.message?.instructions?.slice(0, 3).map(i => ({
                                                programIdIndex: i.programIdIndex,
                                                accounts: i.accounts?.slice(0, 10),
                                                data: i.data?.substring(0, 32) + '...'
                                            }))
                                        }
                                    }
                                }, null, 2));
                                console.log(`\n`);
                            }
                            
                            // Collect all balance changes to find both sides of the swap
                            const balanceChanges = [];
                            
                            tx.meta.preTokenBalances.forEach((preBalance, index) => {
                                const postBalance = tx.meta.postTokenBalances[index];
                                if (preBalance && postBalance) {
                                    const preAmount = preBalance.uiTokenAmount?.uiAmount || 0;
                                    const postAmount = postBalance.uiTokenAmount?.uiAmount || 0;
                                    const change = postAmount - preAmount;
                                    
                                    if (Math.abs(change) > 0.000001) { // Significant change
                                        balanceChanges.push({
                                            mint: preBalance.mint,
                                            change: change,
                                            owner: preBalance.owner,
                                            preAmount: preAmount,
                                            postAmount: postAmount
                                        });
                                    }
                                }
                            });
                            
                            // Process swaps - be less restrictive to catch more swaps
                            if (balanceChanges.length > 0) {
                                // Find token changes for our target token
                                const tokenChanges = balanceChanges.filter(bc => bc.mint === tokenAddress);
                                
                                // ✅ CRITICAL FIX: Filter out pool's own swaps, keep only user swaps
                                // Pool's address is the same as the address being monitored
                                const actualPoolAddress = this.poolAddresses.get(tokenAddress);
                                const userTokenChanges = tokenChanges.filter(tokenChange => {
                                    const isPoolAddress = tokenChange.owner === actualPoolAddress;
                                    
                                    // 🚫 ADDITIONAL FILTER: Check if owner is the token mint itself (self-trading pools)
                                    const isTokenMint = tokenChange.owner === tokenAddress;
                                    
                                    // 🚫 EXCLUDE: Check if owner is an excluded address (pool authorities, PDAs, etc.)
                                    const isExcludedAddress = EXCLUDED_SWAP_ADDRESSES.has(tokenChange.owner);
                                    
                                    // Log suspicious addresses for debugging
                                    if (isPoolAddress || isTokenMint || isExcludedAddress) {
                                        // console.log(`🚫 [EnhancedHybridPriceService] Skipping swap from owner: ${tokenChange.owner.substring(0, 16)}... (isPool: ${isPoolAddress}, isTokenMint: ${isTokenMint}, isExcluded: ${isExcludedAddress})`);
                                    }
                                    
                                    return !isPoolAddress && !isTokenMint && !isExcludedAddress;
                                });
                                
                                // console.log(`🔍 [EnhancedHybridPriceService] Processing ${userTokenChanges.length} user token changes (filtered out ${tokenChanges.length - userTokenChanges.length} pool swaps)`);
                                
                                if (userTokenChanges.length === 0) {
                                    // console.log(`⚠️ [EnhancedHybridPriceService] No user swaps found, skipping transaction`);
                                    return;
                                }
                                
                                // Debug: Log all balance changes to understand what we're working with
                                // console.log(`🔍 [EnhancedHybridPriceService] ALL balance changes in transaction:`);
                                // balanceChanges.forEach((bc, idx) => {
                                //     console.log(`  ${idx}: ${bc.mint} | Change: ${bc.change} | Owner: ${bc.owner}`);
                                // });
                                
                                // Process each user token change
                                userTokenChanges.forEach(tokenChange => {
                                    swapCount++;
                                    
                                    // ✅ CRITICAL FIX: Find the largest SOL change in this transaction
                                    // Don't match by owner - just find the biggest SOL movement
                                    let solChange = balanceChanges
                                        .filter(bc => bc.mint === 'So11111111111111111111111111111111111111112')
                                        .reduce((max, current) => 
                                            Math.abs(current.change) > Math.abs(max.change) ? current : max, 
                                            balanceChanges.find(bc => bc.mint === 'So11111111111111111111111111111111111111112')
                                        );
                                    
                                    // ✅ FIXED: Correct swap type logic using BOTH token AND SOL changes
                                    // BUY: User gets tokens (+) AND gives SOL (-)
                                    // SELL: User gives tokens (-) AND gets SOL (+)
                                    let swapType;
                                    if (tokenChange.change > 0) {
                                        // User got tokens - this is a BUY
                                        swapType = 'BUY';
                                    } else {
                                        // User lost tokens - this is a SELL
                                        swapType = 'SELL';
                                    }
                                    
                                    // ✅ VERIFICATION: Double-check with SOL change if available
                                    if (solChange && Math.abs(solChange.change) > 0.001) {
                                        // If SOL and token changes disagree, use SOL as the source of truth
                                        // BUY = SOL goes OUT (negative), SELL = SOL comes IN (positive)
                                        if (solChange.change < 0) {
                                            swapType = 'BUY';
                                        } else {
                                            swapType = 'SELL';
                                        }
                                    }
                                    
                                    // console.log(`🎯 [EnhancedHybridPriceService] SWAP #${swapCount}: ${swapType} for ${tokenAddress}`);
                                    // console.log(`📊 [EnhancedHybridPriceService] Token Change: ${tokenChange.change > 0 ? '+' : ''}${tokenChange.change.toFixed(6)}`);
                                    // console.log(`📊 [EnhancedHybridPriceService] Swap Type Logic: change=${tokenChange.change}, >0=${tokenChange.change > 0}, Type=${swapType}`);
                                    // if (solChange) {
                                    //     console.log(`📊 [EnhancedHybridPriceService] SOL Change: ${solChange.change > 0 ? '+' : ''}${solChange.change.toFixed(6)} from ${solChange.owner}`);
                                    // } else {
                                    //     console.log(`📊 [EnhancedHybridPriceService] SOL Change: Not found, will estimate`);
                                    // }
                                    // console.log(`📊 [EnhancedHybridPriceService] Owner: ${tokenChange.owner}`);
                                    // console.log(`📊 [EnhancedHybridPriceService] Slot: ${slot}`);
                                    
                                    // Process the swap with both token and SOL amounts
                                    try {
                                        // console.log(`🔍 [EnhancedHybridPriceService] Signature before processSwapUpdate:`, transactionSignature ? transactionSignature.substring(0, 16) + '...' : 'NULL');
                                        this.processSwapUpdate(
                                            tokenAddress, 
                                            actualPoolAddress, 
                                            slot, 
                                            swapType, 
                                            tokenChange.change, 
                                            tokenChange.mint, 
                                            tokenChange.owner,
                                            solChange ? solChange.change : 0,
                                            transactionSignature // ✅ Real transaction signature
                                        );
                                    } catch (error) {
                                        console.error(`❌ [EnhancedHybridPriceService] Error processing swap for ${tokenAddress}:`, error.message);
                                    }
                                });
                            }
                        }
                    }
                } catch (error) {
                    console.error(`❌ [EnhancedHybridPriceService] Error in transaction data handler for ${tokenAddress}:`, error.message);
                }
            });
            
            stream.on("error", (error) => {
                console.error(`❌ [EnhancedHybridPriceService] Stream error for ${tokenAddress}:`, error.message);
                
                // 🔄 AUTO-RECONNECT: Restart monitoring on error
                console.log(`🔄 [EnhancedHybridPriceService] Attempting to reconnect ${tokenAddress}...`);
                setTimeout(async () => {
                    try {
                        await this.startSingleTokenMonitoring(tokenAddress, actualPoolAddress);
                        console.log(`✅ [EnhancedHybridPriceService] Reconnected ${tokenAddress} successfully`);
                    } catch (err) {
                        console.error(`❌ [EnhancedHybridPriceService] Failed to reconnect ${tokenAddress}:`, err.message);
                    }
                }, 5000); // Wait 5 seconds before reconnecting
            });
            
            stream.on("end", () => {
                console.log(`🔚 [EnhancedHybridPriceService] Stream ended for ${tokenAddress} - reconnecting...`);
                
                // 🔄 AUTO-RECONNECT: Restart monitoring on stream end
                setTimeout(async () => {
                    try {
                        await this.startSingleTokenMonitoring(tokenAddress, actualPoolAddress);
                        console.log(`✅ [EnhancedHybridPriceService] Reconnected ${tokenAddress} after stream end`);
                    } catch (err) {
                        console.error(`❌ [EnhancedHybridPriceService] Failed to reconnect ${tokenAddress}:`, err.message);
                    }
                }, 2000); // Wait 2 seconds before reconnecting
            });
            
            // Store the stream with token-specific key
            this.grpcStreams.set(`token_${tokenAddress}`, stream);
            console.log(`✅ [EnhancedHybridPriceService] UNIVERSAL monitoring started for ${tokenAddress} - ${swapCount} swaps detected!`);
            
        } catch (error) {
            console.error(`❌ [EnhancedHybridPriceService] Failed to start monitoring for ${tokenAddress}:`, error.message);
        }
    }

    // ✅ NEW: Discover pool address for any token dynamically
    async discoverPoolAddress(tokenAddress) {
        try {
            console.log(`🔍 [EnhancedHybridPriceService] Discovering pool for ${tokenAddress}...`);
            
            // Try Jupiter API first
            try {
                const data = await this.makeJupiterRequest('https://lite-api.jup.ag/tokens/v2/search', {
                    query: tokenAddress
                });
                
                if (data && Array.isArray(data) && data.length > 0) {
                    const tokenInfo = data[0];
                    if (tokenInfo.pools && tokenInfo.pools.length > 0) {
                        const pool = tokenInfo.pools[0]; // Use first pool
                        console.log(`✅ [EnhancedHybridPriceService] Found pool via Jupiter: ${pool.address}`);
                        return pool.address;
                    }
                }
            } catch (error) {
                console.log(`⚠️ [EnhancedHybridPriceService] Jupiter discovery failed:`, error.message);
            }
            
            // Try DexScreener API as fallback
            try {
                const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`);
                const data = await response.json();
                
                if (data.pairs && data.pairs.length > 0) {
                    const pair = data.pairs[0]; // Use first pair
                    console.log(`✅ [EnhancedHybridPriceService] Found pool via DexScreener: ${pair.pairAddress}`);
                    return pair.pairAddress;
                }
            } catch (error) {
                console.log(`⚠️ [EnhancedHybridPriceService] DexScreener discovery failed:`, error.message);
            }
            
            // For PumpFun tokens, the token address itself might be the pool
            console.log(`⚠️ [EnhancedHybridPriceService] No pool found, trying token address as pool for PumpFun: ${tokenAddress}`);
            return tokenAddress;
            
        } catch (error) {
            console.error(`❌ [EnhancedHybridPriceService] Pool discovery failed for ${tokenAddress}:`, error.message);
            return null;
        }
    }

    processSwapUpdate(tokenAddress, poolAddress, slot, swapType, change, mintAddress, makerAddress, solAmount = 0, transactionHash = null) {
        try {
            console.log(`🔄 [EnhancedHybridPriceService] Processing swap update for ${tokenAddress}`);
            console.log(`🔍 [EnhancedHybridPriceService] Raw inputs - change: ${change}, solAmount: ${solAmount}, mintAddress: ${mintAddress}`);
            console.log(`🔍 [EnhancedHybridPriceService] Transaction Hash:`, transactionHash ? transactionHash.substring(0, 16) + '...' : 'NULL - will use fallback');
            
            // Get current swap history
            const currentSwaps = this.swapHistory.get(tokenAddress) || [];
            
            // ✅ CRITICAL FIX: Proper unit normalization using the provided logic
            const isSOLSwap = mintAddress === 'So11111111111111111111111111111111111111112';
            
            // Get token metadata to fetch decimals
            const tokenMetadata = this.tokenMetadataCache.get(tokenAddress);
            const mintDecimals = tokenMetadata?.decimals || 6; // Default 6 for most tokens
            console.log(`📊 [EnhancedHybridPriceService] Mint decimals: ${mintDecimals}`);
            
            // 1) Convert token quantity to UI
            // 'change' from gRPC token balance changes is already in UI format (human-readable)
            // The Yellowstone gRPC library already converts from raw to UI for us
            const qtyTokenUI = Math.abs(change);
            console.log(`📊 [EnhancedHybridPriceService] Token quantity (UI): ${qtyTokenUI}`);
            // console.log(`📊 [EnhancedHybridPriceService] Token quantity (UI): ${qtyTokenUI}`);
            
            // 2) SOL amount is ALWAYS in UI format (SOL, not lamports) from uiTokenAmount
            // ✅ CRITICAL FIX: Balance changes use uiTokenAmount.uiAmount which is already in SOL
            let baseSol = Math.abs(solAmount);
            console.log(`💰 [EnhancedHybridPriceService] SOL amount (UI format): ${solAmount} -> ${baseSol.toFixed(9)} SOL`);
            
            // 3) Calculate prices
            let priceSol = 0;
            let priceUsd = 0;
            let volumeUsd = 0;
            
            if (baseSol > 0 && qtyTokenUI > 0) {
                // Price per token in SOL
                priceSol = baseSol / qtyTokenUI;
                
                // Price per token in USD
                priceUsd = priceSol * this.solPriceUSD;
                
                // Volume in USD
                volumeUsd = baseSol * this.solPriceUSD;
                
                // console.log(`💰 [EnhancedHybridPriceService] Calculated - Price: ${priceSol.toFixed(9)} SOL/token, $${priceUsd.toFixed(6)} USD, Volume: $${volumeUsd.toFixed(4)}`);
            } else {
                // console.log(`⚠️ [EnhancedHybridPriceService] Missing SOL amount or token amount, using fallback`);
                // Fallback calculation
                if (tokenMetadata && tokenMetadata.usdPrice) {
                    volumeUsd = qtyTokenUI * tokenMetadata.usdPrice;
                    baseSol = volumeUsd / this.solPriceUSD;
                    priceSol = baseSol / qtyTokenUI;
                    priceUsd = priceSol * this.solPriceUSD;
                    // console.log(`💰 [EnhancedHybridPriceService] Fallback - Price: ${priceSol.toFixed(9)} SOL/token, Volume: $${volumeUsd.toFixed(4)}`);
                } else {
                    baseSol = qtyTokenUI * 0.0000001;
                    volumeUsd = baseSol * this.solPriceUSD;
                    priceSol = baseSol / qtyTokenUI;
                    priceUsd = priceSol * this.solPriceUSD;
                    // console.log(`⚠️ [EnhancedHybridPriceService] Last resort fallback - Price: ${priceSol.toFixed(9)} SOL/token, Volume: $${volumeUsd.toFixed(4)}`);
                }
            }
            
            // Use normalized values
            const tokenAmount = qtyTokenUI;
            const baseAmount = baseSol;
            
            // Create swap record with frontend-compatible format
            // ✅ TIMESTAMP FIX: Estimate transaction time from slot instead of using current time
            const estimatedTimestamp = this.estimateTimestampFromSlot(slot);
            
            const swapRecord = {
                timestamp: estimatedTimestamp,
                slot: slot,
                type: swapType,
                change: change,
                mintAddress: mintAddress,
                poolAddress: poolAddress,
                // Frontend-compatible fields with normalized values
                tokenAmount: qtyTokenUI,        // UI quantity
                baseAmount: baseSol,            // SOL amount (already converted)
                volumeUsd: volumeUsd,          // USD volume
                maker: makerAddress || 'Unknown',
                signature: transactionHash ? transactionHash : `slot_${slot}_${estimatedTimestamp}`,
                price: priceSol                 // Price per token in SOL
            };
            
            // Add to swap history
            currentSwaps.push(swapRecord);
            
            // Keep only last 100 swaps to prevent memory issues
            if (currentSwaps.length > 100) {
                currentSwaps.splice(0, currentSwaps.length - 100);
            }
            
            this.swapHistory.set(tokenAddress, currentSwaps);
            
            // Update real-time data
            const currentData = this.realTimeUpdates.get(tokenAddress) || {
                totalSwaps: 0,
                lastUpdated: Date.now(),
                swaps: []
            };
            
            currentData.totalSwaps = currentSwaps.length;
            currentData.lastUpdated = Date.now();
            currentData.swaps = currentSwaps.slice(-10); // Keep last 10 swaps
            
            this.realTimeUpdates.set(tokenAddress, currentData);
            
            // 🚀 NEW: Save to persistent storage
            this.saveSwapToDatabase(swapRecord, tokenAddress, poolAddress);
            
            // console.log(`✅ [EnhancedHybridPriceService] Swap processed: ${swapType} ${change.toFixed(6)} tokens`);
            
                // 🚀 NEW: Broadcast swap via WebSocket for real-time updates
            if (this.webSocketServer) {
                console.log(`📡 [EnhancedHybridPriceService] Broadcasting swap via WebSocket for ${tokenAddress.substring(0, 8)}...`);
                this.webSocketServer.broadcastSwapUpdate(tokenAddress, {
                    swap: swapRecord,
                    totalSwaps: currentSwaps.length,
                    timestamp: Date.now()
                });
            } else {
                console.log(`⚠️ [EnhancedHybridPriceService] WebSocket server not available for ${tokenAddress.substring(0, 8)}...`);
            }
            
            // Emit swap event for WebSocket broadcasting
            this.emit('swapDetected', {
                tokenAddress,
                poolAddress,
                swapType,
                change,
                mintAddress,
                slot,
                timestamp: Date.now()
            });
            
            // ✅ NEW: Broadcast tooltip update for this token
            if (this.webSocketServer) {
                const tooltipData = this.getRealTimeTooltipData(tokenAddress);
                if (tooltipData) {
                    this.webSocketServer.broadcastTooltipUpdate(tokenAddress, tooltipData);
                }
            }
            
        } catch (error) {
            console.error(`❌ [EnhancedHybridPriceService] Error processing swap update:`, error.message);
        }
    }

    // 🚀 NEW: Save swap to persistent database
    async saveSwapToDatabase(swapRecord, tokenAddress, poolAddress) {
        try {
            // console.log(`💾 [EnhancedHybridPriceService] Attempting to save swap to database for ${tokenAddress}`);
            // console.log(`💾 [EnhancedHybridPriceService] ChartDatabase available:`, !!this.chartDatabase);
            
            if (!this.chartDatabase) {
                console.error(`❌ [EnhancedHybridPriceService] ChartDatabase not available for ${tokenAddress}`);
                return;
            }
            
            // Convert swap record to database format
            const persistentSwapRecord = {
                tokenAddress: tokenAddress,
                signature: swapRecord.signature || `slot_${swapRecord.slot}_${swapRecord.timestamp}`, // ✅ Use real signature from swapRecord
                timestamp: Math.floor(swapRecord.timestamp / 1000), // Unix timestamp for database
                poolAddress: poolAddress,
                price: swapRecord.price || 0,
                volume: swapRecord.volumeUsd || 0, // Volume in USD
                source: 'grpc_realtime',
                type: swapRecord.type,
                tokenAmount: swapRecord.tokenAmount || 0,
                baseAmount: swapRecord.baseAmount || 0,
                volumeUsd: swapRecord.volumeUsd || 0,
                maker: swapRecord.maker || 'Unknown',
                rawData: {
                    tokenAddress: tokenAddress,
                    slot: swapRecord.slot,
                    type: swapRecord.type,
                    change: swapRecord.change,
                    tokenAmount: swapRecord.tokenAmount || 0,
                    baseAmount: swapRecord.baseAmount || 0,
                    volumeUsd: swapRecord.volumeUsd || 0,
                    mintAddress: swapRecord.mintAddress,
                    poolAddress: poolAddress,
                    maker: swapRecord.maker,
                    timestamp: swapRecord.timestamp,
                    price: swapRecord.price || 0,
                    signature: swapRecord.signature // ✅ Store real signature in rawData too
                }
            };
            
            // console.log(`💾 [EnhancedHybridPriceService] Saving swap record:`, JSON.stringify(persistentSwapRecord, null, 2));
            
            // Save to persistent storage
            await this.chartDatabase.storeSwaps([persistentSwapRecord]);
            // console.log(`💾 [EnhancedHybridPriceService] Swap queued for storage for ${tokenAddress}`);
            
            // Force immediate write
            const tokenDb = this.chartDatabase.getTokenDatabase(tokenAddress);
            const queue = this.chartDatabase.writeQueues?.get(tokenAddress);
            if (queue && queue.length > 0) {
                // console.log(`💾 [EnhancedHybridPriceService] Forcing immediate write of ${queue.length} queued swaps`);
                await this.chartDatabase.processTokenWriteQueue(tokenAddress);
                // console.log(`💾 [EnhancedHybridPriceService] Swap saved to persistent storage for ${tokenAddress}`);
            } else {
                // console.log(`💾 [EnhancedHybridPriceService] No swaps in queue (already written?)`);
            }
            
        } catch (error) {
            console.error(`❌ [EnhancedHybridPriceService] Failed to save swap to database:`, error.message);
            console.error(`❌ [EnhancedHybridPriceService] Error details:`, error);
        }
    }

    // 🚀 NEW: Load historical swaps from persistent storage
    async loadHistoricalSwaps(tokenAddress) {
        try {
            if (!this.chartDatabase) {
                console.log(`⚠️ [EnhancedHybridPriceService] ChartDatabase not available for ${tokenAddress}`);
                return [];
            }

            // ✅ CRITICAL FIX: Load swaps from per-token database file
            // The ChartDatabase stores swaps by tokenAddress in per-token files
            // We need to get the swaps directly from the token database
            const tokenDb = this.chartDatabase.getTokenDatabase(tokenAddress);
            
            console.log(`🔍 [EnhancedHybridPriceService] Token DB for ${tokenAddress.substring(0, 8)}:`, {
                hasTokenDb: !!tokenDb,
                hasSwaps: !!(tokenDb && tokenDb.swaps),
                swapCount: (tokenDb && tokenDb.swaps) ? tokenDb.swaps.size : 0
            });
            
            // Get swaps from the token's database (stored in memory and/or file)
            const swaps = [];
            if (tokenDb && tokenDb.swaps) {
                console.log(`📊 [EnhancedHybridPriceService] TokenDb.swaps is a Map with ${tokenDb.swaps.size} entries`);
                for (const swap of tokenDb.swaps.values()) {
                    swaps.push(swap);
                }
            }
            
            console.log(`📚 [EnhancedHybridPriceService] Loaded ${swaps.length} swaps from token database for ${tokenAddress.substring(0, 8)}`);
            if (!swaps || swaps.length === 0) {
                console.log(`📚 [EnhancedHybridPriceService] No historical swaps in database for token ${tokenAddress.substring(0, 8)}`);
                return [];
            }

            // Convert database format back to frontend format
            const historicalSwaps = swaps.map((dbSwap, index) => {
                // 🐛 DEBUG: Log the actual structure
                // console.log(`🔍 [EnhancedHybridPriceService] DB Swap ${index}:`, {
                //     hasRawData: !!dbSwap.rawData,
                //     hasType: !!dbSwap.type,
                //     hasTokenAmount: !!dbSwap.tokenAmount,
                //     hasBaseAmount: !!dbSwap.baseAmount,
                //     hasVolumeUsd: !!dbSwap.volumeUsd,
                //     hasMaker: !!dbSwap.maker,
                //     keys: Object.keys(dbSwap),
                //     rawDataKeys: dbSwap.rawData ? Object.keys(dbSwap.rawData) : 'no rawData'
                // });
                
                // ✅ CRITICAL FIX: Database stores data in rawData AND top level
                const rawData = dbSwap.rawData || {};
                // Try top level first, then fall back to rawData
                const swapType = dbSwap.type || rawData.type || 'unknown';
                const change = rawData.change || 0;
                const tokenAmount = dbSwap.tokenAmount || rawData.tokenAmount || Math.abs(change); // UI quantity
                const baseAmount = dbSwap.baseAmount || rawData.baseAmount || 0;
                const volumeUsd = dbSwap.volumeUsd || rawData.volumeUsd || 0;
                const maker = dbSwap.maker || rawData.maker || 'Unknown';
                const signature = dbSwap.signature || rawData.signature || `slot_${rawData.slot}_${rawData.timestamp}`;
                const poolAddress = dbSwap.poolAddress || rawData.poolAddress || 'UNKNOWN';
                const timestamp = rawData.timestamp || (dbSwap.timestamp * 1000) || Date.now();
                
                // console.log(`🔍 [EnhancedHybridPriceService] Converting swap ${index}: ${swapType}, tokenAmount: ${tokenAmount}, baseAmount: ${baseAmount}, volumeUsd: ${volumeUsd}, maker: ${maker}`);
                
                return {
                    timestamp: timestamp,
                    slot: rawData.slot || dbSwap.signature || 'unknown',
                    type: swapType,
                    change: change,
                    mintAddress: rawData.mintAddress || tokenAddress,
                    poolAddress: poolAddress,
                    // Frontend-compatible fields
                    tokenAmount: tokenAmount,
                    baseAmount: baseAmount,
                    volumeUsd: volumeUsd,
                    maker: maker,
                    signature: signature,
                    price: rawData.price || dbSwap.price || 0
                };
            });

            console.log(`📚 [EnhancedHybridPriceService] Converted ${historicalSwaps.length} historical swaps for ${tokenAddress}`);
            return historicalSwaps;

        } catch (error) {
            console.error(`❌ [EnhancedHybridPriceService] Error loading historical swaps for ${tokenAddress}:`, error.message);
            return [];
        }
    }

    // ✅ NEW: Auto-start monitoring for any token when requested
    async ensureTokenMonitoring(tokenAddress) {
        try {
            // ✅ Filter out stablecoins
            const STABLECOIN_ADDRESSES = new Set([
                'USDSwr9ApdHk5bvJKMjzff41FfuX8bSxdKcR81vTwcA', // USDS
                'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So', // mSOL
                '6FrrzDk5mQARGc1TDYoyVnSyRdds1t4PbtohCD6p3tgG', // Unknown stablecoin
                'HzwqbKZw8HxMN6bF2yFZNrht3c2iXXzpKcFu7uBEDKtr'  // Unknown stablecoin
            ]);
            
            if (STABLECOIN_ADDRESSES.has(tokenAddress)) {
                console.log(`⏭️ [EnhancedHybridPriceService] Skipping stablecoin: ${tokenAddress.substring(0, 8)}...`);
                return false;
            }
            
            // ✅ CRITICAL FIX: Add token to poolAddresses Map so swaps are tracked
            const wasNew = !this.poolAddresses.has(tokenAddress);
            
            if (wasNew) {
                console.log(`🔍 [EnhancedHybridPriceService] Discovering pool for ${tokenAddress}...`);
                
                // Try to discover pool address
                const poolAddress = await this.discoverPoolAddress(tokenAddress);
                
                if (poolAddress) {
                    this.poolAddresses.set(tokenAddress, poolAddress);
                    this.swapHistory.set(tokenAddress, []);
                    console.log(`✅ [EnhancedHybridPriceService] Added ${tokenAddress} -> pool ${poolAddress} to monitoring map`);
                } else {
                    console.log(`⚠️ [EnhancedHybridPriceService] Could not discover pool for ${tokenAddress}, adding with placeholder`);
                    // Add with placeholder - we'll still try to track swaps
                    this.poolAddresses.set(tokenAddress, 'unknown');
                    this.swapHistory.set(tokenAddress, []);
                }
                
                // ✅ CRITICAL FIX: Restart stream to include new token's pool
                if (Array.isArray(this.sharedStreams) && this.sharedStreams.length > 0) {
                    console.log(`🔄 [EnhancedHybridPriceService] Restarting stream to include ${tokenAddress}...`);
                    await this.startRealTimeMonitoring(true);  // ← Force restart
                }
            } else {
                console.log(`✅ [EnhancedHybridPriceService] Token ${tokenAddress} already in monitoring map`);
            }
            
            // Check if stream is running (start if not)
            if (!Array.isArray(this.sharedStreams) || this.sharedStreams.length === 0) {
                console.log(`⚠️ [EnhancedHybridPriceService] Stream not running, starting it...`);
                await this.startRealTimeMonitoring();
            }
            
            return true;
            
        } catch (error) {
            console.error(`❌ [EnhancedHybridPriceService] Failed to ensure monitoring for ${tokenAddress}:`, error.message);
            return false;
        }
    }

    // ✅ UNIVERSAL IMPLEMENTATION: Get real-time data for ANY token address
    async getRealTimeTokenData(tokenAddress) {
        try {
            console.log(`🔍 [EnhancedHybridPriceService] Getting UNIVERSAL real-time data for ${tokenAddress}`);
            
            // ✅ UNIVERSAL: Auto-start monitoring for any token
            await this.ensureTokenMonitoring(tokenAddress);
            
            // ✅ UNIVERSAL: Use real-time swap data from transaction monitoring for ANY token
            const realTimeData = this.realTimeUpdates.get(tokenAddress);
            let recentSwaps = [];
            
            // Always try to load historical swaps first
            try {
                const historicalSwaps = await this.loadHistoricalSwaps(tokenAddress);
                if (historicalSwaps && historicalSwaps.length > 0) {
                    console.log(`📚 [EnhancedHybridPriceService] Loaded ${historicalSwaps.length} historical swaps for ${tokenAddress}`);
                    recentSwaps = historicalSwaps.sort((a, b) => b.timestamp - a.timestamp);
                }
            } catch (error) {
                console.error(`❌ [EnhancedHybridPriceService] Error loading historical swaps for ${tokenAddress}:`, error.message);
            }
            
            // Merge with real-time swaps if available
            if (realTimeData && realTimeData.swaps && realTimeData.swaps.length > 0) {
                console.log(`✅ [EnhancedHybridPriceService] Merging with real-time swap data: ${realTimeData.swaps.length} swaps for ${tokenAddress}`);
                recentSwaps = [...recentSwaps, ...realTimeData.swaps];
                recentSwaps.sort((a, b) => b.timestamp - a.timestamp);
                // Remove duplicates by signature
                const uniqueSwaps = [];
                const seenSignatures = new Set();
                recentSwaps.forEach(swap => {
                    if (!seenSignatures.has(swap.signature)) {
                        seenSignatures.add(swap.signature);
                        uniqueSwaps.push(swap);
                    }
                });
                recentSwaps = uniqueSwaps;
            }
            
            if (recentSwaps.length === 0) {
                console.log(`⚠️ [EnhancedHybridPriceService] No swaps found at all`);
                    
                    // Fallback: Get current pool reserves
                const poolAddress = this.poolAddresses.get(tokenAddress);
                if (!poolAddress) {
                    console.log(`❌ [EnhancedHybridPriceService] No pool address for ${tokenAddress}, discovering...`);
                    const discoveredPool = await this.discoverPoolAddress(tokenAddress);
                    if (discoveredPool) {
                        this.poolAddresses.set(tokenAddress, discoveredPool);
                        console.log(`✅ [EnhancedHybridPriceService] Discovered pool ${discoveredPool} for ${tokenAddress}`);
                    } else {
                        console.log(`❌ [EnhancedHybridPriceService] Could not discover pool for ${tokenAddress}`);
                        return null;
                    }
                }
                
                // Get token info
                const tokenInfo = await this.fetchTokenInfo(tokenAddress);
                console.log(`🔍 [DEBUG] tokenInfo:`, tokenInfo ? 'Found' : 'Not found');
                
                return {
                    tokenInfo: tokenInfo,
                    poolData: {
                        tokenReserves: 0, // Will be updated by transaction monitoring
                        solReserves: 0,   // Will be updated by transaction monitoring
                        price: 0          // Will be calculated from swaps
                    },
                    recentSwaps: [],
                    swapHistory: [],
                    totalSwaps: 0,
                    lastUpdated: new Date().toISOString()
                };
            }
            
            // Get token info
            const tokenInfo = await this.fetchTokenInfo(tokenAddress);
            console.log(`🔍 [DEBUG] tokenInfo:`, tokenInfo ? 'Found' : 'Not found');
            
            return {
                tokenInfo: tokenInfo,
                poolData: {
                    tokenReserves: 0, // Will be updated by transaction monitoring
                    solReserves: 0,   // Will be updated by transaction monitoring
                    price: 0          // Will be calculated from swaps
                },
                recentSwaps: recentSwaps,
                swapHistory: recentSwaps,
                totalSwaps: realTimeData ? realTimeData.totalSwaps : recentSwaps.length,
                lastUpdated: realTimeData ? new Date(realTimeData.lastUpdated).toISOString() : new Date().toISOString()
            };
            
        } catch (error) {
            console.error(`❌ [EnhancedHybridPriceService] Error getting universal real-time data for ${tokenAddress}:`, error.message);
            return null;
        }
    }

    // Rate-limited Jupiter API request with caching
    async makeJupiterRequest(url, params = {}) {
        const cacheKey = `${url}?${JSON.stringify(params)}`;
        const now = Date.now();
        
        // Check cache first
        if (this.jupiterCache.has(cacheKey)) {
            const cached = this.jupiterCache.get(cacheKey);
            if (now - cached.timestamp < this.jupiterCacheDuration) {
                console.log(`📦 [Jupiter] Using cached data for: ${params.query || 'SOL'}`);
                return cached.data;
            }
        }
        
        // Rate limiting: wait if needed
        const timeSinceLastRequest = now - this.lastJupiterRequest;
        if (timeSinceLastRequest < this.jupiterRequestDelay) {
            const waitTime = this.jupiterRequestDelay - timeSinceLastRequest;
            console.log(`⏳ [Jupiter] Rate limiting: waiting ${waitTime}ms`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
        
        try {
            console.log(`🌐 [Jupiter] Making request for: ${params.query || 'SOL'}`);
            const response = await axios.get(url, {
                params,
                timeout: 10000 // 10 second timeout
            });
            
            // Cache the response
            this.jupiterCache.set(cacheKey, {
                data: response.data,
                timestamp: now
            });
            
            this.lastJupiterRequest = Date.now();
            return response.data;
            
        } catch (error) {
            if (error.response?.status === 429) {
                console.log(`⚠️ [Jupiter] Rate limited! Using cached data if available`);
                // Try to return cached data even if expired
                if (this.jupiterCache.has(cacheKey)) {
                    const cached = this.jupiterCache.get(cacheKey);
                    console.log(`📦 [Jupiter] Returning expired cached data for: ${params.query || 'SOL'}`);
                    return cached.data;
                }
            }
            throw error;
        }
    }

    async fetchTokenInfo(tokenAddress) {
        try {
            // Check cache first
            if (this.tokenMetadataCache.has(tokenAddress)) {
                console.log(`📋 [EnhancedHybridPriceService] Using cached token metadata for ${tokenAddress}`);
                return this.tokenMetadataCache.get(tokenAddress);
            }
            
            console.log(`🔍 [EnhancedHybridPriceService] Fetching token metadata from Jupiter for ${tokenAddress}`);
            const data = await this.makeJupiterRequest('https://lite-api.jup.ag/tokens/v2/search', {
                query: tokenAddress
            });

            // Jupiter API returns array directly, not wrapped in value object
            if (data && Array.isArray(data) && data.length > 0) {
                const tokenInfo = data[0];
                
                // Cache the token metadata
                this.tokenMetadataCache.set(tokenAddress, tokenInfo);
                console.log(`💾 [EnhancedHybridPriceService] Cached token metadata for ${tokenAddress}: decimals=${tokenInfo.decimals}, graduatedPool=${tokenInfo.graduatedPool}`);
                
                return tokenInfo;
            }
            
            return null;
        } catch (error) {
            console.error(`❌ [Jupiter] Error fetching token info:`, error.message);
            return null;
        }
    }

    async updateSolPrice() {
        const now = Date.now();
        
        if (this.solPriceUSD > 0 && (now - this.lastSolPriceUpdate) < this.solPriceCacheDuration) {
            return;
        }

        try {
            // Try multiple sources for SOL price
            let solPrice = 0;
            
            // Method 1: Try Jupiter API for Wrapped SOL
            try {
                const data = await this.makeJupiterRequest('https://lite-api.jup.ag/tokens/v2/search', {
                    query: 'So11111111111111111111111111111111111111112' // Wrapped SOL mint address
                });

                if (data && Array.isArray(data)) {
                    const solToken = data.find(token => 
                        token.id === 'So11111111111111111111111111111111111111112' &&
                        token.usdPrice > 0
                    );

                    if (solToken && solToken.usdPrice) {
                        solPrice = solToken.usdPrice;
                        console.log(`💰 [SOL Price] Found via Jupiter: $${solPrice}`);
                    }
                }
            } catch (error) {
                console.log('⚠️ [SOL Price] Jupiter API failed, trying fallback...');
            }
            
            // Method 2: Fallback to CoinGecko API
            if (solPrice === 0) {
                try {
                    const response = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
                        params: {
                            ids: 'solana',
                            vs_currencies: 'usd'
                        },
                        timeout: 5000
                    });
                    
                    if (response.data && response.data.solana && response.data.solana.usd) {
                        solPrice = response.data.solana.usd;
                    }
                } catch (error) {
                    console.log('⚠️ [SOL Price] CoinGecko API failed, using default...');
                }
            }
            
            // Method 3: Use reasonable default
            if (solPrice === 0) {
                solPrice = 200; // Reasonable SOL price fallback
                console.log('⚠️ [SOL Price] Using fallback price: $200');
            }

            this.solPriceUSD = solPrice;
            this.lastSolPriceUpdate = now;
            console.log(`💰 [SOL Price] Updated to: $${solPrice}`);
            
        } catch (error) {
            console.error('❌ [SOL Price] Error updating SOL price:', error.message);
            this.solPriceUSD = 200; // Fallback
        }
    }

    // Cleanup methods
    stopRealTimeMonitoring() {
        console.log('🛑 [EnhancedHybridPriceService] Stopping real-time monitoring...');
        
        // Stop all streams
        this.grpcStreams.forEach(stream => stream.end());
        this.grpcStreams.clear();
        
        // Clear real-time updates
        this.realTimeUpdates.clear();
        
        console.log('✅ [EnhancedHybridPriceService] Real-time monitoring stopped');
    }

    async shutdown() {
        console.log('🛑 [EnhancedHybridPriceService] Shutting down...');
        
        // Stop all gRPC streams
        this.grpcStreams.forEach(stream => stream.end());
        this.grpcStreams.clear();
        this.realTimeUpdates.clear();
        
        console.log('✅ [EnhancedHybridPriceService] Shutdown complete');
    }
    
    getRealTimeStats() {
        return {
            activeStreams: this.activeStreams ? Array.from(this.activeStreams.keys()) : [],
            totalTokens: this.poolAddresses ? this.poolAddresses.size : 0,
            totalSwaps: this.swapHistory ? Array.from(this.swapHistory.values()).reduce((total, swaps) => total + swaps.length, 0) : 0,
            realTimeUpdates: this.realTimeUpdates ? this.realTimeUpdates.size : 0
        };
    }

    // ✅ NEW: Get decoder statistics to verify usage in production
    getDecoderStats() {
        const ammMetrics = this.raydiumDecoder?.getMetrics() || {};
        const cpmmMetrics = this.raydiumCPMMDecoder?.getMetrics() || {};
        const clmmMetrics = this.raydiumCLMMDecoder?.getMetrics() || {};
        
        return {
            raydiumAMM: {
                usage: this._ammDecoderUsed || 0,
                ...ammMetrics
            },
            raydiumCPMM: {
                usage: this._cpmmDecoderUsed || 0,
                ...cpmmMetrics
            },
            raydiumCLMM: {
                usage: this._clmmDecoderUsed || 0,
                ...clmmMetrics
            },
            totalDecoderUses: (this._ammDecoderUsed || 0) + (this._cpmmDecoderUsed || 0) + (this._clmmDecoderUsed || 0),
            decoderActive: {
                amm: this.raydiumDecoder !== null && this.raydiumDecoder !== undefined,
                cpmm: this.raydiumCPMMDecoder !== null && this.raydiumCPMMDecoder !== undefined,
                clmm: this.raydiumCLMMDecoder !== null && this.raydiumCLMMDecoder !== undefined
            }
        };
    }

    // ✅ NEW: Get real-time tooltip data for bubble map
    getRealTimeTooltipData(tokenAddress) {
        const swaps = this.swapHistory.get(tokenAddress) || [];
        const metadata = this.tokenMetadataCache.get(tokenAddress);
        const latestSwap = swaps[swaps.length - 1];
        
        if (!latestSwap || !metadata) return null;
        
        const now = Date.now();
        
        // Calculate time-windowed metrics
        const metrics = {
            '5m': this.calculateWindowMetrics(swaps, now - 5 * 60 * 1000, now),
            '1h': this.calculateWindowMetrics(swaps, now - 60 * 60 * 1000, now),
            '6h': this.calculateWindowMetrics(swaps, now - 6 * 60 * 60 * 1000, now),
            '24h': this.calculateWindowMetrics(swaps, now - 24 * 60 * 60 * 1000, now)
        };
        
        // ✅ HYBRID APPROACH: Jupiter base price + swap delta adjustment
        // Use Jupiter's cached price as stable base, adjust with recent swap trend
        
        const jupiterPriceUsd = metadata.price || 0; // Stable base from Jupiter
        const supply = metadata.supply || 0;
        
        // Calculate price delta from recent swaps (10-minute window for stability)
        const tenMinutesAgo = now - 10 * 60 * 1000;
        const recentSwaps = swaps.filter(s => s.timestamp >= tenMinutesAgo);
        
        let priceAdjustment = 0; // Delta to apply to Jupiter price
        
        if (recentSwaps.length >= 5 && jupiterPriceUsd > 0) {
            // Calculate VWAP from recent swaps
            let totalVolume = 0;
            let weightedPriceSum = 0;
            
            recentSwaps.forEach(swap => {
                const volume = Math.abs(swap.amountUsd || 0);
                totalVolume += volume;
                weightedPriceSum += swap.price * volume;
            });
            
            if (totalVolume > 0) {
                const swapVWAP = weightedPriceSum / totalVolume;
                const swapVWAPUsd = swapVWAP * this.solPriceUSD;
                
                // Calculate percentage difference between swap VWAP and Jupiter price
                const priceDelta = ((swapVWAPUsd - jupiterPriceUsd) / jupiterPriceUsd) * 100;
                
                // Apply delta with dampening (max ±5% adjustment to prevent wild swings)
                const maxAdjustment = 5; // Max 5% adjustment
                const clampedDelta = Math.max(-maxAdjustment, Math.min(maxAdjustment, priceDelta));
                
                priceAdjustment = jupiterPriceUsd * (clampedDelta / 100);
            }
        }
        
        // Final hybrid price: Jupiter base + swap-based adjustment
        const hybridPriceUsd = jupiterPriceUsd + priceAdjustment;
        
        // ✅ Calculate market cap from hybrid price
        const liveMarketCap = supply > 0 ? (hybridPriceUsd * supply) : (metadata.marketCap || 0);
        
        // ✅ Use Jupiter's stats data for 24h metrics (true 24h window)
        const jupiterStats = metadata.jupiterData?.stats24h || {};
        const jupiterStats5m = metadata.jupiterData?.stats5m || {};
        const jupiterStats1h = metadata.jupiterData?.stats1h || {};
        const jupiterStats6h = metadata.jupiterData?.stats6h || {};
        
        return {
            // Basic info
            symbol: metadata.symbol,
            name: metadata.name,
            address: tokenAddress,
            age: this.calculateAge(metadata.createdAt || metadata.timestamp),
            
            // ✅ HYBRID Price: Jupiter base + swap delta (stable + responsive!)
            price: hybridPriceUsd,
            priceSol: hybridPriceUsd / this.solPriceUSD,
            
            // ✅ LIVE Market Cap: Calculated from live price × supply
            marketCap: liveMarketCap,
            liquidity: metadata.liquidity || 0,
            supply: supply,
            
            // ✅ 24h metrics: Use Jupiter data (true 24h) or fallback to our metrics
            volume24h: jupiterStats.buyVolume && jupiterStats.sellVolume 
                ? (jupiterStats.buyVolume + jupiterStats.sellVolume) 
                : metrics['24h'].volume,
            txns24h: jupiterStats.numBuys && jupiterStats.numSells 
                ? (jupiterStats.numBuys + jupiterStats.numSells) 
                : metrics['24h'].txns,
            makers24h: jupiterStats.numTraders || metrics['24h'].makers,
            
            // ✅ Price changes: Use Jupiter stats (accurate) or fallback to our calculations
            priceChange5m: jupiterStats5m.priceChange ?? metrics['5m'].priceChange,
            priceChange1h: jupiterStats1h.priceChange ?? metrics['1h'].priceChange,
            priceChange6h: jupiterStats6h.priceChange ?? metrics['6h'].priceChange,
            priceChange24h: jupiterStats.priceChange ?? metrics['24h'].priceChange,
            
            // Real-time indicator
            lastUpdate: latestSwap.timestamp,
            isLive: (now - latestSwap.timestamp) < 60000 // Updated in last minute
        };
    }

    // ✅ NEW: Get real-time ranking data for all monitored tokens
    getRealTimeRankingData() {
        const rankings = [];
        
        console.log(`📊 [getRealTimeRankingData] Checking ${this.poolAddresses.size} monitored tokens...`);
        console.log(`📊 [getRealTimeRankingData] Metadata cache has ${this.tokenMetadataCache.size} entries`);
        
        // Include ALL monitored tokens (from poolAddresses map)
        for (const [tokenAddress, poolAddress] of this.poolAddresses.entries()) {
            const swaps = this.swapHistory.get(tokenAddress) || [];
            const metadata = this.tokenMetadataCache.get(tokenAddress);
            
            // Skip if no metadata (shouldn't happen, but safety check)
            if (!metadata) {
                console.log(`⚠️ [getRealTimeRankingData] No metadata for ${tokenAddress.substring(0, 8)}...`);
                continue;
            }
            
            // If token has swaps, use real-time data
            if (swaps.length > 0) {
                const tooltipData = this.getRealTimeTooltipData(tokenAddress);
                if (tooltipData) {
                    rankings.push({
                        ...tooltipData,
                        // ✅ CRITICAL: Include full token metadata for frontend
                        contractAddress: tokenAddress,
                        tokenAddress: tokenAddress,
                        logo: metadata.logo,
                        jupiterData: metadata.jupiterData || { icon: metadata.logo },
                        rank: 0 // Will be set after sorting
                    });
                }
            } else {
                // Token is monitored but has no swaps yet - use cached data
                const currentPriceUsd = metadata.price || 0;
                const supply = metadata.supply || 0;
                
                rankings.push({
                    // Basic info
                    symbol: metadata.symbol,
                    name: metadata.name,
                    address: tokenAddress,
                    contractAddress: tokenAddress, // ✅ CRITICAL for TokenDetails modal
                    tokenAddress: tokenAddress,
                    age: this.calculateAge(metadata.createdAt || metadata.timestamp),
                    
                    // ✅ CRITICAL: Include logo/icon for PFPs
                    logo: metadata.logo,
                    jupiterData: metadata.jupiterData || { icon: metadata.logo },
                    
                    // Price (from cache)
                    price: currentPriceUsd,
                    priceSol: metadata.priceSol || 0,
                    
                    // Market data (from cache)
                    marketCap: metadata.marketCap || (currentPriceUsd * supply),
                    liquidity: metadata.liquidity || 0,
                    supply: supply,
                    
                    // No swap activity yet
                    volume24h: 0,
                    txns24h: 0,
                    makers24h: 0,
                    
                    // No price changes
                    priceChange5m: 0,
                    priceChange1h: 0,
                    priceChange6h: 0,
                    priceChange24h: 0,
                    
                    // Not live (no recent swaps)
                    lastUpdate: null,
                    isLive: false,
                    rank: 0
                });
            }
        }
        
        // Sort by 24h volume (descending), then by market cap
        rankings.sort((a, b) => {
            if (b.volume24h !== a.volume24h) {
                return b.volume24h - a.volume24h;
            }
            return b.marketCap - a.marketCap;
        });
        
        // Assign ranks
        rankings.forEach((token, index) => {
            token.rank = index + 1;
        });
        
        return rankings;
    }

    // ✅ NEW: Get ALL rankings (all tokens from cache merged with real-time data)
    async getAllRankingsData() {
        try {
            // Reload token cache to get latest tokens
            await this.loadTokenCache();
            
            // ✅ OPTION 3: Smart Monitoring - Auto-monitor top N tokens (prioritize by score/volume)
            // Constant K gRPC capacity: 5000000 channel capacity, 5000 unary concurrency
            // We can safely monitor up to 5000 tokens (well within limits)
            const MAX_MONITORED_TOKENS = 5000;
            
            // ✅ Filter out stablecoins and LSTs (known addresses)
            const STABLECOIN_ADDRESSES = new Set([
                'USDSwr9ApdHk5bvJKMjzff41FfuX8bSxdKcR81vTwcA', // USDS
                'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So', // mSOL
                '6FrrzDk5mQARGc1TDYoyVnSyRdds1t4PbtohCD6p3tgG', // Unknown stablecoin
                'HzwqbKZw8HxMN6bF2yFZNrht3c2iXXzpKcFu7uBEDKtr'  // Unknown stablecoin
            ]);
            
            // Common LST (Liquid Staking Token) addresses
            const LST_ADDRESSES = new Set([
                'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So', // mSOL (already in stablecoins)
                '7dHbWXmci3dT8UFYWYZweBLXgycu7Y3iL6trKn1Y7ARj', // stSOL
                'bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1', // bSOL
                '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs', // ETH (Wormhole)
                'So11111111111111111111111111111111111111112'   // SOL (native)
            ]);
            
            const topTokens = this.tokenCache
                .filter(token => {
                    const address = token.contractAddress || token.tokenAddress;
                    // Filter out stablecoins and ensure token has address and score
                    return address && 
                           !STABLECOIN_ADDRESSES.has(address) &&
                           (token.overallScore || token.score || 0) > 0;
                })
                .sort((a, b) => {
                    // Sort by overall score first, then by volume
                    const scoreA = a.overallScore || a.score || 0;
                    const scoreB = b.overallScore || b.score || 0;
                    if (scoreB !== scoreA) return scoreB - scoreA;
                    
                    const volumeA = (a.jupiterData?.stats24h?.buyVolume || 0) + (a.jupiterData?.stats24h?.sellVolume || 0);
                    const volumeB = (b.jupiterData?.stats24h?.buyVolume || 0) + (b.jupiterData?.stats24h?.sellVolume || 0);
                    return volumeB - volumeA;
                })
                .slice(0, MAX_MONITORED_TOKENS);
            
            // Auto-monitor top tokens that aren't already monitored (batch, non-blocking)
            let monitoringPromises = [];
            let newMonitoringCount = 0;
            for (const token of topTokens) {
                const address = token.contractAddress || token.tokenAddress;
                if (address && !this.poolAddresses.has(address)) {
                    // Only monitor if we have pool info (graduatedPool or firstPool)
                    const hasPool = token.graduatedPool || token.jupiterData?.graduatedPool || token.jupiterData?.firstPool?.id;
                    if (hasPool) {
                        monitoringPromises.push(
                            this.ensureTokenMonitoring(address).catch(err => {
                                console.warn(`⚠️ [SmartMonitoring] Failed to monitor ${token.symbol}:`, err.message);
                            })
                        );
                        newMonitoringCount++;
                        // Limit concurrent monitoring (batch size) to avoid overwhelming the system
                        // With 5000 unary concurrency, we can safely batch 50-100 at a time
                        if (monitoringPromises.length >= 50) {
                            await Promise.all(monitoringPromises);
                            monitoringPromises = [];
                        }
                    }
                }
            }
            // Wait for remaining monitoring promises
            if (monitoringPromises.length > 0) {
                await Promise.all(monitoringPromises);
            }
            if (newMonitoringCount > 0) {
                console.log(`✅ [SmartMonitoring] Auto-monitored ${newMonitoringCount} new tokens (total monitored: ${this.poolAddresses.size})`);
            }
            
            // Get real-time metrics for monitored tokens
            const realTimeMetrics = new Map();
            for (const [tokenAddress] of this.poolAddresses.entries()) {
                const tooltipData = this.getRealTimeTooltipData(tokenAddress);
                if (tooltipData) {
                    realTimeMetrics.set(tokenAddress, tooltipData);
                }
            }
            
            // ✅ Filter out stablecoins and LSTs from display (reuse constants from above)
            // Merge cache tokens with real-time metrics, filtering out stablecoins and LSTs
            const rankings = this.tokenCache
                .filter(token => {
                    const address = token.contractAddress || token.tokenAddress;
                    // Filter out stablecoins and LSTs from display
                    return address && 
                           !STABLECOIN_ADDRESSES.has(address) && 
                           !LST_ADDRESSES.has(address);
                })
                .map(token => {
                const address = token.contractAddress || token.tokenAddress;
                const realTimeData = realTimeMetrics.get(address);
                
                // Get Jupiter data for fallback
                const jupiter24h = token.jupiterData?.stats24h || {};
                const jupiter5m = token.jupiterData?.stats5m || {};
                const jupiter1h = token.jupiterData?.stats1h || {};
                const jupiter6h = token.jupiterData?.stats6h || {};
                
                // Calculate safe sums for Jupiter stats
                const jupiterVolume24h = (jupiter24h.buyVolume || 0) + (jupiter24h.sellVolume || 0);
                const jupiterTxns24h = (jupiter24h.numBuys || 0) + (jupiter24h.numSells || 0);
                
                // Get price and circulating supply from existing cache (no API calls)
                const jupiterPrice = realTimeData?.price || token.jupiterData?.price || token.jupiterData?.usdPrice || token.price || 0;
                const circSupply = token.jupiterData?.circSupply || token.circSupply || 0;
                
                // ✅ Calculate market cap from price × circSupply if we have both (fresher than stale Jupiter mcap)
                const calculatedMarketCap = (jupiterPrice > 0 && circSupply > 0) 
                    ? (jupiterPrice * circSupply) 
                    : null;
                
                return {
                    ...token,
                    // Override with real-time data if available
                    price: jupiterPrice,
                    volume24h: realTimeData?.volume24h || jupiterVolume24h || 0,
                    txns24h: realTimeData?.txns24h || jupiterTxns24h || 0,
                    makers24h: realTimeData?.makers24h || jupiter24h.numTraders || 0,
                    priceChange5m: realTimeData?.priceChange5m || jupiter5m.priceChange || 0,
                    priceChange1h: realTimeData?.priceChange1h || jupiter1h.priceChange || 0,
                    priceChange6h: realTimeData?.priceChange6h || jupiter6h.priceChange || 0,
                    priceChange24h: realTimeData?.priceChange24h || token.jupiterData?.priceChange24h || 0,
                    // ✅ Market cap: Real-time (gRPC) > Calculated (price × circSupply) > Stale Jupiter mcap
                    marketCap: realTimeData?.marketCap || calculatedMarketCap || token.marketCap || token.jupiterData?.mcap || 0,
                    liquidity: realTimeData?.liquidity || token.liquidity || token.jupiterData?.liquidity || 0,
                    isLive: !!realTimeData,
                    overallScore: token.overallScore || token.score || 0,
                    rank: 0 // Will be set after sorting
                };
            });
            
            // Sort by Overall Score
            rankings.sort((a, b) => {
                const scoreA = a.overallScore || 0;
                const scoreB = b.overallScore || 0;
                if (scoreB !== scoreA) {
                    return scoreB - scoreA;
                }
                return (b.marketCap || 0) - (a.marketCap || 0);
            });
            
            // Assign ranks
            rankings.forEach((token, index) => {
                token.rank = index + 1;
            });
            
            return rankings;
        } catch (error) {
            console.error('❌ [EnhancedHybridPriceService] Error getting all rankings:', error.message);
            // Fallback to monitored tokens only
            return this.getRealTimeRankingData();
        }
    }

    calculateWindowMetrics(swaps, startTime, endTime) {
        const windowSwaps = swaps.filter(s => 
            s.timestamp >= startTime && s.timestamp <= endTime
        );
        
        if (windowSwaps.length === 0) {
            return {
                volume: 0,
                txns: 0,
                makers: 0,
                priceChange: 0
            };
        }
        
        const firstPrice = windowSwaps[0].price;
        const lastPrice = windowSwaps[windowSwaps.length - 1].price;
        const priceChange = firstPrice > 0 ? ((lastPrice - firstPrice) / firstPrice) * 100 : 0;
        
        const uniqueMakers = new Set(windowSwaps.map(s => s.maker)).size;
        const totalVolume = windowSwaps.reduce((sum, s) => sum + (s.volumeUsd || 0), 0);
        
        return {
            volume: totalVolume,
            txns: windowSwaps.length,
            makers: uniqueMakers,
            priceChange: priceChange
        };
    }

    calculateAge(createdAt) {
        if (!createdAt) return 'Unknown';
        
        const now = Date.now();
        const diff = now - createdAt;
        
        const days = Math.floor(diff / (24 * 60 * 60 * 1000));
        const hours = Math.floor(diff / (60 * 60 * 1000));
        const minutes = Math.floor(diff / (60 * 1000));
        
        if (days > 0) return `${days}d`;
        if (hours > 0) return `${hours}h`;
        return `${minutes}m`;
    }

    // ✅ NEW: Start periodic ranking broadcasts
    startRankingBroadcasts(intervalMs = 30000) {
        if (this.rankingBroadcastInterval) {
            clearInterval(this.rankingBroadcastInterval);
        }

        this.rankingBroadcastInterval = setInterval(async () => {
            if (this.webSocketServer) {
                try {
                    // ✅ Use getAllRankingsData to include ALL tokens (not just monitored ones)
                    const rankings = await this.getAllRankingsData();
                    if (rankings.length > 0) {
                        this.webSocketServer.broadcastRankingUpdate(rankings);
                    }
                } catch (error) {
                    console.error('❌ [EnhancedHybridPriceService] Error in ranking broadcast:', error.message);
                }
            }
        }, intervalMs);

        console.log(`✅ [EnhancedHybridPriceService] Started ranking broadcasts every ${intervalMs / 1000}s (ALL tokens)`);
    }

    // ✅ NEW: Stop ranking broadcasts
    stopRankingBroadcasts() {
        if (this.rankingBroadcastInterval) {
            clearInterval(this.rankingBroadcastInterval);
            this.rankingBroadcastInterval = null;
            console.log('✅ [EnhancedHybridPriceService] Stopped ranking broadcasts');
        }
    }

    getGrpcStatus() {
        const sharedStreams = Array.isArray(this.sharedStreams) ? this.sharedStreams : [];
        
        // Get SSE status
        const sseStatus = this.sseService ? this.sseService.getStatus() : null;
        
        return {
            instanceId: this.clientInstanceId,
            grpcInitialized: this.isGrpcInitialized(),
            sharedStreamCount: sharedStreams.length,
            sharedStreamPoolCount: this.sharedStreamPoolCount || 0,
            monitoredTokenCount: this.poolAddresses ? this.poolAddresses.size : 0,
            retryCount: this.sharedStreamRetryCount || 0,
            restartScheduled: !!this._sharedStreamRestartScheduled,
            streams: sharedStreams.map(stream => ({
                batchIndex: stream?._batchIndex ?? null,
                tokenCount: stream?._tokenCount ?? null,
                readable: typeof stream?.readable === 'boolean' ? stream.readable : undefined,
                closed: typeof stream?.closed === 'boolean' ? stream.closed : undefined
            })),
            // SSE status
            sse: sseStatus ? {
                enabled: this.useSolanaVibeSSE,
                connected: sseStatus.isConnected,
                subscribedMints: sseStatus.subscribedMints,
                priceUpdatesProcessed: sseStatus.stats.priceUpdatesProcessed,
                errors: sseStatus.stats.errors,
                uptime: Math.floor(sseStatus.stats.uptime / 1000), // Convert to seconds
                timeSinceLastMessage: sseStatus.timeSinceLastMessage ? Math.floor(sseStatus.timeSinceLastMessage / 1000) : null
            } : {
                enabled: false,
                connected: false
            }
        };
    }

    // ✅ NEW: Start periodic decoder stats logging
    startDecoderStatsLogging(intervalMs = 300000) { // Default: 5 minutes
        if (this.decoderStatsInterval) {
            clearInterval(this.decoderStatsInterval);
        }

        this.decoderStatsInterval = setInterval(() => {
            const stats = this.getDecoderStats();
            console.log('\n📊 [DECODER STATS] Production Usage Statistics:');
            console.log('='.repeat(80));
            console.log(`   Raydium AMM Decoder:`);
            console.log(`      Usage:           ${stats.raydiumAMM.usage || 0} swaps processed`);
            console.log(`      Cache Size:      ${stats.raydiumAMM.cacheSize || 0} pools cached`);
            console.log(`      Success Rate:    ${stats.raydiumAMM.successRate || 'N/A'}`);
            console.log(`      Cache Hits:      ${stats.raydiumAMM.cacheHits || 0}`);
            console.log(`   Raydium CPMM Decoder:`);
            console.log(`      Usage:           ${stats.raydiumCPMM.usage || 0} swaps processed`);
            console.log(`      Cache Size:      ${stats.raydiumCPMM.cacheSize || 0} pools cached`);
            console.log(`      Success Rate:    ${stats.raydiumCPMM.successRate || 'N/A'}`);
            console.log(`      Cache Hits:      ${stats.raydiumCPMM.cacheHits || 0}`);
            console.log(`   Total:`);
            console.log(`      Combined Usage:  ${stats.totalDecoderUses} swaps processed`);
            console.log(`      Status:          ${stats.decoderActive.amm && stats.decoderActive.cpmm ? '✅ Both Active' : '⚠️ Some Inactive'}`);
            console.log('='.repeat(80) + '\n');
        }, intervalMs);

        console.log(`✅ [EnhancedHybridPriceService] Started decoder stats logging (every ${intervalMs / 1000}s)`);
    }

    // ✅ NEW: Stop decoder stats logging
    stopDecoderStatsLogging() {
        if (this.decoderStatsInterval) {
            clearInterval(this.decoderStatsInterval);
            this.decoderStatsInterval = null;
            console.log('✅ [EnhancedHybridPriceService] Stopped decoder stats logging');
        }
    }

    // 🚀 RATE-LIMITED POOL DECODING QUEUE SYSTEM
    
    /**
     * Queue a pool decode request with deduplication
     * Prevents multiple decode requests for the same pool
     */
    queuePoolDecode(decoder, poolAddress) {
        // Check if pool is already cached (avoid queueing)
        if (decoder.poolCache?.has(poolAddress)) {
            return; // Already cached, no need to decode
        }
        
        // Check if pool is already in queue or being decoded
        if (this.poolDecodeInProgress.has(poolAddress)) {
            return; // Already being decoded, skip
        }
        
        // Check if already in queue
        if (this.poolDecodeQueue.some(item => item.poolAddress === poolAddress && item.decoder === decoder)) {
            return; // Already queued, skip
        }
        
        // Add to queue
        this.poolDecodeQueue.push({
            decoder,
            poolAddress,
            timestamp: Date.now()
        });
        
        // Start processing if not already running
        if (!this.poolDecodeProcessing) {
            this.processPoolDecodeQueue();
        }
    }
    
    /**
     * Process the pool decode queue sequentially with rate limiting
     * Processes one decode request every 500ms to avoid RPC rate limits
     */
    async processPoolDecodeQueue() {
        if (this.poolDecodeProcessing) {
            return; // Already processing
        }
        
        this.poolDecodeProcessing = true;
        
        while (this.poolDecodeQueue.length > 0) {
            const item = this.poolDecodeQueue.shift();
            
            // Check again if pool is cached (might have been decoded by another request)
            if (item.decoder.poolCache?.has(item.poolAddress)) {
                continue; // Already cached, skip
            }
            
            // Mark as in progress
            this.poolDecodeInProgress.add(item.poolAddress);
            
            try {
                // Wait for rate limit delay (500ms between requests)
                const now = Date.now();
                const timeSinceLastDecode = now - this.lastPoolDecode;
                if (timeSinceLastDecode < this.poolDecodeDelay) {
                    await new Promise(resolve => setTimeout(resolve, this.poolDecodeDelay - timeSinceLastDecode));
                }
                
                // Decode the pool
                await item.decoder.decodePoolState(item.poolAddress);
                
                this.lastPoolDecode = Date.now();
                
            } catch (error) {
                // Silently fail - decoder will fall back to heuristics
                // Errors are already logged by the decoder itself
            } finally {
                // Remove from in-progress set
                this.poolDecodeInProgress.delete(item.poolAddress);
            }
        }
        
        this.poolDecodeProcessing = false;
    }
}

export default EnhancedHybridPriceService;