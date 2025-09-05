import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class PriorityQueueService {
  constructor() {
    this.baseDir = process.env.DATA_DIR || path.join(__dirname, 'data');
    this.globalDir = path.join(this.baseDir, 'global');
    this.priorityFile = path.join(this.globalDir, 'priority-queue.json');
    
    // Priority tiers with different update frequencies
    this.priorities = {
      HIGH: {
        name: 'HIGH',
        updateIntervalMs: 90000, // 1.5 minutes (with jitter: 75s - 105s)
        jitterMs: 15000, // ±15 seconds
        maxTokens: 200, // Maximum tokens in high priority
        description: 'Tokens being viewed, in watchlists, recently called, top 100 mcap'
      },
      MEDIUM: {
        name: 'MEDIUM', 
        updateIntervalMs: 600000, // 10 minutes (with jitter: 8.75m - 11.25m)
        jitterMs: 75000, // ±1.25 minutes
        maxTokens: 400, // Maximum tokens in medium priority
        description: 'Remaining watchlist tokens, top 500 mcap'
      },
      LOW: {
        name: 'LOW',
        updateIntervalMs: 1800000, // 30 minutes (with jitter: 26.25m - 33.75m)
        jitterMs: 225000, // ±3.75 minutes
        maxTokens: 1000, // Maximum tokens in low priority
        description: 'All other tokens'
      }
    };
    
    // Rate limiting - global budget to prevent 429s
    this.rateLimiting = {
      maxRequestsPerMinute: 2.5, // Conservative: ~2.5 requests per minute average
      requestHistory: [], // Track recent requests
      batchSize: 100 // Jupiter API batch size
    };
    
    // Token priority tracking
    this.tokenPriorities = new Map(); // contractAddress -> { priority, lastUpdated, boostUntil, consecutiveSmallChanges }
    
    this.initializeDirectories();
    this.loadPriorityData();
  }

  async initializeDirectories() {
    try {
      await fs.mkdir(this.globalDir, { recursive: true });
    } catch (error) {
      console.error('[🎯 Priority Queue] ❌ Failed to create directories:', error.message);
    }
  }

  async loadPriorityData() {
    try {
      const data = await fs.readFile(this.priorityFile, 'utf8');
      const parsed = JSON.parse(data);
      
      // Convert array back to Map
      if (parsed.tokenPriorities) {
        this.tokenPriorities = new Map(parsed.tokenPriorities);
      }
      
      console.log(`[🎯 Priority Queue] ✅ Loaded ${this.tokenPriorities.size} token priorities from disk`);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error('[🎯 Priority Queue] ❌ Failed to load priority data:', error.message);
      }
      // Initialize empty if file doesn't exist
      this.tokenPriorities = new Map();
    }
  }

  async savePriorityData() {
    try {
      const data = {
        tokenPriorities: Array.from(this.tokenPriorities.entries()),
        lastSaved: new Date().toISOString()
      };
      
      await fs.writeFile(this.priorityFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('[🎯 Priority Queue] ❌ Failed to save priority data:', error.message);
    }
  }

  /**
   * Add jitter to prevent thundering herd
   */
  addJitter(intervalMs, jitterMs) {
    const jitter = (Math.random() - 0.5) * 2 * jitterMs; // Random between -jitterMs and +jitterMs
    return Math.max(intervalMs + jitter, 30000); // Minimum 30 seconds
  }

  /**
   * Check if we're within rate limits
   */
  canMakeRequest() {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    
    // Clean old requests
    this.rateLimiting.requestHistory = this.rateLimiting.requestHistory.filter(
      timestamp => timestamp > oneMinuteAgo
    );
    
    // Check if we can make another request
    return this.rateLimiting.requestHistory.length < this.rateLimiting.maxRequestsPerMinute;
  }

  /**
   * Record a request for rate limiting
   */
  recordRequest() {
    this.rateLimiting.requestHistory.push(Date.now());
  }

  /**
   * Boost token priority (e.g., when user views it or makes a call)
   */
  async boostTokenPriority(contractAddress, durationMs = 3600000) { // 1 hour boost by default
    const now = Date.now();
    const existing = this.tokenPriorities.get(contractAddress) || {};
    
    this.tokenPriorities.set(contractAddress, {
      ...existing,
      priority: 'HIGH',
      boostUntil: now + durationMs,
      lastBoosted: now
    });
    
    await this.savePriorityData();
    console.log(`[🎯 Priority Queue] 🚀 Boosted ${contractAddress.substring(0, 8)} to HIGH priority for ${Math.round(durationMs/60000)} minutes`);
  }

  /**
   * Determine token priority based on various factors
   */
  determineTokenPriority(token, watchlistTokens = [], kolCallTokens = []) {
    const contractAddress = token.contractAddress;
    const existing = this.tokenPriorities.get(contractAddress) || {};
    const now = Date.now();
    
    // Check if token has an active boost
    if (existing.boostUntil && now < existing.boostUntil) {
      return 'HIGH';
    }
    
    // High priority criteria
    const mcap = token.jupiterData?.mcap || 0;
    const isInWatchlist = watchlistTokens.includes(contractAddress);
    const isRecentKolCall = kolCallTokens.includes(contractAddress);
    const isTop100Mcap = mcap >= 10000000; // $10M+ market cap
    
    if (isInWatchlist || isRecentKolCall || (isTop100Mcap && mcap >= 100000000)) { // $100M+ for auto-high
      return 'HIGH';
    }
    
    // Medium priority criteria  
    const isTop500Mcap = mcap >= 1000000; // $1M+ market cap
    if (isTop500Mcap || isTop100Mcap) {
      return 'MEDIUM';
    }
    
    // Everything else is low priority
    return 'LOW';
  }

  /**
   * Adjust priority based on market cap changes (adaptive system)
   */
  adjustPriorityBasedOnChanges(contractAddress, oldMcap, newMcap) {
    if (!oldMcap || oldMcap === 0) return;
    
    const changePercent = Math.abs((newMcap - oldMcap) / oldMcap * 100);
    const existing = this.tokenPriorities.get(contractAddress) || {};
    
    if (changePercent > 20) {
      // Significant change - boost to high priority temporarily
      this.boostTokenPriority(contractAddress, 1800000); // 30 minutes
      existing.consecutiveSmallChanges = 0;
    } else if (changePercent < 2) {
      // Small change - track consecutive small changes
      existing.consecutiveSmallChanges = (existing.consecutiveSmallChanges || 0) + 1;
      
      // If 3+ consecutive small changes, consider downgrading
      if (existing.consecutiveSmallChanges >= 3 && existing.priority === 'HIGH') {
        existing.priority = 'MEDIUM';
        console.log(`[🎯 Priority Queue] ⬇️ Downgraded ${contractAddress.substring(0, 8)} to MEDIUM (3+ small changes)`);
      } else if (existing.consecutiveSmallChanges >= 5 && existing.priority === 'MEDIUM') {
        existing.priority = 'LOW';
        console.log(`[🎯 Priority Queue] ⬇️ Downgraded ${contractAddress.substring(0, 8)} to LOW (5+ small changes)`);
      }
    } else {
      // Moderate change - reset counter
      existing.consecutiveSmallChanges = 0;
    }
    
    this.tokenPriorities.set(contractAddress, existing);
  }

  /**
   * Get tokens that need updates based on priority and timing
   */
  getTokensForUpdate(allTokens, watchlistTokens = [], kolCallTokens = []) {
    const now = Date.now();
    const tokensToUpdate = [];
    
    // Categorize tokens by priority
    const priorityBuckets = {
      HIGH: [],
      MEDIUM: [],
      LOW: []
    };
    
    allTokens.forEach(token => {
      if (!token.contractAddress) return;
      
      const priority = this.determineTokenPriority(token, watchlistTokens, kolCallTokens);
      const existing = this.tokenPriorities.get(token.contractAddress) || {};
      const lastUpdated = existing.lastUpdated || 0;
      const priorityConfig = this.priorities[priority];
      
      // Check if token needs update based on its priority timing
      const timeSinceUpdate = now - lastUpdated;
      const updateInterval = this.addJitter(priorityConfig.updateIntervalMs, priorityConfig.jitterMs);
      
      if (timeSinceUpdate >= updateInterval || !token.jupiterData || !token.jupiterTimestamp) {
        priorityBuckets[priority].push({
          ...token,
          priority,
          timeSinceUpdate,
          needsUpdate: true
        });
      }
    });
    
    // Respect max tokens per priority and rate limits
    let remainingBudget = this.canMakeRequest() ? this.rateLimiting.batchSize : 0;
    
    // Process HIGH priority first
    if (remainingBudget > 0 && priorityBuckets.HIGH.length > 0) {
      const highPriorityTokens = priorityBuckets.HIGH
        .sort((a, b) => b.timeSinceUpdate - a.timeSinceUpdate) // Oldest first
        .slice(0, Math.min(this.priorities.HIGH.maxTokens, remainingBudget));
      
      tokensToUpdate.push(...highPriorityTokens);
      remainingBudget -= highPriorityTokens.length;
    }
    
    // Process MEDIUM priority if budget remains
    if (remainingBudget > 0 && priorityBuckets.MEDIUM.length > 0) {
      const mediumPriorityTokens = priorityBuckets.MEDIUM
        .sort((a, b) => b.timeSinceUpdate - a.timeSinceUpdate)
        .slice(0, Math.min(this.priorities.MEDIUM.maxTokens, remainingBudget));
      
      tokensToUpdate.push(...mediumPriorityTokens);
      remainingBudget -= mediumPriorityTokens.length;
    }
    
    // Process LOW priority if budget remains
    if (remainingBudget > 0 && priorityBuckets.LOW.length > 0) {
      const lowPriorityTokens = priorityBuckets.LOW
        .sort((a, b) => b.timeSinceUpdate - a.timeSinceUpdate)
        .slice(0, Math.min(this.priorities.LOW.maxTokens, remainingBudget));
      
      tokensToUpdate.push(...lowPriorityTokens);
    }
    
    return tokensToUpdate;
  }

  /**
   * Mark tokens as updated and adjust priorities based on changes
   */
  async markTokensUpdated(updatedTokens, oldTokensMap) {
    const now = Date.now();
    
    updatedTokens.forEach(token => {
      const contractAddress = token.contractAddress;
      const existing = this.tokenPriorities.get(contractAddress) || {};
      
      // Update last updated timestamp
      existing.lastUpdated = now;
      
      // Adjust priority based on market cap changes
      const oldToken = oldTokensMap.get(contractAddress);
      if (oldToken && oldToken.jupiterData?.mcap && token.jupiterData?.mcap) {
        this.adjustPriorityBasedOnChanges(
          contractAddress, 
          oldToken.jupiterData.mcap, 
          token.jupiterData.mcap
        );
      }
      
      this.tokenPriorities.set(contractAddress, existing);
    });
    
    await this.savePriorityData();
  }

  /**
   * Get priority statistics for monitoring
   */
  getPriorityStats(allTokens = []) {
    const stats = {
      HIGH: { count: 0, tokens: [] },
      MEDIUM: { count: 0, tokens: [] },
      LOW: { count: 0, tokens: [] },
      total: allTokens.length,
      canMakeRequest: this.canMakeRequest(),
      requestsInLastMinute: this.rateLimiting.requestHistory.length
    };
    
    allTokens.forEach(token => {
      if (!token.contractAddress) return;
      
      const priority = this.determineTokenPriority(token);
      stats[priority].count++;
      stats[priority].tokens.push({
        symbol: token.symbol,
        contractAddress: token.contractAddress.substring(0, 8),
        mcap: token.jupiterData?.mcap || 0
      });
    });
    
    return stats;
  }

  /**
   * Clean up old priority data (tokens not seen in 7 days)
   */
  async cleanupOldPriorities(activeTokens) {
    const now = Date.now();
    const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);
    const activeContracts = new Set(activeTokens.map(t => t.contractAddress).filter(Boolean));
    
    let cleaned = 0;
    for (const [contractAddress, data] of this.tokenPriorities.entries()) {
      // Remove if not in active tokens and last updated > 7 days ago
      if (!activeContracts.has(contractAddress) && (data.lastUpdated || 0) < sevenDaysAgo) {
        this.tokenPriorities.delete(contractAddress);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      await this.savePriorityData();
      console.log(`[🎯 Priority Queue] 🧹 Cleaned up ${cleaned} old priority entries`);
    }
  }
}

export default PriorityQueueService;
