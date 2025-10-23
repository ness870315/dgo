import { readFile } from 'fs/promises';
import path from 'path';
import { EventEmitter } from 'events';
import EnhancedHybridPriceService from './EnhancedHybridPriceService.js';

/**
 * Real-Time Token Monitor (Deployment-Safe Version)
 * Monitors all cached tokens using REST API polling instead of gRPC
 */
class RealTimeTokenMonitor extends EventEmitter {
    constructor(backendWebSocketServer) {
        super();
        this.backendWebSocketServer = backendWebSocketServer;
        this.hybridPriceService = new EnhancedHybridPriceService();
        this.isMonitoring = false;
        this.monitoredTokens = new Map();
        this.stats = {
            totalTokens: 0,
            activeTokens: 0,
            totalSwaps: 0,
            lastUpdate: null,
            errors: 0
        };
    }

    /**
     * Initialize the monitor
     */
    async initialize() {
        try {
            console.log('🚀 [RealTimeTokenMonitor] Initializing deployment-safe real-time monitor...');
            
            // Initialize the hybrid price service
            await this.hybridPriceService.initialize();
            
            // Set up event listeners
            this.hybridPriceService.on('swapUpdate', (data) => {
                this.handleSwapUpdate(data);
            });

            console.log('✅ [RealTimeTokenMonitor] Initialized successfully');
            return true;
        } catch (error) {
            console.error('❌ [RealTimeTokenMonitor] Failed to initialize:', error.message);
            this.stats.errors++;
            return false;
        }
    }

    /**
     * Start monitoring all cached tokens
     */
    async startMonitoring() {
        if (this.isMonitoring) {
            console.log('⚠️ [RealTimeTokenMonitor] Already monitoring');
            return;
        }

        try {
            console.log('🚀 [RealTimeTokenMonitor] Starting token monitoring...');
            
            // Load tokens from cache
            await this.loadCachedTokens();
            
            // Start real-time monitoring
            await this.hybridPriceService.startRealTimeMonitoring();
            
            this.isMonitoring = true;
            console.log(`✅ [RealTimeTokenMonitor] Started monitoring ${this.monitoredTokens.size} tokens`);
            
        } catch (error) {
            console.error('❌ [RealTimeTokenMonitor] Failed to start monitoring:', error.message);
            this.stats.errors++;
        }
    }

    /**
     * Load tokens from the cache file
     */
    async loadCachedTokens() {
        try {
            const cachePath = path.join(process.cwd(), 'backend', 'cache', 'tokens-cache.json');
            const data = await readFile(cachePath, 'utf8');
            const tokens = JSON.parse(data);

            console.log(`📊 [RealTimeTokenMonitor] Loading ${tokens.length} tokens from cache...`);

            for (const token of tokens) {
                if (token.contractAddress) {
                    await this.addToken(token);
                }
            }

            this.stats.totalTokens = tokens.length;
            this.stats.activeTokens = this.monitoredTokens.size;
            
        } catch (error) {
            console.error('❌ [RealTimeTokenMonitor] Failed to load cached tokens:', error.message);
            this.stats.errors++;
        }
    }

    /**
     * Add a token for monitoring
     */
    async addToken(tokenData) {
        const contractAddress = tokenData.contractAddress;
        
        if (this.monitoredTokens.has(contractAddress)) {
            console.log(`⚠️ [RealTimeTokenMonitor] Token ${tokenData.symbol} already being monitored`);
            return false;
        }

        try {
            const added = await this.hybridPriceService.addToken(tokenData);
            
            if (added) {
                this.monitoredTokens.set(contractAddress, {
                    symbol: tokenData.symbol,
                    name: tokenData.name,
                    addedAt: Date.now()
                });
                
                console.log(`✅ [RealTimeTokenMonitor] Added token ${tokenData.symbol} to monitoring`);
                this.emit('tokenAdded', { symbol: tokenData.symbol, contractAddress });
                return true;
            }
            
            return false;
        } catch (error) {
            console.error(`❌ [RealTimeTokenMonitor] Failed to add token ${tokenData.symbol}:`, error.message);
            this.stats.errors++;
            return false;
        }
    }

    /**
     * Remove a token from monitoring
     */
    async removeToken(tokenAddress) {
        if (!this.monitoredTokens.has(tokenAddress)) {
            console.log(`⚠️ [RealTimeTokenMonitor] Token ${tokenAddress.substring(0, 8)}... not being monitored`);
            return false;
        }

        try {
            await this.hybridPriceService.removeToken(tokenAddress);
            this.monitoredTokens.delete(tokenAddress);
            
            console.log(`✅ [RealTimeTokenMonitor] Removed token ${tokenAddress.substring(0, 8)}... from monitoring`);
            this.emit('tokenRemoved', { contractAddress: tokenAddress });
            return true;
        } catch (error) {
            console.error(`❌ [RealTimeTokenMonitor] Failed to remove token ${tokenAddress}:`, error.message);
            this.stats.errors++;
            return false;
        }
    }

    /**
     * Handle swap updates from the hybrid price service
     */
    handleSwapUpdate(data) {
        try {
            const { tokenAddress, swap } = data;
            
            // Update stats
            this.stats.totalSwaps++;
            this.stats.lastUpdate = new Date().toISOString();
            
            // Broadcast to WebSocket clients
            if (this.backendWebSocketServer) {
                this.backendWebSocketServer.broadcastSwapUpdate(tokenAddress, {
                    ...swap,
                    timestamp: Date.now()
                });
            }
            
            // Emit event for other services
            this.emit('swapUpdate', data);
            
        } catch (error) {
            console.error('❌ [RealTimeTokenMonitor] Error handling swap update:', error.message);
            this.stats.errors++;
        }
    }

    /**
     * Stop monitoring
     */
    async stopMonitoring() {
        if (!this.isMonitoring) {
            console.log('⚠️ [RealTimeTokenMonitor] Not currently monitoring');
            return;
        }

        try {
            console.log('🛑 [RealTimeTokenMonitor] Stopping monitoring...');
            
            // Stop the hybrid price service
            this.hybridPriceService.stopRealTimeMonitoring();
            
            // Clear monitored tokens
            this.monitoredTokens.clear();
            
            this.isMonitoring = false;
            console.log('✅ [RealTimeTokenMonitor] Monitoring stopped');
            
        } catch (error) {
            console.error('❌ [RealTimeTokenMonitor] Error stopping monitoring:', error.message);
            this.stats.errors++;
        }
    }

    /**
     * Get monitoring statistics
     */
    getStats() {
        return {
            ...this.stats,
            isMonitoring: this.isMonitoring,
            monitoredTokens: Array.from(this.monitoredTokens.entries()).map(([address, data]) => ({
                contractAddress: address,
                symbol: data.symbol,
                name: data.name,
                addedAt: data.addedAt
            })),
            hybridPriceStats: this.hybridPriceService.getRealTimeStats()
        };
    }

    /**
     * Get swap history for a token
     */
    getSwapHistory(tokenAddress, limit = 50) {
        return this.hybridPriceService.getSwapHistory(tokenAddress, limit);
    }
}

export default RealTimeTokenMonitor;