/**
 * Hype Trend Analysis Service
 * Implements EWMA + derivative and Bayesian change-point detection for social momentum prediction
 * DeGen Oracle AI Core Engine - Hype Prediction Module
 */

class HypeTrendAnalysis {
  constructor() {
    this.name = 'HypeTrendAnalysis';
  }

  /**
   * Analyze hype trend and predict future momentum
   * @param {Array} hypeData - Array of {timestamp, score, mentions, label} objects
   * @param {string} range - Time range (1d, 3d, 7d, 15d, 30d)
   * @returns {Object} Analysis with trend, prediction, and confidence
   */
  analyzeHypeTrend(hypeData, range = '7d') {
    try {
      console.log(`🧠 Analyzing hype trend for ${hypeData.length} data points over ${range}`);
      
      if (!hypeData || hypeData.length < 3) {
        return this.getInsufficientDataResponse();
      }

      // Sort data by timestamp
      const sortedData = [...hypeData].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      
      // Extract time series data
      const scores = sortedData.map(d => d.score || 0);
      const mentions = sortedData.map(d => d.mentions || 0);
      const timestamps = sortedData.map(d => new Date(d.timestamp).getTime());
      
      // 1. EWMA (Exponential Weighted Moving Average) Analysis
      const ewmaAnalysis = this.calculateEWMA(scores, mentions);
      
      // 2. Derivative Analysis (Rate of Change)
      const derivativeAnalysis = this.calculateDerivatives(scores, mentions, timestamps);
      
      // 3. Bayesian Change-Point Detection
      const changePointAnalysis = this.detectChangePoints(scores, mentions);
      
      // 4. Regime Classification
      const currentRegime = this.classifyRegime(ewmaAnalysis, derivativeAnalysis, changePointAnalysis);
      
      // 5. Generate Prediction
      const prediction = this.generatePrediction(currentRegime, ewmaAnalysis, derivativeAnalysis, range);
      
      // 6. Calculate Confidence Intervals
      const confidence = this.calculateConfidence(sortedData, currentRegime, prediction);
      
      return {
        success: true,
        analysis: {
          regime: currentRegime,
          trend: prediction.trend,
          direction: prediction.direction,
          confidence: confidence.level,
          confidenceInterval: confidence.interval,
          signals: this.generateSignals(currentRegime, prediction),
          technicalIndicators: {
            ewma: ewmaAnalysis,
            derivative: derivativeAnalysis,
            changePoints: changePointAnalysis
          },
          recommendation: this.generateRecommendation(currentRegime, prediction, confidence),
          forecast: prediction.forecast
        }
      };
      
    } catch (error) {
      console.error('❌ Hype trend analysis error:', error);
      return {
        success: false,
        error: 'Failed to analyze hype trend',
        analysis: null
      };
    }
  }

  /**
   * Calculate Exponential Weighted Moving Average
   */
  calculateEWMA(scores, mentions, alpha = 0.3) {
    const scoreEWMA = [];
    const mentionEWMA = [];
    
    // Initialize with first values
    scoreEWMA[0] = scores[0];
    mentionEWMA[0] = mentions[0];
    
    // Calculate EWMA for subsequent values
    for (let i = 1; i < scores.length; i++) {
      scoreEWMA[i] = alpha * scores[i] + (1 - alpha) * scoreEWMA[i - 1];
      mentionEWMA[i] = alpha * mentions[i] + (1 - alpha) * mentionEWMA[i - 1];
    }
    
    const currentScoreEWMA = scoreEWMA[scoreEWMA.length - 1];
    const currentMentionEWMA = mentionEWMA[mentionEWMA.length - 1];
    
    // Calculate momentum (recent vs historical average)
    const recentAvg = scores.slice(-3).reduce((a, b) => a + b, 0) / 3;
    const historicalAvg = scores.slice(0, -3).reduce((a, b) => a + b, 0) / Math.max(1, scores.length - 3);
    const momentum = recentAvg - historicalAvg;
    
    return {
      currentScore: currentScoreEWMA,
      currentMentions: currentMentionEWMA,
      momentum: momentum,
      scoreEWMA: scoreEWMA,
      mentionEWMA: mentionEWMA,
      trend: momentum > 0.5 ? 'rising' : momentum < -0.5 ? 'falling' : 'stable'
    };
  }

