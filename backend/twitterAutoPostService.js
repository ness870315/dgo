/**
 * Twitter Auto-Post Service
 * Automatically posts high-tier fuel announcements to @dgnoracle
 */

import axios from 'axios';

class TwitterAutoPostService {
  constructor() {
    // Twitter API v2 credentials for @dgnoracle
    this.apiKey = process.env.TWITTER_API_KEY || process.env.DGNORACLE_API_KEY;
    this.apiSecret = process.env.TWITTER_API_SECRET || process.env.DGNORACLE_API_SECRET;
    this.accessToken = process.env.TWITTER_ACCESS_TOKEN || process.env.DGNORACLE_ACCESS_TOKEN;
    this.accessTokenSecret = process.env.TWITTER_ACCESS_TOKEN_SECRET || process.env.DGNORACLE_ACCESS_TOKEN_SECRET;
    this.bearerToken = process.env.TWITTER_BEARER_TOKEN || process.env.DGNORACLE_BEARER_TOKEN;
    
    console.log('🐦 Twitter Auto-Post Service initialized for @dgnoracle');
    console.log(`   API Key: ${this.apiKey ? '✅ Set' : '❌ Missing'}`);
    console.log(`   API Secret: ${this.apiSecret ? '✅ Set' : '❌ Missing'}`);
    console.log(`   Access Token: ${this.accessToken ? '✅ Set' : '❌ Missing'}`);
    console.log(`   Access Token Secret: ${this.accessTokenSecret ? '✅ Set' : '❌ Missing'}`);
    console.log(`   Bearer Token: ${this.bearerToken ? '✅ Set' : '❌ Missing'}`);
    
    this.isEnabled = !!(this.apiKey && this.apiSecret && this.accessToken && this.accessTokenSecret);
    
    if (!this.isEnabled) {
      console.warn('⚠️ Twitter Auto-Post is DISABLED - missing credentials');
      console.warn('   Set TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_TOKEN_SECRET');
    } else {
      console.log('✅ Twitter Auto-Post is ENABLED for @dgnoracle');
    }
    
    // Hype message templates
    this.messageTemplates = {
      '500x': [
        '🔥 ${symbol} just got a 500x Fuel! The degen army is mobilizing! 🚀',
        '⚡ MEGA FUEL ALERT! ${symbol} powered up with 500x! 💎',
        '🎯 Someone just went ALL IN on ${symbol} with 500x Fuel! 🔥🔥🔥',
        '💣 BOOM! ${symbol} got the 500x treatment! To the moon! 🌙',
        '🚨 MASSIVE 500x Fuel on ${symbol}! The whales are watching! 🐋',
        '⚡ ${symbol} just received 500x Fuel! This is HUGE! 💥',
        '🔥🔥 ${symbol} 500x FUELED! Someone believes! 🚀🚀',
        '💎 ${symbol} got the 500x boost! Diamond hands activated! ✨',
        '🎪 The circus is in town! ${symbol} just got 500x Fuel! 🎭',
        '🌟 ${symbol} shining bright with 500x Fuel! LFG! 🔥'
      ],
      '1000x': [
        '🚀🚀🚀 ${symbol} JUST GOT 1000x FUEL! THIS IS NOT A DRILL! 🚨',
        '⚡⚡ ULTRA MEGA FUEL! ${symbol} with 1000x! MOONSHOT INCOMING! 🌙',
        '💥 NUCLEAR FUEL ALERT! ${symbol} 1000x! The ultimate bet! 💎',
        '🔥🔥🔥 ${symbol} 1000x FUELED! Someone went FULL DEGEN! 🎯',
        '🚨 WHALE ALERT! ${symbol} just received 1000x Fuel! 🐋💰',
        '⚡ MAXIMUM POWER! ${symbol} 1000x FUEL! This is legendary! 👑',
        '🎰 ALL IN! ${symbol} just got the 1000x treatment! YOLO! 🔥',
        '💣💣 DOUBLE NUCLEAR! ${symbol} 1000x FUELED! LFG! 🚀🚀',
        '🌟 ${symbol} with 1000x Fuel! The gods have spoken! ⚡⚡',
        '🔥 HISTORIC MOMENT! ${symbol} 1000x FUEL! This is the way! 💎✨'
      ]
    };
  }

