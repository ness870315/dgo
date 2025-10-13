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
   * @param {string} userName - Twitter username (e.g., 'dgnoracle')
   * @param {string} sinceId - Only return mentions after this tweet ID (for incremental fetching)
   * @returns {Promise<Object>} - Mentions response with tweets array
   */
  async getMentions(userName = null, sinceId = null) {
    try {
      let url = `${this.baseUrl}/user/mentions`;
      
      const params = new URLSearchParams();
      if (userName) params.append('userName', userName);
      // Note: twitterapi.io doesn't support sinceId filtering, we'll filter client-side
      // if (sinceId) params.append('sinceId', sinceId);
      
      if (params.toString()) {
        url += `?${params.toString()}`;
      }
      
      console.log(`🔍 [TwitterAPI.io] Fetching mentions${userName ? ` for @${userName}` : ''}...`);
      console.log(`📡 [TwitterAPI.io] Request URL: ${url}`);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'X-API-Key': this.apiKey
        }
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`❌ [TwitterAPI.io] Response body:`, errorBody);
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.status !== 'success') {
        throw new Error(data.message || 'API returned error status');
      }
      
      let tweets = data.tweets || [];
      
      // Client-side filtering if sinceId provided (API doesn't support it natively)
      if (sinceId && tweets.length > 0) {
        tweets = tweets.filter(tweet => {
          // Only include tweets with ID greater than sinceId
          return BigInt(tweet.id) > BigInt(sinceId);
        });
        console.log(`🔍 [TwitterAPI.io] Filtered to ${tweets.length} new mentions (since ${sinceId})`);
      }
      
      console.log(`✅ [TwitterAPI.io] Fetched ${tweets.length} mentions`);
      
      return {
        tweets: tweets,
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
      const url = `${this.baseUrl}/tweets?tweet_ids=${ids}`;  // ← Changed to tweet_ids
      
      console.log(`🔍 [TwitterAPI.io] Fetching ${Array.isArray(tweetIds) ? tweetIds.length : 1} tweet(s)...`);
      console.log(`📡 [TwitterAPI.io] Request URL: ${url}`);
      console.log(`📡 [TwitterAPI.io] Tweet IDs: ${ids}`);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'X-API-Key': this.apiKey
        }
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`❌ [TwitterAPI.io] Error body:`, errorBody);
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

