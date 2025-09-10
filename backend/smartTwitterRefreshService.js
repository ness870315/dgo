/**
 * 🧠 Smart Twitter Refresh Service
 * Implements hybrid approach with smart deduplication to avoid fetching duplicate tweets
 * while maintaining the 5-tweet limit and maximizing API efficiency.
 */

class SmartTwitterRefreshService {
  constructor() {
    this.twitterServiceUrl = process.env.TWITTER_SERVICE_URL || 'http://localhost:8000';
  }

  /**
   * Smart Twitter data refresh with deduplication
   * @param {string} symbol - Token symbol
   * @param {string} name - Token name
   * @param {Object} existingData - Current Twitter data
   * @param {string} officialHandle - Official Twitter handle
   * @param {Object} socialLinks - Social media links
   * @returns {Object} Refreshed Twitter data with smart deduplication
   */
  async refreshTwitterData(symbol, name, existingData, officialHandle = null, socialLinks = null) {
    try {
      console.log(`🧠 Smart refresh for ${symbol}: Starting hybrid deduplication approach`);
      
      // Extract existing tweet IDs for deduplication
      const existingTweetIds = new Set(
        (existingData.recentMentions || []).map(tweet => tweet.tweetId).filter(Boolean)
      );
      
      console.log(`🧠 Found ${existingTweetIds.size} existing tweet IDs to avoid duplicates`);
      
      // Strategy 1: Try timestamp-based search first (most efficient)
      let newTweets = await this.tryTimestampBasedSearch(symbol, existingData, officialHandle, socialLinks);
      
      // Strategy 2: If no new tweets, fall back to regular search with deduplication
      if (newTweets.length === 0) {
        console.log(`🧠 No new tweets from timestamp search, trying regular search with deduplication`);
        newTweets = await this.tryRegularSearchWithDeduplication(symbol, name, existingTweetIds, officialHandle, socialLinks);
      }
      
      // Strategy 3: Remove duplicates and select best tweets
      const uniqueTweets = this.removeDuplicates(newTweets, existingTweetIds);
      const bestTweets = this.selectBestTweets(uniqueTweets, 5);
      
      console.log(`🧠 Smart refresh complete: ${uniqueTweets.length} unique tweets found, ${bestTweets.length} selected`);
      
      // Merge with existing data
      return this.mergeTwitterData(existingData, bestTweets, symbol);
      
    } catch (error) {
      console.error(`❌ Smart refresh failed for ${symbol}:`, error.message);
      return existingData; // Return existing data on error
    }
  }

  /**
   * Strategy 1: Timestamp-based search (most efficient)
   */
  async tryTimestampBasedSearch(symbol, existingData, officialHandle, socialLinks) {
    try {
      const lastUpdate = existingData.lastUpdate || existingData.lastUpdated;
      if (!lastUpdate) {
        console.log(`🧠 No timestamp available for ${symbol}, skipping timestamp search`);
        return [];
      }

      // Use start_time parameter for more precise time filtering
      const startTime = new Date(lastUpdate).toISOString();
      const searchQuery = `#${symbol.toLowerCase()}`;
      
      console.log(`🧠 Timestamp search for ${symbol}: ${searchQuery} since ${startTime}`);
      
      const response = await this.makeTwitterApiCall('/api/twitter/search', {
        q: searchQuery,
        count: 15,
        start_time: startTime
      });
      
      if (response?.success && response.tweets?.length > 0) {
        console.log(`✅ Timestamp search found ${response.tweets.length} new tweets for ${symbol}`);
        return response.tweets;
      }
      
      return [];
    } catch (error) {
      console.log(`⚠️ Timestamp search failed for ${symbol}:`, error.message);
      return [];
    }
  }

  /**
   * Strategy 2: Regular search with deduplication
   */
  async tryRegularSearchWithDeduplication(symbol, name, existingTweetIds, officialHandle, socialLinks) {
    try {
      // Fetch more tweets than needed to account for duplicates
      const searchCount = Math.min(15, 10 + existingTweetIds.size);
      const searchQuery = `#${symbol.toLowerCase()}`;
      
      // Get tweets from last 24 hours to ensure freshness
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      
      console.log(`🧠 Regular search for ${symbol}: fetching ${searchCount} tweets from last 24h`);
      
      const response = await this.makeTwitterApiCall('/api/twitter/search', {
        q: searchQuery,
        count: searchCount,
        start_time: oneDayAgo
      });
      
      if (response?.success && response.tweets?.length > 0) {
        console.log(`✅ Regular search found ${response.tweets.length} tweets for ${symbol}`);
        return response.tweets;
      }
      
      return [];
    } catch (error) {
      console.log(`⚠️ Regular search failed for ${symbol}:`, error.message);
      return [];
    }
  }

