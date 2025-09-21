import HybridDatabaseService from '../hybridDatabaseService.js';
import fetch from 'node-fetch';
import crypto from 'crypto';

/**
 * Moralis AI Chat Service - Integrates Moralis AI with user-specific Degen Oracle data
 * Provides personalized AI assistance with access to user's KOL calls, watchlist, hype data, etc.
 * Now includes interactive capabilities: watchlist management, token data fetching, etc.
 */
class MoralisAIChatService {
  constructor(oauthXService = null, backendInstance = null) {
    this.db = new HybridDatabaseService();
    this.oauthXService = oauthXService; // Optional injection for watchlist operations
    this.backendInstance = backendInstance; // Optional injection for internal method calls
    this.moralisApiKey = process.env.MORALIS_API_KEY;
    // Back to original endpoint without v1
    this.apiUrl = 'https://cortex-api.moralis.io/chat';
    this.baseApiUrl = process.env.API_BASE_URL || 'https://api.degen-oracle.com';
    
    if (!this.moralisApiKey) {
      console.warn('⚠️ MORALIS_API_KEY not found in environment variables');
    }
  }

  /**
   * Learn from user conversation to build preferences
   */
  async learnFromConversation(userId, userPrompt, aiResponse) {
    try {
      console.log(`🧠 Learning from conversation for user ${userId}`);
      
      const learningData = this.extractLearningData(userPrompt, aiResponse);
      
      if (Object.keys(learningData).length > 0) {
        await this.updateUserPreferences(userId, learningData);
        console.log(`✅ Updated user preferences:`, learningData);
      }
    } catch (error) {
      console.error('❌ Error learning from conversation:', error);
      // Don't throw - learning is optional
    }
  }

  /**
   * Extract learning data from conversation
   */
  extractLearningData(userPrompt, aiResponse) {
    const lowerPrompt = userPrompt.toLowerCase();
    const learningData = {};

    // Track token interests
    const tokenMatches = userPrompt.match(/[a-z0-9]{32,}/gi) || [];
    if (tokenMatches.length > 0) {
      learningData.tokensDiscussed = tokenMatches;
    }

    // Track trading preferences
    if (lowerPrompt.includes('bullish') || lowerPrompt.includes('moon') || lowerPrompt.includes('pump')) {
      learningData.tradingStyle = 'aggressive';
    } else if (lowerPrompt.includes('safe') || lowerPrompt.includes('conservative') || lowerPrompt.includes('hold')) {
      learningData.tradingStyle = 'conservative';
    }

    // Track interests
    if (lowerPrompt.includes('price') || lowerPrompt.includes('chart')) {
      learningData.interests = (learningData.interests || []).concat(['price_analysis']);
    }
    if (lowerPrompt.includes('holder') || lowerPrompt.includes('whale')) {
      learningData.interests = (learningData.interests || []).concat(['holder_analysis']);
    }
    if (lowerPrompt.includes('volume') || lowerPrompt.includes('trading')) {
      learningData.interests = (learningData.interests || []).concat(['volume_analysis']);
    }

    // Track question types
    if (lowerPrompt.includes('what') || lowerPrompt.includes('how')) {
      learningData.questionTypes = (learningData.questionTypes || []).concat(['educational']);
    }
    if (lowerPrompt.includes('should i') || lowerPrompt.includes('recommend')) {
      learningData.questionTypes = (learningData.questionTypes || []).concat(['advice_seeking']);
    }

    // Track time preferences
    const now = new Date();
    learningData.activeHours = now.getHours();
    learningData.lastInteraction = now.toISOString();

    return learningData;
  }

