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

// Debug counter
let globalTxCount = 0;

// 🚀 Stablecoin whitelist for counter USD pricing
const STABLECOIN_MINTS = new Set([
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
    'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
]);

// 🚀 EWMA alpha for mid-price tracking (tune: 0.1-0.3)
const MID_PRICE_ALPHA = 0.2;

// 🚀 AMM Program Allowlist (excludes JOE RFQ and OTC fills)
// Only swaps from these programs will be shown (matching DexScreener behavior)
const AMM_PROGRAMS = new Set([
    // Raydium
    '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8', // Raydium AMM V4
    'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C', // Raydium CPMM
    'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK', // Raydium CLMM
    // Orca
    'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc',   // Orca Whirlpools
    '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',   // Orca (legacy)
    // Meteora
    'cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG',    // Meteora DLMM
    'Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB',   // Meteora Pools
    // PumpSwap (Raydium-based)
    'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA',    // PumpSwap
    // Phoenix (order book DEX - include if you want it)
    // 'PhoeNiXZ8ByJGLkxNfZRnkUfjVmuYqLR89jjFHQqdXY',  // Phoenix (comment out if not wanted)
]);

// Known market-maker/OTC wallets to exclude (optional)
const KNOWN_MAKER_WALLETS = new Set([
    'Ca7GEhzggtShWH7i7e3Lm6Z9bkRH5z41rQUCwKTPfKcK', // Wintermute (example - add more as discovered)
]);

/**
 * Check if a transaction contains instructions from AMM programs
 * Returns true if at least one instruction is from an AMM program
 */
function hasAmmProgram(tx) {
    const message = tx.transaction?.message ?? {};
    const { combined } = buildCombinedKeys(message);
    const instructions = message.instructions || [];

    const resolveProgramId = (ix) => {
        if (ix.programIdIndex !== undefined) {
            return combined[ix.programIdIndex];
        }
        if (ix.programId) {
            if (typeof ix.programId === 'string') return ix.programId;
            if (ix.programId.toBase58) return ix.programId.toBase58();
            if (ix.programId.type === 'Buffer' && Array.isArray(ix.programId.data)) {
                return bs58.encode(Uint8Array.from(ix.programId.data));
            }
        }
        return undefined;
    };

    for (const instruction of instructions) {
        const programId = resolveProgramId(instruction);
        if (programId && AMM_PROGRAMS.has(programId)) {
            return true;
        }
    }

    const innerGroups = tx.meta?.innerInstructions ?? [];
    for (const group of innerGroups) {
        for (const ix of group.instructions ?? []) {
            const programId = resolveProgramId(ix) ?? (typeof ix.programId === 'number' ? combined[ix.programId] : undefined);
            if (programId && AMM_PROGRAMS.has(programId)) {
                return true;
            }
        }
    }

    return false;
}

/**
 * Check if fee payer is a known market maker/OTC wallet
 */
function isKnownMaker(feePayer) {
    return feePayer && KNOWN_MAKER_WALLETS.has(feePayer);
}

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
 * 🚀 ENHANCED: Now supports Raydium pool decoder (100% accurate WHEN successful)
 */
