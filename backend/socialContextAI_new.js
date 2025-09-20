/**
 * Enhanced Social Context AI Service
 * New comprehensive structure with proper data integration
 */

import OpenAIService from './openaiService.js';
import { NEW_AI_PROMPT_TEMPLATES } from './aiPromptTemplates_new.js';

class SocialContextAI {
  constructor() {
    this.openaiService = new OpenAIService();
    this.isInitialized = false;
  }

  /**
   * Initialize the AI service
   */
  async initialize() {
    try {
      await this.openaiService.initialize();
      console.log('🧠 Comprehensive AI Analysis initialized successfully with OpenAI');
      this.isInitialized = true;
    } catch (error) {
      console.warn('⚠️ OpenAI service not available for Token Details AI Analysis:', error.message);
      console.log('🧠 Token Details AI Analysis will use fallback analysis only');
      this.isInitialized = true; // Still mark as initialized to allow fallback analysis
      this.openaiService = null; // Clear the service to prevent further attempts
    }
  }

  /**
   * Analyze token data using the new comprehensive template
   */
  async analyzeSocialContext(tokenData, options = {}) {
    try {
      console.log(`🧠 Analyzing comprehensive data for ${tokenData.symbol}...`);
      
      // Prepare template variables with all data sources
      let templateVars;
      try {
        templateVars = this.prepareTemplateVariables(tokenData);
        console.log(`✅ Successfully prepared template variables`);
      } catch (prepError) {
        console.error(`❌ Failed to prepare template variables:`, prepError.message);
        console.error(`❌ Prep error stack:`, prepError.stack);
        throw new Error(`Failed to prepare template variables: ${prepError.message}`);
      }
      
      // Use the new comprehensive template
      const prompt = this.fillTemplate(NEW_AI_PROMPT_TEMPLATES.COMPREHENSIVE_ANALYSIS, templateVars);
      
      // Check if OpenAI service is available (same pattern as Technical Analysis)
      if (!this.openaiService || !this.isInitialized) {
        console.log(`🧠 OpenAI not available, using fallback analysis for ${tokenData.symbol}`);
        throw new Error('OpenAI service not available - using fallback analysis');
      }
      
      console.log(`🧠 Sending comprehensive analysis request to OpenAI...`);
      console.log(`🧠 Prompt length: ${prompt.length} characters`);
      console.log(`🧠 Prompt preview (first 200 chars): ${prompt.substring(0, 200)}`);
      
      const completion = await this.openaiService.generateCompletion(prompt, {
        maxTokens: 2000,
        temperature: 0.7,
        model: 'gpt-4'
      });
      
      console.log(`🤖 AI completion generated successfully`);
      
      // Parse the AI response
      let analysis;
      try {
        // Clean the response to ensure it's valid JSON
        // Note: openaiService.generateCompletion returns just the content string, not the full response
        let cleanedResponse = completion.trim();
        
        // Remove markdown code blocks if present
        if (cleanedResponse.startsWith('```json')) {
          cleanedResponse = cleanedResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        } else if (cleanedResponse.startsWith('```')) {
          cleanedResponse = cleanedResponse.replace(/^```\s*/, '').replace(/\s*```$/, '');
        }
        
        analysis = JSON.parse(cleanedResponse);
        console.log(`✅ Successfully parsed AI analysis response`);
        console.log(`🔍 AI Response Structure:`, {
          sentiment: analysis.sentiment,
          confidence: analysis.confidence,
          aiAssessment: !!analysis.aiAssessment,
          keyInsights: analysis.keyInsights?.length || 0,
          riskAssessment: !!analysis.riskAssessment,
          catalysts: analysis.catalysts?.length || 0,
          redFlags: analysis.redFlags?.length || 0,
          recommendation: !!analysis.recommendation,
          recommendedActions: analysis.recommendedActions?.length || 0
        });
      } catch (parseError) {
        console.error(`❌ Failed to parse AI response:`, parseError.message);
        console.error(`❌ Parse error stack:`, parseError.stack);
        console.log(`❌ Raw AI response (first 500 chars):`, completion.choices[0].message.content.substring(0, 500));
        console.log(`❌ Raw AI response (last 500 chars):`, completion.choices[0].message.content.substring(completion.choices[0].message.content.length - 500));
        console.log(`❌ Cleaned response (first 500 chars):`, cleanedResponse.substring(0, 500));
        throw new Error(`Failed to parse AI analysis: ${parseError.message}`);
      }
      
      return {
        success: true,
        analysis: analysis,
        metadata: {
          model: 'gpt-4',
          confidence: analysis.confidence || 0.8,
          dataFreshness: 'Fresh',
          analysisId: `analysis_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          timestamp: new Date().toISOString(),
          debugVersion: 'v2.0'
        },
        premiumInsights: {
          detailedRiskAnalysis: true,
          advancedCatalysts: true,
          competitiveAnalysis: true,
          marketTimingSignals: true
        },
        actionableRecommendations: analysis.recommendedActions || []
      };
      
    } catch (error) {
      console.error(`❌ Comprehensive analysis failed for ${tokenData.symbol}:`, error.message);
      
      // Return fallback analysis
      return {
        success: false,
        analysis: this.generateFallbackAnalysis(tokenData),
        metadata: {
          fallbackReason: error.message,
          errorType: 'ai_analysis_failed',
          analysisId: `fallback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        }
      };
    }
  }

