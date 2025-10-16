/**
 * Enhanced Predictive Analytics Service with GPT-4 Turbo Integration
 * 
 * Integrates all LLM-enhanced ML services:
 * - EnhancedKOLPerformancePredictor
 * - EnhancedTokenMomentumForecaster  
 * - EnhancedEarlyWarningDetector
 * 
 * Provides comprehensive AI-powered analytics with natural language insights
 */

import EnhancedKOLPerformancePredictor from './EnhancedKOLPerformancePredictor.js';
import EnhancedTokenMomentumForecaster from './EnhancedTokenMomentumForecaster.js';
import EnhancedEarlyWarningDetector from './EnhancedEarlyWarningDetector.js';
import OpenAIService from '../openaiService.js';

class EnhancedPredictiveAnalyticsService {
  constructor(kolService) {
    this.kolService = kolService;
    this.enhancedKOLPredictor = new EnhancedKOLPerformancePredictor();
    this.enhancedMomentumForecaster = new EnhancedTokenMomentumForecaster();
    this.enhancedEarlyWarningDetector = new EnhancedEarlyWarningDetector();
    this.openaiService = new OpenAIService();
    
    // Enhanced caching with LLM insights
    this.cache = new Map();
    this.CACHE_TTL = 5 * 60 * 1000; // 5 minutes TTL
    this.LLM_CACHE_TTL = 30 * 60 * 1000; // 30 minutes TTL for LLM insights
    
    // Analytics metrics
    this.metrics = {
      totalPredictions: 0,
      llmEnhancedPredictions: 0,
      cacheHits: 0,
      averageResponseTime: 0,
      errorCount: 0
    };
  }

  /**
   * Initialize all enhanced services
   */
  async initialize() {
    try {
      console.log('🧠 [ENHANCED PREDICTIVE ANALYTICS] Initializing all LLM-enhanced services...');
      
      // Initialize OpenAI service
      await this.openaiService.initialize();
      
      // Initialize base ML services
      await this.enhancedKOLPredictor.initialize();
      await this.enhancedMomentumForecaster.initialize();
      await this.enhancedEarlyWarningDetector.initialize();
      
      console.log('✅ [ENHANCED PREDICTIVE ANALYTICS] All LLM-enhanced services initialized successfully');
      
    } catch (error) {
      console.error('❌ [ENHANCED PREDICTIVE ANALYTICS] Initialization failed:', error.message);
      throw error;
    }
  }

  /**
   * Get comprehensive KOL analytics with LLM insights
   */
  async getKOLAnalytics(kolHandle) {
    const startTime = Date.now();
    const cacheKey = `kol_analytics_${kolHandle}`;
    
    try {
      // Check cache first
      if (this.cache.has(cacheKey) && (Date.now() - this.cache.get(cacheKey).timestamp < this.CACHE_TTL)) {
        console.log(`💾 [ENHANCED PREDICTIVE ANALYTICS] Using cached KOL analytics for ${kolHandle}`);
        this.metrics.cacheHits++;
        return this.cache.get(cacheKey).data;
      }

      console.log(`🧠 [ENHANCED PREDICTIVE ANALYTICS] Getting comprehensive analytics for @${kolHandle}`);
      
      // Get KOL data
      const kol = this.kolService.getKOLs().find(k => k.handle === kolHandle);
      if (!kol) {
        throw new Error(`KOL ${kolHandle} not found`);
      }

      // Get enhanced performance prediction
      const performancePrediction = await this.enhancedKOLPredictor.predict(kol);
      
      // Get related early warning signals
      const relatedSignals = this.enhancedEarlyWarningDetector.getAlerts()
        .filter(alert => alert.details && alert.details.kol === kolHandle);
      
      // Get market context analysis
      const marketContext = await this.enhancedKOLPredictor.getMarketContextAnalysis([kol]);
      
      // Generate comprehensive insights
      const comprehensiveInsights = await this.generateComprehensiveKOLInsights(
        kol, 
        performancePrediction, 
        relatedSignals, 
        marketContext
      );

      const analytics = {
        kolHandle,
        basicInfo: {
          handle: kol.handle,
          followers: kol.followers,
          totalPosts: kol.total_posts,
          influenceScore: kol.influence_score
        },
        performancePrediction,
        relatedSignals,
        marketContext,
        comprehensiveInsights,
        timestamp: Date.now(),
        analyticsVersion: '2.0-LLM-Enhanced'
      };

      // Cache the results
      this.cache.set(cacheKey, { data: analytics, timestamp: Date.now() });
      
      // Update metrics
      this.metrics.totalPredictions++;
      this.metrics.llmEnhancedPredictions++;
      this.metrics.averageResponseTime = (this.metrics.averageResponseTime + (Date.now() - startTime)) / 2;
      
      console.log(`✅ [ENHANCED PREDICTIVE ANALYTICS] Comprehensive KOL analytics complete for @${kolHandle}`);
      
      return analytics;
      
    } catch (error) {
      console.error(`❌ [ENHANCED PREDICTIVE ANALYTICS] Error getting KOL analytics for ${kolHandle}:`, error.message);
      this.metrics.errorCount++;
      throw error;
    }
  }

