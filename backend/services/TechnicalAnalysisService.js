import axios from 'axios';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import OpenAIService from '../openaiService.js';
import LRUCache from 'lru-cache';

class TechnicalAnalysisService {
  constructor() {
    this.moralisApiKey = process.env.MORALIS_API_KEY;
    this.openaiService = new OpenAIService();
    this.cache = new LRUCache({
      max: 100, // Max 100 analyses cached
      ttl: 1000 * 60 * 5 // 5 minutes cache
    });
    this.isInitialized = false;
  }

  async initialize() {
    if (this.isInitialized) return;
    try {
      await this.openaiService.initialize();
      this.isInitialized = true;
      console.log('🧠 Technical Analysis AI initialized successfully with OpenAI');
    } catch (error) {
      console.warn('⚠️ OpenAI service not available for Technical Analysis:', error.message);
      console.log('🧠 Technical Analysis AI will use enhanced fallback analysis only');
      this.isInitialized = true; // Still mark as initialized to allow fallback analysis
      this.openaiService = null; // Clear the service to prevent further attempts
    }
  }

  async getMoralisTokenAnalytics(contractAddress) {
    if (!this.moralisApiKey) {
      throw new Error('Moralis API key not configured');
    }
    const url = `https://deep-index.moralis.io/api/v2.2/tokens/${contractAddress}/analytics?chain=solana`;
    try {
      const response = await axios.get(url, {
        headers: {
          'X-API-Key': this.moralisApiKey,
          'Accept': 'application/json'
        },
        timeout: 10000
      });
      return response.data;
    } catch (error) {
      console.error(`Error fetching Moralis Token Analytics for ${contractAddress}:`, error.message);
      throw new Error(`Failed to fetch Moralis Token Analytics: ${error.message}`);
    }
  }

  async getTechnicalAnalysis(contractAddress, chartData = null) {
    await this.initialize();

    const cacheKey = `tech_analysis_${contractAddress}_${chartData ? chartData.length : 'no_chart'}`;
    if (this.cache.has(cacheKey)) {
      console.log(`💾 Using cached technical analysis for ${contractAddress}`);
      return { success: true, data: this.cache.get(cacheKey) };
    }

    try {
      console.log(`🔍 Starting technical analysis for ${contractAddress}`);
      let moralisAnalytics = null;
      try {
        console.log(`🔍 Fetching Moralis analytics for ${contractAddress}`);
        moralisAnalytics = await this.getMoralisTokenAnalytics(contractAddress);
        console.log(`✅ Moralis analytics fetched successfully`);
      } catch (moralisError) {
        console.warn(`⚠️ Moralis analytics failed for ${contractAddress}:`, moralisError.message);
        // Continue with fallback analysis using only chart data
      }

      // Prepare data for AI analysis
      console.log(`🔍 Preparing template variables...`);
      const templateVars = this.prepareTemplateVariables(moralisAnalytics, chartData);
      console.log(`✅ Template variables prepared`);

      let analysisResult;
      if (this.openaiService) {
        console.log(`🧠 Generating GPT-5 powered technical analysis for ${contractAddress}`);
        const prompt = this.fillTemplate(TECHNICAL_ANALYSIS_PROMPT_TEMPLATE, templateVars);
        const rawResponse = await this.openaiService.generateCompletion(prompt, {
          model: 'gpt-4o', // Using GPT-4o for advanced analysis
          temperature: 0.7,
          response_format: { type: "json_object" }
        });
        analysisResult = JSON.parse(rawResponse);
      } else {
        console.log(`🧠 OpenAI not available, using fallback technical analysis for ${contractAddress}`);
        analysisResult = this.getFallbackTechnicalAnalysis(moralisAnalytics, chartData);
      }

      this.cache.set(cacheKey, analysisResult);
      return { success: true, data: analysisResult };

    } catch (error) {
      console.error(`❌ Technical analysis failed for ${contractAddress}:`, error);
      console.error(`❌ Error stack:`, error.stack);
      const fallbackAnalysis = this.getFallbackTechnicalAnalysis(null, chartData, error.message);
      return { success: true, data: fallbackAnalysis, error: error.message }; // Still return success with fallback
    }
  }

