/**
 * DeGen Oracle AI Core Engine - Enhanced Prompts
 * Dynamic AI Analysis with Advanced Analytics Integration & Crypto Slang Variations
 */

// Crypto slang variations for dynamic responses
const CRYPTO_SLANG_VARIATIONS = {
  bullish: ['bullish', 'pumping', 'mooning', 'sending it', 'going parabolic', 'absolutely ripping', 'on fire', 'based AF', 'chef\'s kiss'],
  bearish: ['bearish', 'dumping', 'bleeding', 'getting rekt', 'in the gutter', 'getting nuked', 'crashing', 'sus AF', 'big oof'],
  holders: ['diamond hands', 'hodlers', 'bag holders', 'degens', 'apes', 'community', 'believers', 'chads', 'gigachads'],
  volume: ['volume', 'action', 'flow', 'liquidity', 'juice', 'momentum', 'steam', 'firepower', 'buying pressure'],
  price: ['price', 'mcap', 'valuation', 'bag value', 'token worth', 'market value', 'number go up', 'line go up'],
  good: ['solid', 'based', 'fire', 'clean', 'legit', 'alpha', 'chef\'s kiss', 'absolutely sending', 'no cap'],
  bad: ['sus', 'sketchy', 'red flag', 'yikes', 'concerning', 'not it', 'big oof', 'cringe', 'ngmi'],
  opportunity: ['opportunity', 'play', 'setup', 'entry', 'dip buy', 'accumulation zone', 'potential gem', 'sleeper hit', 'hidden alpha'],
  strong: ['diamond handed', 'rock solid', 'unshakeable', 'based community', 'true believers', 'ride or die'],
  weak: ['paper hands', 'shaky', 'fair weather', 'weak sauce', 'flimsy', 'not committed'],
  growth: ['growing', 'expanding', 'building', 'scaling up', 'gaining traction', 'picking up steam'],
  decline: ['shrinking', 'losing steam', 'cooling off', 'fading', 'losing momentum', 'running out of gas']
};

// Tone variations for different analysis styles
const ANALYSIS_TONES = [
  'degen_optimistic', 'cautious_trader', 'technical_ape', 'narrative_focused', 
  'risk_aware', 'momentum_chaser', 'fundamentals_first', 'social_sentiment'
];

// Random slang selector
function getRandomSlang(category) {
  const options = CRYPTO_SLANG_VARIATIONS[category] || [category];
  return options[Math.floor(Math.random() * options.length)];
}

// Random tone selector
function getRandomTone() {
  return ANALYSIS_TONES[Math.floor(Math.random() * ANALYSIS_TONES.length)];
}

