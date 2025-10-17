import HeliusChartService from './HeliusChartService.js';

/**
 * Professional Chart Data Architecture
 * Based on how DexScreener and TradingView handle chart data
 * 
 * Architecture:
 * 1. Complete Historical Backfill → Cache ALL data
 * 2. Timeframe Generation → Create any timeframe from cached data
 * 3. Real-time Updates → Incremental updates when user stays on chart
 */
class ProfessionalChartService {
    constructor(heliusApiKey) {
        this.helius = new HeliusChartService(heliusApiKey);
        this.chartCache = new Map(); // Complete historical data cache
        this.updateIntervals = new Map(); // Track active update intervals
        this.maxCacheAge = 5 * 60 * 1000; // 5 minutes cache expiry
    }

    /**
     * Step 1: Complete Historical Backfill (with pagination)
     * Fetch ALL available transaction data for a token using multiple API calls
     */
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

            // Cache the complete dataset
            this.chartCache.set(tokenAddress, {
                priceData: allPriceData,
                buySellData: allBuySellData,
                lastUpdated: Date.now(),
                transactionCount: allTransactions.length,
                batches: callCount,
                lastTransactionSignature: allTransactions[0]?.signature // Track newest transaction
            });

            console.log(`✅ [PROFESSIONAL] Complete history cached for ${tokenAddress.substring(0, 8)} (${callCount} batches)`);
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

        // Update cache
        this.chartCache.set(tokenAddress, {
            priceData: updatedPriceData,
            buySellData: updatedBuySellData,
            lastUpdated: Date.now(),
            transactionCount: cached.transactionCount + parsedTxs.length,
            batches: cached.batches,
            lastTransactionSignature: newTxs[0]?.signature // Update newest transaction
        });

        console.log(`✅ [PROFESSIONAL] Cache updated: ${updatedPriceData.length} total price points (+${newPriceData.length} new)`);
        return { 
            newTransactions: newTxs.length, 
            priceData: updatedPriceData, 
            buySellData: updatedBuySellData 
        };
    }

    /**
     * Step 4: Get Chart Data (Professional Method)
     * 1. Check if we have complete data cached
     * 2. If not, backfill complete history
     * 3. Generate timeframe from cached data
     */
    async getChartData(tokenAddress, timeframe = '5min', limit = 100) {
        console.log(`🎯 [PROFESSIONAL] Getting ${timeframe} chart for ${tokenAddress.substring(0, 8)}`);
        
        // Check if we have cached data
        const cached = this.chartCache.get(tokenAddress);
        const cacheAge = cached ? Date.now() - cached.lastUpdated : Infinity;

        if (!cached || cacheAge > this.maxCacheAge) {
            console.log(`🔄 [PROFESSIONAL] Cache miss or expired, backfilling complete history`);
            await this.backfillCompleteHistory(tokenAddress);
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