  prepareTemplateVariables(moralisAnalytics, chartData) {
    const formatVolume = (vol) => vol ? parseFloat(vol).toLocaleString(undefined, { maximumFractionDigits: 2 }) : 'N/A';
    const formatPercent = (pct) => pct ? parseFloat(pct).toFixed(2) : 'N/A';
    const formatPrice = (price) => price ? parseFloat(price).toFixed(8) : 'N/A';

    // Enhanced OHLCV data processing for advanced technical analysis
    let technicalIndicators = {};
    let chartPatterns = [];
    let supportResistanceLevels = [];
    let candlestickPatterns = [];
    
    if (chartData && chartData.length > 0) {
      // Extract OHLCV data
      const ohlcvData = chartData.map(d => ({
        time: d.time,
        open: parseFloat(d.open),
        high: parseFloat(d.high),
        low: parseFloat(d.low),
        close: parseFloat(d.close),
        volume: d.volume || 0
      }));

      // Calculate technical indicators
      technicalIndicators = this.calculateTechnicalIndicators(ohlcvData);
      
      // Detect chart patterns
      chartPatterns = this.detectChartPatterns(ohlcvData);
      
      // Find support and resistance levels
      supportResistanceLevels = this.findSupportResistanceLevels(ohlcvData);
      
      // Detect candlestick patterns
      candlestickPatterns = this.detectCandlestickPatterns(ohlcvData);
    }

    // Basic fallback support/resistance
    const support = supportResistanceLevels.support?.length > 0 ? 
      Math.min(...supportResistanceLevels.support).toFixed(8) : 'N/A';
    const resistance = supportResistanceLevels.resistance?.length > 0 ? 
      Math.max(...supportResistanceLevels.resistance).toFixed(8) : 'N/A';

    return {
      tokenAddress: moralisAnalytics?.tokenAddress || 'N/A',
      usdPrice: formatPrice(moralisAnalytics?.usdPrice),
      totalLiquidityUsd: formatVolume(moralisAnalytics?.totalLiquidityUsd),
      totalFullyDilutedValuation: formatVolume(moralisAnalytics?.totalFullyDilutedValuation),

      buyVolume5m: formatVolume(moralisAnalytics?.totalBuyVolume?.['5m']),
      sellVolume5m: formatVolume(moralisAnalytics?.totalSellVolume?.['5m']),
      buyVolume1h: formatVolume(moralisAnalytics?.totalBuyVolume?.['1h']),
      sellVolume1h: formatVolume(moralisAnalytics?.totalSellVolume?.['1h']),
      buyVolume6h: formatVolume(moralisAnalytics?.totalBuyVolume?.['6h']),
      sellVolume6h: formatVolume(moralisAnalytics?.totalSellVolume?.['6h']),
      buyVolume24h: formatVolume(moralisAnalytics?.totalBuyVolume?.['24h']),
      sellVolume24h: formatVolume(moralisAnalytics?.totalSellVolume?.['24h']),

      buyers5m: moralisAnalytics?.totalBuyers?.['5m'] || 'N/A',
      sellers5m: moralisAnalytics?.totalSellers?.['5m'] || 'N/A',
      buyers1h: moralisAnalytics?.totalBuyers?.['1h'] || 'N/A',
      sellers1h: moralisAnalytics?.totalSellers?.['1h'] || 'N/A',
      buyers6h: moralisAnalytics?.totalBuyers?.['6h'] || 'N/A',
      sellers6h: moralisAnalytics?.totalSellers?.['6h'] || 'N/A',
      buyers24h: moralisAnalytics?.totalBuyers?.['24h'] || 'N/A',
      sellers24h: moralisAnalytics?.totalSellers?.['24h'] || 'N/A',

      buys5m: moralisAnalytics?.totalBuys?.['5m'] || 'N/A',
      sells5m: moralisAnalytics?.totalSells?.['5m'] || 'N/A',
      buys1h: moralisAnalytics?.totalBuys?.['1h'] || 'N/A',
      sells1h: moralisAnalytics?.totalSells?.['1h'] || 'N/A',
      buys6h: moralisAnalytics?.totalBuys?.['6h'] || 'N/A',
      sells6h: moralisAnalytics?.totalSells?.['6h'] || 'N/A',
      buys24h: moralisAnalytics?.totalBuys?.['24h'] || 'N/A',
      sells24h: moralisAnalytics?.totalSells?.['24h'] || 'N/A',

      uniqueWallets5m: moralisAnalytics?.uniqueWallets?.['5m'] || 'N/A',
      uniqueWallets1h: moralisAnalytics?.uniqueWallets?.['1h'] || 'N/A',
      uniqueWallets6h: moralisAnalytics?.uniqueWallets?.['6h'] || 'N/A',
      uniqueWallets24h: moralisAnalytics?.uniqueWallets?.['24h'] || 'N/A',

      priceChange5m: formatPercent(moralisAnalytics?.pricePercentChange?.['5m']),
      priceChange1h: formatPercent(moralisAnalytics?.pricePercentChange?.['1h']),
      priceChange6h: formatPercent(moralisAnalytics?.pricePercentChange?.['6h']),
      priceChange24h: formatPercent(moralisAnalytics?.pricePercentChange?.['24h']),

      chartHigh: technicalIndicators.highestHigh || 'N/A',
      chartLow: technicalIndicators.lowestLow || 'N/A',
      chartClose: technicalIndicators.currentPrice || 'N/A',
      chartDataPoints: chartData ? chartData.length : 0,
      supportLevel: support,
      resistanceLevel: resistance,
      
      // Enhanced OHLCV Technical Analysis
      technicalIndicators: JSON.stringify(technicalIndicators),
      chartPatterns: chartPatterns.join(', ') || 'No patterns detected',
      candlestickPatterns: candlestickPatterns.join(', ') || 'No candlestick patterns',
      supportLevels: supportResistanceLevels.support?.map(level => level.toFixed(8)).join(', ') || 'N/A',
      resistanceLevels: supportResistanceLevels.resistance?.map(level => level.toFixed(8)).join(', ') || 'N/A',
      trendDirection: technicalIndicators.trend || 'Unknown',
      momentum: technicalIndicators.momentum || 'Neutral',
      volatility: technicalIndicators.volatility || 'Unknown',
      volumeAnalysis: technicalIndicators.volumeAnalysis || 'N/A',
    };
  }

