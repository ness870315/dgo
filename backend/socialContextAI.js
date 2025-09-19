import OpenAIService from './openaiService.js';
import { PROMPT_TEMPLATES } from './aiPromptTemplates.js';

/**
 * Social Context AI - DeGen Oracle's technical analysis engine (No Social Context)
 * Provides intelligent analysis of token technical data, holder insights, and trading signals
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
   * Fill template with variables (simple string replacement)
   */
  fillTemplate(template, variables) {
    let result = template;
    for (const [key, value] of Object.entries(variables)) {
      const placeholder = `{${key}}`;
      result = result.replace(new RegExp(placeholder, 'g'), value || 'N/A');
    }
    return result;
  }

  /**
   * Initialize the Social Context AI service
   */
  async initialize() {
    try {
      await this.openaiService.initialize();
      this.isInitialized = true;
      console.log('🧠 Technical Analysis AI initialized successfully with OpenAI');
    } catch (error) {
      console.warn('⚠️ OpenAI service not available:', error.message);
      console.log('🧠 Technical Analysis AI will use enhanced fallback analysis only');
      this.isInitialized = true; // Still mark as initialized to allow fallback analysis
      this.openaiService = null; // Clear the service to prevent further attempts
    }
  }

  /**
   * Generate comprehensive technical analysis for a token
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
      console.log(`🧠 Analyzing technical data for ${tokenData.symbol}...`);
      
      // Prepare template variables
      const templateVars = this.prepareTemplateVariables(tokenData);
      
      // Generate cache key (tier/model-specific to avoid free↔premium collisions)
      const timeBucket = Date.now() - (Date.now() % cacheExpiry);
      const tier = (options?.model && String(options.model).toLowerCase().includes('gpt-4')) ? 'premium' : 'free';
      const id = tokenData.contractAddress || tokenData.symbol || 'unknown';
      const cacheKey = `technical_${tier}_${options?.model || 'gpt-3.5-turbo'}_${id}_${timeBucket}`;
      
      // Check cache
      if (useCache && this.analysisCache.has(cacheKey)) {
        console.log(`💾 Using cached technical analysis for ${tokenData.symbol}`);
        return this.analysisCache.get(cacheKey);
      }

      // Check if OpenAI service is available
      if (!this.openaiService) {
        console.log(`🧠 OpenAI not available for ${tokenData.symbol}, using enhanced fallback analysis`);
        throw new Error('OpenAI service not available - using enhanced fallback');
      }

      // Use technical analysis template (no social context)
      const prompt = this.fillTemplate(PROMPT_TEMPLATES.TECHNICAL_ANALYSIS_ONLY, templateVars);
      
      // Generate AI analysis
      const rawResponse = await this.openaiService.generateCompletion(prompt, {
        model,
        temperature,
        maxTokens: 1200, // Balanced for quality and speed
        useCache,
        cacheExpiry
      });

      // Parse AI response
      let analysis;
      try {
        analysis = JSON.parse(rawResponse);
      } catch (parseError) {
        console.error('❌ Failed to parse AI response:', parseError);
        throw new Error('Invalid AI response format');
      }

      // Validate response structure
      if (!analysis.sentiment || !analysis.keyInsights) {
        throw new Error('Invalid analysis structure');
      }

      // Cache the result
      if (useCache) {
        this.analysisCache.set(cacheKey, {
          success: true,
          analysis: analysis,
          metadata: {
            model: model,
            confidence: analysis.confidence,
            dataFreshness: this.assessDataFreshness(tokenData),
            analysisId: this.generateAnalysisId()
          }
        });
      }

      // Update performance metrics
      this.performanceMetrics.totalAnalyses++;
      this.performanceMetrics.averageConfidence = 
        (this.performanceMetrics.averageConfidence * (this.performanceMetrics.totalAnalyses - 1) + (analysis.confidence || 0.5)) / 
        this.performanceMetrics.totalAnalyses;

      console.log(`✅ Technical analysis completed for ${tokenData.symbol}`);
      return {
        success: true,
        analysis: analysis,
        metadata: {
          model: model,
          confidence: analysis.confidence,
          dataFreshness: this.assessDataFreshness(tokenData),
          analysisId: this.generateAnalysisId()
        }
      };

    } catch (error) {
      console.error(`❌ Technical analysis error for ${tokenData.symbol}:`, error);
      
      // Return fallback analysis
      return {
        success: false,
        analysis: this.generateFallbackAnalysis(tokenData),
        metadata: {
          fallbackReason: error.message,
          errorType: 'ai_analysis_failed',
          hasOpenAIKey: !!process.env.OPENAI_API_KEY,
          modelAttempted: model,
          fallbackTimestamp: new Date().toISOString()
        }
      };
    }
  }

  /**
   * Prepare template variables from token data (Technical Analysis Only)
   */
  prepareTemplateVariables(tokenData) {
    const jupiterData = tokenData.jupiterData || {};
    const callHistory = tokenData.callHistory || {};
    const holderData = tokenData.holderData || {};
    const technicalAnalysis = tokenData.technicalAnalysis || {};
    const moralisAnalytics = tokenData.moralisAnalytics || {};
    
    // Process holder distribution data for AI analysis
    const holderStats = holderData.holderStats || {};
    const topHolders = holderData.topHolders || {};
    const holderChanges = holderData.holderChanges || {};
    
    // Calculate holder concentration metrics
    const top10Percentage = topHolders.holders?.slice(0, 10).reduce((sum, holder) => sum + (holder.percentage || 0), 0) || 0;
    const top20Percentage = topHolders.holders?.slice(0, 20).reduce((sum, holder) => sum + (holder.percentage || 0), 0) || 0;
    
    // Determine concentration level
    let concentrationLevel = 'Unknown';
    if (top10Percentage > 0) {
      if (top10Percentage < 20) concentrationLevel = 'Well distributed';
      else if (top10Percentage < 40) concentrationLevel = 'Moderately concentrated';
      else concentrationLevel = 'Highly concentrated';
    }
    
    // Calculate holder growth
    const currentHolders = holderStats.totalHolders || holderChanges.currentHolders || 0;
    const previousHolders = holderChanges.previousHolders || currentHolders;
    const holderGrowth = previousHolders > 0 ? ((currentHolders - previousHolders) / previousHolders * 100) : 0;
    
    // Process holder segments
    const segments = holderStats.holderDistribution || {};
    const holderSegments = Object.entries(segments)
      .map(([segment, count]) => `${segment}: ${count}`)
      .join(', ') || 'N/A';
    
    // Calculate new vs returning holders
    const newHolders = holderChanges.newHolders || 0;
    const returningHolders = holderChanges.returningHolders || 0;
    const totalNewHolders = newHolders + returningHolders;
    const newHoldersPercent = totalNewHolders > 0 ? (newHolders / totalNewHolders * 100) : 0;
    const returningHoldersPercent = totalNewHolders > 0 ? (returningHolders / totalNewHolders * 100) : 0;

    return {
      // Basic Token Information
      tokenName: tokenData.name || 'Unknown',
      symbol: tokenData.symbol || 'N/A',
      marketCap: this.formatNumber(jupiterData.mcap || jupiterData.marketCap || tokenData.marketCap || 0),
      price: jupiterData.usdPrice || jupiterData.price || tokenData.price || 'N/A',
      priceChange24h: Number(jupiterData.priceChange24h || tokenData.priceChange24h || 0).toFixed(2),
      priceChange1h: Number(jupiterData.stats1h?.priceChange || jupiterData.priceChange1h || 0).toFixed(2),
      priceChange6h: Number(jupiterData.stats6h?.priceChange || jupiterData.priceChange6h || 0).toFixed(2),
      priceChange7d: Number(jupiterData.stats7d?.priceChange || jupiterData.priceChange7d || 0).toFixed(2),

      // Trading Analytics
      stats1h: `${Number(jupiterData.stats1h?.priceChange || 0).toFixed(2)}% price, ${Number(jupiterData.stats1h?.holderChange || 0).toFixed(2)}% holders`,
      stats6h: `${Number(jupiterData.stats6h?.priceChange || 0).toFixed(2)}% price, ${Number(jupiterData.stats6h?.holderChange || 0).toFixed(2)}% holders`,
      stats24h: `${Number(jupiterData.stats24h?.priceChange || 0).toFixed(2)}% price, ${Number(jupiterData.stats24h?.holderChange || 0).toFixed(2)}% holders`,
      volume24h: this.formatNumber(
        (jupiterData.stats24h?.buyVolume || 0) + (jupiterData.stats24h?.sellVolume || 0) ||
        jupiterData.volume24h || 
        tokenData.volume24h || 0
      ),
      volumeChange24h: Number(jupiterData.stats24h?.volumeChange || jupiterData.volumeChange24h || 0).toFixed(2),

      // Holder Distribution Data
      totalHolders: currentHolders,
      top10Percentage: top10Percentage.toFixed(2),
      top20Percentage: top20Percentage.toFixed(2),
      concentrationLevel: concentrationLevel,
      holderGrowth: holderGrowth.toFixed(2),
      newHolders: newHoldersPercent.toFixed(2),
      returningHolders: returningHoldersPercent.toFixed(2),
      holderSegments: holderSegments,

      // Moralis Token Analytics
      volume5m: this.formatNumber(moralisAnalytics?.totalBuyVolume?.['5m'] + moralisAnalytics?.totalSellVolume?.['5m'] || 0),
      volume1h: this.formatNumber(moralisAnalytics?.totalBuyVolume?.['1h'] + moralisAnalytics?.totalSellVolume?.['1h'] || 0),
      volume6h: this.formatNumber(moralisAnalytics?.totalBuyVolume?.['6h'] + moralisAnalytics?.totalSellVolume?.['6h'] || 0),
      volume24h: this.formatNumber(moralisAnalytics?.totalBuyVolume?.['24h'] + moralisAnalytics?.totalSellVolume?.['24h'] || 0),
      buyVolume5m: this.formatNumber(moralisAnalytics?.totalBuyVolume?.['5m'] || 0),
      sellVolume5m: this.formatNumber(moralisAnalytics?.totalSellVolume?.['5m'] || 0),
      buyVolume1h: this.formatNumber(moralisAnalytics?.totalBuyVolume?.['1h'] || 0),
      sellVolume1h: this.formatNumber(moralisAnalytics?.totalSellVolume?.['1h'] || 0),
      buyVolume24h: this.formatNumber(moralisAnalytics?.totalBuyVolume?.['24h'] || 0),
      sellVolume24h: this.formatNumber(moralisAnalytics?.totalSellVolume?.['24h'] || 0),
      buySellRatio5m: this.calculateBuySellRatio(moralisAnalytics?.totalBuyVolume?.['5m'], moralisAnalytics?.totalSellVolume?.['5m']),
      buySellRatio1h: this.calculateBuySellRatio(moralisAnalytics?.totalBuyVolume?.['1h'], moralisAnalytics?.totalSellVolume?.['1h']),
      buySellRatio24h: this.calculateBuySellRatio(moralisAnalytics?.totalBuyVolume?.['24h'], moralisAnalytics?.totalSellVolume?.['24h']),

      // Technical Analysis Integration
      technicalMarketOverview: technicalAnalysis?.marketOverview?.summary || 'N/A',
      technicalTrend: technicalAnalysis?.marketOverview?.trend || 'N/A',
      technicalMomentum: technicalAnalysis?.marketOverview?.momentum || 'N/A',
      technicalVolatility: technicalAnalysis?.marketOverview?.volatility || 'N/A',
      technicalVolumeAnalysis: technicalAnalysis?.volumeAnalysis?.summary || 'N/A',
      technicalRSI: technicalAnalysis?.technicalIndicators?.rsi || 'N/A',
      technicalMACD: technicalAnalysis?.technicalIndicators?.macd || 'N/A',
      technicalSupport: technicalAnalysis?.keyLevels?.support?.join(', ') || 'N/A',
      technicalResistance: technicalAnalysis?.keyLevels?.resistance?.join(', ') || 'N/A',
      technicalPatterns: technicalAnalysis?.chartPatterns?.join(', ') || 'N/A',

      // Jupiter Data
      totalSupply: this.formatNumber(jupiterData.totalSupply || 0),
      circSupply: this.formatNumber(jupiterData.circSupply || 0),
      liquidity: this.formatNumber(jupiterData.liquidity || 0),
      holderCount: jupiterData.holderCount || 0,
      launchpad: jupiterData.launchpad || 'Unknown',
      creationTime: jupiterData.firstPool?.createdAt || jupiterData.metadata?.creationTime || 'Unknown',
      auditStatus: jupiterData.audit ? 'Audited' : 'Not Audited',
      auditDetails: JSON.stringify(jupiterData.audit || {}),
      organicScore: jupiterData.organicScore || 0,
      organicLabel: jupiterData.organicScoreLabel || 'Unknown',
      tags: JSON.stringify(jupiterData.tags || [])
    };
  }

  /**
   * Generate fallback analysis when AI is not available
   */
  generateFallbackAnalysis(tokenData) {
    const jupiterData = tokenData.jupiterData || {};
    const priceChange24h = Number(jupiterData.priceChange24h || 0);
    const holderCount = jupiterData.holderCount || 0;
    const volume24h = jupiterData.volume24h || 0;

    // Determine sentiment based on price change
    let sentiment = 'Neutral';
    if (priceChange24h > 10) sentiment = 'Bullish';
    else if (priceChange24h < -10) sentiment = 'Bearish';

    return {
      sentiment: sentiment,
      confidence: 0.6,
      keyInsights: [
        `Price action shows ${priceChange24h > 0 ? 'bullish' : 'bearish'} momentum with ${Math.abs(priceChange24h).toFixed(2)}% change`,
        `Holder count of ${holderCount.toLocaleString()} indicates ${holderCount > 1000 ? 'strong' : 'developing'} community`,
        `Volume of ${this.formatNumber(volume24h)} suggests ${volume24h > 1000000 ? 'high' : 'moderate'} trading activity`
      ],
      holderInsights: {
        distributionHealth: holderCount > 5000 ? 'Well distributed' : holderCount > 1000 ? 'Moderately concentrated' : 'Highly concentrated',
        concentrationRisk: holderCount > 5000 ? 'Low' : holderCount > 1000 ? 'Medium' : 'High',
        holderGrowth: priceChange24h > 5 ? 'Accelerating' : priceChange24h < -5 ? 'Declining' : 'Stable',
        whaleActivity: volume24h > 10000000 ? 'High' : volume24h > 1000000 ? 'Moderate' : 'Low',
        retailAdoption: holderCount > 10000 ? 'Strong' : holderCount > 1000 ? 'Moderate' : 'Weak'
      },
      tradingSignals: {
        buyPressure: priceChange24h > 5 ? 'Strong' : priceChange24h > 0 ? 'Moderate' : 'Weak',
        sellPressure: priceChange24h < -5 ? 'Strong' : priceChange24h < 0 ? 'Moderate' : 'Weak',
        volumeTrend: volume24h > 1000000 ? 'Increasing' : 'Stable',
        momentum: priceChange24h > 10 ? 'Bullish' : priceChange24h < -10 ? 'Bearish' : 'Neutral',
        entrySignal: priceChange24h > 5 && volume24h > 1000000 ? 'Strong' : 'Moderate',
        exitSignal: priceChange24h < -5 ? 'Strong' : 'Weak'
      },
      riskAssessment: {
        level: holderCount < 1000 ? 'High' : holderCount < 5000 ? 'Medium' : 'Low',
        factors: holderCount < 1000 ? ['Low holder count', 'High concentration risk'] : ['Standard market risks'],
        mitigants: holderCount > 5000 ? ['Strong community', 'Good distribution'] : ['Monitor closely'],
        liquidityRisk: volume24h < 100000 ? 'High' : volume24h < 1000000 ? 'Medium' : 'Low',
        volatilityRisk: Math.abs(priceChange24h) > 20 ? 'High' : Math.abs(priceChange24h) > 10 ? 'Medium' : 'Low'
      },
      marketAnalysis: {
        organicGrowth: holderCount > 10000 ? 'Strong' : holderCount > 1000 ? 'Moderate' : 'Weak',
        volumeQuality: volume24h > 10000000 ? 'High' : volume24h > 1000000 ? 'Medium' : 'Low',
        priceAction: priceChange24h > 5 ? 'Bullish' : priceChange24h < -5 ? 'Bearish' : 'Neutral',
        technicalStrength: holderCount > 5000 && volume24h > 1000000 ? 'Strong' : 'Moderate'
      },
      recommendation: {
        action: priceChange24h > 10 && holderCount > 5000 ? 'Call it!' : holderCount > 1000 ? 'Add to Watchlist' : 'Oracle Chart Analysis',
        reasoning: `Based on ${priceChange24h > 0 ? 'bullish' : 'bearish'} price action and ${holderCount > 5000 ? 'strong' : 'developing'} community`,
        timeframe: priceChange24h > 20 ? 'Short-term' : 'Medium-term',
        confidence: holderCount > 5000 ? 'High' : 'Medium'
      },
      catalysts: [
        `Price momentum: ${priceChange24h > 0 ? 'Bullish' : 'Bearish'} trend with ${Math.abs(priceChange24h).toFixed(2)}% change`,
        `Community growth: ${holderCount.toLocaleString()} holders showing ${holderCount > 5000 ? 'strong' : 'developing'} adoption`,
        `Volume activity: ${this.formatNumber(volume24h)} trading volume indicates ${volume24h > 1000000 ? 'high' : 'moderate'} interest`
      ],
      redFlags: [
        holderCount < 1000 ? 'Low holder count suggests high concentration risk' : 'Standard market volatility',
        volume24h < 100000 ? 'Low volume may indicate liquidity concerns' : 'Monitor volume trends',
        Math.abs(priceChange24h) > 50 ? 'Extreme volatility may indicate manipulation' : 'Normal market fluctuations'
      ]
    };
  }

  /**
   * Format number with appropriate suffixes
   */
  formatNumber(num) {
    if (num === null || num === undefined || isNaN(num)) return '0';
    const number = Number(num);
    if (number >= 1e9) return (number / 1e9).toFixed(2) + 'B';
    if (number >= 1e6) return (number / 1e6).toFixed(2) + 'M';
    if (number >= 1e3) return (number / 1e3).toFixed(2) + 'K';
    return number.toFixed(2);
  }

  /**
   * Calculate buy/sell ratio
   */
  calculateBuySellRatio(buyVolume, sellVolume) {
    if (!buyVolume || !sellVolume || sellVolume === 0) return 'N/A';
    const ratio = (buyVolume / sellVolume).toFixed(2);
    return `${ratio}x`;
  }

  /**
   * Assess data freshness
   */
  assessDataFreshness(tokenData) {
    const now = Date.now();
    const lastUpdated = tokenData.lastUpdated || now;
    const age = now - lastUpdated;
    
    if (age < 300000) return 'Very Fresh'; // 5 minutes
    if (age < 1800000) return 'Fresh'; // 30 minutes
    if (age < 3600000) return 'Recent'; // 1 hour
    return 'Stale';
  }

  /**
   * Generate unique analysis ID
   */
  generateAnalysisId() {
    return `analysis_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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
    console.log('🗑️ Technical Analysis AI cache cleared');
  }
}

export default SocialContextAI;
