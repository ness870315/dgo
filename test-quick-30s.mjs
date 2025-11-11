import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const YellowstoneGrpc = require('@triton-one/yellowstone-grpc');
const Client = YellowstoneGrpc.default || YellowstoneGrpc;
const CommitmentLevel = YellowstoneGrpc.CommitmentLevel || YellowstoneGrpc.default?.CommitmentLevel;

import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";

const CONSTANT_K_GRPC_ENDPOINT = 'http://grpc.constant-k.com';
const CONSTANT_K_GRPC_TOKEN = '39facrmt-om2u-4al5-5k4h-g8pls2y5vhui';
const TARGET_MINT = 'DKAN3tyxnvgUrgGHAHsorBGgVGDVt9uEiRUybHrs77P3';
const TARGET_NAME = 'TARGET';

// Only subscribe to ACTUAL AMM programs (not aggregators)
const DEX_PROGRAMS = [
    'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C', // Raydium CPMM
    'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK', // Raydium CLMM
    '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8', // Raydium AMM v4
    'whirLbMiicVdio4qvUfM5KAg6bK6kGZ2zY3f5w5hJtS',   // Orca Whirlpool
    'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA',   // Pump AMM
    'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo',   // Meteora DLMM
    'Dooar9JkhdZ7J3LHN3A7YCuoGRUggXhQaG4kijfLGU2j'   // Meteora Pools
];

const WSOL = 'So11111111111111111111111111111111111111112';

const AMM_PIDS = new Set([
    'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C',
    'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK',
    '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',
    'whirLbMiicVdio4qvUfM5KAg6bK6kGZ2zY3f5w5hJtS',
    'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA',
    'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo',
    'Dooar9JkhdZ7J3LHN3A7YCuoGRUggXhQaG4kijfLGU2j'
]);

const stats = { totalTx: 0, totalSwaps: 0, targetSwaps: 0, buys: 0, sells: 0, uniqueMints: new Set() };

// Helper functions (same as before)
function resolveMetaKeyByIndex(message, idx) {
    const statics = (message.accountKeys ?? []).map(k => {
        if (typeof k === "string") return k;
        if (k?.pubkey) return k.pubkey;
        if (Buffer.isBuffer(k)) return new PublicKey(k).toBase58();
        return "";
    });
    return statics[idx] ?? "";
}

function resolveIxKeyByIndex(message, idx) {
    const statics = (message.accountKeys ?? []).map(k => {
        if (typeof k === "string") return k;
        if (k?.pubkey) return k.pubkey;
        if (Buffer.isBuffer(k)) return new PublicKey(k).toBase58();
        return "";
    });
    const loadedW = (message.loadedAddresses?.writable ?? []).map(k => {
        if (typeof k === "string") return k;
        if (Buffer.isBuffer(k)) return new PublicKey(k).toBase58();
        return String(k);
    });
    const loadedR = (message.loadedAddresses?.readonly ?? []).map(k => {
        if (typeof k === "string") return k;
        if (Buffer.isBuffer(k)) return new PublicKey(k).toBase58();
        return String(k);
    });
    const combined = [...statics, ...loadedW, ...loadedR];
    return combined[idx] ?? "";
}

function getSignerSet(message) {
    const statics = (message.accountKeys ?? []).map(k => {
        if (typeof k === "string") return k;
        if (k?.pubkey) return k.pubkey;
        if (Buffer.isBuffer(k)) return new PublicKey(k).toBase58();
        return "";
    });
    const n = message?.header?.numRequiredSignatures ?? 0;
    return new Set(statics.slice(0, n));
}

function isAtaOf(owner, mint, tokenAccount, tokenProgramId) {
    try {
        const ata = getAssociatedTokenAddressSync(new PublicKey(mint), new PublicKey(owner), false, tokenProgramId).toBase58();
        return ata === tokenAccount;
    } catch {
        return false;
    }
}

function isUserSideDelta(d, signerSet) {
    if (signerSet.has(d.owner)) return true;
    for (const s of signerSet) {
        if (isAtaOf(s, d.mint, d.accountPubkey, TOKEN_PROGRAM_ID)) return true;
        if (isAtaOf(s, d.mint, d.accountPubkey, TOKEN_2022_PROGRAM_ID)) return true;
    }
    return false;
}