  /**
   * Calculate derivatives (rate of change)
   */
  calculateDerivatives(scores, mentions, timestamps) {
    const scoreDerivatives = [];
    const mentionDerivatives = [];
    
    for (let i = 1; i < scores.length; i++) {
      const timeDiff = (timestamps[i] - timestamps[i - 1]) / (1000 * 60 * 60); // hours
      const scoreChange = scores[i] - scores[i - 1];
      const mentionChange = mentions[i] - mentions[i - 1];
      
      scoreDerivatives.push(timeDiff > 0 ? scoreChange / timeDiff : 0);
      mentionDerivatives.push(timeDiff > 0 ? mentionChange / timeDiff : 0);
    }
    
    // Recent derivative (last 3 points average)
    const recentScoreDerivative = scoreDerivatives.slice(-3).reduce((a, b) => a + b, 0) / 3;
    const recentMentionDerivative = mentionDerivatives.slice(-3).reduce((a, b) => a + b, 0) / 3;
    
    // Acceleration (derivative of derivative)
    const acceleration = scoreDerivatives.length > 1 ? 
      scoreDerivatives[scoreDerivatives.length - 1] - scoreDerivatives[scoreDerivatives.length - 2] : 0;
    
    return {
      scoreDerivative: recentScoreDerivative,
      mentionDerivative: recentMentionDerivative,
      acceleration: acceleration,
      velocity: recentScoreDerivative,
      isAccelerating: acceleration > 0.1,
      isDecelerating: acceleration < -0.1
    };
  }

  /**
   * Bayesian Change-Point Detection with Adaptive Threshold
   */
  detectChangePoints(scores, mentions) {
    const changePoints = [];
    const windowSize = Math.min(5, Math.floor(scores.length / 3));
    
    // Calculate adaptive threshold based on data characteristics
    const adaptiveThreshold = this.calculateAdaptiveThreshold(scores);
    
    // Store all change scores for analysis
    const allChangeScores = [];
    
    for (let i = windowSize; i < scores.length - windowSize; i++) {
      const beforeWindow = scores.slice(i - windowSize, i);
      const afterWindow = scores.slice(i, i + windowSize);
      
      const beforeMean = beforeWindow.reduce((a, b) => a + b, 0) / beforeWindow.length;
      const afterMean = afterWindow.reduce((a, b) => a + b, 0) / afterWindow.length;
      
      const beforeVar = this.calculateVariance(beforeWindow, beforeMean);
      const afterVar = this.calculateVariance(afterWindow, afterMean);
      
      // Enhanced change-point score calculation
      const meanDiff = Math.abs(afterMean - beforeMean);
      const varDiff = Math.abs(afterVar - beforeVar);
      const changeScore = meanDiff + varDiff * 0.5;
      
      allChangeScores.push(changeScore);
      
      // Use adaptive threshold instead of fixed 1.5
      if (changeScore > adaptiveThreshold.threshold) {
        changePoints.push({
          index: i,
          score: changeScore,
          beforeMean: beforeMean,
          afterMean: afterMean,
          type: afterMean > beforeMean ? 'upturn' : 'downturn',
          significance: changeScore / adaptiveThreshold.threshold // How significant relative to threshold
        });
      }
    }
    
    // Find most recent significant change point
    const recentChangePoint = changePoints.length > 0 ? changePoints[changePoints.length - 1] : null;
    
    return {
      changePoints: changePoints,
      recentChangePoint: recentChangePoint,
      hasRecentChange: recentChangePoint && (scores.length - recentChangePoint.index) < 5,
      changeDirection: recentChangePoint ? recentChangePoint.type : 'stable',
      // Enhanced metadata for debugging and analysis
      adaptiveThreshold: adaptiveThreshold,
      allChangeScores: allChangeScores,
      maxChangeScore: Math.max(...allChangeScores),
      avgChangeScore: allChangeScores.reduce((a, b) => a + b, 0) / allChangeScores.length
    };
  }

