/**
 * Token Momentum Forecaster - Machine Learning Service
 * 
 * Forecasts token price momentum using:
 * - KOL sentiment analysis
 * - Price correlation patterns
 * - Volume spike detection
 * - Lead-lag timing analysis
 * - Market regime classification
 */

class TokenMomentumForecaster {
  constructor() {
    this.momentumWeights = {
      sentiment: 0.35,        // 35% weight on KOL sentiment
      correlation: 0.25,      // 25% weight on price correlation
      volume: 0.20,          // 20% weight on volume patterns
      timing: 0.20           // 20% weight on lead-lag timing
    };
    
    this.timeframes = {
      short: 60,    // 1 hour
      medium: 240,   // 4 hours
      long: 1440     // 24 hours
    };
    
    this.regimeThresholds = {
      bullish: 0.6,
      bearish: -0.6,
      sideways: 0.2
    };
  }

  /**
   * Forecast momentum for a token
   * @param {string} symbol - Token symbol
   * @param {Array} kolMentions - KOL mentions data
   * @param {Array} priceData - Historical price data
   * @returns {Object} Momentum forecast results
   */
  async forecast(symbol, kolMentions, priceData) {
    try {
      console.log(`📈 [MOMENTUM FORECASTER] Forecasting momentum for ${symbol}`);
      
      // Validate input data
      if (!this.validateInputData(symbol, kolMentions, priceData)) {
        return this.createLowConfidenceForecast('Insufficient data for momentum forecast');
      }
      
      // Extract features from data
      const features = this.extractFeatures(kolMentions, priceData);
      
      // Calculate momentum components
      const sentimentMomentum = this.calculateSentimentMomentum(features);
      const correlationMomentum = this.calculateCorrelationMomentum(features);
      const volumeMomentum = this.calculateVolumeMomentum(features);
      const timingMomentum = this.calculateTimingMomentum(features);
      
      // Generate forecasts for different timeframes
      const forecasts = this.generateForecasts({
        sentimentMomentum,
        correlationMomentum,
        volumeMomentum,
        timingMomentum,
        features
      });
      
      // Calculate confidence scores
      const confidence = this.calculateConfidence(features, forecasts);
      
      // Detect market regime
      const regime = this.detectMarketRegime(features, forecasts);
      
      // Generate alerts
      const alerts = this.generateAlerts(features, forecasts, regime);
      
      const result = {
        symbol: symbol.toUpperCase(),
        forecasts: {
          shortTerm: forecasts.shortTerm,    // 1 hour
          mediumTerm: forecasts.mediumTerm,  // 4 hours
          longTerm: forecasts.longTerm,      // 24 hours
          regime: regime
        },
        confidence: confidence,
        momentumScore: this.calculateOverallMomentumScore(forecasts),
        keyFactors: this.identifyKeyFactors(features, forecasts),
        alerts: alerts,
        riskFactors: this.identifyRiskFactors(features),
        timestamp: new Date().toISOString()
      };
      
      console.log(`✅ [MOMENTUM FORECASTER] Forecast complete for ${symbol}: Momentum=${result.momentumScore.toFixed(2)}, Regime=${regime}`);
      
      return result;
      
    } catch (error) {
      console.error(`❌ [MOMENTUM FORECASTER] Error forecasting ${symbol}:`, error.message);
      return this.createLowConfidenceForecast(`Forecast error: ${error.message}`);
    }
  }

  /**
   * Validate input data has sufficient information
   */
  validateInputData(symbol, kolMentions, priceData) {
    if (!symbol || !kolMentions || !priceData) return false;
    if (kolMentions.length < 3) return false;
    if (priceData.length < 10) return false;
    return true;
  }

