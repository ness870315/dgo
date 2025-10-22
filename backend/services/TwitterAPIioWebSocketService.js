import WebSocket from 'ws';

/**
 * TwitterAPI.io WebSocket Service
 * Real-time mention monitoring via WebSocket instead of polling
 * 
 * Benefits:
 * - Instant mention delivery (no polling delay)
 * - Lower costs (push vs pull)
 * - Reduced API calls
 * 
 * Event Types:
 * - connected: Connection established
 * - ping: Heartbeat (keep-alive)
 * - tweet: New mention received
 */
class TwitterAPIioWebSocketService {
  constructor(apiKey, onMentionCallback) {
    this.apiKey = apiKey || process.env.TWITTERAPIIO_API_KEY;
    this.wsUrl = 'wss://ws.twitterapi.io/twitter/tweet/websocket';
    this.onMentionCallback = onMentionCallback;
    this.ws = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectDelay = 5000; // 5 seconds
    
    // Store rule IDs for deletion
    this.activeRuleIds = [];
    
    if (!this.apiKey) {
      throw new Error('TwitterAPI.io API key is required for WebSocket');
    }
    
    console.log('🌐 [TwitterAPI.io WS] Service initialized');
  }

  /**
   * Connect to WebSocket
   */
  connect() {
    try {
      console.log('🔌 [TwitterAPI.io WS] Connecting to WebSocket...');
      
      this.ws = new WebSocket(this.wsUrl, {
        headers: {
          'x-api-key': this.apiKey
        }
      });

      this.ws.on('open', () => this.onOpen());
      this.ws.on('message', (data) => this.onMessage(data));
      this.ws.on('error', (error) => this.onError(error));
      this.ws.on('close', (code, reason) => this.onClose(code, reason));
      this.ws.on('ping', () => this.onPing());
      
    } catch (error) {
      console.error('❌ [TwitterAPI.io WS] Connection error:', error.message);
      this.scheduleReconnect();
    }
  }

  /**
   * Handle connection opened
   */
  onOpen() {
    console.log('✅ [TwitterAPI.io WS] Connection established!');
    this.isConnected = true;
    this.reconnectAttempts = 0;
  }

  /**
   * Handle incoming messages
   */
  onMessage(data) {
    try {
      const message = JSON.parse(data.toString());
      const eventType = message.event_type;
      
      console.log(`📨 [TwitterAPI.io WS] Event: ${eventType}`);
      
      if (eventType === 'connected') {
        console.log('✅ [TwitterAPI.io WS] Connected event received');
        
      } else if (eventType === 'ping') {
        const timestamp = message.timestamp;
        const currentTime = Date.now();
        const latency = currentTime - timestamp;
        console.log(`💓 [TwitterAPI.io WS] Ping received (latency: ${latency}ms)`);
        
      } else if (eventType === 'tweet') {
        console.log('🐦 [TwitterAPI.io WS] New tweet(s) received!');
        
        const ruleId = message.rule_id;
        const ruleTag = message.rule_tag;
        const tweets = message.tweets || [];
        const timestamp = message.timestamp;
        const latency = Date.now() - timestamp;
        
        console.log(`   Rule: ${ruleTag} (${ruleId})`);
        console.log(`   Tweets: ${tweets.length}`);
        console.log(`   Latency: ${latency}ms`);
        
        // Process each tweet
        tweets.forEach(tweet => {
          console.log(`   📬 Tweet ${tweet.id} from @${tweet.author?.userName}: "${tweet.text?.substring(0, 50)}..."`);
          
          // Call the callback to process this mention
          if (this.onMentionCallback) {
            this.onMentionCallback(tweet);
          }
        });
        
      } else {
        console.log(`ℹ️ [TwitterAPI.io WS] Unknown event type: ${eventType}`);
      }
      
    } catch (error) {
      console.error('❌ [TwitterAPI.io WS] Error processing message:', error.message);
    }
  }

