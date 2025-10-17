import HeliusChartService from './HeliusChartService.js';
import fs from 'fs';
import path from 'path';

class ProfessionalChartService {
    constructor(heliusApiKey) {
        this.heliusService = new HeliusChartService(heliusApiKey);
        this.chartCache = new Map();
        this.cacheDir = path.join(process.cwd(), 'data', 'chart-cache');
        
        // Ensure cache directory exists
        this.ensureCacheDir();
        
        console.log('🏗️ ProfessionalChartService initialized');
        console.log(`   Cache Directory: ${this.cacheDir}`);
        console.log('   Features: Complete backfill + Timeframe generation + Persistent cache');
    }

    /**
     * Ensure cache directory exists
     */
    ensureCacheDir() {
        if (!fs.existsSync(this.cacheDir)) {
            fs.mkdirSync(this.cacheDir, { recursive: true });
            console.log(`📁 Created cache directory: ${this.cacheDir}`);
        }
    }

    /**
     * Get chart data with complete backfill
     */
    async getChartData(tokenAddress, timeframe = '5MIN', limit = null) {
        const logPrefix = `[PROFESSIONAL] ${tokenAddress.substring(0, 8)} (${timeframe})`;
        console.log(`${logPrefix} 🔄 Getting chart data...`);
        
        try {
            // Check if we have cached data
            const cachedData = this.getCachedData(tokenAddress);
            
            if (cachedData) {
                console.log(`${logPrefix} ✅ Using cached data: ${cachedData.priceData.length} price points`);
                
                // Generate timeframe-specific OHLCV
                const ohlcv = this.generateTimeframeOHLCV(cachedData.priceData, timeframe);
                const buySellData = this.filterBuySellByTimeframe(cachedData.buySellData, timeframe);
                
                return {
                    ohlcv: ohlcv,
                    priceData: cachedData.priceData,
                    buySellData: buySellData,
                    source: 'professional-cached',
                    cached: true,
                    batches: cachedData.batches || 0
                };
            }
            
            // No cached data - perform complete backfill
            console.log(`${logPrefix} 🔄 No cached data found, performing complete backfill...`);
            const backfillResult = await this.performCompleteBackfill(tokenAddress);
            
            // Generate timeframe-specific OHLCV
            const ohlcv = this.generateTimeframeOHLCV(backfillResult.priceData, timeframe);
            const buySellData = this.filterBuySellByTimeframe(backfillResult.buySellData, timeframe);
            
            return {
                ohlcv: ohlcv,
                priceData: backfillResult.priceData,
                buySellData: buySellData,
                source: 'professional-backfill',
                cached: false,
                batches: backfillResult.batches
            };
            
        } catch (error) {
            console.error(`${logPrefix} ❌ Professional chart error:`, error.message);
            throw error;
        }
    }

