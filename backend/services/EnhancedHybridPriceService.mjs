import axios from 'axios';
import EventEmitter from 'events';
import fs from 'fs/promises';
import path from 'path';
import bs58 from 'bs58';
import ChartDatabase from './ChartDatabase.js';

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
        
        // 🚀 NEW: WebSocket server for real-time broadcasting
        this.webSocketServer = webSocketServer;
        
        // 🚀 NEW: Real-time streaming architecture
        this.grpcClient = null;
        this.grpcStreams = new Map(); // Map<tokenAddress, stream>
        this.activeStreams = new Map(); // Map<tokenAddress, stream> - for stats
        this.poolAddresses = new Map(); // Map<tokenAddress, poolAddress>
        this.realTimeUpdates = new Map(); // Map<tokenAddress, lastUpdate>
        this.swapHistory = new Map(); // Map<tokenAddress, swaps[]>
        
        // 🚀 NEW: Token metadata cache (decimals, graduatedPool, etc.)
        this.tokenMetadataCache = new Map(); // Map<tokenAddress, tokenInfo>
        
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
        
        // 🚀 NEW: Persistent swap storage
        this.chartDatabase = new ChartDatabase();
        
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
            
            // 🚀 NEW: Initialize persistent swap storage
            await this.chartDatabase.loadDatabase();
            this.chartDatabase.startBatchWriter();
            console.log('✅ [EnhancedHybridPriceService] Persistent swap storage initialized');
            
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
            const transactionFilters = {
                client: {
                    accountInclude: [actualPoolAddress], // Monitor transactions involving this pool
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
                                
                                // ✅ CRITICAL FIX: Prevent double-counting by processing only ONE swap per transaction
                                // Strategy: Process only the largest token change (user's swap) and ignore smaller changes (pool's)
                                console.log(`🔍 [EnhancedHybridPriceService] Processing ${tokenChanges.length} token changes for ${tokenAddress}`);
                                
                                // Sort by absolute change amount (largest first)
                                const sortedTokenChanges = tokenChanges.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
                                
                                // Only process the largest change (user's swap)
                                const userTokenChanges = sortedTokenChanges.slice(0, 1);
                                
                                if (tokenChanges.length > 1) {
                                    console.log(`🚫 [EnhancedHybridPriceService] Filtered out ${tokenChanges.length - 1} smaller changes to prevent double-counting`);
                                    console.log(`🔍 [EnhancedHybridPriceService] Processing only largest change: ${userTokenChanges[0].change} from ${userTokenChanges[0].owner}`);
                                }
                                
                                // Debug: Log all balance changes to understand what we're working with
                                console.log(`🔍 [EnhancedHybridPriceService] ALL balance changes in transaction:`);
                                balanceChanges.forEach((bc, idx) => {
                                    console.log(`  ${idx}: ${bc.mint} | Change: ${bc.change} | Owner: ${bc.owner}`);
                                });
                                
                                // Process each user token change
                                userTokenChanges.forEach(tokenChange => {
                                    swapCount++;
                                    // ✅ FIX: Correct swap type logic
                                    // BUY: User gets tokens (+), gives SOL (-) 
                                    // SELL: User gives tokens (-), gets SOL (+)
                                    const swapType = tokenChange.change > 0 ? 'BUY' : 'SELL';
                                    
                                    // Try to find corresponding SOL change (same owner first, then any SOL change)
                                    let solChange = balanceChanges.find(bc => 
                                        bc.mint === 'So11111111111111111111111111111111111111112' &&
                                        bc.owner === tokenChange.owner
                                    );
                                    
                                    // If no SOL change for same owner, look for any SOL change in this transaction
                                    if (!solChange) {
                                        solChange = balanceChanges.find(bc => 
                                            bc.mint === 'So11111111111111111111111111111111111111112'
                                        );
                                    }
                                    
                                    console.log(`🎯 [EnhancedHybridPriceService] SWAP #${swapCount}: ${swapType} for ${tokenAddress}`);
                                    console.log(`📊 [EnhancedHybridPriceService] Token Change: ${tokenChange.change > 0 ? '+' : ''}${tokenChange.change.toFixed(6)}`);
                                    console.log(`📊 [EnhancedHybridPriceService] Swap Type Logic: change=${tokenChange.change}, >0=${tokenChange.change > 0}, Type=${swapType}`);
                                    if (solChange) {
                                        console.log(`📊 [EnhancedHybridPriceService] SOL Change: ${solChange.change > 0 ? '+' : ''}${solChange.change.toFixed(6)} from ${solChange.owner}`);
                                    } else {
                                        console.log(`📊 [EnhancedHybridPriceService] SOL Change: Not found, will estimate`);
                                    }
                                    console.log(`📊 [EnhancedHybridPriceService] Owner: ${tokenChange.owner}`);
                                    console.log(`📊 [EnhancedHybridPriceService] Slot: ${slot}`);
                                    
                                    // Process the swap with both token and SOL amounts
                                    try {
                                        this.processSwapUpdate(
                                            tokenAddress, 
                                            actualPoolAddress, 
                                            slot, 
                                            swapType, 
                                            tokenChange.change, 
                                            tokenChange.mint, 
                                            tokenChange.owner,
                                            solChange ? solChange.change : 0,
                                            null // TODO: Extract transaction hash from Yellowstone gRPC
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

    processSwapUpdate(tokenAddress, poolAddress, slot, swapType, change, mintAddress, makerAddress, solAmount = 0, transactionHash = null) {
        try {
            console.log(`🔄 [EnhancedHybridPriceService] Processing swap update for ${tokenAddress}`);
            console.log(`🔍 [EnhancedHybridPriceService] Raw inputs - change: ${change}, solAmount: ${solAmount}, mintAddress: ${mintAddress}`);
            
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
            
            // 2) Convert SOL amount - check if it's in lamports or SOL already
            let baseSol = 0;
            if (Math.abs(solAmount) > 1e6) {
                // Likely in lamports, convert to SOL
                baseSol = Math.abs(solAmount) / 1e9;
                console.log(`💰 [EnhancedHybridPriceService] Converting from lamports: ${solAmount} -> ${baseSol.toFixed(9)} SOL`);
            } else if (solAmount !== 0) {
                // Already in SOL
                baseSol = Math.abs(solAmount);
                console.log(`💰 [EnhancedHybridPriceService] Already in SOL: ${solAmount} -> ${baseSol.toFixed(9)} SOL`);
            }
            
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
                
                console.log(`💰 [EnhancedHybridPriceService] Calculated - Price: ${priceSol.toFixed(9)} SOL/token, $${priceUsd.toFixed(6)} USD, Volume: $${volumeUsd.toFixed(4)}`);
            } else {
                console.log(`⚠️ [EnhancedHybridPriceService] Missing SOL amount or token amount, using fallback`);
                // Fallback calculation
                if (tokenMetadata && tokenMetadata.usdPrice) {
                    volumeUsd = qtyTokenUI * tokenMetadata.usdPrice;
                    baseSol = volumeUsd / this.solPriceUSD;
                    priceSol = baseSol / qtyTokenUI;
                    priceUsd = priceSol * this.solPriceUSD;
                    console.log(`💰 [EnhancedHybridPriceService] Fallback - Price: ${priceSol.toFixed(9)} SOL/token, Volume: $${volumeUsd.toFixed(4)}`);
                } else {
                    baseSol = qtyTokenUI * 0.0000001;
                    volumeUsd = baseSol * this.solPriceUSD;
                    priceSol = baseSol / qtyTokenUI;
                    priceUsd = priceSol * this.solPriceUSD;
                    console.log(`⚠️ [EnhancedHybridPriceService] Last resort fallback - Price: ${priceSol.toFixed(9)} SOL/token, Volume: $${volumeUsd.toFixed(4)}`);
                }
            }
            
            // Use normalized values
            const tokenAmount = qtyTokenUI;
            const baseAmount = baseSol;
            
            // Create swap record with frontend-compatible format
            const swapRecord = {
                timestamp: Date.now(),
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
                signature: transactionHash || `slot_${slot}_${Date.now()}`,
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
            
            console.log(`✅ [EnhancedHybridPriceService] Swap processed: ${swapType} ${change.toFixed(6)} tokens`);
            
            // 🚀 NEW: Broadcast swap via WebSocket for real-time updates
            if (this.webSocketServer) {
                this.webSocketServer.broadcastSwapUpdate(tokenAddress, {
                    swap: swapRecord,
                    totalSwaps: currentSwaps.length,
                    timestamp: Date.now()
                });
                console.log(`📡 [EnhancedHybridPriceService] Swap broadcasted via WebSocket for ${tokenAddress}`);
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
            
        } catch (error) {
            console.error(`❌ [EnhancedHybridPriceService] Error processing swap update:`, error.message);
        }
    }

    // 🚀 NEW: Save swap to persistent database
    async saveSwapToDatabase(swapRecord, tokenAddress, poolAddress) {
        try {
            console.log(`💾 [EnhancedHybridPriceService] Attempting to save swap to database for ${tokenAddress}`);
            console.log(`💾 [EnhancedHybridPriceService] ChartDatabase available:`, !!this.chartDatabase);
            
            if (!this.chartDatabase) {
                console.error(`❌ [EnhancedHybridPriceService] ChartDatabase not available for ${tokenAddress}`);
                return;
            }
            
            // Convert swap record to database format
            const persistentSwapRecord = {
                tokenAddress: tokenAddress, // ✅ CRITICAL FIX: Add tokenAddress at top level for ChartDatabase
                signature: `slot_${swapRecord.slot}_${swapRecord.timestamp}`, // Generate unique signature
                timestamp: Math.floor(swapRecord.timestamp / 1000), // Unix timestamp for database
                poolAddress: poolAddress,
                price: 0, // Will be calculated later
                volume: Math.abs(swapRecord.change), // Volume is absolute change
                source: 'grpc_realtime',
                rawData: {
                    tokenAddress: tokenAddress,
                    slot: swapRecord.slot,
                    type: swapRecord.type,
                    change: swapRecord.change,
                    mintAddress: swapRecord.mintAddress,
                    poolAddress: poolAddress,
                    maker: swapRecord.maker,
                    timestamp: swapRecord.timestamp
                }
            };
            
            console.log(`💾 [EnhancedHybridPriceService] Saving swap record:`, persistentSwapRecord);
            
            // Save to persistent storage
            await this.chartDatabase.storeSwaps([persistentSwapRecord]);
            console.log(`💾 [EnhancedHybridPriceService] Swap saved to persistent storage for ${tokenAddress}`);
            
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

            // Get pool address for this token
            let poolAddress = this.poolAddresses.get(tokenAddress);
            
            // ✅ CRITICAL FIX: If pool address is empty, try to get it from cached metadata or recent swaps
            if (!poolAddress) {
                // First try cached token metadata
                const tokenMetadata = this.tokenMetadataCache.get(tokenAddress);
                if (tokenMetadata && tokenMetadata.graduatedPool) {
                    poolAddress = tokenMetadata.graduatedPool;
                    console.log(`🔧 [EnhancedHybridPriceService] Using graduatedPool from cached metadata: ${poolAddress}`);
                } else {
                    // Fallback to recent swaps
                    const currentSwaps = this.swapHistory.get(tokenAddress) || [];
                    if (currentSwaps.length > 0 && currentSwaps[0].poolAddress) {
                        poolAddress = currentSwaps[0].poolAddress;
                        console.log(`🔧 [EnhancedHybridPriceService] Using pool address from recent swaps: ${poolAddress}`);
                    }
                }
            }
            
            if (!poolAddress) {
                console.log(`⚠️ [EnhancedHybridPriceService] No pool address for ${tokenAddress}, cannot load historical swaps`);
                return [];
            }

            // Get swaps from database using pool address
            const swaps = await this.chartDatabase.getRecentSwaps(poolAddress, 100); // Get last 100 swaps
            if (!swaps || swaps.length === 0) {
                console.log(`📚 [EnhancedHybridPriceService] No historical swaps in database for pool ${poolAddress}`);
                return [];
            }

            // Convert database format back to frontend format
            const historicalSwaps = swaps.map(dbSwap => {
                return {
                    timestamp: dbSwap.timestamp * 1000, // Convert back to milliseconds
                    slot: dbSwap.signature || 'unknown',
                    type: dbSwap.type || 'unknown',
                    change: dbSwap.tokenAmount || 0,
                    mintAddress: tokenAddress,
                    poolAddress: poolAddress,
                    // Frontend-compatible fields
                    tokenAmount: dbSwap.tokenAmount || 0,
                    baseAmount: dbSwap.baseAmount || 0,
                    volumeUsd: dbSwap.volumeUsd || 0,
                    maker: dbSwap.maker || 'Unknown',
                    signature: dbSwap.signature,
                    price: dbSwap.price || 0
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

    // ✅ UNIVERSAL IMPLEMENTATION: Get real-time data for ANY token address
    async getRealTimeTokenData(tokenAddress) {
        try {
            console.log(`🔍 [EnhancedHybridPriceService] Getting UNIVERSAL real-time data for ${tokenAddress}`);
            
            // ✅ UNIVERSAL: Auto-start monitoring for any token
            await this.ensureTokenMonitoring(tokenAddress);
            
            // ✅ UNIVERSAL: Use real-time swap data from transaction monitoring for ANY token
            const realTimeData = this.realTimeUpdates.get(tokenAddress);
            let recentSwaps = [];
            
            if (realTimeData && realTimeData.swaps && realTimeData.swaps.length > 0) {
                console.log(`✅ [EnhancedHybridPriceService] Using real-time swap data: ${realTimeData.swaps.length} swaps for ${tokenAddress}`);
                recentSwaps = realTimeData.swaps.sort((a, b) => b.timestamp - a.timestamp);
            } else {
                console.log(`⚠️ [EnhancedHybridPriceService] No real-time swap data for ${tokenAddress}, loading from persistent storage`);
                
                // 🚀 NEW: Load historical swaps from persistent storage
                try {
                    const historicalSwaps = await this.loadHistoricalSwaps(tokenAddress);
                    if (historicalSwaps && historicalSwaps.length > 0) {
                        console.log(`📚 [EnhancedHybridPriceService] Loaded ${historicalSwaps.length} historical swaps for ${tokenAddress}`);
                        recentSwaps = historicalSwaps.sort((a, b) => b.timestamp - a.timestamp);
                    } else {
                        console.log(`📚 [EnhancedHybridPriceService] No historical swaps found for ${tokenAddress}`);
                    }
                } catch (error) {
                    console.error(`❌ [EnhancedHybridPriceService] Error loading historical swaps for ${tokenAddress}:`, error.message);
                }
                
                if (recentSwaps.length === 0) {
                    console.log(`⚠️ [EnhancedHybridPriceService] No swaps found, using fallback`);
                    
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
}

export default EnhancedHybridPriceService;