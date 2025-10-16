/**
 * Enhanced Early Warning Detector with GPT-4 Turbo Integration
 * 
 * Combines pattern detection with LLM insights for:
 * - Enhanced signal detection
 * - Natural language alert explanations
 * - Context-aware risk assessment
 * - Intelligent alert prioritization
 */

import EarlyWarningDetector from './EarlyWarningDetector.js';
import OpenAIService from '../openaiService.js';

class EnhancedEarlyWarningDetector extends EarlyWarningDetector {
  constructor() {
    super();
    this.openaiService = new OpenAIService();
    this.llmModel = 'gpt-4-turbo';
    this.maxTokens = 400; // Concise alerts
    this.temperature = 0.1; // Very low temperature for critical alerts
    this.alertHistory = []; // Store alert history for pattern analysis
  }

  /**
   * Enhanced signal detection with LLM analysis
   */
  async detectSignals(kolData, tokenMomentum, marketData) {
    try {
      console.log(`🧠 [ENHANCED EARLY WARNING] Detecting signals with LLM enhancement`);
      
      // Get traditional signals
      const traditionalSignals = await super.detectSignals(kolData, tokenMomentum, marketData);
      
      // Enhance with LLM analysis
      const enhancedSignals = [];
      
      for (const signal of traditionalSignals) {
        const enhancedSignal = await this.enhanceSignalWithLLM(signal, kolData, tokenMomentum, marketData);
        enhancedSignals.push(enhancedSignal);
      }
      
      // Add LLM-only signals (patterns not caught by traditional detection)
      const llmOnlySignals = await this.detectLLMOnlySignals(kolData, tokenMomentum, marketData);
      enhancedSignals.push(...llmOnlySignals);
      
      // Prioritize and filter signals
      const prioritizedSignals = this.prioritizeSignals(enhancedSignals);
      
      // Store in history for pattern analysis
      this.alertHistory.push(...prioritizedSignals);
      
      console.log(`✅ [ENHANCED EARLY WARNING] Enhanced signal detection complete: ${prioritizedSignals.length} signals`);
      
      return prioritizedSignals;
      
    } catch (error) {
      console.error(`❌ [ENHANCED EARLY WARNING] Error in enhanced signal detection:`, error.message);
      
      // Fallback to traditional signals
      return await super.detectSignals(kolData, tokenMomentum, marketData);
    }
  }

  /**
   * Enhance individual signal with LLM analysis
   */
  async enhanceSignalWithLLM(signal, kolData, tokenMomentum, marketData) {
    try {
      const prompt = this.buildSignalAnalysisPrompt(signal, kolData, tokenMomentum, marketData);
      
      const response = await this.openaiService.generateCompletion(prompt, {
        model: this.llmModel,
        temperature: this.temperature,
        maxTokens: this.maxTokens,
        useCache: true,
        cacheExpiry: 900000 // 15 minutes cache for alerts
      });
      
      const llmAnalysis = this.parseLLMSignalResponse(response);
      
      return {
        ...signal,
        llmEnhancement: llmAnalysis,
        enhancedMessage: llmAnalysis.naturalLanguageAlert,
        riskContext: llmAnalysis.riskContext,
        recommendedAction: llmAnalysis.recommendedAction,
        confidence: llmAnalysis.confidence,
        timeframe: llmAnalysis.timeframe,
        priority: this.calculatePriority(signal, llmAnalysis)
      };
      
    } catch (error) {
      console.error('❌ [ENHANCED EARLY WARNING] LLM signal enhancement failed:', error.message);
      
      // Return original signal with basic enhancement
      return {
        ...signal,
        llmEnhancement: this.createFallbackSignalEnhancement(),
        enhancedMessage: signal.message,
        riskContext: 'Standard risk assessment',
        recommendedAction: 'Monitor closely',
        confidence: 0.5,
        timeframe: '24 hours',
        priority: this.calculateBasicPriority(signal)
      };
    }
  }

