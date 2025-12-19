# 🎯 Primary Source for Live Price Calculation

## ✅ **ANSWER: gRPC Stream from Solana Blockchain**

The **primary source** for live price calculation is **real-time swap data from the Solana blockchain**, captured via **gRPC stream** from Constant K (Yellowstone).

---

## 🔄 **COMPLETE PRICE CALCULATION FLOW**

### **1. Data Source: Solana Blockchain via gRPC**

```javascript
// backend/services/EnhancedHybridPriceService.mjs (Line 715-725)

const stream = await this.grpcClient.subscribeOnce(
    {}, // accounts
    {}, // slots  
    transactionFilters, // ✅ MONITOR TRANSACTIONS!
    {}, // transactionsStatus
    {}, // entry
    {}, // blocks
    {}, // blocksMeta
    CommitmentLevel.CONFIRMED,
    []
);
```

**What it monitors:**
- **All DEX programs**: Raydium, Orca, Meteora, Pump.fun, Jupiter, Phoenix
- **Pool addresses**: Specific liquidity pools for each token
- **Transaction filters**: Only confirmed, non-failed transactions
- **Token balance changes**: Pre/post swap balances

---

### **2. Swap Detection: Token Balance Changes**

```javascript
// Line 778-802: Extract balance changes from transaction

tx.meta.preTokenBalances.forEach((preBalance, index) => {
    const postBalance = tx.meta.postTokenBalances[index];
    
    const preAmount = preBalance.uiTokenAmount?.uiAmount || 0;
    const postAmount = postBalance.uiTokenAmount?.uiAmount || 0;
    const change = postAmount - preAmount;  // ✅ SWAP AMOUNT!
    
    if (Math.abs(change) > 0.000001) {
        balanceChanges.push({
            mint: preBalance.mint,           // Token address
            change: change,                  // Amount swapped
            owner: preBalance.owner,         // Wallet address
            preAmount: preAmount,
            postAmount: postAmount
        });
    }
});
```

**What it extracts:**
- **Token mint address**: Which token was swapped
- **Change amount**: How many tokens were bought/sold (in UI format, human-readable)
- **Owner address**: Who made the swap
- **Pre/post amounts**: Before and after balances

---

### **3. Price Calculation: From Swap Data**

```javascript
// Line 1036-1068: Calculate price from swap amounts

// ✅ PRIMARY CALCULATION METHOD:
if (baseSol > 0 && qtyTokenUI > 0) {
    // Price per token in SOL
    priceSol = baseSol / qtyTokenUI;
    
    // Price per token in USD
    priceUsd = priceSol * this.solPriceUSD;
    
    // Volume in USD
    volumeUsd = baseSol * this.solPriceUSD;
}
```

**Formula:**
```
1. Extract from gRPC transaction:
   - qtyTokenUI = Token amount swapped (UI format, e.g., 1000 tokens)
   - baseSol = SOL amount swapped (converted from lamports, e.g., 0.5 SOL)

2. Calculate price per token:
   priceSol = baseSol / qtyTokenUI
   Example: 0.5 SOL / 1000 tokens = 0.0005 SOL per token

3. Convert to USD:
   priceUsd = priceSol * solPriceUSD
   Example: 0.0005 SOL * $200/SOL = $0.10 per token

4. Calculate volume:
   volumeUsd = baseSol * solPriceUSD
   Example: 0.5 SOL * $200/SOL = $100 volume
```

---

### **4. SOL Price Source: Jupiter API**

```javascript
// Line 1531-1596: Update SOL price

async updateSolPrice() {
    try {
        // Method 1: Jupiter API for Wrapped SOL
        const response = await this.makeJupiterRequest(
            'https://lite-api.jup.ag/tokens/v2/search',
            { query: 'So11111111111111111111111111111111111111112' }
        );
        
        if (response.data?.[0]?.price) {
            solPrice = parseFloat(response.data[0].price);
        }
        
        this.solPriceUSD = solPrice;
        console.log(`💰 [SOL Price] Updated to: $${solPrice}`);
        
    } catch (error) {
        this.solPriceUSD = 200; // Fallback
    }
}
```

**SOL Price Update:**
- **Source**: Jupiter API (Wrapped SOL price)
- **Frequency**: Every 60 seconds (cached)
- **Fallback**: $200 if API fails
- **Purpose**: Convert SOL prices to USD

---

## 📊 **DATA FLOW DIAGRAM**

