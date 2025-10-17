import FastChartService from './FastChartService.js';
import ChartBackgroundWorker from './ChartBackgroundWorker.js';

class HybridChartService {
    constructor(heliusApiKey, moralisApiKey) {
        this.fastChartService = new FastChartService();
        this.backgroundWorker = new ChartBackgroundWorker(heliusApiKey);
        this.dataSourceStats = {
            database: { calls: 0, success: 0, errors: 0 },
            moralis: { calls: 0, success: 0, errors: 0 }
        };
        
        console.log('⚡ HybridChartService initialized with Fast Architecture');
        console.log('   Primary: Fast Chart Service (instant database access)');
        console.log('   Background: Continuous data ingestion');
        console.log('   Fallback: Moralis OHLCV (when database empty)');
        
        // Start background worker
        this.startBackgroundWorker();
    }

    async startBackgroundWorker() {
        try {
            await this.backgroundWorker.start();
            console.log('✅ Background worker started');
        } catch (error) {
            console.error('❌ Failed to start background worker:', error.message);
        }
    }

    async getChartData(tokenAddress, timeframe = '5MIN', limit = null) {
        const startTime = Date.now();
        const logPrefix = `[CHART] ${tokenAddress.substring(0, 8)} (${timeframe})`;
        
        console.log(`${logPrefix} ⚡ Getting chart data instantly...`);
        
        try {
            // Use Fast Chart Service (instant database access)
            this.dataSourceStats.database.calls++;
            
            const chartData = await this.fastChartService.getChartData(tokenAddress, timeframe, limit);
            
            if (chartData && chartData.ohlcv && chartData.ohlcv.length > 0) {
                const duration = Date.now() - startTime;
                this.dataSourceStats.database.success++;
                
                console.log(`${logPrefix} ✅ FAST SUCCESS: ${chartData.ohlcv.length} candles in ${duration}ms`);
                console.log(`${logPrefix} 📊 Source: ${chartData.source}, DataSource: ${chartData.dataSource}`);
                
                // Add data source metadata
                chartData.dataSourceStats = this.dataSourceStats;
                chartData.responseTime = duration;
                
                return chartData;
            } else {
                console.log(`${logPrefix} ⚠️ Fast service returned empty data`);
                this.dataSourceStats.database.errors++;
                return { ohlcv: [], priceData: [], buySellData: [], source: 'none', cached: false };
            }
            
        } catch (error) {
            this.dataSourceStats.database.errors++;
            console.error(`${logPrefix} ❌ Fast service FAILED:`, error.message);
            return { ohlcv: [], priceData: [], buySellData: [], source: 'none', cached: false };
        }
    }

    async getChartDataWithTimeRange(tokenAddress, timeframe, startTime, endTime) {
        const logPrefix = `[CHART-RANGE] ${tokenAddress.substring(0, 8)} (${timeframe})`;
        console.log(`${logPrefix} ⚡ Getting chart data for range...`);

        try {
            // Use Fast Chart Service for range queries
            this.dataSourceStats.database.calls++;
            const chartData = await this.fastChartService.getChartDataWithTimeRange(tokenAddress, timeframe, startTime, endTime);

            if (chartData && chartData.ohlcv && chartData.ohlcv.length > 0) {
                this.dataSourceStats.database.success++;
                chartData.dataSourceStats = this.dataSourceStats;
                return chartData;
            } else {
                console.log(`${logPrefix} ⚠️ Fast service returned empty data for range`);
                this.dataSourceStats.database.errors++;
                return { ohlcv: [], priceData: [], buySellData: [], source: 'none', cached: false };
            }
        } catch (error) {
            this.dataSourceStats.database.errors++;
            console.error(`${logPrefix} ❌ Fast service range FAILED:`, error.message);
            return { ohlcv: [], priceData: [], buySellData: [], source: 'none', cached: false };
        }
    }

    async getPriceChart(tokenAddress, timeframe = '5MIN', limit = null) {
        return this.getChartData(tokenAddress, timeframe, limit);
    }

    async getCurrentPrice(tokenAddress) {
        const logPrefix = `[CURRENT-PRICE] ${tokenAddress.substring(0, 8)}`;
        console.log(`${logPrefix} ⚡ Getting current price...`);
        
        try {
            // Use Fast Chart Service for current price
            this.dataSourceStats.database.calls++;
            const priceData = await this.fastChartService.getCurrentPrice(tokenAddress);
            
            if (priceData && priceData.price) {
                this.dataSourceStats.database.success++;
                console.log(`${logPrefix} ✅ Database price: $${priceData.price}`);
                return { ...priceData, source: 'database' };
            } else {
                console.log(`${logPrefix} ⚠️ No database price, falling back to Moralis`);
                this.dataSourceStats.database.errors++;
            }
            
        } catch (error) {
            this.dataSourceStats.database.errors++;
            console.error(`${logPrefix} ❌ Database price FAILED:`, error.message);
        }
        
        // Fallback to Moralis
        try {
            this.dataSourceStats.moralis.calls++;
            const moralisPrice = await this.fastChartService.getMoralisFallback(tokenAddress, '1MIN', 1);
            
            if (moralisPrice && moralisPrice.priceData && moralisPrice.priceData.length > 0) {
                this.dataSourceStats.moralis.success++;
                const latest = moralisPrice.priceData[moralisPrice.priceData.length - 1];
                console.log(`${logPrefix} ✅ Moralis price: $${latest.price}`);
                return { ...latest, source: 'moralis' };
            }
        } catch (error) {
            this.dataSourceStats.moralis.errors++;
            console.error(`${logPrefix} ❌ Moralis price FAILED:`, error.message);
        }
        
        return { price: null, timestamp: null, volume: null, source: 'none' };
    }

    getDataSourceStats() {
        return this.dataSourceStats;
    }

    // Background Worker methods
    async addToken(tokenAddress) {
        console.log(`➕ Adding token ${tokenAddress.substring(0, 8)} to background worker`);
        return await this.backgroundWorker.addToken(tokenAddress);
    }

    async getWorkerStatus() {
        return await this.backgroundWorker.getStatus();
    }

    // Database methods
    async getDatabaseStats() {
        return await this.fastChartService.getDatabaseStats();
    }

    async getCacheStats() {
        return this.fastChartService.getCacheStats();
    }

    async refreshToken(tokenAddress) {
        return await this.fastChartService.refreshToken(tokenAddress);
    }

    async getRecentTransactions(tokenAddress, limit = 10) {
        return await this.fastChartService.getRecentTransactions(tokenAddress, limit);
    }

    /**
     * Force backfill for a specific token
     */
    async forceBackfill(tokenAddress) {
        console.log(`🔄 [HYBRID] Force backfill for ${tokenAddress.substring(0, 8)}`);
        
        try {
            // Add token to background worker
            await this.addToken(tokenAddress);
            
            // Get current price data to trigger processing
            const priceData = await this.getCurrentPrice(tokenAddress);
            
            // Get chart data to ensure background worker processes it
            const chartData = await this.getChartData(tokenAddress, '5MIN', 10);
            
            return {
                success: true,
                priceData: priceData ? [priceData] : [],
                buySellData: [],
                message: `Force backfill initiated for ${tokenAddress.substring(0, 8)}`
            };
            
        } catch (error) {
            console.error(`❌ [HYBRID] Force backfill failed for ${tokenAddress.substring(0, 8)}:`, error.message);
            return {
                success: false,
                priceData: [],
                buySellData: [],
                error: error.message
            };
        }
    }
}

export default HybridChartService;