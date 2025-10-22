/**
 * Prediction Extraction Service
 * Extracts price predictions from crypto tweets using NLP, pattern matching, and AI
 */

import OpenAI from 'openai';

class PredictionExtractionService {
  constructor() {
    // Initialize OpenAI for AI-enhanced extraction
    this.openai = null;
    try {
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
      });
      console.log('🤖 [PREDICTION EXTRACT] AI-enhanced extraction initialized');
    } catch (error) {
      console.warn('⚠️ [PREDICTION EXTRACT] OpenAI not available, using rule-based extraction only');
    }

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
        pattern: /(\$[A-Z]{2,10})\s+(?:will|going to|should|might|gonna)\s+(?:hit|reach|go to|pump to|touch|break)\s+(\$?[\d,]+(?:\.\d+)?[km]?)/gi,
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
        pattern: /(\$[A-Z]{2,10})\s+(?:next stop|next level|next target)\s+(\$?[\d,]+(?:\.\d+)?[km]?)/gi,
        type: 'next_level',
        confidence: 0.6
      },
      // Support/Resistance levels
      {
        pattern: /(\$[A-Z]{2,10})\s+(?:support|resistance|res)\s+(?:at|is)\s+(\$?[\d,]+(?:\.\d+)?[km]?)/gi,
        type: 'support_resistance',
        confidence: 0.5
      },
      // Percentage moves
      {
        pattern: /(\$[A-Z]{2,10})\s+(?:will|going to|gonna)\s+(?:pump|moon|rocket|explode)\s+(?:to|by)\s+(\d+(?:\.\d+)?%)/gi,
        type: 'percentage_move',
        confidence: 0.6
      },
      // Additional patterns for common crypto Twitter language
      {
        pattern: /(\$[A-Z]{2,10})\s+(?:calling|calls)\s+(\$?[\d,]+(?:\.\d+)?[km]?)/gi,
        type: 'price_target',
        confidence: 0.7
      },
      {
        pattern: /(\$[A-Z]{2,10})\s+(?:expecting|expects)\s+(?:bounce to|move to|pump to)\s+(\$?[\d,]+(?:\.\d+)?[km]?)/gi,
        type: 'price_target',
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
   * Extract predictions from tweet text using hybrid approach (rules + AI)
   */
  async extractPredictions(tweetText, tweetMetadata = {}) {
    const predictions = [];
    const text = tweetText.toLowerCase();

    // Step 1: Try rule-based extraction first (fast and reliable)
    this.predictionPatterns.forEach(pattern => {
      const matches = [...tweetText.matchAll(pattern.pattern)];
      
      matches.forEach(match => {
        const prediction = this.parsePredictionMatch(match, pattern, tweetText, tweetMetadata);
        if (prediction) {
          predictions.push(prediction);
        }
      });
    });

    // Step 2: If no predictions found or AI is available, try AI extraction
    if ((predictions.length === 0 || this.openai) && this.openai) {
      try {
        const aiPredictions = await this.extractPredictionsWithAI(tweetText, tweetMetadata);
        predictions.push(...aiPredictions);
      } catch (error) {
        console.warn('⚠️ [PREDICTION EXTRACT] AI extraction failed, using rule-based results:', error.message);
      }
    }

    // Remove duplicates and merge similar predictions
    return this.deduplicatePredictions(predictions);
  }

  /**
   * AI-powered prediction extraction for complex tweets
   */
  async extractPredictionsWithAI(tweetText, tweetMetadata = {}) {
    try {
      const prompt = `Analyze this crypto tweet and extract any price predictions or market forecasts.

Tweet: "${tweetText}"

Return ONLY a JSON array. If no predictions found, return: []
If predictions found, return: [{"token": "BTC", "type": "price_target", "value": "50000", "timeframe": "end of year", "confidence": 0.8, "reasoning": "Brief explanation"}]

Rules:
- Only extract clear predictions (price targets, multipliers, percentages, support/resistance)
- Use exact token symbols (BTC, ETH, SOL, etc.)
- Convert values to numbers (remove $, commas, k/m suffixes)
- If timeframe unclear, use "unknown"
- Confidence: 0.1-1.0 based on explicitness
- Return empty array [] if no predictions found

DO NOT include any explanatory text. Return ONLY the JSON array.`;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 1000
      });

      const aiResponse = response.choices[0].message.content.trim();
      console.log(`🤖 [PREDICTION EXTRACT] AI response: ${aiResponse.substring(0, 200)}...`);

      // Clean the response to extract only JSON
      let jsonResponse = aiResponse;
      
      // If response contains explanatory text, try to extract JSON
      if (!aiResponse.startsWith('[') && !aiResponse.startsWith('{')) {
        // Look for JSON array in the response
        const jsonMatch = aiResponse.match(/\[.*\]/s);
        if (jsonMatch) {
          jsonResponse = jsonMatch[0];
        } else {
          // If no JSON found, return empty array
          console.log('🤖 [PREDICTION EXTRACT] No JSON found in response, returning empty array');
          return [];
        }
      }

      // Parse AI response
      let aiPredictions;
      try {
        aiPredictions = JSON.parse(jsonResponse);
      } catch (parseError) {
        console.warn('⚠️ [PREDICTION EXTRACT] Failed to parse AI response as JSON:', parseError.message);
        console.warn('⚠️ [PREDICTION EXTRACT] Raw response:', jsonResponse);
        return [];
      }
      
      if (!Array.isArray(aiPredictions)) {
        console.warn('⚠️ [PREDICTION EXTRACT] AI response is not an array:', typeof aiPredictions);
        return [];
      }

      // Convert AI predictions to our format
      return aiPredictions.map(pred => {
        const predictedValue = this.parseValue(pred.value, pred.type);
        if (!predictedValue) return null;

        return {
          id: this.generatePredictionId(),
          token: pred.token.toUpperCase(),
          predictedValue,
          predictionType: pred.type,
          timeframe: this.parseTimeframeFromText(pred.timeframe),
          confidence: pred.confidence || 0.7,
          context: pred.reasoning || 'AI-extracted prediction',
          originalText: tweetText.substring(0, 100),
          extractedAt: new Date().toISOString(),
          metadata: {
            tweetId: tweetMetadata.tweetId,
            author: tweetMetadata.author,
            timestamp: tweetMetadata.timestamp,
            extractionMethod: 'ai'
          }
        };
      }).filter(pred => pred !== null);

    } catch (error) {
      console.error('❌ [PREDICTION EXTRACT] AI extraction error:', error.message);
      return [];
    }
  }

  /**
   * Parse timeframe from text description
   */
  parseTimeframeFromText(timeframeText) {
    const lowerText = timeframeText.toLowerCase();
    
    if (lowerText.includes('soon') || lowerText.includes('today') || lowerText.includes('this week')) {
      return { type: 'soon', days: 1, description: timeframeText };
    } else if (lowerText.includes('week') || lowerText.includes('days')) {
      const daysMatch = lowerText.match(/(\d+)/);
      const days = daysMatch ? parseInt(daysMatch[1]) : 7;
      return { type: 'days', days, description: timeframeText };
    } else if (lowerText.includes('month') || lowerText.includes('quarter')) {
      return { type: 'months', days: 30, description: timeframeText };
    } else if (lowerText.includes('year') || lowerText.includes('end of')) {
      return { type: 'end_period', days: 365, description: timeframeText };
    } else {
      return { type: 'unknown', days: 7, description: timeframeText };
    }
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
      // Remove common formatting and clean the value
      let cleanValue = value.replace(/[,$]/g, '');
      
      // Handle "k" suffix (e.g., "50k" = 50000)
      if (cleanValue.toLowerCase().includes('k')) {
        cleanValue = cleanValue.toLowerCase().replace('k', '000');
      }
      
      // Handle "m" suffix (e.g., "5m" = 5000000)
      if (cleanValue.toLowerCase().includes('m')) {
        cleanValue = cleanValue.toLowerCase().replace('m', '000000');
      }

      const parsedValue = parseFloat(cleanValue);
      
      if (isNaN(parsedValue)) {
        console.error('❌ [PREDICTION EXTRACT] Could not parse value:', value, '->', cleanValue);
        return null;
      }

      if (type === 'multiplier_target') {
        // For multipliers, we'll need current price to calculate target
        return {
          type: 'multiplier',
          value: parsedValue,
          needsCurrentPrice: true
        };
      } else if (type === 'percentage_move') {
        // For percentage moves, we'll need current price
        return {
          type: 'percentage',
          value: parsedValue,
          needsCurrentPrice: true
        };
      } else {
        // Direct price target
        return {
          type: 'price',
          value: parsedValue,
          needsCurrentPrice: false
        };
      }
    } catch (error) {
      console.error('❌ [PREDICTION EXTRACT] Error parsing value:', value, error.message);
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
