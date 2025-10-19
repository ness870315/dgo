import fetch from 'node-fetch';
import LSTRegistryService from '../lst-registry/LSTRegistryService.js';

/**
 * Portfolio Analyzer Service
 * 
 * Analyzes user wallets to identify SOL and LST holdings,
 * calculates current yields, and provides optimization insights.
 * 
 * Integrates with:
 * - Moralis API for wallet scanning
 * - LST Registry for token identification and APR data
 */
class PortfolioAnalyzerService {
  constructor() {
    this.moralisApiKey = process.env.MORALIS_API_KEY;
    this.moralisBaseUrl = 'https://solana-gateway.moralis.io';
    this.lstRegistry = new LSTRegistryService();
    
    // Known token mints
    this.knownTokens = {
      SOL: 'So11111111111111111111111111111111111111112',
      USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'
    };
    
    // Cache for portfolio data
    this.portfolioCache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
    
    console.log('📊 [Portfolio Analyzer] Service initialized');
    console.log('  - Moralis API:', this.moralisApiKey ? 'Configured' : 'Not configured');
    console.log('  - Cache timeout:', this.cacheTimeout / 1000, 'seconds');
  }

  /**
   * Initialize the service
   */
  async initialize() {
    try {
      console.log('📊 [Portfolio Analyzer] Initializing...');
      
      if (!this.moralisApiKey) {
        throw new Error('Moralis API key not configured');
      }
      
      // Initialize LST registry
      await this.lstRegistry.initialize();
      
      console.log('✅ [Portfolio Analyzer] Initialization complete');
    } catch (error) {
      console.error('❌ [Portfolio Analyzer] Initialization failed:', error.message);
      throw error;
    }
  }

  /**
   * Analyze a wallet's portfolio
   */
  async analyzePortfolio(walletAddress) {
    try {
      console.log(`📊 [Portfolio Analyzer] Analyzing wallet: ${walletAddress}`);
      
      // Check cache first
      const cacheKey = `portfolio_${walletAddress}`;
      const cached = this.portfolioCache.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp) < this.cacheTimeout) {
        console.log('📊 [Portfolio Analyzer] Using cached data');
        return cached.data;
      }
      
      // Fetch wallet data from Moralis
      const [solBalance, tokenBalances] = await Promise.all([
        this.getSOLBalance(walletAddress),
        this.getTokenBalances(walletAddress)
      ]);
      
      // Process and analyze the data
      const portfolio = await this.processPortfolioData(walletAddress, solBalance, tokenBalances);
      
      // Cache the result
      this.portfolioCache.set(cacheKey, {
        data: portfolio,
        timestamp: Date.now()
      });
      
      console.log(`✅ [Portfolio Analyzer] Analysis complete for ${walletAddress}`);
      console.log(`  - SOL: ${portfolio.solBalance.toFixed(4)} SOL`);
      console.log(`  - LSTs: ${portfolio.lstHoldings.length} tokens`);
      console.log(`  - Current Yield: ${portfolio.currentYield.toFixed(2)}%`);
      console.log(`  - Total Value: $${portfolio.totalValue.toFixed(2)}`);
      
