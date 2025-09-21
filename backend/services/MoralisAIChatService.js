import HybridDatabaseService from '../hybridDatabaseService.js';
import fetch from 'node-fetch';

/**
 * Moralis AI Chat Service - Integrates Moralis AI with user-specific Degen Oracle data
 * Provides personalized AI assistance with access to user's KOL calls, watchlist, hype data, etc.
 * Now includes interactive capabilities: watchlist management, token data fetching, etc.
 */
class MoralisAIChatService {
  constructor(oauthXService = null) {
    this.db = new HybridDatabaseService();
    this.oauthXService = oauthXService; // Optional injection for watchlist operations
    this.moralisApiKey = process.env.MORALIS_API_KEY;
    // Back to original endpoint without v1
    this.apiUrl = 'https://cortex-api.moralis.io/chat';
    this.baseApiUrl = process.env.API_BASE_URL || 'https://api.degen-oracle.com';
    
    if (!this.moralisApiKey) {
      console.warn('⚠️ MORALIS_API_KEY not found in environment variables');
    }
  }

  /**
   * Add token to user's watchlist
   */
  async addToWatchlist(userId, contractAddress, tokenSymbol) {
    try {
      console.log(`🔍 Adding ${tokenSymbol} (${contractAddress}) to user ${userId}'s watchlist`);
      
      const watchlistData = {
        contractAddress,
        symbol: tokenSymbol,
        name: tokenSymbol,
        addedAt: new Date().toISOString()
      };

      // Use OAuthXService if available, otherwise use database directly
      if (this.oauthXService) {
        try {
          const result = await this.oauthXService.addToWatchlist(userId, watchlistData);
          console.log(`✅ Successfully added ${tokenSymbol} to watchlist for user ${userId} via OAuthXService`);
          
          return {
            success: true,
            message: `Added ${tokenSymbol} to watchlist`,
            data: watchlistData
          };
        } catch (oauthError) {
          console.error(`❌ OAuthXService error adding to watchlist:`, oauthError);
          // Fall through to database method
        }
      }

      // Fallback to direct database access
      try {
        await this.db.addToWatchlist(userId, watchlistData);
        console.log(`✅ Successfully added ${tokenSymbol} to watchlist for user ${userId} via database`);
        
        return {
          success: true,
          message: `Added ${tokenSymbol} to watchlist`,
          data: watchlistData
        };
      } catch (dbError) {
        console.error(`❌ Database error adding to watchlist:`, dbError);
        throw dbError;
      }
    } catch (error) {
      console.error(`❌ Error adding to watchlist:`, error);
      throw error;
    }
  }

  /**
   * Get comprehensive token data (price, volume, holders)
   */
  async getTokenData(contractAddress) {
    try {
      console.log(`📊 Fetching comprehensive data for token: ${contractAddress}`);
      
      // Fetch from multiple endpoints in parallel
      const [analyticsResponse, holdersResponse] = await Promise.all([
        fetch(`${this.baseApiUrl}/api/token-analytics/${contractAddress}`),
        fetch(`${this.baseApiUrl}/api/holders/${contractAddress}`)
      ]);

      const analytics = analyticsResponse.ok ? await analyticsResponse.json() : null;
      const holders = holdersResponse.ok ? await holdersResponse.json() : null;

      return {
        analytics,
        holders,
        contractAddress
      };
    } catch (error) {
      console.error(`❌ Error fetching token data:`, error);
      return null;
    }
  }

  /**
   * Parse user commands for actions (add to watchlist, get data, etc.)
   */
  parseUserCommands(prompt, userId) {
    const lowerPrompt = prompt.toLowerCase();
    const commands = [];

    // Check for "add to watchlist" commands - including token symbols
    const addWatchlistMatch = lowerPrompt.match(/add\s+([a-z0-9]{32,})\s+to\s+(my\s+)?watchlist/i) ||
                             lowerPrompt.match(/watchlist\s+([a-z0-9]{32,})/i) ||
                             lowerPrompt.match(/add\s+(\w+)\s+to\s+(my\s+)?watchlist/i) ||
                             lowerPrompt.match(/can\s+you\s+add\s+(\w+)\s+to\s+(my\s+)?watchlist/i);
    
    if (addWatchlistMatch) {
      commands.push({
        type: 'ADD_TO_WATCHLIST',
        contractAddress: addWatchlistMatch[1],
        userId
      });
    }

    // Check for token data requests
    const tokenDataMatch = lowerPrompt.match(/(?:price|volume|holders?|data).*?([a-z0-9]{32,})/i) ||
                          lowerPrompt.match(/([a-z0-9]{32,}).*?(?:price|volume|holders?|data)/i);
    
    if (tokenDataMatch) {
      commands.push({
        type: 'GET_TOKEN_DATA',
        contractAddress: tokenDataMatch[1]
      });
    }

    return commands;
  }

