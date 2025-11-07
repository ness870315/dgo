/**
 * Solana Vibe Station SSE Price Service
 * 
 * Connects to Solana Vibe Station's /subscribe-price endpoint via Server-Sent Events (SSE)
 * to receive real-time price updates for monitored tokens.
 * 
 * Features:
 * - Real-time price updates via SSE (tested up to 1000 mints)
 * - Automatic reconnection on disconnect
 * - Market cap calculation (price × circulating supply)
 * - Rolling averages (1min, 15min, 1h, 24h)
 * - Health monitoring and failover support
 */

import EventEmitter from 'events';
import fetch from 'node-fetch';

const SOLANA_VIBE_API_BASE = 'https://beta-api.solanavibestation.com';
const SOLANA_VIBE_API_KEY = process.env.SOLANA_VIBE_API_KEY || '';

class SolanaVibeStationSSE extends EventEmitter {
    constructor(tokenMetadataCache) {
        super();
        
        this.tokenMetadataCache = tokenMetadataCache; // Reference to EnhancedHybridPriceService token cache
        this.subscribedMints = new Set();
        this.connection = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.reconnectDelay = 5000; // Start with 5 seconds
        this.maxReconnectDelay = 60000; // Max 1 minute
        this.isConnected = false;
        this.lastMessageTime = null;
        this.healthCheckInterval = null;
        this.reconnectTimeout = null;
        
        // Stats
        this.stats = {
            messagesReceived: 0,
            priceUpdatesProcessed: 0,
            errors: 0,
            reconnections: 0,
            lastError: null,
            connectedAt: null,
            uptime: 0
        };
        
        console.log('✅ [SolanaVibeSSE] Service initialized');
    }

    /**
     * Subscribe to price updates for a list of mints
     */
    async subscribe(mints) {
        if (!Array.isArray(mints) || mints.length === 0) {
            console.warn('⚠️ [SolanaVibeSSE] No mints provided for subscription');
            return false;
        }

        // Add mints to subscription set
        mints.forEach(mint => this.subscribedMints.add(mint));
        
        console.log(`📡 [SolanaVibeSSE] Subscribing to ${this.subscribedMints.size} mints...`);

        // If already connected, we need to reconnect with new mint list
        if (this.isConnected) {
            console.log('🔄 [SolanaVibeSSE] Reconnecting to update subscription...');
            await this.disconnect();
        }

        return await this.connect();
    }

    /**
     * Unsubscribe from specific mints
     */
    async unsubscribe(mints) {
        if (!Array.isArray(mints) || mints.length === 0) {
            return;
        }

        mints.forEach(mint => this.subscribedMints.delete(mint));
        console.log(`📡 [SolanaVibeSSE] Unsubscribed from ${mints.length} mints. Total: ${this.subscribedMints.size}`);

        // Reconnect with updated list
        if (this.isConnected && this.subscribedMints.size > 0) {
            await this.disconnect();
            await this.connect();
        } else if (this.subscribedMints.size === 0) {
            await this.disconnect();
        }
    }

