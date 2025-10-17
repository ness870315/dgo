import ProfessionalChartService from './ProfessionalChartService.js';
import HybridPriceService from '../hybridPriceService.js';

class HybridChartService {
    constructor(heliusApiKey, moralisApiKey) {
        this.professionalChartService = new ProfessionalChartService(heliusApiKey);
        this.hybridPriceService = new HybridPriceService();
        this.dataSourceStats = {
            professional: { calls: 0, success: 0, errors: 0 },
            moralis: { calls: 0, success: 0, errors: 0 }
        };
        
        console.log('🔄 HybridChartService initialized with Professional Architecture');
        console.log('   Primary: Professional Chart Service (complete backfill + timeframe generation)');
        console.log('   Fallback: Moralis OHLCV (aggregated data)');
    }

    async getChartData(tokenAddress, timeframe = '5MIN', limit = null) {
        const startTime = Date.now();
        const logPrefix = `[CHART] ${tokenAddress.substring(0, 8)} (${timeframe})`;
        
        console.log(`${logPrefix} 🔄 Fetching chart data...`);
        
        try {
            // Try Professional Chart Service first (primary)
            console.log(`${logPrefix} 🚀 Trying Professional Chart Service...`);
            this.dataSourceStats.professional.calls++;
            
            const professionalData = await this.professionalChartService.getChartData(tokenAddress, timeframe.toLowerCase(), limit);
            
            if (professionalData && professionalData.ohlcv && professionalData.ohlcv.length > 0) {
                const duration = Date.now() - startTime;
                this.dataSourceStats.professional.success++;
                
                console.log(`${logPrefix} ✅ Professional SUCCESS: ${professionalData.ohlcv.length} candles in ${duration}ms`);
                console.log(`${logPrefix} 📊 Data: ${professionalData.priceData.length} price points, ${professionalData.buySellData.length} transactions`);
                console.log(`${logPrefix} 📊 Source: ${professionalData.source}, Cached: ${professionalData.cached}, Batches: ${professionalData.batches}`);
                
                // Add data source metadata
                professionalData.dataSource = 'professional';
                professionalData.dataSourceStats = this.dataSourceStats;
                
                return professionalData;
            } else {
                console.log(`${logPrefix} ⚠️ Professional returned empty data, trying Moralis...`);
            }
            
        } catch (error) {
            this.dataSourceStats.professional.errors++;
            console.log(`${logPrefix} ❌ Professional FAILED: ${error.message}`);
        }
        
        // Fallback to Moralis
        console.log(`${logPrefix} 🔄 Falling back to Moralis...`);
        this.dataSourceStats.moralis.calls++;
        
        try {
            const moralisData = await this.hybridPriceService.getHistoricalPrices(tokenAddress, timeframe, limit, null, null);
            
            if (moralisData && moralisData.length > 0) {
                const duration = Date.now() - startTime;
                this.dataSourceStats.moralis.success++;
                
                console.log(`${logPrefix} ✅ Moralis SUCCESS: ${moralisData.length} candles in ${duration}ms`);
                
                // Convert Moralis format to Helius format for consistency
                const convertedData = {
                    ohlcv: moralisData.map(candle => ({
                        timestamp: candle.time,
                        open: candle.open,
                        high: candle.high,
                        low: candle.low,
                        close: candle.close,
                        volume: candle.volume || 0
                    })),
                    priceData: moralisData.map(candle => ({
                        timestamp: candle.time,
                        price: candle.close,
                        volume: candle.volume || 0,
                        type: 'aggregated'
                    })),
                    buySellData: [], // Moralis doesn't provide this directly
                    source: 'moralis',
                    cached: false,
                    dataSourceStats: this.dataSourceStats
                };
                return convertedData;
            } else {
                console.log(`${logPrefix} ⚠️ Moralis also returned empty data.`);
            }
        } catch (error) {
            this.dataSourceStats.moralis.errors++;
            console.error(`${logPrefix} ❌ Moralis FAILED: ${error.message}`);
        }
        
        return { ohlcv: [], priceData: [], buySellData: [], source: 'none', cached: false, dataSourceStats: this.dataSourceStats };
    }

