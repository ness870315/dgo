import WebSocket from 'ws';

/**
 * Real-time Transaction WebSocket Service
 * Monitors pool addresses for live swap transactions
 * Integrates with ChartBackgroundWorker for immediate data storage
 */
class RealTimeTransactionService {
    constructor(heliusApiKey, chartBackgroundWorker) {
        this.heliusApiKey = heliusApiKey;
        this.chartBackgroundWorker = chartBackgroundWorker;
        this.wsUrl = `wss://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`;
        
        // Connection management
        this.ws = null;
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 5000; // 5 seconds
        
        // Pool monitoring
        this.monitoredPools = new Map(); // poolAddress -> { subscriptionId, userCount, lastActivity }
        this.subscriptionCounter = 0;
        
        // Statistics
        this.stats = {
            totalConnections: 0,
            totalTransactions: 0,
            totalReconnects: 0,
            poolsMonitored: 0
        };
        
        console.log('🔌 RealTimeTransactionService initialized');
        console.log(`   WebSocket URL: ${this.wsUrl.substring(0, 50)}...`);
        console.log(`   Chart Background Worker: ${chartBackgroundWorker ? 'Connected' : 'Not connected'}`);
    }

    /**
     * Start monitoring a pool address
     * Called when a user opens a chart
     */
    async startMonitoringPool(poolAddress, tokenAddress) {
        console.log(`🔌 [WS] Starting monitoring for ${poolAddress.substring(0, 8)} (${tokenAddress.substring(0, 8)})`);
        
        // Check if already monitoring
        if (this.monitoredPools.has(poolAddress)) {
            const poolData = this.monitoredPools.get(poolAddress);
            poolData.userCount++;
            console.log(`🔌 [WS] ✅ CENTRALIZED: Pool ${poolAddress.substring(0, 8)} now has ${poolData.userCount} users (reusing existing WebSocket)`);
            return poolData.subscriptionId;
        }
        
        // Ensure WebSocket connection
        if (!this.isConnected) {
            await this.connect();
        }
        
        // Subscribe to account changes
        const subscriptionId = await this.subscribeToPool(poolAddress);
        
        // Track this pool
        this.monitoredPools.set(poolAddress, {
            subscriptionId,
            userCount: 1,
            tokenAddress,
            lastActivity: Date.now(),
            transactionsReceived: 0
        });
        
        this.stats.poolsMonitored = this.monitoredPools.size;
        console.log(`🔌 [WS] ✅ Now monitoring ${this.monitoredPools.size} pools`);
        
        return subscriptionId;
    }

    /**
     * Stop monitoring a pool address
     * Called when a user closes a chart
     */
    async stopMonitoringPool(poolAddress) {
        console.log(`🔌 [WS] Stopping monitoring for ${poolAddress.substring(0, 8)}`);
        
        const poolData = this.monitoredPools.get(poolAddress);
        if (!poolData) {
            console.log(`🔌 [WS] ⚠️ Pool ${poolAddress.substring(0, 8)} not being monitored`);
            return;
        }
        
        // Decrease user count
        poolData.userCount--;
        console.log(`🔌 [WS] ✅ CENTRALIZED: Pool ${poolAddress.substring(0, 8)} now has ${poolData.userCount} users (WebSocket still active)`);
        
        // If no more users, unsubscribe
        if (poolData.userCount <= 0) {
            console.log(`🔌 [WS] 🛑 LAST USER: No more users for ${poolAddress.substring(0, 8)}, unsubscribing...`);
            
            if (this.isConnected && poolData.subscriptionId) {
                await this.unsubscribeFromPool(poolData.subscriptionId);
            }
            
            this.monitoredPools.delete(poolAddress);
            this.stats.poolsMonitored = this.monitoredPools.size;
            console.log(`🔌 [WS] ✅ Now monitoring ${this.monitoredPools.size} pools`);
            
            // If no pools left, close connection
            if (this.monitoredPools.size === 0) {
                console.log(`🔌 [WS] No pools left, closing connection...`);
                this.disconnect();
            }
        }
    }

