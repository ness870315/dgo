import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import jupiterApiService from './jupiterApiService.js';
import DexscreenerApiService from './dexscreenerApiService.js';
import HypeSnapshotService from './hypeSnapshotService.js';
import BirdEyeTrendingService from './birdEyeTrendingService.js';
import LiquidityCleanupService from './liquidityCleanupService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class EnhancedTokenProcessor {
  constructor() {
    this.isProcessing = false;
    this.currentStage = 'idle';
    this.processingQueue = [];
    this.processedTokens = [];
    this.alreadyQueuedSet = new Set(); // cross-run enqueue guard by contract/symbol
    this.stageProgress = {
      coingecko: { total: 0, processed: 0, status: 'pending' },
      dexscreener: { total: 0, processed: 0, status: 'pending' },
      birdeye: { total: 0, processed: 0, status: 'pending' },
      jupiter: { total: 0, processed: 0, status: 'pending' },
      twitter: { total: 0, processed: 0, status: 'pending' },
      scoring: { total: 0, processed: 0, status: 'pending' }
    };
    
    // Initialize cleanup service
    this.liquidityCleanup = new LiquidityCleanupService();
    
    // Initialize API services
    this.jupiterService = jupiterApiService;
    this.dexscreenerService = new DexscreenerApiService();
    this.birdEyeService = new BirdEyeTrendingService();
    this.hypeService = new HypeSnapshotService();
    // Resolve persistent cache directory
    const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');
    this.cacheDir = path.join(dataDir, 'cache');
    try { fsSync.mkdirSync(this.cacheDir, { recursive: true }); } catch (_) {}
    
    // Set up persistent queue tracking
    this.alreadyQueuedFile = path.join(this.cacheDir, 'already-queued-tokens.json');
    this.loadAlreadyQueuedSet();
    
    // CoinGecko page cycling state
    this.coinGeckoPageState = {
      currentPageSet: 1, // Which set of 3 pages (1-3, 4-6, 7-9)
      maxPageSets: 3,    // Total sets (covers pages 1-9)
      stateFile: path.join(this.cacheDir, 'coingecko-page-state.json')
    };
    this.loadCoinGeckoPageState();
    
    // CONSERVATIVE Rate limiting configuration to avoid 429 errors
    this.rateLimits = {
      coingecko: { batchSize: 40, delayMs: 120000, maxTokens: 500 }, // 40 tokens per batch, 2min delay to avoid rate limits
      dexscreener: { batchSize: 50, delayMs: 5000, maxTokens: 70 }, // Conservative: 50 per batch, 5s delay, 70 tokens max
      birdeye: { maxTokens: 20 }, // BirdEye API limit: 1-20
      jupiter: { batchSize: 100, delayMs: 30000, maxTokens: 600 }, // 30 second delay to avoid rate limits
      twitter: { batchSize: 5, delayMs: 30000, maxTokens: 1000 } // Much smaller batches, 30s delay to avoid 429 errors
    };
    
    // Processing stages
    this.stages = ['coingecko', 'dexscreener', 'birdeye', 'jupiter', 'twitter', 'scoring', 'saving'];
    
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
    
    // Populate already-queued set with tokens that have recent Twitter data
    // This prevents duplicate Twitter API calls on restart
    await this.populateAlreadyQueuedFromExisting();
    
    console.log('✅ Enhanced Token Processor Ready');
  }

  async loadExistingData() {
    try {
      const cachePath = path.join(this.cacheDir, 'tokens-cache.json');
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
    
    return this.processedTokens;
  }

  async startProcessing(options = {}) {
    if (this.isProcessing) {
      console.log('⚠️ Processing already in progress');
      return;
    }

    const { skipTwitter = false } = options;
    console.log(`🚀 Starting Enhanced Token Processing Pipeline... ${skipTwitter ? '(Twitter stage skipped)' : ''}`);
    this.isProcessing = true;
    this.currentStage = 'starting';
    this.lastActivity = Date.now();
    
    try {
      await this.runStagedProcessing(options);
      console.log('✅ Processing pipeline completed successfully');
    } catch (error) {
      console.error('❌ Processing pipeline failed:', error);
      console.error('❌ Error details:', error.stack);
      this.isProcessing = false;
      this.currentStage = 'error';
      
      // Log the error for debugging
      console.log('🔄 Processing will be automatically restarted by the background monitor');
      
      // Don't throw the error - let the background monitor handle restart
    } finally {
      this.isProcessing = false;
      this.currentStage = 'idle';
    }
  }

  async runStagedProcessing(options = {}) {
    const { skipTwitter = false } = options;
    
    for (const stage of this.stages) {
      if (!this.isProcessing) break;
      
      // Skip Twitter stage if requested
      if (stage === 'twitter' && skipTwitter) {
        console.log(`\n⏭️ Skipping Stage: ${stage.toUpperCase()} (skipTwitter=true)`);
        continue;
      }
      
      console.log(`\n🔄 Starting Stage: ${stage.toUpperCase()}`);
      this.currentStage = stage;
      this.updateActivity();
      
      try {
        switch (stage) {
          case 'coingecko':
            await this.processCoinGeckoStage();
            break;
          case 'dexscreener':
            await this.processDexscreenerStage();
            break;
          case 'birdeye':
            await this.processBirdEyeStage();
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
        this.updateActivity();
      } catch (error) {
        console.error(`❌ Stage ${stage} failed:`, error);
        this.updateActivity();
        break;
      }
    }
    
    this.isProcessing = false;
    console.log('🎉 Processing pipeline completed');
  }

  async processCoinGeckoStage() {
    console.log('🪙 Stage 1: CONTRACT DISCOVERY - Fetching new Solana contracts from CoinGecko...');
    
    // Get existing contract addresses to avoid duplicates
    const existingTokens = this.processedTokens.filter(t => t.stage === 'completed');
    const existingContracts = new Set(
      existingTokens
        .filter(t => t.contractAddress)
        .map(t => t.contractAddress.toLowerCase())
    );
    
    console.log(`🔍 Found ${existingContracts.size} existing contracts in cache`);
    console.log('🔄 Fetching trending tokens from CoinGecko (contract discovery only)...');
    
    const targetTokens = this.rateLimits.coingecko.maxTokens; // 500 tokens
    const batchSize = this.rateLimits.coingecko.batchSize; // 250 tokens per page
    const delayMs = this.rateLimits.coingecko.delayMs; // 2 seconds
    
    let allTokens = [];
    let newContractsFound = 0;
    
    // Calculate starting page based on current page set (1-3, 4-6, or 7-9)
    const startPage = (this.coinGeckoPageState.currentPageSet - 1) * 3 + 1;
    const endPage = startPage + 2; // Fetch 3 pages per cycle
    let page = startPage;
    
    console.log(`🔄 CoinGecko Page Cycling: Fetching pages ${startPage}-${endPage} (set ${this.coinGeckoPageState.currentPageSet}/${this.coinGeckoPageState.maxPageSets})`);
    
    // Fetch 3 consecutive pages per cycle
    while (allTokens.length < targetTokens && this.isProcessing && page <= endPage) {
      console.log(`📄 Fetching page ${page} (target: ${targetTokens} tokens, current: ${allTokens.length}, new contracts: ${newContractsFound})`);
      
      try {
        const batchTokens = await this.fetchCoinGeckoBatch(page, batchSize);
        
        if (batchTokens.length === 0) {
          console.log('📄 No more tokens available from CoinGecko');
          break;
        }
        
        // 🚀 OPTIMIZATION: Filter out existing contracts - only add NEW contracts
        const newTokens = batchTokens.filter(token => {
          if (!token.contractAddress) return false;
          const contractLower = token.contractAddress.toLowerCase();
          if (existingContracts.has(contractLower)) {
            return false; // Skip existing contract
          }
          existingContracts.add(contractLower); // Add to set to avoid duplicates within batch
          newContractsFound++;
          return true;
        });
        
        allTokens.push(...newTokens);
        console.log(`✅ Fetched ${batchTokens.length} tokens from page ${page}, added ${newTokens.length} NEW contracts (total: ${allTokens.length}, new contracts: ${newContractsFound})`);
        
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
    
    // 🚀 OPTIMIZATION: NO MERGING - Only add new contract addresses to queue
    // Existing tokens will be processed by Jupiter API for market data updates
    
    this.stageProgress.coingecko = {
      total: deduplicatedTokens.length,
      processed: deduplicatedTokens.length,
      status: 'completed'
    };
    
    console.log(`🎯 CoinGecko Stage Complete: ${deduplicatedTokens.length} NEW contracts discovered (${newContractsFound} total new contracts found)`);
    console.log(`📊 Existing tokens: ${existingTokens.length} (will be processed by Jupiter for market data updates)`);
    this.processingQueue = deduplicatedTokens;
    
    // Advance to next page set for next cycle
    this.advanceCoinGeckoPageSet();
  }

  async processDexscreenerStage() {
    console.log('🔍 Stage 1.5: CONTRACT DISCOVERY - Fetching new Solana contracts from Dexscreener...');

    try {
      // Get existing contract addresses to avoid duplicates
      const existingTokens = this.processedTokens.filter(t => t.stage === 'completed');
      const existingContracts = new Set(
        existingTokens
          .filter(t => t.contractAddress)
          .map(t => t.contractAddress.toLowerCase())
      );
      
      // Also check contracts from CoinGecko stage (current processing queue)
      this.processingQueue.forEach(token => {
        if (token.contractAddress) {
          existingContracts.add(token.contractAddress.toLowerCase());
        }
      });
      
      console.log(`🔍 Found ${existingContracts.size} existing contracts (cache + CoinGecko queue)`);
      
      // Get trending tokens from Dexscreener
      const targetTokens = this.rateLimits.dexscreener.maxTokens;
      console.log(`🔄 Fetching ${targetTokens} trending tokens from Dexscreener (contract discovery only)...`);

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

      // 🚀 OPTIMIZATION: Extract only contract addresses and basic info (no market data)
      const newContractTokens = [];
      let newContractsFound = 0;
      
      dexscreenerTokens.forEach(token => {
        if (token.contractAddress && 
            token.contractAddress !== 'UNKNOWN' && 
            token.contractAddress.length > 10) {
          
          const contractLower = token.contractAddress.toLowerCase();
          if (!existingContracts.has(contractLower)) {
            existingContracts.add(contractLower); // Add to set to avoid duplicates
            newContractsFound++;
            
            // Create minimal token object with only contract info
            newContractTokens.push({
              symbol: token.symbol || 'UNKNOWN',
              name: token.name || 'Unknown Token',
              contractAddress: token.contractAddress,
              source: 'dexscreener',
              stage: 'dexscreener',
              // No market data - Jupiter will fetch this
              pairAddress: token.pairAddress,
              chainId: token.chainId,
              dexId: token.dex
            });
          }
        }
      });

      console.log(`🎯 ${newContractTokens.length} NEW contracts discovered from Dexscreener (${newContractsFound} total new contracts)`);

      // 🚀 OPTIMIZATION: NO MERGING - Only add new contract addresses to queue
      // Existing tokens will be processed by Jupiter API for market data updates
      
      // Add new contracts to processing queue
      this.processingQueue.push(...newContractTokens);

      this.stageProgress.dexscreener = {
        total: newContractTokens.length,
        processed: newContractTokens.length,
        status: 'completed'
      };

      console.log(`🎯 Dexscreener Stage Complete: ${newContractTokens.length} NEW contracts discovered`);
      console.log(`📊 Total processing queue: ${this.processingQueue.length} contracts (from all discovery sources)`);

    } catch (error) {
      console.error('❌ Dexscreener stage failed:', error);
      this.stageProgress.dexscreener = {
        total: 0,
        processed: 0,
        status: 'failed'
      };
    }
  }

  async processBirdEyeStage() {
    console.log('🐦 Stage 1.6: CONTRACT DISCOVERY - Fetching new Solana contracts from BirdEye...');

    try {
      // Get existing contract addresses to avoid duplicates
      const existingTokens = this.processedTokens.filter(t => t.stage === 'completed');
      const existingContracts = new Set(
        existingTokens
          .filter(t => t.contractAddress)
          .map(t => t.contractAddress.toLowerCase())
      );
      
      // Also check contracts from previous stages (CoinGecko + Dexscreener)
      this.processingQueue.forEach(token => {
        if (token.contractAddress) {
          existingContracts.add(token.contractAddress.toLowerCase());
        }
      });
      
      console.log(`🔍 Found ${existingContracts.size} existing contracts (cache + previous stages)`);
      
      const target = this.rateLimits.birdeye.maxTokens;
      console.log(`🔄 Fetching up to ${target} trending tokens from BirdEye (contract discovery only)...`);
      const birdTokens = await this.birdEyeService.fetchTrending({ limit: target, sort_type: 'desc' });

      if (!birdTokens || birdTokens.length === 0) {
        console.log('⚠️ No tokens retrieved from BirdEye');
        this.stageProgress.birdeye = { 
          total: this.processingQueue.length, 
          processed: this.processingQueue.length, 
          status: 'completed' 
        };
        return;
      }

      console.log(`✅ Retrieved ${birdTokens.length} tokens from BirdEye`);

      // 🚀 OPTIMIZATION: Extract only contract addresses and basic info (no market data)
      const newContractTokens = [];
      let newContractsFound = 0;
      
      birdTokens.forEach(token => {
        if (token.contractAddress && 
            token.contractAddress !== 'UNKNOWN' && 
            token.contractAddress.length > 10) {
          
          const contractLower = token.contractAddress.toLowerCase();
          if (!existingContracts.has(contractLower)) {
            existingContracts.add(contractLower); // Add to set to avoid duplicates
            newContractsFound++;
            
            // Create minimal token object with only contract info
            newContractTokens.push({
              symbol: token.symbol || 'UNKNOWN',
              name: token.name || 'Unknown Token',
              contractAddress: token.contractAddress,
              source: 'birdeye',
              stage: 'birdeye',
              // No market data - Jupiter will fetch this
              birdEyeRaw: token.birdEyeRaw
            });
          }
        }
      });

      console.log(`🎯 ${newContractTokens.length} NEW contracts discovered from BirdEye (${newContractsFound} total new contracts)`);

      // 🚀 OPTIMIZATION: NO MERGING - Only add new contract addresses to queue
      // Existing tokens will be processed by Jupiter API for market data updates
      
      // Add new contracts to processing queue
      this.processingQueue.push(...newContractTokens);

      this.stageProgress.birdeye = {
        total: newContractTokens.length,
        processed: newContractTokens.length,
        status: 'completed'
      };

      console.log(`🎯 BirdEye Stage Complete: ${newContractTokens.length} NEW contracts discovered`);
      console.log(`📊 Total processing queue: ${this.processingQueue.length} contracts (from all discovery sources)`);

    } catch (error) {
      console.error('❌ BirdEye stage failed:', error);
      this.stageProgress.birdeye = { 
        total: this.processingQueue.length, 
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
        
        // EARLY FILTERING: Remove tokens that don't meet quality criteria
        const filteredTokens = [];
        const removedTokens = [];
        
        for (let j = 0; j < tokens.length; j++) {
          const token = tokens[j];
          const jupiterData = jupiterResults[j];
          
          if (jupiterData) {
            token.jupiterData = jupiterData;
            
            // Check quality criteria - ALL THREE must be missing to delete
            const hasLaunchpad = jupiterData.launchpad && jupiterData.launchpad !== '';
            const hasOrganicScore = jupiterData.organicScore && jupiterData.organicScore > 0;
            const hasGraduatedAt = jupiterData.graduatedAt && jupiterData.graduatedAt !== '';
            
            // Only delete if ALL THREE criteria are missing (AND condition)
            if (!hasLaunchpad && !hasOrganicScore && !hasGraduatedAt) {
              console.log(`🚫 FILTERING OUT: ${token.symbol} (${token.contractAddress?.substring(0, 8)}) - Missing ALL quality criteria:`);
              console.log(`   - Launchpad: ❌ (${jupiterData.launchpad || 'missing'})`);
              console.log(`   - Organic Score: ❌ (${jupiterData.organicScore || 0})`);
              console.log(`   - Graduated At: ❌ (${jupiterData.graduatedAt || 'missing'})`);
              
              removedTokens.push({
                symbol: token.symbol,
                contractAddress: token.contractAddress,
                reason: 'Missing all: launchpad, organicScore, graduatedAt'
              });
              continue; // Skip this token
            }
            
            console.log(`✅ KEEPING: ${token.symbol} - Has at least one quality indicator`);
          } else {
            // No Jupiter data - also filter out
            console.log(`🚫 FILTERING OUT: ${token.symbol} (${token.contractAddress?.substring(0, 8)}) - No Jupiter data`);
            removedTokens.push({
              symbol: token.symbol,
              contractAddress: token.contractAddress,
              reason: 'No Jupiter data'
            });
            continue;
          }
          
          // Mark as completed Jupiter stage
          token.stage = 'jupiter';
          token.jupiterTimestamp = new Date().toISOString();
          filteredTokens.push(token);
        }
        
        // Update the tokens array to only include filtered tokens
        tokens.splice(0, tokens.length, ...filteredTokens);
        
        console.log(`🔍 Quality Filter Results: ${filteredTokens.length} kept, ${removedTokens.length} removed`);
        if (removedTokens.length > 0) {
          console.log(`📋 Removed tokens:`, removedTokens.map(t => `${t.symbol} (${t.reason})`).join(', '));
        }
        
        totalProcessed += filteredTokens.length;
        console.log(`✅ Batch ${batchNumber} complete: ${filteredTokens.length} tokens kept, ${removedTokens.length} removed (${totalProcessed}/${allTokens.length} total)`);
        
        // Rate limiting delay between batches
        if (i + batchSize < allTokens.length) {
          console.log(`⏳ Waiting ${delayMs/1000} seconds before next batch...`);
          await this.delay(delayMs);
        }
        
      } catch (error) {
        console.error(`❌ Batch ${batchNumber} failed:`, error.message);
        // On error, still try to filter tokens if we have Jupiter data
        const filteredTokens = [];
        for (let j = 0; j < tokens.length; j++) {
          const token = tokens[j];
          const jupiterData = jupiterResults ? jupiterResults[j] : null;
          
          if (jupiterData) {
            token.jupiterData = jupiterData;
            
            // Apply same quality filtering even on error - ALL THREE must be missing to delete
            const hasLaunchpad = jupiterData.launchpad && jupiterData.launchpad !== '';
            const hasOrganicScore = jupiterData.organicScore && jupiterData.organicScore > 0;
            const hasGraduatedAt = jupiterData.graduatedAt && jupiterData.graduatedAt !== '';
            
            // Only keep if at least ONE criteria is present (not all missing)
            if (hasLaunchpad || hasOrganicScore || hasGraduatedAt) {
              token.stage = 'jupiter';
              token.jupiterTimestamp = new Date().toISOString();
              filteredTokens.push(token);
            }
          }
        }
        
        // Update tokens array with filtered results
        tokens.splice(0, tokens.length, ...filteredTokens);
        totalProcessed += filteredTokens.length;
      }
    }
    
    // 🚨 CRITICAL FIX: Update the main processing queue to remove filtered tokens
    const allFilteredTokens = [];
    for (let i = 0; i < allTokens.length; i += batchSize) {
      const batch = allTokens.slice(i, i + batchSize);
      // Re-apply Jupiter filtering to get the final filtered tokens
      const batchFilteredTokens = batch.filter(token => {
        if (!token.jupiterData) return false;
        
        const hasLaunchpad = token.jupiterData.launchpad && token.jupiterData.launchpad !== '';
        const hasOrganicScore = token.jupiterData.organicScore && token.jupiterData.organicScore > 0;
        const hasGraduatedAt = token.jupiterData.graduatedAt && token.jupiterData.graduatedAt !== '';
        
        return hasLaunchpad || hasOrganicScore || hasGraduatedAt;
      });
      
      allFilteredTokens.push(...batchFilteredTokens);
    }
    
    // Update the main processing queue with only quality tokens
    this.processingQueue.splice(0, this.processingQueue.length, ...allFilteredTokens);
    
    console.log(`🧹 PROCESSING QUEUE UPDATED: ${allTokens.length} → ${allFilteredTokens.length} tokens (removed ${allTokens.length - allFilteredTokens.length} low-quality tokens)`);
    
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
    
    // 🚨 CRITICAL FIX: Deduplicate processing queue before Twitter stage to prevent duplicate API calls
    const rawTokens = this.processingQueue;
    const deduplicatedTokens = this.deduplicateTokens(rawTokens);
    const duplicatesRemoved = rawTokens.length - deduplicatedTokens.length;
    
    if (duplicatesRemoved > 0) {
      console.log(`🔧 DUPLICATE PREVENTION: Removed ${duplicatesRemoved} duplicate tokens from Twitter processing queue (${rawTokens.length} → ${deduplicatedTokens.length})`);
      this.processingQueue = deduplicatedTokens; // Update the queue
    }
    
    // Filter out tokens that should NEVER hit Twitter API
    // NOTE: isValidCandidate is for Jupiter import pipeline, not for existing cache tokens
    let allTokens = this.processingQueue;
    const preFilterCount = allTokens.length;
    allTokens = allTokens.filter(t => !this.isSuspiciousToken(t) && !this.isRuggedToken(t) && !this.isExcludedMajorOrStable(t));
    const filteredOut = preFilterCount - allTokens.length;
    if (filteredOut > 0) {
      console.log(`🧹 FILTER: Skipped ${filteredOut} tokens (suspicious/rugged/major) before Twitter stage (${preFilterCount} → ${allTokens.length})`);
    }
    
    // 🚨 CRITICAL FIX: In-flight protection to prevent duplicate processing within same run
    const currentlyProcessing = new Set();
    
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
          const contractKey = token.contractAddress || symbol; // Use contract address as primary key, fallback to symbol
          
          // 🚨 CRITICAL FIX: In-flight protection - skip if already processing this token in current run
          if (currentlyProcessing.has(contractKey)) {
            console.log(`🚫 DUPLICATE PREVENTION: Skipping ${symbol} - already processing in current run (key: ${contractKey})`);
            batchSkipped++;
            continue;
          }
          
          // Mark as currently processing
          currentlyProcessing.add(contractKey);
          
          // Check if we need to refresh Twitter data (24-hour rule)
          const needsTwitterRefresh = await this.shouldRefreshTwitterData(token);
          
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
            const jupTwitter = token.jupiterData?.twitter || null;
            let officialHandle = null;
            if (jupTwitter) {
              try {
                const { default: EnhancedSocialDataService } = await import('./enhancedSocialDataService.js');
                const tmpSvc = new EnhancedSocialDataService();
                const normalized = tmpSvc.normalizeTwitterHandle(jupTwitter);
                if (normalized) officialHandle = '@' + normalized;
              } catch (_) {
                officialHandle = jupTwitter; // fallback if normalization fails
              }
            }
            const twitterData = await this.fetchTwitterData(symbol, token.name, officialHandle, token);
            token.twitterData = twitterData;
            await this.ensureSocialDataService();
            token.communityHealthScore = this.socialDataService.calculateCommunityHealthScore(twitterData, token.socials, token.jupiterData);
            token.stage = 'twitter';
            
            // 🚨 FIX: Always apply 72h cooldown when Twitter data is successfully fetched
            const now = new Date().toISOString();
            token.twitterTimestamp = now;
            
            // Note: Hype snapshots are created during the scoring stage, not here
            
            console.log(`✅ Twitter data for ${symbol}: ${twitterData.mentions} mentions (72h cooldown applied)`);
            
            // Log data freshness for debugging but don't use it to skip cooldown
            const dataFreshness = twitterData._dataFreshness || 'unknown';
            if (dataFreshness !== 'unknown') {
              console.log(`📊 Data freshness: ${dataFreshness.replace('_', ' ')}`);
            }
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
        
        // Much longer delay between batches to respect Twitter API limits
        if (i + batchSize < allTokens.length) {
          console.log(`⏳ Waiting ${delayMs * 3 / 1000} seconds before next Twitter batch...`);
          await this.delay(delayMs * 3); // Triple delay between batches (90 seconds)
        }
        
      } catch (error) {
        console.error(`❌ Twitter batch ${batchNumber} failed:`, error.message);
        // Still mark all tokens in batch as completed Twitter stage
        tokens.forEach(t => {
          t.stage = 'twitter';
          t.twitterTimestamp = new Date().toISOString();
          // 🚨 PRESERVE EXISTING DATA: Only set defaults if NO twitterData exists at all
          if (!t.twitterData) {
            t.twitterData = { mentions: 0, mentions24h: 0, likes: 0, retweets: 0, replies: 0, followers: 0 };
            t.communityHealthScore = 2.0; // Lowered from 5.0 to prevent massive jumps when adding social data
            console.log(`⚠️ No Twitter data for ${t.symbol}, using defaults`);
          } else {
            console.log(`✅ Preserving existing Twitter data for ${t.symbol}: ${t.twitterData.mentions} mentions`);
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
    
    console.log(`✅ Twitter Stage Complete: ${totalProcessed} tokens processed, ${totalSkipped} tokens skipped (72h rule) in ${Math.ceil(allTokens.length / batchSize)} batches`);
    
    // 🚨 CRITICAL FIX: Update processing queue to remove processed tokens
    // Mark all processed tokens as completed and remove them from queue
    const processedTokens = allTokens.filter(token => {
      // Keep tokens that have been processed through Twitter stage
      return token.stage === 'twitter' || token.twitterTimestamp;
    });
    
    // Update the main processing queue with only unprocessed tokens
    this.processingQueue = this.processingQueue.filter(token => {
      // Remove tokens that have been processed through Twitter stage
      return !(token.stage === 'twitter' || token.twitterTimestamp);
    });
    
    console.log(`🧹 PROCESSING QUEUE UPDATED: ${allTokens.length} → ${this.processingQueue.length} tokens (removed ${allTokens.length - this.processingQueue.length} processed tokens)`);
    
    // 🚀 AUTOMATIC TWITTER DATA MERGE
    // Merge fresh Twitter data into main cache immediately after Twitter stage
    try {
      console.log('🔄 Starting automatic Twitter data merge...');
      const { default: TwitterDataMergeService } = await import('./twitterDataMergeService.js');
      const mergeService = new TwitterDataMergeService();
      const mergeResult = await mergeService.automaticMerge();
      
      if (mergeResult.success) {
        console.log(`✅ Automatic Twitter merge completed: ${mergeResult.result?.updated || 0} tokens updated`);
      } else {
        console.log(`⚠️ Automatic Twitter merge failed: ${mergeResult.error}`);
      }
    } catch (error) {
      console.log(`⚠️ Automatic Twitter merge error: ${error.message}`);
      // Don't fail the entire stage if merge fails
    }
  }

  /**
   * Process new tokens imported from Jup-service through full pipeline
   * This ensures new tokens get Twitter data, social health scores, and overall scores
   */
  async processNewTokensFromJupService() {
    console.log('🚀 Processing new Jup-service tokens through full pipeline...');
    
    try {
      // Get tokens that were recently imported from Jup-service and need processing
      let tokens = [];
      try {
        const cachePath = path.join(this.cacheDir, 'tokens-cache.json');
        if (await fs.access(cachePath).then(() => true).catch(() => false)) {
          const cacheData = await fs.readFile(cachePath, 'utf8');
          tokens = JSON.parse(cacheData);
          console.log(`📊 Loaded ${tokens.length} tokens from cache for Jup-service processing`);
        }
      } catch (error) {
        console.error('❌ Error loading tokens from cache:', error.message);
        return;
      }
      const newJupTokens = tokens.filter(token => 
        token.source === 'jupiter' && 
        token.stage === 'jupiter' && 
        token.hasJupiterData &&
        token.lastDiscoveredAt && 
        (Date.now() - new Date(token.lastDiscoveredAt).getTime()) < (5 * 60 * 1000) // Within last 5 minutes
      );
      
      if (newJupTokens.length === 0) {
        console.log('📊 No new Jup-service tokens found for processing');
        return;
      }
      
      console.log(`📊 Found ${newJupTokens.length} new Jup-service tokens to process`);
      
      // Add to processing queue
      this.processingQueue = newJupTokens;
      
      // Process through Twitter stage
      console.log('🐦 Processing Jup-service tokens through Twitter stage...');
      await this.processTwitterStage();
      
      // Process through scoring stage
      console.log('📊 Processing Jup-service tokens through scoring stage...');
      await this.processScoringStage();
      
      // Save final results
      console.log('💾 Saving processed Jup-service tokens...');
      await this.saveFinalDatabase();
      
      console.log(`✅ Jup-service token processing completed: ${newJupTokens.length} tokens processed`);
      
    } catch (error) {
      console.error('❌ Jup-service token processing failed:', error.message);
    }
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
        
        // 🚨 QUALITY FILTER: Skip scoring for low-quality tokens
        const hasLaunchpad = token.jupiterData?.launchpad && token.jupiterData.launchpad !== '';
        const hasOrganicScore = token.jupiterData?.organicScore && token.jupiterData.organicScore > 0;
        const hasGraduatedAt = token.jupiterData?.graduatedAt && token.jupiterData.graduatedAt !== '';
        
        if (!hasLaunchpad && !hasOrganicScore && !hasGraduatedAt) {
          console.log(`🚫 QUALITY FILTER: Skipping score calculation for ${token.symbol} (${token.contractAddress?.substring(0, 8)}) - Missing ALL quality criteria`);
          console.log(`   - Launchpad: ❌ (${token.jupiterData?.launchpad || 'missing'})`);
          console.log(`   - Organic Score: ❌ (${token.jupiterData?.organicScore || 0})`);
          console.log(`   - Graduated At: ❌ (${token.jupiterData?.graduatedAt || 'missing'})`);
          continue; // Skip this token
        }
        
        console.log(`📊 Calculating score for ${token.symbol} (${i + 1}/${tokens.length})`);
        
        try {
          // Ensure token has Twitter data for scoring - preserve existing or use fallback
          if (!token.twitterData) {
            // Try to find existing cached Twitter data
            const existingToken = this.processedTokens.find(t => 
              t.contractAddress && token.contractAddress && 
              t.contractAddress.toLowerCase() === token.contractAddress.toLowerCase()
            );
            
            if (existingToken?.twitterData) {
              console.log(`📦 Using cached Twitter data for ${token.symbol} during scoring`);
              token.twitterData = existingToken.twitterData;
              token.twitterTimestamp = existingToken.twitterTimestamp;
            } else {
              // Use cohort baseline to prevent score collapse
              const marketCap = token.jupiterData?.mcap || token.marketCap || 0;
              const baselineMentions = marketCap > 10000000 ? 15 : marketCap > 1000000 ? 8 : 4;
              
              token.twitterData = {
                mentions: baselineMentions,
                displayMentions: baselineMentions,
                mentions24h: 0,
                likes: baselineMentions * 2,
                retweets: Math.floor(baselineMentions * 0.5),
                replies: Math.floor(baselineMentions * 0.3),
                followers: 0,
                engagement: { total: baselineMentions * 3 },
                _dataFreshness: 'cohort_baseline'
              };
              console.log(`🎯 Applied cohort baseline for ${token.symbol}: ${baselineMentions} mentions`);
            }
          }
          
          // CRITICAL: Always recalculate community health score from Twitter data (cached or fresh)
          if (token.twitterData) {
            await this.ensureSocialDataService();
            token.communityHealthScore = this.socialDataService.calculateCommunityHealthScore(token.twitterData, token.socials, token.jupiterData);
            console.log(`🏆 Community Health Score calculated for ${token.symbol}: ${token.communityHealthScore.toFixed(2)}/10`);
          } else {
            token.communityHealthScore = 2.0; // Fallback base score
            console.log(`⚠️ No Twitter data for ${token.symbol}, using base community score: 2.0`);
          }
          
          const enhancedScore = this.calculateEnhancedOverallScore(token);
          token.enhancedScore = enhancedScore;
          token.overallScore = enhancedScore;
          token.stage = 'scoring';
          token.scoringTimestamp = new Date().toISOString();
          
          // Persist hype snapshot (hourly min, 30d retention) - AFTER overall score calculation
          try {
            const contractAddress = token.contractAddress;
            if (contractAddress) {
              const mentions = token.mentions || token.twitterData?.mentions || 0;
              const followers = token.twitterData?.followers || 0;
              const engagement = (token.twitterData?.likes || 0) + (token.twitterData?.retweets || 0) + (token.twitterData?.replies || 0);
              const score = enhancedScore || 0;
              const label = score >= 9 ? 'Viral' : score >= 8 ? 'Trending' : score >= 7 ? 'Building' : score >= 5 ? 'Waking Up' : 'Sleeping';
              
              await this.hypeService.appendSnapshot(contractAddress, {
                score: score,
                label: label,
                mentions: mentions,
                twitterMentions: mentions,
                engagement: engagement,
                followers: followers,
                organicScore: token.jupiterData?.organicScore || token.organicScore || 0,
                volume24h: token.jupiterData?.volume24h || token.volume24h || 0,
                priceChange24h: token.jupiterData?.priceChange24h || token.priceChange24h || 0,
                communityHealthScore: token.communityHealthScore || 0,
                overallScore: enhancedScore || 0
              });
              
              console.log(`📸 Hype snapshot saved for ${token.symbol} (overall score: ${score.toFixed(1)}, community: ${token.communityHealthScore?.toFixed(1) || 'N/A'})`);
            }
          } catch (snapErr) {
            console.log(`⚠️ Hype snapshot save failed for ${token.symbol}: ${snapErr.message}`);
          }
          
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
      
      // 🚨 CRITICAL FIX: Update processing queue to remove processed tokens
      // Mark all processed tokens as completed and remove them from queue
      const processedTokens = tokens.filter(token => {
        // Keep tokens that have been processed through scoring stage
        return token.stage === 'scoring' || token.scoringTimestamp;
      });
      
      // Update the main processing queue with only unprocessed tokens
      this.processingQueue = this.processingQueue.filter(token => {
        // Remove tokens that have been processed through scoring stage
        return !(token.stage === 'scoring' || token.scoringTimestamp);
      });
      
      console.log(`🧹 PROCESSING QUEUE UPDATED: ${tokens.length} → ${this.processingQueue.length} tokens (removed ${tokens.length - this.processingQueue.length} processed tokens)`);
      
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
      
      // 🚨 CRITICAL FIX: Update processing queue even on error
      this.processingQueue = this.processingQueue.filter(token => {
        return !(token.stage === 'scoring' || token.scoringTimestamp);
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
      
      // Load existing cache and merge with processed tokens
      let existingTokens = [];
      try {
        const cachePath = path.join(this.cacheDir, 'tokens-cache.json');
        if (await fs.access(cachePath).then(() => true).catch(() => false)) {
          const cacheData = await fs.readFile(cachePath, 'utf8');
          existingTokens = JSON.parse(cacheData);
          console.log(`📊 Loaded ${existingTokens.length} existing tokens from cache`);
        }
      } catch (error) {
        console.warn('⚠️ Could not load existing cache, starting fresh:', error.message);
      }
      
      // 🚨 CRITICAL FIX: Preserve existing cache tokens, only deduplicate new tokens
      // First, deduplicate only the newly processed tokens
      const deduplicatedNewTokens = this.deduplicateTokens(tokensToSave);
      console.log(`🔄 New tokens deduplication: ${tokensToSave.length} → ${deduplicatedNewTokens.length} tokens (removed ${tokensToSave.length - deduplicatedNewTokens.length} duplicates)`);
      
      // Then merge with existing tokens, preserving existing cache
      const finalUniqueTokens = this.mergeWithExistingTokens(deduplicatedNewTokens, existingTokens);
      console.log(`🔄 Final merge: ${existingTokens.length} existing + ${deduplicatedNewTokens.length} new = ${finalUniqueTokens.length} total tokens`);
      
      // Save to cache
      const cachePath = path.join(this.cacheDir, 'tokens-cache.json');
      await fs.writeFile(cachePath, JSON.stringify(finalUniqueTokens, null, 2));
      
      // Update our internal state with deduplicated tokens
      this.processedTokens = finalUniqueTokens;
      
      console.log(`✅ Final Database Saved: ${finalUniqueTokens.length} unique tokens`);
      console.log(`📊 New tokens added: ${tokensToSave.length}`);
      console.log(`📊 Total tokens in database: ${finalUniqueTokens.length}`);
      
      // 🚨 CRITICAL FIX: Clear the processing queue after successful save
      const originalQueueLength = this.processingQueue.length;
      this.processingQueue = [];
      console.log(`🧹 PROCESSING QUEUE CLEARED: ${originalQueueLength} → 0 tokens (all processed and saved)`);
      
    } catch (error) {
      console.error('❌ Failed to save final database:', error);
      console.error('Error details:', error.message);
      console.error('Stack trace:', error.stack);
      
      // 🚨 CRITICAL FIX: Clear processing queue even on error to prevent accumulation
      const originalQueueLength = this.processingQueue.length;
      this.processingQueue = [];
      console.log(`🧹 PROCESSING QUEUE CLEARED (after error): ${originalQueueLength} → 0 tokens`);
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
      // Use the configured batch size to respect rate limits
      const effectiveBatchSize = batchSize; // Use exact batch size from configuration
      
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
      
      // Use the proper Jupiter service with rate limiting and error handling
      const jupiterResults = await this.jupiterService.getBatchTokenDetails(contractAddresses);
      
      if (jupiterResults && jupiterResults.length > 0) {
        console.log(`✅ Jupiter returned data for ${jupiterResults.length} tokens`);
        
        // Create a map of contract address to Jupiter data
        const jupiterMap = new Map();
        jupiterResults.forEach((result, index) => {
          if (result && contractAddresses[index]) {
            // result IS the Jupiter data, contractAddresses[index] is the contract address
            jupiterMap.set(contractAddresses[index], result);
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

  async fetchTwitterData(symbol, name, officialHandle = null, token = null) {
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
      
      // 🚨 CRITICAL FIX: Pass Jupiter data to social service for enhanced fallbacks
      if (token?.jupiterData) {
        // Temporarily store Jupiter data in the social service for this call
        this.socialDataService._currentJupiterData = token.jupiterData;
        console.log(`📊 Passing Jupiter data to social service for ${symbol} (mcap: $${token.jupiterData.marketCap?.toLocaleString()})`);
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
          error: 'No data found',
          _dataFreshness: 'no_data_found'
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
        error: error.message,
        _dataFreshness: 'api_error'
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

  getHypeLabel(score) {
    if (score >= 9) return 'Viral';
    if (score >= 8) return 'Trending';
    if (score >= 7) return 'Building';
    if (score >= 5) return 'Waking Up';
    return 'Sleeping';
  }

  // =============================
  // Candidate and safety filters
  // =============================
  isExcludedMajorOrStable(token) {
    try {
      const symbolRaw = (token?.symbol || token?.jupiterData?.symbol || '').toString();
      const nameRaw = (token?.name || token?.jupiterData?.name || '').toString();
      const contractAddress = token?.contractAddress || token?.jupiterData?.contractAddress || '';
      
      const symbol = symbolRaw.trim().toUpperCase();
      const name = nameRaw.trim().toUpperCase();
      
      // Check banned symbols
      const bannedSymbols = new Set([
        'WETH','WBTC','ETH','BTC','SOL','USDC','USDT','DAI','TUSD','FRAX','PYUSD','WBNB','WBCH','WAVAX','BNSOL'
      ]);
      if (bannedSymbols.has(symbol)) return true;
      
      // Check banned contract addresses
      const bannedContracts = new Set([
        'So11111111111111111111111111111111111111112', // Wrapped SOL
        'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
        'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
        'BNso1VUJnh4zcfpZa6986Ea66P6TCp59hvtNJ8b1X85', // BNSOL (Binance Staked SOL)
        'pSo1f9nQXWgXibFtKf7NWYxb5enAM4qfP6UJSiXRQfL'  // Additional stablecoin
      ]);
      if (bannedContracts.has(contractAddress)) return true;
      
      // Check banned name fragments
      const bannedFragments = [' STABLE', 'STABLE ', ' STABLECOIN', 'WRAPPED ETH', 'WRAPPED BTC'];
      const hay = `${symbol} ${name}`;
      return bannedFragments.some(f => hay.includes(f));
    } catch (_) {
      return false;
    }
  }
  isValidCandidate(token) {
    const ca = token?.contractAddress;
    return typeof ca === 'string' && ca !== 'null' && ca.length > 10;
  }

  isTrueish(value) {
    if (value === true) return true;
    if (typeof value === 'string') {
      const v = value.toLowerCase().trim();
      return v === 'true' || v === '1' || v === 'yes' || v === 'y';
    }
    if (typeof value === 'number') return value === 1;
    return false;
  }

  isSuspiciousToken(token) {
    try {
      const audit = token?.audit || {};
      const auditInfo = token?.auditInfo || {};
      const jupAudit = token?.jupiterData?.audit || {};
      const candidates = [audit.isSus, auditInfo.isSus, jupAudit.isSus, token?.isSus];
      return candidates.some(v => this.isTrueish(v));
    } catch (_) {
      return false;
    }
  }

  isRuggedToken(token) {
    try {
      const stats24h = token?.jupiterData?.stats24h;
      const stats6h = token?.jupiterData?.stats6h;
      const liquidity = token?.jupiterData?.liquidity;
      if (!stats24h || !stats6h || liquidity == null) return false;
      const priceChange24h = stats24h.priceChange || 0;
      const priceChange6h = stats6h.priceChange || 0;
      if (priceChange24h <= -80) return true;
      if (priceChange6h <= -70) return true;
      if (liquidity <= 1000 && priceChange24h <= -60) return true;
      return false;
    } catch (_) {
      return false;
    }
  }

  async shouldRefreshTwitterData(token) {
    // 🚨 NEW: Use Twitter API Manager for smart refresh decisions
    if (this.socialDataService?.twitterApiManager) {
      try {
        // HARD 72h GATE: short-circuit before manager
        if (token.twitterTimestamp) {
          const last = new Date(token.twitterTimestamp).getTime();
          const hours = (Date.now() - last) / (1000 * 60 * 60);
          if (hours < 72) {
            return false;
          }
        }
        const canRefresh = await this.socialDataService.twitterApiManager.canRefreshToken(token);
        if (!canRefresh.allowed) {
          console.log(`🚨 Twitter API Manager blocked refresh for ${token.symbol}: ${canRefresh.reason}`);
          return false;
        }
        console.log(`✅ Twitter API Manager approved refresh for ${token.symbol} (${canRefresh.tier} tier)`);
        return true;
      } catch (error) {
        console.error(`❌ Error checking Twitter API Manager for ${token.symbol}:`, error);
        // Fall back to legacy logic if API manager fails
      }
    }
    
    // LEGACY FALLBACK: If no existing Twitter data, always refresh
    if (!token.twitterData || !token.twitterTimestamp) {
      return true;
    }
    
    // LEGACY FALLBACK: Check if it's been more than 72 hours since last Twitter update
    const lastUpdate = new Date(token.twitterTimestamp);
    const now = new Date();
    const hoursSinceUpdate = (now - lastUpdate) / (1000 * 60 * 60);
    
    // Refresh if more than 72 hours have passed
    const needsRefresh = hoursSinceUpdate >= 72;
    
    if (needsRefresh) {
      console.log(`⏰ ${token.symbol}: Last Twitter update was ${hoursSinceUpdate.toFixed(1)} hours ago (72h+ threshold)`);
    } else {
      console.log(`⏰ ${token.symbol}: Last Twitter update was ${hoursSinceUpdate.toFixed(1)} hours ago (within 72h)`);
    }
    
    return needsRefresh;
  }

  // Legacy method for synchronous operations (like merge)
  legacyShouldRefreshTwitterData(token) {
    // If no existing Twitter data, always refresh
    if (!token.twitterData || !token.twitterTimestamp) {
      return true;
    }
    
    // Check if it's been more than 24 hours since last Twitter update
    const lastUpdate = new Date(token.twitterTimestamp);
    const now = new Date();
    const hoursSinceUpdate = (now - lastUpdate) / (1000 * 60 * 60);
    
    // Refresh if more than 72 hours have passed
    return hoursSinceUpdate >= 72;
  }

  // ENHANCED DEDUPLICATION METHOD: Remove duplicates by CONTRACT ADDRESS with symbol fallback
  deduplicateTokens(tokens) {
    const inputTokens = Array.isArray(tokens) ? tokens : [];
    const totalInput = inputTokens.length;
    console.log(`\n🔍 Enhanced Deduplication start: input tokens = ${totalInput}`);
    
    const seen = new Set();
    const firstByContract = new Map();
    const firstBySymbol = new Map();
    const uniqueTokens = [];
    
    // Source priority for conflict resolution (higher number = higher priority)
    const sourcePriority = {
      'jupiter': 4,      // Highest priority - most complete data
      'dexscreener': 3,  // High priority - has contract addresses
      'birdeye': 2,      // Medium priority
      'coingecko': 1     // Lowest priority - often missing contracts
    };
    
    for (const token of inputTokens) {
      const contractKey = token.contractAddress?.toLowerCase();
      const symbolKey = token.symbol?.toUpperCase();
      const hasValidContract = contractKey && contractKey !== 'null' && contractKey.length > 10;
      
      let isDuplicate = false;
      let duplicateReason = '';
      let shouldKeep = true;
      
      if (hasValidContract) {
        // Primary deduplication by contract address
        if (seen.has(`contract:${contractKey}`)) {
          const existingToken = firstByContract.get(contractKey);
          const currentPriority = sourcePriority[token.source] || 0;
          const existingPriority = sourcePriority[existingToken?.source] || 0;
          
          if (currentPriority > existingPriority) {
            // Replace existing token with higher priority one
            console.log(`🔄 Replacing lower priority token: ${existingToken?.symbol} (${existingToken?.source}) -> ${token.symbol} (${token.source})`);
            const existingIndex = uniqueTokens.findIndex(t => 
              t.contractAddress?.toLowerCase() === contractKey
            );
            if (existingIndex >= 0) {
              uniqueTokens[existingIndex] = token;
              firstByContract.set(contractKey, token);
            }
            shouldKeep = false;
          } else {
            isDuplicate = true;
            duplicateReason = `contract address (kept higher priority: ${existingToken?.source})`;
            shouldKeep = false;
          }
        } else {
          // New contract address
          seen.add(`contract:${contractKey}`);
          firstByContract.set(contractKey, token);
        }
      } else if (symbolKey) {
        // Fallback deduplication by symbol for tokens without valid contract addresses
        if (seen.has(`symbol:${symbolKey}`)) {
          const existingToken = firstBySymbol.get(symbolKey);
          const existingHasContract = existingToken?.contractAddress && 
                                   existingToken.contractAddress !== 'null' && 
                                   existingToken.contractAddress.length > 10;
          
          if (existingHasContract) {
            // Always prefer token with contract address
            isDuplicate = true;
            duplicateReason = `symbol (kept version with contract address)`;
            shouldKeep = false;
          } else {
            // Both tokens lack contract addresses, use source priority
            const currentPriority = sourcePriority[token.source] || 0;
            const existingPriority = sourcePriority[existingToken?.source] || 0;
            
            if (currentPriority > existingPriority) {
              console.log(`🔄 Replacing lower priority token without contract: ${existingToken?.symbol} (${existingToken?.source}) -> ${token.symbol} (${token.source})`);
              const existingIndex = uniqueTokens.findIndex(t => 
                t.symbol?.toUpperCase() === symbolKey && 
                (!t.contractAddress || t.contractAddress === 'null' || t.contractAddress.length <= 10)
              );
              if (existingIndex >= 0) {
                uniqueTokens[existingIndex] = token;
                firstBySymbol.set(symbolKey, token);
              }
              shouldKeep = false;
            } else {
              isDuplicate = true;
              duplicateReason = `symbol without contract (kept higher priority: ${existingToken?.source})`;
              shouldKeep = false;
            }
          }
        } else {
          // New symbol without contract
          seen.add(`symbol:${symbolKey}`);
          firstBySymbol.set(symbolKey, token);
        }
      } else {
        // Token has neither valid contract nor symbol - skip it
        console.log(`⚠️ Skipping token without valid contract or symbol: ${JSON.stringify({name: token.name, symbol: token.symbol, contract: token.contractAddress})}`);
        shouldKeep = false;
      }
      
      if (shouldKeep && !isDuplicate) {
        uniqueTokens.push(token);
      } else if (isDuplicate) {
        console.log(`🔄 Removed duplicate by ${duplicateReason}: ${token.symbol} (${token.contractAddress || 'no contract'}) from ${token.source}`);
      }
    }
    
    console.log(`✅ Enhanced Deduplication complete: unique tokens = ${uniqueTokens.length}, removed = ${totalInput - uniqueTokens.length}`);
    return uniqueTokens;
  }

  mergeWithExistingTokens(newTokens, existingTokens) {
    console.log(`\n🔗 Merge start: new=${Array.isArray(newTokens) ? newTokens.length : 0}, existing=${Array.isArray(existingTokens) ? existingTokens.length : 0}`);
    const merged = [...newTokens];

    for (const existing of existingTokens) {
      // Deduplicate ONLY by contract address (symbols can collide across different tokens)
      const existingIndex = merged.findIndex(t =>
        t.contractAddress && existing.contractAddress &&
        t.contractAddress.toLowerCase() === existing.contractAddress.toLowerCase()
      );

      if (existingIndex >= 0) {
        const newToken = merged[existingIndex];
        if ((existing.symbol || '').toUpperCase() === 'STUPID' || (newToken.symbol || '').toUpperCase() === 'STUPID') {
          console.log(`🧪 [Merge] MATCH by CA for STUPID: existing=${existing.contractAddress} new=${newToken.contractAddress}`);
        } else {
          console.log(`🔁 Merge match by CA: existing ${existing.symbol} (${existing.contractAddress}) with new ${newToken.symbol} (${newToken.contractAddress})`);
        }
        // 🚨 CRITICAL FIX: Update existing token with new Jupiter data but NEVER wipe Twitter data
        const mergedToken = {
          ...existing,
          ...merged[existingIndex],
          // ALWAYS preserve Twitter data during Jupiter updates - Twitter refresh is handled separately
          twitterData: existing.twitterData,
          twitterTimestamp: existing.twitterTimestamp,
          communityHealthScore: existing.communityHealthScore,
          // Preserve other existing data
          enhancedScore: existing.enhancedScore,
          overallScore: existing.overallScore,
          jupiterData: existing.jupiterData,
          jupiterTimestamp: existing.jupiterTimestamp
        };
        
        merged[existingIndex] = mergedToken;
        console.log(`🔄 Merged existing token ${existing.symbol} (preserved recent Twitter/Jupiter data when applicable)`);
      } else {
        // 🚨 CRITICAL FIX: ALWAYS add existing tokens to the final merged result
        // The stage filtering should only apply to processing queue, not to final result
        merged.push(existing);
        console.log(`➕ Added existing token ${existing.symbol} to final result (stage: ${existing.stage})`);
      }
    }
    
    console.log(`✅ Merge complete: total=${merged.length}`);
    
    // Cleanup the already queued set if it's getting too large
    this.cleanupAlreadyQueuedSet();
    
    return merged;
  }

  /**
   * Load already queued set from disk
   */
  loadAlreadyQueuedSet() {
    try {
      const data = fsSync.readFileSync(this.alreadyQueuedFile, 'utf8');
      const queuedArray = JSON.parse(data || '[]');
      this.alreadyQueuedSet = new Set(queuedArray);
      console.log(`📂 Loaded ${this.alreadyQueuedSet.size} already-queued tokens from disk`);
    } catch (error) {
      // File doesn't exist or is corrupted, start fresh
      this.alreadyQueuedSet = new Set();
      console.log('📂 Starting with empty already-queued set');
    }
  }

  /**
   * Populate already queued set with existing tokens that have recent Twitter data
   * This prevents duplicate Twitter API calls on restart
   */
  async populateAlreadyQueuedFromExisting() {
    try {
      const existingTokens = await this.loadExistingData();
      const now = new Date();
      const cooldownMs = 72 * 60 * 60 * 1000; // 72 hours
      let populated = 0;

      for (const token of existingTokens) {
        if (token.twitterTimestamp) {
          const twitterAge = now - new Date(token.twitterTimestamp);
          if (twitterAge < cooldownMs) {
            // Token has recent Twitter data, add to already queued set
            const key = (token.contractAddress || token.symbol || '').toLowerCase();
            if (!this.alreadyQueuedSet.has(key)) {
              this.alreadyQueuedSet.add(key);
              populated++;
            }
          }
        }
      }

      if (populated > 0) {
        this.saveAlreadyQueuedSet();
        console.log(`🔄 Populated ${populated} tokens with recent Twitter data into already-queued set`);
      }
    } catch (error) {
      console.error('❌ Failed to populate already-queued set from existing tokens:', error.message);
    }
  }

  /**
   * Save already queued set to disk
   */
  saveAlreadyQueuedSet() {
    try {
      const queuedArray = Array.from(this.alreadyQueuedSet);
      fsSync.writeFileSync(this.alreadyQueuedFile, JSON.stringify(queuedArray, null, 2));
    } catch (error) {
      console.error('❌ Failed to save already-queued set:', error.message);
    }
  }

  /**
   * Clean up old entries from already queued set (keep only last 24 hours of entries)
   */
  cleanupAlreadyQueuedSet() {
    // For now, just limit the size to prevent it from growing indefinitely
    if (this.alreadyQueuedSet.size > 1000) {
      console.log(`🧹 Cleaning up already-queued set (${this.alreadyQueuedSet.size} entries)`);
      // Convert to array, keep last 500 entries, convert back to Set
      const entries = Array.from(this.alreadyQueuedSet);
      this.alreadyQueuedSet = new Set(entries.slice(-500));
      this.saveAlreadyQueuedSet();
      console.log(`🧹 Cleaned up to ${this.alreadyQueuedSet.size} entries`);
    }
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
          const jupiterData = await this.jupiterService.getTokenDetails(token.contractAddress);
          if (jupiterData && !jupiterData.fallback) {
            // 🚨 QUALITY FILTER: Check if token meets quality criteria
            const hasLaunchpad = jupiterData.launchpad && jupiterData.launchpad !== '';
            const hasOrganicScore = jupiterData.organicScore && jupiterData.organicScore > 0;
            const hasGraduatedAt = jupiterData.graduatedAt && jupiterData.graduatedAt !== '';
            
            // Only process if at least ONE quality criteria is present (not all missing)
            if (!hasLaunchpad && !hasOrganicScore && !hasGraduatedAt) {
              console.log(`🚫 QUALITY FILTER: ${token.symbol} (${token.contractAddress?.substring(0, 8)}) - Missing ALL quality criteria:`);
              console.log(`   - Launchpad: ❌ (${jupiterData.launchpad || 'missing'})`);
              console.log(`   - Organic Score: ❌ (${jupiterData.organicScore || 0})`);
              console.log(`   - Graduated At: ❌ (${jupiterData.graduatedAt || 'missing'})`);
              console.log(`   - Token will be marked for removal`);
              return null; // Return null to indicate token should be removed
            }
            
            console.log(`✅ QUALITY FILTER: ${token.symbol} - Has at least one quality indicator`);
            console.log(`   - Launchpad: ${hasLaunchpad ? '✅' : '❌'} (${jupiterData.launchpad || 'missing'})`);
            console.log(`   - Organic Score: ${hasOrganicScore ? '✅' : '❌'} (${jupiterData.organicScore || 0})`);
            console.log(`   - Graduated At: ${hasGraduatedAt ? '✅' : '❌'} (${jupiterData.graduatedAt || 'missing'})`);
            
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
        finalScore = this.socialDataService.calculateCommunityHealthScore(token.twitterData, token.socials, token.jupiterData);
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
        token.communityScore = this.socialDataService.calculateCommunityHealthScore(token.twitterData, token.socials, token.jupiterData);
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
      const cachePath = path.join(this.cacheDir, 'tokens-cache.json');
      let tokens = [];
      
      try {
        const data = await fs.readFile(cachePath, 'utf8');
        tokens = JSON.parse(data);
      } catch (error) {
        console.log('📁 Creating new tokens cache for paid token');
        tokens = [];
      }

      // Check if token already exists by CONTRACT ADDRESS (symbols can collide)
      const existingIndex = tokens.findIndex(t => 
        t.contractAddress && token.contractAddress &&
        t.contractAddress.toLowerCase() === token.contractAddress.toLowerCase()
      );
      if (existingIndex !== -1) {
        tokens[existingIndex] = token;
        console.log(`🔄 Updated existing token ${token.symbol} in cache (by CA ${token.contractAddress})`);
      } else {
        tokens.push(token);
        console.log(`➕ Added new paid token ${token.symbol} to cache (CA ${token.contractAddress})`);
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
      lastActivity: this.lastActivity,
      isHealthy: this.isHealthy(),
      sources: {
        coingecko: this.processingQueue.filter(t => t.source === 'coingecko').length,
        dexscreener: this.processingQueue.filter(t => t.source === 'dexscreener').length,
        total: this.processingQueue.length
      },
      coinGeckoPageSet: `${this.coinGeckoPageState.currentPageSet}/${this.coinGeckoPageState.maxPageSets}`,
      lastUpdated: new Date().toISOString()
    };
  }

  isHealthy() {
    // Check if processor is in a healthy state
    if (!this.isProcessing) {
      return true; // Not processing is healthy
    }
    
    // If processing, check if it's been active recently
    const now = Date.now();
    const timeSinceLastActivity = now - (this.lastActivity || 0);
    
    // If no activity for more than 15 minutes while processing, it's unhealthy
    return timeSinceLastActivity < 15 * 60 * 1000;
  }

  updateActivity() {
    this.lastActivity = Date.now();
  }

  // CoinGecko page cycling methods
  loadCoinGeckoPageState() {
    try {
      if (fsSync.existsSync(this.coinGeckoPageState.stateFile)) {
        const data = fsSync.readFileSync(this.coinGeckoPageState.stateFile, 'utf8');
        const state = JSON.parse(data);
        this.coinGeckoPageState.currentPageSet = state.currentPageSet || 1;
        console.log(`📄 Loaded CoinGecko page state: set ${this.coinGeckoPageState.currentPageSet}/${this.coinGeckoPageState.maxPageSets}`);
      }
    } catch (error) {
      console.log('📄 No existing CoinGecko page state found, starting from set 1');
      this.coinGeckoPageState.currentPageSet = 1;
    }
  }

  saveCoinGeckoPageState() {
    try {
      const state = { currentPageSet: this.coinGeckoPageState.currentPageSet };
      fsSync.writeFileSync(this.coinGeckoPageState.stateFile, JSON.stringify(state, null, 2));
    } catch (error) {
      console.error('❌ Error saving CoinGecko page state:', error.message);
    }
  }

  advanceCoinGeckoPageSet() {
    this.coinGeckoPageState.currentPageSet++;
    if (this.coinGeckoPageState.currentPageSet > this.coinGeckoPageState.maxPageSets) {
      this.coinGeckoPageState.currentPageSet = 1; // Reset to first set
      console.log('🔄 CoinGecko page cycling: Reset to page set 1 (pages 1-3)');
    } else {
      const startPage = (this.coinGeckoPageState.currentPageSet - 1) * 3 + 1;
      const endPage = startPage + 2;
      console.log(`🔄 CoinGecko page cycling: Advanced to page set ${this.coinGeckoPageState.currentPageSet} (pages ${startPage}-${endPage})`);
    }
    this.saveCoinGeckoPageState();
  }

  stopProcessing() {
    console.log('🛑 Stopping token processing...');
    this.isProcessing = false;
  }
}

export default EnhancedTokenProcessor;
