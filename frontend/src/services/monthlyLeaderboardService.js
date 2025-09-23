/**
 * Monthly Leaderboard Service
 * Handles fetching historical and current month leaderboard data
 */

const API_BASE = process.env.REACT_APP_API_BASE || 'https://api.degen-oracle.com';

class MonthlyLeaderboardService {
  /**
   * Get available months for leaderboard
   */
  async getAvailableMonths() {
    try {
      const response = await fetch(`${API_BASE}/api/leaderboard/months`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('❌ Failed to fetch available months:', error);
      throw error;
    }
  }

  /**
   * Get leaderboard data for a specific month
   */
  async getLeaderboardForMonth(monthKey) {
    try {
      const response = await fetch(`${API_BASE}/api/leaderboard/monthly/${monthKey}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        if (response.status === 404) {
          return null; // No data for this month
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error(`❌ Failed to fetch leaderboard for month ${monthKey}:`, error);
      throw error;
    }
  }

  /**
   * Take a manual snapshot (admin only)
   */
  async takeSnapshot() {
    try {
      const response = await fetch(`${API_BASE}/api/admin/take-snapshot`, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('❌ Failed to take snapshot:', error);
      throw error;
    }
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
   * Get current month key
   */
  getCurrentMonthKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  /**
   * Get previous month key
   */
  getPreviousMonthKey() {
    const now = new Date();
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1);
    return `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}`;
  }

  /**
   * Check if a month is the current month
   */
  isCurrentMonth(monthKey) {
    return monthKey === this.getCurrentMonthKey();
  }
}

export default new MonthlyLeaderboardService();
