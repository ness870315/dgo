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
    this.tweetInterval = 6 * 60 * 60 * 1000; // 6 hours between tweets
    
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
   * Select best tokens for content (high momentum, interesting stories)
   */
  async selectTopMemecoins(count = 2) {
    const trending = await this.getTrendingTokens(20);
    
    if (trending.length === 0) {
      console.log('⚠️ No trending tokens available');
      return [];
    }

    // Filter for memecoins (low-mid cap, high volume/mcap ratio)
    const memecoins = trending.filter(token => {
      const mcap = token.mcap || token.marketCap || 0;
      const volume24h = token.volume24h || 0;
      const volumeToMcap = mcap > 0 ? (volume24h / mcap) : 0;
      
      // Memecoin criteria: <$50M mcap, >10% volume/mcap ratio
      return mcap < 50_000_000 && volumeToMcap > 0.1;
    });

    // Sort by momentum (score + volume/mcap + price change)
    const scored = memecoins.map(token => {
      const mcap = token.mcap || token.marketCap || 0;
      const volume24h = token.volume24h || 0;
      const volumeToMcap = mcap > 0 ? (volume24h / mcap) : 0;
      const priceChange = token.priceChange24h || 0;
      
      // Momentum score: overall score + volume ratio + price action
      const momentumScore = (token.overallScore || 0) + (volumeToMcap * 10) + (priceChange / 10);
      
      return {
        ...token,
        momentumScore,
        volumeToMcap
      };
    });

    // Sort by momentum and take top N
    scored.sort((a, b) => b.momentumScore - a.momentumScore);
    
    const selected = scored.slice(0, count);
    console.log(`🎯 Selected ${selected.length} memecoins for content:`, 
      selected.map(t => ({ 
        symbol: t.symbol, 
        mcap: `$${(t.mcap / 1_000_000).toFixed(2)}M`,
        momentum: t.momentumScore.toFixed(1) 
      }))
    );
    
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
   * Generate daily KOL content: Mix of singles, short threads, deep-dives
   */
  async generateDailyContent() {
    try {
      console.log('🎤 Generating daily KOL content...');

      // Select 2 top memecoins
      const tokens = await this.selectTopMemecoins(2);

      if (tokens.length < 2) {
        console.log('⚠️ Not enough tokens for daily content');
        return null;
      }

      // Decide content format randomly (more realistic distribution)
      const contentTypes = [
        'single+single',      // 30% - Two standalone tweets
        'single+short',       // 25% - One tweet + one 2-tweet thread
        'short+short',        // 25% - Two 2-tweet threads
        'short+deep',         // 15% - One 2-tweet + one 3-tweet thread
        'deep+deep'           // 5%  - Two 3-tweet threads (rare, for big plays)
      ];

      const weights = [30, 25, 25, 15, 5];
      const random = Math.random() * 100;
      let cumulative = 0;
      let selectedFormat = 'single+single';

      for (let i = 0; i < weights.length; i++) {
        cumulative += weights[i];
        if (random <= cumulative) {
          selectedFormat = contentTypes[i];
          break;
        }
      }

      console.log(`📝 Selected format: ${selectedFormat}`);

      // Generate content based on format
      const [format1, format2] = selectedFormat.split('+');
      
      const content1 = await this.generateContentByFormat(tokens[0], format1);
      const content2 = await this.generateContentByFormat(tokens[1], format2);

      if (!content1 || !content2) {
        console.log('❌ Failed to generate content');
        return null;
      }

      console.log('✅ Daily KOL content generated successfully');
      return {
        content1: {
          token: tokens[0],
          tweets: content1,
          format: format1
        },
        content2: {
          token: tokens[1],
          tweets: content2,
          format: format2
        },
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('❌ Error generating daily content:', error.message);
      return null;
    }
  }

  /**
   * Generate content based on format (single, short, deep)
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
      
      default:
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

      let previousTweetId = null;

      for (let i = 0; i < tweets.length; i++) {
        const tweet = tweets[i];
        
        // Post as reply to previous tweet (if exists)
        const tweetId = await oauthXService.postReply(
          tweet,
          null, // userId not needed for own tweets
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

      // Generate content
      const content = await this.generateDailyContent();

      if (!content) {
        console.log('❌ Failed to generate content, skipping this cycle');
        return;
      }

      // Post content 1
      console.log(`\n📤 Posting content 1: $${content.content1.token.symbol} (${content.content1.format})`);
      await this.postThread(content.content1.tweets, oauthXService);

      // Wait 30-60 minutes between posts (random for more natural timing)
      const waitMinutes = Math.floor(Math.random() * 30) + 30; // 30-60 minutes
      console.log(`⏰ Waiting ${waitMinutes} minutes before posting content 2...`);
      await new Promise(resolve => setTimeout(resolve, waitMinutes * 60 * 1000));

      // Post content 2
      console.log(`\n📤 Posting content 2: $${content.content2.token.symbol} (${content.content2.format})`);
      await this.postThread(content.content2.tweets, oauthXService);

      this.lastTweetTime = Date.now();
      console.log('✅ Daily KOL content cycle completed');
      console.log(`📊 Posted: ${content.content1.format} (${content.content1.tweets.length} tweets) + ${content.content2.format} (${content.content2.tweets.length} tweets)`);

    } catch (error) {
      console.error('❌ Error in daily content cycle:', error.message);
    }
  }
}

export default KOLContentService;