function toDeltaUI(pre, post) {
    const decimals = Number(pre.uiTokenAmount?.decimals ?? 0);
    const preRaw = BigInt(pre.uiTokenAmount?.amount ?? "0");
    const postRaw = BigInt(post?.uiTokenAmount?.amount ?? "0");
    const dRaw = postRaw - preRaw;
    if (dRaw === 0n) return null;
    return Number(dRaw) / (10 ** decimals);
}

function ixAccountIdxs(ix) {
    // Handle different formats
    if (Array.isArray(ix.accounts)) return ix.accounts;
    if (ix.accounts?.data) return Array.from(ix.accounts.data);
    if (Buffer.isBuffer(ix.accounts)) return Array.from(ix.accounts);
    if (ix.accountKeyIndexes) return ix.accountKeyIndexes; // Alternative field name
    return [];
}

function deltasTouchedByIx(ix, deltas) {
    const set = new Set(ixAccountIdxs(ix));
    return deltas.filter(d => set.has(d.accountIndex));
}

function collapseByMintMaxAbs(legs) {
    const byMint = new Map();
    for (const d of legs) {
        const cur = byMint.get(d.mint);
        if (!cur || Math.abs(d.deltaUI) > Math.abs(cur.deltaUI)) byMint.set(d.mint, d);
    }
    return [...byMint.values()];
}

function pickLegsForIx(touched, signerSet) {
    const userSide = touched.filter(d => isUserSideDelta(d, signerSet));
    const legs = (userSide.length >= 2 ? userSide : touched);
    const uniq = collapseByMintMaxAbs(legs);
    const inputs = uniq.filter(d => d.deltaUI < 0).sort((a,b) => Math.abs(b.deltaUI) - Math.abs(a.deltaUI));
    const outputs = uniq.filter(d => d.deltaUI > 0).sort((a,b) => Math.abs(b.deltaUI) - Math.abs(a.deltaUI));
    if (!inputs.length || !outputs.length) return null;
    return { input: inputs[0], output: outputs[0] };
}

/**
 * GATE 1: Check if transaction has ANY token balance changes
 * This is a fast prefilter to skip txs with no swaps
 */
function hasAnyTokenDelta(meta) {
    const pre = meta?.preTokenBalances ?? [];
    const post = meta?.postTokenBalances ?? [];
    if (!pre.length || !post.length) return false;
    
    for (const pb of pre) {
        const qb = post.find(x => x.accountIndex === pb.accountIndex);
        if (!qb) continue;
        const a = BigInt(pb.uiTokenAmount?.amount ?? "0");
        const b = BigInt(qb.uiTokenAmount?.amount ?? "0");
        if (a !== b) return true;
    }
    return false;
}

/**
 * Helper: Convert any format to base58 string
 */
function bs58(x) {
    if (typeof x === "string") return x;
    if (x?.toBase58) return x.toBase58();
    if (Buffer.isBuffer(x)) return new PublicKey(x).toBase58();
    if (x?.pubkey) return bs58(x.pubkey);
    return String(x ?? "");
}

/**
 * Helper: Resolve program ID from instruction
 */
function resolveProgramId(ix, message) {
    if (ix.programId) return bs58(ix.programId);
    if (typeof ix.programIdIndex === "number") return resolveIxKeyByIndex(message, ix.programIdIndex);
    return "";
}

