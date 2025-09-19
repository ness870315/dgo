import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_BASE_URL || 'https://api.degen-oracle.com';

class TechnicalAnalysisFrontendService {
  constructor() {
    this.cache = new Map(); // Simple in-memory cache
  }

  async getTechnicalAnalysis(contractAddress, timeframe = '1D', chartData = null) {
    const cacheKey = `${contractAddress}-${timeframe}-${chartData ? chartData.length : 'no_chart'}`;
    if (this.cache.has(cacheKey)) {
      console.log(`💾 Using cached frontend technical analysis for ${contractAddress} (${timeframe})`);
      return this.cache.get(cacheKey);
    }

    try {
      console.log(`🔍 Fetching technical analysis from backend for ${contractAddress} (${timeframe}) with ${chartData ? chartData.length : 0} chart data points`);
      const response = await axios.get(`${API_BASE}/api/tokens/${contractAddress}/technical-analysis`, {
        params: { 
          timeframe,
          chartData: chartData ? JSON.stringify(chartData) : null
        }
      });

      if (response.data.success) {
        const analysis = response.data.data;
        // Optionally, perform additional client-side calculations or formatting here
        // For example, if chartData is available, you could refine support/resistance based on visible range
        
        this.cache.set(cacheKey, analysis);
        return analysis;
      } else {
        console.error('Backend technical analysis failed:', response.data.error);
        return null;
      }
    } catch (error) {
      console.error('Error fetching technical analysis:', error);
      return null;
    }
  }

  // You can add more client-side analysis functions here if needed
  // e.g., calculateMovingAverages(chartData), detectCandlestickPatterns(chartData)
}

const technicalAnalysisService = new TechnicalAnalysisFrontendService();
export default technicalAnalysisService;
