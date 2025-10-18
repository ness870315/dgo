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
        console.log(`🔌 [WS] Current monitored pools before start:`, Array.from(this.monitoredPools.keys()).map(p => p.substring(0, 8)));
        
        // Check if already monitoring
        if (this.monitoredPools.has(poolAddress)) {
            const poolData = this.monitoredPools.get(poolAddress);
            poolData.userCount++;
            console.log(`🔌 [WS] ✅ CENTRALIZED: Pool ${poolAddress.substring(0, 8)} now has ${poolData.userCount} users (reusing existing WebSocket)`);
            return poolData.subscriptionId;
        }
        
        // Ensure WebSocket connection is fully established
        if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
            console.log(`🔌 [WS] Establishing WebSocket connection...`);
            await this.connect();
            
            // Wait for connection to be fully established
            let attempts = 0;
            while ((!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) && attempts < 10) {
                await new Promise(resolve => setTimeout(resolve, 100));
                attempts++;
            }
            
            if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
                throw new Error('Failed to establish WebSocket connection');
            }
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
        console.log(`🔌 [WS] Current monitored pools:`, Array.from(this.monitoredPools.keys()).map(p => p.substring(0, 8)));
        
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
        if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
            throw new Error('WebSocket not connected');
        }
        
        const requestId = ++this.subscriptionCounter;
        
        const subscribeMessage = {
            "jsonrpc": "2.0",
            "id": requestId,
            "method": "accountSubscribe",
            "params": [
                poolAddress,
                {
                    "encoding": "jsonParsed",
                    "commitment": "finalized"
                }
            ]
        };
        
        console.log(`🔌 [WS] Subscribing to ${poolAddress.substring(0, 8)} with request ID ${requestId}`);
        
        // Store the pending subscription
        this.pendingSubscriptions = this.pendingSubscriptions || new Map();
        this.pendingSubscriptions.set(requestId, poolAddress);
        
        this.ws.send(JSON.stringify(subscribeMessage));
        
        // Wait for subscription confirmation
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.pendingSubscriptions.delete(requestId);
                reject(new Error('Subscription timeout'));
            }, 5000);
            
            // Store the resolve function to be called when we get the confirmation
            this.subscriptionResolvers = this.subscriptionResolvers || new Map();
            this.subscriptionResolvers.set(requestId, { resolve, reject, timeout });
        });
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
            if (message.result && typeof message.result === 'number' && message.id) {
                const requestId = message.id;
                const subscriptionId = message.result;
                
                console.log(`🔌 [WS] ✅ Subscription confirmed: ${subscriptionId} for request ${requestId}`);
                
                // Resolve the pending subscription
                if (this.subscriptionResolvers && this.subscriptionResolvers.has(requestId)) {
                    const { resolve, timeout } = this.subscriptionResolvers.get(requestId);
                    clearTimeout(timeout);
                    this.subscriptionResolvers.delete(requestId);
                    resolve(subscriptionId);
                }
                
                // Update the monitored pool with the actual subscription ID
                if (this.pendingSubscriptions && this.pendingSubscriptions.has(requestId)) {
                    const poolAddress = this.pendingSubscriptions.get(requestId);
                    this.pendingSubscriptions.delete(requestId);
                    
                    if (this.monitoredPools.has(poolAddress)) {
                        this.monitoredPools.get(poolAddress).subscriptionId = subscriptionId;
                    }
                }
                
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
            const txData = await this.extractTransactionData(notification, poolAddress);
            
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
    async extractTransactionData(notification, poolAddress) {
        try {
            const accountData = notification.result.value;
            const slot = notification.result.context?.slot;
            
            console.log(`🔌 [WS] 🔍 Processing account data for slot ${slot}`);
            
            // Get the actual transaction from the slot
            const transaction = await this.getTransactionFromSlot(slot, poolAddress);
            
            if (!transaction) {
                console.log(`🔌 [WS] ⚠️ No transaction found for slot ${slot}`);
                return null;
            }
            
            // Extract swap data from the transaction
            const swapData = await this.extractSwapFromTransaction(transaction, poolAddress);
            
            if (swapData) {
                console.log(`🔌 [WS] ✅ Extracted swap: ${swapData.type} ${swapData.tokenAmount} tokens at $${swapData.price.toFixed(8)}`);
                return swapData;
            }
            
            return null;
            
        } catch (error) {
            console.error('🔌 [WS] ❌ Failed to extract transaction data:', error.message);
            return null;
        }
    }
    
    /**
     * Get transaction from slot using Helius API
     */
    async getTransactionFromSlot(slot, poolAddress) {
        try {
            const response = await fetch(`https://mainnet.helius-rpc.com/?api-key=${this.heliusApiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'getSignaturesForAddress',
                    params: [
                        poolAddress,
                        {
                            limit: 10,
                            commitment: 'confirmed'
                        }
                    ]
                })
            });
            
            const data = await response.json();
            
            if (data.result && data.result.length > 0) {
                // Get the most recent transaction
                const signature = data.result[0].signature;
                
                // Get full transaction details
                const txResponse = await fetch(`https://mainnet.helius-rpc.com/?api-key=${this.heliusApiKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        jsonrpc: '2.0',
                        id: 1,
                        method: 'getTransaction',
                        params: [
                            signature,
                            {
                                encoding: 'jsonParsed',
                                commitment: 'confirmed'
                            }
                        ]
                    })
                });
                
                const txData = await txResponse.json();
                return txData.result;
            }
            
            return null;
            
        } catch (error) {
            console.error('🔌 [WS] ❌ Failed to get transaction from slot:', error.message);
            return null;
        }
    }
    
    /**
     * Extract swap data from transaction
     */
    async extractSwapFromTransaction(transaction, poolAddress) {
        try {
            if (!transaction || !transaction.meta || !transaction.transaction) {
                return null;
            }
            
            const meta = transaction.meta;
            const message = transaction.transaction.message;
            
            // Check if this is a swap transaction
            if (!meta.preTokenBalances || !meta.postTokenBalances) {
                return null;
            }
            
            // Find token transfers
            const preBalances = meta.preTokenBalances;
            const postBalances = meta.postTokenBalances;
            
            // Look for SOL and token balance changes
            let solChange = 0;
            let tokenChange = 0;
            let tokenMint = null;
            
            // Check SOL balance changes
            const preSolBalance = meta.preBalances[0] || 0;
            const postSolBalance = meta.postBalances[0] || 0;
            solChange = postSolBalance - preSolBalance;
            
            // Check token balance changes
            for (let i = 0; i < preBalances.length; i++) {
                const preBalance = preBalances[i];
                const postBalance = postBalances[i];
                
                if (preBalance && postBalance && preBalance.mint === postBalance.mint) {
                    const change = postBalance.uiTokenAmount.uiAmount - preBalance.uiTokenAmount.uiAmount;
                    if (Math.abs(change) > 0) {
                        tokenChange = change;
                        tokenMint = preBalance.mint;
                        break;
                    }
                }
            }
            
            if (solChange === 0 || tokenChange === 0) {
                return null;
            }
            
            // Determine swap type and calculate price
            const isBuy = solChange < 0; // SOL going out = buy
            const solAmount = Math.abs(solChange) / 1e9; // Convert lamports to SOL
            const tokenAmount = Math.abs(tokenChange);
            const price = solAmount / tokenAmount;
            
            return {
                signature: transaction.transaction.signatures[0],
                timestamp: Math.floor(Date.now() / 1000),
                type: isBuy ? 'buy' : 'sell',
                price: price,
                volume: solAmount * 200, // Approximate USD volume
                solAmount: solAmount,
                tokenAmount: tokenAmount,
                tokenMint: tokenMint,
                poolAddress: poolAddress,
                maker: message.accountKeys[0], // First account is usually the maker
                source: 'helius_realtime',
                rawData: JSON.stringify(transaction)
            };
            
        } catch (error) {
            console.error('🔌 [WS] ❌ Failed to extract swap from transaction:', error.message);
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
