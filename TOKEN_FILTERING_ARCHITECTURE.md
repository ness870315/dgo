# Token Filtering Architecture - Multi-Layer System

## 🎯 Overview

Multi-layer filtering system that progressively validates tokens before adding them to the database. Designed to filter out 99%+ of scam/low-quality tokens while minimizing API costs.

---

## 📊 Filter Performance Target

| Layer | Filters Out | Remaining | API Calls |
|-------|-------------|-----------|-----------|
| **Layer 1: Activity** | 95% | 5% | 0 (FREE) |
| **Layer 2: Jupiter** | 80% of remaining | 1% | Only for 5% |
| **Layer 3: Processing** | Additional filtering | <1% | Full processing |

**Total Filtered: 99%+ of tokens**  
**API Cost Reduction: 95%**

---

## 🔍 Layer 1: Activity Filters (FREE - No API Calls)

### Purpose
Quick, zero-cost filters based on swap activity data we already have from gRPC stream.

### Criteria

#### 1. **Age Filter**
```javascript
minimumAge: 2 * 60 * 1000  // 2 minutes in milliseconds
```
- **Why**: Prevents spam from brand-new tokens
- **Implementation**: `Date.now() - activity.firstSeen >= minimumAge`

#### 2. **Activity Threshold** (2 of 3 required)
```javascript
activityThresholds: {
  minSwaps: 10,        // Minimum swap count
  minVolume: 1000,     // Minimum $1000 volume
  minTraders: 5        // Minimum unique traders
}
```
- **Why**: Ensures real trading activity
- **Implementation**: Must meet at least 2 of these 3 criteria

#### 3. **Sustained Activity**
```javascript
sustainedActivity: {
  minSwapsPerMinute: 2,
  measurementWindow: 5 * 60 * 1000  // 5 minutes
}
```
- **Why**: Filters out pump-and-dump patterns
- **Implementation**: Calculate swap rate over time window

#### 4. **Price Sanity Checks**
```javascript
priceSanity: {
  maxPriceChange1m: 500,    // Max 500% change in 1 minute
  maxPriceChange5m: 1000,   // Max 1000% change in 5 minutes
  minPrice: 0.00000001,     // Minimum price (prevents division errors)
  maxPrice: 1000000,        // Maximum price (sanity check)
  maxVolatility: 0.8        // Max 80% volatility coefficient
}
```
- **Why**: Detects suspicious price manipulation
- **Implementation**: Track price history and calculate volatility

### Implementation in `processNewTokenSwap()`

