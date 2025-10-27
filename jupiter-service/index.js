import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

// Import all service modules
import LSTRegistryAPI from './services/lst-registry/LSTRegistryAPI.js';
import PortfolioAnalyzerAPI from './services/portfolio-analyzer/PortfolioAnalyzerAPI.js';
import AIStrategyEngineAPI from './services/ai-strategy-engine/AIStrategyEngineAPI.js';
import TransactionBuilderAPI from './services/transaction-builder/TransactionBuilderAPI.js';
import BondingTokensAPI from './services/bonding-tokens/BondingTokensAPI.js';
import SwapBackfillAPI from './services/swap-backfill/SwapBackfillAPI.js';

// Load environment variables
dotenv.config();

/**
 * Jupiter Discovery Service - Unified Service
 * 
 * This is the main service that combines all Jupiter functionality:
 * - LST Registry: Token data and APRs
 * - Portfolio Analyzer: Wallet analysis
 * - AI Strategy Engine: Strategy generation
 * - Transaction Builder: Transaction creation
 * - Bonding Tokens: Pre-bonded token monitoring
 */
class JupiterDiscoveryService {
  constructor() {
    this.app = express();
    this.port = process.env.PORT || 3000;
    
    // Initialize all service APIs
    this.lstRegistryAPI = new LSTRegistryAPI();
    this.portfolioAnalyzerAPI = new PortfolioAnalyzerAPI();
    this.aiStrategyEngineAPI = new AIStrategyEngineAPI();
    this.transactionBuilderAPI = new TransactionBuilderAPI();
    this.bondingTokensAPI = new BondingTokensAPI();
    this.swapBackfillAPI = new SwapBackfillAPI();
    
    this.setupMiddleware();
    this.setupRoutes();
  }

  /**
   * Setup Express middleware
   */
  setupMiddleware() {
    // CORS configuration
    this.app.use(cors({
      origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-PAYMENT']
    }));

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Internal token authentication middleware
    this.app.use((req, res, next) => {
      // Skip authentication for health checks and public endpoints
      if (req.path === '/health' || req.path === '/' || req.path.startsWith('/api/lsts') || req.path.startsWith('/api/portfolio')) {
        return next();
      }
      
      // Check for internal token for protected endpoints
      const authHeader = req.headers.authorization;
      const internalToken = process.env.INTERNAL_TOKEN;
      
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        if (token === internalToken) {
          console.log(`🔐 [Jupiter Discovery] Internal request authenticated: ${req.method} ${req.path}`);
          return next();
        }
      }
      
      // For protected endpoints, require authentication
      if (req.path.startsWith('/api/strategy') || req.path.startsWith('/api/transactions')) {
        console.log(`🔒 [Jupiter Discovery] Unauthorized request: ${req.method} ${req.path}`);
        return res.status(401).json({
          success: false,
          error: 'Unauthorized - Internal token required'
        });
      }
      
      next();
    });

    // Request logging
    this.app.use((req, res, next) => {
      console.log(`🔍 [Jupiter Discovery] ${req.method} ${req.path} - ${new Date().toISOString()}`);
      next();
    });

