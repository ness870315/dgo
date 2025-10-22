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
    
    // Browser headers to mimic real browser requests and bypass automation detection
    this.browserHeaders = {
      'X-API-Key': this.apiKey,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Referer': 'https://twitter.com/',
      'Origin': 'https://twitter.com',
      'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"Windows"',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'cross-site',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache'
    };
    
    console.log('🐦 [TWEETAPI V2] Service initialized with browser headers');
  }

  /**
   * Post a new tweet with media
   */
  async postTweetWithMedia(text, mediaUrls = []) {
    try {
      console.log('🐦 [TWEETAPI V2] Posting tweet with media:', text.substring(0, 50) + '...');
      console.log('📷 [TWEETAPI V2] Media URLs:', mediaUrls);
      
      const payload = {
        authToken: this.authToken,
        text: text,
        media: mediaUrls.map(url => ({ url }))
      };

      const response = await axios.post(`${this.baseUrl}/tw-v2/interaction/create-post-with-media`, payload, {
        headers: this.browserHeaders,
        timeout: 30000
      });

      if (response.data?.data?.success) {
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
        console.error('📡 [TWEETAPI V2] Response status:', error.response.status);
        console.error('📄 [TWEETAPI V2] Response data:', error.response.data);
        
        return {
          success: false,
          error: error.response.data?.message || `HTTP ${error.response.status}`,
          status: error.response.status,
          raw: error.response.data
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
   * Post a new tweet
   */
  async postTweet(text) {
    try {
      console.log('🐦 [TWEETAPI V2] Posting tweet:', text.substring(0, 50) + '...');
      
      const payload = {
        authToken: this.authToken,
        text: text
      };

      const response = await axios.post(`${this.baseUrl}/tw-v2/interaction/create-post`, payload, {
        headers: this.browserHeaders,
        timeout: 30000
      });

      if (response.data?.data?.success) {
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
        console.error('📡 [TWEETAPI V2] Response status:', error.response.status);
        console.error('📄 [TWEETAPI V2] Response data:', error.response.data);
        
        return {
          success: false,
          error: error.response.data?.message || `HTTP ${error.response.status}`,
          status: error.response.status,
          raw: error.response.data
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
  async postReply(text, tweetId) {
    try {
      console.log('💬 [TWEETAPI V2] Posting reply to tweet:', tweetId);
      
      const payload = {
        authToken: this.authToken,
        text: text,
        tweetId: tweetId
      };

      const response = await axios.post(`${this.baseUrl}/tw-v2/interaction/reply-post`, payload, {
        headers: this.browserHeaders,
        timeout: 30000
      });

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
        console.error('📡 [TWEETAPI V2] Response status:', error.response.status);
        console.error('📄 [TWEETAPI V2] Response data:', error.response.data);
        
        return {
          success: false,
          error: error.response.data?.message || `HTTP ${error.response.status}`,
          status: error.response.status,
          raw: error.response.data
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
  async postQuoteTweet(text, quoteTweetId) {
    try {
      console.log('💭 [TWEETAPI V2] Posting quote tweet for:', quoteTweetId);
      
      const payload = {
        authToken: this.authToken,
        text: text,
        quoteTweetId: quoteTweetId
      };

      const response = await axios.post(`${this.baseUrl}/tw-v2/interaction/quote-post`, payload, {
        headers: this.browserHeaders,
        timeout: 30000
      });

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
        console.error('📡 [TWEETAPI V2] Response status:', error.response.status);
        console.error('📄 [TWEETAPI V2] Response data:', error.response.data);
        
        return {
          success: false,
          error: error.response.data?.message || `HTTP ${error.response.status}`,
          status: error.response.status,
          raw: error.response.data
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