# 🔄 Architecture Cutover Plan - Preventing Chaos

## 🚨 THE PROBLEM

When we enable the **NEW** DexScreener monitor, the **OLD** service will ALSO run, causing:

### ⚠️ **CONFLICTS:**
1. **Duplicate gRPC Streams** - Both services connect to Constant K gRPC
2. **Duplicate ChartDatabase Writers** - Both write to same files (race conditions!)
3. **Duplicate WebSocket Broadcasts** - Frontend receives double messages
4. **Duplicate Jupiter API Calls** - Hitting rate limits
5. **Memory Waste** - Two services tracking same tokens
6. **Confusing Logs** - Can't tell which service is doing what

---

## ✅ THE SOLUTION: Clean Cutover Logic

### **Current Implementation (BROKEN):**

```javascript
// backend/services/RealTimeTokenMonitor.mjs

if (USE_DEXSCREENER_MONITOR) {
    // Initialize NEW service
    this.hybridPriceService = new DexScreenerStyleMonitor(...);
} else {
    // Initialize OLD service
    this.hybridPriceService = new EnhancedHybridPriceService(...);
}
```

**✅ THIS PART IS GOOD!** Only ONE service is initialized.

---

## 🔍 WHAT WE NEED TO CHECK:

### **1. Is the OLD service auto-starting elsewhere?**

Let me check if `EnhancedHybridPriceService` is instantiated in other files:

**Files to Check:**
- ✅ `backend/enhancedBackend.mjs` - Main entry point
- ✅ `backend/server.js` - Alternative entry point
- ✅ `backend/services/*.js` - Other services

---

## 🛡️ SAFEGUARDS NEEDED:

### **A. Ensure Single Initialization Point**

**Rule:** Only `RealTimeTokenMonitor` should create the price service.

```javascript
// ❌ BAD - Multiple places creating services
// backend/enhancedBackend.mjs
const priceService = new EnhancedHybridPriceService();

// backend/services/SomeOtherService.js
const priceService = new EnhancedHybridPriceService();

// ✅ GOOD - Single source of truth
// backend/services/RealTimeTokenMonitor.mjs
this.hybridPriceService = USE_FLAG ? new DexScreener() : new EnhancedHybrid();
```

---

### **B. Add Singleton Protection**

Prevent accidental double initialization:

```javascript
// backend/services/EnhancedHybridPriceService.mjs

class EnhancedHybridPriceService extends EventEmitter {
  static instance = null;
  
  constructor(webSocketServer = null) {
    super();
    
    // 🛡️ SINGLETON PROTECTION
    if (EnhancedHybridPriceService.instance) {
      throw new Error('❌ EnhancedHybridPriceService already initialized! Use feature flag to switch.');
    }
    EnhancedHybridPriceService.instance = this;
    
    // ... rest of constructor
  }
  
  async shutdown() {
    // ... cleanup code
    EnhancedHybridPriceService.instance = null; // Reset singleton
  }
}
```

---

### **C. Add ChartDatabase Singleton Protection**

Prevent duplicate batch writers:

```javascript
// backend/services/ChartDatabase.js

class ChartDatabase {
  static batchWriterActive = false;
  
  startBatchWriter() {
    if (ChartDatabase.batchWriterActive) {
      throw new Error('❌ ChartDatabase batch writer already running!');
    }
    
    ChartDatabase.batchWriterActive = true;
    
    this.batchWriterInterval = setInterval(() => {
      this.flushBatch();
    }, this.batchInterval);
  }
  
  stopBatchWriter() {
    if (this.batchWriterInterval) {
      clearInterval(this.batchWriterInterval);
      ChartDatabase.batchWriterActive = false;
    }
  }
}
```

---

### **D. Add gRPC Client Singleton Protection**

Prevent duplicate streams:

```javascript
// backend/services/DexScreenerStyleMonitor.mjs
// backend/services/EnhancedHybridPriceService.mjs

// Add a global registry
const GRPC_CLIENTS = new Map(); // endpoint -> client

async initialize() {
  const clientKey = `${GRPC_ENDPOINT}:${GRPC_TOKEN}`;
  
  if (GRPC_CLIENTS.has(clientKey)) {
    throw new Error('❌ gRPC client already connected! Only one service can connect at a time.');
  }
  
  this.grpcClient = new Client(GRPC_ENDPOINT, GRPC_TOKEN);
  GRPC_CLIENTS.set(clientKey, this.grpcClient);
  
  // ... rest of initialization
}

async close() {
  const clientKey = `${GRPC_ENDPOINT}:${GRPC_TOKEN}`;
  GRPC_CLIENTS.delete(clientKey);
  
  // ... rest of cleanup
}
```

