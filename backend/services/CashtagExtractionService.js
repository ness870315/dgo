/**
 * Cashtag & Hashtag Extraction Service
 * Extracts $TOKEN (cashtags) and #TOKEN (hashtags) mentions from tweets for CT Momentum tracking
 * 
 * Features:
 * - Extract cashtags ($TOKEN, $BTC, $ETH, etc.)
 * - Extract hashtags (#Bitcoin, #Ethereum, #Solana, etc.)
 * - Normalize token symbols
 * - Filter out common false positives
 * - Extract context and sentiment for each mention
 * - Track mention metadata (position, context)
 */

class CashtagExtractionService {
  constructor() {
    // Common false positives to filter out
    this.falsePositives = new Set([
      'usd', 'eur', 'gbp', 'jpy', 'cad', 'aud', // Fiat currencies
    ]);

    // Common non-crypto hashtags to filter out
    this.hashtagBlacklist = new Set([
      'crypto', 'cryptocurrency', 'blockchain', 'defi', 'nft', 'web3',
      'trading', 'altcoin', 'altcoins', 'memecoin', 'memecoins',
      'gm', 'gn', 'wagmi', 'ngmi', 'hodl', 'fomo', 'fud', 'dyor',
      'bullish', 'bearish', 'moon', 'lambo', 'wen', 'ser', 'anon',
      'ct', 'cryptotwitter', 'twitter', 'follow', 'rt', 'retweet',
      'airdrop', 'presale', 'ico', 'ido', 'launch', 'listing'
    ]);

    // Cashtag pattern: $ followed by letters/numbers (2-10 chars)
    this.cashtagPattern = /\$([A-Za-z][A-Za-z0-9]{1,9})\b/g;
    
    // Hashtag pattern: # followed by letters/numbers (3-20 chars for longer token names)
    this.hashtagPattern = /#([A-Za-z][A-Za-z0-9]{2,19})\b/g;
    
    console.log('💰 [TOKEN EXTRACTOR] Service initialized (cashtags + hashtags)');
  }

  /**
   * Extract all cashtags and hashtags from tweet text
   * @param {string} text - Tweet text
   * @param {Object} tweetMetadata - Additional tweet metadata
   * @returns {Array} - Array of token objects with metadata
   */
  extractCashtags(text, tweetMetadata = {}) {
    try {
      const tokens = [];
      
      // Extract cashtags ($TOKEN)
      const cashtagMatches = text.matchAll(this.cashtagPattern);
      for (const match of cashtagMatches) {
        const rawSymbol = match[1];
        const normalizedSymbol = this.normalizeSymbol(rawSymbol);
        
        // Skip if it's a false positive
        if (this.isFalsePositive(normalizedSymbol)) {
          continue;
        }
        
        // Extract context around the cashtag
        const position = match.index;
        const context = this.extractContext(text, position, rawSymbol.length + 1);
        
        // Determine sentiment from context
        const sentiment = this.extractCashtagSentiment(context, text);
        
        tokens.push({
          symbol: normalizedSymbol,
          rawSymbol: rawSymbol,
          type: 'cashtag',
          position: position,
          context: context,
          sentiment: sentiment,
          extractedAt: new Date().toISOString()
        });
      }
      
      // Extract hashtags (#TOKEN)
      const hashtagMatches = text.matchAll(this.hashtagPattern);
      for (const match of hashtagMatches) {
        const rawSymbol = match[1];
        const normalizedSymbol = this.normalizeSymbol(rawSymbol);
        
        // Skip if it's in the blacklist
        if (this.isHashtagBlacklisted(normalizedSymbol)) {
          continue;
        }
        
        // Skip if it's a false positive
        if (this.isFalsePositive(normalizedSymbol)) {
          continue;
        }
        
        // Extract context around the hashtag
        const position = match.index;
        const context = this.extractContext(text, position, rawSymbol.length + 1);
        
        // Determine sentiment from context
        const sentiment = this.extractCashtagSentiment(context, text);
        
        tokens.push({
          symbol: normalizedSymbol,
          rawSymbol: rawSymbol,
          type: 'hashtag',
          position: position,
          context: context,
          sentiment: sentiment,
          extractedAt: new Date().toISOString()
        });
      }
      
      // Remove duplicates (same symbol mentioned multiple times)
      const uniqueTokens = this.deduplicateCashtags(tokens);
      
      if (uniqueTokens.length > 0) {
        const cashtags = uniqueTokens.filter(t => t.type === 'cashtag');
        const hashtags = uniqueTokens.filter(t => t.type === 'hashtag');
        console.log(`💰 [TOKEN EXTRACTOR] Found ${cashtags.length} cashtags: ${cashtags.map(c => '$' + c.symbol).join(', ')}`);
        console.log(`#️⃣ [TOKEN EXTRACTOR] Found ${hashtags.length} hashtags: ${hashtags.map(c => '#' + c.symbol).join(', ')}`);
      }
      
      return uniqueTokens;
      
    } catch (error) {
      console.error('❌ [TOKEN EXTRACTOR] Extraction error:', error.message);
      return [];
    }
  }