  /**
   * Update user preferences based on learning data
   */
  async updateUserPreferences(userId, learningData) {
    try {
      // Get existing preferences
      const preferences = await this.getUserPreferences(userId);
      
      // Update token interests
      if (learningData.tokensDiscussed) {
        preferences.tokenInterests = preferences.tokenInterests || [];
        learningData.tokensDiscussed.forEach(token => {
          const existing = preferences.tokenInterests.find(t => t.address === token);
          if (existing) {
            existing.mentions++;
            existing.lastMentioned = new Date().toISOString();
          } else {
            preferences.tokenInterests.push({
              address: token,
              mentions: 1,
              firstMentioned: new Date().toISOString(),
              lastMentioned: new Date().toISOString()
            });
          }
        });
        
        // Keep only top 20 most mentioned tokens
        preferences.tokenInterests = preferences.tokenInterests
          .sort((a, b) => b.mentions - a.mentions)
          .slice(0, 20);
      }

      // Update trading style
      if (learningData.tradingStyle) {
        preferences.tradingStyle = preferences.tradingStyle || {};
        preferences.tradingStyle[learningData.tradingStyle] = 
          (preferences.tradingStyle[learningData.tradingStyle] || 0) + 1;
      }

      // Update interests
      if (learningData.interests) {
        preferences.interests = preferences.interests || {};
        learningData.interests.forEach(interest => {
          preferences.interests[interest] = (preferences.interests[interest] || 0) + 1;
        });
      }

      // Update question types
      if (learningData.questionTypes) {
        preferences.questionTypes = preferences.questionTypes || {};
        learningData.questionTypes.forEach(type => {
          preferences.questionTypes[type] = (preferences.questionTypes[type] || 0) + 1;
        });
      }

      // Update activity patterns
      if (learningData.activeHours !== undefined) {
        preferences.activityPattern = preferences.activityPattern || {};
        const hour = learningData.activeHours;
        preferences.activityPattern[hour] = (preferences.activityPattern[hour] || 0) + 1;
      }

      preferences.lastUpdated = new Date().toISOString();
      preferences.totalInteractions = (preferences.totalInteractions || 0) + 1;

      // Save preferences
      await this.saveUserPreferences(userId, preferences);
      
    } catch (error) {
      console.error('❌ Error updating user preferences:', error);
    }
  }

  /**
   * Get user preferences for learning
   */
  async getUserPreferences(userId) {
    try {
      const preferencesFile = this.db.getUserFile(userId, 'ai_preferences.json');
      return await this.db.readJsonFile(preferencesFile, {
        tokenInterests: [],
        tradingStyle: {},
        interests: {},
        questionTypes: {},
        activityPattern: {},
        totalInteractions: 0,
        createdAt: new Date().toISOString()
      });
    } catch (error) {
      console.error('❌ Error getting user preferences:', error);
      return {};
    }
  }

  /**
   * Save user preferences
   */
  async saveUserPreferences(userId, preferences) {
    try {
      await this.db.ensureUserDir(userId);
      const preferencesFile = this.db.getUserFile(userId, 'ai_preferences.json');
      await this.db.writeJsonFile(preferencesFile, preferences);
    } catch (error) {
      console.error('❌ Error saving user preferences:', error);
    }
  }

  /**
   * Save chat history (up to 3 histories per user)
   */
  async saveChatHistory(userId, chatHistory, title = null) {
    try {
      console.log(`💾 Saving chat history for user ${userId}`);
      
      await this.db.ensureUserDir(userId);
      const chatHistoriesFile = this.db.getUserFile(userId, 'chat_histories.json');
      
      // Get existing histories
      const histories = await this.db.readJsonFile(chatHistoriesFile, []);
      
      // Create new history entry
      const newHistory = {
        id: crypto.randomUUID(),
        title: title || `Chat ${new Date().toLocaleDateString()}`,
        messages: chatHistory,
        createdAt: new Date().toISOString(),
        messageCount: chatHistory.length
      };
      
      // Add to beginning of array
      histories.unshift(newHistory);
      
      // Keep only the latest 3 histories
      const limitedHistories = histories.slice(0, 3);
      
      await this.db.writeJsonFile(chatHistoriesFile, limitedHistories);
      
      console.log(`✅ Saved chat history: ${newHistory.title} (${newHistory.messageCount} messages)`);
      return newHistory;
      
    } catch (error) {
      console.error('❌ Error saving chat history:', error);
      throw error;
    }
  }

  /**
   * Get user's saved chat histories
   */
  async getChatHistories(userId) {
    try {
      const chatHistoriesFile = this.db.getUserFile(userId, 'chat_histories.json');
      return await this.db.readJsonFile(chatHistoriesFile, []);
    } catch (error) {
      console.error('❌ Error getting chat histories:', error);
      return [];
    }
  }

