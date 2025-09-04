import axios from 'axios';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

class OAuthXService {
  constructor() {
    // X OAuth Credentials
    this.clientId = 'bWpzSFQ4M3k4VE1OeWRpVE8yTjY6MTpjaQ';
    this.clientSecret = 'ucnr-DcJkNx9RSYexiqW3Jv4wF4Ll6XLBJesRB7i0SN8VHXman';
    this.redirectUri = process.env.X_REDIRECT_URI || `${process.env.API_URL || 'https://api.degen-oracle.com'}/auth/callback`;
    this.scope = 'tweet.read users.read follows.read';
    
    // User database file
    this.usersDbFile = './cache/users-database.json';
    this.users = new Map();
    
    // Session management
    this.sessions = new Map();
    this.sessionTimeout = 24 * 60 * 60 * 1000; // 24 hours
    
    console.log('🐦 OAuth X Service initialized');
    console.log(`   Client ID: ${this.clientId ? '✅ Set' : '❌ Missing'}`);
    console.log(`   Client Secret: ${this.clientSecret ? '✅ Set' : '❌ Missing'}`);
    console.log(`   Redirect URI: ${this.redirectUri}`);
    
    this.loadUsersDatabase();
  }

  /**
   * Load users database from file
   */
  async loadUsersDatabase() {
    try {
      const data = await fs.readFile(this.usersDbFile, 'utf8');
      const usersData = JSON.parse(data);
      
      // Convert array back to Map
      this.users = new Map(usersData.users || []);
      this.sessions = new Map(usersData.sessions || []);
      
      console.log(`📊 Loaded ${this.users.size} users from database`);
    } catch (error) {
      console.log('📝 Creating new users database...');
      await this.saveUsersDatabase();
    }
  }

  /**
   * Save users database to file
   */
  async saveUsersDatabase() {
    try {
      const data = {
        users: Array.from(this.users.entries()),
        sessions: Array.from(this.sessions.entries()),
        lastUpdated: new Date().toISOString()
      };
      
      console.log(`💾 Attempting to save ${this.users.size} users to: ${this.usersDbFile}`);
      await fs.writeFile(this.usersDbFile, JSON.stringify(data, null, 2));
      console.log(`✅ Successfully saved ${this.users.size} users to database`);
    } catch (error) {
      console.error('❌ Error saving users database:', error);
      console.error('❌ File path:', this.usersDbFile);
      console.error('❌ Current working directory:', process.cwd());
    }
  }