  /**
   * Normalize token symbol (uppercase, trim)
   */
  normalizeSymbol(symbol) {
    return symbol.toUpperCase().trim();
  }

  /**
   * Check if symbol is a false positive
   */
  isFalsePositive(symbol) {
    const lowerSymbol = symbol.toLowerCase();
    
    // Check against known false positives
    if (this.falsePositives.has(lowerSymbol)) {
      return false; // Actually keep fiat for now, we can filter later
    }
    
    // Filter out single character symbols
    if (symbol.length < 2) {
      return true;
    }
    
    // Filter out symbols that are too long (likely not real tokens)
    if (symbol.length > 20) {
      return true;
    }
    
    return false;
  }

  /**
   * Check if hashtag is blacklisted (common non-token hashtags)
   */
  isHashtagBlacklisted(symbol) {
    const lowerSymbol = symbol.toLowerCase();
    return this.hashtagBlacklist.has(lowerSymbol);
  }

  /**
   * Extract context around a cashtag (50 chars before and after)
   */
  extractContext(text, position, cashtagLength) {
    const contextRadius = 50;
    const start = Math.max(0, position - contextRadius);
    const end = Math.min(text.length, position + cashtagLength + contextRadius);
    
    return text.substring(start, end).trim();
  }

  /**
   * Extract sentiment for a specific cashtag based on context
   */
  extractCashtagSentiment(context, fullText) {
    const lowerContext = context.toLowerCase();
    const lowerFullText = fullText.toLowerCase();
    
    // Bullish indicators
    const bullishIndicators = [
      'moon', 'pump', 'rocket', 'bullish', 'breakout', 'rally', 'surge',
      'hodl', 'diamond hands', 'wagmi', 'lfg', 'based', 'flying', 'soaring',
      'exploding', 'parabolic', 'going up', 'rising', 'green', 'gains',
      'buying', 'accumulating', 'long', 'strong', 'solid', 'gem', 'alpha',
      'undervalued', 'potential', 'opportunity', 'bullish af', 'to the moon',
      'partnership', 'launch', 'upgrade', 'adoption', 'integration'
    ];
    
    // Bearish indicators
    const bearishIndicators = [
      'dump', 'crash', 'bearish', 'dip', 'correction', 'selloff', 'panic',
      'rekt', 'paper hands', 'ngmi', 'cope', 'seethe', 'fud', 'scam', 'rug',
      'dumping', 'falling', 'red', 'loss', 'losing', 'weak', 'dead', 'dying',
      'selling', 'shorting', 'exit', 'avoid', 'warning', 'risk', 'danger',
      'overvalued', 'bubble', 'ponzi', 'rugpull', 'rug pull'
    ];
    
    // Count indicators in context (prioritize) and full text
    let bullishScore = 0;
    let bearishScore = 0;
    
    bullishIndicators.forEach(indicator => {
      if (lowerContext.includes(indicator)) bullishScore += 2; // Context is more important
      else if (lowerFullText.includes(indicator)) bullishScore += 1;
    });
    
    bearishIndicators.forEach(indicator => {
      if (lowerContext.includes(indicator)) bearishScore += 2;
      else if (lowerFullText.includes(indicator)) bearishScore += 1;
    });
    
    // Determine sentiment
    if (bullishScore > bearishScore) return 'bullish';
    if (bearishScore > bullishScore) return 'bearish';
    return 'neutral';
  }

