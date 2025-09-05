import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

/**
 * Hybrid Database Service
 * 
 * Architecture:
 * - data/users/ - User-specific data directories
 * - data/global/ - Global data files
 * - data/cache/ - Cached data (existing)
 * 
 * User Directory Structure:
 * - user-{userId}/profile.json - User profile data
 * - user-{userId}/watchlist.json - User's watchlist
 * - user-{userId}/premium.json - Premium features & subscription
 * - user-{userId}/referral.json - Referral data & earnings
 * - user-{userId}/activity.json - User activity logs
 * 
 * Global Files:
 * - global/users-index.json - User index for quick lookups
 * - global/sessions.json - Active sessions
 * - global/referral-codes.json - Referral code registry
 * - global/analytics.json - Global analytics
 */
class HybridDatabaseService {
  constructor() {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    // Prefer persistent disk if available; fallback to local data dir
    const preferredDir = process.env.DATA_DIR || '/var/data/dgo';
    let chosenDir = preferredDir;
    try {
      fsSync.mkdirSync(chosenDir, { recursive: true });
    } catch (_) {
      chosenDir = path.join(__dirname, 'data');
      try { fsSync.mkdirSync(chosenDir, { recursive: true }); } catch (_) {}
      console.warn(`⚠️ Using non-persistent data directory: ${chosenDir}`);
    }
    this.baseDir = chosenDir;
    this.usersDir = path.join(this.baseDir, 'users');
    this.globalDir = path.join(this.baseDir, 'global');
    this.cacheDir = path.join(this.baseDir, 'cache');
    
    // Ensure directories exist
    this.initializeDirectories();

    // Attempt one-time migration from legacy local data dir if present and target is empty
    this.migrateLegacyDataDir(path.join(__dirname, 'data')).catch(() => {});
    
    console.log('🗄️ Hybrid Database Service initialized');
    console.log(`   Users: ${this.usersDir}`);
    console.log(`   Global: ${this.globalDir}`);
    console.log(`   Cache: ${this.cacheDir}`);
  }

  /**
   * Initialize all required directories
   */
  async initializeDirectories() {
    const dirs = [this.baseDir, this.usersDir, this.globalDir, this.cacheDir];
    
    for (const dir of dirs) {
      try {
        await fs.mkdir(dir, { recursive: true });
      } catch (error) {
        // Directory might already exist, that's fine
      }
    }
  }

  /**
   * Migrate existing data from legacy local dir to the persistent baseDir if target is empty
   */
  async migrateLegacyDataDir(legacyDir) {
    try {
      // If legacy equals base, skip
      if (!legacyDir || path.resolve(legacyDir) === path.resolve(this.baseDir)) return;

      // Legacy must exist
      try { await fs.access(legacyDir); } catch (_) { return; }

      // If users dir already has content, skip
      let hasUsers = false;
      try {
        const entries = await fs.readdir(this.usersDir);
        hasUsers = entries && entries.length > 0;
      } catch (_) {}
      if (hasUsers) return;

      // Copy legacy data to persistent base dir
      await fs.cp(legacyDir, this.baseDir, { recursive: true, force: false, errorOnExist: false });
      console.log(`🔁 Migrated legacy data directory from ${legacyDir} → ${this.baseDir}`);
    } catch (err) {
      console.warn(`⚠️ Legacy data migration skipped: ${err.message}`);
    }
  }

  /**
   * Get user directory path
   */
  getUserDir(userId) {
    return path.join(this.usersDir, `user-${userId}`);
  }

  /**
   * Get user file path
   */
  getUserFile(userId, filename) {
    return path.join(this.getUserDir(userId), filename);
  }

  /**
   * Get global file path
   */
  getGlobalFile(filename) {
    return path.join(this.globalDir, filename);
  }

