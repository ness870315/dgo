import axios from 'axios';

class TweetAPIV2Service {
  constructor() {
    this.baseURL = 'https://api.tweetapi.com/tw-v2';
    this.apiKey = process.env.TWEETAPI_V2_API_KEY;
    this.authToken = process.env.TWITTER_AUTH_TOKEN;
    
    if (!this.apiKey) {
      console.warn('⚠️ [TWEETAPI V2] No API key configured. Set TWEETAPI_V2_API_KEY environment variable.');
    }
    
    if (!this.authToken) {
      console.warn('⚠️ [TWEETAPI V2] No auth token configured. Set TWITTER_AUTH_TOKEN environment variable.');
    }
  }

  async createPost(text, options = {}) {
    try {
      if (!this.apiKey || !this.authToken) {
        throw new Error('TweetAPI v2 credentials not configured');
      }

      console.log(`🐦 [TWEETAPI V2] Creating post: "${text.substring(0, 50)}..."`);

      const requestBody = {
        authToken: this.authToken,
        text: text,
        ...options
      };

      const response = await axios.post(`${this.baseURL}/interaction/create-post`, requestBody, {
        headers: {
          'X-API-Key': this.apiKey,
          'Content-Type': 'application/json'
        }
      });

      if (response.data && response.data.data && response.data.data.success) {
        console.log(`✅ [TWEETAPI V2] Post created successfully: ${response.data.data.metadata.url}`);
        return {
          success: true,
          tweetId: response.data.data.metadata.tweet_id,
          url: response.data.data.metadata.url,
          data: response.data.data
        };
      } else {
        console.log(`❌ [TWEETAPI V2] Post creation failed:`, response.data);
        return {
          success: false,
          error: response.data.message || 'Unknown error'
        };
      }

    } catch (error) {
      console.error(`❌ [TWEETAPI V2] Error creating post:`, error.message);
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  }

  async createPostWithMedia(text, mediaUrls, options = {}) {
    try {
      if (!this.apiKey || !this.authToken) {
        throw new Error('TweetAPI v2 credentials not configured');
      }

      console.log(`🐦 [TWEETAPI V2] Creating post with media: "${text.substring(0, 50)}..."`);

      const requestBody = {
        authToken: this.authToken,
        text: text,
        media: mediaUrls.map(url => ({ url })),
        ...options
      };

      const response = await axios.post(`${this.baseURL}/interaction/create-post-with-media`, requestBody, {
        headers: {
          'X-API-Key': this.apiKey,
          'Content-Type': 'application/json'
        }
      });

      if (response.data && response.data.data && response.data.data.success) {
        console.log(`✅ [TWEETAPI V2] Post with media created successfully: ${response.data.data.metadata.url}`);
        return {
          success: true,
          tweetId: response.data.data.metadata.tweet_id,
          url: response.data.data.metadata.url,
          data: response.data.data
        };
      } else {
        console.log(`❌ [TWEETAPI V2] Post with media creation failed:`, response.data);
        return {
          success: false,
          error: response.data.message || 'Unknown error'
        };
      }

    } catch (error) {
      console.error(`❌ [TWEETAPI V2] Error creating post with media:`, error.message);
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  }

  async replyToTweet(text, tweetId, options = {}) {
    try {
      if (!this.apiKey || !this.authToken) {
        throw new Error('TweetAPI v2 credentials not configured');
      }

      console.log(`🐦 [TWEETAPI V2] Replying to tweet ${tweetId}: "${text.substring(0, 50)}..."`);

      const requestBody = {
        authToken: this.authToken,
        text: text,
        tweetId: tweetId,
        ...options
      };

      const response = await axios.post(`${this.baseURL}/interaction/reply-post`, requestBody, {
        headers: {
          'X-API-Key': this.apiKey,
          'Content-Type': 'application/json'
        }
      });

      if (response.data && response.data.data && response.data.data.success) {
        console.log(`✅ [TWEETAPI V2] Reply created successfully: ${response.data.data.metadata.url}`);
        return {
          success: true,
          tweetId: response.data.data.metadata.tweet_id,
          url: response.data.data.metadata.url,
          data: response.data.data
        };
      } else {
        console.log(`❌ [TWEETAPI V2] Reply creation failed:`, response.data);
        return {
          success: false,
          error: response.data.message || 'Unknown error'
        };
      }

    } catch (error) {
      console.error(`❌ [TWEETAPI V2] Error creating reply:`, error.message);
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  }

  async getUserById(userId) {
    try {
      if (!this.apiKey) {
        throw new Error('TweetAPI v2 API key not configured');
      }

      const response = await axios.get(`${this.baseURL}/user/by-id?userId=${userId}`, {
        headers: {
          'X-API-Key': this.apiKey,
          'Content-Type': 'application/json'
        }
      });

      return {
        success: true,
        data: response.data
      };

    } catch (error) {
      console.error(`❌ [TWEETAPI V2] Error getting user:`, error.message);
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  }

  async getUserTweets(userId, cursor = null) {
    try {
      if (!this.apiKey) {
        throw new Error('TweetAPI v2 API key not configured');
      }

      let url = `${this.baseURL}/user/tweets?userId=${userId}`;
      if (cursor) {
        url += `&cursor=${cursor}`;
      }

      const response = await axios.get(url, {
        headers: {
          'X-API-Key': this.apiKey,
          'Content-Type': 'application/json'
        }
      });

      return {
        success: true,
        data: response.data
      };

    } catch (error) {
      console.error(`❌ [TWEETAPI V2] Error getting user tweets:`, error.message);
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  }

  // Test method to verify credentials
  async testConnection() {
    try {
      if (!this.apiKey) {
        return { success: false, error: 'No API key configured' };
      }

      // Try to get user info (this should work with just API key)
      const userResponse = await this.getUserById('44196397'); // Elon Musk's ID
      
      if (userResponse.success) {
        console.log('✅ [TWEETAPI V2] Connection test successful');
        return { success: true, message: 'TweetAPI v2 connection working' };
      } else {
        console.log('❌ [TWEETAPI V2] Connection test failed:', userResponse.error);
        return { success: false, error: userResponse.error };
      }

    } catch (error) {
      console.error(`❌ [TWEETAPI V2] Connection test error:`, error.message);
      return { success: false, error: error.message };
    }
  }
}

export default TweetAPIV2Service;
