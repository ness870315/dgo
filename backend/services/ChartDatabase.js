import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Centralized Chart Database (File-based JSON)
 * Stores all chart data permanently with incremental updates
 * Multiple users access the same cached data - no duplicate API calls
 * Uses JSON files instead of SQLite for better compatibility
 */
class ChartDatabase {
    constructor() {
        this.dataDir = path.join(process.cwd(), 'data');
        this.dbFile = path.join(this.dataDir, 'charts.json');
        this.data = {
            swaps: new Map(),
            candles: new Map(),
            pools: new Map(),
            backfillProgress: new Map()
        };
        this.ensureDataDir();
        this.loadData();
    }

    async ensureDataDir() {
        try {
            await fs.mkdir(this.dataDir, { recursive: true });
        } catch (error) {
            console.error('❌ Failed to create data directory:', error.message);
        }
    }

    async loadData() {
        try {
            const data = await fs.readFile(this.dbFile, 'utf8');
            const parsed = JSON.parse(data);
            
            // Convert arrays back to Maps
            this.data.swaps = new Map(parsed.swaps || []);
            this.data.candles = new Map(parsed.candles || []);
            this.data.pools = new Map(parsed.pools || []);
            this.data.backfillProgress = new Map(parsed.backfillProgress || []);
            
            console.log('✅ Chart database loaded from file');
        } catch (error) {
            if (error.code !== 'ENOENT') {
                console.error('❌ Failed to load database:', error.message);
            }
            console.log('📊 Starting with empty database');
        }
    }

    async saveData() {
        try {
            // Convert Maps to arrays for JSON serialization
            const dataToSave = {
                swaps: Array.from(this.data.swaps.entries()),
                candles: Array.from(this.data.candles.entries()),
                pools: Array.from(this.data.pools.entries()),
                backfillProgress: Array.from(this.data.backfillProgress.entries()),
                lastUpdated: Date.now()
            };
            
            await fs.writeFile(this.dbFile, JSON.stringify(dataToSave, null, 2));
        } catch (error) {
            console.error('❌ Failed to save database:', error.message);
        }
    }

    /**
     * Store raw swap transactions
     */
    async storeSwaps(swaps) {
        if (!swaps || swaps.length === 0) return;

        for (const swap of swaps) {
            const key = `${swap.poolAddress}_${swap.signature}`;
            this.data.swaps.set(key, {
                signature: swap.signature,
                poolAddress: swap.poolAddress,
                timestamp: swap.timestamp,
                price: swap.price,
                volumeUsd: swap.volumeUsd,
                source: swap.source,
                rawData: swap.rawData,
                createdAt: Date.now()
            });
        }

        await this.saveData();
        console.log(`💾 Stored ${swaps.length} swaps in database`);
    }

    /**
     * Get candles for a pool and timeframe
     * Returns pre-computed OHLCV data instantly
     */
    async getCandles(poolAddress, timeframe, limit = null) {
        const candles = [];
        
        for (const [key, candle] of this.data.candles.entries()) {
            if (candle.poolAddress === poolAddress && candle.timeframe === timeframe) {
                candles.push({
                    timestamp: candle.timestamp * 1000, // Convert to milliseconds for frontend
                    open: candle.open,
                    high: candle.high,
                    low: candle.low,
                    close: candle.close,
                    volume: candle.volume
                });
            }
        }

        // Sort by timestamp and apply limit
        candles.sort((a, b) => a.timestamp - b.timestamp);
        
        if (limit) {
            return candles.slice(-limit).reverse(); // Return in chronological order
        }
        
        return candles.reverse(); // Return in chronological order
    }

