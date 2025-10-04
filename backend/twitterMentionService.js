/**
 * Twitter Mention Tracking & Reply Service for @dgnoracle
 * Monitors mentions, analyzes context, and replies with KOL-style opinions
 */

import fs from 'fs/promises';
import path from 'path';

class TwitterMentionService {
  constructor(twitterAutoPostService, openaiService, backendInstance) {
    this.twitterService = twitterAutoPostService;
    this.openaiService = openaiService;
    this.backend = backendInstance;
    this.isRunning = false;
    this.checkInterval = null;
    this.checkIntervalMinutes = 10;
    
    // Track replied mentions to avoid duplicates
    this.repliedMentions = new Set();
    this.lastCheckedMentionId = null;
    
    // State persistence
    this.stateFilePath = process.env.DATA_DIR 
      ? path.join(process.env.DATA_DIR, 'twitter-mentions-state.json')
      : path.join(process.cwd(), 'data', 'global', 'twitter-mentions-state.json');
    
    console.log('🐦 Twitter Mention Service initialized');
  }

  // Load state from disk
  async loadState() {
    try {
      const data = await fs.readFile(this.stateFilePath, 'utf8');
      const state = JSON.parse(data);
      
      this.repliedMentions = new Set(state.repliedMentions || []);
      this.lastCheckedMentionId = state.lastCheckedMentionId || null;
      
      console.log(`📁 [MENTIONS] Loaded state: ${this.repliedMentions.size} replied mentions`);
    } catch (error) {
      console.log('📁 [MENTIONS] No saved state found, starting fresh');
    }
  }

  // Save state to disk
  async saveState() {
    try {
      const state = {
        repliedMentions: Array.from(this.repliedMentions),
        lastCheckedMentionId: this.lastCheckedMentionId,
        savedAt: new Date().toISOString()
      };
      
      await fs.writeFile(this.stateFilePath, JSON.stringify(state, null, 2), 'utf8');
    } catch (error) {
      console.error('❌ [MENTIONS] Failed to save state:', error.message);
    }
  }

  // Start the mention tracking service
  async start() {
    if (this.isRunning) {
      console.log('⚠️ [MENTIONS] Service already running');
      return;
    }

    await this.loadState();
    this.isRunning = true;
    
    console.log(`🚀 [MENTIONS] Service started - checking every ${this.checkIntervalMinutes} minutes`);
    
    // Check immediately on start
    await this.checkMentions();
    
    // Then check every N minutes
    this.checkInterval = setInterval(async () => {
      await this.checkMentions();
    }, this.checkIntervalMinutes * 60 * 1000);
  }

