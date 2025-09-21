import HypeSnapshotService from './hypeSnapshotService.js';
import HypeTrendAnalysis from './hypeTrendAnalysis.js';
import AIHypePredictionService from './aiHypePredictionService.js';

// Token to debug: 96hj47MzSpZgVcT1v4nwpbQNEU59f6ys48PArGivpump
const DEBUG_CONTRACT_ADDRESS = '96hj47MzSpZgVcT1v4nwpbQNEU59f6ys48PArGivpump';
const DEBUG_TOKEN_DATA = {
  symbol: 'PUMP',
  name: 'pump',
  contractAddress: DEBUG_CONTRACT_ADDRESS,
  marketCap: 1000000, // Example market cap
  price: 0.001, // Example price
  volume24h: 50000 // Example volume
};

export class ForecastDebugEndpoint {
  constructor() {
    this.hypeSnapshotService = new HypeSnapshotService();
    this.trendAnalysis = new HypeTrendAnalysis();
    this.aiPrediction = new AIHypePredictionService();
    this.initialized = false;
  }

  async initialize() {
    if (!this.initialized) {
      await this.aiPrediction.initializeCache();
      this.initialized = true;
    }
  }

  /**
   * Debug forecast calculation for specific token
   */
  async debugForecastCalculation() {
    await this.initialize(); // Ensure services are initialized

    try {
      // 1. Fetch Hype Snapshots
      const since = Date.now() - (30 * 24 * 60 * 60 * 1000); // Last 30 days
      const hypeData = await this.hypeSnapshotService.getSnapshots(DEBUG_CONTRACT_ADDRESS, since);

      if (hypeData.length === 0) {
        return {
          contractAddress: DEBUG_CONTRACT_ADDRESS,
          symbol: DEBUG_TOKEN_DATA.symbol,
          timestamp: new Date().toISOString(),
          error: { message: 'No hype data found for this token.' }
        };
      }

      // 2. Perform Hype Trend Analysis
      const trendAnalysisResult = this.trendAnalysis.analyzeHypeTrend(hypeData, '7d');

      // 3. Extract key values for forecast calculation
      const currentScore = trendAnalysisResult.currentMetrics?.currentScore || 0;
      const velocity = trendAnalysisResult.technicalIndicators?.derivative?.scoreDerivative || 0;
      const acceleration = trendAnalysisResult.technicalIndicators?.derivative?.acceleration || 0;
      const regime = trendAnalysisResult.currentRegime?.type || 'stable';
      const strength = trendAnalysisResult.currentRegime?.strength || 0;

      // 4. Manual forecast calculation to debug
      const manualForecast = this.calculateManualForecast(currentScore, velocity, acceleration, regime);

      return {
        contractAddress: DEBUG_CONTRACT_ADDRESS,
        symbol: DEBUG_TOKEN_DATA.symbol,
        timestamp: new Date().toISOString(),
        debug: {
          dataPoints: {
            totalSnapshots: hypeData.length,
            recentSnapshots: hypeData.slice(-5).map(s => ({
              timestamp: s.timestamp,
              score: s.score,
              mentions: s.mentions,
              label: s.label
            }))
          },
          currentMetrics: {
            currentScore: currentScore,
            velocity: velocity,
            acceleration: acceleration
          },
          regime: {
            type: regime,
            strength: strength
          },
          forecastCalculation: {
            inputValues: {
              currentScore: currentScore,
              velocity: velocity,
              acceleration: acceleration,
              direction: regime === 'rising' ? 'up' : regime === 'fading' ? 'down' : 'stable'
            },
            manualForecast: manualForecast,
            actualForecast: trendAnalysisResult.prediction?.forecast || []
          },
          analysis: {
            whyZeroForecast: this.explainZeroForecast(currentScore, velocity, acceleration, regime, strength),
            recommendations: this.getForecastRecommendations(currentScore, velocity, acceleration, regime)
          }
        }
      };
    } catch (error) {
      console.error('❌ Error in ForecastDebugEndpoint:', error);
      return {
        contractAddress: DEBUG_CONTRACT_ADDRESS,
        symbol: DEBUG_TOKEN_DATA.symbol,
        timestamp: new Date().toISOString(),
        error: { message: error.message, stack: error.stack }
      };
    }
  }

  calculateManualForecast(currentScore, velocity, acceleration, regime) {
    const forecast = [];
    const steps = 6; // 6 points over 12 hours (2h intervals)
    const direction = regime === 'rising' ? 'up' : regime === 'fading' ? 'down' : 'stable';
    
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
        confidence: Math.max(0.3, 0.9 - i * 0.1),
        calculation: {
          baseScore: currentScore,
          velocityContribution: velocity * timeStep,
          accelerationContribution: acceleration * timeStep * timeStep * 0.5,
          totalChange: velocity * timeStep + acceleration * timeStep * timeStep * 0.5
        }
      });
    }
    
    return forecast;
  }

  explainZeroForecast(currentScore, velocity, acceleration, regime, strength) {
    const reasons = [];
    
    if (Math.abs(velocity) < 0.001) {
      reasons.push('Velocity is extremely small (< 0.001) - no momentum detected');
    }
    
    if (Math.abs(acceleration) < 0.001) {
      reasons.push('Acceleration is extremely small (< 0.001) - no acceleration detected');
    }
    
    if (regime === 'stable' && strength < 0.3) {
      reasons.push('Regime is stable with low strength (< 0.3) - no clear trend direction');
    }
    
    if (currentScore < 1) {
      reasons.push('Current score is very low (< 1) - limited room for movement');
    }
    
    if (reasons.length === 0) {
      reasons.push('No obvious reason found - may be due to insufficient data or very stable token');
    }
    
    return reasons;
  }

  getForecastRecommendations(currentScore, velocity, acceleration, regime) {
    const recommendations = [];
    
    if (Math.abs(velocity) < 0.01) {
      recommendations.push('Consider lowering velocity threshold for more sensitive detection');
    }
    
    if (Math.abs(acceleration) < 0.01) {
      recommendations.push('Consider lowering acceleration threshold for more sensitive detection');
    }
    
    if (regime === 'stable') {
      recommendations.push('Token appears to be in stable regime - forecast will be flat by design');
    }
    
    recommendations.push('Check if token has sufficient historical data for trend analysis');
    recommendations.push('Consider using longer timeframes for more data points');
    
    return recommendations;
  }
}
