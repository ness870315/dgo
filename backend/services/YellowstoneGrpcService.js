/**
 * Yellowstone gRPC Service for Real-Time Pool Monitoring
 * Replaces the current RPC polling approach with streaming data
 */

import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';
import axios from 'axios';

class YellowstoneGrpcService {
    constructor() {
        this.client = null;
        this.subscriptions = new Map();
        this.poolData = new Map();
        this.isConnected = false;
        
        // Updated to new Constant K gRPC endpoint (Nov 2025)
        this.endpoint = 'http://grpc.constant-k.com/';
        this.apiKey = process.env.CONSTANT_K_API_KEY || '39facrmt-om2u-4al5-5k4h-g8pls2y5vhui';
        
        console.log(`🔗 [Yellowstone gRPC] Endpoint: ${this.endpoint}`);
        console.log(`🔑 [Yellowstone gRPC] API Key: ${this.apiKey ? 'SET' : 'MISSING'}`);
        
        // Load protobuf definitions
        this.protoPath = './protos/yellowstone.proto';
        this.packageDefinition = null;
        
        console.log('🔗 [Yellowstone gRPC] Service initialized');
    }

    async initialize() {
        try {
            // Load protobuf definitions
            this.packageDefinition = protoLoader.loadSync(this.protoPath, {
                keepCase: true,
                longs: String,
                enums: String,
                defaults: true,
                oneofs: true
            });

            // Create gRPC client
            const protoDescriptor = grpc.loadPackageDefinition(this.packageDefinition);
            this.client = new protoDescriptor.geyser.Geyser(
                this.endpoint,
                grpc.credentials.createInsecure()
            );

            // Set up authentication metadata
            this.metadata = new grpc.Metadata();
            this.metadata.add('authorization', `Bearer ${this.apiKey}`);

            this.isConnected = true;
            console.log('✅ [Yellowstone gRPC] Client initialized and connected');

        } catch (error) {
            console.error('❌ [Yellowstone gRPC] Failed to initialize:', error.message);
            throw error;
        }
    }

    /**
     * Subscribe to specific pool accounts for real-time updates
     */
    async subscribeToPool(poolAddress, tokenAddress) {
        try {
            if (!this.isConnected) {
                await this.initialize();
            }

            console.log(`🔗 [Yellowstone gRPC] Subscribing to pool: ${poolAddress}`);

            const subscriptionRequest = {
                accounts: [poolAddress],
                owner: [], // Empty = all owners
                filters: [
                    {
                        memcmp: {
                            offset: 0,
                            base58: poolAddress
                        }
                    }
                ],
                commitment: 'confirmed'
            };

            // Create streaming subscription
            const call = this.client.SubscribeAccountUpdates(subscriptionRequest, this.metadata);
            
            call.on('data', (update) => {
                this.handlePoolUpdate(update, tokenAddress);
            });

            call.on('error', (error) => {
                console.error(`❌ [Yellowstone gRPC] Subscription error for ${poolAddress}:`, error.message);
            });

            call.on('end', () => {
                console.log(`⚠️ [Yellowstone gRPC] Subscription ended for ${poolAddress}`);
            });

            // Store subscription for cleanup
            this.subscriptions.set(poolAddress, call);

            console.log(`✅ [Yellowstone gRPC] Subscribed to pool: ${poolAddress}`);

        } catch (error) {
            console.error(`❌ [Yellowstone gRPC] Failed to subscribe to pool ${poolAddress}:`, error.message);
            throw error;
        }
    }

