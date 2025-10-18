import OptimizedHeliusBackfill from './OptimizedHeliusBackfill.js';
import ChartDatabase from './ChartDatabase.js';
import HybridPriceService from '../hybridPriceService.js';

/**
 * Background Worker for Continuous Chart Data Ingestion
 * Runs continuously to keep chart data up-to-date
 * Multiple users benefit from the same data - no duplicate API calls
 */
class ChartBackgroundWorker {
    constructor(heliusApiKey) {
        this.heliusBackfill = new OptimizedHeliusBackfill(heliusApiKey);
        this.chartDb = new ChartDatabase();
        this.hybridService = new HybridPriceService();
        this.isRunning = false;
        this.processedPools = new Set();
        this.runningBackfills = new Set(); // Track active backfill processes
        this.updateInterval = 30000; // 30 seconds
        this.backfillInterval = 300000; // 5 minutes
        this.realtimeInterval = 10000; // 10 seconds for active pools
    }

    /**
     * Start the background worker
     */
    async start() {
        if (this.isRunning) {
            console.log('⚠️ Background worker already running');
            return;
        }

        console.log('🚀 Starting Chart Background Worker');
        console.log(`   Update interval: ${this.updateInterval / 1000}s`);
        console.log(`   Backfill interval: ${this.backfillInterval / 1000}s`);

        this.isRunning = true;

        // Initial backfill for active pools
        await this.initialBackfill();

        // Start continuous updates
        this.startContinuousUpdates();

        // Start periodic backfills
        this.startPeriodicBackfills();

        // Start real-time updates for active pools
        this.startRealtimeUpdates();

        console.log('✅ Background worker started with real-time updates');
    }

    /**
     * Stop the background worker
     */
    stop() {
        this.isRunning = false;
        console.log('🛑 Background worker stopped');
    }

    /**
     * Initial backfill for all known pools
     */
    async initialBackfill() {
        console.log('🔄 Starting initial backfill...');

        try {
            // Get all pools from database
            const pools = [];
            for (const [tokenMint, poolData] of this.chartDb.data.pools.entries()) {
                if (poolData.isActive) {
                    pools.push({
                        token_mint: tokenMint,
                        pool_address: poolData.poolAddress
                    });
                }
            }

            console.log(`📊 Found ${pools.length} pools for initial backfill`);

            for (const pool of pools) {
                try {
                    await this.backfillPool(pool.pool_address, pool.token_mint);
                } catch (error) {
                    console.error(`❌ Initial backfill failed for ${pool.pool_address.substring(0, 8)}:`, error.message);
                }
            }

            console.log('✅ Initial backfill completed');
        } catch (error) {
            console.error('❌ Initial backfill failed:', error.message);
        }
    }

    /**
     * Start continuous updates (every 30 seconds)
     */
    startContinuousUpdates() {
        const updateLoop = async () => {
            if (!this.isRunning) return;

            try {
                await this.updateAllPools();
            } catch (error) {
                console.error('❌ Continuous update failed:', error.message);
            }

            // Schedule next update
            setTimeout(updateLoop, this.updateInterval);
        };

        updateLoop();
    }

    /**
     * Start periodic backfills (every 5 minutes)
     */
    startPeriodicBackfills() {
        const backfillLoop = async () => {
            if (!this.isRunning) return;

            try {
                await this.periodicBackfill();
            } catch (error) {
                console.error('❌ Periodic backfill failed:', error.message);
            }

            // Schedule next backfill
            setTimeout(backfillLoop, this.backfillInterval);
        };

        backfillLoop();
    }

    /**
     * Start real-time updates for active pools (every 10 seconds)
     */
    startRealtimeUpdates() {
        const realtimeLoop = async () => {
            if (!this.isRunning) return;

            try {
                await this.realtimeUpdate();
            } catch (error) {
                console.error('❌ Real-time update failed:', error.message);
            }

            // Schedule next real-time update
            setTimeout(realtimeLoop, this.realtimeInterval);
        };

        realtimeLoop();
    }

