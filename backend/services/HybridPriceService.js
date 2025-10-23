import axios from 'axios';

const CONSTANT_K_RPC = 'https://rpc.constant-k.com/?api-key=tsn41k3y-4qch-46f2-5ogr-67dmw2zh1ur8';
const JUPITER_API_BASE = 'https://lite-api.jup.ag/tokens/v2';
const DEXSCREENER_API_BASE = 'https://api.dexscreener.com/latest/dex';
const WSOL = 'So11111111111111111111111111111111111111112';

// DEX Program IDs for pool detection
const DEX_PROGRAMS = {
    'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA': 'PumpSwap', // Raydium-based
    'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C': 'PumpSwap CPMM',
    'MeteoraDLPDK1jSd1J9x8rM6wT5p5q5q5q5q5q5q5q5q': 'Meteora',
    'OrcaEKTdK7LKz57vaAYr9QeNsVEPfiuwmQ9MUWfbx': 'Orca',
    'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK': 'Raydium CLMM',
    '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8': 'Raydium AMM'
};

class HybridPriceService {
    constructor() {
        this.priceCache = new Map();
        this.lastUpdate = new Map();
        this.updateInterval = 10000; // 10 seconds
        this.requestDelay = 1000; // 1 second delay between requests
        this.solPriceUSD = 0;
        this.lastSolPriceUpdate = 0;
        this.solPriceCacheDuration = 60000; // 1 minute
    }

    async getTokenPriceData(tokenAddress) {
        try {
            console.log(`🔍 [HybridPriceService] Fetching data for ${tokenAddress}`);
            
            // Check cache first
            const cached = this.priceCache.get(tokenAddress);
            const now = Date.now();
            
            if (cached && (now - this.lastUpdate.get(tokenAddress)) < this.updateInterval) {
                console.log(`✅ [HybridPriceService] Using cached data for ${tokenAddress}`);
                return cached;
            }

            // Fetch fresh data
            const priceData = await this.fetchFreshPriceData(tokenAddress);
            
            // Cache the result
            this.priceCache.set(tokenAddress, priceData);
            this.lastUpdate.set(tokenAddress, now);
            
            console.log(`✅ [HybridPriceService] Updated data for ${tokenAddress}:`, {
                price: priceData.priceUsd,
                marketCap: priceData.marketCap,
                liquidity: priceData.liquidity
            });
            
            return priceData;
            
        } catch (error) {
            console.error(`❌ [HybridPriceService] Error fetching data for ${tokenAddress}:`, error.message);
            
            // Return cached data if available
            const cached = this.priceCache.get(tokenAddress);
            if (cached) {
                console.log(`⚠️ [HybridPriceService] Returning cached data due to error`);
                return cached;
            }
            
            throw error;
        }
    }

    async fetchFreshPriceData(tokenAddress) {
        // Step 1: Get token info from Jupiter
        const tokenInfo = await this.fetchTokenInfo(tokenAddress);
        if (!tokenInfo) {
            throw new Error('Token not found in Jupiter API');
        }

        // Step 2: Get SOL price
        await this.updateSolPrice();

        // Step 3: Get pool data based on DEX type
        const poolData = await this.fetchPoolDataByDEX(tokenAddress, tokenInfo);
        
        // Step 4: Calculate price, market cap, and liquidity
        const priceData = this.calculatePriceData(tokenInfo, poolData);
        
        return priceData;
    }

    async fetchTokenInfo(tokenAddress) {
        try {
            console.log(`🪐 [Jupiter] Fetching token info for ${tokenAddress}`);
            
            const response = await axios.get(`${JUPITER_API_BASE}/search`, {
                params: { query: tokenAddress },
                timeout: 5000
            });

            if (response.data && response.data.length > 0) {
                const token = response.data[0];
                console.log(`✅ [Jupiter] Found token: ${token.name} (${token.symbol})`);
                return token;
            }
            
            return null;
        } catch (error) {
            console.error(`❌ [Jupiter] Error fetching token info:`, error.message);
            return null;
        }
    }

    async updateSolPrice() {
        const now = Date.now();
        
        if (this.solPriceUSD > 0 && (now - this.lastSolPriceUpdate) < this.solPriceCacheDuration) {
            return; // Use cached SOL price
        }

        try {
            console.log(`🪐 [CoinGecko] Fetching SOL price`);
            
            // Use CoinGecko public API (no auth required)
            const response = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
                params: {
                    ids: 'solana',
                    vs_currencies: 'usd'
                },
                timeout: 5000
            });

