import OpenAIService from './openaiService.js';
import { PROMPT_TEMPLATES, fillTemplate, validateAIResponse, extractConfidence, formatForDisplay } from './aiPromptTemplates.js';

/**
 * Social Context AI - DeGen Oracle's social sentiment analysis engine
 * Provides intelligent analysis of token social data for user decision making
 */
class SocialContextAI {
  constructor() {
    this.openaiService = new OpenAIService();
    this.isInitialized = false;
    this.analysisCache = new Map();
    this.performanceMetrics = {
      totalAnalyses: 0,
      averageConfidence: 0,
      userFeedback: [],
      accuracyScore: 0
    };
  }

  /**
   * Initialize the Social Context AI service
   */
  async initialize() {
    try {
      await this.openaiService.initialize();
      this.isInitialized = true;
      console.log('🧠 Social Context AI initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize Social Context AI:', error.message);
      throw error;
    }
  }

  /**
   * Generate comprehensive social context analysis for a token
   */
  async analyzeSocialContext(tokenData, options = {}) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const {
      useCache = true,
      cacheExpiry = 1800000, // 30 minutes default
      model = 'gpt-3.5-turbo',
      temperature = 0.7
    } = options;

    try {
      console.log(`🧠 Analyzing social context for ${tokenData.symbol}...`);
      
      // Prepare template variables
      const templateVars = this.prepareTemplateVariables(tokenData);
      
      // Generate cache key
      const cacheKey = `social_${tokenData.symbol}_${Date.now() - (Date.now() % cacheExpiry)}`;
      
      // Check cache
      if (useCache && this.analysisCache.has(cacheKey)) {
        console.log(`💾 Using cached social analysis for ${tokenData.symbol}`);
        return this.analysisCache.get(cacheKey);
      }

      // Fill template with token data
      const prompt = fillTemplate(PROMPT_TEMPLATES.SOCIAL_CONTEXT_ANALYSIS, templateVars);
      
      // Generate AI analysis
      const rawResponse = await this.openaiService.generateCompletion(prompt, {
        model,
        temperature,
        maxTokens: 1500,
        useCache,
        cacheExpiry
      });

      // Validate and parse response
      if (!validateAIResponse(rawResponse, 'SOCIAL_CONTEXT')) {
        throw new Error('Invalid AI response format');
      }

      const analysis = JSON.parse(rawResponse);
      
      // Add metadata
      const enrichedAnalysis = {
        ...analysis,
        metadata: {
          tokenSymbol: tokenData.symbol,
          analysisTimestamp: new Date().toISOString(),
          model: model,
          confidence: analysis.confidence,
          dataFreshness: this.assessDataFreshness(tokenData),
          analysisId: this.generateAnalysisId()
        }
      };

      // Cache the result
      if (useCache) {
        this.analysisCache.set(cacheKey, enrichedAnalysis);
      }

      // Update performance metrics
      this.updatePerformanceMetrics(analysis.confidence);

      console.log(`✅ Social context analysis completed for ${tokenData.symbol} (confidence: ${Math.round(analysis.confidence * 100)}%)`);
      
      return enrichedAnalysis;

    } catch (error) {
      console.error(`❌ Social context analysis failed for ${tokenData.symbol}:`, error.message);
      
      // Return fallback analysis
      return this.getFallbackAnalysis(tokenData, error.message);
    }
  }

  /**
   * Prepare template variables from token data
   */
  prepareTemplateVariables(tokenData) {
    const twitterData = tokenData.twitterData || {};
    const jupiterData = tokenData.jupiterData || {};
    const callHistory = tokenData.callHistory || {};
    
    return {
      tokenName: tokenData.name || 'Unknown',
      symbol: tokenData.symbol || 'N/A',
      marketCap: this.formatNumber(jupiterData.marketCap || tokenData.marketCap || 0),
      price: jupiterData.price || tokenData.price || 'N/A',
      priceChange24h: jupiterData.priceChange24h || tokenData.priceChange24h || 0,
      
      // Social metrics
      followers: this.formatNumber(twitterData.followers || 0),
      mentions24h: twitterData.mentions24h || 0,
      totalMentions: twitterData.mentions || 0,
      engagementRate: this.calculateEngagementRate(twitterData),
      communityScore: tokenData.communityHealthScore || tokenData.communityScore || 5,
      hypeScore: tokenData.hypeScore || 'N/A',
      officialHandle: twitterData.officialHandle || 'N/A',
      
      // Call history
      totalCalls: callHistory.totalCalls || 0,
      recentCalls: callHistory.recentCalls || 0,
      successRate: callHistory.successRate || 0,
      avgTimeTo2x: callHistory.avgTimeTo2x || 'N/A',
      
      // Additional data
      liquidity: this.formatNumber(jupiterData.liquidity || 0),
      holderCount: jupiterData.holderCount || 'N/A',
      recentEvents: this.extractRecentEvents(tokenData)
    };
  }

  /**
   * Calculate engagement rate from Twitter data
   */
  calculateEngagementRate(twitterData) {
    if (!twitterData.engagement || !twitterData.followers) return 0;
    
    const totalEngagement = twitterData.engagement.total || 0;
    const followers = twitterData.followers || 1;
    
    return Math.round((totalEngagement / followers) * 100 * 100) / 100; // 2 decimal places
  }

  /**
   * Extract recent events from token data
   */
  extractRecentEvents(tokenData) {
    const events = [];
    
    // Check for recent price movements
    if (tokenData.priceChange24h > 50) {
      events.push(`+${tokenData.priceChange24h.toFixed(1)}% price surge in 24h`);
    } else if (tokenData.priceChange24h < -30) {
      events.push(`${tokenData.priceChange24h.toFixed(1)}% price drop in 24h`);
    }
    
    // Check for social momentum
    if (tokenData.twitterData?.mentions24h > 100) {
      events.push(`High social activity: ${tokenData.twitterData.mentions24h} mentions in 24h`);
    }
    
    // Check for recent calls
    if (tokenData.callHistory?.recentCalls > 5) {
      events.push(`${tokenData.callHistory.recentCalls} users called this token recently`);
    }
    
    return events.length > 0 ? events.join('; ') : 'No significant recent events';
  }

  /**
   * Assess data freshness for analysis quality
   */
  assessDataFreshness(tokenData) {
    const now = Date.now();
    const twitterAge = tokenData.twitterTimestamp ? now - new Date(tokenData.twitterTimestamp).getTime() : Infinity;
    const jupiterAge = tokenData.jupiterTimestamp ? now - new Date(tokenData.jupiterTimestamp).getTime() : Infinity;
    
    const maxAge = Math.max(twitterAge, jupiterAge);
    
    if (maxAge < 300000) return 'fresh'; // < 5 minutes
    if (maxAge < 1800000) return 'recent'; // < 30 minutes
    if (maxAge < 3600000) return 'moderate'; // < 1 hour
    return 'stale'; // > 1 hour
  }

  /**
   * Generate unique analysis ID
   */
  generateAnalysisId() {
    return `analysis_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Update performance metrics
   */
  updatePerformanceMetrics(confidence) {
    this.performanceMetrics.totalAnalyses++;
    
    // Update average confidence
    const total = this.performanceMetrics.averageConfidence * (this.performanceMetrics.totalAnalyses - 1) + confidence;
    this.performanceMetrics.averageConfidence = total / this.performanceMetrics.totalAnalyses;
  }

  /**
   * Record user feedback on analysis quality
   */
  recordUserFeedback(analysisId, feedback) {
    this.performanceMetrics.userFeedback.push({
      analysisId,
      feedback, // 'positive', 'negative', 'neutral'
      timestamp: new Date().toISOString()
    });
    
    // Calculate accuracy score based on recent feedback
    const recentFeedback = this.performanceMetrics.userFeedback.slice(-100); // Last 100 pieces of feedback
    const positiveCount = recentFeedback.filter(f => f.feedback === 'positive').length;
    this.performanceMetrics.accuracyScore = positiveCount / recentFeedback.length;
    
    console.log(`📊 User feedback recorded for ${analysisId}: ${feedback}`);
  }

  /**
   * Get fallback analysis when AI fails
   */
  getFallbackAnalysis(tokenData, errorMessage) {
    console.log(`🔄 Generating fallback analysis for ${tokenData.symbol}`);
    
    // Simple rule-based analysis as fallback
    const communityScore = tokenData.communityHealthScore || tokenData.communityScore || 5;
    const mentions = tokenData.twitterData?.mentions || 0;
    const priceChange = tokenData.priceChange24h || 0;
    
    let sentiment = 'Neutral';
    let confidence = 0.3; // Low confidence for fallback
    let recommendation = 'Hold';
    
    if (communityScore > 7 && mentions > 50 && priceChange > 10) {
      sentiment = 'Bullish';
      confidence = 0.6;
      recommendation = 'Buy';
    } else if (communityScore < 4 || priceChange < -20) {
      sentiment = 'Bearish';
      confidence = 0.5;
      recommendation = 'Avoid';
    }
    
    return {
      sentiment,
      confidence,
      keyInsights: [
        `Community health score: ${communityScore}/10`,
        `Social mentions: ${mentions} (24h)`,
        `Price movement: ${priceChange.toFixed(1)}% (24h)`
      ],
      socialMomentum: {
        direction: priceChange > 5 ? 'Accelerating' : 'Stable',
        strength: mentions > 100 ? 'Strong' : 'Moderate',
        sustainability: 'Medium'
      },
      riskAssessment: {
        level: 'Medium',
        factors: ['Limited AI analysis available'],
        mitigants: ['Basic metrics still positive']
      },
      communityAnalysis: {
        organicGrowth: 'Moderate',
        engagementQuality: 'Medium',
        influencerSupport: 'Moderate',
        botActivity: 'Medium'
      },
      recommendation: {
        action: recommendation,
        reasoning: 'Based on basic metrics due to AI analysis failure',
        timeframe: 'Short-term',
        entryStrategy: 'Wait for dip'
      },
      catalysts: ['Monitor for improved data availability'],
      redFlags: ['AI analysis unavailable', errorMessage],
      metadata: {
        tokenSymbol: tokenData.symbol,
        analysisTimestamp: new Date().toISOString(),
        model: 'fallback',
        confidence: confidence,
        dataFreshness: 'limited',
        analysisId: this.generateAnalysisId(),
        isFallback: true
      }
    };
  }

  /**
   * Format numbers for display
   */
  formatNumber(num) {
    if (!num || num === 0) return '$0';
    if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
    if (num >= 1e3) return `$${(num / 1e3).toFixed(1)}K`;
    return `$${num.toFixed(2)}`;
  }

  /**
   * Get formatted analysis for frontend display
   */
  getFormattedAnalysis(analysis) {
    return formatForDisplay(JSON.stringify(analysis), 'SOCIAL_CONTEXT');
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics() {
    return {
      ...this.performanceMetrics,
      cacheSize: this.analysisCache.size,
      isInitialized: this.isInitialized
    };
  }

  /**
   * Clear analysis cache
   */
  clearCache() {
    this.analysisCache.clear();
    console.log('🗑️ Social Context AI cache cleared');
  }
}

export default SocialContextAI;
