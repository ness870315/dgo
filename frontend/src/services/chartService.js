class ChartService {
  constructor() {
    this.API_BASE = process.env.REACT_APP_API_BASE_URL || 'https://api.degen-oracle.com';
  }

  async getMcapChart(contractAddress, calledAt) {
    try {
      const response = await fetch(
        `${this.API_BASE}/api/tokens/${contractAddress}/mcap-chart?calledAt=${encodeURIComponent(calledAt)}`
      );
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Failed to fetch mcap chart:', error);
      throw error;
    }
  }

  /**
   * Get historical price data for a token
   * @param {string} contractAddress - Token contract address
   * @param {string} timeframe - Timeframe: '1D', '1W', '1M', '3M', '1Y', 'ALL'
   * @param {number} limit - Number of data points (max 2000)
   * @returns {Promise<Object>} Chart data response
   */
  async getPriceChart(contractAddress, timeframe = '1D', limit = 1000) {
    try {
      const response = await fetch(
        `${this.API_BASE}/api/tokens/${contractAddress}/price-chart?timeframe=${timeframe}&limit=${limit}`
      );
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Failed to fetch price chart:', error);
      throw error;
    }
  }

  /**
   * Get current price for a token
   * @param {string} contractAddress - Token contract address
   * @returns {Promise<Object>} Current price data
   */
  async getCurrentPrice(contractAddress) {
    try {
      const response = await fetch(
        `${this.API_BASE}/api/tokens/${contractAddress}/current-price`
      );
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Failed to fetch current price:', error);
      throw error;
    }
  }

  /**
   * Get available timeframes for price charts
   * @returns {Promise<Object>} Available timeframes
   */
  async getTimeframes() {
    try {
      const response = await fetch(
        `${this.API_BASE}/api/tokens/price-chart/timeframes`
      );
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Failed to fetch timeframes:', error);
      throw error;
    }
  }

  /**
   * Get price chart service status
   * @returns {Promise<Object>} Service status
   */
  async getStatus() {
    try {
      const response = await fetch(
        `${this.API_BASE}/api/tokens/price-chart/status`
      );
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Failed to fetch price chart status:', error);
      throw error;
    }
  }
}

const chartService = new ChartService();
export default chartService;
