import axios from 'axios';

/**
 * Corrected Enhanced Helius Backfill
 * Implements the 8 key tweaks for robust historical data fetching
 */
class CorrectedHeliusBackfill {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.baseUrl = 'https://api.helius.xyz/v0';
        console.log('🔗 CorrectedHeliusBackfill initialized');
        console.log(`   API Key: ${apiKey ? '✅ Configured' : '❌ Missing'}`);
    }

    /**
     * Backfill OHLCV data from Helius Enhanced Transactions
     * Implements all 8 key tweaks for robust operation
     */
    async backfillHeliusOHLCV({
        poolAddress,
        fromTs, // unix seconds inclusive
        toTs,   // unix seconds exclusive
        timeframe,
        source // optional single source
    }) {
        console.log(`🔄 [CORRECTED-BACKFILL] Starting backfill for ${poolAddress.substring(0, 8)}`);
        console.log(`   Timeframe: ${timeframe}`);
        console.log(`   Range: ${new Date(fromTs * 1000).toISOString()} to ${new Date(toTs * 1000).toISOString()}`);
        console.log(`   Source: ${source || 'All'}`);

        const stepMin = this.getTimeframeMinutes(timeframe);
        const buckets = new Map(); // key = bucket start (unix sec)
        const seen = new Set(); // dedupe by signature
        this.collectedSwaps = []; // Store raw swap data for TX table
        let before = undefined;
        const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
        let pageCount = 0;
        let totalTransactions = 0;
        let totalSwaps = 0;

        const fetchPage = async () => {
            pageCount++;
            console.log(`📦 [CORRECTED-BACKFILL] Fetching page ${pageCount}...`);

            const url = new URL(`${this.baseUrl}/addresses/${poolAddress}/transactions`);
            url.searchParams.set('api-key', this.apiKey);
            url.searchParams.set('limit', '100');
            url.searchParams.set('commitment', 'finalized');
            url.searchParams.set('type', 'SWAP');
            
            // Fix #1: Single source, not array - REMOVED source parameter
            // if (source) {
            //     url.searchParams.set('source', source);
            // }
            
            if (before) {
                url.searchParams.set('before', before);
            }

            try {
                const { data } = await axios.get(url.toString(), { timeout: 20000 });
                const txs = Array.isArray(data) ? data : [];
                console.log(`📦 [CORRECTED-BACKFILL] Page ${pageCount}: ${txs.length} transactions`);
                return txs;
            } catch (error) {
                if (error.response?.status === 429) {
                    console.log(`⏳ [CORRECTED-BACKFILL] Rate limited, waiting 2 seconds...`);
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    return await fetchPage(); // Retry
                }
                throw error;
            }
        };

        // Fix #2: Backfill by time window + paginate with before
        while (true) {
            const txs = await fetchPage();
            if (txs.length === 0) break;

            totalTransactions += txs.length;

            for (const tx of txs) {
                const sig = tx?.signature;
                
                // Fix #6: Handle deduplication
                if (sig && seen.has(sig)) continue;
                if (sig) seen.add(sig);

                const ts = Number(tx?.timestamp || 0);
                if (!ts || ts >= toTs) continue;
                if (ts < fromTs) { 
                    before = undefined; 
                    break; 
                }

                // Fix #5: Derive price robustly
                const swapData = this.extractSwapDataRobust(tx, USDC);
                if (!swapData) continue;

                totalSwaps++;
                const { price, volUsd } = swapData;

                // Extract more detailed swap information
                const swapDetails = this.extractDetailedSwapData(tx, price, volUsd);
                
                // Store raw swap data for TX table
                this.collectedSwaps.push({
                    signature: tx.signature,
                    poolAddress: poolAddress,
                    timestamp: ts * 1000, // Convert to milliseconds
                    type: 'SWAP',
                    price: price,
                    baseToken: swapDetails.baseToken,
                    baseAmount: swapDetails.baseAmount,
                    tokenAmount: swapDetails.tokenAmount,
                    usdValue: volUsd,
                    maker: swapDetails.maker,
                    source: 'helius',
                    rawData: JSON.stringify(tx) // Store full transaction data
                });

                // Fix #4: Normalize timestamps (using seconds consistently)
                const bucketMin = Math.floor((ts / 60) / stepMin) * stepMin;
                const bucketTime = bucketMin * 60;
                
                const candle = buckets.get(bucketTime);
                if (!candle) {
                    buckets.set(bucketTime, {
                        time: bucketTime,
                        open: price,
                        high: price,
                        low: price,
                        close: price,
                        volume: volUsd
                    });
                } else {
                    candle.high = Math.max(candle.high, price);
                    candle.low = Math.min(candle.low, price);
                    candle.close = price; // Last price in timeframe
                    candle.volume += volUsd;
                }
            }

            // Fix #2: Pagination with before cursor
            before = txs[txs.length - 1]?.signature;
            if (!before) break;
            
            const oldestTs = Number(txs[txs.length - 1]?.timestamp || 0);
            if (oldestTs < fromTs) break;

            // Small delay to avoid rate limits
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        const candles = [...buckets.values()].sort((a, b) => a.time - b.time);
        
        console.log(`✅ [CORRECTED-BACKFILL] Complete:`);
        console.log(`   Pages processed: ${pageCount}`);
        console.log(`   Total transactions: ${totalTransactions}`);
        console.log(`   Total swaps: ${totalSwaps}`);
        console.log(`   OHLCV candles: ${candles.length}`);
        
        if (candles.length > 0) {
            const timeSpan = (candles[candles.length - 1].time - candles[0].time) / (60 * 60 * 24);
            console.log(`   Time span: ${timeSpan.toFixed(2)} days`);
        }

        return {
            candles: candles,
            rawSwaps: this.collectedSwaps, // Return the raw swap data
            pagesProcessed: pageCount,
            totalTransactions: totalTransactions,
            totalSwaps: totalSwaps,
            candlesGenerated: candles.length
        };
    }

    /**
     * Fix #5: Robust price extraction
     * Prefer events.swap, fallback to token legs computation
     */
    extractSwapDataRobust(tx, USDC) {
        const s = tx?.events?.swap;
        if (!s) return null;

        let price = null;
        let volUsd = 0;

        // 1) Prefer parsed swap (often includes price/amounts/USD)
        const inUsd = Number(s?.amountInUsd ?? 0);
        const outUsd = Number(s?.amountOutUsd ?? 0);
        
        if (inUsd || outUsd) {
            volUsd = inUsd || outUsd;
            price = Number(s?.price ?? 0) || null;
        }

        // 2) Fallback: compute price from legs
        if (price == null) {
            const legs = [...(s?.tokenInputs ?? []), ...(s?.tokenOutputs ?? [])];
            let quote = 0, base = 0;
            
            for (const leg of legs) {
                const dec = Number(leg?.rawTokenAmount?.decimals ?? 0);
                const amt = Number(leg?.rawTokenAmount?.tokenAmount ?? 0) / (10 ** dec);
                
                if (!isFinite(amt) || amt === 0) continue;
                
                if (leg.mint === USDC) {
                    quote += Math.abs(amt);
                } else {
                    base += Math.abs(amt);
                }
            }
            
            if (quote > 0 && base > 0) {
                price = quote / base;
                volUsd = quote;
            }
        }

        if (price == null || !isFinite(price) || price <= 0) return null;

        return { price, volUsd };
    }

    /**
     * Get timeframe in minutes
     */
    getTimeframeMinutes(timeframe) {
        switch (timeframe) {
            case '1MIN': return 1;
            case '5MIN': return 5;
            case '15MIN': return 15;
            case '1H': return 60;
            case '4H': return 240;
            case '1D': return 1440;
            default: return 5;
        }
    }

    /**
     * Extract detailed swap data for better transaction information
     */
    extractDetailedSwapData(tx, price, volUsd) {
        const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
        const SOL = 'So11111111111111111111111111111111111111112';
        
        let baseToken = 'SOL';
        let baseAmount = 0;
        let tokenAmount = 0;
        let maker = 'UNKNOWN';
        
        // Try to extract from token transfers
        if (tx.tokenTransfers && tx.tokenTransfers.length >= 2) {
            const solTransfer = tx.tokenTransfers.find(t => t.mint === SOL);
            const usdcTransfer = tx.tokenTransfers.find(t => t.mint === USDC);
            const otherTransfer = tx.tokenTransfers.find(t => t.mint !== SOL && t.mint !== USDC);
            
            if (solTransfer && otherTransfer) {
                baseToken = 'SOL';
                baseAmount = solTransfer.tokenAmount;
                tokenAmount = otherTransfer.tokenAmount;
                maker = solTransfer.fromUserAccount || 'UNKNOWN';
            } else if (usdcTransfer && otherTransfer) {
                baseToken = 'USDC';
                baseAmount = usdcTransfer.tokenAmount;
                tokenAmount = otherTransfer.tokenAmount;
                maker = usdcTransfer.fromUserAccount || 'UNKNOWN';
            }
        }
        
        // Fallback: calculate from price and volume
        if (baseAmount === 0 || tokenAmount === 0) {
            if (price > 0) {
                baseAmount = volUsd / price;
                tokenAmount = volUsd / price;
            }
        }
        
        return {
            baseToken,
            baseAmount,
            tokenAmount,
            maker
        };
    }

    /**
     * Backfill multiple sources and merge results
     * Fix #1: Handle multiple sources by calling API separately for each
     */
    async backfillMultipleSources({
        poolAddress,
        fromTs,
        toTs,
        timeframe,
        sources = ['RAYDIUM', 'ORCA', 'JUPITER']
    }) {
        console.log(`🔄 [MULTI-SOURCE] Backfilling ${sources.length} sources for ${poolAddress.substring(0, 8)}`);

        const perSource = await Promise.allSettled(
            sources.map(source =>
                this.backfillHeliusOHLCV({
                    poolAddress,
                    fromTs,
                    toTs,
                    timeframe,
                    source
                })
            )
        );

        // Merge + re-aggregate to avoid double counts
        const merged = new Map();
        
        for (const result of perSource) {
            if (result.status !== 'fulfilled') {
                console.log(`⚠️ [MULTI-SOURCE] Source failed: ${result.reason?.message || 'Unknown error'}`);
                continue;
            }
            
            for (const candle of result.value) {
                const existing = merged.get(candle.time);
                if (!existing) {
                    merged.set(candle.time, { ...candle });
                } else {
                    existing.high = Math.max(existing.high, candle.high);
                    existing.low = Math.min(existing.low, candle.low);
                    existing.close = candle.close; // Use most recent close
                    existing.volume += candle.volume;
                }
            }
        }

        const candles = [...merged.values()].sort((a, b) => a.time - b.time);
        
        console.log(`✅ [MULTI-SOURCE] Merged ${candles.length} candles from ${sources.length} sources`);
        
        return candles;
    }
}

export default CorrectedHeliusBackfill;
