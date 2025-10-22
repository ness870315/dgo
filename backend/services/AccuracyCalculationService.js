/**
 * Accuracy Calculation Service
 * Calculates and analyzes prediction accuracy metrics
 */

class AccuracyCalculationService {
  constructor() {
    this.accuracyThresholds = {
      excellent: 90,
      good: 75,
      fair: 50,
      poor: 25,
      very_poor: 0
    };

    this.timeframeWeights = {
      'soon': 1.2,      // Higher weight for short-term predictions
      'days': 1.0,      // Standard weight
      'weeks': 0.9,     // Slightly lower weight for longer predictions
      'months': 0.8,    // Lower weight for very long predictions
      'unknown': 0.7    // Lowest weight for unclear timeframes
    };

    console.log('📊 [ACCURACY CALC] Accuracy Calculation Service initialized');
  }

  /**
   * Calculate comprehensive accuracy metrics for an author
   */
  calculateAuthorAccuracy(authorPredictions) {
    if (!authorPredictions || authorPredictions.length === 0) {
      return null;
    }

    const completedPredictions = authorPredictions.filter(p => p.status === 'completed' && p.finalAccuracy !== null);
    
    if (completedPredictions.length === 0) {
      return {
        totalPredictions: authorPredictions.length,
        completedPredictions: 0,
        averageAccuracy: 0,
        weightedAccuracy: 0,
        accuracyDistribution: this.getEmptyDistribution(),
        tokenAccuracy: {},
        predictionTypeAccuracy: {},
        timeframeAccuracy: {},
        trendAnalysis: null,
        confidence: 0
      };
    }

    // Basic metrics
    const totalPredictions = authorPredictions.length;
    const completedCount = completedPredictions.length;
    const averageAccuracy = completedPredictions.reduce((sum, p) => sum + p.finalAccuracy, 0) / completedCount;

    // Weighted accuracy (considering timeframe and confidence)
    const weightedAccuracy = this.calculateWeightedAccuracy(completedPredictions);

    // Accuracy distribution
    const accuracyDistribution = this.calculateAccuracyDistribution(completedPredictions);

    // Token-specific accuracy
    const tokenAccuracy = this.calculateTokenAccuracy(completedPredictions);

    // Prediction type accuracy
    const predictionTypeAccuracy = this.calculatePredictionTypeAccuracy(completedPredictions);

    // Timeframe accuracy
    const timeframeAccuracy = this.calculateTimeframeAccuracy(completedPredictions);

    // Trend analysis
    const trendAnalysis = this.analyzeAccuracyTrend(completedPredictions);

    // Confidence score (based on consistency and sample size)
    const confidence = this.calculateConfidenceScore(completedPredictions, totalPredictions);

    return {
      totalPredictions,
      completedPredictions: completedCount,
      averageAccuracy: Math.round(averageAccuracy * 100) / 100,
      weightedAccuracy: Math.round(weightedAccuracy * 100) / 100,
      accuracyDistribution,
      tokenAccuracy,
      predictionTypeAccuracy,
      timeframeAccuracy,
      trendAnalysis,
      confidence: Math.round(confidence * 100) / 100
    };
  }

  /**
   * Calculate weighted accuracy considering timeframe and confidence
   */
  calculateWeightedAccuracy(predictions) {
    let totalWeight = 0;
    let weightedSum = 0;

    predictions.forEach(prediction => {
      const timeframeWeight = this.timeframeWeights[prediction.timeframe.type] || 0.7;
      const confidenceWeight = prediction.confidence || 0.5;
      const weight = timeframeWeight * confidenceWeight;

      weightedSum += prediction.finalAccuracy * weight;
      totalWeight += weight;
    });

    return totalWeight > 0 ? weightedSum / totalWeight : 0;
  }

  /**
   * Calculate accuracy distribution across ranges
   */
  calculateAccuracyDistribution(predictions) {
    const distribution = {
      excellent: 0,
      good: 0,
      fair: 0,
      poor: 0,
      very_poor: 0
    };

    predictions.forEach(prediction => {
      const accuracy = prediction.finalAccuracy;
      
      if (accuracy >= this.accuracyThresholds.excellent) {
        distribution.excellent++;
      } else if (accuracy >= this.accuracyThresholds.good) {
        distribution.good++;
      } else if (accuracy >= this.accuracyThresholds.fair) {
        distribution.fair++;
      } else if (accuracy >= this.accuracyThresholds.poor) {
        distribution.poor++;
      } else {
        distribution.very_poor++;
      }
    });

    // Convert to percentages
    const total = predictions.length;
    Object.keys(distribution).forEach(key => {
      distribution[key] = Math.round((distribution[key] / total) * 100);
    });

    return distribution;
  }

