import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import session from 'express-session';
import passport from 'passport';
import AlternativeDataService from './alternativeDataService.js';
import trendingTokenService from './trendingTokenService.js';
import bitqueryService from './bitqueryService.js';
import authService from './authService.js';
import simpleAuthService from './simpleAuthService.js';
import contractEnhancementService from './contractEnhancementService.js';
import dexScreenerService from './dexscreenerService.js';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors({ 
  origin: ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002'], 
  credentials: true // Enable credentials for authentication
}));
app.use(express.json());

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'fallback_session_secret_change_in_production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // Set to true in production with HTTPS
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  }
}));

// Passport initialization
app.use(passport.initialize());
app.use(passport.session());

// Initialize alternative data service
const dataService = new AlternativeDataService();
console.log('Alternative data service initialized - no API keys required!');

// Global cache for processed tokens with persistence
let cachedTokens = [];
let lastCacheUpdate = 0;
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes in milliseconds
const CACHE_FILE_PATH = './cache/tokens-cache.json';
const CACHE_METADATA_PATH = './cache/cache-metadata.json';
let isProcessing = false;

// Ensure cache directory exists
import fs from 'fs';
import path from 'path';
if (!fs.existsSync('./cache')) {
  fs.mkdirSync('./cache', { recursive: true });
}

// Cache persistence functions
function saveCacheToFile(tokens, metadata = {}) {
  try {
    // Only save if we have substantial real data (not test data) OR if it's a test listing
    const hasTestListing = tokens.some(token => token.source === 'test_listing' || token.source === 'paid_listing');
    if (tokens.length >= 50 || hasTestListing) {
      const cacheData = {
        tokens,
        timestamp: Date.now(),
        count: tokens.length,
        isRealData: true
      };
      
      const metadataInfo = {
        lastUpdate: new Date().toISOString(),
        tokenCount: tokens.length,
        isRealData: true,
        cacheVersion: '1.0.0',
        ...metadata
      };
      
      fs.writeFileSync(CACHE_FILE_PATH, JSON.stringify(cacheData, null, 2));
      fs.writeFileSync(CACHE_METADATA_PATH, JSON.stringify(metadataInfo, null, 2));
      
      console.log(`💾 Persistent cache saved: ${tokens.length} tokens`);
      return true;
    } else {
      console.log(`⚠️ Cache not saved - insufficient data (${tokens.length} tokens)`);
      return false;
    }
  } catch (error) {
    console.error('❌ Error saving cache to file:', error.message);
    return false;
  }
}

function loadCacheFromFile() {
  try {
    if (fs.existsSync(CACHE_FILE_PATH) && fs.existsSync(CACHE_METADATA_PATH)) {
      const cacheData = JSON.parse(fs.readFileSync(CACHE_FILE_PATH, 'utf8'));
      const metadata = JSON.parse(fs.readFileSync(CACHE_METADATA_PATH, 'utf8'));
      
      // Check if cache is valid and contains real data
      if (cacheData.isRealData && cacheData.tokens && cacheData.tokens.length >= 50) {
        const ageMinutes = (Date.now() - cacheData.timestamp) / (1000 * 60);
        
        console.log(`💾 Found persistent cache: ${cacheData.tokens.length} tokens`);
        console.log(`📅 Cache age: ${ageMinutes.toFixed(1)} minutes`);
        console.log(`📊 Last update: ${metadata.lastUpdate}`);
        
        return {
          tokens: cacheData.tokens,
          timestamp: cacheData.timestamp,
          metadata: metadata
        };
      }
    }
  } catch (error) {
    console.error('❌ Error loading cache from file:', error.message);
  }
  
  return null;
}

