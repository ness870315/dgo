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

Token: {symbol} ({name})
Market Cap: {marketCap}
Price: {price}
Volume 24h: {volume24h}
Liquidity: {liquidity}

🔥 KEY METRICS:
- Holder Count: {holderCount} holders
- Holder Change: {holderChange24h}% (24h growth/decline)
- Volume Change: {volumeChange24h}% (momentum indicator)  
- Price Change: {priceChange24h}% (recent performance)
- Organic Score: {organicScore}/100 ({organicScoreLabel})
- Net Buyers: {netBuyers24h} (buy vs sell pressure)
- Buy Volume: {buyVolume24h} vs Sell Volume: {sellVolume24h}

📊 SOCIAL METRICS:
- Total Mentions: {totalMentions} (24h change: {mentions24h})
- Community Score: {communityScore}/10
- Followers: {followers}
- Official Handle: {officialHandle}
- Engagement Rate: {engagementRate}%
- Follower Growth: {followerGrowth}%
- Tweet Frequency: {tweetFrequency} tweets/day
- Influencer Mentions: {influencerMentions}

🐦 RECENT TWEET SENTIMENT:
{tweetSentiments}

🏷️ TRENDING HASHTAGS:
{topHashtags}

💬 RECENT TWEET CONTENT:
{recentTweets}

ANALYSIS INSTRUCTIONS:
🎯 MANDATORY: Use HEAVY crypto slang throughout - be a legendary degen influencer
🔥 Community Analysis: Use {holderChange24h}% holder change, {followerGrowth}% follower growth, and {tweetFrequency} tweets/day to determine if these are "diamond-handed chads" or "paper-handed plebs"
📈 Activity Level: Use {totalMentions} mentions, {engagementRate}% engagement, and {influencerMentions} influencer mentions to assess if community is "vibing harder than a Solana NFT launch" or "deader than a rug pull"
💎 Holder Analysis: Use {netBuyers24h} net buyers and {buyVolume24h} vs {sellVolume24h} volume to determine "diamond hands holding through nuclear winter" vs "paper hands folding faster than a house of cards"
🚀 Hype Detection: Use {organicScore}/100 organic score and {tweetSentiments} sentiment to spot "organic moon missions" vs "forced pump attempts that scream rug pull energy"
⚡ Calculate liquidity flow: {netBuyers24h} net buyers, {buyVolume24h} buy volume vs {sellVolume24h} sell volume
📊 Use {topHashtags} hashtags and {recentTweets} content to build EPIC narratives with crypto slang
🎪 Reference specific social data: {officialHandle} handle, {communityScore}/10 community score, {influencerMentions} influencer mentions

CRITICAL REQUIREMENTS:
- Summary action: Use "Buy", "Hold", "Sell" (not Add to Watchlist)
- Recommended Actions: Use "Add to Watchlist", "Hype over Time", "Call it"
- Reasoning: MUST reference specific data points like "{holderChange24h}% holder growth shows diamond hands", "{tweetSentiments} sentiment indicates moon mission energy"
- Catalysts: Use specific social data like "{influencerMentions} influencer mentions building hype", "{topHashtags} trending hashtags creating FOMO"
- Red Flags: Use specific data like "{organicScore}/100 organic score suggests bot activity", "{sellVolume24h} > {buyVolume24h} shows paper hands dumping"
- Make EVERY analysis unique based on the actual social context data provided
- Use heavy crypto slang: "moon", "diamond hands", "paper hands", "rekt", "based", "cringe", "send it", "ape in", "degen", "alpha play", "moon mission", "rug pull energy", "sus", "vibes", "absolutely sending it", "getting rekt", "diamond-handed chad", "paper-handed pleb", "gigachad", "ngmi", "gmi", "LFG", "WAGMI"

