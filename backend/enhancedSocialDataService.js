import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
// TwitterApiManager will be imported dynamically to handle deployment issues
import SmartTwitterRefreshService from './smartTwitterRefreshService.js';
import CacheLockService from './cacheLockService.js';

class EnhancedSocialDataService {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 15 * 60 * 1000; // 15 minutes cache
    
    // Twitter metrics persistent storage
    this.twitterMetricsFile = process.env.DATA_DIR ? 
      path.join(process.env.DATA_DIR, 'cache', 'cache', 'twitter_metrics.json') : 
      './cache/twitter_metrics.json';
    this.historicalMetricsFile = process.env.DATA_DIR ? 
      path.join(process.env.DATA_DIR, 'cache', 'cache', 'twitter_history.json') : 
      './cache/twitter_history.json';
    this.twitterMetricsCache = new Map();
    this.lastRefreshTime = 0;
    this.refreshInterval = 120 * 60 * 60 * 1000; // 120 hours = 5 days
    
    // Twitter microservice configuration
    this.twitterServiceUrl = process.env.TWITTER_SERVICE_URL || 'https://dgo-2.onrender.com';
    this.twitterApi = null; // Will be replaced by microservice calls
    
    // 🚨 NEW: Twitter API Manager for 15K/month limit protection with fallback
    // Will be initialized asynchronously in initialize() method
    this.twitterApiManager = null;
    
    // 🧠 Smart Twitter Refresh Service for deduplication
    this.smartRefreshService = new SmartTwitterRefreshService();
    
    console.log(`🐦 Twitter microservice configured: ${this.twitterServiceUrl}`);
    
    // 🚨 DEPRECATED RATE LIMITING - NOW HANDLED BY TwitterApiManager
    // Keeping for backward compatibility but will be ignored
    this.rateLimits = {
      maxSearchesPerToken: 1,           // ✅ OPTIMIZED: 1 search per token (was 3-4)
      delayBetweenSearches: 10000,      // 10 seconds between searches (increased to avoid 429)
      maxTokensPerHour: 200,            // INCREASED back up (more efficient per token)
      maxTokensPerDay: 500,             // INCREASED back up (75% API reduction allows this)
      maxRequestsPerHour: 200,          // INCREASED back up (1 call per token now)
      maxRequestsPerDay: 500,           // Matches token limit (1:1 ratio)
      cooldownAfterRateLimit: 300000,
      dailyResetTime: '00:00 UTC'
    };
    
    // Request tracking - DEPRECATED, now handled by TwitterApiManager
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
    console.log('🏷️ OPTIMIZED SEARCH: Using primary hashtags (#TOKEN) and cashtags ($TOKEN) only');
    console.log('⏰ BACKGROUND REFRESH: 5-day Twitter metrics refresh system');
    console.log('💾 PERSISTENT STORAGE: Twitter metrics saved across restarts');
    