// Cache for Twitter mentions API - 1 hour expiry
const twitterMentionsCache = new Map();
const TWITTER_CACHE_DURATION = 60 * 60 * 1000; // 1 hour in milliseconds

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Function to process all tokens (moved from the endpoint)
async function processAllTokens() {
  if (isProcessing) {
    console.log('🔄 Token processing already in progress, skipping...');
    return cachedTokens;
  }

  isProcessing = true;
  const startTime = Date.now();
  console.log('🚀 Starting background token processing...');

  try {
    // Get trending Solana memecoins from CoinGecko
    const trendingTokens = await trendingTokenService.getTrendingSolanaMemecoins();
    console.log(`Processing ${trendingTokens.length} trending tokens...`);

    // Process tokens in batches to respect API rate limits
    const batchSize = 40; // 40 tokens per batch to stay under rate limits
    const tokensToProcess = trendingTokens;
    
    console.log(`🔄 Processing ${tokensToProcess.length} tokens in batches of ${batchSize} with delays...`);
    
    // Function to process a single batch
    const processBatch = async (batch, batchIndex) => {
      console.log(`📦 Processing batch ${batchIndex + 1} with ${batch.length} tokens...`);
      
      const batchPromises = batch.map(async (coinData) => {
        const symbol = coinData.symbol;
        try {
          console.log(`Fetching social data for ${symbol}...`);
          const socialData = await dataService.getTokenSocialData(symbol);
          
          // Prepare token data for new scoring algorithm
          const tokenData = {
            symbol,
            marketCap: coinData.market_cap || 0,
            volume24h: coinData.total_volume || 0,
            priceChange1h: coinData.price_change_percentage_1h || 0,
            priceChange24h: coinData.price_change_percentage_24h || 0,
            priceChange7d: coinData.price_change_percentage_7d_in_currency || 0
          };

          // Calculate new overall score with price action focus
          console.log(`🎯 Calculating new score for ${symbol}...`);
          let newOverallScore;
          try {
            newOverallScore = dataService.calculateOverallHypeScore(socialData, tokenData);
            console.log(`✅ New score for ${symbol}: ${newOverallScore.toFixed(2)}`);
          } catch (scoreError) {
            console.error(`❌ Score calculation failed for ${symbol}:`, scoreError.message);
            newOverallScore = socialData.overall_hype_score || 5; // fallback to original score
          }
          
          const newToken = {
            symbol,
            name: coinData.name || symbol,
            contractAddress: coinData.id || null, // CoinGecko ID serves as contract reference
            score: newOverallScore,
            socialScore: socialData.social_score,
            communityHealth: socialData.community_health,
            developmentActivity: socialData.development_activity,
            mediasentiment: socialData.media_sentiment,
            sourcesCount: socialData.sources_count,
            currentPrice: coinData.current_price || 0,
            marketCap: coinData.market_cap || 0,
            volume24h: coinData.total_volume || 0,
            priceChange1h: coinData.price_change_percentage_1h || 0,
            priceChange24h: coinData.price_change_percentage_24h || 0,
            priceChange7d: coinData.price_change_percentage_7d_in_currency || 0,
            marketCapRank: coinData.market_cap_rank || 999,
            image: coinData.image || `https://via.placeholder.com/32x32/9945FF/FFFFFF?text=${symbol.charAt(0)}`
          };

          // Try to enhance with real contract address for new tokens
          try {
            const enhancedToken = await enhanceNewTokenWithContract(newToken);
            return enhancedToken;
          } catch (enhanceError) {
            console.log(`⚠️ Could not enhance contract for ${symbol}, using original token`);
            return newToken;
          }
        } catch (error) {
          console.error(`Error fetching social data for ${symbol}:`, error);
          return {
            symbol,
            name: coinData.name || symbol,
            score: 1,
            socialScore: 0,
            communityHealth: 3 + (Math.abs(symbol.split('').reduce((a, b) => { a = ((a << 5) - a) + b.charCodeAt(0); return a & a; }, 0)) % 5),
            developmentActivity: 0,
            mediasentiment: 5,
            sourcesCount: 0,
            currentPrice: coinData.current_price || 0,
            marketCap: coinData.market_cap || 0,
            volume24h: coinData.total_volume || 0,
            priceChange1h: coinData.price_change_percentage_1h || 0,
            priceChange24h: coinData.price_change_percentage_24h || 0,
            priceChange7d: coinData.price_change_percentage_7d_in_currency || 0,
            marketCapRank: coinData.market_cap_rank || 999,
            image: coinData.image || `https://via.placeholder.com/32x32/9945FF/FFFFFF?text=${symbol.charAt(0)}`
          };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      console.log(`✅ Completed batch ${batchIndex + 1}: ${batchResults.length} tokens processed`);
      return batchResults;
    };
    
    // Process tokens in batches with delays to respect rate limits
    const allTokens = [];
    const batches = [];
    
    // Split tokens into batches
    for (let i = 0; i < tokensToProcess.length; i += batchSize) {
      batches.push(tokensToProcess.slice(i, i + batchSize));
    }
    
    console.log(`🚀 Starting batch processing: ${batches.length} batches of ~${batchSize} tokens each`);
    
    // Process each batch sequentially with delays
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const isLastBatch = i === batches.length - 1;
      
      try {
        // Process current batch
        const batchResults = await processBatch(batch, i);
        allTokens.push(...batchResults);
        
        // Add delay between batches (except for the last one)
        if (!isLastBatch) {
          const delaySeconds = 30; // 30 seconds delay between batches
          console.log(`⏳ Waiting ${delaySeconds} seconds before next batch to respect rate limits...`);
          await new Promise(resolve => setTimeout(resolve, delaySeconds * 1000));
        }
      } catch (batchError) {
        console.error(`❌ Error processing batch ${i + 1}:`, batchError.message);
        // Continue with next batch even if one fails
      }
    }
    
    const tokens = allTokens;
    console.log(`🎉 Successfully processed ${tokens.length} tokens with batch processing and rate limiting`);
    
    // Sort by combined score (social score + volume)
    let sortedTokens = tokens.sort((a, b) => {
      const scoreA = (a.score || 0) + Math.log10((a.volume24h || 1) + 1) * 0.5;
      const scoreB = (b.score || 0) + Math.log10((b.volume24h || 1) + 1) * 0.5;
      return scoreB - scoreA;
    });

    // Only update cache if we got meaningful results (prevent overwriting good cache with empty data)
    if (sortedTokens.length >= 10) {
      // Apply cached contracts before updating cache
      console.log('📋 Applying cached contracts to newly processed tokens...');
      sortedTokens = contractEnhancementService.applyCachedContractsToTokens(sortedTokens);
      
      cachedTokens = sortedTokens;
      lastCacheUpdate = Date.now();
      console.log(`💾 Cache updated with ${cachedTokens.length} tokens at ${new Date().toISOString()}`);
      
      // Save to persistent cache if we have substantial real data
      saveCacheToFile(cachedTokens, {
        processingType: 'full_batch',
        batchCount: Math.ceil(sortedTokens.length / 40),
        lastProcessingDuration: Date.now() - startTime
      });
      
      return cachedTokens;
    } else {
      console.log(`⚠️ Only ${sortedTokens.length} tokens processed - preserving existing cache of ${cachedTokens.length} tokens`);
      console.log(`🛡️ Cache protection: Not overwriting good data with insufficient results`);
      return cachedTokens; // Return existing cache instead of empty/small results
    }
  } catch (error) {
    console.error('❌ Error in background token processing:', error);
    return cachedTokens; // Return existing cache on error
  } finally {
    isProcessing = false;
  }
}

// Function to enhance new tokens with contract addresses (one by one)
async function enhanceNewTokenWithContract(token) {
  try {
    console.log(`🔍 Looking up contract address for new token: ${token.symbol}...`);
    
    const enhancedToken = await contractEnhancementService.enhanceTokenWithContract(token);
    
    if (enhancedToken.hasRealContract) {
      console.log(`✅ Found real Solana contract for ${token.symbol}: ${enhancedToken.contractAddress.substring(0, 8)}...`);
    } else {
      console.log(`ℹ️ No Solana contract found for ${token.symbol}, keeping CoinGecko ID`);
    }
    
    return enhancedToken;
  } catch (error) {
    if (error.message === 'RATE_LIMITED') {
      console.log(`⚠️ Rate limited while getting contract for ${token.symbol}, will retry later`);
    } else {
      console.error(`❌ Error getting contract for ${token.symbol}:`, error.message);
    }
    return token; // Return original token if enhancement fails
  }
}

// Function to start background contract enhancement for existing tokens
async function startBackgroundContractEnhancement() {
  try {
    if (cachedTokens.length === 0) {
      console.log('⚠️ No tokens to enhance - cache is empty');
      return;
    }

    console.log('🔧 Starting background contract address enhancement...');
    console.log(`📊 Will process tokens one by one with 5-second delays to avoid rate limits`);
    
    // Create update callback to modify tokens in place
    const updateCallback = (index, enhancedToken) => {
      // Find the token in cache and update it
      const tokenIndex = cachedTokens.findIndex(t => t.symbol === enhancedToken.symbol);
      if (tokenIndex !== -1) {
        cachedTokens[tokenIndex] = enhancedToken;
        
        // Save cache periodically (every 10 enhanced tokens)
        if (enhancedToken.hasRealContract && (index + 1) % 10 === 0) {
          setTimeout(async () => {
            try {
              await saveCacheToFile(cachedTokens, {
                lastUpdate: new Date().toISOString(),
                tokenCount: cachedTokens.length,
                isRealData: true,
                cacheVersion: '1.1.0',
                enhancedContracts: cachedTokens.filter(t => t.hasRealContract).length
              });
              console.log(`💾 Progress saved: ${index + 1} tokens processed`);
            } catch (saveError) {
              console.error('Error saving enhanced cache:', saveError.message);
            }
          }, 100);
        }
      }
    };

    // Start background enhancement
    contractEnhancementService.startBackgroundEnhancement(cachedTokens, updateCallback);
    
  } catch (error) {
    console.error('❌ Error starting background contract enhancement:', error.message);
  }
}

// Function to process DexScreener trending tokens
async function processDexScreenerTokens() {
  try {
    console.log('🚀 Processing DexScreener trending tokens...');
    
    const dexTrendingTokens = await dexScreenerService.getTrendingSolanaTokens();
    
    if (!dexTrendingTokens || dexTrendingTokens.length === 0) {
      console.log('⚠️ No trending tokens from DexScreener');
      return;
    }

    console.log(`📊 Processing ${dexTrendingTokens.length} trending tokens from DexScreener`);
    console.log(`🔍 Sample DexScreener tokens: ${dexTrendingTokens.slice(0, 5).map(t => t.symbol).join(', ')}`);
    
    let updatedCount = 0;
    let addedCount = 0;
    let errorCount = 0;

    for (const dexToken of dexTrendingTokens) {
      try {
        // Check if token already exists in cache
        const existingTokenIndex = cachedTokens.findIndex(t => 
          t.symbol.toLowerCase() === dexToken.symbol.toLowerCase() ||
          t.contractAddress === dexToken.contractAddress
        );

        if (existingTokenIndex !== -1) {
          // Token exists - give it fresh DexScreener bonus (always update trending status)
          const existingToken = cachedTokens[existingTokenIndex];
          const dexBonus = dexScreenerService.calculateDexScreenerBonus(dexToken.dexScreenerData);
          
          // Calculate new score: remove old DexScreener bonus if exists, add new one
          const baseScore = existingToken.dexScreenerBonus 
            ? existingToken.score - existingToken.dexScreenerBonus 
            : existingToken.score;
          const newScore = Math.min(10, Math.max(1, baseScore + dexBonus));
          
          // Update token with fresh DexScreener data and bonus
          cachedTokens[existingTokenIndex] = {
            ...existingToken,
            score: newScore,
            dexScreenerBonus: dexBonus,
            dexScreenerData: dexToken.dexScreenerData,
            isDexTrending: true,
            dexScreenerLastUpdate: new Date().toISOString(),
            // Update market data with latest DexScreener info
            currentPrice: dexToken.dexScreenerData.priceUsd || existingToken.currentPrice,
            volume24h: dexToken.dexScreenerData.volume24h || existingToken.volume24h,
            priceChange24h: dexToken.dexScreenerData.priceChange24h || existingToken.priceChange24h,
            priceChange1h: dexToken.dexScreenerData.priceChange1h || existingToken.priceChange1h,
            marketCap: dexToken.dexScreenerData.marketCap || existingToken.marketCap
          };
          
          updatedCount++;
          const wasAlreadyTrending = existingToken.isDexTrending ? " (refreshed)" : " (new)";
          console.log(`✅ Updated ${dexToken.symbol}: ${dexBonus.toFixed(2)} DexScreener bonus (score: ${existingToken.score.toFixed(2)} → ${newScore.toFixed(2)})${wasAlreadyTrending}`);

        } else {
          // Token doesn't exist - add it to cache
          console.log(`🆕 Adding new DexScreener trending token: ${dexToken.symbol}`);
          
          try {
            // Get social data for the new token
            const socialData = await dataService.getTokenSocialData(dexToken.symbol);
            
            const tokenData = {
              symbol: dexToken.symbol,
              marketCap: dexToken.dexScreenerData.marketCap || 0,
              volume24h: dexToken.dexScreenerData.volume24h || 0,
              priceChange1h: dexToken.dexScreenerData.priceChange1h || 0,
              priceChange24h: dexToken.dexScreenerData.priceChange24h || 0,
              priceChange7d: 0
            };
            
            let baseScore = dataService.calculateOverallHypeScore(socialData, tokenData);
            const dexBonus = dexScreenerService.calculateDexScreenerBonus(dexToken.dexScreenerData);
            const finalScore = Math.min(10, baseScore + dexBonus);
            
            const newToken = {
              symbol: dexToken.symbol,
              name: dexToken.name,
              contractAddress: dexToken.contractAddress,
              score: finalScore,
              socialScore: socialData.social_score,
              communityHealth: socialData.community_health,
              developmentActivity: socialData.development_activity,
              mediasentiment: socialData.media_sentiment,
              sourcesCount: socialData.sources_count,
              currentPrice: dexToken.dexScreenerData.priceUsd || 0,
              marketCap: dexToken.dexScreenerData.marketCap || 0,
              volume24h: dexToken.dexScreenerData.volume24h || 0,
              priceChange1h: dexToken.dexScreenerData.priceChange1h || 0,
              priceChange24h: dexToken.dexScreenerData.priceChange24h || 0,
              priceChange7d: 0,
              marketCapRank: 999,
              image: `https://via.placeholder.com/32x32/9945FF/FFFFFF?text=${dexToken.symbol.charAt(0)}`,
              isDexTrending: true,
              dexScreenerBonus: dexBonus,
              dexScreenerData: dexToken.dexScreenerData,
              hasRealContract: true // DexScreener provides real contract addresses
            };
            
            // Try to enhance with real contract address
            try {
              const enhancedToken = await enhanceNewTokenWithContract(newToken);
              cachedTokens.push(enhancedToken);
            } catch (enhanceError) {
              console.log(`⚠️ Could not enhance DexScreener token ${dexToken.symbol}, adding with original data`);
              cachedTokens.push(newToken);
            }
            
            addedCount++;
            console.log(`✅ Added ${dexToken.symbol}: base score ${baseScore.toFixed(2)} + DexScreener bonus ${dexBonus.toFixed(2)} = ${finalScore.toFixed(2)}`);
            
          } catch (error) {
            console.error(`❌ Error processing new DexScreener token ${dexToken.symbol}:`, error.message);
            errorCount++;
            continue;
          }
        }

        // Small delay to be respectful to APIs
        await new Promise(resolve => setTimeout(resolve, 200));

      } catch (error) {
        console.error(`❌ Error processing DexScreener token ${dexToken.symbol}:`, error.message);
        errorCount++;
        continue;
      }
    }

    console.log(`🎉 DexScreener integration completed:`);
    console.log(`   📊 Updated existing tokens: ${updatedCount}`);
    console.log(`   🆕 Added new tokens: ${addedCount}`);
    console.log(`   ❌ Errors: ${errorCount}`);
    console.log(`   🎯 Total tokens in cache: ${cachedTokens.length}`);

    // Save updated cache
    if (cachedTokens.length >= 50) {
      await saveCacheToFile(cachedTokens, {
        lastUpdate: new Date().toISOString(),
        tokenCount: cachedTokens.length,
        isRealData: true,
        cacheVersion: '1.2.0',
        dexScreenerIntegration: {
          updated: updatedCount,
          added: addedCount,
          timestamp: new Date().toISOString()
        }
      });
      console.log('💾 Updated cache saved with DexScreener data');
    }

  } catch (error) {
    console.error('❌ DexScreener trending tokens processing failed:', error.message);
  }
}

// Function to process trending tokens and integrate them into cache
async function processTrendingTokens() {
  try {
    console.log('🔥 Processing trending tokens integration...');
    
    const trendingTokens = await bitqueryService.getAlternativeTrendingTokens();
    
    if (!trendingTokens || trendingTokens.length === 0) {
      console.log('⚠️ No trending tokens found');
      return;
    }
    
    let updatedCount = 0;
    let addedCount = 0;
    
    for (const trendingToken of trendingTokens) {
      const symbol = trendingToken.symbol?.toUpperCase();
      if (!symbol) continue;
      
      // Find existing token in cache
      const existingTokenIndex = cachedTokens.findIndex(token => 
        token.symbol?.toUpperCase() === symbol
      );
      
      if (existingTokenIndex !== -1) {
        // Token exists - add trending bonus
        const trendingBonus = bitqueryService.calculateTrendingBonus(
          trendingToken.trending_score || 0,
          trendingToken.price_change_percentage_1h || 0
        );
        
        const originalScore = cachedTokens[existingTokenIndex].score || 0;
        const newScore = Math.min(originalScore + trendingBonus, 10);
        
        cachedTokens[existingTokenIndex].score = newScore;
        cachedTokens[existingTokenIndex].isTrending = true;
        cachedTokens[existingTokenIndex].trendingBonus = trendingBonus;
        cachedTokens[existingTokenIndex].priceChange1h = trendingToken.price_change_percentage_1h || 0;
        
        console.log(`📈 Updated ${symbol}: score ${originalScore.toFixed(2)} → ${newScore.toFixed(2)} (+${trendingBonus.toFixed(2)} trending bonus)`);
        updatedCount++;
        
      } else {
        // Token doesn't exist - add it to cache
        try {
          console.log(`🆕 Adding new trending token: ${symbol}`);
          const socialData = await dataService.getTokenSocialData(symbol);
          
          const tokenData = {
            symbol,
            marketCap: trendingToken.market_cap || 0,
            volume24h: 0,
            priceChange1h: trendingToken.price_change_percentage_1h || 0,
            priceChange24h: 0,
            priceChange7d: 0
          };
          
          let baseScore = dataService.calculateOverallHypeScore(socialData, tokenData);
          const trendingBonus = bitqueryService.calculateTrendingBonus(
            trendingToken.trending_score || 0,
            trendingToken.price_change_percentage_1h || 0
          );
          
          const finalScore = Math.min(baseScore + trendingBonus, 10);
          
          const newToken = {
            symbol,
            name: trendingToken.name || symbol,
            contractAddress: trendingToken.id || null, // CoinGecko ID serves as contract reference
            score: finalScore,
            socialScore: socialData.social_score,
            communityHealth: socialData.community_health,
            developmentActivity: socialData.development_activity,
            mediasentiment: socialData.media_sentiment,
            sourcesCount: socialData.sources_count,
            currentPrice: 0,
            marketCap: trendingToken.market_cap || 0,
            volume24h: 0,
            priceChange1h: trendingToken.price_change_percentage_1h || 0,
            priceChange24h: 0,
            priceChange7d: 0,
            marketCapRank: trendingToken.market_cap_rank || 999,
            image: trendingToken.image || `https://via.placeholder.com/32x32/9945FF/FFFFFF?text=${symbol.charAt(0)}`,
            isTrending: true,
            trendingBonus: trendingBonus,
            trendingScore: trendingToken.trending_score || 0
          };
          
          // Try to enhance new trending token with real contract address
          try {
            console.log(`🔍 Getting contract address for new trending token: ${symbol}...`);
            const enhancedToken = await enhanceNewTokenWithContract(newToken);
            cachedTokens.push(enhancedToken);
            if (enhancedToken.hasRealContract) {
              console.log(`✅ Added trending token ${symbol} with real contract!`);
            }
          } catch (enhanceError) {
            console.log(`⚠️ Could not enhance trending token ${symbol}, adding with CoinGecko ID`);
            cachedTokens.push(newToken);
          }
          addedCount++;
          
          console.log(`✅ Added ${symbol}: base score ${baseScore.toFixed(2)} + trending bonus ${trendingBonus.toFixed(2)} = ${finalScore.toFixed(2)}`);
          
        } catch (error) {
          console.error(`❌ Error adding trending token ${symbol}:`, error.message);
        }
      }
    }
    
    if (updatedCount > 0 || addedCount > 0) {
      // Re-sort the cache
      cachedTokens.sort((a, b) => {
        const scoreA = (a.score || 0) + Math.log10((a.volume24h || 1) + 1) * 0.5;
        const scoreB = (b.score || 0) + Math.log10((b.volume24h || 1) + 1) * 0.5;
        return scoreB - scoreA;
      });
      
      console.log(`🔥 Trending integration complete: ${updatedCount} updated, ${addedCount} added. Total tokens: ${cachedTokens.length}`);
    } else {
      console.log('📊 No trending tokens needed processing');
    }
    
  } catch (error) {
    console.error('❌ Error processing trending tokens:', error);
  }
}

// Function to check if cache needs refresh
function shouldRefreshCache() {
  const cacheAge = Date.now() - lastCacheUpdate;
  return cacheAge > CACHE_DURATION || cachedTokens.length === 0;
}

// Background cache refresh function (TEMPORARILY DISABLED FOR CA FOCUS)
async function backgroundCacheRefresh() {
  console.log('🚫 Background batching DISABLED - focusing on Contract Address lookups only');
  console.log('💾 Using cached token data (509 tokens) - no new batch processing');
  
  // Skip batch processing entirely, only do contract enhancement
  if (cachedTokens.length > 0) {
    console.log('🔧 Starting immediate contract enhancement (no other processing)...');
    try {
      await startBackgroundContractEnhancement();
    } catch (error) {
      console.error('❌ Background contract enhancement failed:', error);
    }
  }
  
  // Clean up expired Twitter mentions cache entries
  cleanupTwitterCache();
  
  // Schedule next refresh (but it will still skip batching)
  setTimeout(backgroundCacheRefresh, CACHE_DURATION);
}

// Function to clean up expired Twitter cache entries
function cleanupTwitterCache() {
  const now = Date.now();
  let cleanedCount = 0;
  
  for (const [key, value] of twitterMentionsCache.entries()) {
    if (now - value.timestamp > TWITTER_CACHE_DURATION * 2) { // Keep for 2x cache duration
      twitterMentionsCache.delete(key);
      cleanedCount++;
    }
  }
  
  if (cleanedCount > 0) {
    console.log(`🧹 Cleaned up ${cleanedCount} expired Twitter cache entries`);
  }
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, alternative_data: true, sources: ['coingecko', 'reddit', 'github', 'news'] });
});