Respond in this JSON format:
{
  "sentiment": "Bullish|Bearish|Neutral",
  "confidence": 0.85,
  "keyInsights": [
    "Price action: Either moon mission energy with strong volume or rug pull incoming with weak hands - vibes are either diamond hands accumulating or paper hands panic selling",
    "Holder analysis: Either viral traction that would make a pandemic jealous or coordinated pump energy - community either absolutely sending it or getting rekt harder than a noob on leverage",
    "Liquidity flow: Either whale confidence with diamond hands energy or liquidity trap with paper hands dumping - vibes are either moon mission ready or rug pull incoming",
    "Hype trajectory: {hypeRegime} regime with {hypeDescription} - either {hypeEmoji} building momentum for the next pump or {hypeEmoji} consolidating before the next move"
  ],
  "socialMomentum": {
    "direction": "Moon Mission|Stable Vibes|Declining Energy",
    "strength": "Diamond Hands|Moderate Degen|Weak Paper Hands",
    "sustainability": "Long Term HODL|Medium Term Play|Short Term Pump"
  },
  "riskAssessment": {
    "level": "Low Risk|Medium Risk|High Risk",
    "factors": ["Either authentic degen energy or bot activity red flags", "Either diamond hands accumulating or paper hands dumping"],
    "mitigants": ["Either moon mission ready or rug pull incoming", "Either viral traction or coordinated pump energy"]
  },
  "communityAnalysis": {
    "organicGrowth": "Viral Traction|Moderate Degen|Weak Paper Hands",
    "engagementQuality": "Diamond Hands|Moderate Energy|Weak Vibes", 
    "influencerSupport": "Moon Mission|Moderate Hype|Weak Signals",
    "botActivity": "Authentic Degen|Moderate Bot|High Bot Activity"
  },
  "recommendation": {
    "action": "Buy|Hold|Sell",
    "reasoning": "Based on holder growth showing strong accumulation energy, community sentiment either absolutely sending it or getting rekt, organic score suggesting either authentic degen vibes or bot activity, and hype trend showing {hypeRegime} regime with {hypeDescription} - either diamond hands moon mission or paper hands rug pull energy!",
    "timeframe": "Short-term|Medium-term|Long-term",
    "entryStrategy": "DCA on dips like a degen who learned from their mistakes, or wait for influencer confirmation signals like a smart degen"
  },
  "catalysts": [
    "HOLDER EXPLOSION: {holderChange24h}% new wallets in 24h - either viral traction that would make a pandemic jealous or coordinated pump energy",
    "SOCIAL MOMENTUM: Community either absolutely sending it with diamond hands energy or getting rekt harder than a noob on leverage - vibes are either moon mission ready or paper hands panic selling",
    "HYPE TREND: {hypeRegime} regime with {hypeDescription} - either {hypeEmoji} moon mission energy building up or {hypeEmoji} consolidation phase before the next move"
  ],
  "redFlags": [
    "ORGANIC SCORE ALERT: {organicScore} organic score suggests bot activity or authentic community vibes - either red flag city or based community",
    "VOLUME DISTRIBUTION: {sellVolume24h} sell volume vs {buyVolume24h} buy volume - either paper hands dumping faster than a house of cards or diamond hands accumulating like there's no tomorrow",
    "SOCIAL ACTIVITY: Community either absolutely sending it with authentic degen energy or getting botted harder than a noob's first leverage trade - vibes are either moon mission ready or rug pull incoming",
    "HYPE MOMENTUM: {hypeRegime} regime showing {hypeDescription} - either {hypeEmoji} fading momentum that could lead to a dump or {hypeEmoji} stable consolidation before the next pump"
  ],
  "recommendedActions": ["Add to Watchlist", "Hype over Time", "Call it"]
}

Focus on actionable insights with heavy crypto slang and specific calculations.

HYPE TREND ANALYSIS:
- Use {hypeRegime} regime data to form creative opinions about momentum
- {hypeDescription} provides context for social momentum direction
- {hypeEmoji} adds visual context to the analysis
- Don't mention specific numbers for hype data - be creative and opinion-based
- If regime is "rising" - suggest building momentum, moon mission energy
- If regime is "fading" - suggest consolidation, potential dump incoming
- If regime is "stable" - suggest waiting for next move, accumulation phase
- Be creative like a crypto influencer analyzing the vibes!

Template variables are now using single brace format for proper parsing.`,

  /**
   * Hype Trend Analysis - For Hype over Time modal
   */
  HYPE_TREND_ANALYSIS: `You are DeGen Oracle's ${getRandomTone()} trend prediction AI. Analyze this token's hype trajectory with maximum degen energy!

🚀 TOKEN ANALYSIS TARGET:
Symbol: {symbol} ({name})
Time Range: {timeRange}
Market Cap: {marketCap}
Current Price: {price}

📊 HYPE DATA TIMELINE:
{hypeData}

🔥 ANALYTICS ENGINE METRICS:
- Holder Change: {holderChange}% (community growth/decline indicator)
- Volume Change: {volumeChange}% (momentum and interest tracker)  
- Price Change: {priceChange}% (recent performance context)
- Organic Score: {organicScore}/100 ({organicScoreLabel}) (authenticity from our AI tools)
- Liquidity: {liquidity} (market depth and slippage risk)

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
      const required = ['sentiment', 'confidence', 'keyInsights', 'socialMomentum', 'riskAssessment', 'communityAnalysis', 'recommendation', 'catalysts', 'redFlags', 'recommendedActions'];
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


