# 🤖 AI-Powered Trending Tokens Analysis API

## Overview

This API combines your trending token data with AI-powered analysis to provide **human-readable summaries** of why tokens are trending, including:

- 📊 **Real-time metrics** (price, market cap, volume, liquidity)
- 📰 **Latest news & catalysts** (via Perplexity real-time search)
- 🧠 **AI-generated summaries** (via OpenAI GPT-4)
- 🐦 **Social activity** (Twitter mentions, community engagement)
- 🐋 **Whale activity & market events**

---

## API Endpoints

### **GET /api/tokens/trending/ai-analysis**

Analyzes the top N trending tokens with AI-powered insights.

#### **Query Parameters:**

| Parameter | Type   | Default | Description                                    |
|-----------|--------|---------|------------------------------------------------|
| `limit`   | number | 10      | Number of tokens to analyze (max: 20)         |
| `format`  | string | `json`  | Response format: `json` or `text`             |

#### **Example Requests:**

```bash
# Get top 10 trending tokens (JSON)
GET https://api.degen-oracle.com/api/tokens/trending/ai-analysis?limit=10

# Get top 5 trending tokens (Text Report)
GET https://api.degen-oracle.com/api/tokens/trending/ai-analysis?limit=5&format=text

# Local development
GET http://localhost:3001/api/tokens/trending/ai-analysis?limit=10
```

---

## Response Formats

### **JSON Format (default)**

```json
{
  "success": true,
  "count": 10,
  "tokens": [
    {
      "rank": 1,
      "symbol": "WOJAK",
      "name": "Wojak",
      "contractAddress": "ABC123...",
      
      "price": 0.005523,
      "priceFormatted": "$0.005523",
      "marketCap": 5520000,
      "marketCapFormatted": "$5.52M",
      "volume24h": 2035877.68,
      "volume24hFormatted": "$2.04M",
      "liquidity": 177200,
      "liquidityFormatted": "$177.20K",
      
      "priceChange24h": 345.67,
      "priceChange24hFormatted": "+345.67%",
      
      "holders": 1234,
      "twitterMentions": 567,
      "overallScore": 8.5,
      
      "summary": "WOJAK has pumped 346% in 24h following massive whale accumulation and a viral Twitter campaign. Volume spiked to $2M with 567 mentions as degens ape in. The token's meme potential and strong community engagement are driving the momentum.",
      
      "news": "Recent developments show increased whale activity with large buy orders...",
      "citations": [
        "https://example.com/source1",
        "https://example.com/source2"
      ],
      
      "timestamp": "2025-11-14T12:00:00.000Z"
    }
    // ... more tokens
  ],
  "generatedAt": "2025-11-14T12:00:00.000Z"
}
```

### **Text Format**

```
🔥 TOP 10 TRENDING TOKENS 🔥
Generated: 11/14/2025, 12:00:00 PM
================================================================================

1. WOJAK (Wojak)
   💰 Price: $0.005523 (+345.67%)
   📊 Market Cap: $5.52M | Volume: $2.04M
   💧 Liquidity: $177.20K | Score: 8.5/10
   🐦 Twitter Mentions: 567 | Holders: 1234
   
   📝 WOJAK has pumped 346% in 24h following massive whale accumulation and a viral Twitter campaign. Volume spiked to $2M with 567 mentions as degens ape in. The token's meme potential and strong community engagement are driving the momentum.

2. USELESS (Useless Token)
   💰 Price: $0.000123 (+234.56%)
   📊 Market Cap: $1.23M | Volume: $890.12K
   💧 Liquidity: $45.67K | Score: 7.8/10
   🐦 Twitter Mentions: 234 | Holders: 890
   
   📝 USELESS mooned 235% after a surprise partnership announcement with a major DeFi protocol. Twitter went wild with 234 mentions as the community rallied. Strong buy pressure from whales suggests more upside potential.

...
```

---

## How It Works

### **Architecture:**

```
┌─────────────────────────────────────────────────────────────┐
│                      API REQUEST                            │
│  GET /api/tokens/trending/ai-analysis?limit=10              │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              STEP 1: Fetch Trending Tokens                  │
│  - Query internal /api/tokens/trending endpoint             │
│  - Get top N tokens with scores > 7.8                       │
│  - Includes price, volume, social metrics                   │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│         STEP 2: Perplexity Real-Time News Search            │
│  - For each token, search latest news (24-48h)              │
│  - Find catalysts: whale activity, partnerships, listings   │
│  - Get citations and sources                                │
│  - Parallel processing with rate limit handling             │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│           STEP 3: OpenAI Summary Generation                 │
│  - Combine token metrics + Perplexity news                  │
│  - Generate 2-3 sentence human-readable summary             │
│  - Use crypto slang (moon, pump, ape, degen, etc.)          │
│  - Explain WHY the token is trending                        │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                 STEP 4: Format Response                     │
│  - JSON: Structured data with all fields                    │
│  - Text: Human-readable report                              │
│  - Return to client                                         │
└─────────────────────────────────────────────────────────────┘
```

