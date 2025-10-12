import fetch from 'node-fetch';
import OpenAIService from './openaiService.js';
import CoinDeskService from './services/CoinDeskService.js';
import PerplexitySonarService from './services/PerplexitySonarService.js';

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
      let volume24h = token.volume24h || 0;
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

      const prompt = `You are ${personality.name}, a real crypto KOL with ${personality.style}.

${dataContext}

🔍 TAVILY WEB SEARCH RESULTS:
${tavilyResults || 'No recent news found'}

CONTENT TYPE: ${contentType === 'single' ? 'Single tweet (280 chars)' : 'Thread starter tweet (280 chars)'}

Generate a ${contentType === 'single' ? 'RICH, FACT-PACKED tweet' : 'HOOK thread starter'} that:
- BLEND our analytics WITH Tavily's latest news/catalysts
- ${personality.tone}
- Highlights the most interesting/surprising finding (data or news)
- If Tavily mentions partnerships, listings, whale activity: WEAVE them in naturally
- If pumping: explain WHY using both metrics and news
- If good fundamentals but no pump yet: explain the opportunity
- Use crypto slang naturally (not forced)
- NO hashtags
- Include $${token.symbol} ticker
- Max 280 characters
- Sound like a real person sharing alpha, not a bot

${contentType === 'thread' ? 'START with "🧵 1/" and end with "↓" to indicate it\'s a thread. Example: "🧵 1/ Breaking down how I spot early KOL plays step by step ↓"' : ''}

Tweet:`;

      const content = await this.openaiService.generateCompletion(prompt, {
        maxTokens: 100,
        temperature: 0.8,
        model: 'gpt-4o', // Proven reliable model
        enableWebSearch: false // Tavily already fetched
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
${tavilyResults || 'No recent news found'}

START with "2/" to continue the thread.
Present these numbers + any news in a compelling way that tells a story.
If Tavily has specific catalysts/news, WEAVE them in naturally.
What do these metrics + news reveal? What's the narrative?
Max 280 characters. Crypto slang. No hashtags.

Example format: "2/ $MONKEY in 60s: mcap $0.21M, vol/mcap 13.6%, whale flow -5, retail flow +5. No hopium, just numbers"

Tweet 2:`;

      const tweet2 = await this.openaiService.generateCompletion(tweet2Prompt, {
        maxTokens: 100,
        temperature: 0.7,
        model: 'gpt-4o'
      });

      // Tweet 3: Data-driven verdict/recommendation
      const tweet3Prompt = `Write tweet 3 of a crypto thread about $${token.symbol}.

Previous tweets covered the hook and enhanced data.

📊 DATA-DRIVEN VERDICT:
Based on the REAL metrics we just analyzed:
- Volume/MCap ratio: ${volumeToMcap}%
- Buy pressure: ${buyPct}%
- Holder momentum: ${holders > 0 ? 'Active' : 'Unknown'}${whaleContext ? `, whale flow analysis available` : ''}
${tavilyResults ? `- Recent news/catalysts: ${tavilyResults.substring(0, 100)}...` : ''}

Give your VERDICT based on ACTUAL DATA:
- Is this a call? Wait and watch? Or pass?
- What's the risk level based on real metrics?
- What SPECIFIC data points should degens watch?

START with "3/" to continue the thread.
Be decisive. Take a stance based on DATA, not speculation.
NO generic advice like "watch for dev updates" if no dev exists.
Max 280 characters. Crypto slang. No hashtags.

Example format: "3/ Data says: vol/mcap ${volumeToMcap}% is ${parseFloat(volumeToMcap) > 20 ? 'strong' : 'weak'}, buy pressure ${buyPct}% ${parseFloat(buyPct) > 60 ? 'bullish' : 'concerning'}. ${parseFloat(volumeToMcap) > 20 && parseFloat(buyPct) > 60 ? 'Worth watching.' : 'Wait for better setup.'}"

Tweet 3:`;

      const tweet3 = await this.openaiService.generateCompletion(tweet3Prompt, {
        maxTokens: 100,
        temperature: 0.8,
        model: 'gpt-4o'
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
   * Generate crypto news recap from CoinDesk
   */
  async generateCryptoNews() {
    try {
      console.log('📰 [KOL CONTENT] Generating crypto news recap...');

      // Get a random article from CoinDesk
      const article = await this.coinDeskService.getRandomArticle();
      
      if (!article) {
        console.log('⚠️ [KOL CONTENT] No news articles available');
        return null;
      }

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
- ONLY quote/mention the original source (${article.source}) if it's valuable, credible, or adds context (e.g., "Bloomberg reports...", "SEC just dropped...")
- If source isn't notable, just share the news naturally without attribution
- Summarizes the key points in crypto-native language
- Adds your unique perspective/analysis
- Uses crypto slang naturally (not forced)
- Highlights what this means for degens
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
- Just start with the news directly: "SEC just approved..."
- "Breaking: [news]..."
- "Alpha: [news]..."

Example (with source): "SEC just approved spot ETH ETFs—institutions loading up. This means more normie money flowing in. Bullish for alts too. Stack before the pump 🔥"

Example (no source): "AI trading bots are going wild rn—your 24/7 alpha hunters. More uptime, less FOMO, less rekt. For us apes, this is free leverage. Stack sats, sleep easy. GM! 🔥"

Example (GM opening): "GM anons, whale wallets accumulating again—$420M moved off exchanges this week. Smart money positioning for the next leg up. Follow the whales, not the hype 👀"

News recap:`;

      const recap = await this.openaiService.generateCompletion(prompt, {
        maxTokens: 120,
        temperature: 0.8,
        model: 'gpt-4o',
        enableWebSearch: false
      });

      // Clean up
      const cleanRecap = recap.trim()
        .replace(/#\w+/g, '') // Remove hashtags
        .replace(/\s+/g, ' ')
        .trim();

      console.log(`✍️ Generated news recap: "${article.title}" (${personality.name})`);
      return {
        format: 'news',
        tweets: [cleanRecap],
        token: { symbol: 'NEWS', name: 'Crypto News' },
        article: article
      };

    } catch (error) {
      console.error(`❌ Error generating crypto news:`, error.message);
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

      // Fetch today's crypto news facts from Perplexity (use reasoning for creativity)
      const perplexityResponse = await this.perplexityService.searchWithReasoning(
        'Tell me ONE SHORT crypto joke about ONE topic from today\'s news. Pick one interesting crypto event and make a degen joke about it. Max 280 characters. No markdown, no citations in text, just the joke!'
      );

      if (!perplexityResponse || !perplexityResponse.content) {
        console.log('⚠️ [KOL CONTENT] No Perplexity response for news joke');
        return null;
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

      const perplexityResponse = await this.perplexityService.searchWithReasoning(
        'What is happening in crypto and Solana markets today? Bitcoin price, Solana ecosystem, major liquidations, trending events. Brief summary.'
      );

      if (!perplexityResponse || !perplexityResponse.content) {
        console.log('⚠️ [NORMAL] No Perplexity response for market sentiment');
        return null;
      }

      console.log(`✅ [NORMAL] Market sentiment: ${perplexityResponse.content.substring(0, 100)}...`);

      const normalTweetPrompt = `You're Degen Oracle - a cocky but smart crypto KOL. Generate ONE tweet based on current market sentiment.

CURRENT MARKET (from Perplexity):
${perplexityResponse.content}

DEGEN ORACLE PERSONALITY:
- Confident and slightly cocky (not arrogant)
- Uses mild swearing for emphasis (damn, shit, fuck - but tastefully)
- Calls out BS when you see it
- Respects builders, roasts moonboys
- Self-aware degen who knows the game

TWEET EXAMPLES (match the vibe to current sentiment):

🟢 Bullish/Uptober vibes:
- Believe in something
- GM Bulls!
- Who is ready for Uptober?!!!
- Who is still bullish?
- Buy the builders.
- Believers only

🔴 Bearish/Downtober/Liquidation vibes:
- Buy the dip!
- Buy when there's blood in the streets, especially when it's mine and yours.
- Is this Uptober or Downtober??
- Liquidating means you took too much risk. Not sorry
- keep building a working exchange that doesn't go offline
- is the bull run still on?
- This is just like the COVID Crash… Except we're not drastically printing money and handing out stimulus checks and loans to every person imaginable.

⚪ Sideways/Crabbing/Builder mode:
- Heres the part of the cycle where degens come together and send some shit to billions.
- Don't buy memecoins from influencers. Buy into communities that grind on X. Understand this.

TONE GUIDELINES:
- Add mild swear words naturally (1 per tweet max): damn, shit, fuck, hell
- Be cocky when market proves you right
- Be real/cynical when market is BS
- NO offensive slurs or targeted attacks
- Keep it fun and relatable

CRITICAL RULES:
- NO emojis
- NO hashtags  
- NO quotation marks around the tweet
- Max 280 characters
- Match sentiment to CURRENT market (use Perplexity data)
- Add edge and personality (mild swearing OK)

Generate ONE tweet (just the text, no quotes):`;

      const normalTweet = await this.openaiService.generateCompletion(normalTweetPrompt, {
        maxTokens: 100,
        temperature: 0.8,
        model: 'gpt-4o',
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

      // Decide content format randomly (more realistic distribution)
      const contentFormats = [
        'single',       // 25% - Single tweet (token analysis)
        'deep',         // 20% - Deep-dive thread (3 tweets)
        'meme',         // 20% - Meme/joke tweet
        'news',         // 15% - Crypto news recap
        'normal'        // 20% - Market sentiment tweet (no emojis, clean)
      ];

      const weights = [25, 20, 20, 15, 20];
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
      if (selectedFormat === 'deep') {
        // Deep threads use top 10 with 48hr cooldown
        token = await this.selectTokenForDeepThread();
      } else if (selectedFormat !== 'news' && selectedFormat !== 'newsjoke' && selectedFormat !== 'normal') {
        // Other token-based formats use top 5
        token = await this.selectRandomTrendingToken();
      }

      if (!token && selectedFormat !== 'news' && selectedFormat !== 'newsjoke' && selectedFormat !== 'normal') {
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

      const memePrompt = `You're a crypto KOL with a great sense of humor. Generate a funny tweet about $${token.symbol}.

TOKEN CONTEXT:
- Price: ${priceChange > 0 ? '+' : ''}${priceChange.toFixed(1)}% (24h)
- MCap: $${(mcap / 1_000_000).toFixed(2)}M
- Volume/MCap: ${volumeToMcap}%

🔍 TWITTER SENTIMENT (from Tavily):
${tavilySentiment || 'No specific memes found'}

HUMOR STYLES (pick one that fits):
- If dumping: "someone needs to CTO [token]" or "exit liquidity szn" jokes
- If pumping hard: "ser this is a casino" or "10x in 3 days is normal here" humor
- If sideways: "consolidation = accumulation" or "bullish wedge on the 1min chart" jokes
- Low volume: "volume lower than my self-esteem" type jokes
- If memecoin: Self-aware degen humor about gambling
- If Tavily has specific Twitter jokes/memes: ADAPT and riff on those

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
        temperature: 0.9,
        model: 'gpt-4o',
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

      const generalMemePrompt = `You're a crypto KOL with great humor. Generate a funny tweet about the current crypto market.

🔍 CURRENT MARKET (from Tavily):
${marketSentiment || 'General crypto market vibes'}

CLASSIC CRYPTO JOKES (pick what fits based on Tavily sentiment):
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
- Timely and relevant to TODAY's market (use Tavily data)
- Relatable to crypto degens
- Self-aware and ironic
- NO specific token mentions (general market vibes only)
- NO hashtags
- Max 280 characters

Market meme:`;

      const memeTweet = await this.openaiService.generateCompletion(generalMemePrompt, {
        maxTokens: 100,
        temperature: 0.95,
        model: 'gpt-4o',
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
        // Decide content format randomly (more realistic distribution)
        const contentFormats = [
          'single',       // 25% - Single tweet (token analysis)
          'deep',         // 20% - Deep-dive thread (3 tweets)
          'meme',         // 20% - Meme/joke tweet
          'news',         // 15% - Crypto news recap
          'normal'        // 20% - Market sentiment tweet (no emojis, clean)
        ];

        const weights = [25, 20, 20, 15, 20];
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
        console.log(`📝 [KOL CONTENT] FORCE Using specified format: ${selectedFormat}`);
      }

      // Select token based on format
      let token;
      if (selectedFormat === 'deep') {
        // Deep threads use top 10 with 48hr cooldown
        token = await this.selectTokenForDeepThread();
      } else if (selectedFormat !== 'news' && selectedFormat !== 'newsjoke') {
        // Other token-based formats use top 5
        token = await this.selectRandomTrendingToken();
      }

      if (!token && selectedFormat !== 'news' && selectedFormat !== 'newsjoke') {
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
}

export default KOLContentService;

