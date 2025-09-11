import HybridDatabaseService from './hybridDatabaseService.js';
import CallThesisGenerator from './callThesisGenerator.js';
import OAuthXService from './oauthXService.js';
import fs from 'fs';
import path from 'path';

/**
 * Milestone Tracker - Monitors KOL calls for milestone achievements
 * Tracks 5x, 10x, 20x, 50x, 100x, 500x, 1000x milestones and auto-posts updates
 */
class MilestoneTracker {
  constructor() {
    this.db = new HybridDatabaseService();
    this.thesisGenerator = new CallThesisGenerator();
    this.oauthXService = new OAuthXService();
    this.isRunning = false;
    this.checkInterval = 5 * 60 * 1000; // Check every 5 minutes
    this.intervalId = null;
    
    // Milestone thresholds
    this.milestones = [5, 10, 20, 50, 100, 500, 1000];
  }

  /**
   * Start milestone tracking
   */
  start() {
    if (this.isRunning) {
      console.log('⚠️ Milestone tracker already running');
      return;
    }

    this.isRunning = true;
    console.log('🚀 Starting milestone tracker...');
    
    // Run immediately, then on interval
    this.checkMilestones();
    this.intervalId = setInterval(() => {
      this.checkMilestones();
    }, this.checkInterval);
  }

  /**
   * Stop milestone tracking
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log('⏹️ Milestone tracker stopped');
  }

  /**
   * Check all active calls for milestone achievements
   */
  async checkMilestones() {
    try {
      console.log('🔍 Checking milestones for active calls...');
      
      // Get all users and their calls
      const allUsers = await this.db.getAllUsers();
      let totalChecked = 0;
      let milestonesHit = 0;

      for (const user of allUsers) {
        if (!user.id) continue;
        
        try {
          const calls = await this.db.getKolCalls(user.id);
          const activeCalls = calls.filter(call => 
            call.status === 'active' && 
            call.token?.contractAddress
          );

          for (const call of activeCalls) {
            totalChecked++;
            const hit = await this.checkCallMilestones(user.id, call);
            if (hit) milestonesHit++;
          }
        } catch (error) {
          console.error(`❌ Error checking milestones for user ${user.id}:`, error.message);
        }
      }

      console.log(`✅ Checked ${totalChecked} calls, ${milestonesHit} milestones hit`);
    } catch (error) {
      console.error('❌ Error in milestone check:', error.message);
    }
  }

  /**
   * Check milestones for a specific call
   */
  async checkCallMilestones(userId, call) {
    try {
      // Get current token data
      const currentStats = await this.getCurrentTokenStats(call.token.contractAddress);
      if (!currentStats) return false;

      const currentMultiplier = currentStats.currentMC / call.calledMc;
      const athMultiplier = Math.max(currentStats.currentMC, call.athMC || 0) / call.calledMc;

      // Update call with current stats
      await this.updateCallStats(userId, call.id, {
        currentMC: currentStats.currentMC,
        currentPrice: currentStats.currentPrice,
        currentMultiplier: currentMultiplier,
        athMC: Math.max(currentStats.currentMC, call.athMC || 0),
        athMultiplier: athMultiplier,
        lastUpdated: new Date().toISOString()
      });

      // Check for new milestones
      const newMilestones = this.getNewMilestones(call, currentMultiplier, athMultiplier);
      
      if (newMilestones.length > 0) {
        console.log(`🎯 New milestones hit for ${call.token.symbol}: ${newMilestones.join(', ')}`);
        
        // Post milestone updates
        for (const milestone of newMilestones) {
          await this.postMilestoneUpdate(userId, call, milestone, currentStats);
        }
        
        return true;
      }

      return false;
    } catch (error) {
      console.error(`❌ Error checking milestones for call ${call.id}:`, error.message);
      return false;
    }
  }

