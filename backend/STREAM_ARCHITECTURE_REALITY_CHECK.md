# Stream Architecture: Reality Check

## 🚨 **THE MESS - You're Right!**

We have **TWO SEPARATE STREAMS** doing **DIFFERENT THINGS** and they're **NOT INTEGRATED**!

---

## **Stream 1: gRPCTrendingService (Discovery)**

### **What it does:**
```javascript
// Location: backend/services/gRPCTrendingService.js

// Filters by DEX PROGRAMS (not pools!)
const transactionFilters = {
    client: {
        accountInclude: DEX_PROGRAMS,  // ← Raydium, Orca, Meteora, Jupiter, Phoenix
        accountExclude: [],
        accountRequired: [],
        vote: false,
        failed: false
    }
};

// Processes EVERY swap on these DEXs
processTransaction(msg) {
    const swap = this.parseRaydiumSwap(msg);
    
    if (swap) {
        // ❌ ONLY increments counters - DOES NOT SAVE SWAPS!
        [swap.tokenMintA, swap.tokenMintB].forEach((tokenAddress) => {
            const count = this.tokenSwaps.get(tokenAddress) || 0;
            this.tokenSwaps.set(tokenAddress, count + 1);  // ← Just counting!
        });
    }
}
```

### **Result:**
- ✅ Sees ALL swaps across 5 DEXs (~28 swaps/second)
- ✅ Counts swaps per token
- ❌ **DOES NOT SAVE SWAPS TO DISK**
- ❌ **DOES NOT PERSIST SWAP HISTORY**
- ❌ **RUNS FOR 5 MINUTES THEN STOPS**

---

## **Stream 2: EnhancedHybridPriceService (Tracking)**

### **What it does:**
```javascript
// Location: backend/services/EnhancedHybridPriceService.mjs

// Filters by SPECIFIC POOL ADDRESSES (not DEX programs!)
const allPools = Array.from(this.poolAddresses.values());
const transactionFilters = {
    client: {
        accountInclude: allPools,  // ← Only specific pools for known tokens!
        accountExclude: [],
        accountRequired: [],
        vote: false,
        failed: false
    }
};

// Processes swaps for KNOWN tokens only
async processSharedStreamUpdate(msg) {
    // Check if transaction involves any monitored token
    for (const [tokenAddress, poolAddress] of this.poolAddresses.entries()) {
        if (hasMonitoredToken) {
            // ✅ SAVES swaps to disk!
            await this.processSwapForToken(msg, tokenAddress, poolAddress, slot, signature);
        }
    }
}
```

### **Result:**
- ✅ Saves swaps to `ChartDatabase`
- ✅ Persists to disk (`data/charts/[TOKEN].json`)
- ✅ Broadcasts to WebSocket
- ❌ **ONLY for tokens in `poolAddresses` Map**
- ❌ **MISSES new/unknown tokens**
- ❌ **Requires manual addition via `ensureTokenMonitoring()`**

---

## **🔥 THE PROBLEM:**

### **Scenario 1: Token in tokens-cache.json**
```
1. Backend starts
2. EnhancedHybridPriceService loads top 200 tokens from cache
3. Calls ensureTokenMonitoring() for each
4. Discovers pool addresses
5. Adds to poolAddresses Map
6. Creates Stream 2 filtered by these pools
7. ✅ SWAPS ARE SAVED for these 200 tokens
```

### **Scenario 2: New token discovered by gRPCTrendingService**
```
1. gRPCTrendingService runs 5-minute cycle
2. Discovers BONK is trending (100 swaps in 5 min)
3. Saves BONK to tokens-cache.json
4. TokenCacheWatcher detects new token
5. Calls ensureTokenMonitoring('BONK')
6. Discovers BONK's pool address
7. Adds BONK to poolAddresses Map
8. ❓ Stream 2 is ALREADY RUNNING with old pool list!
9. ❌ BONK swaps are NOT captured by Stream 2!
10. ❌ Need to RESTART Stream 2 with new pool list!
```

### **Scenario 3: Random new token NOT in cache**
```
1. New token launches on Raydium
2. Stream 1 (gRPCTrendingService) sees swaps
3. Counts them: tokenSwaps.set('NEW_TOKEN', 50)
4. ❌ NOT in tokens-cache.json
5. ❌ NOT in poolAddresses Map
6. ❌ Stream 2 doesn't know about it
7. ❌ SWAPS ARE NOT SAVED!
```

---

## **🎯 WHAT SHOULD HAPPEN:**

### **Option A: Single Universal Stream (RECOMMENDED)**

```javascript
// ONE stream filtered by DEX PROGRAMS (not pools)
const transactionFilters = {
    client: {
        accountInclude: [
            '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8', // Raydium
            'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc',  // Orca
            'Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB',  // Meteora
            'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',  // Jupiter
            'PhoeNiXZ8ByJGLkxNfZRnkUfjvmuYqLR89jjFHGqdXY'   // Phoenix
        ]
    }
};

// Process EVERY swap
processTransaction(msg) {
    const swap = parseSwap(msg);
    
    [swap.tokenMintA, swap.tokenMintB].forEach(async (tokenAddress) => {
        // ✅ Check if we care about this token
        if (shouldTrackToken(tokenAddress)) {
            // ✅ Save swap to disk
            await saveSwapToDatabase(swap, tokenAddress);
            
            // ✅ Update in-memory counters
            incrementSwapCount(tokenAddress);
            
            // ✅ Broadcast to WebSocket
            broadcastSwap(tokenAddress, swap);
        }
    });
}

function shouldTrackToken(tokenAddress) {
    // Track if:
    // 1. In tokens-cache.json (known tokens)
    // 2. In poolAddresses Map (actively monitored)
    // 3. Meets minimum criteria (market cap > $100K, not scam, etc.)
    return isInCache(tokenAddress) || 
           isMonitored(tokenAddress) || 
           meetsMinimumCriteria(tokenAddress);
}
```

