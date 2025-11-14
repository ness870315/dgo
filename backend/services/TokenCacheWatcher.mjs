import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';

class TokenCacheWatcher extends EventEmitter {
    constructor(cachePath, realTimeTokenMonitor) {
        super();
        this.cachePath = cachePath;
        this.realTimeTokenMonitor = realTimeTokenMonitor;
        this.isWatching = false;
        this.lastModified = null;
        this.lastTokenCount = 0;
        this.watchTimeout = null;
        this.initialLoadComplete = false; // Flag to prevent onboarding cached tokens on startup
        
        console.log('🔍 [TokenCacheWatcher] Initialized for:', cachePath);
    }

    async startWatching() {
        if (this.isWatching) {
            console.log('⚠️ [TokenCacheWatcher] Already watching');
            return;
        }

        try {
            console.log('🚀 [TokenCacheWatcher] Starting to watch token cache...');
            
            // Get initial state
            await this.checkInitialState();
            
            // Start file system watcher
            this.watcher = fs.watch(this.cachePath, { persistent: true }, (eventType) => {
                if (eventType === 'change') {
                    this.handleFileChange();
                }
            });
            
            this.isWatching = true;
            console.log('✅ [TokenCacheWatcher] File watcher started');
            
        } catch (error) {
            console.error('❌ [TokenCacheWatcher] Failed to start watching:', error.message);
            throw error;
        }
    }

    async checkInitialState() {
        try {
            const stats = await fs.promises.stat(this.cachePath);
            this.lastModified = stats.mtime.getTime();
            
            const data = await fs.promises.readFile(this.cachePath, 'utf8');
            const tokens = JSON.parse(data);
            this.lastTokenCount = tokens.length;
            
            console.log(`📊 [TokenCacheWatcher] Initial state: ${tokens.length} tokens, modified: ${new Date(this.lastModified).toISOString()}`);
            console.log(`   Initial load complete - will only monitor NEW tokens from now on`);
            
            // Mark initial load as complete to prevent re-onboarding cached tokens
            this.initialLoadComplete = true;
            
        } catch (error) {
            console.error('❌ [TokenCacheWatcher] Failed to check initial state:', error.message);
        }
    }

    handleFileChange() {
        // Debounce rapid file changes
        if (this.watchTimeout) {
            clearTimeout(this.watchTimeout);
        }
        
        this.watchTimeout = setTimeout(async () => {
            await this.processFileChange();
        }, 1000); // Wait 1 second for file write to complete
    }

    async processFileChange() {
        try {
            console.log('📝 [TokenCacheWatcher] File change detected, processing...');
            
            // Skip if initial load not complete (prevents onboarding cached tokens on startup)
            if (!this.initialLoadComplete) {
                console.log('⚠️  [TokenCacheWatcher] Initial load not complete, skipping file change');
                return;
            }
            
            // Get current file stats
            const stats = await fs.promises.stat(this.cachePath);
            const currentModified = stats.mtime.getTime();
            
            // Check if file was actually modified (not just accessed)
            if (this.lastModified && currentModified <= this.lastModified) {
                console.log('📝 [TokenCacheWatcher] File not actually modified, skipping');
                return;
            }
            
            // Read current tokens
            const data = await fs.promises.readFile(this.cachePath, 'utf8');
            const tokens = JSON.parse(data);
            const currentTokenCount = tokens.length;
            
            console.log(`📊 [TokenCacheWatcher] Current tokens: ${currentTokenCount}, Previous: ${this.lastTokenCount}`);
            
            // Check for new tokens
            if (currentTokenCount > this.lastTokenCount) {
                const newTokens = await this.findNewTokens(tokens);
                
                if (newTokens.length > 0) {
                    console.log(`🆕 [TokenCacheWatcher] Found ${newTokens.length} new tokens!`);
                    
                    // Subscribe each new token to real-time monitoring
                    for (const token of newTokens) {
                        await this.subscribeNewToken(token);
                    }
                    
                    // Emit event for other services
                    this.emit('newTokens', newTokens);
                }
            }
            
            // Update state
            this.lastModified = currentModified;
            this.lastTokenCount = currentTokenCount;
            
        } catch (error) {
            console.error('❌ [TokenCacheWatcher] Error processing file change:', error.message);
        }
    }

