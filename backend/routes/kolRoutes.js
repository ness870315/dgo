/**
 * Simple KOL API Routes
 * 
 * Endpoints:
 * GET /api/kol/kols - Get all KOLs
 * POST /api/kol/kols - Add a new KOL
 * DELETE /api/kol/kols/:handle - Delete a KOL
 * GET /api/kol/posts - Get all posts
 */

import express from 'express';
import KOLService from '../services/KOLService.js';

const router = express.Router();
let kolService = null;

// Initialize service
const initializeService = async () => {
  if (!kolService) {
    kolService = new KOLService();
    await kolService.initialize();
  }
  return kolService;
};

// GET /api/kol/kols - Get all KOLs
router.get('/kols', async (req, res) => {
  try {
    const service = await initializeService();
    const kols = service.getKOLs();
    
    res.json({
      success: true,
      data: kols
    });
  } catch (error) {
    console.error('❌ [KOL API] Get KOLs error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/kol/kols - Add a new KOL
router.post('/kols', async (req, res) => {
  try {
    const service = await initializeService();
    const { handle } = req.body;
    
    if (!handle) {
      return res.status(400).json({
        success: false,
        error: 'Handle is required'
      });
    }
    
    const newKOL = await service.addKOL(handle);
    
    res.json({
      success: true,
      data: newKOL,
      message: `KOL @${newKOL.handle} added successfully`
    });
    
  } catch (error) {
    console.error('❌ [KOL API] Add KOL error:', error.message);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// DELETE /api/kol/kols/:handle - Delete a KOL
router.delete('/kols/:handle', async (req, res) => {
  try {
    const service = await initializeService();
    const { handle } = req.params;
    
    await service.deleteKOL(handle);
    
    res.json({
      success: true,
      message: `KOL @${handle} deleted successfully`
    });
    
  } catch (error) {
    console.error('❌ [KOL API] Delete KOL error:', error.message);
    res.status(404).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/kol/posts - Get all posts
router.get('/posts', async (req, res) => {
  try {
    const service = await initializeService();
    const posts = service.getPosts();
    
    res.json({
      success: true,
      data: posts
    });
  } catch (error) {
    console.error('❌ [KOL API] Get posts error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/kol/reanalyze - Re-analyze all posts
router.post('/reanalyze', async (req, res) => {
  try {
    const service = await initializeService();
    
    console.log(`🔄 [KOL API] Starting re-analysis of ${service.posts.length} posts...`);
    
    let analyzed = 0;
    for (const post of service.posts) {
      // Skip if already has analysis
      if (post.coins && post.sentiment !== undefined) {
        continue;
      }
      
      // Analyze tweet
      const analysis = await service.analyzeTweet(post.text);
      
      // Update post
      post.coins = analysis.coins;
      post.sentiment = analysis.sentiment;
      post.narratives = analysis.narratives;
      
      analyzed++;
      
      if (analysis.coins.length > 0) {
        console.log(`🤖 [KOL API] Analyzed: ${analysis.coins.join(', ')} | Sentiment: ${analysis.sentiment > 0 ? '📈' : analysis.sentiment < 0 ? '📉' : '➡️'}`);
      }
    }
    
    // Save updated posts
    await service.saveData();
    
    console.log(`✅ [KOL API] Re-analysis complete! Analyzed ${analyzed} tweets`);
    
    res.json({
      success: true,
      message: `Re-analyzed ${analyzed} tweets`,
      total_posts: service.posts.length
    });
    
  } catch (error) {
    console.error('❌ [KOL API] Re-analyze error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/kol/enrich - Enrich posts with coin data (logos, prices)
router.post('/enrich', async (req, res) => {
  try {
    const service = await initializeService();
    
    console.log(`💎 [KOL API] Starting coin data enrichment...`);
    
    const coinData = await service.enrichPostsWithCoinData();
    
    res.json({
      success: true,
      message: `Enriched posts with data for ${Object.keys(coinData).length} coins`,
      coin_data: coinData
    });
    
  } catch (error) {
    console.error('❌ [KOL API] Enrich error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/kol/coin-data - Get cached coin data
router.get('/coin-data', async (req, res) => {
  try {
    const service = await initializeService();
    
    // Extract unique coins from posts
    const coinDataMap = {};
    service.posts.forEach(post => {
      if (post.coin_data) {
        Object.entries(post.coin_data).forEach(([coin, data]) => {
          if (!coinDataMap[coin]) {
            coinDataMap[coin] = data;
          }
        });
      }
    });
    
    res.json({
      success: true,
      data: coinDataMap
    });
    
  } catch (error) {
    console.error('❌ [KOL API] Get coin data error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/kol/backfill - Manually trigger price backfill
router.post('/backfill', async (req, res) => {
  try {
    const service = await initializeService();
    
    console.log(`🔄 [KOL API] Manual backfill triggered...`);
    
    const backfilled = await service.backfillPriceData();
    
    res.json({
      success: true,
      message: `Backfilled ${backfilled} price points`,
      backfilled: backfilled
    });
    
  } catch (error) {
    console.error('❌ [KOL API] Backfill error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/kol/test-bundled - Test bundled price fetching approach
router.post('/test-bundled', async (req, res) => {
  try {
    const service = await initializeService();
    const { symbol, timestamps } = req.body;
    
    if (!symbol || !timestamps || !Array.isArray(timestamps)) {
      return res.status(400).json({
        success: false,
        error: 'Missing symbol or timestamps array in request body'
      });
    }
    
    console.log(`🧪 [KOL API] Testing bundled price fetch for ${symbol} with ${timestamps.length} timestamps`);
    
    const startTime = Date.now();
    const bundledPrices = await service.fetchBundledHistoricalPrices(symbol, timestamps);
    const endTime = Date.now();
    
    res.json({
      success: true,
      message: `Bundled fetch completed in ${endTime - startTime}ms`,
      symbol: symbol,
      requestedTimestamps: timestamps.length,
      fetchedPrices: Object.keys(bundledPrices).length,
      prices: bundledPrices,
      performance: {
        duration: endTime - startTime,
        requestsMade: 1, // Single bundled call
        efficiency: `${Object.keys(bundledPrices).length}/${timestamps.length} prices fetched`
      }
    });
    
  } catch (error) {
    console.error('❌ [KOL API] Test bundled error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/kol/migrate-coins - Migrate existing coin data to fix case sensitivity
router.post('/migrate-coins', async (req, res) => {
  try {
    const service = await initializeService();
    
    console.log(`🔄 [KOL API] Starting coin case normalization migration...`);
    
    // Run the normalization method
    const result = await service.normalizeCoinData();
    
    if (result) {
      res.json({
        success: true,
        message: 'Coin case normalization migration completed',
        result: result
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Migration failed - no result returned'
      });
    }
    
  } catch (error) {
    console.error('❌ [KOL API] Migration error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/kol/refetch-all - Re-fetch ALL KOLs to update profile pictures
router.post('/refetch-all', async (req, res) => {
  try {
    const service = await initializeService();
    
    console.log(`🔄 [KOL API] Re-fetching ALL KOLs to update profile pictures...`);
    
    const kols = Array.from(service.kols.values());
    const results = [];
    
    for (const kol of kols) {
      console.log(`🔄 [KOL API] Re-fetching @${kol.handle}...`);
      try {
        await service.fetchKOLTweets(kol.handle);
        results.push({ handle: kol.handle, success: true });
      } catch (error) {
        console.error(`❌ [KOL API] Failed to re-fetch @${kol.handle}:`, error.message);
        results.push({ handle: kol.handle, success: false, error: error.message });
      }
      
      // Wait 2 seconds between KOLs to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    res.json({
      success: true,
      message: `Re-fetched ${kols.length} KOLs`,
      results
    });
    
  } catch (error) {
    console.error('❌ [KOL API] Refetch error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/kol/force-enrich - Force re-enrich coin data (including logos)
router.post('/force-enrich', async (req, res) => {
  try {
    const service = await initializeService();
    
    console.log(`💎 [KOL API] Force re-enriching coin data with logos...`);
    
    // Temporarily remove existing coin_data to force re-enrichment
    service.posts.forEach(post => {
      if (post.coin_data) {
        delete post.coin_data;
      }
    });
    
    const coinData = await service.enrichPostsWithCoinData();
    
    res.json({
      success: true,
      message: `Force enriched ${Object.keys(coinData).length} coins with logos`,
      coin_data: coinData
    });
    
  } catch (error) {
    console.error('❌ [KOL API] Force enrich error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Rate limiting for API calls
let lastApiCall = 0;
const API_CALL_DELAY = 2000; // 2 seconds between calls

// Cache for coin images to prevent repeated API calls
const imageCache = new Map();
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

// Retry tracking for failed image fetches
const failedImageAttempts = new Map(); // symbol -> { attempts: number, lastAttempt: timestamp, blockedUntil: timestamp }
const MAX_ATTEMPTS = 3;
const BLOCK_DURATION = 48 * 60 * 60 * 1000; // 48 hours

// POST /api/kol/fetch-coin-image/:symbol - Fetch coin image from CoinGecko or Perplexity
router.post('/fetch-coin-image/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const symbolKey = symbol.toUpperCase();
    
    // Check if this symbol is currently blocked due to too many failed attempts
    const failedAttempt = failedImageAttempts.get(symbolKey);
    if (failedAttempt) {
      const now = Date.now();
      if (now < failedAttempt.blockedUntil) {
        const remainingTime = Math.round((failedAttempt.blockedUntil - now) / (60 * 60 * 1000)); // hours
        console.log(`🚫 [KOL API] ${symbol} is blocked for ${remainingTime} more hours due to ${failedAttempt.attempts} failed attempts`);
        return res.json({
          success: false,
          imageUrl: null,
          message: `Symbol blocked for ${remainingTime} hours due to repeated failures`,
          blocked: true,
          attempts: failedAttempt.attempts,
          blockedUntil: failedAttempt.blockedUntil
        });
      } else {
        // Block period expired, reset attempts
        console.log(`🔄 [KOL API] Block period expired for ${symbol}, resetting attempts`);
        failedImageAttempts.delete(symbolKey);
      }
    }
    
    // Check cache first
    const cacheKey = symbol.toUpperCase();
    const cached = imageCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
      console.log(`💾 [KOL API] Using cached image for ${symbol}: ${cached.imageUrl}`);
      return res.json({
        success: true,
        imageUrl: cached.imageUrl,
        source: 'cache'
      });
    }
    
    console.log(`🖼️ [KOL API] Fetching image for ${symbol}...`);
    
    // Rate limiting - wait if we called API recently
    const now = Date.now();
    const timeSinceLastCall = now - lastApiCall;
    if (timeSinceLastCall < API_CALL_DELAY) {
      const waitTime = API_CALL_DELAY - timeSinceLastCall;
      console.log(`⏳ [KOL API] Rate limiting: waiting ${waitTime}ms before API call...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    lastApiCall = Date.now();
    
    // Try CoinGecko with symbol mapping
    try {
      // Map common symbols to CoinGecko IDs
      const symbolMapping = {
        'WIF': 'dogwifcoin',
        'TRUMP': 'maga',
        'PEPE': 'pepe',
        'DOGE': 'dogecoin',
        'SHIB': 'shiba-inu',
        'BNB': 'binancecoin',
        'BTC': 'bitcoin',
        'ETH': 'ethereum',
        'SOL': 'solana',
        'USDC': 'usd-coin',
        'USDT': 'tether',
        'BONK': 'bonk',
        'POPCAT': 'popcat',
        'PNUT': 'peanut-the-squirrel',
        'CAT': 'cat',
        'ATOM': 'cosmos',
        'SAFEMOON': 'safemoon',
        'FARTCOIN': 'fartcoin',
        'APEX': 'apex-token',
        'ASTER': 'aster-2',
        'SPX6900': 'spx',
        'ZEC': 'zcash'
      };
      
      const coinGeckoId = symbolMapping[symbol.toUpperCase()] || symbol.toLowerCase();
      console.log(`🔍 [KOL API] Trying CoinGecko with ID: ${coinGeckoId} for symbol: ${symbol}`);
      
      const response = await fetch(`https://api.coingecko.com/api/v3/coins/${coinGeckoId}`);
      if (response.ok) {
        const data = await response.json();
        if (data.image && data.image.large) {
          console.log(`✅ [KOL API] Found CoinGecko image for ${symbol}: ${data.image.large}`);
          
          // Cache the result
          imageCache.set(cacheKey, {
            imageUrl: data.image.large,
            timestamp: Date.now(),
            source: 'coingecko'
          });
          
          return res.json({
            success: true,
            imageUrl: data.image.large,
            source: 'coingecko'
          });
        }
      } else if (response.status === 404) {
        console.log(`❌ [KOL API] CoinGecko: ${symbol} not found with ID: ${coinGeckoId}`);
      } else if (response.status === 429) {
        console.log(`⚠️ [KOL API] CoinGecko rate limit hit for ${symbol}`);
      }
    } catch (error) {
      console.log(`❌ [KOL API] CoinGecko failed for ${symbol}: ${error.message}`);
    }
    
    // CoinGecko is the only source - no Perplexity fallback
    console.log(`❌ [KOL API] No image found for ${symbol} from CoinGecko`);
    
    // Track failed attempt
    const currentAttempt = failedImageAttempts.get(symbolKey) || { attempts: 0, lastAttempt: 0 };
    currentAttempt.attempts += 1;
    currentAttempt.lastAttempt = Date.now();
    
    if (currentAttempt.attempts >= MAX_ATTEMPTS) {
      currentAttempt.blockedUntil = Date.now() + BLOCK_DURATION;
      console.log(`🚫 [KOL API] ${symbol} has failed ${currentAttempt.attempts} times, blocking for 48 hours`);
    }
    
    failedImageAttempts.set(symbolKey, currentAttempt);
    
    console.log(`❌ [KOL API] No image found for ${symbol} (attempt ${currentAttempt.attempts}/${MAX_ATTEMPTS})`);
    res.json({
      success: false,
      imageUrl: null,
      message: 'No image found',
      attempts: currentAttempt.attempts,
      maxAttempts: MAX_ATTEMPTS,
      willBeBlocked: currentAttempt.attempts >= MAX_ATTEMPTS
    });
    
  } catch (error) {
    console.error(`❌ [KOL API] Error fetching image for ${req.params.symbol}:`, error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/kol/test-ohlcv - Test the new OHLCV APIs
router.post('/test-ohlcv', async (req, res) => {
  try {
    const { symbol } = req.body;
    
    if (!symbol) {
      return res.status(400).json({
        success: false,
        error: 'Symbol is required'
      });
    }
    
    const service = await initializeService();
    
    // Test with a timestamp from 24 hours ago
    const testTimestamp = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    console.log(`🧪 [TEST] Testing OHLCV APIs for ${symbol} at ${testTimestamp.toISOString()}`);
    
    // Test individual price fetch
    const price = await service.fetchHistoricalPrice(symbol, testTimestamp);
    
    // Test bundled price fetch (with multiple timestamps)
    const timestamps = [
      new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
      new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString()
    ];
    
    const bundledPrices = await service.fetchBundledHistoricalPrices(symbol, timestamps);
    
    res.json({
      success: true,
      symbol: symbol,
      testTimestamp: testTimestamp.toISOString(),
      individualPrice: price,
      bundledPrices: bundledPrices,
      message: `Tested OHLCV APIs for ${symbol}`
    });
    
  } catch (error) {
    console.error('❌ [KOL API] Test OHLCV error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get KOL Alpha Scores (Lead-Lag Analysis Results)
router.get('/alpha-scores', async (req, res) => {
  try {
    const alphaScores = kolService.getKOLAlphaScores();
    
    // Convert Map to Object for JSON response
    const alphaScoresObj = {};
    alphaScores.forEach((score, kolHandle) => {
      alphaScoresObj[kolHandle] = {
        alphaScore: score.alphaScore,
        averageCorrelation: score.averageCorrelation,
        averageLeadTime: score.averageLeadTime,
        totalMentions: score.totalMentions,
        successfulPredictions: score.successfulPredictions,
        coinImpacts: Object.fromEntries(score.coinImpacts)
      };
    });
    
    res.json({
      success: true,
      data: alphaScoresObj
    });
    
  } catch (error) {
    console.error(`❌ [KOL API] Error getting alpha scores:`, error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get Coin Timeline Data for Deep-Dive Page
router.get('/coin-timeline/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const symbolUpper = symbol.toUpperCase();
    
    console.log(`📊 [KOL API] Getting timeline data for ${symbolUpper}`);
    
    // Get all mentions of this coin with price data
    const coinMentions = [];
    
    kolService.posts.forEach(post => {
      if (post.coins && post.coins.includes(symbolUpper) && post.coin_data && post.coin_data[symbolUpper]) {
        const coinData = post.coin_data[symbolUpper];
        const mentionTime = new Date(post.timestamp);
        
        coinMentions.push({
          timestamp: post.timestamp,
          mentionTime: mentionTime.toISOString(),
          kolHandle: post.kol_handle,
          sentiment: post.sentiment,
          engagement: post.likes + post.retweets + post.views,
          priceAtMention: coinData.price_at_mention,
          price1hAfter: coinData.price_1h_after,
          price4hAfter: coinData.price_4h_after,
          price24hAfter: coinData.price_24h_after,
          priceChange1h: coinData.price_1h_after ? 
            ((coinData.price_1h_after - coinData.price_at_mention) / coinData.price_at_mention) * 100 : null,
          priceChange4h: coinData.price_4h_after ? 
            ((coinData.price_4h_after - coinData.price_at_mention) / coinData.price_at_mention) * 100 : null,
          priceChange24h: coinData.price_24h_after ? 
            ((coinData.price_24h_after - coinData.price_at_mention) / coinData.price_at_mention) * 100 : null
        });
      }
    });
    
    // Sort by timestamp
    coinMentions.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    
    res.json({
      success: true,
      symbol: symbolUpper,
      data: coinMentions,
      totalMentions: coinMentions.length
    });
    
  } catch (error) {
    console.error(`❌ [KOL API] Error getting coin timeline:`, error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Test TweetAPI v2 posting
router.post('/test-tweetapi-v2', async (req, res) => {
  try {
    const { text } = req.body;
    
    if (!text) {
      return res.status(400).json({
        success: false,
        error: 'Missing text parameter'
      });
    }
    
    console.log(`🧪 [KOL API] Testing TweetAPI v2 posting: "${text}"`);
    
    // Import TweetAPI v2 service dynamically to avoid startup issues
    const TweetAPIV2Service = (await import('../services/TweetAPIV2Service.js')).default;
    const tweetAPI = new TweetAPIV2Service();
    
    // Test connection first
    const connectionTest = await tweetAPI.testConnection();
    if (!connectionTest.success) {
      return res.status(500).json({
        success: false,
        error: `TweetAPI v2 connection failed: ${connectionTest.error}`
      });
    }
    
    // Try to post tweet
    const result = await tweetAPI.createPost(text);
    
    res.json({
      success: result.success,
      data: result,
      connectionTest: connectionTest
    });
    
  } catch (error) {
    console.error(`❌ [KOL API] Error testing TweetAPI v2:`, error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
