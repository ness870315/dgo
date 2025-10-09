import fetch from 'node-fetch';
import OpenAIService from './openaiService.js';

/**
 * KOL Content Service - Generate authentic crypto influencer content
 * Combines trending system data + web search for real crypto KOL vibes
 * Replaces the old story framework with data-driven, news-aware content
 */
class KOLContentService {
  constructor(backendInstance) {
    this.backend = backendInstance;
    this.openaiService = new OpenAIService();
    this.lastTweetTime = null;
    this.tweetInterval = 6 * 60 * 60 * 1000; // 6 hours = 4 tweets per day
    
    // KOL Personalities - Authentic crypto influencer styles
    this.personalities = [
      {
        name: 'Alpha Hunter',
        style: 'Data-obsessed analyst who shares alpha with receipts',
        tone: 'Analytical but accessible, uses numbers to tell stories'
      },
      {
        name: 'Degen Philosopher',
        style: 'Mix of wisdom and recklessness, calls it as they see it',
        tone: 'Philosophical but degenerate, crypto-native slang heavy'
      },
      {
        name: 'Whale Watcher',
        style: 'Tracks smart money, reports on what the big players are doing',
        tone: 'Insider vibes, focuses on whale movements and flow'
      },
      {
        name: 'Hype Detector',
        style: 'Spots trends early, explains why things are pumping',
        tone: 'Excited but informed, connects dots between news and price'
      },
      {
        name: 'Risk Manager',
        style: 'Conservative but bullish when it matters, protects the community',
        tone: 'Cautious wisdom, warns about risks while highlighting opportunities'
      }
    ];
    
    this.currentPersonalityIndex = 0;
  }

  async initialize() {
    if (!this.openaiService.isInitialized) {
      await this.openaiService.initialize();
    }
    console.log('🎤 KOL Content Service initialized');
  }

