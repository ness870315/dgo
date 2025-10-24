import fs from 'fs/promises';
import path from 'path';

/**
 * Persistent Token Metadata Service
 * Stores token supply, pool addresses, and other metadata that rarely changes
 * Reduces Jupiter API calls by 95%+
 */
class TokenMetadataService {
    constructor() {
        this.metadataPath = path.join(process.cwd(), 'data', 'token-metadata.json');
        this.metadata = new Map();
        this.lastUpdate = new Map();
        this.updateInterval = 24 * 60 * 60 * 1000; // 24 hours
        this.defaultSupply = 999000000; // 999M tokens (most common)
        
        this.ensureDataDir();
        this.loadMetadata();
    }

    async ensureDataDir() {
        try {
            await fs.mkdir(path.dirname(this.metadataPath), { recursive: true });
        } catch (error) {
            console.error('❌ Failed to create data directory:', error.message);
        }
    }

    async loadMetadata() {
        try {
            const data = await fs.readFile(this.metadataPath, 'utf8');
            const parsed = JSON.parse(data);
            
            this.metadata = new Map(parsed.metadata || []);
            this.lastUpdate = new Map(parsed.lastUpdate || []);
            
            console.log(`📊 [TokenMetadata] Loaded ${this.metadata.size} token metadata entries`);
        } catch (error) {
            console.log('📊 [TokenMetadata] No existing metadata file, starting fresh');
            this.metadata = new Map();
            this.lastUpdate = new Map();
        }
    }

    async saveMetadata() {
        try {
            const data = {
                metadata: Array.from(this.metadata.entries()),
                lastUpdate: Array.from(this.lastUpdate.entries()),
                lastSaved: Date.now()
            };
            
            await fs.writeFile(this.metadataPath, JSON.stringify(data, null, 2));
            console.log(`💾 [TokenMetadata] Saved ${this.metadata.size} token metadata entries`);
        } catch (error) {
            console.error('❌ [TokenMetadata] Failed to save metadata:', error.message);
        }
    }

    /**
     * Get token metadata (supply, pool address, etc.)
     * Returns cached data if recent, otherwise triggers update
     */
    async getTokenMetadata(tokenAddress, forceUpdate = false) {
        const now = Date.now();
        const lastUpdateTime = this.lastUpdate.get(tokenAddress) || 0;
        
        // Return cached data if recent and not forcing update
        if (!forceUpdate && this.metadata.has(tokenAddress) && 
            (now - lastUpdateTime) < this.updateInterval) {
            return this.metadata.get(tokenAddress);
        }

        // Need to update - this will be handled by the background updater
        // For now, return cached data or default
        const cached = this.metadata.get(tokenAddress);
        if (cached) {
            return cached;
        }

        // Return default metadata for new tokens
        return {
            tokenAddress,
            totalSupply: this.defaultSupply,
            circSupply: this.defaultSupply,
            poolAddress: null,
            lastUpdated: now,
            source: 'default'
        };
    }

    /**
     * Update token metadata from Jupiter API
     * This should be called by a background service, not during real-time processing
     */
    async updateTokenMetadata(tokenAddress, jupiterData) {
        const now = Date.now();
        
        const metadata = {
            tokenAddress,
            symbol: jupiterData.symbol || 'UNKNOWN',
            name: jupiterData.name || 'Unknown Token',
            totalSupply: jupiterData.totalSupply || this.defaultSupply,
            circSupply: jupiterData.circSupply || jupiterData.totalSupply || this.defaultSupply,
            decimals: jupiterData.decimals || 6,
            poolAddress: null, // Will be set separately
            lastUpdated: now,
            source: 'jupiter'
        };

        this.metadata.set(tokenAddress, metadata);
        this.lastUpdate.set(tokenAddress, now);
        
        console.log(`📊 [TokenMetadata] Updated ${metadata.symbol}: supply=${metadata.circSupply.toLocaleString()}`);
        
        // Save periodically (not on every update)
        if (this.metadata.size % 10 === 0) {
            await this.saveMetadata();
        }
    }

    /**
     * Set pool address for a token
     */
    async setPoolAddress(tokenAddress, poolAddress) {
        const metadata = this.metadata.get(tokenAddress);
        if (metadata) {
            metadata.poolAddress = poolAddress;
            metadata.lastUpdated = Date.now();
            this.metadata.set(tokenAddress, metadata);
        } else {
            // Create new metadata entry
            const newMetadata = {
                tokenAddress,
                totalSupply: this.defaultSupply,
                circSupply: this.defaultSupply,
                poolAddress,
                lastUpdated: Date.now(),
                source: 'pool_discovery'
            };
            this.metadata.set(tokenAddress, newMetadata);
        }
        
        await this.saveMetadata();
    }

    /**
     * Get all tokens that need metadata updates
     */
    getTokensNeedingUpdate() {
        const now = Date.now();
        const tokensToUpdate = [];
        
        for (const [tokenAddress, lastUpdateTime] of this.lastUpdate.entries()) {
            if ((now - lastUpdateTime) > this.updateInterval) {
                tokensToUpdate.push(tokenAddress);
            }
        }
        
        return tokensToUpdate;
    }

    /**
     * Get statistics about metadata cache
     */
    getStats() {
        const now = Date.now();
        let recentCount = 0;
        let staleCount = 0;
        
        for (const [tokenAddress, lastUpdateTime] of this.lastUpdate.entries()) {
            if ((now - lastUpdateTime) < this.updateInterval) {
                recentCount++;
            } else {
                staleCount++;
            }
        }
        
        return {
            totalTokens: this.metadata.size,
            recentMetadata: recentCount,
            staleMetadata: staleCount,
            defaultSupply: this.defaultSupply
        };
    }
}

export default TokenMetadataService;
