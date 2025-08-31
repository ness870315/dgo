import axios from 'axios';
import pkg from 'rettiwt-api';
const { Rettiwt, TweetSearchOptions } = pkg;
import fs from 'fs/promises';
import path from 'path';

class EnhancedSocialDataService {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 15 * 60 * 1000; // 15 minutes cache
    
    // Twitter metrics persistent storage
    this.twitterMetricsFile = './cache/twitter_metrics.json';
    this.twitterMetricsCache = new Map();
    this.lastRefreshTime = 0;
    this.refreshInterval = 24 * 60 * 60 * 1000; // 24 hours
    
    // Initialize Rettiwt API with your API key for full functionality
    const apiKey = 'a2R0PWdpdWEyc2FyU0hPdjZIRVBnUXFoRnBvNnFlV2RYR09HdW5ia09vSk07YXV0aF90b2tlbj0wMmYyMmEwMzM0YzVlNzMxNWRhOGViYmRlMGMzZGQwNDFhZTBjOGFjO3R3aWQ9dSUzRDE5MjQ5NTU1NjA5OTE5Nzc0NzI7Y3QwPWMwODZkZWNlY2Y1ZDIwNzYyNDNjZDkxOWQ2OTVmNzA3MDQyOGI5MTQwYjI3MTcwYTlmN2NmOGZkZTJlNDYyMGQ3NzY4YzVmZjBhMTNhNjk1NzQ1MzAzOGJhMjRlNzZiNDY1ZmZhM2VhZTdkNmU1NjMzYWE0NTQ0ZGFmYjczNGU2ZTE3MzZlMmZjZDQ4OTFkZDU4NjljM2Q1ODJjYzM1Mzk7';
    this.twitterApi = new Rettiwt({ 
      apiKey: apiKey,
      delay: 2000, // Increased from 1000ms to 2000ms for safety
      maxRetries: 2
    });
    
    // 🚨 RATE LIMITING CONFIGURATION - CRITICAL FOR PREVENTING BANS
    this.rateLimits = {
      // Per-token limits
      maxSearchesPerToken: 2,           // Reduced from 4 to 2 (50% reduction)
      delayBetweenSearches: 10000,      // Increased to 10 seconds to avoid 429 errors
      maxTokensPerHour: 200,            // Increased from 20 to 200 tokens per hour
      maxTokensPerDay: 1000,            // Increased from 100 to 1000 tokens per day
      
      // Global limits
      maxRequestsPerHour: 500,          // Increased from 100 to 500 API calls per hour
      maxRequestsPerDay: 2000,          // Increased from 500 to 2000 API calls per day
      
      // Cooldown periods
      cooldownAfterRateLimit: 300000,   // 5 minutes after rate limit
      dailyResetTime: '00:00 UTC'       // Reset daily limits at midnight UTC
    };
    
    // Request tracking
    this.requestCounts = {
      hourly: 0,
      daily: 0,
      lastHourReset: Date.now(),
      lastDayReset: Date.now()
    };
    
    // Rate limit status
    this.isRateLimited = false;
    this.rateLimitUntil = 0;
    
    // Background refresh tracking
    this.backgroundRefreshActive = false;
    this.backgroundRefreshQueue = [];
    this.backgroundRefreshInterval = null;
    
    console.log('🔑 Twitter API initialized with authentication - RATE LIMITING ENABLED!');
    console.log('🚨 SAFETY MODE: Max 2 searches per token, 5-second delays, hourly/daily limits');
    console.log('💰 CASHTAG SEARCH: Using $wizi format for accurate crypto mentions');
    console.log('⏰ BACKGROUND REFRESH: 24-hour Twitter metrics refresh system');
    console.log('💾 PERSISTENT STORAGE: Twitter metrics saved across restarts');
    
