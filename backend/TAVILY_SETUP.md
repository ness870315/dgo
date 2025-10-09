# Tavily Web Search Setup for Degen Oracle

## What is Tavily?

Tavily is a real-time web search API optimized for AI applications. It provides:
- ✅ Real-time web search results
- ✅ Clean, structured data (title, URL, snippet)
- ✅ Fast response times (<1s)
- ✅ Free tier: 1,000 searches/month
- ✅ Better for crypto/news than Google (less censorship)

## Why We Need It

GPT-5 **cannot** use `web_search` as a tool type in the Chat Completions API. Instead, we implement web search using **function calling**:

1. GPT-5 decides it needs to search the web
2. Calls our `search_web` function
3. We fetch results from Tavily
4. GPT-5 synthesizes the answer with real-time context

## Setup Instructions

### 1. Get Tavily API Key

1. Go to https://tavily.com/
2. Sign up (free account)
3. Get your API key from the dashboard
4. Free tier: 1,000 searches/month (more than enough for 4 tweets/day)

### 2. Add to Environment Variables

**Local (.env file):**
```bash
TAVILY_API_KEY=tvly-xxxxxxxxxxxxxxxxxxxxxx
```

**Production (Render):**
1. Go to Render dashboard
2. Select your backend service
3. Environment → Add `TAVILY_API_KEY`
4. Value: `tvly-xxxxxxxxxxxxxxxxxxxxxx`
5. Save (will auto-redeploy)

### 3. Verify It Works

The service will log:
```
🔍 AI is searching the web for: "latest news about $RFC token"
✅ Found 5 web sources for: "latest news about $RFC token"
```

If API key is missing, it gracefully falls back:
```
⚠️ Tavily API key not configured, skipping web search
```

## How It Works

### Before (BROKEN):
```javascript
requestParams.tools = [{
  type: 'web_search',  // ❌ Not supported in Chat Completions API
  web_search: { enabled: true }
}];
```

### After (WORKING):
```javascript
// Step 1: Define search_web as a function tool
requestParams.tools = [{
  type: 'function',
  function: {
    name: 'search_web',
    description: 'Search the web for real-time information',
    parameters: { query: { type: 'string' } }
  }
}];

// Step 2: GPT-5 calls the function
// { "name": "search_web", "arguments": '{"query": "RFC token news"}' }

// Step 3: We call Tavily API
const results = await fetch('https://api.tavily.com/search', { ... });

// Step 4: Return results to GPT-5
messages.push({
  role: 'tool',
  content: JSON.stringify({ sources: results })
});

// Step 5: GPT-5 generates final answer with web context
```

## Pricing

| Plan | Searches/Month | Price | Notes |
|------|----------------|-------|-------|
| Free | 1,000 | $0 | Perfect for 4 tweets/day (~120/month) |
| Pro | 10,000 | $99 | If we scale to 30+ tweets/day |

## Alternatives (if needed)

If Tavily doesn't work, we can use:
- **SerpAPI** - Google search results ($50/month for 5K searches)
- **Bing Search API** - Microsoft ($7/1K searches)
- **Google Custom Search** - Limited free tier, then $5/1K searches

But Tavily is the best for crypto/real-time news.

## Testing

```bash
# Local test
TAVILY_API_KEY=tvly-xxx npm run dev

# Trigger a tweet manually (in admin dashboard)
# Check logs for: "🔍 AI is searching the web for..."
```

## Benefits

✅ **Real-time context**: Token news, partnerships, listings  
✅ **Better tweets**: "Just announced partnership with..." instead of generic  
✅ **Humor**: "Gary Gensler woke up and chose violence" (knows what's trending)  
✅ **Timely memes**: Market-aware jokes about today's dumps/pumps  

Without web search, tweets would be based on static data only (volume, price) with no context about WHY things are moving.

