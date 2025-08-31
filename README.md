# DeGen Oracle - Solana Meme Coin Discovery Platform

A comprehensive platform for discovering and analyzing Solana meme coins with real-time data, scoring, and watchlist functionality.

## 🏗️ Project Structure (Production-Ready)

```
xtrend/
├── frontend/           # React.js frontend application
│   ├── src/           # React components and logic
│   ├── public/        # Static assets
│   └── package.json   # Frontend dependencies
├── backend/           # Node.js/Express API server
│   ├── *.js          # Backend services and API
│   └── package.json  # Backend dependencies
├── shared/            # Shared resources
│   ├── cache/        # Token cache and metadata
│   └── .env          # Environment variables
├── package.json       # Root package.json (monorepo)
└── README.md         # This file
```

## 🚀 Quick Start

### Option 1: Start Everything Together
```bash
# Install all dependencies
npm run install:all

# Start both frontend and backend
npm run start:all
```

### Option 2: Start Services Separately
```bash
# Terminal 1 - Backend
npm run start:backend

# Terminal 2 - Frontend  
npm run start:frontend
```

## 🔧 Development

### Frontend Development
```bash
cd frontend
npm start          # Start React dev server
npm run build      # Build for production
```

### Backend Development
```bash
cd backend
npm run dev        # Start with auto-reload
npm start          # Start production server
```

## 📊 Features

- **Token Discovery**: Real-time Solana meme coin data
- **Scoring System**: AI-powered token analysis and scoring
- **Watchlist**: Personal token tracking
- **Authentication**: Twitter OAuth + Demo login system
- **Token Listing**: Submit new tokens for discovery
- **Real-time Updates**: Live market data and social metrics

## 🌐 API Endpoints

- `GET /api/tokens` - Get all tokens
- `GET /api/tokens/:id` - Get specific token
- `POST /api/tokens/add-paid-token` - Add new token
- `GET /api/watchlist` - Get user watchlist
- `POST /api/watchlist/:tokenId` - Add to watchlist
- `DELETE /api/watchlist/:tokenId` - Remove from watchlist

## 🔐 Authentication

- **Twitter OAuth**: Full social login
- **Demo Mode**: Quick login for testing
- **Session Management**: Secure user sessions

## 💾 Data Sources

- **Bitquery**: Solana blockchain data
- **CoinGecko**: Market data (planned)
- **DexScreener**: DEX analytics (planned)
- **Social APIs**: Reddit, Twitter, Telegram sentiment

## 🚀 Production Deployment

### Docker (Recommended)
```bash
# Build and run with Docker Compose
docker-compose up --build
```

### Manual Deployment
```bash
# Backend
cd backend
npm install --production
npm start

# Frontend
cd frontend
npm install --production
npm run build
# Serve build/ directory with nginx/apache
```

## 📁 File Organization Benefits

✅ **Clear Separation**: Frontend and backend are completely separate
✅ **Independent Dependencies**: No more dependency conflicts
✅ **Easy Scaling**: Can deploy frontend and backend separately
✅ **Team Development**: Different teams can work on different services
✅ **Production Ready**: Proper structure for deployment
✅ **Easy Testing**: Test services independently
✅ **Clear API Boundaries**: Well-defined service interfaces

## 🔄 Migration from Old Structure

The old structure had everything mixed together, causing:
- ❌ Dependency conflicts
- ❌ Confusing startup process
- ❌ Hard to maintain
- ❌ Not production-ready

The new structure provides:
- ✅ Clean separation of concerns
- ✅ Independent service management
- ✅ Easy deployment and scaling
- ✅ Professional development workflow

## 📞 Support

For issues or questions, check the logs in each service directory or refer to the individual package.json files for specific service information.