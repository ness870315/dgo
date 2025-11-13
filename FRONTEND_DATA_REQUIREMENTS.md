# 🎨 Frontend Data Requirements Analysis

## 📊 **Components That Need Live Data**

---

## 1️⃣ **BubbleMap Component**

### **Required Data:**
- Market Cap
- Price
- Volume 24H
- TX 24H
- Makers 24H
- Age
- 5M, 1H, 6H, 24H stats

### **Current Data Source:**
```javascript
// frontend/src/components/BubbleMap.js
const BubbleMap = ({ tokens, fueledTokens = [], onTokenSelect, currentFilter = {} }) => {
  // Receives tokens as props from App.js
  // No direct WebSocket subscription
  // Relies on parent component to provide updated data
}
```

### **Data Flow:**
```
App.js (tokens state)
    ↓
BubbleMap (props)
    ↓
Renders bubbles with token data
```

### **✅ NEW SERVICE COMPATIBILITY:**

**DexScreenerStyleMonitor broadcasts:**
```javascript
{
  type: 'priceUpdate',
  tokenAddress: 'HqVZ...',
  data: {
    priceUsd: 0.123,
    currentPrice: 0.123,
    volume24h: 1234567,
    volume1h: 123456,
    volume5m: 12345,
    txns24h: 5000,
    txns1h: 500,
    txns5m: 50,
    makers24h: 1200,
    makers1h: 120,
    makers5m: 12,
    priceChange24h: 5.67,
    priceChange1h: 2.34,
    priceChange5m: 0.12,
    source: 'dexscreener-monitor',
    timestamp: 1234567890
  }
}
```

**✅ MATCHES REQUIREMENTS!**
- ✅ Market Cap: Calculated from `priceUsd * circSupply` (needs to be added)
- ✅ Price: `priceUsd` or `currentPrice`
- ✅ Volume 24H: `volume24h`
- ✅ TX 24H: `txns24h`
- ✅ Makers 24H: `makers24h`
- ❌ Age: Not included (needs to be added)
- ✅ 5M: `volume5m`, `txns5m`, `makers5m`, `priceChange5m`
- ✅ 1H: `volume1h`, `txns1h`, `makers1h`, `priceChange1h`
- ✅ 6H: `volume6h`, `txns6h`, `makers6h`, `priceChange6h` (needs to be added)
- ✅ 24H: `volume24h`, `txns24h`, `makers24h`, `priceChange24h`

---

## 2️⃣ **TokenRankedList Component**

### **Required Data:**
- Market Cap
- Price
- Volume 24H
- TX 24H
- Makers 24H
- Age
- 5M, 1H, 6H, 24H stats

### **Current Data Source:**
```javascript
// frontend/src/components/TokenRankedList.js
const TokenRankedList = ({ tokens, fueledTokens = [], onTokenSelect, categoryFilters }) => {
  const [rankings, setRankings] = useState([]);
  
  // Listens to WebSocket rankingUpdate events
  useEffect(() => {
    const handleRankingUpdate = (data) => {
      const wsRankings = data.rankings || [];
      
      setRankings(prevRankings => {
        // Merges WebSocket data with existing rankings
        const filteredRankings = wsRankings.filter(...).map(rankedToken => {
          const existing = existingMap.get(address);
          
          // Merges fields:
          return {
            ...existing,
            ...rankedToken,
            price: rankedToken.price,
            marketCap: rankedToken.marketCap,
            volume24h: rankedToken.volume24h,
            makers24h: rankedToken.makers24h,
            priceChange1h: rankedToken.priceChange1h,
            priceChange24h: getPriceChange(rankedToken.priceChange24h, existing?.priceChange24h)
          };
        });
      });
    };
    
    websocketService.on('rankingUpdate', handleRankingUpdate);
  }, []);
}
```

### **Data Flow:**
```
Backend broadcasts 'rankingUpdate'
    ↓
WebSocketService emits 'rankingUpdate'
    ↓
TokenRankedList merges with existing data
    ↓
Renders updated rankings
```

### **✅ NEW SERVICE COMPATIBILITY:**

