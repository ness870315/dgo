/**
 * PRODUCTION HYPE ANALYSIS TEST ENDPOINT
 * 
 * This creates a temporary API endpoint to test hype analysis in production
 * Access via: GET /api/test/hype-analysis
 */

import HypeSnapshotService from './hypeSnapshotService.js';
import HypeTrendAnalysis from './hypeTrendAnalysis.js';
import AIHypePredictionService from './aiHypePredictionService.js';

export class HypeAnalysisTestEndpoint {
  constructor() {
    this.hypeService = new HypeSnapshotService();
    this.trendAnalysis = new HypeTrendAnalysis();
    this.aiPrediction = new AIHypePredictionService();
    this.initialized = false;
  }

  async initialize() {
    if (!this.initialized) {
      await this.aiPrediction.initialize();
      this.initialized = true;
    }
  }

  /**
   * Test hype analysis for Memeputer in production
   */
  async testHypeAnalysis() {
    const contractAddress = '5EpbKX221NYVidK6A2nJGhtuLPvrPiQ6shknLbtjBAGS'; // MEMEPUTER
    const results = {
      contractAddress,
      symbol: 'MEMEPUTER',
      timestamp: new Date().toISOString(),
      tests: {}
    };

    try {
      await this.initialize();

      // Test 1: Check hype snapshots
      console.log('🔍 Testing hype snapshots...');
      const allSnapshots = await this.hypeService.getSnapshots(contractAddress);
      results.tests.snapshots = {
        total: allSnapshots.length,
        recent: allSnapshots.slice(-5).map(s => ({
          timestamp: s.timestamp,
          score: s.score,
          mentions: s.mentions,
          label: s.label
        })),
        timeRanges: {}
      };

      // Test different time ranges
      const timeRanges = ['1d', '3d', '7d', '15d', '30d'];
      for (const range of timeRanges) {
        const rangeMs = this.parseTimeRange(range);
        const sinceMs = Date.now() - rangeMs;
        const rangeSnapshots = await this.hypeService.getSnapshots(contractAddress, sinceMs);
        results.tests.snapshots.timeRanges[range] = rangeSnapshots.length;
      }

      // Test 2: Trend Analysis (if we have data)
      if (allSnapshots.length >= 3) {
        console.log('🧠 Testing trend analysis...');
        const recentData = allSnapshots.slice(-20); // Last 20 points
        const trendAnalysis = this.trendAnalysis.analyzeHypeTrend(recentData, '7d');
        
        results.tests.trendAnalysis = {
          success: trendAnalysis.success,
          dataPoints: recentData.length,
          regime: trendAnalysis.analysis?.regime,
          confidence: trendAnalysis.analysis?.confidence,
          signals: trendAnalysis.analysis?.signals,
          technicalIndicators: {
            ewmaScore: trendAnalysis.analysis?.technicalIndicators?.ewmaScore,
            scoreDerivative: trendAnalysis.analysis?.technicalIndicators?.scoreDerivative,
            ewmaMentions: trendAnalysis.analysis?.technicalIndicators?.ewmaMentions
          }
        };
      } else {
        results.tests.trendAnalysis = {
          success: false,
          error: 'Insufficient data (need at least 3 points)',
          dataPoints: allSnapshots.length
        };
      }

      // Test 3: AI Prediction (if we have enough data)
      if (allSnapshots.length >= 5) {
        console.log('🤖 Testing AI prediction...');
        try {
          const tokenData = {
            symbol: 'MEMEPUTER',
            name: 'memeputer',
            contractAddress,
            marketCap: 1000000,
            price: 0.001,
            volume24h: 50000
          };

          const recentData = allSnapshots.slice(-15); // Last 15 points
          const trendAnalysis = this.trendAnalysis.analyzeHypeTrend(recentData, '7d');
          
          const prediction = await this.aiPrediction.getPrediction(
            contractAddress,
            tokenData,
            recentData,
            '7d',
            trendAnalysis
          );

          results.tests.aiPrediction = {
            success: true,
            dataPoints: recentData.length,
            trendSummary: prediction.trendSummary,
            momentumDirection: prediction.momentumDirection,
            momentumStrength: prediction.momentumStrength,
            confidence: prediction.prediction?.confidence,
            targetScore: prediction.prediction?.targetScore,
            timeframe: prediction.prediction?.timeframe,
            recommendation: prediction.recommendation,
            catalysts: prediction.catalysts?.slice(0, 2),
            risks: prediction.risks?.slice(0, 2),
            cached: prediction.cached || false
          };
        } catch (aiError) {
          results.tests.aiPrediction = {
            success: false,
            error: aiError.message,
            dataPoints: allSnapshots.length
          };
        }
      } else {
        results.tests.aiPrediction = {
          success: false,
          error: 'Insufficient data (need at least 5 points)',
          dataPoints: allSnapshots.length
        };
      }

      // Test 4: Data availability summary
      results.summary = {
        hasData: allSnapshots.length > 0,
        canAnalyzeTrends: allSnapshots.length >= 3,
        canGenerateAI: allSnapshots.length >= 5,
        dataQuality: this.assessDataQuality(allSnapshots),
        recommendations: this.getRecommendations(allSnapshots)
      };

      console.log('✅ Hype analysis test completed');
      return results;

    } catch (error) {
      console.error('❌ Hype analysis test failed:', error);
      results.error = {
        message: error.message,
        stack: error.stack
      };
      return results;
    }
  }

  /**
   * Assess data quality
   */
  assessDataQuality(snapshots) {
    if (snapshots.length === 0) return 'NO_DATA';
    if (snapshots.length < 3) return 'INSUFFICIENT';
    if (snapshots.length < 10) return 'LIMITED';
    if (snapshots.length < 50) return 'MODERATE';
    return 'GOOD';
  }

  /**
   * Get recommendations based on data availability
   */
  getRecommendations(snapshots) {
    const recommendations = [];
    
    if (snapshots.length === 0) {
      recommendations.push('No hype data found - check if token is being tracked');
      recommendations.push('Verify HypeSnapshotService is running and collecting data');
    } else if (snapshots.length < 10) {
      recommendations.push('Limited data available - need more snapshots for reliable analysis');
      recommendations.push('Consider collecting more historical data or waiting for more snapshots');
    } else {
      recommendations.push('Sufficient data available for hype analysis');
      recommendations.push('Ready to implement Hype Over Time Oracle AI feature');
    }

    return recommendations;
  }

  /**
   * Parse time range to milliseconds
   */
  parseTimeRange(range) {
    const unit = range.slice(-1);
    const value = parseInt(range.slice(0, -1));
    
    switch (unit) {
      case 'd': return value * 24 * 60 * 60 * 1000;
      case 'h': return value * 60 * 60 * 1000;
      case 'm': return value * 60 * 1000;
      default: return 7 * 24 * 60 * 60 * 1000;
    }
  }
}

export default HypeAnalysisTestEndpoint;
