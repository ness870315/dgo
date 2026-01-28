/**
 * 🚀 DexScreener-Style Token Monitor
 * 
 * Pool-centric real-time swap detection with DexScreener-level accuracy
 * 
 * Architecture (PHASE 4: IDL-Based Parsing + Inflight Subscriptions):
 * - BIDIRECTIONAL gRPC stream for inflight pool additions (no stream recreation!)
 * - IDL-based swap decoding using idlSwapParser (professional-grade accuracy)
 * - Real-time reserve tracking from swap deltas
 * - Dynamic liquidity calculation from reserves
 * - In-memory swap storage (last 24h) with database persistence
 * - Jupiter API for SOL price updates and token metadata
 * - Pool discovery: Moralis → Jupiter → DexScreener
 * 
 * Key Features:
 * - 100% accurate swap detection (IDL-based parsing)
 * - Works for all pool types (CPMM, DLMM, CLMM, Whirlpool)
 * - INFLIGHT pool additions - no stream recreation when adding new pools
 * - Full transaction details (maker wallet, signature, slot)
 * - Real-time USD pricing, market cap, and liquidity
 * - Survives restarts (loads from ChartDatabase)
 * - Self-healing (phases out Jupiter baseline over 24h)
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import bs58 from 'bs58';
import fetch from 'node-fetch';
import atomicCacheWriter from '../utils/atomicCacheWriter.js';
import { idlSwapParser } from './IDLSwapParser.mjs';
// 🚀 processTxForSwap REMOVED - now using IDL-based parser only

// Use CommonJS wrapper for gRPC loading (same as EnhancedHybridPriceService)
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Load CP-AMM SDK for Meteora Constant Product AMM pools
const cpAmmModule = require('@meteora-ag/cp-amm-sdk');
const { CpAmm, getPriceFromSqrtPrice } = cpAmmModule;

// Configuration
const RPC_ENDPOINT = 'https://rpc.constant-k.com/?api-key=39facrmt-om2u-4al5-5k4h-g8pls2y5vhui';
const GRPC_ENDPOINT = process.env.KGRPC_ENDPOINT || 'https://kaldera-indianapolis.constant-k.com';
const GRPC_TOKEN = process.env.KGRPC_API || '';
const MORALIS_API_KEY = process.env.MORALIS_API_KEY || '';
const JUPITER_API_ENDPOINT = process.env.JUP_API_ENDPOINT || 'https://api.jup.ag';
const JUPITER_API_KEY = process.env.JUP_API_KEY || '';
const SOL_MINT = 'So11111111111111111111111111111111111111112';
const SOL_PRICE_UPDATE_INTERVAL_MS = 30 * 1000; // 30 seconds
const SWAP_RETENTION_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Token Data Structure
 * Stores all swap history and metadata for a single token
 */
class TokenData {
  constructor(mint, config) {
    this.mint = mint;
    this.config = config; // { name, pool, decimals }
    this.swaps = []; // Raw swap history (last 24h)
    this.poolData = null; // Pool reserve data
    this.metadata = null; // Jupiter metadata (circSupply, etc)
    this.jupiterBaseline = null; // { stats, timestamp } - for cold start
    this.jupiterBaselineMarketCap = null; // Jupiter's baseline market cap (starting point)
    this.lastBaselinePrice = null; // Price at which baseline market cap was set
    this.lastUpdate = Date.now();
    
    // CRITICAL: Track price at start of each window for accurate price change calculation
    this.priceAtWindowStart = {
      '5m': null,   // Price 5 minutes ago
      '1h': null,   // Price 1 hour ago
      '6h': null,   // Price 6 hours ago
      '24h': null   // Price 24 hours ago
    };
    this.priceHistory = []; // Array of {timestamp, price} for price tracking (last 24h)
    
    // 🚨 CRITICAL: Price smoothing - track recent valid prices for median calculation
    this.recentValidPrices = []; // Last 10 valid swap prices (for median smoothing)
    this.maxRecentPrices = 10;
  }

  addSwap(swap) {
    this.swaps.push(swap);
    this.lastUpdate = Date.now();
    
    // CRITICAL: Track price history for accurate price change calculation
    const swapPrice = swap.priceUSD || swap.price || 0;
    if (swapPrice > 0) {
      this.priceHistory.push({
        timestamp: swap.timestamp || Date.now(),
        price: swapPrice
      });
      
      // Prune old price history (keep last 24h)
      const cutoff = Date.now() - SWAP_RETENTION_MS;
      this.priceHistory = this.priceHistory.filter(p => p.timestamp >= cutoff);
      
      // Update price at window start times periodically
      // This ensures we have accurate prices for 5m, 1h, 6h, 24h windows
      const now = Date.now();
      const windows = {
        '5m': 5 * 60 * 1000,
        '1h': 60 * 60 * 1000,
        '6h': 6 * 60 * 60 * 1000,
        '24h': 24 * 60 * 60 * 1000
      };
      
      for (const [key, windowMs] of Object.entries(windows)) {
        const windowStartTime = now - windowMs;
        // Find price closest to window start time
        let closestPrice = null;
        let minTimeDiff = Infinity;
        for (const pricePoint of this.priceHistory) {
          const timeDiff = Math.abs(pricePoint.timestamp - windowStartTime);
          if (timeDiff < minTimeDiff) {
            minTimeDiff = timeDiff;
            closestPrice = pricePoint.price;
          }
        }
        // Update if we found a price within 10% of window time, or if not set yet
        if (closestPrice && (minTimeDiff < windowMs * 0.1 || !this.priceAtWindowStart[key])) {
          this.priceAtWindowStart[key] = closestPrice;
        }
      }
    }
    
    // Prune old swaps (keep last 24h)
    const cutoff = Date.now() - SWAP_RETENTION_MS;
    this.swaps = this.swaps.filter(s => s.timestamp >= cutoff);
  }

  getSwapsSince(timestamp) {
    return this.swaps.filter(s => s.timestamp >= timestamp);
  }
}

/**
 * Pool Data Structure
 * Stores pool reserve information and pending transactions
 */
class PoolData {
  constructor(poolAddress, tokenMint, config) {
    this.poolAddress = poolAddress;
    this.tokenMint = tokenMint;
    this.config = config;
    this.poolTokenAccount = null;
    this.poolQuoteAccount = null; // Renamed from poolSolAccount (supports SOL/USDC/USDT)
    this.tokenReserve = null;
    this.quoteReserve = null; // Renamed from solReserve
    this.price = 0; // Quote token per token
    this.quoteMint = null; // Which quote token (SOL/USDC/USDT)
    this.quoteName = null; // 'SOL', 'USDC', or 'USDT'
    this.quoteDecimals = 9; // Decimals for quote token
    this.pendingTransactions = []; // For matching swaps with transactions
    this.pendingSwaps = []; // Swaps waiting for transaction data (buffering)
    this.lastUpdate = Date.now();
  }
}

/**
 * Main DexScreener-Style Monitor Service
 */
export default class DexScreenerStyleMonitor {
  constructor(chartDatabase, webSocketServer = null) {
    this.chartDatabase = chartDatabase;
    this.webSocketServer = webSocketServer;
    this.connection = new Connection(RPC_ENDPOINT, 'confirmed');
    this.grpcClient = null;
    
    // Data structures
    this.tokens = new Map(); // mint -> TokenData
    this.pools = new Map(); // mint -> PoolData
    this.stream = null; // SINGLE gRPC stream for ALL pools
    this.transactionFilters = {}; // Accumulated transaction filters (PHASE 3: transaction-level only)
    
    // PHASE 3: Reserve tracking for liquidity calculation
    // Map: poolAddress -> { tokenReserve, quoteReserve, quoteMint, quoteDecimals, initialLiquidity }
    this.poolReserves = new Map();
    
    // Global state
    this.solPriceUSD = 135; // Default SOL price (never leave at 0!)
    this.priceUpdater = null;
    this.isInitialized = false;
    
    // Stats (per-token)
    this.stats = {
      tokensMonitored: 0,
      totalSwaps: 0,
      swapsPerSecond: 0,
      lastSwapTime: 0
    };
    
    // Global cumulative statistics (persist across stream recreations)
    this.globalStats = {
      totalAccountUpdates: 0,
      totalTransactions: 0,
      totalSwapsDetected: 0,
      totalBuys: 0,
      totalSells: 0,
      streamRecreations: 0,
      startTime: Date.now()
    };

    // Stream health & auto-reconnection
    this.reconnecting = false;
    this.reconnectAttempts = 0;
    this.lastStreamActivity = 0;
    this.streamHealthChecker = null;
    this.streamGeneration = 0; // Incremented each time we create a new stream
    this.activeStreamGeneration = 0; // The generation of the currently active stream
    
    // 🚀 INFLIGHT SUBSCRIPTION: Track current subscription state for bidirectional streaming
    this.currentSubscribedPools = new Set(); // Pools currently in the active subscription
    this.isBidirectionalStream = false; // Whether we're using subscribe() vs subscribeOnce()

    console.log('🚀 [DexScreenerStyleMonitor] Initialized');
  }

  /**
   * Initialize the service
   */
  async initialize() {
    if (this.isInitialized) return;

    console.log('📡 [DexScreenerStyleMonitor] Initializing gRPC client...');
    
    // Initialize gRPC client using CommonJS require (same as EnhancedHybridPriceService)
    const YellowstoneGrpc = require('@triton-one/yellowstone-grpc');
    const Client = YellowstoneGrpc.default || YellowstoneGrpc;
    this.grpcClient = new Client(GRPC_ENDPOINT, GRPC_TOKEN);
    
    console.log('✅ [DexScreenerStyleMonitor] gRPC client initialized');
    console.log('⏳ [DexScreenerStyleMonitor] Stream will be created after pool discovery...');
    
    // Initialize IDL-based swap parser
    try {
      await idlSwapParser.initialize();
      console.log('✅ [DexScreenerStyleMonitor] IDL swap parser initialized');
    } catch (error) {
      console.warn('⚠️ [DexScreenerStyleMonitor] IDL parser init failed, using balance-based only:', error.message);
    }
    
    // Fetch initial SOL price
    await this.fetchSOLPrice();
    
    // Start SOL price updater (every 30 seconds)
    this.priceUpdater = setInterval(async () => {
      await this.fetchSOLPrice();
    }, SOL_PRICE_UPDATE_INTERVAL_MS);

    // Start full state broadcaster (every 10 seconds for frontend)
    this.fullStateUpdater = setInterval(() => {
      this.broadcastFullState();
    }, 10 * 1000); // 10 seconds
    
    // Start periodic metrics broadcaster (every 5 seconds) to update prices even without swaps
    // This ensures frontend gets live price updates from Jupiter baseline + swap deltas
    // 🚨 CRITICAL FIX: Broadcast for ALL tokens, not just those with pools
    // Tokens without pools can still have Jupiter baseline prices
    this.metricsUpdater = setInterval(() => {
      for (const [mint] of this.tokens.entries()) {
        this.broadcastMetrics(mint);
      }
    }, 5 * 1000); // 5 seconds
    
    // 🚨 DEX-GRADE: Periodically refresh pool reserves from RPC (like test file)
    // This ensures prices stay accurate even if swap tracking drifts
    this.reserveRefresher = setInterval(async () => {
      await this.refreshPoolReservesFromRPC();
    }, 10 * 1000); // Refresh every 10 seconds

    // 🚨 STREAM HEALTH CHECKER: Detect stale streams and auto-reconnect
    // If no activity for 60 seconds, the stream is likely dead
    this.streamHealthChecker = setInterval(() => {
      const now = Date.now();
      const inactiveMs = now - this.lastStreamActivity;
      const poolCount = this.pools.size;
      
      // Only check if we have pools to monitor and stream was once active
      if (poolCount > 0 && this.lastStreamActivity > 0) {
        if (inactiveMs > 60000) { // 60 seconds without activity
          console.log(`🚨 [DexScreenerStyleMonitor] Stream appears stale! No activity for ${Math.floor(inactiveMs/1000)}s - triggering reconnect`);
          this.scheduleReconnect('health-check');
        } else if (inactiveMs > 30000) { // 30 seconds warning
          console.log(`⚠️  [DexScreenerStyleMonitor] Stream idle for ${Math.floor(inactiveMs/1000)}s (monitoring ${poolCount} pools)`);
        }
      }
    }, 15000); // Check every 15 seconds

    // 🚨 CRITICAL: Periodic cleanup to prevent /tmp overflow
    // Clean up old swap data every 5 minutes
    this.swapCleanupInterval = setInterval(() => {
      this.cleanupOldSwaps();
    }, 5 * 60 * 1000); // Every 5 minutes

    this.isInitialized = true;
    console.log('✅ [DexScreenerStyleMonitor] Initialized successfully');
  }
  
  /**
   * Clean up old swap data to prevent /tmp overflow
   */
  cleanupOldSwaps() {
    const cutoff = Date.now() - SWAP_RETENTION_MS;
    const MAX_SWAPS_PER_TOKEN = 1000;
    let totalSwapsRemoved = 0;
    
    for (const [mint, tokenData] of this.tokens.entries()) {
      if (!tokenData.swaps) continue;
      
      const beforeCount = tokenData.swaps.length;
      
      // Filter by time (24h retention)
      tokenData.swaps = tokenData.swaps.filter(s => s.timestamp >= cutoff);
      
      // Enforce max swaps per token
      if (tokenData.swaps.length > MAX_SWAPS_PER_TOKEN) {
        tokenData.swaps = tokenData.swaps.slice(-MAX_SWAPS_PER_TOKEN);
      }
      
      const removed = beforeCount - tokenData.swaps.length;
      if (removed > 0) {
        totalSwapsRemoved += removed;
      }
      
      // Also cleanup price history
      if (tokenData.priceHistory) {
        tokenData.priceHistory = tokenData.priceHistory.filter(p => p.timestamp >= cutoff);
        if (tokenData.priceHistory.length > 500) {
          tokenData.priceHistory = tokenData.priceHistory.slice(-500);
        }
      }
    }
    
    if (totalSwapsRemoved > 0) {
      console.log(`🧹 [DexScreenerStyleMonitor] Cleaned up ${totalSwapsRemoved} old swaps to prevent /tmp overflow`);
    }
  }

  /**
   * PHASE 3: Create or recreate the gRPC stream with transaction filters only
   * 🚀 NOW USES BIDIRECTIONAL STREAMING for inflight pool additions
   */
  /**
   * 🚀 Start DEX program stream - subscribes ONCE to all DEX programs
   * This is the CORRECT approach (like the test that worked!)
   * - Subscribe to DEX programs, NOT pools
   * - Filter client-side for monitored tokens
   * - No stream recreation needed when adding tokens
   */
  async startDexProgramStream() {
    // Increment generation to invalidate old stream events
    this.streamGeneration++;
    const thisGeneration = this.streamGeneration;
    
    // Close existing stream if any
    if (this.stream) {
      try {
        this.stream.removeAllListeners();
        if (this.isBidirectionalStream) {
          this.stream.end();
        } else {
          this.stream.cancel();
        }
      } catch (e) {
        // Ignore
      }
      this.stream = null;
    }

    // 🚀 SUBSCRIBE TO DEX PROGRAMS (like the test!)
    console.log(`📡 [DexScreenerStyleMonitor] Subscribing to DEX PROGRAMS (captures ALL swaps)`);
    console.log(`   Filtering client-side for ${this.tokens.size} monitored tokens`);
    
    this.stream = await this.grpcClient.subscribe();
    this.isBidirectionalStream = true;
    
    // Build subscription - DEX PROGRAMS only
    const subscriptionRequest = this.buildSubscriptionRequest([]);
    this.stream.write(subscriptionRequest);
    
    console.log(`✅ [DexScreenerStyleMonitor] DEX program stream started`);
    
    // Mark this as the active stream generation
    this.activeStreamGeneration = thisGeneration;
    
    // PHASE 3: Only handle transactions (no account updates)
    let messageCount = 0;
    this.stream.on('data', (msg) => {
      // Ignore events from old stream generations
      if (thisGeneration !== this.activeStreamGeneration) return;
      
      messageCount++;
      this.lastStreamActivity = Date.now(); // Track activity for health check
      
      // Log first message to confirm stream is working
      if (messageCount === 1) {
        console.log(`✅ [DexScreenerStyleMonitor] First message received from BIDIRECTIONAL stream (gen ${thisGeneration})!`);
      }
      
      if (msg.transaction) {
        this.handleTransaction(msg);
      }
    });
    
    this.stream.on('error', (error) => {
      // Ignore errors from old stream generations
      if (thisGeneration !== this.activeStreamGeneration) {
        console.log(`⏭️  [DexScreenerStyleMonitor] Ignoring error from old stream (gen ${thisGeneration}, active: ${this.activeStreamGeneration})`);
        return;
      }
      console.error(`❌ [DexScreenerStyleMonitor] Stream error (gen ${thisGeneration}):`, error.message);
      // Auto-reconnect after error
      this.scheduleReconnect('error');
    });
    
    this.stream.on('end', () => {
      // Ignore end events from old stream generations
      if (thisGeneration !== this.activeStreamGeneration) {
        console.log(`⏭️  [DexScreenerStyleMonitor] Ignoring end from old stream (gen ${thisGeneration}, active: ${this.activeStreamGeneration})`);
        return;
      }
      console.log(`⚠️  [DexScreenerStyleMonitor] Stream ended (gen ${thisGeneration})`);
      // Auto-reconnect after stream ends
      this.scheduleReconnect('end');
    });
    
    this.globalStats.streamRecreations++;
    this.lastStreamActivity = Date.now();
    console.log(`✅ [DexScreenerStyleMonitor] Bidirectional stream created successfully (gen ${thisGeneration})`);
  }

  /**
   * 🚀 Build subscription request for gRPC stream
   * EXACTLY LIKE THE TEST: Subscribe to DEX PROGRAM IDs to catch ALL swaps
   * Then filter by tokens we care about in the handler
   */
  buildSubscriptionRequest(poolAddresses) {
    // DEX Program IDs - EXACTLY like the test that worked!
    const DEX_PROGRAMS = [
      '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8', // Raydium AMM V4
      'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK', // Raydium CLMM
      'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C', // Raydium CPMM
      'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc',  // Orca Whirlpool
      'Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB', // Meteora DAMM
      'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo',  // Meteora DLMM
      'cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG', // Meteora DAMM v2
      'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA', // Pump AMM
      '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P', // PumpFun Bonding
      'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4', // Jupiter V6
    ];
    
    console.log(`📡 [Subscription] Subscribing to ${DEX_PROGRAMS.length} DEX PROGRAMS (like test)`);
    console.log(`   This captures ALL swaps, then we filter by our ${poolAddresses.length} monitored tokens`);
    
    return {
      accounts: {},
      slots: {},
      transactions: {
        client: {
          accountInclude: DEX_PROGRAMS, // ONLY DEX programs, NOT pools!
          accountExclude: [],
          accountRequired: [],
          vote: false,
          failed: false,
        }
      },
      transactionsStatus: {},
      blocks: {},
      blocksMeta: {},
      entry: {},
      accountsDataSlice: [],
      commitment: 1, // CONFIRMED
    };
  }

  /**
   * 🚀 Add token to monitor - NO stream recreation needed!
   * Since we subscribe to DEX PROGRAMS, we just add the token to our filter list
   * The stream captures ALL DEX swaps, we filter client-side for monitored tokens
   */
  addTokenToMonitor(mint, poolAddress, tokenConfig) {
    // Add to our monitored tokens - stream already captures all DEX swaps
    if (this.tokens.has(mint)) {
      console.log(`ℹ️ [DexScreenerStyleMonitor] Token ${tokenConfig?.name || mint.substring(0,8)} already monitored`);
      return true;
    }
    
    // Add token to monitoring
    this.tokens.set(mint, {
      config: tokenConfig,
      metadata: null,
      lastPriceUSD: 0,
      additionalPools: [],
    });
    
    // Add pool mapping
    this.pools.set(mint, {
      poolAddress,
      dex: tokenConfig?.dex || 'unknown',
    });
    
    console.log(`🚀 [INFLIGHT] Added token ${tokenConfig?.name || mint.substring(0,8)} | Pool: ${poolAddress.substring(0,12)}... | Total monitored: ${this.tokens.size}`);
    return true;
  }
  
  /**
   * @deprecated - Use addTokenToMonitor instead
   * Kept for backwards compatibility
   */
  addPoolInflight(poolAddress, tokenName = '') {
    console.log(`⚠️ [DexScreenerStyleMonitor] addPoolInflight is deprecated - tokens are added via addTokenToMonitor`);
    return true;
  }

