import axios from 'axios';
import EventEmitter from 'events';

// Updated to new Constant K RPC endpoint with correct API key (Nov 2025)
const CONSTANT_K_RPC = 'https://rpc.constant-k.com/?api-key=39facrmt-om2u-4al5-5k4h-g8pls2y5vhui';
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

class HybridPriceService extends EventEmitter {
    constructor(webSocketServer = null) {
        super();
        this.priceCache = new Map();
        this.lastUpdate = new Map();
        this.updateInterval = 10000; // 10 seconds (for API requests)
        this.backgroundUpdateInterval = 5000; // 5 seconds (for WebSocket broadcasts)
        this.requestDelay = 1000; // 1 second delay between requests
        this.solPriceUSD = 0;
        this.lastSolPriceUpdate = 0;
        this.solPriceCacheDuration = 60000; // 1 minute
        
        // 🚀 NEW: Request deduplication to prevent multiple simultaneous calls
        this.pendingRequests = new Map(); // Map<tokenAddress, Promise>
        this.activeConnections = new Map(); // Map<tokenAddress, Set<connectionId>>
        
        // 🚀 NEW: WebSocket integration for real-time broadcasting
        this.webSocketServer = webSocketServer;
        this.subscribedTokens = new Set(); // Track tokens with active subscriptions
        this.priceUpdateInterval = null; // Background price update interval
    }

    async getTokenPriceData(tokenAddress, connectionId = null) {
        try {
            console.log(`🔍 [HybridPriceService] Fetching data for ${tokenAddress}${connectionId ? ` (conn: ${connectionId})` : ''}`);
            
            // Check cache first
            const cached = this.priceCache.get(tokenAddress);
            const now = Date.now();
            
            if (cached && (now - this.lastUpdate.get(tokenAddress)) < this.updateInterval) {
                console.log(`✅ [HybridPriceService] Using cached data for ${tokenAddress}`);
                return cached;
            }

            // 🚀 NEW: Check if there's already a pending request for this token
            if (this.pendingRequests.has(tokenAddress)) {
                console.log(`⏳ [HybridPriceService] Request already pending for ${tokenAddress}, waiting...`);
                return await this.pendingRequests.get(tokenAddress);
            }

            // 🚀 NEW: Track active connections for this token
            if (connectionId) {
                if (!this.activeConnections.has(tokenAddress)) {
                    this.activeConnections.set(tokenAddress, new Set());
                }
                this.activeConnections.get(tokenAddress).add(connectionId);
            }

            // Create and store the pending request promise
            const requestPromise = this.fetchFreshPriceData(tokenAddress);
            this.pendingRequests.set(tokenAddress, requestPromise);

            try {
                // Fetch fresh data
                const priceData = await requestPromise;
                
                // Cache the result
                this.priceCache.set(tokenAddress, priceData);
                this.lastUpdate.set(tokenAddress, now);
                
                console.log(`✅ [HybridPriceService] Updated data for ${tokenAddress}:`, {
                    price: priceData.priceUsd,
                    marketCap: priceData.marketCap,
                    liquidity: priceData.liquidity,
                    activeConnections: this.activeConnections.get(tokenAddress)?.size || 0
                });
                
                // 🚀 NEW: Broadcast price update via WebSocket if server is available
                if (this.webSocketServer && this.subscribedTokens.has(tokenAddress)) {
                    this.broadcastPriceUpdate(tokenAddress, priceData);
                }
                
                return priceData;
                
            } finally {
                // Clean up pending request
                this.pendingRequests.delete(tokenAddress);
            }
            
        } catch (error) {
            console.error(`❌ [HybridPriceService] Error fetching data for ${tokenAddress}:`, error.message);
            
            // Return cached data if available
            const cached = this.priceCache.get(tokenAddress);
            if (cached) {
                console.log(`⚠️ [HybridPriceService] Returning cached data due to error`);
                return cached;
            }
            
            throw error;
        }
    }

