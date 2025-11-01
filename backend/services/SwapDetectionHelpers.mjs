/**
 * Robust Swap Detection Helpers
 * 
 * Handles v0 transactions with address lookup tables, binary Buffer keys,
 * and proper pre/post balance matching by accountIndex.
 */

import bs58 from 'bs58';
import { PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';

const WSOL_MINT = 'So11111111111111111111111111111111111111112';

// 🚀 Stablecoin whitelist for counter USD pricing
const STABLECOIN_MINTS = new Set([
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
    'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
]);

// 🚀 EWMA alpha for mid-price tracking (tune: 0.1-0.3)
const MID_PRICE_ALPHA = 0.2;

// ============================================================================
// 0) Helpers: normalize keys (legacy & v0), resolve indexes
// ============================================================================

/**
 * Normalize any accountKeys entry → base58
 */
function keyToBase58(k) {
    if (!k) return '';
    if (typeof k === 'string') return k;
    if (typeof k === 'object' && k.pubkey) return k.pubkey; // web3 v1.92+ style
    if (k.type === 'Buffer' && Array.isArray(k.data)) {
        return bs58.encode(Uint8Array.from(k.data));
    }
    if (k instanceof Uint8Array) return bs58.encode(k);
    try {
        return bs58.encode(Buffer.from(k));
    } catch {
        return String(k);
    }
}

/**
 * Build the **combined** key list (static + address table)
 */
function buildCombinedKeys(message) {
    const statics = (message.accountKeys ?? []).map(keyToBase58);
    const loadedW = (message.loadedAddresses?.writable ?? []).map(keyToBase58);
    const loadedR = (message.loadedAddresses?.readonly ?? []).map(keyToBase58);
    const combined = [...statics, ...loadedW, ...loadedR];
    return { combined, statics, loadedW, loadedR };
}

/**
 * Get set of signer public keys
 */
function getSignerSet(message) {
    const num = message?.header?.numRequiredSignatures ?? 0;
    const { combined } = buildCombinedKeys(message);
    return new Set(combined.slice(0, num));
}

/**
 * Resolve account key by index (handles address lookup tables)
 */
function resolveKeyByIndex(message, idx) {
    const { combined } = buildCombinedKeys(message);
    return combined[idx] ?? '';
}

// ============================================================================
// 1) Robust token delta extraction (integer math first)
// ============================================================================

/**
 * Extract all token balance changes from a transaction
 * @returns {Array<TokenDelta>}
 */
export function extractTokenDeltas(tx) {
    const pre = tx.meta?.preTokenBalances ?? [];
    const post = tx.meta?.postTokenBalances ?? [];
    const message = tx.transaction?.message ?? {};
    const deltas = [];

    const byIdxPre = new Map();
    pre.forEach((b) => byIdxPre.set(b.accountIndex, b));

    const byIdxPost = new Map();
    post.forEach((b) => byIdxPost.set(b.accountIndex, b));

    const allIdx = new Set([...byIdxPre.keys(), ...byIdxPost.keys()]);
    for (const idx of allIdx) {
        const preB = byIdxPre.get(idx);
        const postB = byIdxPost.get(idx);
        const anyB = postB ?? preB;
        const decimals = Number(anyB?.uiTokenAmount?.decimals ?? 0);
        const preRaw = BigInt(preB?.uiTokenAmount?.amount ?? '0');
        const postRaw = BigInt(postB?.uiTokenAmount?.amount ?? '0');
        const deltaRaw = postRaw - preRaw;
        if (deltaRaw === 0n) continue;

        const accountPubkey = resolveKeyByIndex(message, idx);
        deltas.push({
            accountIndex: idx,
            accountPubkey,
            mint: anyB.mint,
            owner: anyB.owner, // owner of the token account (ATA or vault)
            decimals,
            preRaw,
            postRaw,
            deltaRaw,
            deltaUI: Number(deltaRaw) / 10 ** decimals,
        });
    }

    return deltas;
}

// ============================================================================
// 2) Native SOL delta for signers (lamports → SOL)
// ============================================================================

/**
 * Extract native SOL balance changes for signers
 * @returns {Map<string, number>} Map of signer pubkey → SOL delta
 */
export function extractNativeSolDeltaBySigner(tx) {
    const preLam = tx.meta?.preBalances ?? [];
    const postLam = tx.meta?.postBalances ?? [];
    const msg = tx.transaction?.message ?? {};
    const { combined } = buildCombinedKeys(msg);
    const numSigs = msg?.header?.numRequiredSignatures ?? 0;

    const map = new Map();
    for (let i = 0; i < numSigs; i++) {
        const key = combined[i];
        const deltaLam = (postLam[i] ?? 0) - (preLam[i] ?? 0);
        map.set(key, deltaLam / 1_000_000_000); // SOL
    }
    return map;
}

// ============================================================================
// 3) Classify user vs pool token accounts (signer & ATA heuristic)
// ============================================================================

/**
 * Check if tokenAccount is the ATA of owner for mint
 */
function isAtaOf(owner, mint, tokenAccount) {
    try {
        const ata = getAssociatedTokenAddressSync(
            new PublicKey(mint),
            new PublicKey(owner),
            false
        ).toBase58();
        return ata === tokenAccount;
    } catch {
        return false;
    }
}

/**
 * Determine if a token delta is on the user side (vs pool side)
 */
export function isUserSide(delta, signerSet) {
    // user side if token account owner is a signer (or ATA of a signer)
    if (signerSet.has(delta.owner)) return true;
    for (const s of signerSet) {
        if (isAtaOf(s, delta.mint, delta.accountPubkey)) return true;
    }
    return false;
}

// ============================================================================
// 4) Helper: Get fee payer (safer than "first signer")
// ============================================================================

/**
 * Get fee payer from transaction (always accountKeys[0])
 */
function getFeePayer(tx) {
    const { combined } = buildCombinedKeys(tx.transaction?.message ?? {});
    return combined[0] ?? '';
}

// ============================================================================
// 5) Helper: Collapse user-side deltas by mint (avoid double-counting)
// ============================================================================

/**
 * Collapse multiple user-side deltas per mint into largest-magnitude delta
 * (Some routes emit multiple inner movements of the same leg)
 */
function collapseUserSideByMint(deltas, signerSet) {
    const best = {};
    for (const d of deltas.filter((x) => isUserSide(x, signerSet))) {
        const cur = best[d.mint];
        if (!cur || Math.abs(d.deltaUI) > Math.abs(cur.deltaUI)) {
            best[d.mint] = d;
        }
    }
    return Object.values(best);
}

// ============================================================================
// 6) Helper: Conservation check (sanity)
// ============================================================================

/**
 * Check if per-mint conservation holds (sum of all deltas ≈ 0)
 */
function mintSum(deltas, mint) {
    return deltas.filter((d) => d.mint === mint).reduce((s, d) => s + d.deltaUI, 0);
}

// ============================================================================
// 7) Helper: Check if fee payer/signer touched target mint
// ============================================================================

/**
 * Verify that fee payer or any signer is involved on the target mint
 * (Prevents emitting trades for pure pool/vault movements)
 */
function userTouchedTargetMint(deltas, feePayer, signerSet, targetMint) {
    return deltas.some(
        (d) =>
            d.mint === targetMint &&
            (d.owner === feePayer ||
                signerSet.has(d.owner) ||
                isAtaOf(feePayer, d.mint, d.accountPubkey)) &&
            Math.abs(d.deltaUI) > 1e-9
    );
}

// ============================================================================
// 8) Pick legs (target vs counter), decide BUY/SELL
// ============================================================================

/**
 * Pick target and counter legs, determine BUY/SELL
 * @returns {{ target: TokenDelta, counter: TokenDelta, side: 'BUY'|'SELL', feePayer: string } | null}
 */
export function pickLegsAndSide(deltas, targetMint, signerSet, tx) {
    // 🚀 GUARDRAIL 1: Require fee payer/signer to be involved on target mint
    const feePayer = getFeePayer(tx);
    if (!userTouchedTargetMint(deltas, feePayer, signerSet, targetMint)) {
        console.log(`⚠️ [pickLegsAndSide] Skip: no fee payer/signer involvement on target mint ${targetMint.substring(0, 8)}... (fee payer: ${feePayer.substring(0, 8)}...)`);
        return null;
    }
    
    // 🚀 GUARDRAIL 2: Collapse user-side deltas by mint to avoid double-counting
    const collapsed = collapseUserSideByMint(deltas, signerSet);
    
    // 🚀 HARDENING: Check for multi-hop routes (3+ mints on user side)
    // Build userSideByMint map for explicit logging
    const userSideByMint = new Map();
    for (const d of collapsed) {
        userSideByMint.set(d.mint, (userSideByMint.get(d.mint) || 0) + d.deltaUI);
    }
    
    if (userSideByMint.size > 2) {
        const sig = typeof tx.signature === 'string' ? tx.signature : 
                    (tx.signature?.type === 'Buffer' ? bs58.encode(Uint8Array.from(tx.signature.data)) : 'unknown');
        console.log(`⚠️ [pickLegsAndSide] Skip: routed_aggregator (${userSideByMint.size} mints) for ${targetMint.substring(0, 8)}...`, {
            sig: sig.substring(0, 16) + '...',
            mints: [...userSideByMint.keys()].map(m => m.substring(0, 8) + '...')
        });
        return null;
    }
    
    // 🚀 HARDENING: Conservation check
    const sumTarget = mintSum(deltas, targetMint);
    if (Math.abs(sumTarget) > 1e-6) {
        console.log(`⚠️ [pickLegsAndSide] Warning: non-zero mint sum for ${targetMint.substring(0, 8)}... (${sumTarget.toFixed(9)})`);
    }
    
    // Pick target delta (MUST be user-side)
    const targetLeg = collapsed
        .filter((d) => d.mint === targetMint)
        .sort((a, b) => Math.abs(b.deltaUI) - Math.abs(a.deltaUI))[0];
    
    if (!targetLeg || Math.abs(targetLeg.deltaUI) < 1e-9) {
        console.log(`⚠️ [pickLegsAndSide] Skip: no user target delta for ${targetMint.substring(0, 8)}...`);
        return null;
    }

    // 🚀 HARDENING: Require user-side counter first
    let counterLeg = collapsed
        .filter((d) => d.mint !== targetMint)
        .sort((a, b) => Math.abs(b.deltaUI) - Math.abs(a.deltaUI))[0];

    // 🚀 HARDENING: Fallback to native SOL delta of fee payer
    if (!counterLeg) {
        const solDeltaBySigner = extractNativeSolDeltaBySigner(tx);
        const solDelta = solDeltaBySigner.get(feePayer) ?? 0;
        
        if (solDelta !== 0 && Math.abs(solDelta) > 1e-6) {
            console.log(`💰 [pickLegsAndSide] Using native SOL as counter: ${solDelta.toFixed(6)} SOL (fee payer: ${feePayer.substring(0, 8)}...)`);
            counterLeg = {
                accountIndex: -1,
                accountPubkey: feePayer,
                mint: WSOL_MINT, // treat as the SOL leg type
                owner: feePayer,
                decimals: 9,
                preRaw: 0n,
                postRaw: 0n,
                deltaRaw: BigInt(Math.round(solDelta * 1e9)),
                deltaUI: solDelta,
            };
        } else {
            // Last resort: allow pool-side largest delta
            counterLeg = deltas
                .filter((d) => d.mint !== targetMint)
                .sort((a, b) => Math.abs(b.deltaUI) - Math.abs(a.deltaUI))[0];
            
            if (counterLeg) {
                console.log(`⚠️ [pickLegsAndSide] Using pool-side counter as last resort: ${counterLeg.mint.substring(0, 8)}...`);
            }
        }
    }

    if (!counterLeg || Math.abs(counterLeg.deltaUI) < 1e-12) {
        console.log(`⚠️ [pickLegsAndSide] Skip: no counter leg for ${targetMint.substring(0, 8)}... (single-leg case - likely fees/airdrops/ATA init)`);
        return null;
    }

    const side = targetLeg.deltaUI > 0 ? 'BUY' : 'SELL';
    
    // 🚀 DEBUG: Log leg details for verification
    console.log(`📊 [pickLegsAndSide] ${side} legs selected:`);
    console.log(`   TARGET: owner=${targetLeg.owner.substring(0, 8)}..., acct=${targetLeg.accountPubkey.substring(0, 8)}..., Δ=${targetLeg.deltaUI.toFixed(6)}, mint=${targetLeg.mint.substring(0, 8)}...`);
    console.log(`   COUNTER: owner=${counterLeg.owner.substring(0, 8)}..., acct=${counterLeg.accountPubkey.substring(0, 8)}..., Δ=${counterLeg.deltaUI.toFixed(6)}, mint=${counterLeg.mint.substring(0, 8)}...`);
    console.log(`   FEE PAYER: ${feePayer.substring(0, 8)}...`);
    
    return { target: targetLeg, counter: counterLeg, side, feePayer };
}

// ============================================================================
// 5) Price & volume (pair-agnostic, supports USDC or wSOL or anything)
// ============================================================================

/**
 * Compute price and volume from target/counter legs
 * 🚀 HARDENING: Explicit stablecoin whitelist for USD pricing
 */
export function computePriceAndVolume(target, counter, solUsd, getUsdForMint) {
    const qtyT = Math.abs(target.deltaUI);
    const qtyC = Math.abs(counter.deltaUI);
    if (qtyT === 0 || qtyC === 0) {
        return { priceInCounter: NaN, priceUsd: NaN, volumeUsd: 0 };
    }

    const priceInCounter = qtyC / qtyT;

    let counterUsd = 0;
    if (counter.mint === WSOL_MINT) {
        counterUsd = solUsd;
    } else if (STABLECOIN_MINTS.has(counter.mint)) {
        // Explicit stablecoin whitelist
        counterUsd = 1.0;
    } else {
        // Try to get USD price from cache
        counterUsd = getUsdForMint(counter.mint) ?? 0;
    }

    const priceUsd = counterUsd > 0 ? priceInCounter * counterUsd : NaN;
    const volumeUsd = counterUsd > 0 ? qtyC * counterUsd : 0;

    return { priceInCounter, priceUsd, volumeUsd };
}

// ============================================================================
// 6) Pool address guesser (crude but works)
// ============================================================================

/**
 * Guess pool address from transaction instructions
 */
export function guessPoolFromIx(tx) {
    const msg = tx.transaction?.message ?? {};
    const { combined } = buildCombinedKeys(msg);
    const numSig = msg?.header?.numRequiredSignatures ?? 0;
    const signerKeys = new Set(combined.slice(0, numSig));
    for (const ix of msg.instructions ?? []) {
        const accIdxs = Array.isArray(ix.accounts)
            ? ix.accounts
            : ix.accounts?.data
            ? Array.from(ix.accounts.data)
            : [];
        for (const i of accIdxs) {
            const k = combined[i];
            if (k && !signerKeys.has(k)) return k; // first non-signer account in the ix
        }
    }
    return undefined;
}

// ============================================================================
// 7) Main processor
// ============================================================================

/**
 * Process a transaction and extract swap data
 * @returns {Object | null} Swap record or null if not a valid swap
 */
export function processTxForSwap(tx, targetMint, solUsd, tokenPriceCache, midPriceUsd = null) {
    const deltas = extractTokenDeltas(tx);
    if (!deltas.length) return null;

    const message = tx.transaction?.message ?? {};
    const signerSet = getSignerSet(message);
    const legs = pickLegsAndSide(deltas, targetMint, signerSet, tx); // Pass tx for native SOL fallback
    if (!legs) return null;

    const getUsdForMint = (m) => tokenPriceCache.get(m);
    const { priceInCounter, priceUsd, volumeUsd } = computePriceAndVolume(
        legs.target,
        legs.counter,
        solUsd,
        getUsdForMint
    );

    // 🚀 PATCH 2: Dust/price sanity filters
    let signature = tx.signature ?? tx.transaction?.signatures?.[0];
    
    // Handle Buffer signature
    if (signature && typeof signature !== 'string') {
        if (signature.type === 'Buffer' && Array.isArray(signature.data)) {
            signature = bs58.encode(Uint8Array.from(signature.data));
        } else if (signature instanceof Uint8Array || Buffer.isBuffer(signature)) {
            signature = bs58.encode(signature);
        } else {
            signature = String(signature);
        }
    }
    
    const sigShort = signature?.substring(0, 16) ?? 'unknown';

    // Drop obvious noise - dust volume
    if (!isFinite(volumeUsd) || volumeUsd < 0.05) {
        console.log(`⚠️ [processTxForSwap] Skip: dust volume ($${volumeUsd?.toFixed(4) ?? 'N/A'}) for ${sigShort}...`);
        return null;
    }

    // 🚀 HARDENING: Robust price outlier filter (5x/0.2x thresholds)
    if (priceUsd > 0 && midPriceUsd && midPriceUsd > 0) {
        const ratio = priceUsd / midPriceUsd;
        if (ratio > 5 || ratio < 0.2) {
            // >5× or <0.2× off mid? likely mis-leg or outlier
            console.log(`⚠️ [processTxForSwap] Skip: price outlier (${ratio.toFixed(2)}x ratio, price=$${priceUsd.toFixed(8)}, mid=$${midPriceUsd.toFixed(8)}) for ${sigShort}...`);
            return null;
        }
    }

    const poolAddress = guessPoolFromIx(tx) ?? 'unknown';
    const maker = legs.feePayer ?? 'Unknown'; // Use fee payer from legs

    return {
        timestamp: (tx.blockTime ?? Math.floor(Date.now() / 1000)) * 1000,
        slot: Number(tx.slot),
        type: legs.side, // BUY or SELL
        change: legs.target.deltaUI, // signed token delta (UI)
        mintAddress: legs.target.mint,
        poolAddress,
        tokenAmount: Math.abs(legs.target.deltaUI),
        baseAmount: Math.abs(legs.counter.deltaUI), // the counter leg amount (UI)
        volumeUsd,
        maker,
        signature,
        price: priceInCounter,
        priceUsd,
        counterMint: legs.counter.mint, // NEW: track what we're trading against
    };
}

// Export helper functions for testing
export { keyToBase58, buildCombinedKeys, getSignerSet, resolveKeyByIndex };

