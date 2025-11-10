import axios from 'axios';
import EventEmitter from 'events';
import fs from 'fs/promises';
import path from 'path';
import bs58 from 'bs58';
import ChartDatabase from './ChartDatabase.js';

// Use CommonJS wrapper for gRPC loading
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const CONSTANT_K_GRPC_ENDPOINT = 'http://grpc.constant-k.com';
const CONSTANT_K_GRPC_TOKEN = '39facrmt-om2u-4al5-5k4h-g8pls2y5vhui';
const JUPITER_API_BASE = 'https://lite-api.jup.ag/tokens/v2'; // Token API base
const DEXSCREENER_API_BASE = 'https://api.dexscreener.com/latest/dex';
const WSOL = 'So11111111111111111111111111111111111111112';

// DEX Program IDs for broad filtering
const DEX_PROGRAMS = [
  '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',  // Raydium AMM
  'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK',  // Raydium CLMM
  'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C',  // Raydium CPMM
  'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc',   // Orca Whirlpool
  'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo',   // Meteora DLMM
  'Dooar9JkhdZ7J3LHN3A7YCuoGRUggXhQaG4kijfLGU2j',  // Meteora Pools
  'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',   // Jupiter Aggregator v6
  'JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB',   // Jupiter Aggregator v4
  'PhoeNiXZ8ByJGLkxNfZRnkUfjvmuYqLR89jjFHGqdXY'    // Phoenix
];

/**
 * TokenMetrics - Real-time metric calculation for tokens
 * Calculates volume, TX count, maker count, price changes for 5m/1h/6h/24h windows
 */
class TokenMetrics {
  constructor(tokenAddress) {
    this.tokenAddress = tokenAddress;
    this.swaps = []; // All swaps (pruned to 24h)
    this.priceHistory = []; // { timestamp, price }
    this.uniqueMakers = new Set(); // wallet addresses
    
    // Jupiter baseline (NEVER replaced, only set once during seeding)
    this.baseline = {
      price: 0,
      '5m': { volume: 0, txns: 0, makers: 0, priceChange: 0 },
      '1h': { volume: 0, txns: 0, makers: 0, priceChange: 0 },
      '6h': { volume: 0, txns: 0, makers: 0, priceChange: 0 },
      '24h': { volume: 0, txns: 0, makers: 0, priceChange: 0 }
    };
    
    // Live deltas from DEX swaps (calculated from this.swaps)
    this.liveDeltas = {
      currentPrice: 0,
      '5m': { volume: 0, txns: 0, makers: 0, priceChange: 0 },
      '1h': { volume: 0, txns: 0, makers: 0, priceChange: 0 },
      '6h': { volume: 0, txns: 0, makers: 0, priceChange: 0 },
      '24h': { volume: 0, txns: 0, makers: 0, priceChange: 0 }
    };
    
    // Cached metrics (baseline + live deltas, updated on each swap)
    this.metrics = {
      currentPrice: 0,
      '5m': { volume: 0, txns: 0, makers: 0, priceChange: 0 },
      '1h': { volume: 0, txns: 0, makers: 0, priceChange: 0 },
      '6h': { volume: 0, txns: 0, makers: 0, priceChange: 0 },
      '24h': { volume: 0, txns: 0, makers: 0, priceChange: 0 }
    };
  }

  /**
   * Add a new swap and update all metrics
   */
  addSwap(swap) {
    this.swaps.push(swap);
    this.priceHistory.push({ timestamp: swap.timestamp, price: swap.priceUsd });
    if (swap.walletAddress) {
      this.uniqueMakers.add(swap.walletAddress);
    }
    
    // Debug: Log USELESS swaps
    if (this.tokenAddress === 'Dz9mQ9NzkBcCsuGPFJ3r1bS4wgqKMHBPiVuniW8Mbonk') {
      console.log(`🔄 [USELESS Swap] ${swap.type}: price=$${swap.priceUsd.toFixed(6)}, volume=$${swap.volumeUsd.toFixed(2)}, total swaps=${this.swaps.length}`);
    }
    
    this.updateMetrics();
    this.pruneOldData();
  }

  /**
   * Update all time-window metrics
   * Strategy: Jupiter baseline + Live DEX deltas = Final metrics
   */
  updateMetrics() {
    const now = Date.now();
    const windows = {
      '5m': 5 * 60 * 1000,
      '1h': 60 * 60 * 1000,
      '6h': 6 * 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000
    };

    // Step 1: Calculate LIVE deltas from DEX swaps
    // Use median price from recent swaps with outlier filtering
    if (this.swaps.length > 0) {
      const recentSwaps = this.swaps.slice(-50); // Last 50 swaps for better outlier detection
      let recentPrices = recentSwaps
        .map(s => s.priceUsd)
        .filter(p => p > 0 && isFinite(p))
        .sort((a, b) => a - b);
      
      if (recentPrices.length >= 10) {
        // Remove outliers using IQR (Interquartile Range) method
        const q1Index = Math.floor(recentPrices.length * 0.25);
        const q3Index = Math.floor(recentPrices.length * 0.75);
        const q1 = recentPrices[q1Index];
        const q3 = recentPrices[q3Index];
        const iqr = q3 - q1;
        
        // Use 3x IQR instead of 1.5x for less aggressive filtering (keeps more data)
        const lowerBound = q1 - (3 * iqr);
        const upperBound = q3 + (3 * iqr);
        
        // Filter out extreme outliers only
        const filteredPrices = recentPrices.filter(p => p >= lowerBound && p <= upperBound);
        
        // Use filtered prices if we still have at least 50% of original data
        if (filteredPrices.length >= Math.floor(recentPrices.length * 0.5)) {
          recentPrices = filteredPrices;
        }
        // else: keep all prices if filtering removed too much data
      }
      
      if (recentPrices.length > 0) {
        // Use median price from filtered data
        const midIndex = Math.floor(recentPrices.length / 2);
        if (recentPrices.length % 2 === 0) {
          this.liveDeltas.currentPrice = (recentPrices[midIndex - 1] + recentPrices[midIndex]) / 2;
        } else {
          this.liveDeltas.currentPrice = recentPrices[midIndex];
        }
      } else {
        // Fallback to latest swap price
        this.liveDeltas.currentPrice = this.swaps[this.swaps.length - 1].priceUsd || 0;
      }
      
      // Debug: Log price calculation for ALL tokens if price is 0
      if (this.liveDeltas.currentPrice === 0 || !isFinite(this.liveDeltas.currentPrice)) {
        console.error(`❌ [Price Calc] ${this.tokenAddress.slice(0,8)}: currentPrice is ${this.liveDeltas.currentPrice}, recentPrices.length=${recentPrices.length}, swaps.length=${this.swaps.length}`);
      }
      
      // Debug: Log USELESS price calculation
      if (this.tokenAddress === 'Dz9mQ9NzkBcCsuGPFJ3r1bS4wgqKMHBPiVuniW8Mbonk' && this.swaps.length % 10 === 0) {
        console.log(`💰 [USELESS Price] Median from ${recentPrices.length} filtered prices: $${this.liveDeltas.currentPrice.toFixed(6)}, range: $${recentPrices[0]?.toFixed(6)} - $${recentPrices[recentPrices.length-1]?.toFixed(6)}`);
      }
    } else {
      this.liveDeltas.currentPrice = 0;
    }

    // Calculate live deltas for each window
    for (const [window, duration] of Object.entries(windows)) {
      const cutoffTime = now - duration;
      const recentSwaps = this.swaps.filter(s => s.timestamp >= cutoffTime);
      const recentPrices = this.priceHistory.filter(p => p.timestamp >= cutoffTime);
      
      // Live volume from DEX swaps
      this.liveDeltas[window].volume = recentSwaps.reduce((sum, s) => sum + (s.volumeUsd || 0), 0);
      
      // Live transaction count
      this.liveDeltas[window].txns = recentSwaps.length;
      
      // Live unique makers
      const makers = new Set(recentSwaps.map(s => s.walletAddress).filter(Boolean));
      this.liveDeltas[window].makers = makers.size;
      
      // Live price change %
      if (recentPrices.length >= 2) {
        const firstPrice = recentPrices[0].price;
        const lastPrice = recentPrices[recentPrices.length - 1].price;
        
        // Safety check: avoid NaN and Infinity
        if (firstPrice > 0 && lastPrice > 0 && isFinite(firstPrice) && isFinite(lastPrice)) {
          const priceChange = ((lastPrice - firstPrice) / firstPrice) * 100;
          this.liveDeltas[window].priceChange = isFinite(priceChange) ? priceChange : 0;
        } else {
          this.liveDeltas[window].priceChange = 0;
        }
      } else {
        this.liveDeltas[window].priceChange = 0;
      }
    }

    // Step 2: Merge baseline + live deltas into final metrics
    // Price: Use live if available, otherwise baseline
    this.metrics.currentPrice = this.liveDeltas.currentPrice > 0 
      ? this.liveDeltas.currentPrice 
      : this.baseline.price;

    // Debug: Log USELESS metrics calculation
    const isUSELESS = this.tokenAddress === 'Dz9mQ9NzkBcCsuGPFJ3r1bS4wgqKMHBPiVuniW8Mbonk';
    if (isUSELESS && this.swaps.length % 10 === 0) { // Log every 10 swaps
      console.log(`📊 [USELESS Metrics] Total swaps: ${this.swaps.length}`);
    }

    // For each window: ADD baseline + live deltas
    for (const window of Object.keys(windows)) {
      // Volume: Add baseline + live
      this.metrics[window].volume = this.baseline[window].volume + this.liveDeltas[window].volume;
      
      // Txns: Add baseline + live
      this.metrics[window].txns = this.baseline[window].txns + this.liveDeltas[window].txns;
      
      // Makers: Add baseline + live (unique makers are additive)
      this.metrics[window].makers = this.baseline[window].makers + this.liveDeltas[window].makers;
      
      // Price change: Hybrid approach
      // 1. If we have enough live swaps covering the full window, use live data
      // 2. Otherwise, use baseline (Jupiter) data
      // 3. If no data at all, use 0
      let priceChange = 0;
      
      const windowDuration = windows[window];
      const oldestSwapTime = this.swaps.length > 0 ? this.swaps[0].timestamp : Date.now();
      const swapHistoryDuration = now - oldestSwapTime;
      
      // If our live swap history covers the full window duration, use live data
      if (swapHistoryDuration >= windowDuration && this.liveDeltas[window].txns >= 10) {
        // Have enough live data covering the full window - use live price change
        priceChange = this.liveDeltas[window].priceChange;
      } else if (this.baseline[window].txns > 0 && this.baseline[window].priceChange !== 0) {
        // Don't have full live coverage - use baseline (Jupiter has full historical data)
        priceChange = this.baseline[window].priceChange;
      } else if (this.liveDeltas[window].txns > 0) {
        // No baseline, but have some live swaps - use live price change
        priceChange = this.liveDeltas[window].priceChange;
      }
      // else: no data at all, leave as 0
      
      // Debug: Log USELESS price change selection
      if (isUSELESS && this.swaps.length % 10 === 0) {
        console.log(`  ${window} priceChange: live_txns=${this.liveDeltas[window].txns}, baseline_txns=${this.baseline[window].txns}, selected=${priceChange.toFixed(2)}%`);
      }
      
      this.metrics[window].priceChange = (isFinite(priceChange) && !isNaN(priceChange)) ? priceChange : 0;
      
      // Debug: Log USELESS window metrics
      if (isUSELESS && this.swaps.length % 10 === 0) {
        console.log(`  ${window}: baseline_txns=${this.baseline[window].txns}, live_txns=${this.liveDeltas[window].txns}, total=${this.metrics[window].txns}`);
        console.log(`  ${window}: baseline_vol=$${this.baseline[window].volume.toFixed(2)}, live_vol=$${this.liveDeltas[window].volume.toFixed(2)}, total=$${this.metrics[window].volume.toFixed(2)}`);
        console.log(`  ${window}: baseline_price%=${this.baseline[window].priceChange.toFixed(2)}%, live_price%=${this.liveDeltas[window].priceChange.toFixed(2)}%, final=${this.metrics[window].priceChange.toFixed(2)}%`);
      }
    }
  }

