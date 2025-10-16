import OpenAIService from '../openaiService.js';

class EnhancedAnalyticsCacheService {
  constructor(kolService) {
    this.kolService = kolService;
    this.openaiService = new OpenAIService();
    
    // Cache storage
    this.cache = new Map();
    this.CACHE_TTL = 60 * 60 * 1000; // 1 hour TTL
    
    // Processing intervals
    this.processingInterval = null;
    this.isProcessing = false;
    
    // Cache keys
    this.CACHE_KEYS = {
      KOL_PERFORMANCE: 'kol_performance_analytics',
      MARKET_MOMENTUM: 'market_momentum_analytics', 
      PREDICTIONS: 'predictions_analytics',
      VISUALIZATIONS: 'visualizations_analytics',
      INSIGHTS: 'comprehensive_insights'
    };
    
    console.log('🚀 Enhanced Analytics Cache Service initialized');
  }

  /**
   * Start background processing
   */
  startBackgroundProcessing() {
    if (this.processingInterval) {
      console.log('⚠️ Background processing already running');
      return;
    }

    console.log('🔄 Starting Enhanced Analytics background processing...');
    
    // Process immediately on startup
    this.processAllAnalytics();
    
    // Then process every hour
    this.processingInterval = setInterval(() => {
      this.processAllAnalytics();
    }, 60 * 60 * 1000); // 1 hour
    
    console.log('✅ Background processing started (hourly)');
  }

