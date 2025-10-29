# Active Token Filtering Strategy

## Goal: Monitor Only Most Active Tokens (DexScreener-Style with Limited Resources)

## Strategy Overview

1. **Monitor ALL pools via program-based filtering** (like DexScreener)
2. **Track swap activity per token** in real-time
3. **Only maintain detailed monitoring for top N active tokens**
4. **Auto-remove inactive/rugged tokens** from detailed tracking

## Implementation Phases

### Phase 1: Passive Discovery (Low Resource)
Monitor all swaps to build activity map:
```javascript
// Track all swaps, but don't maintain full state
activityMap = {
    tokenAddress: {
        swapCount24h: 150,
        lastSwap: timestamp,
        totalVolume24h: 50000,
        poolAddress: '...'
    }
}
```

### Phase 2: Active Monitoring (Selected Tokens)
Only maintain full state for top tokens:
```javascript
// Full monitoring (price updates, swap history, etc.)
activeTokens = top200(activityMap, by='swapCount24h');

// Passive tracking (just count swaps)
passiveTokens = allOther tokens;
```

### Phase 3: Auto-Cleanup
Remove tokens that become inactive:
```javascript
// Every hour: remove tokens with < 10 swaps/24h
inactiveTokens = tokens.filter(t => t.swapCount24h < 10);
removeFromActiveMonitoring(inactiveTokens);
```

## Activity Scoring Algorithm

```javascript
function calculateActivityScore(token) {
    // Weighted score based on multiple factors
    const swapCount24h = token.swapCount24h || 0;
    const volume24h = token.volume24h || 0;
    const uniqueTraders24h = token.uniqueTraders || 0;
    const marketCap = token.marketCap || 0;
    const score = token.overallScore || 5.0;
    
    // Activity score (0-100)
    const activityScore = 
        (Math.min(swapCount24h / 100, 1) * 40) +      // Max 40 points
        (Math.min(volume24h / 100000, 1) * 30) +      // Max 30 points (100k volume)
        (Math.min(uniqueTraders24h / 50, 1) * 20) +   // Max 20 points
        (Math.min(score / 10, 1) * 10);               // Max 10 points
    
    return activityScore;
}

// Select top 200 most active tokens
activeTokens = tokens.sort((a, b) => 
    calculateActivityScore(b) - calculateActivityScore(a)
).slice(0, 200);
```

## Resource Allocation

### Current (200 manually tracked tokens)
- 200 gRPC filters
- Full state for all 200
- ~2-4GB memory

### Proposed (ALL pools discovered, 200 active monitored)
- **1 gRPC filter** (program-based) ✅
- **Passive tracking** for ALL discovered pools (~1000s) - minimal memory
- **Full state** for top 200 active tokens
- ~3-5GB memory (slightly higher due to discovery)

## Token Lifecycle

```
New Swap Detected
       ↓
Pool discovered → Add to passive tracking
       ↓
Track swap count, volume, traders
       ↓
Calculate activity score
       ↓
If score > threshold AND top 200:
    → Add to active monitoring
    → Full price tracking, swap history, etc.
       ↓
Every hour: Re-rank tokens
       ↓
If score drops OR rugged:
    → Remove from active
    → Keep in passive (for 24h grace period)
```

## Active Token Criteria

A token qualifies for active monitoring if:
1. **Swap activity**: > 50 swaps/24h OR
2. **Volume**: > $10,000/24h OR
3. **Unique traders**: > 20 unique traders/24h OR
4. **Score**: Overall score > 7.0

AND ranks in **top 200** by activity score.

## Cleanup Rules

Remove from active monitoring if:
1. **Swap activity**: < 10 swaps/24h for 3 consecutive hours
2. **Volume**: < $1,000/24h for 3 consecutive hours
3. **Rugged**: Price drop > 90% in 1 hour
4. **No activity**: Zero swaps for 24 hours

## Implementation Plan

### Step 1: Test PoC (Current)
- Monitor Raydium program for 60s
- Measure: swaps/sec, pools discovered
- Validate approach works

### Step 2: Implement Activity Tracking
```javascript
class ActivityTracker {
    constructor() {
        this.activityMap = new Map(); // tokenAddress -> activity data
        this.activeTokens = new Set(); // tokens with full monitoring
        this.maxActiveTokens = 200;
    }
    
    onSwap(swap) {
        // Update activity for both tokens
        this.updateActivity(swap.tokenA, swap);
        this.updateActivity(swap.tokenB, swap);
        
        // Check if should promote to active
        this.checkPromotion(swap.tokenA);
        this.checkPromotion(swap.tokenB);
    }
    
    updateActivity(tokenAddress, swap) {
        const activity = this.activityMap.get(tokenAddress) || {
            swapCount24h: 0,
            volume24h: 0,
            lastSwap: 0,
            traders: new Set()
        };
        
        activity.swapCount24h++;
        activity.volume24h += swap.volumeUsd || 0;
        activity.lastSwap = Date.now();
        activity.traders.add(swap.maker);
        
        this.activityMap.set(tokenAddress, activity);
    }
    
    checkPromotion(tokenAddress) {
        if (this.activeTokens.has(tokenAddress)) return;
        
        const activity = this.activityMap.get(tokenAddress);
        const score = this.calculateScore(activity);
        
        if (score > this.getCurrentThreshold()) {
            this.promoteToActive(tokenAddress);
        }
    }
    
    promoteToActive(tokenAddress) {
        // Only if we have room or can demote someone
        if (this.activeTokens.size < this.maxActiveTokens) {
            this.activeTokens.add(tokenAddress);
            this.startFullMonitoring(tokenAddress);
        } else {
            // Replace lowest scoring active token
            const lowest = this.findLowestActiveToken();
            this.demoteFromActive(lowest);
            this.activeTokens.add(tokenAddress);
            this.startFullMonitoring(tokenAddress);
        }
    }
}
```

### Step 3: Integration with Current System
- Keep existing `loadTopTokens()` for initial 200
- Add activity-based re-ranking every hour
- Remove inactive tokens automatically

## Expected Performance

| Metric | Before | After |
|--------|--------|-------|
| Streams | 200 | 1 ✅ |
| Pools discovered | 200 (manual) | ALL (auto) ✅ |
| Active monitored | 200 | 200 (top active) |
| Passive tracked | 0 | 1000s ✅ |
| Memory | 2-4GB | 3-5GB |
| CPU | 40-60% | 30-40% ✅ |

## Benefits

✅ **Discover all pools** automatically (like DexScreener)
✅ **Monitor top active tokens** (resource-efficient)
✅ **Auto-cleanup** inactive/rugged tokens
✅ **Scalable** - handles growth automatically
✅ **Resource-efficient** - full state only for active tokens






