/**
 * Topic Analysis Service
 * Identifies trending crypto topics across tracked accounts using AI and pattern matching
 */

import OpenAI from 'openai';
import PerplexitySonarService from './PerplexitySonarService.js';

class TopicAnalysisService {
  constructor() {
    // Initialize AI services
    this.openai = null;
    if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      });
    }
    
    this.perplexityService = new PerplexitySonarService();
    
    // Crypto topic categories
    this.topicCategories = {
      'DeFi': ['defi', 'uniswap', 'aave', 'compound', 'maker', 'curve', 'sushi', '1inch', 'yearn', 'balancer'],
      'NFT': ['nft', 'opensea', 'blur', 'magiceden', 'yuga', 'bored ape', 'cryptopunks', 'azuki'],
      'Layer1': ['bitcoin', 'ethereum', 'solana', 'avalanche', 'polygon', 'cardano', 'polkadot', 'cosmos'],
      'Layer2': ['arbitrum', 'optimism', 'polygon', 'base', 'scroll', 'zk-sync', 'starknet'],
      'Meme': ['doge', 'shib', 'pepe', 'floki', 'bonk', 'wif', 'popcat', 'meme'],
      'Gaming': ['gaming', 'gamefi', 'axie', 'sandbox', 'decentraland', 'illuvium', 'gala'],
      'AI': ['ai', 'artificial intelligence', 'machine learning', 'chatgpt', 'openai', 'anthropic'],
      'RWA': ['rwa', 'real world assets', 'tokenization', 'real estate', 'commodities'],
      'Privacy': ['privacy', 'monero', 'zcash', 'tornado', 'mixer', 'anonymous'],
      'Staking': ['staking', 'validator', 'delegation', 'yield', 'rewards', 'apy'],
      'Trading': ['trading', 'dex', 'cex', 'binance', 'coinbase', 'kraken', 'volume', 'liquidity'],
      'Regulation': ['regulation', 'sec', 'cfdc', 'compliance', 'legal', 'policy', 'government'],
      'Institutional': ['institutional', 'etf', 'adoption', 'corporate', 'enterprise', 'blackrock'],
      'Infrastructure': ['infrastructure', 'rpc', 'node', 'validator', 'mining', 'consensus']
    };

    // Topic extraction patterns
    this.topicPatterns = [
      // Direct mentions
      { pattern: /\b(defi|nft|ai|gaming|staking|trading)\b/gi, category: 'General' },
      // Token-specific topics
      { pattern: /\b(bitcoin|btc|ethereum|eth|solana|sol)\b/gi, category: 'Layer1' },
      { pattern: /\b(doge|shib|pepe|floki|bonk)\b/gi, category: 'Meme' },
      // Protocol mentions
      { pattern: /\b(uniswap|aave|compound|maker|curve)\b/gi, category: 'DeFi' },
      { pattern: /\b(opensea|blur|magiceden)\b/gi, category: 'NFT' },
      // Trend indicators
      { pattern: /\b(pump|moon|rocket|bull|bear|dip|crash)\b/gi, category: 'Market' },
      { pattern: /\b(etf|adoption|institutional|corporate)\b/gi, category: 'Institutional' }
    ];

    // Enhanced sentiment indicators for topics (crypto slang included)
    this.sentimentIndicators = {
      positive: [
        'bullish', 'moon', 'pump', 'rocket', 'breakout', 'rally', 'surge', 'explode',
        'hodl', 'diamond hands', 'wagmi', 'lfg', 'based', 'chad', 'gmi', 'parabolic',
        'mooning', 'pumping', 'green', 'gains', 'profit', 'winning', 'strong', 'solid',
        'buy', 'long', 'accumulate', 'bullish af', 'to the moon', 'going up', 'rising',
        'breakthrough', 'adoption', 'partnership', 'integration', 'launch', 'upgrade'
      ],
      negative: [
        'bearish', 'crash', 'dump', 'dip', 'correction', 'selloff', 'panic',
        'rekt', 'paper hands', 'ngmi', 'cope', 'seethe', 'fud', 'scam', 'rug',
        'dumping', 'red', 'loss', 'losing', 'weak', 'failing', 'dead', 'dying',
        'sell', 'short', 'exit', 'bearish af', 'going down', 'falling', 'crashing',
        'warning', 'risk', 'danger', 'avoid', 'caution', 'concern', 'problem'
      ],
      neutral: [
        'analysis', 'update', 'news', 'report', 'data', 'chart', 'technical',
        'watching', 'monitoring', 'tracking', 'observing', 'sideways', 'consolidating',
        'waiting', 'patience', 'mixed', 'unclear', 'uncertain', 'tbd', 'pending'
      ]
    };

    console.log('🔥 [TOPIC ANALYSIS] Service initialized with AI-powered topic extraction');
  }

  /**
   * Extract topics from tweet text using multiple methods
   */
  async extractTopics(tweetText, tweetMetadata = {}) {
    try {
      const topics = new Set();
      
      // Method 1: Rule-based pattern matching
      const ruleBasedTopics = this.extractTopicsByPatterns(tweetText);
      ruleBasedTopics.forEach(topic => topics.add(topic));
      
      // Method 2: AI-powered topic extraction
      const aiTopics = await this.extractTopicsWithAI(tweetText);
      aiTopics.forEach(topic => topics.add(topic));
      
      // Method 3: Category-based analysis
      const categoryTopics = this.extractTopicsByCategory(tweetText);
      categoryTopics.forEach(topic => topics.add(topic));
      
      // Get tweet's overall sentiment from metadata (if available from CryptoTrackingDatabase)
      const tweetSentiment = tweetMetadata.sentiment || null;
      
      // Convert to array and add metadata
      const extractedTopics = Array.from(topics).map(topic => ({
        name: topic,
        category: this.categorizeTopic(topic),
        confidence: this.calculateTopicConfidence(topic, tweetText),
        sentiment: this.extractTopicSentiment(topic, tweetText, tweetSentiment),
        extractedAt: new Date().toISOString(),
        methods: this.getExtractionMethods(topic, tweetText)
      }));

      return extractedTopics;

    } catch (error) {
      console.error('❌ [TOPIC ANALYSIS] Error extracting topics:', error.message);
      return [];
    }
  }

  /**
   * Rule-based topic extraction using patterns
   */
  extractTopicsByPatterns(text) {
    const topics = new Set();
    const lowerText = text.toLowerCase();

    // Check each pattern
    this.topicPatterns.forEach(({ pattern, category }) => {
      const matches = lowerText.match(pattern);
      if (matches) {
        matches.forEach(match => {
          const cleanMatch = match.trim();
          if (cleanMatch.length > 2) {
            topics.add(cleanMatch);
          }
        });
      }
    });

    // Extract crypto tokens (uppercase, starts with $)
    const tokenMatches = text.match(/\$[A-Z]{2,10}/g);
    if (tokenMatches) {
      tokenMatches.forEach(token => {
        const cleanToken = token.replace('$', '').toLowerCase();
        topics.add(cleanToken);
      });
    }

    return Array.from(topics);
  }

  /**
   * AI-powered topic extraction using OpenAI
   */
  async extractTopicsWithAI(text) {
    try {
      if (!this.openai) {
        console.warn('⚠️ [TOPIC ANALYSIS] OpenAI not available, skipping AI extraction');
        return [];
      }

      const prompt = `
Analyze this crypto tweet and extract the main topics and themes. Focus on:
- Crypto projects, tokens, protocols
- Market trends and sentiment
- Technology categories (DeFi, NFT, AI, etc.)
- Trading and investment themes

Tweet: "${text}"

Return ONLY a JSON array of topic names (lowercase, no duplicates):
["topic1", "topic2", "topic3"]

Example: ["bitcoin", "etf", "bullish", "institutional"]
`;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 200,
        temperature: 0.3
      });

      const content = response.choices[0].message.content.trim();
      
      try {
        const topics = JSON.parse(content);
        return Array.isArray(topics) ? topics : [];
      } catch (parseError) {
        console.warn('⚠️ [TOPIC ANALYSIS] Failed to parse AI response:', content);
        return [];
      }

    } catch (error) {
      console.error('❌ [TOPIC ANALYSIS] AI extraction failed:', error.message);
      return [];
    }
  }

  /**
   * Extract topics by category analysis
   */
  extractTopicsByCategory(text) {
    const topics = new Set();
    const lowerText = text.toLowerCase();

    Object.entries(this.topicCategories).forEach(([category, keywords]) => {
      keywords.forEach(keyword => {
        if (lowerText.includes(keyword.toLowerCase())) {
          topics.add(keyword.toLowerCase());
          topics.add(category.toLowerCase());
        }
      });
    });

    return Array.from(topics);
  }

  /**
   * Categorize a topic into predefined categories
   */
  categorizeTopic(topic) {
    const lowerTopic = topic.toLowerCase();
    
    for (const [category, keywords] of Object.entries(this.topicCategories)) {
      if (keywords.some(keyword => keyword.toLowerCase() === lowerTopic)) {
        return category;
      }
    }
    
    // Default categorization based on common patterns
    if (lowerTopic.includes('bitcoin') || lowerTopic.includes('btc')) return 'Layer1';
    if (lowerTopic.includes('ethereum') || lowerTopic.includes('eth')) return 'Layer1';
    if (lowerTopic.includes('solana') || lowerTopic.includes('sol')) return 'Layer1';
    if (lowerTopic.includes('defi') || lowerTopic.includes('uniswap')) return 'DeFi';
    if (lowerTopic.includes('nft') || lowerTopic.includes('opensea')) return 'NFT';
    if (lowerTopic.includes('meme') || lowerTopic.includes('doge')) return 'Meme';
    
    return 'General';
  }

  /**
   * Calculate confidence score for topic extraction
   */
  calculateTopicConfidence(topic, text) {
    const lowerText = text.toLowerCase();
    const lowerTopic = topic.toLowerCase();
    
    let confidence = 0.5; // Base confidence
    
    // Direct mention increases confidence
    if (lowerText.includes(lowerTopic)) {
      confidence += 0.3;
    }
    
    // Multiple mentions increase confidence
    const mentions = (lowerText.match(new RegExp(lowerTopic, 'g')) || []).length;
    confidence += Math.min(mentions * 0.1, 0.2);
    
    // Context around topic increases confidence
    const contextWords = ['about', 'regarding', 'concerning', 'discussing', 'analysis'];
    contextWords.forEach(word => {
      if (lowerText.includes(word) && lowerText.includes(lowerTopic)) {
        confidence += 0.1;
      }
    });
    
    return Math.min(confidence, 1.0);
  }

  /**
   * Extract sentiment for a specific topic
   */
  extractTopicSentiment(topic, text, tweetSentiment = null) {
    const lowerText = text.toLowerCase();
    const lowerTopic = topic.toLowerCase();
    
    // Find context around the topic
    const topicIndex = lowerText.indexOf(lowerTopic);
    if (topicIndex === -1) {
      // If topic not found in text, use tweet's overall sentiment (AI-powered)
      if (tweetSentiment) {
        // Map AI sentiment (bullish/bearish/neutral) to topic sentiment (positive/negative/neutral)
        if (tweetSentiment === 'bullish') return 'positive';
        if (tweetSentiment === 'bearish') return 'negative';
        return 'neutral';
      }
      return 'neutral';
    }
    
    // Extract surrounding context (50 chars before and after)
    const contextStart = Math.max(0, topicIndex - 50);
    const contextEnd = Math.min(text.length, topicIndex + lowerTopic.length + 50);
    const context = lowerText.substring(contextStart, contextEnd);
    
    // Check for sentiment indicators in context
    let positiveScore = 0;
    let negativeScore = 0;
    
    this.sentimentIndicators.positive.forEach(indicator => {
      if (context.includes(indicator)) positiveScore++;
    });
    
    this.sentimentIndicators.negative.forEach(indicator => {
      if (context.includes(indicator)) negativeScore++;
    });
    
    // If we found clear sentiment indicators, use them
    if (positiveScore > negativeScore) return 'positive';
    if (negativeScore > positiveScore) return 'negative';
    
    // If no clear sentiment in context, use tweet's overall AI-powered sentiment
    if (tweetSentiment) {
      if (tweetSentiment === 'bullish') return 'positive';
      if (tweetSentiment === 'bearish') return 'negative';
    }
    
    return 'neutral';
  }

  /**
   * Get extraction methods used for a topic
   */
  getExtractionMethods(topic, text) {
    const methods = [];
    const lowerText = text.toLowerCase();
    const lowerTopic = topic.toLowerCase();
    
    // Check if found by patterns
    this.topicPatterns.forEach(({ pattern }) => {
      if (pattern.test(lowerText) && lowerText.includes(lowerTopic)) {
        methods.push('pattern');
      }
    });
    
    // Check if found by category
    Object.values(this.topicCategories).forEach(keywords => {
      if (keywords.some(keyword => keyword.toLowerCase() === lowerTopic)) {
        methods.push('category');
      }
    });
    
    // AI extraction is always included if topic was found
    methods.push('ai');
    
    return [...new Set(methods)];
  }

  /**
   * Analyze trending topics across multiple tweets
   */
  async analyzeTrendingTopics(tweets, timeframe = '7d') {
    try {
      const topicFrequency = new Map();
      const topicSentiment = new Map();
      const topicEngagement = new Map();
      const topicAuthors = new Map();
      
      // Process each tweet
      for (const tweet of tweets) {
        const topics = await this.extractTopics(tweet.text, {
          tweetId: tweet.id,
          author: tweet.author,
          timestamp: tweet.timestamp,
          engagement: tweet.engagement,
          sentiment: tweet.intelligence?.sentiment || null // Pass AI-powered sentiment
        });
        
        topics.forEach(topic => {
          const topicName = topic.name;
          
          // Count frequency
          topicFrequency.set(topicName, (topicFrequency.get(topicName) || 0) + 1);
          
          // Aggregate sentiment
          if (!topicSentiment.has(topicName)) {
            topicSentiment.set(topicName, { positive: 0, negative: 0, neutral: 0 });
          }
          const sentiment = topicSentiment.get(topicName);
          sentiment[topic.sentiment]++;
          
          // Aggregate engagement (calculate total from individual metrics)
          const engagement = tweet.engagement 
            ? (tweet.engagement.likes || 0) + 
              (tweet.engagement.retweets || 0) * 2 + // Retweets count double
              (tweet.engagement.quoteTweets || 0) + 
              (tweet.engagement.replyCount || 0)
            : 0;
          topicEngagement.set(topicName, (topicEngagement.get(topicName) || 0) + engagement);
          
          // Track authors
          if (!topicAuthors.has(topicName)) {
            topicAuthors.set(topicName, new Set());
          }
          topicAuthors.get(topicName).add(tweet.author.username);
        });
      }
      
      // Calculate trending scores
      const trendingTopics = Array.from(topicFrequency.keys()).map(topicName => {
        const frequency = topicFrequency.get(topicName);
        const sentiment = topicSentiment.get(topicName);
        const engagement = topicEngagement.get(topicName);
        const authors = topicAuthors.get(topicName);
        
        // Calculate trending score (frequency + engagement + author diversity)
        const authorDiversity = authors.size;
        const trendingScore = (frequency * 0.4) + (engagement * 0.0001) + (authorDiversity * 0.3);
        
        // Calculate dominant sentiment
        const totalSentiment = sentiment.positive + sentiment.negative + sentiment.neutral;
        const dominantSentiment = sentiment.positive > sentiment.negative ? 
          (sentiment.positive > sentiment.neutral ? 'positive' : 'neutral') :
          (sentiment.negative > sentiment.neutral ? 'negative' : 'neutral');
        
        return {
          topic: topicName,
          category: this.categorizeTopic(topicName),
          frequency,
          engagement,
          authorCount: authorDiversity,
          trendingScore: Math.round(trendingScore * 100) / 100,
          sentiment: {
            dominant: dominantSentiment,
            distribution: {
              positive: Math.round((sentiment.positive / totalSentiment) * 100),
              negative: Math.round((sentiment.negative / totalSentiment) * 100),
              neutral: Math.round((sentiment.neutral / totalSentiment) * 100)
            }
          },
          authors: Array.from(authors),
          analyzedAt: new Date().toISOString()
        };
      });
      
      // Sort by trending score
      return trendingTopics.sort((a, b) => b.trendingScore - a.trendingScore);
      
    } catch (error) {
      console.error('❌ [TOPIC ANALYSIS] Error analyzing trending topics:', error.message);
      return [];
    }
  }

  /**
   * Get topic insights using Perplexity for market context
   */
  async getTopicInsights(topic, timeframe = '7d') {
    try {
      const query = `What are the latest developments and market sentiment around ${topic} in crypto over the past ${timeframe}? Include price movements, news, and community sentiment.`;
      
      const insights = await this.perplexityService.query(query);
      
      return {
        topic,
        timeframe,
        insights: insights.substring(0, 1000), // Limit to 1000 chars
        generatedAt: new Date().toISOString(),
        source: 'perplexity'
      };
      
    } catch (error) {
      console.error(`❌ [TOPIC ANALYSIS] Error getting insights for ${topic}:`, error.message);
      return null;
    }
  }

  /**
   * Add new crypto token to tracking
   */
  addCryptoToken(token, category = 'General') {
    if (!this.topicCategories[category]) {
      this.topicCategories[category] = [];
    }
    
    if (!this.topicCategories[category].includes(token.toLowerCase())) {
      this.topicCategories[category].push(token.toLowerCase());
      console.log(`➕ [TOPIC ANALYSIS] Added token: ${token} to category: ${category}`);
    }
  }

  /**
   * Get all tracked topics by category
   */
  getTrackedTopicsByCategory() {
    return this.topicCategories;
  }

  /**
   * Update topic categories
   */
  updateTopicCategories(newCategories) {
    this.topicCategories = { ...this.topicCategories, ...newCategories };
    console.log('🔄 [TOPIC ANALYSIS] Topic categories updated');
  }
}

export default TopicAnalysisService;


