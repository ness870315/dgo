import axios from 'axios';

class TopHoldersService {
  constructor() {
    this.API_BASE = 'https://solana-gateway.moralis.io';
    this.API_KEY = process.env.MORALIS_API_KEY;
    this.NETWORK = 'mainnet'; // Solana mainnet
    
    if (!this.API_KEY) {
      console.warn('⚠️ MORALIS_API_KEY not found in environment variables');
    }
  }

  /**
   * Get top holders for a token
   * @param {string} tokenAddress - The token contract address
   * @param {number} limit - Number of top holders to return (default: 20)
   * @returns {Promise<Object>} Top holders data
   */
  async getTopHolders(tokenAddress, limit = 20) {
    try {
      console.log(`🔍 Fetching top ${limit} holders for token: ${tokenAddress}`);
      
      const response = await axios.get(
        `${this.API_BASE}/token/${this.NETWORK}/${tokenAddress}/top-holders`,
        {
          headers: {
            'X-API-Key': this.API_KEY,
            'Content-Type': 'application/json'
          },
          params: {
            limit: limit
          }
        }
      );

      if (response.status === 200 && response.data) {
        console.log(`✅ Successfully fetched ${response.data.result?.length || 0} top holders`);
        console.log(`🔍 Sample holder data:`, response.data.result?.[0]);
        return {
          success: true,
          data: response.data.result || [],
          total: response.data.total || 0,
          page: response.data.page || 1,
          pageSize: response.data.page_size || limit
        };
      } else {
        throw new Error(`Unexpected response status: ${response.status}`);
      }
    } catch (error) {
      console.error('❌ TopHoldersService.getTopHolders failed:', error.message);
      
      if (error.response) {
        console.error(`HTTP ${error.response.status}:`, error.response.data);
        return {
          success: false,
          error: `Moralis API error: ${error.response.status}`,
          details: error.response.data
        };
      }
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get formatted top holders with additional calculations
   * @param {string} tokenAddress - The token contract address
   * @param {number} totalSupply - Total token supply for percentage calculations
   * @param {number} limit - Number of top holders to return
   * @returns {Promise<Object>} Formatted top holders data
   */
  async getFormattedTopHolders(tokenAddress, totalSupply = null, limit = 20) {
    try {
      const result = await this.getTopHolders(tokenAddress, limit);
      
      if (!result.success) {
        return result;
      }

      console.log(`🔍 Total supply for percentage calculation:`, totalSupply);
      console.log(`🔍 Sample holder balance:`, result.data[0]?.balance);

      // Calculate percentages and format data
      const formattedHolders = result.data.map((holder, index) => {
        const balance = parseFloat(holder.balance || 0);
        
        // Use the percentage directly from Moralis API (percentageRelativeToTotalSupply)
        const percentage = parseFloat(holder.percentageRelativeToTotalSupply || 0);
        
        // Use the correct field name from Moralis API
        const address = holder.ownerAddress || 'Unknown';
        
        return {
          rank: index + 1,
          address: address,
          balance: balance,
          balanceFormatted: this.formatBalance(balance),
          percentage: percentage,
          percentageFormatted: `${percentage.toFixed(4)}%`,
          isContract: holder.isContract || false
        };
      });

      return {
        success: true,
        holders: formattedHolders,
        totalHolders: result.total,
        supplyAnalyzed: formattedHolders.reduce((sum, h) => sum + h.balance, 0),
        concentrationRisk: this.calculateConcentrationRisk(formattedHolders)
      };
    } catch (error) {
      console.error('❌ TopHoldersService.getFormattedTopHolders failed:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Calculate concentration risk based on top holders
   * @param {Array} holders - Array of formatted holders
   * @returns {Object} Concentration risk assessment
   */
  calculateConcentrationRisk(holders) {
    if (!holders || holders.length === 0) {
      return { level: 'unknown', description: 'No holder data available' };
    }

    const top10Percentage = holders.slice(0, 10).reduce((sum, h) => sum + h.percentage, 0);
    const top5Percentage = holders.slice(0, 5).reduce((sum, h) => sum + h.percentage, 0);
    
    if (top5Percentage >= 80) {
      return { 
        level: 'extreme', 
        description: 'Extreme concentration - Top 5 holders control majority',
        top5: top5Percentage,
        top10: top10Percentage
      };
    } else if (top10Percentage >= 70) {
      return { 
        level: 'high', 
        description: 'High concentration - Top 10 holders control majority',
        top5: top5Percentage,
        top10: top10Percentage
      };
    } else if (top10Percentage >= 50) {
      return { 
        level: 'moderate', 
        description: 'Moderate concentration',
        top5: top5Percentage,
        top10: top10Percentage
      };
    } else {
      return { 
        level: 'low', 
        description: 'Well distributed',
        top5: top5Percentage,
        top10: top10Percentage
      };
    }
  }

  /**
   * Format balance for display
   * @param {number} balance - Raw balance
   * @returns {string} Formatted balance
   */
  formatBalance(balance) {
    if (balance >= 1e9) {
      return `${(balance / 1e9).toFixed(2)}B`;
    } else if (balance >= 1e6) {
      return `${(balance / 1e6).toFixed(2)}M`;
    } else if (balance >= 1e3) {
      return `${(balance / 1e3).toFixed(2)}K`;
    } else {
      return balance.toFixed(2);
    }
  }
}

export default TopHoldersService;
