import EnhancedHybridPriceService from './EnhancedHybridPriceService.mjs';
import DexScreenerStyleMonitor from './DexScreenerStyleMonitor.mjs';
import ChartDatabase from './ChartDatabase.js';
import fs from 'fs/promises';
import path from 'path';

class RealTimeTokenMonitor {
    constructor(webSocketServer = null) {
        this.webSocketServer = webSocketServer;
        this.hybridPriceService = null;
        this.isRunning = false;
        this.monitoringStats = {
            startTime: null,
            totalTokens: 0,
            activeStreams: 0,
            totalSwaps: 0,
            totalPriceUpdates: 0,
            errors: 0
        };
        
        // Cache paths - use persistent storage
        const baseDir = process.env.DATA_DIR || '/var/data/dgo';
        this.cachePath = path.join(baseDir, 'cache', 'tokens-cache.json');
        this.backupCachePath = path.join(baseDir, 'cache', 'tokens-cache-backup.json');
    }

    async initialize() {
        try {
            console.log('🚀 [RealTimeTokenMonitor] Initializing...');
            
            // 🚀 FEATURE FLAG: Use new DexScreener-style monitor or old service
            const USE_DEXSCREENER_MONITOR = process.env.USE_DEXSCREENER_MONITOR === 'true';
            
            if (USE_DEXSCREENER_MONITOR) {
                console.log('🚀 [RealTimeTokenMonitor] Using NEW DexScreenerStyleMonitor');
                
                // Initialize ChartDatabase
                const chartDatabase = new ChartDatabase();
                await chartDatabase.loadData();
                chartDatabase.startBatchWriter();
                
                // Initialize DexScreener monitor
                this.hybridPriceService = new DexScreenerStyleMonitor(chartDatabase, this.webSocketServer);
                await this.hybridPriceService.initialize();
                
                // Load token cache and onboard tokens
                const tokens = await this.loadTokenCache();
                await this.onboardCachedTokens(tokens);
                
            } else {
                console.log('⚠️  [RealTimeTokenMonitor] Using OLD EnhancedHybridPriceService');
                
                // Initialize old service
                this.hybridPriceService = new EnhancedHybridPriceService(this.webSocketServer);
                
                // Wait for gRPC client to initialize
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                // Load token cache
                await this.loadTokenCache();
            }
            
            console.log('✅ [RealTimeTokenMonitor] Initialization complete');
            
        } catch (error) {
            console.error('❌ [RealTimeTokenMonitor] Failed to initialize:', error.message);
            throw error;
        }
    }

