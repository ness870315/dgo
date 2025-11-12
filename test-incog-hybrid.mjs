import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const YellowstoneGrpc = require('@triton-one/yellowstone-grpc');
const Client = YellowstoneGrpc.default || YellowstoneGrpc;
const CommitmentLevel = YellowstoneGrpc.CommitmentLevel || YellowstoneGrpc.default?.CommitmentLevel;

import { Connection, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import {
  detectSwapsForMint,
  extractTokenDeltas,
  buildCombinedKeys
} from './backend/services/SwapDetectionHelpers.mjs';

const GRPC_ENDPOINT = 'http://grpc.constant-k.com';
const GRPC_TOKEN = '39facrmt-om2u-4al5-5k4h-g8pls2y5vhui';
const RPC_ENDPOINT = 'https://rpc.constant-k.com/?api-key=39facrmt-om2u-4al5-5k4h-g8pls2y5vhui';

const [, , mintArg, poolArg, nameArg] = process.argv;
const isVerbose = process.env.VERBOSE === '1';

const DEFAULT_TARGET = {
  mint: 'DKAN3tyxnvgUrgGHAHsorBGgVGDVt9uEiRUybHrs77P3',
  pool: '4CBxnEqnqjzVjFPfCHKysN9NZKQVN4SW6wVNPQ8hY3RP',
  name: 'INCOG'
};

const TARGET_MINT = mintArg || DEFAULT_TARGET.mint;
const TARGET_POOL = poolArg || (mintArg ? null : DEFAULT_TARGET.pool);
const TARGET_NAME = nameArg || (mintArg ? `${TARGET_MINT.slice(0, 4)}…${TARGET_MINT.slice(-4)}` : DEFAULT_TARGET.name);
const WSOL = 'So11111111111111111111111111111111111111112';
const SOL_PRICE_USD = 154.50;
const RUN_DURATION_MS = Number(process.env.DURATION_MS ?? 30000);
const BACKFILL_LIMIT = Number(process.env.BACKFILL_LIMIT ?? 10);

const AMM_PROGRAMS = [
  '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',
  'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK',
  'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C',
  'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc',
  'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo',
  'Dooar9JkhdZ7J3LHN3A7YCuoGRUggXhQaG4kijfLGU2j',
  'cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG',
  'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA',
  '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P'
];
const ROUTER_PROGRAMS = [
  'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
  'JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB',
  'Df1hXnHxY3Mqf7QwsdQqMfnSjvMC5JmBsr3A21JhJ6N6', // DFLOW (example, adjust if needed)
  'obrictJX45pyrxhpMRdqREJWCbcSCH1aAHs6PvttDf7',  // Obric router (example)
  'HVi6VyyLvTtFTA8f8atavxVjUKi8WjmnydfKgoZKzt7H', // Pump.fun aggregator router
  'BLUR9cL8HqZzu5bSaC7VRX25RCG93Hv3T6NPyKxQhWUT'  // Blur aggregator detected in stream
];
const DEX_PROGRAMS = [...AMM_PROGRAMS, ...ROUTER_PROGRAMS];

const rpcConnection = new Connection(RPC_ENDPOINT, 'confirmed');
const signatureQueue = [];
let rpcWorkerActive = false;
let backfillComplete = false;
const seenSignatures = new Set();
let debugLogged = false;

const stats = {
  start: Date.now(),
  grpcMessages: 0,
  grpcCandidates: 0,
  rpcFetches: 0,
  rpcSuccess: 0,
  swaps: 0
};

const tokenPriceCache = new Map();

function extractSignature(msg) {
  const txContainer = msg.transaction?.transaction;
  const signature =
    txContainer?.signature ||
    txContainer?.transaction?.signatures?.[0] ||
    msg.transaction?.signature;

  if (!signature) return null;

  if (Buffer.isBuffer(signature)) {
    return bs58.encode(signature);
  }

  return typeof signature === 'string' ? signature : String(signature);
}

function handleGrpcMessage(msg) {
  stats.grpcMessages++;

  const txContainer = msg.transaction?.transaction;
  const meta = txContainer?.meta || msg.transaction?.meta;
  if (!meta) {
    if (isVerbose) {
      const keys = Object.keys(msg);
      const hasTx = !!msg.transaction;
      const hasTypoTx = !!msg.transactioon;
      console.log(`⚠️ [gRPC] Message missing meta (transaction=${hasTx}, transactioon=${hasTypoTx}) keys=${keys.join(',')}`);
      if (hasTx && stats.grpcMessages <= 3) {
        console.log(`   transaction keys: ${Object.keys(msg.transaction)}`);
        console.log(`   transaction.transaction keys: ${txContainer ? Object.keys(txContainer) : 'none'}`);
      }
      if (hasTypoTx && stats.grpcMessages <= 3) {
        console.log(`   transactioon keys: ${Object.keys(msg.transactioon)}`);
      }
    }
    return;
  }
  const preBalances = meta?.preTokenBalances || [];
  const postBalances = meta?.postTokenBalances || [];

  const touchesTarget = [...preBalances, ...postBalances].some(
    (bal) => bal?.mint === TARGET_MINT
  );
  if (!touchesTarget) {
    if (isVerbose && stats.grpcMessages % 200 === 0) {
      const sample = [...preBalances, ...postBalances].slice(0, 5).map(b => b?.mint).filter(Boolean);
      console.log(`⚪ [gRPC] Skipped msg #${stats.grpcMessages} (target not found). Sample mints: ${sample.join(', ') || 'none'}`);
    }
    return;
  }

  if (stats.grpcMessages <= 3 && isVerbose) {
    console.log(`📦 [gRPC msg #${stats.grpcMessages}] pre=${preBalances.length}, post=${postBalances.length}`);
    const txKeys = Object.keys(msg.transaction || {});
    console.log(`   Keys: ${txKeys.join(', ')}`);
  }

  const signature = extractSignature(msg);
  if (!signature && isVerbose) {
    console.log('   ⚠️ Unable to extract signature from message structure');
  }
  if (!signature) return;

  if (seenSignatures.has(signature)) return;
  seenSignatures.add(signature);

  stats.grpcCandidates++;
  if (isVerbose) {
    console.log(`🔍 [gRPC] Candidate #${stats.grpcCandidates}: ${signature}`);
  }

  if (!signatureQueue.includes(signature)) {
    signatureQueue.push(signature);
    startRpcWorker();
  }
}

async function startRpcWorker() {
  if (rpcWorkerActive) return;
  rpcWorkerActive = true;

  while (signatureQueue.length > 0) {
    const signature = signatureQueue.shift();
    stats.rpcFetches++;

    try {
      if (isVerbose) {
        console.log(`📡 [RPC fetch #${stats.rpcFetches}] ${signature}`);
      }

      let tx = null;
      try {
        tx = await rpcConnection.getTransaction(signature, {
          maxSupportedTransactionVersion: 0,
          commitment: 'confirmed'
        });
      } catch (err) {
        if (String(err.message).includes('maxSupportedTransactionVersion')) {
          console.warn('⚠️ [RPC] Retrying without maxSupportedTransactionVersion for', signature);
          tx = await rpcConnection.getTransaction(signature, {
            commitment: 'confirmed'
          });
        } else {
          throw err;
        }
      }

      if (!tx) {
        if (isVerbose) console.log('❌ [RPC] Transaction not found');
        continue;
      }

      stats.rpcSuccess++;
      const swaps = parseTransaction(tx, signature);
      if (swaps.length === 0) {
        if (isVerbose) console.log('⚠️ [RPC] No swaps decoded');
      } else {
        swaps.forEach(displaySwap);
      }

    } catch (error) {
      console.error(`❌ [RPC] Error: ${error.message}`);
    }

    await new Promise(r => setTimeout(r, 5));
  }

  rpcWorkerActive = false;
}

function parseTransaction(tx, signatureFallback) {
  const swaps = detectSwapsForMint(
    tx,
    TARGET_MINT,
    SOL_PRICE_USD,
    tokenPriceCache,
    TARGET_POOL || undefined
  );

  if (!swaps.length) {
    if (isVerbose) debugMiss(tx, 'no swaps detected');
    return [];
  }

  return swaps.map((swap) => {
    const signature = swap.signature || signatureFallback;
    const counterMint = swap.counterMint || (swap.solAmount ? WSOL : null);
    const baseLabel = counterMint === WSOL ? 'SOL' : counterMint ? shortenKey(counterMint) : 'BASE';
    const baseAmount = swap.baseAmount ?? swap.solAmount ?? 0;
    return {
      signature,
      slot: swap.slot ?? tx.slot,
      timestamp: swap.timestamp ?? Date.now(),
      type: swap.type,
      tokenAmount: swap.tokenAmount,
      baseAmount,
      baseLabel,
      priceUsd: swap.priceUsd,
      volumeUsd: swap.volumeUsd,
      maker: swap.walletAddress || swap.maker || 'unknown'
    };
  });
}

function debugMiss(tx, note) {
  const message = tx.transaction?.message ?? {};
  const { combined } = buildCombinedKeys(message);
  const sig = tx.transaction?.signatures?.[0] || tx.signature || 'unknown';
  const header = `[DEBUG MISS] ${note} :: ${sig}`;
  console.log(header);

  const topInstructions = message.instructions ?? [];
  if (topInstructions.length) {
    console.log(`   • top-level instructions (${topInstructions.length}):`);
    topInstructions.forEach((ix, idx) => {
      const programId = resolveIxProgramId(ix, combined);
      const accounts = ix.accounts ?? ix.accountKeyIndexes ?? ix.accountIndices ?? [];
      console.log(`     - [${idx}] program=${programId} accIdx=${accounts.length}`);
    });
  } else {
    console.log('   • no top-level instructions found');
  }

  const inner = tx.meta?.innerInstructions ?? [];
  if (inner.length) {
    console.log(`   • inner instructions groups (${inner.length}):`);
    inner.forEach((group, gIdx) => {
      const items = group.instructions ?? [];
      console.log(`     - group ${gIdx} slot ${group.index} (count=${items.length})`);
      items.forEach((ix, ixIdx) => {
        const programId = resolveIxProgramId(ix, combined);
        const accounts = ix.accounts ?? ix.accountKeyIndexes ?? ix.accountIndices ?? [];
        console.log(`         • [${ixIdx}] program=${programId} accIdx=${accounts.length}`);
      });
    });
  } else {
    console.log('   • no inner instructions');
  }

  const deltas = extractTokenDeltas(tx);
  if (deltas.length) {
    const forTarget = deltas.filter(d => d.mint === TARGET_MINT);
    console.log(`   • token deltas (${deltas.length}) targetHits=${forTarget.length}`);
    forTarget.slice(0, 5).forEach((d, idx) => {
      console.log(`     - [${idx}] owner=${shortenKey(d.owner)} delta=${d.deltaUI.toFixed(6)} acct=${shortenKey(d.accountPubkey)}`);
    });
  } else {
    console.log('   • token deltas: none');
  }
}

function resolveIxProgramId(ix, combined) {
  if (ix.programId) {
    if (typeof ix.programId === 'string') return ix.programId;
    if (ix.programId.toBase58) return ix.programId.toBase58();
    if (ix.programId.type === 'Buffer' && Array.isArray(ix.programId.data)) {
      return bs58.encode(Uint8Array.from(ix.programId.data));
    }
  }
  if (typeof ix.programIdIndex === 'number') {
    return combined[ix.programIdIndex] ?? `idx:${ix.programIdIndex}`;
  }
  if (typeof ix.programId === 'number') {
    return combined[ix.programId] ?? `idx:${ix.programId}`;
  }
  return 'unknown-program';
}

function displaySwap(swap) {
  stats.swaps++;
  const elapsed = ((Date.now() - stats.start) / 1000).toFixed(1);
  const ts = new Date(swap.timestamp).toISOString().split('T')[1].replace('Z', '');
  const baseDisplay =
    swap.baseLabel === 'SOL'
      ? `${swap.baseAmount.toFixed(5)} SOL`
      : `${formatNumber(swap.baseAmount)} ${swap.baseLabel}`;
  const priceDisplay = isFinite(swap.priceUsd) ? `$${swap.priceUsd.toFixed(6)}` : '$—';
  const volumeDisplay = isFinite(swap.volumeUsd) ? `$${swap.volumeUsd.toFixed(2)}` : '$—';
  const fields = [
    `[${ts}]`,
    padSide(swap.type, 4),
    `${formatNumber(swap.tokenAmount)} ${TARGET_NAME}`,
    baseDisplay,
    priceDisplay,
    `Vol ${volumeDisplay}`,
    `Maker ${shortenKey(swap.maker)}`,
    shortenKey(swap.signature)
  ];
  const marker = swap.type === 'SELL' ? '🔴' : '🟢';
  console.log(`${marker} ${fields.join(' | ')}`);
}

function padSide(value, width) {
  if (value.length >= width) return value;
  return value + ' '.repeat(width - value.length);
}

function formatNumber(num) {
  if (num >= 1000000) return `${(num / 1000000).toFixed(2)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(2)}K`;
  return num.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function shortenKey(key) {
  if (!key || key === 'unknown') return 'unknown';
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

async function main() {
  console.log('\n' + '='.repeat(80));
  console.log('🚀 Hybrid gRPC + RPC swap monitor');
  console.log('='.repeat(80));
  console.log(`Target token: ${TARGET_NAME} (${TARGET_MINT})`);
  if (TARGET_POOL) {
    console.log(`Target pool: ${TARGET_POOL}`);
  } else {
    console.log('Target pool: (none provided – backfill disabled)');
  }
  console.log(`gRPC endpoint: ${GRPC_ENDPOINT}`);
  console.log(`RPC endpoint: ${RPC_ENDPOINT}`);
  console.log('='.repeat(80) + '\n');

  // Backfill recent swaps first so we see data immediately
  if (TARGET_POOL && BACKFILL_LIMIT > 0) {
    await backfillRecentSwaps(BACKFILL_LIMIT);
  } else {
    console.log('⏭️  Skipping backfill.\n');
  }

  const client = new Client(GRPC_ENDPOINT, GRPC_TOKEN);

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
      include_accounts: true
    }
  };

  const stream = await client.subscribeOnce(
    {},
    {},
    transactionFilters,
    {},
    {},
    {},
    {},
    CommitmentLevel.CONFIRMED,
    []
  );

  console.log('✅ Stream connected (full metadata)\n');

  stream.on('data', handleGrpcMessage);
  stream.on('error', (err) => {
    console.error('❌ Stream error:', err.message);
    process.exit(1);
  });

  const statsInterval = setInterval(() => {
    const elapsed = ((Date.now() - stats.start) / 1000).toFixed(0);
    console.log(`📊 ${elapsed}s | gRPC ${stats.grpcMessages} | RPC ${stats.rpcSuccess}/${stats.rpcFetches} | swaps ${stats.swaps}`);
  }, 10000);

  setTimeout(() => {
    clearInterval(statsInterval);
    console.log('\n' + '='.repeat(80));
    console.log(`⏱️ ${Math.round(RUN_DURATION_MS / 1000)} SECONDS ELAPSED - FINAL RESULTS`);
    console.log('='.repeat(80));
    console.log(`gRPC Messages: ${stats.grpcMessages}`);
    console.log(`gRPC Candidates: ${stats.grpcCandidates}`);
    console.log(`RPC Fetches: ${stats.rpcFetches}`);
    console.log(`RPC Success: ${stats.rpcSuccess}`);
    console.log(`Swaps Detected: ${stats.swaps}`);
    console.log('='.repeat(80));
    process.exit(0);
  }, RUN_DURATION_MS);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

async function backfillRecentSwaps(limit = 10) {
  try {
    if (!TARGET_POOL) return;
    console.log(`📥 Backfilling last ${limit} swaps from RPC for ${TARGET_NAME}...`);
    const signatures = await rpcConnection.getSignaturesForAddress(
      new PublicKey(TARGET_POOL),
      { limit }
    );

    for (const sigInfo of signatures.reverse()) {
      const signature = sigInfo.signature;
      try {
        const tx = await rpcConnection.getTransaction(signature, {
          maxSupportedTransactionVersion: 0,
          commitment: 'confirmed'
        });
        if (!tx) continue;
        const swaps = parseTransaction(tx, signature);
        swaps.forEach(displaySwap);
      } catch (error) {
        console.error(`❌ [Backfill] Failed for ${signature}: ${error.message}`);
      }
      await new Promise(r => setTimeout(r, 5));
    }

    console.log('✅ Backfill complete. Listening for live swaps...\n');
    backfillComplete = true;
  } catch (error) {
    console.error('❌ Backfill error:', error.message);
  }
}

function resolveMetaKeyByIndex(message, idx) {
  const accountKeys = message.accountKeys || [];
  if (idx < accountKeys.length) {
    return toBase58(accountKeys[idx]);
  }

  const loaded = message.loadedAddresses || {};
  const writable = loaded.writable || [];
  const readonly = loaded.readonly || [];

  let offset = idx - accountKeys.length;
  if (offset < writable.length) {
    return toBase58(writable[offset]);
  }

  offset -= writable.length;
  if (offset < readonly.length) {
    return toBase58(readonly[offset]);
  }

  return '';
}

function toBase58(key) {
  if (!key) return '';
  if (typeof key === 'string') return key;
  if (key.toBase58) return key.toBase58();
  if (key.pubkey) return toBase58(key.pubkey);
  if (Buffer.isBuffer(key)) return new PublicKey(key).toBase58();
  if (Array.isArray(key)) return new PublicKey(Buffer.from(key)).toBase58();
  return String(key);
}
