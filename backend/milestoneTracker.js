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
    this.authIssues = new Map(); // Track users with auth issues
    
    // Milestone thresholds
    this.milestones = [2, 3, 4, 5, 10, 20, 50, 100, 500, 1000];
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
          // Create enhanced stats object with calculated multipliers
          const enhancedStats = {
            ...currentStats,
            multiplier: currentMultiplier,
            athMultiplier: athMultiplier,
            timeSinceCall: this.getTimeSinceCall(call.calledAt)
          };
          await this.postMilestoneUpdate(userId, call, milestone, enhancedStats);
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

      let tokensCache;
      try {
        const cacheContent = fs.readFileSync(tokensCachePath, 'utf8');
        if (!cacheContent || cacheContent.trim() === '') {
          console.log(`⚠️ Token cache is empty, skipping ${contractAddress.substring(0, 8)}`);
          return null;
        }
        tokensCache = JSON.parse(cacheContent);
      } catch (parseError) {
        console.log(`⚠️ Token cache corrupted or being written, skipping ${contractAddress.substring(0, 8)}: ${parseError.message}`);
        return null;
      }
      
      const token = tokensCache.find(t => t.contractAddress === contractAddress);
      
      if (!token) {
        console.log(`⚠️ Token not found in cache for contract ${contractAddress.substring(0, 8)}`);
        return null;
      }

      // Extract real market cap data from Jupiter API - try multiple field names
      const currentMC = token.jupiterData?.mcap || 
                       token.jupiterData?.marketCap || 
                       token.jupiterData?.market_cap ||
                       token.jupiterData?.mc ||
                       token.marketCap || 
                       token.market_cap ||
                       token.mcap ||
                       0;
      
      const currentPrice = token.jupiterData?.usdPrice || 
                          token.jupiterData?.price || 
                          token.jupiterData?.usd_price ||
                          token.currentPrice || 
                          token.price || 
                          0;
      
      const volume24h = (token.jupiterData?.stats24h?.buyVolume || 0) + 
                       (token.jupiterData?.stats24h?.sellVolume || 0) || 
                       token.jupiterData?.volume24h ||
                       token.jupiterData?.volume_24h ||
                       token.volume24h || 
                       token.volume_24h ||
                       0;

      console.log(`📊 Real token stats for ${token.symbol}:`, {
        contractAddress: contractAddress.substring(0, 8),
        currentMC: currentMC,
        currentPrice: currentPrice,
        volume24h: volume24h,
        source: 'jupiter_cache',
        jupiterFields: {
          mcap: token.jupiterData?.mcap,
          marketCap: token.jupiterData?.marketCap,
          market_cap: token.jupiterData?.market_cap,
          mc: token.jupiterData?.mc,
          usdPrice: token.jupiterData?.usdPrice,
          price: token.jupiterData?.price,
          usd_price: token.jupiterData?.usd_price
        }
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
   * Get time since call in human-readable format
   */
  getTimeSinceCall(calledAt) {
    const now = new Date();
    const called = new Date(calledAt);
    const diffMs = now - called;
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffDays > 0) {
      return `${diffDays}d`;
    } else if (diffHours > 0) {
      return `${diffHours}h`;
    } else {
      const diffMinutes = Math.floor(diffMs / (1000 * 60));
      return `${diffMinutes}m`;
    }
  }

  /**
   * Get new milestones that have been hit
   */
  getNewMilestones(call, currentMultiplier, athMultiplier) {
    const newMilestones = [];
    
    // Don't post milestones for tokens that haven't actually gained (1.00× or less)
    if (athMultiplier <= 1.00) {
      console.log(`🚫 Skipping milestone check for ${call.token?.symbol}: athMultiplier ${athMultiplier.toFixed(2)}× is not a meaningful gain`);
      return newMilestones;
    }
    
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
      // Handle different types of errors gracefully
      if (error.message.includes('Access token expired') || error.message.includes('no refresh token')) {
        // Store failed milestone for retry when user re-authenticates
        await this.storeFailedMilestone(userId, call, milestone, currentStats, error);
        
        // Track auth issues to avoid spam
        const now = Date.now();
        const lastReported = this.authIssues.get(userId);
        if (!lastReported || now - lastReported > 24 * 60 * 60 * 1000) { // Report once per day
          console.warn(`⚠️ User ${userId} needs to re-authenticate with Twitter for milestone posting`);
          console.warn(`   Token expired for milestone: ${call.token.symbol} ${milestone}x`);
          console.warn(`   Milestone stored for retry when user re-authenticates`);
          this.authIssues.set(userId, now);
        }
        // Don't throw - continue processing other users
        return;
      } else if (error.message.includes('Twitter posting disabled')) {
        console.log(`🐦 User ${userId} has Twitter posting disabled, skipping milestone post`);
        return;
      } else {
        console.error(`❌ Error posting milestone update for user ${userId}:`, error.message);
        // Don't throw - continue processing other users
        return;
      }
    }
  }

  /**
   * Store failed milestone for retry when user re-authenticates
   */
  async storeFailedMilestone(userId, call, milestone, currentStats, error) {
    try {
      const failedMilestone = {
        userId,
        callId: call.id,
        tokenSymbol: call.token.symbol,
        milestone,
        currentStats,
        error: error.message,
        timestamp: new Date().toISOString(),
        retryCount: 0
      };

      // Store in database for retry
      await this.db.storeFailedMilestone(failedMilestone);
      console.log(`💾 Stored failed milestone for retry: ${call.token.symbol} ${milestone}x (User: ${userId})`);
    } catch (storeError) {
      console.error(`❌ Error storing failed milestone:`, storeError.message);
    }
  }

  /**
   * Retry failed milestones for a user after re-authentication
   */
  async retryFailedMilestones(userId) {
    try {
      console.log(`🔄 Retrying failed milestones for user ${userId}...`);
      
      const failedMilestones = await this.db.getFailedMilestones(userId);
      if (!failedMilestones || failedMilestones.length === 0) {
        console.log(`✅ No failed milestones to retry for user ${userId}`);
        return;
      }

      let successCount = 0;
      for (const failedMilestone of failedMilestones) {
        try {
          // Get the call data
          const call = await this.db.getCall(failedMilestone.callId);
          if (!call) {
            console.log(`⚠️ Call ${failedMilestone.callId} not found, skipping milestone retry`);
            continue;
          }

          // Generate and post the milestone update
          const postText = await this.thesisGenerator.generateMilestonePost(call, failedMilestone.milestone, failedMilestone.currentStats);
          const tweet = await this.oauthXService.postTweet(userId, postText);
          
          // Record the successful milestone post
          await this.recordMilestonePost(userId, call.id, failedMilestone.milestone, tweet.id, postText);
          
          // Remove from failed milestones
          await this.db.removeFailedMilestone(failedMilestone.id);
          
          successCount++;
          console.log(`✅ Retried milestone ${failedMilestone.milestone}x for ${call.token.symbol}`);
          
        } catch (retryError) {
          console.error(`❌ Failed to retry milestone ${failedMilestone.milestone}x:`, retryError.message);
          
          // Increment retry count
          await this.db.incrementFailedMilestoneRetryCount(failedMilestone.id);
        }
      }

      console.log(`🎯 Retry complete: ${successCount}/${failedMilestones.length} milestones posted successfully`);
      
    } catch (error) {
      console.error(`❌ Error retrying failed milestones for user ${userId}:`, error.message);
    }
  }

  /**
   * Record milestone post in call data
   */
  async recordMilestonePost(userId, callId, milestone, tweetId, postText) {
    try {
      console.log(`📝 Recording milestone post for user ${userId}, call ${callId}, milestone ${milestone}x`);
      
      const calls = await this.db.getKolCalls(userId);
      const callIndex = calls.findIndex(c => c.id === callId);
      
      if (callIndex === -1) {
        console.log(`❌ Call ${callId} not found for user ${userId}`);
        return;
      }

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

      console.log(`📊 Call ${callId} now has ${calls[callIndex].milestonePosts.length} milestone posts:`, 
        calls[callIndex].milestonePosts.map(p => `${p.milestone}x`));

      // Save updated calls
      await this.db.writeJsonFile(
        this.db.getUserFile(userId, 'kol-calls.json'),
        calls
      );
      
      console.log(`✅ Milestone post recorded successfully for call ${callId}`);
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
