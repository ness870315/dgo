import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import ChartDatabase from './ChartDatabase.js';
import GrpcWrapper from '../../../backend/services/GrpcWrapper.cjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONSTANT_K_GRPC_ENDPOINT = 'https://yellowstone.constant-k.com:443';
const CONSTANT_K_GRPC_TOKEN = '39facrmt-om2u-4al5-5k4h-g8pls2y5vhui';

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
      
      // Load ChartDatabase (uses the same DATA_DIR as backend)
      await this.chartDatabase.loadDatabase();
      console.log('✅ [SwapBackfillWorker] ChartDatabase loaded');
      
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
      const existingSwaps = await this.chartDatabase.getSwapsForToken(tokenAddress);
      const beforeCount = existingSwaps.length;
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
      
      // Use the same approach as EnhancedHybridPriceService but for historical slots
      // Query past blocks to get historical swap data
      // This will populate the same database that live swaps use
      
      const swaps = await this.fetchConstantKHistoricalSwaps(poolAddress);
      
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
        price: swap.price || 0,
        volumeUsd: swap.volumeUsd || 0,
        source: 'constantk_backfill', // Different source tag
        type: swap.type || 'unknown',
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
   * Fetch historical swaps from Constant K
   */
  async fetchConstantKHistoricalSwaps(poolAddress) {
    // TODO: Implement Constant K historical slot queries
    // For now, return empty array
    console.log(`📡 [SwapBackfillWorker] Fetching from Constant K for pool ${poolAddress.substring(0, 8)}...`);
    
    // This will be implemented to query past slots
    return [];
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
        api-key: this.heliusApiKey,
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

