// KOL Content Service for @dgnoracle
// 
// WHAT IT POSTS:
// - Picks 1 random token from top 5 trending (RFC, Cads, Aura, etc.)
// - Format: 35% single tweet, 30% short thread (2), 20% deep-dive (3), 15% memes/jokes
// - Uses our trending system + GPT-5 web search for news/catalysts
// 
// HOW OFTEN:
// - Every 6 hours (4 times per day)
// - Scheduled at 2 PM UTC (configurable below)

import KOLContentService from './kolContentService.js';
import fs from 'fs/promises';
import path from 'path';

class DailyTweetService {
  constructor(twitterAutoPostService, backendInstance = null) {
    this.twitterAutoPostService = twitterAutoPostService;
    this.kolContentService = backendInstance ? new KOLContentService(backendInstance) : null;
    this.isRunning = false;
    
    // State persistence file path
    this.stateFilePath = process.env.DATA_DIR 
      ? path.join(process.env.DATA_DIR, 'daily-tweet-state.json')
      : path.join(process.cwd(), 'data', 'global', 'daily-tweet-state.json');
    
    // KOL Content posting configuration
    this.randomMode = false; // Use fixed schedule for quality content
    this.postsPerDay = { min: 1, max: 1 }; // 1 content cycle per day (2 pieces of content)
    this.activeHours = { start: 8, end: 20 }; // Post during active hours (8 AM - 8 PM UTC)
    this.minHoursBetweenPosts = 24; // Once per day
    
    // Content format: Mix of singles (1 tweet), short (2 tweets), deep (3 tweets)
    
    // Fixed schedule fallback (if randomMode = false)
    this.scheduledTime = { hour: 14, minute: 0 }; // 2:00 PM UTC by default
    
    // Track recent posts for spacing
    this.recentPosts = [];
    this.todayPostCount = 0;
    this.lastPostDate = null;
    
    // Store the next scheduled post time (for status display)
    this.nextPostTime = null;
    
    // Flag to track if service should auto-restart
    this.shouldAutoRestart = false;
  }

  // Load saved state from disk
  async loadState() {
    try {
      const data = await fs.readFile(this.stateFilePath, 'utf8');
      const state = JSON.parse(data);
      
      if (state.wasRunning) {
        console.log('📅 [DAILY TWEET] Restoring service state from previous session...');
        this.postsPerDay = state.postsPerDay || this.postsPerDay;
        this.activeHours = state.activeHours || this.activeHours;
        this.minHoursBetweenPosts = state.minHoursBetweenPosts || this.minHoursBetweenPosts;
        this.randomMode = state.randomMode !== undefined ? state.randomMode : this.randomMode;
        this.todayPostCount = state.todayPostCount || 0;
        this.lastPostDate = state.lastPostDate || null;
        this.recentPosts = state.recentPosts || [];
        this.shouldAutoRestart = true; // Mark for auto-restart
        
        console.log('✅ [DAILY TWEET] State restored, service will auto-restart');
      }
    } catch (error) {
      // File doesn't exist or is invalid - no problem, using defaults
      console.log('📅 [DAILY TWEET] No saved state found, using defaults');
    }
  }

  // Save current state to disk
  async saveState() {
    try {
      const state = {
        wasRunning: this.isRunning,
        postsPerDay: this.postsPerDay,
        activeHours: this.activeHours,
        minHoursBetweenPosts: this.minHoursBetweenPosts,
        randomMode: this.randomMode,
        todayPostCount: this.todayPostCount,
        lastPostDate: this.lastPostDate,
        recentPosts: this.recentPosts,
        savedAt: new Date().toISOString()
      };
      
      await fs.writeFile(this.stateFilePath, JSON.stringify(state, null, 2), 'utf8');
    } catch (error) {
      console.error('❌ [DAILY TWEET] Failed to save state:', error.message);
    }
  }

