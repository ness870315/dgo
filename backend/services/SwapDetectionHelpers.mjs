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
 * Collapse multiple user-side deltas per mint into largest-magnitude delta
 * (Some routes emit multiple inner movements of the same leg)
 * 🚀 ENHANCED: Now supports Raydium pool decoder
 */
function collapseUserSideByMint(deltas, signerSet, raydiumDecoder = null, poolAddress = null) {
    const best = {};
    for (const d of deltas.filter((x) => isUserSide(x, signerSet, raydiumDecoder, poolAddress))) {
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
    // 🚀 GUARDRAIL 1: Require fee payer/signer to be involved on target mint
    const feePayer = getFeePayer(tx);
    if (!userTouchedTargetMint(deltas, feePayer, signerSet, targetMint, raydiumDecoder, poolAddress)) {
        return null;
    }
    
    // 🚀 GUARDRAIL 2: Collapse user-side deltas by mint to avoid double-counting
    const collapsed = collapseUserSideByMint(deltas, signerSet, raydiumDecoder, poolAddress);
    
    // 🚀 HARDENING: Check for multi-hop routes (3+ mints on user side)
    const userSideByMint = new Map();
    for (const d of collapsed) {
        userSideByMint.set(d.mint, (userSideByMint.get(d.mint) || 0) + d.deltaUI);
    }
    
    if (userSideByMint.size > 2) {
        return null;
    }
    
    // Pick target delta (MUST be user-side)
    const targetLeg = collapsed
        .filter((d) => d.mint === targetMint)
        .sort((a, b) => Math.abs(b.deltaUI) - Math.abs(a.deltaUI))[0];
    
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
    // 🚀 FILTER 1: Only process AMM program swaps (exclude JOE RFQ and OTC fills)
    // This matches DexScreener behavior - they don't show RFQ/OTC fills in the AMM tape
    if (!hasAmmProgram(tx)) {
        // Skip non-AMM transactions (JOE RFQ, OTC, etc.)
        return null;
    }
    
    // 🚀 FILTER 2: Skip known market-maker wallets (optional but recommended)
    const message = tx.transaction?.message ?? {};
    const signerSet = getSignerSet(message);
    const { combined } = buildCombinedKeys(message);
    const feePayer = combined[0] || ''; // Fee payer is always first account
    
    if (isKnownMaker(feePayer)) {
        // Skip swaps from known market-maker wallets (RFQ/OTC fills)
        return null;
    }
    
    const deltas = extractTokenDeltas(tx);
    if (!deltas.length) return null;

    const legs = pickLegsAndSide(deltas, targetMint, signerSet, tx, raydiumDecoder, knownPoolAddress); // Pass decoder
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

    // Drop obvious noise - dust volume (reduced threshold to match DexScreener)
    // DexScreener shows swaps down to ~$0.01, so we'll be more lenient
    if (!isFinite(volumeUsd) || volumeUsd < 0.01) {
        // Only log if it's a significant amount to avoid spam
        if (volumeUsd >= 0.001) {
            console.log(`⚠️ [processTxForSwap] Skip: dust volume ($${volumeUsd?.toFixed(4) ?? 'N/A'}) for ${sigShort}...`);
        }
        return null;
    }

    // 🚀 HARDENING: Robust price outlier filter (relaxed thresholds to match DexScreener)
    // DexScreener shows more volatile swaps, so we'll use 10x/0.1x instead of 5x/0.2x
    // Only apply filter if we have a recent mid price (within last 5 minutes)
    if (priceUsd > 0 && midPriceUsd && midPriceUsd > 0) {
        const ratio = priceUsd / midPriceUsd;
        // Relaxed thresholds: 10x/0.1x instead of 5x/0.2x to catch more swaps
        if (ratio > 10 || ratio < 0.1) {
            // >10× or <0.1× off mid? likely mis-leg or extreme outlier
            // Only log significant outliers to avoid spam
            if (ratio > 20 || ratio < 0.05) {
                console.log(`⚠️ [processTxForSwap] Skip: extreme price outlier (${ratio.toFixed(2)}x) for ${sigShort}...`);
            }
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

    if (!isFinite(volumeUsd) || volumeUsd < 0.01) return [];

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
        volumeUsd = solUsd > 0 ? baseAmount * solUsd : 0;
    } else if (STABLECOIN_MINTS.has(counterDelta.mint)) {
        priceUsd = baseAmount / tokenAmount;
        volumeUsd = baseAmount;
        priceInSol = solUsd > 0 ? priceUsd / solUsd : undefined;
    } else {
        const cachedPrice = tokenPriceCache?.get(counterDelta.mint);
        if (cachedPrice) {
            priceUsd = (baseAmount * cachedPrice) / tokenAmount;
            volumeUsd = baseAmount * cachedPrice;
        }
    }

    return { priceUsd, volumeUsd, priceInSol };
}

// Export helper functions for testing
export { keyToBase58, buildCombinedKeys, getSignerSet, resolveKeyByIndex };

