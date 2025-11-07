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
        // ✅ CRITICAL FIX: Use production persistent cache directory
        this.dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
        // In production: /var/data/dgo
        // In local: ./data
        this.dbFile = path.join(this.dataDir, 'charts.json');
        
        // 🚀 HYBRID ARCHITECTURE: Per-token databases + shared metadata
        this.tokenDatabases = new Map(); // tokenAddress -> database instance
        this.sharedData = {
            candles: new Map(),
            pools: new Map(),
            backfillProgress: new Map(),
            tokenStats: new Map() // tokenAddress -> { swapCount, lastSwap, etc }
        };
        this.isLoaded = false;
        
        // 🚀 ATOMIC WRITE SYSTEM for high-frequency swaps
        this.writeQueues = new Map(); // tokenAddress -> queue
        this.isWriting = new Set(); // track which tokens are being written
        this.writeBatchSize = 50; // Batch swaps before writing
        this.writeInterval = 2000; // Write every 2 seconds max (faster for real-time)
        this.lastWriteTime = new Map(); // per-token write times
        
        // ✅ CRITICAL FIX: Ensure data directory exists synchronously
        this.initializeDataDirSync();
        
        this.loadData();
        this.startBatchWriter();
    }
    
    /**
     * ✅ CRITICAL FIX: Synchronously ensure data directory exists
     */
    initializeDataDirSync() {
        try {
            const fsSync = require('fs');
            if (!fsSync.existsSync(this.dataDir)) {
                fsSync.mkdirSync(this.dataDir, { recursive: true });
                console.log(`✅ [ChartDatabase] Created data directory: ${this.dataDir}`);
            }
        } catch (error) {
            console.error('❌ [ChartDatabase] Failed to create data directory:', error.message);
        }
    }

    /**
     * Ensure data is loaded before operations
     */
    async ensureLoaded() {
        if (!this.isLoaded) {
            await this.loadData();
        }
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
            this.sharedData.candles = new Map(parsed.candles || []);
            this.sharedData.pools = new Map(parsed.pools || []);
            this.sharedData.backfillProgress = new Map(parsed.backfillProgress || []);
            
            this.isLoaded = true;
            console.log('✅ Chart database loaded from file');
        } catch (error) {
            if (error.code !== 'ENOENT') {
                console.error('❌ Failed to load database:', error.message);
            }
            console.log('📊 Starting with empty database');
            this.isLoaded = true; // Mark as loaded even if empty
        }
    }

    /**
     * 🚀 PER-TOKEN DATABASE - Get or create database for specific token
     */
    getTokenDatabase(tokenAddress) {
        if (!this.tokenDatabases.has(tokenAddress)) {
            this.tokenDatabases.set(tokenAddress, {
                swaps: new Map(),
                lastWriteTime: 0,
                swapCount: 0
            });
            
            // Initialize write queue for this token
            if (!this.writeQueues.has(tokenAddress)) {
                this.writeQueues.set(tokenAddress, []);
            }
            
            // 🚀 CRITICAL FIX: Load swaps from file if token database doesn't exist yet
            this.loadTokenDatabaseFromFile(tokenAddress).catch(err => {
                console.error(`❌ [ChartDatabase] Failed to load swaps from file for ${tokenAddress.substring(0, 8)}:`, err.message);
            });
        }
        return this.tokenDatabases.get(tokenAddress);
    }

    /**
     * 🚀 LOAD FROM FILE - Load token database from persistent file
     */
    async loadTokenDatabaseFromFile(tokenAddress) {
        const tokenFile = this.getTokenFilePath(tokenAddress);
        
        try {
            const fileData = await fs.readFile(tokenFile, 'utf8');
            const parsed = JSON.parse(fileData);
            
            const tokenDb = this.tokenDatabases.get(tokenAddress);
            if (parsed.swaps && Array.isArray(parsed.swaps)) {
                // Convert array back to Map
                tokenDb.swaps = new Map(parsed.swaps);
                tokenDb.swapCount = parsed.swapCount || 0;
                tokenDb.lastWriteTime = parsed.lastUpdated || 0;
                
                console.log(`📚 [ChartDatabase] Loaded ${tokenDb.swaps.size} swaps from file for ${tokenAddress.substring(0, 8)}`);
            }
        } catch (error) {
            if (error.code !== 'ENOENT') {
                console.error(`❌ [ChartDatabase] Error loading token file for ${tokenAddress.substring(0, 8)}:`, error.message);
            }
            // File doesn't exist yet, that's ok
        }
    }

    /**
     * 🚀 PER-TOKEN FILE PATH - Get file path for specific token
     */
    getTokenFilePath(tokenAddress) {
        return path.join(this.dataDir, `swaps_${tokenAddress}.json`);
    }

    /**
     * 🚀 ATOMIC WRITE SYSTEM - Start batch writer for high-frequency swaps
     */
    startBatchWriter() {
        setInterval(async () => {
            await this.processAllWriteQueues();
        }, this.writeInterval);
        
        console.log('🚀 [ChartDatabase] Hybrid atomic write system started');
        console.log(`   Architecture: Per-token databases + shared metadata`);
        console.log(`   Batch size: ${this.writeBatchSize} swaps per token`);
        console.log(`   Write interval: ${this.writeInterval}ms`);
    }

    /**
     * 🚀 ATOMIC WRITE - Process all token write queues in parallel
     */
    async processAllWriteQueues() {
        const writePromises = [];
        
        for (const [tokenAddress, queue] of this.writeQueues.entries()) {
            if (queue.length > 0 && !this.isWriting.has(tokenAddress)) {
                writePromises.push(this.processTokenWriteQueue(tokenAddress));
            }
        }
        
        if (writePromises.length > 0) {
            await Promise.allSettled(writePromises);
        }
    }

    /**
     * 🚀 ATOMIC WRITE - Process queued swaps for specific token
     */
    async processTokenWriteQueue(tokenAddress) {
        const queue = this.writeQueues.get(tokenAddress);
        if (!queue || queue.length === 0 || this.isWriting.has(tokenAddress)) return;
        
        this.isWriting.add(tokenAddress);
        
        // ✅ CRITICAL FIX: Define batch outside try-catch for proper error handling
        let batch = [];
        
        try {
            // Process swaps in batches for this token
            batch = queue.splice(0, this.writeBatchSize);
            if (batch.length === 0) return;
            
            const tokenDb = this.getTokenDatabase(tokenAddress);
            
            // Add swaps to memory
            for (const swap of batch) {
                const key = swap.poolAddress ? 
                    `${swap.poolAddress}_${swap.signature}` : 
                    swap.signature;
                tokenDb.swaps.set(key, swap);
                tokenDb.swapCount++;
            }
            
            // Atomic write to per-token file
            await this.atomicWriteToken(tokenAddress);
            
            // Update shared stats
            this.sharedData.tokenStats.set(tokenAddress, {
                swapCount: tokenDb.swapCount,
                lastSwap: Date.now(),
                lastWriteTime: tokenDb.lastWriteTime
            });
            
            console.log(`💾 [ChartDatabase] Token ${tokenAddress.substring(0,8)}: ${batch.length} swaps saved (total: ${tokenDb.swapCount})`);
            
        } catch (error) {
            console.error(`❌ [ChartDatabase] Token ${tokenAddress.substring(0,8)} write failed:`, error.message);
            // ✅ CRITICAL FIX: Re-queue failed swaps only if batch has items
            if (batch.length > 0) {
                queue.unshift(...batch);
            }
        } finally {
            this.isWriting.delete(tokenAddress);
        }
    }

    /**
     * 🚀 ATOMIC WRITE - Write per-token data to temporary file then rename
     */
    async atomicWriteToken(tokenAddress) {
        const tokenDb = this.getTokenDatabase(tokenAddress);
        const tokenFile = this.getTokenFilePath(tokenAddress);
        const tempFile = `${tokenFile}.tmp`;
        const backupFile = `${tokenFile}.backup`;
        
        try {
            // Convert token swaps to arrays for JSON serialization
            const dataToSave = {
                swaps: Array.from(tokenDb.swaps.entries()),
                swapCount: tokenDb.swapCount,
                lastUpdated: Date.now(),
                tokenAddress: tokenAddress
            };
            
            // Write to temporary file first
            await fs.writeFile(tempFile, JSON.stringify(dataToSave, null, 2));
            
            // ✅ GRACEFUL BACKUP: Skip backup if disk is full (allow cleanup to proceed)
            try {
                await fs.copyFile(tokenFile, backupFile);
            } catch (error) {
                // If backup fails due to no space, log warning but continue (cleanup needs to proceed)
                if (error.code === 'ENOSPC') {
                    console.warn(`⚠️ [ChartDatabase] Skipping backup for ${tokenAddress.substring(0,8)}: No space left on device (cleanup will proceed)`);
                }
                // Backup might not exist yet or other errors - that's ok, continue anyway
            }
            
            // Atomic rename (this is the atomic operation)
            await fs.rename(tempFile, tokenFile);
            
            tokenDb.lastWriteTime = Date.now();
            
        } catch (error) {
            // Clean up temp file if it exists
            try {
                await fs.unlink(tempFile);
            } catch (cleanupError) {
                // Ignore cleanup errors
            }
            throw error;
        }
    }

    /**
     * 🚀 LEGACY METHOD - Keep for backward compatibility (shared metadata only)
     */
    async atomicWrite() {
        const tempFile = `${this.dbFile}.tmp`;
        const backupFile = `${this.dbFile}.backup`;
        
        try {
            // Only save shared metadata (not per-token swaps)
            const dataToSave = {
                candles: Array.from(this.sharedData.candles.entries()),
                pools: Array.from(this.sharedData.pools.entries()),
                backfillProgress: Array.from(this.sharedData.backfillProgress.entries()),
                tokenStats: Array.from(this.sharedData.tokenStats.entries()),
                lastUpdated: Date.now()
            };
            
            // Write to temporary file first
            await fs.writeFile(tempFile, JSON.stringify(dataToSave, null, 2));
            
            // ✅ GRACEFUL BACKUP: Skip backup if disk is full (allow cleanup to proceed)
            try {
                await fs.copyFile(this.dbFile, backupFile);
            } catch (error) {
                // If backup fails due to no space, log warning but continue
                if (error.code === 'ENOSPC') {
                    console.warn(`⚠️ [ChartDatabase] Skipping backup for charts.json: No space left on device`);
                }
                // Backup might not exist yet or other errors - that's ok, continue anyway
            }
            
            // Atomic rename (this is the atomic operation)
            await fs.rename(tempFile, this.dbFile);
            
        } catch (error) {
            // Clean up temp file if it exists
            try {
                await fs.unlink(tempFile);
            } catch (cleanupError) {
                // Ignore cleanup errors
            }
            throw error;
        }
    }

    /**
     * 🚀 LEGACY METHOD - Keep for backward compatibility
     */
    async saveData() {
        await this.atomicWrite();
    }

    /**
     * Store raw swap transactions
     */
    /**
     * 🚀 ATOMIC STORE - Queue swaps for per-token atomic batch writing
     */
    async storeSwaps(swaps) {
        await this.ensureLoaded();
        if (!swaps || swaps.length === 0) return;

        // Group swaps by token address
        const swapsByToken = new Map();
        
        for (const swap of swaps) {
            // Determine token address from swap data
            const tokenAddress = swap.tokenAddress || swap.baseToken || 'UNKNOWN';
            
            if (!swapsByToken.has(tokenAddress)) {
                swapsByToken.set(tokenAddress, []);
            }
            
            const swapData = {
                signature: swap.signature,
                poolAddress: swap.poolAddress || 'UNKNOWN',
                timestamp: swap.timestamp,
                price: swap.price,
                volumeUsd: swap.usdValue || swap.volumeUsd,
                source: swap.source || 'helius',
                rawData: swap,
                createdAt: Date.now(),
                tokenAddress: tokenAddress,
                // Additional fields from our parsing
                type: swap.type,
                baseToken: swap.baseToken,
                baseAmount: swap.baseAmount,
                tokenAmount: swap.tokenAmount,
                maker: swap.maker
            };
            
            swapsByToken.get(tokenAddress).push(swapData);
        }
        
        // Queue swaps for each token
        for (const [tokenAddress, tokenSwaps] of swapsByToken.entries()) {
            if (!this.writeQueues.has(tokenAddress)) {
                this.writeQueues.set(tokenAddress, []);
            }
            
            this.writeQueues.get(tokenAddress).push(...tokenSwaps);
            
            // Trigger immediate write if queue is full for this token
            if (this.writeQueues.get(tokenAddress).length >= this.writeBatchSize) {
                await this.processTokenWriteQueue(tokenAddress);
            }
        }
        
        console.log(`📝 [ChartDatabase] Queued ${swaps.length} swaps across ${swapsByToken.size} tokens`);
    }

    /**
     * Get candles for a pool and timeframe
     * Returns pre-computed OHLCV data instantly
     */
    async getCandles(poolAddress, timeframe, limit = null) {
        await this.ensureLoaded();
        const candles = [];
        
        for (const [key, candle] of this.sharedData.candles.entries()) {
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
        await this.ensureLoaded();
        const swaps = [];
        
        // 🚀 HYBRID ARCHITECTURE: Search all token databases for swaps
        for (const [tokenAddress, tokenDb] of this.tokenDatabases.entries()) {
            if (tokenDb.swaps) {
                // 🚀 FIX: tokenDb.swaps is a Map, not an array - iterate through values
                for (const swap of tokenDb.swaps.values()) {
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
                            poolAddress: swap.poolAddress, // Add poolAddress to returned data
                            createdAt: swap.createdAt
                        });
                    }
                }
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
            this.sharedData.candles.set(key, {
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
        this.sharedData.pools.set(tokenMint, {
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
        const pool = this.sharedData.pools.get(tokenMint);
        return pool ? pool.poolAddress : null;
    }

    /**
     * Set pool mapping for a token (persistent)
     */
    async setPoolMapping(tokenAddress, poolAddress) {
        await this.ensureLoaded();
        this.sharedData.pools.set(tokenAddress, { poolAddress });
        await this.atomicWrite(); // Persist to database files permanently
        console.log(`💾 [ChartDatabase] Added pool mapping: ${tokenAddress.substring(0, 8)}... -> ${poolAddress.substring(0, 8)}...`);
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
        await this.ensureLoaded();
        const totalTokens = this.sharedData.pools.size;
        
        // 🚀 HYBRID ARCHITECTURE: Count swaps from all token databases
        let totalSwaps = 0;
        let totalCandles = 0;
        
        // Count swaps from all token databases
        for (const [tokenAddress, tokenDb] of this.tokenDatabases.entries()) {
            if (tokenDb.swaps) {
                totalSwaps += tokenDb.swaps.length;
            }
            if (tokenDb.candles) {
                totalCandles += tokenDb.candles.length;
            }
        }
        
        const cachedTokens = Array.from(this.sharedData.pools.entries()).map(([tokenAddress, poolData]) => {
            const tokenDb = this.tokenDatabases.get(tokenAddress);
            return {
                tokenAddress,
                swaps: tokenDb?.swaps?.length || 0,
                candles: tokenDb?.candles?.length || 0,
                isActive: poolData.isActive
            };
        });
        
        return {
            totalTokens,
            totalSwaps,
            totalCandles,
            totalPools: this.sharedData.pools.size,
            activePools: Array.from(this.sharedData.pools.values()).filter(p => p.isActive).length,
            cachedTokens
        };
    }

    /**
     * Mark a pool as active for background processing
     */
    async markPoolActive(tokenAddress, poolAddress) {
        this.sharedData.pools.set(tokenAddress, {
            poolAddress,
            isActive: true,
            createdAt: Date.now(),
            lastUpdated: Date.now()
        });
        await this.saveData();
        console.log(`✅ Marked pool ${poolAddress.substring(0, 8)} as active for ${tokenAddress.substring(0, 8)}`);
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

    /**
     * 🗑️ SWAP CLEANUP: Clean old swaps from all tokens
     * @param {Object} options - Cleanup options
     * @param {number} options.retentionDays - Override retention days (optional, for aggressive cleanup)
     * @param {boolean} options.cleanBackups - Also clean backup files and snapshots (optional)
     * @returns {Promise<Object>} Summary of cleanup results
     */
    async cleanupAllOldSwaps(options = {}) {
        await this.ensureLoaded();
        
        // ✅ AGGRESSIVE MODE: Override retention period if specified
        const retentionDays = options.retentionDays || this.SWAP_RETENTION_DAYS;
        const retentionMs = retentionDays * 24 * 60 * 60 * 1000;
        
        const results = {
            tokensProcessed: 0,
            totalSwapsRemoved: 0,
            tokensWithCleanup: 0,
            backupFilesDeleted: 0,
            snapshotDirsDeleted: 0,
            errors: []
        };
        
        try {
            // Iterate through all loaded token databases
            for (const [tokenAddress, tokenDb] of this.tokenDatabases.entries()) {
                try {
                    results.tokensProcessed++;
                    
                    // Use custom retention period for aggressive cleanup
                    const cutoffTime = Date.now() - retentionMs;
                    let removedCount = 0;
                    
                    if (tokenDb && tokenDb.swaps && tokenDb.swaps.size > 0) {
                        for (const [key, swap] of tokenDb.swaps.entries()) {
                            const swapTimestamp = swap.timestamp || swap.createdAt || 0;
                            const swapTime = swapTimestamp < 1e12 ? swapTimestamp * 1000 : swapTimestamp;
                            
                            if (swapTime < cutoffTime) {
                                tokenDb.swaps.delete(key);
                                removedCount++;
                            }
                        }
                        
                        if (removedCount > 0) {
                            tokenDb.swapCount = tokenDb.swaps.size;
                            results.totalSwapsRemoved += removedCount;
                            results.tokensWithCleanup++;
                            
                            // Save the cleaned database back to disk
                            await this.atomicWriteToken(tokenAddress);
                        }
                    }
                } catch (error) {
                    console.error(`❌ [ChartDatabase] Error cleaning swaps for token ${tokenAddress.substring(0,8)}:`, error.message);
                    results.errors.push({ tokenAddress, error: error.message });
                }
            }
            
            // Also check for token files on disk that might not be loaded in memory
            try {
                const files = await fs.readdir(this.dataDir); // Changed from this.chartsDir to this.dataDir
                const swapFiles = files.filter(f => f.startsWith('swaps_') && f.endsWith('.json'));
                
                for (const file of swapFiles) {
                    const tokenAddress = file.replace('swaps_', '').replace('.json', '');
                    
                    // Skip if already processed
                    if (this.tokenDatabases.has(tokenAddress)) {
                        continue;
                    }
                    
                    try {
                        // Load the token database from disk
                        await this.loadTokenDatabaseFromFile(tokenAddress);
                        const tokenDb = this.getTokenDatabase(tokenAddress);
                        
                        // Use custom retention period for aggressive cleanup
                        const cutoffTime = Date.now() - retentionMs;
                        let removedCount = 0;
                        
                        if (tokenDb && tokenDb.swaps && tokenDb.swaps.size > 0) {
                            for (const [key, swap] of tokenDb.swaps.entries()) {
                                const swapTimestamp = swap.timestamp || swap.createdAt || 0;
                                const swapTime = swapTimestamp < 1e12 ? swapTimestamp * 1000 : swapTimestamp;
                                
                                if (swapTime < cutoffTime) {
                                    tokenDb.swaps.delete(key);
                                    removedCount++;
                                }
                            }
                            
                            if (removedCount > 0) {
                                tokenDb.swapCount = tokenDb.swaps.size;
                                results.totalSwapsRemoved += removedCount;
                                results.tokensWithCleanup++;
                                await this.atomicWriteToken(tokenAddress);
                            }
                        }
                    } catch (error) {
                        // Skip files that can't be loaded (might be corrupted or in use)
                        console.warn(`⚠️ [ChartDatabase] Skipping file ${file}: ${error.message}`);
                    }
                }
            } catch (error) {
                console.error('❌ [ChartDatabase] Error reading charts directory:', error.message);
                results.errors.push({ global: error.message });
            }
            
                         // ✅ CLEANUP BACKUPS: Delete backup files and snapshot directories if requested
             if (options.cleanBackups) {
                 try {
                     const backupResults = await this.cleanupBackupFiles({ 
                         deleteAllSnapshots: options.deleteAllSnapshots || false 
                     });
                     results.backupFilesDeleted = backupResults.backupFilesDeleted || 0;
                     results.snapshotDirsDeleted = backupResults.snapshotDirsDeleted || 0;
                 } catch (error) {
                     console.error('❌ [ChartDatabase] Error cleaning backup files:', error.message);
                     results.errors.push({ backupCleanup: error.message });
                 }
             }
            
            if (results.totalSwapsRemoved > 0 || results.backupFilesDeleted > 0) {
                console.log(`✅ [ChartDatabase] Cleanup complete: Removed ${results.totalSwapsRemoved} old swaps from ${results.tokensWithCleanup} tokens, ${results.backupFilesDeleted} backup files, ${results.snapshotDirsDeleted} snapshot dirs (processed ${results.tokensProcessed} tokens, retention: ${retentionDays} days)`);
            }
            
        } catch (error) {
            console.error('❌ [ChartDatabase] Error in cleanupAllOldSwaps:', error.message);
            results.errors.push({ global: error.message });
        }
        
        return results;
    }

    /**
     * 🗑️ BACKUP CLEANUP: Delete backup files and old snapshot directories to free space
     * @param {Object} options - Cleanup options
     * @param {boolean} options.deleteAllSnapshots - Delete ALL snapshots, not just old ones (default: false)
     * @returns {Promise<Object>} Summary of backup cleanup results
     */
    async cleanupBackupFiles(options = {}) {
        const { deleteAllSnapshots = false } = options;
        const results = {
            backupFilesDeleted: 0,
            snapshotDirsDeleted: 0,
            errors: []
        };
        
        try {
            // 1. Delete .backup files in data directory
            try {
                const files = await fs.readdir(this.dataDir);
                const backupFiles = files.filter(f => f.endsWith('.backup'));
                
                for (const file of backupFiles) {
                    try {
                        const backupPath = path.join(this.dataDir, file);
                        await fs.unlink(backupPath);
                        results.backupFilesDeleted++;
                        console.log(`🗑️ [ChartDatabase] Deleted backup file: ${file}`);
                    } catch (error) {
                        console.warn(`⚠️ [ChartDatabase] Failed to delete backup file ${file}:`, error.message);
                        results.errors.push({ file, error: error.message });
                    }
                }
            } catch (error) {
                console.error('❌ [ChartDatabase] Error reading data directory for backup cleanup:', error.message);
            }
            
            // 2. Delete snapshot directories in dgo_backups (try both dgo_backups and dgo_backubs - typo fix)
            const dataDir = path.dirname(this.dataDir); // Parent directory of /var/data/dgo -> /var/data
            const possibleBackupDirs = [
                path.join(dataDir, 'dgo_backups'),  // Correct spelling
                path.join(dataDir, 'dgo_backubs')   // Typo variant (as user mentioned)
            ];
            
            for (const backupsDir of possibleBackupDirs) {
                try {
                    const backupDirs = await fs.readdir(backupsDir);
                    const snapshotDirs = backupDirs.filter(d => d.startsWith('snapshot_'));
                    
                    console.log(`🗑️ [ChartDatabase] Found ${snapshotDirs.length} snapshot directories in ${backupsDir}`);
                    
                    for (const snapshotDir of snapshotDirs) {
                        try {
                            const snapshotPath = path.join(backupsDir, snapshotDir);
                            const stats = await fs.stat(snapshotPath);
                            
                            // ✅ AGGRESSIVE MODE: Delete ALL snapshots if requested, otherwise only old ones
                            let shouldDelete = false;
                            if (deleteAllSnapshots) {
                                shouldDelete = true;
                            } else {
                                // Delete snapshot directories older than 1 day
                                const ageMs = Date.now() - stats.mtimeMs;
                                const oneDayMs = 24 * 60 * 60 * 1000;
                                shouldDelete = ageMs > oneDayMs;
                            }
                            
                            if (shouldDelete) {
                                await fs.rm(snapshotPath, { recursive: true, force: true });
                                results.snapshotDirsDeleted++;
                                const sizeGB = ((stats.size || 0) / 1024 / 1024 / 1024).toFixed(2);
                                console.log(`🗑️ [ChartDatabase] Deleted snapshot directory: ${snapshotDir} (${sizeGB}GB)`);
                            }
                        } catch (error) {
                            console.warn(`⚠️ [ChartDatabase] Failed to delete snapshot directory ${snapshotDir}:`, error.message);
                            results.errors.push({ snapshotDir, error: error.message });
                        }
                    }
                } catch (error) {
                    // Backup directory might not exist, that's ok
                    if (error.code !== 'ENOENT') {
                        console.warn(`⚠️ [ChartDatabase] Error accessing backups directory ${backupsDir}:`, error.message);
                    }
                }
            }
            
        } catch (error) {
            console.error('❌ [ChartDatabase] Error in cleanupBackupFiles:', error.message);
            results.errors.push({ global: error.message });
        }
        
        return results;
    }

    close() {
        console.log('🔒 Chart database closed');
    }
}

export default ChartDatabase;
                            }
                        } catch (error) {
                            console.warn(`⚠️ [ChartDatabase] Failed to delete snapshot directory ${snapshotDir}:`, error.message);
                            results.errors.push({ snapshotDir, error: error.message });
                        }
                    }
                } catch (error) {
                    // Backup directory might not exist, that's ok
                    if (error.code !== 'ENOENT') {
                        console.warn(`⚠️ [ChartDatabase] Error accessing backups directory ${backupsDir}:`, error.message);
                    }
                }
            }
            
        } catch (error) {
            console.error('❌ [ChartDatabase] Error in cleanupBackupFiles:', error.message);
            results.errors.push({ global: error.message });
        }
        
        return results;
    }

    close() {
        console.log('🔒 Chart database closed');
    }
}

export default ChartDatabase;