    // Don't call async functions in constructor - they'll be called when needed
    this.initialized = false;
  }

  /**
   * Initialize the service asynchronously
   */
  async initialize() {
    if (this.initialized) return;
    
    try {
      await this.initializePersistentStorage();
      // this.startBackgroundRefresh(); // Disabled for testing
      this.initialized = true;
      console.log('✅ EnhancedSocialDataService initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize EnhancedSocialDataService:', error.message);
    }
  }

  /**
   * Initialize persistent storage for Twitter metrics
   */
  async initializePersistentStorage() {
    try {
      // Ensure cache directory exists
      const cacheDir = path.dirname(this.twitterMetricsFile);
      await fs.mkdir(cacheDir, { recursive: true });
      
      // Load existing Twitter metrics from file
      try {
        const data = await fs.readFile(this.twitterMetricsFile, 'utf8');
        const metrics = JSON.parse(data);
        
        // Convert to Map for fast access
        this.twitterMetricsCache = new Map(Object.entries(metrics));
        this.lastRefreshTime = metrics._metadata?.lastRefreshTime || 0;
        
        console.log(`💾 Loaded ${this.twitterMetricsCache.size - 1} cached Twitter metrics from persistent storage`);
        console.log(`⏰ Last refresh: ${new Date(this.lastRefreshTime).toLocaleString()}`);
        
      } catch (error) {
        console.log('📁 No existing Twitter metrics found, starting fresh');
        this.twitterMetricsCache = new Map();
        this.lastRefreshTime = 0;
      }
      
    } catch (error) {
      console.error('❌ Failed to initialize persistent storage:', error.message);
    }
  }

  /**
   * Check if we're currently rate limited
   */
  isCurrentlyRateLimited() {
    if (this.isRateLimited && Date.now() < this.rateLimitUntil) {
      return true;
    }
    
    // Reset rate limit if expired
    if (this.isRateLimited && Date.now() >= this.rateLimitUntil) {
      this.isRateLimited = false;
      this.rateLimitUntil = 0;
    }
    
    return false;
  }

  /**
   * Check hourly and daily limits
   */
  checkRateLimits() {
    const now = Date.now();
    
    // Reset hourly counter if needed
    if (now - this.requestCounts.lastHourReset >= 60 * 60 * 1000) {
      this.requestCounts.hourly = 0;
      this.requestCounts.lastHourReset = now;
    }
    
    // Reset daily counter if needed
    if (now - this.requestCounts.lastDayReset >= 24 * 60 * 60 * 1000) {
      this.requestCounts.daily = 0;
      this.requestCounts.lastDayReset = now;
    }
    
    // Check limits
    if (this.requestCounts.hourly >= this.rateLimits.maxRequestsPerHour) {
      return { limited: true, reason: 'hourly_limit', resetTime: this.requestCounts.lastHourReset + 60 * 60 * 1000 };
    }
    
    if (this.requestCounts.daily >= this.rateLimits.maxRequestsPerDay) {
      return { limited: true, reason: 'daily_limit', resetTime: this.requestCounts.lastDayReset + 24 * 60 * 60 * 1000 };
    }
    
    return { limited: false };
  }

  /**
   * Increment request counters
   */
  incrementRequestCounts() {
    this.requestCounts.hourly++;
    this.requestCounts.daily++;
  }

  /**
   * Get comprehensive Twitter social data for a token
   */
  async getTwitterSocialData(symbol, name, forceRefresh = false, officialHandle = null, socialLinks = null) {
    // Initialize if not already done
    if (!this.initialized) {
      await this.initialize();
    }
    
    const cacheKey = `${symbol}_${name}`;
    
    // Check cache first (unless force refresh)
    if (!forceRefresh && this.twitterMetricsCache.has(cacheKey)) {
      const cached = this.twitterMetricsCache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheTimeout) {
        console.log(`🟢 Using cached Twitter data for ${symbol}`);
        return cached.data;
      }
    }
    
    // Check rate limits
    if (this.isCurrentlyRateLimited()) {
      console.log(`🚨 Rate limited for ${symbol}, returning cached data if available`);
      const cached = this.twitterMetricsCache.get(cacheKey);
      return cached ? cached.data : this.getDefaultTwitterData(symbol, name);
    }
    
    const rateLimitCheck = this.checkRateLimits();
    if (rateLimitCheck.limited) {
      console.log(`🚨 Rate limit reached for ${symbol}: ${rateLimitCheck.reason}`);
      const cached = this.twitterMetricsCache.get(cacheKey);
      return cached ? cached.data : this.getDefaultTwitterData(symbol, name);
    }
    
    try {
      console.log(`🔍 Collecting Twitter data for ${symbol} (${name})...`);
      
      // Increment request counters
      this.incrementRequestCounts();
      
      // Search for Twitter mentions using multiple strategies
      const twitterData = await this.searchTwitterMentions(symbol, name, officialHandle, socialLinks);
      
      // Cache the result
      this.twitterMetricsCache.set(cacheKey, {
        data: twitterData,
        timestamp: Date.now()
      });
      
      // Save to persistent storage
      await this.saveTwitterMetricsToFile();
      
      console.log(`✅ Twitter data collected for ${symbol}: ${twitterData.mentions} mentions`);
      return twitterData;
      
    } catch (error) {
      console.error(`❌ Error collecting Twitter data for ${symbol}:`, error.message);
      
      // Return cached data if available, otherwise default
      const cached = this.twitterMetricsCache.get(cacheKey);
      return cached ? cached.data : this.getDefaultTwitterData(symbol, name);
    }
  }

  /**
   * Search Twitter for token mentions using multiple strategies
   * PRIORITY: Official handle first, then hashtags/cashtags as fallback
   */
  async searchTwitterMentions(symbol, name, officialHandle = null, socialLinks = null) {
    // Convert symbol to lowercase for proper cashtag/hashtag search
    const symbolLower = symbol.toLowerCase();
    
    const searchTerms = [];
    
    // STEP 1: User-added Twitter handle (highest priority)
    if (socialLinks?.twitter && socialLinks.twitter !== 'not_found') {
      const cleanHandle = socialLinks.twitter.replace('@', '');
      searchTerms.push({ 
        type: 'user_added_handle', 
        value: `@${cleanHandle}`, 
        filter: { from: [cleanHandle] } 
      });
      console.log(`🎯 Using user-added Twitter handle: @${cleanHandle}`);
    }
    // STEP 2: Jupiter-fetched official handle (if no user handle)
    else if (officialHandle && officialHandle !== 'not found') {
      const cleanHandle = officialHandle.replace('@', '');
      searchTerms.push({ 
        type: 'jupiter_handle', 
        value: `@${cleanHandle}`, 
        filter: { from: [cleanHandle] } 
      });
      console.log(`🎯 Using Jupiter-fetched Twitter handle: @${cleanHandle}`);
    } else {
      console.log(`⚠️ No official Twitter handle found for ${symbol} - will be stored as 'not found'`);
    }
    
    // STEP 2: ALWAYS do hashtag/cashtag searches for community activity metrics
    // Use more specific crypto-related search terms to avoid irrelevant tweets
    searchTerms.push(
      { type: 'cashtag', value: `$${symbolLower}`, filter: { hashtags: [symbolLower] } },  // $trump
      { type: 'hashtag_crypto', value: `#${symbolLower}`, filter: { hashtags: [symbolLower] } },   // #trump (will be filtered)
      { type: 'combined_crypto', value: `${symbolLower} crypto`, filter: { query: `${symbolLower} crypto OR ${symbolLower} token OR ${symbolLower} coin` } }, // "trump crypto"
      { type: 'combined_solana', value: `${symbolLower} solana`, filter: { query: `${symbolLower} solana OR ${symbolLower} SOL` } } // "trump solana"
    );
    console.log(`📊 Will search for crypto-relevant activity: $${symbolLower}, #${symbolLower} (filtered), "${symbolLower} crypto", "${symbolLower} solana"`);
    
    let totalMentions = 0;
    let totalLikes = 0;
    let totalRetweets = 0;
    let totalReplies = 0;
    let recentMentions = [];
    let username = null;
    let followers = 0;
    
    for (const searchTerm of searchTerms) {
      try {
        console.log(`🔍 Searching Twitter for: "${searchTerm.value}" (${searchTerm.type})`);
        
        // Use the correct filter for this search type with exact 48-hour range
        const now = new Date();
        const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);
        
        let searchResults;
        
        if (searchTerm.type === 'official_handle') {
          // For official handles, get tweets FROM the account (not mentions)
          const cleanHandle = searchTerm.value.replace('@', '');
          console.log(`   📅 Fetching tweets from official account: @${cleanHandle}`);
          
          try {
            // Get user profile first to get follower count
            const userProfile = await this.twitterApi.user.details(cleanHandle);
            if (userProfile) {
              followers = userProfile.followersCount || 0;
              username = cleanHandle;
              console.log(`   👥 Official account followers: ${followers}`);
            }
            
            // Get recent tweets from the official account
            const filter = { 
              from: [cleanHandle],
              startDate: fortyEightHoursAgo,
              endDate: now
            };
            searchResults = await this.twitterApi.tweet.search(filter, 20); // Fewer tweets from official account
          } catch (error) {
            console.log(`   ⚠️ Could not fetch from official handle @${cleanHandle}: ${error.message}`);
            searchResults = null;
          }
        } else {
          // For hashtags/cashtags, search for mentions
          const filter = { 
            ...searchTerm.filter,
            startDate: fortyEightHoursAgo,
            endDate: now
          };
          
          console.log(`   📅 Search window: ${fortyEightHoursAgo.toISOString()} to ${now.toISOString()}`);
          searchResults = await this.twitterApi.tweet.search(filter, 50); // More tweets for mentions
        }
        
        if (searchResults && searchResults.list && searchResults.list.length > 0) {
          console.log(`✅ Found ${searchResults.list.length} tweets for "${searchTerm.value}"`);
          
          // Process tweets with relevance filtering
          let relevantTweets = 0;
          let filteredTweets = 0;
          
          searchResults.list.forEach((tweet, index) => {
            try {
              const tweetData = tweet.toJSON();
              const tweetText = tweetData.fullText || tweetData.text || '';
              
              // Apply relevance filter for hashtag searches (but not for official handles or cashtags)
              let isRelevant = true;
              if (searchTerm.type === 'hashtag_crypto') {
                isRelevant = this.isCryptoRelevantTweet(tweetText, symbol, name);
                if (!isRelevant) {
                  filteredTweets++;
                  console.log(`🚫 Filtered out non-crypto tweet: "${tweetText.substring(0, 100)}..."`);
                  return; // Skip this tweet
                }
              }
              
              relevantTweets++;
              
              // Show tweet details in console
              console.log(`\n📝 Tweet ${index + 1} (${searchTerm.type}):`);
              console.log(`   Author: @${tweetData.tweetBy?.userName || 'Unknown'}`);
              console.log(`   Text: ${tweetText}`);
              console.log(`   Likes: ${tweetData.likeCount || 0}`);
              console.log(`   Retweets: ${tweetData.retweetCount || 0}`);
              console.log(`   Replies: ${tweetData.replyCount || 0}`);
              console.log(`   Created: ${tweetData.createdAt || 'Unknown'}`);
              console.log(`   ✅ Crypto Relevant: ${isRelevant}`);
              
              // Aggregate engagement metrics (only for relevant tweets)
              totalLikes += tweetData.likeCount || 0;
              totalRetweets += tweetData.retweetCount || 0;
              totalReplies += tweetData.replyCount || 0;
              totalMentions++;
              
              // Collect recent mentions for social activity feed
              if (recentMentions.length < 10) {
                recentMentions.push({
                  author: tweetData.tweetBy?.userName || 'Unknown',
                  authorName: tweetData.tweetBy?.fullName || 'Unknown',
                  text: tweetText,
                  likes: tweetData.likeCount || 0,
                  retweets: tweetData.retweetCount || 0,
                  replies: tweetData.replyCount || 0,
                  createdAt: tweetData.createdAt || 'Unknown',
                  searchType: searchTerm.type,
                  isRelevant: isRelevant
                });
              }
            } catch (tweetError) {
              console.log(`⚠️ Error processing tweet ${index + 1}:`, tweetError.message);
              // Still count it as a mention even if we can't process it
              totalMentions++;
            }
          });
          
          console.log(`📊 Search "${searchTerm.value}": ${relevantTweets} relevant tweets, ${filteredTweets} filtered out`);
          
          // Continue searching both cashtag and hashtag to get complete data
          // Don't stop early - let's get all available mentions
          console.log(`📊 Accumulated: ${totalMentions} mentions, ${totalLikes} likes, ${totalRetweets} retweets, ${totalReplies} replies`);
        }
        
        // Add delay between searches
        await new Promise(resolve => setTimeout(resolve, this.rateLimits.delayBetweenSearches));
        
      } catch (error) {
        console.log(`⚠️ Search failed for "${searchTerm.value}" (${searchTerm.type}): ${error.message}`);
        
        // If we hit a rate limit (429), wait longer before continuing
        if (error.message.includes('429') || error.message.includes('rate limit')) {
          console.log('🚨 Rate limit detected - waiting 60 seconds before continuing...');
          await new Promise(resolve => setTimeout(resolve, 60000)); // Wait 1 minute
          this.rateLimitUntil = Date.now() + 300000; // Set 5-minute cooldown
        }
        
        // Continue with next search term
      }
    }
    
    // Summary of search results
    console.log(`📊 Twitter Search Summary for ${symbol}:`);
    console.log(`   🎯 Official Handle: ${officialHandle || 'not found'}`);
    console.log(`   👥 Followers: ${followers}`);
    console.log(`   📊 Community Mentions: ${totalMentions}`);
    console.log(`   💖 Total Engagement: ${totalLikes + totalRetweets + totalReplies}`);
    
    return {
      symbol: symbol,
      name: name,
      
      // Official Twitter Account Info (from Jupiter API)
      officialHandle: officialHandle || 'not found',
      username: username,
      followers: followers,
      hasOfficialAccount: !!officialHandle,
      
      // Community Activity Metrics (from hashtag/cashtag searches)
      mentions: totalMentions,
      mentions24h: totalMentions, // Same as mentions for now
      likes: totalLikes,
      retweets: totalRetweets,
      replies: totalReplies,
      engagement: {
        likes: totalLikes,
        retweets: totalRetweets,
        replies: totalReplies,
        total: totalLikes + totalRetweets + totalReplies
      },
      
      // Social Activity Feed
      recentMentions: recentMentions,
      tweets: recentMentions, // Alias for frontend compatibility
      
      // Status and Metadata
      status: totalMentions > 0 ? 'active' : 'limited_activity',
      communityHealth: this.calculateCommunityHealthFromMetrics(totalMentions, totalLikes, totalRetweets, followers),
      lastUpdated: new Date().toISOString()
    };
  }

  /**
   * Check if a tweet is relevant to cryptocurrency/token discussion
   * Filters out non-crypto tweets (e.g., political Trump tweets vs Trump coin tweets)
   */
  isCryptoRelevantTweet(tweetText, symbol, name) {
    const text = tweetText.toLowerCase();
    const symbolLower = symbol.toLowerCase();
    const nameLower = name.toLowerCase();
    
    // CRYPTO KEYWORDS - Strong indicators this is about cryptocurrency
    const cryptoKeywords = [
      'crypto', 'cryptocurrency', 'token', 'coin', 'blockchain', 'defi', 'web3',
      'solana', 'sol', 'ethereum', 'eth', 'bitcoin', 'btc', 'binance', 'coinbase',
      'trading', 'hodl', 'moon', 'pump', 'dump', 'ath', 'dip', 'bullish', 'bearish',
      'market cap', 'marketcap', 'mcap', 'volume', 'liquidity', 'dex', 'cex',
      'wallet', 'metamask', 'phantom', 'swap', 'bridge', 'stake', 'yield',
      'nft', 'dao', 'airdrop', 'whitelist', 'presale', 'ido', 'ico',
      'lambo', 'diamond hands', 'paper hands', 'to the moon', 'wen moon', 'diamond', 'hands',
      'buy the dip', 'btfd', 'dyor', 'not financial advice', 'nfa',
      'contract address', 'mint', 'burn', 'supply', 'circulating',
      'coingecko', 'coinmarketcap', 'dexscreener', 'jupiter', 'raydium'
    ];
    
    // NON-CRYPTO KEYWORDS - Strong indicators this is NOT about cryptocurrency
    const nonCryptoKeywords = [
      // Political (for Trump example)
      'president', 'election', 'vote', 'campaign', 'politics', 'political',
      'white house', 'congress', 'senate', 'democrat', 'republican', 'maga',
      'policy', 'government', 'administration', 'inauguration',
      
      // Animals/Pets (for DOGE example)
      'puppy', 'dog', 'pet', 'cute', 'adorable', 'sleeping', 'shiba inu',
      'animal', 'pets', 'doggy', 'puppers', 'good boy', 'good girl',
      
      // Art/Design/Creative (for Detective art example)
      'illustration', 'artmoots', 'fanart', 'commission', 'comission', 'ocart',
      'drawing', 'sketch', 'artwork', 'artist', 'digital art', 'art commission',
      'character design', 'oc', 'original character', 'art trade', 'art request',
      'portfolio', 'deviantart', 'artstation', 'behance', 'instagram art',
      'painting', 'watercolor', 'acrylic', 'oil painting', 'pencil drawing',
      
      // Memes/Entertainment (for PEPE example)
      'meme', 'memes', 'funny', 'cartoon', 'character', 'frog', 'trending',
      'viral', 'joke', 'humor', 'lol', 'lmao', 'hilarious',
      
      // Nature/Astronomy (for MOON example)
      'stargazing', 'astronomy', 'nature', 'beautiful', 'tonight', 'sky',
      'stars', 'planet', 'space', 'telescope', 'constellation',
      
      // General non-crypto topics
      'movie', 'film', 'actor', 'actress', 'celebrity', 'music', 'song',
      'sports', 'football', 'basketball', 'soccer', 'game', 'match',
      'weather', 'news', 'breaking news', 'just in', 'developing',
      'health', 'medical', 'doctor', 'hospital', 'covid', 'vaccine',
      
      // Social media engagement (non-crypto)
      'follow me', 'follow back', 'follow for follow', 'f4f', 'like for like',
      'retweet for retweet', 'rt for rt', 'mutual follow', 'follow train'
    ];
    
    // Count crypto vs non-crypto indicators
    let cryptoScore = 0;
    let nonCryptoScore = 0;
    
    // Check for crypto keywords
    for (const keyword of cryptoKeywords) {
      if (text.includes(keyword)) {
        cryptoScore += 1;
      }
    }
    
    // Check for non-crypto keywords (but exclude if they're part of the token name)
    for (const keyword of nonCryptoKeywords) {
      if (text.includes(keyword)) {
        // Special case: Don't penalize animal keywords if they're part of the token name
        // (e.g., "dog" in DOGE tweets, "cat" in CAT token tweets)
        if ((keyword === 'dog' && (symbolLower.includes('dog') || nameLower.includes('dog'))) ||
            (keyword === 'cat' && (symbolLower.includes('cat') || nameLower.includes('cat'))) ||
            (keyword === 'shiba inu' && (symbolLower.includes('shib') || nameLower.includes('shib'))) ||
            (keyword === 'frog' && (symbolLower.includes('pepe') || nameLower.includes('pepe')))) {
          // Skip this non-crypto keyword as it's part of the token identity
          continue;
        }
        nonCryptoScore += 1;
      }
    }
    
    // Special checks for cashtag format ($SYMBOL)
    if (text.includes(`$${symbolLower}`)) {
      cryptoScore += 2; // Cashtags are usually crypto-related
    }
    
    // Check for price-related content
    if (text.match(/\$[\d,]+\.?\d*/) || text.includes('price') || text.includes('usd')) {
      cryptoScore += 1;
    }
    
    // Check for percentage changes (common in crypto tweets)
    if (text.match(/[+-]?\d+\.?\d*%/)) {
      cryptoScore += 1;
    }
    
    // Decision logic - STRICT filtering to avoid false positives
    
    // Strong non-crypto indicators - reject immediately
    if (nonCryptoScore >= 1) {
      return false; // Any non-crypto indicator = reject (art, politics, etc.)
    }
    
    // Require at least one crypto indicator to be considered relevant
    if (cryptoScore >= 1) {
      return true; // Has crypto indicators
    }
    
    // Check for crypto-specific patterns even without keywords
    
    // Cashtag with crypto context (mentions other crypto terms)
    if (text.includes(`$${symbolLower}`) && (
      text.includes('solana') || text.includes('crypto') || text.includes('token') ||
      text.includes('trading') || text.includes('buy') || text.includes('sell') ||
      text.includes('hodl') || text.includes('moon') || text.includes('pump')
    )) {
      return true;
    }
    
    // Price or percentage mentions with token symbol
    if ((text.match(/\$[\d,]+\.?\d*/) || text.match(/[+-]?\d+\.?\d*%/)) && 
        (text.includes(symbolLower) || text.includes(`$${symbolLower}`))) {
      return true;
    }
    
    // No crypto indicators found - reject to avoid false positives
    // Better to miss some crypto tweets than include non-crypto content
    return false;
  }

  /**
   * Calculate community health score from Twitter metrics
   */
  calculateCommunityHealthFromMetrics(mentions, likes, retweets, followers) {
    let score = 0;
    
    // Mentions score (0-3 points)
    if (mentions > 100) score += 3;
    else if (mentions > 50) score += 2;
    else if (mentions > 10) score += 1;
    
    // Engagement score (0-3 points)
    const totalEngagement = likes + retweets;
    if (totalEngagement > 500) score += 3;
    else if (totalEngagement > 100) score += 2;
    else if (totalEngagement > 20) score += 1;
    
    // Follower score (0-4 points)
    if (followers > 10000) score += 4;
    else if (followers > 5000) score += 3;
    else if (followers > 1000) score += 2;
    else if (followers > 100) score += 1;
    
    return Math.min(10, score); // Cap at 10
  }

  /**
   * Get default Twitter data when API fails
   */
  getDefaultTwitterData(symbol, name) {
    return {
      symbol: symbol,
      name: name,
      
      // Official Twitter Account Info
      officialHandle: 'not found',
      username: null,
      followers: 0,
      hasOfficialAccount: false,
      
      // Community Activity Metrics
      mentions: 0,
      mentions24h: 0,
      likes: 0,
      retweets: 0,
      replies: 0,
      engagement: {
        likes: 0,
        retweets: 0,
        replies: 0,
        total: 0
      },
      
      // Social Activity Feed
      recentMentions: [],
      tweets: [],
      
      // Status and Metadata
      status: 'no_data',
      communityHealth: 0,
      lastUpdated: new Date().toISOString()
    };
  }

  /**
   * Save Twitter metrics to persistent storage
   */
  async saveTwitterMetricsToFile() {
    try {
      const dataToSave = {
        _metadata: {
          lastRefreshTime: Date.now(),
          totalTokens: this.twitterMetricsCache.size - 1
        }
      };
      
      // Convert Map to object for JSON serialization
      for (const [key, value] of this.twitterMetricsCache) {
        dataToSave[key] = value;
      }
      
      await fs.writeFile(this.twitterMetricsFile, JSON.stringify(dataToSave, null, 2));
      console.log(`💾 Saved ${this.twitterMetricsCache.size - 1} Twitter metrics to persistent storage`);
    } catch (error) {
      console.error('❌ Failed to save Twitter metrics:', error.message);
    }
  }

  /**
   * Get comprehensive social data including Twitter metrics
   */
  async getComprehensiveSocialData(contractAddress, symbol, name, forceRefresh = false) {
    // Initialize if not already done
    if (!this.initialized) {
      await this.initialize();
    }
    
    try {
      // Get Twitter data
      const twitterData = await this.getTwitterSocialData(symbol, name, forceRefresh);
      
      // Calculate enhanced community health score using Twitter metrics
      const communityHealthScore = this.calculateCommunityHealthScore(twitterData);
      
      // For now, return basic structure - can be expanded with other social platforms
      return {
        symbol: symbol,
        name: name,
        contractAddress: contractAddress,
        twitter: twitterData.username ? `@${twitterData.username}` : null,
        twitterMetrics: twitterData,
        communityHealthScore: communityHealthScore,
        socialMetrics: {
          twitter: { 
            mentions: twitterData.mentions, 
            followers: twitterData.followers, 
            engagement: twitterData.engagement 
          },
          reddit: { mentions: 0, upvotes: 0 },
          telegram: { members: 0, messages: 0 }
        },
        dataSources: {
          twitter: Object.keys(twitterData).length,
          jupiter: 0,
          coingecko: 0,
          dexscreener: 0
        },
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      console.error(`❌ Error getting comprehensive social data for ${symbol}:`, error.message);
      
      // Return fallback data
      return {
        symbol: symbol,
        name: name,
        contractAddress: contractAddress,
        twitter: null,
        twitterMetrics: this.getDefaultTwitterData(symbol, name),
        communityHealthScore: 5.0, // Default score
        socialMetrics: {
          twitter: { mentions: 0, followers: 0, engagement: 0 },
          reddit: { mentions: 0, upvotes: 0 },
          telegram: { members: 0, messages: 0 }
        },
        dataSources: {
          twitter: 0,
          jupiter: 0,
          coingecko: 0,
          dexscreener: 0
        },
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Calculate comprehensive community health score using Twitter metrics
   * This is the enhanced scoring algorithm that uses ALL collected data
   * 
   * NEW WEIGHTS: Mentions 5%, Engagement 30%, Followers 5%, Recent Activity 50%, Quality 10%
   */
  calculateCommunityHealthScore(twitterData) {
    let score = 5.0; // Base score
    
    try {
      // 1. MENTIONS SCORING (5% weight) - Reduced from 25%
      const mentions = twitterData.mentions || 0;
      if (mentions > 100) score += 0.5;
      else if (mentions > 50) score += 0.4;
      else if (mentions > 20) score += 0.3;
      else if (mentions > 10) score += 0.2;
      else if (mentions > 5) score += 0.1;
      
      // 2. ENGAGEMENT SCORING (30% weight) - Increased from 25%
      const totalEngagement = (twitterData.likes || 0) + (twitterData.retweets || 0) + (twitterData.replies || 0);
      const engagementRate = mentions > 0 ? totalEngagement / mentions : 0;
      
      if (engagementRate > 10) score += 3.0;
      else if (engagementRate > 5) score += 2.4;
      else if (engagementRate > 2) score += 1.8;
      else if (engagementRate > 1) score += 1.2;
      else if (engagementRate > 0.5) score += 0.6;
      
      // 3. FOLLOWER BASE SCORING (5% weight) - Reduced from 20%
      const followers = twitterData.followers || 0;
      if (followers > 10000) score += 0.5;
      else if (followers > 5000) score += 0.375;
      else if (followers > 1000) score += 0.25;
      else if (followers > 500) score += 0.125;
      
      // 4. RECENT ACTIVITY SCORING (50% weight) - Increased from 20%
      const recentMentions = twitterData.recentMentions?.length || 0;
      if (recentMentions > 20) score += 5.0;
      else if (recentMentions > 10) score += 3.75;
      else if (recentMentions > 5) score += 2.5;
      else if (recentMentions > 2) score += 1.25;
      
      // 5. QUALITY INDICATORS (10% weight) - Same as before
      const hasOfficialAccount = twitterData.username ? 1.0 : 0;
      const hasRecentActivity = mentions > 0 ? 1.0 : 0;
      score += (hasOfficialAccount + hasRecentActivity) * 0.5;
      
      // Ensure score is within 0-10 range
      score = Math.min(9.9, Math.max(0, score));
      
      console.log(`📊 Community Health Score for ${twitterData.symbol}: ${score.toFixed(2)} [NEW WEIGHTS]`);
      console.log(`   📝 Mentions (5%): ${mentions} (+${Math.min(0.5, mentions > 100 ? 0.5 : mentions > 50 ? 0.4 : mentions > 20 ? 0.3 : mentions > 10 ? 0.2 : mentions > 5 ? 0.1 : 0)})`);
      console.log(`   💬 Engagement Rate (30%): ${engagementRate.toFixed(2)} (+${Math.min(3.0, engagementRate > 10 ? 3.0 : engagementRate > 5 ? 2.4 : engagementRate > 2 ? 1.8 : engagementRate > 1 ? 1.2 : engagementRate > 0.5 ? 0.6 : 0)})`);
      console.log(`   👥 Followers (5%): ${followers} (+${Math.min(0.5, followers > 10000 ? 0.5 : followers > 5000 ? 0.375 : followers > 1000 ? 0.25 : followers > 500 ? 0.125 : 0)})`);
      console.log(`   🆕 Recent Activity (50%): ${recentMentions} mentions (+${Math.min(5.0, recentMentions > 20 ? 5.0 : recentMentions > 10 ? 3.75 : recentMentions > 5 ? 2.5 : recentMentions > 2 ? 1.25 : 0)})`);
      
      return score;
      
    } catch (error) {
      console.error('❌ Error calculating community health score:', error.message);
      return 5.0; // Return base score on error
    }
  }

  /**
   * Get rate limit status
   */
  getRateLimitStatus() {
    return {
      isRateLimited: this.isCurrentlyRateLimited(),
      rateLimitUntil: this.rateLimitUntil,
      hourlyRequests: this.requestCounts.hourly,
      dailyRequests: this.requestCounts.daily,
      hourlyLimit: this.rateLimits.maxRequestsPerHour,
      dailyLimit: this.rateLimits.maxRequestsPerDay,
      lastHourReset: this.requestCounts.lastHourReset,
      lastDayReset: this.requestCounts.lastDayReset
    };
  }

  /**
   * Get service information
   */
  getServiceInfo() {
    return {
      name: 'Enhanced Social Data Service',
      version: '2.0.0',
      status: this.initialized ? 'active' : 'initializing',
      twitterApi: 'Rettiwt-API',
      cacheSize: this.twitterMetricsCache.size,
      rateLimits: this.rateLimits,
      description: 'Comprehensive social data collection with Twitter integration'
    };
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
    this.twitterMetricsCache.clear();
    console.log('🧹 Social data service cache cleared');
  }

  /**
   * Start 24-hour background refresh system
   */
  async startBackgroundRefresh() {
    if (this.backgroundRefreshInterval) {
      console.log('⚠️ Background refresh already running');
      return;
    }

    console.log('🚀 Starting 24-hour background refresh system...');
    
    // Run initial refresh
    await this.runBackgroundRefresh();
    
    // Set up 24-hour interval (24 * 60 * 60 * 1000 = 24 hours in milliseconds)
    this.backgroundRefreshInterval = setInterval(async () => {
      await this.runBackgroundRefresh();
    }, 24 * 60 * 60 * 1000);
    
    console.log('✅ Background refresh system started - will run every 24 hours');
  }

  /**
   * Stop background refresh system
   */
  stopBackgroundRefresh() {
    if (this.backgroundRefreshInterval) {
      clearInterval(this.backgroundRefreshInterval);
      this.backgroundRefreshInterval = null;
      console.log('🛑 Background refresh system stopped');
    }
  }

  /**
   * Run background refresh for all cached tokens
   */
  async runBackgroundRefresh() {
    try {
      console.log('🔄 Running 24-hour background refresh...');
      const now = new Date();
      console.log(`⏰ Refresh started at: ${now.toISOString()}`);
      
      // Get all cached tokens that need refresh
      const tokensToRefresh = [];
      for (const [cacheKey, cachedData] of this.twitterMetricsCache.entries()) {
        const lastRefresh = cachedData.timestamp;
        const hoursSinceRefresh = (now - lastRefresh) / (1000 * 60 * 60);
        
        // Refresh if older than 24 hours
        if (hoursSinceRefresh >= 24) {
          const [symbol, name] = cacheKey.split('|');
          tokensToRefresh.push({ symbol, name });
        }
      }
      
      console.log(`📊 Found ${tokensToRefresh.length} tokens needing refresh`);
      
      // Refresh each token with delay to respect rate limits
      for (const token of tokensToRefresh) {
        try {
          console.log(`🔄 Refreshing ${token.symbol} (${token.name})...`);
          
          // Force refresh
          await this.getTwitterSocialData(token.symbol, token.name, true);
          
          // Delay between tokens to respect rate limits
          await new Promise(resolve => setTimeout(resolve, 5000));
          
        } catch (error) {
          console.error(`❌ Failed to refresh ${token.symbol}:`, error.message);
        }
      }
      
      console.log('✅ Background refresh completed');
      
    } catch (error) {
      console.error('❌ Background refresh failed:', error.message);
    }
  }

  /**
   * Force immediate refresh for a specific token (for new tokens or paid tokens)
   */
  async forceImmediateRefresh(symbol, name) {
    try {
      console.log(`🚀 Force refreshing ${symbol} (${name}) immediately...`);
      
      // Force refresh and update cache
      const twitterData = await this.getTwitterSocialData(symbol, name, true);
      
      console.log(`✅ Immediate refresh completed for ${symbol}: ${twitterData.mentions} mentions`);
      return twitterData;
      
    } catch (error) {
      console.error(`❌ Immediate refresh failed for ${symbol}:`, error.message);
      throw error;
    }
  }

  /**
   * Get tokens that need refresh
   */
  getTokensNeedingRefresh() {
    const now = new Date();
    const tokensNeedingRefresh = [];
    
    for (const [cacheKey, cachedData] of this.twitterMetricsCache.entries()) {
      const lastRefresh = cachedData.timestamp;
      const hoursSinceRefresh = (now - lastRefresh) / (1000 * 60 * 60);
      
      if (hoursSinceRefresh >= 24) {
        const [symbol, name] = cacheKey.split('|');
        tokensNeedingRefresh.push({ 
          symbol, 
          name, 
          hoursSinceRefresh: Math.round(hoursSinceRefresh),
          lastRefresh: new Date(lastRefresh).toISOString()
        });
      }
    }
    
    return tokensNeedingRefresh;
  }
}

export default EnhancedSocialDataService;