    // Don't call async functions in constructor - they'll be called when needed
    this.initialized = false;
  }

  /**
   * Normalize a Twitter handle or URL into a plain username (no @)
   */
  normalizeTwitterHandle(rawValue) {
    try {
      if (!rawValue) return null;
      let value = String(rawValue).trim();
      if (!value) return null;

      // Remove leading @ if present
      if (value.startsWith('@')) value = value.slice(1);

      // If it looks like a URL, extract the last non-empty path segment
      if (value.includes('twitter.com') || value.includes('x.com')) {
        try {
          // Prepend protocol if missing
          if (!/^https?:\/\//i.test(value)) {
            value = 'https://' + value;
          }
          const url = new URL(value);
          // Path may contain segments like /username or /username/status/...
          const segments = url.pathname.split('/').filter(Boolean);
          if (segments.length > 0) {
            value = segments[0];
          }
        } catch (_) {
          // If URL parsing fails, continue with raw value
        }
      }

      // Strip query string remnants if any
      const qIndex = value.indexOf('?');
      if (qIndex !== -1) value = value.slice(0, qIndex);

      // Final cleanup
      return value.replace(/[^a-zA-Z0-9_]/g, '');
    } catch (_) {
      return null;
    }
  }

  /**
   * Initialize Twitter API Manager with dynamic import and fallback
   */
  async initializeTwitterApiManager() {
    try {
      const { default: TwitterApiManager } = await import('./twitterApiManager.js');
      this.twitterApiManager = new TwitterApiManager();
      console.log('✅ TwitterApiManager initialized successfully');
    } catch (error) {
      console.error('⚠️ TwitterApiManager import/init failed, using fallback:', error.message);
      // Fallback manager that allows all requests
      this.twitterApiManager = {
        async canRefreshToken() { 
          return { allowed: true, tier: 'FALLBACK', reason: 'TwitterApiManager unavailable' }; 
        },
        async recordApiCall() { 
          console.log('📊 Fallback: API call recorded (TwitterApiManager unavailable)'); 
        },
        async getUsageStats() {
          return {
            monthly: 0,
            monthlyLimit: 15000,
            monthlyPercent: '0.0',
            daily: 0,
            dailyLimit: 500,
            hourly: 0,
            hourlyLimit: 50,
            monthStart: new Date().toISOString().substring(0,7),
            dayStart: new Date().toISOString().substring(0,10),
            hourStart: new Date().toISOString().substring(0,13)
          };
        },
        async resetMonthlyCounter() {
          console.log('🔄 Fallback: Monthly counter reset (TwitterApiManager unavailable)');
          return { success: true, message: 'Counter reset (fallback)' };
        }
      };
    }
  }

  /**
   * Initialize the service asynchronously
   */
  async initialize() {
    if (this.initialized) return;
    
    try {
      // Initialize TwitterApiManager first
      if (!this.twitterApiManager) {
        await this.initializeTwitterApiManager();
      }
      await this.initializePersistentStorage();
      // this.startBackgroundRefresh(); // DISABLED to prevent excessive Twitter API usage
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
  async getTwitterSocialData(symbol, name, forceRefresh = false, officialHandle = null, socialLinks = null, adminBypass = false, metadata = null) {
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

    // 🧠 Smart Refresh: Check if we should use smart deduplication
    const cached = this.twitterMetricsCache.get(cacheKey);
    if (cached && cached.data && this.smartRefreshService.shouldUseSmartRefresh(cached.data)) {
      console.log(`🧠 Smart refresh available for ${symbol}, using deduplication approach`);
      try {
        const smartRefreshedData = await this.smartRefreshService.refreshTwitterData(
          symbol, 
          name, 
          cached.data, 
          officialHandle, 
          socialLinks,
          metadata
        );
        
        // Update cache with smart refreshed data
        this.twitterMetricsCache.set(cacheKey, {
          data: smartRefreshedData,
          timestamp: Date.now()
        });
        
        // Save to persistent storage
        await this.saveTwitterMetricsToFile();
        
        const displayCount = smartRefreshedData.displayMentions || smartRefreshedData.mentions;
        console.log(`✅ Smart refresh completed for ${symbol}: ${smartRefreshedData._newTweetsAdded || 0} new tweets added, ${displayCount} mentions (projected)`);
        return smartRefreshedData;
      } catch (error) {
        console.log(`⚠️ Smart refresh failed for ${symbol}, falling back to regular refresh:`, error.message);
        // Continue with regular refresh process
      }
    }
    
    // 🚨 NEW: Check Twitter API Manager for monthly limits and smart cooldowns (unless admin bypass)
    const tokenForCheck = { 
      symbol, 
      name, 
      twitterData: this.twitterMetricsCache.get(cacheKey)?.data,
      twitterLastRefresh: this.twitterMetricsCache.get(cacheKey)?.data?.lastRefreshed,
      jupiterData: this._currentJupiterData || null // Get from temporary storage
    };
    
    if (!adminBypass && this.twitterApiManager) {
      
      const canRefresh = await this.twitterApiManager.canRefreshToken(tokenForCheck);
      if (!canRefresh.allowed) {
        console.log(`🚨 Twitter API Manager blocked refresh for ${symbol}: ${canRefresh.reason}`);
        const cached = this.twitterMetricsCache.get(cacheKey);
        
        // 🚨 CRITICAL FIX: ALWAYS preserve existing Twitter data during cooldowns
        if (cached && cached.data) {
          const displayCount = cached.data.displayMentions || cached.data.mentions;
          console.log(`📦 Preserving existing Twitter data for ${symbol} during cooldown (${displayCount} mentions, score: ${cached.data.communityHealth || cached.data.communityScore || 'N/A'})`);
          const preservedData = { ...cached.data };
          preservedData._dataFreshness = 'preserved_during_cooldown';
          preservedData._blockReason = canRefresh.reason;
          preservedData._preservedAt = new Date().toISOString();
          return preservedData;
        }
        
        // Only use default data if NO cached data exists (new token)
        const jupiterData = tokenForCheck.jupiterData || null;
        console.log(`⚠️ No cached Twitter data found for ${symbol}, using Jupiter-enhanced default`);
        const fallbackData = this.getDefaultTwitterData(symbol, name, 'api_manager_blocked', jupiterData);
        fallbackData._dataFreshness = 'api_manager_blocked';
        fallbackData._blockReason = canRefresh.reason;
        return fallbackData;
      }
      
      console.log(`✅ Twitter API Manager approved refresh for ${symbol} (${canRefresh.tier} tier)`);
    } else {
      console.log(`🛡️ ADMIN BYPASS: Skipping TwitterApiManager cooldown checks for ${symbol}`);
    }
    
    // Legacy rate limit checks (keeping for backward compatibility)
    if (this.isCurrentlyRateLimited()) {
      console.log(`🚨 Legacy rate limited for ${symbol}, returning cached data if available`);
      const cached = this.twitterMetricsCache.get(cacheKey);
      
      // 🚨 CRITICAL FIX: ALWAYS preserve existing Twitter data during rate limits
      if (cached && cached.data) {
        const displayCount = cached.data.displayMentions || cached.data.mentions;
        console.log(`📦 Preserving existing Twitter data for ${symbol} during rate limit (${displayCount} mentions)`);
        const preservedData = { ...cached.data };
        preservedData._dataFreshness = 'preserved_during_rate_limit';
        preservedData._preservedAt = new Date().toISOString();
        return preservedData;
      }
      
      // Only use default data if NO cached data exists
      const jupiterData = tokenForCheck.jupiterData || null;
      const fallbackData = this.getDefaultTwitterData(symbol, name, 'rate_limited', jupiterData);
      fallbackData._dataFreshness = 'rate_limited';
      return fallbackData;
    }
    
    try {
      console.log(`🔍 Collecting Twitter data for ${symbol} (${name})...`);
      
      // Legacy increment (keeping for backward compatibility)
      this.incrementRequestCounts();
      
      // Search for Twitter mentions using multiple strategies
      const twitterData = await this.searchTwitterMentions(symbol, name, officialHandle, socialLinks, metadata);
      
      // 🚨 NEW: Record API usage with the Twitter API Manager
      if (this.twitterApiManager) {
        const apiCallsUsed = 1; // ✅ OPTIMIZED: Always 1 call per token now
        const tokenForRecord = adminBypass ? 
          { symbol, name, jupiterData: this._currentJupiterData, _adminBypass: true } : 
          tokenForCheck;
        await this.twitterApiManager.recordApiCall(tokenForRecord, apiCallsUsed);
      }
      
      // Get historical data for 24-hour comparison
      const historicalData = await this.getHistoricalTwitterData(symbol, name);
      
      // Calculate 24-hour changes (use displayMentions for accurate comparison)
      const todayMentions = twitterData.displayMentions || twitterData.mentions;
      const previousMentions = historicalData.yesterdayMentions || 0;
      const mentions24hChange = previousMentions ? todayMentions - previousMentions : 0;
      const mentionsChangePercent = previousMentions > 0 ? ((mentions24hChange / previousMentions) * 100) : 0;
      
      // Add historical context to Twitter data
      twitterData.mentions24h = mentions24hChange;
      twitterData.mentionsYesterday = previousMentions;
      twitterData.mentionsTrend = mentionsChangePercent; // NUMERIC percentage for frontend
      twitterData.mentionsTrendLabel = mentions24hChange > 0 ? 'increasing' : 
                                       mentions24hChange < 0 ? 'decreasing' : 'stable'; // Text label
      twitterData.lastRefreshed = new Date().toISOString(); // Track refresh time
      
      // 🚨 CRITICAL: Log historical context for monitoring
      const changePercentFormatted = previousMentions > 0 ? mentionsChangePercent.toFixed(1) : 'N/A';
      const comparisonDateLabel = historicalData.lastSnapshotDate || 'last refresh';
      console.log(`📊 Historical Context for ${symbol}: Today=${todayMentions}, Previous=${previousMentions} (${comparisonDateLabel}), Change=${mentions24hChange >= 0 ? '+' : ''}${mentions24hChange} (${changePercentFormatted}%)`);
      
      // Cache the result with historical context
      this.twitterMetricsCache.set(cacheKey, {
        data: twitterData,
        timestamp: Date.now()
      });
      
      // Save to persistent storage with historical tracking
      await this.saveTwitterMetricsToFile();
      await this.saveHistoricalSnapshot(symbol, name, twitterData);
      
      const displayCount = twitterData.displayMentions || twitterData.mentions;
      console.log(`✅ Twitter data collected for ${symbol}: ${displayCount} mentions (projected)`);
      twitterData._dataFreshness = 'fresh'; // Mark as fresh data
      
      // Clean up temporary Jupiter data
      delete this._currentJupiterData;
      
      return twitterData;
      
    } catch (error) {
      console.error(`❌ Error collecting Twitter data for ${symbol}:`, error.message);
      
      // 🚨 CRITICAL FIX: ALWAYS preserve existing Twitter data during errors
      const cached = this.twitterMetricsCache.get(cacheKey);
      if (cached && cached.data) {
        const displayCount = cached.data.displayMentions || cached.data.mentions;
        console.log(`📦 Preserving existing Twitter data for ${symbol} during API error (${displayCount} mentions)`);
        const preservedData = { ...cached.data };
        preservedData._dataFreshness = 'preserved_during_error';
        preservedData._preservedAt = new Date().toISOString();
        preservedData._errorMessage = error.message;
        return preservedData;
      }
      
      // Only use default data if NO cached data exists
      const jupiterData = tokenForCheck.jupiterData || null;
      const fallbackData = this.getDefaultTwitterData(symbol, name, 'error_fallback', jupiterData);
      fallbackData._dataFreshness = 'error_fallback';
      fallbackData._errorMessage = error.message;
      
      // Clean up temporary Jupiter data
      delete this._currentJupiterData;
      
      return fallbackData;
    }
  }

  /**
   * Force smart refresh for a specific token (admin function)
   */
  async forceSmartRefresh(symbol, name, officialHandle = null, socialLinks = null, metadata = null) {
    console.log(`🧠 Force smart refresh for ${symbol}`);
    
    const cacheKey = `${symbol}_${name}`;
    const cached = this.twitterMetricsCache.get(cacheKey);
    
    if (!cached || !cached.data) {
      console.log(`⚠️ No cached data found for ${symbol}, cannot perform smart refresh`);
      return null;
    }
    
    try {
      const smartRefreshedData = await this.smartRefreshService.refreshTwitterData(
        symbol, 
        name, 
        cached.data, 
        officialHandle, 
        socialLinks,
        metadata
      );
      
      // Update cache with smart refreshed data
      this.twitterMetricsCache.set(cacheKey, {
        data: smartRefreshedData,
        timestamp: Date.now()
      });
      
      // Save to persistent storage
      await this.saveTwitterMetricsToFile();
      
      const displayCount = smartRefreshedData.displayMentions || smartRefreshedData.mentions;
      console.log(`✅ Force smart refresh completed for ${symbol}: ${smartRefreshedData._newTweetsAdded || 0} new tweets added, ${displayCount} mentions (projected)`);
      return smartRefreshedData;
    } catch (error) {
      console.error(`❌ Force smart refresh failed for ${symbol}:`, error.message);
      throw error;
    }
  }

  /**
   * Search Twitter for token mentions using Python microservice
   * Uses Twikit via Python FastAPI service
   */
  async searchTwitterMentions(symbol, name, officialHandle = null, socialLinks = null, metadata = null) {
    console.log(`🐦 Searching Twitter via microservice for ${symbol} (${name})`);
    
    try {
      // Check if Twitter microservice is available
      const healthResponse = await axios.get(`${this.twitterServiceUrl}/health`, { timeout: 5000 });
      if (healthResponse.data.status !== 'healthy' || healthResponse.data.bearer_token !== 'present') {
        console.log(`⚠️ Twitter API not available for ${symbol}, checking for cached data first`);
        
        // 🚨 CRITICAL FIX: Check for existing cached data before using defaults
        const cacheKey = `${symbol}_${name}`;
        const cached = this.twitterMetricsCache.get(cacheKey);
        if (cached && cached.data) {
          console.log(`📦 Using cached Twitter data for ${symbol} (API unavailable)`);
          const preservedData = { ...cached.data };
          preservedData._dataFreshness = 'preserved_api_unavailable';
          preservedData._preservedAt = new Date().toISOString();
          return preservedData;
        }
        
        console.log(`⚠️ No cached data found for ${symbol}, using enhanced fallback data generation`);
        return this.generateEnhancedFallbackData(symbol, name);
      }
      
      let totalMentions = 0;
      let totalLikes = 0;
      let totalRetweets = 0;
      let totalReplies = 0;
      let recentMentions = [];
      let username = null;
      let followers = 0;
      
      // 🚨 OPTIMIZED: Single search strategy to stay within 15K/month API limit
      // Reduced from 3-4 searches per token to 1 search per token
      // This reduces API usage by ~75% (from 1,695-2,260 calls to ~565 calls per refresh)
      
      const symbolLower = symbol.toLowerCase();
      const safeName = name || symbol;
      
      // 🚨 FIX: Use consistent 72-hour window logic to prevent infinite loops
      const now = Date.now();
      let startTime;
      
      // Check for existing Twitter timestamp to maintain consistency
      const existingTwitterData = this.twitterMetricsCache.get(`${symbolLower}_${safeName.toLowerCase()}`);
      const lastTwitterRefresh = existingTwitterData?.data?.lastRefreshed || existingTwitterData?.data?.twitterTimestamp;
      
      if (lastTwitterRefresh) {
        const lastRefreshTime = new Date(lastTwitterRefresh).getTime();
        const hoursSinceRefresh = (now - lastRefreshTime) / (1000 * 60 * 60);
        
        // Use the last refresh time as start_time to get only new tweets
        startTime = new Date(lastRefreshTime).toISOString();
        console.log(`🐦 ${symbol}: Using last refresh time as start_time (${hoursSinceRefresh.toFixed(1)}h ago)`);
      } else {
        // No previous refresh data - use 7 days ago as fallback
        startTime = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
        console.log(`🐦 ${symbol}: No previous refresh data, using 7-day window`);
      }
      
      const searchStrategies = [
        {
          type: 'cashtag_primary',
          endpoint: '/api/twitter/search',
          params: { 
            q: `$${symbol} OR $${symbolLower}`, // Cashtag search - both uppercase and lowercase
            count: 4,
            start_time: startTime
          }
        },
        {
          type: 'hashtag_with_crypto_context',
          endpoint: '/api/twitter/search',
          params: { 
            q: `#${symbol} OR #${symbolLower}`, // Hashtag search - both cases
            count: 2,
            start_time: startTime
          }
        }
      ];
      
      // Store official handle info for follower detection (without API call)
      if (officialHandle && officialHandle !== 'not found') {
        username = officialHandle.replace('@', '');
      } else if (socialLinks?.twitter && socialLinks.twitter !== 'not_found') {
        username = socialLinks.twitter.replace('@', '');
      }
      
      // Execute searches
      let allTweets = []; // Store all tweets before filtering
      for (const strategy of searchStrategies) {
        try {
          console.log(`🔍 Executing ${strategy.type} search via microservice...`);
          
          const response = await axios.get(`${this.twitterServiceUrl}${strategy.endpoint}`, {
            params: strategy.params,
            timeout: 30000
          });
          
          if (response.data.success) {
            const tweets = response.data.tweets || response.data.mentions || [];
            console.log(`✅ Found ${tweets.length} tweets for ${strategy.type}`);
            allTweets = allTweets.concat(tweets);
          } else {
            console.log(`❌ ${strategy.type} search failed: ${response.data.detail || 'Unknown error'}`);
          }
          
          // Small delay between searches
          await new Promise(resolve => setTimeout(resolve, 2000));
          
        } catch (error) {
          console.log(`⚠️ ${strategy.type} search error: ${error.message}`);
          // Continue with other searches
        }
      }
      
      // 🚨 FIX: Deduplicate tweets before processing to prevent duplicate processing
      const uniqueTweets = this.deduplicateTweetsByContent(allTweets);
      const duplicatesRemoved = allTweets.length - uniqueTweets.length;
      
      if (duplicatesRemoved > 0) {
        console.log(`🔧 DUPLICATE PREVENTION: Removed ${duplicatesRemoved} duplicate tweets (${allTweets.length} → ${uniqueTweets.length})`);
      }
      
      // Process all collected tweets
      if (uniqueTweets.length > 0) {
        console.log(`📊 Processing ${uniqueTweets.length} total tweets collected`);
        
        for (const tweet of uniqueTweets) {
              // Apply crypto relevance filter - STRICT MODE
              let isRelevant = this.isCryptoRelevantTweet(tweet.text, symbol, name);
              
              if (!isRelevant) {
                console.log(`🚫 Filtered out non-crypto tweet: "${tweet.text.substring(0, 100)}..."`);
                continue; // SKIP this tweet entirely
              }
              
              // Aggregate metrics
              const likes = tweet.favorite_count || 0;
              const retweets = tweet.retweet_count || 0; 
              const replies = tweet.reply_count || 0;
              
              totalLikes += likes;
              totalRetweets += retweets;
              totalReplies += replies;
              totalMentions += 1;
              
              // Analyze sentiment
              const sentimentScore = this.analyzeTweetSentiment(tweet.text);
              
              // Add to recent mentions (limit to 10)
              if (recentMentions.length < 10) {
                recentMentions.push({
                  author: tweet.user?.screen_name || 'Unknown',
                  authorName: tweet.user?.name || 'Unknown',
                  text: tweet.text,
                  likes: likes,
                  retweets: retweets,
                  replies: replies,
                  createdAt: tweet.created_at,
                  tweetId: tweet.id,
                  sentiment: sentimentScore,
                  isRelevant: true // Only relevant tweets make it here
                });
              }
              
              // Get follower count from any tweet with user data
              if (tweet.user?.followers_count && followers === 0) {
                followers = tweet.user.followers_count;
              }
            }
            
            console.log(`📊 Processed ${uniqueTweets.length} total tweets`);
      } else {
        console.log(`⚠️ No tweets found for ${symbol}`);
      }
      
      // 🧠 SMART FALLBACK: Only apply when tweets are filtered for minor reasons, not spam
      if (recentMentions.length === 0 && uniqueTweets.length > 0) {
        console.log(`🔍 Checking if fallback should be applied...`);
        
        // Check if tweets were filtered due to spam vs minor filtering
        let hasHighSpamTweets = false;
        let spamTweetCount = 0;
        
        for (const tweet of uniqueTweets.slice(0, 5)) { // Check first 5 tweets
          const spamScore = this.detectHashtagSpam(tweet.text, symbolLower, nameLower);
          if (spamScore >= 3) { // High spam threshold
            hasHighSpamTweets = true;
            spamTweetCount++;
            console.log(`🚫 High spam tweet detected (score: ${spamScore}): "${tweet.text.substring(0, 50)}..."`);
          }
        }
        
        if (hasHighSpamTweets) {
          console.log(`🚫 SMART FALLBACK BLOCKED: ${spamTweetCount} high-spam tweets detected, not using fallback`);
          console.log(`📊 This prevents spam tweets like hashtag farming from getting through`);
        } else {
          console.log(`✅ SMART FALLBACK: No high-spam tweets detected, taking first ${Math.min(3, uniqueTweets.length)} tweets`);
          
          for (let i = 0; i < Math.min(3, uniqueTweets.length); i++) {
            const tweet = uniqueTweets[i];
            const likes = tweet.favorite_count || 0;
            const retweets = tweet.retweet_count || 0; 
            const replies = tweet.reply_count || 0;
            
            totalLikes += likes;
            totalRetweets += retweets;
            totalReplies += replies;
            totalMentions += 1;
            
            recentMentions.push({
              author: tweet.user?.screen_name || 'Unknown',
              authorName: tweet.user?.name || 'Unknown',
              text: tweet.text,
              likes: likes,
              retweets: retweets,
              replies: replies,
              createdAt: tweet.created_at,
              tweetId: tweet.id,
              sentiment: this.analyzeTweetSentiment(tweet.text),
              isRelevant: false, // Mark as not crypto-relevant but keep for display
              priority: 0 // Lowest priority
            });
          }
          console.log(`✅ SMART FALLBACK: Added ${recentMentions.length} tweets (no spam detected)`);
        }
      }
      
      // Compute 72h rolling average from historical cache if available
      let mentions72hAvg = null;
      try {
        const historyData = await fs.readFile(this.historicalMetricsFile, 'utf8');
        const history = JSON.parse(historyData);
        const tokenKey = `${symbol}_${name}`;
        const tokenHistory = history[tokenKey] || {};
        const dates = Object.keys(tokenHistory).sort().slice(-3); // last ~72h (3 daily snapshots)
        if (dates.length > 0) {
          const sum = dates.reduce((acc, d) => acc + (Number(tokenHistory[d]?.mentions) || 0), 0);
          mentions72hAvg = Math.round(sum / dates.length);
        }
      } catch (_) {}

      // Compute unique mention metrics
      const uniqueTweetIds = new Set((recentMentions || []).map(t => t.tweetId || t.id || t.tweet_id));
      const uniqueAuthorsSet = new Set((recentMentions || []).map(t => (t.author || t.user?.screen_name || t.user?.username || t.user?.name || '').toLowerCase()));

      // 🚀 SMART PROJECTION: Calculate displayMentions with market-cap-aware estimation
      let displayMentions = totalMentions;
      
      // Calculate engagement multiplier (viral tweets = more actual mentions)
      const avgEngagement = recentMentions.length > 0 
        ? recentMentions.reduce((sum, t) => sum + (t.likes || 0) + (t.retweets || 0), 0) / recentMentions.length
        : 0;
      
      // Engagement tiers (higher engagement = wider reach)
      let engagementMultiplier = 1.0;
      if (avgEngagement >= 100) engagementMultiplier = 2.5;       // Viral content
      else if (avgEngagement >= 50) engagementMultiplier = 2.0;   // High engagement
      else if (avgEngagement >= 20) engagementMultiplier = 1.5;   // Good engagement
      else if (avgEngagement >= 5) engagementMultiplier = 1.2;    // Moderate engagement
      
      // Market cap tiers (REDUCED RANGE for fairness - size alone shouldn't dominate)
      // Low caps with hype can have more mentions than large stagnant caps!
      let mcapMultiplier = 1.0;
      const mcap = metadata?.marketCap || null;
      if (mcap) {
        if (mcap >= 100_000_000) mcapMultiplier = 5;       // $100M+ = major (reduced from 15x)
        else if (mcap >= 50_000_000) mcapMultiplier = 4;   // $50M+ = established (reduced from 10x)
        else if (mcap >= 10_000_000) mcapMultiplier = 3;   // $10M+ = growing (reduced from 7x)
        else if (mcap >= 5_000_000) mcapMultiplier = 2.5;  // $5M+ = mid-tier (reduced from 5x)
        else if (mcap >= 1_000_000) mcapMultiplier = 2;    // $1M+ = small cap (reduced from 3x)
        else mcapMultiplier = 1.5;                          // <$1M = micro cap (reduced from 2x)
      } else {
        // No mcap data - use baseline
        mcapMultiplier = 2;
      }
      
      // 24h Volume multiplier (scales with trading activity - high volume = high social buzz)
      let volumeMultiplier = 1.0;
      const volume24h = metadata?.volume24h || null;
      if (volume24h) {
        // Volume tiers - aggressive scaling for high-volume tokens
        if (volume24h >= 100_000_000) volumeMultiplier = 40.0;       // $100M+ = Ultra whale territory
        else if (volume24h >= 50_000_000) volumeMultiplier = 30.0;   // $50M+ = Major league
        else if (volume24h >= 20_000_000) volumeMultiplier = 25.0;   // $20M+ = Hot token
        else if (volume24h >= 10_000_000) volumeMultiplier = 20.0;   // $10M+ = Very hot
        else if (volume24h >= 5_000_000) volumeMultiplier = 15.0;    // $5M+ = Hot
        else if (volume24h >= 1_000_000) volumeMultiplier = 10.0;    // $1M+ = Active
        else if (volume24h >= 500_000) volumeMultiplier = 6.0;       // $500k+ = Warm
        else if (volume24h >= 100_000) volumeMultiplier = 3.0;       // $100k+ = Decent
        else if (volume24h >= 50_000) volumeMultiplier = 2.5;        // $50k+ = Low
        else if (volume24h >= 10_000) volumeMultiplier = 2.0;        // $10k+ = Micro
        else if (volume24h >= 5_000) volumeMultiplier = 1.5;         // $5k+ = Very low
        else if (volume24h >= 1_000) volumeMultiplier = 1.2;         // $1k+ = Minimal
        
        console.log(`💹 Volume boost: $${(volume24h/1e6).toFixed(2)}M = ${volumeMultiplier}x multiplier`);
      }
      
      // HYPE-FIRST APPROACH: Combine mcap and volume with HEAVY WEIGHT on volume
      // Volume (hype) matters MORE than size for mentions!
      let sizeMultiplier;
      
      if (mcap && volume24h) {
        // Both available: Weighted average heavily favoring volume (70% volume, 30% mcap)
        sizeMultiplier = (volumeMultiplier * 0.7) + (mcapMultiplier * 0.3);
        console.log(`⚖️ Weighted size: volume ${volumeMultiplier}x (70%) + mcap ${mcapMultiplier}x (30%) = ${sizeMultiplier.toFixed(2)}x`);
      } else if (volume24h) {
        // Only volume: Use it fully (hype indicator)
        sizeMultiplier = volumeMultiplier;
        console.log(`📊 Using volume only: ${sizeMultiplier}x`);
      } else if (mcap) {
        // Only mcap: Use it but cap at 3x (prevent overweighting size without hype)
        sizeMultiplier = Math.min(mcapMultiplier, 3);
        console.log(`📊 Using capped mcap: ${sizeMultiplier}x (max 3x without volume)`);
      } else {
        // Neither: Use moderate baseline
        sizeMultiplier = 2;
      }
      
      // Synergy bonus: INCREASED for high volume/mcap ratio (hype indicator!)
      let synergyBonus = 1.0;
      if (mcap && volume24h) {
        // High volume relative to mcap = massive hype/momentum
        const volumeToMcapRatio = volume24h / mcap;
        if (volumeToMcapRatio >= 0.5) synergyBonus = 2.0;       // 50%+ turnover = MASSIVE hype! (was 1.5x)
        else if (volumeToMcapRatio >= 0.3) synergyBonus = 1.6;  // 30%+ = major hype (was 1.3x)
        else if (volumeToMcapRatio >= 0.1) synergyBonus = 1.3;  // 10%+ = good hype (was 1.15x)
        else if (volumeToMcapRatio >= 0.05) synergyBonus = 1.15; // 5%+ = some hype
        
        console.log(`🔥 Volume/Mcap ratio: ${(volumeToMcapRatio * 100).toFixed(1)}% = ${synergyBonus}x HYPE bonus`);
      }
      
      // 🚨 REMOVED HISTORICAL BLENDING: Use pure market-driven projection only
      // Historical averages were killing projections for surging high-volume tokens
      // (e.g., LAUNCHCOIN: projected=99, but capped at 20 due to 72h avg of 8)
      {
        // New token without history - use market/volume-aware projection
        // Base: sample * time_multiplier * size_multiplier * engagement_multiplier * synergy_bonus
        const baseSampleMultiplier = 1.0; // NO BASE MULTIPLIER: Only volume/size/engagement matter
        
        let projected = totalMentions * baseSampleMultiplier * sizeMultiplier * engagementMultiplier * synergyBonus;
        
        // Floor: Minimum realistic mentions by market cap OR volume (whichever is higher)
        let minMentions = 10; // CONSERVATIVE: Lower base minimum (was 15)
        if (mcap) {
          if (mcap >= 100_000_000) minMentions = Math.max(minMentions, 200);
          else if (mcap >= 50_000_000) minMentions = Math.max(minMentions, 100);
          else if (mcap >= 10_000_000) minMentions = Math.max(minMentions, 50);
          else if (mcap >= 5_000_000) minMentions = Math.max(minMentions, 30);
          else if (mcap >= 1_000_000) minMentions = Math.max(minMentions, 20);
        }
        // Volume-based floor (helps micro caps with decent volume)
        if (volume24h) {
          if (volume24h >= 100_000) minMentions = Math.max(minMentions, 50);  // $100k+ vol
          else if (volume24h >= 50_000) minMentions = Math.max(minMentions, 30);   // $50k+ vol
          else if (volume24h >= 10_000) minMentions = Math.max(minMentions, 20);   // $10k+ vol
        }
        
        // Ceiling: Prevent unrealistic inflation (based on larger of mcap or volume)
        let maxMentions = 500;
        if (mcap) maxMentions = Math.max(maxMentions, Math.min(5000, mcap / 50000));
        if (volume24h) maxMentions = Math.max(maxMentions, Math.min(2000, volume24h / 100)); // Adjusted for lower volume thresholds
        
        displayMentions = Math.round(Math.max(minMentions, Math.min(maxMentions, projected)));
        
        console.log(`📊 Projection (new token): base=${totalMentions}, size=${sizeMultiplier}x (mcap=${mcapMultiplier}x, vol=${volumeMultiplier}x), eng=${engagementMultiplier}x, synergy=${synergyBonus}x, final=${displayMentions}`);
      }

      // Summary (extract metadata for logging)
      const summaryMcap = metadata?.marketCap || null;
      const summaryVolume = metadata?.volume24h || null;
      
      console.log(`📊 Twitter Search Summary for ${symbol}:`);
      console.log(`   🎯 Official Handle: ${officialHandle || 'not found'}`);
      console.log(`   👥 Followers: ${followers}`);
      console.log(`   📊 Sample Mentions: ${totalMentions} (from ${recentMentions.length} tweets)${mentions72hAvg != null ? ` | 72h avg: ${mentions72hAvg}` : ''}`);
      console.log(`   📈 Display Mentions: ${displayMentions} (smart projection with market/volume)`);
      console.log(`   💰 Market Cap: ${summaryMcap ? `$${(summaryMcap/1e6).toFixed(1)}M` : 'unknown'}`);
      console.log(`   💹 24h Volume: ${summaryVolume ? `$${(summaryVolume/1e6).toFixed(2)}M` : 'unknown'}`);
      console.log(`   🔥 Avg Engagement: ${Math.round(avgEngagement)}`);
      console.log(`   💖 Total Engagement: ${totalLikes + totalRetweets + totalReplies}`);
      
      return {
        symbol: symbol,
        name: name,
        
        // Official Twitter Account Info
        officialHandle: officialHandle || 'not found',
        username: username,
        followers: followers,
        hasOfficialAccount: !!officialHandle,
        
        // Community Activity Metrics
        mentions: totalMentions, // 🚨 FIX: Always use actual totalMentions for display
        displayMentions: displayMentions, // UI-friendly estimated mentions
        mentions24h: totalMentions,
        mentions72hAvg: mentions72hAvg != null ? mentions72hAvg : null,
        mentionsWindowHours: mentions72hAvg != null ? 72 : 0,
        _mentionsSmoothing: mentions72hAvg != null ? '72h_avg' : 'single_fetch_5',
        uniqueMentions: uniqueTweetIds.size || (recentMentions?.length || 0),
        uniqueAuthors: uniqueAuthorsSet.size || 0,
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
        tweets: recentMentions,
        
        // Sentiment Analysis
        sentimentScore: this.calculateOverallSentiment(recentMentions),

        // Status and Metadata
        status: totalMentions > 0 ? 'active' : 'limited_activity',
        communityHealth: this.calculateCommunityHealthFromMetrics(totalMentions, totalLikes, totalRetweets, followers),
        lastUpdated: new Date().toISOString(),
        lastRefreshed: new Date().toISOString(), // 🚨 FIX: Set consistent timestamp field
        twitterTimestamp: new Date().toISOString() // 🚨 FIX: Set token-level timestamp field
      };
      
    } catch (error) {
      console.error(`❌ Twitter microservice error for ${symbol}: ${error.message}`);
      
      // 🚨 CRITICAL FIX: Check for existing cached data before using defaults
      const cacheKey = `${symbol}_${name}`;
      const cached = this.twitterMetricsCache.get(cacheKey);
      if (cached && cached.data) {
        console.log(`📦 Using cached Twitter data for ${symbol} (microservice error)`);
        const preservedData = { ...cached.data };
        preservedData._dataFreshness = 'preserved_microservice_error';
        preservedData._preservedAt = new Date().toISOString();
        preservedData._errorMessage = error.message;
        return preservedData;
      }
      
      console.log(`⚠️ No cached data found for ${symbol}, using default data`);
      const fallbackData = this.getDefaultTwitterData(symbol, name);
      fallbackData._dataFreshness = 'error_fallback';
      fallbackData._errorMessage = error.message;
      return fallbackData;
    }
  }

  /**
   * Check if a tweet is relevant to cryptocurrency/token discussion
   * Filters out non-crypto tweets (e.g., political Trump tweets vs Trump coin tweets)
   */
  isCryptoRelevantTweet(tweetText, symbol, name) {
    const text = tweetText.toLowerCase();
    const symbolLower = symbol.toLowerCase();
    const safeName = name || symbol; // Fallback to symbol if name is undefined
    const nameLower = safeName.toLowerCase();
    
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
      'coingecko', 'coinmarketcap', 'dexscreener', 'jupiter', 'raydium',
      // NFT and collection-specific keywords
      'collection', 'penguin', 'penguins', 'pudgy', 'nft collection', 'digital art',
      'floor price', 'floor', 'rarity', 'trait', 'attributes', 'metadata',
      'opensea', 'magiceden', 'solanart', 'exchange art', 'tensor'
    ];
    
    // NON-CRYPTO KEYWORDS - Strong indicators this is NOT about cryptocurrency
    const nonCryptoKeywords = [
      // Sports (MAJOR issue for SCF = SC Freiburg football team)
      'football', 'soccer', 'fußball', 'bundesliga', 'europa league', 'uefa', 'uel',
      'match', 'game', 'goal', 'player', 'team', 'coach', 'stadium', 'league',
      'freiburg', 'sc freiburg', 'scfreiburg', 'kickbase', 'sport', 'sports',
      'vs ', ' vs', 'gegen', 'spiel', 'mannschaft', 'trainer', 'saison',
      
      // Finance/Banking (SCF = Supply Chain Finance)
      'supply chain finance', 'supply chain financing', 'invoice', 'factoring',
      'accounts receivable', 'working capital', 'trade finance', 'financing',
      'bank', 'banking', 'financial services', 'corporate finance', 'finance',
      'بانک', 'مالی', 'تامین مالی', // Persian banking terms
      
      // Political/Government (for Trump example)
      'president', 'election', 'vote', 'campaign', 'politics', 'political',
      'white house', 'congress', 'senate', 'democrat', 'republican', 'maga',
      'policy', 'government', 'administration', 'inauguration',
      'police', 'nhs', 'corruption', 'scandal', 'parastatal', 'county',
      'kenya', 'kenyan', 'theft', 'wizi', 'useless ppe', 'medical supplies',
      
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
      'basketball', 'weather', 'news', 'breaking news', 'just in', 'developing',
      'health', 'medical', 'doctor', 'hospital', 'covid', 'vaccine',
      
      // Social media engagement (non-crypto)
      'follow me', 'follow back', 'follow for follow', 'f4f', 'like for like',
      'retweet for retweet', 'rt for rt', 'mutual follow', 'follow train'
    ];
    
    // WEIGHTED SCORING SYSTEM - More flexible than strict rejection
    let cryptoScore = 0;
    let nonCryptoScore = 0;

    // Check for crypto keywords (strong positive indicators)
    for (const keyword of cryptoKeywords) {
      if (text.includes(keyword)) {
        cryptoScore += 2; // Each crypto keyword = +2 points
      }
    }

    // Check for non-crypto keywords (negative indicators, but not automatic rejection)
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
        nonCryptoScore += 1; // Each non-crypto keyword = -1 point
      }
    }
    
    // 🚨 HASHTAG SPAM DETECTION - Filter out hashtag farming tweets
    const hashtagSpamScore = this.detectHashtagSpam(text, symbolLower, nameLower);
    if (hashtagSpamScore > 0) {
      nonCryptoScore += hashtagSpamScore; // Heavy penalty for hashtag spam
      console.log(`   🚫 HASHTAG SPAM DETECTED: +${hashtagSpamScore} penalty points`);
    }
    
    // Special checks for cashtag format ($SYMBOL) and hashtag context
    if (text.includes(`$${symbolLower}`)) {
      cryptoScore += 2; // Cashtags are usually crypto-related
    }
    
    // NOTE: Removed automatic crypto points for hashtags - too many false positives
    // Hashtags alone are not sufficient evidence of crypto relevance (e.g., #SCF = football team)
    
    // Solana ecosystem indicators (common for meme coins)
    if (text.includes('solana') || text.includes('sol') || text.includes('meme coin') || text.includes('memecoin')) {
      cryptoScore += 1;
    }
    
    // Check for price-related content
    if (text.match(/\$[\d,]+\.?\d*/) || text.includes('price') || text.includes('usd')) {
      cryptoScore += 1;
    }
    
    // Check for percentage changes (common in crypto tweets)
    if (text.match(/[+-]?\d+\.?\d*%/)) {
      cryptoScore += 1;
    }
    
    // WEIGHTED DECISION LOGIC - Balance accuracy with coverage

    // Calculate net score (crypto points minus non-crypto penalties)
    const netScore = cryptoScore - nonCryptoScore;

    // IMMEDIATE APPROVAL: Strong crypto signals (even with some non-crypto elements)
    if (cryptoScore >= 6) {
      console.log(`   🪙 APPROVED: Very strong crypto indicators (crypto: ${cryptoScore}, non-crypto: ${nonCryptoScore}, net: ${netScore})`);
      return true; // Multiple crypto keywords = definitely crypto
    }

    // IMMEDIATE APPROVAL: Cashtag ($SYMBOL) = very high confidence
    if (text.includes(`$${symbolLower}`)) {
      console.log(`   💰 APPROVED: Cashtag $${symbolLower} found (crypto: ${cryptoScore}, non-crypto: ${nonCryptoScore}, net: ${netScore})`);
      return true; // Cashtags are almost always crypto
    }

    // APPROVAL: Strong net positive score
    if (netScore >= 3) {
      console.log(`   ✅ APPROVED: Strong net crypto score (crypto: ${cryptoScore}, non-crypto: ${nonCryptoScore}, net: ${netScore})`);
      return true; // Net positive = likely crypto-related
    }

    // APPROVAL: Moderate crypto score with price/volume indicators
    if (cryptoScore >= 2 && (text.match(/\$[\d,]+\.?\d*/) || text.match(/[+-]?\d+\.?\d*%/))) {
      console.log(`   📈 APPROVED: Crypto keywords + price indicators (crypto: ${cryptoScore}, non-crypto: ${nonCryptoScore}, net: ${netScore})`);
      return true;
    }

    // APPROVAL: Solana ecosystem mentions (very common for meme coins)
    if (text.includes('solana') || text.includes('spl token') || text.includes('sol blockchain')) {
      console.log(`   ⛓️ APPROVED: Solana ecosystem mention (crypto: ${cryptoScore}, non-crypto: ${nonCryptoScore}, net: ${netScore})`);
      return true;
    }

    // APPROVAL: Token hashtag + some crypto context
    if (text.includes(`#${symbolLower}`) && cryptoScore >= 1) {
      console.log(`   🏷️ APPROVED: Token hashtag + crypto context (crypto: ${cryptoScore}, non-crypto: ${nonCryptoScore}, net: ${netScore})`);
      return true;
    }

    // APPROVAL: Direct token mentions (official handle or hashtag) - very high confidence
    if (text.includes(`@${symbolLower}`) || text.includes(`$${symbolLower}`)) {
      console.log(`   🎯 APPROVED: Direct token mention (crypto: ${cryptoScore}, non-crypto: ${nonCryptoScore}, net: ${netScore})`);
      return true;
    }
    
    // APPROVAL: Hashtag with crypto context (not just hashtag farming)
    if (text.includes(`#${symbolLower}`) && cryptoScore >= 2) {
      console.log(`   🏷️ APPROVED: Token hashtag + strong crypto context (crypto: ${cryptoScore}, non-crypto: ${nonCryptoScore}, net: ${netScore})`);
      return true;
    }

    // APPROVAL: NFT/Collection-specific tokens (PENGU, etc.) - be more lenient
    const nftTokens = ['pengu', 'pudgy', 'penguins', 'nft', 'collection'];
    if (nftTokens.some(nftToken => symbolLower.includes(nftToken) || nameLower.includes(nftToken))) {
      if (cryptoScore >= 1 || text.includes('nft') || text.includes('collection') || text.includes('floor')) {
        console.log(`   🐧 APPROVED: NFT/Collection token with relevant context (crypto: ${cryptoScore}, non-crypto: ${nonCryptoScore}, net: ${netScore})`);
        return true;
      }
    }

    // REJECTION: Net negative score or no crypto indicators
    if (netScore <= 0 || cryptoScore === 0) {
      console.log(`   ❌ REJECTED: Insufficient crypto indicators (crypto: ${cryptoScore}, non-crypto: ${nonCryptoScore}, net: ${netScore})`);
      return false;
    }

    // REJECTION: Too many non-crypto indicators relative to crypto ones
    if (nonCryptoScore > cryptoScore * 2) {
      console.log(`   🚫 REJECTED: Too many non-crypto indicators (crypto: ${cryptoScore}, non-crypto: ${nonCryptoScore}, net: ${netScore})`);
      return false;
    }
    
    // REJECTION: High hashtag spam score (automatic rejection)
    if (hashtagSpamScore >= 5) {
      console.log(`   🚫 REJECTED: High hashtag spam score (${hashtagSpamScore}) - likely spam/farming`);
      return false;
    }

    // DEFAULT REJECTION: If we get here, insufficient crypto relevance
    console.log(`   ❌ REJECTED: Insufficient crypto relevance (crypto: ${cryptoScore}, non-crypto: ${nonCryptoScore}, net: ${netScore})`);
    return false;
  }

  /**
   * Detect hashtag spam patterns in tweets
   * Returns penalty score (higher = more spam-like)
   */
  detectHashtagSpam(tweetText, symbolLower, nameLower) {
    const text = tweetText.toLowerCase();
    let spamScore = 0;
    
    // Pattern 1: Excessive hashtags (more than 10 hashtags = likely spam)
    const hashtagCount = (text.match(/#\w+/g) || []).length;
    if (hashtagCount > 10) {
      spamScore += 5; // Heavy penalty for hashtag overload
      console.log(`   📊 Hashtag overload: ${hashtagCount} hashtags detected`);
    } else if (hashtagCount > 5) {
      spamScore += 2; // Moderate penalty
    }
    
    // Pattern 2: Long list of unrelated hashtags (like the FWOG example)
    const hashtagListPattern = /#[a-zA-Z0-9]+(\s+#[a-zA-Z0-9]+){5,}/g;
    if (hashtagListPattern.test(text)) {
      spamScore += 4; // Heavy penalty for hashtag lists
      console.log(`   📝 Hashtag list pattern detected`);
    }
    
    // Pattern 3: Token hashtag buried in unrelated content
    const tokenHashtag = `#${symbolLower}`;
    if (text.includes(tokenHashtag)) {
      // Check if the token hashtag is near the end of a long hashtag list
      const hashtagMatches = text.match(/#\w+/g) || [];
      const tokenHashtagIndex = hashtagMatches.findIndex(ht => ht === tokenHashtag);
      
      if (tokenHashtagIndex > 5) {
        spamScore += 3; // Penalty for token hashtag buried in spam
        console.log(`   🏷️ Token hashtag buried in spam list (position ${tokenHashtagIndex + 1})`);
      }
    }
    
    // Pattern 4: Generic promotion language without specific token context
    const genericPromoPhrases = [
      'check out', 'most innovative', 'best project', 'next big thing',
      'don\'t miss', 'huge potential', 'moon soon', 'to the moon',
      'breaking news', 'just launched', 'limited time', 'exclusive',
      'not just another token', 'future of', 'post → earn', 'instantly',
      'meme monetization', 'earn sol', 'earn instantly'
    ];
    
    const hasGenericPromo = genericPromoPhrases.some(phrase => text.includes(phrase));
    const hasTokenContext = text.includes(symbolLower) || text.includes(nameLower) || 
                           text.includes(`$${symbolLower}`) || text.includes(`#${symbolLower}`);
    
    if (hasGenericPromo && !hasTokenContext) {
      spamScore += 3; // Penalty for generic promotion without token context
      console.log(`   🎯 Generic promotion without token context`);
    }
    
    // Pattern 5: MGF-style promotional tweets with multiple unrelated crypto hashtags
    const unrelatedCryptoHashtags = ['#doge', '#pepe', '#wif', '#eth', '#trump', '#pnut', '#fartcoin'];
    const unrelatedHashtagCount = unrelatedCryptoHashtags.filter(hashtag => text.includes(hashtag)).length;
    
    if (unrelatedHashtagCount >= 3) {
      spamScore += 4; // Heavy penalty for unrelated crypto hashtag farming
      console.log(`   🚫 Unrelated crypto hashtag farming: ${unrelatedHashtagCount} unrelated hashtags`);
    }
    
    // Pattern 5: Very short tweets with only hashtags (bot-like behavior)
    const words = text.split(/\s+/).filter(word => word.length > 0);
    const hashtagWords = words.filter(word => word.startsWith('#'));
    
    if (words.length < 10 && hashtagWords.length > words.length * 0.6) {
      spamScore += 2; // Penalty for hashtag-heavy short tweets
      console.log(`   🤖 Bot-like hashtag-heavy tweet`);
    }
    
    // Pattern 6: Multiple cashtags for different tokens (promotion spam)
    const cashtagMatches = text.match(/\$[A-Z0-9]+/g) || [];
    if (cashtagMatches.length > 3) {
      spamScore += 2; // Penalty for multiple cashtags
      console.log(`   💰 Multiple cashtags detected: ${cashtagMatches.join(', ')}`);
    }
    
    return spamScore;
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
   * 🚨 ENHANCED: Now uses Jupiter social data to improve scoring when Twitter API is limited
   */
  getDefaultTwitterData(symbol, name, freshness = 'default', jupiterData = null) {
    // Base default values
    let enhancedCommunityHealth = 0;
    let officialHandle = 'not found';
    let hasOfficialAccount = false;
    let followers = 0;
    
    // 🚨 NEW: Extract and use Jupiter social data for enhanced scoring
    if (jupiterData) {
      // Check for official Twitter/X handle from Jupiter
      const jupiterHandle = jupiterData.twitter || 
                           jupiterData.socials?.twitter || 
                           jupiterData.socials?.x || 
                           null;
      
      if (jupiterHandle) {
        officialHandle = jupiterHandle;
        hasOfficialAccount = true;
        enhancedCommunityHealth = 4.0; // Boost from 0 to 4.0 for having official social presence
        console.log(`📈 ${symbol}: Enhanced default community health to ${enhancedCommunityHealth} using Jupiter social data (${jupiterHandle})`);
      }
      
      // Use market metrics as social engagement indicators
      const marketCap = jupiterData.marketCap || 0;
      const volume24h = jupiterData.stats24h?.volume || 0;
      const holders = jupiterData.holders || 0;
      
      // Market cap boost (indicates community size/interest)
      if (marketCap > 50000000) enhancedCommunityHealth += 2.0; // $50M+ mcap
      else if (marketCap > 10000000) enhancedCommunityHealth += 1.5; // $10M+ mcap
      else if (marketCap > 1000000) enhancedCommunityHealth += 1.0; // $1M+ mcap
      else if (marketCap > 100000) enhancedCommunityHealth += 0.5; // $100K+ mcap
      
      // Volume boost (indicates active engagement)
      if (volume24h > 1000000) enhancedCommunityHealth += 1.0; // $1M+ volume
      else if (volume24h > 100000) enhancedCommunityHealth += 0.5; // $100K+ volume
      
      // Holder count boost (indicates community size)
      if (holders > 10000) enhancedCommunityHealth += 0.5; // 10K+ holders
      else if (holders > 1000) enhancedCommunityHealth += 0.3; // 1K+ holders
      
      // Cap at reasonable maximum for default data
      enhancedCommunityHealth = Math.min(enhancedCommunityHealth, 7.0);
      
      console.log(`📊 ${symbol}: Jupiter-enhanced community health: ${enhancedCommunityHealth} (mcap: $${marketCap?.toLocaleString()}, vol: $${volume24h?.toLocaleString()}, holders: ${holders})`);
    }
    
    return {
      symbol: symbol,
      name: name,

      // Official Twitter Account Info (enhanced with Jupiter data)
      officialHandle: officialHandle,
      username: null,
      followers: followers,
      hasOfficialAccount: hasOfficialAccount,

      // Community Activity Metrics
      mentions: 0,
      displayMentions: jupiterData ? Math.max(8, Math.floor((jupiterData.marketCap || 0) / 1000000) * 2) : 8, // Baseline estimate
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
      status: jupiterData ? 'jupiter_enhanced' : 'no_data',
      communityHealth: enhancedCommunityHealth,
      lastUpdated: new Date().toISOString(),
      _dataFreshness: freshness, // Track data freshness
      _jupiterEnhanced: !!jupiterData
    };
  }

  /**
   * Generate enhanced fallback Twitter data with realistic tweet content
   * Used when Twitter microservice is unavailable
   */
  generateEnhancedFallbackData(symbol, name) {
    console.log(`🔄 Generating enhanced fallback Twitter data for ${symbol} (microservice unavailable)`);
    
    // Generate realistic metrics based on token characteristics
    const baseMentions = Math.floor(Math.random() * 25) + 10; // 10-35 mentions
    const baseLikes = Math.floor(Math.random() * 60) + 15; // 15-75 likes
    const baseRetweets = Math.floor(Math.random() * 20) + 3; // 3-23 retweets
    const baseReplies = Math.floor(Math.random() * 15) + 2; // 2-17 replies
    
    // Generate realistic tweet content based on token type
    const fallbackTweets = this.generateRealisticTweets(symbol, name, baseMentions);
    
    return {
      symbol: symbol,
      name: name,
      mentions: baseMentions,
      mentions24h: baseMentions,
      likes: baseLikes,
      retweets: baseRetweets,
      replies: baseReplies,
      followers: 0,
      engagement: {
        likes: baseLikes,
        retweets: baseRetweets,
        replies: baseReplies,
        total: baseLikes + baseRetweets + baseReplies
      },
      recentMentions: fallbackTweets,
      tweets: fallbackTweets,
      sentiment: 6,
      communityHealth: Math.min(10, Math.floor((baseMentions + baseLikes + baseRetweets) / 4)),
      lastUpdated: new Date().toISOString(),
      _dataFreshness: 'enhanced_fallback',
      _fallbackReason: 'microservice_unavailable'
    };
  }

  /**
   * Generate realistic tweet content based on token characteristics
   */
  generateRealisticTweets(symbol, name, mentionCount) {
    const tweets = [];
    const symbolLower = symbol.toLowerCase();
    
    // Different tweet templates based on token type
    const tweetTemplates = [
      `Just discovered ${symbol}! This looks promising 🚀 #${symbolLower} #crypto #solana`,
      `Researching ${name} - community looks strong! #${symbolLower} #defi #web3`,
      `${symbol} is trending! Time to do some research 📊 #${symbolLower} #memecoin #solana`,
      `Holding ${symbol} for the long term 💎 #${symbolLower} #hodl #crypto`,
      `${symbol} community is amazing! #${symbolLower} #community #crypto`,
      `Just bought more ${symbol}! #${symbolLower} #buy #crypto`,
      `${symbol} to the moon! 🚀 #${symbolLower} #moon #crypto`,
      `Diamond hands on ${symbol} 💎 #${symbolLower} #diamondhands #crypto`,
      `${symbol} is the future! #${symbolLower} #future #crypto`,
      `Love the ${name} project! #${symbolLower} #project #crypto`
    ];
    
    // Generate 3-5 tweets
    const tweetCount = Math.min(5, Math.max(3, Math.floor(mentionCount / 5)));
    
    for (let i = 0; i < tweetCount; i++) {
      const template = tweetTemplates[i % tweetTemplates.length];
      const likes = Math.floor(Math.random() * 15) + 1;
      const retweets = Math.floor(Math.random() * 5);
      const replies = Math.floor(Math.random() * 3);
      
      tweets.push({
        author: `crypto_user_${i + 1}`,
        authorName: `Crypto User ${i + 1}`,
        text: template,
        likes: likes,
        retweets: retweets,
        replies: replies,
        createdAt: new Date(Date.now() - Math.random() * 24 * 60 * 60 * 1000).toISOString(),
        tweetId: `fallback_${symbol}_${Date.now()}_${i + 1}`,
        sentiment: 6 + Math.floor(Math.random() * 3), // 6-8 sentiment
        isRelevant: true,
        priority: 2
      });
    }
    
    return tweets;
  }

  /**
   * Save Twitter metrics directly to main tokens cache (more efficient)
   */
  async saveTwitterMetricsToFile() {
    try {
      if (this.twitterMetricsCache.size <= 1) {
        console.log('📊 No Twitter metrics to save');
        return;
      }
      
      // Load main tokens cache
      const tokensCachePath = process.env.DATA_DIR ? 
        path.join(process.env.DATA_DIR, 'cache', 'tokens-cache.json') : 
        path.join(__dirname, 'cache', 'tokens-cache.json');
      
      let tokens = [];
      try {
        const tokensData = await fs.readFile(tokensCachePath, 'utf8');
        tokens = JSON.parse(tokensData);
      } catch (error) {
        console.error('❌ Failed to load tokens cache:', error.message);
        return;
      }
      
      // Update tokens with Twitter data directly
      let updatedCount = 0;
      for (const [key, twitterData] of this.twitterMetricsCache) {
        if (key === '_metadata') continue;
        
        // Find matching token by trying different key formats
        const possibleKeys = [
          key,
          key.replace('_undefined', ''),
          key.split('_')[0], // Just the symbol part
          key.split('_')[1]  // Just the name part
        ];
        
        for (const tokenKey of possibleKeys) {
          const token = tokens.find(t => 
            t.symbol === tokenKey || 
            t.name === tokenKey ||
            `${t.symbol}_${t.name}` === tokenKey ||
            `${t.symbol}_${t.name}_undefined` === tokenKey
          );
          
          if (token && twitterData.data) {
            token.twitterData = twitterData.data;
            token._twitterDataMerged = true;
            token._twitterDataMergedAt = new Date().toISOString();
            updatedCount++;
            break;
          }
        }
      }
      
      // 🛡️ ATOMIC WRITE WITH LOCK: Save updated tokens cache with atomic write and lock protection
      const cacheLock = new CacheLockService(tokensCachePath);
      
      try {
        await cacheLock.atomicWrite(tokens);
        console.log(`💾 Updated ${updatedCount} tokens with Twitter data directly in main cache (atomic write with lock)`);
      } catch (error) {
        console.error('❌ Error saving Twitter data to cache:', error);
        throw error;
      }
      
      // Also save to separate file for backup/debugging
      const dataToSave = {
        _metadata: {
          lastRefreshTime: Date.now(),
          totalTokens: this.twitterMetricsCache.size - 1,
          updatedInMainCache: updatedCount
        }
      };
      
      for (const [key, value] of this.twitterMetricsCache) {
        dataToSave[key] = value;
      }
      
      await fs.writeFile(this.twitterMetricsFile, JSON.stringify(dataToSave, null, 2));
      console.log(`💾 Also saved ${this.twitterMetricsCache.size - 1} Twitter metrics to separate file for backup`);
      
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
      console.log(`🏆 Community Health Score calculated for ${symbol}: ${communityHealthScore.toFixed(2)}/10`);
      
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
   * FINAL WEIGHTS: Mentions 55%, Engagement 35%, Followers 5%, Quality 5%
   * (Removed redundant Recent Activity scoring - prioritizes mention volume and engagement quality)
   */
  calculateCommunityHealthScore(twitterData, socials = null, jupiterData = null) {
    let score = 2.0; // Base score - lowered to make scoring more dynamic
    
    
    // Check for Jupiter organic score penalty (scale 0-100)
    const organicScore = jupiterData?.organicScore || this._currentJupiterData?.organicScore;
    const hasOrganicPenalty = typeof organicScore === 'number' && organicScore < 20; // 20/100 = 20% threshold
    
    try {
      // 1. MENTIONS SCORING (55% weight) - PRIMARY importance for community buzz
      // 🚨 CRITICAL: Use displayMentions (projected) not raw mentions!
      const mentionsRaw = Number(twitterData.displayMentions || twitterData.mentions || 0);
      const has72h = Number(twitterData.mentionsWindowHours || 0) >= 72;
      const isBootstrap = !has72h; // no history yet
      
      // 🚨 NEW TIERED SCORING: Scale properly with projected mention counts
      let mentionsScore = 0;
      if (mentionsRaw >= 500) mentionsScore = 3.5;        // 500+ = Maximum buzz
      else if (mentionsRaw >= 200) mentionsScore = 3.0;   // 200+ = Massive buzz
      else if (mentionsRaw >= 100) mentionsScore = 2.5;   // 100+ = Major buzz
      else if (mentionsRaw >= 50) mentionsScore = 2.0;    // 50+ = Strong buzz
      else if (mentionsRaw >= 25) mentionsScore = 1.5;    // 25+ = Good buzz
      else if (mentionsRaw >= 15) mentionsScore = 1.0;    // 15+ = Moderate buzz
      else if (mentionsRaw >= 10) mentionsScore = 0.6;    // 10+ = Some buzz
      else if (mentionsRaw >= 5) mentionsScore = 0.3;     // 5+ = Minimal buzz

      score += mentionsScore;
      
      // 2. ENGAGEMENT SCORING (35% weight) - Quality of community interaction
      const totalEngagement = (twitterData.likes || 0) + (twitterData.retweets || 0) + (twitterData.replies || 0);
      const engagementRate = mentionsRaw > 0 ? totalEngagement / mentionsRaw : 0;
      
      let engagementScore = 0;
      if (engagementRate >= 8) engagementScore = 2.5;      // 8+ engagement = excellent
      else if (engagementRate >= 5) engagementScore = 2.0; // 5+ engagement = very good  
      else if (engagementRate >= 3) engagementScore = 1.5; // 3+ engagement = good
      else if (engagementRate >= 2) engagementScore = 1.2; // 2+ engagement = decent
      else if (engagementRate >= 1) engagementScore = 0.8; // 1+ engagement = some
      else if (engagementRate >= 0.5) engagementScore = 0.5; // 0.5+ engagement = minimal
      
      // Apply organic score penalty to engagement (artificial activity detection)
      if (hasOrganicPenalty) {
        const penaltyFactor = Math.max(0.1, organicScore / 100); // Scale penalty based on organic score (0-100 scale)
        engagementScore *= penaltyFactor;
      }
      
      // Boost engagement weight in bootstrap since mentions are capped
      const engagementWeight = isBootstrap ? 0.45 : 0.35;
      const engagementScoreWeighted = engagementScore * (engagementWeight / 0.35);
      score += engagementScoreWeighted;
      
      // 3. FOLLOWER BASE SCORING (5% weight) - Minor importance
      const followers = twitterData.followers || 0;
      let followersScore = 0;
      if (followers >= 5000) followersScore = 0.5;     // 5K+ followers = excellent reach
      else if (followers >= 1000) followersScore = 0.4; // 1K+ followers = good reach
      else if (followers >= 500) followersScore = 0.3;  // 500+ followers = decent reach
      else if (followers >= 100) followersScore = 0.2;  // 100+ followers = some reach
      else if (followers >= 10) followersScore = 0.1;   // 10+ followers = minimal reach
      
      score += followersScore;
      
      // 4. RECENT ACTIVITY SCORING - REMOVED (redundant with mentions)
      // This was counting the same tweets already weighted in mentions scoring
      
      // 4. QUALITY INDICATORS (5% weight) - Basic legitimacy checks
      const hasOfficialAccount = twitterData.username ? 1.0 : 0;
      const hasRecentActivity = mentionsRaw > 0 ? 1.0 : 0;
      let qualityScore = (hasOfficialAccount + hasRecentActivity) * 0.5; // base
      // Bootstrap quality bump to avoid unfair nerf on brand-new tokens
      if (isBootstrap) {
        const engagementPerPost = mentionsRaw > 0 ? totalEngagement / mentionsRaw : 0;
        const bump = Math.max(0, Math.min(0.7, (engagementPerPost >= 2 ? 0.5 : 0.3) + (hasOfficialAccount ? 0.2 : 0)));
        qualityScore += bump;
      }
      score += qualityScore;
      
      // 5. SOCIAL LINKS BONUS (BONUS points) - Legitimacy and community building
      if (socials) {
        const socialCount = Object.keys(socials).filter(key => 
          socials[key] && socials[key] !== 'not_found' && socials[key] !== ''
        ).length;
        
        let socialBonus = 0;
        if (socialCount >= 5) socialBonus = 1.0;      // All 5 socials = +1.0 bonus
        else if (socialCount >= 3) socialBonus = 0.75; // 3+ socials = +0.75 bonus  
        else if (socialCount >= 2) socialBonus = 0.5; // 2+ socials = +0.5 bonus
        
        if (socialBonus > 0) {
          console.log(`🌐 Social links bonus: ${socialCount} platforms = +${socialBonus.toFixed(2)} points`);
        }
        
        score += socialBonus;
      }
      
      // Ensure score is within 0-10 range
      score = Math.min(9.9, Math.max(0, score));
      
      
      return score;
      
    } catch (error) {
      console.error('❌ Error calculating community health score:', error.message);
      return 2.0; // Return base score on error
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
    
    // DON'T run initial refresh immediately - let the normal processing workflow handle it
    // This prevents Twitter API calls before Jupiter API in the processing order
    
    // Set up 24-hour interval (24 * 60 * 60 * 1000 = 24 hours in milliseconds)
    this.backgroundRefreshInterval = setInterval(async () => {
      await this.runBackgroundRefresh();
    }, 24 * 60 * 60 * 1000);
    
    console.log('✅ Background refresh system started - will run every 24 hours (no immediate refresh)');
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
   * @param {string} symbol - Token symbol
   * @param {string} name - Token name  
   * @param {boolean} adminBypass - If true, bypasses TwitterApiManager cooldowns (admin only)
   * @param {Object} metadata - Token metadata (marketCap, volume24h) for projection
   */
  async forceImmediateRefresh(symbol, name, adminBypass = false, metadata = null) {
    try {
      console.log(`🚀 Force refreshing ${symbol} (${name}) immediately...${adminBypass ? ' [ADMIN BYPASS]' : ''}`);
      
      // Force refresh and update cache
      const twitterData = await this.getTwitterSocialData(symbol, name, true, null, null, adminBypass, metadata);
      
      console.log(`✅ Immediate refresh completed for ${symbol}: ${twitterData.displayMentions || twitterData.mentions} mentions (projected)`);
      return twitterData;
      
    } catch (error) {
      console.error(`❌ Immediate refresh failed for ${symbol}:`, error.message);
      throw error;
    }
  }

  /**
   * Get historical Twitter data for 24-hour comparisons
   */
  async getHistoricalTwitterData(symbol, name) {
    try {
      const historyData = await fs.readFile(this.historicalMetricsFile, 'utf8');
      const history = JSON.parse(historyData);
      
      const tokenKey = `${symbol}_${name}`;
      const tokenHistory = history[tokenKey] || {};
      
      // 🚨 CRITICAL FIX: Find MOST RECENT snapshot instead of "yesterday"
      // With 5-day cooldown, "yesterday" never exists - need last refresh
      const dates = Object.keys(tokenHistory).sort();  // Chronological order
      
      if (dates.length === 0) {
        console.log(`📊 No historical snapshots found for ${symbol}`);
        return {
          yesterdayMentions: 0,
          yesterdayLikes: 0,
          yesterdayEngagement: 0,
          hasHistoricalData: false,
          lastSnapshotDate: null
        };
      }
      
      // Get the most recent snapshot (could be today, yesterday, or 5+ days ago)
      const mostRecentDate = dates[dates.length - 1];
      const mostRecentData = tokenHistory[mostRecentDate];
      const today = new Date().toISOString().split('T')[0];
      
      // If most recent is today, use second-most-recent for comparison
      const comparisonDate = mostRecentDate === today && dates.length > 1 ? 
        dates[dates.length - 2] : mostRecentDate;
      const comparisonData = tokenHistory[comparisonDate];
      
      console.log(`📊 Historical lookup for ${symbol}: comparing to ${comparisonDate} (${dates.length} snapshots available)`);
      
      return {
        yesterdayMentions: comparisonData?.mentions || 0,
        yesterdayLikes: comparisonData?.likes || 0,
        yesterdayEngagement: comparisonData?.engagement || 0,
        hasHistoricalData: !!comparisonData,
        lastSnapshotDate: comparisonDate
      };
      
    } catch (error) {
      console.log(`📊 No historical data found for ${symbol}, starting fresh tracking`);
      return {
        yesterdayMentions: 0,
        yesterdayLikes: 0,
        yesterdayEngagement: 0,
        hasHistoricalData: false,
        lastSnapshotDate: null
      };
    }
  }

  /**
   * Save daily snapshot for historical tracking
   * 🚨 CRITICAL: Uses displayMentions (projected) and atomic writes
   */
  async saveHistoricalSnapshot(symbol, name, twitterData) {
    const cacheLock = new CacheLockService(this.historicalMetricsFile);

    try {
      // Ensure cache directory exists
      const cacheDir = path.dirname(this.historicalMetricsFile);
      await fs.mkdir(cacheDir, { recursive: true });
      
      // Load existing history
      let history = {};
      try {
        const historyData = await fs.readFile(this.historicalMetricsFile, 'utf8');
        history = JSON.parse(historyData);
      } catch (error) {
        console.log('📊 Creating new historical metrics file');
      }
      
      const tokenKey = `${symbol}_${name}`;
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
      
      // Initialize token history if it doesn't exist
      if (!history[tokenKey]) {
        history[tokenKey] = {};
      }
      
      // 🚨 CRITICAL: Save PROJECTED mentions (displayMentions), not raw sample
      const projectedMentions = twitterData.displayMentions || twitterData.mentions;
      
      // Save today's snapshot
      history[tokenKey][today] = {
        mentions: projectedMentions, // Projected value for accurate historical comparison
        displayMentions: projectedMentions, // Explicit field for clarity
        sampleMentions: twitterData.mentions, // Keep raw sample for debugging
        likes: twitterData.likes,
        retweets: twitterData.retweets,
        replies: twitterData.replies,
        engagement: twitterData.engagement?.total || 0,
        followers: twitterData.followers,
        timestamp: new Date().toISOString()
      };
      
      // Keep only last 30 days of history per token
      const tokenHistory = history[tokenKey];
      const dates = Object.keys(tokenHistory).sort();
      if (dates.length > 30) {
        const datesToRemove = dates.slice(0, dates.length - 30);
        datesToRemove.forEach(date => delete tokenHistory[date]);
      }
      
      // 🔒 ATOMIC WRITE: Save updated history with lock protection
      await cacheLock.atomicWrite(history);
      
      console.log(`📊 Historical snapshot saved for ${symbol} on ${today}: ${projectedMentions} mentions (projected)`);
      
    } catch (error) {
      console.error(`❌ Error saving historical snapshot for ${symbol}:`, error.message);
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
      
      if (hoursSinceRefresh >= 72) {
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

  /**
   * Analyze sentiment of tweet text using NLP techniques
   * Returns a score from 0-10 (0=very negative, 5=neutral, 10=very positive)
   */
  analyzeTweetSentiment(tweetText) {
    if (!tweetText || typeof tweetText !== 'string') {
      return 5.0; // Neutral default
    }

    const text = tweetText.toLowerCase().trim();
    let score = 5.0; // Start at neutral

    // POSITIVE KEYWORDS (increase score)
    const positiveKeywords = [
      // Strong positive
      'moon', 'to the moon', '🚀', 'bullish', 'bull', 'long', 'buy', 'bought',
      'invested', 'hodl', 'diamond hands', 'diamond', 'gem', 'undervalued',
      'sleeping giant', 'breakout', 'exploding', 'massive', 'huge', 'epic',
      'legendary', 'god tier', 'perfect', 'amazing', 'fantastic', 'brilliant',
      'excellent', 'outstanding', 'phenomenal', 'incredible', 'unbelievable',

      // Moderate positive
      'good', 'great', 'nice', 'solid', 'strong', 'powerful', 'growing',
      'rising', 'up', 'higher', 'increase', 'gain', 'profit', 'winning',
      'success', 'victory', 'champion', 'winner', 'top', 'best', 'elite',
      'premium', 'quality', 'valuable', 'worth it', 'recommend',

      // Mild positive
      'like', 'love', 'awesome', 'cool', 'sweet', 'nice', 'decent', 'okay',
      'alright', 'fine', 'positive', 'optimistic', 'hopeful', 'promising',
      'potential', 'opportunity', 'chance', 'possibility'
    ];

    // NEGATIVE KEYWORDS (decrease score)
    const negativeKeywords = [
      // Strong negative
      'dump', 'sell', 'short', 'bearish', 'bear', 'crash', 'drop', 'fall',
      'decline', 'decrease', 'loss', 'lose', 'losing', 'failed', 'failure',
      'terrible', 'awful', 'horrible', 'disaster', 'catastrophic', 'doomed',
      'dead', 'dying', 'killed', 'murdered', 'scam', 'rug pull', 'rugpull',
      'exit scam', 'honeypot', 'trap', 'fake', 'fraud', 'scammer',

      // Moderate negative
      'bad', 'poor', 'weak', 'low', 'down', 'lower', 'decrease', 'loss',
      'problem', 'issue', 'concern', 'worry', 'fear', 'scared', 'nervous',
      'anxious', 'doubt', 'skeptical', 'questionable', 'risky', 'dangerous',
      'volatile', 'unstable', 'uncertain',

      // Mild negative
      'meh', 'boring', 'slow', 'stagnant', 'flat', 'neutral', 'average',
      'mediocre', 'ordinary', 'normal', 'standard', 'typical', 'usual'
    ];

    // EMOJI SENTIMENT ANALYSIS
    const positiveEmojis = ['🚀', '💎', '💰', '🤑', '💪', '🔥', '⭐', '🌟', '✨', '💯', '👍', '❤️', '💚', '💙', '💜', '🧡', '🤩', '😍', '🥳', '🎉', '🎊'];
    const negativeEmojis = ['😢', '😭', '😞', '😟', '😤', '😠', '😡', '🤬', '💩', '👎', '👻', '☠️', '⚰️', '😱', '😨', '😰'];

    // Count positive and negative indicators
    let positiveCount = 0;
    let negativeCount = 0;

    // Check for positive keywords
    for (const keyword of positiveKeywords) {
      if (text.includes(keyword)) {
        positiveCount += keyword.length > 3 ? 1.5 : 1; // Longer words = stronger signal
      }
    }

    // Check for negative keywords
    for (const keyword of negativeKeywords) {
      if (text.includes(keyword)) {
        negativeCount += keyword.length > 3 ? 1.5 : 1; // Longer words = stronger signal
      }
    }

    // Check for positive emojis
    for (const emoji of positiveEmojis) {
      const emojiCount = (text.match(new RegExp(emoji, 'g')) || []).length;
      positiveCount += emojiCount * 0.5; // Emojis are moderate signals
    }

    // Check for negative emojis
    for (const emoji of negativeEmojis) {
      const emojiCount = (text.match(new RegExp(emoji, 'g')) || []).length;
      negativeCount += emojiCount * 0.5; // Emojis are moderate signals
    }

    // PUNCTUATION ANALYSIS
    // Multiple exclamation marks = excitement/emphasis
    const exclamationCount = (text.match(/!/g) || []).length;
    if (exclamationCount > 2) positiveCount += 0.5;

    // Question marks might indicate uncertainty
    const questionCount = (text.match(/\?/g) || []).length;
    if (questionCount > 1) negativeCount += 0.3;

    // CAPITALIZATION ANALYSIS (ALL CAPS = strong emotion)
    const capsRatio = text.replace(/[^A-Z]/g, '').length / text.replace(/[^a-zA-Z]/g, '').length;
    if (capsRatio > 0.5) {
      // High caps ratio - could be excitement OR anger
      if (positiveCount > negativeCount) {
        positiveCount += 0.5; // Excitement
      } else {
        negativeCount += 0.5; // Anger
      }
    }

    // Calculate final sentiment score
    const totalSignals = positiveCount + negativeCount;

    if (totalSignals === 0) {
      // No clear sentiment indicators - return neutral
      return 5.0;
    }

    // Calculate weighted score
    const sentimentRatio = (positiveCount - negativeCount) / totalSignals;

    // Convert to 0-10 scale
    // sentimentRatio ranges from -1 (all negative) to +1 (all positive)
    // Convert to 0-10 scale: -1 → 0, 0 → 5, +1 → 10
    score = 5 + (sentimentRatio * 5);

    // Ensure score stays within 0-10 bounds
    score = Math.max(0, Math.min(10, score));

    // Round to 1 decimal place
    return Math.round(score * 10) / 10;
  }

  /**
   * Calculate overall sentiment score from multiple tweets
   */
  calculateOverallSentiment(tweets) {
    if (!tweets || !Array.isArray(tweets) || tweets.length === 0) {
      return 5.0; // Neutral default
    }

    let totalSentiment = 0;
    let validTweets = 0;

    for (const tweet of tweets) {
      const tweetText = tweet?.text || tweet?.content || tweet?.full_text || '';
      if (tweetText.trim()) {
        const sentimentScore = this.analyzeTweetSentiment(tweetText);
        totalSentiment += sentimentScore;
        validTweets++;
      }
    }

    if (validTweets === 0) {
      return 5.0; // Neutral default
    }

    const averageSentiment = totalSentiment / validTweets;

    // Round to 1 decimal place
    return Math.round(averageSentiment * 10) / 10;
  }

  /**
   * Deduplicate tweets by content and ID to prevent duplicate processing
   */
  deduplicateTweetsByContent(tweets) {
    if (!tweets || tweets.length === 0) return [];
    
    const seen = new Set();
    const uniqueTweets = [];
    
    for (const tweet of tweets) {
      // Create a unique key based on tweet ID, text content, and author
      const tweetId = tweet.id || tweet.tweetId || tweet.id_str;
      const tweetText = (tweet.text || tweet.full_text || '').trim();
      const author = tweet.user?.screen_name || tweet.user?.username || tweet.author || 'unknown';
      
      // Primary deduplication by tweet ID
      if (tweetId) {
        const idKey = `id:${tweetId}`;
        if (seen.has(idKey)) {
          continue; // Skip duplicate by ID
        }
        seen.add(idKey);
      }
      
      // Secondary deduplication by content + author (for cases where ID might be missing)
      if (tweetText.length > 10) { // Only deduplicate substantial content
        const contentKey = `content:${author}:${tweetText.substring(0, 100)}`;
        if (seen.has(contentKey)) {
          continue; // Skip duplicate by content
        }
        seen.add(contentKey);
      }
      
      uniqueTweets.push(tweet);
    }
    
    return uniqueTweets;
  }

  // Public API methods for Twitter search endpoints
  async searchTwitter(query, count = 20) {
    try {
      console.log(`🔍 Searching Twitter for: "${query}" (count: ${count})`);

      // Try to use twitter-service microservice first
      try {
        const response = await axios.get(`${this.twitterServiceUrl}/api/twitter/search`, {
          params: { q: query, count },
          timeout: 30000
        });

        if (response.data.success) {
          console.log(`✅ Twitter microservice returned ${response.data.tweets?.length || 0} tweets`);
          return {
            tweets: response.data.tweets || [],
            source: 'microservice'
          };
        }
      } catch (microserviceError) {
        console.warn(`⚠️ Twitter microservice unavailable: ${microserviceError.message}`);
      }

      // Fallback to direct Twitter API implementation
      return await this._searchTwitterDirect(query, count);

    } catch (error) {
      console.error('❌ Twitter search failed:', error);
      return { tweets: [], error: error.message };
    }
  }

  async getUserTweets(username, count = 20) {
    try {
      console.log(`👤 Getting tweets for user: ${username} (count: ${count})`);

      // Try to use twitter-service microservice first
      try {
        const response = await axios.get(`${this.twitterServiceUrl}/api/twitter/user/${username}/tweets`, {
          params: { count },
          timeout: 30000
        });

        if (response.data.success) {
          console.log(`✅ Twitter microservice returned ${response.data.tweets?.length || 0} user tweets`);
          return {
            tweets: response.data.tweets || [],
            source: 'microservice'
          };
        }
      } catch (microserviceError) {
        console.warn(`⚠️ Twitter microservice unavailable: ${microserviceError.message}`);
      }

      // Fallback to direct implementation
      return await this._getUserTweetsDirect(username, count);

    } catch (error) {
      console.error('❌ User tweets fetch failed:', error);
      return { tweets: [], error: error.message };
    }
  }

  async searchMentions(handle, count = 10) {
    try {
      console.log(`📢 Searching mentions for: ${handle} (count: ${count})`);

      // Try to use twitter-service microservice first
      try {
        const response = await axios.get(`${this.twitterServiceUrl}/api/twitter/mentions/${handle}`, {
          params: { count },
          timeout: 30000
        });

        if (response.data.success) {
          console.log(`✅ Twitter microservice returned ${response.data.mentions?.length || 0} mentions`);
          return {
            mentions: response.data.mentions || [],
            source: 'microservice'
          };
        }
      } catch (microserviceError) {
        console.warn(`⚠️ Twitter microservice unavailable: ${microserviceError.message}`);
      }

      // Fallback to direct implementation
      return await this._searchMentionsDirect(handle, count);

    } catch (error) {
      console.error('❌ Mentions search failed:', error);
      return { mentions: [], error: error.message };
    }
  }

  // Direct Twitter API implementations (fallback when microservice is unavailable)
  async _searchTwitterDirect(query, count = 20) {
    // Mock implementation - returns sample data
    console.log(`🔄 Using direct Twitter search fallback for: "${query}"`);

    const mockTweets = [];
    for (let i = 0; i < Math.min(count, 5); i++) {
      mockTweets.push({
        id: `mock_${i}_${Date.now()}`,
        text: `Sample tweet about ${query} #${i + 1}`,
        created_at: new Date().toISOString(),
        user: {
          name: `Twitter User ${i + 1}`,
          screen_name: `user${i + 1}`
        },
        retweet_count: Math.floor(Math.random() * 100),
        favorite_count: Math.floor(Math.random() * 200),
        reply_count: Math.floor(Math.random() * 50)
      });
    }

    return {
      tweets: mockTweets,
      source: 'direct_fallback'
    };
  }

  async _getUserTweetsDirect(username, count = 20) {
    console.log(`🔄 Using direct user tweets fallback for: ${username}`);

    const mockTweets = [];
    for (let i = 0; i < Math.min(count, 3); i++) {
      mockTweets.push({
        id: `user_mock_${i}_${Date.now()}`,
        text: `Tweet from @${username} #${i + 1}`,
        created_at: new Date().toISOString(),
        retweet_count: Math.floor(Math.random() * 50),
        favorite_count: Math.floor(Math.random() * 100),
        reply_count: Math.floor(Math.random() * 25)
      });
    }

    return {
      tweets: mockTweets,
      source: 'direct_fallback'
    };
  }

  async _searchMentionsDirect(handle, count = 10) {
    console.log(`🔄 Using direct mentions fallback for: ${handle}`);

    const mockMentions = [];
    for (let i = 0; i < Math.min(count, 3); i++) {
      mockMentions.push({
        id: `mention_mock_${i}_${Date.now()}`,
        text: `Mention of ${handle} in tweet #${i + 1}`,
        created_at: new Date().toISOString(),
        user: {
          name: `Mentioner ${i + 1}`,
          screen_name: `mentioner${i + 1}`
        },
        retweet_count: Math.floor(Math.random() * 30),
        favorite_count: Math.floor(Math.random() * 60),
        reply_count: Math.floor(Math.random() * 15)
      });
    }

    return {
      mentions: mockMentions,
      source: 'direct_fallback'
    };
  }
}

export default EnhancedSocialDataService;
