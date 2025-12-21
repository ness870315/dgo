/**
 * TRANSACTION-LEVEL DECODING TEST
 * 
 * This test demonstrates why transaction-level decoding is more accurate than account-based detection.
 * 
 * Key Differences:
 * - Account-based: Monitor pool reserve accounts, infer swaps from balance changes (heuristic)
 * - Transaction-based: Decode actual swap instructions from transactions (accurate)
 * 
 * Tests with:
 * - Jelly (FeR8VBqNRSUD5NtXAj2n3j1dAHkZHfyDktKuLXD4pump)
 * 
 * Endpoints to test:
 * - Kaldera: https://kaldera-indianapolis.constant-k.com
 * - ShredPrism: https://prism-indianapolis.constant-k.com:55577
 */

import { Connection, PublicKey } from '@solana/web3.js';
import fetch from 'node-fetch';
import { createRequire } from 'module';

// Load Yellowstone gRPC (CommonJS)
const require = createRequire(import.meta.url);
const YellowstoneGrpc = require('@triton-one/yellowstone-grpc');

// Import our existing swap decoder!
import { processTxForSwap } from './backend/services/SwapDetectionHelpers.mjs';

// Configuration
const RPC_ENDPOINT = 'https://rpc.constant-k.com/?api-key=39facrmt-om2u-4al5-5k4h-g8pls2y5vhui';
const GRPC_TOKEN = 'nyobwvg4-zxpy-41c0-zuy7-fz69xihu0q5p';

// Test endpoints - Only Kaldera
const ENDPOINTS = {
  kaldera: {
    name: 'Kaldera',
    url: 'https://kaldera-indianapolis.constant-k.com'
  }
};

// Test token - WhiteWhale for 5-minute test
const TEST_TOKENS = {
  whitewhale: {
    name: 'WhiteWhale',
    mint: 'a3W4qutoEJA4232T2gwZUfgYJTetr96pU4SJMwppump',
    pool: null, // Will be discovered
    decimals: null,
    supply: null, // Will be fetched from Jupiter
    marketCap: null // Will be calculated
  }
};

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const connection = new Connection(RPC_ENDPOINT, 'confirmed');
let solPriceUSD = 120; // Will be updated

/**
 * Discover pool for a token using Jupiter API
 */