  /**
   * Get comprehensive token analytics with LLM insights
   */
  async getTokenAnalytics(coinSymbol) {
    const startTime = Date.now();
    const cacheKey = `token_analytics_${coinSymbol}`;
    
    try {
      // Check cache first
      if (this.cache.has(cacheKey) && (Date.now() - this.cache.get(cacheKey).timestamp < this.CACHE_TTL)) {
        console.log(`💾 [ENHANCED PREDICTIVE ANALYTICS] Using cached token analytics for ${coinSymbol}`);
        this.metrics.cacheHits++;
        return this.cache.get(cacheKey).data;
      }

      console.log(`🧠 [ENHANCED PREDICTIVE ANALYTICS] Getting comprehensive analytics for ${coinSymbol}`);
      
      // Get historical data
      const historicalPrices = await this.kolService.getHistoricalPricesForCoin(coinSymbol, 30);
      const kolMentions = this.kolService.getPosts().filter(p => p.coins.includes(coinSymbol));
      const sentimentData = kolMentions.map(p => ({ timestamp: p.created_at, sentiment: p.sentiment }));
      
      // Get enhanced momentum forecast
      const momentumForecast = await this.enhancedMomentumForecaster.forecastMomentum(
        coinSymbol, 
        historicalPrices, 
        kolMentions, 
        sentimentData
      );
      
      // Get related early warning signals
      const relatedSignals = this.enhancedEarlyWarningDetector.getAlerts()
        .filter(alert => alert.details && alert.details.coin === coinSymbol);
      
      // Get sector analysis
      const sectorAnalysis = await this.enhancedMomentumForecaster.getSectorMomentumAnalysis([
        { symbol: coinSymbol, ...momentumForecast }
      ]);
      
      // Generate comprehensive insights
      const comprehensiveInsights = await this.generateComprehensiveTokenInsights(
        coinSymbol,
        momentumForecast,
        relatedSignals,
        sectorAnalysis
      );

      const analytics = {
        coinSymbol,
        basicInfo: {
          symbol: coinSymbol,
          currentPrice: historicalPrices[historicalPrices.length - 1]?.price,
          priceChange24h: this.calculatePriceChange(historicalPrices),
          volume24h: historicalPrices[historicalPrices.length - 1]?.volume
        },
        momentumForecast,
        relatedSignals,
        sectorAnalysis,
        comprehensiveInsights,
        timestamp: Date.now(),
        analyticsVersion: '2.0-LLM-Enhanced'
      };

      // Cache the results
      this.cache.set(cacheKey, { data: analytics, timestamp: Date.now() });
      
      // Update metrics
      this.metrics.totalPredictions++;
      this.metrics.llmEnhancedPredictions++;
      this.metrics.averageResponseTime = (this.metrics.averageResponseTime + (Date.now() - startTime)) / 2;
      
      console.log(`✅ [ENHANCED PREDICTIVE ANALYTICS] Comprehensive token analytics complete for ${coinSymbol}`);
      
      return analytics;
      
    } catch (error) {
      console.error(`❌ [ENHANCED PREDICTIVE ANALYTICS] Error getting token analytics for ${coinSymbol}:`, error.message);
      this.metrics.errorCount++;
      throw error;
    }
  }

