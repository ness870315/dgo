import fetch from 'node-fetch';
import OpenAIService from './openaiService.js';
import CoinDeskService from './services/CoinDeskService.js';
import PerplexitySonarService from './services/PerplexitySonarService.js';
import DGOOpinionDatabase from './services/DGOOpinionDatabase.js';

/**
 * KOL Content Service - Generate authentic crypto influencer content
 * Combines trending system data + web search for real crypto KOL vibes
 * Replaces the old story framework with data-driven, news-aware content
 */
class KOLContentService {
  constructor(backendInstance) {
    this.backend = backendInstance;
    this.openaiService = new OpenAIService();
    this.coinDeskService = new CoinDeskService();
    this.perplexityService = new PerplexitySonarService();
    this.opinionDatabase = new DGOOpinionDatabase();
    this.lastTweetTime = null;
    
    // Configuration panel settings (defaults)
    this.config = {
      mode: 'random',
      minPostsPerDay: 1,
      maxPostsPerDay: 4,
      minHoursBetween: 3,
      activeHours: { start: 8, end: 20 }, // 8 AM - 8 PM UTC
      useOpenAI: true
    };
    
    // Track daily posts
    this.dailyPostCount = 0;
    this.lastResetDate = new Date().toDateString();
    
    // Track posted tokens to avoid repeats (48hr cooldown)
    this.postedTokens = new Map(); // { symbol: timestamp }
    
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
    await this.opinionDatabase.initialize();
    console.log('🎤 KOL Content Service initialized with Opinion Database');
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
   * Select random token from top 10 for deep threads (with 48hr cooldown)
   */
  async selectTokenForDeepThread() {
    const trending = await this.getTrendingTokens(20);
    
    if (trending.length === 0) {
      console.log('⚠️ No trending tokens available');
      return null;
    }

    // Clean up old entries (older than 48 hours)
    const now = Date.now();
    const cooldownMs = 48 * 60 * 60 * 1000; // 48 hours
    for (const [symbol, timestamp] of this.postedTokens.entries()) {
      if (now - timestamp > cooldownMs) {
        this.postedTokens.delete(symbol);
        console.log(`🧹 Removed ${symbol} from cooldown (>48hrs)`);
      }
    }

    // Filter out recently posted tokens
    const top10 = trending.slice(0, Math.min(10, trending.length));
    const available = top10.filter(token => !this.postedTokens.has(token.symbol));

    if (available.length === 0) {
      console.log('⚠️ All top 10 tokens posted recently, using top 5 fallback');
      return await this.selectRandomTrendingToken();
    }

    // Randomly select from available tokens
    const selected = available[Math.floor(Math.random() * available.length)];
    
    // Mark as posted
    this.postedTokens.set(selected.symbol, now);
    
    console.log(`🎯 Selected from top 10 (${available.length} available after cooldown): $${selected.symbol}`, {
      rank: trending.indexOf(selected) + 1,
      mcap: `$${((selected.mcap || 0) / 1_000_000).toFixed(2)}M`,
      score: (selected.overallScore || 0).toFixed(1),
      priceChange: `${(selected.priceChange24h || 0).toFixed(1)}%`,
      cooldownTokens: this.postedTokens.size
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
      
      // ✅ FIX: Calculate volume24h from Jupiter stats24h data (buyVolume + sellVolume)
      let volume24h = (token.jupiterData?.stats24h?.buyVolume || 0) + 
                      (token.jupiterData?.stats24h?.sellVolume || 0) || 
                      token.jupiterData?.volume24h ||
                      token.jupiterData?.volume_24h ||
                      token.volume24h || 0;
      
      const priceChange = token.priceChange24h || 0;
      let holders = token.holderCount || 0;
      const score = token.overallScore || 0;
      
      // Get Jupiter data if available
      const liquidity = token.liquidity || token.jupiterData?.liquidity || 0;
      let buyPressure = token.jupiterData?.stats24h?.buyVolume || 0;
      let sellPressure = token.jupiterData?.stats24h?.sellVolume || 0;
      let buyPct = (buyPressure + sellPressure) > 0 
        ? ((buyPressure / (buyPressure + sellPressure)) * 100).toFixed(1) 
        : 50;

      // Fetch enhanced data (same as mentions service)
      try {
        // Fetch Moralis Token Analytics for accurate volume and buy/sell pressure
        console.log(`📊 [KOL CONTENT] Fetching Moralis analytics for ${token.symbol}...`);
        const { default: TechnicalAnalysisService } = await import('./services/TechnicalAnalysisService.js');
        const techAnalysisService = new TechnicalAnalysisService();
        const moralisAnalytics = await techAnalysisService.getMoralisTokenAnalytics(token.contractAddress);
        
        if (moralisAnalytics) {
          const totalBuy = moralisAnalytics.totalBuyVolume?.['24h'] || moralisAnalytics.buyVolume || 0;
          const totalSell = moralisAnalytics.totalSellVolume?.['24h'] || moralisAnalytics.sellVolume || 0;
          volume24h = totalBuy + totalSell;
          buyPressure = totalBuy;
          sellPressure = totalSell;
          buyPct = (buyPressure + sellPressure) > 0 
            ? ((buyPressure / (buyPressure + sellPressure)) * 100).toFixed(1) 
            : 50;
          console.log(`✅ [KOL CONTENT] Moralis analytics: vol=$${volume24h}, buy=${buyPct}%`);
        }
      } catch (err) {
        console.warn(`⚠️ [KOL CONTENT] Failed to fetch Moralis analytics:`, err.message);
      }

      // Fetch Holder insights
      let holderContext = '';
      try {
        console.log(`👥 [KOL CONTENT] Fetching holder insights for ${token.symbol}...`);
        const { default: HolderTimeseriesService } = await import('./services/HolderTimeseriesService.js');
        const holderService = new HolderTimeseriesService();
        const holderAnalysis = await holderService.getHolderChangeAnalysis(token.contractAddress);
        
        if (holderAnalysis.success) {
          const axios = (await import('axios')).default;
          const API_BASE = 'https://solana-gateway.moralis.io';
          const API_KEY = process.env.MORALIS_API_KEY;
          
          if (API_KEY) {
            const response = await axios.get(
              `${API_BASE}/token/mainnet/holders/${token.contractAddress}`,
              { headers: { 'X-API-Key': API_KEY, 'Content-Type': 'application/json' } }
            );
            
            if (response.status === 200 && response.data) {
              const holderStats = response.data;
              holders = holderStats.totalHolders || holders;
              const whales = holderStats.holderDistribution?.whales || 0;
              const top10Pct = holderStats.holderSupply?.top10?.supplyPercent || 0;
              const holderChange24h = holderStats.holderChange?.['24h']?.change || 0;
              const holderChange30d = holderStats.holderChange?.['30d']?.change || 0;
              
              const segmentFlow = holderAnalysis.holderFlowData?.segmentFlow;
              const whaleFlow = segmentFlow?.whales || { in: 0, out: 0, net: 0 };
              const retailFlow = {
                in: (segmentFlow?.crabs?.in || 0) + (segmentFlow?.shrimps?.in || 0),
                out: (segmentFlow?.crabs?.out || 0) + (segmentFlow?.shrimps?.out || 0),
                net: (segmentFlow?.crabs?.net || 0) + (segmentFlow?.shrimps?.net || 0)
              };
              
              holderContext = `
Whales: ${whales}
Top 10 Control: ${top10Pct.toFixed(1)}%
Holder Change (24h): ${holderChange24h > 0 ? '+' : ''}${holderChange24h}
Holder Change (30d): ${holderChange30d > 0 ? '+' : ''}${holderChange30d}
Whale Flow: ${whaleFlow.net > 0 ? '+' : ''}${whaleFlow.net} (in: ${whaleFlow.in}, out: ${whaleFlow.out})
Retail Flow: ${retailFlow.net > 0 ? '+' : ''}${retailFlow.net} (in: ${retailFlow.in}, out: ${retailFlow.out})`;
              
              console.log(`✅ [KOL CONTENT] Holder insights: ${holders} holders, ${whales} whales, top10=${top10Pct.toFixed(1)}%`);
            }
          }
        }
      } catch (err) {
        console.warn(`⚠️ [KOL CONTENT] Failed to fetch holder insights:`, err.message);
      }

      const volumeToMcap = mcap > 0 ? ((volume24h / mcap) * 100).toFixed(1) : 0;

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
Degen Oracle Score: ${score.toFixed(1)}/10${holderContext}`;

      // Fetch web context via Tavily (proven approach from mentions)
      console.log(`🔍 [KOL CONTENT] Fetching Tavily updates for $${token.symbol}...`);
      let tavilyResults = '';
      try {
        tavilyResults = await this.openaiService.searchTavily(`latest news and updates on $${token.symbol} crypto token`);
        console.log(`✅ [KOL CONTENT] Tavily results: ${tavilyResults.substring(0, 100)}...`);
      } catch (err) {
        console.warn(`⚠️ [KOL CONTENT] Tavily search failed:`, err.message);
      }

      // 🧠 NEW: Get relevant past opinions for context and consistency
      let pastOpinionsContext = '';
      if (this.opinionDatabase) {
        try {
          const relevantOpinions = await this.opinionDatabase.findRelevantOpinions(
            `${token.symbol} ${tavilyResults}`,
            { type: 'single', timeframe: 'recent', limit: 2 }
          );
          
          if (relevantOpinions.length > 0) {
            pastOpinionsContext = `

🧠 YOUR PAST TAKES ON $${token.symbol} (for consistency):
${relevantOpinions.map(op => `- ${op.text}`).join('\n')}`;
            
            console.log(`🧠 [KOL CONTENT] Found ${relevantOpinions.length} relevant past opinions for $${token.symbol}`);
          }
        } catch (error) {
          console.error('❌ [KOL CONTENT] Error retrieving past opinions:', error.message);
        }
      }

      const prompt = `You are ${personality.name}, a real crypto KOL with ${personality.style}.

${dataContext}

🔍 TAVILY WEB SEARCH RESULTS:
${tavilyResults || 'No recent news found'}${pastOpinionsContext}

CONTENT TYPE: ${contentType === 'single' ? 'Single tweet (280 chars)' : 'Thread starter tweet (280 chars)'}

Generate a ${contentType === 'single' ? 'RICH, FACT-PACKED tweet' : 'HOOK thread starter'} that:
- BLEND our analytics WITH latest news/catalysts
- ${personality.tone}
- Highlights the most interesting/surprising finding (data or news)
- If there's news about partnerships, listings, whale activity: WEAVE them in naturally
- If pumping: explain WHY using both metrics and news
- If good fundamentals but no pump yet: explain the opportunity
- Build on your past takes naturally when relevant for consistency
- Show consistency or acknowledge if your view changed
- Use crypto slang naturally (not forced)
- DO NOT mention data sources (just present the insights)
- NO hashtags
- Include $${token.symbol} ticker
- Max 280 characters
- Sound like a real person sharing alpha, not a bot

${contentType === 'thread' ? 'START with "🧵 1/" and end with "↓" to indicate it\'s a thread. Example: "🧵 1/ Breaking down how I spot early KOL plays step by step ↓"' : ''}

Tweet:`;

      const content = await this.openaiService.generateCompletion(prompt, {
        maxTokens: 100,
        temperature: 0.8,
        model: 'gpt-4o-mini', // 🚀 COST OPTIMIZATION: 40x cheaper than gpt-4o
        enableWebSearch: false // Tavily already fetched
      });

      // Clean up
      const cleanContent = content.trim()
        .replace(/#\w+/g, '') // Remove hashtags
        .replace(/\s+/g, ' ')
        .trim();

      console.log(`✍️ Generated ${contentType} content for $${token.symbol} (${personality.name})`);
      
      // Save to Opinion DB
      if (this.opinionDatabase) {
        try {
          await this.opinionDatabase.storeOpinion({
            type: contentType === 'single' ? 'single_tweet' : 'thread_starter',
            text: cleanContent,
            marketContext: `${token.symbol} analysis: ${tavilyResults || 'No recent news'}`,
            sentiment: 'neutral',
            tweetId: null,
            timestamp: new Date().toISOString()
          });
          console.log(`💾 [OPINION DB] Saved ${contentType} content to database`);
        } catch (error) {
          console.error('❌ [OPINION DB] Failed to save content:', error.message);
        }
      }
      
      return cleanContent;

    } catch (error) {
      console.error(`❌ Error generating content for ${token.symbol}:`, error.message);
      return null;
    }
  }

  /**
   * Generate a thread about a token (3 tweets deep-dive with enhanced data)
   */
  async generateTokenThread(token) {
    try {
      console.log(`🧵 Generating enhanced deep thread for $${token.symbol}...`);

      // Fetch enhanced data (same as mentions service)
      let volume24h = token.volume24h || 0;
      let buyPressure = token.jupiterData?.stats24h?.buyVolume || 0;
      let sellPressure = token.jupiterData?.stats24h?.sellVolume || 0;
      let holders = token.holderCount || 0;
      let whaleContext = '';

      try {
        console.log(`📊 [KOL THREAD] Fetching Moralis analytics for ${token.symbol}...`);
        const { default: TechnicalAnalysisService } = await import('./services/TechnicalAnalysisService.js');
        const techAnalysisService = new TechnicalAnalysisService();
        const moralisAnalytics = await techAnalysisService.getMoralisTokenAnalytics(token.contractAddress);
        
        if (moralisAnalytics) {
          const totalBuy = moralisAnalytics.totalBuyVolume?.['24h'] || moralisAnalytics.buyVolume || 0;
          const totalSell = moralisAnalytics.totalSellVolume?.['24h'] || moralisAnalytics.sellVolume || 0;
          volume24h = totalBuy + totalSell;
          buyPressure = totalBuy;
          sellPressure = totalSell;
          console.log(`✅ [KOL THREAD] Moralis analytics: vol=$${volume24h}, buy=${buyPressure}, sell=${sellPressure}`);
        }
      } catch (err) {
        console.warn(`⚠️ [KOL THREAD] Failed to fetch Moralis analytics:`, err.message);
      }

      // Fetch Holder insights
      try {
        console.log(`👥 [KOL THREAD] Fetching holder insights for ${token.symbol}...`);
        const { default: HolderTimeseriesService } = await import('./services/HolderTimeseriesService.js');
        const holderService = new HolderTimeseriesService();
        const holderAnalysis = await holderService.getHolderChangeAnalysis(token.contractAddress);
        
        if (holderAnalysis.success) {
          const axios = (await import('axios')).default;
          const API_BASE = 'https://solana-gateway.moralis.io';
          const API_KEY = process.env.MORALIS_API_KEY;
          
          if (API_KEY) {
            const response = await axios.get(
              `${API_BASE}/token/mainnet/holders/${token.contractAddress}`,
              { headers: { 'X-API-Key': API_KEY, 'Content-Type': 'application/json' } }
            );
            
            if (response.status === 200 && response.data) {
              const holderStats = response.data;
              holders = holderStats.totalHolders || holders;
              const whales = holderStats.holderDistribution?.whales || 0;
              const top10Pct = holderStats.holderSupply?.top10?.supplyPercent || 0;
              const holderChange24h = holderStats.holderChange?.['24h']?.change || 0;
              const holderChange30d = holderStats.holderChange?.['30d']?.change || 0;
              
              const segmentFlow = holderAnalysis.holderFlowData?.segmentFlow;
              const whaleFlow = segmentFlow?.whales || { in: 0, out: 0, net: 0 };
              const retailFlow = {
                in: (segmentFlow?.crabs?.in || 0) + (segmentFlow?.shrimps?.in || 0),
                out: (segmentFlow?.crabs?.out || 0) + (segmentFlow?.shrimps?.out || 0),
                net: (segmentFlow?.crabs?.net || 0) + (segmentFlow?.shrimps?.net || 0)
              };
              
              whaleContext = `
Whales: ${whales}
Top 10 Control: ${top10Pct.toFixed(1)}%
Holder Change (24h): ${holderChange24h > 0 ? '+' : ''}${holderChange24h}
Holder Change (30d): ${holderChange30d > 0 ? '+' : ''}${holderChange30d}
Whale Flow: ${whaleFlow.net > 0 ? '+' : ''}${whaleFlow.net} (in: ${whaleFlow.in}, out: ${whaleFlow.out})
Retail Flow: ${retailFlow.net > 0 ? '+' : ''}${retailFlow.net} (in: ${retailFlow.in}, out: ${retailFlow.out})`;
              
              console.log(`✅ [KOL THREAD] Holder insights: ${holders} holders, ${whales} whales, top10=${top10Pct.toFixed(1)}%`);
            }
          }
        }
      } catch (err) {
        console.warn(`⚠️ [KOL THREAD] Failed to fetch holder insights:`, err.message);
      }

      // Fetch Tavily news/catalysts
      console.log(`🔍 [KOL THREAD] Fetching Tavily updates for $${token.symbol}...`);
      let tavilyResults = '';
      try {
        tavilyResults = await this.openaiService.searchTavily(`latest news and updates on $${token.symbol} crypto token`);
        console.log(`✅ [KOL THREAD] Tavily results: ${tavilyResults.substring(0, 100)}...`);
      } catch (err) {
        console.warn(`⚠️ [KOL THREAD] Tavily search failed:`, err.message);
      }

      // 🧠 NEW: Get relevant past opinions for context and consistency
      let pastOpinionsContext = '';
      if (this.opinionDatabase) {
        try {
          const relevantOpinions = await this.opinionDatabase.findRelevantOpinions(
            `${token.symbol} ${tavilyResults}`,
            { type: 'deep_thread', timeframe: 'recent', limit: 3 }
          );
          
          if (relevantOpinions.length > 0) {
            pastOpinionsContext = `

🧠 YOUR PAST DEEP ANALYSIS ON $${token.symbol} (for consistency):
${relevantOpinions.map(op => `- ${op.text}`).join('\n')}`;
            
            console.log(`🧠 [KOL THREAD] Found ${relevantOpinions.length} relevant past deep analysis for $${token.symbol}`);
          }
        } catch (error) {
          console.error('❌ [KOL THREAD] Error retrieving past opinions:', error.message);
        }
      }

      // Tweet 1: Hook (interesting finding or question)
      const tweet1 = await this.generateTokenContent(token, 'thread');
      
      if (!tweet1) {
        throw new Error('Failed to generate tweet 1');
      }

      // Tweet 2: Enhanced data/metrics deep-dive with real analytics
      const mcap = token.mcap || token.marketCap || 0;
      const volumeToMcap = mcap > 0 ? ((volume24h / mcap) * 100).toFixed(1) : 0;
      const priceChange = token.priceChange24h || 0;
      const buyPct = (buyPressure + sellPressure) > 0 
        ? ((buyPressure / (buyPressure + sellPressure)) * 100).toFixed(1) 
        : 50;

      const tweet2Prompt = `Write tweet 2 of a crypto thread about $${token.symbol}.

Tweet 1 was: "${tweet1}"

📊 ENHANCED DATA BREAKDOWN:
- MCap: $${(mcap / 1_000_000).toFixed(2)}M
- 24h Volume: $${(volume24h / 1_000).toFixed(1)}K (${volumeToMcap}% of mcap)
- Price: ${priceChange > 0 ? '+' : ''}${priceChange.toFixed(1)}% (24h)
- Buy pressure: ${buyPct}%
- Holders: ${holders.toLocaleString()}${whaleContext}

🔍 TAVILY NEWS/CATALYSTS:
${tavilyResults || 'No recent news found'}${pastOpinionsContext}

START with "2/" to continue the thread.
Present these numbers + any news in a compelling way that tells a story.
If there's specific catalysts/news, WEAVE them in naturally.
What do these metrics + news reveal? What's the narrative?
Build on your past analysis naturally when relevant for consistency.
DO NOT mention data sources (Tavily, Moralis, etc) - just present the insights.
Max 280 characters. Crypto slang. No hashtags.

Example format: "2/ $MONKEY in 60s: mcap $0.21M, vol/mcap 13.6%, whale flow -5, retail flow +5. No hopium, just numbers"

Tweet 2:`;

      const tweet2 = await this.openaiService.generateCompletion(tweet2Prompt, {
        maxTokens: 100,
        temperature: 0.7,
        model: 'gpt-4o-mini' // 🚀 COST OPTIMIZATION: 40x cheaper
      });

      // Tweet 3: Data-driven verdict/recommendation
      const tweet3Prompt = `Write tweet 3 of a crypto thread about $${token.symbol}.

Previous tweets covered the hook and enhanced data.

📊 DATA-DRIVEN VERDICT:
Based on the REAL metrics we just analyzed:
- Volume/MCap ratio: ${volumeToMcap}%
- Buy pressure: ${buyPct}%
- Holder momentum: ${holders > 0 ? 'Active' : 'Unknown'}${whaleContext ? `, whale flow analysis available` : ''}
${tavilyResults ? `- Recent news/catalysts: ${tavilyResults.substring(0, 100)}...` : ''}${pastOpinionsContext}

Give your VERDICT based on ACTUAL DATA:
- Is this a call? Wait and watch? Or pass?
- What's the risk level based on real metrics?
- What SPECIFIC data points should degens watch?
- Build on your past analysis naturally when relevant for consistency

START with "3/" to continue the thread.
Be decisive. Take a stance based on DATA, not speculation.
NO generic advice like "watch for dev updates" if no dev exists.
Max 280 characters. Crypto slang. No hashtags.

Example format: "3/ Data says: vol/mcap ${volumeToMcap}% is ${parseFloat(volumeToMcap) > 20 ? 'strong' : 'weak'}, buy pressure ${buyPct}% ${parseFloat(buyPct) > 60 ? 'bullish' : 'concerning'}. ${parseFloat(volumeToMcap) > 20 && parseFloat(buyPct) > 60 ? 'Worth watching.' : 'Wait for better setup.'}"

Tweet 3:`;

      const tweet3 = await this.openaiService.generateCompletion(tweet3Prompt, {
        maxTokens: 100,
        temperature: 0.8,
        model: 'gpt-4o-mini' // 🚀 COST OPTIMIZATION: 40x cheaper
      });

      const thread = [
        tweet1.trim().replace(/#\w+/g, '').replace(/\s+/g, ' ').trim(),
        tweet2.trim().replace(/#\w+/g, '').replace(/\s+/g, ' ').trim(),
        tweet3.trim().replace(/#\w+/g, '').replace(/\s+/g, ' ').trim()
      ];

      console.log(`✅ Generated thread for $${token.symbol} (${thread.length} tweets)`);
      
      // Save entire thread to Opinion DB
      if (this.opinionDatabase) {
        try {
          const threadText = thread.join(' ');
          await this.opinionDatabase.storeOpinion({
            type: 'deep_thread',
            text: threadText,
            marketContext: `${token.symbol} deep analysis: ${tavilyResults || 'No recent news'}`,
            sentiment: 'neutral',
            tweetId: null,
            timestamp: new Date().toISOString()
          });
          console.log(`💾 [OPINION DB] Saved deep thread for $${token.symbol} to database`);
        } catch (error) {
          console.error('❌ [OPINION DB] Failed to save deep thread:', error.message);
        }
      }
      
      return thread;

    } catch (error) {
      console.error(`❌ Error generating thread for ${token.symbol}:`, error.message);
      return null;
    }
  }

  /**
   * Generate crypto news recap using Perplexity for real-time news
   */
  async generateCryptoNews() {
    try {
      console.log('📰 [KOL CONTENT] Generating real-time crypto news recap...');

      // 🚀 ENHANCED: Use Perplexity for real-time news instead of CoinDesk
      if (!this.perplexityService || !this.perplexityService.isInitialized) {
        console.warn('⚠️ [KOL CONTENT] Perplexity service not initialized, falling back to CoinDesk');
        const article = await this.coinDeskService.getRandomArticle();
        if (!article) {
          console.log('⚠️ [KOL CONTENT] No news articles available');
          return null;
        }
        return await this.generateNewsFromCoinDesk(article);
      }

      // Use Perplexity for real-time news
      const realTimeNewsQueries = [
        'Latest Bitcoin news last 2 hours, current Bitcoin price, recent Bitcoin developments',
        'Latest Solana news last 2 hours, Solana ecosystem updates, Solana price movement',
        'Latest crypto news last 2 hours, major crypto announcements, trending crypto events',
        'Latest DeFi news last 2 hours, major DeFi protocols, DeFi token movements',
        'Latest crypto regulatory news last 2 hours, SEC announcements, crypto policy updates'
      ];
      
      const randomNewsQuery = realTimeNewsQueries[Math.floor(Math.random() * realTimeNewsQueries.length)];
      console.log(`📰 [CRYPTO NEWS] Using real-time query: ${randomNewsQuery}`);
      
      const perplexityResponse = await this.perplexityService.searchWithReasoning(randomNewsQuery);
      
      if (!perplexityResponse || !perplexityResponse.content) {
        console.log('⚠️ [KOL CONTENT] No Perplexity response for crypto news, falling back to CoinDesk');
        const article = await this.coinDeskService.getRandomArticle();
        if (!article) {
          console.log('⚠️ [KOL CONTENT] No news articles available');
          return null;
        }
        return await this.generateNewsFromCoinDesk(article);
      }

      // Select personality
      const personality = this.personalities[this.currentPersonalityIndex];
      this.currentPersonalityIndex = (this.currentPersonalityIndex + 1) % this.personalities.length;

      console.log(`✅ [CRYPTO NEWS] Real-time news: ${perplexityResponse.content.substring(0, 100)}...`);

      // 🧠 NEW: Get relevant past opinions for context and consistency
      let pastOpinionsContext = '';
      if (this.opinionDatabase) {
        try {
          const relevantOpinions = await this.opinionDatabase.findRelevantOpinions(
            perplexityResponse.content,
            { type: 'news', timeframe: 'recent', limit: 2 }
          );
          
          if (relevantOpinions.length > 0) {
            pastOpinionsContext = `

🧠 YOUR PAST NEWS TAKES (for consistency):
${relevantOpinions.map(op => `- ${op.text}`).join('\n')}`;
            
            console.log(`🧠 [CRYPTO NEWS] Found ${relevantOpinions.length} relevant past news opinions`);
          }
        } catch (error) {
          console.error('❌ [CRYPTO NEWS] Error retrieving past opinions:', error.message);
        }
      }

      const prompt = `You are ${personality.name}, a real crypto KOL with ${personality.style}.

📰 REAL-TIME CRYPTO NEWS:
${perplexityResponse.content}${pastOpinionsContext}

${personality.tone}

Generate a DeGen Oracle-style news recap that:
- Uses the REAL-TIME news data above (not stale data)
- Summarizes the key points in crypto-native language
- Adds your unique perspective/analysis
- Uses crypto slang naturally (not forced)
- Highlights what this means for degens
- Build on your past takes naturally when relevant for consistency
- Show consistency or acknowledge if your view changed
- NO hashtags
- Max 280 characters
- Sound like a real person sharing alpha, not a bot
- VARY your opening - don't always start with "Yo degens"

Opening variations (use different ones):
- "Yo degens, [news]..."
- "GM anons, [news]..."
- "Apes, [news]..."
- "Ser, [news]..."
- "Frens, [news]..."
- Just start with the news directly: "BTC just hit..."
- "Breaking: [news]..."
- "Alpha: [news]..."

Example: "BTC just hit $125K—whales are loading up again. Smart money positioning for the next leg up. Follow the whales, not the hype 👀"

News recap:`;

      const recap = await this.openaiService.generateCompletion(prompt, {
        maxTokens: 120,
        temperature: 0.8,
        model: 'gpt-4o-mini', // 🚀 COST OPTIMIZATION: 40x cheaper
        enableWebSearch: false
      });

      // Clean up
      const cleanRecap = recap.trim()
        .replace(/#\w+/g, '') // Remove hashtags
        .replace(/\s+/g, ' ')
        .trim();

      console.log(`✍️ Generated news recap: "${cleanRecap.substring(0, 50)}..." (${personality.name})`);
      return {
        format: 'news',
        tweets: [cleanRecap],
        token: { symbol: 'NEWS', name: 'Crypto News' },
        article: {
          title: 'Real-time Crypto News',
          content: perplexityResponse.content,
          source: 'Perplexity',
          timestamp: new Date().toISOString()
        }
      };

    } catch (error) {
      console.error(`❌ Error generating crypto news:`, error.message);
      return null;
    }
  }

  /**
   * Generate crypto tech insights using Perplexity for protocol/utility/DeFi analysis
   */
  async generateCryptoTechNews() {
    try {
      console.log('🔬 [KOL CONTENT] Generating crypto tech insights...');

      // Use Perplexity for crypto tech insights
      if (!this.perplexityService || !this.perplexityService.isInitialized) {
        console.warn('⚠️ [KOL CONTENT] Perplexity service not initialized');
        return null;
      }

      // Query Perplexity for crypto tech insights
      const techInsightsQuery = 'tell me analytical insights on what is new in crypto, protocols, utility coins, DeFi this week';
      console.log(`🔬 [CRYPTO TECH] Using tech insights query: ${techInsightsQuery}`);
      
      const perplexityResponse = await this.perplexityService.searchWithReasoning(techInsightsQuery);
      
      if (!perplexityResponse || !perplexityResponse.content) {
        console.log('⚠️ [KOL CONTENT] No Perplexity response for crypto tech insights');
        return null;
      }

      // Select personality
      const personality = this.personalities[this.currentPersonalityIndex];
      this.currentPersonalityIndex = (this.currentPersonalityIndex + 1) % this.personalities.length;

      console.log(`✅ [CRYPTO TECH] Tech insights: ${perplexityResponse.content.substring(0, 100)}...`);

      // 🧠 NEW: Get relevant past opinions for context and consistency
      let pastOpinionsContext = '';
      if (this.opinionDatabase) {
        try {
          const relevantOpinions = await this.opinionDatabase.findRelevantOpinions(
            perplexityResponse.content,
            { type: 'crypto_tech_insights', timeframe: 'recent', limit: 3 }
          );
          
          if (relevantOpinions.length > 0) {
            pastOpinionsContext = `

🧠 YOUR PAST INSIGHTS (for context and consistency):
${relevantOpinions.map(op => `- ${op.text}`).join('\n')}`;
            
            console.log(`🧠 [CRYPTO TECH] Found ${relevantOpinions.length} relevant past opinions for context`);
          }
        } catch (error) {
          console.error('❌ [CRYPTO TECH] Error retrieving past opinions:', error.message);
        }
      }

      const prompt = `You are ${personality.name}, a real crypto KOL with ${personality.style}.

🔬 CRYPTO TECH INSIGHTS:
${perplexityResponse.content}${pastOpinionsContext}

${personality.tone}

Generate a DeGen Oracle-style tech insights tweet that:
- Uses the tech insights data above (protocols, utility coins, DeFi developments)
- Provides analytical insights like unlock schedules, volume changes, market cap impacts
- Focuses on specific protocols, tokenomics, and technical developments
- Uses crypto slang naturally (not forced)
- Highlights what this means for degens and traders
- Builds on your past insights naturally when relevant
- Shows consistency in your analysis approach
- Avoids contradicting yourself without acknowledging it
- NO hashtags
- Max 280 characters
- Sound like a real person sharing alpha, not a bot
- VARY your opening - don't always start with "Yo degens"

Opening variations (use different ones):
- "Yo degens, [insight]..."
- "GM anons, [insight]..."
- "Apes, [insight]..."
- "Ser, [insight]..."
- "Frens, [insight]..."
- Just start with the insight directly: "Protocol X just..."
- "Breaking: [insight]..."
- "Alpha: [insight]..."

Example style: "Nillion launched 2.0 today but 10.84m nil tokens unlock october 24. that's $2.94m hitting a $70.6m market cap in 4 days. september's unlock dumped 31% over 18 days before any recovery. new buyers celebrating the launch about to learn why unlock schedules override product releases in low liquidity markets"

Tech insights tweet:`;

      const insight = await this.openaiService.generateCompletion(prompt, {
        maxTokens: 120,
        temperature: 0.8,
        model: 'gpt-4o-mini', // 🚀 COST OPTIMIZATION: 40x cheaper
        enableWebSearch: false
      });

      // Clean up
      const cleanInsight = insight.trim()
        .replace(/#\w+/g, '') // Remove hashtags
        .replace(/\s+/g, ' ')
        .trim();

      console.log(`✍️ Generated tech insight: "${cleanInsight.substring(0, 50)}..." (${personality.name})`);
      
      // Save to Opinion DB
      if (this.opinionDatabase) {
        try {
          await this.opinionDatabase.storeOpinion({
            type: 'crypto_tech_insights',
            text: cleanInsight,
            marketContext: perplexityResponse.content,
            sentiment: 'neutral',
            tweetId: null,
            timestamp: new Date().toISOString()
          });
          console.log('💾 [OPINION DB] Saved crypto tech insights to database');
        } catch (error) {
          console.error('❌ [OPINION DB] Failed to save tech insights:', error.message);
        }
      }
      
      return {
        format: 'crypto-tech-news',
        tweets: [cleanInsight],
        token: { symbol: 'TECH', name: 'Crypto Tech Insights' },
        article: {
          title: 'Crypto Tech Insights',
          content: perplexityResponse.content,
          source: 'Perplexity',
          timestamp: new Date().toISOString()
        }
      };

    } catch (error) {
      console.error(`❌ Error generating crypto tech insights:`, error.message);
      return null;
    }
  }

  /**
   * Build a Perplexity query for momentum analysis
   */
  buildMomentumQuery(candidate) {
    const comparables = candidate.comparables && candidate.comparables.length > 0
      ? candidate.comparables.join(', ')
      : 'competing protocols';

    const aliases = candidate.aliases && candidate.aliases.length > 0
      ? ` (${candidate.aliases.join(', ')})`
      : '';

    return `Provide a factual weekly performance briefing for ${candidate.name}${aliases}. 
Focus on:
- Transaction count growth (daily/weekly numbers with % change)
- Fee or revenue trends (daily/weekly numbers with % change)
- TVL or liquidity flows with absolute dollars and % change
- Any token emissions, burns, or unlock schedules executed this week with amounts
- New integrations, governance votes, or distribution expansions
- Compare briefly against ${comparables}.
Return bullet points with precise numbers, timeframes, and mention sources if possible.`;
  }

  /**
   * Fisher–Yates shuffle helper
   */
  shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  /**
   * Build candidate list for momentum analysis using live data + recent opinions
   */
  async buildMomentumCandidates() {
    const candidates = [];

    if (!this.perplexityService || !this.perplexityService.isInitialized) {
      console.warn('⚠️ [MOMENTUM] Perplexity service not initialized, skipping candidate discovery');
      return candidates;
    }

    const coreQueries = [
      'Top crypto protocols showing weekly transaction accelerations and on-chain adoption growth',
      'Fastest-growing L2 rollups or scaling solutions by fees, TVL, and developer adoption this week',
      'Infrastructure providers or block builders gaining traction (MEV, validators, execution clients)',
      'AI payment rails, agent settlement layers, or on-chain compute platforms gaining market share',
      'Cross-chain messaging, bridges, and interoperability protocols with accelerating usage metrics',
      'Stablecoin issuers or tokenized real-world asset platforms with significant inflows this month'
    ];

    const queryResults = await Promise.all(coreQueries.map(async (query) => {
      try {
        console.log(`🔍 [MOMENTUM] Perplexity macro query: ${query}`);
        const response = await this.perplexityService.searchCrypto(query, {
          searchRecencyFilter: 'month',
          temperature: 0.2,
          maxTokens: 600
        });
        if (!response || !response.content) {
          return null;
        }
        return response;
      } catch (error) {
        console.warn(`⚠️ [MOMENTUM] Perplexity macro query failed: ${error.message}`);
        return null;
      }
    }));

    queryResults.filter(Boolean).forEach((result, index) => {
      const lines = result.content.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);

      lines.forEach(line => {
        const match = line.match(/^(?:[-*\d\.\)]\s*)?(.+?)(?:(?:—|-|:).*$|$)/i);
        if (!match) {
          return;
        }

        const name = match[1]
          .replace(/^[\d\.\)\-\*\s]+/, '')
          .replace(/\s+\([^)]*\)$/, '')
          .trim();

        if (!name || name.length < 3) {
          return;
        }

        candidates.push({
          name,
          symbol: null,
          aliases: [name],
          comparables: [],
          score: 100 - index * 5,
          source: 'perplexity-macro',
          macroContext: result.content,
          references: result.citations || result.searchResults || []
        });
      });
    });

    if (this.opinionDatabase && candidates.length > 0) {
      try {
        const recentMomentum = await this.opinionDatabase.getRecentMomentumEntities(168, 10);
        recentMomentum.forEach(entry => {
          const normalizedName = entry.name?.trim();
          if (!normalizedName) {
            return;
          }

          const existing = candidates.find(candidate =>
            candidate.name.toLowerCase() === normalizedName.toLowerCase()
          );

          if (existing) {
            existing.score = Math.max(existing.score, 80);
            existing.aliases = Array.from(new Set([
              ...existing.aliases,
              ...(entry.aliases || [])
            ].filter(Boolean)));
            existing.metadata = {
              ...(existing.metadata || {}),
              lastStoredAt: entry.metadata?.generatedAt || entry.metadata?.storedAt || null
            };
            return;
          }

          candidates.push({
            name: normalizedName,
            symbol: entry.symbol ? entry.symbol.toString().trim().toUpperCase() : null,
            aliases: [
              normalizedName,
              normalizedName.toLowerCase(),
              ...(entry.aliases || [])
            ].filter(Boolean),
            comparables: entry.comparables || [],
            score: 65,
            source: 'opinion-db',
            metadata: entry.metadata || {}
          });
        });
      } catch (error) {
        console.error('❌ [MOMENTUM] Failed to load recent momentum entities:', error.message);
      }
    }

    if (candidates.length === 0) {
      console.warn('⚠️ [MOMENTUM] No momentum candidates available after macro queries');
      return [];
    }

    const deduped = [];
    const seen = new Set();
    candidates
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .forEach(candidate => {
        const key = candidate.name.toLowerCase();
        if (seen.has(key)) {
          return;
        }
        seen.add(key);
        deduped.push(candidate);
      });

    return deduped.slice(0, 12);
  }

  /**
   * Extract structured momentum metrics from facts
   */
  extractMomentumMetrics(facts, candidate, competitorKeywordSet) {
    const metrics = {
      fees: [],
      transactions: [],
      volume: [],
      tvl: [],
      burns: [],
      unlocks: [],
      supply: [],
      integrations: [],
      governance: [],
      comparisons: [],
      raw: facts,
      entity: candidate.name,
      generatedAt: new Date().toISOString()
    };

    facts.forEach(fact => {
      const lower = fact.toLowerCase();
      if (/fee|revenue|income|earnings/.test(lower)) metrics.fees.push(fact);
      if (/tx|transaction|swap count/.test(lower)) metrics.transactions.push(fact);
      if (/volume|flow/.test(lower)) metrics.volume.push(fact);
      if (/tvl|total value locked|liquidity/.test(lower)) metrics.tvl.push(fact);
      if (/burn/.test(lower)) metrics.burns.push(fact);
      if (/unlock|vesting|release/.test(lower)) metrics.unlocks.push(fact);
      if (/circulating|supply|emission|fdv/.test(lower)) metrics.supply.push(fact);
      if (/integration|partner|onboard|support/.test(lower)) metrics.integrations.push(fact);
      if (/vote|governance|proposal|dao/.test(lower)) metrics.governance.push(fact);

      const containsCompetitor = Array.from(competitorKeywordSet || []).some(keyword => {
        return lower.includes(keyword) && !lower.includes(candidate.name.toLowerCase());
      });
      if (containsCompetitor) {
        metrics.comparisons.push(fact);
      }
    });

    return metrics;
  }

  /**
   * Compose a momentum thread using OpenAI
   */
  async composeMomentumOpinion(candidate, facts, metrics, pastOpinions) {
    try {
      const factLines = facts.slice(0, 8).map((fact, index) => `${index + 1}. ${fact}`).join('\n');
      const comparisonLines = metrics.comparisons && metrics.comparisons.length > 0
        ? metrics.comparisons.join('\n')
        : 'None provided';

      const pastTakes = pastOpinions && pastOpinions.length > 0
        ? pastOpinions.map(op => `- (${op.dateString}) ${op.text}`).join('\n')
        : 'None';

      const prompt = `You are Degen Oracle, a crypto-native analyst.

Craft ONE 280-character (or shorter) momentum take about ${candidate.name} that:
- Opens with $${candidate.symbol || candidate.name.toUpperCase()} (or the project name) and a crisp hook.
- Weaves in 2-3 concrete stats from the data below (fees, tx growth, TVL, integrations, unlocks, comparisons) with actual numbers.
- Highlights why this acceleration matters (monopoly risk, infra shift, new demand channel, etc.).
- Ends with a clear stance: call it, wait for call, or add to watchlist.
- Keeps crypto slang natural (ser, degens, LFG) but never uses hashtags.
- Avoids lists, newlines, or markdown—just a single punchy sentence or two.

DATA:
${factLines}

Comparisons / competitors:
${comparisonLines}

Your stored takes to stay consistent:
${pastTakes}`;

      const opinionResponse = await this.openaiService.generateCompletion(prompt, {
        maxTokens: 180,
        temperature: 0.55,
        model: 'gpt-4o-mini',
        enableWebSearch: false
      });

      if (!opinionResponse) {
        return '';
      }

      return opinionResponse
        .replace(/#\w+/g, '')
        .replace(/\s+/g, ' ')
        .replace(/^"|"$/g, '')
        .trim();
    } catch (error) {
      console.error('❌ [MOMENTUM] Error composing opinion:', error.message);
      return '';
    }
  }

  /**
   * Generate a momentum opinion post (simplified to match Crypto Tech Insights pattern)
   */
  async generateMomentumThread() {
    try {
      console.log('⚡ [MOMENTUM] Generating momentum opinion post...');

      if (!this.perplexityService || !this.perplexityService.isInitialized) {
        console.warn('⚠️ [MOMENTUM] Perplexity service not initialized');
        return null;
      }

      // Single Perplexity query for momentum insights
      const momentumQuery = 'What are the top crypto protocols, blockchains, L2s, or AI payment rails showing the fastest weekly transaction acceleration, fee growth, or TVL momentum? Provide specific numbers and percentages.';
      console.log(`⚡ [MOMENTUM] Querying Perplexity for momentum insights...`);
      
      const perplexityResponse = await this.perplexityService.searchWithReasoning(momentumQuery);
      
      if (!perplexityResponse || !perplexityResponse.content) {
        console.log('⚠️ [MOMENTUM] No Perplexity response for momentum insights');
        return null;
      }

      console.log(`✅ [MOMENTUM] Got insights: ${perplexityResponse.content.substring(0, 100)}...`);

      // Select personality
      const personality = this.personalities[this.currentPersonalityIndex];
      this.currentPersonalityIndex = (this.currentPersonalityIndex + 1) % this.personalities.length;

      // Get relevant past opinions for context
      let pastOpinionsContext = '';
      if (this.opinionDatabase) {
        try {
          const relevantOpinions = await this.opinionDatabase.findRelevantOpinions(
            perplexityResponse.content,
            { type: 'momentum_opinion', timeframe: 'recent', limit: 3 }
          );
          
          if (relevantOpinions.length > 0) {
            pastOpinionsContext = `

🧠 YOUR PAST MOMENTUM TAKES (for context and consistency):
${relevantOpinions.map(op => `- ${op.text}`).join('\n')}`;
            
            console.log(`🧠 [MOMENTUM] Found ${relevantOpinions.length} relevant past opinions for context`);
          }
        } catch (error) {
          console.error('❌ [MOMENTUM] Error retrieving past opinions:', error.message);
        }
      }

      // Compose the opinion with OpenAI
      const prompt = `You are ${personality.name}, a real crypto KOL with ${personality.style}.

⚡ MOMENTUM INSIGHTS:
${perplexityResponse.content}${pastOpinionsContext}

${personality.tone}

Generate a DeGen Oracle-style momentum opinion tweet that:
- Focuses on the most compelling acceleration story from the data
- Uses specific numbers and percentages
- Highlights what this means for traders
- Uses crypto slang naturally (not forced)
- Builds on your past takes naturally when relevant
- Shows consistency in your analysis approach
- NO hashtags, NO emojis, NO markdown (no ** or * formatting)
- Max 280 characters
- Sound like a real person sharing alpha, not a bot
- If there's a ticker, prefix it with $ (e.g., $SOL, $HYPE)
- Don't all-caps entire phrases—only actual tickers
- Plain text only—no bold, italics, or special formatting

Example styles:
- "hyperliquid generates $6.5m daily fees with zero token emissions. dydx bleeding tvl despite 50m token bribes annually. $hype token launches q1 2026."
- "x402 protocol processed 1.8m transactions last week. 10,000% growth in 4 weeks. coinbase controls 88% of all x402 agent payments."
- "jito controls 97.87% of solana's validator stake weight with 17m sol staked. firedancer integration in december brings 4-5x faster execution."

Momentum opinion:`;

      const opinion = await this.openaiService.generateCompletion(prompt, {
        maxTokens: 120,
        temperature: 0.8,
        model: 'gpt-4o-mini',
        enableWebSearch: false
      });

      // Clean up
      const cleanOpinion = opinion.trim()
        .replace(/#\w+/g, '') // Remove hashtags
        .replace(/\*\*/g, '') // Remove bold markdown
        .replace(/\*/g, '')   // Remove italics markdown
        .replace(/[🚀💰⚡🔥💎🌙📈📉👀🎯]/g, '') // Remove common emojis
        .replace(/[\u{1F300}-\u{1F9FF}]/gu, '') // Remove all emojis (Unicode range)
        .replace(/\s+/g, ' ')
        .trim();

      console.log(`✍️ [MOMENTUM] Generated opinion: "${cleanOpinion.substring(0, 80)}..."`);
      
      // Save to Opinion DB
      if (this.opinionDatabase) {
        try {
          await this.opinionDatabase.storeOpinion({
            type: 'momentum_opinion',
            text: cleanOpinion,
            marketContext: perplexityResponse.content,
            sentiment: 'neutral',
            tweetId: null,
            timestamp: new Date().toISOString()
          });
          console.log('💾 [OPINION DB] Saved momentum opinion to database');
        } catch (error) {
          console.error('❌ [OPINION DB] Failed to save momentum opinion:', error.message);
        }
      }
      
      return {
        format: 'momentum',
        tweets: [cleanOpinion],
        token: { symbol: 'MOMENTUM', name: 'Market Momentum' },
        article: {
          title: 'Market Momentum',
          content: perplexityResponse.content,
          source: 'Perplexity',
          timestamp: new Date().toISOString()
        }
      };

    } catch (error) {
      console.error('❌ [MOMENTUM] Error generating momentum opinion:', error.message);
      return null;
    }
  }

  /**
   * Generate crypto news joke using Perplexity
   */
  async generateNewsJoke() {
    try {
      console.log('🎭 [KOL CONTENT] Generating news joke with Perplexity...');

      // Use Perplexity to fetch latest crypto news
      if (!this.perplexityService || !this.perplexityService.isInitialized) {
        console.warn('⚠️ [KOL CONTENT] Perplexity service not initialized');
        return null;
      }

      // 🚀 ENHANCED: Fetch latest crypto news for more current jokes
      const newsJokeQueries = [
        'Latest crypto news last 2 hours, make a degen joke about current Bitcoin price or recent crypto event. Max 280 chars.',
        'Recent crypto developments today, create a funny degen take on current market situation. Max 280 chars.',
        'Latest Solana or crypto ecosystem news, make a humorous degen comment. Max 280 chars.',
        'Current crypto market movers, create a joke about trending tokens or recent events. Max 280 chars.'
      ];
      
      const randomJokeQuery = newsJokeQueries[Math.floor(Math.random() * newsJokeQueries.length)];
      console.log(`🎭 [NEWS JOKE] Using query: ${randomJokeQuery}`);
      
      const perplexityResponse = await this.perplexityService.searchWithReasoning(randomJokeQuery);

      if (!perplexityResponse || !perplexityResponse.content) {
        console.log('⚠️ [KOL CONTENT] No Perplexity response for news joke');
        return null;
      }

      // 🧠 NEW: Get relevant past opinions for context and consistency
      let pastOpinionsContext = '';
      if (this.opinionDatabase) {
        try {
          const relevantOpinions = await this.opinionDatabase.findRelevantOpinions(
            perplexityResponse.content,
            { type: 'newsjoke', timeframe: 'recent', limit: 2 }
          );
          
          if (relevantOpinions.length > 0) {
            pastOpinionsContext = `

🧠 YOUR PAST JOKES (for consistency):
${relevantOpinions.map(op => `- ${op.text}`).join('\n')}`;
            
            console.log(`🧠 [NEWS JOKE] Found ${relevantOpinions.length} relevant past jokes`);
          }
        } catch (error) {
          console.error('❌ [NEWS JOKE] Error retrieving past opinions:', error.message);
        }
      }

      // Clean up the joke - remove markdown, citations, hashtags
      let joke = perplexityResponse.content.trim()
        .replace(/\*\*/g, '') // Remove bold markdown
        .replace(/\*/g, '')   // Remove italics markdown
        .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1') // Remove markdown links but keep text
        .replace(/\[[^\]]+\]/g, '') // Remove citation brackets like [*cites Coindesk*]
        .replace(/#\w+/g, '') // Remove hashtags
        .replace(/^#+\s/gm, '') // Remove markdown headers
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim();

      // If empty after cleaning, Perplexity failed
      if (!joke || joke.length < 10) {
        console.log('⚠️ [KOL CONTENT] Perplexity returned empty/invalid joke after cleaning');
        return null;
      }

      console.log(`✅ [KOL CONTENT] Clean joke response: "${joke.substring(0, 100)}..."`);

      // If the response is too long, truncate to 280 chars
      if (joke.length > 280) {
        joke = joke.substring(0, 277) + '...';
      }

      console.log(`🎭 Generated news joke (${joke.length} chars): ${joke}`);
      return {
        format: 'newsjoke',
        tweets: [joke],
        token: { symbol: 'JOKE', name: 'Crypto News Joke' }
        // Don't include perplexityData - no citations in tweets
      };

    } catch (error) {
      console.error(`❌ Error generating news joke:`, error.message);
      return null;
    }
  }

  /**
   * Generate "normal" tweet - clean market sentiment without emojis/hashtags
   * Uses Perplexity to check Solana/crypto market mood and adapts tone
   */
  async generateNormalTweet() {
    try {
      console.log('💬 [KOL CONTENT] Generating normal tweet with market sentiment...');
      
      // Fetch current Solana & crypto market sentiment via Perplexity
      if (!this.perplexityService || !this.perplexityService.isInitialized) {
        console.warn('⚠️ [NORMAL] Perplexity service not initialized');
        return null;
      }

      // 🚀 ENHANCED: Use specific real-time queries for more current data
      const realTimeQueries = [
        'Bitcoin current price right now, latest Bitcoin news last 2 hours, Bitcoin price movement today',
        'Solana current price right now, latest Solana news last 2 hours, Solana ecosystem updates',
        'Crypto market movers right now, biggest gainers losers last 2 hours, major liquidations today',
        'Latest crypto news last 2 hours, trending crypto events today, major announcements'
      ];
      
      const randomQuery = realTimeQueries[Math.floor(Math.random() * realTimeQueries.length)];
      console.log(`🔍 [NORMAL] Using real-time query: ${randomQuery}`);
      
      const perplexityResponse = await this.perplexityService.searchWithReasoning(randomQuery);

      if (!perplexityResponse || !perplexityResponse.content) {
        console.log('⚠️ [NORMAL] No Perplexity response for market sentiment');
        return null;
      }

      console.log(`✅ [NORMAL] Market sentiment: ${perplexityResponse.content.substring(0, 100)}...`);

      // Randomly decide tweet length: 20% long, 40% medium, 40% short
      const lengthRandom = Math.random() * 100;
      let tweetLength, maxTokens;
      if (lengthRandom < 20) {
        tweetLength = 'long'; // Full thought (200-280 chars)
        maxTokens = 100;
      } else if (lengthRandom < 60) {
        tweetLength = 'medium'; // Two sentences (100-180 chars)
        maxTokens = 60;
      } else {
        tweetLength = 'short'; // Punchline (40-80 chars)
        maxTokens = 30;
      }

      console.log(`📏 [NORMAL] Selected length: ${tweetLength}`);

      // 🧠 NEW: Get relevant past opinions for market sentiment context
      let pastOpinionsContext = '';
      if (this.opinionDatabase) {
        try {
          const relevantOpinions = await this.opinionDatabase.findRelevantOpinions(
            perplexityResponse.content,
            { type: 'normal', timeframe: 'recent', limit: 2 }
          );
          
          if (relevantOpinions.length > 0) {
            pastOpinionsContext = `

🧠 YOUR PAST MARKET TAKES (for consistency):
${relevantOpinions.map(op => `- ${op.text}`).join('\n')}`;
            
            console.log(`🧠 [NORMAL] Found ${relevantOpinions.length} relevant past market opinions`);
          }
        } catch (error) {
          console.error('❌ [NORMAL] Error retrieving past opinions:', error.message);
        }
      }

      const normalTweetPrompt = `You're Degen Oracle - a cocky but smart crypto KOL. Generate ONE tweet based on current market sentiment.

CURRENT MARKET CONTEXT:
${perplexityResponse.content}${pastOpinionsContext}

DEGEN ORACLE PERSONALITY:
- Confident and slightly cocky (not arrogant)
- Uses mild swearing for emphasis (damn, shit, fuck, hell - tastefully)
- Calls out BS when you see it
- Respects builders, roasts moonboys
- Self-aware degen who knows the game
- Builds on your past takes naturally when relevant

TWEET LENGTH: ${tweetLength.toUpperCase()}

📏 LONG TWEETS (200-280 chars - Full thought):
SOUND HUMAN - Don't force openers every time:

WITH OPENER (50% of long tweets) - USE DIVERSE OPENERS, AVOID REPETITION:
- "When the market's getting nuked harder than my portfolio, you gotta ask: are we in Downtober or the end of days? Real degens know the game ain't over till the liquidity dries up."
- "Holy shit, exchanges going offline during every pump? Keep building something that works or NGMI."
- "WTF is this market even doing? One day we moon, next day we're exit liquidity. That's crypto, anon."
- "Honestly, this volatility is brutal but expected. Real degens know these dips are opportunities, not exits."
- "Lowkey, when Bitcoin's just chilling at $114K while ETH takes a hit, that's when you separate the diamond hands from paper hands."
- "NGL, this market's showing who's really built different. Builders stay winning while moonboys get rekt."
- "Bruh, if you thought this was gonna be easy money, think again. Real alpha comes from patience and conviction."
- "Okay hear me out: every major dump is another chapter in the story. Are you writing the comeback or the exit?"
- "Real talk: when CT is panicking, that's your signal. Smart money accumulates while weak hands fold."
- "The way I see it, volatility isn't your enemy—impatience is. Diamond hands win the long game."
- "Look, I get it. This market's wild. But real ones know these shakeouts separate winners from losers."
- "Seriously though, if you're still here after this dump, you're built different. Most already folded."
- "Tbh, these corrections are healthy. Overleveraged degens get liquidated, real holders accumulate."
- "Here's the thing: bull markets don't go up in a straight line. Every pullback is a gift if you're patient."
- "Y'all realize we're still early right? These pullbacks are for accumulating, not panicking."

WITHOUT OPENER (50% of long tweets):
- "This is just like the COVID Crash… Except we're not drastically printing money and handing out stimulus checks and loans to every person imaginable. Real degens know when the Fed's bluffing."
- "When the market's bleeding and CT is coping, that's when real accumulation happens. Diamond hands separate from paper hands. WAGMI if you're patient."
- "Liquidating means you took too much risk. Not sorry. The degens who survive are the ones who respect the leverage game and know when to back off."
- "Bitcoin's just chilling while alts flex. That's the sign of a healthy rotation, not a top."
- "Exchanges going offline during volatility? Tale as old as time. This is why we HODL."
- "Real degens don't panic during corrections. They double down on conviction plays."

📏 MEDIUM TWEETS (100-180 chars):
NATURAL MIX - Some with openers, some without - ROTATE OPENER VARIETY:

WITH OPENER (mix these up randomly):
- "Holy shit the FUD is real today. But real degens know this is accumulation szn."
- "Yikes, CT is coping hard. Exit liquidity or generational wealth? Your call, anon."
- "FR, if you're still buying memecoin calls from influencers, NGMI. Find the grinders on X."
- "Tbh, this dip's nothing new. If you've been in crypto longer than one cycle, you've seen worse."
- "Lowkey impressed by how HNT and HBAR are holding up. That's real strength, not pump manipulation."
- "NGL, when the market shakes out weak hands like this, it's actually bullish long-term."
- "Okay but real talk: Bitcoin's holding strong while alts bleed. That's your signal right there."
- "Bruh, if you're panicking now, you're not ready for the real volatility. This is crypto."
- "Seriously though, these corrections are where fortunes get made. Are you buying or folding?"
- "Honestly, I expected worse. The fact we're holding these levels shows real demand."
- "Look, every market has pullbacks. The ones who survive are the ones who don't panic sell."
- "Here's a hot take: if this dump scares you, maybe leverage wasn't your friend anyway."
- "Real talk: when everyone's bearish, that's historically when you want to be contrarian."
- "Y'all realize this is normal right? Bull markets don't moon 24/7, they test conviction."

WITHOUT OPENER:
- "Buy when there's blood in the streets, especially when it's mine and yours. WAGMI if you hold."
- "Don't buy memecoins from influencers. Buy into communities that grind on X. NFA."
- "Is this Uptober or Downtober?? Diamond hands always win. Paper hands getting rekt."
- "Liquidating means you took too much risk. Not sorry. Manage your leverage or get rekt."
- "Bitcoin's holding while alts rotate. That's healthy market behavior, not a crash."
- "Real builders keep building. Market conditions don't change the mission."
- "Every major pullback in history looked like the end. History tends to repeat."

📏 SHORT TWEETS (40-80 chars - Punchline):
MOSTLY NO OPENERS - Keep it clean:
- "WAGMI"
- "GM Bulls!"
- "Diamond hands only"
- "NGMI if you sold"
- "is the bull run still on?"
- "Buy the builders."
- "Believers only"
- "Buy the dip, anon"
- "Who is still bullish?"
- "Still early"
- "Accumulation szn"
- "Weak hands fold, diamond hands hold"

VARIATION REQUIREMENTS (CRITICAL):
- SOUND HUMAN - Not every tweet needs an opener
- Use openers ~30-40% of the time, rest should start naturally
- CRITICAL: Rotate openers randomly. Do NOT default to "Damn" - use: "Tbh", "Lowkey", "NGL", "Honestly", "Real talk", "Look", "Here's the thing", "Okay", "Bruh", "Seriously", "Yikes", "Y'all", "Btw", "Fr", "WTF", "Holy shit" (rarely), "Damn" (very rarely - only 5% of opener usage)
- Each opener should feel natural and different - never repeat the same opener style consecutively
- INTEGRATE crypto slang naturally: WAGMI, NGMI, diamond hands, paper hands, rekt, szn, anon, CT, FUD, based, DYOR, NFA
- VARY sentence structure completely each time
- Add mild swear words naturally when it fits (0-1 per tweet): damn, shit, fuck, hell, WTF
- Match the length requirement: ${tweetLength}
- NO offensive slurs or targeted attacks

CRITICAL RULES:
- NO emojis
- NO hashtags  
- NO quotation marks around the tweet
- Match the ${tweetLength} length guideline
- Match sentiment to CURRENT market context
- DO NOT mention research tools (Perplexity, Tavily, Moralis, etc)

Generate ONE ${tweetLength} tweet (just the text, no quotes):`;

      const normalTweet = await this.openaiService.generateCompletion(normalTweetPrompt, {
        maxTokens: maxTokens,
        temperature: 0.8,
        model: 'gpt-4o-mini', // 🚀 COST OPTIMIZATION: 40x cheaper
        enableWebSearch: false
      });

      // Clean the tweet - remove emojis, hashtags, quotes
      let cleanTweet = normalTweet.trim()
        .replace(/[\u{1F300}-\u{1F9FF}]/gu, '') // Remove emojis
        .replace(/[\u{2600}-\u{26FF}]/gu, '') // Remove misc symbols
        .replace(/[\u{2700}-\u{27BF}]/gu, '') // Remove dingbats
        .replace(/#\w+/g, '') // Remove hashtags
        .replace(/^["']|["']$/g, '') // Remove leading/trailing quotes
        .replace(/^"|"$/g, '') // Remove smart quotes
        .replace(/\s+/g, ' ') // Normalize spaces
        .trim();

      if (!cleanTweet || cleanTweet.length < 10) {
        console.log('⚠️ [NORMAL] Generated tweet too short after cleaning');
        return null;
      }

      // Ensure max length
      if (cleanTweet.length > 280) {
        cleanTweet = cleanTweet.substring(0, 280);
      }

      console.log(`✅ Generated normal tweet (${cleanTweet.length} chars): ${cleanTweet}`);
      
      // Store opinion in database for future reference
      await this.opinionDatabase.storeOpinion({
        text: cleanTweet,
        marketContext: perplexityResponse.content.substring(0, 500),
        type: 'normal',
        tweetId: null // Will be updated after posting
      });
      
      return {
        format: 'normal',
        tweets: [cleanTweet],
        token: { symbol: 'SENTIMENT', name: 'Market Sentiment' },
        sentiment: perplexityResponse.content.substring(0, 200)
      };

    } catch (error) {
      console.error(`❌ Error generating normal tweet:`, error.message);
      return null;
    }
  }

  /**
   * Generate daily KOL content: Pick random token from top 5, random format
   */
  async generateDailyContent() {
    try {
      console.log('🎤 Generating daily KOL content...');

      // Decide content format randomly (prioritize market sentiment takes)
      const contentFormats = [
        'momentum',         // 20% - Momentum/macro acceleration insights
        'crypto-tech-news', // 20% - Crypto tech insights (protocols, DeFi, utility)
        'normal',           // 15% - Market sentiment tweet
        'news',             // 15% - Crypto news recap
        'single',           // 12% - Single tweet (token analysis)
        'deep',             // 10% - Deep-dive thread (3 tweets)
        'newsjoke',         // 5%  - News joke (Perplexity)
        'meme'              // 3%  - Meme/joke tweet
      ];

      const weights = [20, 20, 15, 15, 12, 10, 5, 3];
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

      // Select token based on format
      let token;
      const tokenRequiredFormats = ['single', 'deep', 'meme'];
      if (selectedFormat === 'deep') {
        token = await this.selectTokenForDeepThread();
      } else if (tokenRequiredFormats.includes(selectedFormat)) {
        token = await this.selectRandomTrendingToken();
      }

      if (!token && tokenRequiredFormats.includes(selectedFormat)) {
        console.log('⚠️ No tokens available for content');
        return null;
      }

      // Generate content
      let content, tokenInfo = token, article = null, perplexityData = null;
      
      if (selectedFormat === 'news') {
        // For news, generate directly and get full content object
        const newsContent = await this.generateCryptoNews();
        if (!newsContent) {
          console.log('❌ Failed to generate news content');
          return null;
        }
        content = newsContent.tweets;
        tokenInfo = newsContent.token;
        article = newsContent.article;
      } else if (selectedFormat === 'momentum') {
        const momentumContent = await this.generateMomentumThread();
        if (!momentumContent) {
          console.log('❌ Failed to generate momentum thread');
          return null;
        }
        content = momentumContent.tweets;
        tokenInfo = momentumContent.token;
        perplexityData = { metrics: momentumContent.metrics, sources: momentumContent.sources };
        article = { title: `${momentumContent.token?.name || 'Momentum'} Acceleration`, content: (momentumContent.facts || []).join(' | '), source: 'Perplexity', timestamp: new Date().toISOString() };
      } else if (selectedFormat === 'newsjoke') {
        // For news joke
        const jokeContent = await this.generateNewsJoke();
        if (!jokeContent) {
          console.log('❌ Failed to generate news joke');
          return null;
        }
        content = jokeContent.tweets;
        tokenInfo = jokeContent.token;
      } else if (selectedFormat === 'normal') {
        // For normal market sentiment tweet
        const normalContent = await this.generateNormalTweet();
        if (!normalContent) {
          console.log('❌ Failed to generate normal tweet');
          return null;
        }
        content = normalContent.tweets;
        tokenInfo = normalContent.token;
        perplexityData = { sentiment: normalContent.sentiment };
      } else if (selectedFormat === 'crypto-tech-news') {
        // For crypto tech insights
        const techContent = await this.generateCryptoTechNews();
        if (!techContent) {
          console.log('❌ Failed to generate crypto tech insights');
          return null;
        }
        content = techContent.tweets;
        tokenInfo = techContent.token;
        article = techContent.article;
      } else {
        // For other formats, use the existing method
        content = await this.generateContentByFormat(token, selectedFormat);
        if (!content) {
          console.log('❌ Failed to generate content');
          return null;
        }
      }

      console.log('✅ Daily KOL content generated successfully');
      
      return {
        token: tokenInfo,
        tweets: content,
        format: selectedFormat,
        timestamp: new Date().toISOString(),
        ...(article && { article }),
        ...(perplexityData && { perplexityData })
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

      // Fetch Twitter sentiment via Tavily
      console.log(`🔍 [MEME] Fetching Tavily sentiment for $${token.symbol}...`);
      let tavilySentiment = '';
      try {
        tavilySentiment = await this.openaiService.searchTavily(`crypto twitter memes and jokes about $${token.symbol}`);
        console.log(`✅ [MEME] Tavily sentiment: ${tavilySentiment.substring(0, 80)}...`);
      } catch (err) {
        console.warn(`⚠️ [MEME] Tavily sentiment search failed:`, err.message);
      }

      // 🧠 NEW: Get relevant past opinions for context and consistency
      let pastOpinionsContext = '';
      if (this.opinionDatabase) {
        try {
          const relevantOpinions = await this.opinionDatabase.findRelevantOpinions(
            `${token.symbol} crypto memes jokes`,
            { type: 'meme', timeframe: 'recent', limit: 2 }
          );
          
          if (relevantOpinions.length > 0) {
            pastOpinionsContext = `

🧠 YOUR PAST MEMES ON $${token.symbol} (for consistency):
${relevantOpinions.map(op => `- ${op.text}`).join('\n')}`;
            
            console.log(`🧠 [MEME] Found ${relevantOpinions.length} relevant past memes for $${token.symbol}`);
          }
        } catch (error) {
          console.error('❌ [MEME] Error retrieving past opinions:', error.message);
        }
      }

      const memePrompt = `You're a crypto KOL with a great sense of humor. Generate a funny tweet about $${token.symbol}.

TOKEN CONTEXT:
- Price: ${priceChange > 0 ? '+' : ''}${priceChange.toFixed(1)}% (24h)
- MCap: $${(mcap / 1_000_000).toFixed(2)}M
- Volume/MCap: ${volumeToMcap}%

🔍 TWITTER SENTIMENT & COMMUNITY VIBES:
${tavilySentiment || 'General crypto Twitter vibes'}${pastOpinionsContext}

CRITICAL: THE JOKE MUST BE BASED ON ACTUAL DATA ABOVE:
- Use the REAL numbers (price change, mcap, volume/mcap) in your joke
- If volume/mcap is low (<5%), make the joke about DEAD volume
- If dumping hard (<-20%), joke about exit liquidity or CTO
- If pumping (+50%+), joke about casino vibes
- If sideways/consolidation, joke about accumulation phase or TA
- The humor comes from DATA-DRIVEN observations, not random analogies
- Build on your past takes naturally when relevant for consistency
- Show consistency or acknowledge if your view changed

JOKE EXAMPLES BASED ON DATA:
- Low vol (2%): "$TOKEN volume drier than a whale's wallet. 2% vol/mcap. Moon when?"
- Dumping (-30%): "$TOKEN down 30% in 24h? Someone needs to CTO this. Exit liquidity szn fr"
- Pumping (+100%): "$TOKEN 2x in a day. Ser this is a casino. Still not selling tho"
- Sideways (0%): "$TOKEN consolidation at $0.00005. Bullish wedge on the 1min chart incoming"

CRITICAL RULES:
- Stay 100% crypto-focused, NO personal/life analogies (no "Monday morning", "my dog", etc.)
- Use crypto slang: degens, diamond hands, paper hands, rug, moon, dump, pump, CTO, ape, ser, gm, LFG
- Reference crypto concepts: charts, volume, liquidity, whales, exit liquidity, dead cat bounce, accumulation, distribution
- Keep it authentic to crypto Twitter culture
- Self-aware and ironic tone
- Short and punchy
- NO hashtags
- Max 280 characters

Meme tweet:`;

      const memeTweet = await this.openaiService.generateCompletion(memePrompt, {
        maxTokens: 100,
        temperature: 0.9,
        model: 'gpt-4o-mini', // 🚀 COST OPTIMIZATION: 40x cheaper
        enableWebSearch: false // Tavily already fetched
      });

      const cleanMeme = memeTweet.trim()
        .replace(/#\w+/g, '') // Remove hashtags
        .replace(/^["']|["']$/g, '') // Remove leading/trailing quotes
        .replace(/^"|"$/g, '') // Remove smart quotes
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

      // Fetch current market sentiment via Tavily
      console.log(`🔍 [MEME] Fetching Tavily market sentiment...`);
      let marketSentiment = '';
      try {
        marketSentiment = await this.openaiService.searchTavily('crypto market sentiment today, Bitcoin Ethereum price, trending on crypto twitter');
        console.log(`✅ [MEME] Market sentiment: ${marketSentiment.substring(0, 80)}...`);
      } catch (err) {
        console.warn(`⚠️ [MEME] Market sentiment search failed:`, err.message);
      }

      // 🧠 NEW: Get relevant past opinions for context and consistency
      let pastOpinionsContext = '';
      if (this.opinionDatabase) {
        try {
          const relevantOpinions = await this.opinionDatabase.findRelevantOpinions(
            marketSentiment || 'crypto market memes jokes',
            { type: 'meme', timeframe: 'recent', limit: 2 }
          );
          
          if (relevantOpinions.length > 0) {
            pastOpinionsContext = `

🧠 YOUR PAST MARKET MEMES (for consistency):
${relevantOpinions.map(op => `- ${op.text}`).join('\n')}`;
            
            console.log(`🧠 [GENERAL MEME] Found ${relevantOpinions.length} relevant past market memes`);
          }
        } catch (error) {
          console.error('❌ [GENERAL MEME] Error retrieving past opinions:', error.message);
        }
      }

      const generalMemePrompt = `You're a crypto KOL with great humor. Generate a funny tweet about the current crypto market.

🔍 CURRENT MARKET CONTEXT:
${marketSentiment || 'General crypto market vibes'}${pastOpinionsContext}

CLASSIC CRYPTO JOKES (pick what fits based on current market):
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
- Build on your past jokes naturally when relevant for consistency
- Show consistency or acknowledge if your view changed

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
        temperature: 0.95,
        model: 'gpt-4o-mini', // 🚀 COST OPTIMIZATION: 40x cheaper
        enableWebSearch: false // Tavily already fetched
      });

      const cleanMeme = memeTweet.trim()
        .replace(/#\w+/g, '') // Remove hashtags
        .replace(/^["']|["']$/g, '') // Remove leading/trailing quotes
        .replace(/^"|"$/g, '') // Remove smart quotes
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
        
        let result;
        if (i === 0) {
          // First tweet: post as new tweet
          result = await oauthXService.postTweet(dgnOracleUserId, tweet);
        } else {
          // Subsequent tweets: post as reply to previous
          result = await oauthXService.postReply(
            dgnOracleUserId,  // @dgnoracle user ID
            tweet,            // tweet text
            previousTweetId   // replyToId
          );
        }
        
        const tweetId = result?.id || result;

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
   * Update configuration from panel settings
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    console.log('📊 [KOL CONTENT] Configuration updated:', this.config);
  }

  /**
   * Reset daily post count if new day
   */
  resetDailyCountIfNeeded() {
    const today = new Date().toDateString();
    if (this.lastResetDate !== today) {
      this.dailyPostCount = 0;
      this.lastResetDate = today;
      console.log('📅 [KOL CONTENT] New day - reset post count');
    }
  }

  /**
   * Check if it's time to post daily content based on configuration
   */
  shouldPostContent() {
    // Reset daily count if new day
    this.resetDailyCountIfNeeded();

    // Check if we've hit daily limit
    if (this.dailyPostCount >= this.config.maxPostsPerDay) {
      console.log(`⏰ [KOL CONTENT] Daily limit reached (${this.dailyPostCount}/${this.config.maxPostsPerDay})`);
      return false;
    }

    // Check if we need minimum posts for today
    if (this.dailyPostCount < this.config.minPostsPerDay) {
      console.log(`📈 [KOL CONTENT] Need minimum posts (${this.dailyPostCount}/${this.config.minPostsPerDay})`);
      return true;
    }

    // Check if we're within active hours
    const now = new Date();
    const currentHour = now.getUTCHours();
    if (this.config.activeHours && (currentHour < this.config.activeHours.start || currentHour >= this.config.activeHours.end)) {
      console.log(`⏰ [KOL CONTENT] Outside active hours (${currentHour}h, active: ${this.config.activeHours.start}-${this.config.activeHours.end}h UTC)`);
      return false;
    }

    // If we have no last tweet time, post
    if (!this.lastTweetTime) {
      return true;
    }

    // Check minimum hours between posts
    const timeSinceLastTweet = Date.now() - this.lastTweetTime;
    const minIntervalMs = this.config.minHoursBetween * 60 * 60 * 1000;
    
    if (timeSinceLastTweet < minIntervalMs) {
      const hoursRemaining = ((minIntervalMs - timeSinceLastTweet) / (60 * 60 * 1000)).toFixed(1);
      console.log(`⏰ [KOL CONTENT] Min interval not met (${hoursRemaining}h remaining)`);
      return false;
    }

    // Random mode: 50% chance to post if conditions met
    if (this.config.mode === 'random') {
      const shouldPost = Math.random() < 0.5;
      console.log(`🎲 [KOL CONTENT] Random check: ${shouldPost ? 'POST' : 'WAIT'}`);
      return shouldPost;
    }

    return true;
  }

  /**
   * Force generate content (bypasses all configuration controls)
   * Used by admin "Post Now" button to override settings
   * @param {string} contentType - 'random', 'single', 'deep', 'meme', or 'news'
   */
  async forceGenerateContent(contentType = 'random') {
    try {
      console.log(`🎯 [KOL CONTENT] FORCE GENERATING content (bypassing all config controls) - Type: ${contentType}...`);

      let selectedFormat;

      if (contentType === 'random') {
        // Decide content format randomly (prioritize market sentiment takes)
        const contentFormats = [
          'momentum',         // 20% - Momentum/macro acceleration insights
          'crypto-tech-news', // 20% - Crypto tech insights (protocols, DeFi, utility)
          'normal',           // 15% - Market sentiment tweet
          'news',             // 15% - Crypto news recap
          'single',           // 12% - Single tweet (token analysis)
          'deep',             // 10% - Deep-dive thread (3 tweets)
          'newsjoke',         // 5%  - News joke (Perplexity)
          'meme'              // 3%  - Meme/joke tweet
        ];

        const weights = [20, 20, 15, 15, 12, 10, 5, 3];
        const random = Math.random() * 100;
        let cumulative = 0;
        selectedFormat = 'single';

        for (let i = 0; i < weights.length; i++) {
          cumulative += weights[i];
          if (random <= cumulative) {
            selectedFormat = contentFormats[i];
            break;
          }
        }

        console.log(`📝 [KOL CONTENT] FORCE Random selected format: ${selectedFormat}`);
      } else {
        // Use the specified content type
        selectedFormat = contentType;
        
        // Map crypto-tech-news to crypto-tech-news (use dedicated method)
        if (selectedFormat === 'crypto-tech-news') {
          console.log(`📝 [KOL CONTENT] FORCE Using crypto-tech-news format`);
        }
        
        console.log(`📝 [KOL CONTENT] FORCE Using specified format: ${selectedFormat}`);
      }

      // Select token based on format
      let token;
      const tokenRequiredFormats = ['single', 'deep', 'meme'];
      if (selectedFormat === 'deep') {
        // Deep threads use top 10 with 48hr cooldown
        token = await this.selectTokenForDeepThread();
      } else if (tokenRequiredFormats.includes(selectedFormat)) {
        // Other token-based formats use top 5
        token = await this.selectRandomTrendingToken();
      }

      if (!token && tokenRequiredFormats.includes(selectedFormat)) {
        console.log('⚠️ [KOL CONTENT] No tokens available for content');
        return null;
      }

      // Generate content directly without configuration checks
      let content, tokenInfo = token, article = null, perplexityData = null;
      
      if (selectedFormat === 'news') {
        // For news, generate directly and get full content object
        const newsContent = await this.generateCryptoNews();
        if (!newsContent) {
          console.log('❌ [KOL CONTENT] Failed to generate news content');
          return null;
        }
        content = newsContent.tweets;
        tokenInfo = newsContent.token;
        article = newsContent.article;
      } else if (selectedFormat === 'momentum') {
        const momentumContent = await this.generateMomentumThread();
        if (!momentumContent) {
          console.log('❌ [KOL CONTENT] Failed to generate momentum content');
          return null;
        }
        content = momentumContent.tweets;
        tokenInfo = momentumContent.token;
        article = { title: `${momentumContent.token?.name || 'Momentum'} Acceleration`, content: (momentumContent.facts || []).join(' | '), source: 'Perplexity', timestamp: new Date().toISOString() };
        perplexityData = { metrics: momentumContent.metrics, sources: momentumContent.sources };
      } else if (selectedFormat === 'newsjoke') {
        // For news joke, use Perplexity directly
        const jokeContent = await this.generateNewsJoke();
        if (!jokeContent) {
          console.log('❌ [KOL CONTENT] Failed to generate news joke');
          return null;
        }
        content = jokeContent.tweets;
        tokenInfo = jokeContent.token;
        perplexityData = jokeContent.perplexityData;
      } else if (selectedFormat === 'normal') {
        // For normal tweet, use market sentiment
        const normalContent = await this.generateNormalTweet();
        if (!normalContent) {
          console.log('❌ [KOL CONTENT] Failed to generate normal tweet');
          return null;
        }
        content = normalContent.tweets;
        tokenInfo = normalContent.token;
        perplexityData = { sentiment: normalContent.sentiment };
      } else if (selectedFormat === 'crypto-tech-news') {
        // For crypto tech insights, use dedicated method
        const techContent = await this.generateCryptoTechNews();
        if (!techContent) {
          console.log('❌ [KOL CONTENT] Failed to generate crypto tech insights');
          return null;
        }
        content = techContent.tweets;
        tokenInfo = techContent.token;
        article = techContent.article;
      } else {
        // For other formats, use the existing method
        content = await this.generateContentByFormat(token, selectedFormat);
        if (!content) {
          console.log('❌ [KOL CONTENT] Failed to generate content');
          return null;
        }
      }

      console.log('✅ [KOL CONTENT] FORCE content generated successfully');
      
      return {
        token: tokenInfo,
        tweets: content,
        format: selectedFormat,
        timestamp: new Date().toISOString(),
        ...(article && { article }),
        ...(perplexityData && { perplexityData })
      };

    } catch (error) {
      console.error('❌ [KOL CONTENT] Error force generating content:', error.message);
      return null;
    }
  }

  /**
   * Main routine: Generate and post daily KOL content
   */
  async runDailyContentCycle(oauthXService) {
    try {
      // ⛔ DISABLED: Daily tweet service disabled (401 auth errors + reduces OpenAI costs)
      console.log(`⛔ [KOL CONTENT] Daily tweet service DISABLED - no tweets will be posted`);
      return;
      
      if (!this.shouldPostContent()) {
        console.log(`⏰ [KOL CONTENT] Skipping cycle (posts today: ${this.dailyPostCount}/${this.config.maxPostsPerDay})`);
        return;
      }

      console.log(`🎤 [KOL CONTENT] Starting content cycle (posts today: ${this.dailyPostCount}/${this.config.maxPostsPerDay})...`);

      // Generate content for 1 random token from top 5
      const content = await this.generateDailyContent();

      if (!content) {
        console.log('❌ [KOL CONTENT] Failed to generate content, skipping this cycle');
        return;
      }

      // Post the content
      console.log(`\n📤 [KOL CONTENT] Posting: $${content.token.symbol} (${content.format})`);
      await this.postThread(content.tweets, oauthXService);

      // Update tracking
      this.lastTweetTime = Date.now();
      this.dailyPostCount++;
      
      console.log('✅ [KOL CONTENT] Content cycle completed');
      console.log(`📊 [KOL CONTENT] Posted: ${content.format} (${content.tweets.length} tweet${content.tweets.length > 1 ? 's' : ''})`);
      console.log(`📈 [KOL CONTENT] Daily count: ${this.dailyPostCount}/${this.config.maxPostsPerDay}`);

    } catch (error) {
      console.error('❌ [KOL CONTENT] Error in content cycle:', error.message);
    }
  }

  /**
   * Helper method: Generate news from CoinDesk (fallback)
   */
  async generateNewsFromCoinDesk(article) {
    try {
      // Select personality
      const personality = this.personalities[this.currentPersonalityIndex];
      this.currentPersonalityIndex = (this.currentPersonalityIndex + 1) % this.personalities.length;

      const prompt = `You are ${personality.name}, a real crypto KOL with ${personality.style}.

📰 CRYPTO NEWS:
Title: "${article.title}"
Description: "${article.description}"
Source: ${article.source}

${personality.tone}

Generate a DeGen Oracle-style news recap that:
- DO NOT mention CoinDesk or where the news came from
- ONLY quote/mention the original source (${article.source}) if it's valuable, credible, or adds context
- If source isn't notable, just share the news naturally without attribution
- Summarizes the key points in crypto-native language
- Adds your unique perspective/analysis
- Uses crypto slang naturally (not forced)
- Highlights what this means for degens
- NO hashtags
- Max 280 characters
- Sound like a real person sharing alpha, not a bot

News recap:`;

      const recap = await this.openaiService.generateCompletion(prompt, {
        maxTokens: 120,
        temperature: 0.8,
        model: 'gpt-4o-mini', // 🚀 COST OPTIMIZATION: 40x cheaper
        presencePenalty: 0.3
      });

      if (!recap || !recap.trim()) {
        console.log('⚠️ [KOL CONTENT] Failed to generate news recap from CoinDesk');
        return null;
      }

      console.log(`✅ [KOL CONTENT] Generated news recap (CoinDesk fallback): ${recap.substring(0, 80)}...`);
      
      // Return in the same format as the main generateCryptoNews method
      return {
        format: 'news',
        tweets: [recap.trim()],
        token: { symbol: 'NEWS', name: 'Crypto News' },
        article: {
          title: article.title,
          content: article.description,
          source: article.source,
          timestamp: new Date().toISOString()
        }
      };

    } catch (error) {
      console.error('❌ [KOL CONTENT] Error generating news from CoinDesk:', error.message);
      return null;
    }
  }
}

export default KOLContentService;

