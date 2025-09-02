# Enhanced Token Architecture v1.0

## Overview

This new architecture completely restructures the DeGen Oracle token monitoring system to solve the current "N/A" data issues and provide a more scalable, efficient, and reliable solution.

## 🏗️ Architecture Components

### 1. **Separate Source Databases**
- **CoingeckoDB**: Stores trending tokens from CoinGecko API
- **DexscreenerDB**: Stores trending tokens from DexScreener API  
- **PaidTokenDB**: Stores user-paid token listings
- **FinalDatabase**: Consolidated database with processed Jupiter data and scores

### 2. **Data Flow**
```
External APIs → Raw DBs → Batch Processor → Jupiter API → Score Calculator → Final DB → UI
```

### 3. **Update Frequencies**
- **All Sources**: Every 20 minutes
- **Batch Processing**: 90 contracts at once (safe Jupiter API limit)
- **Fallback**: Individual processing if batch fails

## 🔧 Key Features

### **Batch Processing**
- Processes up to 90 contracts simultaneously
- Respects Jupiter API rate limits
- Automatic fallback to individual processing
- 2-second delays between batches

### **Smart Score Calculation**
- **Organic Score**: Based on holder count, liquidity, volume, security
- **Community Health**: Holder growth, volume consistency, social presence
- **Development Activity**: Transaction volume, organic volume, launchpad presence
- **Risk Assessment**: Security checks, liquidity risk, holder concentration
- **Score Cap**: Maximum 9.9 (no perfect 10)

### **Data Persistence**
- All databases saved to JSON files in `./cache/` directory
- Survives server restarts
- Automatic data recovery and validation

### **Dead Token Filtering**
- Automatically removes tokens with scores 0-1
- Keeps database clean and focused on active tokens
- Improves user experience

## 📊 Database Structure

### **CoingeckoDB/DexscreenerDB/PaidTokenDB**
```json
{
  "symbol": "WIZI",
  "name": "Wizi Order", 
  "contractAddress": "HwC99nBLV8mwQS2rQGWzQqgm5N1WKC4CQQrRkaBabonk",
  "lastFetched": "2025-08-28T19:39:26.040Z",
  "source": "coingecko|dexscreener|paid_listing"
}
```

### **FinalDatabase**
```json
{
  "symbol": "WIZI",
  "name": "Wizi Order",
  "contractAddress": "HwC99nBLV8mwQS2rQGWzQqgm5N1WKC4CQQrRkaBabonk",
  "score": 7.8,
  "jupiterData": {
    "supplyInfo": { "totalSupply": 999977339.900003 },
    "marketData": { "price": 0.000168, "marketCap": 168990.96 },
    "organicMetrics": { "organicScore": 45.55, "organicLabel": "medium" },
    "auditInfo": { "mintAuthorityDisabled": true, "freezeAuthorityDisabled": true }
  },
  "lastUpdated": "2025-08-28T19:39:26.040Z"
}
```

## 🚀 Implementation Benefits

### **Performance**
- Users get instant data from cached Final Database
- No more "N/A" values - all data is pre-processed
- Fast UI rendering with complete token information

### **Reliability**
- If Jupiter API is down, users still see cached data
- Automatic retry mechanisms for failed batches
- Graceful degradation with fallback processing

### **Scalability**
- Easy to add new data sources
- Modular architecture for future enhancements
- Efficient batch processing reduces API costs

### **User Experience**
- Shows "last updated" timestamps
- Consistent data structure across all tokens
- Real-time score updates every 20 minutes

## 🔄 Processing Cycle

1. **Data Collection** (Every 20 minutes)
   - Fetch trending tokens from CoinGecko
   - Fetch trending tokens from DexScreener
   - Process paid token requests

2. **Batch Processing**
   - Collect all unique contract addresses
   - Process in batches of 90 contracts
   - Call Jupiter API for comprehensive data

3. **Score Calculation**
   - Calculate organic scores
   - Assess community health
   - Evaluate development activity
   - Determine risk levels

4. **Database Update**
   - Update Final Database with new data
   - Filter out dead tokens (score 0-1)
   - Save persistent cache

5. **Frontend Service**
   - Serve complete token data to UI
   - Include last updated timestamps
   - Provide real-time score information

## 📁 File Structure

```
backend/
├── newArchitecture.js          # Main architecture class
├── enhancedJupiterService.js   # Enhanced Jupiter API service
├── test-new-architecture.js    # Test script
├── ENHANCED_ARCHITECTURE_README.md
└── cache/                      # Persistent database files
    ├── coingecko-db.json
    ├── dexscreener-db.json
    ├── paid-token-db.json
    └── final-database.json
```

## 🧪 Testing

Run the test script to verify the architecture:

```bash
cd backend
node test-new-architecture.js
```

This will:
- Test database operations
- Verify Jupiter API integration
- Validate score calculations
- Show database statistics

## 🔧 Integration Steps

### **Phase 1: Setup New Architecture**
1. Import `EnhancedTokenArchitecture` class
2. Initialize separate databases
3. Set up background processing

### **Phase 2: Migrate Existing Data**
1. Convert current token cache to new structure
2. Process existing tokens with Jupiter API
3. Calculate scores for all tokens

### **Phase 3: Update Frontend**
1. Modify API endpoints to use Final Database
2. Update UI to show "last updated" timestamps
3. Implement real-time score display

### **Phase 4: Monitor & Optimize**
1. Track processing performance
2. Adjust batch sizes if needed
3. Monitor Jupiter API rate limits

## 🎯 What This Solves

### **Current Issues Fixed**
- ❌ "N/A" values for Price, Total Supply, FDV, Liquidity
- ❌ Inconsistent Jupiter data integration
- ❌ No persistent storage across restarts
- ❌ Inefficient individual API calls
- ❌ Missing score calculations

### **New Capabilities**
- ✅ Complete Jupiter data for all tokens
- ✅ Real-time score updates every 20 minutes
- ✅ Batch processing (90 contracts at once)
- ✅ Persistent data storage
- ✅ Dead token filtering
- ✅ Comprehensive risk assessment
- ✅ Community health metrics

## 🔮 Future Enhancements

- **Real-time Updates**: WebSocket integration for live data
- **Advanced Analytics**: Machine learning score predictions
- **Multi-chain Support**: Extend to other blockchains
- **API Rate Optimization**: Smart batching based on API limits
- **Data Validation**: Automated quality checks and alerts

## 📞 Support

This architecture provides a solid foundation for the DeGen Oracle platform. The modular design makes it easy to add new features while maintaining performance and reliability.

---

**Version**: 1.0  
**Last Updated**: 2025-08-28  
**Architecture**: Enhanced Token Architecture  
**Status**: Ready for Implementation





