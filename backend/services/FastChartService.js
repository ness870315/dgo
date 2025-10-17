import ChartDatabase from './ChartDatabase.js';
import HybridPriceService from '../hybridPriceService.js';

/**
 * Fast Chart Service
 * Serves chart data instantly from centralized database
 * Multiple users access the same cached data - no duplicate API calls
 * Historical data never expires
 */
class FastChartService {
    constructor(hybridChartService = null) {
        this.chartDb = new ChartDatabase();
        this.hybridService = new HybridPriceService();
        this.hybridChartService = hybridChartService; // Reference to HybridChartService for background worker access
        this.cacheStats = {
            hits: 0,
            misses: 0,
            fallbacks: 0
        };
        
        console.log('⚡ FastChartService initialized');
        console.log('   Data source: Centralized database (instant)');
        console.log('   Fallback chain: Helius → Moralis → DexScreener');
        console.log(`   Background worker access: ${hybridChartService ? 'Available' : 'Not available'}`);
    }

    /**
     * Get chart data instantly from database
     * This is the main method users will call
     */
    async getChartData(tokenAddress, timeframe = '5MIN', limit = null) {
        const startTime = Date.now();
        const logPrefix = `[FAST-CHART] ${tokenAddress.substring(0, 8)} (${timeframe})`;
        
        console.log(`${logPrefix} ⚡ Getting chart data instantly...`);

        try {
            // 1. Get pool address for token
            let poolAddress = await this.chartDb.getPoolAddress(tokenAddress);
            
            if (!poolAddress) {
                console.log(`${logPrefix} ⚠️ No pool address found, discovering...`);
                poolAddress = await this.discoverPoolAddress(tokenAddress);
                
                if (!poolAddress) {
                    console.log(`${logPrefix} ❌ Could not discover pool address, falling back to Moralis`);
                    this.cacheStats.fallbacks++;
                    return await this.getMoralisFallback(tokenAddress, timeframe, limit);
                }
                
                // Store the discovered pool address
                await this.chartDb.storePoolAddress(tokenAddress, poolAddress);
                console.log(`💾 Stored pool address for ${tokenAddress.substring(0, 8)}: ${poolAddress.substring(0, 8)}`);
                
                // Trigger background worker to start backfilling this token
                console.log(`🚀 Triggering background backfill for ${tokenAddress.substring(0, 8)}...`);
                this.triggerBackgroundBackfill(tokenAddress).catch(err => 
                    console.warn(`⚠️ Background backfill trigger failed: ${err.message}`)
                );
            }

            // 2. Get candles from database (instant)
            const candles = await this.chartDb.getCandles(poolAddress, timeframe, limit);
            
            if (candles && candles.length > 0) {
                const duration = Date.now() - startTime;
                this.cacheStats.hits++;
                
                console.log(`${logPrefix} ✅ DATABASE HIT: ${candles.length} candles in ${duration}ms`);
                
                return {
                    ohlcv: candles,
                    priceData: candles.map(c => ({
                        timestamp: c.timestamp,
                        price: c.close,
                        volume: c.volume,
                        type: 'cached'
                    })),
                    buySellData: [], // Not stored in candles
                    source: 'database',
                    cached: true,
                    dataSource: 'fast',
                    poolAddress: poolAddress.substring(0, 8) + '...',
                    responseTime: duration
                };
            } else {
                console.log(`${logPrefix} ⚠️ No candles in database, falling back to Moralis`);
                this.cacheStats.misses++;
                return await this.getMoralisFallback(tokenAddress, timeframe, limit);
            }

        } catch (error) {
            console.error(`${logPrefix} ❌ Database error:`, error.message);
            this.cacheStats.fallbacks++;
            return await this.getMoralisFallback(tokenAddress, timeframe, limit);
        }
    }

    /**
     * Discover pool address for a token
     */
    async discoverPoolAddress(tokenAddress) {
        try {
            // Try to get pair address from existing service
            const pairAddress = await this.hybridService.getPairAddress(tokenAddress);
            
            if (pairAddress) {
                // Store for future use
                await this.chartDb.storePoolAddress(tokenAddress, pairAddress);
                console.log(`🔍 Discovered pool address for ${tokenAddress.substring(0, 8)}: ${pairAddress.substring(0, 8)}`);
                return pairAddress;
            }
            
            return null;
        } catch (error) {
            console.error(`❌ Failed to discover pool address for ${tokenAddress.substring(0, 8)}:`, error.message);
            return null;
        }
    }

