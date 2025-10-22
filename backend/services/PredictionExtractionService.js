/**
 * Prediction Extraction Service
 * Extracts price predictions from crypto tweets using NLP and pattern matching
 */

class PredictionExtractionService {
  constructor() {
    // Common crypto token symbols (expandable)
    this.cryptoTokens = new Set([
      'BTC', 'ETH', 'SOL', 'ADA', 'DOT', 'MATIC', 'AVAX', 'LINK', 'UNI', 'AAVE',
      'SUSHI', 'CRV', 'COMP', 'MKR', 'SNX', 'YFI', '1INCH', 'ALPHA', 'BAND', 'BAT',
      'BNB', 'CAKE', 'DOGE', 'SHIB', 'PEPE', 'FLOKI', 'BONK', 'WIF', 'POPCAT'
    ]);

    // Price prediction patterns
    this.predictionPatterns = [
      // Direct price targets
      {
        pattern: /(\$[A-Z]{2,10})\s+(?:will|going to|should|might|gonna)\s+(?:hit|reach|go to|pump to|touch|break)\s+(\$?\d+(?:\.\d+)?|[\d,]+(?:\.\d+)?)/gi,
        type: 'price_target',
        confidence: 0.8
      },
      // Price target with "x" multiplier
      {
        pattern: /(\$[A-Z]{2,10})\s+(?:to|will)\s+(\d+(?:\.\d+)?)\s*(?:x|times|×)/gi,
        type: 'multiplier_target',
        confidence: 0.7
      },
      // Next stop/level patterns
      {
        pattern: /(\$[A-Z]{2,10})\s+(?:next stop|next level|next target)\s+(\$?\d+(?:\.\d+)?|[\d,]+(?:\.\d+)?)/gi,
        type: 'next_level',
        confidence: 0.6
      },
      // Support/Resistance levels
      {
        pattern: /(\$[A-Z]{2,10})\s+(?:support|resistance|res)\s+(?:at|is)\s+(\$?\d+(?:\.\d+)?|[\d,]+(?:\.\d+)?)/gi,
        type: 'support_resistance',
        confidence: 0.5
      },
      // Percentage moves
      {
        pattern: /(\$[A-Z]{2,10})\s+(?:will|going to|gonna)\s+(?:pump|moon|rocket|explode)\s+(?:to|by)\s+(\d+(?:\.\d+)?%)/gi,
        type: 'percentage_move',
        confidence: 0.6
      }
    ];

    // Timeframe patterns
    this.timeframePatterns = [
      {
        pattern: /(?:in|within|by)\s+(\d+)\s+(?:days?|d)/gi,
        type: 'days',
        multiplier: 1
      },
      {
        pattern: /(?:in|within|by)\s+(\d+)\s+(?:weeks?|w)/gi,
        type: 'weeks',
        multiplier: 7
      },
      {
        pattern: /(?:in|within|by)\s+(\d+)\s+(?:months?|mo)/gi,
        type: 'months',
        multiplier: 30
      },
      {
        pattern: /(?:this|next)\s+(?:week|month|quarter)/gi,
        type: 'period',
        multiplier: 7 // default to week
      },
      {
        pattern: /(?:end of|by end)\s+(?:week|month|year)/gi,
        type: 'end_period',
        multiplier: 7 // default to week
      },
      {
        pattern: /(?:soon|shortly|quickly|fast)/gi,
        type: 'soon',
        multiplier: 1 // default to 1 day
      }
    ];

    // Confidence indicators
    this.confidenceIndicators = {
      high: ['definitely', 'surely', 'guaranteed', '100%', 'certain', 'confident'],
      medium: ['probably', 'likely', 'should', 'might', 'could', 'expect'],
      low: ['maybe', 'possibly', 'perhaps', 'hopefully', 'wish', 'dream']
    };

    console.log('🎯 [PREDICTION EXTRACT] Service initialized with pattern matching');
  }

  /**
   * Extract predictions from tweet text
   */
  extractPredictions(tweetText, tweetMetadata = {}) {
    const predictions = [];
    const text = tweetText.toLowerCase();

    // Extract each type of prediction
    this.predictionPatterns.forEach(pattern => {
      const matches = [...tweetText.matchAll(pattern.pattern)];
      
      matches.forEach(match => {
        const prediction = this.parsePredictionMatch(match, pattern, tweetText, tweetMetadata);
        if (prediction) {
          predictions.push(prediction);
        }
      });
    });

    // Remove duplicates and merge similar predictions
    return this.deduplicatePredictions(predictions);
  }

