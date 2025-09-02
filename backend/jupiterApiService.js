import axios from 'axios';

class JupiterApiService {
  constructor() {
    this.baseURL = 'https://lite-api.jup.ag/tokens/v2';
    this.cache = new Map();
    this.cacheTimeout = 10 * 60 * 1000; // 10 minutes cache
  }

  /**
   * Clear cache to force fresh data
   */
  clearCache() {
    this.cache.clear();
    console.log('🧹 Jupiter API cache cleared');
  }

  /**
   * Get comprehensive token information from Jupiter API
   * This replaces the DexScreener update API for paid tokens
   */
  async getTokenDetails(contractAddress) {
    try {
      const cacheKey = `jupiter_${contractAddress}`;
      const cached = this.cache.get(cacheKey);

      if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
        console.log('🟢 Using cached Jupiter API data for', contractAddress.substring(0, 8));
        return cached.data;
      }

      console.log(`🔍 Fetching comprehensive token data from Jupiter API for ${contractAddress.substring(0, 8)}...`);
      console.log(`🌐 API URL: ${this.baseURL}/search?query=${contractAddress}`);

      const config = {
        method: 'get',
        maxBodyLength: Infinity,
        url: `${this.baseURL}/search?query=${contractAddress}`,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (compatible; JupiterAPI/1.0)'
        },
        timeout: 15000
      };

      console.log('📡 Making request to Jupiter API...');
      const response = await axios.request(config);
      console.log(`📊 Jupiter API Response Status: ${response.status}`);

      console.log('🔍 Raw Jupiter API Response:', JSON.stringify(response.data, null, 2));