    /**
     * Connect to Helius WebSocket
     */
    async connect() {
        return new Promise((resolve, reject) => {
            try {
                console.log('🔌 [WS] Connecting to Helius WebSocket...');
                
                this.ws = new WebSocket(this.wsUrl);
                
                this.ws.on('open', () => {
                    console.log('🔌 [WS] ✅ Connected to Helius WebSocket');
                    this.isConnected = true;
                    this.reconnectAttempts = 0;
                    this.stats.totalConnections++;
                    
                    // Set up ping to keep connection alive
                    this.startPingInterval();
                    
                    resolve();
                });
                
                this.ws.on('message', (data) => {
                    this.handleMessage(data);
                });
                
                this.ws.on('error', (error) => {
                    console.error('🔌 [WS] ❌ WebSocket error:', error.message);
                    this.isConnected = false;
                });
                
                this.ws.on('close', (code, reason) => {
                    console.log(`🔌 [WS] Connection closed. Code: ${code}, Reason: ${reason}`);
                    this.isConnected = false;
                    this.handleReconnect();
                });
                
            } catch (error) {
                console.error('🔌 [WS] ❌ Failed to connect:', error.message);
                reject(error);
            }
        });
    }

    /**
     * Disconnect from WebSocket
     */
    disconnect() {
        if (this.ws) {
            console.log('🔌 [WS] Disconnecting...');
            this.ws.close();
            this.ws = null;
            this.isConnected = false;
        }
    }

    /**
     * Subscribe to account changes for a pool
     */
    async subscribeToPool(poolAddress) {
        if (!this.isConnected) {
            throw new Error('WebSocket not connected');
        }
        
        const subscriptionId = ++this.subscriptionCounter;
        
        const subscribeMessage = {
            "jsonrpc": "2.0",
            "id": subscriptionId,
            "method": "accountSubscribe",
            "params": [
                poolAddress,
                {
                    "encoding": "jsonParsed",
                    "commitment": "finalized"
                }
            ]
        };
        
        console.log(`🔌 [WS] Subscribing to ${poolAddress.substring(0, 8)} with ID ${subscriptionId}`);
        this.ws.send(JSON.stringify(subscribeMessage));
        
        return subscriptionId;
    }

    /**
     * Unsubscribe from account changes
     */
    async unsubscribeFromPool(subscriptionId) {
        if (!this.isConnected) {
            return;
        }
        
        const unsubscribeMessage = {
            "jsonrpc": "2.0",
            "id": subscriptionId + 1000, // Different ID to avoid conflicts
            "method": "accountUnsubscribe",
            "params": [subscriptionId]
        };
        
        console.log(`🔌 [WS] Unsubscribing from subscription ${subscriptionId}`);
        this.ws.send(JSON.stringify(unsubscribeMessage));
    }

    /**
     * Handle incoming WebSocket messages
     */
    handleMessage(data) {
        try {
            const message = JSON.parse(data.toString());
            
            // Handle subscription confirmation
            if (message.result && typeof message.result === 'number') {
                console.log(`🔌 [WS] ✅ Subscription confirmed: ${message.result}`);
                return;
            }
            
            // Handle account notifications (real-time transactions)
            if (message.method === 'accountNotification') {
                this.handleAccountNotification(message);
            }
            
            // Handle unsubscribe confirmation
            if (message.result === true) {
                console.log(`🔌 [WS] ✅ Unsubscribed successfully`);
            }
            
        } catch (error) {
            console.error('🔌 [WS] ❌ Failed to parse message:', error.message);
        }
    }

    /**
     * Handle real-time account notifications
     */
    async handleAccountNotification(message) {
        try {
            const notification = message.params;
            const subscriptionId = notification.subscription;
            
            // Find which pool this notification is for
            let poolAddress = null;
            for (const [address, poolData] of this.monitoredPools.entries()) {
                if (poolData.subscriptionId === subscriptionId) {
                    poolAddress = address;
                    break;
                }
            }
            
            if (!poolAddress) {
                console.log(`🔌 [WS] ⚠️ Received notification for unknown subscription ${subscriptionId}`);
                return;
            }
            
            const poolData = this.monitoredPools.get(poolAddress);
            poolData.lastActivity = Date.now();
            poolData.transactionsReceived++;
            this.stats.totalTransactions++;
            
            console.log(`🔌 [WS] 🚨 Real-time transaction detected for ${poolAddress.substring(0, 8)}`);
            console.log(`🔌 [WS] 📊 Slot: ${notification.result.context?.slot}`);
            
            // Extract transaction data
            const txData = this.extractTransactionData(notification, poolAddress);
            
            if (txData) {
                // Store immediately in background worker
                await this.storeRealTimeTransaction(txData, poolAddress);
            }
            
        } catch (error) {
            console.error('🔌 [WS] ❌ Failed to handle account notification:', error.message);
        }
    }

