import OpenAIService from './openaiService.js';
import { PROMPT_TEMPLATES } from './aiPromptTemplates.js';
import { ENHANCED_PROMPT_TEMPLATES, fillEnhancedTemplate, validateEnhancedAIResponse, extractEnhancedConfidence, formatForDisplay } from './aiPromptTemplates_enhanced.js';

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
      console.log('🧠 Social Context AI initialized successfully with OpenAI');
    } catch (error) {
      console.warn('⚠️ OpenAI service not available:', error.message);
      console.log('🧠 Social Context AI will use enhanced fallback analysis only');
      this.isInitialized = true; // Still mark as initialized to allow fallback analysis
      this.openaiService = null; // Clear the service to prevent further attempts
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
      
      // Generate cache key (tier/model-specific to avoid free↔premium collisions)
      const timeBucket = Date.now() - (Date.now() % cacheExpiry);
      const tier = (options?.model && String(options.model).toLowerCase().includes('gpt-4')) ? 'premium' : 'free';
      const id = tokenData.contractAddress || tokenData.symbol || 'unknown';
      const cacheKey = `social_${tier}_${options?.model || 'gpt-3.5-turbo'}_${id}_${timeBucket}`;
      
      // Check cache
      if (useCache && this.analysisCache.has(cacheKey)) {
        console.log(`💾 Using cached social analysis for ${tokenData.symbol}`);
        return this.analysisCache.get(cacheKey);
      }

      // Check if OpenAI service is available
      if (!this.openaiService) {
        console.log(`🧠 OpenAI not available for ${tokenData.symbol}, using enhanced fallback analysis`);
        throw new Error('OpenAI service not available - using enhanced fallback');
      }

      // Use enhanced template but with optimized processing
      const prompt = this.fillTemplate(ENHANCED_PROMPT_TEMPLATES.SOCIAL_CONTEXT_ANALYSIS, templateVars);
      
      // Generate AI analysis
      const rawResponse = await this.openaiService.generateCompletion(prompt, {
        model,
        temperature,
        maxTokens: 1200, // Balanced for quality and speed
        useCache,
        cacheExpiry
      });

      // Validate and parse enhanced response
      if (!validateEnhancedAIResponse(rawResponse, 'SOCIAL_CONTEXT')) {
        throw new Error('Invalid AI response format');
      }

      const analysis = JSON.parse(rawResponse);
      
      // Map new format to expected frontend format
      if (analysis.recommendation && !analysis.summary) {
        analysis.summary = {
          action: analysis.recommendation.action,
          reasoning: analysis.recommendation.reasoning,
          timeframe: analysis.recommendation.timeframe,
          entryStrategy: analysis.recommendation.entryStrategy
        };
      }
      
      // Enforce distinct sections and formatting on AI output
      this._enforceDistinctSections(analysis, tokenData);
      
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
      console.error(`🔍 Error details:`, {
        errorType: error.constructor.name,
        message: error.message,
        hasOpenAIKey: !!process.env.OPENAI_API_KEY,
        modelUsed: model,
        tokenSymbol: tokenData.symbol
      });
      
      // Return enhanced fallback analysis with error context
      const fallbackAnalysis = this.getFallbackAnalysis(tokenData, error.message);
      // Ensure distinct sections on fallback too
      this._enforceDistinctSections(fallbackAnalysis, tokenData);
      
      // Add error metadata for debugging
      fallbackAnalysis.metadata = {
        ...fallbackAnalysis.metadata,
        fallbackReason: error.message,
        errorType: 'ai_analysis_failed',
        hasOpenAIKey: !!process.env.OPENAI_API_KEY,
        modelAttempted: model,
        fallbackTimestamp: new Date().toISOString()
      };
      
      return fallbackAnalysis;
    }
  }

  /**
   * Prepare template variables from token data
   */
  prepareTemplateVariables(tokenData) {
    const twitterData = tokenData.twitterData || {};
    const jupiterData = tokenData.jupiterData || {};
    const callHistory = tokenData.callHistory || {};
    
    // Debug log the complete data structure
    console.log(`🔍 AI Complete Data Debug for ${tokenData.symbol}:`, {
      hasAnalyticsData: !!jupiterData,
      hasTwitterData: !!twitterData,
      jupiterKeys: Object.keys(jupiterData),
      twitterKeys: Object.keys(twitterData),
      tokenKeys: Object.keys(tokenData).filter(k => !['twitterData', 'jupiterData'].includes(k)),
      stats24h: jupiterData.stats24h,
      holderChange: jupiterData.stats24h?.holderChange,
      priceChange: jupiterData.stats24h?.priceChange
    });

    // Debug official handle detection specifically
    const officialHandle = tokenData.socials?.twitter ||
                          jupiterData.twitter ||
                          tokenData.twitterHandle ||
                          twitterData.officialHandle ||
                          jupiterData.socials?.twitter ||
                          jupiterData.socials?.x ||
                          tokenData.officialHandle ||
                          'N/A';
    
    console.log(`🧠 AI Official Handle Debug for ${tokenData.symbol}:`, {
      'tokenData.socials?.twitter': tokenData.socials?.twitter,
      'jupiterData.twitter': jupiterData.twitter,
      'tokenData.twitterHandle': tokenData.twitterHandle,
      'twitterData.officialHandle': twitterData.officialHandle,
      'jupiterData.socials?.twitter': jupiterData.socials?.twitter,
      'jupiterData.socials?.x': jupiterData.socials?.x,
      'tokenData.officialHandle': tokenData.officialHandle,
      'FINAL_officialHandle': officialHandle,
      'isNotNA': officialHandle !== 'N/A'
    });

    // Extract analytics stats with safety checks and ensure all fields exist
    const stats5m = {
      priceChange: 0,
      holderChange: 0,
      liquidityChange: 0,
      volumeChange: 0,
      buyVolume: 0,
      sellVolume: 0,
      numNetBuyers: 0,
      ...(jupiterData.stats5m || {})
    };
    const stats1h = {
      priceChange: 0,
      holderChange: 0,
      liquidityChange: 0,
      volumeChange: 0,
      buyVolume: 0,
      sellVolume: 0,
      numNetBuyers: 0,
      ...(jupiterData.stats1h || {})
    };
    const stats6h = {
      priceChange: 0,
      holderChange: 0,
      liquidityChange: 0,
      volumeChange: 0,
      buyVolume: 0,
      sellVolume: 0,
      numNetBuyers: 0,
      ...(jupiterData.stats6h || {})
    };
    const stats24h = {
      priceChange: 0,
      holderChange: 0,
      liquidityChange: 0,
      volumeChange: 0,
      buyVolume: 0,
      sellVolume: 0,
      numNetBuyers: 0,
      ...(jupiterData.stats24h || {})
    };

    return {
      tokenName: tokenData.name || 'Unknown',
      symbol: tokenData.symbol || 'N/A',
      // Fix: Use correct analytics field names
      marketCap: this.formatNumber(jupiterData.mcap || jupiterData.marketCap || tokenData.marketCap || 0),
      price: jupiterData.usdPrice || jupiterData.price || tokenData.price || 'N/A',
      priceChange24h: Number(jupiterData.priceChange24h || tokenData.priceChange24h || 0).toFixed(2),
      
      // Analytics stats fields with safety checks - format all percentages to 2 decimal places
      'stats5m.priceChange': Number(stats5m.priceChange || 0).toFixed(2),
      'stats1h.priceChange': Number(stats1h.priceChange || 0).toFixed(2),
      'stats6h.priceChange': Number(stats6h.priceChange || 0).toFixed(2),
      'stats24h.priceChange': Number(stats24h.priceChange || 0).toFixed(2),
      'stats5m.holderChange': Number(stats5m.holderChange || 0).toFixed(2),
      'stats1h.holderChange': Number(stats1h.holderChange || 0).toFixed(2),
      'stats6h.holderChange': Number(stats6h.holderChange || 0).toFixed(2),
      'stats24h.holderChange': Number(stats24h.holderChange || 0).toFixed(2),
      'stats5m.liquidityChange': Number(stats5m.liquidityChange || 0).toFixed(2),
      'stats1h.liquidityChange': Number(stats1h.liquidityChange || 0).toFixed(2),
      'stats6h.liquidityChange': Number(stats6h.liquidityChange || 0).toFixed(2),
      'stats24h.liquidityChange': Number(stats24h.liquidityChange || 0).toFixed(2),
      'stats5m.volumeChange': Number(stats5m.volumeChange || 0).toFixed(2),
      'stats1h.volumeChange': Number(stats1h.volumeChange || 0).toFixed(2),
      'stats6h.volumeChange': Number(stats6h.volumeChange || 0).toFixed(2),
      'stats24h.volumeChange': Number(stats24h.volumeChange || 0).toFixed(2),
      'stats24h.buyVolume': Number(stats24h.buyVolume || 0).toFixed(2),
      'stats24h.sellVolume': Number(stats24h.sellVolume || 0).toFixed(2),
      'stats24h.numNetBuyers': stats24h.numNetBuyers || 0,
      'stats6h.numNetBuyers': stats6h.numNetBuyers || 0,
      
      // 🔥 NEW: Analytics engine metrics for enhanced analysis (formatted for display)
      holderChange: this.formatPercentage(jupiterData.stats24h?.holderChange || jupiterData.holderChange || 0),
      volumeChange: this.formatPercentage(jupiterData.stats24h?.volumeChange || jupiterData.volumeChange || 0),
      priceChange: this.formatPercentage(jupiterData.stats24h?.priceChange || jupiterData.priceChange || jupiterData.priceChange24h || 0),
      organicScore: Math.round(jupiterData.organicScore || 0), // No decimals for organic score
      organicScoreLabel: jupiterData.organicScoreLabel || 'Unknown',
      
      // Social metrics with meaningful fallbacks
      followers: this.formatNumber(twitterData.followers || 0),
      mentions24h: twitterData.mentions24h || twitterData.mentions || 0,
      totalMentions: twitterData.mentions || 0,
      engagementRate: this.calculateEngagementRate(twitterData),
      communityScore: tokenData.communityHealthScore || tokenData.communityScore || 5,
      hypeScore: tokenData.hypeScore || 'N/A',
      
      // Fix N/A values with meaningful indicators
      tweetFrequency: twitterData.tweetFrequency || (twitterData.mentions > 0 ? 'Active' : 'Low'),
      followerGrowth: twitterData.followerGrowth || (twitterData.followers > 1000 ? 'Growing' : 'Stable'),
      influencerMentions: twitterData.influencerMentions || (twitterData.mentions > 10 ? 'Some' : 'None'),
      
      // Fix social activity calculations
      tweetsPerDay: twitterData.tweetFrequency || (twitterData.mentions > 0 ? Math.round(twitterData.mentions / 24) : 0),
      engagementRate: this.calculateEngagementRate(twitterData) || '0.00',
      // Fix: Check ALL sources that TokenDetails checks for official handle
      officialHandle: tokenData.socials?.twitter ||
                      jupiterData.twitter ||
                      tokenData.twitterHandle ||
                      twitterData.officialHandle ||
                      jupiterData.socials?.twitter ||
                      jupiterData.socials?.x ||
                      tokenData.officialHandle ||
                      'N/A',
      
      // Call history
      totalCalls: callHistory.totalCalls || 0,
      recentCalls: callHistory.recentCalls || 0,
      successRate: callHistory.successRate || 0,
      avgTimeTo2x: callHistory.avgTimeTo2x || 'N/A',
      
      // Additional data
      liquidity: this.formatNumber(jupiterData.liquidity || 0),
      holderCount: jupiterData.holderCount || 'N/A',
      recentEvents: this.extractRecentEvents(tokenData),
      
      // Analytics Engine Stats (1h, 6h, 24h)
      stats1h: this.formatJupiterStats(jupiterData.stats1h),
      stats6h: this.formatJupiterStats(jupiterData.stats6h), 
      stats24h: this.formatJupiterStats(jupiterData.stats24h),
      
      // Individual stats for template variables (simplified names) - all 2 decimal places
      priceChange24h: Number(stats24h.priceChange || 0).toFixed(2),
      volumeChange24h: Number(stats24h.volumeChange || 0).toFixed(2),
      holderChange24h: Number(stats24h.holderChange || 0).toFixed(2),
      netBuyers24h: stats24h.numNetBuyers || 0,
      buyVolume24h: this.formatNumber(stats24h.buyVolume || 0),
      sellVolume24h: this.formatNumber(stats24h.sellVolume || 0),
      
      // Fix organic score to 2 decimal places
      organicScore: Number((jupiterData.organicScore || 0)).toFixed(2),
      
      // Enhanced scoring data - all 2 decimal places
      overallScore: Number(tokenData.overallScore || tokenData.score || 0).toFixed(2),
      sentimentScore: Number(tokenData.sentimentScore || tokenData.twitterData?.sentimentScore || tokenData.mediasentiment || 5).toFixed(2),

      // Volume and trading data - Fix: Use correct analytics field names
      volume24h: this.formatNumber(
        (jupiterData.stats24h?.buyVolume || 0) + (jupiterData.stats24h?.sellVolume || 0) ||
        jupiterData.volume24h || 
        tokenData.volume24h || 0
      ),
      volumeChange24h: Number(jupiterData.stats24h?.volumeChange || jupiterData.volumeChange24h || 0).toFixed(2),

      // Technical indicators - Fix: Use correct analytics field names  
      priceChange1h: Number(jupiterData.stats1h?.priceChange || jupiterData.priceChange1h || 0).toFixed(2),
      priceChange6h: Number(jupiterData.stats6h?.priceChange || jupiterData.priceChange6h || 0).toFixed(2),
      priceChange7d: Number(jupiterData.stats7d?.priceChange || jupiterData.priceChange7d || 0).toFixed(2),

      // === COMPREHENSIVE ANALYTICS DATA ===
      // Supply & Economics
      totalSupply: this.formatNumber(jupiterData.totalSupply || 0),
      circSupply: this.formatNumber(jupiterData.circSupply || 0),
      fdv: this.formatNumber(jupiterData.fdv || 0),
      
      // Launch & Development Info
      launchpad: jupiterData.launchpad || 'Unknown',
      creationTime: jupiterData.firstPool?.createdAt || jupiterData.metadata?.creationTime || 'Unknown',
      dev: jupiterData.dev || 'Unknown',
      
      // Audit & Security
      auditStatus: jupiterData.audit ? 'Audited' : 'Not Audited',
      auditDetails: JSON.stringify(jupiterData.audit || {}),
      
      // Social Links (All Available)
      socialLinks: JSON.stringify(jupiterData.socials || {}),
      website: jupiterData.socials?.website || 'N/A',
      telegram: jupiterData.socials?.telegram || 'N/A',
      discord: jupiterData.socials?.discord || 'N/A',
      
      // Organic Metrics
      organicScore: jupiterData.organicScore || 0,
      organicLabel: jupiterData.organicScoreLabel || 'Unknown',
      
      // Tags & Categories
      tags: JSON.stringify(jupiterData.tags || []),
      
      // === COMPREHENSIVE TWITTER/SOCIAL DATA ===
      // Engagement Metrics
      totalEngagement: twitterData.engagement?.total || 0,
      avgEngagement: twitterData.engagement?.average || 0,
      engagementTrend: twitterData.engagement?.trend || 'stable',
      
      // Follower Analysis
      followerGrowth: twitterData.followerGrowth || 0,
      followerQuality: twitterData.followerQuality || 'Unknown',
      
      // Content Analysis
      tweetFrequency: twitterData.tweetFrequency || 0,
      contentQuality: twitterData.contentQuality || 'Unknown',
      hashtagUsage: JSON.stringify(twitterData.hashtags || []),
      
      // Sentiment Analysis
      sentimentBreakdown: JSON.stringify(twitterData.sentimentBreakdown || {}),
      mediasentiment: tokenData.mediasentiment || 5,
      
      // Influence Metrics
      influencerMentions: twitterData.influencerMentions || 0,
      retweetRate: twitterData.retweetRate || 0,
      
      // Recent Tweet Content for Social Context Analysis
      recentTweets: this.formatRecentTweets(twitterData.recentMentions || []),
      tweetSentiments: this.analyzeTweetSentiments(twitterData.recentMentions || []),
      topHashtags: this.extractTopHashtags(twitterData.recentMentions || []),
      
      // === COMPREHENSIVE TOKEN METRICS ===
      // Scoring Components
      marketTierScore: tokenData.marketTierScore || 0,
      volumeScore: tokenData.volumeScore || 0,
      socialScore: tokenData.socialScore || 0,
      technicalScore: tokenData.technicalScore || 0,
      
      // Additional Metrics
      isPaid: tokenData.isPaid || false,
      isVerified: tokenData.isVerified || false,
      riskLevel: tokenData.riskLevel || 'Unknown',
      
      // Raw Data for Advanced Analysis
      rawAnalyticsData: JSON.stringify(jupiterData),
      rawTwitterData: JSON.stringify(twitterData),
      rawTokenData: JSON.stringify({
        stage: tokenData.stage,
        source: tokenData.source,
        lastUpdated: tokenData.lastUpdated,
        processingTimestamp: tokenData.processingTimestamp
      })
    };

    // Debug log the final template variables
    console.log(`🔍 AI Template Variables for ${tokenData.symbol}:`, {
      holderChange: templateVars.holderChange,
      priceChange: templateVars.priceChange,
      volumeChange: templateVars.volumeChange,
      organicScore: templateVars.organicScore,
      'stats24h.holderChange': templateVars['stats24h.holderChange'],
      'stats24h.priceChange': templateVars['stats24h.priceChange'],
      'stats24h.liquidityChange': templateVars['stats24h.liquidityChange'],
      'stats24h.numNetBuyers': templateVars['stats24h.numNetBuyers'],
      'stats1h.priceChange': templateVars['stats1h.priceChange'],
      'stats6h.priceChange': templateVars['stats6h.priceChange']
    });

    return templateVars;
  }

  /**
   * Format analytics engine stats for AI analysis
   */
  formatJupiterStats(stats) {
    if (!stats) return 'N/A';
    
    const formatted = [];
    if (stats.priceChange !== undefined) formatted.push(`Price: ${Number(stats.priceChange).toFixed(2)}%`);
    if (stats.volumeChange !== undefined) formatted.push(`Volume: ${Number(stats.volumeChange).toFixed(2)}%`);
    if (stats.liquidityChange !== undefined) formatted.push(`Liquidity: ${Number(stats.liquidityChange).toFixed(2)}%`);
    if (stats.txnChange !== undefined) formatted.push(`Transactions: ${Number(stats.txnChange).toFixed(2)}%`);
    
    return formatted.length > 0 ? formatted.join(', ') : 'N/A';
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
      events.push(`+${Number(tokenData.priceChange24h).toFixed(2)}% price surge in 24h`);
    } else if (tokenData.priceChange24h < -30) {
      events.push(`${Number(tokenData.priceChange24h).toFixed(2)}% price drop in 24h`);
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
   * Get enhanced fallback analysis when AI fails
   */
  getFallbackAnalysis(tokenData, errorMessage) {
    console.log(`🔄 Generating enhanced fallback analysis for ${tokenData.symbol}`);
    
    // Extract comprehensive data for rule-based analysis
    const twitterData = tokenData.twitterData || {};
    const jupiterData = tokenData.jupiterData || {};
    const callHistory = tokenData.callHistory || {};
    
    // Extract analytics stats data with proper fallbacks
    const stats5m = jupiterData.stats5m || {};
    const stats1h = jupiterData.stats1h || {};
    const stats6h = jupiterData.stats6h || {};
    const stats24h = jupiterData.stats24h || {};
    
    const communityScore = tokenData.communityHealthScore || tokenData.communityScore || 5;
    const mentions = twitterData.mentions || 0;
    const likes = twitterData.likes || 0;
    const retweets = twitterData.retweets || 0;
    const replies = twitterData.replies || 0;
    const followers = twitterData.followers || 0;
    
    const marketCap = jupiterData.mcap || jupiterData.marketCap || 0;
    const fdv = jupiterData.fdv || 0;
    const liquidity = jupiterData.liquidity || 0;
    const holderCount = jupiterData.holderCount || 0;
    
    // Calculate engagement metrics
    const totalEngagement = likes + retweets + replies;
    const engagementRate = mentions > 0 ? totalEngagement / mentions : 0;
    
    // Generate Key Insights using new mapping logic
    const keyInsights = this.generateKeyInsights(stats5m, stats1h, stats6h, stats24h, jupiterData, twitterData);
    
    // Generate Risk Assessment using new logic
    const riskAssessment = this.generateRiskAssessment(stats5m, stats1h, stats6h, stats24h, jupiterData, twitterData);
    
    // Generate Catalysts and Red Flags using new logic
    const { catalysts, redFlags } = this.generateCatalystsAndRedFlags(stats5m, stats1h, stats6h, stats24h, jupiterData, twitterData);
    
    // Determine sentiment based on multiple factors
    let sentiment = 'Neutral';
    let confidence = 0.70;
    let recommendation = 'Hold';
    
    // Advanced sentiment calculation using analytics stats
    let bullishSignals = 0;
    let bearishSignals = 0;
    
    // Price momentum signals (24h primary)
    const priceChange24h = stats24h.priceChange || 0;
    const priceChange6h = stats6h.priceChange || 0;
    const priceChange1h = stats1h.priceChange || 0;
    
    if (priceChange24h > 15) bullishSignals += 2;
    else if (priceChange24h > 5) bullishSignals++;
    if (priceChange24h < -15) bearishSignals += 2;
    else if (priceChange24h < -5) bearishSignals++;
    
    // Holder growth signals
    const holderChange24h = stats24h.holderChange || 0;
    const holderChange6h = stats6h.holderChange || 0;
    if (holderChange24h > 10) bullishSignals += 2;
    else if (holderChange24h > 2) bullishSignals++;
    if (holderChange24h < -5) bearishSignals++;
    
    // Net buyers signals
    const netBuyers24h = stats24h.numNetBuyers || 0;
    if (netBuyers24h > 1000) bullishSignals += 2;
    else if (netBuyers24h > 100) bullishSignals++;
    if (netBuyers24h < -100) bearishSignals++;
    
    // Liquidity signals
    const liquidityChange24h = stats24h.liquidityChange || 0;
    if (liquidityChange24h > 20) bullishSignals++;
    if (liquidityChange24h < -20) bearishSignals++;
    if (liquidity < 100000) bearishSignals++;
    
    // Social signals
    if (mentions > 100) bullishSignals++;
    if (mentions > 50) bullishSignals++;
    if (engagementRate > 5) bullishSignals++;
    if (communityScore > 7) bullishSignals++;
    if (mentions < 10) bearishSignals++;
    if (communityScore < 4) bearishSignals++;
    
    // Determine final sentiment
    if (bullishSignals >= 5 && bearishSignals <= 1) {
      sentiment = 'Bullish';
      recommendation = 'Call it';
      confidence = 0.85;
    } else if (bearishSignals >= 4 || (bearishSignals > bullishSignals && bearishSignals >= 3)) {
      sentiment = 'Bearish';
      recommendation = 'Avoid';
      confidence = 0.80;
    } else if (bullishSignals > bearishSignals) {
      sentiment = 'Cautiously Bullish';
      recommendation = 'Add to Watchlist';
      confidence = 0.70;
    }
    
    // Build comprehensive analysis response using new methods
    return {
      // Match the expected AI response format
      socialSummary: `${sentiment} sentiment with ${Math.round(confidence * 100)}% confidence based on our analytics engine. Community health: ${communityScore.toFixed(1)}/10. Social activity: ${mentions} mentions with ${totalEngagement} total engagement.`,
      thesis: `Based on our analytics engine, ${tokenData.symbol} shows ${sentiment.toLowerCase()} indicators with ${bullishSignals} positive signals vs ${bearishSignals} negative signals. ${recommendation} position recommended.`,
      riskFactors: riskAssessment.factors.join('. '),
      catalysts: catalysts.join('. '),
      redFlags: redFlags.join('. '),
      actionableInsights: `${recommendation} - ${sentiment} outlook based on ${bullishSignals} bullish vs ${bearishSignals} bearish signals from our AI analytics. Key metrics: ${communityScore.toFixed(1)}/10 community health, ${mentions} mentions, ${(engagementRate).toFixed(1)}x engagement rate.`,
      confidence,
      
      // Additional structured data for compatibility
      keyInsights,
      socialMomentum: {
        direction: priceChange6h > 5 ? 'Accelerating' : priceChange6h < -5 ? 'Declining' : 'Stable',
        strength: mentions > 100 ? 'Strong' : mentions > 50 ? 'Moderate' : 'Weak',
        sustainability: engagementRate > 5 ? 'High' : engagementRate > 2 ? 'Medium' : 'Low'
      },
      riskAssessment,
      communityAnalysis: {
        organicGrowth: holderCount > 5000 ? 'Strong' : holderCount > 1000 ? 'Moderate' : 'Developing',
        engagementQuality: engagementRate > 5 ? 'High' : engagementRate > 2 ? 'Medium' : 'Low',
        influencerSupport: mentions > 50 ? 'Active' : 'Limited',
        botActivity: engagementRate < 1 ? 'Suspected High' : engagementRate < 2 ? 'Moderate' : 'Low'
      },
      summary: {
        action: recommendation,
        reasoning: 'Based on comprehensive analytics engine analysis and social metrics from our AI tools',
        timeframe: 'Short-term',
        entryStrategy: sentiment === 'Bullish' ? 'DCA on dips and accumulate' : sentiment === 'Bearish' ? 'Avoid until fundamentals improve' : 'Wait for confirmation signals'
      },
      // Align recommended actions with summary
      recommendedActions: (() => {
        if (recommendation === 'Call it') return ['Add to Watchlist', 'Hype over Time', 'Call it'];
        if (recommendation === 'Avoid') return ['Remove from Watchlist', 'Hype over Time'];
        return ['Add to Watchlist', 'Hype over Time'];
      })(),
      
      // Add sentiment field that frontend expects
      sentiment,
      metadata: {
        tokenSymbol: tokenData.symbol,
        analysisTimestamp: new Date().toISOString(),
        model: 'enhanced_jupiter_fallback_v3',
        confidence: confidence,
        dataFreshness: 'current',
        analysisId: `fallback_${tokenData.symbol}_${Date.now()}`,
        fallbackReason: errorMessage || 'Enhanced analytics engine analysis',
        dataQuality: {
          hasTwitterData: !!twitterData && Object.keys(twitterData).length > 0,
          hasAnalyticsData: !!jupiterData && Object.keys(jupiterData).length > 0,
          hasAnalyticsStats: !!(stats24h && Object.keys(stats24h).length > 0),
          hasPriceData: priceChange24h !== 0 || priceChange6h !== 0 || priceChange1h !== 0,
          hasVolumeData: (stats24h.buyVolume || 0) + (stats24h.sellVolume || 0) > 0,
          hasHolderData: holderCount > 0
        }
      }
    };
  }

  /**
   * Format recent tweets for AI analysis
   */
  formatRecentTweets(recentMentions) {
    if (!recentMentions || recentMentions.length === 0) return 'No recent tweets available';
    
    return recentMentions.slice(0, 5).map((tweet, index) => {
      const engagement = (tweet.likes || 0) + (tweet.retweets || 0) + (tweet.replies || 0);
      const timeAgo = this.getTimeAgo(tweet.createdAt);
      return `${index + 1}. "${tweet.text?.substring(0, 100)}..." (${engagement} engagement, ${timeAgo})`;
    }).join('\n');
  }

  /**
   * Generate Key Insights using analytics stats mapping
   */
  generateKeyInsights(stats5m, stats1h, stats6h, stats24h, jupiterData, twitterData) {
    const insights = [];
    
    // 1. Price Action Analysis
    const priceChange5m = stats5m.priceChange || 0;
    const priceChange1h = stats1h.priceChange || 0;
    const priceChange6h = stats6h.priceChange || 0;
    const priceChange24h = stats24h.priceChange || 0;
    
    if (Math.abs(priceChange24h) > 50 || Math.abs(priceChange6h) > 30) {
      if (priceChange24h > 50) {
        insights.push(`🚀 Price is absolutely sending it +${priceChange24h.toFixed(1)}% in 24h — explosive moon mission activated`);
      } else if (priceChange24h < -30) {
        insights.push(`⚠️ Major crash detected ${priceChange24h.toFixed(1)}% in 24h — bags getting absolutely rekt`);
      } else if (priceChange6h > 15) {
        insights.push(`🚀 Price rallying hard +${priceChange6h.toFixed(1)}% in 6h — momentum building fast`);
      } else if (priceChange6h < -15) {
        insights.push(`⚠️ Price correction hitting ${priceChange6h.toFixed(1)}% in 6h — profit-taking or dump incoming`);
      }
    } else if (priceChange24h > 0) {
      insights.push(`Price is up +${priceChange24h.toFixed(1)}% in 24h — steady gains keeping degens interested`);
    } else if (priceChange24h < 0) {
      insights.push(`Price cooling ${priceChange24h.toFixed(1)}% in 24h — consolidation or early exit pressure`);
    }
    
    // 2. Holder Growth Analysis
    const holderChange5m = stats5m.holderChange || 0;
    const holderChange1h = stats1h.holderChange || 0;
    const holderChange6h = stats6h.holderChange || 0;
    const holderChange24h = stats24h.holderChange || 0;
    
    if (holderChange24h > 50) {
      insights.push(`🚨 Viral adoption spike with +${holderChange24h.toFixed(1)}% new holders in 24h — cult momentum building`);
    } else if (holderChange24h > 10) {
      insights.push(`Rapid adoption happening with +${holderChange24h.toFixed(1)}% holder growth — strong retail inflow detected`);
    } else if (holderChange24h > 2) {
      insights.push(`Steady holder growth +${holderChange24h.toFixed(1)}% in 24h — organic accumulation phase`);
    } else if (holderChange24h < -2) {
      insights.push(`Holder bleed detected ${holderChange24h.toFixed(1)}% in 24h — diamond hands getting shaky`);
    } else {
      insights.push(`Flat holder growth — no new traction, existing degens holding bags`);
    }
    
    // 3. Liquidity Movement Analysis
    const liquidityChange5m = stats5m.liquidityChange || 0;
    const liquidityChange1h = stats1h.liquidityChange || 0;
    const liquidityChange6h = stats6h.liquidityChange || 0;
    const liquidityChange24h = stats24h.liquidityChange || 0;
    const liquidity = jupiterData.liquidity || 0;
    
    if (liquidity < 100000) {
      insights.push(`⚠️ Thin liquidity at $${(liquidity/1000).toFixed(0)}K — high rug risk, slippage gonna hurt`);
    } else if (liquidityChange24h > 20) {
      insights.push(`✅ Liquidity strengthening +${liquidityChange24h.toFixed(1)}% in 24h — capital inflows reducing rug risk`);
    } else if (liquidityChange24h < -20) {
      insights.push(`⚠️ Liquidity drying up ${liquidityChange24h.toFixed(1)}% in 24h — whales might be exiting`);
    } else if (liquidity > 1000000) {
      insights.push(`Solid liquidity at $${(liquidity/1e6).toFixed(1)}M — smooth trading for degens`);
    }
    
    // 4. Net Buyers & Demand Analysis
    const netBuyers24h = stats24h.numNetBuyers || 0;
    const netBuyers6h = stats6h.numNetBuyers || 0;
    
    if (netBuyers24h > 1000) {
      insights.push(`Heavy demand with ${netBuyers24h.toLocaleString()} net buyers in 24h — massive accumulation pressure`);
    } else if (netBuyers24h > 100) {
      insights.push(`Strong buying interest with ${netBuyers24h} net buyers — community participation looking based`);
    } else if (netBuyers24h < -100) {
      insights.push(`Net selling pressure with ${Math.abs(netBuyers24h)} more sellers — exit liquidity being provided`);
    }
    
    // Ensure we have at least 3 insights
    if (insights.length < 3) {
      // Add backup insights from social/market data
      const mentions = twitterData.mentions || 0;
      const communityScore = jupiterData.communityHealthScore || 5;
      const mcap = jupiterData.mcap || 0;
      
      if (mentions > 50) {
        insights.push(`CT buzz at ${mentions} mentions — degens are talking, narrative building`);
      }
      if (communityScore > 7) {
        insights.push(`Based community vibes at ${communityScore.toFixed(1)}/10 — diamond hands holding strong`);
      }
      if (mcap > 0 && mcap < 10e6) {
        insights.push(`Early stage gem at $${(mcap/1e6).toFixed(1)}M mcap — room for massive growth`);
      }
      
      // Final fallback
      if (insights.length < 3) {
        insights.push(`Market dynamics showing ${priceChange24h > 0 ? 'bullish' : 'bearish'} undertones — watch for confirmation`);
      }
    }
    
    return insights.slice(0, 3); // Max 3 key insights
  }

  /**
   * Generate Risk Assessment using analytics stats
   */
  generateRiskAssessment(stats5m, stats1h, stats6h, stats24h, jupiterData, twitterData) {
    const factors = [];
    
    // Volume & Trading Activity Analysis
    const buyVolume24h = stats24h.buyVolume || 0;
    const sellVolume24h = stats24h.sellVolume || 0;
    const volumeChange1h = stats1h.volumeChange || 0;
    const volumeChange6h = stats6h.volumeChange || 0;
    const volumeChange24h = stats24h.volumeChange || 0;
    
    // Short-term volatility check
    const priceChange1h = stats1h.priceChange || 0;
    const priceChange5m = stats5m.priceChange || 0;
    
    if (Math.abs(priceChange1h) > 10 || Math.abs(priceChange5m) > 5) {
      factors.push(`Short-term volatility: Price ${priceChange1h > 0 ? 'pumping' : 'dumping'} ${Math.abs(priceChange1h).toFixed(2)}% in 1h, volume ${volumeChange1h > 0 ? 'surging' : 'drying up'} ${volumeChange1h.toFixed(2)}% — possible whale moves or exit liquidity`);
    }
    
    // Buy vs Sell pressure analysis
    if (buyVolume24h > 0 && sellVolume24h > 0) {
      const buyRatio = buyVolume24h / (buyVolume24h + sellVolume24h);
      if (buyRatio > 0.6) {
        factors.push(`Strong buy pressure: $${(buyVolume24h/1e6).toFixed(2)}M buys vs $${(sellVolume24h/1e6).toFixed(2)}M sells (${(buyRatio*100).toFixed(1)}% buy-heavy) — accumulation mode active`);
      } else if (buyRatio < 0.4) {
        factors.push(`Sell-off pressure: $${(sellVolume24h/1e6).toFixed(2)}M sells vs $${(buyVolume24h/1e6).toFixed(2)}M buys (${((1-buyRatio)*100).toFixed(1)}% sell-heavy) — distribution phase or profit-taking`);
      } else {
        factors.push(`Balanced market: $${(buyVolume24h/1e6).toFixed(2)}M buys vs $${(sellVolume24h/1e6).toFixed(2)}M sells — healthy two-way flow`);
      }
    }
    
    // Volume trend analysis
    if (volumeChange24h < -50) {
      factors.push(`Cooling interest: Volume crashed ${volumeChange24h.toFixed(1)}% in 24h — hype fading, degens moving on`);
    } else if (volumeChange1h < -70) {
      factors.push(`Volume cliff: 1h volume down ${volumeChange1h.toFixed(1)}% — possible dump completion or consolidation`);
    }
    
    // Liquidity risks
    const liquidity = jupiterData.liquidity || 0;
    const liquidityChange24h = stats24h.liquidityChange || 0;
    
    if (liquidity < 100000) {
      factors.push(`High rug risk: Thin liquidity at $${(liquidity/1000).toFixed(0)}K — slippage will be brutal, easy to manipulate`);
    }
    
    if (liquidityChange24h < -30) {
      factors.push(`Liquidity exodus: ${liquidityChange24h.toFixed(1)}% liquidity pulled in 24h — LPs getting nervous or rug prep`);
    }
    
    // Holder concentration risk
    const holderChange24h = stats24h.holderChange || 0;
    if (holderChange24h < -10) {
      factors.push(`Holder exodus: ${holderChange24h.toFixed(1)}% holders dumping in 24h — confidence cracking, bags getting heavy`);
    }
    
    // Social sentiment risks
    const mentions = twitterData.mentions || 0;
    if (mentions < 5) {
      factors.push(`Ghost town vibes: Only ${mentions} mentions — no CT buzz, narrative dead in the water`);
    }
    
    // Default if no major risks
    if (factors.length === 0) {
      factors.push(`Standard degen risks apply — watch for sudden moves, always DYOR before aping`);
    }
    
    return {
      level: factors.length >= 3 ? 'High' : factors.length === 2 ? 'Medium' : 'Low',
      factors: factors.slice(0, 4) // Max 4 risk factors
    };
  }

  /**
   * Generate Catalysts and Red Flags using analytics stats
   */
  generateCatalystsAndRedFlags(stats5m, stats1h, stats6h, stats24h, jupiterData, twitterData) {
    const catalysts = [];
    const redFlags = [];
    
    // Catalysts based on analytics stats
    
    // 1. Holder Growth Catalyst
    const holderChange24h = stats24h.holderChange || 0;
    const holderChange6h = stats6h.holderChange || 0;
    
    if (holderChange24h > 20) {
      catalysts.push(`Explosive holder growth: +${holderChange24h.toFixed(1)}% new wallets in 24h — viral traction building, cult momentum incoming`);
    } else if (holderChange6h > 10) {
      catalysts.push(`Rapid adoption: +${holderChange6h.toFixed(1)}% holders in 6h — fresh degens piling in, FOMO starting`);
    }
    
    // 2. Net Buyers Surge Catalyst
    const netBuyers24h = stats24h.numNetBuyers || 0;
    const netBuyers6h = stats6h.numNetBuyers || 0;
    
    if (netBuyers24h > 1000) {
      catalysts.push(`Massive accumulation: ${netBuyers24h.toLocaleString()} net buyers in 24h — whale and retail FOMO converging`);
    } else if (netBuyers6h > 500) {
      catalysts.push(`Buy pressure surge: ${netBuyers6h} net buyers in 6h — momentum building for next leg up`);
    }
    
    // 3. Liquidity Inflows Catalyst
    const liquidityChange24h = stats24h.liquidityChange || 0;
    const liquidity = jupiterData.liquidity || 0;
    
    if (liquidityChange24h > 30 && liquidity > 500000) {
      catalysts.push(`Liquidity expansion: +${liquidityChange24h.toFixed(1)}% in 24h to $${(liquidity/1e6).toFixed(1)}M — confidence building, whale-friendly`);
    }
    
    // 4. Volume on Buy Side Catalyst
    const buyVolume24h = stats24h.buyVolume || 0;
    const sellVolume24h = stats24h.sellVolume || 0;
    
    if (buyVolume24h > sellVolume24h * 1.5 && buyVolume24h > 1e6) {
      catalysts.push(`Buy-side dominance: $${(buyVolume24h/1e6).toFixed(1)}M buys vs $${(sellVolume24h/1e6).toFixed(1)}M sells — sustained accumulation pressure`);
    }
    
    // 5. Macro Valuation Catalyst
    const fdv = jupiterData.fdv || 0;
    const mcap = jupiterData.mcap || 0;
    
    if (mcap > 0 && mcap < 10e6 && holderChange24h > 5) {
      catalysts.push(`Early stage gem: $${(mcap/1e6).toFixed(1)}M mcap with growing adoption — 100x potential still on the table`);
    }
    
    // Social catalysts
    const mentions = twitterData.mentions || 0;
    if (mentions > 100) {
      catalysts.push(`CT buzz building: ${mentions} mentions — narrative gaining traction, influencer attention incoming`);
    }
    
    // Red Flags
    
    // Price action red flags
    const priceChange5m = stats5m.priceChange || 0;
    const priceChange1h = stats1h.priceChange || 0;
    const volumeChange1h = stats1h.volumeChange || 0;
    
    if (priceChange1h < -15 && volumeChange1h < -50) {
      redFlags.push(`Dump in progress: ${priceChange1h.toFixed(2)}% price drop with ${volumeChange1h.toFixed(2)}% volume collapse — possible rug or whale exit`);
    }
    
    // Volume red flags
    const volumeChange24h = stats24h.volumeChange || 0;
    if (volumeChange24h < -70) {
      redFlags.push(`Interest evaporating: Volume crashed ${volumeChange24h.toFixed(2)}% in 24h — hype cycle ending, degens moving on`);
    }
    
    // Sell volume dominance
    if (sellVolume24h > buyVolume24h * 1.5) {
      redFlags.push(`Heavy distribution: $${(sellVolume24h/1e6).toFixed(2)}M sells vs $${(buyVolume24h/1e6).toFixed(2)}M buys — insiders or whales dumping bags`);
    }
    
    // Liquidity red flags
    if (liquidity < 50000) {
      redFlags.push(`Rug risk extreme: Only $${(liquidity/1000).toFixed(2)}K liquidity — one whale move could nuke this to zero`);
    }
    
    // Holder exodus
    if (holderChange24h < -15) {
      redFlags.push(`Mass exodus: ${holderChange24h.toFixed(2)}% holders dumping — confidence shattered, bags getting too heavy`);
    }
    
    // Social red flags
    if (mentions < 3) {
      redFlags.push(`Dead narrative: Only ${mentions} mentions — CT has moved on, no influencer support`);
    }
    
    // Default catalysts if none found
    if (catalysts.length === 0) {
      catalysts.push(`Potential for narrative pickup if fundamentals improve`);
      catalysts.push(`Market positioning allows for quick moves on positive news`);
    }
    
    // Default red flags if none found
    if (redFlags.length === 0) {
      redFlags.push(`Standard market volatility and liquidity risks`);
    }
    
    return {
      catalysts: catalysts.slice(0, 3), // Max 3 catalysts
      redFlags: redFlags.slice(0, 3)   // Max 3 red flags
    };
  }

  // Enforce distinct sections post-processing (OpenAI and fallback)
  _enforceDistinctSections(analysis, tokenData) {
    try {
      if (!analysis) return;
      // Normalize fields
      const insights = Array.isArray(analysis.keyInsights) ? analysis.keyInsights : [];
      const risks = analysis.riskAssessment?.factors || [];
      const cats = Array.isArray(analysis.catalysts) ? analysis.catalysts : (typeof analysis.catalysts === 'string' ? analysis.catalysts.split(/\.\s+/).filter(Boolean) : []);

      // Basic keyword families to avoid overlap (less aggressive filtering)
      const riskKeys = ['liquidity','drawdown','bot'];
      const catKeys = ['listing','kol','partnership'];

      let filteredInsights = insights.filter(i => !riskKeys.some(k => i.toLowerCase().includes(k)) && !catKeys.some(k => i.toLowerCase().includes(k)));
      if (filteredInsights.length === 0 && insights.length > 0) {
        filteredInsights = insights.slice(0, 3);
      }
      if (filteredInsights.length < 3 && insights.length > filteredInsights.length) {
        const seen = new Set(filteredInsights.map(s => s.toLowerCase()));
        for (const s of insights) {
          const low = (s || '').toLowerCase();
          if (!seen.has(low)) {
            filteredInsights.push(s);
            seen.add(low);
          }
          if (filteredInsights.length >= 3) break;
        }
      }

      // Rebuild risks with severity and slang if plain strings
      let rebuiltRisks = risks;
      if (Array.isArray(risks)) {
        rebuiltRisks = risks.map(r => typeof r === 'string' ? r : String(r));
        // Ensure slang sprinkle
        rebuiltRisks = rebuiltRisks.map(r => r.replace(/significant/gi, 'chunky').replace(/decline/gi, 'dump').replace(/low/gi, 'thin/low'));
      }

      // Limit counts for diversity
      analysis.keyInsights = filteredInsights.slice(0, 3);
      if (analysis.riskAssessment && Array.isArray(rebuiltRisks)) {
        analysis.riskAssessment.factors = rebuiltRisks.slice(0, 4);
      }
      if (Array.isArray(cats)) {
        // Less aggressive filtering for catalysts - only filter out obvious risk keywords
        analysis.catalysts = cats.filter(c => !['liquidity', 'drawdown', 'bot'].some(k => c.toLowerCase().includes(k))).slice(0, 3);
      }
    } catch (_) {}
  }

  /**
   * Analyze tweet sentiments
   */
  analyzeTweetSentiments(recentMentions) {
    if (!recentMentions || recentMentions.length === 0) return 'No sentiment data';
    
    let positive = 0, negative = 0, neutral = 0;
    
    recentMentions.forEach(tweet => {
      const text = (tweet.text || '').toLowerCase();
      const positiveWords = ['bullish', 'moon', 'pump', 'buy', 'hodl', 'diamond', 'rocket', '🚀', '💎', '📈'];
      const negativeWords = ['bearish', 'dump', 'sell', 'crash', 'rekt', 'scam', 'rug', '📉', '💀'];
      
      const hasPositive = positiveWords.some(word => text.includes(word));
      const hasNegative = negativeWords.some(word => text.includes(word));
      
      if (hasPositive && !hasNegative) positive++;
      else if (hasNegative && !hasPositive) negative++;
      else neutral++;
    });
    
    const total = positive + negative + neutral;
    if (total === 0) return 'No sentiment data';
    
    return `${Math.round(positive/total*100)}% positive, ${Math.round(negative/total*100)}% negative, ${Math.round(neutral/total*100)}% neutral`;
  }

  /**
   * Extract top hashtags from tweets
   */
  extractTopHashtags(recentMentions) {
    if (!recentMentions || recentMentions.length === 0) return 'No hashtags';
    
    const hashtags = {};
    recentMentions.forEach(tweet => {
      const text = tweet.text || '';
      const matches = text.match(/#\w+/g) || [];
      matches.forEach(tag => {
        hashtags[tag] = (hashtags[tag] || 0) + 1;
      });
    });
    
    const sorted = Object.entries(hashtags)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([tag, count]) => `${tag}(${count})`);
    
    return sorted.length > 0 ? sorted.join(', ') : 'No hashtags';
  }

  /**
   * Get time ago string
   */
  getTimeAgo(timestamp) {
    if (!timestamp) return 'unknown time';
    const now = new Date();
    const time = new Date(timestamp);
    const diffMs = now - time;
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    
    if (diffHours < 1) return 'just now';
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${Math.floor(diffHours / 24)}d ago`;
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
   * Format percentage values for display (handles null/undefined)
   */
  formatPercentage(num) {
    if (num === null || num === undefined || isNaN(num)) return '0.00';
    return Number(num).toFixed(2);
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
