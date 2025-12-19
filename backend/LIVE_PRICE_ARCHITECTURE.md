# 📡 Live Price Architecture - Complete Flow

## 🏗️ **SYSTEM ARCHITECTURE**

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         SOLANA BLOCKCHAIN                                │
│                         (Real-time swaps)                                │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
                                 │ gRPC Stream
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    BACKEND: EnhancedHybridPriceService                   │
│                                                                           │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ 1. gRPC Stream Listener                                          │  │
│  │    - Monitors multiple DEX programs (Raydium, Orca, etc.)        │  │
│  │    - Filters by pool addresses                                   │  │
│  │    - Detects swaps in real-time                                  │  │
│  └────────────────────────────┬─────────────────────────────────────┘  │
│                                │                                         │
│                                ▼                                         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ 2. processSwapUpdate()                                           │  │
│  │    - Extracts swap details (amount, price, type)                 │  │
│  │    - Calculates price impact                                     │  │
│  │    - Updates in-memory cache                                     │  │
│  └────────────────────────────┬─────────────────────────────────────┘  │
│                                │                                         │
│                                ▼                                         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ 3. saveSwapToDatabase()                                          │  │
│  │    - Persists to disk (data/charts/[TOKEN].json)                 │  │
│  │    - Atomic writes for data integrity                            │  │
│  └────────────────────────────┬─────────────────────────────────────┘  │
│                                │                                         │
│                                ▼                                         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ 4. broadcastSwapUpdate()                                         │  │
│  │    - Sends to WebSocket server                                   │  │
│  │    - Broadcasts to all connected clients                         │  │
│  └────────────────────────────┬─────────────────────────────────────┘  │
│                                │                                         │
└────────────────────────────────┼─────────────────────────────────────────┘
                                 │
                ┌────────────────┴────────────────┐
                │                                 │
                │ WebSocket                       │ HTTP Polling
                │ (Real-time)                     │ (Fallback)
                │                                 │
                ▼                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         FRONTEND: TokenDetail Modal                      │
│                                                                           │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ useHybridPrice Hook                                              │  │
│  │                                                                   │  │
│  │  ┌─────────────────────┐         ┌─────────────────────┐        │  │
│  │  │ WebSocket Listener  │         │ HTTP Polling        │        │  │
│  │  │ (Primary)           │         │ (Fallback)          │        │  │
│  │  │                     │         │                     │        │  │
│  │  │ - Instant updates   │         │ - Every 10 seconds  │        │  │
│  │  │ - Event-driven      │         │ - Smart polling     │        │  │
│  │  │ - No latency        │         │ - Only if no WS     │        │  │
│  │  └──────────┬──────────┘         └──────────┬──────────┘        │  │
│  │             │                               │                    │  │
│  │             └───────────┬───────────────────┘                    │  │
│  │                         │                                        │  │
│  │                         ▼                                        │  │
│  │              ┌─────────────────────┐                            │  │
│  │              │ setPriceData()      │                            │  │
│  │              │ setIsLive(true)     │                            │  │
│  │              └──────────┬──────────┘                            │  │
│  │                         │                                        │  │
│  └─────────────────────────┼────────────────────────────────────────┘  │
│                            │                                            │
│                            ▼                                            │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ UI Display                                                       │  │
│  │                                                                   │  │
│  │  💎 Market Cap          📈 Price           💧 Liquidity          │  │
│  │  $1.25M                 $0.00125           $123K                 │  │
│  │  📡 Live                📡 Live            📡 Live               │  │
│  │                                                                   │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                           │
└───────────────────────────────────────────────────────────────────────────┘
```

---

## 🔄 **DATA FLOW TIMELINE**

### **Scenario: User Opens TokenDetail Modal**

```
T+0ms    │ User clicks token
         │
T+10ms   │ TokenDetail component mounts
         │ useHybridPrice hook initializes
         │
T+20ms   │ ┌─ WebSocket connection established
         │ │  websocketService.connect()
         │ │  websocketService.subscribeToToken(tokenAddress)
         │ │
         │ └─ HTTP fetch initiated
         │    GET /api/tokens/[TOKEN]/hybrid-price
         │
T+150ms  │ HTTP response received
         │ setPriceData({ priceUsd: 0.00123, ... })
         │ setIsLive(true)
         │ UI displays: "$0.00123 📡 Live"
         │
T+200ms  │ WebSocket connected
         │ Listening for real-time updates...
         │
         │
         ⏱️  WAITING FOR SWAP...
         │
         │
T+5000ms │ 🔥 SWAP OCCURS ON SOLANA!
         │
T+5050ms │ gRPC stream detects swap
         │ processSwapUpdate() called
         │
T+5060ms │ Swap saved to database
         │ webSocketServer.broadcastSwapUpdate()
         │
T+5070ms │ WebSocket message received by frontend
         │ handlePriceUpdate() called
         │ setPriceData({ priceUsd: 0.00125, ... })
         │ UI updates: "$0.00125 📡 Live"
         │
         │ ✅ USER SEES NEW PRICE INSTANTLY!
         │
         │
