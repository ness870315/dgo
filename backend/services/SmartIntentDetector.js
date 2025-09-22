/**
 * Smart Intent Detection System
 * Routes user queries to appropriate specialized prompt modules
 */

class SmartIntentDetector {
  constructor() {
    this.intents = {
      // Blockchain/Token Data (Moralis Cortex)
      BLOCKCHAIN_QUERY: {
        patterns: [
          /(?:price|volume|holders?|market cap|liquidity|transactions?)/i,
          /what.*?(?:price|volume|holders?)/i,
          /(?:current|latest).*?(?:price|data)/i,
          /(?:buy|sell).*?(?:volume|pressure)/i,
          /wallet.*?(?:analysis|transactions?|activity)/i,
          /on-chain.*?(?:data|analysis)/i,
          /blockchain.*?(?:data|info)/i
        ],
        keywords: ['price', 'volume', 'holders', 'market cap', 'liquidity', 'transactions', 'wallet', 'on-chain', 'blockchain'],
        priority: 'high'
      },

      // Degen Oracle Platform Data
      PLATFORM_QUERY: {
        patterns: [
          /(?:trending|viral|building|waking up|sleeping)/i,
          /(?:watchlist|calls?|performance)/i,
          /(?:best|top|worst).*?(?:call|performance)/i,
          /(?:my|user).*?(?:calls?|watchlist|performance)/i,
          /degen oracle.*?(?:trending|features)/i,
          /(?:leaderboard|ranking|top users?)/i
        ],
        keywords: ['trending', 'watchlist', 'calls', 'performance', 'leaderboard', 'ranking', 'degen oracle'],
        priority: 'high'
      },

      // Platform Information/Help
      PLATFORM_INFO: {
        patterns: [
          /what.*?(?:is|does).*?degen oracle/i,
          /how.*?(?:works?|use|trending)/i,
          /(?:features|tools|services)/i,
          /(?:premium|subscription|mp|vip)/i,
          /(?:list token|fuel token|update token)/i,
          /(?:bubble map|oracle chart|hype over time)/i
        ],
        keywords: ['what is', 'how does', 'features', 'premium', 'services', 'help'],
        priority: 'medium'
      },

      // Watchlist Actions
      WATCHLIST_ACTION: {
        patterns: [
          /add.*?(?:to|my).*?watchlist/i,
          /watchlist.*?(?:add|remove)/i,
          /(?:track|monitor|follow).*?(?:token|coin)/i
        ],
        keywords: ['add to watchlist', 'watchlist', 'track', 'monitor'],
        priority: 'high'
      },

      // General Conversation
      GENERAL: {
        patterns: [
          /(?:hello|hi|hey|thanks|thank you)/i,
          /(?:good|great|awesome|cool)/i,
          /(?:help|support|question)/i
        ],
        keywords: ['hello', 'hi', 'thanks', 'help'],
        priority: 'low'
      }
    };
  }

  /**
   * Detect intent from user prompt
   */
  detectIntent(prompt) {
    const lowerPrompt = prompt.toLowerCase();
    const results = [];

    // Score each intent
    for (const [intentName, config] of Object.entries(this.intents)) {
      let score = 0;
      let matchedPatterns = [];
      let matchedKeywords = [];

      // Pattern matching
      for (const pattern of config.patterns) {
        if (pattern.test(lowerPrompt)) {
          score += 10;
          matchedPatterns.push(pattern.toString());
        }
      }

      // Keyword matching
      for (const keyword of config.keywords) {
        if (lowerPrompt.includes(keyword)) {
          score += 5;
          matchedKeywords.push(keyword);
        }
      }

      // Priority boost
      if (config.priority === 'high') score *= 1.5;
      else if (config.priority === 'medium') score *= 1.2;

      if (score > 0) {
        results.push({
          intent: intentName,
          score,
          confidence: Math.min(score / 20, 1.0), // Normalize to 0-1
          matchedPatterns,
          matchedKeywords,
          config
        });
      }
    }

    // Sort by score and return top intent
    results.sort((a, b) => b.score - a.score);
    
    const topIntent = results[0] || {
      intent: 'GENERAL',
      score: 1,
      confidence: 0.1,
      matchedPatterns: [],
      matchedKeywords: [],
      config: this.intents.GENERAL
    };

    console.log(`🧠 [INTENT] Detected: ${topIntent.intent} (confidence: ${(topIntent.confidence * 100).toFixed(1)}%)`);
    console.log(`🧠 [INTENT] Matched patterns: ${topIntent.matchedPatterns.length}`);
    console.log(`🧠 [INTENT] Matched keywords: ${topIntent.matchedKeywords.join(', ')}`);

    return {
      primary: topIntent,
      alternatives: results.slice(1, 3), // Top 2 alternatives
      allResults: results
    };
  }

  /**
   * Check if intent requires token lookup
   */
  requiresTokenLookup(intent) {
    return ['BLOCKCHAIN_QUERY', 'WATCHLIST_ACTION'].includes(intent);
  }

  /**
   * Check if intent requires user data
   */
  requiresUserData(intent) {
    return ['PLATFORM_QUERY', 'WATCHLIST_ACTION'].includes(intent);
  }

  /**
   * Get data source priority for intent
   */
  getDataSourcePriority(intent) {
    const priorities = {
      BLOCKCHAIN_QUERY: 'blockchain',
      PLATFORM_QUERY: 'user',
      PLATFORM_INFO: 'general',
      WATCHLIST_ACTION: 'hybrid',
      GENERAL: 'general'
    };
    return priorities[intent] || 'general';
  }
}

export default SmartIntentDetector;