  /**
   * Handle errors
   */
  onError(error) {
    console.error('❌ [TwitterAPI.io WS] Error:', error.message);
    
    if (error.message.includes('timeout')) {
      console.log('   Connection timeout - will attempt reconnect');
    } else if (error.message.includes('refused')) {
      console.log('   Connection refused - check server status');
    } else if (error.message.includes('401') || error.message.includes('403')) {
      console.log('   Authentication error - check API key');
    }
  }

  /**
   * Handle connection close
   */
  onClose(code, reason) {
    this.isConnected = false;
    const reasonText = reason?.toString() || 'No reason provided';
    
    console.log(`🔌 [TwitterAPI.io WS] Connection closed: ${code} - ${reasonText}`);
    
    const closeReasons = {
      1000: 'Normal closure',
      1001: 'Going away',
      1002: 'Protocol error',
      1003: 'Unsupported data',
      1006: 'Abnormal closure',
      1008: 'Policy violation',
      1011: 'Server error',
      1013: 'Try again later'
    };
    
    console.log(`   Reason: ${closeReasons[code] || 'Unknown'}`);
    
    // Reconnect unless it's a normal closure
    if (code !== 1000) {
      this.scheduleReconnect();
    }
  }

  /**
   * Handle ping
   */
  onPing() {
    console.log('💓 [TwitterAPI.io WS] Ping received');
  }

