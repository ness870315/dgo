# Proof of Concept: Program-Based Filtering

## Overview

Instead of filtering by individual pool addresses, we filter by **DEX Program IDs** and then parse transactions to extract pool addresses automatically.

## The Core Concept

### Current Approach (What We Have Now)
```javascript
// ❌ ONE STREAM PER TOKEN/POOL
const tokens = ['TokenA', 'TokenB', 'TokenC', ...]; // 200+ tokens
const pools = ['PoolA', 'PoolB', 'PoolC', ...];

// Each token needs its own stream filter
for (const token of tokens) {
    const stream = await grpcClient.subscribe({
        accountInclude: [pools[token]] // Filter by pool address
    });
    // Creates 200+ streams! 😱
}
```

### New Approach (DexScreener Style)
```javascript
// ✅ ONE STREAM FOR ALL DEXs
const DEX_PROGRAMS = [
    '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8', // Raydium AMM
    'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK', // Raydium CLMM
    'cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG', // Meteora
];

// Single stream monitoring ALL DEX transactions
const stream = await grpcClient.subscribe({
    accountInclude: DEX_PROGRAMS // Filter by program IDs
});

// Then parse transactions to extract pools
stream.on('data', (transaction) => {
    const swap = parseSwapTransaction(transaction);
    // swap.poolAddress = automatically discovered!
    // swap.tokenA, swap.tokenB = automatically extracted!
});
```

## Step-by-Step PoC Implementation

### Step 1: Modify Stream Subscription

**File:** `backend/services/EnhancedHybridPriceService.mjs`

**Current Code (Line ~336):**
```javascript
async startRealTimeMonitoring() {
    // Creates filters for each individual pool
    const allPools = Array.from(this.poolAddresses.values());
    const transactionFilters = {
        client: {
            accountInclude: allPools, // ❌ 200+ pool addresses
        }
    };
    
    this.sharedStream = await this.grpcClient.subscribeOnce(
        {}, {}, transactionFilters, {}, {}, {}, {}, 
        CommitmentLevel.CONFIRMED, []
    );
}
```

**PoC Change:**
```javascript
async startRealTimeMonitoring() {
    // ✅ Filter by DEX Program IDs instead of pools
    const DEX_PROGRAM_IDS = [
        '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8', // Raydium AMM
        'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK', // Raydium CLMM
        // Add more as needed
    ];
    
    const transactionFilters = {
        client: {
            accountInclude: DEX_PROGRAM_IDS, // ✅ Only 5-10 program IDs!
            vote: false,
            failed: false
        }
    };
    
    console.log(`📊 Creating single stream for ${DEX_PROGRAM_IDS.length} DEX programs`);
    
    this.sharedStream = await this.grpcClient.subscribeOnce(
        {}, {}, transactionFilters, {}, {}, {}, {}, 
        CommitmentLevel.CONFIRMED, []
    );
    
    // Now we'll parse transactions to extract pool addresses
    this.setupTransactionParser();
}
```

### Step 2: Parse Transaction to Extract Swap Data

**New Method: Parse Raydium Swap Transaction:**

```javascript
parseSwapTransaction(transaction) {
    try {
        // 1. Check which DEX program this transaction belongs to
        const accountKeys = transaction.transaction?.message?.accountKeys || [];
        
        // Find DEX program ID in account keys
        const dexProgramId = this.findDexProgram(accountKeys);
        if (!dexProgramId) return null;
        
        // 2. Parse based on DEX type
        const dexType = DEX_PROGRAMS[dexProgramId];
        
        switch(dexType) {
            case 'Raydium AMM':
                return this.parseRaydiumSwap(transaction, accountKeys);
            case 'Raydium CLMM':
                return this.parseRaydiumCLMMSwap(transaction, accountKeys);
            case 'Meteora':
                return this.parseMeteoraSwap(transaction, accountKeys);
            default:
                return null;
        }
    } catch (error) {
        console.error('Error parsing transaction:', error);
        return null;
    }
}

findDexProgram(accountKeys) {
    const DEX_PROGRAM_IDS = [
        '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',
        'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK',
        'cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG',
    ];
    
    for (const key of accountKeys) {
        const pubkey = key.pubkey || key;
        if (DEX_PROGRAM_IDS.includes(pubkey)) {
            return pubkey;
        }
    }
    return null;
}
```

### Step 3: Parse Raydium Swap (Example)

**Raydium AMM Swap Structure:**
```
Instruction Accounts (in order):
[0] Pool State Account (THE POOL ADDRESS!) ← We want this!
[1] Pool Authority
[2-4] Token Accounts
[5-7] Token Mints ← We want these!
[8-9] User accounts
...
```