  /**
   * Load specific chat history
   */
  async loadChatHistory(userId, historyId) {
    try {
      const histories = await this.getChatHistories(userId);
      const history = histories.find(h => h.id === historyId);
      
      if (!history) {
        throw new Error('Chat history not found');
      }
      
      console.log(`📖 Loaded chat history: ${history.title} (${history.messageCount} messages)`);
      return history;
      
    } catch (error) {
      console.error('❌ Error loading chat history:', error);
      throw error;
    }
  }

  /**
   * Delete chat history
   */
  async deleteChatHistory(userId, historyId) {
    try {
      const chatHistoriesFile = this.db.getUserFile(userId, 'chat_histories.json');
      const histories = await this.db.readJsonFile(chatHistoriesFile, []);
      
      const filteredHistories = histories.filter(h => h.id !== historyId);
      await this.db.writeJsonFile(chatHistoriesFile, filteredHistories);
      
      console.log(`🗑️ Deleted chat history: ${historyId}`);
      return filteredHistories;
      
    } catch (error) {
      console.error('❌ Error deleting chat history:', error);
      throw error;
    }
  }

  /**
   * Generate personalized suggestions based on user preferences
   */
  async generatePersonalizedSuggestions(userId) {
    try {
      const preferences = await this.getUserPreferences(userId);
      const suggestions = [];

      // Suggest based on token interests
      if (preferences.tokenInterests && preferences.tokenInterests.length > 0) {
        const topToken = preferences.tokenInterests[0];
        suggestions.push(`How is ${topToken.address.substring(0, 8)}... performing today?`);
      }

      // Suggest based on interests
      if (preferences.interests) {
        if (preferences.interests.price_analysis > 0) {
          suggestions.push("Show me price analysis for trending tokens");
        }
        if (preferences.interests.holder_analysis > 0) {
          suggestions.push("What whale movements should I watch?");
        }
        if (preferences.interests.volume_analysis > 0) {
          suggestions.push("Which tokens have unusual volume today?");
        }
      }

      // Suggest based on trading style
      if (preferences.tradingStyle) {
        if (preferences.tradingStyle.aggressive > preferences.tradingStyle.conservative) {
          suggestions.push("What are the highest potential moonshots right now?");
        } else {
          suggestions.push("Show me safe, stable investment opportunities");
        }
      }

      // Default suggestions if no preferences
      if (suggestions.length === 0) {
        suggestions.push(
          "What's my most profitable KOL call?",
          "What is trending on my watchlist?",
          "How many calls I've done so far?",
          "What's on my watchlist?",
          "What is trending on Degen Oracle?",
          "Show me the top trending tokens"
        );
      }

      return suggestions.slice(0, 6); // Return max 6 suggestions
      
    } catch (error) {
      console.error('❌ Error generating personalized suggestions:', error);
      return [
        "What's my most profitable KOL call?",
        "Show me trending tokens",
        "Help me analyze my portfolio"
      ];
    }
  }