  /**
   * Generate OAuth 1.0a signature for Twitter API v1.1
   */
  generateOAuthHeader(method, url, params = {}) {
    const crypto = require('crypto');
    
    const oauthParams = {
      oauth_consumer_key: this.apiKey,
      oauth_token: this.accessToken,
      oauth_signature_method: 'HMAC-SHA1',
      oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
      oauth_nonce: crypto.randomBytes(32).toString('base64').replace(/\W/g, ''),
      oauth_version: '1.0'
    };

    // Combine OAuth params with request params
    const allParams = { ...params, ...oauthParams };
    
    // Create signature base string
    const sortedParams = Object.keys(allParams)
      .sort()
      .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(allParams[key])}`)
      .join('&');
    
    const signatureBaseString = `${method.toUpperCase()}&${encodeURIComponent(url)}&${encodeURIComponent(sortedParams)}`;
    
    // Create signing key
    const signingKey = `${encodeURIComponent(this.apiSecret)}&${encodeURIComponent(this.accessTokenSecret)}`;
    
    // Generate signature
    const signature = crypto
      .createHmac('sha1', signingKey)
      .update(signatureBaseString)
      .digest('base64');
    
    oauthParams.oauth_signature = signature;
    
    // Build OAuth header
    const oauthHeader = 'OAuth ' + Object.keys(oauthParams)
      .sort()
      .map(key => `${encodeURIComponent(key)}="${encodeURIComponent(oauthParams[key])}"`)
      .join(', ');
    
    return oauthHeader;
  }

  /**
   * Get a random hype message
   */
  getHypeMessage(fuelType, symbol) {
    const templates = this.messageTemplates[fuelType] || this.messageTemplates['500x'];
    const template = templates[Math.floor(Math.random() * templates.length)];
    return template.replace('${symbol}', `$${symbol}`);
  }

  /**
   * Post a tweet to @dgnoracle
   */
  async postTweet(text) {
    if (!this.isEnabled) {
      console.log('⚠️ Twitter Auto-Post is disabled - skipping tweet');
      return { success: false, reason: 'disabled' };
    }

    try {
      // Twitter API v2 endpoint
      const url = 'https://api.twitter.com/2/tweets';
      
      // Generate OAuth 1.0a header
      const oauthHeader = this.generateOAuthHeader('POST', url);
      
      console.log('🐦 Posting tweet to @dgnoracle...');
      console.log(`   Text: ${text}`);
      
      const response = await axios.post(
        url,
        { text },
        {
          headers: {
            'Authorization': oauthHeader,
            'Content-Type': 'application/json'
          }
        }
      );

      console.log('✅ Tweet posted successfully!');
      console.log(`   Tweet ID: ${response.data.data.id}`);
      
      return {
        success: true,
        tweetId: response.data.data.id,
        text: response.data.data.text
      };

    } catch (error) {
      console.error('❌ Failed to post tweet:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data || error.message
      };
    }
  }

  /**
   * Post fuel announcement
   */
  async postFuelAnnouncement(token, fuelType, user = null) {
    if (!this.isEnabled) {
      console.log('⚠️ Twitter Auto-Post is disabled - skipping fuel announcement');
      return { success: false, reason: 'disabled' };
    }

    try {
      const symbol = token.symbol || 'TOKEN';
      const fuelUrl = `https://degen-oracle.com/fuel/${fuelType}/${symbol}`;
      
      // Generate hype message
      const hypeMessage = this.getHypeMessage(fuelType, symbol);
      
      // Construct tweet text
      const tweetText = `${hypeMessage}\n\n${fuelUrl}`;
      
      console.log(`🔥 Auto-posting ${fuelType} fuel announcement for ${symbol}`);
      if (user) {
        console.log(`   Fueled by: @${user.username}`);
      }
      
      // Post the tweet
      const result = await this.postTweet(tweetText);
      
      if (result.success) {
        console.log(`✅ Successfully posted ${fuelType} fuel announcement for ${symbol}`);
        console.log(`   Tweet URL: https://twitter.com/dgnoracle/status/${result.tweetId}`);
      }
      
      return result;

    } catch (error) {
      console.error('❌ Error posting fuel announcement:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Check if auto-posting is enabled
   */
  isAutoPostEnabled() {
    return this.isEnabled;
  }
}

export default TwitterAutoPostService;

