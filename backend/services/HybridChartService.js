import FastChartService from './FastChartService.js';

class HybridChartService {
    constructor(heliusApiKey, moralisApiKey) {
        try {
            console.log('⚡ Initializing HybridChartService...');
            console.log(`   Moralis API Key: ${moralisApiKey ? '✅ Set' : '❌ Missing'}`);
            
            this.fastChartService = new FastChartService(this); // Pass self reference
            console.log('✅ FastChartService initialized');
            
            // Helius services removed - using DEX stream for real-time data
            this.backgroundWorker = null;
            
            this.dataSourceStats = {
                database: { calls: 0, success: 0, errors: 0 },
                moralis: { calls: 0, success: 0, errors: 0 }
            };
            
            console.log('⚡ HybridChartService initialized with Fast Architecture');
            console.log('   Primary: Fast Chart Service (instant database access)');
            console.log('   Real-time: DEX stream (via EnhancedHybridPriceService)');
            console.log('   Fallback: Moralis OHLCV (when database empty)');
        } catch (error) {
            console.error('❌ Failed to initialize HybridChartService:', error.message);
            console.error('Stack:', error.stack);
            throw error;
        }
    }

    // Background worker removed - using DEX stream for real-time data

    async getChartData(tokenAddress, timeframe = '5MIN', limit = null) {
        const startTime = Date.now();
        
        // Validate and correct token address
        const correctedAddress = this.validateAndCorrectAddress(tokenAddress);
        if (!correctedAddress) {
            throw new Error(`Invalid token address: ${tokenAddress} (too short or invalid format)`);
        }
        
        const logPrefix = `[CHART] ${correctedAddress.substring(0, 8)} (${timeframe})`;
        
        console.log(`${logPrefix} ⚡ Getting chart data instantly...`);
        
        try {
            // Use Fast Chart Service (instant database access)
            this.dataSourceStats.database.calls++;
            
            const chartData = await this.fastChartService.getChartData(correctedAddress, timeframe, limit);
            
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

    /**
     * Get pair/pool address from Jupiter API (for Moralis OHLCV)
     * Moralis needs the pair address, not the token address
     */
    async getPairAddress(contractAddress) {
        try {
            const JUPITER_API_ENDPOINT = process.env.JUP_API_ENDPOINT || 'https://api.jup.ag';
            const JUPITER_API_KEY = process.env.JUP_API_KEY || '';
            
            const headers = {};
            if (JUPITER_API_KEY) {
                headers['x-api-key'] = JUPITER_API_KEY;
            }
            
            // Fetch from Jupiter
            const response = await fetch(`${JUPITER_API_ENDPOINT}/tokens/v2/search?query=${contractAddress}`, {
                method: 'GET',
                headers: headers
            });
            
            if (!response.ok) {
                throw new Error(`Jupiter API error: ${response.status}`);
            }
            
            const data = await response.json();
            if (data && Array.isArray(data) && data.length > 0) {
                const token = data[0];
                
                // Extract pair address from graduatedPool or firstPool
                let pairAddress = null;
                if (token.graduatedPool) {
                    pairAddress = typeof token.graduatedPool === 'string' 
                        ? token.graduatedPool 
                        : token.graduatedPool.address || token.graduatedPool.id;
                } else if (token.firstPool?.id) {
                    pairAddress = token.firstPool.id;
                }
                
                if (pairAddress) {
                    console.log(`✅ [HybridChart] Found pair address for ${contractAddress.substring(0, 8)}: ${pairAddress.substring(0, 8)}`);
                    return pairAddress;
                }
            }
            
            console.log(`⚠️  [HybridChart] No pair address found in Jupiter for ${contractAddress.substring(0, 8)}`);
            return null;
            
        } catch (error) {
            console.error(`❌ [HybridChart] Failed to get pair address:`, error.message);
            return null;
        }
    }

    getDataSourceStats() {
        return this.dataSourceStats;
    }

    // Background worker methods removed - using DEX stream for real-time data
    async addToken(tokenAddress) {
        console.log(`➕ Token ${tokenAddress.substring(0, 8)} will be monitored by DEX stream`);
        return true; // DEX stream automatically monitors all tokens
    }

    async getWorkerStatus() {
        return {
            isRunning: false,
            updateInterval: 0,
            backfillInterval: 0,
            processedPools: 0,
            databaseStats: await this.fastChartService.getDatabaseStats(),
            heliusEnabled: false,
            dexStreamEnabled: true
        };
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

    /**
     * Validate and correct token address
     * Handles truncated addresses like "2PrJoPoR" -> "2PrJoPoRzsm8DNuH6XPcTCtvt8XFzHBxqjwG5UC1pump"
     */
    validateAndCorrectAddress(address) {
        if (!address || typeof address !== 'string') {
            return null;
        }

        // If address is already valid length (32-44 chars), return as-is
        if (address.length >= 32 && address.length <= 44) {
            return address;
        }

        // If address is too short, try to find the full address
        if (address.length < 32) {
            console.log(`⚠️ Address too short: ${address} (${address.length} chars), attempting correction...`);
            
            // Known truncated addresses and their full versions
            const addressMap = {
                '2PrJoPoR': '2PrJoPoRzsm8DNuH6XPcTCtvt8XFzHBxqjwG5UC1pump',
                '8SkoEzQX': '8SkoEzQXUEiCYoppf8eq5ygAEMHETdGsr55eVNent5Tj',
                'GC1uTsxr': 'GC1uTsxrrLAuWby3uWSEMjUXhJMJhhv1SXJ9A1jHvyxp',
                'C2omVhcv': 'C2omVhcvt3DDY77S2KZzawFJQeETZofgZ4eNWWkXpump'
            };

            const correctedAddress = addressMap[address];
            if (correctedAddress) {
                console.log(`✅ Corrected address: ${address} -> ${correctedAddress.substring(0, 8)}...`);
                return correctedAddress;
            }

            console.log(`❌ No correction found for truncated address: ${address}`);
            return null;
        }

        return address;
    }
}

export default HybridChartService;