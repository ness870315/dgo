/**
 * HYPE PREDICTION SERVICE SPECIFIC TEST
 * 
 * This endpoint tests ONLY the AIHypePredictionService to see exactly what it returns
 * Focus on the AI prediction output structure and content
 */

import AIHypePredictionService from './aiHypePredictionService.js';
import HypeSnapshotService from './hypeSnapshotService.js';
import HypeTrendAnalysis from './hypeTrendAnalysis.js';

export class HypePredictionTestEndpoint {
  constructor() {
    this.aiPrediction = new AIHypePredictionService();
    this.hypeService = new HypeSnapshotService();
    this.trendAnalysis = new HypeTrendAnalysis();
  }

  async initialize() {
    await this.aiPrediction.initializeCache();
  }

  /**
   * Test ONLY the AI Hype Prediction Service for Memeputer
   */
  async testHypePredictionService() {
    const contractAddress = '5EpbKX221NYVidK6A2nJGhtuLPvrPiQ6shknLbtjBAGS'; // MEMEPUTER
    const results = {
      contractAddress,
      symbol: 'MEMEPUTER',
      timestamp: new Date().toISOString(),
      test: 'AIHypePredictionService Specific Test',
      steps: {}
    };

    try {
      await this.initialize();
      console.log('🤖 Testing AI Hype Prediction Service specifically...');

      // Step 1: Get hype data
      console.log('📊 Step 1: Fetching hype snapshots...');
      const allSnapshots = await this.hypeService.getSnapshots(contractAddress);
      const recentData = allSnapshots.slice(-20); // Last 20 points for analysis
      
      results.steps.dataFetch = {
        totalSnapshots: allSnapshots.length,
        analysisDataPoints: recentData.length,
        sampleData: recentData.slice(-3).map(s => ({
          timestamp: s.timestamp,
          score: s.score,
          mentions: s.mentions,
          label: s.label
        }))
      };

      if (recentData.length < 5) {
        throw new Error(`Insufficient data for AI prediction: ${recentData.length} points (need 5+)`);
      }

      // Step 2: Create mock token data
      console.log('🏗️ Step 2: Preparing token data...');
      const tokenData = {
        symbol: 'MEMEPUTER',
        name: 'memeputer',
        contractAddress,
        marketCap: 1500000, // Mock realistic market cap
        price: 0.0015,      // Mock realistic price
        volume24h: 75000    // Mock realistic volume
      };

      results.steps.tokenData = tokenData;

      // Step 3: Generate trend analysis first (required for AI prediction)
      console.log('🧠 Step 3: Generating trend analysis...');
      const trendAnalysis = this.trendAnalysis.analyzeHypeTrend(recentData, '7d');
      
      results.steps.trendAnalysis = {
        success: trendAnalysis.success,
        regime: trendAnalysis.analysis?.regime,
        confidence: trendAnalysis.analysis?.confidence,
        signals: trendAnalysis.analysis?.signals,
        technicalIndicators: trendAnalysis.analysis?.technicalIndicators,
        fullAnalysis: trendAnalysis // Include full analysis for debugging
      };

      // Step 4: Call AI Prediction Service - THIS IS THE MAIN TEST
      console.log('🤖 Step 4: Calling AI Prediction Service...');
      console.log(`🔍 Input data: ${recentData.length} hype points, range: 7d`);
      
      const predictionStart = Date.now();
      const aiPrediction = await this.aiPrediction.getPrediction(
        contractAddress,
        tokenData,
        recentData,
        '7d',
        trendAnalysis
      );
      const predictionTime = Date.now() - predictionStart;

      // Step 5: Analyze the AI prediction response in detail
      console.log('🔍 Step 5: Analyzing AI prediction response...');
      
      results.steps.aiPrediction = {
        success: true,
        responseTime: `${predictionTime}ms`,
        cached: aiPrediction.cached || false,
        
        // Core prediction fields
        trendSummary: aiPrediction.trendSummary,
        patternAnalysis: aiPrediction.patternAnalysis,
        momentumDirection: aiPrediction.momentumDirection,
        momentumStrength: aiPrediction.momentumStrength,
        
        // Key levels
        keyLevels: aiPrediction.keyLevels,
        
        // Prediction details
        prediction: {
          nextMove: aiPrediction.prediction?.nextMove,
          timeframe: aiPrediction.prediction?.timeframe,
          confidence: aiPrediction.prediction?.confidence,
          targetScore: aiPrediction.prediction?.targetScore
        },
        
        // Catalysts and risks
        catalysts: aiPrediction.catalysts,
        risks: aiPrediction.risks,
        
        // Recommendation
        recommendation: aiPrediction.recommendation,
        reasoning: aiPrediction.reasoning,
        
        // Metadata
        generatedAt: aiPrediction.generatedAt,
        model: aiPrediction.model,
        
        // Full raw response for debugging
        fullResponse: aiPrediction
      };

      // Step 6: Test different time ranges
      console.log('⏰ Step 6: Testing different time ranges...');
      const timeRangeTests = {};
      
      for (const range of ['3d', '15d']) {
        try {
          console.log(`🔍 Testing ${range} prediction...`);
          const rangeMs = this.parseTimeRange(range);
          const sinceMs = Date.now() - rangeMs;
          const rangeData = allSnapshots.filter(d => new Date(d.timestamp).getTime() >= sinceMs);
          
          if (rangeData.length >= 5) {
            const rangeTrendAnalysis = this.trendAnalysis.analyzeHypeTrend(rangeData, range);
            const rangePrediction = await this.aiPrediction.getPrediction(
              contractAddress,
              tokenData,
              rangeData,
              range,
              rangeTrendAnalysis
            );
            
            timeRangeTests[range] = {
              success: true,
              dataPoints: rangeData.length,
              trendSummary: rangePrediction.trendSummary,
              momentumDirection: rangePrediction.momentumDirection,
              confidence: rangePrediction.prediction?.confidence,
              targetScore: rangePrediction.prediction?.targetScore,
              recommendation: rangePrediction.recommendation,
              cached: rangePrediction.cached || false
            };
          } else {
            timeRangeTests[range] = {
              success: false,
              error: `Insufficient data: ${rangeData.length} points`,
              dataPoints: rangeData.length
            };
          }
        } catch (rangeError) {
          timeRangeTests[range] = {
            success: false,
            error: rangeError.message
          };
        }
      }
      
      results.steps.timeRangeTests = timeRangeTests;

      // Step 7: Analysis summary
      results.summary = {
        aiServiceWorking: true,
        predictionGenerated: !!aiPrediction.trendSummary,
        hasConfidence: !!aiPrediction.prediction?.confidence,
        hasRecommendation: !!aiPrediction.recommendation,
        hasCatalysts: !!(aiPrediction.catalysts && aiPrediction.catalysts.length > 0),
        hasRisks: !!(aiPrediction.risks && aiPrediction.risks.length > 0),
        responseComplete: this.validatePredictionResponse(aiPrediction),
        readyForUI: this.assessUIReadiness(aiPrediction)
      };

      console.log('✅ AI Hype Prediction Service test completed successfully');
      return results;

    } catch (error) {
      console.error('❌ AI Hype Prediction Service test failed:', error);
      results.error = {
        message: error.message,
        stack: error.stack,
        step: 'Unknown'
      };
      return results;
    }
  }