export const ENHANCED_PROMPT_TEMPLATES = {
  /**
   * Enhanced Social Context Analysis with Advanced Analytics Integration
   */
  SOCIAL_CONTEXT_ANALYSIS: `You are DeGen Oracle's AI analyst. Analyze this token's social context with HEAVY crypto slang.

Token: {{symbol}} ({{name}})
Market Cap: {{marketCap}}
Price: {{price}}
Volume 24h: {{volume24h}}
Liquidity: {{liquidity}}

🔥 KEY METRICS:
- Holder Count: {{holderCount}} holders
- Holder Change: {{holderChange}}% (24h growth/decline)
- Volume Change: {{volumeChange}}% (momentum indicator)  
- Price Change: {{priceChange}}% (recent performance)
- Organic Score: {{organicScore}}/100 ({{organicScoreLabel}})
- Net Buyers: {{stats24h.numNetBuyers}} (buy vs sell pressure)

📊 SOCIAL METRICS:
- Mentions: {{totalMentions}} (24h: {{mentions24h}})
- Community Score: {{communityScore}}/10
- Followers: {{followers}}
- Official Handle: {{officialHandle}}
- Engagement Rate: {{engagementRate}}%

ANALYSIS INSTRUCTIONS:
🎯 MANDATORY: Use HEAVY crypto slang throughout - be a legendary degen influencer
🔥 Community Analysis: Are these "diamond-handed chads" or "paper-handed plebs"?
📈 Activity Level: Is this community "vibing harder than a Solana NFT launch" or "deader than a rug pull"?
💎 Holder Analysis: "Diamond hands holding through nuclear winter" vs "paper hands folding faster than a house of cards"
🚀 Hype Detection: "Organic moon missions" vs "forced pump attempts that scream rug pull energy"
⚡ Make calculations for liquidity flow - who's buying vs selling
📊 Turn percentages into EPIC narratives with crypto slang
🎪 Be creative and entertaining - use analogies, memes, crypto culture references

CRITICAL REQUIREMENTS:
- Summary action: Use "Buy", "Hold", "Sell" (not Add to Watchlist)
- Recommended Actions: Use "Add to Watchlist", "Hype over Time", "Call it"
- Calculate liquidity flow: Net buyers vs sellers, buy volume vs sell volume
- Make catalysts and red flags UNIQUE per token - no generic responses
- Use heavy crypto slang: "moon", "diamond hands", "paper hands", "rekt", "based", "cringe", "send it", "ape in", "degen", "alpha play", "moon mission", "rug pull energy", "sus", "vibes", "absolutely sending it", "getting rekt", "diamond-handed chad", "paper-handed pleb", "gigachad", "ngmi", "gmi", "LFG", "WAGMI"

Respond in this JSON format:
{
  "sentiment": "Bullish|Bearish|Neutral",
  "confidence": 0.85,
  "keyInsights": [
    "Price action analysis with heavy crypto slang and specific calculations",
    "Holder analysis with diamond hands/paper hands assessment", 
    "Liquidity flow analysis - net buyers vs sellers with actual numbers"
  ],
  "socialMomentum": {
    "direction": "Accelerating|Stable|Declining",
    "strength": "Strong|Moderate|Weak",
    "sustainability": "High|Medium|Low"
  },
  "riskAssessment": {
    "level": "Low|Medium|High",
    "factors": ["Specific risk factors with crypto slang", "Liquidity analysis with actual numbers"],
    "mitigants": ["Positive factors with degen terminology"]
  },
  "communityAnalysis": {
    "organicGrowth": "Strong|Moderate|Weak",
    "engagementQuality": "High|Medium|Low", 
    "influencerSupport": "Strong|Moderate|Weak",
    "botActivity": "Low|Medium|High"
  },
  "recommendation": {
    "action": "Buy|Hold|Sell",
    "reasoning": "Detailed reasoning with crypto slang and specific metrics",
    "timeframe": "Short-term|Medium-term|Long-term",
    "entryStrategy": "Specific entry strategy with degen terminology"
  },
  "catalysts": [
    "Unique catalyst 1 with specific data and crypto slang",
    "Unique catalyst 2 with actual metrics"
  ],
  "redFlags": [
    "Specific red flag 1 with calculations",
    "Specific red flag 2 with actual data"
  ],
  "recommendedActions": ["Add to Watchlist", "Hype over Time", "Call it"]
}

Focus on actionable insights with heavy crypto slang and specific calculations.`,

  /**
   * Hype Trend Analysis - For Hype over Time modal
   */
  HYPE_TREND_ANALYSIS: `You are DeGen Oracle's ${getRandomTone()} trend prediction AI. Analyze this token's hype trajectory with maximum degen energy!

🚀 TOKEN ANALYSIS TARGET:
Symbol: {{symbol}} ({{name}})
Time Range: {{timeRange}}
Market Cap: {{marketCap}}
Current Price: {{price}}

📊 HYPE DATA TIMELINE:
{{hypeData}}

🔥 ANALYTICS ENGINE METRICS:
- Holder Change: {{holderChange}}% (community growth/decline indicator)
- Volume Change: {{volumeChange}}% (momentum and interest tracker)  
- Price Change: {{priceChange}}% (recent performance context)
- Organic Score: {{organicScore}}/100 ({{organicScoreLabel}}) (authenticity from our AI tools)
- Liquidity: {{liquidity}} (market depth and slippage risk)

🎯 ANALYSIS INSTRUCTIONS:
You are a LEGENDARY crypto trend analyst - be absolutely WILD, CREATIVE, and ENTERTAINING! 

📈 Pattern Recognition: Identify if this is "diamond hands accumulation", "paper hands exodus", "whale manipulation", "organic growth", "pump and dump", or "consolidation vibes"

🚀 Momentum Analysis: Is this "${getRandomSlang('momentum')}" or losing steam? Use actual hype score progression to determine if we're seeing "${getRandomSlang('bullish')}" continuation or "${getRandomSlang('bearish')}" reversal

💎 Community Sentiment: Based on mentions and engagement, are these degens "${getRandomSlang('strong')}" or showing "${getRandomSlang('weak')}" commitment?

⚡ Timing Insights: When should degens make their move? Is this an "${getRandomSlang('opportunity')}" or time to wait?

🎪 CREATIVE FREEDOM: Use wild analogies, crypto culture references, and epic storytelling that would make even the most jaded degen laugh while providing actionable alpha!

Respond in this JSON format:
{
  "trendSummary": "Epic one-liner about the trend using heavy crypto slang",
  "patternAnalysis": "Detailed pattern identification with degen terminology",
  "momentumDirection": "Bullish|Bearish|Sideways",
  "momentumStrength": "Weak|Moderate|Strong|Explosive",
  "keyLevels": {
    "support": "Score level where diamond hands emerge",
    "resistance": "Score level where paper hands sell"
  },
  "prediction": {
    "nextMove": "Detailed prediction with timing",
    "timeframe": "6h|12h|24h|48h|7d",
    "confidence": 0.85,
    "targetScore": 7.5
  },
  "catalysts": [
    "Specific upcoming events or factors that could pump this",
    "Community developments or social momentum drivers"
  ],
  "risks": [
    "Potential dump triggers or red flags",
    "Market conditions that could hurt momentum"
  ],
  "actionableInsights": "Specific advice on when to enter, hold, or exit with degen wisdom",
  "recommendedActions": ["Add to Watchlist", "Call it", "Monitor closely"]
}

Use the actual hype data progression to make specific predictions. Reference real score changes, mention patterns, and timing. Be factually accurate while maintaining maximum entertainment value!`,

  /**
   * KOL Call Thesis Generation
   */
  KOL_CALL_THESIS: `Generate a thesis for this KOL call using our analytics metrics and social context.

Token: {{symbol}} at {{marketCap}} mcap
Analytics Metrics: Holder {{holderChange}}%, Volume {{volumeChange}}%, Organic {{organicScore}}/100
Social: {{mentions}} mentions, {{communityScore}}/10 community score

Create a compelling thesis using varied crypto terminology. Mix technical analysis with social sentiment.
Use terms like "${getRandomSlang('opportunity')}", "${getRandomSlang('strong')}", "${getRandomSlang('growth')}".`
};