  // Set random posting configuration
  setRandomConfig(config) {
    if (config.minPosts !== undefined) this.postsPerDay.min = config.minPosts;
    if (config.maxPosts !== undefined) this.postsPerDay.max = config.maxPosts;
    if (config.activeStart !== undefined) this.activeHours.start = config.activeStart;
    if (config.activeEnd !== undefined) this.activeHours.end = config.activeEnd;
    if (config.minHoursBetween !== undefined) this.minHoursBetweenPosts = config.minHoursBetween;
    
    // Update KOL Content Service configuration
    if (this.kolContentService) {
      this.kolContentService.updateConfig({
        mode: this.randomMode ? 'random' : 'fixed',
        minPostsPerDay: this.postsPerDay.min,
        maxPostsPerDay: this.postsPerDay.max,
        minHoursBetween: this.minHoursBetweenPosts,
        useOpenAI: true
      });
    }
    
    console.log(`📅 [DAILY TWEET] Random config updated:`, {
      postsPerDay: `${this.postsPerDay.min}-${this.postsPerDay.max}`,
      activeHours: `${this.activeHours.start}:00-${this.activeHours.end}:00 UTC`,
      minHoursBetween: `${this.minHoursBetweenPosts}h`
    });
    
    this.saveState(); // Save config changes
  }

  // Toggle between random and fixed scheduling
  setMode(mode) {
    this.randomMode = mode === 'random';
    
    // Update KOL Content Service configuration
    if (this.kolContentService) {
      this.kolContentService.updateConfig({
        mode: this.randomMode ? 'random' : 'fixed',
        minPostsPerDay: this.postsPerDay.min,
        maxPostsPerDay: this.postsPerDay.max,
        minHoursBetween: this.minHoursBetweenPosts,
        useOpenAI: true
      });
    }
    
    console.log(`📅 [DAILY TWEET] Mode set to: ${this.randomMode ? 'RANDOM' : 'FIXED SCHEDULE'}`);
  }

  // Set the daily posting time (24-hour format, UTC) - for fixed schedule mode
  setScheduledTime(hour, minute) {
    this.scheduledTime = { hour, minute };
    console.log(`📅 [DAILY TWEET] Fixed schedule time updated to ${hour}:${String(minute).padStart(2, '0')} UTC`);
  }

  // Reset daily counter at midnight
  resetDailyCounter() {
    const today = new Date().toDateString();
    if (this.lastPostDate !== today) {
      this.todayPostCount = 0;
      this.lastPostDate = today;
      console.log(`📅 [DAILY TWEET] Daily counter reset for ${today}`);
    }
  }

  // Calculate next random post time
  getRandomPostTime() {
    this.resetDailyCounter();
    
    // Decide how many posts for today (if not decided yet)
    if (this.todayPostCount === 0 && this.recentPosts.length === 0) {
      this.todayTargetPosts = Math.floor(
        Math.random() * (this.postsPerDay.max - this.postsPerDay.min + 1)
      ) + this.postsPerDay.min;
      console.log(`📅 [DAILY TWEET] Target posts for today: ${this.todayTargetPosts}`);
    }
    
    // Check if we've hit today's target
    if (this.todayPostCount >= (this.todayTargetPosts || this.postsPerDay.max)) {
      // Schedule first post of tomorrow
      const tomorrow = new Date();
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
      tomorrow.setUTCHours(this.activeHours.start, 0, 0, 0);
      return tomorrow.getTime() - Date.now();
    }
    
    const now = new Date();
    let nextPostTime = new Date();
    
    // Find next valid time window
    const currentHour = now.getUTCHours();
    
    if (currentHour < this.activeHours.start) {
      // Before active hours, schedule for start of active hours
      nextPostTime.setUTCHours(this.activeHours.start, 0, 0, 0);
    } else if (currentHour >= this.activeHours.end) {
      // After active hours, schedule for tomorrow
      nextPostTime.setUTCDate(nextPostTime.getUTCDate() + 1);
      nextPostTime.setUTCHours(this.activeHours.start, 0, 0, 0);
    } else {
      // Within active hours, add random delay
      const minDelay = this.minHoursBetweenPosts * 60 * 60 * 1000; // Convert to ms
      const maxDelay = 8 * 60 * 60 * 1000; // Max 8 hours
      const randomDelay = Math.random() * (maxDelay - minDelay) + minDelay;
      
      nextPostTime = new Date(now.getTime() + randomDelay);
      
      // Ensure we don't go past active hours end
      if (nextPostTime.getUTCHours() >= this.activeHours.end) {
        nextPostTime.setUTCDate(nextPostTime.getUTCDate() + 1);
        nextPostTime.setUTCHours(this.activeHours.start, 0, 0, 0);
      }
    }
    
    // Add random minutes for more natural timing (not on the hour)
    const randomMinutes = Math.floor(Math.random() * 60);
    nextPostTime.setUTCMinutes(randomMinutes);
    
    return nextPostTime.getTime() - Date.now();
  }

