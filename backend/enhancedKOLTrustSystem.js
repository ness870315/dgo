/**
 * Enhanced KOL Trust Scoring System
 * Designed to identify the most reliable and profitable KOLs
 */

export default class EnhancedKOLTrustSystem {
  constructor() {
    this.config = {
      // Performance weights - FAVOR MEGA WINS OVER CONSISTENCY
      performanceWeight: 0.50,    // 50% - Overall profitability (increased from 35%)
      consistencyWeight: 0.15,    // 15% - Reliability and consistency (reduced from 25%)
      riskManagementWeight: 0.15, // 15% - Risk-adjusted returns (reduced from 20%)
      marketTimingWeight: 0.20,   // 20% - Entry timing and market awareness
      
      // Performance thresholds - PnL-based hit rate
      excellentThreshold: 3.0,    // 3x+ = excellent call (300%+ profit)
      goodThreshold: 2.0,          // 2x+ = good call (200%+ profit)
      profitableThreshold: 1.5,   // 1.5x+ = meaningful profitable call (150%+ profit)
      breakEvenThreshold: 1.0,    // 1x+ = break even (for reference only)
      
      // Risk management
      maxDrawdownPenalty: 0.5,    // 50% drawdown = heavy penalty
      volatilityPenalty: 0.3,    // High volatility = penalty
      
      // Consistency metrics
      minCallsForTrust: 1,        // Minimum calls for trust score (reduced for testing)
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
    console.log(`🔍 [Enhanced KOL Trust] Processing ${calls?.length || 0} calls for user`);
    
    if (!calls || calls.length < this.config.minCallsForTrust) {
      console.log(`⚠️ [Enhanced KOL Trust] Insufficient calls (${calls?.length || 0} < ${this.config.minCallsForTrust})`);
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

    const summary = this.generateTrustSummary(performance, consistency, riskManagement, marketTiming);
    
    console.log(`📊 [Enhanced KOL Trust] Final scores:`, {
      performance: performance.score.toFixed(1),
      consistency: consistency.score.toFixed(1),
      riskManagement: riskManagement.score.toFixed(1),
      marketTiming: marketTiming.score.toFixed(1),
      trustScore: trustScore.toFixed(1),
      trustLevel: summary.trustLevel,
      hitRate: performance.hitRate.toFixed(1) + '%'
    });

    return {
      trustScore: Math.min(100, Math.max(0, trustScore)),
      performance,
      consistency,
      riskManagement,
      marketTiming,
      summary
    };
  }

  /**
   * Performance Metrics - Mixed Hit Rate System
   * Uses ATH performance for hit rate but penalizes current drawdowns
   */
  calculatePerformanceMetrics(calls, currentTokenData) {
    console.log(`🔍 [Performance] Processing ${calls?.length || 0} calls`);
    console.log(`🔍 [Performance] Available token data: ${Object.keys(currentTokenData).length} tokens`);
    
    const metrics = calls.map(call => {
      const contractAddress = call.contractAddress || call.token?.contractAddress;
      const tokenData = currentTokenData[contractAddress] || {};
      
      // Current performance
      const currentMC = tokenData?.mcap || tokenData?.marketCap || tokenData?.jupiterData?.mcap || call.currentMC || 0;
      const calledMC = call.calledMc || call.calledMC || 0;
      const currentMultiple = calledMC > 0 ? currentMC / calledMC : 0;
      
      // ATH performance (if available)
      const athMC = call.athMC || call.athMultiplier * calledMC || currentMC;
      const athMultiple = calledMC > 0 ? athMC / calledMC : currentMultiple;
      
      // Calculate drawdown from ATH
      // BUT: Only penalize if call is currently unprofitable (<1x)
      // If call is still profitable, historical drawdown doesn't matter (crypto volatility is normal)
      let drawdownFromAth = 0;
      if (currentMultiple < 1.0) {
        // Call is losing money - penalize based on how far below entry
        drawdownFromAth = (1.0 - currentMultiple); // e.g., 0.5x = 50% drawdown
      } else if (currentMultiple < athMultiple) {
        // Call is profitable but down from ATH - apply LIGHT penalty (10% of the drawdown)
        const athDrawdown = (athMultiple - currentMultiple) / athMultiple;
        drawdownFromAth = athDrawdown * 0.1; // Only 10% of ATH drawdown matters if still profitable
      }
      // If currentMultiple >= athMultiple (new ATH), drawdownFromAth = 0 (no penalty)
      
      console.log(`🔍 [Performance] Call ${call.token?.symbol || 'UNKNOWN'}:`, {
        contractAddress,
        calledMC,
        currentMC,
        currentMultiple: currentMultiple.toFixed(2),
        athMultiple: athMultiple.toFixed(2),
        drawdownFromAth: (drawdownFromAth * 100).toFixed(1) + '%',
        hasTokenData: !!tokenData.mcap || !!tokenData.marketCap
      });
      
      return {
        currentMultiple,
        athMultiple,
        drawdownFromAth,
        calledMC,
        currentMC,
        athMC,
        symbol: call.token?.symbol || 'UNKNOWN'
      };
    });

    // 🎯 PnL-BASED HIT RATE SYSTEM
    // Only count calls that went meaningfully profitable (1.5x+ at ATH)
    const athProfitableCalls = metrics.filter(m => m.athMultiple >= this.config.profitableThreshold);
    const athGoodCalls = metrics.filter(m => m.athMultiple >= this.config.goodThreshold);
    const athExcellentCalls = metrics.filter(m => m.athMultiple >= this.config.excellentThreshold);
    const athBreakEvenCalls = metrics.filter(m => m.athMultiple >= this.config.breakEvenThreshold);
    
    // Calculate PnL-based hit rates (only meaningful profits count)
    const pnlHitRate = athProfitableCalls.length / metrics.length;
    const pnlGoodRate = athGoodCalls.length / metrics.length;
    const pnlExcellentRate = athExcellentCalls.length / metrics.length;
    const breakEvenRate = athBreakEvenCalls.length / metrics.length;
    
    // Calculate current performance metrics
    const currentProfitableCalls = metrics.filter(m => m.currentMultiple >= this.config.profitableThreshold);
    const currentGoodCalls = metrics.filter(m => m.currentMultiple >= this.config.goodThreshold);
    const currentExcellentCalls = metrics.filter(m => m.currentMultiple >= this.config.excellentThreshold);
    const currentBreakEvenCalls = metrics.filter(m => m.currentMultiple >= this.config.breakEvenThreshold);
    
    const currentHitRate = currentProfitableCalls.length / metrics.length;
    const currentGoodRate = currentGoodCalls.length / metrics.length;
    const currentExcellentRate = currentExcellentCalls.length / metrics.length;
    const currentBreakEvenRate = currentBreakEvenCalls.length / metrics.length;
    
    // Calculate average drawdown penalty (penalize if currently down from ATH)
    const avgDrawdownFromAth = metrics.reduce((sum, m) => sum + m.drawdownFromAth, 0) / metrics.length;
    const drawdownPenalty = Math.min(avgDrawdownFromAth * 0.5, 0.3); // Max 30% penalty
    
    console.log(`📊 [PnL Hit Rate] Performance metrics:`, {
      totalCalls: metrics.length,
      athProfitableCalls: athProfitableCalls.length,
      athGoodCalls: athGoodCalls.length,
      athExcellentCalls: athExcellentCalls.length,
      athBreakEvenCalls: athBreakEvenCalls.length,
      pnlHitRate: (pnlHitRate * 100).toFixed(1) + '%',
      pnlGoodRate: (pnlGoodRate * 100).toFixed(1) + '%',
      pnlExcellentRate: (pnlExcellentRate * 100).toFixed(1) + '%',
      breakEvenRate: (breakEvenRate * 100).toFixed(1) + '%',
      currentProfitableCalls: currentProfitableCalls.length,
      currentHitRate: (currentHitRate * 100).toFixed(1) + '%',
      avgDrawdownFromAth: (avgDrawdownFromAth * 100).toFixed(1) + '%',
      drawdownPenalty: (drawdownPenalty * 100).toFixed(1) + '%'
    });
    
    // Average performance
    const avgCurrentMultiple = metrics.reduce((sum, m) => sum + m.currentMultiple, 0) / metrics.length;
    const avgAthMultiple = metrics.reduce((sum, m) => sum + m.athMultiple, 0) / metrics.length;
    
    // 🎯 PnL-BASED PERFORMANCE SCORE
    // Use PnL hit rate (meaningful profits) but apply current drawdown penalty
    const basePerformanceScore = 
      (pnlHitRate * 30) +           // PnL hit rate weight (meaningful profits 1.5x+)
      (pnlGoodRate * 25) +          // PnL good calls weight (2x+)  
      (pnlExcellentRate * 20) +     // PnL excellent calls weight (3x+)
      (Math.min(avgAthMultiple * 5, 10)); // ATH average performance
    
    // Apply drawdown penalty
    const performanceScore = basePerformanceScore * (1 - drawdownPenalty);

    return {
      score: Math.min(100, performanceScore),
      hitRate: pnlHitRate * 100,  // Return PnL hit rate (meaningful profits 1.5x+)
      goodRate: pnlGoodRate * 100,
      excellentRate: pnlExcellentRate * 100,
      breakEvenRate: breakEvenRate * 100,  // Break even rate for reference
      currentHitRate: currentHitRate * 100,  // Current meaningful hit rate
      currentGoodRate: currentGoodRate * 100,
      currentExcellentRate: currentExcellentRate * 100,
      currentBreakEvenRate: currentBreakEvenRate * 100,
      avgCurrentMultiple,
      avgAthMultiple,
      avgDrawdownFromAth: avgDrawdownFromAth * 100,
      drawdownPenalty: drawdownPenalty * 100,
      totalCalls: metrics.length,
      profitableCalls: athProfitableCalls.length,  // ATH-based meaningful profitable calls (1.5x+)
      goodCalls: athGoodCalls.length,  // ATH-based good calls (2x+)
      excellentCalls: athExcellentCalls.length,  // ATH-based excellent calls (3x+)
      breakEvenCalls: athBreakEvenCalls.length,  // ATH-based break even calls (1x+)
      currentProfitableCalls: currentProfitableCalls.length,  // Current meaningful profitable calls
      currentGoodCalls: currentGoodCalls.length,
      currentExcellentCalls: currentExcellentCalls.length,
      currentBreakEvenCalls: currentBreakEvenCalls.length
    };
  }

  /**
   * Consistency Metrics - Reliability and steady performance
   */
  calculateConsistencyMetrics(calls, currentTokenData) {
    const metrics = calls.map(call => {
      const contractAddress = call.contractAddress || call.token?.contractAddress;
      const tokenData = currentTokenData[contractAddress] || {};
      
      const currentMC = tokenData?.mcap || tokenData?.marketCap || tokenData?.jupiterData?.mcap || call.currentMC || 0;
      const calledMC = call.calledMc || call.calledMC || 0;
      const athMC = call.athMC || call.athMultiplier * calledMC || currentMC;
      
      // Use ATH multiple for consistency (not current) - we care if they HIT winners, not if they still hold
      const athMultiple = calledMC > 0 ? athMC / calledMC : 0;
      
      return athMultiple;
    });

    // Calculate consistency metrics
    const mean = metrics.reduce((sum, m) => sum + m, 0) / metrics.length;
    const variance = metrics.reduce((sum, m) => sum + Math.pow(m - mean, 2), 0) / metrics.length;
    const standardDeviation = Math.sqrt(variance);
    const coefficientOfVariation = mean > 0 ? standardDeviation / mean : 0;
    
    // Consistency score (lower CV = more consistent, but be more forgiving)
    const consistencyScore = Math.max(0, 100 - (coefficientOfVariation * 100));
    
    // Bonus for consistent profitable performance
    const profitableConsistency = metrics.filter(m => m >= 1.0).length / metrics.length;
    const consistencyBonus = profitableConsistency > 0.7 ? this.config.consistencyBonus * 100 : 0;
    
    // Base consistency score (minimum 20 points for having calls)
    const baseConsistencyScore = 20;
    
    console.log(`🔍 [Enhanced KOL Trust] Consistency calculation:`, {
      coefficientOfVariation: coefficientOfVariation.toFixed(3),
      consistencyScore: consistencyScore.toFixed(1),
      profitableConsistency: (profitableConsistency * 100).toFixed(1) + '%',
      consistencyBonus: consistencyBonus.toFixed(1),
      finalScore: Math.min(100, Math.max(baseConsistencyScore, consistencyScore + consistencyBonus)).toFixed(1)
    });

    return {
      score: Math.min(100, Math.max(baseConsistencyScore, consistencyScore + consistencyBonus)),
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
      
      const currentMC = tokenData?.mcap || tokenData?.marketCap || tokenData?.jupiterData?.mcap || call.currentMC || 0;
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

    // Risk metrics - use MEDIAN drawdown instead of average (less affected by outliers)
    const drawdowns = metrics.map(m => m.drawdown).sort((a, b) => a - b);
    const medianDrawdown = drawdowns.length > 0 ? drawdowns[Math.floor(drawdowns.length / 2)] : 0;
    const avgDrawdown = metrics.reduce((sum, m) => sum + m.drawdown, 0) / metrics.length;
    const maxDrawdown = Math.max(...metrics.map(m => m.drawdown));
    const highDrawdownCalls = metrics.filter(m => m.drawdown > this.config.maxDrawdownPenalty).length;
    
    // Risk score - use MEDIAN drawdown (less punishing for mega winners) + cap maxDrawdown impact
    const riskScore = Math.max(0, 100 - (medianDrawdown * 40) - (Math.min(maxDrawdown, 0.8) * 20) - (highDrawdownCalls * 3));
    
    // Base risk score (minimum 20 points for having calls - increased from 15)
    const baseRiskScore = 20;
    
    // Bonus for good risk management (low drawdowns)
    const lowDrawdownBonus = medianDrawdown < 0.1 ? 10 : medianDrawdown < 0.2 ? 5 : 0;

    console.log(`🔍 [Enhanced KOL Trust] Risk calculation:`, {
      medianDrawdown: (medianDrawdown * 100).toFixed(1) + '%',
      avgDrawdown: (avgDrawdown * 100).toFixed(1) + '%',
      maxDrawdown: (maxDrawdown * 100).toFixed(1) + '%',
      highDrawdownCalls,
      riskScore: riskScore.toFixed(1),
      lowDrawdownBonus,
      finalScore: Math.min(100, Math.max(baseRiskScore, riskScore + lowDrawdownBonus)).toFixed(1)
    });

    return {
      score: Math.min(100, Math.max(baseRiskScore, riskScore + lowDrawdownBonus)),
      medianDrawdown: medianDrawdown * 100,
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
      const currentMC = tokenData?.mcap || tokenData?.marketCap || tokenData?.jupiterData?.mcap || call.currentMC || 0;
      
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
    // Use weighted score (same as trustScore calculation) instead of simple average
    const overallScore = 
      (performance.score * this.config.performanceWeight) +
      (consistency.score * this.config.consistencyWeight) +
      (riskManagement.score * this.config.riskManagementWeight) +
      (marketTiming.score * this.config.marketTimingWeight);
    
    let trustLevel = 'Novice';
    if (overallScore >= 70) trustLevel = 'Elite KOL';
    else if (overallScore >= 60) trustLevel = 'Expert KOL';
    else if (overallScore >= 50) trustLevel = 'Trusted KOL';
    else if (overallScore >= 40) trustLevel = 'Rising KOL';
    else if (overallScore >= 20) trustLevel = 'Developing KOL';

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
