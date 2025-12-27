# gRPC Trending Service - Production Integration Plan

## Overview
This document outlines the plan to integrate the tested and validated gRPC trending token discovery service into production. The service will run as a **separate gRPC stream** (independent from DexScreenerStyleMonitor) to discover trending tokens every 5 minutes.

---

## 🎯 Objectives

1. **Discover trending tokens** from gRPC DEX transaction streams every 5 minutes
2. **Apply strict filtering** to exclude scams, rugged tokens, and low-quality tokens
3. **Process valid tokens** through the full EnhancedTokenProcessor workflow (Jupiter → Twitter → Scoring → Database)
4. **Exclude bonding curve tokens** (to be handled separately later)

---

## 📋 Integration Components

### 1. **gRPCTrendingService.js** (Production Service)
**Location:** `xtrend/backend/services/gRPCTrendingService.js`

**Current State:**
- ✅ Basic gRPC stream setup
- ✅ Basic swap detection (needs upgrade)
- ✅ Basic filtering
- ✅ Integration with EnhancedTokenProcessor

**Required Updates:**

#### A. Swap Detection Upgrade
- **Replace:** `parseRaydiumSwap()` with `processTxForSwap()` from `SwapDetectionHelpers.mjs`
- **Reason:** More accurate transaction-level decoding (same as production DexScreenerStyleMonitor)
- **Impact:** Better swap detection rate and accuracy

#### B. Enhanced Filtering System
Add the following filters (in order):

1. **L1 Filter: Excluded Tokens**
   - SOL, stablecoins, wrapped tokens, staking tokens
   - Already implemented ✅

2. **L2 Filter: Valid Token Check** (`isValidToken`)
   - Market cap > $10,000 (strictly greater)
   - 24h volume >= $5,000
   - Must have price OR market cap OR liquidity

3. **L2 Filter: Stable/Wrapped/Staking** (`isStableOrWrappedToken`)
   - Pattern matching on symbol/name
   - Already implemented ✅

4. **L2 Filter: Rugged Token Detection** (`isRuggedToken`) **NEW**
   - Price drop > -20% in 1h
   - Price drop > -30% in 6h
   - Price drop > -50% in 24h
   - Liquidity drop > -50% in 6h/24h
   - Volume > 3x market cap AND significant price drop

5. **L2 Filter: Suspicious Token** (`isSuspiciousToken`) **ENHANCED**
   - Blockaid scam indicators
   - Mint/freeze authority enabled
   - Top holders > 50%
   - Liquidity < 2% of market cap (or < 7% with volume > $20K)
   - Liquidity < 10% AND volume > liquidity
   - 24h volume > 5x liquidity
   - Dev balance > 10%
   - Organic score === 0

6. **L2 Filter: Bonding Curve Exclusion** **EXCLUDE FOR NOW**
   - Skip tokens with `bondingCurve < 100`
   - Will be handled separately later

#### C. Continuous Operation Mode
- **Current:** Runs single 5-minute cycle then stops
- **Required:** Run continuously, discovering tokens every 5 minutes
- **Implementation:**
  ```javascript
  // After each cycle completes:
  - Reset swap tracking (keep token data)
  - Wait 5 minutes
  - Start next cycle
  ```

#### D. Configuration
- **Monitoring Duration:** 5 minutes per cycle
- **Discovery Interval:** 5 minutes (continuous)
- **Top Tokens Count:** Configurable via env var (default: 50)
- **Environment Variables:**
  - `KGRPC_ENDPOINT` (already used)
  - `KGRPC_API` (already used)
  - `JUP_API_ENDPOINT` (already used)
  - `JUP_API_KEY` (already used)
  - `TOP_TRENDING_TOKENS_COUNT` (new, default: 50)

---

### 2. **EnhancedTokenProcessor Integration**
**Location:** `xtrend/backend/enhancedTokenProcessor.js`

**Current State:**
- ✅ Has `processingQueue` array
- ✅ Has workflow: `processJupiterStage()` → `processTwitterStage()` → `processScoringStage()` → `saveFinalDatabase()`
- ✅ Already integrated with gRPCTrendingService via `feedTokensIntoProcessor()`

**Required Updates:**
- ✅ **No changes needed** - existing integration is correct
- Tokens are added to `processingQueue` and processed through full workflow

---

### 3. **EnhancedBackend Integration**
**Location:** `xtrend/backend/enhancedBackend.mjs`

**Current State:**
- gRPCTrendingService is initialized but may not be running continuously

**Required Updates:**

#### A. Initialize Service
```javascript
// In constructor or initialization:
this.grpcTrendingService = new gRPCTrendingService(
  this.enhancedHybridPriceService,
  this.tokenProcessor
);
```

#### B. Start Continuous Operation
```javascript
// In setupBackgroundTasks() or similar:
// Start gRPC Trending Service (runs continuously every 5 minutes)
(async () => {
  try {
    await this.grpcTrendingService.initialize();
    await this.grpcTrendingService.startContinuousMonitoring();
  } catch (error) {
    console.error('[Enhanced Backend] ❌ Failed to start gRPC Trending Service:', error);
  }
})();
```

---

## 🔄 Workflow Flow

