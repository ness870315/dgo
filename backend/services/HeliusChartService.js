import fetch from 'node-fetch';
import EnhancedHeliusBackfill from './EnhancedHeliusBackfill.js';

class HeliusChartService {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.baseUrl = 'https://api.helius.xyz/v0';
        this.cache = new Map();
        this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
        // Initialize enhanced backfill if available
        try {
            this.enhancedBackfill = new EnhancedHeliusBackfill(apiKey);
            console.log('🔗 HeliusChartService initialized');
            console.log(`   API Key: ${apiKey ? '✅ Configured' : '❌ Missing'}`);
            console.log(`   Enhanced Backfill: ✅ Available`);
        } catch (error) {
            this.enhancedBackfill = null;
            console.log('🔗 HeliusChartService initialized');
            console.log(`   API Key: ${apiKey ? '✅ Configured' : '❌ Missing'}`);
            console.log(`   Enhanced Backfill: ⚠️ Not Available (${error.message})`);
        }
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
            
            // Log timestamp range for debugging
            if (data.length > 0) {
                const firstTx = data[0];
                const lastTx = data[data.length - 1];
                console.log(`${logPrefix} 📅 Time range: ${new Date(firstTx.timestamp * 1000).toISOString()} to ${new Date(lastTx.timestamp * 1000).toISOString()}`);
            }
            
