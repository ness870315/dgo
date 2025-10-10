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
        activeHours: this.activeHours,
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
        activeHours: this.activeHours,
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

  // Generate and post KOL content (delegates to KOLContentService configuration)
  async postKOLContent() {
    try {
      if (!this.kolContentService) {
        console.error('❌ [KOL CONTENT] KOL Content Service not initialized');
        return { success: false, error: 'KOL Content Service not available' };
      }

      // Initialize if needed
      if (!this.kolContentService.openaiService.isInitialized) {
        await this.kolContentService.initialize();
      }

      // Update KOL Content Service with current panel configuration
      this.kolContentService.updateConfig({
        mode: this.randomMode ? 'random' : 'fixed',
        minPostsPerDay: this.postsPerDay.min,
        maxPostsPerDay: this.postsPerDay.max,
        minHoursBetween: this.minHoursBetweenPosts,
        activeHours: this.activeHours,
        useOpenAI: true
      });

      // Let KOLContentService handle all the posting logic based on its configuration
      await this.kolContentService.runDailyContentCycle(this.twitterAutoPostService.oauthXService);

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
      // Always call postKOLContent - it will delegate to KOLContentService's configuration logic
      console.log(`🎯 [KOL CONTENT] Configuration check...`);
      await this.postKOLContent();

      // Schedule next check
      this.scheduleNextPost();
    }, checkInterval);
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

  // Post immediately (for testing) - OVERRIDES ALL CONFIGURATION CONTROLS
  async postNow(contentType = 'random') {
    console.log(`⚡ [KOL CONTENT] Posting immediately (manual trigger - OVERRIDING CONFIG) - Type: ${contentType}...`);
    
    try {
      if (!this.kolContentService) {
        console.error('❌ [KOL CONTENT] KOL Content Service not initialized');
        return { success: false, error: 'KOL Content Service not available' };
      }

      // Initialize if needed
      if (!this.kolContentService.openaiService.isInitialized) {
        await this.kolContentService.initialize();
      }

      // FORCE POST BY BYPASSING shouldPostContent() - Generate content directly
      console.log('🎯 [KOL CONTENT] Bypassing configuration controls - generating content now...');
      
      // Generate content directly without checking configuration, with specified type
      const content = await this.kolContentService.forceGenerateContent(contentType);
      
      if (!content) {
        console.log('❌ [KOL CONTENT] Failed to generate content');
        return { success: false, error: 'Failed to generate content' };
      }

      // Post the content directly
      console.log(`\n📤 [KOL CONTENT] FORCING POST: $${content.token.symbol} (${content.format})`);
      await this.kolContentService.postThread(content.tweets, this.twitterAutoPostService.oauthXService);

      // Update tracking (but don't increment daily count since this is manual override)
      this.lastTweetTime = Date.now();
      
      console.log('✅ [KOL CONTENT] Manual post completed successfully');
      console.log(`📊 [KOL CONTENT] Posted: ${content.format} (${content.tweets.length} tweet${content.tweets.length > 1 ? 's' : ''})`);
      console.log(`🎯 [KOL CONTENT] Configuration override - daily count unchanged: ${this.todayPostCount}/${this.postsPerDay.max}`);

      return { 
        success: true, 
        message: `Posted ${content.format} content for $${content.token.symbol}`,
        content: content
      };

    } catch (error) {
      console.error('❌ [KOL CONTENT] Error in manual post:', error.message);
      return { success: false, error: error.message };
    }
  }
}

export default DailyTweetService;