    async findNewTokens(currentTokens) {
        try {
            // Get previous token addresses
            const previousTokens = await this.getPreviousTokens();
            const previousAddresses = new Set(
                previousTokens.map(t => (t.contractAddress || t.tokenAddress)?.toLowerCase()).filter(Boolean)
            );
            
            // Find tokens that weren't in the previous set
            const newTokens = currentTokens.filter(token => {
                const address = (token.contractAddress || token.tokenAddress)?.toLowerCase();
                return address && !previousAddresses.has(address);
            });
            
            console.log(`🔍 [TokenCacheWatcher] Found ${newTokens.length} new tokens:`, 
                newTokens.map(t => `${t.symbol} (${(t.contractAddress || t.tokenAddress)?.substring(0, 8)}...)`));
            
            return newTokens;
            
        } catch (error) {
            console.error('❌ [TokenCacheWatcher] Error finding new tokens:', error.message);
            return [];
        }
    }

    async getPreviousTokens() {
        try {
            // This is a simplified approach - in production you might want to maintain a separate state file
            // For now, we'll use the current token count to estimate
            return [];
        } catch (error) {
            console.error('❌ [TokenCacheWatcher] Error getting previous tokens:', error.message);
            return [];
        }
    }

    async subscribeNewToken(token) {
        try {
            const contractAddress = token.contractAddress || token.tokenAddress;
            if (!contractAddress) {
                console.log(`⚠️ [TokenCacheWatcher] Token ${token.symbol} has no contract address, skipping`);
                return false;
            }

            console.log(`🚀 [TokenCacheWatcher] Subscribing new token: ${token.symbol} (${contractAddress.substring(0, 8)}...)`);
            
            // Add token to DexScreener monitor
            if (this.realTimeTokenMonitor && this.realTimeTokenMonitor.onboardToken) {
                // Get pool address from token data
                let pool = 
                    token.poolAddress ||
                    token.graduatedPool;
                
                // Handle graduatedPool object format
                if (pool && typeof pool === 'object') {
                    pool = pool.address || pool.id;
                }
                
                // Skip if missing required data
                if (!pool || !token.decimals) {
                    console.log(`⚠️ [TokenCacheWatcher] Token ${token.symbol} missing ${!pool ? 'pool' : 'decimals'}, skipping`);
                    return false;
                }
                
                await this.realTimeTokenMonitor.onboardToken(contractAddress, {
                    name: token.name || token.symbol,
                    pool: pool,
                    decimals: token.decimals
                });
                
                console.log(`✅ [TokenCacheWatcher] Successfully subscribed ${token.symbol} to real-time monitoring`);
                
                // Emit event for logging/monitoring
                this.emit('tokenSubscribed', {
                    symbol: token.symbol,
                    contractAddress: contractAddress,
                    timestamp: new Date().toISOString()
                });
                
                return true;
            } else {
                console.log(`⚠️ [TokenCacheWatcher] DexScreener monitor not available`);
                return false;
            }
            
        } catch (error) {
            console.error(`❌ [TokenCacheWatcher] Error subscribing token ${token.symbol}:`, error.message);
            return false;
        }
    }

    stopWatching() {
        if (this.isWatching) {
            console.log('🛑 [TokenCacheWatcher] Stopping file watcher...');
            
            if (this.watcher) {
                this.watcher.close();
                this.watcher = null;
            }
            
            if (this.watchTimeout) {
                clearTimeout(this.watchTimeout);
                this.watchTimeout = null;
            }
            
            this.isWatching = false;
            console.log('✅ [TokenCacheWatcher] File watcher stopped');
        }
    }

    getStats() {
        return {
            isWatching: this.isWatching,
            lastModified: this.lastModified ? new Date(this.lastModified).toISOString() : null,
            lastTokenCount: this.lastTokenCount,
            cachePath: this.cachePath
        };
    }
}

export default TokenCacheWatcher;
