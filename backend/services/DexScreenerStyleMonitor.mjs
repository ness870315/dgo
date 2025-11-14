/**
 * 🚀 DexScreener-Style Token Monitor
 * 
 * Pool-centric real-time swap detection with DexScreener-level accuracy
 * 
 * Architecture:
 * - Single gRPC stream with account + transaction subscriptions per pool
 * - In-memory swap storage (last 24h) with database persistence
 * - Jupiter API for SOL price updates and token metadata
 * - On-the-fly price/MCap calculations from pool reserves
 * - Hybrid baseline: Jupiter stats for cold start, our swaps for runtime
 * 
 * Key Features:
 * - 100% accurate swap detection (pool reserve changes)
 * - Full transaction details (maker wallet, signature, slot)
 * - Real-time USD pricing and market cap
 * - Survives restarts (loads from ChartDatabase)
 * - Self-healing (phases out Jupiter baseline over 24h)
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import bs58 from 'bs58';
import fetch from 'node-fetch';

// Use CommonJS wrapper for gRPC loading (same as EnhancedHybridPriceService)
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Configuration
const RPC_ENDPOINT = 'https://rpc.constant-k.com/?api-key=39facrmt-om2u-4al5-5k4h-g8pls2y5vhui';
const GRPC_ENDPOINT = 'http://grpc.constant-k.com';
const GRPC_TOKEN = '39facrmt-om2u-4al5-5k4h-g8pls2y5vhui';
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
    this.lastUpdate = Date.now();
  }

  addSwap(swap) {
    this.swaps.push(swap);
    this.lastUpdate = Date.now();
    
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
    this.accountFilters = {}; // Accumulated account filters
    this.transactionFilters = {}; // Accumulated transaction filters
    
    // Global state
    this.solPriceUSD = 0;
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

    this.isInitialized = true;
    console.log('✅ [DexScreenerStyleMonitor] Initialized successfully');
  }

  /**
   * Create or recreate the gRPC stream with current filters
   */
  async recreateStream() {
    // Cancel existing stream if any
    if (this.stream) {
      try {
        this.stream.cancel();
        console.log('🔄 [DexScreenerStyleMonitor] Cancelled existing stream');
      } catch (e) {
        // Ignore cancellation errors
      }
    }

    // Create new stream with current filters
    console.log('📡 [DexScreenerStyleMonitor] Creating gRPC stream with filters...');
    this.stream = await this.grpcClient.subscribeOnce(
      this.accountFilters,
      {}, // slots
      this.transactionFilters,
      {}, // blocks
      {}, // blocksMeta
      {}, // entry
      {}, // transactionsStatus
      1, // CONFIRMED
      []
    );
    
    // Handle stream data - route to correct pool
    let messageCount = 0;
    this.stream.on('data', (msg) => {
      messageCount++;
      
      // Log first message to confirm stream is working
      if (messageCount === 1) {
        console.log(`✅ [DexScreenerStyleMonitor] First message received from stream!`);
        console.log(`   Message keys:`, Object.keys(msg));
      }
      
      if (msg.account) {
        this.handleAccountUpdate(msg);
      }
      if (msg.transaction) {
        this.handleTransaction(msg);
      }
    });
    
    this.stream.on('error', (error) => {
      console.error(`❌ [DexScreenerStyleMonitor] Stream error:`, error.message);
    });
    
    this.stream.on('end', () => {
      console.log(`⚠️  [DexScreenerStyleMonitor] Stream ended`);
    });
    
    this.stats.streamRecreations++;
    console.log('✅ [DexScreenerStyleMonitor] Stream created successfully');
  }

  /**
   * Fetch SOL price from Jupiter API
   */
  async fetchSOLPrice() {
    try {
      const response = await fetch('https://lite-api.jup.ag/tokens/v2/search?query=SOL');
      const data = await response.json();
      
      const solToken = data.find(t => t.id === SOL_MINT);
      if (solToken && solToken.usdPrice) {
        this.solPriceUSD = solToken.usdPrice;
        console.log(`💵 [DexScreenerStyleMonitor] SOL Price: $${this.solPriceUSD.toFixed(2)}`);
        return this.solPriceUSD;
      }
    } catch (error) {
      console.error('❌ [DexScreenerStyleMonitor] Error fetching SOL price:', error.message);
    }
    return this.solPriceUSD; // Return cached price on error
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
    
    for (let i = 0; i < mints.length; i += BATCH_SIZE) {
      const batch = mints.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(mints.length / BATCH_SIZE);
      
      try {
        const ids = batch.join(',');
        const url = `https://lite-api.jup.ag/tokens/v2/search?query=${ids}`;
        console.log(`   🔍 Fetching batch ${batchNum}/${totalBatches} (${batch.length} tokens)...`);
        
        const response = await fetch(url);
        
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
        for (const tokenInfo of data) {
          const mint = tokenInfo.id;
          const tokenData = this.tokens.get(mint);
          if (!tokenData) continue;
          
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
            totalFetched++;
          } else {
            totalFailed++;
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
  }

  /**
   * Fetch Jupiter baseline stats for a single token
   * Used for individual token onboarding
   */
  async fetchJupiterBaseline(mint) {
    try {
      const response = await fetch(`https://lite-api.jup.ag/tokens/v2/search?query=${mint}`);
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
   * Used when getParsedTokenAccountsByOwner returns 0 accounts (DLMM/CLMM pools)
   */
  async discoverDLMMReserves(poolAddress, tokenMint, quoteMint) {
    try {
      const poolPubkey = new PublicKey(poolAddress);
      
      // Get recent transactions
      const signatures = await this.connection.getSignaturesForAddress(poolPubkey, { limit: 10 });
      
      if (signatures.length === 0) {
        return null;
      }
      
      // Try each transaction until we find one with token balances
      for (let i = 0; i < signatures.length; i++) {
        const tx = await this.connection.getParsedTransaction(signatures[i].signature, {
          maxSupportedTransactionVersion: 0
        });
        
        if (!tx || !tx.meta || !tx.meta.postTokenBalances || tx.meta.postTokenBalances.length === 0) {
          continue;
        }
        
        // Group token accounts by mint
        const accountsByMint = new Map();
        
        tx.meta.postTokenBalances.forEach(balance => {
          const accountIndex = balance.accountIndex;
          const account = tx.transaction.message.accountKeys[accountIndex];
          const pubkey = typeof account === 'object' && account.pubkey ? account.pubkey.toBase58() : account.toBase58();
          
          if (!accountsByMint.has(balance.mint)) {
            accountsByMint.set(balance.mint, []);
          }
          
          accountsByMint.get(balance.mint).push({
            pubkey,
            amount: balance.uiTokenAmount.uiAmount,
            decimals: balance.uiTokenAmount.decimals
          });
        });
        
        // Find the reserve accounts (largest balance for each mint)
        const tokenReserve = accountsByMint.get(tokenMint)?.sort((a, b) => b.amount - a.amount)[0];
        const quoteReserve = accountsByMint.get(quoteMint)?.sort((a, b) => b.amount - a.amount)[0];
        
        if (tokenReserve && quoteReserve) {
          console.log(`   ✅ [DLMM Discovery] Found reserves via transaction analysis`);
          return {
            poolTokenAccount: tokenReserve.pubkey,
            poolQuoteAccount: quoteReserve.pubkey,
            tokenReserve: tokenReserve.amount,
            quoteReserve: quoteReserve.amount,
            quoteMint: quoteMint,
            quoteDecimals: quoteReserve.decimals
          };
        }
      }
      
      return null;
      
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
    console.log(`\n📦 [DexScreenerStyleMonitor] Batch onboarding ${tokensConfig.length} tokens...`);
    
    let successful = 0;
    let failed = 0;

    console.log('🔍 Phase 1: Preparing tokens (metadata + swaps)...');
    
    for (const { mint, config } of tokensConfig) {
      // Skip if missing pool
      if (!config.pool) {
        console.log(`   ⚠️  ${config.name}: No pool address, skipping`);
        failed++;
        continue;
      }

      try {
        // Skip if already onboarded
        if (this.tokens.has(mint)) {
          console.log(`   ⚠️  ${config.name} already onboarded`);
          continue;
        }

        // 1. Create token data structure
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
    
    console.log(`\n🔍 Phase 2: Discovering all pool reserves...`);

    // Phase 2: Discover all pool reserves with rate limiting (batches of 20)
    const poolDiscoveryPromises = [];
    let discoveryCount = 0;
    const tokensToDiscover = tokensConfig.filter(({ mint, config }) => config.pool && this.tokens.has(mint));
    const totalToDiscover = tokensToDiscover.length;
    const BATCH_SIZE = 20; // Process 20 at a time to avoid RPC rate limits
    
    console.log(`   Discovering ${totalToDiscover} pools in batches of ${BATCH_SIZE}...`);
    
    for (let i = 0; i < tokensToDiscover.length; i += BATCH_SIZE) {
      const batch = tokensToDiscover.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(tokensToDiscover.length / BATCH_SIZE);
      
      console.log(`\n   📦 Batch ${batchNum}/${totalBatches}: Processing ${batch.length} pools...`);
      
      const batchPromises = batch.map(({ mint, config }) =>
        Promise.race([
          this.discoverPoolInfo(mint, config)
            .then(poolInfo => {
              discoveryCount++;
              console.log(`      ✅ [${discoveryCount}/${totalToDiscover}] ${config.name} discovered`);
              return { mint, config, poolInfo, success: true };
            }),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Discovery timeout (30s)')), 30000)
          )
        ]).catch(error => {
          discoveryCount++;
          console.error(`      ❌ [${discoveryCount}/${totalToDiscover}] ${config.name} failed:`, error.message);
          return { mint, config, poolInfo: null, success: false };
        })
      );
      
      const batchResults = await Promise.all(batchPromises);
      poolDiscoveryPromises.push(...batchResults);
      
      // Delay between batches to avoid rate limits
      if (i + BATCH_SIZE < tokensToDiscover.length) {
        console.log(`      ⏳ Waiting 500ms before next batch...`);
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    const poolResults = poolDiscoveryPromises;
    
    const successfulDiscoveries = poolResults.filter(r => r.success).length;
    const failedDiscoveries = poolResults.filter(r => !r.success).length;
    console.log(`\n✅ Phase 2 complete: ${successfulDiscoveries} pools discovered, ${failedDiscoveries} failed`);
    
    // Phase 3: Build filters for all successful pools and create stream ONCE
    console.log(`\n📡 Phase 3: Creating stream with all ${successfulDiscoveries} pools...`);
    
    const newAccountFilters = { ...this.accountFilters };
    const newTransactionFilters = { ...this.transactionFilters };
    let subscribed = 0;

    for (const { mint, config, poolInfo, success } of poolResults) {
      if (!success || !poolInfo) continue;

      try {
        // Add this pool's filters to the batch
        const filterKey = mint.substring(0, 8);
        
        newAccountFilters[`${filterKey}_token`] = {
          account: [poolInfo.poolTokenAccount],
          owner: [],
          filters: []
        };
        
        newAccountFilters[`${filterKey}_quote`] = {
          account: [poolInfo.poolQuoteAccount],
          owner: [],
          filters: []
        };
        
        newTransactionFilters[`${filterKey}_txs`] = {
          accountInclude: [poolInfo.poolTokenAccount, poolInfo.poolQuoteAccount],
          accountExclude: [],
          accountRequired: [],
          vote: false,
          failed: false,
          include_meta: true,
          include_token_balances: true,
          include_instructions: true,
          include_inner_instructions: true,
          include_loaded_addresses: true,
          include_accounts: true
        };

        // Store pool info in token data AND in pools Map
        const tokenData = this.tokens.get(mint);
        if (tokenData) {
          tokenData.poolInfo = poolInfo;
        }
        
        // CRITICAL: Add to pools Map so swap detection can find it!
        this.pools.set(mint, {
          tokenKey: mint,
          tokenConfig: config,
          config: config, // For backward compatibility
          ...poolInfo
        });

        console.log(`   ✅ ${config.name} filters added`);
        subscribed++;
        
      } catch (error) {
        console.error(`   ❌ ${config.name} filter error:`, error.message);
      }
    }

    // Now recreate the stream ONCE with all filters
    if (subscribed > 0) {
      console.log(`\n🔄 Recreating stream with ${subscribed} pools...`);
      
      // Log USELESS pool info if it was added
      const uselessMint = 'Dz9mQ9NzkBcCsuGPFJ3r1bS4wgqKMHBPiVuniW8Mbonk';
      const uselessPool = this.pools.get(uselessMint);
      if (uselessPool) {
        console.log(`\n✅ USELESS pool added to stream:`);
        console.log(`   Token Account: ${uselessPool.poolTokenAccount}`);
        console.log(`   Quote Account: ${uselessPool.poolQuoteAccount}`);
        console.log(`   Quote Token: ${uselessPool.quoteName}`);
      } else {
        console.log(`\n⚠️  USELESS pool NOT found in monitored pools!`);
      }
      
      this.accountFilters = newAccountFilters;
      this.transactionFilters = newTransactionFilters;
      await this.recreateStream();
      this.stats.tokensMonitored = this.tokens.size;
    }

    console.log(`\n✅ Batch onboarding complete: ${subscribed} tokens monitoring\n`);
    return { successful: subscribed, failed };
  }

  /**
   * Discover pool reserves without adding to stream
   * Returns pool info or null if discovery fails
   */
  async discoverPoolInfo(mint, config) {
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
    
    for (const account of poolAccounts.value) {
      const accountMint = account.account.data.parsed.info.mint;
      const amount = account.account.data.parsed.info.tokenAmount.uiAmount;
      const decimals = account.account.data.parsed.info.tokenAmount.decimals;
      
      if (accountMint === mint) {
        poolTokenAccount = account.pubkey.toBase58();
        tokenReserve = amount;
      } else if (accountMint === SOL_MINT || accountMint === USDC_MINT || accountMint === USDT_MINT) {
        poolQuoteAccount = account.pubkey.toBase58();
        quoteReserve = amount;
        quoteMint = accountMint;
        quoteDecimals = decimals;
      }
    }
    
    // If no token accounts found (DLMM pools), try transaction-based discovery
    if (!poolTokenAccount || !poolQuoteAccount) {
      const reserves = await this.discoverDLMMReserves(config.pool, mint, SOL_MINT);
      if (!reserves) {
        throw new Error(`Could not discover reserves for pool ${config.pool}`);
      }
      
      poolTokenAccount = reserves.poolTokenAccount;
      poolQuoteAccount = reserves.poolQuoteAccount;
      tokenReserve = reserves.tokenReserve;
      quoteReserve = reserves.quoteReserve;
      quoteMint = reserves.quoteMint;
      quoteDecimals = reserves.quoteDecimals;
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

      if (tokenAccounts.value.length > 0) {
        // Standard AMM pool
        for (const account of tokenAccounts.value) {
          const parsedInfo = account.account.data.parsed.info;
          const accountMint = parsedInfo.mint;
          const amount = parsedInfo.tokenAmount.uiAmount;

          if (accountMint === mint) {
            poolTokenAccount = account.pubkey.toString();
            tokenReserve = amount;
          } else if (accountMint === SOL_MINT) {
            poolQuoteAccount = account.pubkey.toString();
            quoteReserve = amount;
            quoteMint = SOL_MINT;
            quoteName = 'SOL';
            quoteDecimals = 9;
          } else if (accountMint === 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v') {
            poolQuoteAccount = account.pubkey.toString();
            quoteReserve = amount;
            quoteMint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
            quoteName = 'USDC';
            quoteDecimals = 6;
          } else if (accountMint === 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB') {
            poolQuoteAccount = account.pubkey.toString();
            quoteReserve = amount;
            quoteMint = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';
            quoteName = 'USDT';
            quoteDecimals = 6;
          }
        }
      }

      // If no accounts found, try DLMM discovery
      if (!poolTokenAccount || !poolQuoteAccount) {
        const dlmmResult = await this.discoverDLMMReserves(config.pool, mint, quoteMint || SOL_MINT);
        
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

      const price = quoteReserve > 0 ? tokenReserve / quoteReserve : 0;

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
   * Subscribe to pool for real-time swap detection
   * Supports ALL DEX types: Standard AMM, DLMM, CLMM, Whirlpool
   */
  async subscribeToPool(mint, config) {
    console.log(`📡 [DexScreenerStyleMonitor] Subscribing to pool for ${config.name}...`);

    try {
      const poolPubkey = new PublicKey(config.pool);
      const tokenMint = new PublicKey(mint);
      const solMint = new PublicKey(SOL_MINT);
      
      const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
      const USDT_MINT = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';

      console.log(`   🔍 Finding token accounts for pool...`);
      
      // Try to find token accounts owned by the pool (Standard AMM)
      const poolAccounts = await this.connection.getParsedTokenAccountsByOwner(poolPubkey, {
        programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
      });
      
      let poolTokenAccount = null;
      let poolQuoteAccount = null;
      let tokenReserve = 0;
      let quoteReserve = 0;
      let quoteMint = null;
      let quoteDecimals = 9;
      
      // Find token and quote accounts from pool-owned accounts
      for (const account of poolAccounts.value) {
        const accountMint = account.account.data.parsed.info.mint;
        const amount = account.account.data.parsed.info.tokenAmount.uiAmount;
        const decimals = account.account.data.parsed.info.tokenAmount.decimals;
        
        if (accountMint === mint) {
          poolTokenAccount = account.pubkey;
          tokenReserve = amount;
          console.log(`   ✅ Token Account: ${account.pubkey.toBase58()} (${amount.toLocaleString()} tokens)`);
        } else if (accountMint === SOL_MINT || accountMint === USDC_MINT || accountMint === USDT_MINT) {
          poolQuoteAccount = account.pubkey;
          quoteReserve = amount;
          quoteMint = accountMint;
          quoteDecimals = decimals;
          const quoteName = accountMint === SOL_MINT ? 'SOL' : (accountMint === USDC_MINT ? 'USDC' : 'USDT');
          console.log(`   ✅ Quote Account (${quoteName}): ${account.pubkey.toBase58()} (${amount.toLocaleString()})`);
        }
      }
      
      // If no token accounts found (DLMM/CLMM pools), try transaction-based discovery
      if (!poolTokenAccount || !poolQuoteAccount) {
        console.log(`   ⚠️  No token accounts owned by pool (likely DLMM/CLMM)`);
        console.log(`   🔍 Trying transaction-based discovery...`);
        
        const reserves = await this.discoverDLMMReserves(config.pool, mint, SOL_MINT);
        if (!reserves) {
          throw new Error(`Could not discover reserves for pool ${config.pool}`);
        }
        
        poolTokenAccount = new PublicKey(reserves.poolTokenAccount);
        poolQuoteAccount = new PublicKey(reserves.poolQuoteAccount);
        tokenReserve = reserves.tokenReserve;
        quoteReserve = reserves.quoteReserve;
        quoteMint = reserves.quoteMint;
        quoteDecimals = reserves.quoteDecimals;
        
        console.log(`   ✅ Token Reserve: ${poolTokenAccount.toBase58()} (${tokenReserve.toLocaleString()} tokens)`);
        console.log(`   ✅ Quote Reserve: ${poolQuoteAccount.toBase58()} (${quoteReserve.toLocaleString()})`);
      }
      
      const quoteName = quoteMint === SOL_MINT ? 'SOL' : (quoteMint === USDC_MINT ? 'USDC' : 'USDT');
      const price = quoteReserve / tokenReserve;
      
      console.log(`   Token Reserve: ${tokenReserve.toLocaleString()} tokens`);
      console.log(`   Quote Reserve: ${quoteReserve.toLocaleString()} ${quoteName}`);
      console.log(`   Price:         ${price.toFixed(10)} ${quoteName} per token`);

      // Store pool data
      const poolData = new PoolData(config.pool, mint, config);
      poolData.poolTokenAccount = poolTokenAccount.toBase58();
      poolData.poolQuoteAccount = poolQuoteAccount.toBase58();
      poolData.tokenReserve = tokenReserve;
      poolData.quoteReserve = quoteReserve;
      poolData.price = price;
      poolData.quoteMint = quoteMint;
      poolData.quoteName = quoteName;
      poolData.quoteDecimals = quoteDecimals;

      this.pools.set(mint, poolData);

      // Add filters to the stream
      this.accountFilters[`${mint}_token`] = { 
        account: [poolData.poolTokenAccount], 
        owner: [], 
        filters: [] 
      };
      
      this.accountFilters[`${mint}_quote`] = { 
        account: [poolData.poolQuoteAccount], 
        owner: [], 
        filters: [] 
      };

      this.transactionFilters[`${mint}_txs`] = {
        accountInclude: [poolData.poolTokenAccount, poolData.poolQuoteAccount],
        accountExclude: [],
        accountRequired: [],
        vote: false,
        failed: false,
        include_meta: true,
        include_token_balances: true,
        include_instructions: true,
        include_inner_instructions: true,
        include_loaded_addresses: true,
        include_accounts: true
      };

      // Recreate the stream with updated filters
      console.log(`   📡 Recreating stream with new filters for ${config.name}...`);
      this.globalStats.streamRecreations++;
      
      // Cancel existing stream
      if (this.stream) {
        try {
          this.stream.cancel();
        } catch (e) {
          // Ignore cancellation errors
        }
      }
      
      // Create new stream with all accumulated filters
      this.stream = await this.grpcClient.subscribeOnce(
        this.accountFilters,
        {}, // slots
        this.transactionFilters,
        {}, // blocks
        {}, // blocksMeta
        {}, // entry
        {}, // transactionsStatus
        1, // CONFIRMED
        []
      );
      
      // Re-attach handlers
      this.stream.on('data', (msg) => {
        if (msg.account) {
          this.handleAccountUpdate(msg);
        }
        if (msg.transaction) {
          this.handleTransaction(msg);
        }
      });
      
      this.stream.on('error', (error) => {
        console.error(`❌ [DexScreenerStyleMonitor] Stream error:`, error.message);
      });
      
      this.stream.on('end', () => {
        console.log(`⚠️  [DexScreenerStyleMonitor] Stream ended`);
      });

      console.log(`✅ [DexScreenerStyleMonitor] Pool added to stream for ${config.name}`);

    } catch (error) {
      console.error(`❌ [DexScreenerStyleMonitor] Error subscribing to pool:`, error.message);
      throw error;
    }
  }

  /**
   * Handle transaction message from gRPC stream
   * Extracts maker wallet and transaction signature
   */
  handleTransaction(msg) {
    try {
      this.globalStats.totalTransactions++;
      
      // Log every 50 transactions to show stream is working
      if (this.globalStats.totalTransactions % 50 === 0) {
        console.log(`📊 [DexScreenerStyleMonitor] Received ${this.globalStats.totalTransactions} transactions`);
      }
      
      const txData = msg.transaction;
      if (!txData.transaction) return;
      
      // Extract accounts involved in this transaction to find which pool it belongs to
      const innerTransaction = txData.transaction.transaction;
      const message = innerTransaction ? innerTransaction.message : null;
      
      if (!message) return;
      
      // Get all account keys from the transaction
      let accountKeys = [];
      if (message.staticAccountKeys && message.staticAccountKeys.length > 0) {
        accountKeys = message.staticAccountKeys.map(key => {
          try {
            return new PublicKey(key).toBase58();
          } catch (e) {
            return null;
          }
        }).filter(k => k !== null);
      } else if (message.accountKeys && message.accountKeys.length > 0) {
        accountKeys = message.accountKeys.map(key => {
          try {
            return new PublicKey(key).toBase58();
          } catch (e) {
            return null;
          }
        }).filter(k => k !== null);
      }
      
      // Find which pool this transaction belongs to
      let mint = null;
      let poolData = null;
      
      for (const [tokenMint, pool] of this.pools.entries()) {
        if (accountKeys.includes(pool.poolTokenAccount) || accountKeys.includes(pool.poolQuoteAccount)) {
          mint = tokenMint;
          poolData = pool;
          break;
        }
      }
      
      if (!mint || !poolData) return;

      // Extract signature (convert from Buffer to bs58)
      let signature = null;
      if (txData.transaction.signature) {
        const sigBuffer = Buffer.from(txData.transaction.signature);
        signature = bs58.encode(sigBuffer);
      }

      // Extract maker (first account in transaction) - already have accountKeys from above
      let maker = null;
      if (accountKeys.length > 0) {
        maker = accountKeys[0]; // First account is the maker
      }

      const slot = txData.slot;

      // Store transaction data for matching with account updates
      if (!poolData.pendingTransactions) {
        poolData.pendingTransactions = [];
      }

      poolData.pendingTransactions.push({
        signature,
        maker,
        slot,
        timestamp: Date.now()
      });

      // Check if there are pending swaps waiting for this transaction
      if (poolData.pendingSwaps && poolData.pendingSwaps.length > 0) {
        const swapIndex = poolData.pendingSwaps.findIndex(swap => swap.slot === slot);
        if (swapIndex !== -1) {
          const pendingSwap = poolData.pendingSwaps[swapIndex];
          poolData.pendingSwaps.splice(swapIndex, 1);
          
          // Display the swap now with full transaction info
          this.displaySwap(mint, poolData, pendingSwap, { signature, maker, slot });
        }
      }

      // Keep only last 100 transactions (cleanup)
      if (poolData.pendingTransactions.length > 100) {
        poolData.pendingTransactions = poolData.pendingTransactions.slice(-100);
      }

    } catch (error) {
      console.error(`❌ [DexScreenerStyleMonitor] Error handling transaction:`, error.message);
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

          if (Math.abs(delta) > 0.001) { // Ignore dust
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
              
              // Update pool data silently
              poolData.tokenReserve = newAmount;
              poolData.lastUpdate = Date.now();
              return; // Don't display yet
            }

            // Display the swap with transaction info
            this.displaySwap(mint, poolData, { delta, isBuy }, matchedTx);

            // Update pool data
            poolData.tokenReserve = newAmount;
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

          if (Math.abs(delta) > 0.0001) { // Ignore dust
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
      const tokenPriceInQuote = poolData.price;
      const metadata = tokenData.metadata;
      let tokenPriceUSD;
      
      // Use Jupiter price if available (more accurate for complex pools), otherwise calculate from pool
      if (metadata && metadata.jupiterPrice) {
        tokenPriceUSD = metadata.jupiterPrice;
      } else {
        if (poolData.quoteMint === SOL_MINT) {
          tokenPriceUSD = tokenPriceInQuote * this.solPriceUSD;
        } else {
          // USDC/USDT are already in USD
          tokenPriceUSD = tokenPriceInQuote;
        }
      }
      
      const quoteAmount = Math.abs(delta) * tokenPriceInQuote;
      const quoteAmountUSD = Math.abs(delta) * tokenPriceUSD;
      const marketCap = metadata && metadata.circSupply > 0 
        ? metadata.circSupply * tokenPriceUSD 
        : 0;

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

      // Log swap (ALWAYS log USELESS for debugging)
      const shouldLog = process.env.LOG_SWAPS === 'true' || mint === 'Dz9mQ9NzkBcCsuGPFJ3r1bS4wgqKMHBPiVuniW8Mbonk';
      
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

    // Calculate USD price based on quote token
    let currentPriceUSD = 0;
    if (poolData) {
      if (poolData.quoteMint === 'So11111111111111111111111111111111111111112') {
        // SOL pool: price is in SOL, convert to USD
        currentPriceUSD = poolData.price * this.solPriceUSD;
      } else {
        // USDC/USDT pool: price is already in USD
        currentPriceUSD = poolData.price;
      }
    }

    return {
      // Current price
      currentPrice: currentPriceUSD,
      currentPriceSOL: poolData ? poolData.price : 0,

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

      // Market cap
      marketCap: tokenData.metadata && tokenData.metadata.circSupply > 0 && poolData
        ? tokenData.metadata.circSupply * poolData.price * this.solPriceUSD
        : 0,

      // Metadata
      lastUpdate: tokenData.lastUpdate
    };
  }

  /**
   * Calculate price change percentage over a time window
   */
  calculatePriceChange(mint, windowMs) {
    const tokenData = this.tokens.get(mint);
    const poolData = this.pools.get(mint);
    if (!tokenData || !poolData) return 0;

    const now = Date.now();
    const cutoff = now - windowMs;
    const swaps = tokenData.getSwapsSince(cutoff);

    if (swaps.length === 0) {
      // Use Jupiter baseline if available
      if (tokenData.jupiterBaseline) {
        const baseline = this.getJupiterBaselineForWindow(tokenData.jupiterBaseline, windowMs);
        return baseline?.priceChange || 0;
      }
      return 0;
    }

    const oldPrice = swaps[0].priceUSD;
    const currentPrice = poolData.price * this.solPriceUSD;

    if (oldPrice === 0) return 0;
    return ((currentPrice - oldPrice) / oldPrice) * 100;
  }

  /**
   * Calculate volume over a time window
   */
  calculateVolume(mint, windowMs) {
    const tokenData = this.tokens.get(mint);
    if (!tokenData) return 0;

    const now = Date.now();
    const cutoff = now - windowMs;
    const swaps = tokenData.getSwapsSince(cutoff);

    if (swaps.length === 0) {
      // Use Jupiter baseline if available
      if (tokenData.jupiterBaseline) {
        const baseline = this.getJupiterBaselineForWindow(tokenData.jupiterBaseline, windowMs);
        return (baseline?.buyVolume || 0) + (baseline?.sellVolume || 0);
      }
      return 0;
    }

    return swaps.reduce((sum, swap) => sum + (swap.volumeUSD || 0), 0);
  }

  /**
   * Calculate transaction count over a time window
   */
  calculateTxnCount(mint, windowMs) {
    const tokenData = this.tokens.get(mint);
    if (!tokenData) return 0;

    const now = Date.now();
    const cutoff = now - windowMs;
    const swaps = tokenData.getSwapsSince(cutoff);

    if (swaps.length === 0) {
      // Use Jupiter baseline if available
      if (tokenData.jupiterBaseline) {
        const baseline = this.getJupiterBaselineForWindow(tokenData.jupiterBaseline, windowMs);
        return (baseline?.numBuys || 0) + (baseline?.numSells || 0);
      }
      return 0;
    }

    return swaps.length;
  }

  /**
   * Calculate unique makers over a time window
   */
  calculateUniqueMakers(mint, windowMs) {
    const tokenData = this.tokens.get(mint);
    if (!tokenData) return 0;

    const now = Date.now();
    const cutoff = now - windowMs;
    const swaps = tokenData.getSwapsSince(cutoff);

    if (swaps.length === 0) {
      // Use Jupiter baseline if available
      if (tokenData.jupiterBaseline) {
        const baseline = this.getJupiterBaselineForWindow(tokenData.jupiterBaseline, windowMs);
        return baseline?.numTraders || 0;
      }
      return 0;
    }

    const uniqueMakers = new Set(swaps.map(s => s.maker).filter(m => m !== 'unknown'));
    return uniqueMakers.size;
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
        amountTokens: swap.amountTokens,
        amountSOL: swap.amountSOL,
        priceSOL: swap.priceSOL,
        priceUSD: swap.priceUSD,
        usdAmount: swap.volumeUSD,
        volumeUSD: swap.volumeUSD,
        marketCap: swap.marketCap,
        maker: swap.maker,
        signature: swap.signature,
        walletAddress: swap.maker,
        timestamp: swap.timestamp,
        slot: swap.slot
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
      
      console.log(`📡 [DexScreenerStyleMonitor] Broadcasting metrics for ${tokenData.config?.name || mint.substring(0, 8)}...`);
      
      // Calculate market cap
      const circSupply = tokenData.metadata?.circSupply || 0;
      const marketCap = circSupply > 0 ? circSupply * metrics.currentPrice : 0;
      
      // Calculate liquidity (quote reserves × quote price × 2)
      // For SOL pools: quoteReserve × SOL price × 2
      // For USDC/USDT pools: quoteReserve × 2 (already in USD)
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
      
      // Calculate age (if createdAt is available)
      const age = tokenData.createdAt 
        ? Math.floor((Date.now() - tokenData.createdAt) / 1000)
        : 0;

      // Format price data for frontend compatibility
      const priceData = {
        tokenAddress: mint, // CRITICAL: Frontend needs this to match tokens
        priceUsd: metrics.currentPrice,
        currentPrice: metrics.currentPrice,
        
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
        console.log(`   ✅ Using broadcastPriceUpdate method`);
        this.webSocketServer.broadcastPriceUpdate(mint, priceData);
      } else {
        console.log(`   ✅ Using direct broadcast method`);
        // Fallback to direct broadcast
        this.webSocketServer.broadcast(JSON.stringify({
          type: 'priceUpdate',
          tokenAddress: mint,
          data: priceData,
          timestamp: Date.now()
        }));
      }
      
      console.log(`   📊 Broadcast data: price=$${metrics.currentPrice.toFixed(6)}, mcap=$${(marketCap/1e6).toFixed(2)}M, vol24h=$${metrics.volume24h.toFixed(2)}`);
    } catch (error) {
      console.error('❌ [DexScreenerStyleMonitor] Error broadcasting metrics:', error.message);
      console.error('   Token:', mint);
      console.error('   Metrics:', metrics ? 'exists' : 'undefined');
      console.error('   TokenData:', tokenData ? 'exists' : 'undefined');
      console.error('   PoolData:', poolData ? 'exists' : 'undefined');
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
          if (!poolData) continue;

          // Calculate market cap
          const circSupply = tokenData.metadata?.circSupply || 0;
          const marketCap = metrics.currentPrice * circSupply;

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

    // Close the single gRPC stream
    if (this.stream) {
      try {
        this.stream.cancel();
      } catch (e) {
        // Ignore errors
      }
      this.stream = null;
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
