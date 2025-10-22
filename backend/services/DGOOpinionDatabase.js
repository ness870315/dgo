/**
 * DGO Opinion Database
 * 
 * Stores Degen Oracle's opinions on market sentiment over time.
 * Allows the bot to:
 * - Track its takes and predictions
 * - Reference past opinions
 * - Revisit old calls and see if they aged well
 * - Build conviction patterns over time
 * 
 * Future features:
 * - Pattern recognition in opinion history
 * - "I called this X weeks ago" references
 * - Admitting when wrong: "OK that didn't age well"
 * - Flexing when right: "Told you so"
 */

import fs from 'fs/promises';
import path from 'path';

class DGOOpinionDatabase {
  constructor() {
    this.dataDir = process.env.DATA_DIR 
      ? path.join(process.env.DATA_DIR, 'dgo-opinions')
      : path.join(process.cwd(), 'data', 'dgo-opinions');
    
    this.opinionsFile = path.join(this.dataDir, 'opinions.json');
    this.opinions = [];
    
    console.log('🧠 [DGO OPINIONS] Database initialized');
    console.log('   Data dir:', this.dataDir);
  }

  /**
   * Initialize database (create directory and load existing opinions)
   */
  async initialize() {
    try {
      // Create directory if it doesn't exist
      await fs.mkdir(this.dataDir, { recursive: true });
      
      // Load existing opinions
      await this.loadOpinions();
      
      console.log(`✅ [DGO OPINIONS] Loaded ${this.opinions.length} opinions`);
    } catch (error) {
      console.error('❌ [DGO OPINIONS] Initialization error:', error.message);
    }
  }

  /**
   * Load opinions from disk
   */
  async loadOpinions() {
    try {
      const data = await fs.readFile(this.opinionsFile, 'utf8');
      this.opinions = JSON.parse(data);
    } catch (error) {
      if (error.code === 'ENOENT') {
        // File doesn't exist yet - start fresh
        this.opinions = [];
        await this.saveOpinions();
      } else {
        throw error;
      }
    }
  }

  /**
   * Save opinions to disk
   */
  async saveOpinions() {
    try {
      await fs.writeFile(
        this.opinionsFile,
        JSON.stringify(this.opinions, null, 2),
        'utf8'
      );
    } catch (error) {
      console.error('❌ [DGO OPINIONS] Save error:', error.message);
    }
  }

