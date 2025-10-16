/**
 * Simple KOL Service - Clean Implementation
 * 
 * Features:
 * - Add KOLs
 * - Delete KOLs (hard delete)
 * - Fetch tweets via TwitterAPI.io
 * - Basic tweet analysis
 */

import fs from 'fs/promises';
import * as fsSync from 'fs';
import path from 'path';
import axios from 'axios';
import OpenAIService from '../openaiService.js';
import PerplexitySonarService from './PerplexitySonarService.js';
import TweetAPIPostingService from './TweetAPIPostingService.js';

class KOLService {
  constructor() {
    this.kols = new Map();
    this.posts = [];
    
    // Use same persistent disk pattern as main app
    const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
    this.dataDir = path.join(dataDir, 'kol-cache');
    this.kolsFile = path.join(this.dataDir, 'kols.json');
    this.postsFile = path.join(this.dataDir, 'posts.json');
    this.logosCacheFile = path.join(this.dataDir, 'logos-cache.json');
    this.historicalPricesCacheFile = path.join(this.dataDir, 'historical-prices-cache.json');
    
    // Ensure directory exists synchronously
    try {
      fsSync.mkdirSync(this.dataDir, { recursive: true });
      console.log(`📁 [KOL SERVICE] Data directory: ${this.dataDir}`);
    } catch (error) {
      console.error('❌ [KOL SERVICE] Failed to create data directory:', error.message);
    }
    
    this.openaiService = new OpenAIService();
    this.perplexityService = new PerplexitySonarService();
    this.tweetPostingService = new TweetAPIPostingService();
    
    // Logo cache (symbol -> logo URL)
    this.logosCache = new Map();
    this.loadLogosCache();
    
    // Historical prices cache (symbol_timestamp -> price)
    this.historicalPricesCache = new Map();
    this.loadHistoricalPricesCache();
    
    // Coin data cache (symbol -> coin data from main backend)
    this.coinDataCache = {};
    this.loadCoinDataCache();
    
    // Rate limiting for API calls
    this.lastPerplexityCall = 0;
    this.PERPLEXITY_DELAY = 3000; // 3 seconds between Perplexity calls
    
    // Start backfill job
    this.startBackfillJob();
    this.startLeadLagAnalysis();
    this.startAutomaticTweetFetching(); // NEW: Start automatic tweet fetching
  }

  async initialize() {
    try {
      // Ensure data directory exists
      await fs.mkdir(this.dataDir, { recursive: true });
      
      // Load existing data
      await this.loadData();
      
      console.log(`✅ [KOL SERVICE] Initialized with ${this.kols.size} KOLs and ${this.posts.length} posts from ${this.dataDir}`);
      console.log(`📊 [KOL SERVICE] KOL handles: ${Array.from(this.kols.keys()).join(', ') || 'none'}`);
    } catch (error) {
      console.error('❌ [KOL SERVICE] Initialization failed:', error.message);
      throw error;
    }
  }

  async loadData() {
    try {
      // Load KOLs
      try {
        const kolsData = await fs.readFile(this.kolsFile, 'utf8');
        const kolsArray = JSON.parse(kolsData);
        this.kols.clear();
        for (const kol of kolsArray) {
          this.kols.set(kol.handle.toLowerCase(), kol);
        }
      } catch (error) {
        // File doesn't exist, start with empty
        console.log('📝 [KOL SERVICE] No existing KOLs file, starting fresh');
      }

      // Load posts
      try {
        const postsData = await fs.readFile(this.postsFile, 'utf8');
        this.posts = JSON.parse(postsData);
      } catch (error) {
        // File doesn't exist, start with empty
        console.log('📝 [KOL SERVICE] No existing posts file, starting fresh');
      }
    } catch (error) {
      console.error('❌ [KOL SERVICE] Error loading data:', error.message);
    }
  }

  // Load logos cache from disk (synchronous for constructor)
  loadLogosCache() {
    try {
      if (fsSync.existsSync(this.logosCacheFile)) {
        const data = fsSync.readFileSync(this.logosCacheFile, 'utf8');
        const logosObj = JSON.parse(data);
        this.logosCache = new Map(Object.entries(logosObj));
        console.log(`📦 [KOL SERVICE] Loaded ${this.logosCache.size} cached logos`);
      }
    } catch (error) {
      console.warn('⚠️ [KOL SERVICE] Could not load logos cache:', error.message);
    }
  }

  // Save logos cache to disk
  async saveLogosCache() {
    try {
      const logosObj = Object.fromEntries(this.logosCache);
      const tempPath = this.logosCacheFile + '.tmp';
      await fs.writeFile(tempPath, JSON.stringify(logosObj, null, 2), 'utf8');
      await fs.rename(tempPath, this.logosCacheFile);
      console.log(`💾 [KOL SERVICE] Saved ${this.logosCache.size} logos to cache`);
    } catch (error) {
      console.error('❌ [KOL SERVICE] Error saving logos cache:', error.message);
    }
  }

  // Load historical prices cache from disk (synchronous for constructor)
  loadHistoricalPricesCache() {
    try {
      if (fsSync.existsSync(this.historicalPricesCacheFile)) {
        const data = fsSync.readFileSync(this.historicalPricesCacheFile, 'utf8');
        const pricesObj = JSON.parse(data);
        this.historicalPricesCache = new Map(Object.entries(pricesObj));
        console.log(`📦 [KOL SERVICE] Loaded ${this.historicalPricesCache.size} cached historical prices`);
      }
    } catch (error) {
      console.warn('⚠️ [KOL SERVICE] Could not load historical prices cache:', error.message);
    }
  }

  // Save historical prices cache to disk (atomic write)
  async saveHistoricalPricesCache() {
    try {
      const pricesObj = Object.fromEntries(this.historicalPricesCache);
      const tempPath = this.historicalPricesCacheFile + '.tmp';
      await fs.writeFile(tempPath, JSON.stringify(pricesObj, null, 2), 'utf8');
      await fs.rename(tempPath, this.historicalPricesCacheFile);
      console.log(`💾 [KOL SERVICE] Saved ${this.historicalPricesCache.size} historical prices to cache`);
    } catch (error) {
      console.error('❌ [KOL SERVICE] Error saving historical prices cache:', error.message);
    }
  }

  // Save coin data cache to disk (atomic write)
  async saveCoinDataCache() {
    try {
      const coinDataCacheFile = path.join(this.dataDir, 'coin-data-cache.json');
      const tempPath = coinDataCacheFile + '.tmp';
      await fs.writeFile(tempPath, JSON.stringify(this.coinDataCache, null, 2), 'utf8');
      await fs.rename(tempPath, coinDataCacheFile);
      console.log(`💾 [KOL SERVICE] Saved ${Object.keys(this.coinDataCache).length} coin data entries to cache`);
    } catch (error) {
      console.error('❌ [KOL SERVICE] Error saving coin data cache:', error.message);
    }
  }

  // Load coin data cache from disk
  loadCoinDataCache() {
    try {
      const coinDataCacheFile = path.join(this.dataDir, 'coin-data-cache.json');
      if (fsSync.existsSync(coinDataCacheFile)) {
        const data = fsSync.readFileSync(coinDataCacheFile, 'utf8');
        this.coinDataCache = JSON.parse(data);
        console.log(`📦 [KOL SERVICE] Loaded ${Object.keys(this.coinDataCache).length} cached coin data entries`);
      }
    } catch (error) {
      console.warn('⚠️ [KOL SERVICE] Could not load coin data cache:', error.message);
    }
  }

  async saveData() {
    try {
      // 🛡️ ATOMIC WRITE: Save KOLs with temp file pattern
      const kolsArray = Array.from(this.kols.values());
      const kolsTempPath = this.kolsFile + '.tmp';
      const kolsData = JSON.stringify(kolsArray, null, 2);
      
      await fs.writeFile(kolsTempPath, kolsData, 'utf8');
      await fs.rename(kolsTempPath, this.kolsFile);

      // 🛡️ ATOMIC WRITE: Save posts with temp file pattern
      const postsTempPath = this.postsFile + '.tmp';
      const postsData = JSON.stringify(this.posts, null, 2);
      
      await fs.writeFile(postsTempPath, postsData, 'utf8');
      await fs.rename(postsTempPath, this.postsFile);

      console.log(`💾 [KOL SERVICE] Saved ${this.kols.size} KOLs and ${this.posts.length} posts to ${this.dataDir}`);
    } catch (error) {
      console.error('❌ [KOL SERVICE] Error saving data:', error.message);
      throw error;
    }
  }

  // Add a new KOL
  async addKOL(handle) {
    const normalizedHandle = handle.replace('@', '').toLowerCase();
    
    console.log(`🔍 [KOL SERVICE] Checking if @${normalizedHandle} exists... Current KOLs: ${Array.from(this.kols.keys()).join(', ')}`);
    
    if (this.kols.has(normalizedHandle)) {
      console.log(`❌ [KOL SERVICE] KOL @${normalizedHandle} already exists!`);
      throw new Error('KOL already exists');
    }
    
    console.log(`✅ [KOL SERVICE] KOL @${normalizedHandle} is new, proceeding with creation...`);

    const newKOL = {
      id: this.generateId(),
      handle: normalizedHandle,
      created_at: new Date().toISOString(),
      last_fetched: null,
      total_posts: 0
    };

    this.kols.set(normalizedHandle, newKOL);
    await this.saveData();

    console.log(`✅ [KOL SERVICE] Added KOL: @${normalizedHandle}`);

    // Immediately fetch tweets
    await this.fetchKOLTweets(normalizedHandle);

    return newKOL;
  }

  // Delete a KOL (hard delete)
  async deleteKOL(handle) {
    const normalizedHandle = handle.replace('@', '').toLowerCase();
    
    if (!this.kols.has(normalizedHandle)) {
      throw new Error('KOL not found');
    }

    // Remove KOL
    this.kols.delete(normalizedHandle);
    
    // Remove all posts from this KOL
    this.posts = this.posts.filter(post => post.kol_handle.toLowerCase() !== normalizedHandle);
    
    await this.saveData();

    console.log(`🗑️ [KOL SERVICE] Deleted KOL: @${normalizedHandle}`);
    return true;
  }

  // Get all KOLs
  getKOLs() {
    return Array.from(this.kols.values());
  }

  // Get all posts
  getPosts() {
    return this.posts;
  }