  /**
   * Ensure user directory exists
   */
  async ensureUserDir(userId) {
    const userDir = this.getUserDir(userId);
    try {
      // Check if directory exists first
      await fs.access(userDir);
      // Exists – don't log as created
    } catch (_) {
      // Doesn't exist – create and log
      try {
        await fs.mkdir(userDir, { recursive: true });
        console.log(`📁 Created user directory: ${userDir}`);
      } catch (error) {
        if (error.code !== 'EEXIST') {
          console.error(`❌ Error creating user directory ${userDir}:`, error.message);
          throw error;
        }
      }
    }
    return userDir;
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
   * Create or update user profile
   */
  async createOrUpdateUser(profile, accessToken, refreshToken) {
    const userId = profile.id;
    const userDir = await this.ensureUserDir(userId);
    
    // Load existing profile or create new one
    const profileFile = this.getUserFile(userId, 'profile.json');
    const existingProfile = await this.readJsonFile(profileFile, {});
    
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
      createdAt: existingProfile.createdAt || new Date().toISOString(),
      lastLogin: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      // Generate referral code for new users
      referralCode: existingProfile.referralCode || this.generateReferralCode(),
      // User preferences
      preferences: existingProfile.preferences || {
        theme: 'dark',
        notifications: true,
        defaultView: 'bubble'
      },
      // User stats
      stats: existingProfile.stats || {
        tokensListed: 0,
        tokensFueled: 0,
        tokensUpdated: 0,
        totalSpent: 0
      }
    };

    // Save user profile
    await this.writeJsonFile(profileFile, userData);
    
    // Update global user index
    await this.updateUserIndex(userId, {
      username: userData.username,
      displayName: userData.displayName,
      lastLogin: userData.lastLogin,
      referralCode: userData.referralCode
    });

    // Initialize other user files if they don't exist
    await this.initializeUserFiles(userId);

    console.log(`✅ User ${userData.username} ${existingProfile.id ? 'updated' : 'created'}`);
    return userData;
  }

  /**
   * Initialize user files if they don't exist
   */
  async initializeUserFiles(userId) {
    const files = [
      { name: 'watchlist.json', data: [] },
      { name: 'kol-calls.json', data: [] },
      { name: 'premium.json', data: { 
        isPremium: false, 
        subscriptionType: null, 
        expiresAt: null,
        features: []
      }},
      { name: 'referral.json', data: { 
        code: null, 
        referredBy: null, 
        referrals: [], 
        earnings: 0 
      }},
      { name: 'activity.json', data: { 
        loginHistory: [], 
        actions: [], 
        lastActivity: null 
      }}
    ];

    for (const file of files) {
      const filePath = this.getUserFile(userId, file.name);
      const existing = await this.readJsonFile(filePath);
      if (!existing) {
        await this.writeJsonFile(filePath, file.data);
      }
    }
  }

  /**
   * Get user's KOL calls
   */
  async getKolCalls(userId) {
    const file = this.getUserFile(userId, 'kol-calls.json');
    return await this.readJsonFile(file, []);
  }

  /**
   * Add a KOL call
   */
  async addKolCall(userId, call) {
    await this.ensureUserDir(userId);
    const file = this.getUserFile(userId, 'kol-calls.json');
    const calls = await this.readJsonFile(file, []);
    const toSave = {
      id: crypto.randomUUID(),
      ...call,
      // Initialize tracking fields
      athMC: call.calledMc || 0, // ATH starts at called MC
      athTimestamp: call.calledAt || new Date().toISOString(),
      maxDrawdownPct: 0, // No drawdown at start
      peakMC: call.calledMc || 0, // Rolling peak starts at called MC
      createdAt: new Date().toISOString()
    };
    calls.push(toSave);
    await this.writeJsonFile(file, calls);
    return toSave;
  }

  /**
   * Delete a KOL call by id
   */
  async deleteKolCall(userId, callId) {
    await this.ensureUserDir(userId);
    const file = this.getUserFile(userId, 'kol-calls.json');
    const calls = await this.readJsonFile(file, []);
    const filtered = (calls || []).filter(c => c.id !== callId);
    await this.writeJsonFile(file, filtered);
    return { removed: (calls || []).length - filtered.length };
  }

  /**
   * Update KOL call with new market cap data (for ATH and drawdown tracking)
   */
  async updateKolCallMC(userId, contractAddress, currentMC, holderCount = null) {
    await this.ensureUserDir(userId);
    const file = this.getUserFile(userId, 'kol-calls.json');
    const calls = await this.readJsonFile(file, []);
    let updated = 0;

    calls.forEach(call => {
      if (call.token?.contractAddress === contractAddress) {
        const oldCurrentMC = call.currentMC || call.calledMc || 0;
        call.currentMC = currentMC;
        call.lastUpdated = new Date().toISOString();

        // Update holder count if provided
        if (holderCount !== null && holderCount !== undefined) {
          call.holderCount = holderCount;
        }

        // Update ATH if current MC is higher
        if (currentMC > (call.athMC || 0)) {
          call.athMC = currentMC;
          call.athTimestamp = new Date().toISOString();
        }

        // Update rolling peak for drawdown calculation
        const currentPeak = Math.max(call.peakMC || call.calledMc || 0, currentMC);
        call.peakMC = currentPeak;

        // Calculate max drawdown from rolling peak
        if (currentPeak > 0) {
          const currentDrawdownPct = ((currentMC - currentPeak) / currentPeak) * 100;
          // Max drawdown is the worst (most negative) drawdown we've seen
          call.maxDrawdownPct = Math.min(call.maxDrawdownPct || 0, currentDrawdownPct);
        }

        updated++;
      }
    });

    if (updated > 0) {
      await this.writeJsonFile(file, calls);
    }

    return { updated };
  }

