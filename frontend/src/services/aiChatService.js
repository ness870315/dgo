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
   * Send a message to the AI chat
   */
  async sendMessage(prompt) {
    try {
      const sessionId = localStorage.getItem('sessionId');
      
      if (!sessionId) {
        throw new Error('No session found. Please log in first.');
      }

      console.log(`🤖 Sending AI chat message: "${prompt.substring(0, 50)}..."`);

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

      console.log(`✅ AI response received. Data sources used: ${data.dataUsed?.join(', ') || 'none'}`);

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
      "From my watchlist, what's the most bullish memecoin?",
      "How many milestones have I hit this month?",
      "What's my average call performance?",
      "Show me my worst performing calls",
      "What tokens are trending in my hype list?",
      "What's the current price of SOL?",
      "How's my portfolio performing overall?",
      "Which of my calls has the highest ATH multiplier?",
      "What's my win rate on KOL calls?"
    ];
  }

  /**
   * Execute an action suggestion
   */
  async executeAction(action) {
    try {
      const sessionId = localStorage.getItem('sessionId');
      
      if (!sessionId) {
        throw new Error('No session found. Please log in first.');
      }

      console.log(`🎯 Executing action: ${action.type} for ${action.contractAddress}`);

      if (action.type === 'ADD_TO_WATCHLIST') {
        // Use the existing watchlist API
        const response = await fetch(`${this.API_BASE}/api/watchlist/add`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            sessionId,
            contractAddress: action.contractAddress,
            symbol: action.symbol || 'Unknown'
          })
        });

        if (!response.ok) {
          throw new Error(`Failed to add to watchlist: ${response.status}`);
        }

        const result = await response.json();
        return {
          success: true,
          message: `Successfully added to watchlist!`,
          result
        };
      }

      // Add more action types here as needed
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
   * Check if AI chat is available (has session)
   */
  isAvailable() {
    return !!localStorage.getItem('sessionId');
  }
}

const aiChatService = new AIChatService();
export default aiChatService;
