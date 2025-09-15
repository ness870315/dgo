import axios from 'axios';
import crypto from 'crypto';
import path from 'path';
import HybridDatabaseService from './hybridDatabaseService.js';

class OAuthXService {
  constructor() {
    // X OAuth Credentials
    this.clientId = process.env.X_CLIENT_ID || process.env.TWITTER_CLIENT_ID || '';
    this.clientSecret = process.env.X_CLIENT_SECRET || process.env.TWITTER_CLIENT_SECRET || '';
    this.redirectUri = process.env.X_REDIRECT_URI || `${process.env.API_URL || 'https://api.degen-oracle.com'}/auth/callback`;
    this.scope = process.env.X_SCOPE || 'tweet.read tweet.write users.read follows.read';
    
    // Initialize hybrid database service
    this.db = new HybridDatabaseService();
    
    console.log('🐦 OAuth X Service initialized');
    console.log(`   Client ID: ${this.clientId ? '✅ Set' : '❌ Missing'}`);
    console.log(`   Client Secret: ${this.clientSecret ? '✅ Set' : '❌ Missing'}`);
    console.log(`   Redirect URI: ${this.redirectUri}`);
    if (!this.clientId || !this.clientSecret) {
      console.warn('⚠️ OAuth X credentials are not set via env. Set X_CLIENT_ID and X_CLIENT_SECRET.');
    }
  }

