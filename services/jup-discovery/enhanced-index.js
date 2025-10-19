import axios from 'axios';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

// Import AI Router modules
import LSTRegistryService from './modules/lst-registry/LSTRegistryService.js';
import PortfolioAnalyzerService from './modules/portfolio-analyzer/PortfolioAnalyzerService.js';
import AIStrategyEngineService from './modules/ai-strategy-engine/AIStrategyEngineService.js';
import TransactionBuilderService from './modules/transaction-builder/TransactionBuilderService.js';

// Load environment variables
dotenv.config();

const API_BASE = process.env.API_BASE || 'https://api.degen-oracle.com';
const JUPITER_API_KEY = process.env.JUPITER_API_KEY || '';
const INTERNAL_TOKEN = process.env.INTERNAL_TOKEN || process.env.DISCOVERY_INTERNAL_TOKEN;
const INTERVAL_MS = parseInt(process.env.DISCOVERY_INTERVAL_MS || '21600000', 10); // 6 hours default
const RUN_ON_START = (process.env.DISCOVERY_RUN_ON_START || 'true') === 'true';

const FORCE_LITE_API = (process.env.FORCE_LITE_API || 'true') === 'true';
const JUP_BASE = process.env.JUP_BASE || (FORCE_LITE_API ? 'https://lite-api.jup.ag/tokens/v2' : (JUPITER_API_KEY ? 'https://api.jup.ag/tokens/v2' : 'https://lite-api.jup.ag/tokens/v2'));
const SEARCHES = [
  { key: 'JupTrending6h', category: 'toptrending', interval: '6h' },
  { key: 'JupOrganic6h', category: 'toporganicscore', interval: '6h' },
  { key: 'JupTraded6h', category: 'toptraded', interval: '6h' }
];

const STABLE_SYMBOLS = new Set(['SOL', 'JUP', 'WETH', 'WSOL', 'WBTC', 'USDC']);
const DISCOVERY_LIMIT = parseInt(process.env.DISCOVERY_LIMIT || '20', 10);
let roundRobinIndex = 0;

function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

/**
 * Enhanced Jupiter Discovery Service
 * 
 * This service combines:
 * 1. Existing trending token discovery (sends to enhancedBackend)
 * 2. New AI Liquid Staking Router functionality
 * 3. HTTP API endpoints for AI Router services
 */
class EnhancedJupiterDiscoveryService {
  constructor() {
    this.app = express();
    this.port = process.env.PORT || 3000;
    
    // Initialize AI Router services
    this.lstRegistryService = new LSTRegistryService();
    this.portfolioAnalyzerService = new PortfolioAnalyzerService();
    this.aiStrategyEngineService = new AIStrategyEngineService();
    this.transactionBuilderService = new TransactionBuilderService();
    
    this.setupMiddleware();
    this.setupRoutes();
  }

  /**
   * Setup Express middleware
   */
  setupMiddleware() {
    // CORS configuration
    this.app.use(cors({
      origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-PAYMENT', 'X-Internal-Token']
    }));

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Internal token authentication middleware
    this.app.use((req, res, next) => {
      // Skip authentication for health checks and public endpoints
      if (req.path === '/health' || req.path === '/' || req.path.startsWith('/api/lsts') || req.path.startsWith('/api/portfolio')) {
        return next();
      }
      
      // Check for internal token for protected endpoints
      const authHeader = req.headers.authorization;
      const internalTokenHeader = req.headers['x-internal-token'];
      const internalToken = process.env.INTERNAL_TOKEN;
      
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        if (token === internalToken) {
          console.log(`🔐 [Enhanced Jupiter Discovery] Internal request authenticated: ${req.method} ${req.path}`);
          return next();
        }
      }
      
      if (internalTokenHeader && internalTokenHeader === internalToken) {
        console.log(`🔐 [Enhanced Jupiter Discovery] Internal token authenticated: ${req.method} ${req.path}`);
        return next();
      }
      
      // For protected endpoints, require authentication
      if (req.path.startsWith('/api/strategy') || req.path.startsWith('/api/transactions')) {
        console.log(`🔒 [Enhanced Jupiter Discovery] Unauthorized request: ${req.method} ${req.path}`);
        return res.status(401).json({
          success: false,
          error: 'Unauthorized - Internal token required'
        });
      }
      
      next();
    });

