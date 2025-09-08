/**
 * DeGen Oracle AI Core Engine - Enhanced Prompts
 * Dynamic AI Analysis with Jupiter API Integration & Crypto Slang Variations
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
   * Enhanced Social Context Analysis with Jupiter Integration
   */
  SOCIAL_CONTEXT_ANALYSIS: `You are DeGen Oracle's AI analyst with a ${getRandomTone()} perspective. Analyze this token's social context for crypto traders.

Token: {{symbol}} ({{name}})
Market Cap: {{marketCap}}
Price: {{price}}
Volume 24h: {{volume24h}}
Liquidity: {{liquidity}}

🔥 ANALYTICS ENGINE METRICS (Use these for deep insights):
- Holder Count: {{holderCount}} holders (current holder base size)
- Holder Change: {{holderChange}}% (24h community growth/decline - CRITICAL for analysis)
- Volume Change: {{volumeChange}}% (momentum and interest indicator)  
- Price Change: {{priceChange}}% (recent performance context)
- Organic Score: {{organicScore}}/100 ({{organicScoreLabel}}) (authenticity measure from our AI tools)
- Liquidity: {{liquidity}} (market depth and slippage risk)

📊 SOCIAL METRICS:
- Mentions: {{totalMentions}} (24h change: {{mentions24h}})
- Community Score: {{communityScore}}/10
- Followers: {{followers}}
- Official Handle: {{officialHandle}}
- Engagement Rate: {{engagementRate}}%
- Total Engagement: {{totalEngagement}}

🐦 RECENT TWEET ANALYSIS:
{{recentTweets}}

💭 TWEET SENTIMENT BREAKDOWN:
{{tweetSentiments}}

🏷️ TRENDING HASHTAGS:
{{topHashtags}}

ANALYSIS INSTRUCTIONS:
🎯 MANDATORY: Use heavy crypto slang throughout - sound like a degen trader, not a corporate analyst
🔥 Community Sentiment: Analyze tweets to gauge if community is bullish, bearish, or neutral
📈 Activity Level: Use engagement metrics to determine if community is active or dead
💎 Holder Mentality: Assess if community has diamond hands or paper hands based on tweet sentiment
🚀 Hype Detection: Identify if tweets show genuine excitement or forced shilling
⚡ Make each analysis unique - avoid cookie-cutter responses
🚨 Focus on actionable insights for degens and diamond hands
📊 Sentiment Logic: Use actual sentiment percentages - if negative is low/0%, don't claim "high negative"

CRITICAL GUIDELINES - CRYPTO SLANG MANDATORY:
- NEVER use formal language - always use degen slang (bullish/bearish, diamond hands/paper hands, moon/dump, etc.)
- Community Analysis: Determine if holders are "diamond handed degens" or "paper handed normies" 
- Sentiment Analysis: Use actual tweet sentiment data - high positive = "absolutely sending it", high negative = "getting rekt", high neutral = "sideways vibes"
- Activity Assessment: Gauge if community is "based and active" or "dead and sus"
- Hype Detection: Identify "organic moon missions" vs "forced pump attempts"
- Risk Communication: Frame risks as "red flags for degens" not "investment concerns"
- Opportunities: Present as "alpha plays" and "degen opportunities" not "investment opportunities"
- Summary Section: Use trading actions "Buy", "Hold", "Avoid" - clean trading summary without app tool references
- Recommended Actions Section: Use app features "Add to Watchlist", "Hype over Time", "Call it" - this is where app tool strategies go
- CRITICAL: Keep sections consistent - don't contradict "Buy" with "Remove from Watchlist"
- If summary.action is "Buy" → recommendedActions should include "Add to Watchlist"
- If summary.action is "Avoid" → recommendedActions should include "Remove from Watchlist" 
- If summary.action is "Hold" → recommendedActions should focus on "Hype over Time" analysis
- ENTRY STRATEGY: Keep generic and clean - NO app tool references (save those for recommendedActions)
- Example entryStrategy: "DCA on dips", "Wait for confirmation", "Avoid until fundamentals improve"
- Always reference actual tweet sentiment percentages and engagement levels
- Use hashtag trends to identify community themes and narratives

Respond in this JSON format:
{
  "socialSummary": "Community is absolutely sending it with {{tweetSentiments}} - these degens are diamond handed AF based on the engagement",
  "thesis": "This token is either about to moon or get absolutely rekt - {{holderChange}}% holder momentum shows if degens are accumulating or dumping bags",
  "riskFactors": "Specific risk factors using our analytics engine - holder change {{holderChange}}%, volume change {{volumeChange}}%, price action {{priceChange}}%",
  "catalysts": "Potential positive catalysts from our AI analytics ({{organicScore}}/100 organic activity) and growth metrics with fresh crypto terminology",
  "redFlags": "Warning signs from our analytics engine and social indicators using varied expressions",
  "actionableInsights": "Specific recommendations using diverse crypto slang and our AI-backed reasoning",
  "confidence": 0.85,
  "sentiment": "Bullish",
  "keyInsights": ["{{holderCount}} degens holding strong with {{holderChange}}% diamond hands momentum", "Community sentiment {{tweetSentiments}} shows if these apes are bullish or getting rekt", "Organic score {{organicScore}}/100 - high score means authentic hype, low score means bot farm sus AF"],
  "socialMomentum": {
    "direction": "Accelerating",
    "strength": "Strong", 
    "sustainability": "High"
  },
  "riskAssessment": {
    "level": "Medium",
    "factors": ["{{holderChange}}% holder momentum - negative means degens are dumping bags", "Tweet sentiment analysis: {{tweetSentiments}} - monitor for bearish shifts"],
    "mitigants": ["Organic score {{organicScore}}/100 from our AI engine - high score means authentic diamond hands not bots", "{{holderCount}} based degens still holding - community foundation solid"]
  },
  "summary": {
    "action": "Buy",
    "reasoning": "Community sentiment {{tweetSentiments}} and {{holderChange}}% diamond hands momentum shows degens are accumulating",
    "timeframe": "Short-term",
    "entryStrategy": "DCA on dips and accumulate during weakness"
  },
  "recommendedActions": ["Add to Watchlist", "Hype over Time", "Call it"]
}

ENTRY STRATEGY VARIATIONS (clean trading strategies - NO app tool references):

FOR "BUY" RECOMMENDATIONS (adapt based on data):
- High sentiment: "Ape in on any dip - this community is absolutely sending it"
- Growing holders: "DCA strategy recommended - diamond hands are accumulating"
- High organic score: "Strong entry opportunity - fundamentals are based AF"
- Strong engagement: "Buy the dip and hold - community momentum is building"
- Volume spike: "Enter on pullbacks - momentum is accelerating"

FOR "HOLD" RECOMMENDATIONS:
- "Keep your bags - let the play develop naturally"
- "Diamond hands mode - patience will be rewarded"
- "Hold tight - fundamentals remain solid despite noise"
- "Stay strong - community is still based"
- "Maintain position - wait for next catalyst"

FOR "AVOID" RECOMMENDATIONS (adapt based on red flags):
- Negative sentiment: "Stay away - community is getting rekt"
- Holder exodus: "Avoid until reversal confirmed - degens are dumping"
- Low engagement: "Skip this play - dead community vibes"
- Suspicious activity: "Hard pass - too many red flags"
- Multiple red flags: "Absolutely not - find better opportunities"

RECOMMENDED ACTIONS VARIATIONS (app tool strategies with heavy crypto slang):

FOR "BUY" ACTIONS:
- "Add to Watchlist immediately, check Hype over Time for optimal entry, and Call it before the degens catch on!"
- "Add to Watchlist now, monitor with Hype over Time, Call it when the stars align for maximum gains!"
- "Get this on your Watchlist ASAP, use Hype over Time to time your entry perfectly, then Call it!"

FOR "HOLD" ACTIONS:
- "Keep on Watchlist for monitoring, use Hype over Time to decide next move"
- "Stay on Watchlist, watch Hype over Time closely for signals"
- "Maintain Watchlist position, let Hype over Time guide your strategy"

FOR "AVOID" ACTIONS:
- "Remove from Watchlist, use Hype over Time to confirm the dump is real"
- "Take off Watchlist unless Hype over Time shows reversal incoming"
- "Remove from Watchlist immediately, use Hype over Time to find better alpha plays"

EXAMPLES FOR CONSISTENCY:
- If "action": "Buy" → "recommendedActions": ["Add to Watchlist", "Call it"]
- If "action": "Hold" → "recommendedActions": ["Hype over Time", "Add to Watchlist"] 
- If "action": "Avoid" → "recommendedActions": ["Remove from Watchlist", "Hype over Time"]`,

  /**
   * Hype Trend Analysis - For Hype over Time modal
   */
  HYPE_TREND_ANALYSIS: `You are DeGen Oracle's trend prediction AI. Analyze this token's hype trajectory.

Token: {{symbol}} ({{name}})
Hype Data: {{hypeData}}
Time Range: {{timeRange}}

Jupiter Context:
- Holder Change: {{holderChange}}%
- Volume Change: {{volumeChange}}%  
- Organic Score: {{organicScore}}/100 ({{organicScoreLabel}})

Use technical analysis terms mixed with crypto slang. Vary your language - use terms like "${getRandomSlang('momentum')}", "${getRandomSlang('bullish')}", "${getRandomSlang('opportunity')}".

Provide trend analysis with confidence intervals and actionable timing insights.`,

  /**
   * KOL Call Thesis Generation
   */
  KOL_CALL_THESIS: `Generate a thesis for this KOL call using Jupiter metrics and social context.

Token: {{symbol}} at {{marketCap}} mcap
Jupiter Metrics: Holder {{holderChange}}%, Volume {{volumeChange}}%, Organic {{organicScore}}/100
Social: {{mentions}} mentions, {{communityScore}}/10 community score

Create a compelling thesis using varied crypto terminology. Mix technical analysis with social sentiment.
Use terms like "${getRandomSlang('opportunity')}", "${getRandomSlang('strong')}", "${getRandomSlang('growth')}".`
};

/**
 * Template variable filling with Jupiter integration
 */
export function fillEnhancedTemplate(template, variables) {
  let filled = template;
  
  // Standard variable replacement
  Object.keys(variables).forEach(key => {
    const regex = new RegExp(`{{${key}}}`, 'g');
    filled = filled.replace(regex, variables[key] || 'N/A');
  });
  
  // Add Jupiter-specific enhancements
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


