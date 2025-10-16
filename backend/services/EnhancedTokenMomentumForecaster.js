/**
 * Enhanced Token Momentum Forecaster with GPT-4 Turbo Integration
 * 
 * Combines technical analysis with LLM insights for:
 * - Enhanced pattern recognition
 * - Natural language momentum analysis
 * - Context-aware price predictions
 * - Market regime analysis
 */

import TokenMomentumForecaster from './TokenMomentumForecaster.js';
import OpenAIService from '../openaiService.js';

class EnhancedTokenMomentumForecaster extends TokenMomentumForecaster {
  constructor() {
    super();
    this.openaiService = new OpenAIService();
    this.llmModel = 'gpt-4-turbo';
    this.maxTokens = 600; // Slightly more tokens for complex analysis
    this.temperature = 0.2; // Very low temperature for technical analysis
  }

  /**
   * Enhanced momentum forecast with LLM insights
   */
  async forecastMomentum(coinSymbol, historicalPrices, kolMentions, sentimentData) {
    try {
      console.log(`🧠 [ENHANCED MOMENTUM FORECASTER] Getting LLM-enhanced forecast for ${coinSymbol}`);
      
      // Get traditional technical analysis
      const traditionalForecast = await super.forecastMomentum(coinSymbol, historicalPrices, kolMentions, sentimentData);
      
      // Enhance with LLM analysis
      const llmEnhancement = await this.getLLMMomentumInsights(coinSymbol, historicalPrices, kolMentions, traditionalForecast);
      
      // Combine results
      const enhancedForecast = {
        ...traditionalForecast,
        llmInsights: llmEnhancement,
        enhancedPatterns: llmEnhancement.patterns,
        marketRegime: llmEnhancement.marketRegime,
        tradingSignals: this.generateTradingSignals(traditionalForecast, llmEnhancement),
        riskAssessment: llmEnhancement.riskAssessment
      };
      
      console.log(`✅ [ENHANCED MOMENTUM FORECASTER] LLM enhancement complete for ${coinSymbol}`);
      
      return enhancedForecast;
      
    } catch (error) {
      console.error(`❌ [ENHANCED MOMENTUM FORECASTER] Error enhancing forecast for ${coinSymbol}:`, error.message);
      
      // Fallback to traditional forecast
      return await super.forecastMomentum(coinSymbol, historicalPrices, kolMentions, sentimentData);
    }
  }

  /**
   * Get LLM momentum insights
   */
  async getLLMMomentumInsights(coinSymbol, historicalPrices, kolMentions, traditionalForecast) {
    try {
      const prompt = this.buildMomentumAnalysisPrompt(coinSymbol, historicalPrices, kolMentions, traditionalForecast);
      
      const response = await this.openaiService.generateCompletion(prompt, {
        model: this.llmModel,
        temperature: this.temperature,
        maxTokens: this.maxTokens,
        useCache: true,
        cacheExpiry: 1800000 // 30 minutes cache
      });
      
      return this.parseLLMMomentumResponse(response);
      
    } catch (error) {
      console.error('❌ [ENHANCED MOMENTUM FORECASTER] LLM analysis failed:', error.message);
      return this.createFallbackMomentumInsights();
    }
  }

