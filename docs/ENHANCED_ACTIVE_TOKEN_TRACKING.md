# Enhanced Active Token Tracking (DexScreener-Style)

## Implementation Plan Based on Recommendations

### Phase 1: Add Sliding Window Aggregation (Week 1)

```javascript
class ActivityTracker {
    constructor() {
        // Sliding windows: 1min, 5min, 1h, 24h
        this.windows = {
            '1m': 60,
            '5m': 300,
            '1h': 3600,
            '24h': 86400
        };
        
        // Per-token activity windows
        this.tokenWindows = new Map(); // tokenAddress -> { '1m': [...], '5m': [...] }
    }
    
    addSwap(tokenAddress, volumeUsd, timestamp) {
        const tokenData = this.tokenWindows.get(tokenAddress) || {};
        
        // Add to each window
        for (const [windowName, windowSec] of Object.entries(this.windows)) {
            if (!tokenData[windowName]) tokenData[windowName] = [];
            
            tokenData[windowName].push({ volumeUsd, timestamp });
            
            // Remove old entries outside window
            const cutoff = timestamp - (windowSec * 1000);
            tokenData[windowName] = tokenData[windowName].filter(e => e.timestamp > cutoff);
        }
        
        this.tokenWindows.set(tokenAddress, tokenData);
    }
    
    getActivity(tokenAddress, window = '1h') {
        const windows = this.tokenWindows.get(tokenAddress);
        if (!windows || !windows[window]) return null;
        
        const entries = windows[window];
        const volume = entries.reduce((sum, e) => sum + e.volumeUsd, 0);
        const swaps = entries.length;
        const avgVolume = swaps > 0 ? volume / swaps : 0;
        
        return { volume, swaps, avgVolume, entries };
    }
    
    calculateActivityScore(tokenAddress) {
        const activity1h = this.getActivity(tokenAddress, '1h');
        const activity5m = this.getActivity(tokenAddress, '5m');
        
        if (!activity1h || activity1h.swaps === 0) return 0;
        
        // Score = (volume * 0.5) + (swaps * 0.3) + (velocity * 0.2)
        const volumeScore = Math.min(activity1h.volume / 100000, 1) * 50; // Max 50 points
        const swapsScore = Math.min(activity1h.swaps / 100, 1) * 30; // Max 30 points
        const velocityScore = activity5m ? Math.min(activity5m.swaps / 10, 1) * 20 : 0; // Max 20 points
        
        return volumeScore + swapsScore + velocityScore;
    }
}
```

### Phase 2: Redis Integration (Week 2)

```javascript
// Use Redis sorted sets for time-based aggregation
class RedisActivityTracker {
    constructor(redis) {
        this.redis = redis;
    }
    
    async addSwap(tokenAddress, volumeUsd, timestamp) {
        const now = Math.floor(timestamp / 1000);
        
        // Add to sliding windows (using sorted sets with timestamp as score)
        for (const [windowName, windowSec] of Object.entries(this.windows)) {
            const key = `activity:${tokenAddress}:${windowName}`;
            
            // Add entry with timestamp as score
            await this.redis.zadd(key, now, JSON.stringify({ volumeUsd, timestamp }));
            
            // Remove old entries
            const cutoff = now - windowSec;
            await this.redis.zremrangebyscore(key, 0, cutoff);
            
            // Set TTL
            await this.redis.expire(key, windowSec + 60);
        }
        
        // Update recent activity index
        await this.redis.zadd('tokens:recent', now, tokenAddress);
        await this.redis.expire('tokens:recent', 86400); // 24h
    }
    
    async getTopTokens(limit = 200, window = '1h') {
        // Get all recent tokens
        const now = Math.floor(Date.now() / 1000);
        const cutoff = now - (4 * 3600); // 4 hours
        const recentTokens = await this.redis.zrangebyscore('tokens:recent', cutoff, '+inf');
        
        // Calculate scores for each
        const scores = [];
        for (const tokenAddress of recentTokens) {
            const activity = await this.getActivity(tokenAddress, window);
            if (activity && activity.swaps > 0) {
                scores.push({
                    tokenAddress,
                    score: this.calculateActivityScore(activity),
                    volume: activity.volume,
                    swaps: activity.swaps
                });
            }
        }
        
        // Sort and return top N
        scores.sort((a, b) => b.score - a.score);
        return scores.slice(0, limit);
    }
}
```

### Phase 3: Activity Thresholds & Pruning (Week 3)