    /**
     * Handle real-time pool updates
     */
    handlePoolUpdate(update, tokenAddress) {
        try {
            const accountData = update.account;
            const poolAddress = update.pubkey;
            
            console.log(`📊 [Yellowstone gRPC] Pool update received for ${poolAddress}`);

            // Parse pool data based on DEX type
            const poolInfo = this.parsePoolData(accountData.data, tokenAddress);
            
            if (poolInfo) {
                // Calculate real-time price
                const priceData = this.calculateRealTimePrice(poolInfo, tokenAddress);
                
                // Store latest data
                this.poolData.set(tokenAddress, {
                    ...priceData,
                    timestamp: Date.now(),
                    source: 'Yellowstone gRPC (Real-time)'
                });

                // Emit event for listeners
                this.emitPoolUpdate(tokenAddress, priceData);

                console.log(`💰 [Yellowstone gRPC] Real-time price: $${priceData.priceUsd.toFixed(8)}`);
            }

        } catch (error) {
            console.error('❌ [Yellowstone gRPC] Error handling pool update:', error.message);
        }
    }

    /**
     * Parse pool data from account update
     */
    parsePoolData(accountData, tokenAddress) {
        try {
            // This would need to be implemented based on specific DEX formats
            // For Raydium pools, we'd parse the account data structure
            // For PumpSwap, we'd parse their specific format
            
            // Placeholder implementation - would need actual DEX parsing logic
            const parsedData = this.parseRaydiumPoolData(accountData, tokenAddress);
            return parsedData;

        } catch (error) {
            console.error('❌ [Yellowstone gRPC] Error parsing pool data:', error.message);
            return null;
        }
    }

    /**
     * Parse Raydium pool data (simplified)
     */
    parseRaydiumPoolData(accountData, tokenAddress) {
        // This is a simplified example - actual implementation would need
        // to parse the specific Raydium pool account structure
        
        // For now, return mock data structure
        return {
            tokenReserves: 1000000, // Would be parsed from account data
            solReserves: 100,       // Would be parsed from account data
            dexType: 'Raydium'
        };
    }

    /**
     * Calculate real-time price from pool reserves
     */
    calculateRealTimePrice(poolInfo, tokenAddress) {
        const { tokenReserves, solReserves } = poolInfo;
        
        if (tokenReserves > 0 && solReserves > 0) {
            const priceInSOL = solReserves / tokenReserves;
            const priceInUSD = priceInSOL * this.getCurrentSolPrice();
            const liquidity = solReserves * this.getCurrentSolPrice() * 2;

            return {
                tokenAddress,
                priceUsd: priceInUSD,
                priceInSOL,
                liquidity,
                tokenReserves,
                solReserves,
                timestamp: Date.now()
            };
        }

        return null;
    }

    /**
     * Get current SOL price (would be updated via separate stream)
     */
    getCurrentSolPrice() {
        // This would be maintained via a separate SOL price stream
        return 200; // Placeholder
    }

    /**
     * Emit pool update events
     */
    emitPoolUpdate(tokenAddress, priceData) {
        // Emit to any listeners (EventEmitter pattern)
        if (this.listeners) {
            this.listeners.forEach(callback => {
                callback(tokenAddress, priceData);
            });
        }
    }

    /**
     * Add listener for pool updates
     */
    addPoolUpdateListener(callback) {
        if (!this.listeners) {
            this.listeners = [];
        }
        this.listeners.push(callback);
    }

    /**
     * Get latest pool data for a token
     */
    getLatestPoolData(tokenAddress) {
        return this.poolData.get(tokenAddress);
    }

    /**
     * Unsubscribe from a pool
     */
    unsubscribeFromPool(poolAddress) {
        const subscription = this.subscriptions.get(poolAddress);
        if (subscription) {
            subscription.cancel();
            this.subscriptions.delete(poolAddress);
            console.log(`🔌 [Yellowstone gRPC] Unsubscribed from pool: ${poolAddress}`);
        }
    }

    /**
     * Cleanup all subscriptions
     */
    cleanup() {
        this.subscriptions.forEach((subscription, poolAddress) => {
            subscription.cancel();
        });
        this.subscriptions.clear();
        this.isConnected = false;
        console.log('🧹 [Yellowstone gRPC] All subscriptions cleaned up');
    }
}

export default YellowstoneGrpcService;


