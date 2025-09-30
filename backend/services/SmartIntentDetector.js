/**
 * Smart Intent Detection System
 * Routes user queries to appropriate specialized prompt modules
 */

class SmartIntentDetector {
  constructor() {
    this.intents = {
      // Specific Token Data (Moralis Cortex)
      BLOCKCHAIN_QUERY: {
        patterns: [
          /(?:price|volume|holders?|market cap|liquidity|transactions?) of \w+/i,
          /\w+ (?:price|volume|holders?|market cap)/i,
          /what.*?(?:price|volume|holders?) of/i,
          /(?:current|latest) (?:price|data) (?:of|for) \w+/i,
          /(?:buy|sell) (?:volume|pressure) (?:of|for) \w+/i,
          /wallet.*?(?:analysis|transactions?|activity)/i,
          /on-chain.*?(?:data|analysis)/i,
          /whale.*?activity.*?for\s+[a-z0-9]{32,}/i,
          /show.*?(?:whale|activity|transactions?).*?[a-z0-9]{32,}/i,
          /[a-z0-9]{32,}.*?(?:whale|activity|analysis|data)/i,
          /(?:whale|activity|analysis|data).*?[a-z0-9]{32,}/i,
          /(?:holder|market|volume|price|analysis).*?(?:of|on|for) \w+/i,
          /\w+.*?(?:holder|market|volume|price|analysis)/i,
          /(?:analysis|data|info).*?(?:of|on|for) \w+/i,
          /\w+.*?(?:analysis|data|info)/i
        ],
        keywords: ['price of', 'volume of', 'holders of', 'market cap of', 'liquidity of', 'wallet', 'on-chain', 'whale activity', 'show me', 'holder analysis', 'market analysis', 'volume analysis', 'price analysis', 'analysis of', 'data of', 'info of'],
        priority: 'high'
      },

      // General Market/Volume Queries (Moralis Cortex)
      GENERAL_BLOCKCHAIN: {
        patterns: [
          /which tokens? (?:have|with) (?:unusual|high|low) volume/i,
          /tokens? (?:have|with) (?:unusual|high) volume/i,
          /(?:unusual|high|abnormal) volume (?:today|now)/i,
          /market (?:overview|analysis|trends)/i,
          /volume (?:spikes?|analysis|trends)/i,
          /solana market/i,
          /crypto market/i,
          /show me volume/i,
          /volume analysis/i
        ],
        keywords: ['unusual volume', 'which tokens', 'volume today', 'market overview', 'volume spikes', 'market trends', 'solana market', 'volume analysis'],
        priority: 'high'
      },

      // Degen Oracle Platform Data
      PLATFORM_QUERY: {
        patterns: [
          /(?:trending|viral|building|waking up|sleeping)/i,
          /(?:calls?|performance)/i,
          /(?:best|top|worst).*?(?:call|performance)/i,
          /(?:my|user).*?(?:calls?|performance)/i,
          /degen oracle.*?(?:trending|features)/i,
          /(?:leaderboard|ranking|top users?)/i,
          /what.*?(?:is|are).*?(?:trending|viral|building)/i,
          /(?:trending|viral|building).*?(?:on|in).*?(?:my|your).*?(?:watchlist|portfolio)/i
        ],
        keywords: ['trending', 'calls', 'performance', 'leaderboard', 'ranking', 'degen oracle', 'viral', 'building'],
        priority: 'high'
      },

      // Watchlist Queries (separate from trending)
      WATCHLIST_QUERY: {
        patterns: [
          /what.*?(?:is|are).*?(?:on|in).*?(?:my|your).*?(?:watchlist|portfolio)/i,
          /(?:show|list).*?(?:my|your).*?(?:watchlist|portfolio)/i,
          /(?:my|your).*?(?:watchlist|portfolio).*?(?:contains?|has|shows?)/i,
          /(?:watchlist|portfolio).*?(?:contents?|items?|tokens?)/i
        ],
        keywords: ['what is on', 'what are on', 'show watchlist', 'list watchlist', 'my watchlist', 'portfolio'],
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
          /add\s+\w+\s+to\s+(?:my\s+)?watchlist/i,
          /add.*?(?:to|my).*?watchlist/i,
          /watchlist.*?(?:add|remove)/i,
          /(?:track|monitor|follow).*?(?:token|coin)/i
        ],
        keywords: ['add to watchlist', 'add', 'track', 'monitor'],
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

    // Special case: If prompt contains a Solana contract address (32+ chars), it's likely a blockchain query
    const contractAddressPattern = /[a-z0-9]{32,}/i;
    const hasContractAddress = contractAddressPattern.test(prompt);
    
    console.log(`🔍 [INTENT DEBUG] Prompt contains contract address: ${hasContractAddress}`);
    if (hasContractAddress) {
      console.log(`🔍 [INTENT DEBUG] Contract address detected, boosting BLOCKCHAIN_QUERY score`);
    }

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

      // Special boost for blockchain queries with contract addresses
      if (intentName === 'BLOCKCHAIN_QUERY' && hasContractAddress) {
        score += 15; // Strong boost for contract address queries
        matchedKeywords.push('contract_address_detected');
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
    return ['PLATFORM_QUERY', 'WATCHLIST_QUERY', 'WATCHLIST_ACTION'].includes(intent);
  }

  /**
   * Get data source priority for intent
   */
  getDataSourcePriority(intent) {
    const priorities = {
      BLOCKCHAIN_QUERY: 'blockchain',
      GENERAL_BLOCKCHAIN: 'blockchain',
      PLATFORM_QUERY: 'user',
      PLATFORM_INFO: 'general',
      WATCHLIST_ACTION: 'hybrid',
      GENERAL: 'general'
    };
    return priorities[intent] || 'general';
  }
}

export default SmartIntentDetector;
