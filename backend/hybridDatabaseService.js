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
   * Write JSON file with atomic locking to prevent corruption
   */
  async writeJsonFile(filePath, data) {
    const lockFile = `${filePath}.lock`;
    const tempFile = `${filePath}.tmp.${Date.now()}.${Math.random().toString(36).substr(2, 9)}`;
    let lockAcquired = false;
    
    try {
      // Attempt to acquire lock with retries
      for (let attempt = 1; attempt <= 10; attempt++) {
        try {
          // Clean up stale locks (older than 30 seconds)
          try {
            const lockStats = await fs.stat(lockFile);
            const lockAge = Date.now() - lockStats.mtime.getTime();
            if (lockAge > 30000) {
              console.log(`🧹 Cleaning stale lock: ${lockFile} (age: ${Math.round(lockAge/1000)}s)`);
              await fs.unlink(lockFile).catch(() => {});
            }
          } catch (statError) {
            // Lock file doesn't exist, which is good
          }
          
          // Try to create lock file (exclusive)
          await fs.writeFile(lockFile, process.pid.toString(), { flag: 'wx' });
          lockAcquired = true;
          break;
        } catch (lockError) {
          if (lockError.code === 'EEXIST') {
            // Lock exists, wait and retry
            const delay = Math.min(100 * Math.pow(2, attempt - 1), 2000); // Exponential backoff, max 2s
            console.log(`⏳ Lock exists for ${filePath}, retrying in ${delay}ms (attempt ${attempt}/10)`);
            await new Promise(resolve => setTimeout(resolve, delay));
          } else {
            throw lockError;
          }
        }
      }
      
      if (!lockAcquired) {
        throw new Error(`Failed to acquire lock for ${filePath} after 10 attempts`);
      }
      
      // Write to temporary file first (atomic operation)
      const jsonContent = JSON.stringify(data, null, 2);
      await fs.writeFile(tempFile, jsonContent);
      
      // Atomically move temp file to final location
      await fs.rename(tempFile, filePath);
      
      return true;
      
    } catch (error) {
      console.error(`❌ Error writing ${filePath}:`, error.message);
      
      // Clean up temp file if it exists
      try {
        await fs.unlink(tempFile);
      } catch (cleanupError) {
        // Temp file might not exist, ignore
      }
      
      return false;
      
    } finally {
      // Always release lock
      if (lockAcquired) {
        try {
          await fs.unlink(lockFile);
        } catch (unlockError) {
          console.warn(`⚠️ Failed to release lock ${lockFile}:`, unlockError.message);
        }
      }
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
      // Twitter posting enabled by default for authenticated users
      twitterPostingEnabled: existingProfile.twitterPostingEnabled !== undefined ? existingProfile.twitterPostingEnabled : true,
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

    // Ensure referral code is registered in global registry
    try {
      if (userData.referralCode) {
        await this.ensureUserReferralCode(userId, String(userData.referralCode).toUpperCase());
      }
    } catch (_) {}
    
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
   * Update user tokens (for token refresh)
   */
  async updateUserTokens(userId, accessToken, refreshToken) {
    const userDir = await this.ensureUserDir(userId);
    const profileFile = this.getUserFile(userId, 'profile.json');
    const existingProfile = await this.readJsonFile(profileFile, {});
    
    // Update tokens
    existingProfile.accessToken = accessToken;
    existingProfile.refreshToken = refreshToken;
    existingProfile.lastUpdated = new Date().toISOString();
    
    await this.writeJsonFile(profileFile, existingProfile);
    console.log(`🔄 Updated tokens for user ${userId}`);
    return existingProfile;
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
   * Set premium status and persist to premium.json
   */
  async setPremiumStatus(userId, premiumData) {
    await this.ensureUserDir(userId);
    const file = this.getUserFile(userId, 'premium.json');
    const current = await this.readJsonFile(file, {
      isPremium: false,
      subscriptionType: null,
      expiresAt: null,
      features: []
    });
    const updated = {
      ...current,
      ...premiumData,
      isPremium: premiumData?.isPremium === true,
    };
    await this.writeJsonFile(file, updated);
    return updated;
  }

  /**
   * Get premium status for a user (reads premium.json)
   */
  async getPremiumStatus(userId) {
    await this.ensureUserDir(userId);
    const file = this.getUserFile(userId, 'premium.json');
    const data = await this.readJsonFile(file, null);
    if (!data) {
      return {
        isPremium: false,
        subscriptionType: null,
        expiresAt: null,
        features: []
      };
    }
    return data;
  }

  /**
   * Earnings - global store under data/global/earnings.json
   */
  async addEarning(entry) {
    try {
      const file = this.getGlobalFile('earnings.json');
      const list = await this.readJsonFile(file, []);
      const record = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        type: entry?.type || 'unknown',
        category: entry?.category || null,
        amount: typeof entry?.amount === 'number' ? entry.amount : null,
        currency: entry?.currency || null,
        paylinkId: entry?.paylinkId || null,
        txId: entry?.txId || null,
        userId: entry?.userId || null,
        meta: entry?.meta || null
      };
      list.push(record);
      await this.writeJsonFile(file, list);
      return record;
    } catch (error) {
      console.error('[🗃️ Database] ❌ Failed to add earning:', error.message);
      throw error;
    }
  }

  async getEarnings() {
    const file = this.getGlobalFile('earnings.json');
    return await this.readJsonFile(file, []);
  }

  async getEarningsSummary() {
    const list = await this.getEarnings();
    const sum = (arr) => arr.reduce((acc, x) => acc + (typeof x.amount === 'number' ? x.amount : 0), 0);

    const byType = list.reduce((acc, r) => {
      const key = r.category || r.type || 'unknown';
      acc[key] = acc[key] || [];
      acc[key].push(r);
      return acc;
    }, {});

    const summary = {};
    for (const key of Object.keys(byType)) {
      summary[key] = {
        count: byType[key].length,
        total: sum(byType[key])
      };
    }

    const total = sum(list);
    return { total, breakdown: summary, count: list.length };
  }

  /**
   * Referral registry: data/global/referral-codes.json
   * Structure: { [code]: { ownerUserId, uses, maxUses, createdAt, lastUsedAt } }
   */
  async getReferralRegistry() {
    const file = this.getGlobalFile('referral-codes.json');
    return await this.readJsonFile(file, {});
  }

  async setReferralRegistry(registry) {
    const file = this.getGlobalFile('referral-codes.json');
    await this.writeJsonFile(file, registry);
  }

  async ensureUserReferralCode(userId, code) {
    const registry = await this.getReferralRegistry();
    if (!registry[code]) {
      registry[code] = {
        ownerUserId: userId,
        uses: 0,
        maxUses: 30,
        createdAt: new Date().toISOString(),
        lastUsedAt: null
      };
      await this.setReferralRegistry(registry);
    }
  }

  async markReferralUse(code, redeemerUserId) {
    const registry = await this.getReferralRegistry();
    if (!registry[code]) throw new Error('Referral code not found');
    registry[code].uses = (registry[code].uses || 0) + 1;
    registry[code].lastUsedAt = new Date().toISOString();
    await this.setReferralRegistry(registry);

    // Track per-user redemption to prevent multiple redemptions
    const file = this.getUserFile(redeemerUserId, 'referral.json');
    const data = await this.readJsonFile(file, { code: null, referredBy: null, referrals: [], earnings: 0 });
    data.referredBy = code;
    await this.writeJsonFile(file, data);
  }

  async getReferralRedemption(userId) {
    const file = this.getUserFile(userId, 'referral.json');
    const data = await this.readJsonFile(file, null);
    return data?.referredBy || null;
  }

  async createReferralCode({ ownerUserId, code, maxUses = 30 }) {
    const registry = await this.getReferralRegistry();
    const normalizedCode = String(code || this.generateReferralCode()).toUpperCase();
    if (registry[normalizedCode]) {
      return { code: normalizedCode, ...registry[normalizedCode], alreadyExisted: true };
    }
    registry[normalizedCode] = {
      ownerUserId: ownerUserId || 'admin',
      uses: 0,
      maxUses: Number(maxUses) || 30,
      createdAt: new Date().toISOString(),
      lastUsedAt: null
    };
    await this.setReferralRegistry(registry);
    return { code: normalizedCode, ...registry[normalizedCode] };
  }

  async listReferralCodes() {
    const registry = await this.getReferralRegistry();
    return Object.entries(registry).map(([code, entry]) => ({ code, ...entry }));
  }

  /**
   * Feature usage tracking for premium limits
   * Structure: { kolCalls: { [month]: count }, hypeViews: { [month]: Set<contractAddress> } }
   */
  async getFeatureUsage(userId) {
    const file = this.getUserFile(userId, 'feature-usage.json');
    const data = await this.readJsonFile(file, { kolCalls: {}, hypeViews: {} });
    
    // Convert hypeViews arrays back to Sets for current month
    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
    if (data.hypeViews[currentMonth] && Array.isArray(data.hypeViews[currentMonth])) {
      data.hypeViews[currentMonth] = new Set(data.hypeViews[currentMonth]);
    }
    
    return data;
  }

  async setFeatureUsage(userId, usage) {
    const file = this.getUserFile(userId, 'feature-usage.json');
    
    // Convert Sets to arrays for JSON serialization
    const serializable = { ...usage };
    Object.keys(serializable.hypeViews).forEach(month => {
      if (serializable.hypeViews[month] instanceof Set) {
        serializable.hypeViews[month] = Array.from(serializable.hypeViews[month]);
      }
    });
    
    await this.writeJsonFile(file, serializable);
  }

  async incrementKolCallUsage(userId) {
    const usage = await this.getFeatureUsage(userId);
    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
    usage.kolCalls[currentMonth] = (usage.kolCalls[currentMonth] || 0) + 1;
    await this.setFeatureUsage(userId, usage);
    return usage.kolCalls[currentMonth];
  }

  async addHypeViewUsage(userId, contractAddress) {
    const usage = await this.getFeatureUsage(userId);
    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
    if (!usage.hypeViews[currentMonth]) {
      usage.hypeViews[currentMonth] = new Set();
    }
    usage.hypeViews[currentMonth].add(contractAddress);
    await this.setFeatureUsage(userId, usage);
    return usage.hypeViews[currentMonth].size;
  }

  async getKolCallsThisMonth(userId) {
    const usage = await this.getFeatureUsage(userId);
    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
    return usage.kolCalls[currentMonth] || 0;
  }

  async getHypeViewsThisMonth(userId) {
    const usage = await this.getFeatureUsage(userId);
    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
    const views = usage.hypeViews[currentMonth];
    return views ? (views instanceof Set ? views.size : views.length) : 0;
  }

  // ================================
  // HYPE LIST (per-user selection)
  // ================================
  async getHypeList(userId) {
    await this.ensureUserDir(userId);
    const file = this.getUserFile(userId, 'hype.json');
    const data = await this.readJsonFile(file, []);
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.list)) return data.list;
    return [];
  }

  async setHypeList(userId, list) {
    await this.ensureUserDir(userId);
    const file = this.getUserFile(userId, 'hype.json');
    const unique = Array.from(new Set((list || []).filter(Boolean)));
    await this.writeJsonFile(file, unique);
    return unique;
  }

  async addHypeToken(userId, contractAddress) {
    const current = await this.getHypeList(userId);
    const next = Array.from(new Set([...(current || []), contractAddress]));
    return await this.setHypeList(userId, next);
  }

  async removeHypeToken(userId, contractAddress) {
    const current = await this.getHypeList(userId);
    const next = (current || []).filter(ca => String(ca) !== String(contractAddress));
    return await this.setHypeList(userId, next);
  }

  /**
   * Get user's KOL calls
   */
  async getKolCalls(userId) {
    const file = this.getUserFile(userId, 'kol-calls.json');
    return await this.readJsonFile(file, []);
  }

  /**
   * Get all KOL calls from all users
   */
  async getAllKolCalls() {
    const indexFile = this.getGlobalFile('users-index.json');
    const userIndex = await this.readJsonFile(indexFile, {});
    const allCalls = [];

    for (const userId of Object.keys(userIndex)) {
      try {
        const userCalls = await this.getKolCalls(userId);
        userCalls.forEach(call => {
          allCalls.push({
            ...call,
            userId
          });
        });
      } catch (error) {
        console.warn(`Failed to get KOL calls for user ${userId}:`, error.message);
      }
    }

    return allCalls;
  }

  /**
   * Add a KOL call
   */
  async addKolCall(userId, call) {
    console.log(`💾 addKolCall called for user ${userId}:`, {
      thesis: call.thesis,
      hasThesis: !!call.thesis,
      twitterPostId: call.twitterPostId,
      hasTwitterPost: !!call.twitterPostId,
      twitterEnabled: call.twitterEnabled,
      tone: call.tone
    });
    
    await this.ensureUserDir(userId);
    const file = this.getUserFile(userId, 'kol-calls.json');
    const calls = await this.readJsonFile(file, []);
    
    console.log(`💾 Current calls count for user ${userId}: ${calls.length}`);
    
    const toSave = {
      id: crypto.randomUUID(),
      ...call,
      // Initialize tracking fields
      athMC: call.calledMc || 0, // ATH starts at called MC
      athTimestamp: call.calledAt || new Date().toISOString(),
      maxDrawdownPct: 0, // No drawdown at start
      peakMC: call.calledMc || 0, // Rolling peak starts at called MC
      createdAt: new Date().toISOString(),
      
      // Proof of Call fields
      thesis: call.thesis || null, // AI-generated thesis
      twitterPostId: call.twitterPostId || null, // Twitter post ID if posted
      milestones: call.milestones || [], // Array of milestone objects
      twitterEnabled: call.twitterEnabled || false, // User's Twitter posting preference
      status: call.status || 'active', // active, closed, stopped
      
      // Milestone tracking
      lastMilestoneCheck: new Date().toISOString(),
      nextMilestoneThreshold: 5.0, // Next milestone to check for
      milestonePosts: [] // Array of posted milestone updates
    };
    
    console.log(`💾 Prepared call data to save:`, {
      id: toSave.id,
      thesis: toSave.thesis,
      hasThesis: !!toSave.thesis,
      twitterPostId: toSave.twitterPostId,
      hasTwitterPost: !!toSave.twitterPostId,
      twitterEnabled: toSave.twitterEnabled,
      tone: toSave.tone
    });
    
    calls.push(toSave);
    
    console.log(`💾 Writing ${calls.length} calls to file: ${file}`);
    const writeResult = await this.writeJsonFile(file, calls);
    console.log(`💾 Write result: ${writeResult}`);
    
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
  async updateKolCallMC(userId, contractAddress, currentMC, holderCount = null, liquidity = null) {
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

        // Update liquidity if provided
        if (liquidity !== null && liquidity !== undefined) {
          call.liquidity = liquidity;
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
   * Get follow data for a user
   */
  async getFollows(userId) {
    await this.ensureUserDir(userId);
    const file = this.getUserFile(userId, 'follows.json');
    const data = await this.readJsonFile(file, { following: [], followers: [] });
    // Normalize to unique arrays
    const following = Array.from(new Set(Array.isArray(data.following) ? data.following : []));
    const followers = Array.from(new Set(Array.isArray(data.followers) ? data.followers : []));
    return { following, followers };
  }

  /**
   * Follow a user (adds to follower's following and target's followers)
   */
  async followUser(userId, targetUserId) {
    if (!userId || !targetUserId || userId === targetUserId) return { success: false };
    // Follower
    const followerFile = this.getUserFile(userId, 'follows.json');
    const follower = await this.readJsonFile(followerFile, { following: [], followers: [] });
    follower.following = Array.from(new Set([...(follower.following || []), targetUserId]));
    await this.writeJsonFile(followerFile, follower);
    // Target
    await this.ensureUserDir(targetUserId);
    const targetFile = this.getUserFile(targetUserId, 'follows.json');
    const target = await this.readJsonFile(targetFile, { following: [], followers: [] });
    target.followers = Array.from(new Set([...(target.followers || []), userId]));
    await this.writeJsonFile(targetFile, target);
    return { success: true };
  }

  /**
   * Unfollow a user
   */
  async unfollowUser(userId, targetUserId) {
    if (!userId || !targetUserId || userId === targetUserId) return { success: false };
    const followerFile = this.getUserFile(userId, 'follows.json');
    const follower = await this.readJsonFile(followerFile, { following: [], followers: [] });
    follower.following = (follower.following || []).filter(id => id !== targetUserId);
    await this.writeJsonFile(followerFile, follower);
    // Target
    await this.ensureUserDir(targetUserId);
    const targetFile = this.getUserFile(targetUserId, 'follows.json');
    const target = await this.readJsonFile(targetFile, { following: [], followers: [] });
    target.followers = (target.followers || []).filter(id => id !== userId);
    await this.writeJsonFile(targetFile, target);
    return { success: true };
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

  /**
   * Store failed milestone for retry
   */
  async storeFailedMilestone(failedMilestone) {
    try {
      const failedMilestonesFile = path.join(this.globalDir, 'failed-milestones.json');
      let failedMilestones = await this.readJsonFile(failedMilestonesFile) || [];
      
      // Add unique ID
      failedMilestone.id = crypto.randomUUID();
      failedMilestones.push(failedMilestone);
      
      await this.writeJsonFile(failedMilestonesFile, failedMilestones);
      return failedMilestone.id;
    } catch (error) {
      console.error('❌ Error storing failed milestone:', error.message);
      throw error;
    }
  }

  /**
   * Get failed milestones for a user
   */
  async getFailedMilestones(userId) {
    try {
      const failedMilestonesFile = path.join(this.globalDir, 'failed-milestones.json');
      const failedMilestones = await this.readJsonFile(failedMilestonesFile) || [];
      
      return failedMilestones.filter(fm => fm.userId === userId);
    } catch (error) {
      console.error('❌ Error getting failed milestones:', error.message);
      return [];
    }
  }

  /**
   * Remove failed milestone
   */
  async removeFailedMilestone(failedMilestoneId) {
    try {
      const failedMilestonesFile = path.join(this.globalDir, 'failed-milestones.json');
      let failedMilestones = await this.readJsonFile(failedMilestonesFile) || [];
      
      failedMilestones = failedMilestones.filter(fm => fm.id !== failedMilestoneId);
      await this.writeJsonFile(failedMilestonesFile, failedMilestones);
    } catch (error) {
      console.error('❌ Error removing failed milestone:', error.message);
      throw error;
    }
  }

  /**
   * Increment retry count for failed milestone
   */
  async incrementFailedMilestoneRetryCount(failedMilestoneId) {
    try {
      const failedMilestonesFile = path.join(this.globalDir, 'failed-milestones.json');
      let failedMilestones = await this.readJsonFile(failedMilestonesFile) || [];
      
      const milestone = failedMilestones.find(fm => fm.id === failedMilestoneId);
      if (milestone) {
        milestone.retryCount = (milestone.retryCount || 0) + 1;
        await this.writeJsonFile(failedMilestonesFile, failedMilestones);
      }
    } catch (error) {
      console.error('❌ Error incrementing retry count:', error.message);
      throw error;
    }
  }

  // ================================
  // FAILED CALL TWEETS (First Call Posts)
  // ================================

  /**
   * Store failed call tweet for retry
   */
  async storeFailedCallTweet(failedCallTweet) {
    try {
      const failedCallTweetsFile = path.join(this.globalDir, 'failed-call-tweets.json');
      let failedCallTweets = await this.readJsonFile(failedCallTweetsFile) || [];
      
      // Add unique ID
      failedCallTweet.id = crypto.randomUUID();
      failedCallTweets.push(failedCallTweet);
      
      await this.writeJsonFile(failedCallTweetsFile, failedCallTweets);
      return failedCallTweet.id;
    } catch (error) {
      console.error('❌ Error storing failed call tweet:', error.message);
      throw error;
    }
  }

  /**
   * Get failed call tweets for a user
   */
  async getFailedCallTweets(userId) {
    try {
      const failedCallTweetsFile = path.join(this.globalDir, 'failed-call-tweets.json');
      const failedCallTweets = await this.readJsonFile(failedCallTweetsFile) || [];
      
      return failedCallTweets.filter(fct => fct.userId === userId);
    } catch (error) {
      console.error('❌ Error getting failed call tweets:', error.message);
      return [];
    }
  }

  /**
   * Remove failed call tweet
   */
  async removeFailedCallTweet(failedCallTweetId) {
    try {
      const failedCallTweetsFile = path.join(this.globalDir, 'failed-call-tweets.json');
      let failedCallTweets = await this.readJsonFile(failedCallTweetsFile) || [];
      
      failedCallTweets = failedCallTweets.filter(fct => fct.id !== failedCallTweetId);
      await this.writeJsonFile(failedCallTweetsFile, failedCallTweets);
    } catch (error) {
      console.error('❌ Error removing failed call tweet:', error.message);
      throw error;
    }
  }

  /**
   * Increment retry count for failed call tweet
   */
  async incrementFailedCallTweetRetryCount(failedCallTweetId) {
    try {
      const failedCallTweetsFile = path.join(this.globalDir, 'failed-call-tweets.json');
      let failedCallTweets = await this.readJsonFile(failedCallTweetsFile) || [];
      
      const callTweet = failedCallTweets.find(fct => fct.id === failedCallTweetId);
      if (callTweet) {
        callTweet.retryCount = (callTweet.retryCount || 0) + 1;
        await this.writeJsonFile(failedCallTweetsFile, failedCallTweets);
      }
    } catch (error) {
      console.error('❌ Error incrementing call tweet retry count:', error.message);
      throw error;
    }
  }
}

export default HybridDatabaseService;
