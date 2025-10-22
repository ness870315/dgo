import fs from 'fs/promises';
import path from 'path';

/**
 * CT (Crypto Twitter) Momentum Database
 * Tracks and aggregates cashtag ($TOKEN) mentions from tracked tweets
 * 
 * Features:
 * - Store cashtag mentions with author, sentiment, timestamp
 * - Aggregate momentum scores for tokens
 * - Track trending tokens over time
 * - Provide real-time momentum rankings
 * - Historical momentum data
 */
class CTMomentumDatabase {
  constructor() {
    // Storage configuration
    this.storageDir = process.env.DATA_DIR 
      ? path.join(process.env.DATA_DIR, 'ct-momentum-db')
      : path.join(process.cwd(), 'data', 'ct-momentum-db');
    
    this.cashtagMentions = []; // All cashtag mentions
    this.momentumCache = null; // Cached momentum rankings
    this.lastCacheUpdate = null;
    this.cacheValidityMs = 5 * 60 * 1000; // 5 minutes
    
    // Database files
    this.mentionsFile = path.join(this.storageDir, 'cashtag-mentions.json');
    this.momentumFile = path.join(this.storageDir, 'momentum-rankings.json');
    
    this.initializeDatabase();
  }

  async initializeDatabase() {
    try {
      await fs.mkdir(this.storageDir, { recursive: true });
      await this.loadData();
      console.log(`💰 [CT MOMENTUM DB] Database initialized: ${this.storageDir}`);
    } catch (error) {
      console.error('❌ [CT MOMENTUM DB] Failed to initialize database:', error.message);
    }
  }

  /**
   * Store a cashtag mention from a tweet
   */
  async storeCashtagMention(cashtagData, tweetData) {
    try {
      const mention = {
        id: `${tweetData.tweetId}_${cashtagData.symbol}`,
        symbol: cashtagData.symbol,
        rawSymbol: cashtagData.rawSymbol,
        sentiment: cashtagData.sentiment,
        context: cashtagData.context,
        author: tweetData.author.username,
        authorDisplayName: tweetData.author.displayName,
        tweetId: tweetData.tweetId,
        tweetText: tweetData.text,
        timestamp: tweetData.timestamp,
        engagement: tweetData.engagement,
        storedAt: new Date().toISOString()
      };

      // Check for duplicates
      const exists = this.cashtagMentions.some(m => m.id === mention.id);
      if (exists) {
        return; // Already stored
      }

      this.cashtagMentions.push(mention);
      
      // Invalidate momentum cache
      this.momentumCache = null;
      
      // Save to disk (async, don't wait)
      this.saveData().catch(err => 
        console.error('❌ [CT MOMENTUM DB] Save error:', err.message)
      );
      
      console.log(`💰 [CT MOMENTUM DB] Stored mention: $${mention.symbol} by @${mention.author} (${mention.sentiment})`);
      
    } catch (error) {
      console.error('❌ [CT MOMENTUM DB] Store error:', error.message);
    }
  }

