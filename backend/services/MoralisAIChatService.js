import HybridDatabaseService from '../hybridDatabaseService.js';
import fetch from 'node-fetch';
import crypto from 'crypto';
import SmartIntentDetector from './SmartIntentDetector.js';
import SmartPromptTemplates from './SmartPromptTemplates.js';
import PromptSecurityGuard from './PromptSecurityGuard.js';

/**
 * Moralis AI Chat Service - Integrates Moralis AI with user-specific Degen Oracle data
 * Provides personalized AI assistance with access to user's KOL calls, watchlist, hype data, etc.
 * Now includes interactive capabilities: watchlist management, token data fetching, etc.
 * Enhanced with Smart Intent Detection and Modular Prompts for maximum degen efficiency
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
    
    // Initialize Smart Intent Detection and Modular Prompts
    this.intentDetector = new SmartIntentDetector();
    this.promptTemplates = new SmartPromptTemplates();
    
    // Initialize Security Guard
    this.securityGuard = new PromptSecurityGuard();
    
    if (!this.moralisApiKey) {
      console.warn('⚠️ MORALIS_API_KEY not found in environment variables');
    }
    
    console.log('🧠 [SMART AI] Initialized with Intent Detection, Modular Prompts, and Security Guard');
    console.log('🛡️ [SECURITY] Prompt injection protection active');
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
   * Search for token by name or symbol in the database
   */
  async searchTokenByName(tokenName) {
    try {
      console.log(`🔍 [TOKEN SEARCH] Searching for token: "${tokenName}"`);
      
      if (!this.backendInstance) {
        console.log(`⚠️ [TOKEN SEARCH] No backend instance available for database search`);
        console.log(`⚠️ [TOKEN SEARCH] Backend instance type:`, typeof this.backendInstance);
        return null;
      }

      // Get all tokens from cache
      console.log(`🔍 [TOKEN SEARCH] Calling getTokensFromCache()...`);
      const allTokens = await this.backendInstance.getTokensFromCache();
      console.log(`🔍 [TOKEN SEARCH] Retrieved ${allTokens ? allTokens.length : 0} tokens from cache`);
      
      if (!allTokens || allTokens.length === 0) {
        console.log(`⚠️ [TOKEN SEARCH] No tokens found in cache`);
        return null;
      }

      const searchTerm = tokenName.toLowerCase().trim();
      console.log(`🔍 [TOKEN SEARCH] Searching ${allTokens.length} tokens for: "${searchTerm}"`);

      // Log first few tokens for debugging
      console.log(`🔍 [TOKEN SEARCH] Sample tokens:`, allTokens.slice(0, 3).map(t => ({
        name: t.name,
        symbol: t.symbol,
        contractAddress: t.contractAddress?.substring(0, 8) + '...'
      })));

      // Search by name or symbol (case insensitive)
      const matchedToken = allTokens.find(token => {
        const name = (token.name || '').toLowerCase();
        const symbol = (token.symbol || '').toLowerCase();
        
        // Exact matches first
        if (name === searchTerm || symbol === searchTerm) {
          return true;
        }
        
        // Partial matches (contains)
        if (name.includes(searchTerm) || symbol.includes(searchTerm)) {
          return true;
        }
        
        return false;
      });

      if (matchedToken) {
        console.log(`✅ [TOKEN SEARCH] Found token: ${matchedToken.name} (${matchedToken.symbol}) - ${matchedToken.contractAddress}`);
        return {
          contractAddress: matchedToken.contractAddress,
          name: matchedToken.name,
          symbol: matchedToken.symbol,
          price: matchedToken.price,
          marketCap: matchedToken.marketCap
        };
      } else {
        console.log(`❌ [TOKEN SEARCH] No token found for: "${tokenName}"`);
        console.log(`❌ [TOKEN SEARCH] Searched through ${allTokens.length} tokens`);
        return null;
      }
    } catch (error) {
      console.error(`❌ [TOKEN SEARCH] Error searching for token:`, error);
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
  async parseUserCommands(prompt, userId, conversationHistory = []) {
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
                             lowerPrompt.match(/can\s+you\s+add\s+(\w+)\s+to\s+(my\s+)?watchlist/i) ||
                             lowerPrompt.match(/please\s+add\s+(\w+)\s+to\s+(my\s+)?watchlist/i);
    
    console.log(`🎯 [AI PARSE DEBUG] Watchlist match result:`, addWatchlistMatch);
    
    if (addWatchlistMatch) {
      let identifier = addWatchlistMatch[1];
      let tokenData = null;
      
      // If it's already a contract address (32+ chars), use it directly
      if (identifier.length >= 32) {
        console.log(`🎯 [AI PARSE DEBUG] Using contract address directly: ${identifier}`);
      } else {
        // First check conversation history
        if (tokenReferences.has(identifier.toLowerCase())) {
          const contractAddress = tokenReferences.get(identifier.toLowerCase());
          console.log(`🧠 [AI PARSE DEBUG] Resolved token name "${identifier}" from conversation history: ${contractAddress}`);
          identifier = contractAddress;
        } else {
          // Search in database
          console.log(`🔍 [AI PARSE DEBUG] Searching database for token: "${identifier}"`);
          tokenData = await this.searchTokenByName(identifier);
          
          if (tokenData) {
            console.log(`✅ [AI PARSE DEBUG] Found token in database: ${tokenData.name} (${tokenData.symbol}) - ${tokenData.contractAddress}`);
            identifier = tokenData.contractAddress;
          } else {
            console.log(`❌ [AI PARSE DEBUG] Token "${identifier}" not found in database or conversation history`);
          }
        }
      }
      
      const command = {
        type: 'ADD_TO_WATCHLIST',
        contractAddress: identifier,
        tokenData: tokenData, // Include found token data for better success messages
        userId
      };
      
      console.log(`✅ [AI PARSE DEBUG] ADD_TO_WATCHLIST command detected:`, JSON.stringify(command, null, 2));
      commands.push(command);
    }

    // Check for token data requests (price, volume, holders, etc.)
    console.log(`🔍 [AI PARSE DEBUG] Checking for token data requests in: "${lowerPrompt}"`);
    
    // Common words that should NOT be treated as token names
    const commonWords = new Set([
      'current', 'unusual', 'today', 'which', 'tokens', 'have', 'what', 'show', 'get', 'find',
      'price', 'volume', 'holders', 'data', 'analysis', 'market', 'trading', 'crypto', 'coin',
      'solana', 'ethereum', 'bitcoin', 'defi', 'nft', 'pump', 'dump', 'moon', 'gem', 'alpha',
      'beta', 'degen', 'chad', 'based', 'cringe', 'cope', 'seethe', 'diamond', 'paper', 'hands',
      'whale', 'retail', 'community', 'trending', 'viral', 'building', 'waking', 'sleeping'
    ]);
    
    // First try to find contract addresses (32+ chars)
    const contractMatch = lowerPrompt.match(/([a-z0-9]{32,})/i);
    
    // Then try specific token name patterns, but exclude common words
    const tokenNameMatch = lowerPrompt.match(/(?:price|volume|holders?|data|analysis).*?(?:of|for)\s+(\w+)/i) ||
                          lowerPrompt.match(/what.*?(?:price|volume|holders?).*?(?:of|for)\s+(\w+)/i) ||
                          lowerPrompt.match(/(\w+)\s+(?:price|volume|holders?|data)/i);
    
    let tokenDataMatch = null;
    
    if (contractMatch) {
      tokenDataMatch = contractMatch;
    } else if (tokenNameMatch) {
      const potentialToken = tokenNameMatch[1].toLowerCase();
      // Only proceed if it's not a common word and looks like a token name
      if (!commonWords.has(potentialToken) && potentialToken.length >= 2 && potentialToken.length <= 20) {
        tokenDataMatch = tokenNameMatch;
      } else {
        console.log(`🚫 [AI PARSE DEBUG] Skipping common word as token: "${potentialToken}"`);
      }
    }
    
    console.log(`🔍 [AI PARSE DEBUG] Token data match result:`, tokenDataMatch);
    
    if (tokenDataMatch) {
      let identifier = tokenDataMatch[1];
      let tokenData = null;
      
      console.log(`🔍 [AI PARSE DEBUG] Token data request for: "${identifier}"`);
      
      // If it's already a contract address (32+ chars), use it directly
      if (identifier.length >= 32) {
        console.log(`🎯 [AI PARSE DEBUG] Using contract address directly for data request: ${identifier}`);
      } else {
        // First check conversation history
        if (tokenReferences.has(identifier.toLowerCase())) {
          const contractAddress = tokenReferences.get(identifier.toLowerCase());
          console.log(`🧠 [AI PARSE DEBUG] Resolved token name "${identifier}" from conversation history for data request: ${contractAddress}`);
          identifier = contractAddress;
        } else {
          // Search in database
          console.log(`🔍 [AI PARSE DEBUG] Searching database for token data request: "${identifier}"`);
          tokenData = await this.searchTokenByName(identifier);
          
          if (tokenData) {
            console.log(`✅ [AI PARSE DEBUG] Found token in database for data request: ${tokenData.name} (${tokenData.symbol}) - ${tokenData.contractAddress}`);
            identifier = tokenData.contractAddress;
          } else {
            console.log(`❌ [AI PARSE DEBUG] Token "${identifier}" not found in database for data request`);
          }
        }
      }
      
      const command = {
        type: 'GET_TOKEN_DATA',
        contractAddress: identifier,
        tokenData: tokenData, // Include found token data
        originalQuery: tokenDataMatch[1], // Keep original query for error messages
        userId
      };
      
      console.log(`✅ [AI PARSE DEBUG] GET_TOKEN_DATA command detected:`, JSON.stringify(command, null, 2));
      commands.push(command);
    } else {
      console.log(`❌ [AI PARSE DEBUG] No token data request pattern matched`);
    }

    // Check for whale activity or contract address analysis requests (if not already matched above)
    if (!tokenDataMatch) {
      const whaleActivityMatch = lowerPrompt.match(/(?:whale|activity|analysis|data).*?([a-z0-9]{32,})/i) ||
                                lowerPrompt.match(/([a-z0-9]{32,}).*?(?:whale|activity|analysis|data)/i) ||
                                lowerPrompt.match(/show.*?(?:whale|activity|transactions?).*?for\s+([a-z0-9]{32,})/i);
      
      console.log(`🔍 [AI PARSE DEBUG] Whale activity match result:`, whaleActivityMatch);
      
      if (whaleActivityMatch) {
        const contractAddress = whaleActivityMatch[1];
        console.log(`🐋 [AI PARSE DEBUG] Whale activity request for contract: ${contractAddress}`);
        
        const command = {
          type: 'GET_TOKEN_DATA',
          contractAddress: contractAddress,
          tokenData: null,
          originalQuery: contractAddress,
          userId: userId,
          analysisType: 'whale_activity'
        };
        
        console.log(`✅ [AI PARSE DEBUG] WHALE_ACTIVITY command detected:`, JSON.stringify(command, null, 2));
        commands.push(command);
      }
    }

    // Check for "tell me about [TokenName] [ContractAddress]" patterns
    const nameAndAddressMatch = lowerPrompt.match(/(?:tell me about|about)\s+(\w+)\s+([a-z0-9]{32,})/i) ||
                               lowerPrompt.match(/(\w+)\s+([a-z0-9]{32,})/i);
    
    console.log(`🔍 [AI PARSE DEBUG] Name and address match result:`, nameAndAddressMatch);
    
    if (nameAndAddressMatch && !tokenDataMatch) {
      const tokenName = nameAndAddressMatch[1];
      const contractAddress = nameAndAddressMatch[2];
      
      console.log(`📝 [AI PARSE DEBUG] User provided token name "${tokenName}" with contract: ${contractAddress}`);
      
      const command = {
        type: 'GET_TOKEN_DATA',
        contractAddress: contractAddress,
        tokenData: {
          name: tokenName,
          symbol: tokenName.toUpperCase(),
          contractAddress: contractAddress
        },
        originalQuery: `${tokenName} ${contractAddress}`,
        userId: userId,
        userProvidedName: tokenName
      };
      
      console.log(`✅ [AI PARSE DEBUG] NAME_AND_ADDRESS command detected:`, JSON.stringify(command, null, 2));
      commands.push(command);
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

      // 🛡️ SECURITY VALIDATION (First line of defense)
      const securityAnalysis = this.securityGuard.analyzePrompt(userPrompt);
      console.log(`🛡️ [SECURITY] Risk Level: ${securityAnalysis.riskLevel} (Score: ${securityAnalysis.riskScore})`);
      
      if (securityAnalysis.recommendation === 'BLOCK') {
        console.log(`🚨 [SECURITY] BLOCKED malicious prompt from user ${userId}`);
        console.log(`🚨 [SECURITY] Threats detected: ${securityAnalysis.detectedThreats.map(t => t.type).join(', ')}`);
        
        // Log security incident
        this.securityGuard.logSecurityIncident(userId, userPrompt, securityAnalysis);
        
        // Return safe error response
        return {
          success: true,
          response: this.securityGuard.generateSecurityResponse(securityAnalysis),
          securityBlocked: true,
          riskLevel: securityAnalysis.riskLevel
        };
      }
      
      // Sanitize prompt if medium risk
      let sanitizedPrompt = userPrompt;
      if (securityAnalysis.recommendation === 'SANITIZE') {
        console.log(`🛡️ [SECURITY] SANITIZING medium-risk prompt from user ${userId}`);
        sanitizedPrompt = this.securityGuard.sanitizePrompt(userPrompt);
        console.log(`🛡️ [SECURITY] Sanitized prompt: "${sanitizedPrompt.substring(0, 100)}..."`);
      }

      // 🧠 SMART INTENT DETECTION
      const intentResult = this.intentDetector.detectIntent(sanitizedPrompt);
      const primaryIntent = intentResult.primary.intent;
      const confidence = (intentResult.primary.confidence * 100).toFixed(1);
      
      console.log(`🧠 [SMART AI] Intent: ${primaryIntent} (${confidence}% confidence)`);
      console.log(`🧠 [SMART AI] Matched keywords: ${intentResult.primary.matchedKeywords.join(', ')}`);

      // 🎯 CONDITIONAL COMMAND PARSING (only if needed for this intent)
      let commands = [];
      if (this.intentDetector.requiresTokenLookup(primaryIntent) || 
          (primaryIntent === 'PLATFORM_QUERY' && sanitizedPrompt.toLowerCase().includes('watchlist'))) {
        console.log(`🔍 [SMART AI] Intent requires token lookup - parsing commands`);
        commands = await this.parseUserCommands(sanitizedPrompt, userId, conversationHistory);
      } else {
        console.log(`⚡ [SMART AI] Intent doesn't require token lookup - skipping command parsing`);
      }
      console.log(`🎯 Commands detected for ${primaryIntent}:`, commands);

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
              
              // Use token data from database search if available, otherwise fetch it
              let tokenSymbol, tokenName;
              if (command.tokenData) {
                console.log(`🎯 [AI COMMAND DEBUG] Using token data from database search`);
                tokenSymbol = command.tokenData.symbol;
                tokenName = command.tokenData.name;
              } else {
                console.log(`🎯 [AI COMMAND DEBUG] Fetching token data from API`);
                const tokenData = await this.getTokenData(identifier);
                tokenSymbol = tokenData?.analytics?.symbol || 'Unknown';
                tokenName = tokenData?.analytics?.name || tokenSymbol;
              }
              
              console.log(`🎯 [AI COMMAND DEBUG] Token info - Name: ${tokenName}, Symbol: ${tokenSymbol}`);
              
              const result = await this.addToWatchlist(userId, identifier, tokenSymbol);
              console.log(`🎯 [AI COMMAND DEBUG] addToWatchlist result:`, JSON.stringify(result, null, 2));
              
              if (result.success) {
                // Use the enhanced data from the result or our database search
                const addedSymbol = result.data?.symbol || tokenSymbol;
                const addedName = result.data?.name || tokenName;
                
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
              console.log(`❌ [AI COMMAND DEBUG] Token "${identifier}" not found in database for watchlist`);
              // Token not found in database - guide to List Token service
              commandResults.watchlistError = {
                success: false,
                error: 'TOKEN_NOT_FOUND',
                originalQuery: identifier,
                message: `Token "${identifier}" is not in our database. Please use our List Token service to add it first, or provide the full Solana contract address.`,
                actionRequired: 'LIST_TOKEN'
              };
              
              console.log(`🎯 [AI COMMAND DEBUG] Token not found error prepared:`, JSON.stringify(commandResults.watchlistError, null, 2));
            }
          } else if (command.type === 'GET_TOKEN_DATA') {
            console.log(`🎯 [AI COMMAND DEBUG] Processing GET_TOKEN_DATA command`);
            console.log(`🎯 [AI COMMAND DEBUG] Command details:`, JSON.stringify(command, null, 2));
            
            // Check if token was found in database during parsing
            if (command.contractAddress.length < 32) {
              console.log(`❌ [AI COMMAND DEBUG] Token "${command.originalQuery}" not found in database`);
              commandResults.tokenDataError = {
                success: false,
                error: 'TOKEN_NOT_FOUND',
                originalQuery: command.originalQuery,
                message: `Token "${command.originalQuery}" is not in our database. Please provide the full Solana contract address to get price and data.`
              };
            } else {
              console.log(`🎯 [AI COMMAND DEBUG] Fetching token data for: ${command.contractAddress}`);
              const tokenData = await this.getTokenData(command.contractAddress);
              if (tokenData) {
                console.log(`✅ [AI COMMAND DEBUG] Token data retrieved successfully`);
                additionalTokenData[command.contractAddress] = {
                  ...tokenData,
                  // Include database search results if available
                  databaseInfo: command.tokenData,
                  // Include user-provided name if available
                  userProvidedName: command.userProvidedName
                };
              } else {
                console.log(`❌ [AI COMMAND DEBUG] Failed to fetch token data`);
                commandResults.tokenDataError = {
                  success: false,
                  error: 'FETCH_FAILED',
                  contractAddress: command.contractAddress,
                  message: `Failed to fetch data for token ${command.contractAddress}`
                };
              }
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

      // 📊 CONDITIONAL DATA GATHERING (only what's needed for this intent)
      let userContext = {};
      if (this.intentDetector.requiresUserData(primaryIntent)) {
        console.log(`📊 [SMART AI] Intent requires user data - gathering context`);
        const dataNeeds = this.analyzePromptDataNeeds(sanitizedPrompt);
        console.log(`🔍 Data needs identified:`, dataNeeds);
        
        userContext = await this.gatherUserContext(userId, dataNeeds, sanitizedPrompt);
        console.log(`📊 User context gathered: ${Object.keys(userContext).join(', ')}`);

        // Add user preferences for personalization
        const userPreferences = await this.getUserPreferences(userId);
        userContext.preferences = userPreferences;
      } else {
        console.log(`⚡ [SMART AI] Intent doesn't require user data - skipping context gathering`);
        // Still get basic preferences for personalization
        const userPreferences = await this.getUserPreferences(userId);
        userContext.preferences = userPreferences;
      }

      // Add additional token data to context
      if (Object.keys(additionalTokenData).length > 0) {
        userContext.tokenData = additionalTokenData;
      }

      // Add command results to context
      if (Object.keys(commandResults).length > 0) {
        userContext.commandResults = commandResults;
      }

      // 🎪 BUILD SPECIALIZED PROMPT (instead of generic buildEnhancedPrompt)
      const promptContext = {
        tokenData: additionalTokenData,
        userData: userContext,
        commandResults: commandResults,
        conversationHistory: conversationHistory
      };

      const specializedPrompt = this.promptTemplates.getPromptForIntent(
        primaryIntent, 
        sanitizedPrompt, 
        promptContext
      );

      console.log(`📝 [SMART AI] Using ${primaryIntent} specialized prompt (${specializedPrompt.length} chars)`);
      console.log(`🎯 [SMART AI] Data source priority: ${this.intentDetector.getDataSourcePriority(primaryIntent)}`);

      // Call Moralis AI with specialized prompt
      const aiResponse = await this.callMoralisAI(specializedPrompt);

      // Process and format the response
      const formattedResponse = this.formatAIResponse(aiResponse, userContext);

      // Add action suggestions if relevant
      if (commands.length > 0 || this.shouldSuggestActions(userPrompt)) {
        formattedResponse.actionSuggestions = this.generateActionSuggestions(userPrompt, userContext);
      }

      // Learn from this conversation (async, don't wait) - only if safe
      if (securityAnalysis.riskLevel === 'LOW' || securityAnalysis.recommendation === 'ALLOW') {
        this.learnFromConversation(userId, sanitizedPrompt, formattedResponse.content).catch(error => {
          console.error('❌ Learning failed:', error);
        });
      } else {
        console.log(`🛡️ [SECURITY] Skipping learning from potentially malicious prompt`);
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
      
      // Platform Information
      platformInfo: false,
      
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

    // Platform information keywords
    if (lowerPrompt.includes('degen oracle') || lowerPrompt.includes('platform') || 
        lowerPrompt.includes('how does') || lowerPrompt.includes('what is') ||
        lowerPrompt.includes('trending work') || lowerPrompt.includes('scoring') ||
        lowerPrompt.includes('features') || lowerPrompt.includes('tools') ||
        lowerPrompt.includes('premium') || lowerPrompt.includes('subscription') ||
        lowerPrompt.includes('bubble map') || lowerPrompt.includes('watchlist work') ||
        lowerPrompt.includes('hype over time') || lowerPrompt.includes('oracle chart') ||
        lowerPrompt.includes('holder insights') || lowerPrompt.includes('kol calls') ||
        lowerPrompt.includes('list token') || lowerPrompt.includes('fuel token') ||
        lowerPrompt.includes('how to use') || lowerPrompt.includes('getting started')) {
      needs.platformInfo = true;
      needs.primarySource = 'general';
      needs.confidence = Math.max(needs.confidence, 0.9);
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
        console.log(`🔍 [KOL DEBUG] Fetching KOL calls for user ${userId}`);
        const kolCalls = await this.db.getKolCalls(userId);
        console.log(`🔍 [KOL DEBUG] Raw KOL calls data:`, {
          isArray: Array.isArray(kolCalls),
          length: kolCalls?.length || 0,
          firstCall: kolCalls?.[0] ? {
            id: kolCalls[0].id,
            token: kolCalls[0].token?.symbol,
            status: kolCalls[0].status,
            calledAt: kolCalls[0].calledAt
          } : 'none'
        });
        context.kolCalls = this.processKolCallsForAI(kolCalls);
        console.log(`🔍 [KOL DEBUG] Processed KOL calls:`, {
          count: context.kolCalls.count,
          hasData: context.kolCalls.count > 0,
          summary: context.kolCalls.summary,
          firstCall: context.kolCalls.calls?.[0] ? {
            token: context.kolCalls.calls[0].token?.symbol,
            multiplier: context.kolCalls.calls[0].performance?.multiplier,
            status: context.kolCalls.calls[0].performance?.status
          } : 'none'
        });
      }

      // Get user's watchlist with performance analysis
      if (dataNeeds.watchlist) {
        const watchlist = await this.db.getWatchlist(userId);
        context.watchlist = await this.processWatchlistForAI(watchlist || []);
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
   * Process watchlist data for AI analysis with performance metrics
   */
  async processWatchlistForAI(watchlist) {
    if (!Array.isArray(watchlist) || watchlist.length === 0) {
      return { count: 0, tokens: [], performance: null };
    }

    console.log(`📊 [WATCHLIST DEBUG] Processing ${watchlist.length} watchlist tokens for AI analysis`);

    const processedTokens = [];
    
    for (const token of watchlist) {
      try {
        // Get current token data for performance calculation
        let currentData = null;
        if (token.contractAddress) {
          currentData = await this.getTokenData(token.contractAddress);
        }

        const currentPrice = currentData?.analytics?.price || null;
        const currentMC = currentData?.analytics?.marketCap || currentData?.analytics?.mcap || null;
        const addedPrice = token.price || null;
        const addedMC = token.marketCap || null;

        // Calculate performance since added to watchlist
        let priceChange = null;
        let mcChange = null;
        let multiplier = null;
        let status = 'Unknown';

        if (currentPrice && addedPrice && addedPrice > 0) {
          priceChange = ((currentPrice - addedPrice) / addedPrice) * 100;
          multiplier = currentPrice / addedPrice;
        } else if (currentMC && addedMC && addedMC > 0) {
          mcChange = ((currentMC - addedMC) / addedMC) * 100;
          multiplier = currentMC / addedMC;
        }

        // Determine performance status
        if (multiplier) {
          if (multiplier >= 10) status = 'Moon Mission (10x+)';
          else if (multiplier >= 5) status = 'Sending It (5x+)';
          else if (multiplier >= 2) status = 'Pumping (2x+)';
          else if (multiplier >= 1.5) status = 'Green (1.5x+)';
          else if (multiplier >= 1) status = 'Holding';
          else if (multiplier >= 0.8) status = 'Slight Dip';
          else if (multiplier >= 0.5) status = 'Red (-50%)';
          else status = 'Rekt (-50%+)';
        }

        // Get trending status from current data
        const trendingStatus = this.determineTrendingStatus(currentData);

        const processedToken = {
          symbol: token.symbol || 'Unknown',
          name: token.name || 'Unknown',
          contractAddress: token.contractAddress,
          addedAt: token.addedAt,
          addedPrice: addedPrice,
          currentPrice: currentPrice,
          addedMC: addedMC,
          currentMC: currentMC,
          priceChange: priceChange,
          mcChange: mcChange,
          multiplier: multiplier,
          status: status,
          trending: trendingStatus,
          daysSinceAdded: token.addedAt ? Math.floor((Date.now() - new Date(token.addedAt).getTime()) / (1000 * 60 * 60 * 24)) : null
        };

        processedTokens.push(processedToken);
        
      } catch (error) {
        console.error(`❌ [WATCHLIST DEBUG] Error processing token ${token.symbol}:`, error);
        // Add token with basic info even if processing fails
        processedTokens.push({
          symbol: token.symbol || 'Unknown',
          name: token.name || 'Unknown',
          contractAddress: token.contractAddress,
          addedAt: token.addedAt,
          status: 'Data Unavailable',
          trending: 'Unknown'
        });
      }
    }

    // Sort by performance (best first)
    processedTokens.sort((a, b) => (b.multiplier || 0) - (a.multiplier || 0));

    return {
      count: processedTokens.length,
      tokens: processedTokens,
      performance: this.generateWatchlistSummary(processedTokens)
    };
  }

  /**
   * Determine trending status from token data
   */
  determineTrendingStatus(tokenData) {
    if (!tokenData?.analytics) return 'Unknown';
    
    const score = tokenData.analytics.overallScore || tokenData.analytics.enhancedScore || 0;
    
    if (score >= 8.5) return 'Viral';
    else if (score >= 7.5) return 'Trending';
    else if (score >= 6.5) return 'Building';
    else if (score >= 5.5) return 'Waking Up';
    else return 'Sleeping';
  }

  /**
   * Generate watchlist performance summary
   */
  generateWatchlistSummary(tokens) {
    if (tokens.length === 0) {
      return { totalTokens: 0, avgMultiplier: 0, bestPerformer: null, worstPerformer: null };
    }

    const tokensWithMultiplier = tokens.filter(t => t.multiplier !== null);
    
    if (tokensWithMultiplier.length === 0) {
      return { 
        totalTokens: tokens.length, 
        avgMultiplier: 0, 
        bestPerformer: null, 
        worstPerformer: null,
        trendingCount: tokens.filter(t => ['Viral', 'Trending'].includes(t.trending)).length
      };
    }

    const totalMultiplier = tokensWithMultiplier.reduce((sum, token) => sum + token.multiplier, 0);
    const avgMultiplier = totalMultiplier / tokensWithMultiplier.length;
    const bestPerformer = tokensWithMultiplier[0]; // Already sorted by performance
    const worstPerformer = tokensWithMultiplier[tokensWithMultiplier.length - 1];
    const profitableTokens = tokensWithMultiplier.filter(t => t.multiplier >= 1).length;
    const trendingTokens = tokens.filter(t => ['Viral', 'Trending'].includes(t.trending));

    return {
      totalTokens: tokens.length,
      avgMultiplier: avgMultiplier,
      bestPerformer: bestPerformer,
      worstPerformer: worstPerformer,
      profitableTokens: profitableTokens,
      winRate: (profitableTokens / tokensWithMultiplier.length * 100).toFixed(1),
      trendingCount: trendingTokens.length,
      trendingTokens: trendingTokens
    };
  }

  /**
   * Calculate individual call performance
   */
  calculateCallPerformance(call) {
    // Debug logging to understand the data structure
    console.log(`🔍 [KOL PERFORMANCE DEBUG] Calculating performance for ${call.token?.symbol || 'Unknown'}:`, {
      currentMultiplier: call.currentMultiplier,
      athMultiplier: call.athMultiplier,
      calledMc: call.calledMc,
      currentMC: call.currentMC,
      hasCurrentMultiplier: call.currentMultiplier !== undefined && call.currentMultiplier !== null,
      hasAthMultiplier: call.athMultiplier !== undefined && call.athMultiplier !== null
    });
    
    // 🚨 CRITICAL FIX: Use ATH multiplier for performance ranking, not current multiplier
    // ATH multiplier represents the best performance since the call was made
    let performanceMultiplier = call.athMultiplier;
    
    // If athMultiplier is missing, fall back to currentMultiplier
    if (!performanceMultiplier && call.currentMultiplier) {
      performanceMultiplier = call.currentMultiplier;
      console.log(`🔍 [KOL PERFORMANCE DEBUG] Using currentMultiplier as fallback: ${performanceMultiplier}`);
    }
    
    // If both are missing, try to calculate from MC data
    if (!performanceMultiplier && call.calledMc && call.currentMC && call.calledMc > 0) {
      performanceMultiplier = call.currentMC / call.calledMc;
      console.log(`🔍 [KOL PERFORMANCE DEBUG] Calculated multiplier from MC: ${call.currentMC} / ${call.calledMc} = ${performanceMultiplier}`);
    }
    
    // Fallback to 0 if still no multiplier
    performanceMultiplier = performanceMultiplier || 0;
    
    const currentMultiplier = call.currentMultiplier || 0;
    const athMultiplier = call.athMultiplier || 0;
    const milestonesHit = call.milestonePosts?.length || 0;
    
    // Status based on ATH performance (best achieved)
    let status = 'Unknown';
    if (performanceMultiplier >= 100) status = 'Legendary (100x+)';
    else if (performanceMultiplier >= 50) status = 'Epic (50x+)';
    else if (performanceMultiplier >= 20) status = 'Great (20x+)';
    else if (performanceMultiplier >= 10) status = 'Good (10x+)';
    else if (performanceMultiplier >= 5) status = 'Decent (5x+)';
    else if (performanceMultiplier >= 2) status = 'Positive (2x+)';
    else if (performanceMultiplier >= 1) status = 'Break Even';
    else status = 'Down';

    console.log(`🔍 [KOL PERFORMANCE DEBUG] Final performance for ${call.token?.symbol}: ATH ${performanceMultiplier}x vs Current ${currentMultiplier}x (Status: ${status})`);

    return {
      multiplier: performanceMultiplier, // Use ATH for ranking/comparison
      currentMultiplier: currentMultiplier, // Keep current for reference
      athMultiplier: athMultiplier, // Keep ATH for reference
      milestonesHit: milestonesHit,
      status: status,
      profitLoss: performanceMultiplier >= 1 ? 'Profit' : 'Loss'
    };
  }

  /**
   * Generate summary of user's calls
   */
  generateCallsSummary(calls) {
    if (calls.length === 0) {
      return { totalCalls: 0, avgMultiplier: 0, bestCall: null, totalMilestones: 0 };
    }

    console.log(`🔍 [KOL SUMMARY DEBUG] Generating summary for ${calls.length} calls:`);
    calls.forEach((call, index) => {
      console.log(`  ${index + 1}. ${call.token?.symbol}: ${call.performance?.multiplier}x (${call.performance?.status})`);
    });

    const totalMultiplier = calls.reduce((sum, call) => sum + (call.performance.multiplier || 0), 0);
    const avgMultiplier = totalMultiplier / calls.length;
    const bestCall = calls[0]; // Already sorted by performance
    const worstCall = calls[calls.length - 1]; // Last call is worst
    const totalMilestones = calls.reduce((sum, call) => sum + call.milestonePosts, 0);
    const profitableCalls = calls.filter(call => call.performance.multiplier >= 1).length;
    const winRate = (profitableCalls / calls.length * 100).toFixed(1);

    console.log(`🔍 [KOL SUMMARY DEBUG] Summary calculated:`, {
      totalCalls: calls.length,
      avgMultiplier: avgMultiplier.toFixed(2),
      bestCall: `${bestCall?.token?.symbol} (${bestCall?.performance?.multiplier}x)`,
      worstCall: `${worstCall?.token?.symbol} (${worstCall?.performance?.multiplier}x)`,
      profitableCalls: profitableCalls,
      winRate: `${winRate}%`
    });

    return {
      totalCalls: calls.length,
      avgMultiplier: avgMultiplier,
      bestCall: bestCall,
      worstCall: worstCall, // Add worst call to summary
      totalMilestones: totalMilestones,
      profitableCalls: profitableCalls,
      winRate: winRate
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
- IMPORTANT: I have access to a comprehensive token database - when users ask about tokens by name, I can look them up automatically
- Never say "my access plan doesn't support that" - instead ask for more specific information

INTERACTIVE CAPABILITIES:
- I can add tokens to your watchlist when you ask
- I can fetch comprehensive token data (price, volume, holders) in real-time by token name or contract address
- I can execute actions based on your requests
- When discussing tokens, I'll offer action suggestions like "Add to Watchlist" or "Get Full Analysis"
- IMPORTANT: I have access to Degen Oracle's token database and can look up tokens by name automatically
- Never say "my access plan doesn't support that" - instead ask for more specific information

DEGEN ORACLE PLATFORM KNOWLEDGE:

🚀 **WHAT IS DEGEN ORACLE?**
Degen Oracle is the ultimate Solana memecoin discovery and analysis platform. We're the go-to destination for degens looking to find the next 100x gem before it moons. Our AI-powered analytics engine tracks thousands of Solana tokens in real-time, providing comprehensive insights that help users make informed trading decisions.

🎯 **CORE FEATURES:**

**1. TRENDING DISCOVERY**
- Real-time trending token detection using advanced algorithms
- Multi-source data aggregation (Dexscreener, CoinGecko, Jupiter API)
- Smart filtering to surface only quality opportunities
- Trending status based on our proprietary scoring system (>7.8 = Trending, >8.5 = Viral)

**2. COMPREHENSIVE TOKEN ANALYTICS**
- **Overall Score**: 0-10 rating based on multiple factors (liquidity, holders, volume, organic growth)
- **Holder Analysis**: Distribution, concentration, growth patterns, whale/retail activity
- **Technical Analysis**: Price action, volume trends, support/resistance levels
- **Social Context**: Community engagement, mentions, sentiment analysis
- **Risk Assessment**: Security audits, liquidity risks, holder concentration warnings

**3. ADVANCED TOOLS**
- **Watchlist**: Track your favorite tokens with price alerts and performance monitoring
- **KOL Calls**: Make timestamped calls on tokens and track your performance
- **Hype Over Time**: AI-powered trend prediction and momentum analysis
- **Oracle Chart Analysis**: Deep technical analysis with pattern recognition
- **Holder Insights**: Detailed holder distribution and flow analysis

**4. PREMIUM FEATURES (MP/VIP)**
- Advanced AI analysis and predictions
- Priority access to trending tokens
- Enhanced technical analysis tools
- Exclusive insights and alpha calls
- Premium support and features

🔥 **HOW TRENDING WORKS:**
Our trending algorithm analyzes multiple data points:
- **Volume Surge**: Unusual trading activity and volume spikes
- **Holder Growth**: New wallet adoption and community expansion  
- **Price Momentum**: Sustained price action and breakout patterns
- **Social Buzz**: Mentions, engagement, and community activity
- **Liquidity Health**: Market depth and trading accessibility
- **Organic Score**: Authenticity vs artificial pump detection

Tokens are scored 0-10 and categorized:
- **Viral** (8.5-10): Explosive growth, maximum attention
- **Trending** (7.8-8.4): Strong momentum, gaining traction
- **Building** (6.0-7.7): Developing interest, worth watching
- **Waking Up** (4.0-5.9): Early signs of activity
- **Sleeping** (0-3.9): Low activity, minimal interest

🛠 **PLATFORM SERVICES:**

**List Token Service**: Add new tokens to our database for tracking and analysis
**Fuel Token Service**: Boost token visibility and priority in our system  
**Update Token Service**: Refresh token data and metadata
**Premium Subscriptions**: Access to advanced features and AI insights

🎪 **USER EXPERIENCE:**
- **Bubble Map**: Visual representation of trending tokens by market cap and momentum
- **Token Details**: Comprehensive analysis modals with all relevant data
- **User Dashboard**: Personal portfolio tracking, call history, and performance metrics
- **Real-time Updates**: Live data feeds and instant notifications
- **Mobile Optimized**: Responsive design for trading on the go

💎 **COMMUNITY:**
Degen Oracle serves the Solana degen community with:
- Alpha calls and early token discovery
- Educational content about memecoin trading
- Community-driven insights and discussions
- Transparent performance tracking
- No-BS analysis with authentic crypto slang

When users ask about the platform, trending mechanics, features, or how things work, use this knowledge to provide comprehensive, engaging answers with crypto slang!

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
      console.log(`🔍 [KOL DEBUG] Adding KOL calls to AI prompt:`, {
        count: userContext.kolCalls.count,
        hasSummary: !!userContext.kolCalls.summary,
        bestCall: userContext.kolCalls.summary?.bestCall?.token?.symbol,
        bestMultiplier: userContext.kolCalls.summary?.bestCall?.performance?.multiplier
      });
      
      systemContext += `\n\nKOL CALLS SUMMARY:
- Total Calls: ${userContext.kolCalls.count}
- Best Performing Call: ${userContext.kolCalls.summary.bestCall?.token?.symbol} (${userContext.kolCalls.summary.bestCall?.performance?.multiplier?.toFixed(2)}x)
- Average Performance: ${userContext.kolCalls.summary.avgMultiplier?.toFixed(2)}x
- Win Rate: ${userContext.kolCalls.summary.winRate}%

TOP 5 CALLS:`;
      
      userContext.kolCalls.calls.slice(0, 5).forEach((call, index) => {
        systemContext += `\n${index + 1}. ${call.token.symbol}: ${call.performance.multiplier?.toFixed(2)}x (${call.performance.status})`;
      });
    } else {
      console.log(`🔍 [KOL DEBUG] No KOL calls data for AI prompt:`, {
        hasKolCalls: !!userContext.kolCalls,
        count: userContext.kolCalls?.count || 0
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
          if (result.error === 'TOKEN_NOT_FOUND') {
            systemContext += `\n💡 IMPORTANT: The token "${result.originalQuery || 'requested token'}" is not in our database. Ask the user to provide the contract address or use our List Token service.`;
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

    // Add token data if retrieved
    if (userContext.tokenData && Object.keys(userContext.tokenData).length > 0) {
      systemContext += `\n\nTOKEN DATA RETRIEVED:`;
      systemContext += `\nIMPORTANT: I have successfully found and retrieved data for the requested token(s). Use this data to answer the user's question directly.`;
      
      Object.entries(userContext.tokenData).forEach(([contractAddress, data]) => {
        systemContext += `\n📊 ${contractAddress}:`;
        if (data.analytics) {
          systemContext += `\n   - Symbol: ${data.analytics.symbol}`;
          systemContext += `\n   - Name: ${data.analytics.name}`;
          systemContext += `\n   - Price: $${data.analytics.price}`;
          if (data.analytics.marketCap) {
            systemContext += `\n   - Market Cap: $${data.analytics.marketCap.toLocaleString()}`;
          }
          if (data.analytics.volume24h) {
            systemContext += `\n   - Volume 24h: $${data.analytics.volume24h.toLocaleString()}`;
          }
          if (data.analytics.priceChange24h) {
            systemContext += `\n   - Price Change 24h: ${data.analytics.priceChange24h}%`;
          }
        }
        if (data.databaseInfo) {
          systemContext += `\n   - Database Info: ${data.databaseInfo.name} (${data.databaseInfo.symbol})`;
          systemContext += `\n   - IMPORTANT: This token was found in our database automatically.`;
        }
      });
      
      systemContext += `\n\nSince I have retrieved the token data above, provide the requested information directly. Do NOT ask for contract addresses.`;
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
