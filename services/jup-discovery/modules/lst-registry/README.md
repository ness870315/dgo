# LST Registry Service

A comprehensive Liquid Staking Token (LST) registry service for Solana that provides real-time APR calculations, risk scoring, and liquidity analysis.

## 🎯 Overview

The LST Registry Service maintains a comprehensive database of all Liquid Staking Tokens on Solana, including:

- **Real-time APR calculations** from on-chain state
- **Risk scoring** based on TVL, validator distribution, and source verification
- **Liquidity analysis** for optimal staking strategies
- **Multi-source data aggregation** from Sanctum, Solana Compass, and GitHub

## 🏗️ Architecture

```
lst-registry/
├── services/
│   ├── LSTRegistryService.js      # Core LST data management
│   ├── LSTDatabaseService.js      # Database operations
│   └── LSTRegistryAPI.js          # REST API endpoints
├── models/
│   └── LSTModels.js               # MongoDB schemas
├── index.js                       # Main service entry point
└── package.json                   # Dependencies
```

## 🚀 Features

### Data Sources
- **Sanctum Registry**: Official LST standard and verified tokens
- **Solana Compass**: 199+ stake pools and validator data
- **GitHub Curated Lists**: Community-maintained LST lists

### Core Functionality
- **Automatic Sync**: Daily synchronization of LST data
- **APR Calculation**: Real-time yield calculations from stake pool state
- **Risk Assessment**: Multi-factor risk scoring (1-10 scale)
- **Liquidity Analysis**: Token supply and liquidity scoring
- **Search & Filtering**: Advanced query capabilities

### API Endpoints
- `GET /api/lsts` - Get all LSTs with filtering
- `GET /api/lsts/:mint` - Get specific LST by mint
- `GET /api/lsts/top/:limit` - Get top LSTs by APR
- `GET /api/lsts/low-risk/:maxRisk` - Get low-risk LSTs
- `GET /api/stats` - Get registry statistics
- `POST /api/sync` - Trigger manual sync

## 📊 Data Model

### LST Data Structure
```javascript
{
  mint: "string",           // Token mint address
  symbol: "string",         // Token symbol (e.g., "jitoSOL")
  name: "string",           // Full token name
  decimals: number,         // Token decimals
  description: "string",    // Token description
  website: "string",        // Official website
  logo: "string",           // Logo URL
  stakePool: "string",      // Stake pool address
  validator: "string",      // Validator address
  source: "string",         // Data source (sanctum/compass/github)
  verified: boolean,        // Verification status
  tvl: number,              // Total Value Locked
  apr: number,              // Annual Percentage Rate
  apy: number,              // Annual Percentage Yield
  riskScore: number,        // Risk score (1-10)
  liquidity: {              // Liquidity information
    totalSupply: number,
    estimatedLiquidity: number,
    liquidityScore: "string" // low/medium/high
  },
  lastUpdated: Date,        // Last update timestamp
  createdAt: Date           // Creation timestamp
}
```

## 🔧 Installation

1. **Install Dependencies**
   ```bash
   cd jupiter-service/services/lst-registry
   npm install
   ```

2. **Environment Setup**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Database Setup**
   ```bash
   # Ensure MongoDB is running
   mongod --dbpath /path/to/your/db
   ```

4. **Start Service**
   ```bash
   npm start
   # or for development
   npm run dev
   ```

## 📡 API Usage

### Get All LSTs
```bash
curl "http://localhost:3001/api/lsts?verified=true&minAPR=5.0&limit=10"
```

### Get Top LSTs by APR
```bash
curl "http://localhost:3001/api/lsts/top/5"
```

### Search LSTs
```bash
curl "http://localhost:3001/api/lsts/search/jito"
```

### Get Registry Statistics
```bash
curl "http://localhost:3001/api/stats"
```

## 🔄 Sync Process

The service automatically syncs LST data every 24 hours:

1. **Fetch Data**: Pull from Sanctum, Compass, and GitHub
2. **Merge & Dedupe**: Combine data sources with priority
3. **Calculate Metrics**: Compute APR, risk scores, liquidity
4. **Update Database**: Store processed data
5. **Log Results**: Track sync operations

### Manual Sync
```bash
curl -X POST "http://localhost:3001/api/sync" \
  -H "Content-Type: application/json" \
  -d '{"source": "all"}'
```

## 🎯 Integration with AI Liquid Staking Router

This service provides the foundation for the AI Liquid Staking Router:

- **Portfolio Analysis**: Scan user wallets for SOL and LST holdings
- **Strategy Generation**: Use LST data for optimal allocation recommendations
- **Risk Assessment**: Factor in risk scores for strategy decisions
- **Real-time Updates**: Ensure strategies use current APR data

## 🔍 Monitoring

### Health Check
```bash
curl "http://localhost:3001/health"
```

### Database Health
```bash
curl "http://localhost:3001/api/admin/health"
```

### Sync Logs
```bash
curl "http://localhost:3001/api/sync/logs?limit=20"
```

## 🚨 Error Handling

The service includes comprehensive error handling:

- **Network Failures**: Graceful fallback to cached data
- **Database Errors**: Automatic reconnection and retry logic
- **API Rate Limits**: Exponential backoff and retry mechanisms
- **Data Validation**: Schema validation and sanitization

## 🔧 Configuration

Key configuration options in `.env`:

```bash
# Server
LST_REGISTRY_PORT=3001
NODE_ENV=development

# Database
MONGODB_URI=mongodb://localhost:27017/lst-registry

# Solana
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com

# Sync
SYNC_INTERVAL_HOURS=24
APR_CACHE_TIMEOUT_MINUTES=60
```

## 📈 Performance

- **Caching**: APR data cached for 1 hour
- **Indexing**: Database indexes for efficient querying
- **Pagination**: Large result sets paginated
- **Rate Limiting**: API rate limiting to prevent abuse

## 🔮 Future Enhancements

- **Real-time Updates**: WebSocket support for live data
- **Advanced Analytics**: Historical performance tracking
- **Validator Analysis**: Deep validator distribution analysis
- **DeFi Integration**: Cross-protocol yield optimization
- **Social Features**: Community LST ratings and reviews

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details.

## 🆘 Support

For issues and questions:
- GitHub Issues: [Create an issue](https://github.com/your-repo/issues)
- Documentation: [Read the docs](https://docs.degen-oracle.com/lst-registry)
- Discord: [Join our community](https://discord.gg/degen-oracle)