  /**
   * Prepare comprehensive template variables from all data sources
   */
  prepareTemplateVariables(tokenData) {
    console.log(`🔍 Preparing template variables for token: ${tokenData.symbol}`);
    console.log(`🔍 Token data keys:`, Object.keys(tokenData));
    
    const jupiterData = tokenData.jupiterData || {};
    const callHistory = tokenData.callHistory || {};
    const holderData = tokenData.holderData || {};
    const moralisAnalytics = tokenData.moralisAnalytics || {};
    
    console.log(`🔍 Holder data keys:`, Object.keys(holderData));
    console.log(`🔍 Moralis analytics keys:`, Object.keys(moralisAnalytics));
    
    // Process holder distribution data for AI analysis
    const holderStats = holderData.holderStats || {};
    const topHolders = holderData.topHolders || {};
    const holderChanges = holderData.holderChanges || {};
    
    // Calculate holder concentration metrics with enhanced safety checks
    let top10Percentage = 0;
    let top20Percentage = 0;
    
    try {
      if (topHolders && topHolders.holders && Array.isArray(topHolders.holders) && topHolders.holders.length > 0) {
        top10Percentage = topHolders.holders.slice(0, 10).reduce((sum, holder) => {
          return sum + (holder && typeof holder.percentage === 'number' ? holder.percentage : 0);
        }, 0);
        
        top20Percentage = topHolders.holders.slice(0, 20).reduce((sum, holder) => {
          return sum + (holder && typeof holder.percentage === 'number' ? holder.percentage : 0);
        }, 0);
      }
      console.log(`🔍 Calculated holder percentages: top10=${top10Percentage}, top20=${top20Percentage}`);
    } catch (holderError) {
      console.error(`❌ Error calculating holder percentages:`, holderError.message);
      top10Percentage = 0;
      top20Percentage = 0;
    }
    
    // Determine concentration level
    let concentrationLevel = 'Unknown';
    if (top10Percentage > 0) {
      if (top10Percentage < 20) concentrationLevel = 'Well distributed';
      else if (top10Percentage < 40) concentrationLevel = 'Moderately concentrated';
      else concentrationLevel = 'Highly concentrated';
    }
    
    // Calculate holder growth
    const currentHolders = holderStats.totalHolders || holderChanges.currentHolders || 0;
    const previousHolders = holderChanges.previousHolders || currentHolders;
    const holderGrowth = previousHolders > 0 ? ((currentHolders - previousHolders) / previousHolders * 100) : 0;
    
    // Process holder segments
    const segments = holderStats.holderDistribution || {};
    const holderSegments = Object.entries(segments)
      .map(([segment, count]) => `${segment}: ${count}`)
      .join(', ') || 'N/A';
    
    // Calculate new vs returning holders
    const newHolders = holderChanges.newHolders || 0;
    const returningHolders = holderChanges.returningHolders || 0;
    const totalNewHolders = newHolders + returningHolders;
    const newHoldersPercent = totalNewHolders > 0 ? (newHolders / totalNewHolders * 100) : 0;
    const returningHoldersPercent = totalNewHolders > 0 ? (returningHolders / totalNewHolders * 100) : 0;
    
    // Process holder flow data for AI analysis
    const holderFlowData = holderData.holderFlowData || {};
    console.log(`🔍 Holder flow data keys:`, Object.keys(holderFlowData));
    
    const segmentFlowData = holderFlowData.segmentFlow || {};
    console.log(`🔍 Segment flow data:`, segmentFlowData);
    
    let holderFlowAnalysis = 'No flow data available';
    let segmentFlowSummary = 'No segment flow data available';
    
    if (segmentFlowData && Object.keys(segmentFlowData).length > 0) {
      const flowEntries = Object.entries(segmentFlowData);
      const flowSummary = flowEntries.map(([segment, flow]) => {
        const netFlow = (flow.in || 0) - (flow.out || 0);
        if (netFlow > 0) return `${segment}: +${netFlow} (accumulating)`;
        else if (netFlow < 0) return `${segment}: ${netFlow} (exiting)`;
        else return `${segment}: neutral`;
      }).join(', ');
      segmentFlowSummary = flowSummary;
      
      // Determine overall flow trend
      const totalIn = flowEntries.reduce((sum, [, flow]) => sum + (flow.in || 0), 0);
      const totalOut = flowEntries.reduce((sum, [, flow]) => sum + (flow.out || 0), 0);
      const netFlow = totalIn - totalOut;
      
      if (netFlow > 0) holderFlowAnalysis = `Net inflow: +${netFlow} holders (accumulation phase)`;
      else if (netFlow < 0) holderFlowAnalysis = `Net outflow: ${netFlow} holders (distribution phase)`;
      else holderFlowAnalysis = `Balanced flow: ${totalIn} in, ${totalOut} out (consolidation)`;
    }

    // Extract analytics stats with safety checks
    const stats1h = {
      priceChange: 0,
      holderChange: 0,
      liquidityChange: 0,
      volumeChange: 0,
      buyVolume: 0,
      sellVolume: 0,
      numNetBuyers: 0,
      ...(jupiterData.stats1h || {})
    };
    const stats6h = {
      priceChange: 0,
      holderChange: 0,
      liquidityChange: 0,
      volumeChange: 0,
      buyVolume: 0,
      sellVolume: 0,
      numNetBuyers: 0,
      ...(jupiterData.stats6h || {})
    };
    const stats24h = {
      priceChange: 0,
      holderChange: 0,
      liquidityChange: 0,
      volumeChange: 0,
      buyVolume: 0,
      sellVolume: 0,
      numNetBuyers: 0,
      ...(jupiterData.stats24h || {})
    };

    return {
      // Basic Token Information
      tokenName: tokenData.name || 'Unknown',
      symbol: tokenData.symbol || 'N/A',
      marketCap: this.formatNumber(jupiterData.mcap || jupiterData.marketCap || tokenData.marketCap || 0),
      price: jupiterData.usdPrice || jupiterData.price || tokenData.currentPrice || tokenData.price || 'N/A',
      priceChange24h: Number(jupiterData.priceChange24h || tokenData.priceChange24h || 0).toFixed(2),
      priceChange1h: Number(jupiterData.stats1h?.priceChange || jupiterData.priceChange1h || 0).toFixed(2),
      priceChange6h: Number(jupiterData.stats6h?.priceChange || jupiterData.priceChange6h || 0).toFixed(2),
      priceChange7d: Number(jupiterData.stats7d?.priceChange || jupiterData.priceChange7d || 0).toFixed(2),

      // Analytics stats fields with safety checks
      'stats1h': Number(stats1h.priceChange || 0).toFixed(2),
      'stats6h': Number(stats6h.priceChange || 0).toFixed(2),
      'stats24h': Number(stats24h.priceChange || 0).toFixed(2),
      
      // Volume data
      volume24h: this.formatNumber(
        jupiterData.volume24h || 
        tokenData.volume24h || 0
      ),
      volumeChange24h: Number(jupiterData.stats24h?.volumeChange || jupiterData.volumeChange24h || 0).toFixed(2),

      // Holder Distribution Data
      totalHolders: currentHolders,
      top10Percentage: top10Percentage.toFixed(2),
      top20Percentage: top20Percentage.toFixed(2),
      concentrationLevel: concentrationLevel,
      holderGrowth: holderGrowth.toFixed(2),
      newHolders: newHoldersPercent.toFixed(2),
      returningHolders: returningHoldersPercent.toFixed(2),
      holderSegments: holderSegments,
      holderFlowAnalysis: holderFlowAnalysis,
      segmentFlowData: segmentFlowSummary,
      
      // Moralis Token Analytics data
      volume5m: this.formatNumber((parseFloat(moralisAnalytics?.totalBuyVolume?.['5m']) || 0) + (parseFloat(moralisAnalytics?.totalSellVolume?.['5m']) || 0)),
      volume1h: this.formatNumber((parseFloat(moralisAnalytics?.totalBuyVolume?.['1h']) || 0) + (parseFloat(moralisAnalytics?.totalSellVolume?.['1h']) || 0)),
      volume6h: this.formatNumber((parseFloat(moralisAnalytics?.totalBuyVolume?.['6h']) || 0) + (parseFloat(moralisAnalytics?.totalSellVolume?.['6h']) || 0)),
      volume24h: this.formatNumber((parseFloat(moralisAnalytics?.totalBuyVolume?.['24h']) || 0) + (parseFloat(moralisAnalytics?.totalSellVolume?.['24h']) || 0)),
      buyVolume5m: this.formatNumber(parseFloat(moralisAnalytics?.totalBuyVolume?.['5m']) || 0),
      sellVolume5m: this.formatNumber(parseFloat(moralisAnalytics?.totalSellVolume?.['5m']) || 0),
      buyVolume1h: this.formatNumber(parseFloat(moralisAnalytics?.totalBuyVolume?.['1h']) || 0),
      sellVolume1h: this.formatNumber(parseFloat(moralisAnalytics?.totalSellVolume?.['1h']) || 0),
      buyVolume24h: this.formatNumber(parseFloat(moralisAnalytics?.totalBuyVolume?.['24h']) || 0),
      sellVolume24h: this.formatNumber(parseFloat(moralisAnalytics?.totalSellVolume?.['24h']) || 0),
      buySellRatio5m: this.calculateBuySellRatio(moralisAnalytics?.totalBuyVolume?.['5m'], moralisAnalytics?.totalSellVolume?.['5m']),
      buySellRatio1h: this.calculateBuySellRatio(moralisAnalytics?.totalBuyVolume?.['1h'], moralisAnalytics?.totalSellVolume?.['1h']),
      buySellRatio24h: this.calculateBuySellRatio(moralisAnalytics?.totalBuyVolume?.['24h'], moralisAnalytics?.totalSellVolume?.['24h']),
      
      
      // Jupiter Data
      totalSupply: this.formatNumber(jupiterData.totalSupply || 0),
      circSupply: this.formatNumber(jupiterData.circulatingSupply || 0),
      liquidity: this.formatNumber(jupiterData.liquidity || 0),
      holderCount: this.formatNumber(jupiterData.holderCount || 0),
      launchpad: jupiterData.launchpad || 'Unknown',
      creationTime: jupiterData.firstPool?.createdAt || jupiterData.metadata?.creationTime || 'Unknown',
      auditStatus: jupiterData.audit ? 'Audited' : 'Not Audited',
      auditDetails: JSON.stringify(jupiterData.audit || {}),
      organicScore: Number((jupiterData.organicScore || 0)).toFixed(2),
      organicLabel: jupiterData.organicScoreLabel || 'Unknown',
      tags: JSON.stringify(jupiterData.tags || []),
    };
  }