    async fetchFreshPriceData(tokenAddress) {
        // Step 1: Get token info from Jupiter
        const tokenInfo = await this.fetchTokenInfo(tokenAddress);
        if (!tokenInfo) {
            throw new Error('Token not found in Jupiter API');
        }

        // Step 2: Get SOL price
        await this.updateSolPrice();

        // Step 3: Get pool data based on DEX type
        const poolData = await this.fetchPoolDataByDEX(tokenAddress, tokenInfo);
        
        // Step 4: Calculate price, market cap, and liquidity
        const priceData = this.calculatePriceData(tokenInfo, poolData);
        
        return priceData;
    }

    async fetchTokenInfo(tokenAddress) {
        try {
            console.log(`🪐 [Jupiter] Fetching token info for ${tokenAddress}`);
            
            const response = await axios.get(`${JUPITER_API_BASE}/search`, {
                params: { query: tokenAddress },
                timeout: 5000
            });

            if (response.data && response.data.length > 0) {
                const token = response.data[0];
                console.log(`✅ [Jupiter] Found token: ${token.name} (${token.symbol})`);
                return token;
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
            return; // Use cached SOL price
        }

        try {
            console.log(`🪐 [Jupiter] Fetching SOL price`);
            
            // Use Jupiter API to get native SOL price (same API we use for token info)
            const response = await axios.get(`${JUPITER_API_BASE}/search`, {
                params: {
                    query: 'So11111111111111111111111111111111111111112'
                },
                timeout: 5000
            });

            if (response.data && Array.isArray(response.data)) {
                // Find the native SOL token by mint address
                const solToken = response.data.find(token => 
                    token.id === 'So11111111111111111111111111111111111111112' &&
                    token.usdPrice > 0
                );

                if (solToken && solToken.usdPrice) {
                    this.solPriceUSD = solToken.usdPrice;
                    this.lastSolPriceUpdate = now;
                    console.log(`✅ [Jupiter] SOL price: $${this.solPriceUSD}`);
                } else {
                    throw new Error('No SOL price found in Jupiter response');
                }
            } else {
                throw new Error('Invalid Jupiter response format');
            }
        } catch (error) {
            console.error(`❌ [Jupiter] Error fetching SOL price:`, error.message);
            // Use fallback SOL price (approximate)
            this.solPriceUSD = 200;
            console.log(`⚠️ [Fallback] Using estimated SOL price: $${this.solPriceUSD}`);
        }
    }

    async fetchPoolDataByDEX(tokenAddress, tokenInfo) {
        // graduatedPool can be a string (pool address) or object with address property
        const poolAddress = (typeof tokenInfo.graduatedPool === 'string' ? tokenInfo.graduatedPool : tokenInfo.graduatedPool?.address);
        
        if (!poolAddress) {
            console.log(`⚠️ [Pool] No pool address found, using DexScreener fallback`);
            return await this.fetchDexScreenerData(tokenAddress);
        }

        try {
            console.log(`🔗 [Constant K] Fetching pool data for ${poolAddress}`);
            
            // Add delay to respect rate limits
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
                
                console.log(`✅ [Pool] Detected DEX type: ${dexType}`);
                
                if (dexType === 'PumpSwap' || dexType === 'Raydium AMM') {
                    return await this.fetchRaydiumData(poolAddress, tokenAddress);
                } else {
                    console.log(`⚠️ [Pool] Unsupported DEX type ${dexType}, using DexScreener fallback`);
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
            console.log(`🔗 [Constant K] Fetching Raydium reserves for ${poolAddress}`);
            
            // Add delay to respect rate limits
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
                    const liquidity = solReserves * this.solPriceUSD * 2; // Total liquidity
                    
                    console.log(`✅ [Raydium] Calculated price: $${priceInUSD.toFixed(8)}`);
                    
                    return {
                        priceInSOL,
                        priceInUSD,
                        tokenReserves,
                        solReserves,
                        liquidity,
                        source: 'Raydium (Constant K)'
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
            console.log(`📊 [DexScreener] Fetching data for ${tokenAddress}`);
            
            const response = await axios.get(`${DEXSCREENER_API_BASE}/search`, {
                params: { q: tokenAddress },
                timeout: 5000
            });

            if (response.data?.pairs && response.data.pairs.length > 0) {
                const pair = response.data.pairs[0]; // Get the first (usually most liquid) pair
                
                console.log(`✅ [DexScreener] Found pair: ${pair.baseToken.symbol}/${pair.quoteToken.symbol}`);
                
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

    calculatePriceData(tokenInfo, poolData) {
        const priceUsd = poolData.priceInUSD || 0;
        const liquidity = poolData.liquidity || 0;
        const volume24h = poolData.volume24h || 0;
        const priceChange24h = poolData.priceChange24h || 0;
        
        // Calculate market cap
        const totalSupply = tokenInfo.supply || 0;
        const marketCap = priceUsd * totalSupply;
        
        return {
            tokenAddress: tokenInfo.address,
            name: tokenInfo.name,
            symbol: tokenInfo.symbol,
            priceUsd,
            marketCap,
            liquidity,
            volume24h,
            priceChange24h,
            totalSupply,
            source: poolData.source,
            timestamp: Date.now()
        };
    }

    // Get cached data without fetching
    getCachedData(tokenAddress) {
        return this.priceCache.get(tokenAddress);
    }

    // Clear cache for a specific token
    clearCache(tokenAddress) {
        this.priceCache.delete(tokenAddress);
        this.lastUpdate.delete(tokenAddress);
    }

    // Clear all cache
    clearAllCache() {
        this.priceCache.clear();
        this.lastUpdate.clear();
    }

    // 🚀 NEW: Connection management methods
    removeConnection(tokenAddress, connectionId) {
        if (this.activeConnections.has(tokenAddress)) {
            this.activeConnections.get(tokenAddress).delete(connectionId);
            
            // Clean up empty sets
            if (this.activeConnections.get(tokenAddress).size === 0) {
                this.activeConnections.delete(tokenAddress);
            }
            
            console.log(`🔌 [HybridPriceService] Removed connection ${connectionId} for ${tokenAddress}`);
        }
    }

    getActiveConnections(tokenAddress) {
        return this.activeConnections.get(tokenAddress) || new Set();
    }

    getConnectionStats() {
        const stats = {
            totalTokens: this.activeConnections.size,
            totalConnections: 0,
            tokensWithConnections: []
        };

        for (const [tokenAddress, connections] of this.activeConnections) {
            stats.totalConnections += connections.size;
            if (connections.size > 0) {
                stats.tokensWithConnections.push({
                    tokenAddress,
                    connectionCount: connections.size
                });
            }
        }

        return stats;
    }

    // 🚀 NEW: WebSocket integration methods
    setWebSocketServer(webSocketServer) {
        this.webSocketServer = webSocketServer;
        console.log('🔌 [HybridPriceService] WebSocket server connected');
    }

    subscribeToToken(tokenAddress) {
        if (!this.subscribedTokens.has(tokenAddress)) {
            this.subscribedTokens.add(tokenAddress);
            console.log(`📤 [HybridPriceService] Subscribed to token: ${tokenAddress}`);
            
            // Start background price updates if this is the first subscription
            if (this.subscribedTokens.size === 1) {
                this.startBackgroundPriceUpdates();
            }
            
            return true;
        }
        return false;
    }

    unsubscribeFromToken(tokenAddress) {
        if (this.subscribedTokens.has(tokenAddress)) {
            this.subscribedTokens.delete(tokenAddress);
            console.log(`📤 [HybridPriceService] Unsubscribed from token: ${tokenAddress}`);
            
            // Stop background price updates if no more subscriptions
            if (this.subscribedTokens.size === 0) {
                this.stopBackgroundPriceUpdates();
            }
            
            return true;
        }
        return false;
    }

    startBackgroundPriceUpdates() {
        if (this.priceUpdateInterval) {
            return; // Already running
        }

        console.log('🔄 [HybridPriceService] Starting background price updates...');
        
        this.priceUpdateInterval = setInterval(async () => {
            if (this.subscribedTokens.size === 0) {
                this.stopBackgroundPriceUpdates();
                return;
            }

            // Update all subscribed tokens
            for (const tokenAddress of this.subscribedTokens) {
                try {
                    // 🚀 ALWAYS fetch fresh data for background updates (ignore cache)
                    // This ensures real-time WebSocket broadcasts
                    console.log(`🔄 [HybridPriceService] Background update for ${tokenAddress} (ignoring cache)`);
                    
                    // Force fresh data fetch by bypassing cache check
                    const freshData = await this.fetchFreshPriceData(tokenAddress);
                    
                    if (freshData) {
                        // Update cache with fresh data
                        this.priceCache.set(tokenAddress, freshData);
                        this.lastUpdate.set(tokenAddress, Date.now());
                        
                        // Always broadcast via WebSocket for background updates
                        if (this.webSocketServer) {
                            this.broadcastPriceUpdate(tokenAddress, freshData);
                        }
                        
                        console.log(`📡 [HybridPriceService] Background broadcast for ${tokenAddress}: $${freshData.priceUsd}`);
                    }
                    
                    // Add small delay between requests to respect rate limits
                    await new Promise(resolve => setTimeout(resolve, this.requestDelay));
                    
                } catch (error) {
                    console.error(`❌ [HybridPriceService] Background update failed for ${tokenAddress}:`, error.message);
                }
            }
        }, this.backgroundUpdateInterval);

        console.log('✅ [HybridPriceService] Background price updates started');
    }

    stopBackgroundPriceUpdates() {
        if (this.priceUpdateInterval) {
            clearInterval(this.priceUpdateInterval);
            this.priceUpdateInterval = null;
            console.log('🛑 [HybridPriceService] Background price updates stopped');
        }
    }

    broadcastPriceUpdate(tokenAddress, priceData) {
        if (!this.webSocketServer) {
            return;
        }

        try {
            // Broadcast to all WebSocket clients subscribed to this token
            this.webSocketServer.broadcastPriceUpdate(tokenAddress, {
                priceUsd: priceData.priceUsd,
                marketCap: priceData.marketCap,
                liquidity: priceData.liquidity,
                volume24h: priceData.volume24h,
                priceChange24h: priceData.priceChange24h,
                source: priceData.source,
                timestamp: priceData.timestamp
            });

            console.log(`📡 [HybridPriceService] Broadcasted price update for ${tokenAddress}: $${priceData.priceUsd}`);
            
            // Emit event for other services that might be listening
            this.emit('priceUpdate', {
                tokenAddress,
                priceData
            });
            
        } catch (error) {
            console.error(`❌ [HybridPriceService] Failed to broadcast price update for ${tokenAddress}:`, error.message);
        }
    }

    getWebSocketStats() {
        return {
            webSocketServer: this.webSocketServer ? 'connected' : 'not connected',
            subscribedTokens: Array.from(this.subscribedTokens),
            backgroundUpdatesActive: this.priceUpdateInterval !== null,
            totalSubscriptions: this.subscribedTokens.size
        };
    }

    async shutdown() {
        console.log('🛑 [HybridPriceService] Shutting down...');
        
        this.stopBackgroundPriceUpdates();
        this.subscribedTokens.clear();
        this.pendingRequests.clear();
        this.activeConnections.clear();
        
        console.log('✅ [HybridPriceService] Shutdown complete');
    }
}

export default HybridPriceService;