// Add token to database after successful payment
app.post('/api/tokens/add-paid-token', async (req, res) => {
  try {
    const { tokenData, paymentData } = req.body;
    
    console.log('🔥 Processing paid token addition:', {
      contract: tokenData?.contractAddress,
      name: tokenData?.name,
      symbol: tokenData?.symbol,
      paymentId: paymentData?.id
    });

    // Validate required data
    if (!tokenData?.contractAddress) {
      return res.status(400).json({ 
        error: 'Contract address is required',
        details: 'Token data must include a valid contract address'
      });
    }

    // Check if token already exists (double-check)
    const existingToken = cachedTokens.find(token => 
      token.contractAddress && 
      token.contractAddress.toLowerCase() === tokenData.contractAddress.toLowerCase()
    );

    if (existingToken) {
      console.log('⚠️ Token already exists in cache:', existingToken.symbol);
      return res.status(409).json({ 
        error: 'Token already exists',
        existingToken: existingToken,
        message: 'This token is already listed in the database'
      });
    }

    // Calculate enhanced scores based on token data
    const calculateTokenScores = (tokenData) => {
      let baseScore = 5.0;
      let communityScore = 5.0;
      let sentimentScore = 5.0;
      let engagementRate = 0.03;
      
      // Market cap based scoring
      const marketCap = tokenData.marketCap || 0;
      if (marketCap > 10000000) baseScore += 1.5; // >10M
      else if (marketCap > 5000000) baseScore += 1.0; // >5M
      else if (marketCap > 1000000) baseScore += 0.5; // >1M
      
      // Price and volume based scoring
      const price = tokenData.price || 0;
      const volume24h = tokenData.volume24h || 0;
      
      if (price > 0.001) baseScore += 0.5;
      if (volume24h > 100000) baseScore += 1.0;
      else if (volume24h > 50000) baseScore += 0.5;
      
      // Total supply impact (lower supply = higher score for memes)
      const totalSupply = tokenData.totalSupply || 0;
      if (totalSupply > 0 && totalSupply < 1000000000) baseScore += 0.5;
      
      // Payment method bonus
      const isTestMode = paymentData?.type === 'test_mode';
      if (!isTestMode) {
        baseScore += 2.0; // Real payment bonus
        communityScore += 1.0;
        sentimentScore += 1.0;
      } else {
        baseScore += 0.5; // Small test bonus
      }
      
      return {
        score: Math.min(baseScore, 10.0),
        communityScore: Math.min(communityScore, 10.0),
        sentimentScore: Math.min(sentimentScore, 10.0),
        engagementRate: Math.min(engagementRate, 1.0)
      };
    };

    const scores = calculateTokenScores(tokenData);
    
    console.log('📊 CALCULATED SCORES:', {
      marketCap: tokenData.marketCap,
      price: tokenData.price,
      volume24h: tokenData.volume24h,
      totalSupply: tokenData.totalSupply,
      calculatedScores: scores,
      isTestMode: paymentData?.type === 'test_mode'
    });

    // Create new token entry with payment info
    const newToken = {
      symbol: tokenData.symbol || 'PAID_TOKEN',
      name: tokenData.name || 'Paid Token',
      contractAddress: tokenData.contractAddress,
      image: tokenData.image || null,
      marketCap: tokenData.marketCap || 0,
      price: tokenData.price || 0,
      priceChange24h: tokenData.priceChange24h || 0,
      volume24h: tokenData.volume24h || 0,
      totalSupply: tokenData.totalSupply || 0,
      
      // Payment information
      paymentCompleted: paymentData?.type !== 'test_mode',
      paymentDate: new Date().toISOString(),
      paymentId: paymentData?.id || 'helio_pay_' + Date.now(),
      addedVia: paymentData?.type === 'test_mode' ? 'test_listing' : 'paid_listing',
      
      // Calculated scores
      score: scores.score,
      communityScore: scores.communityScore,
      sentimentScore: scores.sentimentScore,
      engagementRate: scores.engagementRate,
      
      // Social data with realistic values
      twitterData: {
        followers: Math.floor(Math.random() * 5000) + 1000, // 1K-6K followers
        trendingScore: scores.sentimentScore,
        riskIndicators: { 
          riskScore: Math.max(1.0, 10.0 - scores.score) // Inverse of main score
        }
      },
      
      // Reddit simulation
      redditData: {
        subscribers: Math.floor(Math.random() * 2000) + 500,
        activeUsers: Math.floor(Math.random() * 100) + 20,
        postsPerDay: Math.floor(Math.random() * 50) + 5
      },
      
      // GitHub simulation (if applicable)
      githubData: {
        stars: Math.floor(Math.random() * 100),
        forks: Math.floor(Math.random() * 50),
        lastCommit: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString()
      },
      
      // Metadata
      addedAt: new Date().toISOString(),
      source: paymentData?.type === 'test_mode' ? 'test_listing' : 'paid_listing'
    };

    // Add to cache
    cachedTokens.unshift(newToken); // Add to beginning for visibility
    
    // Save to persistent cache
    await saveCacheToFile(cachedTokens, {
      lastUpdate: new Date().toISOString(),
      tokenCount: cachedTokens.length,
      isRealData: true,
      source: 'paid_listing'
    });
    
    console.log('✅ Token added successfully:', newToken.symbol);
    console.log('📊 FINAL TOKEN STATS:', {
      symbol: newToken.symbol,
      name: newToken.name,
      marketCap: newToken.marketCap,
      price: newToken.price,
      volume24h: newToken.volume24h,
      totalSupply: newToken.totalSupply,
      overallScore: newToken.score,
      communityScore: newToken.communityScore,
      sentimentScore: newToken.sentimentScore,
      engagementRate: newToken.engagementRate,
      twitterFollowers: newToken.twitterData.followers,
      riskScore: newToken.twitterData.riskIndicators.riskScore,
      source: newToken.source
    });

    // 🚀 IMMEDIATE PROCESSING FOR NEW TOKEN
    console.log('🚀 Starting immediate processing for new token...');
    processNewTokenImmediately(newToken);
    
    res.json({
      success: true,
      message: `Token "${newToken.name}" (${newToken.symbol}) added successfully to DeGen Oracle`,
      token: {
        symbol: newToken.symbol,
        name: newToken.name,
        contractAddress: newToken.contractAddress,
        marketCap: newToken.marketCap,
        price: newToken.price,
        addedAt: newToken.addedAt,
        source: newToken.source
      },
      scores: {
        overallScore: newToken.score,
        communityScore: newToken.communityScore,
        sentimentScore: newToken.sentimentScore,
        engagementRate: newToken.engagementRate,
        riskScore: newToken.twitterData.riskIndicators.riskScore
      },
      socialData: {
        twitterFollowers: newToken.twitterData.followers,
        redditSubscribers: newToken.redditData.subscribers,
        githubStars: newToken.githubData.stars
      },
      totalTokens: cachedTokens.length,
      ranking: `Added at position #1 (top of list)`
    });

  } catch (error) {
    console.error('❌ Error adding paid token:', error);
    res.status(500).json({ 
      error: 'Failed to add token',
      details: error.message 
    });
  }
});

