# ✅ Correct Backfill Architecture

## Responsibility Separation

### **Backend** (EnhancedHybridPriceService)
- ✅ Handles **LIVE swaps** via gRPC
- ✅ Monitors ALL pools in ONE shared stream
- ✅ Writes to: `backend/data/swaps_{token}.json`

### **Jupiter Service Backfill** (SwapBackfillWorker)
- ✅ Handles **HISTORICAL swaps** via JSON-RPC
- ✅ Fetches last 24h on startup
- ✅ Writes to: `backend/data/swaps_{token}.json` (SAME database)

### **No Duplication**
- ❌ Backfill does NOT do live monitoring
- ❌ Backend does NOT do historical backfill

## Complete Flow

```
1. Jupiter Service starts
   ↓
2. For each token:
   
   Historical Backfill (REST):
   ┌─────────────────────────────────────┐
   │ getSignaturesForAddress(pool)       │
   │ → Paginate backwards               │
   │ → getTransaction(sig)              │
   │ → Parse swaps                      │
   │ → Store to database                │
   └─────────────────────────────────────┘
   Result: 24h of historical data
   
3. Backend (ALWAYS running):
   ┌─────────────────────────────────────┐
   │ Shared gRPC stream                   │
   │ → Monitors ALL pools                │
   │ → Captures LIVE swaps               │
   │ → Stores to database                │
   └─────────────────────────────────────┘
   Result: Ongoing live data
   
4. User requests chart:
   ┌─────────────────────────────────────┐
   │ Reads: swaps_{token}.json           │
   │ Contains:                           │
   │   - Historical (from backfill)      │
   │   - Live (from backend)             │
   └─────────────────────────────────────┘
   Result: Complete chart with no gaps
```

## Why This Works

1. **Backend** handles live monitoring (already working, no changes)
2. **Backfill** only fetches historical data on startup (new)
3. Both write to **same database** files
4. **No conflicts** - historical data once, live data continuously
5. **No duplication** - each service has one clear role

## Updated Flow

```
Startup:
  1. Jupiter backfill runs
  2. Fetches last 24h for top 50 tokens
  3. Writes to database
  4. DONE (no live monitoring)

Always:
  1. Backend gRPC stream running
  2. Captures all new swaps
  3. Writes to database
   
Result:
  - Database has: 24h historical + live ongoing
  - Frontend gets complete chart
```