  /**
   * Calculate adaptive threshold based on data characteristics
   */
  calculateAdaptiveThreshold(scores) {
    // Calculate overall data statistics
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const variance = this.calculateVariance(scores, mean);
    const stdDev = Math.sqrt(variance);
    const range = Math.max(...scores) - Math.min(...scores);
    
    // Base threshold strategies
    const strategies = {
      // Strategy 1: Variance-based (works well for stable data)
      varianceBased: Math.max(0.1, variance * 2),
      
      // Strategy 2: Standard deviation based
      stdDevBased: Math.max(0.1, stdDev * 0.5),
      
      // Strategy 3: Range-based (percentage of total range)
      rangeBased: Math.max(0.1, range * 0.15),
      
      // Strategy 4: Adaptive based on data stability
      stabilityBased: variance < 0.1 ? 0.1 : (variance < 0.5 ? 0.3 : 1.0),
      
      // Strategy 5: Hybrid approach
      hybrid: Math.max(0.1, Math.min(1.5, (variance * 2 + stdDev * 0.5 + range * 0.1) / 3))
    };
    
    // Choose the most appropriate strategy based on data characteristics
    let selectedThreshold;
    let strategy;
    
    if (variance < 0.1) {
      // Very stable data - use low threshold
      selectedThreshold = strategies.stabilityBased;
      strategy = 'stability-based (low variance)';
    } else if (variance > 2.0) {
      // Very volatile data - use higher threshold
      selectedThreshold = Math.min(1.5, strategies.hybrid);
      strategy = 'hybrid (high variance)';
    } else {
      // Moderate data - use hybrid approach
      selectedThreshold = strategies.hybrid;
      strategy = 'hybrid (moderate variance)';
    }
    
    return {
      threshold: selectedThreshold,
      strategy: strategy,
      dataCharacteristics: {
        mean: mean,
        variance: variance,
        stdDev: stdDev,
        range: range,
        stability: variance < 0.1 ? 'very stable' : variance < 0.5 ? 'stable' : variance < 2.0 ? 'moderate' : 'volatile'
      },
      allStrategies: strategies,
      reasoning: this.getThresholdReasoning(variance, range, selectedThreshold)
    };
  }

  /**
   * Get human-readable reasoning for threshold selection
   */
  getThresholdReasoning(variance, range, threshold) {
    if (variance < 0.1) {
      return `Data is very stable (variance: ${variance.toFixed(3)}). Using low threshold (${threshold.toFixed(3)}) to detect subtle changes.`;
    } else if (variance > 2.0) {
      return `Data is highly volatile (variance: ${variance.toFixed(3)}). Using higher threshold (${threshold.toFixed(3)}) to avoid false positives.`;
    } else {
      return `Data has moderate variance (${variance.toFixed(3)}). Using balanced threshold (${threshold.toFixed(3)}) for optimal detection.`;
    }
  }

