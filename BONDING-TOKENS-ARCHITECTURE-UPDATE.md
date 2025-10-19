# Bonding Tokens Service - Architecture Update

## 🏗️ **Current Architecture**

The `BondingTokensService` has been **moved from xtrend backend to jupiter-service** as a dedicated microservice.

## 📍 **Service Locations**

### **✅ Jupiter Service (Production)**
- **Location**: `jupiter-service/services/bonding-tokens/`
- **Port**: 3000 (unified jupiter-service)
- **Data Storage**: `/var/data/PreBonded-cache.json` (persistent & atomic)
- **API Endpoints**: `/api/bonding-tokens/*`

### **❌ Xtrend Backend (Removed)**
- **Old Location**: `backend/services/BondingTokensService.js` ❌ **DELETED**
- **Status**: No longer contains bonding tokens logic
- **Integration**: Now fetches data from jupiter-service via API

## 🔄 **Data Flow**

```
1. jupiter-service/services/bonding-tokens/
   ├── Fetches bonding tokens from Moralis API (every 30 min)
   ├── Monitors graduation status (every 10 min)
   ├── Stores data in /var/data/PreBonded-cache.json
   └── Provides REST API endpoints

2. xtrend-backend/enhancedBackend.js
   ├── Fetches data from jupiter-service via API
   ├── Transforms data for frontend compatibility
   └── Serves data to frontend

3. xtrend-frontend/
   ├── Displays bonding tokens in Trenches filter
   ├── Shows PreTokenDetail modal
   └── Renders GraduationStatusBar components
```

## 🗑️ **Files Removed from Xtrend Backend**

- ❌ `backend/services/BondingTokensService.js` - **DELETED**
- ❌ `test-bonding-tokens-service.js` - **DELETED**
- ❌ `test-graduation-monitoring.js` - **DELETED**
- ❌ `test-prebonding-tracking.js` - **DELETED**
- ❌ `test-graduation-proximity-alerts.js` - **DELETED**
- ❌ `test-bonding-scheduling.js` - **DELETED**

## ✅ **Files Added to Jupiter Service**

- ✅ `jupiter-service/services/bonding-tokens/BondingTokensService.js`
- ✅ `jupiter-service/services/bonding-tokens/BondingTokensAPI.js`
- ✅ `jupiter-service/services/bonding-tokens/index.js`
- ✅ `jupiter-service/services/bonding-tokens/test-service.js`
- ✅ `jupiter-service/services/bonding-tokens/package.json`
- ✅ `jupiter-service/services/bonding-tokens/render.yaml`
- ✅ `jupiter-service/services/bonding-tokens/README.md`

## 🔧 **Configuration**

### **Jupiter Service Environment Variables**
```bash
MORALIS_API_KEY=your_moralis_api_key
PORT=3000
```

### **Xtrend Backend Environment Variables**
```bash
JUPITER_SERVICE_URL=http://localhost:3000
```

## 📊 **API Endpoints**

### **Jupiter Service (Source of Truth)**
- `GET /api/bonding-tokens` - Get bonding tokens list
- `GET /api/bonding-tokens/{tokenAddress}/status` - Get token status
- `GET /api/bonding-tokens/alerts` - Get graduation alerts
- `GET /api/bonding-tokens/stats` - Get tracking statistics

### **Xtrend Backend (Proxy)**
- `GET /api/tokens/bonding` - Proxy to jupiter-service
- `GET /api/tokens/{contract}/bonding` - Proxy to jupiter-service
- `GET /api/tokens/bonding/stats` - Proxy to jupiter-service
- `GET /api/tokens/bonding/alerts` - Proxy to jupiter-service

## 🚀 **Deployment**

### **Start Jupiter Service**
```bash
cd jupiter-service
npm install
npm start
```

### **Start Xtrend Backend**
```bash
cd backend
# Ensure JUPITER_SERVICE_URL is set
npm start
```

## 🧪 **Testing**

### **Test Jupiter Service**
```bash
cd jupiter-service/services/bonding-tokens
npm test
```

### **Test Integration**
```bash
node test-bonding-tokens-integration.js
```

## 📈 **Benefits of New Architecture**

1. **Separation of Concerns**: Bonding tokens logic isolated in dedicated service
2. **Scalability**: Jupiter service can be deployed independently
3. **Maintainability**: Clear separation between services
4. **Reusability**: Other services can consume bonding tokens data
5. **Data Persistence**: PreBonded-cache.json lives in jupiter-service
6. **Atomic Operations**: Database operations handled by dedicated service

## 🔄 **Migration Complete**

The bonding tokens service has been successfully migrated from xtrend backend to jupiter-service. All old files have been removed to avoid confusion, and the new architecture is now in place.

**PreBonded-cache.json now lives persistent and atomic in jupiter-service!** 🎯