    async getChartDataWithTimeRange(tokenAddress, timeframe, startTime, endTime) {
        const logPrefix = `[CHART-RANGE] ${tokenAddress.substring(0, 8)} (${timeframe})`;
        console.log(`${logPrefix} 🔄 Fetching chart data for range...`);
        
        try {
            // Use HybridPriceService (Moralis OHLCV)
            console.log(`${logPrefix} 🚀 Using Moralis OHLCV...`);
            this.dataSourceStats.moralis.calls++;
            
            const moralisData = await this.hybridPriceService.getHistoricalPrices(tokenAddress, timeframe, 500, startTime, endTime);
            
            if (moralisData && moralisData.length > 0) {
                this.dataSourceStats.moralis.success++;
                
                console.log(`${logPrefix} ✅ Moralis SUCCESS: ${moralisData.length} candles`);
                
                // Convert Moralis format to consistent format
                const convertedData = {
                    ohlcv: moralisData.map(candle => ({
                        timestamp: candle.time,
                        open: candle.open,
                        high: candle.high,
                        low: candle.low,
                        close: candle.close,
                        volume: candle.volume || 0
                    })),
                    priceData: moralisData.map(candle => ({
                        timestamp: candle.time,
                        price: candle.close,
                        volume: candle.volume || 0,
                        type: 'aggregated'
                    })),
                    buySellData: [], // Moralis doesn't provide this directly
                    source: 'moralis',
                    cached: false,
                    dataSourceStats: this.dataSourceStats
                };
                
                return convertedData;
            } else {
                console.log(`${logPrefix} ⚠️ Moralis returned empty data`);
            }
            
        } catch (error) {
            this.dataSourceStats.moralis.errors++;
            console.log(`${logPrefix} ❌ Moralis FAILED: ${error.message}`);
        }
        
        return { ohlcv: [], priceData: [], buySellData: [], source: 'none', cached: false, dataSourceStats: this.dataSourceStats };
    }

    async getCurrentPrice(tokenAddress) {
        const logPrefix = `[CURRENT-PRICE] ${tokenAddress.substring(0, 8)}`;
        console.log(`${logPrefix} 🔄 Fetching current price...`);
        
        try {
            // Use HybridPriceService for current price
            const priceData = await this.hybridPriceService.getCurrentPrice(tokenAddress);
            
            if (priceData && priceData.price) {
                console.log(`${logPrefix} ✅ Current price: $${priceData.price}`);
                return priceData;
            } else {
                console.log(`${logPrefix} ⚠️ No current price data`);
            }
            
        } catch (error) {
            console.log(`${logPrefix} ❌ FAILED: ${error.message}`);
        }
        
        return { price: null, timestamp: null, volume: null };
    }

    getDataSourceStats() {
        return this.dataSourceStats;
    }

    // Professional Chart Service methods
    async forceBackfill(tokenAddress) {
        return await this.professionalChartService.performCompleteBackfill(tokenAddress);
    }

    async clearCache(tokenAddress = null) {
        if (tokenAddress) {
            this.professionalChartService.clearCache(tokenAddress);
        } else {
            this.professionalChartService.clearAllCaches();
        }
        return true;
    }

    async getCacheStats() {
        const professionalStats = this.professionalChartService.getCacheStats();
        return {
            ...professionalStats,
            dataSourceStats: this.dataSourceStats
        };
    }

    async getCurrentPrice(tokenAddress) {
        // Try Professional Chart Service first
        try {
            const professionalPrice = await this.professionalChartService.getCurrentPrice(tokenAddress);
            if (professionalPrice && professionalPrice.price) {
                return professionalPrice;
            }
        } catch (error) {
            console.log(`[CURRENT-PRICE] Professional failed, trying Moralis: ${error.message}`);
        }

        // Fallback to Moralis
        try {
            const moralisPrice = await this.hybridPriceService.getCurrentPrice(tokenAddress);
            return moralisPrice;
        } catch (error) {
            console.error(`[CURRENT-PRICE] Moralis also failed: ${error.message}`);
            return { price: null, timestamp: null, volume: null };
        }
    }
}

export default HybridChartService;