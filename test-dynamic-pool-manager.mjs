/**
 * 🎯 DYNAMIC POOL MANAGER POC
 * 
 * Demonstrates dynamic pool subscription:
 * - Phase 1 (T+0s): Start with Popfrog + TRUMP + USELESS
 * - Phase 2 (T+60s): Add VERDIS + OOB + PROPHEX dynamically
 * - Run for 4 minutes total
 * - Track swaps, buys, sells for all 6 tokens
 * - Print comprehensive stats at each phase and final results
 * - Track global stream statistics (persists across stream recreations)
 * 
 * Run: node test-dynamic-pool-manager.mjs
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import YellowstoneGrpc from '@triton-one/yellowstone-grpc';
import bs58 from 'bs58';
import fetch from 'node-fetch';

// Configuration
const RPC_ENDPOINT = 'https://rpc.constant-k.com/?api-key=39facrmt-om2u-4al5-5k4h-g8pls2y5vhui';
const GRPC_ENDPOINT = 'http://grpc.constant-k.com';
const GRPC_TOKEN = '39facrmt-om2u-4al5-5k4h-g8pls2y5vhui';
const MORALIS_API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJub25jZSI6IjM1MDZiMzhjLTY5ZjUtNDkxZi1hYWZiLWZiMWU1OTkwZjE0YyIsIm9yZ0lkIjoiMzg5MzI4IiwidXNlcklkIjoiNDAwMDYwIiwidHlwZUlkIjoiNzBiNTgxMTItMGQ2MS00NmFlLWI2ODgtNGNmNWRkOWQ0MjExIiwidHlwZSI6IlBST0pFQ1QiLCJpYXQiOjE3NjA5MDEyNjQsImV4cCI6NDkxNjY2MTI2NH0.BMO8_NLNDwFvWE-3nFM4A7aLrTbDqfrHeb-Yptt1018';
const SOL_MINT = 'So11111111111111111111111111111111111111112';

const TEST_DURATION_MS = 4 * 60 * 1000; // 4 minutes
const SOL_PRICE_UPDATE_INTERVAL_MS = 30 * 1000; // 30 seconds

// Tokens to monitor
const TOKENS = {
  // Phase 1: Start with these 3 (T+0s)
  popfrog: {
    name: 'Popfrog',
    mint: 'DA1qLpgD1M7TNNRPycizyQCoRLCt7GAx1YTeVrfYpump',
    pool: null, // Will be discovered
    decimals: 6,
    phase: 1
  },
  trump: {
    name: 'TRUMP',
    mint: '6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN',
    pool: null, // Will be discovered
    decimals: null, // Will be discovered
    phase: 1
  },
  useless: {
    name: 'USELESS',
    mint: 'Dz9mQ9NzkBcCsuGPFJ3r1bS4wgqKMHBPiVuniW8Mbonk',
    pool: null, // Will be discovered
    decimals: null, // Will be discovered
    phase: 1
  },
  // Phase 2: Add these 3 after 1 minute (T+60s)
  verdis: {
    name: 'VERDIS',
    mint: 'BpAiFPCqjvnz7ETKjxr6ZpEKKnGGBE7rNZUU7A7eBAGS',
    pool: null, // Will be discovered
    decimals: null, // Will be discovered
    phase: 2
  },
  oob: {
    name: 'OOB',
    mint: 'oobQ3oX6ubRYMNMahG7VSCe8Z73uaQbAWFn6f22XTgo',
    pool: null, // Will be discovered
    decimals: null, // Will be discovered
    phase: 2
  },
  prophex: {
    name: 'PROPHEX',
    mint: 'AkbvXVZPzrHSpcxNADQ7Uxk6nvjHtpHn4nqNQZY8TJBn',
    pool: null, // Will be discovered
    decimals: null, // Will be discovered
    phase: 2
  }
};

/**
 * Fetch pool address from Moralis API (fallback when Jupiter has no graduatedPool)
 */
async function fetchPoolFromMoralis(mint, tokenName, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`   📡 Fetching pool from Moralis for ${tokenName}... (attempt ${attempt}/${retries})`);
      
      const url = `https://solana-gateway.moralis.io/token/mainnet/${mint}/pairs`;
      const response = await fetch(url, {
        headers: {
          'X-API-Key': MORALIS_API_KEY
        }
      });
      
      if (!response.ok) {
        console.error(`   ❌ Moralis API error: ${response.status}`);
        if (attempt < retries) {
          console.log(`   🔄 Retrying in 2 seconds...`);
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
        console.log(`   ✅ Moralis pairAddress: ${bestPair.pairAddress}`);
        console.log(`      Exchange: ${bestPair.exchangeName}`);
        console.log(`      Pair: ${bestPair.pairLabel}`);
        console.log(`      Liquidity: $${(bestPair.liquidityUsd / 1000000).toFixed(2)}M`);
        console.log(`      Quote Token: ${bestPair.quoteToken === SOL_MINT ? 'SOL' : 'USDC/USDT'}`);
        return bestPair.pairAddress;
      } else {
        console.log(`   ❌ No active pairs found in Moralis response`);
        return null;
      }
    } else {
      console.log(`   ❌ No pairs found in Moralis response`);
      if (attempt < retries) {
        console.log(`   🔄 Retrying in 2 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        continue;
      }
      return null;
    }
    
    } catch (error) {
      console.error(`   ❌ Error fetching from Moralis:`, error.message);
      if (attempt < retries) {
        console.log(`   🔄 Retrying in 2 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        continue;
      }
      return null;
    }
  }
  return null;
}