  /**
   * Get top tokens by momentum score
   */
  getTopTokens(limit = 20, timeframe = '24h') {
    try {
      const mentions = this.getMentionsByTimeframe(timeframe);
      
      if (mentions.length === 0) {
        return [];
      }
      
      // Aggregate by symbol
      const tokenStats = new Map();
      
      for (const mention of mentions) {
        const symbol = mention.symbol;
        
        if (!tokenStats.has(symbol)) {
          tokenStats.set(symbol, {
            symbol: symbol,
            mentions: [],
            authors: new Set(),
            sentiment: { bullish: 0, bearish: 0, neutral: 0 },
            totalEngagement: 0,
            firstMention: mention.timestamp,
            lastMention: mention.timestamp
          });
        }
        
        const stats = tokenStats.get(symbol);
        stats.mentions.push(mention);
        stats.authors.add(mention.author);
        stats.sentiment[mention.sentiment]++;
        stats.totalEngagement += this.calculateEngagement(mention.engagement);
        stats.lastMention = mention.timestamp;
      }
      
      // Calculate momentum scores and format
      const tokens = Array.from(tokenStats.values()).map(stats => {
        const totalMentions = stats.mentions.length;
        const uniqueAuthors = stats.authors.size;
        const totalSentiment = stats.sentiment.bullish + stats.sentiment.bearish + stats.sentiment.neutral;
        
        // Determine dominant sentiment
        const dominantSentiment = stats.sentiment.bullish > stats.sentiment.bearish
          ? (stats.sentiment.bullish > stats.sentiment.neutral ? 'bullish' : 'neutral')
          : (stats.sentiment.bearish > stats.sentiment.neutral ? 'bearish' : 'neutral');
        
        // Calculate momentum score
        // Formula: mentions × author_diversity × engagement_factor × sentiment_weight
        const authorDiversityFactor = Math.sqrt(uniqueAuthors); // Diminishing returns
        const engagementFactor = Math.log10(stats.totalEngagement + 10) / 10; // Normalized log scale
        const sentimentWeight = dominantSentiment === 'bullish' ? 1.3 : dominantSentiment === 'bearish' ? 0.7 : 1.0;
        
        const momentumScore = totalMentions * authorDiversityFactor * engagementFactor * sentimentWeight;
        
        return {
          symbol: stats.symbol,
          rank: 0, // Will be set after sorting
          totalMentions: totalMentions,
          uniqueAuthors: uniqueAuthors,
          dominantSentiment: dominantSentiment,
          sentimentDistribution: {
            bullish: Math.round((stats.sentiment.bullish / totalSentiment) * 100),
            bearish: Math.round((stats.sentiment.bearish / totalSentiment) * 100),
            neutral: Math.round((stats.sentiment.neutral / totalSentiment) * 100)
          },
          totalEngagement: stats.totalEngagement,
          momentumScore: Math.round(momentumScore * 100) / 100,
          firstMention: stats.firstMention,
          lastMention: stats.lastMention,
          topMentions: stats.mentions
            .sort((a, b) => this.calculateEngagement(b.engagement) - this.calculateEngagement(a.engagement))
            .slice(0, 3)
            .map(m => ({
              author: m.author,
              authorDisplayName: m.authorDisplayName,
              context: m.context,
              sentiment: m.sentiment,
              timestamp: m.timestamp,
              engagement: m.engagement
            })),
          analyzedAt: new Date().toISOString()
        };
      });
      
      // Sort by momentum score and assign ranks
      tokens.sort((a, b) => b.momentumScore - a.momentumScore);
      tokens.forEach((token, index) => {
        token.rank = index + 1;
      });
      
      return tokens.slice(0, limit);
      
    } catch (error) {
      console.error('❌ [CT MOMENTUM DB] Error getting top tokens:', error.message);
      return [];
    }
  }

  /**
   * Get detailed token momentum data
   */
  getTokenMomentum(symbol, timeframe = '7d') {
    try {
      const mentions = this.getMentionsByTimeframe(timeframe)
        .filter(m => m.symbol.toUpperCase() === symbol.toUpperCase());
      
      if (mentions.length === 0) {
        return null;
      }
      
      // Calculate statistics
      const authors = new Set(mentions.map(m => m.author));
      const sentiment = { bullish: 0, bearish: 0, neutral: 0 };
      let totalEngagement = 0;
      
      mentions.forEach(m => {
        sentiment[m.sentiment]++;
        totalEngagement += this.calculateEngagement(m.engagement);
      });
      
      const totalSentiment = sentiment.bullish + sentiment.bearish + sentiment.neutral;
      const dominantSentiment = sentiment.bullish > sentiment.bearish
        ? (sentiment.bullish > sentiment.neutral ? 'bullish' : 'neutral')
        : (sentiment.bearish > sentiment.neutral ? 'bearish' : 'neutral');
      
      // Get mentions over time (daily buckets)
      const mentionsOverTime = this.getMentionsOverTime(mentions);
      
      return {
        symbol: symbol.toUpperCase(),
        timeframe: timeframe,
        totalMentions: mentions.length,
        uniqueAuthors: authors.size,
        dominantSentiment: dominantSentiment,
        sentimentDistribution: {
          bullish: Math.round((sentiment.bullish / totalSentiment) * 100),
          bearish: Math.round((sentiment.bearish / totalSentiment) * 100),
          neutral: Math.round((sentiment.neutral / totalSentiment) * 100)
        },
        totalEngagement: totalEngagement,
        avgEngagementPerMention: Math.round(totalEngagement / mentions.length),
        mentionsOverTime: mentionsOverTime,
        topAuthors: this.getTopAuthors(mentions, 5),
        recentMentions: mentions
          .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
          .slice(0, 10)
          .map(m => ({
            author: m.author,
            authorDisplayName: m.authorDisplayName,
            context: m.context,
            sentiment: m.sentiment,
            timestamp: m.timestamp,
            engagement: m.engagement,
            tweetId: m.tweetId
          })),
        analyzedAt: new Date().toISOString()
      };
      
    } catch (error) {
      console.error('❌ [CT MOMENTUM DB] Error getting token momentum:', error.message);
      return null;
    }
  }