    /**
     * Perform complete historical backfill
     */
    async performCompleteBackfill(tokenAddress) {
        const logPrefix = `[BACKFILL] ${tokenAddress.substring(0, 8)}`;
        console.log(`${logPrefix} 🔄 Starting complete backfill...`);
        
        let allPriceData = [];
        let allBuySellData = [];
        let before = null;
        let batchCount = 0;
        const maxBatches = 50; // Safety limit
        
        try {
            while (batchCount < maxBatches) {
                batchCount++;
                console.log(`${logPrefix} 📦 Batch ${batchCount}...`);
                
                const transactions = await this.heliusService.getTransactionHistory(
                    tokenAddress, 
                    1000, 
                    before
                );
                
                if (transactions.length === 0) {
                    console.log(`${logPrefix} ✅ No more transactions, backfill complete`);
                    break;
                }
                
                const { priceData, buySellData } = this.heliusService.parseTransactions(transactions);
                
                allPriceData.push(...priceData);
                allBuySellData.push(...buySellData);
                
                // Set before for next batch
                before = transactions[transactions.length - 1].signature;
                
                console.log(`${logPrefix} 📊 Batch ${batchCount}: ${priceData.length} price points, ${buySellData.length} events`);
                
                // Small delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            // Sort all data by timestamp
            allPriceData.sort((a, b) => a.timestamp - b.timestamp);
            allBuySellData.sort((a, b) => a.timestamp - b.timestamp);
            
            console.log(`${logPrefix} ✅ Backfill complete: ${allPriceData.length} price points, ${allBuySellData.length} events`);
            
            // Cache the complete dataset
            this.cacheCompleteData(tokenAddress, {
                priceData: allPriceData,
                buySellData: allBuySellData,
                batches: batchCount,
                timestamp: Date.now()
            });
            
            return {
                priceData: allPriceData,
                buySellData: allBuySellData,
                batches: batchCount
            };
            
        } catch (error) {
            console.error(`${logPrefix} ❌ Backfill error:`, error.message);
            throw error;
        }
    }

    /**
     * Generate OHLCV data for specific timeframe
     */
    generateTimeframeOHLCV(priceData, timeframe) {
        const logPrefix = '[TIMEFRAME-OHLCV]';
        console.log(`${logPrefix} 🔄 Generating ${timeframe} OHLCV from ${priceData.length} price points...`);
        
        const timeframeMs = this.heliusService.getTimeframeMs(timeframe);
        const candles = new Map();
        
        // Group price data by timeframe
        for (const point of priceData) {
            const candleTime = Math.floor(point.timestamp / timeframeMs) * timeframeMs;
            
            if (!candles.has(candleTime)) {
                candles.set(candleTime, {
                    timestamp: candleTime,
                    open: point.price,
                    high: point.price,
                    low: point.price,
                    close: point.price,
                    volume: point.volume || 0
                });
            } else {
                const candle = candles.get(candleTime);
                candle.high = Math.max(candle.high, point.price);
                candle.low = Math.min(candle.low, point.price);
                candle.close = point.price; // Last price in timeframe
                candle.volume += point.volume || 0;
            }
        }
        
        const ohlcvArray = Array.from(candles.values())
            .sort((a, b) => a.timestamp - b.timestamp);
        
        console.log(`${logPrefix} ✅ Generated ${ohlcvArray.length} ${timeframe} candles`);
        
        return ohlcvArray;
    }

    /**
     * Filter buy/sell data by timeframe
     */
    filterBuySellByTimeframe(buySellData, timeframe) {
        const timeframeMs = this.heliusService.getTimeframeMs(timeframe);
        const now = Date.now();
        const cutoff = now - (timeframeMs * 100); // Last 100 timeframes
        
        return buySellData.filter(event => event.timestamp >= cutoff);
    }

    /**
     * Cache complete dataset to disk
     */
    cacheCompleteData(tokenAddress, data) {
        const cacheKey = this.getCacheKey(tokenAddress);
        const cacheFile = path.join(this.cacheDir, `${cacheKey}.json`);
        
        try {
            // Atomic write to prevent corruption
            const tempFile = `${cacheFile}.tmp`;
            fs.writeFileSync(tempFile, JSON.stringify(data, null, 2));
            fs.renameSync(tempFile, cacheFile);
            
            // Also cache in memory
            this.chartCache.set(cacheKey, data);
            
            console.log(`💾 Cached complete data for ${tokenAddress.substring(0, 8)}: ${data.priceData.length} price points`);
            
        } catch (error) {
            console.error(`❌ Failed to cache data for ${tokenAddress.substring(0, 8)}:`, error.message);
        }
    }

    /**
     * Get cached data from disk or memory
     */
    getCachedData(tokenAddress) {
        const cacheKey = this.getCacheKey(tokenAddress);
        
        // Check memory cache first
        if (this.chartCache.has(cacheKey)) {
            return this.chartCache.get(cacheKey);
        }
        
        // Check disk cache
        const cacheFile = path.join(this.cacheDir, `${cacheKey}.json`);
        
        if (fs.existsSync(cacheFile)) {
            try {
                const data = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
                
                // Cache in memory for faster access
                this.chartCache.set(cacheKey, data);
                
                console.log(`📁 Loaded cached data for ${tokenAddress.substring(0, 8)} from disk`);
                return data;
                
            } catch (error) {
                console.error(`❌ Failed to load cached data for ${tokenAddress.substring(0, 8)}:`, error.message);
            }
        }
        
        return null;
    }

    /**
     * Get cache key for token
     */
    getCacheKey(tokenAddress) {
        return `chart_${tokenAddress}`;
    }

    /**
     * Clear cache for specific token
     */
    clearCache(tokenAddress) {
        const cacheKey = this.getCacheKey(tokenAddress);
        
        // Clear memory cache
        this.chartCache.delete(cacheKey);
        
        // Clear disk cache
        const cacheFile = path.join(this.cacheDir, `${cacheKey}.json`);
        if (fs.existsSync(cacheFile)) {
            fs.unlinkSync(cacheFile);
        }
        
        console.log(`🗑️ Cleared cache for ${tokenAddress.substring(0, 8)}`);
    }

    /**
     * Clear all caches
     */
    clearAllCaches() {
        // Clear memory cache
        this.chartCache.clear();
        
        // Clear disk cache
        if (fs.existsSync(this.cacheDir)) {
            const files = fs.readdirSync(this.cacheDir);
            for (const file of files) {
                if (file.endsWith('.json')) {
                    fs.unlinkSync(path.join(this.cacheDir, file));
                }
            }
        }
        
        console.log('🗑️ Cleared all professional chart caches');
    }

    /**
     * Get cache statistics
     */
    getCacheStats() {
        const memoryCacheSize = this.chartCache.size;
        let diskCacheSize = 0;
        
        if (fs.existsSync(this.cacheDir)) {
            const files = fs.readdirSync(this.cacheDir);
            diskCacheSize = files.filter(file => file.endsWith('.json')).length;
        }
        
        return {
            memoryCacheSize,
            diskCacheSize,
            totalCached: memoryCacheSize + diskCacheSize,
            cacheDir: this.cacheDir
        };
    }

    /**
     * Get current price
     */
    async getCurrentPrice(tokenAddress) {
        return await this.heliusService.getCurrentPrice(tokenAddress);
    }
}

export default ProfessionalChartService;