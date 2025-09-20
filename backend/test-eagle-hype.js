/**
 * EAGLE HYPE ANALYSIS DEBUG TEST
 * 
 * This test analyzes EAGLE's hype data to debug why forecast shows 0
 * and why Bayesian change points aren't showing
 */

import HypeSnapshotService from './hypeSnapshotService.js';
import HypeTrendAnalysis from './hypeTrendAnalysis.js';
import AIHypePredictionService from './aiHypePredictionService.js';

// EAGLE contract address - we'll try to find it dynamically
const EAGLE_CONTRACT_ADDRESS = null; // Will be found dynamically
const EAGLE_TOKEN_DATA = {
  symbol: 'EAGLE',
  name: 'Eagle',
  contractAddress: EAGLE_CONTRACT_ADDRESS,
  marketCap: 2500000, // Example
  price: 0.025, // Example
  volume24h: 150000 // Example
};

export class EagleHypeDebugTest {
  constructor() {
    this.hypeService = new HypeSnapshotService();
    this.trendAnalysis = new HypeTrendAnalysis();
    this.aiPrediction = new AIHypePredictionService();
  }

  async findEagleToken() {
    try {
      // Try to find EAGLE from the token cache
      const { default: EnhancedBackend } = await import('./enhancedBackend.js');
      const backend = new EnhancedBackend();
      const tokens = await backend.getTokensFromCache();
      
      const eagleToken = tokens.find(token => 
        token.symbol?.toUpperCase() === 'EAGLE' || 
        token.name?.toLowerCase().includes('eagle')
      );
      
      if (eagleToken) {
        console.log('🦅 Found EAGLE token:', eagleToken.symbol, eagleToken.contractAddress);
        return eagleToken;
      }
      
      // If not found, return null and we'll use a mock
      console.log('⚠️ EAGLE token not found in cache, using mock data');
      return null;
    } catch (error) {
      console.log('⚠️ Error finding EAGLE token:', error.message);
      return null;
    }
  }

