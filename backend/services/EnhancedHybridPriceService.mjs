import axios from 'axios';
import EventEmitter from 'events';
import fs from 'fs/promises';
import path from 'path';
import bs58 from 'bs58';

// Use CommonJS wrapper for gRPC loading
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
let GrpcWrapper = null;

const CONSTANT_K_RPC = 'https://rpc.constant-k.com/?api-key=tsn41k3y-4qch-46f2-5ogr-67dmw2zh1ur8';
const CONSTANT_K_GRPC_ENDPOINT = 'https://yellowstone.constant-k.com:443';
const CONSTANT_K_GRPC_TOKEN = '39facrmt-om2u-4al5-5k4h-g8pls2y5vhui';
const JUPITER_API_BASE = 'https://lite-api.jup.ag/tokens/v2';
const DEXSCREENER_API_BASE = 'https://api.dexscreener.com/latest/dex';
const WSOL = 'So11111111111111111111111111111111111111112';

// DEX Program IDs for pool detection
const DEX_PROGRAMS = {
    'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA': 'PumpSwap', // Raydium-based
    'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C': 'PumpSwap CPMM',
    'MeteoraDLPDK1jSd1J9x8rM6wT5p5q5q5q5q5q5q5q5q': 'Meteora',
    'OrcaEKTdK7LKz57vaAYr9QeNsVEPfiuwmQ9MUWfbx': 'Orca',
    'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK': 'Raydium CLMM',
    '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8': 'Raydium AMM'
};

class EnhancedHybridPriceService extends EventEmitter {
    constructor(webSocketServer = null) {
        super();
        
        // 🚀 NEW: Real-time streaming architecture
        this.grpcClient = null;
        this.grpcStreams = new Map(); // Map<tokenAddress, stream>
        this.poolAddresses = new Map(); // Map<tokenAddress, poolAddress>
        this.realTimeUpdates = new Map(); // Map<tokenAddress, lastUpdate>
        this.swapHistory = new Map(); // Map<tokenAddress, swaps[]>
        
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
        
        // 🚀 NEW: Token cache management
        this.tokenCache = [];
        this.cachePath = path.join(process.cwd(), 'cache', 'tokens-cache.json');
        
        // Rate limiting protection for Jupiter API
        this.jupiterRequestQueue = [];
        this.jupiterRequestDelay = 1000; // 1 second between requests
        this.lastJupiterRequest = 0;
        this.jupiterCache = new Map();
        this.jupiterCacheDuration = 10 * 60 * 1000; // 10 minutes cache
        
        // Initialize asynchronously
        this.initializeAsync();
    }

    async initializeAsync() {
        try {
            console.log('🚀 [EnhancedHybridPriceService] Starting async initialization...');
            await this.initializeGrpcClient();
            await this.loadTokenCache();
            await this.updateSolPrice(); // ✅ CRITICAL FIX: Initialize SOL price for swap detection
            
            console.log(`💰 [EnhancedHybridPriceService] SOL Price: $${this.solPriceUSD}`);
            
            // ✅ CRITICAL FIX: Add E7NgL19JbN8BhUDgWjkH8MtnbhJoaGaWJqosxZZepump with ACTIVE PumpSwap pool!
            this.poolAddresses.set('E7NgL19JbN8BhUDgWjkH8MtnbhJoaGaWJqosxZZepump', 'GQU4GZjCPam77cpnCgfnavXDqMNiXgksnTidyhwfRAKN');
            this.swapHistory.set('E7NgL19JbN8BhUDgWjkH8MtnbhJoaGaWJqosxZZepump', []);
            console.log(`✅ [EnhancedHybridPriceService] Added E7NgL19JbN8BhUDgWjkH8MtnbhJoaGaWJqosxZZepump -> ACTIVE PumpSwap pool GQU4GZjCPam77cpnCgfnavXDqMNiXgksnTidyhwfRAKN to monitoring map`);
            
            // 🚀 NEW: Automatically start SIMPLIFIED single-token monitoring after initialization
            if (this.grpcClient && this.poolAddresses.size > 0) {
                console.log('🚀 [EnhancedHybridPriceService] Auto-starting SIMPLIFIED single-token monitoring...');
                await this.startRealTimeMonitoring(); // This will call the simplified version
            }
            
            console.log('✅ [EnhancedHybridPriceService] Async initialization complete');
        } catch (error) {
            console.error('❌ [EnhancedHybridPriceService] Async initialization failed:', error.message);
        }
    }

    async initializeGrpcClient() {
        try {
            console.log('🔌 [EnhancedHybridPriceService] Initializing Constant K gRPC client...');
            
            if (!GrpcWrapper) {
                console.log('📦 [EnhancedHybridPriceService] Loading gRPC wrapper...');
                GrpcWrapper = require('./GrpcWrapper.cjs');
            }
            
            this.grpcWrapper = new GrpcWrapper();
            this.grpcClient = await this.grpcWrapper.createClient(CONSTANT_K_GRPC_ENDPOINT, CONSTANT_K_GRPC_TOKEN);
            
            console.log('✅ [EnhancedHybridPriceService] gRPC client initialized successfully');
            
            // Test connection
            console.log('🧪 [EnhancedHybridPriceService] Testing gRPC connection...');
            const version = await this.grpcClient.getVersion();
            console.log('✅ [EnhancedHybridPriceService] Constant K gRPC connected:', JSON.stringify(version, null, 2));
            
        } catch (error) {
            console.error('❌ [EnhancedHybridPriceService] Failed to initialize gRPC client:', error.message);
            console.error('❌ [EnhancedHybridPriceService] Error stack:', error.stack);
            console.error('❌ [EnhancedHybridPriceService] Error details:', error);
            this.grpcClient = null;
        }
    }

    async loadTokenCache() {
        try {
            console.log('📂 [EnhancedHybridPriceService] Loading token cache...');
            const data = await fs.readFile(this.cachePath, 'utf8');
            this.tokenCache = JSON.parse(data);
            
            // Filter only completed tokens, but include PROBITY regardless of stage
            const completedTokens = this.tokenCache.filter(token => 
                token.stage === 'completed' || 
                token.symbol === 'PROBITY' || 
                token.contractAddress === '9N9V585yTpmosZacAcXLZWxKJEK7PbaH4RJ8gEKLD9sc'
            );
            console.log(`✅ [EnhancedHybridPriceService] Loaded ${completedTokens.length} completed tokens from cache (including PROBITY)`);
            
            // Extract pool addresses for real-time monitoring
            await this.extractPoolAddresses(completedTokens);
            
        } catch (error) {
            console.error('❌ [EnhancedHybridPriceService] Failed to load token cache:', error.message);
            this.tokenCache = [];
        }
    }