```javascript
async applyLayer1Filters(tokenMint, activity) {
  // 1. Age Filter
  const age = Date.now() - activity.firstSeen;
  if (age < this.filters.layer1.minimumAge) {
    console.log(`🚫 [Layer1] ${tokenMint.slice(0,8)}... FILTERED: Too young (${(age/1000).toFixed(0)}s)`);
    return false;
  }

  // 2. Activity Threshold (2 of 3)
  const meetsSwaps = activity.swapCount >= this.filters.layer1.activityThresholds.minSwaps;
  const meetsVolume = activity.totalVolume >= this.filters.layer1.activityThresholds.minVolume;
  const meetsTraders = activity.uniqueTraders.size >= this.filters.layer1.activityThresholds.minTraders;
  
  const activityScore = (meetsSwaps ? 1 : 0) + (meetsVolume ? 1 : 0) + (meetsTraders ? 1 : 0);
  if (activityScore < 2) {
    console.log(`🚫 [Layer1] ${tokenMint.slice(0,8)}... FILTERED: Low activity (${activityScore}/3)`);
    return false;
  }

  // 3. Sustained Activity
  const ageMinutes = age / (60 * 1000);
  const swapsPerMinute = activity.swapCount / ageMinutes;
  if (swapsPerMinute < this.filters.layer1.sustainedActivity.minSwapsPerMinute) {
    console.log(`🚫 [Layer1] ${tokenMint.slice(0,8)}... FILTERED: Low swap rate (${swapsPerMinute.toFixed(2)}/min)`);
    return false;
  }

  // 4. Price Sanity
  const priceHistory = activity.priceHistory || [];
  if (priceHistory.length >= 2) {
    const recentPrices = priceHistory.slice(-10); // Last 10 prices
    const priceChanges = [];
    
    for (let i = 1; i < recentPrices.length; i++) {
      const change = Math.abs((recentPrices[i].price - recentPrices[i-1].price) / recentPrices[i-1].price) * 100;
      priceChanges.push(change);
    }
    
    const maxChange = Math.max(...priceChanges);
    const avgChange = priceChanges.reduce((a, b) => a + b, 0) / priceChanges.length;
    
    // Check for extreme volatility
    if (maxChange > this.filters.layer1.priceSanity.maxPriceChange1m) {
      console.log(`🚫 [Layer1] ${tokenMint.slice(0,8)}... FILTERED: Extreme volatility (${maxChange.toFixed(0)}%)`);
      return false;
    }
    
    // Check for suspicious patterns (too stable = bot trading)
    if (avgChange < 0.1 && activity.swapCount > 20) {
      console.log(`🚫 [Layer1] ${tokenMint.slice(0,8)}... FILTERED: Suspicious stability (bot trading)`);
      return false;
    }
  }

  console.log(`✅ [Layer1] ${tokenMint.slice(0,8)}... PASSED: Age=${(age/1000).toFixed(0)}s, Swaps=${activity.swapCount}, Volume=$${activity.totalVolume.toFixed(0)}, Traders=${activity.uniqueTraders.size}`);
  return true;
}
```

---

## 🪐 Layer 2: Jupiter Validation (API Calls Only for 5%)

### Purpose
Validate token quality using Jupiter API data. Only called for tokens that pass Layer 1.

### Criteria

#### 1. **Must Have One Quality Indicator**
```javascript
qualityIndicators: {
  hasGraduatedAt: true,   // Token graduated from bonding curve
  hasLaunchpad: true,     // Launched via known launchpad
  hasOrganicScore: true   // Has organic trading score > 0
}
```
- **Why**: Ensures token has legitimate origin
- **Implementation**: Check Jupiter API response for these fields

#### 2. **Not Flagged as Suspicious**
```javascript
securityChecks: {
  notSuspicious: true,           // audit.isSus !== true
  notFrozen: true,               // audit.frozen !== true
  notMintDisabled: false,        // Allow mint disabled (good sign)
  notFreezable: false            // Allow freezable (common)
}
```
- **Why**: Filters out known scams and security risks
- **Implementation**: Check Jupiter audit data

#### 3. **Must Be in Jupiter Database**
- **Why**: Jupiter only indexes legitimate tokens
- **Implementation**: API returns 404 for non-existent tokens

### Implementation in `applyLayer2Filters()`

