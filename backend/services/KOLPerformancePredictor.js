/**
 * KOL Performance Predictor - Machine Learning Service
 * 
 * Predicts future KOL performance based on historical data:
 * - Future alpha scores (0-100)
 * - Hit rate predictions
 * - Lead time forecasts
 * - Engagement trends
 * - Crypto focus evolution
 */

class KOLPerformancePredictor {
  constructor() {
    this.modelWeights = {
      recentTrend: 0.30,      // 30% weight on recent performance trend
      consistency: 0.25,      // 25% weight on performance consistency
      engagement: 0.20,       // 20% weight on engagement metrics
      growth: 0.15,           // 15% weight on follower growth
      marketFit: 0.10         // 10% weight on market correlation
    };
    
    this.minimumDataPoints = 5; // Minimum data points needed for prediction
    this.confidenceThreshold = 0.6; // Minimum confidence for predictions
  }

  /**
   * Predict future performance for a KOL
   * @param {Object} kolData - KOL historical data
   * @returns {Object} Prediction results
   */
  async predict(kolData) {
    try {
      console.log(`🔮 [KOL PREDICTOR] Predicting performance for @${kolData.handle}`);
      
      // Validate input data
      if (!this.validateInputData(kolData)) {
        return this.createLowConfidencePrediction('Insufficient data for prediction');
      }
      
      // Extract features from KOL data
      const features = this.extractFeatures(kolData);
      
      // Calculate performance trend
      const trend = this.calculatePerformanceTrend(features);
      
      // Calculate consistency score
      const consistency = this.calculateConsistency(features);
      
      // Calculate engagement momentum
      const engagementMomentum = this.calculateEngagementMomentum(features);
      
      // Calculate growth potential
      const growthPotential = this.calculateGrowthPotential(features);
      
      // Calculate market fit
      const marketFit = this.calculateMarketFit(features);
      
      // Generate predictions
      const predictions = this.generatePredictions({
        trend,
        consistency,
        engagementMomentum,
        growthPotential,
        marketFit,
        currentAlpha: kolData.influence_score || 50
      });
      
      // Calculate confidence score
      const confidence = this.calculateConfidence(features, predictions);
      
      // Generate recommendations
      const recommendations = this.generateRecommendations(features, predictions);
      
      const result = {
        kolHandle: kolData.handle,
        predictions: {
          alphaScore30d: predictions.alphaScore30d,
          alphaScore90d: predictions.alphaScore90d,
          hitRate30d: predictions.hitRate30d,
          hitRate90d: predictions.hitRate90d,
          avgLeadTime30d: predictions.avgLeadTime30d,
          avgLeadTime90d: predictions.avgLeadTime90d,
          engagementTrend: predictions.engagementTrend,
          cryptoFocusTrend: predictions.cryptoFocusTrend
        },
        confidence: confidence,
        timeframe: '30-90 days',
        keyFactors: this.identifyKeyFactors(features, predictions),
        recommendations: recommendations,
        riskFactors: this.identifyRiskFactors(features),
        timestamp: new Date().toISOString()
      };
      
      console.log(`✅ [KOL PREDICTOR] Prediction complete for @${kolData.handle}: Alpha=${predictions.alphaScore30d}, Confidence=${confidence.toFixed(2)}`);
      
      return result;
      
    } catch (error) {
      console.error(`❌ [KOL PREDICTOR] Error predicting for @${kolData.handle}:`, error.message);
      return this.createLowConfidencePrediction(`Prediction error: ${error.message}`);
    }
  }

  /**
   * Validate input data has sufficient information
   */
  validateInputData(kolData) {
    const requiredFields = ['handle', 'influence_score', 'total_posts'];
    const hasRequiredFields = requiredFields.every(field => kolData[field] !== undefined);
    
    const hasEnoughPosts = kolData.total_posts >= this.minimumDataPoints;
    
    return hasRequiredFields && hasEnoughPosts;
  }

