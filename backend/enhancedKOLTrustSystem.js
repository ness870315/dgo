/**
 * Enhanced KOL Trust Scoring System
 * Designed to identify the most reliable and profitable KOLs
 */

export default class EnhancedKOLTrustSystem {
  constructor() {
    this.config = {
      // Performance weights
      performanceWeight: 0.35,    // 35% - Overall profitability
      consistencyWeight: 0.25,    // 25% - Reliability and consistency  
      riskManagementWeight: 0.20, // 20% - Risk-adjusted returns
      marketTimingWeight: 0.20,   // 20% - Entry timing and market awareness
      
      // Performance thresholds
      excellentThreshold: 2.0,    // 2x+ = excellent call
      goodThreshold: 1.5,          // 1.5x+ = good call
      profitableThreshold: 1.0,   // 1x+ = profitable call
      
      // Risk management
      maxDrawdownPenalty: 0.5,    // 50% drawdown = heavy penalty
      volatilityPenalty: 0.3,    // High volatility = penalty
      
      // Consistency metrics
      minCallsForTrust: 5,        // Minimum calls for trust score
      consistencyBonus: 0.1,      // Bonus for consistent performance
      
      // Market timing
      earlyEntryBonus: 0.15,      // Bonus for early market cap entries
      volumeTimingBonus: 0.1,     // Bonus for good volume timing
    };
  }

  /**
   * Calculate comprehensive KOL trust score
   */
  calculateKOLTrustScore(calls, currentTokenData = {}) {
    if (!calls || calls.length < this.config.minCallsForTrust) {
      return this.getDefaultScore();
    }

    // Calculate all metrics
    const performance = this.calculatePerformanceMetrics(calls, currentTokenData);
    const consistency = this.calculateConsistencyMetrics(calls, currentTokenData);
    const riskManagement = this.calculateRiskMetrics(calls, currentTokenData);
    const marketTiming = this.calculateMarketTimingMetrics(calls, currentTokenData);

    // Calculate weighted trust score
    const trustScore = 
      (performance.score * this.config.performanceWeight) +
      (consistency.score * this.config.consistencyWeight) +
      (riskManagement.score * this.config.riskManagementWeight) +
      (marketTiming.score * this.config.marketTimingWeight);

    return {
      trustScore: Math.min(100, Math.max(0, trustScore)),
      performance,
      consistency,
      riskManagement,
      marketTiming,
      summary: this.generateTrustSummary(performance, consistency, riskManagement, marketTiming)
    };
  }

  /**
   * Performance Metrics - Overall profitability and alpha generation
   */
  calculatePerformanceMetrics(calls, currentTokenData) {
    const metrics = calls.map(call => {
      const contractAddress = call.contractAddress || call.token?.contractAddress;
      const tokenData = currentTokenData[contractAddress] || {};
      
      // Current performance
      const currentMC = tokenData?.mcap || tokenData?.marketCap || call.currentMC || 0;
      const calledMC = call.calledMc || call.calledMC || 0;
      const currentMultiple = calledMC > 0 ? currentMC / calledMC : 0;
      
      // ATH performance (if available)
      const athMC = call.athMC || call.athMultiplier * calledMC || currentMC;
      const athMultiple = calledMC > 0 ? athMC / calledMC : currentMultiple;
      
      return {
        currentMultiple,
        athMultiple,
        calledMC,
        currentMC,
        athMC,
        symbol: call.token?.symbol || 'UNKNOWN'
      };
    });

    // Calculate performance score
    const profitableCalls = metrics.filter(m => m.currentMultiple >= this.config.profitableThreshold);
    const goodCalls = metrics.filter(m => m.currentMultiple >= this.config.goodThreshold);
    const excellentCalls = metrics.filter(m => m.currentMultiple >= this.config.excellentThreshold);
    
    const hitRate = profitableCalls.length / metrics.length;
    const goodRate = goodCalls.length / metrics.length;
    const excellentRate = excellentCalls.length / metrics.length;
    
    // Average performance
    const avgCurrentMultiple = metrics.reduce((sum, m) => sum + m.currentMultiple, 0) / metrics.length;
    const avgAthMultiple = metrics.reduce((sum, m) => sum + m.athMultiple, 0) / metrics.length;
    
    // Performance score (0-100)
    const performanceScore = 
      (hitRate * 30) +           // Hit rate weight
      (goodRate * 25) +           // Good calls weight  
      (excellentRate * 20) +      // Excellent calls weight
      (Math.min(avgCurrentMultiple * 10, 15)) + // Average performance
      (Math.min(avgAthMultiple * 5, 10));       // ATH performance

    return {
      score: Math.min(100, performanceScore),
      hitRate: hitRate * 100,
      goodRate: goodRate * 100,
      excellentRate: excellentRate * 100,
      avgCurrentMultiple,
      avgAthMultiple,
      totalCalls: metrics.length,
      profitableCalls: profitableCalls.length,
      goodCalls: goodCalls.length,
      excellentCalls: excellentCalls.length
    };
  }