  /**
   * Build comprehensive momentum analysis prompt
   */
  buildMomentumAnalysisPrompt(coinSymbol, historicalPrices, kolMentions, traditionalForecast) {
    const recentPrices = historicalPrices.slice(-10).map(p => p.price);
    const priceChange = recentPrices.length > 1 ? 
      ((recentPrices[recentPrices.length - 1] - recentPrices[0]) / recentPrices[0] * 100).toFixed(2) : 0;
    
    const kolSentiment = kolMentions.length > 0 ? 
      (kolMentions.reduce((sum, m) => sum + m.sentiment, 0) / kolMentions.length).toFixed(2) : 0;
    
    return `You are a crypto technical analyst specializing in momentum analysis. Analyze this token's momentum and provide insights:

TOKEN: ${coinSymbol}
TRADITIONAL ANALYSIS:
- Momentum Score: ${traditionalForecast.momentumScore}
- Trend Direction: ${traditionalForecast.trendDirection}
- Strength: ${traditionalForecast.strength}
- Key Factors: ${traditionalForecast.keyFactors.join(', ')}
- Risk Factors: ${traditionalForecast.riskFactors.join(', ')}

PRICE DATA (Last 10 periods):
- Recent Prices: ${recentPrices.join(', ')}
- Price Change: ${priceChange}%
- Current Price: $${recentPrices[recentPrices.length - 1]}

KOL SENTIMENT:
- Average Sentiment: ${kolSentiment}
- Total Mentions: ${kolMentions.length}
- Recent Mentions: ${kolMentions.slice(-5).map(m => `@${m.handle}: ${m.sentiment > 0 ? 'Bullish' : m.sentiment < 0 ? 'Bearish' : 'Neutral'}`).join(', ')}

Provide analysis in this JSON format:
{
  "naturalLanguageExplanation": "Clear explanation of momentum in 2-3 sentences",
  "patterns": {
    "technicalPatterns": ["pattern1", "pattern2"],
    "sentimentPatterns": ["pattern1", "pattern2"],
    "volumePatterns": ["pattern1", "pattern2"]
  },
  "marketRegime": {
    "currentRegime": "accumulation|distribution|markup|markdown",
    "regimeStrength": "weak|moderate|strong",
    "regimeDuration": "early|mid|late"
  },
  "priceTargets": {
    "shortTerm": "1-3 days target",
    "mediumTerm": "1-2 weeks target",
    "supportLevels": ["level1", "level2"],
    "resistanceLevels": ["level1", "level2"]
  },
  "riskAssessment": {
    "riskLevel": "low|medium|high",
    "primaryRisks": ["risk1", "risk2"],
    "riskMitigation": ["strategy1", "strategy2"]
  },
  "tradingImplications": {
    "entryStrategy": "specific entry approach",
    "exitStrategy": "specific exit approach",
    "positionSizing": "recommended position size",
    "timeHorizon": "optimal holding period"
  },
  "marketContext": "broader market conditions affecting this token"
}

Focus on:
1. Technical pattern recognition
2. Sentiment-price correlation analysis
3. Risk-adjusted trading strategies
4. Market regime identification
5. Practical entry/exit points

Keep responses data-driven and actionable.`;
  }

