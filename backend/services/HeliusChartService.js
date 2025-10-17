import fetch from 'node-fetch';

class HeliusChartService {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.baseUrl = 'https://api.helius.xyz/v0';
        this.cache = new Map();
        this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
        
        console.log('🔗 HeliusChartService initialized');
        console.log(`   API Key: ${apiKey ? '✅ Configured' : '❌ Missing'}`);
    }

    /**
     * Get transaction history for a token
     */
    async getTransactionHistory(tokenAddress, limit = 1000, before = null) {
        const logPrefix = `[HELIUS] ${tokenAddress.substring(0, 8)}`;
        console.log(`${logPrefix} 🔄 Fetching transaction history...`);
        
        try {
            const params = new URLSearchParams({
                'api-key': this.apiKey,
                limit: limit.toString()
            });
            
            if (before) {
                params.append('before', before);
            }
            
            const url = `${this.baseUrl}/addresses/${tokenAddress}/transactions?${params}`;
            console.log(`${logPrefix} 📡 Requesting: ${url.replace(this.apiKey, '***')}`);
            
            const response = await fetch(url);
            
            if (!response.ok) {
                throw new Error(`Helius API error: ${response.status} ${response.statusText}`);
            }
            
            const data = await response.json();
            console.log(`${logPrefix} ✅ Received ${data.length} transactions`);
            
            return data;
            
        } catch (error) {
            console.error(`${logPrefix} ❌ Transaction history error:`, error.message);
            throw error;
        }
    }

    /**
     * Parse transactions to extract price data
     */
    parseTransactions(transactions) {
        const logPrefix = '[HELIUS-PARSE]';
        console.log(`${logPrefix} 🔄 Parsing ${transactions.length} transactions...`);
        
        const priceData = [];
        const buySellData = [];
        
        for (const tx of transactions) {
            try {
                // Look for swap transactions
                if (tx.type === 'SWAP' && tx.events?.swap) {
                    const swap = tx.events.swap;
                    
                    // Extract price information
                    if (swap.nativeInput && swap.nativeOutput) {
                        const price = swap.nativeOutput / swap.nativeInput;
                        const volume = swap.nativeInput;
                        
                        priceData.push({
                            timestamp: tx.timestamp,
                            price: price,
                            volume: volume,
                            type: 'swap'
                        });
                        
                        // Determine if it's a buy or sell
                        const isBuy = swap.nativeOutput > swap.nativeInput;
                        buySellData.push({
                            timestamp: tx.timestamp,
                            type: isBuy ? 'buy' : 'sell',
                            volume: volume,
                            price: price
                        });
                    }
                }
            } catch (error) {
                console.warn(`${logPrefix} ⚠️ Failed to parse transaction:`, error.message);
            }
        }
        
        console.log(`${logPrefix} ✅ Extracted ${priceData.length} price points, ${buySellData.length} buy/sell events`);
        
        return { priceData, buySellData };
    }

    /**
     * Generate OHLCV data from price points
     */
    generateOHLCVData(priceData, timeframe = '5MIN') {
        const logPrefix = '[HELIUS-OHLCV]';
        console.log(`${logPrefix} 🔄 Generating ${timeframe} OHLCV from ${priceData.length} price points...`);
        
        const timeframeMs = this.getTimeframeMs(timeframe);
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
     * Get current price from recent transactions
     */
    async getCurrentPrice(tokenAddress) {
        const logPrefix = `[HELIUS-CURRENT] ${tokenAddress.substring(0, 8)}`;
        console.log(`${logPrefix} 🔄 Fetching current price...`);
        
        try {
            const transactions = await this.getTransactionHistory(tokenAddress, 10);
            const { priceData } = this.parseTransactions(transactions);
            
            if (priceData.length > 0) {
                const latest = priceData[priceData.length - 1];
                console.log(`${logPrefix} ✅ Current price: $${latest.price}`);
                
                return {
                    price: latest.price,
                    timestamp: latest.timestamp,
                    volume: latest.volume
                };
            }
            
            console.log(`${logPrefix} ⚠️ No recent price data found`);
            return { price: null, timestamp: null, volume: null };
            
        } catch (error) {
            console.error(`${logPrefix} ❌ Current price error:`, error.message);
            return { price: null, timestamp: null, volume: null };
        }
    }

    /**
     * Convert timeframe string to milliseconds
     */
    getTimeframeMs(timeframe) {
        const timeframes = {
            '1MIN': 60 * 1000,
            '5MIN': 5 * 60 * 1000,
            '15MIN': 15 * 60 * 1000,
            '1H': 60 * 60 * 1000,
            '4H': 4 * 60 * 60 * 1000,
            '1D': 24 * 60 * 60 * 1000,
            '1W': 7 * 24 * 60 * 60 * 1000,
            '1M': 30 * 24 * 60 * 60 * 1000
        };
        
        return timeframes[timeframe] || timeframes['5MIN'];
    }

    /**
     * Check if we have cached data
     */
    getCachedData(key) {
        const cached = this.cache.get(key);
        if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
            return cached.data;
        }
        return null;
    }

    /**
     * Cache data with timestamp
     */
    setCachedData(key, data) {
        this.cache.set(key, {
            data: data,
            timestamp: Date.now()
        });
    }

    /**
     * Clear cache
     */
    clearCache() {
        this.cache.clear();
        console.log('🗑️ HeliusChartService cache cleared');
    }
}

export default HeliusChartService;