  /**
   * Schedule stream reconnection with exponential backoff
   */
  scheduleReconnect(reason) {
    if (this.reconnecting) {
      console.log(`⏳ [DexScreenerStyleMonitor] Already reconnecting, skipping...`);
      return;
    }
    
    this.reconnecting = true;
    const delay = Math.min(5000 * Math.pow(2, this.reconnectAttempts), 60000); // 5s, 10s, 20s, 40s, max 60s
    this.reconnectAttempts++;
    
    console.log(`🔄 [DexScreenerStyleMonitor] Scheduling reconnect in ${delay/1000}s (reason: ${reason}, attempt: ${this.reconnectAttempts})`);
    
    setTimeout(async () => {
      try {
        console.log(`🔌 [DexScreenerStyleMonitor] Attempting reconnection...`);
        await this.startDexProgramStream();
        this.reconnecting = false;
        this.reconnectAttempts = 0; // Reset on success
        console.log(`✅ [DexScreenerStyleMonitor] Reconnected successfully!`);
      } catch (error) {
        console.error(`❌ [DexScreenerStyleMonitor] Reconnection failed:`, error.message);
        this.reconnecting = false;
        // Try again
        this.scheduleReconnect('retry');
      }
    }, delay);
  }

  /**
   * @deprecated - Use startDexProgramStream instead
   */
  async recreateStreamWithAllFilters() {
    console.log(`🔄 [DexScreenerStyleMonitor] Reconnecting DEX program stream...`);
    await this.startDexProgramStream();
  }

