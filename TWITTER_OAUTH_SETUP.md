# Twitter OAuth Setup Instructions

## Step 1: Create a Twitter Developer App

1. Go to [Twitter Developer Portal](https://developer.twitter.com/en/portal/dashboard)
2. Sign in with your Twitter account
3. Create a new app or select an existing one
4. Navigate to "Settings" > "User authentication settings"

## Step 2: Configure OAuth Settings

Set up your app with these settings:

- **App permissions**: Read
- **Type of app**: Web App, Automated App or Bot
- **App info**:
  - **Callback URI**: `http://localhost:3001/auth/twitter/callback`
  - **Website URL**: `http://localhost:3000`
  - **Terms of service**: (optional)
  - **Privacy policy**: (optional)

## Step 3: Get Your Keys

After setting up OAuth, you'll get:
- **API Key** (Consumer Key)
- **API Key Secret** (Consumer Secret)

## Step 4: Set Environment Variables

Create a `.env` file in the `server` directory:

```bash
# Twitter OAuth Configuration
TWITTER_CONSUMER_KEY=your_twitter_consumer_key_here
TWITTER_CONSUMER_SECRET=your_twitter_consumer_secret_here
TWITTER_CALLBACK_URL=http://localhost:3001/auth/twitter/callback

# Session Configuration
SESSION_SECRET=your_super_secret_session_key_here
JWT_SECRET=your_jwt_secret_key_here

# Server Configuration
PORT=3001
FRONTEND_URL=http://localhost:3000
```

## Step 5: Test the Integration

1. Start the backend server: `cd server && npm start`
2. Start the frontend: `npm start`
3. Click "Login with X" button
4. You should be redirected to Twitter for authorization
5. After approval, you'll be redirected back to the app

## Features Included

### Authentication
- ✅ Twitter OAuth login/logout
- ✅ User session management
- ✅ JWT token generation
- ✅ User profile display

### Watchlist System
- ✅ Add/remove tokens from watchlist
- ✅ Check if token is favorited
- ✅ Persistent storage (in-memory for now)
- ✅ User-specific watchlists

### API Endpoints
- `GET /auth/twitter` - Start Twitter OAuth
- `GET /auth/twitter/callback` - OAuth callback
- `POST /auth/logout` - Logout user
- `GET /auth/user` - Get current user
- `GET /api/watchlist` - Get user's watchlist
- `POST /api/watchlist/add` - Add token to watchlist
- `POST /api/watchlist/remove` - Remove token from watchlist
- `GET /api/watchlist/check/:symbol` - Check if token is in watchlist
- `GET /api/admin/stats` - Get watchlist statistics

## Next Steps

1. **Add to TokenDetails**: Add favorite/unfavorite button to token details
2. **Watchlist View**: Create a dedicated watchlist page
3. **Database**: Replace in-memory storage with MongoDB/PostgreSQL
4. **Notifications**: Add alerts for watchlist tokens
5. **Portfolio**: Track user's actual holdings vs watchlist

## Security Notes

- Never commit `.env` files to version control
- Use strong, unique secrets for JWT and sessions
- In production, set `secure: true` for cookies (HTTPS only)
- Consider rate limiting for API endpoints

