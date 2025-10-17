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
            // Use signature as key if no poolAddress, or create a composite key
            const key = swap.poolAddress ? 
                `${swap.poolAddress}_${swap.signature}` : 
                swap.signature;
                
            this.data.swaps.set(key, {
                signature: swap.signature,
                poolAddress: swap.poolAddress || 'UNKNOWN',
                timestamp: swap.timestamp,
                price: swap.price,
                volumeUsd: swap.usdValue || swap.volumeUsd,
                source: swap.source || 'helius',
                rawData: swap,
                createdAt: Date.now(),
                // Additional fields from our parsing
                type: swap.type,
                baseToken: swap.baseToken,
                baseAmount: swap.baseAmount,
                tokenAmount: swap.tokenAmount,
                maker: swap.maker
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
     * Get recent swaps for a pool (for TX table)
     * Returns individual swap transactions with buy/sell detection
     */
    async getRecentSwaps(poolAddress, limit = 50, sinceTimestamp = null) {
        const swaps = [];
        
        for (const [key, swap] of this.data.swaps.entries()) {
            if (swap.poolAddress === poolAddress) {
                // Filter by timestamp if provided
                if (sinceTimestamp && swap.timestamp <= sinceTimestamp) {
                    continue;
                }
                
                // Determine buy/sell type from raw data
                let type = 'unknown';
                let tokenAmount = 0;
                let baseAmount = 0;
                let baseToken = 'SOL';
                
                // Try to extract buy/sell info from raw data
                if (swap.rawData) {
                    try {
                        const raw = typeof swap.rawData === 'string' ? JSON.parse(swap.rawData) : swap.rawData;
                        
                        // Look for token transfers to determine direction
                        if (raw.tokenTransfers && raw.tokenTransfers.length >= 2) {
                            const transfers = raw.tokenTransfers;
                            
                            // Find the largest transfer amounts (ignore fees)
                            let maxTokenTransfer = 0;
                            let maxBaseTransfer = 0;
                            
                            for (const transfer of transfers) {
                                const amount = Math.abs(transfer.tokenAmount || 0);
                                
                                // Check if this is a base token (SOL, USDC, USDT)
                                if (transfer.mint === 'So11111111111111111111111111111111111111112' || // SOL
                                    transfer.mint === 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' || // USDC
                                    transfer.mint === 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB') { // USDT
                                    
                                    maxBaseTransfer = Math.max(maxBaseTransfer, amount);
                                    if (transfer.mint === 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v') baseToken = 'USDC';
                                    else if (transfer.mint === 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB') baseToken = 'USDT';
                                } else {
                                    maxTokenTransfer = Math.max(maxTokenTransfer, amount);
                                }
                            }
                            
                            // Determine buy/sell based on transfer direction
                            // Buy: receiving tokens (positive token amount)
                            // Sell: sending tokens (negative token amount)
                            const tokenTransfer = transfers.find(t => t.mint !== 'So11111111111111111111111111111111111111112' && 
                                                                    t.mint !== 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' && 
                                                                    t.mint !== 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB');
                            
                            if (tokenTransfer) {
                                type = tokenTransfer.tokenAmount > 0 ? 'buy' : 'sell';
                                tokenAmount = Math.abs(tokenTransfer.tokenAmount || 0);
                                baseAmount = maxBaseTransfer;
                            }
                        }
                    } catch (error) {
                        console.warn('⚠️ Failed to parse swap raw data:', error.message);
                    }
                }
                
                swaps.push({
                    signature: swap.signature,
                    timestamp: swap.timestamp * 1000, // Convert to milliseconds
                    type: type,
                    price: swap.price,
                    volumeUsd: swap.volumeUsd,
                    tokenAmount: tokenAmount,
                    baseAmount: baseAmount,
                    baseToken: baseToken,
                    maker: swap.signature.substring(0, 6) + '...', // Shortened signature as maker
                    source: swap.source,
                    createdAt: swap.createdAt
                });
            }
        }

        // Sort by timestamp (newest first) and apply limit
        swaps.sort((a, b) => b.timestamp - a.timestamp);
        
        if (limit) {
            return swaps.slice(0, limit);
        }
        
        return swaps;
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
        const totalTokens = this.data.pools.size;
        const totalSwaps = Array.from(this.data.swaps.values()).reduce((sum, swaps) => sum + swaps.length, 0);
        const totalCandles = Array.from(this.data.candles.values()).reduce((sum, candles) => sum + candles.length, 0);
        
        const cachedTokens = Array.from(this.data.pools.entries()).map(([tokenAddress, poolData]) => ({
            tokenAddress,
            swaps: this.data.swaps.get(tokenAddress)?.length || 0,
            candles: this.data.candles.get(tokenAddress)?.length || 0,
            isActive: poolData.isActive
        }));
        
        return {
            totalTokens,
            totalSwaps,
            totalCandles,
            totalPools: this.data.pools.size,
            activePools: Array.from(this.data.pools.values()).filter(p => p.isActive).length,
            cachedTokens
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