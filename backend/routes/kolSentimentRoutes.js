/**
 * KOL Sentiment Dashboard API Routes
 * 
 * Provides endpoints for the KOL Alpha Dashboard
 * Route: /api/kolsentiment/*
 */

import express from 'express';
import KOLMarketLearningService from '../services/KOLMarketLearningService.js';

const router = express.Router();
let kolLearningService = null;

// Initialize service
const initializeService = async () => {
  if (!kolLearningService) {
    kolLearningService = new KOLMarketLearningService();
    await kolLearningService.initialize();
  }
  return kolLearningService;
};

/**
 * GET /api/kolsentiment/dashboard
 * Main dashboard data endpoint
 */
router.get('/dashboard', async (req, res) => {
  try {
    const service = await initializeService();
    const { window = '24h' } = req.query;
    
    const windowHours = window === '7d' ? 168 : 24; // 7 days or 24 hours
    const data = await service.getDashboardData(windowHours);
    
    if (!data) {
      return res.status(500).json({
        success: false,
        error: 'Failed to generate dashboard data'
      });
    }
    
    res.json({
      success: true,
      data: data
    });
    
  } catch (error) {
    console.error('❌ [KOL SENTIMENT API] Dashboard error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/kolsentiment/heatmap
 * KOL × Coin heatmap data
 */
router.get('/heatmap', async (req, res) => {
  try {
    const service = await initializeService();
    const { window = '24h', coins = '' } = req.query;
    
    const windowHours = window === '7d' ? 168 : 24;
    const selectedCoins = coins ? coins.split(',').map(c => c.trim().toUpperCase()) : [];
    
    const dashboardData = await service.getDashboardData(windowHours);
    
    let heatmapData = dashboardData.heatmap;
    
    // Filter by selected coins if provided
    if (selectedCoins.length > 0) {
      heatmapData = heatmapData.filter(item => selectedCoins.includes(item.coin));
    }
    
    res.json({
      success: true,
      data: {
        heatmap: heatmapData,
        window_hours: windowHours,
        total_entries: heatmapData.length
      }
    });
    
  } catch (error) {
    console.error('❌ [KOL SENTIMENT API] Heatmap error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/kolsentiment/momentum
 * Momentum board data (top rising coins)
 */
router.get('/momentum', async (req, res) => {
  try {
    const service = await initializeService();
    const { window = '24h', limit = 10 } = req.query;
    
    const windowHours = window === '7d' ? 168 : 24;
    const dashboardData = await service.getDashboardData(windowHours);
    
    const momentumData = dashboardData.momentum.slice(0, parseInt(limit));
    
    res.json({
      success: true,
      data: {
        momentum: momentumData,
        window_hours: windowHours,
        total_coins: momentumData.length
      }
    });
    
  } catch (error) {
    console.error('❌ [KOL SENTIMENT API] Momentum error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/kolsentiment/leaderboard
 * KOL reliability leaderboard
 */
router.get('/leaderboard', async (req, res) => {
  try {
    const service = await initializeService();
    const { window = '24h', limit = 10 } = req.query;
    
    const windowHours = window === '7d' ? 168 : 24;
    const dashboardData = await service.getDashboardData(windowHours);
    
    const leaderboardData = dashboardData.leaderboard.slice(0, parseInt(limit));
    
    res.json({
      success: true,
      data: {
        leaderboard: leaderboardData,
        window_hours: windowHours,
        total_kols: leaderboardData.length
      }
    });
    
  } catch (error) {
    console.error('❌ [KOL SENTIMENT API] Leaderboard error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/kolsentiment/signals
 * Alpha signals and alerts
 */
router.get('/signals', async (req, res) => {
  try {
    const service = await initializeService();
    const { window = '24h', limit = 50 } = req.query;
    
    const windowHours = window === '7d' ? 168 : 24;
    const dashboardData = await service.getDashboardData(windowHours);
    
    const signalsData = dashboardData.signals.slice(0, parseInt(limit));
    
    res.json({
      success: true,
      data: {
        signals: signalsData,
        window_hours: windowHours,
        total_signals: signalsData.length
      }
    });
    
  } catch (error) {
    console.error('❌ [KOL SENTIMENT API] Signals error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/kolsentiment/coin/:symbol
 * Detailed coin analysis
 */
router.get('/coin/:symbol', async (req, res) => {
  try {
    const service = await initializeService();
    const { symbol } = req.params;
    const { window = '24h' } = req.query;
    
    const windowHours = window === '7d' ? 168 : 24;
    const cutoffTime = new Date(Date.now() - windowHours * 60 * 60 * 1000);
    
    // Filter posts for this coin
    const coinPosts = service.posts.filter(post => {
      return post.coins.includes(symbol.toUpperCase()) && 
             new Date(post.timestamp) >= cutoffTime;
    });
    
    // Analyze coin activity
    const coinAnalysis = {
      symbol: symbol.toUpperCase(),
      window_hours: windowHours,
      total_mentions: coinPosts.length,
      unique_kols: new Set(coinPosts.map(p => p.kol_handle)).size,
      avg_stance: coinPosts.length > 0 ? 
        coinPosts.reduce((sum, p) => sum + p.stance, 0) / coinPosts.length : 0,
      total_engagement: coinPosts.reduce((sum, p) => 
        sum + p.engagement.likes + p.engagement.retweets + p.engagement.replies, 0),
      kol_breakdown: {},
      timeline: [],
      narratives: new Set()
    };
    
    // KOL breakdown
    for (const post of coinPosts) {
      const kol = post.kol_handle;
      if (!coinAnalysis.kol_breakdown[kol]) {
        coinAnalysis.kol_breakdown[kol] = {
          mentions: 0,
          avg_stance: 0,
          total_engagement: 0,
          posts: []
        };
      }
      
      coinAnalysis.kol_breakdown[kol].mentions += 1;
      coinAnalysis.kol_breakdown[kol].total_engagement += 
        post.engagement.likes + post.engagement.retweets + post.engagement.replies;
      coinAnalysis.kol_breakdown[kol].posts.push({
        timestamp: post.timestamp,
        text: post.text,
        stance: post.stance,
        engagement: post.engagement
      });
      
      // Collect narratives
      post.narratives.forEach(narrative => coinAnalysis.narratives.add(narrative));
    }
    
    // Calculate average stance per KOL
    for (const [kol, data] of Object.entries(coinAnalysis.kol_breakdown)) {
      data.avg_stance = data.posts.reduce((sum, p) => sum + p.stance, 0) / data.posts.length;
    }
    
    // Create timeline
    coinAnalysis.timeline = coinPosts
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
      .map(post => ({
        timestamp: post.timestamp,
        kol: post.kol_handle,
        stance: post.stance,
        engagement: post.engagement.likes + post.engagement.retweets,
        text: post.text
      }));
    
    coinAnalysis.narratives = Array.from(coinAnalysis.narratives);
    
    res.json({
      success: true,
      data: coinAnalysis
    });
    
  } catch (error) {
    console.error(`❌ [KOL SENTIMENT API] Coin analysis error for ${req.params.symbol}:`, error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/kolsentiment/kol/:handle
 * Detailed KOL analysis
 */
router.get('/kol/:handle', async (req, res) => {
  try {
    const service = await initializeService();
    const { handle } = req.params;
    const { window = '24h' } = req.query;
    
    const windowHours = window === '7d' ? 168 : 24;
    const cutoffTime = new Date(Date.now() - windowHours * 60 * 60 * 1000);
    
    // Filter posts for this KOL
    const kolPosts = service.posts.filter(post => {
      return post.kol_handle.toLowerCase() === handle.toLowerCase() && 
             new Date(post.timestamp) >= cutoffTime;
    });
    
    // Get KOL data
    const kolData = service.kols.get(handle.toLowerCase());
    
    // Analyze KOL activity
    const kolAnalysis = {
      handle: handle,
      kol_data: kolData,
      window_hours: windowHours,
      total_posts: kolPosts.length,
      coins_mentioned: new Set(),
      narratives_mentioned: new Set(),
      avg_stance: kolPosts.length > 0 ? 
        kolPosts.reduce((sum, p) => sum + p.stance, 0) / kolPosts.length : 0,
      total_engagement: kolPosts.reduce((sum, p) => 
        sum + p.engagement.likes + p.engagement.retweets + p.engagement.replies, 0),
      coin_breakdown: {},
      playbook: {
        typical_entry_timing: 'unknown',
        avg_lead_time: 0,
        preferred_chains: [],
        preferred_sectors: [],
        reliability_score: 0
      },
      network: {
        amplifies: [],
        amplified_by: [],
        influence_score: kolData?.influence_score || 0
      }
    };
    
    // Analyze coin mentions
    for (const post of kolPosts) {
      post.coins.forEach(coin => kolAnalysis.coins_mentioned.add(coin));
      post.narratives.forEach(narrative => kolAnalysis.narratives_mentioned.add(narrative));
      
      // Coin breakdown
      for (const coin of post.coins) {
        if (!kolAnalysis.coin_breakdown[coin]) {
          kolAnalysis.coin_breakdown[coin] = {
            mentions: 0,
            avg_stance: 0,
            total_engagement: 0,
            posts: []
          };
        }
        
        kolAnalysis.coin_breakdown[coin].mentions += 1;
        kolAnalysis.coin_breakdown[coin].total_engagement += 
          post.engagement.likes + post.engagement.retweets + post.engagement.replies;
        kolAnalysis.coin_breakdown[coin].posts.push({
          timestamp: post.timestamp,
          stance: post.stance,
          text: post.text,
          engagement: post.engagement
        });
      }
    }
    
    // Calculate average stance per coin
    for (const [coin, data] of Object.entries(kolAnalysis.coin_breakdown)) {
      data.avg_stance = data.posts.reduce((sum, p) => sum + p.stance, 0) / data.posts.length;
    }
    
    kolAnalysis.coins_mentioned = Array.from(kolAnalysis.coins_mentioned);
    kolAnalysis.narratives_mentioned = Array.from(kolAnalysis.narratives_mentioned);
    
    // Analyze network relations
    for (const [relationKey, relation] of service.relations) {
      if (relation.src_kol_id === kolData?.id) {
        kolAnalysis.network.amplifies.push({
          kol_id: relation.dst_kol_id,
          weight: relation.weight,
          mentions_count: relation.mentions_count
        });
      }
      if (relation.dst_kol_id === kolData?.id) {
        kolAnalysis.network.amplified_by.push({
          kol_id: relation.src_kol_id,
          weight: relation.weight,
          mentions_count: relation.mentions_count
        });
      }
    }
    
    res.json({
      success: true,
      data: kolAnalysis
    });
    
  } catch (error) {
    console.error(`❌ [KOL SENTIMENT API] KOL analysis error for ${req.params.handle}:`, error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/kolsentiment/monitor
 * Trigger manual monitoring cycle
 */
router.post('/monitor', async (req, res) => {
  try {
    const service = await initializeService();
    
    console.log('🔍 [KOL SENTIMENT API] Manual monitoring triggered');
    await service.runMonitoring();
    
    res.json({
      success: true,
      message: 'Monitoring cycle completed',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ [KOL SENTIMENT API] Manual monitoring error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/kolsentiment/kols
 * Get all KOLs
 */
router.get('/kols', async (req, res) => {
  try {
    const service = await initializeService();
    
    const kols = Array.from(service.kols.values()).map(kol => ({
      id: kol.id,
      handle: kol.handle,
      influence_score: kol.influence_score,
      segments: kol.segments,
      created_at: kol.created_at,
      last_monitored: kol.last_monitored,
      total_posts: kol.total_posts,
      reliability_score: kol.reliability_score
    }));
    
    res.json({
      success: true,
      data: kols
    });
    
  } catch (error) {
    console.error('❌ [KOL SENTIMENT API] Get KOLs error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/kolsentiment/kols
 * Add a new KOL
 */
router.post('/kols', async (req, res) => {
  try {
    const service = await initializeService();
    const { handle, influence_score = 50, segments = [] } = req.body;
    
    if (!handle) {
      return res.status(400).json({
        success: false,
        error: 'Handle is required'
      });
    }
    
    // Check if KOL already exists
    if (service.kols.has(handle.toLowerCase())) {
      return res.status(409).json({
        success: false,
        error: 'KOL already exists'
      });
    }
    
    // Create new KOL
    const newKOL = {
      id: service.generateId(),
      handle: handle.toLowerCase(),
      influence_score: Math.max(1, Math.min(100, influence_score)),
      segments: Array.isArray(segments) ? segments : [],
      created_at: new Date().toISOString(),
      last_monitored: null,
      total_posts: 0,
      reliability_score: 0
    };
    
    service.kols.set(handle.toLowerCase(), newKOL);
    await service.saveKOLs();
    
    console.log(`✅ [KOL SENTIMENT API] Added new KOL: @${handle}`);
    
    res.json({
      success: true,
      data: newKOL,
      message: `KOL @${handle} added successfully`
    });
    
  } catch (error) {
    console.error('❌ [KOL SENTIMENT API] Add KOL error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PUT /api/kolsentiment/kols/:handle
 * Update a KOL
 */
router.put('/kols/:handle', async (req, res) => {
  try {
    const service = await initializeService();
    const { handle } = req.params;
    const { influence_score, segments } = req.body;
    
    const kol = service.kols.get(handle.toLowerCase());
    if (!kol) {
      return res.status(404).json({
        success: false,
        error: 'KOL not found'
      });
    }
    
    // Update fields
    if (influence_score !== undefined) {
      kol.influence_score = Math.max(1, Math.min(100, influence_score));
    }
    if (segments !== undefined) {
      kol.segments = Array.isArray(segments) ? segments : [];
    }
    
    service.kols.set(handle.toLowerCase(), kol);
    await service.saveKOLs();
    
    console.log(`✅ [KOL SENTIMENT API] Updated KOL: @${handle}`);
    
    res.json({
      success: true,
      data: kol,
      message: `KOL @${handle} updated successfully`
    });
    
  } catch (error) {
    console.error('❌ [KOL SENTIMENT API] Update KOL error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/kolsentiment/kols/:handle
 * Delete a KOL
 */
router.delete('/kols/:handle', async (req, res) => {
  try {
    const service = await initializeService();
    const { handle } = req.params;
    
    // Normalize handle - remove @ if present and convert to lowercase
    const normalizedHandle = handle.startsWith('@') ? handle.toLowerCase() : `@${handle.toLowerCase()}`;
    
    const kol = service.kols.get(normalizedHandle);
    if (!kol) {
      return res.status(404).json({
        success: false,
        error: 'KOL not found'
      });
    }
    
    // Remove KOL
    service.kols.delete(normalizedHandle);
    
    // Remove related posts (optional - you might want to keep historical data)
    // service.posts = service.posts.filter(post => post.kol_handle.toLowerCase() !== handle.toLowerCase());
    
    // Remove relations
    for (const [relationKey, relation] of service.relations) {
      if (relation.src_kol_id === kol.id || relation.dst_kol_id === kol.id) {
        service.relations.delete(relationKey);
      }
    }
    
    await service.saveData();
    
    console.log(`✅ [KOL SENTIMENT API] Deleted KOL: @${handle}`);
    
    res.json({
      success: true,
      message: `KOL @${handle} deleted successfully`
    });
    
  } catch (error) {
    console.error('❌ [KOL SENTIMENT API] Delete KOL error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/kolsentiment/kols
 * Get all KOLs
 */
router.get('/kols', async (req, res) => {
  try {
    const service = await initializeService();
    
    const kols = Array.from(service.kols.values()).map(kol => ({
      id: kol.id,
      handle: kol.handle,
      influence_score: kol.influence_score,
      segments: kol.segments,
      total_posts: kol.total_posts,
      reliability_score: kol.reliability_score,
      last_monitored: kol.last_monitored,
      created_at: kol.created_at
    }));
    
    res.json({
      success: true,
      data: kols,
      total: kols.length
    });
    
  } catch (error) {
    console.error('❌ [KOL SENTIMENT API] Get KOLs error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/kolsentiment/kols
 * Add a new KOL
 */
router.post('/kols', async (req, res) => {
  try {
    const service = await initializeService();
    const { handle, influence_score = 50, segments = [] } = req.body;
    
    if (!handle) {
      return res.status(400).json({
        success: false,
        error: 'Handle is required'
      });
    }
    
    // Clean handle (remove @ if present)
    const cleanHandle = handle.replace('@', '');
    
    // Check if KOL already exists
    if (service.kols.has(cleanHandle)) {
      return res.status(400).json({
        success: false,
        error: 'KOL already exists'
      });
    }
    
    const kol = {
      id: service.generateId(),
      handle: cleanHandle,
      influence_score: Math.max(1, Math.min(100, influence_score)),
      segments: Array.isArray(segments) ? segments : [],
      total_posts: 0,
      reliability_score: 0,
      last_monitored: null,
      created_at: new Date().toISOString()
    };
    
    service.kols.set(cleanHandle, kol);
    
    // Immediately fetch tweets for this new KOL
    console.log(`🚀 [KOL SENTIMENT API] Fetching initial tweets for new KOL: @${cleanHandle}`);
    try {
      await service.monitorKOLAccount(kol);
      console.log(`✅ [KOL SENTIMENT API] Initial tweet fetch completed for @${cleanHandle}`);
    } catch (fetchError) {
      console.warn(`⚠️ [KOL SENTIMENT API] Initial tweet fetch failed for @${cleanHandle}:`, fetchError.message);
      // Don't fail the KOL creation if tweet fetch fails
    }
    
    await service.saveData();
    
    console.log(`✅ [KOL SENTIMENT API] Added new KOL: @${cleanHandle}`);
    
    res.json({
      success: true,
      data: {
        kol: kol,
        message: 'KOL added successfully'
      }
    });
    
  } catch (error) {
    console.error('❌ [KOL SENTIMENT API] Add KOL error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PUT /api/kolsentiment/kols/:handle
 * Update a KOL
 */
router.put('/kols/:handle', async (req, res) => {
  try {
    const service = await initializeService();
    const { handle } = req.params;
    const { influence_score, segments } = req.body;
    
    const cleanHandle = handle.replace('@', '');
    const kol = service.kols.get(cleanHandle);
    
    if (!kol) {
      return res.status(404).json({
        success: false,
        error: 'KOL not found'
      });
    }
    
    if (influence_score !== undefined) {
      kol.influence_score = Math.max(1, Math.min(100, influence_score));
    }
    
    if (segments !== undefined) {
      kol.segments = Array.isArray(segments) ? segments : [];
    }
    
    service.kols.set(cleanHandle, kol);
    await service.saveData();
    
    res.json({
      success: true,
      data: {
        kol: kol,
        message: 'KOL updated successfully'
      }
    });
    
  } catch (error) {
    console.error('❌ [KOL SENTIMENT API] Update KOL error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/kolsentiment/kols/:handle
 * Delete a KOL
 */
router.delete('/kols/:handle', async (req, res) => {
  try {
    const service = await initializeService();
    const { handle } = req.params;
    
    const cleanHandle = handle.replace('@', '');
    const kol = service.kols.get(cleanHandle);
    
    if (!kol) {
      return res.status(404).json({
        success: false,
        error: 'KOL not found'
      });
    }
    
    service.kols.delete(cleanHandle);
    
    // Remove posts from this KOL
    service.posts = service.posts.filter(post => post.kol_handle !== cleanHandle);
    
    await service.saveData();
    
    console.log(`🗑️ [KOL SENTIMENT API] Deleted KOL: @${cleanHandle}`);
    
    res.json({
      success: true,
      data: {
        message: 'KOL deleted successfully'
      }
    });
    
  } catch (error) {
    console.error('❌ [KOL SENTIMENT API] Delete KOL error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/kolsentiment/status
 * Service status and health check
 */
router.get('/status', async (req, res) => {
  try {
    const service = await initializeService();
    
    const status = {
      service_status: 'active',
      total_kols: service.kols.size,
      total_posts: service.posts.length,
      total_signals: service.signals.size,
      last_monitoring_run: service.lastMonitoringRun,
      next_monitoring_due: service.lastMonitoringRun + service.monitoringInterval,
      uptime: process.uptime(),
      memory_usage: process.memoryUsage(),
      timestamp: new Date().toISOString()
    };
    
    res.json({
      success: true,
      data: status
    });
    
  } catch (error) {
    console.error('❌ [KOL SENTIMENT API] Status error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