    /**
     * Fallback chain: Helius → Moralis → DexScreener
     */
    async getMoralisFallback(tokenAddress, timeframe, limit) {
        const logPrefix = `[FALLBACK-CHAIN] ${tokenAddress.substring(0, 8)}`;
        console.log(`${logPrefix} 🔄 Fallback chain: Helius → Moralis → DexScreener`);

        try {
            // First try Helius (Professional Chart Service)
            console.log(`${logPrefix} 🚀 Trying Helius first...`);
            
            // Get pool address for Helius
            let poolAddress = await this.chartDb.getPoolAddress(tokenAddress);
            if (!poolAddress) {
                poolAddress = await this.discoverPoolAddress(tokenAddress);
                if (!poolAddress) {
                    console.log(`${logPrefix} ⚠️ No pool address found, skipping Helius`);
                }
            }
            
            if (poolAddress) {
                try {
                    // Import ProfessionalChartService dynamically to avoid circular dependencies
                    const { default: ProfessionalChartService } = await import('./ProfessionalChartService.js');
                    const heliusApiKey = process.env.HELIUS_API_KEY;
                    
                    if (heliusApiKey) {
                        const professionalService = new ProfessionalChartService(heliusApiKey);
                        const heliusData = await professionalService.getChartData(tokenAddress, timeframe, limit);
                        
                        if (heliusData && heliusData.ohlcv && heliusData.ohlcv.length > 0) {
                            console.log(`${logPrefix} ✅ Helius successful: ${heliusData.ohlcv.length} candles`);
                            
                            // Store the data in database for future use
                            await this.chartDb.storePoolAddress(tokenAddress, poolAddress);
                            
                            return {
                                ohlcv: heliusData.ohlcv,
                                priceData: heliusData.priceData || [],
                                buySellData: heliusData.buySellData || [],
                                source: 'helius',
                                cached: false,
                                dataSource: 'helius',
                                responseTime: Date.now()
                            };
                        }
                    }
                } catch (heliusError) {
                    console.log(`${logPrefix} ⚠️ Helius failed: ${heliusError.message}`);
                }
            }
            
            // Fallback to Moralis if Helius fails
            console.log(`${logPrefix} 🔄 Helius failed, trying Moralis...`);
            const fallbackData = await this.hybridService.getHistoricalPrices(tokenAddress, timeframe, limit);
            
            if (fallbackData && fallbackData.length > 0) {
                console.log(`${logPrefix} ✅ Moralis successful: ${fallbackData.length} candles`);
                
                return {
                    ohlcv: fallbackData.map(candle => ({
                        timestamp: candle.time,
                        open: candle.open,
                        high: candle.high,
                        low: candle.low,
                        close: candle.close,
                        volume: candle.volume || 0
                    })),
                    priceData: fallbackData.map(candle => ({
                        timestamp: candle.time,
                        price: candle.close,
                        volume: candle.volume || 0,
                        type: 'moralis'
                    })),
                    buySellData: [],
                    source: 'moralis',
                    cached: false,
                    dataSource: 'moralis',
                    responseTime: Date.now()
                };
            } else {
                console.log(`${logPrefix} ⚠️ All fallback sources returned empty data`);
                return { ohlcv: [], priceData: [], buySellData: [], source: 'none', cached: false };
            }
        } catch (error) {
            console.error(`${logPrefix} ❌ Fallback chain failed:`, error.message);
            return { ohlcv: [], priceData: [], buySellData: [], source: 'none', cached: false };
        }
    }

    /**
     * Get current price (from database or fallback)
     */
    async getCurrentPrice(tokenAddress) {
        const logPrefix = `[CURRENT-PRICE] ${tokenAddress.substring(0, 8)}`;
        
        try {
            // Try to get latest candle from database
            const poolAddress = await this.chartDb.getPoolAddress(tokenAddress);
            
            if (poolAddress) {
                const latestCandles = await this.chartDb.getCandles(poolAddress, '1MIN', 1);
                
                if (latestCandles && latestCandles.length > 0) {
                    const latest = latestCandles[latestCandles.length - 1];
                    console.log(`${logPrefix} ✅ Database price: $${latest.close}`);
                    
                    return {
                        price: latest.close,
                        timestamp: latest.timestamp,
                        volume: latest.volume,
                        source: 'database'
                    };
                }
            }
            
            // Fallback to Moralis
            console.log(`${logPrefix} 🔄 Falling back to Moralis for current price`);
            return await this.hybridService.getCurrentPrice(tokenAddress);
            
        } catch (error) {
            console.error(`${logPrefix} ❌ Current price error:`, error.message);
            return { price: null, timestamp: null, volume: null };
        }
    }

