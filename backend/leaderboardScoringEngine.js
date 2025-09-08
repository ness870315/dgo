/**
 * Advanced Leaderboard Scoring Engine
 * Implements risk-adjusted returns, recency weighting, and anti-gaming measures
 */

export default class LeaderboardScoringEngine {
  constructor() {
    // Configuration constants
    this.config = {
      // Per-call metrics
      halfLife: 30, // days for recency weighting
      ddPenaltyThreshold: 0.30, // 30% drawdown before penalty starts
      liquidityReference: 100000, // $100k reference liquidity
      volumeK: 25, // K parameter for diminishing returns
      bayesianK: 15, // Bayesian shrinkage strength

      // Scoring parameters
      logisticSteepness: 3,
      logisticCenter: 0,

      // Hit rate parameters
      hitRateTarget: 2.0, // 2x multiple for hit rate
      hitRateWindow: 72, // hours
      wilsonConfidence: 0.95,

      // Gates
      minCallAge: 1, // hours minimum call age (reduced from 24h to allow recent calls)
      maxDuplicateHours: 168, // 7 days for duplicate prevention
    };

    this.globalStats = {
      meanEfficiency: 0,
      totalCalls: 0,
      totalUsers: 0
    };
  }

  /**
   * Calculate per-call metrics
   */
  calculateCallMetrics(call, currentData) {
    const now = new Date();
    const calledAt = new Date(call.calledAt || call.createdAt);
    const ageHours = (now - calledAt) / (1000 * 60 * 60);
    const ageDays = ageHours / 24;

    // Skip calls that are too recent
    if (ageHours < this.config.minCallAge) {
      console.log(`🏆 Skipping call (too recent): ${ageHours}h < ${this.config.minCallAge}h`);
      return null;
    }

    // X multiple (prioritize lowercase 'c' as that's how it's saved)
    const calledMC = Number(call.calledMc || call.calledMC || 0);
    const currentMC = Number(currentData?.mcap || currentData?.marketCap || call.currentMC || 0);

    if (!calledMC || !currentMC || calledMC <= 0) {
      console.log(`🏆 Skipping call (invalid MC): calledMC=${calledMC}, currentMC=${currentMC}`);
      return null;
    }

    const xMultiple = currentMC / calledMC;

    // Log return (clipped to prevent outliers)
    const clippedX = Math.max(0.1, Math.min(20, xMultiple));
    const logReturn = Math.log(clippedX);

    // Max drawdown penalty (simplified - would need historical data)
    const maxDrawdown = call.maxDrawdownPct || 0;
    const ddWeight = 1 - Math.max(0, (maxDrawdown - this.config.ddPenaltyThreshold) / (1 - this.config.ddPenaltyThreshold));

    // Liquidity weight
    const liquidity = currentData?.liquidity || call.liquidity || 0;
    const liqWeight = Math.max(0.5, Math.min(1, liquidity / this.config.liquidityReference));

    // Recency weight
    const timeWeight = Math.exp(-ageDays / this.config.halfLife);

    // Per-call score
    const callScore = logReturn * ddWeight * liqWeight * timeWeight;

    return {
      callId: call.id,
      xMultiple,
      logReturn,
      ddWeight,
      liqWeight,
      timeWeight,
      callScore,
      ageHours,
      calledMC,
      currentMC,
      liquidity,
      maxDrawdown
    };
  }

  /**
   * Calculate user efficiency (weighted average log return)
   */
  calculateUserEfficiency(calls, globalMean = 0) {
    if (!calls || calls.length === 0) {
      return { efficiency: 0, callCount: 0, metrics: {} };
    }

    const validCalls = calls.filter(call => call !== null);

    if (validCalls.length === 0) {
      return { efficiency: 0, callCount: 0, metrics: {} };
    }

    // Calculate weighted efficiency
    let weightedSum = 0;
    let weightSum = 0;
    let totalScore = 0;
    let hitRateCalls = 0;
    let hitRateHits = 0;
    let xMultiples = [];
    let timeTo2x = [];

    validCalls.forEach(call => {
      const weight = call.timeWeight;
      weightedSum += call.callScore * weight;
      weightSum += weight;
      totalScore += call.callScore;

      // Hit rate tracking
      if (call.ageHours <= this.config.hitRateWindow) {
        hitRateCalls++;
        if (call.xMultiple >= this.config.hitRateTarget) {
          hitRateHits++;
        }
      }

      // X multiples for median/geomean
      xMultiples.push(call.xMultiple);

      // Time to 2x tracking
      if (call.xMultiple >= 2.0) {
        timeTo2x.push(call.ageHours);
      }
    });

    const efficiency = weightSum > 0 ? weightedSum / weightSum : 0;

    // Calculate additional metrics
    const hitRate = hitRateCalls > 0 ? hitRateHits / hitRateCalls : 0;
    const wilsonScore = this.calculateWilsonScore(hitRate, hitRateCalls);

    const sortedX = xMultiples.sort((a, b) => a - b);
    const medianX = sortedX.length > 0 ? sortedX[Math.floor(sortedX.length / 2)] : 0;
    const geoMeanX = xMultiples.length > 0 ?
      Math.exp(xMultiples.reduce((sum, x) => sum + Math.log(Math.max(0.1, x)), 0) / xMultiples.length) : 0;

    const avgTimeTo2x = timeTo2x.length > 0 ?
      timeTo2x.reduce((sum, time) => sum + time, 0) / timeTo2x.length : null;

    return {
      efficiency,
      callCount: validCalls.length,
      metrics: {
        hitRate,
        wilsonScore,
        medianX,
        geoMeanX,
        avgTimeTo2x,
        totalScore,
        weightedEfficiency: efficiency
      }
    };
  }

