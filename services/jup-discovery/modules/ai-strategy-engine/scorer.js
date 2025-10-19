/**
 * LST Scoring & Allocation - Deterministic Safety-First
 * 
 * This module handles deterministic scoring and allocation of LSTs with hard constraints.
 * All decisions are based on mathematical formulas, not LLM hallucinations.
 */

import { ScoringWeights, SafetyConstraints } from './types.js';
import { normalizeMetrics } from './metrics.js';

/**
 * Score a single LST based on weighted metrics
 * @param {Object} metrics - LST metrics object
 * @param {Object} weights - Scoring weights (optional)
 * @returns {number} Score (higher is better, -Infinity if rejected)
 */
export function scoreLst(metrics, weights = ScoringWeights) {
  // Hard rejection criteria
  if (metrics.safetyFlags?.rejected) {
    return -Infinity;
  }
  
  if (metrics.paused || metrics.recentSlash || !Number.isFinite(metrics.apr)) {
    return -Infinity;
  }
  
  if (metrics.tvlUSD < SafetyConstraints.minLiquidityUSD) {
    return -Infinity;
  }
  
  if (metrics.slippageBpsAtSize > SafetyConstraints.maxSlippageBps) {
    return -Infinity;
  }
  
  if (!metrics.verified) {
    return -Infinity;
  }
  
  // Normalize metrics for scoring (0-1 range)
  const normalizedApr = Math.max(0, Math.min(1, metrics.apr / 10)); // Cap at 10% APR
  const normalizedLiquidity = Math.log10(metrics.tvlUSD + 1) / 8; // Log scale, cap at 8
  const normalizedSlippage = Math.max(0, 1 - (metrics.slippageBpsAtSize / 100)); // Lower slippage = higher score
  const normalizedDiscount = Math.max(0, 1 - Math.abs(metrics.discountPct) / 5); // Lower discount = higher score
  const normalizedDecentralization = metrics.decentralization; // Already 0-1
  
  // Weighted score
  const score = 
    weights.apr * normalizedApr +
    weights.liquidity * normalizedLiquidity +
    weights.slippage * normalizedSlippage +
    weights.discount * normalizedDiscount +
    weights.decentralization * normalizedDecentralization;
  
  return score;
}

/**
 * Allocate weights across LSTs with safety constraints
 * @param {Object[]} metricsArray - Array of LST metrics
 * @param {number} maxAssets - Maximum number of assets
 * @param {number} capPerAsset - Maximum weight per asset
 * @param {number} minAssets - Minimum number of assets
 * @returns {Object} Allocation weights { symbol: percentage }
 */
export function allocateWeights(metricsArray, maxAssets = 5, capPerAsset = SafetyConstraints.maxPerAssetWeight, minAssets = SafetyConstraints.minAssets) {
  // Score and filter LSTs
  const scoredLsts = metricsArray
    .map(metrics => ({
      metrics,
      score: scoreLst(metrics)
    }))
    .filter(item => Number.isFinite(item.score))
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(minAssets, maxAssets));
  
  if (scoredLsts.length === 0) {
    throw new Error('No suitable LSTs found after applying safety constraints');
  }
  
  // Allocate weights
  let remainingWeight = 1.0;
  const weights = {};
  
  for (const { metrics } of scoredLsts) {
    if (remainingWeight <= 0.0001) break;
    
    const weight = Math.min(capPerAsset, remainingWeight);
    weights[metrics.symbol] = weight;
    remainingWeight -= weight;
  }
  
  // Ensure minimum diversification
  if (Object.keys(weights).length === 1 && scoredLsts.length > 1) {
    const firstSymbol = Object.keys(weights)[0];
    const splitWeight = weights[firstSymbol] / 2;
    weights[firstSymbol] = splitWeight;
    weights[scoredLsts[1].metrics.symbol] = splitWeight;
  }
  
  return weights;
}

/**
 * Compute portfolio metrics from allocation
 * @param {Object} weights - Allocation weights { symbol: percentage }
 * @param {Object[]} metricsArray - Array of LST metrics
 * @returns {Object} Portfolio metrics
 */