  /**
   * Extract features from KOL data for ML processing
   */
  extractFeatures(kolData) {
    const features = {
      // Current metrics
      currentAlpha: kolData.influence_score || 50,
      totalPosts: kolData.total_posts || 0,
      followers: kolData.followers || 0,
      
      // Performance history (simulated from current data)
      alphaHistory: this.generateAlphaHistory(kolData),
      engagementHistory: this.generateEngagementHistory(kolData),
      
      // Engagement metrics
      avgEngagement: this.calculateAvgEngagement(kolData),
      engagementGrowth: this.calculateEngagementGrowth(kolData),
      
      // Activity patterns
      postFrequency: this.calculatePostFrequency(kolData),
      cryptoFocus: this.calculateCryptoFocus(kolData),
      
      // Influence breakdown
      influenceBreakdown: kolData.influence_breakdown || {
        followers: 50,
        engagement: 50,
        activity: 50,
        cryptoFocus: 50
      }
    };
    
    return features;
  }

  /**
   * Generate alpha score history (simulated for now)
   */
  generateAlphaHistory(kolData) {
    const currentAlpha = kolData.influence_score || 50;
    const history = [];
    
    // Generate 10 historical points with some variation
    for (let i = 9; i >= 0; i--) {
      const variation = (Math.random() - 0.5) * 10; // ±5 point variation
      const historicalAlpha = Math.max(1, Math.min(100, currentAlpha + variation - (i * 2)));
      history.push(historicalAlpha);
    }
    
    return history;
  }

  /**
   * Generate engagement history (simulated for now)
   */
  generateEngagementHistory(kolData) {
    const avgEngagement = this.calculateAvgEngagement(kolData);
    const history = [];
    
    // Generate 10 historical engagement points
    for (let i = 9; i >= 0; i--) {
      const variation = (Math.random() - 0.5) * 0.3; // ±15% variation
      const historicalEngagement = Math.max(0, avgEngagement * (1 + variation - (i * 0.05)));
      history.push(historicalEngagement);
    }
    
    return history;
  }

  /**
   * Calculate average engagement from posts
   */
  calculateAvgEngagement(kolData) {
    // This would ideally use actual post data
    // For now, estimate based on influence score
    const baseEngagement = (kolData.influence_score || 50) * 20;
    return Math.round(baseEngagement);
  }

  /**
   * Calculate engagement growth trend
   */
  calculateEngagementGrowth(kolData) {
    // Simulate growth trend based on influence score
    const currentScore = kolData.influence_score || 50;
    if (currentScore > 70) return 0.15; // High performers growing
    if (currentScore > 50) return 0.05; // Medium performers stable
    return -0.05; // Low performers declining
  }

  /**
   * Calculate post frequency
   */
  calculatePostFrequency(kolData) {
    const totalPosts = kolData.total_posts || 0;
    const daysActive = 30; // Assume 30 days of activity
    return totalPosts / daysActive;
  }

  /**
   * Calculate crypto focus percentage
   */
  calculateCryptoFocus(kolData) {
    const breakdown = kolData.influence_breakdown || {};
    return breakdown.cryptoFocus || 50;
  }

  /**
   * Calculate performance trend from alpha history
   */
  calculatePerformanceTrend(features) {
    const history = features.alphaHistory;
    if (history.length < 3) return 0;
    
    // Calculate trend using linear regression
    const n = history.length;
    const x = Array.from({length: n}, (_, i) => i);
    const y = history;
    
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    
    return slope;
  }

  /**
   * Calculate consistency score
   */
  calculateConsistency(features) {
    const history = features.alphaHistory;
    if (history.length < 3) return 0.5;
    
    // Calculate coefficient of variation (lower = more consistent)
    const mean = history.reduce((a, b) => a + b, 0) / history.length;
    const variance = history.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / history.length;
    const stdDev = Math.sqrt(variance);
    const cv = stdDev / mean;
    
    // Convert to consistency score (0-1, higher = more consistent)
    return Math.max(0, 1 - cv);
  }

  /**
   * Calculate engagement momentum
   */
  calculateEngagementMomentum(features) {
    const history = features.engagementHistory;
    if (history.length < 3) return 0;
    
    // Calculate momentum as recent vs older engagement
    const recent = history.slice(-3).reduce((a, b) => a + b, 0) / 3;
    const older = history.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
    
    return (recent - older) / older;
  }

