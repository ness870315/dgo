import fetch from 'node-fetch';

/**
 * Optimized Helius Backfill Service using getSignaturesForAddress
 * This is much faster and more efficient than the previous approach
 */
export default class OptimizedHeliusBackfill {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.rpcUrl = `https://mainnet.helius-rpc.com/?api-key=${apiKey}`;
        this.transactionsUrl = `https://api.helius.xyz/v0/transactions?api-key=${apiKey}`;
        
        console.log(`🔗 OptimizedHeliusBackfill initialized`);
        console.log(`   API Key: ${apiKey ? '✅ Configured' : '❌ Missing'}`);
    }

    /**
     * Get signatures for an address using the optimized RPC method
     */
    async getSignaturesForAddress(address, options = {}) {
        const { limit = 1000, before = null, until = null, commitment = 'finalized' } = options;
        
        const params = [address, { limit, commitment }];
        if (before) params[1].before = before;
        if (until) params[1].until = until;
        
        const response = await fetch(this.rpcUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: '1',
                method: 'getSignaturesForAddress',
                params
            })
        });
        
        const data = await response.json();
        if (data.error) throw new Error(`RPC Error: ${data.error.message}`);
        
        return data.result || [];
    }

    /**
     * Get transaction details for a batch of signatures
     */
    async getTransactionDetails(signatures) {
        if (signatures.length === 0) return [];
        
        // Add rate limiting delay - longer delay for fewer calls
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const response = await fetch(this.transactionsUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ transactions: signatures })
        });
        
        const data = await response.json();
        if (data.error) {
            if (data.error.message.includes('rate limited')) {
                console.log(`⏳ [OPTIMIZED-BACKFILL] Rate limited, waiting 5 seconds...`);
                await new Promise(resolve => setTimeout(resolve, 5000));
                // Retry once
                const retryResponse = await fetch(this.transactionsUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ transactions: signatures })
                });
                const retryData = await retryResponse.json();
                if (retryData.error) throw new Error(`Transaction API Error: ${retryData.error.message}`);
                return Array.isArray(retryData) ? retryData : [];
            }
            throw new Error(`Transaction API Error: ${data.error.message}`);
        }
        
        return Array.isArray(data) ? data : [];
    }

    /**
     * Extract swap data from a transaction
     */
    extractSwapData(tx, targetTokenMint = null, poolAddress = null) {
        if (tx.type !== 'SWAP' || !tx.tokenTransfers) return null;
        
        // Find SOL and USDC transfers
        const solTransfer = tx.tokenTransfers.find(t => 
            t.mint === 'So11111111111111111111111111111111111111112'
        );
        const usdcTransfer = tx.tokenTransfers.find(t => 
            t.mint === 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
        );
        
        // Find the target token transfer (if specified) or any non-SOL/USDC token
        let tokenTransfer;
        if (targetTokenMint) {
            tokenTransfer = tx.tokenTransfers.find(t => t.mint === targetTokenMint);
        } else {
            // Find any token that's not SOL or USDC
            tokenTransfer = tx.tokenTransfers.find(t => 
                t.mint !== 'So11111111111111111111111111111111111111112' &&
                t.mint !== 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
            );
        }
        
        if (!solTransfer || !tokenTransfer) return null;
        
        // Calculate price (SOL per token)
        const price = solTransfer.tokenAmount / tokenTransfer.tokenAmount;
        const volume = usdcTransfer ? usdcTransfer.tokenAmount : solTransfer.tokenAmount * 200; // Approximate SOL price
        
        return {
            signature: tx.signature,
            timestamp: tx.timestamp,
            price,
            volume,
            solAmount: solTransfer.tokenAmount,
            tokenAmount: tokenTransfer.tokenAmount,
            usdcAmount: usdcTransfer?.tokenAmount || 0,
            poolAddress: poolAddress || tx.tokenTransfers[0]?.fromUserAccount || tx.tokenTransfers[0]?.toUserAccount,
            maker: tx.tokenTransfers[0]?.fromUserAccount,
            source: 'helius',
            rawData: JSON.stringify(tx)
        };
    }

    /**
     * Main backfill method using the optimized approach
     */
    async backfillHeliusOHLCV(options) {
        const { poolAddress, fromTs, toTs, timeframe = '1MIN', targetTokenMint = null } = options;
        
        console.log(`🔄 [OPTIMIZED-BACKFILL] Starting optimized backfill for ${poolAddress.substring(0, 8)}`);
        console.log(`   Timeframe: ${timeframe}`);
        console.log(`   Range: ${new Date(fromTs * 1000).toISOString()} to ${new Date(toTs * 1000).toISOString()}`);
        
        const swaps = [];
        let before = null;
        let pageCount = 0;
        let totalSignatures = 0;
        let totalSwaps = 0;
        
        try {
            // Step 1: Get all signatures with pagination
            console.log(`📦 [OPTIMIZED-BACKFILL] Fetching signatures...`);
            
            while (true) {
                pageCount++;
                console.log(`📦 [OPTIMIZED-BACKFILL] Fetching page ${pageCount}...`);
                
                const signatures = await this.getSignaturesForAddress(poolAddress, {
                    limit: 1000, // Keep at 1000 (Helius max)
                    before,
                    commitment: 'finalized'
                });
                
                if (signatures.length === 0) break;
                
                totalSignatures += signatures.length;
                
                // Check if we've gone too far back in time
                const oldestSignature = signatures[signatures.length - 1];
                if (oldestSignature.blockTime && oldestSignature.blockTime < fromTs) {
                    console.log(`📦 [OPTIMIZED-BACKFILL] Reached time limit at page ${pageCount}`);
                    break;
                }
                
                // Step 2: Get transaction details in batches of 100 (more efficient)
                const batchSize = 100;
                for (let i = 0; i < signatures.length; i += batchSize) {
                    const batch = signatures.slice(i, i + batchSize);
                    const batchSignatures = batch.map(s => s.signature);
                    
                    console.log(`📦 [OPTIMIZED-BACKFILL] Processing batch ${Math.floor(i/batchSize) + 1} (${batchSignatures.length} signatures)...`);
                    
                    const transactions = await this.getTransactionDetails(batchSignatures);
                    
                    // Step 3: Extract swap data
                    for (const tx of transactions) {
                        if (tx.timestamp && tx.timestamp >= fromTs && tx.timestamp <= toTs) {
                            const swapData = this.extractSwapData(tx, targetTokenMint, poolAddress);
                            if (swapData) {
                                swaps.push(swapData);
                                totalSwaps++;
                            }
                        }
                    }
                }
                
                // Set up for next page
                before = signatures[signatures.length - 1].signature;
                
                // Rate limiting - longer delays between pages
                if (pageCount % 3 === 0) {
                    console.log(`⏳ [OPTIMIZED-BACKFILL] Rate limiting, waiting 5 seconds...`);
                    await new Promise(resolve => setTimeout(resolve, 5000));
                }
            }
            
            // Step 4: Generate OHLCV candles
            console.log(`📊 [OPTIMIZED-BACKFILL] Generating OHLCV candles...`);
            const candles = this.generateOHLCV(swaps, timeframe);
            
            console.log(`✅ [OPTIMIZED-BACKFILL] Complete:`);
            console.log(`   Pages processed: ${pageCount}`);
            console.log(`   Total signatures: ${totalSignatures}`);
            console.log(`   Total swaps: ${totalSwaps}`);
            console.log(`   OHLCV candles: ${candles.length}`);
            console.log(`   Time span: ${((toTs - fromTs) / (24 * 3600)).toFixed(2)} days`);
            
            return {
                candles,
                rawSwaps: swaps,
                pagesProcessed: pageCount,
                totalTransactions: totalSignatures,
                totalSwaps: totalSwaps,
                candlesGenerated: candles.length
            };
            
        } catch (error) {
            console.error(`❌ [OPTIMIZED-BACKFILL] Error:`, error.message);
            throw error;
        }
    }

    /**
     * Generate OHLCV candles from swap data
     */
    generateOHLCV(swaps, timeframe) {
        if (swaps.length === 0) return [];
        
        const timeframeMs = this.getTimeframeMs(timeframe);
        const candles = new Map();
        
        for (const swap of swaps) {
            const timestamp = Math.floor(swap.timestamp / timeframeMs) * timeframeMs;
            
            if (!candles.has(timestamp)) {
                candles.set(timestamp, {
                    time: timestamp,
                    open: swap.price,
                    high: swap.price,
                    low: swap.price,
                    close: swap.price,
                    volume: swap.volume
                });
            } else {
                const candle = candles.get(timestamp);
                candle.high = Math.max(candle.high, swap.price);
                candle.low = Math.min(candle.low, swap.price);
                candle.close = swap.price; // Last price in the period
                candle.volume += swap.volume;
            }
        }
        
        return Array.from(candles.values()).sort((a, b) => a.time - b.time);
    }

    /**
     * Get timeframe in milliseconds
     */
    getTimeframeMs(timeframe) {
        const timeframes = {
            '1MIN': 60,
            '5MIN': 300,
            '15MIN': 900,
            '1H': 3600,
            '4H': 14400,
            '1D': 86400
        };
        return (timeframes[timeframe] || 60) * 1000;
    }

    /**
     * Backfill multiple sources (for compatibility with existing code)
     */
    async backfillMultipleSources(options) {
        const { poolAddress, mint, fromTs, toTs, timeframe, sources = [] } = options;
        
        console.log(`🔄 [OPTIMIZED-BACKFILL] Starting multi-source backfill for ${mint.substring(0, 8)}`);
        console.log(`   Pool: ${poolAddress.substring(0, 8)}`);
        console.log(`   Sources: ${sources.join(', ')}`);
        
        // For now, just use the single pool approach
        // In the future, we could implement multi-pool logic here
        return await this.backfillHeliusOHLCV({
            poolAddress,
            fromTs,
            toTs,
            timeframe
        });
    }
}
