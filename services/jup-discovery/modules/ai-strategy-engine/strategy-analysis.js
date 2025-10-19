/**
 * Strategy Comparison & Analysis - Hybrid Approach
 * 
 * This module compares deterministic vs LLM candidates and provides insights
 * on which approach works better for different scenarios.
 */

import { SafetyConstraints } from './types.js';

/**
 * Compare all 6 candidates (3 deterministic + 3 LLM)
 * @param {Object} deterministicCandidates - Candidates A/B/C
 * @param {Object} llmCandidates - Candidates D/E/F
 * @param {Object[]} lstMetrics - LST metrics for analysis
 * @returns {Object} Comprehensive comparison analysis
 */
export function analyzeAllCandidates(deterministicCandidates, llmCandidates, lstMetrics) {
  console.log('📊 [Strategy Analysis] Analyzing all 6 candidates...');
  
  const analysis = {
    candidates: {},
    rankings: {},
    insights: {},
    recommendations: {}
  };
  
  // Combine all candidates
  const allCandidates = {
    ...deterministicCandidates,
    ...llmCandidates
  };
  
  // Analyze each candidate
  for (const [key, candidate] of Object.entries(allCandidates)) {
    analysis.candidates[key] = {
      ...candidate,
      analysis: analyzeCandidate(candidate, lstMetrics),
      source: candidate.source || (['A', 'B', 'C'].includes(key) ? 'deterministic' : 'llm')
    };
  }
  
  // Create rankings
  analysis.rankings = createRankings(allCandidates);
  
  // Generate insights
  analysis.insights = generateInsights(deterministicCandidates, llmCandidates);
  
  // Generate recommendations
  analysis.recommendations = generateRecommendations(analysis);
  
  console.log('✅ [Strategy Analysis] Analysis complete');
  return analysis;
}

/**
 * Analyze individual candidate
 */
function analyzeCandidate(candidate, lstMetrics) {
  const weights = candidate.weights;
  const symbols = Object.keys(weights);
  
  // Calculate metrics
  const metrics = {
    expectedYield: 0,
    riskScore: 0,
    liquidityScore: 0,
    decentralizationScore: 0,
    diversificationScore: 0,
    slippageScore: 0
  };
  
  let totalWeight = 0;
  
  for (const [symbol, weight] of Object.entries(weights)) {
    const lstMetric = lstMetrics.find(m => m.symbol === symbol);
    if (!lstMetric) continue;
    
    metrics.expectedYield += weight * lstMetric.apr;
    metrics.riskScore += weight * (10 - lstMetric.decentralization * 10);
    metrics.liquidityScore += weight * Math.log10(lstMetric.tvlUSD + 1);
    metrics.decentralizationScore += weight * lstMetric.decentralization;
    metrics.slippageScore += weight * (100 - lstMetric.slippageBpsAtSize);
    totalWeight += weight;
  }
  
  // Normalize by total weight
  if (totalWeight > 0) {
    Object.keys(metrics).forEach(key => {
      metrics[key] /= totalWeight;
    });
  }
  
  // Calculate diversification (Herfindahl-Hirschman Index)
  const weightsArray = Object.values(weights);
  const hhi = weightsArray.reduce((sum, w) => sum + (w * w), 0);
  metrics.diversificationScore = Math.max(0, 1 - hhi);
  
  // Calculate composite score
  metrics.compositeScore = calculateCompositeScore(metrics);
  
  return metrics;
}

/**
 * Calculate composite score for ranking
 */
function calculateCompositeScore(metrics) {
  const weights = {
    yield: 0.35,
    risk: 0.25,
    liquidity: 0.15,
    decentralization: 0.15,
    diversification: 0.10
  };
  
  return (
    weights.yield * (metrics.expectedYield / 10) + // Normalize to 0-1
    weights.risk * (1 - metrics.riskScore / 10) +   // Lower risk = higher score
    weights.liquidity * (metrics.liquidityScore / 8) + // Log scale
    weights.decentralization * metrics.decentralizationScore +
    weights.diversification * metrics.diversificationScore
  );
}

/**
 * Create rankings across different dimensions
 */
function createRankings(allCandidates) {
  const rankings = {
    byYield: [],
    byRisk: [],
    byLiquidity: [],
    byDecentralization: [],
    byDiversification: [],
    byComposite: []
  };
  
  // Sort by each metric
  const candidatesArray = Object.entries(allCandidates).map(([key, candidate]) => ({
    key,
    ...candidate
  }));
  
  rankings.byYield = candidatesArray
    .sort((a, b) => b.analysis.expectedYield - a.analysis.expectedYield)
    .map(c => ({ key: c.key, value: c.analysis.expectedYield }));
  
  rankings.byRisk = candidatesArray
    .sort((a, b) => a.analysis.riskScore - b.analysis.riskScore) // Lower risk = better
    .map(c => ({ key: c.key, value: c.analysis.riskScore }));
  
  rankings.byLiquidity = candidatesArray
    .sort((a, b) => b.analysis.liquidityScore - a.analysis.liquidityScore)
    .map(c => ({ key: c.key, value: c.analysis.liquidityScore }));
  
  rankings.byDecentralization = candidatesArray
    .sort((a, b) => b.analysis.decentralizationScore - a.analysis.decentralizationScore)
    .map(c => ({ key: c.key, value: c.analysis.decentralizationScore }));
  
  rankings.byDiversification = candidatesArray
    .sort((a, b) => b.analysis.diversificationScore - a.analysis.diversificationScore)
    .map(c => ({ key: c.key, value: c.analysis.diversificationScore }));
  
  rankings.byComposite = candidatesArray
    .sort((a, b) => b.analysis.compositeScore - a.analysis.compositeScore)
    .map(c => ({ key: c.key, value: c.analysis.compositeScore }));
  
  return rankings;
}

