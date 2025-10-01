/**
 * 🧠 Smart Twitter Refresh Service
 * Implements hybrid approach with smart deduplication to avoid fetching duplicate tweets
 * while maintaining the 5-tweet limit and maximizing API efficiency.
 */

class SmartTwitterRefreshService {
  constructor() {
    this.twitterServiceUrl = process.env.TWITTER_SERVICE_URL || 'https://dgo-2.onrender.com';
  }

  /**
   * Smart Twitter data refresh with deduplication
   * @param {string} symbol - Token symbol
   * @param {string} name - Token name
   * @param {Object} existingData - Current Twitter data
   * @param {string} officialHandle - Official Twitter handle
   * @param {Object} socialLinks - Social media links
   * @param {Object} metadata - Token metadata (marketCap, volume24h) for projection
   * @returns {Object} Refreshed Twitter data with smart deduplication
   */
  async refreshTwitterData(symbol, name, existingData, officialHandle = null, socialLinks = null, metadata = null) {
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
      
      // Merge with existing data and apply projection
      return this.mergeTwitterData(existingData, bestTweets, symbol, metadata);
      
    } catch (error) {
      console.error(`❌ Smart refresh failed for ${symbol}:`, error.message);
      return existingData; // Return existing data on error
    }
  }

  /**
   * Strategy 1: Timestamp-based search (most efficient)
   * Uses consistent 72-hour window logic to prevent infinite loops
   */
  async tryTimestampBasedSearch(symbol, existingData, officialHandle, socialLinks) {
    try {
      // 🚨 FIX: Use consistent 72-hour window logic
      const now = Date.now();
      let startTime;
      
      // Check for existing Twitter timestamp (from twitterTimestamp field)
      const lastTwitterRefresh = existingData.lastRefreshed || existingData.twitterTimestamp || existingData.lastUpdate || existingData.lastUpdated;
      
      if (lastTwitterRefresh) {
        const lastRefreshTime = new Date(lastTwitterRefresh).getTime();
        const hoursSinceRefresh = (now - lastRefreshTime) / (1000 * 60 * 60);
        
        // Only search if it's been more than 72 hours since last refresh
        if (hoursSinceRefresh < 72) {
          console.log(`🧠 ${symbol}: Only ${hoursSinceRefresh.toFixed(1)}h since last refresh, skipping (72h cooldown)`);
          return [];
        }
        
        // Use the last refresh time as start_time to get only new tweets
        startTime = new Date(lastRefreshTime).toISOString();
        console.log(`🧠 ${symbol}: Using last refresh time as start_time (${hoursSinceRefresh.toFixed(1)}h ago)`);
      } else {
        // No previous refresh data - use 7 days ago as fallback (consistent with EnhancedSocialDataService)
        startTime = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
        console.log(`🧠 ${symbol}: No previous refresh data, using 7-day window`);
      }

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
  mergeTwitterData(existingData, newTweets, symbol, metadata = null) {
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
    
    // 🚀 APPLY SMART PROJECTION (same as main service)
    const totalMentions = finalTweets.length;
    let displayMentions = totalMentions;
    
    // Calculate engagement multiplier
    const avgEngagement = finalTweets.length > 0 
      ? finalTweets.reduce((sum, t) => sum + (t.likes || 0) + (t.retweets || 0), 0) / finalTweets.length
      : 0;
    let engagementMultiplier = 1.0;
    if (avgEngagement >= 100) engagementMultiplier = 2.5;
    else if (avgEngagement >= 50) engagementMultiplier = 2.0;
    else if (avgEngagement >= 20) engagementMultiplier = 1.5;
    else if (avgEngagement >= 5) engagementMultiplier = 1.2;
    
    // If metadata available, use volume-weighted projection
    if (metadata) {
      const mcap = metadata.marketCap || null;
      const volume24h = metadata.volume24h || null;
      
      // Market cap multiplier (reduced range)
      let mcapMultiplier = mcap ? 
        (mcap >= 100_000_000 ? 5 : mcap >= 50_000_000 ? 4 : mcap >= 10_000_000 ? 3 : 
         mcap >= 5_000_000 ? 2.5 : mcap >= 1_000_000 ? 2 : 1.5) : 2;
      
      // Volume multiplier (scales with trading activity - high volume = high social buzz)
      let volumeMultiplier = volume24h ?
        (volume24h >= 100_000_000 ? 40.0 :  // $100M+ = Ultra whale territory
         volume24h >= 50_000_000 ? 30.0 :   // $50M+ = Major league
         volume24h >= 20_000_000 ? 25.0 :   // $20M+ = Hot token
         volume24h >= 10_000_000 ? 20.0 :   // $10M+ = Very hot
         volume24h >= 5_000_000 ? 15.0 :    // $5M+ = Hot
         volume24h >= 1_000_000 ? 10.0 :    // $1M+ = Active
         volume24h >= 500_000 ? 6.0 :       // $500k+ = Warm
         volume24h >= 100_000 ? 3.0 :       // $100k+ = Decent
         volume24h >= 50_000 ? 2.5 :        // $50k+ = Low
         volume24h >= 10_000 ? 2.0 :        // $10k+ = Micro
         volume24h >= 5_000 ? 1.5 :         // $5k+ = Very low
         volume24h >= 1_000 ? 1.2 : 1.0)    // $1k+ = Minimal
        : 1.0;
      
      // Weighted size multiplier (70% volume, 30% mcap)
      let sizeMultiplier = (mcap && volume24h) ? 
        (volumeMultiplier * 0.7 + mcapMultiplier * 0.3) : 
        (volume24h ? volumeMultiplier : Math.min(mcapMultiplier, 3));
      
      // Synergy bonus
      let synergyBonus = 1.0;
      if (mcap && volume24h) {
        const ratio = volume24h / mcap;
        if (ratio >= 0.5) synergyBonus = 2.0;
        else if (ratio >= 0.3) synergyBonus = 1.6;
        else if (ratio >= 0.1) synergyBonus = 1.3;
        else if (ratio >= 0.05) synergyBonus = 1.15;
      }
      
      // Project mentions (NO BASE MULTIPLIER - rely only on volume/size/engagement)
      // Raw count gets multiplied only by actual market factors
      const baseSampleMultiplier = 1.0;
      displayMentions = Math.round(totalMentions * baseSampleMultiplier * sizeMultiplier * engagementMultiplier * synergyBonus);
      
      // Apply floors and ceilings (CONSERVATIVE: lower minimums)
      let minMentions = 10; // Base minimum (was 15)
      if (volume24h >= 100_000) minMentions = Math.max(minMentions, 50);
      else if (volume24h >= 50_000) minMentions = Math.max(minMentions, 30);
      else if (volume24h >= 10_000) minMentions = Math.max(minMentions, 20);
      
      let maxMentions = 500;
      if (mcap) maxMentions = Math.max(maxMentions, Math.min(5000, mcap / 50000));
      if (volume24h) maxMentions = Math.max(maxMentions, Math.min(2000, volume24h / 100));
      
      displayMentions = Math.max(minMentions, Math.min(maxMentions, displayMentions));
      
      const volText = volume24h ? `vol=$${(volume24h/1e6).toFixed(2)}M` : 'vol=unknown';
      console.log(`🚀 Smart refresh projection for ${symbol}: ${totalMentions} → ${displayMentions} (${volText}, ${sizeMultiplier.toFixed(1)}x size, ${synergyBonus}x synergy)`);
    }
    
    const now = new Date().toISOString();
    
    return {
      ...existingData,
      recentMentions: finalTweets,
      mentions: totalMentions,
      displayMentions: displayMentions,
      likes: totalLikes,
      retweets: totalRetweets,
      replies: totalReplies,
      engagement: totalLikes + totalRetweets + totalReplies,
      lastUpdate: now,
      lastRefreshed: now,
      twitterTimestamp: now,
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
      // Import axios dynamically for ES modules
      const { default: axios } = await import('axios');
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
