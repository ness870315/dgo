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
      console.log(`🧠 AI Hype Prediction cache directory: ${this.cacheDir}`);
      console.log(`🧠 AI Hype Prediction cache file: ${this.predictionCacheFile}`);
      
      // Ensure cache file exists
      await this.ensureCacheFileExists();
      
      // Load existing cache
      try {
        const cacheData = await fs.readFile(this.predictionCacheFile, 'utf8');
        const parsed = JSON.parse(cacheData);
        
        // Convert to Map and filter expired entries
        const now = Date.now();
        let loaded = 0;
        let expired = 0;
        
        for (const [key, value] of Object.entries(parsed)) {
          if (value.timestamp && (now - value.timestamp) < this.cacheTimeout) {
            this.predictionCache.set(key, value);
            loaded++;
          } else {
            expired++;
          }
        }
        
        console.log(`🧠 Loaded ${loaded} cached AI hype predictions (${expired} expired entries filtered)`);
      } catch (err) {
        if (err.code === 'ENOENT') {
          console.log('🧠 No existing AI hype prediction cache found, starting fresh');
        } else {
          console.log('🧠 No existing AI hype prediction cache found, starting fresh');
          console.log(`🧠 Cache file path: ${this.predictionCacheFile}`);
          console.log(`🧠 Error details: ${err.message}`);
        }
      }
    } catch (error) {
      console.error('❌ Error initializing AI hype prediction cache:', error);
    }
  }

  async ensureCacheFileExists() {
    try {
      await fs.access(this.predictionCacheFile);
    } catch (error) {
      if (error.code === 'ENOENT') {
        // Create empty cache file
        await fs.writeFile(this.predictionCacheFile, '{}');
        console.log('🧠 Created empty AI hype prediction cache file');
      }
    }
  }

  async saveCacheToFile() {
    try {
      await this.ensureCacheFileExists();
      const cacheObj = Object.fromEntries(this.predictionCache);
      
      // 🛡️ ATOMIC WRITE: Save AI hype prediction cache
      const tempPath = this.predictionCacheFile + '.tmp';
      const jsonData = JSON.stringify(cacheObj, null, 2);
      
      await fs.writeFile(tempPath, jsonData, 'utf8');
      await fs.rename(tempPath, this.predictionCacheFile);
      console.log(`🧠 Saved ${this.predictionCache.size} AI hype predictions to cache file`);
    } catch (error) {
      // Cleanup temp file if it exists
      try {
        await fs.unlink(this.predictionCacheFile + '.tmp');
      } catch (_) {}
      console.error('❌ Error saving AI hype prediction cache:', error);
      console.error(`❌ Cache file path: ${this.predictionCacheFile}`);
      console.error(`❌ Cache directory exists: ${await fs.access(this.cacheDir).then(() => true).catch(() => false)}`);
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
      
      // Save cache to file immediately to ensure persistence
      try {
        await this.saveCacheToFile();
      } catch (err) {
        console.error('❌ Error saving AI prediction cache:', err);
      }
      
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
      console.log(`🧠 Calling OpenAI for hype prediction with prompt length: ${prompt.length}`);
      const response = await this.openaiService.generateCompletion(prompt, {
        model: 'gpt-4',
        temperature: 0.3,
        max_tokens: 1000
      });

      console.log(`🤖 OpenAI response for hype prediction: ${response.substring(0, 200)}...`);

      // Parse and validate response
      const prediction = this.parsePredictionResponse(response);
      console.log(`📊 Parsed prediction:`, prediction);
      
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
    // Use the enhanced template with proper variable substitution
    const { ENHANCED_PROMPT_TEMPLATES } = require('./aiPromptTemplates_enhanced.js');
    
    const variables = {
      symbol: tokenData?.symbol || 'Unknown',
      name: tokenData?.name || 'Unknown Token',
      timeRange: range,
      marketCap: tokenData?.jupiterData?.mcap || tokenData?.marketCap || 'N/A',
      price: tokenData?.jupiterData?.price || tokenData?.price || 'N/A',
      hypeData: recentData.map(d => `${new Date(d.timestamp).toLocaleString()}: Score ${d.score}/10, ${d.mentions} mentions, ${d.label}`).join('\n'),
      holderChange: tokenData?.jupiterData?.holderChange || 0,
      volumeChange: tokenData?.jupiterData?.stats24h?.volumeChange || 0,
      priceChange: tokenData?.jupiterData?.stats24h?.priceChange || 0,
      organicScore: tokenData?.jupiterData?.organicScore || tokenData?.organicScore || 'N/A',
      organicScoreLabel: this.getOrganicScoreLabel(tokenData?.jupiterData?.organicScore || tokenData?.organicScore),
      liquidity: tokenData?.jupiterData?.liquidity || tokenData?.liquidity || 'N/A'
    };
    
    return this.fillTemplate(ENHANCED_PROMPT_TEMPLATES.HYPE_TREND_ANALYSIS, variables);
  }
  
  getOrganicScoreLabel(score) {
    if (!score || score === 'N/A') return 'Unknown';
    if (score >= 80) return 'Highly Organic';
    if (score >= 60) return 'Mostly Organic';
    if (score >= 40) return 'Mixed Activity';
    if (score >= 20) return 'Suspicious Activity';
    return 'Likely Artificial';
  }
  
  fillTemplate(template, variables) {
    let filled = template;
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`\\{${key}\\}`, 'g');
      filled = filled.replace(regex, String(value));
    }
    return filled;
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
    
    // Generate unique fallback based on actual data
    const score = currentMetrics.currentScore;
    const direction = trendAnalysis.direction === 'unknown' ? 'sideways' : trendAnalysis.direction;
    
    let trendSummary, patternAnalysis, recommendation, catalysts, risks;
    
    if (score > 7) {
      trendSummary = 'High hype score detected - either moon mission energy or pump and dump incoming!';
      patternAnalysis = 'Strong momentum with potential for explosive moves - diamond hands or paper hands?';
      recommendation = 'monitor';
      catalysts = ['High hype momentum', 'Potential breakout incoming'];
      risks = ['Pump and dump risk', 'High volatility expected'];
    } else if (score > 4) {
      trendSummary = 'Moderate hype building - consolidation vibes before the next move';
      patternAnalysis = 'Steady accumulation phase - degens either accumulating or waiting for signals';
      recommendation = 'hold';
      catalysts = ['Building momentum', 'Community growth'];
      risks = ['Consolidation phase', 'Waiting for catalyst'];
    } else {
      trendSummary = 'Low hype energy - either sleeping giant or dead project vibes';
      patternAnalysis = 'Weak momentum - needs catalyst to wake up the community';
      recommendation = 'wait';
      catalysts = ['Potential awakening', 'Low entry opportunity'];
      risks = ['Dead project risk', 'No community interest'];
    }
    
    return {
      prediction: {
        direction: direction,
        strength: trendAnalysis.strength,
        timeframe: '24h',
        targetScore: score,
        confidence: 0.5
      },
      reasoning: trendSummary,
      catalysts: catalysts,
      risks: risks,
      keyLevels: {
        support: Math.max(0, score - 2),
        resistance: Math.min(10, score + 2)
      },
      recommendation: recommendation,
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