```javascript
parseRaydiumSwap(transaction, accountKeys) {
    const instructions = transaction.transaction?.message?.instructions || [];
    
    for (const instruction of instructions) {
        // Raydium swap instruction discriminator (first 8 bytes)
        const instructionData = instruction.data || [];
        const discriminator = Buffer.from(instructionData.slice(0, 8)).toString('hex');
        
        // Raydium AMM swap instruction: 0x9aa6872f (encoded)
        if (discriminator === '9aa6872f00000000' || discriminator.startsWith('9aa6872f')) {
            
            // Extract accounts from instruction
            const accountIndices = instruction.programIdIndex !== undefined 
                ? instruction.accounts 
                : instruction.accountKeyIndexes;
            
            if (!accountIndices || accountIndices.length < 9) continue;
            
            // POOL ADDRESS = First account (index 0)
            const poolStateIndex = accountIndices[0];
            const poolAddress = accountKeys[poolStateIndex]?.pubkey || accountKeys[poolStateIndex];
            
            // TOKEN MINTS = Accounts 5 and 6
            const tokenMintAIndex = accountIndices[5];
            const tokenMintBIndex = accountIndices[6];
            const tokenMintA = accountKeys[tokenMintAIndex]?.pubkey || accountKeys[tokenMintAIndex];
            const tokenMintB = accountKeys[tokenMintBIndex]?.pubkey || accountKeys[tokenMintBIndex];
            
            // Parse amounts from instruction data (offset 8+)
            let amountIn = 0;
            let amountOut = 0;
            
            if (instructionData.length >= 24) {
                // Amount in (8 bytes, little-endian)
                amountIn = Number(
                    Buffer.from(instructionData.slice(8, 16)).readBigUInt64LE()
                );
                // Amount out (8 bytes, little-endian)
                amountOut = Number(
                    Buffer.from(instructionData.slice(16, 24)).readBigUInt64LE()
                );
            }
            
            // Extract from pre/post balances if available
            const preBalances = transaction.meta?.preBalances || [];
            const postBalances = transaction.meta?.postBalances || [];
            
            return {
                poolAddress,
                tokenMintA,
                tokenMintB,
                amountIn,
                amountOut,
                dexType: 'Raydium AMM',
                signature: transaction.transaction?.signatures?.[0],
                slot: transaction.slot,
                timestamp: this.estimateTimestamp(transaction.slot)
            };
        }
    }
    
    return null;
}
```

### Step 4: Process Parsed Swaps

```javascript
setupTransactionParser() {
    if (!this.sharedStream) return;
    
    this.sharedStream.on('data', async (msg) => {
        try {
            // Parse transaction to extract swap data
            const swap = this.parseSwapTransaction(msg);
            
            if (!swap) return; // Not a swap transaction
            
            console.log(`✅ Discovered swap:`, {
                pool: swap.poolAddress.substring(0, 16) + '...',
                tokenA: swap.tokenMintA?.substring(0, 8) + '...',
                tokenB: swap.tokenMintB?.substring(0, 8) + '...',
                dexType: swap.dexType
            });
            
            // 1. Auto-register pool if not seen before
            await this.autoRegisterPool(swap.poolAddress, {
                tokenA: swap.tokenMintA,
                tokenB: swap.tokenMintB,
                dexType: swap.dexType
            });
            
            // 2. Update price and process swap
            await this.processSwap(swap);
            
            // 3. Track which tokens we're monitoring
            if (this.isTokenMonitored(swap.tokenMintA) || this.isTokenMonitored(swap.tokenMintB)) {
                await this.emitSwapUpdate(swap);
            }
            
        } catch (error) {
            console.error('Error processing transaction:', error);
        }
    });
}

async autoRegisterPool(poolAddress, poolInfo) {
    // Check if pool already exists in our database
    const existing = await this.chartDatabase.getPoolAddress(poolInfo.tokenA);
    
    if (!existing || existing !== poolAddress) {
        console.log(`🆕 Auto-discovering new pool: ${poolAddress}`);
        
        // Register in our system
        await this.chartDatabase.setPoolMapping(poolInfo.tokenA, poolAddress);
        await this.chartDatabase.setPoolMapping(poolInfo.tokenB, poolAddress);
        
        // Fetch additional pool metadata
        const poolMetadata = await this.fetchPoolMetadata(poolAddress, poolInfo.dexType);
        
        // Store in our tracking
        this.poolAddresses.set(poolInfo.tokenA, poolAddress);
        this.poolAddresses.set(poolInfo.tokenB, poolAddress);
        
        console.log(`✅ Auto-registered pool ${poolAddress} for tokens ${poolInfo.tokenA} / ${poolInfo.tokenB}`);
    }
}
```

### Step 5: Compare Performance

**Test Script:**

