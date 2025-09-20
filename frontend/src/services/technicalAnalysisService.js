import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_BASE_URL || 'https://api.degen-oracle.com';

class TechnicalAnalysisFrontendService {
  constructor() {
    this.cache = new Map(); // Simple in-memory cache
  }

  async getTechnicalAnalysis(contractAddress, timeframe = '1D', chartData = null) {
    const cacheKey = `${contractAddress}-${timeframe}-${chartData ? chartData.length : 'no_chart'}`;
    if (this.cache.has(cacheKey)) {

      return this.cache.get(cacheKey);
    }

    try {

      
      // Use POST request to send chart data in body instead of URL params
      const response = await axios.post(`${API_BASE}/api/tokens/${contractAddress}/technical-analysis`, {
        timeframe,
        chartData: chartData || null
      }, {
        headers: {
          'Content-Type': 'application/json'
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
      
      // Handle specific error cases
      if (error.response) {
        const status = error.response.status;
        console.error(`Technical analysis request failed with status ${status}:`, error.response.data);
        
        // For 503 Service Unavailable, we could implement retry logic
        if (status === 503) {
          console.warn('🔄 Technical analysis service temporarily unavailable (503). This is usually temporary.');
          // Could add retry logic here in the future
        } else if (status === 429) {
          console.warn('⏳ Rate limit exceeded (429). Please wait before making more requests.');
        } else if (status >= 500) {
          console.error('🚨 Server error occurred. The backend service may be experiencing issues.');
        }
      } else if (error.request) {
        console.error('🌐 Network error: No response received from server');
      } else {
        console.error('⚠️ Request setup error:', error.message);
      }
      
      return null;
    }
  }

  // You can add more client-side analysis functions here if needed
  // e.g., calculateMovingAverages(chartData), detectCandlestickPatterns(chartData)
}

const technicalAnalysisService = new TechnicalAnalysisFrontendService();
export default technicalAnalysisService;
