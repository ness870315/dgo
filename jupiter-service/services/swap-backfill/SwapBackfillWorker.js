import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import ChartDatabase from './ChartDatabase.js';
import GrpcWrapper from './GrpcWrapper.cjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONSTANT_K_GRPC_ENDPOINT = 'https://yellowstone.constant-k.com:443';
const CONSTANT_K_GRPC_TOKEN = '39facrmt-om2u-4al5-5k4h-g8pls2y5vhui';
const HELIUS_API_KEY = '6e92c2eb-b739-4e43-ae2b-0d1a40a07f0f';

/**
 * Swap Backfill Worker for Jupiter Service
 * Backfills historical swap data using Constant K gRPC
 * Stores to the same ChartDatabase as live swaps
 */
class SwapBackfillWorker {
  constructor() {
    this.chartDatabase = new ChartDatabase();
    this.grpcClient = null;
    this.grpcWrapper = null;
    this.isRunning = false;
    this.processedPools = new Set();
    this.activeStreams = new Map();
    this.lastProcessedSlots = new Map(); // Map<tokenAddress, lastSlot>
    this.replayWindow = 3000; // 3000 slots = ~20 minutes of history
  }

  /**
   * Initialize and load the database
   */
  async initialize() {
    try {
      console.log('🔄 [SwapBackfillWorker] Initializing...');
      
      // Initialize gRPC wrapper and client
      this.grpcWrapper = new GrpcWrapper();
      this.grpcClient = await this.grpcWrapper.createClient(CONSTANT_K_GRPC_ENDPOINT, CONSTANT_K_GRPC_TOKEN);
      console.log('✅ [SwapBackfillWorker] gRPC client initialized');
      
      // ChartDatabase loads automatically in constructor
      console.log('✅ [SwapBackfillWorker] ChartDatabase ready');
      
      console.log('✅ [SwapBackfillWorker] Initialized successfully');
    } catch (error) {
      console.error('❌ [SwapBackfillWorker] Initialization failed:', error.message);
      throw error;
    }
  }