    // Request logging
    this.app.use((req, res, next) => {
      console.log(`🔍 [Enhanced Jupiter Discovery] ${req.method} ${req.path} - ${new Date().toISOString()}`);
      next();
    });

    // Error handling middleware
    this.app.use((error, req, res, next) => {
      console.error('❌ [Enhanced Jupiter Discovery] Error:', error.message);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message
      });
    });
  }

  /**
   * Setup API routes
   */
  setupRoutes() {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        service: 'Enhanced Jupiter Discovery',
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '2.0.0',
        modules: {
          trendingDiscovery: 'active',
          lstRegistry: 'active',
          portfolioAnalyzer: 'active',
          aiStrategyEngine: 'active',
          transactionBuilder: 'active'
        }
      });
    });

    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        service: 'Enhanced Jupiter Discovery Service',
        description: 'Combined trending token discovery + AI Liquid Staking Router',
        version: '2.0.0',
        modules: {
          trendingDiscovery: {
            description: 'Discovers trending tokens from Jupiter API',
            status: 'active'
          },
          lstRegistry: {
            description: 'LST token data and APRs',
            endpoints: '/api/lsts'
          },
          portfolioAnalyzer: {
            description: 'Wallet portfolio analysis',
            endpoints: '/api/portfolio'
          },
          aiStrategyEngine: {
            description: 'AI-powered strategy generation',
            endpoints: '/api/strategy'
          },
          transactionBuilder: {
            description: 'Transaction building and execution',
            endpoints: '/api/transactions'
          }
        },
        documentation: 'https://docs.degen-oracle.com/jupiter-discovery'
      });
    });

    // LST Registry routes
    this.app.use('/api/lsts', this.lstRegistryService.getRouter());
    
    // Portfolio Analyzer routes
    this.app.use('/api/portfolio', this.portfolioAnalyzerService.getRouter());
    
    // AI Strategy Engine routes
    this.app.use('/api/strategy', this.aiStrategyEngineService.getRouter());
    
    // Transaction Builder routes
    this.app.use('/api/transactions', this.transactionBuilderService.getRouter());

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        path: req.originalUrl,
        availableModules: ['/api/lsts', '/api/portfolio', '/api/strategy', '/api/transactions']
      });
    });
  }

  /**
   * Connect to MongoDB
   */
  async connectToDatabase() {
    try {
      if (process.env.MONGODB_URI) {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ [Enhanced Jupiter Discovery] MongoDB connected');
      } else {
        console.log('⚠️ [Enhanced Jupiter Discovery] MongoDB URI not provided, skipping database connection');
      }
    } catch (error) {
      console.error('❌ [Enhanced Jupiter Discovery] MongoDB connection failed:', error.message);
      // Don't exit - service can work without database for some features
    }
  }

  /**
   * Initialize all services
   */
  async initialize() {
    try {
      console.log('🚀 [Enhanced Jupiter Discovery] Initializing enhanced service...');
      
      // Connect to database
      await this.connectToDatabase();
      
      // Initialize all AI Router services
      await this.lstRegistryService.initialize();
      await this.portfolioAnalyzerService.initialize();
      await this.aiStrategyEngineService.initialize();
      await this.transactionBuilderService.initialize();
      
      console.log('✅ [Enhanced Jupiter Discovery] All modules initialized');
    } catch (error) {
      console.error('❌ [Enhanced Jupiter Discovery] Initialization failed:', error.message);
      throw error;
    }
  }

  /**
   * Start the service
   */
  async start() {
    try {
      console.log('🚀 [Enhanced Jupiter Discovery] Starting enhanced service...');
      
      // Initialize all services
      await this.initialize();
      
      // Start the HTTP server
      this.server = this.app.listen(this.port, () => {
        console.log(`✅ [Enhanced Jupiter Discovery] HTTP API started on port ${this.port}`);
        console.log(`📡 [Enhanced Jupiter Discovery] Health check: http://localhost:${this.port}/health`);
        console.log(`🔍 [Enhanced Jupiter Discovery] LST Registry: http://localhost:${this.port}/api/lsts`);
        console.log(`📊 [Enhanced Jupiter Discovery] Portfolio Analyzer: http://localhost:${this.port}/api/portfolio`);
        console.log(`🧠 [Enhanced Jupiter Discovery] AI Strategy Engine: http://localhost:${this.port}/api/strategy`);
        console.log(`🔨 [Enhanced Jupiter Discovery] Transaction Builder: http://localhost:${this.port}/api/transactions`);
      });

      // Start trending token discovery (existing functionality)
      if (RUN_ON_START) {
        console.log('🔍 [Enhanced Jupiter Discovery] Starting trending token discovery...');
        await this.runTrendingDiscovery();
      }
      
      // Set up recurring trending token discovery
      setInterval(() => this.runTrendingDiscovery(), INTERVAL_MS);

      // Graceful shutdown handling
      process.on('SIGTERM', () => this.shutdown());
      process.on('SIGINT', () => this.shutdown());

    } catch (error) {
      console.error('❌ [Enhanced Jupiter Discovery] Failed to start service:', error.message);
      process.exit(1);
    }
  }

  /**
   * Shutdown the service gracefully
   */
  async shutdown() {
    try {
      console.log('🔄 [Enhanced Jupiter Discovery] Shutting down service...');
      
      // Close server
      if (this.server) {
        this.server.close();
      }
      
      // Close database connection
      if (mongoose.connection.readyState === 1) {
        await mongoose.connection.close();
        console.log('✅ [Enhanced Jupiter Discovery] MongoDB connection closed');
      }
      
      console.log('✅ [Enhanced Jupiter Discovery] Service shutdown complete');
      process.exit(0);
    } catch (error) {
      console.error('❌ [Enhanced Jupiter Discovery] Shutdown error:', error.message);
      process.exit(1);
    }
  }

  // ========================================
  // EXISTING TRENDING TOKEN DISCOVERY
  // ========================================

  async fetchJupiterCategory(category, interval, attempt = 1) {
    const url = `${JUP_BASE}/${encodeURIComponent(category)}/${encodeURIComponent(interval)}`;
    try {
      const res = await axios.get(url, {
        headers: {
          'Accept': 'application/json, text/plain, */*',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36',
          'Cache-Control': 'no-cache',
          'Origin': 'https://jup.ag',
          'Referer': 'https://jup.ag/',
          ...(JUPITER_API_KEY ? { 'Authorization': `Bearer ${JUPITER_API_KEY}` } : {})
        },
        params: { limit: DISCOVERY_LIMIT },
        timeout: 20000,
        validateStatus: s => s >= 200 && s < 500
      });
      if (res.status === 429 || res.status === 503 || res.status === 502) {
        if (attempt === 1) {
          console.warn(`⏸️ ${res.status} on first attempt for ${category}/${interval}. Cooling down 15 minutes...`);
          await sleep(15 * 60 * 1000);
          throw new Error(`HTTP ${res.status}`);
        }
        if (attempt <= 2) {
          const backoff = 10000 * attempt + Math.floor(Math.random() * 5000); // 10s base + jitter
          console.warn(`⏳ ${res.status} from Jupiter for ${category}/${interval}. Retrying in ${backoff}ms (attempt ${attempt}/2)`);
          await sleep(backoff);
          return this.fetchJupiterCategory(category, interval, attempt + 1);
        }
        throw new Error(`HTTP ${res.status}`);
      }
      if (res.status !== 200) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = Array.isArray(res.data) ? res.data : (res.data?.tokens || []);
      return data;
    } catch (e) {
      if (e.message.includes('HTTP 429') || e.message.includes('HTTP 503') || e.message.includes('HTTP 502')) {
        // Already cooled down or retried above
        throw e;
      }
      if (attempt <= 2) {
        const backoff = 10000 * attempt + Math.floor(Math.random() * 5000);
        console.warn(`⏳ Error fetching ${category}/${interval}: ${e.message}. Retrying in ${backoff}ms (attempt ${attempt}/2)`);
        await sleep(backoff);
        return this.fetchJupiterCategory(category, interval, attempt + 1);
      }
      throw e;
    }
  }

  normalizeToken(t) {
    return {
      symbol: (t.symbol || '').toUpperCase(),
      name: t.name || t.symbol || 'Unknown',
      contractAddress: t.id || t.contractAddress || t.address || t.mint || null,
      price: t.usdPrice ?? t.price ?? t.uiPrice ?? t.currentPrice ?? t.priceUsd ?? null,
      mcap: t.mcap ?? t.marketCap ?? null,
      liquidity: t.liquidity ?? t.liq ?? null,
      volume1h: t.volume1h ?? (t.volume && (t.volume['1h'] || t.volume.h1)) ?? null,
      trades1h: t.trades1h ?? (t.trades && (t.trades['1h'] || t.trades.h1)) ?? null,
      change1hPct: t.change1hPct ?? (t.priceChange && (t.priceChange['1h'] || t.priceChange.h1)) ?? null,
      holders: t.holders ?? t.holderCount ?? null,
      graduatedAt: t.graduatedAt || t.graduated_at || null
    };
  }

  filterCandidates(list) {
    const out = [];
    for (const t of list) {
      const n = this.normalizeToken(t);
      if (!n.contractAddress || n.contractAddress.length < 10) continue;
      if (!n.symbol || STABLE_SYMBOLS.has(n.symbol)) continue;
      
      // 🚀 FILTER: Only include tokens with launchpad present
      if (!t.launchpad) {
        continue;
      }
      
      // 🎓 FILTER: Only include tokens that have graduated (graduatedAt present)
      if (!n.graduatedAt) {
        continue;
      }
      
      // 🌱 FILTER: Only include tokens with organic score > 0
      const organicScore = t.organicScore ?? t.organic_score ?? t.organicScoreValue ?? 0;
      
      if (!organicScore || organicScore <= 0) {
        continue;
      }
      
      out.push({ ...n });
    }
    return out.slice(0, 100);
  }

  dedupeByAddress(tokens) {
    const seen = new Set();
    const out = [];
    for (const t of tokens) {
      const key = (t.contractAddress || t.address || t.mint || '').toLowerCase();
      if (!key || key.length < 10) continue;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(t);
    }
    return out;
  }

  async importToBackend({ source, category, interval, tokens }) {
    if (!INTERNAL_TOKEN) {
      console.warn('⚠️ No INTERNAL_TOKEN set; skipping import');
      return { success: false, error: 'No token' };
    }
    const url = `${API_BASE}/api/internal/discovery/import`;
    const res = await axios.post(url, { source, category, interval, tokens }, {
      headers: { 'Content-Type': 'application/json', 'X-Internal-Token': INTERNAL_TOKEN },
      timeout: 20000
    });
    return res.data;
  }

  async runTrendingDiscovery() {
    const startedAt = new Date();
    let totalFetched = 0;
    let totalCandidates = 0;
    let totalImported = 0;
    let totalBoosted = 0;
    
    // Cross-category deduplication to prevent same token from multiple categories
    const globalSeenTokens = new Set();

    // Track specific tokens we're looking for
    const targetTokens = [
      'HyvavV2Cs387fCEHv6CELe7RZ1NnHT8ADSsBZwS3XTML',
      '9SkYDKwdYDF4cRCgKVivBne8u8RoAV9RycsrL69D1s2X',
      'B1NYxvHT9XM11zLRKWykUApLev2a5Uo6sT8ykFKSzDd3',
      '4QTAvmonFdYBsC797WWkQLPr67pfBGy4ia3arnt9SEd1',
      'EMZGT8niJdNcNrSFHXExUrGKvAuVQ2KWi1oyrY4XMnH6'
    ];

    // aggressive jitter 30-90s to avoid backend collisions
    const jitter = 30000 + Math.floor(Math.random() * 60000);
    await sleep(jitter);

    for (let i = 0; i < SEARCHES.length; i++) {
      const s = SEARCHES[i];
      try {
        console.log(`🔍 [${s.key}] Fetching ${s.category}/${s.interval}...`);
        const raw = await this.fetchJupiterCategory(s.category, s.interval);
        const fetched = Array.isArray(raw) ? raw.length : 0;
        totalFetched += fetched;
        
        console.log(`📊 [${s.key}] Raw tokens fetched: ${fetched}`);
        
        // Check if any target tokens are in the raw data
        const foundTargets = raw.filter(t => {
          const addr = t.id || t.contractAddress || t.address || t.mint;
          return targetTokens.includes(addr);
        });
        
        if (foundTargets.length > 0) {
          console.log(`🎯 [${s.key}] FOUND TARGET TOKENS in raw data:`, foundTargets.map(t => ({
            symbol: t.symbol,
            address: t.id || t.contractAddress || t.address || t.mint,
            launchpad: t.launchpad,
            graduatedAt: t.graduatedAt || t.graduated_at,
            organicScore: t.organicScore || t.organic_score || t.organicScoreValue
          })));
        }
        
        const filtered = this.filterCandidates(raw);
        const candidates = filtered.length;
        totalCandidates += candidates;
        
        // Check if any target tokens made it through filtering
        const filteredTargets = filtered.filter(t => targetTokens.includes(t.contractAddress));
        if (filteredTargets.length > 0) {
          console.log(`🚨 [${s.key}] TARGET TOKENS PASSED FILTERS:`, filteredTargets.map(t => ({
            symbol: t.symbol,
            address: t.contractAddress,
            launchpad: 'N/A (filtered)',
            graduatedAt: t.graduatedAt,
            organicScore: 'N/A (filtered)'
          })));
        }
        
        const deduped = this.dedupeByAddress(filtered);
        console.log(`📊 [${s.key}] After deduplication: ${deduped.length} tokens`);
        
        // Cross-category deduplication: filter out tokens already seen in this run
        const crossCategoryFiltered = deduped.filter(t => {
          const key = (t.contractAddress || t.address || t.mint || '').toLowerCase();
          if (globalSeenTokens.has(key)) {
            console.log(`🔄 [${s.key}] Skipping duplicate token across categories: ${t.symbol} (${key})`);
            return false;
          }
          globalSeenTokens.add(key);
          return true;
        });
        
        console.log(`📊 [${s.key}] After cross-category deduplication: ${crossCategoryFiltered.length} tokens`);
        
        // Check if any target tokens made it to final import
        const finalTargets = crossCategoryFiltered.filter(t => targetTokens.includes(t.contractAddress));
        if (finalTargets.length > 0) {
          console.log(`🚀 [${s.key}] TARGET TOKENS BEING IMPORTED:`, finalTargets.map(t => ({
            symbol: t.symbol,
            address: t.contractAddress,
            source: 'jup-discovery',
            category: s.category,
            interval: s.interval
          })));
        }
        
        const result = await this.importToBackend({ source: 'jup-discovery', category: s.category, interval: s.interval, tokens: crossCategoryFiltered });
        if (result?.success) {
          const imported = (result.stats?.inserted || 0) + (result.stats?.updated || 0);
          const boosted = (result.stats?.boosted || 0);
          totalImported += imported;
          totalBoosted += boosted;
          console.log(`✅ Imported ${imported} (updated ${result.stats?.updated || 0}), boosted ${boosted} for ${s.key}`);
        } else {
          console.warn(`⚠️ Import failed for ${s.key}:`, result?.error || 'unknown');
        }
      } catch (e) {
        console.error(`❌ Discovery error for ${s.key}:`, e.message);
      }

      // Wait 15 minutes between categories, except after the last one
      if (i < SEARCHES.length - 1) {
        console.log('⏳ Waiting 15 minutes before next category...');
        await sleep(15 * 60 * 1000);
      }
    }

    console.log(`🎯 Discovery cycle completed in ${((Date.now() - startedAt.getTime())/1000).toFixed(1)}s: fetched=${totalFetched}, candidates=${totalCandidates}, imported=${totalImported}, boosted=${totalBoosted}`);
    console.log('⏳ Sleeping 6 hours before next cycle...');
  }
}

// Start the service if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const service = new EnhancedJupiterDiscoveryService();
  service.start().catch(error => {
    console.error('❌ [Enhanced Jupiter Discovery] Service failed to start:', error.message);
    process.exit(1);
  });
}

export default EnhancedJupiterDiscoveryService;