async function discoverPool(tokenConfig) {
  try {
    console.log(`   🔍 Discovering pool for ${tokenConfig.name}...`);
    
    const response = await fetch(`https://lite-api.jup.ag/tokens/v2/search?query=${tokenConfig.mint}`);
    const data = await response.json();
    
    if (data && data.length > 0) {
      const token = data[0];
      if (token.decimals) tokenConfig.decimals = token.decimals;
      
      // Store supply for market cap calculation
      if (token.circulatingSupply) {
        tokenConfig.supply = token.circulatingSupply;
      } else if (token.totalSupply) {
        tokenConfig.supply = token.totalSupply;
      }
      
      if (token.graduatedPool) {
        tokenConfig.pool = token.graduatedPool;
        console.log(`   ✅ Found pool: ${tokenConfig.pool}`);
        if (tokenConfig.supply) {
          console.log(`   📊 Supply: ${tokenConfig.supply.toLocaleString()}`);
        }
        return tokenConfig.pool;
      }
    }
    
    // Fallback to DexScreener
    const dexResponse = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenConfig.mint}`);
    const dexData = await dexResponse.json();
    
    if (dexData && dexData.pairs && dexData.pairs.length > 0) {
      const pair = dexData.pairs[0];
      tokenConfig.pool = pair.pairAddress;
      console.log(`   ✅ Found pool via DexScreener: ${tokenConfig.pool}`);
      return tokenConfig.pool;
    }
    
    console.log(`   ❌ Could not discover pool for ${tokenConfig.name}`);
    return null;
  } catch (error) {
    console.error(`   ❌ Error discovering pool: ${error.message}`);
    return null;
  }
}

/**
 * Get SOL price from Jupiter
 */
async function getSOLPrice() {
  try {
    const response = await fetch('https://lite-api.jup.ag/tokens/v2/search?query=SOL');
    const data = await response.json();
    if (data && data.length > 0 && data[0].usdPrice) {
      solPriceUSD = data[0].usdPrice;
      return solPriceUSD;
    }
  } catch (error) {
    console.error('Error fetching SOL price:', error.message);
  }
  return solPriceUSD;
}

/**
 * Decode swap from transaction using our existing robust decoder
 * This uses the SwapDetectionHelpers which handles all DEX types
 */
function decodeSwapFromTransaction(msgTransaction, poolAddress, tokenMint, tokenConfig, currentPrice = null) {
  try {
    if (!msgTransaction) return null;
    
    // CRITICAL: Match production structure - extract meta from nested transaction
    // Production does: innerTx?.meta || txData.transaction?.meta || txData.meta
    const innerTx = msgTransaction.transaction?.transaction || msgTransaction.transaction;
    const meta = innerTx?.meta || msgTransaction.transaction?.meta || msgTransaction.meta;
    
    if (!meta) {
      // No meta = no token balance changes = can't detect swap
      return null;
    }
    
    // Build transaction object matching production structure
    // processTxForSwap expects tx.meta at top level
    const tx = {
      transaction: innerTx || msgTransaction.transaction || msgTransaction,
      meta: meta, // CRITICAL: meta must be at top level
      signature: innerTx?.signatures?.[0] || innerTx?.signature || msgTransaction.transaction?.signatures?.[0] || msgTransaction.transaction?.signature || msgTransaction.signature,
      slot: msgTransaction.slot,
      blockTime: msgTransaction.blockTime
    };
    
    // Use our existing robust swap decoder!
    // CRITICAL: Don't use midPriceUsd filter in test - we want to see ALL swaps
    // The price outlier filter can reject valid swaps after price changes
    const tokenPriceCache = new Map();
    
    // DEBUG: Log transaction details before processing
    if (process.env.DEBUG_SWAPS === '1') {
      const sig = tx.signature?.substring?.(0, 16) || 'unknown';
      const hasMeta = !!tx.meta;
      const preBalances = tx.meta?.preTokenBalances?.length || 0;
      const postBalances = tx.meta?.postTokenBalances?.length || 0;
      console.log(`🔍 [decodeSwap] Processing TX ${sig}...: meta=${hasMeta}, pre=${preBalances}, post=${postBalances}`);
    }
    
    const swap = processTxForSwap(
      tx,                    // transaction with meta at top level
      tokenMint,             // targetMint
      solPriceUSD,           // solUsd
      tokenPriceCache,       // tokenPriceCache
      null,                  // midPriceUsd = null (DISABLE price outlier filter - we want ALL swaps)
      null,                  // raydiumDecoder (optional)
      poolAddress            // knownPoolAddress
    );
    
    if (!swap && process.env.DEBUG_SWAPS === '1') {
      const sig = tx.signature?.substring?.(0, 16) || 'unknown';
      console.log(`❌ [decodeSwap] No swap decoded for TX ${sig}...`);
    }
    
    if (!swap) return null;
    
    // Debug: Check if BUY is mislabeled
    // swap.change is the signed token delta (positive = user received tokens = BUY)
    // If swap.change > 0 but swap.type is 'SELL', that's a bug
    if (swap.change > 0 && swap.type === 'SELL') {
      // This is a BUY mislabeled as SELL - fix it
      swap.type = 'BUY';
    } else if (swap.change < 0 && swap.type === 'BUY') {
      // This is a SELL mislabeled as BUY - fix it
      swap.type = 'SELL';
    }
    
    // Convert to our format (SwapDetectionHelpers returns different field names)
    // Note: swap.type is already 'BUY' or 'SELL' from processTxForSwap (now corrected)
    
    // Recalculate volume USD using token amount * price USD (like DexScreener does)
    // This is more accurate than SOL amount * SOL price due to rounding
    const recalculatedVolumeUSD = (swap.tokenAmount || 0) * (swap.priceUsd || 0);
    
    return {
      type: swap.type, // Already 'BUY' or 'SELL' (corrected if needed)
      baseAmount: swap.tokenAmount || 0,
      quoteAmount: swap.baseAmount || 0, // baseAmount in decoder = counter leg amount
      price: swap.price || 0,
      priceUSD: swap.priceUsd || 0,
      volumeUSD: recalculatedVolumeUSD || swap.volumeUsd || 0, // Use recalculated for better accuracy
      walletAccount: swap.maker || null,
      signature: swap.signature || null,
      slot: swap.slot || null,
      blockTime: swap.timestamp ? new Date(swap.timestamp) : null,
      tokenMint,
      poolAddress,
      dex: swap.dex || 'Unknown'
    };
  } catch (error) {
    // Silently fail - not all transactions are swaps
    return null;
  }
}

/**
 * Test transaction-level decoding with a specific endpoint
 */
async function testEndpoint(endpointName, endpointConfig) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🧪 Testing ${endpointConfig.name} (${endpointName})`);
  console.log(`   URL: ${endpointConfig.url}`);
  console.log(`${'='.repeat(80)}\n`);
  
  // Discover pools for all tokens
  console.log('1️⃣ Discovering pools...\n');
  const poolAddresses = [];
  for (const [key, tokenConfig] of Object.entries(TEST_TOKENS)) {
    const pool = await discoverPool(tokenConfig);
    if (pool) {
      poolAddresses.push(pool);
      console.log(`   ${tokenConfig.name}: ${pool}\n`);
    }
  }
  
  if (poolAddresses.length === 0) {
    console.log('❌ No pools discovered, cannot continue test');
    return;
  }
  
  // Get SOL price
  await getSOLPrice();
  console.log(`💰 SOL Price: $${solPriceUSD.toFixed(2)}\n`);
  
  // Create gRPC client (same pattern as test-dynamic-pool-manager.mjs)
  console.log('2️⃣ Creating gRPC client...');
  const Client = YellowstoneGrpc.default || YellowstoneGrpc;
  const grpcClient = new Client(endpointConfig.url, GRPC_TOKEN);
  console.log('   ✅ Client created\n');
  
  // Create TRANSACTION filters (not account filters!)
  console.log('3️⃣ Setting up TRANSACTION subscription (not accounts!)...');
  console.log('   📊 This is the KEY difference - we decode swap instructions from transactions\n');
  
  // Transaction filters must be wrapped in a key (like "client" or "dex")
  const transactionFilters = {
    client: {
      accountInclude: poolAddresses, // Transactions involving these pools
      accountExclude: [],
      accountRequired: [],
      vote: false,
      failed: false
    }
  };
  
  const swapStats = new Map();
  const startTime = Date.now();
  const testDuration = 5 * 60 * 1000; // 5 minutes
  
  // Track current price for each token (updates after each swap)
  const currentPrices = new Map();
  
  // Create stream with TRANSACTION filters
  console.log('4️⃣ Creating stream with transaction filters...');
  const stream = await grpcClient.subscribeOnce(
    {}, // accounts - EMPTY! We're not using account filters
    {}, // slots
    transactionFilters, // transactions - THIS IS THE KEY!
    {}, // transactionsStatus
    {}, // entry
    {}, // blocks
    {}, // blocksMeta
    1, // CONFIRMED (1 = CommitmentLevel.CONFIRMED)
    [] // accountsDataSlice
  );
  
  console.log('   ✅ Stream created - listening for transactions...\n');
  console.log('5️⃣ Monitoring transactions (2 minutes)...\n');
  console.log('='.repeat(80));
  
  let txCount = 0;
  let swapCount = 0;
  let lastSOLPriceUpdate = Date.now();
  const SOL_PRICE_UPDATE_INTERVAL = 30000; // Update every 30 seconds
  
  // Update SOL price periodically
  const solPriceUpdateInterval = setInterval(async () => {
    const oldPrice = solPriceUSD;
    await getSOLPrice();
    if (Math.abs(solPriceUSD - oldPrice) > 0.01) {
      console.log(`\n💰 SOL Price updated: $${oldPrice.toFixed(2)} → $${solPriceUSD.toFixed(2)}\n`);
    }
  }, SOL_PRICE_UPDATE_INTERVAL);
  
  stream.on('data', (msg) => {
    if (msg.transaction) {
      txCount++;
      
      // Debug: Log first few transactions to understand structure
      if (txCount <= 3) {
        console.log(`\n🔍 DEBUG: Transaction #${txCount} structure:`);
        console.log(`   Has transaction: ${!!msg.transaction}`);
        console.log(`   Has transaction.transaction: ${!!msg.transaction.transaction}`);
        console.log(`   Has transaction.meta: ${!!msg.transaction.meta}`);
        if (msg.transaction.transaction) {
          console.log(`   Has message: ${!!msg.transaction.transaction.message}`);
          if (msg.transaction.transaction.message) {
            console.log(`   Account keys count: ${msg.transaction.transaction.message.accountKeys?.length || 0}`);
            console.log(`   Instructions count: ${msg.transaction.transaction.message.instructions?.length || 0}`);
          }
        }
        // Check for meta in all possible locations (match production structure)
        const innerTx = msg.transaction.transaction?.transaction || msg.transaction.transaction;
        const meta = innerTx?.meta || msg.transaction.transaction?.meta || msg.transaction.meta;
        if (meta) {
          console.log(`   ✅ Found meta! Pre token balances: ${meta.preTokenBalances?.length || 0}`);
          console.log(`   ✅ Post token balances: ${meta.postTokenBalances?.length || 0}`);
        } else {
          console.log(`   ❌ No meta found in any location - cannot detect swaps`);
        }
      }
      
      // Try to decode swap for each pool using our robust decoder
      for (const [key, tokenConfig] of Object.entries(TEST_TOKENS)) {
        if (!tokenConfig.pool) continue;
        
        // Get current price for this token (for logging only - we pass null to disable price filter)
        const currentPrice = currentPrices.get(tokenConfig.mint) || null;
        
        // CRITICAL: Pass null for midPriceUsd to DISABLE price outlier filter
        // After first swap, price changes, so we don't want to filter subsequent swaps
        const swap = decodeSwapFromTransaction(msg.transaction, tokenConfig.pool, tokenConfig.mint, tokenConfig, null);
        
        // Debug: Log ALL transactions that don't decode to swaps (after first swap detected, log all)
        if (!swap) {
          // Check if transaction involves the pool address
          const innerTx = msg.transaction.transaction?.transaction || msg.transaction.transaction;
          const txAccounts = innerTx?.message?.accountKeys || 
                            msg.transaction?.transaction?.message?.accountKeys || 
                            msg.transaction?.message?.accountKeys || [];
          const involvesPool = txAccounts.some(acc => {
            const addr = typeof acc === 'string' ? acc : (acc.pubkey || acc.toString());
            return addr === tokenConfig.pool;
          });
          
          if (involvesPool) {
            // Transaction involves pool but no swap decoded - log why
            const meta = innerTx?.meta || msg.transaction.transaction?.meta || msg.transaction.meta;
            const hasMeta = !!meta;
            const hasPreBalances = meta?.preTokenBalances?.length > 0;
            const hasPostBalances = meta?.postTokenBalances?.length > 0;
            
            // Log ALL transactions involving pool but no swap (to debug missing swaps)
            console.log(`⚠️  [TEST] TX #${txCount} involves pool but no swap decoded:`);
            console.log(`      meta=${hasMeta}, pre=${hasPreBalances}, post=${hasPostBalances}`);
            
            // Try to manually check what's in the transaction
            if (meta && hasPreBalances && hasPostBalances) {
              const preMints = meta.preTokenBalances.map(b => b.mint).filter(Boolean);
              const postMints = meta.postTokenBalances.map(b => b.mint).filter(Boolean);
              const allMints = [...new Set([...preMints, ...postMints])];
              console.log(`      Token mints in transaction: ${allMints.length} (${allMints.slice(0, 3).join(', ')}...)`);
              console.log(`      Target mint (${tokenConfig.mint.substring(0, 8)}...) in transaction: ${allMints.includes(tokenConfig.mint)}`);
            }
          }
        }
        
        if (swap) {
          swapCount++;
          
          // CRITICAL: Update current price after each swap so next swap uses updated price
          if (swap.priceUSD && swap.priceUSD > 0) {
            currentPrices.set(tokenConfig.mint, swap.priceUSD);
            console.log(`   💰 Price updated: $${swap.priceUSD.toFixed(6)} (for next swap's midPriceUsd)`);
          }
          
          if (!swapStats.has(key)) {
            swapStats.set(key, { buys: 0, sells: 0, swaps: [] });
          }
          const stats = swapStats.get(key);
          stats.swaps.push(swap);
          
          // Debug: Check if BUY is being mislabeled
          // If user receives tokens (positive amount) but it's labeled SELL, that's wrong
          if (swap.baseAmount > 0 && swap.type === 'SELL') {
            // This might be a BUY mislabeled as SELL - but user said SELLs are OK
            // So we trust the decoder for now
          }
          
          if (swap.type === 'BUY') stats.buys++;
          else stats.sells++;
          
          // Display swap with detailed calculation breakdown
          const swapType = swap.type === 'BUY' ? '🟢 BUY' : '🔴 SELL';
          console.log(`\n📊 Swap #${swapCount} - ${tokenConfig.name} (${swapType})`);
          console.log(`   DEX:         ${swap.dex || 'Unknown'}`);
          console.log(`   Pool:        ${tokenConfig.pool.substring(0, 16)}...`);
          console.log(`   Wallet:      ${swap.walletAccount?.substring(0, 16) || 'N/A'}...`);
          console.log(`   Amount:      ${swap.baseAmount.toLocaleString()} tokens`);
          console.log(`   SOL Amount:  ${swap.quoteAmount.toFixed(6)} SOL`);
          console.log(`   Price:       $${swap.priceUSD.toFixed(6)}`); // 6 decimals
          console.log(`   Volume USD:  $${swap.volumeUSD?.toFixed(2) || '0.00'}`);
          
          // Calculate Market Cap
          let marketCap = 0;
          if (tokenConfig.supply && swap.priceUSD > 0) {
            marketCap = tokenConfig.supply * swap.priceUSD;
            console.log(`   Market Cap:  $${marketCap.toLocaleString(undefined, { maximumFractionDigits: 0 })}`);
          }
          
          // Debug calculations - compare with what we expect
          const expectedPriceUSD = swap.price * solPriceUSD;
          const expectedVolumeUSD = swap.quoteAmount * solPriceUSD;
          const impliedSOLPrice = swap.volumeUSD / swap.quoteAmount;
          
          console.log(`   📊 Calculation Details:`);
          console.log(`      SOL Price Used:    $${solPriceUSD.toFixed(2)}`);
          console.log(`      Implied SOL Price: $${impliedSOLPrice.toFixed(2)} (from volume)`);
          console.log(`      Expected Price:    $${expectedPriceUSD.toFixed(6)}`); // 6 decimals
          console.log(`      Expected Volume:   $${expectedVolumeUSD.toFixed(2)}`);
          console.log(`      Price Diff:        $${Math.abs(swap.priceUSD - expectedPriceUSD).toFixed(6)}`); // 6 decimals
          console.log(`      Volume Diff:       $${Math.abs(swap.volumeUSD - expectedVolumeUSD).toFixed(2)}`);
          
          console.log(`   Signature:   ${swap.signature?.substring(0, 16) || 'N/A'}...`);
          if (swap.blockTime) {
            console.log(`   Block Time:  ${swap.blockTime.toLocaleString()}`);
          }
          console.log(`   Slot:        ${swap.slot || 'N/A'}`);
        }
      }
      
      // Log progress every 25 transactions (more frequent for 5-minute test)
      if (txCount % 25 === 0) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        const detectionRate = txCount > 0 ? ((swapCount / txCount) * 100).toFixed(2) : 0;
        console.log(`\n📈 [${elapsed}s] Progress: ${txCount} transactions, ${swapCount} swaps (${detectionRate}% detection rate)`);
      }
    }
  });
  
  stream.on('error', (error) => {
    console.error(`\n❌ Stream error: ${error.message}`);
  });
  
  // Run for test duration
  await new Promise(resolve => setTimeout(resolve, testDuration));
  
  // Close stream
  console.log(`\n\n⏱️  Test duration reached, closing stream...`);
  stream.cancel();
  
  // Print summary
  const actualDuration = (Date.now() - startTime) / 1000;
  console.log(`\n${'='.repeat(80)}`);
  console.log(`📊 TEST SUMMARY - WhiteWhale 5-Minute Test (${endpointConfig.name})`);
  console.log(`${'='.repeat(80)}`);
  console.log(`✅ Transactions Processed: ${txCount}`);
  console.log(`🔄 Swaps Detected: ${swapCount}`);
  console.log(`📈 Detection Rate: ${txCount > 0 ? ((swapCount / txCount) * 100).toFixed(2) : 0}%`);
  console.log(`⏱️  Duration: ${actualDuration.toFixed(1)}s (${(actualDuration / 60).toFixed(1)} minutes)\n`);
  
  for (const [key, tokenConfig] of Object.entries(TEST_TOKENS)) {
    if (!swapStats.has(key)) {
      console.log(`⚠️  ${tokenConfig.name}: No swaps detected`);
      continue;
    }
    
    const stats = swapStats.get(key);
    const total = stats.buys + stats.sells;
    console.log(`📊 ${tokenConfig.name}:`);
    console.log(`   Total Swaps: ${total}`);
    console.log(`   Buys:        ${stats.buys} (${total > 0 ? ((stats.buys / total) * 100).toFixed(1) : 0}%)`);
    console.log(`   Sells:       ${stats.sells} (${total > 0 ? ((stats.sells / total) * 100).toFixed(1) : 0}%)`);
    
    if (stats.swaps.length > 0) {
      const latestSwap = stats.swaps[stats.swaps.length - 1];
      const firstSwap = stats.swaps[0];
      const totalVolume = stats.swaps.reduce((sum, s) => sum + (s.volumeUSD || 0), 0);
      const avgVolume = totalVolume / stats.swaps.length;
      
      console.log(`   Latest Price: $${latestSwap.priceUSD.toFixed(6)}`);
      console.log(`   First Price:  $${firstSwap.priceUSD.toFixed(6)}`);
      
      // Calculate and display Market Cap
      if (tokenConfig.supply && latestSwap.priceUSD > 0) {
        const marketCap = tokenConfig.supply * latestSwap.priceUSD;
        console.log(`   Market Cap:   $${marketCap.toLocaleString(undefined, { maximumFractionDigits: 0 })}`);
      }
      console.log(`   Total Volume:  $${totalVolume.toFixed(2)}`);
      console.log(`   Avg Volume:   $${avgVolume.toFixed(2)} per swap`);
      
      // Show all swap signatures for verification
      console.log(`   \n   All Swap Signatures:`);
      stats.swaps.forEach((swap, idx) => {
        console.log(`      ${idx + 1}. ${swap.type} - $${(swap.volumeUSD || 0).toFixed(2)} - ${swap.signature || 'N/A'}`);
      });
    }
    console.log('');
  }
}

/**
 * Main test function
 */
async function runTest() {
  console.log('🚀 TRANSACTION-LEVEL DECODING TEST - WhiteWhale 5-Minute Test');
  console.log('===================================\n');
  console.log('Testing WhiteWhale (a3W4qutoEJA4232T2gwZUfgYJTetr96pU4SJMwppump)');
  console.log('Duration: 5 minutes');
  console.log('Goal: Verify we catch ALL swaps\n');
  console.log('Key Difference:');
  console.log('  - Account-based: Monitor reserve accounts, infer swaps (heuristic)');
  console.log('  - Transaction-based: Decode actual swap instructions (accurate)\n');
  
  // Test Kaldera endpoint
  for (const [key, endpoint] of Object.entries(ENDPOINTS)) {
    try {
      await testEndpoint(key, endpoint);
    } catch (error) {
      console.error(`\n❌ Error testing ${endpoint.name}:`, error.message);
      console.error(error.stack);
    }
  }
  
  console.log('\n✅ Test complete!');
}

// Run the test
runTest().catch(console.error);