  // Fetch tweets for a KOL
  async fetchKOLTweets(handle) {
    try {
      const twitterapiioKey = process.env.TWITTERAPIIO_API_KEY;
      
      if (!twitterapiioKey) {
        console.error('❌ [KOL SERVICE] TWITTERAPIIO_API_KEY not set');
        return [];
      }

      const url = `https://api.twitterapi.io/twitter/user/last_tweets`;
      const params = {
        userName: handle.replace('@', ''),
        count: 20
      };

      const queryString = new URLSearchParams(params).toString();
      const fullUrl = `${url}?${queryString}`;

      console.log(`🔍 [KOL SERVICE] Fetching tweets for @${handle}...`);

      const response = await axios.get(fullUrl, {
        headers: {
          'X-API-Key': twitterapiioKey
        },
        timeout: 30000
      });

      if (response.status !== 200) {
        console.error(`❌ [KOL SERVICE] TwitterAPI.io error for @${handle}: ${response.status}`);
        return [];
      }

      const data = response.data;
      const tweets = data.data?.tweets || data.tweets || [];

      // Extract user info from first tweet (for influence calculation and PFP)
      let userInfo = null;
      let profilePicture = null;
      if (tweets.length > 0 && tweets[0].author) {
        userInfo = tweets[0].author;
        profilePicture = userInfo.profilePicture || userInfo.profile_image_url || null;
      }

      // Process tweets with AI analysis
      let newPosts = 0;
      let totalEngagement = 0;
      let cryptoTweetCount = 0;

      for (const tweet of tweets) {
        const postId = `post_${tweet.id}`;
        
        // Check if we already have this post
        if (this.posts.some(post => post.id === postId)) {
          continue;
        }

        // Analyze tweet with AI
        const analysis = await this.analyzeTweet(tweet.text || '');

        const post = {
          id: postId,
          kol_handle: handle,
          tweet_id: tweet.id,
          text: tweet.text || '',
          created_at: tweet.createdAt || new Date().toISOString(),
          likes: tweet.likeCount || 0,
          retweets: tweet.retweetCount || 0,
          replies: tweet.replyCount || 0,
          quotes: tweet.quoteCount || 0,
          views: tweet.viewCount || 0,
          url: tweet.url,
          // AI analysis
          coins: analysis.coins,
          sentiment: analysis.sentiment,
          narratives: analysis.narratives,
          processed_at: new Date().toISOString()
        };

        this.posts.push(post);
        newPosts++;

        // Calculate engagement
        totalEngagement += (post.likes + post.retweets * 2 + post.replies + post.quotes);
        
        // Check if crypto-related
        if (analysis.coins.length > 0 || analysis.narratives.length > 0) {
          cryptoTweetCount++;
        }

        // Log analysis
        if (analysis.coins.length > 0) {
          console.log(`🤖 [KOL SERVICE] Analyzed: ${analysis.coins.join(', ')} | Sentiment: ${analysis.sentiment > 0 ? '📈' : analysis.sentiment < 0 ? '📉' : '➡️'}`);
        }
      }

      // Update KOL stats & calculate influence
      const kol = this.kols.get(handle.toLowerCase());
      if (kol) {
        kol.last_fetched = new Date().toISOString();
        kol.total_posts = this.posts.filter(p => p.kol_handle.toLowerCase() === handle.toLowerCase()).length;
        
        // Store profile picture
        if (profilePicture) {
          kol.profile_picture = profilePicture;
          console.log(`🖼️ [KOL SERVICE] Saved profile picture for @${handle}: ${profilePicture.substring(0, 50)}...`);
        } else {
          console.warn(`⚠️ [KOL SERVICE] No profile picture found for @${handle}`);
        }
        
        // Store follower count
        if (userInfo && userInfo.followers) {
          kol.followers = userInfo.followers;
          console.log(`👥 [KOL SERVICE] Followers for @${handle}: ${userInfo.followers.toLocaleString()}`);
        }
        
        // Calculate influence score
        const influence = this.calculateInfluenceScore(kol, userInfo, totalEngagement, cryptoTweetCount, tweets.length);
        
        // Smooth transition (70% old + 30% new) if previous score exists
        if (kol.influence_score !== undefined) {
          kol.influence_score = Math.round(kol.influence_score * 0.7 + influence.total * 0.3);
        } else {
          kol.influence_score = influence.total;
        }
        
        kol.influence_breakdown = influence.breakdown;
        
        console.log(`📊 [KOL SERVICE] Influence score for @${handle}: ${kol.influence_score}/100`);
        
        this.kols.set(handle.toLowerCase(), kol);
      }

      await this.saveData();

      console.log(`✅ [KOL SERVICE] Fetched ${tweets.length} tweets for @${handle}, ${newPosts} new posts`);
      return tweets;

    } catch (error) {
      console.error(`❌ [KOL SERVICE] Error fetching tweets for @${handle}:`, error.message);
      return [];
    }
  }

  // Calculate automatic influence score
  calculateInfluenceScore(kol, userInfo, totalEngagement, cryptoTweetCount, tweetCount) {
    const breakdown = {
      followers: 0,
      engagement: 0,
      activity: 0,
      cryptoFocus: 0
    };

    // 1. Follower Count (40% weight)
    if (userInfo && userInfo.followers) {
      const followers = userInfo.followers;
      if (followers >= 1000000) breakdown.followers = 100;
      else if (followers >= 500000) breakdown.followers = 90;
      else if (followers >= 100000) breakdown.followers = 80;
      else if (followers >= 50000) breakdown.followers = 70;
      else if (followers >= 10000) breakdown.followers = 60;
      else if (followers >= 5000) breakdown.followers = 50;
      else if (followers >= 1000) breakdown.followers = 30;
      else breakdown.followers = 10;
    } else {
      breakdown.followers = 50; // Default if not available
    }

    // 2. Engagement Rate (30% weight)
    if (tweetCount > 0) {
      const avgEngagement = totalEngagement / tweetCount;
      if (avgEngagement >= 1000) breakdown.engagement = 100;
      else if (avgEngagement >= 500) breakdown.engagement = 85;
      else if (avgEngagement >= 200) breakdown.engagement = 70;
      else if (avgEngagement >= 100) breakdown.engagement = 60;
      else if (avgEngagement >= 50) breakdown.engagement = 50;
      else if (avgEngagement >= 20) breakdown.engagement = 40;
      else breakdown.engagement = 30;
    }

    // 3. Activity Level (15% weight)
    if (kol.total_posts >= 100) breakdown.activity = 100;
    else if (kol.total_posts >= 50) breakdown.activity = 80;
    else if (kol.total_posts >= 20) breakdown.activity = 60;
    else if (kol.total_posts >= 10) breakdown.activity = 40;
    else breakdown.activity = 20;

    // 4. Crypto Focus (15% weight)
    if (tweetCount > 0) {
      const cryptoPercentage = (cryptoTweetCount / tweetCount) * 100;
      if (cryptoPercentage >= 80) breakdown.cryptoFocus = 100;
      else if (cryptoPercentage >= 60) breakdown.cryptoFocus = 85;
      else if (cryptoPercentage >= 40) breakdown.cryptoFocus = 70;
      else if (cryptoPercentage >= 20) breakdown.cryptoFocus = 50;
      else breakdown.cryptoFocus = 30;
    }

    // Calculate weighted total
    const total = Math.round(
      breakdown.followers * 0.40 +
      breakdown.engagement * 0.30 +
      breakdown.activity * 0.15 +
      breakdown.cryptoFocus * 0.15
    );

    return {
      total: Math.max(1, Math.min(100, total)),
      breakdown
    };
  }

  // Analyze tweet with AI
  async analyzeTweet(text) {
    try {
      const prompt = `Analyze this crypto tweet and extract:
1. Coin symbols (BTC, ETH, SOL, etc.) - ALWAYS USE UPPERCASE
2. Sentiment: bullish (1), neutral (0), or bearish (-1)
3. Key narratives/themes

Tweet: "${text}"

Respond with ONLY valid JSON:
{
  "coins": ["BTC", "ETH"],
  "sentiment": 1,
  "narratives": ["DeFi", "Layer 2"]
}

IMPORTANT: All coin symbols MUST be in UPPERCASE (BTC not btc, USELESS not useless).
If no coins found, return empty arrays. Sentiment must be -1, 0, or 1.`;

      const response = await this.openaiService.generateCompletion(prompt, {
        maxTokens: 150,
        temperature: 0.1,
        model: 'gpt-4o'
      });

      // Parse JSON response
      const cleanResponse = this.extractJSON(response);
      const analysis = JSON.parse(cleanResponse);

      // Normalize all coin symbols to UPPERCASE (in case AI didn't follow instructions)
      const normalizedCoins = (analysis.coins || []).map(coin => coin.toUpperCase());

      return {
        coins: normalizedCoins,
        sentiment: Math.max(-1, Math.min(1, analysis.sentiment || 0)),
        narratives: analysis.narratives || []
      };

    } catch (error) {
      console.error('❌ [KOL SERVICE] AI analysis error:', error.message);
      return {
        coins: [],
        sentiment: 0,
        narratives: []
      };
    }
  }

  // Extract JSON from AI response
  extractJSON(response) {
    try {
      let clean = response.trim();
      
      // Remove markdown code blocks
      if (clean.startsWith('```json')) {
        clean = clean.substring(7);
      } else if (clean.startsWith('```')) {
        clean = clean.substring(3);
      }
      
      if (clean.endsWith('```')) {
        clean = clean.substring(0, clean.length - 3);
      }
      
      clean = clean.trim();
      
      // Validate JSON
      JSON.parse(clean);
      return clean;
      
    } catch (error) {
      // Try to find JSON in response
      const match = response.match(/\{[\s\S]*\}/);
      if (match) {
        return match[0];
      }
      // Return default
      return '{"coins": [], "sentiment": 0, "narratives": []}';
    }
  }