      if (response.data && Array.isArray(response.data) && response.data.length > 0) {
        const tokenData = response.data[0]; // Get the first (most relevant) result

        console.log(`✅ Found token data for ${tokenData.symbol || 'Unknown'} (${tokenData.name || 'Unknown'})`);
        console.log('🔍 Jupiter API Response Data:', JSON.stringify(tokenData, null, 2));

        // Extract comprehensive token information
        const enhancedTokenData = this.extractTokenInformation(tokenData, contractAddress);

        // Cache the result
        this.cache.set(cacheKey, {
          data: enhancedTokenData,
          timestamp: Date.now()
        });

        console.log(`✅ Jupiter API data extracted for ${enhancedTokenData.symbol}:`, {
          name: enhancedTokenData.name,
          marketCap: enhancedTokenData.marketData.marketCap,
          price: enhancedTokenData.marketData.price,
          liquidity: enhancedTokenData.marketData.liquidity,
          holderCount: enhancedTokenData.metadata.holderCount
        });

        return enhancedTokenData;
      } else if (response.data && Array.isArray(response.data) && response.data.length === 0) {
        console.log(`⚠️ Jupiter API returned empty array for contract ${contractAddress.substring(0, 8)}`);
        return null;
      } else {
        console.log(`⚠️ Unexpected Jupiter API response format for contract ${contractAddress.substring(0, 8)}:`, typeof response.data);
        return null;
      }
      
    } catch (error) {
      console.error(`❌ Error fetching Jupiter API data for ${contractAddress.substring(0, 8)}:`, error.message);
      return null;
    }
  }

  /**
   * Extract and format comprehensive token information from Jupiter API response
   */
  extractTokenInformation(tokenData, contractAddress) {
    try {
      // Basic token information
      const basicInfo = {
        symbol: tokenData.symbol || 'UNKNOWN',
        name: tokenData.name || 'Unknown Token',
        contractAddress: contractAddress,
        icon: tokenData.icon || null,
        decimals: tokenData.decimals || 0
      };

      // Social and website information
      const socials = {
        twitter: tokenData.twitter || null,
        telegram: null, // Jupiter API doesn't provide telegram
        website: null, // Jupiter API doesn't provide website
        coingecko: null // Jupiter API doesn't provide coingecko
      };

      // Supply and market information
      const supplyInfo = {
        totalSupply: tokenData.totalSupply || 0,
        circulatingSupply: tokenData.circSupply || 0,
        maxSupply: null // Jupiter API doesn't provide maxSupply
      };

      // Market data
      const marketData = {
        price: tokenData.usdPrice || 0,
        priceChange1h: tokenData.stats1h?.priceChange || 0,
        priceChange6h: tokenData.stats6h?.priceChange || 0,
        priceChange24h: tokenData.stats24h?.priceChange || 0,
        marketCap: tokenData.mcap || 0,
        fdv: tokenData.fdv || 0, // Fully Diluted Valuation
        volume24h: (tokenData.stats24h?.buyVolume || 0) + (tokenData.stats24h?.sellVolume || 0),
        liquidity: tokenData.liquidity || 0
      };

      // Time-based statistics
      const timeStats = {
        stats1h: {
          priceChange: tokenData.stats1h?.priceChange || 0,
          volume: (tokenData.stats1h?.buyVolume || 0) + (tokenData.stats1h?.sellVolume || 0),
          transactions: (tokenData.stats1h?.numBuys || 0) + (tokenData.stats1h?.numSells || 0),
          holderChange: tokenData.stats1h?.holderChange || 0,
          liquidityChange: tokenData.stats1h?.liquidityChange || 0
        },
        stats6h: {
          priceChange: tokenData.stats6h?.priceChange || 0,
          volume: (tokenData.stats6h?.buyVolume || 0) + (tokenData.stats6h?.sellVolume || 0),
          transactions: (tokenData.stats6h?.numBuys || 0) + (tokenData.stats6h?.numSells || 0),
          holderChange: tokenData.stats6h?.holderChange || 0,
          liquidityChange: tokenData.stats6h?.liquidityChange || 0
        },
        stats24h: {
          priceChange: tokenData.stats24h?.priceChange || 0,
          volume: (tokenData.stats24h?.buyVolume || 0) + (tokenData.stats24h?.sellVolume || 0),
          transactions: (tokenData.stats24h?.numBuys || 0) + (tokenData.stats24h?.numSells || 0),
          holderChange: tokenData.stats24h?.holderChange || 0,
          liquidityChange: tokenData.stats24h?.liquidityChange || 0
        }
      };

      // Audit and security information
      const auditInfo = {
        mintAuthorityDisabled: tokenData.audit?.mintAuthorityDisabled || false,
        freezeAuthorityDisabled: tokenData.audit?.freezeAuthorityDisabled || false,
        topHoldersPercentage: tokenData.audit?.topHoldersPercentage || 0,
        devBalancePercentage: tokenData.audit?.devBalancePercentage || 0,
        isVerified: true, // Jupiter API tokens are verified by default
        hasAudit: true // Jupiter API provides audit data
      };

      // Organic metrics
      const organicMetrics = {
        organicScore: tokenData.organicScore || this.calculateOrganicScore(tokenData),
        organicLabel: tokenData.organicScoreLabel || this.getOrganicLabel(tokenData),
        communityHealth: this.calculateCommunityHealth(tokenData),
        developmentActivity: this.calculateDevelopmentActivity(tokenData)
      };

      // Additional metadata
      const metadata = {
        launchpad: tokenData.launchpad || null,
        creationTime: tokenData.firstPool?.createdAt || null,
        holderCount: tokenData.holderCount || 0,
        lastUpdated: new Date().toISOString(),
        source: 'jupiter_api',
        dev: tokenData.dev || null,
        organicScore: tokenData.organicScore || 0,
        organicScoreLabel: tokenData.organicScoreLabel || 'unknown',
        tags: tokenData.tags || []
      };

      return {
        ...basicInfo,
        socials,
        supplyInfo,
        marketData,
        timeStats,
        auditInfo,
        organicMetrics,
        metadata,
        // Preserve original Jupiter data structure for frontend compatibility
        rawJupiterData: tokenData,
        // Direct access to key fields for frontend
        circSupply: tokenData.circSupply,
        totalSupply: tokenData.totalSupply,
        firstPool: tokenData.firstPool,
        launchpad: tokenData.launchpad,
        holderCount: tokenData.holderCount,
        audit: tokenData.audit,
        stats1h: tokenData.stats1h,
        stats6h: tokenData.stats6h,
        stats24h: tokenData.stats24h,
        organicScore: tokenData.organicScore,
        usdPrice: tokenData.usdPrice,
        mcap: tokenData.mcap,
        fdv: tokenData.fdv,
        liquidity: tokenData.liquidity
      };
      
    } catch (error) {
      console.error('❌ Error extracting Jupiter API token information:', error.message);
      return null;
    }
  }

  /**
   * Calculate organic score based on various metrics
   */
  calculateOrganicScore(tokenData) {
    let score = 5.0; // Base score
    
    try {
      // Holder count bonus (0-2 points)
      const holderCount = tokenData.holderCount || 0;
      if (holderCount > 10000) score += 2.0;
      else if (holderCount > 5000) score += 1.5;
      else if (holderCount > 1000) score += 1.0;
      else if (holderCount > 100) score += 0.5;

      // Liquidity quality bonus (0-1.5 points)
      const liquidity = tokenData.liquidity || 0;
      if (liquidity > 1000000) score += 1.5;
      else if (liquidity > 500000) score += 1.0;
      else if (liquidity > 100000) score += 0.5;

      // Volume activity bonus (0-1 point)
      const volume24h = (tokenData.stats24h?.buyVolume || 0) + (tokenData.stats24h?.sellVolume || 0);
      if (volume24h > 500000) score += 1.0;
      else if (volume24h > 100000) score += 0.5;

      // Social presence bonus (0-0.5 points)
      if (tokenData.twitter) {
        score += 0.5;
      }

      // Audit and security bonus (0-1 point)
      if (tokenData.audit?.mintAuthorityDisabled && tokenData.audit?.freezeAuthorityDisabled) {
        score += 1.0;
      }

      return Math.min(9.9, Math.max(0, score));
      
    } catch (error) {
      console.error('❌ Error calculating organic score:', error.message);
      return 5.0; // Return base score on error
    }
  }

  /**
   * Get organic label based on organic score
   */
  getOrganicLabel(tokenData) {
    // Use Jupiter's organic score if available, otherwise calculate our own
    const organicScore = tokenData.organicScore || this.calculateOrganicScore(tokenData);
    
    if (organicScore >= 8.5) return 'Premium';
    if (organicScore >= 7.0) return 'High Quality';
    if (organicScore >= 5.5) return 'Good';
    if (organicScore >= 4.0) return 'Fair';
    return 'Basic';
  }

  /**
   * Calculate community health score
   */
  calculateCommunityHealth(tokenData) {
    let score = 5.0;
    
    try {
      const holderCount = tokenData.holderCount || 0;
      const liquidity = tokenData.liquidity || 0;
      const volume24h = (tokenData.stats24h?.buyVolume || 0) + (tokenData.stats24h?.sellVolume || 0);
      
      // Holder distribution
      if (holderCount > 5000) score += 2.0;
      else if (holderCount > 1000) score += 1.0;
      else if (holderCount > 100) score += 0.5;
      
      // Liquidity stability
      if (liquidity > 500000) score += 1.5;
      else if (liquidity > 100000) score += 0.5;
      
      // Trading activity
      if (volume24h > 100000) score += 1.5;
      else if (volume24h > 50000) score += 0.5;
      
      return Math.min(9.9, Math.max(0, score));
      
    } catch (error) {
      return 5.0;
    }
  }

  /**
   * Calculate development activity score
   */
  calculateDevelopmentActivity(tokenData) {
    let score = 5.0;
    
    try {
      // Check for development indicators
      if (tokenData.audit?.mintAuthorityDisabled && tokenData.audit?.freezeAuthorityDisabled) score += 1.0;
      if (tokenData.audit) score += 1.0;
      if (tokenData.twitter) score += 0.5;
      if (tokenData.launchpad) score += 0.5;
      
      return Math.min(9.9, Math.max(0, score));
      
    } catch (error) {
      return 5.0;
    }
  }

  /**
   * Update existing token with Jupiter API data
   * This is the main function that replaces DexScreener updates
   */
  async updateTokenWithJupiterData(existingToken) {
    try {
      console.log(`🔄 Updating ${existingToken.symbol} with Jupiter API data...`);
      
      const jupiterData = await this.getTokenDetails(existingToken.contractAddress);
      
      if (!jupiterData) {
        console.log(`⚠️ No Jupiter API data available for ${existingToken.symbol}`);
        return existingToken;
      }

      // Merge Jupiter data with existing token data
      const updatedToken = {
        ...existingToken,
        // Update basic information
        name: jupiterData.name || existingToken.name,
        symbol: jupiterData.symbol || existingToken.symbol,
        image: jupiterData.icon || existingToken.image,
        
        // Update market data
        marketCap: jupiterData.marketData.marketCap || existingToken.marketCap,
        price: jupiterData.marketData.price || existingToken.price,
        priceChange24h: jupiterData.marketData.priceChange24h || existingToken.priceChange24h,
        volume24h: jupiterData.marketData.volume24h || existingToken.volume24h,
        totalSupply: jupiterData.supplyInfo.totalSupply || existingToken.totalSupply,
        
        // Add new Jupiter-specific data with proper nested structure
        jupiterData: {
          // Basic token information
          symbol: jupiterData.symbol,
          name: jupiterData.name,
          icon: jupiterData.icon,
          decimals: jupiterData.decimals,

          // Direct access to key fields for frontend compatibility
          circSupply: jupiterData.circSupply,
          totalSupply: jupiterData.totalSupply,
          firstPool: jupiterData.firstPool,
          launchpad: jupiterData.launchpad,
          holderCount: jupiterData.holderCount,
          audit: jupiterData.audit,
          stats1h: jupiterData.stats1h,
          stats6h: jupiterData.stats6h,
          stats24h: jupiterData.stats24h,
          organicScore: jupiterData.organicScore,
          usdPrice: jupiterData.usdPrice,
          mcap: jupiterData.mcap,
          fdv: jupiterData.fdv,
          liquidity: jupiterData.liquidity,

          // Supply information
          supplyInfo: jupiterData.supplyInfo,

          // Market data
          marketData: jupiterData.marketData,

          // Social and website information
          socials: jupiterData.socials,

          // Time-based statistics
          timeStats: jupiterData.timeStats,

          // Audit and security information
          auditInfo: jupiterData.auditInfo,

          // Organic metrics
          organicMetrics: jupiterData.organicMetrics,

          // Additional metadata
          metadata: jupiterData.metadata,

          // Raw Jupiter data for debugging
          rawJupiterData: jupiterData.rawJupiterData
        },
        
        // Update scores based on Jupiter data
        score: Math.min(9.9, (existingToken.score + jupiterData.organicMetrics.organicScore) / 2),
        communityScore: Math.min(9.9, jupiterData.organicMetrics.communityHealth),
        
        // Update metadata
        lastJupiterUpdate: new Date().toISOString(),
        hasJupiterData: true
      };

      console.log(`✅ Successfully updated ${updatedToken.symbol} with Jupiter API data`);
      return updatedToken;
      
    } catch (error) {
      console.error(`❌ Error updating ${existingToken.symbol} with Jupiter API data:`, error.message);
      return existingToken; // Return original token if update fails
    }
  }

  /**
   * Check if Jupiter API is accessible
   */
  async healthCheck() {
    try {
      console.log('🏥 Testing Jupiter API health...');
      const response = await axios.get(`${this.baseURL}/search?query=test`, {
        timeout: 10000,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (compatible; JupiterAPI/1.0)'
        }
      });
      console.log(`✅ Jupiter API health check: ${response.status}`);
      return response.status === 200;
    } catch (error) {
      console.error('❌ Jupiter API health check failed:', error.message);
      return false;
    }
  }

  /**
   * Test Jupiter API with a known token to verify it's working
   */
  async testKnownToken() {
    try {
      console.log('🧪 Testing Jupiter API with known token...');
      // Test with a popular token that's definitely on Jupiter
      const testAddress = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'; // USDC
      const result = await this.getTokenDetails(testAddress);

      if (result) {
        console.log('✅ Jupiter API test successful - found USDC data');
        return true;
      } else {
        console.log('❌ Jupiter API test failed - USDC not found');
        return false;
      }
    } catch (error) {
      console.error('❌ Jupiter API test error:', error.message);
      return false;
    }
  }

  /**
   * Get raw Jupiter API response for debugging
   */
  async getRawJupiterData(contractAddress) {
    try {
      console.log(`🔍 Getting raw Jupiter API data for ${contractAddress.substring(0, 8)}...`);

      const config = {
        method: 'get',
        maxBodyLength: Infinity,
        url: `${this.baseURL}/search?query=${contractAddress}`,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (compatible; JupiterAPI/1.0)'
        },
        timeout: 15000
      };

      const response = await axios.request(config);
      return {
        status: response.status,
        data: response.data,
        url: config.url
      };
    } catch (error) {
      return {
        status: error.response?.status || 'ERROR',
        error: error.message,
        url: `${this.baseURL}/search?query=${contractAddress}`
      };
    }
  }

  /**
   * Get service information
   */
  getServiceInfo() {
    return {
      name: 'Jupiter API Service',
      version: '2.0.0',
      baseURL: this.baseURL,
      cacheSize: this.cache.size,
      cacheTimeout: this.cacheTimeout,
      description: 'Comprehensive token data service replacing DexScreener for paid tokens'
    };
  }
}

const jupiterApiService = new JupiterApiService();
export default jupiterApiService;
