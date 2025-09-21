import HybridDatabaseService from '../hybridDatabaseService.js';

/**
 * Moralis AI Chat Service - Integrates Moralis AI with user-specific Degen Oracle data
 * Provides personalized AI assistance with access to user's KOL calls, watchlist, hype data, etc.
 */
class MoralisAIChatService {
  constructor() {
    this.db = new HybridDatabaseService();
    this.moralisApiKey = process.env.MORALIS_API_KEY;
    this.apiUrl = 'https://cortex-api.moralis.io/chat';
    
    if (!this.moralisApiKey) {
      console.warn('⚠️ MORALIS_API_KEY not found in environment variables');
    }
  }

  /**
   * Main chat method - processes user question with personalized context
   */
  async chat(userId, userPrompt, conversationHistory = []) {
    try {
      console.log(`🤖 AI Chat request from user ${userId}: "${userPrompt.substring(0, 100)}..."`);

      // Analyze the prompt to determine what user data to include
      const dataNeeds = this.analyzePromptDataNeeds(userPrompt);
      console.log(`🔍 Data needs identified:`, dataNeeds);

      // Gather relevant user data based on the prompt
      const userContext = await this.gatherUserContext(userId, dataNeeds);
      console.log(`📊 User context gathered: ${Object.keys(userContext).join(', ')}`);

      // Build the enhanced prompt with user context
      const enhancedPrompt = this.buildEnhancedPrompt(userPrompt, userContext, conversationHistory);

      // Call Moralis AI
      const aiResponse = await this.callMoralisAI(enhancedPrompt);

      // Process and format the response
      const formattedResponse = this.formatAIResponse(aiResponse, userContext);

      return {
        success: true,
        response: formattedResponse,
        userContext: userContext,
        dataUsed: Object.keys(userContext),
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('❌ AI Chat error:', error);
      return {
        success: false,
        error: error.message,
        fallbackResponse: this.getFallbackResponse(userPrompt),
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
      kolCalls: false,
      watchlist: false,
      hypeData: false,
      milestones: false,
      leaderboard: false,
      tokenPrices: false,
      userStats: false
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

    // Token prices (always useful for crypto questions)
    if (lowerPrompt.includes('price') || lowerPrompt.includes('$') ||
        lowerPrompt.includes('market cap') || lowerPrompt.includes('mcap') ||
        lowerPrompt.includes('volume')) {
      needs.tokenPrices = true;
    }

    // User stats
    if (lowerPrompt.includes('my') || lowerPrompt.includes('i have') ||
        lowerPrompt.includes('how many') || lowerPrompt.includes('total')) {
      needs.userStats = true;
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
  buildEnhancedPrompt(userPrompt, userContext, conversationHistory) {
    let systemContext = `You are the Degen Oracle AI Assistant, a specialized crypto AI with access to this user's personal Degen Oracle data. You can answer questions about their portfolio, calls, watchlist, and performance.

IMPORTANT GUIDELINES:
- Always be helpful, accurate, and use crypto slang appropriately
- When referencing user data, be specific with numbers and details
- If asked about comparisons with other users, explain that you only have access to this user's data
- For general crypto questions, use your blockchain knowledge
- For user-specific questions, use the provided context data

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
      throw new Error('Moralis API key not configured');
    }

    const options = {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json',
        'Moralis-API-Key': this.moralisApiKey
      },
      body: JSON.stringify({
        prompt: prompt,
        model: 'gpt-4o-mini', // Updated model name
        stream: false
      })
    };

    const response = await fetch(this.apiUrl, options);
    
    if (!response.ok) {
      throw new Error(`Moralis AI API error: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Format AI response
   */
  formatAIResponse(aiResponse, userContext) {
    // The Moralis AI response format may vary, adjust as needed
    const content = aiResponse.result || aiResponse.content || aiResponse.message || 'No response received';
    
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