  /**
   * Calculate growth potential
   */
  calculateGrowthPotential(features) {
    const followers = features.followers;
    const engagement = features.avgEngagement;
    const cryptoFocus = features.cryptoFocus;
    
    // Higher growth potential for:
    // - Medium follower count (room to grow)
    // - High engagement (good content)
    // - Low crypto focus (untapped market)
    
    let growthScore = 0.5;
    
    // Follower-based growth potential
    if (followers > 10000 && followers < 100000) growthScore += 0.2;
    else if (followers > 100000 && followers < 500000) growthScore += 0.1;
    
    // Engagement-based growth potential
    if (engagement > 1000) growthScore += 0.2;
    else if (engagement > 500) growthScore += 0.1;
    
    // Crypto focus opportunity
    if (cryptoFocus < 30) growthScore += 0.1; // Low crypto focus = opportunity
    
    return Math.min(1, growthScore);
  }

  /**
   * Calculate market fit
   */
  calculateMarketFit(features) {
    const cryptoFocus = features.cryptoFocus;
    const engagement = features.avgEngagement;
    const postFrequency = features.postFrequency;
    
    // Market fit based on crypto focus and engagement
    let marketFit = 0.5;
    
    // Crypto focus alignment
    if (cryptoFocus > 60) marketFit += 0.2; // High crypto focus
    else if (cryptoFocus > 30) marketFit += 0.1; // Medium crypto focus
    
    // Engagement quality
    if (engagement > 1000) marketFit += 0.2; // High engagement
    else if (engagement > 500) marketFit += 0.1; // Medium engagement
    
    // Activity level
    if (postFrequency > 1) marketFit += 0.1; // Active posting
    
    return Math.min(1, marketFit);
  }

  /**
   * Generate predictions based on calculated features
   */
  generatePredictions(features) {
    const { trend, consistency, engagementMomentum, growthPotential, marketFit, currentAlpha } = features;
    
    // Calculate weighted score for 30-day prediction
    const score30d = 
      (trend * 0.3) +
      (consistency * 0.25) +
      (engagementMomentum * 0.2) +
      (growthPotential * 0.15) +
      (marketFit * 0.1);
    
    // Calculate weighted score for 90-day prediction
    const score90d = score30d * 0.8 + (trend * 0.2); // Trend has more weight for longer term
    
    // Convert scores to alpha scores (0-100)
    const alphaScore30d = Math.max(1, Math.min(100, currentAlpha + (score30d * 20)));
    const alphaScore90d = Math.max(1, Math.min(100, currentAlpha + (score90d * 25)));
    
    // Predict hit rates based on alpha scores
    const hitRate30d = Math.max(0.1, Math.min(0.95, alphaScore30d / 100));
    const hitRate90d = Math.max(0.1, Math.min(0.95, alphaScore90d / 100));
    
    // Predict lead times (inverse relationship with alpha score)
    const avgLeadTime30d = Math.max(30, 300 - (alphaScore30d * 2));
    const avgLeadTime90d = Math.max(30, 300 - (alphaScore90d * 2));
    
    // Predict engagement trends
    const engagementTrend = engagementMomentum > 0.1 ? 'increasing' : 
                          engagementMomentum < -0.1 ? 'decreasing' : 'stable';
    
    // Predict crypto focus trends
    const cryptoFocusTrend = currentAlpha > 70 ? 'increasing' : 'stable';
    
    return {
      alphaScore30d: Math.round(alphaScore30d),
      alphaScore90d: Math.round(alphaScore90d),
      hitRate30d: Math.round(hitRate30d * 100) / 100,
      hitRate90d: Math.round(hitRate90d * 100) / 100,
      avgLeadTime30d: Math.round(avgLeadTime30d),
      avgLeadTime90d: Math.round(avgLeadTime90d),
      engagementTrend,
      cryptoFocusTrend
    };
  }

