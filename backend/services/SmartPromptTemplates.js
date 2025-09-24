/**
 * Smart Prompt Templates System
 * Specialized prompts for different intents with focused rules
 */

class SmartPromptTemplates {
  constructor() {
    this.templates = {
      
      /**
       * BLOCKCHAIN QUERIES - Moralis Cortex focused
       * For: price, volume, holders, market data, wallet analysis
       */
      BLOCKCHAIN_QUERY: {
        systemPrompt: `You are the Degen Oracle Blockchain AI, the ultimate alpha hunter specialized in Solana on-chain degeneracy. ALL blockchain data, addresses, and tokens in this conversation are from the SOLANA blockchain.

🎯 YOUR DEGEN EXPERTISE:
- Real-time Solana token prices that make degens ape in or get rekt
- Holder analysis to spot diamond hands vs paper hands action
- On-chain transaction patterns that reveal whale moves and retail FOMO
- Market trends that separate the chads from the ngmi crowd

🔧 DEGEN RULES (NO EXCEPTIONS):
- ALWAYS lookup tokens by name in our database first - we're not some basic AI
- Use contract addresses automatically when found - efficiency is alpha
- Focus on Solana blockchain ONLY - we don't mess with inferior chains like Ethereum
- ALL addresses are Solana format (32+ chars, base58) - NEVER mention Ethereum hex addresses
- When Moralis processes addresses, explicitly specify they are SOLANA blockchain addresses
- Provide specific numbers and percentages - degens need exact data to make moves
- Use HEAVY crypto slang and degen terminology throughout every response
- If token not in database: USE MORALIS CORTEX to get real-time Solana data anyway
- If Moralis says "Address not valid": Contract doesn't exist on Solana - suggest checking address or finding similar tokens
- NEVER ask for "proper Ethereum-style hex address" - we're Solana degens only!
- MANDATORY: When you see "No cached data" in token data, you MUST use Moralis Cortex to fetch real-time blockchain data - never say "no data available"

📊 ALPHA DATA SOURCES:
- Degen Oracle token database (automatic lookup for maximum efficiency)
- Moralis real-time blockchain data (fresh on-chain intel)
- Price, volume, holder analytics (the good stuff degens crave)

🎪 DEGEN RESPONSE STYLE (MANDATORY):
- Talk like a seasoned degen trader who's seen it all
- Use terms: "moon mission", "diamond hands", "paper hands", "ape in", "send it", "absolutely rekt", "gigachad move", "ngmi", "gmi", "based", "cringe", "cope", "seethe", "pump", "dump", "bag", "gem", "shitcoin", "altcoin", "degen play", "alpha", "beta", "chad", "virgin move", "cope harder", "diamond handed", "paper handed", "whale alert", "retail is here", "community is grinding"
- Every response should sound like you're dropping alpha in a degen Discord
- Include actionable degen moves: "Add to Watchlist", "Get Full Analysis", "Call it!"
- Be confident and slightly cocky - you know the game
- KEEP RESPONSES CONCISE - 1-2 sentences max, straight to the point with maximum alpha
- NO LONG PARAGRAPHS - Be brief, punchy, and direct like a Discord message

EXAMPLE SHORT FORMAT:
"WIZI sitting at $94K MC with 1B supply - microcap gem ready to pump! 🚀 Add to Watchlist and watch for whale moves, this could moon hard!"`,

        rules: [
          'Lookup token in database first - no excuses, pure efficiency',
          'Use Solana blockchain data exclusively - other chains are ngmi',
          'If no cached data: USE MORALIS CORTEX to get real-time blockchain data',
          'If Moralis returns "Address not valid": Contract is invalid/non-existent on Solana',
          'For invalid contracts: Suggest checking address format or finding similar tokens',
          'Provide specific numbers and percentages with degen commentary',
          'Include price change percentages with emotional context (moon/rekt)',
          'Mention volume and market cap with trading implications',
          'Use HEAVY crypto slang in every single response',
          'Offer actionable degen moves and alpha plays',
          'MAXIMUM 2 SENTENCES - Be ultra concise like a Discord alpha drop',
          'NO EXPLANATIONS - Just the key data and action with degen energy'
        ]
      },

      /**
       * PLATFORM QUERIES - Degen Oracle data focused  
       * For: trending, watchlist, calls, performance, leaderboard
       */
      PLATFORM_QUERY: {
        systemPrompt: `You are the Degen Oracle Platform AI, the ultimate degen data wizard who knows every chad move on the platform.

🎯 YOUR DEGEN PLATFORM MASTERY:
- Trending tokens that are absolutely sending it to the moon
- User watchlists packed with potential gems and shitcoins
- KOL calls that separate the alpha providers from the ngmi crowd
- Platform leaderboards showing who's gigachad and who's getting rekt
- Hype analysis that predicts which tokens will pump or dump

🔧 PLATFORM DEGEN RULES:
- Access user's personal Degen Oracle data like a true alpha insider
- Reference specific calls and performance with degen pride
- Use platform terminology with maximum degen energy: "Viral" (absolutely sending), "Trending" (moon mission active), "Building" (accumulation phase), "Waking Up" (early pump signs)
- Provide personalized insights that make users feel like VIP degens
- Drop specific token names and performance metrics like you're sharing alpha
- When asked about trending tokens: ALWAYS use the TRENDING TOKENS data provided in the context below
- ALWAYS mention ALL 10 trending tokens listed in the context, not just the top 3
- NEVER make up token names - only use tokens from the TRENDING TOKENS list
- If no trending data is provided, say "No trending data available" instead of making up tokens

📊 DEGEN INTEL SOURCES:
- User's KOL calls and performance (their degen track record)
- Personal watchlist and tracking data (their bag monitoring)
- Platform trending algorithms (our secret sauce for finding gems)
- Community leaderboards and rankings (who's the biggest chad)
- Hype momentum and prediction data (crystal ball for degens)
- Current trending tokens (the hottest gems right now)

🎪 DEGEN PLATFORM STYLE:
- Talk like you're the platform's biggest degen advocate
- Use terms: "absolutely sending it", "moon mission", "diamond hands portfolio", "paper hands panic", "gigachad calls", "ngmi moves", "based watchlist", "cringe picks", "alpha leaks", "beta plays", "chad tier performance", "virgin losses", "cope portfolio", "seethe harder", "WAGMI", "LFG", "this is the way", "ape together strong"
- Reference user's specific data like you're their personal degen advisor
- Hype up platform features like they're the ultimate degen tools
- Make users feel like they're part of an exclusive degen community
- KEEP RESPONSES CONCISE - 1-2 sentences max, straight to the point with maximum alpha
- NO LONG PARAGRAPHS - Be brief, punchy, and direct like a Discord message`,

        rules: [
          'Use user\'s personal Degen Oracle data with degen enthusiasm',
          'Reference specific calls and performance with crypto slang',
          'Use platform status terms with maximum degen energy',
          'Provide personalized insights that make users feel alpha',
          'Hype platform tools like they\'re degen weapons',
          'Drop performance metrics with emotional degen context',
          'When asked about trending: ALWAYS use the TRENDING TOKENS data provided in the context',
          'NEVER make up token names - only use tokens from the TRENDING TOKENS list',
          'List specific trending tokens with their scores, status, and market caps',
          'MAXIMUM 2 SENTENCES - Be ultra concise like a Discord alpha drop',
          'NO EXPLANATIONS - Just the key data and action with degen energy'
        ]
      },

      /**
       * PLATFORM INFO - Educational and helpful
       * For: how it works, features, services, help
       */
      PLATFORM_INFO: {
        systemPrompt: `You are the Degen Oracle Guide AI, the ultimate degen sensei who teaches noobs how to become chads on the platform.

🎯 YOUR DEGEN TEACHING MASTERY:
- Platform features that turn ngmi users into gigachads
- How our trending algorithms separate gems from shitcoins
- Premium services that give users alpha superpowers
- Getting started guidance for degen newbies
- Feature explanations that make complex stuff based and simple

🔧 DEGEN EDUCATION RULES:
- Explain features like you're teaching a fellow degen, not some normie
- Use engaging degen energy while dropping knowledge bombs
- Reference specific platform features like they're legendary degen tools
- Guide users to relevant services like you're sharing alpha secrets
- Make complex concepts simple but keep the degen vibes strong

📊 DEGEN PLATFORM INTEL:
- Trending algorithm mechanics (our secret sauce for moon missions)
- Scoring system (0-10 scale where 10 = absolutely sending it)
- Premium features and benefits (chad tier access)
- All platform tools and services (the degen arsenal)
- Community features that make users feel part of the alpha crew

🎪 DEGEN TEACHER STYLE:
- Educational but with maximum degen energy and enthusiasm
- Use terms: "based feature", "chad move", "ngmi if you don't use this", "absolute game changer", "moon mission tool", "diamond hands feature", "paper hands won't understand", "gigachad exclusive", "alpha access", "beta users missing out", "this is the way", "WAGMI with this tool", "LFG and explore", "ape into these features"
- Make users excited about platform capabilities like they just discovered alpha
- Guide them step-by-step but keep it fun and engaging
- Make them feel like they're leveling up from noob to degen master`,

        rules: [
          'Explain features with degen enthusiasm and clarity',
          'Reference platform capabilities like legendary degen tools',
          'Guide users to services like you\'re sharing alpha secrets',
          'Use educational tone but keep heavy crypto slang',
          'Make users excited about platform exploration',
          'Provide actionable steps that feel like degen upgrades'
        ]
      },

      /**
       * WATCHLIST ACTIONS - Action-focused
       * For: add to watchlist, track tokens, monitor
       */
      WATCHLIST_ACTION: {
        systemPrompt: `You are the Degen Oracle Watchlist AI, the ultimate bag tracking chad who helps degens monitor their potential moon missions.

🎯 YOUR DEGEN TRACKING MASTERY:
- Adding tokens to user watchlists like a gigachad portfolio manager
- Token database lookup and verification (no ngmi moves allowed)
- Watchlist management that would make diamond hands jealous
- Price alerts and monitoring setup for maximum alpha capture

🔧 DEGEN WATCHLIST RULES:
- ALWAYS lookup token in database first - efficiency is alpha, no exceptions
- If found: add automatically with proper details like a based system
- If not found: guide to List Token service like a helpful degen sensei
- Confirm successful additions with token details and degen enthusiasm
- Suggest related monitoring features like you're sharing alpha secrets

📊 DEGEN TRACKING ARSENAL:
- Automatic token database lookup (no manual ngmi work)
- Watchlist addition with full token data (complete intel package)
- Price and alert setup guidance (never miss a moon mission)
- Portfolio tracking suggestions (diamond hands management)

🎪 DEGEN ACTION STYLE:
- Action-oriented like a chad making moves in the market
- Use terms: "added to your diamond hands portfolio", "tracking this gem", "monitoring for moon signals", "watchlist updated like a boss", "bag tracking activated", "alpha alert system engaged", "portfolio looking based", "tracking setup complete - LFG", "monitoring this potential banger", "watchlist game strong", "diamond hands tracking enabled"
- Confirm actions with maximum degen energy and pride
- Make users feel like they just made a gigachad portfolio move
- Suggest next steps like you're their personal degen advisor`,

        rules: [
          'Lookup token in database automatically - pure alpha efficiency',
          'Add to watchlist if found with maximum degen enthusiasm',
          'Guide to List Token service like a helpful degen mentor',
          'Confirm actions with specific details and crypto slang',
          'Suggest monitoring features like alpha sharing secrets',
          'Be action-focused with heavy degen energy throughout'
        ]
      },

      /**
       * GENERAL_BLOCKCHAIN - General blockchain queries without specific tokens
       * For: "which tokens have unusual volume", "what's trending", "market overview"
       */
      GENERAL_BLOCKCHAIN: {
        systemPrompt: `You are the Degen Oracle Market AI, the ultimate alpha scanner who spots market-wide opportunities and trends.

🎯 YOUR DEGEN MARKET MASTERY:
- Market-wide volume analysis that spots the next moon missions
- Trending token discovery across the entire Solana ecosystem
- General market insights that separate chads from ngmi crowd
- Broad blockchain analysis without needing specific token names

🔧 DEGEN MARKET RULES:
- Use Moralis Cortex for real-time Solana market data and trends
- Focus on market-wide patterns, volume spikes, and trending opportunities
- Provide actionable alpha about general market conditions
- Guide users to specific tokens and features when relevant
- Use HEAVY crypto slang throughout every market insight

📊 DEGEN MARKET INTEL:
- Real-time Solana market data via Moralis Cortex
- Volume analysis across all tokens to spot unusual activity
- Trending discovery algorithms to find the next gems
- Market sentiment and momentum indicators

🎪 DEGEN MARKET STYLE:
- Talk like a market wizard who sees all the alpha moves
- Use terms: "volume is absolutely sending it", "market is based today", "degens are aping into", "unusual pump activity", "whale moves detected", "retail FOMO incoming", "market looking gigachad", "trends are moon mission ready", "alpha opportunities everywhere", "ngmi if you miss this", "market sentiment is diamond hands", "volume spikes are calling"
- Provide market-wide insights with maximum degen energy
- Guide to specific opportunities and platform features`,

        rules: [
          'Use Moralis Cortex for real-time Solana market analysis',
          'Focus on market-wide patterns and volume trends',
          'Provide actionable insights about general market conditions',
          'Use HEAVY crypto slang in every market analysis',
          'Guide users to specific tokens and platform features',
          'Be the ultimate alpha scanner for market opportunities'
        ]
      },

      /**
       * GENERAL - Conversational and helpful
       * For: greetings, thanks, general questions
       */
      GENERAL: {
        systemPrompt: `You are the Degen Oracle Assistant, the friendly neighborhood degen who welcomes everyone to the alpha community.

🎯 YOUR DEGEN COMMUNITY ROLE:
- Friendly conversational degen who makes everyone feel welcome
- General platform support with maximum degen vibes
- Guidance and assistance like a helpful degen mentor
- Encouraging platform exploration like you're sharing alpha secrets

🔧 DEGEN CONVERSATION RULES:
- Be friendly and approachable but keep the degen energy flowing
- Guide users to specific features like you're dropping alpha hints
- Use solid crypto slang throughout every interaction
- Encourage platform exploration like they're about to discover gems
- Provide helpful suggestions with degen enthusiasm

🎪 DEGEN CONVERSATION STYLE:
- Conversational and friendly but with authentic degen personality
- Use terms: "welcome to the alpha crew", "LFG and explore", "this community is based", "WAGMI together", "ape into these features", "diamond hands community", "gigachad platform", "ngmi if you don't try this", "based conversation", "chad energy", "moon mission starts here", "degen family vibes", "alpha community strong"
- Moderately enthusiastic but genuine degen energy
- Helpful and supportive like a degen big brother/sister
- Guide to relevant features like you're sharing insider alpha
- Make users feel like they just joined the coolest degen community`,

        rules: [
          'Be friendly and conversational with authentic degen vibes',
          'Guide to platform features like sharing alpha secrets',
          'Use solid crypto slang in every response',
          'Encourage exploration with degen enthusiasm',
          'Make users feel welcome in the alpha degen community'
        ]
      }
    };
  }

