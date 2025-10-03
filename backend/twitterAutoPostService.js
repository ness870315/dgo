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
    
    // Community-focused hype message templates
    this.messageTemplates = {
      '500x': [
        '🔥 A Chad just got a 500x FUEL for ${symbol}! The community is rallying! 🚀',
        '⚡ Community member just FUELED ${symbol} with 500x! Diamond hands forming! 💎',
        '🎯 Someone from the degen fam just went 500x FUEL on ${symbol}! Respect! 🔥',
        '💣 BOOM! The community just FUELED ${symbol} with 500x! This is how legends are made! 🌙',
        '🚨 A true believer just dropped 500x FUEL on ${symbol}! The cult grows stronger! 🐋',
        '⚡ ${symbol} just got 500x FUEL from the community! The vibes are immaculate! 💥',
        '🔥 Community FUELED ${symbol} with 500x! Someone sees the vision! 🚀',
        '💎 A degen just activated 500x FUEL for ${symbol}! Diamond hands only! ✨',
        '🎪 The community has spoken! ${symbol} just got 500x FUEL! LFG! 🎭',
        '🌟 ${symbol} shining with 500x FUEL from a Chad! Community strong! 🔥',
        '👑 One of our own just FUELED ${symbol} with 500x! This is the way! 💪',
        '🚀 Community power! ${symbol} just received 500x FUEL! To the moon together! 🌙',
        '💪 A degen champion FUELED ${symbol} with 500x! The movement grows! 🔥',
        '⚡ ${symbol} got 500x FUEL! Community building in real time! 💎',
        '🔥 Someone just showed ${symbol} some love with 500x FUEL! Cult status incoming! 👀'
      ],
      '1000x': [
        '🚀🚀🚀 Community just FUELED ${symbol} with 1000x! This is how cults are formed! 🚨',
        '⚡⚡ MEGA CHAD ALERT! Someone FUELED ${symbol} with 1000x! The community is ascending! 🌙',
        '💥 A true believer just dropped 1000x FUEL on ${symbol}! This is legendary! 💎',
        '🔥🔥🔥 Community member went FULL SEND! ${symbol} 1000x FUELED! WAGMI! 🎯',
        '🚨 WHALE FROM OUR RANKS! ${symbol} just got 1000x FUEL! The cult is REAL! 🐋',
        '⚡ ABSOLUTE LEGEND! Someone FUELED ${symbol} with 1000x! Community on fire! 👑',
        '🎰 A degen hero just went ALL IN! ${symbol} 1000x FUELED! This is how we win! 🔥',
        '💣💣 NUCLEAR COMMUNITY POWER! ${symbol} 1000x FUELED! We\'re so back! 🚀',
        '🌟 The prophecy is real! ${symbol} got 1000x FUEL! Community united! ⚡',
        '🔥 HISTORIC MOMENT! Community FUELED ${symbol} with 1000x! Nothing can stop us! 💎',
        '👑 A KING AMONG US! ${symbol} just received 1000x FUEL! This is peak degen! 🔥',
        '💪 Community strength! Someone FUELED ${symbol} with 1000x! Cult status achieved! 🚀',
        '⚡⚡ THE MADMAN DID IT! ${symbol} 1000x FUELED! Community momentum unstoppable! 💥',
        '🚀 One of our own went MAXIMUM FUEL on ${symbol} - 1000x! LFG! 🌙',
        '🔥 ${symbol} 1000x FUELED by the community! This is how empires are built! 👑'
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