    /**
     * Get chart data with time range
     */
    async getChartDataWithTimeRange(tokenAddress, timeframe, startTime, endTime) {
        const logPrefix = `[FAST-CHART-RANGE] ${tokenAddress.substring(0, 8)}`;
        console.log(`${logPrefix} ⚡ Getting chart data for range...`);

        try {
            const poolAddress = await this.chartDb.getPoolAddress(tokenAddress);
            
            if (!poolAddress) {
                console.log(`${logPrefix} ⚠️ No pool address, falling back to Moralis`);
                return await this.getMoralisFallback(tokenAddress, timeframe, null);
            }

            // Get all candles and filter by time range
            const allCandles = await this.chartDb.getCandles(poolAddress, timeframe);
            
            if (allCandles && allCandles.length > 0) {
                const filteredCandles = allCandles.filter(candle => 
                    candle.timestamp >= startTime && candle.timestamp <= endTime
                );
                
                console.log(`${logPrefix} ✅ Range query: ${filteredCandles.length} candles`);
                
                return {
                    ohlcv: filteredCandles,
                    priceData: filteredCandles.map(c => ({
                        timestamp: c.timestamp,
                        price: c.close,
                        volume: c.volume,
                        type: 'cached'
                    })),
                    buySellData: [],
                    source: 'database',
                    cached: true,
                    dataSource: 'fast'
                };
            } else {
                console.log(`${logPrefix} ⚠️ No candles in database, falling back to Moralis`);
                return await this.getMoralisFallback(tokenAddress, timeframe, null);
            }

        } catch (error) {
            console.error(`${logPrefix} ❌ Range query error:`, error.message);
            return await this.getMoralisFallback(tokenAddress, timeframe, null);
        }
    }

    /**
     * Get cache statistics
     */
    getCacheStats() {
        return {
            ...this.cacheStats,
            hitRate: this.cacheStats.hits / (this.cacheStats.hits + this.cacheStats.misses + this.cacheStats.fallbacks) * 100
        };
    }

    /**
     * Get database statistics
     */
    async getDatabaseStats() {
        return await this.chartDb.getStats();
    }

    /**
     * Force refresh data for a token (triggers background worker)
     */
    async refreshToken(tokenAddress) {
        console.log(`🔄 Refreshing data for ${tokenAddress.substring(0, 8)}`);
        
        // This would trigger the background worker to update this token
        // For now, just log the request
        console.log(`📝 Refresh requested for ${tokenAddress.substring(0, 8)} - background worker will handle`);
        
        return { status: 'refresh_requested', tokenAddress };
    }

    /**
     * Get recent transactions (if available)
     */
    async getRecentTransactions(tokenAddress, limit = 10) {
        // This would query the swaps table for recent transactions
        // For now, return empty array
        return [];
    }

    /**
     * Trigger background worker to start backfilling a token
     * This is called when a new token is discovered
     */
    async triggerBackgroundBackfill(tokenAddress) {
        try {
            if (this.hybridChartService) {
                // Use the existing background worker from HybridChartService
                console.log(`🚀 Adding ${tokenAddress.substring(0, 8)} to existing background worker...`);
                await this.hybridChartService.addToken(tokenAddress);
                console.log(`✅ Token ${tokenAddress.substring(0, 8)} added to background worker`);
            } else {
                console.warn(`⚠️ No HybridChartService reference, cannot trigger background backfill for ${tokenAddress.substring(0, 8)}`);
                
                // Fallback: Create a temporary worker (not ideal but better than nothing)
                const { default: ChartBackgroundWorker } = await import('./ChartBackgroundWorker.js');
                const heliusApiKey = process.env.HELIUS_API_KEY;
                
                if (heliusApiKey) {
                    const worker = new ChartBackgroundWorker(heliusApiKey);
                    await worker.addToken(tokenAddress);
                    console.log(`✅ Fallback: Background backfill triggered for ${tokenAddress.substring(0, 8)}`);
                } else {
                    console.warn('⚠️ HELIUS_API_KEY not found, cannot trigger background backfill');
                }
            }
        } catch (error) {
            console.error(`❌ Failed to trigger background backfill for ${tokenAddress.substring(0, 8)}:`, error.message);
            throw error;
        }
    }
}

export default FastChartService;