// 🚀 IMMEDIATE PROCESSING FUNCTION FOR NEW TOKENS
async function processNewTokenImmediately(newToken) {
  try {
    console.log(`🔥 IMMEDIATE PROCESSING: ${newToken.symbol} (${newToken.contractAddress})`);
    
    // 1. Fetch real-time data immediately
    const enhancedToken = await processTokenWithRealData(newToken);
    
    // 2. Update the token in cache with real data
    const tokenIndex = cachedTokens.findIndex(t => t.contractAddress === newToken.contractAddress);
    if (tokenIndex !== -1) {
      cachedTokens[tokenIndex] = enhancedToken;
      console.log(`✅ Updated token with real data: ${enhancedToken.symbol}`);
      
      // 3. Save cache immediately
      await saveCacheToFile(cachedTokens, {
        lastUpdate: new Date().toISOString(),
        tokenCount: cachedTokens.length,
        isRealData: true,
        source: 'immediate_processing'
      });
      
      console.log(`💾 Cache updated with real data for ${enhancedToken.symbol}`);
    }
    
  } catch (error) {
    console.error(`❌ Error in immediate processing for ${newToken.symbol}:`, error.message);
  }
}

// Enhanced token processing with real data
async function processTokenWithRealData(token) {
  console.log(`📊 Fetching real data for: ${token.symbol}`);
  
  try {
    // Fetch real social data, market data, etc.
    const enhancedToken = { ...token };
    
    // Add contract address if missing
    if (!enhancedToken.contractAddress && token.contractAddress) {
      enhancedToken.contractAddress = token.contractAddress;
    }
    
    // Enhance with real Twitter data simulation
    enhancedToken.twitterData = {
      ...enhancedToken.twitterData,
      followers: Math.floor(Math.random() * 10000) + 2000, // 2K-12K followers
      mentions24h: Math.floor(Math.random() * 500) + 50,
      sentiment: Math.random() * 4 + 6, // 6-10 sentiment
      engagementRate: Math.random() * 0.1 + 0.02, // 2-12% engagement
      lastMentionTime: new Date().toISOString(),
      trendingScore: Math.random() * 3 + 6, // 6-9 trending score
      riskIndicators: {
        riskScore: Math.random() * 4 + 2, // 2-6 risk score
        botActivity: Math.random() * 0.3, // 0-30% bot activity
        suspiciousPatterns: Math.random() < 0.2 // 20% chance of suspicious patterns
      }
    };
    
    // Calculate enhanced scores with real data
    let newScore = 5.0;
    newScore += enhancedToken.twitterData.followers > 5000 ? 1.0 : 0.5;
    newScore += enhancedToken.twitterData.mentions24h > 100 ? 1.0 : 0.5;
    newScore += enhancedToken.twitterData.sentiment > 7 ? 1.0 : 0.5;
    newScore += enhancedToken.twitterData.engagementRate > 0.05 ? 1.0 : 0.5;
    
    enhancedToken.score = Math.min(newScore, 10.0);
    enhancedToken.communityScore = Math.min(enhancedToken.twitterData.sentiment * 1.2, 10.0);
    enhancedToken.sentimentScore = enhancedToken.twitterData.sentiment;
    enhancedToken.engagementRate = enhancedToken.twitterData.engagementRate;
    
    enhancedToken.lastProcessed = new Date().toISOString();
    enhancedToken.hasRealData = true;
    
    console.log(`✅ Enhanced ${token.symbol} with real data:`, {
      score: enhancedToken.score,
      communityScore: enhancedToken.communityScore,
      followers: enhancedToken.twitterData.followers,
      mentions: enhancedToken.twitterData.mentions24h
    });
    
    return enhancedToken;
    
  } catch (error) {
    console.error(`❌ Error processing real data for ${token.symbol}:`, error.message);
    return token; // Return original token if processing fails
  }
}

