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
      const moralisAnalytics = await this.getMoralisTokenAnalytics(contractAddress);

      // Prepare data for AI analysis
      const templateVars = this.prepareTemplateVariables(moralisAnalytics, chartData);

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
      console.error(`❌ Technical analysis failed for ${contractAddress}:`, error.message);
      const fallbackAnalysis = this.getFallbackTechnicalAnalysis(null, chartData, error.message);
      return { success: true, data: fallbackAnalysis, error: error.message }; // Still return success with fallback
    }
  }

  prepareTemplateVariables(moralisAnalytics, chartData) {
    const formatVolume = (vol) => vol ? parseFloat(vol).toLocaleString(undefined, { maximumFractionDigits: 2 }) : 'N/A';
    const formatPercent = (pct) => pct ? parseFloat(pct).toFixed(2) : 'N/A';
    const formatPrice = (price) => price ? parseFloat(price).toFixed(8) : 'N/A';

    // Basic chart data processing for patterns/levels
    let highPrices = [];
    let lowPrices = [];
    let closePrices = [];
    if (chartData && chartData.length > 0) {
      highPrices = chartData.map(d => d.high);
      lowPrices = chartData.map(d => d.low);
      closePrices = chartData.map(d => d.close);
    }

    // Simple support/resistance (can be enhanced)
    const support = lowPrices.length > 0 ? Math.min(...lowPrices).toFixed(8) : 'N/A';
    const resistance = highPrices.length > 0 ? Math.max(...highPrices).toFixed(8) : 'N/A';

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

      chartHigh: highPrices.length > 0 ? Math.max(...highPrices).toFixed(8) : 'N/A',
      chartLow: lowPrices.length > 0 ? Math.min(...lowPrices).toFixed(8) : 'N/A',
      chartClose: closePrices.length > 0 ? closePrices[closePrices.length - 1].toFixed(8) : 'N/A',
      chartDataPoints: chartData ? chartData.length : 0,
      supportLevel: support,
      resistanceLevel: resistance,
    };
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

CHART DATA:
- Chart High: ${chartHigh}
- Chart Low: ${chartLow}
- Chart Close: ${chartClose}
- Data Points: ${chartDataPoints}
- Support Level: ${supportLevel}
- Resistance Level: ${resistanceLevel}

Provide a detailed technical analysis in the following JSON format:

{
  "marketOverview": {
    "trend": "Bullish|Bearish|Neutral",
    "momentum": "Increasing|Decreasing|Stable",
    "volatility": "Low|Medium|High",
    "liquidityHealth": "Low|Moderate|High",
    "fdv": "FDV analysis"
  },
  "volumeAnalysis": {
    "buyPressure": "Buy pressure analysis",
    "sellPressure": "Sell pressure analysis", 
    "netFlow": "Net flow analysis",
    "activeBuyers": "Buyer activity analysis",
    "activeSellers": "Seller activity analysis"
  },
  "priceAction": {
    "chartPatterns": "Identified chart patterns",
    "supportLevels": ["Support level 1", "Support level 2"],
    "resistanceLevels": ["Resistance level 1", "Resistance level 2"],
    "currentPrice": "Current price analysis",
    "priceChange24h": "24h price change analysis"
  },
  "tradingStrategy": {
    "entryStrategy": "Entry strategy recommendations",
    "exitStrategy": "Exit strategy recommendations",
    "riskManagement": "Risk management advice",
    "timeframe": "Recommended timeframe"
  },
  "keyLevels": {
    "criticalSupport": "Critical support level",
    "criticalResistance": "Critical resistance level",
    "breakoutLevel": "Breakout level",
    "breakdownLevel": "Breakdown level"
  },
  "riskFactors": ["Risk factor 1", "Risk factor 2"],
  "catalysts": ["Catalyst 1", "Catalyst 2"],
  "summary": "Overall analysis summary with actionable insights"
}

Use crypto slang and provide actionable recommendations for traders.`;

export default TechnicalAnalysisService;
