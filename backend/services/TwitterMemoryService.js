/**
 * Twitter Memory Service - Phase 1: Basic Logging
 * 
 * Tracks all Twitter interactions for future analytics and AI learning.
 * 
 * FUTURE INTEGRATIONS (Phase 3 & 5):
 * - Social Sentiment Scoring (integrate with Community Health Score)
 * - Trending Tokens Modal (most asked tickers)
 * - Market Intelligence (community interest tracking)
 */

import fs from 'fs/promises';
import path from 'path';

class TwitterMemoryService {
  constructor() {
    const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data', 'global');
    this.interactionsPath = path.join(dataDir, 'twitter-interactions.json');
    this.userProfilesPath = path.join(dataDir, 'twitter-user-profiles.json');
    this.tokenHistoryPath = path.join(dataDir, 'twitter-token-history.json');
    
    // In-memory caches for performance
    this.interactions = [];
    this.userProfiles = {};
    this.tokenHistory = {};
    
    // Track if we're currently writing (for atomic operations)
    this.isWriting = {
      interactions: false,
      userProfiles: false,
      tokenHistory: false
    };
    
    console.log('💾 Twitter Memory Service initialized (Phase 1: Logging)');
  }

  // ============================================================================
  // INITIALIZATION & PERSISTENCE
  // ============================================================================

  async initialize() {
    try {
      // Create data directory if it doesn't exist
      const dataDir = path.dirname(this.interactionsPath);
      await fs.mkdir(dataDir, { recursive: true });
      
      // Load existing data
      await this.loadInteractions();
      await this.loadUserProfiles();
      await this.loadTokenHistory();
      
      console.log('✅ Twitter Memory Service loaded:', {
        interactions: this.interactions.length,
        users: Object.keys(this.userProfiles).length,
        tokens: Object.keys(this.tokenHistory).length
      });
      
      return true;
    } catch (error) {
      console.error('❌ Twitter Memory Service initialization error:', error.message);
      return false;
    }
  }