            if (response.data?.solana?.usd) {
                this.solPriceUSD = response.data.solana.usd;
                this.lastSolPriceUpdate = now;
                console.log(`✅ [CoinGecko] SOL price: $${this.solPriceUSD}`);
            } else {
                throw new Error('No SOL price in response');
            }
        } catch (error) {
            console.error(`❌ [CoinGecko] Error fetching SOL price:`, error.message);
            // Use fallback SOL price (approximate)
            this.solPriceUSD = 200;
            console.log(`⚠️ [Fallback] Using estimated SOL price: $${this.solPriceUSD}`);
        }
    }

    async fetchPoolDataByDEX(tokenAddress, tokenInfo) {
        // graduatedPool can be a string (pool address) or object with address property
        const poolAddress = (typeof tokenInfo.graduatedPool === 'string' ? tokenInfo.graduatedPool : tokenInfo.graduatedPool?.address) 
                         || tokenInfo.firstPool?.id;
        
        if (!poolAddress) {
            console.log(`⚠️ [Pool] No pool address found, using DexScreener fallback`);
            return await this.fetchDexScreenerData(tokenAddress);
        }

        try {
            console.log(`🔗 [Constant K] Fetching pool data for ${poolAddress}`);
            
            // Add delay to respect rate limits
            await new Promise(resolve => setTimeout(resolve, this.requestDelay));
            
            const response = await axios.post(CONSTANT_K_RPC, {
                jsonrpc: '2.0',
                id: 1,
                method: 'getAccountInfo',
                params: [poolAddress, { encoding: 'jsonParsed' }]
            });

            if (response.data?.result?.value) {
                const poolInfo = response.data.result.value;
                const dexType = this.detectDexType(poolInfo.owner);
                
                console.log(`✅ [Pool] Detected DEX type: ${dexType}`);
                
                if (dexType === 'PumpSwap' || dexType === 'Raydium AMM') {
                    return await this.fetchRaydiumData(poolAddress, tokenAddress);
                } else {
                    console.log(`⚠️ [Pool] Unsupported DEX type ${dexType}, using DexScreener fallback`);
                    return await this.fetchDexScreenerData(tokenAddress);
                }
            }
            
            return await this.fetchDexScreenerData(tokenAddress);
            
        } catch (error) {
            console.error(`❌ [Constant K] Error fetching pool data:`, error.message);
            return await this.fetchDexScreenerData(tokenAddress);
        }
    }

    detectDexType(owner) {
        return DEX_PROGRAMS[owner] || 'Unknown';
    }

    async fetchRaydiumData(poolAddress, tokenAddress) {
        try {
            console.log(`🔗 [Constant K] Fetching Raydium reserves for ${poolAddress}`);
            
            // Add delay to respect rate limits
            await new Promise(resolve => setTimeout(resolve, this.requestDelay));
            
            const response = await axios.post(CONSTANT_K_RPC, {
                jsonrpc: '2.0',
                id: 1,
                method: 'getTokenAccountsByOwner',
                params: [
                    poolAddress,
                    { programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' },
                    { encoding: 'jsonParsed' }
                ]
            });

            const tokenAccounts = response.data?.result?.value || [];
            
            if (tokenAccounts.length >= 2) {
                let tokenReserves = 0;
                let solReserves = 0;
                
                tokenAccounts.forEach(account => {
                    const mint = account.account.data.parsed.info.mint;
                    const amount = parseFloat(account.account.data.parsed.info.tokenAmount.uiAmount || 0);
                    
                    if (mint === tokenAddress) {
                        tokenReserves = amount;
                    } else if (mint === WSOL) {
                        solReserves = amount;
                    }
                });
                
                if (tokenReserves > 0 && solReserves > 0) {
                    const priceInSOL = solReserves / tokenReserves;
                    const priceInUSD = priceInSOL * this.solPriceUSD;
                    const liquidity = solReserves * this.solPriceUSD * 2; // Total liquidity
                    
                    console.log(`✅ [Raydium] Calculated price: $${priceInUSD.toFixed(8)}`);
                    
                    return {
                        priceInSOL,
                        priceInUSD,
                        tokenReserves,
                        solReserves,
                        liquidity,
                        source: 'Raydium (Constant K)'
                    };
                }
            }
            
            throw new Error('Could not extract reserves from Raydium pool');
            
        } catch (error) {
            console.error(`❌ [Raydium] Error fetching reserves:`, error.message);
            throw error;
        }
    }

    async fetchDexScreenerData(tokenAddress) {
        try {
            console.log(`📊 [DexScreener] Fetching data for ${tokenAddress}`);
            
            const response = await axios.get(`${DEXSCREENER_API_BASE}/search`, {
                params: { q: tokenAddress },
                timeout: 5000
            });

            if (response.data?.pairs && response.data.pairs.length > 0) {
                const pair = response.data.pairs[0]; // Get the first (usually most liquid) pair
                
                console.log(`✅ [DexScreener] Found pair: ${pair.baseToken.symbol}/${pair.quoteToken.symbol}`);
                
                return {
                    priceInUSD: parseFloat(pair.priceUsd || 0),
                    liquidity: parseFloat(pair.liquidity?.usd || 0),
                    volume24h: parseFloat(pair.volume?.h24 || 0),
                    priceChange24h: parseFloat(pair.priceChange?.h24 || 0),
                    source: 'DexScreener'
                };
            }
            
            throw new Error('No pairs found in DexScreener');
            
        } catch (error) {
            console.error(`❌ [DexScreener] Error fetching data:`, error.message);
            throw error;
        }
    }

    calculatePriceData(tokenInfo, poolData) {
        const priceUsd = poolData.priceInUSD || 0;
        const liquidity = poolData.liquidity || 0;
        const volume24h = poolData.volume24h || 0;
        const priceChange24h = poolData.priceChange24h || 0;
        
        // Calculate market cap
        const totalSupply = tokenInfo.supply || 0;
        const marketCap = priceUsd * totalSupply;
        
        return {
            tokenAddress: tokenInfo.address,
            name: tokenInfo.name,
            symbol: tokenInfo.symbol,
            priceUsd,
            marketCap,
            liquidity,
            volume24h,
            priceChange24h,
            totalSupply,
            source: poolData.source,
            timestamp: Date.now()
        };
    }

    // Get cached data without fetching
    getCachedData(tokenAddress) {
        return this.priceCache.get(tokenAddress);
    }

    // Clear cache for a specific token
    clearCache(tokenAddress) {
        this.priceCache.delete(tokenAddress);
        this.lastUpdate.delete(tokenAddress);
    }

    // Clear all cache
    clearAllCache() {
        this.priceCache.clear();
        this.lastUpdate.clear();
    }
}

export default HybridPriceService;