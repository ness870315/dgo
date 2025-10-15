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

// POST /api/kol/fetch-coin-image/:symbol - Fetch coin image from CoinGecko or Perplexity
router.post('/fetch-coin-image/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    
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
    
    // Try CoinGecko first
    try {
      const response = await fetch(`https://api.coingecko.com/api/v3/coins/${symbol.toLowerCase()}`);
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
      } else if (response.status === 429) {
        console.log(`⚠️ [KOL API] CoinGecko rate limit hit for ${symbol}, trying Perplexity...`);
      }
    } catch (error) {
      console.log(`❌ [KOL API] CoinGecko failed for ${symbol}: ${error.message}`);
    }
    
    // Try Perplexity as fallback
    try {
      const query = `Find the direct logo image URL for ${symbol} cryptocurrency. Look for URLs ending in .png, .jpg, .jpeg, .gif, or .webp. Provide only the direct image URL, not a webpage.`;
      
      const perplexityResponse = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'sonar-pro',
          messages: [
            {
              role: 'user',
              content: query
            }
          ],
          max_tokens: 150
        })
      });
      
      if (perplexityResponse.ok) {
        const data = await perplexityResponse.json();
        if (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) {
          const content = data.choices[0].message.content;
          
          // Try multiple patterns to find direct image URLs
          const patterns = [
            /https?:\/\/[^\s]+\.(png|jpg|jpeg|gif|webp)(\?[^\s]*)?/gi,
            /https?:\/\/[^\s]*\/(?:images|logos|assets)\/[^\s]+\.(png|jpg|jpeg|gif|webp)(\?[^\s]*)?/gi,
            /https?:\/\/[^\s]*coin[^\s]*\.(png|jpg|jpeg|gif|webp)(\?[^\s]*)?/gi
          ];
          
          for (const pattern of patterns) {
            const matches = content.match(pattern);
            if (matches && matches.length > 0) {
              // Take the first match that looks like a direct image URL
              const imageUrl = matches[0];
              console.log(`✅ [KOL API] Found Perplexity image for ${symbol}: ${imageUrl}`);
              
              // Cache the result
              imageCache.set(cacheKey, {
                imageUrl: imageUrl,
                timestamp: Date.now(),
                source: 'perplexity'
              });
              
              return res.json({
                success: true,
                imageUrl: imageUrl,
                source: 'perplexity'
              });
            }
          }
        }
      } else if (perplexityResponse.status === 429) {
        console.log(`⚠️ [KOL API] Perplexity rate limit hit for ${symbol}`);
        return res.json({
          success: false,
          imageUrl: null,
          message: 'Rate limited - please try again later'
        });
      }
    } catch (error) {
      console.log(`❌ [KOL API] Perplexity failed for ${symbol}: ${error.message}`);
    }
    
    console.log(`❌ [KOL API] No image found for ${symbol}`);
    res.json({
      success: false,
      imageUrl: null,
      message: 'No image found'
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

export default router;