    /**
     * Update materialized candles with new swaps
     */
    async updateCandles(poolAddress, timeframe) {
        console.log(`🔄 Updating candles for ${poolAddress.substring(0, 8)} (${timeframe})`);

        // Get all swaps for this pool
        const swaps = [];
        for (const [key, swap] of this.data.swaps.entries()) {
            if (swap.poolAddress === poolAddress) {
                swaps.push({
                    timestamp: swap.timestamp,
                    price: swap.price,
                    volume_usd: swap.volumeUsd
                });
            }
        }

        if (swaps.length === 0) {
            console.log(`⚠️ No swaps found for ${poolAddress.substring(0, 8)}`);
            return;
        }

        // Generate candles from swaps
        const candles = this.generateCandlesFromSwaps(swaps, timeframe);

        // Store/update candles in database
        for (const candle of candles) {
            const key = `${poolAddress}_${timeframe}_${candle.timestamp}`;
            this.data.candles.set(key, {
                poolAddress,
                timeframe,
                timestamp: candle.timestamp,
                open: candle.open,
                high: candle.high,
                low: candle.low,
                close: candle.close,
                volume: candle.volume,
                updatedAt: Date.now()
            });
        }

        await this.saveData();
        console.log(`✅ Updated ${candles.length} candles for ${poolAddress.substring(0, 8)} (${timeframe})`);
    }

    /**
     * Generate OHLCV candles from raw swaps
     */
    generateCandlesFromSwaps(swaps, timeframe) {
        const stepMin = this.getTimeframeMinutes(timeframe);
        const buckets = new Map();

        for (const swap of swaps) {
            const bucketMin = Math.floor((swap.timestamp / 60) / stepMin) * stepMin;
            const bucketTime = bucketMin * 60;

            const candle = buckets.get(bucketTime);
            if (!candle) {
                buckets.set(bucketTime, {
                    timestamp: bucketTime,
                    open: swap.price,
                    high: swap.price,
                    low: swap.price,
                    close: swap.price,
                    volume: swap.volume_usd
                });
            } else {
                candle.high = Math.max(candle.high, swap.price);
                candle.low = Math.min(candle.low, swap.price);
                candle.close = swap.price; // Last price in timeframe
                candle.volume += swap.volume_usd;
            }
        }

        return [...buckets.values()].sort((a, b) => a.timestamp - b.timestamp);
    }

    /**
     * Store pool address for a token
     */
    async storePoolAddress(tokenMint, poolAddress, dexSource = null, liquidityUsd = null) {
        this.data.pools.set(tokenMint, {
            tokenMint,
            poolAddress,
            dexSource,
            liquidityUsd,
            isActive: true,
            updatedAt: Date.now()
        });

        await this.saveData();
        console.log(`💾 Stored pool address for ${tokenMint.substring(0, 8)}: ${poolAddress.substring(0, 8)}`);
    }

    /**
     * Get pool address for a token
     */
    async getPoolAddress(tokenMint) {
        const pool = this.data.pools.get(tokenMint);
        return pool ? pool.poolAddress : null;
    }

    /**
     * Update backfill progress
     */
    async updateBackfillProgress(poolAddress, lastSignature, lastTimestamp, totalSwaps) {
        this.data.backfillProgress.set(poolAddress, {
            poolAddress,
            lastSignature,
            lastTimestamp,
            totalSwaps,
            lastBackfillAt: Date.now()
        });

        await this.saveData();
    }

    /**
     * Get backfill progress
     */
    async getBackfillProgress(poolAddress) {
        return this.data.backfillProgress.get(poolAddress);
    }

    /**
     * Get database statistics
     */
    async getStats() {
        return {
            total_swaps: this.data.swaps.size,
            total_candles: this.data.candles.size,
            total_pools: this.data.pools.size,
            active_pools: Array.from(this.data.pools.values()).filter(p => p.isActive).length
        };
    }

    getTimeframeMinutes(timeframe) {
        switch (timeframe) {
            case '1MIN': return 1;
            case '5MIN': return 5;
            case '15MIN': return 15;
            case '1H': return 60;
            case '4H': return 240;
            case '1D': return 1440;
            default: return 5;
        }
    }

    close() {
        console.log('🔒 Chart database closed');
    }
}

export default ChartDatabase;