  /**
   * Build signal analysis prompt
   */
  buildSignalAnalysisPrompt(signal, kolData, tokenMomentum, marketData) {
    return `You are a crypto risk analyst specializing in early warning detection. Analyze this alert signal:

ALERT SIGNAL:
- Type: ${signal.type}
- Severity: ${signal.severity}
- Message: ${signal.message}
- Details: ${JSON.stringify(signal.details)}

CONTEXT DATA:
- KOL: @${kolData.handle || 'Unknown'}
- Token: ${tokenMomentum.coinSymbol || 'Unknown'}
- Momentum Score: ${tokenMomentum.momentumScore || 0}
- Trend Direction: ${tokenMomentum.trendDirection || 'Neutral'}
- Market Volume: ${marketData.currentVolume || 'Unknown'}
- Average Volume: ${marketData.averageVolume || 'Unknown'}

Provide analysis in this JSON format:
{
  "naturalLanguageAlert": "Clear, actionable alert message in 1-2 sentences",
  "riskContext": "broader risk context and implications",
  "recommendedAction": "specific recommended action",
  "confidence": 0.0-1.0,
  "timeframe": "immediate|short|medium|long",
  "escalationLevel": "low|medium|high|critical",
  "relatedRisks": ["risk1", "risk2"],
  "mitigationStrategies": ["strategy1", "strategy2"],
  "marketImpact": "potential market impact assessment"
}

Focus on:
1. Actionable insights for traders
2. Risk assessment and mitigation
3. Clear escalation levels
4. Practical next steps

Keep alerts concise and urgent.`;
  }

