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
      
      // Auto-start backfilling all known tokens
      await this.autoStartBackfills();
    } catch (error) {
      console.error('❌ Failed to start Swap Backfill API:', error.message);
      throw error;
    }
  }

  /**
   * Auto-start backfilling tokens from backend cache
   */
  async autoStartBackfills() {
    try {
      console.log('📊 [SwapBackfillAPI] Loading tokens to backfill...');
      
      // Read backend cache to get tokens
      const fs = await import('fs/promises');
      const path = await import('path');
      
      // Use absolute path to backend cache
      const cachePath = path.resolve(process.cwd(), 'backend/data/cache/tokens-cache.json');
      console.log(`📂 [SwapBackfillAPI] Reading cache from: ${cachePath}`);
      
      const tokens = JSON.parse(await fs.readFile(cachePath, 'utf8'));
      console.log(`✅ [SwapBackfillAPI] Loaded ${tokens.length} tokens from cache`);
      
      if (!Array.isArray(tokens) || tokens.length === 0) {
        console.log('⚠️ [SwapBackfillAPI] No tokens in cache, skipping auto-backfill');
        return;
      }
      
      // Get top tokens by score
      const topTokens = tokens
        .filter(t => t.contractAddress && t.jupiterData?.firstPool?.id)
        .sort((a, b) => (b.overallScore || b.score || 0) - (a.overallScore || a.score || 0))
        .slice(0, 50); // Top 50 for now
      
      console.log(`🎯 [SwapBackfillAPI] Starting backfill for top ${topTokens.length} tokens...`);
      
      // Start backfilling each token
      for (const token of topTokens) {
        const tokenAddress = token.contractAddress;
        const poolAddress = token.jupiterData?.firstPool?.id || token.graduatedPool;
        
        if (tokenAddress && poolAddress) {
          console.log(`📡 [SwapBackfillAPI] Backfilling ${token.symbol} (${tokenAddress.substring(0, 8)}...)`);
          
          // Start backfilling asynchronously (don't wait)
          this.worker.backfillToken(tokenAddress, poolAddress).catch(err => {
            console.error(`⚠️ Failed to start backfill for ${token.symbol}:`, err.message);
          });
          
          // Small delay between starts
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }
      
      console.log(`✅ [SwapBackfillAPI] Started backfilling ${topTokens.length} tokens`);
    } catch (error) {
      console.error('⚠️ [SwapBackfillAPI] Auto-backfill failed:', error.message);
    }
  }

  /**
   * Stop the service
   */
  stop() {
    console.log('🛑 Stopping Swap Backfill API...');
    this.isInitialized = false;
  }

  /**
   * Trigger backfill for a token (for programmatic use)
   */
  async triggerBackfill(tokenAddress, poolAddress = null) {
    try {
      if (!this.isInitialized) {
        await this.worker.initialize();
        this.isInitialized = true;
      }
      
      console.log(`🔄 [SwapBackfillAPI] Programmatic backfill for ${tokenAddress.substring(0, 8)}...`);
      
      const result = await this.worker.backfillToken(tokenAddress, poolAddress);
      
      return {
        success: result.success,
        tokenAddress,
        ...result
      };
    } catch (error) {
      console.error('❌ [SwapBackfillAPI] Error:', error.message);
      throw error;
    }
  }
}

export default SwapBackfillAPI;