  /**
   * Parse LLM momentum response
   */
  parseLLMMomentumResponse(response) {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          naturalLanguageExplanation: parsed.naturalLanguageExplanation || 'Momentum analysis completed',
          patterns: parsed.patterns || {
            technicalPatterns: ['Standard patterns'],
            sentimentPatterns: ['Standard sentiment'],
            volumePatterns: ['Standard volume']
          },
          marketRegime: parsed.marketRegime || {
            currentRegime: 'accumulation',
            regimeStrength: 'moderate',
            regimeDuration: 'mid'
          },
          priceTargets: parsed.priceTargets || {
            shortTerm: 'Monitor for signals',
            mediumTerm: 'Evaluate trend continuation',
            supportLevels: ['Previous lows'],
            resistanceLevels: ['Previous highs']
          },
          riskAssessment: parsed.riskAssessment || {
            riskLevel: 'medium',
            primaryRisks: ['Market volatility'],
            riskMitigation: ['Position sizing', 'Stop losses']
          },
          tradingImplications: parsed.tradingImplications || {
            entryStrategy: 'Wait for confirmation',
            exitStrategy: 'Trail stop loss',
            positionSizing: 'Conservative',
            timeHorizon: 'Short to medium term'
          },
          marketContext: parsed.marketContext || 'Standard market conditions'
        };
      }
      
      return this.createFallbackMomentumInsights();
      
    } catch (error) {
      console.error('❌ [ENHANCED MOMENTUM FORECASTER] Error parsing LLM response:', error.message);
      return this.createFallbackMomentumInsights();
    }
  }

  /**
   * Create fallback momentum insights
   */
  createFallbackMomentumInsights() {
    return {
      naturalLanguageExplanation: 'Traditional momentum analysis completed. LLM enhancement unavailable.',
      patterns: {
        technicalPatterns: ['Standard technical patterns'],
        sentimentPatterns: ['Standard sentiment patterns'],
        volumePatterns: ['Standard volume patterns']
      },
      marketRegime: {
        currentRegime: 'accumulation',
        regimeStrength: 'moderate',
        regimeDuration: 'mid'
      },
      priceTargets: {
        shortTerm: 'Monitor for breakout',
        mediumTerm: 'Evaluate trend continuation',
        supportLevels: ['Previous support levels'],
        resistanceLevels: ['Previous resistance levels']
      },
      riskAssessment: {
        riskLevel: 'medium',
        primaryRisks: ['Market volatility', 'Liquidity risk'],
        riskMitigation: ['Position sizing', 'Stop losses', 'Diversification']
      },
      tradingImplications: {
        entryStrategy: 'Wait for confirmation signals',
        exitStrategy: 'Use trailing stop loss',
        positionSizing: 'Conservative sizing',
        timeHorizon: 'Short to medium term'
      },
      marketContext: 'Standard market conditions'
    };
  }

  /**
   * Generate trading signals from combined analysis
   */
  generateTradingSignals(traditionalForecast, llmInsights) {
    const signals = [];
    
    // Technical signals
    if (traditionalForecast.trendDirection === 'Bullish' && traditionalForecast.strength === 'Strong') {
      signals.push({
        type: 'BUY',
        strength: 'strong',
        reason: 'Strong bullish momentum with technical confirmation',
        timeframe: '1-3 days',
        confidence: traditionalForecast.momentumScore > 0.7 ? 'high' : 'medium'
      });
    }
    
    if (traditionalForecast.trendDirection === 'Bearish' && traditionalForecast.strength === 'Strong') {
      signals.push({
        type: 'SELL',
        strength: 'strong',
        reason: 'Strong bearish momentum with technical confirmation',
        timeframe: '1-3 days',
        confidence: traditionalForecast.momentumScore < -0.7 ? 'high' : 'medium'
      });
    }
    
    // LLM-enhanced signals
    if (llmInsights.marketRegime.currentRegime === 'markup' && llmInsights.marketRegime.regimeStrength === 'strong') {
      signals.push({
        type: 'HOLD',
        strength: 'strong',
        reason: 'Strong markup phase - trend continuation likely',
        timeframe: '1-2 weeks',
        confidence: 'high',
        source: 'LLM Regime Analysis'
      });
    }
    
    if (llmInsights.riskAssessment.riskLevel === 'high') {
      signals.push({
        type: 'REDUCE',
        strength: 'medium',
        reason: 'High risk environment - reduce position size',
        timeframe: 'immediate',
        confidence: 'high',
        source: 'LLM Risk Assessment'
      });
    }
    
    return signals;
  }

  /**
   * Enhanced batch forecasting with LLM insights
   */
  async forecastBatch(coinsData) {
    console.log(`🧠 [ENHANCED MOMENTUM FORECASTER] Batch forecasting with LLM enhancement for ${coinsData.length} coins`);
    
    const enhancedForecasts = [];
    
    for (const coinData of coinsData) {
      try {
        const enhancedForecast = await this.forecastMomentum(
          coinData.symbol,
          coinData.historicalPrices,
          coinData.kolMentions,
          coinData.sentimentData
        );
        enhancedForecasts.push(enhancedForecast);
        
        // Rate limiting for LLM calls
        await new Promise(resolve => setTimeout(resolve, 300));
        
      } catch (error) {
        console.error(`❌ [ENHANCED MOMENTUM FORECASTER] Error in batch forecast for ${coinData.symbol}:`, error.message);
        
        // Fallback to traditional forecast
        const traditionalForecast = await super.forecastMomentum(
          coinData.symbol,
          coinData.historicalPrices,
          coinData.kolMentions,
          coinData.sentimentData
        );
        enhancedForecasts.push(traditionalForecast);
      }
    }
    
    console.log(`✅ [ENHANCED MOMENTUM FORECASTER] Batch forecast complete: ${enhancedForecasts.length} enhanced forecasts`);
    return enhancedForecasts;
  }

  /**
   * Get sector-wide momentum analysis
   */
  async getSectorMomentumAnalysis(coinsData) {
    try {
      const sectorData = coinsData.map(coin => ({
        symbol: coin.symbol,
        momentum: coin.momentumScore || 0,
        trend: coin.trendDirection || 'Neutral',
        strength: coin.strength || 'Moderate'
      }));
      
      const prompt = `Analyze sector-wide momentum for these crypto tokens:

TOKENS: ${sectorData.map(coin => `${coin.symbol} (${coin.trend}, ${coin.strength})`).join(', ')}

Provide sector analysis in JSON format:
{
  "sectorTrend": "bullish|bearish|mixed|sideways",
  "leadingTokens": ["token1", "token2"],
  "laggingTokens": ["token1", "token2"],
  "sectorRotation": "rotation pattern analysis",
  "riskLevel": "low|medium|high",
  "opportunityAreas": ["area1", "area2"],
  "recommendedStrategy": "overall sector strategy"
}

Focus on sector rotation patterns and relative strength analysis.`;

      const response = await this.openaiService.generateCompletion(prompt, {
        model: this.llmModel,
        temperature: 0.3,
        maxTokens: 400,
        useCache: true,
        cacheExpiry: 3600000 // 1 hour cache
      });

      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      
      return this.createFallbackSectorAnalysis();
      
    } catch (error) {
      console.error('❌ [ENHANCED MOMENTUM FORECASTER] Sector analysis failed:', error.message);
      return this.createFallbackSectorAnalysis();
    }
  }

  /**
   * Create fallback sector analysis
   */
  createFallbackSectorAnalysis() {
    return {
      sectorTrend: 'mixed',
      leadingTokens: ['Top performers'],
      laggingTokens: ['Underperformers'],
      sectorRotation: 'Standard rotation patterns',
      riskLevel: 'medium',
      opportunityAreas: ['Established tokens', 'High momentum tokens'],
      recommendedStrategy: 'Monitor sector rotation and momentum shifts'
    };
  }
}

export default EnhancedTokenMomentumForecaster;
