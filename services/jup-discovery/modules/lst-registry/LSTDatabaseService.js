import mongoose from 'mongoose';
import { LSTData, LSTRegistryStats, LSTSyncLog } from './models/LSTModels.js';

/**
 * LST Database Service - Handles database operations for LST data
 */
class LSTDatabaseService {
  constructor() {
    this.isConnected = false;
    this.connectionString = process.env.MONGODB_URI || 'mongodb://localhost:27017/lst-registry';
  }

  /**
   * Connect to MongoDB
   */
  async connect() {
    try {
      if (this.isConnected) {
        console.log('📊 [LST Database] Already connected');
        return;
      }

      console.log('📊 [LST Database] Connecting to MongoDB...');
      
      await mongoose.connect(this.connectionString, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      });

      this.isConnected = true;
      console.log('✅ [LST Database] Connected to MongoDB');

      // Set up connection event handlers
      mongoose.connection.on('error', (error) => {
        console.error('❌ [LST Database] Connection error:', error);
        this.isConnected = false;
      });

      mongoose.connection.on('disconnected', () => {
        console.warn('⚠️ [LST Database] Disconnected from MongoDB');
        this.isConnected = false;
      });

      mongoose.connection.on('reconnected', () => {
        console.log('🔄 [LST Database] Reconnected to MongoDB');
        this.isConnected = true;
      });

    } catch (error) {
      console.error('❌ [LST Database] Connection failed:', error.message);
      this.isConnected = false;
      throw error;
    }
  }

  /**
   * Disconnect from MongoDB
   */
  async disconnect() {
    try {
      if (!this.isConnected) {
        return;
      }

      await mongoose.disconnect();
      this.isConnected = false;
      console.log('📊 [LST Database] Disconnected from MongoDB');
    } catch (error) {
      console.error('❌ [LST Database] Disconnect error:', error.message);
      throw error;
    }
  }

  /**
   * Save LST data to database
   */
  async saveLSTData(lstData) {
    try {
      if (!this.isConnected) {
        throw new Error('Database not connected');
      }

      const existingLST = await LSTData.findOne({ mint: lstData.mint });
      
      if (existingLST) {
        // Update existing LST
        Object.assign(existingLST, lstData);
        existingLST.lastUpdated = new Date();
        await existingLST.save();
        
        console.log(`📊 [LST Database] Updated LST: ${lstData.symbol}`);
        return { action: 'updated', lst: existingLST };
      } else {
        // Create new LST
        const newLST = new LSTData(lstData);
        await newLST.save();
        
        console.log(`📊 [LST Database] Created new LST: ${lstData.symbol}`);
        return { action: 'created', lst: newLST };
      }
    } catch (error) {
      console.error(`❌ [LST Database] Save failed for ${lstData.symbol}:`, error.message);
      throw error;
    }
  }

  /**
   * Bulk save LST data
   */
  async bulkSaveLSTData(lstDataArray) {
    try {
      if (!this.isConnected) {
        throw new Error('Database not connected');
      }

      console.log(`📊 [LST Database] Bulk saving ${lstDataArray.length} LSTs...`);

      const results = {
        created: 0,
        updated: 0,
        skipped: 0,
        errors: 0
      };

      for (const lstData of lstDataArray) {
        try {
          const result = await this.saveLSTData(lstData);
          results[result.action]++;
        } catch (error) {
          console.warn(`⚠️ [LST Database] Failed to save ${lstData.symbol}:`, error.message);
          results.errors++;
        }
      }

      console.log(`📊 [LST Database] Bulk save complete:`, results);
      return results;
    } catch (error) {
      console.error('❌ [LST Database] Bulk save failed:', error.message);
      throw error;
    }
  }

  /**
   * Get LST data by mint
   */
  async getLSTByMint(mint) {
    try {
      if (!this.isConnected) {
        throw new Error('Database not connected');
      }

      const lst = await LSTData.findByMint(mint);
      return lst;
    } catch (error) {
      console.error(`❌ [LST Database] Get LST failed for ${mint}:`, error.message);
      throw error;
    }
  }

  /**
   * Get all LSTs with optional filtering
   */
  async getAllLSTs(filters = {}) {
    try {
      if (!this.isConnected) {
        throw new Error('Database not connected');
      }

      let query = LSTData.find();

      // Apply filters
      if (filters.verified !== undefined) {
        query = query.where('verified').equals(filters.verified);
      }
      if (filters.source) {
        query = query.where('source').equals(filters.source);
      }
      if (filters.minAPR) {
        query = query.where('apr').gte(filters.minAPR);
      }
      if (filters.maxRisk) {
        query = query.where('riskScore').lte(filters.maxRisk);
      }
      if (filters.minTVL) {
        query = query.where('tvl').gte(filters.minTVL);
      }

      // Apply sorting
      if (filters.sortBy) {
        const sortOrder = filters.sortOrder === 'desc' ? -1 : 1;
        query = query.sort({ [filters.sortBy]: sortOrder });
      }

      // Apply limit
      if (filters.limit) {
        query = query.limit(filters.limit);
      }

      const lsts = await query.exec();
      return lsts;
    } catch (error) {
      console.error('❌ [LST Database] Get all LSTs failed:', error.message);
      throw error;
    }
  }

  /**
   * Get top LSTs by APR
   */
  async getTopLSTsByAPR(limit = 10, verifiedOnly = true) {
    try {
      if (!this.isConnected) {
        throw new Error('Database not connected');
      }

      let query = LSTData.findTopByAPR(limit);
      
      if (!verifiedOnly) {
        query = LSTData.find().sort({ apr: -1 }).limit(limit);
      }

      const lsts = await query.exec();
      return lsts;
    } catch (error) {
      console.error('❌ [LST Database] Get top LSTs failed:', error.message);
      throw error;
    }
  }

  /**
   * Get low-risk LSTs
   */
  async getLowRiskLSTs(maxRisk = 5.0) {
    try {
      if (!this.isConnected) {
        throw new Error('Database not connected');
      }

      const lsts = await LSTData.findLowRisk(maxRisk).exec();
      return lsts;
    } catch (error) {
      console.error('❌ [LST Database] Get low-risk LSTs failed:', error.message);
      throw error;
    }
  }

  /**
   * Get high-liquidity LSTs
   */
  async getHighLiquidityLSTs() {
    try {
      if (!this.isConnected) {
        throw new Error('Database not connected');
      }

      const lsts = await LSTData.findHighLiquidity().exec();
      return lsts;
    } catch (error) {
      console.error('❌ [LST Database] Get high-liquidity LSTs failed:', error.message);
      throw error;
    }
  }

  /**
   * Save registry statistics
   */
  async saveRegistryStats(stats) {
    try {
      if (!this.isConnected) {
        throw new Error('Database not connected');
      }

      const registryStats = new LSTRegistryStats(stats);
      await registryStats.save();

      console.log('📊 [LST Database] Registry stats saved');
      return registryStats;
    } catch (error) {
      console.error('❌ [LST Database] Save registry stats failed:', error.message);
      throw error;
    }
  }

  /**
   * Get latest registry statistics
   */
  async getLatestRegistryStats() {
    try {
      if (!this.isConnected) {
        throw new Error('Database not connected');
      }

      const stats = await LSTRegistryStats.findOne()
        .sort({ createdAt: -1 })
        .exec();

      return stats;
    } catch (error) {
      console.error('❌ [LST Database] Get registry stats failed:', error.message);
      throw error;
    }
  }

  /**
   * Log sync operation
   */
  async logSyncOperation(syncData) {
    try {
      if (!this.isConnected) {
        throw new Error('Database not connected');
      }

      const syncLog = new LSTSyncLog(syncData);
      await syncLog.save();

      console.log(`📊 [LST Database] Sync log saved: ${syncData.syncType} - ${syncData.status}`);
      return syncLog;
    } catch (error) {
      console.error('❌ [LST Database] Save sync log failed:', error.message);
      throw error;
    }
  }

  /**
   * Get sync logs
   */
  async getSyncLogs(limit = 50) {
    try {
      if (!this.isConnected) {
        throw new Error('Database not connected');
      }

      const logs = await LSTSyncLog.find()
        .sort({ createdAt: -1 })
        .limit(limit)
        .exec();

      return logs;
    } catch (error) {
      console.error('❌ [LST Database] Get sync logs failed:', error.message);
      throw error;
    }
  }

  /**
   * Update LST metrics (APR, risk score, etc.)
   */
  async updateLSTMetrics(mint, metrics) {
    try {
      if (!this.isConnected) {
        throw new Error('Database not connected');
      }

      const lst = await LSTData.findByMint(mint);
      if (!lst) {
        throw new Error(`LST not found: ${mint}`);
      }

      // Update metrics
      if (metrics.apr !== undefined) lst.apr = metrics.apr;
      if (metrics.riskScore !== undefined) lst.riskScore = metrics.riskScore;
      if (metrics.liquidity !== undefined) lst.liquidity = metrics.liquidity;
      if (metrics.tvl !== undefined) lst.tvl = metrics.tvl;
      
      lst.lastUpdated = new Date();
      await lst.save();

      console.log(`📊 [LST Database] Updated metrics for ${lst.symbol}`);
      return lst;
    } catch (error) {
      console.error(`❌ [LST Database] Update metrics failed for ${mint}:`, error.message);
      throw error;
    }
  }

  /**
   * Search LSTs by symbol or name
   */
  async searchLSTs(searchTerm, limit = 20) {
    try {
      if (!this.isConnected) {
        throw new Error('Database not connected');
      }

      const regex = new RegExp(searchTerm, 'i');
      const lsts = await LSTData.find({
        $or: [
          { symbol: regex },
          { name: regex },
          { description: regex }
        ],
        verified: true
      })
      .sort({ apr: -1 })
      .limit(limit)
      .exec();

      return lsts;
    } catch (error) {
      console.error('❌ [LST Database] Search LSTs failed:', error.message);
      throw error;
    }
  }

  /**
   * Get database health status
   */
  async getHealthStatus() {
    try {
      if (!this.isConnected) {
        return {
          status: 'disconnected',
          connected: false,
          error: 'Database not connected'
        };
      }

      // Test database connection
      await mongoose.connection.db.admin().ping();

      // Get basic stats
      const totalLSTs = await LSTData.countDocuments();
      const verifiedLSTs = await LSTData.countDocuments({ verified: true });
      const lastSync = await LSTRegistryStats.findOne().sort({ createdAt: -1 });

      return {
        status: 'healthy',
        connected: true,
        totalLSTs,
        verifiedLSTs,
        lastSync: lastSync?.lastSyncTime,
        uptime: process.uptime()
      };
    } catch (error) {
      console.error('❌ [LST Database] Health check failed:', error.message);
      return {
        status: 'unhealthy',
        connected: false,
        error: error.message
      };
    }
  }
}

export default LSTDatabaseService;
