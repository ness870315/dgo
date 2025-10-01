/**
 * AI Chat Service - Frontend service for Moralis AI integration with user context
 */
class AIChatService {
  constructor() {
    this.API_BASE = process.env.REACT_APP_API_BASE_URL || 'https://api.degen-oracle.com';
    this.conversationHistory = [];
    this.maxHistoryLength = 10; // Keep last 10 messages for context
  }

  /**
   * Get the current session ID (supports both OAuth X and demo sessions)
   */
  getSessionId() {
    const authType = localStorage.getItem('authType');
    if (authType === 'demo') {
      return localStorage.getItem('demoSessionId');
    }
    return localStorage.getItem('sessionId');
  }

  /**
   * Send a message to the AI chat
   */
  async sendMessage(prompt) {
    try {
      const sessionId = this.getSessionId();
      
      if (!sessionId) {
        throw new Error('No session found. Please log in first.');
      }


      const response = await fetch(`${this.API_BASE}/api/ai/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sessionId,
          prompt,
          conversationHistory: this.conversationHistory
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'AI chat failed');
      }

      // Add to conversation history
      this.addToHistory('user', prompt);
      this.addToHistory('assistant', data.response.content);


      return {
        success: true,
        content: data.response.content,
        hasUserData: data.hasUserData,
        dataUsed: data.dataUsed,
        actionSuggestions: data.response.actionSuggestions || [],
        commandsExecuted: data.commandsExecuted || [],
        timestamp: data.timestamp
      };

    } catch (error) {
      console.error('❌ AI Chat error:', error);
      
      return {
        success: false,
        content: "I'm having trouble connecting to my AI brain right now 🧠 Please try again in a moment!",
        error: error.message,
        hasUserData: false,
        dataUsed: []
      };
    }
  }

  /**
   * Add message to conversation history
   */
  addToHistory(role, content) {
    this.conversationHistory.push({
      role,
      content,
      timestamp: new Date().toISOString()
    });

    // Keep only the last N messages
    if (this.conversationHistory.length > this.maxHistoryLength) {
      this.conversationHistory = this.conversationHistory.slice(-this.maxHistoryLength);
    }
  }

  /**
   * Clear conversation history
   */
  clearHistory() {
    this.conversationHistory = [];
  }

  /**
   * Get conversation history
   */
  getHistory() {
    return [...this.conversationHistory];
  }

  /**
   * Get suggested questions based on user context
   */
  getSuggestedQuestions() {
    return [
      "What's my most profitable KOL call?",
      "What is trending on my watchlist?",
      "How many calls I've done so far?",
      "What's on my watchlist?",
      "What is trending on Degen Oracle?",
      "What's my average call performance?",
      "Holder analysis of Memeputer",
      "What is the current price of Fartcoin?",
      "Tell me the 24hr volume of Aura"
    ];
  }

  /**
   * Execute an action suggestion
   */
  async executeAction(action) {
    try {
      const sessionId = this.getSessionId();
      
      if (!sessionId) {
        throw new Error('No session found. Please log in first.');
      }

      console.log(`🎯 Executing action: ${action.type} for ${action.contractAddress}`);

      if (action.type === 'ADD_TO_WATCHLIST') {
        // Use the correct watchlist API endpoint and format
        const response = await fetch(`${this.API_BASE}/api/user/watchlist/add`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            sessionId,
            tokenData: {
              contractAddress: action.contractAddress,
              symbol: action.symbol || 'Unknown',
              name: action.name || 'Unknown Token'
            }
          })
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.message || `Failed to add to watchlist: ${response.status}`);
        }

        const result = await response.json();
        return {
          success: true,
          message: `✅ Successfully added to watchlist!`,
          result
        };
      }

      if (action.type === 'GET_FULL_ANALYSIS') {
        // For now, suggest using the main app features
        return {
          success: true,
          message: `📊 To get full analysis, click on the token in the main bubble map or search for it in the token list.`,
          actionType: 'info'
        };
      }

      if (action.type === 'VIEW_CHART') {
        // For now, suggest using the main app features  
        return {
          success: true,
          message: `📈 To view the price chart, click on the token in the main bubble map and select "Oracle Chart".`,
          actionType: 'info'
        };
      }

      throw new Error(`Unknown action type: ${action.type}`);

    } catch (error) {
      console.error('❌ Action execution error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Save current chat history
   */
  async saveChatHistory(title = null) {
    try {
      const sessionId = localStorage.getItem('sessionId');
      
      if (!sessionId) {
        throw new Error('No session found. Please log in first.');
      }

      if (this.conversationHistory.length === 0) {
        throw new Error('No conversation to save.');
      }

      console.log(`💾 Saving chat history: ${this.conversationHistory.length} messages`);

      const response = await fetch(`${this.API_BASE}/api/ai/chat/save`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sessionId,
          chatHistory: this.conversationHistory,
          title: title || `Chat ${new Date().toLocaleDateString()}`
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      console.log(`✅ Chat history saved: ${data.history.title}`);
      
      return data.history;

    } catch (error) {
      console.error('❌ Save chat history error:', error);
      throw error;
    }
  }

  /**
   * Get saved chat histories
   */
  async getChatHistories() {
    try {
      const sessionId = localStorage.getItem('sessionId');
      
      if (!sessionId) {
        throw new Error('No session found. Please log in first.');
      }

      const response = await fetch(`${this.API_BASE}/api/ai/chat/histories?sessionId=${sessionId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      return data.histories;

    } catch (error) {
      console.error('❌ Get chat histories error:', error);
      return [];
    }
  }

  /**
   * Load specific chat history
   */
  async loadChatHistory(historyId) {
    try {
      const sessionId = localStorage.getItem('sessionId');
      
      if (!sessionId) {
        throw new Error('No session found. Please log in first.');
      }

      const response = await fetch(`${this.API_BASE}/api/ai/chat/history/${historyId}?sessionId=${sessionId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      
      // Replace current conversation history
      this.conversationHistory = [...data.history.messages];
      
      console.log(`📖 Loaded chat history: ${data.history.title} (${data.history.messageCount} messages)`);
      return data.history;

    } catch (error) {
      console.error('❌ Load chat history error:', error);
      throw error;
    }
  }

  /**
   * Update existing chat history with new messages
   */
  async updateChatHistory(historyId, messages) {
    try {
      const sessionId = localStorage.getItem('sessionId');
      
      if (!sessionId) {
        throw new Error('No session found. Please log in first.');
      }

      const response = await fetch(`${this.API_BASE}/api/ai/chat/history/${historyId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sessionId,
          messages
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      console.log(`💾 Updated chat history: ${historyId} (${messages.length} messages)`);
      
      return data.history;

    } catch (error) {
      console.error('❌ Update chat history error:', error);
      throw error;
    }
  }

  /**
   * Delete chat history
   */
  async deleteChatHistory(historyId) {
    try {
      const sessionId = localStorage.getItem('sessionId');
      
      if (!sessionId) {
        throw new Error('No session found. Please log in first.');
      }

      const response = await fetch(`${this.API_BASE}/api/ai/chat/history/${historyId}?sessionId=${sessionId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      console.log(`🗑️ Deleted chat history: ${historyId}`);
      
      return data.histories;

    } catch (error) {
      console.error('❌ Delete chat history error:', error);
      throw error;
    }
  }

  /**
   * Get personalized suggestions
   */
  async getPersonalizedSuggestions() {
    try {
      const sessionId = localStorage.getItem('sessionId');
      
      if (!sessionId) {
        return this.getSuggestedQuestions(); // Fallback to default
      }

      const response = await fetch(`${this.API_BASE}/api/ai/suggestions?sessionId=${sessionId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        return this.getSuggestedQuestions(); // Fallback to default
      }

      const data = await response.json();
      return data.suggestions;

    } catch (error) {
      console.error('❌ Get personalized suggestions error:', error);
      return this.getSuggestedQuestions(); // Fallback to default
    }
  }

  /**
   * Check if AI chat is available (has session)
   */
  isAvailable() {
    return !!localStorage.getItem('sessionId');
  }
}

const aiChatService = new AIChatService();
export default aiChatService;
