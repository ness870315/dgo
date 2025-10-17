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
     * Parse transactions to extract price data from tokenTransfers
     */
    parseTransactions(transactions) {
        const logPrefix = '[HELIUS-PARSE]';
        console.log(`${logPrefix} 🔄 Parsing ${transactions.length} transactions...`);
        
        const priceData = [];
        const buySellData = [];
        
        // Token addresses for base tokens
        const BASE_TOKENS = {
            'So11111111111111111111111111111111111111112': 'SOL', // Wrapped SOL
            'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': 'USDC',
            'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': 'USDT'
        };
        
        for (const tx of transactions) {
            try {
                // Look for transactions with tokenTransfers (swaps)
                if (tx.tokenTransfers && tx.tokenTransfers.length >= 2) {
                    const transfers = tx.tokenTransfers;
                    
                    // Find base token and target token transfers
                    let baseTransfer = null;
                    let targetTransfer = null;
                    
                    for (const transfer of transfers) {
                        if (BASE_TOKENS[transfer.mint]) {
                            baseTransfer = transfer;
                        } else if (transfer.mint !== 'So11111111111111111111111111111111111111112') {
                            targetTransfer = transfer;
                        }
                    }
                    
                    // If we found both base and target transfers, calculate price
                    if (baseTransfer && targetTransfer) {
                        const baseToken = BASE_TOKENS[baseTransfer.mint];
                        const baseAmount = baseTransfer.tokenAmount;
                        const targetAmount = targetTransfer.tokenAmount;
                        
                        if (baseAmount > 0 && targetAmount > 0) {
                            const price = baseAmount / targetAmount; // Price per token in base currency
                            
                            priceData.push({
                                timestamp: tx.timestamp * 1000, // Convert to milliseconds
                                price: price,
                                volume: baseAmount,
                                baseToken: baseToken,
                                tokenAmount: targetAmount,
                                type: 'swap'
                            });
                            
                            // Determine if it's a buy or sell based on transfer direction
                            // Buy: Receiving target tokens (positive targetAmount)
                            // Sell: Sending target tokens (negative targetAmount)
                            const isBuy = targetAmount > 0;
                            buySellData.push({
                                timestamp: tx.timestamp * 1000,
                                type: isBuy ? 'buy' : 'sell',
                                volume: baseAmount,
                                price: price,
                                baseToken: baseToken,
                                tokenAmount: targetAmount
                            });
                            
                            console.log(`${logPrefix} 📊 ${baseToken} swap: ${baseAmount} ${baseToken} → ${targetAmount} tokens @ $${price.toFixed(6)}`);
                        }
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
                console.log(`${logPrefix} ✅ Current price: $${latest.price} (${latest.baseToken})`);
                
                return {
                    price: latest.price,
                    timestamp: latest.timestamp,
                    volume: latest.volume,
                    baseToken: latest.baseToken,
                    tokenAmount: latest.tokenAmount
                };
            }
            
            console.log(`${logPrefix} ⚠️ No recent price data found`);
            return { price: null, timestamp: null, volume: null, baseToken: null, tokenAmount: null };
            
        } catch (error) {
            console.error(`${logPrefix} ❌ Current price error:`, error.message);
            return { price: null, timestamp: null, volume: null, baseToken: null, tokenAmount: null };
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