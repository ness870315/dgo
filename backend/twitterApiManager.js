// Emergency Twitter API Manager - 15K/Month Limit Protection
import fs from 'fs/promises';
import path from 'path';

class TwitterApiManager {
  constructor() {
    this.monthlyLimit = 15000; // Twitter API v2 Basic limit
    this.usageFile = './cache/twitter_usage.json';
    this.emergencyMode = false;
    
    // Smart refresh tiers
    this.refreshTiers = {
      CRITICAL: { 
        cooldown: 3 * 24 * 60 * 60 * 1000, // 3 days
        maxPerMonth: 500,
        description: 'Watchlist + Trending + Fueled tokens'
      },
      IMPORTANT: { 
        cooldown: 7 * 24 * 60 * 60 * 1000, // 7 days  
        maxPerMonth: 300,
        description: 'High volume tokens (>$1M mcap)'
      },
      STANDARD: { 
        cooldown: 14 * 24 * 60 * 60 * 1000, // 14 days
        maxPerMonth: 200,
        description: 'Regular tokens'
      },
      ARCHIVE: { 
        cooldown: 30 * 24 * 60 * 60 * 1000, // 30 days
        maxPerMonth: 50,
        description: 'Low priority tokens'
      }
    };
    
    this.initialize();
  }

  async initialize() {
    try {
      const data = await fs.readFile(this.usageFile, 'utf8');
      this.usage = JSON.parse(data);
    } catch (error) {
      this.usage = {
        currentMonth: new Date().getMonth(),
        currentYear: new Date().getFullYear(),
        totalCalls: 0,
        dailyCalls: {},
        tierUsage: {
          CRITICAL: 0,
          IMPORTANT: 0, 
          STANDARD: 0,
          ARCHIVE: 0
        },
        emergencyModeActivated: null
      };
      await this.saveUsage();
    }
    
    // Check if we need to reset monthly counters
    const now = new Date();
    if (this.usage.currentMonth !== now.getMonth() || this.usage.currentYear !== now.getFullYear()) {
      console.log('🔄 Resetting monthly Twitter API usage counters');
      this.usage.currentMonth = now.getMonth();
      this.usage.currentYear = now.getFullYear();
      this.usage.totalCalls = 0;
      this.usage.tierUsage = { CRITICAL: 0, IMPORTANT: 0, STANDARD: 0, ARCHIVE: 0 };
      this.usage.emergencyModeActivated = null;
      await this.saveUsage();
    }
    
    // Check emergency mode
    this.checkEmergencyMode();
    
    console.log(`🐦 Twitter API Manager initialized: ${this.usage.totalCalls}/${this.monthlyLimit} calls used this month`);
  }

  async saveUsage() {
    await fs.writeFile(this.usageFile, JSON.stringify(this.usage, null, 2));
  }

  checkEmergencyMode() {
    const usagePercent = (this.usage.totalCalls / this.monthlyLimit) * 100;
    
    if (usagePercent >= 95) {
      this.emergencyMode = true;
      this.usage.emergencyModeActivated = new Date().toISOString();
      console.log('🚨 EMERGENCY MODE ACTIVATED: 95%+ Twitter API usage reached');
    } else if (usagePercent >= 80) {
      console.log(`⚠️ WARNING: ${usagePercent.toFixed(1)}% of monthly Twitter API limit used`);
    }
    
    return this.emergencyMode;
  }

  getTokenTier(token) {
    // Determine refresh priority tier based on token characteristics
    const mcap = token.jupiterData?.marketCap || token.marketCap || 0;
    const isWatchlisted = token.isWatchlisted || false;
    const isTrending = token.isTrending || false;
    const isFueled = token.isFueled || false;
    const volume24h = token.jupiterData?.stats24h?.volume || 0;
    
    // CRITICAL: Watchlist, trending, fueled tokens
    if (isWatchlisted || isTrending || isFueled) {
      return 'CRITICAL';
    }
    
    // IMPORTANT: High market cap or volume
    if (mcap > 1000000 || volume24h > 100000) {
      return 'IMPORTANT';
    }
    
    // STANDARD: Medium tokens
    if (mcap > 100000) {
      return 'STANDARD';
    }
    
    // ARCHIVE: Small tokens
    return 'ARCHIVE';
  }

