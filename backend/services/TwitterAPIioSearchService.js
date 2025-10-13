import fetch from 'node-fetch';

/**
 * TwitterAPI.io Search Service
 * Specialized service for searching tweets using TwitterAPI.io's search endpoint
 * Optimized for cashtag/hashtag searches
 * 
 * Key Features:
 * - Cashtag/Hashtag OR queries: ($wizi OR #wizi)
 * - Latest tweets: queryType=Latest
 * - Up to 20 tweets per request
 * - No rate limits, reliable performance
 * - Simple, clean API interface
 * 
 * Pricing: $0.15/1k tweets
 * Performance: ~700ms avg response time
 * 
 * Documentation: https://docs.twitterapi.io
 */
class TwitterAPIioSearchService {
  constructor(apiKey) {
    this.apiKey = apiKey || process.env.TWITTERAPIIO_API_KEY;
    this.baseUrl = 'https://api.twitterapi.io/twitter';
    
    if (!this.apiKey) {
      throw new Error('TwitterAPI.io API key is required for search service');
    }
    
    console.log('🔍 [TwitterAPI.io Search] Service initialized');
    console.log('   Base URL:', this.baseUrl);
    console.log('   Features: Cashtag/Hashtag OR queries, Latest tweets');
  }

  /**
   * Search tweets using TwitterAPI.io advanced_search endpoint
   * 
   * @param {Object} options - Search options
   * @param {string} options.query - Search query (e.g., "$wizi OR #wizi")
   * @param {number} options.count - Number of tweets to return (max 20)
   * @param {string} options.queryType - Query type, defaults to "Latest"
   * @param {string} options.contentTypes - Content types to include (optional)
   * @param {boolean} options.excludeRetweets - Whether to exclude retweets (optional)
   * @param {string} options.startTime - Start time for search (ISO format)
   * @param {string} options.endTime - End time for search (ISO format)
   * @returns {Promise<Object>} - Search response with tweets array
   */
  async searchTweets({
    query,
    count = 20,
    queryType = 'Latest',
    contentTypes = null,
    excludeRetweets = null,
    startTime = null,
    endTime = null
  }) {
    try {
      if (!query || query.trim() === '') {
        throw new Error('Search query is required');
      }

      // Ensure count doesn't exceed TwitterAPI.io limits
      const maxCount = Math.min(count, 20);
      
      const params = new URLSearchParams();
      params.append('query', query.trim());
      params.append('count', maxCount.toString());
      params.append('queryType', queryType);
      
      // Only add optional parameters if they're provided
      if (contentTypes) {
        params.append('contentTypes', contentTypes);
      }
      
      if (excludeRetweets !== null) {
        params.append('excludeRetweets', excludeRetweets.toString());
      }
      
      if (startTime) {
        params.append('startTime', startTime);
      }
      
      if (endTime) {
        params.append('endTime', endTime);
      }
      
      const url = `${this.baseUrl}/tweet/advanced_search?${params.toString()}`;
      
      console.log(`🔍 [TwitterAPI.io Search] Searching tweets...`);
      console.log(`   Query: "${query}"`);
      console.log(`   Count: ${maxCount}`);
      console.log(`   QueryType: ${queryType}`);
      if (contentTypes) console.log(`   ContentTypes: ${contentTypes}`);
      if (excludeRetweets !== null) console.log(`   ExcludeRetweets: ${excludeRetweets}`);
      console.log(`   URL: ${url}`);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'X-API-Key': this.apiKey,
          'Content-Type': 'application/json'
        },
        timeout: 30000 // 30 second timeout
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`❌ [TwitterAPI.io Search] Error response:`, errorBody);
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      // TwitterAPI.io advanced_search returns tweets directly, no status field
      const tweets = data.tweets || [];
      
      console.log(`✅ [TwitterAPI.io Search] Found ${tweets.length} tweets`);
      
      // Log sample tweets for debugging
      if (tweets.length > 0) {
        console.log(`📝 [TwitterAPI.io Search] Sample tweet: "${tweets[0].text?.substring(0, 80)}..."`);
        console.log(`📝 [TwitterAPI.io Search] Tweet type: ${tweets[0].type}`);
        console.log(`📝 [TwitterAPI.io Search] Tweet author: @${tweets[0].author?.userName}`);
      }
      
