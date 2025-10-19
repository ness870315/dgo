# Enhanced Jupiter Discovery Service - Render Deployment Guide

This guide walks you through deploying the Enhanced Jupiter Discovery Service to Render. This service combines:
1. **Existing trending token discovery** (sends data to enhancedBackend)
2. **New AI Liquid Staking Router** functionality

## 🏗️ Architecture Overview

```
Render Services:
├── enhanced-jup-discovery.onrender.com (Web Service)
│   ├── Trending Token Discovery (existing functionality)
│   ├── LST Registry API
│   ├── Portfolio Analyzer API
│   ├── AI Strategy Engine API
│   └── Transaction Builder API
│
└── enhanced-backend.onrender.com (Web Service)
    ├── x402 Payment Endpoints
    └── Internal Discovery Import (existing functionality)
```

## 🚀 Deployment Steps

### Step 1: Deploy Enhanced Jupiter Discovery Service

#### 1.1 Deploy Enhanced Service
```bash
# Navigate to Enhanced Jupiter Discovery Service
cd services/jup-discovery

# Deploy to Render
# 1. Go to https://render.com
# 2. Click "New +" → "Web Service"
# 3. Connect your GitHub repository
# 4. Select the services/jup-discovery directory
# 5. Use the render.yaml configuration
```

**Service Details:**
- **Name**: `enhanced-jup-discovery`
- **URL**: `https://enhanced-jup-discovery.onrender.com`
- **Port**: 3000
- **Modules**: Trending Discovery, LST Registry, Portfolio Analyzer, AI Strategy Engine, Transaction Builder

### Step 2: Deploy Enhanced Backend

```bash
# Navigate to Enhanced Backend
cd backend

# Deploy to Render
# 1. Go to https://render.com
# 2. Click "New +" → "Web Service"
# 3. Connect your GitHub repository
# 4. Select the backend directory
# 5. Use the render.yaml configuration
```

**Service Details:**
- **Name**: `enhanced-backend`
- **URL**: `https://enhanced-backend.onrender.com`
- **Port**: 3000

## 🔧 Environment Variables Setup

### Required Environment Variables

#### Enhanced Jupiter Discovery Service (enhanced-jup-discovery)
```bash
# Set these in Render dashboard
MONGODB_URI=your_mongodb_connection_string
MORALIS_API_KEY=your_moralis_api_key
OPENAI_API_KEY=your_openai_api_key
JUPITER_API_KEY=your_jupiter_api_key
INTERNAL_TOKEN=your_secure_internal_token
```

#### Enhanced Backend
```bash
# Set these in Render dashboard
X402_PAY_TO_ADDRESS=your_merchant_wallet_address
MORALIS_API_KEY=your_moralis_api_key
OPENAI_API_KEY=your_openai_api_key
TWITTER_API_KEY=your_twitter_api_key
TWITTER_API_SECRET=your_twitter_api_secret
TWITTER_ACCESS_TOKEN=your_twitter_access_token
TWITTER_ACCESS_TOKEN_SECRET=your_twitter_access_token_secret
MONGODB_URI=your_mongodb_connection_string
JUP_DISCOVERY_URL=https://enhanced-jup-discovery.onrender.com
INTERNAL_TOKEN=your_secure_internal_token
```

## 🔗 Service Communication

### Service URLs (Update in Enhanced Backend)
```javascript
const SERVICE_URLS = {
  lstRegistry: 'https://lst-registry-service.onrender.com',
  portfolioAnalyzer: 'https://portfolio-analyzer-service.onrender.com',
  aiStrategyEngine: 'https://ai-strategy-engine-service.onrender.com',
  transactionBuilder: 'https://transaction-builder-service.onrender.com'
};
```

### CORS Configuration
Each service is configured to allow requests from:
- `https://enhanced-backend.onrender.com`
- `https://your-frontend-domain.com`

## 🧪 Testing Deployment

### 1. Test Individual Services
```bash
# Test LST Registry
curl https://lst-registry-service.onrender.com/health

# Test Portfolio Analyzer
curl https://portfolio-analyzer-service.onrender.com/health

# Test AI Strategy Engine
curl https://ai-strategy-engine-service.onrender.com/health

# Test Transaction Builder
curl https://transaction-builder-service.onrender.com/health
```

### 2. Test Enhanced Backend
```bash
# Test Enhanced Backend
curl https://enhanced-backend.onrender.com/health

# Test x402 AI Router endpoint
curl https://enhanced-backend.onrender.com/api/x402/execute-strategy/test_strategy_123
```

### 3. Test Complete Flow
```bash
# Update test script with production URLs
node test-ai-router-x402.js
```

## 📊 Monitoring

### Health Checks
Each service provides health check endpoints:
- `/health` - Service status
- `/api/health` - API status

### Logs
Monitor logs in Render dashboard for each service:
- Build logs
- Runtime logs
- Error logs

## 🔄 Updates and Maintenance

### Deploying Updates
1. **Push changes to GitHub**
2. **Render automatically rebuilds** (if auto-deploy is enabled)
3. **Test the updated service**
4. **Update other services if needed**

### Service Dependencies
- **Enhanced Backend** depends on all Jupiter services
- **AI Strategy Engine** depends on LST Registry and Portfolio Analyzer
- **Portfolio Analyzer** depends on LST Registry

## 💰 Cost Estimation

### Render Pricing (Starter Plan)
- **Enhanced Backend**: $7/month
- **LST Registry**: $7/month
- **Portfolio Analyzer**: $7/month
- **AI Strategy Engine**: $7/month
- **Transaction Builder**: $7/month
- **Total**: ~$35/month

### Scaling Options
- **Upgrade to Standard Plan**: $25/month per service
- **Add more instances**: For high traffic
- **Database**: MongoDB Atlas (separate cost)

## 🚨 Troubleshooting

### Common Issues

#### 1. Service Not Starting
- Check environment variables
- Verify build logs
- Check service dependencies

#### 2. Service Communication Errors
- Verify CORS configuration
- Check service URLs
- Test network connectivity

#### 3. Database Connection Issues
- Verify MongoDB URI
- Check database permissions
- Test connection from service

### Debug Commands
```bash
# Check service logs
# Go to Render dashboard → Service → Logs

# Test service endpoints
curl -v https://service-name.onrender.com/health

# Check environment variables
# Go to Render dashboard → Service → Environment
```

## 🎯 Next Steps

1. **Deploy all services** following this guide
2. **Test the complete flow** end-to-end
3. **Set up monitoring** and alerts
4. **Configure custom domains** (optional)
5. **Set up CI/CD** for automatic deployments

## 📞 Support

If you encounter issues:
1. Check Render documentation
2. Review service logs
3. Test individual components
4. Verify environment variables
5. Check service dependencies
