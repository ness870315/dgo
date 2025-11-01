/**
 * PoC: On-chain Token Filters using Constant K RPC
 * 
 * Implements:
 * 1. Mint/Freeze Authority Detection
 * 2. Liquidity Tracking from Pool Reserves
 * 3. Top Holder Concentration
 * 
 * These are computed directly from blockchain data, not Jupiter API
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { AccountLayout, MintLayout } from '@solana/spl-token';
import axios from 'axios';

// Constant K RPC with API key
const CONSTANT_K_RPC = 'https://rpc.constant-k.com/v1/39facrmt-om2u-4al5-5k4h-g8pls2y5vhui';

// Known stable/quote tokens
const QUOTE_TOKENS = {
    'So11111111111111111111111111111111111111112': { symbol: 'SOL', decimals: 9 },
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': { symbol: 'USDC', decimals: 6 },
    'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': { symbol: 'USDT', decimals: 6 },
};

const NULL_PUBKEY = '11111111111111111111111111111111';

class OnChainTokenFilter {
    constructor() {
        this.connection = new Connection(SOLANA_RPC, 'confirmed');
        console.log(`🔌 Connected to Solana RPC`);
    }

    /**
     * Check if mint/freeze authority is enabled (RED FLAG)
     */
    async checkAuthorities(mintAddress) {
        try {
            const mintPubkey = new PublicKey(mintAddress);
            const accountInfo = await this.connection.getAccountInfo(mintPubkey);
            
            if (!accountInfo) {
                return { error: 'Mint account not found' };
            }

            // Manual decode of SPL Token Mint (82 bytes)
            // Layout: mintAuthorityOption(4) + mintAuthority(32) + supply(8) + decimals(1) + isInitialized(1) + freezeAuthorityOption(4) + freezeAuthority(32)
            const data = accountInfo.data;
            
            // Read mint authority (option = 0 means None, 1 means Some)
            const mintAuthorityOption = data.readUInt32LE(0);
            const mintAuthorityBytes = data.slice(4, 36);
            const mintAuthority = mintAuthorityOption === 0 
                ? null 
                : new PublicKey(mintAuthorityBytes).toBase58();
            
            // Read supply and decimals
            const supply = data.readBigUInt64LE(36);
            const decimals = data.readUInt8(44);
            
            // Read freeze authority (starts at byte 46)
            const freezeAuthorityOption = data.readUInt32LE(46);
            const freezeAuthorityBytes = data.slice(50, 82);
            const freezeAuthority = freezeAuthorityOption === 0 
                ? null 
                : new PublicKey(freezeAuthorityBytes).toBase58();

            const mintAuthorityEnabled = mintAuthority && mintAuthority !== NULL_PUBKEY;
            const freezeAuthorityEnabled = freezeAuthority && freezeAuthority !== NULL_PUBKEY;

            return {
                mintAddress,
                decimals,
                supply: supply.toString(),
                mintAuthority: mintAuthority || 'DISABLED ✅',
                freezeAuthority: freezeAuthority || 'DISABLED ✅',
                mintAuthorityEnabled,
                freezeAuthorityEnabled,
                isRisky: mintAuthorityEnabled || freezeAuthorityEnabled,
                riskReason: mintAuthorityEnabled 
                    ? '🚨 Mint authority still enabled - can mint infinite tokens'
                    : freezeAuthorityEnabled 
                    ? '⚠️ Freeze authority still enabled - can freeze wallets'
                    : null
            };
        } catch (error) {
            console.error(`   ❌ Authority check failed: ${error.message}`);
            return { 
                error: error.message,
                isRisky: true,
                riskReason: '⚠️ Could not verify authorities'
            };
        }
    }

    /**
     * Get top token holders and compute concentration (RED FLAG if >20%)
     */
    async checkHolderConcentration(mintAddress) {
        try {
            const mintPubkey = new PublicKey(mintAddress);
            const largestAccounts = await this.connection.getTokenLargestAccounts(mintPubkey);
            
            if (!largestAccounts || !largestAccounts.value.length) {
                return { 
                    error: 'No holders found',
                    isRisky: true,
                    riskReason: '⚠️ Could not verify holder distribution'
                };
            }

            // Get mint supply for percentage calculation
            const mintInfo = await this.connection.getAccountInfo(mintPubkey);
            const data = mintInfo.data;
            const totalSupply = Number(data.readBigUInt64LE(36));

            const top10 = largestAccounts.value.slice(0, 10);
            const top10Sum = top10.reduce((sum, acc) => sum + Number(acc.amount), 0);
            const top10Percentage = (top10Sum / totalSupply) * 100;

            const top1Percentage = top10.length > 0 
                ? (Number(top10[0].amount) / totalSupply) * 100 
                : 0;

            return {
                mintAddress,
                totalHolders: largestAccounts.value.length,
                top1Percentage: top1Percentage.toFixed(2),
                top10Percentage: top10Percentage.toFixed(2),
                isRisky: top10Percentage > 20 || top1Percentage > 10,
                riskReason: top1Percentage > 10
                    ? `🚨 Top holder controls ${top1Percentage.toFixed(1)}% of supply`
                    : top10Percentage > 20
                    ? `⚠️ Top 10 holders control ${top10Percentage.toFixed(1)}% of supply`
                    : null
            };
        } catch (error) {
            console.error(`   ❌ Holder check failed: ${error.message}`);
            return { 
                error: error.message,
                isRisky: true,
                riskReason: '⚠️ Could not verify holder distribution'
            };
        }
    }

    /**
     * Estimate liquidity from Raydium pool (if exists)
     * This is a simplified version - full implementation would query all DEX pools
     */
    async checkLiquidity(mintAddress) {
        try {
            // For PoC, we'll use Raydium API to find pools
            // In production, you'd track pools from the gRPC stream
            const response = await axios.get(
                `https://api.raydium.io/v2/main/pairs`,
                { timeout: 5000 }
            );

            const pools = response.data.filter(pool => 
                pool.baseMint === mintAddress || pool.quoteMint === mintAddress
            );

            if (pools.length === 0) {
                return { 
                    error: 'No liquidity pools found',
                    isRisky: true,
                    riskReason: '🚨 No liquidity pools detected'
                };
            }

            // Find pool with highest liquidity
            const bestPool = pools.reduce((best, pool) => 
                (pool.liquidity || 0) > (best.liquidity || 0) ? pool : best
            );

            const liquidityUSD = bestPool.liquidity || 0;

            return {
                mintAddress,
                poolAddress: bestPool.ammId,
                liquidityUSD: liquidityUSD.toFixed(2),
                volume24h: bestPool.volume24h?.toFixed(2) || '0',
                isRisky: liquidityUSD < 10000,
                riskReason: liquidityUSD < 1000
                    ? `🚨 Extremely thin liquidity: $${liquidityUSD.toFixed(0)}`
                    : liquidityUSD < 10000
                    ? `⚠️ Low liquidity: $${liquidityUSD.toFixed(0)}`
                    : null
            };
        } catch (error) {
            return { 
                error: error.message,
                isRisky: true,
                riskReason: '⚠️ Could not verify liquidity'
            };
        }
    }

    /**
     * Combined risk assessment
     */
    async assessToken(mintAddress) {
        console.log(`\n${'='.repeat(80)}`);
        console.log(`🔍 Analyzing: ${mintAddress}`);
        console.log(`${'='.repeat(80)}`);

        const [authorities, holders, liquidity] = await Promise.all([
            this.checkAuthorities(mintAddress),
            this.checkHolderConcentration(mintAddress),
            this.checkLiquidity(mintAddress)
        ]);

        let riskScore = 0;
        const risks = [];

        // Authority check (25 points each)
        if (authorities.mintAuthorityEnabled) {
            riskScore += 25;
            risks.push(authorities.riskReason);
        }
        if (authorities.freezeAuthorityEnabled) {
            riskScore += 25;
            risks.push('⚠️ Freeze authority enabled');
        }

        // Holder concentration (20 points)
        if (holders.isRisky) {
            riskScore += 20;
            risks.push(holders.riskReason);
        }

        // Liquidity (30 points)
        if (liquidity.isRisky) {
            riskScore += 30;
            risks.push(liquidity.riskReason);
        }

        const verdict = riskScore >= 50 ? '🚫 HIGH RISK - AVOID' 
                      : riskScore >= 25 ? '⚠️ MEDIUM RISK - CAUTION'
                      : '✅ LOW RISK - SAFE';

        console.log(`\n📊 AUTHORITY CHECK:`);
        console.log(`   Mint Authority: ${authorities.mintAuthority}`);
        console.log(`   Freeze Authority: ${authorities.freezeAuthority}`);
        console.log(`   Decimals: ${authorities.decimals}`);

        console.log(`\n👥 HOLDER ANALYSIS:`);
        console.log(`   Top 1 Holder: ${holders.top1Percentage}%`);
        console.log(`   Top 10 Holders: ${holders.top10Percentage}%`);

        console.log(`\n💧 LIQUIDITY CHECK:`);
        if (liquidity.liquidityUSD) {
            console.log(`   Pool: ${liquidity.poolAddress?.substring(0, 8)}...`);
            console.log(`   Liquidity: $${liquidity.liquidityUSD}`);
            console.log(`   24h Volume: $${liquidity.volume24h}`);
        } else {
            console.log(`   ${liquidity.error || liquidity.riskReason}`);
        }

        console.log(`\n🎯 RISK ASSESSMENT:`);
        console.log(`   Risk Score: ${riskScore}/100`);
        console.log(`   Verdict: ${verdict}`);
        
        if (risks.length > 0) {
            console.log(`\n   🚨 Risk Factors:`);
            risks.forEach(risk => console.log(`      ${risk}`));
        }

        console.log(`${'='.repeat(80)}\n`);

        return {
            mintAddress,
            riskScore,
            verdict,
            risks,
            authorities,
            holders,
            liquidity
        };
    }
}