/**
 * Test Jupiter pool discovery with Moralis fallback
 */
async function discoverPoolsForTokens() {
  console.log('\n🧪 TESTING POOL DISCOVERY (Jupiter + Moralis Fallback)\n');
  
  const mints = Object.values(TOKENS).map(t => t.mint);
  console.log(`Testing ${mints.length} tokens...\n`);
  
  try {
    // Step 1: Batch fetch from Jupiter using /search endpoint with comma-separated mints
    const url = `https://lite-api.jup.ag/tokens/v2/search?query=${mints.join(',')}`;
    console.log(`📡 Fetching from Jupiter: ${url}\n`);
    
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error(`❌ Jupiter API error: ${response.status}`);
      const errorText = await response.text();
      console.error(`   Error: ${errorText}`);
      return false;
    }
    
    const data = await response.json();
    console.log(`✅ Got ${data.length} tokens from Jupiter\n`);
    
    // Step 2: Process each token and fallback to Moralis if needed
    for (const [tokenKey, tokenConfig] of Object.entries(TOKENS)) {
      console.log(`\n${'─'.repeat(80)}`);
      console.log(`📊 Processing: ${tokenConfig.name} (${tokenConfig.mint})`);
      
      // Find Jupiter data for this token
      const jupToken = data.find(t => t.id === tokenConfig.mint);
      
      if (jupToken) {
        console.log(`   ✅ Found in Jupiter`);
        console.log(`   Decimals: ${jupToken.decimals}`);
        console.log(`   CircSupply: ${jupToken.circSupply?.toLocaleString() || 'N/A'}`);
        
        // Update decimals if missing
        if (!tokenConfig.decimals && jupToken.decimals) {
          tokenConfig.decimals = jupToken.decimals;
          console.log(`   ✅ Updated decimals: ${jupToken.decimals}`);
        }
        
        // Check for graduatedPool
        if (jupToken.graduatedPool) {
          const poolAddress = typeof jupToken.graduatedPool === 'string' 
            ? jupToken.graduatedPool 
            : jupToken.graduatedPool.address || jupToken.graduatedPool.id;
          
          tokenConfig.pool = poolAddress;
          console.log(`   ✅ Jupiter graduatedPool: ${poolAddress}`);
        } else {
          console.log(`   ⚠️  No graduatedPool in Jupiter, trying Moralis...`);
          
          // Fallback to Moralis
          const moralisPool = await fetchPoolFromMoralis(tokenConfig.mint, tokenConfig.name);
          if (moralisPool) {
            tokenConfig.pool = moralisPool;
          } else {
            console.log(`   ❌ Failed to discover pool for ${tokenConfig.name}`);
            return false;
          }
        }
      } else {
        console.log(`   ⚠️  Not found in Jupiter, trying Moralis...`);
        
        // Fallback to Moralis
        const moralisPool = await fetchPoolFromMoralis(tokenConfig.mint, tokenConfig.name);
        if (moralisPool) {
          tokenConfig.pool = moralisPool;
        } else {
          console.log(`   ❌ Failed to discover pool for ${tokenConfig.name}`);
          return false;
        }
      }
    }
    
    console.log(`\n${'='.repeat(80)}`);
    console.log('✅ POOL DISCOVERY COMPLETE\n');
    
    // Print summary
    for (const [tokenKey, tokenConfig] of Object.entries(TOKENS)) {
      console.log(`${tokenConfig.name}:`);
      console.log(`  Mint: ${tokenConfig.mint}`);
      console.log(`  Pool: ${tokenConfig.pool}`);
      console.log(`  Decimals: ${tokenConfig.decimals}`);
      console.log('');
    }
    
    console.log(`${'='.repeat(80)}\n`);
    return true;
    
  } catch (error) {
    console.error(`❌ Error in pool discovery:`, error.message);
    return false;
  }
}

// Global price data
let solPriceUSD = 0;
let tokenMetadata = {}; // mint -> { circSupply, name, symbol }

const connection = new Connection(RPC_ENDPOINT, 'confirmed');

// Jupiter API Functions
async function fetchSOLPrice() {
  try {
    const response = await fetch('https://lite-api.jup.ag/tokens/v2/search?query=SOL');
    const data = await response.json();
    
    // Find wrapped SOL
    const solToken = data.find(t => t.id === SOL_MINT);
    if (solToken && solToken.usdPrice) {
      solPriceUSD = solToken.usdPrice;
      console.log(`💵 SOL Price: $${solPriceUSD.toFixed(2)}`);
      return solPriceUSD;
    }
  } catch (error) {
    console.error('❌ Error fetching SOL price:', error.message);
  }
  return solPriceUSD; // Return cached price on error
}