  /**
   * Backfill swaps for a specific token using Constant K gRPC
   */
  async backfillToken(tokenAddress, poolAddress = null) {
    try {
      console.log(`🔄 [SwapBackfillWorker] Starting backfill for ${tokenAddress.substring(0, 8)}...`);
      
      // Discover pool address if not provided
      if (!poolAddress) {
        poolAddress = await this.discoverPoolAddress(tokenAddress);
        if (!poolAddress) {
          console.error(`❌ [SwapBackfillWorker] Could not find pool for ${tokenAddress.substring(0, 8)}`);
          return { success: false, error: 'Pool not found' };
        }
        console.log(`✅ [SwapBackfillWorker] Discovered pool: ${poolAddress.substring(0, 8)}`);
      }

      // Get existing swap count
      const tokenDb = this.chartDatabase.getTokenDatabase(tokenAddress);
      const beforeCount = tokenDb.swaps ? tokenDb.swaps.size : 0;
      console.log(`📊 [SwapBackfillWorker] Current swaps in database: ${beforeCount}`);

      // Check if we need to backfill
      if (beforeCount > 10000) {
        console.log(`⚠️ [SwapBackfillWorker] Token already has ${beforeCount} swaps, skipping backfill`);
        return { 
          success: true, 
          message: 'Token already has sufficient data',
          existingSwaps: beforeCount
        };
      }

      // Backfill using Constant K gRPC for historical slots
      // Note: For now, we'll use Constant K to monitor recent slots
      // Historical backfill will be done by querying past slots
      console.log(`📅 [SwapBackfillWorker] Starting Constant K gRPC backfill for ${tokenAddress.substring(0, 8)}`);
      
      const result = await this.backfillWithConstantK(tokenAddress, poolAddress);
      
      return {
        success: true,
        ...result
      };

    } catch (error) {
      console.error(`❌ [SwapBackfillWorker] Backfill failed for ${tokenAddress.substring(0, 8)}:`, error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Backfill using Constant K gRPC
   */
  async backfillWithConstantK(tokenAddress, poolAddress) {
    try {
      console.log(`🔄 [SwapBackfillWorker] Starting Constant K backfill...`);
      
      // Get current SOL price for volume calculations
      this.solPriceUSD = await this.getSolPrice();
      
      // Subscribe to live stream for 1 minute to collect swaps
      const swaps = await this.fetchConstantKHistoricalSwaps(tokenAddress, poolAddress);
      
      if (!swaps || swaps.length === 0) {
        console.log(`⚠️ [SwapBackfillWorker] No swaps found for ${tokenAddress.substring(0, 8)}`);
        return { 
          message: 'No new swaps found',
          swapsAdded: 0,
          existingSwaps: 0
        };
      }

      // Store swaps in database
      const swapsToStore = swaps.map(swap => ({
        tokenAddress: tokenAddress,
        poolAddress: poolAddress,
        signature: swap.signature,
        timestamp: swap.timestamp,
        slot: swap.slot,
        price: swap.price || 0,
        volumeUsd: swap.volumeUsd || 0,
        source: 'constantk_backfill', // Different source tag
        type: swap.type || 'unknown',
        tokenAmount: swap.tokenAmount || 0,
        baseAmount: swap.baseAmount || 0,
        rawData: swap,
        createdAt: Date.now()
      }));

      await this.chartDatabase.storeSwaps(swapsToStore);
      console.log(`💾 [SwapBackfillWorker] Stored ${swapsToStore.length} swaps for ${tokenAddress.substring(0, 8)}`);

      return {
        swapsAdded: swapsToStore.length,
        totalSwaps: swapsToStore.length
      };

    } catch (error) {
      console.error(`❌ [SwapBackfillWorker] Constant K backfill failed:`, error.message);
      throw error;
    }
  }
  
  /**
   * Get current SOL price
   */
  async getSolPrice() {
    try {
      const response = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
      return response.data.solana?.usd || 150;
    } catch (error) {
      console.warn('⚠️ Could not fetch SOL price, using default $150');
      return 150;
    }
  }

  /**
   * Fetch historical swaps from Constant K gRPC
   * This subscribes to live stream temporarily to build historical data
   */
  async startContinuousMonitoring(tokenAddress, poolAddress, fromSlot = null) {
    // Calculate fromSlot for replay
    let replayFromSlot = fromSlot;
    if (!replayFromSlot) {
      // Try to get last processed slot from database
      const tokenDb = this.chartDatabase.getTokenDatabase(tokenAddress);
      if (tokenDb.swaps && tokenDb.swaps.size > 0) {
        const lastSwap = Array.from(tokenDb.swaps.values()).pop();
        if (lastSwap && lastSwap.slot) {
          const lastSlot = parseInt(lastSwap.slot);
          replayFromSlot = Math.max(0, lastSlot - 1); // Replay from 1 slot before last
          console.log(`📅 [SwapBackfillWorker] Replaying from slot ${replayFromSlot} (last was ${lastSlot})`);
        }
      } else {
        // No existing data - start from ~20 minutes ago (3000 slots)
        // Get current slot from gRPC to calculate historical window
        console.log(`📅 [SwapBackfillWorker] No existing data - will fetch historical window`);
      }
    }
    
    console.log(`📡 [SwapBackfillWorker] Starting ${replayFromSlot ? 'HISTORICAL BACKFILL' : 'HISTORICAL + LIVE'} monitoring for ${tokenAddress.substring(0, 8)}...`);
    
    // Create transaction filters matching backend's approach
    const transactionFilters = {
      client: {
        accountInclude: [poolAddress],
        accountExclude: [],
        accountRequired: [],
        vote: false,
        failed: false
      }
    };
    
    // Create subscribe request with fromSlot for replay
    const subscribeRequest = {
      accounts: {},
      slots: {},
      transactions: transactionFilters,
      transactionsStatus: {},
      entry: {},
      blocks: {},
      blocksMeta: {},
      commitment: this.grpcWrapper.getCommitmentLevel().CONFIRMED,
      accountsDataSlice: []
    };
    
    // Add fromSlot if we're doing historical replay
    if (replayFromSlot) {
      subscribeRequest.fromSlot = replayFromSlot;
      console.log(`🔄 [SwapBackfillWorker] Replay request: fromSlot=${replayFromSlot}`);
    }
    
    // Start continuous streaming - keep running indefinitely
    this.grpcClient.subscribeOnce(
      subscribeRequest.accounts,
      subscribeRequest.slots,
      subscribeRequest.transactions,
      subscribeRequest.transactionsStatus,
      subscribeRequest.entry,
      subscribeRequest.blocks,
      subscribeRequest.blocksMeta,
      subscribeRequest.commitment,
      subscribeRequest.accountsDataSlice
    ).then(stream => {
      this.activeStreams.set(tokenAddress, stream);
      const mode = replayFromSlot ? 'HISTORICAL BACKFILL' : 'LIVE';
      console.log(`✅ [SwapBackfillWorker] Started ${mode} monitoring stream for ${tokenAddress.substring(0, 8)}`);
      
      stream.on('data', async (msg) => {
        try {
          // Track slot for resume capability
          if (msg.slot) {
            this.lastProcessedSlots.set(tokenAddress, msg.slot);
          }
          
          if (msg.transaction?.transaction) {
            await this.processSwapMessage(msg, tokenAddress, poolAddress);
          }
        } catch (error) {
          console.error('❌ Error processing swap:', error.message);
        }
      });
      
      stream.on('end', () => {
        console.log(`⚠️ [SwapBackfillWorker] Stream ended for ${tokenAddress.substring(0, 8)} - reconnecting...`);
        this.activeStreams.delete(tokenAddress);
        this.reconnect(tokenAddress, poolAddress);
      });
      
      stream.on('error', (error) => {
        console.error(`❌ Stream error for ${tokenAddress.substring(0, 8)} - reconnecting...`, error.message);
        this.activeStreams.delete(tokenAddress);
        setTimeout(() => this.reconnect(tokenAddress, poolAddress), 5000);
      });
      
    }).catch(error => {
      console.error(`❌ Failed to start stream for ${tokenAddress.substring(0, 8)}:`, error.message);
      // Retry on failure
      setTimeout(() => this.startContinuousMonitoring(tokenAddress, poolAddress, fromSlot), 5000);
    });
  }
  
  async reconnect(tokenAddress, poolAddress) {
    const lastSlot = this.lastProcessedSlots.get(tokenAddress);
    console.log(`🔄 [SwapBackfillWorker] Reconnecting ${tokenAddress.substring(0, 8)} from slot ${lastSlot || 'LIVE'}`);
    await this.startContinuousMonitoring(tokenAddress, poolAddress, lastSlot ? lastSlot - 1 : null);
  }
  
  async processSwapMessage(msg, tokenAddress, poolAddress) {
    const tx = msg.transaction.transaction;
    const slot = msg.transaction.slot;
    
    // Extract signature
    const rawSignature = tx.signature || tx.transaction?.signatures?.[0];
    let signature = null;
    if (rawSignature && Buffer.isBuffer(rawSignature)) {
      const bs58 = (await import('bs58')).default;
      signature = bs58.encode(rawSignature);
    }
    
    // Check for token balance changes (swaps)
    if (tx.meta?.preTokenBalances?.length > 0) {
      const balanceChanges = [];
      tx.meta.preTokenBalances.forEach((preBalance, index) => {
        const postBalance = tx.meta.postTokenBalances[index];
        if (preBalance && postBalance) {
          const change = (postBalance.uiTokenAmount?.uiAmount || 0) - (preBalance.uiTokenAmount?.uiAmount || 0);
          if (Math.abs(change) > 0.000001) {
            balanceChanges.push({
              mint: preBalance.mint,
              change,
              owner: preBalance.owner
            });
          }
        }
      });
      
      // Find swaps for our token
      const tokenChanges = balanceChanges.filter(bc => bc.mint === tokenAddress && bc.owner !== poolAddress);
      const solChanges = balanceChanges.filter(bc => bc.mint === 'So11111111111111111111111111111111111111112');
      
      tokenChanges.forEach(tokenChange => {
        const solChange = solChanges.find(s => s.change !== 0) || { change: 0 };
        const swapType = tokenChange.change > 0 ? 'BUY' : 'SELL';
        
        const swapRecord = {
          signature: signature || `backfill_${Date.now()}_${tokenChange.owner}`,
          timestamp: Math.floor(Date.now() / 1000),
          slot: slot.toString(),
          type: swapType,
          change: tokenChange.change,
          tokenAmount: Math.abs(tokenChange.change),
          baseAmount: Math.abs(solChange.change),
          price: Math.abs(solChange.change) / Math.abs(tokenChange.change),
          volumeUsd: Math.abs(solChange.change) * this.solPriceUSD,
          mintAddress: tokenAddress,
          poolAddress,
          maker: tokenChange.owner
        };
        
        // Save to database immediately
        this.saveSwapToDatabase(swapRecord, tokenAddress, poolAddress);
      });
    }
  }
  
  async saveSwapToDatabase(swapRecord, tokenAddress, poolAddress) {
    const swapsToStore = [{
      tokenAddress: tokenAddress,
      poolAddress: poolAddress,
      signature: swapRecord.signature,
      timestamp: swapRecord.timestamp,
      slot: swapRecord.slot,
      price: swapRecord.price || 0,
      volumeUsd: swapRecord.volumeUsd || 0,
      source: 'constantk_backfill',
      type: swapRecord.type,
      tokenAmount: swapRecord.tokenAmount || 0,
      baseAmount: swapRecord.baseAmount || 0,
      rawData: swapRecord,
      createdAt: Date.now()
    }];

    await this.chartDatabase.storeSwaps(swapsToStore);
    console.log(`💾 [SwapBackfillWorker] Saved swap: ${swapRecord.type} ${swapRecord.tokenAmount} tokens`);
  }
  
  async fetchConstantKHistoricalSwaps(tokenAddress, poolAddress) {
    console.log(`📡 [SwapBackfillWorker] Starting 24/7 monitoring for ${tokenAddress.substring(0, 8)}...`);
    
    // Start continuous monitoring - runs 24/7 in background
    await this.startContinuousMonitoring(tokenAddress, poolAddress);
    
    // Return empty - monitoring continues in background
    return [];
  }

  /**
   * Get stats for a token
   */
  async getStats(tokenAddress) {
    try {
      // Read swaps from the per-token file
      const tokenDb = this.chartDatabase.getTokenDatabase(tokenAddress);
      const totalSwaps = tokenDb.swaps ? tokenDb.swaps.size : 0;
      const lastSwap = totalSwaps > 0 ? Array.from(tokenDb.swaps.values()).pop() : null;
      
      return {
        tokenAddress,
        totalSwaps,
        lastSwapTimestamp: lastSwap?.timestamp || null,
        lastSwapPrice: lastSwap?.price || null,
        source: 'constantk_backfill'
      };
    } catch (error) {
      console.error(`❌ [SwapBackfillWorker] Failed to get stats:`, error.message);
      return {
        tokenAddress,
        totalSwaps: 0,
        lastSwapTimestamp: null,
        lastSwapPrice: null,
        source: 'constantk_backfill'
      };
    }
  }

  /**
   * Discover pool address for a token
   */
  async discoverPoolAddress(tokenAddress) {
    try {
      // Try Jupiter API first
      const jupiterResponse = await axios.get(
        `https://lite-api.jup.ag/tokens/v2/search?query=${tokenAddress}`,
        { timeout: 10000 }
      );

      if (jupiterResponse.data && Array.isArray(jupiterResponse.data) && jupiterResponse.data.length > 0) {
        const tokenData = jupiterResponse.data[0];
        const poolAddress = tokenData.graduatedPool || tokenData.firstPool?.id;
        if (poolAddress) {
          return poolAddress;
        }
      }

      return null;
    } catch (error) {
      console.error('❌ [SwapBackfillWorker] Failed to discover pool:', error.message);
      return null;
    }
  }

  /**
   * Fetch swaps from Helius API
   */
  async fetchHeliusSwaps(poolAddress, fromTs, toTs) {
    try {
      console.log(`📡 [SwapBackfillWorker] Fetching swaps from Helius for pool ${poolAddress.substring(0, 8)}...`);

      const url = `https://api.helius.xyz/v0/addresses/${poolAddress}/transactions`;
      const params = {
        'api-key': this.heliusApiKey,
        limit: 100,
        before: undefined,
        'transaction-type': 'SWAP'
      };

      const allSwaps = [];
      let page = 0;
      let moreData = true;

      while (moreData && page < 50) { // Limit to 50 pages (5000 swaps max)
        page++;
        console.log(`📄 [SwapBackfillWorker] Fetching page ${page}...`);

        const response = await axios.get(url, { params, timeout: 30000 });
        
        if (!response.data || !Array.isArray(response.data)) {
          console.log('📄 [SwapBackfillWorker] No more data available');
          moreData = false;
          break;
        }

        const transactions = response.data;
        
        if (transactions.length === 0) {
          console.log('📄 [SwapBackfillWorker] No more transactions');
          moreData = false;
          break;
        }

        // Parse swaps from transactions
        for (const tx of transactions) {
          const txTimestamp = tx.timestamp || Math.floor(Date.now() / 1000);
          
          // Check if within our time range
          if (txTimestamp < fromTs) {
            moreData = false; // We've gone too far back
            break;
          }
          
          if (txTimestamp > toTs) {
            continue; // Skip future transactions
          }

          // Extract swap data
          const swap = this.parseSwapTransaction(tx, poolAddress);
          if (swap) {
            allSwaps.push(swap);
          }
        }

        // Update pagination
        params.before = transactions[transactions.length - 1].signature;
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      console.log(`✅ [SwapBackfillWorker] Fetched ${allSwaps.length} swaps from Helius`);
      return allSwaps;

    } catch (error) {
      console.error('❌ [SwapBackfillWorker] Failed to fetch from Helius:', error.message);
      return [];
    }
  }

  /**
   * Parse swap transaction from Helius format
   */
  parseSwapTransaction(tx, poolAddress) {
    try {
      // Extract token transfer info
      const tokenTransfers = tx.tokenTransfers || [];
      if (tokenTransfers.length < 2) {
        return null; // Not a swap
      }

      // Determine buy/sell direction
      let type = 'unknown';
      let tokenAmount = 0;
      let baseAmount = 0;

      for (const transfer of tokenTransfers) {
        if (transfer.to === poolAddress && transfer.from !== poolAddress) {
          type = 'BUY';
          tokenAmount += Math.abs(transfer.amount);
        } else if (transfer.from === poolAddress && transfer.to !== poolAddress) {
          type = 'SELL';
          tokenAmount += Math.abs(transfer.amount);
        }

        // Track base token amounts (SOL, USDC, etc.)
        if (transfer.tokenSymbol === 'SOL' || transfer.mint === 'So11111111111111111111111111111111111111112') {
          baseAmount += Math.abs(transfer.nativeTransfers?.[0]?.amount || 0);
        }
      }

      // Calculate price and volume
      const price = tokenAmount > 0 ? baseAmount / tokenAmount : 0;
      const volumeUsd = baseAmount * 190; // Approximate SOL price

      return {
        signature: tx.signature,
        timestamp: Math.floor((tx.timestamp || Date.now()) / 1000),
        poolAddress: poolAddress,
        type: type,
        tokenAmount: tokenAmount,
        baseAmount: baseAmount,
        price: price,
        volumeUsd: volumeUsd,
        rawData: tx
      };

    } catch (error) {
      console.error('❌ [SwapBackfillWorker] Failed to parse transaction:', error.message);
      return null;
    }
  }

  /**
   * Get stats about backfilled data
   */
  async getStats(tokenAddress) {
    try {
      const swaps = await this.chartDatabase.getSwapsForToken(tokenAddress);
      
      return {
        totalSwaps: swaps.length,
        latestSwap: swaps.length > 0 ? swaps[swaps.length - 1] : null,
        oldestSwap: swaps.length > 0 ? swaps[0] : null
      };
    } catch (error) {
      console.error('❌ [SwapBackfillWorker] Failed to get stats:', error.message);
      return { totalSwaps: 0 };
    }
  }
}

export default SwapBackfillWorker;

