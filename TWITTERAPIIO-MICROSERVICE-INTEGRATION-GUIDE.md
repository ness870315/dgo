# 🚀 TwitterAPI.io Advanced Search - Microservice Integration Guide

## 📋 Overview

This guide covers the integration of TwitterAPI.io's `advanced_search` endpoint into the DeGen Oracle social health score calculation system via the **twitter-service microservice**. The new integration provides more reliable and cost-effective tweet fetching for token mentions.

## 🎯 Key Benefits

- ✅ **Cashtag/Hashtag OR Queries**: `($wizi OR #wizi)` syntax
- ✅ **Latest Tweets**: `queryType=Latest` parameter  
- ✅ **Up to 20 tweets per request**: Perfect for our needs
- ✅ **No rate limits**: More reliable than Twitter API v2
- ✅ **Cost-effective**: $0.15/1k tweets vs Twitter API v2 costs
- ✅ **Microservice Architecture**: Maintains separation of concerns

## 🏗️ Architecture Overview

The TwitterAPI.io integration follows a **microservice architecture** with proper separation of concerns:

### **Microservice Integration**
- **File**: `twitter-service/main.py` (new `/api/twitter/advanced_search` endpoint)
- **Purpose**: Handles TwitterAPI.io API interactions via microservice
- **Integration**: `backend/enhancedSocialDataService.js` calls microservice

### **Service Flow**
```
enhancedSocialDataService.js
    ↓
twitter-service microservice
    ↓
/api/twitter/advanced_search endpoint
    ↓
TwitterAPI.io API
    ↓
Transformed Response
    ↓
Social Health Score Calculation
```

## 🔧 Implementation Details

### **Phase 1: Microservice Endpoint Added** ✅

**File**: `twitter-service/main.py`

**New Endpoint**: `/api/twitter/advanced_search`

**Key Features**:
- TwitterAPI.io advanced search integration
- Cashtag/hashtag OR query support: `($WIZI OR #WIZI)`
- Query type support: `Latest`, `Popular`, etc.
- Time range filtering: `startTime`, `endTime`
- Data transformation for internal format compatibility
- Error handling and logging

### **Phase 2: Backend Integration Updated** ✅

**File**: `backend/enhancedSocialDataService.js`

**Integration Points**:
- Primary source: TwitterAPI.io via microservice `/api/twitter/advanced_search`
- Fallback: Existing Twitter API v2 search via microservice
- Feature flag: `TWITTERAPIIO_SEARCH_ENABLED=true`

## 🚀 Quick Start

### 1. Environment Setup

**For twitter-service microservice** (add to `twitter-service/.env`):
```bash
# TwitterAPI.io Configuration
TWITTERAPIIO_API_KEY=your_api_key_here

# Existing Twitter API v2 (fallback)
TWITTER_BEARER_TOKEN=your_bearer_token_here
```

**For backend** (add to `.env`):
```bash
# Feature flag to enable TwitterAPI.io search
TWITTERAPIIO_SEARCH_ENABLED=true

# Twitter service URL (existing)
TWITTER_SERVICE_URL=https://dgo-2.onrender.com
```

### 2. Test the Integration

Run the comprehensive test:
```bash
node test-twitter-service-advanced-search.js
```

## 📊 API Endpoint Details

### **TwitterAPI.io Advanced Search**

**Endpoint**: `GET /api/twitter/advanced_search`

**Parameters**:
- `query` (required): Search query, e.g., `($WIZI OR #WIZI)`
- `count` (optional): Number of tweets (max 20, default 20)
- `queryType` (optional): Query type (default: "Latest")
- `startTime` (optional): Start time in ISO format
- `endTime` (optional): End time in ISO format

**Example Request**:
```javascript
GET /api/twitter/advanced_search?query=($WIZI%20OR%20%23WIZI)&count=20&queryType=Latest
```

**Response Format**:
```json
{
  "success": true,
  "query": "($WIZI OR #WIZI)",
  "count": 15,
  "tweets": [
    {
      "id": "1234567890",
      "text": "Just bought some $WIZI tokens! 🚀",
      "created_at": "2024-01-15T10:30:00Z",
      "user": {
        "name": "Crypto Trader",
        "screen_name": "cryptotrader123"
      },
      "retweet_count": 5,
      "favorite_count": 12,
      "reply_count": 3,
      "quote_count": 1,
      "view_count": 150,
      "is_reply": false,
      "url": "https://twitter.com/cryptotrader123/status/1234567890",
      "source": "twitterapiio"
    }
  ],
  "source": "twitterapiio",
  "has_next_page": true,
  "next_cursor": "next_cursor_value"
}
```

## 🔄 Integration Flow

### **Search Strategy Priority**

1. **🚀 TwitterAPI.io Advanced Search** (if enabled):
   - Query: `($SYMBOL OR #SYMBOL)`
   - Count: 20 tweets
   - QueryType: Latest
   - Time range: Based on cooldown logic

2. **🔄 Twitter API v2 Fallback**:
   - Query: `has:hashtags #SYMBOL -is:retweet lang:en`
   - Count: 8 tweets
   - Same time range logic

### **Error Handling**

