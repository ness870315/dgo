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

export default router;