  /**
   * Calculate comprehensive technical indicators from OHLCV data
   */
  calculateTechnicalIndicators(ohlcvData) {
    if (!ohlcvData || ohlcvData.length < 2) {
      return { trend: 'Unknown', momentum: 'Neutral', volatility: 'Unknown' };
    }

    const closes = ohlcvData.map(d => d.close);
    const highs = ohlcvData.map(d => d.high);
    const lows = ohlcvData.map(d => d.low);
    const volumes = ohlcvData.map(d => d.volume || 0);

    // Basic price metrics
    const currentPrice = closes[closes.length - 1];
    const highestHigh = Math.max(...highs);
    const lowestLow = Math.min(...lows);
    const priceRange = highestHigh - lowestLow;

    // Moving Averages
    const sma20 = this.calculateSMA(closes, 20);
    const sma50 = this.calculateSMA(closes, 50);
    const ema12 = this.calculateEMA(closes, 12);
    const ema26 = this.calculateEMA(closes, 26);

    // RSI
    const rsi = this.calculateRSI(closes, 14);

    // MACD
    const macd = this.calculateMACD(closes);

    // Bollinger Bands
    const bb = this.calculateBollingerBands(closes, 20, 2);

    // Volume analysis
    const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;
    const recentVolume = volumes.slice(-5).reduce((a, b) => a + b, 0) / 5;
    const volumeRatio = recentVolume / avgVolume;

    // Trend analysis
    let trend = 'Neutral';
    if (currentPrice > sma20 && sma20 > sma50) trend = 'Bullish';
    else if (currentPrice < sma20 && sma20 < sma50) trend = 'Bearish';

    // Momentum analysis
    let momentum = 'Neutral';
    if (rsi > 70) momentum = 'Overbought';
    else if (rsi < 30) momentum = 'Oversold';
    else if (rsi > 50) momentum = 'Bullish';
    else if (rsi < 50) momentum = 'Bearish';

    // Volatility analysis
    let volatility = 'Low';
    const priceChange = Math.abs((currentPrice - closes[0]) / closes[0] * 100);
    if (priceChange > 20) volatility = 'High';
    else if (priceChange > 10) volatility = 'Medium';

    return {
      currentPrice: currentPrice.toFixed(8),
      highestHigh: highestHigh.toFixed(8),
      lowestLow: lowestLow.toFixed(8),
      priceRange: priceRange.toFixed(8),
      sma20: sma20?.toFixed(8) || 'N/A',
      sma50: sma50?.toFixed(8) || 'N/A',
      ema12: ema12?.toFixed(8) || 'N/A',
      ema26: ema26?.toFixed(8) || 'N/A',
      rsi: rsi?.toFixed(2) || 'N/A',
      macd: macd?.toFixed(8) || 'N/A',
      bbUpper: bb?.upper?.toFixed(8) || 'N/A',
      bbMiddle: bb?.middle?.toFixed(8) || 'N/A',
      bbLower: bb?.lower?.toFixed(8) || 'N/A',
      volumeRatio: volumeRatio.toFixed(2),
      trend,
      momentum,
      volatility,
      volumeAnalysis: volumeRatio > 1.5 ? 'High volume activity' : 
                     volumeRatio < 0.5 ? 'Low volume activity' : 'Normal volume'
    };
  }