async function fetchTokenMetadata(mint, name) {
  try {
    const response = await fetch(`https://lite-api.jup.ag/tokens/v2/search?query=${mint}`);
    const data = await response.json();
    
    const token = data.find(t => t.id === mint);
    if (token) {
      tokenMetadata[mint] = {
        circSupply: token.circSupply || 0,
        name: token.name || name,
        symbol: token.symbol || name,
        jupiterPrice: token.usdPrice || null // Store Jupiter's aggregated price
      };
      console.log(`📊 ${name}: Supply = ${tokenMetadata[mint].circSupply.toLocaleString()}, Price = $${token.usdPrice?.toFixed(6) || 'N/A'}`);
      return tokenMetadata[mint];
    }
  } catch (error) {
    console.error(`❌ Error fetching metadata for ${name}:`, error.message);
  }
  return null;
}

// Pool Manager Class
class PoolManager {
  constructor(grpcClient) {
    this.grpcClient = grpcClient;
    this.pools = new Map(); // poolKey -> poolData
    this.stats = new Map(); // tokenMint -> stats
    this.stream = null; // SINGLE stream for all pools
    this.accountFilters = {}; // Accumulated account filters
    this.transactionFilters = {}; // Accumulated transaction filters
    this.startTime = Date.now();
    
    // Global cumulative counters (persist across stream recreations)
    this.globalStats = {
      totalAccountUpdates: 0,
      totalTransactions: 0,
      totalSwapsDetected: 0,
      totalBuys: 0,
      totalSells: 0,
      streamRecreations: 0,
      startTime: Date.now()
    };
  }

  async initialize() {
    console.log('\n📡 Initializing gRPC stream...');
    
    // Create ONE stream that will handle ALL pools
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
    
    this.stream.on('data', (msg) => {
      // Route message to the correct pool handler
      if (msg.account) {
        this.handleAccountUpdate(msg);
      }
      
      if (msg.transaction) {
        this.handleTransaction(msg);
      }
    });
    
    this.stream.on('error', (error) => {
      console.error(`❌ Stream error:`, error.message);
    });
    
    console.log('✅ gRPC stream initialized');
  }