  /**
   * Get trending tokens from the backend
   */
  async getTrendingTokens(prompt = '') {
    try {
      // For production efficiency, we'll use internal method if available
      // Otherwise fall back to HTTP request
      if (this.backendInstance && typeof this.backendInstance.getTokensFromCache === 'function') {
        // Internal call - more efficient
        const allTokens = await this.backendInstance.getTokensFromCache();
        
        // Filter for trending tokens (same logic as the API endpoint)
        const trendingTokens = allTokens.filter(token => {
          const overallScore = token.overallScore || 0;
          return overallScore > 7.8 && 
                 !this.backendInstance.isSuspiciousToken(token) && 
                 !this.backendInstance.isRuggedToken(token) && 
                 !this.backendInstance.isExcludedMajorOrStable(token);
        });

        // Sort by overall score (highest first)
        trendingTokens.sort((a, b) => (b.overallScore || 0) - (a.overallScore || 0));
        
        // Extract requested limit from prompt if specified
        const limitMatch = prompt.match(/top\s+(\d+)/i);
        const requestedLimit = limitMatch ? Math.min(parseInt(limitMatch[1]), 50) : 10; // Default 10, max 50 for AI context
        
        // Limit to requested number of trending tokens
        const limitedTrending = trendingTokens.slice(0, requestedLimit);
        
        return {
          success: true,
          count: trendingTokens.length,
          tokens: limitedTrending,
          requestedLimit,
          summary: `Found ${trendingTokens.length} trending tokens with scores >7.8, showing top ${requestedLimit}`
        };
      }
      
      // Fallback to HTTP request
      const apiBaseUrl = process.env.NODE_ENV === 'production' 
        ? 'https://api.degen-oracle.com'
        : process.env.API_BASE_URL || 'http://localhost:3001';
      
      // Extract requested limit from prompt if specified
      const limitMatch = prompt.match(/top\s+(\d+)/i);
      const requestedLimit = limitMatch ? Math.min(parseInt(limitMatch[1]), 50) : 10; // Default 10, max 50 for AI context
      
      const response = await fetch(`${apiBaseUrl}/api/tokens/trending?limit=${requestedLimit}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const tokens = await response.json();
      
      // Process and format for AI consumption
      const trendingData = {
        success: true,
        count: tokens.length,
        requestedLimit,
        tokens: tokens.map(token => ({
          symbol: token.symbol,
          name: token.name,
          contractAddress: token.contractAddress,
          marketCap: token.mcap || token.marketCap,
          price: token.price,
          priceChange24h: token.priceChange24h,
          volume24h: token.volume24h,
          overallScore: token.overallScore,
          status: token.status || this.getStatusFromScore(token.overallScore),
          holders: token.holderCount,
          mentions: token.twitterData?.mentions || 0
        })),
        summary: `Found ${tokens.length} trending tokens with scores >7.8, showing top ${requestedLimit}`,
        timestamp: new Date().toISOString()
      };

      console.log(`✅ Fetched ${trendingData.count} trending tokens for AI context`);
      return trendingData;
      
    } catch (error) {
      console.error('❌ Error fetching trending tokens:', error);
      return {
        error: 'Unable to fetch trending tokens',
        count: 0,
        tokens: []
      };
    }
  }

  /**
   * Get status from overall score
   */
  getStatusFromScore(score) {
    if (score >= 8.5) return 'Viral';
    if (score >= 7.5) return 'Trending';
    if (score >= 6.5) return 'Building';
    if (score >= 5.5) return 'Waking Up';
    return 'Sleeping';
  }

  /**
   * Add token to user's watchlist
   */
  async addToWatchlist(userId, contractAddress, tokenSymbol) {
    try {
      console.log(`🎯 [AI WATCHLIST DEBUG] Starting addToWatchlist process`);
      console.log(`🎯 [AI WATCHLIST DEBUG] UserId: ${userId}`);
      console.log(`🎯 [AI WATCHLIST DEBUG] Contract: ${contractAddress}`);
      console.log(`🎯 [AI WATCHLIST DEBUG] Symbol: ${tokenSymbol}`);
      
      // First, verify token exists in our token cache database
      let tokenExists = false;
      let tokenData = null;
      
      try {
        console.log(`🎯 [AI WATCHLIST DEBUG] Checking if token exists in token cache...`);
        
        // Check if backend instance is available for internal cache lookup
        if (this.backendInstance && typeof this.backendInstance.getTokensFromCache === 'function') {
          const allTokens = await this.backendInstance.getTokensFromCache();
          tokenExists = allTokens.some(token => 
            token.contractAddress === contractAddress || 
            token.contract === contractAddress
          );
          console.log(`🎯 [AI WATCHLIST DEBUG] Token cache check result: ${tokenExists ? 'FOUND' : 'NOT FOUND'}`);
        } else {
          // Fallback: try to fetch token data to verify existence
          tokenData = await this.getTokenData(contractAddress);
          tokenExists = !!(tokenData?.analytics?.symbol);
          console.log(`🎯 [AI WATCHLIST DEBUG] Token data fetch result: ${tokenExists ? 'FOUND' : 'NOT FOUND'}`);
        }
        
        // If token doesn't exist in our system, return error message
        if (!tokenExists) {
          console.log(`❌ [AI WATCHLIST DEBUG] Token ${contractAddress} not found in our database`);
          return {
            success: false,
            error: 'TOKEN_NOT_FOUND',
            message: `This token isn't listed in our database yet. Please use our List Token service to add it first, then I can add it to your watchlist!`,
            contractAddress,
            actionRequired: 'LIST_TOKEN'
          };
        }
        
        // If we haven't fetched token data yet, do it now
        if (!tokenData) {
          tokenData = await this.getTokenData(contractAddress);
          console.log(`🎯 [AI WATCHLIST DEBUG] Complete token data fetched:`, JSON.stringify(tokenData?.analytics, null, 2));
        }
        
      } catch (error) {
        console.error(`❌ [AI WATCHLIST DEBUG] Error verifying token existence:`, error);
        return {
          success: false,
          error: 'VERIFICATION_FAILED',
          message: `I couldn't verify if this token exists in our database. Please try again or use our List Token service to ensure the token is properly added.`,
          contractAddress
        };
      }
      
