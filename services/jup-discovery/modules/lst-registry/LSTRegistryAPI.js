import express from 'express';
import LSTRegistryService from './LSTRegistryService.js';
import LSTDatabaseService from './LSTDatabaseService.js';

/**
 * LST Registry API Routes
 * 
 * Provides REST API endpoints for LST data access and management
 */
class LSTRegistryAPI {
  constructor() {
    this.router = express.Router();
    this.lstRegistry = new LSTRegistryService();
    this.databaseService = new LSTDatabaseService();
    
    this.setupRoutes();
  }

  /**
   * Setup API routes
   */
  setupRoutes() {
    // Health check
    this.router.get('/health', this.healthCheck.bind(this));
    
    // LST data endpoints
    this.router.get('/lsts', this.getAllLSTs.bind(this));
    this.router.get('/lsts/:mint', this.getLSTByMint.bind(this));
    this.router.get('/lsts/search/:term', this.searchLSTs.bind(this));
    
    // Filtered LST endpoints
    this.router.get('/lsts/top/:limit?', this.getTopLSTs.bind(this));
    this.router.get('/lsts/low-risk/:maxRisk?', this.getLowRiskLSTs.bind(this));
    this.router.get('/lsts/high-liquidity', this.getHighLiquidityLSTs.bind(this));
    
    // Registry statistics
    this.router.get('/stats', this.getRegistryStats.bind(this));
    this.router.get('/stats/latest', this.getLatestStats.bind(this));
    
    // Sync operations
    this.router.post('/sync', this.triggerSync.bind(this));
    this.router.get('/sync/logs', this.getSyncLogs.bind(this));
    
    // Admin endpoints
    this.router.post('/admin/refresh/:mint', this.refreshLSTData.bind(this));
    this.router.get('/admin/health', this.getDatabaseHealth.bind(this));
  }