  /**
   * Parse a single prediction match
   */
  parsePredictionMatch(match, pattern, originalText, metadata) {
    try {
      const token = match[1].replace('$', '').toUpperCase();
      const value = match[2];

      // Validate token
      if (!this.cryptoTokens.has(token)) {
        return null;
      }

      // Parse the predicted value
      const predictedValue = this.parseValue(value, pattern.type);
      if (!predictedValue) {
        return null;
      }

      // Extract timeframe
      const timeframe = this.extractTimeframe(originalText);

      // Calculate confidence
      const confidence = this.calculateConfidence(originalText, pattern.confidence);

      // Extract context
      const context = this.extractContext(originalText, match.index);

      return {
        id: this.generatePredictionId(),
        token,
        predictedValue,
        predictionType: pattern.type,
        timeframe,
        confidence,
        context,
        originalText: originalText.substring(Math.max(0, match.index - 50), match.index + 100),
        extractedAt: new Date().toISOString(),
        metadata: {
          tweetId: metadata.tweetId,
          author: metadata.author,
          timestamp: metadata.timestamp
        }
      };

    } catch (error) {
      console.error('❌ [PREDICTION EXTRACT] Error parsing prediction:', error.message);
      return null;
    }
  }

  /**
   * Parse predicted value based on type
   */
  parseValue(value, type) {
    try {
      // Remove common formatting
      const cleanValue = value.replace(/[,$]/g, '');

      if (type === 'multiplier_target') {
        // For multipliers, we'll need current price to calculate target
        return {
          type: 'multiplier',
          value: parseFloat(cleanValue),
          needsCurrentPrice: true
        };
      } else if (type === 'percentage_move') {
        // For percentage moves, we'll need current price
        return {
          type: 'percentage',
          value: parseFloat(cleanValue.replace('%', '')),
          needsCurrentPrice: true
        };
      } else {
        // Direct price target
        return {
          type: 'price',
          value: parseFloat(cleanValue),
          needsCurrentPrice: false
        };
      }
    } catch (error) {
      return null;
    }
  }

  /**
   * Extract timeframe from text
   */
  extractTimeframe(text) {
    const lowerText = text.toLowerCase();
    
    for (const timeframePattern of this.timeframePatterns) {
      const match = lowerText.match(timeframePattern.pattern);
      if (match) {
        if (timeframePattern.type === 'period' || timeframePattern.type === 'end_period') {
          return {
            type: timeframePattern.type,
            days: timeframePattern.multiplier,
            description: match[0]
          };
        } else if (timeframePattern.type === 'soon') {
          return {
            type: 'soon',
            days: 1,
            description: 'soon'
          };
        } else {
          const number = parseInt(match[1]);
          return {
            type: timeframePattern.type,
            days: number * timeframePattern.multiplier,
            description: match[0]
          };
        }
      }
    }

    // Default timeframe if none found
    return {
      type: 'unknown',
      days: 7, // Default to 1 week
      description: 'unknown timeframe'
    };
  }

  /**
   * Calculate confidence based on language indicators
   */
  calculateConfidence(text, baseConfidence) {
    const lowerText = text.toLowerCase();
    
    // Check for high confidence indicators
    for (const indicator of this.confidenceIndicators.high) {
      if (lowerText.includes(indicator)) {
        return Math.min(baseConfidence + 0.2, 1.0);
      }
    }

    // Check for low confidence indicators
    for (const indicator of this.confidenceIndicators.low) {
      if (lowerText.includes(indicator)) {
        return Math.max(baseConfidence - 0.2, 0.1);
      }
    }

    return baseConfidence;
  }

  /**
   * Extract context around the prediction
   */
  extractContext(text, matchIndex) {
    const start = Math.max(0, matchIndex - 100);
    const end = Math.min(text.length, matchIndex + 200);
    return text.substring(start, end).trim();
  }

  /**
   * Remove duplicate predictions
   */
  deduplicatePredictions(predictions) {
    const seen = new Set();
    return predictions.filter(prediction => {
      const key = `${prediction.token}-${prediction.predictedValue.value}-${prediction.predictionType}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  /**
   * Generate unique prediction ID
   */
  generatePredictionId() {
    return `pred_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Add new crypto token to tracking
   */
  addCryptoToken(token) {
    this.cryptoTokens.add(token.toUpperCase());
    console.log(`➕ [PREDICTION EXTRACT] Added token: ${token.toUpperCase()}`);
  }

  /**
   * Get all tracked tokens
   */
  getTrackedTokens() {
    return Array.from(this.cryptoTokens);
  }
}

export default PredictionExtractionService;