/**
 * Generate insights comparing deterministic vs LLM approaches
 */
function generateInsights(deterministicCandidates, llmCandidates) {
  const insights = {
    deterministicStrengths: [],
    llmStrengths: [],
    hybridOpportunities: [],
    riskAnalysis: {}
  };
  
  // Analyze deterministic strengths
  const deterministicYields = Object.values(deterministicCandidates).map(c => c.expectedYield);
  const avgDeterministicYield = deterministicYields.reduce((a, b) => a + b, 0) / deterministicYields.length;
  
  insights.deterministicStrengths.push({
    metric: 'Yield Optimization',
    description: `Deterministic approach averages ${avgDeterministicYield.toFixed(2)}% yield`,
    advantage: 'Mathematically optimized for maximum returns'
  });
  
  // Analyze LLM strengths
  const llmCandidatesArray = Object.values(llmCandidates).filter(c => c.source === 'llm');
  if (llmCandidatesArray.length > 0) {
    insights.llmStrengths.push({
      metric: 'Creative Diversification',
      description: 'LLM explores unique asset combinations',
      advantage: 'May discover overlooked opportunities'
    });
    
    insights.llmStrengths.push({
      metric: 'Market Insights',
      description: 'LLM considers market inefficiencies and emerging trends',
      advantage: 'Adapts to changing market conditions'
    });
  }
  
  // Identify hybrid opportunities
  insights.hybridOpportunities.push({
    opportunity: 'Yield + Creativity',
    description: 'Combine deterministic yield optimization with LLM creative allocation',
    potential: 'Best of both approaches'
  });
  
  // Risk analysis
  insights.riskAnalysis = {
    deterministicRisk: 'Lower - follows proven mathematical models',
    llmRisk: 'Higher - may include experimental allocations',
    recommendation: 'Use deterministic for conservative users, LLM for aggressive users'
  };
  
  return insights;
}

/**
 * Generate recommendations based on analysis
 */
function generateRecommendations(analysis) {
  const recommendations = {
    bestOverall: null,
    bestForYield: null,
    bestForRisk: null,
    bestForDiversification: null,
    hybridApproach: null
  };
  
  // Best overall (highest composite score)
  const bestOverall = analysis.rankings.byComposite[0];
  recommendations.bestOverall = {
    candidate: bestOverall.key,
    score: bestOverall.value,
    reasoning: 'Highest composite score across all metrics'
  };
  
  // Best for yield
  const bestForYield = analysis.rankings.byYield[0];
  recommendations.bestForYield = {
    candidate: bestForYield.key,
    yield: bestForYield.value,
    reasoning: 'Maximum expected yield'
  };
  
  // Best for risk (lowest risk score)
  const bestForRisk = analysis.rankings.byRisk[0];
  recommendations.bestForRisk = {
    candidate: bestForRisk.key,
    riskScore: bestForRisk.value,
    reasoning: 'Lowest risk profile'
  };
  
  // Best for diversification
  const bestForDiversification = analysis.rankings.byDiversification[0];
  recommendations.bestForDiversification = {
    candidate: bestForDiversification.key,
    diversification: bestForDiversification.value,
    reasoning: 'Highest diversification score'
  };
  
  // Hybrid approach recommendation
  const deterministicBest = analysis.rankings.byComposite.find(c => ['A', 'B', 'C'].includes(c.key));
  const llmBest = analysis.rankings.byComposite.find(c => ['D', 'E', 'F'].includes(c.key));
  
  if (deterministicBest && llmBest) {
    recommendations.hybridApproach = {
      deterministic: deterministicBest.key,
      llm: llmBest.key,
      reasoning: 'Combine deterministic reliability with LLM creativity',
      implementation: 'Use deterministic for core allocation, LLM for diversification'
    };
  }
  
  return recommendations;
}

/**
 * Generate final strategy selection with reasoning
 */
export function generateFinalSelection(analysis, userProfile) {
  const { rankings, recommendations } = analysis;
  
  // Determine user preference based on risk tolerance
  let selectedCandidate;
  let selectionReasoning;
  
  switch (userProfile.riskTolerance) {
    case 'conservative':
      selectedCandidate = recommendations.bestForRisk.candidate;
      selectionReasoning = 'Conservative user - selected lowest risk option';
      break;
      
    case 'aggressive':
      selectedCandidate = recommendations.bestForYield.candidate;
      selectionReasoning = 'Aggressive user - selected highest yield option';
      break;
      
    default: // moderate
      selectedCandidate = recommendations.bestOverall.candidate;
      selectionReasoning = 'Moderate user - selected best overall balance';
      break;
  }
  
  const selectedData = analysis.candidates[selectedCandidate];
  
  return {
    selectedCandidate,
    selectionReasoning,
    candidateData: selectedData,
    analysis: {
      source: selectedData.source,
      rankings: {
        overall: rankings.byComposite.findIndex(c => c.key === selectedCandidate) + 1,
        yield: rankings.byYield.findIndex(c => c.key === selectedCandidate) + 1,
        risk: rankings.byRisk.findIndex(c => c.key === selectedCandidate) + 1
      },
      metrics: selectedData.analysis
    },
    alternatives: {
      deterministic: recommendations.bestOverall.candidate !== selectedCandidate ? recommendations.bestOverall : null,
      llm: selectedData.source === 'deterministic' ? recommendations.hybridApproach?.llm : null
    }
  };
}

export default {
  analyzeAllCandidates,
  generateFinalSelection
};
