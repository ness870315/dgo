import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import LSTRegistryAPI from './LSTRegistryAPI.js';
import LSTRegistryService from './LSTRegistryService.js';
import LSTDatabaseService from './LSTDatabaseService.js';

// Load environment variables
dotenv.config();

/**
 * LST Registry Main Service
 * 
 * This is the main service that orchestrates the LST Registry functionality.
 * It provides a REST API for accessing Liquid Staking Token data.
 */
class LSTRegistryMainService {
  constructor() {
    this.app = express();
    this.port = process.env.LST_REGISTRY_PORT || 3001;
    
    // Initialize services
    this.lstRegistryAPI = new LSTRegistryAPI();
    this.lstRegistry = new LSTRegistryService();
    this.databaseService = new LSTDatabaseService();
    
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
      console.log(`📡 [LST Registry] ${req.method} ${req.path} - ${new Date().toISOString()}`);
      next();
    });

    // Error handling middleware
    this.app.use((error, req, res, next) => {
      console.error('❌ [LST Registry] Error:', error.message);
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
        service: 'LST Registry',
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
      });
    });

    // API routes
    this.app.use('/api', this.lstRegistryAPI.getRouter());

    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        service: 'LST Registry Service',
        description: 'Liquid Staking Token data and analytics',
        version: '1.0.0',
        endpoints: {
          health: '/health',
          api: '/api',
          lsts: '/api/lsts',
          stats: '/api/stats',
          sync: '/api/sync'
        },
        documentation: 'https://docs.degen-oracle.com/lst-registry'
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
      console.log('🚀 [LST Registry] Starting service...');
      
      // Initialize services
      await this.lstRegistryAPI.initialize();
      
      // Start the server
      this.server = this.app.listen(this.port, () => {
        console.log(`✅ [LST Registry] Service started on port ${this.port}`);
        console.log(`📡 [LST Registry] Health check: http://localhost:${this.port}/health`);
        console.log(`📊 [LST Registry] API docs: http://localhost:${this.port}/`);
        console.log(`🏦 [LST Registry] LST data: http://localhost:${this.port}/api/lsts`);
      });

      // Graceful shutdown handling
      process.on('SIGTERM', () => this.shutdown());
      process.on('SIGINT', () => this.shutdown());

    } catch (error) {
      console.error('❌ [LST Registry] Failed to start service:', error.message);
      process.exit(1);
    }
  }

  /**
   * Shutdown the service gracefully
   */
  async shutdown() {
    try {
      console.log('🔄 [LST Registry] Shutting down service...');
      
      // Close server
      if (this.server) {
        this.server.close();
      }
      
      // Disconnect from database
      await this.databaseService.disconnect();
      
      console.log('✅ [LST Registry] Service shutdown complete');
      process.exit(0);
    } catch (error) {
      console.error('❌ [LST Registry] Shutdown error:', error.message);
      process.exit(1);
    }
  }
}

// Start the service if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const service = new LSTRegistryMainService();
  service.start().catch(error => {
    console.error('❌ [LST Registry] Service failed to start:', error.message);
    process.exit(1);
  });
}

export default LSTRegistryMainService;
