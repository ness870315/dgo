import TokenMetadataService from './TokenMetadataService.js';

/**
 * Background Token Metadata Updater
 * Periodically updates token supply and metadata from Jupiter API
 * Runs every 24 hours to keep metadata fresh
 */
class TokenMetadataUpdater {
    constructor(enhancedHybridPriceService) {
        this.tokenMetadata = enhancedHybridPriceService.tokenMetadata;
        this.makeJupiterRequest = enhancedHybridPriceService.makeJupiterRequest.bind(enhancedHybridPriceService);
        this.isRunning = false;
        this.updateInterval = 24 * 60 * 60 * 1000; // 24 hours
        this.batchSize = 100; // Process 100 tokens at a time (Jupiter API limit)
        this.delayBetweenBatches = 2000; // 2 seconds between batches (reduced since we're more efficient)
    }

    async start() {
        if (this.isRunning) {
            console.log('⚠️ [TokenMetadataUpdater] Already running');
            return;
        }

        console.log('🚀 [TokenMetadataUpdater] Starting background metadata updater...');
        this.isRunning = true;

        // Initial update after 1 minute
        setTimeout(() => this.updateMetadata(), 60000);

        // Then update every 24 hours
        setInterval(() => this.updateMetadata(), this.updateInterval);
    }

    async updateMetadata() {
        if (!this.isRunning) return;

        try {
            console.log('🔄 [TokenMetadataUpdater] Starting metadata update cycle...');
            
            const tokensToUpdate = this.tokenMetadata.getTokensNeedingUpdate();
            console.log(`📊 [TokenMetadataUpdater] Found ${tokensToUpdate.length} tokens needing updates`);

            if (tokensToUpdate.length === 0) {
                console.log('✅ [TokenMetadataUpdater] All tokens have recent metadata');
                return;
            }

            // Process tokens in batches to avoid rate limiting
            for (let i = 0; i < tokensToUpdate.length; i += this.batchSize) {
                const batch = tokensToUpdate.slice(i, i + this.batchSize);
                const batchNumber = Math.floor(i / this.batchSize) + 1;
                const totalBatches = Math.ceil(tokensToUpdate.length / this.batchSize);

                console.log(`📦 [TokenMetadataUpdater] Processing batch ${batchNumber}/${totalBatches} (${batch.length} tokens) - Jupiter API supports 100 per call`);

                await this.processBatch(batch);

                // Delay between batches to avoid rate limiting
                if (i + this.batchSize < tokensToUpdate.length) {
                    console.log(`⏳ [TokenMetadataUpdater] Waiting ${this.delayBetweenBatches/1000}s before next batch...`);
                    await new Promise(resolve => setTimeout(resolve, this.delayBetweenBatches));
                }
            }

            console.log('✅ [TokenMetadataUpdater] Metadata update cycle completed');

        } catch (error) {
            console.error('❌ [TokenMetadataUpdater] Failed to update metadata:', error.message);
        }
    }

    async processBatch(tokenAddresses) {
        try {
            console.log(`🔍 [TokenMetadataUpdater] Updating batch of ${tokenAddresses.length} tokens...`);

            // Create comma-separated query string for Jupiter batch API
            const queryString = tokenAddresses.join(',');
            const JUPITER_API_ENDPOINT = process.env.JUP_API_ENDPOINT || 'https://api.jup.ag';
            const data = await this.makeJupiterRequest(`${JUPITER_API_ENDPOINT}/tokens/v2/search`, {
                query: queryString
            });

            if (data && Array.isArray(data)) {
                console.log(`📊 [TokenMetadataUpdater] Jupiter returned ${data.length} tokens for batch`);
                
                // Process each token in the response
                for (const jupiterData of data) {
                    if (jupiterData.id) {
                        await this.tokenMetadata.updateTokenMetadata(jupiterData.id, jupiterData);
                        console.log(`✅ [TokenMetadataUpdater] Updated ${jupiterData.id.substring(0, 8)}: ${jupiterData.symbol}`);
                    }
                }
                
                // Check for any tokens that weren't found in Jupiter response
                const foundTokens = new Set(data.map(token => token.id));
                const missingTokens = tokenAddresses.filter(addr => !foundTokens.has(addr));
                
                if (missingTokens.length > 0) {
                    console.log(`⚠️ [TokenMetadataUpdater] ${missingTokens.length} tokens not found in Jupiter: ${missingTokens.map(addr => addr.substring(0, 8)).join(', ')}`);
                }
                
            } else {
                console.log(`⚠️ [TokenMetadataUpdater] No Jupiter data returned for batch`);
            }

        } catch (error) {
            console.error(`❌ [TokenMetadataUpdater] Failed to update batch:`, error.message);
        }
    }

    stop() {
        this.isRunning = false;
        console.log('🛑 [TokenMetadataUpdater] Stopped');
    }

    getStats() {
        return {
            isRunning: this.isRunning,
            updateInterval: this.updateInterval,
            batchSize: this.batchSize,
            metadataStats: this.tokenMetadata.getStats()
        };
    }
}

export default TokenMetadataUpdater;
