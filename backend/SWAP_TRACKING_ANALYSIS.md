# Swap Tracking Analysis: Single Stream, Multiple Tokens

## 🔍 **Current Issue**

We have **TWO different approaches** for handling swaps from a single gRPC stream, and they're not properly integrated:

---

## **Approach 1: gRPCTrendingService (Discovery Mode)**

### ✅ **What it does RIGHT:**
```javascript
// backend/services/gRPCTrendingService.js (Line 172-197)

processTransaction(msg) {
    const swap = this.parseRaydiumSwap(msg);
    
    if (swap) {
        this.stats.swapsDetected++;
        
        // ✅ CORRECT: Tracks BOTH tokens in the swap
        [swap.tokenMintA, swap.tokenMintB].forEach((tokenAddress) => {
            if (tokenAddress && !EXCLUDED_TOKENS.has(tokenAddress)) {
                const count = this.tokenSwaps.get(tokenAddress) || 0;
                this.tokenSwaps.set(tokenAddress, count + 1);  // ← Increments counter
                
                const volume = this.tokenVolumes.get(tokenAddress) || 0;
                this.tokenVolumes.set(tokenAddress, volume + Math.abs(swap.amountIn || swap.amountOut || 1));
            }
        });
    }
}
```

### ❌ **What it does WRONG:**
- **Does NOT save swaps to disk** - only keeps in-memory counters
- **Does NOT persist swap history** - data is lost after 5 minutes
- **Does NOT save individual swap records** - only aggregated counts
- **Does NOT integrate with ChartDatabase** - no persistent storage

---

## **Approach 2: EnhancedHybridPriceService (Tracking Mode)**

### ✅ **What it does RIGHT:**
```javascript
// backend/services/EnhancedHybridPriceService.mjs (Line 390-453)

async processSharedStreamUpdate(msg) {
    // Extract balance changes
    const balanceChanges = [...];
    
    // ✅ CORRECT: Iterates through ALL monitored tokens
    for (const [tokenAddress, poolAddress] of this.poolAddresses.entries()) {
        const tokenChanges = balanceChanges.filter(bc => 
            bc.mint === tokenAddress  // ← Filters for specific token
        );
        
        if (userTokenChanges.length > 0) {
            // ✅ CORRECT: Saves swap to disk
            await this.processSwapForToken(msg, tokenAddress, poolAddress, slot, signature);
        }
    }
}

// Line 1129-1191
async saveSwapToDatabase(swapRecord, tokenAddress, poolAddress) {
    // ✅ CORRECT: Persists to ChartDatabase
    await this.chartDatabase.storeSwaps([persistentSwapRecord]);
    await this.chartDatabase.processTokenWriteQueue(tokenAddress);
}
```

### ❌ **What it does WRONG:**
- **Only processes tokens in `poolAddresses` Map** - new tokens are ignored until manually added
- **Requires explicit subscription** via `ensureTokenMonitoring(tokenAddress)`
- **Does NOT auto-discover new tokens** - relies on external trigger

---

## **🚨 The Problem**

### **Scenario:**
1. **gRPCTrendingService** discovers 100 new trending tokens
2. Saves them to `tokens-cache.json`
3. **TokenCacheWatcher** detects new tokens
4. Calls `enhancedHybridPriceService.ensureTokenMonitoring(tokenAddress)` for each

### **What SHOULD happen:**
- ✅ Each token gets added to `poolAddresses` Map
- ✅ `processSharedStreamUpdate` starts filtering swaps for that token
- ✅ Swaps are saved to `ChartDatabase` per token
- ✅ Frontend receives real-time swap updates

### **What MIGHT be happening:**
- ❌ **Race condition**: Tokens added while stream is already processing
- ❌ **Pool address lookup fails**: Token doesn't have a known pool yet
- ❌ **Swap filtering too strict**: `bc.mint === tokenAddress` might miss some swaps
- ❌ **Write queue not flushing**: Swaps queued but not written to disk

---

## **🔬 Specific Issues to Investigate**

### **Issue 1: Pool Address Resolution**
```javascript
// Line 434-438 in EnhancedHybridPriceService.mjs
for (const [tokenAddress, poolAddress] of this.poolAddresses.entries()) {
    const tokenChanges = balanceChanges.filter(bc => 
        bc.mint === tokenAddress  // ← Only matches if mint === tokenAddress
    );
}
```

**Problem:** This assumes `bc.mint` is the **token address**, but in a swap:
- `bc.mint` could be **Token A** (e.g., BONK)
- `bc.mint` could be **Token B** (e.g., SOL)

If we're monitoring BONK, but the balance change is for SOL, **we miss the swap!**

### **Issue 2: Swap Detection Logic**
```javascript
// Line 219-225 in gRPCTrendingService.js
const tokenChanges = postTokenBalances.filter(post => {
    const pre = preTokenBalances.find(p => 
        p.accountIndex === post.accountIndex && 
        p.mint === post.mint
    );
    return pre && pre.uiTokenAmount.uiAmount !== post.uiTokenAmount.uiAmount;
});
```

**This is CORRECT** - it detects **ALL** token balance changes in the transaction.

