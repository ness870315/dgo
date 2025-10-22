import fs from 'fs/promises';
import path from 'path';
import PredictionExtractionService from './PredictionExtractionService.js';
import PredictionTrackingDatabase from './PredictionTrackingDatabase.js';
import PriceMonitoringService from './PriceMonitoringService.js';

/**
 * Crypto Tracking Database
 * Intelligent storage and retrieval for tracked crypto tweets
 * 
 * Features:
 * - Intelligent data structure with topics, entities, sentiment
 * - Advanced search and filtering capabilities
 * - Sentiment trend analysis
 * - Prediction tracking
 * - Account performance metrics
 */
class CryptoTrackingDatabase {
  constructor() {
    // Storage configuration
    this.storageDir = process.env.DATA_DIR 
      ? path.join(process.env.DATA_DIR, 'crypto-tracking-db')
      : path.join(process.cwd(), 'data', 'crypto-tracking-db');
    
    this.trackedTweets = [];
    this.accounts = [];
    this.sentimentTrends = [];
    this.savingInProgress = false;
    
    // Database files
    this.tweetsFile = path.join(this.storageDir, 'tracked-tweets.json');
    this.accountsFile = path.join(this.storageDir, 'accounts.json');
    this.trendsFile = path.join(this.storageDir, 'sentiment-trends.json');
    
    // Initialize prediction tracking services
    this.predictionExtractor = new PredictionExtractionService();
    this.predictionDatabase = new PredictionTrackingDatabase();
    this.priceMonitor = new PriceMonitoringService();
    
    this.initializeDatabase();
  }

  async initializeDatabase() {
    try {
      await fs.mkdir(this.storageDir, { recursive: true });
      await this.loadData();
      console.log(`📁 [CRYPTO DB] Database initialized: ${this.storageDir}`);
    } catch (error) {
      console.error('❌ [CRYPTO DB] Failed to initialize database:', error.message);
    }
  }