function parseTransaction(msg) {
    try {
        stats.totalTx++;
        
        if (!msg.transaction?.transaction) return null;
        const tx = msg.transaction.transaction;
        const message = tx.transaction?.message;
        if (!message) return null;

        const meta = tx.meta || msg.transaction.meta;
        if (!meta) return null;

        // ✅ GATE 1: Fast prefilter - skip txs with no token balance changes
        if (!hasAnyTokenDelta(meta)) {
            return null;
        }
        
        // Debug: Check if this tx has our target token
        const hasTarget = (meta.preTokenBalances || []).some(b => b.mint === TARGET_MINT) ||
                         (meta.postTokenBalances || []).some(b => b.mint === TARGET_MINT);
        if (hasTarget && stats.totalTx <= 100) {
            console.log(`\n🎯 [GATE1] TX with target token found! Slot: ${msg.transaction?.slot}`);
        }

        const preBalances = meta.preTokenBalances || [];
        const postBalances = meta.postTokenBalances || [];
        if (preBalances.length === 0) return null;

        const deltas = [];
        for (const pre of preBalances) {
            const post = postBalances.find(p => p.accountIndex === pre.accountIndex);
            if (!post) continue;
            const deltaUI = toDeltaUI(pre, post);
            if (deltaUI === null) continue;
            deltas.push({
                accountIndex: pre.accountIndex,
                accountPubkey: resolveMetaKeyByIndex(message, pre.accountIndex),
                mint: pre.mint,
                owner: pre.owner,
                deltaUI
            });
        }
        if (deltas.length < 2) return null;

        const signerSet = getSignerSet(message);
        const instrsTop = message.instructions ?? [];
        const innerGroups = (meta.innerInstructions ?? []).flatMap(g => g.instructions ?? []);
        const allIx = [...instrsTop, ...innerGroups];
        
        // ✅ GATE 2: When monitoring a specific token, process ALL instructions
        // Don't filter by AMM programs - Jupiter and other aggregators use different programs
        const ammIx = allIx; // Process all instructions when we're token-specific
        
        if (hasTarget && stats.totalTx <= 100) {
            console.log(`  [GATE2] Total ix: ${allIx.length}`);
        }

        // ✅ GATE 3: Process each AMM instruction
        let emitted = false;
        for (const ix of ammIx) {
            const touched = deltasTouchedByIx(ix, deltas);
            const nonZero = touched.filter(d => Math.abs(d.deltaUI) > 0.000001);
            if (nonZero.length < 2) continue;

            const userSide = nonZero.filter(d => isUserSideDelta(d, signerSet));
            const isUserSide = userSide.length >= 2;
            
            const picked = pickLegsForIx(nonZero, signerSet);
            if (!picked) continue;

            let { input, output } = picked;
            
            // CRITICAL: If we picked pool deltas (user-side count < 2), INVERT them!
            // Pool deltas are opposite of user deltas
            if (!isUserSide) {
                [input, output] = [output, input];
            }
            
            // Debug: Log deltas for target token
            if (input.mint === TARGET_MINT || output.mint === TARGET_MINT) {
                console.log(`\n🔍 [DEBUG] Target token in swap (${isUserSide ? 'USER' : 'POOL-INVERTED'}):`);
                console.log(`  Input (user paid): mint=${input.mint.slice(0,10)}..., delta=${input.deltaUI.toFixed(4)}`);
                console.log(`  Output (user received): mint=${output.mint.slice(0,10)}..., delta=${output.deltaUI.toFixed(4)}`);
            }
            const mints = [input.mint, output.mint].filter(m => m !== WSOL);
            
            for (const tokenMint of mints) {
                let side, tokenAmount, counterAmount;
                
                // CRITICAL: Determine BUY/SELL from USER perspective based on token delta direction
                // input = negative delta (decreased), output = positive delta (increased)
                //
                // If target token is OUTPUT (positive delta, user received it):
                //   - User's token balance INCREASED = BUY (user paid SOL, got token)
                // If target token is INPUT (negative delta, user paid it):
                //   - User's token balance DECREASED = SELL (user paid token, got SOL)
                
                if (tokenMint === output.mint) {
                    // Token balance increased = BUY
                    side = 'BUY';
                    tokenAmount = Math.abs(output.deltaUI);
                    counterAmount = Math.abs(input.deltaUI);
                } else if (tokenMint === input.mint) {
                    // Token balance decreased = SELL
                    side = 'SELL';
                    tokenAmount = Math.abs(input.deltaUI);
                    counterAmount = Math.abs(output.deltaUI);
                } else {
                    continue;
                }

                if (!tokenAmount || !counterAmount) continue;
                const isCounterSOL = (input.mint === WSOL || output.mint === WSOL);
                if (!isCounterSOL) continue;

                const priceInSol = counterAmount / tokenAmount;
                const volumeUsd = counterAmount * 240;
                
                // Lower threshold to $0.01 to catch more swaps
                if (!isFinite(volumeUsd) || volumeUsd < 0.01) continue;

                stats.totalSwaps++;
                stats.uniqueMints.add(tokenMint);
                emitted = true;
                
                // Debug: Log first 20 swaps to see what mints we're detecting
                if (stats.totalSwaps <= 20) {
                    const isTarget = tokenMint === TARGET_MINT ? '🎯 TARGET!' : '';
                    console.log(`  [${stats.totalSwaps}] ${side} ${tokenMint} ${isTarget}`);
                }
                
                if (tokenMint === TARGET_MINT) {
                    stats.targetSwaps++;
                    if (side === 'BUY') stats.buys++;
                    if (side === 'SELL') stats.sells++;
                    console.log(`\n🎯 ${TARGET_NAME} ${side}: ${tokenAmount.toFixed(2)} tokens for ${counterAmount.toFixed(4)} SOL (price: $${(priceInSol * 240).toFixed(6)}/token)\n`);
                }
            }
        }
        
        return emitted;
    } catch (error) {
        console.error('❌ Parse error:', error.message);
    }
}