  /**
   * Classify current regime (Rising, Fading, Stable)
   */
  classifyRegime(ewmaAnalysis, derivativeAnalysis, changePointAnalysis) {
    const { momentum, trend } = ewmaAnalysis;
    const { velocity, acceleration, isAccelerating } = derivativeAnalysis;
    const { hasRecentChange, changeDirection } = changePointAnalysis;
    
    // Rising regime indicators (lowered thresholds for better sensitivity)
    const risingSignals = [
      momentum > 0.1,  // Lowered from 0.5 to 0.1
      velocity > 0.05, // Lowered from 0.1 to 0.05
      isAccelerating,
      hasRecentChange && changeDirection === 'upturn',
      trend === 'rising'
    ].filter(Boolean).length;
    
    // Fading regime indicators (lowered thresholds for better sensitivity)
    const fadingSignals = [
      momentum < -0.1,  // Lowered from -0.5 to -0.1
      velocity < -0.05, // Lowered from -0.1 to -0.05
      acceleration < -0.05, // Lowered from -0.1 to -0.05
      hasRecentChange && changeDirection === 'downturn',
      trend === 'falling'
    ].filter(Boolean).length;
    
    // Determine regime (lowered threshold from 3 to 2 for better sensitivity)
    if (risingSignals >= 2) {
      return {
        type: 'rising',
        strength: risingSignals / 5,
        description: 'Social momentum is accelerating upward',
        emoji: '📈',
        color: '#10b981'
      };
    } else if (fadingSignals >= 2) {
      return {
        type: 'fading',
        strength: fadingSignals / 5,
        description: 'Social momentum is declining',
        emoji: '📉',
        color: '#ef4444'
      };
    } else {
      // Dynamic strength for stable regime based on weak signals
      const momentumMag = Math.min(1, Math.abs(momentum) / 1.5); // normalize ~[0,1]
      const velocityMag = Math.min(1, Math.abs(velocity) / 0.5);
      const accelBoost = Math.min(0.2, Math.max(0, Math.abs(acceleration) / 1));
      const dynamicStrength = Math.max(0.3, Math.min(0.7, 0.3 + 0.4 * (0.6 * momentumMag + 0.3 * velocityMag + 0.1 * accelBoost)));
      return {
        type: 'stable',
        strength: Number(dynamicStrength.toFixed(2)),
        description: 'Social momentum is consolidating',
        emoji: '➡️',
        color: '#6b7280'
      };
    }
  }

  /**
   * Generate prediction for next 6-12 hours
   */
  generatePrediction(regime, ewmaAnalysis, derivativeAnalysis, range) {
    const { type, strength } = regime;
    const { momentum, currentScore } = ewmaAnalysis;
    const { velocity, acceleration } = derivativeAnalysis;
    
    // Predict direction based on regime and technical indicators
    let direction = '→'; // stable
    let trend = 'sideways';
    let forecast = [];
    
    if (type === 'rising' && strength > 0.6) {
      direction = '↑';
      trend = 'bullish';
      
      // Generate optimistic forecast
      forecast = this.generateForecast(currentScore, velocity, acceleration, 'up');
      
    } else if (type === 'fading' && strength > 0.6) {
      direction = '↓';
      trend = 'bearish';
      
      // Generate pessimistic forecast
      forecast = this.generateForecast(currentScore, velocity, acceleration, 'down');
      
    } else {
      direction = '→';
      trend = 'sideways';
      
      // Generate stable forecast
      forecast = this.generateForecast(currentScore, velocity, acceleration, 'stable');
    }
    
    return {
      direction,
      trend,
      forecast,
      timeHorizon: '6-12h',
      confidence: strength
    };
  }

  /**
   * Generate forecast points for next 6-12 hours
   */
  generateForecast(currentScore, velocity, acceleration, direction) {
    const forecast = [];
    const steps = 6; // 6 points over 12 hours (2h intervals)
    
    for (let i = 1; i <= steps; i++) {
      const timeStep = i * 2; // 2 hour intervals
      let predictedScore = currentScore;
      
      if (direction === 'up') {
        predictedScore += velocity * timeStep + acceleration * timeStep * timeStep * 0.5;
        predictedScore = Math.min(10, predictedScore); // Cap at 10
      } else if (direction === 'down') {
        predictedScore += velocity * timeStep + acceleration * timeStep * timeStep * 0.5;
        predictedScore = Math.max(0, predictedScore); // Floor at 0
      } else {
        // Stable with small random walk
        predictedScore += (Math.random() - 0.5) * 0.5;
      }
      
      forecast.push({
        timeOffset: `+${timeStep}h`,
        predictedScore: Math.round(predictedScore * 10) / 10,
        confidence: Math.max(0.3, 0.9 - i * 0.1) // Decreasing confidence over time
      });
    }
    
    return forecast;
  }

