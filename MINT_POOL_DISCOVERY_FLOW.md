# 🔍 MINT & POOL DISCOVERY FLOW

## 📊 **Token Cache Structure**

Tokens in `tokens-cache.json` contain:

```javascript
{
  // ✅ ALWAYS PRESENT
  "contractAddress": "HqVZaYJnEcmKQKRf4K5N8eEuBjkTgpRzVfF7AYBFpump", // ← MINT
  "symbol": "ANON",
  "name": "Anon",
  "decimals": 6,
  "stage": "completed",
  
  // ⚠️ POOL DATA (one of these should exist)
  "poolAddress": "5VTLGyqawXjZ5hyeP6Pi7XAwTod734b3XQ2JKrHfRrNv", // Option 1
  
  "jupiterData": {
    "firstPool": {
      "id": "5VTLGyqawXjZ5hyeP6Pi7XAwTod734b3XQ2JKrHfRrNv", // Option 2
      "createdAt": "2024-11-01T..."
    },
    "circSupply": 1000000000,
    "usdPrice": 0.123
  },
  
  "graduatedPool": "5VTLGyqawXjZ5hyeP6Pi7XAwTod734b3XQ2JKrHfRrNv" // Option 3 (Pump.fun)
}
```

---

## 🚀 **Discovery Flow**

### **Step 1: Token Sources**

```
┌─────────────────────────────────────────────────────────────┐
│                    TOKEN DISCOVERY SOURCES                   │
└─────────────────────────────────────────────────────────────┘
        ↓                     ↓                     ↓
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│  Jupiter API  │    │  Pump.fun     │    │  CoinGecko    │
│  Discovery    │    │  Launchpad    │    │  Manual Add   │
└───────────────┘    └───────────────┘    └───────────────┘
        │                     │                     │
        │ Provides:           │ Provides:           │ Provides:
        │ - mint ✅           │ - mint ✅           │ - mint ✅
        │ - firstPool.id ✅   │ - graduatedPool ✅  │ - poolAddress ✅
        │ - decimals ✅       │ - decimals ✅       │ - decimals ✅
        │ - metadata          │ - metadata          │ - metadata
        └─────────────────────┴─────────────────────┘
                              ↓
                    ┌─────────────────┐
                    │ tokens-cache    │
                    │ .json           │
                    └─────────────────┘
```

### **Step 2: Token Processing**

```
┌─────────────────────────────────────────────────────────────┐
│              EnhancedTokenProcessor Pipeline                 │
└─────────────────────────────────────────────────────────────┘
        ↓                     ↓                     ↓
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│  Jupiter      │    │  Twitter      │    │  Scoring      │
│  Stage        │    │  Stage        │    │  Stage        │
│               │    │               │    │               │
│ Fetch full    │    │ Fetch social  │    │ Calculate     │
│ token data    │    │ metrics       │    │ final score   │
│ from Jupiter  │    │               │    │               │
└───────────────┘    └───────────────┘    └───────────────┘
                              ↓
                    ┌─────────────────┐
                    │ Save to Cache   │
                    │ stage =         │
                    │ "completed"     │
                    └─────────────────┘
```

### **Step 3: Onboarding to Monitor**

```
┌─────────────────────────────────────────────────────────────┐
│              RealTimeTokenMonitor.initialize()               │
└─────────────────────────────────────────────────────────────┘
                              ↓
                    ┌─────────────────┐
                    │ Load tokens     │
                    │ from cache      │
                    │ (stage =        │
                    │  "completed")   │
                    └─────────────────┘
                              ↓
                    ┌─────────────────┐
                    │ onboardCached   │
                    │ Tokens()        │
                    └─────────────────┘
                              ↓
        ┌─────────────────────┴─────────────────────┐
        ↓                                           ↓
┌───────────────┐                         ┌───────────────┐
│ Extract MINT  │                         │ Find POOL     │
│               │                         │               │
│ mint =        │                         │ pool =        │
│  token.       │                         │  1. poolAddr  │
│  contract     │                         │  2. firstPool │
│  Address      │                         │  3. graduated │
└───────────────┘                         └───────────────┘
        │                                           │
        └─────────────────────┬─────────────────────┘
                              ↓
                    ┌─────────────────┐
                    │ Validate Data   │
                    │                 │
                    │ ✅ mint exists  │
                    │ ✅ pool exists  │
                    │ ✅ decimals > 0 │
                    └─────────────────┘
                              ↓
                    ┌─────────────────┐
                    │ DexScreener     │
                    │ StyleMonitor    │
                    │ .onboardToken() │
                    └─────────────────┘
```

### **Step 4: Pool Subscription**

