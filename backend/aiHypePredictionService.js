import OpenAIService from './openaiService.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class AIHypePredictionService {
  constructor() {
    this.openaiService = new OpenAIService();
    this.cacheDir = process.env.DATA_DIR ? path.join(process.env.DATA_DIR, 'cache') : path.join(__dirname, 'cache');
    this.predictionCacheFile = path.join(this.cacheDir, 'ai-hype-predictions.json');
    this.cacheTimeout = 24 * 60 * 60 * 1000; // 24 hours
    this.predictionCache = new Map();
    
    // Initialize cache directory
    this.initializeCache();
  }

  async initializeCache() {
    try {
      await fs.mkdir(this.cacheDir, { recursive: true });
      
      // Load existing cache
      try {
        const cacheData = await fs.readFile(this.predictionCacheFile, 'utf8');
        const parsed = JSON.parse(cacheData);
        
        // Convert to Map and filter expired entries
        const now = Date.now();
        for (const [key, value] of Object.entries(parsed)) {
          if (value.timestamp && (now - value.timestamp) < this.cacheTimeout) {
            this.predictionCache.set(key, value);
          }
        }
        
        console.log(`🧠 Loaded ${this.predictionCache.size} cached AI hype predictions`);
      } catch (err) {
        console.log('🧠 No existing AI hype prediction cache found, starting fresh');
      }
    } catch (error) {
      console.error('❌ Error initializing AI hype prediction cache:', error);
    }
  }

  async saveCacheToFile() {
    try {
      const cacheObj = Object.fromEntries(this.predictionCache);
      await fs.writeFile(this.predictionCacheFile, JSON.stringify(cacheObj, null, 2));
    } catch (error) {
      console.error('❌ Error saving AI hype prediction cache:', error);
    }
  }

  generateCacheKey(contractAddress, range, dataHash) {
    return `${contractAddress.toLowerCase()}_${range}_${dataHash}`;
  }

  // Generate a hash of the historical data to detect changes
  generateDataHash(hypeData) {
    if (!hypeData || hypeData.length === 0) return 'empty';
    
    // Use last 5 data points and their values to create a simple hash
    const recent = hypeData.slice(-5);
    const hashString = recent.map(d => `${d.timestamp}_${d.score}_${d.mentions}`).join('|');
    
    // Simple hash function
    let hash = 0;
    for (let i = 0; i < hashString.length; i++) {
      const char = hashString.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  async getPrediction(contractAddress, tokenData, hypeData, range = '7d') {
    try {
      console.log(`🧠 Getting AI hype prediction for ${contractAddress} (${range})`);
      
      // Generate cache key based on data
      const dataHash = this.generateDataHash(hypeData);
      const cacheKey = this.generateCacheKey(contractAddress, range, dataHash);
      
      // Check cache first
      const cached = this.predictionCache.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp) < this.cacheTimeout) {
        console.log(`🧠 Using cached AI prediction for ${contractAddress} (${Math.round((Date.now() - cached.timestamp) / (60 * 60 * 1000))}h old)`);
        return {
          ...cached.prediction,
          cached: true,
          cacheAge: Date.now() - cached.timestamp
        };
      }

      // Generate new prediction using AI
      const prediction = await this.generateAIPrediction(contractAddress, tokenData, hypeData, range);
      
      // Cache the result
      this.predictionCache.set(cacheKey, {
        prediction,
        timestamp: Date.now(),
        contractAddress,
        range,
        dataHash
      });
      
      // Save cache to file (async, don't wait)
      this.saveCacheToFile().catch(err => 
        console.error('❌ Error saving AI prediction cache:', err)
      );
      
      console.log(`🧠 Generated fresh AI prediction for ${contractAddress}`);
      return {
        ...prediction,
        cached: false,
        cacheAge: 0
      };
      
    } catch (error) {
      console.error('❌ Error getting AI hype prediction:', error);
      return this.getFallbackPrediction(hypeData, range);
    }
  }

  async generateAIPrediction(contractAddress, tokenData, hypeData, range) {
    try {
      // Prepare data for AI analysis
      const recentData = hypeData.slice(-10); // Last 10 data points
      const currentMetrics = this.calculateCurrentMetrics(hypeData);
      const trendAnalysis = this.analyzeTrend(hypeData);
      
      const prompt = this.buildPredictionPrompt(
        contractAddress,
        tokenData,
        recentData,
        currentMetrics,
        trendAnalysis,
        range
      );

      // Call OpenAI
      const response = await this.openaiService.generateCompletion(prompt, {
        model: 'gpt-4',
        temperature: 0.3,
        max_tokens: 1000
      });

      // Parse and validate response
      const prediction = this.parsePredictionResponse(response);
      
      return {
        ...prediction,
        generatedAt: new Date().toISOString(),
        model: 'gpt-4',
        confidence: prediction.confidence || 0.7
      };
      
    } catch (error) {
      console.error('❌ Error generating AI prediction:', error);
      throw error;
    }
  }

  buildPredictionPrompt(contractAddress, tokenData, recentData, currentMetrics, trendAnalysis, range) {
    return `You are a crypto hype prediction AI analyzing token momentum and community sentiment.

CONTRACT: ${contractAddress}
TOKEN: ${tokenData?.symbol || 'Unknown'} (${tokenData?.name || 'Unknown'})
ANALYSIS RANGE: ${range}

CURRENT METRICS:
- Current Hype Score: ${currentMetrics.currentScore}/10
- Recent Mentions: ${currentMetrics.mentions}
- Community Health: ${tokenData?.communityHealthScore || 'N/A'}/10
- Twitter Followers: ${tokenData?.twitterData?.followers || 0}
- Organic Score: ${tokenData?.jupiterData?.organicScore || tokenData?.organicScore || 'N/A'}

TREND ANALYSIS:
- Direction: ${trendAnalysis.direction} (${trendAnalysis.strength})
- Momentum: ${trendAnalysis.momentum}
- Volatility: ${trendAnalysis.volatility}
- Recent Pattern: ${trendAnalysis.pattern}

RECENT HYPE DATA (last 10 points):
${recentData.map(d => `${d.timestamp}: Score ${d.score}/10, ${d.mentions} mentions, Label: ${d.label}`).join('\n')}

PREDICTION TASK:
Analyze the hype trajectory and predict the next 24-48 hours. Consider:
1. Current momentum and trend direction
2. Community engagement patterns
3. Social media buzz and sentiment
4. Market conditions and token fundamentals
5. Historical patterns in similar tokens

Respond with a JSON object containing:
{
  "prediction": {
    "direction": "bullish|bearish|sideways",
    "strength": "weak|moderate|strong",
    "timeframe": "6h|12h|24h|48h",
    "targetScore": 7.5,
    "confidence": 0.85
  },
  "reasoning": "Brief explanation of the prediction logic",
  "catalysts": ["Potential positive factors"],
  "risks": ["Potential negative factors"],
  "keyLevels": {
    "support": 5.2,
    "resistance": 8.1
  },
  "recommendation": "hold|accumulate|caution|avoid"
}

Use crypto degen language and be specific about timing and levels. Focus on actionable insights.`;
  }

  parsePredictionResponse(response) {
    try {
      // Try to extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }
      
      const parsed = JSON.parse(jsonMatch[0]);
      
      // Validate required fields
      if (!parsed.prediction || !parsed.reasoning) {
        throw new Error('Missing required prediction fields');
      }
      
      return {
        prediction: {
          direction: parsed.prediction.direction || 'sideways',
          strength: parsed.prediction.strength || 'moderate',
          timeframe: parsed.prediction.timeframe || '24h',
          targetScore: parsed.prediction.targetScore || 5.0,
          confidence: Math.min(1.0, Math.max(0.1, parsed.prediction.confidence || 0.7))
        },
        reasoning: parsed.reasoning,
        catalysts: parsed.catalysts || [],
        risks: parsed.risks || [],
        keyLevels: parsed.keyLevels || { support: 0, resistance: 10 },
        recommendation: parsed.recommendation || 'hold'
      };
      
    } catch (error) {
      console.error('❌ Error parsing AI prediction response:', error);
      throw new Error('Failed to parse AI prediction response');
    }
  }

  calculateCurrentMetrics(hypeData) {
    if (!hypeData || hypeData.length === 0) {
      return { currentScore: 0, mentions: 0, trend: 'unknown' };
    }
    
    const latest = hypeData[hypeData.length - 1];
    const previous = hypeData.length > 1 ? hypeData[hypeData.length - 2] : latest;
    
    return {
      currentScore: latest.score || 0,
      mentions: latest.mentions || 0,
      trend: latest.score > previous.score ? 'up' : latest.score < previous.score ? 'down' : 'flat'
    };
  }

  analyzeTrend(hypeData) {
    if (!hypeData || hypeData.length < 3) {
      return {
        direction: 'unknown',
        strength: 'weak',
        momentum: 'neutral',
        volatility: 'low',
        pattern: 'insufficient_data'
      };
    }
    
    // Calculate trend over last 5 points
    const recent = hypeData.slice(-5);
    const scores = recent.map(d => d.score || 0);
    
    // Linear regression for trend
    const n = scores.length;
    const x = Array.from({ length: n }, (_, i) => i);
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = scores.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * scores[i], 0);
    const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const volatility = this.calculateVolatility(scores);
    
    // Determine direction and strength
    let direction, strength;
    if (Math.abs(slope) < 0.1) {
      direction = 'sideways';
      strength = 'weak';
    } else if (slope > 0) {
      direction = 'bullish';
      strength = slope > 0.5 ? 'strong' : 'moderate';
    } else {
      direction = 'bearish';
      strength = slope < -0.5 ? 'strong' : 'moderate';
    }
    
    return {
      direction,
      strength,
      momentum: slope > 0.2 ? 'positive' : slope < -0.2 ? 'negative' : 'neutral',
      volatility: volatility > 1.5 ? 'high' : volatility > 0.8 ? 'medium' : 'low',
      pattern: this.identifyPattern(scores)
    };
  }

  calculateVolatility(scores) {
    if (scores.length < 2) return 0;
    
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const variance = scores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / scores.length;
    return Math.sqrt(variance);
  }

  identifyPattern(scores) {
    if (scores.length < 3) return 'insufficient_data';
    
    const changes = [];
    for (let i = 1; i < scores.length; i++) {
      changes.push(scores[i] - scores[i - 1]);
    }
    
    const positiveChanges = changes.filter(c => c > 0).length;
    const negativeChanges = changes.filter(c => c < 0).length;
    
    if (positiveChanges > negativeChanges * 2) return 'uptrend';
    if (negativeChanges > positiveChanges * 2) return 'downtrend';
    if (Math.abs(changes[changes.length - 1]) > 2) return 'breakout';
    
    return 'consolidation';
  }

  getFallbackPrediction(hypeData, range) {
    const currentMetrics = this.calculateCurrentMetrics(hypeData);
    const trendAnalysis = this.analyzeTrend(hypeData);
    
    return {
      prediction: {
        direction: trendAnalysis.direction === 'unknown' ? 'sideways' : trendAnalysis.direction,
        strength: trendAnalysis.strength,
        timeframe: '24h',
        targetScore: currentMetrics.currentScore,
        confidence: 0.5
      },
      reasoning: 'Fallback analysis based on technical indicators due to AI service unavailability',
      catalysts: ['Technical momentum', 'Community activity'],
      risks: ['Market volatility', 'Limited data'],
      keyLevels: {
        support: Math.max(0, currentMetrics.currentScore - 2),
        resistance: Math.min(10, currentMetrics.currentScore + 2)
      },
      recommendation: 'hold',
      cached: false,
      cacheAge: 0,
      fallback: true
    };
  }

  // Clean expired cache entries
  async cleanExpiredCache() {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, value] of this.predictionCache.entries()) {
      if (!value.timestamp || (now - value.timestamp) >= this.cacheTimeout) {
        this.predictionCache.delete(key);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      console.log(`🧠 Cleaned ${cleaned} expired AI prediction cache entries`);
      await this.saveCacheToFile();
    }
  }

  // Get cache statistics
  getCacheStats() {
    const now = Date.now();
    const entries = Array.from(this.predictionCache.values());
    
    return {
      totalEntries: entries.length,
      avgAge: entries.length > 0 ? 
        entries.reduce((sum, entry) => sum + (now - entry.timestamp), 0) / entries.length / (60 * 60 * 1000) : 0,
      oldestEntry: entries.length > 0 ? 
        Math.max(...entries.map(e => now - e.timestamp)) / (60 * 60 * 1000) : 0,
      cacheHitRate: 'tracked_separately' // Would need request tracking
    };
  }
}

export default AIHypePredictionService;