  /**
   * Extract features from KOL mentions and price data
   */
  extractFeatures(kolMentions, priceData) {
    const features = {
      // KOL sentiment features
      sentimentScores: kolMentions.map(m => m.sentiment || 0),
      sentimentTrend: this.calculateSentimentTrend(kolMentions),
      avgSentiment: this.calculateAverageSentiment(kolMentions),
      sentimentVolatility: this.calculateSentimentVolatility(kolMentions),
      
      // Price correlation features
      priceChanges: this.calculatePriceChanges(priceData),
      priceVolatility: this.calculatePriceVolatility(priceData),
      priceTrend: this.calculatePriceTrend(priceData),
      
      // Volume features
      volumeData: this.extractVolumeData(priceData),
      volumeSpikes: this.detectVolumeSpikes(priceData),
      
      // Timing features
      mentionTiming: this.analyzeMentionTiming(kolMentions),
      leadLagPatterns: this.analyzeLeadLagPatterns(kolMentions, priceData),
      
      // Market context
      marketCap: this.extractMarketCap(priceData),
      liquidity: this.estimateLiquidity(priceData)
    };
    
    return features;
  }

  /**
   * Calculate sentiment trend over time
   */
  calculateSentimentTrend(kolMentions) {
    if (kolMentions.length < 3) return 0;
    
    const sentiments = kolMentions.map(m => m.sentiment || 0);
    const n = sentiments.length;
    const x = Array.from({length: n}, (_, i) => i);
    
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = sentiments.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * sentiments[i], 0);
    const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    return slope;
  }

  /**
   * Calculate average sentiment
   */
  calculateAverageSentiment(kolMentions) {
    const sentiments = kolMentions.map(m => m.sentiment || 0);
    return sentiments.reduce((a, b) => a + b, 0) / sentiments.length;
  }

  /**
   * Calculate sentiment volatility
   */
  calculateSentimentVolatility(kolMentions) {
    const sentiments = kolMentions.map(m => m.sentiment || 0);
    const mean = sentiments.reduce((a, b) => a + b, 0) / sentiments.length;
    const variance = sentiments.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / sentiments.length;
    return Math.sqrt(variance);
  }

  /**
   * Calculate price changes
   */
  calculatePriceChanges(priceData) {
    const changes = [];
    for (let i = 1; i < priceData.length; i++) {
      const change = (priceData[i].price - priceData[i-1].price) / priceData[i-1].price;
      changes.push(change);
    }
    return changes;
  }

  /**
   * Calculate price volatility
   */
  calculatePriceVolatility(priceData) {
    const changes = this.calculatePriceChanges(priceData);
    const mean = changes.reduce((a, b) => a + b, 0) / changes.length;
    const variance = changes.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / changes.length;
    return Math.sqrt(variance);
  }

  /**
   * Calculate price trend
   */
  calculatePriceTrend(priceData) {
    if (priceData.length < 3) return 0;
    
    const prices = priceData.map(p => p.price);
    const n = prices.length;
    const x = Array.from({length: n}, (_, i) => i);
    
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = prices.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * prices[i], 0);
    const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    return slope;
  }

  /**
   * Extract volume data
   */
  extractVolumeData(priceData) {
    return priceData.map(p => p.volume || 0);
  }

  /**
   * Detect volume spikes
   */
  detectVolumeSpikes(priceData) {
    const volumes = this.extractVolumeData(priceData);
    const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;
    const stdDev = Math.sqrt(volumes.reduce((sum, vol) => sum + Math.pow(vol - avgVolume, 2), 0) / volumes.length);
    
    const spikes = [];
    volumes.forEach((volume, index) => {
      if (volume > avgVolume + (2 * stdDev)) {
        spikes.push({
          index,
          volume,
          spikeIntensity: (volume - avgVolume) / stdDev
        });
      }
    });
    
    return spikes;
  }

  /**
   * Analyze mention timing patterns
   */
  analyzeMentionTiming(kolMentions) {
    const timings = kolMentions.map(m => new Date(m.created_at || m.timestamp));
    const intervals = [];
    
    for (let i = 1; i < timings.length; i++) {
      const interval = timings[i] - timings[i-1];
      intervals.push(interval / (1000 * 60)); // Convert to minutes
    }
    
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const intervalVolatility = Math.sqrt(intervals.reduce((sum, val) => sum + Math.pow(val - avgInterval, 2), 0) / intervals.length);
    
    return {
      avgInterval,
      intervalVolatility,
      recentAcceleration: this.calculateRecentAcceleration(intervals)
    };
  }

  /**
   * Calculate recent acceleration in mention frequency
   */
  calculateRecentAcceleration(intervals) {
    if (intervals.length < 3) return 0;
    
    const recent = intervals.slice(-3).reduce((a, b) => a + b, 0) / 3;
    const older = intervals.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
    
    return (older - recent) / older; // Positive = accelerating
  }

  /**
   * Analyze lead-lag patterns
   */
  analyzeLeadLagPatterns(kolMentions, priceData) {
    const patterns = [];
    
    kolMentions.forEach(mention => {
      const mentionTime = new Date(mention.created_at || mention.timestamp);
      
      // Find closest price data points
      const beforePrice = this.findClosestPrice(priceData, mentionTime, -1);
      const afterPrice = this.findClosestPrice(priceData, mentionTime, 1);
      
      if (beforePrice && afterPrice) {
        const priceChange = (afterPrice.price - beforePrice.price) / beforePrice.price;
        patterns.push({
          sentiment: mention.sentiment || 0,
          priceChange,
          timeDiff: Math.abs(afterPrice.timestamp - mentionTime.getTime()) / (1000 * 60) // minutes
        });
      }
    });
    
    return {
      patterns,
      avgLeadTime: this.calculateAverageLeadTime(patterns),
      correlation: this.calculateSentimentPriceCorrelation(patterns)
    };
  }

  /**
   * Find closest price data point
   */
  findClosestPrice(priceData, targetTime, direction) {
    let closest = null;
    let minDiff = Infinity;
    
    priceData.forEach(price => {
      const priceTime = new Date(price.timestamp || price.time);
      const diff = priceTime - targetTime;
      
      if (direction === 1 && diff > 0 && diff < minDiff) {
        minDiff = diff;
        closest = price;
      } else if (direction === -1 && diff < 0 && Math.abs(diff) < minDiff) {
        minDiff = Math.abs(diff);
        closest = price;
      }
    });
    
    return closest;
  }

  /**
   * Calculate average lead time
   */
  calculateAverageLeadTime(patterns) {
    if (patterns.length === 0) return 0;
    
    const leadTimes = patterns.map(p => p.timeDiff);
    return leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length;
  }

  /**
   * Calculate sentiment-price correlation
   */
  calculateSentimentPriceCorrelation(patterns) {
    if (patterns.length < 3) return 0;
    
    const sentiments = patterns.map(p => p.sentiment);
    const patternPriceChanges = patterns.map(p => p.priceChange);
    
    return this.calculatePearsonCorrelation(sentiments, patternPriceChanges);
  }

  /**
   * Calculate Pearson correlation coefficient
   */
  calculatePearsonCorrelation(x, y) {
    if (x.length !== y.length || x.length < 2) return 0;
    
    const n = x.length;
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, val, i) => sum + (val * y[i]), 0);
    const sumX2 = x.reduce((sum, val) => sum + (val * val), 0);
    const sumY2 = y.reduce((sum, val) => sum + (val * val), 0);
    
    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    
    return denominator === 0 ? 0 : numerator / denominator;
  }

  /**
   * Extract market cap (if available)
   */
  extractMarketCap(priceData) {
    const marketCaps = priceData.map(p => p.marketCap || p.mcap || 0).filter(mc => mc > 0);
    return marketCaps.length > 0 ? marketCaps.reduce((a, b) => a + b, 0) / marketCaps.length : 0;
  }

  /**
   * Estimate liquidity
   */
  estimateLiquidity(priceData) {
    const volumes = this.extractVolumeData(priceData);
    const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;
    return avgVolume;
  }

  /**
   * Calculate sentiment momentum
   */
  calculateSentimentMomentum(features) {
    const sentimentTrend = features.sentimentTrend;
    const avgSentiment = features.avgSentiment;
    const sentimentVolatility = features.sentimentVolatility;
    
    // Higher momentum for:
    // - Positive sentiment trend
    // - High average sentiment
    // - Low volatility (consistent sentiment)
    
    let momentum = 0;
    
    // Trend component
    momentum += sentimentTrend * 0.4;
    
    // Average sentiment component
    momentum += avgSentiment * 0.3;
    
    // Volatility component (inverse)
    momentum += (1 - sentimentVolatility) * 0.3;
    
    return Math.max(-1, Math.min(1, momentum));
  }

  /**
   * Calculate correlation momentum
   */
  calculateCorrelationMomentum(features) {
    const correlation = features.leadLagPatterns.correlation;
    const avgLeadTime = features.leadLagPatterns.avgLeadTime;
    
    // Higher momentum for:
    // - Strong positive correlation
    // - Short lead times (quick impact)
    
    let momentum = 0;
    
    // Correlation component
    momentum += correlation * 0.6;
    
    // Lead time component (shorter = better)
    const leadTimeScore = Math.max(0, 1 - (avgLeadTime / 240)); // 4 hours max
    momentum += leadTimeScore * 0.4;
    
    return Math.max(-1, Math.min(1, momentum));
  }

  /**
   * Calculate volume momentum
   */
  calculateVolumeMomentum(features) {
    const volumeSpikes = features.volumeSpikes;
    const liquidity = features.liquidity;
    
    // Higher momentum for:
    // - Recent volume spikes
    // - High liquidity
    
    let momentum = 0;
    
    // Volume spike component
    if (volumeSpikes.length > 0) {
      const recentSpikes = volumeSpikes.filter(spike => spike.index > volumeSpikes.length - 5);
      const avgSpikeIntensity = recentSpikes.reduce((sum, spike) => sum + spike.spikeIntensity, 0) / recentSpikes.length;
      momentum += Math.min(1, avgSpikeIntensity / 3) * 0.6;
    }
    
    // Liquidity component
    const liquidityScore = Math.min(1, liquidity / 1000000); // Normalize to 1M
    momentum += liquidityScore * 0.4;
    
    return Math.max(-1, Math.min(1, momentum));
  }

  /**
   * Calculate timing momentum
   */
  calculateTimingMomentum(features) {
    const recentAcceleration = features.mentionTiming.recentAcceleration;
    const intervalVolatility = features.mentionTiming.intervalVolatility;
    
    // Higher momentum for:
    // - Recent acceleration in mentions
    // - Low volatility (consistent timing)
    
    let momentum = 0;
    
    // Acceleration component
    momentum += recentAcceleration * 0.6;
    
    // Volatility component (inverse)
    momentum += (1 - Math.min(1, intervalVolatility / 60)) * 0.4; // Normalize to 1 hour
    
    return Math.max(-1, Math.min(1, momentum));
  }

  /**
   * Generate forecasts for different timeframes
   */
  generateForecasts(components) {
    const { sentimentMomentum, correlationMomentum, volumeMomentum, timingMomentum, features } = components;
    
    // Calculate weighted momentum score
    const overallMomentum = 
      (sentimentMomentum * this.momentumWeights.sentiment) +
      (correlationMomentum * this.momentumWeights.correlation) +
      (volumeMomentum * this.momentumWeights.volume) +
      (timingMomentum * this.momentumWeights.timing);
    
    // Generate forecasts for different timeframes
    const shortTerm = this.generateTimeframeForecast(overallMomentum, 'short', features);
    const mediumTerm = this.generateTimeframeForecast(overallMomentum, 'medium', features);
    const longTerm = this.generateTimeframeForecast(overallMomentum, 'long', features);
    
    return {
      shortTerm,
      mediumTerm,
      longTerm
    };
  }

  /**
   * Generate forecast for specific timeframe
   */
  generateTimeframeForecast(momentum, timeframe, features) {
    const timeframeMinutes = this.timeframes[timeframe];
    
    // Adjust momentum based on timeframe
    let adjustedMomentum = momentum;
    
    // Short-term: More volatile, higher impact
    if (timeframe === 'short') {
      adjustedMomentum *= 1.2;
    }
    // Long-term: More stable, lower impact
    else if (timeframe === 'long') {
      adjustedMomentum *= 0.8;
    }
    
    // Calculate price change prediction
    const priceChangePercent = adjustedMomentum * 0.1; // Max 10% change
    
    // Calculate confidence based on data quality
    const confidence = this.calculateTimeframeConfidence(features, timeframe);
    
    // Determine direction
    const direction = adjustedMomentum > 0.1 ? 'bullish' : 
                     adjustedMomentum < -0.1 ? 'bearish' : 'neutral';
    
    return {
      timeframe: `${timeframe} (${timeframeMinutes}min)`,
      direction,
      priceChangePercent: Math.round(priceChangePercent * 100) / 100,
      confidence,
      momentum: Math.round(adjustedMomentum * 100) / 100,
      timeframeMinutes
    };
  }

  /**
   * Calculate confidence for specific timeframe
   */
  calculateTimeframeConfidence(features, timeframe) {
    let confidence = 0.5;
    
    // Data quality factors
    if (features.sentimentScores.length >= 5) confidence += 0.1;
    if (features.leadLagPatterns.patterns.length >= 3) confidence += 0.1;
    if (features.volumeSpikes.length > 0) confidence += 0.1;
    
    // Timeframe-specific factors
    if (timeframe === 'short') {
      // Short-term: Higher confidence for recent data
      if (features.mentionTiming.recentAcceleration > 0) confidence += 0.1;
    } else if (timeframe === 'long') {
      // Long-term: Higher confidence for consistent patterns
      if (features.sentimentVolatility < 0.5) confidence += 0.1;
    }
    
    return Math.max(0.1, Math.min(0.95, confidence));
  }

  /**
   * Calculate overall confidence
   */
  calculateConfidence(features, forecasts) {
    const confidences = Object.values(forecasts).map(f => f.confidence);
    return confidences.reduce((a, b) => a + b, 0) / confidences.length;
  }

  /**
   * Detect market regime
   */
  detectMarketRegime(features, forecasts) {
    const avgMomentum = (forecasts.shortTerm.momentum + forecasts.mediumTerm.momentum + forecasts.longTerm.momentum) / 3;
    
    if (avgMomentum > this.regimeThresholds.bullish) {
      return 'bullish';
    } else if (avgMomentum < this.regimeThresholds.bearish) {
      return 'bearish';
    } else {
      return 'sideways';
    }
  }

  /**
   * Generate alerts based on forecasts
   */
  generateAlerts(features, forecasts, regime) {
    const alerts = [];
    
    // High momentum alerts
    if (forecasts.shortTerm.momentum > 0.7) {
      alerts.push({
        type: 'high_momentum',
        severity: 'high',
        message: `High bullish momentum detected (${forecasts.shortTerm.momentum.toFixed(2)})`,
        timeframe: 'short'
      });
    }
    
    if (forecasts.shortTerm.momentum < -0.7) {
      alerts.push({
        type: 'high_momentum',
        severity: 'high',
        message: `High bearish momentum detected (${forecasts.shortTerm.momentum.toFixed(2)})`,
        timeframe: 'short'
      });
    }
    
    // Volume spike alerts
    if (features.volumeSpikes.length > 0) {
      const recentSpikes = features.volumeSpikes.filter(spike => spike.spikeIntensity > 3);
      if (recentSpikes.length > 0) {
        alerts.push({
          type: 'volume_spike',
          severity: 'medium',
          message: `Volume spike detected (${recentSpikes.length} spikes)`,
          timeframe: 'short'
        });
      }
    }
    
    // Sentiment shift alerts
    if (Math.abs(features.sentimentTrend) > 0.5) {
      alerts.push({
        type: 'sentiment_shift',
        severity: 'medium',
        message: `Sentiment trend shift detected (${features.sentimentTrend.toFixed(2)})`,
        timeframe: 'medium'
      });
    }
    
    return alerts;
  }

  /**
   * Calculate overall momentum score
   */
  calculateOverallMomentumScore(forecasts) {
    const weights = { shortTerm: 0.5, mediumTerm: 0.3, longTerm: 0.2 };
    return (
      forecasts.shortTerm.momentum * weights.shortTerm +
      forecasts.mediumTerm.momentum * weights.mediumTerm +
      forecasts.longTerm.momentum * weights.longTerm
    );
  }

  /**
   * Identify key factors influencing the forecast
   */
  identifyKeyFactors(features, forecasts) {
    const factors = [];
    
    if (features.avgSentiment > 0.5) {
      factors.push('Strong bullish sentiment');
    } else if (features.avgSentiment < -0.5) {
      factors.push('Strong bearish sentiment');
    }
    
    if (features.leadLagPatterns.correlation > 0.5) {
      factors.push('Strong KOL-price correlation');
    }
    
    if (features.volumeSpikes.length > 0) {
      factors.push('Recent volume spikes');
    }
    
    if (features.mentionTiming.recentAcceleration > 0.2) {
      factors.push('Accelerating mention frequency');
    }
    
    if (features.sentimentVolatility < 0.3) {
      factors.push('Consistent sentiment');
    }
    
    return factors;
  }

  /**
   * Identify risk factors
   */
  identifyRiskFactors(features) {
    const risks = [];
    
    if (features.sentimentVolatility > 0.8) {
      risks.push('High sentiment volatility');
    }
    
    if (features.priceVolatility > 0.1) {
      risks.push('High price volatility');
    }
    
    if (features.leadLagPatterns.patterns.length < 3) {
      risks.push('Limited lead-lag data');
    }
    
    if (features.liquidity < 100000) {
      risks.push('Low liquidity');
    }
    
    return risks;
  }

  /**
   * Create low confidence forecast for insufficient data
   */
  createLowConfidenceForecast(reason) {
    return {
      symbol: 'UNKNOWN',
      forecasts: {
        shortTerm: { timeframe: 'short (60min)', direction: 'neutral', priceChangePercent: 0, confidence: 0.1, momentum: 0, timeframeMinutes: 60 },
        mediumTerm: { timeframe: 'medium (240min)', direction: 'neutral', priceChangePercent: 0, confidence: 0.1, momentum: 0, timeframeMinutes: 240 },
        longTerm: { timeframe: 'long (1440min)', direction: 'neutral', priceChangePercent: 0, confidence: 0.1, momentum: 0, timeframeMinutes: 1440 },
        regime: 'sideways'
      },
      confidence: 0.1,
      momentumScore: 0,
      keyFactors: [reason],
      alerts: [],
      riskFactors: ['Insufficient data'],
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Batch forecast for multiple tokens
   */
  async forecastBatch(tokenData) {
    console.log(`📈 [MOMENTUM FORECASTER] Batch forecasting for ${tokenData.length} tokens`);
    
    const forecasts = [];
    for (const data of tokenData) {
      const forecast = await this.forecast(data.symbol, data.kolMentions, data.priceData);
      forecasts.push(forecast);
      
      // Small delay to avoid overwhelming the system
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    console.log(`✅ [MOMENTUM FORECASTER] Batch forecast complete: ${forecasts.length} forecasts`);
    return forecasts;
  }
}

export default TokenMomentumForecaster;
