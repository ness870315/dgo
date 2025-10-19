/**
 * LST Metrics Computation - Deterministic Safety-First
 * 
 * This module handles deterministic computation of LST metrics with hard safety rails.
 * All calculations are deterministic and verifiable.
 */

import { SafetyConstraints } from './types.js';

/**
 * Compute rolling APR from exchange rate data
 * @param {number} exchangeRateNow - Current exchange rate
 * @param {number} exchangeRate30dAgo - Exchange rate 30 days ago
 * @returns {number} Annualized percentage rate
 */
export function rollingApr(exchangeRateNow, exchangeRate30dAgo) {
  if (!exchangeRateNow || !exchangeRate30dAgo || exchangeRate30dAgo <= 0) {
    return 0;
  }
  
  const growth = (exchangeRateNow / exchangeRate30dAgo) - 1;
  return growth * 12 * 100; // Annualized percentage
}

/**
 * Compute decentralization score using Herfindahl-Hirschman Index
 * @param {number[]} validatorWeights - Array of validator weights (0-1)
 * @returns {number} Decentralization score (0-1, higher is better)
 */
export function decentralizationScore(validatorWeights) {
  if (!validatorWeights || validatorWeights.length === 0) {
    return 0;
  }
  
  // Herfindahl-Hirschman Index: sum of squared weights
  const hhi = validatorWeights.reduce((sum, weight) => sum + (weight * weight), 0);
  
  // Convert to decentralization score (lower HHI = higher decentralization)
  return Math.max(0, 1 - hhi);
}

/**
 * Compute slippage for a given trade size
 * @param {number} tradeSizeSOL - Trade size in SOL
 * @param {number} poolLiquidityUSD - Pool liquidity in USD
 * @param {number} baseSlippageBps - Base slippage in basis points
 * @returns {number} Estimated slippage in basis points
 */
export function computeSlippageBps(tradeSizeSOL, poolLiquidityUSD, baseSlippageBps = 10) {
  if (!tradeSizeSOL || !poolLiquidityUSD || poolLiquidityUSD <= 0) {
    return Infinity; // Reject if no liquidity
  }
  
  // Simple slippage model: base slippage + size impact
  const sizeImpact = Math.log10(tradeSizeSOL * 200) / Math.log10(poolLiquidityUSD / 1000);
  return baseSlippageBps + (sizeImpact * 5);
}

/**
 * Compute discount/premium percentage vs SOL
 * @param {number} lstPriceSOL - LST price in SOL
 * @param {number} solPriceSOL - SOL price (should be 1.0)
 * @returns {number} Discount percentage (negative = discount, positive = premium)
 */
export function computeDiscountPct(lstPriceSOL, solPriceSOL = 1.0) {
  if (!lstPriceSOL || !solPriceSOL || solPriceSOL <= 0) {
    return 0;
  }
  
  return ((lstPriceSOL - solPriceSOL) / solPriceSOL) * 100;
}

/**
 * Apply safety rails to LST metrics
 * @param {Object} metrics - LST metrics object
 * @param {number} userTradeSizeSOL - User's intended trade size
 * @returns {Object} Filtered metrics with safety flags
 */
