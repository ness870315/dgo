# TwitterAPI.io WebSocket Integration Guide

## 🚀 **Why WebSocket > REST API:**

### **Current (REST API Polling):**
- ❌ Check every 1 minute (60-second delay)
- ❌ 1,440 API calls/day (1 per minute)
- ❌ Costs: $0.216/day ($6.48/month)
- ❌ Misses mentions that happen between checks

### **With WebSocket:**
- ✅ **Instant delivery** (real-time, <1 second latency!)
- ✅ **Single connection** (persistent, no repeated requests)
- ✅ **Costs: $0.015/day** ($0.45/month) - **93% cheaper!**
- ✅ **Never miss a mention**

---

## 📋 **Setup Steps:**

### **1. Create Filter Rule (One-Time):**

**Option A: Web Interface**
1. Go to https://twitterapi.io/filter-rules
2. Create new rule:
   - **Tag:** `dgnoracle_mentions`
   - **Filter:** Monitor @dgnoracle mentions
   - **Polling Interval:** 0.1 seconds (real-time)
   - **Status:** Active

**Option B: API (Programmatic)**
```javascript
const response = await fetch('https://api.twitterapi.io/twitter/webhook/filter-rule', {
  method: 'POST',
  headers: {
    'X-API-Key': process.env.TWITTERAPIIO_API_KEY,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    tag: 'dgnoracle_mentions',
    filter: {
      user_mentions: ['dgnoracle']  // Monitor @dgnoracle mentions
    },
    polling_interval: 0.1,  // Real-time
    active: true
  })
});
```

---

### **2. Install WebSocket Package:**

```bash
cd backend
npm install ws
```

---

### **3. Update Environment Variables:**

Add to Render:
```bash
USE_TWITTERAPIIO_WEBSOCKET=false  # Start with false for testing
```

---

## 🔧 **Integration into Mention Service:**

### **File: `backend/twitterMentionService.js`**

```javascript
import TwitterAPIioWebSocketService from './services/TwitterAPIioWebSocketService.js';

class TwitterMentionService {
  constructor(...) {
    // ... existing code ...
    
    // Initialize WebSocket service (replaces polling)
    if (process.env.USE_TWITTERAPIIO_WEBSOCKET === 'true') {
      this.wsService = new TwitterAPIioWebSocketService(
        process.env.TWITTERAPIIO_API_KEY,
        (tweet) => this.handleWebSocketMention(tweet)  // Callback
      );
    }
  }

  // Start service
  async start() {
    // If WebSocket enabled, use that instead of interval
    if (process.env.USE_TWITTERAPIIO_WEBSOCKET === 'true' && this.wsService) {
      console.log('🚀 [MENTIONS] Starting WebSocket mode (real-time)...');
      this.wsService.connect();
      this.isRunning = true;
      return;
    }
    
    // Otherwise, use polling (current implementation)
    console.log('🚀 [MENTIONS] Starting polling mode (1-minute interval)...');
    await this.checkMentions();
    this.checkInterval = setInterval(() => this.checkMentions(), 60000);
    this.isRunning = true;
  }

  // Handle mention from WebSocket
  async handleWebSocketMention(wsTweet) {
    try {
      console.log('📬 [MENTIONS WS] New real-time mention received!');
      
      // Transform WebSocket tweet to our format
      const mention = this.wsService.transformWebSocketTweet(wsTweet);
      
      // Process immediately (same as polling)
      await this.processMention(mention);
      
    } catch (error) {
      console.error('❌ [MENTIONS WS] Error processing WebSocket mention:', error.message);
    }
  }

  // Stop service
  stop() {
    if (this.wsService) {
      this.wsService.disconnect();
    }
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
    this.isRunning = false;
  }
}
```

---

## 🎯 **Migration Path:**

### **Phase 1: Current (OAuth Polling)**
```
✅ Working now
❌ 60-second delay
❌ 1,440 calls/day
```

### **Phase 2: TwitterAPI.io REST (In Progress)**
```
✅ Working now
❌ Still 60-second delay
✅ Cheaper ($6.48/month vs $45/month)
```

### **Phase 3: TwitterAPI.io WebSocket (Next)**
```
✅ Real-time (<1s delay!)
✅ Even cheaper ($0.45/month!)
✅ Never miss a mention
```

---

## 💰 **Cost Comparison:**

| Method | Delay | API Calls/Day | Cost/Month |
|--------|-------|---------------|------------|
| **OAuth Polling** | 60s | 1,440 | $45 |
| **TwitterAPI.io REST** | 60s | 1,440 | $6.48 |
| **TwitterAPI.io WebSocket** | <1s | 1 connection | **$0.45** |

**WebSocket saves 99% vs OAuth and 93% vs REST!** 💰

---

## ⚠️ **Important Notes:**

### **Filter Rule Billing:**
- ✅ Charged per rule per day (not per tweet)
- ✅ ~$0.015/day for one active rule
- ✅ Billing starts when rule is activated
- ✅ Stop billing by deactivating rule

### **Connection Management:**
- ✅ Automatic reconnection (exponential backoff)
- ✅ Heartbeat/ping handling (keep-alive)
- ✅ Graceful error handling
- ✅ Fallback to polling if WebSocket fails

---

## 🧪 **Testing Plan:**

1. **Install `ws` package** in backend
2. **Create filter rule** on TwitterAPI.io dashboard
3. **Set `USE_TWITTERAPIIO_WEBSOCKET=false`** (test mode off)
4. **Test WebSocket connection** locally
5. **Enable flag** when ready
6. **Monitor for 24 hours**
7. **Remove polling interval** when stable

---

## 🎉 **Expected Outcome:**

**User tweets:** `@dgnoracle what's trending?`

**Old (Polling):**
```
Tweet sent → Wait 60s → Mention check → Process → Reply
Total: ~60-65 seconds
```

**New (WebSocket):**
```
Tweet sent → WebSocket event → Process → Reply
Total: ~1-2 seconds! 🚀
```

---

## 🔧 **Next Steps:**

**Want me to:**
1. ✅ Install `ws` package?
2. ✅ Integrate WebSocket into mention service?
3. ✅ Create filter rule setup script?
4. ✅ Add feature flag control?

This will be a **game-changer** for @dgnoracle's responsiveness! ⚡

