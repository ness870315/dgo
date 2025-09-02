# Twitter Microservice

A Python FastAPI microservice that provides Twitter data using Tweepy with fallback web scraping.

## Features

- 🔍 Search tweets by keyword (API or scraping fallback)
- 👤 Get user tweets
- 📢 Search mentions of specific handles
- 📈 Get trending topics
- 🚀 FastAPI with automatic documentation
- 🔄 Automatic fallback from API to web scraping
- 🔒 Environment-based configuration

## API Credentials (Optional but Recommended)

### Free Tier (Bearer Token Only)
1. Go to [Twitter Developer Portal](https://developer.twitter.com/en/portal/dashboard)
2. Create a new app or use existing
3. Get your **Bearer Token** from the app settings
4. Set environment variable: `TWITTER_BEARER_TOKEN=your_token_here`

### Paid Tier (Full OAuth - Optional)
If you want higher rate limits, also set:
```
TWITTER_API_KEY=your_api_key
TWITTER_API_SECRET=your_api_secret
TWITTER_ACCESS_TOKEN=your_access_token
TWITTER_ACCESS_TOKEN_SECRET=your_access_token_secret
```

**Note:** Without API credentials, the service will use web scraping as fallback mode.

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
| `TWITTER_BEARER_TOKEN` | Optional | Bearer token for free API access |
| `TWITTER_API_KEY` | Optional | API key for OAuth (paid tier) |
| `TWITTER_API_SECRET` | Optional | API secret for OAuth (paid tier) |
| `TWITTER_ACCESS_TOKEN` | Optional | Access token for OAuth (paid tier) |
| `TWITTER_ACCESS_TOKEN_SECRET` | Optional | Access token secret for OAuth (paid tier) |
| `PORT` | Optional | Server port (default: 8000) |

## Fallback Behavior

- **With API credentials**: Uses Twitter API v2 (fast, reliable, rate-limited)
- **Without API credentials**: Uses web scraping (slower, less reliable, but works)
- **API fails**: Automatically falls back to scraping
- **Both fail**: Returns structured error responses

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
