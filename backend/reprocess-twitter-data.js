import EnhancedTokenProcessor from './enhancedTokenProcessor.js';
import fs from 'fs/promises';
import path from 'path';

/**
 * Reprocess Script: Add Twitter Data to Tokens Without It
 * 
 * This script identifies tokens in the cache that don't have Twitter data
 * and feeds them through the EnhancedTokenProcessor to fetch:
 * - Tweets/mentions
 * - Engagement metrics (likes, retweets, replies)
 * - Community health score
 * - Sentiment analysis
 */

async function main() {
    console.log('🔄 Starting Twitter Data Reprocessing Script...\n');
    
    try {
        // Initialize EnhancedTokenProcessor
        console.log('📊 Initializing EnhancedTokenProcessor...');
        const processor = new EnhancedTokenProcessor();
        await processor.initialize();
        console.log('✅ EnhancedTokenProcessor initialized\n');
        
        // Load tokens from cache
        const dataDir = process.env.DATA_DIR || '/var/data/dgo';
        const cachePath = path.join(dataDir, 'cache', 'tokens-cache.json');
        
        console.log(`📂 Loading tokens from: ${cachePath}`);
        const cacheData = await fs.readFile(cachePath, 'utf8');
        const tokens = JSON.parse(cacheData);
        console.log(`✅ Loaded ${tokens.length} tokens from cache\n`);
        
        // Filter tokens that need Twitter data
        const tokensNeedingTwitterData = tokens.filter(token => {
            // Check if token has no Twitter data at all
            if (!token.twitterData) {
                return true;
            }
            
            // Check if Twitter data exists but has no tweets/mentions
            const hasTweets = token.twitterData.tweets && token.twitterData.tweets.length > 0;
            const hasMentions = token.twitterData.recentMentions && token.twitterData.recentMentions.length > 0;
            
            if (!hasTweets && !hasMentions) {
                return true;
            }
            
            // Check if Twitter data is very old (> 7 days)
            if (token.twitterTimestamp) {
                const lastUpdate = new Date(token.twitterTimestamp);
                const daysSinceUpdate = (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24);
                if (daysSinceUpdate > 7) {
                    console.log(`⏰ ${token.symbol}: Twitter data is ${Math.floor(daysSinceUpdate)} days old, will refresh`);
                    return true;
                }
            }
            
            return false;
        });
        
        console.log(`\n📊 Analysis Results:`);
        console.log(`   Total tokens: ${tokens.length}`);
        console.log(`   Tokens with Twitter data: ${tokens.length - tokensNeedingTwitterData.length}`);
        console.log(`   Tokens needing Twitter data: ${tokensNeedingTwitterData.length}\n`);
        
        if (tokensNeedingTwitterData.length === 0) {
            console.log('✅ All tokens already have Twitter data! Nothing to do.');
            process.exit(0);
        }
        
        // Show sample of tokens to be processed
        console.log(`📋 Sample tokens to be processed:`);
        tokensNeedingTwitterData.slice(0, 10).forEach((token, i) => {
            const reason = !token.twitterData 
                ? 'No Twitter data' 
                : 'Empty tweets/mentions';
            console.log(`   ${i + 1}. ${token.symbol} (${token.contractAddress?.substring(0, 8)}...) - ${reason}`);
        });
        if (tokensNeedingTwitterData.length > 10) {
            console.log(`   ... and ${tokensNeedingTwitterData.length - 10} more`);
        }
        console.log('');
        
        // Ask for confirmation (optional - comment out for automated runs)
        console.log(`⚠️  This will fetch Twitter data for ${tokensNeedingTwitterData.length} tokens`);
        console.log(`⚠️  Estimated time: ${Math.ceil(tokensNeedingTwitterData.length * 30 / 60)} minutes (30s per token)`);
        console.log(`⚠️  Twitter API costs: ~$${(tokensNeedingTwitterData.length * 0.15).toFixed(2)} (TwitterAPI.io)\n`);
        
        // Add tokens to processor queue
        console.log(`📥 Adding ${tokensNeedingTwitterData.length} tokens to processor queue...`);
        processor.processingQueue = tokensNeedingTwitterData;
        console.log(`✅ Tokens added to queue\n`);
        
        // Run through Twitter stage only (skip Jupiter - already have that data)
        console.log('🐦 Starting Twitter data fetching stage...');
        console.log('⏳ This may take a while...\n');
        
        const startTime = Date.now();
        await processor.processTwitterStage();
        const duration = Math.floor((Date.now() - startTime) / 1000);
        
        console.log(`\n✅ Twitter stage completed in ${Math.floor(duration / 60)}m ${duration % 60}s`);
        
        // Run through scoring stage to update scores with new Twitter data
        console.log('\n📊 Recalculating scores with new Twitter data...');
        await processor.processScoringStage();
        console.log('✅ Scoring stage completed');
        
        // Save updated tokens to cache
        console.log('\n💾 Saving updated tokens to cache...');
        await processor.saveFinalDatabase();
        console.log('✅ Tokens saved to cache');
        
        // Final stats
        console.log(`\n📊 Final Results:`);
        console.log(`   Tokens processed: ${tokensNeedingTwitterData.length}`);
        console.log(`   Time taken: ${Math.floor(duration / 60)}m ${duration % 60}s`);
        console.log(`   Average time per token: ${Math.floor(duration / tokensNeedingTwitterData.length)}s`);
        
        console.log('\n✅ Reprocessing completed successfully!');
        console.log('🎉 All tokens now have Twitter data and updated scores!\n');
        
        process.exit(0);
        
    } catch (error) {
        console.error('\n❌ Reprocessing failed:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

main();



