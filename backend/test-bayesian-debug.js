/**
 * BAYESIAN CHANGE-POINT DETECTION DEBUG TEST
 * 
 * This test analyzes why Bayesian change-point detection returns empty/null values
 * for MEMEPUTER hype data and shows the actual calculations
 */

import HypeSnapshotService from './hypeSnapshotService.js';
import HypeTrendAnalysis from './hypeTrendAnalysis.js';

export class BayesianDebugTestEndpoint {
  constructor() {
    this.hypeService = new HypeSnapshotService();
    this.trendAnalysis = new HypeTrendAnalysis();
  }

  /**
   * Debug Bayesian change-point detection for MEMEPUTER
   */
  async debugBayesianDetection() {
    const contractAddress = '5EpbKX221NYVidK6A2nJGhtuLPvrPiQ6shknLbtjBAGS'; // MEMEPUTER
    const results = {
      contractAddress,
      symbol: 'MEMEPUTER',
      timestamp: new Date().toISOString(),
      test: 'Bayesian Change-Point Detection Debug',
      analysis: {}
    };

    try {
      console.log('🔍 Debugging Bayesian Change-Point Detection...');

      // Get hype data
      const allSnapshots = await this.hypeService.getSnapshots(contractAddress);
      const recentData = allSnapshots.slice(-20); // Last 20 points
      
      if (recentData.length < 10) {
        throw new Error(`Insufficient data for Bayesian analysis: ${recentData.length} points`);
      }

      // Extract scores and mentions
      const scores = recentData.map(d => d.score || 0);
      const mentions = recentData.map(d => d.mentions || 0);
      const timestamps = recentData.map(d => d.timestamp);

      results.analysis.inputData = {
        dataPoints: recentData.length,
        scores: scores,
        mentions: mentions,
        timestamps: timestamps,
        scoreRange: {
          min: Math.min(...scores),
          max: Math.max(...scores),
          variance: this.calculateVariance(scores, scores.reduce((a, b) => a + b, 0) / scores.length)
        },
        mentionRange: {
          min: Math.min(...mentions),
          max: Math.max(...mentions),
          variance: this.calculateVariance(mentions, mentions.reduce((a, b) => a + b, 0) / mentions.length)
        }
      };

      // Manual Bayesian analysis with detailed logging
      const bayesianResults = this.debugBayesianChangePoints(scores, mentions);
      results.analysis.bayesianDetection = bayesianResults;

      // Compare with different thresholds
      const thresholdTests = {};
      for (const threshold of [0.1, 0.5, 1.0, 1.5, 2.0]) {
        thresholdTests[threshold] = this.testBayesianWithThreshold(scores, mentions, threshold);
      }
      results.analysis.thresholdTests = thresholdTests;

      // Analyze why no change points are detected
      results.analysis.diagnosis = this.diagnoseBayesianIssues(scores, mentions, bayesianResults);

      // Test with synthetic data to verify algorithm works
      results.analysis.syntheticTest = this.testWithSyntheticData();

      console.log('✅ Bayesian debug analysis completed');
      return results;

    } catch (error) {
      console.error('❌ Bayesian debug test failed:', error);
      results.error = {
        message: error.message,
        stack: error.stack
      };
      return results;
    }
  }

  /**
   * Debug Bayesian change-point detection with detailed calculations
   */
  debugBayesianChangePoints(scores, mentions) {
    const changePoints = [];
    const calculations = [];
    const windowSize = Math.min(5, Math.floor(scores.length / 3));
    
    console.log(`🔍 Bayesian Analysis: ${scores.length} points, window size: ${windowSize}`);
    
    for (let i = windowSize; i < scores.length - windowSize; i++) {
      const beforeWindow = scores.slice(i - windowSize, i);
      const afterWindow = scores.slice(i, i + windowSize);
      
      const beforeMean = beforeWindow.reduce((a, b) => a + b, 0) / beforeWindow.length;
      const afterMean = afterWindow.reduce((a, b) => a + b, 0) / afterWindow.length;
      
      const beforeVar = this.calculateVariance(beforeWindow, beforeMean);
      const afterVar = this.calculateVariance(afterWindow, afterMean);
      
      const meanDiff = Math.abs(afterMean - beforeMean);
      const varDiff = Math.abs(afterVar - beforeVar);
      const changeScore = meanDiff + varDiff * 0.5;
      
      const calculation = {
        index: i,
        beforeWindow: beforeWindow,
        afterWindow: afterWindow,
        beforeMean: beforeMean,
        afterMean: afterMean,
        beforeVar: beforeVar,
        afterVar: afterVar,
        meanDiff: meanDiff,
        varDiff: varDiff,
        changeScore: changeScore,
        threshold: 1.5,
        isSignificant: changeScore > 1.5
      };
      
      calculations.push(calculation);
      
      if (changeScore > 1.5) {
        changePoints.push({
          index: i,
          score: changeScore,
          beforeMean: beforeMean,
          afterMean: afterMean,
          type: afterMean > beforeMean ? 'upturn' : 'downturn'
        });
      }
    }
    
    return {
      windowSize,
      totalCalculations: calculations.length,
      calculations: calculations,
      changePoints: changePoints,
      maxChangeScore: Math.max(...calculations.map(c => c.changeScore)),
      avgChangeScore: calculations.reduce((sum, c) => sum + c.changeScore, 0) / calculations.length
    };
  }

