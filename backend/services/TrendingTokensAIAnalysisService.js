import GrokService from './GrokService.js';
import PerplexitySonarService from './PerplexitySonarService.js';
import fetch from 'node-fetch';

/**
 * Trending Tokens AI Analysis Service
 * Combines trending token data with LLM analysis and real-time news discovery
 * Provides human-readable summaries with price, metrics, and catalysts
 * Uses Grok (grok-4-1-fast-reasoning) for AI summaries and Perplexity for news/catalysts
 */
class TrendingTokensAIAnalysisService {
  constructor() {
    try {
      this.grokService = new GrokService();
      this.perplexityService = new PerplexitySonarService();
      // ALWAYS use production API endpoint (we're running on the same server)
      this.apiBaseUrl = 'https://api.degen-oracle.com';
      
      console.log('🤖 [TRENDING AI] Initialized with Grok (grok-4-1-fast-reasoning) + Perplexity');
      console.log(`   API Base: ${this.apiBaseUrl}`);
      console.log(`   Grok API Key: ${process.env.GROK_API ? 'SET' : 'MISSING ⚠️'}`);
    } catch (error) {
      console.error('❌ [TRENDING AI] Initialization error:', error.message);
      throw error;
    }
  }

  /**
   * Get trending tokens from internal API
   */
  async getTrendingTokens(limit = 10) {
    try {
      const response = await fetch(`${this.apiBaseUrl}/api/tokens/trending?limit=${limit}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const tokens = await response.json();
      console.log(`✅ [TRENDING AI] Fetched ${tokens.length} trending tokens from cache`);
      
      // Enrich with fresh Jupiter data
      const enrichedTokens = await this.enrichTokensWithJupiterData(tokens);
      console.log(`✅ [TRENDING AI] Enriched ${enrichedTokens.length} tokens with fresh Jupiter data`);
      
      return enrichedTokens;
      
    } catch (error) {
      console.error('❌ [TRENDING AI] Error fetching trending tokens:', error.message);
      return [];
    }
  }

  /**
   * Enrich tokens with fresh Jupiter data (price, mcap, volume, holders)
   */
  async enrichTokensWithJupiterData(tokens) {
    try {
      if (tokens.length === 0) return tokens;
      
      // Batch fetch Jupiter data (up to 100 tokens at once)
      const mints = tokens.map(t => t.contractAddress).filter(Boolean);
      if (mints.length === 0) return tokens;
      
      const batchSize = 100;
      const enrichedTokensMap = new Map();
      
      for (let i = 0; i < mints.length; i += batchSize) {
        const batch = mints.slice(i, i + batchSize);
        const ids = batch.join(',');
        
        console.log(`🔄 [TRENDING AI] Fetching Jupiter data for batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(mints.length/batchSize)} (${batch.length} tokens)...`);
        
        try {
          const url = `https://lite-api.jup.ag/tokens/v2/search?query=${ids}`;
          const response = await fetch(url, {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
          });
          
          if (!response.ok) {
            console.warn(`⚠️ [TRENDING AI] Jupiter batch ${Math.floor(i/batchSize) + 1} failed: ${response.status}`);
            continue;
          }
          
          const data = await response.json();
          // Jupiter API returns a direct array, not { tokens: [...] }
          const jupiterTokens = Array.isArray(data) ? data : [];
          
          console.log(`   📦 Received ${jupiterTokens.length} tokens from Jupiter`);
          
          // Map Jupiter data by address (use 'id' field, not 'address')
          jupiterTokens.forEach(jToken => {
            if (!jToken.id) return;
            
            // Calculate volume from stats24h (buyVolume + sellVolume)
            const volume24h = jToken.stats24h 
              ? (jToken.stats24h.buyVolume || 0) + (jToken.stats24h.sellVolume || 0)
              : 0;
            
            // Extract price change from Jupiter stats24h
            const priceChange24h = jToken.stats24h?.priceChange || 0;
            
            enrichedTokensMap.set(jToken.id, {
              price: jToken.usdPrice || 0,
              marketCap: jToken.mcap || jToken.marketCap || 0,  // Try 'mcap' first, then 'marketCap'
              volume24h: volume24h,
              priceChange24h: priceChange24h,  // CRITICAL: Extract from stats24h.priceChange
              holders: jToken.holderCount || 0,
              liquidity: jToken.liquidity || 0
            });
          });
          
          console.log(`✅ [TRENDING AI] Batch ${Math.floor(i/batchSize) + 1} complete: ${jupiterTokens.length} tokens enriched`);
          
        } catch (batchError) {
          console.error(`❌ [TRENDING AI] Batch ${Math.floor(i/batchSize) + 1} error:`, batchError.message);
        }
        
        // Small delay between batches to avoid rate limits
        if (i + batchSize < mints.length) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }
      