  /**
   * Remove data older than 24h
   */
  pruneOldData() {
    const cutoff = Date.now() - (24 * 60 * 60 * 1000);
    this.swaps = this.swaps.filter(s => s.timestamp >= cutoff);
    this.priceHistory = this.priceHistory.filter(p => p.timestamp >= cutoff);
  }

  /**
   * Get current metrics
   */
  getMetrics() {
    return this.metrics;
  }
}

/**
 * EnhancedHybridPriceService - DEX Program Filtering Implementation
 * Monitors all DEX programs for swap activity, auto-discovers new tokens
 */
class EnhancedHybridPriceService extends EventEmitter {
  constructor(webSocketServer = null) {
    super();
    
    // WebSocket server for real-time broadcasting
    this.webSocketServer = webSocketServer;
    
    // gRPC client and stream
    this.grpcClient = null;
    this.dexStream = null; // Single stream for all DEX programs
    this.isStreamActive = false; // Prevent duplicate streams
    this.restartTimeout = null; // Track restart timer
    
    // Token tracking
    this.knownTokens = new Map(); // Map<tokenAddress, TokenMetrics>
    this.newTokenActivity = new Map(); // Map<tokenAddress, { swapCount, firstSeen, lastSeen, ... }>
    this.tokenMetadataCache = new Map(); // Map<tokenAddress, { name, symbol, decimals, circSupply, supply }>
    
    // Multi-layer filter configuration
    this.filters = {
      layer1: {
        minimumAge: 0, // DISABLED: Let activity filters do the work
        activityThresholds: {
          minSwaps: 5,      // Lowered from 10 (catch earlier)
          minVolume: 500,   // Lowered from $1000 (catch smaller tokens)
          minTraders: 3     // Lowered from 5 (more realistic)
        },
        sustainedActivity: {
          minSwapsPerMinute: 1  // Lowered from 2 (1 swap/min = 60 swaps/hour)
        },
        priceSanity: {
          maxPriceChange1m: 500,    // 500%
          maxPriceChange5m: 1000,   // 1000%
          minPrice: 0.00000001,
          maxPrice: 1000000
        }
      },
      layer2: {
        requireQualityIndicator: true,  // graduatedAt OR launchpad OR organicScore
        blockSuspicious: true,          // audit.isSus !== true
        blockFrozen: true               // audit.frozen !== true
      }
    };
    
    // Filter statistics
    this.filterStats = {
      layer1: {
        checked: 0,
        passed: 0,
        failed: {
          tooYoung: 0,
          lowActivity: 0,
          lowSwapRate: 0,
          extremeVolatility: 0,
          suspiciousStability: 0
        }
      },
      layer2: {
        checked: 0,
        passed: 0,
        failed: {
          notInJupiter: 0,
          noQualityIndicators: 0,
          suspiciousFlag: 0,
          frozen: 0,
          apiError: 0
        }
      },
      layer3: {
        processed: 0,
        successful: 0,
        failed: 0
      }
    }
    
    // SOL price tracking
    this.solPriceUSD = 0;
    this.lastSolPriceUpdate = 0;
    this.solPriceCacheDuration = 60000; // 1 minute
    
    // Persistent swap storage
    this.chartDatabase = new ChartDatabase();
    
    // Jupiter API rate limiting
    this.jupiterRequestQueue = [];
    this.jupiterRequestDelay = 2000; // 2 seconds between requests (increased for rate limiting)
    this.lastJupiterRequest = 0;
    this.jupiterCache = new Map();
    this.jupiterCacheDuration = 10 * 60 * 1000; // 10 minutes cache
    
    // Token cache management
    this.tokenCache = [];
    // Use persistent cache path (Render volume mount)
    this.cachePath = process.env.CACHE_PATH || '/var/data/dgo/cache/tokens-cache.json';
    
    // Stats
    this.stats = {
      totalSwapsProcessed: 0,
      knownTokenSwaps: 0,
      newTokenSwaps: 0,
      tokensDiscovered: 0,
      streamRestarts: 0,
      lastStreamStart: null
    };
    
    // DON'T initialize here - wait for WebSocket to be ready
    // initializeAsync() will be called from enhancedBackend.mjs after WebSocket is initialized
  }

  /**
   * Async initialization
   */
  async initializeAsync() {
    try {
      console.log('🚀 [EnhancedHybridPriceService] Starting async initialization...');
      
      // Initialize gRPC client
      console.log('📡 [EnhancedHybridPriceService] Step 1: Initializing gRPC client...');
      await this.initializeGrpcClient();
      console.log('✅ [EnhancedHybridPriceService] gRPC client initialized');
      
      // Load token cache (with timeout to prevent hanging)
      console.log('📂 [EnhancedHybridPriceService] Step 2: Loading token cache...');
      await Promise.race([
        this.loadTokenCache(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Token cache load timeout')), 10000))
      ]).catch(error => {
        console.warn(`⚠️ [EnhancedHybridPriceService] Token cache load failed: ${error.message}, continuing without cache`);
        this.tokenCache = [];
      });
      console.log(`✅ [EnhancedHybridPriceService] Token cache loaded: ${this.tokenCache.length} tokens`);
      
      // Initialize SOL price (with timeout)
      console.log('💰 [EnhancedHybridPriceService] Step 3: Fetching SOL price...');
      try {
        await Promise.race([
          this.updateSolPrice(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('SOL price fetch timeout')), 5000))
        ]);
      } catch (error) {
        console.warn(`⚠️ [EnhancedHybridPriceService] SOL price fetch failed: ${error.message}, using default $240`);
      }
      
      // Ensure SOL price is set (fallback if fetch failed)
      if (this.solPriceUSD === 0 || !this.solPriceUSD) {
        this.solPriceUSD = 240;
        console.warn(`⚠️ [EnhancedHybridPriceService] SOL price was 0, using fallback: $240`);
      }
      
      console.log(`💰 [EnhancedHybridPriceService] SOL Price: $${this.solPriceUSD.toFixed(2)}`);
      
      // Initialize persistent swap storage (with timeout)
      console.log('💾 [EnhancedHybridPriceService] Step 4: Initializing swap storage...');
      await Promise.race([
        this.chartDatabase.loadData(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Chart database load timeout')), 15000))
      ]).catch(error => {
        console.warn(`⚠️ [EnhancedHybridPriceService] Chart database load failed: ${error.message}, starting fresh`);
      });
      this.chartDatabase.startBatchWriter();
      console.log('✅ [EnhancedHybridPriceService] Persistent swap storage initialized');
      
      // ✅ CRITICAL: Update token cache with FRESH Jupiter data, THEN seed TokenMetrics
      console.log('🔄 [EnhancedHybridPriceService] Step 5: Updating token cache with FRESH Jupiter data (BLOCKING)...');
      await this.refreshTokenCacheWithJupiter();
      console.log('✅ [EnhancedHybridPriceService] Token cache updated with fresh Jupiter data');
      
      console.log('🌱 [EnhancedHybridPriceService] Step 6: Seeding TokenMetrics from updated cache...');
      await this.seedMetricsFromCache();
      console.log('✅ [EnhancedHybridPriceService] TokenMetrics seeded - ALL tokens have baseline data');
      
      // Start DEX program stream
      console.log('🚀 [EnhancedHybridPriceService] Step 7: Starting DEX program stream...');
      await this.startDexProgramStream();
      
      // Start periodic broadcast (DEXScreener-style real-time updates)
      console.log('📡 [EnhancedHybridPriceService] Step 8: Starting periodic state broadcast...');
      this.startPeriodicBroadcast();
      
      console.log('✅ [EnhancedHybridPriceService] Initialization complete - Token cache refreshed with fresh Jupiter data, TokenMetrics seeded, DEX stream active');
    } catch (error) {
      console.error('❌ [EnhancedHybridPriceService] Initialization failed:', error);
      console.error('❌ [EnhancedHybridPriceService] Error stack:', error.stack);
    }
  }