But then:
```javascript
// Line 227-235
if (tokenChanges.length >= 2) {
    return {
        poolAddress,
        tokenMintA: tokenChanges[0].mint,  // ← First token
        tokenMintB: tokenChanges[1].mint,  // ← Second token
        amountIn: tokenChanges[0].uiTokenAmount.uiAmount,
        amountOut: tokenChanges[1].uiTokenAmount.uiAmount,
        signature: msg.signature || 'unknown'
    };
}
```

**This is ALSO CORRECT** - it captures both tokens involved in the swap.

---

## **🔧 The Fix**

### **Option 1: Enhance EnhancedHybridPriceService to track BOTH tokens**

```javascript
// In processSharedStreamUpdate (Line 432-451)
if (balanceChanges.length > 0) {
    // ✅ NEW: Check if ANY token in the swap is being monitored
    for (const [tokenAddress, poolAddress] of this.poolAddresses.entries()) {
        // Check if this transaction involves our monitored token
        const hasMonitoredToken = balanceChanges.some(bc => bc.mint === tokenAddress);
        
        if (hasMonitoredToken) {
            // Process the ENTIRE swap (both tokens)
            await this.processSwapForToken(msg, tokenAddress, poolAddress, slot, transactionSignature);
        }
    }
}
```

### **Option 2: Make gRPCTrendingService save swaps to disk**

```javascript
// In processTransaction (Line 172-197)
processTransaction(msg) {
    const swap = this.parseRaydiumSwap(msg);
    
    if (swap) {
        this.stats.swapsDetected++;
        
        [swap.tokenMintA, swap.tokenMintB].forEach(async (tokenAddress) => {
            if (tokenAddress && !EXCLUDED_TOKENS.has(tokenAddress)) {
                // Increment counter
                const count = this.tokenSwaps.get(tokenAddress) || 0;
                this.tokenSwaps.set(tokenAddress, count + 1);
                
                // ✅ NEW: Save swap to disk
                const swapRecord = {
                    timestamp: Date.now(),
                    slot: swap.slot || 0,
                    type: swap.tokenMintA === tokenAddress ? 'buy' : 'sell',
                    tokenAmount: swap.tokenMintA === tokenAddress ? swap.amountIn : swap.amountOut,
                    baseAmount: swap.tokenMintB === tokenAddress ? swap.amountIn : swap.amountOut,
                    maker: 'Unknown',
                    signature: swap.signature,
                    poolAddress: swap.poolAddress
                };
                
                await this.saveSwapToDatabase(swapRecord, tokenAddress);
            }
        });
    }
}
```

### **Option 3: Unified Swap Tracking Service**

Create a new `UnifiedSwapTracker` that:
1. Subscribes to the gRPC stream ONCE
2. Maintains a list of ALL monitored tokens (from cache)
3. For EVERY transaction, checks if ANY monitored token is involved
4. Saves swaps for ALL involved tokens
5. Updates both in-memory counters AND persistent storage

---

## **🎯 Recommended Solution**

**Implement Option 1 + Enhance Integration:**

1. **Fix `processSharedStreamUpdate` to detect swaps correctly:**
   - Check if **ANY** token in the balance changes matches a monitored token
   - If yes, save the **ENTIRE** swap (both sides)

2. **Ensure `ensureTokenMonitoring` is called for ALL discovered tokens:**
   - When `gRPCTrendingService` finishes a cycle
   - Pass the token list to `EnhancedHybridPriceService`
   - Call `ensureTokenMonitoring` for each

3. **Add validation logging:**
   - Log when a token is added to `poolAddresses`
   - Log when a swap is detected for that token
   - Log when a swap is saved to disk
   - Log write queue status

4. **Test with a known active token:**
   - Monitor BONK (known to have high swap activity)
   - Verify swaps are being saved to `data/charts/[BONK_ADDRESS].json`
   - Check that swap count increases over time

---

## **📊 Verification Steps**

1. **Check if tokens are being monitored:**
   ```javascript
   console.log('Monitored tokens:', Array.from(this.poolAddresses.keys()));
   ```

2. **Check if swaps are being detected:**
   ```javascript
   console.log('Balance changes:', balanceChanges.map(bc => bc.mint));
   console.log('Monitored tokens:', Array.from(this.poolAddresses.keys()));
   console.log('Match found:', balanceChanges.some(bc => this.poolAddresses.has(bc.mint)));
   ```

3. **Check if swaps are being saved:**
   ```javascript
   console.log('Saving swap for token:', tokenAddress);
   console.log('Queue size:', this.chartDatabase.writeQueues.get(tokenAddress)?.length);
   ```

4. **Check disk writes:**
   ```bash
   # List all token swap files
   ls -lh data/charts/*.json
   
   # Check file size (should grow over time)
   watch -n 1 'ls -lh data/charts/*.json | tail -5'
   ```

---

## **🚀 Next Steps**

1. Add detailed logging to `processSharedStreamUpdate`
2. Verify `poolAddresses` Map is populated correctly
3. Test with a single high-activity token (BONK)
4. Confirm swaps are being written to disk
5. Implement the fix based on findings