```javascript
async applyLayer2Filters(tokenMint) {
  try {
    // Fetch Jupiter data (with caching)
    const jupiterData = await this.fetchJupiterData(tokenMint);
    
    if (!jupiterData) {
      console.log(`🚫 [Layer2] ${tokenMint.slice(0,8)}... FILTERED: Not in Jupiter database`);
      return { passed: false, reason: 'not_in_jupiter' };
    }

    // 1. Quality Indicators (must have at least one)
    const hasGraduatedAt = jupiterData.graduatedAt && jupiterData.graduatedAt !== '';
    const hasLaunchpad = jupiterData.launchpad && jupiterData.launchpad !== '';
    const hasOrganicScore = jupiterData.organicScore && jupiterData.organicScore > 0;
    
    if (!hasGraduatedAt && !hasLaunchpad && !hasOrganicScore) {
      console.log(`🚫 [Layer2] ${tokenMint.slice(0,8)}... FILTERED: No quality indicators`);
      console.log(`   graduatedAt: ${jupiterData.graduatedAt || 'none'}`);
      console.log(`   launchpad: ${jupiterData.launchpad || 'none'}`);
      console.log(`   organicScore: ${jupiterData.organicScore || 0}`);
      return { passed: false, reason: 'no_quality_indicators' };
    }

    // 2. Security Checks
    if (jupiterData.audit?.isSus === true) {
      console.log(`🚫 [Layer2] ${tokenMint.slice(0,8)}... FILTERED: Flagged as suspicious`);
      return { passed: false, reason: 'suspicious_flag' };
    }

    if (jupiterData.audit?.frozen === true) {
      console.log(`🚫 [Layer2] ${tokenMint.slice(0,8)}... FILTERED: Token is frozen`);
      return { passed: false, reason: 'frozen' };
    }

    // 3. Additional Quality Checks
    const qualityScore = 
      (hasGraduatedAt ? 1 : 0) + 
      (hasLaunchpad ? 1 : 0) + 
      (hasOrganicScore ? 1 : 0);

    console.log(`✅ [Layer2] ${tokenMint.slice(0,8)}... PASSED: Quality=${qualityScore}/3`);
    console.log(`   Symbol: ${jupiterData.symbol}`);
    console.log(`   Name: ${jupiterData.name}`);
    console.log(`   Graduated: ${hasGraduatedAt ? '✓' : '✗'}`);
    console.log(`   Launchpad: ${hasLaunchpad ? jupiterData.launchpad : '✗'}`);
    console.log(`   Organic Score: ${hasOrganicScore ? jupiterData.organicScore : '✗'}`);

    return { 
      passed: true, 
      jupiterData,
      qualityScore 
    };

  } catch (error) {
    console.error(`❌ [Layer2] ${tokenMint.slice(0,8)}... ERROR:`, error.message);
    return { passed: false, reason: 'api_error' };
  }
}
```

---

## 🔄 Layer 3: Token Processing (Full Pipeline)

### Purpose
Full token processing including Twitter data, scoring, and database insertion.

### Process Flow

```javascript
async processValidatedToken(tokenMint, jupiterData, activity) {
  console.log(`🎯 [Layer3] ${tokenMint.slice(0,8)}... Starting full processing`);
  
  // 1. Create token object
  const token = {
    contractAddress: tokenMint,
    symbol: jupiterData.symbol,
    name: jupiterData.name,
    decimals: jupiterData.decimals,
    supply: jupiterData.supply,
    
    // Jupiter data
    jupiterData: jupiterData,
    
    // Activity data from Layer 1
    initialSwapCount: activity.swapCount,
    initialVolume: activity.totalVolume,
    initialTraders: activity.uniqueTraders.size,
    discoveredAt: activity.firstSeen,
    
    // Stage
    stage: 'discovered',
    
    // Metadata
    createdAt: Date.now()
  };
  
  // 2. Emit event for token processor
  this.emit('newTokenDiscovered', token);
  
  // 3. Add to known tokens for immediate tracking
  const metrics = new TokenMetrics(tokenMint);
  
  // Add historical swaps from activity
  for (const swap of activity.swaps || []) {
    metrics.addSwap(swap);
  }
  
  this.knownTokens.set(tokenMint, metrics);
  
  // 4. Save to ChartDatabase
  for (const swap of activity.swaps || []) {
    this.chartDatabase.addSwap(tokenMint, {
      timestamp: swap.timestamp,
      type: swap.type,
      price: swap.priceUsd,
      amount: swap.tokenAmount,
      volumeUsd: swap.volumeUsd,
      signature: swap.signature
    });
  }
  
  // 5. Update stats
  this.stats.tokensDiscovered++;
  this.newTokenActivity.delete(tokenMint);
  
  console.log(`✅ [Layer3] ${tokenMint.slice(0,8)}... Processing initiated`);
  console.log(`   Total discovered: ${this.stats.tokensDiscovered}`);
}
```

