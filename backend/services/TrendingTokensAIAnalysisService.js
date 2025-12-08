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
   * Fetch Moralis holder insights (whale/retail flows, holder distribution)
   */
  async fetchHolderInsights(token) {
    try {
      if (!token.contractAddress) {
        console.warn(`⚠️ [TRENDING AI] No contract address for ${token.symbol}`);
        return null;
      }

      console.log(`👥 [TRENDING AI] Fetching holder insights for ${token.symbol}...`);
      
      const response = await fetch(`${this.apiBaseUrl}/api/tokens/${token.contractAddress}/holders/insights`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        console.warn(`⚠️ [TRENDING AI] Holder insights failed for ${token.symbol}: ${response.status}`);
        return null;
      }

      const result = await response.json();
      
      if (result.success && result.data) {
        console.log(`✅ [TRENDING AI] Holder insights loaded for ${token.symbol}`);
        return result.data;
      }
      
      return null;
    } catch (error) {
      console.error(`❌ [TRENDING AI] Error fetching holder insights for ${token.symbol}:`, error.message);
      return null;
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
        maxTokens: 800 // Increased for more detailed news and catalysts
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
   * Generate human-readable summary for a single token using Grok
   */
  async generateTokenSummary(token, perplexityData, holderInsights) {
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
      
      // Build additional context from available data
      const hasHighVolume = (token.volume24h || 0) > (token.marketCap || token.mcap || 0) * 0.1; // Volume > 10% of mcap
      const hasLowLiquidity = (token.liquidity || 0) < (token.marketCap || token.mcap || 0) * 0.1; // Liquidity < 10% of mcap
      const holderGrowth = token.holderCount || 0;
      const volumeToLiquidityRatio = token.liquidity > 0 ? ((token.volume24h || 0) / token.liquidity).toFixed(2) : 'N/A';
      
      // Extract holder insights data
      const holderStats = holderInsights?.holderStats || {};
      const holderFlowData = holderInsights?.holderFlowData || {};
      const segmentFlow = holderFlowData?.segmentFlow || {};
      const whaleFlow = segmentFlow?.whales || { in: 0, out: 0, net: 0 };
      const retailFlow = {
        in: (segmentFlow?.crabs?.in || 0) + (segmentFlow?.shrimps?.in || 0),
        out: (segmentFlow?.crabs?.out || 0) + (segmentFlow?.shrimps?.out || 0),
        net: (segmentFlow?.crabs?.net || 0) + (segmentFlow?.shrimps?.net || 0)
      };
      const whales = holderStats?.holderDistribution?.whales || 0;
      const top10Pct = holderStats?.holderSupply?.top10?.supplyPercent || 0;
      const holderChange24h = holderStats?.holderChange?.['24h']?.change || 0;
      
      const prompt = `You are an expert crypto analyst writing a comprehensive, value-driven summary for ${token.symbol} (${token.name}).

**Token Metrics:**
- Price: $${token.price?.toFixed(6) || '0'}
- Market Cap: $${this.formatNumber(token.marketCap || token.mcap || 0)}
- 24h Volume: $${this.formatNumber(token.volume24h || 0)}
- 24h Price Change: ${priceChange >= 0 ? '+' : ''}${priceChange.toFixed(2)}%
- Liquidity: $${this.formatNumber(token.liquidity || 0)}
- Volume/Liquidity Ratio: ${volumeToLiquidityRatio}x ${hasLowLiquidity ? '(⚠️ Low liquidity - high volatility risk)' : ''}
- Total Holders: ${holderGrowth.toLocaleString()}
- Overall Score: ${token.overallScore || 'N/A'}/10

**🐋 ON-CHAIN HOLDER INSIGHTS (from Moralis):**
${holderInsights 
  ? `- Whales: ${whales}
- Top 10 Control: ${top10Pct.toFixed(1)}% of supply
- Holder Change (24h): ${holderChange24h > 0 ? '+' : ''}${holderChange24h}
- 🐋 Whale Flow: ${whaleFlow.net > 0 ? '+' : ''}${whaleFlow.net} (in: ${whaleFlow.in}, out: ${whaleFlow.out})
- 🦐 Retail Flow: ${retailFlow.net > 0 ? '+' : ''}${retailFlow.net} (in: ${retailFlow.in}, out: ${retailFlow.out})`
  : '⚠️ Holder insights not available for this token.'}

**🔍 REAL-TIME NEWS & CATALYSTS (from Perplexity search):**
${perplexityData?.news ? `\n${perplexityData.news}\n\n**Key Sources:**\n${(perplexityData.citations || []).slice(0, 3).map((c, i) => `${i + 1}. ${c}`).join('\n') || 'No citations available'}` : '⚠️ No recent news or catalysts found in search results.'}

**📊 ANALYSIS REQUIREMENTS:**
Write a 3-4 sentence comprehensive summary that provides REAL VALUE. Structure it as:

1. **LEAD WITH THE CATALYST** (MOST IMPORTANT): Start with the specific news, event, listing, partnership, or whale activity from the Perplexity data. If no news found, lead with on-chain holder flow analysis (whale/retail activity).

2. **🐋 ON-CHAIN HOLDER FLOW ANALYSIS** (CRITICAL): Build your opinion around the Moralis holder insights:
   - If whales are flowing IN (positive net): "Smart money accumulating" or "Whales loading up" - this is BULLISH
   - If whales are flowing OUT (negative net): "Whale outflow detected" or "Smart money exiting" - this is BEARISH
   - If retail is flowing IN: "Retail FOMO building" or "Apes piling in"
   - If retail is flowing OUT: "Retail selling pressure" or "Paper hands folding"
   - Combine whale + retail flows to tell the story (e.g., "Whales accumulating while retail exits" = smart money buying the dip)

3. **Price Action & Volume Context**: Include the ${hasSignificantPriceChange ? `${priceChangeAbs.toFixed(1)}% ${priceDirection}` : 'price movement'} and volume dynamics. Connect price action to holder flows when possible.

4. **Risk/Outlook**: Mention concentration risk (top 10% control), liquidity concerns, or bullish signals based on holder distribution health.

**CRITICAL INSTRUCTIONS:**
${perplexityData?.news 
  ? `- **PRIORITIZE THE PERPLEXITY NEWS DATA** - This is real-time information. Extract specific details like exchange listings, partnerships, whale transactions, or major announcements mentioned in the news.
- If the news mentions specific events, numbers, or dates, include them in your summary.
- Don't just say "no news" - if Perplexity found something, it's important and should be the focus.`
  : `- Since no recent news was found, LEAD WITH ON-CHAIN HOLDER FLOW ANALYSIS instead.
- Build your narrative around whale/retail flows - this is the most valuable insight.`
}
- **🐋 ALWAYS ANALYZE HOLDER FLOWS** - This is the core of your analysis. Use phrases like:
  * Whale net positive: "Smart money accumulating 🐋", "Whales loading up 💰", "Institutional interest building"
  * Whale net negative: "Whale outflow detected 🐋📉", "Smart money exiting 🚨", "Distribution phase"
  * Retail net positive: "Retail FOMO building 🦐", "Apes piling in 📈", "Community expansion"
  * Retail net negative: "Retail selling pressure 🦐📉", "Paper hands folding", "Retail exodus"
  * Both positive: "Whale and retail alignment 🔥", "Community grinding together 💎"
  * Divergence: "Whales buying the dip while retail exits" or "Retail FOMO while whales distribute"
- **NEVER mention Twitter mentions or social media activity** - focus on on-chain data only
- Use crypto slang naturally but remain factual
- NO markdown formatting
- Be specific with numbers and data points
- If liquidity is very low relative to volume, mention the volatility risk
- If top 10% control >30%, mention concentration risk

**Example (with news + whale flow):**
"${token.symbol} surged ${hasSignificantPriceChange ? priceChangeAbs.toFixed(1) : 'X'}% after [SPECIFIC EVENT FROM PERPLEXITY - e.g., 'BitMart exchange listing']. ${whaleFlow.net > 0 ? 'Smart money is accumulating with +' + whaleFlow.net + ' whale net flow 🐋' : whaleFlow.net < 0 ? 'Whale outflow detected (' + whaleFlow.net + ') as smart money takes profits 🐋📉' : 'Whale activity is neutral'}, while ${retailFlow.net > 0 ? 'retail FOMO is building with +' + retailFlow.net + ' net flow 🦐' : retailFlow.net < 0 ? 'retail is selling (' + retailFlow.net + ' net) 🦐📉' : 'retail flow is balanced'}. The announcement triggered $${this.formatNumber(token.volume24h || 0)} in 24h volume. ${hasLowLiquidity ? '⚠️ Thin $' + this.formatNumber(token.liquidity || 0) + ' liquidity suggests high volatility risk.' : 'Strong $' + this.formatNumber(token.liquidity || 0) + ' liquidity provides stability.'}"

**Example (no news, holder flow-driven):**
"${token.symbol} is ${whaleFlow.net > 0 && retailFlow.net > 0 ? 'seeing strong on-chain accumulation with whales (+' + whaleFlow.net + ') and retail (+' + retailFlow.net + ') both flowing in 🔥' : whaleFlow.net > 0 ? 'attracting smart money with +' + whaleFlow.net + ' whale net flow 🐋 while retail is ' + (retailFlow.net < 0 ? 'exiting (' + retailFlow.net + ')' : 'neutral') : 'experiencing ' + (whaleFlow.net < 0 ? 'whale distribution (' + whaleFlow.net + ') 🐋📉' : 'neutral whale activity')}, driving ${hasSignificantPriceChange ? priceChangeAbs.toFixed(1) + '%' : 'strong'} price action and $${this.formatNumber(token.volume24h || 0)} volume. ${top10Pct > 30 ? '⚠️ High concentration risk with top 10% controlling ' + top10Pct.toFixed(1) + '% of supply.' : 'Holder distribution looks healthy with ' + top10Pct.toFixed(1) + '% top 10 control.'} ${hasLowLiquidity ? 'Thin $' + this.formatNumber(token.liquidity || 0) + ' liquidity creates volatility risk.' : ''}"`;

      console.log(`🤖 [TRENDING AI] Generating summary for ${token.symbol} using Grok...`);
      
      const summary = await this.grokService.generateCompletion(prompt, {
        model: 'grok-4-1-fast-reasoning',
        temperature: 0.7,
        maxTokens: 350, // Increased for more detailed, value-driven summaries
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
          
          // Get Perplexity news/catalysts and holder insights in parallel
          const [perplexityData, holderInsights] = await Promise.all([
            this.analyzeTokenWithPerplexity(token),
            this.fetchHolderInsights(token)
          ]);
          
          // Generate AI summary (using Grok)
          let summary;
          try {
            summary = await this.generateTokenSummary(token, perplexityData, holderInsights);
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
            overallScore: token.overallScore || 0,
            
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

