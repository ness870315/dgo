/**
 * Technical Analysis Service
 * 
 * Generates comprehensive TA reports with:
 * - Jupiter metadata (price, market cap, volume)
 * - Technical indicators (RSI, MACD, Bollinger, EMAs)
 * - Support/resistance levels
 * - AI-powered trading strategy using Grok
 * 
 * @author Degen Oracle Team
 */

import fetch from 'node-fetch';

const JUPITER_API_ENDPOINT = process.env.JUP_API_ENDPOINT || 'https://api.jup.ag';
const JUPITER_API_KEY = process.env.JUP_API_KEY || '';
const GROK_API_KEY = process.env.GROK_API || ''; // Same as Trending AI service
const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY || '';

class TechnicalAnalysisService {
  constructor(hybridChartService = null) {
    this.jupiterEndpoint = JUPITER_API_ENDPOINT;
    this.jupiterApiKey = JUPITER_API_KEY;
    this.grokApiKey = GROK_API_KEY;
    this.perplexityApiKey = PERPLEXITY_API_KEY;
    this.hybridChartService = hybridChartService;
    
    // Log API key status
    console.log(`🔧 [TA Service] Initialized`);
    console.log(`   Jupiter API Key: ${this.jupiterApiKey ? 'SET' : 'MISSING ⚠️'}`);
    console.log(`   Grok API Key: ${this.grokApiKey ? 'SET ✅' : 'MISSING ⚠️'}`);
    console.log(`   Perplexity API Key: ${this.perplexityApiKey ? 'SET ✅' : 'MISSING ⚠️'}`);
    console.log(`   Moralis OHLCV: ${this.hybridChartService ? 'AVAILABLE ✅' : 'USING SYNTHETIC ⚠️'}`);
  }

  /**
   * Main analysis function
   */
  async analyzeToken(contractAddress, timeframe = '1h', depth = 'standard') {
    try {
      console.log(`\n📊 [TA] Analyzing ${contractAddress.substring(0, 8)}...`);
      
      // 1. Fetch Jupiter metadata
      const jupiterData = await this.fetchJupiterMetadata(contractAddress);
      const currentPrice = jupiterData.usdPrice;
      
      // 2. Generate comprehensive TA using Perplexity sonar-pro (primary TA generator)
      const perplexityTA = await this.generatePerplexityTA(
        jupiterData.name,
        jupiterData.symbol,
        contractAddress,
        currentPrice,
        jupiterData.marketCap,
        jupiterData.volume24h,
        timeframe
      );
      
      // 3. Use Grok to wrap Perplexity's TA in Oracle Verdict format (degen slang)
      let oracleVerdict;
      if (this.grokApiKey && perplexityTA) {
        try {
          console.log(`🤖 [TA] Wrapping Perplexity TA in Oracle Verdict with Grok...`);
          oracleVerdict = await this.generateOracleVerdict(perplexityTA, jupiterData);
          console.log(`✅ [TA] Oracle Verdict complete`);
        } catch (error) {
          console.log(`⚠️  [TA] Grok failed (${error.message}), using default verdict`);
          oracleVerdict = this.generateDefaultVerdict();
        }
      } else {
        console.log(`⚠️  [TA] No Grok API key or Perplexity TA, using default verdict`);
        oracleVerdict = this.generateDefaultVerdict();
      }
      
      // 4. Build final report (Perplexity TA + Grok Oracle Verdict)
      const report = {
        success: true,
        token: {
          name: jupiterData.name,
          symbol: jupiterData.symbol,
          address: contractAddress,
          price: currentPrice,
          marketCap: jupiterData.marketCap,
          volume24h: jupiterData.volume24h,
          priceChange24h: jupiterData.priceChange24h,
          holderCount: jupiterData.holderCount,
          organicScore: jupiterData.organicScore,
          organicScoreLabel: jupiterData.organicScoreLabel
        },
        technical_analysis: perplexityTA || { error: 'No TA available' },
        oracle_verdict: oracleVerdict,
        data_sources: {
          technical_analysis: perplexityTA ? 'perplexity-sonar-pro' : 'none',
          oracle_verdict: this.grokApiKey ? 'grok' : 'default'
        },
        generated_at: new Date().toISOString()
      };

      return report;

    } catch (error) {
      console.error(`❌ [TA] Error analyzing token:`, error.message);
      throw error;
    }
  }