  /**
   * Get all KOL calls that need MC updates (have contract addresses)
   */
  async getAllKolCallsForMCUpdate() {
    const indexFile = this.getGlobalFile('users-index.json');
    const userIndex = await this.readJsonFile(indexFile, {});
    const callsToUpdate = [];

    for (const userId of Object.keys(userIndex)) {
      const calls = await this.getKolCalls(userId);
      calls.forEach(call => {
        if (call.token?.contractAddress) {
          callsToUpdate.push({
            userId,
            callId: call.id,
            contractAddress: call.token.contractAddress,
            symbol: call.token.symbol || 'UNKNOWN'
          });
        }
      });
    }

    return callsToUpdate;
  }

  /**
   * Update global user index
   */
  async updateUserIndex(userId, userInfo) {
    const indexFile = this.getGlobalFile('users-index.json');
    const index = await this.readJsonFile(indexFile, {});
    
    index[userId] = {
      ...userInfo,
      lastUpdated: new Date().toISOString()
    };

    await this.writeJsonFile(indexFile, index);
  }

  /**
   * Get user profile
   */
  async getUserProfile(userId) {
    const profileFile = this.getUserFile(userId, 'profile.json');
    return await this.readJsonFile(profileFile);
  }

  /**
   * Get all users (for priority queue calculations)
   */
  async getAllUsers() {
    try {
      const userIndex = await this.readJsonFile(this.getGlobalFile('users-index.json'), {});
      const users = [];
      
      for (const userId in userIndex) {
        try {
          const profile = await this.getUserProfile(userId);
          if (profile) {
            users.push(profile);
          }
        } catch (error) {
          console.error(`[🗃️ Database] ⚠️ Failed to load profile for user ${userId}:`, error.message);
        }
      }
      
      return users;
    } catch (error) {
      console.error('[🗃️ Database] ❌ Failed to get all users:', error.message);
      return [];
    }
  }

  /**
   * Get user watchlist
   */
  async getUserWatchlist(userId) {
    const watchlistFile = this.getUserFile(userId, 'watchlist.json');
    return await this.readJsonFile(watchlistFile, []);
  }

