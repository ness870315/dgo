# Twitter Microservice

A Python FastAPI microservice that provides Twitter data using advanced scraping techniques with robust fallback mechanisms.

## Features

- 🐦 **Twint Integration** - Advanced Twitter scraping tool
- 🔍 Search tweets by keyword using multiple methods
- 👤 Get user tweets from profiles
- 📢 Search mentions of specific handles
- 📈 Get trending topics
- 🚀 FastAPI with automatic documentation
- 🔄 Robust error handling with multiple fallback levels
- 🔒 Works with or without Twitter API credentials
- ⚡ User agent rotation and retry logic for reliability

## Advanced Multi-Method Approach

**This service uses a 3-tier approach for maximum reliability:**

1. **🐦 Twint** - Advanced Twitter scraping tool (primary)
2. **🔑 Twitter API** - Official API when credentials available (secondary)
3. **🌐 Web Scraping** - Traditional scraping as fallback (tertiary)

The service includes:
- ✅ **Twint-powered scraping** - Most advanced Twitter scraping available
- ✅ **Twitter API integration** - Official data when available
- ✅ **Web scraping fallback** - Always works even without credentials
- ✅ **User agent rotation** - Avoids blocking by rotating browser signatures
- ✅ **Rate limiting protection** - Built-in delays and retry logic
- ✅ **Mock data generation** - Always returns valid responses even on failures

## Setup

### Local Development

1. **Install Python 3.11+**

2. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

3. **Set up environment variables:**
   ```bash
   cp env.example .env
   # Edit .env with your Twitter credentials
   ```

4. **Run the service:**
   ```bash
   python main.py
   ```

The service will be available at `http://localhost:8000`

### API Documentation

Once running, visit:
- **Interactive docs:** `http://localhost:8000/docs`
- **ReDoc:** `http://localhost:8000/redoc`

## API Endpoints

### Health Check
- `GET /health` - Service health status

### Twitter Endpoints
- `GET /api/twitter/search?q=keyword&count=20` - Search tweets (multi-method: Twint + API + Web)
- `GET /api/twitter/twint/search?q=keyword&count=20` - Search tweets using Twint only (for testing)
- `GET /api/twitter/user/{username}/tweets?count=20` - Get user tweets
- `GET /api/twitter/mentions/{handle}?count=10` - Search mentions
- `GET /api/twitter/trends` - Get trending topics

### Response Sources
- **`"source": "twint"`** - Data from Twint advanced scraping
- **`"source": "scraping"`** - Successfully scraped real data
- **`"source": "fallback"`** - Generated mock data due to limitations

## Deployment

### Render Deployment

1. **Create a new Web Service on Render**
2. **Connect your GitHub repository**
3. **Set the following:**
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `python main.py`
   - **Environment Variables:**
     - `TWITTER_USERNAME=your_username`
     - `TWITTER_EMAIL=your_email`
     - `TWITTER_PASSWORD=your_password`

### Docker Deployment

```bash
# Build image
docker build -t twitter-service .

# Run container with API credentials (recommended)
docker run -p 8000:8000 \
  -e TWITTER_BEARER_TOKEN=your_bearer_token \
  twitter-service

# Or run without credentials (scraping fallback mode)
docker run -p 8000:8000 twitter-service
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | Optional | Server port (default: 8000) |

## Advanced Fallback Strategy

The service implements a **4-tier fallback system** for maximum reliability:

1. **🐦 Primary**: Twint advanced Twitter scraping tool
2. **🔑 Secondary**: Twitter official API (when credentials available)
3. **🌐 Tertiary**: Enhanced web scraping with multiple strategies
4. **🎭 Quaternary**: Mock data generation - **always returns valid responses**

### Response Sources:
- ✅ **`"source": "twint"`** - Advanced Twint scraping results
- ✅ **`"source": "scraping"`** - Successfully scraped real data
- ✅ **`"source": "fallback"`** - Generated mock data due to limitations
- ✅ **Structured JSON responses** - Consistent format regardless of source

### Anti-Blocking Features:
- 🐦 **Twint evasion** - Advanced anti-detection techniques
- 🔄 **User agent rotation** - Changes browser signature on each request
- ⏱️ **Rate limiting protection** - Built-in delays and retry logic
- 🔁 **Retry logic** - Automatic retries with exponential backoff
- 🎯 **Multiple selectors** - Tries different CSS selectors if one fails
- 🎲 **Randomization** - Randomized delays and request patterns

## Security Notes

⚠️ **Important Security Considerations:**

1. **Never commit credentials to git**
2. **Use environment variables for all sensitive data**
3. **Consider using Twitter App Passwords if available**
4. **Enable 2FA on your Twitter account**
5. **Monitor for unusual login activity**

## Integration with Node.js Backend

Your Node.js backend can call this service:

```javascript
// Example: Search tweets
const response = await fetch('http://twitter-service:8000/api/twitter/search?q=bitcoin&count=10');
const data = await response.json();
```
