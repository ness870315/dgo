# Swap Backfill Worker

## Overview

This worker backfills historical swap data for tokens using **Constant K gRPC** and stores it in the **same ChartDatabase** that the backend uses for live swaps.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Shared Database                          │
│                   data/charts-{token}.json                  │
└─────────────────────────────────────────────────────────────┘
                            ▲                    ▲
                            │                    │
                ┌───────────┘                    └───────────┐
                │                                          │
                │                                          │
    ┌───────────▼──────────┐                ┌─────────────▼──────────┐
    │   Backend            │                │  Jupiter Service       │
    │   (Live Swaps)      │                │  (Backfills)           │
    │                      │                │                        │
    │  - gRPC streams     │                │  - Constant K gRPC    │
    │  - Real-time        │                │  - Historical slots   │
    │  - source:          │                │  - source:            │
    │    'grpc_realtime'  │                │    'constantk_backfill'│
    └──────────────────────┘                └────────────────────────┘
```

## Key Points

1. **Same Database**: Both services write to `data/charts-{token}.json`
2. **Same gRPC Source**: Both use Constant K gRPC (not Helius)
3. **No Duplicates**: Swaps deduplicated by signature
4. **Automatic Merge**: Frontend reads from the same file, gets both live + historical
5. **Source Tracking**: Each swap tagged with its source (`grpc_realtime` vs `constantk_backfill`)

## Usage

### Test USELESS Token

```bash
cd jupiter-service/services/swap-backfill
node test-useless-backfill.js
```

This will:
1. Load existing swaps from the database
2. Discover USELESS pool address
3. Fetch historical swaps from Constant K gRPC (past slots)
4. Store them in the shared database
5. Show stats before/after

### API Integration

The worker is already integrated into jupiter-service:

```javascript
// Endpoint: /api/swap-backfill/backfill/:tokenAddress
POST http://localhost:3001/api/swap-backfill/backfill/Dz9mQ9NzkBcCsuGPFJ3r1bS4wgqKMHBPiVuniW8Mbonk
```

## Database Structure

Swaps are stored per-token in `data/charts-{tokenAddress}.json`:

```json
{
  "swaps": [
    {
      "signature": "abc123...",
      "timestamp": 1234567890,
      "poolAddress": "pool123...",
      "price": 0.001,
      "volumeUsd": 100.50,
      "source": "grpc_realtime",  // or "constantk_backfill"
      "type": "BUY",
      "tokenAddress": "token456...",
      "rawData": { ... }
    }
  ]
}
```

## Benefits

✅ **No overload**: Backfills run in jupiter-service, not backend
✅ **Same infrastructure**: Both use Constant K gRPC (consistent data source)
✅ **Automatic merge**: Both services write to the same files
✅ **No duplicates**: Signatures prevent duplicate storage
✅ **Unified timeline**: Frontend gets seamless live + historical data
✅ **Scalable**: Can run backfills for 200+ tokens without impacting real-time monitoring

## Implementation Status

- ✅ API endpoints created in jupiter-service
- ✅ Constant K gRPC integration initialized
- ✅ ChartDatabase copied and configured
- ⏳ Historical slot query implementation (TODO: need to implement `fetchConstantKHistoricalSwaps`)
- ✅ Automatic merge with live swaps (just use same database!)
