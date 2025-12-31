/**
 * TweetAPI v2 Posting Service
 * Handles posting tweets, replies, and quote tweets using TweetAPI v2
 * Includes browser headers to bypass Twitter's automation detection
 */

import axios from 'axios';

class TweetAPIPostingService {
  constructor() {
    this.apiKey = process.env.TWEETAPI_API_KEY || 'new1_047620c16d4e4e0b8056824ddf1e68a2';
    this.authToken = process.env.TWEETAPI_AUTH_TOKEN || '85aad2d6ed8ebe60c2f7501ad69d675eabea70f5';
    this.baseUrl = 'https://api.tweetapi.com';
    
    // Build proxy from environment variables
    // Priority: TWEETAPI_PROXY (full string) > SMART_PROXY_* (individual components)
    let proxyString = process.env.TWEETAPI_PROXY || null;
    
    if (!proxyString) {
      // Build proxy string from Smartproxy environment variables
      const smartProxyHost = process.env.SMART_PROXY_HOST || 'proxy.smartproxy.net';
      const smartProxyPort = process.env.SMART_PROXY_PORT || '3120';
      const smartProxyUsername = process.env.SMART_PROXY_USERNAME;
      const smartProxyPassword = process.env.SMART_PROXY_PASSWORD;
      
      if (smartProxyUsername && smartProxyPassword) {
        proxyString = `${smartProxyHost}:${smartProxyPort}@${smartProxyUsername}:${smartProxyPassword}`;
        console.log(`🔗 [TWEETAPI V2] Built proxy from SMART_PROXY_* environment variables`);
      }
    }
    
    this.originalProxy = proxyString;
    this.proxy = this.originalProxy; // Current proxy (can be disabled temporarily)
    this.proxyDisabled = false; // Track if proxy was auto-disabled
    this.consecutiveProxyFailures = 0; // Track consecutive proxy failures
    this.maxConsecutiveProxyFailures = 3; // Auto-disable after 3 consecutive failures
    
    // Rotate User-Agents to avoid detection
    this.userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    ];
    this.currentUserAgentIndex = Math.floor(Math.random() * this.userAgents.length);
    
    // Last request timestamp for rate limiting
    this.lastRequestTime = 0;
    this.minDelayBetweenRequests = 2000; // 2 seconds minimum between requests
    