  /**
   * Detect chart patterns in OHLCV data
   */
  detectChartPatterns(ohlcvData) {
    if (!ohlcvData || ohlcvData.length < 10) return [];

    const patterns = [];
    const closes = ohlcvData.map(d => d.close);
    const highs = ohlcvData.map(d => d.high);
    const lows = ohlcvData.map(d => d.low);

    // Double Top/Bottom detection
    if (this.detectDoubleTop(highs)) patterns.push('Double Top');
    if (this.detectDoubleBottom(lows)) patterns.push('Double Bottom');

    // Triangle patterns
    if (this.detectAscendingTriangle(highs, lows)) patterns.push('Ascending Triangle');
    if (this.detectDescendingTriangle(highs, lows)) patterns.push('Descending Triangle');
    if (this.detectSymmetricalTriangle(highs, lows)) patterns.push('Symmetrical Triangle');

    // Head and Shoulders
    if (this.detectHeadAndShoulders(highs)) patterns.push('Head and Shoulders');

    return patterns;
  }

  /**
   * Detect candlestick patterns
   */
  detectCandlestickPatterns(ohlcvData) {
    if (!ohlcvData || ohlcvData.length < 3) return [];

    const patterns = [];
    
    for (let i = 2; i < ohlcvData.length; i++) {
      const current = ohlcvData[i];
      const previous = ohlcvData[i - 1];
      const beforePrevious = ohlcvData[i - 2];

      // Doji pattern
      if (this.isDoji(current)) patterns.push('Doji');
      
      // Hammer pattern
      if (this.isHammer(current)) patterns.push('Hammer');
      
      // Shooting Star pattern
      if (this.isShootingStar(current)) patterns.push('Shooting Star');
      
      // Engulfing patterns
      if (this.isBullishEngulfing(previous, current)) patterns.push('Bullish Engulfing');
      if (this.isBearishEngulfing(previous, current)) patterns.push('Bearish Engulfing');
      
      // Three White Soldiers
      if (this.isThreeWhiteSoldiers(beforePrevious, previous, current)) patterns.push('Three White Soldiers');
      
      // Three Black Crows
      if (this.isThreeBlackCrows(beforePrevious, previous, current)) patterns.push('Three Black Crows');
    }

    return [...new Set(patterns)]; // Remove duplicates
  }

  /**
   * Find support and resistance levels
   */
  findSupportResistanceLevels(ohlcvData) {
    if (!ohlcvData || ohlcvData.length < 10) return { support: [], resistance: [] };

    const highs = ohlcvData.map(d => d.high);
    const lows = ohlcvData.map(d => d.low);
    const closes = ohlcvData.map(d => d.close);

    // Find significant highs and lows
    const resistanceLevels = this.findSignificantLevels(highs, 'resistance');
    const supportLevels = this.findSignificantLevels(lows, 'support');

    return {
      support: supportLevels,
      resistance: resistanceLevels
    };
  }

