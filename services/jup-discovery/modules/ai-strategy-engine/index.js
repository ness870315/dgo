import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import AIStrategyEngineAPI from './AIStrategyEngineAPI.js';

// Load environment variables
dotenv.config();

/**
 * AI Strategy Engine Main Service
 * 
 * This service provides AI-powered strategy generation for the Liquid Staking Router.
 * It uses GPT-4 to analyze portfolios and generate optimal LST allocation strategies.
 */
class AIStrategyEngineMainService {
  constructor() {
    this.app = express();
    this.port = process.env.AI_STRATEGY_ENGINE_PORT || 3003;
    
    // Initialize services
    this.aiStrategyEngineAPI = new AIStrategyEngineAPI();
    
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
      console.log(`🧠 [AI Strategy Engine] ${req.method} ${req.path} - ${new Date().toISOString()}`);
      next();
    });

    // Error handling middleware
    this.app.use((error, req, res, next) => {
      console.error('❌ [AI Strategy Engine] Error:', error.message);
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
        service: 'AI Strategy Engine',
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
      });
    });

    // API routes
    this.app.use('/api', this.aiStrategyEngineAPI.getRouter());

    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        service: 'AI Strategy Engine Service',
        description: 'AI-powered Liquid Staking Token strategy generation',
        version: '1.0.0',
        endpoints: {
          health: '/health',
          api: '/api',
          generate: '/api/generate',
          types: '/api/types',
          strategy: '/api/strategy/:strategyId',
          cache: '/api/cache'
        },
        documentation: 'https://docs.degen-oracle.com/ai-strategy-engine'
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
      console.log('🚀 [AI Strategy Engine] Starting service...');
      
      // Initialize services
      await this.aiStrategyEngineAPI.initialize();
      
      // Start the server
      this.server = this.app.listen(this.port, () => {
        console.log(`✅ [AI Strategy Engine] Service started on port ${this.port}`);
        console.log(`📡 [AI Strategy Engine] Health check: http://localhost:${this.port}/health`);
        console.log(`🧠 [AI Strategy Engine] API docs: http://localhost:${this.port}/`);
        console.log(`🎯 [AI Strategy Engine] Generate: http://localhost:${this.port}/api/generate`);
      });

      // Graceful shutdown handling
      process.on('SIGTERM', () => this.shutdown());
      process.on('SIGINT', () => this.shutdown());

    } catch (error) {
      console.error('❌ [AI Strategy Engine] Failed to start service:', error.message);
      process.exit(1);
    }
  }

  /**
   * Shutdown the service gracefully
   */
  async shutdown() {
    try {
      console.log('🔄 [AI Strategy Engine] Shutting down service...');
      
      // Close server
      if (this.server) {
        this.server.close();
      }
      
      console.log('✅ [AI Strategy Engine] Service shutdown complete');
      process.exit(0);
    } catch (error) {
      console.error('❌ [AI Strategy Engine] Shutdown error:', error.message);
      process.exit(1);
    }
  }
}

// Start the service if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const service = new AIStrategyEngineMainService();
  service.start().catch(error => {
    console.error('❌ [AI Strategy Engine] Service failed to start:', error.message);
    process.exit(1);
  });
}

export default AIStrategyEngineMainService;
