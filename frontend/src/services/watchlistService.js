class WatchlistService {
  constructor() {
    this.API_BASE = process.env.REACT_APP_API_BASE_URL || 'https://api.degen-oracle.com';
  }

  // Get auth headers
  getAuthHeaders() {
    const token = localStorage.getItem('authToken');
    const sessionId = localStorage.getItem('sessionId');
    const demoSessionId = localStorage.getItem('demoSessionId');
    const authType = localStorage.getItem('authType');
    
    const headers = {
      'Content-Type': 'application/json',
    };
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    if (authType === 'demo' && demoSessionId) {
      headers['X-Session-Id'] = demoSessionId;
    } else if (sessionId) {
      headers['X-Session-Id'] = sessionId;
    }
    
    return headers;
  }

  // Get user's watchlist
  async getWatchlist() {
    try {
      const sessionId = localStorage.getItem('sessionId');
      const response = await fetch(`${this.API_BASE}/api/user/watchlist?sessionId=${encodeURIComponent(sessionId || '')}`, {
        credentials: 'include',
        headers: this.getAuthHeaders()
      });

      if (!response.ok) {
        throw new Error('Failed to fetch watchlist');
      }

      const result = await response.json();
      // Backend returns { success, watchlist: [...] }
      return result.watchlist || [];
    } catch (error) {
      console.error('Error fetching watchlist:', error);
      throw error;
    }
  }

  // Add token to watchlist
  async addToWatchlist(tokenData) {
    try {
      const sessionId = localStorage.getItem('sessionId');
      const response = await fetch(`${this.API_BASE}/api/user/watchlist/add`, {
        method: 'POST',
        credentials: 'include',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ sessionId, tokenData })
      });

      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.message || 'Failed to add to watchlist');
      }

      return result;
    } catch (error) {
      console.error('Error adding to watchlist:', error);
      throw error;
    }
  }

  // Remove token from watchlist
  async removeFromWatchlist(symbol) {
    try {
      const sessionId = localStorage.getItem('sessionId');
      const response = await fetch(`${this.API_BASE}/api/user/watchlist/remove`, {
        method: 'POST',
        credentials: 'include',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ sessionId, symbol })
      });

      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.message || 'Failed to remove from watchlist');
      }

      return result;
    } catch (error) {
      console.error('Error removing from watchlist:', error);
      throw error;
    }
  }

  // Check if token is in watchlist
  async isInWatchlist(symbol) {
    try {
      const sessionId = localStorage.getItem('sessionId');
      const response = await fetch(`${this.API_BASE}/api/user/watchlist/check/${encodeURIComponent(symbol)}?sessionId=${encodeURIComponent(sessionId || '')}`, {
        credentials: 'include',
        headers: this.getAuthHeaders()
      });

      if (!response.ok) {
        throw new Error('Failed to check watchlist');
      }

      const result = await response.json();
      return !!result.isInWatchlist;
    } catch (error) {
      console.error('Error checking watchlist:', error);
      return false;
    }
  }

  // Get watchlist stats (admin)
  async getStats() {
    try {
      const response = await fetch(`${this.API_BASE}/api/admin/stats`, {
        credentials: 'include',
        headers: this.getAuthHeaders()
      });

      if (!response.ok) {
        throw new Error('Failed to fetch stats');
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching stats:', error);
      throw error;
    }
  }
}

const watchlistService = new WatchlistService();
export default watchlistService;