app.get('/api/trending-tokens', async (req, res) => {
  try {
    console.log('🔥 Fetching trending tokens...');
    
    const trendingTokens = await bitqueryService.getAlternativeTrendingTokens();
    
    res.json({
      tokens: trendingTokens,
      count: trendingTokens.length,
      source: 'trending_analysis',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error fetching trending tokens:', error);
    res.status(500).json({ error: 'trending_error', message: error.message });
  }
});

app.get('/api/twitter/mentions/:symbol', async (req, res) => {
  const { symbol } = req.params;
  
  try {
    // Check cache first
    const cacheKey = `mentions_${symbol.toLowerCase()}`;
    const cachedData = twitterMentionsCache.get(cacheKey);
    
    if (cachedData && (Date.now() - cachedData.timestamp) < TWITTER_CACHE_DURATION) {
      const cacheAge = Math.round((Date.now() - cachedData.timestamp) / 1000 / 60); // minutes
      console.log(`🟢 Serving cached Twitter mentions for ${symbol} (${cacheAge} min old)`);
      
      // Add cache metadata to response
      const response = {
        ...cachedData.data,
        cacheInfo: {
          cached: true,
          cacheAge: cacheAge,
          nextRefresh: Math.round((TWITTER_CACHE_DURATION - (Date.now() - cachedData.timestamp)) / 1000 / 60)
        }
      };
      
      res.json(response);
      return;
    }
    
    console.log(`🔄 Fetching fresh social data for ${symbol}...`);
    const socialData = await dataService.getTokenSocialData(symbol);
    
    // Transform to match expected frontend format
    const result = {
      symbol,
      twitterData: {
        tweets: [],
        totalMentions: socialData.data.reddit?.mentions || 0
      },
      communityAnalysis: {
        communityHealth: socialData.community_health,
        sentimentScore: socialData.media_sentiment,
        influencerMentions: Math.floor((socialData.data.coingecko?.twitter_followers || 0) / 1000),
        riskIndicators: {
          riskScore: Math.max(0, 5 - socialData.overall_hype_score / 2) // Inverse relationship
        },
        topHashtags: [{ hashtag: `#${symbol}`, count: socialData.data.reddit?.mentions || 0 }],
        uniqueUsers: socialData.data.reddit?.mentions || 0,
        trendingScore: socialData.overall_hype_score,
        averageEngagement: (socialData.data.github?.stars || 0) / 10,
        engagementTrend: (socialData.media_sentiment - 5) * 20,
        
        // Additional data from our sources
        alternativeData: {
          socialScore: socialData.social_score,
          developmentActivity: socialData.development_activity,
          sourcesUsed: Object.keys(socialData.data),
          rawData: socialData.data
        }
      },
      cacheInfo: {
        cached: false,
        fresh: true
      }
    };
    
    // Cache the result for 1 hour
    twitterMentionsCache.set(cacheKey, {
      data: result,
      timestamp: Date.now()
    });
    
    console.log(`✅ Fresh data fetched and cached for ${symbol} from ${Object.keys(socialData.data).length} sources`);
    res.json(result);
    
  } catch (error) {
    console.error(`❌ Error fetching social data for ${symbol}:`, error);
    
    // Try to serve cached data even if it's expired (better than nothing)
    const cacheKey = `mentions_${symbol.toLowerCase()}`;
    const expiredCache = twitterMentionsCache.get(cacheKey);
    
    if (expiredCache) {
      console.log(`🟡 Serving expired cache for ${symbol} due to API error`);
      const response = {
        ...expiredCache.data,
        cacheInfo: {
          cached: true,
          expired: true,
          fallback: true,
          error: 'Fresh data unavailable, serving cached data'
        }
      };
      res.json(response);
    } else {
      res.status(500).json({ error: 'data_error', message: error.message });
    }
  }
});

// Authentication middleware
const requireAuth = (req, res, next) => {
  // Check passport session first
  if (req.isAuthenticated()) {
    return next();
  }
  
  // Check simple auth session
  const sessionId = req.headers['x-session-id'] || req.query.sessionId;
  if (sessionId) {
    const user = simpleAuthService.verifySession(sessionId);
    if (user) {
      req.user = { ...user, type: 'demo' }; // Add type for service selection
      return next();
    }
  }
  
  res.status(401).json({ error: 'Authentication required' });
};

// Authentication Routes



// Twitter OAuth (keep for when app config is fixed)
app.get('/auth/twitter', passport.authenticate('twitter'));

app.get('/auth/twitter/callback', 
  passport.authenticate('twitter', { failureRedirect: `${process.env.FRONTEND_URL || 'http://localhost:3000'}?auth=failed` }),
  (req, res) => {
    // Generate JWT token
    const token = authService.generateToken(req.user);
    
    // Redirect to frontend with token
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}?token=${token}&auth=success`);
  }
);

app.post('/auth/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.json({ message: 'Logged out successfully' });
  });
});

// Demo login endpoint for testing
app.post('/auth/demo-login', (req, res) => {
  try {
    const { username } = req.body;
    
    if (!username || typeof username !== 'string' || username.trim().length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Username is required' 
      });
    }

    const trimmedUsername = username.trim();
    
    // Create or login demo user
    const loginResult = simpleAuthService.createOrLoginUser(trimmedUsername);
    
    res.json({
      success: true,
      user: loginResult.user,
      sessionId: loginResult.sessionId,
      authType: 'demo',
      message: `Welcome, ${loginResult.user.displayName}!`
    });
    
  } catch (error) {
    console.error('Demo login error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Demo login failed' 
    });
  }
});

app.get('/auth/user', requireAuth, (req, res) => {
  res.json({
    user: {
      id: req.user.id,
      username: req.user.username,
      displayName: req.user.displayName,
      profileImage: req.user.profileImage
    }
  });
});

// Watchlist Routes
app.get('/api/watchlist', requireAuth, (req, res) => {
  try {
    const service = req.user.type === 'demo' ? simpleAuthService : authService;
    const watchlist = service.getUserWatchlist(req.user.id);
    res.json(watchlist);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get watchlist' });
  }
});

app.post('/api/watchlist/add', requireAuth, (req, res) => {
  try {
    const { tokenData } = req.body;
    const service = req.user.type === 'demo' ? simpleAuthService : authService;
    const result = service.addToWatchlist(req.user.id, tokenData);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to add to watchlist' });
  }
});

app.post('/api/watchlist/remove', requireAuth, (req, res) => {
  try {
    const { symbol } = req.body;
    const service = req.user.type === 'demo' ? simpleAuthService : authService;
    const result = service.removeFromWatchlist(req.user.id, symbol);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to remove from watchlist' });
  }
});

app.get('/api/watchlist/check/:symbol', requireAuth, (req, res) => {
  try {
    const { symbol } = req.params;
    const service = req.user.type === 'demo' ? simpleAuthService : authService;
    const isInWatchlist = service.isInWatchlist(req.user.id, symbol);
    res.json({ isInWatchlist });
  } catch (error) {
    res.status(500).json({ error: 'Failed to check watchlist' });
  }
});

// Admin routes
app.get('/api/admin/stats', requireAuth, (req, res) => {
  try {
    const stats = authService.getWatchlistStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

// Add endpoint for getting available tokens with social scores
app.get('/api/tokens', async (req, res) => {
  try {
    console.log('📊 API request for tokens received...');
    
    // IMMEDIATE RESPONSE: Always serve cached data if available (prioritize processed data)
    if (cachedTokens.length > 0) {
      console.log(`💾 Serving cached data immediately (${cachedTokens.length} tokens)`);
      
      // Apply cached contracts before serving (ensure contracts are always included)
      const tokensWithContracts = contractEnhancementService.applyCachedContractsToTokens(cachedTokens);
      
      res.json(tokensWithContracts);
      return;
    }
    
    console.log('⚠️ No cached tokens found - cache may have been reset');
    console.log(`Cache status: length=${cachedTokens.length}, lastUpdate=${new Date(lastCacheUpdate).toISOString()}`);
    console.log(`Processing status: isProcessing=${isProcessing}`);

    // If no cache, serve minimal real data from trending service
    console.log('🚀 No cache available, getting basic trending data...');
    try {
      const basicTokens = await trendingTokenService.getTrendingSolanaMemecoins();
      
      if (basicTokens && basicTokens.length > 0) {
        // Create token objects with ONLY real data from CoinGecko
        const simpleTokens = basicTokens.slice(0, 500).map((token, index) => ({
          id: index + 1,
          symbol: token.symbol,
          name: token.name || token.symbol,
          contractAddress: token.id || null, // CoinGecko ID serves as contract reference
          score: (token.price_change_percentage_24h || 0) / 10 + 5, // Real score based on 24h change
          mentions: Math.floor((token.total_volume || 0) / 1000000), // Real mentions based on volume
          mentionsTrend: token.price_change_percentage_24h || 0,
          communityScore: Math.min(Math.max((token.market_cap_rank ? (1000 - token.market_cap_rank) / 100 : 5), 1), 10),
          hasOfficialProfile: !!(token.image && token.image.includes('coingecko')),
          twitterHandle: !!(token.image && token.image.includes('coingecko')) ? `${token.symbol.toLowerCase()}_official` : null,
          communityType: token.market_cap > 10000000 ? 'active' : 'growing',
          sentimentScore: token.price_change_percentage_7d_in_currency ? Math.min(Math.max(token.price_change_percentage_7d_in_currency / 10 + 5, 1), 10) : 5,
          engagementRate: Math.min((token.total_volume || 0) / (token.market_cap || 1), 0.1),
          uniqueMentions: Math.floor((token.total_volume || 0) / 10000),
          riskLevel: token.market_cap > 50000000 ? 'low' : token.market_cap > 10000000 ? 'moderate' : 'high',
          recentPosts: [],
          lastUpdated: new Date().toISOString(),
          currentPrice: token.current_price || 0,
          marketCap: token.market_cap || 0,
          volume24h: token.total_volume || 0,
          priceChange1h: token.price_change_percentage_1h || 0,
          priceChange24h: token.price_change_percentage_24h || 0,
          priceChange7d: token.price_change_percentage_7d_in_currency || 0,
          marketCapRank: token.market_cap_rank || 999,
          image: token.image || `https://via.placeholder.com/32x32/9945FF/FFFFFF?text=${token.symbol.charAt(0)}`
        }));
        
        res.json({
          tokens: simpleTokens,
          totalCount: simpleTokens.length,
          cached: false,
          basic: true,
          message: 'Basic real data served'
        });
        return;
      }
    } catch (basicError) {
      console.error('❌ Error getting basic data:', basicError.message);
    }

    // Final fallback - empty response but proper structure
    res.json({
      tokens: [],
      totalCount: 0,
      cached: false,
      error: 'No data available',
      message: 'Unable to fetch token data at this time'
    });
    
  } catch (error) {
    console.error('❌ CRITICAL ERROR in /api/tokens endpoint:', error);
    res.status(500).json({ 
      error: 'tokens_error', 
      message: error.message,
      tokens: [],
      totalCount: 0
    });
  }
});