  /**
   * Initialize gRPC client
   */
  async initializeGrpcClient() {
    try {
      const YellowstoneGrpc = require('@triton-one/yellowstone-grpc');
      const Client = YellowstoneGrpc.default || YellowstoneGrpc;
      
      this.grpcClient = new Client(CONSTANT_K_GRPC_ENDPOINT, CONSTANT_K_GRPC_TOKEN);
      console.log('✅ [EnhancedHybridPriceService] gRPC client initialized');
    } catch (error) {
      console.error('❌ [EnhancedHybridPriceService] Failed to initialize gRPC client:', error.message);
      throw error;
    }
  }

  /**
   * Start DEX program stream (monitors ALL DEX programs)
   */
  async startDexProgramStream() {
    // Prevent duplicate streams
    if (this.isStreamActive) {
      console.log('⚠️ [EnhancedHybridPriceService] Stream already active, skipping duplicate start');
      return;
    }
    
    try {
      console.log('🔄 [EnhancedHybridPriceService] Starting DEX program stream...');
      console.log(`🎯 [EnhancedHybridPriceService] Monitoring ${DEX_PROGRAMS.length} DEX programs`);
      
      // Cleanup old stream if exists
      if (this.dexStream) {
        console.log('🧹 [EnhancedHybridPriceService] Cleaning up old stream...');
        try {
          this.dexStream.removeAllListeners();
          this.dexStream = null;
        } catch (e) {
          console.warn('⚠️ [EnhancedHybridPriceService] Error cleaning up old stream:', e.message);
        }
      }
      
      this.isStreamActive = true;
      
      const YellowstoneGrpc = require('@triton-one/yellowstone-grpc');
      const Client = YellowstoneGrpc.default || YellowstoneGrpc;
      const CommitmentLevel = YellowstoneGrpc.CommitmentLevel;
      
      // Create transaction filters for DEX programs
      const transactionFilters = {
        dex: {
          accountInclude: DEX_PROGRAMS,
          accountExclude: [],
          accountRequired: [],
          vote: false,
          failed: false
        }
      };
      
      // Subscribe to stream
      this.dexStream = await this.grpcClient.subscribeOnce(
        {}, // accounts
        {}, // slots
        transactionFilters, // transactions
        {}, // transactionsStatus
        {}, // entry
        {}, // blocks
        {}, // blocksMeta
        CommitmentLevel.CONFIRMED,
        [] // accountsDataSlice
      );
      
      this.stats.lastStreamStart = Date.now();
      this.stats.streamRestarts++;
      
      console.log('✅ [EnhancedHybridPriceService] DEX program stream connected');
      console.log('👂 [EnhancedHybridPriceService] Listening for DEX transactions...');
      console.log('⚠️ [EnhancedHybridPriceService] NOTE: If no swaps are detected, check Constant-K status at https://constant-k.com');
      
      // Handle stream data
      let msgCount = 0;
      this.dexStream.on('data', (msg) => {
        msgCount++;
        if (msgCount % 100 === 0) {
          console.log(`📨 [EnhancedHybridPriceService] Received ${msgCount} gRPC messages`);
        }
        this.handleStreamData(msg);
      });
      
      // Handle stream errors
      this.dexStream.on('error', (error) => {
        console.error('❌ [EnhancedHybridPriceService] Stream error:', error.message);
        this.isStreamActive = false; // Mark as inactive
        this.scheduleStreamRestart();
      });
      
      // Handle stream end
      this.dexStream.on('end', () => {
        console.log('⚠️ [EnhancedHybridPriceService] Stream ended');
        this.isStreamActive = false; // Mark as inactive
        this.scheduleStreamRestart();
      });
      
    } catch (error) {
      console.error('❌ [EnhancedHybridPriceService] Failed to start DEX stream:', error.message);
      this.isStreamActive = false; // Mark as inactive
      this.scheduleStreamRestart();
    }
  }

  /**
   * Schedule stream restart after error/end
   */
  scheduleStreamRestart() {
    // Clear any existing restart timeout to prevent duplicates
    if (this.restartTimeout) {
      console.log('⚠️ [EnhancedHybridPriceService] Restart already scheduled, skipping duplicate');
      return;
    }
    
    const restartDelay = 5000; // 5 seconds
    console.log(`🔄 [EnhancedHybridPriceService] Scheduling stream restart in ${restartDelay}ms...`);
    
    this.restartTimeout = setTimeout(() => {
      this.restartTimeout = null; // Clear timeout reference
      this.startDexProgramStream();
    }, restartDelay);
  }

  /**
   * Handle incoming stream data
   */
  handleStreamData(msg) {
    try {
      const swaps = this.parseBalanceChanges(msg);
      
      if (!swaps || swaps.length === 0) {
        // Most DEX transactions are not token swaps (SOL-only, NFTs, liquidity ops, etc.)
        return;
      }
      
      // Log every 10th swap to reduce noise
      if (this.stats.totalSwapsProcessed % 10 === 0) {
        console.log(`📊 [EnhancedHybridPriceService] Processed ${this.stats.totalSwapsProcessed} swaps (${swaps.length} in this batch)`);
      }
      
      for (const swap of swaps) {
        this.stats.totalSwapsProcessed++;
        
        // Check if this is a known token or new token
        if (this.knownTokens.has(swap.tokenMint)) {
          this.processKnownTokenSwap(swap);
        } else {
          // Process new token (log only when it passes filters)
          this.processNewTokenSwap(swap);
        }
      }
    } catch (error) {
      console.error('❌ [EnhancedHybridPriceService] Error handling stream data:', error.message);
      console.error('❌ Stack:', error.stack);
    }
  }

  /**
   * Parse balance changes from gRPC transaction data
   */
  parseBalanceChanges(msg) {
    try {
      if (!msg.transaction?.transaction) {
        return null;
      }

      const tx = msg.transaction.transaction;
      const slot = msg.transaction.slot;
      
      // Extract signature and convert to base58 (Solscan format)
      let signature = tx.signature || 
                     tx.transaction?.signatures?.[0] || 
                     msg.transaction?.signature;
      
      if (signature && Buffer.isBuffer(signature)) {
        // Convert Buffer to base58 (Solana transaction signature format)
        signature = bs58.encode(signature);
      }

      // Get balance changes from meta
      const meta = tx.meta || msg.transaction.meta;
      if (!meta) {
        return null;
      }

      const preBalances = meta.preTokenBalances || [];
      const postBalances = meta.postTokenBalances || [];

      if (preBalances.length === 0) {
        return null; // Not a token swap (SOL-only, NFT, liquidity op, etc.)
      }

      // Find all unique token mints (excluding WSOL)
      const tokenMints = new Set();
      preBalances.forEach(b => {
        if (b.mint && b.mint !== WSOL) {
          tokenMints.add(b.mint);
        }
      });

      // For each token, calculate balance changes
      const swaps = [];
      for (const tokenMint of tokenMints) {
        let tokenIn = 0;
        let tokenOut = 0;
        let solIn = 0;
        let solOut = 0;
        let walletAddress = null;

        for (let i = 0; i < preBalances.length; i++) {
          const pre = preBalances[i];
          const post = postBalances.find(p => p.accountIndex === pre.accountIndex);

          if (!post) continue;

          const preAmount = parseFloat(pre.uiTokenAmount?.uiAmount || 0);
          const postAmount = parseFloat(post.uiTokenAmount?.uiAmount || 0);
          const change = postAmount - preAmount;

          // Capture wallet address (owner of the token account)
          if (!walletAddress && pre.owner) {
            walletAddress = pre.owner;
          }

          // Token balance changes
          if (pre.mint === tokenMint) {
            if (change > 0) {
              tokenIn += change;
            } else if (change < 0) {
              tokenOut += Math.abs(change);
            }
          }

          // SOL balance changes
          if (pre.mint === WSOL) {
            if (change > 0) {
              solIn += change;
            } else if (change < 0) {
              solOut += Math.abs(change);
            }
          }
        }

        // Valid swap: has both token and SOL changes
        if ((tokenIn > 0 || tokenOut > 0) && (solIn > 0 || solOut > 0)) {
          // ✅ CRITICAL FIX: We're tracking POOL balance changes, so logic is inverted from user perspective
          // If tokens go INTO pool → User SOLD tokens (gave tokens, got SOL)
          // If tokens go OUT of pool → User BOUGHT tokens (gave SOL, got tokens)
          const isBuy = tokenOut > 0; // tokenOut = user bought tokens from pool
          const tokenAmount = isBuy ? tokenOut : tokenIn;
          const solAmount = isBuy ? solIn : solOut;

          if (tokenAmount > 0 && solAmount > 0) {
            const priceInSol = solAmount / tokenAmount;
            const priceUsd = priceInSol * this.solPriceUSD;
            const volumeUsd = solAmount * this.solPriceUSD;
            
            // Debug: Check if SOL price is 0
            if (this.solPriceUSD === 0 && tokenMint === 'Dz9mQ9NzkBcCsuGPFJ3r1bS4wgqKMHBPiVuniW8Mbonk') {
              console.error(`❌ [USELESS] SOL price is 0! priceInSol=${priceInSol}, solAmount=${solAmount}, tokenAmount=${tokenAmount}`);
            }

            swaps.push({
              signature: signature || 'unknown', // Full base58 signature (no truncation)
              tokenMint,
              slot,
              timestamp: Date.now(), // Estimate from current time
              type: isBuy ? 'BUY' : 'SELL',
              tokenAmount,
              solAmount,
              priceInSol,
              priceUsd,
              volumeUsd,
              walletAddress
            });
          }
        }
      }

      return swaps.length > 0 ? swaps : null;

    } catch (error) {
      console.error('❌ [EnhancedHybridPriceService] Error parsing transaction:', error.message);
      return null;
    }
  }

