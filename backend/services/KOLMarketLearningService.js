/**
 * KOL Market Learning Service
 * 
 * Monitors KOL accounts, analyzes their tweets, and builds predictive models
 * for alpha generation based on social sentiment and market movements.
 * 
 * Features:
 * - KOL Twitter monitoring (every 2 days)
 * - Stance detection (bullish/bearish/neutral)
 * - Lead-lag analysis (KOL mentions vs price movements)
 * - Consensus detection and alpha signals
 * - Network analysis (KOL amplification chains)
 */

import fs from 'fs/promises';
import path from 'path';
import axios from 'axios';
import OpenAIService from '../openaiService.js';
import PerplexitySonarService from './PerplexitySonarService.js';

class KOLMarketLearningService {
  constructor() {
    this.dataDir = process.env.DATA_DIR 
      ? path.join(process.env.DATA_DIR, 'kol-learning')
      : path.join(process.cwd(), 'data', 'kol-learning');
    
    // Database files
    this.kolsFile = path.join(this.dataDir, 'kols.json');
    this.postsFile = path.join(this.dataDir, 'posts.json');
    this.signalsFile = path.join(this.dataDir, 'signals.json');
    this.relationsFile = path.join(this.dataDir, 'relations.json');
    this.marketDataFile = path.join(this.dataDir, 'market.json');
    
    // In-memory caches
    this.kols = new Map();
    this.posts = [];
    this.signals = new Map();
    this.relations = new Map();
    this.marketData = new Map();
    
    // Services
    this.openaiService = new OpenAIService();
    this.perplexityService = new PerplexitySonarService();
    
    // Configuration
    this.monitoringInterval = 2 * 24 * 60 * 60 * 1000; // 2 days
    this.lastMonitoringRun = 0;
    
    // KOL accounts to monitor (expand this list)
    this.kolAccounts = [
      { handle: 'elonmusk', influence_score: 100, segments: ['crypto', 'tech', 'meme'] },
      { handle: 'VitalikButerin', influence_score: 95, segments: ['ethereum', 'defi', 'tech'] },
      { handle: 'naval', influence_score: 90, segments: ['crypto', 'philosophy', 'investment'] },
      { handle: 'balajis', influence_score: 88, segments: ['crypto', 'tech', 'sovereignty'] },
      { handle: 'APompliano', influence_score: 85, segments: ['bitcoin', 'crypto', 'investment'] },
      { handle: 'michael_saylor', influence_score: 92, segments: ['bitcoin', 'corporate', 'strategy'] },
      { handle: 'justinsuntron', influence_score: 80, segments: ['tron', 'crypto', 'defi'] },
      { handle: 'cz_binance', influence_score: 95, segments: ['crypto', 'exchange', 'defi'] },
      { handle: 'brian_armstrong', influence_score: 85, segments: ['crypto', 'exchange', 'tech'] },
      { handle: 'barrysilbert', influence_score: 82, segments: ['crypto', 'investment', 'bitcoin'] }
    ];
    
    console.log('🧠 [KOL LEARNING] Service initialized');
    console.log(`   Data dir: ${this.dataDir}`);
    console.log(`   Monitoring ${this.kolAccounts.length} KOL accounts`);
  }

  /**
   * Initialize the service
   */
  async initialize() {
    try {
      // Create directory if it doesn't exist
      await fs.mkdir(this.dataDir, { recursive: true });
      
      // Load existing data
      await this.loadData();
      
      // Initialize OpenAI service
      if (!this.openaiService.isInitialized) {
        await this.openaiService.initialize();
      }
      
      // Initialize Perplexity service
      if (!this.perplexityService.isInitialized) {
        await this.perplexityService.initialize();
      }
      
      console.log(`✅ [KOL LEARNING] Loaded ${this.kols.size} KOLs, ${this.posts.length} posts`);
    } catch (error) {
      console.error('❌ [KOL LEARNING] Initialization error:', error.message);
    }
  }

