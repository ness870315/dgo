import HeliusChartService from './HeliusChartService.js';
import fs from 'fs/promises';
import path from 'path';

class SmartChartService {
    constructor(heliusApiKey) {
        this.heliusService = new HeliusChartService(heliusApiKey);
        this.chartCache = new Map(); // In-memory cache
        this.persistentStorage = './data/chart-cache'; // Persistent storage
        this.activeCharts = new Map(); // Track active chart sessions
        this.realTimeSubscribers = new Map(); // WebSocket subscribers
        this.updateIntervals = new Map(); // Real-time update intervals
        this.chartLastUpdate = new Map(); // Track last update time per chart
        
        // Supported timeframes (matching existing system)
        this.supportedTimeframes = {
            '1MIN': 60 * 1000,           // 1 minute
            '5MIN': 5 * 60 * 1000,       // 5 minutes
            '15MIN': 15 * 60 * 1000,     // 15 minutes
            '1H': 60 * 60 * 1000,        // 1 hour
            '4H': 4 * 60 * 60 * 1000,    // 4 hours
            '1D': 24 * 60 * 60 * 1000,   // 1 day
            '1W': 7 * 24 * 60 * 60 * 1000, // 1 week
            '1M': 30 * 24 * 60 * 60 * 1000, // 1 month (approximate)
            'ALL': 4 * 60 * 60 * 1000    // ALL uses 4H intervals
        };
        
        // Cache durations (matching existing system)
        this.cacheTimes = {
            '1MIN': 1 * 60 * 1000,      // 1 minute
            '5MIN': 5 * 60 * 1000,      // 5 minutes  
            '15MIN': 15 * 60 * 1000,    // 15 minutes
            '1H': 15 * 60 * 1000,       // 15 minutes
            '4H': 30 * 60 * 1000,       // 30 minutes
            '1D': 60 * 60 * 1000,       // 1 hour
            '1W': 4 * 60 * 60 * 1000,   // 4 hours
            '1M': 24 * 60 * 60 * 1000,  // 24 hours
            'ALL': 24 * 60 * 60 * 1000  // 24 hours
        };
        
        // Optimal candle counts (matching existing system)
        this.optimalCandleCounts = {
            '1MIN': { MV: 300, RD: 1440, MP: 5000 },  // ~24 hours
            '5MIN': { MV: 300, RD: 1000, MP: 3000 },  // ~3.5 days  
            '15MIN': { MV: 300, RD: 1000, MP: 3000 }, // ~10.4 days
            '1H': { MV: 300, RD: 1000, MP: 2000 },    // ~41.7 days
            '4H': { MV: 300, RD: 800, MP: 2000 },     // ~133 days
            '1D': { MV: 300, RD: 750, MP: 1500 },     // ~2.1 years
            '1W': { MV: 300, RD: 260, MP: 520 },      // ~5 years
            '1M': { MV: 300, RD: 120, MP: 240 },      // ~10 years
            'ALL': { MV: 300, RD: 240, MP: 480 }      // All time
        };
        
        // Ensure storage directory exists
        this.initializeStorage();
    }

    async initializeStorage() {
        try {
            await fs.mkdir(this.persistentStorage, { recursive: true });
            console.log('✅ Smart Chart storage initialized');
        } catch (error) {
            console.error('❌ Storage initialization failed:', error.message);
        }
    }

    getCacheKey(tokenAddress, timeframe) {
        return `${tokenAddress}_${timeframe}`;
    }

    getStoragePath(tokenAddress, timeframe) {
        const cacheKey = this.getCacheKey(tokenAddress, timeframe);
        return path.join(this.persistentStorage, `${cacheKey}.json`);
    }

