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
const JUPITER_API_BASE = 'https://lite-api.jup.ag/tokens/v2';
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
    
    // Cached metrics (updated on each swap)
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
    
    this.updateMetrics();
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
    
    // Token tracking
    this.knownTokens = new Map(); // Map<tokenAddress, TokenMetrics>
    this.newTokenActivity = new Map(); // Map<tokenAddress, { swapCount, firstSeen, lastSeen }>
    this.tokenMetadataCache = new Map(); // Map<tokenAddress, { name, symbol, decimals, supply }>
    
    // SOL price tracking
    this.solPriceUSD = 0;
    this.lastSolPriceUpdate = 0;
    this.solPriceCacheDuration = 60000; // 1 minute
    
    // Persistent swap storage
    this.chartDatabase = new ChartDatabase();
    
    // Jupiter API rate limiting
    this.jupiterRequestQueue = [];
    this.jupiterRequestDelay = 1000; // 1 second between requests
    this.lastJupiterRequest = 0;
    this.jupiterCache = new Map();
    this.jupiterCacheDuration = 10 * 60 * 1000; // 10 minutes cache
    
    // Token cache management
    this.tokenCache = [];
    this.cachePath = path.join(process.cwd(), 'cache', 'tokens-cache.json');
    
    // Stats
    this.stats = {
      totalSwapsProcessed: 0,
      knownTokenSwaps: 0,
      newTokenSwaps: 0,
      tokensDiscovered: 0,
      streamRestarts: 0,
      lastStreamStart: null
    };
    
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
      
      // Initialize SOL price
      await this.updateSolPrice();
      console.log(`💰 [EnhancedHybridPriceService] SOL Price: $${this.solPriceUSD.toFixed(2)}`);
      
      // Initialize persistent swap storage
      await this.chartDatabase.loadDatabase();
      this.chartDatabase.startBatchWriter();
      console.log('✅ [EnhancedHybridPriceService] Persistent swap storage initialized');
      
      // Start DEX program stream
      await this.startDexProgramStream();
      
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
      
      // Handle stream data
      this.dexStream.on('data', (msg) => {
        this.handleStreamData(msg);
      });
      
      // Handle stream errors
      this.dexStream.on('error', (error) => {
        console.error('❌ [EnhancedHybridPriceService] Stream error:', error.message);
        this.scheduleStreamRestart();
      });
      
      // Handle stream end
      this.dexStream.on('end', () => {
        console.log('⚠️ [EnhancedHybridPriceService] Stream ended');
        this.scheduleStreamRestart();
      });
      
    } catch (error) {
      console.error('❌ [EnhancedHybridPriceService] Failed to start DEX stream:', error.message);
      this.scheduleStreamRestart();
    }
  }

  /**
   * Schedule stream restart after error/end
   */
  scheduleStreamRestart() {
    const restartDelay = 5000; // 5 seconds
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
      }
    } catch (error) {
      console.error('❌ [EnhancedHybridPriceService] Error handling stream data:', error.message);
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
      
      // Extract signature
      let signature = tx.signature || 
                     tx.transaction?.signatures?.[0] || 
                     msg.transaction?.signature;
      
      if (signature && Buffer.isBuffer(signature)) {
        signature = Buffer.from(signature).toString('base64');
      }

      // Get balance changes from meta
      const meta = tx.meta || msg.transaction.meta;
      if (!meta) {
        return null;
      }

      const preBalances = meta.preTokenBalances || [];
      const postBalances = meta.postTokenBalances || [];

      if (preBalances.length === 0) {
        return null;
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
          const isBuy = tokenIn > 0;
          const tokenAmount = isBuy ? tokenIn : tokenOut;
          const solAmount = isBuy ? solOut : solIn;

          if (tokenAmount > 0 && solAmount > 0) {
            const priceInSol = solAmount / tokenAmount;
            const priceUsd = priceInSol * this.solPriceUSD;
            const volumeUsd = solAmount * this.solPriceUSD;

            swaps.push({
              signature: signature?.slice(0, 32) || 'unknown',
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
  processKnownTokenSwap(swap) {
    this.stats.knownTokenSwaps++;
    
    // Get or create TokenMetrics
    let metrics = this.knownTokens.get(swap.tokenMint);
    if (!metrics) {
      metrics = new TokenMetrics(swap.tokenMint);
      this.knownTokens.set(swap.tokenMint, metrics);
    }
    
    // Add swap to metrics
    metrics.addSwap(swap);
    
    // Save to ChartDatabase
    this.chartDatabase.addSwap(swap.tokenMint, {
      timestamp: swap.timestamp,
      type: swap.type,
      price: swap.priceUsd,
      amount: swap.tokenAmount,
      volumeUsd: swap.volumeUsd,
      signature: swap.signature
    });
    
    // Broadcast price update via WebSocket
    if (this.webSocketServer) {
      const metricsData = metrics.getMetrics();
      this.broadcastPriceUpdate(swap.tokenMint, {
        price: metricsData.currentPrice,
        priceChange5m: metricsData['5m'].priceChange,
        priceChange1h: metricsData['1h'].priceChange,
        volume5m: metricsData['5m'].volume,
        volume1h: metricsData['1h'].volume,
        txns5m: metricsData['5m'].txns,
        makers5m: metricsData['5m'].makers,
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
    
    // Track activity for this new token
    let activity = this.newTokenActivity.get(swap.tokenMint);
    if (!activity) {
      activity = {
        swapCount: 0,
        firstSeen: Date.now(),
        lastSeen: Date.now(),
        totalVolume: 0
      };
      this.newTokenActivity.set(swap.tokenMint, activity);
    }
    
    activity.swapCount++;
    activity.lastSeen = Date.now();
    activity.totalVolume += swap.volumeUsd;
    
    // Apply filters before adding to database
    const shouldAdd = await this.applyTokenFilters(swap.tokenMint, activity);
    
    if (shouldAdd) {
      console.log(`🆕 [EnhancedHybridPriceService] New token discovered: ${swap.tokenMint.slice(0, 8)}... (${activity.swapCount} swaps, $${activity.totalVolume.toFixed(2)} volume)`);
      
      // Add to known tokens
      const metrics = new TokenMetrics(swap.tokenMint);
      metrics.addSwap(swap);
      this.knownTokens.set(swap.tokenMint, metrics);
      
      // Save to ChartDatabase
      this.chartDatabase.addSwap(swap.tokenMint, {
        timestamp: swap.timestamp,
        type: swap.type,
        price: swap.priceUsd,
        amount: swap.tokenAmount,
        volumeUsd: swap.volumeUsd,
        signature: swap.signature
      });
      
      // Trigger token processing (scoring, Twitter data, etc.)
      this.triggerTokenProcessing(swap.tokenMint);
      
      this.stats.tokensDiscovered++;
      this.newTokenActivity.delete(swap.tokenMint);
    }
  }

  /**
   * Apply multi-layer filters to new tokens
   */
  async applyTokenFilters(tokenMint, activity) {
    // Filter 1: Minimum activity threshold
    if (activity.swapCount < 3) {
      return false; // Need at least 3 swaps
    }
    
    // Filter 2: Minimum volume threshold
    if (activity.totalVolume < 100) {
      return false; // Need at least $100 volume
    }
    
    // Filter 3: Check Jupiter API for quality indicators
    try {
      const jupiterData = await this.fetchJupiterData(tokenMint);
      
      if (!jupiterData) {
        return false; // Not on Jupiter
      }
      
      // Must have at least one quality indicator
      const hasLaunchpad = jupiterData.launchpad && jupiterData.launchpad !== '';
      const hasGraduatedAt = jupiterData.graduatedAt && jupiterData.graduatedAt !== '';
      const hasOrganicScore = jupiterData.organicScore && jupiterData.organicScore > 0;
      
      if (!hasLaunchpad && !hasGraduatedAt && !hasOrganicScore) {
        return false; // No quality indicators
      }
      
      return true;
      
    } catch (error) {
      console.error(`❌ [EnhancedHybridPriceService] Error checking Jupiter data for ${tokenMint}:`, error.message);
      return false;
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
      const response = await axios.get(`${JUPITER_API_BASE}/${tokenAddress}`, {
        timeout: 5000
      });
      
      this.lastJupiterRequest = Date.now();
      
      if (response.data) {
        this.jupiterCache.set(tokenAddress, {
          data: response.data,
          timestamp: Date.now()
        });
        return response.data;
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
   * Update SOL price
   */
  async updateSolPrice() {
    const now = Date.now();
    if (now - this.lastSolPriceUpdate < this.solPriceCacheDuration) {
      return; // Use cached price
    }
    
    try {
      const response = await axios.get(`${JUPITER_API_BASE}/${WSOL}`, {
        timeout: 5000
      });
      
      if (response.data?.price) {
        this.solPriceUSD = parseFloat(response.data.price);
        this.lastSolPriceUpdate = now;
      }
    } catch (error) {
      console.error('❌ [EnhancedHybridPriceService] Failed to update SOL price:', error.message);
    }
  }

  /**
   * Broadcast price update via WebSocket
   */
  broadcastPriceUpdate(tokenAddress, data) {
    if (!this.webSocketServer) return;
    
    try {
      this.webSocketServer.broadcast({
        type: 'priceUpdate',
        tokenAddress,
        data
      });
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
      
      // Initialize TokenMetrics for all cached tokens
      for (const token of this.tokenCache) {
        if (token.contractAddress && !this.knownTokens.has(token.contractAddress)) {
          const metrics = new TokenMetrics(token.contractAddress);
          this.knownTokens.set(token.contractAddress, metrics);
        }
      }
      
      console.log(`✅ [EnhancedHybridPriceService] Loaded ${this.tokenCache.length} tokens from cache`);
      console.log(`📊 [EnhancedHybridPriceService] Tracking ${this.knownTokens.size} known tokens`);
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
      isLive: true,
      lastUpdate: Date.now()
    };
  }

  /**
   * Ensure token is being monitored (compatibility method)
   * With DEX program filtering, all tokens are automatically monitored
   */
  async ensureTokenMonitoring(tokenAddress) {
    // Check if token is already in known tokens
    if (this.knownTokens.has(tokenAddress)) {
      return true;
    }
    
    // Add to known tokens
    const metrics = new TokenMetrics(tokenAddress);
    this.knownTokens.set(tokenAddress, metrics);
    
    console.log(`✅ [EnhancedHybridPriceService] Added ${tokenAddress.slice(0, 8)}... to known tokens (will receive swaps from DEX stream)`);
    
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
    
    console.log('✅ [EnhancedHybridPriceService] Shutdown complete');
  }
}

export default EnhancedHybridPriceService;