  /**
   * Process swap for a known token (already in database)
   */
  async processKnownTokenSwap(swap) {
    this.stats.knownTokenSwaps++;
    
    // Get or create TokenMetrics
    let metrics = this.knownTokens.get(swap.tokenMint);
    if (!metrics) {
      metrics = new TokenMetrics(swap.tokenMint);
      this.knownTokens.set(swap.tokenMint, metrics);
      console.log(`📊 [EnhancedHybridPriceService] Created new TokenMetrics for known token: ${swap.tokenMint.slice(0, 8)}...`);
    }
    
    // Add swap to metrics
    metrics.addSwap(swap);
    
    // Log every 100th known token swap
    if (this.stats.knownTokenSwaps % 100 === 0) {
      console.log(`📊 [EnhancedHybridPriceService] Processed ${this.stats.knownTokenSwaps} known token swaps`);
    }
    
    // Save to ChartDatabase (uses storeSwaps with array)
    await this.chartDatabase.storeSwaps([{
      tokenAddress: swap.tokenMint,
      timestamp: swap.timestamp,
      type: swap.type,
      price: swap.priceUsd,
      tokenAmount: swap.tokenAmount,
      volumeUsd: swap.volumeUsd,
      signature: swap.signature,
      source: 'grpc-dex'
    }]);
    
    // Broadcast price update via WebSocket
    if (this.webSocketServer) {
      const metricsData = metrics.getMetrics();
      const token = this.knownTokens.get(swap.tokenMint);
      const jupiterData = token?.jupiterData;
      
      // Calculate real-time market cap using circulating supply from Jupiter
      const metadata = this.tokenMetadataCache.get(swap.tokenMint);
      const circSupply = metadata?.circSupply || jupiterData?.circSupply;
      const marketCap = circSupply ? metricsData.currentPrice * circSupply : (jupiterData?.marketCap || 0);
      
      this.broadcastPriceUpdate(swap.tokenMint, {
        // Real-time from DEX stream, fallback to Jupiter
        price: metricsData.currentPrice || jupiterData?.price || 0,
        marketCap: marketCap,
        
        // 5M window (real-time, fallback to Jupiter)
        priceChange5m: metricsData['5m'].priceChange || jupiterData?.stats5m?.priceChange || 0,
        volume5m: metricsData['5m'].volume || jupiterData?.stats5m?.volume || 0,
        txns5m: metricsData['5m'].txns || jupiterData?.stats5m?.txns || 0,
        makers5m: metricsData['5m'].makers || jupiterData?.stats5m?.makers || 0,
        
        // 1H window (real-time, fallback to Jupiter)
        priceChange1h: metricsData['1h'].priceChange || jupiterData?.stats1h?.priceChange || 0,
        volume1h: metricsData['1h'].volume || jupiterData?.stats1h?.volume || 0,
        txns1h: metricsData['1h'].txns || jupiterData?.stats1h?.txns || 0,
        makers1h: metricsData['1h'].makers || jupiterData?.stats1h?.makers || 0,
        
        // 6H window (real-time, fallback to Jupiter)
        priceChange6h: metricsData['6h'].priceChange || jupiterData?.stats6h?.priceChange || 0,
        volume6h: metricsData['6h'].volume || jupiterData?.stats6h?.volume || 0,
        txns6h: metricsData['6h'].txns || jupiterData?.stats6h?.txns || 0,
        makers6h: metricsData['6h'].makers || jupiterData?.stats6h?.makers || 0,
        
        // 24H window (real-time, fallback to Jupiter)
        priceChange24h: metricsData['24h'].priceChange || jupiterData?.priceChange24h || 0,
        volume24h: metricsData['24h'].volume || jupiterData?.volume24h || 0,
        txns24h: metricsData['24h'].txns || jupiterData?.txns24h || 0,
        makers24h: metricsData['24h'].makers || jupiterData?.makers24h || 0,
        
        // Liquidity (only from Jupiter, not available from DEX stream)
        liquidity: jupiterData?.liquidity || 0,
        
        isLive: true
      });
    }
    
    // Log every 100th swap
    if (this.stats.knownTokenSwaps % 100 === 0) {
      console.log(`📊 [EnhancedHybridPriceService] Processed ${this.stats.knownTokenSwaps} known token swaps`);
    }
  }

  /**
   * Process swap for a new token (auto-discovery)
   */
  async processNewTokenSwap(swap) {
    this.stats.newTokenSwaps++;
    
    // Track activity for this new token (DON'T onboard yet - wait for filters)
    let activity = this.newTokenActivity.get(swap.tokenMint);
    if (!activity) {
      activity = {
        swapCount: 0,
        firstSeen: Date.now(),
        lastSeen: Date.now(),
        totalVolume: 0,
        uniqueTraders: new Set(),
        swaps: [],
        priceHistory: [],
        layer1Checked: false,
        layer1Passed: false,
        layer2Checked: false,
        layer2Passed: false
      };
      this.newTokenActivity.set(swap.tokenMint, activity);
    }
    
    // Update activity
    activity.swapCount++;
    activity.lastSeen = Date.now();
    activity.totalVolume += swap.volumeUsd;
    if (swap.walletAddress) {
      activity.uniqueTraders.add(swap.walletAddress);
    }
    activity.swaps.push(swap);
    activity.priceHistory.push({ timestamp: swap.timestamp, price: swap.priceUsd });
    
    // Keep only last 100 swaps and prices (memory management)
    if (activity.swaps.length > 100) {
      activity.swaps = activity.swaps.slice(-100);
    }
    if (activity.priceHistory.length > 100) {
      activity.priceHistory = activity.priceHistory.slice(-100);
    }
    
    // Layer 1: Activity Filters (FREE - No API calls)
    if (!activity.layer1Checked) {
      const layer1Result = await this.applyLayer1Filters(swap.tokenMint, activity);
      activity.layer1Checked = true;
      activity.layer1Passed = layer1Result;
      
      if (!layer1Result) {
        // Don't check again, but keep tracking for stats
        return;
      }
    }
    
    // Layer 2: Jupiter Validation (Only if Layer 1 passed)
    if (activity.layer1Passed && !activity.layer2Checked) {
      const layer2Result = await this.applyLayer2Filters(swap.tokenMint);
      activity.layer2Checked = true;
      activity.layer2Passed = layer2Result.passed;
      
      if (!layer2Result.passed) {
        // Failed Layer 2, remove from tracking
        this.newTokenActivity.delete(swap.tokenMint);
        return;
      }
      
      // PASSED ALL FILTERS! Onboard with Jupiter baseline
      console.log(`🆕 [EnhancedHybridPriceService] New token discovered: ${swap.tokenMint.slice(0, 8)}...`);
      console.log(`   Symbol: ${layer2Result.jupiterData.symbol}`);
      console.log(`   Swaps: ${activity.swapCount}, Volume: $${activity.totalVolume.toFixed(2)}, Traders: ${activity.uniqueTraders.size}`);
      
      // Create TokenMetrics
      const metrics = new TokenMetrics(swap.tokenMint);
      this.knownTokens.set(swap.tokenMint, metrics);
      
      // Seed with Jupiter baseline (we already have the data from Layer 2)
      await this.seedTokenMetricsFromJupiter(swap.tokenMint, layer2Result.jupiterData);
      
      // Add all historical swaps
      const swapsToStore = [];
      for (const historicalSwap of activity.swaps) {
        metrics.addSwap(historicalSwap);
        
        // Prepare swap for ChartDatabase
        swapsToStore.push({
          tokenAddress: swap.tokenMint,
          timestamp: historicalSwap.timestamp,
          type: historicalSwap.type,
          price: historicalSwap.priceUsd,
          tokenAmount: historicalSwap.tokenAmount,
          volumeUsd: historicalSwap.volumeUsd,
          signature: historicalSwap.signature,
          source: 'grpc-dex'
        });
      }
      
      // Save all swaps to ChartDatabase at once
      if (swapsToStore.length > 0) {
        await this.chartDatabase.storeSwaps(swapsToStore);
      }
      
      // Trigger token processing (scoring, Twitter data, etc.)
      this.triggerTokenProcessing(swap.tokenMint, layer2Result.jupiterData, activity);
      
      this.stats.tokensDiscovered++;
      this.filterStats.layer3.processed++;
      this.filterStats.layer3.successful++;
      this.newTokenActivity.delete(swap.tokenMint);
    }
  }

  /**
   * Layer 1: Activity Filters (FREE - No API Calls)
   */
  async applyLayer1Filters(tokenMint, activity) {
    this.filterStats.layer1.checked++;
    
    // 1. Age Filter
    const age = Date.now() - activity.firstSeen;
    if (age < this.filters.layer1.minimumAge) {
      this.filterStats.layer1.failed.tooYoung++;
      return false;
    }

    // 2. Activity Threshold (2 of 3)
    const meetsSwaps = activity.swapCount >= this.filters.layer1.activityThresholds.minSwaps;
    const meetsVolume = activity.totalVolume >= this.filters.layer1.activityThresholds.minVolume;
    const meetsTraders = activity.uniqueTraders.size >= this.filters.layer1.activityThresholds.minTraders;
    
    const activityScore = (meetsSwaps ? 1 : 0) + (meetsVolume ? 1 : 0) + (meetsTraders ? 1 : 0);
    if (activityScore < 2) {
      this.filterStats.layer1.failed.lowActivity++;
      return false;
    }

    // 3. Sustained Activity
    const ageMinutes = age / (60 * 1000);
    const swapsPerMinute = activity.swapCount / ageMinutes;
    if (swapsPerMinute < this.filters.layer1.sustainedActivity.minSwapsPerMinute) {
      this.filterStats.layer1.failed.lowSwapRate++;
      return false;
    }

    // 4. Price Sanity
    if (activity.priceHistory.length >= 2) {
      const recentPrices = activity.priceHistory.slice(-10);
      const priceChanges = [];
      
      for (let i = 1; i < recentPrices.length; i++) {
        const change = Math.abs((recentPrices[i].price - recentPrices[i-1].price) / recentPrices[i-1].price) * 100;
        priceChanges.push(change);
      }
      
      const maxChange = Math.max(...priceChanges);
      const avgChange = priceChanges.reduce((a, b) => a + b, 0) / priceChanges.length;
      
      // Check for extreme volatility
      if (maxChange > this.filters.layer1.priceSanity.maxPriceChange1m) {
        this.filterStats.layer1.failed.extremeVolatility++;
        return false;
      }
      
      // Check for suspicious patterns (too stable = bot trading)
      if (avgChange < 0.1 && activity.swapCount > 20) {
        this.filterStats.layer1.failed.suspiciousStability++;
        return false;
      }
    }

    this.filterStats.layer1.passed++;
    console.log(`✅ [Layer1] ${tokenMint.slice(0,8)}... PASSED: Age=${(age/1000).toFixed(0)}s, Swaps=${activity.swapCount}, Volume=$${activity.totalVolume.toFixed(0)}, Traders=${activity.uniqueTraders.size}`);
    return true;
  }