  /**
   * Check if we should suggest actions based on the prompt
   */
  shouldSuggestActions(prompt) {
    const lowerPrompt = prompt.toLowerCase();
    
    // Suggest actions for token-related queries
    return lowerPrompt.includes('price') || 
           lowerPrompt.includes('volume') || 
           lowerPrompt.includes('holder') ||
           lowerPrompt.includes('token') ||
           /[a-z0-9]{32,}/i.test(prompt); // Contains contract address
  }

  /**
   * Generate action suggestions based on context
   */
  generateActionSuggestions(prompt, userContext) {
    const suggestions = [];
    
    // Extract contract addresses from prompt
    const contractMatches = prompt.match(/[a-z0-9]{32,}/gi) || [];
    
    for (const contractAddress of contractMatches) {
      // Try to get token symbol from context
      const tokenData = userContext.tokenData?.[contractAddress];
      const symbol = tokenData?.analytics?.symbol || contractAddress.substring(0, 8) + '...';
      
      suggestions.push({
        type: 'ADD_TO_WATCHLIST',
        label: `Add ${symbol} to Watchlist`,
        contractAddress: contractAddress,
        symbol: symbol,
        icon: '⭐'
      });
      
      suggestions.push({
        type: 'GET_FULL_ANALYSIS',
        label: `Get Full Analysis`,
        contractAddress: contractAddress,
        symbol: symbol,
        icon: '📊'
      });
      
      suggestions.push({
        type: 'VIEW_CHART',
        label: `View Price Chart`,
        contractAddress: contractAddress,
        symbol: symbol,
        icon: '📈'
      });
    }
    
    return suggestions.slice(0, 3); // Limit to 3 suggestions
  }

