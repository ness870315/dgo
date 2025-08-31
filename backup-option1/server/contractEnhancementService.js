import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ContractEnhancementService {
  constructor() {
    this.cache = new Map();
    this.rateLimitDelay = 3000; // 3 seconds between requests (reduced since no batch processing)
    this.isEnhancing = false;
    this.enhancementQueue = [];
    this.contractCacheFile = path.join(__dirname, 'contract-cache.json');
    this.persistentContractCache = new Map();
    
    // Load persistent contract cache on startup
    this.loadPersistentCache();
  }

  /**
   * Load persistent contract cache from file
   */
  loadPersistentCache() {
    try {
      if (fs.existsSync(this.contractCacheFile)) {
        const data = fs.readFileSync(this.contractCacheFile, 'utf8');
        const parsed = JSON.parse(data);
        
        // Convert array back to Map
        this.persistentContractCache = new Map(parsed.contracts || []);
        console.log(`📋 Loaded ${this.persistentContractCache.size} contract addresses from persistent cache`);
      } else {
        console.log('📋 No persistent contract cache found, starting fresh');
      }
    } catch (error) {
      console.error('❌ Error loading persistent contract cache:', error.message);
      this.persistentContractCache = new Map();
    }
  }

  /**
   * Save persistent contract cache to file
   */
  savePersistentCache() {
    try {
      const data = {
        contracts: Array.from(this.persistentContractCache.entries()),
        lastUpdate: new Date().toISOString(),
        totalContracts: this.persistentContractCache.size
      };
      
      fs.writeFileSync(this.contractCacheFile, JSON.stringify(data, null, 2));
      console.log(`💾 Saved ${this.persistentContractCache.size} contract addresses to persistent cache`);
    } catch (error) {
      console.error('❌ Error saving persistent contract cache:', error.message);
    }
  }

  /**
   * Get contract address from persistent cache
   */
  getFromPersistentCache(symbol) {
    const key = symbol.toUpperCase();
    return this.persistentContractCache.get(key);
  }

  /**
   * Store contract address in persistent cache
   */
  storeToPersistentCache(symbol, contractAddress, hasRealContract) {
    const key = symbol.toUpperCase();
    const data = {
      contractAddress,
      hasRealContract,
      cachedAt: Date.now(),
      symbol: key
    };
    
    this.persistentContractCache.set(key, data);
    this.savePersistentCache();
  }

  /**
   * Apply cached contracts to tokens without making API calls
   */
  applyCachedContractsToTokens(tokens) {
    let appliedCount = 0;
    
    const updatedTokens = tokens.map(token => {
      // Skip if already has real contract
      if (token.contractAddress && token.contractAddress.length > 20 && !token.contractAddress.includes('-')) {
        return token;
      }
      
      // Check persistent cache
      const cachedData = this.getFromPersistentCache(token.symbol);
      if (cachedData) {
        appliedCount++;
        console.log(`📋 Applied cached contract for ${token.symbol}: ${cachedData.contractAddress ? cachedData.contractAddress.substring(0, 8) + '...' : 'None'}`);
        return {
          ...token,
          contractAddress: cachedData.contractAddress,
          hasRealContract: cachedData.hasRealContract
        };
      }
      
      return token;
    });
    
    if (appliedCount > 0) {
      console.log(`✅ Applied ${appliedCount} cached contracts without API calls`);
    }
    
    return updatedTokens;
  }

  /**
   * Get detailed coin data including platforms/contract addresses
   */
  async getCoinDetails(coinId) {
    try {
      // Check cache first
      if (this.cache.has(coinId)) {
        const cached = this.cache.get(coinId);
        if (Date.now() - cached.timestamp < 24 * 60 * 60 * 1000) { // 24 hour cache
          return cached.data;
        }
      }

      console.log(`🔍 Fetching detailed data for ${coinId}...`);
      
      const response = await axios.get(
        `https://api.coingecko.com/api/v3/coins/${coinId}?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false&sparkline=false`,
        {
          timeout: 10000,
          headers: { 
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' 
          }
        }
      );

      const coinData = response.data;
      
      // Cache the result
      this.cache.set(coinId, {
        data: coinData,
        timestamp: Date.now()
      });

      return coinData;
    } catch (error) {
      if (error.response?.status === 429) {
        console.log(`⏳ Rate limited for ${coinId}, will retry later`);
        throw new Error('RATE_LIMITED');
      }
      console.error(`❌ Error fetching details for ${coinId}:`, error.message);
      return null;
    }
  }

  /**
   * Extract Solana contract address from coin data
   */
  extractSolanaContractAddress(coinData) {
    try {
      // Check if platforms field exists and has Solana data
      if (coinData.platforms && coinData.platforms.solana) {
        return coinData.platforms.solana;
      }
      
      // Check other potential Solana platform keys
      if (coinData.platforms) {
        const solanaKeys = ['solana', 'sol', 'solana-ecosystem'];
        for (const key of solanaKeys) {
          if (coinData.platforms[key]) {
            return coinData.platforms[key];
          }
        }
      }

      return null;
    } catch (error) {
      console.error('Error extracting Solana contract address:', error.message);
      return null;
    }
  }

  /**
   * Enhance a single token with real contract address (with persistent cache)
   */
  async enhanceTokenWithContract(token) {
    try {
      // First, check if already has a real contract address (not a CoinGecko ID)
      if (token.contractAddress && token.contractAddress.length > 20 && !token.contractAddress.includes('-')) {
        console.log(`⚡ ${token.symbol} already has real contract, skipping`);
        return token;
      }

      // Second, check persistent cache to avoid re-fetching known contracts
      const cachedData = this.getFromPersistentCache(token.symbol);
      if (cachedData) {
        console.log(`📋 ${token.symbol} contract found in persistent cache: ${cachedData.contractAddress ? cachedData.contractAddress.substring(0, 8) + '...' : 'None'}`);
        return {
          ...token,
          contractAddress: cachedData.contractAddress,
          hasRealContract: cachedData.hasRealContract
        };
      }

      // Third, if not in cache, fetch from CoinGecko API
      console.log(`🔍 ${token.symbol} not in cache, fetching from CoinGecko...`);
      const coinId = token.contractAddress || token.symbol.toLowerCase();
      const coinDetails = await this.getCoinDetails(coinId);
      
      if (!coinDetails) {
        // Cache negative result to avoid future API calls
        this.storeToPersistentCache(token.symbol, null, false);
        return token;
      }

      const solanaAddress = this.extractSolanaContractAddress(coinDetails);
      
      if (solanaAddress) {
        console.log(`✅ Found Solana contract for ${token.symbol}: ${solanaAddress.substring(0, 8)}...`);
        // Cache positive result
        this.storeToPersistentCache(token.symbol, solanaAddress, true);
        return {
          ...token,
          contractAddress: solanaAddress,
          hasRealContract: true
        };
      } else {
        console.log(`ℹ️ No Solana contract found for ${token.symbol}, caching negative result`);
        // Cache negative result to avoid future API calls
        this.storeToPersistentCache(token.symbol, null, false);
        return {
          ...token,
          hasRealContract: false
        };
      }
    } catch (error) {
      if (error.message === 'RATE_LIMITED') {
        throw error;
      }
      console.error(`❌ Error enhancing ${token.symbol}:`, error.message);
      return token;
    }
  }

  /**
   * Enhance multiple tokens with contract addresses (with rate limiting)
   */
  async enhanceTokensWithContracts(tokens, maxTokens = 10) {
    console.log(`🔧 Starting contract enhancement for ${Math.min(tokens.length, maxTokens)} tokens...`);
    
    const enhancedTokens = [];
    let processedCount = 0;
    let rateLimitedCount = 0;

    for (let i = 0; i < Math.min(tokens.length, maxTokens); i++) {
      try {
        const enhanced = await this.enhanceTokenWithContract(tokens[i]);
        enhancedTokens.push(enhanced);
        processedCount++;

        // Rate limiting delay
        if (i < Math.min(tokens.length, maxTokens) - 1) {
          await new Promise(resolve => setTimeout(resolve, this.rateLimitDelay));
        }
      } catch (error) {
        if (error.message === 'RATE_LIMITED') {
          rateLimitedCount++;
          console.log(`⚠️ Rate limited, keeping original token data for ${tokens[i].symbol}`);
          enhancedTokens.push(tokens[i]);
          
          // Increase delay for subsequent requests
          this.rateLimitDelay = Math.min(this.rateLimitDelay * 1.5, 10000);
        } else {
          enhancedTokens.push(tokens[i]);
        }
      }
    }

    // Add remaining tokens without enhancement
    if (tokens.length > maxTokens) {
      enhancedTokens.push(...tokens.slice(maxTokens));
    }

    console.log(`✅ Contract enhancement completed:`);
    console.log(`   📊 Processed: ${processedCount}/${Math.min(tokens.length, maxTokens)}`);
    console.log(`   ⏳ Rate limited: ${rateLimitedCount}`);
    console.log(`   🎯 Enhanced contracts: ${enhancedTokens.filter(t => t.hasRealContract).length}`);

    return enhancedTokens;
  }

  /**
   * Get contract address for a specific token (immediate)
   */
  async getContractAddressForToken(symbol, coinId = null) {
    try {
      const id = coinId || symbol.toLowerCase();
      const coinDetails = await this.getCoinDetails(id);
      
      if (coinDetails) {
        return this.extractSolanaContractAddress(coinDetails);
      }
      
      return null;
    } catch (error) {
      console.error(`Error getting contract for ${symbol}:`, error.message);
      return null;
    }
  }

  /**
   * Background enhancement - processes one token at a time to avoid rate limits
   */
  async startBackgroundEnhancement(tokens, updateCallback) {
    if (this.isEnhancing) {
      console.log('🔧 Background enhancement already running...');
      return;
    }

    this.isEnhancing = true;
    this.enhancementQueue = tokens.filter(token => {
      // Only enhance tokens that don't have real contracts yet AND aren't in persistent cache
      const contract = token.contractAddress;
      const hasRealContract = contract && contract.length > 20 && !contract.includes('-');
      const isInCache = this.getFromPersistentCache(token.symbol);
      
      // Skip if already has real contract OR is already cached (even negative results)
      return !hasRealContract && !isInCache;
    });

    console.log(`🔧 Starting background contract enhancement for ${this.enhancementQueue.length} tokens...`);
    console.log(`⏰ Rate limit: ${this.rateLimitDelay/1000}s between requests`);

    let enhanced = 0;
    let failed = 0;

    for (let i = 0; i < this.enhancementQueue.length; i++) {
      try {
        const token = this.enhancementQueue[i];
        console.log(`🔍 [${i+1}/${this.enhancementQueue.length}] Enhancing ${token.symbol}...`);

        const enhancedToken = await this.enhanceTokenWithContract(token);
        
        if (enhancedToken.hasRealContract) {
          enhanced++;
          console.log(`✅ ${token.symbol}: Found real contract!`);
        } else {
          console.log(`ℹ️ ${token.symbol}: No Solana contract available`);
        }

        // Update the token in the main cache via callback
        if (updateCallback) {
          updateCallback(i, enhancedToken);
        }

        // Rate limiting delay
        if (i < this.enhancementQueue.length - 1) {
          console.log(`⏳ Waiting ${this.rateLimitDelay/1000}s before next request...`);
          await new Promise(resolve => setTimeout(resolve, this.rateLimitDelay));
        }

      } catch (error) {
        failed++;
        if (error.message === 'RATE_LIMITED') {
          console.log(`⚠️ Rate limited on ${this.enhancementQueue[i].symbol}, increasing delay...`);
          this.rateLimitDelay = Math.min(this.rateLimitDelay * 1.5, 15000); // Max 15 seconds
          // Wait longer before continuing
          await new Promise(resolve => setTimeout(resolve, this.rateLimitDelay));
        } else {
          console.error(`❌ Failed to enhance ${this.enhancementQueue[i].symbol}:`, error.message);
        }
      }
    }

    this.isEnhancing = false;
    console.log(`🎉 Background enhancement completed!`);
    console.log(`   ✅ Enhanced: ${enhanced}`);
    console.log(`   ❌ Failed: ${failed}`);
    console.log(`   📊 Total processed: ${this.enhancementQueue.length}`);
  }

  /**
   * Get enhancement status
   */
  getStatus() {
    return {
      isEnhancing: this.isEnhancing,
      queueLength: this.enhancementQueue.length,
      rateLimitDelay: this.rateLimitDelay
    };
  }
}

const contractEnhancementService = new ContractEnhancementService();
export default contractEnhancementService;