    /**
     * Extract transaction data from account notification
     */
    extractTransactionData(notification, poolAddress) {
        try {
            const accountData = notification.result.value;
            
            // For now, we'll create a basic transaction record
            // In a full implementation, you'd parse the account data to extract swap details
            const txData = {
                signature: `realtime_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                timestamp: Math.floor(Date.now() / 1000),
                poolAddress: poolAddress,
                slot: accountData.context?.slot,
                lamports: accountData.lamports,
                owner: accountData.owner,
                space: accountData.space,
                source: 'websocket_realtime',
                rawData: JSON.stringify(accountData)
            };
            
            return txData;
            
        } catch (error) {
            console.error('🔌 [WS] ❌ Failed to extract transaction data:', error.message);
            return null;
        }
    }

    /**
     * Store real-time transaction in background worker
     */
    async storeRealTimeTransaction(txData, poolAddress) {
        try {
            if (this.chartBackgroundWorker) {
                // Convert to swap format and store
                const swapData = {
                    signature: txData.signature,
                    timestamp: txData.timestamp,
                    poolAddress: poolAddress,
                    price: 0, // Will be calculated by background worker
                    volume: 0, // Will be calculated by background worker
                    source: 'websocket_realtime',
                    rawData: txData.rawData
                };
                
                // Store in database immediately
                await this.chartBackgroundWorker.chartDb.storeSwaps([swapData]);
                
                // Update candles for all timeframes
                const timeframes = ['1MIN', '5MIN', '15MIN', '1H', '4H', '1D'];
                for (const timeframe of timeframes) {
                    await this.chartBackgroundWorker.chartDb.updateCandles(poolAddress, timeframe);
                }
                
                console.log(`🔌 [WS] ✅ Stored real-time transaction for ${poolAddress.substring(0, 8)}`);
                
            } else {
                console.log(`🔌 [WS] ⚠️ No background worker available to store transaction`);
            }
            
        } catch (error) {
            console.error('🔌 [WS] ❌ Failed to store real-time transaction:', error.message);
        }
    }

    /**
     * Handle reconnection logic
     */
    async handleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.log(`🔌 [WS] ❌ Max reconnection attempts reached, giving up`);
            return;
        }
        
        this.reconnectAttempts++;
        this.stats.totalReconnects++;
        
        console.log(`🔌 [WS] 🔄 Attempting reconnection ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${this.reconnectDelay}ms...`);
        
        setTimeout(async () => {
            try {
                await this.connect();
                
                // Re-subscribe to all monitored pools
                for (const [poolAddress, poolData] of this.monitoredPools.entries()) {
                    const newSubscriptionId = await this.subscribeToPool(poolAddress);
                    poolData.subscriptionId = newSubscriptionId;
                }
                
                console.log(`🔌 [WS] ✅ Reconnected and re-subscribed to ${this.monitoredPools.size} pools`);
                
            } catch (error) {
                console.error(`🔌 [WS] ❌ Reconnection failed:`, error.message);
                this.handleReconnect();
            }
        }, this.reconnectDelay);
    }

    /**
     * Start ping interval to keep connection alive
     */
    startPingInterval() {
        setInterval(() => {
            if (this.ws && this.isConnected) {
                this.ws.ping();
            }
        }, 30000); // Ping every 30 seconds
    }

    /**
     * Get service statistics
     */
    getStats() {
        return {
            ...this.stats,
            isConnected: this.isConnected,
            monitoredPools: this.monitoredPools.size,
            poolDetails: Array.from(this.monitoredPools.entries()).map(([address, data]) => ({
                poolAddress: address.substring(0, 8) + '...',
                userCount: data.userCount,
                transactionsReceived: data.transactionsReceived,
                lastActivity: new Date(data.lastActivity).toISOString()
            }))
        };
    }
}

export default RealTimeTransactionService;