  /**
   * Discover reserve accounts for DLMM pools by analyzing recent transactions
   */
  async discoverDLMMReserves(poolAddress, tokenMint, quoteMint) {
    try {
      const poolPubkey = new PublicKey(poolAddress);
      
      // Get recent transactions
      const signatures = await connection.getSignaturesForAddress(poolPubkey, { limit: 10 });
      
      if (signatures.length === 0) {
        return null;
      }
      
      // Try each transaction until we find one with token balances
      for (let i = 0; i < signatures.length; i++) {
        const tx = await connection.getParsedTransaction(signatures[i].signature, {
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
      console.error(`   ❌ DLMM discovery error: ${error.message}`);
      return null;
    }
  }

  /**
   * Discover pool reserves WITHOUT adding to stream
   * Used for batch onboarding - discover all pools first, then create stream once
   */
  async discoverPoolReserves(tokenKey, tokenConfig) {
    const poolPubkey = new PublicKey(tokenConfig.pool);
    const tokenMint = new PublicKey(tokenConfig.mint);
    const solMint = new PublicKey(SOL_MINT);
    
    // FIND the actual token accounts owned by the pool (works for ALL DEX types!)
    const poolAccounts = await connection.getParsedTokenAccountsByOwner(poolPubkey, {
      programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
    });
    
    // Find the token account and quote token account (SOL, USDC, or USDT)
    let poolTokenAccount = null;
    let poolQuoteAccount = null;
    let tokenReserve = 0;
    let quoteReserve = 0;
    let quoteMint = null;
    let quoteDecimals = 9; // Default to SOL decimals
    
    const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
    const USDT_MINT = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';
    
    for (const account of poolAccounts.value) {
      const mint = account.account.data.parsed.info.mint;
      const amount = account.account.data.parsed.info.tokenAmount.uiAmount;
      const decimals = account.account.data.parsed.info.tokenAmount.decimals;
      
      if (mint === tokenConfig.mint) {
        poolTokenAccount = account.pubkey;
        tokenReserve = amount;
      } else if (mint === SOL_MINT || mint === USDC_MINT || mint === USDT_MINT) {
        poolQuoteAccount = account.pubkey;
        quoteReserve = amount;
        quoteMint = mint;
        quoteDecimals = decimals;
      }
    }
    
    // If no token accounts found (DLMM pools), try transaction-based discovery
    if (!poolTokenAccount || !poolQuoteAccount) {
      const reserves = await this.discoverDLMMReserves(tokenConfig.pool, tokenConfig.mint, solMint.toBase58());
      if (!reserves) {
        throw new Error(`Could not discover reserves for pool ${tokenConfig.pool}`);
      }
      
      poolTokenAccount = new PublicKey(reserves.poolTokenAccount);
      poolQuoteAccount = new PublicKey(reserves.poolQuoteAccount);
      tokenReserve = reserves.tokenReserve;
      quoteReserve = reserves.quoteReserve;
      quoteMint = reserves.quoteMint;
      quoteDecimals = reserves.quoteDecimals;
    }
    
    const quoteName = quoteMint === SOL_MINT ? 'SOL' : (quoteMint === USDC_MINT ? 'USDC' : 'USDT');
    const price = quoteReserve / tokenReserve;
    
    return {
      poolTokenAccount: poolTokenAccount.toBase58(),
      poolQuoteAccount: poolQuoteAccount.toBase58(),
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
   * Add filters for a pool WITHOUT creating stream
   * Used for batch onboarding - add all filters first, then create stream once
   */
  addFiltersForPool(tokenKey, tokenConfig, poolInfo) {
    // Store pool data
    const poolData = {
      tokenKey,
      tokenConfig,
      ...poolInfo
    };
    
    this.pools.set(tokenKey, poolData);
    
    // Initialize stats
    this.stats.set(tokenKey, {
      name: tokenConfig.name,
      totalSwaps: 0,
      buys: 0,
      sells: 0,
      buyVolume: 0,
      sellVolume: 0
    });
    
    // Add account filters for this pool
    this.accountFilters[`${tokenKey}_token`] = {
      account: [poolInfo.poolTokenAccount],
      owner: [],
      filters: []
    };
    
    this.accountFilters[`${tokenKey}_quote`] = {
      account: [poolInfo.poolQuoteAccount],
      owner: [],
      filters: []
    };
    
    // Add transaction filters for this pool
    this.transactionFilters[`${tokenKey}_txs`] = {
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
  }

  /**
   * OLD METHOD: Add pool dynamically (recreates stream)
   * Used for dynamic additions after initial batch
   */
  async addPool(tokenKey, tokenConfig) {
    console.log(`\n➕ Adding pool for ${tokenConfig.name}...`);
    
    try {
      // Discover pool reserves
      const poolInfo = await this.discoverPoolReserves(tokenKey, tokenConfig);
      
      console.log(`   Token Reserve: ${poolInfo.tokenReserve.toLocaleString()} tokens`);
      console.log(`   Quote Reserve: ${poolInfo.quoteReserve.toLocaleString()} ${poolInfo.quoteName}`);
      console.log(`   Price:         ${poolInfo.price.toFixed(10)} ${poolInfo.quoteName} per token`);
      
      // Add filters
      this.addFiltersForPool(tokenKey, tokenConfig, poolInfo);
      
      // Recreate stream with new filters
      await this.addPoolToStream(tokenKey, this.pools.get(tokenKey));
      
      console.log(`✅ ${tokenConfig.name} pool added to stream`);
      
    } catch (error) {
      console.error(`❌ Error adding pool for ${tokenConfig.name}:`, error.message);
    }
  }

  async addPoolToStream(tokenKey, poolData) {
    // Add account filters for this pool
    this.accountFilters[`${tokenKey}_token`] = {
      account: [poolData.poolTokenAccount],
      owner: [],
      filters: []
    };
    
    this.accountFilters[`${tokenKey}_quote`] = {
      account: [poolData.poolQuoteAccount],
      owner: [],
      filters: []
    };
    
    // Add transaction filters for this pool
    this.transactionFilters[`${tokenKey}_txs`] = {
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
    console.log(`   📡 Recreating stream with new filters for ${tokenKey}...`);
    this.globalStats.streamRecreations++;
    
    // Cancel existing stream
    if (this.stream) {
      try {
        this.stream.cancel();
      } catch (e) {
        // Ignore
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
      console.error(`❌ Stream error:`, error.message);
    });
    
    this.stream.on('end', () => {
      console.log(`⚠️  Stream ended`);
    });
    
    console.log(`   ✅ Stream recreated with ${Object.keys(this.accountFilters).length / 2} pools`);
  }

  handleTransaction(msg) {
    try {
      this.globalStats.totalTransactions++;
      
      const txData = msg.transaction;
      
      if (!txData.transaction) return;
      
      // Extract all account keys from the transaction
      const innerTransaction = txData.transaction.transaction;
      const message = innerTransaction ? innerTransaction.message : null;
      
      let accountKeys = [];
      if (message) {
        // Try staticAccountKeys first (versioned transactions)
        if (message.staticAccountKeys && message.staticAccountKeys.length > 0) {
          accountKeys = message.staticAccountKeys.map(key => {
            try {
              return new PublicKey(key).toBase58();
            } catch (e) {
              return null;
            }
          }).filter(k => k !== null);
        }
        // Fallback to accountKeys (legacy transactions)
        else if (message.accountKeys && message.accountKeys.length > 0) {
          accountKeys = message.accountKeys.map(key => {
            try {
              return new PublicKey(key).toBase58();
            } catch (e) {
              return null;
            }
          }).filter(k => k !== null);
        }
      }
      
      // Find which pool this transaction belongs to by checking if any account matches
      let matchedTokenKey = null;
      let matchedPoolData = null;
      
      for (const [tokenKey, poolData] of this.pools.entries()) {
        // Check if transaction involves this pool's token or quote accounts
        if (accountKeys.includes(poolData.poolTokenAccount) || 
            accountKeys.includes(poolData.poolQuoteAccount)) {
          matchedTokenKey = tokenKey;
          matchedPoolData = poolData;
          break;
        }
      }
      
      if (!matchedTokenKey || !matchedPoolData) return;
      
      const stats = this.stats.get(matchedTokenKey);
      const poolData = matchedPoolData;
      
      // Extract signature (convert from Buffer to bs58)
      let signature = null;
      if (txData.transaction.signature) {
        const sigBuffer = Buffer.from(txData.transaction.signature);
        signature = bs58.encode(sigBuffer);
      }
      
      // Extract maker (first account in transaction) - reuse accountKeys we already extracted
      const maker = accountKeys.length > 0 ? accountKeys[0] : null;
      
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
        // Find pending swap that matches this transaction's slot
        const swapIndex = poolData.pendingSwaps.findIndex(swap => swap.slot === slot);
        if (swapIndex !== -1) {
          const pendingSwap = poolData.pendingSwaps[swapIndex];
          // Remove from pending
          poolData.pendingSwaps.splice(swapIndex, 1);
          
          // Display the swap now with full transaction info
          this.displaySwap(matchedTokenKey, poolData, pendingSwap, { signature, maker, slot });
        }
      }
      
      // Keep only last 100 transactions (cleanup)
      if (poolData.pendingTransactions.length > 100) {
        poolData.pendingTransactions = poolData.pendingTransactions.slice(-100);
      }
      
    } catch (error) {
      console.error(`❌ Error handling transaction for ${tokenKey}:`, error.message);
      console.error(error.stack);
    }
  }

  handleAccountUpdate(msg) {
    try {
      this.globalStats.totalAccountUpdates++;
      
      if (!msg.account) return;
      
      const accountUpdate = msg.account;
      const accountData = accountUpdate.account?.data;
      if (!accountData) return;
      
      // Decode account key to find which pool this belongs to
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
      let tokenKey = null;
      let poolData = null;
      
      for (const [key, pool] of this.pools.entries()) {
        if (decodedKey === pool.poolTokenAccount || decodedKey === pool.poolQuoteAccount) {
          tokenKey = key;
          poolData = pool;
          break;
        }
      }
      
      if (!tokenKey || !poolData) {
        // DEBUG: Log unmatched accounts
        console.log(`⚠️  Unmatched account update: ${decodedKey?.substring(0, 20)}...`);
        return;
      }
      
      // DEBUG: Log the full message structure on first swap
      const stats = this.stats.get(tokenKey);
      if (stats.totalSwaps === 0) {
        console.log('\n🔍 DEBUG: Account Update Message Structure:');
        console.log('Keys available:', Object.keys(msg));
        console.log('Account keys:', Object.keys(accountUpdate));
        console.log('Slot:', accountUpdate.slot);
        console.log('Is startup:', accountUpdate.isStartup);
        console.log('Account object keys:', accountUpdate.account ? Object.keys(accountUpdate.account) : 'none');
        
        // Check for transaction info
        if (msg.transaction) {
          console.log('✅ Transaction data available!');
          console.log('Transaction keys:', Object.keys(msg.transaction));
        } else {
          console.log('❌ No transaction data in account update');
        }
        
        // Check for signature
        if (accountUpdate.signature) {
          console.log('✅ Signature available:', accountUpdate.signature);
        }
        if (accountUpdate.txSignature) {
          console.log('✅ TX Signature available:', accountUpdate.txSignature);
        }
        console.log('');
      }
      
      // Check if it's the token reserve account (decodedKey already set above)
      if (decodedKey === poolData.poolTokenAccount) {
        const dataBuffer = Buffer.from(accountData);
        const newAmount = this.decodeTokenAmount(dataBuffer, poolData.tokenConfig.decimals);
        
        // Debug logging
        const stats = this.stats.get(tokenKey);
        if (stats.totalSwaps === 0) {
          console.log(`   🔍 ${poolData.tokenConfig.name} token reserve: ${newAmount?.toLocaleString()} (previous: ${poolData.tokenReserve?.toLocaleString()})`);
        }
        
        if (newAmount !== null && poolData.tokenReserve !== null) {
          const delta = newAmount - poolData.tokenReserve;
          
          if (Math.abs(delta) > 0.001) { // Ignore dust
            const stats = this.stats.get(tokenKey);
            stats.totalSwaps++;
            
            // Update global counters
            this.globalStats.totalSwapsDetected++;
            
            // CRITICAL: When pool token reserve INCREASES, user SOLD to pool (SELL)
            //           When pool token reserve DECREASES, user BOUGHT from pool (BUY)
            const isBuy = delta < 0; // Token reserve decreased = user bought
            if (isBuy) {
              stats.buys++;
              stats.buyVolume += Math.abs(delta);
              this.globalStats.totalBuys++;
            } else {
              stats.sells++;
              stats.sellVolume += Math.abs(delta);
              this.globalStats.totalSells++;
            }
            
            const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
            
            // Try to match with a transaction from the same slot
            let matchedTx = null;
            if (poolData.pendingTransactions && poolData.pendingTransactions.length > 0) {
              // Find transaction with matching slot
              matchedTx = poolData.pendingTransactions.find(tx => tx.slot === accountUpdate.slot);
              
              // If no exact slot match, take the most recent one (within 5 seconds)
              if (!matchedTx) {
                const recentTxs = poolData.pendingTransactions.filter(
                  tx => (Date.now() - tx.timestamp) < 5000 // Increased from 2s to 5s
                );
                if (recentTxs.length > 0) {
                  matchedTx = recentTxs[recentTxs.length - 1];
                }
              }
            }
            
            // ONLY display swap if we have a matching transaction
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
            this.displaySwap(tokenKey, poolData, { delta, isBuy }, matchedTx);
            
            // Update pool data
            poolData.tokenReserve = newAmount;
            poolData.lastUpdate = Date.now();
          }
        }
      }
      // Check if it's the quote token reserve account (SOL/USDC/USDT)
      else if (decodedKey === poolData.poolQuoteAccount) {
        const dataBuffer = Buffer.from(accountData);
        const newAmount = this.decodeTokenAmount(dataBuffer, poolData.quoteDecimals); // Use stored decimals
        
        if (newAmount !== null && poolData.quoteReserve !== null) {
          const delta = newAmount - poolData.quoteReserve;
          
          if (Math.abs(delta) > 0.0001) { // Ignore dust
            // Update with actual quote token amount (no conversion)
            poolData.quoteReserve = newAmount;
            poolData.price = newAmount / poolData.tokenReserve;
          }
        }
      }
      
    } catch (error) {
      console.error(`❌ Error handling account update for ${tokenKey}:`, error.message);
    }
  }

  displaySwap(tokenKey, poolData, swapData, txData) {
    const { delta, isBuy } = swapData;
    const stats = this.stats.get(tokenKey);
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
    
    // Calculate prices and market cap
    const tokenPriceInQuote = poolData.price;
    const metadata = tokenMetadata[poolData.tokenConfig.mint];
    let tokenPriceUSD;
    
    // Use Jupiter price if available, otherwise fall back to pool price
    if (metadata && metadata.jupiterPrice) {
      tokenPriceUSD = metadata.jupiterPrice;
    } else {
      if (poolData.quoteMint === SOL_MINT) {
        tokenPriceUSD = tokenPriceInQuote * solPriceUSD;
      } else {
        tokenPriceUSD = tokenPriceInQuote;
      }
    }
    
    const quoteAmount = Math.abs(delta) * tokenPriceInQuote;
    const quoteAmountUSD = Math.abs(delta) * tokenPriceUSD;
    const marketCap = metadata && metadata.circSupply > 0 
      ? metadata.circSupply * tokenPriceUSD 
      : 0;
    
    console.log(`\n🔥 [${elapsed}s] ${poolData.tokenConfig.name} - ${isBuy ? 'BUY' : 'SELL'}`);
    console.log(`   Amount: ${Math.abs(delta).toLocaleString()} tokens`);
    console.log(`   ${poolData.quoteName}: ${quoteAmount.toFixed(4)} ${poolData.quoteName} ($${quoteAmountUSD.toFixed(2)})`);
    console.log(`   Price: ${tokenPriceInQuote.toFixed(10)} ${poolData.quoteName} ($${tokenPriceUSD.toFixed(6)}) | MCap: $${marketCap > 1000000 ? (marketCap / 1000000).toFixed(2) + 'M' : (marketCap / 1000).toFixed(1) + 'K'}`);
    console.log(`   Stats: ${stats.totalSwaps} swaps (${stats.buys} buys, ${stats.sells} sells)`);
    console.log(`   ✅ Maker: ${txData.maker?.substring(0, 44)}`);
    console.log(`   ✅ TX: ${txData.signature?.substring(0, 44)}...`);
    console.log(`   Slot: ${txData.slot}`);
  }

  decodeTokenAmount(data, decimals) {
    try {
      const amount = Number(data.readBigUInt64LE(64));
      return amount / Math.pow(10, decimals);
    } catch (error) {
      return null;
    }
  }

  printStats(label = 'FINAL RESULTS') {
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
    
    console.log('\n' + '='.repeat(80));
    console.log(`📊 ${label} (${elapsed}s elapsed)`);
    console.log('='.repeat(80));
    
    // Print per-token stats
    for (const [tokenKey, stats] of this.stats.entries()) {
      const poolData = this.pools.get(tokenKey);
      const metadata = tokenMetadata[poolData?.tokenConfig?.mint];
      
      console.log(`\n🪙 ${stats.name.toUpperCase()}`);
      console.log(`   Mint:         ${poolData?.tokenConfig?.mint || 'N/A'}`);
      console.log(`   Pool:         ${poolData?.tokenConfig?.pool || 'N/A'}`);
      console.log(`   Quote Token:  ${poolData?.quoteName || 'N/A'}`);
      console.log(`   Total Swaps:  ${stats.totalSwaps}`);
      console.log(`   Buys:         ${stats.buys} (${stats.totalSwaps > 0 ? ((stats.buys / stats.totalSwaps) * 100).toFixed(1) : 0}%)`);
      console.log(`   Sells:        ${stats.sells} (${stats.totalSwaps > 0 ? ((stats.sells / stats.totalSwaps) * 100).toFixed(1) : 0}%)`);
      console.log(`   Buy Volume:   ${stats.buyVolume.toLocaleString()} tokens`);
      console.log(`   Sell Volume:  ${stats.sellVolume.toLocaleString()} tokens`);
      
      // Print current price and market cap if available
      if (poolData && metadata) {
        const tokenPriceInQuote = poolData.price;
        const tokenPriceUSD = metadata.jupiterPrice || 
          (poolData.quoteMint === SOL_MINT ? tokenPriceInQuote * solPriceUSD : tokenPriceInQuote);
        const marketCap = metadata.circSupply > 0 ? metadata.circSupply * tokenPriceUSD : 0;
        
        console.log(`   Current Price: ${tokenPriceInQuote.toFixed(10)} ${poolData.quoteName} ($${tokenPriceUSD.toFixed(6)})`);
        console.log(`   Market Cap:    $${marketCap > 1000000 ? (marketCap / 1000000).toFixed(2) + 'M' : (marketCap / 1000).toFixed(1) + 'K'}`);
      }
    }
    
    // Calculate totals
    let totalSwaps = 0;
    let totalBuys = 0;
    let totalSells = 0;
    let totalBuyVolume = 0;
    let totalSellVolume = 0;
    
    for (const stats of this.stats.values()) {
      totalSwaps += stats.totalSwaps;
      totalBuys += stats.buys;
      totalSells += stats.sells;
      totalBuyVolume += stats.buyVolume;
      totalSellVolume += stats.sellVolume;
    }
    
    console.log(`\n📈 COMBINED TOTALS (${this.pools.size} active pools)`);
    console.log(`   Total Swaps:      ${totalSwaps}`);
    console.log(`   Total Buys:       ${totalBuys} (${totalSwaps > 0 ? ((totalBuys / totalSwaps) * 100).toFixed(1) : 0}%)`);
    console.log(`   Total Sells:      ${totalSells} (${totalSwaps > 0 ? ((totalSells / totalSwaps) * 100).toFixed(1) : 0}%)`);
    console.log(`   Total Buy Volume: ${totalBuyVolume.toLocaleString()} tokens`);
    console.log(`   Total Sell Volume: ${totalSellVolume.toLocaleString()} tokens`);
    
    // Print global stream statistics
    const uptime = ((Date.now() - this.globalStats.startTime) / 1000).toFixed(1);
    console.log(`\n📊 GLOBAL STREAM STATISTICS (${uptime}s uptime)`);
    console.log(`   Stream Recreations:    ${this.globalStats.streamRecreations}`);
    console.log(`   Total Account Updates: ${this.globalStats.totalAccountUpdates.toLocaleString()}`);
    console.log(`   Total Transactions:    ${this.globalStats.totalTransactions.toLocaleString()}`);
    console.log(`   Total Swaps Detected:  ${this.globalStats.totalSwapsDetected.toLocaleString()}`);
    console.log(`   Total Buys:            ${this.globalStats.totalBuys.toLocaleString()}`);
    console.log(`   Total Sells:           ${this.globalStats.totalSells.toLocaleString()}`);
    console.log(`   Avg Swaps/Second:      ${(this.globalStats.totalSwapsDetected / (uptime || 1)).toFixed(2)}`);
    
    console.log('\n' + '='.repeat(80));
  }

  async removePool(tokenKey) {
    console.log(`\n➖ Removing pool for ${tokenKey}...`);
    
    // Remove from pools and stats
    this.pools.delete(tokenKey);
    this.stats.delete(tokenKey);
    
    // Remove filters for this pool
    delete this.accountFilters[`${tokenKey}_token`];
    delete this.accountFilters[`${tokenKey}_quote`];
    delete this.transactionFilters[`${tokenKey}_txs`];
    
    // Recreate stream without this pool's filters
    console.log(`   📡 Recreating stream without ${tokenKey}...`);
    
    // Cancel existing stream
    if (this.stream) {
      try {
        this.stream.cancel();
      } catch (e) {
        // Ignore
      }
    }
    
    // Create new stream with remaining filters
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
      console.error(`❌ Stream error:`, error.message);
    });
    
    this.stream.on('end', () => {
      console.log(`⚠️  Stream ended`);
    });
    
    console.log(`   ✅ Stream recreated with ${this.pools.size} pools remaining`);
  }

  closeAll() {
    console.log('\n🔒 Closing all connections...');
    if (this.stream) {
      try {
        this.stream.cancel();
        console.log('   ✅ gRPC stream closed');
      } catch (e) {
        console.log('   ⚠️  Stream already closed');
      }
      this.stream = null;
    }
    console.log('   ✅ All connections closed properly');
  }
}

// Main test
async function runTest() {
  console.log('🎯 DYNAMIC POOL MANAGER POC - 5 Token Test');
  console.log('='.repeat(80));
  console.log(`Phase 1 (T+0s):   Popfrog + TRUMP`);
  console.log(`Phase 2 (T+60s):  Add VERDIS + OOB + PROPHEX`);
  console.log(`Duration: ${TEST_DURATION_MS / 1000}s (4 minutes)`);
  console.log('='.repeat(80));
  
  try {
    // Step 1: Discover pools for all tokens (Jupiter + Moralis fallback)
    const discoverySuccess = await discoverPoolsForTokens();
    if (!discoverySuccess) {
      console.error('❌ Pool discovery failed, cannot proceed');
      process.exit(1);
    }
    
    // Step 2: Fetch SOL price and token metadata
    console.log('💰 Fetching market data...');
    await fetchSOLPrice();
    
    for (const [tokenKey, tokenConfig] of Object.entries(TOKENS)) {
      await fetchTokenMetadata(tokenConfig.mint, tokenConfig.name);
    }
    
    // Start SOL price updater (every 30 seconds)
    const priceUpdater = setInterval(async () => {
      await fetchSOLPrice();
    }, SOL_PRICE_UPDATE_INTERVAL_MS);
    
    // Step 3: Initialize gRPC client
    console.log('\n📡 Initializing gRPC client...');
    const Client = YellowstoneGrpc.default || YellowstoneGrpc;
    const grpcClient = new Client(GRPC_ENDPOINT, GRPC_TOKEN);
    console.log('✅ gRPC client initialized');
    
    // Step 4: Create Pool Manager
    const poolManager = new PoolManager(grpcClient);
    
    // Step 5: TRUE BATCH ONBOARDING - Discover all pools FIRST, then create stream ONCE
    console.log('\n⏱️  T+0s: BATCH ONBOARDING - Discovering all 3 pools first...');
    
    // Phase 1: Discover all pools in parallel (no stream creation yet)
    console.log('\n🔍 Phase 1: Discovering all pool reserves in parallel...');
    const phase1Tokens = [
      { key: 'popfrog', config: TOKENS.popfrog },
      { key: 'trump', config: TOKENS.trump },
      { key: 'useless', config: TOKENS.useless }
    ];
    
    const poolDiscoveryPromises = phase1Tokens.map(async ({ key, config }) => {
      console.log(`   🔍 Discovering ${config.name}...`);
      try {
        const poolInfo = await poolManager.discoverPoolReserves(key, config);
        console.log(`   ✅ ${config.name} discovered: ${poolInfo.tokenReserve.toLocaleString()} tokens, ${poolInfo.quoteReserve.toLocaleString()} ${poolInfo.quoteName}`);
        return { key, config, poolInfo, success: true };
      } catch (error) {
        console.error(`   ❌ ${config.name} discovery failed:`, error.message);
        return { key, config, poolInfo: null, success: false };
      }
    });
    
    const discoveredPools = await Promise.all(poolDiscoveryPromises);
    const successfulPools = discoveredPools.filter(p => p.success);
    
    console.log(`\n✅ Phase 1 complete: ${successfulPools.length}/3 pools discovered`);
    
    // Phase 2: Build ALL filters at once
    console.log('\n📡 Phase 2: Building filters for all pools...');
    for (const { key, config, poolInfo } of successfulPools) {
      poolManager.addFiltersForPool(key, config, poolInfo);
      console.log(`   ✅ ${config.name} filters added`);
    }
    
    // Phase 3: Create stream ONCE with all filters
    console.log(`\n🚀 Phase 3: Creating stream with ALL ${successfulPools.length} pools at once...`);
    await poolManager.initialize();
    
    console.log('\n✅ Batch onboarding complete: Monitoring 3 pools (Popfrog + TRUMP + USELESS)');
    poolManager.printStats('PHASE 1 BASELINE');
    
    // PHASE 2: Add 2 more tokens after 60 seconds
    setTimeout(async () => {
      console.log('\n\n⏱️  T+60s: PHASE 2 - Adding 2 more pools dynamically...');
      
      // Discover pools for phase 2 tokens
      const phase2Tokens = Object.entries(TOKENS).filter(([key, token]) => token.phase === 2);
      for (const [key, token] of phase2Tokens) {
        await fetchTokenMetadata(token.mint, token.name);
      }
      
      console.log('   Adding VERDIS pool to stream...');
      await poolManager.addPool('verdis', TOKENS.verdis);
      
      console.log('   Adding OOB pool to stream...');
      await poolManager.addPool('oob', TOKENS.oob);
      
      console.log('   Adding PROPHEX pool to stream...');
      await poolManager.addPool('prophex', TOKENS.prophex);
      
      console.log('\n✅ Phase 2 complete: Now monitoring 6 pools total (Popfrog, TRUMP, USELESS, VERDIS, OOB, PROPHEX)');
      poolManager.printStats('PHASE 2 RESULTS');
    }, 60 * 1000);
    
    // Schedule test end after 4 minutes
    setTimeout(() => {
      console.log('\n\n⏱️  T+240s: Test duration reached, stopping...');
      clearInterval(priceUpdater);
      poolManager.closeAll();
      
      try {
        if (grpcClient && typeof grpcClient.close === 'function') {
          grpcClient.close();
        }
      } catch (e) {
        // Ignore close errors
      }
      
      poolManager.printStats();
      
      process.exit(0);
    }, TEST_DURATION_MS);
    
    // Handle Ctrl+C
    process.on('SIGINT', () => {
      console.log('\n\n🛑 Test interrupted by user...');
      clearInterval(priceUpdater);
      poolManager.closeAll();
      
      try {
        if (grpcClient && typeof grpcClient.close === 'function') {
          grpcClient.close();
        }
      } catch (e) {
        // Ignore close errors
      }
      
      poolManager.printStats();
      
      process.exit(0);
    });
    
    console.log('\n🔄 Monitoring pools...');
    console.log('Press Ctrl+C to stop early.\n');
    
  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run
runTest().catch(console.error);