**Benefits:**
- ✅ ONE stream for everything
- ✅ Captures ALL swaps across all DEXs
- ✅ Automatically tracks new tokens
- ✅ No need to restart stream when adding tokens
- ✅ Saves swaps for ALL relevant tokens

---

### **Option B: Dynamic Pool List (CURRENT BROKEN APPROACH)**

```javascript
// Stream filtered by pool addresses
const allPools = Array.from(this.poolAddresses.values());
const transactionFilters = {
    client: {
        accountInclude: allPools  // ← Problem: Static list!
    }
};

// When new token is added:
async ensureTokenMonitoring(tokenAddress) {
    // Add to map
    this.poolAddresses.set(tokenAddress, poolAddress);
    
    // ❌ PROBLEM: Stream is already running with old pool list!
    // ❌ Need to RESTART stream to include new pool!
    
    // ✅ FIX: Restart stream with updated pool list
    if (this.sharedStream) {
        this.sharedStream.end();
        this.sharedStream = null;
    }
    await this.startRealTimeMonitoring();  // ← Restart with new pools
}
```

**Problems:**
- ❌ Requires stream restart for every new token
- ❌ Misses swaps during restart
- ❌ Inefficient (constant restarts)
- ❌ Limited by pool count (max ~1000 pools per stream?)

---

## **🔍 CURRENT STATE:**

### **What's Actually Happening:**

1. **EnhancedHybridPriceService** creates Stream 2 at startup with ~200 pools
2. Stream 2 runs continuously, saving swaps for these 200 tokens
3. **gRPCTrendingService** creates Stream 1 every 5 minutes
4. Stream 1 discovers new trending tokens
5. New tokens added to tokens-cache.json
6. `ensureTokenMonitoring()` adds them to `poolAddresses` Map
7. ❌ **Stream 2 is NOT restarted** - still using old pool list!
8. ❌ **New tokens' swaps are NOT captured**!

### **Proof:**

```javascript
// Line 327 in EnhancedHybridPriceService.mjs
async startRealTimeMonitoring() {
    if (this.sharedStream) {
        console.log('⚠️ Shared stream already exists, skipping...');
        return;  // ← EXITS WITHOUT RESTARTING!
    }
    
    // Create stream with CURRENT pool list
    const allPools = Array.from(this.poolAddresses.values());
    // ...
}
```

**This means:**
- ✅ Initial 200 tokens: Swaps saved
- ❌ New discovered tokens: Swaps NOT saved (stream not restarted)
- ❌ Random new tokens: Never tracked at all

---

## **✅ THE FIX:**

### **Immediate Fix (Option B - Dynamic Restart):**

```javascript
// In ensureTokenMonitoring()
async ensureTokenMonitoring(tokenAddress) {
    // Add to map
    if (!this.poolAddresses.has(tokenAddress)) {
        const poolAddress = await this.discoverPoolAddress(tokenAddress);
        this.poolAddresses.set(tokenAddress, poolAddress);
        this.swapHistory.set(tokenAddress, []);
        
        // ✅ RESTART stream to include new pool
        if (this.sharedStream) {
            console.log(`🔄 Restarting stream to include ${tokenAddress}...`);
            this.sharedStream.end();
            this.sharedStream = null;
            await this.startRealTimeMonitoring();
        }
    }
    
    return true;
}
```

### **Better Fix (Option A - Universal Stream):**

1. **Merge the two streams into ONE**
2. Filter by DEX programs (not pools)
3. Process ALL swaps
4. Check each swap against `poolAddresses` or `tokens-cache`
5. Save swaps for ALL relevant tokens
6. No need to restart stream when adding tokens

---

## **📊 VERIFICATION:**

### **Check if swaps are being saved:**

```bash
# List all token swap files
ls -lh data/charts/*.json

# Check a specific token
cat data/charts/[TOKEN_ADDRESS].json | jq '.swaps | length'

# Watch for new swaps (should increase over time)
watch -n 5 'cat data/charts/[TOKEN_ADDRESS].json | jq ".swaps | length"'
```

### **Check if stream is capturing swaps:**

```bash
# Look for these logs:
🔄 [EnhancedHybridPriceService] Swap detected for [TOKEN]...
💾 [ChartDatabase] Token [TOKEN]: X swaps saved (total: Y)
```

### **Check if new tokens are being added:**

```bash
# Look for these logs:
✅ [EnhancedHybridPriceService] Added [TOKEN] -> pool [POOL] to monitoring map
🔄 Restarting stream to include [TOKEN]...  # ← Should see this!
```

---

## **🎯 BOTTOM LINE:**

**You're RIGHT - it's a MESS!**

- ❌ Two separate streams doing different things
- ❌ Stream 2 NOT restarted when new tokens added
- ❌ New tokens' swaps NOT being saved
- ❌ Confusion about which stream does what

**NEEDS FIXING:**
1. Either merge into ONE universal stream (best)
2. Or restart Stream 2 when new tokens added (quick fix)



