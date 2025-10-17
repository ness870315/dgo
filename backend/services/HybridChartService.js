import HybridPriceService from '../hybridPriceService.js';

class HybridChartService {
    constructor(heliusApiKey, moralisApiKey) {
        this.hybridPriceService = new HybridPriceService();
        this.dataSourceStats = {
            moralis: { calls: 0, success: 0, errors: 0 }
        };
        
        console.log('🔄 HybridChartService initialized with simplified architecture');
        console.log('   Data Source: Moralis OHLCV (reliable and stable)');
    }

    async getChartData(tokenAddress, timeframe = '5MIN', limit = null) {
        const startTime = Date.now();
        const logPrefix = `[CHART] ${tokenAddress.substring(0, 8)} (${timeframe})`;
        
        console.log(`${logPrefix} 🔄 Fetching chart data...`);
        
        try {
            // Use HybridPriceService (Moralis OHLCV)
            console.log(`${logPrefix} 🚀 Using Moralis OHLCV...`);
            this.dataSourceStats.moralis.calls++;
            
            const moralisData = await this.hybridPriceService.getHistoricalPrices(tokenAddress, timeframe, limit, null, null);
            
            if (moralisData && moralisData.length > 0) {
                const duration = Date.now() - startTime;
                this.dataSourceStats.moralis.success++;
                
                console.log(`${logPrefix} ✅ Moralis SUCCESS: ${moralisData.length} candles in ${duration}ms`);
                
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

    // Simple cache management methods (no-op for now)
    async clearCache(tokenAddress = null) {
        console.log('🔄 Cache cleared (simplified architecture)');
        return true;
    }

    async getCacheStats() {
        return {
            totalCached: 0,
            cacheHits: 0,
            cacheMisses: 0,
            dataSourceStats: this.dataSourceStats
        };
    }
}

export default HybridChartService;