  /**
   * Remove duplicate tweets based on tweet ID
   */
  removeDuplicates(tweets, existingTweetIds) {
    const uniqueTweets = tweets.filter(tweet => {
      const tweetId = tweet.id || tweet.tweetId;
      return tweetId && !existingTweetIds.has(tweetId);
    });
    
    console.log(`🧠 Deduplication: ${tweets.length} tweets → ${uniqueTweets.length} unique tweets`);
    return uniqueTweets;
  }

  /**
   * Select best tweets based on engagement and recency
   */
  selectBestTweets(tweets, limit) {
    if (tweets.length <= limit) {
      return tweets;
    }

    // Calculate engagement score for each tweet
    const scoredTweets = tweets.map(tweet => {
      const likes = tweet.favorite_count || tweet.likes || 0;
      const retweets = tweet.retweet_count || tweet.retweets || 0;
      const replies = tweet.reply_count || tweet.replies || 0;
      
      // Engagement score: weighted combination
      const engagementScore = (likes * 1) + (retweets * 2) + (replies * 1.5);
      
      // Recency bonus: newer tweets get slight boost
      const tweetDate = new Date(tweet.created_at);
      const hoursAgo = (Date.now() - tweetDate.getTime()) / (1000 * 60 * 60);
      const recencyBonus = Math.max(0, 24 - hoursAgo) / 24; // Bonus for tweets within 24h
      
      const totalScore = engagementScore + (recencyBonus * 10);
      
      return {
        ...tweet,
        _engagementScore: totalScore,
        _likes: likes,
        _retweets: retweets,
        _replies: replies
      };
    });

    // Sort by score and take top tweets
    const bestTweets = scoredTweets
      .sort((a, b) => b._engagementScore - a._engagementScore)
      .slice(0, limit);

    console.log(`🧠 Selected top ${bestTweets.length} tweets by engagement score`);
    return bestTweets;
  }

  /**
   * Merge new tweets with existing Twitter data
   */
  mergeTwitterData(existingData, newTweets, symbol) {
    const existingMentions = existingData.recentMentions || [];
    
    // Combine existing and new tweets, prioritizing new ones
    const allTweets = [...newTweets, ...existingMentions];
    
    // Remove duplicates and limit to 10 total
    const uniqueTweets = this.deduplicateTweets(allTweets);
    const finalTweets = uniqueTweets.slice(0, 10);
    
    // Recalculate metrics
    const totalLikes = finalTweets.reduce((sum, tweet) => sum + (tweet.likes || 0), 0);
    const totalRetweets = finalTweets.reduce((sum, tweet) => sum + (tweet.retweets || 0), 0);
    const totalReplies = finalTweets.reduce((sum, tweet) => sum + (tweet.replies || 0), 0);
    
    return {
      ...existingData,
      recentMentions: finalTweets,
      mentions: finalTweets.length,
      likes: totalLikes,
      retweets: totalRetweets,
      replies: totalReplies,
      engagement: totalLikes + totalRetweets + totalReplies,
      lastUpdate: new Date().toISOString(),
      _refreshType: 'smart_deduplication',
      _newTweetsAdded: newTweets.length
    };
  }

  /**
   * Deduplicate tweets by ID
   */
  deduplicateTweets(tweets) {
    const seen = new Set();
    return tweets.filter(tweet => {
      const id = tweet.tweetId || tweet.id;
      if (seen.has(id)) {
        return false;
      }
      seen.add(id);
      return true;
    });
  }

  /**
   * Make Twitter API call
   */
  async makeTwitterApiCall(endpoint, params) {
    try {
      const axios = require('axios');
      const response = await axios.get(`${this.twitterServiceUrl}${endpoint}`, {
        params,
        timeout: 30000
      });
      return response.data;
    } catch (error) {
      console.error(`❌ Twitter API call failed:`, error.message);
      throw error;
    }
  }

  /**
   * Check if smart refresh is beneficial
   */
  shouldUseSmartRefresh(existingData) {
    const hasExistingTweets = existingData.recentMentions && existingData.recentMentions.length > 0;
    const lastUpdate = existingData.lastUpdate || existingData.lastUpdated;
    const isRecent = lastUpdate && (Date.now() - new Date(lastUpdate).getTime()) < 24 * 60 * 60 * 1000; // 24 hours
    
    return hasExistingTweets && isRecent;
  }
}

export default SmartTwitterRefreshService;