    /**
     * Update all active pools with new data
     */
    async updateAllPools() {
        const pools = [];
        for (const [tokenMint, poolData] of this.chartDb.data.pools.entries()) {
            if (poolData.isActive) {
                pools.push({
                    token_mint: tokenMint,
                    pool_address: poolData.poolAddress
                });
            }
        }

        console.log(`🔄 Updating ${pools.length} pools...`);

        for (const pool of pools) {
            try {
                await this.updatePool(pool.pool_address);
            } catch (error) {
                console.error(`❌ Update failed for ${pool.pool_address.substring(0, 8)}:`, error.message);
            }
        }
    }

    /**
     * Update a single pool with new swaps
     */
    async updatePool(poolAddress) {
        const progress = await this.chartDb.getBackfillProgress(poolAddress);
        
        // If no progress exists, start initial backfill
        if (!progress) {
            console.log(`🔄 No backfill progress found for ${poolAddress.substring(0, 8)}, starting initial backfill`);
            await this.backfillPool(poolAddress, 'UNKNOWN'); // Token mint not needed for backfill
            return;
        }

        const toTs = Math.floor(Date.now() / 1000);
        const fromTs = progress.last_processed_timestamp || (toTs - 3600); // Last hour if no progress

        try {
            // Get new swaps since last update
            const result = await this.heliusBackfill.backfillHeliusOHLCV({
                poolAddress,
                fromTs,
                toTs,
                timeframe: '1MIN', // Get finest granularity
                source: 'RAYDIUM'
            });

            if (result.candles.length === 0) {
                return; // No new data
            }

            // Store new raw swaps (if available)
            if (result.rawSwaps && result.rawSwaps.length > 0) {
                // Ensure swaps have poolAddress
                const swapsWithPool = result.rawSwaps.map(swap => ({
                    ...swap,
                    poolAddress: poolAddress
                }));
                await this.chartDb.storeSwaps(swapsWithPool);
                console.log(`💾 Stored ${result.rawSwaps.length} new raw swaps for ${poolAddress.substring(0, 8)}`);
            } else {
                // Fallback: Convert candles back to swaps for storage
                const newSwaps = this.candlesToSwaps(result.candles, poolAddress);
                await this.chartDb.storeSwaps(newSwaps);
                console.log(`💾 Converted ${newSwaps.length} candles to swaps for ${poolAddress.substring(0, 8)}`);
            }

            // Update materialized candles for all timeframes
            const timeframes = ['1MIN', '5MIN', '15MIN', '1H', '4H', '1D'];
            for (const timeframe of timeframes) {
                await this.chartDb.updateCandles(poolAddress, timeframe);
            }

            // Update progress
            const latestCandle = result.candles[result.candles.length - 1];
            const newSwapsCount = result.rawSwaps ? result.rawSwaps.length : result.candles.length;
            await this.chartDb.updateBackfillProgress(
                poolAddress,
                `update_${Date.now()}`, // Placeholder signature
                latestCandle.time,
                progress.total_swaps + newSwapsCount
            );

            console.log(`✅ Updated ${poolAddress.substring(0, 8)}: ${newSwapsCount} new swaps`);

            // Update current price from latest swaps
            await this.updateCurrentPriceFromSwaps(poolAddress);

        } catch (error) {
            console.error(`❌ Update failed for ${poolAddress.substring(0, 8)}:`, error.message);
        }
    }

    /**
     * Update current price from latest swaps
     */
    async updateCurrentPriceFromSwaps(poolAddress) {
        try {
            // Get latest swaps for this pool
            const recentSwaps = await this.chartDb.getRecentSwaps(poolAddress, 10); // Last 10 swaps
            
            if (recentSwaps.length === 0) return;

            // Calculate current price from latest swaps
            const latestSwap = recentSwaps[recentSwaps.length - 1];
            const currentPrice = latestSwap.price || latestSwap.close || 0;

            if (currentPrice <= 0) return;

            // Find the token mint for this pool
            const tokenMint = this.findTokenMintByPool(poolAddress);
            if (!tokenMint) return;

            // Update the token cache with new current price
            await this.updateTokenCurrentPrice(tokenMint, currentPrice);

            console.log(`💰 Updated current price for ${tokenMint.substring(0, 8)}: $${currentPrice}`);

        } catch (error) {
            console.error(`❌ Failed to update current price for ${poolAddress.substring(0, 8)}:`, error.message);
        }
    }

    /**
     * Find token mint by pool address
     */
    findTokenMintByPool(poolAddress) {
        for (const [tokenMint, poolData] of this.chartDb.data.pools.entries()) {
            if (poolData.poolAddress === poolAddress) {
                return tokenMint;
            }
        }
        return null;
    }