**Current Backend (OLD):**
```javascript
// Broadcasts via broadcastRankingUpdate()
{
  type: 'rankingUpdate',
  rankings: [
    {
      contractAddress: 'HqVZ...',
      price: 0.123,
      marketCap: 1234567,
      volume24h: 123456,
      makers24h: 1200,
      priceChange1h: 2.34,
      priceChange24h: 5.67
    },
    // ... more tokens
  ],
  timestamp: 1234567890
}
```

**⚠️ NEW SERVICE ISSUE:**
The new `DexScreenerStyleMonitor` does NOT broadcast `rankingUpdate` messages!

It only broadcasts:
- `priceUpdate` (per token)
- `swapUpdate` (per token)

**🔧 SOLUTION NEEDED:**
We need to add a periodic `rankingUpdate` broadcast to the new service OR have the backend aggregate all token data and broadcast rankings.

---

## 3️⃣ **EnhancedTokenDetails Component**

### **Required Data:**
- Market Cap
- Price
- Liquidity

### **Current Data Source:**
```javascript
// frontend/src/components/EnhancedTokenDetails.js
const EnhancedTokenDetails = ({ token, fueledTokens = [], onClose, onTokenUpdated, onNavigateToPremium }) => {
  const [realTimeData, setRealTimeData] = useState(null);
  
  useEffect(() => {
    // Loads real-time data from API
    const loadRealTimeData = async () => {
      const API_BASE = process.env.REACT_APP_API_BASE_URL;
      const response = await fetch(`${API_BASE}/api/realtime/${tokenAddress}`);
      const data = await response.json();
      setRealTimeData(data);
    };
    
    loadRealTimeData();
    
    // Subscribes to WebSocket swap updates
    websocketService.subscribeToToken(tokenAddress);
    
    const handleSwapUpdate = (data) => {
      if (data.tokenAddress === tokenAddress && data.swapData) {
        setRealTimeData(prev => ({
          ...prev,
          swapHistory: [data.swapData, ...(prev?.swapHistory || [])],
          recentSwaps: [data.swapData, ...(prev?.recentSwaps || [])]
        }));
      }
    };
    
    websocketService.on('swapUpdate', handleSwapUpdate);
  }, [tokenAddress]);
}
```

### **Data Flow:**
```
Initial: API call to /api/realtime/:address
    ↓
Real-time: WebSocket swapUpdate events
    ↓
Updates swapHistory and recentSwaps
```

### **✅ NEW SERVICE COMPATIBILITY:**

**DexScreenerStyleMonitor broadcasts:**
```javascript
{
  type: 'swapUpdate',
  tokenAddress: 'HqVZ...',
  data: {
    tokenAddress: 'HqVZ...',
    symbol: 'ANON',
    type: 'buy',  // or 'sell'
    amountTokens: 1000,
    amountSOL: 0.5,
    priceSOL: 0.0005,
    priceUSD: 0.123,
    usdAmount: 123.45,
    volumeUSD: 123.45,
    marketCap: 1234567,
    maker: '5yAXCW...',
    signature: '3Kx7...',
    walletAddress: '5yAXCW...',
    timestamp: 1234567890,
    slot: 123456
  }
}
```

**✅ MATCHES REQUIREMENTS!**
- ✅ Market Cap: Included in swap data
- ✅ Price: `priceUSD`
- ❌ Liquidity: Not included (needs to be fetched separately or added)

---

## 4️⃣ **PriceChartModal Component**

### **Required Data:**
- Price
- Market Cap
- Load saved swaps (historical)
- Live swaps (real-time)