      return {
        success: true,
        query: query,
        count: tweets.length,
        tweets: tweets,
        source: 'twitterapiio_advanced_search',
        queryType: queryType,
        contentTypes: contentTypes || 'default',
        excludeRetweets: excludeRetweets || 'default',
        hasNextPage: data.has_next_page || false,
        nextCursor: data.next_cursor || null
      };
      
    } catch (error) {
      console.error('❌ [TwitterAPI.io Search] Search failed:', error.message);
      return {
        success: false,
        query: query,
        count: 0,
        tweets: [],
        source: 'twitterapiio_search',
        error: error.message
      };
    }
  }

  /**
   * Search for token mentions using cashtag and hashtag
   * This is the main method for social health score calculation
   * 
   * @param {string} symbol - Token symbol (e.g., "WIZI")
   * @param {number} count - Number of tweets to return (default: 20)
   * @param {string} startTime - Start time for search (ISO format, optional)
   * @returns {Promise<Object>} - Search response with tweets
   */
  async searchTokenMentions(symbol, count = 20, startTime = null) {
    try {
      // Create OR query for both cashtag and hashtag
      const query = `$${symbol} OR #${symbol}`;
      
      console.log(`🔍 [TwitterAPI.io Search] Searching token mentions for: ${symbol}`);
      
      return await this.searchTweets({
        query: query,
        count: count,
        queryType: 'Latest',
        startTime: startTime
      });
      
    } catch (error) {
      console.error(`❌ [TwitterAPI.io Search] Token search failed for ${symbol}:`, error.message);
      return {
        success: false,
        query: symbol,
        count: 0,
        tweets: [],
        source: 'twitterapiio_search',
        error: error.message
      };
    }
  }

  /**
   * Search for user mentions
   * 
   * @param {string} username - Twitter username (without @)
   * @param {number} count - Number of tweets to return (default: 20)
   * @param {string} startTime - Start time for search (ISO format, optional)
   * @returns {Promise<Object>} - Search response with tweets
   */
  async searchUserMentions(username, count = 20, startTime = null) {
    try {
      // Create query for user mentions
      const query = `@${username}`;
      
      console.log(`🔍 [TwitterAPI.io Search] Searching user mentions for: @${username}`);
      
      return await this.searchTweets({
        query: query,
        count: count,
        queryType: 'Latest',
        startTime: startTime
      });
      
    } catch (error) {
      console.error(`❌ [TwitterAPI.io Search] User search failed for @${username}:`, error.message);
      return {
        success: false,
        query: username,
        count: 0,
        tweets: [],
        source: 'twitterapiio_search',
        error: error.message
      };
    }
  }

  /**
   * Transform TwitterAPI.io advanced_search tweet to our internal format
   * Ensures compatibility with existing social health score calculation
   * 
   * @param {Object} apiTweet - Tweet from TwitterAPI.io advanced_search
   * @returns {Object} - Tweet in our internal format
   */
  transformSearchTweet(apiTweet) {
    if (!apiTweet) return null;
    
    return {
      id: apiTweet.id,
      text: apiTweet.text,
      created_at: apiTweet.createdAt,
      user: {
        id: apiTweet.author?.id,
        name: apiTweet.author?.name,
        screen_name: apiTweet.author?.userName,
        profile_image_url: apiTweet.author?.profilePicture,
        followers_count: apiTweet.author?.followers || 0,
        verified: apiTweet.author?.isBlueVerified || false
      },
      retweet_count: apiTweet.retweetCount || 0,
      favorite_count: apiTweet.likeCount || 0,
      reply_count: apiTweet.replyCount || 0,
      quote_count: apiTweet.quoteCount || 0,
      impression_count: apiTweet.viewCount || 0,
      bookmark_count: apiTweet.bookmarkCount || 0,
      // Additional fields for compatibility
      entities: apiTweet.entities || {},
      lang: apiTweet.lang,
      source: apiTweet.source,
      type: apiTweet.type,
      // TwitterAPI.io specific fields
      conversation_id: apiTweet.conversationId,
      in_reply_to_user_id: apiTweet.inReplyToUserId,
      in_reply_to_status_id: apiTweet.inReplyToId,
      in_reply_to_username: apiTweet.inReplyToUsername,
      is_reply: apiTweet.isReply || false,
      is_limited_reply: apiTweet.isLimitedReply || false,
      referenced_tweets: apiTweet.inReplyToId ? [
        {
          type: 'replied_to',
          id: apiTweet.inReplyToId
        }
      ] : [],
      // Additional metadata
      quoted_tweet: apiTweet.quoted_tweet || null,
      retweeted_tweet: apiTweet.retweeted_tweet || null,
      url: apiTweet.url
    };
  }

  /**
   * Transform search response to our internal format
   * @param {Array} apiTweets - Tweets from TwitterAPI.io search
   * @returns {Array} - Tweets in our internal format
   */
  transformSearchTweets(apiTweets) {
    if (!Array.isArray(apiTweets)) return [];
    return apiTweets.map(tweet => this.transformSearchTweet(tweet)).filter(t => t !== null);
  }

  /**
   * Get service health and test connectivity
   */
  async getServiceHealth() {
    try {
      console.log('🏥 [TwitterAPI.io Search] Testing service health...');
      
      // Test with a simple search
      const testResult = await this.searchTweets({
        query: '$BTC',
        count: 1,
        queryType: 'Latest'
      });
      
      return {
        available: testResult.success,
        status: testResult.success ? 200 : 500,
        message: testResult.success ? 'Service healthy' : (testResult.error || 'Service unavailable'),
        testQuery: '$BTC',
        testCount: testResult.count
      };
      
    } catch (error) {
      return {
        available: false,
        status: 0,
        message: error.message,
        testQuery: '$BTC',
        testCount: 0
      };
    }
  }

  /**
   * Get usage statistics and cost estimation
   */
  async getUsageStats() {
    try {
      const health = await this.getServiceHealth();
      
      return {
        service: 'TwitterAPI.io Search',
        status: health.available ? 'healthy' : 'unhealthy',
        pricing: '$0.15 per 1,000 tweets',
        features: [
          'Cashtag/Hashtag OR queries',
          'Latest tweets (queryType=Latest)',
          'Up to 20 tweets per request',
          'No rate limits',
          'Simple API interface'
        ],
        lastTest: new Date().toISOString(),
        testResult: health
      };
      
    } catch (error) {
      return {
        service: 'TwitterAPI.io Search',
        status: 'error',
        error: error.message,
        lastTest: new Date().toISOString()
      };
    }
  }
}

export default TwitterAPIioSearchService;