  /**
   * Generate fallback analysis when AI is not available
   */
  generateFallbackAnalysis(tokenData) {
    const jupiterData = tokenData.jupiterData || {};
    const priceChange24h = Number(jupiterData.priceChange24h || 0);
    const holderCount = jupiterData.holderCount || 0;
    const volume24h = jupiterData.volume24h || 0;

    // Determine sentiment based on price change
    let sentiment = 'Neutral';
    if (priceChange24h > 10) sentiment = 'Bullish';
    else if (priceChange24h < -10) sentiment = 'Bearish';

    return {
      sentiment: sentiment,
      confidence: 0.6,
      aiAssessment: `Fallback analysis: ${sentiment.toLowerCase()} sentiment based on ${priceChange24h.toFixed(2)}% price change. Limited data available for comprehensive analysis.`,
      riskAssessment: `Medium risk due to limited data availability. Fallback analysis indicates ${sentiment.toLowerCase()} sentiment but requires additional confirmation.`,
      keyInsights: [
        `Price change: ${priceChange24h.toFixed(2)}% in 24h`,
        `Holder count: ${this.formatNumber(holderCount)}`,
        `Volume: ${this.formatNumber(volume24h)}`
      ],
      catalysts: [
        'Price momentum could drive interest',
        'Holder growth indicates adoption',
        'Volume increase suggests activity'
      ],
      redFlags: [
        'Limited data for comprehensive analysis',
        'Fallback analysis may not capture all risks',
        'Consider using additional analysis tools'
      ],
      recommendation: 'Hold position due to insufficient data for confident recommendation. Consider using additional analysis tools.',
      recommendedActions: [
        {
          action: 'Oracle Chart',
          reason: 'Get deeper technical analysis',
          priority: 'high',
          icon: '🔍'
        }
      ]
    };
  }

