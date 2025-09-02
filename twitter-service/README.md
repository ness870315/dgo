# Twitter Microservice

A Python FastAPI microservice that provides Twitter data using Twikit (no API key required).

## Features

- 🔍 Search tweets by keyword
- 👤 Get user tweets
- 📢 Search mentions of specific handles
- 📈 Get trending topics
- 🚀 FastAPI with automatic documentation
- 🔒 Environment-based configuration

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

# Run container
docker run -p 8000:8000 \
  -e TWITTER_USERNAME=your_username \
  -e TWITTER_EMAIL=your_email \
  -e TWITTER_PASSWORD=your_password \
  twitter-service
```

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
