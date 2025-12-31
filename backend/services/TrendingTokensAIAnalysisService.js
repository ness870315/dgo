import GrokService from './GrokService.js';
import PerplexitySonarService from './PerplexitySonarService.js';
import fetch from 'node-fetch';

/**
 * Trending Tokens AI Analysis Service
 * Combines trending token data with LLM analysis and real-time news discovery
 * Provides human-readable summaries with price, metrics, and catalysts
 * Uses Grok (grok-4-1-fast-reasoning) for AI summaries and real-time news search for catalysts
 */
class TrendingTokensAIAnalysisService {
  constructor() {
    try {
      this.grokService = new GrokService();
      this.perplexityService = new PerplexitySonarService();
      // ALWAYS use production API endpoint (we're running on the same server)
      this.apiBaseUrl = 'https://api.degen-oracle.com';
      
      console.log('🤖 [TRENDING AI] Initialized with Grok (grok-4-1-fast-reasoning) + Real-time news search');
      console.log(`   API Base: ${this.apiBaseUrl}`);
      console.log(`   Grok API Key: ${process.env.GROK_API ? 'SET' : 'MISSING ⚠️'}`);
    } catch (error) {
      console.error('❌ [TRENDING AI] Initialization error:', error.message);
      throw error;
    }
  }