  /**
   * Generate comprehensive Technical Analysis using Perplexity sonar-pro
   * This is the PRIMARY TA generator - produces detailed chart analysis, indicators, levels
   */
  async generatePerplexityTA(tokenName, tokenSymbol, contractAddress, currentPrice, marketCap, volume24h, timeframe) {
    if (!this.perplexityApiKey) {
      console.log(`⚠️  [TA] No Perplexity API key, skipping real-time search`);
      return null;
    }

    try {
      console.log(`📊 [TA] Generating comprehensive TA for ${tokenName} using Perplexity sonar-pro...`);

      // Map timeframe to display names
      const timeframeDisplay = {
        '5m': '5-minute',
        '10m': '10-minute',
        '15m': '15-minute',
        '1h': '1-hour',
        '4h': '4-hour',
        '1d': 'daily'
      };
      const tfDisplay = timeframeDisplay[timeframe] || timeframe;
      
      const query = `Provide a comprehensive ${tfDisplay} technical analysis for the Solana SPL token "${tokenName}" (${tokenSymbol}) currently trading at $${currentPrice.toFixed(6)} with market cap $${marketCap.toLocaleString()}.

**CONTRACT ADDRESS (SOLANA ONLY):** ${contractAddress}
**CRITICAL:** This is a Solana blockchain token. IGNORE any other tokens with similar names on Ethereum, BSC, Polygon, or other chains. ONLY analyze this Solana contract.

**REQUIRED ANALYSIS SECTIONS:**

1. **Current ${tfDisplay.toUpperCase()} Chart Structure:**
   - Describe the price action over the last several hours/days relevant to this timeframe
   - Is it in an uptrend, downtrend, or range?
   - Key highs and lows forming the structure

2. **Technical Indicators (${tfDisplay} timeframe):**
   - RSI (14): Current value and signal (oversold <30, neutral 30-70, overbought >70)
   - MACD: Current reading, histogram, and crossover status
   - Bollinger Bands: Is price at upper band, middle, or lower band? Any squeeze?
   - EMAs: 9, 21, 50 EMA alignment and crossovers
   - Volume: Current volume vs recent average, any spikes?

3. **Support & Resistance Levels:**
   - Immediate support levels (with specific prices)
   - Immediate resistance levels (with specific prices)
   - Key psychological levels or round numbers

4. **Chart Patterns & Price Action:**
   - Any recognizable patterns forming (triangles, flags, head & shoulders, etc.)?
   - Recent breakouts or breakdowns?
   - Liquidity zones or stop hunts?

5. **Market Context & Catalysts:**
   - Recent news, announcements, or CEX listings
   - Social sentiment and community activity
   - Whale transactions or unusual activity
   - Any upcoming events

**OUTPUT REQUIREMENTS:**
- Use SPECIFIC numbers: exact RSI values, price levels, percentages
- Cite your sources where possible
- Be actionable for traders
- Focus on the ${tfDisplay} timeframe structure
- Include dates/times for recent events

Check sources like:
- DexScreener Solana: dexscreener.com/solana/${contractAddress}
- Birdeye: birdeye.so/token/${contractAddress}
- Solscan: solscan.io/token/${contractAddress}
- Trading discussions for Solana tokens

If you cannot find sufficient Solana-specific technical data for this exact contract address, clearly state "Limited Solana-specific technical data available for this token" and provide what analysis you can from the price and market cap data provided.`;

      const response = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.perplexityApiKey}`
        },
        body: JSON.stringify({
          model: 'sonar-pro',
          messages: [
            {
              role: 'system',
              content: 'You are an expert crypto technical analyst specializing in Solana tokens. Generate comprehensive, actionable technical analysis with SPECIFIC indicator values, price levels, and chart structures. Use data from DexScreener, Birdeye, Solscan, and trading communities. CRITICAL: Only analyze the SPECIFIC Solana contract mentioned. If you cannot find sufficient technical data for this exact Solana token, clearly state it.'
            },
            {
              role: 'user',
              content: query
            }
          ],
          temperature: 0.3,
          max_tokens: 1500,
          return_citations: true
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Perplexity API error: ${response.status} - ${errorText.substring(0, 200)}`);
        return null;
      }

      const result = await response.json();
      const taContent = result.choices[0].message.content;
      const citations = result.citations || [];

      console.log(`✅ [TA] Perplexity sonar-pro analysis complete (${citations.length} sources)`);

      return {
        raw_analysis: taContent,
        sources: citations,
        timeframe: tfDisplay,
        generated_at: new Date().toISOString(),
        timestamp: Date.now()
      };

    } catch (error) {
      console.error(`❌ [TA] Perplexity search failed:`, error.message);
      return null;
    }
  }

  /**
   * Wrap Perplexity's TA in Oracle Verdict format using Grok (degen slang + emoji)
   */
  async generateOracleVerdict(perplexityTA, jupiterData) {
    if (!this.grokApiKey) {
      console.log(`⚠️  [TA] No Grok API key`);
      return this.generateDefaultVerdict();
    }

    try {
      const prompt = `You are the DEGEN ORACLE - a legendary crypto trader who speaks in heavy crypto slang and emoji.

**YOUR TASK:** Wrap this technical analysis in your signature style and give a VERDICT.

**PERPLEXITY TA:**
${perplexityTA.raw_analysis}

**TOKEN DATA:**
- ${jupiterData.name} (${jupiterData.symbol})
- Price: $${jupiterData.usdPrice}
- Market Cap: $${jupiterData.marketCap?.toLocaleString()}
- Volume 24h: $${jupiterData.volume24h?.toLocaleString()}
- Organic Score: ${jupiterData.organicScore || 'N/A'}

**YOUR ORACLE VERDICT MUST INCLUDE:**

1. **Quick Summary** (2-3 sentences in HEAVY crypto slang)
   - Use terms like: "bullish af", "bearish", "crabbing", "chopping", "consolidation", "breakout szn", "distribution", "accumulation", "moon mission", "dump incoming", "hold the bags", "diamond hands", "paper hands", etc.
   - Include 2-3 emoji per sentence 🚀🔥💎📉📈🐋

2. **KEY LEVELS** (Support/Resistance in degen speak)
   - Example: "🎯 Support at $X (don't fade below this or ngmi)"
   - Example: "🚀 Resistance at $Y (break this and we moon)"

3. **VERDICT** (One of these, with reasoning):
   - **🟢 CALL IT** = Bullish, enter now or DCA
   - **🟡 WAIT FOR CALL** = Wait for better entry (specify conditions)
   - **🔴 FADE IT** = Bearish, stay away or take profits
   - **⚪ WATCHLIST** = Interesting but need more confirmation

4. **RISK LEVEL** (with crypto slang explanation):
   - 🟢 LOW RISK (safe for normies)
   - 🟡 MEDIUM RISK (degen territory)
   - 🔴 HIGH RISK (ape at your own risk)
   - ⚫ EXTREME RISK (lottery ticket, prepare to get rekt)

**STYLE RULES:**
- Use crypto slang HEAVILY (gm, ngmi, wagmi, degen, ape, moon, bags, ser, anon, fren, etc.)
- Include emoji in EVERY section 🚀💎🔥📉📈🐋🎯⚠️
- Be SPECIFIC with levels and conditions
- Don't sugarcoat risks
- Keep it real - if it's a shitcoin, say it

**OUTPUT AS JSON:**
\`\`\`json
{
  "summary": "...",
  "key_levels": {
    "support": "...",
    "resistance": "..."
  },
  "verdict": "CALL IT | WAIT FOR CALL | FADE IT | WATCHLIST",
  "verdict_emoji": "🟢 | 🟡 | 🔴 | ⚪",
  "reasoning": "...",
  "risk_level": "LOW | MEDIUM | HIGH | EXTREME",
  "risk_emoji": "🟢 | 🟡 | 🔴 | ⚫",
  "risk_explanation": "..."
}
\`\`\``;

      const response = await fetch(this.grokEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.grokApiKey}`
        },
        body: JSON.stringify({
          model: 'grok-4-1-fast-reasoning',
          messages: [
            { role: 'user', content: prompt }
          ],
          temperature: 0.9, // High creativity for degen slang
          max_tokens: 1000
        })
      });

      if (!response.ok) {
        throw new Error(`Grok API error: ${response.status}`);
      }

      const result = await response.json();
      const content = result.choices[0].message.content;

      // Extract JSON from response
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const verdictJSON = JSON.parse(jsonMatch[1] || jsonMatch[0]);
        return verdictJSON;
      }

      // Fallback: return raw content
      return {
        summary: content,
        verdict: 'WATCHLIST',
        verdict_emoji: '⚪',
        risk_level: 'HIGH',
        risk_emoji: '🔴'
      };

    } catch (error) {
      console.error(`❌ [TA] Grok Oracle Verdict failed:`, error.message);
      return this.generateDefaultVerdict();
    }
  }

  /**
   * Generate default verdict if Grok fails
   */
  generateDefaultVerdict() {
    return {
      summary: "🤖 Oracle analysis pending - check back soon, fren",
      key_levels: {
        support: "Check chart for recent lows",
        resistance: "Check chart for recent highs"
      },
      verdict: "WATCHLIST",
      verdict_emoji: "⚪",
      reasoning: "Insufficient data for Oracle verdict. DYOR before aping.",
      risk_level: "HIGH",
      risk_emoji: "🔴",
      risk_explanation: "All crypto is high risk, ser. Only invest what you can afford to lose. NFA."
    };
  }

  /**
   * Fetch token metadata from Jupiter Tokens API V2
   */
  async fetchJupiterMetadata(tokenAddress) {
    const url = `${this.jupiterEndpoint}/tokens/v2/search?query=${tokenAddress}`;
    
    const headers = {
      'accept': 'application/json'
    };
    
    if (this.jupiterApiKey) {
      headers['x-api-key'] = this.jupiterApiKey;
    }
    
    const response = await fetch(url, {
      method: 'GET',
      headers
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Jupiter API error: ${response.status} - ${errorText.substring(0, 200)}`);
    }
    
    const data = await response.json();
    
    if (!data || !Array.isArray(data) || data.length === 0) {
      throw new Error('Token not found in Jupiter');
    }
    
    const tokenData = data[0];

    return {
      address: tokenData.id,
      name: tokenData.name,
      symbol: tokenData.symbol,
      icon: tokenData.icon,
      decimals: tokenData.decimals,
      usdPrice: tokenData.usdPrice,
      marketCap: tokenData.mcap,
      liquidity: tokenData.liquidity,
      circSupply: tokenData.circSupply,
      totalSupply: tokenData.totalSupply,
      holderCount: tokenData.holderCount,
      volume24h: (tokenData.stats24h?.buyVolume || 0) + (tokenData.stats24h?.sellVolume || 0),
      priceChange24h: tokenData.stats24h?.priceChange,
      organicScore: tokenData.organicScore,
      organicScoreLabel: tokenData.organicScoreLabel
    };
  }

  /**
   * Fetch real OHLCV data from Moralis via HybridChartService
   */
  async fetchMoralisOHLCV(tokenAddress, timeframe) {
    if (!this.hybridChartService) {
      throw new Error('HybridChartService not available');
    }

    try {
      // Step 1: Discover pair/pool address (Moralis needs this, not token address)
      console.log(`🔍 [TA] Discovering pair address for ${tokenAddress.substring(0, 8)}...`);
      const pairAddress = await this.hybridChartService.getPairAddress(tokenAddress);
      
      if (!pairAddress) {
        throw new Error('Could not discover pair address - token may not have liquidity pool');
      }
      
      console.log(`✅ [TA] Found pair address: ${pairAddress.substring(0, 8)}...`);

      // Step 2: Map our timeframes to Moralis format
      // Moralis supports: 1s, 10s, 30s, 1min, 5min, 10min, 30min, 1h, 4h, 12h, 1d, 1w, 1M
      // If user requests unsupported timeframe, use next smaller value
      const timeframeMap = {
        '1s': '1s',
        '10s': '10s',
        '30s': '30s',
        '1m': '1min',
        '1min': '1min',
        '5m': '5min',
        '5min': '5min',
        '10m': '10min',
        '10min': '10min',
        '15m': '10min',   // 15min not supported, use 10min (next smaller)
        '15min': '10min',
        '30m': '30min',
        '30min': '30min',
        '1h': '1h',
        '1hour': '1h',
        '4h': '4h',
        '4hour': '4h',
        '12h': '12h',
        '12hour': '12h',
        '1d': '1d',
        '1day': '1d',
        '1w': '1w',
        '1week': '1w',
        '1M': '1M',
        '1month': '1M'
      };
      
      const moralisTimeframe = timeframeMap[timeframe] || '1h'; // Default to 1h if unknown
      console.log(`📊 [TA] Mapped timeframe: ${timeframe} → ${moralisTimeframe}`);
      
      const limit = 100; // Get last 100 candles
      
      // Step 3: Fetch OHLCV data using PAIR address
      console.log(`📊 [TA] Fetching OHLCV for pair ${pairAddress.substring(0, 8)}...`);
      const chartData = await this.hybridChartService.getChartData(
        pairAddress, // Use pair address, not token address
        moralisTimeframe,
        limit
      );
      
      if (!chartData || !chartData.ohlcv || chartData.ohlcv.length === 0) {
        throw new Error('No OHLCV data returned from Moralis');
      }
      
      console.log(`✅ [TA] Got ${chartData.ohlcv.length} candles from Moralis (source: ${chartData.source})`);
      
      // Convert to our format
      return chartData.ohlcv.map(candle => ({
        timestamp: candle.timestamp,
        open: candle.open.toString(),
        high: candle.high.toString(),
        low: candle.low.toString(),
        close: candle.close.toString(),
        volume: (candle.volume || 0).toString()
      }));
      
    } catch (error) {
      console.error(`❌ [TA] Moralis OHLCV error:`, error.message);
      throw error;
    }
  }

  /**
   * Generate synthetic OHLCV for demonstration (fallback)
   */
  generateSyntheticOHLCV(currentPrice, timeframe = '1h', numCandles = 100) {
    const ohlcv = [];
    const now = Date.now();
    
    // Map timeframe to milliseconds for candle spacing
    const timeframeMs = {
      '1s': 1000,
      '10s': 10000,
      '30s': 30000,
      '1m': 60000,
      '1min': 60000,
      '5m': 5 * 60000,
      '5min': 5 * 60000,
      '10m': 10 * 60000,
      '10min': 10 * 60000,
      '15m': 15 * 60000,
      '15min': 15 * 60000,
      '30m': 30 * 60000,
      '30min': 30 * 60000,
      '1h': 60 * 60000,
      '1hour': 60 * 60000,
      '4h': 4 * 60 * 60000,
      '4hour': 4 * 60 * 60000,
      '12h': 12 * 60 * 60000,
      '12hour': 12 * 60 * 60000,
      '1d': 24 * 60 * 60000,
      '1day': 24 * 60 * 60000,
      '1w': 7 * 24 * 60 * 60000,
      '1week': 7 * 24 * 60 * 60000,
      '1M': 30 * 24 * 60 * 60000,
      '1month': 30 * 24 * 60 * 60000
    };
    
    const candleIntervalMs = timeframeMs[timeframe] || 60 * 60000; // Default to 1h
    let price = currentPrice * 0.95; // Start 5% lower
    
    for (let i = 0; i < numCandles; i++) {
      const timestamp = now - (numCandles - i) * candleIntervalMs;
      const volatility = 0.02; // 2% volatility per candle
      
      const open = price;
      const change = (Math.random() - 0.5) * price * volatility;
      const close = price + change;
      const high = Math.max(open, close) * (1 + Math.random() * volatility);
      const low = Math.min(open, close) * (1 - Math.random() * volatility);
      const volume = 100000 + Math.random() * 500000;
      
      ohlcv.push({
        timestamp: timestamp / 1000,
        open: open.toString(),
        high: high.toString(),
        low: low.toString(),
        close: close.toString(),
        volume: volume.toString()
      });
      
      price = close;
    }
    
    return ohlcv;
  }

  /**
   * Calculate RSI
   */
  calculateRSI(ohlcv, period = 14) {
    if (ohlcv.length < period + 1) {
      return { value: null, signal: 'insufficient_data', interpretation: 'Not enough data' };
    }
    
    const closes = ohlcv.map(candle => parseFloat(candle.close)).slice(-period - 1);
    
    let gains = 0;
    let losses = 0;
    
    for (let i = 1; i < closes.length; i++) {
      const change = closes[i] - closes[i - 1];
      if (change > 0) {
        gains += change;
      } else {
        losses += Math.abs(change);
      }
    }
    
    const avgGain = gains / period;
    const avgLoss = losses / period;
    
    if (avgLoss === 0) {
      return { value: 100, signal: 'overbought', interpretation: 'RSI at 100 - extremely overbought' };
    }
    
    const rs = avgGain / avgLoss;
    const rsi = 100 - (100 / (1 + rs));
    
    let signal = 'neutral';
    let interpretation = '';
    if (rsi > 70) {
      signal = 'overbought';
      interpretation = 'RSI above 70 - token overbought, potential reversal incoming';
    } else if (rsi < 30) {
      signal = 'oversold';
      interpretation = 'RSI below 30 - token oversold, potential bounce opportunity';
    } else if (rsi > 60) {
      signal = 'approaching_overbought';
      interpretation = 'Strong buying pressure, watch for reversal above 70';
    } else if (rsi < 40) {
      signal = 'approaching_oversold';
      interpretation = 'Selling pressure building, watch for bounce below 30';
    } else {
      interpretation = 'RSI neutral - no extreme conditions';
    }
    
    return { value: rsi, signal, interpretation };
  }

  /**
   * Calculate MACD
   */
  calculateMACD(ohlcv, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
    if (ohlcv.length < slowPeriod + signalPeriod) {
      return { 
        value: null, 
        signal: null, 
        histogram: null, 
        crossover: 'insufficient_data',
        interpretation: 'Not enough data'
      };
    }
    
    const closes = ohlcv.map(candle => parseFloat(candle.close));
    
    const fastEMA = this.calculateEMA(closes, fastPeriod);
    const slowEMA = this.calculateEMA(closes, slowPeriod);
    
    const macdLine = fastEMA - slowEMA;
    const signalLine = macdLine * 0.9; // Simplified
    const histogram = macdLine - signalLine;
    
    let crossover = 'none';
    let interpretation = '';
    if (macdLine > signalLine && histogram > 0) {
      crossover = 'bullish';
      interpretation = 'MACD crossed above signal - bullish momentum confirmed';
    } else if (macdLine < signalLine && histogram < 0) {
      crossover = 'bearish';
      interpretation = 'MACD crossed below signal - bearish momentum confirmed';
    } else {
      interpretation = 'MACD neutral - waiting for crossover signal';
    }
    
    return {
      value: macdLine,
      signal: signalLine,
      histogram,
      crossover,
      interpretation
    };
  }

  /**
   * Calculate EMA
   */
  calculateEMA(data, period) {
    if (data.length < period) return data[data.length - 1];
    
    const multiplier = 2 / (period + 1);
    let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
    
    for (let i = period; i < data.length; i++) {
      ema = (data[i] - ema) * multiplier + ema;
    }
    
    return ema;
  }

  /**
   * Calculate Bollinger Bands
   */
  calculateBollingerBands(ohlcv, period = 20, stdDev = 2) {
    if (ohlcv.length < period) {
      return { 
        upper: null, 
        middle: null, 
        lower: null, 
        position: 'insufficient_data',
        squeeze: false,
        interpretation: 'Not enough data'
      };
    }
    
    const closes = ohlcv.map(candle => parseFloat(candle.close)).slice(-period);
    const currentPrice = closes[closes.length - 1];
    
    const middle = closes.reduce((a, b) => a + b, 0) / period;
    
    const squaredDiffs = closes.map(close => Math.pow(close - middle, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / period;
    const standardDeviation = Math.sqrt(variance);
    
    const upper = middle + (standardDeviation * stdDev);
    const lower = middle - (standardDeviation * stdDev);
    
    let position = 'middle';
    const upperThreshold = middle + (standardDeviation * stdDev * 0.8);
    const lowerThreshold = middle - (standardDeviation * stdDev * 0.8);
    
    if (currentPrice >= upperThreshold) position = 'upper';
    else if (currentPrice <= lowerThreshold) position = 'lower';
    
    const bandwidth = ((upper - lower) / middle) * 100;
    const squeeze = bandwidth < 5;
    
    let interpretation = '';
    if (position === 'upper' && squeeze) {
      interpretation = 'Price at upper band during squeeze - breakout imminent';
    } else if (position === 'lower' && squeeze) {
      interpretation = 'Price at lower band during squeeze - breakout imminent';
    } else if (position === 'upper') {
      interpretation = 'Price near upper band - overbought, potential reversal';
    } else if (position === 'lower') {
      interpretation = 'Price near lower band - oversold, potential bounce';
    } else if (squeeze) {
      interpretation = 'Bollinger squeeze detected - volatility compression, big move coming';
    } else {
      interpretation = 'Price trading near middle band - neutral, watching for direction';
    }
    
    return {
      upper,
      middle,
      lower,
      position,
      squeeze,
      bandwidth,
      interpretation
    };
  }

  /**
   * Calculate multiple EMAs
   */
  calculateEMAs(ohlcv) {
    const closes = ohlcv.map(candle => parseFloat(candle.close));
    
    const ema9 = this.calculateEMA(closes, 9);
    const ema21 = this.calculateEMA(closes, 21);
    const ema50 = this.calculateEMA(closes, 50);
    
    let trend = 'neutral';
    let interpretation = '';
    if (ema9 > ema21 && ema21 > ema50) {
      trend = 'bullish';
      interpretation = 'All EMAs in bullish alignment - strong uptrend';
    } else if (ema9 < ema21 && ema21 < ema50) {
      trend = 'bearish';
      interpretation = 'All EMAs in bearish alignment - strong downtrend';
    } else {
      interpretation = 'EMAs mixed - no clear trend';
    }

    return {
      ema_9: ema9,
      ema_21: ema21,
      ema_50: ema50,
      trend,
      interpretation
    };
  }

  /**
   * Analyze volume
   */
  analyzeVolume(ohlcv) {
    if (ohlcv.length < 20) {
      return { current: 0, avg_20: 0, spike: false, ratio: 0, interpretation: 'Not enough data' };
    }
    
    const volumes = ohlcv.map(candle => parseFloat(candle.volume)).slice(-20);
    const currentVolume = volumes[volumes.length - 1];
    const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;
    
    const ratio = currentVolume / avgVolume;
    const spike = ratio > 1.5;
    
    let interpretation = '';
    if (spike) {
      interpretation = `Volume spike detected (${ratio.toFixed(2)}x average) - genuine interest`;
    } else if (ratio > 1.2) {
      interpretation = 'Volume above average - increased activity';
    } else {
      interpretation = 'Volume normal - typical trading activity';
    }
    
    return {
      current: currentVolume,
      avg_20: avgVolume,
      spike,
      ratio,
      interpretation
    };
  }

  /**
   * Calculate support and resistance levels
   */
  calculateSupportResistance(ohlcv, currentPrice) {
    if (ohlcv.length < 50) {
      return {
        strong_resistance: [],
        resistance: [],
        current_price: currentPrice,
        support: [],
        strong_support: []
      };
    }
    
    const highs = ohlcv.map(c => parseFloat(c.high));
    const lows = ohlcv.map(c => parseFloat(c.low));
    
    const resistanceLevels = [];
    const supportLevels = [];
    
    for (let i = 2; i < ohlcv.length - 2; i++) {
      if (highs[i] > highs[i-1] && highs[i] > highs[i-2] && 
          highs[i] > highs[i+1] && highs[i] > highs[i+2]) {
        resistanceLevels.push(highs[i]);
      }
      
      if (lows[i] < lows[i-1] && lows[i] < lows[i-2] && 
          lows[i] < lows[i+1] && lows[i] < lows[i+2]) {
        supportLevels.push(lows[i]);
      }
    }
    
    const resistance = resistanceLevels
      .filter(level => level > currentPrice && level < currentPrice * 1.2)
      .sort((a, b) => a - b)
      .slice(0, 2);
      
    const support = supportLevels
      .filter(level => level < currentPrice && level > currentPrice * 0.8)
      .sort((a, b) => b - a)
      .slice(0, 2);
    
    const strong_resistance = resistanceLevels
      .filter(level => level >= currentPrice * 1.2 && level < currentPrice * 1.5)
      .sort((a, b) => a - b)
      .slice(0, 2);
      
    const strong_support = supportLevels
      .filter(level => level <= currentPrice * 0.8 && level > currentPrice * 0.5)
      .sort((a, b) => b - a)
      .slice(0, 2);
    
    return {
      strong_resistance,
      resistance,
      current_price: currentPrice,
      support,
      strong_support
    };
  }

  /**
   * Generate AI analysis using Grok
   */
  async generateAIAnalysis(data) {
    if (!this.grokApiKey) {
      throw new Error('Grok API key not configured');
    }

    const prompt = `You are the Degen Oracle AI - an expert crypto technical analyst with a degen edge. Analyze this token and provide a trading strategy.

**TOKEN DATA:**
- Name: ${data.token.name} (${data.token.symbol})
- Current Price: $${data.token.price.toFixed(6)}
- Market Cap: $${data.token.marketCap.toLocaleString()}
- 24h Volume: $${data.token.volume24h.toLocaleString()}
- Price Change 24h: ${data.token.priceChange24h ? (data.token.priceChange24h > 0 ? '+' : '') + data.token.priceChange24h.toFixed(2) + '%' : 'N/A'}
- Holders: ${data.token.holderCount ? data.token.holderCount.toLocaleString() : 'N/A'}
- Organic Score: ${data.token.organicScoreLabel || 'N/A'}

${data.perplexityData && data.perplexityData.content ? `**REAL-TIME MARKET INTELLIGENCE (from Degen Oracle's real-time search):**
${data.perplexityData.content}

**Key Sources (${data.perplexityData.citations?.length || 0}):**
${(data.perplexityData.citations || []).slice(0, 5).map((c, i) => `${i + 1}. ${c}`).join('\n')}

**CRITICAL**: Use the above real-time market intelligence to enhance your analysis. Extract SPECIFIC details about:
- Recent price movements and catalysts
- News or announcements (with dates)
- Social sentiment and trending topics
- Whale activity or large transactions
- Any upcoming events or catalysts
When referencing this data, use phrases like "Degen Oracle confirms", "Our platform analysis shows", "Our analytics indicate", "Recent data reveals", etc. NEVER mention "Perplexity" or external sources.

` : '**NOTE**: No real-time market intelligence available for this token.\n\n'}

**TECHNICAL INDICATORS:**
- RSI (14): ${data.indicators.rsi.value?.toFixed(2)} (${data.indicators.rsi.signal})
  ${data.indicators.rsi.interpretation}

- MACD: ${data.indicators.macd.value?.toFixed(6)} (${data.indicators.macd.crossover})
  ${data.indicators.macd.interpretation}

- Bollinger Bands: ${data.indicators.bollinger.position}${data.indicators.bollinger.squeeze ? ' ⚠️ SQUEEZE DETECTED!' : ''}
  Bandwidth: ${data.indicators.bollinger.bandwidth?.toFixed(2)}%
  ${data.indicators.bollinger.interpretation}

- EMAs: ${data.indicators.ema.trend} alignment
  9 EMA: $${data.indicators.ema.ema_9.toFixed(6)}
  21 EMA: $${data.indicators.ema.ema_21.toFixed(6)}
  50 EMA: $${data.indicators.ema.ema_50.toFixed(6)}
  ${data.indicators.ema.interpretation}

- Volume: ${data.indicators.volume.spike ? '🔥 SPIKE!' : 'Normal'} (${data.indicators.volume.ratio.toFixed(2)}x average)
  ${data.indicators.volume.interpretation}

**SUPPORT & RESISTANCE:**
- Current: $${data.levels.current_price.toFixed(6)}
${data.levels.resistance?.length > 0 ? `- Resistance: ${data.levels.resistance.map(r => '$' + r.toFixed(6)).join(', ')}` : '- Resistance: None nearby'}
${data.levels.support?.length > 0 ? `- Support: ${data.levels.support.map(s => '$' + s.toFixed(6)).join(', ')}` : '- Support: None nearby'}

**YOUR TASK:**
Generate a comprehensive trading strategy in JSON format with these exact fields:

{
  "signal": "BUY" | "HOLD" | "SELL",
  "confidence": 0.0 to 1.0,
  "reasoning": "Brief explanation of the signal",
  "entry_strategy": {
    "aggressive_entry": {
      "price": <number>,
      "size": "percentage of position",
      "reasoning": "why this entry"
    },
    "conservative_entry": {
      "price": <number>,
      "size": "percentage of position",
      "reasoning": "why this entry"
    }
  },
  "exit_strategy": {
    "stop_loss": {
      "price": <number>,
      "percentage": <number>,
      "reasoning": "why this stop"
    },
    "take_profit_levels": [
      {
        "level": "TP1",
        "price": <number>,
        "percentage": <number>,
        "action": "Take X% profit",
        "reasoning": "why this level"
      }
      // ... TP2, TP3
    ]
  },
  "risk_reward": {
    "ratio": "X:1",
    "verdict": "assessment"
  },
  "ai_summary": {
    "one_liner": "catchy summary with emojis",
    "detailed_analysis": "2-3 paragraph deep dive",
    "key_catalysts": ["catalyst 1", "catalyst 2", ...],
    "risks": ["risk 1", "risk 2", ...]
  },
  "oracle_verdict": {
    "action": "CALL IT" | "WAIT" | "FADE IT",
    "confidence": "LOW" | "MEDIUM" | "MEDIUM-HIGH" | "HIGH",
    "position_size": "recommendation",
    "timeframe": "expected duration",
    "emoji": "🚀" | "⚠️" | "❌",
    "summary": "final word in 2-3 sentences with heavy crypto slang"
  }
}

**STYLE REQUIREMENTS:**
- Use heavy crypto slang: "call it", "fade it", "send it", "ape in", "bags", "moon", "dump", "pump", "diamond hands", "paper hands", "degen play", "copium", "hopium"
- Be direct and actionable
- Provide specific price levels based on support/resistance
- Make the oracle_verdict.summary punchy and memorable
${data.perplexityData ? `- **MANDATORY**: Incorporate the real-time market intelligence into your analysis. Mention specific catalysts, news, or events from the data.
- Lead with the most important real-time information (e.g., "Fresh off a CEX listing...", "Following whale accumulation...", "After breaking ATH...")` : ''}
- If Bollinger squeeze detected = emphasize breakout potential
- If RSI extreme = emphasize reversal potential
- Consider ALL indicators AND real-time market data together for the signal
- Return ONLY valid JSON, no other text`;

    try {
      const response = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.grokApiKey}`
        },
        body: JSON.stringify({
          messages: [
            {
              role: 'system',
              content: 'You are the Degen Oracle AI, an expert crypto technical analyst. Always respond with valid JSON only.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          model: 'grok-4-1-fast-reasoning', // Same as Trending AI
          temperature: 0.7,
          max_tokens: 2000,
          stream: false
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Grok API error: ${response.status} - ${errorText.substring(0, 200)}`);
        throw new Error(`Grok API error: ${response.status}`);
      }

      const result = await response.json();
      const aiResponse = result.choices[0].message.content;

      // Parse JSON response
      let analysis;
      try {
        // Remove markdown code blocks if present
        const cleanedResponse = aiResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        analysis = JSON.parse(cleanedResponse);
      } catch (parseError) {
        console.error('Failed to parse Grok response:', aiResponse.substring(0, 500));
        throw new Error('Grok returned invalid JSON');
      }

      return analysis;

    } catch (error) {
      console.error('Grok API error:', error.message);
      throw error;
    }
  }

  /**
   * Format analysis as readable text (like Trending AI report)
   */
  formatAsText(analysis) {
    const t = analysis.token;
    const ta = analysis.technical_analysis;
    const verdict = analysis.oracle_verdict;
    
    let text = '';
    
    // Header
    text += `================================================================================\n`;
    text += `📊 TECHNICAL ANALYSIS REPORT - DEGEN ORACLE\n`;
    text += `================================================================================\n\n`;
    
    // Token Info
    text += `🪙 TOKEN: ${t.name} (${t.symbol})\n`;
    text += `💰 Price: $${t.price.toFixed(6)}\n`;
    text += `📈 Market Cap: $${t.marketCap?.toLocaleString('en-US', { maximumFractionDigits: 0 }) || 'N/A'}\n`;
    text += `💧 24h Volume: $${t.volume24h?.toLocaleString('en-US', { maximumFractionDigits: 0 }) || 'N/A'}\n`;
    text += `📍 Contract: ${t.address}\n\n`;
    
    // Oracle Verdict (Most Important!)
    text += `================================================================================\n`;
    text += `🎭 ORACLE VERDICT ${verdict.verdict_emoji}\n`;
    text += `================================================================================\n`;
    text += `${verdict.summary}\n\n`;
    text += `📊 Signal: ${verdict.verdict}\n`;
    text += `💡 Reasoning: ${verdict.reasoning}\n\n`;
    
    // Key Levels
    if (verdict.key_levels) {
      text += `🎯 KEY LEVELS:\n`;
      if (verdict.key_levels.support) {
        text += `   🟢 Support: ${verdict.key_levels.support}\n`;
      }
      if (verdict.key_levels.resistance) {
        text += `   🔴 Resistance: ${verdict.key_levels.resistance}\n`;
      }
      text += `\n`;
    }
    
    // Risk Assessment
    text += `⚠️  RISK LEVEL: ${verdict.risk_emoji} ${verdict.risk_level}\n`;
    text += `   ${verdict.risk_explanation}\n\n`;
    
    // Comprehensive Technical Analysis (from Perplexity sonar-pro)
    text += `================================================================================\n`;
    text += `📊 COMPREHENSIVE TECHNICAL ANALYSIS\n`;
    text += `================================================================================\n`;
    if (ta && ta.raw_analysis) {
      text += `${ta.raw_analysis}\n\n`;
      if (ta.sources && ta.sources.length > 0) {
        text += `📚 Sources: ${ta.sources.length} verified sources\n`;
      }
      text += `⏰ Timeframe: ${ta.timeframe}\n`;
    } else {
      text += `⚠️  No comprehensive technical analysis available\n\n`;
    }
    
    // Trading Strategy
    text += `================================================================================\n`;
    text += `💰 TRADING STRATEGY\n`;
    text += `================================================================================\n`;
    text += `${s.reasoning}\n\n`;
    
    text += `📊 ENTRY STRATEGY:\n`;
    text += `   🔴 Aggressive Entry: $${s.entry_strategy.aggressive_entry.price.toFixed(6)}\n`;
    text += `      Size: ${s.entry_strategy.aggressive_entry.size}\n`;
    text += `      ${s.entry_strategy.aggressive_entry.reasoning}\n\n`;
    
    text += `   🟢 Conservative Entry: $${s.entry_strategy.conservative_entry.price.toFixed(6)}\n`;
    text += `      Size: ${s.entry_strategy.conservative_entry.size}\n`;
    text += `      ${s.entry_strategy.conservative_entry.reasoning}\n\n`;
    
    text += `🛡️ EXIT STRATEGY:\n`;
    text += `   🛑 Stop Loss: $${s.exit_strategy.stop_loss.price.toFixed(6)} (${s.exit_strategy.stop_loss.percentage}%)\n`;
    text += `      ${s.exit_strategy.stop_loss.reasoning}\n\n`;
    
    text += `   🎯 Take Profit Levels:\n`;
    s.exit_strategy.take_profit_levels.forEach(tp => {
      text += `      ${tp.level}: $${tp.price.toFixed(6)} (+${tp.percentage}%) - ${tp.action}\n`;
      text += `         ${tp.reasoning}\n`;
    });
    text += `\n`;
    
    text += `   ⚖️  Risk/Reward: ${s.risk_reward.ratio}\n`;
    text += `      ${s.risk_reward.verdict}\n\n`;
    
    // Footer
    text += `\n================================================================================\n`;
    text += `🕒 Generated: ${new Date(analysis.generated_at).toLocaleString()}\n`;
    text += `📡 Data Sources: ${analysis.data_sources.technical_analysis} + ${analysis.data_sources.oracle_verdict}\n`;
    text += `🔗 Degen Oracle - ai.degen-oracle.com\n`;
    text += `================================================================================\n`;
    
    return text;
  }

  /**
   * Generate mock analysis (fallback)
   */
  generateMockAnalysis(data, currentPrice) {
    const rsiValue = data.indicators.rsi.value || 50;
    const isBullish = rsiValue > 50;
    
    return {
      signal: isBullish ? "BUY" : "HOLD",
      confidence: 0.75,
      reasoning: "Technical indicators show mixed signals. RSI is neutral, MACD showing momentum, Bollinger squeeze detected indicating potential breakout.",
      entry_strategy: {
        aggressive_entry: {
          price: currentPrice,
          size: "30% of position",
          reasoning: "Current price after recent movement"
        },
        conservative_entry: {
          price: currentPrice * 0.95,
          size: "50% of position",
          reasoning: "Wait for pullback to support level"
        }
      },
      exit_strategy: {
        stop_loss: {
          price: currentPrice * 0.92,
          percentage: -8.0,
          reasoning: "Below recent support zone"
        },
        take_profit_levels: [
          {
            level: "TP1",
            price: currentPrice * 1.10,
            percentage: 10.0,
            action: "Take 30% profit",
            reasoning: "First resistance level"
          },
          {
            level: "TP2",
            price: currentPrice * 1.20,
            percentage: 20.0,
            action: "Take 40% profit",
            reasoning: "Strong resistance zone"
          },
          {
            level: "TP3",
            price: currentPrice * 1.35,
            percentage: 35.0,
            action: "Take remaining profit",
            reasoning: "Major resistance, high probability rejection"
          }
        ]
      },
      risk_reward: {
        ratio: "2.5:1",
        verdict: "Acceptable risk/reward for degen play"
      },
      ai_summary: {
        one_liner: `${data.indicators.bollinger.squeeze ? 'Bollinger squeeze = potential breakout play 🎯' : 'Mixed signals, waiting for confirmation ⚠️'}`,
        detailed_analysis: `${data.token.name} showing ${data.indicators.ema.trend} trend with RSI at ${rsiValue.toFixed(1)}. ${data.indicators.bollinger.interpretation}. ${data.indicators.macd.interpretation}.\n\nPrice trading ${data.levels.support.length > 0 ? `near support at $${data.levels.support[0].toFixed(6)}` : 'without clear support'}. Volume ${data.indicators.volume.spike ? 'spiking' : 'normal'} indicating ${data.indicators.volume.spike ? 'increased interest' : 'typical activity'}.\n\nGiven the ${data.token.organicScoreLabel || 'unknown'} organic score and ${data.token.holderCount?.toLocaleString() || 'unknown'} holders, bias is ${isBullish ? 'slightly bullish' : 'neutral to bearish'}.`,
        key_catalysts: [
          data.indicators.bollinger.squeeze ? "Bollinger squeeze (volatility breakout imminent)" : "Technical setup forming",
          data.token.organicScoreLabel === 'high' ? "High organic score = real community" : "Community engagement",
          `${data.token.holderCount?.toLocaleString() || 'Strong'} holder base`,
          data.indicators.volume.spike ? "Volume spike = renewed interest" : "Steady volume"
        ],
        risks: [
          `${data.indicators.macd.crossover} MACD momentum`,
          `EMAs in ${data.indicators.ema.trend} alignment`,
          "Bitcoin correlation - market follows BTC",
          "Crypto volatility - can dump quickly"
        ]
      },
      oracle_verdict: {
        action: isBullish ? "CALL IT" : "WAIT",
        confidence: isBullish ? "MEDIUM-HIGH" : "MEDIUM",
        position_size: "25-50% of planned allocation",
        timeframe: "Short-term trade (1-7 days)",
        emoji: isBullish ? "🚀" : "⚠️",
        summary: isBullish 
          ? "Oracle AI confirms: Technical setup looks good. Enter with tight stops, take profits at resistance. Risk/reward favors bulls. Send it with caution. 🎯"
          : "Oracle AI says: Wait for clearer signal. Don't ape in blind - let price show direction first. Patience pays in choppy markets. ⚠️"
      }
    };
  }
}

export default TechnicalAnalysisService;
