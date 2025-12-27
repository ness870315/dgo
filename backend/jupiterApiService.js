import axios from 'axios';

class JupiterApiService {
  constructor() {
    // Use new Jupiter API endpoint from env
    const JUPITER_API_ENDPOINT = process.env.JUP_API_ENDPOINT || 'https://api.jup.ag';
    this.baseURL = `${JUPITER_API_ENDPOINT}/tokens/v2`;
    this.apiKey = process.env.JUP_API_KEY || '';
    this.cache = new Map();
    this.cacheTimeout = 30 * 60 * 1000; // 30 minutes cache (increased to reduce API calls)

    // Rate limiting configuration
    this.rateLimitDelay = 3000; // 3 seconds between requests (increased)
    this.maxRetries = 3;
    this.lastRequestTime = 0;
    this.retryDelays = [2000, 5000, 10000]; // Progressive retry delays (increased)

    // Rate limiting stats
    this.requestCount = 0;
    this.errorCount = 0;
    this.lastErrorTime = null;
  }

  /**
   * Clear cache to force fresh data
   */
  clearCache() {
    this.cache.clear();
    console.log('🧹 Jupiter API cache cleared');
  }

  /**
   * Wait for rate limit delay
   */
  async waitForRateLimit() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.rateLimitDelay) {
      const waitTime = this.rateLimitDelay - timeSinceLastRequest;
      console.log(`⏱️ Rate limiting: waiting ${waitTime}ms before next Jupiter API request`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    this.lastRequestTime = Date.now();
  }

  /**
   * Make API request with retry logic for rate limiting
   */
  async makeRequestWithRetry(config, retryCount = 0) {
    try {
      // Wait for rate limit delay
      await this.waitForRateLimit();

      this.requestCount++;
      console.log(`📡 Jupiter API request attempt ${retryCount + 1}/${this.maxRetries + 1} (total: ${this.requestCount})`);
      const response = await axios.request(config);

      // Reset rate limit delay on successful request
      this.rateLimitDelay = Math.max(2000, this.rateLimitDelay * 0.9); // Gradually reduce delay

      return response;
    } catch (error) {
      this.errorCount++;
      this.lastErrorTime = new Date().toISOString();
      const statusCode = error.response?.status;

      if (statusCode === 429 && retryCount < this.maxRetries) {
        // Rate limited - implement exponential backoff
        const delay = this.retryDelays[retryCount] || 5000;
        console.log(`🚦 Rate limited (429). Retrying in ${delay}ms... (attempt ${retryCount + 1}/${this.maxRetries})`);

        // Increase rate limit delay for future requests
        this.rateLimitDelay = Math.min(10000, this.rateLimitDelay * 1.5);

        await new Promise(resolve => setTimeout(resolve, delay));
        return this.makeRequestWithRetry(config, retryCount + 1);
      } else if (statusCode === 404) {
        // Token not found - don't retry
        console.log('🔍 Token not found in Jupiter API (404)');
        throw error;
      } else if (statusCode >= 500) {
        // Server error - retry with shorter delay
        if (retryCount < this.maxRetries) {
          const delay = 1000 * (retryCount + 1); // 1s, 2s, 3s
          console.log(`🔧 Server error (${statusCode}). Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          return this.makeRequestWithRetry(config, retryCount + 1);
        }
      }

      // For other errors or max retries reached, throw the error
      throw error;
    }
  }

  /**
   * Get comprehensive token information from Jupiter API (single token)
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

      const headers = {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; JupiterAPI/1.0)'
      };
      
      // Add API key if available
      if (this.apiKey) {
        headers['x-api-key'] = this.apiKey;
      }

      const config = {
        method: 'get',
        maxBodyLength: Infinity,
        url: `${this.baseURL}/search?query=${contractAddress}`,
        headers: headers,
        timeout: 15000
      };

      console.log('📡 Making request to Jupiter API...');
      const response = await this.makeRequestWithRetry(config);
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
        price: tokenData.usdPrice || 0, // Top-level price for easy access
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
    
    if (organicScore >= 85) return 'Premium';      // 85-100: Premium
    if (organicScore >= 70) return 'High Quality'; // 70-84: High Quality  
    if (organicScore >= 55) return 'Good';         // 55-69: Good
    if (organicScore >= 40) return 'Fair';         // 40-54: Fair
    return 'Basic';                                 // 0-39: Basic
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
   * Batch fetch Jupiter data for multiple tokens (up to 100)
   * Jupiter API supports comma-separated contract addresses in query parameter
   */
  async getBatchTokenDetails(contractAddresses) {
    try {
      if (!Array.isArray(contractAddresses) || contractAddresses.length === 0) {
        console.log('⚠️ No contract addresses provided for batch Jupiter fetch');
        return [];
      }

      // Jupiter can handle up to 100 mint addresses in comma-separated query
      const batchAddresses = contractAddresses.slice(0, 100);
      const mintQuery = batchAddresses.join(',');

      console.log(`🚀 Batch fetching Jupiter data for ${batchAddresses.length} contracts...`);

      const headers = {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; JupiterAPI/1.0)'
      };
      
      // Add API key if available
      if (this.apiKey) {
        headers['x-api-key'] = this.apiKey;
      }
      
      const config = {
        method: 'get',
        maxBodyLength: Infinity,
        url: `${this.baseURL}/search?query=${mintQuery}`,
        headers: headers,
        timeout: 15000
      };

      const response = await this.makeRequestWithRetry(config);
      console.log(`📊 Jupiter batch API Response Status: ${response.status}`);

      if (response.data && Array.isArray(response.data) && response.data.length > 0) {
        console.log(`✅ Jupiter returned batch data for ${response.data.length} tokens`);

        // Create a map of contract address to Jupiter data
        const jupiterMap = new Map();
        response.data.forEach(jupiterToken => {
          if (jupiterToken.id) {
            jupiterMap.set(jupiterToken.id, jupiterToken);
          }
        });

        // Return enhanced data for each requested contract address
        return batchAddresses.map(contractAddress => {
          if (jupiterMap.has(contractAddress)) {
            const jupiterData = jupiterMap.get(contractAddress);
            console.log(`✅ Found Jupiter data for ${contractAddress.substring(0, 8)}: ${jupiterData.symbol || 'Unknown'}`);
            return this.extractTokenInformation(jupiterData, contractAddress);
          } else {
            console.log(`⚠️ No Jupiter data found for ${contractAddress.substring(0, 8)}`);
            return null;
          }
        });
      } else {
        console.log(`⚠️ Jupiter batch API returned empty array for ${batchAddresses.length} contracts`);
        return batchAddresses.map(() => null);
      }

    } catch (error) {
      console.error(`❌ Error in Jupiter batch fetch for ${contractAddresses.length} contracts:`, error.message);
      return contractAddresses.map(() => null);
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

      // 🚨 QUALITY FILTER: Check if token meets quality criteria
      const hasLaunchpad = jupiterData.launchpad && jupiterData.launchpad !== '';
      const hasOrganicScore = jupiterData.organicScore && jupiterData.organicScore > 0;
      const hasGraduatedAt = jupiterData.graduatedAt && jupiterData.graduatedAt !== '';
      
      // Only update if at least ONE quality criteria is present (not all missing)
      if (!hasLaunchpad && !hasOrganicScore && !hasGraduatedAt) {
        return null; // Return null to indicate token should be removed
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
      const config = {
        method: 'get',
        url: `${this.baseURL}/search?query=test`,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (compatible; JupiterAPI/1.0)'
        },
        timeout: 10000
      };

      const response = await this.makeRequestWithRetry(config);
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

      const response = await this.makeRequestWithRetry(config);
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
      version: '2.1.0',
      baseURL: this.baseURL,
      cacheSize: this.cache.size,
      cacheTimeout: this.cacheTimeout,
      rateLimitDelay: this.rateLimitDelay,
      requestCount: this.requestCount,
      errorCount: this.errorCount,
      lastErrorTime: this.lastErrorTime,
      successRate: this.requestCount > 0 ? ((this.requestCount - this.errorCount) / this.requestCount * 100).toFixed(1) + '%' : 'N/A',
      description: 'Comprehensive token data service with rate limiting and retry logic'
    };
  }
}

const jupiterApiService = new JupiterApiService();
export default jupiterApiService;