async function main() {
    console.log('🚀 2-Minute Test - Per-Instruction BUY/SELL Detection');
    console.log(`🎯 Monitoring: ${TARGET_NAME} (${TARGET_MINT})\n`);
    
    try {
        const client = new Client(CONSTANT_K_GRPC_ENDPOINT, CONSTANT_K_GRPC_TOKEN);
        
        // CRITICAL FIX: Subscribe to transactions mentioning the TARGET TOKEN
        // This will catch ALL swaps including those through Jupiter aggregator
        const transactionFilters = {
            target: {
                accountInclude: [TARGET_MINT],  // Subscribe to our target token directly!
                accountExclude: [],
                accountRequired: [],
                vote: false,
                failed: false
            }
        };
        
        const stream = await client.subscribeOnce(
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

        console.log('✅ Stream connected with FULL options!\n');

        stream.on('data', (msg) => parseTransaction(msg));
        stream.on('error', (error) => console.error('❌ Stream error:', error.message));

        // Print stats every 30 seconds
        const statsInterval = setInterval(() => {
            console.log('\n' + '='.repeat(70));
            console.log(`⏱️  Stats Update`);
            console.log(`📦 Total Transactions: ${stats.totalTx.toLocaleString()}`);
            console.log(`💎 Total Swaps: ${stats.totalSwaps.toLocaleString()}`);
            console.log(`🎯 ${TARGET_NAME} Swaps: ${stats.targetSwaps} (${stats.buys} BUYs, ${stats.sells} SELLs)`);
            console.log('='.repeat(70));
        }, 30000);

        setTimeout(() => {
            clearInterval(statsInterval);
            console.log('\n' + '='.repeat(70));
            console.log('⏱️ 2 MINUTES ELAPSED - FINAL RESULTS');
            console.log('='.repeat(70));
            console.log(`📦 Total Transactions: ${stats.totalTx.toLocaleString()}`);
            console.log(`💎 Total Swaps Detected: ${stats.totalSwaps.toLocaleString()}`);
            console.log(`🪙 Unique Tokens: ${stats.uniqueMints.size}`);
            console.log(`🎯 ${TARGET_NAME} Swaps: ${stats.targetSwaps} (${stats.buys} BUYs, ${stats.sells} SELLs)`);
            console.log(`📊 Overall Swap Rate: ${(stats.totalSwaps / 120).toFixed(1)} swaps/sec`);
            console.log(`📊 ${TARGET_NAME} Rate: ${(stats.targetSwaps / 120).toFixed(2)} swaps/sec`);
            console.log(`📊 Transaction Rate: ${(stats.totalTx / 120).toFixed(1)} tx/sec`);
            console.log('='.repeat(70));
            
            if (stats.targetSwaps === 0) {
                console.log('\n⚠️  NO USELESS SWAPS DETECTED!');
                console.log(`Target mint: ${TARGET_MINT}`);
                console.log('This could mean:');
                console.log('  1. USELESS had no trading activity in the 2-minute window');
                console.log('  2. USELESS trades on a pool/DEX we are not monitoring');
                console.log('  3. The mint address is incorrect');
            }
            
            stream.cancel();
            process.exit(0);
        }, 120000);

    } catch (error) {
        console.error('❌ Fatal error:', error);
        process.exit(1);
    }
}

main();

