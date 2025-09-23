/**
 * Monthly Snapshot Service
 * Captures KOL leaderboard snapshots at the end of each month
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default class MonthlySnapshotService {
  constructor() {
    this.snapshotsDir = path.join(__dirname, 'data', 'monthly-snapshots');
    this.ensureSnapshotsDir();
  }

  async ensureSnapshotsDir() {
    try {
      await fs.mkdir(this.snapshotsDir, { recursive: true });
    } catch (error) {
      console.error('❌ Failed to create snapshots directory:', error);
    }
  }

  /**
   * Get the current month/year key
   */
  getCurrentMonthKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  /**
   * Get the previous month/year key
   */
  getPreviousMonthKey() {
    const now = new Date();
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1);
    return `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}`;
  }

  /**
   * Check if we're on the last day of the month
   */
  isLastDayOfMonth() {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    return now.getMonth() !== tomorrow.getMonth();
  }

  /**
   * Check if it's time to take a snapshot (23:59 on last day of month)
   */
  shouldTakeSnapshot() {
    const now = new Date();
    const isLastDay = this.isLastDayOfMonth();
    const isNearEndOfDay = now.getHours() === 23 && now.getMinutes() >= 59;
    
    return isLastDay && isNearEndOfDay;
  }

  /**
   * Take a snapshot of the current leaderboard
   */
  async takeSnapshot(leaderboardData) {
    try {
      const monthKey = this.getCurrentMonthKey();
      const snapshot = {
        month: monthKey,
        timestamp: new Date().toISOString(),
        leaderboard: leaderboardData,
        metadata: {
          totalUsers: leaderboardData.length,
          generatedAt: new Date().toISOString(),
          version: '1.0'
        }
      };

      const filename = `snapshot-${monthKey}.json`;
      const filepath = path.join(this.snapshotsDir, filename);
      
      await fs.writeFile(filepath, JSON.stringify(snapshot, null, 2));
      
      console.log(`📸 Monthly snapshot taken for ${monthKey}:`, {
        totalUsers: snapshot.metadata.totalUsers,
        timestamp: snapshot.timestamp
      });

      return snapshot;
    } catch (error) {
      console.error('❌ Failed to take monthly snapshot:', error);
      throw error;
    }
  }

  /**
   * Get snapshot for a specific month
   */
  async getSnapshot(monthKey) {
    try {
      const filename = `snapshot-${monthKey}.json`;
      const filepath = path.join(this.snapshotsDir, filename);
      
      const data = await fs.readFile(filepath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log(`📸 No snapshot found for ${monthKey}`);
        return null;
      }
      console.error(`❌ Failed to read snapshot for ${monthKey}:`, error);
      throw error;
    }
  }

  /**
   * Get all available snapshots
   */
  async getAllSnapshots() {
    try {
      const files = await fs.readdir(this.snapshotsDir);
      const snapshotFiles = files.filter(file => file.startsWith('snapshot-') && file.endsWith('.json'));
      
      const snapshots = [];
      for (const file of snapshotFiles) {
        try {
          const filepath = path.join(this.snapshotsDir, file);
          const data = await fs.readFile(filepath, 'utf8');
          const snapshot = JSON.parse(data);
          snapshots.push(snapshot);
        } catch (error) {
          console.error(`❌ Failed to read snapshot file ${file}:`, error);
        }
      }

      // Sort by month (newest first)
      snapshots.sort((a, b) => b.month.localeCompare(a.month));
      
      return snapshots;
    } catch (error) {
      console.error('❌ Failed to get all snapshots:', error);
      return [];
    }
  }

  /**
   * Get leaderboard data for a specific month (snapshot or current)
   */
  async getLeaderboardForMonth(monthKey, currentLeaderboardData) {
    const currentMonth = this.getCurrentMonthKey();
    
    if (monthKey === currentMonth) {
      // Current month - return live data
      return {
        month: monthKey,
        isLive: true,
        timestamp: new Date().toISOString(),
        leaderboard: currentLeaderboardData,
        metadata: {
          totalUsers: currentLeaderboardData.length,
          generatedAt: new Date().toISOString(),
          version: '1.0',
          isLive: true
        }
      };
    } else {
      // Past month - return snapshot data
      const snapshot = await this.getSnapshot(monthKey);
      if (snapshot) {
        return {
          ...snapshot,
          isLive: false
        };
      }
      return null;
    }
  }

  /**
   * Get available months for the leaderboard
   */
  async getAvailableMonths(currentLeaderboardData) {
    const snapshots = await this.getAllSnapshots();
    const currentMonth = this.getCurrentMonthKey();
    
    const months = [];
    
    // Add current month (live)
    months.push({
      key: currentMonth,
      label: this.formatMonthLabel(currentMonth),
      isLive: true,
      hasData: currentLeaderboardData && currentLeaderboardData.length > 0
    });
    
    // Add past months (snapshots)
    for (const snapshot of snapshots) {
      months.push({
        key: snapshot.month,
        label: this.formatMonthLabel(snapshot.month),
        isLive: false,
        hasData: true,
        snapshotDate: snapshot.timestamp
      });
    }
    
    return months;
  }

  /**
   * Format month key to readable label
   */
  formatMonthLabel(monthKey) {
    const [year, month] = monthKey.split('-');
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    
    const monthName = monthNames[parseInt(month) - 1];
    return `${monthName} ${year}`;
  }

  /**
   * Schedule snapshot taking (to be called periodically)
   */
  async checkAndTakeSnapshot(leaderboardData) {
    if (this.shouldTakeSnapshot()) {
      const currentMonth = this.getCurrentMonthKey();
      
      // Check if snapshot already exists for this month
      const existingSnapshot = await this.getSnapshot(currentMonth);
      if (!existingSnapshot) {
        console.log(`📸 Taking end-of-month snapshot for ${currentMonth}...`);
        await this.takeSnapshot(leaderboardData);
        return true;
      } else {
        console.log(`📸 Snapshot already exists for ${currentMonth}`);
      }
    }
    return false;
  }
}
