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
            const moralisData = await this.hybridPriceService.getHistoricalPrices(tokenAddress, timeframe, limit, null, null, 'RD');
            
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
                    buySellData: [], // Moralis doesn't provide individual transactions
                    dataSource: 'moralis',
                    dataSourceStats: this.dataSourceStats
                };
                
                return convertedData;
            } else {
                this.dataSourceStats.moralis.errors++;
                console.log(`${logPrefix} ❌ Moralis FAILED: No data available`);
                throw new Error('No chart data available from any source');
            }
            
        } catch (error) {
            this.dataSourceStats.moralis.errors++;
            console.log(`${logPrefix} ❌ Moralis FAILED: ${error.message}`);
            throw new Error(`All data sources failed: Helius (${this.dataSourceStats.helius.errors}), Moralis (${this.dataSourceStats.moralis.errors})`);
        }
    }

    async getChartDataWithTimeRange(tokenAddress, timeframe, startTime, endTime) {
        const logPrefix = `[CHART-RANGE] ${tokenAddress.substring(0, 8)} (${timeframe})`;
        
        console.log(`${logPrefix} 🔄 Fetching chart data with time range...`);
        console.log(`${logPrefix} 📅 Range: ${new Date(startTime * 1000).toISOString()} to ${new Date(endTime * 1000).toISOString()}`);
        
        try {
            // Try Helius first
            console.log(`${logPrefix} 🚀 Trying Helius RPC...`);
            this.dataSourceStats.helius.calls++;
            
            const heliusData = await this.smartChartService.getChartDataWithTimeRange(tokenAddress, timeframe, startTime, endTime);
            
            if (heliusData && heliusData.ohlcv && heliusData.ohlcv.length > 0) {
                this.dataSourceStats.helius.success++;
                console.log(`${logPrefix} ✅ Helius SUCCESS: ${heliusData.ohlcv.length} candles`);
                
                heliusData.dataSource = 'helius';
                heliusData.dataSourceStats = this.dataSourceStats;
                
                return heliusData;
            }
            
        } catch (error) {
            this.dataSourceStats.professional.errors++;
            console.log(`${logPrefix} ❌ Professional FAILED: ${error.message}`);
        }
        
        // Fallback to Moralis
        console.log(`${logPrefix} 🔄 Falling back to Moralis...`);
        this.dataSourceStats.moralis.calls++;
        
        try {
            const moralisData = await this.hybridPriceService.getHistoricalPrices(tokenAddress, timeframe, 500, endTime, startTime);
            
            if (moralisData && moralisData.length > 0) {
                this.dataSourceStats.moralis.success++;
                console.log(`${logPrefix} ✅ Moralis SUCCESS: ${moralisData.length} candles`);
                
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
                    buySellData: [],
                    dataSource: 'moralis',
                    dataSourceStats: this.dataSourceStats
                };
                
                return convertedData;
            }
            
        } catch (error) {
            this.dataSourceStats.moralis.errors++;
            console.log(`${logPrefix} ❌ Moralis FAILED: ${error.message}`);
        }
        
        throw new Error('No chart data available from any source');
    }

    async getCurrentPrice(tokenAddress) {
        const logPrefix = `[PRICE] ${tokenAddress.substring(0, 8)}`;
        
        try {
            // Try Professional Chart Service first
            console.log(`${logPrefix} 🚀 Getting current price from Professional Chart Service...`);
            this.dataSourceStats.professional.calls++;
            
            const professionalPrice = await this.professionalChartService.getCurrentPrice(tokenAddress);
            
            if (professionalPrice && professionalPrice.price > 0) {
                this.dataSourceStats.professional.success++;
                console.log(`${logPrefix} ✅ Professional SUCCESS: ${professionalPrice.price.toFixed(8)} SOL`);
                
                return {
                    ...professionalPrice,
                    dataSource: 'professional',
                    dataSourceStats: this.dataSourceStats
                };
            } else {
                console.log(`${logPrefix} ⚠️ Professional returned empty price, trying Moralis...`);
            }
            
        } catch (error) {
            this.dataSourceStats.professional.errors++;
            console.log(`${logPrefix} ❌ Professional FAILED: ${error.message}`);
        }
        
        // Fallback to Moralis
        console.log(`${logPrefix} 🔄 Falling back to Moralis for current price...`);
        this.dataSourceStats.moralis.calls++;
        
        try {
            const moralisData = await this.hybridPriceService.getHistoricalPrices(tokenAddress, '1MIN', 1);
            
            if (moralisData && moralisData.length > 0) {
                const latest = moralisData[moralisData.length - 1];
                this.dataSourceStats.moralis.success++;
                
                console.log(`${logPrefix} ✅ Moralis SUCCESS: ${latest.close.toFixed(8)} SOL`);
                
                return {
                    price: latest.close,
                    timestamp: latest.time,
                    volume: latest.volume || 0,
                    dataSource: 'moralis',
                    dataSourceStats: this.dataSourceStats
                };
            }
            
        } catch (error) {
            this.dataSourceStats.moralis.errors++;
            console.log(`${logPrefix} ❌ Moralis FAILED: ${error.message}`);
        }
        
        throw new Error('No current price available from any source');
    }

    async getRecentTransactions(tokenAddress, limit = 20) {
        const logPrefix = `[TX] ${tokenAddress.substring(0, 8)}`;
        
        try {
            // Try Helius first
            console.log(`${logPrefix} 🚀 Getting recent transactions from Helius...`);
            this.dataSourceStats.helius.calls++;
            
            const heliusTxs = await this.smartChartService.getRecentTransactions(tokenAddress, limit);
            
            if (heliusTxs && heliusTxs.length > 0) {
                this.dataSourceStats.helius.success++;
                console.log(`${logPrefix} ✅ Helius SUCCESS: ${heliusTxs.length} transactions`);
                
                return {
                    transactions: heliusTxs,
                    dataSource: 'helius',
                    dataSourceStats: this.dataSourceStats
                };
            }
            
        } catch (error) {
            this.dataSourceStats.professional.errors++;
            console.log(`${logPrefix} ❌ Professional FAILED: ${error.message}`);
        }
        
        // Moralis doesn't provide individual transactions, return empty
        console.log(`${logPrefix} ⚠️ Moralis doesn't provide individual transactions`);
        
        return {
            transactions: [],
            dataSource: 'none',
            dataSourceStats: this.dataSourceStats
        };
    }

    // Subscribe to real-time updates (Helius only)
    async subscribeToRealTimeUpdates(tokenAddress, timeframe, callback) {
        const logPrefix = `[REALTIME] ${tokenAddress.substring(0, 8)} (${timeframe})`;
        
        console.log(`${logPrefix} 🚀 Subscribing to real-time updates (Helius only)...`);
        
        try {
            const unsubscribe = await this.smartChartService.subscribeToRealTimeUpdates(tokenAddress, timeframe, (data) => {
                console.log(`${logPrefix} 📡 Real-time update: ${data.priceData.length} price points`);
                callback({
                    ...data,
                    dataSource: 'helius',
                    dataSourceStats: this.dataSourceStats
                });
            });
            
            console.log(`${logPrefix} ✅ Real-time subscription active`);
            return unsubscribe;
            
        } catch (error) {
            console.log(`${logPrefix} ❌ Real-time subscription failed: ${error.message}`);
            throw error;
        }
    }

    // Get service status
    getStatus() {
        return {
            service: 'HybridChartService',
            primary: 'Helius RPC',
            fallback: 'Moralis OHLCV',
            stats: this.dataSourceStats,
            timestamp: new Date().toISOString()
        };
    }

    // Get data source statistics
    getDataSourceStats() {
        const totalCalls = this.dataSourceStats.professional.calls + this.dataSourceStats.moralis.calls;
        const professionalSuccessRate = this.dataSourceStats.professional.calls > 0 ? 
            (this.dataSourceStats.professional.success / this.dataSourceStats.professional.calls * 100).toFixed(1) : 0;
        const moralisSuccessRate = this.dataSourceStats.moralis.calls > 0 ? 
            (this.dataSourceStats.moralis.success / this.dataSourceStats.moralis.calls * 100).toFixed(1) : 0;
        
        return {
            totalCalls,
            professional: {
                ...this.dataSourceStats.professional,
                successRate: `${professionalSuccessRate}%`
            },
            moralis: {
                ...this.dataSourceStats.moralis,
                successRate: `${moralisSuccessRate}%`
            }
        };
    }

    // Professional Architecture Methods
    
    /**
     * Start real-time updates for a token
     */
    startRealTimeUpdates(tokenAddress, callback) {
        return this.professionalChartService.startRealTimeUpdates(tokenAddress, callback);
    }

    /**
     * Stop real-time updates for a token
     */
    stopRealTimeUpdates(tokenAddress) {
        return this.professionalChartService.stopRealTimeUpdates(tokenAddress);
    }

    /**
     * Get cache statistics
     */
    getCacheStats() {
        return this.professionalChartService.getCacheStats();
    }

    /**
     * Clear cache for a specific token
     */
    clearCache(tokenAddress) {
        return this.professionalChartService.clearCache(tokenAddress);
    }

    /**
     * Clear all caches
     */
    clearAllCaches() {
        return this.professionalChartService.clearAllCaches();
    }

    /**
     * Force complete backfill for a token
     */
    async forceBackfill(tokenAddress) {
        console.log(`🔄 [HYBRID] Force backfill for ${tokenAddress.substring(0, 8)}`);
        return await this.professionalChartService.backfillCompleteHistory(tokenAddress);
    }
}

export default HybridChartService;
