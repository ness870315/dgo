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
          // Price queries
          /(?:price|volume|holders?|market cap|liquidity|transactions?|ath|all.?time.?high) of \w+/i,
          /\w+ (?:price|volume|holders?|market cap|ath|all.?time.?high)/i,
          /what.*?(?:price|volume|holders?|ath|all.?time.?high) of/i,
          /what.*?(?:is|are).*?\w+.*?(?:ath|all.?time.?high|price|volume)/i,
          /(?:current|latest|highest) (?:price|data|ath) (?:of|for) \w+/i,
          /(?:current|latest) price of .* and .*/i, // Multi-token price queries
          /what.*?price of .* and .*/i,
          
          // Volume and trading
          /(?:buy|sell) (?:volume|pressure) (?:of|for) \w+/i,
          
          // Wallet analysis
          /wallet.*?(?:analysis|transactions?|activity|hold)/i,
          /what.*?(?:tokens?|nfts?).*?(?:wallet|address).*?(?:hold|own)/i,
          /(?:tokens?|nfts?).*?(?:wallet|address).*?hold/i,
          /show.*?(?:nfts?|tokens?).*?owned by/i,
          /show.*?(?:nfts?|tokens?).*?(?:wallet|address)/i,
          
          // On-chain data
          /on-chain.*?(?:data|analysis)/i,
          /whale.*?activity.*?for\s+[a-z0-9]{32,}/i,
          /show.*?(?:whale|activity|transactions?).*?[a-z0-9]{32,}/i,
          /[a-z0-9]{32,}.*?(?:whale|activity|analysis|data)/i,
          /(?:whale|activity|analysis|data).*?[a-z0-9]{32,}/i,
          
          // Holder distribution
          /(?:holder|holders?).*?distribution/i,
          /analyze.*?holder/i,
          /holder.*?analysis/i,
          
          // Entity/Exchange analysis
          /find.*?wallet.*?(?:associated|linked|related)/i,
          /wallet.*?associated.*?with/i,
          
          // General alpha/market
          /give.*?(?:me|us).*?(?:some|the)?.*?alpha/i,
          /(?:crypto|market|blockchain).*?news/i,
          /how.*?(?:is|are).*?(?:the)?.*?market.*?(?:today|now|doing)/i,
          /(?:market|crypto).*?(?:today|now|update)/i,
          
          // Generic analysis patterns
          /(?:holder|market|volume|price|analysis).*?(?:of|on|for) \w+/i,
          /\w+.*?(?:holder|market|volume|price|analysis)/i,
          /(?:analysis|data|info).*?(?:of|on|for) \w+/i,
          /\w+.*?(?:analysis|data|info)/i
        ],
        keywords: [
          // Price & metrics
          'price of', 'volume of', 'holders of', 'market cap of', 'liquidity of', 
          'ath', 'all-time high', 'all time high', 'highest price', 'peak price', 'high',
          'current price', 'price of',
          
          // Wallet & on-chain
          'wallet', 'on-chain', 'whale activity', 'show me', 'tokens hold', 'nfts owned',
          'wallet holds', 'wallet analysis',
          
          // Analysis types
          'holder analysis', 'market analysis', 'volume analysis', 'price analysis', 
          'analysis of', 'data of', 'info of', 'holder distribution', 'analyze holder',
          
          // Alpha/Market
          'give me alpha', 'some alpha', 'crypto news', 'market news', 
          'how is the market', 'market today', 'market update',
          
          // Entity analysis
          'find wallet', 'associated with', 'linked to'
        ],
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
          /how.*?(?:works?|use).*?(?:degen oracle|platform|trending algorithm)/i,
          /(?:platform )?features/i,
          /(?:premium|subscription|mp|vip).*?(?:features|services|benefits)/i,
          /(?:list token|fuel token|update token).*?(?:service|feature)/i,
          /(?:bubble map|oracle chart|hype over time).*?(?:works?|use)/i,
          /how do i.*?(?:use|access).*?(?:platform|features|services)/i
        ],
        keywords: ['degen oracle features', 'platform features', 'how does platform', 'premium features', 'services', 'help me', 'how to use'],
        priority: 'low'
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

      // Off-Topic / Non-Crypto Requests
      OFF_TOPIC: {
        patterns: [
          /(?:make|create|build|get|fetch|bring) (?:me|us) (?:a|an|some) (?:sandwich|food|coffee|drink|pizza)/i,
          /tell (?:me|us) (?:a|an) (?:joke|story|riddle|poem)/i,
          /(?:what|who) (?:is|are) (?:the|your) (?:meaning of life|weather|time|president|capital)/i,
          /(?:play|sing|dance|draw|write) (?:a|something|for me)/i,
          /(?:how|what) (?:is|are|do) (?:you|your) (?:name|age|birthday|favorite|feeling)/i,
          /(?:do you|can you|will you) (?:love|like|hate|marry|date)/i,
          /(?:recipe|cooking|baking|food|restaurant) (?:for|recommendation)/i,
          /(?:movie|music|book|game|sports) (?:recommendation|suggestion)/i,
          /(?:translate|speak|say) (?:in|to) (?:spanish|french|german|chinese)/i
        ],
        keywords: ['make me', 'tell me a joke', 'weather', 'recipe', 'movie', 'music', 'translate', 'play a', 'sing', 'your name', 'your age'],
        priority: 'low'
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
      OFF_TOPIC: 'none', // No data needed for off-topic
      GENERAL: 'general'
    };
    return priorities[intent] || 'general';
  }
}

export default SmartIntentDetector;