  // Calculate milliseconds until next post (random or fixed)
  getMillisecondsUntilNextPost() {
    if (this.randomMode) {
      return this.getRandomPostTime();
    }
    
    // Fixed schedule mode
    const now = new Date();
    const next = new Date();
    next.setUTCHours(this.scheduledTime.hour, this.scheduledTime.minute, 0, 0);

    // If time has passed today, schedule for tomorrow
    if (next <= now) {
      next.setUTCDate(next.getUTCDate() + 1);
    }

    return next - now;
  }

  // Generate and post KOL content (uses configuration-based scheduling)
  async postKOLContent() {
    try {
      if (!this.kolContentService) {
        console.error('❌ [KOL CONTENT] KOL Content Service not initialized');
        return { success: false, error: 'KOL Content Service not available' };
      }

      console.log('🎤 [KOL CONTENT] Starting daily content cycle...');

      // Initialize if needed
      if (!this.kolContentService.openaiService.isInitialized) {
        await this.kolContentService.initialize();
      }

      // Ensure KOL Content Service has latest configuration
      this.kolContentService.updateConfig({
        mode: this.randomMode ? 'random' : 'fixed',
        minPostsPerDay: this.postsPerDay.min,
        maxPostsPerDay: this.postsPerDay.max,
        minHoursBetween: this.minHoursBetweenPosts,
        useOpenAI: true
      });

      // Run the daily content cycle (generates + posts 1 content piece)
      await this.kolContentService.runDailyContentCycle(this.twitterAutoPostService.oauthXService);

      // Track the post
      this.todayPostCount++;
      this.recentPosts.push({
        timestamp: Date.now(),
        type: 'kol_content',
        content: 'KOL content posted'
      });
      
      // Keep only last 10 posts in memory
      if (this.recentPosts.length > 10) {
        this.recentPosts.shift();
      }
      
      console.log(`📊 [KOL CONTENT] Content cycles today: ${this.todayPostCount}/${this.todayTargetPosts || this.postsPerDay.max}`);

      return { success: true };
    } catch (error) {
      console.error('❌ [KOL CONTENT] Error posting KOL content:', error);
      return { success: false, error: error.message };
    }
  }

  // Start the daily posting scheduler
  start() {
    if (this.isRunning) {
      console.log('⚠️ [KOL CONTENT] Service already running');
      return;
    }

    this.isRunning = true;
    console.log('🚀 [KOL CONTENT] Service started');
    console.log('🎤 [KOL CONTENT] Mode: Authentic KOL content (2 memecoins)');
    console.log('📝 [KOL CONTENT] Format: Mix of singles, short threads, deep-dives');
    console.log(`⏰ [KOL CONTENT] Active hours: ${this.activeHours.start}:00-${this.activeHours.end}:00 UTC`);
    console.log(`📅 [KOL CONTENT] Frequency: Once per day (30-60 min apart)`);

    // Schedule next post
    this.scheduleNextPost();
    
    // Save running state to disk
    this.saveState();
  }