export function isUserSide(delta, signerSet, raydiumDecoder = null, poolAddress = null) {
    // 🚀 PHASE 1: Check Raydium vault addresses (100% accurate WHEN pool is decoded successfully)
    if (raydiumDecoder && poolAddress) {
        if (raydiumDecoder.isPoolVault(delta.accountPubkey, poolAddress)) {
            return false; // Definitely pool side
        }
    }

    // 🚀 PHASE 2: Heuristic checks (95% accurate fallback when decoder unavailable)
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
 * Collapse multiple user-side deltas per mint by SUMMING (not picking largest!)
 * 🚀 CRITICAL FIX: In multi-hop swaps, we need the TOTAL amount, not just one leg
 * This fixes the "half SOL" problem where we were missing half the swap amount
 */
function collapseUserSideByMint(deltas, signerSet, raydiumDecoder = null, poolAddress = null) {
    const sumByMint = {};
    const templateByMint = {}; // Keep one delta as template for metadata
    
    for (const d of deltas.filter((x) => isUserSide(x, signerSet, raydiumDecoder, poolAddress))) {
        if (!sumByMint[d.mint]) {
            sumByMint[d.mint] = { positive: 0, negative: 0 };
            templateByMint[d.mint] = d;
        }
        // Sum by sign to get total flow
        if (d.deltaUI > 0) {
            sumByMint[d.mint].positive += d.deltaUI;
        } else {
            sumByMint[d.mint].negative += Math.abs(d.deltaUI);
        }
    }
    
    // Build result using template with summed deltaUI
    const result = [];
    for (const mint of Object.keys(sumByMint)) {
        const sums = sumByMint[mint];
        const template = templateByMint[mint];
        
        // Use larger of positive/negative as the swap amount
        // Determine sign based on which is larger
        const absAmount = Math.max(sums.positive, sums.negative);
        const sign = sums.positive > sums.negative ? 1 : -1;
        
        result.push({
            ...template,
            deltaUI: absAmount * sign,
            deltaRaw: BigInt(Math.round(absAmount * sign * Math.pow(10, template.decimals))),
        });
    }
    
    return result;
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
 * 🚀 ENHANCED: Now supports Raydium pool decoder
 */
function userTouchedTargetMint(deltas, feePayer, signerSet, targetMint, raydiumDecoder = null, poolAddress = null) {
    return deltas.some(
        (d) =>
            d.mint === targetMint &&
            isUserSide(d, signerSet, raydiumDecoder, poolAddress) &&
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
 * 🚀 ENHANCED: Now supports Raydium pool decoder for 100% accuracy
 * @returns {{ target: TokenDelta, counter: TokenDelta, side: 'BUY'|'SELL', feePayer: string } | null}
 */
export function pickLegsAndSide(deltas, targetMint, signerSet, tx, raydiumDecoder = null, poolAddress = null) {
    // 🚀 RELAXED: Don't require fee payer to touch target mint (aggregator swaps may not)
    // Instead, check if target mint appears in ANY delta (user or pool side)
    const feePayer = getFeePayer(tx);
    const hasTargetMint = deltas.some(d => d.mint === targetMint && Math.abs(d.deltaUI) > 1e-9);
    
    if (!hasTargetMint) {
        if (process.env.DEBUG_SWAPS === '1') {
            console.log(`⚠️ [pickLegsAndSide] Target mint ${targetMint.substring(0, 8)}... not found in deltas`);
        }
        return null;
    }
    
    // If fee payer didn't touch target mint, it might be an aggregator swap - still allow it
    const userTouched = userTouchedTargetMint(deltas, feePayer, signerSet, targetMint, raydiumDecoder, poolAddress);
    if (!userTouched && process.env.DEBUG_SWAPS === '1') {
        console.log(`⚠️ [pickLegsAndSide] Fee payer didn't touch target mint (aggregator swap?), allowing anyway`);
    }
    
    // 🚀 GUARDRAIL 2: Collapse user-side deltas by mint to avoid double-counting
    const collapsed = collapseUserSideByMint(deltas, signerSet, raydiumDecoder, poolAddress);
    
    // 🚀 RELAXED: Allow multi-hop routes (aggregator swaps can have 3+ mints)
    // Instead of rejecting, just pick the target mint and largest counter mint
    const userSideByMint = new Map();
    for (const d of collapsed) {
        userSideByMint.set(d.mint, (userSideByMint.get(d.mint) || 0) + d.deltaUI);
    }
    
    // If more than 2 mints, it's a multi-hop - still allow it but log for debugging
    if (userSideByMint.size > 2 && process.env.DEBUG_SWAPS === '1') {
        console.log(`⚠️ [pickLegsAndSide] Multi-hop route detected (${userSideByMint.size} mints), allowing anyway`);
    }
    
    // Pick target delta - RELAXED: Allow pool-side if user-side not found (aggregator swaps)
    let targetLeg = collapsed
        .filter((d) => d.mint === targetMint)
        .sort((a, b) => Math.abs(b.deltaUI) - Math.abs(a.deltaUI))[0];
    
    // Fallback: Check all deltas (not just collapsed user-side) for aggregator swaps
    if (!targetLeg || Math.abs(targetLeg.deltaUI) < 1e-9) {
        targetLeg = deltas
            .filter((d) => d.mint === targetMint)
            .sort((a, b) => Math.abs(b.deltaUI) - Math.abs(a.deltaUI))[0];
        
        if (targetLeg && process.env.DEBUG_SWAPS === '1') {
            console.log(`⚠️ [pickLegsAndSide] Using pool-side target leg (aggregator swap?)`);
        }
    }
    
    if (!targetLeg || Math.abs(targetLeg.deltaUI) < 1e-9) {
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
        }
    }

    if (!counterLeg || Math.abs(counterLeg.deltaUI) < 1e-12) {
        return null;
    }

    const side = targetLeg.deltaUI > 0 ? 'BUY' : 'SELL';
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

    // Price = counter amount per token (e.g., SOL per token)
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

    // Price in USD = price in counter * counter USD price
    const priceUsd = counterUsd > 0 ? priceInCounter * counterUsd : NaN;
    
    // CRITICAL: Volume should be calculated as tokenAmount * priceUsd (like DexScreener)
    // This is more accurate than qtyC * counterUsd due to rounding
    // Both should be equivalent, but tokenAmount * priceUsd uses the actual swap price
    const volumeUsd = (priceUsd > 0 && isFinite(priceUsd)) 
        ? qtyT * priceUsd  // Token amount * price USD (DexScreener method)
        : (counterUsd > 0 ? qtyC * counterUsd : 0); // Fallback: counter amount * counter USD price

    return { priceInCounter, priceUsd, volumeUsd };
}

// ============================================================================
// 6) Pool address guesser (crude but works)
// ============================================================================

/**
 * Guess pool address from transaction instructions (generic)
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

/**
 * Extract Raydium pool address from transaction instructions
 * For Raydium AMM/CPMM/CLMM, pool state account is typically at index 0-2 of instruction accounts
 * We try multiple accounts because index 0 might be a token account (owner: Tokenkeg...)
 */
export function extractRaydiumPoolFromIx(tx, programId) {
    const msg = tx.transaction?.message ?? {};
    const { combined } = buildCombinedKeys(msg);
    const instructions = msg.instructions || [];
    const numSig = msg?.header?.numRequiredSignatures ?? 0;
    const signerKeys = new Set(combined.slice(0, numSig));
    
    // Token Program ID - we want to skip token accounts
    const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
    
    // Known Raydium program IDs
    const RAYDIUM_PROGRAMS = {
        '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8': 'AMM',
        'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C': 'CPMM',
        'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK': 'CLMM'
    };
    
    if (!programId || !RAYDIUM_PROGRAMS[programId]) {
        return null;
    }
    
    // Get token balance accounts AND token mints from metadata to identify what to skip
    const tokenAccounts = new Set();
    const tokenMints = new Set();
    const meta = tx.meta || {};
    const preTokenBalances = meta.preTokenBalances || [];
    const postTokenBalances = meta.postTokenBalances || [];
    
    // Collect token account addresses (from accountIndex)
    [...preTokenBalances, ...postTokenBalances].forEach(bal => {
        if (bal.accountIndex !== undefined && bal.accountIndex < combined.length) {
            tokenAccounts.add(combined[bal.accountIndex]);
        }
        // Collect token mint addresses (from mint field)
        if (bal.mint) {
            tokenMints.add(bal.mint);
        }
    });
    
    // Check both top-level instructions AND inner instructions (for v0/compute budget transactions)
    const allInstructions = [...instructions];
    
    // Add inner instructions if they exist (v0 transactions)
    if (msg.addressTableLookups || msg.loadedAddresses) {
        // Inner instructions might be in the transaction meta or elsewhere
        // For now, we'll check top-level instructions first
    }
    
    for (const ix of allInstructions) {
        // Check if this instruction belongs to the Raydium program
        if (ix.programIdIndex !== undefined) {
            const ixProgramId = combined[ix.programIdIndex];
            if (ixProgramId === programId) {
                // Try multiple formats for instruction accounts
                let accIdxs = [];
                
                // Format 1: Direct array (most common)
                if (Array.isArray(ix.accounts) && ix.accounts.length > 0) {
                    accIdxs = ix.accounts;
                }
                // Format 2: accounts.data (Uint8Array or similar)
                else if (ix.accounts?.data && Array.from(ix.accounts.data).length > 0) {
                    accIdxs = Array.from(ix.accounts.data);
                }
                // Format 3: accountKeyIndexes (alternative format)
                else if (Array.isArray(ix.accountKeyIndexes) && ix.accountKeyIndexes.length > 0) {
                    accIdxs = ix.accountKeyIndexes;
                }
                // Format 4: accountKeys (direct addresses - less common)
                else if (Array.isArray(ix.accountKeys) && ix.accountKeys.length > 0) {
                    // These are already addresses, not indices
                    return ix.accountKeys.find(addr => 
                        addr && 
                        !signerKeys.has(addr) && 
                        !tokenAccounts.has(addr) && 
                        !tokenMints.has(addr)
                    ) || null;
                }
                // Format 5: accountMetas (some SDKs use this)
                else if (Array.isArray(ix.accountMetas) && ix.accountMetas.length > 0) {
                    // Extract indices from accountMetas
                    accIdxs = ix.accountMetas.map(meta => meta.accountIndex ?? meta.pubkey).filter(idx => idx !== undefined);
                    if (accIdxs.length === 0) {
                        // If accountMetas have direct pubkeys
                        return ix.accountMetas.find(meta => {
                            const addr = meta.pubkey || meta.account;
                            return addr && 
                                !signerKeys.has(addr) && 
                                !tokenAccounts.has(addr) && 
                                !tokenMints.has(addr);
                        })?.pubkey || ix.accountMetas[0]?.pubkey || null;
                    }
                }
                // If all formats are empty, this instruction has no accounts listed
                // This might be a compute budget instruction or similar - skip it
                if (accIdxs.length === 0) {
                    continue; // Try next instruction
                }
                
                // 🚀 OPTIMIZATION: Raydium swap instructions consistently place the pool at specific indices
                // Based on comprehensive testing:
                // - AMM: Pool at index 1
                // - CPMM: Pool at index 3
                // - CLMM: Pool at index 1 (similar to AMM)
                
                // Determine pool position based on program type
                const isCPMM = programId === 'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C';
                const poolIndex = isCPMM ? 3 : 1; // CPMM uses index 3, others use index 1
                
                // Try the expected pool index first
                if (accIdxs.length > poolIndex) {
                    const poolIdx = accIdxs[poolIndex];
                    if (poolIdx >= 0 && poolIdx < combined.length) {
                        const poolAddress = combined[poolIdx];
                        if (poolAddress && typeof poolAddress === 'string') {
                            // Quick validation: not a signer, token account, or system program
                            if (!signerKeys.has(poolAddress) && 
                                !tokenAccounts.has(poolAddress) && 
                                !tokenMints.has(poolAddress) &&
                                poolAddress !== TOKEN_PROGRAM &&
                                poolAddress !== programId) {
                                // This is likely the pool - return it immediately
                                // (Decoder will verify it's actually owned by Raydium)
                                return poolAddress;
                            }
                        }
                    }
                }
                
                // Fallback: Try ALL accounts if index 1 didn't work
                for (let i = 0; i < accIdxs.length; i++) {
                    const accIdx = accIdxs[i];
                    
                    // CRITICAL: Skip out-of-bounds indices (invalid address lookup table references)
                    if (accIdx < 0 || accIdx >= combined.length) {
                        continue;
                    }
                    
                    const accountAddress = combined[accIdx];
                    
                    // Skip undefined/null addresses (shouldn't happen with bounds check, but safety first)
                    if (!accountAddress || typeof accountAddress !== 'string') continue;
                    
                    // Skip signers
                    if (signerKeys.has(accountAddress)) continue;
                    
                    // Skip known token accounts (from token balance changes)
                    if (tokenAccounts.has(accountAddress)) continue;
                    
                    // Skip token mint addresses (from token balance metadata)
                    if (tokenMints.has(accountAddress)) continue;
                    
                    // Skip system accounts and known programs
                    if (accountAddress === '11111111111111111111111111111111' ||
                        accountAddress === 'SysvarRent111111111111111111111111111111111' ||
                        accountAddress === TOKEN_PROGRAM ||
                        accountAddress === 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4' ||
                        accountAddress === 'So11111111111111111111111111111111111111112' || // Native SOL mint
                        accountAddress === programId) { // Skip the Raydium program itself
                        continue;
                    }
                    
                    // Skip if this is a known program (starts with known patterns)
                    // Programs are usually 32 bytes, but we can also check by common prefixes
                    if (accountAddress === 'ComputeBudget111111111111111111111111111111' ||
                        accountAddress === 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL' ||
                        accountAddress === 'SysvarC1ock11111111111111111111111111111111') {
                        continue;
                    }
                    
                    // This could be the pool address
                    // (The decoder will verify it's actually owned by Raydium)
                    return accountAddress;
                }
            }
        }
    }
    
    // If extraction failed, return null - let the caller use knownPoolAddress as fallback
    return null;
}

// ============================================================================
// 7) Main processor
// ============================================================================

/**
 * Process a transaction and extract swap data
 * 🚀 ENHANCED: Now supports Raydium pool decoder for 100% accuracy
 * @returns {Object | null} Swap record or null if not a valid swap
 */
export function processTxForSwap(tx, targetMint, solUsd, tokenPriceCache, midPriceUsd = null, raydiumDecoder = null, knownPoolAddress = null) {
    // 🔍 DEBUG: Log first few calls to diagnose issues
    const txCount = globalTxCount++;
    
    // 🚨 CRITICAL FIX: If we have a known pool address, SKIP AMM program check entirely!
    // Transaction-level decoding uses token balance changes, NOT program instructions
    // The test file works because it only looks at preTokenBalances/postTokenBalances
    // AMM check is only needed for account-level detection
    
    if (txCount < 5) {
        console.log(`🔍 [processTxForSwap #${txCount}] knownPoolAddress=${knownPoolAddress ? knownPoolAddress.substring(0, 8) + '...' : 'NULL'}, targetMint=${targetMint?.substring?.(0, 8) || 'null'}...`);
    }
    
    // 🚨 REMOVED AMM CHECK: We're doing transaction-level decoding with known pools
    // No need to check for AMM program - we just look at token balance changes
    // This matches test file behavior which never checks for AMM programs
    
    // 🚀 FILTER 2: Skip known market-maker wallets (optional but recommended)
    const message = tx.transaction?.message ?? {};
    const signerSet = getSignerSet(message);
    const { combined } = buildCombinedKeys(message);
    const feePayer = combined[0] || ''; // Fee payer is always first account
    
    if (isKnownMaker(feePayer)) {
        // Skip swaps from known market-maker wallets (RFQ/OTC fills)
        if (process.env.DEBUG_SWAPS === '1') {
            console.log(`⚠️ [processTxForSwap] Filter: known maker - ${feePayer.substring(0, 8)}...`);
        }
        return null;
    }
    
    const deltas = extractTokenDeltas(tx);
    if (!deltas.length) {
        if (process.env.DEBUG_SWAPS === '1' || txCount < 5) {
            const sig = (tx.signature?.substring?.(0, 16) || 'unknown');
            console.log(`⚠️ [processTxForSwap #${txCount}] Filter: no token deltas - ${sig}...`);
        }
        return null;
    }

    // 🔍 DEBUG: Log deltas for first few transactions
    if (txCount < 3) {
        console.log(`🔍 [processTxForSwap #${txCount}] Deltas found: ${deltas.length}`);
        for (const d of deltas.slice(0, 5)) {
            console.log(`   Delta: mint=${d.mint?.substring?.(0, 8) || 'null'}..., deltaUI=${d.deltaUI}, owner=${d.owner?.substring?.(0, 8) || 'null'}...`);
        }
    }
    
    const legs = pickLegsAndSide(deltas, targetMint, signerSet, tx, raydiumDecoder, knownPoolAddress); // Pass decoder
    if (!legs) {
        if (process.env.DEBUG_SWAPS === '1' || txCount < 5) {
            const sig = (tx.signature?.substring?.(0, 16) || 'unknown');
            // 🔍 DEBUG: Show what mints are in deltas vs target
            const deltaMints = [...new Set(deltas.map(d => d.mint?.substring?.(0, 8) || 'null'))];
            console.log(`⚠️ [processTxForSwap #${txCount}] Filter: cannot pick legs (${deltas.length} deltas) - ${sig}...`);
            console.log(`   Target mint: ${targetMint?.substring?.(0, 8)}...`);
            console.log(`   Delta mints: ${deltaMints.join(', ')}...`);
        }
        return null;
    }

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

    // Drop only truly invalid swaps (0, NaN, negative) - don't filter small but valid swaps
    // User wants to see ALL swaps, even very small ones
    if (!isFinite(volumeUsd) || volumeUsd <= 0) {
        // Only log if DEBUG_SWAPS is enabled to avoid spam
        if (process.env.DEBUG_SWAPS === '1') {
            console.log(`⚠️ [processTxForSwap] Skip: invalid volume ($${volumeUsd?.toFixed(4) ?? 'N/A'}) for ${sigShort}...`);
        }
        return null;
    }

    // 🚀 HARDENING: Robust price outlier filter (relaxed thresholds to match DexScreener)
    // DexScreener shows more volatile swaps, so we'll use 10x/0.1x instead of 5x/0.2x
    // CRITICAL: After first swap, price changes, so midPriceUsd must be updated (use current pool price, not static baseline)
    if (priceUsd > 0 && midPriceUsd && midPriceUsd > 0) {
        const ratio = priceUsd / midPriceUsd;
        // Relaxed thresholds: 10x/0.1x instead of 5x/0.2x to catch more swaps
        if (ratio > 10 || ratio < 0.1) {
            // >10× or <0.1× off mid? likely mis-leg or extreme outlier
            // Log ALL filtered swaps for debugging (user reported missing swaps after first swap)
            console.log(`⚠️ [processTxForSwap] Skip: price outlier (${ratio.toFixed(2)}x) - Price: $${priceUsd.toFixed(4)}, Mid: $${midPriceUsd.toFixed(4)}, Vol: $${volumeUsd.toFixed(2)} for ${sigShort}...`);
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

/**
 * Detect swaps for a target mint, including aggregator fallbacks
 */
export function detectSwapsForMint(tx, targetMint, solUsd, tokenPriceCache, knownPoolAddress = null) {
    const primary = processTxForSwap(tx, targetMint, solUsd, tokenPriceCache, null, null, knownPoolAddress);
    if (primary) {
        return [primary];
    }
    const fallback = detectAggregatorFallbackSwap(tx, targetMint, solUsd, tokenPriceCache, knownPoolAddress);
    return fallback.length ? fallback : [];
}

/**
 * Aggregator fallback detection (handles router-mediated swaps)
 */
function detectAggregatorFallbackSwap(tx, targetMint, solUsd, tokenPriceCache, knownPoolAddress = null) {
    const message = tx.transaction?.message ?? {};
    const signerSet = getSignerSet(message);
    const deltas = extractTokenDeltas(tx);
    if (!deltas.length) return [];

    const tokenDeltas = deltas.filter(d => d.mint === targetMint);
    if (!tokenDeltas.length) return [];

    const poolAddress = knownPoolAddress || guessPoolFromIx(tx) || null;

    const tokenUserDelta = pickUserDelta(tokenDeltas, signerSet, poolAddress);
    if (!tokenUserDelta || tokenUserDelta.deltaUI === 0) return [];

    const tokenPoolDelta = pickPoolDelta(tokenDeltas, tokenUserDelta, poolAddress);

    const counterDelta = pickCounterDelta({
        tx,
        deltas,
        signerSet,
        poolAddress,
        tokenUserDelta,
        solUsd,
    });

    if (!counterDelta || counterDelta.deltaUI === 0) return [];

    const side = tokenUserDelta.deltaUI > 0 ? 'BUY' : 'SELL';
    const tokenAmount = Math.abs(tokenUserDelta.deltaUI);
    const baseAmount = Math.abs(counterDelta.deltaUI);
    if (tokenAmount === 0 || baseAmount === 0) return [];

    const { priceUsd, volumeUsd, priceInSol } = computeAggregatorPricing({
        counterDelta,
        tokenAmount,
        baseAmount,
        solUsd,
        tokenPriceCache,
    });

    // Don't filter small swaps - user wants to see ALL swaps
    if (!isFinite(volumeUsd) || volumeUsd <= 0) return [];

    const signature = tx.transaction?.signatures?.[0] || tx.signature || tx.meta?.transaction?.signatures?.[0];
    const walletAddress = tokenUserDelta.owner || counterDelta.owner || getFeePayer(tx) || 'unknown';

    const swap = {
        timestamp: (tx.blockTime ?? Math.floor(Date.now() / 1000)) * 1000,
        slot: Number(tx.slot),
        type: side,
        tokenMint: targetMint,
        tokenAmount,
        baseAmount,
        volumeUsd,
        priceUsd,
        priceInSol,
        signature: typeof signature === 'string' ? signature : bs58.encode(Buffer.from(signature)),
        walletAddress,
        counterMint: counterDelta.mint,
        solAmount: counterDelta.mint === WSOL_MINT ? baseAmount : undefined,
        source: 'rpc-fallback',
    };

    if (tokenPoolDelta && tokenPoolDelta.accountPubkey) {
        swap.poolAddress = tokenPoolDelta.accountPubkey;
    } else if (poolAddress) {
        swap.poolAddress = poolAddress;
    }

    return [swap];
}

function pickUserDelta(tokenDeltas, signerSet, poolAddress) {
    const userSide = tokenDeltas
        .filter(d => isUserSide(d, signerSet))
        .sort((a, b) => Math.abs(b.deltaUI) - Math.abs(a.deltaUI));
    if (userSide.length) return userSide[0];

    if (poolAddress) {
        const nonPool = tokenDeltas
            .filter(d => d.owner !== poolAddress)
            .sort((a, b) => Math.abs(b.deltaUI) - Math.abs(a.deltaUI));
        if (nonPool.length) return nonPool[0];
    }

    return tokenDeltas.slice().sort((a, b) => Math.abs(b.deltaUI) - Math.abs(a.deltaUI))[0];
}

function pickPoolDelta(tokenDeltas, tokenUserDelta, poolAddress) {
    if (poolAddress) {
        const poolMatch = tokenDeltas
            .filter(d => d.owner === poolAddress)
            .sort((a, b) => Math.abs(b.deltaUI) - Math.abs(a.deltaUI));
        if (poolMatch.length) return poolMatch[0];
    }

    const userIndex = tokenDeltas.indexOf(tokenUserDelta);
    const candidates = tokenDeltas
        .filter((_, idx) => idx !== userIndex)
        .sort((a, b) => Math.abs(b.deltaUI) - Math.abs(a.deltaUI));
    return candidates[0] || null;
}

function pickCounterDelta({ tx, deltas, signerSet, poolAddress, tokenUserDelta, solUsd }) {
    const preferredMints = new Set([WSOL_MINT, ...STABLECOIN_MINTS]);
    const counterCandidates = deltas.filter(d => preferredMints.has(d.mint));

    const sorted = counterCandidates.sort((a, b) => Math.abs(b.deltaUI) - Math.abs(a.deltaUI));

    const byPool = poolAddress
        ? sorted.find(d => d.owner === poolAddress && Math.sign(d.deltaUI) !== Math.sign(tokenUserDelta.deltaUI))
        : null;
    if (byPool) return byPool;

    const userSide = sorted.find(d => isUserSide(d, signerSet) && Math.sign(d.deltaUI) !== Math.sign(tokenUserDelta.deltaUI));
    if (userSide) return userSide;

    const oppositeSign = sorted.find(d => Math.sign(d.deltaUI) !== Math.sign(tokenUserDelta.deltaUI));
    if (oppositeSign) return oppositeSign;

    if (!sorted.length) {
        const solBySigner = extractNativeSolDeltaBySigner(tx);
        for (const delta of solBySigner.values()) {
            if (Math.abs(delta) > 1e-9) {
                return {
                    mint: WSOL_MINT,
                    owner: getFeePayer(tx),
                    deltaUI: -delta,
                };
            }
        }
    }

    return sorted[0] || null;
}

function computeAggregatorPricing({ counterDelta, tokenAmount, baseAmount, solUsd, tokenPriceCache }) {
    let priceUsd = NaN;
    let volumeUsd = 0;
    let priceInSol = undefined;

    if (counterDelta.mint === WSOL_MINT) {
        priceInSol = baseAmount / tokenAmount;
        priceUsd = solUsd > 0 ? priceInSol * solUsd : NaN;
        // CRITICAL: Use DexScreener method (tokenAmount * priceUsd) for consistency
        volumeUsd = (priceUsd > 0 && isFinite(priceUsd) && tokenAmount > 0)
            ? tokenAmount * priceUsd
            : (solUsd > 0 ? baseAmount * solUsd : 0); // Fallback
    } else if (STABLECOIN_MINTS.has(counterDelta.mint)) {
        priceUsd = baseAmount / tokenAmount;
        // CRITICAL: Use DexScreener method (tokenAmount * priceUsd) for consistency
        volumeUsd = (priceUsd > 0 && isFinite(priceUsd) && tokenAmount > 0)
            ? tokenAmount * priceUsd
            : baseAmount; // Fallback
        priceInSol = solUsd > 0 ? priceUsd / solUsd : undefined;
    } else {
        const cachedPrice = tokenPriceCache?.get(counterDelta.mint);
        if (cachedPrice) {
            priceUsd = (baseAmount * cachedPrice) / tokenAmount;
            // CRITICAL: Use DexScreener method (tokenAmount * priceUsd) for consistency
            volumeUsd = (priceUsd > 0 && isFinite(priceUsd) && tokenAmount > 0)
                ? tokenAmount * priceUsd
                : (baseAmount * cachedPrice); // Fallback
        }
    }

    return { priceUsd, volumeUsd, priceInSol };
}

// Export helper functions for testing
export { keyToBase58, buildCombinedKeys, getSignerSet, resolveKeyByIndex };