  // Fetch logo from CoinGecko (cached, only called once per coin)
  async fetchLogoFromCoinGecko(symbol) {
    // Check cache first
    if (this.logosCache.has(symbol.toUpperCase())) {
      const cachedLogo = this.logosCache.get(symbol.toUpperCase());
      console.log(`📦 [KOL SERVICE] Using cached logo for ${symbol}`);
      return cachedLogo;
    }

    try {
      // Search for coin on CoinGecko
      console.log(`🔍 [KOL SERVICE] Fetching logo from CoinGecko for ${symbol}...`);
      
      const searchResponse = await axios.get(`https://api.coingecko.com/api/v3/search?query=${symbol}`, {
        timeout: 5000
      });

      const coin = searchResponse.data?.coins?.[0];
      if (coin && coin.large) {
        const logo = coin.large;
        // Cache it
        this.logosCache.set(symbol.toUpperCase(), logo);
        await this.saveLogosCache();
        console.log(`✅ [KOL SERVICE] Cached logo for ${symbol} from CoinGecko`);
        return logo;
      }

      // Cache null result to avoid repeated failed calls
      this.logosCache.set(symbol.toUpperCase(), null);
      await this.saveLogosCache();
      return null;

    } catch (error) {
      console.warn(`⚠️ [KOL SERVICE] Could not fetch logo from CoinGecko for ${symbol}:`, error.message);
      // Cache null to avoid repeated calls
      this.logosCache.set(symbol.toUpperCase(), null);
      await this.saveLogosCache();
      return null;
    }
  }

  // Fetch coin data from DegenOracle backend
  async fetchCoinData(symbol, forceRefresh = false) {
    try {
      // Check cache first (unless force refresh)
      if (!forceRefresh && this.coinDataCache && this.coinDataCache[symbol]) {
        console.log(`💾 [KOL SERVICE] Using cached coin data for ${symbol}`);
        return this.coinDataCache[symbol];
      }
      
      // Use 127.0.0.1 to avoid IPv6 issues (::1)
      const port = process.env.PORT || 3001;
      const response = await axios.get(`http://127.0.0.1:${port}/api/tokens`, {
        timeout: 5000
      });
      
      if (response.data && Array.isArray(response.data)) {
        const coin = response.data.find(t => 
          t.symbol?.toUpperCase() === symbol.toUpperCase() ||
          t.name?.toUpperCase() === symbol.toUpperCase()
        );
        
        if (coin) {
          // Get logo from Jupiter token list if not in DegenOracle
          let logo = coin.image || coin.logoURI;
          
          if (!logo && coin.contractAddress) {
            // Skip Jupiter CDN - fotofolio.xyz is down (Error 522)
            console.log(`⚠️ [KOL SERVICE] Skipping Jupiter CDN for ${symbol} - fotofolio.xyz is down`);
          }
          
          // If still no logo, try CoinGecko (cached)
          if (!logo) {
            logo = await this.fetchLogoFromCoinGecko(symbol);
          }
          
          // Get the correct price field (same logic as MoralisAIChatService)
          const finalPrice = coin.price || coin.currentPrice || coin.usdPrice || 
                            coin.jupiterData?.price || coin.jupiterData?.usdPrice;
          
          console.log(`💰 [KOL SERVICE] Price fields for ${coin.symbol}:`, {
            price: coin.price,
            currentPrice: coin.currentPrice,
            usdPrice: coin.usdPrice,
            jupiterPrice: coin.jupiterData?.price,
            jupiterUsdPrice: coin.jupiterData?.usdPrice,
            finalPrice: finalPrice
          });
          
          const coinData = {
            symbol: coin.symbol,
            name: coin.name,
            image: logo,
            price: finalPrice,
            volume_24h: coin.volume24h,
            mcap: coin.marketCap,
            price_change_24h: coin.priceChange24h
          };
          
          // Cache the result
          if (!this.coinDataCache) {
            this.coinDataCache = {};
          }
          this.coinDataCache[symbol] = coinData;
          
          return coinData;
        }
      }
      
      // Coin not in DegenOracle, try CoinGecko for logo only
      console.warn(`⚠️ [KOL SERVICE] ${symbol} not in DegenOracle, trying CoinGecko for logo...`);
      const logo = await this.fetchLogoFromCoinGecko(symbol);
      
      if (logo) {
        const fallbackData = {
          symbol: symbol,
          name: symbol,
          image: logo,
          price: null,
          volume_24h: null,
          mcap: null,
          price_change_24h: null
        };
        
        // Cache the fallback result too
        if (!this.coinDataCache) {
          this.coinDataCache = {};
        }
        this.coinDataCache[symbol] = fallbackData;
        
        return fallbackData;
      }
      
      return null;
    } catch (error) {
      console.error(`❌ [KOL SERVICE] Error fetching coin data for ${symbol}:`, error.message);
      return null;
    }
  }

  // Fetch historical price using free OHLCV APIs (much cheaper than Perplexity)
        async fetchHistoricalPrice(symbol, timestamp) {
          try {
            const targetTime = new Date(timestamp);
            const symbolUpper = symbol.toUpperCase();
            
            // Create cache key: symbol_timestamp (rounded to hour for better cache hits)
            const cacheKey = `${symbolUpper}_${Math.floor(targetTime.getTime() / (1000 * 60 * 60))}`;
            
            // Check cache first
            if (this.historicalPricesCache.has(cacheKey)) {
              const cachedPrice = this.historicalPricesCache.get(cacheKey);
              console.log(`💾 [KOL SERVICE] Using cached price for $${symbol}: $${cachedPrice}`);
              return cachedPrice;
            }
            
            console.log(`⏳ [HISTORICAL-PRICE] Attempting to fetch historical price for ${symbol} at ${timestamp.toISOString()} (rounded to ${Math.floor(targetTime.getTime() / (1000 * 60 * 60))})`);
            let historicalPrice = null;
            
            console.log(`🔍 [KOL SERVICE] Fetching historical price for $${symbol} at ${targetTime.toISOString()}`);
            
            // 1. Try APEX API first (primary)
            try {
              console.log(`🔍 [KOL SERVICE] Trying APEX API for ${symbol} at ${targetTime.toISOString()}`);
              historicalPrice = await this.fetchApexExchangeHistoricalPrice(symbolUpper, targetTime);
              if (historicalPrice) {
                console.log(`✅ [KOL SERVICE] Found APEX API price for $${symbol}: $${historicalPrice}`);
                // Cache the result
                this.historicalPricesCache.set(cacheKey, historicalPrice);
                return historicalPrice;
              } else {
                console.log(`⚠️ [KOL SERVICE] APEX API returned null for ${symbol}`);
              }
            } catch (error) {
              console.log(`❌ [KOL SERVICE] APEX API failed for ${symbol}: ${error.message}`);
            }
            
            // 2. Try CoinAPI.io (fallback)
            if (!historicalPrice) {
              try {
                console.log(`🔍 [KOL SERVICE] Trying CoinAPI.io for ${symbol} at ${targetTime.toISOString()}`);
                historicalPrice = await this.fetchCoinAPIHistoricalPrice(symbolUpper, targetTime);
                if (historicalPrice) {
                  console.log(`✅ [KOL SERVICE] Found CoinAPI.io price for $${symbol}: $${historicalPrice}`);
                } else {
                  console.log(`⚠️ [KOL SERVICE] CoinAPI.io returned null for ${symbol}`);
                }
              } catch (error) {
                console.log(`❌ [KOL SERVICE] CoinAPI.io failed for ${symbol}: ${error.message}`);
              }
            }
            
            // 3. Try CoinDesk API (final fallback)
            if (!historicalPrice) {
              try {
                console.log(`🔍 [KOL SERVICE] Trying CoinDesk API for ${symbol} at ${targetTime.toISOString()}`);
                historicalPrice = await this.fetchCoinDeskHistoricalPrice(symbolUpper, targetTime);
                if (historicalPrice) {
                  console.log(`✅ [KOL SERVICE] Found CoinDesk API price for $${symbol}: $${historicalPrice}`);
                } else {
                  console.log(`⚠️ [KOL SERVICE] CoinDesk API returned null for ${symbol}`);
                }
              } catch (error) {
                console.log(`❌ [KOL SERVICE] CoinDesk API failed for ${symbol}: ${error.message}`);
              }
            }
            
            // Cache the result (even if null to avoid repeated failed API calls)
            this.historicalPricesCache.set(cacheKey, historicalPrice);
            
            // Save cache periodically (every 10 new entries to avoid excessive I/O)
            if (this.historicalPricesCache.size % 10 === 0) {
              await this.saveHistoricalPricesCache();
            }
            
            if (historicalPrice) {
              console.log(`💾 [KOL SERVICE] Cached price for $${symbol}: $${historicalPrice}`);
            } else {
              console.log(`❌ [KOL SERVICE] No historical price data available for ${symbol}`);
            }
            
            return historicalPrice;
      
          } catch (error) {
            console.error(`❌ [KOL SERVICE] Error fetching historical price for ${symbol}:`, error.message);
            return null;
          }
        }


  // Fetch from Apex Exchange API (NEW - High Priority)
  async fetchApexExchangeHistoricalPrice(symbol, targetTime) {
    try {
      // Apex Exchange format: SYMBOLUSDT
      const apexSymbol = `${symbol}USDT`;
      const targetTimestamp = targetTime.getTime();
      
      console.log(`🔍 [KOL SERVICE] Trying Apex Exchange for ${symbol} at ${targetTime.toISOString()}`);
      
      // Try different intervals to find the closest match
      const intervals = ['1', '5', '15', '60']; // 1m, 5m, 15m, 1h
      
      for (const interval of intervals) {
        try {
          const url = `https://omni.apex.exchange/api/v3/klines?symbol=${apexSymbol}&interval=${interval}`;
          const response = await fetch(url);
          
          if (!response.ok) {
            console.log(`⚠️ [KOL SERVICE] Apex Exchange interval ${interval} failed: ${response.status}`);
            continue;
          }
          
          const data = await response.json();
          
          if (data.data && data.data[apexSymbol] && data.data[apexSymbol].length > 0) {
            const klines = data.data[apexSymbol];
            
            // Find the closest kline to our target time
            let closestKline = null;
            let minTimeDiff = Infinity;
            
            for (const kline of klines) {
              const klineTime = kline.t; // timestamp in milliseconds
              const timeDiff = Math.abs(klineTime - targetTimestamp);
              
              if (timeDiff < minTimeDiff) {
                minTimeDiff = timeDiff;
                closestKline = kline;
              }
            }
            
            if (closestKline) {
              const price = parseFloat(closestKline.c); // close price
              const klineTime = new Date(closestKline.t);
              const timeDiffMinutes = Math.abs(klineTime - targetTime) / (1000 * 60);
              
              console.log(`✅ [KOL SERVICE] Found Apex Exchange price for ${symbol}: $${price} (diff: ${Math.round(timeDiffMinutes)}min)`);
              
              return price;
            }
          }
        } catch (error) {
          console.log(`❌ [KOL SERVICE] Apex Exchange interval ${interval} error for ${symbol}: ${error.message}`);
          continue;
        }
      }
      
      console.log(`⚠️ [KOL SERVICE] Apex Exchange failed for ${symbol}`);
      return null;
      
    } catch (error) {
      console.error(`❌ [KOL SERVICE] Apex Exchange error for ${symbol}:`, error.message);
      return null;
    }
  }

