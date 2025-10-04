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
    
    // Round-robin personality selector for variety
    this.currentPersonalityIndex = 0;
    
    // Different KOL personalities for variety
    this.personalities = [
      {
        name: 'Ultra Degen',
        style: 'Pure degen chaos. All caps energy, maximum slang, zero filter. Talk like you just aped your rent money.',
        examples: [
          'APING $ABC RN. WHALES LOADING BAGS, RETAIL FOMO IS REAL. THIS GONNA MOON OR I\'M COOKED 🚀🚀🚀',
          '$XYZ IS DEAD AF. WHALES DUMPED, RETAIL FLED. RUG VIBES. STAYING FAR AWAY 💀'
        ]
      },
      {
        name: 'Mysterious Insider',
        style: 'Vague but intriguing. Hint at things without saying too much. Make them curious.',
        examples: [
          'Interesting moves on $ABC. Some wallets I watch are loading. That\'s all I\'ll say 👀',
          '$XYZ... yeah I\'m watching that exit. Smart money knows something 🤐'
        ]
      },
      {
        name: 'Data Degen',
        style: 'Drop specific numbers but keep it casual. Mix facts with slang.',
        examples: [
          '$ABC looking spicy. +15 whales in, 6M volume, 58% buy pressure. Could run 🔥',
          'Passing $XYZ. -7 whales out, volume dead. Numbers don\'t lie 📉'
        ]
      },
      {
        name: 'Street Philosopher',
        style: 'Philosophical but degen. Drop wisdom with the take.',
        examples: [
          '$ABC got that energy. When whales load and retail follows, history repeats. Not advice but I\'m watching 👁️',
          'Market teaches lessons. $XYZ showing us what happens when smart money exits. Tale as old as time 📖'
        ]
      },
      {
        name: 'Hype Beast',
        style: 'Maximum enthusiasm and FOMO energy. Everything is either mooning or dead, no middle ground.',
        examples: [
          '$ABC IS ABOUT TO GO PARABOLIC! Whales piling in, volume exploding, this is THE play rn! 🌙🚀💎',
          '$XYZ is absolutely cooked. Dead coin walking. Ghost town. Next! ⚰️'
        ]
      },
      {
        name: 'Cautious Contrarian',
        style: 'Always skeptical, always waiting. Play it safe but with attitude.',
        examples: [
          '$ABC looks decent but I\'m waiting. Whales in but retail panic selling still. Need confirmation 🤷',
          'Everyone hyped on $XYZ but I see whales exiting. I\'ll pass and watch from sidelines 👀'
        ]
      }
    ];
    
    console.log('🐦 Twitter Mention Service initialized with 6 personality modes');
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
        console.log(`📊 [MENTIONS] Fetching Moralis TokenAnalytics for ${symbol}...`);
        const { default: TechnicalAnalysisService } = await import('./services/TechnicalAnalysisService.js');
        const techAnalysisService = new TechnicalAnalysisService();
        const moralisAnalytics = await techAnalysisService.getMoralisTokenAnalytics(tokenData.contractAddress);
        enhancedData.moralisAnalytics = moralisAnalytics;
        console.log(`✅ [MENTIONS] Fetched Moralis TokenAnalytics for ${symbol}:`, {
          volume24h: moralisAnalytics.totalVolume?.['24h'] || moralisAnalytics.volume?.['24h'],
          buyVolume: moralisAnalytics.totalBuyVolume?.['24h'],
          sellVolume: moralisAnalytics.totalSellVolume?.['24h']
        });
      } catch (moralisError) {
        console.warn(`⚠️ [MENTIONS] Failed to fetch Moralis Analytics for ${symbol}:`, moralisError.message);
      }
      
      try {
        // Fetch Holder data with timeseries and segment flow
        console.log(`👥 [MENTIONS] Fetching Holder stats and segment flow for ${symbol}...`);
        const { default: HolderTimeseriesService } = await import('./services/HolderTimeseriesService.js');
        const holderService = new HolderTimeseriesService();
        const holderAnalysis = await holderService.getHolderChangeAnalysis(tokenData.contractAddress);
        
        if (holderAnalysis.success) {
          // Get the holder stats directly for current distribution
          const axios = (await import('axios')).default;
          const API_BASE = 'https://solana-gateway.moralis.io';
          const API_KEY = process.env.MORALIS_API_KEY;
          
          if (API_KEY) {
            const response = await axios.get(
              `${API_BASE}/token/mainnet/holders/${tokenData.contractAddress}`,
              {
                headers: {
                  'X-API-Key': API_KEY,
                  'Content-Type': 'application/json'
                }
              }
            );
            
            if (response.status === 200 && response.data) {
              enhancedData.holderStats = response.data;
              enhancedData.holderAnalysis = holderAnalysis; // Add timeseries and segment flow
              console.log(`✅ [MENTIONS] Fetched Holder data for ${symbol}:`, {
                totalHolders: response.data.totalHolders,
                whales: response.data.holderDistribution?.whales,
                top10Pct: response.data.holderSupply?.top10?.supplyPercent,
                segmentFlow: holderAnalysis.holderFlowData?.segmentFlow
              });
            }
          }
        }
      } catch (holderError) {
        console.warn(`⚠️ [MENTIONS] Failed to fetch Holder data for ${symbol}:`, holderError.message);
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
        // Extract buy/sell volumes
        buyPressure = analytics.totalBuyVolume?.['24h'] || 0;
        sellPressure = analytics.totalSellVolume?.['24h'] || 0;
        // Calculate total volume from buy + sell (Moralis doesn't always have totalVolume field)
        volume24h = buyPressure + sellPressure;
        console.log(`📊 [MENTIONS] Moralis Analytics for ${symbol}:`, {
          volume24h,
          buyPressure,
          sellPressure,
          buyPct: (buyPressure + sellPressure) > 0 ? ((buyPressure / (buyPressure + sellPressure)) * 100).toFixed(1) : 0
        });
      }
      
      const volumeToMcap = mcap > 0 ? (volume24h / mcap * 100).toFixed(1) : 0;
      const buyPct = (buyPressure + sellPressure) > 0 ? ((buyPressure / (buyPressure + sellPressure)) * 100).toFixed(1) : 50;
      
      // Extract holder insights from Holder Stats (direct from Moralis)
      let holderContext = '';
      if (tokenData.holderStats) {
        const holderStats = tokenData.holderStats;
        const whales = holderStats.holderDistribution?.whales || 0;
        const topHoldersPct = holderStats.holderSupply?.top10?.supplyPercent || 0;
        const holderChange24h = holderStats.holderChange?.['24h']?.change || 0;
        const holderChange30d = holderStats.holderChange?.['30d']?.change || 0;
        
        holderContext = `
Whales: ${whales}
Top 10 Control: ${topHoldersPct.toFixed(1)}%
Holder Change (24h): ${holderChange24h > 0 ? '+' : ''}${holderChange24h}
Holder Change (30d): ${holderChange30d > 0 ? '+' : ''}${holderChange30d}`;
        
        // Add segment flow data if available
        if (tokenData.holderAnalysis?.holderFlowData?.segmentFlow) {
          const segmentFlow = tokenData.holderAnalysis.holderFlowData.segmentFlow;
          const whaleFlow = segmentFlow.whales || { in: 0, out: 0, net: 0 };
          const retailFlow = {
            in: (segmentFlow.crabs?.in || 0) + (segmentFlow.shrimps?.in || 0),
            out: (segmentFlow.crabs?.out || 0) + (segmentFlow.shrimps?.out || 0),
            net: (segmentFlow.crabs?.net || 0) + (segmentFlow.shrimps?.net || 0)
          };
          
          holderContext += `
Whale Flow: ${whaleFlow.net > 0 ? '+' : ''}${whaleFlow.net} (in: ${whaleFlow.in}, out: ${whaleFlow.out})
Retail Flow: ${retailFlow.net > 0 ? '+' : ''}${retailFlow.net} (in: ${retailFlow.in}, out: ${retailFlow.out})`;
        }
        
        console.log(`💎 [MENTIONS] Holder insights for ${symbol}:`, {
          whales,
          topHoldersPct: `${topHoldersPct.toFixed(1)}%`,
          change24h: holderChange24h,
          change30d: holderChange30d,
          segmentFlow: tokenData.holderAnalysis?.holderFlowData?.segmentFlow
        });
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

      // Get current personality (round-robin)
      const personality = this.personalities[this.currentPersonalityIndex];
      this.currentPersonalityIndex = (this.currentPersonalityIndex + 1) % this.personalities.length;
      
      console.log(`🎭 [MENTIONS] Using personality: ${personality.name}`);

      const prompt = `You are a legendary crypto KOL with a specific personality. Give a RAW take on this token based STRICTLY on the data provided.

${dataContext}

PERSONALITY MODE: "${personality.name}"
STYLE: ${personality.style}

EXAMPLES OF YOUR STYLE:
${personality.examples.map((ex, i) => `${i + 1}. ${ex}`).join('\n')}

Now generate YOUR take on the token (max 180 chars):
- Stay true to the personality mode
- Call out WHO'S moving (whales/retail entering or exiting)
- Use the data but filter it through YOUR personality
- Keep it SHORT and punchy
- Focus on the VIBE, not a report

Reply:`;

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

