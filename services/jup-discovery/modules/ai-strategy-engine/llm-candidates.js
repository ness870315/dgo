/**
 * LLM Candidate Generation - Phase 1.5
 * 
 * This module generates LST allocation candidates using LLM reasoning
 * while enforcing safety guards. We compare LLM vs deterministic approaches.
 */

import { SafetyConstraints } from './types.js';
import { validateCandidateAgainstGuards } from './scorer.js';

/**
 * Generate LLM-based candidate portfolios
 * @param {Object[]} lstMetrics - Array of LST metrics
 * @param {Object} userProfile - User profile data
 * @param {Object} strategyType - Strategy type configuration
 * @param {Object} openaiConfig - OpenAI configuration
 * @returns {Promise<Object>} Three LLM-generated candidates (D/E/F)
 */
export async function generateLLMCandidates(lstMetrics, userProfile, strategyType, openaiConfig) {
  try {
    console.log('🤖 [LLM Candidates] Generating LLM-based candidates...');
    
    // Build comprehensive prompt for LLM candidate generation
    const prompt = buildLLMCandidatePrompt(lstMetrics, userProfile, strategyType);
    
    // Call OpenAI for candidate generation
    const llmResponse = await callOpenAIForCandidates(prompt, openaiConfig);
    
    // Parse and validate LLM response
    const llmCandidates = parseLLMCandidates(llmResponse, lstMetrics);
    
    // Validate each candidate against safety guards
    const validatedCandidates = {};
    for (const [key, candidate] of Object.entries(llmCandidates)) {
      const validation = validateCandidateAgainstGuards(candidate, lstMetrics, userProfile);
      if (validation.valid) {
        validatedCandidates[key] = {
          ...candidate,
          validation,
          source: 'llm'
        };
        console.log(`✅ [LLM Candidates] Candidate ${key} passed safety validation`);
      } else {
        console.log(`⚠️ [LLM Candidates] Candidate ${key} failed validation: ${validation.reason}`);
        // Create fallback candidate using deterministic approach
        validatedCandidates[key] = createFallbackCandidate(key, lstMetrics, strategyType);
      }
    }
    
    console.log(`✅ [LLM Candidates] Generated ${Object.keys(validatedCandidates).length} validated candidates`);
    return validatedCandidates;
    
  } catch (error) {
    console.error('❌ [LLM Candidates] LLM candidate generation failed:', error.message);
    
    // Fallback to deterministic candidates
    console.log('🔄 [LLM Candidates] Falling back to deterministic candidates');
    return createDeterministicFallback(lstMetrics, strategyType);
  }
}

/**
 * Build prompt for LLM candidate generation
 */
function buildLLMCandidatePrompt(lstMetrics, userProfile, strategyType) {
  const maxAssets = strategyType === 'basic' ? 3 : 5;
  
  return `You are an expert DeFi strategist specializing in Solana Liquid Staking Token optimization.

TASK: Generate 3 different LST allocation strategies (D, E, F) for the user.

USER PROFILE:
- Wallet: ${userProfile.walletAddress}
- Total Value: ${userProfile.totalValueSOL} SOL
- Current Yield: ${userProfile.currentYield}%
- Risk Tolerance: ${userProfile.riskTolerance}
- Strategy Type: ${strategyType}

AVAILABLE LSTs (with metrics):
${lstMetrics.map(lst => 
  `- ${lst.symbol}: ${lst.apr.toFixed(2)}% APR, TVL: $${lst.tvlUSD.toLocaleString()}, Decentralization: ${lst.decentralization.toFixed(2)}, Slippage: ${lst.slippageBpsAtSize.toFixed(1)}bps`
).join('\n')}

SAFETY CONSTRAINTS (MUST FOLLOW):
- Maximum ${maxAssets} assets
- Per-asset weight ≤ 45%
- Minimum 2 assets
- Total allocation = 100%
- Only use LSTs with TVL ≥ $250k
- Only use LSTs with slippage ≤ 50bps
- Only use verified LSTs

STRATEGY REQUIREMENTS:
- D: Focus on emerging LSTs with high growth potential
- E: Emphasize validator decentralization and risk distribution  
- F: Target market inefficiencies and arbitrage opportunities

RESPONSE FORMAT (JSON only):
{
  "D": {
    "name": "Emerging Growth Strategy",
    "weights": {
      "jitoSOL": 0.40,
      "bSOL": 0.35,
      "marinadeSOL": 0.25
    },
    "reasoning": "Focus on emerging LSTs with high growth potential and innovative validator models"
  },
  "E": {
    "name": "Decentralization-First Strategy", 
    "weights": {
      "mSOL": 0.45,
      "lidoSOL": 0.30,
      "jitoSOL": 0.25
    },
    "reasoning": "Prioritize validator decentralization and risk distribution across multiple protocols"
  },
  "F": {
    "name": "Market Efficiency Strategy",
    "weights": {
      "jitoSOL": 0.50,
      "bSOL": 0.30,
      "mSOL": 0.20
    },
    "reasoning": "Target market inefficiencies and arbitrage opportunities in LST pricing"
  }
}

CRITICAL: 
- Use exact symbols from the available LSTs list
- Ensure all weights sum to 1.0
- Follow all safety constraints
- Provide unique reasoning for each strategy
- Do NOT exceed ${maxAssets} assets per strategy`;
}