  // Helper methods for technical calculations
  calculateSMA(data, period) {
    if (data.length < period) return null;
    const slice = data.slice(-period);
    return slice.reduce((a, b) => a + b, 0) / period;
  }

  calculateEMA(data, period) {
    if (data.length < period) return null;
    const multiplier = 2 / (period + 1);
    let ema = data[0];
    for (let i = 1; i < data.length; i++) {
      ema = (data[i] * multiplier) + (ema * (1 - multiplier));
    }
    return ema;
  }

  calculateRSI(data, period = 14) {
    if (data.length < period + 1) return null;
    
    let gains = 0;
    let losses = 0;
    
    for (let i = 1; i <= period; i++) {
      const change = data[i] - data[i - 1];
      if (change > 0) gains += change;
      else losses -= change;
    }
    
    const avgGain = gains / period;
    const avgLoss = losses / period;
    
    if (avgLoss === 0) return 100;
    
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  calculateMACD(data) {
    const ema12 = this.calculateEMA(data, 12);
    const ema26 = this.calculateEMA(data, 26);
    return ema12 && ema26 ? ema12 - ema26 : null;
  }

  calculateBollingerBands(data, period = 20, stdDev = 2) {
    const sma = this.calculateSMA(data, period);
    if (!sma) return null;
    
    const slice = data.slice(-period);
    const variance = slice.reduce((acc, val) => acc + Math.pow(val - sma, 2), 0) / period;
    const standardDeviation = Math.sqrt(variance);
    
    return {
      upper: sma + (standardDeviation * stdDev),
      middle: sma,
      lower: sma - (standardDeviation * stdDev)
    };
  }

  // Pattern detection methods
  detectDoubleTop(highs) {
    if (highs.length < 10) return false;
    const recent = highs.slice(-10);
    const max1 = Math.max(...recent.slice(0, 5));
    const max2 = Math.max(...recent.slice(5));
    return Math.abs(max1 - max2) / max1 < 0.02; // Within 2%
  }

  detectDoubleBottom(lows) {
    if (lows.length < 10) return false;
    const recent = lows.slice(-10);
    const min1 = Math.min(...recent.slice(0, 5));
    const min2 = Math.min(...recent.slice(5));
    return Math.abs(min1 - min2) / min1 < 0.02; // Within 2%
  }

  detectAscendingTriangle(highs, lows) {
    if (highs.length < 10) return false;
    const recent = highs.slice(-10);
    const recentLows = lows.slice(-10);
    
    // Check if highs are relatively flat and lows are ascending
    const highVariance = this.calculateVariance(recent);
    const lowTrend = this.calculateTrend(recentLows);
    
    return highVariance < 0.01 && lowTrend > 0.1;
  }

  detectDescendingTriangle(highs, lows) {
    if (highs.length < 10) return false;
    const recent = highs.slice(-10);
    const recentLows = lows.slice(-10);
    
    // Check if lows are relatively flat and highs are descending
    const lowVariance = this.calculateVariance(recentLows);
    const highTrend = this.calculateTrend(recent);
    
    return lowVariance < 0.01 && highTrend < -0.1;
  }

  detectSymmetricalTriangle(highs, lows) {
    if (highs.length < 10) return false;
    const recent = highs.slice(-10);
    const recentLows = lows.slice(-10);
    
    // Check if both highs and lows are converging
    const highTrend = this.calculateTrend(recent);
    const lowTrend = this.calculateTrend(recentLows);
    
    return highTrend < -0.05 && lowTrend > 0.05;
  }

  detectHeadAndShoulders(highs) {
    if (highs.length < 15) return false;
    const recent = highs.slice(-15);
    
    // Find three peaks
    const peaks = this.findPeaks(recent);
    if (peaks.length < 3) return false;
    
    const [left, head, right] = peaks.slice(-3);
    return left < head && right < head && Math.abs(left - right) / head < 0.05;
  }

  // Candlestick pattern detection
  isDoji(candle) {
    const bodySize = Math.abs(candle.close - candle.open);
    const totalRange = candle.high - candle.low;
    return bodySize / totalRange < 0.1; // Body is less than 10% of total range
  }

  isHammer(candle) {
    const bodySize = Math.abs(candle.close - candle.open);
    const lowerShadow = Math.min(candle.open, candle.close) - candle.low;
    const upperShadow = candle.high - Math.max(candle.open, candle.close);
    
    return lowerShadow > bodySize * 2 && upperShadow < bodySize * 0.5;
  }

  isShootingStar(candle) {
    const bodySize = Math.abs(candle.close - candle.open);
    const lowerShadow = Math.min(candle.open, candle.close) - candle.low;
    const upperShadow = candle.high - Math.max(candle.open, candle.close);
    
    return upperShadow > bodySize * 2 && lowerShadow < bodySize * 0.5;
  }

  isBullishEngulfing(prev, current) {
    return prev.close < prev.open && // Previous candle is bearish
           current.close > current.open && // Current candle is bullish
           current.open < prev.close && // Current opens below previous close
           current.close > prev.open; // Current closes above previous open
  }

  isBearishEngulfing(prev, current) {
    return prev.close > prev.open && // Previous candle is bullish
           current.close < current.open && // Current candle is bearish
           current.open > prev.close && // Current opens above previous close
           current.close < prev.open; // Current closes below previous open
  }

  isThreeWhiteSoldiers(candle1, candle2, candle3) {
    return candle1.close > candle1.open && // All three are bullish
           candle2.close > candle2.open &&
           candle3.close > candle3.open &&
           candle2.open > candle1.close && // Each opens within previous body
           candle3.open > candle2.close &&
           candle2.close > candle1.close && // Each closes higher
           candle3.close > candle2.close;
  }

  isThreeBlackCrows(candle1, candle2, candle3) {
    return candle1.close < candle1.open && // All three are bearish
           candle2.close < candle2.open &&
           candle3.close < candle3.open &&
           candle2.open < candle1.close && // Each opens within previous body
           candle3.open < candle2.close &&
           candle2.close < candle1.close && // Each closes lower
           candle3.close < candle2.close;
  }

  // Utility methods
  calculateVariance(data) {
    const mean = data.reduce((a, b) => a + b, 0) / data.length;
    const variance = data.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / data.length;
    return variance / (mean * mean); // Normalized variance
  }

  calculateTrend(data) {
    if (data.length < 2) return 0;
    const first = data[0];
    const last = data[data.length - 1];
    return (last - first) / first;
  }

  findPeaks(data) {
    const peaks = [];
    for (let i = 1; i < data.length - 1; i++) {
      if (data[i] > data[i - 1] && data[i] > data[i + 1]) {
        peaks.push(data[i]);
      }
    }
    return peaks;
  }

  findSignificantLevels(data, type) {
    const levels = [];
    const sortedData = [...data].sort((a, b) => b - a);
    
    for (let i = 0; i < Math.min(5, sortedData.length); i++) {
      const level = sortedData[i];
      const touches = data.filter(price => Math.abs(price - level) / level < 0.02).length;
      
      if (touches >= 2) { // Level touched at least twice
        levels.push(level);
      }
    }
    
    return levels.slice(0, 3); // Return top 3 levels
  }

  fillTemplate(template, variables) {
    let filledTemplate = template;
    for (const [key, value] of Object.entries(variables)) {
      const placeholder = `{${key}}`;
      const replacement = value !== undefined && value !== null ? String(value) : 'N/A';
      filledTemplate = filledTemplate.replace(new RegExp(placeholder, 'g'), replacement);
    }
    return filledTemplate;
  }

  getFallbackTechnicalAnalysis(moralisAnalytics, chartData, errorMessage = 'AI analysis unavailable') {
    const formatVolume = (vol) => vol ? parseFloat(vol).toLocaleString(undefined, { maximumFractionDigits: 2 }) : 'N/A';
    const formatPercent = (pct) => pct ? parseFloat(pct).toFixed(2) : 'N/A';
    const formatPrice = (price) => price ? parseFloat(price).toFixed(8) : 'N/A';

    let highPrices = [];
    let lowPrices = [];
    if (chartData && chartData.length > 0) {
      highPrices = chartData.map(d => d.high);
      lowPrices = chartData.map(d => d.low);
    }
    const support = lowPrices.length > 0 ? Math.min(...lowPrices).toFixed(8) : 'N/A';
    const resistance = highPrices.length > 0 ? Math.max(...highPrices).toFixed(8) : 'N/A';

    const buyVolume24h = parseFloat(moralisAnalytics?.totalBuyVolume?.['24h'] || 0);
    const sellVolume24h = parseFloat(moralisAnalytics?.totalSellVolume?.['24h'] || 0);
    const netVolume = buyVolume24h - sellVolume24h;
    const volumeTrend = netVolume > 0 ? 'positive inflow' : netVolume < 0 ? 'negative outflow' : 'balanced';

    return {
      marketOverview: {
        trend: moralisAnalytics?.pricePercentChange?.['24h'] > 0 ? 'Bullish' : 'Bearish',
        momentum: moralisAnalytics?.pricePercentChange?.['1h'] > 0 ? 'Increasing' : 'Decreasing',
        volatility: 'Medium',
        liquidityHealth: moralisAnalytics?.totalLiquidityUsd > 1000000 ? 'High' : 'Moderate',
        fdv: formatVolume(moralisAnalytics?.totalFullyDilutedValuation)
      },
      volumeAnalysis: {
        buyPressure: formatVolume(buyVolume24h),
        sellPressure: formatVolume(sellVolume24h),
        netFlow: `${volumeTrend} (${formatVolume(Math.abs(netVolume))})`,
        activeBuyers: moralisAnalytics?.totalBuyers?.['24h'] || 'N/A',
        activeSellers: moralisAnalytics?.totalSellers?.['24h'] || 'N/A'
      },
      priceAction: {
        chartPatterns: 'No specific patterns detected (fallback)',
        supportLevels: [support],
        resistanceLevels: [resistance],
        currentPrice: formatPrice(moralisAnalytics?.usdPrice),
        priceChange24h: formatPercent(moralisAnalytics?.pricePercentChange?.['24h'])
      },
      tradingStrategy: {
        entryStrategy: 'Monitor for consolidation near support',
        exitStrategy: 'Consider profit-taking near resistance',
        riskManagement: 'Set stop-loss below recent low',
        timeframe: 'Short-term to Medium-term'
      },
      keyLevels: {
        criticalSupport: support,
        criticalResistance: resistance,
        breakoutLevel: 'N/A',
        breakdownLevel: 'N/A'
      },
      riskFactors: ['Market volatility', 'Liquidity fluctuations'],
      catalysts: ['Potential community growth', 'Increased trading volume'],
      summary: `This token is currently showing a ${moralisAnalytics?.pricePercentChange?.['24h'] > 0 ? 'bullish' : 'bearish'} trend over 24 hours. There's ${volumeTrend} with ${formatVolume(Math.abs(netVolume))} in net volume. Key support is at ${support} and resistance at ${resistance}. Always DYOR. (Fallback Analysis)`
    };
  }
}

// Technical Analysis Prompt Template
const TECHNICAL_ANALYSIS_PROMPT_TEMPLATE = `You are an expert cryptocurrency technical analyst. Analyze the following token data and provide a comprehensive technical analysis.

TOKEN DATA:
- Address: {tokenAddress}
- Current Price: ${usdPrice}
- Total Liquidity: ${totalLiquidityUsd}
- FDV: ${totalFullyDilutedValuation}

VOLUME ANALYSIS (24h):
- Buy Volume: ${buyVolume24h}
- Sell Volume: ${sellVolume24h}
- Active Buyers: ${buyers24h}
- Active Sellers: ${sellers24h}
- Unique Wallets: ${uniqueWallets24h}

PRICE MOVEMENTS:
- 5m Change: ${priceChange5m}%
- 1h Change: ${priceChange1h}%
- 6h Change: ${priceChange6h}%
- 24h Change: ${priceChange24h}%

CHART DATA (OHLCV Analysis):
- Chart High: ${chartHigh}
- Chart Low: ${chartLow}
- Chart Close: ${chartClose}
- Data Points: ${chartDataPoints}
- Support Level: ${supportLevel}
- Resistance Level: ${resistanceLevel}

TECHNICAL INDICATORS:
- Trend Direction: ${trendDirection}
- Momentum: ${momentum}
- Volatility: ${volatility}
- Volume Analysis: ${volumeAnalysis}
- RSI: ${technicalIndicators}
- Moving Averages: SMA20, SMA50, EMA12, EMA26
- MACD: ${technicalIndicators}
- Bollinger Bands: Upper, Middle, Lower

CHART PATTERNS DETECTED:
- Chart Patterns: ${chartPatterns}
- Candlestick Patterns: ${candlestickPatterns}
- Support Levels: ${supportLevels}
- Resistance Levels: ${resistanceLevels}

Provide a comprehensive technical analysis using the OHLCV data and technical indicators. Focus on:

1. **Chart Pattern Analysis**: Analyze the detected patterns and their implications
2. **Technical Indicators**: Interpret RSI, MACD, Moving Averages, and Bollinger Bands
3. **Support/Resistance**: Use the calculated levels for entry/exit strategies
4. **Volume Confirmation**: Correlate volume analysis with price movements
5. **Candlestick Patterns**: Interpret the detected candlestick formations
6. **Risk Assessment**: Evaluate volatility and momentum for position sizing

Provide analysis in the following JSON format:

{
  "marketOverview": {
    "trend": "Bullish|Bearish|Neutral",
    "momentum": "Increasing|Decreasing|Stable|Overbought|Oversold",
    "volatility": "Low|Medium|High",
    "liquidityHealth": "Low|Moderate|High",
    "fdv": "FDV analysis",
    "technicalScore": "1-10 technical strength score"
  },
  "volumeAnalysis": {
    "buyPressure": "Buy pressure analysis with volume confirmation",
    "sellPressure": "Sell pressure analysis with volume confirmation", 
    "netFlow": "Net flow analysis with volume trends",
    "activeBuyers": "Buyer activity analysis",
    "activeSellers": "Seller activity analysis",
    "volumeConfirmation": "Volume confirmation of price movements"
  },
  "priceAction": {
    "chartPatterns": "Detailed analysis of detected chart patterns and their implications",
    "candlestickPatterns": "Analysis of candlestick patterns and reversal signals",
    "supportLevels": ["Support level 1 with strength", "Support level 2 with strength"],
    "resistanceLevels": ["Resistance level 1 with strength", "Resistance level 2 with strength"],
    "currentPrice": "Current price analysis relative to key levels",
    "priceChange24h": "24h price change analysis with context"
  },
  "technicalIndicators": {
    "rsi": "RSI analysis and overbought/oversold conditions",
    "macd": "MACD analysis and momentum signals",
    "movingAverages": "Moving average analysis and trend confirmation",
    "bollingerBands": "Bollinger Bands analysis and volatility",
    "volumeIndicators": "Volume-based technical indicators"
  },
  "tradingStrategy": {
    "entryStrategy": "Detailed entry strategy based on technical analysis",
    "exitStrategy": "Exit strategy with profit targets and stop losses",
    "riskManagement": "Risk management advice with position sizing",
    "timeframe": "Recommended timeframe for the strategy",
    "confidence": "Strategy confidence level (1-10)"
  },
  "keyLevels": {
    "criticalSupport": "Critical support level with analysis",
    "criticalResistance": "Critical resistance level with analysis",
    "breakoutLevel": "Breakout level and confirmation requirements",
    "breakdownLevel": "Breakdown level and confirmation requirements",
    "fibonacciLevels": "Key Fibonacci retracement levels if applicable"
  },
  "riskFactors": ["Technical risk factor 1", "Technical risk factor 2", "Market risk factor"],
  "catalysts": ["Technical catalyst 1", "Technical catalyst 2", "Market catalyst"],
  "summary": "Comprehensive technical analysis summary with actionable insights and crypto slang"
}

Use heavy crypto slang, provide specific price levels, and give actionable recommendations for traders. Focus on the technical analysis derived from the OHLCV data.`;

export default TechnicalAnalysisService;