  /**
   * Calculate token-specific accuracy
   */
  calculateTokenAccuracy(predictions) {
    const tokenStats = {};

    predictions.forEach(prediction => {
      const token = prediction.token;
      
      if (!tokenStats[token]) {
        tokenStats[token] = {
          count: 0,
          totalAccuracy: 0,
          averageAccuracy: 0,
          predictions: []
        };
      }

      tokenStats[token].count++;
      tokenStats[token].totalAccuracy += prediction.finalAccuracy;
      tokenStats[token].predictions.push({
        id: prediction.id,
        accuracy: prediction.finalAccuracy,
        predictionType: prediction.predictionType,
        completedAt: prediction.completedAt
      });
    });

    // Calculate averages
    Object.keys(tokenStats).forEach(token => {
      const stats = tokenStats[token];
      stats.averageAccuracy = Math.round((stats.totalAccuracy / stats.count) * 100) / 100;
    });

    return tokenStats;
  }

  /**
   * Calculate prediction type accuracy
   */
  calculatePredictionTypeAccuracy(predictions) {
    const typeStats = {};

    predictions.forEach(prediction => {
      const type = prediction.predictionType;
      
      if (!typeStats[type]) {
        typeStats[type] = {
          count: 0,
          totalAccuracy: 0,
          averageAccuracy: 0
        };
      }

      typeStats[type].count++;
      typeStats[type].totalAccuracy += prediction.finalAccuracy;
    });

    // Calculate averages
    Object.keys(typeStats).forEach(type => {
      const stats = typeStats[type];
      stats.averageAccuracy = Math.round((stats.totalAccuracy / stats.count) * 100) / 100;
    });

    return typeStats;
  }

  /**
   * Calculate timeframe accuracy
   */
  calculateTimeframeAccuracy(predictions) {
    const timeframeStats = {};

    predictions.forEach(prediction => {
      const timeframe = prediction.timeframe.type;
      
      if (!timeframeStats[timeframe]) {
        timeframeStats[timeframe] = {
          count: 0,
          totalAccuracy: 0,
          averageAccuracy: 0,
          averageDays: 0
        };
      }

      timeframeStats[timeframe].count++;
      timeframeStats[timeframe].totalAccuracy += prediction.finalAccuracy;
      timeframeStats[timeframe].averageDays += prediction.timeframe.days;
    });

    // Calculate averages
    Object.keys(timeframeStats).forEach(timeframe => {
      const stats = timeframeStats[timeframe];
      stats.averageAccuracy = Math.round((stats.totalAccuracy / stats.count) * 100) / 100;
      stats.averageDays = Math.round((stats.averageDays / stats.count) * 100) / 100;
    });

    return timeframeStats;
  }

  /**
   * Analyze accuracy trend over time
   */
  analyzeAccuracyTrend(predictions) {
    if (predictions.length < 3) {
      return null;
    }

    // Sort by completion date
    const sortedPredictions = predictions
      .filter(p => p.completedAt)
      .sort((a, b) => new Date(a.completedAt) - new Date(b.completedAt));

    if (sortedPredictions.length < 3) {
      return null;
    }

    // Calculate moving average (last 5 predictions)
    const recentPredictions = sortedPredictions.slice(-5);
    const recentAverage = recentPredictions.reduce((sum, p) => sum + p.finalAccuracy, 0) / recentPredictions.length;

    // Calculate overall average
    const overallAverage = predictions.reduce((sum, p) => sum + p.finalAccuracy, 0) / predictions.length;

    // Determine trend
    const trend = recentAverage > overallAverage ? 'improving' : 
                  recentAverage < overallAverage ? 'declining' : 'stable';

    // Calculate trend strength
    const trendStrength = Math.abs(recentAverage - overallAverage) / overallAverage;

    return {
      trend,
      trendStrength: Math.round(trendStrength * 100) / 100,
      recentAverage: Math.round(recentAverage * 100) / 100,
      overallAverage: Math.round(overallAverage * 100) / 100,
      recentCount: recentPredictions.length
    };
  }