  /**
   * Test Bayesian with different thresholds
   */
  testBayesianWithThreshold(scores, mentions, threshold) {
    const changePoints = [];
    const windowSize = Math.min(5, Math.floor(scores.length / 3));
    
    for (let i = windowSize; i < scores.length - windowSize; i++) {
      const beforeWindow = scores.slice(i - windowSize, i);
      const afterWindow = scores.slice(i, i + windowSize);
      
      const beforeMean = beforeWindow.reduce((a, b) => a + b, 0) / beforeWindow.length;
      const afterMean = afterWindow.reduce((a, b) => a + b, 0) / afterWindow.length;
      
      const beforeVar = this.calculateVariance(beforeWindow, beforeMean);
      const afterVar = this.calculateVariance(afterWindow, afterMean);
      
      const meanDiff = Math.abs(afterMean - beforeMean);
      const varDiff = Math.abs(afterVar - beforeVar);
      const changeScore = meanDiff + varDiff * 0.5;
      
      if (changeScore > threshold) {
        changePoints.push({
          index: i,
          score: changeScore,
          beforeMean: beforeMean,
          afterMean: afterMean,
          type: afterMean > beforeMean ? 'upturn' : 'downturn'
        });
      }
    }
    
    return {
      threshold,
      changePointsFound: changePoints.length,
      changePoints: changePoints.slice(0, 3) // Show first 3
    };
  }

  /**
   * Diagnose why Bayesian detection isn't working
   */
  diagnoseBayesianIssues(scores, mentions, bayesianResults) {
    const diagnosis = {
      issues: [],
      recommendations: []
    };

    // Check data variance
    const scoreMean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const scoreVariance = this.calculateVariance(scores, scoreMean);
    
    if (scoreVariance < 0.1) {
      diagnosis.issues.push('Very low score variance - data is too stable for change-point detection');
      diagnosis.recommendations.push('Lower the threshold from 1.5 to 0.1-0.5 for stable data');
    }

    if (bayesianResults.maxChangeScore < 1.5) {
      diagnosis.issues.push(`Maximum change score (${bayesianResults.maxChangeScore.toFixed(3)}) is below threshold (1.5)`);
      diagnosis.recommendations.push('Use adaptive threshold based on data characteristics');
    }

    if (bayesianResults.avgChangeScore < 0.5) {
      diagnosis.issues.push('Average change score is very low - indicates highly stable data');
      diagnosis.recommendations.push('Consider using percentage-based thresholds instead of absolute values');
    }

    // Check for monotonic trends
    const isMonotonic = this.checkMonotonicTrend(scores);
    if (isMonotonic.isMonotonic) {
      diagnosis.issues.push(`Data shows ${isMonotonic.direction} monotonic trend - no regime changes`);
      diagnosis.recommendations.push('Use trend analysis instead of change-point detection for monotonic data');
    }

    return diagnosis;
  }

  /**
   * Test with synthetic data to verify algorithm works
   */
  testWithSyntheticData() {
    // Create synthetic data with known change points
    const syntheticScores = [
      5, 5, 5, 5, 5,        // Stable low
      7, 7, 7, 7, 7,        // Jump up (change point at index 5)
      9, 9, 9, 9, 9,        // Jump up again (change point at index 10)
      6, 6, 6, 6, 6         // Drop down (change point at index 15)
    ];

    const syntheticResults = this.debugBayesianChangePoints(syntheticScores, syntheticScores);
    
    return {
      syntheticData: syntheticScores,
      changePointsDetected: syntheticResults.changePoints.length,
      changePoints: syntheticResults.changePoints,
      maxChangeScore: syntheticResults.maxChangeScore,
      algorithmWorking: syntheticResults.changePoints.length > 0
    };
  }

  /**
   * Check if data shows monotonic trend
   */
  checkMonotonicTrend(scores) {
    let increasing = 0;
    let decreasing = 0;
    
    for (let i = 1; i < scores.length; i++) {
      if (scores[i] > scores[i-1]) increasing++;
      else if (scores[i] < scores[i-1]) decreasing++;
    }
    
    const total = scores.length - 1;
    const isIncreasing = increasing / total > 0.7;
    const isDecreasing = decreasing / total > 0.7;
    
    return {
      isMonotonic: isIncreasing || isDecreasing,
      direction: isIncreasing ? 'increasing' : isDecreasing ? 'decreasing' : 'mixed',
      increasingRatio: increasing / total,
      decreasingRatio: decreasing / total
    };
  }

  /**
   * Calculate variance
   */
  calculateVariance(data, mean) {
    if (data.length <= 1) return 0;
    const squaredDiffs = data.map(x => Math.pow(x - mean, 2));
    return squaredDiffs.reduce((a, b) => a + b, 0) / (data.length - 1);
  }
}

export default BayesianDebugTestEndpoint;
