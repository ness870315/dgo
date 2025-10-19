# Portfolio Analyzer Service

A comprehensive portfolio analysis service that scans user wallets, identifies SOL and LST holdings, and provides optimization insights for the AI Liquid Staking Router.

## 🎯 Overview

The Portfolio Analyzer Service provides:

- **Wallet Scanning**: Analyze SOL and token holdings via Moralis API
- **LST Identification**: Automatically identify Liquid Staking Tokens
- **Yield Calculation**: Calculate current portfolio yield
- **Optimization Insights**: Generate actionable recommendations
- **Risk Assessment**: Identify high-risk holdings and concentration

## 🏗️ Architecture

```
portfolio-analyzer/
├── PortfolioAnalyzerService.js    # Core portfolio analysis logic
├── PortfolioAnalyzerAPI.js        # REST API endpoints
├── index.js                       # Main service entry point
├── package.json                   # Dependencies
├── test-service.js                # Test script
└── README.md                      # Documentation
```

## 🚀 Features

### Wallet Analysis
- **SOL Balance**: Native SOL holdings and USD value
- **Token Holdings**: All SPL tokens with amounts and values
- **LST Detection**: Automatic identification of Liquid Staking Tokens
- **Price Integration**: Real-time token price fetching

### Yield Calculation
- **Current Yield**: Weighted average of SOL staking + LST yields
- **Optimal Comparison**: Compare against top-performing LSTs
- **Improvement Potential**: Calculate potential yield gains

### Optimization Insights
- **Unstacked SOL**: Identify SOL that could be earning yield
- **Low Yield LSTs**: Flag underperforming LST holdings
- **Concentration Risk**: Detect single-token LST exposure
- **High Risk LSTs**: Identify high-risk token holdings

### Caching System
- **5-minute cache**: Reduce API calls and improve performance
- **Cache management**: Clear cache for specific wallets or all
- **Cache statistics**: Monitor cache usage and performance

## 📊 Data Sources

### Moralis API Integration
- **SOL Balance**: `GET /account/mainnet/{address}/balance`
- **Token Balances**: `GET /account/mainnet/{address}/tokens`
- **Spam Filtering**: Automatic exclusion of spam tokens
- **Token Metadata**: Names, symbols, logos, verification status

### LST Registry Integration
- **LST Identification**: Cross-reference with LST registry
- **APR Data**: Real-time yield information
- **Risk Scores**: Multi-factor risk assessment
- **Verification Status**: Trusted vs unverified LSTs

## 🔧 Installation

1. **Install Dependencies**
   ```bash
   cd jupiter-service/services/portfolio-analyzer
   npm install
   ```

2. **Environment Setup**
   ```bash
   # Add to your .env file
   MORALIS_API_KEY=your_moralis_api_key
   PORTFOLIO_ANALYZER_PORT=3002
   ALLOWED_ORIGINS=http://localhost:3000,https://degen-oracle.com
   ```

3. **Start Service**
   ```bash
   npm start
   # or for development
   npm run dev
   ```

## 📡 API Usage

### Analyze Complete Portfolio
```bash
curl "http://localhost:3002/api/analyze/82ytegx28N1rhU7e4rxY8MKoCTmuyZcuctx8LJL87Un8"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "walletAddress": "82ytegx28N1rhU7e4rxY8MKoCTmuyZcuctx8LJL87Un8",
    "solBalance": {
      "lamports": "64880237",
      "sol": "0.064880237",
      "usdValue": 6.49
    },
    "lstHoldings": [
      {
        "mint": "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn",
        "symbol": "jitoSOL",
        "amount": "0.5",
        "usdValue": 50.0,
        "apr": 5.8,
        "riskScore": 3.2,
        "verified": true
      }
    ],
    "currentYield": 5.2,
    "totalValue": 56.49,
    "insights": [
      {
        "type": "opportunity",
        "priority": "high",
        "title": "Unstacked SOL Detected",
        "description": "You have 0.0649 SOL that could be earning yield",
        "recommendation": "Consider staking your SOL or converting to LSTs",
        "potentialGain": "0.32 USD/year"
      }
    ]
  }
}
```

### Get Portfolio Summary
```bash
curl "http://localhost:3002/api/summary/82ytegx28N1rhU7e4rxY8MKoCTmuyZcuctx8LJL87Un8"
```

### Compare to Optimal
```bash
curl "http://localhost:3002/api/compare/82ytegx28N1rhU7e4rxY8MKoCTmuyZcuctx8LJL87Un8"
```

### Cache Management
```bash
# Clear cache for specific wallet
curl -X DELETE "http://localhost:3002/api/cache/82ytegx28N1rhU7e4rxY8MKoCTmuyZcuctx8LJL87Un8"

# Clear all cache
curl -X DELETE "http://localhost:3002/api/cache"

# Get cache statistics
curl "http://localhost:3002/api/cache/stats"
```

## 🎯 Integration with AI Liquid Staking Router

This service provides the foundation for portfolio analysis:

### Portfolio Analysis Flow
1. **Wallet Scanning**: Identify current holdings
2. **LST Detection**: Find Liquid Staking Tokens
3. **Yield Calculation**: Calculate current portfolio yield
4. **Insight Generation**: Identify optimization opportunities
5. **Strategy Input**: Provide data for AI strategy generation

### Data Flow
```
User Wallet → Moralis API → Portfolio Analyzer → LST Registry → Insights
```

### Strategy Generation Input
```javascript
{
  currentYield: 5.2,           // Current portfolio yield
  totalValue: 56.49,           // Total portfolio value
  solBalance: 0.0649,          // Unstacked SOL
  lstHoldings: [...],          // Current LST positions
  insights: [...]              // Optimization opportunities
}
```

## 🔍 Monitoring

### Health Check
```bash
curl "http://localhost:3002/health"
```

### Service Status
```bash
curl "http://localhost:3002/"
```

## 🚨 Error Handling

The service includes comprehensive error handling:

- **Invalid Wallet Addresses**: Validation and error messages
- **Moralis API Failures**: Graceful fallback and retry logic
- **LST Registry Errors**: Fallback to default values
- **Cache Failures**: Continue without caching
- **Network Timeouts**: Configurable timeout handling

## 🔧 Configuration

Key configuration options:

```bash
# Service
PORTFOLIO_ANALYZER_PORT=3002
NODE_ENV=development

# Moralis API
MORALIS_API_KEY=your_api_key

# CORS
ALLOWED_ORIGINS=http://localhost:3000,https://degen-oracle.com

# Cache
CACHE_TIMEOUT_MS=300000  # 5 minutes
```

## 📈 Performance

- **Caching**: 5-minute cache reduces API calls
- **Parallel Processing**: Concurrent token processing
- **Error Resilience**: Graceful handling of API failures
- **Memory Management**: Efficient data structures

## 🔮 Future Enhancements

- **Historical Analysis**: Track portfolio performance over time
- **Advanced Insights**: Machine learning-based recommendations
- **DeFi Integration**: Include DeFi protocol positions
- **Social Features**: Portfolio sharing and comparison
- **Real-time Updates**: WebSocket support for live data

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
- Documentation: [Read the docs](https://docs.degen-oracle.com/portfolio-analyzer)
- Discord: [Join our community](https://discord.gg/degen-oracle)
