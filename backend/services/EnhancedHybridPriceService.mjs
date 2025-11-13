import axios from 'axios';
import EventEmitter from 'events';
import fs from 'fs/promises';
import path from 'path';
import bs58 from 'bs58';
import ChartDatabase from './ChartDatabase.js';
import { Connection } from '@solana/web3.js';
import { detectSwapsForMint } from './SwapDetectionHelpers.mjs';

// Use CommonJS wrapper for gRPC loading
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const CONSTANT_K_GRPC_ENDPOINT = 'http://grpc.constant-k.com';
const CONSTANT_K_GRPC_TOKEN = '39facrmt-om2u-4al5-5k4h-g8pls2y5vhui';
const CONSTANT_K_RPC_ENDPOINT = process.env.CONSTANT_K_RPC_ENDPOINT || 'https://rpc.constant-k.com/?api-key=39facrmt-om2u-4al5-5k4h-g8pls2y5vhui';
const JUPITER_API_BASE = 'https://lite-api.jup.ag/tokens/v2'; // Free tier API
const DEXSCREENER_API_BASE = 'https://api.dexscreener.com/latest/dex';
const WSOL = 'So11111111111111111111111111111111111111112';
const RPC_FETCH_DELAY_MS = Number(process.env.RPC_FETCH_DELAY_MS || 50);