  /**
   * Calculate confidence score based on consistency and sample size
   */
  calculateConfidenceScore(completedPredictions, totalPredictions) {
    if (completedPredictions.length === 0) {
      return 0;
    }

    // Sample size factor (more predictions = higher confidence)
    const sampleSizeFactor = Math.min(completedPredictions.length / 10, 1); // Max at 10 predictions

    // Consistency factor (lower variance = higher confidence)
    const accuracies = completedPredictions.map(p => p.finalAccuracy);
    const mean = accuracies.reduce((sum, acc) => sum + acc, 0) / accuracies.length;
    const variance = accuracies.reduce((sum, acc) => sum + Math.pow(acc - mean, 2), 0) / accuracies.length;
    const consistencyFactor = Math.max(0, 1 - (variance / 10000)); // Normalize variance

    // Completion rate factor
    const completionRate = completedPredictions.length / totalPredictions;

    // Combined confidence score
    const confidence = (sampleSizeFactor * 0.4) + (consistencyFactor * 0.4) + (completionRate * 0.2);

    return Math.min(confidence, 1);
  }

  /**
   * Get empty accuracy distribution
   */
  getEmptyDistribution() {
    return {
      excellent: 0,
      good: 0,
      fair: 0,
      poor: 0,
      very_poor: 0
    };
  }

  /**
   * Calculate prediction success rate
   */
  calculateSuccessRate(predictions, threshold = 50) {
    const completedPredictions = predictions.filter(p => p.status === 'completed' && p.finalAccuracy !== null);
    
    if (completedPredictions.length === 0) {
      return 0;
    }

    const successfulPredictions = completedPredictions.filter(p => p.finalAccuracy >= threshold);
    return Math.round((successfulPredictions.length / completedPredictions.length) * 100);
  }

  /**
   * Generate accuracy report for an author
   */
  generateAccuracyReport(authorPredictions) {
    const metrics = this.calculateAuthorAccuracy(authorPredictions);
    
    if (!metrics) {
      return {
        summary: 'No completed predictions available',
        recommendations: ['Make more predictions to establish accuracy baseline']
      };
    }

    const report = {
      summary: this.generateSummary(metrics),
      strengths: this.identifyStrengths(metrics),
      weaknesses: this.identifyWeaknesses(metrics),
      recommendations: this.generateRecommendations(metrics),
      metrics
    };

    return report;
  }

  /**
   * Generate summary text
   */
  generateSummary(metrics) {
    const { averageAccuracy, completedPredictions, confidence } = metrics;
    
    let summary = `Completed ${completedPredictions} predictions with ${averageAccuracy}% average accuracy`;
    
    if (confidence >= 0.8) {
      summary += ' (high confidence)';
    } else if (confidence >= 0.6) {
      summary += ' (moderate confidence)';
    } else {
      summary += ' (low confidence - more data needed)';
    }

    return summary;
  }

  /**
   * Identify strengths
   */
  identifyStrengths(metrics) {
    const strengths = [];

    if (metrics.averageAccuracy >= 75) {
      strengths.push('High overall accuracy');
    }

    if (metrics.accuracyDistribution.excellent > 20) {
      strengths.push('Frequently makes excellent predictions');
    }

    if (metrics.trendAnalysis && metrics.trendAnalysis.trend === 'improving') {
      strengths.push('Accuracy is improving over time');
    }

    if (metrics.confidence >= 0.8) {
      strengths.push('Consistent prediction quality');
    }

    return strengths;
  }

  /**
   * Identify weaknesses
   */
  identifyWeaknesses(metrics) {
    const weaknesses = [];

    if (metrics.averageAccuracy < 50) {
      weaknesses.push('Low overall accuracy');
    }

    if (metrics.accuracyDistribution.very_poor > 30) {
      weaknesses.push('Many very poor predictions');
    }

    if (metrics.trendAnalysis && metrics.trendAnalysis.trend === 'declining') {
      weaknesses.push('Accuracy is declining over time');
    }

    if (metrics.confidence < 0.5) {
      weaknesses.push('Inconsistent prediction quality');
    }

    return weaknesses;
  }

  /**
   * Generate recommendations
   */
  generateRecommendations(metrics) {
    const recommendations = [];

    if (metrics.completedPredictions < 5) {
      recommendations.push('Make more predictions to establish reliable accuracy baseline');
    }

    if (metrics.averageAccuracy < 60) {
      recommendations.push('Focus on improving prediction accuracy before increasing volume');
    }

    if (metrics.trendAnalysis && metrics.trendAnalysis.trend === 'declining') {
      recommendations.push('Review recent prediction methodology');
    }

    if (metrics.confidence < 0.6) {
      recommendations.push('Work on consistency in prediction quality');
    }

    return recommendations;
  }
}

export default AccuracyCalculationService;