  /**
   * Migrate from old database if it exists
   */
  async migrateFromOldDatabase() {
    try {
      await this.db.migrateFromOldDatabase('./cache/users-database.json');
    } catch (error) {
      console.log('📝 No old database to migrate');
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
   * Store OAuth state for verification
   */
  async storeOAuthState(state, userId) {
    try {
      const stateFile = path.join(this.db.globalDir, 'oauth-states.json');
      let states = await this.db.readJsonFile(stateFile) || {};
      
      states[state] = {
        userId,
        timestamp: Date.now(),
        expiresAt: Date.now() + (10 * 60 * 1000) // 10 minutes
      };
      
      await this.db.writeJsonFile(stateFile, states);
      console.log(`🔐 Stored OAuth state for user ${userId}`);
    } catch (error) {
      console.error('❌ Error storing OAuth state:', error.message);
      throw error;
    }
  }

  /**
   * Verify and consume OAuth state
   */
  async verifyOAuthState(state) {
    try {
      const stateFile = path.join(this.db.globalDir, 'oauth-states.json');
      const states = await this.db.readJsonFile(stateFile) || {};
      
      const stateData = states[state];
      if (!stateData) {
        throw new Error('Invalid OAuth state');
      }
      
      if (Date.now() > stateData.expiresAt) {
        throw new Error('OAuth state expired');
      }
      
      // Remove the used state
      delete states[state];
      await this.db.writeJsonFile(stateFile, states);
      
      return stateData.userId;
    } catch (error) {
      console.error('❌ Error verifying OAuth state:', error.message);
      throw error;
    }
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
   * Post a tweet using user's access token
   */
  async postTweet(userId, text, options = {}) {
    try {
      const user = await this.getUserById(userId);
      if (!user || !user.accessToken) {
        throw new Error('User not found or no access token');
      }

      console.log(`🐦 Attempting to post tweet for user ${userId}:`, {
        userId,
        hasAccessToken: !!user.accessToken,
        tokenLength: user.accessToken?.length,
        textLength: text.length,
        textPreview: text.substring(0, 50) + '...'
      });

      // Try posting with current token
      let response;
      try {
        response = await axios.post('https://api.twitter.com/2/tweets', {
          text: text
        }, {
          headers: {
            'Authorization': `Bearer ${user.accessToken}`,
            'Content-Type': 'application/json'
          }
        });

        console.log(`🐦 Posted tweet for user ${userId}: ${response.data.data.id}`);
        return response.data.data;

      } catch (apiError) {
        console.error('❌ Twitter API error:', {
          status: apiError.response?.status,
          statusText: apiError.response?.statusText,
          data: apiError.response?.data,
          userId
        });

        // If token is invalid (401), try to refresh it
        console.log(`🔍 Debug - User refresh token status:`, {
          userId,
          hasRefreshToken: !!user.refreshToken,
          refreshTokenLength: user.refreshToken?.length,
          status: apiError.response?.status
        });
        
        if (apiError.response?.status === 401 && user.refreshToken) {
          console.log(`🔄 Access token expired for user ${userId}, attempting refresh...`);
          
          try {
            const newTokens = await this.refreshAccessToken(user.refreshToken);
            
            // Update user with new tokens
            await this.db.updateUserTokens(userId, newTokens.access_token, newTokens.refresh_token);
            
            console.log(`✅ Refreshed tokens for user ${userId}, retrying tweet...`);
            
            // Retry with new token
            response = await axios.post('https://api.twitter.com/2/tweets', {
              text: text
            }, {
              headers: {
                'Authorization': `Bearer ${newTokens.access_token}`,
                'Content-Type': 'application/json'
              }
            });

            console.log(`🐦 Posted tweet with refreshed token for user ${userId}: ${response.data.data.id}`);
            return response.data.data;

          } catch (refreshError) {
            console.error('❌ Token refresh failed:', refreshError.message);
            throw new Error(`Twitter posting failed: Token expired and refresh failed - ${refreshError.message}`);
          }
        }

        // If no refresh token available for 401 error
        if (apiError.response?.status === 401 && !user.refreshToken) {
          console.error(`❌ Access token expired for user ${userId} but no refresh token available`);
          throw new Error(`Twitter posting failed: Access token expired and no refresh token available. User needs to re-authenticate.`);
        }

        // If not a token issue or refresh not available, throw original error
        throw new Error(`Twitter API error: ${apiError.response?.status} - ${JSON.stringify(apiError.response?.data)}`);
      }

    } catch (error) {
      console.error('❌ Error posting tweet:', error.message);
      console.error('❌ Failed to post tweet for', { userId, error: error.message });
      throw error;
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(refreshToken) {
    try {
      console.log('🔄 Refreshing Twitter access token...');
      
      const response = await axios.post('https://api.twitter.com/2/oauth2/token', {
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: this.clientId
      }, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')}`
        }
      });

      console.log('✅ Successfully refreshed Twitter access token');
      return response.data;

    } catch (error) {
      console.error('❌ Failed to refresh Twitter token:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Check if user has Twitter posting enabled
   */
  async hasTwitterPostingEnabled(userId) {
    try {
      const user = await this.getUserById(userId);
      return !!(user && user.twitterPostingEnabled);
    } catch (error) {
      console.error('❌ Error checking Twitter posting status:', error.message);
      return false;
    }
  }

  /**
   * Enable/disable Twitter posting for user
   */
  async setTwitterPostingEnabled(userId, enabled) {
    try {
      const user = await this.getUserById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Use the existing updateUser method instead of non-existent saveUser
      await this.updateUser(userId, { twitterPostingEnabled: enabled });
      
      console.log(`🐦 Twitter posting ${enabled ? 'enabled' : 'disabled'} for user ${userId}`);
      return true;
    } catch (error) {
      console.error('❌ Error setting Twitter posting status:', error.message);
      throw error;
    }
  }

  /**
   * Create or update user in database
   */
  async createOrUpdateUser(profile, accessToken, refreshToken) {
    return await this.db.createOrUpdateUser(profile, accessToken, refreshToken);
  }

  /**
   * Create user session
   */
  async createSession(userId) {
    return await this.db.createSession(userId);
  }

  /**
   * Validate session
   */
  async validateSession(sessionId) {
    return await this.db.validateSession(sessionId);
  }

  /**
   * Get user by session ID
   */
  async getUserBySession(sessionId) {
    return await this.db.getUserBySession(sessionId);
  }

  /**
   * Logout user
   */
  async logout(sessionId) {
    return await this.db.logout(sessionId);
  }

  /**
   * Get user by ID
   */
  async getUserById(userId) {
    return await this.db.getUserProfile(userId);
  }

  /**
   * Update user data
   */
  async updateUser(userId, updates) {
    const profileFile = this.db.getUserFile(userId, 'profile.json');
    const user = await this.db.readJsonFile(profileFile);
    if (!user) {
      return null;
    }

    const updatedUser = { ...user, ...updates, lastUpdated: new Date().toISOString() };
    await this.db.writeJsonFile(profileFile, updatedUser);
    await this.db.updateUserIndex(userId, {
      username: updatedUser.username,
      displayName: updatedUser.displayName,
      lastLogin: updatedUser.lastLogin,
      referralCode: updatedUser.referralCode
    });

    return updatedUser;
  }

  /**
   * Add token to user's watchlist
   */
  async addToWatchlist(userId, tokenData) {
    return await this.db.addToWatchlist(userId, tokenData);
  }

  /**
   * Remove token from user's watchlist
   */
  async removeFromWatchlist(userId, symbol, contractAddress) {
    return await this.db.removeFromWatchlist(userId, symbol, contractAddress);
  }

  /**
   * Get user's watchlist
   */
  async getWatchlist(userId) {
    return await this.db.getUserWatchlist(userId);
  }

  /**
   * Check if token is in user's watchlist
   */
  async isInWatchlist(userId, symbol, contractAddress) {
    return await this.db.isInWatchlist(userId, symbol, contractAddress);
  }

  /**
   * Get service statistics
   */
  async getStats() {
    return await this.db.getStats();
  }

  /**
   * Clean up expired sessions
   */
  async cleanupExpiredSessions() {
    return await this.db.cleanupExpiredSessions();
  }
}

export default OAuthXService;