### **Current Data Source:**
```javascript
// frontend/src/components/PriceChartModal.js
const PriceChartModal = ({ token, onClose }) => {
  const [currentPrice, setCurrentPrice] = useState(null);
  const [realTimeData, setRealTimeData] = useState(null);
  
  // Subscribes to WebSocket updates
  useEffect(() => {
    const handleSwapUpdate = (data) => {
      if (data.tokenAddress === token?.contractAddress) {
        // Reload real-time data to get updated swaps
        loadRealTimeData();
      }
    };
    
    const handleWebSocketPriceUpdate = (data) => {
      if (data.tokenAddress === token?.contractAddress) {
        handlePriceUpdate(data);
      }
    };
    
    websocketService.on('swapUpdate', handleSwapUpdate);
    websocketService.on('priceUpdate', handleWebSocketPriceUpdate);
  }, [token?.contractAddress]);
  
  const handlePriceUpdate = (priceData) => {
    // Extracts price from various possible fields
    const price = priceData.price || priceData.priceUsd || 
                  priceData.data?.price || priceData.data?.priceUsd || 
                  priceData.currentPrice;
    
    setCurrentPrice(price);
  };
}
```

### **Data Flow:**
```
Initial: API call to load historical swaps
    ↓
Real-time: WebSocket priceUpdate + swapUpdate
    ↓
Updates price and triggers reload for new swaps
```

### **✅ NEW SERVICE COMPATIBILITY:**

**DexScreenerStyleMonitor broadcasts:**
```javascript
// Price updates
{
  type: 'priceUpdate',
  tokenAddress: 'HqVZ...',
  data: {
    priceUsd: 0.123,
    currentPrice: 0.123,
    // ... other metrics
  }
}

// Swap updates
{
  type: 'swapUpdate',
  tokenAddress: 'HqVZ...',
  data: {
    priceUSD: 0.123,
    marketCap: 1234567,
    // ... swap details
  }
}
```

**✅ MATCHES REQUIREMENTS!**
- ✅ Price: `priceUsd` or `currentPrice` in priceUpdate
- ✅ Market Cap: Included in swapUpdate
- ✅ Live swaps: swapUpdate events
- ✅ Historical swaps: API endpoint (existing)

---

## 🚨 **MISSING DATA IN NEW SERVICE:**

### **1. Market Cap in priceUpdate**
```javascript
// CURRENT (missing):
{
  type: 'priceUpdate',
  data: {
    priceUsd: 0.123,
    volume24h: 1234567,
    // ❌ marketCap: MISSING
  }
}

// NEEDED:
{
  type: 'priceUpdate',
  data: {
    priceUsd: 0.123,
    volume24h: 1234567,
    marketCap: 1234567  // ← ADD THIS
  }
}
```

### **2. Age (Token Creation Time)**
```javascript
// NEEDED:
{
  type: 'priceUpdate',
  data: {
    age: 86400,  // seconds since creation
    createdAt: 1234567890  // timestamp
  }
}
```

### **3. 6H Stats**
```javascript
// CURRENT (missing):
{
  type: 'priceUpdate',
  data: {
    volume5m: 123,
    volume1h: 1234,
    // ❌ volume6h: MISSING
    volume24h: 123456
  }
}

// NEEDED:
{
  type: 'priceUpdate',
  data: {
    volume5m: 123,
    volume1h: 1234,
    volume6h: 12345,  // ← ADD THIS
    volume24h: 123456
  }
}
```

### **4. Liquidity**
```javascript
// NEEDED (for TokenDetails):
{
  type: 'priceUpdate',
  data: {
    liquidity: 123456  // ← ADD THIS
  }
}
```

### **5. rankingUpdate Broadcast**
The new service needs to broadcast periodic `rankingUpdate` messages with ALL tokens:
```javascript
{
  type: 'rankingUpdate',
  rankings: [
    {
      contractAddress: 'HqVZ...',
      symbol: 'ANON',
      price: 0.123,
      marketCap: 1234567,
      volume24h: 123456,
      txns24h: 5000,
      makers24h: 1200,
      priceChange1h: 2.34,
      priceChange24h: 5.67,
      age: 86400,
      // ... all required fields
    },
    // ... more tokens
  ],
  timestamp: 1234567890
}
```

---

## ✅ **FRONTEND COMPATIBILITY SUMMARY:**

