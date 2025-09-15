import HybridDatabaseService from './hybridDatabaseService.js';
import OAuthXService from './oauthXService.js';

/**
 * Failed Call Tweet Service - Handles retry of failed first call tweets
 * Similar to milestone tracker but for initial call posts
 */
class FailedCallTweetService {
  constructor() {
    this.db = new HybridDatabaseService();
    this.oauthXService = new OAuthXService();
  }

  /**
   * Store failed call tweet for retry when user re-authenticates
   */
  async storeFailedCallTweet(userId, callData, error) {
    try {
      const failedCallTweet = {
        userId,
        callId: callData.id,
        tokenSymbol: callData.token?.symbol,
        tokenName: callData.token?.name,
        contractAddress: callData.token?.contractAddress,
        thesis: callData.thesis,
        calledMc: callData.calledMc,
        calledPrice: callData.calledPrice,
        calledAt: callData.calledAt,
        error: error.message,
        timestamp: new Date().toISOString(),
        retryCount: 0
      };

      // Store in database for retry
      await this.db.storeFailedCallTweet(failedCallTweet);
      console.log(`💾 Stored failed call tweet for retry: ${callData.token?.symbol} (User: ${userId})`);
    } catch (storeError) {
      console.error(`❌ Error storing failed call tweet:`, storeError.message);
    }
  }

  /**
   * Retry failed call tweets for a user after re-authentication
   */
  async retryFailedCallTweets(userId) {
    try {
      console.log(`🔄 Retrying failed call tweets for user ${userId}...`);
      
      const failedCallTweets = await this.db.getFailedCallTweets(userId);
      
      if (failedCallTweets.length === 0) {
        console.log(`✅ No failed call tweets to retry for user ${userId}`);
        return { success: true, retried: 0 };
      }

      console.log(`📊 Found ${failedCallTweets.length} failed call tweets to retry`);

      let successCount = 0;
      let errorCount = 0;

      for (const failedCallTweet of failedCallTweets) {
        try {
          // Check if retry limit exceeded (max 3 retries)
          if (failedCallTweet.retryCount >= 3) {
            console.log(`⚠️ Call tweet ${failedCallTweet.id} exceeded retry limit, removing`);
            await this.db.removeFailedCallTweet(failedCallTweet.id);
            continue;
          }

          // Post the call tweet
          const tweet = await this.oauthXService.postTweet(userId, failedCallTweet.thesis);
          
          // Update the call record with the successful tweet ID
          await this.updateCallWithTweetId(userId, failedCallTweet.callId, tweet.id);
          
          // Remove from failed call tweets
          await this.db.removeFailedCallTweet(failedCallTweet.id);
          
          successCount++;
          console.log(`✅ Successfully posted call tweet for ${failedCallTweet.tokenSymbol}: ${tweet.id}`);
          
        } catch (error) {
          errorCount++;
          console.error(`❌ Failed to retry call tweet for ${failedCallTweet.tokenSymbol}:`, error.message);
          
          // Increment retry count
          await this.db.incrementFailedCallTweetRetryCount(failedCallTweet.id);
        }
      }

      console.log(`🎯 Call tweet retry complete: ${successCount}/${failedCallTweets.length} tweets posted successfully`);
      
      return {
        success: true,
        retried: successCount,
        errors: errorCount,
        total: failedCallTweets.length
      };
      
    } catch (error) {
      console.error(`❌ Error retrying failed call tweets for user ${userId}:`, error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Update call record with successful tweet ID
   */
  async updateCallWithTweetId(userId, callId, tweetId) {
    try {
      const calls = await this.db.getKolCalls(userId);
      const callIndex = calls.findIndex(c => c.id === callId);
      
      if (callIndex === -1) {
        console.log(`❌ Call ${callId} not found for user ${userId}`);
        return;
      }

      // Update call with tweet ID
      calls[callIndex].twitterPostId = tweetId;
      calls[callIndex].twitterEnabled = true;
      calls[callIndex].lastUpdated = new Date().toISOString();

      // Save updated calls
      await this.db.writeJsonFile(
        this.db.getUserFile(userId, 'kol-calls.json'),
        calls
      );
      
      console.log(`✅ Updated call ${callId} with tweet ID: ${tweetId}`);
    } catch (error) {
      console.error(`❌ Error updating call with tweet ID:`, error.message);
    }
  }

  /**
   * Get failed call tweets for a user (for admin/debugging)
   */
  async getFailedCallTweets(userId) {
    try {
      return await this.db.getFailedCallTweets(userId);
    } catch (error) {
      console.error(`❌ Error getting failed call tweets:`, error.message);
      return [];
    }
  }

  /**
   * Remove a specific failed call tweet
   */
  async removeFailedCallTweet(failedCallTweetId) {
    try {
      await this.db.removeFailedCallTweet(failedCallTweetId);
      console.log(`✅ Removed failed call tweet: ${failedCallTweetId}`);
    } catch (error) {
      console.error(`❌ Error removing failed call tweet:`, error.message);
      throw error;
    }
  }
}

export default FailedCallTweetService;