```
┌─────────────────────────────────────────────────────────────┐
│ 1. gRPC Trending Service (Every 5 minutes)                 │
│    - Opens gRPC stream (DEX programs filter)                │
│    - Tracks swaps for 5 minutes                            │
│    - Detects tokens with swap activity                      │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Jupiter Data Fetch (Batch)                               │
│    - Fetches Jupiter API data for all discovered tokens     │
│    - Gets: market cap, liquidity, volume, audit, stats     │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Multi-Layer Filtering                                    │
│    L1: Excluded tokens (SOL, stables, etc.)                │
│    L2: Valid token (mcap > $10K, volume >= $5K)             │
│    L2: Stable/wrapped/staking tokens                        │
│    L2: Rugged tokens (price/liquidity drops)                │
│    L2: Suspicious tokens (audit flags, low liquidity)       │
│    L2: Bonding curve tokens (EXCLUDED)                      │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Scoring & Ranking                                        │
│    - Calculate score based on swaps, mcap, liquidity, etc.  │
│    - Sort by score                                          │
│    - Take top N tokens (default: 50)                        │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. EnhancedTokenProcessor Workflow                         │
│    - Add tokens to processingQueue                          │
│    - processJupiterStage() (enrich Jupiter data)            │
│    - processTwitterStage() (fetch Twitter data)              │
│    - processScoringStage() (calculate enhanced scores)      │
│    - saveFinalDatabase() (save to tokens-cache.json)       │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ 6. Final Database                                           │
│    - Tokens saved to tokens-cache.json                      │
│    - Available for frontend display                         │
│    - Includes: Jupiter data, Twitter data, scores           │
└─────────────────────────────────────────────────────────────┘
```

---

## 📝 Implementation Checklist

### Phase 1: Update gRPCTrendingService.js
- [ ] Import `processTxForSwap` from `SwapDetectionHelpers.mjs`
- [ ] Replace `parseRaydiumSwap()` with `processTxForSwap()` in `processTransaction()`
- [ ] Add `isValidToken()` function (market cap > $10K, volume >= $5K)
- [ ] Add `isRuggedToken()` function (price/liquidity drop detection)
- [ ] Enhance `isSuspiciousToken()` (unlocked liquidity detection)
- [ ] Update `isStableOrWrappedToken()` if needed
- [ ] Add `startContinuousMonitoring()` method (runs every 5 minutes)
- [ ] Update `processAndSaveTokens()` to use new filters
- [ ] Add environment variable for `TOP_TRENDING_TOKENS_COUNT`
- [ ] Store `stats1h`, `stats6h`, `stats24h` from Jupiter API

### Phase 2: Integration
- [ ] Verify EnhancedTokenProcessor integration (already exists)
- [ ] Update EnhancedBackend to start continuous monitoring
- [ ] Test that tokens flow through processor workflow
- [ ] Verify tokens are saved to database

### Phase 3: Testing
- [ ] Run service for 15+ minutes
- [ ] Verify tokens are discovered every 5 minutes
- [ ] Verify filters are working (no scams, rugged tokens, etc.)
- [ ] Verify tokens go through full processor workflow
- [ ] Verify tokens appear in final database

---

## 🔍 Key Differences from Test

| Aspect | Test (`test-grpc-trending-discovery.mjs`) | Production (`gRPCTrendingService.js`) |
|--------|-------------------------------------------|----------------------------------------|
| **Purpose** | Testing/validation | Production service |
| **Duration** | 15 minutes (test) | Continuous (every 5 min) |
| **Bonding Curves** | Tracked separately | Excluded (for now) |
| **Token Processing** | Display only | Full processor workflow |
| **Database** | None | tokens-cache.json |
| **Integration** | Standalone | Integrated with backend |

---

## ⚠️ Important Notes

1. **Separate gRPC Stream:** This service opens a **second gRPC stream** (different from DexScreenerStyleMonitor). This is intentional and expected.

2. **Bonding Curve Tokens:** Currently excluded. Will be handled in a separate service later.

3. **Filter Order:** Filters must be applied in the specified order for optimal performance.

4. **Rate Limiting:** Jupiter API calls are batched (100 tokens per batch) to avoid rate limits.

5. **Error Handling:** Service should continue running even if one cycle fails.

6. **Logging:** All filtering decisions should be logged for debugging.

---

## 🚀 Deployment Steps

1. **Backup current service:**
   ```bash
   cp backend/services/gRPCTrendingService.js backend/services/gRPCTrendingService.js.backup
   ```

2. **Update service with new filters and swap detection**

3. **Update EnhancedBackend to start continuous monitoring**

4. **Test in development environment**

5. **Monitor logs for first few cycles**

6. **Deploy to production**

---

## 📊 Expected Results

- **Discovery Rate:** ~10-50 trending tokens per 5-minute cycle (after filtering)
- **Filter Rate:** ~80-90% of discovered tokens filtered out (scams, low quality, etc.)
- **Processor Queue:** Tokens added every 5 minutes
- **Database Updates:** New tokens appear in tokens-cache.json after full workflow

---

## 🔗 Related Files

- `xtrend/backend/services/gRPCTrendingService.js` - Main service
- `xtrend/backend/services/SwapDetectionHelpers.mjs` - Swap detection utility
- `xtrend/backend/enhancedTokenProcessor.js` - Token processing workflow
- `xtrend/backend/enhancedBackend.mjs` - Backend initialization
- `xtrend/test-grpc-trending-discovery.mjs` - Test/validation script

---

## ✅ Review Checklist

Before implementation, please review:
- [ ] Filter thresholds are appropriate (market cap, volume, etc.)
- [ ] Rugged token detection thresholds are correct
- [ ] Unlocked liquidity detection is working
- [ ] Integration with EnhancedTokenProcessor is correct
- [ ] Continuous operation mode is implemented
- [ ] Error handling is robust
- [ ] Logging is sufficient for debugging

---

**Status:** Ready for implementation after review**