```
┌─────────────────────────────────────────────────────────────────┐
│                    SOLANA BLOCKCHAIN                             │
│                                                                   │
│  User makes swap: 1000 PROBITY for 0.5 SOL                      │
│  Transaction committed to blockchain                             │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │ gRPC Stream (Constant K)
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│            EnhancedHybridPriceService.mjs                        │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 1. gRPC Stream Receives Transaction                      │  │
│  │    - Slot: 12345678                                      │  │
│  │    - Signature: abc123...                                │  │
│  │    - Token balance changes detected                      │  │
│  └────────────────────────┬─────────────────────────────────┘  │
│                            │                                     │
│                            ▼                                     │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 2. Extract Swap Data                                     │  │
│  │    - Token: PROBITY (9N9V585y...)                        │  │
│  │    - Change: +1000 tokens (user bought)                  │  │
│  │    - SOL: -0.5 SOL (user paid)                           │  │
│  │    - Type: BUY                                           │  │
│  └────────────────────────┬─────────────────────────────────┘  │
│                            │                                     │
│                            ▼                                     │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 3. Calculate Price                                       │  │
│  │    priceSol = 0.5 SOL / 1000 tokens                      │  │
│  │             = 0.0005 SOL per token                       │  │
│  │                                                           │  │
│  │    priceUsd = 0.0005 SOL * $200/SOL                      │  │
│  │             = $0.10 per token                            │  │
│  │                                                           │  │
│  │    volumeUsd = 0.5 SOL * $200/SOL                        │  │
│  │              = $100                                      │  │
│  └────────────────────────┬─────────────────────────────────┘  │
│                            │                                     │
│                            ▼                                     │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 4. Create Swap Record                                    │  │
│  │    {                                                      │  │
│  │      timestamp: 1234567890,                              │  │
│  │      type: 'BUY',                                        │  │
│  │      tokenAmount: 1000,                                  │  │
│  │      baseAmount: 0.5,                                    │  │
│  │      price: 0.0005,      // ← SOL price                 │  │
│  │      volumeUsd: 100,                                     │  │
│  │      maker: 'wallet123...',                              │  │
│  │      signature: 'abc123...'                              │  │
│  │    }                                                      │  │
│  └────────────────────────┬─────────────────────────────────┘  │
│                            │                                     │
│                            ▼                                     │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 5. Broadcast to Frontend                                 │  │
│  │    - WebSocket: Instant update                           │  │
│  │    - HTTP API: /hybrid-price endpoint                    │  │
│  │    - Save to disk: data/charts/[TOKEN].json              │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
                             │
                             │ WebSocket / HTTP
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    FRONTEND: TokenDetail Modal                   │
│                                                                   │
│  💎 Market Cap          📈 Price           💧 Liquidity          │
│  $1.25M                 $0.10              $123K                 │
│  📡 Live                📡 Live            📡 Live               │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

---

## 🎯 **KEY POINTS**

### **1. Primary Source = gRPC Stream**
- **NOT Jupiter API** (only used for SOL price)
- **NOT DexScreener** (not used at all)
- **NOT HTTP polling** (only fallback)
- **YES: Real-time Solana blockchain data via gRPC**

### **2. Price Calculation = Swap Math**
```
Price = SOL Amount / Token Amount
```
- **Direct calculation** from actual swap transactions
- **Real market price** based on actual trades
- **Instant updates** when swaps occur

### **3. Data Sources Summary**
| Data Point | Source | Update Frequency |
|------------|--------|------------------|
| **Token swap amounts** | gRPC stream (Solana) | Real-time (~50-100ms) |
| **SOL price** | Jupiter API | Every 60 seconds |
| **Token price** | Calculated from swaps | Real-time (~50-100ms) |
| **Market cap** | Calculated (price × supply) | Real-time |
| **Liquidity** | Pool reserves | Real-time |

---

## 🔍 **VERIFICATION**

### **Check Backend Logs:**
```javascript
// When swap is detected:
🔄 [EnhancedHybridPriceService] Processing swap update for 9N9V585y...
💰 [EnhancedHybridPriceService] Converting from lamports: 500000000 -> 0.500000000 SOL
📊 [EnhancedHybridPriceService] Token quantity (UI): 1000
💰 [EnhancedHybridPriceService] Calculated - Price: 0.000500000 SOL/token, $0.100000 USD, Volume: $100.0000

// SOL price update:
💰 [SOL Price] Updated to: $200.00
```

### **Check Data Flow:**
```
1. Solana blockchain: User swaps 1000 tokens for 0.5 SOL
   ↓
2. gRPC stream: Transaction detected at slot 12345678
   ↓
3. processSwapUpdate(): Extract amounts (1000 tokens, 0.5 SOL)
   ↓
4. Calculate: 0.5 SOL / 1000 tokens = 0.0005 SOL per token
   ↓
5. Convert: 0.0005 SOL × $200 = $0.10 per token
   ↓
6. Broadcast: WebSocket sends to frontend
   ↓
7. UI updates: Shows $0.10 with "📡 Live" indicator
```

---

## ✅ **ADVANTAGES OF THIS APPROACH**

1. **Real-time**: Prices update within 50-100ms of swap
2. **Accurate**: Based on actual market transactions, not estimates
3. **Independent**: Doesn't rely on external APIs for token prices
4. **Scalable**: Single gRPC stream monitors multiple tokens
5. **Reliable**: Direct connection to Solana blockchain
6. **Transparent**: Can trace every price to a specific swap

---

## 🚫 **WHAT IS NOT THE PRIMARY SOURCE**

### **Jupiter API:**
- ❌ NOT used for token prices
- ✅ ONLY used for SOL/USD conversion
- ✅ ONLY used for token metadata (decimals, symbol, etc.)

### **DexScreener:**
- ❌ NOT used at all in live price calculation
- ✅ May be used for initial token discovery only

### **HTTP Polling:**
- ❌ NOT the primary source
- ✅ ONLY a fallback when WebSocket disconnects
- ✅ Still uses the same calculated prices from gRPC swaps

---

## 🎯 **SUMMARY**

**Primary Source for Live Price Calculation:**

1. **gRPC Stream** from Solana blockchain (via Constant K)
2. **Real swap transactions** detected in real-time
3. **Direct calculation** from swap amounts:
   - `Price = SOL Amount / Token Amount`
   - `Price USD = Price SOL × SOL Price`
4. **SOL price** from Jupiter API (updated every 60s)
5. **Result**: Real-time, accurate prices based on actual market activity

**In one sentence:**
> Live prices are calculated directly from real-time Solana swap transactions detected via gRPC stream, using the formula `Price = SOL Amount / Token Amount`, with SOL/USD conversion from Jupiter API.

🚀 **This is true decentralized, real-time price discovery!**



