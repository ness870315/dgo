import axios from 'axios';

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
   * Get historical holder data for a token (simplified to 1d timeframe, 24hr lookback)
   * @param {string} tokenAddress - The token contract address
   * @returns {Promise<Object>} Historical holder data
   */
  async getHolderTimeseries(tokenAddress) {
    try {
      console.log(`📈 Fetching holder timeseries for token: ${tokenAddress} (1d timeframe, 24hr lookback)`);
      
      // Calculate date range - exactly 24 hours ago to now
      const toDate = new Date();
      const fromDate = new Date(toDate.getTime() - (24 * 60 * 60 * 1000)); // 24 hours ago
      
      // Format dates as YYYY-MM-DD
      const fromDateStr = fromDate.toISOString().split('T')[0]; // 2025-09-17
      const toDateStr = toDate.toISOString().split('T')[0];     // 2025-09-18
      
      console.log(`📅 Date range: ${fromDateStr} to ${toDateStr}`);
      
      const response = await axios.get(
        `${this.API_BASE}/token/${this.NETWORK}/holders/${tokenAddress}/historical`,
        {
          headers: {
            'X-API-Key': this.API_KEY,
            'Content-Type': 'application/json'
          },
          params: {
            timeFrame: '1d',        // Use timeFrame (not timeframe)
            fromDate: fromDateStr,  // 2025-09-17 format
            toDate: toDateStr,      // 2025-09-18 format
            limit: 100              // Add limit parameter
          }
        }
      );

      if (response.status === 200 && response.data) {
        console.log(`✅ Successfully fetched ${response.data.result?.length || 0} holder timeseries points`);
        return {
          success: true,
          data: response.data.result || [],
          total: response.data.total || 0,
          timeframe: '1d',
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
      
      // Get current holder stats which includes holderChange data
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
        const stats = response.data;
        console.log(`🔍 Raw holder stats with changes:`, stats);
        
        const currentHolders = stats.totalHolders || 0;
        const holderChanges = stats.holderChange || {};
        
        // Get historical timeseries data for richer analysis
        const historicalData = await this.getHolderTimeseries(tokenAddress);
        let holderFlowData = null;
        
        if (historicalData.success && historicalData.data?.result?.length > 0) {
          holderFlowData = this.processHistoricalFlowData(historicalData.data.result);
        }
        
        // Ensure all expected timeframes are present
        const expectedTimeframes = ['5min', '1h', '6h', '24h', '3d', '7d', '30d'];
        const formattedChanges = {};
        
        expectedTimeframes.forEach(key => {
          if (holderChanges[key]) {
            formattedChanges[key] = {
              change: holderChanges[key].change || 0,
              changePercent: holderChanges[key].changePercent || 0,
              previous: currentHolders - (holderChanges[key].change || 0),
              current: currentHolders,
              timeframe: this.getTimeframeLabel(key)
            };
          } else {
            formattedChanges[key] = {
              change: 0,
              changePercent: 0,
              previous: currentHolders,
              current: currentHolders,
              timeframe: this.getTimeframeLabel(key)
            };
          }
        });

        return {
          success: true,
          currentHolders: currentHolders,
          holderChanges: formattedChanges,
          holderFlowData: holderFlowData,
          lastUpdated: new Date().toISOString()
        };
      } else {
        throw new Error(`Unexpected response status: ${response.status}`);
      }
    } catch (error) {
      console.error('❌ HolderTimeseriesService.getHolderChangeAnalysis failed:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Process historical flow data for charts
   * @param {Array} historicalData - Raw historical data from Moralis
   * @returns {Object} Processed flow data for charts
   */
  processHistoricalFlowData(historicalData) {
    if (!historicalData || historicalData.length === 0) {
      return null;
    }

    // Sort by timestamp (newest first)
    const sortedData = historicalData.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    // Extract data for charts
    const netChanges = sortedData.map(d => d.netHolderChange || 0);
    const totalHolders = sortedData.map(d => d.totalHolders || 0);
    const timestamps = sortedData.map(d => d.timestamp);
    
    // Calculate holder flow by segment
    const holderFlow = {
      in: {
        whales: sortedData.map(d => d.holdersIn?.whales || 0),
        sharks: sortedData.map(d => d.holdersIn?.sharks || 0),
        dolphins: sortedData.map(d => d.holdersIn?.dolphins || 0),
        fish: sortedData.map(d => d.holdersIn?.fish || 0),
        octopus: sortedData.map(d => d.holdersIn?.octopus || 0),
        crabs: sortedData.map(d => d.holdersIn?.crabs || 0),
        shrimps: sortedData.map(d => d.holdersIn?.shrimps || 0)
      },
      out: {
        whales: sortedData.map(d => d.holdersOut?.whales || 0),
        sharks: sortedData.map(d => d.holdersOut?.sharks || 0),
        dolphins: sortedData.map(d => d.holdersOut?.dolphins || 0),
        fish: sortedData.map(d => d.holdersOut?.fish || 0),
        octopus: sortedData.map(d => d.holdersOut?.octopus || 0),
        crabs: sortedData.map(d => d.holdersOut?.crabs || 0),
        shrimps: sortedData.map(d => d.holdersOut?.shrimps || 0)
      }
    };

    // Calculate acquisition breakdown
    const acquisitionData = {
      swap: sortedData.map(d => d.newHoldersByAcquisition?.swap || 0),
      transfer: sortedData.map(d => d.newHoldersByAcquisition?.transfer || 0),
      airdrop: sortedData.map(d => d.newHoldersByAcquisition?.airdrop || 0)
    };

    return {
      netChanges,
      totalHolders,
      timestamps,
      holderFlow,
      acquisitionData,
      dataPoints: sortedData.length
    };
  }

  /**
   * Get timeframe label for display
   * @param {string} key - Timeframe key
   * @returns {string} Human-readable label
   */
  getTimeframeLabel(key) {
    const labels = {
      '5min': '5 minutes',
      '1h': '1 hour',
      '6h': '6 hours',
      '24h': '24 hours',
      '3d': '3 days',
      '7d': '7 days',
      '30d': '30 days'
    };
    return labels[key] || key;
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
      
      // Format dates as YYYY-MM-DD
      const fromDateStr = fromDate.toISOString().split('T')[0];
      const toDateStr = toDate.toISOString().split('T')[0];
      
      const response = await axios.get(
        `${this.API_BASE}/token/${this.NETWORK}/holders/${tokenAddress}/historical`,
        {
          headers: {
            'X-API-Key': this.API_KEY,
            'Content-Type': 'application/json'
          },
          params: {
            timeFrame: '1d',        // Use timeFrame (not timeframe)
            fromDate: fromDateStr,  // YYYY-MM-DD format
            toDate: toDateStr,      // YYYY-MM-DD format
            limit: 100              // Add limit parameter
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
      
      const timeseries = await this.getHolderTimeseries(tokenAddress);
      
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

export default HolderTimeseriesService;
