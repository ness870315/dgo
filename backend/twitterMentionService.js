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
      
      console.log(`🧠 [MENTIONS] Classification result:`, {
        shouldReply: analysis.shouldReply,
        replyType: analysis.replyType,
        tokens: analysis.tokens,
        reason: analysis.reason
      });
      
      if (!analysis.shouldReply) {
        console.log(`🚫 [MENTIONS] Skipping - ${analysis.reason}`);
        this.repliedMentions.add(mentionId);
        return;
      }
      
      // Generate appropriate reply with conversation context
      const reply = await this.generateReply(analysis, author, conversationContext);
      
      if (!reply || !reply.trim() || reply.trim() === `@${author}`) {
        console.log(`❌ [MENTIONS] Empty reply generated, using safe fallback`);
        const safeText = analysis.replyType === 'kol_opinion' && (analysis.tokens?.[0])
          ? this.generateBasicOpinion(analysis.tokens[0], { mcap: 0 })
          : 'gm anon';
        const finalSafe = `@${author} ${safeText}`.trim();
        const result = await this.postReply(mentionId, finalSafe);
        if (result.success) {
          this.repliedMentions.add(mentionId);
          await this.logToMemory({ mention, analysis, reply: finalSafe, author });
        }
        return;
      }
      
      // Post the reply
      const result = await this.postReply(mentionId, reply);
      
      if (result.success) {
        console.log(`✅ [MENTIONS] Replied to @${author}:`);
        console.log(`📝 [MENTIONS] Full reply text: "${reply}"`);
        console.log(`📏 [MENTIONS] Reply length: ${reply.length} characters`);
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
2. Type of reply needed
3. Extract any mentioned tokens/tickers
4. Extract contract address if present

${contextString}
Mention: "${text}"
Author: @${author}

CRITICAL CLASSIFICATION RULES:

Type = "kol_opinion" if the mention contains ANY of these:
- Questions about buying/investing: "what should I buy", "what to buy", "buy today", "investment", "calls"
- Questions about trending: "what's trending", "what's hot", "trending on CT", "what's pumping"
- Questions about specific tokens: "thoughts on $X", "what about $X", "your take on $X", "$X analysis"
- Performance questions: "why pumping", "why dumping", "what caused", "volume spike"
- Trading advice: "is X a buy", "should I ape", "entry point", "take profit"

Type = "casual" ONLY for:
- Greetings: "gm", "hello", "hey" (without questions)
- Thanks: "thanks", "appreciate it"
- Introductions: "let me introduce you to"
- Platform questions: "how does oracle work"

Type = "contract_analysis" if:
- Contains Solana address (32-44 char alphanumeric)

EXAMPLES (FOLLOW THESE EXACTLY):
✅ "what's trending on CT? what should I buy?" → {"replyType": "kol_opinion", "tokens": [], "reason": "asking for trending + buy recommendations"}
✅ "what is your take on $monkey" → {"replyType": "kol_opinion", "tokens": ["MONKEY"], "reason": "asking for token analysis"}
✅ "what should I buy today" → {"replyType": "kol_opinion", "tokens": [], "reason": "asking for investment advice"}
✅ "what's hot right now" → {"replyType": "kol_opinion", "tokens": [], "reason": "asking for trending tokens"}
❌ "gm @dgnoracle" → {"replyType": "casual", "tokens": [], "reason": "greeting only"}
❌ "thanks for the alpha" → {"replyType": "casual", "tokens": [], "reason": "gratitude"}

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
        model: 'gpt-4o-mini' // Use gpt-4o-mini for reliable JSON responses
      });
      
      console.log(`📝 [CLASSIFIER DEBUG] GPT-5-nano raw response:`, response);
      
      // Parse JSON response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        console.log(`✅ [CLASSIFIER DEBUG] Found JSON:`, jsonMatch[0]);
        const analysis = JSON.parse(jsonMatch[0]);
        analysis.originalText = text; // Store original text for context
        
        // Override: majors should be casual by default (BTC/ETH/SOL/BNB/SUI/etc.)
        const majors = new Set(['BTC','ETH','SOL','BNB','SUI','XRP','ADA','DOGE','TON','AVAX','MATIC','LINK','DOT','LTC','TRX']);
        const hasMajor = (analysis.tokens || []).some(t => majors.has(String(t).toUpperCase()));
        if (hasMajor && analysis.replyType !== 'contract_analysis') {
          analysis.replyType = 'casual';
          analysis.reason = (analysis.reason || '') + ' | forced casual for major coin';
        }
        
        // If AI missed the contract but regex found it, add it
        if (contractMatch && !analysis.contractAddress) {
          analysis.contractAddress = contractMatch[0];
          analysis.replyType = 'contract_analysis';
        }
        
        console.log(`🧠 [MENTIONS] Analysis:`, analysis);
        return analysis;
      }
      
      console.error(`❌ [CLASSIFIER DEBUG] No JSON found in response!`);
      console.error(`❌ [CLASSIFIER DEBUG] Full response was:`, response);
      
      // Fallback: Use rule-based classification
      console.log(`🔧 [CLASSIFIER] Using rule-based fallback...`);
      
      const lowerText = text.toLowerCase();
      let replyType = 'casual';
      let extractedTokens = [];
      
      // Extract token symbols
      const tokenMatches = text.match(/\$[A-Za-z0-9]+/g) || [];
      extractedTokens = tokenMatches.map(t => t.substring(1).toUpperCase());

      // Also map common coin names to symbols (e.g., "bitcoin" -> BTC)
      const lower = lowerText;
      const nameToSymbol = {
        'bitcoin': 'BTC',
        'btc': 'BTC',
        'ethereum': 'ETH',
        'eth': 'ETH',
        'solana': 'SOL',
        'sol': 'SOL'
      };
      for (const [name, sym] of Object.entries(nameToSymbol)) {
        if (lower.includes(name) && !extractedTokens.includes(sym)) {
          extractedTokens.push(sym);
        }
      }
      
      // Rule-based classification
      if (
        lowerText.includes('trending') ||
        lowerText.includes('what should i buy') ||
        lowerText.includes('what to buy') ||
        lowerText.includes('buy today') ||
        lowerText.includes('what\'s hot') ||
        lowerText.includes('whats hot') ||
        lowerText.includes('your take on') ||
        lowerText.includes('thoughts on') ||
        lowerText.includes('opinion on') ||
        extractedTokens.length > 0 // If token mentioned
      ) {
        replyType = 'kol_opinion';
        console.log(`✅ [CLASSIFIER] Matched kol_opinion rules`);
      }
      
      // Override: majors should be casual by default
      const majors = new Set(['BTC','ETH','SOL','BNB','SUI','XRP','ADA','DOGE','TON','AVAX','MATIC','LINK','DOT','LTC','TRX']);
      const hasMajor = extractedTokens.some(t => majors.has(String(t).toUpperCase()));
      if (hasMajor) {
        replyType = 'casual';
      }
      return {
        shouldReply: true,
        replyType: replyType,
        tokens: extractedTokens,
        originalText: text,
        reason: 'rule-based fallback classification'
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

      console.log(`🤖 [MENTIONS] Calling GPT-5-mini for casual reply...`);
      const reply = await this.openaiService.generateCompletion(prompt, {
        maxTokens: 100,
        temperature: 0.8,
        model: 'gpt-5-mini',
        enableWebSearch: true // GPT-5-mini supports web search via Responses API
      });
      
      console.log(`📝 [MENTIONS] GPT-5-mini raw response: "${reply}"`);
      console.log(`📏 [MENTIONS] Raw response length: ${reply?.length || 0} chars`);
      
      // Remove any hashtags from the reply
      const cleanReply = reply.trim().replace(/#\w+/g, '').replace(/\s+/g, ' ').trim();
      
      console.log(`🧹 [MENTIONS] Cleaned reply: "${cleanReply}"`);
      console.log(`📏 [MENTIONS] Cleaned reply length: ${cleanReply.length} chars`);
      
      const finalReply = `@${author} ${cleanReply}`;
      console.log(`✅ [MENTIONS] Final reply: "${finalReply}"`);
      
      return finalReply;
      
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
        // Special-case majors even if not in our local cache
        const majors = new Set(['BTC', 'ETH', 'SOL']);
        if (majors.has(symbol)) {
          try {
            let catalysts = '';
            try {
              catalysts = await this.openaiService.fetchWebCatalysts(symbol, { model: 'gpt-5-mini', lookbackHours: 24, maxOutputTokens: 200 });
            } catch (_) {}

            const personality = this.personalities[this.currentPersonalityIndex];
            this.currentPersonalityIndex = (this.currentPersonalityIndex + 1) % this.personalities.length;

            const prompt = `You are a legendary crypto KOL. Give a SHORT take on $${symbol} today.

🌐 WEB CONTEXT (last 24h):
${catalysts || 'none'}

STYLE: ${personality.style}
EXAMPLES:
${personality.examples.map((ex, i) => `${i + 1}. ${ex}`).join('\n')}

Rules:
- Max 160 chars
- If context is 'none', just vibe-check using typical KOL tone
- No hashtags, no @mentions, minimal/no emojis

Reply:`;

            const opinion = await this.openaiService.generateCompletion(prompt, {
              maxTokens: 120,
              temperature: 0.7,
              model: 'gpt-5',
              enableWebSearch: false
            });
            const cleanOpinion = opinion.trim().replace(/#\w+/g, '').replace(/\s+/g, ' ').trim();
            return `@${author} ${cleanOpinion}`;
          } catch (_) {
            // fall through to generic fallback if something goes wrong
          }
        }

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
      const opinion = await this.generateKOLAnalysis(symbol, enhancedData, analysis);
      
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
      const opinion = await this.generateKOLAnalysis(symbol, enhancedData, analysis);
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
  async generateKOLAnalysis(symbol, tokenData, analysis = {}) {
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

      // Lightweight web enrichment: LEAN prompt for GPT-5-mini Responses API (like casual, completes quickly)
      let catalysts = '';
      try {
        console.log(`🌐 [MENTIONS] Fetching web catalysts for $${symbol}...`);
        const catalystPrompt = `Search CoinGecko, CoinMarketCap, and crypto Twitter for $${symbol} news/updates. Find 1-2 key items (listings/partnerships/notable mentions). Short bullets, no links. If none, say "none".`;
        catalysts = await this.openaiService.generateCompletion(catalystPrompt, {
          maxTokens: 150,
          temperature: 0.3,
          model: 'gpt-5-mini',
          enableWebSearch: true // Responses API with web search (lean prompt = fast like casual)
        });
        console.log(`✅ [MENTIONS] Web catalysts for $${symbol}: ${catalysts ? catalysts.substring(0, 100) : 'none'}`);
      } catch (err) {
        console.warn(`⚠️ [MENTIONS] Failed to fetch web catalysts for $${symbol}:`, err.message);
      }

      const prompt = `You are a legendary crypto KOL with a specific personality. User asked: "${analysis.originalText}"

📊 OUR SYSTEM DATA (Real-time from Jupiter/Moralis):
${dataContext}

🌐 WEB CONTEXT (last 72h):
${catalysts || 'No recent catalysts found'}

PERSONALITY MODE: "${personality.name}"
STYLE: ${personality.style}

EXAMPLES OF YOUR STYLE:
${personality.examples.map((ex, i) => `${i + 1}. ${ex}`).join('\n')}

Now generate YOUR take (max 180 chars):
- DIRECTLY answer their question first
- If they ask "can we see X mcap?", assess if it's realistic given current mcap/momentum/whale behavior
- Blend our analytics WITH web context if present
- Stay true to personality mode
- Keep it SHORT and punchy
- DO NOT include @username (it's added automatically)
- NO hashtags ever
- Minimal/no emojis

Reply (without @username):`;

      // Use gpt-4o for final generation (faster, no timeouts, supports web if needed)
      const opinion = await this.openaiService.generateCompletion(prompt, {
        maxTokens: 150,
        temperature: 0.7,
        model: 'gpt-4o',
        enableWebSearch: false // catalysts already prefetched
      });
      
      // Remove any hashtags from the opinion
      const cleanOpinion = (opinion || '').trim().replace(/#\w+/g, '').replace(/\s+/g, ' ').trim();
      
      // If model returned empty, fall back to data-driven basic opinion
      if (!cleanOpinion) {
        return this.generateBasicOpinion(symbol, tokenData);
      }
      
      return cleanOpinion;
      
    } catch (error) {
      console.error('❌ [MENTIONS] Error generating KOL analysis:', error.message);
      // Fallback to basic opinion
      return this.generateBasicOpinion(symbol, tokenData);
    }
  }

  // Fallback basic opinion without LLM (uses actual backend data)
  generateBasicOpinion(symbol, tokenData) {
    const mcap = tokenData.mcap || tokenData.marketCap || tokenData.jupiterData?.mcap || 0;

    // Prefer Moralis totals; fall back to summed buy/sell; then legacy fields
    let volume24h = 0;
    let buyVol24h = 0;
    let sellVol24h = 0;
    const ma = tokenData.moralisAnalytics || {};
    const totalVol = ma.totalVolume?.['24h'] ?? ma.volume?.['24h'];
    const totalBuy = ma.totalBuyVolume?.['24h'] ?? ma.buyVolume ?? 0;
    const totalSell = ma.totalSellVolume?.['24h'] ?? ma.sellVolume ?? 0;
    if (typeof totalVol === 'number') {
      volume24h = totalVol;
    } else if (totalBuy || totalSell) {
      volume24h = totalBuy + totalSell;
    } else {
      volume24h = tokenData.volume24h || 0;
    }
    buyVol24h = typeof totalBuy === 'number' ? totalBuy : 0;
    sellVol24h = typeof totalSell === 'number' ? totalSell : 0;

    // Compute buy pressure percent if available; else derive from buy/sell
    let buyPressurePct = 50;
    if (typeof ma.buyPct === 'string' || typeof ma.buyPct === 'number') {
      buyPressurePct = parseFloat(ma.buyPct) || 50;
    } else if (buyVol24h + sellVol24h > 0) {
      buyPressurePct = (buyVol24h / (buyVol24h + sellVol24h)) * 100;
    }

    // Use holderAnalysis for segment flow; holderStats for supply/changes
    const whaleFlow = tokenData.holderAnalysis?.holderFlowData?.segmentFlow?.whales?.net || 0;
    const top10Pct = tokenData.holderStats?.holderSupply?.top10?.supplyPercent || 0;
    const holderChange = tokenData.holderStats?.holderChange?.['24h']?.change || 0;

    const volumeToMcap = mcap > 0 ? (volume24h / mcap * 100) : 0;

    console.log(`📊 [FALLBACK] Using data: mcap=$${mcap}, vol=$${volume24h}, vol/mcap=${volumeToMcap.toFixed(1)}%, buy%=${buyPressurePct.toFixed(1)}%`);

    // Build response based on actual metrics
    if (volumeToMcap > 20 && buyPressurePct > 60) {
      return `$${symbol} cooking. ${volumeToMcap.toFixed(0)}% vol/mcap, ${buyPressurePct.toFixed(0)}% buy pressure. ${whaleFlow > 0 ? 'Whales entering' : 'Watch whale exits'}. 👀`;
    } else if (volumeToMcap < 5 && holderChange < -10) {
      return `$${symbol} bleeding holders (${holderChange} in 24h). Volume low at ${volumeToMcap.toFixed(1)}% of mcap. Wait for reversal. 📉`;
    } else if (whaleFlow < -3) {
      return `$${symbol} whales dumping (${whaleFlow} net flow). Top 10 control ${top10Pct.toFixed(1)}%. Risky. ⚠️`;
    } else {
      return `$${symbol} at $${(mcap/1000000).toFixed(2)}M mcap. ${buyPressurePct.toFixed(0)}% buy pressure. Volume ${volumeToMcap.toFixed(1)}% of mcap. Mid play, DYOR.`;
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