    /**
     * Update token current price in the main token cache
     */
    async updateTokenCurrentPrice(tokenMint, newPrice) {
        try {
            // This would need to be integrated with the main token cache
            // For now, we'll emit an event that can be caught by the main backend
            if (typeof process !== 'undefined' && process.emit) {
                process.emit('tokenPriceUpdate', {
                    tokenMint,
                    newPrice,
                    timestamp: Date.now()
                });
            }
        } catch (error) {
            console.error(`❌ Failed to update token cache for ${tokenMint}:`, error.message);
        }
    }

    /**
     * Real-time update for active pools (every 10 seconds)
     * This ensures we catch new transactions quickly
     */
    async realtimeUpdate() {
        const activePools = [];
        for (const [tokenMint, poolData] of this.chartDb.data.pools.entries()) {
            if (poolData.isActive) {
                activePools.push({
                    token_mint: tokenMint,
                    pool_address: poolData.poolAddress
                });
            }
        }

        if (activePools.length === 0) return;

        console.log(`⚡ Real-time update for ${activePools.length} active pools...`);

        for (const pool of activePools) {
            try {
                await this.updatePool(pool.pool_address);
            } catch (error) {
                console.error(`❌ Real-time update failed for ${pool.pool_address.substring(0, 8)}:`, error.message);
            }
        }
    }

    /**
     * Periodic backfill for pools that haven't been updated recently
     */
    async periodicBackfill() {
        console.log('🔄 Starting periodic backfill...');

        const pools = [];
        const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
        
        for (const [tokenMint, poolData] of this.chartDb.data.pools.entries()) {
            if (poolData.isActive) {
                const progress = this.chartDb.data.backfillProgress.get(poolData.poolAddress);
                const needsBackfill = !progress || !progress.lastBackfillAt || progress.lastBackfillAt < fiveMinutesAgo;
                
                if (needsBackfill) {
                    pools.push({
                        token_mint: tokenMint,
                        pool_address: poolData.poolAddress
                    });
                }
            }
        }

        console.log(`📊 Found ${pools.length} pools needing backfill`);

        for (const pool of pools) {
            try {
                await this.backfillPool(pool.pool_address, pool.token_mint);
            } catch (error) {
                console.error(`❌ Periodic backfill failed for ${pool.pool_address.substring(0, 8)}:`, error.message);
            }
        }
    }

    /**
     * Full backfill for a pool
     */
    async backfillPool(poolAddress, tokenMint) {
        // Prevent concurrent backfills for the same pool
        if (this.runningBackfills.has(poolAddress)) {
            console.log(`⚠️ Backfill already running for ${poolAddress.substring(0, 8)}, skipping...`);
            return;
        }

        console.log(`🔄 Backfilling ${poolAddress.substring(0, 8)} (${tokenMint.substring(0, 8)})`);
        
        // Mark this pool as being processed
        this.runningBackfills.add(poolAddress);

        try {
            const progress = await this.chartDb.getBackfillProgress(poolAddress);
            const toTs = Math.floor(Date.now() / 1000);
            const fromTs = progress ? progress.last_processed_timestamp : (toTs - 7 * 24 * 3600); // 7 days if no progress

            // Get swaps from Helius
            const result = await this.heliusBackfill.backfillHeliusOHLCV({
                poolAddress,
                fromTs,
                toTs,
                timeframe: '1MIN',
                source: 'RAYDIUM'
            });

            if (result.candles.length === 0) {
                console.log(`⚠️ No data found for ${poolAddress.substring(0, 8)}`);
                return;
            }

            // Store raw swaps directly (not converted from candles)
            if (result.rawSwaps && result.rawSwaps.length > 0) {
                // Ensure swaps have poolAddress
                const swapsWithPool = result.rawSwaps.map(swap => ({
                    ...swap,
                    poolAddress: poolAddress
                }));
                await this.chartDb.storeSwaps(swapsWithPool);
                console.log(`💾 Stored ${result.rawSwaps.length} raw swaps for ${poolAddress.substring(0, 8)}`);
            }

            // Update materialized candles
            const timeframes = ['1MIN', '5MIN', '15MIN', '1H', '4H', '1D'];
            for (const timeframe of timeframes) {
                await this.chartDb.updateCandles(poolAddress, timeframe);
            }

            // Update progress
            const latestCandle = result.candles[result.candles.length - 1];
            await this.chartDb.updateBackfillProgress(
                poolAddress,
                `backfill_${Date.now()}`,
                latestCandle.time,
                result.rawSwaps.length
            );

            console.log(`✅ Backfilled ${poolAddress.substring(0, 8)}: ${result.rawSwaps.length} swaps`);

        } catch (error) {
            console.error(`❌ Backfill failed for ${poolAddress.substring(0, 8)}:`, error.message);
        } finally {
            // Always remove from running backfills, even if there was an error
            this.runningBackfills.delete(poolAddress);
        }
    }

