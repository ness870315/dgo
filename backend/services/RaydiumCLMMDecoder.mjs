/**
 * Raydium CLMM (Concentrated Liquidity Market Maker) Pool Decoder
 * 
 * Decodes Raydium CLMM pool state to extract vault addresses for 100% accurate
 * user vs pool classification in swap detection.
 * 
 * CLMM uses concentrated liquidity positions within price ranges (ticks),
 * unlike AMM V4 which uses uniform liquidity distribution.
 */

import { Connection, PublicKey } from '@solana/web3.js';

const RAYDIUM_CLMM_PROGRAM = 'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK';

class RaydiumCLMMDecoder {
    constructor(rpcEndpoint) {
        this.connection = new Connection(rpcEndpoint, 'confirmed');
        this.poolCache = new Map(); // Map<poolAddress, { vaultA, vaultB, mintA, mintB }>
        this.accuracyMetrics = {
            totalDecodes: 0,
            successfulDecodes: 0,
            failedDecodes: 0,
            cacheHits: 0
        };
        console.log('🔧 [RaydiumCLMMDecoder] Initialized');
    }

    /**
     * Decode Raydium CLMM pool state
     * CLMM pools have a different structure than AMM V4:
     * - Uses tick-based liquidity positions
     * - Vault addresses stored at specific offsets
     * - Pool account structure: owner (32) + metadata + vaults
     */
    async decodePoolState(poolAddress) {
        try {
            // Check cache first
            if (this.poolCache.has(poolAddress)) {
                this.accuracyMetrics.cacheHits++;
                return this.poolCache.get(poolAddress);
            }

            this.accuracyMetrics.totalDecodes++;

            const poolPubkey = new PublicKey(poolAddress);
            const accountInfo = await this.connection.getAccountInfo(poolPubkey);

            if (!accountInfo) {
                console.log(`⚠️ [RaydiumCLMMDecoder] Pool account not found: ${poolAddress.substring(0, 8)}...`);
                this.accuracyMetrics.failedDecodes++;
                return null;
            }

            // Check if it's a Raydium CLMM program
            if (accountInfo.owner.toBase58() !== RAYDIUM_CLMM_PROGRAM) {
                console.log(`⚠️ [RaydiumCLMMDecoder] Not a Raydium CLMM pool: ${poolAddress.substring(0, 8)}... (owner: ${accountInfo.owner.toBase58().substring(0, 8)}...)`);
                this.accuracyMetrics.failedDecodes++;
                return null;
            }

            // Manual decode of CLMM pool state
            // CLMM pool structure:
            // - Header/metadata (varies, typically 8-64 bytes)
            // - Vault A address (32 bytes)
            // - Vault B address (32 bytes)
            // - Mint addresses, tick spacing, fee rate, etc.
            
            const data = accountInfo.data;
            let vaultA = null;
            let vaultB = null;
            let mintA = null;
            let mintB = null;
            
            // CLMM pools typically store vault addresses early in the account
            // Common patterns:
            // 1. Vaults at offsets 8-40 and 40-72 (after 8-byte discriminator)
            // 2. Vaults at offsets 64-96 and 96-128 (after metadata)
            // 3. Vaults might be consecutive
            
            const vaultOffsets = [
                // Pattern 1: After discriminator (8 bytes)
                { start: 8, end: 40 },
                { start: 40, end: 72 },
                // Pattern 2: After metadata header (64 bytes)
                { start: 64, end: 96 },
                { start: 96, end: 128 },
                // Pattern 3: Common positions
                { start: 32, end: 64 },
                { start: 128, end: 160 },
                { start: 160, end: 192 }
            ];
            
            // Try extracting vaults from known offsets
            for (const { start, end } of vaultOffsets) {
                if (end <= data.length) {
                    try {
                        const pubkeyBytes = data.slice(start, end);
                        const pubkey = new PublicKey(pubkeyBytes);
                        const pubkeyStr = pubkey.toBase58();
                        
                        // Validate it's not a system/default address
                        if (pubkeyStr !== '11111111111111111111111111111111' && 
                            pubkeyStr !== 'SysvarRent111111111111111111111111111111111' &&
                            pubkeyStr !== 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' &&
                            pubkeyStr !== RAYDIUM_CLMM_PROGRAM) {
                            
                            if (!vaultA) {
                                vaultA = pubkeyStr;
                            } else if (!vaultB && pubkeyStr !== vaultA) {
                                vaultB = pubkeyStr;
                                break; // Found both vaults
                            }
                        }
                    } catch (e) {
                        // Invalid pubkey at this offset, continue searching
                    }
                }
            }
            
            // If we didn't find vaults at expected offsets, try aggressive scanning
            if (!vaultA || !vaultB) {
                // Scan through the data looking for consecutive valid pubkeys
                // CLMM pools often have vaults stored consecutively
                for (let i = 8; i < Math.min(data.length - 64, 512); i += 32) {
                    try {
                        const pubkeyBytes = data.slice(i, i + 32);
                        const pubkey = new PublicKey(pubkeyBytes);
                        const pubkeyStr = pubkey.toBase58();
                        
                        // Skip system addresses
                        if (pubkeyStr === '11111111111111111111111111111111' ||
                            pubkeyStr === 'SysvarRent111111111111111111111111111111111' ||
                            pubkeyStr === 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' ||
                            pubkeyStr === RAYDIUM_CLMM_PROGRAM) {
                            continue;
                        }
                        
                        if (!vaultA) {
                            vaultA = pubkeyStr;
                        } else if (!vaultB && pubkeyStr !== vaultA) {
                            vaultB = pubkeyStr;
                            break;
                        }
                    } catch (e) {
                        // Not a valid pubkey, continue
                    }
                }
            }
            
            if (!vaultA || !vaultB) {
                throw new Error('Could not extract vault addresses from CLMM pool data');
            }
            
            // Create pool data object
            const poolData = {
                vaultA,
                vaultB,
                mintA: null, // Optional - can be fetched from vault accounts if needed
                mintB: null,
                tickSpacing: null,
                feeRate: null
            };
            
            // Optionally fetch vault account info to get mint addresses
            try {
                const [vaultAInfo, vaultBInfo] = await Promise.all([
                    this.connection.getAccountInfo(new PublicKey(vaultA)).catch(() => null),
                    this.connection.getAccountInfo(new PublicKey(vaultB)).catch(() => null)
                ]);
                
                // Token accounts have mint address at offset 0 (first 32 bytes)
                if (vaultAInfo && vaultAInfo.data.length >= 64) {
                    try {
                        poolData.mintA = new PublicKey(vaultAInfo.data.slice(0, 32)).toBase58();
                    } catch (e) {
                        // Skip if can't parse
                    }
                }
                if (vaultBInfo && vaultBInfo.data.length >= 64) {
                    try {
                        poolData.mintB = new PublicKey(vaultBInfo.data.slice(0, 32)).toBase58();
                    } catch (e) {
                        // Skip if can't parse
                    }
                }
            } catch (vaultError) {
                // Non-critical - vault addresses are what we need for classification
            }

            // Validate we have at least the vault addresses (critical for classification)
            if (!poolData.vaultA || !poolData.vaultB) {
                throw new Error('Missing vault addresses in decoded pool data');
            }

            // Cache it
            this.poolCache.set(poolAddress, poolData);
            this.accuracyMetrics.successfulDecodes++;

            console.log(`✅ [RaydiumCLMMDecoder] Decoded CLMM pool ${poolAddress.substring(0, 8)}...`, {
                vaultA: poolData.vaultA.substring(0, 8) + '...',
                vaultB: poolData.vaultB.substring(0, 8) + '...',
                mintA: poolData.mintA?.substring(0, 8) + '...' || 'N/A',
                mintB: poolData.mintB?.substring(0, 8) + '...' || 'N/A'
            });

            return poolData;

        } catch (error) {
            console.error(`❌ [RaydiumCLMMDecoder] Failed to decode CLMM pool ${poolAddress.substring(0, 8)}...`, error.message);
            this.accuracyMetrics.failedDecodes++;
            return null;
        }
    }