  /**
   * Calculate Wilson score for hit rate confidence interval
   */
  calculateWilsonScore(p, n, z = 1.96) { // 95% confidence
    if (n === 0) return 0;

    const p_hat = p;
    const z_squared = z * z;
    const numerator = p_hat + (z_squared / (2 * n));
    const denominator = 1 + (z_squared / n);
    const center = numerator / denominator;

    const sqrt_term = Math.sqrt((p_hat * (1 - p_hat) / n) + (z_squared / (4 * n * n)));
    const half_width = z * sqrt_term / denominator;

    return center - half_width; // Lower bound for conservative estimate
  }

  /**
   * Apply volume factor (diminishing returns)
   */
  calculateVolumeFactor(callCount) {
    return callCount / (callCount + this.config.volumeK);
  }

  /**
   * Apply Bayesian shrinkage
   */
  applyBayesianShrinkage(userEfficiency, callCount, globalMean) {
    const k = this.config.bayesianK;
    return (callCount * userEfficiency + k * globalMean) / (callCount + k);
  }

  /**
   * Calculate final leaderboard score
   */
  calculateFinalScore(userEfficiency, callCount, globalMean) {
    // Apply Bayesian shrinkage
    const shrunkEfficiency = this.applyBayesianShrinkage(userEfficiency, callCount, globalMean);

    // Apply logistic transformation
    const logisticInput = this.config.logisticSteepness * (shrunkEfficiency - this.config.logisticCenter);
    const logisticScore = 1 / (1 + Math.exp(-logisticInput));

    // Apply volume factor
    const volumeFactor = this.calculateVolumeFactor(callCount);

    // Final score (0-100)
    return Math.round(100 * logisticScore * volumeFactor);
  }

  /**
   * Process user calls and calculate all metrics
   */
  processUserCalls(userId, calls, currentTokenData = {}) {
    console.log(`🏆 Processing ${calls.length} calls for user ${userId}`);
    
    // Calculate per-call metrics
    const callMetrics = calls
      .map(call => {
        // Handle both call.contractAddress and call.token.contractAddress formats
        const contractAddress = call.contractAddress || call.token?.contractAddress;
        const tokenData = currentTokenData[contractAddress] || {};
        console.log(`🏆 Call: ${call.token?.symbol || 'UNKNOWN'}, Contract: ${contractAddress}, CalledMC: ${call.calledMC || call.calledMc}, CurrentMC: ${tokenData?.mcap || tokenData?.marketCap || call.currentMC}`);
        return this.calculateCallMetrics(call, tokenData);
      })
      .filter(call => call !== null);

    if (callMetrics.length === 0) {
      return {
        userId,
        score: 0,
        rank: null,
        efficiency: 0,
        callCount: 0,
        metrics: {
          hitRate: 0,
          wilsonScore: 0,
          medianX: 0,
          geoMeanX: 0,
          avgTimeTo2x: null
        }
      };
    }

    // Calculate user efficiency
    const userStats = this.calculateUserEfficiency(callMetrics);

    // Calculate final score
    const finalScore = this.calculateFinalScore(
      userStats.efficiency,
      userStats.callCount,
      this.globalStats.meanEfficiency
    );

    return {
      userId,
      score: finalScore,
      rank: null, // Will be set when ranking all users
      efficiency: userStats.efficiency,
      callCount: userStats.callCount,
      metrics: userStats.metrics,
      callMetrics // For debugging/transparency
    };
  }

  /**
   * Update global statistics
   */
  updateGlobalStats(allUserStats) {
    const totalEfficiency = allUserStats.reduce((sum, user) => sum + user.efficiency, 0);
    const totalCalls = allUserStats.reduce((sum, user) => sum + user.callCount, 0);

    this.globalStats = {
      meanEfficiency: totalEfficiency / Math.max(1, allUserStats.length),
      totalCalls,
      totalUsers: allUserStats.length
    };

    return this.globalStats;
  }

  /**
   * Generate full leaderboard
   */
  generateLeaderboard(userCalls, currentTokenData = {}) {
    // Process all users
    const userStats = Object.entries(userCalls).map(([userId, calls]) =>
      this.processUserCalls(userId, calls, currentTokenData)
    );

    // Update global stats
    this.updateGlobalStats(userStats);

    // Recalculate scores with updated global mean
    userStats.forEach(user => {
      user.score = this.calculateFinalScore(
        user.efficiency,
        user.callCount,
        this.globalStats.meanEfficiency
      );
    });

    // Sort and rank
    userStats.sort((a, b) => b.score - a.score);
    userStats.forEach((user, index) => {
      user.rank = index + 1;
    });

    return {
      leaderboard: userStats,
      globalStats: this.globalStats,
      generatedAt: new Date().toISOString()
    };
  }
}