  /**
   * Store a tracked tweet with intelligent features
   */
  async storeTrackedTweet(tweetData) {
    try {
      // Check for duplicate tweets to prevent multiple storage
      const existingTweet = this.trackedTweets.find(tweet => 
        tweet.tweetId === tweetData.tweetId || 
        (tweet.text === tweetData.text && tweet.author.username === tweetData.author.username)
      );
      
      if (existingTweet) {
        console.log(`⚠️ [CRYPTO DB] Duplicate tweet detected, skipping storage: ${tweetData.text.substring(0, 50)}...`);
        return;
      }
      
      const intelligenceFeatures = await this.extractIntelligenceFeatures(tweetData);
      
      // 🎯 Extract predictions from tweet
      const predictions = this.predictionExtractor.extractPredictions(tweetData.text, {
        tweetId: tweetData.id,
        author: tweetData.author,
        timestamp: tweetData.timestamp
      });

      // Store predictions in prediction database
      if (predictions && predictions.length > 0) {
        for (const prediction of predictions) {
          await this.predictionDatabase.storePrediction(prediction);
        }
        console.log(`🎯 [CRYPTO DB] Extracted ${predictions.length} predictions from tweet`);
      }
      
      const trackedTweet = {
        id: `tracked_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        tweetId: tweetData.id,
        text: tweetData.text,
        author: tweetData.author,
        timestamp: tweetData.timestamp,
        engagement: tweetData.engagement,
        url: tweetData.url,
        ruleTag: tweetData.ruleTag,
        storedAt: new Date().toISOString(),
        
        // 🧠 Intelligence features
        topics: intelligenceFeatures.topics || [],
        entities: intelligenceFeatures.entities || {},
        sentiment: intelligenceFeatures.sentiment || 'neutral',
        confidence: intelligenceFeatures.confidence || 0.5,
        timeframe: intelligenceFeatures.timeframe || 'unknown',
        predictions: predictions || [], // Store extracted predictions
        cryptoKeywords: intelligenceFeatures.cryptoKeywords || [],
        
        // 📊 Analysis features
        marketContext: intelligenceFeatures.marketContext || 'general',
        predictionAccuracy: null, // Will be updated later
        influenceScore: this.calculateInfluenceScore(tweetData.engagement),
        viralityScore: this.calculateViralityScore(tweetData.engagement),
        
        // 🔗 Relationships
        relatedTweets: [],
        conversationThread: null,
        replyTo: null
      };
      
      // Atomic operation: add to array and save atomically
      const currentTweets = [...this.trackedTweets]; // Create a copy
      const tempTweets = [...currentTweets, trackedTweet];
      
      console.log(`🔍 [CRYPTO DB] Before save: ${currentTweets.length} tweets, adding 1 more`);
      
      await this.saveDataAtomic(tempTweets);
      
      // Only update in-memory array after successful save
      this.trackedTweets = tempTweets;
      
      console.log(`💾 [CRYPTO DB] Stored tracked tweet #${this.trackedTweets.length}:`, {
        id: trackedTweet.id,
        author: trackedTweet.author.username,
        sentiment: trackedTweet.sentiment,
        topics: trackedTweet.topics.slice(0, 3),
        confidence: trackedTweet.confidence,
        preview: trackedTweet.text.substring(0, 60) + '...'
      });
      
      return trackedTweet;
      
    } catch (error) {
      console.error('❌ [CRYPTO DB] Store error:', error.message);
      return null;
    }
  }

  /**
   * Extract intelligence features from tweet data
   */
  async extractIntelligenceFeatures(tweetData) {
    try {
      const text = tweetData.text.toLowerCase();
      
      const features = {
        topics: this.extractTopics(text),
        entities: this.extractEntities(text),
        sentiment: this.classifySentiment(text),
        confidence: this.calculateConfidence(text),
        timeframe: this.determineTimeframe(text),
        predictions: this.extractPredictions(text),
        cryptoKeywords: this.extractCryptoKeywords(text),
        marketContext: this.determineMarketContext(text)
      };
      
      return features;
      
    } catch (error) {
      console.error('❌ [CRYPTO DB] Intelligence extraction error:', error.message);
      return {
        topics: [], entities: {}, sentiment: 'neutral', confidence: 0.5,
        timeframe: 'unknown', predictions: [], cryptoKeywords: [], marketContext: 'general'
      };
    }
  }

  /**
   * Extract crypto topics from text
   */
  extractTopics(text) {
    const topics = [];
    
    // Market sentiment topics
    if (text.includes('bull') || text.includes('bullish') || text.includes('moon')) {
      topics.push('bullish-sentiment');
    }
    if (text.includes('bear') || text.includes('bearish') || text.includes('dump')) {
      topics.push('bearish-sentiment');
    }
    if (text.includes('correction') || text.includes('crash')) {
      topics.push('market-correction');
    }
    if (text.includes('rally') || text.includes('pump')) {
      topics.push('market-rally');
    }
    
    // Technology topics
    if (text.includes('bitcoin') || text.includes('btc')) {
      topics.push('bitcoin');
    }
    if (text.includes('ethereum') || text.includes('eth')) {
      topics.push('ethereum');
    }
    if (text.includes('defi')) {
      topics.push('defi');
    }
    if (text.includes('nft')) {
      topics.push('nft');
    }
    if (text.includes('web3')) {
      topics.push('web3');
    }
    if (text.includes('solana') || text.includes('sol')) {
      topics.push('solana');
    }
    
    // Market topics
    if (text.includes('trading') || text.includes('trade')) {
      topics.push('trading');
    }
    if (text.includes('hodl') || text.includes('hold')) {
      topics.push('hodling');
    }
    if (text.includes('whale')) {
      topics.push('whale-activity');
    }
    if (text.includes('institutional')) {
      topics.push('institutional-adoption');
    }
    
    // Regulatory topics
    if (text.includes('regulation') || text.includes('regulatory')) {
      topics.push('regulation');
    }
    if (text.includes('sec') || text.includes('sec')) {
      topics.push('sec-regulation');
    }
    
    return topics;
  }

  /**
   * Extract crypto entities from text
   */
  extractEntities(text) {
    const entities = {
      tokens: [],
      protocols: [],
      exchanges: [],
      amounts: [],
      percentages: [],
      dates: []
    };
    
    // Token symbols (2-5 uppercase letters)
    const tokenPattern = /\b[A-Z]{2,5}\b/g;
    const tokens = text.match(tokenPattern) || [];
    entities.tokens = [...new Set(tokens)];
    
    // Amounts (prices, market caps)
    const amountPattern = /\$[\d,]+(?:\.\d+)?[kmb]?/gi;
    entities.amounts = text.match(amountPattern) || [];
    
    // Percentages
    const percentPattern = /\d+(?:\.\d+)?%/g;
    entities.percentages = text.match(percentPattern) || [];
    
    // Dates
    const datePattern = /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{1,2}\b/gi;
    entities.dates = text.match(datePattern) || [];
    
    return entities;
  }

  /**
   * Classify sentiment of crypto content
   */
  classifySentiment(text) {
    const bullishWords = ['bull', 'bullish', 'moon', 'pump', 'rally', 'hodl', 'diamond hands', 'buy', 'long', 'green'];
    const bearishWords = ['bear', 'bearish', 'dump', 'crash', 'correction', 'sell', 'short', 'fud', 'red'];
    
    const bullishCount = bullishWords.filter(word => text.includes(word)).length;
    const bearishCount = bearishWords.filter(word => text.includes(word)).length;
    
    if (bullishCount > bearishCount) return 'bullish';
    if (bearishCount > bullishCount) return 'bearish';
    return 'neutral';
  }

  /**
   * Calculate confidence score
   */
  calculateConfidence(text) {
    let confidence = 0.5; // Base confidence
    
    // More crypto keywords = higher confidence
    const cryptoKeywords = ['bitcoin', 'ethereum', 'crypto', 'blockchain', 'defi', 'nft', 'web3'];
    const keywordCount = cryptoKeywords.filter(keyword => text.includes(keyword)).length;
    confidence += Math.min(keywordCount * 0.1, 0.3);
    
    // Longer text = higher confidence (more context)
    confidence += Math.min(text.length / 1000, 0.2);
    
    return Math.min(confidence, 1.0);
  }

  /**
   * Determine timeframe mentioned
   */
  determineTimeframe(text) {
    if (text.includes('today') || text.includes('now') || text.includes('current')) {
      return 'immediate';
    }
    if (text.includes('this week') || text.includes('weekly')) {
      return 'short-term';
    }
    if (text.includes('this month') || text.includes('monthly')) {
      return 'medium-term';
    }
    if (text.includes('this year') || text.includes('yearly') || text.includes('long term')) {
      return 'long-term';
    }
    return 'unknown';
  }

  /**
   * Extract predictions from text
   */
  extractPredictions(text) {
    const predictions = [];
    
    // Look for prediction patterns
    const predictionPatterns = [
      /will (?:go|reach|hit) \$[\d,]+/gi,
      /going to (?:go|reach|hit) \$[\d,]+/gi,
      /expect.*\$[\d,]+/gi,
      /target.*\$[\d,]+/gi,
      /predict.*\$[\d,]+/gi
    ];
    
    predictionPatterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) {
        predictions.push(...matches);
      }
    });
    
    return predictions;
  }

  /**
   * Extract crypto keywords
   */
  extractCryptoKeywords(text) {
    const cryptoKeywords = [
      'bitcoin', 'btc', 'ethereum', 'eth', 'crypto', 'cryptocurrency',
      'blockchain', 'defi', 'nft', 'web3', 'solana', 'sol', 'binance',
      'coinbase', 'metamask', 'wallet', 'trading', 'hodl', 'moon',
      'altcoin', 'token', 'protocol', 'yield', 'staking', 'mining',
      'bull', 'bear', 'pump', 'dump', 'fomo', 'fud', 'diamond hands',
      'whale', 'dip', 'rally', 'correction', 'bubble', 'adoption'
    ];
    
    return cryptoKeywords.filter(keyword => text.includes(keyword.toLowerCase()));
  }

  /**
   * Determine market context
   */
  determineMarketContext(text) {
    if (text.includes('macro') || text.includes('economy') || text.includes('inflation')) {
      return 'macro-economic';
    }
    if (text.includes('technical') || text.includes('chart') || text.includes('ta')) {
      return 'technical-analysis';
    }
    if (text.includes('fundamental') || text.includes('adoption') || text.includes('utility')) {
      return 'fundamental-analysis';
    }
    if (text.includes('news') || text.includes('announcement') || text.includes('update')) {
      return 'news-event';
    }
    return 'general';
  }

  /**
   * Calculate influence score based on engagement
   */
  calculateInfluenceScore(engagement) {
    const { likes, retweets, replyCount, quoteTweets } = engagement;
    const totalEngagement = likes + (retweets * 2) + (replyCount * 3) + (quoteTweets * 4);
    return Math.min(totalEngagement / 1000, 1.0); // Normalize to 0-1
  }

  /**
   * Calculate virality score
   */
  calculateViralityScore(engagement) {
    const { likes, retweets } = engagement;
    const viralityRatio = retweets / Math.max(likes, 1);
    return Math.min(viralityRatio, 1.0);
  }

  /**
   * Search tracked tweets by multiple criteria
   */
  searchTrackedTweets(criteria) {
    let results = [...this.trackedTweets];
    
    // Filter by sentiment
    if (criteria.sentiment) {
      results = results.filter(tweet => tweet.sentiment === criteria.sentiment);
    }
    
    // Filter by topics
    if (criteria.topics && criteria.topics.length > 0) {
      results = results.filter(tweet => 
        criteria.topics.some(topic => tweet.topics.includes(topic))
      );
    }
    
    // Filter by author
    if (criteria.author) {
      results = results.filter(tweet => 
        tweet.author.username.toLowerCase().includes(criteria.author.toLowerCase())
      );
    }
    
    // Filter by timeframe
    if (criteria.timeframe) {
      results = results.filter(tweet => tweet.timeframe === criteria.timeframe);
    }
    
    // Filter by confidence threshold
    if (criteria.minConfidence) {
      results = results.filter(tweet => tweet.confidence >= criteria.minConfidence);
    }
    
    // Filter by date range
    if (criteria.startDate) {
      results = results.filter(tweet => new Date(tweet.timestamp) >= new Date(criteria.startDate));
    }
    if (criteria.endDate) {
      results = results.filter(tweet => new Date(tweet.timestamp) <= new Date(criteria.endDate));
    }
    
    // Sort by timestamp (newest first)
    results.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    // Limit results
    if (criteria.limit) {
      results = results.slice(0, criteria.limit);
    }
    
    return results;
  }

  /**
   * Get sentiment trends over time
   */
  getSentimentTrends(days = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    const recentTweets = this.trackedTweets.filter(tweet => 
      new Date(tweet.timestamp) >= cutoffDate
    );
    
    const trends = {};
    recentTweets.forEach(tweet => {
      const date = tweet.timestamp.split('T')[0]; // Get date part only
      if (!trends[date]) {
        trends[date] = { bullish: 0, bearish: 0, neutral: 0, total: 0 };
      }
      trends[date][tweet.sentiment]++;
      trends[date].total++;
    });
    
    return trends;
  }

  /**
   * Get account performance metrics
   */
  getAccountMetrics(username) {
    const accountTweets = this.trackedTweets.filter(tweet => 
      tweet.author?.username?.toLowerCase() === username.toLowerCase()
    );
    
    if (accountTweets.length === 0) {
      return {
        username,
        totalTweets: 0,
        sentimentCounts: { positive: 0, negative: 0, neutral: 0 },
        avgConfidence: 0,
        avgInfluence: 0,
        topTopics: [],
        avgVirality: 0,
        lastActivity: null
      };
    }
    
    const sentimentCounts = accountTweets.reduce((acc, tweet) => {
      acc[tweet.sentiment] = (acc[tweet.sentiment] || 0) + 1;
      return acc;
    }, {});
    
    const avgConfidence = accountTweets.reduce((sum, tweet) => sum + tweet.confidence, 0) / accountTweets.length;
    const avgInfluence = accountTweets.reduce((sum, tweet) => sum + tweet.influenceScore, 0) / accountTweets.length;
    
    const topTopics = accountTweets.reduce((acc, tweet) => {
      tweet.topics.forEach(topic => {
        acc[topic] = (acc[topic] || 0) + 1;
      });
      return acc;
    }, {});
    
    return {
      username,
      totalTweets: accountTweets.length,
      sentimentCounts,
      avgConfidence,
      avgInfluence,
      topTopics: Object.entries(topTopics)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10)
        .map(([topic, count]) => ({ topic, count })),
      firstTweet: accountTweets[accountTweets.length - 1]?.timestamp,
      lastTweet: accountTweets[0]?.timestamp
    };
  }

  /**
   * Get prediction accuracy metrics
   */
  getPredictionAccuracy() {
    const tweetsWithPredictions = this.trackedTweets.filter(tweet => 
      tweet.predictions && tweet.predictions.length > 0
    );
    
    // This would need to be implemented with actual price data
    // For now, return basic structure
    return {
      totalPredictions: tweetsWithPredictions.length,
      accuracyRate: 0, // Would need price data to calculate
      predictions: tweetsWithPredictions.map(tweet => ({
        id: tweet.id,
        author: tweet.author.username,
        predictions: tweet.predictions,
        timestamp: tweet.timestamp,
        accuracy: null // Would need price data
      }))
    };
  }

  /**
   * Get database statistics
   */
  getStats() {
    const totalTweets = this.trackedTweets.length;
    
    // Debug: Check author structure
    console.log('🔍 [CRYPTO DB] Debugging author structure:');
    this.trackedTweets.slice(0, 3).forEach((tweet, index) => {
      console.log(`Tweet ${index}:`, {
        author: tweet.author,
        authorType: typeof tweet.author,
        hasUsername: tweet.author?.username ? 'YES' : 'NO'
      });
    });
    
    const uniqueAccounts = new Set(this.trackedTweets.map(tweet => {
      // Handle both string and object author formats
      if (typeof tweet.author === 'string') {
        return tweet.author;
      } else if (tweet.author && typeof tweet.author === 'object') {
        return tweet.author.username || tweet.author;
      }
      return 'unknown';
    })).size;
    
    const sentimentCounts = this.trackedTweets.reduce((acc, tweet) => {
      acc[tweet.sentiment] = (acc[tweet.sentiment] || 0) + 1;
      return acc;
    }, {});
    
    const topicCounts = this.trackedTweets.reduce((acc, tweet) => {
      tweet.topics.forEach(topic => {
        acc[topic] = (acc[topic] || 0) + 1;
      });
      return acc;
    }, {});
    
    const avgConfidence = this.trackedTweets.reduce((sum, tweet) => sum + tweet.confidence, 0) / Math.max(totalTweets, 1);
    
    return {
      totalTweets,
      uniqueAccounts,
      sentimentCounts,
      topTopics: Object.entries(topicCounts)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10)
        .map(([topic, count]) => ({ topic, count })),
      avgConfidence,
      firstTweet: this.trackedTweets[this.trackedTweets.length - 1]?.timestamp,
      lastTweet: this.trackedTweets[0]?.timestamp,
      databaseSize: `${(JSON.stringify(this.trackedTweets).length / 1024 / 1024).toFixed(2)} MB`
    };
  }

  /**
   * Save database to disk
   */
  /**
   * Ensure storage directory exists
   */
  async ensureStorageDir() {
    try {
      await fs.mkdir(this.storageDir, { recursive: true });
      console.log(`📁 [CRYPTO DB] Ensured directory exists: ${this.storageDir}`);
    } catch (error) {
      console.error('❌ [CRYPTO DB] Failed to create storage directory:', error.message);
      throw error;
    }
  }

  /**
   * Atomic save operation - prevents data loss during writes
   */
  async saveDataAtomic(tweetsToSave) {
    // Use a simple mutex to prevent concurrent saves
    if (this.savingInProgress) {
      console.log('⏳ [CRYPTO DB] Save already in progress, skipping...');
      return;
    }
    
    this.savingInProgress = true;
    
    try {
      // Ensure directory exists before saving
      await this.ensureStorageDir();
      
      // Verify directory actually exists
      try {
        await fs.access(this.storageDir);
        console.log(`✅ [CRYPTO DB] Directory verified: ${this.storageDir}`);
      } catch (error) {
        console.error(`❌ [CRYPTO DB] Directory verification failed: ${this.storageDir}`);
        throw new Error(`Directory does not exist: ${this.storageDir}`);
      }
      
      const tweetsData = {
        tweets: tweetsToSave,
        lastSaved: new Date().toISOString(),
        totalTweets: tweetsToSave.length
      };
      
      // Write to temporary file first, then rename (atomic operation)
      const tempFile = this.tweetsFile + '.tmp';
      await fs.writeFile(tempFile, JSON.stringify(tweetsData, null, 2));
      
      // Verify temp file was created
      try {
        await fs.access(tempFile);
        console.log(`✅ [CRYPTO DB] Temp file created: ${tempFile}`);
      } catch (error) {
        throw new Error(`Failed to create temp file: ${tempFile}`);
      }
      
      // Ensure target directory exists before rename
      await this.ensureStorageDir();
      
      // Double-check directory exists before rename
      try {
        await fs.access(this.storageDir);
        console.log(`✅ [CRYPTO DB] Directory confirmed: ${this.storageDir}`);
      } catch (error) {
        console.error(`❌ [CRYPTO DB] Directory missing before rename: ${this.storageDir}`);
        await this.ensureStorageDir();
      }
      
      await fs.rename(tempFile, this.tweetsFile);
      console.log(`💾 [CRYPTO DB] Data saved atomically (${tweetsToSave.length} tweets)`);
      
      // Create backup of successful save
      await this.createBackup();
      
    } catch (error) {
      console.error('❌ [CRYPTO DB] Failed to save data atomically:', error.message);
      throw error; // Re-throw to prevent in-memory update on failure
    } finally {
      this.savingInProgress = false;
    }
  }

  async saveData() {
    try {
      // Ensure directory exists before saving
      await this.ensureStorageDir();
      
      const tweetsData = {
        tweets: this.trackedTweets,
        lastSaved: new Date().toISOString(),
        totalTweets: this.trackedTweets.length
      };
      
      await fs.writeFile(this.tweetsFile, JSON.stringify(tweetsData, null, 2));
      console.log(`💾 [CRYPTO DB] Data saved (${this.trackedTweets.length} tweets)`);
      
    } catch (error) {
      console.error('❌ [CRYPTO DB] Failed to save data:', error.message);
    }
  }

  /**
   * Load database from disk
   */
  async loadData() {
    try {
      // Ensure directory exists before loading
      await this.ensureStorageDir();
      
      const data = await fs.readFile(this.tweetsFile, 'utf8');
      const tweetsData = JSON.parse(data);
      
      this.trackedTweets = tweetsData.tweets || [];
      
      console.log(`📂 [CRYPTO DB] Data loaded (${this.trackedTweets.length} tweets)`);
      
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('ℹ️ [CRYPTO DB] No existing data found, starting fresh');
        this.trackedTweets = [];
      } else if (error instanceof SyntaxError) {
        console.error('❌ [CRYPTO DB] Corrupted JSON file detected, attempting recovery...');
        await this.attemptDataRecovery();
      } else {
        console.error('❌ [CRYPTO DB] Error loading data:', error.message);
        this.trackedTweets = [];
      }
    }
  }

  /**
   * Create backup of current data
   */
  async createBackup() {
    try {
      const backupFile = this.tweetsFile + '.backup';
      await fs.copyFile(this.tweetsFile, backupFile);
      console.log(`💾 [CRYPTO DB] Backup created: ${backupFile}`);
    } catch (error) {
      console.log('⚠️ [CRYPTO DB] Could not create backup:', error.message);
    }
  }

  /**
   * Attempt to recover from corrupted JSON file
   */
  async attemptDataRecovery() {
    try {
      console.log('🔧 [CRYPTO DB] Attempting data recovery...');
      
      // First try to use backup file if it exists
      const backupFile = this.tweetsFile + '.backup';
      try {
        const backupData = await fs.readFile(backupFile, 'utf8');
        const backupTweets = JSON.parse(backupData);
        if (backupTweets.tweets && backupTweets.tweets.length > 0) {
          console.log(`✅ [CRYPTO DB] Recovered ${backupTweets.tweets.length} tweets from backup`);
          this.trackedTweets = backupTweets.tweets;
          await this.saveDataAtomic(backupTweets.tweets);
          return;
        }
      } catch (backupError) {
        console.log('⚠️ [CRYPTO DB] Backup file not available or corrupted');
      }
      
      // Try to read the corrupted file and extract valid JSON parts
      const data = await fs.readFile(this.tweetsFile, 'utf8');
      
      // Look for the last complete tweet object
      const lines = data.split('\n');
      let validTweets = [];
      let currentTweet = '';
      let braceCount = 0;
      
      for (const line of lines) {
        currentTweet += line + '\n';
        
        // Count braces to find complete objects
        for (const char of line) {
          if (char === '{') braceCount++;
          if (char === '}') braceCount--;
        }
        
        // If we have a complete object, try to parse it
        if (braceCount === 0 && currentTweet.trim()) {
          try {
            const tweet = JSON.parse(currentTweet.trim());
            if (tweet.id && tweet.text) {
              validTweets.push(tweet);
            }
          } catch (parseError) {
            // Skip invalid objects
          }
          currentTweet = '';
        }
      }
      
      if (validTweets.length > 0) {
        console.log(`✅ [CRYPTO DB] Recovered ${validTweets.length} tweets from corrupted file`);
        this.trackedTweets = validTweets;
        
        // Save the recovered data
        await this.saveDataAtomic(validTweets);
      } else {
        console.log('⚠️ [CRYPTO DB] No valid tweets found in corrupted file, starting fresh');
        this.trackedTweets = [];
      }
      
    } catch (recoveryError) {
      console.error('❌ [CRYPTO DB] Data recovery failed:', recoveryError.message);
      console.log('🔄 [CRYPTO DB] Starting with empty database');
      this.trackedTweets = [];
    }
  }

  /**
   * Permanently clear all tweets and reset the database
   */
  async clearAllData() {
    try {
      console.log('🗑️ [CRYPTO DB] Clearing all tweets and resetting database...');
      
      const originalCount = this.trackedTweets.length;
      
      // Clear all data
      this.trackedTweets = [];
      this.topicFrequency.clear();
      this.sentimentCounts = { positive: 0, negative: 0, neutral: 0 };
      this.totalEngagement = 0;
      
      // Save empty database
      await this.saveDataAtomic(this.trackedTweets);
      
      console.log(`🗑️ [CRYPTO DB] Cleared ${originalCount} tweets, database reset`);
      
      return { 
        tweetsCleared: originalCount, 
        message: `Successfully cleared ${originalCount} tweets and reset database` 
      };
    } catch (error) {
      console.error('❌ [CRYPTO DB] Error clearing all data:', error.message);
      throw error;
    }
  }

  /**
   * Clean up duplicate tweets from the database
   */
  async cleanupDuplicates() {
    try {
      console.log('🧹 [CRYPTO DB] Starting duplicate cleanup...');
      
      const uniqueTweets = [];
      const seenTweets = new Set();
      let duplicatesRemoved = 0;
      
      for (const tweet of this.trackedTweets) {
        const tweetKey = `${tweet.tweetId || tweet.text}_${tweet.author.username}`;
        
        if (seenTweets.has(tweetKey)) {
          duplicatesRemoved++;
          console.log(`🗑️ [CRYPTO DB] Removing duplicate: ${tweet.text.substring(0, 50)}...`);
        } else {
          seenTweets.add(tweetKey);
          uniqueTweets.push(tweet);
        }
      }
      
      if (duplicatesRemoved > 0) {
        console.log(`🧹 [CRYPTO DB] Removed ${duplicatesRemoved} duplicate tweets`);
        this.trackedTweets = uniqueTweets;
        await this.saveDataAtomic(this.trackedTweets);
        console.log(`✅ [CRYPTO DB] Cleanup completed, ${uniqueTweets.length} unique tweets remaining`);
      } else {
        console.log('✅ [CRYPTO DB] No duplicates found');
      }
      
      return { duplicatesRemoved, uniqueTweets: uniqueTweets.length };
    } catch (error) {
      console.error('❌ [CRYPTO DB] Error during cleanup:', error.message);
      throw error;
    }
  }

  /**
   * Get tweets by timeframe for topic analysis
   */
  async getTweetsByTimeframe(timeframe) {
    try {
      const now = new Date();
      let cutoffDate;

      // Parse timeframe
      if (timeframe === '1d') {
        cutoffDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      } else if (timeframe === '7d') {
        cutoffDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      } else if (timeframe === '30d') {
        cutoffDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      } else if (timeframe === '90d') {
        cutoffDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      } else {
        // Default to 7 days
        cutoffDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      }

      // Filter tweets by timeframe
      const filteredTweets = this.trackedTweets.filter(tweet => {
        const tweetDate = new Date(tweet.timestamp);
        return tweetDate >= cutoffDate;
      });

      console.log(`📊 [CRYPTO DB] Retrieved ${filteredTweets.length} tweets for timeframe: ${timeframe}`);
      
      return filteredTweets;

    } catch (error) {
      console.error('❌ [CRYPTO DB] Error getting tweets by timeframe:', error.message);
      return [];
    }
  }
}

export default CryptoTrackingDatabase;
