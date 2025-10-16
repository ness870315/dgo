/**
 * Enhanced KOL Performance Predictor with GPT-4 Turbo Integration
 * 
 * Combines traditional ML with LLM insights for:
 * - Enhanced sentiment analysis
 * - Natural language explanations
 * - Context-aware predictions
 * - Human-readable recommendations
 */

import KOLPerformancePredictor from './KOLPerformancePredictor.js';
import OpenAIService from '../openaiService.js';

class EnhancedKOLPerformancePredictor extends KOLPerformancePredictor {
  constructor() {
    super();
    this.openaiService = new OpenAIService();
    this.llmModel = 'gpt-4-turbo'; // Best balance of cost and performance
    this.maxTokens = 500; // Keep responses concise
    this.temperature = 0.3; // Low temperature for consistent, factual analysis
  }

  /**
   * Enhanced prediction with LLM insights
   * @param {Object} kolData - KOL historical data
   * @returns {Object} Enhanced prediction results
   */
  async predict(kolData) {
    try {
      console.log(`🧠 [ENHANCED KOL PREDICTOR] Getting LLM-enhanced prediction for @${kolData.handle}`);
      
      // Get traditional ML prediction
      const traditionalPrediction = await super.predict(kolData);
      
      // Enhance with LLM analysis
      const llmEnhancement = await this.getLLMInsights(kolData, traditionalPrediction);
      
      // Combine results
      const enhancedPrediction = {
        ...traditionalPrediction,
        llmInsights: llmEnhancement,
        enhancedRecommendations: this.generateEnhancedRecommendations(traditionalPrediction, llmEnhancement),
        marketContext: llmEnhancement.marketContext,
        riskAnalysis: llmEnhancement.riskAnalysis
      };
      
      console.log(`✅ [ENHANCED KOL PREDICTOR] LLM enhancement complete for @${kolData.handle}`);
      
      return enhancedPrediction;
      
    } catch (error) {
      console.error(`❌ [ENHANCED KOL PREDICTOR] Error enhancing prediction for @${kolData.handle}:`, error.message);
      
      // Fallback to traditional prediction if LLM fails
      return await super.predict(kolData);
    }
  }

  /**
   * Get LLM insights for KOL prediction
   */
  async getLLMInsights(kolData, traditionalPrediction) {
    try {
      const prompt = this.buildAnalysisPrompt(kolData, traditionalPrediction);
      
      const response = await this.openaiService.generateCompletion(prompt, {
        model: this.llmModel,
        temperature: this.temperature,
        maxTokens: this.maxTokens,
        useCache: true,
        cacheExpiry: 1800000 // 30 minutes cache
      });
      
      return this.parseLLMResponse(response);
      
    } catch (error) {
      console.error('❌ [ENHANCED KOL PREDICTOR] LLM analysis failed:', error.message);
      return this.createFallbackInsights();
    }
  }

  /**
   * Build comprehensive analysis prompt
   */
  buildAnalysisPrompt(kolData, traditionalPrediction) {
    return `You are a crypto market analyst specializing in KOL (Key Opinion Leader) performance prediction. Analyze this KOL's data and provide insights:

KOL DATA:
- Handle: @${kolData.handle}
- Current Alpha Score: ${traditionalPrediction.predictions.alphaScore30d}/100
- Predicted 30d Alpha: ${traditionalPrediction.predictions.alphaScore30d}
- Predicted 90d Alpha: ${traditionalPrediction.predictions.alphaScore90d}
- Hit Rate 30d: ${(traditionalPrediction.predictions.hitRate30d * 100).toFixed(1)}%
- Hit Rate 90d: ${(traditionalPrediction.predictions.hitRate90d * 100).toFixed(1)}%
- Avg Lead Time: ${traditionalPrediction.predictions.avgLeadTime30d} minutes
- Followers: ${kolData.followers?.toLocaleString() || 'Unknown'}
- Total Posts: ${kolData.total_posts || 0}
- Crypto Focus: ${traditionalPrediction.predictions.cryptoFocusTrend}
- Engagement Trend: ${traditionalPrediction.predictions.engagementTrend}
- Confidence: ${(traditionalPrediction.confidence * 100).toFixed(1)}%

KEY FACTORS: ${traditionalPrediction.keyFactors.join(', ')}
RISK FACTORS: ${traditionalPrediction.riskFactors.join(', ')}

Provide analysis in this JSON format:
{
  "naturalLanguageExplanation": "Clear explanation of the prediction in 2-3 sentences",
  "marketContext": "Current market conditions affecting this KOL",
  "riskAnalysis": {
    "primaryRisks": ["risk1", "risk2"],
    "riskLevel": "low|medium|high",
    "mitigationStrategies": ["strategy1", "strategy2"]
  },
  "tradingImplications": {
    "shortTerm": "1-7 days outlook",
    "mediumTerm": "1-4 weeks outlook", 
    "keySignals": ["signal1", "signal2"]
  },
  "competitiveAdvantage": "What makes this KOL unique or valuable",
  "marketOpportunity": "Potential opportunities this KOL represents"
}

Focus on:
1. Practical trading implications
2. Risk assessment with specific factors
3. Market context and timing
4. Actionable insights for traders

Keep responses concise and data-driven.`;
  }

