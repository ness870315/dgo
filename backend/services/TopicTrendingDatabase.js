import fs from 'fs/promises';
import path from 'path';

/**
 * Topic Trending Database
 * Stores and manages trending crypto topics with atomic operations
 */

class TopicTrendingDatabase {
  constructor() {
    // Storage configuration
    this.storageDir = process.env.DATA_DIR 
      ? path.join(process.env.DATA_DIR, 'topic-trending-db')
      : path.join(process.cwd(), 'data', 'topic-trending-db');
    
    // Database files
    this.topicsFile = path.join(this.storageDir, 'trending-topics.json');
    this.insightsFile = path.join(this.storageDir, 'topic-insights.json');
    this.historyFile = path.join(this.storageDir, 'topic-history.json');
    
    // In-memory storage
    this.trendingTopics = [];
    this.topicInsights = new Map();
    this.topicHistory = [];
    
    this.initializeDatabase();
    console.log('🔥 [TOPIC TRENDING DB] Topic Trending Database initialized');
  }

  /**
   * Ensure storage directory exists
   */
  async ensureStorageDir() {
    try {
      await fs.mkdir(this.storageDir, { recursive: true });
    } catch (error) {
      console.error('❌ [TOPIC TRENDING DB] Failed to create storage directory:', error.message);
      throw error;
    }
  }

  /**
   * Initialize database
   */
  async initializeDatabase() {
    try {
      await this.ensureStorageDir();
      await this.loadData();
      console.log(`📁 [TOPIC TRENDING DB] Database initialized: ${this.storageDir}`);
    } catch (error) {
      console.error('❌ [TOPIC TRENDING DB] Failed to initialize database:', error.message);
    }
  }

  /**
   * Store trending topics analysis
   */
  async storeTrendingTopics(analysis) {
    try {
      // Add metadata
      const trendingData = {
        id: this.generateAnalysisId(),
        timeframe: analysis.timeframe || '7d',
        totalTweets: analysis.totalTweets || 0,
        topics: analysis.topics || [],
        analyzedAt: new Date().toISOString(),
        createdAt: new Date().toISOString()
      };

      // Atomic save
      const tempTopics = [...this.trendingTopics, trendingData];
      await this.saveTopicsAtomic(tempTopics);
      
      // Update in-memory array after successful save
      this.trendingTopics = tempTopics;
      
      // Store individual topic history
      await this.updateTopicHistory(trendingData);

      console.log(`💾 [TOPIC TRENDING DB] Stored trending analysis: ${trendingData.topics.length} topics`);
      
      return trendingData;

    } catch (error) {
      console.error('❌ [TOPIC TRENDING DB] Failed to store trending topics:', error.message);
      return null;
    }
  }

  /**
   * Store topic insights
   */
  async storeTopicInsights(topic, insights) {
    try {
      const insightData = {
        topic,
        insights: insights.insights,
        timeframe: insights.timeframe,
        source: insights.source,
        generatedAt: insights.generatedAt,
        storedAt: new Date().toISOString()
      };

      // Store in memory
      this.topicInsights.set(topic, insightData);
      
      // Save to disk
      await this.saveInsights();

      console.log(`💾 [TOPIC TRENDING DB] Stored insights for topic: ${topic}`);
      
      return insightData;

    } catch (error) {
      console.error('❌ [TOPIC TRENDING DB] Failed to store topic insights:', error.message);
      return null;
    }
  }

  /**
   * Update topic history for trend analysis
   */
  async updateTopicHistory(analysis) {
    try {
      analysis.topics.forEach(topicData => {
        const historyEntry = {
          topic: topicData.topic,
          category: topicData.category,
          frequency: topicData.frequency,
          trendingScore: topicData.trendingScore,
          sentiment: topicData.sentiment,
          analyzedAt: analysis.analyzedAt,
          timeframe: analysis.timeframe
        };

        this.topicHistory.push(historyEntry);
      });

      // Keep only last 30 days of history
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      this.topicHistory = this.topicHistory.filter(entry => 
        new Date(entry.analyzedAt) >= thirtyDaysAgo
      );

      // Save history
      await this.saveHistory();

    } catch (error) {
      console.error('❌ [TOPIC TRENDING DB] Failed to update topic history:', error.message);
    }
  }

  /**
   * Get latest trending topics
   */
  getLatestTrendingTopics(limit = 20) {
    if (this.trendingTopics.length === 0) {
      return [];
    }

    const latest = this.trendingTopics[this.trendingTopics.length - 1];
    return latest.topics.slice(0, limit);
  }

