import HeliusChartService from './HeliusChartService.js';
import fs from 'fs/promises';
import path from 'path';

/**
 * Professional Chart Data Architecture
 * Based on how DexScreener and TradingView handle chart data
 * 
 * Architecture:
 * 1. Complete Historical Backfill → Cache ALL data PERMANENTLY
 * 2. Timeframe Generation → Create any timeframe from cached data
 * 3. Real-time Updates → Incremental updates when user stays on chart
 * 4. Persistent Storage → Charts never expire, saved to disk
 */
class ProfessionalChartService {
    constructor(heliusApiKey) {
        this.helius = new HeliusChartService(heliusApiKey);
        this.chartCache = new Map(); // Complete historical data cache (NO EXPIRATION)
        this.updateIntervals = new Map(); // Track active update intervals
        this.cacheDir = path.join(process.cwd(), 'data', 'chart-cache');
        this.maxCacheAge = 24 * 60 * 60 * 1000; // 24 hours - only for file cache refresh
        
        // Ensure cache directory exists
        this.ensureCacheDir();
        
        console.log('📊 ProfessionalChartService initialized with PERSISTENT CACHE');
        console.log(`📁 Cache directory: ${this.cacheDir}`);
        console.log('🔄 Charts will NEVER expire - data persists forever');
    }

    /**
     * Ensure cache directory exists
     */
    async ensureCacheDir() {
        try {
            await fs.mkdir(this.cacheDir, { recursive: true });
        } catch (error) {
            console.error('❌ Failed to create cache directory:', error.message);
        }
    }

    /**
     * Atomic file write - prevents data corruption
     */
    async atomicWrite(filePath, data) {
        const tempPath = filePath + '.tmp';
        try {
            // Write to temporary file first
            await fs.writeFile(tempPath, JSON.stringify(data, null, 2));
            // Atomic rename (atomic operation on most filesystems)
            await fs.rename(tempPath, filePath);
        } catch (error) {
            // Clean up temp file if rename failed
            try {
                await fs.unlink(tempPath);
            } catch (cleanupError) {
                // Ignore cleanup errors
            }
            throw error;
        }
    }

