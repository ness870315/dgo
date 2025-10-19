import fs from 'fs/promises';
import path from 'path';
import axios from 'axios';

/**
 * BondingTokensService - Monitors Pre-Bonded Tokens
 * 
 * This service:
 * 1. Calls Moralis Get Bonding Tokens by Exchange API
 * 2. Stores data in persistent atomic database at /var/data/PreBonded-cache
 * 3. Provides methods to retrieve cached bonding tokens
 * 4. Monitors graduation status and generates alerts
 */
class BondingTokensService {
    constructor(moralisApiKey) {
        this.moralisApiKey = moralisApiKey;
        this.dataDir = '/var/data';
        this.dbFile = path.join(this.dataDir, 'PreBonded-cache.json');
        this.trackingFile = path.join(this.dataDir, 'prebonding-tracking.json');
        this.alertsFile = path.join(this.dataDir, 'graduation-alerts.json');
        this.cacheTimeout = 30 * 60 * 1000; // 30 minutes for bonding tokens
        this.statusCacheTimeout = 10 * 60 * 1000; // 10 minutes for bonding status
        this.lastFetchTime = null;
        this.cachedData = null;
        this.statusCache = new Map(); // Cache for individual bonding status
        
        console.log('🔄 BondingTokensService initialized');
        console.log(`   Data directory: ${this.dataDir}`);
        console.log(`   Database file: ${this.dbFile}`);
        console.log(`   Bonding tokens cache timeout: ${this.cacheTimeout / 1000}s (30 min)`);
        console.log(`   Bonding status cache timeout: ${this.statusCacheTimeout / 1000}s (10 min)`);
    }