  /**
   * Generate comprehensive KOL insights using LLM
   */
  async generateComprehensiveKOLInsights(kol, performancePrediction, relatedSignals, marketContext) {
    try {
      const prompt = `You are a crypto market intelligence analyst. Provide comprehensive insights for this KOL:

KOL: @${kol.handle}
Performance Prediction: ${performancePrediction.predictions.alphaScore30d}/100 (30d)
Confidence: ${(performancePrediction.confidence * 100).toFixed(1)}%
Related Signals: ${relatedSignals.length} active alerts
Market Context: ${marketContext.marketRegime}

Provide comprehensive analysis in JSON format:
{
  "executiveSummary": "2-3 sentence executive summary",
  "keyStrengths": ["strength1", "strength2"],
  "keyWeaknesses": ["weakness1", "weakness2"],
  "tradingImplications": {
    "shortTerm": "1-7 days outlook",
    "mediumTerm": "1-4 weeks outlook",
    "longTerm": "1-3 months outlook"
  },
  "riskAssessment": {
    "overallRisk": "low|medium|high",
    "primaryRisks": ["risk1", "risk2"],
    "mitigationStrategies": ["strategy1", "strategy2"]
  },
  "competitivePosition": "position relative to other KOLs",
  "marketOpportunity": "opportunities this KOL represents",
  "recommendedActions": ["action1", "action2"]
}

Focus on actionable insights for traders and investors.`;

      const response = await this.openaiService.generateCompletion(prompt, {
        model: 'gpt-4-turbo',
        temperature: 0.3,
        maxTokens: 500,
        useCache: true,
        cacheExpiry: this.LLM_CACHE_TTL
      });

      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      
      return this.createFallbackKOLInsights();
      
    } catch (error) {
      console.error('❌ [ENHANCED PREDICTIVE ANALYTICS] Comprehensive KOL insights failed:', error.message);
      return this.createFallbackKOLInsights();
    }
  }

  /**
   * Generate comprehensive token insights using LLM
   */
  async generateComprehensiveTokenInsights(coinSymbol, momentumForecast, relatedSignals, sectorAnalysis) {
    try {
      const prompt = `You are a crypto market intelligence analyst. Provide comprehensive insights for this token:

TOKEN: ${coinSymbol}
Momentum Score: ${momentumForecast.momentumScore}
Trend Direction: ${momentumForecast.trendDirection}
Strength: ${momentumForecast.strength}
Related Signals: ${relatedSignals.length} active alerts
Sector Trend: ${sectorAnalysis.sectorTrend}

Provide comprehensive analysis in JSON format:
{
  "executiveSummary": "2-3 sentence executive summary",
  "technicalOutlook": {
    "shortTerm": "1-7 days technical outlook",
    "mediumTerm": "1-4 weeks technical outlook",
    "longTerm": "1-3 months technical outlook"
  },
  "fundamentalFactors": ["factor1", "factor2"],
  "riskAssessment": {
    "overallRisk": "low|medium|high",
    "primaryRisks": ["risk1", "risk2"],
    "mitigationStrategies": ["strategy1", "strategy2"]
  },
  "marketPosition": "position relative to sector and market",
  "opportunityAssessment": "opportunities this token represents",
  "recommendedStrategy": "overall recommended strategy"
}

Focus on actionable insights for traders and investors.`;

      const response = await this.openaiService.generateCompletion(prompt, {
        model: 'gpt-4-turbo',
        temperature: 0.3,
        maxTokens: 500,
        useCache: true,
        cacheExpiry: this.LLM_CACHE_TTL
      });

      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      
      return this.createFallbackTokenInsights();
      
    } catch (error) {
      console.error('❌ [ENHANCED PREDICTIVE ANALYTICS] Comprehensive token insights failed:', error.message);
      return this.createFallbackTokenInsights();
    }
  }

  /**
   * Get market-wide analytics with LLM insights
   */
  async getMarketAnalytics() {
    try {
      console.log('🧠 [ENHANCED PREDICTIVE ANALYTICS] Getting market-wide analytics with LLM insights');
      
      // Get all KOLs and tokens
      const allKOLs = this.kolService.getKOLs();
      const allPosts = this.kolService.getPosts();
      
      // Get alert summary
      const alertSummary = await this.enhancedEarlyWarningDetector.getAlertSummary();
      
      // Get market context
      const marketContext = await this.enhancedKOLPredictor.getMarketContextAnalysis(allKOLs);
      
      // Generate market insights
      const marketInsights = await this.generateMarketInsights(allKOLs, allPosts, alertSummary, marketContext);
      
      return {
        alertSummary,
        marketContext,
        marketInsights,
        totalKOLs: allKOLs.length,
        totalPosts: allPosts.length,
        activeAlerts: this.enhancedEarlyWarningDetector.getAlerts().length,
        timestamp: Date.now(),
        analyticsVersion: '2.0-LLM-Enhanced'
      };
      
    } catch (error) {
      console.error('❌ [ENHANCED PREDICTIVE ANALYTICS] Market analytics failed:', error.message);
      throw error;
    }
  }