  /**
   * Load data from files
   */
  async loadData() {
    try {
      // Load KOLs
      const kolsData = await fs.readFile(this.kolsFile, 'utf8');
      const kolsArray = JSON.parse(kolsData);
      this.kols = new Map(kolsArray.map(kol => [kol.handle, kol]));
    } catch (error) {
      if (error.code === 'ENOENT') {
        // Initialize with default KOLs
        for (const kol of this.kolAccounts) {
          this.kols.set(kol.handle, {
            id: this.generateId(),
            ...kol,
            created_at: new Date().toISOString(),
            last_monitored: null,
            total_posts: 0,
            reliability_score: 0
          });
        }
        await this.saveKOLs();
      } else {
        throw error;
      }
    }

    try {
      // Load posts
      const postsData = await fs.readFile(this.postsFile, 'utf8');
      this.posts = JSON.parse(postsData);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }

    try {
      // Load signals
      const signalsData = await fs.readFile(this.signalsFile, 'utf8');
      const signalsArray = JSON.parse(signalsData);
      this.signals = new Map(signalsArray.map(s => [`${s.asset_id}_${s.ts}`, s]));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }

    try {
      // Load relations
      const relationsData = await fs.readFile(this.relationsFile, 'utf8');
      const relationsArray = JSON.parse(relationsData);
      this.relations = new Map(relationsArray.map(r => [`${r.src_kol_id}_${r.dst_kol_id}`, r]));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }

    try {
      // Load market data
      const marketData = await fs.readFile(this.marketDataFile, 'utf8');
      const marketArray = JSON.parse(marketData);
      this.marketData = new Map(marketArray.map(m => [`${m.asset_id}_${m.ts}`, m]));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }

  /**
   * Save data to files
   */
  async saveData() {
    await Promise.all([
      this.saveKOLs(),
      this.savePosts(),
      this.saveSignals(),
      this.saveRelations(),
      this.saveMarketData()
    ]);
  }

  async saveKOLs() {
    const kolsArray = Array.from(this.kols.values());
    await fs.writeFile(this.kolsFile, JSON.stringify(kolsArray, null, 2), 'utf8');
  }

  async savePosts() {
    await fs.writeFile(this.postsFile, JSON.stringify(this.posts, null, 2), 'utf8');
  }

  async saveSignals() {
    const signalsArray = Array.from(this.signals.values());
    await fs.writeFile(this.signalsFile, JSON.stringify(signalsArray, null, 2), 'utf8');
  }

  async saveRelations() {
    const relationsArray = Array.from(this.relations.values());
    await fs.writeFile(this.relationsFile, JSON.stringify(relationsArray, null, 2), 'utf8');
  }

  async saveMarketData() {
    const marketArray = Array.from(this.marketData.values());
    await fs.writeFile(this.marketDataFile, JSON.stringify(marketArray, null, 2), 'utf8');
  }

  /**
   * Monitor KOL accounts (main entry point)
   */
  async runMonitoring() {
    const now = Date.now();
    if (now - this.lastMonitoringRun < this.monitoringInterval) {
      console.log('⏰ [KOL LEARNING] Monitoring not due yet');
      return;
    }

    console.log('🔍 [KOL LEARNING] Starting KOL monitoring cycle...');
    
    try {
      // Monitor each KOL account
      for (const [handle, kol] of this.kols) {
        await this.monitorKOLAccount(kol);
        // Delay between accounts to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      // Analyze new data
      await this.analyzeRecentActivity();
      
      // Update signals
      await this.updateSignals();
      
      // Save all data
      await this.saveData();
      
      this.lastMonitoringRun = now;
      console.log('✅ [KOL LEARNING] Monitoring cycle completed');
      
    } catch (error) {
      console.error('❌ [KOL LEARNING] Monitoring error:', error.message);
    }
  }

  /**
   * Monitor a specific KOL account
   */
  async monitorKOLAccount(kol) {
    try {
      console.log(`🔍 [KOL LEARNING] Monitoring @${kol.handle}...`);
      
      // Fetch recent tweets using TwitterAPI.io
      const tweets = await this.fetchKOLTweets(kol.handle);
      
      if (!tweets || tweets.length === 0) {
        console.log(`⚠️ [KOL LEARNING] No tweets found for @${kol.handle}`);
        return;
      }

      // Filter out tweets we've already processed
      const existingTweetIds = new Set(this.posts
        .filter(post => post.kol_handle === kol.handle)
        .map(post => post.id)
      );

      const newTweets = tweets.filter(tweet => !existingTweetIds.has(tweet.id));
      
      if (newTweets.length === 0) {
        console.log(`ℹ️ [KOL LEARNING] No new tweets for @${kol.handle} since last monitoring`);
        kol.last_monitored = new Date().toISOString();
        return;
      }

      // Process each new tweet
      let processedCount = 0;
      for (const tweet of newTweets) {
        try {
          await this.processTweet(kol, tweet);
          processedCount++;
          
          // Small delay between tweets to avoid overwhelming the AI services
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          console.error(`❌ [KOL LEARNING] Error processing tweet ${tweet.id}:`, error.message);
        }
      }

      // Update KOL stats
      kol.last_monitored = new Date().toISOString();
      kol.total_posts += processedCount;
      
      console.log(`✅ [KOL LEARNING] Processed ${processedCount} new tweets from @${kol.handle} (${tweets.length} total fetched)`);
      
    } catch (error) {
      console.error(`❌ [KOL LEARNING] Error monitoring @${kol.handle}:`, error.message);
    }
  }

  /**
   * Fetch tweets for a KOL using TwitterAPI.io last_tweets endpoint
   */
  async fetchKOLTweets(handle) {
    try {
      const twitterapiioKey = process.env.TWITTERAPIIO_API_KEY;
      
      if (!twitterapiioKey) {
        console.error('❌ [KOL LEARNING] TWITTERAPIIO_API_KEY not set');
        return [];
      }

      // TwitterAPI.io last_tweets endpoint
      const url = `https://api.twitterapi.io/twitter/user/last_tweets`;
      const params = {
        username: handle.replace('@', ''), // Remove @ if present
        count: 50 // Get last 50 tweets
      };

      const queryString = new URLSearchParams(params).toString();
      const fullUrl = `${url}?${queryString}`;

      console.log(`🔍 [KOL LEARNING] Fetching tweets for @${handle} via TwitterAPI.io...`);

      const response = await axios.get(fullUrl, {
        headers: {
          'X-API-Key': twitterapiioKey
        },
        timeout: 30000
      });

      if (response.status !== 200) {
        console.error(`❌ [KOL LEARNING] TwitterAPI.io error for @${handle}: ${response.status}`);
        return [];
      }

      const data = response.data;
      const tweets = data.tweets || [];

      // Transform TwitterAPI.io format to our internal format
      const transformedTweets = tweets.map(tweet => ({
        id: tweet.id,
        text: tweet.text || '',
        created_at: tweet.createdAt || new Date().toISOString(),
        likes: tweet.likeCount || 0,
        retweets: tweet.retweetCount || 0,
        replies: tweet.replyCount || 0,
        quotes: tweet.quoteCount || 0,
        views: tweet.viewCount || 0,
        is_reply: tweet.isReply || false,
        in_reply_to_id: tweet.inReplyToId,
        in_reply_to_username: tweet.inReplyToUsername,
        url: tweet.url,
        author: {
          username: tweet.author?.userName || handle,
          name: tweet.author?.name || 'Unknown User',
          followers: tweet.author?.followers || 0,
          verified: tweet.author?.isBlueVerified || false
        },
        source: 'twitterapiio'
      }));

      console.log(`✅ [KOL LEARNING] Fetched ${transformedTweets.length} tweets for @${handle}`);
      return transformedTweets;

    } catch (error) {
      console.error(`❌ [KOL LEARNING] Error fetching tweets for @${handle}:`, error.message);
      
      // If it's a rate limit or API error, return empty array
      if (error.response?.status === 429 || error.response?.status >= 500) {
        console.log(`⏰ [KOL LEARNING] Rate limited or server error for @${handle}, skipping this cycle`);
        return [];
      }
      
      // For other errors, return empty array but don't fail completely
      return [];
    }
  }

  /**
   * Process and analyze a tweet
   */
  async processTweet(kol, tweet) {
    try {
      // Extract coins and narratives from tweet text
      const extractedData = await this.extractTweetData(tweet.text);
      
      // Detect stance
      const stance = await this.detectStance(tweet.text);
      
      // Create post record
      const post = {
        id: tweet.id,
        kol_id: kol.id,
        kol_handle: kol.handle,
        timestamp: tweet.created_at,
        platform: 'twitter',
        type: 'tweet',
        text: tweet.text,
        stance: stance.score,
        stance_confidence: stance.confidence,
        coins: extractedData.coins,
        narratives: extractedData.narratives,
        engagement: {
          likes: tweet.likes,
          retweets: tweet.retweets,
          replies: tweet.replies
        },
        processed_at: new Date().toISOString()
      };

      // Add to posts array
      this.posts.push(post);
      
      // Update relations (if this tweet mentions other KOLs)
      await this.updateRelations(kol, tweet.text);
      
      console.log(`📝 [KOL LEARNING] Processed tweet from @${kol.handle}: ${extractedData.coins.join(', ') || 'no coins'}`);
      
    } catch (error) {
      console.error(`❌ [KOL LEARNING] Error processing tweet:`, error.message);
    }
  }

  /**
   * Extract coins and narratives from tweet text
   */
  async extractTweetData(text) {
    try {
      const prompt = `Analyze this crypto tweet and extract:
1. Coin symbols mentioned (e.g., BTC, ETH, SOL, PEPE, DOGE)
2. Narratives/themes (e.g., "DeFi", "NFTs", "Layer 2", "AI tokens", "memecoins")

Tweet: "${text}"

Return JSON format:
{
  "coins": ["BTC", "ETH"],
  "narratives": ["DeFi", "Layer 2"]
}`;

      const response = await this.openaiService.generateCompletion(prompt, {
        maxTokens: 100,
        temperature: 0.1,
        model: 'gpt-4o'
      });

      const extracted = JSON.parse(response);
      return {
        coins: extracted.coins || [],
        narratives: extracted.narratives || []
      };
      
    } catch (error) {
      console.error('❌ [KOL LEARNING] Error extracting tweet data:', error.message);
      return { coins: [], narratives: [] };
    }
  }

  /**
   * Detect stance (bullish/bearish/neutral) from tweet text
   */
  async detectStance(text) {
    try {
      const prompt = `Analyze the sentiment and stance of this crypto tweet. Return a JSON object with:
- "score": number from -1 (very bearish) to +1 (very bullish), 0 is neutral
- "confidence": number from 0 to 1 indicating confidence in the stance
- "reasoning": brief explanation

Tweet: "${text}"

Consider:
- Positive words: "bullish", "moon", "pump", "buy", "long", "ape"
- Negative words: "bearish", "dump", "sell", "short", "rekt"
- Price predictions and targets
- Overall sentiment and tone

Return only valid JSON:`;

      const response = await this.openaiService.generateCompletion(prompt, {
        maxTokens: 150,
        temperature: 0.1,
        model: 'gpt-4o'
      });

      const stance = JSON.parse(response);
      return {
        score: Math.max(-1, Math.min(1, stance.score || 0)),
        confidence: Math.max(0, Math.min(1, stance.confidence || 0.5)),
        reasoning: stance.reasoning || 'No reasoning provided'
      };
      
    } catch (error) {
      console.error('❌ [KOL LEARNING] Error detecting stance:', error.message);
      return { score: 0, confidence: 0, reasoning: 'Error in analysis' };
    }
  }

  /**
   * Update KOL relations (who amplifies whom)
   */
  async updateRelations(kol, tweetText) {
    try {
      // Extract mentions of other KOLs from tweet text
      const mentions = tweetText.match(/@(\w+)/g);
      
      if (mentions && mentions.length > 0) {
        for (const mention of mentions) {
          const mentionedHandle = mention.substring(1);
          
          // Check if mentioned account is in our KOL list
          const mentionedKOL = this.kols.get(mentionedHandle);
          if (mentionedKOL) {
            const relationKey = `${kol.id}_${mentionedKOL.id}`;
            const relation = this.relations.get(relationKey) || {
              src_kol_id: kol.id,
              dst_kol_id: mentionedKOL.id,
              weight: 0,
              last_ts: new Date().toISOString(),
              mentions_count: 0
            };
            
            relation.weight += 1;
            relation.mentions_count += 1;
            relation.last_ts = new Date().toISOString();
            
            this.relations.set(relationKey, relation);
          }
        }
      }
    } catch (error) {
      console.error('❌ [KOL LEARNING] Error updating relations:', error.message);
    }
  }

  /**
   * Analyze recent activity for patterns
   */
  async analyzeRecentActivity() {
    try {
      console.log('🧠 [KOL LEARNING] Analyzing recent activity...');
      
      const recentPosts = this.posts.filter(post => {
        const postTime = new Date(post.timestamp);
        const now = new Date();
        const hoursDiff = (now - postTime) / (1000 * 60 * 60);
        return hoursDiff <= 24; // Last 24 hours
      });

      // Group by coin
      const coinActivity = new Map();
      for (const post of recentPosts) {
        for (const coin of post.coins) {
          if (!coinActivity.has(coin)) {
            coinActivity.set(coin, []);
          }
          coinActivity.get(coin).push(post);
        }
      }

      // Analyze each coin's activity
      for (const [coin, posts] of coinActivity) {
        await this.analyzeCoinActivity(coin, posts);
      }

    } catch (error) {
      console.error('❌ [KOL LEARNING] Error analyzing recent activity:', error.message);
    }
  }

  /**
   * Analyze activity for a specific coin
   */
  async analyzeCoinActivity(coin, posts) {
    try {
      const mentionCount = posts.length;
      const uniqueKOLs = new Set(posts.map(p => p.kol_id)).size;
      const avgStance = posts.reduce((sum, p) => sum + p.stance, 0) / posts.length;
      
      // Calculate velocity (mentions per hour)
      const now = new Date();
      const oldestPost = new Date(Math.min(...posts.map(p => new Date(p.timestamp))));
      const hoursSpan = Math.max(1, (now - oldestPost) / (1000 * 60 * 60));
      const velocity = mentionCount / hoursSpan;

      // Create signal
      const signal = {
        asset_symbol: coin,
        timestamp: new Date().toISOString(),
        mention_count: mentionCount,
        unique_kols: uniqueKOLs,
        stance_score: avgStance,
        velocity: velocity,
        share_of_voice: mentionCount / this.posts.length * 100, // Percentage of total posts
        confidence: Math.min(1, uniqueKOLs / this.kols.size), // Confidence based on KOL coverage
        posts: posts.map(p => ({
          kol_handle: p.kol_handle,
          stance: p.stance,
          engagement: p.engagement
        }))
      };

      const signalKey = `${coin}_${signal.timestamp}`;
      this.signals.set(signalKey, signal);

      console.log(`📊 [KOL LEARNING] ${coin}: ${mentionCount} mentions, ${uniqueKOLs} KOLs, stance ${avgStance.toFixed(2)}, velocity ${velocity.toFixed(2)}`);
      
    } catch (error) {
      console.error(`❌ [KOL LEARNING] Error analyzing ${coin} activity:`, error.message);
    }
  }

  /**
   * Update signals with market data correlation
   */
  async updateSignals() {
    try {
      console.log('📈 [KOL LEARNING] Updating signals with market correlation...');
      
      // This would fetch real market data and correlate with KOL mentions
      // For now, we'll simulate the process
      
      for (const [signalKey, signal] of this.signals) {
        // Add market correlation data
        signal.market_correlation = {
          price_change_1h: (Math.random() - 0.5) * 10, // Simulated
          volume_change_1h: (Math.random() - 0.5) * 50, // Simulated
          correlation_strength: Math.random() * 0.8 + 0.2 // 0.2 to 1.0
        };
        
        // Calculate alpha lead (how early KOLs were vs price movement)
        signal.alpha_lead_minutes = Math.floor(Math.random() * 120) + 10; // 10-130 minutes
        
        // Update signal
        this.signals.set(signalKey, signal);
      }
      
    } catch (error) {
      console.error('❌ [KOL LEARNING] Error updating signals:', error.message);
    }
  }

  /**
   * Generate dashboard data
   */
  async getDashboardData(windowHours = 24) {
    try {
      const cutoffTime = new Date(Date.now() - windowHours * 60 * 60 * 1000);
      
      // Filter recent posts
      const recentPosts = this.posts.filter(post => new Date(post.timestamp) >= cutoffTime);
      
      // Generate heatmap data
      const heatmap = this.generateHeatmapData(recentPosts);
      
      // Generate momentum data
      const momentum = this.generateMomentumData(recentPosts);
      
      // Generate KOL leaderboard
      const leaderboard = this.generateKOLLeaderboard(recentPosts);
      
      // Generate signals
      const signals = this.generateSignalsData(windowHours);
      
      return {
        heatmap,
        momentum,
        leaderboard,
        signals,
        metadata: {
          window_hours: windowHours,
          total_posts: recentPosts.length,
          total_kols: this.kols.size,
          last_updated: new Date().toISOString()
        }
      };
      
    } catch (error) {
      console.error('❌ [KOL LEARNING] Error generating dashboard data:', error.message);
      return null;
    }
  }

  /**
   * Generate heatmap data (KOL × Coin matrix)
   */
  generateHeatmapData(posts) {
    const matrix = new Map();
    
    for (const post of posts) {
      for (const coin of post.coins) {
        const key = `${post.kol_handle}_${coin}`;
        const cell = matrix.get(key) || {
          kol: post.kol_handle,
          coin: coin,
          mentions: 0,
          engagement: 0,
          stance: 0,
          velocity: 0
        };
        
        cell.mentions += 1;
        cell.engagement += (post.engagement.likes + post.engagement.retweets * 2 + post.engagement.replies);
        cell.stance += post.stance;
        cell.velocity += 1;
        
        matrix.set(key, cell);
      }
    }
    
    // Normalize stance and calculate composite score
    const result = [];
    for (const [key, cell] of matrix) {
      cell.stance = cell.stance / cell.mentions; // Average stance
      cell.score = cell.velocity * 60 + cell.engagement * 0.3 + Math.max(0, cell.stance) * 10;
      result.push(cell);
    }
    
    return result;
  }

  /**
   * Generate momentum data (top rising coins)
   */
  generateMomentumData(posts) {
    const coinStats = new Map();
    
    for (const post of posts) {
      for (const coin of post.coins) {
        const stats = coinStats.get(coin) || {
          coin: coin,
          breadth: 0,
          velocity: 0,
          stance: 0,
          engagement: 0
        };
        
        stats.breadth += 1;
        stats.velocity += 1;
        stats.stance += post.stance;
        stats.engagement += (post.engagement.likes + post.engagement.retweets + post.engagement.replies);
        
        coinStats.set(coin, stats);
      }
    }
    
    // Calculate momentum score
    const result = [];
    for (const [coin, stats] of coinStats) {
      stats.stance = stats.stance / stats.breadth; // Average stance
      stats.score = stats.breadth * 20 + stats.velocity * 120 + Math.max(0, stats.stance) * 10;
      result.push(stats);
    }
    
    return result.sort((a, b) => b.score - a.score).slice(0, 10);
  }

  /**
   * Generate KOL leaderboard
   */
  generateKOLLeaderboard(posts) {
    const kolStats = new Map();
    
    for (const post of posts) {
      const stats = kolStats.get(post.kol_handle) || {
        kol: post.kol_handle,
        total_posts: 0,
        total_engagement: 0,
        avg_stance: 0,
        coins_mentioned: new Set(),
        hrs: 0
      };
      
      stats.total_posts += 1;
      stats.total_engagement += (post.engagement.likes + post.engagement.retweets + post.engagement.replies);
      stats.avg_stance += post.stance;
      post.coins.forEach(coin => stats.coins_mentioned.add(coin));
      
      kolStats.set(post.kol_handle, stats);
    }
    
    // Calculate HRS (Hype Reliability Score)
    const result = [];
    for (const [kol, stats] of kolStats) {
      stats.avg_stance = stats.avg_stance / stats.total_posts;
      stats.coins_mentioned = stats.coins_mentioned.size;
      stats.hrs = (stats.total_engagement / stats.total_posts) * 0.3 + 
                  stats.coins_mentioned * 0.2 + 
                  Math.max(0, stats.avg_stance) * 10;
      result.push(stats);
    }
    
    return result.sort((a, b) => b.hrs - a.hrs);
  }

  /**
   * Generate signals data
   */
  generateSignalsData(windowHours) {
    const cutoffTime = new Date(Date.now() - windowHours * 60 * 60 * 1000);
    
    return Array.from(this.signals.values())
      .filter(signal => new Date(signal.timestamp) >= cutoffTime)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 50); // Last 50 signals
  }

  /**
   * Utility: Generate unique ID
   */
  generateId() {
    return `kol_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

export default KOLMarketLearningService;
