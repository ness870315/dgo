# Bonding Tokens Service

A microservice that monitors pre-bonded tokens on Pump.fun and tracks their graduation status using the Moralis API.

## 🚀 Features

- **Bonding Token Monitoring**: Fetches bonding tokens every 30 minutes
- **Graduation Status Tracking**: Monitors individual token progress every 10 minutes
- **Deduplication**: Removes duplicate tokens based on token address
- **Graduation Alerts**: Generates alerts for tokens approaching graduation
- **Persistent Storage**: Maintains data across service restarts
- **REST API**: Provides endpoints for other services to consume data

## 📊 Graduation Proximity Levels

- **IMMINENT_GRADUATION**: ≥ 99% (Red)
- **VERY_CLOSE_TO_GRADUATION**: 97-98% (Orange)
- **CLOSE_TO_GRADUATION**: 95-96% (Yellow)
- **APPROACHING_GRADUATION**: 90-94% (Blue)
- **FAR_FROM_GRADUATION**: < 90% (Green)

## 🔧 API Endpoints

### Health Check
```
GET /health
```

### Get Bonding Tokens
```
GET /api/bonding-tokens?limit=50&forceRefresh=false
```

### Get Bonding Status
```
GET /api/bonding-tokens/{tokenAddress}/status
```

### Get Graduation Alerts
```
GET /api/bonding-tokens/alerts?threshold=95
```

### Get Tokens by Proximity
```
GET /api/bonding-tokens/by-proximity?proximityLevel=CLOSE_TO_GRADUATION
```

### Get Tracking Statistics
```
GET /api/bonding-tokens/stats
```

### Track Pre-Bonding Tokens
```
POST /api/bonding-tokens/track
```

### Clear Cache
```
POST /api/bonding-tokens/clear-cache
```

## 🏗️ Installation

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Set environment variables**:
   ```bash
   MORALIS_API_KEY=your_moralis_api_key
   ```

3. **Start the service**:
   ```bash
   npm start
   ```

## 🧪 Testing

Run the test script:
```bash
npm test
```

## 📈 Monitoring Schedule

- **Bonding Tokens**: Every 30 minutes
- **Bonding Status**: Every 10 minutes
- **Graduation Alerts**: Generated when tokens reach 95%+ progress

## 💾 Data Storage

- **Cache**: `/var/data/PreBonded-cache.json`
- **Tracking**: `/var/data/prebonding-tracking.json`
- **Alerts**: `/var/data/graduation-alerts.json`

## 🔗 Integration

This service integrates with:
- **xtrend backend**: Provides bonding token data for Trenches filter
- **jupiter-service**: Part of the unified Jupiter Discovery Service
- **Moralis API**: Source of bonding token data

## 🚨 Graduation Monitoring

The service automatically:
1. Fetches new bonding tokens every 30 minutes
2. Monitors graduation progress every 10 minutes
3. Generates alerts for high-risk tokens
4. Tracks token progression over time
5. Maintains persistent data across restarts

## 📊 Example Response

```json
{
  "success": true,
  "tokens": [
    {
      "tokenAddress": "2m5D1pGRfEhXjo88PSrzBpyUScYxdJyoc8bDbxUWpump",
      "name": "This Coin Will Fly",
      "symbol": "Flycoin",
      "bondingCurveProgress": 97.36,
      "priceUsd": "0.000067557",
      "fullyDilutedValuation": "67557"
    }
  ],
  "count": 47,
  "source": "api"
}
```

## 🔧 Configuration

- **Port**: 3004 (default)
- **Cache Timeout**: 30 minutes for bonding tokens, 10 minutes for status
- **API Timeout**: 15 seconds for Moralis API calls
- **Graduation Threshold**: 95% (configurable)

## 🚀 Deployment

Deploy to Render using the included `render.yaml`:

```bash
# Set environment variables in Render dashboard
MORALIS_API_KEY=your_moralis_api_key

# Deploy
git push origin main
```

## 📝 License

MIT