      // Use complete token data if available, otherwise fallback to provided symbol
      const symbol = tokenData?.analytics?.symbol || tokenSymbol || 'Unknown';
      const name = tokenData?.analytics?.name || tokenData?.analytics?.symbol || tokenSymbol || 'Unknown Token';
      const price = tokenData?.analytics?.price || null;
      const marketCap = tokenData?.analytics?.marketCap || tokenData?.analytics?.mcap || null;
      
      const watchlistData = {
        contractAddress,
        symbol,
        name,
        price,
        marketCap,
        addedAt: new Date().toISOString()
      };
      
      console.log(`🎯 [AI WATCHLIST DEBUG] Enhanced watchlist data prepared:`, JSON.stringify(watchlistData, null, 2));

      // Use OAuthXService if available, otherwise use database directly
      if (this.oauthXService) {
        console.log(`🎯 [AI WATCHLIST DEBUG] Using OAuthXService for watchlist operation`);
        try {
          const result = await this.oauthXService.addToWatchlist(userId, watchlistData);
          console.log(`✅ [AI WATCHLIST DEBUG] Successfully added ${symbol} (${name}) to watchlist for user ${userId} via OAuthXService`);
          console.log(`🎯 [AI WATCHLIST DEBUG] OAuthXService result:`, JSON.stringify(result, null, 2));
          
          return {
            success: true,
            message: `Added ${name} (${symbol}) to watchlist`,
            data: watchlistData
          };
        } catch (oauthError) {
          console.error(`❌ [AI WATCHLIST DEBUG] OAuthXService error adding to watchlist:`, oauthError);
          console.error(`❌ [AI WATCHLIST DEBUG] OAuthXService error stack:`, oauthError.stack);
          // Fall through to database method
        }
      } else {
        console.log(`⚠️ [AI WATCHLIST DEBUG] No OAuthXService available, using database directly`);
      }

