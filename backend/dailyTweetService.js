// Daily Promotional Tweet Service for @dgnoracle
// Posts once a day to promote the Degen Oracle platform

import { generateTweet, generateTweetWithLLM } from './storyFramework.js';

class DailyTweetService {
  constructor(twitterAutoPostService, openaiService = null) {
    this.twitterAutoPostService = twitterAutoPostService;
    this.openaiService = openaiService;
    this.isRunning = false;
    
    // Random posting configuration
    this.randomMode = true; // Use random timing by default
    this.postsPerDay = { min: 1, max: 3 }; // Random 1-3 posts per day
    this.activeHours = { start: 8, end: 22 }; // Only post between 8 AM - 10 PM UTC (peak hours)
    this.minHoursBetweenPosts = 3; // Minimum 3 hours between posts
    
    // Fixed schedule fallback (if randomMode = false)
    this.scheduledTime = { hour: 14, minute: 0 }; // 2:00 PM UTC by default
    
    // Track recent posts for spacing
    this.recentPosts = [];
    this.todayPostCount = 0;
    this.lastPostDate = null;
  }

  // Set random posting configuration
  setRandomConfig(config) {
    if (config.minPosts !== undefined) this.postsPerDay.min = config.minPosts;
    if (config.maxPosts !== undefined) this.postsPerDay.max = config.maxPosts;
    if (config.activeStart !== undefined) this.activeHours.start = config.activeStart;
    if (config.activeEnd !== undefined) this.activeHours.end = config.activeEnd;
    if (config.minHoursBetween !== undefined) this.minHoursBetweenPosts = config.minHoursBetween;
    
    console.log(`📅 [DAILY TWEET] Random config updated:`, {
      postsPerDay: `${this.postsPerDay.min}-${this.postsPerDay.max}`,
      activeHours: `${this.activeHours.start}:00-${this.activeHours.end}:00 UTC`,
      minHoursBetween: `${this.minHoursBetweenPosts}h`
    });
  }

  // Toggle between random and fixed scheduling
  setMode(mode) {
    this.randomMode = mode === 'random';
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

  // Generate and post a promotional tweet
  async postPromotionalTweet(useLLM = true) {
    try {
      console.log('🐦 [DAILY TWEET] Generating promotional tweet...');

      // Generate tweet content
      let tweetContent;
      if (useLLM && this.openaiService) {
        console.log('🤖 [DAILY TWEET] Using OpenAI for natural variation...');
        tweetContent = await generateTweetWithLLM(this.openaiService);
      } else {
        console.log('📝 [DAILY TWEET] Using template mix & match...');
        tweetContent = generateTweet(0.4); // 40% chance of including link
      }

      console.log('📄 [DAILY TWEET] Generated content:', tweetContent);

      // Post to Twitter as @dgnoracle
      const result = await this.twitterAutoPostService.postPromotionalTweet(tweetContent);

      if (result.success) {
        console.log('✅ [DAILY TWEET] Successfully posted promotional tweet!');
        console.log(`🔗 Tweet URL: https://twitter.com/dgnoracle/status/${result.tweetId}`);
        
        // Track the post
        this.todayPostCount++;
        this.recentPosts.push({
          timestamp: Date.now(),
          tweetId: result.tweetId,
          content: tweetContent
        });
        
        // Keep only last 10 posts in memory
        if (this.recentPosts.length > 10) {
          this.recentPosts.shift();
        }
        
        console.log(`📊 [DAILY TWEET] Posts today: ${this.todayPostCount}/${this.todayTargetPosts || this.postsPerDay.max}`);
      } else {
        console.error('❌ [DAILY TWEET] Failed to post tweet:', result.error);
      }

      return result;
    } catch (error) {
      console.error('❌ [DAILY TWEET] Error posting promotional tweet:', error);
      return { success: false, error: error.message };
    }
  }

  // Start the daily posting scheduler
  start(useLLM = true) {
    if (this.isRunning) {
      console.log('⚠️ [DAILY TWEET] Service already running');
      return;
    }

    this.isRunning = true;
    console.log('🚀 [DAILY TWEET] Service started');
    
    if (this.randomMode) {
      console.log(`🎲 [DAILY TWEET] RANDOM MODE: ${this.postsPerDay.min}-${this.postsPerDay.max} posts/day`);
      console.log(`⏰ [DAILY TWEET] Active hours: ${this.activeHours.start}:00-${this.activeHours.end}:00 UTC`);
      console.log(`⏱️ [DAILY TWEET] Min ${this.minHoursBetweenPosts}h between posts`);
    } else {
      console.log(`⏰ [DAILY TWEET] FIXED SCHEDULE: ${this.scheduledTime.hour}:${String(this.scheduledTime.minute).padStart(2, '0')} UTC daily`);
    }

    // Schedule next post
    this.scheduleNextPost(useLLM);
  }

  // Schedule the next post
  scheduleNextPost(useLLM) {
    if (!this.isRunning) return;

    const msUntilNext = this.getMillisecondsUntilNextPost();
    const nextPostDate = new Date(Date.now() + msUntilNext);

    console.log(`⏰ [DAILY TWEET] Next post scheduled for: ${nextPostDate.toISOString()}`);
    console.log(`⏰ [DAILY TWEET] Time until next post: ${(msUntilNext / 3600000).toFixed(1)} hours`);

    this.scheduledTimeout = setTimeout(async () => {
      // Post the tweet
      await this.postPromotionalTweet(useLLM);

      // Schedule next post (24 hours later)
      this.scheduleNextPost(useLLM);
    }, msUntilNext);
  }

  // Stop the daily posting scheduler
  stop() {
    if (this.scheduledTimeout) {
      clearTimeout(this.scheduledTimeout);
      this.scheduledTimeout = null;
    }
    this.isRunning = false;
    console.log('🛑 [DAILY TWEET] Service stopped');
  }

  // Post immediately (for testing)
  async postNow(useLLM = true) {
    console.log('⚡ [DAILY TWEET] Posting immediately (manual trigger)...');
    return await this.postPromotionalTweet(useLLM);
  }
}

export default DailyTweetService;