// DEX Program IDs for broad filtering
const DEX_PROGRAMS = [
  '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',  // Raydium AMM
  'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK',  // Raydium CLMM
  'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C',  // Raydium CPMM
  'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc',   // Orca Whirlpool
  'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo',   // Meteora DLMM
  'Dooar9JkhdZ7J3LHN3A7YCuoGRUggXhQaG4kijfLGU2j',  // Meteora Pools
  'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA',   // Pump.fun AMM (PumpSwap)
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
    this.firstSwapTimestamp = null;
    this.lastSwapTimestamp = null;
    this.baselineTimestamp = 0;
    this.baselineOpenPrices = {
      '5m': null,
      '1h': null,
      '6h': null,
      '24h': null,
    };
    
    // Cached metrics (updated on each swap)
    this.metrics = {
      currentPrice: 0,
      '5m': { volume: 0, txns: 0, makers: 0, priceChange: 0 },
      '1h': { volume: 0, txns: 0, makers: 0, priceChange: 0 },
      '6h': { volume: 0, txns: 0, makers: 0, priceChange: 0 },
      '24h': { volume: 0, txns: 0, makers: 0, priceChange: 0 }
    };

    this.baseline = {
      currentPrice: 0,
      marketCap: 0,
      '5m': { volume: 0, txns: 0, makers: 0, priceChange: 0 },
      '1h': { volume: 0, txns: 0, makers: 0, priceChange: 0 },
      '6h': { volume: 0, txns: 0, makers: 0, priceChange: 0 },
      '24h': { volume: 0, txns: 0, makers: 0, priceChange: 0 },
      circSupply: null,
      totalSupply: null,
      fullyDilutedValuation: 0,
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

    const swapTimestamp = swap.timestamp ?? Date.now();
    if (!this.firstSwapTimestamp) {
      this.firstSwapTimestamp = swapTimestamp;
    }
    this.lastSwapTimestamp = swapTimestamp;
    
    this.updateMetrics();
    this.pruneOldData();
  }

  /**
   * Seed metrics from baseline data (e.g., Jupiter)
   */
  seedBaseline(baseline) {
    if (!baseline) return;

    if (typeof baseline.price === 'number' && baseline.price > 0) {
      this.baseline.currentPrice = baseline.price;
      if (!this.metrics.currentPrice || this.metrics.currentPrice === 0) {
        this.metrics.currentPrice = baseline.price;
      }
      if (this.priceHistory.length === 0) {
        this.priceHistory.push({ timestamp: Date.now(), price: baseline.price });
      }
    }

    if (typeof baseline.circSupply === 'number' && baseline.circSupply > 0) {
      this.baseline.circSupply = baseline.circSupply;
    }
    if (typeof baseline.totalSupply === 'number' && baseline.totalSupply > 0) {
      this.baseline.totalSupply = baseline.totalSupply;
    }
    if (typeof baseline.marketCap === 'number' && baseline.marketCap > 0) {
      this.baseline.marketCap = baseline.marketCap;
    }
    if (
      typeof baseline.fullyDilutedValuation === 'number' &&
      baseline.fullyDilutedValuation > 0
    ) {
      this.baseline.fullyDilutedValuation = baseline.fullyDilutedValuation;
    }

    this.baselineTimestamp = Date.now();

    const computeOpenPrice = (currentPrice, windowStats) => {
      const priceChange = Number(windowStats?.priceChange ?? 0);
      const price = Number(currentPrice ?? 0);
      if (!isFinite(price) || price <= 0) return null;
      if (!isFinite(priceChange) || priceChange === 0) return price;
      const ratio = 1 + priceChange / 100;
      if (!isFinite(ratio) || ratio === 0) return price;
      const open = price / ratio;
      if (!isFinite(open) || open <= 0) return price;
      return open;
    };

    this.baselineOpenPrices['5m'] = computeOpenPrice(
      baseline.price,
      baseline['5m']
    );
    this.baselineOpenPrices['1h'] = computeOpenPrice(
      baseline.price,
      baseline['1h']
    );
    this.baselineOpenPrices['6h'] = computeOpenPrice(
      baseline.price,
      baseline['6h']
    );
    this.baselineOpenPrices['24h'] = computeOpenPrice(
      baseline.price,
      baseline['24h']
    );

    const applyBaseline = (windowKey, stats) => {
      const target = this.baseline[windowKey] || {
        volume: 0,
        txns: 0,
        makers: 0,
        priceChange: 0,
      };

      target.volume = Number(stats?.volume ?? 0);
      target.txns = Number(stats?.txns ?? 0);
      target.makers = Number(stats?.makers ?? 0);
      target.priceChange = Number(stats?.priceChange ?? 0);

      this.baseline[windowKey] = target;
    };

    applyBaseline('5m', baseline['5m']);
    applyBaseline('1h', baseline['1h']);
    applyBaseline('6h', baseline['6h']);
    applyBaseline('24h', baseline['24h']);

    this.pruneOldData();
  }

  /**
   * Update all time-window metrics
   */
  updateMetrics() {
    const now = Date.now();
    const windows = {
      '5m': 5 * 60 * 1000,
      '1h': 60 * 60 * 1000,
      '6h': 6 * 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000
    };

    // Update current price
    if (this.swaps.length > 0) {
      this.metrics.currentPrice = this.swaps[this.swaps.length - 1].priceUsd;
    }

    // Calculate metrics for each window
    for (const [window, duration] of Object.entries(windows)) {
      const cutoffTime = now - duration;
      const recentSwaps = this.swaps.filter(s => s.timestamp >= cutoffTime);
      const recentPrices = this.priceHistory.filter(p => p.timestamp >= cutoffTime);
      
      // Volume (sum of all swap volumes in USD)
      this.metrics[window].volume = recentSwaps.reduce((sum, s) => sum + (s.volumeUsd || 0), 0);
      
      // Transaction count
      this.metrics[window].txns = recentSwaps.length;
      
      // Unique makers
      const makers = new Set(recentSwaps.map(s => s.walletAddress).filter(Boolean));
      this.metrics[window].makers = makers.size;
      
      // Price change %
      if (recentPrices.length >= 2) {
        const firstPrice = recentPrices[0].price;
        const lastPrice = recentPrices[recentPrices.length - 1].price;
        this.metrics[window].priceChange = ((lastPrice - firstPrice) / firstPrice) * 100;
      } else {
        this.metrics[window].priceChange = 0;
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
    const combineWindow = (windowKey) => {
      const baselineWindow = this.baseline[windowKey] || {
        volume: 0,
        txns: 0,
        makers: 0,
        priceChange: 0,
      };
      const liveWindow = this.metrics[windowKey] || {
        volume: 0,
        txns: 0,
        makers: 0,
        priceChange: 0,
      };
      const windowDurationMs = {
        '5m': 5 * 60 * 1000,
        '1h': 60 * 60 * 1000,
        '6h': 6 * 60 * 60 * 1000,
        '24h': 24 * 60 * 60 * 1000,
      }[windowKey] ?? 0;

      const combinedVolume = (baselineWindow.volume || 0) + (liveWindow.volume || 0);
      const combinedTxns = (baselineWindow.txns || 0) + (liveWindow.txns || 0);
      const combinedMakers = (baselineWindow.makers || 0) + (liveWindow.makers || 0);

      const hasLiveActivity =
        (liveWindow.txns || 0) > 0 ||
        (liveWindow.volume || 0) > 0 ||
        (typeof liveWindow.priceChange === 'number' && liveWindow.priceChange !== 0);

      let priceChangeValue = Number(baselineWindow.priceChange || 0);
      if (hasLiveActivity) {
        const currentPrice =
          Number(this.metrics.currentPrice || 0) ||
          Number(this.baseline.currentPrice || 0);
        const baselineOpen =
          this.baselineOpenPrices?.[windowKey] ??
          Number(this.baseline.currentPrice || 0);
        const timeSinceBaseline = this.baselineTimestamp
          ? Date.now() - this.baselineTimestamp
          : Number.MAX_SAFE_INTEGER;
        const hasWindowCoverage =
          timeSinceBaseline >= windowDurationMs || windowDurationMs === 0;

        if (!hasWindowCoverage && baselineOpen && currentPrice > 0) {
          const effectivePriceChange =
            ((currentPrice - baselineOpen) / baselineOpen) * 100;
          if (isFinite(effectivePriceChange)) {
            priceChangeValue = effectivePriceChange;
          } else {
            priceChangeValue = Number(liveWindow.priceChange || baselineWindow.priceChange || 0);
          }
        } else {
          priceChangeValue = Number(liveWindow.priceChange || baselineWindow.priceChange || 0);
        }
      }

      return {
        volume: combinedVolume,
        txns: combinedTxns,
        makers: combinedMakers,
        priceChange: priceChangeValue,
      };
    };

    const currentPrice = this.metrics.currentPrice || this.baseline.currentPrice || 0;
    const supplyForMarketCap =
      Number(this.baseline.circSupply) > 0
        ? Number(this.baseline.circSupply)
        : Number(this.baseline.totalSupply) > 0
        ? Number(this.baseline.totalSupply)
        : null;
    const derivedMarketCap =
      supplyForMarketCap && currentPrice > 0
        ? currentPrice * supplyForMarketCap
        : Number(this.baseline.marketCap) > 0
        ? Number(this.baseline.marketCap)
        : 0;
    const supplyForFdv =
      Number(this.baseline.totalSupply) > 0
        ? Number(this.baseline.totalSupply)
        : supplyForMarketCap;
    const derivedFdv =
      supplyForFdv && currentPrice > 0
        ? currentPrice * supplyForFdv
        : Number(this.baseline.fullyDilutedValuation) > 0
        ? Number(this.baseline.fullyDilutedValuation)
        : 0;
    const hasLiveData = this.swaps.length > 0;

    return {
      currentPrice,
      marketCap: derivedMarketCap,
      circSupply: supplyForMarketCap
        ? Number(this.baseline.circSupply) || null
        : null,
      totalSupply:
        Number(this.baseline.totalSupply) > 0 ? Number(this.baseline.totalSupply) : null,
      fullyDilutedValuation: derivedFdv,
      '5m': combineWindow('5m'),
      '1h': combineWindow('1h'),
      '6h': combineWindow('6h'),
      '24h': combineWindow('24h'),
      _hasLiveData: hasLiveData,
    };
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
    
    // Token tracking
    this.knownTokens = new Map(); // Map<tokenAddress, TokenMetrics>
    this.newTokenActivity = new Map(); // Map<tokenAddress, { swapCount, firstSeen, lastSeen, ... }>
    this.tokenMetadataCache = new Map(); // Map<tokenAddress, { name, symbol, decimals, supply }>
    this.activeConnections = new Map(); // Map<tokenAddress, Set<connectionId>>
    this.subscribedTokens = new Set(); // Set<tokenAddress>
    this.poolAddresses = new Map(); // Map<tokenAddress, poolAddress>
    this.swapHistory = new Map(); // Map<tokenAddress, Array<Swap>>
    this.swapHistoryLimit = Number(process.env.SWAP_HISTORY_LIMIT || 200);
    this.fullStateInterval = null;
    this.fullStateBroadcastMs = Number(process.env.FULL_STATE_BROADCAST_MS || 10000);
    this.lastFullStateBroadcast = 0;
    this.baselineSeedingPromise = null;
    this.baselineSeeded = false;
    this.statsReporterInterval = null;
    this.statsReportMs = Number(process.env.HYBRID_STATS_REPORT_MS || 60000);
    this.lastStatsSnapshot = {
      totalSwapsProcessed: 0,
      rpcFetches: 0,
      rpcSuccess: 0,
      rpcSwaps: 0,
      layer1Checked: 0,
      layer1Passed: 0,
      layer2Checked: 0,
      layer2Passed: 0,
      tokensDiscovered: 0,
    };
    this.recentLayer1Passes = [];
    this.recentLayer2Passes = [];
    this.recentDiscoveredTokens = [];
    this.streamStarting = false;
    
    // Multi-layer filter configuration
    this.filters = {
      layer1: {
        minimumAge: 0, // DISABLED: Let activity filters do the work
        activityThresholds: {
          minSwaps: 10,
          minVolume: 1000,  // $1000
          minTraders: 5
        },
        sustainedActivity: {
          minSwapsPerMinute: 2
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
    this.jupiterRequestDelay = Number(process.env.JUPITER_REQUEST_DELAY_MS || '200');
    if (Number.isNaN(this.jupiterRequestDelay) || this.jupiterRequestDelay < 50) {
      this.jupiterRequestDelay = 200;
    }
    this.lastJupiterRequest = 0;
    this.jupiterCache = new Map();
    this.jupiterCacheDuration = 10 * 60 * 1000; // 10 minutes cache
    
    // Token cache management
    this.tokenCache = [];
    this.tokenCacheSet = new Set();
    // Use persistent cache path (Render volume mount)
    this.cachePath = process.env.CACHE_PATH || '/var/data/dgo/cache/tokens-cache.json';
    this.cacheDir = path.dirname(this.cachePath);
    
    // Stats
    this.stats = {
      totalSwapsProcessed: 0,
      knownTokenSwaps: 0,
      newTokenSwaps: 0,
      tokensDiscovered: 0,
      streamRestarts: 0,
      lastStreamStart: null,
      rpcFetches: 0,
      rpcSuccess: 0,
      rpcSwaps: 0,
      rpcQueuePeak: 0
    };
    
    this.enableRpcFallback = process.env.ENABLE_RPC_FALLBACK !== 'false';
    this.rpcEndpoint = CONSTANT_K_RPC_ENDPOINT;
    this.rpcConnection = new Connection(this.rpcEndpoint, 'confirmed');
    this.rpcQueue = [];
    this.rpcQueueMap = new Map();
    this.rpcWorkerActive = false;
    this.rpcTokenPriceCache = new Map();
    
    // Initialize asynchronously
    this.initializeAsync();
  }

  /**
   * Async initialization
   */
  async initializeAsync() {
    try {
      console.log('🚀 [EnhancedHybridPriceService] Starting async initialization...');
      
      // Initialize gRPC client
      await this.initializeGrpcClient();
      
      // Load token cache
      await this.loadTokenCache();
      await this.seedJupiterBaseline(true);
      
      // Initialize SOL price
      await this.updateSolPrice();
      console.log(`💰 [EnhancedHybridPriceService] SOL Price: $${this.solPriceUSD.toFixed(2)}`);
      
      // Initialize persistent swap storage
      await this.chartDatabase.loadData();
      this.chartDatabase.startBatchWriter();
      console.log('✅ [EnhancedHybridPriceService] Persistent swap storage initialized');
      
      // Start DEX program stream
      await this.startDexProgramStream();
      this.startStatsReporter();
      
      console.log('✅ [EnhancedHybridPriceService] Initialization complete');
    } catch (error) {
      console.error('❌ [EnhancedHybridPriceService] Initialization failed:', error.message);
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
    if (this.dexStream) {
      console.log('⚠️ [EnhancedHybridPriceService] DEX program stream already active, skipping start');
      return;
    }
    if (this.streamStarting) {
      console.log('⚠️ [EnhancedHybridPriceService] Stream start already in progress, skipping');
      return;
    }
    if (!this.grpcClient) {
      console.log('⚠️ [EnhancedHybridPriceService] gRPC client not initialized yet, cannot start stream');
      return;
    }

    this.streamStarting = true;
    try {
      console.log('🔄 [EnhancedHybridPriceService] Starting DEX program stream...');
      console.log(`🎯 [EnhancedHybridPriceService] Monitoring ${DEX_PROGRAMS.length} DEX programs`);
      
      const YellowstoneGrpc = require('@triton-one/yellowstone-grpc');
      const CommitmentLevel = YellowstoneGrpc.CommitmentLevel || YellowstoneGrpc.default?.CommitmentLevel;
      
      // Create transaction filters for DEX programs
      const transactionFilters = {
        dex: {
          accountInclude: DEX_PROGRAMS,
          accountExclude: [],
          accountRequired: [],
          vote: false,
          failed: false,
          include_meta: true,
          include_token_balances: true,
          include_instructions: true,
          include_inner_instructions: true,
          include_loaded_addresses: true,
          include_accounts: true,
        }
      };
      
      // Subscribe to stream
      const stream = await this.grpcClient.subscribeOnce(
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
      
      this.dexStream = stream;
      this.stats.lastStreamStart = Date.now();
      this.stats.streamRestarts++;
      
      console.log('✅ [EnhancedHybridPriceService] DEX program stream connected');
      
      // Handle stream data
      stream.on('data', (msg) => {
        this.handleStreamData(msg);
      });
      
      // Handle stream errors
      stream.on('error', (error) => {
        console.error('❌ [EnhancedHybridPriceService] Stream error:', error.message);
        this.dexStream = null;
        this.scheduleStreamRestart();
      });
      
      // Handle stream end
      stream.on('end', () => {
        console.log('⚠️ [EnhancedHybridPriceService] Stream ended');
        this.dexStream = null;
        this.scheduleStreamRestart();
      });
      
    } catch (error) {
      console.error('❌ [EnhancedHybridPriceService] Failed to start DEX stream:', error.message);
      this.scheduleStreamRestart();
    } finally {
      this.streamStarting = false;
    }
  }

  /**
   * Schedule stream restart after error/end
   */
  scheduleStreamRestart() {
    const restartDelay = 5000; // 5 seconds
    if (this.streamStarting || this.dexStream) {
      return;
    }
    console.log(`🔄 [EnhancedHybridPriceService] Scheduling stream restart in ${restartDelay}ms...`);
    
    setTimeout(() => {
      this.startDexProgramStream();
    }, restartDelay);
  }

  /**
   * Handle incoming stream data
   */
  handleStreamData(msg) {
    try {
      const signature = this.extractSignatureFromMessage(msg);
      const swaps = this.parseBalanceChanges(msg);
      
      if (swaps && swaps.length > 0) {
        for (const swap of swaps) {
          this.stats.totalSwapsProcessed++;
          
          // Check if this is a known token or new token
          if (this.knownTokens.has(swap.tokenMint)) {
            this.processKnownTokenSwap(swap);
          } else {
            this.processNewTokenSwap(swap);
          }
        }
      } else if (this.enableRpcFallback) {
        const candidateMints = this.extractCandidateMints(msg);
        if (signature && candidateMints.size > 0) {
          const slot = msg.transaction?.slot ?? null;
          this.enqueueRpcFallback(signature, candidateMints, slot);
        }
      }
    } catch (error) {
      console.error('❌ [EnhancedHybridPriceService] Error handling stream data:', error.message);
    }
  }

  extractSignatureFromMessage(msg) {
    const container = msg.transaction?.transaction || msg.transactioon?.transaction;
    const direct = this.normalizeSignature(container?.signature);
    if (direct) return direct;

    const nestedSignature = container?.transaction?.signatures?.[0];
    const normalizedNested = this.normalizeSignature(nestedSignature);
    if (normalizedNested) return normalizedNested;

    return this.normalizeSignature(msg.transaction?.signature || msg.transactioon?.signature);
  }

  normalizeSignature(sig) {
    if (!sig) return null;
    if (typeof sig === 'string') return sig;
    if (Buffer.isBuffer(sig)) return bs58.encode(sig);
    if (sig instanceof Uint8Array) return bs58.encode(sig);
    if (sig.type === 'Buffer' && Array.isArray(sig.data)) {
      return bs58.encode(Uint8Array.from(sig.data));
    }
    return String(sig);
  }

  extractCandidateMints(msg) {
    const mints = new Set();
    const meta =
      msg.transaction?.transaction?.meta ||
      msg.transaction?.meta ||
      msg.transactioon?.transaction?.meta ||
      msg.transactioon?.meta;

    if (!meta) return mints;

    const consider = (balance) => {
      const mint = balance?.mint;
      if (!mint || mint === WSOL) return;
      if (this.isMintMonitored(mint)) {
        mints.add(mint);
      }
    };

    (meta.preTokenBalances ?? []).forEach(consider);
    (meta.postTokenBalances ?? []).forEach(consider);

    return mints;
  }

  enqueueRpcFallback(signature, candidateMints, slot) {
    if (!this.enableRpcFallback) return;
    if (!signature || candidateMints.size === 0) return;

    let item = this.rpcQueueMap.get(signature);
    if (item) {
      candidateMints.forEach((mint) => item.mints.add(mint));
      return;
    }

    item = {
      signature,
      mints: new Set(candidateMints),
      slot: slot ?? null,
    };

    this.rpcQueueMap.set(signature, item);
    this.rpcQueue.push(item);
    if (this.rpcQueue.length > this.stats.rpcQueuePeak) {
      this.stats.rpcQueuePeak = this.rpcQueue.length;
    }
    this.startRpcWorker();
  }

  async startRpcWorker() {
    if (!this.enableRpcFallback || this.rpcWorkerActive) return;
    if (this.rpcQueue.length === 0) return;

    this.rpcWorkerActive = true;
    try {
      while (this.rpcQueue.length > 0) {
        const item = this.rpcQueue.shift();
        if (!item) continue;
        this.rpcQueueMap.delete(item.signature);
        await this.processRpcQueueItem(item);
        if (RPC_FETCH_DELAY_MS > 0 && this.rpcQueue.length > 0) {
          await this.delay(RPC_FETCH_DELAY_MS);
        }
      }
    } finally {
      this.rpcWorkerActive = false;
    }
  }

  async processRpcQueueItem(item) {
    try {
      this.stats.rpcFetches++;
      const tx = await this.rpcConnection.getTransaction(item.signature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0,
      });

      if (!tx) {
        return;
      }

      this.stats.rpcSuccess++;

      const swapsDetected = [];
      for (const mint of item.mints) {
        if (!this.isMintMonitored(mint)) continue;

        const swaps = detectSwapsForMint(
          tx,
          mint,
          this.solPriceUSD || 0,
          this.rpcTokenPriceCache,
          undefined
        );

        for (const swap of swaps) {
          swap.signature = this.normalizeSignature(swap.signature) || item.signature;
          swap.slot = swap.slot ?? tx.slot ?? item.slot ?? null;
          swap.timestamp =
            swap.timestamp ?? (tx.blockTime ? tx.blockTime * 1000 : Date.now());
          swap.tokenMint = swap.tokenMint || mint;
          swap.walletAddress = swap.walletAddress || swap.maker || null;
          swap.source = swap.source || 'rpc-fallback';
          swapsDetected.push(swap);
        }
      }

      if (!swapsDetected.length) {
        return;
      }

      for (const swap of swapsDetected) {
        this.stats.totalSwapsProcessed++;
        this.stats.rpcSwaps++;

        if (this.knownTokens.has(swap.tokenMint)) {
          await this.processKnownTokenSwap(swap);
        } else {
          await this.processNewTokenSwap(swap);
        }
      }

      if (this.stats.rpcSwaps % 20 === 0) {
        console.log(
          `🛰️ [RPC Fallback] Processed ${this.stats.rpcSwaps} swaps via RPC (queue size: ${this.rpcQueue.length})`
        );
      }
    } catch (error) {
      console.error(`❌ [RPC Fallback] Error processing ${item.signature}:`, error.message);
    }
  }

  isMintMonitored(mint) {
    const normalized = this.normalizeAddress(mint);
    if (!normalized) return false;
    if (this.knownTokens.has(normalized)) return true;
    if (this.getMapValueIgnoreCase(this.knownTokens, normalized)) return true;
    if (this.newTokenActivity.has(normalized)) return true;
    if (this.tokenCacheSet.has(normalized) || this.tokenCacheSet.has(normalized.toLowerCase())) return true;
    return false;
  }

  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Parse balance changes from gRPC transaction data
   */
  parseBalanceChanges(msg) {
    try {
      const txContainer = msg?.transaction;
      if (!txContainer?.transaction) {
        return null;
      }

      const rawTx = txContainer.transaction;
      const meta = rawTx.meta || txContainer.meta;
      if (!meta) {
        return null;
      }

      const preBalances = meta.preTokenBalances || [];
      if (preBalances.length === 0) {
        return null;
      }

      let signature =
        rawTx.signature ||
        rawTx.transaction?.signatures?.[0] ||
        txContainer.signature;

      if (signature && Buffer.isBuffer(signature)) {
        signature = bs58.encode(signature);
      } else if (signature && typeof signature !== 'string') {
        signature = this.normalizeSignature(signature);
      }

      const canonicalTx = {
        transaction: rawTx.transaction || rawTx,
        meta,
        slot: Number(txContainer.slot ?? rawTx.slot ?? 0),
        blockTime: txContainer.blockTime ?? rawTx.blockTime ?? null,
        signature: this.normalizeSignature(signature) || undefined,
      };

      const tokenMints = new Set();
      for (const balance of preBalances) {
        const candidateMint = balance?.mint;
        if (!candidateMint || candidateMint === WSOL) continue;
        if (!this.isMintMonitored(candidateMint)) continue;
        tokenMints.add(candidateMint);
      }

      if (tokenMints.size === 0) {
        return null;
      }

      const swaps = [];
      for (const tokenMint of tokenMints) {
        try {
          const detected = detectSwapsForMint(
            canonicalTx,
            tokenMint,
            this.solPriceUSD || 0,
            this.rpcTokenPriceCache,
            this.poolAddresses.get(tokenMint) || null
          );

          for (const swap of detected) {
            const normalizedSignature =
              this.normalizeSignature(swap.signature || signature) || 'unknown';

            swaps.push({
              signature: normalizedSignature,
              signatureShort:
                normalizedSignature && normalizedSignature.length > 16
                  ? `${normalizedSignature.slice(0, 8)}...${normalizedSignature.slice(-8)}`
                  : normalizedSignature,
              explorerUrl:
                normalizedSignature && normalizedSignature !== 'unknown'
                  ? `https://solscan.io/tx/${normalizedSignature}`
                  : null,
              tokenMint: swap.tokenMint || tokenMint,
              slot: canonicalTx.slot || txContainer.slot || null,
              timestamp:
                swap.timestamp ??
                (txContainer.blockTime
                  ? txContainer.blockTime * 1000
                  : Date.now()),
              type: swap.type === 'SELL' ? 'Sell' : 'Buy',
              tokenAmount: Number(swap.tokenAmount ?? 0),
              solAmount: Number(
                swap.solAmount ??
                  (swap.counterMint === WSOL ? swap.baseAmount : 0)
              ),
              priceInSol: Number(
                swap.priceInSol ??
                  (swap.counterMint === WSOL && swap.tokenAmount
                    ? swap.baseAmount / swap.tokenAmount
                    : 0)
              ),
              priceUsd: Number(swap.priceUsd ?? 0),
              volumeUsd: Number(swap.volumeUsd ?? 0),
              walletAddress: swap.walletAddress || swap.maker || null,
              maker: swap.maker || swap.walletAddress || null,
              baseAmount: Number(swap.baseAmount ?? swap.counterAmount ?? 0),
              counterMint: swap.counterMint || null,
              price:
                swap.price ??
                (swap.priceUsd && swap.tokenAmount
                  ? swap.priceUsd / Math.max(swap.tokenAmount, 1e-12)
                  : undefined),
              source: 'grpc-dex',
            });
          }
        } catch (innerError) {
          console.error(
            `❌ [EnhancedHybridPriceService] Swap detection failed for ${tokenMint.slice(
              0,
              8
            )}...:`,
            innerError.message
          );
        }
      }

      if (swaps.length === 0) {
        return null;
      }

      const deduped = [];
      const seen = new Set();
      for (const swap of swaps) {
        const key = `${swap.signature}-${swap.tokenMint}-${swap.type}-${Math.round(
          (swap.tokenAmount ?? 0) * 1e6
        )}`;
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(swap);
      }

      return deduped.length > 0 ? deduped : null;
    } catch (error) {
      console.error(
        '❌ [EnhancedHybridPriceService] Error parsing transaction:',
        error.message
      );
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
      this.tokenCacheSet.add(swap.tokenMint);
      this.tokenCacheSet.add(swap.tokenMint.toLowerCase());
    }
    
    // Add swap to metrics
    const metricsSnapshot = metrics.getMetrics();
    const normalizedSwap = this.normalizeSwapForMetrics(
      swap.tokenMint,
      swap,
      metrics,
      metricsSnapshot
    );
    metrics.addSwap(normalizedSwap);
    const recordedSwap = this.recordSwap(normalizedSwap);
    
    // Save to ChartDatabase (uses storeSwaps with array)
    await this.chartDatabase.storeSwaps([{
      tokenAddress: normalizedSwap.tokenMint,
      timestamp: normalizedSwap.timestamp,
      type: normalizedSwap.type,
      price: normalizedSwap.priceUsd,
      tokenAmount: normalizedSwap.tokenAmount,
      volumeUsd: normalizedSwap.volumeUsd,
      signature: normalizedSwap.signature,
      source: normalizedSwap.source || 'grpc-dex'
    }]);
    
    // Broadcast price update via WebSocket
    if (this.webSocketServer) {
      const metricsData = metrics.getMetrics();
      const baseRecord = this.findTokenRecord(swap.tokenMint) || {};
      const liveMarketCap = this.computeLiveMarketCap(
        swap.tokenMint,
        metricsData.currentPrice,
        baseRecord.marketCap ?? 0
      );
      const liveFdv = this.computeFullyDilutedValuation(
        swap.tokenMint,
        metricsData.currentPrice,
        baseRecord.fullyDilutedValuation ?? 0
      );
      const supplyInfo = this.resolveTokenSupply(swap.tokenMint);
      const priceUpdatePayload = {
        price: metricsData.currentPrice,
        priceChange5m: metricsData['5m'].priceChange,
        priceChange1h: metricsData['1h'].priceChange,
        volume5m: metricsData['5m'].volume,
        volume1h: metricsData['1h'].volume,
        txns5m: metricsData['5m'].txns,
        makers5m: metricsData['5m'].makers,
        isLive: true
      };

      if (Number.isFinite(liveMarketCap) && liveMarketCap > 0) {
        priceUpdatePayload.marketCap = liveMarketCap;
      }
      if (Number.isFinite(liveFdv) && liveFdv > 0) {
        priceUpdatePayload.fullyDilutedValuation = liveFdv;
      }
      if (supplyInfo.circSupply) {
        priceUpdatePayload.circSupply = supplyInfo.circSupply;
        priceUpdatePayload.circulatingSupply = supplyInfo.circSupply;
      }
      if (supplyInfo.totalSupply) {
        priceUpdatePayload.totalSupply = supplyInfo.totalSupply;
        const fdv =
          Number.isFinite(metricsData.currentPrice) && metricsData.currentPrice > 0
            ? metricsData.currentPrice * supplyInfo.totalSupply
            : null;
        if (Number.isFinite(fdv) && fdv > 0) {
          priceUpdatePayload.fullyDilutedValuation = fdv;
        }
      }

      this.broadcastPriceUpdate(swap.tokenMint, priceUpdatePayload);
    }

    if (recordedSwap) {
      this.broadcastSwapUpdate(swap.tokenMint, recordedSwap);
    }

    if (
      this.webSocketServer &&
      Date.now() - this.lastFullStateBroadcast > this.fullStateBroadcastMs
    ) {
      this.broadcastFullStateUpdate();
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

    const metricsInstance = this.knownTokens.get(swap.tokenMint) || null;
    const metricsSnapshot = metricsInstance ? metricsInstance.getMetrics() : null;
    const normalizedSwap = this.normalizeSwapForMetrics(
      swap.tokenMint,
      swap,
      metricsInstance,
      metricsSnapshot
    );
    const recordedSwap = this.recordSwap(normalizedSwap);
    
    // Track activity for this new token
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
    activity.totalVolume += normalizedSwap.volumeUsd ?? 0;
    if (normalizedSwap.walletAddress) {
      activity.uniqueTraders.add(normalizedSwap.walletAddress);
    }
    activity.swaps.push(recordedSwap || normalizedSwap);
    activity.priceHistory.push({
      timestamp: normalizedSwap.timestamp,
      price: normalizedSwap.priceUsd,
    });
    
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
      
      // PASSED ALL FILTERS! Add to database
      console.log(`🆕 [EnhancedHybridPriceService] New token discovered: ${swap.tokenMint.slice(0, 8)}...`);
      console.log(`   Symbol: ${layer2Result.jupiterData.symbol}`);
      console.log(`   Swaps: ${activity.swapCount}, Volume: $${activity.totalVolume.toFixed(2)}, Traders: ${activity.uniqueTraders.size}`);
      
      // Add to known tokens
      const metrics = new TokenMetrics(swap.tokenMint);
      
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
        source: historicalSwap.source || 'grpc-dex'
        });
      }
      
      // Save all swaps to ChartDatabase at once
      if (swapsToStore.length > 0) {
        await this.chartDatabase.storeSwaps(swapsToStore);
      }
      
      this.knownTokens.set(swap.tokenMint, metrics);
      
      // Trigger token processing (scoring, Twitter data, etc.)
      this.triggerTokenProcessing(swap.tokenMint, layer2Result.jupiterData, activity);
      
      this.stats.tokensDiscovered++;
      this.filterStats.layer3.processed++;
      this.filterStats.layer3.successful++;
      this.newTokenActivity.delete(swap.tokenMint);

      this.recentDiscoveredTokens.push({
        tokenMint: swap.tokenMint,
        symbol: layer2Result.jupiterData?.symbol || null,
        volume: activity.totalVolume,
        traders: activity.uniqueTraders.size,
        timestamp: Date.now(),
      });
      if (this.recentDiscoveredTokens.length > 20) {
        this.recentDiscoveredTokens.shift();
      }

      if (this.webSocketServer) {
        this.broadcastFullStateUpdate();
      }
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
    this.recentLayer1Passes.push({
      tokenMint,
      swapCount: activity.swapCount,
      volume: activity.totalVolume,
      traders: activity.uniqueTraders.size,
      timestamp: Date.now(),
    });
    if (this.recentLayer1Passes.length > 20) {
      this.recentLayer1Passes.shift();
    }
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
      this.recentLayer2Passes.push({
        tokenMint,
        symbol: jupiterData.symbol || null,
        qualityScore,
        timestamp: Date.now(),
      });
      if (this.recentLayer2Passes.length > 20) {
        this.recentLayer2Passes.shift();
      }
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
      // Use Jupiter tokens search API (searches by mint address)
      const response = await axios.get(`${JUPITER_API_BASE}/search?query=${tokenAddress}`, {
        timeout: 5000
      });
      
      this.lastJupiterRequest = Date.now();
      
      // Response is an array, get first result
      if (response.data && Array.isArray(response.data) && response.data.length > 0) {
        const tokenData = response.data[0];
        const cacheKey = tokenData.address || tokenData.id || tokenAddress;
        if (cacheKey) {
          this.tokenMetadataCache.set(cacheKey, tokenData);
        }
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
   * Fetch Jupiter data for up to 100 tokens in a single request
   */
  async fetchJupiterDataBatch(addresses) {
    const results = new Map();

    if (!Array.isArray(addresses) || addresses.length === 0) {
      return results;
    }

    const normalizedBatch = Array.from(
      new Set(
        addresses
          .map((addr) => this.normalizeAddress(addr))
          .filter((addr) => typeof addr === 'string' && addr.length > 0)
      )
    ).slice(0, 100);

    if (normalizedBatch.length === 0) {
      return results;
    }

    const now = Date.now();
    const timeSinceLastRequest = now - this.lastJupiterRequest;
    if (timeSinceLastRequest < this.jupiterRequestDelay) {
      await new Promise((resolve) =>
        setTimeout(resolve, this.jupiterRequestDelay - timeSinceLastRequest)
      );
    }

    try {
      const response = await axios.get(
        `${JUPITER_API_BASE}/search?query=${normalizedBatch.join(',')}`,
        {
          timeout: 10000,
        }
      );

      this.lastJupiterRequest = Date.now();

      if (Array.isArray(response.data) && response.data.length > 0) {
        const timestamp = Date.now();
        for (const tokenData of response.data) {
          const key = this.normalizeAddress(
            tokenData?.id || tokenData?.address || tokenData?.mint
          );
          if (!key) continue;
          results.set(key, tokenData);
          this.tokenMetadataCache.set(key, tokenData);
          this.jupiterCache.set(key, {
            data: tokenData,
            timestamp,
          });
        }
      }
    } catch (error) {
      console.error(
        '❌ [EnhancedHybridPriceService] Jupiter batch API error:',
        error.message
      );
    }

    return results;
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
      // Use Jupiter tokens search API for SOL
      const response = await axios.get(`${JUPITER_API_BASE}/search?query=${WSOL}`, {
        timeout: 5000
      });
      
      if (response.data && Array.isArray(response.data) && response.data.length > 0) {
        const solData = response.data[0];
        if (solData.usdPrice) {
          this.solPriceUSD = parseFloat(solData.usdPrice);
          this.lastSolPriceUpdate = now;
          console.log(`💰 [EnhancedHybridPriceService] SOL Price updated: $${this.solPriceUSD.toFixed(2)}`);
        }
      }
    } catch (error) {
      console.error('❌ [EnhancedHybridPriceService] Failed to update SOL price:', error.message);
      // Fallback to a reasonable default if API fails
      if (this.solPriceUSD === 0) {
        this.solPriceUSD = 200; // Reasonable fallback
        console.log('⚠️ [EnhancedHybridPriceService] Using fallback SOL price: $200');
      }
    }
  }

  /**
   * Record swap for history and return normalized record
   */
  recordSwap(swap) {
    if (!swap || !swap.tokenMint) {
      return null;
    }

    const tokenMint = swap.tokenMint;
    if (!this.swapHistory.has(tokenMint)) {
      this.swapHistory.set(tokenMint, []);
    }

    const history = this.swapHistory.get(tokenMint);
    const normalizedSignature = this.normalizeSignature(swap.signature) || 'unknown';
    const maker =
      swap.maker ||
      swap.walletAddress ||
      swap.feePayer ||
      null;

    const normalizedSwap = {
      signature: normalizedSignature,
      signatureShort:
        normalizedSignature && normalizedSignature.length > 16
          ? `${normalizedSignature.slice(0, 8)}...${normalizedSignature.slice(-8)}`
          : normalizedSignature,
      explorerUrl:
        normalizedSignature && normalizedSignature !== 'unknown'
          ? `https://solscan.io/tx/${normalizedSignature}`
          : null,
      type: swap.type || 'UNKNOWN',
      tokenMint,
      tokenAmount: Number(swap.tokenAmount ?? 0),
      solAmount: Number(
        swap.solAmount ?? swap.baseAmount ?? swap.counterAmount ?? 0
      ),
      baseAmount: Number(
        swap.baseAmount ?? swap.solAmount ?? swap.counterAmount ?? 0
      ),
      priceInSol: Number(swap.priceInSol ?? swap.priceSol ?? 0),
      priceUsd: Number(swap.priceUsd ?? swap.price ?? 0),
      volumeUsd: Number(swap.volumeUsd ?? swap.usdAmount ?? 0),
      walletAddress: maker,
      maker,
      timestamp: swap.timestamp ?? Date.now(),
      slot: swap.slot ?? null,
      source: swap.source || 'grpc-dex',
    };

    history.push(normalizedSwap);
    if (history.length > this.swapHistoryLimit) {
      history.splice(0, history.length - this.swapHistoryLimit);
    }
    this.swapHistory.set(tokenMint, history);
    return normalizedSwap;
  }

  /**
   * Broadcast swap update to subscribers
   */
  broadcastSwapUpdate(tokenAddress, swapData) {
    if (!this.webSocketServer || !swapData) {
      return;
    }

    try {
      this.webSocketServer.broadcastSwapUpdate(tokenAddress, swapData);
    } catch (error) {
      console.error(
        '❌ [EnhancedHybridPriceService] Failed to broadcast swap update:',
        error.message
      );
    }
  }

  /**
   * Broadcast price update via WebSocket
   */
  broadcastPriceUpdate(tokenAddress, data) {
    if (!this.webSocketServer) return;
    
    try {
      // Use correct WebSocket method: broadcastToTokenSubscribers
      this.webSocketServer.broadcastToTokenSubscribers(tokenAddress, {
        type: 'priceUpdate',
        tokenAddress,
        data
      });
    } catch (error) {
      console.error('❌ [EnhancedHybridPriceService] Failed to broadcast price update:', error.message);
    }
  }

  setWebSocketServer(server) {
    if (this.webSocketServer === server) return;
    this.webSocketServer = server;
    if (server) {
      this.startFullStateBroadcast(true);
    } else {
      this.stopFullStateBroadcast();
    }
  }

  startFullStateBroadcast(forceImmediate = false) {
    if (!this.webSocketServer) return;
    if (this.fullStateInterval) return;

    if (forceImmediate) {
      this.broadcastFullStateUpdate();
    } else {
      setTimeout(() => this.broadcastFullStateUpdate(), 0);
    }

    this.fullStateInterval = setInterval(() => {
      this.broadcastFullStateUpdate();
    }, this.fullStateBroadcastMs);
  }

  stopFullStateBroadcast() {
    if (this.fullStateInterval) {
      clearInterval(this.fullStateInterval);
      this.fullStateInterval = null;
    }
  }

  broadcastFullStateUpdate() {
    if (!this.webSocketServer) return;

    try {
      const snapshot = this.getAllTokensState({
        includeRecentSwaps: false,
        swapLimit: 0,
      });

      const tokens = snapshot.tokens || [];
      const payload = {
        tokens,
        totals: snapshot.totals || {},
        tokenCount: tokens.length,
        hasTokens: tokens.length > 0,
        firstToken: tokens[0] || null,
        meta: {
          source: 'enhanced-hybrid',
          generatedAt: snapshot.timestamp || Date.now(),
        },
      };

      this.webSocketServer.broadcastFullStateUpdate(payload);
      this.lastFullStateBroadcast = Date.now();
    } catch (error) {
      console.error(
        '❌ [EnhancedHybridPriceService] Failed to broadcast full state:',
        error.message
      );
    }
  }

  startStatsReporter() {
    if (this.statsReporterInterval || this.statsReportMs <= 0) {
      return;
    }

    const report = () => {
      try {
        this.reportStats();
      } catch (error) {
        console.error('❌ [EnhancedHybridPriceService] Failed to report stats:', error.message);
      }
    };

    // Immediate report on startup
    report();
    this.statsReporterInterval = setInterval(report, this.statsReportMs);
  }

  stopStatsReporter() {
    if (this.statsReporterInterval) {
      clearInterval(this.statsReporterInterval);
      this.statsReporterInterval = null;
    }
  }

  reportStats() {
    const stats = this.getStats();
    const filterStats = this.getFilterStats();

    const delta = (current, previous) => current - previous;

    const swapsDelta = delta(stats.totalSwapsProcessed, this.lastStatsSnapshot.totalSwapsProcessed);
    const rpcFetchesDelta = delta(stats.rpcFetches, this.lastStatsSnapshot.rpcFetches);
    const rpcSuccessDelta = delta(stats.rpcSuccess, this.lastStatsSnapshot.rpcSuccess);
    const rpcSwapsDelta = delta(stats.rpcSwaps, this.lastStatsSnapshot.rpcSwaps);
    const layer1CheckedDelta = delta(filterStats.layer1.checked, this.lastStatsSnapshot.layer1Checked);
    const layer1PassedDelta = delta(filterStats.layer1.passed, this.lastStatsSnapshot.layer1Passed);
    const layer2CheckedDelta = delta(filterStats.layer2.checked, this.lastStatsSnapshot.layer2Checked);
    const layer2PassedDelta = delta(filterStats.layer2.passed, this.lastStatsSnapshot.layer2Passed);
    const tokensDiscoveredDelta = delta(stats.tokensDiscovered, this.lastStatsSnapshot.tokensDiscovered);

    const runtimeSeconds = stats.streamUptime ? Math.floor(stats.streamUptime / 1000) : 0;

    console.log('\n📊 [EnhancedHybridPriceService] STATS REPORT');
    console.log('============================================================');
    console.log(`⏰ Stream Uptime: ${runtimeSeconds}s`);
    console.log(`📈 Known Tokens: ${stats.knownTokens} | New Tokens Tracking: ${stats.newTokensTracking}`);
    console.log(
      `💰 Swaps Processed: ${stats.totalSwapsProcessed} (Δ ${swapsDelta >= 0 ? '+' : ''}${swapsDelta})`
    );
    console.log(
      `🛰️ RPC Fallback: fetches=${stats.rpcFetches} (Δ ${rpcFetchesDelta >= 0 ? '+' : ''}${rpcFetchesDelta}), success=${stats.rpcSuccess} (Δ ${rpcSuccessDelta >= 0 ? '+' : ''}${rpcSuccessDelta}), swaps=${stats.rpcSwaps} (Δ ${rpcSwapsDelta >= 0 ? '+' : ''}${rpcSwapsDelta}), queuePeak=${stats.rpcQueuePeak}`
    );
    console.log(
      `🚦 Layer1: checked=${filterStats.layer1.checked} (Δ ${layer1CheckedDelta >= 0 ? '+' : ''}${layer1CheckedDelta}), passed=${filterStats.layer1.passed} (Δ ${layer1PassedDelta >= 0 ? '+' : ''}${layer1PassedDelta})`
    );
    console.log(
      `🪐 Layer2: checked=${filterStats.layer2.checked} (Δ ${layer2CheckedDelta >= 0 ? '+' : ''}${layer2CheckedDelta}), passed=${filterStats.layer2.passed} (Δ ${layer2PassedDelta >= 0 ? '+' : ''}${layer2PassedDelta})`
    );
    console.log(
      `🆕 Tokens Discovered: ${stats.tokensDiscovered} (Δ ${tokensDiscoveredDelta >= 0 ? '+' : ''}${tokensDiscoveredDelta})`
    );

    const formatPass = (entry) => {
      const mint = entry.tokenMint || 'unknown';
      const shortMint = mint.length > 8 ? `${mint.slice(0, 8)}...` : mint;
      const label = entry.symbol || shortMint;
      return entry.tokenMint ? `${label} (${shortMint})` : label;
    };

    if (this.recentLayer1Passes.length > 0) {
      console.log(
        `✅ Layer 1 passes (${this.recentLayer1Passes.length}): ${this.recentLayer1Passes
          .map((entry) => {
            const volume = typeof entry.volume === 'number' ? `$${entry.volume.toFixed(2)}` : 'n/a';
            return `${formatPass(entry)} swaps=${entry.swapCount ?? 'n/a'} volume=${volume}`;
          })
          .join(', ')}`
      );
      this.recentLayer1Passes = [];
    }

    if (this.recentLayer2Passes.length > 0) {
      console.log(
        `🌐 Layer 2 passes (${this.recentLayer2Passes.length}): ${this.recentLayer2Passes
          .map((entry) => `${formatPass(entry)} quality=${entry.qualityScore ?? 'N/A'}`)
          .join(', ')}`
      );
      this.recentLayer2Passes = [];
    }

    if (this.recentDiscoveredTokens.length > 0) {
      console.log(
        `🚀 Newly discovered tokens (${this.recentDiscoveredTokens.length}): ${this.recentDiscoveredTokens
          .map((entry) => {
            const volume = typeof entry.volume === 'number' ? `$${entry.volume.toFixed(2)}` : 'n/a';
            const traders = entry.traders ?? 'n/a';
            return `${formatPass(entry)} volume=${volume} traders=${traders}`;
          })
          .join(', ')}`
      );
      this.recentDiscoveredTokens = [];
    }

    console.log('============================================================\n');

    this.lastStatsSnapshot = {
      totalSwapsProcessed: stats.totalSwapsProcessed,
      rpcFetches: stats.rpcFetches,
      rpcSuccess: stats.rpcSuccess,
      rpcSwaps: stats.rpcSwaps,
      layer1Checked: filterStats.layer1.checked,
      layer1Passed: filterStats.layer1.passed,
      layer2Checked: filterStats.layer2.checked,
      layer2Passed: filterStats.layer2.passed,
      tokensDiscovered: stats.tokensDiscovered,
    };
  }

  /**
   * Load token cache from disk
   */
  async loadTokenCache() {
    try {
      const data = await fs.readFile(this.cachePath, 'utf8');
      this.tokenCache = JSON.parse(data);
      this.tokenCacheSet = new Set();
      
      // Initialize TokenMetrics for all cached tokens
      for (const token of this.tokenCache) {
        if (token.contractAddress && !this.knownTokens.has(token.contractAddress)) {
          const metrics = new TokenMetrics(token.contractAddress);
          this.knownTokens.set(token.contractAddress, metrics);
        }
        if (token.contractAddress) {
          this.tokenCacheSet.add(token.contractAddress);
          this.tokenCacheSet.add(token.contractAddress.toLowerCase());
        }
      }
      
      console.log(`✅ [EnhancedHybridPriceService] Loaded ${this.tokenCache.length} tokens from cache`);
      console.log(`📊 [EnhancedHybridPriceService] Tracking ${this.knownTokens.size} known tokens`);

      if (this.webSocketServer) {
        this.broadcastFullStateUpdate();
      }
    } catch (error) {
      console.log('⚠️ [EnhancedHybridPriceService] No token cache found, starting fresh');
      this.tokenCache = [];
      this.tokenCacheSet = new Set();
    }
  }

  /**
   * Persist token cache to disk
   */
  async saveTokenCache() {
    try {
      await fs.mkdir(this.cacheDir, { recursive: true });
      await fs.writeFile(this.cachePath, JSON.stringify(this.tokenCache, null, 2), 'utf8');
      console.log(`💾 [EnhancedHybridPriceService] Saved ${this.tokenCache.length} tokens to cache`);
    } catch (error) {
      console.error('❌ [EnhancedHybridPriceService] Failed to save token cache:', error.message);
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
    const metrics = this.getMapValueIgnoreCase(this.knownTokens, tokenAddress);
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
  async getRealTimeTokenData(tokenAddress, options = {}) {
    const normalized = this.normalizeAddress(tokenAddress);
    if (!normalized) {
      return null;
    }

    const tokenRecord =
      this.findTokenRecord(normalized) || { contractAddress: normalized };

    let jupiterData =
      options.jupiterData ||
      tokenRecord.jupiterData ||
      this.tokenMetadataCache.get(normalized);

    if (!jupiterData && options.fetchJupiterOnMiss !== false) {
      jupiterData = await this.fetchJupiterData(normalized);
    }

    const snapshot = this.buildTokenStateSnapshot(normalized, tokenRecord, {
      includeRecentSwaps: options.includeRecentSwaps !== false,
      swapLimit: options.swapLimit ?? 50,
      jupiterData,
    });

    return snapshot;
  }

  /**
   * Normalize token address input
   */
  normalizeAddress(address) {
    if (!address) return null;
    if (typeof address === 'string') return address.trim();
    return String(address).trim();
  }

  /**
   * Find token record from cache using address
   */
  findTokenRecord(tokenAddress) {
    if (!tokenAddress || !this.tokenCache || this.tokenCache.length === 0) {
      return null;
    }

    const target = tokenAddress.toLowerCase();
    return (
      this.tokenCache.find((token) => {
        const candidates = [
          token.contractAddress,
          token.tokenAddress,
          token.mint,
          token.address,
          token.id,
        ];
        return candidates.some(
          (addr) => typeof addr === 'string' && addr.toLowerCase() === target
        );
      }) || null
    );
  }

  ensureTokenCacheEntry(tokenAddress) {
    const existing = this.findTokenRecord(tokenAddress);
    if (existing) return existing;

    const normalized = this.normalizeAddress(tokenAddress);
    if (!normalized) return null;

    const entry = {
      contractAddress: normalized,
      tokenAddress: normalized,
      source: 'jupiter',
      stage: 'jupiter',
      hasJupiterData: false,
    };

    this.tokenCache.push(entry);
    this.tokenCacheSet.add(normalized);
    this.tokenCacheSet.add(normalized.toLowerCase());
    return entry;
  }

  resolveTokenSupply(tokenAddress) {
    const normalized = this.normalizeAddress(tokenAddress);
    if (!normalized) {
      return { circSupply: null, totalSupply: null };
    }

    const record = this.findTokenRecord(normalized) || {};
    const metadata =
      this.getMapValueIgnoreCase(this.tokenMetadataCache, normalized) || {};
    const metrics =
      this.getMapValueIgnoreCase(this.knownTokens, normalized) || null;

    const pickNumeric = (candidates) => {
      for (const value of candidates) {
        const num = Number(value);
        if (Number.isFinite(num) && num > 0) {
          return num;
        }
      }
      return null;
    };

    const circSupply = pickNumeric([
      record.circSupply,
      record.circulatingSupply,
      record.baselineMetrics?.circSupply,
      record.baselineMetrics?.circulatingSupply,
      record.jupiterData?.circSupply,
      record.jupiterData?.circulatingSupply,
      metadata.circSupply,
      metadata.circulatingSupply,
      metadata.totalSupply,
      metadata.jupiterData?.circSupply,
      metrics?.baseline?.circSupply,
      metrics?.baseline?.totalSupply,
    ]);

    const totalSupply = pickNumeric([
      record.totalSupply,
      record.maxSupply,
      record.baselineMetrics?.totalSupply,
      record.jupiterData?.totalSupply,
      metadata.totalSupply,
      metadata.jupiterData?.totalSupply,
      metrics?.baseline?.totalSupply,
    ]);

    return { circSupply, totalSupply };
  }

  computeLiveMarketCap(tokenAddress, currentPrice, fallbackMarketCap = 0) {
    const price = Number(currentPrice);
    const { circSupply, totalSupply } = this.resolveTokenSupply(tokenAddress);
    const supply = circSupply ?? totalSupply ?? null;

    if (Number.isFinite(price) && price > 0 && supply && supply > 0) {
      const computed = price * supply;
      if (Number.isFinite(computed) && computed > 0) {
        return computed;
      }
    }

    const fallback = Number(fallbackMarketCap);
    if (Number.isFinite(fallback) && fallback > 0) {
      return fallback;
    }

    const record = this.findTokenRecord(tokenAddress) || {};
    const metadata =
      this.getMapValueIgnoreCase(this.tokenMetadataCache, tokenAddress) || {};

    const candidates = [
      record.marketCap,
      record.jupiterData?.mcap,
      record.jupiterData?.marketCap,
      metadata.mcap,
      metadata.marketCap,
    ];

    for (const value of candidates) {
      const num = Number(value);
      if (Number.isFinite(num) && num > 0) {
        return num;
      }
    }

    if (Number.isFinite(price) && price > 0 && supply && supply > 0) {
      const computed = price * supply;
      if (Number.isFinite(computed) && computed > 0) {
        return computed;
      }
    }

    return Number.isFinite(fallback) && fallback > 0 ? fallback : 0;
  }

  computeFullyDilutedValuation(tokenAddress, currentPrice, fallbackFdv = 0) {
    const price = Number(currentPrice);
    const { totalSupply } = this.resolveTokenSupply(tokenAddress);
    if (Number.isFinite(price) && price > 0 && totalSupply && totalSupply > 0) {
      const fdv = price * totalSupply;
      if (Number.isFinite(fdv) && fdv > 0) {
        return fdv;
      }
    }
    const fallback = Number(fallbackFdv);
    if (Number.isFinite(fallback) && fallback > 0) {
      return fallback;
    }
    return 0;
  }

  getReferencePrice(tokenAddress, metrics = null, metricsSnapshot = null) {
    const candidates = [];

    if (metricsSnapshot) {
      const metricPrice = Number(metricsSnapshot.currentPrice);
      if (Number.isFinite(metricPrice) && metricPrice > 0) {
        candidates.push(metricPrice);
      }
    }

    if (metrics?.baseline?.currentPrice) {
      const baselinePrice = Number(metrics.baseline.currentPrice);
      if (Number.isFinite(baselinePrice) && baselinePrice > 0) {
        candidates.push(baselinePrice);
      }
    }

    const record = this.findTokenRecord(tokenAddress) || {};
    const metadata =
      this.getMapValueIgnoreCase(this.tokenMetadataCache, tokenAddress) || {};

    candidates.push(
      record.price,
      record.priceUsd,
      record.jupiterData?.usdPrice,
      record.jupiterData?.price,
      record.baselineMetrics?.price,
      metadata.usdPrice,
      metadata.price
    );

    const supplyInfo = this.resolveTokenSupply(tokenAddress);
    if (
      record.marketCap &&
      supplyInfo.circSupply &&
      supplyInfo.circSupply > 0
    ) {
      candidates.push(record.marketCap / supplyInfo.circSupply);
    }

    if (
      metadata.marketCap &&
      supplyInfo.circSupply &&
      supplyInfo.circSupply > 0
    ) {
      candidates.push(metadata.marketCap / supplyInfo.circSupply);
    }

    for (const value of candidates) {
      const num = Number(value);
      if (Number.isFinite(num) && num > 0) {
        return num;
      }
    }

    return 0;
  }

  normalizeSwapForMetrics(tokenAddress, swap, metrics = null, metricsSnapshot = null) {
    const normalized = { ...swap };
    const tokenAmount = Number(normalized.tokenAmount ?? 0);
    const counterMint = normalized.counterMint || null;
    const referencePrice = this.getReferencePrice(
      tokenAddress,
      metrics,
      metricsSnapshot
    );

    const safeNumber = (value) => {
      const num = Number(value);
      return Number.isFinite(num) ? num : 0;
    };

    let derivedPrice = safeNumber(normalized.priceUsd || normalized.price);

    if ((!Number.isFinite(derivedPrice) || derivedPrice <= 0) && tokenAmount > 0) {
      const volUsd = safeNumber(normalized.volumeUsd);
      if (volUsd > 0) {
        derivedPrice = volUsd / tokenAmount;
      }
    }

    if ((!Number.isFinite(derivedPrice) || derivedPrice <= 0) && tokenAmount > 0) {
      const baseAmount = safeNumber(
        normalized.baseAmount ?? normalized.solAmount ?? 0
      );
      if (baseAmount > 0 && counterMint === WSOL && this.solPriceUSD > 0) {
        derivedPrice = (baseAmount * this.solPriceUSD) / tokenAmount;
      }
    }

    if ((!Number.isFinite(derivedPrice) || derivedPrice <= 0) && referencePrice > 0) {
      derivedPrice = referencePrice;
    }

    const configuredRatio = Number(process.env.PRICE_OUTLIER_RATIO || '5');
    const maxRatio = Number.isFinite(configuredRatio) && configuredRatio > 1 ? configuredRatio : 5;
    if (
      referencePrice > 0 &&
      Number.isFinite(derivedPrice) &&
      derivedPrice > 0
    ) {
      const ratio = derivedPrice / referencePrice;
      if (ratio > maxRatio || ratio < 1 / maxRatio) {
        derivedPrice = referencePrice;
      }
    }

    if (!(Number.isFinite(derivedPrice) && derivedPrice > 0)) {
      derivedPrice = referencePrice;
    }

    if (Number.isFinite(derivedPrice) && derivedPrice > 0) {
      normalized.priceUsd = derivedPrice;
      normalized.price = derivedPrice;
      if (tokenAmount > 0) {
        normalized.volumeUsd = derivedPrice * tokenAmount;
      }
      if (this.solPriceUSD > 0) {
        normalized.priceInSol = derivedPrice / this.solPriceUSD;
        if (
          (!normalized.solAmount || normalized.solAmount === 0) &&
          Number.isFinite(normalized.volumeUsd) &&
          normalized.volumeUsd > 0
        ) {
          normalized.solAmount = normalized.volumeUsd / this.solPriceUSD;
        }
      }
    }

    return normalized;
  }

  /**
   * Retrieve map value ignoring case (fallback helper)
   */
  getMapValueIgnoreCase(map, key) {
    if (!key || !map) return null;
    if (map.has(key)) return map.get(key);
    const target = key.toLowerCase();
    for (const [candidate, value] of map.entries()) {
      if (candidate && candidate.toLowerCase() === target) {
        return value;
      }
    }
    return null;
  }

  /**
   * Format metrics window to consistent shape
   */
  formatMetricsWindow(windowData = {}) {
    return {
      volume: Number(windowData.volume ?? 0),
      txns: Number(windowData.txns ?? 0),
      makers: Number(windowData.makers ?? 0),
      priceChange: Number(windowData.priceChange ?? 0),
    };
  }

  /**
   * Build baseline metrics from Jupiter data
   */
  buildBaselineFromJupiter(jupiterData) {
    const emptyWindow = () => ({
      volume: 0,
      txns: 0,
      makers: 0,
      priceChange: 0,
    });

    if (!jupiterData) {
      return {
        hasJupiterData: false,
        symbol: null,
        name: null,
        price: 0,
        marketCap: 0,
        liquidity: 0,
        volume24h: 0,
        circSupply: null,
        totalSupply: null,
        fullyDilutedValuation: 0,
        metricsData5m: emptyWindow(),
        metricsData1h: emptyWindow(),
        metricsData6h: emptyWindow(),
        metricsData24h: emptyWindow(),
      };
    }

    const formatStats = (stats) => ({
      volume: Number((stats?.buyVolume ?? 0) + (stats?.sellVolume ?? 0)),
      txns: Number((stats?.numBuys ?? 0) + (stats?.numSells ?? 0)),
      makers: Number(
        stats?.numTraders ?? stats?.numNetBuyers ?? stats?.numOrganicBuyers ?? 0
      ),
      priceChange: Number(stats?.priceChange ?? 0),
    });

    const baseline = {
      hasJupiterData: true,
      symbol: jupiterData.symbol || null,
      name: jupiterData.name || null,
      price: Number(jupiterData.usdPrice ?? jupiterData.price ?? 0),
      marketCap: Number(jupiterData.mcap ?? jupiterData.marketCap ?? 0),
      liquidity: Number(jupiterData.liquidity ?? 0),
      volume24h: Number(
        (jupiterData.stats24h?.buyVolume ?? 0) +
          (jupiterData.stats24h?.sellVolume ?? 0)
      ),
      circSupply: Number(jupiterData.circSupply ?? jupiterData.circulatingSupply ?? 0),
      totalSupply: Number(jupiterData.totalSupply ?? 0),
      fullyDilutedValuation: Number(jupiterData.fdv ?? jupiterData.fullyDilutedValuation ?? 0),
      metricsData5m: formatStats(jupiterData.stats5m ?? {}),
      metricsData1h: formatStats(jupiterData.stats1h ?? {}),
      metricsData6h: formatStats(jupiterData.stats6h ?? {}),
      metricsData24h: formatStats(jupiterData.stats24h ?? {}),
    };

    return baseline;
  }

  /**
   * Build token state snapshot combining baseline + live metrics
   */
  buildTokenStateSnapshot(tokenAddress, baseRecord = {}, options = {}) {
    const normalized = this.normalizeAddress(tokenAddress);
    if (!normalized) return null;

    const metrics =
      this.getMapValueIgnoreCase(this.knownTokens, normalized) || null;
    const metricsData = metrics ? metrics.getMetrics() : null;
    const metricsHasLiveData = metricsData?._hasLiveData ?? false;
    const jupiterData =
      options.jupiterData ||
      baseRecord.jupiterData ||
      this.getMapValueIgnoreCase(this.tokenMetadataCache, normalized);
    const baseline = this.buildBaselineFromJupiter(jupiterData || null);

    const metrics5m = metricsData
      ? this.formatMetricsWindow(metricsData['5m'])
      : null;
    const metrics1h = metricsData
      ? this.formatMetricsWindow(metricsData['1h'])
      : null;
    const metrics6h = metricsData
      ? this.formatMetricsWindow(metricsData['6h'])
      : null;
    const metrics24h = metricsData
      ? this.formatMetricsWindow(metricsData['24h'])
      : null;

    const price =
      (metricsData?.currentPrice ?? null) ??
      baseRecord.price ??
      baseRecord.priceUsd ??
      baseline.price;

    const liquidity =
      baseRecord.liquidity ??
      baseline.liquidity ??
      (metricsData?.liquidity ?? 0);

    const supplyInfo = this.resolveTokenSupply(normalized);
    const fallbackMarketCap =
      baseRecord.marketCap ?? baseline.marketCap ?? metricsData?.marketCap ?? 0;
    const marketCap = this.computeLiveMarketCap(
      normalized,
      price,
      fallbackMarketCap
    );
    const fullyDilutedValuation = this.computeFullyDilutedValuation(
      normalized,
      price,
      baseRecord.fullyDilutedValuation ??
        baseline.fullyDilutedValuation ??
        metricsData?.fullyDilutedValuation ??
        0
    );

    const volume24h =
      baseRecord.volume24h ??
      baseline.volume24h ??
      metrics24h?.volume ??
      0;

    const resolvedSymbol =
      baseRecord.symbol || jupiterData?.symbol || baseline.symbol;
    const resolvedName =
      baseRecord.name || jupiterData?.name || baseline.name;

    const payload = {
      ...baseRecord,
      tokenAddress: normalized,
      contractAddress: baseRecord.contractAddress || normalized,
      symbol: resolvedSymbol,
      name: resolvedName,
      price,
      priceUsd: price,
      marketCap,
      liquidity,
      volume24h,
      circSupply: supplyInfo.circSupply,
      totalSupply: supplyInfo.totalSupply,
      fullyDilutedValuation,
      priceChange5m:
        metrics5m?.priceChange ?? baseline.metricsData5m.priceChange,
      priceChange1h:
        metrics1h?.priceChange ?? baseline.metricsData1h.priceChange,
      priceChange6h:
        metrics6h?.priceChange ?? baseline.metricsData6h.priceChange,
      priceChange24h:
        metrics24h?.priceChange ?? baseline.metricsData24h.priceChange,
      volume5m: metrics5m?.volume ?? baseline.metricsData5m.volume,
      volume1h: metrics1h?.volume ?? baseline.metricsData1h.volume,
      volume6h: metrics6h?.volume ?? baseline.metricsData6h.volume,
      txns5m: metrics5m?.txns ?? baseline.metricsData5m.txns,
      txns1h: metrics1h?.txns ?? baseline.metricsData1h.txns,
      txns6h: metrics6h?.txns ?? baseline.metricsData6h.txns,
      txns24h: metrics24h?.txns ?? baseline.metricsData24h.txns,
      makers5m: metrics5m?.makers ?? baseline.metricsData5m.makers,
      makers1h: metrics1h?.makers ?? baseline.metricsData1h.makers,
      makers6h: metrics6h?.makers ?? baseline.metricsData6h.makers,
      makers24h: metrics24h?.makers ?? baseline.metricsData24h.makers,
      metricsData5m: metrics5m ?? baseline.metricsData5m,
      metricsData1h: metrics1h ?? baseline.metricsData1h,
      metricsData6h: metrics6h ?? baseline.metricsData6h,
      metricsData24h: metrics24h ?? baseline.metricsData24h,
      baseline5m: baseline.metricsData5m,
      baseline1h: baseline.metricsData1h,
      baseline6h: baseline.metricsData6h,
      baseline24h: baseline.metricsData24h,
      hasJupiterData: baseline.hasJupiterData,
      jupiterData: jupiterData || null,
      isLive: metricsHasLiveData,
      lastUpdated: Date.now(),
    };

    if (options.includeRecentSwaps) {
      payload.recentSwaps = this.getSwapHistory(
        normalized,
        options.swapLimit ?? 50
      );
    }

    return payload;
  }

  /**
   * Get recent swap history for a token
   */
  getSwapHistory(tokenAddress, limit = 50) {
    const history =
      this.getMapValueIgnoreCase(this.swapHistory, tokenAddress) || [];
    if (!history || history.length === 0) {
      return [];
    }

    if (typeof limit === 'number' && limit > 0) {
      return history.slice(-limit).reverse();
    }

    return [...history].reverse();
  }

  /**
   * Seed baseline Jupiter data for all tracked tokens
   */
  async seedJupiterBaseline(force = false) {
    if (this.baselineSeedingPromise) {
      return this.baselineSeedingPromise;
    }

    if (this.baselineSeeded && !force) {
      return;
    }

    const needsSeeding = () => {
      if (force) return true;
      if (!this.tokenCache || this.tokenCache.length === 0) return true;
      return this.tokenCache.some(
        (token) =>
          !token?.hasJupiterData ||
          !token?.jupiterData ||
          !token.jupiterData?.stats24h
      );
    };

    if (!needsSeeding()) {
      this.baselineSeeded = true;
      return;
    }

    this.baselineSeedingPromise = (async () => {
      const startTime = Date.now();
      const addresses = new Set();

      for (const token of this.tokenCache || []) {
        const normalized = this.normalizeAddress(
          token.contractAddress ||
            token.tokenAddress ||
            token.mint ||
            token.address ||
            token.id
        );
        if (normalized) {
          addresses.add(normalized);
        }
      }

      for (const [knownAddress] of this.knownTokens) {
        const normalized = this.normalizeAddress(knownAddress);
        if (normalized) {
          addresses.add(normalized);
        }
      }

      if (addresses.size === 0) {
        console.log(
          '⚠️ [EnhancedHybridPriceService] No tokens available for Jupiter baseline seeding'
        );
        this.baselineSeeded = true;
        return;
      }

      console.log(
        `🚀 [EnhancedHybridPriceService] Seeding Jupiter baseline for ${addresses.size} tokens...`
      );

      let seededCount = 0;
      let skippedCount = 0;
      let errorCount = 0;
      let metadataUpdated = false;

      const addressList = Array.from(addresses);
      const addressesToFetch = [];

      for (const address of addressList) {
        if (!address) continue;

        const cacheEntry = this.ensureTokenCacheEntry(address);
        if (!cacheEntry) {
          skippedCount++;
          continue;
        }

        const hasBaseline =
          cacheEntry.hasJupiterData &&
          cacheEntry.jupiterData &&
          cacheEntry.jupiterData.stats24h &&
          !force;

        if (hasBaseline) {
          skippedCount++;
          continue;
        }

        addressesToFetch.push({ address, cacheEntry });
      }

      const batchSize = 100;
      const totalBatches =
        addressesToFetch.length > 0
          ? Math.ceil(addressesToFetch.length / batchSize)
          : 0;

      for (let i = 0; i < addressesToFetch.length; i += batchSize) {
        const batchEntries = addressesToFetch.slice(i, i + batchSize);
        if (batchEntries.length === 0) continue;

        const batchAddresses = batchEntries.map((entry) => entry.address);
        const batchIndex = Math.floor(i / batchSize) + 1;

        console.log(
          `🔄 [EnhancedHybridPriceService] Jupiter batch ${batchIndex}/${totalBatches} (${batchAddresses.length} tokens)`
        );

        const batchDataMap = await this.fetchJupiterDataBatch(batchAddresses);

        for (const entry of batchEntries) {
          const { address, cacheEntry } = entry;
          const normalizedAddress = this.normalizeAddress(address);
          const jupiterData =
            batchDataMap.get(normalizedAddress) ||
            batchDataMap.get(address) ||
            null;

          if (!jupiterData) {
            skippedCount++;
            continue;
          }

          try {
            const baseline = this.buildBaselineFromJupiter(jupiterData);

            cacheEntry.jupiterData = jupiterData;
            cacheEntry.hasJupiterData = true;
            cacheEntry.jupiterTimestamp = new Date().toISOString();
            cacheEntry.price =
              typeof baseline.price === 'number' && baseline.price > 0
                ? baseline.price
                : cacheEntry.price ?? jupiterData.usdPrice ?? null;
            cacheEntry.priceUsd = cacheEntry.price;
            cacheEntry.marketCap =
              baseline.marketCap ?? cacheEntry.marketCap ?? null;
            cacheEntry.liquidity =
              baseline.liquidity ?? cacheEntry.liquidity ?? null;
            cacheEntry.volume24h =
              baseline.volume24h ?? cacheEntry.volume24h ?? null;
            cacheEntry.circSupply =
              (typeof jupiterData.circSupply === 'number' && jupiterData.circSupply > 0
                ? jupiterData.circSupply
                : baseline.circSupply) ??
              cacheEntry.circSupply ??
              null;
            cacheEntry.totalSupply =
              (typeof jupiterData.totalSupply === 'number' && jupiterData.totalSupply > 0
                ? jupiterData.totalSupply
                : baseline.totalSupply) ??
              cacheEntry.totalSupply ??
              null;
            const fdvFromJupiter =
              typeof jupiterData.fdv === 'number' && jupiterData.fdv > 0
                ? jupiterData.fdv
                : null;
            const supplyForFdv = cacheEntry.totalSupply ?? baseline.totalSupply;
            const fdvComputed =
              supplyForFdv && baseline.price
                ? baseline.price * supplyForFdv
                : null;
            cacheEntry.fullyDilutedValuation =
              fdvFromJupiter ??
              fdvComputed ??
              cacheEntry.fullyDilutedValuation ??
              null;
            cacheEntry.baselineSeededAt = Date.now();

            // Expose baseline metrics at top-level for ranking/table consumers
            cacheEntry.priceChange5m = baseline.metricsData5m.priceChange;
            cacheEntry.priceChange1h = baseline.metricsData1h.priceChange;
            cacheEntry.priceChange6h = baseline.metricsData6h.priceChange;
            cacheEntry.priceChange24h = baseline.metricsData24h.priceChange;

            cacheEntry.volume5m = baseline.metricsData5m.volume;
            cacheEntry.volume1h = baseline.metricsData1h.volume;
            cacheEntry.volume6h = baseline.metricsData6h.volume;

            cacheEntry.txns5m = baseline.metricsData5m.txns;
            cacheEntry.txns1h = baseline.metricsData1h.txns;
            cacheEntry.txns6h = baseline.metricsData6h.txns;
            cacheEntry.txns24h = baseline.metricsData24h.txns;

            cacheEntry.makers5m = baseline.metricsData5m.makers;
            cacheEntry.makers1h = baseline.metricsData1h.makers;
            cacheEntry.makers6h = baseline.metricsData6h.makers;
            cacheEntry.makers24h = baseline.metricsData24h.makers;

            cacheEntry.baselineMetrics = {
              price: baseline.price,
              volume24h: baseline.volume24h,
              metricsData5m: baseline.metricsData5m,
              metricsData1h: baseline.metricsData1h,
              metricsData6h: baseline.metricsData6h,
              metricsData24h: baseline.metricsData24h,
              circSupply: baseline.circSupply,
              totalSupply: baseline.totalSupply,
              marketCap: baseline.marketCap,
            };

            if (jupiterData.symbol && !cacheEntry.symbol) {
              cacheEntry.symbol = jupiterData.symbol;
            }
            if (jupiterData.name && !cacheEntry.name) {
              cacheEntry.name = jupiterData.name;
            }

            if (normalizedAddress) {
              this.tokenMetadataCache.set(normalizedAddress, jupiterData);
              this.tokenMetadataCache.set(address, jupiterData);
              this.jupiterCache.set(normalizedAddress, {
                data: jupiterData,
                timestamp: Date.now(),
              });
            }

            let metrics =
              this.getMapValueIgnoreCase(this.knownTokens, normalizedAddress) ||
              null;
            if (!metrics) {
              metrics = new TokenMetrics(normalizedAddress);
              this.knownTokens.set(normalizedAddress, metrics);
            }

            metrics.seedBaseline({
              price: baseline.price,
              marketCap: baseline.marketCap,
              '5m': baseline.metricsData5m,
              '1h': baseline.metricsData1h,
              '6h': baseline.metricsData6h,
              '24h': baseline.metricsData24h,
              circSupply: baseline.circSupply,
              totalSupply: baseline.totalSupply,
              fullyDilutedValuation: baseline.fullyDilutedValuation,
            });

            seededCount++;
            metadataUpdated = true;

            if (
              seededCount % 50 === 0 ||
              seededCount === addressesToFetch.length ||
              seededCount === addresses.size
            ) {
              console.log(
                `📈 [EnhancedHybridPriceService] Jupiter baseline seeded for ${seededCount}/${addresses.size} tokens...`
              );
            }
          } catch (error) {
            errorCount++;
            console.error(
              `❌ [EnhancedHybridPriceService] Failed to seed Jupiter baseline for ${normalizedAddress}:`,
              error.message
            );
          }
        }
      }

      if (metadataUpdated) {
        await this.saveTokenCache();
      }

      console.log(
        `✅ [EnhancedHybridPriceService] Jupiter baseline seeding complete. Seeded: ${seededCount}, skipped: ${skippedCount}, errors: ${errorCount}, duration: ${(
          (Date.now() - startTime) /
          1000
        ).toFixed(1)}s`
      );

      if (metadataUpdated && this.webSocketServer) {
        this.broadcastFullStateUpdate();
      }

      this.baselineSeeded = true;
    })()
      .catch((error) => {
        console.error(
          '❌ [EnhancedHybridPriceService] Jupiter baseline seeding failed:',
          error.message
        );
      })
      .finally(() => {
        this.baselineSeedingPromise = null;
      });

    return this.baselineSeedingPromise;
  }

  /**
   * Get real-time price snapshot for a token
   */
  getRealTimePrice(tokenAddress) {
    const snapshot = this.buildTokenStateSnapshot(
      tokenAddress,
      this.findTokenRecord(tokenAddress) || { contractAddress: tokenAddress },
      {
        includeRecentSwaps: false,
        swapLimit: 0,
      }
    );

    if (!snapshot) {
      return null;
    }

    return {
      tokenAddress: snapshot.tokenAddress,
      price: snapshot.price,
      priceUsd: snapshot.priceUsd,
      priceChange5m: snapshot.priceChange5m,
      priceChange1h: snapshot.priceChange1h,
      priceChange6h: snapshot.priceChange6h,
      priceChange24h: snapshot.priceChange24h,
      volume5m: snapshot.volume5m,
      volume1h: snapshot.volume1h,
      volume6h: snapshot.volume6h,
      volume24h: snapshot.volume24h,
      lastUpdated: snapshot.lastUpdated,
      isLive: snapshot.isLive,
    };
  }

  /**
   * Return full token state (baseline + live metrics) for all tracked tokens
   */
  getAllTokensState(options = {}) {
    const config = {
      includeRecentSwaps:
        options.includeRecentSwaps !== undefined
          ? options.includeRecentSwaps
          : true,
      swapLimit: options.swapLimit ?? 50,
    };

    const tokens = [];
    const seen = new Set();

    for (const token of this.tokenCache || []) {
      const address = this.normalizeAddress(
        token.contractAddress ||
          token.tokenAddress ||
          token.mint ||
          token.address ||
          token.id
      );
      if (!address) continue;
      const snapshot = this.buildTokenStateSnapshot(address, token, {
        ...config,
        jupiterData: token.jupiterData,
      });
      if (snapshot) {
        tokens.push(snapshot);
        seen.add(address);
      }
    }

    for (const [address] of this.knownTokens) {
      if (seen.has(address)) continue;
      const metadata =
        this.getMapValueIgnoreCase(this.tokenMetadataCache, address) || null;
      const placeholder = {
        contractAddress: address,
        tokenAddress: address,
        symbol: metadata?.symbol,
        name: metadata?.name,
        jupiterData: metadata,
      };
      const snapshot = this.buildTokenStateSnapshot(address, placeholder, {
        ...config,
        jupiterData: metadata,
      });
      if (snapshot) {
        tokens.push(snapshot);
        seen.add(address);
      }
    }

    return {
      tokens,
      totals: {
        tokens: tokens.length,
        knownTokens: this.knownTokens.size,
        monitoredTokens: this.subscribedTokens.size,
      },
      timestamp: Date.now(),
      source: 'enhanced-hybrid',
    };
  }

  /**
   * Get real-time operational stats
   */
  getRealTimeStats() {
    return {
      totalTokens: this.knownTokens.size,
      monitoredTokens: this.subscribedTokens.size,
      activeStreams: Array.from(this.knownTokens.keys()),
      subscribedTokens: Array.from(this.subscribedTokens.values()),
      activeConnections: Array.from(this.activeConnections.entries()).map(
        ([token, connections]) => ({
          tokenAddress: token,
          connectionCount: connections.size,
        })
      ),
      rpc: {
        queueLength: this.rpcQueue.length,
        queuePeak: this.stats.rpcQueuePeak,
        fetches: this.stats.rpcFetches,
        success: this.stats.rpcSuccess,
        swaps: this.stats.rpcSwaps,
      },
      stream: {
        restarts: this.stats.streamRestarts,
        lastStart: this.stats.lastStreamStart,
        uptimeMs: this.stats.lastStreamStart
          ? Date.now() - this.stats.lastStreamStart
          : 0,
      },
      newTokensTracking: this.newTokenActivity.size,
      grpcInitialized: this.isGrpcInitialized(),
    };
  }

  /**
   * Register a connection for a token (compatibility helper)
   */
  registerConnection(tokenAddress, connectionId) {
    const normalized = this.normalizeAddress(tokenAddress);
    if (!normalized || !connectionId) return;
    if (!this.activeConnections.has(normalized)) {
      this.activeConnections.set(normalized, new Set());
    }
    this.activeConnections.get(normalized).add(connectionId);
  }

  /**
   * Remove a connection for a token (compatibility helper)
   */
  removeConnection(tokenAddress, connectionId) {
    const normalized = this.normalizeAddress(tokenAddress);
    if (!normalized || !connectionId) return;

    const connections = this.activeConnections.get(normalized);
    if (connections) {
      connections.delete(connectionId);
      if (connections.size === 0) {
        this.activeConnections.delete(normalized);
      }
    }
  }

  /**
   * Subscribe to token updates (compatibility helper)
   */
  subscribeToToken(tokenAddress) {
    const normalized = this.normalizeAddress(tokenAddress);
    if (!normalized) return false;
    this.subscribedTokens.add(normalized);
    return true;
  }

  /**
   * Unsubscribe from token updates (compatibility helper)
   */
  unsubscribeFromToken(tokenAddress) {
    const normalized = this.normalizeAddress(tokenAddress);
    if (!normalized) return false;
    return this.subscribedTokens.delete(normalized);
  }

  /**
   * Stop real-time monitoring (no-op for unified program stream)
   */
  async stopRealTimeMonitoring() {
    console.log(
      'ℹ️ [EnhancedHybridPriceService] stopRealTimeMonitoring is a no-op (unified DEX stream always on)'
    );
    return true;
  }

  /**
   * Start real-time monitoring (ensures stream is active)
   */
  async startRealTimeMonitoring() {
    if (!this.dexStream) {
      await this.startDexProgramStream();
    }
    return true;
  }

  /**
   * Ensure token is being monitored (compatibility method)
   * With DEX program filtering, all tokens are automatically monitored
   */
  async ensureTokenMonitoring(tokenAddress) {
    // Check if token is already in known tokens
    const normalized = this.normalizeAddress(tokenAddress);
    if (!normalized) {
      return false;
    }

    if (this.knownTokens.has(normalized)) {
      this.subscribedTokens.add(normalized);
      return true;
    }
    
    // Add to known tokens
    const metrics = new TokenMetrics(normalized);
    this.knownTokens.set(normalized, metrics);
    this.subscribedTokens.add(normalized);

    console.log(
      `✅ [EnhancedHybridPriceService] Added ${normalized.slice(
        0,
        8
      )}... to known tokens (will receive swaps from DEX stream)`
    );
    
    return true;
  }

  /**
   * Cleanup on shutdown
   */
  async shutdown() {
    console.log('🛑 [EnhancedHybridPriceService] Shutting down...');
    
    if (this.dexStream) {
      this.dexStream.cancel();
      this.dexStream = null;
    }
    
    if (this.chartDatabase) {
      await this.chartDatabase.stopBatchWriter();
    }

    this.stopStatsReporter();
    this.stopFullStateBroadcast();
    
    console.log('✅ [EnhancedHybridPriceService] Shutdown complete');
  }
}

export default EnhancedHybridPriceService;

