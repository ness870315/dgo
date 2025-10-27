import express from 'express';
import SwapBackfillWorker from './SwapBackfillWorker.js';

/**
 * Swap Backfill API
 * 
 * Handles historical swap data backfilling using Constant K gRPC
 * Stores to the same ChartDatabase as backend live swaps
 */
class SwapBackfillAPI {
  constructor() {
    this.router = express.Router();
    this.worker = new SwapBackfillWorker();
    this.isInitialized = false;
    
    this.setupRoutes();
  }

  /**
   * Setup API routes
   */
  setupRoutes() {
    // Initialize route
    this.router.post('/initialize', async (req, res) => {
      try {
        if (!this.isInitialized) {
          await this.worker.initialize();
          this.isInitialized = true;
          res.json({ success: true, message: 'Worker initialized' });
        } else {
          res.json({ success: true, message: 'Already initialized' });
        }
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Health check
    this.router.get('/health', (req, res) => {
      res.json({
        service: 'Swap Backfill Worker',
        status: 'running',
        initialized: this.isInitialized
      });
    });

    // Backfill specific token
    this.router.post('/backfill/:tokenAddress', async (req, res) => {
      try {
        const { tokenAddress } = req.params;
        const { poolAddress } = req.body;
        
        if (!this.isInitialized) {
          await this.worker.initialize();
          this.isInitialized = true;
        }
        
        console.log(`🔄 [SwapBackfillAPI] Backfilling ${tokenAddress.substring(0, 8)}...`);
        
        const result = await this.worker.backfillToken(tokenAddress, poolAddress);
        
        res.json({
          success: result.success,
          tokenAddress,
          ...result
        });
      } catch (error) {
        console.error('❌ [SwapBackfillAPI] Error:', error.message);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get stats for a token
    this.router.get('/stats/:tokenAddress', async (req, res) => {
      try {
        const { tokenAddress } = req.params;
        
        if (!this.isInitialized) {
          await this.worker.initialize();
          this.isInitialized = true;
        }
        
        const stats = await this.worker.getStats(tokenAddress);
        
        res.json({
          success: true,
          tokenAddress,
          ...stats
        });
      } catch (error) {
        console.error('❌ [SwapBackfillAPI] Error:', error.message);
        res.status(500).json({ success: false, error: error.message });
      }
    });
  }

  /**
   * Get the Express router
   */
  getRouter() {
    return this.router;
  }

  /**
   * Start the service
   */
  async start() {
    try {
      await this.worker.initialize();
      this.isInitialized = true;
      console.log('✅ Swap Backfill API initialized');
    } catch (error) {
      console.error('❌ Failed to start Swap Backfill API:', error.message);
      throw error;
    }
  }

  /**
   * Stop the service
   */
  stop() {
    console.log('🛑 Stopping Swap Backfill API...');
    this.isInitialized = false;
  }
}

export default SwapBackfillAPI;