---

## 🧪 TESTING THE CUTOVER:

### **Step 1: Verify Current State (Flag OFF)**

```bash
# Check logs for OLD service
pm2 logs backend | grep "EnhancedHybridPriceService"

# Should see:
# ✅ "Using OLD EnhancedHybridPriceService"
# ✅ "gRPC client initialized"
# ✅ "DEX stream started"
```

---

### **Step 2: Enable New Service (Flag ON)**

```bash
# Set environment variable
export USE_DEXSCREENER_MONITOR=true

# Restart backend
pm2 restart backend

# Check logs for NEW service
pm2 logs backend | grep "DexScreenerStyleMonitor"

# Should see:
# ✅ "Using NEW DexScreenerStyleMonitor"
# ✅ "gRPC client initialized"
# ✅ "Pool subscriptions started"

# Should NOT see:
# ❌ "Using OLD EnhancedHybridPriceService"
```

---

### **Step 3: Verify No Duplicates**

```bash
# Check for duplicate gRPC connections
pm2 logs backend | grep "gRPC client initialized" | wc -l
# Should output: 1 (not 2!)

# Check for duplicate batch writers
pm2 logs backend | grep "Persistent swap storage initialized" | wc -l
# Should output: 1 (not 2!)

# Check WebSocket broadcasts
pm2 logs backend | grep "Broadcasted" | head -20
# Should see ONLY one type of broadcast (not mixed)
```

---

## 🎯 IMPLEMENTATION CHECKLIST:

### **Phase 1: Add Safeguards (Do This Now)**
- [ ] Add singleton protection to `EnhancedHybridPriceService`
- [ ] Add singleton protection to `DexScreenerStyleMonitor`
- [ ] Add batch writer protection to `ChartDatabase`
- [ ] Add gRPC client registry
- [ ] Verify no other files instantiate services directly

### **Phase 2: Test Locally**
- [ ] Test with flag OFF (old service)
- [ ] Test with flag ON (new service)
- [ ] Test switching between flags (restart required)
- [ ] Verify no duplicate resources

### **Phase 3: Deploy to Production**
- [ ] Deploy with flag OFF first (no changes)
- [ ] Monitor for 24 hours
- [ ] Enable flag ON
- [ ] Monitor for issues
- [ ] Rollback plan ready (set flag OFF)

### **Phase 4: Cleanup (After 1 Week)**
- [ ] Remove old `EnhancedHybridPriceService.mjs`
- [ ] Remove feature flag logic
- [ ] Update documentation
- [ ] Celebrate! 🎉

---

## 🚨 ROLLBACK PLAN:

If new service has issues:

```bash
# 1. Set flag OFF
export USE_DEXSCREENER_MONITOR=false

# 2. Restart backend
pm2 restart backend

# 3. Verify old service is running
pm2 logs backend | grep "Using OLD"

# Done! Back to stable state.
```

---

## 📊 MONITORING METRICS:

### **What to Watch:**

| Metric | Old Service | New Service | Alert If |
|--------|-------------|-------------|----------|
| gRPC Connections | 1 | 1 | > 1 |
| Batch Writers | 1 | 1 | > 1 |
| Memory Usage | ~500MB | ~400MB | > 1GB |
| Swap Detection Rate | ~70% | ~100% | < 90% |
| WebSocket Clients | Same | Same | Drops |
| Jupiter API Calls | ~100/min | ~50/min | > 200/min |

---

## 🎯 NEXT STEPS:

1. **Review this plan** - Does it make sense?
2. **Add safeguards** - Implement singleton protections
3. **Test locally** - Verify clean cutover
4. **Deploy carefully** - Flag OFF → Flag ON
5. **Monitor closely** - Watch for duplicates
6. **Cleanup later** - Remove old code after 1 week

---

## 💡 KEY INSIGHT:

**The feature flag IS working correctly!** 

The issue is we need to add **safeguards** to prevent accidental double initialization and make monitoring easier.

---

**Ready to implement the safeguards?** 🛡️