```
┌─────────────────────────────────────────────────────────────┐
│         DexScreenerStyleMonitor.onboardToken()               │
└─────────────────────────────────────────────────────────────┘
                              ↓
                    ┌─────────────────┐
                    │ Derive Pool     │
                    │ Token Accounts  │
                    │                 │
                    │ poolTokenAcc =  │
                    │  getATA(pool,   │
                    │   tokenMint)    │
                    │                 │
                    │ poolSOLAcc =    │
                    │  getATA(pool,   │
                    │   SOL_MINT)     │
                    └─────────────────┘
                              ↓
        ┌─────────────────────┴─────────────────────┐
        ↓                                           ↓
┌───────────────┐                         ┌───────────────┐
│ Subscribe to  │                         │ Subscribe to  │
│ Pool Token    │                         │ Pool          │
│ Accounts      │                         │ Transactions  │
│ (gRPC)        │                         │ (gRPC)        │
│               │                         │               │
│ - poolToken   │                         │ - maker       │
│ - poolSOL     │                         │ - signature   │
│               │                         │ - slot        │
│ Detect swaps  │                         │               │
│ from reserve  │                         │               │
│ changes       │                         │               │
└───────────────┘                         └───────────────┘
        │                                           │
        └─────────────────────┬─────────────────────┘
                              ↓
                    ┌─────────────────┐
                    │ 🔥 LIVE SWAP    │
                    │    DETECTION    │
                    │                 │
                    │ - Buy/Sell      │
                    │ - Amount        │
                    │ - Price (USD)   │
                    │ - Market Cap    │
                    │ - Maker         │
                    │ - TX Hash       │
                    └─────────────────┘
```

---

## 🔍 **Pool Discovery Code**

```javascript
// In RealTimeTokenMonitor.mjs - onboardCachedTokens()

for (const token of tokens) {
  const mint = token.contractAddress || token.tokenAddress;
  
  // 🎯 POOL DISCOVERY PRIORITY
  let pool = 
    token.poolAddress ||                    // 1. Direct poolAddress field
    token.jupiterData?.firstPool?.id ||     // 2. Jupiter firstPool
    token.graduatedPool;                    // 3. Pump.fun graduated pool
  
  // Handle graduatedPool object format
  if (pool && typeof pool === 'object') {
    pool = pool.address || pool.id;
  }
  
  // ⚠️ VALIDATION
  if (!pool || !token.decimals) {
    console.log(`⚠️  Skipping ${token.symbol}: Missing ${!pool ? 'pool' : 'decimals'}`);
    continue; // Skip this token
  }
  
  // ✅ ONBOARD TO MONITOR
  await dexScreenerMonitor.onboardToken(mint, {
    name: token.name || token.symbol,
    pool: pool,
    decimals: token.decimals
  });
}
```

---

## 📊 **Data Flow Summary**

### **What We Have:**
```
tokens-cache.json
    ↓
[ { mint, pool, decimals }, ... ]
    ↓
RealTimeTokenMonitor.onboardCachedTokens()
    ↓
DexScreenerStyleMonitor.onboardToken(mint, { pool, decimals })
    ↓
Subscribe to pool accounts via gRPC
    ↓
Detect swaps in real-time
```

### **What We Need:**
1. ✅ **MINT** (contractAddress) - Always available
2. ✅ **POOL** (poolAddress, firstPool.id, or graduatedPool) - Required
3. ✅ **DECIMALS** - Required

### **What Happens if Missing:**
- ❌ **No MINT**: Token is invalid, won't be in cache
- ❌ **No POOL**: Token is skipped with warning
- ❌ **No DECIMALS**: Token is skipped with warning

---

## 🚀 **Token Sources & Pool Availability**

| Source | MINT | POOL | DECIMALS | Notes |
|--------|------|------|----------|-------|
| **Jupiter Discovery** | ✅ | ✅ (`firstPool.id`) | ✅ | Best source, full data |
| **Pump.fun Graduated** | ✅ | ✅ (`graduatedPool`) | ✅ | Reliable for Pump tokens |
| **CoinGecko** | ✅ | ⚠️ (may be missing) | ✅ | May need pool lookup |
| **Manual Add** | ✅ | ⚠️ (user provides) | ✅ | Depends on user input |
| **gRPC Discovery** | ✅ | ❌ (not provided) | ⚠️ | Needs pool discovery |

---

## 🔮 **Future: Token Discovery Service**

For **Phase 5**, we'll build a separate discovery service that:

1. **Listens to ALL DEX programs** (broad net)
2. **Tracks new token activity** (swaps, volume, traders)
3. **Applies 2-layer filters** (activity + Jupiter quality)
4. **Fetches pool data** from Jupiter API
5. **Emits `qualityTokenFound` event** with full data
6. **Adds to DexScreener monitor** dynamically

This will enable automatic discovery without requiring tokens to be in the cache first.

---

## ✅ **Current Status**

- ✅ **DexScreenerStyleMonitor** built and tested
- ✅ **Pool discovery** implemented with 3-level fallback
- ✅ **Feature flag** integrated for safe deployment
- ✅ **Backward compatibility** maintained
- 🔄 **Ready for testing** with existing token cache
- 🚀 **Ready for deployment** with flag OFF by default