  /**
   * Consistency Metrics - Reliability and steady performance
   */
  calculateConsistencyMetrics(calls, currentTokenData) {
    const metrics = calls.map(call => {
      const contractAddress = call.contractAddress || call.token?.contractAddress;
      const tokenData = currentTokenData[contractAddress] || {};
      
      const currentMC = tokenData?.mcap || tokenData?.marketCap || call.currentMC || 0;
      const calledMC = call.calledMc || call.calledMC || 0;
      const multiple = calledMC > 0 ? currentMC / calledMC : 0;
      
      return multiple;
    });

    // Calculate consistency metrics
    const mean = metrics.reduce((sum, m) => sum + m, 0) / metrics.length;
    const variance = metrics.reduce((sum, m) => sum + Math.pow(m - mean, 2), 0) / metrics.length;
    const standardDeviation = Math.sqrt(variance);
    const coefficientOfVariation = mean > 0 ? standardDeviation / mean : 0;
    
    // Consistency score (lower CV = more consistent)
    const consistencyScore = Math.max(0, 100 - (coefficientOfVariation * 200));
    
    // Bonus for consistent profitable performance
    const profitableConsistency = metrics.filter(m => m >= 1.0).length / metrics.length;
    const consistencyBonus = profitableConsistency > 0.7 ? this.config.consistencyBonus * 100 : 0;

    return {
      score: Math.min(100, consistencyScore + consistencyBonus),
      coefficientOfVariation,
      standardDeviation,
      profitableConsistency: profitableConsistency * 100,
      consistencyBonus
    };
  }

  /**
   * Risk Management Metrics - Risk-adjusted returns and drawdown control
   */
  calculateRiskMetrics(calls, currentTokenData) {
    const metrics = calls.map(call => {
      const contractAddress = call.contractAddress || call.token?.contractAddress;
      const tokenData = currentTokenData[contractAddress] || {};
      
      const currentMC = tokenData?.mcap || tokenData?.marketCap || call.currentMC || 0;
      const calledMC = call.calledMc || call.calledMC || 0;
      const athMC = call.athMC || call.athMultiplier * calledMC || currentMC;
      
      const currentMultiple = calledMC > 0 ? currentMC / calledMC : 0;
      const athMultiple = calledMC > 0 ? athMC / calledMC : currentMultiple;
      
      // Calculate drawdown from ATH
      const drawdown = athMultiple > 0 ? (athMultiple - currentMultiple) / athMultiple : 0;
      
      return {
        currentMultiple,
        athMultiple,
        drawdown,
        maxDrawdown: call.maxDrawdownPct || drawdown * 100
      };
    });

    // Risk metrics
    const avgDrawdown = metrics.reduce((sum, m) => sum + m.drawdown, 0) / metrics.length;
    const maxDrawdown = Math.max(...metrics.map(m => m.drawdown));
    const highDrawdownCalls = metrics.filter(m => m.drawdown > this.config.maxDrawdownPenalty).length;
    
    // Risk score (lower drawdown = better)
    const riskScore = Math.max(0, 100 - (avgDrawdown * 200) - (maxDrawdown * 100) - (highDrawdownCalls * 10));

    return {
      score: Math.min(100, riskScore),
      avgDrawdown: avgDrawdown * 100,
      maxDrawdown: maxDrawdown * 100,
      highDrawdownCalls,
      riskAdjustedReturn: this.calculateRiskAdjustedReturn(metrics)
    };
  }

