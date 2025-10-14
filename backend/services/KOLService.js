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

class KOLService {
  constructor() {
    this.kols = new Map();
    this.posts = [];
    this.dataDir = path.join(process.cwd(), 'data', 'kols');
    this.kolsFile = path.join(this.dataDir, 'kols.json');
    this.postsFile = path.join(this.dataDir, 'posts.json');
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
    
    if (this.kols.has(normalizedHandle)) {
      throw new Error('KOL already exists');
    }

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

      // Process tweets
      let newPosts = 0;
      for (const tweet of tweets) {
        const postId = `post_${tweet.id}`;
        
        // Check if we already have this post
        if (this.posts.some(post => post.id === postId)) {
          continue;
        }

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
          processed_at: new Date().toISOString()
        };

        this.posts.push(post);
        newPosts++;
      }

      // Update KOL stats
      const kol = this.kols.get(handle.toLowerCase());
      if (kol) {
        kol.last_fetched = new Date().toISOString();
        kol.total_posts = this.posts.filter(p => p.kol_handle.toLowerCase() === handle.toLowerCase()).length;
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

  // Generate unique ID
  generateId() {
    return `kol_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

export default KOLService;