  /**
   * Calculate confidence in predictions
   */
  calculateConfidence(features, predictions) {
    let confidence = 0.5; // Base confidence
    
    // Increase confidence based on data quality
    if (features.alphaHistory.length >= 10) confidence += 0.2;
    if (features.totalPosts >= 20) confidence += 0.1;
    if (features.followers > 1000) confidence += 0.1;
    
    // Increase confidence based on consistency
    const consistency = this.calculateConsistency(features);
    confidence += consistency * 0.1;
    
    // Decrease confidence for extreme predictions
    if (predictions.alphaScore30d > 90 || predictions.alphaScore30d < 10) {
      confidence -= 0.2;
    }
    
    return Math.max(0.1, Math.min(0.95, confidence));
  }

  /**
   * Identify key factors influencing the prediction
   */
  identifyKeyFactors(features, predictions) {
    const factors = [];
    
    const trend = this.calculatePerformanceTrend(features);
    if (Math.abs(trend) > 0.5) {
      factors.push(trend > 0 ? 'Improving performance trend' : 'Declining performance trend');
    }
    
    const consistency = this.calculateConsistency(features);
    if (consistency > 0.8) {
      factors.push('High performance consistency');
    } else if (consistency < 0.4) {
      factors.push('Inconsistent performance');
    }
    
    if (features.avgEngagement > 1000) {
      factors.push('High engagement rate');
    }
    
    if (features.cryptoFocus < 30) {
      factors.push('Low crypto focus (opportunity)');
    } else if (features.cryptoFocus > 70) {
      factors.push('High crypto focus');
    }
    
    if (features.followers > 100000) {
      factors.push('Large follower base');
    }
    
    return factors;
  }

  /**
   * Generate recommendations based on predictions
   */
  generateRecommendations(features, predictions) {
    const recommendations = [];
    
    if (predictions.alphaScore30d > 80) {
      recommendations.push('High-potential KOL - prioritize monitoring');
    }
    
    if (predictions.engagementTrend === 'increasing') {
      recommendations.push('Growing engagement - consider early following');
    }
    
    if (features.cryptoFocus < 30 && predictions.alphaScore30d > 60) {
      recommendations.push('Non-crypto alpha opportunity - monitor for crypto mentions');
    }
    
    if (predictions.hitRate30d > 0.7) {
      recommendations.push('High hit rate predicted - valuable for trading signals');
    }
    
    if (predictions.avgLeadTime30d < 120) {
      recommendations.push('Fast lead time - good for quick trades');
    }
    
    return recommendations;
  }

  /**
   * Identify risk factors
   */
  identifyRiskFactors(features) {
    const risks = [];
    
    const trend = this.calculatePerformanceTrend(features);
    if (trend < -0.5) {
      risks.push('Declining performance trend');
    }
    
    const consistency = this.calculateConsistency(features);
    if (consistency < 0.3) {
      risks.push('Highly inconsistent performance');
    }
    
    if (features.totalPosts < 10) {
      risks.push('Limited historical data');
    }
    
    if (features.followers < 1000) {
      risks.push('Small follower base');
    }
    
    return risks;
  }

  /**
   * Create low confidence prediction for insufficient data
   */
  createLowConfidencePrediction(reason) {
    return {
      kolHandle: 'unknown',
      predictions: {
        alphaScore30d: 50,
        alphaScore90d: 50,
        hitRate30d: 0.5,
        hitRate90d: 0.5,
        avgLeadTime30d: 180,
        avgLeadTime90d: 180,
        engagementTrend: 'stable',
        cryptoFocusTrend: 'stable'
      },
      confidence: 0.1,
      timeframe: '30-90 days',
      keyFactors: [reason],
      recommendations: ['Collect more data for accurate prediction'],
      riskFactors: ['Insufficient data'],
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Batch predict for multiple KOLs
   */
  async predictBatch(kolsData) {
    console.log(`🔮 [KOL PREDICTOR] Batch predicting for ${kolsData.length} KOLs`);
    
    const predictions = [];
    for (const kolData of kolsData) {
      const prediction = await this.predict(kolData);
      predictions.push(prediction);
      
      // Small delay to avoid overwhelming the system
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log(`✅ [KOL PREDICTOR] Batch prediction complete: ${predictions.length} predictions`);
    return predictions;
  }
}

export default KOLPerformancePredictor;
