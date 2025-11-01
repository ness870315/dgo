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
// 4) Pick legs (target vs counter), decide BUY/SELL
// ============================================================================

/**
 * Pick target and counter legs, determine BUY/SELL
 * @returns {{ target: TokenDelta, counter: TokenDelta, side: 'BUY'|'SELL' } | null}
 */
export function pickLegsAndSide(deltas, targetMint, signerSet, tx) {
    // 🚀 PATCH 1: Hard requirement - both legs must be present
    
    // Pick target delta (prefer user-side)
    const targetLeg = deltas
        .filter((d) => d.mint === targetMint && isUserSide(d, signerSet))
        .sort((a, b) => Math.abs(b.deltaUI) - Math.abs(a.deltaUI))[0];
    
    if (!targetLeg || Math.abs(targetLeg.deltaUI) < 1e-9) {
        console.log(`⚠️ [pickLegsAndSide] Skip: no user target delta for ${targetMint.substring(0, 8)}...`);
        return null;
    }

    // Prefer user-side counters, else any
    let counterLeg = deltas
        .filter((d) => d.mint !== targetMint && isUserSide(d, signerSet))
        .sort((a, b) => Math.abs(b.deltaUI) - Math.abs(a.deltaUI))[0];

    if (!counterLeg) {
        // Fallback: use native SOL lamports delta for the signer (not wSOL)
        const solDeltaBySigner = extractNativeSolDeltaBySigner(tx);
        const signer = [...signerSet][0];
        const solDelta = solDeltaBySigner.get(signer) ?? 0;
        
        if (solDelta !== 0 && Math.abs(solDelta) > 1e-6) {
            console.log(`💰 [pickLegsAndSide] Using native SOL as counter: ${solDelta.toFixed(6)} SOL`);
            counterLeg = {
                accountIndex: -1,
                accountPubkey: signer,
                mint: WSOL_MINT, // treat as the SOL leg type
                owner: signer,
                decimals: 9,
                preRaw: 0n,
                postRaw: 0n,
                deltaRaw: BigInt(Math.round(solDelta * 1e9)),
                deltaUI: solDelta,
            };
        }
    }

    if (!counterLeg || Math.abs(counterLeg.deltaUI) < 1e-12) {
        console.log(`⚠️ [pickLegsAndSide] Skip: no counter leg for ${targetMint.substring(0, 8)}... (single-leg case - likely fees/airdrops/ATA init)`);
        return null;
    }

    const side = targetLeg.deltaUI > 0 ? 'BUY' : 'SELL';
    return { target: targetLeg, counter: counterLeg, side };
}

// ============================================================================
// 5) Price & volume (pair-agnostic, supports USDC or wSOL or anything)
// ============================================================================

/**
 * Compute price and volume from target/counter legs
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
    } else {
        counterUsd = getUsdForMint(counter.mint) ?? 1; // assume USDC if not found
    }

    const priceUsd = counterUsd ? priceInCounter * counterUsd : NaN;
    const volumeUsd = counterUsd ? qtyC * counterUsd : 0;

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

    // Price outlier filter (if we have a mid-price reference)
    if (priceUsd > 0 && midPriceUsd && midPriceUsd > 0) {
        const priceDeviation = Math.abs(priceUsd / midPriceUsd - 1);
        if (priceDeviation > 0.8) {
            // >80% off mid? likely mis-leg or outlier
            console.log(`⚠️ [processTxForSwap] Skip: price outlier (${priceDeviation.toFixed(2)}x deviation, price=$${priceUsd.toFixed(8)}, mid=$${midPriceUsd.toFixed(8)}) for ${sigShort}...`);
            return null;
        }
    }

    const poolAddress = guessPoolFromIx(tx) ?? 'unknown';
    const maker = [...signerSet][0] ?? 'Unknown';

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