```javascript
async function testPoC() {
    console.log('🧪 Testing Program-Based Filtering PoC\n');
    
    let swapCount = 0;
    let poolsDiscovered = new Set();
    let tokensSeen = new Set();
    
    const startTime = Date.now();
    
    // Monitor for 60 seconds
    const testDuration = 60000;
    
    this.sharedStream.on('data', (msg) => {
        const swap = this.parseSwapTransaction(msg);
        
        if (swap) {
            swapCount++;
            poolsDiscovered.add(swap.poolAddress);
            tokensSeen.add(swap.tokenMintA);
            tokensSeen.add(swap.tokenMintB);
            
            console.log(`Swap #${swapCount}: Pool ${swap.poolAddress.substring(0, 16)}...`);
        }
    });
    
    // Wait for test duration
    await new Promise(resolve => setTimeout(resolve, testDuration));
    
    const duration = (Date.now() - startTime) / 1000;
    
    console.log('\n📊 RESULTS:');
    console.log(`Duration: ${duration}s`);
    console.log(`Swaps processed: ${swapCount}`);
    console.log(`Swaps/second: ${(swapCount / duration).toFixed(2)}`);
    console.log(`Pools discovered: ${poolsDiscovered.size}`);
    console.log(`Unique tokens: ${tokensSeen.size}`);
    console.log(`Memory usage: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`);
}
```

**Expected Results:**
```
📊 RESULTS:
Duration: 60s
Swaps processed: 15,000-50,000
Swaps/second: 250-800
Pools discovered: 500-2000
Unique tokens: 1000-5000
Memory usage: ~200-500 MB
```

## Visualization of the Flow

```
┌─────────────────────────────────────────────────┐
│  Yellowstone gRPC Stream (Single Connection)    │
│  Filter: DEX Program IDs                           │
│  (Only 5-10 programs, not 200+ pools)          │
└──────────────────┬──────────────────────────────┘
                   │
                   ↓ Receives ALL DEX transactions
┌─────────────────────────────────────────────────┐
│         Transaction Parser                      │
│  1. Detect which DEX (Raydium/Orca/etc)        │
│  2. Parse instruction data                      │
│  3. Extract pool address                        │
│  4. Extract token mints                         │
│  5. Extract amounts                             │
└──────────────────┬──────────────────────────────┘
                   │
                   ↓ Swap object {poolAddress, tokenA, tokenB, amounts}
┌─────────────────────────────────────────────────┐
│         Pool Auto-Registration                  │
│  - Check if pool exists in DB                   │
│  - If new, fetch metadata                       │
│  - Register in poolAddresses map                │
└──────────────────┬──────────────────────────────┘
                   │
                   ↓
┌─────────────────────────────────────────────────┐
│         Swap Processing                         │
│  - Calculate price                              │
│  - Update cache                                 │
│  - Emit events                                  │
│  - Store in database                            │
└─────────────────────────────────────────────────┘
```

## Benefits of PoC

### Before (Current):
- ❌ 200+ gRPC streams (one per token)
- ❌ Only monitors manually added pools
- ❌ CPU: 40-60% (multiple stream handlers)
- ❌ Coverage: ~200 pools

### After (PoC):
- ✅ 1 gRPC stream (for all DEXs)
- ✅ Auto-discovers ALL pools
- ✅ CPU: 20-30% (single parser)
- ✅ Coverage: ALL Solana pools!

## Implementation Checklist

- [ ] Replace `accountInclude: pools` with `accountInclude: DEX_PROGRAMS`
- [ ] Implement `parseSwapTransaction()` method
- [ ] Implement `parseRaydiumSwap()` for Raydium AMM
- [ ] Implement `autoRegisterPool()` for pool discovery
- [ ] Test with 60-second monitoring session
- [ ] Measure: swaps/sec, pools discovered, memory usage
- [ ] Compare performance vs current approach

## Testing the PoC

```bash
# 1. Start the PoC
node backend/test-poc-program-filtering.js

# 2. Monitor output for 60 seconds
# Expected: 15k-50k swaps, 500-2k pools discovered

# 3. Compare metrics
# - Swaps processed per second
# - Pools auto-discovered
# - Memory usage
# - CPU usage

# 4. If successful, integrate into main service
```

## Risks & Mitigation

**Risk 1: Transaction parsing errors**
- **Mitigation:** Start with one DEX (Raydium), add others incrementally

**Risk 2: Too many swaps to process**
- **Mitigation:** Batch processing, rate limiting, worker queues

**Risk 3: Missing swap data**
- **Mitigation:** Fallback to account balance changes (like we do now)

**Risk 4: Incorrect pool extraction**
- **Mitigation:** Validate pool addresses against known pools

## Success Criteria

✅ PoC is successful if:
1. Single stream processes 10,000+ swaps per minute
2. Auto-discovers 100+ pools in first hour
3. Memory usage stays under 1GB
4. No missed swaps for monitored tokens
5. 99% reduction in gRPC streams

---

**Estimated Time:** 3-5 days for PoC
**Risk Level:** Low (can revert easily)
**Impact:** Massive (enables DexScreener-level coverage)