export function computePortfolioMetrics(weights, metricsArray) {
  const symbols = Object.keys(weights);
  const portfolioMetrics = {
    expectedYield: 0,
    riskScore: 0,
    diversification: 0,
    liquidityScore: 0,
    totalWeight: 0
  };
  
  let totalWeight = 0;
  
  for (const symbol of symbols) {
    const weight = weights[symbol];
    const metrics = metricsArray.find(m => m.symbol === symbol);
    
    if (!metrics) continue;
    
    portfolioMetrics.expectedYield += weight * metrics.apr;
    portfolioMetrics.riskScore += weight * (10 - metrics.decentralization * 10); // Convert to 0-10 scale
    portfolioMetrics.liquidityScore += weight * Math.log10(metrics.tvlUSD + 1);
    totalWeight += weight;
  }
  
  // Normalize by total weight
  if (totalWeight > 0) {
    portfolioMetrics.expectedYield /= totalWeight;
    portfolioMetrics.riskScore /= totalWeight;
    portfolioMetrics.liquidityScore /= totalWeight;
    portfolioMetrics.totalWeight = totalWeight;
  }
  
  // Compute diversification (Herfindahl-Hirschman Index)
  const weightsArray = Object.values(weights);
  const hhi = weightsArray.reduce((sum, w) => sum + (w * w), 0);
  portfolioMetrics.diversification = Math.max(0, 1 - hhi);
  
  return portfolioMetrics;
}

/**
 * Generate candidate portfolio with specific bias
 * @param {Object[]} metricsArray - Array of LST metrics
 * @param {string} bias - 'apr', 'balanced', 'discount'
 * @param {number} maxAssets - Maximum assets
 * @returns {Object} Candidate portfolio
 */
export function generateCandidatePortfolio(metricsArray, bias = 'apr', maxAssets = 5) {
  let adjustedMetrics = [...metricsArray];
  
  // Apply bias adjustments
  switch (bias) {
    case 'apr':
      // Base scoring (APR-biased)
      break;
      
    case 'balanced':
      // Boost liquidity and decentralization
      adjustedMetrics = adjustedMetrics.map(m => ({
        ...m,
        tvlUSD: m.tvlUSD * 1.2,
        decentralization: Math.min(1, m.decentralization * 1.1),
        apr: m.apr * 0.97 // Slight APR reduction for balance
      }));
      break;
      
    case 'discount':
      // Boost discount capture
      adjustedMetrics = adjustedMetrics.map(m => ({
        ...m,
        discountPct: m.discountPct * 1.5, // Amplify discount signals
        apr: m.apr * 1.02 // Slight APR boost
      }));
      break;
      
    default:
      throw new Error(`Unknown bias: ${bias}`);
  }
  
  // Generate allocation
  const weights = allocateWeights(adjustedMetrics, maxAssets);
  const portfolioMetrics = computePortfolioMetrics(weights, metricsArray);
  
  return {
    weights,
    ...portfolioMetrics,
    bias,
    assetCount: Object.keys(weights).length
  };
}

/**
 * Generate three candidate portfolios (A/B/C)
 * @param {Object[]} metricsArray - Array of LST metrics
 * @param {string} strategyType - 'basic' or 'advanced'
 * @returns {Object} Three candidate portfolios
 */
export function generateStrategyCandidates(metricsArray, strategyType = 'basic') {
  const maxAssets = strategyType === 'basic' 
    ? SafetyConstraints.maxAssetsBasic 
    : SafetyConstraints.maxAssetsAdvanced;
  
  const candidates = {
    A: generateCandidatePortfolio(metricsArray, 'apr', maxAssets),
    B: generateCandidatePortfolio(metricsArray, 'balanced', maxAssets),
    C: generateCandidatePortfolio(metricsArray, 'discount', maxAssets)
  };
  
  // Validate all candidates
  for (const [key, candidate] of Object.entries(candidates)) {
    if (candidate.assetCount < SafetyConstraints.minAssets) {
      console.warn(`Candidate ${key} has insufficient diversification: ${candidate.assetCount} < ${SafetyConstraints.minAssets}`);
    }
    
    if (candidate.totalWeight < 0.95) {
      console.warn(`Candidate ${key} has incomplete allocation: ${candidate.totalWeight} < 0.95`);
    }
  }
  
  return candidates;
}

export default {
  scoreLst,
  allocateWeights,
  computePortfolioMetrics,
  generateCandidatePortfolio,
  generateStrategyCandidates
};
