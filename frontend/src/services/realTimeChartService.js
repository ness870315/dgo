/**
 * Real-time Chart Service for Frontend
 * Handles live updates and chart streaming
 */
class RealTimeChartService {
    constructor() {
        this.API_BASE = process.env.NODE_ENV === 'production' 
            ? 'https://api.degen-oracle.com' 
            : 'http://localhost:3001';
        
        this.pollingInterval = 2000; // Poll every 2 seconds
        this.isPolling = false;
        this.pollingTokens = new Set();
        this.lastUpdateTimestamps = new Map();
        this.updateCallbacks = new Map();
        
        console.log('📡 RealTimeChartService initialized');
        console.log(`   API Base: ${this.API_BASE}`);
        console.log(`   Polling Interval: ${this.pollingInterval}ms`);
    }

    /**
     * Start real-time updates for a token
     */
    startLiveUpdates(tokenAddress, callback) {
        console.log(`📡 [FRONTEND] Starting live updates for ${tokenAddress.substring(0, 8)}...`);
        
        this.pollingTokens.add(tokenAddress);
        this.updateCallbacks.set(tokenAddress, callback);
        
        if (!this.isPolling) {
            this.startPolling();
        }
        
        console.log(`📡 [FRONTEND] ✅ Live updates started for ${tokenAddress.substring(0, 8)}`);
    }

    /**
     * Stop real-time updates for a token
     */
    stopLiveUpdates(tokenAddress) {
        console.log(`📡 [FRONTEND] Stopping live updates for ${tokenAddress.substring(0, 8)}...`);
        
        // Notify backend to stop WebSocket monitoring
        this.notifyBackendChartClose(tokenAddress).catch(error => {
            console.error(`📡 [FRONTEND] Failed to notify backend of chart close:`, error.message);
        });
        
        this.pollingTokens.delete(tokenAddress);
        this.updateCallbacks.delete(tokenAddress);
        this.lastUpdateTimestamps.delete(tokenAddress);
        
        if (this.pollingTokens.size === 0) {
            this.stopPolling();
        }
        
        console.log(`📡 [FRONTEND] ✅ Live updates stopped for ${tokenAddress.substring(0, 8)}`);
    }

    /**
     * Notify backend that chart is being closed
     */
    async notifyBackendChartClose(tokenAddress) {
        try {
            const url = `${this.API_BASE}/api/tokens/${tokenAddress}/close-chart`;
            console.log(`📡 [FRONTEND] Notifying backend of chart close: ${url}`);
            
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            console.log(`📡 [FRONTEND] ✅ Backend notified:`, data.message);
            
        } catch (error) {
            console.error(`📡 [FRONTEND] ❌ Failed to notify backend:`, error.message);
            throw error;
        }
    }

    /**
     * Start polling for updates
     */
    startPolling() {
        if (this.isPolling) return;
        
        console.log(`📡 [FRONTEND] Starting polling for ${this.pollingTokens.size} tokens...`);
        this.isPolling = true;
        
        this.pollingIntervalId = setInterval(async () => {
            await this.pollForUpdates();
        }, this.pollingInterval);
    }

    /**
     * Stop polling for updates
     */
    stopPolling() {
        if (!this.isPolling) return;
        
        console.log(`📡 [FRONTEND] Stopping polling...`);
        this.isPolling = false;
        
        if (this.pollingIntervalId) {
            clearInterval(this.pollingIntervalId);
            this.pollingIntervalId = null;
        }
    }

    /**
     * Poll for updates from all monitored tokens
     */
    async pollForUpdates() {
        if (this.pollingTokens.size === 0) return;
        
        const promises = Array.from(this.pollingTokens).map(tokenAddress => 
            this.fetchUpdatesForToken(tokenAddress)
        );
        
        try {
            await Promise.all(promises);
        } catch (error) {
            console.error(`📡 [FRONTEND] ❌ Polling error:`, error.message);
        }
    }

    /**
     * Fetch updates for a specific token
     */
    async fetchUpdatesForToken(tokenAddress) {
        try {
            const lastTimestamp = this.lastUpdateTimestamps.get(tokenAddress);
            const url = `${this.API_BASE}/api/tokens/${tokenAddress}/live-updates${lastTimestamp ? `?sinceTimestamp=${lastTimestamp}` : ''}`;
            
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.success && data.updates) {
                const { newSwaps, latestCandles, timestamp } = data.updates;
                
                // Update timestamp
                this.lastUpdateTimestamps.set(tokenAddress, Date.now());
                
                // Call the update callback if there are new updates
                if (newSwaps.length > 0 || Object.keys(latestCandles).length > 0) {
                    const callback = this.updateCallbacks.get(tokenAddress);
                    if (callback) {
                        callback({
                            tokenAddress,
                            newSwaps,
                            latestCandles,
                            timestamp,
                            metadata: data.metadata
                        });
                    }
                    
                    console.log(`📡 [FRONTEND] ✅ Updated ${tokenAddress.substring(0, 8)}: ${newSwaps.length} swaps, ${Object.keys(latestCandles).length} candles`);
                }
            }
            
        } catch (error) {
            console.error(`📡 [FRONTEND] ❌ Failed to fetch updates for ${tokenAddress.substring(0, 8)}:`, error.message);
        }
    }

    /**
     * Get current polling status
     */
    getStatus() {
        return {
            isPolling: this.isPolling,
            pollingTokens: Array.from(this.pollingTokens),
            tokensCount: this.pollingTokens.size,
            pollingInterval: this.pollingInterval
        };
    }
}

export default RealTimeChartService;
