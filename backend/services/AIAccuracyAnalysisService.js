/**
 * AI-Powered Accuracy Analysis Service
 * Provides AI-generated insights about prediction accuracy and market patterns
 */

import OpenAI from 'openai';

class AIAccuracyAnalysisService {
  constructor() {
    // Initialize OpenAI for AI-powered analysis
    this.openai = null;
    try {
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
      });
      console.log('🤖 [AI ACCURACY] AI-powered accuracy analysis initialized');
    } catch (error) {
      console.warn('⚠️ [AI ACCURACY] OpenAI not available, AI analysis disabled');
    }
  }

  /**
   * Generate AI insights about prediction accuracy patterns
   */
  async generateAccuracyInsights(predictions, marketData = {}) {
    // Handle empty predictions
    if (!predictions || predictions.length === 0) {
      console.log('⚠️ [AI ACCURACY] No predictions available for analysis');
      return null;
    }

    if (!this.openai) {
      return this.getFallbackInsights(predictions);
    }

    try {
      const prompt = `
Analyze these crypto prediction accuracy patterns and provide insights:

PREDICTION DATA:
${JSON.stringify(predictions.slice(0, 20), null, 2)}

MARKET CONTEXT:
- Total Predictions: ${predictions.length}
- Successful Predictions: ${predictions.filter(p => p.finalAccuracy > 0.8).length}
- Failed Predictions: ${predictions.filter(p => p.finalAccuracy < 0.2).length}
- Average Accuracy: ${this.calculateAverageAccuracy(predictions).toFixed(2)}%

Provide analysis in this JSON format:
{
  "accuracyPatterns": {
    "bestPerformingTokens": ["BTC", "ETH"],
    "worstPerformingTokens": ["DOGE", "SHIB"],
    "mostAccurateTimeframes": ["soon", "days"],
    "leastAccurateTimeframes": ["months", "unknown"],
    "predictionTypeAccuracy": {
      "price_target": 0.75,
      "multiplier_target": 0.60,
      "percentage_move": 0.45
    }
  },
  "marketInsights": {
    "bullMarketPerformance": "Predictions perform better in bull markets",
    "volatilityImpact": "High volatility reduces accuracy",
    "timeframeCorrelation": "Shorter timeframes show higher accuracy"
  },
  "recommendations": {
    "improveAccuracy": [
      "Focus on shorter timeframes",
      "Avoid predictions during high volatility",
      "Consider market conditions before predicting"
    ],
    "reliablePredictors": [
      "BTC predictions tend to be more accurate",
      "Price targets outperform multipliers",
      "Technical analysis-based predictions show better results"
    ]
  },
  "riskFactors": [
    "Market manipulation affects accuracy",
    "Unexpected news events impact predictions",
    "Low liquidity tokens show higher variance"
  ]
}

Focus on actionable insights for improving prediction accuracy.
`;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini', // 🚀 COST OPTIMIZATION: 40x cheaper
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 1500
      });

      const aiResponse = response.choices[0].message.content.trim();
      console.log(`🤖 [AI ACCURACY] Generated insights: ${aiResponse.substring(0, 200)}...`);

      return JSON.parse(aiResponse);

    } catch (error) {
      console.error('❌ [AI ACCURACY] Error generating insights:', error.message);
      return this.getFallbackInsights(predictions);
    }
  }

  /**
   * Analyze why specific predictions succeeded or failed
   */
  async analyzePredictionOutcome(prediction, marketData = {}) {
    if (!this.openai) {
      return this.getFallbackOutcomeAnalysis(prediction);
    }

    try {
      const prompt = `
Analyze why this crypto prediction succeeded or failed:

PREDICTION DETAILS:
- Token: ${prediction.token}
- Type: ${prediction.predictionType}
- Target: ${prediction.predictedValue.value}
- Timeframe: ${prediction.timeframe.description}
- Accuracy: ${prediction.finalAccuracy || 'Pending'}
- Original Text: "${prediction.originalText}"

MARKET CONTEXT:
- Market Cap: ${marketData.marketCap || 'Unknown'}
- Volume: ${marketData.volume || 'Unknown'}
- Price Movement: ${marketData.priceChange || 'Unknown'}

Provide analysis in this JSON format:
{
  "outcomeAnalysis": {
    "successFactors": [
      "Factor that contributed to success"
    ],
    "failureFactors": [
      "Factor that contributed to failure"
    ],
    "marketConditions": "Description of market conditions during prediction",
    "timingAnalysis": "Analysis of prediction timing",
    "confidenceAssessment": "Assessment of prediction confidence"
  },
  "lessonsLearned": [
    "Key lesson from this prediction",
    "What to avoid in future predictions",
    "What worked well"
  ],
  "similarPredictions": {
    "recommendation": "Recommendation for similar future predictions",
    "riskLevel": "Low|Medium|High",
    "confidenceBoost": "How to improve confidence for similar predictions"
  }
}

Be specific and actionable in your analysis.
`;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini', // 🚀 COST OPTIMIZATION: 40x cheaper
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        max_tokens: 800
      });

      const aiResponse = response.choices[0].message.content.trim();
      return JSON.parse(aiResponse);

    } catch (error) {
      console.error('❌ [AI ACCURACY] Error analyzing outcome:', error.message);
      return this.getFallbackOutcomeAnalysis(prediction);
    }
  }

  /**
   * Generate AI-powered recommendations for improving prediction accuracy
   */
  async generateAccuracyRecommendations(authorPredictions, marketTrends = {}) {
    // Handle empty predictions
    if (!authorPredictions || authorPredictions.length === 0) {
      console.log('⚠️ [AI ACCURACY] No predictions available for author recommendations');
      return null;
    }

    if (!this.openai) {
      return this.getFallbackRecommendations(authorPredictions);
    }

    try {
      const prompt = `
Based on this author's prediction history, provide recommendations for improving accuracy:

AUTHOR PREDICTION HISTORY:
${JSON.stringify(authorPredictions.slice(0, 10), null, 2)}

STATISTICS:
- Total Predictions: ${authorPredictions.length}
- Average Accuracy: ${this.calculateAverageAccuracy(authorPredictions).toFixed(2)}%
- Best Performing Token: ${this.getBestPerformingToken(authorPredictions)}
- Worst Performing Token: ${this.getWorstPerformingToken(authorPredictions)}

MARKET TRENDS:
${JSON.stringify(marketTrends, null, 2)}

Provide recommendations in this JSON format:
{
  "personalizedRecommendations": [
    "Specific recommendation for this author",
    "Based on their prediction patterns"
  ],
  "strengths": [
    "Author's prediction strengths",
    "What they do well"
  ],
  "weaknesses": [
    "Areas for improvement",
    "Common mistakes"
  ],
  "optimizationStrategy": {
    "focusAreas": ["Area to focus on"],
    "avoidPatterns": ["Patterns to avoid"],
    "timingAdvice": "Advice on prediction timing",
    "confidenceBuilding": "How to build prediction confidence"
  },
  "nextSteps": [
    "Immediate action items",
    "Long-term improvement plan"
  ]
}

Be specific and actionable based on the author's actual performance data.
`;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini', // 🚀 COST OPTIMIZATION: 40x cheaper
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 1000
      });

      const aiResponse = response.choices[0].message.content.trim();
      return JSON.parse(aiResponse);

    } catch (error) {
      console.error('❌ [AI ACCURACY] Error generating recommendations:', error.message);
      return this.getFallbackRecommendations(authorPredictions);
    }
  }

  /**
   * Calculate average accuracy for predictions
   */
  calculateAverageAccuracy(predictions) {
    const completedPredictions = predictions.filter(p => p.finalAccuracy !== null);
    if (completedPredictions.length === 0) return 0;
    
    const totalAccuracy = completedPredictions.reduce((sum, p) => sum + p.finalAccuracy, 0);
    return totalAccuracy / completedPredictions.length;
  }

  /**
   * Get best performing token for an author
   */
  getBestPerformingToken(predictions) {
    const tokenAccuracy = {};
    predictions.forEach(p => {
      if (p.finalAccuracy !== null) {
        if (!tokenAccuracy[p.token]) {
          tokenAccuracy[p.token] = { total: 0, count: 0 };
        }
        tokenAccuracy[p.token].total += p.finalAccuracy;
        tokenAccuracy[p.token].count += 1;
      }
    });

    let bestToken = 'Unknown';
    let bestAccuracy = 0;
    
    Object.entries(tokenAccuracy).forEach(([token, data]) => {
      const avgAccuracy = data.total / data.count;
      if (avgAccuracy > bestAccuracy) {
        bestAccuracy = avgAccuracy;
        bestToken = token;
      }
    });

    return bestToken;
  }

  /**
   * Get worst performing token for an author
   */
  getWorstPerformingToken(predictions) {
    const tokenAccuracy = {};
    predictions.forEach(p => {
      if (p.finalAccuracy !== null) {
        if (!tokenAccuracy[p.token]) {
          tokenAccuracy[p.token] = { total: 0, count: 0 };
        }
        tokenAccuracy[p.token].total += p.finalAccuracy;
        tokenAccuracy[p.token].count += 1;
      }
    });

    let worstToken = 'Unknown';
    let worstAccuracy = 1;
    
    Object.entries(tokenAccuracy).forEach(([token, data]) => {
      const avgAccuracy = data.total / data.count;
      if (avgAccuracy < worstAccuracy) {
        worstAccuracy = avgAccuracy;
        worstToken = token;
      }
    });

    return worstToken;
  }

  /**
   * Fallback insights when AI is not available
   */
  getFallbackInsights(predictions) {
    return {
      accuracyPatterns: {
        bestPerformingTokens: ['BTC', 'ETH'],
        worstPerformingTokens: ['Unknown'],
        mostAccurateTimeframes: ['soon', 'days'],
        leastAccurateTimeframes: ['months'],
        predictionTypeAccuracy: {
          price_target: 0.7,
          multiplier_target: 0.6,
          percentage_move: 0.5
        }
      },
      marketInsights: {
        bullMarketPerformance: "Predictions generally perform better in bull markets",
        volatilityImpact: "High volatility periods reduce prediction accuracy",
        timeframeCorrelation: "Shorter timeframes tend to show higher accuracy"
      },
      recommendations: {
        improveAccuracy: [
          "Focus on shorter timeframes",
          "Consider market volatility",
          "Use technical analysis"
        ],
        reliablePredictors: [
          "BTC predictions are generally more reliable",
          "Price targets outperform multipliers"
        ]
      },
      riskFactors: [
        "Market manipulation",
        "Unexpected news events",
        "Low liquidity conditions"
      ]
    };
  }

  /**
   * Fallback outcome analysis when AI is not available
   */
  getFallbackOutcomeAnalysis(prediction) {
    return {
      outcomeAnalysis: {
        successFactors: ["Clear price target", "Reasonable timeframe"],
        failureFactors: ["Market volatility", "Unexpected events"],
        marketConditions: "Standard market conditions",
        timingAnalysis: "Timing appears reasonable",
        confidenceAssessment: "Moderate confidence"
      },
      lessonsLearned: [
        "Consider market volatility",
        "Set realistic timeframes"
      ],
      similarPredictions: {
        recommendation: "Continue with similar approach",
        riskLevel: "Medium",
        confidenceBoost: "Use technical analysis"
      }
    };
  }

  /**
   * Fallback recommendations when AI is not available
   */
  getFallbackRecommendations(authorPredictions) {
    return {
      personalizedRecommendations: [
        "Focus on tokens you know well",
        "Use shorter timeframes",
        "Consider market conditions"
      ],
      strengths: [
        "Consistent prediction approach",
        "Good token selection"
      ],
      weaknesses: [
        "Timing could be improved",
        "Consider market volatility more"
      ],
      optimizationStrategy: {
        focusAreas: ["Technical analysis", "Market timing"],
        avoidPatterns: ["Predicting during high volatility"],
        timingAdvice: "Wait for clear market signals",
        confidenceBuilding: "Use multiple confirmation signals"
      },
      nextSteps: [
        "Analyze failed predictions",
        "Focus on high-confidence setups"
      ]
    };
  }
}

export default AIAccuracyAnalysisService;