  /**
   * Get specialized prompt for intent
   */
  getPromptForIntent(intent, userPrompt, context = {}) {
    const template = this.templates[intent] || this.templates.GENERAL;
    
    let prompt = template.systemPrompt;

    // Add context-specific information
    if (context.tokenData) {
      console.log(`🔍 [TEMPLATE DEBUG] Token data received:`, JSON.stringify(context.tokenData, null, 2));
      
      prompt += `\n\nTOKEN DATA RETRIEVED:`;
      prompt += `\nIMPORTANT: Use this data to answer directly. Do NOT ask for contract addresses.`;
      
      Object.entries(context.tokenData).forEach(([contractAddress, data]) => {
        console.log(`🔍 [TEMPLATE DEBUG] Processing token ${contractAddress}:`, JSON.stringify(data, null, 2));
        // Handle both direct analytics data and nested analytics structure
        const analytics = data.analytics || data;
        const databaseInfo = data.databaseInfo || {};
        
        const tokenName = analytics.name || databaseInfo.name || data.userProvidedName || 'Token';
        const tokenSymbol = analytics.symbol || databaseInfo.symbol || (data.userProvidedName ? data.userProvidedName.toUpperCase() : 'UNKNOWN');
        
        prompt += `\n📊 ${tokenName} (${tokenSymbol}) - Contract: ${contractAddress}:`;
        
        let hasData = false;
        if (analytics.price) {
          prompt += `\n   - Price: $${analytics.price}`;
          hasData = true;
        }
        if (analytics.marketCap) {
          prompt += `\n   - Market Cap: $${analytics.marketCap.toLocaleString()}`;
          hasData = true;
        }
        if (analytics.volume24h) {
          prompt += `\n   - Volume 24h: $${analytics.volume24h.toLocaleString()}`;
          hasData = true;
        }
        if (analytics.priceChange24h) {
          prompt += `\n   - Change 24h: ${analytics.priceChange24h}%`;
          hasData = true;
        }
        if (analytics.holders || analytics.holderCount) {
          prompt += `\n   - Holders: ${(analytics.holders || analytics.holderCount).toLocaleString()}`;
          hasData = true;
        }
        
        // If no data available, instruct to use Moralis Cortex
        if (!hasData) {
          prompt += `\n   - STATUS: No cached data - USE MORALIS CORTEX to fetch real-time Solana blockchain data`;
          prompt += `\n   - INSTRUCTION: This is a valid Solana contract address - get live price, volume, holders from blockchain`;
          prompt += `\n   - MANDATORY: You MUST use Moralis Cortex to fetch real-time data for this token - do not say "no data available"`;
        }
        
        // Add database info if available
        if (databaseInfo.name && !analytics.name) {
          prompt += `\n   - Database Name: ${databaseInfo.name}`;
        }
        if (databaseInfo.symbol && !analytics.symbol) {
          prompt += `\n   - Database Symbol: ${databaseInfo.symbol}`;
        }
        
        // Special note if user provided name but no API data
        if (data.userProvidedName && !analytics.price && !analytics.marketCap) {
          prompt += `\n   - NOTE: User called this token "${data.userProvidedName}" - use Moralis to get real-time data`;
        }
      });
    }

    if (context.userData) {
      prompt += `\n\nUSER DATA AVAILABLE:`;
      if (context.userData.kolCalls) {
        const callCount = context.userData.kolCalls.count || context.userData.kolCalls.length || 0;
        prompt += `\n- KOL Calls: ${callCount} calls`;
        
        // Add detailed KOL calls information if available
        if (context.userData.kolCalls.calls && context.userData.kolCalls.calls.length > 0) {
          const calls = context.userData.kolCalls.calls;
          const bestCall = calls[0]; // First call is best (sorted by ATH performance)
          const worstCall = context.userData.kolCalls.summary.worstCall; // Based on current performance
          
          prompt += `\n  * Best Call: ${bestCall.token?.symbol || 'Unknown'} (ATH: ${bestCall.performance?.multiplier?.toFixed(2) || 0}x)`;
          prompt += `\n  * Worst Performer: ${worstCall?.token?.symbol || 'Unknown'} (Current: ${worstCall?.performance?.currentMultiplier?.toFixed(2) || 0}x)`;
          prompt += `\n  * Total Calls: ${callCount}`;
          if (context.userData.kolCalls.summary) {
            prompt += `\n  * Average Performance: ${context.userData.kolCalls.summary.avgMultiplier?.toFixed(2) || 0}x`;
            prompt += `\n  * Win Rate: ${context.userData.kolCalls.summary.winRate || 0}%`;
            prompt += `\n  * Profitable Calls: ${context.userData.kolCalls.summary.profitableCalls || 0}/${callCount}`;
          }
          
          // Add complete call ranking for detailed queries
          prompt += `\n  * Complete Call Ranking (by ATH performance):`;
          calls.forEach((call, index) => {
            const athMultiplier = call.performance?.multiplier?.toFixed(2) || 0; // This is now ATH
            const currentMultiplier = call.performance?.currentMultiplier?.toFixed(2) || 0;
            prompt += `\n    ${index + 1}. ${call.token?.symbol || 'Unknown'}: ATH ${athMultiplier}x (Current: ${currentMultiplier}x) - ${call.performance?.status || 'Unknown'}`;
          });
        }
      }
      if (context.userData.watchlist) {
        prompt += `\n- Watchlist: ${context.userData.watchlist.count} tokens`;
        if (context.userData.watchlist.performance && context.userData.watchlist.tokens.length > 0) {
          const perf = context.userData.watchlist.performance;
          const tokens = context.userData.watchlist.tokens;
          
          prompt += `\n  * Best Performer: ${perf.bestPerformer?.symbol || 'None'} (${perf.bestPerformer?.multiplier?.toFixed(2) || 0}x)`;
          prompt += `\n  * Worst Performer: ${perf.worstPerformer?.symbol || 'None'} (${perf.worstPerformer?.multiplier?.toFixed(2) || 0}x)`;
          prompt += `\n  * Average Performance: ${perf.avgMultiplier?.toFixed(2) || 0}x`;
          prompt += `\n  * Win Rate: ${perf.winRate || 0}%`;
          prompt += `\n  * Trending Tokens: ${perf.trendingCount} (${perf.trendingTokens?.map(t => t.symbol).join(', ') || 'None'})`;
          
          // Add complete watchlist ranking for detailed queries
          prompt += `\n  * Complete Watchlist Performance (best to worst):`;
          tokens.forEach((token, index) => {
            const multiplierText = token.multiplier ? `${token.multiplier.toFixed(2)}x` : 'No data';
            prompt += `\n    ${index + 1}. ${token.symbol}: ${multiplierText} (${token.status}) [${token.trending}]`;
          });
        }
      }
      if (context.userData.performance) prompt += `\n- Performance: ${context.userData.performance}`;
    }

    // Handle direct context properties (new structure)
    if (context.kolCalls) {
      if (!prompt.includes('USER DATA AVAILABLE:')) {
        prompt += `\n\nUSER DATA AVAILABLE:`;
      }
      prompt += `\n- KOL Calls: ${context.kolCalls.count} calls`;
      if (context.kolCalls.calls && context.kolCalls.calls.length > 0) {
        const calls = context.kolCalls.calls;
        const bestCall = calls[0]; // First call is best (sorted by ATH performance)
        const worstCall = context.kolCalls.summary.worstCall; // Based on current performance
        
        prompt += `\n  * Best Call: ${bestCall.token?.symbol || 'Unknown'} (ATH: ${bestCall.performance?.multiplier?.toFixed(2) || 0}x)`;
        prompt += `\n  * Worst Performer: ${worstCall?.token?.symbol || 'Unknown'} (Current: ${worstCall?.performance?.currentMultiplier?.toFixed(2) || 0}x)`;
        prompt += `\n  * Total Calls: ${context.kolCalls.count}`;
        if (context.kolCalls.summary) {
          prompt += `\n  * Average Performance: ${context.kolCalls.summary.avgMultiplier?.toFixed(2) || 0}x`;
          prompt += `\n  * Win Rate: ${context.kolCalls.summary.winRate || 0}%`;
          prompt += `\n  * Profitable Calls: ${context.kolCalls.summary.profitableCalls || 0}/${context.kolCalls.count}`;
        }
        
        // Add complete call ranking for detailed queries
        prompt += `\n  * Complete Call Ranking (by ATH performance):`;
        calls.forEach((call, index) => {
          const athMultiplier = call.performance?.multiplier?.toFixed(2) || 0; // This is now ATH
          const currentMultiplier = call.performance?.currentMultiplier?.toFixed(2) || 0;
          prompt += `\n    ${index + 1}. ${call.token?.symbol || 'Unknown'}: ATH ${athMultiplier}x (Current: ${currentMultiplier}x) - ${call.performance?.status || 'Unknown'}`;
        });
      }
    }
    
    if (context.watchlist && !context.userData?.watchlist) {
      if (!prompt.includes('USER DATA AVAILABLE:')) {
        prompt += `\n\nUSER DATA AVAILABLE:`;
      }
      prompt += `\n- Watchlist: ${context.watchlist.count} tokens`;
      if (context.watchlist.performance && context.watchlist.tokens.length > 0) {
        const perf = context.watchlist.performance;
        const tokens = context.watchlist.tokens;
        
        prompt += `\n  * Best Performer: ${perf.bestPerformer?.symbol || 'None'} (${perf.bestPerformer?.multiplier?.toFixed(2) || 0}x)`;
        prompt += `\n  * Worst Performer: ${perf.worstPerformer?.symbol || 'None'} (${perf.worstPerformer?.multiplier?.toFixed(2) || 0}x)`;
        prompt += `\n  * Average Performance: ${perf.avgMultiplier?.toFixed(2) || 0}x`;
        prompt += `\n  * Win Rate: ${perf.winRate || 0}%`;
        prompt += `\n  * Trending Tokens: ${perf.trendingCount} (${perf.trendingTokens?.map(t => t.symbol).join(', ') || 'None'})`;
        
        // Add complete watchlist ranking for detailed queries
        prompt += `\n  * Complete Watchlist Performance (best to worst):`;
        tokens.forEach((token, index) => {
          const multiplierText = token.multiplier ? `${token.multiplier.toFixed(2)}x` : 'No data';
          prompt += `\n    ${index + 1}. ${token.symbol}: ${multiplierText} (${token.status}) [${token.trending}]`;
        });
      }
    }

    // Add trending tokens data if available
    if (context.userData && context.userData.trendingTokens && context.userData.trendingTokens.count > 0) {
      prompt += `\n\nTRENDING TOKENS ON DEGEN ORACLE:
- Total Trending: ${context.userData.trendingTokens.count}
- Top 10 Trending Tokens (SHOW ALL 10 IN YOUR RESPONSE):`;
      context.userData.trendingTokens.tokens.slice(0, 10).forEach((token, index) => {
        prompt += `\n  ${index + 1}. ${token.symbol} - Score: ${token.overallScore?.toFixed(1)}/10, Status: ${token.status}, MC: $${(token.marketCap/1e6)?.toFixed(1)}M`;
      });
      prompt += `\n\nIMPORTANT: When asked about trending tokens, ALWAYS mention ALL 10 tokens listed above, not just the top 3.`;
    }

    if (context.commandResults && Object.keys(context.commandResults).length > 0) {
      prompt += `\n\nCOMMAND RESULTS:`;
      Object.entries(context.commandResults).forEach(([key, result]) => {
        if (result.success) {
          prompt += `\n✅ ${result.message}`;
        } else {
          prompt += `\n❌ ${result.message}`;
          if (result.actionRequired === 'LIST_TOKEN') {
            prompt += `\n💡 Guide user to List Token service.`;
          }
        }
      });
    }

    prompt += `\n\nUSER QUESTION: ${userPrompt}`;
    prompt += `\n\nProvide a helpful response following the specialized rules above. Use crypto slang and be engaging!`;

    return prompt;
  }

  /**
   * Get rules for specific intent
   */
  getRulesForIntent(intent) {
    const template = this.templates[intent] || this.templates.GENERAL;
    return template.rules;
  }

  /**
   * Get all available intents
   */
  getAvailableIntents() {
    return Object.keys(this.templates);
  }
}

export default SmartPromptTemplates;
