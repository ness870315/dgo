/**
 * AI Strategy Selection - LLM Explanation Only
 * 
 * This module handles LLM-based selection and explanation of deterministic candidates.
 * The LLM NEVER invents numbers, addresses, or exact weights - only selects and explains.
 */

import { StrategyPick } from './types.js';

/**
 * Build prompt for LLM strategy selection
 * @param {Object} userProfile - User profile data
 * @param {Object} candidates - Three candidate portfolios (A/B/C)
 * @param {Object} metricsSummary - Summary of available metrics
 * @returns {string} Formatted prompt
 */
export function buildStrategySelectionPrompt(userProfile, candidates, metricsSummary) {
  return `You are an LST portfolio assistant, expert in finance and crypto, a Solana degen. 

Choose ONE candidate (A, B, or C) based on the user's profile and risk tolerance. 
Do NOT change any weights, percentages, or numbers. Only select and explain.

USER PROFILE:
- Wallet: ${userProfile.walletAddress}
- Total Value: ${userProfile.totalValueSOL} SOL
- Current Yield: ${userProfile.currentYield}%
- Risk Tolerance: ${userProfile.riskTolerance}
- Strategy Type: ${userProfile.strategyType}

METRICS SUMMARY:
- Available LSTs: ${metricsSummary.totalLsts}
- Average APR: ${metricsSummary.avgApr}%
- Median TVL: $${metricsSummary.medianTvl}
- Average Decentralization: ${metricsSummary.avgDecentralization}

CANDIDATES:

A (APR-Biased Strategy):
- Expected Yield: ${candidates.A.expectedYield.toFixed(2)}%
- Risk Score: ${candidates.A.riskScore.toFixed(1)}/10
- Diversification: ${candidates.A.diversification.toFixed(2)}
- Assets: ${candidates.A.assetCount}
- Allocation: ${JSON.stringify(candidates.A.weights, null, 2)}

B (Balanced Strategy):
- Expected Yield: ${candidates.B.expectedYield.toFixed(2)}%
- Risk Score: ${candidates.B.riskScore.toFixed(1)}/10
- Diversification: ${candidates.B.diversification.toFixed(2)}
- Assets: ${candidates.B.assetCount}
- Allocation: ${JSON.stringify(candidates.B.weights, null, 2)}

C (Discount-Capture Strategy):
- Expected Yield: ${candidates.C.expectedYield.toFixed(2)}%
- Risk Score: ${candidates.C.riskScore.toFixed(1)}/10
- Diversification: ${candidates.C.diversification.toFixed(2)}
- Assets: ${candidates.C.assetCount}
- Allocation: ${JSON.stringify(candidates.C.weights, null, 2)}

INSTRUCTIONS:
1. Choose the candidate that best fits the user's risk tolerance and strategy type
2. Write a compelling title and summary explaining your choice
3. List the key risks the user should be aware of
4. Do NOT modify any numbers, weights, or percentages
5. Focus on the trade-offs between yield, risk, and diversification

RESPONSE FORMAT (JSON only):
{
  "pick": "B",
  "title": "Balanced Liquidity Strategy",
  "summary": "This strategy balances yield optimization with liquidity depth and validator decentralization. It provides strong diversification across ${candidates.B.assetCount} LSTs while maintaining competitive returns.",
  "risks": [
    "Validator slashing risk across multiple pools",
    "Liquidity risk during high volatility periods",
    "Smart contract risk in LST protocols"
  ]
}`;
}

/**
 * Parse LLM response and validate selection
 * @param {string} llmResponse - Raw LLM response
 * @param {Object} candidates - Available candidates
 * @returns {Object} Parsed and validated selection
 */
export function parseLLMSelection(llmResponse, candidates) {
  try {
    // Extract JSON from response
    const jsonMatch = llmResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in LLM response');
    }
    
    const selection = JSON.parse(jsonMatch[0]);
    
    // Validate selection
    if (!['A', 'B', 'C'].includes(selection.pick)) {
      throw new Error(`Invalid pick: ${selection.pick}. Must be A, B, or C`);
    }
    
    if (!selection.title || typeof selection.title !== 'string') {
      throw new Error('Missing or invalid title');
    }
    
    if (!selection.summary || typeof selection.summary !== 'string') {
      throw new Error('Missing or invalid summary');
    }
    
    if (!Array.isArray(selection.risks)) {
      throw new Error('Risks must be an array');
    }
    
    // Validate that the selected candidate exists
    const selectedCandidate = candidates[selection.pick];
    if (!selectedCandidate) {
      throw new Error(`Selected candidate ${selection.pick} not found`);
    }
    
    return {
      pick: selection.pick,
      title: selection.title.trim(),
      summary: selection.summary.trim(),
      risks: selection.risks.map(risk => risk.trim()).filter(risk => risk.length > 0)
    };
    
  } catch (error) {
    console.error('LLM response parsing failed:', error.message);
    console.error('Raw response:', llmResponse);
    
    // Fallback to balanced strategy
    return {
      pick: 'B',
      title: 'Balanced Strategy',
      summary: 'A balanced approach optimizing for yield while maintaining diversification and liquidity depth.',
      risks: [
        'Validator slashing risk',
        'Liquidity risk',
        'Smart contract risk'
      ]
    };
  }
}

/**
 * Call OpenAI API for strategy selection
 * @param {string} prompt - Formatted prompt
 * @param {string} apiKey - OpenAI API key
 * @param {string} baseUrl - OpenAI base URL
 * @param {string} model - Model to use
 * @returns {Promise<string>} LLM response
 */
export async function callOpenAIForSelection(prompt, apiKey, baseUrl = 'https://api.openai.com/v1', model = 'gpt-4') {
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: 'You are an expert DeFi strategist. Always respond with valid JSON only. Never modify numbers or weights.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3, // Lower temperature for more consistent results
        max_tokens: 500,
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
 * Generate strategy selection using LLM
 * @param {Object} userProfile - User profile
 * @param {Object} candidates - Three candidate portfolios
 * @param {Object} metricsSummary - Metrics summary
 * @param {Object} openaiConfig - OpenAI configuration
 * @returns {Promise<Object>} Strategy selection result
 */
export async function generateStrategySelection(userProfile, candidates, metricsSummary, openaiConfig) {
  try {
    console.log('🤖 [AI Strategy] Generating LLM selection...');
    
    // Build prompt
    const prompt = buildStrategySelectionPrompt(userProfile, candidates, metricsSummary);
    
    // Call OpenAI
    const llmResponse = await callOpenAIForSelection(
      prompt,
      openaiConfig.apiKey,
      openaiConfig.baseUrl,
      openaiConfig.model
    );
    
    // Parse and validate response
    const selection = parseLLMSelection(llmResponse, candidates);
    
    console.log(`✅ [AI Strategy] LLM selected candidate ${selection.pick}`);
    console.log(`  - Title: ${selection.title}`);
    console.log(`  - Risks: ${selection.risks.length}`);
    
    return selection;
    
  } catch (error) {
    console.error('❌ [AI Strategy] LLM selection failed:', error.message);
    
    // Fallback to balanced strategy
    return {
      pick: 'B',
      title: 'Balanced Strategy',
      summary: 'A balanced approach optimizing for yield while maintaining diversification and liquidity depth.',
      risks: [
        'Validator slashing risk',
        'Liquidity risk',
        'Smart contract risk'
      ]
    };
  }
}

export default {
  buildStrategySelectionPrompt,
  parseLLMSelection,
  callOpenAIForSelection,
  generateStrategySelection
};