  /**
   * Store a new opinion with enhanced intelligence features
   * @param {Object} opinion - Opinion data
   * @param {string} opinion.text - The tweet text
   * @param {string} opinion.marketContext - Market context from Perplexity
   * @param {string} opinion.sentiment - bullish/bearish/neutral/cynical
   * @param {string} opinion.tweetId - Twitter tweet ID (if posted)
   * @param {string} opinion.type - normal/meme/news/etc
   */
  async storeOpinion(opinion) {
    try {
      // Extract intelligence features
      const intelligenceFeatures = await this.extractIntelligenceFeatures(opinion.text);
      
      const opinionRecord = {
        id: `opinion_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        text: opinion.text,
        marketContext: opinion.marketContext || 'Unknown',
        sentiment: this.classifySentiment(opinion.text),
        manualSentiment: opinion.sentiment || null, // User/AI provided sentiment
        tweetId: opinion.tweetId || null,
        type: opinion.type || 'normal',
        timestamp: new Date().toISOString(),
        dateString: new Date().toLocaleDateString('en-US', { 
          year: 'numeric', 
          month: 'short', 
          day: 'numeric' 
        }),
        
        // 🧠 NEW: Intelligence features
        topics: intelligenceFeatures.topics || [],
        entities: intelligenceFeatures.entities || {},
        confidence: intelligenceFeatures.confidence || 0.5,
        timeframe: intelligenceFeatures.timeframe || 'unknown',
        category: intelligenceFeatures.category || 'general',
        predictions: intelligenceFeatures.predictions || [],
        patterns: intelligenceFeatures.patterns || [],
        relatedTokens: intelligenceFeatures.relatedTokens || [],
        relatedTopics: intelligenceFeatures.relatedTopics || [],

        // 📷 Image metadata (if applicable)
        images: opinion.images || [],
        hasImages: (opinion.images && opinion.images.length > 0) || false
      };

      this.opinions.push(opinionRecord);
      await this.saveOpinions();

      console.log(`💾 [DGO OPINIONS] Stored intelligent opinion #${this.opinions.length}:`, {
        id: opinionRecord.id,
        sentiment: opinionRecord.sentiment,
        topics: opinionRecord.topics.slice(0, 3),
        entities: Object.keys(opinionRecord.entities).slice(0, 3),
        confidence: opinionRecord.confidence,
        preview: opinionRecord.text.substring(0, 60) + '...'
      });

      return opinionRecord;
    } catch (error) {
      console.error('❌ [DGO OPINIONS] Store error:', error.message);
      return null;
    }
  }

  /**
   * Classify sentiment of opinion text
   */
  classifySentiment(text) {
    const lowerText = text.toLowerCase();
    
    // Bullish indicators
    const bullishWords = ['uptober', 'bullish', 'moon', 'wagmi', 'gm bulls', 'believe', 'ready', 'builders'];
    const bullishCount = bullishWords.filter(word => lowerText.includes(word)).length;
    
    // Bearish indicators
    const bearishWords = ['downtober', 'rekt', 'liquidat', 'crash', 'blood', 'dip', 'nuked', 'dump'];
    const bearishCount = bearishWords.filter(word => lowerText.includes(word)).length;
    
    // Cynical/sarcastic indicators
    const cynicalWords = ['damn', 'holy shit', 'wtf', 'yikes', 'fuck', 'not sorry', 'cope', 'ngmi'];
    const cynicalCount = cynicalWords.filter(word => lowerText.includes(word)).length;
    
    if (cynicalCount >= 2) return 'cynical';
    if (bullishCount > bearishCount) return 'bullish';
    if (bearishCount > bullishCount) return 'bearish';
    return 'neutral';
  }

  /**
   * Extract intelligence features from opinion text
   * @param {string} text - The opinion text
   * @returns {Object} Intelligence features
   */
  async extractIntelligenceFeatures(text) {
    try {
      // For now, use rule-based extraction (will enhance with AI later)
      const features = {
        topics: this.extractTopics(text),
        entities: this.extractEntities(text),
        confidence: this.calculateConfidence(text),
        timeframe: this.determineTimeframe(text),
        category: this.categorizeContent(text),
        predictions: this.extractPredictions(text),
        patterns: this.extractPatterns(text),
        relatedTokens: this.extractTokens(text),
        relatedTopics: this.extractRelatedTopics(text)
      };

      return features;
    } catch (error) {
      console.error('❌ [DGO OPINIONS] Intelligence extraction error:', error.message);
      return {
        topics: [],
        entities: {},
        confidence: 0.5,
        timeframe: 'unknown',
        category: 'general',
        predictions: [],
        patterns: [],
        relatedTokens: [],
        relatedTopics: []
      };
    }
  }

  /**
   * Extract topics from text using rule-based approach
   */
  extractTopics(text) {
    const lowerText = text.toLowerCase();
    const topics = [];

    // Crypto topics
    const topicKeywords = {
      'tokenomics': ['tokenomics', 'supply', 'circulating', 'total supply', 'max supply'],
      'protocol-launch': ['launch', 'launched', 'release', 'debut', 'unveil'],
      'token-unlocks': ['unlock', 'unlocked', 'vesting', 'vested', 'release schedule'],
      'market-cap': ['market cap', 'marketcap', 'mcap', 'valuation'],
      'volume': ['volume', 'trading volume', 'vol', 'liquidity'],
      'price-action': ['price', 'pump', 'dump', 'rally', 'crash', 'moon', 'rekt'],
      'defi': ['defi', 'decentralized', 'yield', 'farming', 'staking', 'liquidity pool'],
      'nft': ['nft', 'nfts', 'collection', 'mint', 'floor price'],
      'governance': ['governance', 'dao', 'proposal', 'vote', 'voting'],
      'partnership': ['partnership', 'collaboration', 'integration', 'partners'],
      'funding': ['funding', 'raise', 'investment', 'vc', 'venture capital'],
      'regulatory': ['sec', 'regulation', 'regulatory', 'compliance', 'legal']
    };

    for (const [topic, keywords] of Object.entries(topicKeywords)) {
      if (keywords.some(keyword => lowerText.includes(keyword))) {
        topics.push(topic);
      }
    }

    return topics;
  }

  /**
   * Extract entities from text
   */
  extractEntities(text) {
    const entities = {
      tokens: this.extractTokens(text),
      protocols: this.extractProtocols(text),
      dates: this.extractDates(text),
      prices: this.extractPrices(text),
      percentages: this.extractPercentages(text),
      amounts: this.extractAmounts(text)
    };

    return entities;
  }

  /**
   * Extract token symbols from text
   */
  extractTokens(text) {
    const tokenMatches = text.match(/\$[A-Za-z0-9]+/g) || [];
    return tokenMatches.map(token => token.substring(1).toUpperCase());
  }

  /**
   * Extract protocol names from text
   */
  extractProtocols(text) {
    const protocolKeywords = [
      'ethereum', 'bitcoin', 'solana', 'polygon', 'avalanche', 'arbitrum', 'optimism',
      'uniswap', 'pancakeswap', 'sushiswap', 'curve', 'aave', 'compound', 'maker',
      'chainlink', 'the graph', 'filecoin', 'ipfs', 'near', 'cosmos', 'polkadot'
    ];
    
    const lowerText = text.toLowerCase();
    return protocolKeywords.filter(protocol => lowerText.includes(protocol));
  }

  /**
   * Extract dates from text
   */
  extractDates(text) {
    const datePatterns = [
      /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}\b/gi,
      /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g,
      /\b\d{1,2}-\d{1,2}-\d{2,4}\b/g,
      /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+\d{1,2}\b/gi
    ];

    const dates = [];
    datePatterns.forEach(pattern => {
      const matches = text.match(pattern) || [];
      dates.push(...matches);
    });

    return dates;
  }

  /**
   * Extract prices from text
   */
  extractPrices(text) {
    const priceMatches = text.match(/\$[\d,]+\.?\d*/g) || [];
    return priceMatches;
  }

  /**
   * Extract percentages from text
   */
  extractPercentages(text) {
    const percentageMatches = text.match(/\d+\.?\d*%/g) || [];
    return percentageMatches;
  }

  /**
   * Extract amounts from text
   */
  extractAmounts(text) {
    const amountMatches = text.match(/\d+\.?\d*\s*(million|billion|thousand|k|m|b)/gi) || [];
    return amountMatches;
  }

  /**
   * Calculate confidence score based on text characteristics
   */
  calculateConfidence(text) {
    let confidence = 0.5; // Base confidence

    // Increase confidence for specific data points
    if (text.match(/\$[\d,]+\.?\d*/)) confidence += 0.1; // Has prices
    if (text.match(/\d+\.?\d*%/)) confidence += 0.1; // Has percentages
    if (text.match(/\d+\.?\d*\s*(million|billion|thousand|k|m|b)/i)) confidence += 0.1; // Has amounts
    if (text.match(/\$[A-Za-z0-9]+/)) confidence += 0.1; // Has token symbols
    if (text.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}\b/i)) confidence += 0.1; // Has dates

    // Decrease confidence for uncertain language
    if (text.match(/\b(maybe|perhaps|might|could|possibly|unclear|unknown)\b/i)) confidence -= 0.1;
    if (text.match(/\b(i think|i believe|in my opinion|not sure)\b/i)) confidence -= 0.1;

    return Math.max(0.1, Math.min(1.0, confidence)); // Clamp between 0.1 and 1.0
  }

  /**
   * Determine timeframe from text
   */
  determineTimeframe(text) {
    const lowerText = text.toLowerCase();
    
    if (lowerText.includes('today') || lowerText.includes('now') || lowerText.includes('current')) return 'immediate';
    if (lowerText.includes('this week') || lowerText.includes('weekly')) return 'short-term';
    if (lowerText.includes('this month') || lowerText.includes('monthly')) return 'medium-term';
    if (lowerText.includes('this year') || lowerText.includes('yearly') || lowerText.includes('long-term')) return 'long-term';
    
    return 'unknown';
  }

  /**
   * Categorize content type
   */
  categorizeContent(text) {
    const lowerText = text.toLowerCase();
    
    if (lowerText.includes('unlock') || lowerText.includes('vesting')) return 'tokenomics';
    if (lowerText.includes('launch') || lowerText.includes('release')) return 'protocol-analysis';
    if (lowerText.includes('price') || lowerText.includes('pump') || lowerText.includes('dump')) return 'price-analysis';
    if (lowerText.includes('volume') || lowerText.includes('liquidity')) return 'market-analysis';
    if (lowerText.includes('partnership') || lowerText.includes('integration')) return 'ecosystem';
    
    return 'general';
  }

  /**
   * Extract predictions from text
   */
  extractPredictions(text) {
    const predictions = [];
    const lowerText = text.toLowerCase();
    
    // Look for prediction patterns
    if (lowerText.includes('will') || lowerText.includes('going to')) {
      const willMatches = text.match(/will\s+[^.!?]+/gi) || [];
      const goingToMatches = text.match(/going to\s+[^.!?]+/gi) || [];
      predictions.push(...willMatches, ...goingToMatches);
    }
    
    return predictions;
  }

  /**
   * Extract patterns from text
   */
  extractPatterns(text) {
    const patterns = [];
    const lowerText = text.toLowerCase();
    
    if (lowerText.includes('unlock') && lowerText.includes('dump')) patterns.push('unlock-schedule-impact');
    if (lowerText.includes('launch') && lowerText.includes('price')) patterns.push('launch-vs-price-correlation');
    if (lowerText.includes('volume') && lowerText.includes('price')) patterns.push('volume-price-correlation');
    
    return patterns;
  }

  /**
   * Extract related topics
   */
  extractRelatedTopics(text) {
    const relatedTopics = [];
    const lowerText = text.toLowerCase();
    
    if (lowerText.includes('tokenomics')) relatedTopics.push('tokenomics');
    if (lowerText.includes('vesting')) relatedTopics.push('vesting');
    if (lowerText.includes('liquidity')) relatedTopics.push('liquidity');
    if (lowerText.includes('market')) relatedTopics.push('market-dynamics');
    
    return relatedTopics;
  }

  /**
   * Get all opinions
   */
  async getAllOpinions() {
    return this.opinions;
  }

  /**
   * Get opinions by sentiment
   */
  async getOpinionsBySentiment(sentiment) {
    return this.opinions.filter(op => op.sentiment === sentiment);
  }

  /**
   * Get recent opinions (last N)
   */
  async getRecentOpinions(limit = 10) {
    return this.opinions.slice(-limit).reverse();
  }

  /**
   * Search opinions by keyword
   */
  async searchOpinions(keyword) {
    const lowerKeyword = keyword.toLowerCase();
    return this.opinions.filter(op => 
      op.text.toLowerCase().includes(lowerKeyword) ||
      op.marketContext.toLowerCase().includes(lowerKeyword)
    );
  }

  /**
   * 🧠 NEW: Intelligent search with multiple criteria
   */
  async findRelevantOpinions(query, context = {}) {
    try {
      const lowerQuery = query.toLowerCase();
      const relevantOpinions = [];

      for (const opinion of this.opinions) {
        let relevanceScore = 0;

        // 1. Topic matching
        if (opinion.topics && opinion.topics.length > 0) {
          const queryTopics = this.extractTopics(query);
          const topicMatches = opinion.topics.filter(topic => 
            queryTopics.includes(topic)
          ).length;
          relevanceScore += topicMatches * 2;
        }

        // 2. Entity matching
        if (opinion.entities) {
          const queryTokens = this.extractTokens(query);
          const tokenMatches = opinion.entities.tokens?.filter(token => 
            queryTokens.includes(token)
          ).length || 0;
          relevanceScore += tokenMatches * 3;

          const queryProtocols = this.extractProtocols(query);
          const protocolMatches = opinion.entities.protocols?.filter(protocol => 
            queryProtocols.includes(protocol)
          ).length || 0;
          relevanceScore += protocolMatches * 2;
        }

        // 3. Text similarity
        const textSimilarity = this.calculateTextSimilarity(query, opinion.text);
        relevanceScore += textSimilarity * 1.5;

        // 4. Context filtering
        if (context.type && opinion.type !== context.type) {
          relevanceScore *= 0.5; // Reduce score for wrong type
        }

        if (context.timeframe && opinion.timeframe !== context.timeframe) {
          relevanceScore *= 0.7; // Reduce score for wrong timeframe
        }

        if (context.sentiment && opinion.sentiment !== context.sentiment) {
          relevanceScore *= 0.8; // Reduce score for wrong sentiment
        }

        // 5. Confidence weighting
        relevanceScore *= opinion.confidence || 0.5;

        if (relevanceScore > 0.5) {
          relevantOpinions.push({
            ...opinion,
            relevanceScore
          });
        }
      }

      // Sort by relevance score and return top results
      return relevantOpinions
        .sort((a, b) => b.relevanceScore - a.relevanceScore)
        .slice(0, context.limit || 5);

    } catch (error) {
      console.error('❌ [DGO OPINIONS] Intelligent search error:', error.message);
      return [];
    }
  }

  /**
   * 🧠 NEW: Topic-based search
   */
  async searchByTopic(topic) {
    return this.opinions.filter(op => 
      op.topics && op.topics.includes(topic)
    );
  }

  /**
   * 🧠 NEW: Entity-based search
   */
  async searchByEntity(entityType, entityValue) {
    return this.opinions.filter(op => 
      op.entities && 
      op.entities[entityType] && 
      op.entities[entityType].includes(entityValue)
    );
  }

  /**
   * 🧠 NEW: Timeframe-based search
   */
  async searchByTimeframe(timeframe) {
    return this.opinions.filter(op => op.timeframe === timeframe);
  }

  /**
   * 🧠 NEW: Category-based search
   */
  async searchByCategory(category) {
    return this.opinions.filter(op => op.category === category);
  }

  /**
   * 🧠 NEW: High-confidence opinions
   */
  async getHighConfidenceOpinions(minConfidence = 0.7) {
    return this.opinions.filter(op => 
      (op.confidence || 0.5) >= minConfidence
    );
  }

  /**
   * 🧠 NEW: Calculate text similarity (simple implementation)
   */
  calculateTextSimilarity(text1, text2) {
    const words1 = text1.toLowerCase().split(/\s+/);
    const words2 = text2.toLowerCase().split(/\s+/);
    
    const commonWords = words1.filter(word => words2.includes(word));
    const totalWords = new Set([...words1, ...words2]).size;
    
    return commonWords.length / totalWords;
  }

  /**
   * 🧠 NEW: Get contextual opinions for content generation
   */
  async getContextualOpinions(currentTopic, userQuery, marketContext) {
    try {
      // Extract topics and entities from current context
      const queryTopics = this.extractTopics(userQuery);
      const queryTokens = this.extractTokens(userQuery);
      
      // Find relevant opinions
      const relevantOpinions = await this.findRelevantOpinions(userQuery, {
        type: 'crypto_tech_insights',
        timeframe: 'recent',
        limit: 3
      });

      // Format for LLM consumption
      return relevantOpinions.map(op => ({
        text: op.text,
        dateString: op.dateString,
        topics: op.topics,
        confidence: op.confidence,
        relevanceScore: op.relevanceScore
      }));

    } catch (error) {
      console.error('❌ [DGO OPINIONS] Contextual search error:', error.message);
      return [];
    }
  }

  /**
   * Get opinion stats
   */
  async getStats() {
    const total = this.opinions.length;
    const sentimentCounts = {
      bullish: 0,
      bearish: 0,
      neutral: 0,
      cynical: 0
    };

    this.opinions.forEach(op => {
      sentimentCounts[op.sentiment]++;
    });

    const last7Days = this.opinions.filter(op => {
      const opDate = new Date(op.timestamp);
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      return opDate >= weekAgo;
    });

    return {
      total,
      sentimentCounts,
      sentimentPercentages: {
        bullish: ((sentimentCounts.bullish / total) * 100).toFixed(1),
        bearish: ((sentimentCounts.bearish / total) * 100).toFixed(1),
        neutral: ((sentimentCounts.neutral / total) * 100).toFixed(1),
        cynical: ((sentimentCounts.cynical / total) * 100).toFixed(1)
      },
      last7DaysCount: last7Days.length,
      oldestOpinion: this.opinions[0]?.dateString || 'None',
      newestOpinion: this.opinions[this.opinions.length - 1]?.dateString || 'None'
    };
  }

  /**
   * Get a random past opinion (for future "throwback" features)
   */
  async getRandomOpinion() {
    if (this.opinions.length === 0) return null;
    const randomIndex = Math.floor(Math.random() * this.opinions.length);
    return this.opinions[randomIndex];
  }

  /**
   * Get opinions with images (for DALL-E integration)
   */
  getOpinionsWithImages(limit = 10) {
    const opinionsWithImages = this.opinions
      .filter(opinion => opinion.hasImages && opinion.images && opinion.images.length > 0)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limit);

    return {
      success: true,
      opinions: opinionsWithImages,
      count: opinionsWithImages.length,
      totalWithImages: this.opinions.filter(op => op.hasImages).length
    };
  }

  /**
   * Get images by topic/category (for DALL-E context)
   */
  getImagesByTopic(topic, limit = 5) {
    const matchingOpinions = this.opinions
      .filter(opinion => 
        opinion.hasImages && 
        opinion.topics.some(t => t.toLowerCase().includes(topic.toLowerCase()))
      )
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limit);

    const images = [];
    matchingOpinions.forEach(opinion => {
      if (opinion.images) {
        images.push(...opinion.images.map(img => ({
          ...img,
          opinionId: opinion.id,
          text: opinion.text,
          topics: opinion.topics,
          timestamp: opinion.timestamp
        })));
      }
    });

    return {
      success: true,
      images,
      count: images.length,
      topic,
      matchingOpinions: matchingOpinions.length
    };
  }

  /**
   * Search images by text content (for DALL-E reference)
   */
  searchImagesByText(searchText, limit = 5) {
    const searchLower = searchText.toLowerCase();
    
    const matchingOpinions = this.opinions
      .filter(opinion => 
        opinion.hasImages && 
        (opinion.text.toLowerCase().includes(searchLower) ||
         opinion.topics.some(t => t.toLowerCase().includes(searchLower)) ||
         Object.keys(opinion.entities).some(key => key.toLowerCase().includes(searchLower)))
      )
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limit);

    const images = [];
    matchingOpinions.forEach(opinion => {
      if (opinion.images) {
        images.push(...opinion.images.map(img => ({
          ...img,
          opinionId: opinion.id,
          text: opinion.text,
          topics: opinion.topics,
          entities: opinion.entities,
          relevanceScore: this.calculateTextSimilarity(searchText, opinion.text),
          timestamp: opinion.timestamp
        })));
      }
    });

    // Sort by relevance score
    images.sort((a, b) => b.relevanceScore - a.relevanceScore);

    return {
      success: true,
      images,
      count: images.length,
      searchText,
      matchingOpinions: matchingOpinions.length
    };
  }

  /**
   * Get all stored image URLs (for DALL-E training/reference)
   */
  getAllImageUrls() {
    const allImages = [];
    
    this.opinions.forEach(opinion => {
      if (opinion.hasImages && opinion.images) {
        opinion.images.forEach(img => {
          allImages.push({
            url: img.url,
            format: img.format,
            opinionId: opinion.id,
            text: opinion.text,
            topics: opinion.topics,
            entities: opinion.entities,
            category: opinion.category,
            timestamp: opinion.timestamp,
            tweetId: opinion.tweetId
          });
        });
      }
    });

    return {
      success: true,
      images: allImages,
      count: allImages.length,
      totalOpinions: this.opinions.length,
      opinionsWithImages: this.opinions.filter(op => op.hasImages).length
    };
  }

  /**
   * Get image statistics
   */
  getImageStatistics() {
    const totalOpinions = this.opinions.length;
    const opinionsWithImages = this.opinions.filter(op => op.hasImages);
    const totalImages = opinionsWithImages.reduce((sum, op) => sum + (op.images ? op.images.length : 0), 0);
    
    const imageFormats = {};
    
    opinionsWithImages.forEach(opinion => {
      if (opinion.images) {
        opinion.images.forEach(img => {
          imageFormats[img.format] = (imageFormats[img.format] || 0) + 1;
        });
      }
    });

    return {
      success: true,
      totalOpinions,
      opinionsWithImages: opinionsWithImages.length,
      totalImages,
      imageFormats,
      imageUsagePercentage: totalOpinions > 0 ? ((opinionsWithImages.length / totalOpinions) * 100).toFixed(2) : 0
    };
  }
}

export default DGOOpinionDatabase;