            return data;
            
        } catch (error) {
            console.error(`${logPrefix} ❌ Transaction history error:`, error.message);
            throw error;
        }
    }

    /**
     * Parse transactions to extract price data from tokenTransfers
     */
    parseTransactions(transactions, targetTokenAddress) {
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
                    
                    // Group transfers by mint to find swap pairs
                    const transfersByMint = {};
                    for (const transfer of transfers) {
                        if (!transfersByMint[transfer.mint]) {
                            transfersByMint[transfer.mint] = [];
                        }
                        transfersByMint[transfer.mint].push(transfer);
                    }
                    
                    // Look for swap pairs: base token ↔ target token
                    for (const [mint, mintTransfers] of Object.entries(transfersByMint)) {
                        if (BASE_TOKENS[mint]) {
                            // This is a base token, look for corresponding target token transfers
                            const baseToken = BASE_TOKENS[mint];
                            
                            if (transfersByMint[targetTokenAddress]) {
                                const targetTransfers = transfersByMint[targetTokenAddress];
                                
                                // Find the largest swap amounts (ignore small amounts that might be fees)
                                const baseAmount = Math.max(...mintTransfers.map(t => Math.abs(t.tokenAmount)));
                                const targetAmount = Math.max(...targetTransfers.map(t => Math.abs(t.tokenAmount)));
                                
                                if (baseAmount > 0 && targetAmount > 0) {
                                    // Price = baseAmount / targetAmount (how much base token per target token)
                                    const price = baseAmount / targetAmount;
                                    
                                    // Only include reasonable price ranges (filter out extreme outliers)
                                    if (price > 0.000001 && price < 1000000) {
                                        priceData.push({
                                            timestamp: tx.timestamp * 1000, // Convert to milliseconds
                                            price: price,
                                            volume: baseAmount,
                                            baseToken: baseToken,
                                            tokenAmount: targetAmount,
                                            type: 'swap'
                                        });

                                        // Determine buy/sell based on transfer direction
                                        // Buy: receiving target tokens (positive amount)
                                        // Sell: sending target tokens (negative amount)
                                        const isBuy = targetTransfers.some(t => t.tokenAmount > 0);
                                        
                                        buySellData.push({
                                            timestamp: tx.timestamp * 1000,
                                            type: isBuy ? 'buy' : 'sell',
                                            volume: baseAmount,
                                            price: price,
                                            baseToken: baseToken,
                                            tokenAmount: targetAmount
                                        });

                                        console.log(`${logPrefix} 📊 ${baseToken} swap: ${baseAmount} ${baseToken} → ${targetAmount} tokens @ $${price.toFixed(6)}`);
                                    } else {
                                        console.log(`${logPrefix} ⚠️ Filtered extreme price: $${price.toFixed(6)} (${baseAmount} ${baseToken} / ${targetAmount} tokens)`);
                                    }
                                }
                            }
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

    /**
     * Enhanced backfill using pool addresses and SWAP filtering
     * This provides complete historical data, not just recent transactions
     */
    async getEnhancedChartData(opts) {
        const {
            poolAddresses, // Array of pool addresses for the token
            mint, // Token mint address (for logging)
            timeframe = '5MIN',
            days = 7, // Number of days to backfill
            sources = ['RAYDIUM', 'ORCA', 'JUPITER']
        } = opts;

        const logPrefix = `[ENHANCED] ${mint.substring(0, 8)}`;
        console.log(`${logPrefix} 🔄 Starting enhanced chart data fetch...`);
        console.log(`   Pools: ${poolAddresses.length}`);
        console.log(`   Timeframe: ${timeframe}`);
        console.log(`   Days: ${days}`);
        console.log(`   Sources: ${sources.join(', ')}`);

        try {
            const now = Math.floor(Date.now() / 1000);
            const fromTs = now - (days * 24 * 60 * 60);
            const toTs = now;

            let candles;
            if (!this.enhancedBackfill) {
                console.log(`[HELIUS] ${tokenAddress.substring(0, 8)} ⚠️ Enhanced backfill not available, skipping`);
                return [];
            }

            if (poolAddresses.length === 1) {
                // Single pool
                candles = await this.enhancedBackfill.backfillOHLCV({
                    address: poolAddresses[0],
                    fromTs,
                    toTs,
                    timeframe,
                    sources
                });
            } else {
                // Multiple pools
                candles = await this.enhancedBackfill.backfillMultiplePools({
                    poolAddresses,
                    mint,
                    fromTs,
                    toTs,
                    timeframe,
                    sources
                });
            }

            console.log(`${logPrefix} ✅ Enhanced backfill complete: ${candles.length} candles`);

            // Convert to our standard format
            const ohlcv = candles.map(candle => ({
                timestamp: candle.time * 1000, // Convert to milliseconds
                open: candle.open,
                high: candle.high,
                low: candle.low,
                close: candle.close,
                volume: candle.volume
            }));

            // Generate price data and buy/sell data from candles
            const priceData = ohlcv.map(candle => ({
                timestamp: candle.timestamp,
                price: candle.close,
                volume: candle.volume,
                type: 'enhanced'
            }));

            const buySellData = []; // Enhanced backfill doesn't provide individual buy/sell events

            return {
                ohlcv,
                priceData,
                buySellData,
                source: 'enhanced',
                cached: false,
                totalDataPoints: candles.length,
                timeSpan: days
            };

        } catch (error) {
            console.error(`${logPrefix} ❌ Enhanced backfill failed:`, error.message);
            throw error;
        }
    }

    /**
     * Get chart data with automatic fallback
     * 1. Try enhanced backfill (if pool addresses provided)
     * 2. Fall back to regular transaction parsing
     */
    async getChartDataWithFallback(opts) {
        const { poolAddresses, mint, ...otherOpts } = opts;

        // If we have pool addresses, try enhanced backfill first
        if (poolAddresses && poolAddresses.length > 0) {
            try {
                console.log(`🔄 [FALLBACK] Trying enhanced backfill for ${mint.substring(0, 8)}...`);
                return await this.getEnhancedChartData(opts);
            } catch (error) {
                console.log(`⚠️ [FALLBACK] Enhanced backfill failed, trying regular method: ${error.message}`);
            }
        }

        // Fall back to regular method
        console.log(`🔄 [FALLBACK] Using regular transaction parsing for ${mint.substring(0, 8)}...`);
        return await this.getChartData(mint, otherOpts.timeframe || '5MIN', otherOpts.limit);
    }
}

export default HeliusChartService;