class PriorityService {
  constructor() {
    this.API_BASE = process.env.REACT_APP_API_BASE_URL || 'https://api.degen-oracle.com';
    this.viewedTokens = new Set(); // Track tokens viewed in this session
    this.boostCooldown = new Map(); // Prevent spam boosting
  }

  /**
   * Boost token priority when user views it (debounced)
   */
  async boostTokenOnView(contractAddress, symbol = '') {
    try {
      // Prevent duplicate boosts for the same token in a short time
      const cooldownKey = `view_${contractAddress}`;
      const lastBoost = this.boostCooldown.get(cooldownKey);
      const now = Date.now();
      
      if (lastBoost && (now - lastBoost) < 300000) { // 5 minute cooldown
        return;
      }
      
      // Only boost if not viewed in this session
      if (this.viewedTokens.has(contractAddress)) {
        return;
      }
      
      this.viewedTokens.add(contractAddress);
      this.boostCooldown.set(cooldownKey, now);
      
      const response = await fetch(`${this.API_BASE}/api/tokens/boost-priority`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          contractAddress, 
          durationMs: 1800000 // 30 minutes for view boost
        })
      });
      
    } catch (error) {
      console.error('Priority boost on view failed:', error);
    }
  }

  /**
   * Boost token priority when user adds to watchlist
   */
  async boostTokenOnWatchlist(contractAddress, symbol = '') {
    try {
      const cooldownKey = `watchlist_${contractAddress}`;
      const lastBoost = this.boostCooldown.get(cooldownKey);
      const now = Date.now();
      
      if (lastBoost && (now - lastBoost) < 600000) { // 10 minute cooldown
        return;
      }
      
      this.boostCooldown.set(cooldownKey, now);
      
      const response = await fetch(`${this.API_BASE}/api/tokens/boost-priority`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          contractAddress, 
          durationMs: 3600000 // 1 hour for watchlist boost
        })
      });
      
    } catch (error) {
      console.error('Priority boost on watchlist failed:', error);
    }
  }

  /**
   * Get priority statistics for monitoring
   */
  async getPriorityStats() {
    try {
      const response = await fetch(`${this.API_BASE}/api/tokens/priority-stats`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json();
      return result.data;
    } catch (error) {
      console.error('Failed to get priority stats:', error);
      return null;
    }
  }

  /**
   * Clear session tracking (e.g., on page refresh)
   */
  clearSession() {
    this.viewedTokens.clear();
    // Keep cooldown to prevent abuse
  }
}

const priorityService = new PriorityService();
export default priorityService;
