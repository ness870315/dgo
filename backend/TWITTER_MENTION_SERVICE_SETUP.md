# Twitter Mention Service Setup Guide

## 🎯 Overview

The Twitter Mention Service automatically monitors mentions of @dgnoracle and replies with:
- **Casual conversation** for greetings and general questions
- **KOL-style opinions** for token analysis requests

## 📁 Files Created

- `backend/twitterMentionService.js` - Main service class

## 🔧 Integration Steps

### 1. Add Twitter API v2 Mentions Endpoint to OAuthXService

Add this method to `backend/OAuthXService.js`:

```javascript
/**
 * Get mentions for the authenticated user
 * @param {string} sinceId - Only return results after this tweet ID
 * @returns {Promise<Object>} Mentions data
 */
async getMentions(sinceId = null) {
  try {
    // Get dgnoracle user's credentials
    const userId = process.env.DGNORACLE_USER_ID;
    if (!userId) {
      throw new Error('DGNORACLE_USER_ID not set');
    }
    
    const credentials = await this.db.getTwitterCredentials(userId);
    if (!credentials) {
      throw new Error('Twitter credentials not found for dgnoracle');
    }
    
    // Build Twitter API URL
    let url = `https://api.twitter.com/2/users/${userId}/mentions`;
    const params = new URLSearchParams({
      'tweet.fields': 'created_at,author_id,conversation_id',
      'expansions': 'author_id',
      'user.fields': 'username,name',
      'max_results': '10' // Get last 10 mentions
    });
    
    if (sinceId) {
      params.append('since_id', sinceId);
    }
    
    url += '?' + params.toString();
    
    // Make request with OAuth 2.0
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${credentials.accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Twitter API error: ${response.status} - ${error}`);
    }
    
    const data = await response.json();
    
    // Format mentions for easier processing
    const mentions = (data.data || []).map(tweet => {
      const author = data.includes?.users?.find(u => u.id === tweet.author_id);
      return {
        id: tweet.id,
        text: tweet.text,
        createdAt: tweet.created_at,
        conversationId: tweet.conversation_id,
        author: {
          id: tweet.author_id,
          username: author?.username,
          name: author?.name
        }
      };
    });
    
    return {
      success: true,
      mentions,
      meta: data.meta
    };
    
  } catch (error) {
    console.error('❌ Error fetching mentions:', error.message);
    return {
      success: false,
      error: error.message,
      mentions: []
    };
  }
}

/**
 * Post a reply to a tweet
 * @param {string} tweetId - ID of tweet to reply to
 * @param {string} text - Reply text
 * @returns {Promise<Object>} Result
 */
async postReply(tweetId, text) {
  try {
    const userId = process.env.DGNORACLE_USER_ID;
    if (!userId) {
      throw new Error('DGNORACLE_USER_ID not set');
    }
    
    const credentials = await this.db.getTwitterCredentials(userId);
    if (!credentials) {
      throw new Error('Twitter credentials not found for dgnoracle');
    }
    
    // Post reply using Twitter API v2
    const response = await fetch('https://api.twitter.com/2/tweets', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${credentials.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: text,
        reply: {
          in_reply_to_tweet_id: tweetId
        }
      })
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Twitter API error: ${response.status} - ${error}`);
    }
    
    const data = await response.json();
    
    return {
      success: true,
      tweetId: data.data.id,
      text: data.data.text
    };
    
  } catch (error) {
    console.error('❌ Error posting reply:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}
```

### 2. Initialize Service in enhancedBackend.js

Add to the constructor:

```javascript
// Import
import TwitterMentionService from './twitterMentionService.js';

// In constructor, after other services:
this.twitterMentionService = new TwitterMentionService(
  this.twitterAutoPostService,
  this.openaiService,
  this // Pass backend instance for cache access
);
```

### 3. Start Service on Backend Boot

In the `start()` method:

```javascript
// Start Twitter mention tracking service
if (this.twitterMentionService) {
  console.log('[🛡️ Enhanced Backend] 🐦 Starting Twitter Mention Service...');
  await this.twitterMentionService.start();
}
```

### 4. Update twitterMentionService.js to Use OAuthXService

Replace the placeholder methods:

```javascript
// In fetchMentions():
async fetchMentions() {
  try {
    const response = await this.twitterService.oauthXService.getMentions(this.lastCheckedMentionId);
    
    if (response.success && response.mentions.length > 0) {
      // Update last checked ID
      this.lastCheckedMentionId = response.mentions[0].id;
      return response.mentions;
    }
    
    return [];
  } catch (error) {
    console.error('❌ [MENTIONS] Error fetching mentions:', error.message);
    return [];
  }
}

// In postReply():
async postReply(mentionId, replyText) {
  try {
    const result = await this.twitterService.oauthXService.postReply(mentionId, replyText);
    return result;
  } catch (error) {
    console.error('❌ [MENTIONS] Error posting reply:', error.message);
    return { success: false, error: error.message };
  }
}
```

### 5. Add Admin Dashboard Controls

Add to `backend/public/admin-dashboard.html`:

```html
<!-- Twitter Mention Service Section -->
<div class="dashboard-section">
  <h2>🐦 Twitter Mention Tracking</h2>
  
  <div class="control-group">
    <button onclick="getMentionServiceStatus()">Check Status</button>
    <button onclick="startMentionService()">Start Service</button>
    <button onclick="stopMentionService()">Stop Service</button>
  </div>
  
  <div id="mentionServiceStatus" class="status-display"></div>
  
  <div class="control-group">
    <button onclick="checkMentionsNow()">Check Mentions Now</button>
  </div>
  
  <div id="recentMentions" class="status-display"></div>
</div>

<script>
async function getMentionServiceStatus() {
  const resultDiv = document.getElementById('mentionServiceStatus');
  resultDiv.innerHTML = showLoading();
  
  try {
    const response = await fetch(`${API_BASE}/api/admin/twitter/mentions/status`);
    const data = await response.json();
    
    if (data.success) {
      resultDiv.innerHTML = showAlert(`
        Status: ${data.isRunning ? '✅ Running' : '⏸️ Stopped'}<br>
        Check Interval: ${data.checkIntervalMinutes} minutes<br>
        Replied Mentions: ${data.repliedCount}<br>
        Last Check: ${data.lastCheckedTime || 'Never'}
      `, 'success');
    } else {
      resultDiv.innerHTML = showAlert(`❌ ${data.error}`, 'error');
    }
  } catch (error) {
    resultDiv.innerHTML = showAlert(`❌ Error: ${error.message}`, 'error');
  }
}

async function startMentionService() {
  const resultDiv = document.getElementById('mentionServiceStatus');
  resultDiv.innerHTML = showLoading();
  
  try {
    const response = await fetch(`${API_BASE}/api/admin/twitter/mentions/start`, {
      method: 'POST'
    });
    const data = await response.json();
    
    if (data.success) {
      resultDiv.innerHTML = showAlert('✅ Mention service started!', 'success');
      getMentionServiceStatus();
    } else {
      resultDiv.innerHTML = showAlert(`❌ ${data.error}`, 'error');
    }
  } catch (error) {
    resultDiv.innerHTML = showAlert(`❌ Error: ${error.message}`, 'error');
  }
}

async function stopMentionService() {
  const resultDiv = document.getElementById('mentionServiceStatus');
  resultDiv.innerHTML = showLoading();
  
  try {
    const response = await fetch(`${API_BASE}/api/admin/twitter/mentions/stop`, {
      method: 'POST'
    });
    const data = await response.json();
    
    if (data.success) {
      resultDiv.innerHTML = showAlert('✅ Mention service stopped!', 'success');
      getMentionServiceStatus();
    } else {
      resultDiv.innerHTML = showAlert(`❌ ${data.error}`, 'error');
    }
  } catch (error) {
    resultDiv.innerHTML = showAlert(`❌ Error: ${error.message}`, 'error');
  }
}

async function checkMentionsNow() {
  const resultDiv = document.getElementById('recentMentions');
  resultDiv.innerHTML = showLoading();
  
  try {
    const response = await fetch(`${API_BASE}/api/admin/twitter/mentions/check`, {
      method: 'POST'
    });
    const data = await response.json();
    
    if (data.success) {
      resultDiv.innerHTML = showAlert(`✅ Checked! Found ${data.mentionsProcessed} new mentions`, 'success');
    } else {
      resultDiv.innerHTML = showAlert(`❌ ${data.error}`, 'error');
    }
  } catch (error) {
    resultDiv.innerHTML = showAlert(`❌ Error: ${error.message}`, 'error');
  }
}
</script>
```

### 6. Add API Routes in enhancedBackend.js

```javascript
// Get mention service status
this.app.get('/api/admin/twitter/mentions/status', adminApiAuth, async (req, res) => {
  try {
    const status = {
      success: true,
      isRunning: this.twitterMentionService.isRunning,
      checkIntervalMinutes: this.twitterMentionService.checkIntervalMinutes,
      repliedCount: this.twitterMentionService.repliedMentions.size,
      lastCheckedTime: this.twitterMentionService.lastCheckedTime || null
    };
    res.json(status);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Start mention service
this.app.post('/api/admin/twitter/mentions/start', adminApiAuth, async (req, res) => {
  try {
    await this.twitterMentionService.start();
    res.json({ success: true, message: 'Mention service started' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Stop mention service
this.app.post('/api/admin/twitter/mentions/stop', adminApiAuth, async (req, res) => {
  try {
    this.twitterMentionService.stop();
    res.json({ success: true, message: 'Mention service stopped' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Manually check mentions now
this.app.post('/api/admin/twitter/mentions/check', adminApiAuth, async (req, res) => {
  try {
    await this.twitterMentionService.checkMentions();
    res.json({ 
      success: true, 
      message: 'Checked mentions',
      mentionsProcessed: this.twitterMentionService.lastProcessedCount || 0
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
```

## 🚀 How It Works

1. **Every 10 minutes**, the service checks for new mentions of @dgnoracle
2. **Analyzes each mention** using OpenAI to determine:
   - Should we reply?
   - Is it casual conversation or token analysis?
   - Which tokens are mentioned?
3. **For casual mentions**: Generates friendly, conversational reply
4. **For token questions**:
   - Fetches token data from cache (Jupiter API data)
   - Gets holder insights (if available)
   - Generates KOL-style opinion using GPT-4
   - Reply sounds like a real degen KOL
5. **Posts reply** and tracks it to avoid duplicates
6. **State persists** across backend restarts

## 💬 Example Interactions

**Casual:**
```
@user: "Hey @dgnoracle what's good?"
@dgnoracle: "GM anon! Just crushing data and spotting the next cult. What you need? 🔮"
```

**Token Analysis:**
```
@user: "Yo @dgnoracle what about $BONK? Still viable?"
@dgnoracle: "Whales are feasting and holders have conviction, $BONK is ready to moon 🚀"
```

```
@user: "@dgnoracle thoughts on @memeputer?"
@dgnoracle: "Volume is dead and retail is panic selling...I wouldn't touch this with a 10ft pole 📉"
```

## ⚙️ Configuration

- Check interval: 10 minutes (configurable)
- Uses GPT-4 for token analysis (better quality)
- Uses GPT-3.5 for casual replies (faster, cheaper)
- Tracks up to 1000 recent replied mentions in memory
- State persists to `/var/data/dgo/twitter-mentions-state.json`

## 🔐 Requirements

- `DGNORACLE_USER_ID` env variable must be set
- @dgnoracle must be authenticated via OAuth
- Twitter API v2 access with read/write permissions
- OpenAI API key for AI responses

