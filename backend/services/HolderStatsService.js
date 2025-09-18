import axios from 'axios';

class HolderStatsService {
  constructor() {
    this.API_BASE = 'https://solana-gateway.moralis.io';
    this.API_KEY = process.env.MORALIS_API_KEY;
    this.NETWORK = 'mainnet'; // Solana mainnet
    
    if (!this.API_KEY) {
      console.warn('⚠️ MORALIS_API_KEY not found in environment variables');
    }
  }

  /**
   * Get current holder statistics for a token
   * @param {string} tokenAddress - The token contract address
   * @returns {Promise<Object>} Holder statistics data
   */
  async getHolderStats(tokenAddress) {
    try {
      console.log(`📊 Fetching holder stats for token: ${tokenAddress}`);
      
      const response = await axios.get(
        `${this.API_BASE}/token/${this.NETWORK}/holders/${tokenAddress}`,
        {
          headers: {
            'X-API-Key': this.API_KEY,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.status === 200 && response.data) {
        console.log(`✅ Successfully fetched holder stats`);
        return {
          success: true,
          data: response.data
        };
      } else {
        throw new Error(`Unexpected response status: ${response.status}`);
      }
    } catch (error) {
      console.error('❌ HolderStatsService.getHolderStats failed:', error.message);
      
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
   * Get formatted holder statistics with additional calculations
   * @param {string} tokenAddress - The token contract address
   * @param {Object} topHoldersData - Optional top holders data for enhanced analysis
   * @returns {Promise<Object>} Formatted holder statistics
   */
  async getFormattedHolderStats(tokenAddress, topHoldersData = null) {
    try {
      const result = await this.getHolderStats(tokenAddress);
      
      if (!result.success) {
        return result;
      }

      const stats = result.data;
      
      // Extract key metrics from Moralis response
      const totalHolders = stats.total_holders || 0;
      const uniqueHolders = stats.unique_holders || totalHolders;
      
      // Calculate holder distribution segments (based on typical DeFi categorization)
      const holderDistribution = this.calculateHolderDistribution(topHoldersData);
      
      // Calculate supply concentration if top holders data is available
      const supplyConcentration = topHoldersData ? 
        this.calculateSupplyConcentration(topHoldersData.holders) : null;

      return {
        success: true,
        totalHolders: totalHolders,
        uniqueHolders: uniqueHolders,
        holderDistribution: holderDistribution,
        supplyConcentration: supplyConcentration,
        lastUpdated: new Date().toISOString(),
        rawData: stats
      };
    } catch (error) {
      console.error('❌ HolderStatsService.getFormattedHolderStats failed:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Calculate holder distribution by segments (whales, sharks, etc.)
   * @param {Object} topHoldersData - Top holders data
   * @returns {Object} Holder distribution by segments
   */
  calculateHolderDistribution(topHoldersData) {
    if (!topHoldersData || !topHoldersData.holders) {
      // Return mock distribution if no data available
      return {
        whales: 0,      // >1% of supply
        sharks: 0,      // 0.1% - 1%
        dolphins: 0,    // 0.01% - 0.1%
        fish: 0,        // 0.001% - 0.01%
        octopus: 0,     // 0.0001% - 0.001%
        crabs: 0,       // 0.00001% - 0.0001%
        shrimps: 0      // <0.00001%
      };
    }

    const holders = topHoldersData.holders;
    const distribution = {
      whales: 0,      // >1% of supply
      sharks: 0,      // 0.1% - 1%
      dolphins: 0,    // 0.01% - 0.1%
      fish: 0,        // 0.001% - 0.01%
      octopus: 0,     // 0.0001% - 0.001%
      crabs: 0,       // 0.00001% - 0.0001%
      shrimps: 0      // <0.00001%
    };

    holders.forEach(holder => {
      const percentage = holder.percentage || 0;
      
      if (percentage >= 1) {
        distribution.whales++;
      } else if (percentage >= 0.1) {
        distribution.sharks++;
      } else if (percentage >= 0.01) {
        distribution.dolphins++;
      } else if (percentage >= 0.001) {
        distribution.fish++;
      } else if (percentage >= 0.0001) {
        distribution.octopus++;
      } else if (percentage >= 0.00001) {
        distribution.crabs++;
      } else {
        distribution.shrimps++;
      }
    });

    return distribution;
  }

  /**
   * Calculate supply concentration metrics
   * @param {Array} holders - Array of top holders
   * @returns {Object} Supply concentration metrics
   */
  calculateSupplyConcentration(holders) {
    if (!holders || holders.length === 0) {
      return null;
    }

    const sortedHolders = holders.sort((a, b) => b.percentage - a.percentage);
    
    const concentration = {
      top5: 0,
      top10: 0,
      top25: 0,
      top50: 0,
      top100: 0
    };

    // Calculate cumulative percentages for different top-N groups
    sortedHolders.forEach((holder, index) => {
      const percentage = holder.percentage || 0;
      
      if (index < 5) concentration.top5 += percentage;
      if (index < 10) concentration.top10 += percentage;
      if (index < 25) concentration.top25 += percentage;
      if (index < 50) concentration.top50 += percentage;
      if (index < 100) concentration.top100 += percentage;
    });

    // Round to 2 decimal places
    Object.keys(concentration).forEach(key => {
      concentration[key] = Math.round(concentration[key] * 100) / 100;
    });

    return concentration;
  }

  /**
   * Analyze holder acquisition patterns (mock implementation)
   * This would require additional data from Moralis or other sources
   * @returns {Object} Holder acquisition analysis
   */
  getHolderAcquisitionAnalysis() {
    // This is a mock implementation since Moralis doesn't directly provide acquisition method data
    // In a real implementation, you'd analyze transaction patterns to determine acquisition methods
    return {
      swap: 0,      // Acquired through DEX swaps
      transfer: 0,  // Acquired through transfers
      airdrop: 0,   // Acquired through airdrops
      mint: 0       // Acquired through minting
    };
  }

  /**
   * Calculate holder health score
   * @param {Object} stats - Holder statistics
   * @returns {Object} Holder health assessment
   */
  calculateHolderHealth(stats) {
    if (!stats.supplyConcentration) {
      return { score: 0, level: 'unknown', factors: [] };
    }

    let score = 100;
    const factors = [];

    // Penalize high concentration
    if (stats.supplyConcentration.top10 > 80) {
      score -= 40;
      factors.push('Very high top-10 concentration');
    } else if (stats.supplyConcentration.top10 > 60) {
      score -= 25;
      factors.push('High top-10 concentration');
    } else if (stats.supplyConcentration.top10 > 40) {
      score -= 10;
      factors.push('Moderate top-10 concentration');
    }

    // Penalize very low holder count
    if (stats.totalHolders < 100) {
      score -= 30;
      factors.push('Very low holder count');
    } else if (stats.totalHolders < 1000) {
      score -= 15;
      factors.push('Low holder count');
    }

    // Determine health level
    let level;
    if (score >= 80) level = 'excellent';
    else if (score >= 60) level = 'good';
    else if (score >= 40) level = 'fair';
    else if (score >= 20) level = 'poor';
    else level = 'critical';

    return {
      score: Math.max(0, score),
      level,
      factors
    };
  }
}

export default HolderStatsService;
