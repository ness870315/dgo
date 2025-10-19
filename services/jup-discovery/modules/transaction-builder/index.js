import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import TransactionBuilderAPI from './TransactionBuilderAPI.js';

// Load environment variables
dotenv.config();

/**
 * Transaction Builder Main Service
 * 
 * This service builds and bundles Solana transactions for executing AI-generated strategies.
 * It integrates with Jupiter for swaps and Sanctum for staking operations.
 */
class TransactionBuilderMainService {
  constructor() {
    this.app = express();
    this.port = process.env.TRANSACTION_BUILDER_PORT || 3004;
    
    // Initialize services
    this.transactionBuilderAPI = new TransactionBuilderAPI();
    
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

    // Request logging
    this.app.use((req, res, next) => {
      console.log(`🔨 [Transaction Builder] ${req.method} ${req.path} - ${new Date().toISOString()}`);
      next();
    });

    // Error handling middleware
    this.app.use((error, req, res, next) => {
      console.error('❌ [Transaction Builder] Error:', error.message);
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
        service: 'Transaction Builder',
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
      });
    });

    // API routes
    this.app.use('/api', this.transactionBuilderAPI.getRouter());

    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        service: 'Transaction Builder Service',
        description: 'Solana transaction building for AI Liquid Staking Router',
        version: '1.0.0',
        endpoints: {
          health: '/health',
          api: '/api',
          build: '/api/build',
          validate: '/api/validate',
          quote: '/api/quote',
          transaction: '/api/transaction/:strategyId/:userWallet',
          cache: '/api/cache'
        },
        integrations: {
          jupiter: 'SOL ↔ LST swaps',
          sanctum: 'Staking operations',
          solana: 'Transaction building and bundling'
        },
        documentation: 'https://docs.degen-oracle.com/transaction-builder'
      });
    });

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        path: req.originalUrl
      });
    });
  }

  /**
   * Start the service
   */
  async start() {
    try {
      console.log('🚀 [Transaction Builder] Starting service...');
      
      // Initialize services
      await this.transactionBuilderAPI.initialize();
      
      // Start the server
      this.server = this.app.listen(this.port, () => {
        console.log(`✅ [Transaction Builder] Service started on port ${this.port}`);
        console.log(`📡 [Transaction Builder] Health check: http://localhost:${this.port}/health`);
        console.log(`🔨 [Transaction Builder] API docs: http://localhost:${this.port}/`);
        console.log(`⚡ [Transaction Builder] Build: http://localhost:${this.port}/api/build`);
      });

      // Graceful shutdown handling
      process.on('SIGTERM', () => this.shutdown());
      process.on('SIGINT', () => this.shutdown());

    } catch (error) {
      console.error('❌ [Transaction Builder] Failed to start service:', error.message);
      process.exit(1);
    }
  }

  /**
   * Shutdown the service gracefully
   */
  async shutdown() {
    try {
      console.log('🔄 [Transaction Builder] Shutting down service...');
      
      // Close server
      if (this.server) {
        this.server.close();
      }
      
      console.log('✅ [Transaction Builder] Service shutdown complete');
      process.exit(0);
    } catch (error) {
      console.error('❌ [Transaction Builder] Shutdown error:', error.message);
      process.exit(1);
    }
  }
}

// Start the service if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const service = new TransactionBuilderMainService();
  service.start().catch(error => {
    console.error('❌ [Transaction Builder] Service failed to start:', error.message);
    process.exit(1);
  });
}

export default TransactionBuilderMainService;
