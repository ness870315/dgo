import OpenAIService from './openaiService.js';

/**
 * Call Thesis Generator - AI-powered thesis generation for KOL calls
 * Generates compelling, varied theses for Twitter posts using our analytics engine
 */
class CallThesisGenerator {
  constructor() {
    this.openaiService = new OpenAIService();
    this.isInitialized = false;
    this.thesisCache = new Map();
  }

  /**
   * Initialize the service
   */
  async initialize() {
    if (this.isInitialized) return;
    
    try {
      await this.openaiService.initialize();
      this.isInitialized = true;
      console.log('🧠 Call Thesis Generator initialized');
    } catch (error) {
      console.error('❌ Failed to initialize Call Thesis Generator:', error.message);
      throw error;
    }
  }

  /**
   * Generate a compelling thesis for a KOL call
   */
  async generateCallThesis(tokenData, callData, options = {}) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const {
      tone = 'bullish', // bullish, cautious, technical, narrative
      useCache = true,
      cacheExpiry = 3600000 // 1 hour
    } = options;

    try {
      console.log(`🧠 Generating ${tone} thesis for ${tokenData.symbol} call...`);
      
      // Prepare template variables
      const templateVars = this.prepareTemplateVariables(tokenData, callData);
      
      // Generate cache key
      const timeBucket = Date.now() - (Date.now() % cacheExpiry);
      const cacheKey = `thesis_${tone}_${tokenData.symbol}_${timeBucket}`;
      
      // Check cache
      if (useCache && this.thesisCache.has(cacheKey)) {
        console.log(`💾 Using cached thesis for ${tokenData.symbol}`);
        return this.thesisCache.get(cacheKey);
      }

      // Generate thesis using AI
      const prompt = this.buildThesisPrompt(templateVars, tone);
      const response = await this.openaiService.generateCompletion(prompt, {
        model: 'gpt-3.5-turbo',
        temperature: 0.8,
        maxTokens: 200
      });

      const thesis = this.parseThesisResponse(response);
      
      // Cache the result
      this.thesisCache.set(cacheKey, thesis);
      
      console.log(`✅ Generated ${tone} thesis for ${tokenData.symbol}`);
      return thesis;
      
    } catch (error) {
      console.error(`❌ Failed to generate thesis for ${tokenData.symbol}:`, error.message);
      return this.generateFallbackThesis(tokenData, callData, tone);
    }
  }

  /**
   * Prepare template variables for thesis generation
   */
  prepareTemplateVariables(tokenData, callData) {
    const jupiterData = tokenData.jupiterData || {};
    const twitterData = tokenData.twitterData || {};
    
    return {
      symbol: tokenData.symbol || 'Unknown',
      name: tokenData.name || 'Unknown Token',
      marketCap: this.formatNumber(callData.calledMc || 0),
      price: this.formatNumber(callData.calledPrice || 0),
      
      // Analytics metrics
      holderChange: this.formatPercentage(jupiterData.stats24h?.holderChange || 0),
      volumeChange: this.formatPercentage(jupiterData.stats24h?.volumeChange || 0),
      priceChange24h: this.formatPercentage(jupiterData.priceChange24h || 0),
      organicScore: Math.round(jupiterData.organicScore || 0),
      organicScoreLabel: jupiterData.organicScoreLabel || 'Unknown',
      
      // Social metrics
      mentions: twitterData.totalMentions || 0,
      mentions24h: twitterData.mentions24h || 0,
      communityScore: tokenData.communityScore || 0,
      followers: twitterData.followers || 0,
      engagementRate: this.formatPercentage(twitterData.engagementRate || 0),
      
      // Technical indicators
      liquidity: this.formatNumber(jupiterData.liquidity || 0),
      holderCount: jupiterData.holderCount || 0,
      
      // Call context
      calledAt: new Date().toLocaleDateString(),
      timeAgo: 'just now'
    };
  }

  /**
   * Build thesis prompt based on tone
   */
  buildThesisPrompt(templateVars, tone) {
    const basePrompt = `You are DeGen Oracle's AI analyst generating a compelling thesis for a KOL call post. 

TOKEN: ${templateVars.symbol} (${templateVars.name})
MARKET CAP: $${templateVars.marketCap}M
PRICE: $${templateVars.price}

ANALYTICS METRICS:
- Holder Change: ${templateVars.holderChange}%
- Volume Change: ${templateVars.volumeChange}%
- Price Change 24h: ${templateVars.priceChange24h}%
- Organic Score: ${templateVars.organicScore}/100 (${templateVars.organicScoreLabel})
- Liquidity: $${templateVars.liquidity}

SOCIAL METRICS:
- Mentions: ${templateVars.mentions} (24h: ${templateVars.mentions24h})
- Community Score: ${templateVars.communityScore}/10
- Followers: ${templateVars.followers}
- Engagement Rate: ${templateVars.engagementRate}%

Generate a ${tone} thesis that:
1. Is 1-2 sentences max (for Twitter)
2. Uses heavy crypto slang and degen terminology
3. References specific metrics from our analytics
4. Sounds like a confident KOL making a call
5. Ends with "Track it on degen-oracle.com — let's see where this goes. NFA"

TONE GUIDELINES:
${this.getToneGuidelines(tone)}

Respond with ONLY the thesis text, no quotes or formatting.`;

    return basePrompt;
  }

  /**
   * Get tone-specific guidelines
   */
  getToneGuidelines(tone) {
    const guidelines = {
      bullish: `- Use terms like "mooning", "sending it", "diamond hands", "based AF"
- Focus on positive momentum and growth
- Be confident and enthusiastic
- Example: "Narrative ignition with 15% holder growth and 2.3x volume spike"`,

      cautious: `- Use terms like "early play", "high risk high reward", "proceed with caution"
- Acknowledge risks while highlighting potential
- Be measured but optimistic
- Example: "Early narrative play with mixed signals - strong social momentum but low liquidity"`,

      technical: `- Use terms like "breakout", "resistance", "support", "technical analysis"
- Focus on chart patterns and technical indicators
- Be analytical and data-driven
- Example: "Technical breakout above key resistance with 2.3x volume spike and 8.5/10 community health"`,

      narrative: `- Use terms like "story", "narrative", "community", "vibes"
- Focus on social momentum and community building
- Be storytelling-focused
- Example: "Community narrative building with strong engagement and organic growth signals"`
    };

    return guidelines[tone] || guidelines.bullish;
  }

  /**
   * Parse AI response to extract thesis
   */
  parseThesisResponse(response) {
    if (!response) return this.getDefaultThesis();
    
    // Extract thesis from response
    let thesis = response.trim();
    
    // Remove quotes if present
    thesis = thesis.replace(/^["']|["']$/g, '');
    
    // Ensure it ends with the required phrase
    if (!thesis.includes('Track it on degen-oracle.com')) {
      thesis += ' Track it on degen-oracle.com — let\'s see where this goes. NFA';
    }
    
    return thesis;
  }

  /**
   * Generate fallback thesis if AI fails
   */
  generateFallbackThesis(tokenData, callData, tone) {
    const symbol = tokenData.symbol || 'Unknown';
    const marketCap = this.formatNumber(callData.calledMc || 0);
    
    const fallbacks = {
      bullish: `Calling $${symbol} at $${marketCap}M MC. Thesis: Strong momentum with growing community and positive analytics signals. Track it on degen-oracle.com — let's see where this goes. NFA`,
      cautious: `Calling $${symbol} at $${marketCap}M MC. Thesis: Early play with potential - high risk, high reward opportunity. Track it on degen-oracle.com — let's see where this goes. NFA`,
      technical: `Calling $${symbol} at $${marketCap}M MC. Thesis: Technical breakout with volume confirmation and strong fundamentals. Track it on degen-oracle.com — let's see where this goes. NFA`,
      narrative: `Calling $${symbol} at $${marketCap}M MC. Thesis: Community narrative building with organic growth and engagement. Track it on degen-oracle.com — let's see where this goes. NFA`
    };

    return fallbacks[tone] || fallbacks.bullish;
  }

  /**
   * Get default thesis
   */
  getDefaultThesis() {
    return "Calling this token based on our analytics engine signals. Track it on degen-oracle.com — let's see where this goes. NFA";
  }

  /**
   * Generate milestone update post
   */
  async generateMilestonePost(callData, milestone, currentStats) {
    const symbol = callData.token?.symbol || 'Unknown';
    const initialMC = this.formatNumber(callData.calledMc || 0);
    const currentMC = this.formatNumber(currentStats.currentMC || 0);
    const multiplier = currentStats.multiplier || 0;
    const athMultiplier = currentStats.athMultiplier || 0;
    const timeSinceCall = this.getTimeSinceCall(callData.calledAt);
    
    return `Called $${symbol} at $${initialMC}M MC — now $${currentMC}M (${multiplier.toFixed(2)}×). ATH since call: ${athMultiplier.toFixed(2)}× in ${timeSinceCall}. ${callData.thesis || 'Thesis: Based on our analytics engine signals.'} Track my calls on @oracle_degen1 : https://degen-oracle.com`;
  }

  /**
   * Generate manual share post
   */
  async generateSharePost(callData, currentStats) {
    const symbol = callData.token?.symbol || 'Unknown';
    const initialMC = this.formatNumber(callData.calledMc || 0);
    const currentMC = this.formatNumber(currentStats.currentMC || 0);
    const multiplier = currentStats.multiplier || 0;
    const athMultiplier = currentStats.athMultiplier || 0;
    const timeSinceCall = this.getTimeSinceCall(callData.calledAt);
    
    return `$${symbol} Update: Called at $${initialMC}M MC, now $${currentMC}M (${multiplier.toFixed(2)}×). ATH: ${athMultiplier.toFixed(2)}× in ${timeSinceCall}. ${callData.thesis || 'Thesis: Based on our analytics engine signals.'} Track my calls on @oracle_degen1 : https://degen-oracle.com`;
  }

  /**
   * Helper methods
   */
  formatNumber(num) {
    if (num === null || num === undefined || isNaN(num)) return '0';
    if (num >= 1000000) return (num / 1000000).toFixed(1);
    if (num >= 1000) return (num / 1000).toFixed(1);
    return num.toFixed(2);
  }

  formatPercentage(num) {
    if (num === null || num === undefined || isNaN(num)) return '0.00';
    return Number(num).toFixed(2);
  }

  getTimeSinceCall(calledAt) {
    if (!calledAt) return 'unknown time';
    
    const now = new Date();
    const called = new Date(calledAt);
    const diffMs = now - called;
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffDays > 0) return `${diffDays}d`;
    if (diffHours > 0) return `${diffHours}h`;
    return '1h';
  }
}

export default CallThesisGenerator;