  /**
   * Get trending tokens from Token Rankings list
   * Uses the same scoring system as the rankings table - just get top N by overallScore
   */
  async getTrendingTokens(limit = 10) {
    try {
      console.log(`📡 [TRENDING AI] Fetching top ${limit} tokens from rankings (by overallScore)...`);
      
      // Get all tokens from cache (same as rankings table uses)
      const response = await fetch(`${this.apiBaseUrl}/api/tokens?limit=200`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      let tokens = await response.json();
      console.log(`✅ [TRENDING AI] Fetched ${tokens.length} tokens from cache`);
      
      // Sort by overallScore (highest first) - same as rankings table
      // Use volume24h as tiebreaker for tokens with same score
      tokens.sort((a, b) => {
        const scoreA = a.overallScore || 0;
        const scoreB = b.overallScore || 0;
        if (scoreB !== scoreA) return scoreB - scoreA;
        return (b.volume24h || 0) - (a.volume24h || 0);
      });
      
      // Take top N tokens (same as rankings table shows)
      const topTokens = tokens.slice(0, limit);
      console.log(`📊 [TRENDING AI] Selected top ${topTokens.length} tokens by overallScore (same as rankings table)`);
      
      if (topTokens.length < limit) {
        console.warn(`⚠️ [TRENDING AI] Only ${topTokens.length} tokens available (requested ${limit})`);
      }
      
      // Log the selected tokens for debugging
      topTokens.forEach((token, index) => {
        console.log(`   ${index + 1}. ${token.symbol} - Score: ${token.overallScore?.toFixed(2) || 'N/A'}, Volume: $${((token.volume24h || 0) / 1e6).toFixed(2)}M`);
      });
      
      // Enrich with fresh Jupiter data
      const enrichedTokens = await this.enrichTokensWithJupiterData(topTokens);
      console.log(`✅ [TRENDING AI] Enriched ${enrichedTokens.length} tokens with fresh Jupiter data`);
      
      console.log(`✅ [TRENDING AI] Returning ${enrichedTokens.length} tokens for analysis`);
      
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
          const JUPITER_API_ENDPOINT = process.env.JUP_API_ENDPOINT || 'https://api.jup.ag';
          const JUPITER_API_KEY = process.env.JUP_API_KEY || '';
          
          const headers = { 'Accept': 'application/json' };
          if (JUPITER_API_KEY) {
            headers['x-api-key'] = JUPITER_API_KEY;
          }
          
          const url = `${JUPITER_API_ENDPOINT}/tokens/v2/search?query=${ids}`;
          const response = await fetch(url, {
            method: 'GET',
            headers: headers
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
   * Analyze a single token with real-time news search (news, catalysts, context)
   */
  async analyzeTokenWithPerplexity(token) {
    try {
      // Build comprehensive query with name, ticker, and contract address
      const tokenName = token.name || token.symbol;
      const tokenSymbol = token.symbol || 'UNKNOWN';
      const contractAddress = token.contractAddress || '';
      const contractShort = contractAddress ? `${contractAddress.substring(0, 8)}...${contractAddress.slice(-8)}` : '';
      
      // More direct query format for comprehensive news search
      const query = `Give me the MOST recent news and catalysts for ${tokenName} ($${tokenSymbol})${contractAddress ? ` on Solana, contract address: ${contractAddress}` : ' on Solana'} in the last 24-48 hours. 

Extract and provide:
1. **CEX Listings**: Name specific exchanges (BitMart, MEXC, Gate.io, Hotcoin, Bitrue, Bitrue Alpha, etc.), listing dates, trading pairs (e.g., KABUTO/USDT), and any special promotions (zero-fee, etc.)
2. **Price Action & Market Cap Spikes**: Specific percentage gains/losses, market cap numbers (e.g., "briefly exceeded 10-13M USD"), dates of spikes, daily price changes
3. **Narrative Developments**: Story angles, meme themes, community focus (e.g., "Pokémon-card tie-in", "meme/NFT/DeFi communities"), viral moments
4. **Partnerships & Announcements**: Major partnerships, integrations, protocol updates
5. **Media Coverage**: Articles, roundups, "best Solana memes" features, social media spotlight

Be EXTREMELY specific with:
- Exchange names (don't say "exchange listing", say "BitMart listing")
- Dates (e.g., "December 1-2, 2025", "December 4, 2025")
- Numbers (percentages, market cap figures, volume numbers)
- Narrative details (exact themes, story angles)

Format your response with clear sections for each category.`;
      
      console.log(`🔍 [TRENDING AI] Real-time news search for ${tokenName} ($${tokenSymbol})${contractShort ? ` [${contractShort}]` : ''}...`);
      
      const perplexityResponse = await this.perplexityService.searchCrypto(query, {
        searchRecencyFilter: 'day', // Last 24 hours
        maxTokens: 1200 // Increased for comprehensive news extraction
      });

      if (!perplexityResponse || !perplexityResponse.content) {
        console.warn(`⚠️ [TRENDING AI] No news data found for ${token.symbol}`);
        return null;
      }

      console.log(`✅ [TRENDING AI] News analysis complete for ${token.symbol}`);
      console.log(`   📰 News length: ${perplexityResponse.content?.length || 0} chars`);
      console.log(`   📚 Citations: ${perplexityResponse.citations?.length || 0}`);
      
      return {
        news: perplexityResponse.content,
        citations: perplexityResponse.citations || [],
        searchResults: perplexityResponse.searchResults || []
      };
      
    } catch (error) {
      console.error(`❌ [TRENDING AI] News search error for ${token.symbol}:`, error.message);
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
      const topHolders = holderInsights?.topHolders || {};
      const segmentFlow = holderFlowData?.segmentFlow || {};
      const whaleFlow = segmentFlow?.whales || { in: 0, out: 0, net: 0 };
      const retailFlow = {
        in: (segmentFlow?.crabs?.in || 0) + (segmentFlow?.shrimps?.in || 0),
        out: (segmentFlow?.crabs?.out || 0) + (segmentFlow?.shrimps?.out || 0),
        net: (segmentFlow?.crabs?.net || 0) + (segmentFlow?.shrimps?.net || 0)
      };
      const whales = holderStats?.holderDistribution?.whales || 0;
      
      // Calculate top 10% control - try multiple sources
      let top10Pct = 0;
      
      // Try holderSupply first (from Moralis API)
      if (holderStats?.holderSupply?.top10?.supplyPercent) {
        top10Pct = parseFloat(holderStats.holderSupply.top10.supplyPercent);
        console.log(`📊 [TRENDING AI] Got top10Pct from holderSupply: ${top10Pct.toFixed(1)}%`);
      }
      
      // If holderSupply is missing or 0, calculate from topHolders
      if (top10Pct === 0 && topHolders?.holders && topHolders.holders.length > 0) {
        // Sum percentages of top 10 holders
        const top10Holders = topHolders.holders.slice(0, 10);
        top10Pct = top10Holders.reduce((sum, holder) => {
          // Try multiple possible field names
          const pct = parseFloat(
            holder.percentage || 
            holder.percentageRelativeToTotalSupply || 
            holder.percentageFormatted?.replace('%', '') ||
            0
          );
          return sum + (isNaN(pct) ? 0 : pct);
        }, 0);
        console.log(`📊 [TRENDING AI] Calculated top10Pct from topHolders: ${top10Pct.toFixed(1)}% (from ${top10Holders.length} holders)`);
      }
      
      // Fallback: try supplyConcentration if available
      if (top10Pct === 0 && holderStats?.supplyConcentration?.top10) {
        top10Pct = parseFloat(holderStats.supplyConcentration.top10);
        console.log(`📊 [TRENDING AI] Got top10Pct from supplyConcentration: ${top10Pct.toFixed(1)}%`);
      }
      
      // If still 0, log warning
      if (top10Pct === 0) {
        console.warn(`⚠️ [TRENDING AI] Could not determine top10Pct for ${token.symbol} - holderStats:`, {
          hasHolderSupply: !!holderStats?.holderSupply,
          hasTopHolders: !!topHolders?.holders,
          topHoldersCount: topHolders?.holders?.length || 0,
          hasSupplyConcentration: !!holderStats?.supplyConcentration
        });
      }
      
      const holderChange24h = holderStats?.holderChange?.['24h']?.change || 0;
      
      // Debug log holder insights
      console.log(`📊 [TRENDING AI] ${token.symbol} holder insights:`, {
        top10Pct: top10Pct.toFixed(1) + '%',
        whales,
        whaleFlow: `${whaleFlow.net > 0 ? '+' : ''}${whaleFlow.net}`,
        retailFlow: `${retailFlow.net > 0 ? '+' : ''}${retailFlow.net}`,
        holderChange24h
      });
      
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
${top10Pct > 0 ? `- Top 10 Control: ${top10Pct.toFixed(1)}% of supply` : '- Top 10 Control: Data not available'}
- Holder Change (24h): ${holderChange24h > 0 ? '+' : ''}${holderChange24h}
- 🐋 Whale Flow: ${whaleFlow.net > 0 ? '+' : ''}${whaleFlow.net} (in: ${whaleFlow.in}, out: ${whaleFlow.out})
- 🦐 Retail Flow: ${retailFlow.net > 0 ? '+' : ''}${retailFlow.net} (in: ${retailFlow.in}, out: ${retailFlow.out})`
  : '⚠️ Holder insights not available for this token.'}

**🔍 REAL-TIME NEWS & CATALYSTS (from Degen Oracle real-time search - THIS IS YOUR PRIMARY DATA SOURCE):**
${perplexityData?.news 
  ? `\n${perplexityData.news}\n\n**Key Sources (${perplexityData.citations?.length || 0}):**\n${(perplexityData.citations || []).slice(0, 5).map((c, i) => `${i + 1}. ${c}`).join('\n') || 'No citations available'}\n\n**CRITICAL**: The above data from our platform contains REAL, CURRENT information. You MUST extract and use SPECIFIC details from it in your summary. When referencing this data, use VARIED phrasing - mix between: "Degen Oracle confirms", "Our platform analysis shows", "Our analytics indicate", "Degen Oracle's analysis reveals", "Our systems analytics confirm", "Analysis indicates", "Recent data shows", or simply state facts directly without attribution. DO NOT start every summary with "Degen Oracle confirms" - use natural variation. NEVER mention "Perplexity" or any external service names.`
  : '⚠️ **NO NEWS DATA FOUND** - This means the token is likely trending on pure speculation/meme momentum without fundamental catalysts. In this case, lead with on-chain holder flow analysis and mention that no recent news/catalysts were found.'}

**📊 ANALYSIS REQUIREMENTS:**
Write a 3-4 sentence comprehensive summary that provides REAL VALUE. Structure it as:

1. **🚨 MANDATORY: LEAD WITH REAL-TIME NEWS/CATALYSTS** (MOST IMPORTANT - 80% OF SUMMARY):
${perplexityData?.news 
  ? `   - **YOUR FIRST 2-3 SENTENCES MUST BE ABOUT THE NEWS DATA** - This is non-negotiable.
   - **EXTRACT SPECIFIC DETAILS** from the news section above:
     * CEX Listings: Name the exchange (BitMart, MEXC, Gate.io, Hotcoin, Bitrue, Bitrue Alpha, etc.), listing date, trading pair (e.g., "KABUTO/USDT"), promotions (e.g., "zero-fee promo")
     * Price Action: Specific percentages (e.g., "260-327% daily gains"), market cap numbers (e.g., "briefly exceeded 10-13M USD market cap"), dates (e.g., "between December 1-2, 2025")
     * Narrative: Exact themes (e.g., "Pokémon-card tie-in", "meme/NFT/DeFi communities"), story angles, viral moments
     * Media Coverage: Articles, roundups, "best Solana memes" features
   - **USE EXACT PHRASING** from the news data when possible. If the data says "BitMart listing on December 4, 2025", use that exact phrasing.
   - **PRIORITIZE IN THIS ORDER**: 1) CEX listings (most important), 2) Price action spikes with numbers, 3) Market cap movements, 4) Narrative developments, 5) Partnerships
   - **DON'T SAY "no fresh catalysts"** if news data was found - that's contradictory. If news was found, it IS a catalyst.
   - **MULTIPLE CATALYSTS**: If multiple things are mentioned, mention the most significant ones (CEX listings first, then price spikes, then narrative).
   - **CRITICAL**: When referencing this data, use VARIED phrasing throughout - mix between: "Degen Oracle confirms", "Our platform analysis shows", "Our analytics indicate", "Degen Oracle's analysis reveals", "Analysis indicates", "Recent data shows", "Our systems analytics confirm", or simply state facts directly. DO NOT start every summary the same way - use natural variation. Sometimes start with the news directly, sometimes with attribution. NEVER mention "Perplexity" or any external service names.`
  : `   - Since no news data was found, lead with on-chain holder flow analysis.
   - Explicitly mention: "despite no fresh catalysts" or "no recent news/catalysts found" to indicate this is pure speculation/meme momentum.`}

2. **🐋 ON-CHAIN HOLDER FLOW ANALYSIS** (SUPPORTING DATA): After covering news/catalysts, add holder flow context:
   - If whales are flowing IN (positive net): "Smart money accumulating" or "Whales loading up" - this is BULLISH
   - If whales are flowing OUT (negative net): "Whale outflow detected" or "Smart money exiting" - this is BEARISH
   - If retail is flowing IN: "Retail FOMO building" or "Apes piling in"
   - If retail is flowing OUT: "Retail selling pressure" or "Paper hands folding"
   - Combine whale + retail flows to tell the story (e.g., "Whales accumulating while retail exits" = smart money buying the dip)

3. **Price Action & Volume Context**: Include the ${hasSignificantPriceChange ? `${priceChangeAbs.toFixed(1)}% ${priceDirection}` : 'price movement'} and volume dynamics. Connect price action to holder flows when possible.

4. **Risk/Outlook**: ${top10Pct > 0 ? `Mention concentration risk if top 10% control >30% (currently ${top10Pct.toFixed(1)}%),` : 'If holder distribution data is available,'} liquidity concerns, or bullish signals based on holder distribution health.

**CRITICAL INSTRUCTIONS:**
${perplexityData?.news 
  ? `- **MANDATORY: LEAD WITH NEWS DATA** - This is the MOST IMPORTANT information. Your summary MUST start with the specific news/catalysts from our platform analysis.
- Extract and mention SPECIFIC details from the news data:
  * Exchange listings (name the exchange: BitMart, MEXC, Gate.io, Hotcoin, Bitrue, etc.)
  * Price action spikes (specific percentages, market cap numbers, dates)
  * Market cap movements (e.g., "briefly exceeded 10-13M USD market cap")
  * Partnerships or major announcements
  * Narrative developments (e.g., "Pokémon-card tie-in", "meme/NFT/DeFi communities")
  * Dates mentioned (e.g., "December 1-2, 2025")
- DO NOT summarize the news generically - use the EXACT details from the news data (exchange names, percentages, dates, market cap numbers).
- If multiple catalysts are mentioned, prioritize the most recent and significant ones (CEX listings > price spikes > narrative).
- The news data is REAL and CURRENT - it should be 80% of your summary content.
- **CRITICAL**: When referencing this data, use VARIED phrasing throughout your summary - mix between: "Degen Oracle confirms", "Our platform analysis shows", "Our analytics indicate", "Degen Oracle's analysis reveals", "Analysis indicates", "Recent data shows", "Our systems analytics confirm", or simply state facts directly without attribution. DO NOT start every summary with "Degen Oracle confirms" - use natural variation. Sometimes lead with the news directly, sometimes with subtle attribution mid-sentence. NEVER mention "Perplexity" or any external service names.`
  : `- Since no recent news was found, LEAD WITH ON-CHAIN HOLDER FLOW ANALYSIS instead.
- Build your narrative around whale/retail flows - this is the most valuable insight when no news is available.
- Mention that this appears to be pure speculation/meme momentum without fundamental catalysts.`
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
- ${top10Pct > 0 ? `If top 10% control >30% (currently ${top10Pct.toFixed(1)}%), mention concentration risk` : 'If concentration data is available and >30%, mention concentration risk'}

**Example (with news data - USE VARIED PHRASING, DON'T ALWAYS START WITH "Degen Oracle confirms"):**
"${token.symbol} surged after [EXACT NEWS DETAIL #1 - e.g., 'BitMart exchange listing on December 4, 2025' or 'briefly exceeded 10-13M USD market cap with 260-327% daily gains between December 1-2, 2025']. [ADD NEWS DETAIL #2 - e.g., 'Hotcoin also announced ${token.symbol}/USDT spot trading with zero-fee promo around December 1' or 'Bitrue Alpha published an official listing update on December 4']. [ADD NEWS DETAIL #3 IF AVAILABLE - e.g., 'The Pokémon-card tie-in narrative kept it in social feeds as an actively watched degen play' or 'Market data outlets report the move as highly speculative with limited real-world utility']. On-chain data shows ${whaleFlow.net > 0 ? 'smart money accumulating with +' + whaleFlow.net + ' whale net flow 🐋' : whaleFlow.net < 0 ? 'whale outflow (' + whaleFlow.net + ') 🐋📉' : 'neutral whale activity'}, while ${retailFlow.net > 0 ? 'retail FOMO building with +' + retailFlow.net + ' net flow 🦐' : retailFlow.net < 0 ? 'retail selling (' + retailFlow.net + ' net) 🦐📉' : 'retail flow balanced'}. The [news catalyst - e.g., 'listing announcements' or 'market cap spike to 10-13M USD'] triggered $${this.formatNumber(token.volume24h || 0)} in 24h volume. ${hasLowLiquidity ? '⚠️ Thin $' + this.formatNumber(token.liquidity || 0) + ' liquidity suggests high volatility risk.' : 'Strong $' + this.formatNumber(token.liquidity || 0) + ' liquidity provides stability.'}"

**VARIATION EXAMPLES (use different starts for different tokens):**
- Direct start: "${token.symbol} surged after BitMart exchange listing..."
- Attribution mid-sentence: "Recent analysis indicates ${token.symbol} gained momentum following..."
- Platform reference: "Our platform analysis shows ${token.symbol} spiked after..."
- Simple fact: "${token.symbol} saw 260% gains following the BitMart listing..."
- Data-driven: "Analysis reveals ${token.symbol} briefly exceeded 10-13M USD market cap..."

**REMEMBER**: 
- If news data was found, your FIRST 2-3 SENTENCES should be about that news with SPECIFIC details (exchange names, dates, percentages, market cap numbers, narrative themes).
- Holder flows are supporting context that comes AFTER the news/catalysts.
- Don't say "despite no fresh catalysts" if news data was found - that's contradictory.
- **CRITICAL**: Use VARIED phrasing throughout - mix between: "Degen Oracle confirms", "Our platform analysis shows", "Our analytics indicate", "Analysis indicates", "Recent data shows", or simply state facts directly. DO NOT start every summary the same way - use natural variation. Sometimes start with the news directly, sometimes with attribution. NEVER mention "Perplexity" or any external service names.

**Example (no news, holder flow-driven):**
"${token.symbol} is ${whaleFlow.net > 0 && retailFlow.net > 0 ? 'seeing strong on-chain accumulation with whales (+' + whaleFlow.net + ') and retail (+' + retailFlow.net + ') both flowing in 🔥' : whaleFlow.net > 0 ? 'attracting smart money with +' + whaleFlow.net + ' whale net flow 🐋 while retail is ' + (retailFlow.net < 0 ? 'exiting (' + retailFlow.net + ')' : 'neutral') : 'experiencing ' + (whaleFlow.net < 0 ? 'whale distribution (' + whaleFlow.net + ') 🐋📉' : 'neutral whale activity')}, driving ${hasSignificantPriceChange ? priceChangeAbs.toFixed(1) + '%' : 'strong'} price action and $${this.formatNumber(token.volume24h || 0)} volume. ${top10Pct > 0 ? (top10Pct > 30 ? '⚠️ High concentration risk with top 10% controlling ' + top10Pct.toFixed(1) + '% of supply.' : 'Holder distribution looks healthy with ' + top10Pct.toFixed(1) + '% top 10 control.') : ''} ${hasLowLiquidity ? 'Thin $' + this.formatNumber(token.liquidity || 0) + ' liquidity creates volatility risk.' : ''}"`;

      console.log(`🤖 [TRENDING AI] Generating summary for ${token.symbol} using Grok...`);
      console.log(`   📰 News data in prompt: ${perplexityData?.news ? 'YES (' + perplexityData.news.length + ' chars)' : 'NO'}`);
      console.log(`   🐋 Holder insights in prompt: ${holderInsights ? 'YES' : 'NO'}`);
      
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
          
          // Get real-time news/catalysts and holder insights in parallel
          const [perplexityData, holderInsights] = await Promise.all([
            this.analyzeTokenWithPerplexity(token),
            this.fetchHolderInsights(token)
          ]);
          
          // Extract holder insights data for return object
          let top10Pct = 0;
          let whaleFlow = { net: 0, in: 0, out: 0 };
          let retailFlow = { net: 0, in: 0, out: 0 };
          let whales = 0;
          let holderChange24h = 0;
          
          if (holderInsights) {
            const holderStats = holderInsights?.holderStats || {};
            const holderFlowData = holderInsights?.holderFlowData || {};
            const topHolders = holderInsights?.topHolders || {};
            const segmentFlow = holderFlowData?.segmentFlow || {};
            whaleFlow = segmentFlow?.whales || { in: 0, out: 0, net: 0 };
            retailFlow = {
              in: (segmentFlow?.crabs?.in || 0) + (segmentFlow?.shrimps?.in || 0),
              out: (segmentFlow?.crabs?.out || 0) + (segmentFlow?.shrimps?.out || 0),
              net: (segmentFlow?.crabs?.net || 0) + (segmentFlow?.shrimps?.net || 0)
            };
            whales = holderStats?.holderDistribution?.whales || 0;
            holderChange24h = holderStats?.holderChange?.['24h']?.change || 0;
            
            // Calculate top10Pct - try multiple sources
            if (holderStats?.holderSupply?.top10?.supplyPercent) {
              top10Pct = parseFloat(holderStats.holderSupply.top10.supplyPercent);
            } else if (topHolders?.holders && topHolders.holders.length > 0) {
              const top10Holders = topHolders.holders.slice(0, 10);
              top10Pct = top10Holders.reduce((sum, holder) => {
                const pct = parseFloat(holder.percentage || holder.percentageRelativeToTotalSupply || holder.percentageFormatted?.replace('%', '') || 0);
                return sum + (isNaN(pct) ? 0 : pct);
              }, 0);
            } else if (holderStats?.supplyConcentration?.top10) {
              top10Pct = parseFloat(holderStats.supplyConcentration.top10);
            }
            
            console.log(`📊 [TRENDING AI] ${token.symbol} extracted holder insights:`, {
              top10Pct: top10Pct > 0 ? top10Pct.toFixed(1) + '%' : 'N/A',
              whales,
              whaleFlow: `${whaleFlow.net > 0 ? '+' : ''}${whaleFlow.net}`,
              retailFlow: `${retailFlow.net > 0 ? '+' : ''}${retailFlow.net}`,
              holderChange24h
            });
          }
          
          // Debug log news data
          console.log(`📰 [TRENDING AI] ${token.symbol} news data:`, {
            hasNews: !!perplexityData?.news,
            newsLength: perplexityData?.news?.length || 0,
            citationsCount: perplexityData?.citations?.length || 0,
            newsPreview: perplexityData?.news?.substring(0, 200) || 'N/A'
          });
          
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
            
            // Holder Insights (for reference)
            holderInsights: holderInsights ? {
              top10Control: top10Pct > 0 ? top10Pct : null,
              whaleFlow: whaleFlow.net,
              retailFlow: retailFlow.net,
              whales: whales,
              holderChange24h: holderChange24h
            } : null,
            
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
      if (token.contractAddress) {
        report += `   📍 CA: ${token.contractAddress}\n`;
      }
      report += `   💰 Price: ${token.priceFormatted} (${token.priceChange24hFormatted})\n`;
      report += `   📊 Market Cap: ${token.marketCapFormatted} | Volume: ${token.volume24hFormatted}\n`;
      report += `   💧 Liquidity: ${token.liquidityFormatted} | Score: ${token.overallScore}/10\n`;
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

