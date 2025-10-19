# Transaction Builder Service

A comprehensive transaction building service that creates and bundles Solana transactions for executing AI-generated Liquid Staking Token (LST) strategies. Integrates with Jupiter for swaps and Sanctum for staking operations.

## 🎯 Overview

The Transaction Builder Service provides:

- **Jupiter Integration**: SOL ↔ LST swaps with optimal routing
- **Sanctum Integration**: Direct staking operations
- **Transaction Bundling**: Combine multiple operations into single transaction
- **ATA Management**: Automatic Associated Token Account creation
- **Slippage Protection**: Configurable slippage tolerance
- **Gas Optimization**: Efficient transaction building and fee estimation

## 🏗️ Architecture

```
transaction-builder/
├── TransactionBuilderService.js    # Core transaction building logic
├── TransactionBuilderAPI.js        # REST API endpoints
├── index.js                        # Main service entry point
├── package.json                    # Dependencies
├── test-service.js                 # Test script
└── README.md                       # Documentation
```

## 🚀 Features

### Jupiter Integration
- **Quote API**: Get optimal swap routes and prices
- **Swap API**: Build swap transactions with slippage protection
- **Route Optimization**: Multi-hop routing for best prices
- **Slippage Control**: Configurable slippage tolerance (default 0.5%)

### Sanctum Integration
- **Staking Operations**: Direct SOL staking to LSTs
- **Router Integration**: Use Sanctum Router for optimal staking
- **Validator Selection**: Intelligent validator distribution

### Transaction Building
- **Instruction Bundling**: Combine multiple operations
- **ATA Creation**: Automatic Associated Token Account setup
- **Gas Estimation**: Accurate fee calculation
- **Size Validation**: Ensure transactions fit in Solana limits

### Safety Features
- **Balance Validation**: Check sufficient SOL for fees
- **Transaction Validation**: Verify transaction integrity
- **Slippage Protection**: Prevent excessive price impact
- **Error Handling**: Graceful failure recovery

## 📊 Data Sources

### Jupiter API Integration
- **Quote Endpoint**: `https://quote-api.jup.ag/v6/quote`
- **Swap Endpoint**: `https://quote-api.jup.ag/v6/swap`
- **Token List**: `https://quote-api.jup.ag/v6/tokens`

### Sanctum Integration
- **Router API**: `https://api.sanctum.so/v1`
- **Staking Operations**: Direct validator staking
- **LST Management**: Liquid staking token operations

### Solana Integration
- **Web3.js**: Transaction building and signing
- **SPL Token**: Token account management
- **RPC Connection**: Mainnet/Devnet support

## 🔧 Installation

1. **Install Dependencies**
   ```bash
   cd jupiter-service/services/transaction-builder
   npm install
   ```

2. **Environment Setup**
   ```bash
   # Add to your .env file
   SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
   TRANSACTION_BUILDER_PORT=3004
   ALLOWED_ORIGINS=http://localhost:3000,https://degen-oracle.com
   ```

3. **Start Service**
   ```bash
   npm start
   # or for development
   npm run dev
   ```

## 📡 API Usage

### Build Bundled Transaction (Single Transaction Approach)
```bash
curl -X POST "http://localhost:3004/api/build-bundled" \
  -H "Content-Type: application/json" \
  -d '{
    "strategy": {
      "id": "strategy_123",
      "name": "High Yield Strategy",
      "actions": [
        {
          "type": "swap",
          "from": "SOL",
          "to": "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn",
          "amount": 1.0,
          "reasoning": "Convert SOL to jitoSOL"
        }
      ]
    },
    "userWallet": "82ytegx28N1rhU7e4rxY8MKoCTmuyZcuctx8LJL87Un8"
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "strategyId": "strategy_123",
    "strategyName": "High Yield Strategy",
    "userWallet": "82ytegx28N1rhU7e4rxY8MKoCTmuyZcuctx8LJL87Un8",
    "transactionCount": 1,
    "bundledTransaction": "base64_encoded_transaction",
    "totalInstructions": 3,
    "estimatedGasCost": {
      "sol": 0.001,
      "usd": 0.10
    },
    "slippageProtection": 50,
    "createdAt": "2024-01-01T12:00:00.000Z",
    "execution": {
      "readyToExecute": true,
      "singleTransaction": true,
      "requiresSignature": true
    }
  }
}
```