  /**
   * Add token to watchlist
   */
  async addToWatchlist(userId, tokenData) {
    const watchlist = await this.getUserWatchlist(userId);
    
    // Check if token already exists (prefer contractAddress when provided)
    const existingIndex = watchlist.findIndex(item => {
      if (tokenData.contractAddress && item.contractAddress) {
        return item.contractAddress === tokenData.contractAddress;
      }
      return item.symbol === tokenData.symbol;
    });
    
    if (existingIndex >= 0) {
      // Update existing entry
      watchlist[existingIndex] = {
        ...watchlist[existingIndex],
        ...tokenData,
        addedAt: watchlist[existingIndex].addedAt,
        updatedAt: new Date().toISOString()
      };
    } else {
      // Add new entry
      watchlist.push({
        ...tokenData,
        addedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }

    const watchlistFile = this.getUserFile(userId, 'watchlist.json');
    await this.writeJsonFile(watchlistFile, watchlist);
    
    return watchlist;
  }

  /**
   * Remove token from watchlist
   */
  async removeFromWatchlist(userId, symbol, contractAddress) {
    const watchlist = await this.getUserWatchlist(userId);
    const filtered = watchlist.filter(item => {
      if (contractAddress && item.contractAddress) {
        return item.contractAddress !== contractAddress;
      }
      return item.symbol !== symbol;
    });
    
    const watchlistFile = this.getUserFile(userId, 'watchlist.json');
    await this.writeJsonFile(watchlistFile, filtered);
    
    return filtered;
  }

  /**
   * Check if token is in watchlist
   */
  async isInWatchlist(userId, symbol, contractAddress) {
    const watchlist = await this.getUserWatchlist(userId);
    return watchlist.some(item => {
      if (contractAddress && item.contractAddress) {
        return item.contractAddress === contractAddress;
      }
      return item.symbol === symbol;
    });
  }

  /**
   * Create user session
   */
  async createSession(userId) {
    const sessionId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours

    const session = {
      sessionId,
      userId,
      createdAt: new Date().toISOString(),
      expiresAt: expiresAt.toISOString(),
      lastActivity: new Date().toISOString()
    };

    // Save to global sessions file
    const sessionsFile = this.getGlobalFile('sessions.json');
    const sessions = await this.readJsonFile(sessionsFile, {});
    sessions[sessionId] = session;
    await this.writeJsonFile(sessionsFile, sessions);

    return { sessionId, expiresAt };
  }

  /**
   * Validate session
   */
  async validateSession(sessionId) {
    const sessionsFile = this.getGlobalFile('sessions.json');
    const sessions = await this.readJsonFile(sessionsFile, {});
    const session = sessions[sessionId];
    
    if (!session) {
      return null;
    }

    if (new Date() > new Date(session.expiresAt)) {
      // Session expired, remove it
      delete sessions[sessionId];
      await this.writeJsonFile(sessionsFile, sessions);
      return null;
    }

    // Update last activity
    session.lastActivity = new Date().toISOString();
    sessions[sessionId] = session;
    await this.writeJsonFile(sessionsFile, sessions);

    return session;
  }

  /**
   * Get user by session
   */
  async getUserBySession(sessionId) {
    const session = await this.validateSession(sessionId);
    if (!session) {
      return null;
    }

    return await this.getUserProfile(session.userId);
  }

  /**
   * Logout user
   */
  async logout(sessionId) {
    const sessionsFile = this.getGlobalFile('sessions.json');
    const sessions = await this.readJsonFile(sessionsFile, {});
    delete sessions[sessionId];
    await this.writeJsonFile(sessionsFile, sessions);
    
    console.log(`👋 User logged out (session: ${sessionId})`);
  }

  /**
   * Generate referral code
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
   * Get service statistics
   */
  async getStats() {
    const indexFile = this.getGlobalFile('users-index.json');
    const sessionsFile = this.getGlobalFile('sessions.json');
    
    const users = await this.readJsonFile(indexFile, {});
    const sessions = await this.readJsonFile(sessionsFile, {});
    
    return {
      totalUsers: Object.keys(users).length,
      activeSessions: Object.keys(sessions).length,
      lastUpdated: new Date().toISOString()
    };
  }

  /**
   * Clean up expired sessions
   */
  async cleanupExpiredSessions() {
    const sessionsFile = this.getGlobalFile('sessions.json');
    const sessions = await this.readJsonFile(sessionsFile, {});
    const now = new Date();
    let cleaned = 0;

    for (const [sessionId, session] of Object.entries(sessions)) {
      if (now > new Date(session.expiresAt)) {
        delete sessions[sessionId];
        cleaned++;
      }
    }

    if (cleaned > 0) {
      await this.writeJsonFile(sessionsFile, sessions);
      console.log(`🧹 Cleaned up ${cleaned} expired sessions`);
    }
  }

  /**
   * Migrate from old database format
   */
  async migrateFromOldDatabase(oldDbFile) {
    try {
      const oldData = await this.readJsonFile(oldDbFile);
      if (!oldData || !oldData.users) {
        console.log('📝 No old database to migrate');
        return;
      }

      console.log(`🔄 Migrating ${oldData.users.length} users from old database...`);

      for (const [userId, userData] of oldData.users) {
        // Ensure user directory exists first
        await this.ensureUserDir(userId);
        
        // Create user profile
        const profileFile = this.getUserFile(userId, 'profile.json');
        await this.writeJsonFile(profileFile, userData);

        // Initialize other user files
        await this.initializeUserFiles(userId);

        // Update user index
        await this.updateUserIndex(userId, {
          username: userData.username,
          displayName: userData.displayName,
          lastLogin: userData.lastLogin,
          referralCode: userData.referralCode
        });

        console.log(`✅ Migrated user: ${userData.username}`);
      }

      console.log('🎉 Migration completed successfully!');
    } catch (error) {
      console.error('❌ Migration failed:', error.message);
    }
  }
}

export default HybridDatabaseService;