      // Fallback to direct database access
      try {
        console.log(`🎯 [AI WATCHLIST DEBUG] Attempting database fallback method`);
        await this.db.addToWatchlist(userId, watchlistData);
        console.log(`✅ [AI WATCHLIST DEBUG] Successfully added ${symbol} (${name}) to watchlist for user ${userId} via database`);
        
        return {
          success: true,
          message: `Added ${name} (${symbol}) to watchlist`,
          data: watchlistData
        };
      } catch (dbError) {
        console.error(`❌ [AI WATCHLIST DEBUG] Database error adding to watchlist:`, dbError);
        console.error(`❌ [AI WATCHLIST DEBUG] Database error stack:`, dbError.stack);
        throw dbError;
      }
    } catch (error) {
      console.error(`❌ [AI WATCHLIST DEBUG] Overall error adding to watchlist:`, error);
      console.error(`❌ [AI WATCHLIST DEBUG] Overall error stack:`, error.stack);
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
   * Extract token references from conversation history
   */
  extractTokenReferencesFromHistory(conversationHistory) {
    const tokenReferences = new Map(); // tokenName -> contractAddress
    
    conversationHistory.forEach(msg => {
      if (msg.role === 'assistant' && msg.content) {
        // Look for patterns like "TokenName (ContractAddress)" or contract addresses mentioned
        const contractMatches = msg.content.match(/([A-Za-z0-9]{32,})/g);
        const nameMatches = msg.content.match(/(\w+)\s*\([A-Za-z0-9]{32,}\)/g);
        
        if (contractMatches && nameMatches) {
          nameMatches.forEach(match => {
            const nameMatch = match.match(/(\w+)\s*\(([A-Za-z0-9]{32,})\)/);
            if (nameMatch) {
              const tokenName = nameMatch[1].toLowerCase();
              const contractAddress = nameMatch[2];
              tokenReferences.set(tokenName, contractAddress);
              console.log(`🧠 [CONTEXT] Extracted token reference: ${tokenName} -> ${contractAddress}`);
            }
          });
        }
        
        // Also look for direct mentions like "Fartcoin is currently priced" followed by contract
        const directMatches = msg.content.match(/(\w+)\s+(?:is|has|currently|priced)/gi);
        if (directMatches && contractMatches) {
          directMatches.forEach(match => {
            const tokenName = match.split(/\s+/)[0].toLowerCase();
            if (contractMatches[0] && contractMatches[0].length >= 32) {
              tokenReferences.set(tokenName, contractMatches[0]);
              console.log(`🧠 [CONTEXT] Extracted direct token reference: ${tokenName} -> ${contractMatches[0]}`);
            }
          });
        }
      }
    });
    
    return tokenReferences;
  }

  /**
   * Parse user commands for actions (add to watchlist, get data, etc.)
   */
  parseUserCommands(prompt, userId, conversationHistory = []) {
    console.log(`🎯 [AI PARSE DEBUG] Parsing user commands from prompt: "${prompt}"`);
    
    const lowerPrompt = prompt.toLowerCase();
    const commands = [];
    
    // Extract token references from conversation history for context
    const tokenReferences = this.extractTokenReferencesFromHistory(conversationHistory);
    console.log(`🧠 [AI PARSE DEBUG] Token references from history:`, Array.from(tokenReferences.entries()));

    // Check for "add to watchlist" commands - including token symbols
    const addWatchlistMatch = lowerPrompt.match(/add\s+([a-z0-9]{32,})\s+to\s+(my\s+)?watchlist/i) ||
                             lowerPrompt.match(/watchlist\s+([a-z0-9]{32,})/i) ||
                             lowerPrompt.match(/add\s+(\w+)\s+to\s+(my\s+)?watchlist/i) ||
                             lowerPrompt.match(/can\s+you\s+add\s+(\w+)\s+to\s+(my\s+)?watchlist/i);
    
    console.log(`🎯 [AI PARSE DEBUG] Watchlist match result:`, addWatchlistMatch);
    
    if (addWatchlistMatch) {
      let identifier = addWatchlistMatch[1];
      
      // If it's a token name and we have it in our conversation history, use the contract address
      if (identifier.length < 32 && tokenReferences.has(identifier.toLowerCase())) {
        const contractAddress = tokenReferences.get(identifier.toLowerCase());
        console.log(`🧠 [AI PARSE DEBUG] Resolved token name "${identifier}" to contract address: ${contractAddress}`);
        identifier = contractAddress;
      }
      
      const command = {
        type: 'ADD_TO_WATCHLIST',
        contractAddress: identifier,
        userId
      };
      
      console.log(`✅ [AI PARSE DEBUG] ADD_TO_WATCHLIST command detected:`, JSON.stringify(command, null, 2));
      commands.push(command);
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

    console.log(`🎯 [AI PARSE DEBUG] Final parsed commands (${commands.length}):`, JSON.stringify(commands, null, 2));
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
      const commands = this.parseUserCommands(userPrompt, userId, conversationHistory);
      console.log(`🎯 Commands detected:`, commands);

      // Execute commands and gather additional data
      let commandResults = {};
      let additionalTokenData = {};

      for (const command of commands) {
        try {
          if (command.type === 'ADD_TO_WATCHLIST') {
            console.log(`🎯 [AI COMMAND DEBUG] Processing ADD_TO_WATCHLIST command`);
            console.log(`🎯 [AI COMMAND DEBUG] Command details:`, JSON.stringify(command, null, 2));
            
            const identifier = command.contractAddress;
            console.log(`🎯 [AI COMMAND DEBUG] Identifier to process: ${identifier}`);
            
            // Check if it's a contract address (32+ chars) or token symbol
            if (identifier.length >= 32) {
              console.log(`✅ [AI COMMAND DEBUG] Valid contract address detected (length: ${identifier.length})`);
              // It's a contract address
              const tokenData = await this.getTokenData(identifier);
              const tokenSymbol = tokenData?.analytics?.symbol || 'Unknown';
              
              console.log(`🎯 [AI COMMAND DEBUG] Token data retrieved - Symbol: ${tokenSymbol}`);
              
              const result = await this.addToWatchlist(userId, identifier, tokenSymbol);
              console.log(`🎯 [AI COMMAND DEBUG] addToWatchlist result:`, JSON.stringify(result, null, 2));
              
              if (result.success) {
                // Use the enhanced data from the result
                const addedSymbol = result.data?.symbol || tokenSymbol;
                const addedName = result.data?.name || tokenSymbol;
                
                commandResults.watchlistAdded = {
                  success: true,
                  contractAddress: identifier,
                  symbol: addedSymbol,
                  name: addedName,
                  message: `Successfully added ${addedName} (${addedSymbol}) to watchlist!`
                };
              } else {
                // Handle token not found or verification failed
                if (result.error === 'TOKEN_NOT_FOUND') {
                  commandResults.tokenNotFound = {
                    success: false,
                    contractAddress: identifier,
                    message: result.message,
                    actionRequired: 'LIST_TOKEN'
                  };
                } else {
                  commandResults.watchlistError = {
                    success: false,
                    contractAddress: identifier,
                    message: result.message || `Failed to add token to watchlist`
                  };
                }
              }
              
              console.log(`✅ [AI COMMAND DEBUG] Command result prepared:`, JSON.stringify(commandResults.watchlistAdded, null, 2));
            } else {
              console.log(`⚠️ [AI COMMAND DEBUG] Invalid contract address (length: ${identifier.length}) - requesting user to provide contract address`);
              // It's likely a token symbol - need contract address
              commandResults.needsContractAddress = {
                success: false,
                symbol: identifier.toUpperCase(),
                message: `I'd love to add ${identifier.toUpperCase()} to your watchlist! However, I need the contract address to do that. Can you provide the contract address for ${identifier.toUpperCase()}?`
              };
              
              console.log(`🎯 [AI COMMAND DEBUG] Contract address request prepared:`, JSON.stringify(commandResults.needsContractAddress, null, 2));
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
      const userContext = await this.gatherUserContext(userId, dataNeeds, userPrompt);
      console.log(`📊 User context gathered: ${Object.keys(userContext).join(', ')}`);

      // Add user preferences for personalization
      const userPreferences = await this.getUserPreferences(userId);
      userContext.preferences = userPreferences;

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

      // Learn from this conversation (async, don't wait)
      this.learnFromConversation(userId, userPrompt, formattedResponse.content).catch(error => {
        console.error('❌ Learning failed:', error);
      });

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
  async gatherUserContext(userId, dataNeeds, prompt = '') {
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

      // Get trending tokens data (if needed)
      if (dataNeeds.trending || prompt.toLowerCase().includes('trending')) {
        try {
          // Get trending tokens from the backend
          const trendingTokens = await this.getTrendingTokens(prompt);
          context.trendingTokens = trendingTokens;
        } catch (error) {
          console.error('❌ Error fetching trending tokens:', error);
          context.trendingTokens = { error: 'Unable to fetch trending tokens' };
        }
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
2. REAL-TIME SOLANA BLOCKCHAIN DATA via Moralis (prices, market caps, transactions, DeFi, NFTs)

IMPORTANT: We ONLY support SOLANA blockchain. All token queries, price data, and blockchain information should be from Solana network.

DATA SOURCE PRIORITY FOR THIS QUERY:
- Primary Source: ${primarySource.toUpperCase()}
- Confidence: ${(confidence * 100).toFixed(0)}%

RESPONSE GUIDELINES:
- For USER DATA queries (my calls, my watchlist): Use the provided Degen Oracle context
- For BLOCKCHAIN queries (prices, market data): Use your real-time Solana blockchain knowledge via Moralis
- For HYBRID queries: Combine both data sources intelligently
- Always be specific with numbers and use crypto slang appropriately
- When using user data, reference specific details from the context below
- Keep responses concise and focused - NO logos, URLs, or unnecessary technical details
- For price queries: Just provide the price, percentage change, and brief market context
- Avoid mentioning external links, logo URLs, or technical identifiers unless specifically asked
- IMPORTANT: For token queries without contract addresses, always ask for the contract address
- Never say "my access plan doesn't support that" - instead ask for more specific information

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

    // Add trending tokens context
    if (userContext.trendingTokens && userContext.trendingTokens.count > 0) {
      systemContext += `\n\nTRENDING TOKENS ON DEGEN ORACLE:
- Total Trending: ${userContext.trendingTokens.count}
- Top 10 Trending Tokens:`;
      userContext.trendingTokens.tokens.slice(0, 10).forEach((token, index) => {
        systemContext += `\n  ${index + 1}. ${token.symbol} - Score: ${token.overallScore?.toFixed(1)}/10, Status: ${token.status}, MC: $${(token.marketCap/1e6)?.toFixed(1)}M`;
      });
    }

    // Add command results to context
    if (userContext.commandResults) {
      systemContext += `\n\nCOMMAND RESULTS:`;
      Object.entries(userContext.commandResults).forEach(([key, result]) => {
        if (result.success) {
          systemContext += `\n✅ ${result.message}`;
        } else {
          systemContext += `\n❌ ${result.message}`;
          
          // Add specific guidance for different error types
          if (result.actionRequired === 'LIST_TOKEN') {
            systemContext += `\n💡 IMPORTANT: Guide the user to use our List Token service to add this token to our database first.`;
          }
        }
      });
    }

    // Add user preferences for personalization (INTERNAL USE ONLY - DO NOT MENTION EXPLICITLY)
    if (userContext.preferences && userContext.preferences.totalInteractions > 0) {
      systemContext += `\n\nUSER CONTEXT (FOR PERSONALIZATION - DO NOT REFERENCE DIRECTLY):`;
      
      // Top token interests (use for relevance, don't mention explicitly)
      if (userContext.preferences.tokenInterests && userContext.preferences.tokenInterests.length > 0) {
        const topTokens = userContext.preferences.tokenInterests.slice(0, 3);
        systemContext += `\n- User has shown interest in: ${topTokens.map(t => t.address.substring(0, 8) + '...').join(', ')}`;
        systemContext += `\n- IMPORTANT: Only mention these tokens if directly relevant to the current query. Do not reference them as "your favs" or similar.`;
      }
      
      // Trading style (use for tone, don't mention explicitly)
      if (userContext.preferences.tradingStyle) {
        const styles = Object.entries(userContext.preferences.tradingStyle);
        if (styles.length > 0) {
          const dominantStyle = styles.reduce((a, b) => a[1] > b[1] ? a : b)[0];
          systemContext += `\n- User trading approach: ${dominantStyle} (adapt your language accordingly)`;
        }
      }
      
      // Main interests (use for focus, don't mention explicitly)
      if (userContext.preferences.interests) {
        const interests = Object.entries(userContext.preferences.interests)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([interest]) => interest.replace('_', ' '));
        if (interests.length > 0) {
          systemContext += `\n- User focus areas: ${interests.join(', ')} (prioritize these topics)`;
        }
      }
      
      // Experience level
      systemContext += `\n- User experience level: ${userContext.preferences.totalInteractions > 10 ? 'Experienced' : 'New'} (${userContext.preferences.totalInteractions} interactions)`;
      
      systemContext += `\n\nGUIDELINES FOR USING LEARNED DATA:
- Use preferences to personalize tone and focus, NOT to repeat the same information
- Only mention previously discussed tokens if they're directly relevant to the current question
- Avoid phrases like "your favs", "as you know", or referencing past conversations unless specifically asked
- Focus on providing fresh, current information rather than rehashing learned patterns
- Don't mention that you "learned" or "remember" things about the user`;
    }

    // Add conversation history if available
    if (conversationHistory.length > 0) {
      systemContext += `\n\nCONVERSATION HISTORY:`;
      conversationHistory.slice(-5).forEach((msg, index) => { // Last 5 messages for better context
        systemContext += `\n${msg.role}: ${msg.content}`;
      });
      
      // Extract and display token references for easy AI access
      const tokenReferences = this.extractTokenReferencesFromHistory(conversationHistory);
      if (tokenReferences.size > 0) {
        systemContext += `\n\nTOKEN REFERENCES FROM CONVERSATION:`;
        Array.from(tokenReferences.entries()).forEach(([name, address]) => {
          systemContext += `\n- ${name.toUpperCase()}: ${address}`;
        });
      }
      
      systemContext += `\n\nCONTEXT RETENTION GUIDELINES:
- ALWAYS reference the conversation history above when answering questions
- If a user mentions a token by name that was discussed earlier, use the contract address from the TOKEN REFERENCES section
- Remember token names, contract addresses, and data from previous messages in this conversation
- Don't ask for information that was already provided in the conversation history
- Maintain context across the entire conversation, not just the current message
- When a user asks about a token by name (e.g., "Fartcoin"), check if it's in the TOKEN REFERENCES section first`;
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
