const axios = require('axios');

class HolderTimeseriesService {
  constructor() {
    this.API_BASE = 'https://solana-gateway.moralis.io';
    this.API_KEY = process.env.MORALIS_API_KEY;
    this.NETWORK = 'mainnet'; // Solana mainnet
    
    if (!this.API_KEY) {
      console.warn('⚠️ MORALIS_API_KEY not found in environment variables');
    }
  }

  /**
   * Get historical holder data for a token
   * @param {string} tokenAddress - The token contract address
   * @param {string} timeframe - Timeframe for historical data (default: '24hr')
   * @param {number} days - Number of days to look back (default: 1)
   * @returns {Promise<Object>} Historical holder data
   */
  async getHolderTimeseries(tokenAddress, timeframe = '24hr', days = 1) {
    try {
      console.log(`📈 Fetching holder timeseries for token: ${tokenAddress} (${timeframe}, ${days}d)`);
      
      // Calculate date range
      const toDate = new Date();
      const fromDate = new Date(toDate.getTime() - (days * 24 * 60 * 60 * 1000));
      
      const response = await axios.get(
        `${this.API_BASE}/token/${this.NETWORK}/holders/${tokenAddress}/historical`,
        {
          headers: {
            'X-API-Key': this.API_KEY,
            'Content-Type': 'application/json'
          },
          params: {
            from_date: fromDate.toISOString(),
            to_date: toDate.toISOString(),
            timeframe: timeframe
          }
        }
      );

      if (response.status === 200 && response.data) {
        console.log(`✅ Successfully fetched ${response.data.result?.length || 0} holder timeseries points`);
        return {
          success: true,
          data: response.data.result || [],
          total: response.data.total || 0,
          timeframe: timeframe,
          fromDate: fromDate.toISOString(),
          toDate: toDate.toISOString()
        };
      } else {
        throw new Error(`Unexpected response status: ${response.status}`);
      }
    } catch (error) {
      console.error('❌ HolderTimeseriesService.getHolderTimeseries failed:', error.message);
      
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
   * Get formatted holder change analysis with multiple timeframes
   * @param {string} tokenAddress - The token contract address
   * @returns {Promise<Object>} Formatted holder change data
   */
  async getHolderChangeAnalysis(tokenAddress) {
    try {
      console.log(`🔄 Analyzing holder changes for token: ${tokenAddress}`);
      
      // Get current holder count first
      const currentStats = await this.getCurrentHolderCount(tokenAddress);
      if (!currentStats.success) {
        return currentStats;
      }
      
      const currentHolders = currentStats.holderCount;
      
      // Define timeframes to analyze
      const timeframes = [
        { key: '5min', hours: 0.083, label: '5 minutes' },    // 5 minutes
        { key: '1h', hours: 1, label: '1 hour' },
        { key: '6h', hours: 6, label: '6 hours' },
        { key: '24h', hours: 24, label: '24 hours' },
        { key: '3d', hours: 72, label: '3 days' },
        { key: '7d', hours: 168, label: '7 days' },
        { key: '30d', hours: 720, label: '30 days' }
      ];

      const holderChanges = {};
      
      // For each timeframe, get historical data and calculate change
      for (const tf of timeframes) {
        try {
          const historicalData = await this.getHistoricalHolderCount(tokenAddress, tf.hours);
          
          if (historicalData.success && historicalData.holderCount !== null) {
            const change = currentHolders - historicalData.holderCount;
            const changePercent = historicalData.holderCount > 0 ? 
              (change / historicalData.holderCount) : 0;
            
            holderChanges[tf.key] = {
              change: change,
              changePercent: changePercent,
              previous: historicalData.holderCount,
              current: currentHolders,
              timeframe: tf.label
            };
          } else {
            // If no historical data, set to null
            holderChanges[tf.key] = {
              change: null,
              changePercent: null,
              previous: null,
              current: currentHolders,
              timeframe: tf.label
            };
          }
        } catch (error) {
          console.warn(`⚠️ Failed to get ${tf.key} data:`, error.message);
          holderChanges[tf.key] = {
            change: null,
            changePercent: null,
            previous: null,
            current: currentHolders,
            timeframe: tf.label,
            error: error.message
          };
        }
      }

      return {
        success: true,
        currentHolders: currentHolders,
        holderChanges: holderChanges,
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      console.error('❌ HolderTimeseriesService.getHolderChangeAnalysis failed:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get current holder count (helper method)
   * @param {string} tokenAddress - The token contract address
   * @returns {Promise<Object>} Current holder count
   */
  async getCurrentHolderCount(tokenAddress) {
    try {
      // This would typically call the HolderStatsService
      // For now, we'll make a direct call to get current stats
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
        return {
          success: true,
          holderCount: response.data.total_holders || 0
        };
      } else {
        throw new Error(`Unexpected response status: ${response.status}`);
      }
    } catch (error) {
      console.error('❌ Failed to get current holder count:', error.message);
      return {
        success: false,
        error: error.message,
        holderCount: 0
      };
    }
  }

  /**
   * Get historical holder count for a specific time ago
   * @param {string} tokenAddress - The token contract address
   * @param {number} hoursAgo - Hours to look back
   * @returns {Promise<Object>} Historical holder count
   */
  async getHistoricalHolderCount(tokenAddress, hoursAgo) {
    try {
      const toDate = new Date(Date.now() - (hoursAgo * 60 * 60 * 1000));
      const fromDate = new Date(toDate.getTime() - (60 * 60 * 1000)); // 1 hour window
      
      const response = await axios.get(
        `${this.API_BASE}/token/${this.NETWORK}/holders/${tokenAddress}/historical`,
        {
          headers: {
            'X-API-Key': this.API_KEY,
            'Content-Type': 'application/json'
          },
          params: {
            from_date: fromDate.toISOString(),
            to_date: toDate.toISOString(),
            timeframe: '1hr'
          }
        }
      );

      if (response.status === 200 && response.data && response.data.result) {
        const dataPoints = response.data.result;
        if (dataPoints.length > 0) {
          // Get the closest data point to our target time
          const closestPoint = dataPoints[dataPoints.length - 1];
          return {
            success: true,
            holderCount: closestPoint.total_holders || 0,
            timestamp: closestPoint.timestamp
          };
        }
      }
      
      return {
        success: false,
        error: 'No historical data available',
        holderCount: null
      };
    } catch (error) {
      console.error(`❌ Failed to get historical holder count for ${hoursAgo}h ago:`, error.message);
      return {
        success: false,
        error: error.message,
        holderCount: null
      };
    }
  }

  /**
   * Get holder flow analysis (net changes over time)
   * @param {string} tokenAddress - The token contract address
   * @param {number} days - Number of days to analyze (default: 7)
   * @returns {Promise<Object>} Holder flow analysis
   */
  async getHolderFlow(tokenAddress, days = 7) {
    try {
      console.log(`🌊 Analyzing holder flow for ${days} days: ${tokenAddress}`);
      
      const timeseries = await this.getHolderTimeseries(tokenAddress, '24hr', days);
      
      if (!timeseries.success) {
        return timeseries;
      }

      const dataPoints = timeseries.data;
      if (dataPoints.length < 2) {
        return {
          success: false,
          error: 'Insufficient data for flow analysis'
        };
      }

      // Calculate daily changes
      const dailyChanges = [];
      for (let i = 1; i < dataPoints.length; i++) {
        const current = dataPoints[i];
        const previous = dataPoints[i - 1];
        
        const change = (current.total_holders || 0) - (previous.total_holders || 0);
        const date = new Date(current.timestamp).toISOString().split('T')[0];
        
        dailyChanges.push({
          date: date,
          change: change,
          holders: current.total_holders || 0,
          timestamp: current.timestamp
        });
      }

      // Calculate flow metrics
      const totalChange = dailyChanges.reduce((sum, day) => sum + day.change, 0);
      const avgDailyChange = totalChange / dailyChanges.length;
      const volatility = this.calculateVolatility(dailyChanges.map(d => d.change));
      
      // Categorize flow trend
      let trend = 'stable';
      if (avgDailyChange > 50) trend = 'growing';
      else if (avgDailyChange < -50) trend = 'declining';
      
      return {
        success: true,
        totalChange: totalChange,
        avgDailyChange: avgDailyChange,
        volatility: volatility,
        trend: trend,
        dailyChanges: dailyChanges,
        period: `${days} days`,
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      console.error('❌ HolderTimeseriesService.getHolderFlow failed:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Calculate volatility of holder changes
   * @param {Array} changes - Array of daily changes
   * @returns {number} Volatility score
   */
  calculateVolatility(changes) {
    if (changes.length < 2) return 0;
    
    const mean = changes.reduce((sum, change) => sum + change, 0) / changes.length;
    const variance = changes.reduce((sum, change) => sum + Math.pow(change - mean, 2), 0) / changes.length;
    
    return Math.sqrt(variance);
  }

  /**
   * Generate mock holder acquisition data (since Moralis doesn't provide this directly)
   * @param {number} totalHolders - Total number of holders
   * @returns {Object} Mock acquisition data
   */
  generateMockAcquisitionData(totalHolders) {
    // Generate realistic distribution based on typical DeFi patterns
    const swapPercent = 0.65 + Math.random() * 0.15;      // 65-80% from swaps
    const transferPercent = 0.15 + Math.random() * 0.15;  // 15-30% from transfers
    const airdropPercent = Math.max(0.02, 1 - swapPercent - transferPercent); // Remainder from airdrops
    
    return {
      swap: Math.floor(totalHolders * swapPercent),
      transfer: Math.floor(totalHolders * transferPercent),
      airdrop: Math.floor(totalHolders * airdropPercent)
    };
  }
}

module.exports = HolderTimeseriesService;