  /**
   * Parse LLM signal response
   */
  parseLLMSignalResponse(response) {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          naturalLanguageAlert: parsed.naturalLanguageAlert || 'Alert detected',
          riskContext: parsed.riskContext || 'Standard risk context',
          recommendedAction: parsed.recommendedAction || 'Monitor closely',
          confidence: Math.max(0, Math.min(1, parsed.confidence || 0.5)),
          timeframe: parsed.timeframe || 'short',
          escalationLevel: parsed.escalationLevel || 'medium',
          relatedRisks: parsed.relatedRisks || ['Market volatility'],
          mitigationStrategies: parsed.mitigationStrategies || ['Position sizing'],
          marketImpact: parsed.marketImpact || 'Standard market impact'
        };
      }
      
      return this.createFallbackSignalEnhancement();
      
    } catch (error) {
      console.error('❌ [ENHANCED EARLY WARNING] Error parsing LLM signal response:', error.message);
      return this.createFallbackSignalEnhancement();
    }
  }

  /**
   * Create fallback signal enhancement
   */
  createFallbackSignalEnhancement() {
    return {
      naturalLanguageAlert: 'Alert detected - monitor closely',
      riskContext: 'Standard risk assessment',
      recommendedAction: 'Monitor market conditions',
      confidence: 0.5,
      timeframe: 'short',
      escalationLevel: 'medium',
      relatedRisks: ['Market volatility'],
      mitigationStrategies: ['Position sizing', 'Stop losses'],
      marketImpact: 'Standard market impact'
    };
  }

  /**
   * Detect LLM-only signals (patterns not caught by traditional detection)
   */
  async detectLLMOnlySignals(kolData, tokenMomentum, marketData) {
    try {
      const prompt = `You are a crypto pattern recognition expert. Look for subtle patterns that traditional indicators might miss:

KOL DATA:
- Handle: @${kolData.handle || 'Unknown'}
- Alpha Score: ${kolData.alphaScore || 0}
- Recent Activity: ${kolData.recentActivity || 'Standard'}

TOKEN DATA:
- Symbol: ${tokenMomentum.coinSymbol || 'Unknown'}
- Momentum: ${tokenMomentum.momentumScore || 0}
- Trend: ${tokenMomentum.trendDirection || 'Neutral'}

MARKET DATA:
- Volume: ${marketData.currentVolume || 'Unknown'}
- Price Trend: ${marketData.priceTrend || 'Unknown'}

Look for subtle patterns like:
- Social sentiment divergence
- Unusual KOL behavior patterns
- Market microstructure anomalies
- Cross-asset correlation breakdowns
- Timing pattern anomalies

Provide any detected patterns in JSON format:
{
  "patterns": [
    {
      "type": "pattern_type",
      "severity": "low|medium|high",
      "description": "pattern description",
      "confidence": 0.0-1.0,
      "timeframe": "immediate|short|medium|long"
    }
  ]
}

Only include patterns with confidence > 0.6.`;

      const response = await this.openaiService.generateCompletion(prompt, {
        model: this.llmModel,
        temperature: 0.2,
        maxTokens: 300,
        useCache: true,
        cacheExpiry: 1800000 // 30 minutes cache
      });

      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return parsed.patterns.map(pattern => ({
          type: `LLM_${pattern.type}`,
          severity: pattern.severity,
          message: pattern.description,
          details: { pattern: pattern.type, confidence: pattern.confidence },
          source: 'LLM Pattern Detection',
          confidence: pattern.confidence,
          timeframe: pattern.timeframe
        }));
      }
      
      return [];
      
    } catch (error) {
      console.error('❌ [ENHANCED EARLY WARNING] LLM-only signal detection failed:', error.message);
      return [];
    }
  }

  /**
   * Calculate signal priority based on multiple factors
   */
  calculatePriority(signal, llmAnalysis) {
    let priority = 0;
    
    // Base priority from severity
    const severityWeights = { 'Critical': 4, 'High': 3, 'Medium': 2, 'Low': 1 };
    priority += severityWeights[signal.severity] || 1;
    
    // LLM confidence boost
    priority += llmAnalysis.confidence * 2;
    
    // Escalation level boost
    const escalationWeights = { 'critical': 3, 'high': 2, 'medium': 1, 'low': 0 };
    priority += escalationWeights[llmAnalysis.escalationLevel] || 1;
    
    // Timeframe urgency
    const timeframeWeights = { 'immediate': 3, 'short': 2, 'medium': 1, 'long': 0 };
    priority += timeframeWeights[llmAnalysis.timeframe] || 1;
    
    return Math.min(10, Math.max(1, Math.round(priority)));
  }

  /**
   * Calculate basic priority for fallback signals
   */
  calculateBasicPriority(signal) {
    const severityWeights = { 'Critical': 8, 'High': 6, 'Medium': 4, 'Low': 2 };
    return severityWeights[signal.severity] || 3;
  }

  /**
   * Prioritize signals by importance and urgency
   */
  prioritizeSignals(signals) {
    return signals
      .sort((a, b) => {
        // First by priority
        if (a.priority !== b.priority) {
          return b.priority - a.priority;
        }
        
        // Then by severity
        const severityOrder = { 'Critical': 4, 'High': 3, 'Medium': 2, 'Low': 1 };
        return severityOrder[b.severity] - severityOrder[a.severity];
      })
      .slice(0, 10); // Limit to top 10 signals
  }

  /**
   * Get enhanced alerts with LLM analysis
   */
  getEnhancedAlerts() {
    return this.alerts.map(alert => {
      if (alert.llmEnhancement) {
        return {
          ...alert,
          enhancedMessage: alert.enhancedMessage,
          riskContext: alert.riskContext,
          recommendedAction: alert.recommendedAction,
          confidence: alert.confidence,
          timeframe: alert.timeframe,
          priority: alert.priority
        };
      }
      return alert;
    });
  }

  /**
   * Get alert summary with LLM insights
   */
  async getAlertSummary() {
    try {
      const recentAlerts = this.alertHistory.slice(-20); // Last 20 alerts
      
      if (recentAlerts.length === 0) {
        return {
          summary: 'No recent alerts detected',
          riskLevel: 'low',
          recommendations: ['Continue monitoring']
        };
      }
      
      const prompt = `Analyze these recent crypto alerts and provide a summary:

RECENT ALERTS: ${recentAlerts.map(alert => 
  `${alert.type} (${alert.severity}): ${alert.message}`
).join('; ')}

Provide analysis in JSON format:
{
  "summary": "overall alert pattern summary",
  "riskLevel": "low|medium|high|critical",
  "trendAnalysis": "alert trend analysis",
  "recommendations": ["rec1", "rec2"],
  "keyConcerns": ["concern1", "concern2"],
  "marketOutlook": "market outlook based on alerts"
}

Focus on pattern recognition and risk assessment.`;

      const response = await this.openaiService.generateCompletion(prompt, {
        model: this.llmModel,
        temperature: 0.3,
        maxTokens: 400,
        useCache: true,
        cacheExpiry: 900000 // 15 minutes cache
      });

      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      
      return this.createFallbackAlertSummary(recentAlerts);
      
    } catch (error) {
      console.error('❌ [ENHANCED EARLY WARNING] Alert summary failed:', error.message);
      return this.createFallbackAlertSummary(this.alertHistory.slice(-20));
    }
  }

  /**
   * Create fallback alert summary
   */
  createFallbackAlertSummary(recentAlerts) {
    const severityCounts = recentAlerts.reduce((acc, alert) => {
      acc[alert.severity] = (acc[alert.severity] || 0) + 1;
      return acc;
    }, {});
    
    const riskLevel = severityCounts.Critical > 0 ? 'critical' :
                     severityCounts.High > 2 ? 'high' :
                     severityCounts.Medium > 5 ? 'medium' : 'low';
    
    return {
      summary: `${recentAlerts.length} alerts detected in recent period`,
      riskLevel,
      trendAnalysis: 'Standard alert patterns',
      recommendations: ['Monitor closely', 'Adjust position sizing'],
      keyConcerns: ['Market volatility', 'Alert frequency'],
      marketOutlook: 'Standard market conditions'
    };
  }

  /**
   * Clear old alerts from history
   */
  clearOldAlerts(maxAge = 24 * 60 * 60 * 1000) { // 24 hours
    const cutoff = Date.now() - maxAge;
    this.alertHistory = this.alertHistory.filter(alert => 
      alert.timestamp && alert.timestamp > cutoff
    );
  }
}

export default EnhancedEarlyWarningDetector;