---

## 📈 Complete Filter Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    gRPC DEX Stream                           │
│                  (All Swap Transactions)                     │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │   Known Token?       │
              └──────┬───────┬───────┘
                     │ YES   │ NO
                     ▼       ▼
         ┌──────────────┐  ┌─────────────────────────┐
         │ Process      │  │ Track Activity          │
         │ Immediately  │  │ (newTokenActivity Map)  │
         └──────────────┘  └──────────┬──────────────┘
                                      │
                                      ▼
                         ┌────────────────────────────┐
                         │ LAYER 1: Activity Filters  │
                         │ (FREE - No API Calls)      │
                         ├────────────────────────────┤
                         │ ✓ Age: 2+ minutes          │
                         │ ✓ Activity: 2 of 3         │
                         │   - 10+ swaps              │
                         │   - $1000+ volume          │
                         │   - 5+ traders             │
                         │ ✓ Sustained: 2+ swaps/min  │
                         │ ✓ Price sanity checks      │
                         └──────────┬─────────────────┘
                                    │ PASS (5%)
                                    ▼
                         ┌────────────────────────────┐
                         │ LAYER 2: Jupiter Filters   │
                         │ (API Call - Only for 5%)   │
                         ├────────────────────────────┤
                         │ ✓ In Jupiter database      │
                         │ ✓ Has quality indicator:   │
                         │   - graduatedAt OR         │
                         │   - launchpad OR           │
                         │   - organicScore           │
                         │ ✓ Not flagged:             │
                         │   - isSus !== true         │
                         │   - frozen !== true        │
                         └──────────┬─────────────────┘
                                    │ PASS (1%)
                                    ▼
                         ┌────────────────────────────┐
                         │ LAYER 3: Full Processing   │
                         │ (Token Processor)          │
                         ├────────────────────────────┤
                         │ ✓ Twitter data fetch       │
                         │ ✓ Enhanced scoring         │
                         │ ✓ Database insertion       │
                         │ ✓ WebSocket broadcast      │
                         └────────────────────────────┘
```

---

## 💾 Activity Tracking Data Structure

```javascript
// newTokenActivity Map structure
{
  tokenMint: {
    swapCount: 0,
    firstSeen: Date.now(),
    lastSeen: Date.now(),
    totalVolume: 0,
    uniqueTraders: new Set(),
    swaps: [],  // Store recent swaps for replay
    priceHistory: [
      { timestamp, price }
    ],
    
    // Layer 1 tracking
    layer1Checked: false,
    layer1Passed: false,
    layer1FailReason: null,
    
    // Layer 2 tracking
    layer2Checked: false,
    layer2Passed: false,
    layer2FailReason: null
  }
}
```

---

## 📊 Statistics & Monitoring

### Track Filter Performance

```javascript
this.filterStats = {
  layer1: {
    checked: 0,
    passed: 0,
    failed: {
      tooYoung: 0,
      lowActivity: 0,
      lowSwapRate: 0,
      extremeVolatility: 0,
      suspiciousStability: 0
    }
  },
  layer2: {
    checked: 0,
    passed: 0,
    failed: {
      notInJupiter: 0,
      noQualityIndicators: 0,
      suspiciousFlag: 0,
      frozen: 0,
      apiError: 0
    }
  },
  layer3: {
    processed: 0,
    successful: 0,
    failed: 0
  }
};
```

### Admin Endpoint for Stats

```javascript
GET /api/admin/filter-stats