  /**
   * Layer 2: Jupiter Validation (API Calls Only for 5%)
   */
  async applyLayer2Filters(tokenMint) {
    this.filterStats.layer2.checked++;
    
    try {
      // Fetch Jupiter data (with caching)
      const jupiterData = await this.fetchJupiterData(tokenMint);
      
      if (!jupiterData) {
        this.filterStats.layer2.failed.notInJupiter++;
        return { passed: false, reason: 'not_in_jupiter' };
      }

      // 1. Quality Indicators (must have at least one)
      const hasGraduatedAt = jupiterData.graduatedAt && jupiterData.graduatedAt !== '';
      const hasLaunchpad = jupiterData.launchpad && jupiterData.launchpad !== '';
      const hasOrganicScore = jupiterData.organicScore && jupiterData.organicScore > 0;
      
      if (!hasGraduatedAt && !hasLaunchpad && !hasOrganicScore) {
        this.filterStats.layer2.failed.noQualityIndicators++;
        console.log(`🚫 [Layer2] ${tokenMint.slice(0,8)}... FILTERED: No quality indicators`);
        return { passed: false, reason: 'no_quality_indicators' };
      }

      // 2. Security Checks
      if (this.filters.layer2.blockSuspicious && jupiterData.audit?.isSus === true) {
        this.filterStats.layer2.failed.suspiciousFlag++;
        console.log(`🚫 [Layer2] ${tokenMint.slice(0,8)}... FILTERED: Flagged as suspicious`);
        return { passed: false, reason: 'suspicious_flag' };
      }

      if (this.filters.layer2.blockFrozen && jupiterData.audit?.frozen === true) {
        this.filterStats.layer2.failed.frozen++;
        console.log(`🚫 [Layer2] ${tokenMint.slice(0,8)}... FILTERED: Token is frozen`);
        return { passed: false, reason: 'frozen' };
      }

      // 3. Calculate quality score
      const qualityScore = 
        (hasGraduatedAt ? 1 : 0) + 
        (hasLaunchpad ? 1 : 0) + 
        (hasOrganicScore ? 1 : 0);

      this.filterStats.layer2.passed++;
      console.log(`✅ [Layer2] ${tokenMint.slice(0,8)}... PASSED: Quality=${qualityScore}/3, Symbol=${jupiterData.symbol}`);

      return { 
        passed: true, 
        jupiterData,
        qualityScore 
      };

    } catch (error) {
      this.filterStats.layer2.failed.apiError++;
      console.error(`❌ [Layer2] ${tokenMint.slice(0,8)}... ERROR:`, error.message);
      return { passed: false, reason: 'api_error' };
    }
  }

  /**
   * Trigger token processing (add to EnhancedTokenProcessor queue)
   */
  triggerTokenProcessing(tokenMint) {
    // This will be called by the backend to add the token to the processing queue
    this.emit('newTokenDiscovered', tokenMint);
  }

  /**
   * Fetch Jupiter data for a token
   */
  async fetchJupiterData(tokenAddress) {
    // Check cache first
    const cached = this.jupiterCache.get(tokenAddress);
    if (cached && (Date.now() - cached.timestamp < this.jupiterCacheDuration)) {
      return cached.data;
    }
    
    // Rate limiting
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastJupiterRequest;
    if (timeSinceLastRequest < this.jupiterRequestDelay) {
      await new Promise(resolve => setTimeout(resolve, this.jupiterRequestDelay - timeSinceLastRequest));
    }
    
    try {
      // Use Jupiter search API (single token lookup)
      const response = await axios.get(`${JUPITER_API_BASE}/search?query=${tokenAddress}`, {
        timeout: 5000
      });
      
      this.lastJupiterRequest = Date.now();
      
      // Response is an array, get first result
      if (response.data && Array.isArray(response.data) && response.data.length > 0) {
        const tokenData = response.data[0];
        this.jupiterCache.set(tokenAddress, {
          data: tokenData,
          timestamp: Date.now()
        });
        return tokenData;
      }
      
      return null;
    } catch (error) {
      if (error.response?.status === 404) {
        return null; // Token not found on Jupiter
      }
      console.error(`❌ [EnhancedHybridPriceService] Jupiter API error for ${tokenAddress}:`, error.message);
      return null;
    }
  }

  /**
   * Seed TokenMetrics with Jupiter baseline data
   * This provides immediate data for tokens without waiting for swaps
   * Jupiter data is stored in BASELINE and NEVER replaced
   */
  async seedTokenMetricsFromJupiter(tokenAddress, jupiterData) {
    const metrics = this.knownTokens.get(tokenAddress);
    if (!metrics) {
      console.warn(`⚠️ [EnhancedHybridPriceService] Cannot seed ${tokenAddress.slice(0,8)}... - not in knownTokens`);
      return false;
    }
    
    // DEBUG: Log Jupiter data structure for first token
    if (Math.random() < 0.05) {
      console.log(`🔍 [Jupiter Debug] Token ${tokenAddress.slice(0,8)} Jupiter data:`, {
        hasUsdPrice: !!jupiterData.usdPrice,
        hasStats5m: !!jupiterData.stats5m,
        hasStats1h: !!jupiterData.stats1h,
        hasStats6h: !!jupiterData.stats6h,
        hasStats24h: !!jupiterData.stats24h,
        keys: Object.keys(jupiterData),
        stats5mKeys: jupiterData.stats5m ? Object.keys(jupiterData.stats5m) : 'N/A',
        stats24hKeys: jupiterData.stats24h ? Object.keys(jupiterData.stats24h) : 'N/A'
      });
    }
    
    try {
      // Seed baseline price (Jupiter uses 'usdPrice' field)
      if (jupiterData.usdPrice) {
        metrics.baseline.price = jupiterData.usdPrice;
      }
      
      // Seed 5M window baseline from stats5m
      if (jupiterData.stats5m) {
        const stats = jupiterData.stats5m;
        metrics.baseline['5m'] = {
          volume: (stats.buyVolume || 0) + (stats.sellVolume || 0),
          txns: (stats.numBuys || 0) + (stats.numSells || 0),
          makers: stats.numTraders || 0,
          priceChange: stats.priceChange || 0
        };
      }
      
      // Seed 1H window baseline from stats1h
      if (jupiterData.stats1h) {
        const stats = jupiterData.stats1h;
        metrics.baseline['1h'] = {
          volume: (stats.buyVolume || 0) + (stats.sellVolume || 0),
          txns: (stats.numBuys || 0) + (stats.numSells || 0),
          makers: stats.numTraders || 0,
          priceChange: stats.priceChange || 0
        };
      }
      
      // Seed 6H window baseline from stats6h
      if (jupiterData.stats6h) {
        const stats = jupiterData.stats6h;
        metrics.baseline['6h'] = {
          volume: (stats.buyVolume || 0) + (stats.sellVolume || 0),
          txns: (stats.numBuys || 0) + (stats.numSells || 0),
          makers: stats.numTraders || 0,
          priceChange: stats.priceChange || 0
        };
      }
      
      // Seed 24H window baseline from stats24h
      if (jupiterData.stats24h) {
        const stats = jupiterData.stats24h;
        metrics.baseline['24h'] = {
          volume: (stats.buyVolume || 0) + (stats.sellVolume || 0),
          txns: (stats.numBuys || 0) + (stats.numSells || 0),
          makers: stats.numTraders || 0,
          priceChange: stats.priceChange || 0
        };
      }
      
      // Debug: Log first seeded token to verify data
      if (Math.random() < 0.01) {
        console.log(`🌱 [Seed Debug] Token ${tokenAddress.slice(0,8)}:`, {
          price: metrics.baseline.price,
          vol24h: metrics.baseline['24h'].volume,
          txns24h: metrics.baseline['24h'].txns,
          makers24h: metrics.baseline['24h'].makers,
          priceChange24h: metrics.baseline['24h'].priceChange
        });
      }
      
      // After seeding baseline, recalculate metrics (baseline + live deltas)
      metrics.updateMetrics();
      
      // Cache Jupiter data for liquidity/mcap
      this.jupiterCache.set(tokenAddress, {
        data: jupiterData,
        timestamp: Date.now()
      });
      
      return true;
    } catch (error) {
      console.error(`❌ [EnhancedHybridPriceService] Failed to seed ${tokenAddress.slice(0,8)}...:`, error.message);
      return false;
    }
  }

