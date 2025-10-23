const axios = require('axios');
const EventEmitter = require('events');
const fs = require('fs').promises;
const path = require('path');
const bs58 = require('bs58');

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
        
        // 🚀 NEW: Real-time streaming architecture (disabled for now)
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
        
        // WebSocket server for real-time updates
        this.webSocketServer = webSocketServer;
        
        // Cache management
        this.cachePath = path.join(process.cwd(), 'cache', 'tokens-cache.json');
        this.backupCachePath = path.join(process.cwd(), 'cache', 'tokens-cache-backup.json');
        
        console.log('✅ [EnhancedHybridPriceService] Initialized (CommonJS mode - gRPC disabled)');
    }

    async initializeAsync() {
        try {
            console.log('🚀 [EnhancedHybridPriceService] Starting async initialization...');
            // Skip gRPC initialization for now
            console.log('⚠️ [EnhancedHybridPriceService] gRPC initialization skipped (CommonJS mode)');
            await this.loadTokenCache();
            console.log('✅ [EnhancedHybridPriceService] Async initialization complete');
        } catch (error) {
            console.error('❌ [EnhancedHybridPriceService] Async initialization failed:', error.message);
        }
    }

    async loadTokenCache() {
        try {
            console.log('📁 [EnhancedHybridPriceService] Loading token cache...');
            
            // Ensure cache directory exists
            const cacheDir = path.dirname(this.cachePath);
            try {
                await fs.mkdir(cacheDir, { recursive: true });
            } catch (error) {
                // Directory might already exist
            }
            
            try {
                const cacheData = await fs.readFile(this.cachePath, 'utf8');
                const tokens = JSON.parse(cacheData);
                
                console.log(`📊 [EnhancedHybridPriceService] Loaded ${tokens.length} tokens from cache`);
                
                // Initialize price cache with cached data
                for (const token of tokens) {
                    if (token.address && token.price) {
                        this.priceCache.set(token.address, {
                            price: token.price,
                            timestamp: Date.now(),
                            source: 'cache'
                        });
                    }
                }
                
            } catch (error) {
                console.log('📁 [EnhancedHybridPriceService] No existing cache found, starting fresh');
            }
            
        } catch (error) {
            console.error('❌ [EnhancedHybridPriceService] Failed to load token cache:', error.message);
        }
    }

    // Simplified price fetching without gRPC
    async getTokenPrice(tokenAddress) {
        try {
            // Check cache first
            const cached = this.priceCache.get(tokenAddress);
            if (cached && Date.now() - cached.timestamp < this.updateInterval) {
                return cached.price;
            }

            // Fetch from Jupiter API
            const response = await axios.get(`${JUPITER_API_BASE}/${tokenAddress}`);
            if (response.data && response.data.price) {
                const price = parseFloat(response.data.price);
                
                // Update cache
                this.priceCache.set(tokenAddress, {
                    price: price,
                    timestamp: Date.now(),
                    source: 'jupiter'
                });
                
                return price;
            }
            
            return null;
        } catch (error) {
            console.error(`❌ [EnhancedHybridPriceService] Failed to fetch price for ${tokenAddress}:`, error.message);
            return null;
        }
    }

    // Simplified SOL price fetching
    async getSolPrice() {
        try {
            if (this.solPriceUSD && Date.now() - this.lastSolPriceUpdate < this.solPriceCacheDuration) {
                return this.solPriceUSD;
            }

            const response = await axios.get(`${JUPITER_API_BASE}/${WSOL}`);
            if (response.data && response.data.price) {
                this.solPriceUSD = parseFloat(response.data.price);
                this.lastSolPriceUpdate = Date.now();
                return this.solPriceUSD;
            }
            
            return 0;
        } catch (error) {
            console.error('❌ [EnhancedHybridPriceService] Failed to fetch SOL price:', error.message);
            return 0;
        }
    }

    // Health check method
    getStatus() {
        return {
            status: 'running',
            mode: 'commonjs',
            grpcEnabled: false,
            cacheSize: this.priceCache.size,
            lastUpdate: this.lastUpdate.size
        };
    }
}

module.exports = EnhancedHybridPriceService;