  /**
   * Health check endpoint
   */
  async healthCheck(req, res) {
    try {
      const registryStats = this.lstRegistry.getRegistryStats();
      const dbHealth = await this.databaseService.getHealthStatus();
      
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        registry: {
          totalLSTs: registryStats.totalLSTs,
          lastSync: registryStats.lastSyncTime,
          sources: registryStats.sources
        },
        database: dbHealth
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
   * Get all LSTs with optional filtering
   */
  async getAllLSTs(req, res) {
    try {
      const {
        verified,
        source,
        minAPR,
        maxRisk,
        minTVL,
        sortBy = 'apr',
        sortOrder = 'desc',
        limit = 100
      } = req.query;

      const filters = {};
      if (verified !== undefined) filters.verified = verified === 'true';
      if (source) filters.source = source;
      if (minAPR) filters.minAPR = parseFloat(minAPR);
      if (maxRisk) filters.maxRisk = parseFloat(maxRisk);
      if (minTVL) filters.minTVL = parseFloat(minTVL);
      
      filters.sortBy = sortBy;
      filters.sortOrder = sortOrder;
      filters.limit = parseInt(limit);

      const lsts = await this.databaseService.getAllLSTs(filters);
      
      res.json({
        success: true,
        count: lsts.length,
        filters,
        data: lsts.map(lst => lst.toPublicJSON())
      });
    } catch (error) {
      console.error('❌ [LST API] Get all LSTs failed:', error.message);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Get LST by mint address
   */
  async getLSTByMint(req, res) {
    try {
      const { mint } = req.params;
      
      const lst = await this.databaseService.getLSTByMint(mint);
      
      if (!lst) {
        return res.status(404).json({
          success: false,
          error: 'LST not found'
        });
      }

      res.json({
        success: true,
        data: lst.toPublicJSON()
      });
    } catch (error) {
      console.error(`❌ [LST API] Get LST failed for ${req.params.mint}:`, error.message);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Search LSTs by symbol or name
   */
  async searchLSTs(req, res) {
    try {
      const { term } = req.params;
      const { limit = 20 } = req.query;
      
      if (!term || term.length < 2) {
        return res.status(400).json({
          success: false,
          error: 'Search term must be at least 2 characters'
        });
      }

      const lsts = await this.databaseService.searchLSTs(term, parseInt(limit));
      
      res.json({
        success: true,
        searchTerm: term,
        count: lsts.length,
        data: lsts.map(lst => lst.toPublicJSON())
      });
    } catch (error) {
      console.error(`❌ [LST API] Search failed for "${req.params.term}":`, error.message);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Get top LSTs by APR
   */
  async getTopLSTs(req, res) {
    try {
      const { limit = 10 } = req.params;
      const { verified = 'true' } = req.query;
      
      const lsts = await this.databaseService.getTopLSTsByAPR(
        parseInt(limit),
        verified === 'true'
      );
      
      res.json({
        success: true,
        count: lsts.length,
        data: lsts.map(lst => lst.toPublicJSON())
      });
    } catch (error) {
      console.error('❌ [LST API] Get top LSTs failed:', error.message);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Get low-risk LSTs
   */
  async getLowRiskLSTs(req, res) {
    try {
      const { maxRisk = 5.0 } = req.params;
      
      const lsts = await this.databaseService.getLowRiskLSTs(parseFloat(maxRisk));
      
      res.json({
        success: true,
        maxRisk: parseFloat(maxRisk),
        count: lsts.length,
        data: lsts.map(lst => lst.toPublicJSON())
      });
    } catch (error) {
      console.error('❌ [LST API] Get low-risk LSTs failed:', error.message);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Get high-liquidity LSTs
   */
  async getHighLiquidityLSTs(req, res) {
    try {
      const lsts = await this.databaseService.getHighLiquidityLSTs();
      
      res.json({
        success: true,
        count: lsts.length,
        data: lsts.map(lst => lst.toPublicJSON())
      });
    } catch (error) {
      console.error('❌ [LST API] Get high-liquidity LSTs failed:', error.message);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Get registry statistics
   */
  async getRegistryStats(req, res) {
    try {
      const stats = this.lstRegistry.getRegistryStats();
      
      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('❌ [LST API] Get registry stats failed:', error.message);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Get latest registry statistics from database
   */
  async getLatestStats(req, res) {
    try {
      const stats = await this.databaseService.getLatestRegistryStats();
      
      if (!stats) {
        return res.status(404).json({
          success: false,
          error: 'No statistics found'
        });
      }

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('❌ [LST API] Get latest stats failed:', error.message);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Trigger manual sync
   */
  async triggerSync(req, res) {
    try {
      const { source = 'all' } = req.body;
      
      // Log sync start
      await this.databaseService.logSyncOperation({
        syncType: 'manual',
        status: 'started',
        source: source,
        metadata: { triggeredBy: 'api' }
      });

      // Start sync in background
      this.lstRegistry.syncLSTData()
        .then(async () => {
          // Log sync success
          await this.databaseService.logSyncOperation({
            syncType: 'manual',
            status: 'completed',
            source: source,
            recordsProcessed: this.lstRegistry.lstData.size,
            metadata: { triggeredBy: 'api' }
          });
        })
        .catch(async (error) => {
          // Log sync failure
          await this.databaseService.logSyncOperation({
            syncType: 'manual',
            status: 'failed',
            source: source,
            error: error.message,
            metadata: { triggeredBy: 'api' }
          });
        });

      res.json({
        success: true,
        message: 'Sync triggered successfully',
        source: source
      });
    } catch (error) {
      console.error('❌ [LST API] Trigger sync failed:', error.message);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Get sync logs
   */
  async getSyncLogs(req, res) {
    try {
      const { limit = 50 } = req.query;
      
      const logs = await this.databaseService.getSyncLogs(parseInt(limit));
      
      res.json({
        success: true,
        count: logs.length,
        data: logs
      });
    } catch (error) {
      console.error('❌ [LST API] Get sync logs failed:', error.message);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Refresh specific LST data
   */
  async refreshLSTData(req, res) {
    try {
      const { mint } = req.params;
      
      const lst = await this.lstRegistry.refreshLSTData(mint);
      
      // Update database
      await this.databaseService.updateLSTMetrics(mint, {
        apr: lst.apr,
        riskScore: lst.riskScore,
        liquidity: lst.liquidity
      });

      res.json({
        success: true,
        message: `LST data refreshed for ${lst.symbol}`,
        data: lst
      });
    } catch (error) {
      console.error(`❌ [LST API] Refresh LST failed for ${req.params.mint}:`, error.message);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Get database health status
   */
  async getDatabaseHealth(req, res) {
    try {
      const health = await this.databaseService.getHealthStatus();
      
      res.json({
        success: true,
        data: health
      });
    } catch (error) {
      console.error('❌ [LST API] Get database health failed:', error.message);
      res.status(500).json({
        success: false,
        error: error.message
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
      console.log('🚀 [LST API] Initializing...');
      
      // Connect to database
      await this.databaseService.connect();
      
      // Initialize LST registry
      await this.lstRegistry.initialize();
      
      console.log('✅ [LST API] Initialization complete');
    } catch (error) {
      console.error('❌ [LST API] Initialization failed:', error.message);
      throw error;
    }
  }
}

export default LSTRegistryAPI;