    console.log('🐦 [TWEETAPI V2] Service initialized with enhanced browser headers');
    if (this.proxy && this.proxy.trim() !== '') {
      console.log(`🔗 [TWEETAPI V2] Proxy configured: ${this.proxy.substring(0, 20)}...`);
    } else {
      console.log('🔗 [TWEETAPI V2] No proxy configured - using direct connection');
    }
  }

  /**
   * Get browser headers with randomized User-Agent and realistic browser fingerprint
   */
  getBrowserHeaders() {
    // Rotate User-Agent occasionally
    if (Math.random() < 0.3) {
      this.currentUserAgentIndex = Math.floor(Math.random() * this.userAgents.length);
    }
    
    const userAgent = this.userAgents[this.currentUserAgentIndex];
    const isChrome = userAgent.includes('Chrome');
    const isWindows = userAgent.includes('Windows');
    const isMac = userAgent.includes('Macintosh');
    
    // Extract Chrome version from User-Agent
    const chromeVersionMatch = userAgent.match(/Chrome\/(\d+)/);
    const chromeVersion = chromeVersionMatch ? chromeVersionMatch[1] : '131';
    
    // Build comprehensive browser headers
    const headers = {
      'X-API-Key': this.apiKey,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': userAgent,
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Referer': 'https://twitter.com/',
      'Origin': 'https://twitter.com',
      'Connection': 'keep-alive',
      'DNT': '1',
      'Upgrade-Insecure-Requests': '1',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache'
    };
    
    // Add Chrome-specific headers
    if (isChrome) {
      headers['Sec-Ch-Ua'] = `"Not_A Brand";v="8", "Chromium";v="${chromeVersion}", "Google Chrome";v="${chromeVersion}"`;
      headers['Sec-Ch-Ua-Mobile'] = '?0';
      headers['Sec-Ch-Ua-Platform'] = isWindows ? '"Windows"' : isMac ? '"macOS"' : '"Linux"';
      headers['Sec-Ch-Ua-Platform-Version'] = isWindows ? '"15.0.0"' : isMac ? '"14.0.0"' : '"6.5.0"';
      headers['Sec-Fetch-Dest'] = 'empty';
      headers['Sec-Fetch-Mode'] = 'cors';
      headers['Sec-Fetch-Site'] = 'same-origin';
      headers['Sec-Fetch-User'] = '?1';
    }
    
    // Add random timestamp to make requests look more natural
    headers['X-Requested-With'] = 'XMLHttpRequest';
    
    return headers;
  }

  /**
   * Add random delay to mimic human behavior
   */
  async addHumanDelay() {
    const timeSinceLastRequest = Date.now() - this.lastRequestTime;
    const delayNeeded = Math.max(0, this.minDelayBetweenRequests - timeSinceLastRequest);
    
    if (delayNeeded > 0) {
      // Add random jitter (0-1 second)
      const jitter = Math.random() * 1000;
      await new Promise(resolve => setTimeout(resolve, delayNeeded + jitter));
    }
    
    this.lastRequestTime = Date.now();
  }

  /**
   * Post a new tweet with media
   */
  async postTweetWithMedia(text, mediaUrls = [], retryCount = 0) {
    const maxRetries = 3;
    const retryDelay = (retryCount + 1) * 5000;

    try {
      await this.addHumanDelay();

      console.log('🐦 [TWEETAPI V2] Posting tweet with media:', text.substring(0, 50) + '...');
      console.log('📷 [TWEETAPI V2] Media URLs:', mediaUrls);

      const payload = {
        authToken: this.authToken,
        body: text,  // API requires both 'body' and 'text'
        text: text,  // API requires both parameters
        media: mediaUrls.map(url => ({ url }))
      };

      // API requires 'proxy' parameter (even if empty string)
      // If proxy is disabled or not configured, use empty string
      if (this.proxyDisabled || !this.proxy || this.proxy.trim() === '') {
        payload.proxy = '';
      } else {
        payload.proxy = this.proxy;
      }

      const headers = this.getBrowserHeaders();

      const response = await axios.post(`${this.baseUrl}/tw-v2/interaction/create-post-with-media`, payload, {
        headers: headers,
        timeout: 60000, // Increased to 60s to handle proxy timeouts better
        maxRedirects: 5,
        validateStatus: (status) => status < 500
      });

      if ((response.status === 403 || response.status === 504) && retryCount < maxRetries) {
        console.warn(`⚠️ [TWEETAPI V2] Media post hit ${response.status}, retrying... (${retryCount + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        return await this.postTweetWithMedia(text, mediaUrls, retryCount + 1);
      }

      if (response.data?.data?.success) {
        // Reset consecutive proxy failures on success
        this.consecutiveProxyFailures = 0;
        
        const tweetData = response.data.data;
        console.log('✅ [TWEETAPI V2] Tweet with media posted successfully!');
        console.log('🔗 [TWEETAPI V2] Tweet URL:', tweetData.metadata?.url);
        console.log('🆔 [TWEETAPI V2] Tweet ID:', tweetData.metadata?.tweet_id);

        return {
          success: true,
          tweet_id: tweetData.metadata?.tweet_id,
          url: tweetData.metadata?.url,
          text: tweetData.metadata?.text,
          author: tweetData.metadata?.author_username,
          created_at: tweetData.metadata?.created_at,
          media_count: mediaUrls.length,
          raw: tweetData
        };
      } else {
        console.log('❌ [TWEETAPI V2] Tweet with media posting failed:', response.data);
        return {
          success: false,
          error: response.data?.message || 'Unknown error',
          raw: response.data
        };
      }

    } catch (error) {
      console.error('💥 [TWEETAPI V2] Exception posting tweet with media:', error.message);

      if (error.response) {
        const status = error.response.status;
        const responseData = error.response.data || {};
        console.error('📡 [TWEETAPI V2] Response status:', status);
        console.error('📄 [TWEETAPI V2] Response data:', responseData);

        // Check for proxy timeout specifically
        const isProxyTimeout = status === 504 && (
          responseData.message?.includes('proxy timeout') ||
          responseData.message?.includes('proxy configuration') ||
          responseData.message?.includes('connectivity')
        );

        if (isProxyTimeout) {
          console.warn(`⚠️ [TWEETAPI V2] Proxy timeout detected (${responseData.message || 'unknown'})`);
          if (retryCount < maxRetries) {
            // Longer delay for proxy timeouts (10s, 20s, 30s)
            const proxyRetryDelay = (retryCount + 1) * 10000;
            console.warn(`⚠️ [TWEETAPI V2] Retrying media post after proxy timeout (${retryCount + 1}/${maxRetries}) in ${proxyRetryDelay}ms...`);
            
            // On last retry, try without proxy if one is configured
            if (retryCount === maxRetries - 1 && this.proxy && this.proxy.trim() !== '') {
              console.warn(`⚠️ [TWEETAPI V2] Last retry - attempting without proxy...`);
              const originalProxy = this.proxy;
              this.proxy = ''; // Disable proxy for this attempt
              await new Promise(resolve => setTimeout(resolve, proxyRetryDelay));
              const result = await this.postTweetWithMedia(text, mediaUrls, retryCount + 1);
              this.proxy = originalProxy; // Restore proxy
              return result;
            }
            
            await new Promise(resolve => setTimeout(resolve, proxyRetryDelay));
            return await this.postTweetWithMedia(text, mediaUrls, retryCount + 1);
          }
        } else if ((status === 403 || status === 504) && retryCount < maxRetries) {
          console.warn(`⚠️ [TWEETAPI V2] Retrying media post after ${status} error (${retryCount + 1}/${maxRetries})...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          return await this.postTweetWithMedia(text, mediaUrls, retryCount + 1);
        }

        return {
          success: false,
          error: responseData.message || `HTTP ${status}`,
          status: status,
          raw: responseData
        };
      }

      return {
        success: false,
        error: error.message,
        raw: null
      };
    }
  }

  /**
   * Post a new tweet with retry logic for 403/504 errors
   */
  async postTweet(text, retryCount = 0) {
    const maxRetries = 3;
    const retryDelay = (retryCount + 1) * 5000; // 5s, 10s, 15s

    try {
      // Validate input
      if (!text || typeof text !== 'string' || text.trim() === '') {
        console.error('❌ [TWEETAPI V2] Invalid text parameter:', text);
        return {
          success: false,
          error: 'Text is required and must be a non-empty string'
        };
      }

      // Add human-like delay before request
      await this.addHumanDelay();

      console.log('🐦 [TWEETAPI V2] Posting tweet:', text.substring(0, 50) + '...');

      // Ensure text is a string and not empty
      const tweetText = String(text).trim();
      if (!tweetText) {
        console.error('❌ [TWEETAPI V2] Text is empty after trimming');
        return {
          success: false,
          error: 'Text cannot be empty'
        };
      }

      const payload = {
        authToken: this.authToken,
        body: tweetText,  // API requires both 'body' and 'text'
        text: tweetText   // API requires both parameters
      };

      // API requires 'proxy' parameter (even if empty string)
      // If proxy is disabled or not configured, use empty string
      if (this.proxyDisabled || !this.proxy || this.proxy.trim() === '') {
        payload.proxy = '';
      } else {
        payload.proxy = this.proxy;
      }

      // Debug: Log payload structure (without sensitive data)
      console.log('🔍 [TWEETAPI V2] Payload keys:', Object.keys(payload));
      console.log('🔍 [TWEETAPI V2] Has body:', !!payload.body, `(${typeof payload.body})`);
      console.log('🔍 [TWEETAPI V2] Has text:', !!payload.text, `(${typeof payload.text})`);
      console.log('🔍 [TWEETAPI V2] Has proxy:', 'proxy' in payload, `(${typeof payload.proxy}, value: "${payload.proxy}")`);
      console.log('🔍 [TWEETAPI V2] Body length:', payload.body?.length || 0);
      console.log('🔍 [TWEETAPI V2] Text length:', payload.text?.length || 0);

      // Get fresh browser headers with rotation (especially important on retries)
      const headers = this.getBrowserHeaders();

      // On retry, add extra delay and rotate User-Agent
      if (retryCount > 0) {
        console.log(`🔄 [TWEETAPI V2] Retry attempt ${retryCount}/${maxRetries} after ${retryDelay}ms delay...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        this.currentUserAgentIndex = Math.floor(Math.random() * this.userAgents.length);
        const retryHeaders = this.getBrowserHeaders();
        Object.assign(headers, retryHeaders);
      }

      // Final validation - ensure all required fields are present
      if (!payload.body || !payload.text) {
        console.error('❌ [TWEETAPI V2] Missing required fields in payload:', {
          hasBody: !!payload.body,
          hasText: !!payload.text,
          hasProxy: 'proxy' in payload
        });
        return {
          success: false,
          error: 'Missing required fields: body or text is missing'
        };
      }

      // Ensure proxy is always present (required by API)
      if (!('proxy' in payload)) {
        payload.proxy = '';
      }

      // Log final payload structure before sending
      console.log('📤 [TWEETAPI V2] Sending payload with keys:', Object.keys(payload));
      console.log('📤 [TWEETAPI V2] Payload structure:', {
        hasAuthToken: !!payload.authToken,
        hasBody: !!payload.body,
        bodyType: typeof payload.body,
        bodyLength: payload.body?.length || 0,
        hasText: !!payload.text,
        textType: typeof payload.text,
        textLength: payload.text?.length || 0,
        hasProxy: 'proxy' in payload,
        proxyType: typeof payload.proxy,
        proxyValue: payload.proxy ? '***configured***' : 'empty string'
      });

      const response = await axios.post(`${this.baseUrl}/tw-v2/interaction/create-post`, payload, {
        headers: headers,
        timeout: 60000, // Increased to 60s to handle proxy timeouts better
        maxRedirects: 5,
        validateStatus: (status) => status < 500 // Don't throw on 4xx errors
      });

      // Handle 400 errors (validation errors) - log and return error immediately
      if (response.status === 400) {
        console.error('❌ [TWEETAPI V2] Validation error (400):', response.data);
        return {
          success: false,
          error: response.data?.message || 'Validation error',
          status: 400,
          raw: response.data
        };
      }

      if ((response.status === 403 || response.status === 504) && retryCount < maxRetries) {
        console.warn(`⚠️ [TWEETAPI V2] Got ${response.status}, retrying... (${retryCount + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        return await this.postTweet(text, retryCount + 1);
      }

      if (response.data?.data?.success) {
        // Reset consecutive proxy failures on success
        this.consecutiveProxyFailures = 0;
        
        const tweetData = response.data.data;
        console.log('✅ [TWEETAPI V2] Tweet posted successfully!');
        console.log('🔗 [TWEETAPI V2] Tweet URL:', tweetData.metadata?.url);
        console.log('🆔 [TWEETAPI V2] Tweet ID:', tweetData.metadata?.tweet_id);

        return {
          success: true,
          tweet_id: tweetData.metadata?.tweet_id,
          url: tweetData.metadata?.url,
          text: tweetData.metadata?.text,
          author: tweetData.metadata?.author_username,
          created_at: tweetData.metadata?.created_at,
          raw: tweetData
        };
      } else {
        console.log('❌ [TWEETAPI V2] Tweet posting failed:', response.data);
        return {
          success: false,
          error: response.data?.message || 'Unknown error',
          raw: response.data
        };
      }

    } catch (error) {
      console.error('💥 [TWEETAPI V2] Exception posting tweet:', error.message);

      if (error.response) {
        const status = error.response.status;
        const responseData = error.response.data || {};
        console.error('📡 [TWEETAPI V2] Response status:', status);
        console.error('📄 [TWEETAPI V2] Response data:', responseData);

        // Check for proxy timeout specifically (504 with proxy-related message)
        const isProxyTimeout = status === 504 && (
          responseData.message?.includes('proxy timeout') ||
          responseData.message?.includes('proxy configuration') ||
          responseData.message?.includes('connectivity') ||
          responseData.message?.includes('User proxy timeout')
        );

        // Also treat generic 504 as potential proxy issue if proxy is configured
        const isGeneric504 = status === 504 && !isProxyTimeout && this.proxy && this.proxy.trim() !== '';

        if (isProxyTimeout || isGeneric504) {
          if (isProxyTimeout) {
            this.consecutiveProxyFailures++;
            console.warn(`⚠️ [TWEETAPI V2] Proxy timeout detected (${responseData.message || 'unknown'})`);
          } else {
            this.consecutiveProxyFailures++;
            console.warn(`⚠️ [TWEETAPI V2] Generic 504 error (possibly proxy-related)`);
          }
          
          console.warn(`⚠️ [TWEETAPI V2] Consecutive proxy failures: ${this.consecutiveProxyFailures}/${this.maxConsecutiveProxyFailures}`);
          
          // Auto-disable proxy after too many consecutive failures
          if (this.consecutiveProxyFailures >= this.maxConsecutiveProxyFailures && !this.proxyDisabled) {
            console.warn(`🚫 [TWEETAPI V2] Auto-disabling proxy after ${this.consecutiveProxyFailures} consecutive failures`);
            this.proxyDisabled = true;
            this.proxy = '';
          }
          
          if (retryCount < maxRetries) {
            // Longer delay for proxy timeouts (10s, 20s, 30s)
            const proxyRetryDelay = (retryCount + 1) * 10000;
            console.warn(`⚠️ [TWEETAPI V2] Retrying after ${isProxyTimeout ? 'proxy timeout' : '504 error'} (${retryCount + 1}/${maxRetries}) in ${proxyRetryDelay}ms...`);
            
            // If proxy is disabled or on last retry, try without proxy
            if (this.proxyDisabled || (retryCount === maxRetries - 1 && this.proxy && this.proxy.trim() !== '')) {
              console.warn(`⚠️ [TWEETAPI V2] Retrying without proxy...`);
              const originalProxy = this.proxy;
              this.proxy = ''; // Disable proxy for this attempt
              await new Promise(resolve => setTimeout(resolve, proxyRetryDelay));
              const result = await this.postTweet(text, retryCount + 1);
              if (!this.proxyDisabled) {
                this.proxy = originalProxy; // Restore proxy (if not permanently disabled)
              }
              return result;
            }
            
            await new Promise(resolve => setTimeout(resolve, proxyRetryDelay));
            return await this.postTweet(text, retryCount + 1);
          }
        } else if ((status === 403 || status === 504) && retryCount < maxRetries) {
          // Reset consecutive failures on non-proxy errors
          this.consecutiveProxyFailures = 0;
          console.warn(`⚠️ [TWEETAPI V2] Retrying after ${status} error (${retryCount + 1}/${maxRetries})...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          return await this.postTweet(text, retryCount + 1);
        } else {
          // Reset consecutive failures on other errors
          this.consecutiveProxyFailures = 0;
        }

        return {
          success: false,
          error: responseData.message || `HTTP ${status}`,
          status: status,
          raw: responseData
        };
      }

      return {
        success: false,
        error: error.message,
        raw: null
      };
    }
  }

  /**
   * Post a reply to a specific tweet
   */
  async postReply(text, tweetId, retryCount = 0) {
    const maxRetries = 3;
    const retryDelay = (retryCount + 1) * 5000;

    try {
      // Add human-like delay before request
      await this.addHumanDelay();

      console.log('💬 [TWEETAPI V2] Posting reply to tweet:', tweetId);

      const payload = {
        authToken: this.authToken,
        body: text,  // API requires both 'body' and 'text'
        text: text,  // API requires both parameters
        tweetId: tweetId
      };

      // API requires 'proxy' parameter (even if empty string)
      // If proxy is disabled or not configured, use empty string
      if (this.proxyDisabled || !this.proxy || this.proxy.trim() === '') {
        payload.proxy = '';
      } else {
        payload.proxy = this.proxy;
      }

      // Get fresh browser headers with rotation
      const headers = this.getBrowserHeaders();

      const response = await axios.post(`${this.baseUrl}/tw-v2/interaction/reply-post`, payload, {
        headers: headers,
        timeout: 60000, // Increased to 60s to handle proxy timeouts better
        maxRedirects: 5,
        validateStatus: (status) => status < 500
      });

      if ((response.status === 403 || response.status === 504) && retryCount < maxRetries) {
        console.warn(`⚠️ [TWEETAPI V2] Reply hit ${response.status}, retrying... (${retryCount + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        return await this.postReply(text, tweetId, retryCount + 1);
      }

      if (response.data?.data?.success) {
        const tweetData = response.data.data;
        console.log('✅ [TWEETAPI V2] Reply posted successfully!');
        console.log('🔗 [TWEETAPI V2] Reply URL:', tweetData.metadata?.url);
        console.log('🆔 [TWEETAPI V2] Reply ID:', tweetData.metadata?.tweet_id);
        console.log('↩️ [TWEETAPI V2] In reply to:', tweetData.metadata?.in_reply_to_tweet_id);

        return {
          success: true,
          tweet_id: tweetData.metadata?.tweet_id,
          url: tweetData.metadata?.url,
          text: tweetData.metadata?.text,
          author: tweetData.metadata?.author_username,
          created_at: tweetData.metadata?.created_at,
          in_reply_to_tweet_id: tweetData.metadata?.in_reply_to_tweet_id,
          in_reply_to_username: tweetData.metadata?.in_reply_to_username,
          raw: tweetData
        };
      } else {
        console.log('❌ [TWEETAPI V2] Reply posting failed:', response.data);
        return {
          success: false,
          error: response.data?.message || 'Unknown error',
          raw: response.data
        };
      }

    } catch (error) {
      console.error('💥 [TWEETAPI V2] Exception posting reply:', error.message);

      if (error.response) {
        const status = error.response.status;
        const responseData = error.response.data || {};
        console.error('📡 [TWEETAPI V2] Response status:', status);
        console.error('📄 [TWEETAPI V2] Response data:', responseData);

        // Check for proxy timeout specifically
        const isProxyTimeout = status === 504 && (
          responseData.message?.includes('proxy timeout') ||
          responseData.message?.includes('proxy configuration') ||
          responseData.message?.includes('connectivity')
        );

        if (isProxyTimeout) {
          console.warn(`⚠️ [TWEETAPI V2] Proxy timeout detected (${responseData.message || 'unknown'})`);
          if (retryCount < maxRetries) {
            // Longer delay for proxy timeouts (10s, 20s, 30s)
            const proxyRetryDelay = (retryCount + 1) * 10000;
            console.warn(`⚠️ [TWEETAPI V2] Retrying reply after proxy timeout (${retryCount + 1}/${maxRetries}) in ${proxyRetryDelay}ms...`);
            
            // On last retry, try without proxy if one is configured
            if (retryCount === maxRetries - 1 && this.proxy && this.proxy.trim() !== '') {
              console.warn(`⚠️ [TWEETAPI V2] Last retry - attempting without proxy...`);
              const originalProxy = this.proxy;
              this.proxy = ''; // Disable proxy for this attempt
              await new Promise(resolve => setTimeout(resolve, proxyRetryDelay));
              const result = await this.postReply(text, tweetId, retryCount + 1);
              this.proxy = originalProxy; // Restore proxy
              return result;
            }
            
            await new Promise(resolve => setTimeout(resolve, proxyRetryDelay));
            return await this.postReply(text, tweetId, retryCount + 1);
          }
        } else if ((status === 403 || status === 504) && retryCount < maxRetries) {
          console.warn(`⚠️ [TWEETAPI V2] Retrying reply after ${status} error (${retryCount + 1}/${maxRetries})...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          return await this.postReply(text, tweetId, retryCount + 1);
        }

        return {
          success: false,
          error: responseData.message || `HTTP ${status}`,
          status: status,
          raw: responseData
        };
      }

      return {
        success: false,
        error: error.message,
        raw: null
      };
    }
  }

  /**
   * Post a quote tweet
   */
  async postQuoteTweet(text, quoteTweetId, retryCount = 0) {
    const maxRetries = 3;
    const retryDelay = (retryCount + 1) * 5000;

    try {
      // Add human-like delay before request
      await this.addHumanDelay();

      console.log('💭 [TWEETAPI V2] Posting quote tweet for:', quoteTweetId);

      const payload = {
        authToken: this.authToken,
        body: text,  // API requires both 'body' and 'text'
        text: text,  // API requires both parameters
        quoteTweetId: quoteTweetId
      };

      // API requires 'proxy' parameter (even if empty string)
      // If proxy is disabled or not configured, use empty string
      if (this.proxyDisabled || !this.proxy || this.proxy.trim() === '') {
        payload.proxy = '';
      } else {
        payload.proxy = this.proxy;
      }

      // Get fresh browser headers with rotation
      const headers = this.getBrowserHeaders();

      const response = await axios.post(`${this.baseUrl}/tw-v2/interaction/quote-post`, payload, {
        headers: headers,
        timeout: 60000, // Increased to 60s to handle proxy timeouts better
        maxRedirects: 5,
        validateStatus: (status) => status < 500
      });

      if ((response.status === 403 || response.status === 504) && retryCount < maxRetries) {
        console.warn(`⚠️ [TWEETAPI V2] Quote tweet hit ${response.status}, retrying... (${retryCount + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        return await this.postQuoteTweet(text, quoteTweetId, retryCount + 1);
      }

      if (response.data?.data?.success) {
        const tweetData = response.data.data;
        console.log('✅ [TWEETAPI V2] Quote tweet posted successfully!');
        console.log('🔗 [TWEETAPI V2] Quote tweet URL:', tweetData.metadata?.url);

        return {
          success: true,
          tweet_id: tweetData.metadata?.tweet_id,
          url: tweetData.metadata?.url,
          text: tweetData.metadata?.text,
          author: tweetData.metadata?.author_username,
          created_at: tweetData.metadata?.created_at,
          quote_tweet_id: tweetData.metadata?.quote_tweet_id,
          raw: tweetData
        };
      } else {
        console.log('❌ [TWEETAPI V2] Quote tweet posting failed:', response.data);
        return {
          success: false,
          error: response.data?.message || 'Unknown error',
          raw: response.data
        };
      }

    } catch (error) {
      console.error('💥 [TWEETAPI V2] Exception posting quote tweet:', error.message);

      if (error.response) {
        const status = error.response.status;
        const responseData = error.response.data || {};
        console.error('📡 [TWEETAPI V2] Response status:', status);
        console.error('📄 [TWEETAPI V2] Response data:', responseData);

        // Check for proxy timeout specifically
        const isProxyTimeout = status === 504 && (
          responseData.message?.includes('proxy timeout') ||
          responseData.message?.includes('proxy configuration') ||
          responseData.message?.includes('connectivity')
        );

        if (isProxyTimeout) {
          console.warn(`⚠️ [TWEETAPI V2] Proxy timeout detected (${responseData.message || 'unknown'})`);
          if (retryCount < maxRetries) {
            // Longer delay for proxy timeouts (10s, 20s, 30s)
            const proxyRetryDelay = (retryCount + 1) * 10000;
            console.warn(`⚠️ [TWEETAPI V2] Retrying quote tweet after proxy timeout (${retryCount + 1}/${maxRetries}) in ${proxyRetryDelay}ms...`);
            
            // On last retry, try without proxy if one is configured
            if (retryCount === maxRetries - 1 && this.proxy && this.proxy.trim() !== '') {
              console.warn(`⚠️ [TWEETAPI V2] Last retry - attempting without proxy...`);
              const originalProxy = this.proxy;
              this.proxy = ''; // Disable proxy for this attempt
              await new Promise(resolve => setTimeout(resolve, proxyRetryDelay));
              const result = await this.postQuoteTweet(text, quoteTweetId, retryCount + 1);
              this.proxy = originalProxy; // Restore proxy
              return result;
            }
            
            await new Promise(resolve => setTimeout(resolve, proxyRetryDelay));
            return await this.postQuoteTweet(text, quoteTweetId, retryCount + 1);
          }
        } else if ((status === 403 || status === 504) && retryCount < maxRetries) {
          console.warn(`⚠️ [TWEETAPI V2] Retrying quote after ${status} error (${retryCount + 1}/${maxRetries})...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          return await this.postQuoteTweet(text, quoteTweetId, retryCount + 1);
        }

        return {
          success: false,
          error: responseData.message || `HTTP ${status}`,
          status: status,
          raw: responseData
        };
      }

      return {
        success: false,
        error: error.message,
        raw: null
      };
    }
  }

  /**
   * Test the service by posting a simple tweet
   */
  async testService() {
    try {
      console.log('🧪 [TWEETAPI V2] Testing service...');
      
      const testTweet = `🧪 TweetAPI v2 test - ${new Date().toISOString()}`;
      const result = await this.postTweet(testTweet);
      
      if (result.success) {
        console.log('✅ [TWEETAPI V2] Service test successful!');
        return {
          success: true,
          message: 'TweetAPI v2 service is working',
          tweet_url: result.url,
          tweet_id: result.tweet_id
        };
      } else {
        console.log('❌ [TWEETAPI V2] Service test failed:', result.error);
        return {
          success: false,
          error: result.error,
          status: result.status
        };
      }
      
    } catch (error) {
      console.error('💥 [TWEETAPI V2] Service test exception:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

export default TweetAPIPostingService;