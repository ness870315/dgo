import express from 'express';
import TransactionBuilderService from './TransactionBuilderService.js';

/**
 * Transaction Builder API Routes
 * 
 * Provides REST API endpoints for building and executing strategy transactions
 */
class TransactionBuilderAPI {
  constructor() {
    this.router = express.Router();
    this.transactionBuilder = new TransactionBuilderService();
    
    this.setupRoutes();
  }

  /**
   * Setup API routes
   */
  setupRoutes() {
    // Transaction building endpoints
    this.router.post('/build', this.buildTransactions.bind(this));
    this.router.post('/build-bundled', this.buildBundledTransaction.bind(this));
    this.router.post('/validate', this.validateTransaction.bind(this));
    this.router.get('/transaction/:strategyId/:userWallet', this.getTransaction.bind(this));
    
    // Jupiter integration
    this.router.get('/quote', this.getQuote.bind(this));
    
    // Cache management
    this.router.delete('/cache', this.clearCache.bind(this));
    this.router.get('/cache/stats', this.getCacheStats.bind(this));
    
    // Health check
    this.router.get('/health', this.healthCheck.bind(this));
  }

  /**
   * Build bundled transaction for strategy execution (single transaction approach)
   */
  async buildBundledTransaction(req, res) {
    try {
      const { strategy, userWallet } = req.body;
      
      if (!strategy || !userWallet) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: strategy and userWallet'
        });
      }
      
      if (!userWallet || userWallet.length < 32) {
        return res.status(400).json({
          success: false,
          error: 'Invalid wallet address'
        });
      }
      
      console.log(`🔨 [Transaction Builder API] Building bundled transaction for strategy: ${strategy.name}`);
      
      const bundledTransaction = await this.transactionBuilder.buildBundledStrategyTransaction(strategy, userWallet);
      
      res.json({
        success: true,
        data: bundledTransaction
      });
      
    } catch (error) {
      console.error(`❌ [Transaction Builder API] Bundled transaction building failed:`, error.message);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Build strategy execution transactions
   */
  async buildTransactions(req, res) {
    try {
      const { strategy, userWallet } = req.body;
      
      if (!strategy || !userWallet) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: strategy and userWallet'
        });
      }
      
      if (!userWallet || userWallet.length < 32) {
        return res.status(400).json({
          success: false,
          error: 'Invalid wallet address'
        });
      }
      
      console.log(`🔨 [Transaction Builder API] Building transactions for strategy: ${strategy.name}`);
      
      const transactions = await this.transactionBuilder.buildStrategyTransactions(strategy, userWallet);
      
      res.json({
        success: true,
        data: transactions
      });
      
    } catch (error) {
      console.error(`❌ [Transaction Builder API] Transaction building failed:`, error.message);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Validate transaction before execution
   */
  async validateTransaction(req, res) {
    try {
      const { transaction, userWallet } = req.body;
      
      if (!transaction || !userWallet) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: transaction and userWallet'
        });
      }
      
      console.log(`🔨 [Transaction Builder API] Validating transaction for ${userWallet}`);
      
      const validation = await this.transactionBuilder.validateTransaction(transaction, userWallet);
      
      res.json({
        success: true,
        data: validation
      });
      
    } catch (error) {
      console.error(`❌ [Transaction Builder API] Transaction validation failed:`, error.message);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Get transaction by strategy ID and user wallet
   */
  async getTransaction(req, res) {
    try {
      const { strategyId, userWallet } = req.params;
      
      if (!strategyId || !userWallet) {
        return res.status(400).json({
          success: false,
          error: 'Missing required parameters: strategyId and userWallet'
        });
      }
      
      console.log(`🔨 [Transaction Builder API] Getting transaction for strategy: ${strategyId}`);
      
      const transaction = this.transactionBuilder.getTransaction(strategyId, userWallet);
      
      if (!transaction) {
        return res.status(404).json({
          success: false,
          error: 'Transaction not found or expired'
        });
      }
      
      res.json({
        success: true,
        data: transaction
      });
      
    } catch (error) {
      console.error(`❌ [Transaction Builder API] Get transaction failed:`, error.message);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Get Jupiter quote
   */
  async getQuote(req, res) {
    try {
      const { inputMint, outputMint, amount, slippageBps } = req.query;
      
      if (!inputMint || !outputMint || !amount) {
        return res.status(400).json({
          success: false,
          error: 'Missing required parameters: inputMint, outputMint, amount'
        });
      }
      
      console.log(`🔨 [Transaction Builder API] Getting quote: ${inputMint} → ${outputMint}`);
      
      const quote = await this.transactionBuilder.getJupiterQuote(
        inputMint, 
        outputMint, 
        parseFloat(amount),
        parseInt(slippageBps) || 50
      );
      
      res.json({
        success: true,
        data: quote
      });
      
    } catch (error) {
      console.error(`❌ [Transaction Builder API] Quote failed:`, error.message);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Clear transaction cache
   */
  async clearCache(req, res) {
    try {
      this.transactionBuilder.clearCache();
      
      res.json({
        success: true,
        message: 'Transaction cache cleared'
      });
      
    } catch (error) {
      console.error('❌ [Transaction Builder API] Clear cache failed:', error.message);
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
      const stats = this.transactionBuilder.getCacheStats();
      
      res.json({
        success: true,
        data: stats
      });
      
    } catch (error) {
      console.error('❌ [Transaction Builder API] Get cache stats failed:', error.message);
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
      const cacheStats = this.transactionBuilder.getCacheStats();
      
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'Transaction Builder',
        cache: {
          size: cacheStats.size,
          timeout: cacheStats.timeout
        },
        connections: {
          solana: 'connected',
          jupiter: 'connected',
          sanctum: 'connected'
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
      console.log('🚀 [Transaction Builder API] Initializing...');
      
      // Initialize transaction builder
      await this.transactionBuilder.initialize();
      
      console.log('✅ [Transaction Builder API] Initialization complete');
    } catch (error) {
      console.error('❌ [Transaction Builder API] Initialization failed:', error.message);
      throw error;
    }
  }
}

export default TransactionBuilderAPI;