```javascript
// Define "active" criteria
const ACTIVITY_THRESHOLDS = {
    // Token is "active" if ANY of these conditions are met:
    minVolume1h: 500,      // $500 USD volume in 1 hour
    minSwaps5m: 10,        // 10 swaps in 5 minutes
    minSwaps1h: 50,        // 50 swaps in 1 hour
    minUniqueTraders: 5    // 5 unique traders in 1 hour
};

// Pruning rules
const PRUNING_RULES = {
    inactiveThreshold: 4 * 3600,  // 4 hours no activity
    minActivity24h: 10,           // Minimum 10 swaps in 24h to keep
    maxActiveTokens: 200          // Keep top 200 active tokens
};

class ActiveTokenManager {
    constructor(activityTracker) {
        this.tracker = activityTracker;
        this.activeTokens = new Set();
    }
    
    async isActive(tokenAddress) {
        const activity1h = await this.tracker.getActivity(tokenAddress, '1h');
        const activity5m = await this.tracker.getActivity(tokenAddress, '5m');
        
        if (!activity1h || activity1h.swaps === 0) return false;
        
        // Check thresholds
        const meetsVolume = activity1h.volume >= ACTIVITY_THRESHOLDS.minVolume1h;
        const meetsSwaps5m = activity5m && activity5m.swaps >= ACTIVITY_THRESHOLDS.minSwaps5m;
        const meetsSwaps1h = activity1h.swaps >= ACTIVITY_THRESHOLDS.minSwaps1h;
        
        return meetsVolume || meetsSwaps5m || meetsSwaps1h;
    }
    
    async updateActiveSet() {
        // Get top tokens by score
        const topTokens = await this.tracker.getTopTokens(PRUNING_RULES.maxActiveTokens);
        
        // Filter to only active ones
        const active = [];
        for (const token of topTokens) {
            if (await this.isActive(token.tokenAddress)) {
                active.push(token.tokenAddress);
            }
        }
        
        // Update active set
        this.activeTokens = new Set(active);
        return active;
    }
    
    async prune() {
        const now = Date.now();
        const cutoff = now - (PRUNING_RULES.inactiveThreshold * 1000);
        
        // Find tokens that haven't been active recently
        const toRemove = [];
        for (const tokenAddress of this.activeTokens) {
            const activity = await this.tracker.getActivity(tokenAddress);
            if (!activity || activity.lastSeen < cutoff) {
                toRemove.push(tokenAddress);
            }
        }
        
        // Remove from active set
        toRemove.forEach(token => this.activeTokens.delete(token));
        return toRemove;
    }
}
```

## Integration with Current System

### Modified `EnhancedHybridPriceService.mjs`:

```javascript
// Add activity tracking
this.activityTracker = new RedisActivityTracker(redisClient);
this.activeTokenManager = new ActiveTokenManager(this.activityTracker);

// In swap processing:
async processSwap(swap) {
    // Calculate USD volume
    const volumeUsd = this.calculateVolumeUsd(swap);
    
    // Track activity
    await this.activityTracker.addSwap(swap.tokenMintA, volumeUsd, swap.timestamp);
    await this.activityTracker.addSwap(swap.tokenMintB, volumeUsd, swap.timestamp);
    
    // Check if should promote to active monitoring
    if (await this.activeTokenManager.isActive(swap.tokenMintA)) {
        if (!this.poolAddresses.has(swap.tokenMintA)) {
            await this.startMonitoring(swap.tokenMintA, swap.poolAddress);
        }
    }
}

// Every hour: re-rank and prune
setInterval(async () => {
    const active = await this.activeTokenManager.updateActiveSet();
    const pruned = await this.activeTokenManager.prune();
    
    console.log(`✅ Active tokens: ${active.length}, Pruned: ${pruned.length}`);
}, 3600000);
```

## Benefits of This Approach

✅ **Sliding Windows**: Detect both trending (5m) and sustained (24h) activity
✅ **Volume-Based**: Prioritize high-value tokens over low-value noise
✅ **Thresholds**: Only monitor tokens with meaningful activity
✅ **Persistence**: Redis keeps state across restarts
✅ **Auto-Cleanup**: Removes inactive/rugged tokens automatically
✅ **Scalable**: Handles 1000s of tokens efficiently

## Resource Requirements

**With Redis:**
- Memory: +500MB-1GB for Redis (stores windows)
- Latency: <1ms for Redis lookups
- Cost: +$50-100/month for managed Redis

**Without Redis (in-memory):**
- Memory: +2-4GB for sliding windows in Node
- Latency: Slightly slower (in-memory calculations)
- Cost: $0 extra

## Recommendation

**Start with in-memory sliding windows** (Phase 1) to validate the approach, then add Redis (Phase 2) if we need persistence or more advanced features.

The test running now will show us the top 10 contracts discovered. Then we can implement the sliding window approach!