- **TwitterAPI.io fails**: Automatically falls back to Twitter API v2
- **Both fail**: Uses cached data or mock data
- **No API keys**: Graceful degradation with informative errors

## 🎯 Usage in Social Health Score

The integration seamlessly works with existing workflows:

### **5-Day Cooldown System**
- ✅ Maintains existing cooldown logic
- ✅ Uses same time range calculations
- ✅ Respects admin bypass functionality

### **New Token Processing**
- ✅ Automatically uses TwitterAPI.io for new tokens
- ✅ Falls back to Twitter API v2 if needed
- ✅ Same data transformation pipeline

### **Admin Panel Bypass**
- ✅ Works with existing bypass mechanism
- ✅ Overrides cooldowns as before
- ✅ Uses most recent data available

## 🔧 Configuration Options

### **Environment Variables**

| Variable | Location | Purpose | Required |
|----------|----------|---------|----------|
| `TWITTERAPIIO_API_KEY` | twitter-service | TwitterAPI.io API key | Yes |
| `TWITTERAPIIO_SEARCH_ENABLED` | backend | Enable TwitterAPI.io search | No (default: false) |
| `TWITTER_SERVICE_URL` | backend | Twitter microservice URL | Yes |
| `TWITTER_BEARER_TOKEN` | twitter-service | Twitter API v2 fallback | Yes |

### **Feature Flags**

- `TWITTERAPIIO_SEARCH_ENABLED=true`: Enables TwitterAPI.io search
- `TWITTERAPIIO_SEARCH_ENABLED=false`: Uses only Twitter API v2 fallback

## 🚀 Deployment Steps

### **1. Update twitter-service**
```bash
cd twitter-service
# Add TWITTERAPIIO_API_KEY to .env
# Deploy updated microservice
```

### **2. Update Backend**
```bash
# Add TWITTERAPIIO_SEARCH_ENABLED=true to .env
# Deploy updated backend
```

### **3. Test Integration**
```bash
node test-twitter-service-advanced-search.js
```

## 📈 Performance Benefits

### **Cost Comparison**
- **TwitterAPI.io**: $0.15 per 1,000 tweets
- **Twitter API v2**: $100 per 10,000 tweets (10x more expensive)

### **Reliability**
- **TwitterAPI.io**: No rate limits, more stable
- **Twitter API v2**: Rate limited, can fail during high usage

### **Data Quality**
- **TwitterAPI.io**: Better cashtag/hashtag search
- **Twitter API v2**: Limited search capabilities

## 🔍 Monitoring & Debugging

### **Logs to Monitor**
- `🔍 [TwitterAPI.io Search] Searching for token mentions: SYMBOL`
- `✅ [TwitterAPI.io Search] Found X tweets for SYMBOL`
- `⚠️ [TwitterAPI.io Search] Failed: error_message`
- `🔄 [TwitterAPI.io Search] Falling back to twitter-service microservice...`

### **Health Checks**
- Microservice health: `GET /health`
- Should show TwitterAPI.io key status
- Monitor for API errors and fallbacks

## 🎯 Migration Plan

### **Phase 1: Deploy Microservice** ✅
- [x] Add TwitterAPI.io endpoint to twitter-service
- [x] Update environment configuration
- [x] Test microservice endpoint

### **Phase 2: Update Backend** ✅
- [x] Update enhancedSocialDataService.js
- [x] Add TwitterAPI.io search strategy
- [x] Maintain fallback to Twitter API v2

### **Phase 3: Testing & Validation** ✅
- [x] Create comprehensive test script
- [x] Validate data transformation
- [x] Test error handling and fallbacks

### **Phase 4: Production Deployment**
- [ ] Deploy updated microservice
- [ ] Deploy updated backend
- [ ] Monitor performance and errors
- [ ] Gradual rollout with feature flag

## 🚨 Troubleshooting

### **Common Issues**

1. **"TwitterAPI.io API key not set"**
   - Ensure `TWITTERAPIIO_API_KEY` is set in twitter-service environment
   - Verify the API key is valid and active

2. **"TwitterAPI.io Search Failed"**
   - Check API key validity
   - Verify network connectivity to TwitterAPI.io
   - System will automatically fall back to Twitter API v2

3. **"No tweets found"**
   - Normal for new or low-volume tokens
   - System uses cached data or mock data as fallback
   - Check if token symbol is correct

### **Debug Commands**
```bash
# Test microservice health
curl https://dgo-2.onrender.com/health

# Test TwitterAPI.io endpoint directly
curl "https://dgo-2.onrender.com/api/twitter/advanced_search?query=($WIZI%20OR%20%23WIZI)&count=5"

# Run comprehensive test
node test-twitter-service-advanced-search.js
```

## 📚 Additional Resources

- **TwitterAPI.io Documentation**: [Advanced Search API](https://docs.twitterapi.io/)
- **Twitter API v2 Documentation**: [Search Tweets](https://developer.twitter.com/en/docs/twitter-api/tweets/search/introduction)
- **Microservice Architecture**: [FastAPI Documentation](https://fastapi.tiangolo.com/)

---

**🎉 Integration Complete!** The TwitterAPI.io advanced search is now fully integrated via the microservice architecture, providing more reliable and cost-effective tweet fetching for social health score calculations.