      return portfolio;
      
    } catch (error) {
      console.error(`❌ [Portfolio Analyzer] Analysis failed for ${walletAddress}:`, error.message);
      throw error;
    }
  }

  /**
   * Get SOL balance from Moralis
   */
  async getSOLBalance(walletAddress) {
    try {
      const url = `${this.moralisBaseUrl}/account/mainnet/${walletAddress}/balance`;
      
      const response = await fetch(url, {
        headers: {
          'accept': 'application/json',
          'X-API-Key': this.moralisApiKey
        },
        timeout: 10000
      });
      
      if (!response.ok) {
        throw new Error(`Moralis SOL balance API error: ${response.status}`);
      }
      
      const data = await response.json();
      
      return {
        lamports: parseInt(data.lamports),
        sol: parseFloat(data.solana),
        usdValue: parseFloat(data.solana) * await this.getSOLPrice() // We'll implement this
      };
      
    } catch (error) {
      console.warn(`⚠️ [Portfolio Analyzer] SOL balance fetch failed for ${walletAddress}:`, error.message);
      return {
        lamports: 0,
        sol: 0,
        usdValue: 0
      };
    }
  }

  /**
   * Get token balances from Moralis
   */
  async getTokenBalances(walletAddress) {
    try {
      const url = `${this.moralisBaseUrl}/account/mainnet/${walletAddress}/tokens?excludeSpam=true`;
      
      const response = await fetch(url, {
        headers: {
          'accept': 'application/json',
          'X-API-Key': this.moralisApiKey
        },
        timeout: 10000
      });
      
      if (!response.ok) {
        throw new Error(`Moralis token balances API error: ${response.status}`);
      }
      
      const tokens = await response.json();
      
      // Process and enrich token data
      const processedTokens = await Promise.all(
        tokens.map(token => this.processTokenData(token))
      );
      
      return processedTokens;
      
    } catch (error) {
      console.warn(`⚠️ [Portfolio Analyzer] Token balances fetch failed for ${walletAddress}:`, error.message);
      return [];
    }
  }

  /**
   * Process individual token data
   */
  async processTokenData(token) {
    try {
      // Check if this is an LST
      const lstData = this.lstRegistry.getLSTData(token.mint);
      
      // Get token price (we'll implement this)
      const price = await this.getTokenPrice(token.mint);
      
      const processedToken = {
        mint: token.mint,
        symbol: token.symbol,
        name: token.name,
        decimals: token.decimals,
        amount: parseFloat(token.amount),
        amountRaw: token.amountRaw,
        associatedTokenAddress: token.associatedTokenAddress,
        logo: token.logo,
        isVerifiedContract: token.isVerifiedContract,
        possibleSpam: token.possibleSpam || false,
        price: price,
        usdValue: parseFloat(token.amount) * price,
        isLST: !!lstData,
        lstData: lstData || null
      };
      
      return processedToken;
      
    } catch (error) {
      console.warn(`⚠️ [Portfolio Analyzer] Token processing failed for ${token.symbol}:`, error.message);
      return {
        ...token,
        price: 0,
        usdValue: 0,
        isLST: false,
        lstData: null
      };
    }
  }

  /**
   * Process complete portfolio data
   */
  async processPortfolioData(walletAddress, solBalance, tokenBalances) {
    try {
      // Separate LSTs from other tokens
      const lstHoldings = tokenBalances.filter(token => token.isLST);
      const otherTokens = tokenBalances.filter(token => !token.isLST);
      
      // Calculate current yield
      const currentYield = await this.calculateCurrentYield(solBalance, lstHoldings);
      
      // Calculate total portfolio value
      const totalValue = this.calculateTotalValue(solBalance, tokenBalances);
      
      // Generate optimization insights
      const insights = await this.generateInsights(solBalance, lstHoldings, currentYield);
      
      const portfolio = {
        walletAddress,
        timestamp: new Date().toISOString(),
        
        // SOL holdings
        solBalance: {
          lamports: solBalance.lamports,
          sol: solBalance.sol,
          usdValue: solBalance.usdValue
        },
        
        // LST holdings
        lstHoldings: lstHoldings.map(lst => ({
          mint: lst.mint,
          symbol: lst.symbol,
          name: lst.name,
          amount: lst.amount,
          usdValue: lst.usdValue,
          apr: lst.lstData?.apr || 0,
          riskScore: lst.lstData?.riskScore || 5.0,
          verified: lst.lstData?.verified || false
        })),
        
        // Other token holdings
        otherTokens: otherTokens.map(token => ({
          mint: token.mint,
          symbol: token.symbol,
          name: token.name,
          amount: token.amount,
          usdValue: token.usdValue,
          isVerifiedContract: token.isVerifiedContract
        })),
        
        // Portfolio metrics
        currentYield,
        totalValue,
        lstValue: lstHoldings.reduce((sum, lst) => sum + lst.usdValue, 0),
        solValue: solBalance.usdValue,
        otherValue: otherTokens.reduce((sum, token) => sum + token.usdValue, 0),
        
        // Allocation percentages
        allocation: {
          sol: (solBalance.usdValue / totalValue) * 100,
          lsts: (lstHoldings.reduce((sum, lst) => sum + lst.usdValue, 0) / totalValue) * 100,
          other: (otherTokens.reduce((sum, token) => sum + token.usdValue, 0) / totalValue) * 100
        },
        
        // Insights and recommendations
        insights
      };
      
      return portfolio;
      
    } catch (error) {
      console.error('❌ [Portfolio Analyzer] Portfolio processing failed:', error.message);
      throw error;
    }
  }

  /**
   * Calculate current yield from SOL and LST holdings
   */
  async calculateCurrentYield(solBalance, lstHoldings) {
    try {
      let totalYield = 0;
      let totalValue = 0;
      
      // SOL staking yield (assume 5% base staking)
      if (solBalance.usdValue > 0) {
        const solYield = solBalance.usdValue * 0.05; // 5% APR
        totalYield += solYield;
        totalValue += solBalance.usdValue;
      }
      
      // LST yields
      for (const lst of lstHoldings) {
        if (lst.lstData && lst.usdValue > 0) {
          const lstYield = lst.usdValue * (lst.lstData.apr / 100);
          totalYield += lstYield;
          totalValue += lst.usdValue;
        }
      }
      
      return totalValue > 0 ? (totalYield / totalValue) * 100 : 0;
      
    } catch (error) {
      console.warn('⚠️ [Portfolio Analyzer] Yield calculation failed:', error.message);
      return 0;
    }
  }

  /**
   * Calculate total portfolio value
   */
  calculateTotalValue(solBalance, tokenBalances) {
    try {
      let totalValue = solBalance.usdValue;
      
      for (const token of tokenBalances) {
        totalValue += token.usdValue || 0;
      }
      
      return totalValue;
      
    } catch (error) {
      console.warn('⚠️ [Portfolio Analyzer] Total value calculation failed:', error.message);
      return 0;
    }
  }

  /**
   * Generate optimization insights
   */
  async generateInsights(solBalance, lstHoldings, currentYield) {
    try {
      const insights = [];
      
      // Check if user has unstacked SOL
      if (solBalance.sol > 0.1) { // More than 0.1 SOL
        insights.push({
          type: 'opportunity',
          priority: 'high',
          title: 'Unstacked SOL Detected',
          description: `You have ${solBalance.sol.toFixed(4)} SOL that could be earning yield`,
          recommendation: 'Consider staking your SOL or converting to LSTs for higher yields',
          potentialGain: `${(solBalance.usdValue * 0.05).toFixed(2)} USD/year`
        });
      }
      
      // Check LST diversification
      if (lstHoldings.length > 0) {
        const totalLSTValue = lstHoldings.reduce((sum, lst) => sum + lst.usdValue, 0);
        const avgAPR = lstHoldings.reduce((sum, lst) => sum + (lst.lstData?.apr || 0), 0) / lstHoldings.length;
        
        if (avgAPR < 5.5) {
          insights.push({
            type: 'optimization',
            priority: 'medium',
            title: 'Low LST Yield',
            description: `Your LSTs are earning ${avgAPR.toFixed(2)}% APR on average`,
            recommendation: 'Consider rebalancing to higher-yield LSTs',
            potentialGain: `${(totalLSTValue * 0.01).toFixed(2)} USD/year`
          });
        }
        
        // Check for concentration risk
        if (lstHoldings.length === 1) {
          insights.push({
            type: 'risk',
            priority: 'medium',
            title: 'Concentration Risk',
            description: 'All your LST exposure is in a single token',
            recommendation: 'Consider diversifying across multiple LSTs',
            potentialGain: 'Reduced risk exposure'
          });
        }
      }
      
      // Check for high-risk LSTs
      const highRiskLSTs = lstHoldings.filter(lst => lst.lstData?.riskScore > 7);
      if (highRiskLSTs.length > 0) {
        insights.push({
          type: 'risk',
          priority: 'high',
          title: 'High-Risk LSTs Detected',
          description: `You hold ${highRiskLSTs.length} high-risk LST(s)`,
          recommendation: 'Consider rebalancing to lower-risk LSTs',
          potentialGain: 'Reduced risk exposure'
        });
      }
      
      return insights;
      
    } catch (error) {
      console.warn('⚠️ [Portfolio Analyzer] Insights generation failed:', error.message);
      return [];
    }
  }

  /**
   * Get SOL price (placeholder - implement with your preferred price API)
   */
  async getSOLPrice() {
    try {
      // This is a placeholder - implement with your preferred price API
      // For now, return a static price
      return 100.0; // $100 per SOL
    } catch (error) {
      console.warn('⚠️ [Portfolio Analyzer] SOL price fetch failed:', error.message);
      return 100.0; // Fallback price
    }
  }

  /**
   * Get token price (placeholder - implement with your preferred price API)
   */
  async getTokenPrice(mint) {
    try {
      // This is a placeholder - implement with your preferred price API
      // For now, return a static price based on token type
      if (mint === this.knownTokens.USDC) return 1.0;
      if (mint === this.knownTokens.USDT) return 1.0;
      
      // For other tokens, return a random price (implement real price fetching)
      return Math.random() * 10; // Random price between 0-10
    } catch (error) {
      console.warn(`⚠️ [Portfolio Analyzer] Token price fetch failed for ${mint}:`, error.message);
      return 0;
    }
  }

  /**
   * Get portfolio summary for quick overview
   */
  async getPortfolioSummary(walletAddress) {
    try {
      const portfolio = await this.analyzePortfolio(walletAddress);
      
      return {
        walletAddress,
        totalValue: portfolio.totalValue,
        currentYield: portfolio.currentYield,
        solBalance: portfolio.solBalance.sol,
        lstCount: portfolio.lstHoldings.length,
        insights: portfolio.insights.length,
        lastUpdated: portfolio.timestamp
      };
      
    } catch (error) {
      console.error(`❌ [Portfolio Analyzer] Summary failed for ${walletAddress}:`, error.message);
      throw error;
    }
  }

  /**
   * Compare portfolio against optimal allocation
   */
  async compareToOptimal(walletAddress) {
    try {
      const portfolio = await this.analyzePortfolio(walletAddress);
      
      // Get top LSTs for comparison
      const topLSTs = this.lstRegistry.getTopLSTsByAPR(5);
      
      // Calculate what the optimal yield would be
      const optimalYield = topLSTs.reduce((sum, lst) => sum + lst.apr, 0) / topLSTs.length;
      
      return {
        currentYield: portfolio.currentYield,
        optimalYield,
        improvement: optimalYield - portfolio.currentYield,
        topLSTs: topLSTs.map(lst => ({
          symbol: lst.symbol,
          apr: lst.apr,
          riskScore: lst.riskScore
        }))
      };
      
    } catch (error) {
      console.error(`❌ [Portfolio Analyzer] Optimal comparison failed for ${walletAddress}:`, error.message);
      throw error;
    }
  }

  /**
   * Clear cache for a specific wallet
   */
  clearCache(walletAddress) {
    const cacheKey = `portfolio_${walletAddress}`;
    this.portfolioCache.delete(cacheKey);
    console.log(`📊 [Portfolio Analyzer] Cache cleared for ${walletAddress}`);
  }

  /**
   * Clear all cache
   */
  clearAllCache() {
    this.portfolioCache.clear();
    console.log('📊 [Portfolio Analyzer] All cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      size: this.portfolioCache.size,
      timeout: this.cacheTimeout,
      entries: Array.from(this.portfolioCache.keys())
    };
  }

  /**
   * Get router for Express integration
   */
  getRouter() {
    // Import PortfolioAnalyzerAPI dynamically to avoid circular imports
    const PortfolioAnalyzerAPI = require('./PortfolioAnalyzerAPI.js').default;
    const api = new PortfolioAnalyzerAPI(this);
    return api.getRouter();
  }
}

export default PortfolioAnalyzerService;