  /**
   * Parse LLM response into structured data
   */
  parseLLMResponse(response) {
    try {
      // Extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          naturalLanguageExplanation: parsed.naturalLanguageExplanation || 'Analysis completed',
          marketContext: parsed.marketContext || 'Standard market conditions',
          riskAnalysis: parsed.riskAnalysis || {
            primaryRisks: ['Unknown risks'],
            riskLevel: 'medium',
            mitigationStrategies: ['Monitor closely']
          },
          tradingImplications: parsed.tradingImplications || {
            shortTerm: 'Monitor for signals',
            mediumTerm: 'Evaluate performance',
            keySignals: ['Volume spikes', 'Price correlation']
          },
          competitiveAdvantage: parsed.competitiveAdvantage || 'Standard KOL profile',
          marketOpportunity: parsed.marketOpportunity || 'Standard market opportunity'
        };
      }
      
      // Fallback parsing if JSON extraction fails
      return this.createFallbackInsights();
      
    } catch (error) {
      console.error('❌ [ENHANCED KOL PREDICTOR] Error parsing LLM response:', error.message);
      return this.createFallbackInsights();
    }
  }

  /**
   * Create fallback insights when LLM fails
   */
  createFallbackInsights() {
    return {
      naturalLanguageExplanation: 'Traditional ML analysis completed. LLM enhancement unavailable.',
      marketContext: 'Standard market conditions',
      riskAnalysis: {
        primaryRisks: ['Market volatility', 'KOL performance variability'],
        riskLevel: 'medium',
        mitigationStrategies: ['Monitor performance', 'Diversify KOL portfolio']
      },
      tradingImplications: {
        shortTerm: 'Monitor for trading signals',
        mediumTerm: 'Evaluate KOL performance trends',
        keySignals: ['Volume spikes', 'Price correlation', 'Sentiment shifts']
      },
      competitiveAdvantage: 'Standard KOL analysis',
      marketOpportunity: 'Standard market opportunity'
    };
  }

  /**
   * Generate enhanced recommendations combining ML and LLM insights
   */
  generateEnhancedRecommendations(traditionalPrediction, llmInsights) {
    const recommendations = [...traditionalPrediction.recommendations];
    
    // Add LLM-based recommendations
    if (llmInsights.tradingImplications.shortTerm) {
      recommendations.push({
        type: 'llm_short_term',
        priority: 'high',
        message: llmInsights.tradingImplications.shortTerm,
        source: 'LLM Analysis'
      });
    }
    
    if (llmInsights.tradingImplications.mediumTerm) {
      recommendations.push({
        type: 'llm_medium_term',
        priority: 'medium',
        message: llmInsights.tradingImplications.mediumTerm,
        source: 'LLM Analysis'
      });
    }
    
    // Add risk mitigation strategies
    if (llmInsights.riskAnalysis.mitigationStrategies) {
      llmInsights.riskAnalysis.mitigationStrategies.forEach(strategy => {
        recommendations.push({
          type: 'risk_mitigation',
          priority: 'medium',
          message: strategy,
          source: 'LLM Risk Analysis'
        });
      });
    }
    
    return recommendations;
  }

  /**
   * Enhanced batch prediction with LLM insights
   */
  async predictBatch(kolsData) {
    console.log(`🧠 [ENHANCED KOL PREDICTOR] Batch predicting with LLM enhancement for ${kolsData.length} KOLs`);
    
    const enhancedPredictions = [];
    
    for (const kolData of kolsData) {
      try {
        const enhancedPrediction = await this.predict(kolData);
        enhancedPredictions.push(enhancedPrediction);
        
        // Rate limiting for LLM calls
        await new Promise(resolve => setTimeout(resolve, 200));
        
      } catch (error) {
        console.error(`❌ [ENHANCED KOL PREDICTOR] Error in batch prediction for @${kolData.handle}:`, error.message);
        
        // Fallback to traditional prediction
        const traditionalPrediction = await super.predict(kolData);
        enhancedPredictions.push(traditionalPrediction);
      }
    }
    
    console.log(`✅ [ENHANCED KOL PREDICTOR] Batch prediction complete: ${enhancedPredictions.length} enhanced predictions`);
    return enhancedPredictions;
  }

  /**
   * Get market context analysis for multiple KOLs
   */
  async getMarketContextAnalysis(kolsData) {
    try {
      const prompt = `Analyze the overall crypto market context for these KOLs:

KOLs: ${kolsData.map(kol => `@${kol.handle} (Alpha: ${kol.influence_score || 50})`).join(', ')}

Provide market context analysis in JSON format:
{
  "marketRegime": "bull|bear|sideways",
  "sectorTrends": ["trend1", "trend2"],
  "macroFactors": ["factor1", "factor2"],
  "seasonalPatterns": "current seasonal context",
  "riskLevel": "low|medium|high",
  "opportunityAreas": ["area1", "area2"],
  "recommendedStrategy": "overall strategy recommendation"
}

Focus on practical trading implications and market timing.`;

      const response = await this.openaiService.generateCompletion(prompt, {
        model: this.llmModel,
        temperature: 0.4,
        maxTokens: 400,
        useCache: true,
        cacheExpiry: 3600000 // 1 hour cache
      });

      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      
      return this.createFallbackMarketContext();
      
    } catch (error) {
      console.error('❌ [ENHANCED KOL PREDICTOR] Market context analysis failed:', error.message);
      return this.createFallbackMarketContext();
    }
  }

  /**
   * Create fallback market context
   */
  createFallbackMarketContext() {
    return {
      marketRegime: 'sideways',
      sectorTrends: ['Mixed sector performance'],
      macroFactors: ['Standard macro conditions'],
      seasonalPatterns: 'Normal seasonal patterns',
      riskLevel: 'medium',
      opportunityAreas: ['Established tokens', 'High-alpha KOLs'],
      recommendedStrategy: 'Monitor KOL performance and market conditions'
    };
  }
}

export default EnhancedKOLPerformancePredictor;