  /**
   * Get trending tokens from backend system
   */
  async getTrendingTokens(limit = 20) {
    try {
      const apiBaseUrl = process.env.NODE_ENV === 'production' 
        ? 'https://api.degen-oracle.com'
        : process.env.API_BASE_URL || 'http://localhost:3001';
      
      const response = await fetch(`${apiBaseUrl}/api/tokens/trending?limit=${limit}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const tokens = await response.json();
      
      console.log(`✅ Fetched ${tokens.length} trending tokens for KOL content`);
      return tokens;
      
    } catch (error) {
      console.error('❌ Error fetching trending tokens:', error.message);
      return [];
    }
  }

  /**
   * Select random token from top 5 trending (uses our trending system directly)
   */
  async selectRandomTrendingToken() {
    const trending = await this.getTrendingTokens(20);
    
    if (trending.length === 0) {
      console.log('⚠️ No trending tokens available from our system');
      return null;
    }

    console.log(`📋 Received ${trending.length} trending tokens from Degen Oracle system`);

    // Backend already filters out broken tokens, so we can trust the data
    // Take top 5 and randomly pick one
    const top5 = trending.slice(0, Math.min(5, trending.length));
    const selected = top5[Math.floor(Math.random() * top5.length)];
    
    console.log(`🎯 Randomly selected from top 5: $${selected.symbol}`, {
      rank: top5.indexOf(selected) + 1,
      mcap: `$${((selected.mcap || 0) / 1_000_000).toFixed(2)}M`,
      score: (selected.overallScore || 0).toFixed(1),
      priceChange: `${(selected.priceChange24h || 0).toFixed(1)}%`
    });
    
    return selected;
  }

  /**
   * Generate KOL-style content for a token (single tweet or thread starter)
   */
  async generateTokenContent(token, contentType = 'single') {
    try {
      // Get token metrics
      const mcap = token.mcap || token.marketCap || 0;
      const volume24h = token.volume24h || 0;
      const volumeToMcap = mcap > 0 ? ((volume24h / mcap) * 100).toFixed(1) : 0;
      const priceChange = token.priceChange24h || 0;
      const holders = token.holderCount || 0;
      const score = token.overallScore || 0;
      
      // Get Jupiter data if available
      const liquidity = token.liquidity || token.jupiterData?.liquidity || 0;
      const buyPressure = token.jupiterData?.stats24h?.buyVolume || 0;
      const sellPressure = token.jupiterData?.stats24h?.sellVolume || 0;
      const buyPct = (buyPressure + sellPressure) > 0 
        ? ((buyPressure / (buyPressure + sellPressure)) * 100).toFixed(1) 
        : 50;

      // Select personality
      const personality = this.personalities[this.currentPersonalityIndex];
      this.currentPersonalityIndex = (this.currentPersonalityIndex + 1) % this.personalities.length;

      const dataContext = `
📊 TOKEN METRICS (From Degen Oracle Analytics):
Symbol: $${token.symbol}
Name: ${token.name}
Contract: ${token.contractAddress}
Market Cap: $${(mcap / 1_000_000).toFixed(2)}M
24h Volume: $${(volume24h / 1_000).toFixed(1)}K
Volume/MCap Ratio: ${volumeToMcap}%
Price Change 24h: ${priceChange > 0 ? '+' : ''}${priceChange.toFixed(1)}%
Buy Pressure: ${buyPct}%
Holders: ${holders.toLocaleString()}
Liquidity: $${(liquidity / 1_000).toFixed(1)}K
Degen Oracle Score: ${score.toFixed(1)}/10`;

      const prompt = `You are ${personality.name}, a real crypto KOL with ${personality.style}.

${dataContext}

🌐 WEB SEARCH TASK:
Search for recent information about $${token.symbol}:
1. Latest news/announcements (last 48 hours)
2. Twitter sentiment and trending discussions
3. Notable partnerships, listings, or developments
4. Any catalysts explaining the volume or price movement
5. What degens on CT are saying about it

CONTENT TYPE: ${contentType === 'single' ? 'Single tweet (280 chars)' : 'Thread starter tweet (280 chars)'}

Generate a ${contentType === 'single' ? 'standalone tweet' : 'thread starter'} that:
- Combines our analytics WITH web-searched news/catalysts
- ${personality.tone}
- Highlights the most interesting/surprising finding (data or news)
- If pumping: explain WHY (partnership, listing, whale activity, etc.)
- If good fundamentals but no pump yet: explain the opportunity
- Use crypto slang naturally (not forced)
- NO hashtags
- Include $${token.symbol} ticker
- Max 280 characters
- Sound like a real person sharing alpha, not a bot

${contentType === 'thread' ? '(This is tweet 1 of a thread - make it hook readers)' : ''}

Tweet:`;

      const content = await this.openaiService.generateCompletion(prompt, {
        maxTokens: 100,
        temperature: 0.8,
        model: 'gpt-5',
        enableWebSearch: true
      });

      // Clean up
      const cleanContent = content.trim()
        .replace(/#\w+/g, '') // Remove hashtags
        .replace(/\s+/g, ' ')
        .trim();

      console.log(`✍️ Generated ${contentType} content for $${token.symbol} (${personality.name})`);
      return cleanContent;

    } catch (error) {
      console.error(`❌ Error generating content for ${token.symbol}:`, error.message);
      return null;
    }
  }

  /**
   * Generate a thread about a token (3-4 tweets deep-dive)
   */
  async generateTokenThread(token) {
    try {
      console.log(`🧵 Generating thread for $${token.symbol}...`);

      // Tweet 1: Hook (interesting finding or question)
      const tweet1 = await this.generateTokenContent(token, 'thread');
      
      if (!tweet1) {
        throw new Error('Failed to generate tweet 1');
      }

      // Tweet 2: The data/metrics deep-dive
      const mcap = token.mcap || token.marketCap || 0;
      const volume24h = token.volume24h || 0;
      const volumeToMcap = mcap > 0 ? ((volume24h / mcap) * 100).toFixed(1) : 0;
      const priceChange = token.priceChange24h || 0;
      const holders = token.holderCount || 0;
      
      const buyPressure = token.jupiterData?.stats24h?.buyVolume || 0;
      const sellPressure = token.jupiterData?.stats24h?.sellVolume || 0;
      const buyPct = (buyPressure + sellPressure) > 0 
        ? ((buyPressure / (buyPressure + sellPressure)) * 100).toFixed(1) 
        : 50;

      const tweet2Prompt = `Write tweet 2 of a crypto thread about $${token.symbol}.

Tweet 1 was: "${tweet1}"

Now provide the DATA/METRICS breakdown:
- MCap: $${(mcap / 1_000_000).toFixed(2)}M
- 24h Volume: $${(volume24h / 1_000).toFixed(1)}K (${volumeToMcap}% of mcap)
- Price: ${priceChange > 0 ? '+' : ''}${priceChange.toFixed(1)}% (24h)
- Buy pressure: ${buyPct}%
- Holders: ${holders.toLocaleString()}

Present these numbers in a compelling way that tells a story.
What do these metrics reveal? What's the narrative?
Max 280 characters. Crypto slang. No hashtags.

Tweet 2:`;

      const tweet2 = await this.openaiService.generateCompletion(tweet2Prompt, {
        maxTokens: 100,
        temperature: 0.7,
        model: 'gpt-5-mini'
      });

      // Tweet 3: The verdict/recommendation
      const tweet3Prompt = `Write tweet 3 (final) of a crypto thread about $${token.symbol}.

Previous tweets covered the hook and the data.

Now give your VERDICT:
- Is this a call? Wait and watch? Or pass?
- What's the risk level?
- What should degens watch for next?

Be decisive. Take a stance. Give actionable advice.
Max 280 characters. Crypto slang. No hashtags.

Tweet 3:`;

      const tweet3 = await this.openaiService.generateCompletion(tweet3Prompt, {
        maxTokens: 100,
        temperature: 0.8,
        model: 'gpt-5-mini'
      });

      const thread = [
        tweet1.trim().replace(/#\w+/g, '').replace(/\s+/g, ' ').trim(),
        tweet2.trim().replace(/#\w+/g, '').replace(/\s+/g, ' ').trim(),
        tweet3.trim().replace(/#\w+/g, '').replace(/\s+/g, ' ').trim()
      ];

      console.log(`✅ Generated thread for $${token.symbol} (${thread.length} tweets)`);
      return thread;

    } catch (error) {
      console.error(`❌ Error generating thread for ${token.symbol}:`, error.message);
      return null;
    }
  }

  /**
   * Generate daily KOL content: Pick random token from top 5, random format
   */
  async generateDailyContent() {
    try {
      console.log('🎤 Generating daily KOL content...');

      // Select 1 random token from top 5 trending
      const token = await this.selectRandomTrendingToken();

      if (!token) {
        console.log('⚠️ No tokens available for content');
        return null;
      }

      // Decide content format randomly (more realistic distribution)
      const contentFormats = [
        'single',       // 35% - Single tweet
        'short',        // 30% - Short thread (2 tweets)
        'deep',         // 20% - Deep-dive thread (3 tweets)
        'meme'          // 15% - Meme/joke tweet
      ];

      const weights = [35, 30, 20, 15];
      const random = Math.random() * 100;
      let cumulative = 0;
      let selectedFormat = 'single';

      for (let i = 0; i < weights.length; i++) {
        cumulative += weights[i];
        if (random <= cumulative) {
          selectedFormat = contentFormats[i];
          break;
        }
      }

      console.log(`📝 Selected format: ${selectedFormat}`);

      // Generate content
      const content = await this.generateContentByFormat(token, selectedFormat);

      if (!content) {
        console.log('❌ Failed to generate content');
        return null;
      }

      console.log('✅ Daily KOL content generated successfully');
      return {
        token: token,
        tweets: content,
        format: selectedFormat,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('❌ Error generating daily content:', error.message);
      return null;
    }
  }

  /**
   * Generate content based on format (single, short, deep, meme)
   */
  async generateContentByFormat(token, format) {
    switch (format) {
      case 'single':
        const singleTweet = await this.generateTokenContent(token, 'single');
        return singleTweet ? [singleTweet] : null;
      
      case 'short':
        return await this.generateShortThread(token);
      
      case 'deep':
        return await this.generateTokenThread(token);
      
      case 'meme':
        return await this.generateMemeTweet(token);
      
      default:
        return null;
    }
  }

  /**
   * Generate crypto meme/joke tweet (market sentiment + humor)
   */
  async generateMemeTweet(token) {
    try {
      // 30% chance to do a general market meme instead of token-specific
      const isGeneralMeme = Math.random() < 0.3;
      
      if (isGeneralMeme) {
        return await this.generateGeneralMarketMeme();
      }

      console.log(`😂 Generating meme tweet for $${token.symbol}...`);

      const mcap = token.mcap || token.marketCap || 0;
      const priceChange = token.priceChange24h || 0;
      const volume24h = token.volume24h || 0;
      const volumeToMcap = mcap > 0 ? ((volume24h / mcap) * 100).toFixed(1) : 0;

      const memePrompt = `You're a crypto KOL with a great sense of humor. Generate a funny tweet about $${token.symbol}.

TOKEN CONTEXT:
- Price: ${priceChange > 0 ? '+' : ''}${priceChange.toFixed(1)}% (24h)
- MCap: $${(mcap / 1_000_000).toFixed(2)}M
- Volume/MCap: ${volumeToMcap}%

HUMOR STYLES (pick one that fits):
- If dumping: "someone needs to CTO [token]" or "exit liquidity szn" jokes
- If pumping hard: "ser this is a casino" or "10x in 3 days is normal here" humor
- If sideways: "consolidation = accumulation" or "bullish wedge on the 1min chart" jokes
- Low volume: "volume lower than my self-esteem" type jokes
- If memecoin: Self-aware degen humor about gambling

Also check Twitter sentiment with web search for current memes/jokes about this token or the broader market.

Make it:
- Relatable to crypto degens
- Self-aware and ironic
- Short and punchy
- Uses crypto slang naturally
- NO hashtags
- Max 280 characters

Meme tweet:`;

      const memeTweet = await this.openaiService.generateCompletion(memePrompt, {
        maxTokens: 100,
        temperature: 0.9, // High creativity for humor
        model: 'gpt-5',
        enableWebSearch: true
      });

      const cleanMeme = memeTweet.trim()
        .replace(/#\w+/g, '')
        .replace(/\s+/g, ' ')
        .trim();

      console.log(`✅ Generated meme tweet for $${token.symbol}`);
      return [cleanMeme];

    } catch (error) {
      console.error(`❌ Error generating meme tweet for ${token.symbol}:`, error.message);
      return null;
    }
  }

  /**
   * Generate general market sentiment meme (not token-specific)
   */
  async generateGeneralMarketMeme() {
    try {
      console.log('😂 Generating general market meme...');

      const generalMemePrompt = `You're a crypto KOL with great humor. Generate a funny tweet about the current crypto market.

Use web search to check:
- Is BTC/ETH up or down today?
- What's trending on Crypto Twitter right now?
- Any major news/events (SEC, regulations, hacks, etc.)?
- General market sentiment (fear? greed? crab?)

CLASSIC CRYPTO JOKES (pick what fits):
- BTC dumping: "looks like someone needs to CTO Bitcoin"
- Market crabbing: "this sideways action is violating the Geneva Convention"
- Green candles: "ser this is a Wendy's... I mean casino"
- Red candles: "my portfolio is a social experiment at this point"
- Hopium tweets: "trust me bro" energy
- TA jokes: "bullish wedge on the 1min chart, trust the science"
- Influencer jokes: "CT KOLs explaining why their -90% call was actually genius"
- Regulatory FUD: "Gary Gensler woke up and chose violence again"
- "It's different this time" copium
- "Few understand" memes
- "Zoom out" when dumping
- Exit liquidity jokes

Make it:
- Timely and relevant to TODAY's market
- Relatable to crypto degens
- Self-aware and ironic
- NO specific token mentions (general market vibes only)
- NO hashtags
- Max 280 characters

Market meme:`;

      const memeTweet = await this.openaiService.generateCompletion(generalMemePrompt, {
        maxTokens: 100,
        temperature: 0.95, // Very high creativity for humor
        model: 'gpt-5',
        enableWebSearch: true
      });

      const cleanMeme = memeTweet.trim()
        .replace(/#\w+/g, '')
        .replace(/\s+/g, ' ')
        .trim();

      console.log(`✅ Generated general market meme`);
      return [cleanMeme];

    } catch (error) {
      console.error('❌ Error generating general market meme:', error.message);
      return null;
    }
  }

  /**
   * Generate a short thread (2 tweets) - observation + quick take
   */
  async generateShortThread(token) {
    try {
      console.log(`🧵 Generating short thread (2 tweets) for $${token.symbol}...`);

      // Tweet 1: Observation/Data point
      const mcap = token.mcap || token.marketCap || 0;
      const volume24h = token.volume24h || 0;
      const volumeToMcap = mcap > 0 ? ((volume24h / mcap) * 100).toFixed(1) : 0;
      const priceChange = token.priceChange24h || 0;

      const tweet1Prompt = `Write a crypto tweet about $${token.symbol}.

Share ONE interesting observation:
- MCap: $${(mcap / 1_000_000).toFixed(2)}M
- 24h Volume: $${(volume24h / 1_000).toFixed(1)}K (${volumeToMcap}% of mcap)
- Price: ${priceChange > 0 ? '+' : ''}${priceChange.toFixed(1)}% (24h)

Pick the most interesting metric and present it naturally.
Use web search to find if there's recent news/catalyst.
Max 280 characters. Crypto slang. No hashtags.

Tweet:`;

      const tweet1 = await this.openaiService.generateCompletion(tweet1Prompt, {
        maxTokens: 100,
        temperature: 0.8,
        model: 'gpt-5',
        enableWebSearch: true
      });

      // Tweet 2: Quick take/opinion
      const tweet2Prompt = `Reply to: "${tweet1}"

Give your quick take on $${token.symbol}:
- Worth watching? Why?
- What's the vibe?
- Simple verdict

Keep it SHORT. One sentence. Crypto slang. No hashtags.

Reply:`;

      const tweet2 = await this.openaiService.generateCompletion(tweet2Prompt, {
        maxTokens: 80,
        temperature: 0.8,
        model: 'gpt-5-mini'
      });

      const thread = [
        tweet1.trim().replace(/#\w+/g, '').replace(/\s+/g, ' ').trim(),
        tweet2.trim().replace(/#\w+/g, '').replace(/\s+/g, ' ').trim()
      ];

      console.log(`✅ Generated short thread for $${token.symbol} (${thread.length} tweets)`);
      return thread;

    } catch (error) {
      console.error(`❌ Error generating short thread for ${token.symbol}:`, error.message);
      return null;
    }
  }

  /**
   * Post thread to Twitter
   */
  async postThread(tweets, oauthXService) {
    try {
      console.log(`📤 Posting thread (${tweets.length} tweets)...`);

      // Get @dgnoracle user ID from environment
      const dgnOracleUserId = process.env.DGNORACLE_USER_ID;
      if (!dgnOracleUserId) {
        throw new Error('DGNORACLE_USER_ID not set in environment');
      }

      let previousTweetId = null;

      for (let i = 0; i < tweets.length; i++) {
        const tweet = tweets[i];
        
        // Post as reply to previous tweet (if exists)
        const tweetId = await oauthXService.postReply(
          tweet,
          dgnOracleUserId, // @dgnoracle user ID
          previousTweetId // replyToId
        );

        if (!tweetId) {
          throw new Error(`Failed to post tweet ${i + 1}`);
        }

        console.log(`✅ Posted tweet ${i + 1}/${tweets.length}: ${tweetId}`);
        previousTweetId = tweetId;

        // Wait 5 seconds between tweets
        if (i < tweets.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      }

      console.log(`✅ Thread posted successfully (${tweets.length} tweets)`);
      return previousTweetId; // Return last tweet ID

    } catch (error) {
      console.error('❌ Error posting thread:', error.message);
      throw error;
    }
  }

  /**
   * Check if it's time to post daily content
   */
  shouldPostContent() {
    if (!this.lastTweetTime) {
      return true; // First run
    }

    const timeSinceLastTweet = Date.now() - this.lastTweetTime;
    return timeSinceLastTweet >= this.tweetInterval;
  }

  /**
   * Main routine: Generate and post daily KOL content
   */
  async runDailyContentCycle(oauthXService) {
    try {
      if (!this.shouldPostContent()) {
        const nextTweetIn = this.tweetInterval - (Date.now() - this.lastTweetTime);
        const hoursRemaining = (nextTweetIn / (60 * 60 * 1000)).toFixed(1);
        console.log(`⏰ Next KOL content in ${hoursRemaining} hours`);
        return;
      }

      console.log('🎤 Starting daily KOL content cycle...');

      // Generate content for 1 random token from top 5
      const content = await this.generateDailyContent();

      if (!content) {
        console.log('❌ Failed to generate content, skipping this cycle');
        return;
      }

      // Post the content
      console.log(`\n📤 Posting content: $${content.token.symbol} (${content.format})`);
      await this.postThread(content.tweets, oauthXService);

      this.lastTweetTime = Date.now();
      console.log('✅ Daily KOL content cycle completed');
      console.log(`📊 Posted: ${content.format} (${content.tweets.length} tweet${content.tweets.length > 1 ? 's' : ''})`);

    } catch (error) {
      console.error('❌ Error in daily content cycle:', error.message);
    }
  }
}

export default KOLContentService;

