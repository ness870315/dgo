import EnhancedHybridPriceService from './EnhancedHybridPriceService.mjs';
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
        
        // Cache paths
        this.cachePath = path.join(process.cwd(), 'cache', 'tokens-cache.json');
        this.backupCachePath = path.join(process.cwd(), 'cache', 'tokens-cache-backup.json');
    }

    async initialize() {
        try {
            console.log('🚀 [RealTimeTokenMonitor] Initializing...');
            
            // Initialize Enhanced HybridPriceService
            this.hybridPriceService = new EnhancedHybridPriceService(this.webSocketServer);
            
            // Wait for gRPC client to initialize
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Load token cache
            await this.loadTokenCache();
            
            console.log('✅ [RealTimeTokenMonitor] Initialization complete');
            
        } catch (error) {
            console.error('❌ [RealTimeTokenMonitor] Failed to initialize:', error.message);
            throw error;
        }
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
        const realTimeStats = this.hybridPriceService.getRealTimeStats();
        
        console.log('\n📊 [RealTimeTokenMonitor] STATS REPORT');
        console.log('============================================================');
        console.log(`⏰ Runtime: ${runtime} seconds`);
        console.log(`📈 Total Tokens: ${this.monitoringStats.totalTokens}`);
        console.log(`🔌 Active Streams: ${realTimeStats.activeStreams.length}`);
        console.log(`💰 Total Swaps: ${this.monitoringStats.totalSwaps}`);
        console.log(`📊 Price Updates: ${this.monitoringStats.totalPriceUpdates}`);
        console.log(`❌ Errors: ${this.monitoringStats.errors}`);
        console.log(`⚡ Swaps/sec: ${(this.monitoringStats.totalSwaps / runtime).toFixed(2)}`);
        console.log(`📈 Updates/sec: ${(this.monitoringStats.totalPriceUpdates / runtime).toFixed(2)}`);
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

