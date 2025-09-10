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
    // Get random call announcement and ending phrase
    const callAnnouncement = this.getRandomCallAnnouncement();
    const endingPhrase = this.getRandomEndingPhrase();
    
    const basePrompt = `You are DeGen Oracle's AI analyst generating a compelling thesis for a KOL call post. 

TOKEN: ${templateVars.symbol} (${templateVars.name})
MARKET CAP: $${templateVars.marketCap}
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
1. Starts with: "${callAnnouncement} $${templateVars.symbol} at $${templateVars.marketCap} MC"
2. Follows with: "Thesis: [your AI-generated thesis here]"
3. Is 1-2 sentences max (for Twitter)
4. Uses heavy crypto slang and degen terminology
5. References specific metrics from our analytics
6. Sounds like a confident KOL making a call
7. Ends with: "${endingPhrase}"

TONE GUIDELINES:
${this.getToneGuidelines(tone)}

Respond with ONLY the complete thesis text, no quotes or formatting.`;

    return basePrompt;
  }

  /**
   * Get random call announcement variation
   */
  getRandomCallAnnouncement() {
    const announcements = [
      "I am calling",
      "Calling",
      "Going long on",
      "Taking a position in",
      "Backing",
      "Supporting",
      "Riding with",
      "Diamond handing",
      "Stacking",
      "Loading up on"
    ];
    return announcements[Math.floor(Math.random() * announcements.length)];
  }

  /**
   * Get random ending phrase variation
   */
  getRandomEndingPhrase() {
    const endings = [
      "Track it on degen-oracle.com — this could be the next 100x gem. NFA",
      "Follow the alpha on @oracle_degen1 — we're early. NFA",
      "Check degen-oracle.com for updates — diamond hands only. NFA",
      "Track on @oracle_degen1 — this narrative is building. NFA",
      "Follow the journey on degen-oracle.com — not financial advice. NFA",
      "Track it on @oracle_degen1 — let's see how this plays out. NFA",
      "Check degen-oracle.com — this could be massive. NFA",
      "Follow on @oracle_degen1 — early but promising. NFA",
      "Track on degen-oracle.com — high conviction play. NFA",
      "Follow the alpha on @oracle_degen1 — DYOR but this looks solid. NFA"
    ];
    return endings[Math.floor(Math.random() * endings.length)];
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
    
    // The AI should now include the ending phrase in its response
    // If it doesn't, add a fallback ending
    if (!thesis.includes('degen-oracle.com') && !thesis.includes('@oracle_degen1')) {
      thesis += ' ' + this.getRandomEndingPhrase();
    }
    
    return thesis;
  }

  /**
   * Generate fallback thesis if AI fails
   */
  generateFallbackThesis(tokenData, callData, tone) {
    const symbol = tokenData.symbol || 'Unknown';
    const marketCap = this.formatNumber(callData.calledMc || 0);
    const callAnnouncement = this.getRandomCallAnnouncement();
    const endingPhrase = this.getRandomEndingPhrase();
    
    const fallbacks = {
      bullish: `${callAnnouncement} $${symbol} at $${marketCap} MC. Thesis: Strong momentum with growing community and positive analytics signals. ${endingPhrase}`,
      cautious: `${callAnnouncement} $${symbol} at $${marketCap} MC. Thesis: Early play with potential - high risk, high reward opportunity. ${endingPhrase}`,
      technical: `${callAnnouncement} $${symbol} at $${marketCap} MC. Thesis: Technical breakout with volume confirmation and strong fundamentals. ${endingPhrase}`,
      narrative: `${callAnnouncement} $${symbol} at $${marketCap} MC. Thesis: Community narrative building with organic growth and engagement. ${endingPhrase}`
    };

    return fallbacks[tone] || fallbacks.bullish;
  }

  /**
   * Get default thesis
   */
  getDefaultThesis() {
    const callAnnouncement = this.getRandomCallAnnouncement();
    const endingPhrase = this.getRandomEndingPhrase();
    return `${callAnnouncement} this token based on our analytics engine signals. ${endingPhrase}`;
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
    
    // Get random milestone narrative
    const milestoneNarrative = this.getRandomMilestoneNarrative(milestone, multiplier, athMultiplier);
    
    return `🚀 MILESTONE HIT! Called $${symbol} at $${initialMC} MC — now $${currentMC} (${multiplier.toFixed(2)}×). ATH since call: ${athMultiplier.toFixed(2)}× in ${timeSinceCall}. ${milestoneNarrative} Track my calls on @oracle_degen1 : https://degen-oracle.com`;
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
    
    // Get random share narrative
    const shareNarrative = this.getRandomShareNarrative(multiplier, athMultiplier);
    
    return `$${symbol} Update: Called at $${initialMC} MC, now $${currentMC} (${multiplier.toFixed(2)}×). ATH: ${athMultiplier.toFixed(2)}× in ${timeSinceCall}. ${shareNarrative} Track my calls on @oracle_degen1 : https://degen-oracle.com`;
  }

  /**
   * Get random milestone narrative based on performance
   */
  getRandomMilestoneNarrative(milestone, multiplier, athMultiplier) {
    const narratives = [
      `This is why we diamond hand! The narrative is playing out exactly as predicted.`,
      `Called it! The community saw the vision and now we're all winning together.`,
      `Early calls pay off! This is what happens when you trust the analytics.`,
      `Narrative + data = profit. The thesis is unfolding perfectly.`,
      `From early call to milestone hit - this is how you build wealth in crypto.`,
      `The community knew what was up! This is just the beginning of the run.`,
      `Data doesn't lie! Our analytics engine called this move perfectly.`,
      `This is why we do the research. The thesis is playing out beautifully.`,
      `From call to moon - this is how you spot the next 100x gem early.`,
      `The narrative is building and the price is following. This is crypto alpha.`
    ];
    return narratives[Math.floor(Math.random() * narratives.length)];
  }

  /**
   * Get random share narrative based on performance
   */
  getRandomShareNarrative(multiplier, athMultiplier) {
    const narratives = [
      `The thesis is playing out - community momentum is building.`,
      `Early call paying dividends! The narrative is gaining traction.`,
      `Data-driven calls = consistent wins. This is how you alpha.`,
      `The community is waking up to the potential here.`,
      `From call to current - the analytics were spot on.`,
      `Narrative + momentum = profit. This is crypto at its finest.`,
      `The thesis is unfolding exactly as predicted.`,
      `Community engagement is driving the price action.`,
      `Early calls lead to big wins. This is the way.`,
      `The data doesn't lie - this was always going to pump.`
    ];
    return narratives[Math.floor(Math.random() * narratives.length)];
  }

  /**
   * Helper methods
   */
  formatNumber(num) {
    if (num === null || num === undefined || isNaN(num)) return '0';
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
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
