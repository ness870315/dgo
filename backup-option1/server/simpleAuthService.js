/**
 * Simple authentication service for demo/testing purposes
 * Provides basic user management and session handling
 */

class SimpleAuthService {
  constructor() {
    this.users = new Map();
    this.sessions = new Map();
    this.watchlists = new Map(); // userId -> Set of token symbols
    
    // Create some demo users
    this.createDemoUsers();
  }

  createDemoUsers() {
    const demoUsers = [
      { id: 'demo1', username: 'trader1', displayName: 'Crypto Trader', profileImage: null },
      { id: 'demo2', username: 'hodler', displayName: 'Diamond Hands', profileImage: null },
      { id: 'demo3', username: 'analyst', displayName: 'Market Analyst', profileImage: null }
    ];

    demoUsers.forEach(user => {
      this.users.set(user.id, user);
      this.watchlists.set(user.id, new Set(['BONK', 'WIF'])); // Pre-populate with some tokens
    });

    console.log('🎭 Created demo users for testing');
  }

  /**
   * Create or login a demo user
   */
  createOrLoginUser(username) {
    // Check if user already exists
    const existingUser = Array.from(this.users.values()).find(u => u.username === username);
    
    if (existingUser) {
      return this.loginUser(existingUser.id);
    }

    // Create new user
    const userId = `demo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const user = {
      id: userId,
      username: username,
      displayName: username.charAt(0).toUpperCase() + username.slice(1),
      profileImage: null,
      createdAt: new Date().toISOString()
    };

    this.users.set(userId, user);
    this.watchlists.set(userId, new Set()); // Empty watchlist for new users

    console.log(`👤 Created demo user: ${username} (${userId})`);
    return this.loginUser(userId);
  }

  /**
   * Login a user and create session
   */
  loginUser(userId) {
    const user = this.users.get(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const session = {
      id: sessionId,
      userId: userId,
      createdAt: new Date().toISOString(),
      lastAccess: new Date().toISOString()
    };

    this.sessions.set(sessionId, session);
    console.log(`🔐 Demo login: ${user.username} (session: ${sessionId})`);

    return {
      user,
      sessionId,
      authType: 'demo'
    };
  }

  /**
   * Verify session and get user
   */
  verifySession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    // Update last access
    session.lastAccess = new Date().toISOString();
    
    const user = this.users.get(session.userId);
    return user || null;
  }

  /**
   * Logout user (remove session)
   */
  logout(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session) {
      const user = this.users.get(session.userId);
      console.log(`👋 Demo logout: ${user?.username || 'unknown'}`);
      this.sessions.delete(sessionId);
      return true;
    }
    return false;
  }

  /**
   * Get user's watchlist
   */
  getWatchlist(userId) {
    const watchlist = this.watchlists.get(userId);
    return watchlist ? Array.from(watchlist) : [];
  }

  /**
   * Get user's watchlist (alias for backend compatibility)
   */
  getUserWatchlist(userId) {
    return this.getWatchlist(userId);
  }

  /**
   * Add token to user's watchlist
   */
  addToWatchlist(userId, tokenData) {
    if (!this.watchlists.has(userId)) {
      this.watchlists.set(userId, new Set());
    }
    
    // Handle both tokenData object and simple symbol string
    const symbol = typeof tokenData === 'string' ? tokenData : tokenData.symbol;
    
    const watchlist = this.watchlists.get(userId);
    watchlist.add(symbol.toUpperCase());
    
    console.log(`⭐ Added ${symbol} to ${userId}'s watchlist`);
    return { success: true, message: `Added ${symbol} to watchlist` };
  }

  /**
   * Remove token from user's watchlist
   */
  removeFromWatchlist(userId, tokenSymbol) {
    const watchlist = this.watchlists.get(userId);
    if (watchlist) {
      const removed = watchlist.delete(tokenSymbol.toUpperCase());
      if (removed) {
        console.log(`🗑️ Removed ${tokenSymbol} from ${userId}'s watchlist`);
        return { success: true, message: `Removed ${tokenSymbol} from watchlist` };
      }
    }
    return { success: false, message: `${tokenSymbol} not found in watchlist` };
  }

  /**
   * Check if token is in user's watchlist
   */
  isInWatchlist(userId, tokenSymbol) {
    const watchlist = this.watchlists.get(userId);
    return watchlist ? watchlist.has(tokenSymbol.toUpperCase()) : false;
  }

  /**
   * Get user stats
   */
  getStats() {
    return {
      totalUsers: this.users.size,
      activeSessions: this.sessions.size,
      totalWatchlistItems: Array.from(this.watchlists.values()).reduce((total, set) => total + set.size, 0)
    };
  }

  /**
   * Clean up old sessions (for maintenance)
   */
  cleanupSessions(maxAgeHours = 24) {
    const cutoff = new Date(Date.now() - (maxAgeHours * 60 * 60 * 1000));
    let cleaned = 0;

    for (const [sessionId, session] of this.sessions.entries()) {
      if (new Date(session.lastAccess) < cutoff) {
        this.sessions.delete(sessionId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`🧹 Cleaned up ${cleaned} old demo sessions`);
    }

    return cleaned;
  }
}

// Create singleton instance
const simpleAuthService = new SimpleAuthService();

export default simpleAuthService;