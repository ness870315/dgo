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
}

const chartService = new ChartService();
export default chartService;
