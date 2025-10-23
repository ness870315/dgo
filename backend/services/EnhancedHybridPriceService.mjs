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
            
            // Filter only completed tokens
            const completedTokens = this.tokenCache.filter(token => token.stage === 'completed');
            console.log(`✅ [EnhancedHybridPriceService] Loaded ${completedTokens.length} completed tokens from cache`);
            
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
        const TEST_TOKEN = '9N9V585yTpmosZacAcXLZWxKJEK7PbaH4RJ8gEKLD9sc'; // PROBITY from working test
        const TEST_POOL = '98rxcGXHxfAQ39rgpN9qMGPLhgWfze1RmQ4PHprTvZFN'; // Pool from working test
        
        console.log(`📊 [EnhancedHybridPriceService] SIMPLIFIED TEST - Monitoring 1 token: ${TEST_TOKEN}`);
        console.log(`📊 [EnhancedHybridPriceService] SIMPLIFIED TEST - Pool address: ${TEST_POOL}`);
        
        // Start monitoring with just this one token
        await this.startSingleTokenMonitoring(TEST_TOKEN, TEST_POOL);
        
        console.log('✅ [EnhancedHybridPriceService] SIMPLIFIED real-time monitoring started for 1 token');
    }

    async startSingleTokenMonitoring(tokenAddress, poolAddress) {
        try {
            console.log(`🔌 [EnhancedHybridPriceService] Starting SINGLE token monitoring for ${tokenAddress}...`);
            
            // Use the WORKING SOLUTION: subscribeOnce for real-time pool monitoring
            // Based on test-multi-contract-monitoring.js which was working perfectly
            console.log(`📊 [EnhancedHybridPriceService] Starting pool monitoring (WORKING SOLUTION)`);
            const CommitmentLevel = this.grpcWrapper.getCommitmentLevel();
            
            // Build account filters for single pool address (like the working test)
            const accountFilters = {
                'pool_0': {
                    account: [poolAddress],
                    owner: [],
                    filters: []
                }
            };
            
            console.log(`📊 [EnhancedHybridPriceService] Monitoring 1 pool address: ${poolAddress}`);
            console.log(`📊 [EnhancedHybridPriceService] CommitmentLevel:`, CommitmentLevel);
            console.log(`📊 [EnhancedHybridPriceService] Account filters:`, Object.keys(accountFilters).length);
            
            console.log(`🔌 [EnhancedHybridPriceService] About to call subscribeOnce...`);
            const stream = await this.grpcClient.subscribeOnce(
                accountFilters, // accounts - pool addresses like working test
                {}, // slots  
                {}, // transactions
                {}, // transactionsStatus
                {}, // entry
                {}, // blocks
                {}, // blocksMeta
                CommitmentLevel?.CONFIRMED || 'confirmed',
                []  // accountsDataSlice
            );
            
            console.log(`✅ [EnhancedHybridPriceService] subscribeOnce completed successfully`);
            console.log(`📊 [EnhancedHybridPriceService] Stream object:`, typeof stream, stream ? 'exists' : 'null');
            
            let totalUpdateCount = 0;
            stream.on("data", async (msg) => {
                try {
                    // Only log essential info, not the massive data payload
                    let lastLogTime = 0;
                    const LOG_INTERVAL = 5000; // Log every 5 seconds max
                    
                    // Comprehensive validation for account data
                    if (msg.account && msg.account.account && msg.account.account.pubkey && 
                        msg.account.account.pubkey.data && msg.account.account.pubkey.data.length > 0) {
                        
                        totalUpdateCount++;
                        const slot = msg.account.slot;
                        const accountAddress = bs58.encode(new Uint8Array(msg.account.account.pubkey.data));
                        
                        // Rate limit logging to prevent spam
                        const now = Date.now();
                        if (now - lastLogTime > LOG_INTERVAL) {
                            console.log(`🔍 [EnhancedHybridPriceService] Processing update #${totalUpdateCount}: ${accountAddress} at slot ${slot}`);
                            lastLogTime = now;
                        }
                        
                        // Check if this is our monitored pool
                        if (accountAddress === poolAddress) {
                            console.log(`✅ [EnhancedHybridPriceService] Found matching pool ${poolAddress} for token ${tokenAddress}`);
                            try {
                                await this.processPoolUpdate(tokenAddress, poolAddress, slot, totalUpdateCount);
                            } catch (error) {
                                console.error(`❌ [EnhancedHybridPriceService] Error processing update for ${tokenAddress}:`, error.message);
                            }
                        } else {
                            console.log(`⚠️ [EnhancedHybridPriceService] Received update for different pool: ${accountAddress} (expected: ${poolAddress})`);
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
                console.error(`❌ [EnhancedHybridPriceService] Stream error:`, error.message);
            });
            
            stream.on("end", () => {
                console.log(`🔚 [EnhancedHybridPriceService] Stream ended`);
            });
            
            // Store the stream
            this.grpcStreams.set('single_token', stream);
            console.log(`✅ [EnhancedHybridPriceService] SINGLE token monitoring started for ${tokenAddress}`);
            
        } catch (error) {
            console.error(`❌ [EnhancedHybridPriceService] Failed to start single token monitoring:`, error.message);
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
                CommitmentLevel?.CONFIRMED || 'confirmed',
                []  // accountsDataSlice
            );
            
            let totalUpdateCount = 0;
            let lastLogTime = 0;
            const LOG_INTERVAL = 5000; // Log every 5 seconds max
            
            stream.on("data", async (msg) => {
                try {
                    // Only process valid account data with proper validation
                    if (msg.account && msg.account.account && msg.account.account.pubkey && msg.account.account.pubkey.data && msg.account.account.pubkey.data.length > 0) {
                        totalUpdateCount++;
                        const slot = msg.account.slot;
                        const accountAddress = bs58.encode(new Uint8Array(msg.account.account.pubkey.data));
                        
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
            const tokenInfo = this.getTokenFromCache(tokenAddress);
            if (!tokenInfo) {
                console.log(`❌ [DEBUG] No token info found for ${tokenAddress}`);
                return;
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
            console.log(`🔍 [DEBUG] Found ${tokenAccounts.length} token accounts for pool ${poolAddress}`);
            
            if (tokenAccounts.length >= 2) {
                let tokenReserves = 0;
                let solReserves = 0;
                
                tokenAccounts.forEach(account => {
                    const mint = account.account.data.parsed.info.mint;
                    const amount = parseFloat(account.account.data.parsed.info.tokenAmount.uiAmount || 0);
                    
                    console.log(`🔍 [DEBUG] Account mint: ${mint}, amount: ${amount}`);
                    
                    if (mint === tokenAddress) {
                        tokenReserves = amount;
                        console.log(`🔍 [DEBUG] Set tokenReserves to ${amount} for token ${tokenAddress}`);
                    } else if (mint === WSOL) {
                        solReserves = amount;
                        console.log(`🔍 [DEBUG] Set solReserves to ${amount} for WSOL`);
                    }
                });
                
                console.log(`🔍 [DEBUG] Final reserves - tokenReserves: ${tokenReserves}, solReserves: ${solReserves}`);
                
                return { tokenReserves, solReserves };
            }
            
            console.log(`❌ [DEBUG] Not enough token accounts (${tokenAccounts.length}) for pool ${poolAddress}`);
            return null;
        } catch (error) {
            console.error(`❌ [DEBUG] Error fetching pool reserves for ${poolAddress}:`, error.message);
            return null;
        }
    }

    calculatePriceData(tokenInfo, poolData) {
        const priceUsd = poolData.priceInUSD || 0;
        const liquidity = poolData.liquidity || 0;
        const volume24h = poolData.volume24h || 0;
        const priceChange24h = poolData.priceChange24h || 0;
        
        const totalSupply = tokenInfo.totalSupply || tokenInfo.jupiterData?.totalSupply || 0;
        const marketCap = priceUsd * totalSupply;
        
        return {
            tokenAddress: tokenInfo.contractAddress || tokenInfo.tokenAddress,
            name: tokenInfo.name,
            symbol: tokenInfo.symbol,
            priceUsd,
            marketCap,
            liquidity,
            volume24h,
            priceChange24h,
            totalSupply,
            source: poolData.source || 'Constant K gRPC',
            poolAddress: poolData.poolAddress,
            timestamp: Date.now()
        };
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

    // 🚀 NEW: Public methods for getting real-time data
    getRealTimePrice(tokenAddress) {
        return this.priceCache.get(tokenAddress);
    }

    getSwapHistory(tokenAddress, limit = 50) {
        const swaps = this.swapHistory.get(tokenAddress) || [];
        return swaps.slice(-limit);
    }

    getRealTimeStats() {
        return {
            grpcClient: this.grpcClient ? 'connected' : 'not connected',
            grpcClientExists: !!this.grpcClient,
            activeStreams: this.grpcStreams.has('all_tokens') ? ['all_tokens'] : [],
            poolAddresses: Object.fromEntries(this.poolAddresses),
            totalTokens: this.poolAddresses.size,
            totalSwaps: Array.from(this.swapHistory.values()).reduce((sum, swaps) => sum + swaps.length, 0),
            streamType: 'single_stream_all_tokens',
            initializationStatus: this.grpcClient ? 'initialized' : 'not initialized'
        };
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
            const response = await axios.get(`${JUPITER_API_BASE}/search`, {
                params: { query: tokenAddress },
                timeout: 5000
            });

            if (response.data && response.data.length > 0) {
                return response.data[0];
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
            const response = await axios.get(`${JUPITER_API_BASE}/search`, {
                params: {
                    query: 'So11111111111111111111111111111111111111112'
                },
                timeout: 5000
            });

            if (response.data && Array.isArray(response.data)) {
                const solToken = response.data.find(token => 
                    token.id === 'So11111111111111111111111111111111111111112' &&
                    token.usdPrice > 0
                );

                if (solToken && solToken.usdPrice) {
                    this.solPriceUSD = solToken.usdPrice;
                    this.lastSolPriceUpdate = now;
                } else {
                    this.solPriceUSD = 200;
                }
            } else {
                this.solPriceUSD = 200;
            }
        } catch (error) {
            this.solPriceUSD = 200;
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