    /**
     * Re-backfill existing tokens that only have candles (not raw swaps)
     * This ensures all tokens have real transaction data for the TX table
     */
    async reBackfillExistingTokens() {
        console.log('🔄 Re-backfilling existing tokens with raw swaps...');
        
        const tokensToReBackfill = [];
        
        for (const [tokenMint, poolData] of this.chartDb.data.pools.entries()) {
            if (poolData.isActive) {
                // Check if this token has real swaps or just candles
                const swaps = await this.chartDb.getRecentSwaps(poolData.poolAddress, 1);
                
                if (swaps.length === 0) {
                    tokensToReBackfill.push({
                        tokenMint,
                        poolAddress: poolData.poolAddress
                    });
                }
            }
        }
        
        console.log(`📊 Found ${tokensToReBackfill.length} tokens needing raw swap re-backfill`);
        
        for (const token of tokensToReBackfill) {
            try {
                console.log(`🔄 Re-backfilling ${token.tokenMint.substring(0, 8)} with raw swaps...`);
                await this.backfillPool(token.poolAddress, token.tokenMint);
                
                // Small delay between tokens
                await new Promise(resolve => setTimeout(resolve, 2000));
                
            } catch (error) {
                console.error(`❌ Re-backfill failed for ${token.tokenMint.substring(0, 8)}:`, error.message);
            }
        }
        
        console.log('✅ Re-backfill of existing tokens completed');
    }
    async addToken(tokenMint) {
        console.log(`➕ Adding token ${tokenMint.substring(0, 8)} to background worker`);

        try {
            // Get pool address
            let poolAddress = await this.chartDb.getPoolAddress(tokenMint);
            
            if (!poolAddress) {
                // Discover pool address
                poolAddress = await this.hybridService.getPairAddress(tokenMint);
                await this.chartDb.storePoolAddress(tokenMint, poolAddress);
            }

            // Initial backfill
            await this.backfillPool(poolAddress, tokenMint);

            console.log(`✅ Token ${tokenMint.substring(0, 8)} added successfully`);

        } catch (error) {
            console.error(`❌ Failed to add token ${tokenMint.substring(0, 8)}:`, error.message);
        }
    }

    /**
     * Convert candles back to swaps for storage
     * This is a simplified conversion - in practice you'd store the actual swap data
     */
    candlesToSwaps(candles, poolAddress) {
        return candles.map((candle, index) => ({
            signature: `candle_${poolAddress.substring(0, 8)}_${candle.time}_${index}`,
            poolAddress,
            timestamp: candle.time,
            price: candle.close,
            volumeUsd: candle.volume,
            source: 'RAYDIUM',
            rawData: candle
        }));
    }

    /**
     * Stop the background worker
     */
    stop() {
        console.log('🛑 Stopping Chart Background Worker...');
        this.isRunning = false;
        this.stopAllBackfills();
        console.log('✅ Background worker stopped');
    }

    /**
     * Stop all running backfills
     */
    stopAllBackfills() {
        console.log(`🛑 Stopping ${this.runningBackfills.size} running backfills...`);
        this.runningBackfills.clear();
    }

    /**
     * Get status of running backfills
     */
    getBackfillStatus() {
        return {
            running: Array.from(this.runningBackfills),
            count: this.runningBackfills.size
        };
    }

    /**
     * Get worker status
     */
    async getStatus() {
        const stats = await this.chartDb.getStats();
        return {
            isRunning: this.isRunning,
            updateInterval: this.updateInterval,
            backfillInterval: this.backfillInterval,
            processedPools: this.processedPools.size,
            databaseStats: stats
        };
    }
}

export default ChartBackgroundWorker;