    /**
     * Onboard cached tokens to DexScreener monitor
     * (Only used with new monitor)
     */
    async onboardCachedTokens(tokens) {
        if (!this.hybridPriceService.batchOnboardTokens) {
            console.log(`⚠️  [RealTimeTokenMonitor] batchOnboardTokens not available, falling back to individual onboarding`);
            console.log(`   Service type: ${this.hybridPriceService.constructor.name}`);
            console.log(`   Has onboardToken: ${!!this.hybridPriceService.onboardToken}`);
            console.log(`   Has batchOnboardTokens: ${!!this.hybridPriceService.batchOnboardTokens}`);
            
            // Fallback to individual onboarding
            for (const token of tokens) {
                try {
                    const mint = token.contractAddress || token.tokenAddress;
                    
                    let pool = token.poolAddress;
                    if (!pool && token.graduatedPool) {
                        if (typeof token.graduatedPool === 'object') {
                            pool = token.graduatedPool.address || token.graduatedPool.id;
                        } else {
                            pool = token.graduatedPool;
                        }
                    }
                    if (!pool) {
                        pool = await this.fetchPoolFromMoralis(mint);
                    }
                    
                    if (!pool || !token.decimals) {
                        continue;
                    }

                    await this.hybridPriceService.onboardToken(mint, {
                        name: token.name || token.symbol,
                        pool: pool,
                        decimals: token.decimals
                    });
                } catch (error) {
                    console.error(`❌ Failed to onboard ${token.symbol}:`, error.message);
                }
            }
            return;
        }

        console.log(`📋 [RealTimeTokenMonitor] Preparing ${tokens.length} cached tokens for batch onboarding...`);
        
        const tokensConfig = [];

        for (const token of tokens) {
            try {
                const mint = token.contractAddress || token.tokenAddress;
                
                // Try to find pool in priority order
                let pool = token.poolAddress;  // 1. Direct poolAddress field (from cache)
                
                // 2. Check graduatedPool (from Jupiter API enrichment)
                if (!pool && token.graduatedPool) {
                    // Handle graduatedPool object format
                    if (typeof token.graduatedPool === 'object') {
                        pool = token.graduatedPool.address || token.graduatedPool.id;
                    } else {
                        pool = token.graduatedPool;
                    }
                }
                
                // 3. If still no pool, fetch from Moralis
                if (!pool) {
                    console.log(`   🔍 No pool in cache for ${token.symbol}, fetching from Moralis...`);
                    pool = await this.fetchPoolFromMoralis(mint);
                }
                
                // Skip if missing required data
                if (!pool || !token.decimals) {
                    console.log(`⚠️  [RealTimeTokenMonitor] Skipping ${token.symbol}: Missing ${!pool ? 'pool' : 'decimals'}`);
                    continue;
                }

                tokensConfig.push({
                    mint,
                    config: {
                        name: token.name || token.symbol,
                        pool: pool,
                        decimals: token.decimals
                    }
                });

            } catch (error) {
                console.error(`❌ [RealTimeTokenMonitor] Failed to prepare ${token.symbol}:`, error.message);
            }
        }

        // Batch onboard all tokens at once
        const result = await this.hybridPriceService.batchOnboardTokens(tokensConfig);
        console.log(`✅ [RealTimeTokenMonitor] Batch onboarding complete: ${result.successful} successful, ${result.failed} failed`);
    }

    /**
     * Fetch pool address from Moralis API
     */
    async fetchPoolFromMoralis(mint, retries = 3) {
        const MORALIS_API_KEY = process.env.MORALIS_API_KEY;
        
        if (!MORALIS_API_KEY) {
            console.error('   ❌ MORALIS_API_KEY not set in environment');
            return null;
        }

        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                const url = `https://solana-gateway.moralis.io/token/mainnet/${mint}/pairs`;
                const response = await fetch(url, {
                    headers: {
                        'X-API-Key': MORALIS_API_KEY
                    }
                });
                
                if (!response.ok) {
                    console.error(`   ❌ Moralis API error: ${response.status}`);
                    if (attempt < retries) {
                        console.log(`   🔄 Retrying in 2 seconds...`);
                        await new Promise(resolve => setTimeout(resolve, 2000));
                        continue;
                    }
                    return null;
                }
            
                const data = await response.json();
                
                // Extract pairAddress from first active pair with highest liquidity
                if (data && data.pairs && data.pairs.length > 0) {
                    const sortedPairs = data.pairs
                        .filter(p => !p.inactivePair) // Only active pairs
                        .sort((a, b) => (b.liquidityUsd || 0) - (a.liquidityUsd || 0));
                    
                    if (sortedPairs.length > 0) {
                        const bestPair = sortedPairs[0];
                        console.log(`   ✅ Moralis pool: ${bestPair.pairAddress} (${bestPair.exchangeName}, $${(bestPair.liquidityUsd / 1000000).toFixed(2)}M)`);
                        return bestPair.pairAddress;
                    } else {
                        console.error(`   ❌ No active pairs found in Moralis response`);
                        return null;
                    }
                } else {
                    console.error(`   ❌ No pairs found in Moralis response`);
                    return null;
                }
            } catch (error) {
                console.error(`   ❌ Moralis fetch error (attempt ${attempt}/${retries}):`, error.message);
                if (attempt < retries) {
                    console.log(`   🔄 Retrying in 2 seconds...`);
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            }
        }
        
