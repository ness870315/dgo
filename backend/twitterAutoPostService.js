/**
 * Twitter Auto-Post Service
 * Automatically posts high-tier fuel announcements to @dgnoracle
 * Uses existing OAuthXService for posting
 */

class TwitterAutoPostService {
  constructor(oauthXService) {
    this.oauthXService = oauthXService;
    
    // System user ID for @dgnoracle - you can set this via env or use a default
    // This should be the userId of @dgnoracle after it authenticates via OAuth
    this.dgnOracleUserId = process.env.DGNORACLE_USER_ID || null;
    
    console.log('🐦 Twitter Auto-Post Service initialized for @dgnoracle');
    console.log(`   DgnOracle User ID: ${this.dgnOracleUserId ? '✅ Set' : '❌ Not Set (use DGNORACLE_USER_ID env var)'}`);
    
    if (!this.dgnOracleUserId) {
      console.warn('⚠️ Twitter Auto-Post is DISABLED');
      console.warn('   @dgnoracle needs to authenticate via OAuth first');
      console.warn('   Then set DGNORACLE_USER_ID env var to the userId');
    } else {
      console.log('✅ Twitter Auto-Post is ENABLED for @dgnoracle');
    }
    
    // Hype message templates
    this.messageTemplates = {
      '500x': [
        '🔥 ${symbol} just got a 500x Fuel! The degen army is mobilizing! 🚀',
        '⚡ MEGA FUEL ALERT! ${symbol} powered up with 500x! 💎',
        '🎯 Someone just went ALL IN on ${symbol} with 500x Fuel! 🔥🔥🔥',
        '💣 BOOM! ${symbol} got the 500x treatment! To the moon! 🌙',
        '🚨 MASSIVE 500x Fuel on ${symbol}! The whales are watching! 🐋',
        '⚡ ${symbol} just received 500x Fuel! This is HUGE! 💥',
        '🔥🔥 ${symbol} 500x FUELED! Someone believes! 🚀🚀',
        '💎 ${symbol} got the 500x boost! Diamond hands activated! ✨',
        '🎪 The circus is in town! ${symbol} just got 500x Fuel! 🎭',
        '🌟 ${symbol} shining bright with 500x Fuel! LFG! 🔥'
      ],
      '1000x': [
        '🚀🚀🚀 ${symbol} JUST GOT 1000x FUEL! THIS IS NOT A DRILL! 🚨',
        '⚡⚡ ULTRA MEGA FUEL! ${symbol} with 1000x! MOONSHOT INCOMING! 🌙',
        '💥 NUCLEAR FUEL ALERT! ${symbol} 1000x! The ultimate bet! 💎',
        '🔥🔥🔥 ${symbol} 1000x FUELED! Someone went FULL DEGEN! 🎯',
        '🚨 WHALE ALERT! ${symbol} just received 1000x Fuel! 🐋💰',
        '⚡ MAXIMUM POWER! ${symbol} 1000x FUEL! This is legendary! 👑',
        '🎰 ALL IN! ${symbol} just got the 1000x treatment! YOLO! 🔥',
        '💣💣 DOUBLE NUCLEAR! ${symbol} 1000x FUELED! LFG! 🚀🚀',
        '🌟 ${symbol} with 1000x Fuel! The gods have spoken! ⚡⚡',
        '🔥 HISTORIC MOMENT! ${symbol} 1000x FUEL! This is the way! 💎✨'
      ]
    };
  }


  /**
   * Get a random hype message
   */
  getHypeMessage(fuelType, symbol) {
    const templates = this.messageTemplates[fuelType] || this.messageTemplates['500x'];
    const template = templates[Math.floor(Math.random() * templates.length)];
    return template.replace('${symbol}', `$${symbol}`);
  }