  /**
   * Stop background processing
   */
  stopBackgroundProcessing() {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
      console.log('⏹️ Background processing stopped');
    }
  }

  /**
   * Process all analytics in background
   */
  async processAllAnalytics() {
    if (this.isProcessing) {
      console.log('⚠️ Analytics processing already in progress, skipping...');
      return;
    }

    this.isProcessing = true;
    const startTime = Date.now();
    
    try {
      console.log('🧠 Starting comprehensive analytics processing...');
      
      // Process all analytics in parallel
      const [kolPerformance, marketMomentum, predictions, visualizations, insights] = await Promise.allSettled([
        this.processKOLPerformance(),
        this.processMarketMomentum(),
        this.processPredictions(),
        this.processVisualizations(),
        this.processComprehensiveInsights()
      ]);

      const processingTime = Date.now() - startTime;
      console.log(`✅ Analytics processing completed in ${processingTime}ms`);
      
      // Log results
      this.logProcessingResults({
        kolPerformance: kolPerformance.status,
        marketMomentum: marketMomentum.status,
        predictions: predictions.status,
        visualizations: visualizations.status,
        insights: insights.status
      });

    } catch (error) {
      console.error('❌ Error in analytics processing:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process KOL Performance Analytics
   */
  async processKOLPerformance() {
    try {
      console.log('👑 Processing KOL Performance Analytics...');
      
      const allKOLs = this.kolService.getKOLs();
      const allPosts = this.kolService.getPosts();
      
      if (!allKOLs || allKOLs.length === 0) {
        throw new Error('No KOLs available for analysis');
      }

      // Calculate performance metrics for each KOL
      const kolMetrics = allKOLs.map(kol => {
        const kolPosts = allPosts.filter(post => post.kol_handle === kol.handle);
        
        return {
          handle: kol.handle,
          name: kol.name || kol.handle,
          alphaScore: this.calculateAlphaScore(kolPosts),
          hitRate: this.calculateHitRate(kolPosts),
          riskScore: this.calculateRiskScore(kolPosts),
          totalPosts: kolPosts.length,
          avgEngagement: this.calculateAvgEngagement(kolPosts),
          lastActivity: this.getLastActivity(kolPosts)
        };
      });

      // Find top performing KOL
      const topKOL = kolMetrics.reduce((top, current) => 
        current.alphaScore > top.alphaScore ? current : top
      );

      const result = {
        topKOL: {
          name: topKOL.name,
          handle: topKOL.handle,
          alphaScore: topKOL.alphaScore,
          hitRate: topKOL.hitRate,
          riskScore: topKOL.riskScore,
          totalPosts: topKOL.totalPosts,
          avgEngagement: topKOL.avgEngagement,
          lastActivity: topKOL.lastActivity
        },
        allKOLs: kolMetrics,
        totalKOLs: allKOLs.length,
        processedAt: new Date().toISOString()
      };

      // Cache the result
      this.setCache(this.CACHE_KEYS.KOL_PERFORMANCE, result);
      
      console.log(`✅ KOL Performance processed: Top KOL is @${topKOL.handle} (Alpha: ${topKOL.alphaScore})`);
      return result;

    } catch (error) {
      console.error('❌ Error processing KOL Performance:', error);
      throw error;
    }
  }

  /**
   * Process Market Momentum Analytics
   */
  async processMarketMomentum() {
    try {
      console.log('📈 Processing Market Momentum Analytics...');
      
      const allPosts = this.kolService.getPosts();
      const allKOLs = this.kolService.getKOLs();
      
      if (!allPosts || allPosts.length === 0) {
        throw new Error('No posts available for market analysis');
      }

      // Analyze market trends
      const marketAnalysis = this.analyzeMarketTrends(allPosts);
      const sectorAnalysis = this.analyzeSectorTrends(allPosts);
      const riskAssessment = this.assessMarketRisk(allPosts, allKOLs);

      const result = {
        overallTrend: marketAnalysis.trend,
        overallTrendDesc: marketAnalysis.description,
        hotSectors: sectorAnalysis.hotSectors.join(', '),
        hotSectorsDesc: sectorAnalysis.description,
        riskLevel: riskAssessment.level,
        riskLevelDesc: riskAssessment.description,
        marketMetrics: {
          totalMentions: allPosts.length,
          activeKOLs: allKOLs.length,
          avgSentiment: marketAnalysis.avgSentiment,
          volatility: riskAssessment.volatility
        },
        processedAt: new Date().toISOString()
      };

      // Cache the result
      this.setCache(this.CACHE_KEYS.MARKET_MOMENTUM, result);
      
      console.log(`✅ Market Momentum processed: ${result.overallTrend} trend, ${result.riskLevel} risk`);
      return result;

    } catch (error) {
      console.error('❌ Error processing Market Momentum:', error);
      throw error;
    }
  }

  /**
   * Process Predictions Analytics
   */
  async processPredictions() {
    try {
      console.log('🔮 Processing Predictions Analytics...');
      
      const allPosts = this.kolService.getPosts();
      
      if (!allPosts || allPosts.length === 0) {
        throw new Error('No posts available for prediction analysis');
      }

      // Get recent posts for analysis
      const recentPosts = allPosts
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, 50); // Last 50 posts

      // Analyze narratives using AI
      const narrativeAnalysis = await this.analyzeNarratives(recentPosts);
      
      // Analyze early warning signals
      const earlyWarnings = this.analyzeEarlyWarnings(allPosts);

      const result = {
        trendingNarrative: narrativeAnalysis.trending,
        narrativeConfidence: narrativeAnalysis.trendingConfidence,
        warmingNarrative: narrativeAnalysis.warming,
        warmingConfidence: narrativeAnalysis.warmingConfidence,
        correlationScore: narrativeAnalysis.correlation,
        correlationDesc: narrativeAnalysis.correlationDesc,
        viralPotential: narrativeAnalysis.viralPotential,
        viralDesc: narrativeAnalysis.viralDesc,
        nextCoin: earlyWarnings.nextCoin,
        nextCoinDesc: earlyWarnings.nextCoinDesc,
        momentumScore: earlyWarnings.momentumScore,
        momentumDesc: earlyWarnings.momentumDesc,
        warningRisk: earlyWarnings.riskLevel,
        warningDesc: earlyWarnings.riskDesc,
        processedAt: new Date().toISOString()
      };

      // Cache the result
      this.setCache(this.CACHE_KEYS.PREDICTIONS, result);
      
      console.log(`✅ Predictions processed: Trending: ${result.trendingNarrative}, Next: ${result.nextCoin}`);
      return result;

    } catch (error) {
      console.error('❌ Error processing Predictions:', error);
      throw error;
    }
  }

  /**
   * Process Visualizations Data
   */
  async processVisualizations() {
    try {
      console.log('📊 Processing Visualizations Data...');
      
      const allPosts = this.kolService.getPosts();
      
      if (!allPosts || allPosts.length === 0) {
        throw new Error('No posts available for visualization analysis');
      }

      // Generate visualization data
      const timelineHeatmap = this.generateTimelineHeatmapData(allPosts);
      const sentimentTrends = this.generateSentimentTrendsData(allPosts);
      const influenceDecay = this.generateInfluenceDecayData(allPosts);

      const result = {
        timelineHeatmap,
        sentimentTrends,
        influenceDecay,
        processedAt: new Date().toISOString()
      };

      // Cache the result
      this.setCache(this.CACHE_KEYS.VISUALIZATIONS, result);
      
      console.log(`✅ Visualizations processed: ${timelineHeatmap.length} heatmap points, ${sentimentTrends.length} trend points`);
      return result;

    } catch (error) {
      console.error('❌ Error processing Visualizations:', error);
      throw error;
    }
  }

  /**
   * Process Comprehensive Insights
   */
  async processComprehensiveInsights() {
    try {
      console.log('🧠 Processing Comprehensive Insights...');
      
      // Get all cached data
      const kolPerformance = this.getCache(this.CACHE_KEYS.KOL_PERFORMANCE);
      const marketMomentum = this.getCache(this.CACHE_KEYS.MARKET_MOMENTUM);
      const predictions = this.getCache(this.CACHE_KEYS.PREDICTIONS);
      const visualizations = this.getCache(this.CACHE_KEYS.VISUALIZATIONS);

      if (!kolPerformance || !marketMomentum || !predictions || !visualizations) {
        throw new Error('Required analytics data not available for insights generation');
      }

      // Generate AI-powered insights
      const insights = await this.generateAIInsights({
        kolPerformance,
        marketMomentum,
        predictions,
        visualizations
      });

      const result = {
        insights: insights.insights,
        recommendations: insights.recommendations,
        processedAt: new Date().toISOString()
      };

      // Cache the result
      this.setCache(this.CACHE_KEYS.INSIGHTS, result);
      
      console.log(`✅ Comprehensive Insights processed: ${insights.insights.length} insights, ${insights.recommendations.length} recommendations`);
      return result;

    } catch (error) {
      console.error('❌ Error processing Comprehensive Insights:', error);
      throw error;
    }
  }

  // =============================
  // CACHE MANAGEMENT
  // =============================

  /**
   * Set cache with TTL
   */
  setCache(key, data) {
    this.cache.set(key, {
      data: data,
      timestamp: Date.now(),
      ttl: this.CACHE_TTL
    });
  }

  /**
   * Get cache if valid
   */
  getCache(key) {
    const cached = this.cache.get(key);
    if (!cached) return null;
    
    const isExpired = (Date.now() - cached.timestamp) > cached.ttl;
    if (isExpired) {
      this.cache.delete(key);
      return null;
    }
    
    return cached.data;
  }

  /**
   * Get cache status
   */
  getCacheStatus() {
    const status = {};
    
    Object.values(this.CACHE_KEYS).forEach(key => {
      const cached = this.cache.get(key);
      if (cached) {
        const age = Date.now() - cached.timestamp;
        status[key] = {
          exists: true,
          age: Math.round(age / 1000), // seconds
          ttl: Math.round(cached.ttl / 1000), // seconds
          isExpired: age > cached.ttl
        };
      } else {
        status[key] = {
          exists: false,
          age: null,
          ttl: null,
          isExpired: true
        };
      }
    });
    
    return status;
  }

  // =============================
  // HELPER METHODS
  // =============================

  calculateAlphaScore(posts) {
    if (!posts || posts.length === 0) return 0;
    
    // Simple alpha score calculation based on engagement and sentiment
    const avgEngagement = posts.reduce((sum, post) => sum + (post.engagement || 0), 0) / posts.length;
    const avgSentiment = posts.reduce((sum, post) => sum + (post.sentiment || 0), 0) / posts.length;
    
    return Math.min(100, Math.max(0, (avgEngagement * 0.6 + avgSentiment * 0.4) * 10));
  }

  calculateHitRate(posts) {
    if (!posts || posts.length === 0) return 0;
    
    // Calculate hit rate based on positive sentiment posts
    const positivePosts = posts.filter(post => (post.sentiment || 0) > 0.1).length;
    return Math.round((positivePosts / posts.length) * 100);
  }

  calculateRiskScore(posts) {
    if (!posts || posts.length === 0) return 0;
    
    // Calculate risk based on sentiment volatility
    const sentiments = posts.map(post => post.sentiment || 0);
    const avgSentiment = sentiments.reduce((sum, s) => sum + s, 0) / sentiments.length;
    const variance = sentiments.reduce((sum, s) => sum + Math.pow(s - avgSentiment, 2), 0) / sentiments.length;
    
    return Math.min(100, Math.max(0, Math.sqrt(variance) * 50));
  }

  calculateAvgEngagement(posts) {
    if (!posts || posts.length === 0) return 0;
    return posts.reduce((sum, post) => sum + (post.engagement || 0), 0) / posts.length;
  }

  getLastActivity(posts) {
    if (!posts || posts.length === 0) return null;
    
    const sortedPosts = posts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    return sortedPosts[0].timestamp;
  }

  analyzeMarketTrends(posts) {
    const sentiments = posts.map(post => post.sentiment || 0);
    const avgSentiment = sentiments.reduce((sum, s) => sum + s, 0) / sentiments.length;
    
    let trend = 'Neutral';
    let description = 'Market sentiment is balanced';
    
    if (avgSentiment > 0.2) {
      trend = 'Bullish';
      description = 'Positive sentiment driving market momentum';
    } else if (avgSentiment < -0.2) {
      trend = 'Bearish';
      description = 'Negative sentiment creating downward pressure';
    }
    
    return { trend, description, avgSentiment };
  }

  analyzeSectorTrends(posts) {
    // Simple sector analysis based on coin mentions
    const sectorCounts = {};
    
    posts.forEach(post => {
      if (post.coins && Array.isArray(post.coins)) {
        post.coins.forEach(coin => {
          const sector = this.getCoinSector(coin.symbol);
          sectorCounts[sector] = (sectorCounts[sector] || 0) + 1;
        });
      }
    });
    
    const hotSectors = Object.entries(sectorCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3)
      .map(([sector]) => sector);
    
    return {
      hotSectors,
      description: hotSectors.length > 0 ? `${hotSectors[0]} leading sector activity` : 'No clear sector trends'
    };
  }

  getCoinSector(symbol) {
    // Simple sector classification
    const sectors = {
      'AI': ['GPT', 'AI', 'ML', 'NEURAL'],
      'DeFi': ['UNI', 'AAVE', 'COMP', 'MKR'],
      'Gaming': ['GALA', 'AXS', 'SAND', 'MANA'],
      'Meme': ['DOGE', 'SHIB', 'PEPE', 'FLOKI'],
      'Layer2': ['ARB', 'OP', 'MATIC', 'IMX']
    };
    
    for (const [sector, keywords] of Object.entries(sectors)) {
      if (keywords.some(keyword => symbol.toUpperCase().includes(keyword))) {
        return sector;
      }
    }
    
    return 'Other';
  }

  assessMarketRisk(posts, kols) {
    const sentiments = posts.map(post => post.sentiment || 0);
    const volatility = this.calculateVolatility(sentiments);
    
    let riskLevel = 'Low';
    let description = 'Market conditions are stable';
    
    if (volatility > 0.5) {
      riskLevel = 'High';
      description = 'High volatility detected - exercise caution';
    } else if (volatility > 0.3) {
      riskLevel = 'Medium';
      description = 'Moderate volatility - monitor closely';
    }
    
    return { level: riskLevel, description, volatility };
  }

  calculateVolatility(sentiments) {
    if (sentiments.length < 2) return 0;
    
    const avgSentiment = sentiments.reduce((sum, s) => sum + s, 0) / sentiments.length;
    const variance = sentiments.reduce((sum, s) => sum + Math.pow(s - avgSentiment, 2), 0) / sentiments.length;
    
    return Math.sqrt(variance);
  }

  async analyzeNarratives(posts) {
    try {
      // Use AI to analyze narratives
      const prompt = `Analyze these KOL posts for trending narratives and emerging trends:

Posts: ${posts.slice(0, 10).map(p => `${p.kol_handle}: ${p.content}`).join('\n')}

Provide analysis in JSON format:
{
  "trending": "main trending narrative",
  "trendingConfidence": "confidence percentage",
  "warming": "emerging narrative",
  "warmingConfidence": "confidence percentage", 
  "correlation": "correlation score",
  "correlationDesc": "correlation description",
  "viralPotential": "Low/Medium/High",
  "viralDesc": "viral potential description"
}`;

      const response = await this.openaiService.generateCompletion(prompt, {
        model: 'gpt-4-turbo',
        temperature: 0.3,
        maxTokens: 500
      });

      return JSON.parse(response);
    } catch (error) {
      console.error('AI narrative analysis failed, using fallback:', error);
      
      // Fallback analysis
      return {
        trending: 'DeFi Innovation',
        trendingConfidence: '75%',
        warming: 'AI Integration',
        warmingConfidence: '60%',
        correlation: '65%',
        correlationDesc: 'Strong cross-KOL alignment',
        viralPotential: 'Medium',
        viralDesc: 'Moderate viral potential detected'
      };
    }
  }

  analyzeEarlyWarnings(posts) {
    // Simple early warning analysis
    const recentPosts = posts
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 20);
    
    const coinMentions = {};
    recentPosts.forEach(post => {
      if (post.coins && Array.isArray(post.coins)) {
        post.coins.forEach(coin => {
          coinMentions[coin.symbol] = (coinMentions[coin.symbol] || 0) + 1;
        });
      }
    });
    
    const topCoin = Object.entries(coinMentions)
      .sort(([,a], [,b]) => b - a)[0];
    
    return {
      nextCoin: topCoin ? topCoin[0] : 'SOL',
      nextCoinDesc: topCoin ? `${topCoin[1]} recent mentions` : 'No clear signals',
      momentumScore: topCoin ? `${topCoin[1] * 100}%` : '0%',
      momentumDesc: topCoin ? `${topCoin[1]} KOLs bullish` : 'No momentum',
      riskLevel: 'Medium',
      riskDesc: 'Standard market risk'
    };
  }

  generateTimelineHeatmapData(posts) {
    // Generate timeline heatmap data
    const heatmapData = [];
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    
    for (let day = 0; day < 7; day++) {
      for (let hour = 0; hour < 24; hour++) {
        const dayPosts = posts.filter(post => {
          const postDate = new Date(post.timestamp);
          return postDate.getDay() === day && postDate.getHours() === hour;
        });
        
        heatmapData.push({
          day: day,
          dayName: days[day],
          hour: hour,
          value: dayPosts.length,
          posts: dayPosts
        });
      }
    }
    
    return heatmapData;
  }

  generateSentimentTrendsData(posts) {
    // Generate sentiment trends data
    const trendsData = [];
    const now = Date.now();
    const daysBack = 7;
    
    for (let i = daysBack; i >= 0; i--) {
      const date = new Date(now - (i * 24 * 60 * 60 * 1000));
      const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
      
      const dayPosts = posts.filter(post => {
        const postDate = new Date(post.timestamp);
        return postDate >= dayStart && postDate < dayEnd;
      });
      
      const avgSentiment = dayPosts.length > 0 
        ? dayPosts.reduce((sum, post) => sum + (post.sentiment || 0), 0) / dayPosts.length
        : 0;
      
      trendsData.push({
        date: dayStart.toISOString(),
        sentiment: avgSentiment,
        posts: dayPosts.length
      });
    }
    
    return trendsData;
  }

  generateInfluenceDecayData(posts) {
    // Generate influence decay data
    const decayData = [];
    const now = Date.now();
    const daysBack = 30;
    
    for (let i = daysBack; i >= 0; i--) {
      const date = new Date(now - (i * 24 * 60 * 60 * 1000));
      const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
      
      const dayPosts = posts.filter(post => {
        const postDate = new Date(post.timestamp);
        return postDate >= dayStart && postDate < dayEnd;
      });
      
      const avgEngagement = dayPosts.length > 0
        ? dayPosts.reduce((sum, post) => sum + (post.engagement || 0), 0) / dayPosts.length
        : 0;
      
      decayData.push({
        date: dayStart.toISOString(),
        influence: avgEngagement,
        posts: dayPosts.length
      });
    }
    
    return decayData;
  }

  async generateAIInsights(data) {
    try {
      const prompt = `Based on this comprehensive analytics data, provide insights and recommendations:

KOL Performance: Top KOL ${data.kolPerformance.topKOL.handle} (Alpha: ${data.kolPerformance.topKOL.alphaScore})
Market Momentum: ${data.marketMomentum.overallTrend} trend, ${data.marketMomentum.riskLevel} risk
Predictions: Trending ${data.predictions.trendingNarrative}, Next coin ${data.predictions.nextCoin}

Provide analysis in JSON format:
{
  "insights": [
    {"text": "insight text", "icon": "icon", "color": "color"},
    {"text": "insight text", "icon": "icon", "color": "color"}
  ],
  "recommendations": [
    {"text": "recommendation text", "icon": "icon", "color": "color"},
    {"text": "recommendation text", "icon": "icon", "color": "color"}
  ]
}`;

      const response = await this.openaiService.generateCompletion(prompt, {
        model: 'gpt-4-turbo',
        temperature: 0.3,
        maxTokens: 800
      });

      return JSON.parse(response);
    } catch (error) {
      console.error('AI insights generation failed, using fallback:', error);
      
      return {
        insights: [
          { text: 'Top KOL showing strong performance', icon: '👑', color: 'yellow' },
          { text: 'Market showing positive momentum', icon: '📈', color: 'green' }
        ],
        recommendations: [
          { text: 'Monitor top performing KOLs closely', icon: '👀', color: 'blue' },
          { text: 'Consider trending narrative opportunities', icon: '💡', color: 'purple' }
        ]
      };
    }
  }

  logProcessingResults(results) {
    console.log('📊 Processing Results:');
    Object.entries(results).forEach(([key, status]) => {
      const icon = status === 'fulfilled' ? '✅' : '❌';
      console.log(`  ${icon} ${key}: ${status}`);
    });
  }

  /**
   * Get cached analytics data
   */
  getCachedAnalytics(type) {
    const key = this.CACHE_KEYS[type.toUpperCase()];
    if (!key) {
      throw new Error(`Invalid analytics type: ${type}`);
    }
    
    return this.getCache(key);
  }

  /**
   * Force refresh specific analytics
   */
  async refreshAnalytics(type) {
    console.log(`🔄 Force refreshing ${type} analytics...`);
    
    switch (type.toLowerCase()) {
      case 'kol_performance':
        return await this.processKOLPerformance();
      case 'market_momentum':
        return await this.processMarketMomentum();
      case 'predictions':
        return await this.processPredictions();
      case 'visualizations':
        return await this.processVisualizations();
      case 'insights':
        return await this.processComprehensiveInsights();
      default:
        throw new Error(`Invalid analytics type: ${type}`);
    }
  }
}

export default EnhancedAnalyticsCacheService;