/**
 * Call OpenAI for candidate generation
 */
async function callOpenAIForCandidates(prompt, openaiConfig) {
  try {
    const response = await fetch(`${openaiConfig.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiConfig.apiKey}`
      },
      body: JSON.stringify({
        model: openaiConfig.model,
        messages: [
          {
            role: 'system',
            content: 'You are an expert DeFi strategist. Always respond with valid JSON only. Follow all safety constraints strictly.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.4, // Slightly higher for creativity
        max_tokens: 800,
        top_p: 0.9
      })
    });
    
    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (!data.choices || data.choices.length === 0) {
      throw new Error('No choices in OpenAI response');
    }
    
    return data.choices[0].message.content;
    
  } catch (error) {
    console.error('OpenAI API call failed:', error.message);
    throw error;
  }
}

/**
 * Parse LLM response and validate structure
 */
function parseLLMCandidates(llmResponse, lstMetrics) {
  try {
    // Extract JSON from response
    const jsonMatch = llmResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in LLM response');
    }
    
    const candidates = JSON.parse(jsonMatch[0]);
    
    // Validate structure
    const requiredKeys = ['D', 'E', 'F'];
    for (const key of requiredKeys) {
      if (!candidates[key]) {
        throw new Error(`Missing candidate ${key}`);
      }
      
      const candidate = candidates[key];
      if (!candidate.weights || !candidate.name || !candidate.reasoning) {
        throw new Error(`Invalid structure for candidate ${key}`);
      }
      
      // Validate weights sum to 1.0
      const totalWeight = Object.values(candidate.weights).reduce((sum, w) => sum + w, 0);
      if (Math.abs(totalWeight - 1.0) > 0.01) {
        throw new Error(`Candidate ${key} weights don't sum to 1.0: ${totalWeight}`);
      }
      
      // Validate all symbols exist in metrics
      for (const symbol of Object.keys(candidate.weights)) {
        if (!lstMetrics.find(m => m.symbol === symbol)) {
          throw new Error(`Candidate ${key} uses unknown symbol: ${symbol}`);
        }
      }
    }
    
    return candidates;
    
  } catch (error) {
    console.error('LLM response parsing failed:', error.message);
    console.error('Raw response:', llmResponse);
    throw error;
  }
}

/**
 * Validate candidate against safety guards
 */
export function validateCandidateAgainstGuards(candidate, lstMetrics, userProfile) {
  const validation = {
    valid: true,
    reason: null,
    warnings: []
  };
  
  const weights = candidate.weights;
  const symbols = Object.keys(weights);
  
  // Check minimum assets
  if (symbols.length < SafetyConstraints.minAssets) {
    validation.valid = false;
    validation.reason = `Insufficient diversification: ${symbols.length} < ${SafetyConstraints.minAssets}`;
    return validation;
  }
  
  // Check per-asset weight cap
  for (const [symbol, weight] of Object.entries(weights)) {
    if (weight > SafetyConstraints.maxPerAssetWeight) {
      validation.valid = false;
      validation.reason = `${symbol} weight ${(weight * 100).toFixed(1)}% exceeds cap ${(SafetyConstraints.maxPerAssetWeight * 100).toFixed(1)}%`;
      return validation;
    }
  }
  
  // Check LST safety constraints
  for (const symbol of symbols) {
    const metrics = lstMetrics.find(m => m.symbol === symbol);
    if (!metrics) {
      validation.valid = false;
      validation.reason = `Unknown LST: ${symbol}`;
      return validation;
    }
    
    if (metrics.safetyFlags?.rejected) {
      validation.valid = false;
      validation.reason = `${symbol} failed safety checks: ${metrics.safetyFlags.reasons.join(', ')}`;
      return validation;
    }
  }
  
  // Check total weight
  const totalWeight = Object.values(weights).reduce((sum, w) => sum + w, 0);
  if (Math.abs(totalWeight - 1.0) > 0.01) {
    validation.valid = false;
    validation.reason = `Total weight ${(totalWeight * 100).toFixed(1)}% doesn't equal 100%`;
    return validation;
  }
  
  return validation;
}