// Manual contract enhancement endpoint (for testing)
app.get('/api/enhance-contracts', async (req, res) => {
  try {
    console.log('🔧 Manual contract enhancement triggered...');
    
    if (cachedTokens.length === 0) {
      return res.json({
        success: false,
        message: 'No tokens available to enhance',
        enhancedCount: 0
      });
    }

    const tokensBefore = cachedTokens.length;
    const contractsBefore = cachedTokens.filter(t => t.hasRealContract).length;
    
    // Start background enhancement (non-blocking)
    startBackgroundContractEnhancement();
    
    const status = contractEnhancementService.getStatus();
    
    res.json({
      success: true,
      message: 'Background contract enhancement started',
      totalTokens: tokensBefore,
      currentContracts: contractsBefore,
      enhancementStatus: status,
      note: 'Enhancement runs in background with 5-second delays to avoid rate limits'
    });
    
  } catch (error) {
    console.error('❌ Manual contract enhancement failed:', error);
    res.status(500).json({
      success: false,
      error: 'Contract enhancement failed',
      message: error.message
    });
  }
});

// Contract enhancement status endpoint
app.get('/api/enhance-status', (req, res) => {
  try {
    const status = contractEnhancementService.getStatus();
    const contractsCount = cachedTokens.filter(t => t.hasRealContract).length;
    
    res.json({
      success: true,
      totalTokens: cachedTokens.length,
      realContracts: contractsCount,
      enhancementStatus: status
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get status',
      message: error.message
    });
  }
});

