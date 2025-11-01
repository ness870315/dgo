# How to Verify Decoders Are Used in Production

## Quick Verification Methods

### Method 1: Check API Endpoint (Easiest)

**URL:** `GET /api/decoders/stats`

**Example:**
```bash
curl https://api.degen-oracle.com/api/decoders/stats
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "raydiumAMM": {
      "usage": 1250,
      "totalDecodes": 50,
      "successfulDecodes": 48,
      "failedDecodes": 2,
      "cacheHits": 1200,
      "successRate": "96.00%",
      "cacheSize": 45
    },
    "raydiumCPMM": {
      "usage": 342,
      "totalDecodes": 12,
      "successfulDecodes": 12,
      "failedDecodes": 0,
      "cacheHits": 330,
      "successRate": "100.00%",
      "cacheSize": 12
    },
    "totalDecoderUses": 1592,
    "decoderActive": {
      "amm": true,
      "cpmm": true
    },
    "summary": {
      "totalSwapsProcessed": 1592,
      "ammDecoderUsage": 1250,
      "cpmmDecoderUsage": 342,
      "ammDecoderActive": true,
      "cpmmDecoderActive": true,
      "ammCacheSize": 45,
      "cpmmCacheSize": 12,
      "ammSuccessRate": "96.00%",
      "cpmmSuccessRate": "100.00%"
    },
    "timestamp": "2024-01-15T10:30:00.000Z"
  }
}
```

**What to Look For:**
- ✅ `usage` > 0 for both decoders (shows swaps processed)
- ✅ `cacheSize` > 0 (shows pools decoded and cached)
- ✅ `cacheHits` increasing (shows decoder is being reused)
- ✅ `successRate` > 80% (shows decoder is working correctly)

---

### Method 2: Check Backend Logs

#### A. Initialization Logs (on startup)
Look for these logs when backend starts:
```
✅ [EnhancedHybridPriceService] Raydium AMM decoder initialized
✅ [EnhancedHybridPriceService] Raydium CPMM decoder initialized
✅ [EnhancedHybridPriceService] Started decoder stats logging (every 300s)
```

#### B. Usage Logs (during swap processing)
Look for these logs when swaps are processed:
```
🔧 [processSwapForToken] Using CPMM decoder for Dz9mQ9Nz... (total uses: 1)
🔧 [processSwapForToken] Using AMM decoder for 2zMMhcVQ... (total uses: 1)
🔧 [processSwapForToken] Using CPMM decoder for Q2sPHPdU... (total uses: 100)
```

**Note:** Logs appear:
- First 5 uses of each decoder (for immediate verification)
- Every 100th use (to avoid log spam)

#### C. Periodic Stats Logs (every 5 minutes)
Look for these logs every 5 minutes:
```
📊 [DECODER STATS] Production Usage Statistics:
================================================================================
   Raydium AMM Decoder:
      Usage:           1250 swaps processed
      Cache Size:      45 pools cached
      Success Rate:    96.00%
      Cache Hits:      1200
   Raydium CPMM Decoder:
      Usage:           342 swaps processed
      Cache Size:      12 pools cached
      Success Rate:    100.00%
      Cache Hits:      330
   Total:
      Combined Usage:  1592 swaps processed
      Status:          ✅ Both Active
================================================================================
```

---

### Method 3: Monitor Real-Time via WebSocket

The decoder stats are included in the real-time stats endpoint:
```bash
curl https://api.degen-oracle.com/api/tokens/realtime-stats
```

---

## What Each Metric Means

### `usage` (Most Important!)
- **What:** Number of swaps processed using this decoder
- **Why it matters:** If this is 0, the decoder is NOT being used
- **Expected:** Should increase over time as swaps are processed

### `cacheSize`
- **What:** Number of unique pools decoded and cached
- **Why it matters:** Shows how many pools have been discovered
- **Expected:** Should grow as new pools are discovered, then stabilize

### `cacheHits`
- **What:** Number of times cached pool data was reused
- **Why it matters:** High cache hits = efficient operation
- **Expected:** Should be much higher than `totalDecodes` (shows caching works)

### `successRate`
- **What:** Percentage of successful pool decodes
- **Why it matters:** Shows decoder reliability
- **Expected:** > 80% (some failures are normal for non-Raydium pools)

---

## Troubleshooting

### Issue: Both `usage` counters are 0

**Possible Causes:**
- No swaps are being processed yet
- Program ID detection is failing
- Decoders are not being called

**Solution:**
1. Check if swaps are being detected: Look for `🔄 [processSwapForToken] Called for token...` logs
2. Check program ID detection: Look for `🔧 [processSwapForToken] Using...` logs
3. Wait a few minutes for swaps to process

### Issue: Only AMM decoder has usage, CPMM is 0

**Possible Causes:**
- No CPMM swaps happening
- CPMM program ID detection not working
- Token pools are not CPMM pools

**Solution:**
1. Check if you're monitoring any CPMM pools (e.g., USELESS: `Q2sPHPdUWFMg7M7wwrQKLrn619cAucfRsmhVJffodSp`)
2. Verify program ID in transaction logs
3. Check if pool addresses are correct CPMM pools

### Issue: High `failedDecodes`

**Possible Causes:**
- Pools are not Raydium pools (different DEX)
- Pool account data is invalid
- RPC endpoint issues

**Solution:**
1. This is normal for non-Raydium pools (decoder correctly rejects them)
2. If failures are >50%, check RPC endpoint health
3. Verify pool addresses are actually Raydium pools

---

## Expected Production Behavior

After 1 hour of running:
- ✅ `ammDecoderUsage`: 100+ (if monitoring Raydium AMM tokens)
- ✅ `cpmmDecoderUsage`: 10+ (if monitoring CPMM tokens like USELESS)
- ✅ `ammCacheSize`: 10-50 pools (depends on tokens monitored)
- ✅ `cpmmCacheSize`: 5-20 pools (depends on tokens monitored)
- ✅ `ammCacheHits`: Much higher than `totalDecodes` (efficient caching)
- ✅ `cpmmCacheHits`: Much higher than `totalDecodes` (efficient caching)

---

## Quick Health Check Command

```bash
# Get decoder stats
curl https://api.degen-oracle.com/api/decoders/stats | jq '.data.summary'

# Expected output:
{
  "totalSwapsProcessed": 1592,
  "ammDecoderUsage": 1250,
  "cpmmDecoderUsage": 342,
  "ammDecoderActive": true,
  "cpmmDecoderActive": true,
  "ammCacheSize": 45,
  "cpmmCacheSize": 12,
  "ammSuccessRate": "96.00%",
  "cpmmSuccessRate": "100.00%"
}
```

If you see `totalSwapsProcessed > 0`, **decoders are working!** ✅

---

## Summary

**Three ways to verify:**
1. ✅ **API Endpoint:** `GET /api/decoders/stats` (easiest, real-time)
2. ✅ **Backend Logs:** Look for `🔧 [processSwapForToken] Using...` and periodic stats
3. ✅ **Periodic Logs:** Every 5 minutes you'll see detailed stats

**Key indicators:**
- `usage > 0` = Decoders are being used ✅
- `cacheSize > 0` = Pools are being decoded ✅
- `cacheHits > totalDecodes` = Caching is working ✅
- Periodic logs appearing = Monitoring is active ✅

If all of these are true, **your decoders are working perfectly in production!** 🎉