/**
 * Create fallback candidate using deterministic approach
 */
function createFallbackCandidate(key, lstMetrics, strategyType) {
  console.log(`🔄 [LLM Candidates] Creating deterministic fallback for candidate ${key}`);
  
  // Use deterministic scoring for fallback
  const { generateCandidatePortfolio } = require('./scorer.js');
  
  const biasMap = {
    D: 'apr',      // Emerging growth → APR focus
    E: 'balanced', // Decentralization → balanced
    F: 'discount'  // Market efficiency → discount capture
  };
  
  const bias = biasMap[key] || 'balanced';
  const maxAssets = strategyType === 'basic' ? 3 : 5;
  
  return {
    ...generateCandidatePortfolio(lstMetrics, bias, maxAssets),
    name: `Deterministic ${bias} Strategy`,
    reasoning: `Fallback to deterministic ${bias} approach`,
    source: 'deterministic_fallback',
    validation: { valid: true, reason: null }
  };
}

/**
 * Create deterministic fallback for all candidates
 */
function createDeterministicFallback(lstMetrics, strategyType) {
  const { generateStrategyCandidates } = require('./scorer.js');
  const deterministicCandidates = generateStrategyCandidates(lstMetrics, strategyType);
  
  return {
    D: { ...deterministicCandidates.A, source: 'deterministic_fallback' },
    E: { ...deterministicCandidates.B, source: 'deterministic_fallback' },
    F: { ...deterministicCandidates.C, source: 'deterministic_fallback' }
  };
}

/**
 * Compare LLM vs deterministic candidates
 */
export function compareCandidates(llmCandidates, deterministicCandidates) {
  const comparison = {
    llmInsights: [],
    deterministicAdvantages: [],
    hybridRecommendations: []
  };
  
  // Analyze LLM insights
  for (const [key, candidate] of Object.entries(llmCandidates)) {
    if (candidate.source === 'llm') {
      comparison.llmInsights.push({
        candidate: key,
        name: candidate.name,
        reasoning: candidate.reasoning,
        uniqueAssets: Object.keys(candidate.weights).length,
        avgWeight: Object.values(candidate.weights).reduce((a, b) => a + b, 0) / Object.keys(candidate.weights).length
      });
    }
  }
  
  // Analyze deterministic advantages
  for (const [key, candidate] of Object.entries(deterministicCandidates)) {
    comparison.deterministicAdvantages.push({
      candidate: key,
      expectedYield: candidate.expectedYield,
      riskScore: candidate.riskScore,
      diversification: candidate.diversification
    });
  }
  
  // Generate hybrid recommendations
  comparison.hybridRecommendations = generateHybridRecommendations(llmCandidates, deterministicCandidates);
  
  return comparison;
}

/**
 * Generate hybrid recommendations combining both approaches
 */
function generateHybridRecommendations(llmCandidates, deterministicCandidates) {
  const recommendations = [];
  
  // Find best yield from deterministic
  const bestYield = Math.max(...Object.values(deterministicCandidates).map(c => c.expectedYield));
  
  // Find most creative LLM approach
  const mostCreative = Object.values(llmCandidates).find(c => c.source === 'llm');
  
  if (mostCreative && bestYield) {
    recommendations.push({
      type: 'yield_optimization',
      description: 'Use deterministic approach for maximum yield',
      expectedYield: bestYield
    });
    
    recommendations.push({
      type: 'creative_diversification',
      description: 'Consider LLM approach for unique asset combinations',
      reasoning: mostCreative.reasoning
    });
  }
  
  return recommendations;
}

export default {
  generateLLMCandidates,
  validateCandidateAgainstGuards,
  compareCandidates
};