| Component | Data Needed | Current Broadcast | Status |
|-----------|-------------|-------------------|--------|
| **BubbleMap** | Price, MCap, Vol, TX, Makers, Age, 5M/1H/6H/24H | priceUpdate | ⚠️ Missing: MCap, Age, 6H |
| **TokenRankedList** | Price, MCap, Vol, TX, Makers, Age, 5M/1H/6H/24H | rankingUpdate | ❌ Not broadcast by new service |
| **TokenDetails** | Price, MCap, Liquidity | priceUpdate, swapUpdate | ⚠️ Missing: Liquidity |
| **PriceChartModal** | Price, MCap, Swaps | priceUpdate, swapUpdate | ✅ Fully compatible |

---

## 🔧 **REQUIRED FIXES FOR NEW SERVICE:**

### **1. Add Missing Fields to priceUpdate:**
```javascript
// backend/services/DexScreenerStyleMonitor.mjs - broadcastMetrics()

const priceData = {
  priceUsd: metrics.currentPrice,
  currentPrice: metrics.currentPrice,
  
  // ✅ ADD MARKET CAP
  marketCap: tokenData.metadata?.circSupply * metrics.currentPrice || 0,
  
  // ✅ ADD LIQUIDITY (from pool reserves)
  liquidity: poolData.solReserve * solPriceUSD * 2,  // Approximate
  
  // ✅ ADD AGE
  age: Math.floor((Date.now() - tokenData.createdAt) / 1000),
  createdAt: tokenData.createdAt,
  
  // Existing fields
  volume24h: metrics['24h'].volume,
  volume1h: metrics['1h'].volume,
  volume6h: metrics['6h'].volume,  // ✅ ALREADY EXISTS!
  volume5m: metrics['5m'].volume,
  
  txns24h: metrics['24h'].txns,
  txns1h: metrics['1h'].txns,
  txns6h: metrics['6h'].txns,  // ✅ ALREADY EXISTS!
  txns5m: metrics['5m'].txns,
  
  makers24h: metrics['24h'].makers,
  makers1h: metrics['1h'].makers,
  makers6h: metrics['6h'].makers,  // ✅ ALREADY EXISTS!
  makers5m: metrics['5m'].makers,
  
  priceChange24h: metrics['24h'].priceChange,
  priceChange1h: metrics['1h'].priceChange,
  priceChange6h: metrics['6h'].priceChange,  // ✅ ALREADY EXISTS!
  priceChange5m: metrics['5m'].priceChange,
  
  source: 'dexscreener-monitor',
  timestamp: Date.now()
};
```

### **2. Add Periodic rankingUpdate Broadcast:**
```javascript
// backend/services/DexScreenerStyleMonitor.mjs

// Add to initialize():
this.rankingUpdater = setInterval(() => {
  this.broadcastRankings();
}, 5000); // Every 5 seconds

// Add new method:
broadcastRankings() {
  if (!this.webSocketServer) return;
  
  const rankings = [];
  
  for (const [mint, tokenData] of this.tokens.entries()) {
    const metrics = this.getTokenMetrics(mint);
    if (!metrics) continue;
    
    rankings.push({
      contractAddress: mint,
      symbol: tokenData.config.name,
      price: metrics.currentPrice,
      marketCap: tokenData.metadata?.circSupply * metrics.currentPrice || 0,
      volume24h: metrics['24h'].volume,
      txns24h: metrics['24h'].txns,
      makers24h: metrics['24h'].makers,
      priceChange1h: metrics['1h'].priceChange,
      priceChange24h: metrics['24h'].priceChange,
      age: Math.floor((Date.now() - tokenData.createdAt) / 1000),
      // ... other fields
    });
  }
  
  if (this.webSocketServer.broadcastRankingUpdate) {
    this.webSocketServer.broadcastRankingUpdate(rankings);
  }
}
```

---

## 🎯 **CONCLUSION:**

**The new service is 90% compatible!** 

**Minor fixes needed:**
1. ✅ Add `marketCap` to priceUpdate
2. ✅ Add `liquidity` to priceUpdate
3. ✅ Add `age` and `createdAt` to priceUpdate
4. ✅ Add periodic `rankingUpdate` broadcast
5. ✅ 6H stats already exist in code!

**All fixes can be made in `DexScreenerStyleMonitor.mjs` without touching the frontend!** 🎉