  /**
   * Fetch SOL price from Jupiter API v3 (FIXED - using price endpoint, not search!)
   */
  async fetchSOLPrice() {
    try {
      // Use Jupiter Price API v3 (same as test file)
      const response = await fetch(`https://api.jup.ag/price/v3?ids=${SOL_MINT}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'x-api-key': JUPITER_API_KEY || ''
        }
      });
      const data = await response.json();
      
      // Jupiter v3 format: { "So111...": { usdPrice: 127.01 } }
      if (data?.[SOL_MINT]?.usdPrice) {
        this.solPriceUSD = parseFloat(data[SOL_MINT].usdPrice);
        console.log(`💵 [DexScreenerStyleMonitor] SOL Price: $${this.solPriceUSD.toFixed(2)} (Jupiter v3)`);
        return this.solPriceUSD;
      }
    } catch (error) {
      console.error('❌ [DexScreenerStyleMonitor] Error fetching SOL price:', error.message);
    }
    
    // Fallback to default if fetch fails (never leave at 0!)
    if (this.solPriceUSD === 0) {
      this.solPriceUSD = 135; // Reasonable default
      console.log(`⚠️ [DexScreenerStyleMonitor] Using default SOL price: $${this.solPriceUSD}`);
    }
    return this.solPriceUSD;
  }

  /**
   * Fetch token metadata from Jupiter API
   * NOTE: Data is pre-fetched in batch by enrichTokensWithJupiter() in enhancedBackend.mjs
   * This just returns the cached data from token.jupiterData
   */
  async fetchTokenMetadata(mint, name) {
    // Get token data which includes circSupply from config
    const tokenData = this.tokens.get(mint);
    const circSupply = tokenData?.config?.circSupply || 0;
    
    return {
      circSupply: circSupply,
      name: name,
      symbol: name
    };
  }

  /**
   * Batch fetch Jupiter seed data for multiple tokens (up to 100 at a time)
   * This provides baseline metrics on every restart
   */
  async batchFetchJupiterSeedData(mints) {
    const BATCH_SIZE = 100;
    let totalFetched = 0;
    let totalFailed = 0;
    
    console.log(`   Fetching seed data for ${mints.length} tokens in batches of ${BATCH_SIZE}...`);
    
    const headers = {};
    if (JUPITER_API_KEY) {
      headers['x-api-key'] = JUPITER_API_KEY;
    }
    
    for (let i = 0; i < mints.length; i += BATCH_SIZE) {
      const batch = mints.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(mints.length / BATCH_SIZE);
      
      try {
        const ids = batch.join(',');
        const url = `${JUPITER_API_ENDPOINT}/tokens/v2/search?query=${ids}`;
        console.log(`   🔍 Fetching batch ${batchNum}/${totalBatches} (${batch.length} tokens)...`);
        
        const response = await fetch(url, {
          method: 'GET',
          headers: headers
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`   ❌ Batch ${batchNum}/${totalBatches} failed: ${response.status}`);
          console.error(`   Error response: ${errorText.substring(0, 200)}`);
          totalFailed += batch.length;
          continue;
        }
        
        const data = await response.json();
        console.log(`   📦 Received ${data.length} tokens in response`);
        
        // Store seed data for each token
        // Response is an array of token objects
        const foundMints = new Set();
        for (const tokenInfo of data) {
          const mint = tokenInfo.id;
          const tokenData = this.tokens.get(mint);
          if (!tokenData) continue;
          
          foundMints.add(mint);
          
          if (tokenInfo) {
            tokenData.jupiterBaseline = {
              // Store nested stats objects directly
              stats5m: tokenInfo.stats5m || null,
              stats1h: tokenInfo.stats1h || null,
              stats6h: tokenInfo.stats6h || null,
              stats24h: tokenInfo.stats24h || null,
              
              // Also store flat for backward compatibility
              volume24h: (tokenInfo.stats24h?.buyVolume || 0) + (tokenInfo.stats24h?.sellVolume || 0),
              volume6h: (tokenInfo.stats6h?.buyVolume || 0) + (tokenInfo.stats6h?.sellVolume || 0),
              volume1h: (tokenInfo.stats1h?.buyVolume || 0) + (tokenInfo.stats1h?.sellVolume || 0),
              volume5m: (tokenInfo.stats5m?.buyVolume || 0) + (tokenInfo.stats5m?.sellVolume || 0),
              priceChange24h: tokenInfo.stats24h?.priceChange || 0,
              priceChange6h: tokenInfo.stats6h?.priceChange || 0,
              priceChange1h: tokenInfo.stats1h?.priceChange || 0,
              priceChange5m: tokenInfo.stats5m?.priceChange || 0
            };
            
            // Store Jupiter data in metadata for cache updates
            if (!tokenData.metadata) {
              tokenData.metadata = {};
            }
            tokenData.metadata.usdPrice = tokenInfo.usdPrice || 0;
            tokenData.metadata.marketCap = tokenInfo.marketCap || 0;
            tokenData.metadata.liquidity = tokenInfo.liquidity || 0;
            tokenData.metadata.holderCount = tokenInfo.holderCount || 0;
            // 🚨 FIX: Jupiter returns 'circulatingSupply' not 'circSupply'!
            tokenData.metadata.circSupply = tokenInfo.circulatingSupply || tokenInfo.circSupply || 0;
            tokenData.metadata.totalSupply = tokenInfo.totalSupply || 0;
            
            // Debug log supply data (first few tokens only)
            if (totalFetched < 5) {
              console.log(`   📊 ${tokenInfo.symbol}: price=$${tokenInfo.usdPrice?.toFixed(6) || '0'}, circSupply=${tokenInfo.circulatingSupply?.toLocaleString() || 'N/A'}, totalSupply=${tokenInfo.totalSupply?.toLocaleString() || 'N/A'}, mcap=$${(tokenInfo.marketCap / 1000000)?.toFixed(2) || '0'}M`);
            }
            
            // 🚨 CRITICAL FIX: Initialize lastPriceUSD from Jupiter price immediately
            // This ensures tokens have a price from the start, even before first swap
            if (tokenInfo.usdPrice && tokenInfo.usdPrice > 0) {
              tokenData.lastPriceUSD = tokenInfo.usdPrice;
              tokenData.lastPriceUpdate = Date.now();
              // Also initialize recentValidPrices with Jupiter price for smoothing
              if (tokenData.recentValidPrices.length === 0) {
                tokenData.recentValidPrices.push(tokenInfo.usdPrice);
              }
            }
            
            // CRITICAL: Store Jupiter's baseline market cap and price for incremental updates
            // This is our starting point - we'll adjust from here based on swap price changes
            if (tokenInfo.marketCap > 0 && tokenInfo.usdPrice > 0) {
              tokenData.jupiterBaselineMarketCap = tokenInfo.marketCap;
              tokenData.lastBaselinePrice = tokenInfo.usdPrice;
              
              // CRITICAL: Initialize price history and window start prices with Jupiter baseline
              // This ensures we have a starting point for price change calculations
              const now = Date.now();
              if (!tokenData.priceHistory || tokenData.priceHistory.length === 0) {
                if (!tokenData.priceHistory) tokenData.priceHistory = [];
                tokenData.priceHistory.push({
                  timestamp: now,
                  price: tokenInfo.usdPrice
                });
              }
              
              // Initialize window start prices with baseline price (will be updated as swaps come in)
              if (!tokenData.priceAtWindowStart) {
                tokenData.priceAtWindowStart = { '5m': null, '1h': null, '6h': null, '24h': null };
              }
              if (!tokenData.priceAtWindowStart['5m']) tokenData.priceAtWindowStart['5m'] = tokenInfo.usdPrice;
              if (!tokenData.priceAtWindowStart['1h']) tokenData.priceAtWindowStart['1h'] = tokenInfo.usdPrice;
              if (!tokenData.priceAtWindowStart['6h']) tokenData.priceAtWindowStart['6h'] = tokenInfo.usdPrice;
              if (!tokenData.priceAtWindowStart['24h']) tokenData.priceAtWindowStart['24h'] = tokenInfo.usdPrice;
            }
            
            totalFetched++;
          } else {
            totalFailed++;
          }
        }
        
        // CRITICAL: Initialize empty baseline for tokens not found in Jupiter response
        // This ensures all tokens have baseline structure (even if all zeros)
        for (const mint of batch) {
          if (!foundMints.has(mint)) {
            const tokenData = this.tokens.get(mint);
            if (tokenData && !tokenData.jupiterBaseline) {
              tokenData.jupiterBaseline = {
                stats5m: null,
                stats1h: null,
                stats6h: null,
                stats24h: null,
                volume24h: 0,
                volume6h: 0,
                volume1h: 0,
                volume5m: 0,
                priceChange24h: 0,
                priceChange6h: 0,
                priceChange1h: 0,
                priceChange5m: 0
              };
            }
          }
        }
        
        // Count tokens that weren't in the response
        const returnedMints = new Set(data.map(t => t.id));
        for (const mint of batch) {
          if (!returnedMints.has(mint)) {
            totalFailed++;
          }
        }
        
        console.log(`   ✅ Batch ${batchNum}/${totalBatches}: ${totalFetched} tokens seeded`);
        
        // Small delay between batches
        if (i + BATCH_SIZE < mints.length) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
        
      } catch (error) {
        console.error(`   ❌ Batch ${batchNum}/${totalBatches} error:`, error.message);
        totalFailed += batch.length;
      }
    }
    
    console.log(`\n✅ Jupiter seed complete: ${totalFetched} seeded, ${totalFailed} failed`);
    
    // Write Jupiter baseline data back to tokens-cache.json
    if (totalFetched > 0) {
      await this.updateTokensCacheWithJupiterData();
    }
  }

  /**
   * Fetch pool address from Moralis API (fallback when Jupiter has no graduatedPool)
   * Returns the pool address with highest liquidity
   */
  async fetchPoolFromMoralis(mint, tokenName, retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const url = `https://solana-gateway.moralis.io/token/mainnet/${mint}/pairs`;
        const response = await fetch(url, {
          headers: {
            'X-API-Key': MORALIS_API_KEY
          }
        });
        
        if (!response.ok) {
          console.error(`   ❌ Moralis API error: ${response.status}`);
          if (attempt < retries) {
            console.log(`   ⏳ Retrying in 2 seconds...`);
            await new Promise(resolve => setTimeout(resolve, 2000));
            continue;
          }
          return null;
        }
        
        const data = await response.json();
        
        // Extract pairAddress from first pair
        // Moralis returns: { pairs: [...], pageSize, page, cursor }
        if (data && data.pairs && data.pairs.length > 0) {
          // Sort ALL pairs by liquidity (highest first) and take the first ACTIVE one
          const sortedPairs = data.pairs
            .filter(p => !p.inactivePair) // Only active pairs
            .sort((a, b) => (b.liquidityUsd || 0) - (a.liquidityUsd || 0));
          
          if (sortedPairs.length > 0) {
            const bestPair = sortedPairs[0];
            console.log(`   ✅ [Moralis] Found pool for ${tokenName}: ${bestPair.pairAddress}`);
            console.log(`      Exchange: ${bestPair.exchangeName}`);
            console.log(`      Pair: ${bestPair.pairLabel}`);
            console.log(`      Liquidity: $${(bestPair.liquidityUsd / 1000000).toFixed(2)}M`);
            return bestPair.pairAddress;
          } else {
            console.log(`   ⚠️  No active pairs found in Moralis response`);
            return null;
          }
        } else {
          console.log(`   ⚠️  No pairs found in Moralis response`);
          if (attempt < retries) {
            console.log(`   ⏳ Retrying in 2 seconds...`);
            await new Promise(resolve => setTimeout(resolve, 2000));
            continue;
          }
          return null;
        }
      } catch (error) {
        console.error(`   ❌ [Moralis] Error fetching pool for ${tokenName}:`, error.message);
        if (attempt < retries) {
          console.log(`   ⏳ Retrying in 2 seconds...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
          continue;
        }
        return null;
      }
    }
    return null;
  }

  /**
   * Discover pools in priority order: Moralis → Jupiter → DexScreener
   * Updates config.pool and stores Moralis liquidity as baseline
   */
  async discoverPoolsInPriorityOrder(tokensConfig) {
    console.log(`\n   🔍 Discovering pools for ${tokensConfig?.length || 0} tokens...`);
    
    if (!tokensConfig || tokensConfig.length === 0) {
      console.error('   ❌ CRITICAL: No tokens to discover pools for!');
      return;
    }
    
    // Count tokens that already have pools
    const alreadyHavePools = tokensConfig.filter(({ config }) => config.pool).length;
    console.log(`   📊 Tokens already with pools from cache: ${alreadyHavePools}/${tokensConfig.length}`);
    
    // Sample tokens without pools for debugging
    const sampleWithoutPools = tokensConfig
      .filter(({ config }) => !config.pool)
      .slice(0, 5)
      .map(({ config }) => config.name);
    if (sampleWithoutPools.length > 0) {
      console.log(`   🔍 Sample tokens needing pool discovery: ${sampleWithoutPools.join(', ')}...`);
    }
    
    let moralisCount = 0;
    let jupiterCount = 0;
    let dexScreenerCount = 0;
    let failedCount = 0;
    
    // Step 1: Try Moralis API first (main source)
    console.log(`   🔑 MORALIS_API_KEY: ${MORALIS_API_KEY ? 'SET (' + MORALIS_API_KEY.substring(0, 8) + '...)' : 'NOT SET'}`);
    console.log(`   🔑 JUPITER_API_KEY: ${JUPITER_API_KEY ? 'SET' : 'NOT SET'}`);
    
    if (MORALIS_API_KEY) {
      const moralisPools = await this.batchFetchPoolsFromMoralis(Array.from(this.tokens.keys()));
      
      for (const { mint, config } of tokensConfig) {
        if (!this.tokens.has(mint)) continue;
        
        const moralisPool = moralisPools.get(mint);
        if (moralisPool && moralisPool.poolAddress) {
          const oldPool = config.pool;
          config.pool = moralisPool.poolAddress;
          
          // Store Moralis liquidity as baseline for liquidity calculation
          const tokenData = this.tokens.get(mint);
          if (tokenData) {
            tokenData.moralisLiquidity = moralisPool.liquidity;
          }
          
          const liquidity = (moralisPool.liquidity / 1000000).toFixed(2);
          console.log(`   ✅ [Moralis] ${config.name}: ${moralisPool.poolAddress.substring(0, 8)}... (${liquidity}M liquidity, ${moralisPool.exchange})`);
          if (oldPool && oldPool !== config.pool) {
            console.log(`      Replaced pool: ${oldPool.substring(0, 8)}...`);
          }
          moralisCount++;
        }
      }
    } else {
      console.log(`   ⚠️  MORALIS_API_KEY not set, skipping Moralis pool discovery`);
    }
    
    // Step 2: Try Jupiter API for tokens without pools
    const tokensWithoutPools = tokensConfig.filter(({ mint, config }) => {
      if (!this.tokens.has(mint)) return false;
      if (config.pool) return false; // Already has pool from Moralis
      return true;
    });
    
    if (tokensWithoutPools.length > 0) {
      console.log(`   🔍 Trying Jupiter API for ${tokensWithoutPools.length} tokens without pools...`);
      
      const headers = {};
      if (JUPITER_API_KEY) {
        headers['x-api-key'] = JUPITER_API_KEY;
      }
      
      for (const { mint, config } of tokensWithoutPools) {
        try {
          const response = await fetch(`${JUPITER_API_ENDPOINT}/tokens/v2/search?query=${mint}`, {
            method: 'GET',
            headers: headers
          });
          
          if (response.ok) {
            const data = await response.json();
            if (data && Array.isArray(data) && data.length > 0) {
              const token = data[0];
              if (token.graduatedPool) {
                config.pool = typeof token.graduatedPool === 'string' 
                  ? token.graduatedPool 
                  : token.graduatedPool.address || token.graduatedPool.id;
                
                // Store Jupiter liquidity as baseline (if available)
                const tokenData = this.tokens.get(mint);
                if (tokenData && token.liquidity) {
                  tokenData.jupiterLiquidity = token.liquidity;
                }
                
                console.log(`   ✅ [Jupiter] ${config.name}: ${config.pool.substring(0, 8)}...`);
                jupiterCount++;
              }
            }
          }
        } catch (error) {
          console.log(`   ⚠️  [Jupiter] Error for ${config.name}: ${error.message}`);
        }
      }
    }
    
    // Step 3: Try DexScreener as final fallback for tokens without pools
    const tokensStillWithoutPools = tokensConfig.filter(({ mint, config }) => {
      if (!this.tokens.has(mint)) return false;
      if (config.pool) return false;
      return true;
    });
    
    if (tokensStillWithoutPools.length > 0) {
      console.log(`   🔍 Trying DexScreener API for ${tokensStillWithoutPools.length} tokens...`);
      
      for (const { mint, config } of tokensStillWithoutPools) {
        try {
          const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
          if (response.ok) {
            const data = await response.json();
            if (data && data.pairs && data.pairs.length > 0) {
              const pair = data.pairs[0];
              config.pool = pair.pairAddress;
              console.log(`   ✅ [DexScreener] ${config.name}: ${config.pool.substring(0, 8)}...`);
              dexScreenerCount++;
            }
          }
        } catch (error) {
          console.log(`   ⚠️  [DexScreener] Error for ${config.name}: ${error.message}`);
        }
      }
    }
    
    // Step 4: 🚨 MULTI-POOL DISCOVERY - Add additional pools for high-liquidity tokens
    // This catches swaps on Orca, Meteora, etc. that we'd otherwise miss
    console.log(`\n   🏊 Phase 4: Multi-pool discovery (DexScreener)...`);
    let additionalPoolsCount = 0;
    const MIN_LIQUIDITY_FOR_ADDITIONAL_POOLS = 50000; // $50K minimum
    
    for (const { mint, config } of tokensConfig) {
      if (!this.tokens.has(mint)) continue;
      if (!config.pool) continue; // Skip tokens without a main pool
      
      const tokenData = this.tokens.get(mint);
      if (!tokenData) continue;
      
      try {
        const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
        if (!response.ok) continue;
        
        const data = await response.json();
        if (!data || !data.pairs || data.pairs.length <= 1) continue;
        
        // Get all pools with significant liquidity (excluding the main one)
        const additionalPools = data.pairs
          .filter(p => p.pairAddress !== config.pool) // Exclude main pool
          .filter(p => p.liquidity?.usd >= MIN_LIQUIDITY_FOR_ADDITIONAL_POOLS)
          .slice(0, 4); // Max 4 additional pools per token
        
        if (additionalPools.length > 0) {
          // Store additional pool addresses for gRPC filter
          if (!tokenData.additionalPools) {
            tokenData.additionalPools = [];
          }
          
          for (const pool of additionalPools) {
            tokenData.additionalPools.push({
              address: pool.pairAddress,
              dex: pool.dexId,
              liquidity: pool.liquidity?.usd || 0
            });
            additionalPoolsCount++;
          }
          
          console.log(`   🏊 [Multi-Pool] ${config.name}: +${additionalPools.length} pools (${additionalPools.map(p => p.dexId).join(', ')})`);
        }
      } catch (error) {
        // Silently skip errors for additional pool discovery
      }
    }
    
    if (additionalPoolsCount > 0) {
      console.log(`   ✅ Discovered ${additionalPoolsCount} additional pools for multi-pool tokens`);
    }
    
    // Count tokens that still don't have pools
    failedCount = tokensConfig.filter(({ mint, config }) => {
      if (!this.tokens.has(mint)) return false;
      return !config.pool;
    }).length;
    
    console.log(`\n   ✅ Pool Discovery Summary:`);
    console.log(`      Moralis: ${moralisCount}`);
    console.log(`      Jupiter: ${jupiterCount}`);
    console.log(`      DexScreener: ${dexScreenerCount}`);
    if (failedCount > 0) {
      console.log(`      ❌ Failed: ${failedCount}`);
    }
  }

  /**
   * Batch fetch pools from Moralis for multiple tokens in parallel
   * Returns a Map: mint -> { poolAddress, liquidity, exchange }
   */
  async batchFetchPoolsFromMoralis(mints) {
    console.log(`   🔍 Fetching pools from Moralis for ${mints.length} tokens in parallel...`);
    
    const promises = mints.map(async (mint) => {
      try {
        const tokenData = this.tokens.get(mint);
        if (!tokenData) return { mint, pool: null };
        
        const url = `https://solana-gateway.moralis.io/token/mainnet/${mint}/pairs`;
        const response = await fetch(url, {
          headers: {
            'X-API-Key': MORALIS_API_KEY
          }
        });
        
        if (!response.ok) {
          return { mint, pool: null, error: `HTTP ${response.status}` };
        }
        
        const data = await response.json();
        
        if (data && data.pairs && data.pairs.length > 0) {
          const sortedPairs = data.pairs
            .filter(p => !p.inactivePair)
            .sort((a, b) => (b.liquidityUsd || 0) - (a.liquidityUsd || 0));
          
          if (sortedPairs.length > 0) {
            const bestPair = sortedPairs[0];
            return {
              mint,
              pool: bestPair.pairAddress,
              liquidity: bestPair.liquidityUsd || 0,
              exchange: bestPair.exchangeName || 'Unknown'
            };
          }
        }
        
        return { mint, pool: null };
      } catch (error) {
        return { mint, pool: null, error: error.message };
      }
    });
    
    const results = await Promise.all(promises);
    const poolsMap = new Map();
    let successCount = 0;
    let failCount = 0;
    
    for (const result of results) {
      if (result.pool) {
        poolsMap.set(result.mint, {
          poolAddress: result.pool,
          liquidity: result.liquidity,
          exchange: result.exchange
        });
        successCount++;
      } else {
        failCount++;
      }
    }
    
    console.log(`   ✅ [Moralis] Found pools for ${successCount}/${mints.length} tokens`);
    
    return poolsMap;
  }

  /**
   * Update tokens-cache.json with fresh Jupiter baseline data
   * This ensures the cache has up-to-date price, mcap, volume, holders
   * Uses atomic write with file locking to prevent race conditions
   */
  async updateTokensCacheWithJupiterData() {
    try {
      console.log(`   💾 Writing Jupiter baseline data to tokens-cache.json...`);
      
      // Build updates map from our in-memory token data
      const updatesMap = new Map();
      
      for (const [mint, tokenData] of this.tokens.entries()) {
        if (!tokenData.jupiterBaseline && !tokenData.metadata) continue;
        
        const updates = {};
        
        // Update with fresh Jupiter data
        if (tokenData.metadata?.usdPrice) {
          updates.price = tokenData.metadata.usdPrice;
          updates.currentPrice = tokenData.metadata.usdPrice;
        }
        
        // Update volume from Jupiter baseline
        if (tokenData.jupiterBaseline?.volume24h) {
          updates.volume24h = tokenData.jupiterBaseline.volume24h;
        }
        
        // Update other metrics if available from Jupiter
        if (tokenData.metadata?.marketCap) {
          updates.marketCap = tokenData.metadata.marketCap;
        }
        if (tokenData.metadata?.liquidity) {
          updates.liquidity = tokenData.metadata.liquidity;
        }
        if (tokenData.metadata?.holderCount) {
          updates.holderCount = tokenData.metadata.holderCount;
        }
        
        // Only add to map if we have updates
        if (Object.keys(updates).length > 0) {
          updatesMap.set(mint, updates);
        }
      }
      
      if (updatesMap.size === 0) {
        console.log(`   ⚠️ No Jupiter data to write to cache`);
        return;
      }
      
      // Use atomic writer with file locking
      const result = await atomicCacheWriter.updateTokens(updatesMap, 'DexScreenerStyleMonitor');
      
      if (result.success) {
        console.log(`   ✅ Successfully updated cache with Jupiter baseline data`);
      } else {
        console.error(`   ❌ Failed to update cache: ${result.error}`);
      }
      
    } catch (error) {
      console.error(`   ❌ Error updating tokens cache:`, error.message);
    }
  }

  /**
   * Fetch Jupiter baseline stats for a single token
   * Used for individual token onboarding
   */
  async fetchJupiterBaseline(mint) {
    try {
      const headers = {};
      if (JUPITER_API_KEY) {
        headers['x-api-key'] = JUPITER_API_KEY;
      }
      
      const response = await fetch(`${JUPITER_API_ENDPOINT}/tokens/v2/search?query=${mint}`, {
        method: 'GET',
        headers: headers
      });
      if (!response.ok) return null;
      
      const data = await response.json();
      const tokenInfo = data[0]; // Response is an array
      
      if (!tokenInfo) return null;
      
      // Return baseline metrics with nested stats
      return {
        stats5m: tokenInfo.stats5m || null,
        stats1h: tokenInfo.stats1h || null,
        stats6h: tokenInfo.stats6h || null,
        stats24h: tokenInfo.stats24h || null,
        
        // Also store flat for backward compatibility
        volume24h: (tokenInfo.stats24h?.buyVolume || 0) + (tokenInfo.stats24h?.sellVolume || 0),
        volume6h: (tokenInfo.stats6h?.buyVolume || 0) + (tokenInfo.stats6h?.sellVolume || 0),
        volume1h: (tokenInfo.stats1h?.buyVolume || 0) + (tokenInfo.stats1h?.sellVolume || 0),
        volume5m: (tokenInfo.stats5m?.buyVolume || 0) + (tokenInfo.stats5m?.sellVolume || 0),
        priceChange24h: tokenInfo.stats24h?.priceChange || 0,
        priceChange6h: tokenInfo.stats6h?.priceChange || 0,
        priceChange1h: tokenInfo.stats1h?.priceChange || 0,
        priceChange5m: tokenInfo.stats5m?.priceChange || 0
      };
    } catch (error) {
      console.error(`   ⚠️  Jupiter baseline error for ${mint}:`, error.message);
      return null;
    }
  }

  /**
   * Discover reserve accounts for DLMM pools by analyzing recent transactions
   * DEPRECATED: PHASE 3 - No longer used with transaction-level decoding
   * Quote mint is now determined from swap.counterMint on first swap
   * Kept for backward compatibility but should not be called
   */
  async discoverDLMMReserves(poolAddress, tokenMint) {
    console.warn(`⚠️  [DEPRECATED] discoverDLMMReserves called - should not be used with transaction-level decoding`);
    try {
      const poolPubkey = new PublicKey(poolAddress);
      const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
      const USDT_MINT = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';
      
      // Get recent transactions
      const signatures = await this.connection.getSignaturesForAddress(poolPubkey, { limit: 10 });
      
      if (signatures.length === 0) {
        return null;
      }
      
      // Collect accounts across ALL transactions to track frequency
      const accountFrequency = new Map(); // pubkey -> { count, amount, decimals, mint }
      
      for (let i = 0; i < signatures.length; i++) {
        const tx = await this.connection.getParsedTransaction(signatures[i].signature, {
          maxSupportedTransactionVersion: 0
        });
        
        if (!tx || !tx.meta || !tx.meta.postTokenBalances || tx.meta.postTokenBalances.length === 0) {
          continue;
        }
        
        // Process each account in this transaction
        tx.meta.postTokenBalances.forEach(balance => {
          const accountIndex = balance.accountIndex;
          const account = tx.transaction.message.accountKeys[accountIndex];
          const pubkey = typeof account === 'object' && account.pubkey ? account.pubkey.toBase58() : account.toBase58();
          
          if (!accountFrequency.has(pubkey)) {
            accountFrequency.set(pubkey, {
              pubkey,
              count: 0,
              amount: balance.uiTokenAmount.uiAmount,
              decimals: balance.uiTokenAmount.decimals,
              mint: balance.mint
            });
          }
          
          // Increment frequency counter
          const accData = accountFrequency.get(pubkey);
          accData.count++;
          // Update amount to the maximum seen (pool reserves should be stable or increasing)
          if (balance.uiTokenAmount.uiAmount > accData.amount) {
            accData.amount = balance.uiTokenAmount.uiAmount;
          }
        });
      }
      
      // Filter to accounts appearing in at least 2 transactions (more likely to be pool reserves)
      const frequentAccounts = Array.from(accountFrequency.values()).filter(acc => acc.count >= 2);
      
      if (frequentAccounts.length === 0) {
        return null;
      }
      
      // Group frequent accounts by mint
      const accountsByMint = new Map();
      frequentAccounts.forEach(acc => {
        if (!accountsByMint.has(acc.mint)) {
          accountsByMint.set(acc.mint, []);
        }
        accountsByMint.get(acc.mint).push(acc);
      });
      
      // Find token reserve (sort by frequency first, then by amount)
      const tokenReserves = accountsByMint.get(tokenMint)?.sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count; // Prioritize frequency
        return b.amount - a.amount; // Then by amount
      });
      const tokenReserve = tokenReserves?.[0];
      
      if (!tokenReserve) {
        return null;
      }
      
      // Find quote reserve - prioritize frequency (most transactions = pool reserve), then liquidity
      const quoteMintsToTry = [
        { mint: SOL_MINT, name: 'SOL' },
        { mint: USDC_MINT, name: 'USDC' },
        { mint: USDT_MINT, name: 'USDT' }
      ];
      
      let bestQuote = null;
      let bestFrequency = 0;
      let bestLiquidityUSD = 0;
      
      for (const { mint: quoteMint, name: quoteName } of quoteMintsToTry) {
        const quoteReserves = accountsByMint.get(quoteMint)?.sort((a, b) => {
          if (b.count !== a.count) return b.count - a.count; // Prioritize frequency
          return b.amount - a.amount; // Then by amount
        });
        const quoteReserve = quoteReserves?.[0];
        
        if (quoteReserve && quoteReserve.amount > 0.01 && quoteReserve.count >= 2) {
          // Calculate liquidity in USD terms
          const liquidityUSD = quoteMint === SOL_MINT 
            ? quoteReserve.amount * this.solPriceUSD 
            : quoteReserve.amount; // USDC/USDT already in USD
          
          // PRIORITIZE FREQUENCY first (more transactions = more likely to be pool reserve)
          // Only use liquidity as tiebreaker if frequencies are equal or very close (±1)
          const frequencyDiff = Math.abs(quoteReserve.count - bestFrequency);
          
          if (!bestQuote || 
              quoteReserve.count > bestFrequency || // Higher frequency wins
              (frequencyDiff <= 1 && liquidityUSD > bestLiquidityUSD)) { // Tiebreaker: liquidity if frequencies are close
            bestQuote = {
              quoteMint,
              quoteName,
              quoteReserve
            };
            bestFrequency = quoteReserve.count;
            bestLiquidityUSD = liquidityUSD;
          }
        }
      }
      
      if (!bestQuote) {
        return null;
      }
      
      console.log(`   ✅ [DLMM Discovery] Found ${bestQuote.quoteName} pair (${bestQuote.quoteReserve.count}/${signatures.length} txs, ${bestQuote.quoteReserve.amount.toLocaleString()} ${bestQuote.quoteName}, $${(bestLiquidityUSD/1000).toFixed(1)}K liquidity)`);
      
      return {
        poolTokenAccount: tokenReserve.pubkey,
        poolQuoteAccount: bestQuote.quoteReserve.pubkey,
        tokenReserve: tokenReserve.amount,
        quoteReserve: bestQuote.quoteReserve.amount,
        quoteMint: bestQuote.quoteMint,
        quoteDecimals: bestQuote.quoteReserve.decimals
      };
      
    } catch (error) {
      console.error(`   ❌ [DLMM Discovery] Error:`, error.message);
      return null;
    }
  }

  /**
   * Batch onboard multiple tokens
   * Phase 1: Prepare all tokens (metadata, swaps) - PARALLEL
   * Phase 2: Discover all pool reserves - PARALLEL
   * Phase 3: Create stream ONCE with all filters
   * 
   * This is more efficient than calling onboardToken() sequentially, which recreates
   * the stream N times. Instead, we discover all pools first, then create the stream once.
   * 
   * @param {Array} tokensConfig - Array of { mint, config: { name, pool, decimals } }
   */
  async batchOnboardTokens(tokensConfig) {
    console.log(`\n📦 [DexScreenerStyleMonitor] Batch onboarding ${tokensConfig?.length || 0} tokens...`);
    
    // 🚨 CRITICAL DEBUG
    if (!tokensConfig || tokensConfig.length === 0) {
      console.error('❌ [DexScreenerStyleMonitor] CRITICAL: No tokensConfig passed to batchOnboardTokens!');
      return { successful: 0, failed: 0 };
    }
    
    // Log first few tokens for debugging
    console.log(`   🔍 First 3 tokens:`);
    for (let i = 0; i < Math.min(3, tokensConfig.length); i++) {
      const { mint, config } = tokensConfig[i];
      console.log(`      ${i+1}. ${config.name} (${mint?.substring(0,8) || 'NO MINT'}...) pool=${config.pool ? config.pool.substring(0,8)+'...' : 'NONE'}`);
    }
    
    let successful = 0;
    let failed = 0;

    console.log('🔍 Phase 1: Preparing tokens (metadata + swaps)...');
    
    // CRITICAL: Add ALL tokens first (even without pools) so pool discovery can find them
    for (const { mint, config } of tokensConfig) {
      try {
        // Skip if already onboarded
        if (this.tokens.has(mint)) {
          console.log(`   ⚠️  ${config.name} already onboarded`);
          continue;
        }

        // 1. Create token data structure (even if no pool yet)
        const tokenData = new TokenData(mint, config);
        this.tokens.set(mint, tokenData);

        // 2. Fetch token metadata from Jupiter (no await - let them run in parallel)
        this.fetchTokenMetadata(mint, config.name).then(metadata => {
          tokenData.metadata = metadata;
        }).catch(err => {
          console.error(`   ⚠️  ${config.name} metadata error:`, err.message);
        });

        console.log(`   ✅ ${config.name} prepared`);
        successful++;
        
      } catch (error) {
        console.error(`   ❌ ${config.name} error:`, error.message);
        this.tokens.delete(mint);
        failed++;
      }
    }

    console.log(`\n✅ Phase 1 complete: ${successful} tokens prepared`);
    
    // Phase 1.5: Batch fetch Jupiter seed data for ALL tokens
    console.log(`\n📊 Phase 1.5: Fetching Jupiter seed data for all tokens...`);
    await this.batchFetchJupiterSeedData(Array.from(this.tokens.keys()));
    
    // Phase 1.6: Discover pools in priority order (Moralis → Jupiter → DexScreener)
    // CRITICAL: This will update config.pool for tokens that don't have one yet
    console.log(`\n🏊 Phase 1.6: Discovering pools (Moralis → Jupiter → DexScreener)...`);
    await this.discoverPoolsInPriorityOrder(tokensConfig);
    
    console.log(`\n📡 Phase 2: Initializing pools (no reserve reading - will initialize from liquidity baseline on first swap)...`);

    // PHASE 3: No need to read reserves - we'll initialize from liquidity baseline on first swap
    // Just create PoolData with pool address and initialize from liquidity when first swap arrives
    console.log(`\n📡 Phase 2: Initializing pools (no reserve reading needed with transaction-level decoding)...`);
    
    const tokensToInitialize = tokensConfig.filter(({ mint, config }) => config.pool && this.tokens.has(mint));
    let initialized = 0;
    
    for (const { mint, config } of tokensToInitialize) {
      try {
        // PHASE 3: Create minimal PoolData - reserves will be initialized from liquidity baseline on first swap
        const poolData = new PoolData(config.pool, mint, config);
        poolData.poolAddress = config.pool; // Ensure poolAddress is set
        
        // Get initial liquidity from tokenData (set during pool discovery)
        const tokenData = this.tokens.get(mint);
        if (tokenData) {
          // Store liquidity for baseline (from Moralis/Jupiter)
          if (tokenData.moralisLiquidity) {
            poolData.initialLiquidity = tokenData.moralisLiquidity;
          } else if (tokenData.jupiterLiquidity) {
            poolData.initialLiquidity = tokenData.jupiterLiquidity;
          } else if (tokenData.metadata?.liquidity) {
            poolData.initialLiquidity = tokenData.metadata.liquidity;
          }
        }
        
        // Add to pools Map
        this.pools.set(mint, poolData);
        
        initialized++;
        console.log(`   ✅ [${initialized}/${tokensToInitialize.length}] ${config.name} initialized (pool: ${config.pool.substring(0, 8)}...)`);
        
      } catch (error) {
        console.error(`   ❌ ${config.name} initialization error:`, error.message);
      }
    }
    
    console.log(`\n✅ Phase 2 complete: ${initialized} pools initialized`);
    
    // Log tokens that still don't have pools (for debugging)
    const tokensWithoutPools = tokensConfig.filter(({ mint, config }) => {
      if (!this.tokens.has(mint)) return false;
      return !config.pool;
    });
    
    if (tokensWithoutPools.length > 0) {
      console.log(`\n⚠️  ${tokensWithoutPools.length} tokens without pools (not monitoring swaps):`);
      for (const { mint, config } of tokensWithoutPools) {
        console.log(`   - ${config.name} (${mint.substring(0, 8)}...)`);
      }
      console.log(`   💡 These tokens will still receive price updates from Jupiter baseline`);
      console.log(`   💡 Pool discovery will be retried periodically`);
    }
    
    // Phase 3: Start DEX program stream (subscribes ONCE to all DEX programs)
    if (initialized > 0) {
      console.log(`\n📡 Phase 3: Starting DEX program stream...`);
      await this.startDexProgramStream();
      this.stats.tokensMonitored = this.tokens.size;
    }

    console.log(`\n✅ Batch onboarding complete: ${initialized} tokens monitoring swaps, ${tokensWithoutPools.length} tokens with Jupiter baseline only\n`);
    return { successful: initialized, failed: tokensToInitialize.length - initialized };
  }

  /**
   * DEPRECATED: Discover pool reserves without adding to stream
   * PHASE 3: No longer used with transaction-level decoding
   * Reserves are now initialized from liquidity baseline on first swap
   * Kept for backward compatibility but should not be called
   */
  async discoverPoolInfo(mint, config) {
    console.warn(`⚠️  [DEPRECATED] discoverPoolInfo called - should not be used with transaction-level decoding`);
    const poolPubkey = new PublicKey(config.pool);
    const tokenMint = new PublicKey(mint);
    
    // Try to find token accounts owned by the pool
    const poolAccounts = await this.connection.getParsedTokenAccountsByOwner(poolPubkey, {
      programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
    });
    
    let poolTokenAccount = null;
    let poolQuoteAccount = null;
    let tokenReserve = 0;
    let quoteReserve = 0;
    let quoteMint = null;
    let quoteDecimals = 9;
    
    const SOL_MINT = 'So11111111111111111111111111111111111111112';
    const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
    const USDT_MINT = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';
    
    // Collect all potential quote accounts
    const quoteAccounts = [];
    
    for (const account of poolAccounts.value) {
      const accountMint = account.account.data.parsed.info.mint;
      const amount = account.account.data.parsed.info.tokenAmount.uiAmount;
      const decimals = account.account.data.parsed.info.tokenAmount.decimals;
      
      if (accountMint === mint) {
        poolTokenAccount = account.pubkey.toBase58();
        tokenReserve = amount;
      } else if (accountMint === SOL_MINT || accountMint === USDC_MINT || accountMint === USDT_MINT) {
        // Collect all potential quote accounts
        quoteAccounts.push({
          pubkey: account.pubkey.toBase58(),
          mint: accountMint,
          amount,
          decimals
        });
      }
    }
    
    // Pick the quote account with the highest liquidity (in USD terms)
    let standardDiscoveryResult = null;
    if (quoteAccounts.length > 0) {
      const bestQuote = quoteAccounts.reduce((best, current) => {
        const currentLiquidityUSD = current.mint === SOL_MINT 
          ? current.amount * this.solPriceUSD 
          : current.amount; // USDC/USDT already in USD
        const bestLiquidityUSD = best.mint === SOL_MINT 
          ? best.amount * this.solPriceUSD 
          : best.amount;
        return currentLiquidityUSD > bestLiquidityUSD ? current : best;
      });
      
      poolQuoteAccount = bestQuote.pubkey;
      quoteReserve = bestQuote.amount;
      quoteMint = bestQuote.mint;
      quoteDecimals = bestQuote.decimals;
      
      standardDiscoveryResult = {
        poolTokenAccount,
        poolQuoteAccount,
        tokenReserve,
        quoteReserve,
        quoteMint,
        quoteDecimals
      };
    }
    
    // Check pool owner to detect Meteora pools
    let isMeteoraPool = false;
    let isMeteoraCPAMM = false;
    
    try {
      const poolInfo = await this.connection.getAccountInfo(poolPubkey);
      if (poolInfo && poolInfo.owner) {
        const ownerStr = poolInfo.owner.toBase58();
        
        // Meteora Constant Product AMM (DAMM v2): cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG
        // Meteora DLMM: LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo
        if (ownerStr === 'cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG') {
          isMeteoraPool = true;
          isMeteoraCPAMM = true;
        } else if (ownerStr === 'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo') {
          isMeteoraPool = true;
        }
      }
    } catch (error) {
      // If we can't check, proceed with standard discovery
    }
    
    // For Meteora CP-AMM pools, use the SDK to get accurate price from sqrtPrice
    if (isMeteoraCPAMM) {
      try {
        const tokenName = config.name || mint.substring(0, 8);
        console.log(`   💰 [${tokenName}] Using CP-AMM SDK for Meteora Constant Product AMM...`);
        
        const cpAmm = new CpAmm(this.connection);
        const poolState = await cpAmm.fetchPoolState(poolPubkey);
        
        // Get vault addresses from pool state
        poolTokenAccount = poolState.tokenAVault.toBase58();
        poolQuoteAccount = poolState.tokenBVault.toBase58();
        quoteMint = poolState.tokenBMint.toBase58();
        
        // Read current vault balances
        const vaultABalance = await this.connection.getTokenAccountBalance(poolState.tokenAVault);
        const vaultBBalance = await this.connection.getTokenAccountBalance(poolState.tokenBVault);
        
        tokenReserve = vaultABalance.value.uiAmount || 0;
        quoteReserve = vaultBBalance.value.uiAmount || 0;
        quoteDecimals = vaultBBalance.value.decimals;
        
        // Calculate price using SDK (from sqrtPrice)
        const tokenDecimals = vaultABalance.value.decimals;
        const priceFromSDK = getPriceFromSqrtPrice(poolState.sqrtPrice, tokenDecimals, quoteDecimals);
        const sdkPrice = parseFloat(priceFromSDK.toString());
        
        const quoteName = quoteMint === SOL_MINT ? 'SOL' : 
                         quoteMint === USDC_MINT ? 'USDC' : 
                         quoteMint === USDT_MINT ? 'USDT' : 'UNKNOWN';
        
        console.log(`   ✅ [${tokenName}] CP-AMM SDK price: $${sdkPrice.toFixed(6)} (sqrtPrice: ${poolState.sqrtPrice.toString().substring(0, 16)}...)`);
        console.log(`      Vault reserves: ${tokenReserve.toLocaleString()} ${tokenName} / ${quoteReserve.toLocaleString()} ${quoteName}`);
        
        // Return pool data with SDK price
        return {
          poolTokenAccount,
          poolQuoteAccount,
          tokenReserve,
          quoteReserve,
          price: sdkPrice, // Use SDK price instead of naive calculation
          quoteMint,
          quoteName,
          quoteDecimals,
          isMeteoraCPAMM: true,
          sqrtPrice: poolState.sqrtPrice.toString(), // Store for potential future updates
          lastUpdate: Date.now()
        };
      } catch (error) {
        console.error(`   ❌ CP-AMM SDK error: ${error.message}`);
        // Fall through to standard/DLMM discovery
      }
    }
    
    // If no token accounts found (DLMM pools), or if it's a Meteora pool, try transaction-based discovery
    if (!poolTokenAccount || !poolQuoteAccount || isMeteoraPool) {
      const reserves = await this.discoverDLMMReserves(config.pool, mint);
      if (reserves) {
        // Use DLMM discovery to find the correct accounts
        poolTokenAccount = reserves.poolTokenAccount;
        poolQuoteAccount = reserves.poolQuoteAccount;
        quoteMint = reserves.quoteMint;
        quoteDecimals = reserves.quoteDecimals;
        
        // CRITICAL: Read CURRENT reserves from the discovered accounts, not historical maximums
        try {
          const tokenAccountInfo = await this.connection.getParsedAccountInfo(new PublicKey(poolTokenAccount));
          const quoteAccountInfo = await this.connection.getParsedAccountInfo(new PublicKey(poolQuoteAccount));
          
          if (tokenAccountInfo?.value?.data?.parsed?.info?.tokenAmount) {
            tokenReserve = tokenAccountInfo.value.data.parsed.info.tokenAmount.uiAmount || 0;
          }
          
          if (quoteAccountInfo?.value?.data?.parsed?.info?.tokenAmount) {
            quoteReserve = quoteAccountInfo.value.data.parsed.info.tokenAmount.uiAmount || 0;
          }
          
          if (tokenReserve === 0 || quoteReserve === 0) {
            // Fallback to DLMM discovery reserves if we can't read current reserves
            console.log(`   ⚠️  Could not read current reserves, using DLMM discovery reserves`);
            tokenReserve = reserves.tokenReserve;
            quoteReserve = reserves.quoteReserve;
          } else {
            console.log(`   ✅ Read current reserves: ${tokenReserve.toLocaleString()} tokens, ${quoteReserve.toLocaleString()} ${quoteMint === SOL_MINT ? 'SOL' : (quoteMint === USDC_MINT ? 'USDC' : 'USDT')}`);
          }
        } catch (error) {
          console.error(`   ⚠️  Error reading current reserves: ${error.message}, using DLMM discovery reserves`);
          // Fallback to DLMM discovery reserves
          tokenReserve = reserves.tokenReserve;
          quoteReserve = reserves.quoteReserve;
        }
        
        if (isMeteoraPool && standardDiscoveryResult) {
          const tokenName = config.name || mint.substring(0, 8);
          console.log(`   ✅ [${tokenName}] Using DLMM discovery for Meteora pool (standard discovery found ${standardDiscoveryResult.quoteMint === SOL_MINT ? 'SOL' : 'USDC'}, DLMM found ${quoteMint === SOL_MINT ? 'SOL' : 'USDC'})`);
        }
      } else if (!poolTokenAccount || !poolQuoteAccount) {
        // If DLMM discovery also failed and we have no accounts, throw error
        throw new Error(`Could not discover reserves for pool ${config.pool}`);
      }
      // If DLMM discovery failed but standard discovery succeeded, use standard discovery result
    }
    
    const price = quoteReserve / tokenReserve;
    const quoteName = quoteMint === SOL_MINT ? 'SOL' : (quoteMint === USDC_MINT ? 'USDC' : 'USDT');
    
    return {
      poolTokenAccount,
      poolQuoteAccount,
      tokenReserve,
      quoteReserve,
      price,
      quoteMint,
      quoteName,
      quoteDecimals,
      lastUpdate: Date.now()
    };
  }

  /**
   * Discover pool reserves without adding to stream
   * Returns pool info or null if discovery fails
   */
  async discoverPoolReserves(mint, config) {
    try {
      const poolPubkey = new PublicKey(config.pool);
      
      // Try standard token accounts first
      const tokenAccounts = await this.connection.getParsedTokenAccountsByOwner(poolPubkey, {
        programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
      });

      let poolTokenAccount = null;
      let poolQuoteAccount = null;
      let tokenReserve = null;
      let quoteReserve = null;
      let quoteMint = null;
      let quoteName = null;
      let quoteDecimals = 9;

      const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
      const USDT_MINT = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';
      
      if (tokenAccounts.value.length > 0) {
        // Collect all potential quote accounts
        const quoteAccounts = [];
        
        // Standard AMM pool
        for (const account of tokenAccounts.value) {
          const parsedInfo = account.account.data.parsed.info;
          const accountMint = parsedInfo.mint;
          const amount = parsedInfo.tokenAmount.uiAmount;
          const decimals = parsedInfo.tokenAmount.decimals;

          if (accountMint === mint) {
            poolTokenAccount = account.pubkey.toString();
            tokenReserve = amount;
          } else if (accountMint === SOL_MINT || accountMint === USDC_MINT || accountMint === USDT_MINT) {
            // Collect all potential quote accounts
            quoteAccounts.push({
              pubkey: account.pubkey.toString(),
              mint: accountMint,
              amount,
              decimals,
              name: accountMint === SOL_MINT ? 'SOL' : (accountMint === USDC_MINT ? 'USDC' : 'USDT')
            });
          }
        }
        
        // Pick the quote account with the highest liquidity (in USD terms)
        if (quoteAccounts.length > 0) {
          const bestQuote = quoteAccounts.reduce((best, current) => {
            const currentLiquidityUSD = current.mint === SOL_MINT 
              ? current.amount * this.solPriceUSD 
              : current.amount; // USDC/USDT already in USD
            const bestLiquidityUSD = best.mint === SOL_MINT 
              ? best.amount * this.solPriceUSD 
              : best.amount;
            return currentLiquidityUSD > bestLiquidityUSD ? current : best;
          });
          
          poolQuoteAccount = bestQuote.pubkey;
          quoteReserve = bestQuote.amount;
          quoteMint = bestQuote.mint;
          quoteName = bestQuote.name;
          quoteDecimals = bestQuote.decimals;
        }
      }

      // If no accounts found, try DLMM discovery
      if (!poolTokenAccount || !poolQuoteAccount) {
        const dlmmResult = await this.discoverDLMMReserves(config.pool, mint);
        
        if (dlmmResult) {
          poolTokenAccount = dlmmResult.tokenAccount;
          poolQuoteAccount = dlmmResult.quoteAccount;
          tokenReserve = dlmmResult.tokenReserve;
          quoteReserve = dlmmResult.quoteReserve;
          quoteMint = dlmmResult.quoteMint;
          quoteName = dlmmResult.quoteName;
          quoteDecimals = dlmmResult.quoteDecimals;
        } else {
          return null;
        }
      }

      // CRITICAL: Price = quote per token (e.g., SOL per token)
      // This matches idlSwapParser's priceInCounter = qtyCounter / qtyTarget
      const price = tokenReserve > 0 ? quoteReserve / tokenReserve : 0;

      return {
        poolAddress: config.pool,
        poolTokenAccount,
        poolQuoteAccount,
        tokenReserve,
        quoteReserve,
        price,
        quoteMint,
        quoteName,
        quoteDecimals
      };

    } catch (error) {
      console.error(`   ❌ Pool discovery error:`, error.message);
      return null;
    }
  }

  /**
   * Onboard a single token (for runtime additions)
   */
  async onboardToken(mint, config) {
    if (this.tokens.has(mint)) {
      console.log(`⚠️  [DexScreenerStyleMonitor] Token ${config.name} already onboarded`);
      return;
    }

    console.log(`\n🆕 [DexScreenerStyleMonitor] Onboarding ${config.name} (${mint.substring(0, 8)}...)`);

    try {
      // 1. Create token data structure
      const tokenData = new TokenData(mint, config);
      this.tokens.set(mint, tokenData);

      // 2. Fetch token metadata from Jupiter
      const metadata = await this.fetchTokenMetadata(mint, config.name);
      tokenData.metadata = metadata;

      // 3. Try to load historical swaps from ChartDatabase
      const dbSwaps = await this.loadSwapsFromDatabase(mint);
      
      if (dbSwaps && dbSwaps.length > 0) {
        console.log(`✅ [DexScreenerStyleMonitor] Loaded ${dbSwaps.length} swaps from database`);
        tokenData.swaps = dbSwaps;
        
        // Check if we have full 24h of data
        const oldestSwap = dbSwaps[0].timestamp;
        const dataAge = Date.now() - oldestSwap;
        
        if (dataAge < SWAP_RETENTION_MS) {
          console.log(`⚠️  [DexScreenerStyleMonitor] Only ${(dataAge / 3600000).toFixed(1)}h of data, fetching Jupiter baseline...`);
          tokenData.jupiterBaseline = await this.fetchJupiterBaseline(mint);
        } else {
          console.log(`✅ [DexScreenerStyleMonitor] Full 24h of data available`);
        }
      } else {
        console.log(`⚠️  [DexScreenerStyleMonitor] No database swaps, fetching Jupiter baseline...`);
        tokenData.jupiterBaseline = await this.fetchJupiterBaseline(mint);
      }

      // 4. Subscribe to pool for real-time swaps
      await this.subscribeToPool(mint, config);

      this.stats.tokensMonitored++;
      console.log(`✅ [DexScreenerStyleMonitor] ${config.name} onboarded successfully\n`);

    } catch (error) {
      console.error(`❌ [DexScreenerStyleMonitor] Error onboarding ${config.name}:`, error.message);
      this.tokens.delete(mint);
    }
  }

  /**
   * Load swaps from ChartDatabase
   */
  async loadSwapsFromDatabase(mint) {
    try {
      // Get or create token database (auto-loads from file)
      const tokenDb = this.chartDatabase.getTokenDatabase(mint);
      if (!tokenDb || !tokenDb.swaps) {
        return [];
      }

      const cutoff = Date.now() - SWAP_RETENTION_MS;
      const recentSwaps = Array.from(tokenDb.swaps.values())
        .filter(swap => swap.timestamp >= cutoff)
        .sort((a, b) => a.timestamp - b.timestamp);

      return recentSwaps.map(swap => ({
        timestamp: swap.timestamp,
        type: swap.type,
        amountTokens: swap.tokenAmount || 0,
        amountSOL: swap.baseAmount || 0,
        priceSOL: swap.price || 0,
        priceUSD: swap.volumeUsd / (swap.tokenAmount || 1),
        maker: swap.maker || 'unknown',
        signature: swap.signature || 'unknown',
        slot: 0
      }));

    } catch (error) {
      console.error(`❌ [DexScreenerStyleMonitor] Error loading swaps for ${mint}:`, error.message);
      return [];
    }
  }

  /**
   * PHASE 3: Subscribe to pool for real-time swap detection
   * No longer reads reserves - initializes from liquidity baseline on first swap
   */
  async subscribeToPool(mint, config) {
    console.log(`📡 [DexScreenerStyleMonitor] Subscribing to pool for ${config.name}...`);

    try {
      // PHASE 3: Create minimal PoolData - reserves will be initialized from liquidity baseline on first swap
      const poolData = new PoolData(config.pool, mint, config);
      poolData.poolAddress = config.pool; // Ensure poolAddress is set
      
      // Get initial liquidity from tokenData (set during pool discovery)
      const tokenData = this.tokens.get(mint);
      if (tokenData) {
        // Store liquidity for baseline (from Moralis/Jupiter)
        if (tokenData.moralisLiquidity) {
          poolData.initialLiquidity = tokenData.moralisLiquidity;
        } else if (tokenData.jupiterLiquidity) {
          poolData.initialLiquidity = tokenData.jupiterLiquidity;
        } else if (tokenData.metadata?.liquidity) {
          poolData.initialLiquidity = tokenData.metadata.liquidity;
        }
      }

      this.pools.set(mint, poolData);

      // 🚀 NO STREAM RECREATION NEEDED!
      // We subscribe to DEX PROGRAMS, so all swaps are already captured
      // Just adding the token to our internal maps (done above) is enough
      console.log(`✅ [DexScreenerStyleMonitor] Token ${config.name} added to monitoring (stream captures all DEX swaps)`);

    } catch (error) {
      console.error(`❌ [DexScreenerStyleMonitor] Error subscribing to pool:`, error.message);
      throw error;
    }
  }

  /**
   * PHASE 4: Handle transaction message from gRPC stream
   * Uses IDL-based swap decoding (idlSwapParser)
   */
  async handleTransaction(msg) {
    try {
      this.globalStats.totalTransactions++;
      
      // Log every 50 transactions to show stream is working
      if (this.globalStats.totalTransactions % 50 === 0) {
        const swapRate = this.globalStats.totalTransactions > 0 
          ? ((this.globalStats.totalSwapsDetected / this.globalStats.totalTransactions) * 100).toFixed(2)
          : '0.00';
        console.log(`📊 [DexScreenerStyleMonitor] Received ${this.globalStats.totalTransactions} transactions | Swaps detected: ${this.globalStats.totalSwapsDetected} (${swapRate}% detection rate)`);
      }
      
      const txData = msg.transaction;
      if (!txData || !txData.transaction) return;
      
      // CRITICAL: Match test behavior - try to decode swaps for ALL tokens on EVERY transaction
      // Don't pre-filter by pool address - aggregator swaps may not have pool addresses in accounts
      // idlSwapParser will return null if it's not a swap, so there's no harm in trying
      // This ensures we catch ALL swaps, including those through aggregators/routers
      
      // DEBUG: Log first transaction
      if (this.globalStats.totalTransactions === 1) {
        console.log(`🔍 [DexScreenerStyleMonitor] First transaction, monitoring ${this.pools.size} pools`);
      }
      
      
      // Build transaction object for idlSwapParser (must match expected structure)
      // CRITICAL: idlSwapParser expects tx.meta at top level (for extractTokenDeltas)
      // The gRPC structure has meta nested: txData.transaction.meta or txData.transaction.transaction.meta
      const innerTx = txData.transaction?.transaction || txData.transaction;
      const meta = innerTx?.meta || txData.transaction?.meta || txData.meta;
      
      // 🔍 DEBUG: Log innerTx structure for first transaction
      if (this.globalStats.totalTransactions === 1) {
        console.log(`🔍 [DEBUG] innerTx structure:`);
        console.log(`   innerTx keys: ${innerTx ? Object.keys(innerTx).join(', ') : 'null'}`);
        console.log(`   innerTx.message exists: ${!!innerTx?.message}`);
        console.log(`   innerTx.message.instructions exists: ${!!innerTx?.message?.instructions}`);
        console.log(`   innerTx.message.accountKeys exists: ${!!innerTx?.message?.accountKeys}`);
        console.log(`   innerTx.message.staticAccountKeys exists: ${!!innerTx?.message?.staticAccountKeys}`);
      }
      
      // 🚨 CRITICAL DEBUG: Log if meta is missing (this would prevent ALL swap detection)
      if (!meta && this.globalStats.totalTransactions % 100 === 0) {
        console.log(`❌ [DEBUG] Transaction #${this.globalStats.totalTransactions} has NO META! Cannot detect swaps.`);
        console.log(`   txData keys: ${Object.keys(txData).join(', ')}`);
        console.log(`   txData.transaction keys: ${txData.transaction ? Object.keys(txData.transaction).join(', ') : 'null'}`);
        console.log(`   innerTx keys: ${innerTx ? Object.keys(innerTx).join(', ') : 'null'}`);
      }
      
      // 🔍 DEBUG: Log transaction structure for first transaction
      if (this.globalStats.totalTransactions === 1) {
        console.log(`🔍 [DEBUG] Building tx object for first transaction:`);
        console.log(`   innerTx exists: ${!!innerTx}`);
        console.log(`   meta exists: ${!!meta}`);
        console.log(`   meta.preTokenBalances: ${meta?.preTokenBalances?.length || 0}`);
        console.log(`   meta.postTokenBalances: ${meta?.postTokenBalances?.length || 0}`);
        console.log(`   txData.slot: ${txData.slot}`);
        console.log(`   msg.slot: ${msg.slot}`);
        console.log(`   txData.blockTime: ${txData.blockTime}`);
        console.log(`   msg.blockTime: ${msg.blockTime}`);
      }
      
      // Extract signature and convert to string if needed
      let signature = innerTx?.signatures?.[0] || innerTx?.signature || txData.transaction?.signatures?.[0] || txData.transaction?.signature || msg.signature;
      
      // Convert signature to string if it's a Buffer or array
      if (signature) {
        if (Buffer.isBuffer(signature)) {
          signature = bs58.encode(signature);
        } else if (Array.isArray(signature)) {
          signature = bs58.encode(Buffer.from(signature));
        } else if (typeof signature !== 'string') {
          // Try to convert to string
          signature = signature.toString();
        }
      }
      
      const tx = {
        transaction: innerTx,
        meta: meta, // CRITICAL: meta must be at top level
        signature: signature,
        slot: txData.slot || msg.slot,
        blockTime: txData.blockTime || msg.blockTime
      };
      
      // 🔍 DEBUG: Log final tx structure for first transaction
      if (this.globalStats.totalTransactions === 1) {
        console.log(`🔍 [DEBUG] Final tx object:`);
        console.log(`   tx.transaction exists: ${!!tx.transaction}`);
        console.log(`   tx.meta exists: ${!!tx.meta}`);
        console.log(`   tx.signature type: ${typeof tx.signature}, value: ${tx.signature ? (typeof tx.signature === 'string' ? tx.signature.substring(0, 16) : 'NOT STRING') : 'null'}...`);
        console.log(`   tx.slot: ${tx.slot}`);
        console.log(`   tx.blockTime: ${tx.blockTime}`);
      }
      
      // 🚨 CRITICAL: If no meta, skip swap decoding (matches test file behavior)
      if (!meta) {
        // Log EVERY missing meta (not just every 100) for first 10 transactions
        if (this.globalStats.totalTransactions <= 10) {
          console.log(`❌ [CRITICAL] Transaction #${this.globalStats.totalTransactions} has NO META! This prevents ALL swap detection.`);
          console.log(`   txData structure:`, {
            hasTransaction: !!txData.transaction,
            hasMeta: !!txData.meta,
            innerTxKeys: innerTx ? Object.keys(innerTx).slice(0, 5) : 'null'
          });
        }
        return; // No meta = no token balance changes = can't detect swap
      }
      
      // 🔍 DEBUG: Log meta structure for first few transactions
      if (this.globalStats.totalTransactions <= 5) {
        const preBalances = meta.preTokenBalances?.length || 0;
        const postBalances = meta.postTokenBalances?.length || 0;
        console.log(`✅ [DEBUG] Transaction #${this.globalStats.totalTransactions} HAS META: pre=${preBalances}, post=${postBalances}`);
      }
      
      // Try to decode swap for ALL monitored tokens (match test behavior)
      let decodedAnySwap = false;
      const FARTCOIN_MINT = '9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump';
      const FARTCOIN_POOL = 'Bzc9NZfMqkXR6fz1DBph7BDf9BroyEf6pnzESP7v5iiw';
      
      // 🔍 DEBUG: Check if transaction involves Fartcoin's pool
      const txAccounts = innerTx?.message?.accountKeys || [];
      const involvesFartcoinPool = txAccounts.some(acc => {
        const addr = typeof acc === 'string' ? acc : (acc.pubkey || acc.toString());
        return addr === FARTCOIN_POOL;
      });
      
      // 🔍 DEBUG: Log pool count for first transaction
      if (this.globalStats.totalTransactions === 1) {
        console.log(`🔍 [DEBUG] Checking ${this.pools.size} pools for swaps in first transaction`);
      }
      
      let tokensChecked = 0;
      let swapsDecoded = 0;
      // 🔍 DEBUG: Extract all account addresses from transaction (for filtering)
      const txAccountAddresses = new Set();
      if (innerTx?.message) {
        // Try to extract account addresses from the transaction
        const message = innerTx.message;
        
        // Helper to convert key to base58 string
        const keyToBase58 = (key) => {
          if (typeof key === 'string') return key;
          if (Buffer.isBuffer(key) || key instanceof Uint8Array) {
            return bs58.encode(key);
          }
          if (key?.type === 'Buffer' && Array.isArray(key.data)) {
            return bs58.encode(Uint8Array.from(key.data));
          }
          if (key?.pubkey) return keyToBase58(key.pubkey);
          return null;
        };
        
        if (message.accountKeys) {
          for (const key of message.accountKeys) {
            try {
              const addr = keyToBase58(key);
              if (addr && addr.length >= 32) {
                txAccountAddresses.add(addr);
              }
            } catch (e) {
              // Skip invalid keys
            }
          }
        }
        if (message.staticAccountKeys) {
          for (const key of message.staticAccountKeys) {
            try {
              const addr = keyToBase58(key);
              if (addr && addr.length >= 32) {
                txAccountAddresses.add(addr);
              }
            } catch (e) {
              // Skip invalid keys
            }
          }
        }
      }
      
      // 🔍 DEBUG: Log account addresses AND token balance mints for first few transactions
      if (this.globalStats.totalTransactions <= 3) {
        console.log(`🔍 [DEBUG] Transaction #${this.globalStats.totalTransactions} details:`);
        console.log(`   Account addresses: ${txAccountAddresses.size}`);
        console.log(`   Sample addresses: ${Array.from(txAccountAddresses).slice(0, 5).map(a => a.substring?.(0, 8) + '...' || 'invalid').join(', ')}`);
        
        // Show raw key type for debugging
        const firstKey = innerTx?.message?.accountKeys?.[0];
        console.log(`   First raw key type: ${typeof firstKey}, isBuffer: ${Buffer.isBuffer(firstKey)}, isArray: ${Array.isArray(firstKey)}`);
        
        // 🔑 CRITICAL: Show what TOKEN MINTS are in the balance changes
        // This is what we ACTUALLY use for swap detection!
        const balanceMints = new Set();
        for (const bal of meta?.preTokenBalances || []) {
          if (bal.mint) balanceMints.add(bal.mint);
        }
        for (const bal of meta?.postTokenBalances || []) {
          if (bal.mint) balanceMints.add(bal.mint);
        }
        console.log(`   Token mints in balances: ${balanceMints.size}`);
        console.log(`   Mints: ${Array.from(balanceMints).map(m => m.substring(0, 8) + '...').join(', ')}`);
        
        // Check if ANY of our monitored tokens are in this transaction
        const monitoredMintsInTx = [];
        for (const [mint] of this.pools.entries()) {
          if (balanceMints.has(mint)) {
            const tokenData = this.tokens.get(mint);
            monitoredMintsInTx.push(tokenData?.config?.name || mint.substring(0, 8));
          }
        }
        if (monitoredMintsInTx.length > 0) {
          console.log(`   🎯 MONITORED TOKENS IN TX: ${monitoredMintsInTx.join(', ')}`);
        } else {
          console.log(`   ⚠️ No monitored tokens in this transaction's balance changes`);
        }
      }
      
      // 🚨 CRITICAL FIX: Build set of token mints from balance changes (already strings!)
      // This is more reliable than checking pool addresses (which require Buffer conversion)
      const balanceMints = new Set();
      for (const bal of meta?.preTokenBalances || []) {
        if (bal.mint) balanceMints.add(bal.mint);
      }
      for (const bal of meta?.postTokenBalances || []) {
        if (bal.mint) balanceMints.add(bal.mint);
      }
      
      for (const [mint, poolData] of this.pools.entries()) {
        tokensChecked++;
        if (!poolData.poolAddress) continue; // Skip tokens without pool addresses
        
        // 🚨 CRITICAL: Only try to decode if this token's MINT is in the balance changes
        // This is more reliable than checking pool addresses
        if (!balanceMints.has(mint)) continue; // Skip tokens not involved in this transaction
        
        const tokenData = this.tokens.get(mint);
        if (!tokenData) continue;
        
        // 🔍 DEBUG: Log when we find a matching token
        const tokenName = tokenData?.config?.name || mint.substring(0, 8);
        if (this.globalStats.totalTransactions <= 10) {
          console.log(`🎯 [DEBUG] TX #${this.globalStats.totalTransactions} - MATCH: ${tokenName} mint found in balances!`);
        }
        
        // 🔍 DEBUG: Log Fartcoin transactions
        const isFartcoin = mint === FARTCOIN_MINT;
        if (isFartcoin && involvesFartcoinPool && this.globalStats.totalTransactions % 10 === 0) {
          console.log(`🔍 [DEBUG] Fartcoin transaction #${this.globalStats.totalTransactions}: pool=${poolData.poolAddress.substring(0, 8)}...`);
        }
        
        // Get token price cache (for USD calculations)
        const tokenPriceCache = new Map();
        if (tokenData.metadata?.usdPrice) {
          tokenPriceCache.set(mint, tokenData.metadata.usdPrice);
        }
        
        // 🚀 USE IDL-BASED PARSER (uses "largest delta" algorithm)
        let swap = idlSwapParser.parseSwap(tx, mint, this.solPriceUSD, poolData.poolAddress);
        
        // 🔍 Log every 100th swap attempt for monitoring
        if (this.globalStats.totalTransactions % 100 === 0) {
          const tokenName = tokenData.config?.name || mint.substring(0, 8);
          console.log(`📈 [SWAP CHECK] TX#${this.globalStats.totalTransactions} ${tokenName}: ${swap ? `✅ ${swap.type} $${swap.volumeUsd?.toFixed(2)}` : '❌ no swap'}`);
        }
        
        // 🔍 DEBUG: Log ALL swap attempts for first 5 transactions AND first 10 tokens
        if (this.globalStats.totalTransactions <= 5 && tokensChecked <= 10) {
          console.log(`🔍 [DEBUG] TX #${this.globalStats.totalTransactions} - Token #${tokensChecked} ${tokenData.config?.name || mint.substring(0, 8)}: swap=${swap ? 'DECODED' : 'null'}`);
          if (swap) {
            console.log(`   ✅ Swap decoded: type=${swap.type}, price=${swap.priceUsd}, volume=${swap.volumeUsd}`);
          } else {
            // Log why swap wasn't decoded
            const hasMessage = !!tx.transaction?.message;
            const hasInstructions = !!tx.transaction?.message?.instructions;
            const hasAccountKeys = !!tx.transaction?.message?.accountKeys;
            const poolInTx = txAccountAddresses.has(poolData.poolAddress);
            console.log(`   ❌ No swap: hasMessage=${hasMessage}, hasInstructions=${hasInstructions}, hasAccountKeys=${hasAccountKeys}, poolInTx=${poolInTx}, poolAddress=${poolData.poolAddress.substring(0, 8)}...`);
          }
        }
        
        // 🔍 DEBUG: Log if Fartcoin swap decoded - INCLUDE METHOD to verify IDL parser
        if (isFartcoin && swap) {
          console.log(`✅ [DEBUG] Fartcoin swap decoded! method=${swap.method || 'UNKNOWN'}, type=${swap.type}, price=${swap.priceUsd}, volume=${swap.volumeUsd}, pool=${swap.poolAddress}`);
        }
        
        if (swap) {
          decodedAnySwap = true;
          swapsDecoded++;
          
          // 🚨 CRITICAL FIX: Set poolAddress from poolData since we know which pool this token uses
          // IDL parser may return 'unknown' if it can't determine the pool from the transaction
          // But we KNOW the pool because we're iterating through this.pools!
          if (!swap.poolAddress || swap.poolAddress === 'unknown') {
            swap.poolAddress = poolData.poolAddress;
          }
          
          // 🚨 CRITICAL FILTERS: Match test-transaction-level-decoding.mjs exactly
          // These filters achieved 98% accuracy in testing
          
          const tokenName = tokenData.config?.name || mint.substring(0, 8);
          const swapInfo = `${tokenName} ${swap.type} $${swap.volumeUsd?.toFixed(2) || '0'} @ $${swap.priceUsd?.toFixed(6) || '0'}`;
          
          // Pool address is now guaranteed to be set from poolData above
          // No need to filter by 'unknown' pool anymore
          
          // 🚨 FILTER 1: ABSOLUTE PRICE SANITY CHECK - VERY RELAXED
          // Only reject truly invalid prices
          if (swap.priceUsd < 0.0000000001) {
            console.log(`❌ FILTER [too low]: ${swapInfo} - price essentially zero`);
            continue;
          }
          if (swap.priceUsd > 10000000) {
            console.log(`❌ FILTER [too high]: ${swapInfo} - price > $10M`);
            continue;
          }
          
          // 🚨 FILTER 2: DISABLED - memecoins are too volatile for price outlier filtering
          // Users want to see ALL swaps regardless of price deviation
          // const expectedPrice = tokenData.lastPriceUSD || tokenData.metadata?.usdPrice || 0;
          
          // 🚨 FILTER 3: DUST VOLUME - Only filter true dust
          if (swap.volumeUsd && swap.volumeUsd < 0.01) {
            continue; // Skip sub-cent volume
          }
          
          // ✅ PASSED ALL FILTERS
          console.log(`✅ PASSED: ${swapInfo} (pool: ${swap.poolAddress?.substring(0,8)}...)`);


          
          // Log large swaps for debugging (user reported missing large swaps)
          if (swap.volumeUsd && swap.volumeUsd >= 100) {
            console.log(`💰 [DexScreenerStyleMonitor] Large swap detected: ${tokenData.config.name} - $${swap.volumeUsd.toFixed(2)} (${swap.type})`);
          }
          
          // Update global counters
          this.globalStats.totalSwapsDetected++;
          if (swap.type === 'BUY') {
            this.globalStats.totalBuys++;
          } else {
            this.globalStats.totalSells++;
          }
          
          // Log first few swaps to confirm detection is working
          if (this.globalStats.totalSwapsDetected <= 5) {
            console.log(`✅ [DexScreenerStyleMonitor] Swap #${this.globalStats.totalSwapsDetected} detected: ${tokenData.config?.name || mint.substring(0, 8)} (${swap.type}) - $${swap.volumeUsd?.toFixed(2) || 'N/A'}`);
          }
          
          // 🚨 TRADE-GRADE FIX: Show ALL swaps (that pass filters), and use smoothed prices for display to prevent spikes
          // Users need to see ALL legitimate swaps to make informed trading decisions
          // Use median prices for currentPrice/marketCap to prevent wild spikes
          
          // Only reject if price is truly invalid (NaN, Infinity, negative, or zero)
          if (!swap.priceUsd || !isFinite(swap.priceUsd) || swap.priceUsd <= 0) {
            console.log(`⚠️  [${tokenData.config?.name || mint.substring(0, 8)}] REJECTING swap: truly invalid price (${swap.priceUsd}) - SKIPPING`);
            continue; // Skip this swap, check other tokens
          }
          
          // Helper function to calculate median (for smoothing prices)
          const calculateMedian = (arr) => {
            if (arr.length === 0) return 0;
            const sorted = [...arr].sort((a, b) => a - b);
            const mid = Math.floor(sorted.length / 2);
            return sorted.length % 2 === 0 
              ? (sorted[mid - 1] + sorted[mid]) / 2 
              : sorted[mid];
          };
          
          // 🚨 CRITICAL: Use ACTUAL swap price (like test-transaction-level-decoding.mjs)
          // The 3x filter + $1 min volume is enough to prevent bad prices
          // Median smoothing causes price lag and doesn't help with real volatility
          tokenData.lastPriceUSD = swap.priceUsd; // Use actual swap price directly
          tokenData.lastPriceUpdate = Date.now();
          
          // Swap price is already set correctly (no smoothing needed)
          
          // Update reserves from swap deltas (for liquidity calculation, but don't use for price)
          this.updateReservesFromSwap(poolData, swap);
          
          // Display the swap (async - saves to database)
          await this.displaySwapFromTransaction(mint, poolData, swap, txData);
        }
      }
      
      // Note: No need to log "no swap decoded" - idlSwapParser returns null for non-swaps, which is expected
    } catch (error) {
      console.error(`❌ [DexScreenerStyleMonitor] Error handling transaction:`, error.message);
      if (error.stack) {
        console.error(`   Stack:`, error.stack.split('\n').slice(0, 3).join('\n'));
      }
    }
  }
  
  /**
   * Extract all account addresses from a transaction
   * Used to check if transaction involves any of our monitored pools
   */
  extractTransactionAccounts(txData) {
    try {
      const accounts = [];
      
      // Helper function to convert account key to base58 string
      const toBase58 = (key) => {
        try {
          if (typeof key === 'string') {
            // Already a string - validate it's base58
            if (key.length >= 32 && key.length <= 44) {
              return key;
            }
          } else if (Buffer.isBuffer(key)) {
            // Convert Buffer to base58
            return bs58.encode(key);
          } else if (key?.data) {
            // Uint8Array or similar
            return bs58.encode(Buffer.from(key.data));
          } else if (key?.pubkey) {
            // Object with pubkey field
            if (typeof key.pubkey === 'string') {
              return key.pubkey;
            } else {
              return bs58.encode(Buffer.from(key.pubkey));
            }
          } else if (key instanceof Uint8Array) {
            return bs58.encode(Buffer.from(key));
          }
        } catch (e) {
          // If conversion fails, try PublicKey
          try {
            return new PublicKey(key).toBase58();
          } catch (e2) {
            return null;
          }
        }
        return null;
      };
      
      // gRPC transaction structure: msg.transaction.transaction.message (nested)
      const innerTransaction = txData.transaction?.transaction;
      const message = innerTransaction?.message || txData.transaction?.message;
      
      if (!message) {
        // DEBUG: Log structure issue (first few only)
        if (this.globalStats.totalTransactions <= 3) {
          console.log(`⚠️  [DexScreenerStyleMonitor] No message found in transaction structure`);
          console.log(`   txData keys:`, Object.keys(txData));
          console.log(`   txData.transaction keys:`, txData.transaction ? Object.keys(txData.transaction) : 'null');
          if (txData.transaction?.transaction) {
            console.log(`   txData.transaction.transaction keys:`, Object.keys(txData.transaction.transaction));
          }
        }
        return accounts;
      }
      
      // Try staticAccountKeys first (versioned transactions - v0)
      if (message.staticAccountKeys && message.staticAccountKeys.length > 0) {
        for (const key of message.staticAccountKeys) {
          const pubkey = toBase58(key);
          if (pubkey && pubkey.length >= 32) {
            accounts.push(pubkey);
          }
        }
      }
      
      // Fallback to accountKeys (legacy transactions)
      if (accounts.length === 0 && message.accountKeys && message.accountKeys.length > 0) {
        for (const key of message.accountKeys) {
          const pubkey = toBase58(key);
          if (pubkey && pubkey.length >= 32) {
            accounts.push(pubkey);
          }
        }
      }
      
      // Check loadedAddresses for v0 transactions with address lookup tables
      if (message.loadedAddresses?.writable) {
        for (const addr of message.loadedAddresses.writable) {
          const pubkey = toBase58(addr);
          if (pubkey && pubkey.length >= 32) {
            accounts.push(pubkey);
          }
        }
      }
      if (message.loadedAddresses?.readonly) {
        for (const addr of message.loadedAddresses.readonly) {
          const pubkey = toBase58(addr);
          if (pubkey && pubkey.length >= 32) {
            accounts.push(pubkey);
          }
        }
      }
      
      return accounts;
    } catch (error) {
      console.error(`❌ [DexScreenerStyleMonitor] Error extracting transaction accounts:`, error.message);
      if (error.stack) {
        console.error(`   Stack:`, error.stack.split('\n').slice(0, 3).join('\n'));
      }
      return [];
    }
  }
  
  /**
   * PHASE 3: Update pool reserves from swap deltas
   * Tracks reserves dynamically instead of reading from account updates
   */
  updateReservesFromSwap(poolData, swap) {
    // Get or initialize reserves tracking
    let reserves = this.poolReserves.get(poolData.poolAddress);
    
    // Initialize reserves if first swap (use Moralis/Jupiter liquidity as baseline)
    if (!reserves || !reserves.initialized) {
      const tokenData = this.tokens.get(poolData.tokenMint);
      let initialLiquidity = 0;
      
      // Priority 1: Use Moralis liquidity if available
      if (tokenData?.moralisLiquidity) {
        initialLiquidity = tokenData.moralisLiquidity;
      }
      // Priority 2: Use Jupiter liquidity
      else if (tokenData?.jupiterLiquidity) {
        initialLiquidity = tokenData.jupiterLiquidity;
      }
      // Priority 3: Use metadata liquidity
      else if (tokenData?.metadata?.liquidity) {
        initialLiquidity = tokenData.metadata.liquidity;
      }
      
      // Calculate initial reserves from liquidity baseline
      if (initialLiquidity > 0) {
        const quoteMint = swap.counterMint || poolData.quoteMint || SOL_MINT;
        let initialQuoteReserve = 0;
        
        if (quoteMint === SOL_MINT) {
          initialQuoteReserve = initialLiquidity / (this.solPriceUSD * 2);
        } else if (quoteMint === 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' || 
                   quoteMint === 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB') {
          initialQuoteReserve = initialLiquidity / 2;
        }
        
        // CRITICAL: Use Jupiter baseline price instead of swap price for initialization
        // swap.price might be from a single transaction and not reflect true pool state
        let baselinePrice = 0;
        if (tokenData?.metadata?.usdPrice && tokenData.metadata.usdPrice > 0) {
          // Jupiter price is in USD, convert to SOL per token if needed
          if (quoteMint === SOL_MINT) {
            baselinePrice = tokenData.metadata.usdPrice / this.solPriceUSD;
          } else {
            baselinePrice = tokenData.metadata.usdPrice; // Already in USD for stablecoin pools
          }
        } else if (swap.priceUsd > 0 && swap.price > 0) {
          // Fallback to swap price if Jupiter baseline not available
          baselinePrice = swap.price;
        } else if (poolData.price && poolData.price > 0) {
          // Last resort: use pool data price
          baselinePrice = poolData.price;
        }
        
        // CRITICAL: If this is the first swap, use swap's actual amounts to initialize reserves
        // This is more accurate than calculating from liquidity + baseline price
        // Swap amounts are from the actual transaction, so they reflect true pool state
        if (swap.tokenAmount > 0 && swap.baseAmount > 0 && swap.price > 0) {
          // Use swap's actual price to calculate initial reserves
          // We know: price = quoteReserve / tokenReserve
          // And: liquidity = 2 * quoteReserve * quotePrice (for SOL pools)
          // So: quoteReserve = liquidity / (2 * quotePrice)
          // And: tokenReserve = quoteReserve / price
          const swapPrice = swap.price; // Already in quote token per token
          const initialTokenReserve = initialQuoteReserve / swapPrice;
          
          reserves = {
            tokenReserve: initialTokenReserve,
            quoteReserve: initialQuoteReserve,
            quoteMint: quoteMint,
            quoteDecimals: quoteMint === SOL_MINT ? 9 : 6,
            initialLiquidity: initialLiquidity,
            initialized: true
          };
        } else {
          // Fallback: Use baseline price if swap amounts not available
          const initialTokenReserve = baselinePrice > 0 
            ? initialQuoteReserve / baselinePrice 
            : poolData.tokenReserve || 0;
          
          reserves = {
            tokenReserve: initialTokenReserve,
            quoteReserve: initialQuoteReserve,
            quoteMint: quoteMint,
            quoteDecimals: quoteMint === SOL_MINT ? 9 : 6,
            initialLiquidity: initialLiquidity,
            initialized: true
          };
        }
      } else {
        // Fallback: use current pool data
        reserves = {
          tokenReserve: poolData.tokenReserve || 0,
          quoteReserve: poolData.quoteReserve || 0,
          quoteMint: poolData.quoteMint || SOL_MINT,
          quoteDecimals: poolData.quoteDecimals || 9,
          initialLiquidity: 0,
          initialized: true
        };
      }
      
      this.poolReserves.set(poolData.poolAddress, reserves);
    }
    
    // Update reserves based on swap deltas
    if (swap.type === 'BUY') {
      // BUY: user sends quote (SOL/USDC), receives tokens
      // Pool: quoteReserve increases, tokenReserve decreases
      reserves.quoteReserve += swap.baseAmount || 0;
      reserves.tokenReserve -= swap.tokenAmount || 0;
    } else if (swap.type === 'SELL') {
      // SELL: user sends tokens, receives quote (SOL/USDC)
      // Pool: tokenReserve increases, quoteReserve decreases
      reserves.tokenReserve += swap.tokenAmount || 0;
      reserves.quoteReserve -= swap.baseAmount || 0;
    }
    
    // Ensure reserves don't go negative
    reserves.tokenReserve = Math.max(0, reserves.tokenReserve);
    reserves.quoteReserve = Math.max(0, reserves.quoteReserve);
    
    // Update pool data
    poolData.tokenReserve = reserves.tokenReserve;
    poolData.quoteReserve = reserves.quoteReserve;
    
    // CRITICAL: Use swap's actual price if available (more accurate than calculating from reserves)
    // Reserve tracking can accumulate errors, but swap price is from actual transaction
    // ALWAYS prefer swap.priceUsd converted to SOL per token, or swap.price directly
    if (swap.priceUsd && swap.priceUsd > 0 && poolData.quoteMint === SOL_MINT) {
      // Convert USD price to SOL per token (more accurate than using swap.price which might be stale)
      poolData.price = swap.priceUsd / this.solPriceUSD;
    } else if (swap.price && swap.price > 0) {
      // Use swap's actual price (in quote token per token)
      poolData.price = swap.price;
    } else {
      // Fallback: Calculate from reserves if swap price not available
      // Price = quote per token (e.g., SOL per token)
      // This matches idlSwapParser's priceInCounter = qtyCounter / qtyTarget
      // CRITICAL: Only use reserves if they're valid (both > 0)
      if (reserves.tokenReserve > 0 && reserves.quoteReserve > 0) {
        poolData.price = reserves.quoteReserve / reserves.tokenReserve;
      } else {
        // Don't update price if reserves are invalid - keep previous price
        // This prevents price from jumping to 0 or wrong values
      }
    }
    
    poolData.quoteMint = reserves.quoteMint;
    poolData.lastUpdate = Date.now();
    
    // Log price update for debugging (first few swaps and when price seems wrong)
    const priceUSD = poolData.quoteMint === SOL_MINT 
      ? poolData.price * this.solPriceUSD 
      : poolData.price;
    const swapPriceUSD = swap.priceUsd || (swap.price && poolData.quoteMint === SOL_MINT ? swap.price * this.solPriceUSD : swap.price);
    
    // Log if price seems wrong (way off from swap price)
    const priceDiff = Math.abs(priceUSD - (swapPriceUSD || 0));
    const priceRatio = swapPriceUSD > 0 ? priceUSD / swapPriceUSD : 0;
    const shouldLog = this.globalStats.totalSwapsDetected <= 5 || 
                      (swapPriceUSD > 0 && (priceRatio > 2 || priceRatio < 0.5)); // Price is 2x off or more
    
    if (shouldLog) {
      console.log(`   💰 [Price Update] ${poolData.quoteMint === SOL_MINT ? 'SOL' : 'USD'} price: ${poolData.price.toFixed(10)} → $${priceUSD.toFixed(6)} (swap: $${swapPriceUSD?.toFixed(6) || 'N/A'})`);
      if (swapPriceUSD > 0 && (priceRatio > 2 || priceRatio < 0.5)) {
        console.log(`   ⚠️  [Price Mismatch] Pool price is ${priceRatio.toFixed(2)}x different from swap price! Reserves: ${reserves.tokenReserve.toFixed(2)} tokens / ${reserves.quoteReserve.toFixed(2)} ${poolData.quoteMint === SOL_MINT ? 'SOL' : 'USD'}`);
      }
    }
    
    this.poolReserves.set(poolData.poolAddress, reserves);
  }
  
  /**
   * 🚨 DEX-GRADE: Refresh pool reserves from RPC (like test file)
   * Reads CURRENT reserves from token accounts to ensure price accuracy
   */
  async refreshPoolReservesFromRPC() {
    if (this.pools.size === 0) return;
    
    // Refresh reserves for all pools (batch in parallel)
    const refreshPromises = [];
    for (const [mint, poolData] of this.pools.entries()) {
      if (!poolData.poolTokenAccount || !poolData.poolQuoteAccount) continue;
      
      refreshPromises.push(
        this.refreshSinglePoolReserves(mint, poolData).catch(err => {
          // Silently fail for individual pools (don't spam logs)
          if (this.globalStats.totalSwapsDetected <= 5) {
            console.error(`   ⚠️  Error refreshing reserves for ${poolData.config?.name || mint.substring(0, 8)}:`, err.message);
          }
        })
      );
    }
    
    // Wait for all refreshes (with timeout)
    await Promise.allSettled(refreshPromises);
  }
  
  /**
   * Refresh reserves for a single pool from RPC
   */
  async refreshSinglePoolReserves(mint, poolData) {
    try {
      // Read CURRENT reserves from token accounts (like test file)
      const tokenAccountInfo = await this.connection.getParsedAccountInfo(new PublicKey(poolData.poolTokenAccount));
      const quoteAccountInfo = await this.connection.getParsedAccountInfo(new PublicKey(poolData.poolQuoteAccount));
      
      let tokenReserve = 0;
      let quoteReserve = 0;
      
      if (tokenAccountInfo?.value?.data?.parsed?.info?.tokenAmount) {
        tokenReserve = tokenAccountInfo.value.data.parsed.info.tokenAmount.uiAmount || 0;
      }
      
      if (quoteAccountInfo?.value?.data?.parsed?.info?.tokenAmount) {
        quoteReserve = quoteAccountInfo.value.data.parsed.info.tokenAmount.uiAmount || 0;
      }
      
      // Only update if we got valid reserves
      if (tokenReserve > 0 && quoteReserve > 0) {
        // Update pool reserves tracking
        const reserves = this.poolReserves.get(poolData.poolAddress);
        if (reserves) {
          reserves.tokenReserve = tokenReserve;
          reserves.quoteReserve = quoteReserve;
          reserves.lastRefresh = Date.now();
        } else {
          // Initialize if not exists
          this.poolReserves.set(poolData.poolAddress, {
            tokenReserve,
            quoteReserve,
            quoteMint: poolData.quoteMint || SOL_MINT,
            quoteDecimals: poolData.quoteDecimals || 9,
            lastRefresh: Date.now()
          });
        }
        
        // Update poolData
        poolData.tokenReserve = tokenReserve;
        poolData.quoteReserve = quoteReserve;
        
        // 🚨 CRITICAL: Calculate price from CURRENT reserves (most accurate)
        const priceInQuote = quoteReserve / tokenReserve;
        poolData.price = priceInQuote;
        poolData.lastUpdate = Date.now();
        
        // Update tokenData.lastPriceUSD from pool reserves (for getTokenMetrics)
        const tokenData = this.tokens.get(mint);
        if (tokenData) {
          const priceUSD = poolData.quoteMint === SOL_MINT 
            ? priceInQuote * this.solPriceUSD 
            : priceInQuote;
          tokenData.lastPriceUSD = priceUSD;
          tokenData.lastPriceUpdate = Date.now();
        }
      }
    } catch (error) {
      // Silently fail (don't spam logs)
      throw error;
    }
  }
  
  /**
   * PHASE 3: Display swap from transaction-level decoding
   */
  async displaySwapFromTransaction(mint, poolData, swap, txData) {
    try {
      const tokenData = this.tokens.get(mint);
      if (!tokenData) return;
      
      // Get reserves for liquidity calculation
      const reserves = this.poolReserves.get(poolData.poolAddress);
      
      // Calculate liquidity from current reserves
      let liquidity = 0;
      if (reserves && reserves.quoteReserve > 0) {
        if (reserves.quoteMint === SOL_MINT) {
          liquidity = reserves.quoteReserve * this.solPriceUSD * 2;
        } else if (reserves.quoteMint === 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' || 
                   reserves.quoteMint === 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB') {
          liquidity = reserves.quoteReserve * 2;
        }
      }
      
      // Calculate market cap - Use circulating supply * price (most accurate)
      let marketCap = 0;
      const metadata = tokenData.metadata;
      
      // 🚨 FIX: Market cap = circulating supply * current price (like DexScreener)
      const circSupply = metadata?.circSupply || metadata?.totalSupply || 0;
      
      if (circSupply > 0 && swap.priceUsd > 0 && isFinite(swap.priceUsd)) {
        // Market cap = circulating supply * current price
        marketCap = circSupply * swap.priceUsd;
      } else {
        // Fallback: Scale Jupiter baseline by price change
        const jupiterBaseline = tokenData.jupiterBaselineMarketCap || metadata?.marketCap || 0;
        const baselinePrice = tokenData.lastBaselinePrice || metadata?.usdPrice || 0;
        
        if (jupiterBaseline > 0 && baselinePrice > 0 && swap.priceUsd > 0) {
          marketCap = jupiterBaseline * (swap.priceUsd / baselinePrice);
        } else {
          marketCap = jupiterBaseline || metadata?.marketCap || 0;
        }
      }
      
      // Sanity check
      if (marketCap <= 0 || !isFinite(marketCap)) {
        marketCap = metadata?.marketCap || 0;
      }
      
      // 🔍 DEBUG: Log market cap for first few swaps
      if (this.globalStats.totalSwapsDetected <= 5) {
        console.log(`   📊 MCap: supply=${circSupply?.toLocaleString() || 'N/A'}, price=$${swap.priceUsd?.toFixed(6)}, mcap=$${(marketCap/1e6)?.toFixed(2)}M`);
      }
      
      // Create swap record (must match format expected by calculations)
      // Store ACTUAL swap price (for swap table display) but use smoothed price for metrics
      const swapRecord = {
        timestamp: swap.timestamp || Date.now(),
        type: swap.type, // 'BUY' or 'SELL'
        tokenAmount: swap.tokenAmount || 0,
        baseAmount: swap.baseAmount || 0, // SOL/USDC amount
        price: swap.price || 0, // Price in quote token (SOL/USDC)
        priceUSD: swap.priceUsd || 0, // ACTUAL swap price in USD (for display)
        volumeUSD: swap.volumeUsd || 0, // Volume in USD (used by calculateVolume)
        maker: swap.maker || 'Unknown', // Wallet address (used by calculateUniqueMakers)
        signature: swap.signature || 'Unknown',
        slot: swap.slot || (txData.slot ? Number(txData.slot) : 0),
        marketCap: marketCap, // Market cap at time of swap (calculated from smoothed price)
        liquidity: liquidity, // Liquidity at time of swap
        poolAddress: poolData.poolAddress || 'UNKNOWN' // Add poolAddress for database storage
      };
      
      // Add to token's swap history
      tokenData.swaps.push(swapRecord);
      
      // 🚨 CRITICAL: Limit in-memory swap storage to prevent /tmp overflow
      // Keep only last 24h of swaps, but also enforce MAX_SWAPS_PER_TOKEN limit
      const MAX_SWAPS_PER_TOKEN = 1000; // Max swaps per token in memory
      const cutoff = Date.now() - SWAP_RETENTION_MS;
      tokenData.swaps = tokenData.swaps.filter(s => s.timestamp >= cutoff);
      
      // If still too many swaps, keep only the most recent ones
      if (tokenData.swaps.length > MAX_SWAPS_PER_TOKEN) {
        tokenData.swaps = tokenData.swaps.slice(-MAX_SWAPS_PER_TOKEN);
      }
      
      // Save to database (persistent storage)
      // Note: Database should handle its own cleanup/limits
      await this.saveSwapToDatabase(mint, swapRecord);
      
      // Broadcast to WebSocket clients (real-time updates for frontend)
      if (this.webSocketServer) {
        console.log(`📤 [BROADCAST] Sending swap to frontend: ${tokenData.config.name} ${swap.type} $${swap.volumeUsd?.toFixed(2)}`);
        this.broadcastSwap(mint, swapRecord);
        // Also broadcast updated metrics (volume, TX count, makers, etc.)
        this.broadcastMetrics(mint);
      } else {
        console.warn(`⚠️ [BROADCAST] WebSocket server not available - swap not broadcast!`);
      }
      
      // Log swap with parser method
      const swapType = swap.type === 'BUY' ? '🟢 BUY' : '🔴 SELL';
      const mcapStr = marketCap > 0 ? `$${(marketCap / 1000000).toFixed(2)}M` : 'N/A';
      const parserMethod = swap.method || 'UNKNOWN';
      console.log(`📊 ${tokenData.config.name} (${swapType}) [${parserMethod}] | ${swap.tokenAmount.toLocaleString()} tokens | $${swap.priceUsd.toFixed(6)} | Vol: $${swap.volumeUsd.toFixed(2)} | MCap: ${mcapStr}`);

    } catch (error) {
      console.error(`❌ [DexScreenerStyleMonitor] Error displaying swap:`, error.message);
    }
  }

  /**
   * Handle account update message from gRPC stream
   * Detects swaps from pool reserve changes
   */
  handleAccountUpdate(msg) {
    try {
      this.globalStats.totalAccountUpdates++;
      
      // Log every 100 account updates to show stream is working
      if (this.globalStats.totalAccountUpdates % 100 === 0) {
        console.log(`📊 [DexScreenerStyleMonitor] Received ${this.globalStats.totalAccountUpdates} account updates`);
      }
      
      if (!msg.account) return;

      const accountUpdate = msg.account;
      const accountData = accountUpdate.account?.data;
      if (!accountData) return;

      // Decode account key to figure out which pool this belongs to
      const accountKey = accountUpdate.account?.pubkey ? 
        Buffer.from(accountUpdate.account.pubkey).toString('base64') : null;
      let decodedKey = null;
      if (accountKey) {
        try {
          const keyBuffer = Buffer.from(accountKey, 'base64');
          decodedKey = new PublicKey(keyBuffer).toBase58();
        } catch (e) {
          return;
        }
      }
      
      // Find which pool this account belongs to
      let mint = null;
      let poolData = null;
      let tokenData = null;
      
      for (const [tokenMint, pool] of this.pools.entries()) {
        if (decodedKey === pool.poolTokenAccount || decodedKey === pool.poolQuoteAccount) {
          mint = tokenMint;
          poolData = pool;
          tokenData = this.tokens.get(tokenMint);
          break;
        }
      }
      
      // Log USELESS pool account updates
      if (mint === 'Dz9mQ9NzkBcCsuGPFJ3r1bS4wgqKMHBPiVuniW8Mbonk') {
        console.log(`🔍 [USELESS] Account update detected for ${decodedKey === poolData.poolTokenAccount ? 'TOKEN' : 'QUOTE'} account`);
      }
      
      if (mint === 'METvsvVRapdj9cFLzq4Tr43xK4tAjQfwX76z3n6mWQL') {
        console.log(`🔍 [METEORA] Account update detected for ${decodedKey === poolData.poolTokenAccount ? 'TOKEN' : 'QUOTE'} account`);
      }
      
      if (!mint || !poolData || !tokenData) {
        // Log if we're getting updates for accounts we don't recognize
        if (this.globalStats.totalAccountUpdates % 1000 === 0) {
          console.log(`⚠️  [DexScreenerStyleMonitor] Account update for unknown pool: ${decodedKey?.substring(0, 8)}...`);
          console.log(`   Monitoring ${this.pools.size} pools`);
        }
        return;
      }

      // Check if it's the token reserve account
      if (decodedKey === poolData.poolTokenAccount) {
        const dataBuffer = Buffer.from(accountData);
        const newAmount = this.decodeTokenAmount(dataBuffer, poolData.config.decimals);

        if (newAmount !== null && poolData.tokenReserve !== null) {
          const delta = newAmount - poolData.tokenReserve;

          // CRITICAL: Don't filter dust - user wants to see ALL swaps
          // Only filter truly invalid deltas (0, NaN, Infinity)
          if (isFinite(delta) && delta !== 0) {
            // Update global counters
            this.globalStats.totalSwapsDetected++;
            
            // CRITICAL: When pool token reserve INCREASES, user SOLD to pool (SELL)
            //           When pool token reserve DECREASES, user BOUGHT from pool (BUY)
            const isBuy = delta < 0; // Token reserve decreased = user bought
            
            if (isBuy) {
              this.globalStats.totalBuys++;
            } else {
              this.globalStats.totalSells++;
            }

            // Try to match with a transaction from the same slot
            let matchedTx = null;
            if (poolData.pendingTransactions && poolData.pendingTransactions.length > 0) {
              // Find transaction with matching slot
              matchedTx = poolData.pendingTransactions.find(tx => tx.slot === accountUpdate.slot);

              // If no exact slot match, take the most recent one (within 5 seconds)
              if (!matchedTx) {
                const recentTxs = poolData.pendingTransactions.filter(
                  tx => (Date.now() - tx.timestamp) < 5000
                );
                if (recentTxs.length > 0) {
                  matchedTx = recentTxs[recentTxs.length - 1];
                }
              }
            }

            // ONLY display swap if we have a matching transaction (buffering)
            if (!matchedTx) {
              // Buffer this swap for later display when transaction arrives
              if (!poolData.pendingSwaps) {
                poolData.pendingSwaps = [];
              }
              poolData.pendingSwaps.push({
                delta,
                isBuy,
                slot: accountUpdate.slot,
                timestamp: Date.now(),
                newAmount
              });
              
              // Log buffering for USELESS and METEORA
              if (mint === 'Dz9mQ9NzkBcCsuGPFJ3r1bS4wgqKMHBPiVuniW8Mbonk') {
                console.log(`🔄 [USELESS] Swap buffered (waiting for TX): ${isBuy ? 'BUY' : 'SELL'} ${Math.abs(delta).toFixed(2)} tokens`);
                console.log(`   Pending swaps: ${poolData.pendingSwaps.length}, Pending TXs: ${poolData.pendingTransactions?.length || 0}`);
              }
              
              if (mint === 'METvsvVRapdj9cFLzq4Tr43xK4tAjQfwX76z3n6mWQL') {
                console.log(`🔄 [METEORA] Swap buffered (waiting for TX): ${isBuy ? 'BUY' : 'SELL'} ${Math.abs(delta).toFixed(2)} tokens`);
                console.log(`   Pending swaps: ${poolData.pendingSwaps.length}, Pending TXs: ${poolData.pendingTransactions?.length || 0}`);
              }
              
              // Update pool data silently
              poolData.tokenReserve = newAmount;
              poolData.price = poolData.quoteReserve / newAmount; // CRITICAL: Recalculate price!
              poolData.lastUpdate = Date.now();
              return; // Don't display yet
            }

            // Display the swap with transaction info
            this.displaySwap(mint, poolData, { delta, isBuy }, matchedTx);

            // Update pool data
            poolData.tokenReserve = newAmount;
            poolData.price = poolData.quoteReserve / newAmount; // CRITICAL: Recalculate price!
            poolData.lastUpdate = Date.now();
          }
        }
      }
      // Check if it's the quote token reserve account
      else if (decodedKey === poolData.poolQuoteAccount) {
        const dataBuffer = Buffer.from(accountData);
        const newAmount = this.decodeTokenAmount(dataBuffer, poolData.quoteDecimals);

        if (newAmount !== null && poolData.quoteReserve !== null) {
          const delta = newAmount - poolData.quoteReserve;

          // CRITICAL: Don't filter dust - user wants to see ALL swaps
          // Only filter truly invalid deltas (0, NaN, Infinity)
          if (isFinite(delta) && delta !== 0) {
            poolData.quoteReserve = newAmount;
            poolData.price = newAmount / poolData.tokenReserve;
          }
        }
      }

    } catch (error) {
      console.error(`❌ [DexScreenerStyleMonitor] Error handling account update:`, error.message);
    }
  }

  /**
   * Display swap with full transaction data
   * Called when we have both account update and transaction data
   */
  displaySwap(mint, poolData, swapData, txData) {
    try {
      const { delta, isBuy } = swapData;
      const tokenData = this.tokens.get(mint);
      if (!tokenData) return;

      // Calculate prices and market cap
      // ALWAYS use real-time pool-calculated price (updated on every swap)
      const tokenPriceInQuote = poolData.price;
      const metadata = tokenData.metadata;
      let tokenPriceUSD;
      
      // ALWAYS use real-time pool price
      if (poolData.quoteMint === SOL_MINT) {
        tokenPriceUSD = tokenPriceInQuote * this.solPriceUSD;
      } else {
        // USDC/USDT are already in USD
        tokenPriceUSD = tokenPriceInQuote;
      }
      
      const quoteAmount = Math.abs(delta) * tokenPriceInQuote;
      const quoteAmountUSD = Math.abs(delta) * tokenPriceUSD;
      
      // Calculate market cap using Jupiter baseline scaled by price change
      let marketCap = 0;
      const jupiterBaseline = tokenData.jupiterBaselineMarketCap || metadata?.marketCap || 0;
      const baselinePrice = tokenData.lastBaselinePrice || metadata?.usdPrice || 0;
      if (jupiterBaseline > 0 && baselinePrice > 0 && tokenPriceUSD > 0) {
        marketCap = jupiterBaseline * (tokenPriceUSD / baselinePrice);
      } else {
        marketCap = jupiterBaseline || 0;
      }

      // Create swap record
      const swap = {
        timestamp: Date.now(),
        type: isBuy ? 'buy' : 'sell',
        amountTokens: Math.abs(delta),
        amountSOL: poolData.quoteMint === SOL_MINT ? quoteAmount : 0, // For backward compatibility
        amountQuote: quoteAmount,
        priceSOL: poolData.quoteMint === SOL_MINT ? tokenPriceInQuote : 0, // For backward compatibility
        priceQuote: tokenPriceInQuote,
        priceUSD: tokenPriceUSD,
        volumeUSD: quoteAmountUSD,
        marketCap: marketCap,
        quoteName: poolData.quoteName,
        maker: txData.maker,
        signature: txData.signature,
        slot: txData.slot
      };

      // Add to token data
      tokenData.addSwap(swap);

      // Write to database (async, non-blocking)
      this.writeSwapToDatabase(mint, swap).catch(err => {
        console.error(`❌ [DexScreenerStyleMonitor] Failed to write swap:`, err.message);
      });

      // Update stats
      this.stats.totalSwaps++;
      this.stats.lastSwapTime = Date.now();

      // Log swap (ALWAYS log USELESS and METEORA for debugging)
      const shouldLog = process.env.LOG_SWAPS === 'true' || 
                        mint === 'Dz9mQ9NzkBcCsuGPFJ3r1bS4wgqKMHBPiVuniW8Mbonk' ||
                        mint === 'METvsvVRapdj9cFLzq4Tr43xK4tAjQfwX76z3n6mWQL';
      
      if (shouldLog) {
        // Get total stats for this token
        const tokenSwaps = tokenData.swaps || [];
        const buys = tokenSwaps.filter(s => s.type === 'buy').length;
        const sells = tokenSwaps.filter(s => s.type === 'sell').length;
        
        console.log(`\n🔥 ${tokenData.config.name} - ${isBuy ? 'BUY' : 'SELL'}`);
        console.log(`   Amount: ${Math.abs(delta).toLocaleString()} tokens`);
        console.log(`   ${poolData.quoteName}: ${quoteAmount.toFixed(4)} ${poolData.quoteName} ($${quoteAmountUSD.toFixed(2)})`);
        console.log(`   Price: ${tokenPriceInQuote.toFixed(10)} ${poolData.quoteName} ($${tokenPriceUSD.toFixed(6)}) | MCap: $${marketCap > 1000000 ? (marketCap / 1000000).toFixed(2) + 'M' : (marketCap / 1000).toFixed(1) + 'K'}`);
        console.log(`   Stats: ${tokenSwaps.length} swaps (${buys} buys, ${sells} sells)`);
        console.log(`   ✅ Maker: ${txData.maker}`);
        console.log(`   ✅ TX: ${txData.signature?.substring(0, 44)}...`);
        console.log(`   Slot: ${txData.slot}`);
      }

      // Broadcast swap to WebSocket clients
      this.broadcastSwap(mint, swap);

      // Broadcast updated metrics to WebSocket clients
      this.broadcastMetrics(mint);

    } catch (error) {
      console.error(`❌ [DexScreenerStyleMonitor] Error displaying swap:`, error.message);
    }
  }

  /**
   * Decode token amount from account data
   */
  decodeTokenAmount(data, decimals) {
    try {
      const amount = Number(data.readBigUInt64LE(64));
      return amount / Math.pow(10, decimals);
    } catch (error) {
      return null;
    }
  }

  /**
   * Write swap to ChartDatabase
   */
  async writeSwapToDatabase(mint, swap) {
    try {
      await this.chartDatabase.storeSwaps([{
        tokenAddress: mint,
        timestamp: swap.timestamp,
        type: swap.type,
        price: swap.priceSOL,
        tokenAmount: swap.amountTokens,
        baseAmount: swap.amountSOL,
        volumeUsd: swap.volumeUSD,
        signature: swap.signature,
        maker: swap.maker,
        source: 'dexscreener-monitor'
      }]);
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get token metrics (compatible with EnhancedTokenProcessor interface)
   */
  getTokenMetrics(mint) {
    const tokenData = this.tokens.get(mint);
    if (!tokenData) {
      return null;
    }

    const now = Date.now();
    const poolData = this.pools.get(mint);

    // 🚨 DEX-GRADE FIX: Use pool reserves as PRIMARY source (most accurate)
    // Priority 1: poolData.price (calculated from live reserves - most accurate)
    // Priority 2: Calculate from pool reserves directly if price not set
    // Priority 3: Use lastPriceUSD (from swaps) as fallback
    // Priority 4: Jupiter baseline ONLY for cold start
    let currentPriceUSD = 0;
    let priceSource = 'none';
    
    // PRIORITY 1: Use pool reserves (most accurate - reflects actual pool state)
    if (poolData && poolData.price && poolData.price > 0) {
      // Pool price is in quote token per token (SOL per token or USD per token)
      if (poolData.quoteMint === 'So11111111111111111111111111111111111111112') {
        // SOL pool: convert to USD
        currentPriceUSD = poolData.price * this.solPriceUSD;
        priceSource = 'pool-reserves-sol';
      } else {
        // USDC/USDT pool: already in USD
        currentPriceUSD = poolData.price;
        priceSource = 'pool-reserves-stable';
      }
    } 
    // PRIORITY 2: Calculate from reserves directly if price not set but reserves are available
    else if (poolData) {
      const reserves = this.poolReserves.get(poolData.poolAddress);
      if (reserves && reserves.tokenReserve > 0 && reserves.quoteReserve > 0) {
        const priceInQuote = reserves.quoteReserve / reserves.tokenReserve;
        if (reserves.quoteMint === 'So11111111111111111111111111111111111111112') {
          currentPriceUSD = priceInQuote * this.solPriceUSD;
          priceSource = 'pool-reserves-calc-sol';
        } else {
          currentPriceUSD = priceInQuote;
          priceSource = 'pool-reserves-calc-stable';
        }
        // Update poolData.price for next time
        poolData.price = priceInQuote;
      }
    }
    
    // PRIORITY 3: Fallback to lastPriceUSD (from swaps) if pool reserves not available
    if (currentPriceUSD === 0 && tokenData.lastPriceUSD && tokenData.lastPriceUSD > 0) {
      currentPriceUSD = tokenData.lastPriceUSD;
      priceSource = 'swap-price-fallback';
    }
    // PRIORITY 4: Use most recent swap from history
    else if (currentPriceUSD === 0 && tokenData.swaps && tokenData.swaps.length > 0) {
      const recentSwaps = tokenData.swaps
        .filter(s => s.priceUSD && s.priceUSD > 0)
        .sort((a, b) => b.timestamp - a.timestamp);
      
      if (recentSwaps.length > 0) {
        currentPriceUSD = recentSwaps[0].priceUSD;
        priceSource = 'swap-history-fallback';
      }
    }
    
    // PRIORITY 5: Jupiter baseline ONLY for cold start (no swap data, no pool data)
    if (currentPriceUSD === 0 && !tokenData.swaps?.length && !poolData && tokenData.metadata?.usdPrice && tokenData.metadata.usdPrice > 0) {
      currentPriceUSD = tokenData.metadata.usdPrice;
      priceSource = 'jupiter-baseline-cold-start';
    }
    
    // 🚨 CRITICAL: Update lastPriceUSD from pool price (not smoothed median) for consistency
    // This ensures we always have the most accurate price
    if (currentPriceUSD > 0 && priceSource.startsWith('pool-reserves')) {
      tokenData.lastPriceUSD = currentPriceUSD;
      tokenData.lastPriceUpdate = Date.now();
    }
    
    // Log price source for Lumen and Meteora
    if (mint === 'BkpaxHhE6snExazrPkVAjxDyZa8Nq3oDEzm5GQm2pump' || 
        mint === 'METvsvVRapdj9cFLzq4Tr43xK4tAjQfwX76z3n6mWQL') {
      const tokenName = tokenData.config?.name || mint.substring(0, 8);
      console.log(`   💰 [${tokenName}] Price: $${currentPriceUSD.toFixed(6)} (source: ${priceSource})`);
      if (priceSource === 'jupiter-baseline-cold-start') {
        console.log(`      ⚠️ Using stale Jupiter baseline (cold start - no swap data yet)`);
        console.log(`      Jupiter usdPrice: $${tokenData.metadata.usdPrice.toFixed(6)}`);
      } else if (priceSource === 'swap-price' || priceSource === 'swap-history') {
        console.log(`      ✅ Using live swap data (${tokenData.swaps?.length || 0} swaps in history)`);
      } else if (priceSource.startsWith('pool')) {
        console.log(`      Pool price: ${poolData.price.toFixed(10)} ${poolData.quoteName || 'unknown'}`);
        console.log(`      SOL price: $${this.solPriceUSD.toFixed(2)}`);
      }
    }

    // CRITICAL: Preserve Jupiter baseline for SOL price if pool price is 0
    let currentPriceSOL = 0;
    if (poolData && poolData.price && poolData.price > 0) {
      currentPriceSOL = poolData.price;
    } else if (tokenData.metadata?.usdPrice && tokenData.metadata.usdPrice > 0 && this.solPriceUSD > 0) {
      // Fallback: calculate SOL price from Jupiter USD price
      currentPriceSOL = tokenData.metadata.usdPrice / this.solPriceUSD;
    }

    return {
      // Current price (always preserve Jupiter baseline if pool price is 0)
      currentPrice: currentPriceUSD,
      currentPriceSOL: currentPriceSOL,

      // Price changes
      priceChange5m: this.calculatePriceChange(mint, 5 * 60 * 1000),
      priceChange1h: this.calculatePriceChange(mint, 60 * 60 * 1000),
      priceChange6h: this.calculatePriceChange(mint, 6 * 60 * 60 * 1000),
      priceChange24h: this.calculatePriceChange(mint, 24 * 60 * 60 * 1000),

      // Volume
      volume5m: this.calculateVolume(mint, 5 * 60 * 1000),
      volume1h: this.calculateVolume(mint, 60 * 60 * 1000),
      volume6h: this.calculateVolume(mint, 6 * 60 * 60 * 1000),
      volume24h: this.calculateVolume(mint, 24 * 60 * 60 * 1000),

      // Transaction counts
      txns5m: this.calculateTxnCount(mint, 5 * 60 * 1000),
      txns1h: this.calculateTxnCount(mint, 60 * 60 * 1000),
      txns6h: this.calculateTxnCount(mint, 6 * 60 * 60 * 1000),
      txns24h: this.calculateTxnCount(mint, 24 * 60 * 60 * 1000),

      // Unique makers
      makers5m: this.calculateUniqueMakers(mint, 5 * 60 * 1000),
      makers1h: this.calculateUniqueMakers(mint, 60 * 60 * 1000),
      makers6h: this.calculateUniqueMakers(mint, 6 * 60 * 60 * 1000),
      makers24h: this.calculateUniqueMakers(mint, 24 * 60 * 60 * 1000),

      // Metadata
      lastUpdate: tokenData.lastUpdate
    };
    
    // Market cap - Use Jupiter baseline and scale by price change
    let marketCap = 0;
    const jupiterBaseline = tokenData.jupiterBaselineMarketCap || tokenData.metadata?.marketCap || 0;
    const baselinePrice = tokenData.lastBaselinePrice || tokenData.metadata?.usdPrice || 0;
    
    if (jupiterBaseline > 0 && baselinePrice > 0 && currentPriceUSD > 0 && isFinite(currentPriceUSD)) {
      // Scale market cap by price change from baseline
      marketCap = jupiterBaseline * (currentPriceUSD / baselinePrice);
    } else {
      // Fallback: Use Jupiter's market cap directly
      marketCap = jupiterBaseline || tokenData.metadata?.marketCap || 0;
    }
    
    // Add market cap to return object
    return {
      ...metrics,
      marketCap: marketCap
    };
  }

  /**
   * Calculate price change percentage over a time window
   * CRITICAL: Always start from Jupiter baseline, then track price at window start times
   * Formula: ((currentPrice - priceAtWindowStart) / priceAtWindowStart) * 100
   * NOTE: Must NOT call getTokenMetrics() to avoid circular reference
   */
  calculatePriceChange(mint, windowMs) {
    const tokenData = this.tokens.get(mint);
    const poolData = this.pools.get(mint);
    if (!tokenData || !poolData) return 0;

    // Get current price directly (from pool or metadata) - DO NOT call getTokenMetrics() to avoid circular reference
    let currentPrice = 0;
    if (poolData && poolData.price && poolData.price > 0) {
      if (poolData.quoteMint === 'So11111111111111111111111111111111111111112') {
        currentPrice = poolData.price * this.solPriceUSD;
      } else {
        currentPrice = poolData.price;
      }
    } else if (tokenData.metadata?.usdPrice && tokenData.metadata.usdPrice > 0) {
      currentPrice = tokenData.metadata.usdPrice;
    }
    
    if (currentPrice === 0) {
      // No current price, use Jupiter baseline if available
      if (tokenData.jupiterBaseline) {
        const baseline = this.getJupiterBaselineForWindow(tokenData.jupiterBaseline, windowMs);
        return baseline?.priceChange || 0;
      }
      return 0;
    }

    // Determine window key for price tracking
    let windowKey = null;
    if (windowMs <= 5 * 60 * 1000) windowKey = '5m';
    else if (windowMs <= 60 * 60 * 1000) windowKey = '1h';
    else if (windowMs <= 6 * 60 * 60 * 1000) windowKey = '6h';
    else if (windowMs <= 24 * 60 * 60 * 1000) windowKey = '24h';
    
    // Get price at the start of this window
    const now = Date.now();
    const windowStartTime = now - windowMs;
    
    // CRITICAL: Check if we have Jupiter baseline price change for this specific window
    // If we don't have enough swap data, use Jupiter's baseline price change directly
    // This ensures different windows show different values
    if (tokenData.jupiterBaseline) {
      const baseline = this.getJupiterBaselineForWindow(tokenData.jupiterBaseline, windowMs);
      if (baseline && baseline.priceChange !== undefined && baseline.priceChange !== null) {
        // Check if we have enough swap data for this window
        const swaps = tokenData.swaps || [];
        const swapsInWindow = swaps.filter(s => s.timestamp >= windowStartTime);
        
        // If we have less than 2 swaps in this window, use Jupiter baseline directly
        // This ensures different windows show different values even without swap data
        if (swapsInWindow.length < 2) {
          return baseline.priceChange;
        }
      }
    }
    
    // We have enough swap data - calculate from actual swap prices
    // Try to find price at window start from price history (most accurate)
    let priceAtWindowStart = null;
    
    // First, try price history (tracks all price points)
    if (tokenData.priceHistory && tokenData.priceHistory.length > 0) {
      // Find price point closest to window start time
      let closestPricePoint = null;
      let minTimeDiff = Infinity;
      for (const pricePoint of tokenData.priceHistory) {
        const timeDiff = Math.abs(pricePoint.timestamp - windowStartTime);
        if (timeDiff < minTimeDiff) {
          minTimeDiff = timeDiff;
          closestPricePoint = pricePoint;
        }
      }
      // Use price if within reasonable time window (50% of window size)
      if (closestPricePoint && minTimeDiff < windowMs * 0.5) {
        priceAtWindowStart = closestPricePoint.price;
      }
    }
    
    // If no price history, try swaps
    if (!priceAtWindowStart) {
      const swaps = tokenData.swaps || [];
      let closestSwap = null;
      let minTimeDiff = Infinity;
      for (const swap of swaps) {
        const timeDiff = Math.abs(swap.timestamp - windowStartTime);
        if (timeDiff < minTimeDiff) {
          minTimeDiff = timeDiff;
          closestSwap = swap;
        }
      }
      // If we found a swap within 50% of window time, use its price
      if (closestSwap && minTimeDiff < windowMs * 0.5) {
        priceAtWindowStart = closestSwap.priceUSD || closestSwap.price;
      }
    }
    
    // If no swap found, try to get from stored price at window start
    if (!priceAtWindowStart && windowKey && tokenData.priceAtWindowStart?.[windowKey]) {
      priceAtWindowStart = tokenData.priceAtWindowStart[windowKey];
    }
    
    // If still no price, use Jupiter baseline price change to calculate old price
    if (!priceAtWindowStart) {
      if (tokenData.jupiterBaseline) {
        const baseline = this.getJupiterBaselineForWindow(tokenData.jupiterBaseline, windowMs);
        if (baseline && baseline.priceChange !== undefined && baseline.priceChange !== null) {
          // Calculate old price from current price and price change
          // Formula: if price change is C%, then oldPrice = currentPrice / (1 + C/100)
          const priceChangeDecimal = baseline.priceChange / 100;
          if (priceChangeDecimal !== -1) { // Avoid division by zero
            priceAtWindowStart = currentPrice / (1 + priceChangeDecimal);
          } else {
            // Fallback to baseline price
            priceAtWindowStart = tokenData.lastBaselinePrice || tokenData.metadata?.usdPrice || 0;
          }
        } else {
          // No baseline price change, use baseline price
          priceAtWindowStart = tokenData.lastBaselinePrice || tokenData.metadata?.usdPrice || 0;
        }
      } else {
        // No Jupiter baseline at all, use metadata price
        priceAtWindowStart = tokenData.metadata?.usdPrice || 0;
      }
    }
    
    // Calculate price change: ((current - old) / old) * 100
    if (priceAtWindowStart === 0 || priceAtWindowStart === null) {
      // Last resort: Use Jupiter baseline price change if available
      if (tokenData.jupiterBaseline) {
        const baseline = this.getJupiterBaselineForWindow(tokenData.jupiterBaseline, windowMs);
        return baseline?.priceChange || 0;
      }
      return 0;
    }
    return ((currentPrice - priceAtWindowStart) / priceAtWindowStart) * 100;
  }

  /**
   * Calculate volume over a time window
   * PHASE 3: Uses accurate volume from transaction-level decoded swaps
   * ALWAYS uses Jupiter baseline as primary source (we don't have persistent historical data)
   */
  calculateVolume(mint, windowMs) {
    const tokenData = this.tokens.get(mint);
    if (!tokenData) return 0;

    // ALWAYS start with Jupiter baseline (provides data across restarts/outages)
    let jupiterVolume = 0;
    if (tokenData.jupiterBaseline) {
      const baseline = this.getJupiterBaselineForWindow(tokenData.jupiterBaseline, windowMs);
      jupiterVolume = (baseline?.buyVolume || 0) + (baseline?.sellVolume || 0);
    }

    // PHASE 3: Add our live swaps on top (incremental updates from accurate transaction decoding)
    const now = Date.now();
    const cutoff = now - windowMs;
    const swaps = tokenData.getSwapsSince(cutoff);
    // Use volumeUSD from swap record (accurate from transaction decoding)
    const ourVolume = swaps.reduce((sum, swap) => sum + (swap.volumeUSD || 0), 0);

    // Return Jupiter baseline + our live swaps
    return jupiterVolume + ourVolume;
  }

  /**
   * Calculate transaction count over a time window
   * PHASE 3: Uses accurate swap count from transaction-level decoding
   * ALWAYS uses Jupiter baseline as primary source
   */
  calculateTxnCount(mint, windowMs) {
    const tokenData = this.tokens.get(mint);
    if (!tokenData) return 0;

    // ALWAYS start with Jupiter baseline
    let jupiterTxns = 0;
    if (tokenData.jupiterBaseline) {
      const baseline = this.getJupiterBaselineForWindow(tokenData.jupiterBaseline, windowMs);
      jupiterTxns = (baseline?.numBuys || 0) + (baseline?.numSells || 0);
    }

    // PHASE 3: Add our live swaps on top (accurate count from transaction decoding)
    const now = Date.now();
    const cutoff = now - windowMs;
    const swaps = tokenData.getSwapsSince(cutoff);

    // Return Jupiter baseline + our live swaps
    return jupiterTxns + swaps.length;
  }

  /**
   * Calculate unique makers over a time window
   * PHASE 3: Uses accurate maker addresses from transaction-level decoding
   * ALWAYS uses Jupiter baseline as primary source
   */
  calculateUniqueMakers(mint, windowMs) {
    const tokenData = this.tokens.get(mint);
    if (!tokenData) return 0;

    // ALWAYS start with Jupiter baseline
    let jupiterMakers = 0;
    if (tokenData.jupiterBaseline) {
      const baseline = this.getJupiterBaselineForWindow(tokenData.jupiterBaseline, windowMs);
      jupiterMakers = baseline?.numTraders || 0;
    }

    // PHASE 3: Add our live unique makers on top (accurate from transaction decoding)
    const now = Date.now();
    const cutoff = now - windowMs;
    const swaps = tokenData.getSwapsSince(cutoff);
    // Filter out 'Unknown' and empty strings, use accurate maker from swap record
    const uniqueMakers = new Set(swaps.map(s => s.maker).filter(m => m && m !== 'Unknown' && m !== 'unknown'));

    // Return Jupiter baseline + our live makers
    return jupiterMakers + uniqueMakers.size;
  }

  /**
   * Get Jupiter baseline stats for a specific time window
   */
  getJupiterBaselineForWindow(jupiterBaseline, windowMs) {
    if (!jupiterBaseline) return null;

    // Map window to Jupiter stats - now using nested stats objects
    if (windowMs <= 5 * 60 * 1000) {
      return jupiterBaseline.stats5m || null;
    }
    if (windowMs <= 60 * 60 * 1000) {
      return jupiterBaseline.stats1h || null;
    }
    if (windowMs <= 6 * 60 * 60 * 1000) {
      return jupiterBaseline.stats6h || null;
    }
    return jupiterBaseline.stats24h || null;
  }

  /**
   * Get all monitored tokens
   */
  getAllTokens() {
    return Array.from(this.tokens.keys());
  }

  /**
   * Get service statistics
   */
  getStats() {
    const uptime = ((Date.now() - this.globalStats.startTime) / 1000).toFixed(1);
    
    return {
      ...this.stats,
      solPriceUSD: this.solPriceUSD,
      tokensMonitored: this.tokens.size,
      activeStreams: 1, // Single stream architecture
      
      // Global cumulative statistics
      globalStats: {
        ...this.globalStats,
        uptime: parseFloat(uptime),
        avgSwapsPerSecond: (this.globalStats.totalSwapsDetected / (uptime || 1)).toFixed(2)
      }
    };
  }

  /**
   * Save swap to ChartDatabase
   */
  async saveSwapToDatabase(mint, swap) {
    try {
      // Use ChartDatabase.storeSwaps() which handles batching and atomic writes
      // Note: swap parameter is the swapRecord from displaySwapFromTransaction, which has volumeUSD (uppercase)
      const swapToStore = {
        tokenAddress: mint,
        poolAddress: swap.poolAddress || 'UNKNOWN',
        signature: swap.signature || 'Unknown',
        timestamp: swap.timestamp || Date.now(),
        slot: swap.slot || 0,
        price: swap.price || swap.priceUSD || 0, // Support both price and priceUSD
        volumeUsd: swap.volumeUSD || swap.volumeUsd || 0, // Support both volumeUSD and volumeUsd
        source: 'dexscreener_monitor',
        type: swap.type || 'UNKNOWN',
        tokenAmount: swap.tokenAmount || 0,
        baseAmount: swap.baseAmount || 0,
        maker: swap.maker || 'Unknown',
        rawData: swap,
        createdAt: Date.now()
      };
      
      // Store via ChartDatabase's batch system
      await this.chartDatabase.storeSwaps([swapToStore]);
      
      // Log first few swaps to verify they're being saved
      if (this.globalStats.totalSwapsDetected <= 5) {
        console.log(`💾 [DexScreenerStyleMonitor] Saved swap to database: ${mint.substring(0, 8)}... - $${swapToStore.volumeUsd.toFixed(2)} (${swapToStore.type})`);
      }
    } catch (error) {
      console.error(`❌ [DexScreenerStyleMonitor] Error saving swap to database:`, error.message);
      if (error.stack) {
        console.error(`   Stack:`, error.stack.split('\n').slice(0, 3).join('\n'));
      }
    }
  }

  /**
   * Broadcast swap to WebSocket clients
   * Uses 'swapUpdate' type for frontend compatibility
   */
  broadcastSwap(mint, swap) {
    if (!this.webSocketServer) return;

    try {
      const tokenData = this.tokens.get(mint);
      if (!tokenData) return;

      // Format swap data for frontend compatibility
      const swapData = {
        tokenAddress: mint,
        symbol: tokenData.config.name,
        type: swap.type,
        amountTokens: swap.tokenAmount || swap.amountTokens || 0,
        amountSOL: swap.baseAmount || swap.amountSOL || 0,
        priceSOL: swap.price || swap.priceSOL || 0,
        priceUSD: swap.priceUSD || swap.priceUSD || 0,
        usdAmount: swap.volumeUSD || swap.volumeUsd || 0,
        volumeUSD: swap.volumeUSD || swap.volumeUsd || 0,
        marketCap: swap.marketCap || 0,
        liquidity: swap.liquidity || 0,
        maker: swap.maker || 'Unknown',
        signature: swap.signature || 'Unknown',
        walletAddress: swap.maker || 'Unknown',
        timestamp: swap.timestamp || Date.now(),
        slot: swap.slot || 0
      };

      // Use BackendWebSocketServer's broadcastSwapUpdate method
      if (this.webSocketServer.broadcastSwapUpdate) {
        this.webSocketServer.broadcastSwapUpdate(mint, swapData);
      } else {
        // Fallback to direct broadcast
        this.webSocketServer.broadcast(JSON.stringify({
          type: 'swapUpdate',
          tokenAddress: mint,
          data: swapData,
          timestamp: swap.timestamp
        }));
      }
    } catch (error) {
      console.error('❌ [DexScreenerStyleMonitor] Error broadcasting swap:', error.message);
    }
  }

  /**
   * Broadcast updated metrics to WebSocket clients
   * Uses 'priceUpdate' type for frontend compatibility
   */
  broadcastMetrics(mint) {
    if (!this.webSocketServer) {
      console.log(`⚠️  [DexScreenerStyleMonitor] No WebSocket server, skipping broadcast for ${mint.substring(0, 8)}...`);
      return;
    }

    try {
      const metrics = this.getTokenMetrics(mint);
      if (!metrics) {
        console.log(`⚠️  [DexScreenerStyleMonitor] No metrics for ${mint.substring(0, 8)}..., skipping broadcast`);
        return;
      }

      const tokenData = this.tokens.get(mint);
      if (!tokenData) {
        console.log(`⚠️  [DexScreenerStyleMonitor] No token data for ${mint.substring(0, 8)}..., skipping broadcast`);
        return;
      }

      const poolData = this.pools.get(mint);
      
      // Calculate market cap - Use Jupiter baseline and scale by price change
      // Jupiter's marketCap has accurate supply data, so we scale it by price changes
      let marketCap = 0;
      const jupiterBaseline = tokenData.jupiterBaselineMarketCap || tokenData.metadata?.marketCap || 0;
      const baselinePrice = tokenData.lastBaselinePrice || tokenData.metadata?.usdPrice || 0;
      
      if (jupiterBaseline > 0 && baselinePrice > 0 && metrics.currentPrice > 0 && isFinite(metrics.currentPrice)) {
        // Scale market cap by price change from baseline
        const priceRatio = metrics.currentPrice / baselinePrice;
        marketCap = jupiterBaseline * priceRatio;
      } else {
        // Fallback: Use Jupiter's market cap directly
        marketCap = jupiterBaseline || tokenData.metadata?.marketCap || 0;
      }
      
      // Reduced verbosity: Only log broadcasts for debugging (controlled by env var)
      if (process.env.DEBUG_BROADCASTS === 'true' && (this.globalStats.totalSwapsDetected <= 5 || this.globalStats.totalSwapsDetected % 50 === 0)) {
        console.log(`📡 [${tokenData.config?.name || mint.substring(0, 8)}] price=$${metrics.currentPrice.toFixed(6)}, mcap=$${(marketCap / 1000000).toFixed(2)}M, vol24h=$${metrics.volume24h.toFixed(2)}`);
      }
      
      // Calculate liquidity (quote reserves × quote price × 2)
      // CRITICAL: Preserve Jupiter/Moralis baseline liquidity if reserves are 0
      // For SOL pools: quoteReserve × SOL price × 2
      // For USDC/USDT pools: quoteReserve × 2 (already in USD)
      let liquidity = 0;
      if (poolData && poolData.quoteReserve && poolData.quoteReserve > 0) {
        if (poolData.quoteMint === 'So11111111111111111111111111111111111111112') {
          // SOL pool
          liquidity = poolData.quoteReserve * this.solPriceUSD * 2;
        } else {
          // USDC/USDT pool (already in USD)
          liquidity = poolData.quoteReserve * 2;
        }
      } else if (tokenData.moralisLiquidity && tokenData.moralisLiquidity > 0) {
        // Fallback to Moralis liquidity baseline
        liquidity = tokenData.moralisLiquidity;
      } else if (tokenData.jupiterLiquidity && tokenData.jupiterLiquidity > 0) {
        // Fallback to Jupiter liquidity baseline
        liquidity = tokenData.jupiterLiquidity;
      } else if (tokenData.metadata?.liquidity && tokenData.metadata.liquidity > 0) {
        // Fallback to metadata liquidity
        liquidity = tokenData.metadata.liquidity;
      }
      
      // Calculate age (if createdAt is available)
      const age = tokenData.createdAt 
        ? Math.floor((Date.now() - tokenData.createdAt) / 1000)
        : 0;

      // Format price data for frontend compatibility
      const priceData = {
        tokenAddress: mint, // CRITICAL: Frontend needs this to match tokens
        priceUsd: metrics.currentPrice,
        currentPrice: metrics.currentPrice,
        price: metrics.currentPrice, // CRITICAL: Frontend reads token.price
        
        // Market data
        marketCap: marketCap,
        liquidity: liquidity,
        age: age,
        createdAt: tokenData.createdAt || null,
        
        // Volume stats
        volume24h: metrics.volume24h || 0,
        volume6h: metrics.volume6h || 0,
        volume1h: metrics.volume1h || 0,
        volume5m: metrics.volume5m || 0,
        
        // Transaction stats
        txns24h: metrics.txns24h || 0,
        txns6h: metrics.txns6h || 0,
        txns1h: metrics.txns1h || 0,
        txns5m: metrics.txns5m || 0,
        
        // Maker stats
        makers24h: metrics.makers24h || 0,
        makers6h: metrics.makers6h || 0,
        makers1h: metrics.makers1h || 0,
        makers5m: metrics.makers5m || 0,
        
        // Price change stats
        priceChange24h: metrics.priceChange24h || 0,
        priceChange6h: metrics.priceChange6h || 0,
        priceChange1h: metrics.priceChange1h || 0,
        priceChange5m: metrics.priceChange5m || 0,
        
        source: 'dexscreener-monitor',
        timestamp: Date.now()
      };

      // Use BackendWebSocketServer's broadcastPriceUpdate method
      if (this.webSocketServer.broadcastPriceUpdate) {
        this.webSocketServer.broadcastPriceUpdate(mint, priceData);
      } else {
        // Fallback to direct broadcast
        this.webSocketServer.broadcast(JSON.stringify({
          type: 'priceUpdate',
          tokenAddress: mint,
          data: priceData,
          timestamp: Date.now()
        }));
      }
      
      // Reduced verbosity: Only log if DEBUG_BROADCASTS is enabled
      if (process.env.DEBUG_BROADCASTS === 'true') {
        console.log(`📡 [${tokenData.config?.name || mint.substring(0, 8)}] price=$${metrics.currentPrice.toFixed(6)}, mcap=$${(marketCap/1e6).toFixed(2)}M, vol24h=$${metrics.volume24h.toFixed(2)}`);
      }
    } catch (error) {
      console.error('❌ [DexScreenerStyleMonitor] Error broadcasting metrics:', error.message);
      console.error('   Token:', mint);
      if (error.stack) {
        console.error('   Stack:', error.stack.split('\n').slice(0, 3).join('\n'));
      }
    }
  }

  /**
   * Broadcast full state of all tokens (for frontend compatibility)
   * Sends complete snapshot every 10 seconds
   */
  broadcastFullState() {
    if (!this.webSocketServer) {
      console.log('⚠️  [DexScreenerStyleMonitor] broadcastFullState called but no WebSocket server');
      return;
    }

    try {
      console.log(`🔄 [DexScreenerStyleMonitor] broadcastFullState running... (${this.tokens.size} tokens monitored)`);
      const allTokens = [];
      
      // Collect data for all monitored tokens
      for (const [mint, tokenData] of this.tokens.entries()) {
        try {
          const metrics = this.getTokenMetrics(mint);
          if (!metrics) continue;

          const poolData = this.pools.get(mint);
          // Don't skip if no poolData - we can still use Jupiter price!

          // Calculate market cap - Use Jupiter baseline scaled by price change
          let marketCap = 0;
          const jupiterBaseline = tokenData.jupiterBaselineMarketCap || tokenData.metadata?.marketCap || 0;
          const baselinePrice = tokenData.lastBaselinePrice || tokenData.metadata?.usdPrice || 0;
          if (jupiterBaseline > 0 && baselinePrice > 0 && metrics.currentPrice > 0 && isFinite(metrics.currentPrice)) {
            marketCap = jupiterBaseline * (metrics.currentPrice / baselinePrice);
          } else {
            marketCap = jupiterBaseline || tokenData.metadata?.marketCap || 0;
          }

          // Calculate age
          const age = tokenData.createdAt 
            ? Math.floor((Date.now() - tokenData.createdAt) / 1000)
            : 0;

          // Calculate liquidity (quote reserves × quote price × 2)
          let liquidity = 0;
          if (poolData && poolData.quoteReserve) {
            if (poolData.quoteMint === 'So11111111111111111111111111111111111111112') {
              // SOL pool
              liquidity = poolData.quoteReserve * this.solPriceUSD * 2;
            } else {
              // USDC/USDT pool (already in USD)
              liquidity = poolData.quoteReserve * 2;
            }
          }

          // Build complete token data object
          const tokenInfo = {
            tokenAddress: mint,
            contractAddress: mint, // For backward compatibility
            name: tokenData.config?.name || 'Unknown',
            symbol: tokenData.config?.name || 'Unknown',
            priceUsd: metrics.currentPrice,
            currentPrice: metrics.currentPrice,
            price: metrics.currentPrice, // CRITICAL: Frontend reads token.price
            marketCap: marketCap,
            liquidity: liquidity,
            age: age,
            createdAt: tokenData.createdAt || null,
            
            // Volume stats
            volume24h: metrics.volume24h || 0,
            volume6h: metrics.volume6h || 0,
            volume1h: metrics.volume1h || 0,
            volume5m: metrics.volume5m || 0,
            
            // Transaction stats
            txns24h: metrics.txns24h || 0,
            txns6h: metrics.txns6h || 0,
            txns1h: metrics.txns1h || 0,
            txns5m: metrics.txns5m || 0,
            
            // Maker stats
            makers24h: metrics.makers24h || 0,
            makers6h: metrics.makers6h || 0,
            makers1h: metrics.makers1h || 0,
            makers5m: metrics.makers5m || 0,
            
            // Price change stats
            priceChange24h: metrics.priceChange24h || 0,
            priceChange6h: metrics.priceChange6h || 0,
            priceChange1h: metrics.priceChange1h || 0,
            priceChange5m: metrics.priceChange5m || 0,
            
            source: 'dexscreener-monitor',
            lastUpdate: Date.now()
          };

          allTokens.push(tokenInfo);
        } catch (error) {
          console.error(`❌ [DexScreenerStyleMonitor] Error collecting data for ${mint.substring(0, 8)}:`, error.message);
        }
      }

      // Broadcast full state
      if (allTokens.length > 0) {
        // Count how many tokens have prices
        const tokensWithPrice = allTokens.filter(t => t.priceUsd > 0).length;
        const tokensWithZeroPrice = allTokens.length - tokensWithPrice;
        
        // Log sample tokens for debugging
        const firstToken = allTokens[0];
        const tokenWithPrice = allTokens.find(t => t.priceUsd > 0) || firstToken;
        
        console.log(`📊 [DexScreenerStyleMonitor] fullState summary:`);
        console.log(`   Total tokens: ${allTokens.length}`);
        console.log(`   With price > 0: ${tokensWithPrice}`);
        console.log(`   With price = 0: ${tokensWithZeroPrice}`);
        console.log(`   Sample (first): ${firstToken.symbol} - price=$${firstToken.priceUsd}`);
        console.log(`   Sample (with price): ${tokenWithPrice.symbol} - price=$${tokenWithPrice.priceUsd}`);
        
        this.webSocketServer.broadcast(JSON.stringify({
          type: 'fullStateUpdate',
          tokens: allTokens,
          timestamp: Date.now()
        }));
        
        console.log(`📡 [DexScreenerStyleMonitor] Broadcasted full state: ${allTokens.length} tokens`);
      }
    } catch (error) {
      console.error('❌ [DexScreenerStyleMonitor] Error broadcasting full state:', error.message);
    }
  }

  /**
   * Set WebSocket server (for late binding)
   */
  setWebSocketServer(webSocketServer) {
    this.webSocketServer = webSocketServer;
    console.log('✅ [DexScreenerStyleMonitor] WebSocket server connected');
  }

  /**
   * Shutdown the service
   */
  async shutdown() {
    console.log('🛑 [DexScreenerStyleMonitor] Shutting down...');

    // Stop SOL price updater
    if (this.priceUpdater) {
      clearInterval(this.priceUpdater);
    }
    if (this.fullStateUpdater) {
      clearInterval(this.fullStateUpdater);
    }
    if (this.metricsUpdater) {
      clearInterval(this.metricsUpdater);
    }
    if (this.reserveRefresher) {
      clearInterval(this.reserveRefresher);
    }

    // Close the single gRPC stream
    if (this.stream) {
      try {
        if (this.isBidirectionalStream) {
          this.stream.end(); // Graceful close for bidirectional
        } else {
          this.stream.cancel();
        }
      } catch (e) {
        // Ignore errors
      }
      this.stream = null;
      this.currentSubscribedPools.clear();
    }

    // Close gRPC client
    if (this.grpcClient && typeof this.grpcClient.close === 'function') {
      try {
        this.grpcClient.close();
      } catch (e) {
        // Ignore errors
      }
    }

    console.log('✅ [DexScreenerStyleMonitor] Shutdown complete');
  }
}
