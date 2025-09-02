# Twitter Microservice

A Python FastAPI microservice that provides Twitter data using web scraping with robust fallback mechanisms.

## Features

- 🔍 Search tweets by keyword using web scraping
- 👤 Get user tweets from profiles
- 📢 Search mentions of specific handles
- 📈 Get trending topics
- 🚀 FastAPI with automatic documentation
- 🔄 Robust error handling with multiple fallback levels
- 🔒 No API keys required - works with web scraping only
- ⚡ User agent rotation and retry logic for reliability

## No API Keys Required!

**This service works entirely through web scraping - no Twitter API credentials needed!**

The service includes:
- ✅ **Multiple fallback strategies** - if one method fails, others take over
- ✅ **User agent rotation** - avoids blocking by rotating browser signatures
- ✅ **Rate limiting protection** - built-in delays and retry logic
- ✅ **Mock data generation** - always returns valid responses even on failures

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
- `GET /api/twitter/search?q=keyword&count=20` - Search tweets
- `GET /api/twitter/user/{username}/tweets?count=20` - Get user tweets
- `GET /api/twitter/mentions/{handle}?count=10` - Search mentions
- `GET /api/twitter/trends` - Get trending topics

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

## Fallback Strategy

The service implements a **3-tier fallback system**:

1. **Primary**: Web scraping with multiple selectors and URLs
2. **Secondary**: Enhanced scraping with retry logic and user agent rotation
3. **Tertiary**: Mock data generation - **always returns valid responses**

### Response Sources:
- ✅ **`"source": "scraping"`** - Successfully scraped real data
- ✅ **`"source": "fallback"`** - Generated mock data due to scraping limitations
- ✅ **Structured JSON responses** - Consistent format regardless of source

### Anti-Blocking Features:
- 🔄 **User agent rotation** - Changes browser signature on each request
- ⏱️ **Rate limiting protection** - Built-in delays between requests
- 🔁 **Retry logic** - Automatic retries with exponential backoff
- 🎯 **Multiple selectors** - Tries different CSS selectors if one fails

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
