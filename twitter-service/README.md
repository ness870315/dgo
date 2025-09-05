# Twitter Microservice

A Python FastAPI microservice that provides Twitter data using the official Twitter v2 API with Bearer token authentication.

## Features

- 🔑 **Twitter v2 API Integration** - Official API with Bearer token
- 🔍 Search tweets by keyword
- 👤 Get user tweets from profiles
- 📢 Search mentions of specific handles
- 🚀 FastAPI with automatic documentation
- 📊 Request/response logging for monitoring
- 🔄 Robust error handling with mock data fallbacks
- ⚡ Rate limit awareness and proper API compliance

The service includes:
- ✅ **Twitter v2 API** - Official API with Bearer token authentication
- ✅ **Request logging** - HTTP status and timing for monitoring
- ✅ **Mock data fallback** - Returns valid responses when API unavailable
- ✅ **Rate limit compliance** - Proper API rate limit handling
- ✅ **Structured responses** - Consistent JSON format

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
   # Edit .env with your Twitter Bearer token
   ```

   **Required Environment Variable:**
   ```bash
   TWITTER_BEARER_TOKEN=your_bearer_token_here
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
- `GET /api/twitter/search?q=keyword&count=20` - Search tweets using Twitter v2 API
- `GET /api/twitter/user/{username}/tweets?count=20` - Get user tweets
- `GET /api/twitter/mentions/{handle}?count=10` - Search mentions

### Response Sources
- **`"source": "twitter_api_v2"`** - Data from official Twitter API
- **`"source": "mock_data"`** - Generated mock data when API unavailable

## Deployment

### Render Deployment

1. **Create a new Web Service on Render**
2. **Connect your GitHub repository**
3. **Set the following:**
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `python main.py`
   - **Environment Variables:**
     - `TWITTER_BEARER_TOKEN=your_bearer_token_here`

### Docker Deployment

```bash
# Build image
docker build -t twitter-service .

# Run container with Twitter Bearer token
docker run -p 8000:8000 \
  -e TWITTER_BEARER_TOKEN=your_bearer_token_here \
  twitter-service
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `TWITTER_BEARER_TOKEN` | Required | Twitter v2 API Bearer token |
| `PORT` | Optional | Server port (default: 8000) |

## API Integration

The service uses **Twitter v2 API** with Bearer token authentication:

### Response Sources:
- ✅ **`"source": "twitter_api_v2"`** - Official Twitter API data
- ✅ **`"source": "mock_data"`** - Generated mock data when API unavailable
- ✅ **Structured JSON responses** - Consistent format

### Features:
- 🔑 **Bearer token authentication** - Official API access
- 📊 **Request logging** - HTTP status and timing monitoring
- ⚡ **Rate limit compliance** - Proper API usage limits
- 🔄 **Error handling** - Graceful fallbacks with mock data

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