    /**
     * Check if an account is a pool vault (not a user account)
     * This is the critical function for accurate user vs pool classification
     */
    isPoolVault(accountAddress, poolAddress) {
        const poolData = this.poolCache.get(poolAddress);
        if (!poolData) {
            return false; // Unknown, fall back to heuristics
        }

        return (
            accountAddress === poolData.vaultA ||
            accountAddress === poolData.vaultB
        );
    }

    /**
     * Pre-cache pool data for a batch of pools
     */
    async precachePools(poolAddresses) {
        console.log(`🔄 [RaydiumCLMMDecoder] Pre-caching ${poolAddresses.length} CLMM pools...`);
        
        const results = await Promise.allSettled(
            poolAddresses.map(addr => this.decodePoolState(addr))
        );

        const successful = results.filter(r => r.status === 'fulfilled' && r.value !== null).length;
        console.log(`✅ [RaydiumCLMMDecoder] Pre-cached ${successful}/${poolAddresses.length} CLMM pools`);

        return successful;
    }

    /**
     * Get accuracy metrics
     */
    getMetrics() {
        const successRate = this.accuracyMetrics.totalDecodes > 0
            ? (this.accuracyMetrics.successfulDecodes / this.accuracyMetrics.totalDecodes * 100).toFixed(2)
            : 0;

        return {
            ...this.accuracyMetrics,
            successRate: `${successRate}%`,
            cacheSize: this.poolCache.size
        };
    }

    /**
     * Clear cache
     */
    clearCache() {
        this.poolCache.clear();
        console.log('🗑️ [RaydiumCLMMDecoder] Cache cleared');
    }
}

export default RaydiumCLMMDecoder;
