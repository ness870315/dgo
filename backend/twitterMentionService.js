/**
 * Twitter Mention Tracking & Reply Service for @dgnoracle
 * Monitors mentions, analyzes context, and replies with KOL-style opinions
 */

import fs from 'fs/promises';
import path from 'path';
import TwitterMemoryService from './services/TwitterMemoryService.js';

class TwitterMentionService {
  constructor(twitterAutoPostService, openaiService, backendInstance) {
    this.twitterService = twitterAutoPostService;
    this.openaiService = openaiService;
    this.backend = backendInstance;
    this.memoryService = new TwitterMemoryService();
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
        style: 'Excited degen energy with caps and slang, but stay positive and fun. Hype the good, be cautious (not mean) on the bad. Punchy and short. Minimal emojis. NO hashtags.',
        examples: [
          'APING $ABC RN. Whales loading bags, retail FOMO kicking in. This could print big',
          '$XYZ looking shaky ngl. Whales exiting, volume thin. Gonna sit this one out'
        ]
      },
      {
        name: 'Mysterious Insider',
        style: 'Vague but intriguing. Hint at things without saying too much. Make them curious. Keep it cryptic and short. Minimal or no emojis. NO hashtags.',
        examples: [
          'Interesting moves on $ABC. Some wallets I watch are loading. That\'s all I\'ll say',
          '$XYZ... yeah I\'m watching that exit. Smart money knows something'
        ]
      },
      {
        name: 'Data Degen',
        style: 'Drop specific numbers but keep it casual. Mix facts with slang. Concise unless presenting data. Minimal emojis. NO hashtags.',
        examples: [
          '$ABC looking spicy. +15 whales in, 6M volume, 58% buy pressure. Could run',
          'Passing $XYZ. -7 whales out, volume dead. Numbers don\'t lie'
        ]
      },
      {
        name: 'Street Philosopher',
        style: 'Philosophical but degen. Drop wisdom with the take. Short and punchy. Minimal or no emojis. NO hashtags.',
        examples: [
          '$ABC got that energy. When whales load and retail follows, history repeats. Not advice but I\'m watching',
          'Market teaches lessons. $XYZ showing us what happens when smart money exits. Tale as old as time'
        ]
      },
      {
        name: 'Hype Beast',
        style: 'Maximum enthusiasm and FOMO energy. Everything is either mooning or dead, no middle ground. Keep it punchy. Max 1-2 emojis. NO hashtags.',
        examples: [
          '$ABC IS ABOUT TO GO PARABOLIC! Whales piling in, volume exploding, this is THE play rn',
          '$XYZ is absolutely cooked. Dead coin walking. Ghost town. Next'
        ]
      },
      {
        name: 'Cautious Contrarian',
        style: 'Always skeptical, always waiting. Play it safe but with attitude. Short and direct. Minimal emojis. NO hashtags.',
        examples: [
          '$ABC looks decent but I\'m waiting. Whales in but retail panic selling still. Need confirmation',
          'Everyone hyped on $XYZ but I see whales exiting. I\'ll pass and watch from sidelines'
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
    
    // Initialize memory service
    await this.memoryService.initialize();
    
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
      
      // Skip if mention is from @dgnoracle itself (prevent infinite loop)
      if (author.toLowerCase() === 'dgnoracle' || author.toLowerCase() === 'dgen_oracle') {
        console.log(`⏭️ [MENTIONS] Skipping ${mentionId} - mention from self (@${author})`);
        this.repliedMentions.add(mentionId); // Mark as processed to avoid checking again
        return;
      }
      
      // Skip if already replied
      if (this.repliedMentions.has(mentionId)) {
        console.log(`⏭️ [MENTIONS] Skipping ${mentionId} - already replied`);
        return;
      }
      
      console.log(`💬 [MENTIONS] Processing mention from @${author}: "${text}"`);
      
      // Fetch conversation context if available
      let conversationContext = [];
      if (mention.conversationId) {
        console.log(`🔍 [MENTIONS] Fetching conversation context for ${mention.conversationId}`);
        conversationContext = await this.twitterService.oauthXService.getConversationContext(
          this.twitterService.dgnOracleUserId,
          mention.conversationId,
          mentionId,
          5 // Get up to 5 previous tweets for context
        );
        
        if (conversationContext.length > 0) {
          console.log(`📜 [MENTIONS] Found ${conversationContext.length} tweets in conversation:`);
          conversationContext.forEach((tweet, i) => {
            console.log(`  ${i + 1}. @${tweet.author.username}: "${tweet.text.substring(0, 60)}..."`);
          });
        }
      }
      
      // Analyze the mention to extract context and tokens
      const analysis = await this.analyzeMention(text, author, conversationContext);
      
      if (!analysis.shouldReply) {
        console.log(`🚫 [MENTIONS] Skipping - ${analysis.reason}`);
        this.repliedMentions.add(mentionId);
        return;
      }
      
      // Generate appropriate reply with conversation context
      const reply = await this.generateReply(analysis, author, conversationContext);
      
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
        
        // [PHASE 1] Log interaction to memory service
        await this.logToMemory({
          mention,
          analysis,
          reply,
          author
        });
      }
      
    } catch (error) {
      console.error(`❌ [MENTIONS] Error processing mention ${mention.id}:`, error.message);
      console.error(`❌ [MENTIONS] Full error:`, error);
      console.error(`❌ [MENTIONS] Stack trace:`, error.stack);
    }
  }

  // Analyze mention to understand context and extract tokens
  async analyzeMention(text, author, conversationContext = []) {
    try {
      // First, check if this is a contract address (Solana addresses are 32-44 chars, base58)
      const contractRegex = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/;
      const contractMatch = text.match(contractRegex);
      
      // Build conversation context string for AI
      let contextString = '';
      if (conversationContext.length > 0) {
        contextString = '\n\nPREVIOUS CONVERSATION:\n';
        conversationContext.forEach((tweet, i) => {
          contextString += `${i + 1}. @${tweet.author.username}: "${tweet.text}"\n`;
        });
        contextString += '\nCURRENT MENTION:\n';
      }
      
      const prompt = `You are analyzing a Twitter mention to @dgnoracle. Determine:
1. Should we reply? (yes/no)
2. Type of reply needed: "casual" (general chat), "kol_opinion" (crypto analysis), or "contract_analysis" (user provided contract address)
3. Extract any mentioned tokens/tickers (symbols starting with $ or @)
4. Extract contract address if present (Solana addresses are long alphanumeric strings)
${contextString}
Mention: "${text}"
Author: @${author}

Rules:
- BE GENEROUS: Reply to almost everything UNLESS it's obvious spam/bots
- CONTEXT MATTERS:
  * If introducing @dgnoracle to another project/platform/AI → "casual" (e.g., "let me introduce you to @X")
  * If asking about price/trading/performance of a token → "kol_opinion" (e.g., "what do you think about $BONK?")
  * If providing contract address → "contract_analysis"
  * If greeting, thanking, or general chat → "casual"
  
- Type "casual" for: introductions, greetings, thanks, recommendations, questions about the platform itself
- Type "kol_opinion" if: asking for token analysis, price opinions, trading insights, volume questions, whale activity, holder changes, "is X a buy?", "what caused X?", "why is X pumping/dumping?"
- Type "contract_analysis" if they provide a Solana contract address (32-44 char base58 string)
- Extract ALL symbols ($BONK, @token) but DON'T treat them as analysis requests if they're mentioned in other contexts
- ONLY skip: obvious spam (crypto giveaways, phishing links), bot replies, or completely unrelated topics

Examples:
- "let me introduce you to @memeputer" → casual (introduction, not asking for analysis)
- "what do you think about $BONK?" → kol_opinion (asking for token analysis)
- "check out @newtoken, it's pumping" → kol_opinion (discussing token performance)
- "what caused $ABC volume spike?" → kol_opinion (asking about token activity)
- "why is $XYZ pumping?" → kol_opinion (asking about token performance)
- "thanks for the alpha @dgnoracle!" → casual (gratitude)

Respond in JSON format:
{
  "shouldReply": true/false,
  "replyType": "casual" or "kol_opinion" or "contract_analysis",
  "tokens": ["SYMBOL1", "SYMBOL2"],
  "contractAddress": "address_if_found" or null,
  "reason": "brief explanation"
}`;

      const response = await this.openaiService.generateCompletion(prompt, {
        maxTokens: 200,
        temperature: 0.3,
        model: 'gpt-5-nano' // Fast classification with GPT-5 nano
      });
      
      // Parse JSON response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const analysis = JSON.parse(jsonMatch[0]);
        analysis.originalText = text; // Store original text for context
        
        // If AI missed the contract but regex found it, add it
        if (contractMatch && !analysis.contractAddress) {
          analysis.contractAddress = contractMatch[0];
          analysis.replyType = 'contract_analysis';
        }
        
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
  async generateReply(analysis, author, conversationContext = []) {
    try {
      if (analysis.replyType === 'casual') {
        return await this.generateCasualReply(analysis, author, conversationContext);
      } else if (analysis.replyType === 'contract_analysis' && analysis.contractAddress) {
        // User provided a contract address - fetch from Jupiter and analyze
        return await this.analyzeContractAddress(analysis.contractAddress, author);
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
  async generateCasualReply(analysis, author, conversationContext = []) {
    try {
      // Build conversation context string for AI
      let contextString = '';
      if (conversationContext.length > 0) {
        contextString = '\n\nPREVIOUS CONVERSATION:\n';
        conversationContext.forEach((tweet, i) => {
          contextString += `${i + 1}. @${tweet.author.username}: "${tweet.text}"\n`;
        });
        contextString += '\nCURRENT MENTION:\n';
      }
      
      const prompt = `You are @dgnoracle - DeGen Oracle, a legendary crypto KOL and AI meme coin expert on Solana.

PERSONALITY:
- Expert KOL who knows his shit
- Uses crypto degen slang naturally (gm, anon, wagmi, ngmi, chad, based, fren)
- Can be a bit of a snob but in a playful way
- Good chad who's always down to help
- Concise and punchy - no fluff
- Sometimes elaborate if it's worth it
- NO corporate speak, NO hashtags, NO formalities
${contextString}
Someone said: "${analysis.originalText || 'hey'}"
Author: @${author}

Generate a SHORT, natural reply (max 150 chars):
- Keep it real and conversational
- Match the energy they bring
- If it's an intro, be cool but not overly excited
- If it's a thank you, be chill ("np anon", "anytime fren")
- If it's a question, be helpful but concise
- NO hashtags ever
- NO mentions of website unless they specifically ask
- DO NOT include @username in your reply (it's already added automatically)

Examples:
- Intro: "Appreciate it anon. Always cool meeting other builders in the space 🤝"
- Thanks: "Anytime fren. That's what we're here for 💎"
- Question: "Yeah we track Solana gems. Real-time data, no bs"
- General: "gm chad 🫡"

Reply (without @username):`;

      const reply = await this.openaiService.generateCompletion(prompt, {
        maxTokens: 100,
        temperature: 0.8,
        model: 'gpt-5-mini' // Casual replies with GPT-5 mini
      });
      
      // Remove any hashtags from the reply
      const cleanReply = reply.trim().replace(/#\w+/g, '').replace(/\s+/g, ' ').trim();
      
      return `@${author} ${cleanReply}`;
      
    } catch (error) {
      console.error('❌ [MENTIONS] Error generating casual reply:', error.message);
      return `@${author} GM! Thanks for reaching out! 🔮`;
    }
  }

  // Generate KOL opinion with token analysis
  async generateKOLOpinion(analysis, author) {
    try {
      // Extract first token mentioned
      let symbol = analysis.tokens && analysis.tokens.length > 0 
        ? analysis.tokens[0].replace(/[$@]/g, '').toUpperCase()
        : null;
      
      if (!symbol) {
        return `@${author} I need a token symbol to analyze, anon! Drop a $ and I'll give you the alpha. 👀`;
      }
      
      console.log(`📊 [MENTIONS] Analyzing token: ${symbol}`);
      
      // Try to fetch token data from cache
      let tokenData = await this.getTokenData(symbol);
      
      // If not found and original was a Twitter handle (@memeputer), try as ticker ($MEMEPUTER)
      if (!tokenData && analysis.tokens[0].startsWith('@')) {
        console.log(`🔄 [MENTIONS] @${symbol} not found, trying as ticker $${symbol}`);
        tokenData = await this.getTokenData(symbol);
      }
      
      // If still not found, try common variations
      if (!tokenData) {
        // Try removing common suffixes like "coin", "token", "sol", etc.
        const variations = [
          symbol.replace(/COIN$/i, ''),
          symbol.replace(/TOKEN$/i, ''),
          symbol.replace(/SOL$/i, ''),
          symbol.replace(/FINANCE$/i, ''),
          symbol.replace(/SWAP$/i, '')
        ];
        
        for (const variation of variations) {
          if (variation !== symbol && variation.length >= 2) {
            console.log(`🔄 [MENTIONS] Trying variation: ${variation}`);
            tokenData = await this.getTokenData(variation);
            if (tokenData) {
              symbol = variation; // Update symbol to the found variation
              console.log(`✅ [MENTIONS] Found token as: ${symbol}`);
              break;
            }
          }
        }
      }
      
      if (!tokenData) {
        // Token not in cache - provide graceful fallback
        const fallbackResponses = [
          `@${author} Need to look closer at ${symbol}. Not in my radar yet. Drop the contract if you got it and I'll dig in 🔍`,
          `@${author} ${symbol}? Tracking it now to see if this is a moon-mission or a trip to rekt-town. Give me the contract for faster analysis 👀`,
          `@${author} Don't have ${symbol} data loaded yet. Send me the contract address and I'll run the numbers 📊`,
          `@${author} ${symbol} isn't in my systems rn. Either too new or not on my watchlist. Drop the CA if you want me to analyze it 🤷`
        ];
        const randomResponse = fallbackResponses[Math.floor(Math.random() * fallbackResponses.length)];
        
        // Only ask for contract 50% of the time to avoid being repetitive
        if (Math.random() > 0.5) {
          return randomResponse;
        } else {
          // Simpler response without asking for contract
          const simpleResponses = [
            `@${author} Need more time to track ${symbol}. Not on my radar yet 🔍`,
            `@${author} ${symbol}? Gonna need to study this one first. Check back soon 👀`,
            `@${author} Don't have ${symbol} loaded yet. Too new or flying under radar 🤷`
          ];
          return simpleResponses[Math.floor(Math.random() * simpleResponses.length)];
        }
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

  // Analyze token by contract address (when token not in cache)
  async analyzeContractAddress(contractAddress, author) {
    try {
      console.log(`📍 [MENTIONS] Fetching token from Jupiter by contract: ${contractAddress}`);
      
      // Fetch token data from Jupiter API
      const axios = (await import('axios')).default;
      const jupiterResponse = await axios.get(`https://tokens.jup.ag/token/${contractAddress}`, {
        timeout: 10000
      });
      
      if (!jupiterResponse.data) {
        return `@${author} Can't find that contract on Jupiter. Make sure it's a valid Solana token address 🤷`;
      }
      
      const jupiterData = jupiterResponse.data;
      const symbol = jupiterData.symbol || 'UNKNOWN';
      
      console.log(`✅ [MENTIONS] Found token from Jupiter: ${symbol}`);
      
      // Build basic token data structure
      const tokenData = {
        symbol: symbol,
        name: jupiterData.name,
        contractAddress: contractAddress,
        jupiterData: jupiterData,
        mcap: jupiterData.mcap || 0,
        liquidity: jupiterData.liquidity || 0,
        holderCount: jupiterData.holderCount || 0
      };
      
      // Fetch enhanced data (Moralis + Holders)
      let enhancedData = { ...tokenData };
      
      try {
        // Fetch Moralis Token Analytics
        console.log(`📊 [MENTIONS] Fetching Moralis TokenAnalytics for ${symbol}...`);
        const { default: TechnicalAnalysisService } = await import('./services/TechnicalAnalysisService.js');
        const techAnalysisService = new TechnicalAnalysisService();
        const moralisAnalytics = await techAnalysisService.getMoralisTokenAnalytics(contractAddress);
        enhancedData.moralisAnalytics = moralisAnalytics;
        console.log(`✅ [MENTIONS] Fetched Moralis Analytics for ${symbol}`);
      } catch (moralisError) {
        console.warn(`⚠️ [MENTIONS] Failed to fetch Moralis Analytics:`, moralisError.message);
      }
      
      try {
        // Fetch Holder data
        console.log(`👥 [MENTIONS] Fetching Holder stats for ${symbol}...`);
        const { default: HolderTimeseriesService } = await import('./services/HolderTimeseriesService.js');
        const holderService = new HolderTimeseriesService();
        const holderAnalysis = await holderService.getHolderChangeAnalysis(contractAddress);
        
        if (holderAnalysis.success) {
          const API_BASE = 'https://solana-gateway.moralis.io';
          const API_KEY = process.env.MORALIS_API_KEY;
          
          if (API_KEY) {
            const response = await axios.get(
              `${API_BASE}/token/mainnet/holders/${contractAddress}`,
              {
                headers: {
                  'X-API-Key': API_KEY,
                  'Content-Type': 'application/json'
                }
              }
            );
            
            if (response.status === 200 && response.data) {
              enhancedData.holderStats = response.data;
              enhancedData.holderAnalysis = holderAnalysis;
              console.log(`✅ [MENTIONS] Fetched Holder data for ${symbol}`);
            }
          }
        }
      } catch (holderError) {
        console.warn(`⚠️ [MENTIONS] Failed to fetch Holder data:`, holderError.message);
      }
      
      // Generate KOL opinion with the fetched data
      const opinion = await this.generateKOLAnalysis(symbol, enhancedData);
      return `@${author} ${opinion}`;
      
    } catch (error) {
      console.error(`❌ [MENTIONS] Error analyzing contract:`, error.message);
      return `@${author} Had trouble fetching that contract. Make sure it's a valid Solana token address on Jupiter 🤷`;
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

      const prompt = `You are a legendary crypto KOL with a specific personality. Give a RAW take on this token.

📊 OUR SYSTEM DATA (Real-time from Jupiter/Moralis):
${dataContext}

🌐 ADDITIONAL CONTEXT: You have web search enabled. Check for:
- Recent news/announcements about $${symbol}
- Twitter sentiment and trending discussions
- Major partnerships or developments in last 48h
- Any catalysts explaining volume/price movement

COMBINE both our system data AND web-searched context for your take.

PERSONALITY MODE: "${personality.name}"
STYLE: ${personality.style}

EXAMPLES OF YOUR STYLE:
${personality.examples.map((ex, i) => `${i + 1}. ${ex}`).join('\n')}

Now generate YOUR take on the token (max 180 chars):
- Stay true to the personality mode
- Blend our analytics WITH web-searched catalysts/news
- Call out WHO'S moving (whales/retail) AND WHY (if found via search)
- Use the data but filter it through YOUR personality
- Keep it SHORT and punchy
- Focus on the VIBE, not a report
- DO NOT include @username in your reply (it's already added automatically)
- NO hashtags ever
- Minimal emojis (0-2 max) or none at all
- Concise unless you need to present specific data

Reply (without @username):`;

      const opinion = await this.openaiService.generateCompletion(prompt, {
        maxTokens: 150,
        temperature: 0.7,
        model: 'gpt-5', // Use GPT-5 for best analysis and real-time knowledge
        enableWebSearch: true // Enable web search for real-time token data
      });
      
      // Remove any hashtags from the opinion
      const cleanOpinion = opinion.trim().replace(/#\w+/g, '').replace(/\s+/g, ' ').trim();
      
      return cleanOpinion;
      
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

  // ============================================================================
  // MEMORY SERVICE INTEGRATION (Phase 1: Logging)
  // ============================================================================

  async logToMemory({ mention, analysis, reply, author }) {
    try {
      // Determine sentiment from personality used or analysis
      let sentiment = null;
      const replyLower = reply.toLowerCase();
      if (replyLower.includes('aping') || replyLower.includes('bullish') || replyLower.includes('moon') || replyLower.includes('print')) {
        sentiment = 'bullish';
      } else if (replyLower.includes('passing') || replyLower.includes('fading') || replyLower.includes('bearish') || replyLower.includes('cooked')) {
        sentiment = 'bearish';
      } else if (replyLower.includes('cautious') || replyLower.includes('wait')) {
        sentiment = 'cautious';
      }
      
      // Get current personality
      const currentPersonality = this.personalities[
        (this.currentPersonalityIndex - 1 + this.personalities.length) % this.personalities.length
      ].name;
      
      // Log the interaction
      await this.memoryService.logInteraction({
        tweetId: mention.id,
        authorUsername: author,
        authorId: mention.author_id || null,
        mentionText: mention.text,
        replyText: reply,
        interactionType: analysis.replyType,
        extractedTokens: analysis.tokens || [],
        contractAddress: analysis.contractAddress || null,
        personalityUsed: currentPersonality,
        sentiment: sentiment,
        tokenData: null // Will be enriched in future phases
      });
      
      // Update user profile
      await this.memoryService.updateUserProfile(author, {
        userId: mention.author_id || null,
        interactionType: analysis.replyType,
        tokensAskedAbout: analysis.tokens || [],
        providedContract: analysis.replyType === 'contract_analysis'
      });
      
      // Update token history for each mentioned token
      if (analysis.tokens && analysis.tokens.length > 0) {
        for (const symbol of analysis.tokens) {
          await this.memoryService.updateTokenHistory(symbol, {
            contractAddress: analysis.contractAddress || null,
            username: author,
            sentiment: sentiment,
            inCache: true, // Will be determined dynamically in future phases
            tokenData: null // Will be enriched in future phases
          });
        }
      }
      
      console.log(`💾 [MEMORY] Interaction logged for @${author}`);
      
    } catch (error) {
      console.error('❌ [MEMORY] Failed to log interaction:', error.message);
      // Don't throw - memory logging shouldn't break the main flow
    }
  }

}

export default TwitterMentionService;

