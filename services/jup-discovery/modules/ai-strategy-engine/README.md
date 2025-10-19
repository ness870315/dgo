# AI Strategy Engine Service

An AI-powered strategy generation service that uses GPT-4 to analyze portfolios and generate optimal Liquid Staking Token (LST) allocation strategies for the AI Liquid Staking Router.

## 🎯 Overview

The AI Strategy Engine Service provides:

- **GPT-4 Integration**: AI-powered strategy generation using OpenAI's GPT-4
- **Portfolio Analysis**: Intelligent analysis of current holdings and yield
- **Strategy Types**: Basic and Advanced optimization strategies
- **Risk Assessment**: Risk-adjusted allocation recommendations
- **Execution Planning**: Detailed action plans for strategy implementation

## 🏗️ Architecture

```
ai-strategy-engine/
├── AIStrategyEngineService.js    # Core AI strategy generation logic
├── AIStrategyEngineAPI.js        # REST API endpoints
├── index.js                      # Main service entry point
├── package.json                  # Dependencies
├── test-service.js               # Test script
└── README.md                     # Documentation
```

## 🚀 Features

### AI-Powered Strategy Generation
- **GPT-4 Integration**: Uses OpenAI's GPT-4 for intelligent strategy generation
- **Context-Aware**: Analyzes portfolio, available LSTs, and user preferences
- **Prompt Engineering**: Specialized prompts for DeFi strategy optimization
- **Fallback Logic**: Rule-based fallback if AI fails

### Strategy Types
- **Basic Strategy + Execution ($1.20)**: Top 3 LSTs by APR with simple allocation + execution
- **Advanced Strategy + Execution ($2.00)**: Risk-adjusted optimization with diversification + execution

### Portfolio Analysis Integration
- **Current Holdings**: Analyzes existing SOL and LST positions
- **Yield Calculation**: Calculates current portfolio yield
- **Optimization Opportunities**: Identifies improvement potential
- **Risk Assessment**: Evaluates current risk exposure

### Strategy Validation
- **Allocation Validation**: Ensures percentages sum to ~100%
- **Amount Validation**: Verifies amounts are within portfolio limits
- **Risk Validation**: Checks risk scores are within acceptable ranges
- **Safety Checks**: Prevents invalid or dangerous strategies

## 📊 Data Sources

### OpenAI GPT-4 Integration
- **Model**: GPT-4 for advanced reasoning
- **Temperature**: 0.7 for balanced creativity and consistency
- **Max Tokens**: 2000 for detailed responses
- **Timeout**: 30 seconds for API calls

### Portfolio Data Integration
- **Portfolio Analyzer**: Current holdings and yield analysis
- **LST Registry**: Available LSTs with APR and risk data
- **User Preferences**: Risk tolerance, minimum APR, diversification

## 🔧 Installation

1. **Install Dependencies**
   ```bash
   cd jupiter-service/services/ai-strategy-engine
   npm install
   ```

2. **Environment Setup**
   ```bash
   # Add to your .env file
   OPENAI_API_KEY=your_openai_api_key
   OPENAI_BASE_URL=https://api.openai.com/v1
   OPENAI_MODEL=gpt-4
   AI_STRATEGY_ENGINE_PORT=3003
   ALLOWED_ORIGINS=http://localhost:3000,https://degen-oracle.com
   ```

3. **Start Service**
   ```bash
   npm start
   # or for development
   npm run dev
   ```

## 📡 API Usage

### Generate AI Strategy and Build Transactions (Bundled)
```bash
curl -X POST "http://localhost:3003/api/generate-and-build" \
  -H "Content-Type: application/json" \
  -d '{
    "walletAddress": "82ytegx28N1rhU7e4rxY8MKoCTmuyZcuctx8LJL87Un8",
    "strategyType": "basic",
    "userPreferences": {
      "maxRisk": 6.0,
      "minAPR": 4.5,
      "diversification": "medium"
    }
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "strategy": {
      "id": "strategy_1703123456789_abc123",
      "type": "basic",
      "name": "High Yield LST Strategy",
      "description": "Optimized allocation across top-performing LSTs",
      "expectedYield": 6.2,
      "currentYield": 5.1,
      "improvement": 1.1,
      "riskScore": 4.8,
      "allocation": [
        {
          "symbol": "jitoSOL",
          "name": "Jito Staked SOL",
          "percentage": 50,
          "amount": 28.25,
          "apr": 5.8,
          "riskScore": 3.2,
          "reasoning": "High APR with low risk"
        }
      ],
      "actions": [
        {
          "type": "swap",
          "from": "SOL",
          "to": "jitoSOL",
          "amount": 28.25,
          "reasoning": "Convert unstacked SOL to high-yield LST"
        }
      ],
      "risks": [
        "Validator slashing risk",
        "Liquidity risk",
        "Market volatility"
      ],
      "benefits": [
        "Higher yield than current portfolio",
        "Diversified exposure across multiple LSTs",
        "Automated optimization"
      ],
      "cost": 1.20,
      "generatedAt": "2024-01-01T12:00:00.000Z"
    },
    "transactions": {
      "strategyId": "strategy_1703123456789_abc123",
      "strategyName": "High Yield LST Strategy",
      "userWallet": "82ytegx28N1rhU7e4rxY8MKoCTmuyZcuctx8LJL87Un8",
      "transactionCount": 1,
      "bundledTransaction": "base64_encoded_transaction",
      "estimatedGasCost": {
        "sol": 0.001,
        "usd": 0.10
      },
      "slippageProtection": 50,
      "createdAt": "2024-01-01T12:00:00.000Z"
    },
    "payment": {
      "required": true,
      "amount": 1.20,
      "currency": "USDC",
      "endpoint": "https://api.degen-oracle.com/api/x402/execute-strategy/strategy_1703123456789_abc123",
      "description": "Basic Strategy + Execution - Complete optimization"
    },
    "execution": {
      "transactionCount": 1,
      "estimatedGasCost": {
        "sol": 0.001,
        "usd": 0.10
      },
      "slippageProtection": 50,
      "readyToExecute": true
    },
    "createdAt": "2024-01-01T12:00:00.000Z"
  }
}
```