    /**
     * Atomic file read with fallback
     */
    async atomicRead(filePath) {
        try {
            const data = await fs.readFile(filePath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            // If main file fails, try temp file (in case of interrupted write)
            try {
                const tempPath = filePath + '.tmp';
                const tempData = await fs.readFile(tempPath, 'utf8');
                // Move temp file to main file
                await fs.rename(tempPath, filePath);
                return JSON.parse(tempData);
            } catch (tempError) {
                return null;
            }
        }
    }

    /**
     * Get cache file path for a token
     */
    getCacheFilePath(tokenAddress) {
        const safeAddress = tokenAddress.replace(/[^a-zA-Z0-9]/g, '_');
        return path.join(this.cacheDir, `${safeAddress}.json`);
    }
    async backfillCompleteHistory(tokenAddress) {
        console.log(`🔄 [PROFESSIONAL] Starting complete history backfill for ${tokenAddress.substring(0, 8)}`);
        
        try {
            let allPriceData = [];
            let allBuySellData = [];
            let allTransactions = [];
            let before = null; // For pagination
            const maxCalls = 10; // Limit to prevent infinite loops
            let callCount = 0;

            // Fetch data in batches of 100 (Helius limit)
            while (callCount < maxCalls) {
                callCount++;
                console.log(`📊 [PROFESSIONAL] Fetching batch ${callCount} (before: ${before ? before.substring(0, 8) + '...' : 'null'})`);
                
                // Fetch batch of transactions
                const rawTxs = await this.helius.getTransactionHistory(tokenAddress, 100);
                
                if (rawTxs.length === 0) {
                    console.log(`📊 [PROFESSIONAL] No more transactions in batch ${callCount}`);
                    break;
                }

                console.log(`📊 [PROFESSIONAL] Batch ${callCount}: ${rawTxs.length} transactions`);
                
                // Parse transactions
                const signatures = rawTxs.map(tx => tx.signature);
                const parsedTxs = await this.helius.parseTransactions(signatures);
                
                // Extract price data
                const { priceData, buySellData } = this.helius.extractPriceData(parsedTxs, tokenAddress);
                
                // Add to totals
                allTransactions.push(...parsedTxs);
                allPriceData.push(...priceData);
                allBuySellData.push(...buySellData);
                
                console.log(`📊 [PROFESSIONAL] Batch ${callCount}: ${priceData.length} price points extracted`);
                
                // Set pagination cursor (use oldest transaction signature)
                before = rawTxs[rawTxs.length - 1].signature;
                
                // If we got less than 100 transactions, we've reached the end
                if (rawTxs.length < 100) {
                    console.log(`📊 [PROFESSIONAL] Reached end of data (${rawTxs.length} < 100)`);
                    break;
                }
            }

            console.log(`📊 [PROFESSIONAL] Complete: ${allTransactions.length} transactions, ${allPriceData.length} price points`);

            // Cache the complete dataset (in-memory + persistent)
            const cacheData = {
                priceData: allPriceData,
                buySellData: allBuySellData,
                lastUpdated: Date.now(),
                transactionCount: allTransactions.length,
                batches: callCount,
                version: 1 // For future schema migrations
            };

            // Atomic write to persistent storage
            const filePath = this.getCacheFilePath(tokenAddress);
            await this.atomicWrite(filePath, cacheData);

            // Update in-memory cache
            this.chartCache.set(tokenAddress, cacheData);

            console.log(`✅ [PROFESSIONAL] Complete history cached PERMANENTLY for ${tokenAddress.substring(0, 8)} (${callCount} batches)`);
            console.log(`📁 Persistent cache: ${filePath}`);
            return { priceData: allPriceData, buySellData: allBuySellData };

        } catch (error) {
            console.error(`❌ [PROFESSIONAL] Error:`, error.message);
            return { priceData: [], buySellData: [] };
        }
    }

    /**
     * Step 2: Generate Timeframes from Cached Data
     * Create OHLCV candles for any timeframe from the complete dataset
     */
    generateTimeframeFromCache(tokenAddress, timeframe) {
        const cached = this.chartCache.get(tokenAddress);
        if (!cached || !cached.priceData.length) {
            console.log(`⚠️ [PROFESSIONAL] No cached data for ${tokenAddress.substring(0, 8)}`);
            return [];
        }

        console.log(`📊 [PROFESSIONAL] Generating ${timeframe} candles from ${cached.priceData.length} price points`);
        
        // Use Helius service to generate OHLCV from cached data
        const ohlcv = this.helius.generateOHLCVData(cached.priceData, timeframe);
        
        console.log(`✅ [PROFESSIONAL] Generated ${ohlcv.length} ${timeframe} candles`);
        return ohlcv;
    }

    /**
     * Step 3: Incremental Updates
     * Add new transactions to existing cache
     */
    async updateCache(tokenAddress) {
        const cached = this.chartCache.get(tokenAddress);
        if (!cached) {
            console.log(`⚠️ [PROFESSIONAL] No existing cache, performing full backfill`);
            return await this.backfillCompleteHistory(tokenAddress);
        }

        console.log(`🔄 [PROFESSIONAL] Fetching new transactions since ${cached.lastTransactionSignature?.substring(0, 8)}...`);
        
        // Fetch recent transactions (last 100)
        const recentTxs = await this.helius.getTransactionHistory(tokenAddress, 100);
        
        // Filter out transactions we already have
        const existingSignatures = new Set(cached.priceData.map(p => p.signature));
        const newTxs = recentTxs.filter(tx => !existingSignatures.has(tx.signature));

        if (newTxs.length === 0) {
            console.log(`✅ [PROFESSIONAL] No new transactions`);
            return { newTransactions: 0, priceData: cached.priceData, buySellData: cached.buySellData };
        }

        console.log(`📊 [PROFESSIONAL] Found ${newTxs.length} new transactions`);
        
        // Parse and extract new data
        const signatures = newTxs.map(tx => tx.signature);
        const parsedTxs = await this.helius.parseTransactions(signatures);
        const { priceData: newPriceData, buySellData: newBuySellData } = 
            this.helius.extractPriceData(parsedTxs, tokenAddress);

        // Merge with existing data (newest first)
        const updatedPriceData = [...newPriceData, ...cached.priceData];
        const updatedBuySellData = [...newBuySellData, ...cached.buySellData];

        // Create updated cache data
        const updatedCacheData = {
            priceData: updatedPriceData,
            buySellData: updatedBuySellData,
            lastUpdated: Date.now(),
            transactionCount: cached.transactionCount + parsedTxs.length,
            batches: cached.batches,
            version: cached.version || 1
        };

        // Atomic write to persistent storage
        const filePath = this.getCacheFilePath(tokenAddress);
        await this.atomicWrite(filePath, updatedCacheData);

        // Update in-memory cache
        this.chartCache.set(tokenAddress, updatedCacheData);

        console.log(`✅ [PROFESSIONAL] Cache updated: ${updatedPriceData.length} total price points (+${newPriceData.length} new)`);
        return { 
            newTransactions: newTxs.length, 
            priceData: updatedPriceData, 
            buySellData: updatedBuySellData 
        };
    }

    /**
     * Load cached data from persistent storage
     */
    async loadFromPersistentCache(tokenAddress) {
        const filePath = this.getCacheFilePath(tokenAddress);
        try {
            const cachedData = await this.atomicRead(filePath);
            if (cachedData && cachedData.priceData && cachedData.priceData.length > 0) {
                // Check if cache is still fresh (within 24 hours)
                const cacheAge = Date.now() - cachedData.lastUpdated;
                if (cacheAge < this.maxCacheAge) {
                    this.chartCache.set(tokenAddress, cachedData);
                    console.log(`📁 [CACHE] Loaded ${cachedData.priceData.length} price points from persistent storage for ${tokenAddress.substring(0, 8)}`);
                    return cachedData;
                } else {
                    console.log(`⚠️ [CACHE] Persistent cache expired for ${tokenAddress.substring(0, 8)} (${Math.round(cacheAge / (60 * 60 * 1000))}h old)`);
                }
            }
        } catch (error) {
            console.log(`⚠️ [CACHE] Failed to load persistent cache for ${tokenAddress.substring(0, 8)}:`, error.message);
        }
        return null;
    }

    /**
     * Step 4: Get Chart Data (Professional Method)
     * 1. Check if we have complete data cached (in-memory first, then persistent)
     * 2. If not, backfill complete history
     * 3. Generate timeframe from cached data
     */
    async getChartData(tokenAddress, timeframe = '5min', limit = 100) {
        console.log(`🎯 [PROFESSIONAL] Getting ${timeframe} chart for ${tokenAddress.substring(0, 8)}`);
        
        // Check if we have cached data (in-memory first)
        let cached = this.chartCache.get(tokenAddress);
        
        // If not in memory, try to load from persistent storage
        if (!cached) {
            cached = await this.loadFromPersistentCache(tokenAddress);
        }
        
        // If still no cache, perform complete backfill
        if (!cached) {
            console.log(`🔄 [PROFESSIONAL] No cache found, backfilling complete history`);
            await this.backfillCompleteHistory(tokenAddress);
            cached = this.chartCache.get(tokenAddress);
        }

        // Generate timeframe from cached data
        const ohlcv = this.generateTimeframeFromCache(tokenAddress, timeframe);
        
        // Apply limit
        const limitedOHLCV = ohlcv.slice(-limit);
        
        return {
            ohlcv: limitedOHLCV,
            priceData: this.chartCache.get(tokenAddress)?.priceData || [],
            buySellData: this.chartCache.get(tokenAddress)?.buySellData || [],
            source: 'helius',
            cached: true,
            totalDataPoints: this.chartCache.get(tokenAddress)?.priceData.length || 0,
            lastUpdated: this.chartCache.get(tokenAddress)?.lastUpdated || 0,
            batches: this.chartCache.get(tokenAddress)?.batches || 0
        };
    }

    /**
     * Step 5: Start Real-Time Updates
     * Called when user opens/stays on chart
     */
    startRealTimeUpdates(tokenAddress, callback) {
        console.log(`🔄 [PROFESSIONAL] Starting real-time updates for ${tokenAddress.substring(0, 8)}`);
        
        // Stop any existing updates for this token
        this.stopRealTimeUpdates(tokenAddress);
        
        // Initial complete backfill
        this.backfillCompleteHistory(tokenAddress).then(() => {
            // Generate initial timeframe data
            const initialData = this.generateTimeframeFromCache(tokenAddress, '5min');
            callback(initialData, 'initial');
            
            // Start incremental updates every 30 seconds
            const intervalId = setInterval(async () => {
                console.log(`🔄 [PROFESSIONAL] Updating ${tokenAddress.substring(0, 8)}...`);
                
                try {
                    const updated = await this.updateCache(tokenAddress);
                    if (updated.newTransactions > 0) {
                        console.log(`📊 [PROFESSIONAL] ${updated.newTransactions} new transactions, regenerating timeframes`);
                        
                        // Regenerate timeframe data
                        const updatedData = this.generateTimeframeFromCache(tokenAddress, '5min');
                        callback(updatedData, 'update');
                    } else {
                        console.log(`✅ [PROFESSIONAL] No new transactions`);
                    }
                } catch (error) {
                    console.error(`❌ [PROFESSIONAL] Update error:`, error.message);
                }
            }, 30000); // 30 seconds
            
            this.updateIntervals.set(tokenAddress, intervalId);
        });
    }

    /**
     * Step 6: Stop Real-Time Updates
     * Called when user closes chart or navigates away
     */
    stopRealTimeUpdates(tokenAddress) {
        const intervalId = this.updateIntervals.get(tokenAddress);
        if (intervalId) {
            clearInterval(intervalId);
            this.updateIntervals.delete(tokenAddress);
            console.log(`⏹️ [PROFESSIONAL] Stopped updates for ${tokenAddress.substring(0, 8)}`);
        }
    }

    /**
     * Get cache statistics for monitoring
     */
    getCacheStats() {
        const stats = {};
        for (const [tokenAddress, cache] of this.chartCache.entries()) {
            stats[tokenAddress.substring(0, 8)] = {
                pricePoints: cache.priceData.length,
                buySellEvents: cache.buySellData.length,
                transactionCount: cache.transactionCount,
                batches: cache.batches,
                lastUpdated: new Date(cache.lastUpdated).toISOString(),
                cacheAge: Date.now() - cache.lastUpdated
            };
        }
        return stats;
    }

    /**
     * Clear cache for a specific token
     */
    clearCache(tokenAddress) {
        this.chartCache.delete(tokenAddress);
        this.stopRealTimeUpdates(tokenAddress);
        console.log(`🗑️ [PROFESSIONAL] Cleared cache for ${tokenAddress.substring(0, 8)}`);
    }

    /**
     * Clear all caches
     */
    clearAllCaches() {
        this.chartCache.clear();
        for (const intervalId of this.updateIntervals.values()) {
            clearInterval(intervalId);
        }
        this.updateIntervals.clear();
        console.log(`🗑️ [PROFESSIONAL] Cleared all caches`);
    }
}

export default ProfessionalChartService;