  async debugEagleHype() {
    try {
      console.log('🦅 Debugging EAGLE Hype Analysis...');

      // 1. Find EAGLE token
      const eagleToken = await this.findEagleToken();
      const contractAddress = eagleToken?.contractAddress || 'MOCK_EAGLE_CONTRACT';
      const tokenData = eagleToken || {
        symbol: 'EAGLE',
        name: 'Eagle',
        contractAddress: contractAddress,
        marketCap: 2500000,
        price: 0.025,
        volume24h: 150000
      };

      const results = {
        contractAddress: contractAddress,
        symbol: tokenData.symbol,
        timestamp: new Date().toISOString(),
        test: 'EAGLE Hype Analysis Debug',
        tokenFound: !!eagleToken,
        analysis: {}
      };

      // 2. Get EAGLE hype data
      const since = Date.now() - (7 * 24 * 60 * 60 * 1000); // Last 7 days
      const hypeSnapshots = await this.hypeService.getSnapshots(contractAddress, since);
      
      console.log(`📊 EAGLE Hype Snapshots: ${hypeSnapshots.length} points`);
      
      if (hypeSnapshots.length === 0) {
        throw new Error('No hype data found for EAGLE');
      }

      // Show recent snapshots
      const recentSnapshots = hypeSnapshots.slice(-10);
      console.log('\n📈 Recent EAGLE Hype Data:');
      recentSnapshots.forEach((snapshot, index) => {
        console.log(`  ${index + 1}. ${snapshot.timestamp} | Score: ${snapshot.score} | Mentions: ${snapshot.mentions} | Label: ${snapshot.label || 'N/A'}`);
      });

      results.analysis.inputData = {
        totalSnapshots: hypeSnapshots.length,
        recentSnapshots: recentSnapshots,
        scoreRange: {
          min: Math.min(...hypeSnapshots.map(s => s.score || 0)),
          max: Math.max(...hypeSnapshots.map(s => s.score || 0)),
          current: recentSnapshots[recentSnapshots.length - 1]?.score || 0
        }
      };

      // 2. Run HypeTrendAnalysis
      console.log('\n🧠 Running HypeTrendAnalysis...');
      const trendAnalysisResult = this.trendAnalysis.analyzeHypeTrend(hypeSnapshots, '7d');
      
      console.log('📊 Trend Analysis Result Structure:');
      console.log(JSON.stringify(trendAnalysisResult, null, 2));

      results.analysis.trendAnalysis = trendAnalysisResult;

      // 3. Check Bayesian Change Points specifically
      if (trendAnalysisResult.analysis?.technicalIndicators?.changePoints) {
        const changePoints = trendAnalysisResult.analysis.technicalIndicators.changePoints;
        console.log('\n🎯 Bayesian Change Points Analysis:');
        console.log(`  - Change Points Detected: ${changePoints.changePoints?.length || 0}`);
        console.log(`  - Has Recent Change: ${changePoints.hasRecentChange || false}`);
        console.log(`  - Change Direction: ${changePoints.changeDirection || 'stable'}`);
        console.log(`  - Adaptive Threshold: ${JSON.stringify(changePoints.adaptiveThreshold)}`);
        
        results.analysis.bayesianDebug = {
          changePointsCount: changePoints.changePoints?.length || 0,
          hasRecentChange: changePoints.hasRecentChange || false,
          changeDirection: changePoints.changeDirection || 'stable',
          adaptiveThreshold: changePoints.adaptiveThreshold,
          allChangePoints: changePoints.changePoints || []
        };
      }

      // 4. Check Forecast Data
      if (trendAnalysisResult.analysis?.forecast) {
        console.log('\n📅 Forecast Data:');
        console.log(JSON.stringify(trendAnalysisResult.analysis.forecast, null, 2));
        
        results.analysis.forecastDebug = {
          forecastPoints: trendAnalysisResult.analysis.forecast.length,
          forecast: trendAnalysisResult.analysis.forecast
        };
      } else {
        console.log('\n❌ No forecast data found in trend analysis');
        results.analysis.forecastDebug = {
          error: 'No forecast data in trend analysis result'
        };
      }

      // 5. Run AI Prediction
      console.log('\n🤖 Running AI Prediction...');
      await this.aiPrediction.initializeCache();
      
      const aiPredictionResult = await this.aiPrediction.getPrediction(
        contractAddress,
        tokenData,
        hypeSnapshots,
        '7d',
        trendAnalysisResult
      );

      console.log('🤖 AI Prediction Result:');
      console.log(JSON.stringify(aiPredictionResult, null, 2));

      results.analysis.aiPrediction = aiPredictionResult;

      // 6. Check AI Forecast vs Trend Forecast
      console.log('\n🔍 Forecast Comparison:');
      console.log('Trend Analysis Forecast:', trendAnalysisResult.analysis?.forecast);
      console.log('AI Prediction Target Score:', aiPredictionResult.prediction?.targetScore);

      results.analysis.forecastComparison = {
        trendForecast: trendAnalysisResult.analysis?.forecast,
        aiTargetScore: aiPredictionResult.prediction?.targetScore,
        aiTimeframe: aiPredictionResult.prediction?.timeframe,
        aiConfidence: aiPredictionResult.prediction?.confidence
      };

      // 7. Simulate Backend Response Structure
      const backendResponse = {
        success: true,
        contractAddress: contractAddress,
        symbol: tokenData.symbol,
        range: '7d',
        timestamp: new Date().toISOString(),
        dataPoints: hypeSnapshots.length,
        
        analysis: {
          technicalIndicators: {
            ewma: trendAnalysisResult.analysis?.technicalIndicators?.ewma,
            derivative: trendAnalysisResult.analysis?.technicalIndicators?.derivative,
            changePoints: {
              length: trendAnalysisResult.analysis?.technicalIndicators?.changePoints?.changePoints?.length || 0,
              hasRecentChange: trendAnalysisResult.analysis?.technicalIndicators?.changePoints?.hasRecentChange || false,
              changeDirection: trendAnalysisResult.analysis?.technicalIndicators?.changePoints?.changeDirection || 'stable',
              adaptiveThreshold: trendAnalysisResult.analysis?.technicalIndicators?.changePoints?.adaptiveThreshold
            }
          },
          currentRegime: trendAnalysisResult.analysis?.regime,
          prediction: trendAnalysisResult.analysis?.prediction,
          forecast: trendAnalysisResult.analysis?.forecast,
          aiInsights: aiPredictionResult
        },
        
        confidence: trendAnalysisResult.confidence || 0
      };

      results.analysis.simulatedBackendResponse = backendResponse;

      console.log('\n✅ EAGLE Debug Analysis Completed');
      return results;

    } catch (error) {
      console.error('❌ EAGLE Debug Test failed:', error);
      results.error = {
        message: error.message,
        stack: error.stack
      };
      return results;
    }
  }
}

export default EagleHypeDebugTest;