  /**
   * Get mentions by timeframe
   */
  getMentionsByTimeframe(timeframe) {
    const now = new Date();
    let cutoffDate;
    
    switch (timeframe) {
      case '1h':
        cutoffDate = new Date(now.getTime() - 60 * 60 * 1000);
        break;
      case '6h':
        cutoffDate = new Date(now.getTime() - 6 * 60 * 60 * 1000);
        break;
      case '24h':
      case '1d':
        cutoffDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        cutoffDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        cutoffDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        cutoffDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }
    
    return this.cashtagMentions.filter(m => new Date(m.timestamp) >= cutoffDate);
  }

  /**
   * Calculate total engagement from engagement object
   */
  calculateEngagement(engagement) {
    if (!engagement) return 0;
    return (engagement.likes || 0) + 
           (engagement.retweets || 0) * 2 + 
           (engagement.quoteTweets || 0) + 
           (engagement.replyCount || 0);
  }

  /**
   * Get mentions over time (daily buckets)
   */
  getMentionsOverTime(mentions) {
    const buckets = new Map();
    
    mentions.forEach(mention => {
      const date = new Date(mention.timestamp);
      const dateKey = date.toISOString().split('T')[0]; // YYYY-MM-DD
      
      if (!buckets.has(dateKey)) {
        buckets.set(dateKey, {
          date: dateKey,
          count: 0,
          sentiment: { bullish: 0, bearish: 0, neutral: 0 }
        });
      }
      
      const bucket = buckets.get(dateKey);
      bucket.count++;
      bucket.sentiment[mention.sentiment]++;
    });
    
    return Array.from(buckets.values()).sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * Get top authors for a token
   */
  getTopAuthors(mentions, limit = 5) {
    const authorStats = new Map();
    
    mentions.forEach(mention => {
      if (!authorStats.has(mention.author)) {
        authorStats.set(mention.author, {
          author: mention.author,
          displayName: mention.authorDisplayName,
          mentionCount: 0,
          sentiment: { bullish: 0, bearish: 0, neutral: 0 },
          totalEngagement: 0
        });
      }
      
      const stats = authorStats.get(mention.author);
      stats.mentionCount++;
      stats.sentiment[mention.sentiment]++;
      stats.totalEngagement += this.calculateEngagement(mention.engagement);
    });
    
    return Array.from(authorStats.values())
      .sort((a, b) => b.mentionCount - a.mentionCount)
      .slice(0, limit);
  }

  /**
   * Get database statistics
   */
  getStats() {
    const uniqueTokens = new Set(this.cashtagMentions.map(m => m.symbol)).size;
    const uniqueAuthors = new Set(this.cashtagMentions.map(m => m.author)).size;
    
    const sentiment = { bullish: 0, bearish: 0, neutral: 0 };
    this.cashtagMentions.forEach(m => sentiment[m.sentiment]++);
    
    return {
      totalMentions: this.cashtagMentions.length,
      uniqueTokens: uniqueTokens,
      uniqueAuthors: uniqueAuthors,
      sentimentDistribution: sentiment,
      oldestMention: this.cashtagMentions.length > 0 
        ? this.cashtagMentions[0].timestamp 
        : null,
      latestMention: this.cashtagMentions.length > 0 
        ? this.cashtagMentions[this.cashtagMentions.length - 1].timestamp 
        : null
    };
  }

  /**
   * Save data to disk
   */
  async saveData() {
    try {
      await fs.writeFile(
        this.mentionsFile,
        JSON.stringify(this.cashtagMentions, null, 2),
        'utf8'
      );
    } catch (error) {
      console.error('❌ [CT MOMENTUM DB] Save error:', error.message);
    }
  }

  /**
   * Load data from disk
   */
  async loadData() {
    try {
      const data = await fs.readFile(this.mentionsFile, 'utf8');
      this.cashtagMentions = JSON.parse(data);
      console.log(`💰 [CT MOMENTUM DB] Loaded ${this.cashtagMentions.length} cashtag mentions`);
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('💰 [CT MOMENTUM DB] No existing data, starting fresh');
        this.cashtagMentions = [];
      } else {
        console.error('❌ [CT MOMENTUM DB] Load error:', error.message);
        this.cashtagMentions = [];
      }
    }
  }

  /**
   * Clear all data (for testing/cleanup)
   */
  async clearAllData() {
    this.cashtagMentions = [];
    this.momentumCache = null;
    await this.saveData();
    console.log('💰 [CT MOMENTUM DB] All data cleared');
  }
}

export default CTMomentumDatabase;

