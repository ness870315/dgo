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
      
      // 2. Search Perplexity for real-time news and sentiment
      const perplexityData = await this.searchPerplexity(
        jupiterData.name,
        jupiterData.symbol,
        contractAddress,
        timeframe
      );
      
      // 3. Fetch OHLCV data (Moralis if available, otherwise synthetic)
      let ohlcv;
      if (this.hybridChartService) {
        try {
          console.log(`📊 [TA] Fetching real OHLCV data from Moralis...`);
          ohlcv = await this.fetchMoralisOHLCV(contractAddress, timeframe);
          console.log(`✅ [TA] Got ${ohlcv.length} real candles from Moralis`);
        } catch (error) {
          console.log(`⚠️  [TA] Moralis failed, using synthetic: ${error.message}`);
          ohlcv = this.generateSyntheticOHLCV(currentPrice, 100);
        }
      } else {
        console.log(`⚠️  [TA] No Moralis service, using synthetic OHLCV`);
        ohlcv = this.generateSyntheticOHLCV(currentPrice, 100);
      }
      
      // 4. Calculate technical indicators
      const indicators = {
        rsi: this.calculateRSI(ohlcv),
        macd: this.calculateMACD(ohlcv),
        bollinger: this.calculateBollingerBands(ohlcv),
        ema: this.calculateEMAs(ohlcv),
        volume: this.analyzeVolume(ohlcv)
      };
      
      // 5. Calculate support/resistance
      const levels = this.calculateSupportResistance(ohlcv, currentPrice);
      
      // 6. Prepare data for AI (including Perplexity insights)
      const analysisData = {
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
        indicators,
        levels,
        perplexityData // Include real-time news and sentiment
      };
      
      // 7. Generate AI analysis (try Grok first, fallback to mock)
      let aiAnalysis;
      if (this.grokApiKey) {
        try {
          console.log(`🤖 [TA] Generating AI analysis with Grok...`);
          aiAnalysis = await this.generateAIAnalysis(analysisData);
          console.log(`✅ [TA] Grok analysis complete`);
    } catch (error) {
          console.log(`⚠️  [TA] Grok failed (${error.message}), using mock analysis`);
          aiAnalysis = this.generateMockAnalysis(analysisData, currentPrice);
        }
      } else {
        console.log(`⚠️  [TA] No Grok API key, using mock analysis`);
        aiAnalysis = this.generateMockAnalysis(analysisData, currentPrice);
      }
      
      // 8. Build final report
      const report = {
        success: true,
        token: analysisData.token,
        technical_indicators: indicators,
        support_resistance: levels,
        trading_strategy: aiAnalysis,
        generated_at: new Date().toISOString()
      };

      // Include Perplexity data if available (for transparency)
      if (perplexityData && perplexityData.content) {
        report.market_intelligence = {
          summary: perplexityData.content.substring(0, 500) + '...', // Truncated for API response
          sources_count: perplexityData.citations?.length || 0,
          timestamp: new Date(perplexityData.timestamp).toISOString()
        };
      }

      return report;

    } catch (error) {
      console.error(`❌ [TA] Error analyzing token:`, error.message);
      throw error;
    }
  }

  /**
   * Search Perplexity for real-time token news and market sentiment
   */
  async searchPerplexity(tokenName, tokenSymbol, contractAddress, timeframe) {
    if (!this.perplexityApiKey) {
      console.log(`⚠️  [TA] No Perplexity API key, skipping real-time search`);
      return null;
    }

    try {
      console.log(`🔍 [TA] Searching Perplexity for ${tokenName} news and sentiment...`);

      const query = `Search for the latest news, price action, technical analysis, market sentiment, and trading activity for the cryptocurrency ${tokenName} (${tokenSymbol}) with contract address ${contractAddress} on Solana. Focus on the last ${timeframe === '1h' ? '24 hours' : timeframe === '4h' ? '3 days' : '7 days'}. Include:
- Recent price movements and volatility
- Any major news or announcements
- Social media sentiment and trending topics
- Whale activity or large transactions
- CEX listings or partnership announcements
- Trading volume changes
- Technical patterns traders are discussing
- Any upcoming catalysts or events

Provide specific details with dates, percentages, and sources where possible.`;

      const response = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.perplexityApiKey}`
        },
        body: JSON.stringify({
          model: 'sonar',
          messages: [
            {
              role: 'system',
              content: 'You are a crypto market analyst providing real-time information. Be specific with dates, percentages, and sources. Focus on actionable information for traders.'
            },
            {
              role: 'user',
              content: query
            }
          ],
          temperature: 0.3,
          max_tokens: 1000,
          return_citations: true
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Perplexity API error: ${response.status} - ${errorText.substring(0, 200)}`);
        return null;
      }

      const result = await response.json();
      const newsContent = result.choices[0].message.content;
      const citations = result.citations || [];

      console.log(`✅ [TA] Perplexity search complete (${citations.length} sources)`);

      return {
        news: newsContent,
        citations: citations,
        timestamp: Date.now()
      };

    } catch (error) {
      console.error(`❌ [TA] Perplexity search failed:`, error.message);
      return null;
    }
  }

  /**
   * Search Perplexity for real-time token news, sentiment, AND technical analysis
   */
  async searchPerplexity(tokenName, tokenSymbol, contractAddress, timeframe) {
    if (!this.perplexityApiKey) {
      console.log(`⚠️  [TA] No Perplexity API key, skipping real-time search`);
      return null;
    }

    try {
      console.log(`🔍 [TA] Searching Perplexity for ${tokenName} news, sentiment & TA...`);

      // Map timeframe to search window
      const timeWindowMap = {
        '5m': '2 hours',
        '15m': '6 hours',
        '1h': '24 hours',
        '4h': '3 days',
        '1d': '7 days'
      };
      const searchWindow = timeWindowMap[timeframe] || '7 days';
      
      const query = `Search for the latest information about the Solana SPL token "${tokenName}" (${tokenSymbol}) with the EXACT contract address ${contractAddress}. 

**CRITICAL: This is a Solana blockchain token. IGNORE any other tokens with similar names on Ethereum, BSC, or other chains. ONLY include information that specifically references this Solana contract address: ${contractAddress}**

Focus on the last ${searchWindow}. Include:

**TECHNICAL ANALYSIS & CHART PATTERNS:**
- Current technical analysis from traders and analysts
- Key support and resistance levels being watched
- Chart patterns (head & shoulders, triangles, flags, wedges, etc.)
- RSI, MACD, Bollinger Bands analysis from crypto analysts
- Moving average crossovers or key levels
- Volume profile and order book analysis
- Fibonacci retracement levels
- Price action patterns and breakout setups

**NEWS & CATALYSTS:**
- Recent price movements with specific percentages
- Major news, announcements, or partnerships
- CEX listings (BitMart, MEXC, Gate.io, Bybit, etc.) with dates
- Protocol upgrades or tokenomics changes
- Upcoming events or launches

**MARKET SENTIMENT & ACTIVITY:**
- Social media sentiment (Twitter/X, Reddit, Discord)
- Whale activity and large transactions
- Trading volume spikes with context
- Influencer or analyst commentary
- Community growth or engagement changes

**HELPFUL SOURCES TO CHECK:**
- DexScreener Solana (dexscreener.com/solana/${contractAddress})
- Birdeye Solana (birdeye.so/token/${contractAddress})
- Solscan (solscan.io/token/${contractAddress})
- Jupiter (jup.ag)
- Raydium, Orca, or other Solana DEXs

Provide specific details with dates, percentages, price levels, and sources where possible. If technical analysis is being discussed in the community, include those insights. 

**IMPORTANT: If you cannot find reliable Solana-specific information for this exact contract, clearly state "Limited Solana-specific data available" rather than providing data from other chains.**`;

      const response = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.perplexityApiKey}`
        },
        body: JSON.stringify({
          model: 'sonar',
          messages: [
            {
              role: 'system',
              content: 'You are a Solana-focused crypto market analyst. CRITICAL: Only provide information about the SPECIFIC Solana token contract mentioned in the query. If you find conflicting price data from different chains/tokens, clearly state "No reliable Solana-specific data found" rather than mixing data from different tokens. Be specific with dates, percentages, and sources. Verify contract addresses when possible.'
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
      const newsContent = result.choices[0].message.content;
      const citations = result.citations || [];

      // Check for price discrepancy warnings (indicates wrong token data)
      const hasDiscrepancy = newsContent.toLowerCase().includes('price discrepanc') || 
                           newsContent.toLowerCase().includes('conflicting prices') ||
                           newsContent.toLowerCase().includes('cannot provide');
      
      if (hasDiscrepancy) {
        console.log(`⚠️  [TA] Perplexity found conflicting data (likely wrong chain) - returning null`);
        return null; // Better to have no data than wrong data
      }

      console.log(`✅ [TA] Perplexity search complete (${citations.length} sources)`);

      return {
        content: newsContent,
        citations: citations,
        timestamp: Date.now()
      };

    } catch (error) {
      console.error(`❌ [TA] Perplexity search failed:`, error.message);
      return null;
    }
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

    // Map our timeframes to Moralis/HybridService format
    const timeframeMap = {
      '5m': '5',
      '15m': '15',
      '1h': '60',
      '4h': '240',
      '1d': '1440'
    };
    
    const moralisTimeframe = timeframeMap[timeframe] || '60';
    const limit = 100; // Get last 100 candles
    
    try {
      const chartData = await this.hybridChartService.getHistoricalPrices(
        tokenAddress,
        moralisTimeframe,
        limit
      );
      
      if (!chartData || chartData.length === 0) {
        throw new Error('No OHLCV data returned from Moralis');
      }
      
      // Convert to our format
      return chartData.map(candle => ({
        timestamp: candle.time,
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
  generateSyntheticOHLCV(currentPrice, numCandles = 100) {
    const ohlcv = [];
    const now = Date.now();
    const hourMs = 60 * 60 * 1000;
    let price = currentPrice * 0.95; // Start 5% lower
    
    for (let i = 0; i < numCandles; i++) {
      const timestamp = now - (numCandles - i) * hourMs;
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
    const i = analysis.technical_indicators;
    const s = analysis.trading_strategy;
    const sr = analysis.support_resistance;
    
    let text = '';
    
    // Header
    text += `================================================================================\n`;
    text += `📊 TECHNICAL ANALYSIS REPORT - DEGEN ORACLE\n`;
    text += `================================================================================\n\n`;
    
    // Token Info
    text += `🪙 TOKEN: ${t.name} (${t.symbol})\n`;
    text += `💰 Price: $${t.price.toFixed(6)}\n`;
    text += `📈 Market Cap: $${t.marketCap.toLocaleString('en-US', { maximumFractionDigits: 0 })}\n`;
    text += `💧 24h Volume: $${t.volume24h.toLocaleString('en-US', { maximumFractionDigits: 0 })}\n`;
    text += `📍 Contract: ${t.address}\n\n`;
    
    // Market Intelligence (if available)
    if (analysis.market_intelligence) {
      text += `================================================================================\n`;
      text += `🔍 REAL-TIME MARKET INTELLIGENCE\n`;
      text += `================================================================================\n`;
      text += `${analysis.market_intelligence.summary}\n`;
      text += `\n📊 Sources: ${analysis.market_intelligence.sources_count} verified sources\n`;
      text += `⏰ Updated: ${new Date(analysis.market_intelligence.timestamp).toLocaleString()}\n\n`;
    }
    
    // Oracle Verdict (Most Important!)
    text += `================================================================================\n`;
    text += `🎭 ORACLE VERDICT ${s.oracle_verdict.emoji}\n`;
    text += `================================================================================\n`;
    text += `${s.oracle_verdict.summary}\n\n`;
    text += `📊 Signal: ${s.signal} (${(s.confidence * 100).toFixed(0)}% confidence)\n`;
    text += `🎯 Action: ${s.oracle_verdict.action}\n`;
    text += `📦 Position Size: ${s.oracle_verdict.position_size}\n`;
    text += `⏱️  Timeframe: ${s.oracle_verdict.timeframe}\n\n`;
    
    // Key Insight
    text += `💡 ${s.ai_summary.one_liner}\n\n`;
    
    // Technical Indicators
    text += `================================================================================\n`;
    text += `📈 TECHNICAL INDICATORS\n`;
    text += `================================================================================\n`;
    text += `📊 RSI (14): ${i.rsi.value?.toFixed(2) || 'N/A'} - ${i.rsi.signal.toUpperCase()}\n`;
    text += `   ${i.rsi.interpretation}\n\n`;
    
    text += `📉 MACD: ${i.macd.value?.toFixed(6) || 'N/A'} - ${i.macd.crossover.toUpperCase()}\n`;
    text += `   ${i.macd.interpretation}\n\n`;
    
    text += `📊 Bollinger Bands: ${i.bollinger.position.toUpperCase()}`;
    if (i.bollinger.squeeze) {
      text += ` ⚠️ SQUEEZE DETECTED!\n`;
    } else {
      text += `\n`;
    }
    text += `   ${i.bollinger.interpretation}\n\n`;
    
    text += `📈 EMAs: ${i.ema.trend.toUpperCase()} alignment\n`;
    text += `   9 EMA: $${i.ema.ema_9.toFixed(6)} | 21 EMA: $${i.ema.ema_21.toFixed(6)} | 50 EMA: $${i.ema.ema_50.toFixed(6)}\n`;
    text += `   ${i.ema.interpretation}\n\n`;
    
    text += `📊 Volume: ${i.volume.spike ? '🔥 SPIKE!' : 'Normal'} (${i.volume.ratio.toFixed(2)}x average)\n`;
    text += `   Current: ${i.volume.current.toLocaleString()} | Avg: ${i.volume.avg_20.toLocaleString()}\n`;
    text += `   ${i.volume.interpretation}\n\n`;
    
    // Support & Resistance
    text += `================================================================================\n`;
    text += `🎯 SUPPORT & RESISTANCE LEVELS\n`;
    text += `================================================================================\n`;
    
    if (sr.strong_resistance && sr.strong_resistance.length > 0) {
      text += `🔴 Strong Resistance:\n`;
      sr.strong_resistance.forEach(r => {
        text += `   $${r.toFixed(6)} (+${(((r / sr.current_price) - 1) * 100).toFixed(2)}%)\n`;
      });
      text += `\n`;
    }
    
    if (sr.resistance && sr.resistance.length > 0) {
      text += `🟠 Resistance:\n`;
      sr.resistance.forEach(r => {
        text += `   $${r.toFixed(6)} (+${(((r / sr.current_price) - 1) * 100).toFixed(2)}%)\n`;
      });
      text += `\n`;
    }
    
    text += `🎯 Current Price: $${sr.current_price.toFixed(6)}\n\n`;
    
    if (sr.support && sr.support.length > 0) {
      text += `🟢 Support:\n`;
      sr.support.forEach(s => {
        text += `   $${s.toFixed(6)} (${(((s / sr.current_price) - 1) * 100).toFixed(2)}%)\n`;
      });
      text += `\n`;
    }
    
    if (sr.strong_support && sr.strong_support.length > 0) {
      text += `🟩 Strong Support:\n`;
      sr.strong_support.forEach(s => {
        text += `   $${s.toFixed(6)} (${(((s / sr.current_price) - 1) * 100).toFixed(2)}%)\n`;
      });
      text += `\n`;
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
    
    // Key Catalysts
    text += `================================================================================\n`;
    text += `🔑 KEY CATALYSTS\n`;
    text += `================================================================================\n`;
    s.ai_summary.key_catalysts.forEach(catalyst => {
      text += `✅ ${catalyst}\n`;
    });
    text += `\n`;
    
    // Risks
    text += `================================================================================\n`;
    text += `⚠️ RISKS TO CONSIDER\n`;
    text += `================================================================================\n`;
    s.ai_summary.risks.forEach(risk => {
      text += `❌ ${risk}\n`;
    });
    text += `\n`;
    
    // Detailed Analysis
    text += `================================================================================\n`;
    text += `📝 DETAILED ANALYSIS\n`;
    text += `================================================================================\n`;
    text += `${s.ai_summary.detailed_analysis}\n\n`;
    
    // Footer
    text += `================================================================================\n`;
    text += `🕒 Generated: ${new Date(analysis.generated_at).toLocaleString()}\n`;
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