  /**
   * Generate market insights using LLM
   */
  async generateMarketInsights(allKOLs, allPosts, alertSummary, marketContext) {
    try {
      const prompt = `You are a crypto market intelligence analyst. Provide market-wide insights:

MARKET DATA:
- Total KOLs: ${allKOLs.length}
- Total Posts: ${allPosts.length}
- Active Alerts: ${alertSummary.riskLevel} risk level
- Market Regime: ${marketContext.marketRegime}
- Sector Trends: ${marketContext.sectorTrends.join(', ')}

Provide market analysis in JSON format:
{
  "marketOverview": "overall market assessment",
  "keyTrends": ["trend1", "trend2"],
  "riskFactors": ["risk1", "risk2"],
  "opportunities": ["opportunity1", "opportunity2"],
  "recommendedStrategy": "overall market strategy",
  "sectorRotation": "sector rotation analysis",
  "macroOutlook": "macro economic outlook"
}

Focus on actionable market insights.`;

      const response = await this.openaiService.generateCompletion(prompt, {
        model: 'gpt-4-turbo',
        temperature: 0.4,
        maxTokens: 400,
        useCache: true,
        cacheExpiry: this.LLM_CACHE_TTL
      });

      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      
      return this.createFallbackMarketInsights();
      
    } catch (error) {
      console.error('❌ [ENHANCED PREDICTIVE ANALYTICS] Market insights failed:', error.message);
      return this.createFallbackMarketInsights();
    }
  }

  /**
   * Calculate price change percentage
   */
  calculatePriceChange(historicalPrices) {
    if (historicalPrices.length < 2) return 0;
    
    const current = historicalPrices[historicalPrices.length - 1].price;
    const previous = historicalPrices[historicalPrices.length - 2].price;
    
    return ((current - previous) / previous * 100).toFixed(2);
  }

  /**
   * Create fallback insights
   */
  createFallbackKOLInsights() {
    return {
      executiveSummary: 'Standard KOL analysis completed',
      keyStrengths: ['Consistent performance'],
      keyWeaknesses: ['Limited data'],
      tradingImplications: {
        shortTerm: 'Monitor closely',
        mediumTerm: 'Evaluate performance',
        longTerm: 'Assess long-term potential'
      },
      riskAssessment: {
        overallRisk: 'medium',
        primaryRisks: ['Market volatility'],
        mitigationStrategies: ['Position sizing']
      },
      competitivePosition: 'Standard position',
      marketOpportunity: 'Standard opportunity',
      recommendedActions: ['Monitor performance']
    };
  }

  createFallbackTokenInsights() {
    return {
      executiveSummary: 'Standard token analysis completed',
      technicalOutlook: {
        shortTerm: 'Monitor for signals',
        mediumTerm: 'Evaluate trend',
        longTerm: 'Assess fundamentals'
      },
      fundamentalFactors: ['Market conditions'],
      riskAssessment: {
        overallRisk: 'medium',
        primaryRisks: ['Market volatility'],
        mitigationStrategies: ['Position sizing']
      },
      marketPosition: 'Standard position',
      opportunityAssessment: 'Standard opportunity',
      recommendedStrategy: 'Monitor and evaluate'
    };
  }

  createFallbackMarketInsights() {
    return {
      marketOverview: 'Standard market conditions',
      keyTrends: ['Mixed trends'],
      riskFactors: ['Market volatility'],
      opportunities: ['Standard opportunities'],
      recommendedStrategy: 'Monitor market conditions',
      sectorRotation: 'Standard rotation',
      macroOutlook: 'Standard macro conditions'
    };
  }

  /**
   * Get service metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      cacheSize: this.cache.size,
      cacheHitRate: this.metrics.cacheHits / Math.max(1, this.metrics.totalPredictions),
      llmEnhancementRate: this.metrics.llmEnhancedPredictions / Math.max(1, this.metrics.totalPredictions)
    };
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
    console.log('🧹 [ENHANCED PREDICTIVE ANALYTICS] Cache cleared');
  }
}

export default EnhancedPredictiveAnalyticsService;