### Generate AI Strategy
```bash
curl -X POST "http://localhost:3003/api/generate" \
  -H "Content-Type: application/json" \
  -d '{
    "walletAddress": "82ytegx28N1rhU7e4rxY8MKoCTmuyZcuctx8LJL87Un8",
    "strategyType": "basic",
    "userPreferences": {
      "maxRisk": 6.0,
      "minAPR": 4.5,
      "diversification": "medium"
    }
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "strategy_1703123456789_abc123",
    "type": "basic",
    "name": "High Yield LST Strategy",
    "description": "Optimized allocation across top-performing LSTs",
    "expectedYield": 6.2,
    "currentYield": 5.1,
    "improvement": 1.1,
    "riskScore": 4.8,
    "allocation": [
      {
        "symbol": "jitoSOL",
        "name": "Jito Staked SOL",
        "percentage": 50,
        "amount": 28.25,
        "apr": 5.8,
        "riskScore": 3.2,
        "reasoning": "High APR with low risk"
      },
      {
        "symbol": "mSOL",
        "name": "Marinade Staked SOL",
        "percentage": 30,
        "amount": 16.95,
        "apr": 5.6,
        "riskScore": 4.1,
        "reasoning": "Established LST with good liquidity"
      },
      {
        "symbol": "bSOL",
        "name": "BlazeStake Staked SOL",
        "percentage": 20,
        "amount": 11.3,
        "apr": 5.9,
        "riskScore": 4.5,
        "reasoning": "Highest APR in portfolio"
      }
    ],
    "actions": [
      {
        "type": "swap",
        "from": "SOL",
        "to": "jitoSOL",
        "amount": 28.25,
        "reasoning": "Convert unstacked SOL to high-yield LST"
      }
    ],
    "risks": [
      "Validator slashing risk",
      "Liquidity risk",
      "Market volatility"
    ],
    "benefits": [
      "Higher yield than current portfolio",
      "Diversified exposure across multiple LSTs",
      "Automated optimization"
    ],
    "cost": 1.20,
    "generatedAt": "2024-01-01T12:00:00.000Z"
  }
}
```

### Get Strategy Types
```bash
curl "http://localhost:3003/api/types"
```

### Get Strategy by ID
```bash
curl "http://localhost:3003/api/strategy/strategy_1703123456789_abc123"
```

### Cache Management
```bash
# Clear strategy cache
curl -X DELETE "http://localhost:3003/api/cache"

# Get cache statistics
curl "http://localhost:3003/api/cache/stats"
```

## 🎯 Integration with AI Liquid Staking Router

This service provides the core strategy generation for the router:

### Strategy Generation Flow
1. **Portfolio Analysis**: Analyze current holdings via Portfolio Analyzer
2. **LST Data**: Get available LSTs from LST Registry
3. **AI Generation**: Use GPT-4 to generate optimal strategy
4. **Validation**: Validate strategy safety and feasibility
5. **Execution Plan**: Generate detailed action steps

### Strategy Types Integration
```javascript
// Basic Strategy ($0.20)
{
  strategyType: 'basic',
  maxLSTs: 3,
  complexity: 'low',
  price: 0.20
}

// Advanced Strategy ($0.50)
{
  strategyType: 'advanced',
  maxLSTs: 5,
  complexity: 'high',
  price: 0.50
}
```

### User Preferences
```javascript
{
  maxRisk: 6.0,           // Maximum risk tolerance (1-10)
  minAPR: 4.5,            // Minimum APR requirement
  diversification: 'medium' // low/medium/high
}
```

## 🔍 Monitoring

### Health Check
```bash
curl "http://localhost:3003/health"
```

### Service Status
```bash
curl "http://localhost:3003/"
```

## 🚨 Error Handling

The service includes comprehensive error handling:

- **OpenAI API Failures**: Fallback to rule-based strategies
- **Invalid Inputs**: Validation and error messages
- **Strategy Validation**: Safety checks and corrections
- **Cache Failures**: Continue without caching
- **Network Timeouts**: Configurable timeout handling

## 🔧 Configuration

Key configuration options:

```bash
# Service
AI_STRATEGY_ENGINE_PORT=3003
NODE_ENV=development

# OpenAI
OPENAI_API_KEY=your_api_key
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4

# CORS
ALLOWED_ORIGINS=http://localhost:3000,https://degen-oracle.com

# Cache
CACHE_TIMEOUT_MS=600000  # 10 minutes
```

## 📈 Performance

- **Caching**: 10-minute cache reduces API calls
- **Fallback Logic**: Rule-based strategies if AI fails
- **Validation**: Prevents invalid strategies
- **Error Resilience**: Graceful handling of failures

## 🔮 Future Enhancements

- **Strategy History**: Track strategy performance over time
- **Machine Learning**: Learn from user preferences and outcomes
- **Advanced Analytics**: DeFi protocol integration
- **Social Features**: Strategy sharing and community insights
- **Real-time Updates**: WebSocket support for live strategies

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
- Documentation: [Read the docs](https://docs.degen-oracle.com/ai-strategy-engine)
- Discord: [Join our community](https://discord.gg/degen-oracle)