  async canRefreshToken(token) {
    if (this.emergencyMode) {
      console.log(`🚨 Emergency mode: Blocking Twitter refresh for ${token.symbol}`);
      return { allowed: false, reason: 'Emergency mode - monthly limit exceeded' };
    }

    const tier = this.getTokenTier(token);
    const tierConfig = this.refreshTiers[tier];
    
    // Check tier monthly limit
    if (this.usage.tierUsage[tier] >= tierConfig.maxPerMonth) {
      return { 
        allowed: false, 
        reason: `${tier} tier monthly limit reached (${this.usage.tierUsage[tier]}/${tierConfig.maxPerMonth})` 
      };
    }
    
    // Check cooldown
    const lastRefresh = token.twitterData?.lastRefreshed || token.twitterLastRefresh;
    if (lastRefresh) {
      const timeSinceRefresh = Date.now() - new Date(lastRefresh).getTime();
      if (timeSinceRefresh < tierConfig.cooldown) {
        const hoursLeft = Math.ceil((tierConfig.cooldown - timeSinceRefresh) / (60 * 60 * 1000));
        return { 
          allowed: false, 
          reason: `${tier} tier cooldown: ${hoursLeft}h remaining` 
        };
      }
    }
    
    // Check global monthly limit
    if (this.usage.totalCalls >= this.monthlyLimit * 0.95) {
      return { allowed: false, reason: 'Approaching monthly limit (95%)' };
    }
    
    return { allowed: true, tier, tierConfig };
  }

  async recordApiCall(token, callsUsed = 1) {
    const tier = this.getTokenTier(token);
    
    this.usage.totalCalls += callsUsed;
    this.usage.tierUsage[tier] += callsUsed;
    
    // Record daily usage
    const today = new Date().toISOString().split('T')[0];
    this.usage.dailyCalls[today] = (this.usage.dailyCalls[today] || 0) + callsUsed;
    
    await this.saveUsage();
    
    console.log(`🐦 API Call recorded: ${token.symbol} (${tier}) - ${callsUsed} calls - Total: ${this.usage.totalCalls}/${this.monthlyLimit}`);
    
    // Check if we need to activate emergency mode
    this.checkEmergencyMode();
  }

  getUsageStats() {
    const usagePercent = (this.usage.totalCalls / this.monthlyLimit) * 100;
    const remainingCalls = this.monthlyLimit - this.usage.totalCalls;
    
    return {
      totalCalls: this.usage.totalCalls,
      monthlyLimit: this.monthlyLimit,
      usagePercent: Math.round(usagePercent * 10) / 10,
      remainingCalls,
      emergencyMode: this.emergencyMode,
      tierUsage: this.usage.tierUsage,
      dailyAverage: this.calculateDailyAverage(),
      projectedMonthlyUsage: this.projectMonthlyUsage()
    };
  }

  calculateDailyAverage() {
    const days = Object.keys(this.usage.dailyCalls);
    if (days.length === 0) return 0;
    
    const totalDailyCalls = Object.values(this.usage.dailyCalls).reduce((sum, calls) => sum + calls, 0);
    return Math.round(totalDailyCalls / days.length);
  }

  projectMonthlyUsage() {
    const dailyAvg = this.calculateDailyAverage();
    const daysInMonth = new Date(this.usage.currentYear, this.usage.currentMonth + 1, 0).getDate();
    return dailyAvg * daysInMonth;
  }

  // Emergency functions
  async activateEmergencyMode() {
    this.emergencyMode = true;
    this.usage.emergencyModeActivated = new Date().toISOString();
    await this.saveUsage();
    console.log('🚨 EMERGENCY MODE MANUALLY ACTIVATED');
  }

  async deactivateEmergencyMode() {
    this.emergencyMode = false;
    this.usage.emergencyModeActivated = null;
    await this.saveUsage();
    console.log('✅ Emergency mode deactivated');
  }
}

export default TwitterApiManager;
