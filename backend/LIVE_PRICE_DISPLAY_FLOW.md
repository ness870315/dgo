# 📡 Live Price Display in TokenDetail Modal

## 🎯 **COMPLETE FLOW:**

### **1. TokenDetail Modal Opens**
```javascript
// frontend/src/components/TokenDetails.js (Line 36-51)

const TokenDetails = ({ token, onClose }) => {
    // ✅ USES useHybridPrice HOOK
    const { 
        priceData,           // ← Real-time price data
        isLoading,
        error,
        isLive,              // ← Shows "📡 Live" indicator
        formatPrice,         // ← Formats price for display
        getPriceUsd,         // ← Gets current price
        getMarketCap,        // ← Gets market cap
        getLiquidity         // ← Gets liquidity
    } = useHybridPrice(token?.contractAddress);
    
    // ... rest of component
};
```

### **2. useHybridPrice Hook Initializes**
```javascript
// frontend/src/hooks/useHybridPrice.js

export const useHybridPrice = (tokenAddress) => {
    const [priceData, setPriceData] = useState(null);
    const [isLive, setIsLive] = useState(false);
    
    // ✅ TWO METHODS FOR LIVE UPDATES:
    // 1. WebSocket (real-time)
    // 2. HTTP Polling (fallback)
};
```

---

## 🔄 **METHOD 1: WebSocket (Real-Time)**

### **A. WebSocket Connection Setup**
```javascript
// Line 22-89: useEffect for WebSocket

useEffect(() => {
    // ✅ Connect to WebSocket
    if (!websocketService.isConnected) {
        websocketService.connect();
    }
    
    // ✅ Subscribe to token updates
    websocketService.subscribeToToken(tokenAddress);
    
    // ✅ Listen for price updates
    const handlePriceUpdate = (data) => {
        if (data.tokenAddress === tokenAddress) {
            console.log('📈 [useHybridPrice] WebSocket price update received:', data.priceData);
            setPriceData(data.priceData);  // ← UPDATE PRICE!
            setIsLive(true);               // ← Show "Live" indicator
        }
    };
    
    websocketService.on('priceUpdate', handlePriceUpdate);
    
    return () => {
        websocketService.unsubscribeFromToken(tokenAddress);
        websocketService.off('priceUpdate', handlePriceUpdate);
    };
}, [tokenAddress]);
```

### **B. Backend WebSocket Broadcasts**
```javascript
// backend/services/EnhancedHybridPriceService.mjs (Line 1123-1132)

processSwapUpdate(tokenAddress, ...) {
    // ... process swap ...
    
    // ✅ Broadcast via WebSocket
    if (this.webSocketServer) {
        console.log(`📡 [EnhancedHybridPriceService] Broadcasting swap via WebSocket for ${tokenAddress}`);
        this.webSocketServer.broadcastSwapUpdate(tokenAddress, {
            swap: swapRecord,
            totalSwaps: currentSwaps.length,
            timestamp: Date.now()
        });
    }
    
    // ✅ Emit price update event
    this.emit('swapDetected', {
        tokenAddress,
        poolAddress,
        swapType,
        change,
        slot,
        timestamp: Date.now()
    });
}
```

### **C. WebSocket Message Flow**
```
gRPC Stream detects swap
  ↓
processSwapUpdate() processes it
  ↓
webSocketServer.broadcastSwapUpdate()
  ↓
WebSocket sends to all connected clients
  ↓
Frontend websocketService receives message
  ↓
Emits 'priceUpdate' event
  ↓
useHybridPrice hook receives update
  ↓
setPriceData() updates state
  ↓
TokenDetail re-renders with new price
  ↓
User sees updated price instantly! 📡
```

---

## 🔁 **METHOD 2: HTTP Polling (Fallback)**

### **A. Initial Fetch + Polling**
```javascript
// Line 144-182: useEffect for polling

useEffect(() => {
    // ✅ Fetch immediately when modal opens
    fetchPriceData();
    
    // ✅ Set up polling (every 10 seconds by default)
    const shouldPoll = !enableWebSocket || !isWebSocketConnected;
    
    if (shouldPoll) {
        intervalRef.current = setInterval(() => {
            // Only poll if no recent WebSocket update
            const timeSinceLastWebSocketUpdate = Date.now() - lastWebSocketUpdateRef.current;
            
            if (timeSinceLastWebSocketUpdate > pollingInterval) {
                fetchPriceData();  // ← Fetch new price
            }
        }, pollingInterval);  // Default: 10 seconds
    }
    
    return () => clearInterval(intervalRef.current);
}, [tokenAddress]);
```

### **B. Fetch Price Data**
```javascript
// Line 106-141: fetchPriceData()

const fetchPriceData = async () => {
    try {
        // ✅ Call hybrid-price endpoint
        const response = await axios.get(`${API_BASE}/api/tokens/${tokenAddress}/hybrid-price`, {
            timeout: 15000,
            headers: {
                'X-Connection-ID': connectionIdRef.current
            }
        });
        
        if (response.data.success) {
            setPriceData(response.data.data);  // ← UPDATE PRICE!
            setIsLive(true);                   // ← Show "Live" indicator
        }
    } catch (err) {
        console.error('Error fetching hybrid price data:', err.message);
        setError(err.message);
        setIsLive(false);
    }
};
```

