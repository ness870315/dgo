// Daily Promotional Tweet Service for @dgnoracle
// Posts once a day to promote the Degen Oracle platform

import { generateTweet, generateTweetWithLLM } from './storyFramework.js';

class DailyTweetService {
  constructor(twitterAutoPostService, openaiService = null) {
    this.twitterAutoPostService = twitterAutoPostService;
    this.openaiService = openaiService;
    this.isRunning = false;
    this.scheduledTime = { hour: 14, minute: 0 }; // 2:00 PM UTC by default
  }

  // Set the daily posting time (24-hour format, UTC)
  setScheduledTime(hour, minute) {
    this.scheduledTime = { hour, minute };
    console.log(`📅 [DAILY TWEET] Scheduled time updated to ${hour}:${String(minute).padStart(2, '0')} UTC`);
  }

  // Calculate milliseconds until next scheduled post
  getMillisecondsUntilNextPost() {
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
    console.log(`⏰ [DAILY TWEET] Will post daily at ${this.scheduledTime.hour}:${String(this.scheduledTime.minute).padStart(2, '0')} UTC`);

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

