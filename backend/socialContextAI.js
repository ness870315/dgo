import OpenAIService from './openaiService.js';
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
      
      // Generate cache key
      const cacheKey = `social_${tokenData.symbol}_${Date.now() - (Date.now() % cacheExpiry)}`;
      
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

      // Fill template with enhanced Jupiter data and varied crypto slang
      const prompt = fillEnhancedTemplate(ENHANCED_PROMPT_TEMPLATES.SOCIAL_CONTEXT_ANALYSIS, templateVars);
      
      // Generate AI analysis
      const rawResponse = await this.openaiService.generateCompletion(prompt, {
        model,
        temperature,
        maxTokens: 1500,
        useCache,
        cacheExpiry
      });

      // Validate and parse enhanced response
      if (!validateEnhancedAIResponse(rawResponse, 'SOCIAL_CONTEXT')) {
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
      console.error(`🔍 Error details:`, {
        errorType: error.constructor.name,
        message: error.message,
        hasOpenAIKey: !!process.env.OPENAI_API_KEY,
        modelUsed: model,
        tokenSymbol: tokenData.symbol
      });
      
      // Return enhanced fallback analysis with error context
      const fallbackAnalysis = this.getFallbackAnalysis(tokenData, error.message);
      
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
      hasJupiterData: !!jupiterData,
      hasTwitterData: !!twitterData,
      jupiterKeys: Object.keys(jupiterData),
      twitterKeys: Object.keys(twitterData),
      tokenKeys: Object.keys(tokenData).filter(k => !['twitterData', 'jupiterData'].includes(k))
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

    return {
      tokenName: tokenData.name || 'Unknown',
      symbol: tokenData.symbol || 'N/A',
      // Fix: Use correct Jupiter field names
      marketCap: this.formatNumber(jupiterData.mcap || jupiterData.marketCap || tokenData.marketCap || 0),
      price: jupiterData.usdPrice || jupiterData.price || tokenData.price || 'N/A',
      priceChange24h: jupiterData.priceChange24h || tokenData.priceChange24h || 0,
      
      // 🔥 NEW: Jupiter API metrics for enhanced analysis
      holderChange: jupiterData.holderChange || 0,
      volumeChange: jupiterData.volumeChange || 0,
      priceChange: jupiterData.priceChange || jupiterData.priceChange24h || 0,
      organicScore: jupiterData.organicScore || 0,
      organicScoreLabel: jupiterData.organicScoreLabel || 'Unknown',
      
      // Social metrics
      followers: this.formatNumber(twitterData.followers || 0),
      mentions24h: twitterData.mentions24h || twitterData.mentions || 0,
      totalMentions: twitterData.mentions || 0,
      engagementRate: this.calculateEngagementRate(twitterData),
      communityScore: tokenData.communityHealthScore || tokenData.communityScore || 5,
      hypeScore: tokenData.hypeScore || 'N/A',
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
      
      // Jupiter API Stats (1h, 6h, 24h)
      stats1h: this.formatJupiterStats(jupiterData.stats1h),
      stats6h: this.formatJupiterStats(jupiterData.stats6h), 
      stats24h: this.formatJupiterStats(jupiterData.stats24h),
      
      // Enhanced scoring data
      overallScore: tokenData.overallScore || tokenData.score || 0,
      sentimentScore: tokenData.sentimentScore || tokenData.twitterData?.sentimentScore || tokenData.mediasentiment || 5,

      // Volume and trading data - Fix: Use correct Jupiter field names
      volume24h: this.formatNumber(
        (jupiterData.stats24h?.buyVolume || 0) + (jupiterData.stats24h?.sellVolume || 0) ||
        jupiterData.volume24h || 
        tokenData.volume24h || 0
      ),
      volumeChange24h: jupiterData.stats24h?.volumeChange || jupiterData.volumeChange24h || 0,

      // Technical indicators - Fix: Use correct Jupiter field names  
      priceChange1h: jupiterData.stats1h?.priceChange || jupiterData.priceChange1h || 0,
      priceChange6h: jupiterData.stats6h?.priceChange || jupiterData.priceChange6h || 0,
      priceChange7d: jupiterData.stats7d?.priceChange || jupiterData.priceChange7d || 0,

      // === COMPREHENSIVE JUPITER DATA ===
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
      rawJupiterData: JSON.stringify(jupiterData),
      rawTwitterData: JSON.stringify(twitterData),
      rawTokenData: JSON.stringify({
        stage: tokenData.stage,
        source: tokenData.source,
        lastUpdated: tokenData.lastUpdated,
        processingTimestamp: tokenData.processingTimestamp
      })
    };
  }

  /**
   * Format Jupiter API stats for AI analysis
   */
  formatJupiterStats(stats) {
    if (!stats) return 'N/A';
    
    const formatted = [];
    if (stats.priceChange !== undefined) formatted.push(`Price: ${stats.priceChange.toFixed(2)}%`);
    if (stats.volumeChange !== undefined) formatted.push(`Volume: ${stats.volumeChange.toFixed(2)}%`);
    if (stats.liquidityChange !== undefined) formatted.push(`Liquidity: ${stats.liquidityChange.toFixed(2)}%`);
    if (stats.txnChange !== undefined) formatted.push(`Transactions: ${stats.txnChange.toFixed(2)}%`);
    
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
   * Get enhanced fallback analysis when AI fails
   */
  getFallbackAnalysis(tokenData, errorMessage) {
    console.log(`🔄 Generating enhanced fallback analysis for ${tokenData.symbol}`);
    
    // Extract comprehensive data for rule-based analysis
    const twitterData = tokenData.twitterData || {};
    const jupiterData = tokenData.jupiterData || {};
    const callHistory = tokenData.callHistory || {};
    
    const communityScore = tokenData.communityHealthScore || tokenData.communityScore || 5;
    const mentions = twitterData.mentions || 0;
    const likes = twitterData.likes || 0;
    const retweets = twitterData.retweets || 0;
    const replies = twitterData.replies || 0;
    const followers = twitterData.followers || 0;
    
    const priceChange1h = tokenData.priceChange1h || jupiterData.stats1h?.priceChange || 0;
    const priceChange6h = tokenData.priceChange6h || jupiterData.stats6h?.priceChange || 0;
    const priceChange24h = tokenData.priceChange24h || jupiterData.stats24h?.priceChange || 0;
    
    const volume24h = tokenData.volume24h || jupiterData.volume24h || 0;
    const marketCap = tokenData.marketCap || jupiterData.mcap || 0;
    const liquidity = jupiterData.liquidity || 0;
    const holderCount = jupiterData.holderCount || 0;
    
    // Calculate engagement metrics
    const totalEngagement = likes + retweets + replies;
    const engagementRate = mentions > 0 ? totalEngagement / mentions : 0;
    
    // Determine sentiment based on multiple factors
    let sentiment = 'Neutral';
    let confidence = 0.70; // Higher confidence for enhanced fallback (0-1 scale)
    let recommendation = 'Hold';
    
    // Advanced sentiment calculation
    let bullishSignals = 0;
    let bearishSignals = 0;
    
    // Price momentum signals
    if (priceChange1h > 5) bullishSignals++;
    if (priceChange6h > 10) bullishSignals++;
    if (priceChange24h > 15) bullishSignals++;
    if (priceChange1h < -5) bearishSignals++;
    if (priceChange6h < -10) bearishSignals++;
    if (priceChange24h < -15) bearishSignals++;
    
    // Social signals
    if (mentions > 50) bullishSignals++;
    if (mentions > 100) bullishSignals++;
    if (engagementRate > 5) bullishSignals++;
    if (communityScore > 7) bullishSignals++;
    if (mentions < 10) bearishSignals++;
    if (communityScore < 4) bearishSignals++;
    
    // Market signals
    if (volume24h > 1000000) bullishSignals++;
    if (holderCount > 5000) bullishSignals++;
    if (liquidity > 500000) bullishSignals++;
    
    // Determine final sentiment
    if (bullishSignals >= 4 && bearishSignals <= 1) {
      sentiment = 'Bullish';
      recommendation = 'Buy';
      confidence = 0.80;
    } else if (bearishSignals >= 3 || (bearishSignals > bullishSignals && bearishSignals >= 2)) {
      sentiment = 'Bearish';
      recommendation = 'Avoid';
      confidence = 0.75;
    } else if (bullishSignals > bearishSignals) {
      sentiment = 'Cautiously Bullish';
      recommendation = 'Consider';
      confidence = 0.65;
    }
    
    // Generate comprehensive insights
    const keyInsights = [
      `Community health: ${communityScore.toFixed(1)}/10 ${communityScore > 7 ? '🟢' : communityScore > 5 ? '🟡' : '🔴'}`,
      `Social activity: ${mentions} mentions, ${totalEngagement} total engagement`,
      `Price momentum: 1h: ${priceChange1h.toFixed(1)}%, 6h: ${priceChange6h.toFixed(1)}%, 24h: ${priceChange24h.toFixed(1)}%`,
      `Market metrics: $${(marketCap / 1000000).toFixed(1)}M mcap, $${(volume24h / 1000).toFixed(0)}K volume`,
      holderCount > 0 ? `Holder base: ${holderCount.toLocaleString()} holders` : 'Holder data unavailable'
    ].filter(insight => !insight.includes('unavailable'));
    
    // Enhanced catalysts and red flags
    const catalysts = [];
    const redFlags = [];
    
    // Catalysts
    if (priceChange6h > 15) catalysts.push('Strong 6-hour price momentum (+' + priceChange6h.toFixed(1) + '%)');
    if (mentions > 100) catalysts.push('High social media buzz (' + mentions + ' mentions)');
    if (engagementRate > 10) catalysts.push('Exceptional engagement rate (' + engagementRate.toFixed(1) + 'x)');
    if (communityScore > 8) catalysts.push('Excellent community health score (' + communityScore.toFixed(1) + '/10)');
    if (volume24h > 5000000) catalysts.push('High trading volume ($' + (volume24h / 1000000).toFixed(1) + 'M)');
    if (holderCount > 10000) catalysts.push('Large holder base (' + holderCount.toLocaleString() + ' holders)');
    if (liquidity > 1000000) catalysts.push('Strong liquidity ($' + (liquidity / 1000000).toFixed(1) + 'M)');
    
    // Red flags
    if (priceChange24h < -20) redFlags.push('Significant 24h price decline (' + priceChange24h.toFixed(1) + '%)');
    if (mentions < 5) redFlags.push('Very low social media presence (' + mentions + ' mentions)');
    if (communityScore < 3) redFlags.push('Poor community health score (' + communityScore.toFixed(1) + '/10)');
    if (volume24h < 50000) redFlags.push('Low trading volume ($' + (volume24h / 1000).toFixed(0) + 'K)');
    if (holderCount > 0 && holderCount < 500) redFlags.push('Small holder base (' + holderCount + ' holders)');
    if (liquidity > 0 && liquidity < 100000) redFlags.push('Low liquidity ($' + (liquidity / 1000).toFixed(0) + 'K)');
    
    // Default messages if no specific catalysts/red flags
    if (catalysts.length === 0) {
      catalysts.push('Stable market position with moderate fundamentals');
      catalysts.push('Community engagement within normal ranges');
    }
    
    if (redFlags.length === 0) {
      redFlags.push('No major red flags detected in current data');
    }
    
    // Debug: Log fallback analysis values
    console.log(`🔍 Fallback Analysis Debug for ${tokenData.symbol}:`, {
      sentiment,
      confidence,
      confidencePercent: Math.round(confidence * 100),
      bullishSignals,
      bearishSignals,
      recommendation,
      keyInsightsCount: keyInsights.length,
      catalystsCount: catalysts.length,
      redFlagsCount: redFlags.length
    });

    return {
      // Match the expected AI response format
      socialSummary: `${sentiment} sentiment with ${Math.round(confidence * 100)}% confidence. Community health: ${communityScore.toFixed(1)}/10. Social activity: ${mentions} mentions with ${totalEngagement} total engagement.`,
      thesis: `Based on current metrics, ${tokenData.symbol} shows ${sentiment.toLowerCase()} indicators with ${bullishSignals} positive signals vs ${bearishSignals} negative signals. ${recommendation} position recommended.`,
      riskFactors: bearishSignals >= 2 ? [
        'Multiple negative indicators detected',
        priceChange24h < -15 ? `Significant price decline (${priceChange24h.toFixed(1)}%)` : null,
        mentions < 10 ? `Low social engagement (${mentions} mentions)` : null,
        communityScore < 4 ? `Poor community metrics (${communityScore.toFixed(1)}/10)` : null
      ].filter(Boolean).join('. ') : 'Standard market risks apply. Monitor for trend changes.',
      catalysts: catalysts.join('. '),
      redFlags: redFlags.join('. '),
      actionableInsights: `${recommendation} - ${sentiment} outlook based on ${bullishSignals} bullish vs ${bearishSignals} bearish signals. Key metrics: ${communityScore.toFixed(1)}/10 community health, ${mentions} mentions, ${(engagementRate).toFixed(1)}x engagement rate.`,
      confidence,
      
      // Additional structured data for compatibility
      keyInsights,
      socialMomentum: {
        direction: priceChange6h > 5 ? 'Accelerating' : priceChange6h < -5 ? 'Declining' : 'Stable',
        strength: mentions > 100 ? 'Strong' : mentions > 50 ? 'Moderate' : 'Weak',
        sustainability: engagementRate > 5 ? 'High' : engagementRate > 2 ? 'Medium' : 'Low'
      },
      riskAssessment: {
        level: bearishSignals >= 3 ? 'High' : bearishSignals >= 2 ? 'Medium' : 'Low',
        factors: bearishSignals >= 2 ? [
          'Multiple negative indicators detected',
          priceChange24h < -15 ? 'Significant price decline' : null,
          mentions < 10 ? 'Low social engagement' : null,
          communityScore < 4 ? 'Poor community metrics' : null
        ].filter(Boolean) : ['Standard market risks apply'],
        mitigants: bullishSignals >= 2 ? [
          'Positive momentum indicators present',
          communityScore > 6 ? 'Strong community foundation' : null,
          volume24h > 1000000 ? 'Healthy trading volume' : null
        ].filter(Boolean) : ['Monitor for trend changes']
      },
      communityAnalysis: {
        organicGrowth: holderCount > 5000 ? 'Strong' : holderCount > 1000 ? 'Moderate' : 'Developing',
        engagementQuality: engagementRate > 5 ? 'High' : engagementRate > 2 ? 'Medium' : 'Low',
        influencerSupport: mentions > 50 ? 'Active' : 'Limited',
        botActivity: engagementRate < 1 ? 'Suspected High' : engagementRate < 2 ? 'Moderate' : 'Low'
      },
      recommendation: {
        action: recommendation,
        reasoning: 'Based on comprehensive rule-based analysis using Jupiter and social metrics',
        timeframe: 'Short-term',
        entryStrategy: sentiment === 'Bullish' ? 'Consider entry on dips' : sentiment === 'Bearish' ? 'Avoid or wait for reversal' : 'Monitor for clear signals'
      },
      
      // Add sentiment field that frontend expects
      sentiment,
      metadata: {
        tokenSymbol: tokenData.symbol,
        analysisTimestamp: new Date().toISOString(),
        model: 'enhanced_fallback_v2',
        confidence: confidence,
        dataFreshness: 'current',
        analysisId: `fallback_${tokenData.symbol}_${Date.now()}`,
        fallbackReason: errorMessage || 'Enhanced rule-based analysis',
        dataQuality: {
          hasTwitterData: !!twitterData && Object.keys(twitterData).length > 0,
          hasJupiterData: !!jupiterData && Object.keys(jupiterData).length > 0,
          hasPriceData: priceChange24h !== 0 || priceChange6h !== 0 || priceChange1h !== 0,
          hasVolumeData: volume24h > 0,
          hasHolderData: holderCount > 0
        }
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
