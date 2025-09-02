import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import EnhancedJupiterService from './enhancedJupiterService.js';
import DexscreenerApiService from './dexscreenerApiService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class EnhancedTokenProcessor {
  constructor() {
    this.isProcessing = false;
    this.currentStage = 'idle';
    this.processingQueue = [];
    this.processedTokens = [];
    this.stageProgress = {
      coingecko: { total: 0, processed: 0, status: 'pending' },
      dexscreener: { total: 0, processed: 0, status: 'pending' },
      jupiter: { total: 0, processed: 0, status: 'pending' },
      twitter: { total: 0, processed: 0, status: 'pending' },
      scoring: { total: 0, processed: 0, status: 'pending' }
    };
    
    // Initialize API services
    this.jupiterService = new EnhancedJupiterService();
    this.dexscreenerService = new DexscreenerApiService();
    
    // CONSERVATIVE Rate limiting configuration to avoid 429 errors
    this.rateLimits = {
      coingecko: { batchSize: 100, delayMs: 30000, maxTokens: 500 }, // Conservative: 100 per batch, 30s delay
      dexscreener: { batchSize: 50, delayMs: 5000, maxTokens: 70 }, // Conservative: 50 per batch, 5s delay, 70 tokens max
      jupiter: { batchSize: 100, delayMs: 30000, maxTokens: 600 }, // 30 second delay to avoid rate limits
      twitter: { batchSize: 10, delayMs: 15000, maxTokens: 1000 } // Reduced batch size, increased delay to avoid 429 errors
    };
    
    // Processing stages
    this.stages = ['coingecko', 'dexscreener', 'jupiter', 'twitter', 'scoring', 'saving'];
    
    // API endpoints
    this.apis = {
      coingecko: 'https://api.coingecko.com/api/v3',
      jupiter: 'https://lite-api.jup.ag/tokens/v2',
      rettiwt: null // Will be initialized from your existing service
    };
  }

  async initialize() {
    console.log('🚀 Enhanced Token Processor Initializing...');
    await this.loadExistingData();
    console.log('✅ Enhanced Token Processor Ready');
  }

  async loadExistingData() {
    try {
      const cachePath = path.join(__dirname, 'cache', 'tokens-cache.json');
      const data = await fs.readFile(cachePath, 'utf8');
      const parsed = JSON.parse(data);
      
      // Ensure we always have an array
      if (Array.isArray(parsed)) {
        this.processedTokens = parsed;
        console.log(`📊 Loaded ${this.processedTokens.length} existing tokens`);
      } else {
        console.log('⚠️ Cache data is not an array, initializing fresh');
        this.processedTokens = [];
      }
    } catch (error) {
      console.log('📊 No existing cache found, starting fresh');
      this.processedTokens = [];
    }
    
    // Double-check we have an array
    if (!Array.isArray(this.processedTokens)) {
      console.log('⚠️ Ensuring processedTokens is an array');
      this.processedTokens = [];
    }
  }

  async startProcessing() {
    if (this.isProcessing) {
      console.log('⚠️ Processing already in progress');
      return;
    }

    console.log('🚀 Starting Enhanced Token Processing Pipeline...');
    this.isProcessing = true;
    
    try {
      await this.runStagedProcessing();
    } catch (error) {
      console.error('❌ Processing pipeline failed:', error);
      this.isProcessing = false;
    }
  }

  async runStagedProcessing() {
    for (const stage of this.stages) {
      if (!this.isProcessing) break;
      
      console.log(`\n🔄 Starting Stage: ${stage.toUpperCase()}`);
      this.currentStage = stage;
      
      try {
        switch (stage) {
          case 'coingecko':
            await this.processCoinGeckoStage();
            break;
          case 'dexscreener':
            await this.processDexscreenerStage();
            break;
          case 'jupiter':
            await this.processJupiterStage();
            break;
          case 'twitter':
            await this.processTwitterStage();
            break;
          case 'scoring':
            await this.processScoringStage();
            break;
          case 'saving':
            await this.saveFinalDatabase();
            break;
        }
        
        console.log(`✅ Stage ${stage} completed`);
      } catch (error) {
        console.error(`❌ Stage ${stage} failed:`, error);
        break;
      }
    }
    
    this.isProcessing = false;
    console.log('🎉 Processing pipeline completed');
  }

  async processCoinGeckoStage() {
    console.log('🪙 Stage 1: FAST Fetching Solana Meme Coins from CoinGecko...');
    
    // Always fetch from CoinGecko because tokens change based on volume/market cap
    console.log('🔄 Fetching latest tokens from CoinGecko (tokens change based on volume/market cap)...');
    
    const targetTokens = this.rateLimits.coingecko.maxTokens; // 500 tokens
    const batchSize = this.rateLimits.coingecko.batchSize; // 250 tokens per page
    const delayMs = this.rateLimits.coingecko.delayMs; // 2 seconds
    
    let allTokens = [];
    let page = 1;
    
    // Much faster: only need 2-3 pages to get 500 tokens (vs 15+ pages with old approach)
    while (allTokens.length < targetTokens && this.isProcessing && page <= 3) {
      console.log(`📄 FAST Fetching page ${page} (target: ${targetTokens} tokens, current: ${allTokens.length})`);
      
      try {
        const batchTokens = await this.fetchCoinGeckoBatch(page, batchSize);
        
        if (batchTokens.length === 0) {
          console.log('📄 No more tokens available from CoinGecko');
          break;
        }
        
        // Tokens are already processed in fetchCoinGeckoBatch - just add them
        allTokens.push(...batchTokens);
        console.log(`✅ FAST Fetched ${batchTokens.length} tokens from page ${page} (total: ${allTokens.length})`);
        
        // Continue if we haven't reached target and got a full batch
        if (allTokens.length < targetTokens && batchTokens.length === batchSize) {
          console.log(`⏳ Waiting ${delayMs/1000} seconds before next batch...`);
          await this.delay(delayMs);
        } else if (batchTokens.length < batchSize) {
          console.log(`🎯 Reached end of available data: ${allTokens.length} tokens (partial batch: ${batchTokens.length})`);
          break;
        } else if (allTokens.length >= targetTokens) {
          console.log(`🎯 Reached target: ${allTokens.length} tokens`);
          break;
        }
        
        page++;
      } catch (error) {
        console.error(`❌ Failed to fetch page ${page}:`, error.message);
        if (error.response?.status === 429) {
          console.log('🚨 Rate limited, waiting 10 seconds...');
          await this.delay(10000);
          continue; // Retry same page
        } else {
          break;
        }
      }
    }
    
    // DEDUPLICATION: Remove duplicate tokens by symbol and contract address
    const deduplicatedTokens = this.deduplicateTokens(allTokens);
    console.log(`🔄 Deduplicated: ${allTokens.length} → ${deduplicatedTokens.length} tokens (removed ${allTokens.length - deduplicatedTokens.length} duplicates)`);
    
    // Merge with existing tokens from database
    const existingTokens = this.processedTokens.filter(t => t.stage === 'completed');
    const mergedTokens = this.mergeWithExistingTokens(deduplicatedTokens, existingTokens);
    
    this.stageProgress.coingecko = {
      total: mergedTokens.length,
      processed: mergedTokens.length,
      status: 'completed'
    };
    
    console.log(`🎯 CoinGecko Stage Complete: ${mergedTokens.length} unique tokens (${deduplicatedTokens.length} new + ${existingTokens.length} existing)`);
    this.processingQueue = mergedTokens;
  }

  async processDexscreenerStage() {
    console.log('🔍 Stage 1.5: Fetching Trending Tokens from Dexscreener...');

    try {
      // Get trending tokens from Dexscreener
      const targetTokens = this.rateLimits.dexscreener.maxTokens;
      console.log(`🔄 Fetching ${targetTokens} trending tokens from Dexscreener...`);

      const dexscreenerTokens = await this.dexscreenerService.getTrendingPairs(targetTokens);

      if (!dexscreenerTokens || dexscreenerTokens.length === 0) {
        console.log('⚠️ No tokens retrieved from Dexscreener');
        this.stageProgress.dexscreener = {
          total: 0,
          processed: 0,
          status: 'completed'
        };
        return;
      }

      console.log(`✅ Retrieved ${dexscreenerTokens.length} tokens from Dexscreener`);

      // Convert Dexscreener tokens to our standard format
      const processedDexscreenerTokens = dexscreenerTokens.map(token => ({
        symbol: token.symbol || 'UNKNOWN',
        name: token.name || 'Unknown Token',
        contractAddress: token.contractAddress,
        price: token.price || 0,
        volume24h: token.volume24h || 0,
        marketCap: token.marketCap || 0,
        priceChange24h: token.priceChange24h || 0,
        image: token.image,
        source: 'dexscreener',
        stage: 'dexscreener',
        pairAddress: token.pairAddress,
        chainId: token.chainId,
        dexId: token.dex,
        liquidity: token.liquidity || 0,
        fdv: token.fdv || 0
      }));

      // Filter out tokens that don't have contract addresses
      const validDexscreenerTokens = processedDexscreenerTokens.filter(token =>
        token.contractAddress &&
        token.contractAddress !== 'UNKNOWN' &&
        token.contractAddress.length > 10 // Basic validation
      );

      console.log(`🎯 ${validDexscreenerTokens.length} valid Dexscreener tokens with contract addresses`);

      // Merge with existing tokens from processing queue (from Coingecko)
      const existingTokens = this.processingQueue;
      const mergedTokens = this.mergeWithExistingTokens(validDexscreenerTokens, existingTokens);

      this.stageProgress.dexscreener = {
        total: mergedTokens.length,
        processed: mergedTokens.length,
        status: 'completed'
      };

      console.log(`🎯 Dexscreener Stage Complete: ${mergedTokens.length} total tokens (${validDexscreenerTokens.length} new + ${existingTokens.length} existing)`);
      this.processingQueue = mergedTokens;

    } catch (error) {
      console.error('❌ Dexscreener stage failed:', error);
      this.stageProgress.dexscreener = {
        total: 0,
        processed: 0,
        status: 'failed'
      };
    }
  }

  async processJupiterStage() {
    console.log('🚀 Stage 2: Processing Jupiter API Data...');
    
    if (this.processingQueue.length === 0) {
      console.log('⚠️ No tokens to process with Jupiter API');
      return;
    }
    
    const batchSize = this.rateLimits.jupiter.batchSize;
    const delayMs = this.rateLimits.jupiter.delayMs;
    const allTokens = this.processingQueue;
    
    console.log(`🔄 Processing ${allTokens.length} tokens with Jupiter API in batches of ${batchSize}...`);
    
    let totalProcessed = 0;
    
    // Process all tokens in batches
    for (let i = 0; i < allTokens.length; i += batchSize) {
      const tokens = allTokens.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(allTokens.length / batchSize);
      
      console.log(`🔄 Processing batch ${batchNumber}/${totalBatches}: ${tokens.length} tokens (${i + 1}-${i + tokens.length})`);
      
      try {
        // OPTIMIZATION: Only fetch contract addresses if needed
        const tokensNeedingContracts = tokens.filter(token => !token.contractAddress);
        
        if (tokensNeedingContracts.length === 0) {
          console.log(`✅ All ${tokens.length} tokens in batch already have contract addresses - skipping CoinGecko fetch`);
        } else {
          console.log(`🔍 Fetching contract addresses from CoinGecko for ${tokensNeedingContracts.length}/${tokens.length} tokens...`);
          await this.fetchContractAddresses(tokens);
        }
        
        const jupiterResults = await this.fetchJupiterBatch(tokens);
        
        // Update tokens with Jupiter data
        for (let j = 0; j < tokens.length; j++) {
          if (jupiterResults[j]) {
            tokens[j].jupiterData = jupiterResults[j];
          }
          // Always mark as completed Jupiter stage, even if no data
          tokens[j].stage = 'jupiter';
          tokens[j].jupiterTimestamp = new Date().toISOString();
        }
        
        totalProcessed += tokens.length;
        console.log(`✅ Batch ${batchNumber} complete: ${tokens.length} tokens processed (${totalProcessed}/${allTokens.length} total)`);
        
        // Rate limiting delay between batches
        if (i + batchSize < allTokens.length) {
          console.log(`⏳ Waiting ${delayMs/1000} seconds before next batch...`);
          await this.delay(delayMs);
        }
        
      } catch (error) {
        console.error(`❌ Batch ${batchNumber} failed:`, error.message);
        // Still mark tokens as completed Jupiter stage even on error
        tokens.forEach(t => {
          t.stage = 'jupiter';
          t.jupiterTimestamp = new Date().toISOString();
        });
        totalProcessed += tokens.length;
      }
    }
    
    this.stageProgress.jupiter = {
      total: allTokens.length,
      processed: totalProcessed,
      status: 'completed'
    };
    
    console.log(`✅ Jupiter Stage Complete: ${totalProcessed} tokens processed in ${Math.ceil(allTokens.length / batchSize)} batches`);
  }

  async processTwitterStage() {
    console.log('🐦 Stage 3: Collecting Twitter Social Data...');
    
    if (this.processingQueue.length === 0) {
      console.log('⚠️ No tokens to process with Twitter API');
      return;
    }
    
    const batchSize = this.rateLimits.twitter.batchSize; // 20 tokens per batch
    const delayMs = this.rateLimits.twitter.delayMs; // 5 seconds between tokens
    const allTokens = this.processingQueue;
    
    console.log(`🔄 Processing ${allTokens.length} tokens with Twitter API in batches of ${batchSize}...`);
    
    let totalProcessed = 0;
    let totalSkipped = 0;
    
    // Process ALL tokens in batches (like Jupiter stage)
    for (let i = 0; i < allTokens.length; i += batchSize) {
      const tokens = allTokens.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(allTokens.length / batchSize);
      
      console.log(`🔄 Processing Twitter batch ${batchNumber}/${totalBatches}: ${tokens.length} tokens (${i + 1}-${i + tokens.length})`);
      
      try {
        let batchProcessed = 0;
        let batchSkipped = 0;
        
        for (let j = 0; j < tokens.length; j++) {
          if (!this.isProcessing) break;
          
          const token = tokens[j];
          const symbol = token.symbol;
          
          // Check if we need to refresh Twitter data (24-hour rule)
          const needsTwitterRefresh = this.shouldRefreshTwitterData(token);
          
          if (!needsTwitterRefresh) {
            console.log(`⏰ Skipping Twitter refresh for ${symbol} (last updated: ${token.twitterTimestamp || 'never'})`);
            batchSkipped++;
            
            // Still mark as completed Twitter stage if we have existing data
            if (token.twitterData && token.communityHealthScore) {
              token.stage = 'twitter';
              console.log(`✅ Using cached Twitter data for ${symbol}: ${token.twitterData.mentions} mentions`);
            } else {
              // Set default values if no existing data
              token.twitterData = { mentions: 0, mentions24h: 0, likes: 0, retweets: 0, replies: 0, followers: 0 };
              token.communityHealthScore = 2.0; // Lowered from 5.0 to prevent massive jumps when adding social data
              token.stage = 'twitter';
              token.twitterTimestamp = new Date().toISOString();
              console.log(`⚠️ No cached Twitter data for ${symbol}, using defaults`);
            }
            continue;
          }
          
          console.log(`🐦 Processing Twitter data for ${symbol} (${j + 1}/${tokens.length} in batch ${batchNumber})`);
          
          try {
            // Get official Twitter handle from Jupiter data if available
            const officialHandle = token.jupiterData?.twitter || null;
            const twitterData = await this.fetchTwitterData(symbol, token.name, officialHandle);
            token.twitterData = twitterData;
            await this.ensureSocialDataService();
            token.communityHealthScore = this.socialDataService.calculateCommunityHealthScore(twitterData);
            token.stage = 'twitter';
            token.twitterTimestamp = new Date().toISOString();
            
            console.log(`✅ Twitter data collected for ${symbol}: ${twitterData.mentions} mentions`);
            batchProcessed++;
            
            // Rate limiting delay between tokens
            if (j < tokens.length - 1) {
              await this.delay(delayMs);
            }
            
          } catch (error) {
            console.error(`❌ Twitter data failed for ${symbol}:`, error.message);
            // Set default values
            token.twitterData = { mentions: 0, mentions24h: 0, likes: 0, retweets: 0, replies: 0, followers: 0 };
            token.communityHealthScore = 2.0; // Lowered from 5.0 to prevent massive jumps when adding social data
            // Still mark as completed Twitter stage
            token.stage = 'twitter';
            token.twitterTimestamp = new Date().toISOString();
            batchProcessed++; // Count as processed even if failed
          }
        }
        
        totalProcessed += batchProcessed;
        totalSkipped += batchSkipped;
        
        console.log(`✅ Twitter batch ${batchNumber} complete: ${batchProcessed} processed, ${batchSkipped} skipped (${totalProcessed + totalSkipped}/${allTokens.length} total)`);
        
        // Longer delay between batches to respect Twitter API limits
        if (i + batchSize < allTokens.length) {
          console.log(`⏳ Waiting ${delayMs * 2 / 1000} seconds before next Twitter batch...`);
          await this.delay(delayMs * 2); // Double delay between batches
        }
        
      } catch (error) {
        console.error(`❌ Twitter batch ${batchNumber} failed:`, error.message);
        // Still mark all tokens in batch as completed Twitter stage
        tokens.forEach(t => {
          t.stage = 'twitter';
          t.twitterTimestamp = new Date().toISOString();
          if (!t.twitterData) {
            t.twitterData = { mentions: 0, mentions24h: 0, likes: 0, retweets: 0, replies: 0, followers: 0 };
            t.communityHealthScore = 2.0; // Lowered from 5.0 to prevent massive jumps when adding social data
          }
        });
        totalProcessed += tokens.length;
      }
    }
    
    this.stageProgress.twitter = {
      total: allTokens.length,
      processed: totalProcessed,
      status: 'completed'
    };
    
    console.log(`✅ Twitter Stage Complete: ${totalProcessed} tokens processed, ${totalSkipped} tokens skipped (24h rule) in ${Math.ceil(allTokens.length / batchSize)} batches`);
  }

  async processScoringStage() {
    console.log('📊 Stage 4: Calculating Enhanced Scores...');
    
    if (this.processingQueue.length === 0) {
      console.log('⚠️ No tokens to score');
      return;
    }
    
    const tokens = this.processingQueue;
    console.log(`🔄 Calculating scores for ${tokens.length} tokens...`);
    
    try {
      for (let i = 0; i < tokens.length; i++) {
        if (!this.isProcessing) break;
        
        const token = tokens[i];
        console.log(`📊 Calculating score for ${token.symbol} (${i + 1}/${tokens.length})`);
        
        try {
          const enhancedScore = this.calculateEnhancedOverallScore(token);
          token.enhancedScore = enhancedScore;
          token.overallScore = enhancedScore;
          token.stage = 'scoring';
          token.scoringTimestamp = new Date().toISOString();
          
          console.log(`✅ Score calculated for ${token.symbol}: ${enhancedScore.toFixed(2)}/10`);
          
        } catch (error) {
          console.error(`❌ Scoring failed for ${token.symbol}:`, error.message);
          token.enhancedScore = 5.0;
          token.overallScore = 5.0;
          // Still mark as completed scoring stage
          token.stage = 'scoring';
          token.scoringTimestamp = new Date().toISOString();
        }
      }
      
      this.stageProgress.scoring = {
        total: tokens.length,
        processed: tokens.length,
        status: 'completed'
      };
      
      console.log(`✅ Scoring Stage Complete: ${tokens.length} tokens scored`);
      
    } catch (error) {
      console.error('❌ Scoring failed:', error);
      this.stageProgress.scoring.status = 'failed';
      
      // Mark all tokens as completed scoring stage even on error
      tokens.forEach(t => {
        t.stage = 'scoring';
        t.scoringTimestamp = new Date().toISOString();
        if (!t.enhancedScore) {
          t.enhancedScore = 5.0;
          t.overallScore = 5.0;
        }
      });
    }
  }

  async saveFinalDatabase() {
    console.log('💾 Stage 5: Saving to Final Database...');
    
    if (this.processingQueue.length === 0) {
      console.log('⚠️ No tokens to save');
      return;
    }
    
    try {
      // Ensure processedTokens is an array
      if (!Array.isArray(this.processedTokens)) {
        console.log('⚠️ processedTokens is not an array, initializing...');
        this.processedTokens = [];
      }
      
      // Get tokens ready for saving (those that completed scoring)
      const tokensToSave = this.processingQueue.filter(t => t.stage === 'scoring');
      
      if (tokensToSave.length === 0) {
        console.log('⚠️ No tokens completed scoring stage');
        console.log(`📊 Processing queue status:`);
        console.log(`   Total tokens: ${this.processingQueue.length}`);
        console.log(`   Coingecko stage: ${this.processingQueue.filter(t => t.stage === 'coingecko').length}`);
        console.log(`   Jupiter stage: ${this.processingQueue.filter(t => t.stage === 'jupiter').length}`);
        console.log(`   Twitter stage: ${this.processingQueue.filter(t => t.stage === 'twitter').length}`);
        console.log(`   Scoring stage: ${this.processingQueue.filter(t => t.stage === 'scoring').length}`);
        return;
      }
      
      console.log(`📊 Found ${tokensToSave.length} tokens ready for saving`);
      
      // Mark all as completed
      tokensToSave.forEach(t => t.stage = 'completed');
      
      // Merge with existing completed tokens
      const existingCompleted = this.processedTokens.filter(t => t.stage === 'completed');
      const allTokens = [...existingCompleted, ...tokensToSave];
      
      // FINAL DEDUPLICATION: Ensure no duplicates in final database
      const finalUniqueTokens = this.deduplicateTokens(allTokens);
      console.log(`🔄 Final deduplication: ${allTokens.length} → ${finalUniqueTokens.length} tokens (removed ${allTokens.length - finalUniqueTokens.length} duplicates)`);
      
      // Save to cache
      const cachePath = path.join(__dirname, 'cache', 'tokens-cache.json');
      await fs.writeFile(cachePath, JSON.stringify(finalUniqueTokens, null, 2));
      
      // Update our internal state with deduplicated tokens
      this.processedTokens = finalUniqueTokens;
      
      console.log(`✅ Final Database Saved: ${finalUniqueTokens.length} unique tokens`);
      console.log(`📊 New tokens added: ${tokensToSave.length}`);
      console.log(`📊 Total tokens in database: ${allTokens.length}`);
      
    } catch (error) {
      console.error('❌ Failed to save final database:', error);
      console.error('Error details:', error.message);
      console.error('Stack trace:', error.stack);
    }
  }

  // Simple CoinGecko data fetcher for individual paid tokens
  async getCoinGeckoDataForToken(contractAddress, symbol) {
    try {
      console.log(`🪙 Fetching CoinGecko data for ${symbol} (${contractAddress})...`);
      
      // Try to find the token by contract address first
      const response = await axios.get(`${this.apis.coingecko}/coins/solana/contract/${contractAddress}`, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      if (response.data) {
        const token = response.data;
        return {
          coinGeckoId: token.id,
          name: token.name,
          symbol: token.symbol?.toUpperCase(),
          currentPrice: token.market_data?.current_price?.usd || 0,
          marketCap: token.market_data?.market_cap?.usd || 0,
          volume24h: token.market_data?.total_volume?.usd || 0,
          priceChange24h: token.market_data?.price_change_percentage_24h || 0,
          image: token.image?.large || token.image?.small,
          source: 'coingecko_contract'
        };
      }
      
      return { fallback: true };
      
    } catch (error) {
      console.log(`⚠️ CoinGecko contract lookup failed for ${symbol}:`, error.message);
      return { fallback: true };
    }
  }

  // FAST API INTEGRATION METHODS (Based on trendingTokenService.js)
  async fetchCoinGeckoBatch(page, batchSize) {
    try {
      // Use much larger batch size for efficiency (250 tokens per page like trendingTokenService)
      const effectiveBatchSize = Math.min(batchSize * 6, 250); // 6x faster batching
      
      const url = `${this.apis.coingecko}/coins/markets`;
      const params = {
        vs_currency: 'usd',
        category: 'solana-meme-coins', // 🎯 Fetch specifically from Solana Meme Coins category
        order: 'market_cap_desc',
        per_page: effectiveBatchSize,
        page: page,
        sparkline: false,
        price_change_percentage: '1h,24h,7d' // Get price changes in one call
      };
      
      console.log(`🌐 FAST Fetching ${effectiveBatchSize} Solana Meme Coins from CoinGecko (page ${page})`);
      console.log(`🔍 Request URL: ${url}`);
      console.log(`🔍 Request Params:`, JSON.stringify(params, null, 2));
      
      const response = await axios.get(url, { 
        params,
        timeout: 20000, // Increased timeout for larger batches
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      console.log(`✅ CoinGecko Response Status: ${response.status}`);
      console.log(`📊 Response Headers:`, JSON.stringify(response.headers, null, 2));
      
      if (response.data && Array.isArray(response.data)) {
        console.log(`📊 CoinGecko returned ${response.data.length} Solana meme coins`);
        
        // Filter out tokens with missing essential data (like trendingTokenService)
        const validTokens = response.data.filter(token => {
          const hasBasicData = token && token.symbol && token.name;
          const hasMarketData = token.current_price !== null && token.market_cap !== null;
          return hasBasicData && hasMarketData;
        });
        
        console.log(`🌟 Filtered to ${validTokens.length} valid tokens with complete data`);
        
        // Transform to our format without individual API calls (much faster)
        const processedTokens = validTokens.map(token => ({
          id: token.id,
          symbol: token.symbol.toUpperCase(),
          name: token.name,
          contractAddress: null, // Will be fetched from detailed CoinGecko API
          currentPrice: token.current_price,
          marketCap: token.market_cap,
          volume24h: token.total_volume,
          priceChange1h: token.price_change_percentage_1h_in_currency || 0,
          priceChange24h: token.price_change_percentage_24h || 0,
          priceChange7d: token.price_change_percentage_7d_in_currency || 0,
          marketCapRank: token.market_cap_rank,
          image: token.image,
          lastUpdated: token.last_updated,
          source: 'coingecko',
          stage: 'coingecko',
          coinGeckoId: token.id
        }));
        
        return processedTokens;
      } else {
        console.log('⚠️ CoinGecko returned invalid data format');
        return [];
      }
      
    } catch (error) {
      console.error('❌ CoinGecko API Error Details:');
      console.error('  Status:', error.response?.status);
      console.error('  Status Text:', error.response?.statusText);
      console.error('  Message:', error.message);
      console.error('  Response Data:', error.response?.data);
      
      if (error.response?.status === 429) {
        console.log('🚨 CoinGecko rate limit hit, waiting 10 seconds...');
        await this.delay(10000);
        return [];
      }
      
      console.log(`⚠️ CoinGecko fetch error: ${error.message}`);
      return [];
    }
  }

  // REMOVED: enrichTokensWithContracts - too slow, contract addresses will be enriched in Jupiter stage

  // Fallback method to fetch Solana tokens
  async fetchSolanaTokensFallback(page, batchSize) {
    try {
      const url = `${this.apis.coingecko}/coins/markets`;
      const params = {
        vs_currency: 'usd',
        order: 'market_cap_desc',
        per_page: batchSize * 3, // Get more to filter for Solana
        page: page,
        sparkline: false,
        locale: 'en'
      };
      
      console.log(`🔄 Fallback: Fetching general tokens to filter for Solana...`);
      
      const response = await axios.get(url, { 
        params,
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      if (response.data && Array.isArray(response.data)) {
        // Filter for Solana tokens only
        const solanaTokens = response.data.filter(coin => 
          coin.platforms && coin.platforms.solana
        ).slice(0, batchSize); // Limit to requested batch size
        
        console.log(`🌟 Fallback filtered to ${solanaTokens.length} Solana tokens`);
        return solanaTokens;
      }
      
      return [];
    } catch (fallbackError) {
      console.log('⚠️ Fallback method also failed:', fallbackError.message);
      return [];
    }
  }

  async fetchContractAddresses(tokens) {
    try {
      // OPTIMIZATION: Only fetch contract addresses for tokens that don't already have them
      const tokensNeedingContracts = tokens.filter(token => !token.contractAddress);
      
      if (tokensNeedingContracts.length === 0) {
        console.log(`✅ All ${tokens.length} tokens already have contract addresses - skipping fetch`);
        return;
      }
      
      console.log(`🔍 Fetching contract addresses for ${tokensNeedingContracts.length}/${tokens.length} tokens that need them...`);
      
      // Use CoinGecko's coins/list endpoint with platform data (MUCH faster - single API call!)
      console.log('📡 Fetching ALL coins with platform data from CoinGecko...');
      const response = await axios.get(`${this.apis.coingecko}/coins/list?include_platform=true`, {
        timeout: 30000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      if (!response.data || !Array.isArray(response.data)) {
        console.log('❌ Invalid response from CoinGecko coins/list');
        return;
      }
      
      console.log(`📊 Received ${response.data.length} coins from CoinGecko`);
      
      // Create a map of CoinGecko ID to Solana contract address
      const contractMap = new Map();
      let solanaCoinsCount = 0;
      
      response.data.forEach(coin => {
        if (coin.platforms && coin.platforms.solana) {
          contractMap.set(coin.id, coin.platforms.solana);
          solanaCoinsCount++;
        }
      });
      
      console.log(`🌟 Found ${solanaCoinsCount} coins with Solana contracts in the list`);
      
      // Match ONLY tokens that need contract addresses
      let matchedCount = 0;
      let skippedCount = 0;
      
      tokens.forEach(token => {
        // Skip tokens that already have contract addresses
        if (token.contractAddress) {
          console.log(`⏭️ ${token.symbol}: Already has contract ${token.contractAddress} - skipping`);
          skippedCount++;
          return;
        }
        
        // Try to find contract address for tokens that need it
        if (token.coinGeckoId && contractMap.has(token.coinGeckoId)) {
          token.contractAddress = contractMap.get(token.coinGeckoId);
          console.log(`✅ ${token.symbol}: Found contract ${token.contractAddress}`);
          matchedCount++;
        } else {
          console.log(`⚠️ ${token.symbol}: No Solana contract found`);
        }
      });
      
      console.log(`✅ Contract fetching complete: ${matchedCount} new contracts found, ${skippedCount} tokens already had contracts`);
      
    } catch (error) {
      console.error('❌ Error fetching contract addresses:', error.message);
      
      // Fallback to individual requests if batch fails (only for tokens that need contracts)
      const tokensNeedingContracts = tokens.filter(token => !token.contractAddress);
      if (tokensNeedingContracts.length > 0) {
        console.log('🔄 Falling back to individual contract address requests...');
        await this.fetchContractAddressesIndividual(tokensNeedingContracts);
      }
    }
  }

  async fetchContractAddressesIndividual(tokens) {
    try {
      // OPTIMIZATION: Only process tokens that don't already have contract addresses
      const tokensNeedingContracts = tokens.filter(token => !token.contractAddress);
      
      if (tokensNeedingContracts.length === 0) {
        console.log(`✅ All ${tokens.length} tokens already have contract addresses - skipping individual fetch`);
        return;
      }
      
      console.log(`🔍 Fetching contract addresses individually for ${tokensNeedingContracts.length}/${tokens.length} tokens that need them...`);
      
      let processed = 0;
      const batchSize = 5;
      
      for (let i = 0; i < tokensNeedingContracts.length; i += batchSize) {
        const batch = tokensNeedingContracts.slice(i, i + batchSize);
        
        for (const token of batch) {
          if (!token.coinGeckoId) continue;
          
          // Double-check that this token still needs a contract address
          if (token.contractAddress) {
            console.log(`⏭️ ${token.symbol}: Already has contract ${token.contractAddress} - skipping`);
            continue;
          }
          
          try {
            const response = await axios.get(`${this.apis.coingecko}/coins/${token.coinGeckoId}`, {
              timeout: 10000,
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
              }
            });
            
            if (response.data && response.data.platforms && response.data.platforms.solana) {
              token.contractAddress = response.data.platforms.solana;
              console.log(`✅ ${token.symbol}: Found contract ${token.contractAddress}`);
            } else {
              console.log(`⚠️ ${token.symbol}: No Solana contract found`);
            }
            
          } catch (error) {
            console.log(`❌ ${token.symbol}: Failed to get contract - ${error.message}`);
          }
          
          await new Promise(resolve => setTimeout(resolve, 30000)); // 30 second delay between individual contract requests
        }
        
        processed += batch.length;
        console.log(`📊 Individual contract addresses: ${processed}/${tokensNeedingContracts.length} processed`);
        
        if (i + batchSize < tokensNeedingContracts.length) {
          await new Promise(resolve => setTimeout(resolve, 60000)); // 60 second delay between batches of individual requests
        }
      }
      
    } catch (error) {
      console.error('❌ Error in individual contract address fetching:', error.message);
    }
  }

  async fetchJupiterBatch(tokens) {
    try {
      // Jupiter can handle up to 100 mint addresses in comma-separated query
      const contractAddresses = tokens
        .filter(t => t.contractAddress)
        .map(t => t.contractAddress)
        .slice(0, 100); // Limit to 100 addresses as specified
      
      if (contractAddresses.length === 0) {
        console.log('⚠️ No contract addresses available for Jupiter API');
        return tokens.map(() => ({}));
      }
      
      console.log(`🚀 Fetching Jupiter data for ${contractAddresses.length} contracts...`);
      
      // Use comma-separated mint addresses in query parameter
      const mintQuery = contractAddresses.join(',');
      const url = `${this.apis.jupiter}/search?query=${mintQuery}`;
      
      const response = await axios.get(url, {
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json'
        }
      });
      
      if (response.data && Array.isArray(response.data) && response.data.length > 0) {
        console.log(`✅ Jupiter returned data for ${response.data.length} tokens`);
        
        // Create a map of contract address to Jupiter data
        const jupiterMap = new Map();
        response.data.forEach(jupiterToken => {
          if (jupiterToken.id) {
            jupiterMap.set(jupiterToken.id, jupiterToken);
          }
        });
        
        // Map Jupiter data to our tokens
        return tokens.map(token => {
          if (token.contractAddress && jupiterMap.has(token.contractAddress)) {
            const jupiterData = jupiterMap.get(token.contractAddress);
            return {
              // CRITICAL FIX: Extract price to top-level fields for frontend tooltip
              currentPrice: jupiterData.usdPrice || 0,
              price: jupiterData.usdPrice || 0, // Also set as 'price' for compatibility
              id: jupiterData.id,
              name: jupiterData.name,
              symbol: jupiterData.symbol,
              icon: jupiterData.icon,
              decimals: jupiterData.decimals,
              totalSupply: jupiterData.totalSupply,
              circSupply: jupiterData.circSupply,
              usdPrice: jupiterData.usdPrice,
              mcap: jupiterData.mcap,
              fdv: jupiterData.fdv,
              liquidity: jupiterData.liquidity,
              holderCount: jupiterData.holderCount,
              organicScore: jupiterData.organicScore,
              organicScoreLabel: jupiterData.organicScoreLabel,
              isVerified: jupiterData.isVerified,
              stats1h: jupiterData.stats1h,
              stats6h: jupiterData.stats6h,
              stats24h: jupiterData.stats24h,
              tags: jupiterData.tags || [],
              audit: jupiterData.audit,
              // Add missing fields that frontend expects
              firstPool: jupiterData.firstPool,
              launchpad: jupiterData.launchpad,
              createdAt: jupiterData.firstPool?.createdAt,
              tokenProgram: jupiterData.tokenProgram,
              dev: jupiterData.dev,
              graduatedPool: jupiterData.graduatedPool,
              graduatedAt: jupiterData.graduatedAt,
              cexes: jupiterData.cexes,
              ctLikes: jupiterData.ctLikes,
              smartCtLikes: jupiterData.smartCtLikes,
              updatedAt: jupiterData.updatedAt
            };
          }
          return {};
        });
      }
      
      console.log('⚠️ No Jupiter data returned');
      return tokens.map(() => ({}));
      
    } catch (error) {
      console.error('❌ Jupiter API error:', error.message);
      return tokens.map(() => ({}));
    }
  }

  async ensureSocialDataService() {
    if (!this.socialDataService) {
      // Import and initialize the social data service
      const { default: EnhancedSocialDataService } = await import('./enhancedSocialDataService.js');
      this.socialDataService = new EnhancedSocialDataService();
    }
  }

  async fetchTwitterData(symbol, name, officialHandle = null) {
    try {
      // Use the real EnhancedSocialDataService
      await this.ensureSocialDataService();
      
      // Load social links for this token
      let socialLinks = null;
      try {
        const { default: UpdateTokenService } = await import('./updateTokenService.js');
        const updateService = new UpdateTokenService();
        const tokenSocials = await updateService.getTokenSocials(symbol);
        socialLinks = tokenSocials?.socials || null;
      } catch (error) {
        console.log(`⚠️ Could not load social links for ${symbol}:`, error.message);
      }
      
      if (socialLinks?.twitter && socialLinks.twitter !== 'not_found') {
        console.log(`🐦 Searching Twitter for: ${symbol} (${name}) with USER-ADDED handle: @${socialLinks.twitter}`);
      } else if (officialHandle) {
        console.log(`🐦 Searching Twitter for: ${symbol} (${name}) with Jupiter handle: ${officialHandle}`);
      } else {
        console.log(`🐦 Searching Twitter for: ${symbol} (${name}) - no handles found, using hashtag/cashtag search only`);
      }
      
      // Use the real Twitter API service with social links and official handle
      const twitterData = await this.socialDataService.getTwitterSocialData(symbol, name, false, officialHandle, socialLinks);
      
      if (twitterData && twitterData.mentions !== undefined) {
        console.log(`✅ Real Twitter data for ${symbol}: ${twitterData.mentions} mentions`);
        return twitterData;
      } else {
        console.log(`⚠️ No Twitter data found for ${symbol}, using fallback`);
        return {
          mentions: 0,
          mentions24h: 0,
          likes: 0,
          retweets: 0,
          replies: 0,
          followers: 0,
          sentiment: 5,
          communityHealth: 0,
          recentMentions: [],
          engagement: 0,
          lastUpdate: new Date().toISOString(),
          error: 'No data found'
        };
      }
      
    } catch (error) {
      console.error(`❌ Twitter API error for ${symbol}:`, error.message);
      return {
        mentions: 0,
        mentions24h: 0,
        likes: 0,
        retweets: 0,
        replies: 0,
        followers: 0,
        sentiment: 5,
        communityHealth: 0,
        recentMentions: [],
        engagement: 0,
        lastUpdate: new Date().toISOString(),
        error: error.message
      };
    }
  }



  calculateEnhancedOverallScore(token) {
    let score = 1.5; // Base score - ensures minimum viable score
    
    // Market Tier (5%) - Use Jupiter market cap data
    const marketTier = this.calculateMarketTier(token.jupiterData?.mcap || token.jupiterData?.marketCap);
    score += marketTier * 0.05;
    
    // Volume 1hr (20%) - Calculate from Jupiter stats1h data
    const buyVolume1h = token.jupiterData?.stats1h?.buyVolume || 0;
    const sellVolume1h = token.jupiterData?.stats1h?.sellVolume || 0;
    const totalVolume1h = buyVolume1h + sellVolume1h;
    const volume1h = this.calculateVolumeScore(totalVolume1h);
    score += volume1h * 0.20;
    
    // Volume 24hr (15%) - Calculate from Jupiter stats24h data
    const buyVolume24h = token.jupiterData?.stats24h?.buyVolume || 0;
    const sellVolume24h = token.jupiterData?.stats24h?.sellVolume || 0;
    const totalVolume24h = buyVolume24h + sellVolume24h;
    const volume24h = this.calculateVolumeScore(totalVolume24h);
    score += volume24h * 0.15;
    
    // Price Change 24hrs (10%) - Use Jupiter stats24h data
    const priceChange = this.calculatePriceChangeScore(token.jupiterData?.stats24h?.priceChange || 0);
    score += priceChange * 0.10;
    
    // Organic Volume Ratio (10%)
    const organicRatio = this.calculateOrganicVolumeRatio(token);
    score += organicRatio * 0.10;
    
    // Community Health (35%) - Reduced from 45% to balance with increased Volume 1hr weight
    const communityHealth = token.communityHealthScore || 2.0; // Lowered default from 5.0 to 2.0
    score += communityHealth * 0.35;
    
    // Uniqueness Factor (5%)
    const uniqueness = this.calculateUniquenessFactor(token);
    score += uniqueness * 0.05;
    
    // Fuel Bonus (if applicable)
    if (token.isPaid || token.isFueled) {
      const fuelBonus = Math.min(1.0, score * 0.2); // Max 1.0 bonus
      score += fuelBonus;
      console.log(`🚀 Fuel Bonus: +${fuelBonus.toFixed(2)}`);
    }
    
    return Math.min(score, 10);
  }

  // Helper scoring methods
  calculateMarketTier(marketCap) {
    if (!marketCap) return 5.0;
    if (marketCap >= 1000000000) return 10.0; // 1B+
    if (marketCap >= 100000000) return 8.0;   // 100M+
    if (marketCap >= 10000000) return 6.0;    // 10M+
    if (marketCap >= 1000000) return 4.0;     // 1M+
    if (marketCap >= 100000) return 2.0;      // 100K+
    return 1.0;
  }

  calculateVolumeScore(volume) {
    if (!volume) return 5.0;
    if (volume >= 1000000) return 10.0;       // 1M+
    if (volume >= 100000) return 8.0;         // 100K+
    if (volume >= 10000) return 6.0;          // 10K+
    if (volume >= 1000) return 4.0;           // 1K+
    if (volume >= 100) return 2.0;            // 100+
    return 1.0;
  }

  calculatePriceChangeScore(change) {
    if (!change) return 5.0;
    if (change >= 50) return 10.0;            // 50%+
    if (change >= 20) return 8.0;             // 20%+
    if (change >= 10) return 6.0;             // 10%+
    if (change >= 5) return 4.0;              // 5%+
    if (change >= 0) return 2.0;              // Positive
    return 1.0;                               // Negative
  }

  calculateOrganicVolumeRatio(token) {
    // Calculate organic volume ratio from Jupiter stats24h data
    const organicBuyVolume = token.jupiterData?.stats24h?.buyOrganicVolume || 0;
    const organicSellVolume = token.jupiterData?.stats24h?.sellOrganicVolume || 0;
    const totalBuyVolume = token.jupiterData?.stats24h?.buyVolume || 0;
    const totalSellVolume = token.jupiterData?.stats24h?.sellVolume || 0;
    
    const totalOrganicVolume = organicBuyVolume + organicSellVolume;
    const totalVolume = totalBuyVolume + totalSellVolume;
    
    // If no volume data, return neutral score
    if (totalVolume === 0) return 5.0;
    
    // Calculate organic ratio (0-1)
    const organicRatio = totalOrganicVolume / totalVolume;
    
    // Score based on organic ratio percentage
    if (organicRatio >= 0.8) return 10.0;      // 80%+ organic = excellent
    if (organicRatio >= 0.6) return 8.0;       // 60%+ organic = very good
    if (organicRatio >= 0.4) return 6.0;       // 40%+ organic = good
    if (organicRatio >= 0.2) return 4.0;       // 20%+ organic = decent
    if (organicRatio >= 0.1) return 2.0;       // 10%+ organic = low
    return 1.0;                                 // <10% organic = very low
  }

  calculateUniquenessFactor(token) {
    // This would analyze token uniqueness
    // For now, returning neutral score
    return 5.0;
  }

  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  shouldRefreshTwitterData(token) {
    // If no existing Twitter data, always refresh
    if (!token.twitterData || !token.twitterTimestamp) {
      return true;
    }
    
    // Check if it's been more than 24 hours since last Twitter update
    const lastUpdate = new Date(token.twitterTimestamp);
    const now = new Date();
    const hoursSinceUpdate = (now - lastUpdate) / (1000 * 60 * 60);
    
    // Refresh if more than 24 hours have passed
    const needsRefresh = hoursSinceUpdate >= 24;
    
    if (needsRefresh) {
      console.log(`⏰ ${token.symbol}: Last Twitter update was ${hoursSinceUpdate.toFixed(1)} hours ago (24h+ threshold)`);
    } else {
      console.log(`⏰ ${token.symbol}: Last Twitter update was ${hoursSinceUpdate.toFixed(1)} hours ago (within 24h)`);
    }
    
    return needsRefresh;
  }

  // DEDUPLICATION METHOD: Remove duplicate tokens by multiple criteria
  deduplicateTokens(tokens) {
    const seen = new Set();
    const uniqueTokens = [];
    
    for (const token of tokens) {
      // Create unique keys based on multiple criteria
      const symbolKey = token.symbol?.toLowerCase();
      const contractKey = token.contractAddress?.toLowerCase();
      const coinGeckoKey = token.coinGeckoId?.toLowerCase();
      const nameKey = token.name?.toLowerCase();
      
      // Check for duplicates using multiple criteria
      const isDuplicate = 
        (symbolKey && seen.has(`symbol:${symbolKey}`)) ||
        (contractKey && seen.has(`contract:${contractKey}`)) ||
        (coinGeckoKey && seen.has(`coingecko:${coinGeckoKey}`)) ||
        (symbolKey && nameKey && seen.has(`combo:${symbolKey}:${nameKey}`));
      
      if (!isDuplicate) {
        // Add all identifiers to seen set
        if (symbolKey) seen.add(`symbol:${symbolKey}`);
        if (contractKey) seen.add(`contract:${contractKey}`);
        if (coinGeckoKey) seen.add(`coingecko:${coinGeckoKey}`);
        if (symbolKey && nameKey) seen.add(`combo:${symbolKey}:${nameKey}`);
        
        uniqueTokens.push(token);
      } else {
        console.log(`🔄 Removed duplicate: ${token.symbol} (${token.name})`);
      }
    }
    
    return uniqueTokens;
  }

  mergeWithExistingTokens(newTokens, existingTokens) {
    const merged = [...newTokens];

    for (const existing of existingTokens) {
      // Enhanced deduplication: check both symbol and contract address
      const existingIndex = merged.findIndex(t =>
        t.symbol === existing.symbol ||
        (t.contractAddress && existing.contractAddress &&
         t.contractAddress.toLowerCase() === existing.contractAddress.toLowerCase())
      );

      if (existingIndex >= 0) {
        // Update existing token with new CoinGecko data but preserve Twitter data if recent
        const mergedToken = {
          ...existing,
          ...merged[existingIndex],
          // Preserve Twitter data if it's less than 24 hours old
          twitterData: this.shouldRefreshTwitterData(existing) ? undefined : existing.twitterData,
          twitterTimestamp: this.shouldRefreshTwitterData(existing) ? undefined : existing.twitterTimestamp,
          communityHealthScore: this.shouldRefreshTwitterData(existing) ? undefined : existing.communityHealthScore,
          // Preserve other existing data
          enhancedScore: existing.enhancedScore,
          overallScore: existing.overallScore,
          jupiterData: existing.jupiterData,
          jupiterTimestamp: existing.jupiterTimestamp
        };
        
        merged[existingIndex] = mergedToken;
        console.log(`🔄 Merged existing token ${existing.symbol} (preserving recent data)`);
      } else {
        // Add existing token that wasn't in new batch
        merged.push(existing);
        console.log(`➕ Added existing token ${existing.symbol} to processing queue`);
      }
    }
    
    return merged;
  }

  // Public methods for external control
  async addPaidToken(tokenData) {
    console.log('💰 PAID TOKEN - Processing immediately in parallel...');
    
    // Process paid token immediately in parallel, don't queue it
    const processedToken = await this.processPaidTokenImmediately(tokenData);
    
    return processedToken;
  }

  async processPaidTokenImmediately(tokenData) {
    console.log(`🚀 INSTANT PROCESSING: ${tokenData.symbol} (PAID)`);
    console.log(`💡 User provided CA: ${tokenData.contractAddress} - skipping CoinGecko, going straight to Jupiter + Twitter`);
    
    try {
      // Create token with initial data
      const token = {
        ...tokenData,
        symbol: tokenData.symbol.toUpperCase(),
        isPaid: true,
        priority: 'instant',
        stage: 'processing',
        timestamp: new Date().toISOString(),
        lastUpdated: new Date().toISOString()
      };

      console.log(`⚡ Step 1/2: Jupiter data for ${token.symbol}...`);
      // Step 1: Get Jupiter data (user provided CA, so we can go straight to Jupiter)
      try {
        // Check if Jupiter service is initialized
        if (!this.jupiterService) {
          console.error(`❌ CRITICAL: Jupiter service not initialized! Backend needs restart.`);
          console.log(`⚠️ No Jupiter data for ${token.symbol}, service not available`);
        } else {
          const jupiterData = await this.jupiterService.getTokenData(token.contractAddress);
          if (jupiterData && !jupiterData.fallback) {
            token.jupiterData = jupiterData;
            // Update name and symbol from Jupiter if available
            if (jupiterData.name) token.name = jupiterData.name;
            if (jupiterData.symbol) token.symbol = jupiterData.symbol.toUpperCase();

            // CRITICAL FIX: Extract price from Jupiter data to top-level fields for frontend
            if (jupiterData.usdPrice && jupiterData.usdPrice > 0) {
              token.currentPrice = jupiterData.usdPrice;
              token.price = jupiterData.usdPrice; // Also set as 'price' for compatibility
              console.log(`💰 Price extracted: $${jupiterData.usdPrice} for ${token.symbol}`);
            } else {
              console.log(`⚠️ No valid price in Jupiter data for ${token.symbol}`);
            }

            console.log(`✅ Jupiter data found for ${token.symbol}`);
          } else {
            console.log(`⚠️ No Jupiter data for ${token.symbol}, using fallback`);
          }
        }
      } catch (error) {
        console.log(`⚠️ Jupiter error for ${token.symbol}:`, error.message);
        if (error.message.includes('Cannot read properties of undefined')) {
          console.error(`❌ CRITICAL: Jupiter service not properly initialized. Please restart the backend server.`);
        }
      }

      console.log(`⚡ Step 2/4: Twitter data for ${token.symbol}...`);
      // Step 2: Get Twitter data
      try {
        const officialHandle = token.jupiterData?.twitter || null;
        const twitterData = await this.fetchTwitterData(token.symbol, token.name, officialHandle);
        if (twitterData) {
          token.twitterData = twitterData;
          token.mentions = twitterData.mentions || 0;
          token.communityScore = twitterData.communityHealth || 5;
          console.log(`✅ Twitter data found for ${token.symbol}: ${token.mentions} mentions`);
        }
      } catch (error) {
        console.log(`⚠️ Twitter error for ${token.symbol}:`, error.message);
        token.mentions = 0;
        token.communityScore = 5;
      }

      console.log(`⚡ Step 3/4: Calculating overall score for ${token.symbol}...`);
      // Step 3: Calculate community score and set as overall score
      let finalScore = 5.0; // Default score
      
      if (token.twitterData) {
        await this.ensureSocialDataService();
        finalScore = this.socialDataService.calculateCommunityHealthScore(token.twitterData);
        console.log(`✅ Community score calculated for ${token.symbol}: ${finalScore.toFixed(2)}/10`);
      } else {
        console.log(`⚠️ No Twitter data for ${token.symbol}, using default score: ${finalScore}/10`);
      }
      
      // Set both community score and overall score to the same value
      token.communityScore = finalScore;
      token.enhancedScore = finalScore;
      token.overallScore = finalScore;
      
      console.log(`✅ Overall score set for ${token.symbol}: ${finalScore.toFixed(2)}/10`);

      console.log(`⚡ Step 4/4: Finalizing ${token.symbol}...`);
      // Step 4: Finalize and save
      token.stage = 'completed';
      token.lastUpdated = new Date().toISOString();
      
      // Calculate community health score (if not already done)
      if (token.twitterData && !token.communityScore) {
        await this.ensureSocialDataService();
        token.communityScore = this.socialDataService.calculateCommunityHealthScore(token.twitterData);
      }

      // Save to cache immediately
      await this.savePaidTokenToCache(token);

      console.log(`🎉 PAID TOKEN COMPLETED: ${token.symbol} processed in parallel!`);
      return token;

    } catch (error) {
      console.error(`❌ Error processing paid token ${tokenData.symbol}:`, error);
      throw error;
    }
  }

  async savePaidTokenToCache(token) {
    try {
      // Load existing cache
      const cachePath = path.join(__dirname, 'cache', 'tokens-cache.json');
      let tokens = [];
      
      try {
        const data = await fs.readFile(cachePath, 'utf8');
        tokens = JSON.parse(data);
      } catch (error) {
        console.log('📁 Creating new tokens cache for paid token');
        tokens = [];
      }

      // Check if token already exists (update) or add new
      const existingIndex = tokens.findIndex(t => t.symbol === token.symbol);
      if (existingIndex !== -1) {
        tokens[existingIndex] = token;
        console.log(`🔄 Updated existing token ${token.symbol} in cache`);
      } else {
        tokens.push(token);
        console.log(`➕ Added new paid token ${token.symbol} to cache`);
      }

      // Save updated cache
      await fs.writeFile(cachePath, JSON.stringify(tokens, null, 2));
      console.log(`💾 Paid token ${token.symbol} saved to cache`);

    } catch (error) {
      console.error(`❌ Error saving paid token to cache:`, error);
      throw error;
    }
  }

  getProcessingStatus() {
    return {
      isProcessing: this.isProcessing,
      currentStage: this.currentStage,
      stageProgress: this.stageProgress,
      queueLength: this.processingQueue.length,
      processedCount: this.processedTokens.length,
      sources: {
        coingecko: this.processingQueue.filter(t => t.source === 'coingecko').length,
        dexscreener: this.processingQueue.filter(t => t.source === 'dexscreener').length,
        total: this.processingQueue.length
      },
      lastUpdated: new Date().toISOString()
    };
  }

  stopProcessing() {
    console.log('🛑 Stopping token processing...');
    this.isProcessing = false;
  }
}

export default EnhancedTokenProcessor;
