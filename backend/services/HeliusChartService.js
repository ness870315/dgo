import https from 'https';

class HeliusChartService {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.baseUrl = 'https://api.helius.xyz/v0';
        this.rpcUrl = `https://mainnet.helius-rpc.com/?api-key=${apiKey}`;
        this.transactionCache = new Map();
        this.priceCache = new Map();
        this.lastUpdateTime = null;
    }

    async makeRequest(url, options = {}) {
        return new Promise((resolve, reject) => {
            const urlObj = new URL(url);
            const requestOptions = {
                hostname: urlObj.hostname,
                port: 443,
                path: urlObj.pathname + urlObj.search,
                method: options.method || 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                }
            };

            const req = https.request(requestOptions, (res) => {
                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    try {
                        const jsonData = JSON.parse(data);
                        resolve({ status: res.statusCode, data: jsonData });
                    } catch (error) {
                        resolve({ status: res.statusCode, data: data });
                    }
                });
            });

            req.on('error', reject);
            
            if (options.body) {
                req.write(JSON.stringify(options.body));
            }
            
            req.end();
        });
    }

    async getTransactionHistory(address, limit = 100) {
        try {
            const url = `${this.baseUrl}/addresses/${address}/transactions/?api-key=${this.apiKey}&limit=${limit}`;
            console.log(`🔍 [HELIUS] Fetching transactions for ${address.substring(0, 8)}... (limit=${limit})`);
            const response = await this.makeRequest(url);
            
            if (response.status === 200 && response.data) {
                console.log(`✅ [HELIUS] Got ${response.data.length} raw transactions for ${address.substring(0, 8)}`);
                return response.data;
            }
            console.log(`⚠️ [HELIUS] No transaction data returned for ${address.substring(0, 8)}`);
            return [];
        } catch (error) {
            console.error(`❌ [HELIUS] Error fetching transaction history for ${address.substring(0, 8)}:`, error.message);
            return [];
        }
    }

    async parseTransactions(signatures) {
        try {
            const url = `${this.baseUrl}/transactions/?api-key=${this.apiKey}`;
            console.log(`🔍 [HELIUS] Parsing ${signatures.length} transaction signatures...`);
            const response = await this.makeRequest(url, {
                method: 'POST',
                body: { transactions: signatures }
            });
            
            if (response.status === 200 && response.data) {
                console.log(`✅ [HELIUS] Parsed ${response.data.length} detailed transactions`);
                return response.data;
            }
            console.log(`⚠️ [HELIUS] No parsed transaction data returned`);
            return [];
        } catch (error) {
            console.error('Error parsing transactions:', error.message);
            return [];
        }
    }

    extractPriceData(transactions, tokenAddress) {
        const priceData = [];
        const buySellData = [];

        console.log(`🔍 [HELIUS] Extracting price data from ${transactions.length} transactions for ${tokenAddress.substring(0, 8)}...`);

        transactions.forEach((tx, index) => {
            console.log(`🔍 [HELIUS] Transaction ${index + 1}: type=${tx.type}, source=${tx.source}, tokenTransfers=${tx.tokenTransfers?.length || 0}`);
            
            if (tx.type === 'SWAP' && tx.tokenTransfers && Array.isArray(tx.tokenTransfers)) {
                // Extract SOL transfers (native token)
                const solTransfers = tx.tokenTransfers.filter(t => 
                    t.mint === 'So11111111111111111111111111111111111111112'
                );
                
                // Extract target token transfers
                const tokenTransfers = tx.tokenTransfers.filter(t => 
                    t.mint === tokenAddress
                );

                if (solTransfers.length > 0 && tokenTransfers.length > 0) {
                    const solAmount = solTransfers.reduce((sum, t) => sum + parseFloat(t.tokenAmount || 0), 0);
                    const tokenAmount = tokenTransfers.reduce((sum, t) => sum + parseFloat(t.tokenAmount || 0), 0);
                    
                    if (tokenAmount > 0 && solAmount > 0) {
                        const price = solAmount / tokenAmount;
                        
                        // Fix timestamp (convert from seconds to milliseconds if needed)
                        let timestamp = tx.timestamp || Date.now();
                        if (timestamp < 10000000000) { // Unix timestamp in seconds
                            timestamp = timestamp * 1000;
                        }
                        
                        priceData.push({
                            timestamp,
                            price,
                            volume: tokenAmount,
                            type: 'swap',
                            signature: tx.signature
                        });

                        // Determine buy/sell based on direction
                        const isBuy = solTransfers.some(t => 
                            t.fromUserAccount === tokenAddress
                        );
                        
                        buySellData.push({
                            timestamp,
                            type: isBuy ? 'BUY' : 'SELL',
                            amount: tokenAmount,
                            price,
                            signature: tx.signature,
                            source: tx.source,
                            description: tx.description
                        });
                    }
                }
            }
        });

        return { priceData, buySellData };
    }

    generateOHLCVData(priceData, timeframe = '1h') {
        console.log(`🔍 [HELIUS] Generating OHLCV data from ${priceData.length} price points for timeframe ${timeframe}`);
        
        if (!priceData || priceData.length === 0) {
            console.log(`⚠️ [HELIUS] No price data available for OHLCV generation`);
            return [];
        }

        // Sort by timestamp
        const sortedData = priceData.sort((a, b) => a.timestamp - b.timestamp);
        const ohlcv = [];
        const timeframeMs = this.getTimeframeMs(timeframe);
        
        let currentCandle = null;
        let lastTimestamp = null;

        sortedData.forEach(point => {
            const candleTimestamp = Math.floor(point.timestamp / timeframeMs) * timeframeMs;
            
            if (!currentCandle || candleTimestamp !== lastTimestamp) {
                if (currentCandle) {
                    ohlcv.push(currentCandle);
                }
                
                currentCandle = {
                    timestamp: candleTimestamp,
                    open: point.price,
                    high: point.price,
                    low: point.price,
                    close: point.price,
                    volume: point.volume
                };
            } else {
                currentCandle.high = Math.max(currentCandle.high, point.price);
                currentCandle.low = Math.min(currentCandle.low, point.price);
                currentCandle.close = point.price;
                currentCandle.volume += point.volume;
            }
            
            lastTimestamp = candleTimestamp;
        });

        if (currentCandle) {
            ohlcv.push(currentCandle);
        }

        console.log(`✅ [HELIUS] Generated ${ohlcv.length} OHLCV candles from ${priceData.length} price points`);
        return ohlcv;
    }

    getTimeframeMs(timeframe) {
        // Convert uppercase timeframes to lowercase for internal use
        const normalizedTimeframe = timeframe.toLowerCase();
        const timeframes = {
            '1min': 60 * 1000,
            '5min': 5 * 60 * 1000,
            '15min': 15 * 60 * 1000,
            '1h': 60 * 60 * 1000,
            '4h': 4 * 60 * 60 * 1000,
            '1d': 24 * 60 * 60 * 1000,
            '1w': 7 * 24 * 60 * 60 * 1000,
            '1m': 30 * 24 * 60 * 60 * 1000,
            'all': 4 * 60 * 60 * 1000 // ALL uses 4H intervals
        };
        return timeframes[normalizedTimeframe] || timeframes['1h'];
    }

    async getChartData(tokenAddress, timeframe = '1h', limit = 100) {
        try {
            // Check cache first
            const cacheKey = `${tokenAddress}_${timeframe}_${limit}`;
            if (this.priceCache.has(cacheKey)) {
                const cached = this.priceCache.get(cacheKey);
                if (Date.now() - cached.timestamp < 30000) { // 30 second cache
                    return cached.data;
                }
            }

            // Fetch transaction history
            const transactions = await this.getTransactionHistory(tokenAddress, limit);
            if (transactions.length === 0) {
                return { ohlcv: [], buySellData: [] };
            }

            // Parse transactions
            const signatures = transactions.map(tx => tx.signature).filter(Boolean);
            const parsedTxs = await this.parseTransactions(signatures);
            
            if (parsedTxs.length === 0) {
                return { ohlcv: [], buySellData: [] };
            }

            // Extract price data
            const { priceData, buySellData } = this.extractPriceData(parsedTxs, tokenAddress);
            
            // Generate OHLCV data
            const ohlcv = this.generateOHLCVData(priceData, timeframe);
            
            // Cache the result
            this.priceCache.set(cacheKey, {
                data: { ohlcv, buySellData, priceData },
                timestamp: Date.now()
            });

            return { ohlcv, buySellData, priceData };
        } catch (error) {
            console.error('Error getting chart data:', error.message);
            return { ohlcv: [], buySellData: [], priceData: [] };
        }
    }

    async getRealTimeTransactions(tokenAddress) {
        try {
            const transactions = await this.getTransactionHistory(tokenAddress, 10);
            const newTxs = transactions.filter(tx => 
                !this.transactionCache.has(tx.signature)
            );

            // Cache new transactions
            newTxs.forEach(tx => {
                this.transactionCache.set(tx.signature, tx);
            });

            return newTxs;
        } catch (error) {
            console.error('Error getting real-time transactions:', error.message);
            return [];
        }
    }

    async getCurrentPrice(tokenAddress) {
        try {
            const { priceData } = await this.getChartData(tokenAddress, '1h', 10);
            if (priceData.length > 0) {
                // Return the most recent price
                const latest = priceData.sort((a, b) => b.timestamp - a.timestamp)[0];
                return {
                    price: latest.price,
                    timestamp: latest.timestamp,
                    volume: latest.volume
                };
            }
            return null;
        } catch (error) {
            console.error('Error getting current price:', error.message);
            return null;
        }
    }

    // Method to get recent buy/sell transactions for display
    async getRecentTransactions(tokenAddress, limit = 20) {
        try {
            const { buySellData } = await this.getChartData(tokenAddress, '1h', 100);
            
            // Sort by timestamp (most recent first)
            const sorted = buySellData.sort((a, b) => b.timestamp - a.timestamp);
            
            return sorted.slice(0, limit);
        } catch (error) {
            console.error('Error getting recent transactions:', error.message);
            return [];
        }
    }
}

export default HeliusChartService;