    // Error handling middleware
    this.app.use((error, req, res, next) => {
      console.error('❌ [Jupiter Discovery] Error:', error.message);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message
      });
    });
  }

  /**
   * Setup API routes
   */
  setupRoutes() {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        service: 'Jupiter Discovery',
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        modules: {
          lstRegistry: 'active',
          portfolioAnalyzer: 'active',
          aiStrategyEngine: 'active',
          transactionBuilder: 'active',
          bondingTokens: 'active',
          swapBackfill: 'active'
        }
      });
    });

    // LST Registry routes
    this.app.use('/api/lsts', this.lstRegistryAPI.getRouter());
    
    // Portfolio Analyzer routes
    this.app.use('/api/portfolio', this.portfolioAnalyzerAPI.getRouter());
    
    // AI Strategy Engine routes
    this.app.use('/api/strategy', this.aiStrategyEngineAPI.getRouter());
    
    // Transaction Builder routes
    this.app.use('/api/transactions', this.transactionBuilderAPI.getRouter());
    
    // Bonding Tokens routes
    this.app.use('/api/bonding-tokens', this.bondingTokensAPI.getRouter());
    
    // Swap Backfill routes
    this.app.use('/api/swap-backfill', this.swapBackfillAPI.getRouter());

    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        service: 'Jupiter Discovery Service',
        description: 'Unified Jupiter service for AI Liquid Staking Router',
        version: '1.0.0',
        modules: {
          lstRegistry: {
            description: 'LST token data and APRs',
            endpoints: '/api/lsts'
          },
          portfolioAnalyzer: {
            description: 'Wallet portfolio analysis',
            endpoints: '/api/portfolio'
          },
          aiStrategyEngine: {
            description: 'AI-powered strategy generation',
            endpoints: '/api/strategy'
          },
          transactionBuilder: {
            description: 'Transaction building and execution',
            endpoints: '/api/transactions'
          },
          bondingTokens: {
            description: 'Pre-bonded token monitoring and graduation tracking',
            endpoints: '/api/bonding-tokens'
          }
        },
        documentation: 'https://docs.degen-oracle.com/jupiter-discovery'
      });
    });

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        path: req.originalUrl,
        availableModules: ['/api/lsts', '/api/portfolio', '/api/strategy', '/api/transactions']
      });
    });
  }

  /**
   * Connect to MongoDB
   */
  async connectToDatabase() {
    try {
      if (process.env.MONGODB_URI) {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ [Jupiter Discovery] MongoDB connected');
      } else {
        console.log('⚠️ [Jupiter Discovery] MongoDB URI not provided, skipping database connection');
      }
    } catch (error) {
      console.error('❌ [Jupiter Discovery] MongoDB connection failed:', error.message);
      // Don't exit - service can work without database for some features
    }
  }

  /**
   * Initialize all services
   */
  async initialize() {
    try {
      console.log('🚀 [Jupiter Discovery] Initializing unified service...');
      
      // Connect to database
      await this.connectToDatabase();
      
      // Initialize all service APIs
      await this.lstRegistryAPI.initialize();
      await this.portfolioAnalyzerAPI.initialize();
      await this.aiStrategyEngineAPI.initialize();
      await this.transactionBuilderAPI.initialize();
      await this.swapBackfillAPI.start();
      
      console.log('✅ [Jupiter Discovery] All modules initialized');
    } catch (error) {
      console.error('❌ [Jupiter Discovery] Initialization failed:', error.message);
      throw error;
    }
  }

  /**
   * Start the service
   */
  async start() {
    try {
      console.log('🚀 [Jupiter Discovery] Starting unified service...');
      
      // Initialize all services
      await this.initialize();
      
      // Start the server
      this.server = this.app.listen(this.port, () => {
        console.log(`✅ [Jupiter Discovery] Service started on port ${this.port}`);
        console.log(`📡 [Jupiter Discovery] Health check: http://localhost:${this.port}/health`);
        console.log(`🔍 [Jupiter Discovery] LST Registry: http://localhost:${this.port}/api/lsts`);
        console.log(`📊 [Jupiter Discovery] Portfolio Analyzer: http://localhost:${this.port}/api/portfolio`);
        console.log(`🧠 [Jupiter Discovery] AI Strategy Engine: http://localhost:${this.port}/api/strategy`);
        console.log(`🔨 [Jupiter Discovery] Transaction Builder: http://localhost:${this.port}/api/transactions`);
      });

      // Graceful shutdown handling
      process.on('SIGTERM', () => this.shutdown());
      process.on('SIGINT', () => this.shutdown());

    } catch (error) {
      console.error('❌ [Jupiter Discovery] Failed to start service:', error.message);
      process.exit(1);
    }
  }

  /**
   * Shutdown the service gracefully
   */
  async shutdown() {
    try {
      console.log('🔄 [Jupiter Discovery] Shutting down service...');
      
      // Close server
      if (this.server) {
        this.server.close();
      }
      
      // Close database connection
      if (mongoose.connection.readyState === 1) {
        await mongoose.connection.close();
        console.log('✅ [Jupiter Discovery] MongoDB connection closed');
      }
      
      console.log('✅ [Jupiter Discovery] Service shutdown complete');
      process.exit(0);
    } catch (error) {
      console.error('❌ [Jupiter Discovery] Shutdown error:', error.message);
      process.exit(1);
    }
  }
}

// Start the service if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const service = new JupiterDiscoveryService();
  service.start().catch(error => {
    console.error('❌ [Jupiter Discovery] Service failed to start:', error.message);
    process.exit(1);
  });
}

export default JupiterDiscoveryService;