  /**
   * Schedule reconnection
   */
  scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error(`❌ [TwitterAPI.io WS] Max reconnect attempts (${this.maxReconnectAttempts}) reached. Giving up.`);
      return;
    }
    
    this.reconnectAttempts++;
    const delay = this.reconnectDelay * this.reconnectAttempts; // Exponential backoff
    
    console.log(`🔄 [TwitterAPI.io WS] Reconnecting in ${delay/1000}s (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
    
    setTimeout(() => {
      this.connect();
    }, delay);
  }

  /**
   * Disconnect from WebSocket
   */
  disconnect() {
    if (this.ws) {
      console.log('🔌 [TwitterAPI.io WS] Disconnecting...');
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
      this.isConnected = false;
    }
  }

  /**
   * Check if connected
   */
  isConnectionActive() {
    return this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * Get existing filter rules from TwitterAPI.io
   */
  async getExistingRules() {
    try {
      const response = await fetch('https://api.twitterapi.io/oapi/tweet_filter/rules', {
        method: 'GET',
        headers: {
          'X-API-Key': this.apiKey,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        console.warn('⚠️ [TwitterAPI.io WS] Could not fetch existing rules:', response.status);
        return [];
      }
      
      const data = await response.json();
      return data.rules || [];
    } catch (error) {
      console.warn('⚠️ [TwitterAPI.io WS] Error fetching existing rules:', error.message);
      return [];
    }
  }

  /**
   * Check if crypto tracking rule needs update
   */
  needsCryptoRuleUpdate(trackedAccounts, existingRules) {
    const cryptoRule = existingRules.find(rule => rule.tag === 'crypto_accounts_tracking');
    if (!cryptoRule) return true;
    
    // Check if the rule value matches current tracked accounts
    const expectedValue = trackedAccounts.length > 0 
      ? `from:${trackedAccounts.join(' OR from:')}` 
      : '';
    
    return cryptoRule.value !== expectedValue;
  }

  /**
   * Set up filter rules for both mentions and crypto tracking
   */
  async setupFilterRules(trackedAccounts = []) {
    try {
      console.log('🔧 [TwitterAPI.io WS] Setting up combined filter rules...');
      
      // Check if rules already exist before creating new ones
      const existingRules = await this.getExistingRules();
      const hasMentionRule = existingRules.some(rule => rule.tag === 'mentions_dgnoracle');
      const hasCryptoRule = existingRules.some(rule => rule.tag === 'crypto_accounts_tracking');
      
      console.log(`📋 [TwitterAPI.io WS] Existing rules: mentions=${hasMentionRule}, crypto=${hasCryptoRule}`);
      
      // Check if crypto rule needs update
      const needsCryptoUpdate = !hasCryptoRule || this.needsCryptoRuleUpdate(trackedAccounts, existingRules);
      
      // If both rules exist and crypto rule doesn't need update, skip everything
      if (hasMentionRule && !needsCryptoUpdate) {
        console.log('✅ [TwitterAPI.io WS] All rules already exist and are up to date - skipping setup');
        return;
      }
      
      // Only clear existing rules if we need to update crypto accounts
      if (needsCryptoUpdate) {
        console.log('🔄 [TwitterAPI.io WS] Updating crypto tracking rules...');
        await this.clearExistingRules();
      }
      
      // Add rule for @dgnoracle mentions (only if it doesn't exist)
      if (!hasMentionRule) {
        console.log('➕ [TwitterAPI.io WS] Creating mention rule...');
        const mentionResponse = await fetch('https://api.twitterapi.io/oapi/tweet_filter/add_rule', {
          method: 'POST',
          headers: {
            'X-API-Key': this.apiKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            tag: 'mentions_dgnoracle',
            value: '@dgnoracle',
            interval_seconds: 20000
          })
        });
        
        if (!mentionResponse.ok) {
          const errorBody = await mentionResponse.text();
          console.error('❌ [TwitterAPI.io WS] Failed to add mention rule:', errorBody);
          throw new Error(`HTTP ${mentionResponse.status}: ${mentionResponse.statusText}`);
        }
        
        const mentionData = await mentionResponse.json();
        if (mentionData.status === 'success' && mentionData.rule_id) {
          this.activeRuleIds.push(mentionData.rule_id);
          console.log(`✅ [TwitterAPI.io WS] Added mention rule (ID: ${mentionData.rule_id})`);
          
          // Activate the rule
          await this.activateRule(mentionData.rule_id, 'mentions_dgnoracle', '@dgnoracle');
        }
      } else {
        console.log('✅ [TwitterAPI.io WS] Mention rule already exists, skipping creation');
      }
      
      // Add rule for tracked crypto accounts (if any and needs update)
      if (trackedAccounts.length > 0 && needsCryptoUpdate) {
        const fromAccounts = trackedAccounts.map(acc => `from:${acc}`).join(' OR ');
        
        const cryptoResponse = await fetch('https://api.twitterapi.io/oapi/tweet_filter/add_rule', {
          method: 'POST',
          headers: {
            'X-API-Key': this.apiKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            tag: 'crypto_accounts_tracking',
            value: fromAccounts,
            interval_seconds: 20000
          })
        });
        
        if (!cryptoResponse.ok) {
          const errorBody = await cryptoResponse.text();
          console.error('❌ [TwitterAPI.io WS] Failed to add crypto tracking rule:', errorBody);
          throw new Error(`HTTP ${cryptoResponse.status}: ${cryptoResponse.statusText}`);
        }
        
        const cryptoData = await cryptoResponse.json();
        if (cryptoData.status === 'success' && cryptoData.rule_id) {
          this.activeRuleIds.push(cryptoData.rule_id);
          console.log(`✅ [TwitterAPI.io WS] Added crypto tracking rule (ID: ${cryptoData.rule_id})`);
          
          // Activate the rule
          await this.activateRule(cryptoData.rule_id, 'crypto_accounts_tracking', fromAccounts);
        }
      } else if (trackedAccounts.length === 0) {
        console.log('ℹ️ [TwitterAPI.io WS] No crypto accounts to track, skipping crypto rule');
      } else {
        console.log('✅ [TwitterAPI.io WS] Crypto rule already exists and is up to date');
      }
      
      console.log('✅ [TwitterAPI.io WS] All filter rules set up successfully');
      
    } catch (error) {
      console.error('❌ [TwitterAPI.io WS] Failed to setup filter rules:', error.message);
      console.warn('⚠️ [TwitterAPI.io WS] Continuing without server-side filtering. All tweets will be received and filtered client-side.');
      // Don't throw error - continue without filter rules
    }
  }

  /**
   * Activate a rule by updating it with is_effect = 1
   */
  async activateRule(ruleId, tag, value) {
    try {
      const updateResponse = await fetch('https://api.twitterapi.io/oapi/tweet_filter/update_rule', {
        method: 'POST',
        headers: {
          'X-API-Key': this.apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          rule_id: ruleId,
          tag: tag,
          value: value,
          interval_seconds: 20000,
          is_effect: 1
        })
      });
      
      if (!updateResponse.ok) {
        const errorBody = await updateResponse.text();
        console.error(`❌ [TwitterAPI.io WS] Failed to activate rule ${ruleId}:`, errorBody);
        throw new Error(`HTTP ${updateResponse.status}: ${updateResponse.statusText}`);
      }
      
      const updateData = await updateResponse.json();
      if (updateData.status === 'success') {
        console.log(`✅ [TwitterAPI.io WS] Activated rule ${ruleId}`);
      } else {
        console.error(`❌ [TwitterAPI.io WS] Failed to activate rule ${ruleId}: ${updateData.msg}`);
      }
      
    } catch (error) {
      console.error(`❌ [TwitterAPI.io WS] Error activating rule ${ruleId}:`, error.message);
    }
  }

  /**
   * Clear existing filter rules (only crypto tracking rules)
   */
  async clearExistingRules() {
    try {
      console.log('🧹 [TwitterAPI.io WS] Clearing existing crypto tracking rules...');
      
      // Get current rules from API to find crypto tracking rules
      const existingRules = await this.getExistingRules();
      const cryptoRules = existingRules.filter(rule => rule.tag === 'crypto_accounts_tracking');
      
      if (cryptoRules.length === 0) {
        console.log('ℹ️ [TwitterAPI.io WS] No crypto tracking rules to clear');
        return;
      }
      
      console.log(`🗑️ [TwitterAPI.io WS] Found ${cryptoRules.length} crypto tracking rules, clearing...`);
      
      // Delete each crypto tracking rule by ID
      for (const rule of cryptoRules) {
        try {
          const deleteResponse = await fetch('https://api.twitterapi.io/oapi/tweet_filter/delete_rule', {
            method: 'DELETE',
            headers: {
              'X-API-Key': this.apiKey,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              rule_id: rule.rule_id
            })
          });
          
          if (deleteResponse.ok) {
            const deleteData = await deleteResponse.json();
            if (deleteData.status === 'success') {
              console.log(`✅ [TwitterAPI.io WS] Deleted crypto rule ${rule.rule_id}`);
            } else {
              console.log(`⚠️ [TwitterAPI.io WS] Failed to delete crypto rule ${rule.rule_id}: ${deleteData.msg}`);
            }
          } else {
            console.log(`⚠️ [TwitterAPI.io WS] HTTP error deleting crypto rule ${rule.rule_id}: ${deleteResponse.status}`);
          }
        } catch (error) {
          console.log(`⚠️ [TwitterAPI.io WS] Error deleting crypto rule ${rule.rule_id}:`, error.message);
        }
      }
      
      console.log('✅ [TwitterAPI.io WS] Cleared crypto tracking rules');
      
    } catch (error) {
      console.log('⚠️ [TwitterAPI.io WS] Error clearing crypto rules (continuing):', error.message);
    }
  }

  /**
   * Transform WebSocket tweet to our internal format
   */
  transformWebSocketTweet(wsTweet) {
    if (!wsTweet) return null;
    
    return {
      id: wsTweet.id,
      text: wsTweet.text,
      author_id: wsTweet.author?.id,
      author: {
        id: wsTweet.author?.id,
        username: wsTweet.author?.userName,
        name: wsTweet.author?.name,
        profile_image_url: wsTweet.author?.profilePicture
      },
      created_at: wsTweet.createdAt,
      referenced_tweets: wsTweet.inReplyToId ? [
        {
          type: 'replied_to',
          id: wsTweet.inReplyToId
        }
      ] : [],
      public_metrics: {
        retweet_count: wsTweet.retweetCount || 0,
        reply_count: wsTweet.replyCount || 0,
        like_count: wsTweet.likeCount || 0,
        quote_count: wsTweet.quoteCount || 0,
        impression_count: wsTweet.viewCount || 0
      },
      entities: wsTweet.entities || {},
      conversation_id: wsTweet.conversationId,
      lang: wsTweet.lang
    };
  }
}

export default TwitterAPIioWebSocketService;