### Build Strategy Transactions
```bash
curl -X POST "http://localhost:3004/api/build" \
  -H "Content-Type: application/json" \
  -d '{
    "strategy": {
      "id": "strategy_123",
      "name": "High Yield Strategy",
      "actions": [
        {
          "type": "swap",
          "from": "SOL",
          "to": "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn",
          "amount": 1.0,
          "reasoning": "Convert SOL to jitoSOL"
        }
      ]
    },
    "userWallet": "82ytegx28N1rhU7e4rxY8MKoCTmuyZcuctx8LJL87Un8"
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "strategyId": "strategy_123",
    "strategyName": "High Yield Strategy",
    "userWallet": "82ytegx28N1rhU7e4rxY8MKoCTmuyZcuctx8LJL87Un8",
    "transactionCount": 1,
    "bundledTransaction": "base64_encoded_transaction",
    "individualTransactions": [
      {
        "type": "swap",
        "from": "SOL",
        "to": "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn",
        "amount": 1.0,
        "expectedOutput": "1000000000",
        "slippage": 0.1,
        "transaction": "base64_encoded_transaction",
        "instructions": 3,
        "reasoning": "Convert SOL to jitoSOL"
      }
    ],
    "estimatedGasCost": {
      "sol": 0.001,
      "usd": 0.10
    },
    "slippageProtection": 50,
    "createdAt": "2024-01-01T12:00:00.000Z"
  }
}
```

### Get Jupiter Quote
```bash
curl "http://localhost:3004/api/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn&amount=1.0&slippageBps=50"
```

### Validate Transaction
```bash
curl -X POST "http://localhost:3004/api/validate" \
  -H "Content-Type: application/json" \
  -d '{
    "transaction": "base64_encoded_transaction",
    "userWallet": "82ytegx28N1rhU7e4rxY8MKoCTmuyZcuctx8LJL87Un8"
  }'
```

### Get Transaction by Strategy ID
```bash
curl "http://localhost:3004/api/transaction/strategy_123/82ytegx28N1rhU7e4rxY8MKoCTmuyZcuctx8LJL87Un8"
```

## 🎯 Integration with AI Liquid Staking Router

This service provides the execution layer for the router:

### Transaction Building Flow
1. **Strategy Input**: Receive AI-generated strategy
2. **Action Processing**: Convert strategy actions to transactions
3. **Jupiter Integration**: Build swap transactions
4. **Sanctum Integration**: Build staking transactions
5. **Transaction Bundling**: Combine into single transaction
6. **Validation**: Verify transaction integrity
7. **Execution Ready**: Return signed transaction for user

### Strategy Action Types
```javascript
// Swap action
{
  type: 'swap',
  from: 'SOL',
  to: 'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn',
  amount: 1.0,
  reasoning: 'Convert SOL to jitoSOL for higher yield'
}

// Stake action
{
  type: 'stake',
  amount: 1.0,
  to: 'jitoSOL',
  reasoning: 'Stake SOL directly to jitoSOL'
}
```

### Transaction Output
```javascript
{
  bundledTransaction: VersionedTransaction,  // Ready to sign
  individualTransactions: [...],             // Individual operations
  estimatedGasCost: { sol: 0.001, usd: 0.10 },
  slippageProtection: 50,                    // 0.5%
  validation: { valid: true, balance: 5.0 }
}
```

## 🔍 Monitoring

### Health Check
```bash
curl "http://localhost:3004/health"
```

### Service Status
```bash
curl "http://localhost:3004/"
```

## 🚨 Error Handling

The service includes comprehensive error handling:

- **Jupiter API Failures**: Fallback to alternative routes
- **Transaction Validation**: Pre-execution safety checks
- **Balance Validation**: Sufficient SOL for fees
- **Size Validation**: Transaction size limits
- **Network Timeouts**: Configurable timeout handling

## 🔧 Configuration

Key configuration options:

```bash
# Service
TRANSACTION_BUILDER_PORT=3004
NODE_ENV=development

# Solana
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com

# Jupiter
JUPITER_API_URL=https://quote-api.jup.ag/v6
DEFAULT_SLIPPAGE_BPS=50

# Sanctum
SANCTUM_ROUTER_URL=https://api.sanctum.so/v1

# CORS
ALLOWED_ORIGINS=http://localhost:3000,https://degen-oracle.com

# Cache
CACHE_TIMEOUT_MS=300000  # 5 minutes
```

## 📈 Performance

- **Caching**: 5-minute cache reduces API calls
- **Transaction Bundling**: Efficient multi-operation transactions
- **Gas Optimization**: Minimal fee transactions
- **Parallel Processing**: Concurrent transaction building

## 🔮 Future Enhancements

- **MEV Protection**: Advanced MEV protection strategies
- **Cross-Chain Support**: Multi-chain transaction building
- **Advanced Routing**: AI-powered route optimization
- **Real-time Updates**: WebSocket support for live quotes
- **Batch Operations**: Multi-user transaction batching

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
- Documentation: [Read the docs](https://docs.degen-oracle.com/transaction-builder)
- Discord: [Join our community](https://discord.gg/degen-oracle)
