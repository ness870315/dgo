# 🪐 Jupiter API Integration - DeGen Oracle

## Overview

The Jupiter API integration replaces the DexScreener Update API for paid tokens, providing comprehensive token information including CA, name, symbol, icon, socials, supply, launchpad, creation time, holder count, audit details, organic score, FDV, market cap, price, liquidity, and various time-based stats.

## 🚀 Features

### **Comprehensive Token Data**
- **Basic Info**: CA, name, symbol, icon, decimals
- **Social Links**: Twitter, Telegram, website, CoinGecko ID
- **Supply Data**: Total supply, circulating supply, max supply
- **Market Data**: Price, market cap, FDV, volume, liquidity
- **Time Stats**: 1hr, 6hr, 24hr price changes, volume, transactions
- **Audit Info**: Mint/freeze authority status, holder distribution, dev balance
- **Organic Metrics**: Organic score, label, community health, development activity
- **Metadata**: Launchpad, creation time, holder count

### **Smart Scoring System**
- **Organic Score**: Based on holder count, liquidity, volume, social presence, security
- **Community Health**: Holder distribution, liquidity stability, trading activity
- **Development Activity**: Verification status, audit presence, website, CoinGecko listing

### **Fallback System**
- Automatically falls back to DexScreener if Jupiter API fails
- Maintains backward compatibility
- Graceful error handling

## 🔧 API Endpoints

### **1. Health Check**
```http
GET /api/jupiter/health
```
Returns Jupiter API service health status and information.

### **2. Service Information**
```http
GET /api/jupiter/info
```
Returns detailed service information including version, cache status, and description.

### **3. Test Endpoint**
```http
GET /api/jupiter/test/:contractAddress
```
Test Jupiter API functionality with a specific contract address.

### **4. Token Update (Main Endpoint)**
```http
POST /api/tokens/update-with-jupiter
```
Updates an existing token with comprehensive Jupiter API data.

**Request Body:**
```json
{
  "contractAddress": "HwC99nBLV8mwQS2rQGWzQqgm5N1WKC4CQQrRkaBabonk",
  "symbol": "TOKEN_SYMBOL"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Token updated successfully with Jupiter API data",
  "token": {
    "symbol": "TOKEN",
    "name": "Token Name",
    "contractAddress": "HwC99nBLV8mwQS2rQGWzQqgm5N1WKC4CQQrRkaBabonk",
    "marketCap": 1000000,
    "price": 0.001,
    "holderCount": 5000,
    "organicScore": 7.5,
    "organicLabel": "High Quality"
  },
  "jupiterData": {
    "fdv": 2000000,
    "liquidity": 500000,
    "socials": {
      "twitter": "https://twitter.com/token",
      "telegram": "https://t.me/token",
      "website": "https://token.com"
    },
    "auditInfo": {
      "mintAuthorityDisabled": true,
      "freezeAuthorityDisabled": true,
      "topHoldersPercentage": 15,
      "devBalancePercentage": 5
    },
    "timeStats": {
      "stats1h": { "priceChange": 2.5, "volume": 50000, "transactions": 150 },
      "stats6h": { "priceChange": 8.2, "volume": 200000, "transactions": 450 },
      "stats24h": { "priceChange": 15.7, "volume": 800000, "transactions": 1200 }
    }
  }
}
```

## 🏗️ Architecture

### **Service Structure**
```
JupiterApiService
├── getTokenDetails(contractAddress)
├── extractTokenInformation(tokenData, contractAddress)
├── calculateOrganicScore(tokenData)
├── getOrganicLabel(tokenData)
├── calculateCommunityHealth(tokenData)
├── calculateDevelopmentActivity(tokenData)
├── updateTokenWithJupiterData(existingToken)
├── healthCheck()
└── getServiceInfo()
```

### **Data Flow**
1. **Token Addition**: New paid tokens are added via `/api/tokens/add-paid-token`
2. **Immediate Processing**: `processNewTokenImmediately()` calls `processTokenWithRealData()`
3. **Jupiter API Update**: `processTokenWithRealData()` uses Jupiter API as primary source
4. **Fallback**: If Jupiter API fails, falls back to DexScreener via `processTokenWithFallbackData()`
5. **Cache Update**: Updated token data is saved to persistent cache

### **Caching Strategy**
- **Cache Duration**: 10 minutes
- **Cache Key**: `jupiter_${contractAddress}`
- **Cache Invalidation**: Automatic timeout-based invalidation
- **Manual Clear**: Available via `clearCache()` method

## 📊 Scoring Algorithm

### **Organic Score (0-9.9)**
- **Base Score**: 5.0
- **Holder Count Bonus**: 0-2.0 points
  - 10K+ holders: +2.0
  - 5K+ holders: +1.5
  - 1K+ holders: +1.0
  - 100+ holders: +0.5
- **Liquidity Bonus**: 0-1.5 points
  - $1M+ liquidity: +1.5
  - $500K+ liquidity: +1.0
  - $100K+ liquidity: +0.5