---

## Use Cases

### **1. Daily Trending Report**

Generate a daily email/newsletter with AI-analyzed trending tokens:

```javascript
const response = await fetch('https://api.degen-oracle.com/api/tokens/trending/ai-analysis?limit=10&format=text');
const report = await response.text();

// Send via email, Discord, Telegram, etc.
sendNewsletter(report);
```

### **2. Social Media Content**

Auto-generate Twitter threads about trending tokens:

```javascript
const response = await fetch('https://api.degen-oracle.com/api/tokens/trending/ai-analysis?limit=5');
const data = await response.json();

data.tokens.forEach(token => {
  const tweet = `🔥 ${token.symbol} is trending!\n\n${token.summary}\n\n💰 ${token.priceFormatted} (${token.priceChange24hFormatted})\n📊 MCap: ${token.marketCapFormatted}`;
  postToTwitter(tweet);
});
```

### **3. AI Chatbot Integration**

Provide trending insights to users via chatbot:

```javascript
// User asks: "What's trending today?"
const response = await fetch('https://api.degen-oracle.com/api/tokens/trending/ai-analysis?limit=5');
const data = await response.json();

const reply = data.tokens.map(t => `${t.rank}. ${t.symbol}: ${t.summary}`).join('\n\n');
chatbot.reply(reply);
```

### **4. Dashboard Widget**

Display AI-analyzed trending tokens in your app:

```javascript
const response = await fetch('https://api.degen-oracle.com/api/tokens/trending/ai-analysis?limit=10');
const data = await response.json();

// Render in React/Vue/etc.
<TrendingTokensWidget tokens={data.tokens} />
```

---

## Rate Limits & Performance

- **Rate Limit**: ~1 request per 10 seconds (due to Perplexity API calls)
- **Processing Time**: ~10-30 seconds for 10 tokens (parallel processing)
- **Cost per Request**: 
  - Perplexity: ~$0.001 per token (search)
  - OpenAI: ~$0.0001 per token (summary)
  - **Total**: ~$0.011 per 10-token analysis

**Recommendation**: Cache results for 5-10 minutes to reduce costs.

---

## Error Handling

### **Successful Response:**
```json
{
  "success": true,
  "count": 10,
  "tokens": [...]
}
```

### **Error Response:**
```json
{
  "error": "analysis_failed",
  "message": "Failed to analyze trending tokens"
}
```

### **Partial Failure:**
If some tokens fail to analyze, they'll still be included with basic data:
```json
{
  "rank": 5,
  "symbol": "TOKEN",
  "summary": "TOKEN is trending with +10.5% price change.",
  "error": "Analysis failed"
}
```

---

## Environment Variables

Required in `.env`:

```bash
# OpenAI (for summaries)
OPENAI_API_KEY=sk-...

# Perplexity (for news/catalysts)
PERPLEXITY_API_KEY=pplx-...

# API Base URL
API_BASE_URL=https://api.degen-oracle.com
```

---

## Testing

Run the test file to see the API in action:

```bash
cd backend
node test-trending-ai-analysis.js
```

Expected output:
```
🚀 Testing AI-Powered Trending Tokens Analysis...
================================================================================

📊 TEST 1: JSON Format (Top 5 tokens)

✅ Success: 5 tokens analyzed
⏰ Generated at: 2025-11-14T12:00:00.000Z

1. WOJAK (Wojak)
   💰 Price: $0.005523 (+345.67%)
   📊 Market Cap: $5.52M | Volume: $2.04M
   ...
```

---

## Future Enhancements

- [ ] Add caching layer (Redis) to reduce API costs
- [ ] Support custom time ranges (1h, 6h, 24h trending)
- [ ] Add sentiment analysis from Twitter data
- [ ] Include on-chain metrics (whale transactions, holder changes)
- [ ] Support multiple output formats (Markdown, HTML)
- [ ] Add webhook support for real-time alerts

---

## Support

For questions or issues, contact the development team or open an issue on GitHub.

**Built with ❤️ by the Degen Oracle team**