      // Merge Jupiter data with cached tokens
      const enrichedTokens = tokens.map(token => {
        const jupiterData = enrichedTokensMap.get(token.contractAddress);
        if (jupiterData) {
          return {
            ...token,
            price: jupiterData.price,
            marketCap: jupiterData.marketCap,
            volume24h: jupiterData.volume24h,
            priceChange24h: jupiterData.priceChange24h || token.priceChange24h || 0,  // Use Jupiter data, fallback to cached
            holderCount: jupiterData.holders,
            liquidity: jupiterData.liquidity
          };
        }
        // Preserve existing priceChange24h if Jupiter enrichment failed
        return {
          ...token,
          priceChange24h: token.priceChange24h || token.stats24h?.priceChange || token.jupiterData?.stats24h?.priceChange || 0
        };
      });
      
      console.log(`📊 [TRENDING AI] Enrichment complete: ${enrichedTokensMap.size}/${tokens.length} tokens updated`);
      return enrichedTokens;
      
    } catch (error) {
      console.error('❌ [TRENDING AI] Error enriching tokens:', error.message);
      return tokens; // Return original tokens if enrichment fails
    }
  }

  /**
   * Analyze a single token with Perplexity (news, catalysts, context)
   */
  async analyzeTokenWithPerplexity(token) {
    try {
      const query = `What are the latest news, developments, and price catalysts for ${token.symbol} (${token.name}) cryptocurrency in the last 24-48 hours? Include whale activity, partnerships, listings, or major events. Be concise and factual.`;
      
      console.log(`🔍 [TRENDING AI] Perplexity search for ${token.symbol}...`);
      
      const perplexityResponse = await this.perplexityService.searchCrypto(query, {
        searchRecencyFilter: 'day', // Last 24 hours
        maxTokens: 400 // Keep it concise
      });

      if (!perplexityResponse || !perplexityResponse.content) {
        console.warn(`⚠️ [TRENDING AI] No Perplexity data for ${token.symbol}`);
        return null;
      }

      console.log(`✅ [TRENDING AI] Perplexity analysis complete for ${token.symbol}`);
      return {
        news: perplexityResponse.content,
        citations: perplexityResponse.citations || [],
        searchResults: perplexityResponse.searchResults || []
      };
      
    } catch (error) {
      console.error(`❌ [TRENDING AI] Perplexity error for ${token.symbol}:`, error.message);
      return null;
    }
  }

  /**
   * Generate human-readable summary for a single token using OpenAI
   */
  async generateTokenSummary(token, perplexityData) {
    try {
      // Build context from token metrics - check multiple sources for priceChange24h
      const priceChange = token.priceChange24h 
        || token.stats24h?.priceChange 
        || token.jupiterData?.stats24h?.priceChange 
        || 0;
      const priceDirection = priceChange > 0 ? 'up' : priceChange < 0 ? 'down' : 'flat';
      const priceChangeAbs = Math.abs(priceChange);
      
      // Debug log to verify price change data
      console.log(`📊 [TRENDING AI] ${token.symbol} priceChange24h: ${priceChange}% (from token.priceChange24h=${token.priceChange24h}, stats24h=${token.stats24h?.priceChange}, jupiterData=${token.jupiterData?.stats24h?.priceChange})`);
      
      // Only mention price change if it's significant (>= 1% or <= -1%)
      const hasSignificantPriceChange = priceChangeAbs >= 1;
      const priceChangeText = hasSignificantPriceChange 
        ? `${priceChangeAbs.toFixed(1)}% ${priceDirection === 'up' ? 'up' : priceDirection === 'down' ? 'down' : 'flat'}`
        : 'flat/sideways';
      
      const prompt = `You are a crypto analyst writing a brief, engaging summary for ${token.symbol} (${token.name}).

**Token Metrics:**
- Price: $${token.price?.toFixed(6) || '0'}
- Market Cap: $${this.formatNumber(token.marketCap || token.mcap || 0)}
- 24h Volume: $${this.formatNumber(token.volume24h || 0)}
- 24h Price Change: ${priceChange >= 0 ? '+' : ''}${priceChange.toFixed(2)}%
- Liquidity: $${this.formatNumber(token.liquidity || 0)}
- Holders: ${token.holderCount || 'N/A'}
- Twitter Mentions: ${token.twitterData?.displayMentions || token.twitterData?.mentions || token.mentions || 0}
- Overall Score: ${token.overallScore || 'N/A'}/10

**Recent News & Catalysts:**
${perplexityData?.news || 'No recent news found.'}

**Task:**
Write a 2-3 sentence summary explaining WHY ${token.symbol} is trending. Focus on:
1. The main catalyst (whale activity, news, partnerships, listings, technical breakouts, etc.)
2. Price action context${hasSignificantPriceChange ? ` (${priceChangeText})` : ' (currently trading sideways but still generating interest)'}
3. Social/community activity if relevant

**IMPORTANT RULES:**
${hasSignificantPriceChange 
  ? `- Mention the ${priceChangeAbs.toFixed(1)}% ${priceDirection} movement naturally in the summary`
  : `- DO NOT mention "0%" or "flat" price movement. Instead focus on volume, trading activity, community engagement, or other catalysts.`
}
- Use crypto slang naturally (moon, pump, ape, degen, etc.)
- Be factual but engaging
- NO markdown formatting
- If price change is < 1%, focus on volume, whale activity, or social metrics instead

Example format (for tokens with significant price change):
"${token.symbol} has pumped ${hasSignificantPriceChange ? priceChangeAbs.toFixed(1) : 'X'}% in 24h following [catalyst]. Whales have been accumulating with $${this.formatNumber(token.volume24h || 0)} volume, while Twitter mentions hit ${token.twitterData?.displayMentions || token.twitterData?.mentions || token.mentions || 0}. [Additional context about fundamentals or news]."

Example format (for tokens with flat/sideways price):
"${token.symbol} is generating buzz with $${this.formatNumber(token.volume24h || 0)} in 24h volume despite sideways price action. [Mention whale activity, community engagement, or news]. Twitter mentions at ${token.twitterData?.displayMentions || token.twitterData?.mentions || token.mentions || 0} show growing community interest."`;

      console.log(`🤖 [TRENDING AI] Generating summary for ${token.symbol} using Grok...`);
      
      const summary = await this.grokService.generateCompletion(prompt, {
        model: 'grok-4-1-fast-reasoning',
        temperature: 0.7,
        maxTokens: 200,
        useCache: false // Always fresh for trending analysis
      });

      console.log(`✅ [TRENDING AI] Summary generated for ${token.symbol}`);
      return summary.trim();
      
    } catch (error) {
      console.error(`❌ [TRENDING AI] Summary generation error for ${token.symbol}:`, error.message);
      return `${token.symbol} is trending with ${token.priceChange24h >= 0 ? '+' : ''}${token.priceChange24h?.toFixed(2)}% price change in 24h.`;
    }
  }

  /**
   * Analyze top N trending tokens with AI
   */
  async analyzeTrendingTokens(limit = 10) {
    try {
      console.log(`🚀 [TRENDING AI] Starting analysis for top ${limit} trending tokens...`);
      
      // Step 1: Fetch trending tokens
      const tokens = await this.getTrendingTokens(limit);
      
      if (tokens.length === 0) {
        console.warn('⚠️ [TRENDING AI] No trending tokens found');
        return {
          success: false,
          message: 'No trending tokens available',
          tokens: []
        };
      }

      console.log(`📊 [TRENDING AI] Analyzing ${tokens.length} tokens...`);
      
      // Step 2: Analyze each token (parallel for speed)
      const analysisPromises = tokens.map(async (token, index) => {
        try {
          // Add delay to avoid rate limits (stagger requests)
          await new Promise(resolve => setTimeout(resolve, index * 1000));
          
          // Get Perplexity news/catalysts
          const perplexityData = await this.analyzeTokenWithPerplexity(token);
          
          // Generate AI summary (using Grok)
          let summary;
          try {
            summary = await this.generateTokenSummary(token, perplexityData);
          } catch (grokError) {
            console.error(`❌ [TRENDING AI] Grok error for ${token.symbol}:`, grokError.message);
            // Return fallback summary if Grok fails
            summary = `${token.symbol} is trending with ${token.priceChange24h >= 0 ? '+' : ''}${(token.priceChange24h || 0).toFixed(2)}% price change in 24h.`;
          }
          
          return {
            rank: index + 1,
            symbol: token.symbol,
            name: token.name,
            contractAddress: token.contractAddress,
            
            // Price & Market Data
            price: token.price || 0,
            priceFormatted: `$${token.price?.toFixed(6) || '0'}`,
            marketCap: token.marketCap || token.mcap || 0,
            marketCapFormatted: this.formatNumber(token.marketCap || token.mcap || 0),
            volume24h: token.volume24h || 0,
            volume24hFormatted: this.formatNumber(token.volume24h || 0),
            liquidity: token.liquidity || 0,
            liquidityFormatted: this.formatNumber(token.liquidity || 0),
            
            // Price Changes
            priceChange24h: token.priceChange24h || 0,
            priceChange24hFormatted: `${token.priceChange24h >= 0 ? '+' : ''}${token.priceChange24h?.toFixed(2)}%`,
            
            // Social & Community
            holders: token.holderCount || 0,
            twitterMentions: token.twitterData?.displayMentions || token.twitterData?.mentions || token.mentions || 0,
            sentimentScore: token.twitterData?.sentimentScore || 0,
            overallScore: token.overallScore || 0
            
            // AI Analysis
            summary: summary,
            news: perplexityData?.news || null,
            citations: perplexityData?.citations || [],
            
            // Metadata
            timestamp: new Date().toISOString()
          };
          
        } catch (error) {
          console.error(`❌ [TRENDING AI] Error analyzing ${token.symbol}:`, error.message);
          return {
            rank: index + 1,
            symbol: token.symbol,
            name: token.name,
            contractAddress: token.contractAddress,
            price: token.price || 0,
            priceFormatted: `$${token.price?.toFixed(6) || '0'}`,
            marketCap: token.marketCap || token.mcap || 0,
            marketCapFormatted: this.formatNumber(token.marketCap || token.mcap || 0),
            priceChange24h: token.priceChange24h || 0,
            priceChange24hFormatted: `${token.priceChange24h >= 0 ? '+' : ''}${token.priceChange24h?.toFixed(2)}%`,
            summary: `${token.symbol} is trending with ${token.priceChange24h >= 0 ? '+' : ''}${token.priceChange24h?.toFixed(2)}% price change.`,
            error: 'Analysis failed',
            timestamp: new Date().toISOString()
          };
        }
      });

      const analyzedTokens = await Promise.all(analysisPromises);
      
      console.log(`✅ [TRENDING AI] Analysis complete for ${analyzedTokens.length} tokens`);
      
      return {
        success: true,
        count: analyzedTokens.length,
        tokens: analyzedTokens,
        generatedAt: new Date().toISOString()
      };
      
    } catch (error) {
      console.error('❌ [TRENDING AI] Analysis failed:', error.message);
      return {
        success: false,
        error: error.message,
        tokens: []
      };
    }
  }

  /**
   * Generate a formatted text report (human-readable)
   */
  formatAsTextReport(analysisResult) {
    if (!analysisResult.success || analysisResult.tokens.length === 0) {
      return 'No trending tokens available at this time.';
    }

    let report = `🔥 TOP ${analysisResult.count} TRENDING TOKENS 🔥\n`;
    report += `Generated: ${new Date(analysisResult.generatedAt).toLocaleString()}\n`;
    report += `${'='.repeat(80)}\n\n`;

    analysisResult.tokens.forEach(token => {
      report += `${token.rank}. ${token.symbol} (${token.name})\n`;
      report += `   💰 Price: ${token.priceFormatted} (${token.priceChange24hFormatted})\n`;
      report += `   📊 Market Cap: ${token.marketCapFormatted} | Volume: ${token.volume24hFormatted}\n`;
      report += `   💧 Liquidity: ${token.liquidityFormatted} | Score: ${token.overallScore}/10\n`;
      report += `   🐦 Twitter: ${token.twitterMentions} mentions | Sentiment: ${token.sentimentScore.toFixed(1)}/10\n`;
      report += `   👥 Holders: ${token.holders.toLocaleString()}\n`;
      report += `   \n`;
      report += `   📝 ${token.summary}\n`;
      report += `\n`;
    });

    return report;
  }

  /**
   * Helper: Format large numbers
   */
  formatNumber(num) {
    if (!num || num === 0) return '$0';
    if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
    if (num >= 1e3) return `$${(num / 1e3).toFixed(2)}K`;
    return `$${num.toFixed(2)}`;
  }
}

export default TrendingTokensAIAnalysisService;