  /**
   * Generate OAuth authorization URL
   */
  getAuthorizationUrl(state) {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      scope: this.scope,
      state: state,
      code_challenge: this.generateCodeChallenge(state),
      code_challenge_method: 'S256'
    });

    return `https://twitter.com/i/oauth2/authorize?${params.toString()}`;
  }

  /**
   * Generate PKCE code challenge
   */
  generateCodeChallenge(codeVerifier) {
    return crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(code, codeVerifier) {
    try {
      const response = await axios.post('https://api.twitter.com/2/oauth2/token', {
        code: code,
        grant_type: 'authorization_code',
        client_id: this.clientId,
        redirect_uri: this.redirectUri,
        code_verifier: codeVerifier
      }, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')}`
        }
      });

      return response.data;
    } catch (error) {
      console.error('❌ Error exchanging code for token:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Get user profile from X API
   */
  async getUserProfile(accessToken) {
    try {
      const response = await axios.get('https://api.twitter.com/2/users/me', {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        },
        params: {
          'user.fields': 'id,username,name,profile_image_url,public_metrics,verified'
        }
      });

      return response.data.data;
    } catch (error) {
      console.error('❌ Error getting user profile:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Generate a unique referral code
   */
  generateReferralCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 8; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  /**
   * Create or update user in database
   */
  async createOrUpdateUser(profile, accessToken, refreshToken) {
    const userId = profile.id;
    const existingUser = this.users.get(userId);

    const userData = {
      id: userId,
      username: profile.username,
      displayName: profile.name,
      profileImage: profile.profile_image_url,
      verified: profile.verified || false,
      followersCount: profile.public_metrics?.followers_count || 0,
      followingCount: profile.public_metrics?.following_count || 0,
      tweetCount: profile.public_metrics?.tweet_count || 0,
      accessToken: accessToken,
      refreshToken: refreshToken,
      createdAt: existingUser?.createdAt || new Date().toISOString(),
      lastLogin: new Date().toISOString(),
      // Generate referral code for new users
      referralCode: existingUser?.referralCode || this.generateReferralCode(),
      // User-specific data
      watchlist: existingUser?.watchlist || [],
      preferences: existingUser?.preferences || {
        theme: 'dark',
        notifications: true,
        defaultView: 'bubble'
      },
      stats: existingUser?.stats || {
        tokensListed: 0,
        tokensFueled: 0,
        tokensUpdated: 0,
        totalSpent: 0
      }
    };

    this.users.set(userId, userData);
    console.log(`👤 User ${userData.username} ${existingUser ? 'updated' : 'created'} with referral code: ${userData.referralCode}`);
    await this.saveUsersDatabase();

    console.log(`✅ User ${userData.username} ${existingUser ? 'updated' : 'created'}`);
    return userData;
  }

  /**
   * Create user session
   */
  createSession(userId) {
    const sessionId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + this.sessionTimeout);

    this.sessions.set(sessionId, {
      userId: userId,
      createdAt: new Date().toISOString(),
      expiresAt: expiresAt.toISOString(),
      lastActivity: new Date().toISOString()
    });

    return { sessionId, expiresAt };
  }

  /**
   * Validate session
   */
  validateSession(sessionId) {
    const session = this.sessions.get(sessionId);
    
    if (!session) {
      return null;
    }

    if (new Date() > new Date(session.expiresAt)) {
      this.sessions.delete(sessionId);
      return null;
    }

    // Update last activity
    session.lastActivity = new Date().toISOString();
    return session;
  }

  /**
   * Get user by session ID
   */
  getUserBySession(sessionId) {
    const session = this.validateSession(sessionId);
    if (!session) {
      return null;
    }

    return this.users.get(session.userId);
  }

  /**
   * Logout user
   */
  logout(sessionId) {
    this.sessions.delete(sessionId);
    console.log(`👋 User logged out (session: ${sessionId})`);
  }

  /**
   * Get user by ID
   */
  getUserById(userId) {
    return this.users.get(userId);
  }

  /**
   * Update user data
   */
  async updateUser(userId, updates) {
    const user = this.users.get(userId);
    if (!user) {
      return null;
    }

    const updatedUser = { ...user, ...updates, lastUpdated: new Date().toISOString() };
    this.users.set(userId, updatedUser);
    await this.saveUsersDatabase();

    return updatedUser;
  }

  /**
   * Add token to user's watchlist
   */
  async addToWatchlist(userId, tokenData) {
    const user = this.users.get(userId);
    if (!user) {
      return null;
    }

    // Check if token already in watchlist
    const existingIndex = user.watchlist.findIndex(item => item.symbol === tokenData.symbol);
    
    if (existingIndex >= 0) {
      // Update existing entry
      user.watchlist[existingIndex] = {
        ...user.watchlist[existingIndex],
        ...tokenData,
        addedAt: user.watchlist[existingIndex].addedAt,
        updatedAt: new Date().toISOString()
      };
    } else {
      // Add new entry
      user.watchlist.push({
        ...tokenData,
        addedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }

    await this.updateUser(userId, { watchlist: user.watchlist });
    return user.watchlist;
  }

  /**
   * Remove token from user's watchlist
   */
  async removeFromWatchlist(userId, symbol) {
    const user = this.users.get(userId);
    if (!user) {
      return null;
    }

    user.watchlist = user.watchlist.filter(item => item.symbol !== symbol);
    await this.updateUser(userId, { watchlist: user.watchlist });
    return user.watchlist;
  }

  /**
   * Get user's watchlist
   */
  getWatchlist(userId) {
    const user = this.users.get(userId);
    return user?.watchlist || [];
  }

  /**
   * Check if token is in user's watchlist
   */
  isInWatchlist(userId, symbol) {
    const user = this.users.get(userId);
    return user?.watchlist?.some(item => item.symbol === symbol) || false;
  }

  /**
   * Get service statistics
   */
  getStats() {
    return {
      totalUsers: this.users.size,
      activeSessions: this.sessions.size,
      lastUpdated: new Date().toISOString()
    };
  }

  /**
   * Clean up expired sessions
   */
  cleanupExpiredSessions() {
    const now = new Date();
    let cleaned = 0;

    for (const [sessionId, session] of this.sessions.entries()) {
      if (now > new Date(session.expiresAt)) {
        this.sessions.delete(sessionId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`🧹 Cleaned up ${cleaned} expired sessions`);
    }
  }
}

export default OAuthXService;