    /**
     * Connect to SSE endpoint
     */
    async connect() {
        try {
            if (this.subscribedMints.size === 0) {
                console.warn('⚠️ [SolanaVibeSSE] No mints to subscribe to');
                return false;
            }

            console.log(`🔌 [SolanaVibeSSE] Connecting to ${SOLANA_VIBE_API_BASE}/subscribe-price...`);

            const mintsArray = Array.from(this.subscribedMints);
            const headers = {
                'Content-Type': 'application/json',
                'Accept': 'text/event-stream'
            };

            // Add API key if provided
            if (SOLANA_VIBE_API_KEY) {
                headers['Authorization'] = SOLANA_VIBE_API_KEY;
            }

            const response = await fetch(`${SOLANA_VIBE_API_BASE}/subscribe-price`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ mints: mintsArray })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            console.log(`✅ [SolanaVibeSSE] Connected successfully (${mintsArray.length} mints)`);

            this.isConnected = true;
            this.reconnectAttempts = 0;
            this.reconnectDelay = 5000; // Reset delay
            this.stats.connectedAt = Date.now();
            this.stats.reconnections++;
            this.lastMessageTime = Date.now();

            // Start processing SSE stream
            this.processStream(response.body);

            // Start health check
            this.startHealthCheck();

            this.emit('connected', { mintCount: mintsArray.length });
            return true;

        } catch (error) {
            console.error('❌ [SolanaVibeSSE] Connection error:', error.message);
            this.stats.errors++;
            this.stats.lastError = error.message;
            this.isConnected = false;
            
            this.emit('error', error);
            
            // Schedule reconnection
            this.scheduleReconnect();
            return false;
        }
    }

    /**
     * Process SSE stream
     */
    async processStream(stream) {
        try {
            let buffer = '';

            for await (const chunk of stream) {
                if (!this.isConnected) {
                    break; // Stop processing if disconnected
                }

                buffer += chunk.toString();
                const lines = buffer.split('\n');
                buffer = lines.pop(); // Keep incomplete line in buffer

                for (const line of lines) {
                    if (line.startsWith('event:')) {
                        const eventType = line.substring(6).trim();
                        
                        if (eventType === 'connected') {
                            console.log('✅ [SolanaVibeSSE] Received connected event');
                        }
                    } else if (line.startsWith('data:')) {
                        const data = line.substring(5).trim();
                        
                        if (data) {
                            try {
                                const parsed = JSON.parse(data);
                                this.handleMessage(parsed);
                            } catch (parseError) {
                                console.error('❌ [SolanaVibeSSE] JSON parse error:', parseError.message);
                            }
                        }
                    }
                }

                this.lastMessageTime = Date.now();
            }

            // Stream ended
            console.warn('⚠️ [SolanaVibeSSE] Stream ended');
            this.handleDisconnect();

        } catch (error) {
            console.error('❌ [SolanaVibeSSE] Stream processing error:', error.message);
            this.stats.errors++;
            this.stats.lastError = error.message;
            this.handleDisconnect();
        }
    }

    /**
     * Handle incoming SSE message
     */
    handleMessage(message) {
        try {
            this.stats.messagesReceived++;

            // Message format: { sequence_number, json_data: [{ delete, insert }] }
            if (!message.json_data || !Array.isArray(message.json_data)) {
                return;
            }

            for (const operation of message.json_data) {
                // Process insert operations (new price data)
                if (operation.insert) {
                    this.processPriceUpdate(operation.insert);
                }
            }

        } catch (error) {
            console.error('❌ [SolanaVibeSSE] Message handling error:', error.message);
            this.stats.errors++;
        }
    }

    /**
     * Process price update from SSE
     */
    processPriceUpdate(priceData) {
        try {
            // Price data format:
            // {
            //   base_mint: "...",
            //   quote_mint: "...",
            //   latest_price: 0.00123,
            //   avg_price_1min: 0.00122,
            //   avg_price_15min: 0.00121,
            //   avg_price_1h: 0.00120,
            //   avg_price_24h: 0.00119
            // }

            const mint = priceData.base_mint;
            const price = priceData.latest_price;

            if (!mint || !price || price <= 0) {
                return; // Invalid price data
            }

            // Get token metadata from cache (includes circulating supply from Jupiter)
            const tokenInfo = this.tokenMetadataCache.get(mint);
            const circSupply = tokenInfo?.jupiterData?.circSupply || 
                              tokenInfo?.circSupply || 
                              tokenInfo?.supply || 
                              0;

            // Calculate market cap: price × circulating supply
            const marketCap = (price > 0 && circSupply > 0) ? (price * circSupply) : 0;

            // Emit price update event
            this.emit('priceUpdate', {
                mint,
                price,
                marketCap,
                priceSol: null, // SSE doesn't provide SOL price directly
                avgPrice1min: priceData.avg_price_1min || price,
                avgPrice15min: priceData.avg_price_15min || price,
                avgPrice1h: priceData.avg_price_1h || price,
                avgPrice24h: priceData.avg_price_24h || price,
                quoteMint: priceData.quote_mint,
                source: 'sse',
                timestamp: Date.now()
            });

            this.stats.priceUpdatesProcessed++;

            // Log every 100 updates
            if (this.stats.priceUpdatesProcessed % 100 === 0) {
                console.log(`📊 [SolanaVibeSSE] Processed ${this.stats.priceUpdatesProcessed} price updates`);
            }

        } catch (error) {
            console.error('❌ [SolanaVibeSSE] Price update processing error:', error.message);
            this.stats.errors++;
        }
    }

    /**
     * Handle disconnection
     */
    handleDisconnect() {
        if (!this.isConnected) {
            return; // Already disconnected
        }

        console.warn('⚠️ [SolanaVibeSSE] Disconnected');
        this.isConnected = false;
        this.stopHealthCheck();
        
        this.emit('disconnected');
        
        // Schedule reconnection
        this.scheduleReconnect();
    }

    /**
     * Schedule reconnection with exponential backoff
     */
    scheduleReconnect() {
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
        }

        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error(`❌ [SolanaVibeSSE] Max reconnection attempts (${this.maxReconnectAttempts}) reached`);
            this.emit('maxReconnectAttemptsReached');
            return;
        }

        this.reconnectAttempts++;
        const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), this.maxReconnectDelay);
        
        console.log(`🔄 [SolanaVibeSSE] Reconnecting in ${(delay / 1000).toFixed(1)}s (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);

        this.reconnectTimeout = setTimeout(async () => {
            await this.connect();
        }, delay);
    }

    /**
     * Start health check (detect stale connections)
     */
    startHealthCheck() {
        this.stopHealthCheck();

        this.healthCheckInterval = setInterval(() => {
            const now = Date.now();
            const timeSinceLastMessage = now - (this.lastMessageTime || now);

            // If no messages for 60 seconds, consider connection stale
            if (timeSinceLastMessage > 60000) {
                console.warn(`⚠️ [SolanaVibeSSE] No messages for ${(timeSinceLastMessage / 1000).toFixed(0)}s - reconnecting...`);
                this.handleDisconnect();
            }

            // Update uptime
            if (this.stats.connectedAt) {
                this.stats.uptime = now - this.stats.connectedAt;
            }

        }, 30000); // Check every 30 seconds
    }

    /**
     * Stop health check
     */
    stopHealthCheck() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }
    }

    /**
     * Disconnect from SSE
     */
    async disconnect() {
        console.log('🔌 [SolanaVibeSSE] Disconnecting...');
        
        this.isConnected = false;
        this.stopHealthCheck();
        
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }

        if (this.connection) {
            try {
                this.connection.destroy();
            } catch (error) {
                // Ignore errors during disconnect
            }
            this.connection = null;
        }

        console.log('✅ [SolanaVibeSSE] Disconnected');
    }

    /**
     * Get service status
     */
    getStatus() {
        return {
            isConnected: this.isConnected,
            subscribedMints: this.subscribedMints.size,
            reconnectAttempts: this.reconnectAttempts,
            stats: {
                ...this.stats,
                uptime: this.stats.connectedAt ? Date.now() - this.stats.connectedAt : 0
            },
            lastMessageTime: this.lastMessageTime,
            timeSinceLastMessage: this.lastMessageTime ? Date.now() - this.lastMessageTime : null
        };
    }

    /**
     * Reset stats
     */
    resetStats() {
        this.stats = {
            messagesReceived: 0,
            priceUpdatesProcessed: 0,
            errors: 0,
            reconnections: 0,
            lastError: null,
            connectedAt: this.stats.connectedAt,
            uptime: 0
        };
        console.log('📊 [SolanaVibeSSE] Stats reset');
    }
}

export default SolanaVibeStationSSE;