// Test with real tokens
async function main() {
    const filter = new OnChainTokenFilter();

    // Test tokens: mix of legit and scam
    const testTokens = [
        {
            name: 'TeslaAI (Known Scam)',
            address: 'EX8AQmPLGAKuJ1HGaDCu5ZwyPQK1xn8Y9REMN8soyvEs'
        },
        {
            name: 'Recent Top Activity #1',
            address: '44446vp6ycsvjc4G1fEREcnip3HSpQV498hMr6hWs65v'
        },
        {
            name: 'Recent Top Activity #2',
            address: 'BAZ2uNKcANstKoqSzzbMd89eDVhLRKdFdQAZsPdwUQ4Q'
        }
    ];

    console.log(`\n🔬 ON-CHAIN TOKEN FILTER TEST`);
    console.log(`   Testing ${testTokens.length} tokens with blockchain data\n`);

    const results = [];
    for (const token of testTokens) {
        console.log(`\n📍 ${token.name}`);
        const result = await filter.assessToken(token.address);
        results.push({ ...result, name: token.name });
    }

    // Summary
    console.log(`\n${'='.repeat(80)}`);
    console.log(`📋 SUMMARY`);
    console.log(`${'='.repeat(80)}`);
    
    const highRisk = results.filter(r => r.riskScore >= 50);
    const mediumRisk = results.filter(r => r.riskScore >= 25 && r.riskScore < 50);
    const lowRisk = results.filter(r => r.riskScore < 25);

    console.log(`\n🚫 HIGH RISK (${highRisk.length}):`);
    highRisk.forEach(r => console.log(`   - ${r.name} (${r.riskScore} points)`));

    console.log(`\n⚠️ MEDIUM RISK (${mediumRisk.length}):`);
    mediumRisk.forEach(r => console.log(`   - ${r.name} (${r.riskScore} points)`));

    console.log(`\n✅ LOW RISK (${lowRisk.length}):`);
    lowRisk.forEach(r => console.log(`   - ${r.name} (${r.riskScore} points)`));

    console.log(`\n${'='.repeat(80)}\n`);
}

main().catch(console.error);