  /**
   * Get current token statistics
   */
  async getCurrentTokenStats(contractAddress) {
    try {
      // Load tokens cache to get real token data
      const tokensCachePath = path.join(process.env.DATA_DIR || path.join(__dirname, 'data'), 'cache', 'tokens-cache.json');
      
      if (!fs.existsSync(tokensCachePath)) {
        console.log(`⚠️ Tokens cache not found at ${tokensCachePath}`);
        return null;
      }

      const tokensCache = JSON.parse(fs.readFileSync(tokensCachePath, 'utf8'));
      const token = tokensCache.find(t => t.contractAddress === contractAddress);
      
      if (!token) {
        console.log(`⚠️ Token not found in cache for contract ${contractAddress.substring(0, 8)}`);
        return null;
      }

      // Extract real market cap data from Jupiter API
      const currentMC = token.jupiterData?.mcap || token.jupiterData?.marketCap || 0;
      const currentPrice = token.jupiterData?.usdPrice || token.currentPrice || 0;
      const volume24h = (token.jupiterData?.stats24h?.buyVolume || 0) + (token.jupiterData?.stats24h?.sellVolume || 0);

      console.log(`📊 Real token stats for ${token.symbol}:`, {
        contractAddress: contractAddress.substring(0, 8),
        currentMC: currentMC,
        currentPrice: currentPrice,
        volume24h: volume24h,
        source: 'jupiter_cache'
      });

      return {
        currentMC: currentMC,
        currentPrice: currentPrice,
        volume24h: volume24h
      };
    } catch (error) {
      console.error(`❌ Error getting token stats for ${contractAddress}:`, error.message);
      return null;
    }
  }

  /**
   * Update call statistics
   */
  async updateCallStats(userId, callId, stats) {
    try {
      const calls = await this.db.getKolCalls(userId);
      const callIndex = calls.findIndex(c => c.id === callId);
      
      if (callIndex === -1) return;

      // Update call with new stats
      calls[callIndex] = {
        ...calls[callIndex],
        ...stats,
        lastMilestoneCheck: new Date().toISOString()
      };

      // Save updated calls
      await this.db.writeJsonFile(
        this.db.getUserFile(userId, 'kol-calls.json'),
        calls
      );
    } catch (error) {
      console.error(`❌ Error updating call stats:`, error.message);
    }
  }

  /**
   * Get new milestones that have been hit
   */
  getNewMilestones(call, currentMultiplier, athMultiplier) {
    const newMilestones = [];
    
    for (const milestone of this.milestones) {
      // Check if this milestone was hit and not yet posted
      if (athMultiplier >= milestone && 
          !call.milestonePosts?.some(post => post.milestone === milestone)) {
        newMilestones.push(milestone);
      }
    }

    return newMilestones;
  }

  /**
   * Post milestone update to Twitter
   */
  async postMilestoneUpdate(userId, call, milestone, currentStats) {
    try {
      // Check if user has Twitter posting enabled
      const hasTwitter = await this.oauthXService?.hasTwitterPostingEnabled?.(userId);
      if (!hasTwitter) {
        console.log(`🐦 User ${userId} has Twitter posting disabled, skipping milestone post`);
        return;
      }

      // Generate milestone post
      const postText = await this.thesisGenerator.generateMilestonePost(call, milestone, currentStats);
      
      // Post to Twitter
      const tweet = await this.oauthXService.postTweet(userId, postText);
      
      // Record the milestone post
      await this.recordMilestonePost(userId, call.id, milestone, tweet.id, postText);
      
      console.log(`🐦 Posted milestone ${milestone}x update for ${call.token.symbol}`);
    } catch (error) {
      console.error(`❌ Error posting milestone update:`, error.message);
    }
  }

  /**
   * Record milestone post in call data
   */
  async recordMilestonePost(userId, callId, milestone, tweetId, postText) {
    try {
      const calls = await this.db.getKolCalls(userId);
      const callIndex = calls.findIndex(c => c.id === callId);
      
      if (callIndex === -1) return;

      // Add milestone post record
      const milestonePost = {
        milestone: milestone,
        tweetId: tweetId,
        postText: postText,
        postedAt: new Date().toISOString()
      };

      if (!calls[callIndex].milestonePosts) {
        calls[callIndex].milestonePosts = [];
      }
      calls[callIndex].milestonePosts.push(milestonePost);

      // Save updated calls
      await this.db.writeJsonFile(
        this.db.getUserFile(userId, 'kol-calls.json'),
        calls
      );
    } catch (error) {
      console.error(`❌ Error recording milestone post:`, error.message);
    }
  }

  /**
   * Get milestone statistics for a call
   */
  getCallMilestoneStats(call) {
    const milestones = call.milestonePosts || [];
    const currentMultiplier = call.currentMultiplier || 0;
    const athMultiplier = call.athMultiplier || 0;
    
    return {
      currentMultiplier: currentMultiplier,
      athMultiplier: athMultiplier,
      milestonesHit: milestones.length,
      lastMilestone: milestones.length > 0 ? milestones[milestones.length - 1].milestone : null,
      nextMilestone: this.getNextMilestone(athMultiplier)
    };
  }

  /**
   * Get next milestone threshold
   */
  getNextMilestone(currentMultiplier) {
    return this.milestones.find(m => m > currentMultiplier) || null;
  }
}

export default MilestoneTracker;