  /**
   * Calculate confidence intervals
   */
  calculateConfidence(data, regime, prediction) {
    const { type, strength } = regime;
    const dataVariability = this.calculateDataVariability(data);
    
    // Base confidence on regime strength and data quality
    let baseConfidence = strength * 0.8; // Max 80% base confidence
    
    // Adjust for data quality
    if (data.length < 5) baseConfidence *= 0.6; // Less data = less confidence
    if (dataVariability > 2) baseConfidence *= 0.7; // High variability = less confidence
    
    // Confidence intervals (80% CI)
    const confidenceLevel = Math.max(0.3, Math.min(0.9, baseConfidence));
    const margin = dataVariability * 0.5;
    
    return {
      level: confidenceLevel,
      interval: {
        lower: Math.max(0, prediction.forecast[0]?.predictedScore - margin),
        upper: Math.min(10, prediction.forecast[0]?.predictedScore + margin)
      },
      quality: data.length >= 10 ? 'high' : data.length >= 5 ? 'medium' : 'low'
    };
  }

  /**
   * Generate actionable signals
   */
  generateSignals(regime, prediction) {
    const signals = [];
    
    if (regime.type === 'rising' && regime.strength > 0.7) {
      signals.push({
        type: 'bullish',
        message: 'Strong upward momentum detected',
        action: 'Consider adding to watchlist or making a call',
        strength: 'strong'
      });
    }
    
    if (regime.type === 'fading' && regime.strength > 0.7) {
      signals.push({
        type: 'bearish',
        message: 'Momentum fading rapidly',
        action: 'Consider taking profits or avoiding entry',
        strength: 'strong'
      });
    }
    
    if (regime.type === 'stable') {
      signals.push({
        type: 'neutral',
        message: 'Consolidation phase',
        action: 'Wait for clearer directional signals',
        strength: 'medium'
      });
    }
    
    return signals;
  }

  /**
   * Generate recommendation
   */
  generateRecommendation(regime, prediction, confidence) {
    const { type, strength } = regime;
    const { trend, direction } = prediction;
    const { level } = confidence;
    
    if (type === 'rising' && strength > 0.6 && level > 0.6) {
      return {
        action: 'BULLISH',
        message: `Strong ${direction} momentum with ${(level * 100).toFixed(0)}% confidence`,
        reasoning: 'Multiple technical indicators confirm upward trend',
        timeframe: '6-12 hours',
        riskLevel: 'medium'
      };
    } else if (type === 'fading' && strength > 0.6 && level > 0.6) {
      return {
        action: 'BEARISH',
        message: `Declining ${direction} momentum with ${(level * 100).toFixed(0)}% confidence`,
        reasoning: 'Technical indicators suggest downward pressure',
        timeframe: '6-12 hours',
        riskLevel: 'medium'
      };
    } else {
      return {
        action: 'NEUTRAL',
        message: `Sideways ${direction} action with ${(level * 100).toFixed(0)}% confidence`,
        reasoning: 'Mixed signals suggest consolidation phase',
        timeframe: '6-12 hours',
        riskLevel: 'low'
      };
    }
  }

  // Helper methods
  calculateVariance(values, mean) {
    const squaredDiffs = values.map(value => Math.pow(value - mean, 2));
    return squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
  }

  calculateDataVariability(data) {
    const scores = data.map(d => d.score || 0);
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    return Math.sqrt(this.calculateVariance(scores, mean));
  }

  getInsufficientDataResponse() {
    return {
      success: false,
      error: 'Insufficient data for analysis',
      analysis: {
        regime: {
          type: 'unknown',
          description: 'Need more data points for analysis',
          emoji: '❓',
          color: '#6b7280'
        },
        recommendation: {
          action: 'WAIT',
          message: 'Collect more data points for reliable analysis',
          reasoning: 'At least 3 data points required for trend analysis',
          timeframe: 'N/A',
          riskLevel: 'unknown'
        }
      }
    };
  }
}

export default HypeTrendAnalysis;