### **C. Backend Hybrid Price Endpoint**
```javascript
// backend/enhancedBackend.mjs: /api/tokens/:address/hybrid-price

this.app.get('/api/tokens/:contract/hybrid-price', async (req, res) => {
    const { contract } = req.params;
    
    // ✅ Get price from EnhancedHybridPriceService
    const priceData = await this.enhancedHybridPriceService.getRealTimePrice(contract);
    
    res.json({
        success: true,
        data: {
            priceUsd: priceData.price,
            marketCap: priceData.marketCap,
            liquidity: priceData.liquidity,
            volume24h: priceData.volume24h,
            priceChange24h: priceData.priceChange24h,
            source: 'grpc_realtime',
            timestamp: Date.now()
        }
    });
});
```

---

## 🎨 **Display in TokenDetail Modal**

### **Price Display**
```javascript
// frontend/src/components/TokenDetails.js (Line 1117-1127)

<div className="flex flex-col items-center justify-center p-4">
    <span className="text-green-200 text-sm mb-1">📈 Price</span>
    
    {/* ✅ DISPLAYS LIVE PRICE */}
    <span className="text-white font-bold text-base text-center">
        {formatPrice(getPriceUsd() || token?.jupiterData?.usdPrice || token?.price)}
    </span>
    
    {/* ✅ SHOWS "LIVE" INDICATOR */}
    {isLive && priceData && (
        <div className="text-xs text-green-400 mt-1">
            📡 Live
        </div>
    )}
</div>
```

### **Market Cap Display**
```javascript
// Line 1093-1105

<div className="flex flex-col items-center justify-center p-4">
    <span className="text-blue-200 text-sm mb-1">💎 Market Cap</span>
    
    {/* ✅ DISPLAYS LIVE MARKET CAP */}
    <span className="text-white font-bold text-base text-center">
        {formatMarketCap(getMarketCap() || token?.jupiterData?.mcap || token?.marketCap)}
    </span>
    
    {/* ✅ SHOWS "LIVE" INDICATOR */}
    {isLive && (
        <div className="text-xs text-green-400 mt-1">
            📡 Live
        </div>
    )}
</div>
```

---

## 🔄 **Smart Update Strategy**

### **Priority System:**
1. **WebSocket (Preferred)**: Instant updates when swaps occur
2. **HTTP Polling (Fallback)**: Updates every 10 seconds if WebSocket unavailable
3. **Smart Polling**: Only polls if no WebSocket update in last 20 seconds

### **Code:**
```javascript
// Line 160-173

const shouldPoll = !enableWebSocket || !isWebSocketConnected || 
                  (lastWebSocketUpdateRef.current && 
                   Date.now() - lastWebSocketUpdateRef.current > pollingInterval * 2);

if (shouldPoll) {
    intervalRef.current = setInterval(() => {
        const timeSinceLastWebSocketUpdate = Date.now() - lastWebSocketUpdateRef.current;
        
        // Only poll if no recent WebSocket update
        if (timeSinceLastWebSocketUpdate > pollingInterval) {
            fetchPriceData();
        }
    }, pollingInterval);
}
```

---

## ✅ **VERIFICATION:**

### **Check Browser Console:**
```javascript
// When modal opens:
🔌 [useHybridPrice] WebSocket connected
📈 [useHybridPrice] WebSocket price update received: { priceUsd: 0.00123, ... }

// When swap occurs:
📈 [useHybridPrice] WebSocket price update received: { priceUsd: 0.00125, ... }
```

### **Check Network Tab:**
```
// Initial fetch:
GET /api/tokens/[TOKEN]/hybrid-price
Response: {
  "success": true,
  "data": {
    "priceUsd": 0.00123,
    "marketCap": 1234567,
    "liquidity": 123456,
    "source": "grpc_realtime",
    "timestamp": 1234567890000
  }
}

// WebSocket messages:
{
  "type": "priceUpdate",
  "tokenAddress": "[TOKEN]",
  "priceData": {
    "priceUsd": 0.00125,
    "marketCap": 1250000,
    ...
  }
}
```

### **Check UI:**
```
💎 Market Cap
$1.25M
📡 Live  ← Shows when receiving updates

📈 Price
$0.00125
📡 Live  ← Shows when receiving updates
```

---

## 🎯 **SUMMARY:**

**Live prices in TokenDetail modal are displayed via:**

1. **useHybridPrice Hook**:
   - Subscribes to WebSocket for real-time updates
   - Falls back to HTTP polling (10s interval)
   - Smart polling: only polls if no WebSocket updates

2. **Data Sources**:
   - **Primary**: WebSocket broadcasts from gRPC swap detection
   - **Fallback**: HTTP polling to `/hybrid-price` endpoint
   - **Ultimate Fallback**: Jupiter API data from token cache

3. **Update Triggers**:
   - **Real-time**: Every swap detected by gRPC stream
   - **Polling**: Every 10 seconds (if WebSocket inactive)
   - **Manual**: User can refresh

4. **Display**:
   - Shows current price with "📡 Live" indicator
   - Updates instantly when swaps occur
   - Formats price based on magnitude ($0.000001 vs $1.23)

**Result**: Users see live, real-time price updates in the TokenDetail modal, updated instantly when swaps occur! 🚀



