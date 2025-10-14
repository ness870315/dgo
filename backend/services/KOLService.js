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
import path from 'path';
import axios from 'axios';
import OpenAIService from '../openaiService.js';

class KOLService {
  constructor() {
    this.kols = new Map();
    this.posts = [];
    this.dataDir = path.join(process.cwd(), 'data', 'kols');
    this.kolsFile = path.join(this.dataDir, 'kols.json');
    this.postsFile = path.join(this.dataDir, 'posts.json');
    this.openaiService = new OpenAIService();
  }

  async initialize() {
    try {
      // Ensure data directory exists
      await fs.mkdir(this.dataDir, { recursive: true });
      
      // Load existing data
      await this.loadData();
      
      console.log(`✅ [KOL SERVICE] Initialized with ${this.kols.size} KOLs`);
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

  async saveData() {
    try {
      // Save KOLs
      const kolsArray = Array.from(this.kols.values());
      await fs.writeFile(this.kolsFile, JSON.stringify(kolsArray, null, 2), 'utf8');

      // Save posts
      await fs.writeFile(this.postsFile, JSON.stringify(this.posts, null, 2), 'utf8');

      console.log(`💾 [KOL SERVICE] Saved ${this.kols.size} KOLs and ${this.posts.length} posts`);
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

      // Extract user info from first tweet (for influence calculation)
      let userInfo = null;
      if (tweets.length > 0 && tweets[0].author) {
        userInfo = tweets[0].author;
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
1. Coin symbols (BTC, ETH, SOL, etc.)
2. Sentiment: bullish (1), neutral (0), or bearish (-1)
3. Key narratives/themes

Tweet: "${text}"

Respond with ONLY valid JSON:
{
  "coins": ["BTC", "ETH"],
  "sentiment": 1,
  "narratives": ["DeFi", "Layer 2"]
}

If no coins found, return empty arrays. Sentiment must be -1, 0, or 1.`;

      const response = await this.openaiService.generateCompletion(prompt, {
        maxTokens: 150,
        temperature: 0.1,
        model: 'gpt-4o'
      });

      // Parse JSON response
      const cleanResponse = this.extractJSON(response);
      const analysis = JSON.parse(cleanResponse);

      return {
        coins: analysis.coins || [],
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

  // Generate unique ID
  generateId() {
    return `kol_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

export default KOLService;