  /**
   * Fetch Jupiter data for multiple tokens in one batch call
   * Much more efficient than individual calls
   */
  async fetchJupiterDataBatch(tokenAddresses) {
    if (!tokenAddresses || tokenAddresses.length === 0) {
      return new Map();
    }
    
    try {
      // Jupiter batch endpoint: /search?query=addr1,addr2,addr3...
      const mintQuery = tokenAddresses.join(',');
      const response = await axios.get(`${JUPITER_API_BASE}/search?query=${mintQuery}`, {
        timeout: 15000,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (compatible; JupiterAPI/1.0)'
        }
      });
      
      this.lastJupiterRequest = Date.now();
      
      // Response is an ARRAY of token data
      const resultMap = new Map();
      
      if (response.data && Array.isArray(response.data) && response.data.length > 0) {
        // Jupiter returns array: [{ id: "address", symbol: "...", ... }, ...]
        response.data.forEach(tokenData => {
          if (tokenData && tokenData.id) {
            resultMap.set(tokenData.id, tokenData);
            // Cache individual results
            this.jupiterCache.set(tokenData.id, {
              data: tokenData,
              timestamp: Date.now()
            });
          }
        });
      }
      
      return resultMap;
    } catch (error) {
      console.error(`❌ [EnhancedHybridPriceService] Jupiter batch API error:`, error.message);
      return new Map();
    }
  }

  /**
   * Refresh token cache with FRESH Jupiter data
   * Updates jupiterData field for all tokens in cache
   */
  async refreshTokenCacheWithJupiter() {
    if (this.tokenCache.length === 0) {
      console.log('⚠️ [EnhancedHybridPriceService] No tokens in cache to refresh');
      return;
    }
    
    console.log(`🔄 [EnhancedHybridPriceService] Refreshing ${this.tokenCache.length} tokens with fresh Jupiter data...`);
    
    const batchSize = 100;
    let updatedCount = 0;
    let failedCount = 0;
    
    for (let i = 0; i < this.tokenCache.length; i += batchSize) {
      const batch = this.tokenCache.slice(i, i + batchSize);
      const tokenAddresses = batch.map(t => t.contractAddress);
      
      // Fetch fresh Jupiter data
      const jupiterDataMap = await this.fetchJupiterDataBatch(tokenAddresses);
      
      // Update cache with fresh data
      for (const token of batch) {
        const freshData = jupiterDataMap.get(token.contractAddress);
        if (freshData) {
          token.jupiterData = freshData; // Update cache
          updatedCount++;
        } else {
          failedCount++;
        }
      }
      
      console.log(`🔄 [EnhancedHybridPriceService] Progress: ${updatedCount} updated, ${failedCount} failed (${i + batch.length}/${this.tokenCache.length})`);
      
      // Rate limiting: 2 seconds between batches
      if (i + batchSize < this.tokenCache.length) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    console.log(`✅ [EnhancedHybridPriceService] Cache refresh complete: ${updatedCount}/${this.tokenCache.length} updated, ${failedCount} failed`);
    
    // Write updated cache back to disk
    try {
      await fs.writeFile(this.cachePath, JSON.stringify(this.tokenCache, null, 2), 'utf8');
      console.log(`💾 [EnhancedHybridPriceService] Updated cache saved to disk: ${this.cachePath}`);
    } catch (error) {
      console.error(`❌ [EnhancedHybridPriceService] Failed to save updated cache:`, error.message);
    }
  }
  
  /**
   * Seed TokenMetrics from updated token cache
   * Uses the fresh Jupiter data that was just fetched
   */
  async seedMetricsFromCache() {
    let seededCount = 0;
    let failedCount = 0;
    
    for (const token of this.tokenCache) {
      if (!token.contractAddress || !token.jupiterData) {
        failedCount++;
        continue;
      }
      
      const metrics = this.knownTokens.get(token.contractAddress);
      if (!metrics) {
        failedCount++;
        continue;
      }
      
      // Seed from cache jupiterData
      try {
        if (token.jupiterData.usdPrice) {
          metrics.baseline.price = token.jupiterData.usdPrice;
        }
        
        // Seed 5M
        if (token.jupiterData.stats5m) {
          const stats = token.jupiterData.stats5m;
          metrics.baseline['5m'] = {
            volume: (stats.buyVolume || 0) + (stats.sellVolume || 0),
            txns: (stats.numBuys || 0) + (stats.numSells || 0),
            makers: stats.numTraders || 0,
            priceChange: stats.priceChange || 0
          };
        }
        
        // Seed 1H
        if (token.jupiterData.stats1h) {
          const stats = token.jupiterData.stats1h;
          metrics.baseline['1h'] = {
            volume: (stats.buyVolume || 0) + (stats.sellVolume || 0),
            txns: (stats.numBuys || 0) + (stats.numSells || 0),
            makers: stats.numTraders || 0,
            priceChange: stats.priceChange || 0
          };
        }
        
        // Seed 6H
        if (token.jupiterData.stats6h) {
          const stats = token.jupiterData.stats6h;
          metrics.baseline['6h'] = {
            volume: (stats.buyVolume || 0) + (stats.sellVolume || 0),
            txns: (stats.numBuys || 0) + (stats.numSells || 0),
            makers: stats.numTraders || 0,
            priceChange: stats.priceChange || 0
          };
        }
        
        // Seed 24H
        if (token.jupiterData.stats24h) {
          const stats = token.jupiterData.stats24h;
          metrics.baseline['24h'] = {
            volume: (stats.buyVolume || 0) + (stats.sellVolume || 0),
            txns: (stats.numBuys || 0) + (stats.numSells || 0),
            makers: stats.numTraders || 0,
            priceChange: stats.priceChange || 0
          };
        }
        
        // Update metrics to merge baseline + live deltas
        metrics.updateMetrics();
        
        // Update Jupiter cache
        this.jupiterCache.set(token.contractAddress, {
          data: token.jupiterData,
          timestamp: Date.now()
        });
        
        seededCount++;
      } catch (error) {
        console.error(`❌ Failed to seed ${token.contractAddress.slice(0,8)}:`, error.message);
        failedCount++;
      }
    }
    
    console.log(`✅ [EnhancedHybridPriceService] Seeded ${seededCount}/${this.tokenCache.length} tokens from cache, ${failedCount} failed`);
  }

  /**
   * Seed ALL tokens with Jupiter baseline data on startup
   * This ensures all tokens have data immediately, not just ones with recent swaps
   * Uses BATCH requests to avoid rate limiting
   */
  async seedAllTokensFromJupiter() {
    const tokenAddresses = Array.from(this.knownTokens.keys());
    
    if (tokenAddresses.length === 0) {
      console.log('⚠️ [EnhancedHybridPriceService] No tokens to seed');
      return;
    }
    
    console.log(`🌱 [EnhancedHybridPriceService] Seeding ${tokenAddresses.length} tokens with Jupiter baseline (using batch API)...`);
    
    const batchSize = 100; // Jupiter supports up to 100 tokens per batch
    let seededCount = 0;
    let failedCount = 0;
    
    for (let i = 0; i < tokenAddresses.length; i += batchSize) {
      const batch = tokenAddresses.slice(i, i + batchSize);
      
      // Fetch batch data from Jupiter
      const jupiterDataMap = await this.fetchJupiterDataBatch(batch);
      
      // Seed each token with its data
      for (const tokenAddress of batch) {
        const metrics = this.knownTokens.get(tokenAddress);
        
        // ✅ CRITICAL: Skip if token already has baseline data from cache!
        const hasBaselineData = metrics && (
          metrics.baseline['5m'].priceChange !== 0 ||
          metrics.baseline['1h'].priceChange !== 0 ||
          metrics.baseline['6h'].priceChange !== 0 ||
          metrics.baseline['24h'].priceChange !== 0
        );
        
        if (hasBaselineData) {
          seededCount++;
          continue; // Skip - already has data from cache
        }
        
        const jupiterData = jupiterDataMap.get(tokenAddress);
        if (jupiterData) {
          const seeded = await this.seedTokenMetricsFromJupiter(tokenAddress, jupiterData);
          if (seeded) {
            seededCount++;
          } else {
            failedCount++;
          }
        } else {
          // Jupiter API didn't return data - check if we have cached data from token cache
          const cached = this.jupiterCache.get(tokenAddress);
          if (cached && cached.data) {
            const seeded = await this.seedTokenMetricsFromJupiter(tokenAddress, cached.data);
            if (seeded) {
              seededCount++;
            } else {
              failedCount++;
            }
          } else {
            failedCount++;
          }
        }
      }
      
      console.log(`🌱 [EnhancedHybridPriceService] Progress: ${seededCount} seeded, ${failedCount} failed/no-data (${i + batch.length}/${tokenAddresses.length})`);
      
      // Rate limiting: 2 seconds between batches (safer)
      if (i + batchSize < tokenAddresses.length) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    console.log(`✅ [EnhancedHybridPriceService] Seeding complete: ${seededCount}/${tokenAddresses.length} tokens seeded, ${failedCount} failed/no-data`);
  }

  /**
   * Onboard a new token (from any source)
   * Creates TokenMetrics and seeds with Jupiter baseline
   */
  async onboardNewToken(tokenAddress, source = 'unknown') {
    // Check if already exists
    if (this.knownTokens.has(tokenAddress)) {
      console.log(`ℹ️ [EnhancedHybridPriceService] Token ${tokenAddress.slice(0,8)}... already onboarded`);
      return true;
    }
    
    console.log(`🆕 [EnhancedHybridPriceService] Onboarding new token: ${tokenAddress.slice(0,8)}... (source: ${source})`);
    
    // 1. Create TokenMetrics
    const metrics = new TokenMetrics(tokenAddress);
    this.knownTokens.set(tokenAddress, metrics);
    
    // 2. Fetch Jupiter baseline
    const jupiterData = await this.fetchJupiterData(tokenAddress);
    
    if (jupiterData) {
      // 3. Seed TokenMetrics with Jupiter baseline
      const seeded = await this.seedTokenMetricsFromJupiter(tokenAddress, jupiterData);
      if (seeded) {
        console.log(`✅ [EnhancedHybridPriceService] Token ${tokenAddress.slice(0,8)}... onboarded with Jupiter baseline`);
      } else {
        console.warn(`⚠️ [EnhancedHybridPriceService] Token ${tokenAddress.slice(0,8)}... onboarded but seeding failed`);
      }
    } else {
      console.warn(`⚠️ [EnhancedHybridPriceService] Token ${tokenAddress.slice(0,8)}... onboarded but no Jupiter data, will wait for DEX swaps`);
    }
    
    // 4. Fetch and cache token metadata
    this.fetchTokenMetadata(tokenAddress).catch(err => {
      console.error(`⚠️ Failed to fetch metadata for ${tokenAddress.slice(0, 8)}...:`, err.message);
    });
    
    return true;
  }

  /**
   * Update SOL price
   */
  async updateSolPrice() {
    const now = Date.now();
    if (now - this.lastSolPriceUpdate < this.solPriceCacheDuration) {
      return; // Use cached price
    }
    
    try {
      // Use Jupiter search API for SOL
      const response = await axios.get(`${JUPITER_API_BASE}/search?query=${WSOL}`, {
        timeout: 5000
      });
      
      console.log(`🔍 [SOL Price Debug] Response status: ${response.status}`);
      console.log(`🔍 [SOL Price Debug] Response data type: ${typeof response.data}`);
      console.log(`🔍 [SOL Price Debug] Is array: ${Array.isArray(response.data)}`);
      console.log(`🔍 [SOL Price Debug] Data length: ${response.data?.length}`);
      
      if (response.data && Array.isArray(response.data) && response.data.length > 0) {
        const solData = response.data[0];
        console.log(`🔍 [SOL Price Debug] First item keys: ${Object.keys(solData).join(', ')}`);
        console.log(`🔍 [SOL Price Debug] usdPrice value: ${solData.usdPrice}`);
        
        if (solData.usdPrice) {
          this.solPriceUSD = parseFloat(solData.usdPrice);
          this.lastSolPriceUpdate = now;
          console.log(`💰 [EnhancedHybridPriceService] SOL Price updated: $${this.solPriceUSD.toFixed(2)}`);
        } else {
          console.error(`❌ [SOL Price Debug] No usdPrice field in response`);
        }
      } else {
        console.error(`❌ [SOL Price Debug] Invalid response format`);
      }
    } catch (error) {
      console.error('❌ [EnhancedHybridPriceService] Failed to update SOL price:', error.message);
      // Fallback to a reasonable default if API fails
      if (this.solPriceUSD === 0) {
        this.solPriceUSD = 240; // Reasonable fallback
        console.log('⚠️ [EnhancedHybridPriceService] Using fallback SOL price: $240');
      }
    }
  }

  /**
   * Broadcast price update via WebSocket
   */
  broadcastPriceUpdate(tokenAddress, data) {
    if (!this.webSocketServer) {
      console.log('⚠️ [EnhancedHybridPriceService] WebSocket server not available for broadcast');
      return;
    }
    
    try {
      // Use correct WebSocket method: broadcastToTokenSubscribers
      this.webSocketServer.broadcastToTokenSubscribers(tokenAddress, {
        type: 'priceUpdate',
        tokenAddress,
        data
      });
      
      // Log every 50th broadcast to confirm it's working
      if (this.stats.totalSwapsProcessed % 50 === 0) {
        console.log(`📡 [EnhancedHybridPriceService] Broadcasting price update for ${tokenAddress.slice(0, 8)}... (price: $${data.price?.toFixed(6)})`);
      }
    } catch (error) {
      console.error('❌ [EnhancedHybridPriceService] Failed to broadcast price update:', error.message);
    }
  }

  /**
   * Load token cache from disk
   */
  async loadTokenCache() {
    try {
      const data = await fs.readFile(this.cachePath, 'utf8');
      this.tokenCache = JSON.parse(data);
      
      // Just initialize empty TokenMetrics for all cached tokens
      // We'll seed them later with FRESH Jupiter data
      for (const token of this.tokenCache) {
        if (token.contractAddress && !this.knownTokens.has(token.contractAddress)) {
          const metrics = new TokenMetrics(token.contractAddress);
          this.knownTokens.set(token.contractAddress, metrics);
        }
      }
      
      console.log(`✅ [EnhancedHybridPriceService] Loaded ${this.tokenCache.length} tokens from cache`);
      console.log(`📊 [EnhancedHybridPriceService] Initialized ${this.knownTokens.size} TokenMetrics (empty, will be seeded with fresh Jupiter data)`);
    } catch (error) {
      console.log('⚠️ [EnhancedHybridPriceService] No token cache found, starting fresh');
      this.tokenCache = [];
    }
  }


  /**
   * Get service stats
   */
  getStats() {
    return {
      ...this.stats,
      knownTokens: this.knownTokens.size,
      newTokensTracking: this.newTokenActivity.size,
      streamUptime: this.stats.lastStreamStart ? Date.now() - this.stats.lastStreamStart : 0
    };
  }

  /**
   * Get filter statistics
   */
  getFilterStats() {
    const layer1Total = this.filterStats.layer1.checked;
    const layer1PassRate = layer1Total > 0 ? (this.filterStats.layer1.passed / layer1Total * 100).toFixed(2) : '0.00';
    
    const layer2Total = this.filterStats.layer2.checked;
    const layer2PassRate = layer2Total > 0 ? (this.filterStats.layer2.passed / layer2Total * 100).toFixed(2) : '0.00';
    
    const totalChecked = layer1Total;
    const totalPassed = this.filterStats.layer3.successful;
    const totalPassRate = totalChecked > 0 ? (totalPassed / totalChecked * 100).toFixed(2) : '0.00';
    
    const apiCallReduction = layer1Total > 0 ? ((1 - layer2Total / layer1Total) * 100).toFixed(2) : '0.00';
    
    return {
      layer1: {
        checked: layer1Total,
        passed: this.filterStats.layer1.passed,
        passRate: `${layer1PassRate}%`,
        failed: this.filterStats.layer1.failed
      },
      layer2: {
        checked: layer2Total,
        passed: this.filterStats.layer2.passed,
        passRate: `${layer2PassRate}%`,
        failed: this.filterStats.layer2.failed
      },
      layer3: {
        processed: this.filterStats.layer3.processed,
        successful: this.filterStats.layer3.successful,
        failed: this.filterStats.layer3.failed
      },
      summary: {
        totalChecked,
        totalPassed,
        totalPassRate: `${totalPassRate}%`,
        totalFiltered: `${(100 - parseFloat(totalPassRate)).toFixed(2)}%`,
        apiCallReduction: `${apiCallReduction}%`
      }
    };
  }

  /**
   * Get metrics for a specific token
   */
  getTokenMetrics(tokenAddress) {
    const metrics = this.knownTokens.get(tokenAddress);
    return metrics ? metrics.getMetrics() : null;
  }

  /**
   * Check if gRPC is initialized
   */
  isGrpcInitialized() {
    return this.grpcClient !== null;
  }

  /**
   * Get real-time token data (for API endpoints)
   */
  async getRealTimeTokenData(tokenAddress) {
    const metrics = this.knownTokens.get(tokenAddress);
    
    if (!metrics) {
      return null;
    }
    
    const metricsData = metrics.getMetrics();
    
    // Fetch Jupiter data for additional info
    const jupiterData = await this.fetchJupiterData(tokenAddress);
    
    // Get recent swaps from ChartDatabase
    let recentSwaps = [];
    try {
      const tokenDb = this.chartDatabase.getTokenDatabase(tokenAddress);
      if (tokenDb && tokenDb.swaps && tokenDb.swaps.size > 0) {
        const swapsArray = Array.from(tokenDb.swaps.values());
        // Get last 50 swaps, sorted by timestamp descending
        recentSwaps = swapsArray
          .sort((a, b) => b.timestamp - a.timestamp)
          .slice(0, 50);
      }
    } catch (error) {
      console.error(`⚠️ Failed to load swaps for ${tokenAddress.slice(0, 8)}:`, error.message);
    }
    
    return {
      tokenAddress,
      price: metricsData.currentPrice,
      priceChange5m: metricsData['5m'].priceChange,
      priceChange1h: metricsData['1h'].priceChange,
      priceChange6h: metricsData['6h'].priceChange,
      priceChange24h: metricsData['24h'].priceChange,
      volume5m: metricsData['5m'].volume,
      volume1h: metricsData['1h'].volume,
      volume6h: metricsData['6h'].volume,
      volume24h: metricsData['24h'].volume,
      txns5m: metricsData['5m'].txns,
      txns1h: metricsData['1h'].txns,
      txns24h: metricsData['24h'].txns,
      makers5m: metricsData['5m'].makers,
      makers1h: metricsData['1h'].makers,
      makers24h: metricsData['24h'].makers,
      marketCap: jupiterData?.mcap || 0,
      liquidity: jupiterData?.liquidity || 0,
      recentSwaps: recentSwaps,
      isLive: true,
      source: 'dex-stream',
      lastUpdate: Date.now()
    };
  }

  /**
   * Get current state of ALL known tokens (for periodic broadcast)
   * This is the KEY method that enables DEXScreener-style real-time updates
   */
  getAllTokensState() {
    const state = [];
    let debugCount = 0;
    
    // Create a map of token metadata from cache for quick lookup
    const tokenMetadataMap = new Map();
    for (const token of this.tokenCache) {
      if (token.contractAddress) {
        tokenMetadataMap.set(token.contractAddress, token);
      }
    }
    
    for (const [tokenAddress, metrics] of this.knownTokens) {
      const metricsData = metrics.getMetrics();
      const jupiterData = this.jupiterCache.get(tokenAddress)?.data;
      const tokenMetadata = tokenMetadataMap.get(tokenAddress);
      
      // Debug: Log USELESS token specifically to see what's happening
      if (jupiterData?.symbol === 'USELESS' || tokenAddress === 'Dz9mQ9NzkBcCsuGPFJ3r1bS4wgqKMHBPiVuniW8Mbonk') {
        console.log(`🔍 [USELESS Debug] Token data:`, {
          tokenAddress: tokenAddress.slice(0,8),
          symbol: jupiterData?.symbol,
          price: metricsData.currentPrice,
          baseline5m: metrics.baseline['5m'],
          baseline1h: metrics.baseline['1h'],
          baseline6h: metrics.baseline['6h'],
          baseline24h: metrics.baseline['24h'],
          metricsData5m: metricsData['5m'],
          metricsData1h: metricsData['1h'],
          metricsData6h: metricsData['6h'],
          metricsData24h: metricsData['24h'],
          hasTokenMetadata: !!tokenMetadata,
          tokenMetadataHasJupiterData: !!tokenMetadata?.jupiterData
        });
      }
      
      // Debug: Log first token to see what's in metricsData AND what's being broadcast
      if (debugCount === 0) {
        console.log(`📊 [getAllTokensState Debug] First token ${tokenAddress.slice(0,8)}:`, {
          price: metricsData.currentPrice,
          metricsData5m: metricsData['5m'],
          metricsData1h: metricsData['1h'],
          metricsData6h: metricsData['6h'],
          metricsData24h: metricsData['24h'],
          baseline5m: metrics.baseline['5m'],
          baseline1h: metrics.baseline['1h'],
          baseline6h: metrics.baseline['6h'],
          baseline24h: metrics.baseline['24h']
        });
        
        // Log what will actually be broadcast
        console.log(`📡 [Broadcast Debug] What will be sent for ${tokenAddress.slice(0,8)}:`, {
          priceChange5m: metricsData['5m']?.priceChange ?? 0,
          priceChange1h: metricsData['1h']?.priceChange ?? 0,
          priceChange6h: metricsData['6h']?.priceChange ?? 0,
          priceChange24h: metricsData['24h']?.priceChange ?? 0
        });
        
        debugCount++;
      }
      
      // Debug: Log tokens with NON-ZERO price changes to see which ones have data
      const hasData = 
        metricsData['5m']?.priceChange !== 0 ||
        metricsData['1h']?.priceChange !== 0 ||
        metricsData['6h']?.priceChange !== 0 ||
        metricsData['24h']?.priceChange !== 0;
      
      if (hasData && Math.random() < 0.1) {
        console.log(`✅ [Token with data] ${jupiterData?.symbol || tokenAddress.slice(0,8)}: 5m=${metricsData['5m']?.priceChange?.toFixed(2)}%, 1h=${metricsData['1h']?.priceChange?.toFixed(2)}%, 6h=${metricsData['6h']?.priceChange?.toFixed(2)}%, 24h=${metricsData['24h']?.priceChange?.toFixed(2)}%`);
      }
      
      // Include ALL tokens (even if no swaps yet)
      // metricsData already contains baseline + live deltas merged
      // ✅ CRITICAL: Include ALL metadata from cache (score, overallScore, jupiterData, twitterData, etc.)
      state.push({
        // Start with ALL metadata from cache (includes score, overallScore, jupiterData, twitterData, etc.)
        ...(tokenMetadata || {}),
        // Override with live metrics
        tokenAddress,
        contractAddress: tokenAddress, // For compatibility
        symbol: jupiterData?.symbol || tokenMetadata?.symbol || 'UNKNOWN',
        name: jupiterData?.name || tokenMetadata?.name || 'Unknown Token',
        logoURI: jupiterData?.icon || tokenMetadata?.logoURI || null,
        price: metricsData.currentPrice || 0,
        priceUsd: metricsData.currentPrice || 0,
        priceChange5m: metricsData['5m']?.priceChange ?? 0,
        priceChange1h: metricsData['1h']?.priceChange ?? 0,
        priceChange6h: metricsData['6h']?.priceChange ?? 0,
        priceChange24h: metricsData['24h']?.priceChange ?? 0,
        volume5m: metricsData['5m']?.volume ?? 0,
        volume1h: metricsData['1h']?.volume ?? 0,
        volume6h: metricsData['6h']?.volume ?? 0,
        volume24h: metricsData['24h']?.volume ?? 0,
        txns5m: metricsData['5m']?.txns ?? 0,
        txns1h: metricsData['1h']?.txns ?? 0,
        txns6h: metricsData['6h']?.txns ?? 0,
        txns24h: metricsData['24h']?.txns ?? 0,
        makers5m: metricsData['5m']?.makers ?? 0,
        makers1h: metricsData['1h']?.makers ?? 0,
        makers6h: metricsData['6h']?.makers ?? 0,
        makers24h: metricsData['24h']?.makers ?? 0,
        // Calculate LIVE market cap: currentPrice * circulatingSupply
        marketCap: (() => {
          const currentPrice = metricsData.currentPrice || 0;
          const circSupply = jupiterData?.circSupply || tokenMetadata?.jupiterData?.circSupply;
          if (currentPrice > 0 && circSupply > 0) {
            return currentPrice * circSupply;
          }
          // Fallback to Jupiter's static mcap if we can't calculate
          return jupiterData?.mcap || tokenMetadata?.jupiterData?.mcap || 0;
        })(),
        liquidity: jupiterData?.liquidity || tokenMetadata?.jupiterData?.liquidity || 0,
        isLive: metricsData.currentPrice > 0, // Only mark as live if we have real-time price
        lastUpdated: Date.now(),
        // ✅ CRITICAL: Include recent swaps for SwapTable
        recentSwaps: (() => {
          const swaps = metrics.swaps.slice(-50).map(swap => ({
            signature: swap.signature,
            timestamp: swap.timestamp,
            type: swap.type, // 'BUY' or 'SELL'
            tokenAmount: swap.tokenAmount,
            solAmount: swap.solAmount,
            baseAmount: swap.solAmount, // Alias for compatibility
            priceUsd: swap.priceUsd,
            volumeUsd: swap.volumeUsd,
            maker: swap.walletAddress,
            price: swap.priceInSol
          }));
          
          // Debug: Log USELESS swaps to verify data
          if (tokenAddress === 'Dz9mQ9NzkBcCsuGPFJ3r1bS4wgqKMHBPiVuniW8Mbonk' && swaps.length > 0) {
            console.log(`🔍 [USELESS Swaps] Broadcasting ${swaps.length} swaps, first swap:`, {
              signature: swaps[0].signature?.slice(0, 20) + '...',
              type: swaps[0].type,
              solAmount: swaps[0].solAmount,
              maker: swaps[0].maker?.slice(0, 10) + '...',
              volumeUsd: swaps[0].volumeUsd
            });
          }
          
          return swaps;
        })()
      });
    }
    
    // Summary: How many tokens have non-zero price changes?
    const tokensWithData = state.filter(t => 
      t.priceChange5m !== 0 || t.priceChange1h !== 0 || t.priceChange6h !== 0 || t.priceChange24h !== 0
    );
    console.log(`📊 [getAllTokensState] Returning ${state.length} tokens, ${tokensWithData.length} have price change data (${(tokensWithData.length / state.length * 100).toFixed(1)}%)`);
    
    return state;
  }

  /**
   * Start periodic broadcast of full state to ALL connected clients
   * This is how DEXScreener maintains real-time updates without subscription complexity
   */
  startPeriodicBroadcast() {
    console.log('🔄 [EnhancedHybridPriceService] Starting periodic state broadcast (every 10s)');
    
    this.broadcastInterval = setInterval(() => {
      const state = this.getAllTokensState();
      
      if (this.webSocketServer && state.length > 0) {
        this.webSocketServer.broadcast({
          type: 'fullStateUpdate',
          tokens: state,
          timestamp: Date.now()
        });
        
        console.log(`📡 [EnhancedHybridPriceService] Broadcasted state for ${state.length} tokens`);
      }
    }, 10000); // Every 10 seconds
  }

  /**
   * Ensure token is being monitored (compatibility method)
   * With DEX program filtering, all tokens are automatically monitored
   * Now uses onboardNewToken for Jupiter baseline seeding
   */
  async ensureTokenMonitoring(tokenAddress) {
    // Use the new onboarding method which includes Jupiter seeding
    return await this.onboardNewToken(tokenAddress, 'manual-monitoring');
  }
  
  /**
   * Fetch and cache token metadata (circSupply, decimals, etc.) from Jupiter
   */
  async fetchTokenMetadata(tokenAddress) {
    try {
      // Fetch from Jupiter API
      const jupData = await this.fetchJupiterData(tokenAddress);
      
      if (jupData) {
        this.tokenMetadataCache.set(tokenAddress, {
          name: jupData.name,
          symbol: jupData.symbol,
          decimals: jupData.decimals,
          circSupply: jupData.circSupply, // Circulating supply for market cap calculation
          supply: jupData.supply // Total supply (backup)
        });
        
        console.log(`📊 [Metadata] Cached ${jupData.symbol} - circSupply: ${jupData.circSupply?.toLocaleString()}`);
      }
    } catch (error) {
      // Silent fail - will use Jupiter fallback in broadcast
      if (process.env.NODE_ENV === 'development') {
        console.error(`Failed to fetch metadata for ${tokenAddress.slice(0, 8)}...:`, error.message);
      }
    }
  }

  /**
   * Cleanup on shutdown
   */
  async shutdown() {
    console.log('🛑 [EnhancedHybridPriceService] Shutting down...');
    
    // Stop periodic broadcast
    if (this.broadcastInterval) {
      clearInterval(this.broadcastInterval);
      this.broadcastInterval = null;
      console.log('✅ [EnhancedHybridPriceService] Stopped periodic broadcast');
    }
    
    if (this.dexStream) {
      this.dexStream.cancel();
      this.dexStream = null;
    }
    
    if (this.chartDatabase) {
      await this.chartDatabase.stopBatchWriter();
    }
    
    console.log('✅ [EnhancedHybridPriceService] Shutdown complete');
  }
}

export default EnhancedHybridPriceService;
