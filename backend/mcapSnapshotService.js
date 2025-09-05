import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Market Cap Snapshot Service
 * Tracks hourly market cap snapshots for tokens to enable accurate charting
 */
class McapSnapshotService {
  constructor() {
    this.baseDir = process.env.DATA_DIR || path.join(__dirname, 'data');
    this.globalDir = path.join(this.baseDir, 'global');
    this.mcapDir = path.join(this.globalDir, 'mcap-snapshots');
    this.maxDays = 30; // retain up to 30 days
    this.initializeDirectories();
  }

  async initializeDirectories() {
    try {
      await fs.mkdir(this.mcapDir, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }
  }

  /**
   * Get file path for a token's market cap snapshots
   */
  getMcapFile(contractAddress) {
    return path.join(this.mcapDir, `${contractAddress}.json`);
  }

  /**
   * Save market cap snapshot for a token
   */
  async saveMcapSnapshot(contractAddress, mcap, holderCount = null) {
    try {
      const filePath = this.getMcapFile(contractAddress);
      const snapshots = await this.readJsonFile(filePath, []);
      
      const now = new Date();
      const timestamp = now.toISOString();
      const hourKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}`;
      
      // Check if we already have a snapshot for this hour
      const existingIndex = snapshots.findIndex(s => s.hourKey === hourKey);
      
      const snapshot = {
        timestamp,
        hourKey,
        mcap: Number(mcap) || 0,
        holderCount: holderCount !== null ? Number(holderCount) || 0 : null
      };
      
      if (existingIndex >= 0) {
        // Update existing snapshot
        snapshots[existingIndex] = snapshot;
      } else {
        // Add new snapshot
        snapshots.push(snapshot);
      }
      
      // Sort by timestamp
      snapshots.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      
      // Keep only last 30 days
      const cutoffDate = new Date(now.getTime() - (this.maxDays * 24 * 60 * 60 * 1000));
      const recentSnapshots = snapshots.filter(s => new Date(s.timestamp) >= cutoffDate);
      
      await this.writeJsonFile(filePath, recentSnapshots);
      
      return snapshot;
    } catch (error) {
      console.error(`❌ Error saving mcap snapshot for ${contractAddress}:`, error.message);
      return null;
    }
  }

  /**
   * Get market cap snapshots for a token within a time range
   */
  async getMcapSnapshots(contractAddress, range = '30d') {
    try {
      const filePath = this.getMcapFile(contractAddress);
      const allSnapshots = await this.readJsonFile(filePath, []);
      
      if (allSnapshots.length === 0) {
        return [];
      }
      
      // Calculate time range
      const now = new Date();
      let hoursBack = 24 * 30; // 30 days default
      
      switch (range) {
        case '1d': hoursBack = 24; break;
        case '3d': hoursBack = 24 * 3; break;
        case '7d': hoursBack = 24 * 7; break;
        case '15d': hoursBack = 24 * 15; break;
        case '30d': hoursBack = 24 * 30; break;
        default: hoursBack = 24 * 30;
      }
      
      const cutoffTime = new Date(now.getTime() - (hoursBack * 60 * 60 * 1000));
      
      // Filter snapshots within range
      const filteredSnapshots = allSnapshots.filter(s => 
        new Date(s.timestamp) >= cutoffTime
      );
      
      return filteredSnapshots;
    } catch (error) {
      console.error(`❌ Error getting mcap snapshots for ${contractAddress}:`, error.message);
      return [];
    }
  }

  /**
   * Get market cap snapshots for a KOL call (from call time to present)
   */
  async getKolCallMcapChart(contractAddress, calledAt) {
    try {
      const filePath = this.getMcapFile(contractAddress);
      const allSnapshots = await this.readJsonFile(filePath, []);
      
      if (allSnapshots.length === 0) {
        return { snapshots: [], callIndex: -1, athIndex: -1 };
      }
      
      const callTime = new Date(calledAt);
      
      // Filter snapshots from call time onwards
      const relevantSnapshots = allSnapshots.filter(s => 
        new Date(s.timestamp) >= callTime
      );
      
      if (relevantSnapshots.length === 0) {
        return { snapshots: [], callIndex: -1, athIndex: -1 };
      }
      
      // Find ATH index
      let athIndex = 0;
      let maxMcap = relevantSnapshots[0].mcap;
      
      relevantSnapshots.forEach((snapshot, index) => {
        if (snapshot.mcap > maxMcap) {
          maxMcap = snapshot.mcap;
          athIndex = index;
        }
      });
      
      return {
        snapshots: relevantSnapshots,
        callIndex: 0, // First snapshot is at/after call time
        athIndex: athIndex
      };
    } catch (error) {
      console.error(`❌ Error getting KOL call mcap chart for ${contractAddress}:`, error.message);
      return { snapshots: [], callIndex: -1, athIndex: -1 };
    }
  }

  /**
   * Read JSON file with error handling
   */
  async readJsonFile(filePath, defaultValue = null) {
    try {
      const data = await fs.readFile(filePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return defaultValue;
      }
      console.error(`❌ Error reading ${filePath}:`, error.message);
      return defaultValue;
    }
  }

  /**
   * Write JSON file with error handling
   */
  async writeJsonFile(filePath, data) {
    try {
      await fs.writeFile(filePath, JSON.stringify(data, null, 2));
      return true;
    } catch (error) {
      console.error(`❌ Error writing ${filePath}:`, error.message);
      return false;
    }
  }

  /**
   * Clean up old snapshot files (older than maxDays)
   */
  async cleanupOldSnapshots() {
    try {
      const files = await fs.readdir(this.mcapDir);
      const cutoffDate = new Date(Date.now() - (this.maxDays * 24 * 60 * 60 * 1000));
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = path.join(this.mcapDir, file);
          const snapshots = await this.readJsonFile(filePath, []);
          
          if (snapshots.length > 0) {
            const recentSnapshots = snapshots.filter(s => 
              new Date(s.timestamp) >= cutoffDate
            );
            
            if (recentSnapshots.length !== snapshots.length) {
              if (recentSnapshots.length === 0) {
                // Delete empty file
                await fs.unlink(filePath);
              } else {
                // Update file with recent snapshots
                await this.writeJsonFile(filePath, recentSnapshots);
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('❌ Error cleaning up old mcap snapshots:', error.message);
    }
  }
}

export default McapSnapshotService;