  /**
   * Post a tweet to @dgnoracle using existing OAuth service
   */
  async postTweet(text) {
    if (!this.dgnOracleUserId) {
      console.log('⚠️ Twitter Auto-Post is disabled - @dgnoracle not authenticated');
      return { success: false, reason: 'not_authenticated' };
    }

    try {
      console.log('🐦 Posting tweet to @dgnoracle...');
      console.log(`   Text: ${text}`);
      
      // Use existing oauthXService to post tweet
      const tweet = await this.oauthXService.postTweet(this.dgnOracleUserId, text);
      
      console.log('✅ Tweet posted successfully!');
      console.log(`   Tweet ID: ${tweet.id}`);
      
      return {
        success: true,
        tweetId: tweet.id,
        text: tweet.text
      };

    } catch (error) {
      console.error('❌ Failed to post tweet:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Post fuel announcement with optional Twitter handle tagging
   */
  async postFuelAnnouncement(token, fuelType, user = null) {
    if (!this.dgnOracleUserId) {
      console.log('⚠️ Twitter Auto-Post is disabled - @dgnoracle not authenticated');
      return { success: false, reason: 'not_authenticated' };
    }

    try {
      const symbol = token.symbol || 'TOKEN';
      const fuelUrl = `https://degen-oracle.com/fuel/${fuelType}/${symbol}`;
      
      // Check for token's Twitter handle from socials or jupiterData
      let twitterHandle = null;
      
      // Priority 1: token.socials.twitter
      if (token.socials?.twitter && token.socials.twitter !== 'not_found' && token.socials.twitter !== '') {
        twitterHandle = token.socials.twitter;
      }
      // Priority 2: token.jupiterData.twitter
      else if (token.jupiterData?.twitter && token.jupiterData.twitter !== 'not_found' && token.jupiterData.twitter !== '') {
        twitterHandle = token.jupiterData.twitter;
      }
      // Priority 3: token.twitterHandle (legacy field)
      else if (token.twitterHandle && token.twitterHandle !== 'not_found' && token.twitterHandle !== '') {
        twitterHandle = token.twitterHandle;
      }
      
      // Extract handle from URL or normalize
      if (twitterHandle) {
        twitterHandle = twitterHandle.trim();
        
        // If it's a URL, extract the handle
        if (twitterHandle.includes('twitter.com/') || twitterHandle.includes('x.com/')) {
          const urlMatch = twitterHandle.match(/(?:twitter\.com|x\.com)\/([^/?#]+)/);
          if (urlMatch && urlMatch[1]) {
            twitterHandle = urlMatch[1];
          }
        }
        
        // Ensure it starts with @
        if (!twitterHandle.startsWith('@')) {
          twitterHandle = '@' + twitterHandle;
        }
        
        console.log(`🐦 Found Twitter handle for ${symbol}: ${twitterHandle}`);
      } else {
        console.log(`⚠️ No Twitter handle found for ${symbol}`);
      }
      
      // Generate hype message
      const hypeMessage = this.getHypeMessage(fuelType, symbol);
      
      // Construct tweet text - add Twitter handle if available
      let tweetText;
      if (twitterHandle) {
        // Include the handle to tag the token's account
        tweetText = `${hypeMessage}\n\n${twitterHandle} 🔥\n\n${fuelUrl}`;
      } else {
        // No handle - use standard format
        tweetText = `${hypeMessage}\n\n${fuelUrl}`;
      }
      
      console.log(`🔥 Auto-posting ${fuelType} fuel announcement for ${symbol}`);
      if (user) {
        console.log(`   Fueled by: @${user.username}`);
      }
      if (twitterHandle) {
        console.log(`   Tagging: ${twitterHandle}`);
      }
      
      // Post the tweet
      const result = await this.postTweet(tweetText);
      
      if (result.success) {
        console.log(`✅ Successfully posted ${fuelType} fuel announcement for ${symbol}`);
        console.log(`   Tweet URL: https://twitter.com/dgnoracle/status/${result.tweetId}`);
      }
      
      return result;

    } catch (error) {
      console.error('❌ Error posting fuel announcement:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Post a promotional tweet (for daily marketing posts)
   */
  async postPromotionalTweet(text) {
    if (!this.dgnOracleUserId) {
      console.log('⚠️ Twitter Auto-Post is disabled - @dgnoracle not authenticated');
      return { success: false, reason: 'not_authenticated' };
    }

    try {
      console.log('🐦 Posting promotional tweet to @dgnoracle...');
      console.log(`   Text: ${text}`);
      
      // Use existing oauthXService to post tweet
      const tweet = await this.oauthXService.postTweet(this.dgnOracleUserId, text);
      
      console.log('✅ Promotional tweet posted successfully!');
      console.log(`   Tweet ID: ${tweet.id}`);
      
      return {
        success: true,
        tweetId: tweet.id,
        text: tweet.text
      };

    } catch (error) {
      console.error('❌ Failed to post promotional tweet:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Check if auto-posting is enabled
   */
  isAutoPostEnabled() {
    return !!this.dgnOracleUserId;
  }
}

export default TwitterAutoPostService;