  // Fetch from CoinDesk API - try multiple markets
  async fetchCoinDeskHistoricalPrice(symbol, targetTime) {
    try {
      // CoinDesk format: SYMBOL-USDT
      const coindeskSymbol = `${symbol}-USDT`;
      const daysBack = Math.ceil((Date.now() - targetTime.getTime()) / (1000 * 60 * 60 * 24));
      
      // Try multiple markets in order of preference
      const markets = ['binance', 'ascendex', 'gateio', 'mexc', 'kraken', 'hyperliquid'];
      
      for (const market of markets) {
        try {
          const url = `https://data-api.coindesk.com/spot/v1/historical/days?market=${market}&instrument=${coindeskSymbol}&limit=${Math.min(daysBack + 5, 30)}&aggregate=1&fill=true&apply_mapping=true&response_format=JSON`;
          
          console.log(`🔍 [COINDESK INDIVIDUAL] Trying ${market} for ${coindeskSymbol} at ${targetTime.toISOString()}`);
          console.log(`🔍 [COINDESK INDIVIDUAL] URL: ${url}`);
          
          const response = await fetch(url);
          console.log(`🔍 [COINDESK INDIVIDUAL] ${market} response status: ${response.status}`);
          
          if (response.ok) {
            const data = await response.json();
            console.log(`🔍 [COINDESK INDIVIDUAL] ${market} response structure:`, Object.keys(data));
            
            if (data && data.Data && data.Data.length > 0) {
              console.log(`🔍 [COINDESK INDIVIDUAL] ${market} received ${data.Data.length} data points`);
              console.log(`🔍 [COINDESK INDIVIDUAL] ${market} sample data:`, data.Data[0]);
              
              // Find closest date to target time
              let closestData = data.Data[0];
              let minTimeDiff = Math.abs(new Date(data.Data[0].TIMESTAMP * 1000) - targetTime);
              
              for (const dayData of data.Data) {
                const dayTime = new Date(dayData.TIMESTAMP * 1000);
                const timeDiff = Math.abs(dayTime - targetTime);
                if (timeDiff < minTimeDiff) {
                  minTimeDiff = timeDiff;
                  closestData = dayData;
                }
              }
              
              // CoinDesk uses CLOSE field for price
              const price = closestData.CLOSE;
              if (price) {
                console.log(`✅ [COINDESK INDIVIDUAL] Found price for ${symbol} on ${market}: $${price}`);
                return parseFloat(price);
              } else {
                console.log(`⚠️ [COINDESK INDIVIDUAL] No CLOSE price found in ${market} data:`, closestData);
              }
            } else {
              console.log(`⚠️ [COINDESK INDIVIDUAL] ${market} returned no data for ${coindeskSymbol}`);
            }
          } else {
            const errorText = await response.text();
            console.log(`❌ [COINDESK INDIVIDUAL] ${market} API error ${response.status}: ${errorText.substring(0, 200)}...`);
          }
        } catch (marketError) {
          console.log(`❌ [COINDESK INDIVIDUAL] ${market} exception for ${symbol}: ${marketError.message}`);
        }
        
        // Small delay between market attempts
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      console.log(`❌ [COINDESK INDIVIDUAL] No market found for ${symbol}`);
      return null; // Return null if no market worked
    } catch (error) {
      console.log(`❌ [COINDESK INDIVIDUAL] Exception for ${symbol}: ${error.message}`);
      return null; // Return null instead of throwing, so CoinAPI fallback can be tried
    }
  }

  // Fetch from CoinAPI.io
  async fetchCoinAPIHistoricalPrice(symbol, targetTime) {
    try {
      if (!process.env.COINAPI_API_KEY) {
        console.log(`⚠️ [COINAPI INDIVIDUAL] No API key configured for ${symbol}`);
        return null;
      }

      // Try different symbol formats for CoinAPI.io
      const symbolFormats = [
        `BINANCE_SPOT_${symbol}_USDT`,
        `COINBASE_SPOT_${symbol}_USD`,
        `KRAKEN_SPOT_${symbol}_USD`,
        `BITSTAMP_SPOT_${symbol}_USD`,
        `GATEIO_SPOT_${symbol}_USDT`,
        `MEXC_SPOT_${symbol}_USDT`
      ];

      for (const coinapiSymbol of symbolFormats) {
        try {
          // Calculate time range (get data around target time)
          const startTime = new Date(targetTime.getTime() - 24 * 60 * 60 * 1000); // 1 day before
          const endTime = new Date(targetTime.getTime() + 24 * 60 * 60 * 1000);   // 1 day after
          
          const url = `https://rest.coinapi.io/v1/ohlcv/${coinapiSymbol}/history?period_id=1DAY&time_start=${startTime.toISOString()}&time_end=${endTime.toISOString()}&limit=10`;
          
          console.log(`🔍 [COINAPI INDIVIDUAL] Trying ${coinapiSymbol} at ${targetTime.toISOString()}`);
          
          const response = await fetch(url, {
            headers: {
              'X-CoinAPI-Key': process.env.COINAPI_API_KEY,
              'Accept': 'application/json'
            }
          });
          
          if (response.ok) {
            const data = await response.json();
            
            if (data && data.length > 0) {
              // Find closest OHLCV to target time
              let closestOhlcv = data[0];
              let minTimeDiff = Math.abs(new Date(data[0].time_period_start) - targetTime);
              
              for (const ohlcv of data) {
                const ohlcvTime = new Date(ohlcv.time_period_start);
                const timeDiff = Math.abs(ohlcvTime - targetTime);
                if (timeDiff < minTimeDiff) {
                  minTimeDiff = timeDiff;
                  closestOhlcv = ohlcv;
                }
              }
              
              const price = closestOhlcv.price_close;
              console.log(`✅ [COINAPI INDIVIDUAL] Found price for ${symbol}: $${price}`);
              return parseFloat(price);
            }
          } else if (response.status === 404) {
            // Symbol not found on this exchange, try next
            continue;
          } else {
            console.log(`❌ [COINAPI INDIVIDUAL] API error ${response.status} for ${coinapiSymbol}`);
          }
        } catch (error) {
          console.log(`❌ [COINAPI INDIVIDUAL] Error for ${coinapiSymbol}: ${error.message}`);
          continue;
        }
      }
      
      return null;
    } catch (error) {
      console.log(`❌ [COINAPI INDIVIDUAL] Exception for ${symbol}: ${error.message}`);
      throw new Error(`CoinAPI.io API error: ${error.message}`);
    }
  }

  // Fallback to Perplexity (expensive but comprehensive)
  async fetchPerplexityHistoricalPrice(symbol, timestamp) {
    try {
      // Rate limiting
      await this.waitForRateLimit();
      
      const date = new Date(timestamp);
      const formattedDate = date.toISOString().split('T')[0];
      const time = date.toTimeString().substring(0, 5);
      
      // Smart blockchain detection
      const majorCoins = ['BTC', 'ETH', 'BNB', 'XRP', 'ADA', 'DOGE', 'MATIC', 'DOT', 'AVAX', 'LINK', 'UNI', 'ATOM', 'LTC', 'BCH', 'XLM', 'ALGO', 'VET', 'ICP', 'FIL', 'HBAR', 'NEAR', 'FLOW', 'EOS', 'AAVE', 'MKR', 'SNX', 'COMP'];
      const isMajorCoin = majorCoins.includes(symbol.toUpperCase());
      
      // Construct appropriate query based on coin type
      let query;
      if (isMajorCoin) {
        // For major coins, don't specify blockchain
        query = `What was the price of ${symbol} cryptocurrency on ${formattedDate} around ${time} UTC? Please provide only the USD price as a number.`;
      } else {
        // For other coins (likely Solana memecoins), mention Solana
        query = `What was the price of $${symbol} token on ${formattedDate} around ${time} UTC? Check Solana blockchain and other chains. Please provide only the USD price as a number.`;
      }
      
      console.log(`🔍 [KOL SERVICE] Fetching Perplexity historical price for $${symbol} at ${formattedDate} ${time}`);
      
      const response = await this.perplexityService.searchWithReasoning(query, {
        model: 'sonar-pro',
        maxTokens: 200,
        systemPrompt: 'You are a helpful assistant that provides only numerical cryptocurrency price data. Respond with just the price number in USD.'
      });
      
      if (!response || !response.content) return null;
      
      const content = response.content;
      
      // Extract price from response (multiple formats)
      const patterns = [
        /\$?([\d,]+\.?\d*)/,           // $123.45 or 123.45
        /([\d,]+\.?\d*)\s*USD/i,       // 123.45 USD
        /price.*?([\d,]+\.?\d*)/i,     // price: 123.45
        /([\d,]+\.?\d*)\s*dollars?/i   // 123.45 dollars
      ];
      
      for (const pattern of patterns) {
        const match = content.match(pattern);
        if (match && match[1]) {
          const price = parseFloat(match[1].replace(/,/g, ''));
          if (!isNaN(price) && price > 0) {
            console.log(`✅ [KOL SERVICE] Found price for $${symbol}: $${price}`);
            return price;
          }
        }
      }
      
      console.warn(`⚠️ [KOL SERVICE] Could not parse price from Perplexity response for ${symbol}`);
      console.warn(`   Response: ${content.substring(0, 200)}`);
      return null;
      
    } catch (error) {
      console.error(`❌ [KOL SERVICE] Error fetching historical price for ${symbol}:`, error.message);
      return null;
    }
  }

  // Rate limiting helper for Perplexity calls
  async waitForRateLimit() {
    const now = Date.now();
    const timeSinceLastCall = now - this.lastPerplexityCall;
    if (timeSinceLastCall < this.PERPLEXITY_DELAY) {
      const waitTime = this.PERPLEXITY_DELAY - timeSinceLastCall;
      console.log(`⏳ [KOL SERVICE] Rate limiting: waiting ${waitTime}ms before Perplexity call...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    this.lastPerplexityCall = Date.now();
  }

  // LEAD-LAG DETECTION SYSTEM
  startLeadLagAnalysis() {
    console.log('🔍 [LEAD-LAG] Starting Lead-Lag Analysis system...');
    
    // Run analysis every 6 hours
    setInterval(() => {
      this.analyzeLeadLagCorrelations();
    }, 6 * 60 * 60 * 1000);
    
    // Run initial analysis
    setTimeout(() => {
      this.analyzeLeadLagCorrelations();
    }, 5000);
  }

  analyzeLeadLagCorrelations() {
    console.log('📊 [LEAD-LAG] Analyzing KOL mention → price movement correlations...');
    
    const kolAlphaScores = new Map();
    const coinCorrelations = new Map();
    
    // Group posts by KOL and coin
    const kolCoinData = new Map();
    
    this.posts.forEach(post => {
      if (!post.coins || !post.coins.length || !post.coin_data) return;
      
      const kolHandle = post.kol_handle;
      const mentionTime = new Date(post.timestamp);
      
      post.coins.forEach(coin => {
        const coinData = post.coin_data[coin];
        if (!coinData || !coinData.price_at_mention) return;
        
        const key = `${kolHandle}_${coin}`;
        if (!kolCoinData.has(key)) {
          kolCoinData.set(key, []);
        }
        
        kolCoinData.get(key).push({
          mentionTime,
          priceAtMention: coinData.price_at_mention,
          price1h: coinData.price_1h_after,
          price4h: coinData.price_4h_after,
          price24h: coinData.price_24h_after
        });
      });
    });
    
    // Calculate lead-lag for each KOL-coin pair
    kolCoinData.forEach((mentions, key) => {
      const [kolHandle, coin] = key.split('_');
      
      if (mentions.length < 3) return; // Need at least 3 mentions for correlation
      
      const leadLagData = this.calculateLeadLagTimes(mentions);
      const correlation = this.calculatePearsonCorrelation(mentions);
      
      if (!kolAlphaScores.has(kolHandle)) {
        kolAlphaScores.set(kolHandle, {
          totalMentions: 0,
          successfulPredictions: 0,
          averageLeadTime: 0,
          averageCorrelation: 0,
          coinImpacts: new Map()
        });
      }
      
      const kolScore = kolAlphaScores.get(kolHandle);
      kolScore.totalMentions += mentions.length;
      kolScore.successfulPredictions += leadLagData.successfulPredictions;
      kolScore.coinImpacts.set(coin, {
        correlation: correlation,
        leadTime: leadLagData.averageLeadTime,
        sampleSize: mentions.length
      });
    });
    
    // Calculate final alpha scores with enhanced metrics
    kolAlphaScores.forEach((score, kolHandle) => {
      const impacts = Array.from(score.coinImpacts.values());
      
      const avgCorrelation = impacts.reduce((sum, impact) => sum + impact.correlation, 0) / impacts.length;
      const avgLeadTime = impacts.reduce((sum, impact) => sum + impact.leadTime, 0) / impacts.length;
      const hitRate = score.successfulPredictions / score.totalMentions;
      
      // Enhanced alpha score calculation
      const correlationScore = Math.max(0, avgCorrelation); // Only positive correlations count
      const hitRateScore = hitRate;
      const leadTimeScore = avgLeadTime > 0 ? Math.min(1, 240 / avgLeadTime) : 0; // Faster is better (max 240min)
      const sampleSizeScore = Math.min(1, score.totalMentions / 10); // More samples = more reliable
      
      // Weighted alpha score
      score.averageCorrelation = avgCorrelation;
      score.averageLeadTime = avgLeadTime;
      score.hitRate = hitRate;
      score.alphaScore = (
        correlationScore * 0.4 +    // 40% correlation strength
        hitRateScore * 0.3 +        // 30% prediction accuracy
        leadTimeScore * 0.2 +       // 20% speed of prediction
        sampleSizeScore * 0.1       // 10% sample size reliability
      );
      
      // Alpha tier classification
      if (score.alphaScore >= 0.7) {
        score.alphaTier = 'S+'; // Elite alpha
      } else if (score.alphaScore >= 0.5) {
        score.alphaTier = 'S';  // High alpha
      } else if (score.alphaScore >= 0.3) {
        score.alphaTier = 'A';  // Good alpha
      } else if (score.alphaScore >= 0.1) {
        score.alphaTier = 'B';  // Moderate alpha
      } else {
        score.alphaTier = 'C';  // Low/no alpha
      }
      
      console.log(`🎯 [LEAD-LAG] ${kolHandle}: Alpha=${score.alphaScore.toFixed(3)} (${score.alphaTier}), HitRate=${(hitRate*100).toFixed(1)}%, Correlation=${avgCorrelation.toFixed(3)}, Lead=${avgLeadTime.toFixed(0)}min`);
    });
    
    // Store results
    this.kolAlphaScores = kolAlphaScores;
    this.coinCorrelations = coinCorrelations;
    
    console.log(`📊 [LEAD-LAG] Analysis complete. Analyzed ${kolCoinData.size} KOL-coin pairs.`);
  }

  calculateLeadLagTimes(mentions) {
    let totalLeadTime = 0;
    let successfulPredictions = 0;
    let totalMagnitude = 0;
    let leadTimeData = [];
    
    mentions.forEach(mention => {
      const priceBefore = mention.priceAtMention;
      const price1h = mention.price1h;
      const price4h = mention.price4h;
      const price24h = mention.price24h;
      
      // Calculate price changes
      const change1h = price1h ? (price1h - priceBefore) / priceBefore : 0;
      const change4h = price4h ? (price4h - priceBefore) / priceBefore : 0;
      const change24h = price24h ? (price24h - priceBefore) / priceBefore : 0;
      
      // Enhanced lead time detection with multiple thresholds
      let leadTime = 0;
      let hasMovement = false;
      let movementMagnitude = 0;
      
      // Check for significant movements at different timeframes
      if (Math.abs(change1h) > 0.03) { // 3% threshold for 1h (more sensitive)
        leadTime = 60; // 1 hour
        hasMovement = true;
        movementMagnitude = Math.abs(change1h);
      } else if (Math.abs(change4h) > 0.05) { // 5% threshold for 4h
        leadTime = 240; // 4 hours
        hasMovement = true;
        movementMagnitude = Math.abs(change4h);
      } else if (Math.abs(change24h) > 0.08) { // 8% threshold for 24h (higher bar)
        leadTime = 1440; // 24 hours
        hasMovement = true;
        movementMagnitude = Math.abs(change24h);
      }
      
      if (hasMovement) {
        totalLeadTime += leadTime;
        totalMagnitude += movementMagnitude;
        successfulPredictions++;
        leadTimeData.push({
          leadTime,
          magnitude: movementMagnitude,
          change1h,
          change4h,
          change24h
        });
      }
    });
    
    // Calculate weighted average lead time (weighted by movement magnitude)
    let weightedLeadTime = 0;
    if (totalMagnitude > 0) {
      leadTimeData.forEach(data => {
        const weight = data.magnitude / totalMagnitude;
        weightedLeadTime += data.leadTime * weight;
      });
    }
    
    return {
      averageLeadTime: successfulPredictions > 0 ? totalLeadTime / successfulPredictions : 0,
      weightedLeadTime: weightedLeadTime,
      successfulPredictions,
      totalMagnitude,
      hitRate: successfulPredictions / mentions.length,
      leadTimeData
    };
  }

  calculatePearsonCorrelation(mentions) {
    if (mentions.length < 2) return 0;
    
    // Enhanced correlation analysis
    const correlations = {
      timingVsMovement: 0,
      frequencyVsImpact: 0,
      sentimentVsDirection: 0
    };
    
    // 1. Timing vs Movement Magnitude Correlation
    const mentionTimes = mentions.map(m => m.mentionTime.getTime());
    const priceMovements = mentions.map(m => {
      // Use the maximum movement across all timeframes
      const change1h = m.price1h ? Math.abs((m.price1h - m.priceAtMention) / m.priceAtMention) : 0;
      const change4h = m.price4h ? Math.abs((m.price4h - m.priceAtMention) / m.priceAtMention) : 0;
      const change24h = m.price24h ? Math.abs((m.price24h - m.priceAtMention) / m.priceAtMention) : 0;
      return Math.max(change1h, change4h, change24h);
    });
    
    correlations.timingVsMovement = this.calculatePearsonCoefficient(mentionTimes, priceMovements);
    
    // 2. Frequency vs Impact Correlation (mentions per day vs average impact)
    const timeSpan = Math.max(...mentionTimes) - Math.min(...mentionTimes);
    const days = timeSpan / (1000 * 60 * 60 * 24);
    const frequency = mentions.length / Math.max(days, 1);
    const averageImpact = priceMovements.reduce((sum, impact) => sum + impact, 0) / priceMovements.length;
    
    correlations.frequencyVsImpact = frequency * averageImpact; // Simple frequency-impact score
    
    // 3. Sentiment vs Direction Correlation (if sentiment data available)
    // This would need sentiment data from posts - placeholder for now
    correlations.sentimentVsDirection = 0;
    
    // Return weighted combination of correlations
    const weights = { timing: 0.5, frequency: 0.3, sentiment: 0.2 };
    const combinedCorrelation = 
      correlations.timingVsMovement * weights.timing +
      correlations.frequencyVsImpact * weights.frequency +
      correlations.sentimentVsDirection * weights.sentiment;
    
    return Math.max(-1, Math.min(1, combinedCorrelation)); // Clamp between -1 and 1
  }
  
  calculatePearsonCoefficient(x, y) {
    if (x.length !== y.length || x.length < 2) return 0;
    
    const n = x.length;
    const sumX = x.reduce((sum, val) => sum + val, 0);
    const sumY = y.reduce((sum, val) => sum + val, 0);
    const sumXY = x.reduce((sum, val, i) => sum + (val * y[i]), 0);
    const sumX2 = x.reduce((sum, val) => sum + (val * val), 0);
    const sumY2 = y.reduce((sum, val) => sum + (val * val), 0);
    
    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    
    return denominator === 0 ? 0 : numerator / denominator;
  }

  // Get KOL alpha scores for API
  getKOLAlphaScores() {
    return this.kolAlphaScores || new Map();
  }

  // NEW: Fetch multiple historical prices using free OHLCV APIs (much more efficient)
  async fetchBundledHistoricalPrices(symbol, timestamps) {
    try {
      if (!timestamps || timestamps.length === 0) return {};
      
      const symbolUpper = symbol.toUpperCase();
      const prices = {};
      
      console.log(`🔍 [KOL SERVICE] Fetching BUNDLED historical prices for $${symbol} at ${timestamps.length} timestamps using APEX → CoinAPI → CoinDesk hierarchy`);
      
      // 1. Try APEX API bundled first (primary)
      try {
        const apexPrices = await this.fetchApexExchangeBundledPrices(symbolUpper, timestamps);
        if (Object.keys(apexPrices).length > 0) {
          console.log(`✅ [KOL SERVICE] Got ${Object.keys(apexPrices).length} prices from APEX API for ${symbol}`);
          return apexPrices;
        }
      } catch (error) {
        console.log(`⚠️ [KOL SERVICE] APEX API bundled failed for ${symbol}: ${error.message}`);
      }
      
      // 2. Try CoinAPI.io bundled (fallback)
      try {
        const coinapiPrices = await this.fetchCoinAPIBundledPrices(symbolUpper, timestamps);
        if (Object.keys(coinapiPrices).length > 0) {
          console.log(`✅ [KOL SERVICE] Got ${Object.keys(coinapiPrices).length} prices from CoinAPI.io for ${symbol}`);
          return coinapiPrices;
        }
      } catch (error) {
        console.log(`⚠️ [KOL SERVICE] CoinAPI.io bundled failed for ${symbol}: ${error.message}`);
      }
      
      // 3. Try CoinDesk bundled (final fallback)
      try {
        const coindeskPrices = await this.fetchCoinDeskBundledPrices(symbolUpper, timestamps);
        if (Object.keys(coindeskPrices).length > 0) {
          console.log(`✅ [KOL SERVICE] Got ${Object.keys(coindeskPrices).length} prices from CoinDesk API for ${symbol}`);
          return coindeskPrices;
        }
      } catch (error) {
        console.log(`⚠️ [KOL SERVICE] CoinDesk API bundled failed for ${symbol}: ${error.message}`);
      }
      
      // Fallback to individual calls if bundled APIs fail
      console.log(`🔄 [KOL SERVICE] Bundled APIs failed for ${symbol}, using individual calls...`);
      for (const timestamp of timestamps) {
        const price = await this.fetchHistoricalPrice(symbol, timestamp);
        if (price) {
          prices[timestamp] = price;
        }
      }
      
      return prices;
      
    } catch (error) {
      console.error(`❌ [KOL SERVICE] Error fetching bundled historical prices for ${symbol}:`, error.message);
      return {};
    }
  }


  // Fetch multiple prices from Apex Exchange in single API call
  async fetchApexExchangeBundledPrices(symbol, timestamps) {
    try {
      const apexSymbol = `${symbol}USDT`;
      const prices = {};
      
      console.log(`🔍 [KOL SERVICE] Fetching Apex Exchange bundled prices for ${symbol} (${timestamps.length} timestamps)`);
      
      // Try different intervals to find the best coverage
      const intervals = ['1', '5', '15', '60']; // 1m, 5m, 15m, 1h
      
      for (const interval of intervals) {
        try {
          const url = `https://omni.apex.exchange/api/v3/klines?symbol=${apexSymbol}&interval=${interval}`;
          const response = await fetch(url);
          
          if (!response.ok) {
            console.log(`⚠️ [KOL SERVICE] Apex Exchange interval ${interval} failed: ${response.status}`);
            continue;
          }
          
          const data = await response.json();
          
          if (data.data && data.data[apexSymbol] && data.data[apexSymbol].length > 0) {
            const klines = data.data[apexSymbol];
            
            // Find closest klines for each requested timestamp
            for (const timestamp of timestamps) {
              if (prices[timestamp]) continue; // Already found a price for this timestamp
              
              const targetTime = new Date(timestamp).getTime();
              let closestKline = null;
              let minTimeDiff = Infinity;
              
              for (const kline of klines) {
                const klineTime = kline.t; // timestamp in milliseconds
                const timeDiff = Math.abs(klineTime - targetTime);
                
                if (timeDiff < minTimeDiff) {
                  minTimeDiff = timeDiff;
                  closestKline = kline;
                }
              }
              
              if (closestKline) {
                const price = parseFloat(closestKline.c); // close price
                const klineTime = new Date(closestKline.t);
                const timeDiffMinutes = Math.abs(klineTime - new Date(timestamp)) / (1000 * 60);
                
                // Only use if within reasonable time difference (max 1 hour)
                if (timeDiffMinutes <= 60) {
                  prices[timestamp] = price;
                  console.log(`📊 [APEX BUNDLED] ${symbol} @ ${new Date(timestamp).toISOString()}: $${price} (diff: ${Math.round(timeDiffMinutes)}min)`);
                }
              }
            }
            
            // If we found prices for all timestamps, we're done
            if (Object.keys(prices).length === timestamps.length) {
              break;
            }
          }
        } catch (error) {
          console.log(`❌ [KOL SERVICE] Apex Exchange interval ${interval} error: ${error.message}`);
          continue;
        }
      }
      
      console.log(`✅ [KOL SERVICE] Apex Exchange bundled: ${Object.keys(prices).length}/${timestamps.length} prices found for ${symbol}`);
      return prices;
      
    } catch (error) {
      console.error(`❌ [KOL SERVICE] Apex Exchange bundled error for ${symbol}:`, error.message);
      throw new Error(`Apex Exchange bundled API error: ${error.message}`);
    }
  }