  /**
   * Market Timing Metrics - Entry timing and market awareness
   */
  calculateMarketTimingMetrics(calls, currentTokenData) {
    const metrics = calls.map(call => {
      const contractAddress = call.contractAddress || call.token?.contractAddress;
      const tokenData = currentTokenData[contractAddress] || {};
      
      const calledMC = call.calledMc || call.calledMC || 0;
      const currentMC = tokenData?.mcap || tokenData?.marketCap || call.currentMC || 0;
      
      // Market cap timing (early entries get bonus)
      const mcapTimingScore = this.calculateMarketCapTimingScore(calledMC);
      
      // Volume timing (if available)
      const volumeTimingScore = this.calculateVolumeTimingScore(tokenData);
      
      return {
        calledMC,
        currentMC,
        mcapTimingScore,
        volumeTimingScore
      };
    });

    const avgMcapTiming = metrics.reduce((sum, m) => sum + m.mcapTimingScore, 0) / metrics.length;
    const avgVolumeTiming = metrics.reduce((sum, m) => sum + m.volumeTimingScore, 0) / metrics.length;
    
    const timingScore = (avgMcapTiming * 0.6) + (avgVolumeTiming * 0.4);

    return {
      score: Math.min(100, timingScore),
      avgMcapTiming,
      avgVolumeTiming,
      earlyEntryCalls: metrics.filter(m => m.mcapTimingScore > 70).length
    };
  }

  /**
   * Calculate market cap timing score
   */
  calculateMarketCapTimingScore(calledMC) {
    // Reward calls at optimal market cap ranges
    if (calledMC < 100000) return 90;      // Micro cap - high risk, high reward
    if (calledMC < 500000) return 85;      // Small cap - good alpha potential
    if (calledMC < 2000000) return 80;     // Mid cap - balanced risk/reward
    if (calledMC < 10000000) return 70;    // Large cap - lower risk
    if (calledMC < 50000000) return 60;    // Very large cap - limited upside
    return 40;                             // Mega cap - minimal alpha potential
  }

  /**
   * Calculate volume timing score
   */
  calculateVolumeTimingScore(tokenData) {
    // This would analyze volume patterns at call time
    // For now, return a base score
    return 50;
  }

  /**
   * Calculate risk-adjusted return
   */
  calculateRiskAdjustedReturn(metrics) {
    const avgReturn = metrics.reduce((sum, m) => sum + m.currentMultiple, 0) / metrics.length;
    const volatility = this.calculateVolatility(metrics.map(m => m.currentMultiple));
    
    return volatility > 0 ? avgReturn / volatility : avgReturn;
  }

  /**
   * Calculate volatility
   */
  calculateVolatility(returns) {
    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
    return Math.sqrt(variance);
  }

  /**
   * Generate trust summary
   */
  generateTrustSummary(performance, consistency, riskManagement, marketTiming) {
    const overallScore = (performance.score + consistency.score + riskManagement.score + marketTiming.score) / 4;
    
    let trustLevel = 'Novice';
    if (overallScore >= 80) trustLevel = 'Elite KOL';
    else if (overallScore >= 70) trustLevel = 'Expert KOL';
    else if (overallScore >= 60) trustLevel = 'Trusted KOL';
    else if (overallScore >= 50) trustLevel = 'Rising KOL';
    else if (overallScore >= 40) trustLevel = 'Developing KOL';

    return {
      trustLevel,
      overallScore,
      strengths: this.identifyStrengths(performance, consistency, riskManagement, marketTiming),
      recommendations: this.generateRecommendations(performance, consistency, riskManagement, marketTiming)
    };
  }

  /**
   * Identify KOL strengths
   */
  identifyStrengths(performance, consistency, riskManagement, marketTiming) {
    const strengths = [];
    
    if (performance.score >= 80) strengths.push('High Profitability');
    if (consistency.score >= 80) strengths.push('Consistent Performance');
    if (riskManagement.score >= 80) strengths.push('Excellent Risk Management');
    if (marketTiming.score >= 80) strengths.push('Superior Market Timing');
    
    return strengths;
  }

  /**
   * Generate improvement recommendations
   */
  generateRecommendations(performance, consistency, riskManagement, marketTiming) {
    const recommendations = [];
    
    if (performance.score < 60) recommendations.push('Focus on higher quality token selection');
    if (consistency.score < 60) recommendations.push('Work on more consistent performance');
    if (riskManagement.score < 60) recommendations.push('Improve risk management and drawdown control');
    if (marketTiming.score < 60) recommendations.push('Better market timing and entry points');
    
    return recommendations;
  }

  /**
   * Get default score for insufficient data
   */
  getDefaultScore() {
    return {
      trustScore: 0,
      performance: { score: 0, hitRate: 0, avgCurrentMultiple: 0 },
      consistency: { score: 0, coefficientOfVariation: 0 },
      riskManagement: { score: 0, avgDrawdown: 0 },
      marketTiming: { score: 0, avgMcapTiming: 0 },
      summary: { trustLevel: 'Insufficient Data', overallScore: 0, strengths: [], recommendations: [] }
    };
  }
}
