# 🚀 TwitterAPI.io Advanced Search Integration Guide

## 📋 Overview

This guide covers the integration of TwitterAPI.io's `advanced_search` endpoint into the DeGen Oracle social health score calculation system. The new integration provides more reliable and cost-effective tweet fetching for token mentions.

## 🎯 Key Benefits

- ✅ **Cashtag/Hashtag OR Queries**: `($wizi OR #wizi)` syntax
- ✅ **Latest Tweets**: `queryType=Latest` parameter  
- ✅ **Content Filtering**: Include `quoted_tweet` and `tweet`, filter out `retweeted_tweet`
- ✅ **Up to 20 tweets per request**: Perfect for our needs
- ✅ **No rate limits**: More reliable than Twitter API v2
- ✅ **Cost-effective**: $0.15/1k tweets vs Twitter API v2 costs

## 🔧 Implementation Details

### **Phase 1: New Service Created** ✅

**File**: `backend/services/TwitterAPIioSearchService.js`

**Key Features**:
- Advanced search endpoint integration
- Cashtag/hashtag OR query support
- Content type filtering
- Data transformation for compatibility
- Health checking and usage stats

### **Phase 2: Integration Complete** ✅

**File**: `backend/enhancedSocialDataService.js`

**Integration Points**:
- Primary source: TwitterAPI.io advanced_search
- Fallback: Existing twitter-service microservice
- Feature flag: `TWITTERAPIIO_SEARCH_ENABLED=true`

## 🚀 Quick Start

### 1. Environment Setup

Add to your `.env` file:

```bash
# TwitterAPI.io Configuration
TWITTERAPIIO_API_KEY=your_api_key_here
TWITTERAPIIO_SEARCH_ENABLED=true
```

### 2. Test the Integration

```bash
# Run the test script
node test-twitterapiio-search.js
```

### 3. Enable in Production

Set the environment variable:
```bash
export TWITTERAPIIO_SEARCH_ENABLED=true
```

## 📊 API Endpoint Details

### **Endpoint**: `https://api.twitterapi.io/twitter/tweet/advanced_search`

### **Example Query**:
```javascript
const url = 'https://api.twitterapi.io/twitter/tweet/advanced_search?queryType=Latest&query=%24wizi%20OR%20%23wizi';
const options = {
  method: 'GET',
  headers: {'X-API-Key': 'your_api_key'},
  body: undefined
};
```

### **Response Schema**:
```json
{
  "tweets": [
    {
      "type": "tweet",
      "id": "string",
      "text": "string",
      "author": {
        "userName": "string",
        "name": "string",
        "followers": 123
      },
      "retweetCount": 123,
      "likeCount": 123,
      "replyCount": 123,
      "createdAt": "string"
    }
  ],
  "has_next_page": true,
  "next_cursor": "string"
}
```

## 🔄 Migration Flow

### **Current Flow** (Fallback):
```
EnhancedSocialDataService → twitter-service microservice → Twitter API v2
```

### **New Flow** (Primary):
```
EnhancedSocialDataService → TwitterAPIioSearchService → TwitterAPI.io advanced_search
                                    ↓ (fallback)
                         twitter-service microservice → Twitter API v2
```

## 📈 Performance Comparison

| Metric | Twitter API v2 | TwitterAPI.io |
|--------|----------------|---------------|
| **Rate Limits** | 300 requests/15min | No limits |
| **Cost** | $100/month+ | $0.15/1k tweets |
| **Query Syntax** | Complex | Simple OR queries |
| **Content Filtering** | Limited | Advanced |
| **Reliability** | Variable | High |

## 🧪 Testing

### **Test Script**: `test-twitterapiio-search.js`

**Test Coverage**:
1. ✅ Service health check
2. ✅ Token mention search ($WIZI)
3. ✅ Data transformation
4. ✅ User mention search (@dgnoracle)
5. ✅ Usage statistics

### **Run Tests**:
```bash
# Set your API key
export TWITTERAPIIO_API_KEY=your_api_key_here

# Run tests
node test-twitterapiio-search.js
```

## 🔧 Configuration Options

### **Environment Variables**:

```bash
# Required
TWITTERAPIIO_API_KEY=your_api_key_here

# Optional (defaults)
TWITTERAPIIO_SEARCH_ENABLED=true
```

### **Service Configuration**:

```javascript
// Default search parameters
{
  queryType: 'Latest',
  contentTypes: 'quoted_tweet,tweet',
  excludeRetweets: true,
  count: 20
}
```

## 🚨 Troubleshooting

### **Common Issues**:

1. **API Key Not Set**
   ```
   Error: TwitterAPI.io API key is required for search service
   Solution: Set TWITTERAPIIO_API_KEY environment variable
   ```

2. **Service Health Check Fails**
   ```
   Error: Service unhealthy
   Solution: Check API key validity and network connectivity
   ```

3. **No Tweets Found**
   ```
   Warning: No tweets found via TwitterAPI.io
   Solution: System automatically falls back to twitter-service microservice
   ```

### **Debug Logs**:

Enable detailed logging:
```bash
# Set debug level
export DEBUG=twitterapiio:*
```

## 📊 Monitoring

### **Health Check Endpoint**:
```javascript
const health = await searchService.getServiceHealth();
console.log('Service Status:', health.available ? 'Healthy' : 'Unhealthy');
```

### **Usage Statistics**:
```javascript
const stats = await searchService.getUsageStats();
console.log('Pricing:', stats.pricing);
console.log('Features:', stats.features);
```

## 🔄 Rollback Plan

If issues occur, disable TwitterAPI.io search:

```bash
# Disable TwitterAPI.io search
export TWITTERAPIIO_SEARCH_ENABLED=false

# System will automatically use twitter-service microservice fallback
```

## 📞 Support

- **TwitterAPI.io Docs**: https://docs.twitterapi.io
- **API Pricing**: $0.15 per 1,000 tweets
- **Support**: Contact TwitterAPI.io support for API issues

---

## ✅ Integration Checklist

- [x] TwitterAPIioSearchService.js created
- [x] EnhancedSocialDataService.js integrated
- [x] Feature flag implemented
- [x] Fallback mechanism added
- [x] Test script created
- [x] Documentation completed
- [ ] Production deployment
- [ ] Monitoring setup
- [ ] Performance validation