  // Schedule the next post check (every 15 minutes for responsive config-based posting)
  scheduleNextPost() {
    if (!this.isRunning) return;

    // Check every 15 minutes for configuration-based posting opportunities
    const checkInterval = 15 * 60 * 1000; // 15 minutes
    const nextCheckDate = new Date(Date.now() + checkInterval);
    
    // Store the next check time for status display
    this.nextPostTime = nextCheckDate.toISOString();

    console.log(`⏰ [KOL CONTENT] Next check scheduled for: ${nextCheckDate.toISOString()}`);

    this.scheduledTimeout = setTimeout(async () => {
      // Check if we should post based on configuration
      const shouldPost = this.shouldPostBasedOnConfig();
      
      if (shouldPost) {
        console.log(`🎯 [KOL CONTENT] Configuration check: POST NOW`);
        await this.postKOLContent();
      } else {
        console.log(`⏸️ [KOL CONTENT] Configuration check: WAIT`);
      }

      // Schedule next check
      this.scheduleNextPost();
    }, checkInterval);
  }

  // Check if we should post based on configuration
  shouldPostBasedOnConfig() {
    // Reset daily counter if needed
    this.resetDailyCounter();

    // Check if we've hit daily limit
    if (this.todayPostCount >= this.postsPerDay.max) {
      console.log(`⏰ [KOL CONTENT] Daily limit reached (${this.todayPostCount}/${this.postsPerDay.max})`);
      return false;
    }

    // Check if we need minimum posts for today
    if (this.todayPostCount < this.postsPerDay.min) {
      console.log(`📈 [KOL CONTENT] Need minimum posts (${this.todayPostCount}/${this.postsPerDay.min})`);
      return true;
    }

    // Check if we're within active hours
    const now = new Date();
    const currentHour = now.getUTCHours();
    if (currentHour < this.activeHours.start || currentHour >= this.activeHours.end) {
      console.log(`⏰ [KOL CONTENT] Outside active hours (${currentHour}h, active: ${this.activeHours.start}-${this.activeHours.end}h UTC)`);
      return false;
    }

    // Check minimum hours between posts
    if (this.recentPosts.length > 0) {
      const lastPost = this.recentPosts[this.recentPosts.length - 1];
      const timeSinceLastPost = Date.now() - lastPost.timestamp;
      const minIntervalMs = this.minHoursBetweenPosts * 60 * 60 * 1000;
      
      if (timeSinceLastPost < minIntervalMs) {
        const hoursRemaining = ((minIntervalMs - timeSinceLastPost) / (60 * 60 * 1000)).toFixed(1);
        console.log(`⏰ [KOL CONTENT] Min interval not met (${hoursRemaining}h remaining)`);
        return false;
      }
    }

    // Random mode: 30% chance to post if conditions met (to avoid too frequent posting)
    if (this.randomMode) {
      const shouldPost = Math.random() < 0.3; // 30% chance every 15 minutes = natural random timing
      console.log(`🎲 [KOL CONTENT] Random check: ${shouldPost ? 'POST' : 'WAIT'}`);
      return shouldPost;
    }

    // Fixed mode: only post if we haven't posted today
    return this.todayPostCount === 0;
  }

  // Stop the daily posting scheduler
  stop() {
    if (this.scheduledTimeout) {
      clearTimeout(this.scheduledTimeout);
      this.scheduledTimeout = null;
    }
    this.nextPostTime = null;
    this.isRunning = false;
    console.log('🛑 [KOL CONTENT] Service stopped');
    
    // Save stopped state to disk
    this.saveState();
  }

  // Post immediately (for testing)
  async postNow() {
    console.log('⚡ [KOL CONTENT] Posting immediately (manual trigger)...');
    return await this.postKOLContent();
  }
}

export default DailyTweetService;

