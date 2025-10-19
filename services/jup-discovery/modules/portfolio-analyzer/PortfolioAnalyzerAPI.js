import express from 'express';
import PortfolioAnalyzerService from './PortfolioAnalyzerService.js';

/**
 * Portfolio Analyzer API Routes
 * 
 * Provides REST API endpoints for portfolio analysis and optimization
 */
class PortfolioAnalyzerAPI {
  constructor() {
    this.router = express.Router();
    this.portfolioAnalyzer = new PortfolioAnalyzerService();
    
    this.setupRoutes();
  }

  /**
   * Setup API routes
   */
  setupRoutes() {
    // Portfolio analysis endpoints
    this.router.get('/analyze/:walletAddress', this.analyzePortfolio.bind(this));
    this.router.get('/summary/:walletAddress', this.getPortfolioSummary.bind(this));
    this.router.get('/compare/:walletAddress', this.compareToOptimal.bind(this));
    
    // Cache management
    this.router.delete('/cache/:walletAddress', this.clearCache.bind(this));
    this.router.delete('/cache', this.clearAllCache.bind(this));
    this.router.get('/cache/stats', this.getCacheStats.bind(this));
    
    // Health check
    this.router.get('/health', this.healthCheck.bind(this));
  }

  /**
   * Analyze complete portfolio
   */
  async analyzePortfolio(req, res) {
    try {
      const { walletAddress } = req.params;
      
      if (!walletAddress || walletAddress.length < 32) {
        return res.status(400).json({
          success: false,
          error: 'Invalid wallet address'
        });
      }
      
      console.log(`📊 [Portfolio API] Analyzing portfolio for ${walletAddress}`);
      
      const portfolio = await this.portfolioAnalyzer.analyzePortfolio(walletAddress);
      
      res.json({
        success: true,
        data: portfolio
      });
      
    } catch (error) {
      console.error(`❌ [Portfolio API] Analysis failed for ${req.params.walletAddress}:`, error.message);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Get portfolio summary
   */
  async getPortfolioSummary(req, res) {
    try {
      const { walletAddress } = req.params;
      
      if (!walletAddress || walletAddress.length < 32) {
        return res.status(400).json({
          success: false,
          error: 'Invalid wallet address'
        });
      }
      
      console.log(`📊 [Portfolio API] Getting summary for ${walletAddress}`);
      
      const summary = await this.portfolioAnalyzer.getPortfolioSummary(walletAddress);
      
      res.json({
        success: true,
        data: summary
      });
      
    } catch (error) {
      console.error(`❌ [Portfolio API] Summary failed for ${req.params.walletAddress}:`, error.message);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Compare portfolio to optimal allocation
   */
  async compareToOptimal(req, res) {
    try {
      const { walletAddress } = req.params;
      
      if (!walletAddress || walletAddress.length < 32) {
        return res.status(400).json({
          success: false,
          error: 'Invalid wallet address'
        });
      }
      
      console.log(`📊 [Portfolio API] Comparing to optimal for ${walletAddress}`);
      
      const comparison = await this.portfolioAnalyzer.compareToOptimal(walletAddress);
      
      res.json({
        success: true,
        data: comparison
      });
      
    } catch (error) {
      console.error(`❌ [Portfolio API] Comparison failed for ${req.params.walletAddress}:`, error.message);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Clear cache for specific wallet
   */
  async clearCache(req, res) {
    try {
      const { walletAddress } = req.params;
      
      this.portfolioAnalyzer.clearCache(walletAddress);
      
      res.json({
        success: true,
        message: `Cache cleared for ${walletAddress}`
      });
      
    } catch (error) {
      console.error(`❌ [Portfolio API] Cache clear failed for ${req.params.walletAddress}:`, error.message);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Clear all cache
   */
  async clearAllCache(req, res) {
    try {
      this.portfolioAnalyzer.clearAllCache();
      
      res.json({
        success: true,
        message: 'All cache cleared'
      });
      
    } catch (error) {
      console.error('❌ [Portfolio API] Clear all cache failed:', error.message);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Get cache statistics
   */
  async getCacheStats(req, res) {
    try {
      const stats = this.portfolioAnalyzer.getCacheStats();
      
      res.json({
        success: true,
        data: stats
      });
      
    } catch (error) {
      console.error('❌ [Portfolio API] Get cache stats failed:', error.message);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Health check
   */
  async healthCheck(req, res) {
    try {
      const cacheStats = this.portfolioAnalyzer.getCacheStats();
      
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'Portfolio Analyzer',
        cache: {
          size: cacheStats.size,
          timeout: cacheStats.timeout
        }
      });
      
    } catch (error) {
      res.status(500).json({
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Get router instance
   */
  getRouter() {
    return this.router;
  }

  /**
   * Initialize the API
   */
  async initialize() {
    try {
      console.log('🚀 [Portfolio API] Initializing...');
      
      // Initialize portfolio analyzer
      await this.portfolioAnalyzer.initialize();
      
      console.log('✅ [Portfolio API] Initialization complete');
    } catch (error) {
      console.error('❌ [Portfolio API] Initialization failed:', error.message);
      throw error;
    }
  }
}

export default PortfolioAnalyzerAPI;