Response:
{
  layer1: {
    checked: 10000,
    passed: 500,
    passRate: "5.00%",
    failed: {
      tooYoung: 7000,
      lowActivity: 2000,
      lowSwapRate: 500,
      extremeVolatility: 300,
      suspiciousStability: 200
    }
  },
  layer2: {
    checked: 500,
    passed: 100,
    passRate: "20.00%",  // 1% of total
    failed: {
      notInJupiter: 200,
      noQualityIndicators: 150,
      suspiciousFlag: 30,
      frozen: 15,
      apiError: 5
    }
  },
  layer3: {
    processed: 100,
    successful: 95,
    failed: 5
  },
  totalFiltered: "99.00%",
  apiCallReduction: "95.00%"
}
```

---

## 🔧 Configuration

### Environment Variables

```bash
# Layer 1 Configuration
FILTER_MIN_AGE_SECONDS=120                # 2 minutes
FILTER_MIN_SWAPS=10
FILTER_MIN_VOLUME=1000
FILTER_MIN_TRADERS=5
FILTER_MIN_SWAPS_PER_MINUTE=2
FILTER_MAX_PRICE_CHANGE_1M=500           # 500%
FILTER_MAX_PRICE_CHANGE_5M=1000          # 1000%

# Layer 2 Configuration
FILTER_REQUIRE_QUALITY_INDICATOR=true
FILTER_BLOCK_SUSPICIOUS=true
FILTER_BLOCK_FROZEN=true

# Performance
FILTER_ACTIVITY_CLEANUP_INTERVAL=300000  # 5 minutes
FILTER_MAX_TRACKED_TOKENS=10000          # Max tokens in newTokenActivity
```

---

## 🎯 Expected Results

### Filter Performance

| Metric | Target | Actual (Est.) |
|--------|--------|---------------|
| **Layer 1 Pass Rate** | 5% | 3-7% |
| **Layer 2 Pass Rate** | 20% of Layer 1 | 15-25% |
| **Total Pass Rate** | 1% | 0.5-1.5% |
| **API Call Reduction** | 95% | 93-97% |
| **False Negatives** | <1% | <0.5% |

### Cost Savings

- **Before**: 100,000 tokens/day × Jupiter API call = 100k API calls
- **After**: 100,000 tokens/day × 5% pass Layer 1 = 5k API calls
- **Savings**: 95,000 API calls/day (95% reduction)

### Quality Improvement

- **Scam Tokens Filtered**: 99%+
- **Legitimate Tokens Passed**: 99%+
- **Processing Overhead**: Minimal (all Layer 1 checks are O(1))

---

## 🚀 Implementation Priority

1. **Phase 1**: Implement Layer 1 filters in `processNewTokenSwap()`
2. **Phase 2**: Implement Layer 2 filters in `applyLayer2Filters()`
3. **Phase 3**: Add statistics tracking and monitoring
4. **Phase 4**: Add admin endpoints for filter stats
5. **Phase 5**: Fine-tune thresholds based on production data

---

## 📝 Testing Strategy

### Unit Tests
- Test each filter independently
- Test edge cases (0 swaps, extreme prices, etc.)
- Test filter combinations

### Integration Tests
- Test full flow with real gRPC data
- Verify API call reduction
- Verify legitimate tokens pass through

### Production Monitoring
- Track filter stats hourly
- Alert on abnormal pass rates
- Monitor false negatives (legitimate tokens filtered)

---

## ✅ Success Criteria

- ✅ 95%+ of tokens filtered at Layer 1 (no API calls)
- ✅ 99%+ of scam tokens filtered total
- ✅ <1% false negatives (legitimate tokens filtered)
- ✅ 95%+ API call reduction
- ✅ <100ms processing time per token at Layer 1
- ✅ All legitimate graduated tokens pass filters

---

## 🔮 Future Enhancements

1. **Machine Learning Layer**
   - Train model on historical scam patterns
   - Predict scam probability before Jupiter check

2. **Social Signal Integration**
   - Twitter mention velocity
   - Telegram/Discord activity
   - Website/whitepaper existence

3. **On-Chain Analysis**
   - Holder distribution
   - Liquidity pool analysis
   - Smart contract verification

4. **Dynamic Thresholds**
   - Adjust thresholds based on market conditions
   - A/B testing for optimal values
   - Time-of-day adjustments

---

Ready to implement! 🚀

