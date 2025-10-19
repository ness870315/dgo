import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import PortfolioAnalyzerAPI from './PortfolioAnalyzerAPI.js';

// Load environment variables
dotenv.config();

/**
 * Portfolio Analyzer Main Service
 * 
 * This service provides portfolio analysis capabilities for the AI Liquid Staking Router.
 * It scans user wallets, identifies SOL and LST holdings, and provides optimization insights.
 */
class PortfolioAnalyzerMainService {
  constructor() {
    this.app = express();
    this.port = process.env.PORTFOLIO_ANALYZER_PORT || 3002;
    
    // Initialize services
    this.portfolioAnalyzerAPI = new PortfolioAnalyzerAPI();
    
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
      console.log(`📊 [Portfolio Analyzer] ${req.method} ${req.path} - ${new Date().toISOString()}`);
      next();
    });

    // Error handling middleware
    this.app.use((error, req, res, next) => {
      console.error('❌ [Portfolio Analyzer] Error:', error.message);
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
        service: 'Portfolio Analyzer',
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
      });
    });

    // API routes
    this.app.use('/api', this.portfolioAnalyzerAPI.getRouter());

    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        service: 'Portfolio Analyzer Service',
        description: 'Wallet portfolio analysis and optimization insights',
        version: '1.0.0',
        endpoints: {
          health: '/health',
          api: '/api',
          analyze: '/api/analyze/:walletAddress',
          summary: '/api/summary/:walletAddress',
          compare: '/api/compare/:walletAddress',
          cache: '/api/cache'
        },
        documentation: 'https://docs.degen-oracle.com/portfolio-analyzer'
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
      console.log('🚀 [Portfolio Analyzer] Starting service...');
      
      // Initialize services
      await this.portfolioAnalyzerAPI.initialize();
      
      // Start the server
      this.server = this.app.listen(this.port, () => {
        console.log(`✅ [Portfolio Analyzer] Service started on port ${this.port}`);
        console.log(`📡 [Portfolio Analyzer] Health check: http://localhost:${this.port}/health`);
        console.log(`📊 [Portfolio Analyzer] API docs: http://localhost:${this.port}/`);
        console.log(`🔍 [Portfolio Analyzer] Analyze: http://localhost:${this.port}/api/analyze/:walletAddress`);
      });

      // Graceful shutdown handling
      process.on('SIGTERM', () => this.shutdown());
      process.on('SIGINT', () => this.shutdown());

    } catch (error) {
      console.error('❌ [Portfolio Analyzer] Failed to start service:', error.message);
      process.exit(1);
    }
  }

  /**
   * Shutdown the service gracefully
   */
  async shutdown() {
    try {
      console.log('🔄 [Portfolio Analyzer] Shutting down service...');
      
      // Close server
      if (this.server) {
        this.server.close();
      }
      
      console.log('✅ [Portfolio Analyzer] Service shutdown complete');
      process.exit(0);
    } catch (error) {
      console.error('❌ [Portfolio Analyzer] Shutdown error:', error.message);
      process.exit(1);
    }
  }
}

// Start the service if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const service = new PortfolioAnalyzerMainService();
  service.start().catch(error => {
    console.error('❌ [Portfolio Analyzer] Service failed to start:', error.message);
    process.exit(1);
  });
}

export default PortfolioAnalyzerMainService;