  async loadInteractions() {
    try {
      const data = await fs.readFile(this.interactionsPath, 'utf8');
      this.interactions = JSON.parse(data);
      console.log(`📥 Loaded ${this.interactions.length} interactions from disk`);
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('📝 No existing interactions file, starting fresh');
        this.interactions = [];
      } else {
        console.error('❌ Error loading interactions:', error.message);
        this.interactions = [];
      }
    }
  }

  async loadUserProfiles() {
    try {
      const data = await fs.readFile(this.userProfilesPath, 'utf8');
      this.userProfiles = JSON.parse(data);
      console.log(`📥 Loaded ${Object.keys(this.userProfiles).length} user profiles from disk`);
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('📝 No existing user profiles file, starting fresh');
        this.userProfiles = {};
      } else {
        console.error('❌ Error loading user profiles:', error.message);
        this.userProfiles = {};
      }
    }
  }

  async loadTokenHistory() {
    try {
      const data = await fs.readFile(this.tokenHistoryPath, 'utf8');
      this.tokenHistory = JSON.parse(data);
      console.log(`📥 Loaded ${Object.keys(this.tokenHistory).length} token histories from disk`);
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('📝 No existing token history file, starting fresh');
        this.tokenHistory = {};
      } else {
        console.error('❌ Error loading token history:', error.message);
        this.tokenHistory = {};
      }
    }
  }

  // ============================================================================
  // ATOMIC WRITE OPERATIONS (Prevent data loss and conflicts)
  // ============================================================================

  async atomicWrite(filePath, data, writeLockKey) {
    // Wait if another write is in progress
    while (this.isWriting[writeLockKey]) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    this.isWriting[writeLockKey] = true;
    
    try {
      // Write to temp file first
      const tempPath = `${filePath}.tmp`;
      await fs.writeFile(tempPath, JSON.stringify(data, null, 2), 'utf8');
      
      // Atomic rename (replaces old file)
      await fs.rename(tempPath, filePath);
      
      return true;
    } catch (error) {
      console.error(`❌ Atomic write error for ${writeLockKey}:`, error.message);
      return false;
    } finally {
      this.isWriting[writeLockKey] = false;
    }
  }

  async saveInteractions() {
    return await this.atomicWrite(this.interactionsPath, this.interactions, 'interactions');
  }

  async saveUserProfiles() {
    return await this.atomicWrite(this.userProfilesPath, this.userProfiles, 'userProfiles');
  }

  async saveTokenHistory() {
    return await this.atomicWrite(this.tokenHistoryPath, this.tokenHistory, 'tokenHistory');
  }

  // ============================================================================
  // INTERACTION LOGGING
  // ============================================================================

  async logInteraction({
    tweetId,
    authorUsername,
    authorId,
    mentionText,
    replyText,
    interactionType,
    extractedTokens = [],
    contractAddress = null,
    personalityUsed = null,
    sentiment = null,
    tokenData = null
  }) {
    try {
      const interaction = {
        id: `int_${Date.now()}_${tweetId}`,
        tweetId,
        authorUsername: authorUsername.toLowerCase(),
        authorId,
        mentionText,
        replyText,
        interactionType,
        extractedTokens: extractedTokens.map(t => t.toUpperCase()),
        contractAddress,
        personalityUsed,
        sentiment,
        tokenData,
        timestamp: new Date().toISOString()
      };
      
      // Add to in-memory cache
      this.interactions.push(interaction);
      
      // Keep only last 10,000 interactions in memory (prevent bloat)
      if (this.interactions.length > 10000) {
        this.interactions = this.interactions.slice(-10000);
      }
      
      // Save to disk
      await this.saveInteractions();
      
      console.log(`💾 [MEMORY] Logged interaction: ${authorUsername} → ${interactionType} → ${extractedTokens.join(', ')}`);
      
      return interaction;
    } catch (error) {
      console.error('❌ [MEMORY] Error logging interaction:', error.message);
      return null;
    }
  }

  // ============================================================================
  // USER PROFILE MANAGEMENT
  // ============================================================================

  async getUserProfile(username) {
    const normalizedUsername = username.toLowerCase();
    return this.userProfiles[normalizedUsername] || null;
  }

  async updateUserProfile(username, {
    userId = null,
    interactionType = null,
    tokensAskedAbout = [],
    providedContract = false
  }) {
    try {
      const normalizedUsername = username.toLowerCase();
      const now = new Date().toISOString();
      
      // Get existing profile or create new
      let profile = this.userProfiles[normalizedUsername] || {
        username: normalizedUsername,
        userId: userId,
        firstInteraction: now,
        lastInteraction: now,
        totalInteractions: 0,
        interests: {
          tokensAskedAbout: {},
          interactionTypes: {
            casual: 0,
            kol_opinion: 0,
            contract_analysis: 0
          }
        },
        contributionScore: 0, // For users who help (provide contracts, etc.)
        providedContracts: 0
      };
      
      // Update profile
      profile.lastInteraction = now;
      profile.totalInteractions++;
      
      if (userId && !profile.userId) {
        profile.userId = userId;
      }
      
      if (interactionType) {
        profile.interests.interactionTypes[interactionType] = 
          (profile.interests.interactionTypes[interactionType] || 0) + 1;
      }
      
      if (tokensAskedAbout.length > 0) {
        tokensAskedAbout.forEach(symbol => {
          const upperSymbol = symbol.toUpperCase();
          profile.interests.tokensAskedAbout[upperSymbol] = 
            (profile.interests.tokensAskedAbout[upperSymbol] || 0) + 1;
        });
      }
      
      if (providedContract) {
        profile.providedContracts++;
        profile.contributionScore += 5; // Reward helpful users
      }
      
      // Save to cache
      this.userProfiles[normalizedUsername] = profile;
      
      // Save to disk
      await this.saveUserProfiles();
      
      console.log(`👤 [MEMORY] Updated profile for @${normalizedUsername}: ${profile.totalInteractions} interactions`);
      
      return profile;
    } catch (error) {
      console.error('❌ [MEMORY] Error updating user profile:', error.message);
      return null;
    }
  }

  // ============================================================================
  // TOKEN MENTION HISTORY
  // ============================================================================

  async getTokenHistory(symbol) {
    const upperSymbol = symbol.toUpperCase();
    return this.tokenHistory[upperSymbol] || null;
  }

  async updateTokenHistory(symbol, {
    contractAddress = null,
    username = null,
    sentiment = null,
    inCache = false,
    tokenData = null
  }) {
    try {
      const upperSymbol = symbol.toUpperCase();
      const now = new Date().toISOString();
      const today = now.split('T')[0]; // YYYY-MM-DD
      
      // Get existing history or create new
      let history = this.tokenHistory[upperSymbol] || {
        symbol: upperSymbol,
        contractAddress: contractAddress,
        firstMentioned: now,
        lastMentioned: now,
        totalMentions: 0,
        uniqueUsers: new Set(),
        sentimentHistory: {},
        cacheStatusHistory: {},
        lastKnownData: null
      };
      
      // Update history
      history.lastMentioned = now;
      history.totalMentions++;
      
      if (contractAddress && !history.contractAddress) {
        history.contractAddress = contractAddress;
      }
      
      if (username) {
        // Convert Set to Array for JSON serialization
        if (!Array.isArray(history.uniqueUsers)) {
          history.uniqueUsers = [];
        }
        const normalizedUsername = username.toLowerCase();
        if (!history.uniqueUsers.includes(normalizedUsername)) {
          history.uniqueUsers.push(normalizedUsername);
        }
      }
      
      if (sentiment) {
        if (!history.sentimentHistory[today]) {
          history.sentimentHistory[today] = { bullish: 0, bearish: 0, cautious: 0 };
        }
        history.sentimentHistory[today][sentiment] = 
          (history.sentimentHistory[today][sentiment] || 0) + 1;
      }
      
      // Track if token was in cache when asked
      history.cacheStatusHistory[today] = inCache;
      
      // Store latest token data for reference
      if (tokenData) {
        history.lastKnownData = {
          mcap: tokenData.mcap,
          volume24h: tokenData.volume24h,
          updatedAt: now
        };
      }
      
      // Save to cache
      this.tokenHistory[upperSymbol] = history;
      
      // Save to disk
      await this.saveTokenHistory();
      
      console.log(`📊 [MEMORY] Updated history for $${upperSymbol}: ${history.totalMentions} mentions from ${history.uniqueUsers.length} users`);
      
      return history;
    } catch (error) {
      console.error('❌ [MEMORY] Error updating token history:', error.message);
      return null;
    }
  }

  // ============================================================================
  // ANALYTICS & INSIGHTS (For Future Integration)
  // ============================================================================

  /**
   * Get trending tokens in the last N hours
   * FUTURE: Integrate with Social Sentiment Score
   */
  async getTrendingTokens(hours = 24) {
    try {
      const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
      
      // Count mentions per token in timeframe
      const tokenCounts = {};
      
      this.interactions
        .filter(i => i.timestamp >= cutoffTime)
        .forEach(interaction => {
          interaction.extractedTokens.forEach(symbol => {
            tokenCounts[symbol] = (tokenCounts[symbol] || 0) + 1;
          });
        });
      
      // Sort by mention count
      const trending = Object.entries(tokenCounts)
        .map(([symbol, count]) => ({ symbol, count }))
        .sort((a, b) => b.count - a.count);
      
      console.log(`📈 [MEMORY] Trending tokens (${hours}h):`, trending.slice(0, 5));
      
      return trending;
    } catch (error) {
      console.error('❌ [MEMORY] Error getting trending tokens:', error.message);
      return [];
    }
  }

  /**
   * Get community sentiment for a token
   * FUTURE: Integrate with Community Health Score
   */
  async getTokenSentiment(symbol, days = 7) {
    try {
      const history = await this.getTokenHistory(symbol);
      
      if (!history || !history.sentimentHistory) {
        return null;
      }
      
      // Aggregate sentiment over last N days
      const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];
      
      const aggregated = { bullish: 0, bearish: 0, cautious: 0 };
      
      Object.entries(history.sentimentHistory).forEach(([date, sentiments]) => {
        if (date >= cutoffDate) {
          aggregated.bullish += sentiments.bullish || 0;
          aggregated.bearish += sentiments.bearish || 0;
          aggregated.cautious += sentiments.cautious || 0;
        }
      });
      
      const total = aggregated.bullish + aggregated.bearish + aggregated.cautious;
      
      if (total === 0) {
        return null;
      }
      
      return {
        bullish: (aggregated.bullish / total * 100).toFixed(1),
        bearish: (aggregated.bearish / total * 100).toFixed(1),
        cautious: (aggregated.cautious / total * 100).toFixed(1),
        totalMentions: total
      };
    } catch (error) {
      console.error('❌ [MEMORY] Error getting token sentiment:', error.message);
      return null;
    }
  }

  /**
   * Get statistics for analytics dashboard
   * FUTURE: Display in admin panel
   */
  async getStatistics() {
    try {
      const stats = {
        totalInteractions: this.interactions.length,
        totalUsers: Object.keys(this.userProfiles).length,
        totalTokensTracked: Object.keys(this.tokenHistory).length,
        
        // Last 24 hours
        last24h: {
          interactions: this.interactions.filter(
            i => new Date(i.timestamp) > new Date(Date.now() - 24 * 60 * 60 * 1000)
          ).length,
          uniqueUsers: new Set(
            this.interactions
              .filter(i => new Date(i.timestamp) > new Date(Date.now() - 24 * 60 * 60 * 1000))
              .map(i => i.authorUsername)
          ).size
        },
        
        // Top users
        topUsers: Object.values(this.userProfiles)
          .sort((a, b) => b.totalInteractions - a.totalInteractions)
          .slice(0, 10)
          .map(u => ({ username: u.username, interactions: u.totalInteractions })),
        
        // Most asked tokens
        topTokens: Object.entries(this.tokenHistory)
          .sort((a, b) => b[1].totalMentions - a[1].totalMentions)
          .slice(0, 10)
          .map(([symbol, data]) => ({ 
            symbol, 
            mentions: data.totalMentions,
            uniqueUsers: Array.isArray(data.uniqueUsers) ? data.uniqueUsers.length : 0
          }))
      };
      
      return stats;
    } catch (error) {
      console.error('❌ [MEMORY] Error getting statistics:', error.message);
      return null;
    }
  }
}

export default TwitterMemoryService;