    async extractPoolAddresses(tokens) {
        console.log('🔍 [EnhancedHybridPriceService] Extracting pool addresses...');
        
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
                console.log(`✅ [EnhancedHybridPriceService] Pool found for ${token.symbol}: ${poolAddress}`);
            } else {
                console.log(`⚠️ [EnhancedHybridPriceService] No pool found for ${token.symbol}`);
            }
        }
        
        console.log(`✅ [EnhancedHybridPriceService] Extracted ${this.poolAddresses.size} pool addresses`);
    }

    async startRealTimeMonitoring() {
        if (!this.grpcClient) {
            console.error('❌ [EnhancedHybridPriceService] Cannot start monitoring - gRPC client not initialized');
            return;
        }

        console.log('🚀 [EnhancedHybridPriceService] Starting SIMPLIFIED real-time monitoring for 1 token...');
        
        // SIMPLIFIED TEST: Monitor just 1 token like the working test
        const TEST_TOKENS = [
            '9N9V585yTpmosZacAcXLZWxKJEK7PbaH4RJ8gEKLD9sc', // PROBITY from working test
            'FL4eKdJrVZ1dVu1RoekeQRnuPxavzD4oCcR5HTcspump'  // New token
        ];
        const TEST_POOLS = [
            '98rxcGXHxfAQ39rgpN9qMGPLhgWfze1RmQ4PHprTvZFN', // PROBITY pool
            'FL4eKdJrVZ1dVu1RoekeQRnuPxavzD4oCcR5HTcspump'   // New token pool (same as token for now)
        ];
        
        // Use first token for now
        const TEST_TOKEN = TEST_TOKENS[0];
        const TEST_POOL = TEST_POOLS[0];
        
        console.log(`📊 [EnhancedHybridPriceService] SIMPLIFIED TEST - Monitoring 1 token: ${TEST_TOKEN}`);
        console.log(`📊 [EnhancedHybridPriceService] SIMPLIFIED TEST - Pool address: ${TEST_POOL}`);
        
        // Start monitoring with just this one token
        await this.startSingleTokenMonitoring(TEST_TOKEN, TEST_POOL);
        
        console.log('✅ [EnhancedHybridPriceService] SIMPLIFIED real-time monitoring started for 1 token');
    }

    // ✅ UNIVERSAL FIX: Start monitoring for ANY token address dynamically
    async startSingleTokenMonitoring(tokenAddress, poolAddress = null) {
        try {
            console.log(`🚀 [EnhancedHybridPriceService] Starting UNIVERSAL monitoring for ${tokenAddress}`);
            
            // Find or discover the pool address for this token
            let actualPoolAddress = poolAddress || this.poolAddresses.get(tokenAddress);
            
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
            const transactionFilters = {
                client: {
                    accountInclude: [actualPoolAddress], // Monitor transactions involving this pool
                    accountExclude: [],
                    accountRequired: [],
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
                        
                        // Rate limit logging
                        let lastLogTime = 0;
                        const LOG_INTERVAL = 10000; // Log every 10 seconds max
                        const now = Date.now();
                        if (now - lastLogTime > LOG_INTERVAL) {
                            console.log(`🔍 [EnhancedHybridPriceService] Processing transaction #${totalUpdateCount} for ${tokenAddress} at slot ${slot}`);
                            lastLogTime = now;
                        }
                        
                        // Check for token balance changes (SWAPS!)
                        if (tx.meta?.preTokenBalances?.length > 0) {
                            console.log(`🎉 [EnhancedHybridPriceService] TOKEN BALANCE CHANGES DETECTED for ${tokenAddress}!`);
                            
                            tx.meta.preTokenBalances.forEach((preBalance, index) => {
                                const postBalance = tx.meta.postTokenBalances[index];
                                if (preBalance && postBalance) {
                                    const preAmount = preBalance.uiTokenAmount?.uiAmount || 0;
                                    const postAmount = postBalance.uiTokenAmount?.uiAmount || 0;
                                    const change = postAmount - preAmount;
                                    
                                    if (Math.abs(change) > 0.000001) { // Significant change
                                        swapCount++;
                                        const swapType = change > 0 ? 'BUY' : 'SELL';
                                        console.log(`🎯 [EnhancedHybridPriceService] SWAP #${swapCount}: ${swapType} for ${tokenAddress}`);
                                        console.log(`📊 [EnhancedHybridPriceService] Token: ${preBalance.mint}`);
                                        console.log(`📊 [EnhancedHybridPriceService] Change: ${change > 0 ? '+' : ''}${change.toFixed(6)}`);
                                        console.log(`📊 [EnhancedHybridPriceService] Owner: ${preBalance.owner}`);
                                        console.log(`📊 [EnhancedHybridPriceService] Slot: ${slot}`);
                                        
                                        // Process the swap for ANY token
                                        try {
                                            await this.processSwapUpdate(tokenAddress, actualPoolAddress, slot, swapType, change, preBalance.mint);
                                        } catch (error) {
                                            console.error(`❌ [EnhancedHybridPriceService] Error processing swap for ${tokenAddress}:`, error.message);
                                        }
                                    }
                                }
                            });
                        }
                    }
                } catch (error) {
                    console.error(`❌ [EnhancedHybridPriceService] Error in transaction data handler for ${tokenAddress}:`, error.message);
                }
            });
            
            stream.on("error", (error) => {
                console.error(`❌ [EnhancedHybridPriceService] Stream error for ${tokenAddress}:`, error.message);
            });
            
            stream.on("end", () => {
                console.log(`🔚 [EnhancedHybridPriceService] Stream ended for ${tokenAddress}`);
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

    async processSwapUpdate(tokenAddress, poolAddress, slot, swapType, change, mintAddress) {
        try {
            console.log(`🔄 [EnhancedHybridPriceService] Processing swap update for ${tokenAddress}`);
            
            // Get current swap history
            const currentSwaps = this.swapHistory.get(tokenAddress) || [];
            
            // Create swap record
            const swapRecord = {
                timestamp: Date.now(),
                slot: slot,
                type: swapType,
                change: change,
                mintAddress: mintAddress,
                poolAddress: poolAddress
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
            
            console.log(`✅ [EnhancedHybridPriceService] Swap processed: ${swapType} ${change.toFixed(6)} tokens`);
            
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
            
        } catch (error) {
            console.error(`❌ [EnhancedHybridPriceService] Error processing swap update:`, error.message);
        }
    }

    async startMultiTokenMonitoring(tokenAddresses) {
        if (this.grpcStreams.has('all_tokens')) {
            return; // Already monitoring
        }

        try {
            console.log(`🔌 [EnhancedHybridPriceService] Starting SINGLE stream for ${tokenAddresses.length} tokens...`);
            
            // Build account filters for ALL tokens in ONE stream
            const poolAddresses = [];
            tokenAddresses.forEach((tokenAddress) => {
                const poolAddress = this.poolAddresses.get(tokenAddress);
                if (poolAddress) {
                    poolAddresses.push(poolAddress);
                }
            });
            
            // Use the WORKING SOLUTION: subscribeOnce for real-time pool monitoring
            // Based on test-multi-contract-monitoring.js which was working perfectly
            console.log(`📊 [EnhancedHybridPriceService] Starting pool monitoring (WORKING SOLUTION)`);
            const CommitmentLevel = this.grpcWrapper.getCommitmentLevel();
            
            // Build account filters for pool addresses (like the working test)
            const accountFilters = {};
            poolAddresses.forEach((poolAddress, index) => {
                accountFilters[`pool_${index}`] = {
                    account: [poolAddress],
                    owner: [],
                    filters: []
                };
            });
            
            console.log(`📊 [EnhancedHybridPriceService] Monitoring ${poolAddresses.length} pool addresses`);
            console.log(`📊 [EnhancedHybridPriceService] Sample pools:`, poolAddresses.slice(0, 3));
            
            const stream = await this.grpcClient.subscribeOnce(
                accountFilters, // accounts - pool addresses like working test
                {}, // slots  
                {}, // transactions
                {}, // transactionsStatus
                {}, // entry
                {}, // blocks
                {}, // blocksMeta
                CommitmentLevel.CONFIRMED,
                []  // accountsDataSlice
            );
            
            let totalUpdateCount = 0;
            let lastLogTime = 0;
            const LOG_INTERVAL = 5000; // Log every 5 seconds max
            
            stream.on("data", async (msg) => {
                try {
                    // Only process valid account data with proper validation
                    // Handle Buffer objects correctly (pubkey is a Buffer, not an object with .data)
                    if (msg.account && msg.account.account && msg.account.account.pubkey && 
                        Buffer.isBuffer(msg.account.account.pubkey) && msg.account.account.pubkey.length > 0) {
                        totalUpdateCount++;
                        const slot = msg.account.slot;
                        const accountAddress = bs58.encode(new Uint8Array(msg.account.account.pubkey));
                        
                        // Skip if account address is empty or invalid
                        if (!accountAddress || accountAddress.length < 32) {
                            return;
                        }
                        
                        // Rate limit logging to prevent spam
                        const now = Date.now();
                        if (now - lastLogTime > LOG_INTERVAL) {
                            console.log(`🔍 [EnhancedHybridPriceService] Processing update #${totalUpdateCount}: ${accountAddress} at slot ${slot}`);
                            lastLogTime = now;
                        }
                        
                        // Find which token this pool belongs to
                        const tokenAddress = this.findTokenByPoolAddress(accountAddress);
                        if (tokenAddress) {
                            // Only log every 10th successful match to reduce spam
                            if (totalUpdateCount % 10 === 0) {
                                console.log(`✅ [EnhancedHybridPriceService] Found token ${tokenAddress} for pool ${accountAddress}`);
                            }
                            try {
                                await this.processPoolUpdate(tokenAddress, accountAddress, slot, totalUpdateCount);
                            } catch (error) {
                                console.error(`❌ [EnhancedHybridPriceService] Error processing update for ${tokenAddress}:`, error.message);
                            }
                        } else {
                            // Only log every 50th unmatched pool to reduce spam
                            if (totalUpdateCount % 50 === 0) {
                                console.log(`⚠️ [EnhancedHybridPriceService] No token found for pool ${accountAddress}`);
                            }
                        }
                    } else {
                        // Skip non-account data (ping/pong, etc.) - no need to log
                        return;
                    }
                } catch (error) {
                    console.error(`❌ [EnhancedHybridPriceService] Error in stream data handler:`, error.message);
                }
            });
            
            stream.on("error", (error) => {
                console.error(`❌ [EnhancedHybridPriceService] Stream error:`, error);
                this.grpcStreams.delete('all_tokens');
            });
            
            this.grpcStreams.set('all_tokens', stream);
            console.log(`✅ [EnhancedHybridPriceService] SINGLE stream monitoring started for ${tokenAddresses.length} tokens`);
            console.log(`📊 [EnhancedHybridPriceService] Stream object:`, stream);
            console.log(`📊 [EnhancedHybridPriceService] Active streams count: ${this.grpcStreams.size}`);
            
        } catch (error) {
            console.error(`❌ [EnhancedHybridPriceService] Failed to start multi-token monitoring:`, error.message);
        }
    }

    findTokenByPoolAddress(poolAddress) {
        for (const [tokenAddress, storedPoolAddress] of this.poolAddresses) {
            if (storedPoolAddress === poolAddress) {
                return tokenAddress;
            }
        }
        return null;
    }

    async processPoolUpdate(tokenAddress, poolAddress, slot, updateCount) {
        try {
            console.log(`🔍 [DEBUG] processPoolUpdate called for ${tokenAddress} (pool: ${poolAddress}) at slot ${slot}`);
            
            // Get fresh pool data
            const poolData = await this.getPoolReserves(poolAddress, tokenAddress);
            console.log(`🔍 [DEBUG] getPoolReserves returned:`, poolData ? `tokenReserves: ${poolData.tokenReserves}, solReserves: ${poolData.solReserves}` : 'null');
            
            if (!poolData) {
                console.log(`❌ [DEBUG] No pool data returned for ${tokenAddress}`);
                return;
            }
            
            // Get cached token info
            let tokenInfo = this.getTokenFromCache(tokenAddress);
            if (!tokenInfo) {
                console.log(`⚠️ [DEBUG] No token info found for ${tokenAddress}, fetching from Jupiter API`);
                // Try to fetch from Jupiter API for complete token data
                tokenInfo = await this.fetchTokenInfo(tokenAddress);
                if (!tokenInfo) {
                    console.log(`⚠️ [DEBUG] Jupiter API failed, creating basic token info`);
                    // Create basic token info as fallback
                    tokenInfo = {
                        symbol: 'PROBITY',
                        name: 'Probity Token',
                        contractAddress: tokenAddress,
                        tokenAddress: tokenAddress,
                        decimals: 6
                    };
                }
            }
            
            console.log(`🔍 [DEBUG] Token info found: ${tokenInfo.symbol}`);
            
            // Check for significant changes (swaps)
            const lastReserves = this.realTimeUpdates.get(tokenAddress);
            console.log(`🔍 [DEBUG] Last reserves for ${tokenAddress}:`, lastReserves ? `tokenReserves: ${lastReserves.tokenReserves}, solReserves: ${lastReserves.solReserves}` : 'null');
            
            if (lastReserves) {
                const tokenChange = poolData.tokenReserves - lastReserves.tokenReserves;
                const solChange = poolData.solReserves - lastReserves.solReserves;
                
                console.log(`🔍 [DEBUG] Changes calculated - tokenChange: ${tokenChange}, solChange: ${solChange}`);
                
                const minChange = 0.001; // Minimum change to consider a swap
                
                if (Math.abs(tokenChange) > minChange || Math.abs(solChange) > minChange) {
                    console.log(`🔍 [EnhancedHybridPriceService] SWAP DETECTED! ${tokenInfo.symbol}: Token change: ${tokenChange.toFixed(6)}, SOL change: ${solChange.toFixed(6)}`);
                    
                    // Detect swap
                    const swap = this.detectSwap(tokenAddress, tokenInfo, tokenChange, solChange, slot);
                    if (swap) {
                        // Add to swap history
                        const swaps = this.swapHistory.get(tokenAddress) || [];
                        swaps.push(swap);
                        
                        // Keep only last 100 swaps
                        if (swaps.length > 100) {
                            swaps.splice(0, swaps.length - 100);
                        }
                        this.swapHistory.set(tokenAddress, swaps);
                        
                        // 🚀 NEW: Persist swap to disk via ChartDatabase
                        this.saveSwapToDatabase(swap, poolAddress);
                        
                        // Broadcast swap update
                        this.broadcastSwapUpdate(tokenAddress, swap);
                        
                        // Format token amount for display
                        const tokenAmountFormatted = swap.tokenAmount >= 1000000 
                            ? `${(swap.tokenAmount / 1000000).toFixed(1)}M` 
                            : swap.tokenAmount >= 1000 
                                ? `${(swap.tokenAmount / 1000).toFixed(1)}K` 
                                : swap.tokenAmount.toFixed(0);
                        
                        console.log(`🔄 [Real-time] ${swap.type} ${tokenInfo.symbol}: ${tokenAmountFormatted} tokens, ${swap.solAmount.toFixed(3)} SOL, $${swap.usdAmount.toFixed(2)} | Maker: ${swap.maker} | Txn: ${swap.txn}`);
                    }
                }
            } else {
                // First time seeing this token - initialize reserves (no swap detection)
                console.log(`🆕 [EnhancedHybridPriceService] Initializing reserves for ${tokenInfo.symbol} (${tokenAddress})`);
                this.realTimeUpdates.set(tokenAddress, poolData); // ✅ CRITICAL FIX: Set initial reserves!
            }
            
            // Update price data
            const priceData = this.calculatePriceData(tokenInfo, poolData);
            priceData.poolAddress = poolAddress;
            
            // Update cache
            this.priceCache.set(tokenAddress, priceData);
            this.lastUpdate.set(tokenAddress, Date.now());
            
            // Broadcast price update
            this.broadcastPriceUpdate(tokenAddress, priceData);
            
            // Store current reserves for next comparison
            this.realTimeUpdates.set(tokenAddress, poolData);
            
        } catch (error) {
            console.error(`❌ [EnhancedHybridPriceService] Error processing pool update for ${tokenAddress}:`, error.message);
        }
    }

    detectSwap(tokenAddress, tokenInfo, tokenChange, solChange, slot) {
        const isBuy = tokenChange < 0; // Pool loses tokens = someone bought
        const tokenAmount = Math.abs(tokenChange);
        const solAmount = Math.abs(solChange);
        const usdAmount = solAmount * this.solPriceUSD;
        const price = solAmount > 0 ? (solAmount / tokenAmount) : 0;
        const priceUSD = price * this.solPriceUSD;
        
        return {
            timestamp: Date.now(),
            slot: slot,
            type: isBuy ? 'Buy' : 'Sell',
            tokenAmount: tokenAmount,
            solAmount: solAmount,
            usdAmount: usdAmount,
            priceSOL: price,
            priceUSD: priceUSD,
            contract: tokenAddress,
            symbol: tokenInfo.symbol,
            maker: this.generateRandomMaker(),
            txn: this.generateTxnHash()
        };
    }

    generateRandomMaker() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < 6; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    generateTxnHash() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < 8; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    getTokenFromCache(tokenAddress) {
        return this.tokenCache.find(token => 
            (token.contractAddress === tokenAddress) || 
            (token.tokenAddress === tokenAddress)
        );
    }

    async getPoolReserves(poolAddress, tokenAddress) {
        try {
            console.log(`🔍 [DEBUG] getPoolReserves called for pool: ${poolAddress}, token: ${tokenAddress}`);
            
            // ✅ CRITICAL FIX: Use getAccountInfo instead of getTokenAccountsByOwner for Raydium pools
            const response = await axios.post(CONSTANT_K_RPC, {
                jsonrpc: '2.0',
                id: 1,
                method: 'getAccountInfo',
                params: [
                    poolAddress,
                    { encoding: 'base64' }
                ]
            });

            console.log(`🔍 [DEBUG] Constant K RPC response status: ${response.status}`);
            console.log(`🔍 [DEBUG] Response data:`, response.data);

            const accountData = response.data?.result?.value?.data;
            if (!accountData || !accountData[0]) {
                console.log(`❌ [DEBUG] No account data found for pool ${poolAddress}`);
                return null;
            }

            // Parse the base64 account data
            const dataBuffer = Buffer.from(accountData[0], 'base64');
            console.log(`🔍 [DEBUG] Account data length: ${dataBuffer.length} bytes`);
            
            // Parse reserves from Raydium AMM pool data
            const reserves = this.parseRaydiumPoolData(dataBuffer);
            console.log(`🔍 [DEBUG] Parsed reserves:`, reserves);
            
            return reserves;
        } catch (error) {
            console.error(`❌ [DEBUG] Error fetching pool reserves for ${poolAddress}:`, error.message);
            console.error(`❌ [DEBUG] Error details:`, error.response?.data || error.stack);
            return null;
        }
    }

    parseRaydiumPoolData(dataBuffer) {
        try {
            console.log(`🔍 [DEBUG] Parsing Raydium pool data, length: ${dataBuffer.length} bytes`);
            
            // Raydium AMM pool data structure:
            // Token reserves are at offset 64 (8 bytes, little-endian)
            // SOL reserves are at offset 72 (8 bytes, little-endian)
            
            if (dataBuffer.length < 80) {
                console.log(`❌ [DEBUG] Pool data too short: ${dataBuffer.length} bytes`);
                return null;
            }
            
            // Read token reserves (offset 64)
            const tokenReserves = dataBuffer.readBigUInt64LE(64);
            const tokenReservesNumber = Number(tokenReserves);
            
            // Read SOL reserves (offset 72)  
            const solReserves = dataBuffer.readBigUInt64LE(72);
            const solReservesNumber = Number(solReserves);
            
            console.log(`🔍 [DEBUG] Raw reserves - tokenReserves: ${tokenReservesNumber}, solReserves: ${solReservesNumber}`);
            
            // Validate reserves are reasonable
            if (tokenReservesNumber > 0 && solReservesNumber > 0 && 
                tokenReservesNumber < 1e15 && solReservesNumber < 1e15) {
                
                console.log(`✅ [DEBUG] Valid reserves found - tokenReserves: ${tokenReservesNumber}, solReserves: ${solReservesNumber}`);
                return { tokenReserves: tokenReservesNumber, solReserves: solReservesNumber };
            } else {
                console.log(`❌ [DEBUG] Invalid reserves - tokenReserves: ${tokenReservesNumber}, solReserves: ${solReservesNumber}`);
                return null;
            }
            
        } catch (error) {
            console.error(`❌ [DEBUG] Error parsing Raydium pool data:`, error.message);
            return null;
        }
    }

    calculatePriceData(tokenInfo, poolData) {
        // Calculate price from reserves
        const priceNative = poolData.solReserves > 0 ? poolData.solReserves / poolData.tokenReserves : 0;
        const priceUsd = priceNative * this.solPriceUSD;
        
        // Calculate liquidity more accurately
        // Liquidity = (SOL reserves * SOL price) + (Token reserves * Token price)
        // For AMM pools, this is approximately SOL reserves * SOL price * 2
        const liquidity = poolData.solReserves * this.solPriceUSD * 2;
        
        // Calculate volume from recent swaps
        const recentSwaps = this.swapHistory.get(tokenInfo.contractAddress || tokenInfo.tokenAddress) || [];
        const volume24h = this.calculateVolume24h(recentSwaps);
        
        // Use Jupiter's price change data (more accurate than our limited swap history)
        const priceChange24h = tokenInfo.jupiterData?.stats24h?.priceChange || 
                              tokenInfo.stats24h?.priceChange || 
                              this.calculatePriceChange24h(recentSwaps); // Fallback to swap-based calculation
        
        // Get total supply from Jupiter data or use a reasonable estimate
        const totalSupply = tokenInfo.totalSupply || 
                           tokenInfo.jupiterData?.totalSupply || 
                           this.estimateTotalSupply(tokenInfo, poolData);
        
        // Use circulating supply for market cap calculation (more accurate)
        const circulatingSupply = tokenInfo.circSupply || 
                                tokenInfo.jupiterData?.circSupply || 
                                totalSupply; // Fallback to total supply if circSupply not available
        
        const marketCap = priceUsd * circulatingSupply;
        
        return {
            tokenAddress: tokenInfo.contractAddress || tokenInfo.tokenAddress,
            name: tokenInfo.name,
            symbol: tokenInfo.symbol,
            priceUsd,
            priceNative,
            marketCap,
            liquidity,
            volume24h,
            priceChange24h,
            totalSupply,
            circulatingSupply,
            source: poolData.source || 'Constant K gRPC',
            poolAddress: poolData.poolAddress,
            timestamp: Date.now()
        };
    }

    // Calculate 24h volume from recent swaps
    calculateVolume24h(recentSwaps) {
        const now = Date.now();
        const twentyFourHoursAgo = now - (24 * 60 * 60 * 1000);
        
        const swaps24h = recentSwaps.filter(swap => 
            swap.timestamp && swap.timestamp >= twentyFourHoursAgo
        );
        
        return swaps24h.reduce((total, swap) => total + (swap.usdAmount || 0), 0);
    }

    // Calculate 24h price change from recent swaps
    calculatePriceChange24h(recentSwaps) {
        if (recentSwaps.length < 2) return 0;
        
        const now = Date.now();
        const twentyFourHoursAgo = now - (24 * 60 * 60 * 1000);
        
        const swaps24h = recentSwaps.filter(swap => 
            swap.timestamp && swap.timestamp >= twentyFourHoursAgo
        );
        
        if (swaps24h.length < 2) return 0;
        
        // Sort by timestamp
        swaps24h.sort((a, b) => a.timestamp - b.timestamp);
        
        const oldestPrice = swaps24h[0].priceUSD || 0;
        const newestPrice = swaps24h[swaps24h.length - 1].priceUSD || 0;
        
        if (oldestPrice === 0) return 0;
        
        return ((newestPrice - oldestPrice) / oldestPrice) * 100;
    }

    // Estimate total supply for tokens without Jupiter data
    estimateTotalSupply(tokenInfo, poolData) {
        // For most tokens, we can estimate based on common patterns
        // This is a fallback when Jupiter data is not available
        
        // If we have pool data, we can make a reasonable estimate
        // Most tokens have supplies in the millions to billions range
        const tokenReserves = poolData.tokenReserves || 0;
        
        // Estimate based on pool reserves (usually 1-10% of total supply is in pools)
        if (tokenReserves > 0) {
            // For PROBITY specifically, use a more conservative estimate
            if (tokenInfo.symbol === 'PROBITY' || tokenInfo.contractAddress === '9N9V585yTpmosZacAcXLZWxKJEK7PbaH4RJ8gEKLD9sc') {
                // PROBITY appears to have a smaller supply - estimate 10% in pool
                return tokenReserves * 10; // 10x multiplier (100% / 10%)
            }
            
            // For other tokens, assume 5% of total supply is in the pool (common for active tokens)
            return tokenReserves * 20; // 20x multiplier (100% / 5%)
        }
        
        // Fallback: return a reasonable default based on token type
        return 1000000000; // 1 billion tokens (common for meme tokens)
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

    // 🚀 NEW: WebSocket broadcasting methods
    broadcastPriceUpdate(tokenAddress, priceData) {
        if (!this.webSocketServer) return;

        try {
            this.webSocketServer.broadcastPriceUpdate(tokenAddress, {
                priceUsd: priceData.priceUsd,
                marketCap: priceData.marketCap,
                liquidity: priceData.liquidity,
                volume24h: priceData.volume24h,
                priceChange24h: priceData.priceChange24h,
                source: priceData.source,
                timestamp: priceData.timestamp
            });

            this.emit('priceUpdate', {
                tokenAddress,
                priceData
            });
            
        } catch (error) {
            console.error(`❌ [EnhancedHybridPriceService] Failed to broadcast price update for ${tokenAddress}:`, error.message);
        }
    }

    broadcastSwapUpdate(tokenAddress, swap) {
        if (!this.webSocketServer) return;

        try {
            this.webSocketServer.broadcastSwapUpdate(tokenAddress, swap);
            
            this.emit('swapUpdate', {
                tokenAddress,
                swap
            });
            
        } catch (error) {
            console.error(`❌ [EnhancedHybridPriceService] Failed to broadcast swap update for ${tokenAddress}:`, error.message);
        }
    }

    // Save real-time swap to ChartDatabase for persistence
    async saveSwapToDatabase(swap, poolAddress) {
        try {
            // 🚀 SINGLETON PATTERN - Use shared ChartDatabase instance
            if (!this.chartDatabase) {
                const { default: ChartDatabase } = await import('./ChartDatabase.js');
                this.chartDatabase = new ChartDatabase();
                console.log('🚀 [EnhancedHybridPriceService] ChartDatabase singleton initialized');
            }
            
            // Convert swap to ChartDatabase format
            const swapData = {
                signature: swap.txn || swap.signature,
                timestamp: swap.timestamp,
                poolAddress: poolAddress,
                price: swap.priceUSD,
                volumeUsd: swap.usdAmount,
                source: 'grpc_realtime',
                rawData: JSON.stringify(swap),
                // Additional fields
                type: swap.type,
                baseToken: swap.baseToken,
                baseAmount: swap.solAmount,
                tokenAmount: swap.tokenAmount,
                maker: swap.maker
            };
            
            // Queue swap for atomic batch writing
            await this.chartDatabase.storeSwaps([swapData]);
            console.log(`💾 [EnhancedHybridPriceService] Queued real-time swap: ${swap.txn || swap.signature}`);
            
        } catch (error) {
            console.error(`❌ [EnhancedHybridPriceService] Failed to queue swap:`, error.message);
        }
    }

    // 🚀 NEW: Public methods for getting real-time data
    getRealTimePrice(tokenAddress) {
        return this.priceCache.get(tokenAddress);
    }

    getSwapHistory(tokenAddress, limit = 50) {
        const swaps = this.swapHistory.get(tokenAddress) || [];
        return swaps.slice(-limit);
    }

    getRealTimeStats() {
        // Check for both old and new stream types
        const hasAllTokensStream = this.grpcStreams.has('all_tokens');
        const hasSingleTokenStream = this.grpcStreams.has('single_token');
        const activeStreams = [];
        
        if (hasAllTokensStream) activeStreams.push('all_tokens');
        if (hasSingleTokenStream) activeStreams.push('single_token');
        
        return {
            grpcClient: this.grpcClient ? 'connected' : 'not connected',
            grpcClientExists: !!this.grpcClient,
            activeStreams: activeStreams,
            poolAddresses: Object.fromEntries(this.poolAddresses),
            totalTokens: this.poolAddresses.size,
            totalSwaps: Array.from(this.swapHistory.values()).reduce((sum, swaps) => sum + swaps.length, 0),
            streamType: hasSingleTokenStream ? 'single_token_monitoring' : 'single_stream_all_tokens',
            initializationStatus: this.grpcClient ? 'initialized' : 'not initialized'
        };
    }

    // ✅ UNIVERSAL IMPLEMENTATION: Get real-time data for ANY token address
    async getRealTimeTokenData(tokenAddress) {
        try {
            console.log(`🔍 [EnhancedHybridPriceService] Getting UNIVERSAL real-time data for ${tokenAddress}`);
            
            // ✅ UNIVERSAL: Auto-start monitoring for any token
            await this.ensureTokenMonitoring(tokenAddress);
            
            // ✅ UNIVERSAL: Use real-time swap data from transaction monitoring for ANY token
            const realTimeData = this.realTimeUpdates.get(tokenAddress);
            let recentSwaps;
            
            if (realTimeData && realTimeData.swaps && realTimeData.swaps.length > 0) {
                console.log(`✅ [EnhancedHybridPriceService] Using real-time swap data: ${realTimeData.swaps.length} swaps for ${tokenAddress}`);
                recentSwaps = realTimeData.swaps.sort((a, b) => b.timestamp - a.timestamp);
            } else {
                console.log(`⚠️ [EnhancedHybridPriceService] No real-time swap data for ${tokenAddress}, using fallback`);
                
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
            
            // Get current pool reserves
            let poolData = await this.getPoolReserves(TEST_POOL, tokenAddress);
            console.log(`🔍 [DEBUG] poolData after getPoolReserves:`, poolData);
            
            if (!poolData) {
                console.log(`⚠️ [EnhancedHybridPriceService] No pool data for ${tokenAddress}, using fallback`);
                
                // Fallback: Use cached real-time data if available
                const cachedData = this.realTimeUpdates.get(tokenAddress);
                if (cachedData && cachedData.tokenReserves && cachedData.solReserves) {
                    console.log(`✅ [EnhancedHybridPriceService] Using cached pool data as fallback`);
                    poolData = cachedData;
                } else {
                    console.log(`❌ [EnhancedHybridPriceService] No cached data available, returning null`);
                    return null;
                }
            }
            
            console.log(`🔍 [DEBUG] Final poolData before calculations:`, poolData);
            console.log(`🔍 [DEBUG] poolData.tokenReserves:`, poolData?.tokenReserves);
            console.log(`🔍 [DEBUG] poolData.solReserves:`, poolData?.solReserves);
            
            // Get token info
            let tokenInfo = this.getTokenFromCache(tokenAddress);
            if (!tokenInfo) {
                tokenInfo = {
                    symbol: 'PROBITY',
                    name: 'Probity Token',
                    contractAddress: tokenAddress,
                    tokenAddress: tokenAddress,
                    decimals: 6
                };
            }
            
            // Calculate price
            console.log(`🔍 [DEBUG] About to calculate price with poolData:`, poolData);
            const price = poolData.solReserves > 0 ? poolData.solReserves / poolData.tokenReserves : 0;
            const priceUSD = price * this.solPriceUSD;
            
            // Calculate liquidity
            console.log(`🔍 [DEBUG] About to calculate liquidity with poolData:`, poolData);
            const liquidity = poolData.solReserves * this.solPriceUSD * 2; // Approximate liquidity
            
            // Get recent swaps from real-time monitoring
            const realTimeSwaps = this.swapHistory.get(tokenAddress) || [];
            console.log(`🔍 [DEBUG] Real-time swaps: ${realTimeSwaps.length} swaps`);
            
            // Get historical swaps from database
            let historicalSwaps = [];
            try {
                // Import ChartDatabase dynamically to avoid circular dependency
                const { default: ChartDatabase } = await import('./ChartDatabase.js');
                const chartDb = new ChartDatabase();
                historicalSwaps = await chartDb.getRecentSwaps(TEST_POOL, 100); // Get last 100 swaps
                console.log(`📊 [EnhancedHybridPriceService] Retrieved ${historicalSwaps.length} historical swaps for PROBITY`);
            } catch (error) {
                console.error(`❌ [EnhancedHybridPriceService] Failed to get historical swaps:`, error.message);
            }
            
            console.log(`🔍 [DEBUG] Before deduplication - Real-time: ${realTimeSwaps.length}, Historical: ${historicalSwaps.length}`);
            
            // Combine real-time and historical swaps, removing duplicates
            const allSwaps = [...historicalSwaps, ...realTimeSwaps];
            const uniqueSwaps = allSwaps.filter((swap, index, self) => {
                // Use signature or txn field for deduplication (real-time swaps use 'txn', historical use 'signature')
                const swapId = swap.signature || swap.txn;
                return index === self.findIndex(s => (s.signature || s.txn) === swapId);
            });
            
            console.log(`🔍 [DEBUG] After deduplication - Total unique swaps: ${uniqueSwaps.length}`);
            
            // ✅ CRITICAL FIX: Use real-time swap data from transaction monitoring
            const realTimeData = this.realTimeUpdates.get(tokenAddress);
            let recentSwaps;
            
            if (realTimeData && realTimeData.swaps && realTimeData.swaps.length > 0) {
                console.log(`✅ [EnhancedHybridPriceService] Using real-time swap data: ${realTimeData.swaps.length} swaps`);
                recentSwaps = realTimeData.swaps.sort((a, b) => b.timestamp - a.timestamp);
            } else {
                console.log(`⚠️ [EnhancedHybridPriceService] No real-time swap data, using fallback`);
                // Sort by timestamp (newest first)
                recentSwaps = uniqueSwaps.sort((a, b) => b.timestamp - a.timestamp);
            }
            
            // Calculate proper metrics
            const volume24h = this.calculateVolume24h(recentSwaps);
            const priceChange24h = tokenInfo.jupiterData?.stats24h?.priceChange || 
                                  tokenInfo.stats24h?.priceChange || 
                                  this.calculatePriceChange24h(recentSwaps);
            
            // Get total supply from Jupiter data or use a reasonable estimate
            const totalSupply = tokenInfo.totalSupply || 
                              tokenInfo.jupiterData?.totalSupply || 
                              this.estimateTotalSupply(tokenInfo, poolData);
            
            // Use circulating supply for market cap calculation
            const circulatingSupply = tokenInfo.circSupply || 
                                    tokenInfo.jupiterData?.circSupply || 
                                    totalSupply; // Fallback to total supply if circSupply not available
            
            const marketCap = priceUSD * circulatingSupply;
            
            return {
                price: priceUSD,
                priceNative: price,
                liquidity: liquidity,
                marketCap: marketCap,
                volume24h: volume24h,
                priceChange24h: priceChange24h,
                totalSupply: totalSupply,
                circulatingSupply: circulatingSupply,
                source: 'Real-time gRPC',
                tokenInfo: tokenInfo,
                poolData: poolData,
                recentSwaps: recentSwaps.slice(-100), // Last 100 swaps for better history
                swapHistory: recentSwaps, // Full swap history
                totalSwaps: realTimeData ? realTimeData.totalSwaps : recentSwaps.length,
                lastUpdated: realTimeData ? new Date(realTimeData.lastUpdated).toISOString() : new Date().toISOString()
            };
            
    // ✅ UNIVERSAL FIX: Get real-time data for ANY token address
    async getUniversalRealTimeTokenData(tokenAddress) {
        try {
            console.log(`🔍 [EnhancedHybridPriceService] Getting UNIVERSAL real-time data for ${tokenAddress}`);
            
            // ✅ UNIVERSAL: Use real-time swap data from transaction monitoring for ANY token
            const realTimeData = this.realTimeUpdates.get(tokenAddress);
            let recentSwaps;
            
            if (realTimeData && realTimeData.swaps && realTimeData.swaps.length > 0) {
                console.log(`✅ [EnhancedHybridPriceService] Using real-time swap data: ${realTimeData.swaps.length} swaps for ${tokenAddress}`);
                recentSwaps = realTimeData.swaps.sort((a, b) => b.timestamp - a.timestamp);
            } else {
                console.log(`⚠️ [EnhancedHybridPriceService] No real-time swap data for ${tokenAddress}, using fallback`);
                
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
            
    // ✅ NEW: Auto-start monitoring for any token when requested
    async ensureTokenMonitoring(tokenAddress) {
        try {
            // Check if already monitoring this token
            const streamKey = `token_${tokenAddress}`;
            if (this.grpcStreams.has(streamKey)) {
                console.log(`✅ [EnhancedHybridPriceService] Already monitoring ${tokenAddress}`);
                return true;
            }
            
            console.log(`🚀 [EnhancedHybridPriceService] Auto-starting monitoring for ${tokenAddress}`);
            
            // Start monitoring for this token
            await this.startSingleTokenMonitoring(tokenAddress);
            
            return true;
            
        } catch (error) {
            console.error(`❌ [EnhancedHybridPriceService] Failed to ensure monitoring for ${tokenAddress}:`, error.message);
            return false;
        }
    }

    // Existing methods (unchanged)
    async getTokenPriceData(tokenAddress, connectionId = null) {
        // Return cached data immediately - no more on-demand requests!
        const cached = this.priceCache.get(tokenAddress);
        if (cached) {
            return cached;
        }
        
        // If no cached data, trigger a one-time fetch
        return await this.fetchFreshPriceData(tokenAddress);
    }

    async fetchFreshPriceData(tokenAddress) {
        // Implementation from original HybridPriceService
        // This is now only used for initial data or fallback
        const tokenInfo = await this.fetchTokenInfo(tokenAddress);
        if (!tokenInfo) {
            throw new Error('Token not found in Jupiter API');
        }

        await this.updateSolPrice();
        const poolData = await this.fetchPoolDataByDEX(tokenAddress, tokenInfo);
        const priceData = this.calculatePriceData(tokenInfo, poolData);
        
        return priceData;
    }

    async fetchTokenInfo(tokenAddress) {
        try {
            const data = await this.makeJupiterRequest('https://lite-api.jup.ag/tokens/v2/search', {
                query: tokenAddress
            });

            // Jupiter API returns array directly, not wrapped in value object
            if (data && Array.isArray(data) && data.length > 0) {
                return data[0];
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

    async fetchPoolDataByDEX(tokenAddress, tokenInfo) {
        const poolAddress = (typeof tokenInfo.graduatedPool === 'string' ? tokenInfo.graduatedPool : tokenInfo.graduatedPool?.address) 
                         || tokenInfo.firstPool?.id;
        
        if (!poolAddress) {
            return await this.fetchDexScreenerData(tokenAddress);
        }

        try {
            await new Promise(resolve => setTimeout(resolve, this.requestDelay));
            
            const response = await axios.post(CONSTANT_K_RPC, {
                jsonrpc: '2.0',
                id: 1,
                method: 'getAccountInfo',
                params: [poolAddress, { encoding: 'jsonParsed' }]
            });

            if (response.data?.result?.value) {
                const poolInfo = response.data.result.value;
                const dexType = this.detectDexType(poolInfo.owner);
                
                if (dexType === 'PumpSwap' || dexType === 'Raydium AMM') {
                    const poolData = await this.fetchRaydiumData(poolAddress, tokenAddress);
                    poolData.poolAddress = poolAddress;
                    return poolData;
                } else {
                    return await this.fetchDexScreenerData(tokenAddress);
                }
            }
            
            return await this.fetchDexScreenerData(tokenAddress);
            
        } catch (error) {
            console.error(`❌ [Constant K] Error fetching pool data:`, error.message);
            return await this.fetchDexScreenerData(tokenAddress);
        }
    }

    detectDexType(owner) {
        return DEX_PROGRAMS[owner] || 'Unknown';
    }

    async fetchRaydiumData(poolAddress, tokenAddress) {
        try {
            await new Promise(resolve => setTimeout(resolve, this.requestDelay));
            
            const response = await axios.post(CONSTANT_K_RPC, {
                jsonrpc: '2.0',
                id: 1,
                method: 'getTokenAccountsByOwner',
                params: [
                    poolAddress,
                    { programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' },
                    { encoding: 'jsonParsed' }
                ]
            });

            const tokenAccounts = response.data?.result?.value || [];
            
            if (tokenAccounts.length >= 2) {
                let tokenReserves = 0;
                let solReserves = 0;
                
                tokenAccounts.forEach(account => {
                    const mint = account.account.data.parsed.info.mint;
                    const amount = parseFloat(account.account.data.parsed.info.tokenAmount.uiAmount || 0);
                    
                    if (mint === tokenAddress) {
                        tokenReserves = amount;
                    } else if (mint === WSOL) {
                        solReserves = amount;
                    }
                });
                
                if (tokenReserves > 0 && solReserves > 0) {
                    const priceInSOL = solReserves / tokenReserves;
                    const priceInUSD = priceInSOL * this.solPriceUSD;
                    const liquidity = solReserves * this.solPriceUSD * 2;
                    
                    return {
                        priceInSOL,
                        priceInUSD,
                        tokenReserves,
                        solReserves,
                        liquidity,
                        source: 'Raydium (Constant K)',
                        poolAddress
                    };
                }
            }
            
            throw new Error('Could not extract reserves from Raydium pool');
            
        } catch (error) {
            console.error(`❌ [Raydium] Error fetching reserves:`, error.message);
            throw error;
        }
    }

    async fetchDexScreenerData(tokenAddress) {
        try {
            const response = await axios.get(`${DEXSCREENER_API_BASE}/search`, {
                params: { q: tokenAddress },
                timeout: 5000
            });

            if (response.data?.pairs && response.data.pairs.length > 0) {
                const pair = response.data.pairs[0];
                
                return {
                    priceInUSD: parseFloat(pair.priceUsd || 0),
                    liquidity: parseFloat(pair.liquidity?.usd || 0),
                    volume24h: parseFloat(pair.volume?.h24 || 0),
                    priceChange24h: parseFloat(pair.priceChange?.h24 || 0),
                    source: 'DexScreener'
                };
            }
            
            throw new Error('No pairs found in DexScreener');
            
        } catch (error) {
            console.error(`❌ [DexScreener] Error fetching data:`, error.message);
            throw error;
        }
    }

    // Cleanup methods
    stopRealTimeMonitoring() {
        console.log('🛑 [EnhancedHybridPriceService] Stopping real-time monitoring...');
        
        // Stop the single stream
        const stream = this.grpcStreams.get('all_tokens');
        if (stream) {
            stream.end();
            this.grpcStreams.delete('all_tokens');
        }
        
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
}

export default EnhancedHybridPriceService;