T+15000ms│ HTTP polling interval (if WebSocket inactive)
         │ GET /api/tokens/[TOKEN]/hybrid-price
         │ (Skipped because WebSocket update was recent)
         │
         │
T+20000ms│ 🔥 ANOTHER SWAP OCCURS!
         │ Same flow repeats...
         │ UI updates instantly via WebSocket
```

---

## 🎯 **KEY COMPONENTS**

### **1. Backend: EnhancedHybridPriceService**
**File**: `backend/services/EnhancedHybridPriceService.mjs`

**Responsibilities**:
- Monitor gRPC stream for swaps
- Process swap data and calculate prices
- Persist swaps to disk
- Broadcast updates via WebSocket
- Serve HTTP API endpoints

**Key Methods**:
```javascript
startRealTimeMonitoring()     // Initialize gRPC stream
processSharedStreamUpdate()    // Parse gRPC transactions
processSwapForToken()          // Extract swap details
processSwapUpdate()            // Update cache & broadcast
saveSwapToDatabase()           // Persist to disk
getRealTimePrice()             // Serve HTTP API
```

---

### **2. Frontend: useHybridPrice Hook**
**File**: `frontend/src/hooks/useHybridPrice.js`

**Responsibilities**:
- Subscribe to WebSocket for real-time updates
- Fallback to HTTP polling
- Manage connection lifecycle
- Format price data for display

**Key Features**:
```javascript
// WebSocket subscription
websocketService.subscribeToToken(tokenAddress)
websocketService.on('priceUpdate', handlePriceUpdate)

// HTTP polling fallback
setInterval(() => fetchPriceData(), 10000)

// Smart polling: only if no WebSocket updates
if (timeSinceLastWebSocketUpdate > pollingInterval) {
    fetchPriceData()
}
```

---

### **3. Frontend: TokenDetail Modal**
**File**: `frontend/src/components/TokenDetails.js`

**Responsibilities**:
- Display token information
- Show live price updates
- Render "📡 Live" indicator

**Key Code**:
```javascript
const { 
    priceData,      // Current price data
    isLive,         // Is receiving live updates?
    formatPrice,    // Format for display
    getPriceUsd     // Get current price
} = useHybridPrice(token?.contractAddress)

// Display
{formatPrice(getPriceUsd())}
{isLive && <div>📡 Live</div>}
```

---

## 🚀 **PERFORMANCE CHARACTERISTICS**

### **Latency**:
- **WebSocket**: ~50-100ms from swap to UI update
- **HTTP Polling**: Up to 10 seconds delay
- **Combined**: Best of both worlds

### **Efficiency**:
- **WebSocket**: Zero overhead when idle, instant updates on activity
- **HTTP Polling**: Only polls if WebSocket inactive
- **Smart Polling**: Skips polls if recent WebSocket update

### **Reliability**:
- **Primary**: WebSocket (instant, real-time)
- **Fallback**: HTTP polling (reliable, always works)
- **Ultimate Fallback**: Jupiter API data from cache

---

## 🔍 **DEBUGGING**

### **Check WebSocket Connection**:
```javascript
// Browser console
websocketService.isConnected  // true/false
websocketService.getStats()   // Connection stats
```

### **Check Price Updates**:
```javascript
// Browser console (when modal is open)
📈 [useHybridPrice] WebSocket price update received: {
  priceUsd: 0.00125,
  marketCap: 1250000,
  liquidity: 123456,
  timestamp: 1234567890000
}
```

### **Check Backend Broadcasts**:
```javascript
// Backend logs
📡 [EnhancedHybridPriceService] Broadcasting swap via WebSocket for [TOKEN]
🔄 [WebSocketServer] Broadcasting swap update to 3 clients
```

### **Check HTTP Polling**:
```javascript
// Network tab
GET /api/tokens/[TOKEN]/hybrid-price
Status: 200 OK
Response: {
  "success": true,
  "data": {
    "priceUsd": 0.00125,
    "source": "grpc_realtime",
    "timestamp": 1234567890000
  }
}
```

---

## ✅ **ADVANTAGES OF THIS ARCHITECTURE**

1. **Real-time**: WebSocket provides instant updates
2. **Reliable**: HTTP polling ensures updates even if WebSocket fails
3. **Efficient**: Smart polling reduces unnecessary API calls
4. **Scalable**: Single gRPC stream monitors multiple tokens
5. **Persistent**: Swaps saved to disk for historical data
6. **User-friendly**: "📡 Live" indicator shows connection status

---

## 🎯 **SUMMARY**

**Live prices in TokenDetail modal work via:**

1. **Backend** monitors Solana swaps via gRPC stream
2. **Backend** broadcasts updates via WebSocket
3. **Frontend** subscribes to WebSocket for instant updates
4. **Frontend** falls back to HTTP polling if needed
5. **UI** displays prices with "📡 Live" indicator

**Result**: Users see real-time price updates with ~50-100ms latency! 🚀