  // Stop the service
  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.isRunning = false;
    console.log('🛑 [MENTIONS] Service stopped');
  }

  // Check for new mentions
  async checkMentions() {
    try {
      console.log('🔍 [MENTIONS] Checking for new mentions...');
      
      // Get mentions from Twitter API (you'll need to implement this in OAuthXService)
      const mentions = await this.fetchMentions();
      
      if (!mentions || mentions.length === 0) {
        console.log('📭 [MENTIONS] No new mentions found');
        return;
      }
      
      console.log(`📬 [MENTIONS] Found ${mentions.length} mentions to process`);
      
      // Process each mention
      for (const mention of mentions) {
        await this.processMention(mention);
      }
      
      await this.saveState();
      
    } catch (error) {
      console.error('❌ [MENTIONS] Error checking mentions:', error.message);
    }
  }

  // Fetch mentions from Twitter API
  async fetchMentions() {
    try {
      const userId = this.twitterService.dgnOracleUserId;
      
      if (!userId) {
        console.error('❌ [MENTIONS] DGNORACLE_USER_ID not set - cannot fetch mentions');
        return [];
      }
      
      // Use OAuthXService to fetch mentions
      const mentions = await this.twitterService.oauthXService.getMentions(userId, {
        maxResults: 10,
        sinceId: this.lastCheckedMentionId,
        tweetFields: 'author_id,created_at,text,conversation_id',
        expansions: 'author_id',
        userFields: 'username,name,verified'
      });
      
      // Update last checked ID to the most recent mention
      if (mentions.length > 0) {
        this.lastCheckedMentionId = mentions[0].id;
        await this.saveState(); // Save state immediately
      }
      
      return mentions;
      
    } catch (error) {
      console.error('❌ [MENTIONS] Error fetching mentions:', error.message);
      return [];
    }
  }

  // Process a single mention
  async processMention(mention) {
    try {
      const mentionId = mention.id;
      const text = mention.text;
      const author = mention.author?.username || 'unknown';
      
      // Skip if already replied
      if (this.repliedMentions.has(mentionId)) {
        console.log(`⏭️ [MENTIONS] Skipping ${mentionId} - already replied`);
        return;
      }
      
      console.log(`💬 [MENTIONS] Processing mention from @${author}: "${text}"`);
      
      // Analyze the mention to extract context and tokens
      const analysis = await this.analyzeMention(text, author);
      
      if (!analysis.shouldReply) {
        console.log(`🚫 [MENTIONS] Skipping - ${analysis.reason}`);
        this.repliedMentions.add(mentionId);
        return;
      }
      
      // Generate appropriate reply
      const reply = await this.generateReply(analysis, author);
      
      if (!reply) {
        console.log(`❌ [MENTIONS] Failed to generate reply for ${mentionId}`);
        return;
      }
      
      // Post the reply
      const result = await this.postReply(mentionId, reply);
      
      if (result.success) {
        console.log(`✅ [MENTIONS] Replied to @${author}: "${reply.substring(0, 50)}..."`);
        this.repliedMentions.add(mentionId);
        
        // Keep only last 1000 replied IDs in memory
        if (this.repliedMentions.size > 1000) {
          const oldest = Array.from(this.repliedMentions)[0];
          this.repliedMentions.delete(oldest);
        }
      }
      
    } catch (error) {
      console.error(`❌ [MENTIONS] Error processing mention ${mention.id}:`, error.message);
    }
  }

  // Analyze mention to understand context and extract tokens
  async analyzeMention(text, author) {
    try {
      const prompt = `You are analyzing a Twitter mention to @dgnoracle. Determine:
1. Should we reply? (yes/no)
2. Type of reply needed: "casual" (general chat) or "kol_opinion" (crypto analysis)
3. Extract any mentioned tokens/tickers (symbols starting with $ or @)

Mention: "${text}"
Author: @${author}

Rules:
- Reply to genuine questions, greetings, or crypto discussions
- SKIP spam, promotional tweets, or unrelated content
- Type "casual" for greetings, questions about the platform, general chat
- Type "kol_opinion" if they mention specific tokens, ask for analysis, or want trading insights
- Extract symbols like $BONK, @memeputer, etc.

Respond in JSON format:
{
  "shouldReply": true/false,
  "replyType": "casual" or "kol_opinion",
  "tokens": ["SYMBOL1", "SYMBOL2"],
  "reason": "brief explanation"
}`;

      const response = await this.openaiService.generateCompletion(prompt, {
        maxTokens: 200,
        temperature: 0.3,
        model: 'gpt-3.5-turbo'
      });
      
      // Parse JSON response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const analysis = JSON.parse(jsonMatch[0]);
        analysis.originalText = text; // Store original text for context
        console.log(`🧠 [MENTIONS] Analysis:`, analysis);
        return analysis;
      }
      
      // Fallback: assume should reply as casual
      return {
        shouldReply: true,
        replyType: 'casual',
        tokens: [],
        originalText: text,
        reason: 'fallback analysis'
      };
      
    } catch (error) {
      console.error('❌ [MENTIONS] Error analyzing mention:', error.message);
      return { shouldReply: false, reason: 'analysis error' };
    }
  }

  // Generate reply based on analysis
  async generateReply(analysis, author) {
    try {
      if (analysis.replyType === 'casual') {
        return await this.generateCasualReply(analysis, author);
      } else if (analysis.replyType === 'kol_opinion') {
        return await this.generateKOLOpinion(analysis, author);
      }
      
      return null;
    } catch (error) {
      console.error('❌ [MENTIONS] Error generating reply:', error.message);
      return null;
    }
  }

  // Generate casual conversational reply
  async generateCasualReply(analysis, author) {
    try {
      const prompt = `You are @dgnoracle, a crypto degen KOL who runs an AI-powered meme coin screener on Solana.

Someone said: "${analysis.originalText || 'hey'}"
Author: @${author}

Generate a SHORT, natural reply (max 200 chars):
- Be friendly and conversational
- Use crypto degen slang naturally
- Keep it brief and engaging
- NO hashtags
- Mention degen-oracle.com only if relevant

Reply:`;

      const reply = await this.openaiService.generateCompletion(prompt, {
        maxTokens: 100,
        temperature: 0.8,
        model: 'gpt-3.5-turbo'
      });
      
      return `@${author} ${reply.trim()}`;
      
    } catch (error) {
      console.error('❌ [MENTIONS] Error generating casual reply:', error.message);
      return `@${author} GM! Thanks for reaching out! 🔮`;
    }
  }

  // Generate KOL opinion with token analysis
  async generateKOLOpinion(analysis, author) {
    try {
      // Extract first token mentioned
      const symbol = analysis.tokens && analysis.tokens.length > 0 
        ? analysis.tokens[0].replace(/[$@]/g, '').toUpperCase()
        : null;
      
      if (!symbol) {
        return `@${author} I need a token symbol to analyze, anon! Drop a $ and I'll give you the alpha. 👀`;
      }
      
      console.log(`📊 [MENTIONS] Analyzing token: ${symbol}`);
      
      // Fetch token data from cache
      const tokenData = await this.getTokenData(symbol);
      
      if (!tokenData) {
        return `@${author} Can't find ${symbol} in my systems. Either it's not on Solana or it's too early/dead. 🤷`;
      }
      
      // Fetch enhanced data (same as thesis generator)
      let enhancedData = { ...tokenData };
      
      try {
        // Fetch Moralis Token Analytics for volume and buy/sell pressure
        if (this.backend.moralisService) {
          const { default: TechnicalAnalysisService } = await import('./services/TechnicalAnalysisService.js');
          const techAnalysisService = new TechnicalAnalysisService();
          const moralisAnalytics = await techAnalysisService.getMoralisTokenAnalytics(tokenData.contractAddress);
          enhancedData.moralisAnalytics = moralisAnalytics;
          console.log(`📊 [MENTIONS] Fetched Moralis TokenAnalytics for ${symbol}`);
        }
        
        // Fetch Holder Timeseries data for detailed holder insights
        if (this.backend.holderTimeseriesService) {
          const holderData = await this.backend.holderTimeseriesService.getHolderInsights(tokenData.contractAddress);
          enhancedData.holderData = holderData;
          console.log(`👥 [MENTIONS] Fetched Holder data for ${symbol}`);
        }
      } catch (enhancedError) {
        console.warn(`⚠️ [MENTIONS] Failed to fetch enhanced data for ${symbol}:`, enhancedError.message);
        // Continue with basic data
      }
      
      // Generate KOL-style opinion with enhanced data
      const opinion = await this.generateKOLAnalysis(symbol, enhancedData);
      
      return `@${author} ${opinion}`;
      
    } catch (error) {
      console.error('❌ [MENTIONS] Error generating KOL opinion:', error.message);
      return `@${author} Can't analyze rn anon, systems are cooking. Try again later! 🔥`;
    }
  }

  // Get token data from backend cache
  async getTokenData(symbol) {
    try {
      const tokens = await this.backend.getTokensFromCache();
      return tokens.find(t => t.symbol?.toUpperCase() === symbol);
    } catch (error) {
      console.error('❌ [MENTIONS] Error fetching token data:', error.message);
      return null;
    }
  }

  // DEPRECATED - Now using enhanced data in generateKOLOpinion
  async getHolderInsights(contractAddress) {
    console.warn('⚠️ [MENTIONS] getHolderInsights is deprecated, use enhanced data fetch instead');
    return null;
  }

  // Generate KOL-style analysis
  async generateKOLAnalysis(symbol, tokenData) {
    try {
      // Extract mcap and holders from cache
      const mcap = tokenData.mcap || tokenData.marketCap || tokenData.jupiterData?.mcap || 0;
      const holderCount = tokenData.holderCount || tokenData.jupiterData?.holderCount || 0;
      const liquidityUsd = tokenData.liquidity || tokenData.jupiterData?.liquidity || 0;
      
      // Extract volume and buy/sell pressure from Moralis Analytics
      let volume24h = 0;
      let buyPressure = 0;
      let sellPressure = 0;
      if (tokenData.moralisAnalytics) {
        const analytics = tokenData.moralisAnalytics;
        volume24h = analytics.volume_24h || analytics.volume24h || 0;
        buyPressure = analytics.buy_volume_24h || analytics.buyVolume24h || 0;
        sellPressure = analytics.sell_volume_24h || analytics.sellVolume24h || 0;
        console.log(`📊 [MENTIONS] Moralis Analytics for ${symbol}:`, {
          volume24h,
          buyPressure,
          sellPressure,
          buyPct: buyPressure > 0 ? ((buyPressure / (buyPressure + sellPressure)) * 100).toFixed(1) : 0
        });
      }
      
      const volumeToMcap = mcap > 0 ? (volume24h / mcap * 100).toFixed(1) : 0;
      const buyPct = (buyPressure + sellPressure) > 0 ? ((buyPressure / (buyPressure + sellPressure)) * 100).toFixed(1) : 50;
      
      // Extract holder insights from Holder Data
      let holderContext = '';
      if (tokenData.holderData) {
        const holderStats = tokenData.holderData.holderStats;
        const holderTimeseries = tokenData.holderData.holderTimeseries;
        
        if (holderStats) {
          const whales = holderStats.holderDistribution?.whales || 0;
          const topHoldersPct = holderStats.holderSupply?.top10?.supplyPercent || 0;
          const holderChange24h = holderStats.holderChange?.['24h']?.change || 0;
          const holderChange30d = holderStats.holderChange?.['30d']?.change || 0;
          
          holderContext = `
Whales: ${whales}
Top 10 Control: ${topHoldersPct.toFixed(1)}%
Holder Change (24h): ${holderChange24h > 0 ? '+' : ''}${holderChange24h}
Holder Change (30d): ${holderChange30d > 0 ? '+' : ''}${holderChange30d}`;
          
          console.log(`💎 [MENTIONS] Holder insights for ${symbol}:`, {
            whales,
            topHoldersPct: `${topHoldersPct.toFixed(1)}%`,
            change24h: holderChange24h,
            change30d: holderChange30d
          });
        }
        
        if (holderTimeseries && holderTimeseries.data) {
          // Calculate holder percentage change from timeseries
          const data = holderTimeseries.data;
          if (data.length >= 2) {
            const latest = data[data.length - 1];
            const earliest = data[0];
            const holderPctChange = ((latest.holders - earliest.holders) / earliest.holders * 100).toFixed(1);
            holderContext += `\nHolder % Change: ${holderPctChange > 0 ? '+' : ''}${holderPctChange}%`;
          }
        }
      }
      
      const dataContext = `
Token: $${symbol}
Market Cap: $${(mcap / 1000000).toFixed(2)}M
24h Volume: $${(volume24h / 1000).toFixed(1)}K
Volume/MCap: ${volumeToMcap}%
Buy Pressure: ${buyPct}%
Holders: ${holderCount.toLocaleString()}
Liquidity: $${(liquidityUsd / 1000).toFixed(1)}K${holderContext}`;

      console.log(`📝 [MENTIONS] Data context for GPT-4:\n${dataContext}`);

      const prompt = `You are a legendary crypto KOL giving a QUICK take on a token. Be direct, use degen slang, and base your opinion STRICTLY on the data provided.

${dataContext}

Generate a SHORT KOL opinion (max 200 chars):
- Start with a vibe: bullish/bearish/cautious based on the DATA
- Mention 1-2 KEY facts that support your take (volume, buy pressure, holder changes)
- Use crypto degen language (moon, rekt, aping, conviction, diamond hands, etc.)
- Be confident but add "NFA" (not financial advice) at end if bullish
- NO hashtags, NO long explanations
- Examples:
  * Bullish: "79K volume with 52% buy pressure! 86 whales holding strong 💎 Ready to moon. NFA 🚀"
  * Bearish: "Volume dead, only 30% buy pressure. Retail dumping. I wouldn't touch this rn 📉"
  * Cautious: "Decent volume but top 10 hold 57%. Wait for better entry or get rekt 🤷"

Opinion:`;

      const opinion = await this.openaiService.generateCompletion(prompt, {
        maxTokens: 150,
        temperature: 0.7,
        model: 'gpt-4' // Use GPT-4 for better analysis
      });
      
      return opinion.trim();
      
    } catch (error) {
      console.error('❌ [MENTIONS] Error generating KOL analysis:', error.message);
      // Fallback to basic opinion
      return this.generateBasicOpinion(symbol, tokenData);
    }
  }

  // Fallback basic opinion without LLM
  generateBasicOpinion(symbol, tokenData) {
    const mcap = tokenData.jupiterData?.mcap || tokenData.marketCap || 0;
    const volume24h = tokenData.volume24h || 0;
    const volumeToMcap = mcap > 0 ? (volume24h / mcap * 100) : 0;
    
    if (volumeToMcap > 20) {
      return `$${symbol} is seeing crazy volume (${volumeToMcap.toFixed(0)}% of mcap). Whales are moving. 👀🔥`;
    } else if (volumeToMcap < 2) {
      return `$${symbol} volume is dead rn (${volumeToMcap.toFixed(1)}%). I'd wait for momentum before aping. 📉`;
    } else {
      return `$${symbol} has decent flow, nothing crazy. Do your own research anon! 🤷`;
    }
  }

  // Post reply to Twitter
  async postReply(mentionId, replyText) {
    try {
      const userId = this.twitterService.dgnOracleUserId;
      
      if (!userId) {
        console.error('❌ [MENTIONS] DGNORACLE_USER_ID not set - cannot post reply');
        return { success: false, error: 'No user ID' };
      }
      
      // Use OAuthXService to post reply
      const tweet = await this.twitterService.oauthXService.postReply(userId, replyText, mentionId);
      
      console.log(`✅ [MENTIONS] Posted reply to ${mentionId}: ${tweet.id}`);
      return { success: true, tweetId: tweet.id };
      
    } catch (error) {
      console.error('❌ [MENTIONS] Error posting reply:', error.message);
      return { success: false, error: error.message };
    }
  }

}

export default TwitterMentionService;

