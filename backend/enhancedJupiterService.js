import axios from 'axios';

class EnhancedJupiterService {
  constructor() {
    this.baseUrl = 'https://lite-api.jup.ag/tokens/v2';
    this.cache = new Map();
    this.cacheExpiry = 15 * 60 * 1000; // 15 minutes
    console.log('🪐 Enhanced Jupiter Service initialized');
  }

  async getTokenData(contractAddress) {
    try {
      console.log(`🪐 Fetching Jupiter data for ${contractAddress}...`);
      
      // Check cache first
      const cached = this.cache.get(contractAddress);
      if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
        console.log(`🪐 Using cached Jupiter data for ${contractAddress}`);
        return cached.data;
      }

      // Fetch from Jupiter API using search endpoint
      const response = await axios.get(`${this.baseUrl}/search?query=${contractAddress}`, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json'
        }
      });
      
      let tokenData = null;
      
      if (response.data && Array.isArray(response.data) && response.data.length > 0) {
        tokenData = response.data[0]; // Get first result from array
      } else if (response.data && typeof response.data === 'object' && !Array.isArray(response.data)) {
        tokenData = response.data; // Direct object response
      } else {
        throw new Error('Invalid response format from Jupiter API');
      }
      
      if (tokenData) {
        // Cache the result
        this.cache.set(contractAddress, {
          data: tokenData,
          timestamp: Date.now()
        });

        console.log(`✅ Jupiter data fetched for ${contractAddress}`);
        return tokenData;
      } else {
        throw new Error('No token data found in Jupiter API response');
      }

    } catch (error) {
      console.error(`❌ Error fetching Jupiter data for ${contractAddress}:`, error.message);
      
      // Return fallback data
      return {
        symbol: 'UNKNOWN',
        name: 'Unknown Token',
        contractAddress: contractAddress,
        error: error.message,
        fallback: true
      };
    }
  }

  async healthCheck() {
    try {
      const response = await axios.get(`${this.baseUrl}/v4/health`);
      return response.status === 200;
    } catch (error) {
      console.error('❌ Jupiter API health check failed:', error.message);
      return false;
    }
  }

  getServiceInfo() {
    return {
      name: 'Enhanced Jupiter Service',
      version: '2.0.0',
      baseUrl: this.baseUrl,
      cacheSize: this.cache.size,
      cacheExpiry: this.cacheExpiry / 1000 / 60, // minutes
      description: 'Enhanced Jupiter API integration with caching and fallback support'
    };
  }

  clearCache() {
    this.cache.clear();
    console.log('🧹 Jupiter service cache cleared');
  }
}

export default EnhancedJupiterService;
