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
      cacheExpiry = 300000, // 5 minutes instead of 1 hour
      forceRegenerate = false // New option to force regeneration
    } = options;

    try {
      console.log(`🧠 Generating ${tone} thesis for ${tokenData.symbol} call...`);
      
      // Prepare template variables
      const templateVars = this.prepareTemplateVariables(tokenData, callData);
      
      // Generate cache key with more granular timing for regeneration
      const timeBucket = forceRegenerate ? Date.now() : (Date.now() - (Date.now() % cacheExpiry));
      const cacheKey = `thesis_${tone}_${tokenData.symbol}_${timeBucket}`;
      
      // Check cache (skip if force regenerate)
      if (useCache && !forceRegenerate && this.thesisCache.has(cacheKey)) {
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
    const moralisAnalytics = tokenData.moralisAnalytics || {};
    const holderData = tokenData.holderData || {};
    const holderFlow = holderData.holderFlow || {};
    const segmentFlow = holderData.segmentFlow || {};
    
    // Debug data availability
    console.log(`🔍 Thesis data sources for ${tokenData.symbol}:`, {
      hasMoralisAnalytics: !!moralisAnalytics && Object.keys(moralisAnalytics).length > 0,
      hasJupiterData: !!jupiterData && Object.keys(jupiterData).length > 0,
      hasHolderData: !!holderData && Object.keys(holderData).length > 0,
      moralisBuyVolume: moralisAnalytics.totalBuyVolume?.['24h'],
      jupiterBuyVolume: jupiterData.stats24h?.buyVolume
    });
    
    return {
      symbol: tokenData.symbol || 'Unknown',
      name: tokenData.name || 'Unknown Token',
      marketCap: this.formatNumber(callData.calledMc || 0),
      price: this.formatNumber(callData.calledPrice || 0),
      
      // Price & Volume Analytics (Moralis TokenAnalytics)
      priceChange1h: this.formatPercentage(moralisAnalytics.priceChange?.['1h'] || 0),
      priceChange6h: this.formatPercentage(moralisAnalytics.priceChange?.['6h'] || 0),
      priceChange24h: this.formatPercentage(moralisAnalytics.priceChange?.['24h'] || 0),
      volumeChange1h: this.formatPercentage(moralisAnalytics.volumeChange?.['1h'] || 0),
      volumeChange6h: this.formatPercentage(moralisAnalytics.volumeChange?.['6h'] || 0),
      volumeChange24h: this.formatPercentage(moralisAnalytics.volumeChange?.['24h'] || 0),
      
      // Buy/Sell Pressure (Moralis TokenAnalytics with Jupiter fallback)
      buyVolume24h: this.formatNumber(moralisAnalytics.totalBuyVolume?.['24h'] || jupiterData.stats24h?.buyVolume || 0),
      sellVolume24h: this.formatNumber(moralisAnalytics.totalSellVolume?.['24h'] || jupiterData.stats24h?.sellVolume || 0),
      buyPressure: this.formatPercentage(this.calculateBuyPressure(moralisAnalytics, jupiterData)),
      
      // Holder Analytics (HolderTimeseriesService)
      holderCount: holderData.totalHolders || jupiterData.holderCount || 0,
      holderChange24h: this.formatPercentage(holderFlow.netFlow || 0),
      whaleFlow: this.formatHolderFlow(segmentFlow.whales || {}),
      dolphinFlow: this.formatHolderFlow(segmentFlow.dolphins || {}),
      shrimpFlow: this.formatHolderFlow(segmentFlow.shrimps || {}),
      
      // Liquidity & Technical
      liquidity: this.formatNumber(jupiterData.liquidity || moralisAnalytics.liquidity || 0),
      marketCapRank: moralisAnalytics.marketCapRank || 'Unknown',
      
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

PRICE & VOLUME ANALYTICS:
- Price Change 1h: ${templateVars.priceChange1h}%
- Price Change 6h: ${templateVars.priceChange6h}%
- Price Change 24h: ${templateVars.priceChange24h}%
- Volume Change 1h: ${templateVars.volumeChange1h}%
- Volume Change 6h: ${templateVars.volumeChange6h}%
- Volume Change 24h: ${templateVars.volumeChange24h}%

BUY/SELL PRESSURE:
- Buy Volume 24h: $${templateVars.buyVolume24h}
- Sell Volume 24h: $${templateVars.sellVolume24h}
- Buy Pressure: ${templateVars.buyPressure}%

HOLDER ANALYTICS:
- Total Holders: ${templateVars.holderCount}
- Holder Change 24h: ${templateVars.holderChange24h}%
- Whale Flow: ${templateVars.whaleFlow}
- Dolphin Flow: ${templateVars.dolphinFlow}
- Shrimp Flow: ${templateVars.shrimpFlow}

TECHNICAL METRICS:
- Liquidity: $${templateVars.liquidity}
- Market Cap Rank: ${templateVars.marketCapRank}

Generate a ${tone} thesis that:
1. Starts with: "${callAnnouncement} $${templateVars.symbol} at $${templateVars.marketCap} MC"
2. Follows with: "Thesis: [your AI-generated thesis here]"
3. Is 1-2 sentences max (for Twitter)
4. Uses heavy crypto slang and degen terminology
5. References specific metrics from holder flows, buy pressure, and volume data
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
      "Follow the alpha on @dgnoracle — we're early. NFA",
      "Check degen-oracle.com for updates — diamond hands only. NFA",
      "Track on @dgnoracle — this narrative is building. NFA",
      "Follow the journey on degen-oracle.com — not financial advice. NFA",
      "Track it on @dgnoracle — let's see how this plays out. NFA",
      "Check degen-oracle.com — this could be massive. NFA",
      "Follow on @dgnoracle — early but promising. NFA",
      "Track on degen-oracle.com — high conviction play. NFA",
      "Follow the alpha on @dgnoracle — DYOR but this looks solid. NFA"
    ];
    return endings[Math.floor(Math.random() * endings.length)];
  }

  /**
   * Get tone-specific guidelines
   */
  getToneGuidelines(tone) {
    const guidelines = {
      bullish: `- Use terms like "mooning", "sending it", "diamond hands", "based AF"
- Focus on positive momentum and growth from holder flows and buy pressure
- Be confident and enthusiastic
- Example: "Whales accumulating with 85% buy pressure and +15% holder growth"`,

      cautious: `- Use terms like "early play", "high risk high reward", "proceed with caution"
- Acknowledge risks while highlighting potential from data
- Be measured but optimistic
- Example: "Early play with mixed signals - strong buy pressure but whale outflow detected"`,

      technical: `- Use terms like "breakout", "accumulation", "distribution", "flow analysis"
- Focus on holder flows, buy/sell pressure, and volume data
- Be analytical and data-driven
- Example: "Technical accumulation phase with 2.3x volume spike and whale inflow"`,

      narrative: `- Use terms like "smart money", "retail FOMO", "diamond hands", "paper hands"
- Focus on holder behavior and market psychology
- Be storytelling-focused about market dynamics
- Example: "Smart money accumulating while retail sleeps - classic early narrative setup"`
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
    if (!thesis.includes('degen-oracle.com') && !thesis.includes('@dgnoracle')) {
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
    
    // Try to get some basic data for fallback
    const jupiterData = tokenData.jupiterData || {};
    const holderCount = jupiterData.holderCount || 'growing';
    const priceChange = jupiterData.priceChange24h || 0;
    const momentum = priceChange > 0 ? 'bullish momentum' : 'accumulation phase';
    
    const fallbacks = {
      bullish: `${callAnnouncement} $${symbol} at $${marketCap} MC. Thesis: ${momentum} with ${holderCount} diamond hands and strong community backing. ${endingPhrase}`,
      cautious: `${callAnnouncement} $${symbol} at $${marketCap} MC. Thesis: Early accumulation phase with ${holderCount} holders - high risk, high reward setup. ${endingPhrase}`,
      technical: `${callAnnouncement} $${symbol} at $${marketCap} MC. Thesis: Technical ${momentum} pattern with solid holder base and volume confirmation. ${endingPhrase}`,
      narrative: `${callAnnouncement} $${symbol} at $${marketCap} MC. Thesis: Community narrative building with ${holderCount} believers and organic growth signals. ${endingPhrase}`
    };

    console.log(`🔄 Using fallback thesis for ${symbol} (${tone} tone)`);
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
    const timeSinceCall = currentStats.timeSinceCall || this.getTimeSinceCall(callData.calledAt);
    
    console.log(`📊 Milestone post data for ${symbol}:`, {
      initialMC,
      currentMC,
      multiplier,
      athMultiplier,
      timeSinceCall,
      milestone
    });
    
    // Get random milestone narrative
    const milestoneNarrative = this.getRandomMilestoneNarrative(milestone, multiplier, athMultiplier);
    
    return `🚀 MILESTONE HIT! Called $${symbol} at $${initialMC} MC — now $${currentMC} (${multiplier.toFixed(2)}×). ATH since call: ${athMultiplier.toFixed(2)}× in ${timeSinceCall}. ${milestoneNarrative} Track my calls on @dgnoracle : https://degen-oracle.com`;
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
    
    return `$${symbol} Update: Called at $${initialMC} MC, now $${currentMC} (${multiplier.toFixed(2)}×). ATH: ${athMultiplier.toFixed(2)}× in ${timeSinceCall}. ${shareNarrative} Track my calls on @dgnoracle : https://degen-oracle.com`;
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

  /**
   * Calculate buy pressure from Moralis analytics with fallbacks
   */
  calculateBuyPressure(moralisAnalytics, jupiterData) {
    // Try Moralis data first
    let buyVolume = 0;
    let sellVolume = 0;
    
    if (moralisAnalytics && moralisAnalytics.totalBuyVolume && moralisAnalytics.totalSellVolume) {
      buyVolume = parseFloat(moralisAnalytics.totalBuyVolume['24h'] || 0);
      sellVolume = parseFloat(moralisAnalytics.totalSellVolume['24h'] || 0);
      
      console.log(`📊 Moralis buy/sell volumes for thesis: Buy=${buyVolume}, Sell=${sellVolume}`);
    }
    
    // Fallback to Jupiter data if Moralis is empty
    if (buyVolume === 0 && sellVolume === 0 && jupiterData) {
      buyVolume = parseFloat(jupiterData.stats24h?.buyVolume || 0);
      sellVolume = parseFloat(jupiterData.stats24h?.sellVolume || 0);
      
      console.log(`📊 Jupiter fallback buy/sell volumes for thesis: Buy=${buyVolume}, Sell=${sellVolume}`);
    }
    
    // Calculate total volume
    const totalVolume = buyVolume + sellVolume;
    
    if (totalVolume === 0) {
      console.log(`⚠️ No volume data available for buy pressure calculation`);
      return 50; // Return neutral 50% if no data
    }
    
    const buyPressure = (buyVolume / totalVolume) * 100;
    console.log(`💹 Calculated buy pressure: ${buyPressure.toFixed(1)}% (${buyVolume}/${totalVolume})`);
    
    return buyPressure;
  }

  /**
   * Format holder flow data
   */
  formatHolderFlow(segmentData) {
    if (!segmentData || typeof segmentData !== 'object') return 'No data';
    
    const netFlow = segmentData.netFlow || 0;
    const inFlow = segmentData.inFlow || 0;
    const outFlow = segmentData.outFlow || 0;
    
    if (netFlow > 0) {
      return `+${this.formatNumber(inFlow)} in (${this.formatPercentage(netFlow)}% net)`;
    } else if (netFlow < 0) {
      return `-${this.formatNumber(Math.abs(outFlow))} out (${this.formatPercentage(Math.abs(netFlow))}% net)`;
    } else {
      return 'Neutral flow';
    }
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
