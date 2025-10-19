import fs from 'fs/promises';
import path from 'path';
import axios from 'axios';

/**
 * BondingTokensService - Fetches and caches soon-to-graduate tokens from Moralis API
 * 
 * This service:
 * 1. Calls Moralis Get Bonding Tokens by Exchange API
 * 2. Stores data in persistent atomic database at /var/data/PreBonded-cache
 * 3. Provides methods to retrieve cached bonding tokens
 */
class BondingTokensService {
    constructor(moralisApiKey) {
        this.moralisApiKey = moralisApiKey;
        this.dataDir = '/var/data';
        this.dbFile = path.join(this.dataDir, 'PreBonded-cache.json');
        this.cacheTimeout = 5 * 60 * 1000; // 5 minutes cache timeout
        this.lastFetchTime = null;
        this.cachedData = null;
        
        console.log('🔄 BondingTokensService initialized');
        console.log(`   Data directory: ${this.dataDir}`);
        console.log(`   Database file: ${this.dbFile}`);
        console.log(`   Cache timeout: ${this.cacheTimeout / 1000}s`);
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
            const parsed = JSON.parse(data);
            
            this.cachedData = parsed.data;
            this.lastFetchTime = parsed.lastFetchTime;
            
            console.log(`💾 Loaded ${this.cachedData?.length || 0} bonding tokens from cache`);
            console.log(`   Last fetch: ${new Date(this.lastFetchTime).toISOString()}`);
            
            return this.cachedData;
        } catch (error) {
            if (error.code !== 'ENOENT') {
                console.error('❌ Failed to load cached data:', error.message);
            }
            console.log('📊 Starting with empty cache');
            this.cachedData = null;
            this.lastFetchTime = null;
            return null;
        }
    }

    /**
     * Save data to database atomically
     */
    async saveCachedData(data) {
        try {
            await this.ensureDataDir();
            
            const cacheData = {
                data: data,
                lastFetchTime: Date.now(),
                timestamp: new Date().toISOString(),
                count: data.length
            };
            
            // Write to temporary file first (atomic operation)
            const tempFile = this.dbFile + '.tmp';
            await fs.writeFile(tempFile, JSON.stringify(cacheData, null, 2));
            
            // Atomic rename
            await fs.rename(tempFile, this.dbFile);
            
            this.cachedData = data;
            this.lastFetchTime = cacheData.lastFetchTime;
            
            console.log(`💾 Saved ${data.length} bonding tokens to cache`);
            console.log(`   Database: ${this.dbFile}`);
            
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
     * Fetch bonding tokens from Moralis API
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
                const tokens = response.data.result;
                console.log(`✅ Fetched ${tokens.length} bonding tokens from Moralis`);
                
                // Log sample token for debugging
                if (tokens.length > 0) {
                    const sample = tokens[0];
                    console.log(`   Sample: ${sample.symbol} (${sample.tokenAddress.substring(0, 8)}...) - ${sample.bondingCurveProgress.toFixed(2)}%`);
                }
                
                return tokens;
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
                console.log(`💾 Using cached bonding tokens (${this.cachedData.length} tokens)`);
                return {
                    success: true,
                    data: this.cachedData.slice(0, limit),
                    source: 'cache',
                    lastFetch: this.lastFetchTime,
                    count: this.cachedData.length
                };
            }
            
            // Fetch fresh data from API
            console.log(`🔄 Cache expired or force refresh requested, fetching from API...`);
            const tokens = await this.fetchBondingTokens(limit);
            
            // Save to cache
            await this.saveCachedData(tokens);
            
            return {
                success: true,
                data: tokens,
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
                    data: this.cachedData.slice(0, limit),
                    source: 'stale_cache',
                    lastFetch: this.lastFetchTime,
                    count: this.cachedData.length,
                    warning: 'Using stale cached data due to API error'
                };
            }
            
            return {
                success: false,
                error: error.message,
                data: [],
                source: 'error',
                count: 0
            };
        }
    }

    /**
     * Get tokens close to graduation (high bonding curve progress)
     */
    async getTokensCloseToGraduation(threshold = 95, limit = 10) {
        const result = await this.getBondingTokens(50); // Get more tokens to filter
        
        if (!result.success) {
            return result;
        }
        
        const closeToGraduation = result.data.filter(token => 
            token.bondingCurveProgress >= threshold
        ).slice(0, limit);
        
        console.log(`🎯 Found ${closeToGraduation.length} tokens close to graduation (≥${threshold}%)`);
        
        return {
            ...result,
            data: closeToGraduation,
            count: closeToGraduation.length,
            threshold: threshold
        };
    }

    /**
     * Get database statistics
     */
    async getStats() {
        try {
            await this.loadCachedData();
            
            return {
                success: true,
                stats: {
                    cachedTokens: this.cachedData?.length || 0,
                    lastFetchTime: this.lastFetchTime,
                    lastFetchAge: this.lastFetchTime ? Date.now() - this.lastFetchTime : null,
                    cacheValid: this.isCacheValid(),
                    databaseFile: this.dbFile,
                    dataDirectory: this.dataDir
                }
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                stats: null
            };
        }
    }

    /**
     * Monitor bonding status for a specific token
     */
    async getBondingStatus(tokenAddress) {
        if (!this.moralisApiKey) {
            throw new Error('Moralis API key not configured');
        }

        const url = `https://solana-gateway.moralis.io/token/mainnet/${tokenAddress}/bonding-status`;
        
        try {
            console.log(`🔍 Monitoring bonding status for ${tokenAddress.substring(0, 8)}...`);
            
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
                
                return {
                    success: true,
                    data: {
                        mint: status.mint,
                        bondingProgress: status.bondingProgress,
                        timestamp: Date.now(),
                        isCloseToGraduation: status.bondingProgress >= 95,
                        graduationProximity: this.calculateGraduationProximity(status.bondingProgress)
                    }
                };
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
     * Monitor multiple tokens for graduation
     */
    async monitorTokensForGraduation(tokenAddresses, threshold = 95) {
        console.log(`🎯 Monitoring ${tokenAddresses.length} tokens for graduation (threshold: ${threshold}%)`);
        
        const results = [];
        const alerts = [];
        
        for (const tokenAddress of tokenAddresses) {
            try {
                const status = await this.getBondingStatus(tokenAddress);
                
                if (status.success) {
                    const data = status.data;
                    results.push(data);
                    
                    // Check if token is close to graduation
                    if (data.bondingProgress >= threshold) {
                        alerts.push({
                        tokenAddress: tokenAddress,
                        bondingProgress: data.bondingProgress,
                        graduationProximity: data.graduationProximity,
                        timestamp: data.timestamp,
                        message: `🚨 ${tokenAddress.substring(0, 8)} is ${data.bondingProgress.toFixed(2)}% complete - ${data.graduationProximity.replace(/_/g, ' ')}`
                        });
                    }
                }
                
                // Small delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 100));
                
            } catch (error) {
                console.error(`❌ Failed to monitor ${tokenAddress.substring(0, 8)}:`, error.message);
                results.push({
                    tokenAddress: tokenAddress,
                    error: error.message,
                    timestamp: Date.now()
                });
            }
        }
        
        console.log(`✅ Monitoring complete: ${results.length} tokens checked, ${alerts.length} alerts generated`);
        
        return {
            success: true,
            results: results,
            alerts: alerts,
            summary: {
                totalTokens: tokenAddresses.length,
                successfulChecks: results.filter(r => !r.error).length,
                failedChecks: results.filter(r => r.error).length,
                alertsGenerated: alerts.length,
                threshold: threshold
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
            const tokenAddresses = bondingResult.data.map(token => token.tokenAddress);
            
            // Monitor them for graduation
            const monitoringResult = await this.monitorTokensForGraduation(tokenAddresses, threshold);
            
            return {
                success: true,
                alerts: monitoringResult.alerts,
                summary: monitoringResult.summary,
                timestamp: Date.now()
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
     */
    async startContinuousMonitoring(intervalMs = 60000, threshold = 95) {
        console.log(`🔄 Starting continuous graduation monitoring (interval: ${intervalMs}ms, threshold: ${threshold}%)`);
        
        const monitoringInterval = setInterval(async () => {
            try {
                console.log(`\n⏰ [${new Date().toISOString()}] Running graduation check...`);
                
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
                console.error('❌ Continuous monitoring error:', error.message);
            }
        }, intervalMs);
        
        return {
            intervalId: monitoringInterval,
            stop: () => {
                console.log('🛑 Stopping continuous graduation monitoring');
                clearInterval(monitoringInterval);
            }
        };
    }

    /**
     * Save graduation alerts to database
     */
    async saveGraduationAlerts(alerts) {
        try {
            await this.ensureDataDir();
            
            const alertsFile = path.join(this.dataDir, 'graduation-alerts.json');
            
            // Load existing alerts
            let existingAlerts = [];
            try {
                const data = await fs.readFile(alertsFile, 'utf8');
                existingAlerts = JSON.parse(data);
            } catch (error) {
                // File doesn't exist, start with empty array
            }
            
            // Add new alerts
            const newAlerts = alerts.map(alert => ({
                ...alert,
                id: `${alert.tokenAddress}_${alert.timestamp}`,
                createdAt: new Date().toISOString()
            }));
            
            // Combine and deduplicate
            const allAlerts = [...existingAlerts, ...newAlerts];
            const uniqueAlerts = allAlerts.filter((alert, index, self) => 
                index === self.findIndex(a => a.id === alert.id)
            );
            
            // Keep only last 100 alerts
            const recentAlerts = uniqueAlerts.slice(-100);
            
            // Save to file
            await fs.writeFile(alertsFile, JSON.stringify(recentAlerts, null, 2));
            
            console.log(`💾 Saved ${newAlerts.length} graduation alerts to database`);
            
        } catch (error) {
            console.error('❌ Failed to save graduation alerts:', error.message);
        }
    }

    /**
     * Get saved graduation alerts
     */
    async getSavedGraduationAlerts(limit = 50) {
        try {
            const alertsFile = path.join(this.dataDir, 'graduation-alerts.json');
            const data = await fs.readFile(alertsFile, 'utf8');
            const alerts = JSON.parse(data);
            
            return {
                success: true,
                alerts: alerts.slice(-limit),
                count: alerts.length
            };
        } catch (error) {
            if (error.code === 'ENOENT') {
                return {
                    success: true,
                    alerts: [],
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
     * Track tokens that enter PreBonding cache and monitor their progression
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
            const newEntries = [];
            const progressions = [];
            
            for (const token of bondingResult.data) {
                const tokenAddress = token.tokenAddress;
                const currentProgress = token.bondingCurveProgress;
                
                // Check if this token is already being tracked
                const existingEntry = trackingData.find(entry => entry.tokenAddress === tokenAddress);
                
                if (existingEntry) {
                    // Update existing tracking entry
                    const previousProgress = existingEntry.lastProgress;
                    const progressChange = currentProgress - previousProgress;
                    
                    const updatedEntry = {
                        ...existingEntry,
                        lastProgress: currentProgress,
                        lastUpdate: Date.now(),
                        progressChange: progressChange,
                        currentProximity: this.calculateGraduationProximity(currentProgress),
                        totalProgressGained: existingEntry.totalProgressGained + Math.max(0, progressChange)
                    };
                    
                    trackedTokens.push(updatedEntry);
                    
                    // Track significant progressions
                    if (progressChange > 0.5) { // Significant progress (>0.5%)
                        progressions.push({
                            tokenAddress: tokenAddress,
                            symbol: token.symbol,
                            previousProgress: previousProgress,
                            currentProgress: currentProgress,
                            progressChange: progressChange,
                            proximityLevel: this.calculateGraduationProximity(currentProgress),
                            timestamp: Date.now()
                        });
                    }
                    
                } else {
                    // New token entry - add to tracking
                    const newEntry = {
                        tokenAddress: tokenAddress,
                        symbol: token.symbol,
                        name: token.name,
                        firstSeen: Date.now(),
                        firstProgress: currentProgress,
                        lastProgress: currentProgress,
                        lastUpdate: Date.now(),
                        progressChange: 0,
                        totalProgressGained: 0,
                        currentProximity: this.calculateGraduationProximity(currentProgress),
                        graduationAlerts: 0,
                        status: 'TRACKING'
                    };
                    
                    trackedTokens.push(newEntry);
                    newEntries.push(newEntry);
                }
            }
            
            // Save updated tracking data
            await this.saveTrackingData(trackedTokens);
            
            console.log(`✅ Tracking complete:`);
            console.log(`   Total tracked tokens: ${trackedTokens.length}`);
            console.log(`   New entries: ${newEntries.length}`);
            console.log(`   Progressions detected: ${progressions.length}`);
            
            return {
                success: true,
                trackedTokens: trackedTokens,
                newEntries: newEntries,
                progressions: progressions,
                summary: {
                    totalTracked: trackedTokens.length,
                    newTokens: newEntries.length,
                    progressions: progressions.length,
                    timestamp: Date.now()
                }
            };
            
        } catch (error) {
            console.error('❌ Failed to track PreBonding tokens:', error.message);
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
            await this.ensureDataDir();
            const trackingFile = path.join(this.dataDir, 'prebonding-tracking.json');
            
            const data = await fs.readFile(trackingFile, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.log('📊 Starting with empty tracking data');
                return [];
            }
            console.error('❌ Failed to load tracking data:', error.message);
            return [];
        }
    }

    /**
     * Save tracking data to database
     */
    async saveTrackingData(trackingData) {
        try {
            await this.ensureDataDir();
            const trackingFile = path.join(this.dataDir, 'prebonding-tracking.json');
            
            // Keep only last 200 tracked tokens to prevent file from growing too large
            const recentData = trackingData.slice(-200);
            
            await fs.writeFile(trackingFile, JSON.stringify(recentData, null, 2));
            console.log(`💾 Saved ${recentData.length} tracked tokens to database`);
        } catch (error) {
            console.error('❌ Failed to save tracking data:', error.message);
        }
    }

    /**
     * Get tracking statistics and alerts
     */
    async getTrackingStats() {
        try {
            const trackingData = await this.loadTrackingData();
            
            const stats = {
                totalTracked: trackingData.length,
                byProximityLevel: {
                    IMMINENT_GRADUATION: 0,
                    VERY_CLOSE_TO_GRADUATION: 0,
                    CLOSE_TO_GRADUATION: 0,
                    APPROACHING_GRADUATION: 0,
                    FAR_FROM_GRADUATION: 0
                },
                recentProgressions: 0,
                newTokensToday: 0,
                averageProgress: 0,
                topProgressors: []
            };
            
            const today = Date.now() - (24 * 60 * 60 * 1000); // 24 hours ago
            
            trackingData.forEach(token => {
                // Count by proximity level
                stats.byProximityLevel[token.currentProximity]++;
                
                // Count recent progressions
                if (token.lastUpdate > today && token.progressChange > 0.5) {
                    stats.recentProgressions++;
                }
                
                // Count new tokens today
                if (token.firstSeen > today) {
                    stats.newTokensToday++;
                }
            });
            
            // Calculate average progress
            if (trackingData.length > 0) {
                stats.averageProgress = trackingData.reduce((sum, token) => sum + token.lastProgress, 0) / trackingData.length;
            }
            
            // Get top progressors (highest total progress gained)
            stats.topProgressors = trackingData
                .filter(token => token.totalProgressGained > 0)
                .sort((a, b) => b.totalProgressGained - a.totalProgressGained)
                .slice(0, 10)
                .map(token => ({
                    symbol: token.symbol,
                    tokenAddress: token.tokenAddress,
                    totalProgressGained: token.totalProgressGained,
                    currentProgress: token.lastProgress,
                    proximityLevel: token.currentProximity
                }));
            
            return {
                success: true,
                stats: stats,
                timestamp: Date.now()
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
     * Get tokens by proximity level (sorted by imminent graduation first)
     */
    async getTokensByProximityLevel(proximityLevel = null) {
        try {
            const trackingData = await this.loadTrackingData();
            
            let filteredTokens = trackingData;
            
            if (proximityLevel) {
                filteredTokens = trackingData.filter(token => token.currentProximity === proximityLevel);
            }
            
            // Sort by graduation proximity (imminent first, far from graduation last)
            const proximityOrder = {
                'IMMINENT_GRADUATION': 1,
                'VERY_CLOSE_TO_GRADUATION': 2,
                'CLOSE_TO_GRADUATION': 3,
                'APPROACHING_GRADUATION': 4,
                'FAR_FROM_GRADUATION': 5
            };
            
            filteredTokens.sort((a, b) => {
                const orderA = proximityOrder[a.currentProximity] || 999;
                const orderB = proximityOrder[b.currentProximity] || 999;
                
                if (orderA !== orderB) {
                    return orderA - orderB; // Sort by proximity level first
                }
                
                return b.lastProgress - a.lastProgress; // Then by progress (highest first)
            });
            
            console.log(`🎯 Found ${filteredTokens.length} tokens${proximityLevel ? ` with ${proximityLevel.replace(/_/g, ' ')}` : ''}`);
            
            return {
                success: true,
                tokens: filteredTokens,
                count: filteredTokens.length,
                proximityLevel: proximityLevel
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
     * Enhanced graduation monitoring with tracking integration
     */
    async getEnhancedGraduationAlerts(threshold = 95) {
        try {
            // First, update tracking data
            const trackingResult = await this.trackPreBondingTokens();
            
            if (!trackingResult.success) {
                return {
                    success: false,
                    error: 'Failed to track PreBonding tokens',
                    alerts: []
                };
            }
            
            // Get graduation alerts
            const alertsResult = await this.getGraduationAlerts(threshold);
            
            // Enhance alerts with tracking data
            const enhancedAlerts = alertsResult.alerts.map(alert => {
                const trackedToken = trackingResult.trackedTokens.find(
                    token => token.tokenAddress === alert.tokenAddress
                );
                
                return {
                    ...alert,
                    trackingData: trackedToken ? {
                        firstSeen: trackedToken.firstSeen,
                        firstProgress: trackedToken.firstProgress,
                        totalProgressGained: trackedToken.totalProgressGained,
                        daysTracked: Math.floor((Date.now() - trackedToken.firstSeen) / (24 * 60 * 60 * 1000)),
                        progressionRate: trackedToken.totalProgressGained / Math.max(1, Math.floor((Date.now() - trackedToken.firstSeen) / (60 * 60 * 1000))) // progress per hour
                    } : null
                };
            });
            
            return {
                success: true,
                alerts: enhancedAlerts,
                trackingSummary: trackingResult.summary,
                timestamp: Date.now()
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
     * Clear cache and force refresh
     */
    async clearCache() {
        try {
            await fs.unlink(this.dbFile);
            this.cachedData = null;
            this.lastFetchTime = null;
            console.log('🗑️ Cache cleared successfully');
            return { success: true };
        } catch (error) {
            if (error.code !== 'ENOENT') {
                console.error('❌ Failed to clear cache:', error.message);
                return { success: false, error: error.message };
            }
            console.log('🗑️ Cache already empty');
            return { success: true };
        }
    }
}

export default BondingTokensService;