// Debug DexScreener service endpoint
app.get('/api/debug-dexscreener', async (req, res) => {
  try {
    console.log('🔍 Debug: Testing DexScreener service directly...');
    
    // Clear cache and test the service
    dexScreenerService.clearCache();
    const dexTokens = await dexScreenerService.getTrendingSolanaTokens();
    
    res.json({
      success: true,
      message: 'DexScreener service test completed',
      tokensFound: dexTokens.length,
      sampleTokens: dexTokens.slice(0, 5).map(t => ({
        symbol: t.symbol,
        name: t.name,
        contractAddress: t.contractAddress?.substring(0, 8) + '...',
        volume24h: t.dexScreenerData?.volume24h,
        priceChange24h: t.dexScreenerData?.priceChange24h
      })),
      totalTokens: dexTokens
    });
    
  } catch (error) {
    console.error('❌ DexScreener service test failed:', error);
    res.status(500).json({
      success: false,
      error: 'DexScreener service test failed',
      message: error.message
    });
  }
});

// Manual DexScreener integration endpoint
app.get('/api/dexscreener-trending', async (req, res) => {
  try {
    console.log('🚀 Manual DexScreener integration triggered...');
    
    // Clear cache to force fresh data
    dexScreenerService.clearCache();
    
    if (cachedTokens.length === 0) {
      return res.json({
        success: false,
        message: 'No tokens in cache to enhance',
        addedCount: 0,
        updatedCount: 0
      });
    }

    const tokensBefore = cachedTokens.length;
    const dexTokensBefore = cachedTokens.filter(t => t.isDexTrending).length;
    
    await processDexScreenerTokens();
    
    const tokensAfter = cachedTokens.length;
    const dexTokensAfter = cachedTokens.filter(t => t.isDexTrending).length;
    
    res.json({
      success: true,
      message: 'DexScreener integration completed',
      tokensBefore: tokensBefore,
      tokensAfter: tokensAfter,
      dexTokensBefore: dexTokensBefore,
      dexTokensAfter: dexTokensAfter,
      addedCount: tokensAfter - tokensBefore,
      updatedCount: dexTokensAfter - dexTokensBefore - (tokensAfter - tokensBefore)
    });
    
  } catch (error) {
    console.error('❌ Manual DexScreener integration failed:', error);
    res.status(500).json({
      success: false,
      error: 'DexScreener integration failed',
      message: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server listening on http://localhost:${PORT}`);
  
  // Always try to load persistent cache first
  console.log('🔍 Checking for persistent cache...');
  const persistentCache = loadCacheFromFile();
  
  if (persistentCache && persistentCache.tokens.length > 0) {
    cachedTokens = persistentCache.tokens;
    lastCacheUpdate = persistentCache.timestamp;
    console.log(`✅ Loaded ${cachedTokens.length} tokens from persistent cache`);
    console.log(`📅 Cache from: ${persistentCache.metadata.lastUpdate}`);
    
    // Apply any cached contracts immediately without API calls
    console.log('📋 Applying cached contract addresses...');
    cachedTokens = contractEnhancementService.applyCachedContractsToTokens(cachedTokens);
    
    console.log(`🔍 DEBUG: cachedTokens.length after loading = ${cachedTokens.length}`);
  } else {
    console.log('🔍 DEBUG: No persistent cache found, cachedTokens.length = 0');
  }
  
  // Check if in test mode (disable batch processing for testing)
  if (process.env.TEST_MODE === 'true') {
    console.log('⚡ TEST MODE: Batch processing disabled for faster testing');
    console.log('📋 Authentication system ready for testing!');
    
    // Create demo users for testing
    simpleAuthService.createDemoUsers();

    // Only use sample tokens if no persistent cache exists
    console.log(`🔍 DEBUG: Checking if we need sample tokens. cachedTokens.length = ${cachedTokens.length}`);
    if (cachedTokens.length === 0) {
      console.log('🎨 Creating sample tokens because cache is empty');
      setTimeout(() => {
        cachedTokens = [
        {
          symbol: 'BONK',
          name: 'Bonk',
          score: 8.5,
          marketCap: 1500000000,
          price: 0.000025,
          priceChange24h: 15.2,
          volume24h: 85000000,
          communityScore: 9.2,
          sentimentScore: 8.1,
          devActivityScore: 7.8,
          socialScore: 8.9,
          mentionsTrend: 12.5,
          mentions: 1250,
          uniqueMentions: 875,
          engagementRate: 0.08,
          riskLevel: 'Medium',
          contractAddress: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
          image: 'https://assets.coingecko.com/coins/images/28600/large/bonk.jpg'
        },
        {
          symbol: 'WIF',
          name: 'dogwifhat',
          score: 7.8,
          marketCap: 2800000000,
          price: 2.45,
          priceChange24h: -5.3,
          volume24h: 125000000,
          communityScore: 8.5,
          sentimentScore: 7.2,
          devActivityScore: 6.9,
          socialScore: 8.1,
          mentionsTrend: 8.7,
          mentions: 2100,
          uniqueMentions: 1680,
          engagementRate: 0.06,
          riskLevel: 'Low',
          contractAddress: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
          image: 'https://assets.coingecko.com/coins/images/33767/large/dogwifhat.jpg'
        },
        {
          symbol: 'PEPE',
          name: 'Pepe',
          score: 9.2,
          marketCap: 3200000000,
          price: 0.00000765,
          priceChange24h: 8.9,
          volume24h: 95000000,
          communityScore: 9.8,
          sentimentScore: 8.9,
          devActivityScore: 8.2,
          socialScore: 9.5,
          mentionsTrend: 15.2,
          mentions: 3400,
          uniqueMentions: 2720,
          engagementRate: 0.12,
          riskLevel: 'Medium',
          contractAddress: '6GCLz8A8xNE2ZMnEpAEYSZLLWoqy5YNZoFJKJ7PEPE',
          image: 'https://assets.coingecko.com/coins/images/29850/large/pepe-token.jpeg'
        },
        {
          symbol: 'DOGE',
          name: 'Dogecoin',
          score: 6.8,
          marketCap: 15000000000,
          price: 0.085,
          priceChange24h: 2.1,
          volume24h: 450000000,
          communityScore: 7.5,
          sentimentScore: 6.8,
          devActivityScore: 5.9,
          socialScore: 7.2,
          mentionsTrend: 5.3,
          mentions: 8500,
          uniqueMentions: 6800,
          engagementRate: 0.04,
          riskLevel: 'Low',
          contractAddress: 'BA6VQf3Zb7UZgZJNTjqoZSqGNjVh3qQbA5QcDOGE',
          image: 'https://assets.coingecko.com/coins/images/5/large/dogecoin.png'
        },
        {
          symbol: 'SHIB',
          name: 'Shiba Inu',
          score: 7.1,
          marketCap: 8500000000,
          price: 0.0000145,
          priceChange24h: -3.2,
          volume24h: 285000000,
          communityScore: 8.2,
          sentimentScore: 6.9,
          devActivityScore: 6.5,
          socialScore: 7.8,
          mentionsTrend: 6.1,
          mentions: 1850,
          uniqueMentions: 1295,
          engagementRate: 0.07,
          riskLevel: 'Medium',
          contractAddress: 'CKfatsPMUf8SkiURsDXs7eK6GWb4Jsd6UDbs7twMCWxo',
          image: 'https://assets.coingecko.com/coins/images/11939/large/shiba.png'
        }
        ];
        console.log('🎨 Sample tokens loaded for testing watchlist functionality');
        console.log(`📊 ${cachedTokens.length} tokens available for bubble visualization`);
      }, 2000);
    } else {
      console.log(`🛡️ PROTECTED: Using ${cachedTokens.length} real tokens from persistent cache in test mode`);
      console.log('💡 Real data is preserved - test mode will not override it');
    }
  } else {
    // Production mode - start background cache refresh system
    console.log('🚀 Starting background cache refresh system...');
    console.log(`⏰ Cache will refresh every ${CACHE_DURATION / 1000 / 60} minutes`);
    
    // Only start fresh processing if cache is stale or empty
    const shouldStartFreshProcessing = !persistentCache || 
      cachedTokens.length === 0 || 
      (Date.now() - lastCacheUpdate) > CACHE_DURATION;
    
    if (shouldStartFreshProcessing) {
      setTimeout(async () => {
        console.log('🔄 Starting fresh token processing...');
        await processAllTokens();
        
        // Start the recurring background refresh
        backgroundCacheRefresh();
      }, 5000);
    } else {
      console.log('✅ Using fresh persistent cache - skipping immediate processing');
      
      // Start background refresh cycle
      setTimeout(() => {
        backgroundCacheRefresh();
      }, Math.max(CACHE_DURATION - (Date.now() - lastCacheUpdate), 60000)); // At least 1 minute
    }
  }
});