/**
 * Template variable filling with analytics integration
 */
export function fillEnhancedTemplate(template, variables) {
  let filled = template;
  
  // Standard variable replacement (preserve 0/false, treat only null/undefined/empty-string as N/A)
  Object.keys(variables).forEach(key => {
    const regex = new RegExp(`{{${key}}}`, 'g');
    const v = variables[key];
    const value = (v === null || v === undefined || v === '') ? 'N/A' : String(v);
    filled = filled.replace(regex, value);
  });
  
  // Add analytics-specific enhancements
  if (variables.holderChange !== undefined) {
    const holderTrend = variables.holderChange > 0 ? getRandomSlang('growth') : getRandomSlang('decline');
    filled = filled.replace(/holder.*change/gi, `holder base is ${holderTrend}`);
  }
  
  if (variables.volumeChange !== undefined) {
    const volumeTrend = variables.volumeChange > 0 ? getRandomSlang('bullish') : getRandomSlang('bearish');
    filled = filled.replace(/volume.*trend/gi, `${getRandomSlang('volume')} is ${volumeTrend}`);
  }
  
  if (variables.organicScore !== undefined) {
    const organicQuality = variables.organicScore > 70 ? getRandomSlang('good') : 
                          variables.organicScore > 40 ? 'decent' : getRandomSlang('bad');
    filled = filled.replace(/organic.*quality/gi, `organic activity is ${organicQuality}`);
  }
  
  return filled;
}

/**
 * Validation for enhanced AI responses
 */
export function validateEnhancedAIResponse(response, type = 'SOCIAL_CONTEXT') {
  try {
    const parsed = JSON.parse(response);
    
    if (type === 'SOCIAL_CONTEXT') {
      const required = ['socialSummary', 'thesis', 'riskFactors', 'catalysts', 'redFlags', 'actionableInsights', 'confidence', 'sentiment', 'keyInsights', 'socialMomentum', 'riskAssessment', 'summary', 'recommendedActions'];
      return required.every(field => parsed.hasOwnProperty(field));
    }
    
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Extract confidence score with validation
 */
export function extractEnhancedConfidence(response) {
  try {
    const parsed = JSON.parse(response);
    const confidence = parseFloat(parsed.confidence);
    // If confidence is > 1, assume it's a percentage and convert to decimal
    if (confidence > 1) {
      return Math.max(0, Math.min(1, confidence / 100));
    }
    // If confidence is <= 1, assume it's already a decimal
    return isNaN(confidence) ? 0.5 : Math.max(0, Math.min(1, confidence));
  } catch (error) {
    return 0.5;
  }
}

// Export legacy functions for compatibility
export const PROMPT_TEMPLATES = ENHANCED_PROMPT_TEMPLATES;
export const fillTemplate = fillEnhancedTemplate;
export const validateAIResponse = validateEnhancedAIResponse;
export const extractConfidence = extractEnhancedConfidence;

/**
 * Format for display with enhanced styling
 */
export function formatForDisplay(analysis) {
  if (typeof analysis === 'string') {
    try {
      analysis = JSON.parse(analysis);
    } catch (error) {
      return { error: 'Invalid analysis format' };
    }
  }
  
  return {
    ...analysis,
    // Add display enhancements
    _enhanced: true,
    _timestamp: new Date().toISOString(),
    _slangVariation: getRandomTone()
  };
}