  /**
   * Get trending topics from the last N days
   */
  getTrendingTopicsByTimeframe(days, limit = 20) {
    if (this.trendingTopics.length === 0) {
      return [];
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    // Get all topics from the specified timeframe
    const topicsInTimeframe = [];
    const topicMap = new Map();

    for (const analysis of this.trendingTopics) {
      const analysisDate = new Date(analysis.analyzedAt);
      if (analysisDate >= cutoffDate) {
        for (const topic of analysis.topics) {
          const key = topic.topic;
          if (topicMap.has(key)) {
            // Aggregate data for topics that appear multiple times
            const existing = topicMap.get(key);
            existing.frequency += topic.frequency;
            existing.authorCount = Math.max(existing.authorCount, topic.authorCount);
            existing.trendingScore = Math.max(existing.trendingScore, topic.trendingScore);
            
            // Merge authors
            const allAuthors = [...new Set([...existing.authors, ...topic.authors])];
            existing.authors = allAuthors;
            existing.authorCount = allAuthors.length;
          } else {
            topicMap.set(key, {
              ...topic,
              authors: [...topic.authors] // Create a copy
            });
          }
        }
      }
    }

    // Convert map to array and sort by trending score
    const aggregatedTopics = Array.from(topicMap.values())
      .sort((a, b) => b.trendingScore - a.trendingScore)
      .slice(0, limit);

    return aggregatedTopics;
  }

  /**
   * Get trending topics by category
   */
  getTrendingTopicsByCategory(category, limit = 10) {
    const latest = this.getLatestTrendingTopics();
    return latest
      .filter(topic => topic.category === category)
      .slice(0, limit);
  }

  /**
   * Get topic trend over time
   */
  getTopicTrend(topicName, days = 7) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    return this.topicHistory
      .filter(entry => 
        entry.topic === topicName && 
        new Date(entry.analyzedAt) >= cutoffDate
      )
      .sort((a, b) => new Date(a.analyzedAt) - new Date(b.analyzedAt));
  }

  /**
   * Get topic insights
   */
  getTopicInsights(topic) {
    return this.topicInsights.get(topic) || null;
  }

  /**
   * Get top performing categories
   */
  getTopCategories(limit = 10) {
    const latest = this.getLatestTrendingTopics();
    const categoryStats = new Map();

    latest.forEach(topic => {
      const category = topic.category;
      if (!categoryStats.has(category)) {
        categoryStats.set(category, {
          category,
          totalTopics: 0,
          totalFrequency: 0,
          totalEngagement: 0,
          averageTrendingScore: 0,
          topics: []
        });
      }

      const stats = categoryStats.get(category);
      stats.totalTopics++;
      stats.totalFrequency += topic.frequency;
      stats.totalEngagement += topic.engagement;
      stats.topics.push(topic);
    });

    // Calculate averages
    categoryStats.forEach(stats => {
      stats.averageTrendingScore = stats.topics.reduce((sum, topic) => sum + topic.trendingScore, 0) / stats.totalTopics;
    });

    return Array.from(categoryStats.values())
      .sort((a, b) => b.averageTrendingScore - a.averageTrendingScore)
      .slice(0, limit);
  }

  /**
   * Get trending statistics
   */
  getTrendingStatistics() {
    const latest = this.getLatestTrendingTopics();
    
    if (latest.length === 0) {
      return {
        totalTopics: 0,
        totalCategories: 0,
        averageTrendingScore: 0,
        topCategory: null,
        mostFrequentTopic: null,
        sentimentDistribution: { positive: 0, negative: 0, neutral: 0 }
      };
    }

    const categories = new Set(latest.map(topic => topic.category));
    const averageTrendingScore = latest.reduce((sum, topic) => sum + topic.trendingScore, 0) / latest.length;
    
    const topCategory = this.getTopCategories(1)[0];
    const mostFrequentTopic = latest.reduce((max, topic) => 
      topic.frequency > max.frequency ? topic : max
    );

    const sentimentDistribution = latest.reduce((acc, topic) => {
      acc[topic.sentiment.dominant]++;
      return acc;
    }, { positive: 0, negative: 0, neutral: 0 });

    return {
      totalTopics: latest.length,
      totalCategories: categories.size,
      averageTrendingScore: Math.round(averageTrendingScore * 100) / 100,
      topCategory: topCategory?.category || null,
      mostFrequentTopic: mostFrequentTopic?.topic || null,
      sentimentDistribution
    };
  }

  /**
   * Search topics by name or category
   */
  searchTopics(query, limit = 20) {
    const latest = this.getLatestTrendingTopics();
    const lowerQuery = query.toLowerCase();
    
    return latest
      .filter(topic => 
        topic.topic.toLowerCase().includes(lowerQuery) ||
        topic.category.toLowerCase().includes(lowerQuery)
      )
      .slice(0, limit);
  }