    async loadFromStorage(tokenAddress, timeframe) {
        try {
            const storagePath = this.getStoragePath(tokenAddress, timeframe);
            const data = await fs.readFile(storagePath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            return null; // No cached data
        }
    }

    async saveToStorage(tokenAddress, timeframe, data) {
        try {
            const storagePath = this.getStoragePath(tokenAddress, timeframe);
            await fs.writeFile(storagePath, JSON.stringify(data, null, 2));
            console.log(`✅ Chart data saved to storage: ${tokenAddress}`);
        } catch (error) {
            console.error('❌ Storage save failed:', error.message);
        }
    }

    getTimeframeMs(timeframe) {
        return this.supportedTimeframes[timeframe] || this.supportedTimeframes['1H'];
    }

    getOptimalCandleCount(timeframe, tier = 'RD') {
        const timeframeCounts = this.optimalCandleCounts[timeframe] || this.optimalCandleCounts['1D'];
        return timeframeCounts[tier] || timeframeCounts.RD;
    }

    isDataStale(cached, timeframe) {
        const now = Date.now();
        const cacheTime = this.cacheTimes[timeframe] || this.cacheTimes['1H'];
        const dataAge = now - cached.timestamp;
        
        // For intraday timeframes, check if we're in a new period
        if (['1MIN', '5MIN', '15MIN', '1H'].includes(timeframe)) {
            const periodMs = this.getTimeframeMs(timeframe);
            const periodsSinceUpdate = Math.floor(dataAge / periodMs);
            return periodsSinceUpdate > 0;
        }
        
        return dataAge > cacheTime;
    }

    async getChartData(tokenAddress, timeframe = '1H', limit = null, tier = 'RD') {
        const cacheKey = this.getCacheKey(tokenAddress, timeframe);
        const now = Date.now();
        
        // Use optimal candle count if limit not specified
        const optimalLimit = limit || this.getOptimalCandleCount(timeframe, tier);
        
        // Check in-memory cache first
        if (this.chartCache.has(cacheKey)) {
            const cached = this.chartCache.get(cacheKey);
            
            if (!this.isDataStale(cached, timeframe)) {
                console.log(`📊 Using in-memory cache for ${tokenAddress} (${timeframe})`);
                return cached.data;
            } else {
                console.log(`🔄 Cache is stale for ${tokenAddress} (${timeframe}), refreshing...`);
            }
        }

        // Check persistent storage
        const storedData = await this.loadFromStorage(tokenAddress, timeframe);
        if (storedData && !this.isDataStale(storedData, timeframe)) {
            console.log(`💾 Using persistent storage for ${tokenAddress} (${timeframe})`);
            
            // Update in-memory cache
            this.chartCache.set(cacheKey, {
                data: storedData.data,
                timestamp: storedData.timestamp,
                lastUpdate: storedData.lastUpdate
            });
            
            // Check if we need incremental updates
            const timeSinceLastUpdate = now - storedData.lastUpdate;
            const timeframeMs = this.getTimeframeMs(timeframe);
            const expectedCandles = Math.floor(timeSinceLastUpdate / timeframeMs);
            
            if (expectedCandles > 0 && expectedCandles <= 12) {
                console.log(`🔄 Need ${expectedCandles} incremental updates (${Math.floor(timeSinceLastUpdate/60000)} minutes gap)`);
                await this.performIncrementalUpdate(tokenAddress, timeframe, storedData.data, expectedCandles);
            }
            
            return storedData.data;
        }

        // Full backfill for new charts or large gaps
        console.log(`🔄 Full backfill for ${tokenAddress} (${timeframe})`);
        const freshData = await this.heliusService.getChartData(tokenAddress, timeframe, optimalLimit);
        
        // Cache the data
        const cacheData = {
            data: freshData,
            timestamp: now,
            lastUpdate: now
        };
        
        this.chartCache.set(cacheKey, cacheData);
        await this.saveToStorage(tokenAddress, timeframe, cacheData);
        
        console.log(`✅ Full backfill completed for ${tokenAddress} (${timeframe})`);
        return freshData;
    }

    async performIncrementalUpdate(tokenAddress, timeframe, existingData, expectedCandles) {
        console.log(`🔄 Performing incremental update: ${expectedCandles} candles needed`);
        
        try {
            // Get recent transactions to fill the gap
            const recentLimit = Math.min(expectedCandles * 10, 100); // Estimate transactions per candle
            const recentData = await this.heliusService.getChartData(tokenAddress, timeframe, recentLimit);
            
            if (recentData.priceData.length > 0) {
                // Merge new data with existing data
                const mergedPriceData = [...existingData.priceData, ...recentData.priceData];
                const mergedBuySellData = [...existingData.buySellData, ...recentData.buySellData];
                
                // Regenerate OHLCV with merged data
                const mergedOHLCV = this.heliusService.generateOHLCVData(mergedPriceData, timeframe);
                
                const updatedData = {
                    ohlcv: mergedOHLCV,
                    priceData: mergedPriceData,
                    buySellData: mergedBuySellData
                };
                
                // Update cache
                const cacheKey = this.getCacheKey(tokenAddress, timeframe);
                const now = Date.now();
                const cacheData = {
                    data: updatedData,
                    timestamp: now,
                    lastUpdate: now
                };
                
                this.chartCache.set(cacheKey, cacheData);
                await this.saveToStorage(tokenAddress, timeframe, cacheData);
                
                console.log(`✅ Incremental update completed: ${mergedOHLCV.length} total candles`);
                return updatedData;
            }
        } catch (error) {
            console.error('❌ Incremental update failed:', error.message);
            // Fallback to existing data
            return existingData;
        }
        
        return existingData;
    }

    // Special handling for ALL timeframe
    async getChartDataWithTimeRange(tokenAddress, timeframe, startTime, endTime) {
        if (timeframe === 'ALL') {
            // For ALL timeframe, use 4H intervals and fetch from startTime to endTime
            console.log(`📅 ALL timeframe: Fetching from ${new Date(startTime * 1000).toISOString()} to ${new Date(endTime * 1000).toISOString()}`);
            
            // Calculate days since creation
            const daysSinceCreation = (endTime - startTime) / (24 * 60 * 60);
            console.log(`📊 Token age: ${daysSinceCreation.toFixed(1)} days since creation`);
            
            // Use 4H timeframe for all-time view
            const chartData = await this.getChartData(tokenAddress, '4H', 500); // More data for ALL view
            
            // Filter data to the specified time range
            const filteredData = {
                ohlcv: chartData.ohlcv.filter(candle => 
                    candle.timestamp >= startTime && candle.timestamp <= endTime
                ),
                priceData: chartData.priceData.filter(point => 
                    point.timestamp >= startTime && point.timestamp <= endTime
                ),
                buySellData: chartData.buySellData.filter(tx => 
                    tx.timestamp >= startTime && tx.timestamp <= endTime
                )
            };
            
            console.log(`📈 ALL timeframe: Got ${filteredData.ohlcv.length} data points from creation to now`);
            return filteredData;
        }
        
        // For other timeframes, use regular method
        return await this.getChartData(tokenAddress, timeframe);
    }

    async subscribeToRealTimeUpdates(tokenAddress, timeframe, callback) {
        const cacheKey = this.getCacheKey(tokenAddress, timeframe);
        
        // Add subscriber
        if (!this.realTimeSubscribers.has(cacheKey)) {
            this.realTimeSubscribers.set(cacheKey, new Set());
        }
        this.realTimeSubscribers.get(cacheKey).add(callback);
        
        // Start real-time monitoring if not already active
        if (!this.updateIntervals.has(cacheKey)) {
            this.startRealTimeMonitoring(tokenAddress, timeframe);
        }
        
        console.log(`📡 Subscribed to real-time updates for ${tokenAddress} (${timeframe})`);
        
        // Return unsubscribe function
        return () => {
            const subscribers = this.realTimeSubscribers.get(cacheKey);
            if (subscribers) {
                subscribers.delete(callback);
                if (subscribers.size === 0) {
                    this.stopRealTimeMonitoring(cacheKey);
                }
            }
        };
    }

    async startRealTimeMonitoring(tokenAddress, timeframe) {
        const cacheKey = this.getCacheKey(tokenAddress, timeframe);
        
        if (this.updateIntervals.has(cacheKey)) {
            return; // Already monitoring
        }
        
        console.log(`🚀 Starting real-time monitoring for ${tokenAddress} (${timeframe})`);
        
        const interval = setInterval(async () => {
            try {
                await this.updateRealTimeData(tokenAddress, timeframe);
            } catch (error) {
                console.error(`❌ Real-time update error for ${tokenAddress}:`, error.message);
            }
        }, 10000); // Update every 10 seconds
        
        this.updateIntervals.set(cacheKey, interval);
        
        // Initial update
        await this.updateRealTimeData(tokenAddress, timeframe);
    }

    async stopRealTimeMonitoring(cacheKey) {
        const interval = this.updateIntervals.get(cacheKey);
        if (interval) {
            clearInterval(interval);
            this.updateIntervals.delete(cacheKey);
            console.log(`🛑 Stopped real-time monitoring for ${cacheKey}`);
        }
    }

    async updateRealTimeData(tokenAddress, timeframe) {
        const cacheKey = this.getCacheKey(tokenAddress, timeframe);
        
        // Get new transactions
        const newTxs = await this.heliusService.getRealTimeTransactions(tokenAddress);
        
        if (newTxs.length === 0) {
            return; // No new data
        }
        
        console.log(`🔄 Processing ${newTxs.length} new transactions for ${tokenAddress}`);
        
        // Parse new transactions
        const signatures = newTxs.map(tx => tx.signature);
        const parsedTxs = await this.heliusService.parseTransactions(signatures);
        
        if (parsedTxs.length === 0) {
            return;
        }
        
        // Extract new price data
        const { priceData: newPriceData, buySellData: newBuySellData } = 
            this.heliusService.extractPriceData(parsedTxs, tokenAddress);
        
        if (newPriceData.length === 0) {
            return;
        }
        
        // Update cached data
        const cached = this.chartCache.get(cacheKey);
        if (cached) {
            // Add new price data
            cached.data.priceData = [...(cached.data.priceData || []), ...newPriceData];
            cached.data.buySellData = [...(cached.data.buySellData || []), ...newBuySellData];
            
            // Regenerate OHLCV with new data
            cached.data.ohlcv = this.heliusService.generateOHLCVData(cached.data.priceData, timeframe);
            
            // Update timestamp
            const now = Date.now();
            cached.timestamp = now;
            cached.lastUpdate = now;
            
            // Save to persistent storage
            await this.saveToStorage(tokenAddress, timeframe, cached);
            
            // Notify subscribers
            const subscribers = this.realTimeSubscribers.get(cacheKey);
            if (subscribers) {
                subscribers.forEach(callback => {
                    try {
                        callback(cached.data);
                    } catch (error) {
                        console.error('❌ Subscriber callback error:', error.message);
                    }
                });
            }
            
            console.log(`✅ Updated ${tokenAddress} with ${newPriceData.length} new price points`);
        }
    }

    async getCurrentPrice(tokenAddress) {
        const cacheKey = this.getCacheKey(tokenAddress, '1H');
        const cached = this.chartCache.get(cacheKey);
        
        if (cached && cached.data.priceData.length > 0) {
            const latest = cached.data.priceData.sort((a, b) => b.timestamp - a.timestamp)[0];
            return {
                price: latest.price,
                timestamp: latest.timestamp,
                volume: latest.volume
            };
        }
        
        return await this.heliusService.getCurrentPrice(tokenAddress);
    }

    async getRecentTransactions(tokenAddress, limit = 20) {
        const cacheKey = this.getCacheKey(tokenAddress, '1H');
        const cached = this.chartCache.get(cacheKey);
        
        if (cached && cached.data.buySellData.length > 0) {
            return cached.data.buySellData
                .sort((a, b) => b.timestamp - a.timestamp)
                .slice(0, limit);
        }
        
        return await this.heliusService.getRecentTransactions(tokenAddress, limit);
    }

    // Get available timeframes
    getAvailableTimeframes() {
        return Object.keys(this.supportedTimeframes);
    }

    // Get service status
    getStatus() {
        return {
            service: 'SmartChartService',
            helius: 'Connected',
            cache: {
                inMemory: this.chartCache.size,
                activeSubscribers: Array.from(this.realTimeSubscribers.values())
                    .reduce((total, set) => total + set.size, 0),
                activeIntervals: this.updateIntervals.size
            },
            supportedTimeframes: this.getAvailableTimeframes(),
            timestamp: new Date().toISOString()
        };
    }

    // Cleanup method for inactive charts
    async cleanupInactiveCharts() {
        const now = Date.now();
        const inactiveThreshold = 300000; // 5 minutes
        
        for (const [cacheKey, lastUpdate] of this.chartLastUpdate.entries()) {
            if (now - lastUpdate > inactiveThreshold) {
                const subscribers = this.realTimeSubscribers.get(cacheKey);
                if (!subscribers || subscribers.size === 0) {
                    this.stopRealTimeMonitoring(cacheKey);
                    this.chartLastUpdate.delete(cacheKey);
                    console.log(`🧹 Cleaned up inactive chart: ${cacheKey}`);
                }
            }
        }
    }
}

export default SmartChartService;