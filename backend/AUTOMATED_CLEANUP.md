# 🤖 Automated Token Cleanup System

## Overview
The Automated Token Cleanup System automatically identifies and deletes CRITICAL severity tokens that are wasting API calls and degrading system performance.

## How It Works

### 🎯 **Automatic Detection**
The system runs every **4 hours** and automatically identifies tokens that meet CRITICAL deletion criteria:

- **Zero volume for 24+ hours** - Dead tokens with no trading activity
- **-95% volume drop with <$10K market cap** - Severely declining tokens with tiny market caps
- **Multiple severe drops** - Tokens with -90%+ drops in both 1h and 24h periods

### 🗑️ **Automatic Deletion**
Only **CRITICAL** severity tokens are automatically deleted. Other severity levels (HIGH, MEDIUM, LOW) require manual intervention.

### 📝 **Logging**
All cleanup activities are logged to `/var/data/dgo/logs/automated-cleanup.log` with detailed information about:
- What tokens were deleted
- Why they were deleted
- Market cap and volume data
- Cleanup duration and statistics

## API Endpoints

### Get Cleanup Status
```bash
GET /api/cleanup/status
```
Returns current status, last cleanup time, next scheduled cleanup, and current statistics.

### Force Immediate Cleanup
```bash
POST /api/cleanup/force
```
Manually triggers cleanup immediately (useful for testing or urgent cleanup).

### Update Cleanup Interval
```bash
POST /api/cleanup/interval
Content-Type: application/json

{
  "hours": 12
}
```
Changes the cleanup interval (default: 4 hours).

## Configuration

### Environment Variables
- `DATA_DIR`: Base directory for data storage (default: `/var/data/dgo`)
- Logs are stored in `{DATA_DIR}/logs/automated-cleanup.log`

### Cleanup Criteria
The system uses the same criteria as the manual cleanup script:

```javascript
// CRITICAL severity (auto-deleted)
- Zero volume for 24+ hours
- -95% volume drop with <$10K market cap
- Multiple severe drops (-90%+ in both 1h and 24h)

// HIGH severity (manual deletion required)
- -90% volume drop with <$50K market cap

// MEDIUM severity (manual deletion required)  
- -80% volume drop with <$100K market cap
```

## Benefits

### 🚀 **Performance**
- Reduces API call waste on dead/declining tokens
- Improves system responsiveness
- Maintains database quality

### 💰 **Cost Savings**
- Eliminates unnecessary API calls to Jupiter, Twitter, etc.
- Reduces processing overhead
- Optimizes resource usage

### 🎯 **Quality**
- Keeps only active, viable tokens
- Maintains high-quality token database
- Improves user experience

## Monitoring

### Log Files
Check `/var/data/dgo/logs/automated-cleanup.log` for:
- Cleanup execution times
- Tokens deleted and reasons
- Error messages and warnings
- Performance statistics

### Status Endpoint
Use `/api/cleanup/status` to monitor:
- Last cleanup time
- Next scheduled cleanup
- Current token statistics
- System health

## Manual Override

If you need to disable automated cleanup temporarily:

1. **Stop the backend server**
2. **Comment out the initialization** in `enhancedBackend.js`:
   ```javascript
   // await this.automatedCleanup.initialize();
   ```
3. **Restart the server**

## Testing

Run the test script to verify the system:
```bash
cd backend
node test-automated-cleanup.js
```

This will test initialization, status checks, and force cleanup without affecting the production system.

## Safety Features

- **Only CRITICAL tokens** are auto-deleted
- **Comprehensive logging** of all actions
- **Error handling** with graceful fallbacks
- **Manual override** capability
- **Status monitoring** endpoints
- **Non-blocking** operation (won't crash the main system)

---

**Note**: The automated cleanup system is designed to be conservative and safe. It only deletes tokens that are clearly problematic and wasting resources, while maintaining comprehensive logs for audit purposes.
