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
      // TODO: Implement Twitter API v2 mentions endpoint
      // For now, return empty array as placeholder
      console.log('⚠️ [MENTIONS] Twitter API integration needed - returning empty for now');
      return [];
      
      // Expected implementation:
      // const response = await this.twitterService.oauthXService.getMentions(this.lastCheckedMentionId);
      // return response.data;
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
        console.log(`🧠 [MENTIONS] Analysis:`, analysis);
        return analysis;
      }
      
      // Fallback: assume should reply as casual
      return {
        shouldReply: true,
        replyType: 'casual',
        tokens: [],
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
      
      // Fetch holder insights if available
      const holderInsights = await this.getHolderInsights(tokenData.contractAddress);
      
      // Generate KOL-style opinion
      const opinion = await this.generateKOLAnalysis(symbol, tokenData, holderInsights);
      
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

  // Get holder insights
  async getHolderInsights(contractAddress) {
    try {
      // Use the same holder analysis service used for thesis generation
      const API_BASE = process.env.REACT_APP_API_BASE_URL || 'https://api.degen-oracle.com';
      const response = await fetch(`${API_BASE}/api/holders/${contractAddress}`);
      
      if (response.ok) {
        const data = await response.json();
        return data;
      }
      
      return null;
    } catch (error) {
      console.error('❌ [MENTIONS] Error fetching holder insights:', error.message);
      return null;
    }
  }

  // Generate KOL-style analysis
  async generateKOLAnalysis(symbol, tokenData, holderInsights) {
    try {
      // Build context from data
      const mcap = tokenData.jupiterData?.mcap || tokenData.marketCap || 0;
      const volume24h = tokenData.volume24h || 0;
      const volumeToMcap = mcap > 0 ? (volume24h / mcap * 100).toFixed(1) : 0;
      const holderCount = tokenData.jupiterData?.holderCount || 0;
      const liquidityUsd = tokenData.jupiterData?.liquidity || 0;
      
      // Holder insights summary
      const topHoldersPct = holderInsights?.topHoldersPercentage || 0;
      const whaleActivity = holderInsights?.whaleActivity || 'unknown';
      const distribution = holderInsights?.distribution || 'unknown';
      
      const dataContext = `
Token: $${symbol}
Market Cap: $${(mcap / 1000000).toFixed(2)}M
24h Volume: $${(volume24h / 1000).toFixed(0)}K
Volume/MCap: ${volumeToMcap}%
Holders: ${holderCount.toLocaleString()}
Liquidity: $${(liquidityUsd / 1000).toFixed(0)}K
Top 10 Holders: ${topHoldersPct}%
Whale Activity: ${whaleActivity}
Distribution: ${distribution}`;

      const prompt = `You are a legendary crypto KOL giving a QUICK take on a token. Be direct, use degen slang, and base your opinion on the data.

${dataContext}

Generate a SHORT KOL opinion (max 200 chars):
- Start with a vibe: bullish/bearish/cautious
- Mention 1-2 KEY facts that support your take
- Use crypto degen language (moon, rekt, aping, conviction, etc.)
- Be confident but not financial advice
- NO hashtags, NO long explanations
- Example tone: "Whales are feasting and holders have conviction, this is ready to moon 🚀"
- Another example: "Volume is dead and retail is panic selling...I wouldn't touch this with a 10ft pole 📉"

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
      // TODO: Implement Twitter API reply
      console.log(`🐦 [MENTIONS] Would reply to ${mentionId}: "${replyText}"`);
      
      // Placeholder - actual implementation would be:
      // return await this.twitterService.postReply(mentionId, replyText);
      
      return { success: true, tweetId: 'placeholder' };
      
    } catch (error) {
      console.error('❌ [MENTIONS] Error posting reply:', error.message);
      return { success: false, error: error.message };
    }
  }
}

export default TwitterMentionService;

