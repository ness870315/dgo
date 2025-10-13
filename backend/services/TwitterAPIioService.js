import fetch from 'node-fetch';

/**
 * TwitterAPI.io Service
 * Third-party Twitter API for read-only operations
 * More reliable and cost-effective than official Twitter API
 * 
 * Pricing: $0.15/1k tweets, $0.18/1k user profiles
 * Performance: ~700ms avg response time, 200 QPS support
 * 
 * Documentation: https://docs.twitterapi.io
 */
class TwitterAPIioService {
  constructor(apiKey) {
    this.apiKey = apiKey || process.env.TWITTERAPIIO_API_KEY;
    this.baseUrl = 'https://api.twitterapi.io/twitter';
    
    if (!this.apiKey) {
      throw new Error('TwitterAPI.io API key is required');
    }
    
    console.log('🐦 [TwitterAPI.io] Service initialized');
    console.log('   Base URL:', this.baseUrl);
  }

  /**
   * Get mentions for a user
   * Endpoint: GET /user/mentions
   * 
   * @param {string} userId - Twitter user ID (optional, uses authenticated user if not provided)
   * @param {string} cursor - Pagination cursor for next page
   * @returns {Promise<Object>} - Mentions response with tweets array
   */
  async getMentions(userId = null, cursor = null) {
    try {
      let url = `${this.baseUrl}/user/mentions`;
      
      const params = new URLSearchParams();
      if (userId) params.append('userId', userId);
      if (cursor) params.append('cursor', cursor);
      
      if (params.toString()) {
        url += `?${params.toString()}`;
      }
      
      console.log(`🔍 [TwitterAPI.io] Fetching mentions${userId ? ` for user ${userId}` : ''}...`);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'X-API-Key': this.apiKey
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.status !== 'success') {
        throw new Error(data.message || 'API returned error status');
      }
      
      console.log(`✅ [TwitterAPI.io] Fetched ${data.tweets?.length || 0} mentions`);
      
      return {
        tweets: data.tweets || [],
        hasNextPage: data.has_next_page || false,
        nextCursor: data.next_cursor || null
      };
      
    } catch (error) {
      console.error('❌ [TwitterAPI.io] Error fetching mentions:', error.message);
      throw error;
    }
  }

  /**
   * Get tweets by IDs
   * Endpoint: GET /tweets
   * 
   * @param {string|string[]} tweetIds - Single tweet ID or array of tweet IDs
   * @returns {Promise<Object>} - Tweets response
   */
  async getTweetsByIds(tweetIds) {
    try {
      const ids = Array.isArray(tweetIds) ? tweetIds.join(',') : tweetIds;
      const url = `${this.baseUrl}/tweets?ids=${ids}`;
      
      console.log(`🔍 [TwitterAPI.io] Fetching ${Array.isArray(tweetIds) ? tweetIds.length : 1} tweet(s)...`);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'X-API-Key': this.apiKey
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.status !== 'success') {
        throw new Error(data.message || 'API returned error status');
      }
      
      console.log(`✅ [TwitterAPI.io] Fetched ${data.tweets?.length || 0} tweet(s)`);
      
      return {
        tweets: data.tweets || []
      };
      
    } catch (error) {
      console.error('❌ [TwitterAPI.io] Error fetching tweets:', error.message);
      throw error;
    }
  }

  /**
   * Get a single tweet by ID (convenience method)
   * @param {string} tweetId - Tweet ID
   * @returns {Promise<Object|null>} - Tweet object or null if not found
   */
  async getTweetById(tweetId) {
    try {
      const result = await this.getTweetsByIds(tweetId);
      return result.tweets[0] || null;
    } catch (error) {
      console.error(`❌ [TwitterAPI.io] Error fetching tweet ${tweetId}:`, error.message);
      return null;
    }
  }

  /**
   * Transform twitterapi.io tweet format to our internal format
   * Ensures compatibility with existing code
   * 
   * @param {Object} apiTweet - Tweet from twitterapi.io
   * @returns {Object} - Tweet in our internal format
   */
  transformTweet(apiTweet) {
    if (!apiTweet) return null;
    
    return {
      id: apiTweet.id,
      text: apiTweet.text,
      author_id: apiTweet.author?.id,
      author: {
        id: apiTweet.author?.id,
        username: apiTweet.author?.userName,
        name: apiTweet.author?.name,
        profile_image_url: apiTweet.author?.profilePicture
      },
      created_at: apiTweet.createdAt,
      referenced_tweets: apiTweet.inReplyToId ? [
        {
          type: 'replied_to',
          id: apiTweet.inReplyToId
        }
      ] : [],
      public_metrics: {
        retweet_count: apiTweet.retweetCount || 0,
        reply_count: apiTweet.replyCount || 0,
        like_count: apiTweet.likeCount || 0,
        quote_count: apiTweet.quoteCount || 0,
        impression_count: apiTweet.viewCount || 0
      },
      entities: apiTweet.entities || {},
      // Additional fields for compatibility
      conversation_id: apiTweet.conversationId,
      lang: apiTweet.lang,
      source: apiTweet.source
    };
  }

  /**
   * Transform mentions response to our internal format
   * @param {Array} apiTweets - Tweets from twitterapi.io
   * @returns {Array} - Tweets in our internal format
   */
  transformMentions(apiTweets) {
    if (!Array.isArray(apiTweets)) return [];
    return apiTweets.map(tweet => this.transformTweet(tweet)).filter(t => t !== null);
  }

  /**
   * Get service health and usage stats
   */
  async getServiceHealth() {
    try {
      // Test API connectivity
      const testResponse = await fetch(`${this.baseUrl}/user/mentions?limit=1`, {
        method: 'GET',
        headers: { 'X-API-Key': this.apiKey }
      });
      
      return {
        available: testResponse.ok,
        status: testResponse.status,
        message: testResponse.ok ? 'Service healthy' : 'Service unavailable'
      };
      
    } catch (error) {
      return {
        available: false,
        status: 0,
        message: error.message
      };
    }
  }
}

export default TwitterAPIioService;