  /**
   * Main chat method - processes user question with personalized context
   */
  async chat(userId, userPrompt, conversationHistory = []) {
    try {
      console.log(`🤖 AI Chat request from user ${userId}: "${userPrompt.substring(0, 100)}..."`);

      // Parse user commands for actions
      const commands = this.parseUserCommands(userPrompt, userId);
      console.log(`🎯 Commands detected:`, commands);

      // Execute commands and gather additional data
      let commandResults = {};
      let additionalTokenData = {};

      for (const command of commands) {
        try {
          if (command.type === 'ADD_TO_WATCHLIST') {
            const identifier = command.contractAddress;
            
            // Check if it's a contract address (32+ chars) or token symbol
            if (identifier.length >= 32) {
              // It's a contract address
              const tokenData = await this.getTokenData(identifier);
              const tokenSymbol = tokenData?.analytics?.symbol || 'Unknown';
              
              const result = await this.addToWatchlist(userId, identifier, tokenSymbol);
              commandResults.watchlistAdded = {
                success: true,
                contractAddress: identifier,
                symbol: tokenSymbol,
                message: `Successfully added ${tokenSymbol} to watchlist!`
              };
            } else {
              // It's likely a token symbol - need contract address
              commandResults.needsContractAddress = {
                success: false,
                symbol: identifier.toUpperCase(),
                message: `I'd love to add ${identifier.toUpperCase()} to your watchlist! However, I need the contract address to do that. Can you provide the contract address for ${identifier.toUpperCase()}?`
              };
            }
          } else if (command.type === 'GET_TOKEN_DATA') {
            const tokenData = await this.getTokenData(command.contractAddress);
            if (tokenData) {
              additionalTokenData[command.contractAddress] = tokenData;
            }
          }
        } catch (error) {
          console.error(`❌ Command execution failed:`, error);
          commandResults[command.type] = {
            success: false,
            error: error.message
          };
        }
      }

      // Analyze the prompt to determine what user data to include
      const dataNeeds = this.analyzePromptDataNeeds(userPrompt);
      console.log(`🔍 Data needs identified:`, dataNeeds);

      // Gather relevant user data based on the prompt
      const userContext = await this.gatherUserContext(userId, dataNeeds);
      console.log(`📊 User context gathered: ${Object.keys(userContext).join(', ')}`);

      // Add additional token data to context
      if (Object.keys(additionalTokenData).length > 0) {
        userContext.tokenData = additionalTokenData;
      }

      // Add command results to context
      if (Object.keys(commandResults).length > 0) {
        userContext.commandResults = commandResults;
      }

      // Build the enhanced prompt with user context
      const enhancedPrompt = this.buildEnhancedPrompt(userPrompt, userContext, conversationHistory, dataNeeds);

      // Call Moralis AI
      const aiResponse = await this.callMoralisAI(enhancedPrompt);

      // Process and format the response
      const formattedResponse = this.formatAIResponse(aiResponse, userContext);

      // Add action suggestions if relevant
      if (commands.length > 0 || this.shouldSuggestActions(userPrompt)) {
        formattedResponse.actionSuggestions = this.generateActionSuggestions(userPrompt, userContext);
      }

      return {
        success: true,
        response: formattedResponse,
        userContext: userContext,
        dataUsed: Object.keys(userContext),
        commandsExecuted: commands,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('❌ AI Chat error:', error);
      
      // Create proper fallback response structure
      const fallbackContent = this.getFallbackResponse(userPrompt);
      
      return {
        success: false,
        error: error.message,
        response: {
          content: fallbackContent.content,
          hasUserData: false,
          dataSourcesUsed: []
        },
        dataUsed: [],
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Analyze user prompt to determine what data to include
   */
  analyzePromptDataNeeds(prompt) {
    const lowerPrompt = prompt.toLowerCase();
    const needs = {
      // Degen Oracle User Data
      kolCalls: false,
      watchlist: false,
      hypeData: false,
      milestones: false,
      leaderboard: false,
      userStats: false,
      
      // Moralis Blockchain Data (via Cortex AI)
      tokenPrices: false,
      marketData: false,
      blockchainAnalysis: false,
      defiData: false,
      nftData: false,
      
      // Data source priority
      primarySource: 'general', // 'user', 'blockchain', 'general'
      confidence: 0.5
    };

    // KOL Calls related keywords
    if (lowerPrompt.includes('call') || lowerPrompt.includes('profitable') || 
        lowerPrompt.includes('performance') || lowerPrompt.includes('multiplier') ||
        lowerPrompt.includes('ath') || lowerPrompt.includes('thesis')) {
      needs.kolCalls = true;
    }

    // Watchlist related keywords
    if (lowerPrompt.includes('watchlist') || lowerPrompt.includes('watching') ||
        lowerPrompt.includes('bullish') || lowerPrompt.includes('bearish') ||
        lowerPrompt.includes('favorite')) {
      needs.watchlist = true;
    }

    // Hype data related keywords
    if (lowerPrompt.includes('hype') || lowerPrompt.includes('trending') ||
        lowerPrompt.includes('viral') || lowerPrompt.includes('momentum') ||
        lowerPrompt.includes('building')) {
      needs.hypeData = true;
    }

    // Milestones related keywords
    if (lowerPrompt.includes('milestone') || lowerPrompt.includes('achievement') ||
        lowerPrompt.includes('5x') || lowerPrompt.includes('10x') ||
        lowerPrompt.includes('100x') || lowerPrompt.includes('winner')) {
      needs.milestones = true;
    }

    // Leaderboard related keywords
    if (lowerPrompt.includes('leaderboard') || lowerPrompt.includes('ranking') ||
        lowerPrompt.includes('top user') || lowerPrompt.includes('best performer') ||
        lowerPrompt.includes('compare')) {
      needs.leaderboard = true;
    }

    // Moralis Blockchain Data Analysis
    
    // Token prices and market data
    if (lowerPrompt.includes('price') || lowerPrompt.includes('$') ||
        lowerPrompt.includes('market cap') || lowerPrompt.includes('mcap') ||
        lowerPrompt.includes('volume') || lowerPrompt.includes('liquidity')) {
      needs.tokenPrices = true;
      needs.marketData = true;
    }

    // Blockchain analysis keywords
    if (lowerPrompt.includes('whale') || lowerPrompt.includes('holder') ||
        lowerPrompt.includes('transaction') || lowerPrompt.includes('transfer') ||
        lowerPrompt.includes('burn') || lowerPrompt.includes('mint') ||
        lowerPrompt.includes('supply') || lowerPrompt.includes('circulation')) {
      needs.blockchainAnalysis = true;
    }

    // DeFi related keywords
    if (lowerPrompt.includes('defi') || lowerPrompt.includes('yield') ||
        lowerPrompt.includes('farming') || lowerPrompt.includes('staking') ||
        lowerPrompt.includes('pool') || lowerPrompt.includes('swap') ||
        lowerPrompt.includes('dex') || lowerPrompt.includes('liquidity')) {
      needs.defiData = true;
    }

    // NFT related keywords
    if (lowerPrompt.includes('nft') || lowerPrompt.includes('collection') ||
        lowerPrompt.includes('opensea') || lowerPrompt.includes('floor price') ||
        lowerPrompt.includes('mint') || lowerPrompt.includes('rare')) {
      needs.nftData = true;
    }

    // User-specific keywords (Degen Oracle data priority)
    if (lowerPrompt.includes('my') || lowerPrompt.includes('i have') ||
        lowerPrompt.includes('how many') || lowerPrompt.includes('total')) {
      needs.userStats = true;
    }

    // Determine primary data source and confidence
    const userDataCount = [needs.kolCalls, needs.watchlist, needs.hypeData, 
                          needs.milestones, needs.userStats].filter(Boolean).length;
    
    const blockchainDataCount = [needs.tokenPrices, needs.marketData, 
                                needs.blockchainAnalysis, needs.defiData, needs.nftData].filter(Boolean).length;

    // Determine primary source based on keyword analysis
    if (userDataCount > blockchainDataCount) {
      needs.primarySource = 'user';
      needs.confidence = Math.min(0.9, 0.6 + (userDataCount * 0.1));
    } else if (blockchainDataCount > userDataCount) {
      needs.primarySource = 'blockchain';
      needs.confidence = Math.min(0.9, 0.6 + (blockchainDataCount * 0.1));
    } else if (userDataCount === blockchainDataCount && userDataCount > 0) {
      needs.primarySource = 'hybrid';
      needs.confidence = 0.8;
    } else {
      needs.primarySource = 'general';
      needs.confidence = 0.5;
    }

    return needs;
  }

  /**
   * Gather relevant user context based on data needs
   */
  async gatherUserContext(userId, dataNeeds) {
    const context = {};

    try {
      // Get user's KOL calls
      if (dataNeeds.kolCalls || dataNeeds.userStats) {
        const kolCalls = await this.db.getKolCalls(userId);
        context.kolCalls = this.processKolCallsForAI(kolCalls);
      }

      // Get user's watchlist
      if (dataNeeds.watchlist) {
        const watchlist = await this.db.getWatchlist(userId);
        context.watchlist = watchlist || [];
      }

      // Get user's hype list
      if (dataNeeds.hypeData) {
        const hypeList = await this.db.getHypeList(userId);
        context.hypeList = hypeList || [];
      }

      // Get user stats
      if (dataNeeds.userStats) {
        context.userStats = await this.calculateUserStats(userId, context.kolCalls);
      }

      // Get milestone data
      if (dataNeeds.milestones) {
        context.milestones = this.extractMilestoneData(context.kolCalls);
      }

      // Get leaderboard data (if needed)
      if (dataNeeds.leaderboard) {
        // This would require implementing a leaderboard service
        context.leaderboard = { note: 'Leaderboard data not yet implemented' };
      }

    } catch (error) {
      console.error('❌ Error gathering user context:', error);
    }

    return context;
  }

  /**
   * Process KOL calls data for AI consumption
   */
  processKolCallsForAI(kolCalls) {
    if (!Array.isArray(kolCalls) || kolCalls.length === 0) {
      return { count: 0, calls: [] };
    }

    const processedCalls = kolCalls.map(call => ({
      id: call.id,
      token: {
        symbol: call.token?.symbol,
        name: call.token?.name,
        contractAddress: call.token?.contractAddress
      },
      calledAt: call.calledAt,
      calledMc: call.calledMc,
      currentMC: call.currentMC,
      currentMultiplier: call.currentMultiplier,
      athMultiplier: call.athMultiplier,
      status: call.status,
      thesis: call.thesis,
      milestonePosts: call.milestonePosts?.length || 0,
      performance: this.calculateCallPerformance(call)
    }));

    // Sort by performance (best first)
    processedCalls.sort((a, b) => (b.performance.multiplier || 0) - (a.performance.multiplier || 0));

    return {
      count: processedCalls.length,
      calls: processedCalls,
      summary: this.generateCallsSummary(processedCalls)
    };
  }

  /**
   * Calculate individual call performance
   */
  calculateCallPerformance(call) {
    const multiplier = call.currentMultiplier || 0;
    const athMultiplier = call.athMultiplier || 0;
    const milestonesHit = call.milestonePosts?.length || 0;
    
    let status = 'Unknown';
    if (multiplier >= 100) status = 'Legendary (100x+)';
    else if (multiplier >= 50) status = 'Epic (50x+)';
    else if (multiplier >= 20) status = 'Great (20x+)';
    else if (multiplier >= 10) status = 'Good (10x+)';
    else if (multiplier >= 5) status = 'Decent (5x+)';
    else if (multiplier >= 2) status = 'Positive (2x+)';
    else if (multiplier >= 1) status = 'Break Even';
    else status = 'Down';

    return {
      multiplier: multiplier,
      athMultiplier: athMultiplier,
      milestonesHit: milestonesHit,
      status: status,
      profitLoss: multiplier >= 1 ? 'Profit' : 'Loss'
    };
  }

  /**
   * Generate summary of user's calls
   */
  generateCallsSummary(calls) {
    if (calls.length === 0) {
      return { totalCalls: 0, avgMultiplier: 0, bestCall: null, totalMilestones: 0 };
    }

    const totalMultiplier = calls.reduce((sum, call) => sum + (call.performance.multiplier || 0), 0);
    const avgMultiplier = totalMultiplier / calls.length;
    const bestCall = calls[0]; // Already sorted by performance
    const totalMilestones = calls.reduce((sum, call) => sum + call.milestonePosts, 0);
    const profitableCalls = calls.filter(call => call.performance.multiplier >= 1).length;

    return {
      totalCalls: calls.length,
      avgMultiplier: avgMultiplier,
      bestCall: bestCall,
      totalMilestones: totalMilestones,
      profitableCalls: profitableCalls,
      winRate: (profitableCalls / calls.length * 100).toFixed(1)
    };
  }

  /**
   * Calculate comprehensive user stats
   */
  async calculateUserStats(userId, kolCallsData) {
    const stats = {
      totalCalls: kolCallsData?.count || 0,
      avgMultiplier: kolCallsData?.summary?.avgMultiplier || 0,
      bestMultiplier: kolCallsData?.summary?.bestCall?.performance?.multiplier || 0,
      totalMilestones: kolCallsData?.summary?.totalMilestones || 0,
      winRate: kolCallsData?.summary?.winRate || 0
    };

    // Add monthly stats
    try {
      const currentMonth = new Date().toISOString().slice(0, 7);
      stats.callsThisMonth = await this.db.getKolCallsThisMonth(userId);
      stats.hypeViewsThisMonth = await this.db.getHypeViewsThisMonth(userId);
    } catch (error) {
      console.error('Error getting monthly stats:', error);
    }

    return stats;
  }

  /**
   * Extract milestone data from calls
   */
  extractMilestoneData(kolCallsData) {
    if (!kolCallsData?.calls) return { totalMilestones: 0, milestoneBreakdown: {} };

    const milestoneBreakdown = {};
    let totalMilestones = 0;

    kolCallsData.calls.forEach(call => {
      if (call.milestonePosts > 0) {
        totalMilestones += call.milestonePosts;
        // This is simplified - in reality, we'd need to check the actual milestone values
        milestoneBreakdown[call.token.symbol] = call.milestonePosts;
      }
    });

    return {
      totalMilestones,
      milestoneBreakdown,
      callsWithMilestones: Object.keys(milestoneBreakdown).length
    };
  }

  /**
   * Build enhanced prompt with user context
   */
  buildEnhancedPrompt(userPrompt, userContext, conversationHistory, dataNeeds) {
    const primarySource = dataNeeds?.primarySource || 'general';
    const confidence = dataNeeds?.confidence || 0.5;

    let systemContext = `You are the Degen Oracle AI Assistant, a specialized crypto AI with access to both:
1. USER'S PERSONAL DEGEN ORACLE DATA (KOL calls, watchlist, hype data, milestones)
2. REAL-TIME BLOCKCHAIN DATA via Moralis (prices, market caps, transactions, DeFi, NFTs)

DATA SOURCE PRIORITY FOR THIS QUERY:
- Primary Source: ${primarySource.toUpperCase()}
- Confidence: ${(confidence * 100).toFixed(0)}%

RESPONSE GUIDELINES:
- For USER DATA queries (my calls, my watchlist): Use the provided Degen Oracle context
- For BLOCKCHAIN queries (prices, market data): Use your real-time Moralis blockchain knowledge
- For HYBRID queries: Combine both data sources intelligently
- Always be specific with numbers and use crypto slang appropriately
- When using user data, reference specific details from the context below
- Keep responses concise and focused - NO logos, URLs, or unnecessary technical details
- For price queries: Just provide the price, percentage change, and brief market context
- Avoid mentioning external links, logo URLs, or technical identifiers unless specifically asked

INTERACTIVE CAPABILITIES:
- I can add tokens to your watchlist when you ask (need contract address)
- I can fetch comprehensive token data (price, volume, holders) in real-time
- I can execute actions based on your requests
- When discussing tokens, I'll offer action suggestions like "Add to Watchlist" or "Get Full Analysis"
- IMPORTANT: For token queries without contract addresses, always ask for the contract address
- Never say "my access plan doesn't support that" - instead ask for more specific information

${primarySource === 'user' ? 'FOCUS: This query is primarily about the user\'s personal Degen Oracle data.' :
  primarySource === 'blockchain' ? 'FOCUS: This query is primarily about blockchain/market data. Use your Moralis knowledge.' :
  primarySource === 'hybrid' ? 'FOCUS: This query combines user data with blockchain data.' :
  'FOCUS: General crypto question. Use your knowledge and any relevant context.'}

USER'S DEGEN ORACLE DATA:`;

    // Add user context sections
    if (userContext.userStats) {
      systemContext += `\n\nUSER STATS:
- Total KOL Calls: ${userContext.userStats.totalCalls}
- Average Multiplier: ${userContext.userStats.avgMultiplier?.toFixed(2)}x
- Best Call Multiplier: ${userContext.userStats.bestMultiplier?.toFixed(2)}x
- Total Milestones Hit: ${userContext.userStats.totalMilestones}
- Win Rate: ${userContext.userStats.winRate}%
- Calls This Month: ${userContext.userStats.callsThisMonth || 0}
- Hype Views This Month: ${userContext.userStats.hypeViewsThisMonth || 0}`;
    }

    if (userContext.kolCalls && userContext.kolCalls.count > 0) {
      systemContext += `\n\nKOL CALLS SUMMARY:
- Total Calls: ${userContext.kolCalls.count}
- Best Performing Call: ${userContext.kolCalls.summary.bestCall?.token?.symbol} (${userContext.kolCalls.summary.bestCall?.performance?.multiplier?.toFixed(2)}x)
- Average Performance: ${userContext.kolCalls.summary.avgMultiplier?.toFixed(2)}x
- Win Rate: ${userContext.kolCalls.summary.winRate}%

TOP 5 CALLS:`;
      
      userContext.kolCalls.calls.slice(0, 5).forEach((call, index) => {
        systemContext += `\n${index + 1}. ${call.token.symbol}: ${call.performance.multiplier?.toFixed(2)}x (${call.performance.status})`;
      });
    }

    if (userContext.watchlist && userContext.watchlist.length > 0) {
      systemContext += `\n\nWATCHLIST: ${userContext.watchlist.map(token => token.symbol || token).join(', ')}`;
    }

    if (userContext.hypeList && userContext.hypeList.length > 0) {
      systemContext += `\n\nHYPE LIST: ${userContext.hypeList.map(token => token.symbol || token).join(', ')}`;
    }

    // Add command results to context
    if (userContext.commandResults) {
      systemContext += `\n\nCOMMAND RESULTS:`;
      Object.entries(userContext.commandResults).forEach(([key, result]) => {
        if (result.success) {
          systemContext += `\n✅ ${result.message}`;
        } else {
          systemContext += `\n❌ ${result.message}`;
        }
      });
    }

    // Add conversation history if available
    if (conversationHistory.length > 0) {
      systemContext += `\n\nCONVERSATION HISTORY:`;
      conversationHistory.slice(-3).forEach((msg, index) => { // Last 3 messages for context
        systemContext += `\n${msg.role}: ${msg.content}`;
      });
    }

    systemContext += `\n\nUSER QUESTION: ${userPrompt}

Please provide a helpful, accurate response using the user's data when relevant. Use crypto slang and be engaging!`;

    return systemContext;
  }

  /**
   * Call Moralis AI API
   */
  async callMoralisAI(prompt) {
    if (!this.moralisApiKey) {
      console.error('❌ MORALIS_API_KEY not found in environment variables');
      console.log('🔍 Available env vars:', Object.keys(process.env).filter(key => key.includes('MORALIS')));
      throw new Error('Moralis API key not configured. Please set MORALIS_API_KEY environment variable.');
    }

    console.log(`🔑 Using Moralis API key: ${this.moralisApiKey.substring(0, 8)}...${this.moralisApiKey.slice(-4)}`);
    console.log(`🌐 Calling Moralis API: ${this.apiUrl}`);

    // Use exact format from working Moralis example
    const requestBody = {
      prompt: prompt,
      model: 'gpt-4.1-mini',
      stream: false
    };

    console.log(`📝 Request body:`, JSON.stringify(requestBody, null, 2));

    const options = {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json',
        'X-API-Key': this.moralisApiKey
      },
      body: JSON.stringify(requestBody)
    };

    const response = await fetch(this.apiUrl, options);
    
    console.log(`📡 Moralis API response status: ${response.status} ${response.statusText}`);
    
    if (!response.ok) {
      let errorDetails = '';
      try {
        const errorBody = await response.text();
        errorDetails = errorBody ? ` - ${errorBody}` : '';
        console.error(`❌ Moralis API error body:`, errorBody);
      } catch (e) {
        console.error('❌ Could not read error response body');
      }
      
      if (response.status === 401) {
        throw new Error(`Moralis API authentication failed. Please check your MORALIS_API_KEY environment variable.${errorDetails}`);
      }
      
      throw new Error(`Moralis AI API error: ${response.status} ${response.statusText}${errorDetails}`);
    }

    const jsonResponse = await response.json();
    console.log(`✅ Moralis API response received:`, JSON.stringify(jsonResponse, null, 2));
    return jsonResponse;
  }

  /**
   * Format AI response
   */
  formatAIResponse(aiResponse, userContext) {
    // The Moralis AI response format may vary, adjust as needed
    const content = aiResponse.text || aiResponse.result || aiResponse.content || aiResponse.message || 'No response received';
    
    return {
      content: content,
      hasUserData: Object.keys(userContext).length > 0,
      dataSourcesUsed: Object.keys(userContext)
    };
  }

  /**
   * Fallback response when AI fails
   */
  getFallbackResponse(userPrompt) {
    return {
      content: "I'm having trouble connecting to my AI brain right now 🧠 But I'm still here to help! Try asking me about your KOL calls, watchlist, or any crypto questions and I'll do my best to assist you.",
      hasUserData: false,
      dataSourcesUsed: []
    };
  }
}

export default MoralisAIChatService;
