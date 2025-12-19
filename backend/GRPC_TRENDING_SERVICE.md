# gRPC Trending Service

## Overview

The `gRPCTrendingService` is a real-time token discovery system that monitors Solana DEX swaps using Constant K's gRPC stream. It identifies trending tokens based on swap activity, filters out scams and bonding curve tokens, and integrates them into the DeGen Oracle workflow.

## Features

### ✅ Real-Time Monitoring
- Monitors 5 major Solana DEXs simultaneously:
  - Raydium AMM
  - Orca
  - Meteora
  - Jupiter Aggregator
  - Phoenix
- Detects swaps at ~28 swaps/second
- 5-minute monitoring windows
- 30-second progress reports

### 🛡️ Advanced Filtering

**Bonding Curve Detection:**
- No Jupiter data (not indexed yet)
- No market cap or liquidity data
- Liquidity ratio < 0.1%

**Scam Detection:**
- Blockaid flags (rugpull, wash trading, hidden key holder)
- Mint/Freeze authority enabled
- Top holders > 50%
- Market cap < $100K
- Liquidity ratio < 2%
- Dev balance > 10%
- Organic score = 0

**Excluded Tokens:**
- Wrapped SOL
- Stablecoins (USDC, USDT)
- Manually identified scams

### 📊 Scoring System

Tokens are scored 0-9.9 based on:

1. **Swap Activity (0-2 points)**
   - \>100 swaps: +2.0
   - \>50 swaps: +1.5
   - \>20 swaps: +1.0
   - \>10 swaps: +0.5

2. **Market Cap (0-1.5 points)**
   - \>$10M: +1.5
   - \>$1M: +1.0
   - \>$100K: +0.5

3. **Liquidity (0-1.5 points)**
   - \>$1M: +1.5
   - \>$100K: +1.0
   - \>$10K: +0.5

4. **Organic Score (0-1 point)**
   - \>80: +1.0
   - \>50: +0.5

### 🔄 Integration with DeGen Oracle

The service seamlessly integrates with the existing DeGen Oracle workflow:

1. **Discovery**: Monitors real-time swaps via gRPC
2. **Data Enrichment**: Fetches token data from Jupiter API (batch mode, 100 tokens/call)
3. **Filtering**: Removes bonding curve tokens and scams
4. **Scoring**: Calculates DeGen Oracle scores
5. **Storage**: Saves to `tokens-cache.json` (atomic writes)
6. **Deduplication**: Merges with existing cache, updates existing tokens

## Usage

### Standalone Execution

```bash
node backend/run-grpc-trending.js
```

### Programmatic Usage

```javascript
import gRPCTrendingService from './services/gRPCTrendingService.js';

const service = new gRPCTrendingService();

// Run a discovery cycle
await service.runDiscoveryCycle();
```

### Integration with Cron/Scheduler

```javascript
import cron from 'node-cron';
import gRPCTrendingService from './services/gRPCTrendingService.js';

// Run every hour
cron.schedule('0 * * * *', async () => {
    const service = new gRPCTrendingService();
    await service.runDiscoveryCycle();
});
```

## Configuration

### Monitoring Duration
```javascript
this.monitoringDuration = 5 * 60 * 1000; // 5 minutes
```

### Report Interval
```javascript
this.reportInterval = 30 * 1000; // 30 seconds
```

### Top Tokens Count
```javascript
this.topTokensCount = 20; // Top 20 tokens
```

### DEX Programs
```javascript
const DEX_PROGRAMS = [
    '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8', // Raydium
    'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc',  // Orca
    'Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB',  // Meteora
    'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',  // Jupiter
    'PhoeNiXZ8ByJGLkxNfZRnkUfjvmuYqLR89jjFHGqdXY'   // Phoenix
];
```

## Output Format

Tokens are saved to `data/cache/tokens-cache.json` with the following structure:

```json
{
  "contractAddress": "9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump",
  "symbol": "FWOG",
  "name": "Fwog",
  "logo": "https://...",
  "decimals": 6,
  "priceUsd": 0.123,
  "marketCap": 370000000,
  "liquidity": 14400000,
  "volume24h": 5000000,
  "swapCount5min": 86,
  "score": 9.5,
  "organicScore": 75,
  "organicScoreLabel": "high",
  "source": "gRPC-Trending",
  "discoveredAt": "2025-10-29T08:00:00.000Z",
  "lastUpdated": "2025-10-29T08:00:00.000Z"
}
```

## Performance

### Typical Run Stats
- **Duration**: 300 seconds (5 minutes)
- **Total swaps detected**: 8,000-10,000
- **Swaps/second**: 27-30
- **Unique tokens seen**: 700-800
- **Valid tokens (after filtering)**: 20-50
- **Bonding curve tokens filtered**: 300-400
- **Scam tokens filtered**: 200-300

### API Efficiency
- **Jupiter API calls**: 8-10 batches (100 tokens each)
- **Total API time**: ~5-10 seconds
- **vs Individual calls**: Would take 700-800 calls (~2-3 minutes)
- **Efficiency gain**: 95%+ reduction in API calls

## Advantages Over Other Sources

### vs CoinGecko
- ✅ Real-time (5-minute discovery)
- ✅ Finds tokens before CoinGecko indexes them
- ✅ No API rate limits
- ✅ Direct on-chain data

### vs DexScreener
- ✅ More comprehensive (5 DEXs)
- ✅ Real-time swap activity
- ✅ Better scam filtering
- ✅ Integrated scoring

### vs BirdEye
- ✅ No API costs
- ✅ Unlimited tokens
- ✅ Real-time monitoring
- ✅ Better coverage

## Monitoring & Debugging

### Progress Logs
```
📊 [30s] Swaps: 858 (28.45/s) | Pools: 858 | Tokens: 206
📊 [60s] Swaps: 1765 (29.34/s) | Pools: 1765 | Tokens: 294
```

### Filtering Logs
```
🌊 [gRPCTrending] Filtering bonding curve: 3xTCAxAL...
🚫 [gRPCTrending] Filtering suspicious: GB1EHwDa...
```

### Jupiter API Logs
```
📡 [gRPCTrending] Fetching token data from Jupiter API (736 tokens in 8 batches)...
   ✅ Batch 1/8 complete (98 tokens found)
   ✅ Batch 2/8 complete (100 tokens found)
```

### Final Stats
```
📊 [gRPCTrending] Final Stats:
   Duration: 300.2s
   Total swaps: 8,293
   Swaps/sec: 27.63
   Unique tokens: 740
   Pools discovered: 8293
```

## Error Handling

- **gRPC Connection Errors**: Auto-reconnect with exponential backoff
- **Jupiter API Failures**: Individual batch retries
- **File Write Errors**: Atomic writes with temp files
- **Data Validation**: Filters invalid/incomplete token data

## Future Enhancements

1. **Adaptive Monitoring**: Adjust duration based on market activity
2. **ML-Based Scoring**: Use machine learning for better token scoring
3. **Social Signals**: Integrate Twitter/Telegram sentiment
4. **Price Prediction**: Forecast price movements based on swap patterns
5. **Alert System**: Real-time notifications for high-score tokens
6. **Historical Analysis**: Track token performance over time

## Dependencies

- `@solana/web3.js`: Solana blockchain interaction
- `axios`: HTTP requests for Jupiter API
- `GrpcWrapper`: Constant K gRPC client

## Environment Variables

```bash
DATA_DIR=/var/data/dgo  # Cache directory (optional, defaults to ./data)
```

## License

MIT

## Support

For issues or questions, please contact the DeGen Oracle team.