  // Fetch multiple prices from CoinDesk in single API call - try multiple markets
  async fetchCoinDeskBundledPrices(symbol, timestamps) {
    try {
      // Apply symbol mapping (same as individual method)
      const symbolMapping = {
        'SPX6900': 'SPX' // SPX6900 maps to SPX for CoinDesk (becomes SPX-USDT)
      };
      const actualSymbol = symbolMapping[symbol.toUpperCase()] || symbol.toUpperCase();
      const coindeskSymbol = `${actualSymbol}-USDT`;
      const prices = {};
      
      console.log(`🔍 [COINDESK BUNDLED] Fetching prices for ${coindeskSymbol} with ${timestamps.length} timestamps`);
      
      // Calculate days back for oldest timestamp
      const oldestTimestamp = Math.min(...timestamps);
      const daysBack = Math.ceil((Date.now() - oldestTimestamp) / (1000 * 60 * 60 * 24));
      
      // Try multiple markets in order of preference
      const markets = ['binance', 'ascendex', 'gateio', 'mexc', 'kraken', 'hyperliquid'];
      
      for (const market of markets) {
        try {
          const url = `https://data-api.coindesk.com/spot/v1/historical/days?market=${market}&instrument=${coindeskSymbol}&limit=${Math.min(daysBack + 10, 30)}&aggregate=1&fill=true&apply_mapping=true&response_format=JSON`;
          
          console.log(`🔍 [COINDESK BUNDLED] Trying ${market} for ${coindeskSymbol}`);
          console.log(`🔍 [COINDESK BUNDLED] URL: ${url}`);
          
          const response = await fetch(url);
          console.log(`🔍 [COINDESK BUNDLED] ${market} response status: ${response.status}`);
          
          if (response.ok) {
            const data = await response.json();
            console.log(`🔍 [COINDESK BUNDLED] ${market} response structure:`, Object.keys(data));
            
            if (data && data.Data && data.Data.length > 0) {
              console.log(`🔍 [COINDESK BUNDLED] ${market} received ${data.Data.length} data points`);
              
              // Match each timestamp to closest daily data
              for (const timestamp of timestamps) {
                const targetTime = new Date(timestamp);
                let closestData = data.Data[0];
                let minTimeDiff = Math.abs(new Date(data.Data[0].TIMESTAMP * 1000) - targetTime);
                
                for (const dayData of data.Data) {
                  const dayTime = new Date(dayData.TIMESTAMP * 1000);
                  const timeDiff = Math.abs(dayTime - targetTime);
                  if (timeDiff < minTimeDiff) {
                    minTimeDiff = timeDiff;
                    closestData = dayData;
                  }
                }
                
                const price = closestData.CLOSE;
                if (price) {
                  prices[timestamp] = parseFloat(price);
                  console.log(`✅ [COINDESK BUNDLED] ${symbol} on ${market} at ${timestamp}: $${price}`);
                }
              }
              
              // If we got prices, return them (don't try other markets)
              if (Object.keys(prices).length > 0) {
                console.log(`📊 [COINDESK BUNDLED] Returning ${Object.keys(prices).length} prices for ${symbol} from ${market}`);
                return prices;
              }
            } else {
              console.log(`⚠️ [COINDESK BUNDLED] ${market} returned no data for ${coindeskSymbol}`);
            }
          } else {
            const errorText = await response.text();
            console.log(`❌ [COINDESK BUNDLED] ${market} API error ${response.status}: ${errorText.substring(0, 200)}...`);
          }
        } catch (marketError) {
          console.log(`❌ [COINDESK BUNDLED] ${market} exception for ${symbol}: ${marketError.message}`);
        }
        
        // Small delay between market attempts
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      console.log(`❌ [COINDESK BUNDLED] No market found for ${symbol}`);
      return prices; // Return empty prices object
    } catch (error) {
      console.log(`❌ [COINDESK BUNDLED] Error for ${symbol}: ${error.message}`);
      throw new Error(`CoinDesk bundled API error: ${error.message}`);
    }
  }

  // Fetch multiple prices from CoinAPI.io in single API call
  async fetchCoinAPIBundledPrices(symbol, timestamps) {
    try {
      if (!process.env.COINAPI_API_KEY) {
        console.log(`⚠️ [COINAPI BUNDLED] No API key configured for ${symbol}`);
        return {};
      }

      const prices = {};
      
      console.log(`🔍 [COINAPI BUNDLED] Fetching prices for ${symbol} with ${timestamps.length} timestamps`);
      
      // Try different symbol formats for CoinAPI.io
      const symbolFormats = [
        `BINANCE_SPOT_${symbol}_USDT`,
        `COINBASE_SPOT_${symbol}_USD`,
        `KRAKEN_SPOT_${symbol}_USD`,
        `BITSTAMP_SPOT_${symbol}_USD`,
        `GATEIO_SPOT_${symbol}_USDT`,
        `MEXC_SPOT_${symbol}_USDT`
      ];

      for (const coinapiSymbol of symbolFormats) {
        try {
          // Calculate time range for all timestamps
          const sortedTimestamps = [...timestamps].sort((a, b) => new Date(a) - new Date(b));
          const startTime = new Date(sortedTimestamps[0]);
          const endTime = new Date(sortedTimestamps[sortedTimestamps.length - 1]);
          
          // Add buffer time
          startTime.setTime(startTime.getTime() - 24 * 60 * 60 * 1000); // 1 day before
          endTime.setTime(endTime.getTime() + 24 * 60 * 60 * 1000);     // 1 day after
          
          const url = `https://rest.coinapi.io/v1/ohlcv/${coinapiSymbol}/history?period_id=1DAY&time_start=${startTime.toISOString()}&time_end=${endTime.toISOString()}&limit=100`;
          
          console.log(`🔍 [COINAPI BUNDLED] Trying ${coinapiSymbol}`);
          
          const response = await fetch(url, {
            headers: {
              'X-CoinAPI-Key': process.env.COINAPI_API_KEY,
              'Accept': 'application/json'
            }
          });
          
          if (response.ok) {
            const data = await response.json();
            
            if (data && data.length > 0) {
              // Match each timestamp to closest OHLCV
              for (const timestamp of timestamps) {
                const targetTime = new Date(timestamp);
                let closestOhlcv = data[0];
                let minTimeDiff = Math.abs(new Date(data[0].time_period_start) - targetTime);
                
                for (const ohlcv of data) {
                  const ohlcvTime = new Date(ohlcv.time_period_start);
                  const timeDiff = Math.abs(ohlcvTime - targetTime);
                  if (timeDiff < minTimeDiff) {
                    minTimeDiff = timeDiff;
                    closestOhlcv = ohlcv;
                  }
                }
                
                const price = closestOhlcv.price_close;
                if (price) {
                  prices[timestamp] = parseFloat(price);
                  console.log(`✅ [COINAPI BUNDLED] ${symbol} at ${timestamp}: $${price}`);
                }
              }
              
              if (Object.keys(prices).length > 0) {
                console.log(`📊 [COINAPI BUNDLED] Returning ${Object.keys(prices).length} prices for ${symbol}`);
                return prices;
              }
            }
          } else if (response.status === 404) {
            // Symbol not found on this exchange, try next
            continue;
          } else {
            console.log(`❌ [COINAPI BUNDLED] API error ${response.status} for ${coinapiSymbol}`);
          }
        } catch (error) {
          console.log(`❌ [COINAPI BUNDLED] Error for ${coinapiSymbol}: ${error.message}`);
          continue;
        }
      }
      
      console.log(`📊 [COINAPI BUNDLED] Returning ${Object.keys(prices).length} prices for ${symbol}`);
      return prices;
    } catch (error) {
      console.log(`❌ [COINAPI BUNDLED] Error for ${symbol}: ${error.message}`);
      throw new Error(`CoinAPI.io bundled API error: ${error.message}`);
    }
  }

  // Hybrid: Try DegenOracle first, fallback to Perplexity
  async fetchPrice(symbol, timestamp = null) {
    // For current prices, try DegenOracle
    if (!timestamp) {
      const coinData = await this.fetchCoinData(symbol);
      if (coinData && coinData.price) {
        return coinData.price;
      }
    }
    
    // For historical or missing coins, use Perplexity
    return await this.fetchHistoricalPrice(symbol, timestamp || new Date());
  }

  // Enrich posts with coin data (logos, prices)
  async enrichPostsWithCoinData() {
    const uniqueCoins = new Set();
    this.posts.forEach(post => {
      if (post.coins) {
        post.coins.forEach(coin => uniqueCoins.add(coin));
      }
    });

    console.log(`🔍 [KOL SERVICE] Enriching ${uniqueCoins.size} unique coins with data...`);

    const coinDataCache = {};
    for (const coin of uniqueCoins) {
      const data = await this.fetchCoinData(coin);
      if (data) {
        coinDataCache[coin] = data;
        console.log(`✅ [KOL SERVICE] Fetched data for ${coin}: $${data.price}`);
        if (data.image) {
          console.log(`   🖼️ Logo: ${data.image.substring(0, 50)}...`);
        } else {
          console.warn(`   ⚠️ No logo found for ${coin}`);
        }
      } else {
        console.warn(`⚠️ [KOL SERVICE] No data found in DegenOracle for ${coin}`);
      }
    }

    // Add coin data to posts
    let enriched = 0;
    
    // Process posts sequentially to handle async price fetching
    for (const post of this.posts) {
      if (post.coins) {
        // Initialize coin_data if not exists
        if (!post.coin_data) {
          post.coin_data = {};
        }
        
        for (const coin of post.coins) {
          // Get the price at the exact time of the mention from historical APIs
          const mentionTime = new Date(post.created_at);
          const historicalPrice = await this.fetchHistoricalPrice(coin, mentionTime);
          
          // Fetch Lead-Lag price points (1h, 4h, 24h after mention)
          const price1h = await this.fetchHistoricalPrice(coin, new Date(mentionTime.getTime() + 60 * 60 * 1000));
          const price4h = await this.fetchHistoricalPrice(coin, new Date(mentionTime.getTime() + 4 * 60 * 60 * 1000));
          const price24h = await this.fetchHistoricalPrice(coin, new Date(mentionTime.getTime() + 24 * 60 * 60 * 1000));
          
          // Create coin data entry - use DegenOracle data if available, otherwise create basic structure
          const baseCoinData = coinDataCache[coin] || {
            symbol: coin,
            name: coin,
            image: null,
            price: null,
            volume_24h: null,
            mcap: null,
            price_change_24h: null
          };
          
          // CRITICAL: If historicalPrice is null but we have Lead-Lag data, use the 1h price as fallback
          if (historicalPrice === null && price1h !== null) {
            console.log(`⚠️ [LEAD-LAG-DEBUG] Using price+1h as fallback for ${coin}: ${price1h}`);
            historicalPrice = price1h;
          }
          
          // Always update coin_data, even if it already exists (for force-enrich)
          post.coin_data[coin] = {
            ...baseCoinData,
            price_at_mention: historicalPrice || baseCoinData.price, // Use historical price if available
            price_1h_after: price1h,
            price_4h_after: price4h,
            price_24h_after: price24h,
            timestamp: post.created_at
          };
          enriched++;
          
          // Debug logging for Lead-Lag analysis
          console.log(`📊 [LEAD-LAG-DEBUG] Coin: ${coin}, MentionTime: ${mentionTime.toISOString()}`);
          console.log(`  📈 Price@Mention: ${historicalPrice}, Price+1h: ${price1h}, Price+4h: ${price4h}, Price+24h: ${price24h}`);
          
          // Add small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }
    }

    if (enriched > 0) {
      await this.saveData();
      // Also save historical prices cache and coin data cache
      await this.saveHistoricalPricesCache();
      await this.saveCoinDataCache();
      console.log(`💎 [KOL SERVICE] Enriched ${enriched} posts with coin data`);
    }

    return coinDataCache;
  }

  // Backfill price data for posts (1h, 4h, 24h after mention) - BUNDLED APPROACH
  async backfillPriceData() {
    try {
      console.log(`🔄 [PRICE BACKFILL] Starting BUNDLED backfill for ${this.posts.length} posts...`);
      
      let backfilled = 0;
      const now = new Date();
      const processedCoins = new Set(); // Track which coins we're processing
      
      // Group all needed timestamps by coin for bundling
      const coinTimestampMap = new Map();
      
      for (const post of this.posts) {
        if (!post.coins || post.coins.length === 0) continue;
        
        const mentionTime = new Date(post.created_at);
        const hoursSinceMention = (now - mentionTime) / (1000 * 60 * 60);
        
        // Initialize coin_data if not exists
        if (!post.coin_data) {
          post.coin_data = {};
        }
        
        for (const coin of post.coins) {
          if (!post.coin_data[coin]) {
            post.coin_data[coin] = {};
          }
          
          const coinData = post.coin_data[coin];
          
          // Collect all needed timestamps for this coin
          if (!coinTimestampMap.has(coin)) {
            coinTimestampMap.set(coin, []);
          }
          
          const coinTimestamps = coinTimestampMap.get(coin);
          
          // Backfill 1h after
          if (hoursSinceMention >= 1 && !coinData.price_1h_after) {
            const t1h = new Date(mentionTime.getTime() + 60 * 60 * 1000);
            coinTimestamps.push({ timestamp: t1h, type: '1h', coinData, post });
          }
          
          // Backfill 4h after
          if (hoursSinceMention >= 4 && !coinData.price_4h_after) {
            const t4h = new Date(mentionTime.getTime() + 4 * 60 * 60 * 1000);
            coinTimestamps.push({ timestamp: t4h, type: '4h', coinData, post });
          }
          
          // Backfill 24h after
          if (hoursSinceMention >= 24 && !coinData.price_24h_after) {
            const t24h = new Date(mentionTime.getTime() + 24 * 60 * 60 * 1000);
            coinTimestamps.push({ timestamp: t24h, type: '24h', coinData, post });
          }
        }
      }
      
      // Process each coin with bundled calls
      for (const [coin, timestamps] of coinTimestampMap) {
        if (timestamps.length === 0) continue;
        
        console.log(`📊 [BUNDLED BACKFILL] Processing ${timestamps.length} timestamps for ${coin}`);
        
        // Extract just the timestamps for the bundled call
        const timestampList = timestamps.map(t => t.timestamp);
        
        // Make single bundled call for this coin
        const bundledPrices = await this.fetchBundledHistoricalPrices(coin, timestampList);
        
        // Apply the results back to the coin data
        for (const timestampInfo of timestamps) {
          const { timestamp, type, coinData, post } = timestampInfo;
          const priceKey = `price_${type}_after`;
          
          if (bundledPrices[timestamp]) {
            coinData[priceKey] = bundledPrices[timestamp];
            backfilled++;
            console.log(`📊 [BUNDLED BACKFILL] ${coin} @ +${type}: $${coinData[priceKey]}`);
          } else {
            // Fallback to individual call if bundled didn't work
            console.log(`⚠️ [BUNDLED BACKFILL] Fallback to individual call for ${coin} @ +${type}`);
            coinData[priceKey] = await this.fetchPrice(coin, timestamp);
            if (coinData[priceKey]) {
              backfilled++;
              console.log(`📊 [FALLBACK] ${coin} @ +${type}: $${coinData[priceKey]}`);
            }
          }
        }
        
        // Rate limit friendly delay between coins
        await this.delay(2000);
      }
      
      if (backfilled > 0) {
        await this.saveData();
        console.log(`✅ [BUNDLED BACKFILL] Complete! Backfilled ${backfilled} price points using ${coinTimestampMap.size} bundled calls`);
      } else {
        console.log(`✅ [BUNDLED BACKFILL] No backfill needed`);
      }
      
      return backfilled;
      
    } catch (error) {
      console.error('❌ [BUNDLED BACKFILL] Error:', error.message);
      return 0;
    }
  }

  // Start background job for price backfill (runs every hour)
  startBackfillJob() {
    // Run immediately on start (after a delay to let system initialize)
    setTimeout(() => {
      this.backfillPriceData();
    }, 60000); // 1 minute after start
    
    // Then run every hour
    this.backfillInterval = setInterval(() => {
      this.backfillPriceData();
    }, 3600000); // 1 hour
    
    console.log('⏰ [KOL SERVICE] Backfill job started (runs every hour)');
  }

  // Stop backfill job (for cleanup)
  stopBackfillJob() {
    if (this.backfillInterval) {
      clearInterval(this.backfillInterval);
      console.log('⏸️ [KOL SERVICE] Backfill job stopped');
    }
  }

  // Normalize existing coin data to fix case sensitivity issues
  async normalizeCoinData() {
    try {
      console.log('🔄 [COIN NORMALIZATION] Starting coin case normalization...');
      
      let postsUpdated = 0;
      let coinsNormalized = 0;
      const coinMapping = new Map();
      
      for (let i = 0; i < this.posts.length; i++) {
        const post = this.posts[i];
        let postChanged = false;
        
        // Normalize coins array
        if (post.coins && Array.isArray(post.coins)) {
          const originalCoins = [...post.coins];
          const normalizedCoins = [];
          
          for (const coin of originalCoins) {
            const normalizedCoin = coin.toUpperCase();
            
            // Track mapping for reporting
            if (coin !== normalizedCoin) {
              coinMapping.set(coin, normalizedCoin);
              coinsNormalized++;
            }
            
            // Avoid duplicates in normalized array
            if (!normalizedCoins.includes(normalizedCoin)) {
              normalizedCoins.push(normalizedCoin);
            }
          }
          
          // Update if changes were made
          if (JSON.stringify(originalCoins) !== JSON.stringify(normalizedCoins)) {
            post.coins = normalizedCoins;
            postChanged = true;
          }
        }
        
        // Normalize coin_data keys
        if (post.coin_data && typeof post.coin_data === 'object') {
          const originalCoinData = { ...post.coin_data };
          const normalizedCoinData = {};
          
          for (const [coinKey, coinData] of Object.entries(originalCoinData)) {
            const normalizedKey = coinKey.toUpperCase();
            
            // If we already have data for this normalized key, merge it
            if (normalizedCoinData[normalizedKey]) {
              normalizedCoinData[normalizedKey] = {
                ...normalizedCoinData[normalizedKey],
                ...coinData,
                timestamp: coinData.timestamp || normalizedCoinData[normalizedKey].timestamp
              };
            } else {
              normalizedCoinData[normalizedKey] = coinData;
            }
            
            // Track mapping
            if (coinKey !== normalizedKey) {
              coinMapping.set(coinKey, normalizedKey);
              coinsNormalized++;
            }
          }
          
          // Update if changes were made
          if (JSON.stringify(originalCoinData) !== JSON.stringify(normalizedCoinData)) {
            post.coin_data = normalizedCoinData;
            postChanged = true;
          }
        }
        
        if (postChanged) {
          postsUpdated++;
        }
      }
      
      // Save changes if any were made
      if (postsUpdated > 0) {
        await this.saveData();
        console.log(`✅ [COIN NORMALIZATION] Updated ${postsUpdated} posts`);
      }
      
      // Report results
      console.log(`📊 [COIN NORMALIZATION] Summary:`);
      console.log(`   Posts processed: ${this.posts.length}`);
      console.log(`   Posts updated: ${postsUpdated}`);
      console.log(`   Coin mappings: ${coinMapping.size}`);
      
      if (coinMapping.size > 0) {
        console.log(`🔄 [COIN NORMALIZATION] Applied mappings:`);
        for (const [old, normalized] of coinMapping) {
          if (old !== normalized) {
            console.log(`   "${old}" → "${normalized}"`);
          }
        }
      }
      
      return {
        postsUpdated,
        coinsNormalized,
        coinMapping: Object.fromEntries(coinMapping)
      };
      
    } catch (error) {
      console.error('❌ [COIN NORMALIZATION] Error:', error.message);
      return null;
    }
  }

  // Helper: delay function
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Generate unique ID
  generateId() {
    return `kol_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Start automatic tweet fetching for all KOLs every 4 hours
  startAutomaticTweetFetching() {
    console.log('🔄 [KOL SERVICE] Starting automatic tweet fetching (every 4 hours)');
    
    // Check if we need to fetch immediately based on last fetch time
    this.checkAndFetchIfNeeded();
    
    // Then run every 4 hours
    this.tweetFetchInterval = setInterval(() => {
      this.fetchAllKOLTweets();
    }, 4 * 60 * 60 * 1000); // 4 hours
    
    console.log('⏰ [KOL SERVICE] Automatic tweet fetching scheduled (every 4 hours)');
  }

  // Check if we need to fetch immediately based on last fetch time (persistent across reboots)
  async checkAndFetchIfNeeded() {
    try {
      const lastFetchFile = path.join(this.dataDir, 'last-tweet-fetch.json');
      
      // Check if we have a last fetch time
      let lastFetchTime = null;
      try {
        const lastFetchData = await fs.readFile(lastFetchFile, 'utf8');
        const parsed = JSON.parse(lastFetchData);
        lastFetchTime = new Date(parsed.lastFetchTime);
        console.log(`🕐 [KOL SERVICE] Last tweet fetch: ${lastFetchTime.toISOString()}`);
      } catch (error) {
        console.log('🕐 [KOL SERVICE] No previous fetch time found, will fetch immediately');
      }
      
      // If no last fetch or more than 4 hours ago, fetch immediately
      const now = new Date();
      const fourHoursAgo = new Date(now.getTime() - (4 * 60 * 60 * 1000));
      
      if (!lastFetchTime || lastFetchTime < fourHoursAgo) {
        console.log('🔄 [KOL SERVICE] Fetching tweets immediately (4+ hours since last fetch)');
        setTimeout(() => {
          this.fetchAllKOLTweets();
        }, 30 * 1000); // Wait 30 seconds after startup
      } else {
        const nextFetchIn = Math.round((lastFetchTime.getTime() + (4 * 60 * 60 * 1000) - now.getTime()) / (60 * 1000));
        console.log(`⏰ [KOL SERVICE] Next tweet fetch in ${nextFetchIn} minutes`);
      }
      
    } catch (error) {
      console.error('❌ [KOL SERVICE] Error checking last fetch time:', error.message);
      // Fallback: fetch immediately
      setTimeout(() => {
        this.fetchAllKOLTweets();
      }, 30 * 1000);
    }
  }

  // Fetch tweets for all active KOLs
  async fetchAllKOLTweets() {
    try {
      console.log('🔄 [KOL SERVICE] Starting automatic tweet fetch for all KOLs...');
      
      const activeKOLs = Array.from(this.kols.values()).filter(kol => kol.status === 'active');
      console.log(`📊 [KOL SERVICE] Found ${activeKOLs.length} active KOLs to fetch tweets for`);
      
      let totalNewPosts = 0;
      let successCount = 0;
      let errorCount = 0;
      
      for (const kol of activeKOLs) {
        try {
          console.log(`🔍 [KOL SERVICE] Auto-fetching tweets for @${kol.handle}...`);
          
          // Fetch tweets for this KOL
          const newPosts = await this.fetchKOLTweets(kol.handle);
          
          if (newPosts && newPosts > 0) {
            totalNewPosts += newPosts;
            successCount++;
            console.log(`✅ [KOL SERVICE] Auto-fetch completed for @${kol.handle}: ${newPosts} new posts`);
          } else {
            console.log(`ℹ️ [KOL SERVICE] Auto-fetch completed for @${kol.handle}: no new posts`);
          }
          
          // Rate limiting - wait 10 seconds between KOLs to avoid API limits
          await new Promise(resolve => setTimeout(resolve, 10000));
          
        } catch (error) {
          errorCount++;
          console.error(`❌ [KOL SERVICE] Auto-fetch failed for @${kol.handle}:`, error.message);
        }
      }
      
      console.log(`🎯 [KOL SERVICE] Auto-fetch completed: ${successCount} successful, ${errorCount} errors, ${totalNewPosts} total new posts`);
      
      // If we got new posts, enrich them with coin data
      if (totalNewPosts > 0) {
        console.log('💎 [KOL SERVICE] Auto-fetch found new posts, enriching with coin data...');
        await this.enrichPostsWithCoinData();
        
        console.log('🔄 [KOL SERVICE] Auto-fetch completed with data enrichment');
      }
      
      // Save last fetch time for persistence across reboots
      await this.saveLastFetchTime();
      
    } catch (error) {
      console.error('❌ [KOL SERVICE] Error in automatic tweet fetching:', error.message);
    }
  }

  // Save last fetch time for persistence across reboots
  async saveLastFetchTime() {
    try {
      const lastFetchFile = path.join(this.dataDir, 'last-tweet-fetch.json');
      const lastFetchData = {
        lastFetchTime: new Date().toISOString(),
        timestamp: Date.now()
      };
      
      await fs.writeFile(lastFetchFile, JSON.stringify(lastFetchData, null, 2), 'utf8');
      console.log(`💾 [KOL SERVICE] Last fetch time saved: ${lastFetchData.lastFetchTime}`);
    } catch (error) {
      console.error('❌ [KOL SERVICE] Error saving last fetch time:', error.message);
    }
  }

  // Stop automatic tweet fetching
  stopAutomaticTweetFetching() {
    if (this.tweetFetchInterval) {
      clearInterval(this.tweetFetchInterval);
      console.log('⏸️ [KOL SERVICE] Automatic tweet fetching stopped');
    }
  }
}

export default KOLService;