  /**
   * Fill template with variables
   */
  fillTemplate(template, variables) {
    return template.replace(/\{(\w+)\}/g, (match, key) => {
      return variables[key] !== undefined ? variables[key] : match;
    });
  }

  /**
   * Format numbers for display
   */
  formatNumber(num) {
    if (num === null || num === undefined || isNaN(num)) return '0';
    if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
    if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
    if (num >= 1e3) return (num / 1e3).toFixed(2) + 'K';
    return num.toFixed(2);
  }

  /**
   * Calculate buy/sell ratio
   */
  calculateBuySellRatio(buyVolume, sellVolume) {
    const buy = parseFloat(buyVolume) || 0;
    const sell = parseFloat(sellVolume) || 0;
    if (sell === 0) return buy > 0 ? '∞' : '0';
    return (buy / sell).toFixed(2);
  }

  /**
   * Get performance metrics (compatibility method)
   */
  getPerformanceMetrics() {
    return {
      totalAnalyses: 0,
      successRate: 100,
      avgResponseTime: 2000,
      lastAnalysis: new Date().toISOString(),
      isInitialized: this.isInitialized
    };
  }

  /**
   * Record user feedback (compatibility method)
   */
  recordUserFeedback(analysisId, feedback) {
    console.log(`📝 User feedback recorded for analysis ${analysisId}:`, feedback);
    // In a real implementation, this would store feedback for model training
    return true;
  }
}

export default SocialContextAI;