  /**
   * Remove duplicate cashtags, keeping the one with strongest sentiment
   */
  deduplicateCashtags(cashtags) {
    const symbolMap = new Map();
    
    for (const cashtag of cashtags) {
      const existing = symbolMap.get(cashtag.symbol);
      
      if (!existing) {
        symbolMap.set(cashtag.symbol, cashtag);
      } else {
        // Keep the one with non-neutral sentiment, or the first one
        if (existing.sentiment === 'neutral' && cashtag.sentiment !== 'neutral') {
          symbolMap.set(cashtag.symbol, cashtag);
        }
      }
    }
    
    return Array.from(symbolMap.values());
  }

  /**
   * Validate if a symbol looks like a real crypto token
   */
  isValidCryptoSymbol(symbol) {
    // Basic validation
    if (symbol.length < 2 || symbol.length > 10) return false;
    
    // Must start with a letter
    if (!/^[A-Z]/.test(symbol)) return false;
    
    // Only letters and numbers
    if (!/^[A-Z0-9]+$/.test(symbol)) return false;
    
    return true;
  }

  /**
   * Get cashtag statistics from a collection of tweets
   */
  analyzeCashtagMomentum(cashtagMentions) {
    const stats = new Map();
    
    for (const mention of cashtagMentions) {
      const symbol = mention.symbol;
      
      if (!stats.has(symbol)) {
        stats.set(symbol, {
          symbol: symbol,
          totalMentions: 0,
          uniqueAuthors: new Set(),
          sentiment: {
            bullish: 0,
            bearish: 0,
            neutral: 0
          },
          firstMention: mention.timestamp,
          lastMention: mention.timestamp,
          contexts: []
        });
      }
      
      const stat = stats.get(symbol);
      stat.totalMentions++;
      stat.uniqueAuthors.add(mention.author);
      stat.sentiment[mention.sentiment]++;
      stat.lastMention = mention.timestamp;
      
      // Keep top 3 contexts
      if (stat.contexts.length < 3) {
        stat.contexts.push({
          text: mention.context,
          author: mention.author,
          sentiment: mention.sentiment
        });
      }
    }
    
    // Convert to array and calculate momentum scores
    return Array.from(stats.values()).map(stat => {
      const totalSentiment = stat.sentiment.bullish + stat.sentiment.bearish + stat.sentiment.neutral;
      const dominantSentiment = stat.sentiment.bullish > stat.sentiment.bearish
        ? (stat.sentiment.bullish > stat.sentiment.neutral ? 'bullish' : 'neutral')
        : (stat.sentiment.bearish > stat.sentiment.neutral ? 'bearish' : 'neutral');
      
      // Calculate momentum score (mentions × author diversity × sentiment weight)
      const authorDiversity = stat.uniqueAuthors.size;
      const sentimentWeight = dominantSentiment === 'bullish' ? 1.2 : dominantSentiment === 'bearish' ? 0.8 : 1.0;
      const momentumScore = stat.totalMentions * authorDiversity * sentimentWeight;
      
      return {
        symbol: stat.symbol,
        totalMentions: stat.totalMentions,
        uniqueAuthors: stat.uniqueAuthors.size,
        dominantSentiment: dominantSentiment,
        sentimentDistribution: {
          bullish: Math.round((stat.sentiment.bullish / totalSentiment) * 100),
          bearish: Math.round((stat.sentiment.bearish / totalSentiment) * 100),
          neutral: Math.round((stat.sentiment.neutral / totalSentiment) * 100)
        },
        momentumScore: Math.round(momentumScore * 100) / 100,
        firstMention: stat.firstMention,
        lastMention: stat.lastMention,
        topContexts: stat.contexts
      };
    }).sort((a, b) => b.momentumScore - a.momentumScore);
  }
}

export default CashtagExtractionService;