  /**
   * Validate if the AI prediction response has all expected fields
   */
  validatePredictionResponse(prediction) {
    const requiredFields = [
      'trendSummary',
      'momentumDirection', 
      'momentumStrength',
      'prediction.confidence',
      'prediction.targetScore',
      'recommendation'
    ];

    const validation = {};
    requiredFields.forEach(field => {
      const value = this.getNestedValue(prediction, field);
      validation[field] = {
        present: value !== undefined && value !== null,
        value: value
      };
    });

    return validation;
  }

  /**
   * Assess if the prediction is ready for UI display
   */
  assessUIReadiness(prediction) {
    const checks = {
      hasTrendSummary: !!prediction.trendSummary,
      hasMomentumDirection: !!prediction.momentumDirection,
      hasConfidence: !!(prediction.prediction?.confidence),
      hasTargetScore: !!(prediction.prediction?.targetScore),
      hasRecommendation: !!prediction.recommendation,
      hasTimeframe: !!(prediction.prediction?.timeframe),
      hasCatalysts: !!(prediction.catalysts && prediction.catalysts.length > 0),
      hasRisks: !!(prediction.risks && prediction.risks.length > 0)
    };

    const readyCount = Object.values(checks).filter(Boolean).length;
    const totalChecks = Object.keys(checks).length;
    
    return {
      checks,
      readyPercentage: Math.round((readyCount / totalChecks) * 100),
      isReady: readyCount >= 6 // At least 6 out of 8 checks should pass
    };
  }

  /**
   * Get nested object value by dot notation
   */
  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
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

export default HypePredictionTestEndpoint;