export function applySafetyRails(metrics, userTradeSizeSOL) {
  const {
    minLiquidityUSD,
    maxSlippageBps,
    maxStalenessMinutes
  } = SafetyConstraints;
  
  const now = Date.now();
  const stalenessMs = now - metrics.asOfMs;
  const stalenessMinutes = stalenessMs / (1000 * 60);
  
  // Hard safety rails
  const safetyFlags = {
    rejected: false,
    reasons: []
  };
  
  // Check liquidity
  if (metrics.tvlUSD < minLiquidityUSD) {
    safetyFlags.rejected = true;
    safetyFlags.reasons.push(`Insufficient liquidity: $${metrics.tvlUSD.toLocaleString()} < $${minLiquidityUSD.toLocaleString()}`);
  }
  
  // Check slippage
  const slippageBps = computeSlippageBps(userTradeSizeSOL, metrics.tvlUSD);
  if (slippageBps > maxSlippageBps) {
    safetyFlags.rejected = true;
    safetyFlags.reasons.push(`Excessive slippage: ${slippageBps.toFixed(1)}bps > ${maxSlippageBps}bps`);
  }
  
  // Check staleness
  if (stalenessMinutes > maxStalenessMinutes) {
    safetyFlags.rejected = true;
    safetyFlags.reasons.push(`Stale data: ${stalenessMinutes.toFixed(1)}min > ${maxStalenessMinutes}min`);
  }
  
  // Check pool status
  if (metrics.paused) {
    safetyFlags.rejected = true;
    safetyFlags.reasons.push('Pool is paused');
  }
  
  // Check slashing
  if (metrics.recentSlash) {
    safetyFlags.rejected = true;
    safetyFlags.reasons.push('Recent slashing events detected');
  }
  
  // Check verification
  if (!metrics.verified) {
    safetyFlags.rejected = true;
    safetyFlags.reasons.push('Unverified LST');
  }
  
  // Check APR validity
  if (!Number.isFinite(metrics.apr) || metrics.apr < 0 || metrics.apr > 50) {
    safetyFlags.rejected = true;
    safetyFlags.reasons.push(`Invalid APR: ${metrics.apr}`);
  }
  
  return {
    ...metrics,
    slippageBpsAtSize: slippageBps,
    stalenessMinutes,
    safetyFlags
  };
}

/**
 * Normalize metrics for scoring (min-max normalization)
 * @param {Object[]} metricsArray - Array of metrics objects
 * @param {string} field - Field to normalize
 * @returns {Object[]} Metrics with normalized values
 */
export function normalizeMetrics(metricsArray, field) {
  if (!metricsArray || metricsArray.length === 0) {
    return [];
  }
  
  const values = metricsArray.map(m => m[field]).filter(v => Number.isFinite(v));
  if (values.length === 0) {
    return metricsArray;
  }
  
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  
  if (range === 0) {
    return metricsArray.map(m => ({ ...m, [`${field}_normalized`]: 0.5 }));
  }
  
  return metricsArray.map(m => ({
    ...m,
    [`${field}_normalized`]: Number.isFinite(m[field]) ? (m[field] - min) / range : 0
  }));
}

/**
 * Compute comprehensive LST metrics with safety validation
 * @param {Object} lstInfo - Basic LST information
 * @param {Object} marketData - Market data (prices, liquidity, etc.)
 * @param {Object} validatorData - Validator distribution data
 * @param {number} userTradeSizeSOL - User's trade size for slippage calculation
 * @returns {Object} Complete metrics with safety flags
 */
export function computeLstMetrics(lstInfo, marketData, validatorData, userTradeSizeSOL) {
  const {
    symbol,
    mint,
    verified,
    stakePoolProgram
  } = lstInfo;
  
  const {
    currentPrice,
    price30dAgo,
    tvlUSD,
    paused,
    recentSlash
  } = marketData;
  
  const {
    validatorWeights = []
  } = validatorData;
  
  // Compute core metrics
  const apr = rollingApr(currentPrice, price30dAgo);
  const decentralization = decentralizationScore(validatorWeights);
  const discountPct = computeDiscountPct(currentPrice);
  
  const baseMetrics = {
    symbol,
    mint,
    apr,
    tvlUSD,
    discountPct,
    decentralization,
    paused,
    recentSlash,
    verified,
    asOfMs: Date.now()
  };
  
  // Apply safety rails
  return applySafetyRails(baseMetrics, userTradeSizeSOL);
}

export default {
  rollingApr,
  decentralizationScore,
  computeSlippageBps,
  computeDiscountPct,
  applySafetyRails,
  normalizeMetrics,
  computeLstMetrics
};