- **Volume Bonus**: 0-1.0 points
  - $500K+ volume: +1.0
  - $100K+ volume: +0.5
- **Social Presence**: 0-0.5 points
- **Security Bonus**: 0-1.0 points (mint/freeze authority disabled)

### **Organic Labels**
- **Premium**: 8.5+ score
- **High Quality**: 7.0+ score
- **Good**: 5.5+ score
- **Fair**: 4.0+ score
- **Basic**: <4.0 score

## 🧪 Testing

### **Test Script**
Run the test script to verify Jupiter API integration:
```bash
cd backend
node test-jupiter-api.js
```

### **Manual Testing**
1. **Health Check**: `GET /api/jupiter/health`
2. **Service Info**: `GET /api/jupiter/info`
3. **Test Contract**: `GET /api/jupiter/test/{contractAddress}`
4. **Update Token**: `POST /api/tokens/update-with-jupiter`

### **Sample Contract**
Use the provided sample contract for testing:
```
HwC99nBLV8mwQS2rQGWzQqgm5N1WKC4CQQrRkaBabonk
```

## 🔄 Migration from DexScreener

### **What's Replaced**
- ✅ **Primary Data Source**: Jupiter API replaces DexScreener for paid tokens
- ✅ **Token Updates**: `updateTokenWithJupiterData()` replaces DexScreener updates
- ✅ **Comprehensive Data**: More detailed information than DexScreener
- ✅ **Better Scoring**: Organic metrics and community health analysis

### **What's Maintained**
- ✅ **Fallback System**: DexScreener remains as backup
- ✅ **API Structure**: Similar response format for compatibility
- ✅ **Error Handling**: Robust error handling and logging
- ✅ **Cache System**: Efficient caching with timeout

### **Benefits of Migration**
- 🚀 **More Data**: Comprehensive token information
- 🎯 **Better Quality**: Organic scoring and audit information
- 🔒 **Security**: Mint/freeze authority status
- 📊 **Analytics**: Time-based statistics and holder analysis
- 🌐 **Social Integration**: Direct social media links
- 📈 **Market Insights**: FDV, liquidity, and volume analysis

## 🚨 Error Handling

### **Common Errors**
- **API Unavailable**: Falls back to DexScreener
- **Invalid Contract**: Returns 404 with detailed error message
- **Rate Limiting**: Built-in timeout and retry logic
- **Data Parsing**: Graceful fallback for malformed responses

### **Fallback Strategy**
1. **Primary**: Jupiter API
2. **Secondary**: DexScreener (existing functionality)
3. **Tertiary**: Simulated data (for testing)

## 📈 Performance

### **Optimizations**
- **Caching**: 10-minute cache for repeated requests
- **Timeout**: 15-second timeout for API calls
- **Batch Processing**: Efficient token updates
- **Memory Management**: Automatic cache cleanup

### **Monitoring**
- **Health Checks**: Regular API availability monitoring
- **Performance Metrics**: Response time tracking
- **Error Logging**: Comprehensive error reporting
- **Cache Statistics**: Cache hit/miss ratios

## 🔮 Future Enhancements

### **Planned Features**
- **Batch Updates**: Update multiple tokens simultaneously
- **WebSocket Support**: Real-time token data updates
- **Advanced Analytics**: Historical data and trends
- **Custom Scoring**: Configurable scoring algorithms
- **API Rate Limiting**: Intelligent request throttling

### **Integration Opportunities**
- **Portfolio Tracking**: Real-time portfolio updates
- **Alert System**: Price and volume alerts
- **Trading Signals**: Automated trading recommendations
- **Risk Assessment**: Advanced risk scoring

## 📝 Configuration

### **Environment Variables**
```bash
# Jupiter API Configuration
JUPITER_API_BASE_URL=https://lite-api.jup.ag/tokens/v2
JUPITER_API_TIMEOUT=15000
JUPITER_CACHE_DURATION=600000
```

### **Service Configuration**
```javascript
const jupiterApiService = new JupiterApiService({
  baseURL: process.env.JUPITER_API_BASE_URL || 'https://lite-api.jup.ag/tokens/v2',
  timeout: process.env.JUPITER_API_TIMEOUT || 15000,
  cacheTimeout: process.env.JUPITER_CACHE_DURATION || 600000
});
```

## 🤝 Support

### **Troubleshooting**
1. **Check Health**: Verify `/api/jupiter/health` endpoint
2. **Review Logs**: Check console for error messages
3. **Test Endpoint**: Use `/api/jupiter/test/{contract}` for debugging
4. **Clear Cache**: Reset cache if data seems stale

### **Logging**
- **Info**: Service initialization, successful operations
- **Warning**: Fallback to DexScreener, cache misses
- **Error**: API failures, parsing errors, validation failures

---

**Version**: 2.0.0  
**Last Updated**: December 2024  
**Maintainer**: DeGen Oracle Team




