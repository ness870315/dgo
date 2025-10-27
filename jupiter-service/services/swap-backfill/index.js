import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import SwapBackfillAPI from './SwapBackfillAPI.js';

// Load environment variables
dotenv.config();

/**
 * Swap Backfill Microservice
 * 
 * Dedicated service for backfilling token swap data using Constant K gRPC
 * Stores swaps in the same database as the backend for unified data access
 */
class SwapBackfillService {
  constructor() {
    this.app = express();
    this.port = process.env.PORT || 3002;
    this.swapBackfillAPI = new SwapBackfillAPI();
    
    this.setupMiddleware();
    this.setupRoutes();
  }

  /**
   * Setup Express middleware
   */
  setupMiddleware() {
    // CORS
    this.app.use(cors({
      origin: process.env.ALLOWED_ORIGINS?.split(',') || ['*'],
      credentials: true
    }));

    // Body parsing
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // Request logging
    this.app.use((req, res, next) => {
      console.log(`📡 [SwapBackfill] ${req.method} ${req.path} - ${new Date().toISOString()}`);
      next();
    });

    // Error handling
    this.app.use((error, req, res, next) => {
      console.error('❌ [SwapBackfill] Error:', error.message);
      res.status(500).json({
        success: false,
        error: error.message
      });
    });
  }

  /**
   * Setup routes
   */
  setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        service: 'Swap Backfill Microservice',
        status: 'running',
        version: '1.0.0'
      });
    });

    // Swap Backfill routes
    this.app.use('/api', this.swapBackfillAPI.getRouter());

    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        service: 'Swap Backfill Microservice',
        description: 'Backfills token swap data using Constant K gRPC',
        endpoints: {
          health: '/health',
          backfill: 'POST /api/backfill/:tokenAddress',
          stats: 'GET /api/stats/:tokenAddress',
          initialize: 'POST /api/initialize'
        }
      });
    });
  }

  /**
   * Initialize the service
   */
  async initialize() {
    try {
      console.log('🚀 [SwapBackfill] Initializing microservice...');
      
      await this.swapBackfillAPI.start();
      
      // Automatically start backfilling tokens from the same cache the backend uses
      console.log('📊 [SwapBackfill] Loading tokens from backend cache...');
      await this.startAutoBackfill();
      
      console.log('✅ [SwapBackfill] Service initialized successfully');
    } catch (error) {
      console.error('❌ [SwapBackfill] Initialization failed:', error.message);
      throw error;
    }
  }

  /**
   * Auto-start backfilling tokens from backend cache
   */
  async startAutoBackfill() {
    try {
      const cachePath = path.join(process.cwd(), '../../backend/data/cache/tokens-cache.json');
      const tokens = JSON.parse(await fs.readFile(cachePath, 'utf8'));
      
      // Get top tokens by score
      const topTokens = tokens
        .sort((a, b) => (b.overallScore || b.score || 0) - (a.overallScore || a.score || 0))
        .slice(0, 10); // Top 10 tokens
      
      console.log(`🎯 [SwapBackfill] Auto-backfilling top ${topTokens.length} tokens...`);
      
      // Start backfilling each token
      for (const token of topTokens) {
        const tokenAddress = token.contractAddress;
        if (tokenAddress) {
          console.log(`📡 [SwapBackfill] Starting backfill for ${token.symbol}...`);
          await this.swapBackfillAPI.triggerBackfill(tokenAddress);
          await new Promise(resolve => setTimeout(resolve, 500)); // Small delay
        }
      }
      
      console.log(`✅ [SwapBackfill] Started backfilling ${topTokens.length} tokens`);
    } catch (error) {
      console.error('⚠️ [SwapBackfill] Auto-backfill failed:', error.message);
    }
  }

  /**
   * Start the service
   */
  async start() {
    try {
      await this.initialize();
      
      this.app.listen(this.port, () => {
        console.log('✅ [SwapBackfill] Microservice is running');
        console.log(`📡 [SwapBackfill] Server: http://localhost:${this.port}`);
        console.log(`🔍 [SwapBackfill] Health: http://localhost:${this.port}/health`);
        console.log(`🎯 [SwapBackfill] API: http://localhost:${this.port}/api`);
      });
      
    } catch (error) {
      console.error('❌ [SwapBackfill] Failed to start:', error.message);
      process.exit(1);
    }
  }
}

// Start the service if run directly
const service = new SwapBackfillService();
service.start().catch(error => {
  console.error('❌ [SwapBackfill] Service failed:', error);
  process.exit(1);
});

export default SwapBackfillService;