    /**
     * Ensure data directory exists
     */
    async ensureDataDir() {
        try {
            await fs.access(this.dataDir);
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.log(`📁 Creating data directory: ${this.dataDir}`);
                await fs.mkdir(this.dataDir, { recursive: true });
            } else {
                throw error;
            }
        }
    }

    /**
     * Load cached data from database
     */
    async loadCachedData() {
        try {
            await this.ensureDataDir();
            
            const data = await fs.readFile(this.dbFile, 'utf8');
            this.cachedData = JSON.parse(data);
            this.lastFetchTime = this.cachedData.timestamp || null;
            
            console.log(`📂 Loaded ${this.cachedData.tokens?.length || 0} cached bonding tokens`);
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.log('📂 No cached data found, will fetch from API');
                this.cachedData = null;
                this.lastFetchTime = null;
            } else {
                console.error('❌ Failed to load cached data:', error.message);
                throw error;
            }
        }
    }

    /**
     * Save data to cache database
     */
    async saveCachedData(tokens) {
        try {
            await this.ensureDataDir();
            
            const data = {
                timestamp: Date.now(),
                tokens: tokens,
                count: tokens.length
            };
            
            await fs.writeFile(this.dbFile, JSON.stringify(data, null, 2));
            this.cachedData = data;
            this.lastFetchTime = Date.now();
            
            console.log(`💾 Saved ${tokens.length} bonding tokens to cache`);
        } catch (error) {
            console.error('❌ Failed to save cached data:', error.message);
            throw error;
        }
    }

    /**
     * Check if cache is still valid
     */
    isCacheValid() {
        if (!this.lastFetchTime) return false;
        return (Date.now() - this.lastFetchTime) < this.cacheTimeout;
    }

    /**
     * Fetch bonding tokens from Moralis API with deduplication
     */
    async fetchBondingTokens(limit = 10) {
        if (!this.moralisApiKey) {
            throw new Error('Moralis API key not configured');
        }

        const url = 'https://solana-gateway.moralis.io/token/mainnet/exchange/pumpfun/bonding';
        
        try {
            console.log(`🔄 Fetching bonding tokens from Moralis API (limit: ${limit})...`);
            
            const response = await axios.get(url, {
                headers: {
                    'accept': 'application/json',
                    'X-API-Key': this.moralisApiKey
                },
                params: {
                    limit: limit
                },
                timeout: 15000
            });

            if (response.data && response.data.result) {
                const rawTokens = response.data.result;
                console.log(`✅ Fetched ${rawTokens.length} raw bonding tokens from Moralis`);
                
                // Deduplication: Remove duplicates based on tokenAddress
                const uniqueTokens = this.deduplicateTokens(rawTokens);
                console.log(`🔄 Deduplication: ${rawTokens.length} → ${uniqueTokens.length} unique tokens`);
                
                // Log sample token for debugging
                if (uniqueTokens.length > 0) {
                    const sample = uniqueTokens[0];
                    console.log(`   Sample: ${sample.symbol} (${sample.tokenAddress.substring(0, 8)}...) - ${sample.bondingCurveProgress.toFixed(2)}%`);
                }
                
                return uniqueTokens;
            } else {
                throw new Error('Invalid response format from Moralis API');
            }
            
        } catch (error) {
            console.error('❌ Failed to fetch bonding tokens:', error.message);
            if (error.response) {
                console.error(`   Status: ${error.response.status}`);
                console.error(`   Data:`, error.response.data);
            }
            throw error;
        }
    }

    /**
     * Deduplicate tokens based on tokenAddress
     */
    deduplicateTokens(tokens) {
        const seen = new Set();
        const uniqueTokens = [];
        
        for (const token of tokens) {
            if (!seen.has(token.tokenAddress)) {
                seen.add(token.tokenAddress);
                uniqueTokens.push(token);
            } else {
                console.log(`🔄 Duplicate token removed: ${token.symbol} (${token.tokenAddress.substring(0, 8)}...)`);
            }
        }
        
        return uniqueTokens;
    }

    /**
     * Get bonding tokens (from cache or API)
     */
    async getBondingTokens(limit = 10, forceRefresh = false) {
        try {
            // Load cached data if not already loaded
            if (!this.cachedData) {
                await this.loadCachedData();
            }
            
            // Return cached data if valid and not forcing refresh
            if (!forceRefresh && this.isCacheValid() && this.cachedData) {
                console.log(`💾 Using cached bonding tokens (${this.cachedData.tokens.length} tokens)`);
                return {
                    success: true,
                    tokens: this.cachedData.tokens.slice(0, limit),
                    source: 'cache',
                    lastFetch: this.lastFetchTime,
                    count: this.cachedData.tokens.length
                };
            }
            
            // Fetch fresh data from API
            console.log(`🔄 Cache expired or force refresh requested, fetching from API...`);
            const tokens = await this.fetchBondingTokens(limit);
            
            // Save to cache
            await this.saveCachedData(tokens);
            
            return {
                success: true,
                tokens: tokens,
                source: 'api',
                lastFetch: Date.now(),
                count: tokens.length
            };
            
        } catch (error) {
            console.error('❌ Failed to get bonding tokens:', error.message);
            
            // Return cached data as fallback if available
            if (this.cachedData) {
                console.log(`⚠️ Returning stale cached data as fallback`);
                return {
                    success: true,
                    tokens: this.cachedData.tokens.slice(0, limit),
                    source: 'stale_cache',
                    lastFetch: this.lastFetchTime,
                    count: this.cachedData.tokens.length,
                    warning: 'Using stale cached data due to API error'
                };
            }
            
            return {
                success: false,
                error: error.message,
                tokens: []
            };
        }
    }

    /**
     * Get bonding status for a specific token (cached for 10 minutes)
     */
    async getBondingStatus(tokenAddress) {
        if (!this.moralisApiKey) {
            throw new Error('Moralis API key not configured');
        }

        // Check cache first (10-minute cache)
        const cachedStatus = this.statusCache.get(tokenAddress);
        if (cachedStatus && (Date.now() - cachedStatus.timestamp) < this.statusCacheTimeout) {
            console.log(`💾 Using cached bonding status for ${tokenAddress.substring(0, 8)}... (${cachedStatus.data.bondingProgress.toFixed(2)}%)`);
            return cachedStatus;
        }

        const url = `https://solana-gateway.moralis.io/token/mainnet/${tokenAddress}/bonding-status`;
        
        try {
            console.log(`🔍 Fetching bonding status for ${tokenAddress.substring(0, 8)}...`);
            
            const response = await axios.get(url, {
                headers: {
                    'accept': 'application/json',
                    'X-API-Key': this.moralisApiKey
                },
                timeout: 10000
            });

            if (response.data && response.data.mint) {
                const status = response.data;
                console.log(`✅ Bonding status: ${status.bondingProgress.toFixed(2)}%`);
                
                const result = {
                    success: true,
                    data: {
                        mint: status.mint,
                        bondingProgress: status.bondingProgress,
                        timestamp: Date.now(),
                        isCloseToGraduation: status.bondingProgress >= 95,
                        graduationProximity: this.calculateGraduationProximity(status.bondingProgress)
                    }
                };

                // Cache the result for 10 minutes
                this.statusCache.set(tokenAddress, {
                    ...result,
                    timestamp: Date.now()
                });

                return result;
            } else {
                throw new Error('Invalid response format from bonding-status API');
            }
            
        } catch (error) {
            console.error('❌ Failed to get bonding status:', error.message);
            if (error.response) {
                console.error(`   Status: ${error.response.status}`);
                console.error(`   Data:`, error.response.data);
            }
            throw error;
        }
    }

    /**
     * Calculate graduation proximity level
     */
    calculateGraduationProximity(progress) {
        if (progress >= 99) return 'IMMINENT_GRADUATION';
        if (progress >= 97) return 'VERY_CLOSE_TO_GRADUATION';
        if (progress >= 95) return 'CLOSE_TO_GRADUATION';
        if (progress >= 90) return 'APPROACHING_GRADUATION';
        return 'FAR_FROM_GRADUATION';
    }

    /**
     * Monitor bonding status for multiple tokens
     */
    async monitorTokensForGraduation(tokenAddresses, threshold = 95) {
        console.log(`🔍 Monitoring ${tokenAddresses.length} tokens for graduation (threshold: ${threshold}%)...`);
        
        const results = [];
        const alerts = [];
        
        for (const tokenAddress of tokenAddresses) {
            try {
                const status = await this.getBondingStatus(tokenAddress);
                
                if (status.success) {
                    const data = status.data;
                    results.push(data);
                    
                    if (data.bondingProgress >= threshold) {
                        alerts.push({
                            tokenAddress: tokenAddress,
                            bondingProgress: data.bondingProgress,
                            graduationProximity: data.graduationProximity,
                            timestamp: Date.now(),
                            message: `Token ${tokenAddress.substring(0, 8)}... is ${data.graduationProximity.replace(/_/g, ' ').toLowerCase()} (${data.bondingProgress.toFixed(2)}%)`
                        });
                    }
                }
            } catch (error) {
                console.error(`❌ Failed to monitor ${tokenAddress.substring(0, 8)}...:`, error.message);
            }
        }
        
        console.log(`✅ Monitored ${results.length} tokens, ${alerts.length} alerts generated`);
        
        return {
            success: true,
            results: results,
            alerts: alerts,
            summary: {
                totalTokens: tokenAddresses.length,
                successfulChecks: results.length,
                alertsGenerated: alerts.length
            }
        };
    }

    /**
     * Get graduation alerts for tokens close to graduation
     */
    async getGraduationAlerts(threshold = 95) {
        try {
            // Get current bonding tokens
            const bondingResult = await this.getBondingTokens(50);
            
            if (!bondingResult.success) {
                return {
                    success: false,
                    error: 'Failed to get bonding tokens',
                    alerts: []
                };
            }
            
            // Extract token addresses
            const tokenAddresses = bondingResult.tokens.map(token => token.tokenAddress);
            
            // Monitor tokens for graduation
            const monitoringResult = await this.monitorTokensForGraduation(tokenAddresses, threshold);
            
            return {
                success: true,
                alerts: monitoringResult.alerts,
                summary: monitoringResult.summary
            };
            
        } catch (error) {
            console.error('❌ Failed to get graduation alerts:', error.message);
            return {
                success: false,
                error: error.message,
                alerts: []
            };
        }
    }

    /**
     * Start continuous monitoring (for background service)
     * Bonding tokens: every 30 minutes
     * Bonding status: every 10 minutes
     */
    async startContinuousMonitoring(bondingTokensIntervalMs = 1800000, bondingStatusIntervalMs = 600000, threshold = 95) {
        console.log(`🔄 Starting continuous graduation monitoring`);
        console.log(`   Bonding tokens refresh: ${bondingTokensIntervalMs / 1000}s (30 min)`);
        console.log(`   Bonding status refresh: ${bondingStatusIntervalMs / 1000}s (10 min)`);
        console.log(`   Graduation threshold: ${threshold}%`);
        
        // Bonding tokens monitoring (every 30 minutes)
        const bondingTokensInterval = setInterval(async () => {
            try {
                console.log(`\n⏰ [${new Date().toISOString()}] Refreshing bonding tokens list...`);
                
                // Force refresh bonding tokens
                this.cachedData = null;
                this.lastFetchTime = null;
                
                const tokens = await this.getBondingTokens();
                if (tokens.success) {
                    console.log(`✅ Refreshed ${tokens.tokens.length} bonding tokens`);
                }
                
            } catch (error) {
                console.error('❌ Bonding tokens refresh error:', error.message);
            }
        }, bondingTokensIntervalMs);
        
        // Bonding status monitoring (every 10 minutes)
        const bondingStatusInterval = setInterval(async () => {
            try {
                console.log(`\n⏰ [${new Date().toISOString()}] Running graduation status check...`);
                
                const alerts = await this.getGraduationAlerts(threshold);
                
                if (alerts.success && alerts.alerts.length > 0) {
                    console.log(`🚨 GRADUATION ALERTS (${alerts.alerts.length} tokens):`);
                    alerts.alerts.forEach(alert => {
                        console.log(`   ${alert.message}`);
                    });
                    
                    // Save alerts to database
                    await this.saveGraduationAlerts(alerts.alerts);
                } else {
                    console.log(`✅ No graduation alerts (${alerts.summary?.successfulChecks || 0} tokens checked)`);
                }
                
            } catch (error) {
                console.error('❌ Bonding status monitoring error:', error.message);
            }
        }, bondingStatusIntervalMs);
        
        return {
            bondingTokensIntervalId: bondingTokensInterval,
            bondingStatusIntervalId: bondingStatusInterval,
            stop: () => {
                console.log('🛑 Stopping continuous graduation monitoring');
                clearInterval(bondingTokensInterval);
                clearInterval(bondingStatusInterval);
            }
        };
    }

    /**
     * Save graduation alerts to database
     */
    async saveGraduationAlerts(alerts) {
        try {
            await this.ensureDataDir();
            
            const data = {
                timestamp: Date.now(),
                alerts: alerts,
                count: alerts.length
            };
            
            await fs.writeFile(this.alertsFile, JSON.stringify(data, null, 2));
            console.log(`💾 Saved ${alerts.length} graduation alerts to database`);
        } catch (error) {
            console.error('❌ Failed to save graduation alerts:', error.message);
            throw error;
        }
    }

    /**
     * Get saved graduation alerts
     */
    async getSavedGraduationAlerts() {
        try {
            const data = await fs.readFile(this.alertsFile, 'utf8');
            const alerts = JSON.parse(data);
            return {
                success: true,
                alerts: alerts.alerts || [],
                timestamp: alerts.timestamp,
                count: alerts.count || 0
            };
        } catch (error) {
            if (error.code === 'ENOENT') {
                return {
                    success: true,
                    alerts: [],
                    timestamp: null,
                    count: 0
                };
            }
            console.error('❌ Failed to get saved graduation alerts:', error.message);
            return {
                success: false,
                error: error.message,
                alerts: []
            };
        }
    }

    /**
     * Track pre-bonding tokens progression
     */
    async trackPreBondingTokens() {
        try {
            console.log('🔄 Tracking PreBonding tokens progression...');
            
            // Get current bonding tokens
            const bondingResult = await this.getBondingTokens(50);
            
            if (!bondingResult.success) {
                return {
                    success: false,
                    error: 'Failed to get bonding tokens',
                    trackedTokens: []
                };
            }
            
            // Load existing tracking data
            const trackingData = await this.loadTrackingData();
            
            const trackedTokens = [];
            const now = Date.now();
            
            for (const token of bondingResult.tokens) {
                const tokenAddress = token.tokenAddress;
                const currentProgress = token.bondingCurveProgress;
                
                // Check if token is already being tracked
                const existingTrack = trackingData.tokens[tokenAddress];
                
                if (existingTrack) {
                    // Update existing tracking
                    const timeDiff = now - existingTrack.lastUpdate;
                    const progressDiff = currentProgress - existingTrack.firstProgress;
                    const progressionRate = progressDiff / (timeDiff / (1000 * 60 * 60)); // per hour
                    
                    const updatedTrack = {
                        ...existingTrack,
                        lastProgress: currentProgress,
                        lastUpdate: now,
                        totalProgressGained: progressDiff,
                        progressionRate: progressionRate,
                        daysTracked: Math.floor((now - existingTrack.firstSeen) / (1000 * 60 * 60 * 24))
                    };
                    
                    trackingData.tokens[tokenAddress] = updatedTrack;
                    trackedTokens.push({
                        ...token,
                        trackingData: updatedTrack
                    });
                } else {
                    // Start new tracking
                    const newTrack = {
                        tokenAddress: tokenAddress,
                        firstSeen: now,
                        firstProgress: currentProgress,
                        lastProgress: currentProgress,
                        lastUpdate: now,
                        totalProgressGained: 0,
                        progressionRate: 0,
                        daysTracked: 0
                    };
                    
                    trackingData.tokens[tokenAddress] = newTrack;
                    trackedTokens.push({
                        ...token,
                        trackingData: newTrack
                    });
                }
            }
            
            // Save updated tracking data
            await this.saveTrackingData(trackingData);
            
            console.log(`✅ Tracked ${trackedTokens.length} pre-bonding tokens`);
            
            return {
                success: true,
                trackedTokens: trackedTokens,
                count: trackedTokens.length
            };
            
        } catch (error) {
            console.error('❌ Failed to track pre-bonding tokens:', error.message);
            return {
                success: false,
                error: error.message,
                trackedTokens: []
            };
        }
    }

    /**
     * Load tracking data from database
     */
    async loadTrackingData() {
        try {
            const data = await fs.readFile(this.trackingFile, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            if (error.code === 'ENOENT') {
                return {
                    timestamp: Date.now(),
                    tokens: {}
                };
            }
            throw error;
        }
    }

    /**
     * Save tracking data to database
     */
    async saveTrackingData(trackingData) {
        try {
            await this.ensureDataDir();
            trackingData.timestamp = Date.now();
            await fs.writeFile(this.trackingFile, JSON.stringify(trackingData, null, 2));
        } catch (error) {
            console.error('❌ Failed to save tracking data:', error.message);
            throw error;
        }
    }

    /**
     * Get tracking statistics
     */
    async getTrackingStats() {
        try {
            const trackingData = await this.loadTrackingData();
            const tokens = Object.values(trackingData.tokens);
            
            const stats = {
                totalTracked: tokens.length,
                averageProgress: tokens.reduce((sum, t) => sum + t.lastProgress, 0) / tokens.length,
                averageProgressionRate: tokens.reduce((sum, t) => sum + t.progressionRate, 0) / tokens.length,
                tokensByProximity: {
                    IMMINENT_GRADUATION: tokens.filter(t => t.lastProgress >= 99).length,
                    VERY_CLOSE_TO_GRADUATION: tokens.filter(t => t.lastProgress >= 97 && t.lastProgress < 99).length,
                    CLOSE_TO_GRADUATION: tokens.filter(t => t.lastProgress >= 95 && t.lastProgress < 97).length,
                    APPROACHING_GRADUATION: tokens.filter(t => t.lastProgress >= 90 && t.lastProgress < 95).length,
                    FAR_FROM_GRADUATION: tokens.filter(t => t.lastProgress < 90).length
                }
            };
            
            return {
                success: true,
                stats: stats
            };
        } catch (error) {
            console.error('❌ Failed to get tracking stats:', error.message);
            return {
                success: false,
                error: error.message,
                stats: null
            };
        }
    }

    /**
     * Get tokens by proximity level
     */
    async getTokensByProximityLevel(proximityLevel = null) {
        try {
            const trackingResult = await this.trackPreBondingTokens();
            
            if (!trackingResult.success) {
                return {
                    success: false,
                    error: trackingResult.error,
                    tokens: []
                };
            }
            
            let filteredTokens = trackingResult.trackedTokens;
            
            if (proximityLevel) {
                filteredTokens = filteredTokens.filter(token => 
                    token.trackingData && this.calculateGraduationProximity(token.trackingData.lastProgress) === proximityLevel
                );
            }
            
            // Sort by proximity (imminent first)
            filteredTokens.sort((a, b) => {
                const aProximity = this.calculateGraduationProximity(a.trackingData?.lastProgress || a.bondingCurveProgress);
                const bProximity = this.calculateGraduationProximity(b.trackingData?.lastProgress || b.bondingCurveProgress);
                
                const proximityOrder = {
                    'IMMINENT_GRADUATION': 0,
                    'VERY_CLOSE_TO_GRADUATION': 1,
                    'CLOSE_TO_GRADUATION': 2,
                    'APPROACHING_GRADUATION': 3,
                    'FAR_FROM_GRADUATION': 4
                };
                
                return proximityOrder[aProximity] - proximityOrder[bProximity];
            });
            
            return {
                success: true,
                tokens: filteredTokens,
                count: filteredTokens.length,
                proximityLevel: proximityLevel || 'all'
            };
            
        } catch (error) {
            console.error('❌ Failed to get tokens by proximity level:', error.message);
            return {
                success: false,
                error: error.message,
                tokens: []
            };
        }
    }

    /**
     * Get enhanced graduation alerts with tracking data
     */
    async getEnhancedGraduationAlerts(threshold = 95) {
        try {
            const trackingResult = await this.trackPreBondingTokens();
            
            if (!trackingResult.success) {
                return {
                    success: false,
                    error: trackingResult.error,
                    alerts: []
                };
            }
            
            const alerts = [];
            
            for (const token of trackingResult.trackedTokens) {
                const progress = token.trackingData?.lastProgress || token.bondingCurveProgress;
                
                if (progress >= threshold) {
                    const proximity = this.calculateGraduationProximity(progress);
                    const trackingData = token.trackingData;
                    
                    alerts.push({
                        tokenAddress: token.tokenAddress,
                        name: token.name,
                        symbol: token.symbol,
                        bondingProgress: progress,
                        graduationProximity: proximity,
                        timestamp: Date.now(),
                        trackingData: trackingData,
                        message: `${token.symbol} (${token.tokenAddress.substring(0, 8)}...) is ${proximity.replace(/_/g, ' ').toLowerCase()} (${progress.toFixed(2)}%) - Tracked for ${trackingData?.daysTracked || 0} days`
                    });
                }
            }
            
            // Sort by proximity (imminent first)
            alerts.sort((a, b) => {
                const proximityOrder = {
                    'IMMINENT_GRADUATION': 0,
                    'VERY_CLOSE_TO_GRADUATION': 1,
                    'CLOSE_TO_GRADUATION': 2,
                    'APPROACHING_GRADUATION': 3,
                    'FAR_FROM_GRADUATION': 4
                };
                
                return proximityOrder[a.graduationProximity] - proximityOrder[b.graduationProximity];
            });
            
            return {
                success: true,
                alerts: alerts,
                count: alerts.length
            };
            
        } catch (error) {
            console.error('❌ Failed to get enhanced graduation alerts:', error.message);
            return {
                success: false,
                error: error.message,
                alerts: []
            };
        }
    }

    /**
     * Clear all cache data
     */
    async clearCache() {
        try {
            this.cachedData = null;
            this.lastFetchTime = null;
            this.statusCache.clear();
            
            // Optionally delete cache files
            // await fs.unlink(this.dbFile).catch(() => {});
            // await fs.unlink(this.trackingFile).catch(() => {});
            // await fs.unlink(this.alertsFile).catch(() => {});
            
            console.log('🗑️ Cache cleared successfully');
        } catch (error) {
            console.error('❌ Failed to clear cache:', error.message);
            throw error;
        }
    }
}

export default BondingTokensService;