  /**
   * Get topic correlation analysis
   */
  getTopicCorrelations(topicName, limit = 10) {
    const latest = this.getLatestTrendingTopics();
    const correlations = new Map();

    // Find tweets that mention the target topic
    const targetTopic = latest.find(topic => topic.topic === topicName);
    if (!targetTopic) return [];

    // This is a simplified correlation - in a real implementation,
    // you'd analyze co-occurrence in tweets
    latest.forEach(topic => {
      if (topic.topic !== topicName && topic.category === targetTopic.category) {
        correlations.set(topic.topic, {
          topic: topic.topic,
          correlation: 0.7, // Simplified correlation score
          category: topic.category,
          trendingScore: topic.trendingScore
        });
      }
    });

    return Array.from(correlations.values())
      .sort((a, b) => b.correlation - a.correlation)
      .slice(0, limit);
  }

  /**
   * Generate unique analysis ID
   */
  generateAnalysisId() {
    return `analysis_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Atomic save operations
   */
  async saveTopicsAtomic(topics) {
    try {
      await this.ensureStorageDir();
      
      const data = {
        analyses: topics,
        lastSaved: new Date().toISOString(),
        totalAnalyses: topics.length
      };
      
      const tempFile = this.topicsFile + '.tmp';
      await fs.writeFile(tempFile, JSON.stringify(data, null, 2));
      await fs.rename(tempFile, this.topicsFile);
      
      console.log(`💾 [TOPIC TRENDING DB] Topics saved atomically (${topics.length} analyses)`);
      
    } catch (error) {
      console.error('❌ [TOPIC TRENDING DB] Failed to save topics atomically:', error.message);
      throw error;
    }
  }

  async saveInsights() {
    try {
      await this.ensureStorageDir();
      
      const data = {
        insights: Object.fromEntries(this.topicInsights),
        lastSaved: new Date().toISOString(),
        totalInsights: this.topicInsights.size
      };
      
      await fs.writeFile(this.insightsFile, JSON.stringify(data, null, 2));
      
    } catch (error) {
      console.error('❌ [TOPIC TRENDING DB] Failed to save insights:', error.message);
    }
  }

  async saveHistory() {
    try {
      await this.ensureStorageDir();
      
      const data = {
        history: this.topicHistory,
        lastSaved: new Date().toISOString(),
        totalEntries: this.topicHistory.length
      };
      
      await fs.writeFile(this.historyFile, JSON.stringify(data, null, 2));
      
    } catch (error) {
      console.error('❌ [TOPIC TRENDING DB] Failed to save history:', error.message);
    }
  }

  /**
   * Load data from disk
   */
  async loadData() {
    try {
      await this.ensureStorageDir();
      
      // Load trending topics
      try {
        const topicsData = await fs.readFile(this.topicsFile, 'utf8');
        const parsed = JSON.parse(topicsData);
        this.trendingTopics = parsed.analyses || [];
        console.log(`📂 [TOPIC TRENDING DB] Loaded ${this.trendingTopics.length} trending analyses`);
      } catch (error) {
        if (error.code === 'ENOENT') {
          console.log('ℹ️ [TOPIC TRENDING DB] No existing trending topics found, starting fresh');
          this.trendingTopics = [];
        } else {
          throw error;
        }
      }

      // Load insights
      try {
        const insightsData = await fs.readFile(this.insightsFile, 'utf8');
        const parsed = JSON.parse(insightsData);
        this.topicInsights = new Map(Object.entries(parsed.insights || {}));
        console.log(`📂 [TOPIC TRENDING DB] Loaded ${this.topicInsights.size} topic insights`);
      } catch (error) {
        if (error.code === 'ENOENT') {
          console.log('ℹ️ [TOPIC TRENDING DB] No existing insights found, starting fresh');
          this.topicInsights = new Map();
        } else {
          throw error;
        }
      }

      // Load history
      try {
        const historyData = await fs.readFile(this.historyFile, 'utf8');
        const parsed = JSON.parse(historyData);
        this.topicHistory = parsed.history || [];
        console.log(`📂 [TOPIC TRENDING DB] Loaded ${this.topicHistory.length} history entries`);
      } catch (error) {
        if (error.code === 'ENOENT') {
          console.log('ℹ️ [TOPIC TRENDING DB] No existing history found, starting fresh');
          this.topicHistory = [];
        } else {
          throw error;
        }
      }

    } catch (error) {
      console.error('❌ [TOPIC TRENDING DB] Error loading data:', error.message);
    }
  }
}

export default TopicTrendingDatabase;
