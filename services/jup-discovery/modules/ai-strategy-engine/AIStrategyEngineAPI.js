import express from 'express';
import AIStrategyEngineService from './AIStrategyEngineService.js';

/**
 * AI Strategy Engine API Routes
 * 
 * Provides REST API endpoints for AI-powered strategy generation
 */
class AIStrategyEngineAPI {
  constructor() {
    this.router = express.Router();
    this.strategyEngine = new AIStrategyEngineService();
    
    this.setupRoutes();
  }

  /**
   * Setup API routes
   */
  setupRoutes() {
    // Strategy generation endpoints
    this.router.post('/generate', this.generateStrategy.bind(this));
    this.router.post('/generate-and-build', this.generateAndBuildStrategy.bind(this));
    this.router.get('/types', this.getStrategyTypes.bind(this));
    this.router.get('/strategy/:strategyId', this.getStrategy.bind(this));
    
    // Cache management
    this.router.delete('/cache', this.clearCache.bind(this));
    this.router.get('/cache/stats', this.getCacheStats.bind(this));
    
    // Health check
    this.router.get('/health', this.healthCheck.bind(this));
  }

  /**
   * Generate AI strategy and build transactions (bundled approach)
   */
  async generateAndBuildStrategy(req, res) {
    try {
      const { 
        walletAddress, 
        strategyType = 'basic', 
        userPreferences = {} 
      } = req.body;
      
      if (!walletAddress || walletAddress.length < 32) {
        return res.status(400).json({
          success: false,
          error: 'Invalid wallet address'
        });
      }
      
      if (!['basic', 'advanced'].includes(strategyType)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid strategy type. Must be "basic" or "advanced"'
        });
      }
      
      console.log(`🧠 [AI Strategy API] Generating and building ${strategyType} strategy for ${walletAddress}`);
      
      const bundledResult = await this.strategyEngine.generateAndBuildStrategy(
        walletAddress, 
        strategyType, 
        userPreferences
      );
      
      res.json({
        success: true,
        data: bundledResult
      });
      
    } catch (error) {
      console.error(`❌ [AI Strategy API] Bundled strategy generation failed:`, error.message);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Generate AI strategy
   */
  async generateStrategy(req, res) {
    try {
      const { 
        walletAddress, 
        strategyType = 'basic', 
        userPreferences = {} 
      } = req.body;
      
      if (!walletAddress || walletAddress.length < 32) {
        return res.status(400).json({
          success: false,
          error: 'Invalid wallet address'
        });
      }
      
      if (!['basic', 'advanced'].includes(strategyType)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid strategy type. Must be "basic" or "advanced"'
        });
      }
      
      console.log(`🧠 [AI Strategy API] Generating ${strategyType} strategy for ${walletAddress}`);
      
      const strategy = await this.strategyEngine.generateStrategy(
        walletAddress, 
        strategyType, 
        userPreferences
      );
      
      res.json({
        success: true,
        data: strategy
      });
      
    } catch (error) {
      console.error(`❌ [AI Strategy API] Strategy generation failed:`, error.message);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Get available strategy types
   */
  async getStrategyTypes(req, res) {
    try {
      const strategyTypes = this.strategyEngine.getStrategyTypes();
      
      res.json({
        success: true,
        data: strategyTypes
      });
      
    } catch (error) {
      console.error('❌ [AI Strategy API] Get strategy types failed:', error.message);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Get strategy by ID
   */
  async getStrategy(req, res) {
    try {
      const { strategyId } = req.params;
      
      const strategy = this.strategyEngine.getStrategy(strategyId);
      
      if (!strategy) {
        return res.status(404).json({
          success: false,
          error: 'Strategy not found'
        });
      }
      
      res.json({
        success: true,
        data: strategy
      });
      
    } catch (error) {
      console.error(`❌ [AI Strategy API] Get strategy failed for ${req.params.strategyId}:`, error.message);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Clear strategy cache
   */
  async clearCache(req, res) {
    try {
      this.strategyEngine.clearCache();
      
      res.json({
        success: true,
        message: 'Strategy cache cleared'
      });
      
    } catch (error) {
      console.error('❌ [AI Strategy API] Clear cache failed:', error.message);
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
      const stats = this.strategyEngine.getCacheStats();
      
      res.json({
        success: true,
        data: stats
      });
      
    } catch (error) {
      console.error('❌ [AI Strategy API] Get cache stats failed:', error.message);
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
      const cacheStats = this.strategyEngine.getCacheStats();
      const strategyTypes = this.strategyEngine.getStrategyTypes();
      
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'AI Strategy Engine',
        cache: {
          size: cacheStats.size,
          timeout: cacheStats.timeout
        },
        strategyTypes: strategyTypes.length
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
      console.log('🚀 [AI Strategy API] Initializing...');
      
      // Initialize strategy engine
      await this.strategyEngine.initialize();
      
      console.log('✅ [AI Strategy API] Initialization complete');
    } catch (error) {
      console.error('❌ [AI Strategy API] Initialization failed:', error.message);
      throw error;
    }
  }
}

export default AIStrategyEngineAPI;
