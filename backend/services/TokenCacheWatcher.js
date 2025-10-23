import { watch } from 'fs';
import { readFile } from 'fs/promises';
import path from 'path';
import { EventEmitter } from 'events';

/**
 * Token Cache Watcher (Deployment-Safe Version)
 * Monitors tokens-cache.json for changes and automatically subscribes new tokens
 */
class TokenCacheWatcher extends EventEmitter {
    constructor(cachePath, realTimeTokenMonitor) {
        super();
        this.cachePath = cachePath;
        this.realTimeTokenMonitor = realTimeTokenMonitor;
        this.lastKnownTokens = new Set();
        this.watcher = null;
        this.debounceTimer = null;
        this.isWatching = false;
        this.stats = {
            fileChangesDetected: 0,
            newTokensSubscribed: 0,
            lastCheck: null,
            lastFileChange: null,
            errors: 0
        };
    }

    /**
     * Start watching the cache file
     */
    async startWatching() {
        if (this.isWatching) {
            console.log('⚠️ [TokenCacheWatcher] Already watching.');
            return;
        }

        try {
            console.log(`🚀 [TokenCacheWatcher] Starting to watch: ${this.cachePath}`);
            await this.loadInitialCache();

            this.watcher = watch(this.cachePath, { persistent: true, recursive: false }, (eventType, filename) => {
                if (filename) {
                    this.stats.fileChangesDetected++;
                    this.stats.lastFileChange = new Date().toISOString();
                    console.log(`📁 [TokenCacheWatcher] File change detected (${eventType}): ${filename}`);
                    
                    // Debounce to avoid multiple rapid triggers
                    clearTimeout(this.debounceTimer);
                    this.debounceTimer = setTimeout(() => this.processFileChange(), 1000); // 1 second debounce
                }
            });

            this.isWatching = true;
            console.log('✅ [TokenCacheWatcher] File watcher initialized.');
            
        } catch (error) {
            console.error('❌ [TokenCacheWatcher] Failed to start watching:', error.message);
            this.stats.errors++;
        }
    }

    /**
     * Stop watching the cache file
     */
    stopWatching() {
        if (this.watcher) {
            this.watcher.close();
            this.watcher = null;
            this.isWatching = false;
            console.log('🛑 [TokenCacheWatcher] Stopped watching.');
        }
        
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }
    }

    /**
     * Load initial cache state
     */
    async loadInitialCache() {
        try {
            const data = await readFile(this.cachePath, 'utf8');
            const tokens = JSON.parse(data);
            this.lastKnownTokens = new Set(tokens.map(t => t.contractAddress));
            console.log(`📊 [TokenCacheWatcher] Initial cache loaded with ${this.lastKnownTokens.size} tokens.`);
        } catch (error) {
            console.warn(`⚠️ [TokenCacheWatcher] Could not load initial cache: ${error.message}. Starting with empty token list.`);
            this.lastKnownTokens = new Set();
        }
    }

    /**
     * Process file changes and detect new tokens
     */
    async processFileChange() {
        this.stats.lastCheck = new Date().toISOString();
        console.log('🔄 [TokenCacheWatcher] Processing file change...');
        
        try {
            const data = await readFile(this.cachePath, 'utf8');
            const currentTokens = JSON.parse(data);
            const currentTokenAddresses = new Set(currentTokens.map(t => t.contractAddress));

            const newTokens = currentTokens.filter(token => 
                token.contractAddress && !this.lastKnownTokens.has(token.contractAddress)
            );

            if (newTokens.length > 0) {
                console.log(`🆕 [TokenCacheWatcher] Found ${newTokens.length} new tokens.`);
                this.emit('newTokens', newTokens);

                for (const newToken of newTokens) {
                    try {
                        const subscribed = await this.realTimeTokenMonitor.addToken(newToken);
                        if (subscribed) {
                            this.stats.newTokensSubscribed++;
                            this.emit('tokenSubscribed', { 
                                symbol: newToken.symbol, 
                                contractAddress: newToken.contractAddress 
                            });
                        }
                    } catch (error) {
                        console.error(`❌ [TokenCacheWatcher] Failed to subscribe token ${newToken.symbol}:`, error.message);
                        this.stats.errors++;
                    }
                }
            } else {
                console.log('✅ [TokenCacheWatcher] No new tokens found.');
            }

            this.lastKnownTokens = currentTokenAddresses; // Update last known state
            
        } catch (error) {
            console.error('❌ [TokenCacheWatcher] Error processing file change:', error.message);
            this.stats.errors++;
        }
    }

    /**
     * Manually check for new tokens (useful for testing)
     */
    async checkForNewTokens() {
        console.log('🔍 [TokenCacheWatcher] Manually checking for new tokens...');
        await this.processFileChange();
    }

    /**
     * Get watcher statistics
     */
    getStats() {
        return {
            ...this.stats,
            isWatching: this.isWatching,
            currentCachedTokens: this.lastKnownTokens.size,
            cachePath: this.cachePath
        };
    }
}

export default TokenCacheWatcher;