        return null;
    }

    async loadTokenCache() {
        try {
            console.log('📂 [RealTimeTokenMonitor] Loading token cache...');
            
            // Try primary cache first
            let cacheData;
            try {
                cacheData = await fs.readFile(this.cachePath, 'utf8');
                console.log('✅ [RealTimeTokenMonitor] Loaded primary cache');
            } catch (error) {
                console.log('⚠️ [RealTimeTokenMonitor] Primary cache not found, trying backup...');
                cacheData = await fs.readFile(this.backupCachePath, 'utf8');
                console.log('✅ [RealTimeTokenMonitor] Loaded backup cache');
            }
            
            const tokens = JSON.parse(cacheData);
            const completedTokens = tokens.filter(token => token.stage === 'completed');
            
            console.log(`📊 [RealTimeTokenMonitor] Found ${completedTokens.length} completed tokens`);
            
            // Update monitoring stats
            this.monitoringStats.totalTokens = completedTokens.length;
            
            return completedTokens;
            
        } catch (error) {
            console.error('❌ [RealTimeTokenMonitor] Failed to load token cache:', error.message);
            return [];
        }
    }

    async startMonitoring() {
        if (this.isRunning) {
            console.log('⚠️ [RealTimeTokenMonitor] Already running');
            return;
        }

        try {
            console.log('🚀 [RealTimeTokenMonitor] Starting real-time monitoring...');
            
            this.isRunning = true;
            this.monitoringStats.startTime = Date.now();
            
            // NEW: EnhancedHybridPriceService already starts DEX stream in initializeAsync()
            // No need to call startRealTimeMonitoring() - it doesn't exist in the new architecture
            // The DEX stream is already running and monitoring all DEX programs
            
            // Set up event listeners
            this.setupEventListeners();
            
            // Start periodic stats reporting
            this.startStatsReporting();
            
            console.log('✅ [RealTimeTokenMonitor] Real-time monitoring started (DEX stream already active)');
            
        } catch (error) {
            console.error('❌ [RealTimeTokenMonitor] Failed to start monitoring:', error.message);
            this.isRunning = false;
            throw error;
        }
    }

    setupEventListeners() {
        // Listen for price updates
        this.hybridPriceService.on('priceUpdate', (data) => {
            this.monitoringStats.totalPriceUpdates++;
            
            // Log significant price changes
            const priceData = data.priceData;
            if (priceData.priceChange24h && Math.abs(priceData.priceChange24h) > 5) {
                console.log(`📈 [Price Alert] ${priceData.symbol}: ${priceData.priceChange24h > 0 ? '+' : ''}${priceData.priceChange24h.toFixed(2)}%`);
            }
        });

        // Listen for swap updates
        this.hybridPriceService.on('swapUpdate', (data) => {
            this.monitoringStats.totalSwaps++;
            
            const swap = data.swap;
            const tokenAddress = data.tokenAddress;
            
            // Log significant swaps
            if (swap.usdAmount > 1000) {
                console.log(`💰 [Large Swap] ${swap.symbol} ${swap.type}: $${swap.usdAmount.toFixed(2)} @ $${swap.priceUSD.toFixed(6)}`);
            }
        });

        // Listen for errors
        this.hybridPriceService.on('error', (error) => {
            this.monitoringStats.errors++;
            console.error('❌ [RealTimeTokenMonitor] Error from HybridPriceService:', error.message);
        });
    }

    startStatsReporting() {
        // Report stats every 30 seconds
        setInterval(() => {
            if (this.isRunning) {
                this.reportStats();
            }
        }, 30000);
    }

    reportStats() {
        const runtime = Math.floor((Date.now() - this.monitoringStats.startTime) / 1000);
        const serviceStats = this.hybridPriceService.getStats();
        const filterStats = this.hybridPriceService.getFilterStats();
        
        console.log('\n📊 [RealTimeTokenMonitor] STATS REPORT');
        console.log('============================================================');
        console.log(`⏰ Runtime: ${runtime} seconds`);
        console.log(`📈 Known Tokens: ${serviceStats.knownTokens}`);
        console.log(`🆕 New Tokens Tracking: ${serviceStats.newTokensTracking}`);
        console.log(`💰 Total Swaps Processed: ${serviceStats.totalSwapsProcessed}`);
        console.log(`🔍 Tokens Discovered: ${serviceStats.tokensDiscovered}`);
        console.log(`⚡ Stream Uptime: ${Math.floor(serviceStats.streamUptime / 1000)}s`);
        console.log(`📊 Swaps/sec: ${(serviceStats.totalSwapsProcessed / runtime).toFixed(2)}`);
        console.log('------------------------------------------------------------');
        console.log('🚦 FILTER PERFORMANCE:');
        console.log(`   Layer 1 (Activity): ${filterStats.layer1.checked} checked, ${filterStats.layer1.passed} passed (${filterStats.layer1.passRate})`);
        if (filterStats.layer1.failed) {
            console.log(`      ❌ Too Young: ${filterStats.layer1.failed.tooYoung || 0}`);
            console.log(`      ❌ Low Activity: ${filterStats.layer1.failed.lowActivity || 0}`);
            console.log(`      ❌ Low Swap Rate: ${filterStats.layer1.failed.lowSwapRate || 0}`);
            console.log(`      ❌ Extreme Volatility: ${filterStats.layer1.failed.extremeVolatility || 0}`);
            console.log(`      ❌ Suspicious Price: ${filterStats.layer1.failed.suspiciousPrice || 0}`);
        }
        console.log(`   Layer 2 (Jupiter): ${filterStats.layer2.checked} checked, ${filterStats.layer2.passed} passed (${filterStats.layer2.passRate})`);
        if (filterStats.layer2.failed) {
            console.log(`      ❌ No Quality Indicators: ${filterStats.layer2.failed.noQualityIndicators || 0}`);
            console.log(`      ❌ Suspicious Token: ${filterStats.layer2.failed.suspicious || 0}`);
            console.log(`      ❌ Frozen Token: ${filterStats.layer2.failed.frozen || 0}`);
            console.log(`      ❌ API Error: ${filterStats.layer2.failed.apiError || 0}`);
        }
        console.log(`   💾 Saved to Database: ${filterStats.layer3.successful}`);
        console.log(`   📉 API Call Reduction: ${filterStats.summary.apiCallReduction}`);
        console.log('============================================================\n');
    }

    // Public methods for getting real-time data
    getRealTimePrice(tokenAddress) {
        if (!this.hybridPriceService) return null;
        return this.hybridPriceService.getRealTimePrice(tokenAddress);
    }

    getSwapHistory(tokenAddress, limit = 50) {
        if (!this.hybridPriceService) return [];
        return this.hybridPriceService.getSwapHistory(tokenAddress, limit);
    }

    getAllTokenPrices() {
        if (!this.hybridPriceService) return {};
        
        const prices = {};
        const realTimeStats = this.hybridPriceService.getRealTimeStats();
        
        for (const tokenAddress of realTimeStats.activeStreams) {
            const priceData = this.hybridPriceService.getRealTimePrice(tokenAddress);
            if (priceData) {
                prices[tokenAddress] = priceData;
            }
        }
        
        return prices;
    }

    getMonitoringStats() {
        const runtime = this.monitoringStats.startTime ? 
            Math.floor((Date.now() - this.monitoringStats.startTime) / 1000) : 0;
        
        const realTimeStats = this.hybridPriceService ? 
            this.hybridPriceService.getRealTimeStats() : { activeStreams: [], totalTokens: 0 };
        
        return {
            isRunning: this.isRunning,
            runtime: runtime,
            totalTokens: this.monitoringStats.totalTokens,
            activeStreams: realTimeStats.activeStreams.length,
            totalSwaps: this.monitoringStats.totalSwaps,
            totalPriceUpdates: this.monitoringStats.totalPriceUpdates,
            errors: this.monitoringStats.errors,
            swapsPerSecond: runtime > 0 ? (this.monitoringStats.totalSwaps / runtime).toFixed(2) : 0,
            updatesPerSecond: runtime > 0 ? (this.monitoringStats.totalPriceUpdates / runtime).toFixed(2) : 0,
            grpcStatus: realTimeStats.grpcClient
        };
    }

    // Add new token to monitoring
    async addToken(tokenData) {
        if (!this.hybridPriceService) {
            throw new Error('RealTimeTokenMonitor not initialized');
        }

        const contractAddress = tokenData.contractAddress || tokenData.tokenAddress;
        if (!contractAddress) {
            throw new Error('Token address not provided');
        }

        // Add to pool addresses if pool exists
        let poolAddress = null;
        if (tokenData.jupiterData?.firstPool?.id) {
            poolAddress = tokenData.jupiterData.firstPool.id;
        } else if (tokenData.graduatedPool) {
            poolAddress = typeof tokenData.graduatedPool === 'string' ? 
                tokenData.graduatedPool : tokenData.graduatedPool?.address;
        }

        if (poolAddress) {
            this.hybridPriceService.poolAddresses.set(contractAddress, poolAddress);
            this.hybridPriceService.swapHistory.set(contractAddress, []);
            
            // 🚀 NEW: Restart monitoring with updated token list (single stream approach)
            console.log(`🔄 [RealTimeTokenMonitor] Restarting monitoring to include new token ${tokenData.symbol}`);
            await this.hybridPriceService.stopRealTimeMonitoring();
            await this.hybridPriceService.startRealTimeMonitoring();
            
            console.log(`✅ [RealTimeTokenMonitor] Added token ${tokenData.symbol} to monitoring`);
            return true;
        } else {
            console.log(`⚠️ [RealTimeTokenMonitor] No pool found for token ${tokenData.symbol}`);
            return false;
        }
    }

    // Remove token from monitoring
    async removeToken(tokenAddress) {
        if (!this.hybridPriceService) return;

        this.hybridPriceService.poolAddresses.delete(tokenAddress);
        this.hybridPriceService.swapHistory.delete(tokenAddress);
        
        // 🚀 NEW: Restart monitoring with updated token list (single stream approach)
        console.log(`🔄 [RealTimeTokenMonitor] Restarting monitoring to remove token ${tokenAddress.substring(0, 8)}...`);
        await this.hybridPriceService.stopRealTimeMonitoring();
        await this.hybridPriceService.startRealTimeMonitoring();
        
        console.log(`✅ [RealTimeTokenMonitor] Removed token ${tokenAddress.substring(0, 8)}... from monitoring`);
    }

    // Stop monitoring
    async stopMonitoring() {
        if (!this.isRunning) {
            console.log('⚠️ [RealTimeTokenMonitor] Not running');
            return;
        }

        try {
            console.log('🛑 [RealTimeTokenMonitor] Stopping monitoring...');
            
            this.isRunning = false;
            
            if (this.hybridPriceService) {
                await this.hybridPriceService.shutdown();
            }
            
            console.log('✅ [RealTimeTokenMonitor] Monitoring stopped');
            
        } catch (error) {
            console.error('❌ [RealTimeTokenMonitor] Error stopping monitoring:', error.message);
        }
    }

    // Restart monitoring (useful for reconnection)
    async restartMonitoring() {
        console.log('🔄 [RealTimeTokenMonitor] Restarting monitoring...');
        
        await this.stopMonitoring();
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
        await this.startMonitoring();
        
        console.log('✅ [RealTimeTokenMonitor] Monitoring restarted');
    }
}

export default RealTimeTokenMonitor;

