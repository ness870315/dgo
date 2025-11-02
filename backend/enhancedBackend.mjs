import express from 'express';
import cors from 'cors';
import axios from 'axios';
import crypto from 'crypto';
import multer from 'multer';
import EnhancedTokenProcessor from './enhancedTokenProcessor.js';
import HelioPaymentService from './helioPaymentService.js';
import OAuthXService from './oauthXService.js';
import fs from 'fs/promises';
import { createWriteStream } from 'fs';
import * as fsSync from 'fs';
import path from 'path';
import HypeSnapshotService from './hypeSnapshotService.js';
import McapSnapshotService from './mcapSnapshotService.js';
import BirdEyeTrendingService from './birdEyeTrendingService.js';
import PriorityQueueService from './priorityQueueService.js';
import LeaderboardScoringEngine from './leaderboardScoringEngine.js';
import EnhancedKOLTrustSystem from './enhancedKOLTrustSystem.js';
import MonthlySnapshotService from './monthlySnapshotService.js';
import SocialContextAI from './socialContextAI_new.js';
import { createBackupIntegration } from './backupIntegration.js';
import HypeTrendAnalysis from './hypeTrendAnalysis.js';
import AIHypePredictionService from './aiHypePredictionService.js';
import CallThesisGenerator from './callThesisGenerator.js';
import MilestoneTracker from './milestoneTracker.js';
import PushNotificationService from './pushNotificationService.js';
import AutomatedTokenCleanup from './automatedTokenCleanup.js';
import HybridPriceService from './services/HybridPriceService.js';
import EnhancedHybridPriceService from './services/EnhancedHybridPriceService.mjs';
import RealTimeTokenMonitor from './services/RealTimeTokenMonitor.mjs';
import TokenCacheWatcher from './services/TokenCacheWatcher.mjs';
import HybridChartService from './services/HybridChartService.js';
import KOLService from './services/KOLService.js';
import BondingTokenValidationService from './services/BondingTokenValidationService.js';
import PreBondingMoralisService from './services/PreBondingMoralisService.js';
import RealTimePriceService from './services/RealTimePriceService.js';
// DISABLED: import EnhancedAnalyticsCacheService from './services/EnhancedAnalyticsCacheService.js';
import logger from './logger.js';
import { fileURLToPath } from 'url';
import { ForecastDebugEndpoint } from './debug-forecast-token.js';
import { CallMilestonesDebugEndpoint } from './debug-call-milestones.js';
import MoralisAIChatService from './services/MoralisAIChatService.js';
import TwitterAutoPostService from './twitterAutoPostService.js';
import DailyTweetService from './dailyTweetService.js';
import TwitterMentionService from './twitterMentionService.js';
import NFTGatedAccessService from './nftGatedAccessService.js';
import EnhancedNFTTraitService from './services/EnhancedNFTTraitService.js';
import DGOOpinionDatabase from './services/DGOOpinionDatabase.js';
// CryptoAccountTrackingService removed - now handled by unified TwitterMentionService
import CryptoTrackingDatabase from './services/CryptoTrackingDatabase.js';
// REMOVED: Unused prediction services causing unnecessary costs
// import PredictionTrackingDatabase from './services/PredictionTrackingDatabase.js';
// import AccuracyCalculationService from './services/AccuracyCalculationService.js';
// import PriceMonitoringService from './services/PriceMonitoringService.js';
import TopicAnalysisService from './services/TopicAnalysisService.js';
import TopicTrendingDatabase from './services/TopicTrendingDatabase.js';
// REMOVED: Unused AI accuracy service causing costs
// import AIAccuracyAnalysisService from './services/AIAccuracyAnalysisService.js';
import { X402PaymentHandler } from '@payai/x402-solana';
// Portfolio analysis services are handled by jup-discovery background worker
// No direct imports needed - data comes via internal API endpoints

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class EnhancedBackend {
  // Helper method to get image format from URL
  getImageFormatFromUrl(url) {
    try {
      const urlLower = url.toLowerCase();
      if (urlLower.includes('.jpg') || urlLower.includes('.jpeg')) return 'jpg';
      if (urlLower.includes('.png')) return 'png';
      if (urlLower.includes('.gif')) return 'gif';
      if (urlLower.includes('.webp')) return 'webp';
      return 'unknown';
    } catch (error) {
      return 'unknown';
    }
  }

  // Helper method to check if insights are stale (older than 1 hour)
  isInsightStale(generatedAt) {
    try {
      const generatedTime = new Date(generatedAt);
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      return generatedTime < oneHourAgo;
    } catch (error) {
      return true; // If we can't parse the date, consider it stale
    }
  }

  // Determine if a token should be excluded due to suspicious audit flags
  isSuspiciousToken(token) {
    // PROBITY exception: Skip suspicious filter for PROBITY due to active gRPC monitoring
    const isProbity = token.symbol === 'PROBITY' || token.contractAddress === '9N9V585yTpmosZacAcXLZWxKJEK7PbaH4RJ8gEKLD9sc';
    if (isProbity) return false;

    const isTrue = (v) => {
      if (v === true) return true;
      if (typeof v === 'string') {
        const s = v.trim().toLowerCase();
        return s === 'true' || s === '1' || s === 'yes';
      }
      if (typeof v === 'number') return v === 1;
      return false;
    };

    const candidates = [
      token?.isSus,
      token?.audit?.isSus,
      token?.auditInfo?.isSus,
      token?.jupiterData?.isSus,
      token?.jupiterData?.audit?.isSus,
      token?.jupiterData?.auditInfo?.isSus,
      token?.jupiterData?.audit?.suspicious,
      token?.jupiterData?.audit?.is_sus
    ];

    return candidates.some(isTrue);
  }

  // Determine if a token appears rugged or effectively dead based on sharp drawdowns and collapsed liquidity
  isRuggedToken(token) {
    // PROBITY exception: Skip rug filter for PROBITY due to active gRPC monitoring
    const isProbity = token.symbol === 'PROBITY' || token.contractAddress === '9N9V585yTpmosZacAcXLZWxKJEK7PbaH4RJ8gEKLD9sc';
    if (isProbity) return false;

    try {
      const j = token?.jupiterData || {};
      const s1 = j.stats1h || {};
      const s6 = j.stats6h || {};
      const s24 = j.stats24h || {};

      const priceChange1h = typeof s1.priceChange === 'number' ? s1.priceChange : undefined;
      const priceChange6h = typeof s6.priceChange === 'number' ? s6.priceChange : undefined;
      const priceChange24h = typeof s24.priceChange === 'number' ? s24.priceChange : undefined;
      const liquidityUsd = typeof j.liquidity === 'number' ? j.liquidity : undefined;

      // Rug heuristics (conservative):
      // - 24h drop ≤ -80%
      // - OR 6h drop ≤ -70%
      // - OR liquidity collapsed (≤ $1,000) AND 24h drop ≤ -60%
      const big24hDrop = priceChange24h !== undefined && priceChange24h <= -80;
      const big6hDrop = priceChange6h !== undefined && priceChange6h <= -70;
      const collapsedLiq = liquidityUsd !== undefined && liquidityUsd <= 1000;
      const liqAndDrop = collapsedLiq && priceChange24h !== undefined && priceChange24h <= -60;

      return Boolean(big24hDrop || big6hDrop || liqAndDrop);
    } catch (_) {
      return false;
    }
  }

  isExcludedMajorOrStable(token) {
    try {
      const symbolRaw = (token?.symbol || token?.jupiterData?.symbol || '').toString();
      const nameRaw = (token?.name || token?.jupiterData?.name || '').toString();
      const contractAddress = token?.contractAddress || token?.jupiterData?.contractAddress || '';
      
      const symbol = symbolRaw.trim().toUpperCase();
      const name = nameRaw.trim().toUpperCase();
      
      // Check banned symbols
      const bannedSymbols = new Set([
        'WETH','WBTC','ETH','BTC','SOL','USDC','USDT','DAI','TUSD','FRAX','PYUSD','WBNB','WBCH','WAVAX','BNSOL'
      ]);
      if (bannedSymbols.has(symbol)) return true;
      
      // Check banned contract addresses
      const bannedContracts = new Set([
        'So11111111111111111111111111111111111111112', // Wrapped SOL
        'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
        'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
        'BNso1VUJnh4zcfpZa6986Ea66P6TCp59hvtNJ8b1X85', // BNSOL (Binance Staked SOL)
        'pSo1f9nQXWgXibFtKf7NWYxb5enAM4qfP6UJSiXRQfL'  // Additional stablecoin
      ]);
      if (bannedContracts.has(contractAddress)) return true;
      
      // Check banned name fragments
      const bannedFragments = [' STABLE', 'STABLE ', ' STABLECOIN', 'WRAPPED ETH', 'WRAPPED BTC'];
      const hay = `${symbol} ${name}`;
      return bannedFragments.some(f => hay.includes(f));
    } catch (_) {
      return false;
    }
  }
  constructor() {
    this.app = express();
    this.port = Number(process.env.PORT) || 4000;
    
    // ✅ MEMORY CACHE: Cache tokens in memory to avoid reading from disk on every request
    this.tokensCache = {
      data: null,
      timestamp: null,
      TTL: 60000 // 1 minute cache
    };
    
    this.tokenProcessor = new EnhancedTokenProcessor();
    this.hypeService = new HypeSnapshotService();
    this.mcapService = new McapSnapshotService();
    // this.birdeyeService = new BirdEyeTrendingService(); // DISABLED
    this.helioService = new HelioPaymentService();
    this.oauthXService = new OAuthXService();
    // DISABLED: KOL Service (was making CoinAPI/CoinDesk calls)
    // this.kolService = new KOLService();
    // DISABLED: Enhanced Analytics Cache Service
    // this.enhancedAnalyticsCache = new EnhancedAnalyticsCacheService(this.kolService);
    this.priorityQueue = new PriorityQueueService();
    
    // DISABLED: Start Enhanced Analytics Cache Service immediately (will work with empty data until KOL Service loads)
    // this.enhancedAnalyticsCache.startBackgroundProcessing();
    console.log('⚠️ Enhanced Analytics Cache Service DISABLED');
    this.leaderboardEngine = new LeaderboardScoringEngine();
    this.kolTrustSystem = new EnhancedKOLTrustSystem();
    this.monthlySnapshotService = new MonthlySnapshotService();
    this.socialContextAI = new SocialContextAI();
    this.hypeTrendAnalysis = new HypeTrendAnalysis();
    this.aiHypePrediction = new AIHypePredictionService();
    
    // AI Liquid Staking Router services are handled by jup-discovery background worker
    // Data comes via internal API endpoints, no direct service initialization needed
    this.callThesisGenerator = new CallThesisGenerator();
    this.milestoneTracker = new MilestoneTracker();
    this.pushNotificationService = new PushNotificationService();
    this.automatedCleanup = new AutomatedTokenCleanup();
    // Initialize AI Chat Service with OAuthXService for watchlist operations and backend instance for internal calls
    this.aiChatService = new MoralisAIChatService(this.oauthXService, this);
    this.twitterAutoPostService = new TwitterAutoPostService(this.oauthXService);
    this.nftGatedAccessService = new NFTGatedAccessService();
    this.enhancedNFTTraitService = new EnhancedNFTTraitService();
    
    // Initialize crypto tracking services
    this.opinionDatabase = new DGOOpinionDatabase();
    this.cryptoTrackingDatabase = new CryptoTrackingDatabase();
    
    // REMOVED: Unused prediction services causing unnecessary costs
    // this.predictionTrackingDatabase = new PredictionTrackingDatabase();
    // this.accuracyCalculationService = new AccuracyCalculationService();
    // this.priceMonitoringService = new PriceMonitoringService();
    // this.aiAccuracyAnalysisService = new AIAccuracyAnalysisService();
    
    // Initialize topic analysis services
    this.topicAnalysisService = new TopicAnalysisService();
    this.topicTrendingDatabase = new TopicTrendingDatabase();
    
    // CryptoAccountTrackingService removed - now handled by unified TwitterMentionService
    this.dailyTweetService = null; // Will be initialized after OpenAI service is ready
    this.backupIntegration = null; // Will be initialized in setupServices()
    
    // Initialize PayAI x402 Payment Handler
    this.x402PaymentHandler = new X402PaymentHandler({
      network: 'solana',
      treasuryAddress: '3hn5fWZEf2yUZcwU2CV2Wkvk7YDiysM8xBwmesFg7sN1', // Merchant WALLET (SDK derives ATA)
      facilitatorUrl: 'https://facilitator.payai.network'
    });
    // Social Context cache (72h TTL)
    this.socialContextCache = new Map();
    try {
      const baseDir = this.oauthXService?.db?.baseDir || process.env.DATA_DIR || '/var/data/dgo';
      this.socialContextCachePath = path.join(baseDir, 'cache', 'social-context-cache.json');
    } catch (_) {
      this.socialContextCachePath = path.join(__dirname, 'cache', 'social-context-cache.json');
    }
    // Lazy-load cache file (non-blocking)
    this._loadSocialContextCache().catch(() => {});
    // Persistent cache path for tokens-cache.json under DATA_DIR
    try {
      const baseDir = this.oauthXService?.db?.baseDir || process.env.DATA_DIR || '/var/data/dgo';
      this.persistentCachePath = path.join(baseDir, 'cache', 'tokens-cache.json');
      logger.info(`🔧 Persistent cache path set to: ${this.persistentCachePath}`);
      logger.info(`🔧 Base directory: ${baseDir}`);
      logger.info(`🔧 DATA_DIR env: ${process.env.DATA_DIR}`);
    } catch (error) {
      // Fallback to local (non-persistent) path only if necessary
      this.persistentCachePath = path.join(__dirname, 'cache', 'tokens-cache.json');
      logger.warn(`⚠️ Fallback to local cache path: ${this.persistentCachePath}`);
      logger.warn(`⚠️ Fallback reason: ${error.message}`);
    }
    this.isRunning = false;
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupImageUpload();
    this.setupBackgroundTasks();
    
    // Initialize log storage
    this.logStorage = [];
    this.maxLogEntries = 10000;
    
    // Initialize Winston logger
    logger.info('🚀 Enhanced Backend v3.0 starting up...');
    logger.info('🔄 Initializing services and middleware...');
    
    logger.info('✅ Enhanced Backend constructor completed');
    
    // Enhanced backup system is now initialized in start() method
  }

  /**
   * Initialize KOL Service and Enhanced Analytics Cache
   */
  // DISABLED: Initialize KOL Service (was making CoinAPI/CoinDesk calls)
  /*
  async initializeKOLService() {
    try {
      console.log('🔄 Initializing KOL Service...');
      await this.kolService.initialize();
      console.log('✅ KOL Service initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize KOL Service:', error);
    }
  }
  */

  async loadKOLRoutes() {
    try {
      console.log('🔄 [BACKEND] Loading KOL routes...');
      const { default: kolRoutes } = await import('./routes/kolRoutes.js');
      
      if (!kolRoutes) {
        throw new Error('KOL routes import returned undefined');
      }
      
      this.app.use('/api/kol', kolRoutes);
      console.log('✅ [BACKEND] KOL routes registered at /api/kol');
      
      // Serve KOL Intelligence Hub page
      this.app.get('/kolsentiment', (req, res) => {
        res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>KOL Intelligence Hub - Degen Oracle</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 20px;
            background: linear-gradient(135deg, #0a0a0a 0%, #1a0a2e 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .container {
            background: rgba(20, 20, 20, 0.8);
            backdrop-filter: blur(10px);
            border: 1px solid rgba(153, 69, 255, 0.3);
            border-radius: 20px;
            padding: 40px;
            text-align: center;
            box-shadow: 0 20px 60px rgba(153, 69, 255, 0.2);
            max-width: 600px;
        }
        h1 {
            color: #9945FF;
            margin-bottom: 20px;
            font-size: 2.5em;
            text-shadow: 0 0 20px rgba(153, 69, 255, 0.5);
        }
        .subtitle {
            color: #aaa;
            font-size: 1.2em;
            margin-bottom: 30px;
        }
        .cta-button {
            background: linear-gradient(45deg, #9945FF, #14F195);
            color: white;
            padding: 15px 30px;
            border: none;
            border-radius: 50px;
            font-size: 18px;
            font-weight: bold;
            text-decoration: none;
            display: inline-block;
            transition: all 0.3s;
            box-shadow: 0 4px 20px rgba(153, 69, 255, 0.4);
        }
        .cta-button:hover {
            transform: translateY(-3px);
            box-shadow: 0 6px 30px rgba(153, 69, 255, 0.6);
        }
        .features {
            margin: 30px 0;
            color: #888;
            text-align: left;
        }
        .feature {
            margin: 10px 0;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .feature-icon {
            color: #9945FF;
            font-size: 1.2em;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🧠 KOL INTELLIGENCE HUB</h1>
        <p class="subtitle">Who Moves What, When, and How</p>
        
        <div class="features">
            <div class="feature">
                <span class="feature-icon">🚀</span>
                <span>Momentum Board - Track coin mentions</span>
            </div>
            <div class="feature">
                <span class="feature-icon">💭</span>
                <span>Narrative Radar - Detect emerging trends</span>
            </div>
            <div class="feature">
                <span class="feature-icon">⚡</span>
                <span>Alpha Signals - Real-time opportunities</span>
            </div>
            <div class="feature">
                <span class="feature-icon">📊</span>
                <span>Auto Influence Scores - AI-powered KOL ranking</span>
            </div>
        </div>
        
        <a href="/admin-dashboard.html" class="cta-button">
            🎯 Launch Admin Dashboard
        </a>
        
        <p style="margin-top: 30px; color: #666; font-size: 0.9em;">
            KOL Intelligence Hub is temporarily disabled
        </p>
    </div>
</body>
</html>
        `);
      });
      
      logger.info('✅ KOL Dashboard routes loaded');
      console.log('✅ [BACKEND] KOL Dashboard page available at /kolsentiment');
    } catch (error) {
      console.error('❌ [BACKEND] Failed to load KOL routes:', error);
      logger.error(`❌ Failed to load KOL routes: ${error.message}`);
      throw error; // Re-throw to prevent server from starting with broken routes
    }
  }

  setupMiddleware() {
    // CORS configuration for production
    const corsOptions = {
      origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);
        
        const allowedOrigins = [
          'https://dgo-20l.pages.dev',
          'https://degen-oracle.com',
          'https://www.degen-oracle.com',
          'https://api.degen-oracle.com',
          'http://degen-oracle.com', // HTTP version
          'http://www.degen-oracle.com', // HTTP www version
          'http://localhost:3000', // for development
          'http://localhost:4000'  // for development
        ];
        
        // Allow any Cloudflare Pages subdomain for dgo-20l.pages.dev
        const cloudflarePattern = /^https:\/\/[a-f0-9]+\.dgo-20l\.pages\.dev$/;
        
        if (allowedOrigins.includes(origin) || cloudflarePattern.test(origin)) {
          callback(null, true);
        } else {
          logger.warn(`🚫 CORS blocked origin: ${origin}`);
          callback(new Error('Not allowed by CORS'));
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-PAYMENT', 'Access-Control-Expose-Headers', 'X-Connection-ID'],
      exposedHeaders: ['X-PAYMENT-RESPONSE'] // Allow frontend to read settlement response
    };

    this.app.use(cors(corsOptions));
    this.app.use(express.json({ limit: '10mb' }));

    // Handle preflight requests
    this.app.options('*', cors(corsOptions));
    
    // Additional CORS middleware for AI endpoints with debugging
    this.app.use((req, res, next) => {
      if (req.path.startsWith('/api/ai')) {
        console.log(`🔍 AI CORS: ${req.method} ${req.path} from origin: ${req.headers.origin}`);
        
        const origin = req.headers.origin;
        res.header('Access-Control-Allow-Origin', origin || '*');
        res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-Connection-ID');
        res.header('Access-Control-Allow-Credentials', 'true');
        
        if (req.method === 'OPTIONS') {
          console.log(`✅ AI CORS: Handling OPTIONS preflight for ${req.path}`);
          return res.status(200).end();
        }
      }
      next();
    });

    // Admin authentication middleware
    const adminAuth = (req, res, next) => {
      const auth = req.headers.authorization;
      
      if (!auth || !auth.startsWith('Basic ')) {
        res.setHeader('WWW-Authenticate', 'Basic realm="Admin Dashboard"');
        return res.status(401).send('Authentication required');
      }
      
      const credentials = Buffer.from(auth.slice(6), 'base64').toString();
      const [username, password] = credentials.split(':');
      
      // Check credentials (use environment variables for production)
      const validUsername = process.env.ADMIN_USERNAME || 'ness870315';
      const validPassword = process.env.ADMIN_PASSWORD || '1E132730!';
      
      console.log(`[🛡️ Admin Auth] Login attempt: ${username} (env: ${process.env.ADMIN_USERNAME ? 'SET' : 'DEFAULT'})`);
      
      if (username === validUsername && password === validPassword) {
        next();
      } else {
        res.setHeader('WWW-Authenticate', 'Basic realm="Admin Dashboard"');
        res.status(401).send('Invalid credentials');
      }
    };

    // Serve static files from public directory (for admin dashboard) - PROTECTED
    this.app.get('/admin-dashboard.html', adminAuth, (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'admin-dashboard.html'));
    });
    
    // Serve other static files without protection (if any)
    this.app.use(express.static(path.join(__dirname, 'public')));
  }

  setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: {
          persistence: true,
          scoring: true,
          social: true,
          jupiter: true
        }
      });
    });

    // API status
    this.app.get('/api/status', async (req, res) => {
      try {
    // Log status endpoint access
    logger.info('📊 Status endpoint accessed');
    logger.debug('🔍 Debug: Status endpoint called at ' + new Date().toISOString());
        const status = this.tokenProcessor.getProcessingStatus();
        let tokens = await this.getTokensFromCache();
        const priorityStats = this.priorityQueue.getPriorityStats(tokens);
        
        res.json({
          success: true,
          backend: 'Enhanced Backend v3.0 + Priority Queue',
          timestamp: new Date().toISOString(),
          processing: status,
          cache: {
            totalTokens: status.processedCount,
            queueLength: status.queueLength
          },
          priorityQueue: {
            highPriority: priorityStats.HIGH.count,
            mediumPriority: priorityStats.MEDIUM.count,
            lowPriority: priorityStats.LOW.count,
            canMakeRequest: priorityStats.canMakeRequest,
            requestsInLastMinute: priorityStats.requestsInLastMinute,
            rateLimitBudget: `${priorityStats.requestsInLastMinute}/2.5 per minute`
          },
          dataDir: process.env.DATA_DIR || '/var/data/dgo',
          notes: 'Priority queue provides near real-time updates for high-priority tokens while respecting rate limits.'
        });
      } catch (error) {
        logger.error(`❌ Status endpoint error: ${error.message}`);
        res.status(500).json({
          success: false,
          error: 'Failed to get status',
          timestamp: new Date().toISOString()
        });
      }
    });


    // Activate Premium for the authenticated user
    this.app.post('/api/user/premium/activate', async (req, res) => {
      try {
        const { sessionId, receipt, paylinkId: clientPaylinkId, paymentId, paymentData } = req.body;
        if (!sessionId) return res.status(400).json({ success: false, error: 'Missing sessionId' });
        const user = await this.oauthXService.getUserBySession(sessionId);
        if (!user) return res.status(401).json({ success: false, error: 'Invalid session' });

        // Validate payment with Helio API (same structure as fuel token flow)
        logger.info('🔐 Validating payment for premium activation...');
        const finalPaymentId = paymentId || receipt?.paymentId || receipt?.id || clientPaylinkId;
        if (!finalPaymentId) {
          return res.status(400).json({ success: false, error: 'Missing payment ID' });
        }

        // Use the same validation approach as fuel token flow
        const validationResult = await this.helioService.validatePayment(finalPaymentId, paymentData || receipt);
        if (!validationResult.isValid) {
          logger.error(`❌ Payment validation failed: ${validationResult.error}`);
          return res.status(400).json({ 
            success: false, 
            error: 'Payment validation failed', 
            details: validationResult.error
          });
        }

        logger.info('✅ Payment validated successfully:', validationResult);

        // Determine plan by paylinkId (monthly vs yearly)
        const envMonthly = process.env.HELIO_MONTHLY_PAYLINK_ID || '68b8ed60cf71471addc8adb6';
        const envYearly = process.env.HELIO_YEARLY_PAYLINK_ID || null;
        const receiptPaylinkId = receipt?.paylinkId || receipt?.paylink?.id || clientPaylinkId || null;
        
        logger.info('🔍 Payment plan detection:', {
          envMonthly,
          envYearly,
          receiptPaylinkId,
          clientPaylinkId,
          receiptAmount: receipt?.amount,
          paymentDataAmount: paymentData?.amount
        });

        let planType = 'monthly';
        let durationDays = 30;
        
        // Check if this is a yearly payment
        if (envYearly && receiptPaylinkId && String(receiptPaylinkId) === String(envYearly)) {
          planType = 'yearly';
          durationDays = 365; // Yearly plan (assumed 20% discount handled by Helio)
        } else if (validationResult.fallback === true) {
          // If fallback validation was used, it means yearly payment
          planType = 'yearly';
          durationDays = 365;
          logger.info(`📅 Detected yearly payment via fallback validation`);
        } else {
          // Monthly payment with PayLink ID
          planType = 'monthly';
          durationDays = 30;
          logger.info(`📅 Detected monthly payment via PayLink ID`);
        }

        // Persist premium status for the selected duration
        const now = new Date();
        const expiresAt = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);
        const result = await this.oauthXService.db.setPremiumStatus(user.id, {
          isPremium: true,
          subscriptionType: `helio_${planType}`,
          receipt: receipt || null,
          paylinkId: receiptPaylinkId || null,
          paymentId: paymentId,
          validationData: validationResult,
          updatedAt: now.toISOString(),
          lastActivatedAt: now.toISOString(),
          expiresAt: expiresAt.toISOString(),
          durationDays
        });

        // Record earning (amount may be present on receipt)
        try {
          const amount = Number(receipt?.amount || receipt?.payment?.amount || 0) || null;
          await this.oauthXService.db.addEarning({
            type: 'premium',
            category: planType,
            amount,
            currency: receipt?.currency || receipt?.payment?.currency || 'USD',
            paylinkId: receiptPaylinkId || null,
            txId: receipt?.txId || receipt?.id || null,
            userId: user.id,
            meta: { durationDays }
          });
          
          // Update user totalSpent for premium subscription
          let solAmount = 0;
          if (planType === 'monthly') {
            solAmount = 0.4; // Monthly: 0.4 SOL
          } else if (planType === 'yearly') {
            solAmount = 0.4 * 12 * 0.8; // Yearly: 0.4 SOL × 12 - 20% discount = 3.84 SOL
          }
          
          if (solAmount > 0) {
            const totalSpentResult = await this.updateUserStats(user.id, 'totalSpent', solAmount);
            if (totalSpentResult === null) {
              console.error(`[🛡️ Enhanced Backend] ❌ Failed to update totalSpent stat for user ${user.username}`);
            } else {
              console.log(`[🛡️ Enhanced Backend] ✅ Successfully updated totalSpent stat for user ${user.username}: +${solAmount} SOL (total: ${totalSpentResult} SOL)`);
            }
          }
        } catch (e) {
          logger.error('[🛡️ Enhanced Backend] ⚠️ Failed to record earning:', e.message);
        }

        res.json({ success: true, premium: result });
      } catch (error) {
        logger.error('[🛡️ Enhanced Backend] ❌ Activate premium failed:', error.message);
        res.status(500).json({ success: false, error: 'Failed to activate premium' });
      }
    });

    // Verify NFT ownership and grant Premium access
    this.app.post('/api/user/premium/verify-nft', async (req, res) => {
      try {
        const { sessionId, walletAddress } = req.body;
        
        if (!sessionId || !walletAddress) {
          return res.status(400).json({ success: false, error: 'Missing sessionId or walletAddress' });
        }
        
        const user = await this.oauthXService.getUserBySession(sessionId);
        if (!user) return res.status(401).json({ success: false, error: 'Invalid session' });
        
        // Verify NFT ownership with trait analysis
        const verification = await this.enhancedNFTTraitService.verifyNFTOwnershipWithTraits(walletAddress);
        
        if (!verification.isHolder) {
          return res.status(403).json({ 
            success: false, 
            error: 'No NFTs found from the required collection',
            isHolder: false
          });
        }
        
        // Grant Premium access with trait-based benefits
        const result = await this.enhancedNFTTraitService.grantPremiumAccessWithTraits(
          user.id,
          walletAddress,
          verification.nfts,
          verification.traits,
          this.oauthXService.db
        );
        
        res.json({ 
          success: true, 
          premium: result,
          isHolder: true,
          nfts: verification.nfts,
          message: `Premium activated! You own ${verification.nfts.length} NFT(s) from the collection.`
        });
        
      } catch (error) {
      }
    });
    
    // Enhanced NFT verification with traits
    this.app.post('/api/user/premium/verify-nft-with-traits', async (req, res) => {
      try {
        const { sessionId, walletAddress } = req.body;
        
        if (!sessionId || !walletAddress) {
          return res.status(400).json({ success: false, error: 'Missing sessionId or walletAddress' });
        }
        
        const user = await this.oauthXService.getUserBySession(sessionId);
        if (!user) return res.status(401).json({ success: false, error: 'Invalid session' });
        
        // Verify NFT ownership with traits
        const verification = await this.enhancedNFTTraitService.verifyNFTOwnershipWithTraits(walletAddress);
        
        if (!verification.isHolder) {
          return res.status(403).json({ 
            success: false, 
            error: 'No NFTs found from the required collection',
            isHolder: false
          });
        }
        
        // Grant Premium access with trait benefits
        const result = await this.enhancedNFTTraitService.grantPremiumAccessWithTraits(
          user.id,
          walletAddress,
          verification.nfts,
          verification.traits,
          this.oauthXService.db
        );
        
        res.json({ 
          success: true, 
          premium: result,
          isHolder: true,
          nfts: verification.nfts,
          traits: verification.traits,
          traitBenefits: result.traitBenefits,
          message: `Premium activated! You own ${verification.nfts.length} NFT(s) with ${Object.keys(verification.traits.allTraits || {}).length} trait types.`
        });
        
      } catch (error) {
        console.error('[🛡️ Enhanced Backend] ❌ NFT trait verification failed:', error.message);
        res.status(500).json({ success: false, error: 'Failed to verify NFT ownership with traits' });
      }
    });
    
    // Get NFT traits for a wallet (without activating premium)
    this.app.post('/api/user/nft-traits', async (req, res) => {
      try {
        const { walletAddress } = req.body;
        
        if (!walletAddress) {
          return res.status(400).json({ success: false, error: 'Missing walletAddress' });
        }
        
        // Verify NFT ownership with traits
        const verification = await this.enhancedNFTTraitService.verifyNFTOwnershipWithTraits(walletAddress);
        
        res.json({ 
          success: true, 
          isHolder: verification.isHolder,
          nfts: verification.nfts,
          traits: verification.traits,
          method: verification.method
        });
        
      } catch (error) {
        console.error('[🛡️ Enhanced Backend] ❌ NFT traits lookup failed:', error.message);
        res.status(500).json({ success: false, error: 'Failed to lookup NFT traits' });
      }
    });

    // Redeem referral code for 30 days premium
    this.app.post('/api/user/premium/redeem', async (req, res) => {
      try {
        const { sessionId, code } = req.body;
        if (!sessionId || !code) return res.status(400).json({ success: false, error: 'Missing sessionId or code' });
        const user = await this.oauthXService.getUserBySession(sessionId);
        if (!user) return res.status(401).json({ success: false, error: 'Invalid session' });

        // Basic code validation: must be 6-12 uppercase alphanumerics
        const valid = /^[A-Z0-9]{6,12}$/.test(code);
        if (!valid) return res.status(400).json({ success: false, error: 'Invalid code format' });
        
        // Enforce rules:
        // 1) User cannot redeem own code
        // 2) A user can redeem only once
        // 3) Each code can be used up to 30 times
        
        // Find owner of code from registry; lazily ensure owner's code on first login elsewhere
        const registry = await this.oauthXService.db.getReferralRegistry();
        const entry = registry[code];
        if (!entry) {
          return res.status(400).json({ success: false, error: 'Code not found' });
        }
        if (String(entry.ownerUserId) === String(user.id)) {
          return res.status(400).json({ success: false, error: 'You cannot use your own code' });
        }
        if ((entry.uses || 0) >= (entry.maxUses || 30)) {
          return res.status(400).json({ success: false, error: 'Code has reached its maximum uses' });
        }
        const already = await this.oauthXService.db.getReferralRedemption(user.id);
        if (already) {
          return res.status(400).json({ success: false, error: 'You have already redeemed a referral code' });
        }

        const now = new Date();
        const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        const result = await this.oauthXService.db.setPremiumStatus(user.id, {
          isPremium: true,
          subscriptionType: 'referral_30d',
          updatedAt: now.toISOString(),
          lastActivatedAt: now.toISOString(),
          expiresAt: expiresAt.toISOString(),
          durationDays: 30
        });

        // Increment code usage and mark redemption
        await this.oauthXService.db.markReferralUse(code, user.id);

        // Record earning as 0 (promo)
        await this.oauthXService.db.addEarning({
          type: 'premium',
          category: 'referral',
          amount: 0,
          currency: 'USD',
          userId: user.id,
          meta: { code }
        });

        res.json({ success: true, premium: result });
      } catch (error) {
        console.error('[🛡️ Enhanced Backend] ❌ Redeem code failed:', error.message);
        res.status(500).json({ success: false, error: 'Failed to redeem code' });
      }
    });

    // Admin: Users stats and list
    // Admin API authentication middleware
    const adminApiAuth = (req, res, next) => {
      const auth = req.headers.authorization;
      
      if (!auth || !auth.startsWith('Basic ')) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      
      const credentials = Buffer.from(auth.slice(6), 'base64').toString();
      const [username, password] = credentials.split(':');
      
      const validUsername = process.env.ADMIN_USERNAME || 'ness870315';
      const validPassword = process.env.ADMIN_PASSWORD || '1E132730!';
      
      if (username === validUsername && password === validPassword) {
        next();
      } else {
        res.status(401).json({ error: 'Invalid credentials' });
      }
    };

    // Protect all admin API endpoints
    this.app.get('/api/admin/users/stats', adminApiAuth, async (req, res) => {
      try {
        const users = await this.oauthXService.db.getAllUsers();
        let total = users.length;
        let premium = 0;
        let free = 0;

        for (const u of users) {
          try {
            const prem = await this.oauthXService.db.getPremiumStatus(u.id);
            if (prem?.isPremium && (!prem.expiresAt || new Date(prem.expiresAt) > new Date())) premium++;
            else free++;
          } catch (_) { free++; }
        }

        res.json({ success: true, total, premium, free });
      } catch (error) {
        console.error('[🛡️ Enhanced Backend] ❌ Users stats failed:', error.message);
        res.status(500).json({ success: false, error: 'Failed to get users stats' });
      }
    });

    // Admin: Set user as free (non-premium)
    this.app.post('/api/admin/users/:username/set-free', adminApiAuth, async (req, res) => {
      try {
        const { username } = req.params;
        console.log(`🔍 Admin: Setting user '${username}' as free`);
        
        // Get all users to find the user by username
        const users = await this.oauthXService.db.getAllUsers();
        const user = users.find(u => u.username === username);
        
        if (!user) {
          console.log(`❌ User '${username}' not found`);
          return res.status(404).json({ 
            success: false, 
            error: `User '${username}' not found`,
            availableUsers: users.map(u => u.username).slice(0, 10)
          });
        }
        
        console.log(`✅ Found user: ${user.username} (ID: ${user.id})`);
        
        // Get current premium status
        const currentPremium = await this.oauthXService.db.getPremiumStatus(user.id);
        console.log(`📊 Current premium status:`, currentPremium);
        
        // Set user as free (non-premium)
        const freeStatus = {
          isPremium: false,
          subscriptionType: null,
          expiresAt: null,
          features: [],
          updatedAt: new Date().toISOString(),
          lastActivatedAt: null,
          durationDays: 0,
          reason: 'Manually set to free by admin'
        };
        
        await this.oauthXService.db.setPremiumStatus(user.id, freeStatus);
        
        console.log(`✅ Successfully set user '${username}' as free`);
        
        // Get updated status
        const updatedPremium = await this.oauthXService.db.getPremiumStatus(user.id);
        
        res.json({ 
          success: true, 
          message: `User '${username}' set as free`,
          userId: user.id,
          previousStatus: currentPremium,
          newStatus: updatedPremium
        });
        
      } catch (error) {
        console.error('[🛡️ Enhanced Backend] ❌ Set user free failed:', error.message);
        res.status(500).json({ success: false, error: 'Failed to set user as free' });
      }
    });

    this.app.get('/api/admin/users', adminApiAuth, async (req, res) => {
      try {
        const users = await this.oauthXService.db.getAllUsers();
        const enriched = [];
        for (const u of users) {
          const premium = await this.oauthXService.db.getPremiumStatus(u.id);
          enriched.push({
            id: u.id,
            username: u.username,
            displayName: u.displayName,
            referralCode: u.referralCode,
            createdAt: u.createdAt,
            lastLogin: u.lastLogin,
            isPremium: !!premium?.isPremium,
            expiresAt: premium?.expiresAt || null,
            subscriptionType: premium?.subscriptionType || null
          });
        }
        res.json({ success: true, users: enriched });
      } catch (error) {
        console.error('[🛡️ Enhanced Backend] ❌ Users list failed:', error.message);
        res.status(500).json({ success: false, error: 'Failed to get users list' });
      }
    });

    // Admin: Create charts directory (emergency fix)
    this.app.post('/api/admin/create-charts-dir', adminApiAuth, async (req, res) => {
      try {
        const fsSync = require('fs');
        const dataDir = process.env.DATA_DIR || '/var/data/dgo';
        const chartsDir = path.join(dataDir, 'charts');
        
        console.log(`📁 [Admin] Creating charts directory: ${chartsDir}`);
        
        if (!fsSync.existsSync(dataDir)) {
          fsSync.mkdirSync(dataDir, { recursive: true });
          console.log(`✅ [Admin] Created data directory: ${dataDir}`);
        }
        
        if (!fsSync.existsSync(chartsDir)) {
          fsSync.mkdirSync(chartsDir, { recursive: true });
          console.log(`✅ [Admin] Created charts directory: ${chartsDir}`);
        } else {
          console.log(`ℹ️ [Admin] Charts directory already exists: ${chartsDir}`);
        }
        
        res.json({ 
          success: true, 
          message: 'Charts directory created',
          dataDir: dataDir,
          chartsDir: chartsDir,
          exists: fsSync.existsSync(chartsDir)
        });
        
      } catch (error) {
        console.error('[🛡️ Enhanced Backend] ❌ Create charts dir failed:', error.message);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Admin: Remove LSTs and Stablecoins
    this.app.post('/api/admin/remove-lsts-stablecoins', adminApiAuth, async (req, res) => {
      try {
        console.log('🧹 [Admin] Starting LST and Stablecoin removal...');
        
        // Import and run cleanup
        const removeLSTsAndStablecoins = (await import('./scripts/remove-lsts-stablecoins.js')).default;
        const result = await removeLSTsAndStablecoins();
        
        console.log(`✅ [Admin] Removed ${result.removed} LSTs and stablecoins`);
        
        res.json({
          success: true,
          message: `Removed ${result.removed} LSTs and stablecoins`,
          total: result.total,
          removed: result.removed,
          remaining: result.remaining,
          removedTokens: result.removedTokens
        });
        
      } catch (error) {
        console.error('[🛡️ Enhanced Backend] ❌ Remove LSTs/Stablecoins failed:', error.message);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Admin: Reprocess Twitter data for tokens without it
    this.app.post('/api/admin/reprocess-twitter', adminApiAuth, async (req, res) => {
      try {
        console.log('🔄 [Admin] Starting Twitter data reprocessing...');
        
        // Send immediate response that processing has started
        res.json({ 
          success: true, 
          message: 'Twitter reprocessing started',
          note: 'This will run in the background. Check server logs for progress.'
        });
        
        // Run reprocessing in background (don't await)
        this.reprocessTwitterDataInBackground().catch(error => {
          console.error('❌ [Admin] Twitter reprocessing failed:', error.message);
        });
        
      } catch (error) {
        console.error('[🛡️ Enhanced Backend] ❌ Reprocess Twitter failed:', error.message);
        res.status(500).json({ success: false, error: 'Failed to start Twitter reprocessing' });
      }
    });

    // Admin: Upgrade a user to premium bypassing payment
    this.app.post('/api/admin/users/:id/upgrade', adminApiAuth, async (req, res) => {
      try {
        const { id } = req.params;
        const { durationDays = 30, subscriptionType = 'admin_grant' } = req.body || {};
        const now = new Date();
        
        // Check if user already has premium
        const existingPremium = await this.oauthXService.db.getPremiumStatus(id);
        let expiresAt;
        
        if (existingPremium && existingPremium.isPremium && existingPremium.expiresAt) {
          // User already has premium - EXTEND from current expiration date
          const currentExpiration = new Date(existingPremium.expiresAt);
          
          // If current expiration is in the future, add to it
          // If it's in the past, start from now
          const baseDate = currentExpiration > now ? currentExpiration : now;
          expiresAt = new Date(baseDate.getTime() + durationDays * 24 * 60 * 60 * 1000);
          
          console.log(`[🛡️ Enhanced Backend] 📅 Extending Premium for user ${id}:`);
          console.log(`  Current expiration: ${currentExpiration.toISOString()}`);
          console.log(`  Adding: ${durationDays} days`);
          console.log(`  New expiration: ${expiresAt.toISOString()}`);
        } else {
          // User doesn't have premium or it's expired - start from now
          expiresAt = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);
          console.log(`[🛡️ Enhanced Backend] 🆕 Granting Premium to user ${id} for ${durationDays} days`);
        }
        
        const result = await this.oauthXService.db.setPremiumStatus(id, {
          isPremium: true,
          subscriptionType,
          updatedAt: now.toISOString(),
          lastActivatedAt: now.toISOString(),
          expiresAt: expiresAt.toISOString(),
          durationDays
        });
        
        res.json({ success: true, premium: result });
      } catch (error) {
        console.error('[🛡️ Enhanced Backend] ❌ Admin upgrade failed:', error.message);
        res.status(500).json({ success: false, error: 'Failed to upgrade user' });
      }
    });

    // Admin: EMERGENCY - Restore users from backup or user directories
    this.app.post('/api/admin/emergency-restore-users', adminApiAuth, async (req, res) => {
      try {
        console.log('[🚨 EMERGENCY] Restoring users...');
        
        const usersDir = this.oauthXService.db.usersDir;
        const globalDir = this.oauthXService.db.globalDir;
        const usersIndexPath = this.oauthXService.db.getGlobalFile('users-index.json');
        
        // Check for backup files
        const globalFiles = await fs.readdir(globalDir);
        const backupFiles = globalFiles.filter(f => f.includes('users-index') && (f.includes('backup') || f.includes('_')));
        
        if (backupFiles.length > 0) {
          console.log(`[🚨 EMERGENCY] Found ${backupFiles.length} backup files`);
          
          // Use the most recent backup
          const mostRecent = backupFiles.sort().reverse()[0];
          const backupPath = path.join(globalDir, mostRecent);
          
          const backupData = await fs.readFile(backupPath, 'utf8');
          let usersData = JSON.parse(backupData);
          
          // Convert array to object format if needed (userId as key)
          let usersIndex = {};
          if (Array.isArray(usersData)) {
            console.log(`[🚨 EMERGENCY] Converting array format to object format`);
            usersData.forEach(user => {
              usersIndex[user.id] = user;
            });
          } else {
            usersIndex = usersData;
          }
          
          const userCount = Object.keys(usersIndex).length;
          console.log(`[🚨 EMERGENCY] Restoring ${userCount} users from ${mostRecent}`);
          
          await this.oauthXService.db.writeJsonFile(usersIndexPath, usersIndex);
          
          return res.json({
            success: true,
            message: `Restored ${userCount} users from backup`,
            usersCount: userCount,
            users: Object.values(usersIndex).map(u => ({ id: u.id, username: u.username })),
            source: 'backup',
            backupFile: mostRecent
          });
        }
        
        // No backup - rebuild from user directories
        console.log('[🚨 EMERGENCY] No backup found. Rebuilding from user directories...');
        
        const userDirs = await fs.readdir(usersDir);
        const userFolders = userDirs.filter(d => d.startsWith('user-'));
        
        const rebuiltUsersIndex = {};
        
        for (const folder of userFolders) {
          try {
            const userId = folder.replace('user-', '');
            const profilePath = path.join(usersDir, folder, 'profile.json');
            
            const profileData = await fs.readFile(profilePath, 'utf8');
            const profile = JSON.parse(profileData);
            
            rebuiltUsersIndex[userId] = {
              id: userId,
              username: profile.username,
              displayName: profile.displayName,
              profileImageUrl: profile.profileImageUrl,
              createdAt: profile.createdAt,
              referralCode: profile.referralCode
            };
            
            console.log(`[🚨 EMERGENCY] Rebuilt: ${profile.username}`);
          } catch (err) {
            console.log(`[🚨 EMERGENCY] Could not rebuild ${folder}: ${err.message}`);
          }
        }
        
        const rebuiltCount = Object.keys(rebuiltUsersIndex).length;
        
        if (rebuiltCount > 0) {
          await this.oauthXService.db.writeJsonFile(usersIndexPath, rebuiltUsersIndex);
          
          return res.json({
            success: true,
            message: `Rebuilt ${rebuiltCount} users from directories`,
            usersCount: rebuiltCount,
            users: Object.values(rebuiltUsersIndex).map(u => ({ id: u.id, username: u.username })),
            source: 'rebuilt'
          });
        }
        
        res.status(500).json({
          success: false,
          error: 'No backup or user directories found'
        });
        
      } catch (error) {
        console.error('[🚨 EMERGENCY] Restore failed:', error.message);
        res.status(500).json({ success: false, error: 'Emergency restore failed' });
      }
    });

    // Admin: Delete a user completely
    this.app.post('/api/admin/users/:username/delete', adminApiAuth, async (req, res) => {
      try {
        const { username } = req.params;
        console.log(`[🛡️ Admin] 🗑️ Deleting user '${username}'...`);
        
        // Get all users to find the user by username
        const users = await this.oauthXService.db.getAllUsers();
        const user = users.find(u => u.username === username || u.username === `@${username}`);
        
        if (!user) {
          return res.status(404).json({ 
            success: false, 
            error: `User '${username}' not found`,
            availableUsers: users.map(u => u.username).slice(0, 10)
          });
        }
        
        console.log(`[🛡️ Admin] ✅ Found user: ${user.username} (ID: ${user.id})`);
        
        const deletedData = {
          kolCalls: 0,
          sessions: 0,
          referralCodes: 0
        };
        
        // Delete user directory
        const userDir = this.oauthXService.db.getUserFile(user.id, '');
        const userDirPath = userDir.substring(0, userDir.lastIndexOf(path.sep));
        
        try {
          await fs.rm(userDirPath, { recursive: true, force: true });
          console.log(`[🛡️ Admin] ✅ User directory deleted: ${userDirPath}`);
        } catch (err) {
          console.log(`[🛡️ Admin] ⚠️ Could not delete user directory: ${err.message}`);
        }
        
        // Remove from users index
        const updatedUsers = users.filter(u => u.id !== user.id);
        const usersIndexPath = this.oauthXService.db.getGlobalFile('users-index.json');
        await this.oauthXService.db.writeJsonFile(usersIndexPath, updatedUsers);
        console.log(`[🛡️ Admin] ✅ Removed from users index (${users.length} → ${updatedUsers.length})`);
        
        // Remove sessions
        const sessionsPath = this.oauthXService.db.getGlobalFile('sessions.json');
        try {
          const sessions = await this.oauthXService.db.readJsonFile(sessionsPath, {});
          const sessionKeys = Object.keys(sessions);
          const userSessions = sessionKeys.filter(key => sessions[key].userId === user.id);
          
          userSessions.forEach(key => delete sessions[key]);
          deletedData.sessions = userSessions.length;
          
          await this.oauthXService.db.writeJsonFile(sessionsPath, sessions);
          console.log(`[🛡️ Admin] ✅ Removed ${userSessions.length} session(s)`);
        } catch (err) {
          console.log(`[🛡️ Admin] ⚠️ Could not remove sessions: ${err.message}`);
        }
        
        // Remove from referral codes
        const referralCodesPath = this.oauthXService.db.getGlobalFile('referral-codes.json');
        try {
          const codes = await this.oauthXService.db.readJsonFile(referralCodesPath, []);
          const userCodes = codes.filter(c => c.createdBy === user.id);
          const updatedCodes = codes.filter(c => c.createdBy !== user.id);
          
          if (userCodes.length > 0) {
            await this.oauthXService.db.writeJsonFile(referralCodesPath, updatedCodes);
            deletedData.referralCodes = userCodes.length;
            console.log(`[🛡️ Admin] ✅ Removed ${userCodes.length} referral code(s)`);
          }
        } catch (err) {
          console.log(`[🛡️ Admin] ⚠️ Could not check referral codes: ${err.message}`);
        }
        
        console.log(`[🛡️ Admin] ✅ User '${user.username}' has been completely deleted`);
        
        res.json({ 
          success: true, 
          message: `User '${username}' deleted successfully`,
          user: {
            id: user.id,
            username: user.username,
            displayName: user.displayName
          },
          deletedData
        });
        
      } catch (error) {
        console.error('[🛡️ Enhanced Backend] ❌ Delete user failed:', error.message);
        res.status(500).json({ success: false, error: 'Failed to delete user' });
      }
    });

    // Admin: Earnings endpoints
    this.app.get('/api/admin/earnings/summary', adminApiAuth, async (req, res) => {
      try {
        const summary = await this.oauthXService.db.getEarningsSummary();
        res.json({ success: true, summary });
      } catch (error) {
        console.error('[🛡️ Enhanced Backend] ❌ Earnings summary failed:', error.message);
        res.status(500).json({ success: false, error: 'Failed to get earnings summary' });
      }
    });

    this.app.get('/api/admin/earnings', adminApiAuth, async (req, res) => {
      try {
        const list = await this.oauthXService.db.getEarnings();
        res.json({ success: true, earnings: list });
      } catch (error) {
        console.error('[🛡️ Enhanced Backend] ❌ Earnings list failed:', error.message);
        res.status(500).json({ success: false, error: 'Failed to get earnings list' });
      }
    });

    // Admin: Reset all earnings (clear earnings.json)
    this.app.post('/api/admin/earnings/reset', adminApiAuth, async (req, res) => {
      try {
        console.log('[🛡️ Admin] 🗑️ Resetting all earnings data...');
        
        // Get earnings file path
        const earningsFile = this.oauthXService.db.getGlobalFile('earnings.json');
        
        // Create backup before reset
        const backupFile = earningsFile.replace('.json', `_backup_${Date.now()}.json`);
        try {
          const currentData = await this.oauthXService.db.getEarnings();
          await fs.writeFile(backupFile, JSON.stringify(currentData, null, 2));
          console.log(`[🛡️ Admin] 📦 Backup created: ${backupFile}`);
        } catch (backupErr) {
          console.warn('[🛡️ Admin] ⚠️ Could not create backup:', backupErr.message);
        }
        
        // Reset earnings to empty array
        await this.oauthXService.db.writeJsonFile(earningsFile, []);
        
        console.log('[🛡️ Admin] ✅ All earnings data has been reset');
        
        res.json({
          success: true,
          message: 'All earnings data has been reset',
          backup: backupFile,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('[🛡️ Admin] ❌ Failed to reset earnings:', error.message);
        res.status(500).json({ success: false, error: 'Failed to reset earnings' });
      }
    });

    // Serve fuel images
    this.app.get('/api/fuel-image/:fuelType/:symbol', async (req, res) => {
      try {
        const { fuelType, symbol } = req.params;
        console.log(`[🛡️ Enhanced Backend] 🖼️ Generating fuel image for ${fuelType}/${symbol}`);
        
        // Generate the fuel image
        const fuelImageGenerator = new (await import('./fuelImageGenerator.js')).default();
        const imageDataURL = await fuelImageGenerator.generateFuelImageDataURL(fuelType, symbol);
        
        if (!imageDataURL) {
          console.error(`[🛡️ Enhanced Backend] ❌ Failed to generate image for ${fuelType}/${symbol}`);
          res.status(500).json({ error: 'Failed to generate fuel image' });
          return;
        }
        
        // Convert data URL to buffer
        const base64Data = imageDataURL.split(',')[1];
        const imageBuffer = Buffer.from(base64Data, 'base64');
        
        console.log(`[🛡️ Enhanced Backend] ✅ Generated fuel image for ${fuelType}/${symbol}, size: ${imageBuffer.length} bytes`);
        
        // Set appropriate headers for X/Twitter compatibility
        res.set({
          'Content-Type': 'image/png',
          'Content-Length': imageBuffer.length,
          'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
          'Access-Control-Allow-Origin': '*', // Allow CORS for X scraper
          'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'SAMEORIGIN'
        });
        
        res.send(imageBuffer);
      } catch (error) {
        console.error('[🛡️ Enhanced Backend] ❌ Fuel image generation error:', error.message);
        res.status(500).json({ error: 'Failed to generate fuel image' });
      }
    });

    // CORS handler for fuel images
    this.app.options('/api/fuel-image/:fuelType/:symbol', (req, res) => {
      res.set({
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400'
      });
      res.status(200).end();
    });

    // Test endpoint to verify backend deployment
    this.app.get('/test-fuel-deployment', (req, res) => {
      console.log('[🛡️ Enhanced Backend] ✅ Test endpoint hit - backend deployment working');
      res.json({ status: 'working', timestamp: new Date().toISOString() });
    });


    // Main domain fuel page endpoint for link previews - PREVIEW ONLY
    this.app.get('/fuel/:fuelType/:symbol', async (req, res) => {
      try {
        const { fuelType, symbol } = req.params;
        console.log(`[🛡️ Enhanced Backend] 🔥 Fuel sharing page requested: ${fuelType}/${symbol}`);
        
        // Handle both main domain and API domain
        const host = req.get('host');
        const isMainDomain = host === 'degen-oracle.com' || host === 'www.degen-oracle.com';
        const baseUrl = isMainDomain ? 'https://api.degen-oracle.com' : `${req.protocol}://${host}`;
        const imageUrl = `${baseUrl}/api/fuel-image/${fuelType}/${symbol}`;
        
        // Always serve meta tags for previews, redirect users with JavaScript
        const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🔥 ${symbol} ${fuelType} Fuel - Degen Oracle</title>
    
    <!-- Open Graph / Facebook -->
    <meta property="og:type" content="website">
    <meta property="og:url" content="https://degen-oracle.com/fuel/${fuelType}/${symbol}">
    <meta property="og:title" content="🔥 ${symbol} ${fuelType} Fuel - Degen Oracle">
    <meta property="og:description" content="Someone just fueled #${symbol} with ${fuelType} boost on Degen Oracle! The degen army is assembling! 🚀">
    <meta property="og:image" content="${imageUrl}">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:image:type" content="image/png">
    <meta property="og:image:alt" content="${symbol} ${fuelType} Fuel Image">
    
    <!-- Twitter -->
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:site" content="@dgnoracle">
    <meta name="twitter:creator" content="@dgnoracle">
    <meta name="twitter:url" content="https://degen-oracle.com/fuel/${fuelType}/${symbol}">
    <meta name="twitter:title" content="🔥 ${symbol} ${fuelType} Fuel - Degen Oracle">
    <meta name="twitter:description" content="Someone just fueled #${symbol} with ${fuelType} boost on Degen Oracle! The degen army is assembling! 🚀">
    <meta name="twitter:image" content="${imageUrl}">
    <meta name="twitter:image:alt" content="${symbol} ${fuelType} Fuel Image">
    <meta name="twitter:domain" content="degen-oracle.com">
    
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
        }
        .container {
            background: rgba(255, 255, 255, 0.9);
            border-radius: 20px;
            padding: 40px;
            text-align: center;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            max-width: 600px;
            color: #333;
        }
        .fuel-image {
            max-width: 100%;
            height: auto;
            border-radius: 15px;
            margin: 20px 0;
        }
        h1 {
            color: #333;
            margin-bottom: 10px;
        }
        .subtitle {
            color: #666;
            font-size: 18px;
            margin-bottom: 30px;
        }
        .cta-button {
            background: linear-gradient(45deg, #ff6b6b, #ffa500);
            color: white;
            padding: 15px 30px;
            border: none;
            border-radius: 50px;
            font-size: 18px;
            font-weight: bold;
            text-decoration: none;
            display: inline-block;
            transition: transform 0.2s;
        }
        .cta-button:hover {
            transform: translateY(-2px);
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🔥 ${symbol} ${fuelType} Fuel</h1>
        <p class="subtitle">Someone just fueled #${symbol} with ${fuelType} boost on Degen Oracle!</p>
        <img src="${imageUrl}" alt="${symbol} ${fuelType} Fuel" class="fuel-image" onerror="this.style.display='none'">
        <p>The degen army is assembling! 🚀</p>
        <a href="https://degen-oracle.com" class="cta-button">Join the Oracle</a>
    </div>
    
    <script>
        // Redirect users to main site, but let bots see the meta tags
        setTimeout(function() {
            window.location.href = 'https://degen-oracle.com/?from=fuel';
        }, 2000);
    </script>
</body>
</html>`;
        
        res.set('Content-Type', 'text/html');
        res.send(html);
      } catch (error) {
        console.error('[🛡️ Enhanced Backend] ❌ Fuel sharing page error:', error.message);
        res.redirect(301, 'https://degen-oracle.com/?from=fuel');
      }
    });

    // Admin: KOL calls summary/debug endpoint
    this.app.get('/api/admin/kol-calls/summary', adminApiAuth, async (req, res) => {
      try {
        // Load all KOL calls
        const allKolCalls = await this.oauthXService.db.getAllKolCalls();
        const totalCalls = Array.isArray(allKolCalls) ? allKolCalls.length : 0;

        // Aggregate by user
        const byUser = new Map();
        for (const call of allKolCalls || []) {
          const uid = call.userId;
          byUser.set(uid, (byUser.get(uid) || 0) + 1);
        }

        // Enrich top users with profile
        const topUsers = Array.from(byUser.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 25);

        const users = await Promise.all(topUsers.map(async ([userId, count]) => {
          try {
            const u = await this.oauthXService.getUserById(userId);
            return {
              userId,
              count,
              username: u?.username || null,
              displayName: u?.displayName || null,
              profileImage: u?.profileImage || null
            };
          } catch (_) {
            return { userId, count };
          }
        }));

        // Provide a small sample of recent calls
        const sample = (allKolCalls || [])
          .slice(-20)
          .reverse()
          .map(c => ({
            id: c.id,
            userId: c.userId,
            token: c.token,
            calledAt: c.calledAt || c.createdAt,
            calledMC: c.calledMc || c.calledMC,
            thesis: c.thesis || null,
            twitterPostId: c.twitterPostId || null,
            twitterEnabled: c.twitterEnabled || false,
            tone: c.tone || null
          }));

        res.json({ success: true, totalCalls, users, sample });
      } catch (e) {
        console.error('[🛡️ Enhanced Backend] ❌ KOL calls summary error:', e.message);
        res.status(500).json({ success: false, error: 'Failed to get KOL calls summary' });
      }
    });

    // Admin: Force reload image overrides (useful after updating override file)
    this.app.post('/api/admin/reload-image-overrides', adminApiAuth, async (req, res) => {
      try {
        console.log('[🛡️ Enhanced Backend] 🖼️ Force reloading image overrides...');
        // Force reload tokens from cache (which will apply overrides)
        const tokens = await this.getTokensFromCache();
        console.log(`[🛡️ Enhanced Backend] ✅ Reloaded ${tokens.length} tokens with image overrides applied`);
        res.json({ 
          success: true, 
          message: 'Image overrides reloaded successfully',
          tokensCount: tokens.length 
        });
      } catch (e) {
        console.error('[🛡️ Enhanced Backend] ❌ Reload image overrides error:', e.message);
        res.status(500).json({ error: 'Failed to reload image overrides' });
      }
    });

    // Admin: Referral codes
    this.app.get('/api/admin/referrals', adminApiAuth, async (req, res) => {
      try {
        const list = await this.oauthXService.db.listReferralCodes();
        res.json({ success: true, referrals: list });
      } catch (e) {
        console.error('[🛡️ Enhanced Backend] ❌ List referrals error:', e.message);
        res.status(500).json({ error: 'Failed to list referral codes' });
      }
    });

    this.app.post('/api/admin/referrals', adminApiAuth, async (req, res) => {
      try {
        const { ownerUserId = 'admin', code, maxUses = 30 } = req.body || {};
        const created = await this.oauthXService.db.createReferralCode({ ownerUserId, code, maxUses });
        res.json({ success: true, referral: created });
      } catch (e) {
        console.error('[🛡️ Enhanced Backend] ❌ Create referral error:', e.message);
        res.status(500).json({ error: 'Failed to create referral code' });
      }
    });

    // Startup status endpoint - check if real data is available
    this.app.get('/api/startup-status', async (req, res) => {
      try {
        const hasCache = await this.hasCachedData();
        const processorTokens = this.tokenProcessor?.processedTokens?.length || 0;
        
        res.json({
          success: true,
          hasCachedData: hasCache,
          processorTokens: processorTokens,
          realDataAvailable: hasCache || processorTokens > 0,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Get all tokens
    this.app.get('/api/tokens', async (req, res) => {
      try {
        const { search } = req.query;
        console.log('[🛡️ Enhanced Backend] 📊 API request for tokens received...', search ? `(search: "${search}")` : '');

        let tokens = await this.getTokensFromCache();

        if (tokens.length === 0) {
          console.log('[🛡️ Enhanced Backend] ⚠️ No tokens found in cache - checking token processor');
          // Fallback: Try to get tokens from token processor if cache is empty
          if (this.tokenProcessor && this.tokenProcessor.processedTokens && this.tokenProcessor.processedTokens.length > 0) {
            console.log(`[🛡️ Enhanced Backend] 🔄 Using ${this.tokenProcessor.processedTokens.length} tokens from processor as fallback`);
            tokens = this.tokenProcessor.processedTokens;
          } else {
            console.log('[🛡️ Enhanced Backend] ⚠️ No tokens available - returning empty array');
            res.json([]);
            return;
          }
        }

        // Exclude suspicious, rugged, or major/stable tokens from API output as an extra safety layer
        tokens = tokens.filter(t => !this.isSuspiciousToken(t) && !this.isRuggedToken(t) && !this.isExcludedMajorOrStable(t));

        // Apply enhanced deduplication to ensure no duplicates are served
        const deduplicatedTokens = this.tokenProcessor.deduplicateTokens(tokens);
        console.log(`[🛡️ Enhanced Backend] 🔄 Deduplicated API response: ${tokens.length} → ${deduplicatedTokens.length} tokens`);

        // Filter out tokens without valid contract addresses
        let validTokens = deduplicatedTokens.filter(token => 
          token.contractAddress && 
          token.contractAddress !== null && 
          token.contractAddress.length > 10
        );
        
        // Apply search filter if provided
        if (search) {
          const searchLower = search.toLowerCase();
          validTokens = validTokens.filter(token =>
            token.symbol.toLowerCase().includes(searchLower) ||
            token.name.toLowerCase().includes(searchLower) ||
            (token.contractAddress && token.contractAddress.toLowerCase().includes(searchLower))
          );
          console.log(`[🛡️ Enhanced Backend] 🔍 Search "${search}" matched ${validTokens.length} tokens`);
        }
        
        console.log(`[🛡️ Enhanced Backend] ✅ Returning ${validTokens.length} valid tokens${search ? ' matching search' : ''}`);
        res.json(validTokens);

      } catch (error) {
        console.error('[🛡️ Enhanced Backend] ❌ Error fetching tokens:', error);
        res.status(500).json({ error: 'Failed to fetch tokens' });
      }
    });

    // Get trending tokens (filtered by status)
    this.app.get('/api/tokens/trending', async (req, res) => {
      try {
        const { limit = 10 } = req.query; // Default to 10, allow custom limit
        const requestedLimit = Math.min(Math.max(parseInt(limit) || 10, 1), 100); // Between 1-100
        
        console.log(`[🛡️ Enhanced Backend] 🔥 API request for trending tokens received (limit: ${requestedLimit})...`);

        let tokens = await this.getTokensFromCache();

        if (tokens.length === 0) {
          console.log('[🛡️ Enhanced Backend] ⚠️ No tokens found in cache - checking token processor');
          // Fallback: Try to get tokens from token processor if cache is empty
          if (this.tokenProcessor && this.tokenProcessor.processedTokens && this.tokenProcessor.processedTokens.length > 0) {
            console.log(`[🛡️ Enhanced Backend] 🔄 Using ${this.tokenProcessor.processedTokens.length} tokens from processor as fallback`);
            tokens = this.tokenProcessor.processedTokens;
          } else {
            console.log('[🛡️ Enhanced Backend] ⚠️ No tokens available - returning empty array');
            res.json([]);
            return;
          }
        }

        // Filter for trending tokens (Viral and Trending status)
        const trendingTokens = tokens.filter(token => {
          const overallScore = token.overallScore || 0;
          // Viral: >8.5, Trending: >7.8
          return overallScore > 7.8 && 
                 !this.isSuspiciousToken(token) && 
                 !this.isRuggedToken(token) && 
                 !this.isExcludedMajorOrStable(token);
        });

        // Sort by overall score (highest first)
        trendingTokens.sort((a, b) => (b.overallScore || 0) - (a.overallScore || 0));

        // Limit to requested number of trending tokens
        const limitedTrending = trendingTokens.slice(0, requestedLimit);

        // Normalize mcap field (check both mcap and marketCap from jupiterData)
        const normalizedTrending = limitedTrending.map(token => ({
          ...token,
          mcap: token.mcap || token.marketCap || token.jupiterData?.mcap || token.jupiterData?.marketCap || 0
        }));

        console.log(`[🛡️ Enhanced Backend] ✅ Returning ${normalizedTrending.length} trending tokens (score >7.8, limit: ${requestedLimit})`);
        res.json(normalizedTrending);

      } catch (error) {
        console.error('[🛡️ Enhanced Backend] ❌ Trending tokens error:', error);
        res.status(500).json({ error: 'Failed to fetch trending tokens' });
      }
    });

    // Get Dexscreener trending tokens
    this.app.get('/api/tokens/dexscreener', async (req, res) => {
      try {
        console.log('[🛡️ Enhanced Backend] 🔍 API request for Dexscreener tokens received...');

        // Initialize Dexscreener service if not already done
        if (!this.tokenProcessor.dexscreenerService) {
          const { default: DexscreenerApiService } = await import('./dexscreenerApiService.js');
          this.tokenProcessor.dexscreenerService = new DexscreenerApiService();
        }

        const limit = parseInt(req.query.limit) || 70;
        const dexscreenerTokens = await this.tokenProcessor.dexscreenerService.getTrendingPairs(limit);

        if (!dexscreenerTokens || dexscreenerTokens.length === 0) {
          console.log('[🛡️ Enhanced Backend] ⚠️ No Dexscreener tokens found');
          res.json([]);
          return;
        }

        // Convert to our standard format for frontend
        const processedTokens = dexscreenerTokens.map(token => ({
          symbol: token.symbol || 'UNKNOWN',
          name: token.name || 'Unknown Token',
          contractAddress: token.contractAddress,
          price: token.price || 0,
          volume24h: token.volume24h || 0,
          marketCap: token.marketCap || 0,
          priceChange24h: token.priceChange24h || 0,
          image: token.image,
          source: 'dexscreener',
          stage: 'dexscreener',
          pairAddress: token.pairAddress,
          chainId: token.chainId,
          dexId: token.dex,
          liquidity: token.liquidity || 0,
          fdv: token.fdv || 0,
          // Add frontend-friendly fields
          lastUpdated: new Date().toISOString(),
          hasTwitterData: false,
          hasJupiterData: false,
          mentions: 0,
          communityScore: 0,
          overallScore: 0
        }));

        console.log(`[🛡️ Enhanced Backend] ✅ Returning ${processedTokens.length} Dexscreener tokens`);
        res.json(processedTokens);

      } catch (error) {
        console.error('[🛡️ Enhanced Backend] ❌ Error fetching Dexscreener tokens:', error);
        res.status(500).json({ error: 'Failed to fetch Dexscreener tokens' });
      }
    });

    // Hype snapshots API
    this.app.get('/api/tokens/:contract/hype', async (req, res) => {
      try {
        const { contract } = req.params;
        const { range, sessionId } = req.query; // 1d | 3d | 7d | 15d | 30d
        
        console.log(`📊 Hype API request: contract=${contract}, range=${range}, sessionId=${sessionId ? 'present' : 'none'}`);
        
        // Check authentication for premium limits
        if (sessionId) {
          const user = await this.oauthXService.getUserBySession(sessionId);
          if (user) {
            const premiumStatus = await this.oauthXService.db.getPremiumStatus(user.id);
            const isPremium = premiumStatus?.isPremium && new Date(premiumStatus.expiresAt) > new Date();
            
            if (!isPremium) {
              const viewsThisMonth = await this.oauthXService.db.addHypeViewUsage(user.id, contract);
              if (viewsThisMonth > 5) {
                console.log(`🚫 Hype limit exceeded for user ${user.id}: ${viewsThisMonth} views`);
                return res.status(403).json({ 
                  error: 'limit_exceeded',
                  message: 'Free users can only view hype charts for 5 different tokens per month. Upgrade to Premium for unlimited access!' 
                });
              }
            }
          }
        }
        
        const ranges = { '1d': 1, '3d': 3, '7d': 7, '15d': 15, '30d': 30 };
        const days = ranges[(range || '30d').toLowerCase()] || 30;
        const sinceMs = Date.now() - days * 24 * 60 * 60 * 1000;
        
        console.log(`📊 Fetching hype data: ${days} days, sinceMs=${new Date(sinceMs).toISOString()}`);
        
        const snaps = await this.hypeService.getSnapshots(contract, sinceMs);
        console.log(`📊 Retrieved ${snaps.length} hype snapshots for ${contract}`);
        
        res.json({ contract, range: `${days}d`, data: snaps });
      } catch (error) {
        console.error('[🛡️ Enhanced Backend] ❌ Hype snapshots error:', error.message);
        res.status(500).json({ error: 'Failed to fetch hype snapshots' });
      }
    });

    // Social Context (72h-cached, no Twitter API calls)
    this.app.get('/api/tokens/:contract/social-context', async (req, res) => {
      try {
        const { contract } = req.params;
        if (!contract) return res.status(400).json({ success: false, error: 'Missing contract' });

        // 72 hours TTL
        const ttlMs = 72 * 60 * 60 * 1000;

        // Return cached if fresh
        const cached = this._getSocialContextFromCache(contract, ttlMs);
        if (cached) {
          return res.json({ success: true, contract, cached: true, cachedAt: cached.timestamp, data: cached.data });
        }

        // Compose from existing cached token + snapshots (no new Twitter calls)
        const tokens = await this.getTokensFromCache();
        const token = tokens.find(t =>
          t.contractAddress?.toLowerCase() === contract.toLowerCase() ||
          t.symbol?.toLowerCase() === contract.toLowerCase()
        );
        if (!token) return res.status(404).json({ success: false, error: 'Token not found' });

        // Recent snapshots for trend/catalysts
        const sinceMs = Date.now() - ttlMs; // look back 72h for context
        const snaps = await this.hypeService.getSnapshots(token.contractAddress || contract, sinceMs).catch(() => []);
        const last = snaps[snaps.length - 1] || null;
        const prev = snaps[snaps.length - 2] || null;

        // Extract existing social metrics (already fetched earlier, do not call APIs)
        const td = token.twitterData || {};
        const mentions = Number(td.displayMentions || td.mentions || td.mentions24h || 0);
        const likes = Number(td.likes || 0);
        const retweets = Number(td.retweets || 0);
        const replies = Number(td.replies || 0);
        const followers = Number(td.followers || 0);
        const engagement = likes + retweets + replies;

        // Sentiment: use stored percentages if available, otherwise default to neutral
        const sentiments = td.tweetSentiments || td.sentiment || {};
        const sentiment = {
          positive: Math.round(Number(sentiments.positive || 0)),
          negative: Math.round(Number(sentiments.negative || 0)),
          neutral: Math.round(Number(sentiments.neutral || (sentiments.positive || sentiments.negative ? 0 : 100)))
        };

        // Social health score from token cache (computed earlier)
        const socialHealthScore = typeof token.communityHealthScore === 'number'
          ? Number(token.communityHealthScore)
          : (last?.score ?? 0);

        // Build catalysts using simple heuristics (no external calls)
        const catalysts = [];
        const j = token.jupiterData || {};
        const holderChange = j.holderChange; // could be % string or number
        const volumeChange = j.volumeChange ?? j.stats24h?.volumeChange;
        const priceChange = j.priceChange ?? j.stats24h?.priceChange;

        // Mentions trend
        if (prev && last && typeof prev.twitterMentions === 'number' && typeof last.twitterMentions === 'number') {
          if (last.twitterMentions > prev.twitterMentions) catalysts.push('Mentions rising');
        }

        // Holder growth
        if (typeof holderChange === 'number' ? holderChange > 0 : (typeof holderChange === 'string' && holderChange.trim().startsWith('+'))) {
          catalysts.push('Holder base growing');
        }

        // Volume uptick
        if (typeof volumeChange === 'number' && volumeChange > 0) catalysts.push('Volume uptick');

        // Price momentum
        if (typeof priceChange === 'number' && priceChange > 0) catalysts.push('Price momentum');

        // Top hashtags if present
        const topHashtags = Array.isArray(td.topHashtags) ? td.topHashtags.slice(0, 5) : [];

        const payload = {
          socialHealthScore,
          mentions,
          engagement,
          followers,
          sentiment,
          catalysts,
          topHashtags,
          lastSnapshotAt: last?.timestamp || null,
          dataFreshness: td._dataFreshness || 'unknown'
        };

        // Save to cache and return
        await this._setSocialContextCache(contract, payload).catch(() => {});
        return res.json({ success: true, contract, cached: false, data: payload });

      } catch (error) {
        console.error('[🛡️ Enhanced Backend] ❌ Social context error:', error);
        return res.status(500).json({ success: false, error: 'Failed to build social context' });
      }
    });

    // ================================
    // HYPE LIST (per-user selection)
    // ================================
    this.app.get('/api/user/hype', async (req, res) => {
      try {
        const { sessionId } = req.query;
        const user = await this.oauthXService.getUserBySession(sessionId);
        if (!user) return res.status(401).json({ error: 'Invalid session' });
        const list = await this.oauthXService.db.getHypeList(user.id);
        res.json({ success: true, list });
      } catch (e) {
        console.error('[🛡️ Enhanced Backend] ❌ Get hype list error:', e.message);
        res.status(500).json({ error: 'Failed to fetch hype list' });
      }
    });

    this.app.post('/api/user/hype', async (req, res) => {
      try {
        const { sessionId, contractAddress } = req.body;
        if (!sessionId || !contractAddress) return res.status(400).json({ error: 'Missing sessionId or contractAddress' });
        const user = await this.oauthXService.getUserBySession(sessionId);
        if (!user) return res.status(401).json({ error: 'Invalid session' });

        const premiumStatus = await this.oauthXService.db.getPremiumStatus(user.id);
        const isPremium = premiumStatus?.isPremium && new Date(premiumStatus.expiresAt) > new Date();
        const current = await this.oauthXService.db.getHypeList(user.id);
        if (!isPremium && current.length >= 5 && !current.includes(contractAddress)) {
          return res.status(403).json({ error: 'limit_exceeded', message: 'Free users can track up to 5 tokens in Hype over Time. Upgrade to Premium for unlimited.' });
        }

        const list = await this.oauthXService.db.addHypeToken(user.id, contractAddress);
        res.json({ success: true, list });
      } catch (e) {
        console.error('[🛡️ Enhanced Backend] ❌ Add hype token error:', e.message);
        res.status(500).json({ error: 'Failed to add token to hype list' });
      }
    });

    this.app.delete('/api/user/hype/:contract', async (req, res) => {
      try {
        const { sessionId } = req.query;
        const { contract } = req.params;
        if (!sessionId || !contract) return res.status(400).json({ error: 'Missing sessionId or contract' });
        const user = await this.oauthXService.getUserBySession(sessionId);
        if (!user) return res.status(401).json({ error: 'Invalid session' });
        const list = await this.oauthXService.db.removeHypeToken(user.id, contract);
        res.json({ success: true, list });
      } catch (e) {
        console.error('[🛡️ Enhanced Backend] ❌ Remove hype token error:', e.message);
        res.status(500).json({ error: 'Failed to remove token from hype list' });
      }
    });

    // Get BirdEye trending tokens (test endpoint) - DISABLED
    // this.app.get('/api/tokens/birdeye-trending', async (req, res) => {
    //   try {
    //     console.log('[🛡️ Enhanced Backend] 🐦 Getting BirdEye trending tokens...');
    //     const { limit, offset, sort_by, sort_type } = req.query;
    //     const tokens = await this.birdeyeService.fetchTrending({
    //       limit: limit ? Number(limit) : undefined,
    //       offset: offset ? Number(offset) : undefined,
    //       sort_by,
    //       sort_type
    //     });
    //     // Extra safety: filter suspicious/rugged tokens from BirdEye trending output
    //     const filtered = (tokens || []).filter(t => {
    //       // Try to map minimal fields into a shape consumable by isRuggedToken
    //       const mapped = {
    //         jupiterData: {
    //           stats24h: { priceChange: typeof t.priceChange24h === 'number' ? t.priceChange24h : undefined },
    //           stats6h: { priceChange: typeof t.priceChange6h === 'number' ? t.priceChange6h : undefined },
    //           liquidity: typeof t.liquidity === 'number' ? t.liquidity : undefined
    //         }
    //       };
    //       return !this.isSuspiciousToken(t) && !this.isRuggedToken(mapped) && !this.isExcludedMajorOrStable(mapped);
    //     });
    //     console.log(`[🛡️ Enhanced Backend] ✅ BirdEye trending returned ${tokens.length} tokens → ${filtered.length} after filters`);
    //     res.json(filtered);
    //   } catch (error) {
    //     console.error('[🛡️ Enhanced Backend] ❌ BirdEye trending error:', error);
    //     res.status(500).json({ error: 'Failed to fetch BirdEye trending tokens' });
    //   }
    // });

    // ========================================
    // 💳 HELIO PAYMENT ENDPOINTS
    // ========================================

    // Create payment for token listing
    this.app.post('/api/payments/create-token-listing', async (req, res) => {
      try {
        const { tokenData, userId, successUrl, cancelUrl } = req.body;

        if (!tokenData || !tokenData.symbol || !tokenData.name) {
          return res.status(400).json({
            success: false,
            error: 'Token data with symbol and name are required'
          });
        }

        console.log('💳 Creating token listing payment:', tokenData.symbol);

        const paymentResult = await this.helioService.createTokenListingPayment(tokenData, {
          userId: userId,
          successUrl: successUrl,
          cancelUrl: cancelUrl
        });

        res.json({
          success: true,
          payment: paymentResult
        });

      } catch (error) {
        console.error('❌ Error creating token listing payment:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to create payment'
        });
      }
    });

    // Create payment for social links update
    this.app.post('/api/payments/create-social-update', async (req, res) => {
      try {
        const { symbol, socialData, userId } = req.body;

        if (!symbol || !socialData) {
          return res.status(400).json({
            success: false,
            error: 'Symbol and social data are required'
          });
        }

        console.log('💳 Creating social update payment for:', symbol);

        const paymentResult = await this.helioService.createSocialUpdatePayment(symbol, socialData, userId);

        res.json({
          success: true,
          payment: paymentResult
        });

      } catch (error) {
        console.error('❌ Error creating social update payment:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to create social payment'
        });
      }
    });

    // Validate payment completion
    this.app.post('/api/payments/validate', async (req, res) => {
      try {
        const { paymentId, paymentData } = req.body;

        if (!paymentId) {
          return res.status(400).json({
            success: false,
            error: 'Payment ID is required'
          });
        }

        console.log('✅ Validating payment:', paymentId);

        const validationResult = await this.helioService.validatePayment(paymentId, paymentData || {});

        res.json({
          success: validationResult.isValid,
          validation: validationResult
        });

      } catch (error) {
        console.error('❌ Error validating payment:', error);
        res.status(500).json({
          success: false,
          error: 'Payment validation failed'
        });
      }
    });

    // Helio webhook endpoint
    this.app.post('/api/payments/webhook', async (req, res) => {
      try {
        const webhookData = req.body;
        const signature = req.headers['x-helio-signature'];

        console.log('🔔 Received Helio webhook');

        const webhookResult = await this.helioService.processWebhook(webhookData, signature);

        // Process the webhook based on payment type
        if (webhookResult.metadata?.type === 'token_listing') {
          console.log('📝 Processing token listing webhook');

          // Here you could automatically process the token listing
          // For now, just log the successful payment

        } else if (webhookResult.metadata?.type === 'social_update') {
          console.log('📱 Processing social update webhook');

          // Here you could automatically update social links
          // For now, just log the successful payment
        }

        res.json({
          success: true,
          message: 'Webhook processed successfully',
          paymentId: webhookResult.paymentId
        });

      } catch (error) {
        console.error('❌ Webhook processing error:', error);
        res.status(500).json({
          success: false,
          error: 'Webhook processing failed'
        });
      }
    });

    // Get payment status
    this.app.get('/api/payments/:paymentId/status', async (req, res) => {
      try {
        const { paymentId } = req.params;

        console.log('📊 Getting payment status:', paymentId);

        const paymentStatus = await this.helioService.getPaymentStatus(paymentId);

        res.json({
          success: true,
          payment: paymentStatus
        });

      } catch (error) {
        console.error('❌ Error getting payment status:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to get payment status'
        });
      }
    });

    // Get payment history for user
    this.app.get('/api/payments/history/:userId', async (req, res) => {
      try {
        const { userId } = req.params;
        const { limit } = req.query;

        console.log('📜 Getting payment history for:', userId);

        const paymentHistory = await this.helioService.getPaymentHistory(userId, parseInt(limit) || 10);

        res.json({
          success: true,
          history: paymentHistory
        });

      } catch (error) {
        console.error('❌ Error getting payment history:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to get payment history'
        });
      }
    });

    // Demo login endpoint
    this.app.post('/auth/demo-login', (req, res) => {
      try {
        const { username } = req.body;
        
        if (!username) {
          return res.status(400).json({ 
            success: false, 
            message: 'Username is required' 
          });
        }

        // Demo users data
        const demoUsers = {
          'trader1': { id: 'demo1', username: 'trader1', displayName: 'Crypto Trader', profileImage: null },
          'hodler': { id: 'demo2', username: 'hodler', displayName: 'Diamond Hands', profileImage: null },
          'analyst': { id: 'demo3', username: 'analyst', displayName: 'Market Analyst', profileImage: null }
        };

        const user = demoUsers[username];
        if (!user) {
          return res.status(404).json({ 
            success: false, 
            message: 'Demo user not found' 
          });
        }

        // Generate a simple session ID
        const sessionId = `demo_${username}_${Date.now()}`;

        res.json({
          success: true,
          user: user,
          sessionId: sessionId,
          message: 'Demo login successful'
        });

      } catch (error) {
        console.error('Demo login error:', error);
        res.status(500).json({ 
          success: false, 
          message: 'Internal server error' 
        });
      }
    });

    // ========================================
    // 🐦 OAUTH X AUTHENTICATION ENDPOINTS
    // ========================================

    // OAuth X: Start authentication flow
    this.app.get('/auth/x', (req, res) => {
      try {
        const state = crypto.randomUUID();
        const authUrl = this.oauthXService.getAuthorizationUrl(state);
        
        console.log(`🐦 OAuth X: Starting authentication flow for state: ${state}`);
        res.redirect(authUrl);
      } catch (error) {
        console.error('❌ OAuth X error:', error);
        res.status(500).json({ 
          success: false, 
          error: 'Failed to start OAuth flow' 
        });
      }
    });

    // OAuth X: Handle callback
    this.app.get('/auth/callback', async (req, res) => {
      try {
        const { code, state } = req.query;
        
        if (!code) {
          return res.status(400).json({ 
            success: false, 
            error: 'Authorization code not provided' 
          });
        }

        console.log(`🐦 OAuth X: Processing callback with code: ${code.substring(0, 10)}...`);

        // Verify OAuth state if provided (for re-authentication)
        let userId = null;
        let isReAuthentication = false;
        if (state) {
          try {
            userId = await this.oauthXService.verifyOAuthState(state);
            console.log(`🔐 OAuth state verified for user: ${userId}`);
            isReAuthentication = true;
          } catch (stateError) {
            if (stateError.message === 'Invalid OAuth state') {
              console.log(`ℹ️ Regular OAuth flow (no re-authentication state)`);
            } else {
              console.log(`⚠️ OAuth state verification failed: ${stateError.message}`);
            }
            // Continue with normal flow if state verification fails
          }
        }

        // Exchange code for token
        const tokenData = await this.oauthXService.exchangeCodeForToken(code, state);
        
        // Get user profile
        const profile = await this.oauthXService.getUserProfile(tokenData.access_token);
        
        // Create or update user
        const user = await this.oauthXService.createOrUpdateUser(
          profile, 
          tokenData.access_token, 
          tokenData.refresh_token
        );
        
        // Create session
        const { sessionId, expiresAt } = await this.oauthXService.createSession(user.id);
        
        console.log(`✅ OAuth X: User ${user.username} authenticated successfully`);

        // If this was a re-authentication (state was provided and verified), retry failed milestones
        if (isReAuthentication && userId && userId === user.id) {
          console.log(`🔄 Re-authentication detected, retrying failed milestones for user ${userId}...`);
          try {
            await this.milestoneTracker.retryFailedMilestones(userId);
            console.log(`✅ Failed milestones retry completed for user ${userId}`);
          } catch (retryError) {
            console.error(`❌ Error retrying failed milestones: ${retryError.message}`);
            // Don't fail the auth flow if milestone retry fails
          }
        }

        // Redirect to frontend with session
        const frontendUrl = process.env.FRONTEND_URL || 'https://degen-oracle.com';
        res.redirect(`${frontendUrl}/?auth=success&sessionId=${sessionId}`);
        
      } catch (error) {
        console.error('❌ OAuth X callback error:', error);
        const frontendUrl = process.env.FRONTEND_URL || 'https://degen-oracle.com';
        res.redirect(`${frontendUrl}/?auth=error&message=${encodeURIComponent(error.message)}`);
      }
    });

    // Admin: Enable Twitter posting for all users (migration)
    this.app.post('/admin/enable-twitter-posting-all', async (req, res) => {
      try {
        console.log('🔧 Starting Twitter posting enablement for all users...');
        
        // Get all users from the database
        const users = await this.oauthXService.db.getAllUsers();
        console.log(`📊 Found ${users.length} users to check`);
        
        let updatedCount = 0;
        let alreadyEnabledCount = 0;
        let errorCount = 0;
        
        for (const user of users) {
          try {
            // Check if user has Twitter posting enabled
            if (user.twitterPostingEnabled === undefined || user.twitterPostingEnabled === null) {
              // Enable Twitter posting for this user
              await this.oauthXService.setTwitterPostingEnabled(user.id, true);
              console.log(`✅ Enabled Twitter posting for user ${user.username} (${user.id})`);
              updatedCount++;
            } else if (user.twitterPostingEnabled === true) {
              console.log(`✓ User ${user.username} already has Twitter posting enabled`);
              alreadyEnabledCount++;
            } else {
              console.log(`⚠️ User ${user.username} has Twitter posting explicitly disabled - skipping`);
            }
          } catch (error) {
            console.error(`❌ Error updating user ${user.id}:`, error.message);
            errorCount++;
          }
        }
        
        const summary = {
          totalUsers: users.length,
          updated: updatedCount,
          alreadyEnabled: alreadyEnabledCount,
          explicitlyDisabled: users.length - updatedCount - alreadyEnabledCount - errorCount,
          errors: errorCount
        };
        
        console.log('\n🎯 Migration Summary:', summary);
        
        res.json({
          success: true,
          message: 'Twitter posting enablement completed',
          summary
        });
        
      } catch (error) {
        console.error('❌ Migration failed:', error.message);
        res.status(500).json({ 
          success: false, 
          error: 'Migration failed: ' + error.message 
        });
      }
    });

    // Admin: Remove specific token by contract address
    this.app.delete('/admin/remove-token/:contractAddress', async (req, res) => {
      try {
        const { contractAddress } = req.params;
        
        console.log(`🗑️ Removing token: ${contractAddress}`);
        
        // Load tokens from cache
        const tokens = await this.getTokensFromCache();
        const initialCount = tokens.length;
        
        // Filter out the token
        const filteredTokens = tokens.filter(token => 
          token.contractAddress !== contractAddress && 
          token.jupiterData?.contractAddress !== contractAddress
        );
        
        const removedCount = initialCount - filteredTokens.length;
        
        if (removedCount === 0) {
          return res.json({
            success: false,
            message: 'Token not found',
            contractAddress
          });
        }
        
        // 🛡️ ATOMIC WRITE: Save filtered tokens back to cache
        const cachePath = this.persistentCachePath;
        const tempPath = cachePath + '.tmp';
        const jsonData = JSON.stringify(filteredTokens, null, 2);
        
        try {
          // 🚨 CRITICAL FIX: Ensure cache directory exists before atomic write
          const cacheDir = path.dirname(cachePath);
          await fs.mkdir(cacheDir, { recursive: true });
          
          await fs.writeFile(tempPath, jsonData, 'utf8');
          await fs.rename(tempPath, cachePath);
        } catch (error) {
          // Cleanup temp file if it exists
          try {
            await fs.unlink(tempPath);
          } catch (_) {}
          throw error;
        }
        
        console.log(`✅ Removed ${removedCount} token(s) with contract: ${contractAddress}`);
        console.log(`📊 Tokens before: ${initialCount}, after: ${filteredTokens.length}`);
        
        res.json({
          success: true,
          message: `Removed ${removedCount} token(s)`,
          contractAddress,
          removedCount,
          tokensBefore: initialCount,
          tokensAfter: filteredTokens.length
        });
        
      } catch (error) {
        console.error('❌ Error removing token:', error.message);
        res.status(500).json({ 
          success: false, 
          error: 'Failed to remove token: ' + error.message 
        });
      }
    });

    // Admin: Run liquidity cleanup to remove dead tokens
    this.app.post('/admin/run-liquidity-cleanup', async (req, res) => {
      try {
        console.log('🧹 Starting liquidity cleanup...');
        
        // Import and run the cleanup service
        const { default: LiquidityCleanupService } = await import('./liquidityCleanupService.js');
        const cleanupService = new LiquidityCleanupService();
        
        // Run cleanup
        const result = await cleanupService.cleanupLowLiquidityTokens();
        
        console.log('🧹 Liquidity cleanup completed:', result);
        
        res.json({
          success: true,
          message: 'Liquidity cleanup completed',
          result
        });
        
      } catch (error) {
        console.error('❌ Liquidity cleanup failed:', error.message);
        res.status(500).json({ 
          success: false, 
          error: 'Liquidity cleanup failed: ' + error.message 
        });
      }
    });

    // Admin: Cleanup expired fuel flags
    this.app.post('/admin/cleanup-expired-fuel', async (req, res) => {
      try {
        console.log('🧹 Starting cleanup of expired fuel flags...');
        
        // Load tokens cache
        const tokensCachePath = path.join(process.env.DATA_DIR || '/var/data/dgo', 'cache', 'tokens-cache.json');
        const tokens = JSON.parse(await fs.readFile(tokensCachePath, 'utf8'));
        
        console.log(`📊 Loaded ${tokens.length} tokens from cache`);
        
        let cleanedCount = 0;
        let expiredFuelTokens = [];
        
        for (const token of tokens) {
          let needsUpdate = false;
          const updates = {};
          
          // Check if token has fuel flags but expired fuel
          if (token.isPaid || token.isFueled) {
            const now = Date.now();
            let hasActiveFuel = false;
            
            // Check fuel expiry time
            if (token.fuelExpiry) {
              const expiryTime = new Date(token.fuelExpiry).getTime();
              if (expiryTime > now) {
                hasActiveFuel = true;
              }
            }
            
            // Check fuel applications (newer format)
            if (!hasActiveFuel && token.fuelApplications && Array.isArray(token.fuelApplications)) {
              const activeApplications = token.fuelApplications.filter(app => {
                const expiryTime = new Date(app.expiresAt).getTime();
                return expiryTime > now;
              });
              hasActiveFuel = activeApplications.length > 0;
            }
            
            // If no active fuel but still flagged, clean it up
            if (!hasActiveFuel) {
              console.log(`🧹 Cleaning expired fuel for ${token.symbol} (${token.contractAddress?.substring(0, 8)}...)`);
              
              // Remove fuel flags
              if (token.isPaid) {
                updates.isPaid = false;
                needsUpdate = true;
              }
              if (token.isFueled) {
                updates.isFueled = false;
                needsUpdate = true;
              }
              
              // Remove fuel-related fields
              if (token.fuelExpiry) {
                updates.fuelExpiry = undefined;
                needsUpdate = true;
              }
              if (token.fuelApplications) {
                updates.fuelApplications = undefined;
                needsUpdate = true;
              }
              if (token.fuelType) {
                updates.fuelType = undefined;
                needsUpdate = true;
              }
              if (token.boostMultiplier) {
                updates.boostMultiplier = undefined;
                needsUpdate = true;
              }
              
              expiredFuelTokens.push({
                symbol: token.symbol,
                contractAddress: token.contractAddress,
                originalScore: token.overallScore || token.score,
                hadFuelExpiry: !!token.fuelExpiry,
                hadFuelApplications: !!token.fuelApplications
              });
              
              cleanedCount++;
            }
          }
          
          // Apply updates if needed
          if (needsUpdate) {
            Object.assign(token, updates);
          }
        }
        
        // Save updated tokens cache
        if (cleanedCount > 0) {
          await fs.writeFile(tokensCachePath, JSON.stringify(tokens, null, 2));
          console.log(`✅ Updated tokens cache with ${cleanedCount} cleaned tokens`);
        }
        
        // Also check fueled-tokens.json file
        const fueledTokensPath = path.join(process.env.DATA_DIR || '/var/data/dgo', 'fueled-tokens.json');
        let fueledTokensCleaned = 0;
        try {
          const fueledTokens = JSON.parse(await fs.readFile(fueledTokensPath, 'utf8'));
          const now = Date.now();
          
          const activeFueledTokens = fueledTokens.filter(token => {
            if (token.fuelApplications && Array.isArray(token.fuelApplications)) {
              const activeApplications = token.fuelApplications.filter(app => {
                const expiryTime = new Date(app.expiresAt).getTime();
                return expiryTime > now;
              });
              return activeApplications.length > 0;
            } else if (token.fuelExpiry) {
              const expiryTime = new Date(token.fuelExpiry).getTime();
              return expiryTime > now;
            }
            return false; // Remove tokens without proper expiry info
          });
          
          if (activeFueledTokens.length !== fueledTokens.length) {
            await fs.writeFile(fueledTokensPath, JSON.stringify(activeFueledTokens, null, 2));
            fueledTokensCleaned = fueledTokens.length - activeFueledTokens.length;
            console.log(`✅ Cleaned fueled-tokens.json: ${fueledTokens.length} → ${activeFueledTokens.length} active tokens`);
          }
        } catch (error) {
          console.log(`⚠️ Could not clean fueled-tokens.json: ${error.message}`);
        }
        
        res.json({
          success: true,
          message: 'Expired fuel cleanup completed',
          summary: {
            tokensProcessed: tokens.length,
            tokensCleaned: cleanedCount,
            fueledTokensCleaned: fueledTokensCleaned,
            expiredFuelTokens: expiredFuelTokens
          }
        });
        
      } catch (error) {
        console.error('❌ Cleanup failed:', error.message);
        res.status(500).json({
          success: false,
          error: 'Cleanup failed: ' + error.message
        });
      }
    });

    // Monthly Snapshot Endpoints
    this.app.get('/api/leaderboard/monthly/:monthKey', async (req, res) => {
      try {
        const { monthKey } = req.params;
        console.log(`📸 Fetching leaderboard for month: ${monthKey}`);
        
        // Get current leaderboard data
        const allKolCalls = await this.oauthXService.db.getAllKolCalls();
        const userCalls = {};
        allKolCalls.forEach(call => {
          if (!userCalls[call.userId]) {
            userCalls[call.userId] = [];
          }
          userCalls[call.userId].push(call);
        });

        const tokens = await this.getTokensFromCache();
        const currentTokenData = {};
        tokens.forEach(token => {
          currentTokenData[token.contractAddress] = token;
        });

        const leaderboardResult = await this.generateEnhancedLeaderboard(userCalls, currentTokenData);
        
        // Get leaderboard data for the requested month
        const monthData = await this.monthlySnapshotService.getLeaderboardForMonth(monthKey, leaderboardResult.leaderboard);
        
        if (!monthData) {
          return res.status(404).json({ 
            success: false, 
            error: `No data available for month ${monthKey}` 
          });
        }

        res.json({
          success: true,
          month: monthData.month,
          isLive: monthData.isLive,
          timestamp: monthData.timestamp,
          leaderboard: monthData.leaderboard,
          boards: monthData.boards || {},
          boardStats: monthData.boardStats || {},
          metadata: monthData.metadata
        });
      } catch (error) {
        console.error('❌ Failed to fetch monthly leaderboard:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.get('/api/leaderboard/months', async (req, res) => {
      try {
        console.log('📸 Fetching available months...');
        
        // Get current leaderboard data for current month
        const allKolCalls = await this.oauthXService.db.getAllKolCalls();
        const userCalls = {};
        allKolCalls.forEach(call => {
          if (!userCalls[call.userId]) {
            userCalls[call.userId] = [];
          }
          userCalls[call.userId].push(call);
        });

        const tokens = await this.getTokensFromCache();
        const currentTokenData = {};
        tokens.forEach(token => {
          currentTokenData[token.contractAddress] = token;
        });

        const leaderboardResult = await this.generateEnhancedLeaderboard(userCalls, currentTokenData);
        
        const availableMonths = await this.monthlySnapshotService.getAvailableMonths(leaderboardResult.leaderboard);
        
        res.json({
          success: true,
          months: availableMonths,
          currentMonth: this.monthlySnapshotService.getCurrentMonthKey()
        });
      } catch (error) {
        console.error('❌ Failed to fetch available months:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.post('/api/admin/take-snapshot', adminApiAuth, async (req, res) => {
      try {
        console.log('📸 Manual snapshot request...');
        
        // Get current leaderboard data
        const allKolCalls = await this.oauthXService.db.getAllKolCalls();
        const userCalls = {};
        allKolCalls.forEach(call => {
          if (!userCalls[call.userId]) {
            userCalls[call.userId] = [];
          }
          userCalls[call.userId].push(call);
        });

        const tokens = await this.getTokensFromCache();
        const currentTokenData = {};
        tokens.forEach(token => {
          currentTokenData[token.contractAddress] = token;
        });

        const leaderboardResult = await this.generateEnhancedLeaderboard(userCalls, currentTokenData);
        
        const snapshot = await this.monthlySnapshotService.takeSnapshot(leaderboardResult.leaderboard);
        
        res.json({
          success: true,
          snapshot: snapshot,
          message: `Snapshot taken for ${snapshot.month}`
        });
      } catch (error) {
        console.error('❌ Failed to take manual snapshot:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Debug: Test enhanced KOL trust system scoring
    this.app.get('/api/debug/scoring-test', async (req, res) => {
      try {
        console.log('🔍 DEBUG: Testing Enhanced KOL Trust System Scoring...');
        
        // Get all KOL calls
        const allKolCalls = await this.oauthXService.db.getAllKolCalls();
        console.log(`📊 Found ${allKolCalls.length} total KOL calls`);

        // Group calls by user
        const userCalls = {};
        allKolCalls.forEach(call => {
          if (!userCalls[call.userId]) {
            userCalls[call.userId] = [];
          }
          userCalls[call.userId].push(call);
        });

        console.log(`👥 Users with calls: ${Object.keys(userCalls).length}`);
        
        // Get token data
        const tokens = await this.getTokensFromCache();
        console.log(`📊 Found ${tokens.length} tokens in cache`);
        
        // Build current token data
        const currentTokenData = {};
        tokens.forEach(token => {
          currentTokenData[token.contractAddress] = token;
        });

        // Test enhanced KOL trust system with all users
        const userIds = Object.keys(userCalls);
        if (userIds.length === 0) {
          return res.json({ success: false, error: 'No users with calls found' });
        }

        console.log(`🔍 Testing with all ${userIds.length} users:`);
        
        // Test all users
        const allUserResults = {};
        for (const userId of userIds) {
          const userCallsData = userCalls[userId];
          const trustScore = this.kolTrustSystem.calculateKOLTrustScore(userCallsData, currentTokenData);
          
          // Get user info
          const user = await this.oauthXService.getUserById(userId);
          
          allUserResults[userId] = {
            username: user?.username,
            displayName: user?.displayName || user?.username,
            calls: userCallsData.length,
            trustScore: {
              trustScore: trustScore.trustScore,
              hitRate: trustScore.performance?.hitRate,
              goodRate: trustScore.performance?.goodRate,
              excellentRate: trustScore.performance?.excellentRate,
              breakEvenRate: trustScore.performance?.breakEvenRate,
              currentHitRate: trustScore.performance?.currentHitRate,
              currentGoodRate: trustScore.performance?.currentGoodRate,
              currentExcellentRate: trustScore.performance?.currentExcellentRate,
              currentBreakEvenRate: trustScore.performance?.currentBreakEvenRate,
              consistency: trustScore.consistency?.score,
              riskManagement: trustScore.riskManagement?.score,
              trustLevel: trustScore.summary?.trustLevel,
              avgDrawdownFromAth: trustScore.performance?.avgDrawdownFromAth,
              drawdownPenalty: trustScore.performance?.drawdownPenalty
            },
            sampleCall: userCallsData.length > 0 ? {
              contractAddress: userCallsData[0].contractAddress,
              tokenContractAddress: userCallsData[0].token?.contractAddress,
              calledMC: userCallsData[0].calledMc || userCallsData[0].calledMC,
              currentMC: userCallsData[0].currentMC,
              athMC: userCallsData[0].athMC,
              athMultiplier: userCallsData[0].athMultiplier,
              symbol: userCallsData[0].token?.symbol,
              hasTokenData: !!currentTokenData[userCallsData[0].contractAddress || userCallsData[0].token?.contractAddress]
            } : null
          };
          
          console.log(`📊 User ${user?.username || userId}:`, {
            calls: userCallsData.length,
            hitRate: trustScore.performance?.hitRate,
            consistency: trustScore.consistency?.score,
            riskManagement: trustScore.riskManagement?.score,
            trustLevel: trustScore.summary?.trustLevel
          });
        }

        res.json({
          success: true,
          debug: {
            totalCalls: allKolCalls.length,
            usersWithCalls: userIds.length,
            tokensInCache: tokens.length,
            allUsers: allUserResults
          }
        });
      } catch (error) {
        console.error('❌ Debug test failed:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Admin: Enable Twitter posting for specific user
    this.app.post('/admin/enable-twitter-posting/:userId', async (req, res) => {
      try {
        const { userId } = req.params;
        
        console.log(`🔧 Enabling Twitter posting for user ${userId}...`);
        
        // Check current status
        const currentStatus = await this.oauthXService.hasTwitterPostingEnabled(userId);
        console.log(`📊 Current Twitter posting status: ${currentStatus}`);
        
        if (currentStatus) {
          return res.json({
            success: true,
            message: 'User already has Twitter posting enabled',
            alreadyEnabled: true
          });
        }
        
        // Enable Twitter posting
        await this.oauthXService.setTwitterPostingEnabled(userId, true);
        
        // Verify it worked
        const newStatus = await this.oauthXService.hasTwitterPostingEnabled(userId);
        
        if (newStatus) {
          console.log('✅ Successfully enabled Twitter posting for user!');
          res.json({
            success: true,
            message: 'Successfully enabled Twitter posting for user',
            enabled: true
          });
        } else {
          console.error('❌ Failed to enable Twitter posting - status still false');
          res.status(500).json({
            success: false,
            error: 'Failed to enable Twitter posting - status still false'
          });
        }
        
      } catch (error) {
        console.error('❌ Error:', error.message);
        res.status(500).json({ 
          success: false, 
          error: error.message 
        });
      }
    });

    // Admin: Get failed milestones for a user
    this.app.get('/admin/failed-milestones/:userId', async (req, res) => {
      try {
        const { userId } = req.params;
        
        console.log(`🔍 Getting failed milestones for user ${userId}...`);
        
        const failedMilestones = await this.oauthXService.db.getFailedMilestones(userId);
        
        res.json({
          success: true,
          userId,
          failedMilestones,
          count: failedMilestones.length
        });
        
      } catch (error) {
        console.error('❌ Error getting failed milestones:', error.message);
        res.status(500).json({ 
          success: false, 
          error: error.message 
        });
      }
    });

    // Admin: Retry failed milestones for a user
    this.app.post('/admin/retry-milestones/:userId', async (req, res) => {
      try {
        const { userId } = req.params;
        
        console.log(`🔄 Retrying failed milestones for user ${userId}...`);
        
        // Retry failed milestones
        await this.milestoneTracker.retryFailedMilestones(userId);
        
        res.json({
          success: true,
          message: 'Failed milestones retry completed',
          userId
        });
        
      } catch (error) {
        console.error('❌ Error retrying milestones:', error.message);
        res.status(500).json({ 
          success: false, 
          error: error.message 
        });
      }
    });

    // Admin: Get failed call tweets for a user
    this.app.get('/admin/failed-call-tweets/:userId', async (req, res) => {
      try {
        const { userId } = req.params;
        
        console.log(`🔍 Getting failed call tweets for user ${userId}...`);
        
        const failedCallTweetService = new (await import('./failedCallTweetService.js')).default();
        const failedCallTweets = await failedCallTweetService.getFailedCallTweets(userId);
        
        res.json({
          success: true,
          userId,
          failedCallTweets,
          count: failedCallTweets.length
        });
        
      } catch (error) {
        console.error('❌ Error getting failed call tweets:', error.message);
        res.status(500).json({ 
          success: false, 
          error: error.message 
        });
      }
    });

    // Admin: Retry failed call tweets for a user
    this.app.post('/admin/retry-call-tweets/:userId', async (req, res) => {
      try {
        const { userId } = req.params;
        
        console.log(`🔄 Retrying failed call tweets for user ${userId}...`);
        
        const failedCallTweetService = new (await import('./failedCallTweetService.js')).default();
        const retryResult = await failedCallTweetService.retryFailedCallTweets(userId);
        
        res.json({
          success: true,
          message: 'Failed call tweets retry completed',
          userId,
          retried: retryResult.retried || 0,
          errors: retryResult.errors || 0,
          total: retryResult.total || 0
        });
        
      } catch (error) {
        console.error('❌ Error retrying call tweets:', error.message);
        res.status(500).json({ 
          success: false, 
          error: error.message 
        });
      }
    });

    // User: Get Twitter re-authentication URL
    this.app.get('/api/twitter/reauth-url', async (req, res) => {
      try {
        const { userId } = req.query;
        
        if (!userId) {
          return res.status(400).json({
            success: false,
            error: 'User ID required'
          });
        }

        // Generate state for OAuth
        const state = crypto.randomBytes(32).toString('hex');
        
        // Store state with user ID for verification
        await this.oauthXService.storeOAuthState(state, userId);
        
        // Generate authorization URL
        const authUrl = this.oauthXService.getAuthorizationUrl(state);
        
        res.json({
          success: true,
          authUrl,
          message: 'Please visit this URL to re-authenticate with Twitter'
        });
        
      } catch (error) {
        console.error('❌ Error generating re-auth URL:', error.message);
        res.status(500).json({ 
          success: false, 
          error: error.message 
        });
      }
    });

    // User: Check Twitter authentication status
    this.app.get('/api/twitter/auth-status', async (req, res) => {
      try {
        const { userId } = req.query;
        
        if (!userId) {
          return res.status(400).json({
            success: false,
            error: 'User ID required'
          });
        }

        // Get user and check Twitter token status
        const user = await this.oauthXService.getUserById(userId);
        if (!user) {
          return res.status(404).json({
            success: false,
            error: 'User not found'
          });
        }

        // Check if user has valid Twitter tokens
        const hasValidTokens = user.access_token && user.refresh_token;
        const needsReauth = !hasValidTokens;

        // Check for failed milestones that need retry
        const failedMilestones = await this.milestoneTracker.getFailedMilestones(userId);
        const hasFailedMilestones = failedMilestones && failedMilestones.length > 0;

        res.json({
          success: true,
          needsReauth,
          hasValidTokens,
          hasFailedMilestones,
          failedMilestonesCount: hasFailedMilestones ? failedMilestones.length : 0,
          message: needsReauth ? 'Twitter authentication expired. Please re-authenticate.' : 'Twitter authentication is valid.'
        });
        
      } catch (error) {
        logger.error('❌ Error checking Twitter auth status:', error.message);
        res.status(500).json({ 
          success: false, 
          error: error.message 
        });
      }
    });

    // User: Automatically refresh Twitter token
    this.app.post('/api/twitter/refresh-token', async (req, res) => {
      try {
        const { userId } = req.body;
        
        if (!userId) {
          return res.status(400).json({
            success: false,
            error: 'User ID required'
          });
        }

        // Get user
        const user = await this.oauthXService.getUserById(userId);
        if (!user) {
          return res.status(404).json({
            success: false,
            error: 'User not found'
          });
        }

        // Check if user has refresh token
        if (!user.refresh_token) {
          return res.status(400).json({
            success: false,
            error: 'No refresh token available. User needs to re-authenticate.',
            needsReauth: true
          });
        }

        // Attempt to refresh the token
        try {
          const newTokens = await this.oauthXService.refreshAccessToken(user.refresh_token);
          
          // Update user with new tokens
          await this.oauthXService.db.updateUserTokens(userId, newTokens.access_token, newTokens.refresh_token);
          
          logger.info(`✅ Successfully refreshed Twitter tokens for user ${userId}`);
          
          // Retry any failed milestones
          const retryResult = await this.milestoneTracker.retryFailedMilestones(userId);
          
          // 🚨 NEW: Retry any failed call tweets
          const failedCallTweetService = new (await import('./failedCallTweetService.js')).default();
          const callTweetRetryResult = await failedCallTweetService.retryFailedCallTweets(userId);
          
          res.json({
            success: true,
            message: 'Twitter token refreshed successfully',
            tokensRefreshed: true,
            milestonesRetried: retryResult?.retriedCount || 0,
            callTweetsRetried: callTweetRetryResult?.retried || 0
          });
          
        } catch (refreshError) {
          logger.error(`❌ Token refresh failed for user ${userId}:`, refreshError.message);
          
          // If refresh fails, user needs to re-authenticate
          return res.status(400).json({
            success: false,
            error: 'Token refresh failed. User needs to re-authenticate.',
            needsReauth: true,
            details: refreshError.message
          });
        }
        
      } catch (error) {
        logger.error('❌ Error refreshing Twitter token:', error.message);
        res.status(500).json({ 
          success: false, 
          error: error.message 
        });
      }
    });

    // Admin: Check which users have refresh tokens
    this.app.get('/api/admin/users/refresh-token-status', adminApiAuth, async (req, res) => {
      try {
        const users = await this.db.getAllUsers();
        const userStatus = [];
        
        for (const user of users) {
          const profile = await this.db.getUserProfile(user.id);
          userStatus.push({
            id: user.id,
            username: user.username,
            displayName: user.displayName,
            hasRefreshToken: !!profile.refreshToken,
            refreshTokenLength: profile.refreshToken?.length || 0,
            lastLogin: profile.lastLogin,
            isPremium: user.isPremium
          });
        }
        
        res.json({
          success: true,
          totalUsers: users.length,
          usersWithRefreshTokens: userStatus.filter(u => u.hasRefreshToken).length,
          usersWithoutRefreshTokens: userStatus.filter(u => !u.hasRefreshToken).length,
          userStatus
        });
        
      } catch (error) {
        console.error('❌ Error checking refresh token status:', error);
        res.status(500).json({ 
          success: false, 
          error: 'Failed to check refresh token status' 
        });
      }
    });

    // User: Get users with expired Twitter tokens (for admin)
    this.app.get('/api/admin/twitter/expired-tokens', adminApiAuth, async (req, res) => {
      try {
        const users = await this.oauthXService.db.getAllUsers();
        const usersWithExpiredTokens = [];

        for (const user of users) {
          const hasValidTokens = user.access_token && user.refresh_token;
          if (!hasValidTokens) {
            const failedMilestones = await this.milestoneTracker.getFailedMilestones(user.id);
            usersWithExpiredTokens.push({
              id: user.id,
              username: user.username,
              hasFailedMilestones: failedMilestones && failedMilestones.length > 0,
              failedMilestonesCount: failedMilestones ? failedMilestones.length : 0,
              lastLogin: user.lastLogin
            });
          }
        }

        res.json({
          success: true,
          usersWithExpiredTokens,
          count: usersWithExpiredTokens.length
        });
        
      } catch (error) {
        logger.error('❌ Error getting users with expired tokens:', error.message);
        res.status(500).json({ 
          success: false, 
          error: error.message 
        });
      }
    });

    // Admin: Automatically refresh all Twitter tokens
    this.app.post('/api/admin/twitter/refresh-all-tokens', adminApiAuth, async (req, res) => {
      try {
        const users = await this.oauthXService.db.getAllUsers();
        const results = {
          total: users.length,
          refreshed: 0,
          failed: 0,
          needsReauth: 0,
          errors: []
        };

        for (const user of users) {
          try {
            // Only attempt refresh if user has refresh token
            if (user.refresh_token) {
              const newTokens = await this.oauthXService.refreshAccessToken(user.refresh_token);
              await this.oauthXService.db.updateUserTokens(user.id, newTokens.access_token, newTokens.refresh_token);
              
              // Retry failed milestones
              await this.milestoneTracker.retryFailedMilestones(user.id);
              
              // 🚨 NEW: Retry failed call tweets
              const failedCallTweetService = new (await import('./failedCallTweetService.js')).default();
              await failedCallTweetService.retryFailedCallTweets(user.id);
              
              results.refreshed++;
              logger.info(`✅ Refreshed tokens for user ${user.username} (${user.id})`);
            } else {
              results.needsReauth++;
              logger.warn(`⚠️ User ${user.username} (${user.id}) needs re-authentication - no refresh token`);
            }
          } catch (error) {
            results.failed++;
            results.errors.push({
              userId: user.id,
              username: user.username,
              error: error.message
            });
            logger.error(`❌ Failed to refresh tokens for user ${user.username} (${user.id}):`, error.message);
          }
        }

        res.json({
          success: true,
          message: `Token refresh completed: ${results.refreshed} refreshed, ${results.failed} failed, ${results.needsReauth} need re-auth`,
          results
        });
        
      } catch (error) {
        logger.error('❌ Error refreshing all Twitter tokens:', error.message);
        res.status(500).json({ 
          success: false, 
          error: error.message 
        });
      }
    });

    // OAuth X: Validate session
    this.app.get('/auth/validate', async (req, res) => {
      try {
        const { sessionId } = req.query;
        
        if (!sessionId) {
          return res.status(400).json({ 
            success: false, 
            error: 'Session ID required' 
          });
        }

        const user = await this.oauthXService.getUserBySession(sessionId);
        
        if (!user) {
          return res.status(401).json({ 
            success: false, 
            error: 'Invalid or expired session' 
          });
        }

        // Get premium status
        const premiumStatus = await this.oauthXService.db.getPremiumStatus(user.id);
        const isPremium = premiumStatus?.isPremium && 
          (!premiumStatus.expiresAt || new Date(premiumStatus.expiresAt) > new Date());

        res.json({
          success: true,
          user: {
            id: user.id,
            username: user.username,
            displayName: user.displayName,
            profileImage: user.profileImage,
            verified: user.verified,
            followersCount: user.followersCount,
            followingCount: user.followingCount,
            tweetCount: user.tweetCount,
            createdAt: user.createdAt,
            lastLogin: user.lastLogin,
            referralCode: user.referralCode,
            preferences: user.preferences,
            stats: user.stats,
            isPremium: isPremium,
            premiumExpiry: premiumStatus?.expiresAt || null,
            subscriptionType: premiumStatus?.subscriptionType || null
          }
        });
        
      } catch (error) {
        console.error('❌ Session validation error:', error);
        res.status(500).json({ 
          success: false, 
          error: 'Failed to validate session' 
        });
      }
    });

    // OAuth X: Logout
    this.app.post('/auth/logout', async (req, res) => {
      try {
        const { sessionId } = req.body;
        
        if (sessionId) {
          await this.oauthXService.logout(sessionId);
        }

        res.json({
          success: true,
          message: 'Logged out successfully'
        });
        
      } catch (error) {
        console.error('❌ Logout error:', error);
        res.status(500).json({ 
          success: false, 
          error: 'Failed to logout' 
        });
      }
    });

    // ========================================
    // 👤 USER MANAGEMENT ENDPOINTS
    // ========================================

    // Get user profile
    this.app.get('/api/user/profile', async (req, res) => {
      try {
        const { sessionId } = req.query;
        
        if (!sessionId) {
          return res.status(401).json({ 
            success: false, 
            error: 'Authentication required' 
          });
        }

        const user = await this.oauthXService.getUserBySession(sessionId);

        if (!user) {
          return res.status(401).json({
            success: false,
            error: 'Invalid session'
          });
        }

        // Get premium status
        const premiumStatus = await this.oauthXService.db.getPremiumStatus(user.id);
        const isPremium = premiumStatus?.isPremium &&
          (!premiumStatus.expiresAt || new Date(premiumStatus.expiresAt) > new Date());

        // Get user stats for tokens fueled
        const userStats = user.stats || {};
        const tokensFueled = userStats.tokensFueled || 0;
        const tokensListed = userStats.tokensListed || 0;
        const tokensUpdated = userStats.tokensUpdated || 0;
        
        console.log(`[🛡️ Enhanced Backend] 📊 User stats for ${user.username}:`, {
          tokensFueled,
          tokensListed,
          tokensUpdated,
          userStats
        });

        res.json({
          success: true,
          user: {
            id: user.id,
            username: user.username,
            displayName: user.displayName,
            profileImage: user.profileImage,
            verified: user.verified,
            followersCount: user.followersCount,
            followingCount: user.followingCount,
            tweetCount: user.tweetCount,
            createdAt: user.createdAt,
            lastLogin: user.lastLogin,
            referralCode: user.referralCode,
            preferences: user.preferences,
            stats: user.stats,
            tokensFueled: tokensFueled,
            tokensListed: tokensListed,
            tokensUpdated: tokensUpdated,
            isPremium: isPremium,
            premiumExpiry: premiumStatus?.expiresAt || null,
            subscriptionType: premiumStatus?.subscriptionType || null
          }
        });
        
      } catch (error) {
        console.error('❌ Get user profile error:', error);
        res.status(500).json({ 
          success: false, 
          error: 'Failed to get user profile' 
        });
      }
    });

    // Update user preferences
    this.app.post('/api/user/preferences', async (req, res) => {
      try {
        const { sessionId, preferences } = req.body;
        
        if (!sessionId) {
          return res.status(401).json({ 
            success: false, 
            error: 'Authentication required' 
          });
        }

        const user = await this.oauthXService.getUserBySession(sessionId);
        
        if (!user) {
          return res.status(401).json({ 
            success: false, 
            error: 'Invalid session' 
          });
        }

        const updatedUser = await this.oauthXService.updateUser(user.id, { preferences });
        
        res.json({
          success: true,
          preferences: updatedUser.preferences
        });
        
      } catch (error) {
        console.error('❌ Update preferences error:', error);
        res.status(500).json({ 
          success: false, 
          error: 'Failed to update preferences' 
        });
      }
    });

    // ========================================
    // ⭐ WATCHLIST ENDPOINTS
    // ========================================

    // Get user's watchlist
    this.app.get('/api/user/watchlist', async (req, res) => {
      try {
        const { sessionId } = req.query;
        
        if (!sessionId) {
          return res.status(401).json({ 
            success: false, 
            error: 'Authentication required' 
          });
        }

        const user = await this.oauthXService.getUserBySession(sessionId);
        
        if (!user) {
          return res.status(401).json({ 
            success: false, 
            error: 'Invalid session' 
          });
        }

        const watchlist = await this.oauthXService.getWatchlist(user.id);
        
        res.json({
          success: true,
          watchlist: watchlist
        });
        
      } catch (error) {
        console.error('❌ Get watchlist error:', error);
        res.status(500).json({ 
          success: false, 
          error: 'Failed to get watchlist' 
        });
      }
    });

    // Add token to watchlist
    this.app.post('/api/user/watchlist/add', async (req, res) => {
      try {
        console.log('🎯 [WATCHLIST DEBUG] Add to watchlist request received');
        console.log('🎯 [WATCHLIST DEBUG] Request body:', JSON.stringify(req.body, null, 2));
        
        const { sessionId, tokenData } = req.body;
        
        if (!sessionId) {
          console.log('❌ [WATCHLIST DEBUG] Missing sessionId');
          return res.status(401).json({ 
            success: false, 
            error: 'Authentication required' 
          });
        }

        console.log('🎯 [WATCHLIST DEBUG] SessionId provided:', sessionId.substring(0, 8) + '...');

        const user = await this.oauthXService.getUserBySession(sessionId);
        
        if (!user) {
          console.log('❌ [WATCHLIST DEBUG] Invalid session - user not found');
          return res.status(401).json({ 
            success: false, 
            error: 'Invalid session' 
          });
        }

        console.log('✅ [WATCHLIST DEBUG] User found:', user.id, user.username);
        console.log('🎯 [WATCHLIST DEBUG] Token data to add:', JSON.stringify(tokenData, null, 2));

        const watchlist = await this.oauthXService.addToWatchlist(user.id, tokenData);
        
        console.log('✅ [WATCHLIST DEBUG] Successfully added to watchlist');
        console.log('🎯 [WATCHLIST DEBUG] Updated watchlist length:', watchlist?.length || 'unknown');
        
        res.json({
          success: true,
          watchlist: watchlist,
          message: `${tokenData.symbol} added to watchlist`
        });
        
      } catch (error) {
        console.error('❌ [WATCHLIST DEBUG] Add to watchlist error:', error);
        console.error('❌ [WATCHLIST DEBUG] Error stack:', error.stack);
        res.status(500).json({ 
          success: false, 
          error: 'Failed to add to watchlist',
          details: error.message
        });
      }
    });

    // Remove token from watchlist
    this.app.post('/api/user/watchlist/remove', async (req, res) => {
      try {
        const { sessionId, symbol, contractAddress } = req.body;
        
        if (!sessionId) {
          return res.status(401).json({ 
            success: false, 
            error: 'Authentication required' 
          });
        }

        const user = await this.oauthXService.getUserBySession(sessionId);
        
        if (!user) {
          return res.status(401).json({ 
            success: false, 
            error: 'Invalid session' 
          });
        }

        const watchlist = await this.oauthXService.removeFromWatchlist(user.id, symbol, contractAddress);
        
        res.json({
          success: true,
          watchlist: watchlist,
          message: `${symbol} removed from watchlist`
        });
        
      } catch (error) {
        console.error('❌ Remove from watchlist error:', error);
        res.status(500).json({ 
          success: false, 
          error: 'Failed to remove from watchlist' 
        });
      }
    });

    // Check if token is in watchlist
    this.app.get('/api/user/watchlist/check/:symbol', async (req, res) => {
      try {
        const { sessionId, contractAddress } = req.query;
        const { symbol } = req.params;
        
        if (!sessionId) {
          return res.status(401).json({ 
            success: false, 
            error: 'Authentication required' 
          });
        }

        const user = await this.oauthXService.getUserBySession(sessionId);
        
        if (!user) {
          return res.status(401).json({ 
            success: false, 
            error: 'Invalid session' 
          });
        }

        const isInWatchlist = await this.oauthXService.isInWatchlist(user.id, symbol, contractAddress);
        
        res.json({
          success: true,
          isInWatchlist: isInWatchlist
        });
        
      } catch (error) {
        console.error('❌ Check watchlist error:', error);
        res.status(500).json({ 
          success: false, 
          error: 'Failed to check watchlist' 
        });
      }
    });

    // Update Token Socials endpoint
    this.app.post('/api/tokens/update-socials', async (req, res) => {
      try {
        const { symbol, socials, userId, paymentData } = req.body;
        
        console.log('🔄 Update Token Socials request:', { symbol, socials, userId });
        
        if (!symbol || !socials) {
          return res.status(400).json({
            success: false,
            message: 'Symbol and socials are required'
          });
        }

        if (!userId) {
          return res.status(401).json({
            success: false,
            message: 'Authentication required - please login to update token socials'
          });
        }

        // Import UpdateTokenService
        const { default: UpdateTokenService } = await import('./updateTokenService.js');
        const updateService = new UpdateTokenService();

        // Check if user can update this token
        const canUpdate = await updateService.canUserUpdateToken(userId, symbol);
        if (!canUpdate.canUpdate) {
          return res.status(403).json({
            success: false,
            message: canUpdate.reason || 'Not authorized to update this token'
          });
        }

        // Update token socials
        const result = await updateService.updateTokenSocials(symbol, socials, userId, paymentData);
        
        // Update user stats for social update
        const statsUpdateResult = await this.updateUserStats(userId, 'tokensUpdated', 1);
        if (statsUpdateResult === null) {
          console.error(`[🛡️ Enhanced Backend] ❌ Failed to update tokensUpdated stat for user ${userId}`);
        } else {
          console.log(`[🛡️ Enhanced Backend] ✅ Successfully updated tokensUpdated stat for user ${userId}: ${statsUpdateResult}`);
        }

        // Update totalSpent for social update ($35.00)
        const totalSpentResult = await this.updateUserStats(userId, 'totalSpent', 35.00);
        if (totalSpentResult === null) {
          console.error(`[🛡️ Enhanced Backend] ❌ Failed to update totalSpent stat for user ${userId}`);
        } else {
          console.log(`[🛡️ Enhanced Backend] ✅ Successfully updated totalSpent stat for user ${userId}: +$35.00 (total: $${totalSpentResult})`);
        }

        // Record earning for admin panel
        try {
          await this.oauthXService.db.addEarning({
            type: 'social_update',
            category: 'social_update',
            amount: 35.00,
            currency: 'USD',
            userId: userId,
            symbol: symbol,
            createdAt: new Date().toISOString()
          });
          console.log(`[🛡️ Enhanced Backend] ✅ Recorded social update earning: $35.00 from user ${userId} for ${symbol}`);
        } catch (earningError) {
          console.error(`[🛡️ Enhanced Backend] ❌ Failed to record social update earning:`, earningError.message);
        }
        
        res.json({
          success: true,
          ...result
        });

      } catch (error) {
        console.error('❌ Update socials error:', error);
        res.status(500).json({
          success: false,
          message: error.message || 'Failed to update token socials'
        });
      }
    });

    // Get Token Socials endpoint
    this.app.get('/api/tokens/:symbol/socials', async (req, res) => {
      try {
        const { symbol } = req.params;
        
        const { default: UpdateTokenService } = await import('./updateTokenService.js');
        const updateService = new UpdateTokenService();
        
        const socials = await updateService.getTokenSocials(symbol);
        
        res.json({
          success: true,
          symbol: symbol,
          socials: socials
        });

      } catch (error) {
        console.error('❌ Get socials error:', error);
        res.status(500).json({
          success: false,
          message: 'Failed to get token socials'
        });
      }
    });

    // KOL Calls: add a call and fetch list
    this.app.post('/api/user/kol-calls/add', async (req, res) => {
      try {
        console.log('[🛡️ Enhanced Backend] 📥 KOL call request received:', {
          sessionId: !!req.body.sessionId,
          token: req.body.token,
          thesis: req.body.thesis ? req.body.thesis.substring(0, 50) + '...' : 'none',
          twitterEnabled: req.body.twitterEnabled,
          tone: req.body.tone
        });
        
        const { sessionId, token, thesis, twitterEnabled, tone } = req.body; // token: { symbol, name, contractAddress }
        if (!sessionId || !token?.contractAddress) {
          console.log('[🛡️ Enhanced Backend] ❌ Validation failed:', {
            sessionId: !!sessionId,
            tokenContractAddress: !!token?.contractAddress,
            token: token
          });
          return res.status(400).json({ error: 'Missing sessionId or token.contractAddress' });
        }
        const user = await this.oauthXService.getUserBySession(sessionId);
        if (!user) return res.status(401).json({ error: 'Invalid session' });

        // Prevent duplicate calls per token per user
        try {
          const existingCalls = await this.oauthXService.db.getKolCalls(user.id);
          const already = (existingCalls || []).some(c =>
            (c?.token?.contractAddress || '').toLowerCase() === token.contractAddress.toLowerCase()
          );
          if (already) {
            return res.status(409).json({ error: 'already_called', message: "Come on chad! You already called this one!" });
          }
        } catch (_) {}

        // Check premium limits for free users
        const premiumStatus = await this.oauthXService.db.getPremiumStatus(user.id);
        const isPremium = premiumStatus?.isPremium && new Date(premiumStatus.expiresAt) > new Date();
        
        if (!isPremium) {
          const callsThisMonth = await this.oauthXService.db.getKolCallsThisMonth(user.id);
          if (callsThisMonth >= 1) {
            return res.status(403).json({ 
              error: 'limit_exceeded',
              message: 'Free users can only make 1 call per month. Upgrade to Premium for unlimited calls!' 
            });
          }
        }

        // Fresh Jupiter snapshot for called MC
        const jData = await this.tokenProcessor.jupiterService.getTokenDetails(token.contractAddress);
        const calledMC = Number(jData?.mcap || jData?.fdv || 0) || 0;
        const price = Number(jData?.usdPrice || 0) || 0;
        const holderCount = Number(jData?.holderCount || 0) || 0;

        // Use frontend-generated thesis or generate fallback
        let finalThesis = thesis;
        let twitterPostId = null;
        
        // Note: Thesis generation logging is handled in the generate-thesis endpoint
        
        // If no thesis provided, generate one
        if (!finalThesis) {
          try {
            const tokenData = {
              symbol: token.symbol,
              name: token.name,
              contractAddress: token.contractAddress,
              jupiterData: jData
            };
            
            const callData = {
              calledMc: calledMC,
              calledPrice: price,
              calledAt: new Date().toISOString()
            };

            // Use provided tone or default to bullish
            const selectedTone = tone || 'bullish';
            console.log(`🧠 Generating ${selectedTone} thesis for ${token.symbol}...`);
            finalThesis = await this.callThesisGenerator.generateCallThesis(tokenData, callData, { tone: selectedTone });
            
            console.log(`🧠 Generated ${selectedTone} thesis for ${token.symbol}: ${finalThesis}`);
          } catch (error) {
            console.error(`❌ Failed to generate thesis for ${token.symbol}:`, error.message);
            finalThesis = `Calling ${token.symbol} based on our analytics engine signals. Track it on degen-oracle.com — let's see where this goes. NFA`;
            console.log(`🧠 Using fallback thesis for ${token.symbol}: ${finalThesis}`);
          }
        } else {
          console.log(`📝 Using frontend-generated thesis for ${token.symbol}: ${finalThesis}`);
        }
        
        console.log(`🧠 Final thesis for ${token.symbol}:`, {
          thesis: finalThesis,
          length: finalThesis?.length || 0,
          hasThesis: !!finalThesis
        });

        // Use frontend twitterEnabled flag or check user preference
        const hasTwitterPosting = twitterEnabled !== undefined ? twitterEnabled : await this.oauthXService.hasTwitterPostingEnabled(user.id);
        
        console.log(`🐦 Twitter posting check for ${token.symbol}:`, {
          twitterEnabled,
          hasTwitterPosting,
          hasThesis: !!finalThesis,
          userId: user.id
        });
        
        // Post to Twitter if enabled
        if (hasTwitterPosting && finalThesis) {
          try {
            console.log(`🐦 Attempting to post tweet for ${token.symbol}...`);
            const tweet = await this.oauthXService.postTweet(user.id, finalThesis);
            twitterPostId = tweet.id;
            console.log(`🐦 Posted call tweet for ${token.symbol}: ${twitterPostId}`);
          } catch (error) {
            console.error(`❌ Failed to post tweet for ${token.symbol}:`, error.message);
            console.error(`❌ Twitter posting error details:`, error);
            
            // 🚨 NEW: Store failed call tweet for retry when user re-authenticates
            if (error.message.includes('Access token expired') || error.message.includes('no refresh token')) {
              console.log(`💾 Storing failed call tweet for retry when user re-authenticates...`);
              // We'll store this after we create the call data
            }
          }
        } else {
          console.log(`🐦 Skipping Twitter post for ${token.symbol}:`, {
            reason: !hasTwitterPosting ? 'Twitter posting disabled' : 'No thesis available'
          });
        }

        const callData = {
          token: {
            symbol: token.symbol,
            name: token.name,
            contractAddress: token.contractAddress
          },
          calledMc: calledMC,
          currentMC: calledMC, // Same as called MC at time of call
          calledPrice: price,
          holderCount: holderCount,
          calledAt: new Date().toISOString(),
          thesis: finalThesis,
          twitterPostId: twitterPostId,
          twitterEnabled: hasTwitterPosting,
          tone: tone || 'bullish'
        };
        
        console.log(`💾 Saving call data for ${token.symbol}:`, {
          thesis: callData.thesis,
          hasThesis: !!callData.thesis,
          twitterPostId: callData.twitterPostId,
          hasTwitterPost: !!callData.twitterPostId,
          twitterEnabled: callData.twitterEnabled,
          tone: callData.tone
        });
        
        const saved = await this.oauthXService.db.addKolCall(user.id, callData);

        // 🚨 NEW: Store failed call tweet for retry if Twitter posting failed due to auth issues
        if (hasTwitterPosting && finalThesis && !twitterPostId) {
          try {
            // Check if we had a Twitter auth error
            const failedCallTweetService = new (await import('./failedCallTweetService.js')).default();
            await failedCallTweetService.storeFailedCallTweet(user.id, saved, new Error('Twitter authentication expired'));
            console.log(`💾 Stored failed call tweet for ${token.symbol} - will retry when user re-authenticates`);
          } catch (storeError) {
            console.error(`❌ Failed to store failed call tweet:`, storeError.message);
          }
        }

        // Increment usage counter for free users
        if (!isPremium) {
          await this.oauthXService.db.incrementKolCallUsage(user.id);
        }

        // Boost token priority for 1 hour after KOL call
        try {
          await this.priorityQueue.boostTokenPriority(token.contractAddress, 3600000); // 1 hour
          console.log(`[🛡️ Enhanced Backend] 🚀 Boosted ${token.symbol} to HIGH priority after KOL call`);
        } catch (error) {
          console.error('[🛡️ Enhanced Backend] ⚠️ Failed to boost priority after KOL call:', error.message);
        }

        // Send push notifications to mobile users
        try {
          const notificationData = {
            id: saved.id,
            user: {
              id: user.id,
              username: user.username,
              displayName: user.displayName
            },
            token: {
              symbol: token.symbol,
              name: token.name,
              contractAddress: token.contractAddress,
              icon: token.icon
            },
            calledMC: callData.calledMC,
            thesis: callData.thesis
          };
          
          const notificationResult = await this.pushNotificationService.sendKolCallNotification(notificationData);
          console.log(`[🛡️ Enhanced Backend] 📱 Push notifications sent: ${notificationResult.sent}/${notificationResult.total} devices`);
        } catch (error) {
          console.error('[🛡️ Enhanced Backend] ⚠️ Failed to send push notifications:', error.message);
        }

        res.json({ success: true, call: saved });
      } catch (error) {
        console.error('[🛡️ Enhanced Backend] ❌ Add KOL call error:', error.message);
        res.status(500).json({ error: 'Failed to save KOL call' });
      }
    });

    this.app.get('/api/user/kol-calls', async (req, res) => {
      try {
        const { sessionId, userId } = req.query;
        const user = await this.oauthXService.getUserBySession(sessionId);
        if (!user) return res.status(401).json({ error: 'Invalid session' });
        
        // Use provided userId or default to current user's ID
        const targetUserId = userId || user.id;
        const calls = await this.oauthXService.db.getKolCalls(targetUserId);
        
        // Calculate user stats from KOL calls
        const userStats = await this.calculateUserStatsFromCalls(calls);
        
        // Debug milestone posts
        const callsWithMilestones = calls.filter(c => c.milestonePosts && c.milestonePosts.length > 0);
        if (callsWithMilestones.length > 0) {
          console.log(`📊 Found ${callsWithMilestones.length} calls with milestone posts:`, 
            callsWithMilestones.map(c => ({
              id: c.id,
              symbol: c.token?.symbol,
              milestoneCount: c.milestonePosts.length,
              milestones: c.milestonePosts.map(p => `${p.milestone}x`)
            }))
          );
        }
        
        res.json({ 
          success: true, 
          calls: calls || [],
          stats: userStats
        });
      } catch (error) {
        console.error('[🛡️ Enhanced Backend] ❌ Get KOL calls error:', error.message);
        res.status(500).json({ error: 'Failed to fetch KOL calls' });
      }
    });

    this.app.delete('/api/user/kol-calls/:id', async (req, res) => {
      try {
        const { sessionId } = req.query;
        const { id } = req.params;
        if (!sessionId || !id) return res.status(400).json({ error: 'Missing sessionId or id' });
        const user = await this.oauthXService.getUserBySession(sessionId);
        if (!user) return res.status(401).json({ error: 'Invalid session' });
        const result = await this.oauthXService.db.deleteKolCall(user.id, id);
        res.json({ success: true, ...result });
      } catch (error) {
        console.error('[🛡️ Enhanced Backend] ❌ Delete KOL call error:', error.message);
        res.status(500).json({ error: 'Failed to delete KOL call' });
      }
    });

    // Twitter posting preferences
    this.app.post('/api/user/twitter-posting', async (req, res) => {
      try {
        const { sessionId, enabled } = req.body;
        if (!sessionId || typeof enabled !== 'boolean') {
          return res.status(400).json({ error: 'Missing sessionId or enabled flag' });
        }
        
        const user = await this.oauthXService.getUserBySession(sessionId);
        if (!user) return res.status(401).json({ error: 'Invalid session' });
        
        await this.oauthXService.setTwitterPostingEnabled(user.id, enabled);
        res.json({ success: true, twitterPostingEnabled: enabled });
      } catch (error) {
        console.error('[🛡️ Enhanced Backend] ❌ Set Twitter posting error:', error.message);
        res.status(500).json({ error: 'Failed to update Twitter posting preference' });
      }
    });

    // Get Twitter posting status
    this.app.get('/api/user/twitter-posting', async (req, res) => {
      try {
        const { sessionId } = req.query;
        const user = await this.oauthXService.getUserBySession(sessionId);
        if (!user) return res.status(401).json({ error: 'Invalid session' });
        
        const enabled = await this.oauthXService.hasTwitterPostingEnabled(user.id);
        res.json({ success: true, twitterPostingEnabled: enabled });
      } catch (error) {
        console.error('[🛡️ Enhanced Backend] ❌ Get Twitter posting error:', error.message);
        res.status(500).json({ error: 'Failed to get Twitter posting status' });
      }
    });

    // Generate AI thesis for call
    this.app.post('/api/user/generate-thesis', async (req, res) => {
      try {
        const { sessionId, tokenData, tone = 'bullish', forceRegenerate = false } = req.body;
        if (!sessionId || !tokenData) {
          return res.status(400).json({ error: 'Missing sessionId or tokenData' });
        }
        
        const user = await this.oauthXService.getUserBySession(sessionId);
        if (!user) return res.status(401).json({ error: 'Invalid session' });
        
        // Prepare call data for thesis generation
        const jupiterData = tokenData.jupiterData || {};
        const marketCap = jupiterData.mcap || jupiterData.marketCap || tokenData.marketCap || 0;
        const price = jupiterData.usdPrice || jupiterData.price || tokenData.price || 0;
        
        // Fetch enhanced data for thesis generation
        let enhancedTokenData = { ...tokenData };
        
        try {
          // Fetch Moralis TokenAnalytics data using TechnicalAnalysisService
          if (tokenData.contractAddress) {
            const { default: TechnicalAnalysisService } = await import('./services/TechnicalAnalysisService.js');
            const techAnalysisService = new TechnicalAnalysisService();
            const moralisAnalytics = await techAnalysisService.getMoralisTokenAnalytics(tokenData.contractAddress);
            enhancedTokenData.moralisAnalytics = moralisAnalytics;
            console.log(`📊 Fetched Moralis TokenAnalytics for thesis: ${tokenData.symbol}`);
          }
          
          // Fetch Holder data
          if (tokenData.contractAddress) {
            const holderData = await this.holderTimeseriesService.getHolderInsights(tokenData.contractAddress);
            enhancedTokenData.holderData = holderData;
            console.log(`👥 Fetched Holder data for thesis: ${tokenData.symbol}`);
          }
        } catch (error) {
          console.error('[🛡️ Enhanced Backend] ⚠️ Failed to fetch enhanced data for thesis:', error.message);
          // Continue with basic data if enhanced data fails
        }
        
        const callData = {
          calledMc: marketCap,
          calledPrice: price,
          calledAt: new Date().toISOString()
        };
        
        // Generate thesis with enhanced data
        const thesis = await this.callThesisGenerator.generateCallThesis(enhancedTokenData, callData, { 
          tone, 
          forceRegenerate 
        });
        
        res.json({ success: true, thesis });
      } catch (error) {
        console.error('[🛡️ Enhanced Backend] ❌ Generate thesis error:', error.message);
        res.status(500).json({ error: 'Failed to generate thesis' });
      }
    });

    // Share call manually
    this.app.post('/api/user/kol-calls/:id/share', async (req, res) => {
      try {
        const { sessionId } = req.body;
        const { id } = req.params;
        
        if (!sessionId || !id) {
          return res.status(400).json({ error: 'Missing sessionId or call id' });
        }
        
        const user = await this.oauthXService.getUserBySession(sessionId);
        if (!user) return res.status(401).json({ error: 'Invalid session' });
        
        // Get call data
        const calls = await this.oauthXService.db.getKolCalls(user.id);
        const call = calls.find(c => c.id === id);
        if (!call) return res.status(404).json({ error: 'Call not found' });
        
        // Check if user has Twitter posting enabled
        const hasTwitterPosting = await this.oauthXService.hasTwitterPostingEnabled(user.id);
        if (!hasTwitterPosting) {
          return res.status(403).json({ error: 'Twitter posting not enabled' });
        }
        
        // Generate share post
        const currentStats = {
          currentMC: call.currentMC || call.calledMc,
          currentPrice: call.currentPrice || call.calledPrice,
          multiplier: call.currentMultiplier || 1,
          athMultiplier: call.athMultiplier || 1
        };
        
        const shareText = await this.callThesisGenerator.generateSharePost(call, currentStats);
        
        // Post to Twitter
        const tweet = await this.oauthXService.postTweet(user.id, shareText);
        
        res.json({ success: true, tweetId: tweet.id, shareText });
      } catch (error) {
        console.error('[🛡️ Enhanced Backend] ❌ Share call error:', error.message);
        res.status(500).json({ error: 'Failed to share call' });
      }
    });

    // Get DGO followers/following
    this.app.get('/api/user/followers', async (req, res) => {
      try {
        const { sessionId } = req.query;
        const user = await this.oauthXService.getUserBySession(sessionId);
        if (!user) return res.status(401).json({ error: 'Invalid session' });
        
        const follows = await this.oauthXService.db.getFollows(user.id).catch(() => ({ following: [], followers: [] }));
        
        res.json({ 
          success: true, 
          followers: follows.followers || [], 
          following: follows.following || [] 
        });
      } catch (error) {
        console.error('[🛡️ Enhanced Backend] ❌ Get followers error:', error.message);
        res.status(500).json({ error: 'Failed to fetch followers' });
      }
    });

    // KOL Leaderboard (Premium only)
    this.app.get('/api/leaderboard', async (req, res) => {
      try {
        const { sessionId } = req.query;
        
        if (!sessionId) {
          return res.status(401).json({ error: 'Authentication required' });
        }
        
        const user = await this.oauthXService.getUserBySession(sessionId);
        if (!user) return res.status(401).json({ error: 'Invalid session' });
        
        // Check premium status
        const premiumStatus = await this.oauthXService.db.getPremiumStatus(user.id);
        const isPremium = premiumStatus?.isPremium && new Date(premiumStatus.expiresAt) > new Date();
        
        if (!isPremium) {
          return res.status(403).json({ 
            error: 'premium_required',
            message: 'Leaderboard is a Premium feature. Upgrade to access KOL rankings!' 
          });
        }
        
        // Get all KOL calls from all users
        const allKolCalls = await this.oauthXService.db.getAllKolCalls();

        // Group calls by user
        const userCalls = {};
        allKolCalls.forEach(call => {
          if (!userCalls[call.userId]) {
            userCalls[call.userId] = [];
          }
          userCalls[call.userId].push(call);
        });

        // Get current token data for calculations
        const tokens = await this.getTokensFromCache();
        const currentTokenData = {};
        tokens.forEach(token => {
          currentTokenData[token.contractAddress] = token;
        });

        // Generate leaderboard using enhanced KOL trust system
        const leaderboardResult = await this.generateEnhancedLeaderboard(userCalls, currentTokenData);

        // Enrich with user data
        const enrichedLeaderboard = await Promise.all(
          leaderboardResult.leaderboard.map(async (entry) => {
            try {
              const user = await this.oauthXService.getUserById(entry.userId);
              const xHandle = user?.username;
              const displayName = user?.displayName || user?.username;

              return {
                ...entry,
                username: xHandle ? `@${xHandle}` : `User${entry.userId.slice(-4)}`,
                displayName: displayName || (xHandle ? `@${xHandle}` : `User${entry.userId.slice(-4)}`),
                xHandle: xHandle, // Store clean handle for API use
                profileImage: user?.profileImage
              };
            } catch (err) {
              return {
                ...entry,
                username: `User${entry.userId.slice(-4)}`,
                displayName: `User${entry.userId.slice(-4)}`,
                xHandle: null
              };
            }
          })
        );

        res.json({
          success: true,
          leaderboard: enrichedLeaderboard,
          boards: leaderboardResult.boards,
          boardStats: leaderboardResult.boardStats,
          generatedAt: leaderboardResult.generatedAt
        });
      } catch (error) {
        console.error('[🛡️ Enhanced Backend] ❌ Leaderboard error:', error.message);
        res.status(500).json({ error: 'Failed to fetch leaderboard' });
      }
    });

    // === KOL: Public profile + stats ===
    this.app.get('/api/kol/:userId/profile', async (req, res) => {
      try {
        const { userId } = req.params;
        let user = await this.oauthXService.getUserById(userId);
        
        if (!user) {
          return res.status(404).json({ success: false, error: 'User not found' });
        }
        
        // Debug: Log what user data we have
        console.log(`🔍 User ${userId} profile data:`, {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          profileImage: user.profileImage,
          hasSessionId: !!user.sessionId
        });
        
        // If user data exists but doesn't have X profile info, try to fetch it
        if (user && (!user.username || user.username.startsWith('user_') || !user.profileImage)) {
          console.log(`🔄 User ${userId} missing X profile data, attempting to fetch...`);
          
          // Try to get fresh X profile data if we have access token
          if (user.sessionId) {
            try {
              const freshUser = await this.oauthXService.getUserBySession(user.sessionId);
              if (freshUser && freshUser.username && !freshUser.username.startsWith('user_')) {
                console.log(`✅ Found fresh X data for user ${userId}:`, freshUser.username);
                user = freshUser;
              }
            } catch (fetchError) {
              console.warn(`⚠️ Could not fetch fresh X data for user ${userId}:`, fetchError.message);
            }
          } else {
            console.warn(`⚠️ User ${userId} has no sessionId, trying global users index...`);
            
            // Try to get user data from global users index
            try {
              const globalUsers = await this.oauthXService.db.getAllUsers();
              const globalUser = globalUsers.find(u => u.id === userId);
              if (globalUser && globalUser.username && !globalUser.username.startsWith('user_')) {
                console.log(`✅ Found user ${userId} in global index:`, globalUser.username);
                user = globalUser;
              }
            } catch (globalError) {
              console.warn(`⚠️ Could not fetch from global users index for user ${userId}:`, globalError.message);
            }
          }
        }
        
        res.json({ success: true, user: {
          id: user.id,
          username: user.username || `user_${String(userId).slice(-6)}`,
          displayName: user.displayName || user.username || `User ${String(userId).slice(-6)}`,
          profileImage: user.profileImage || null,
        }});
      } catch (e) {
        console.error(`❌ KOL profile fetch error for user ${req.params.userId}:`, e);
        res.status(500).json({ success: false, error: 'Failed to fetch profile' });
      }
    });

    // Helper to compute simple user stats from calls and current token data
    const computeUserKolStats = (calls, currentTokenDataMap) => {
      const now30d = Date.now() - (30 * 24 * 60 * 60 * 1000);
      const xs = [];
      let recentCount = 0;
      for (const c of calls) {
        const calledAtMs = c.calledAt ? new Date(c.calledAt).getTime() : 0;
        if (calledAtMs && calledAtMs >= now30d) recentCount++;
        const ca = c.token?.contractAddress || c.contractAddress;
        const current = currentTokenDataMap.get(ca) || {};
        const currentMC = Number(current?.jupiterData?.mcap || current?.marketCap || c.currentMC || 0) || 0;
        const calledMC = Number(c.calledMc || c.calledMC || 0) || 0;
        if (calledMC > 0 && currentMC > 0) {
          xs.push(currentMC / calledMC);
        }
      }
      xs.sort((a,b)=>a-b);
      const medianX = xs.length ? (xs.length % 2 ? xs[(xs.length-1)/2] : (xs[xs.length/2-1]+xs[xs.length/2])/2) : 0;
      const hitRate = xs.length ? xs.filter(v => v >= 2).length / xs.length : 0;
      return {
        totalCalls: calls.length,
        recentCalls30d: recentCount,
        medianX,
        hitRate
      };
    };

    // KOL: Stats for a specific user (auth required)
    this.app.get('/api/kol/:userId/stats', async (req, res) => {
      try {
        const { userId } = req.params;
        const { sessionId } = req.query;
        const viewer = await this.oauthXService.getUserBySession(sessionId);
        if (!viewer) return res.status(401).json({ success: false, error: 'Invalid session' });

        const calls = await this.oauthXService.db.getKolCalls(userId);
        const tokens = await this.getTokensFromCache();
        const map = new Map(tokens.filter(t => t.contractAddress).map(t => [t.contractAddress, t]));
        const stats = computeUserKolStats(calls || [], map);

        // follow info
        const follows = await this.oauthXService.db.getFollows(userId).catch(()=>({following:[],followers:[]}));
        const viewerFollows = await this.oauthXService.db.getFollows(viewer.id).catch(()=>({following:[],followers:[]}));
        const isFollowing = Array.isArray(viewerFollows.following) && viewerFollows.following.includes(userId);

        res.json({ success: true, stats, follows, isFollowing });
      } catch (e) {
        res.status(500).json({ success: false, error: 'Failed to fetch stats' });
      }
    });

    // KOL: Calls list for a specific user (auth required)
    this.app.get('/api/kol/:userId/calls', async (req, res) => {
      try {
        const { userId } = req.params;
        const { sessionId } = req.query;
        const viewer = await this.oauthXService.getUserBySession(sessionId);
        if (!viewer) return res.status(401).json({ success: false, error: 'Invalid session' });
        const calls = await this.oauthXService.db.getKolCalls(userId);
        res.json({ success: true, calls: calls || [] });
      } catch (e) {
        res.status(500).json({ success: false, error: 'Failed to fetch calls' });
      }
    });

    // === KOL: Monthly winners (server-side, cached) ===
    this.app.get('/api/leaderboard/winners', async (req, res) => {
      try {
        const { sessionId, month, limit } = req.query; // month: 'YYYY-MM'
        const viewer = await this.oauthXService.getUserBySession(sessionId);
        if (!viewer) return res.status(401).json({ success: false, error: 'Invalid session' });

        // Premium-gated similar to leaderboard
        const premiumStatus = await this.oauthXService.db.getPremiumStatus(viewer.id);
        const isPremium = premiumStatus?.isPremium && new Date(premiumStatus.expiresAt) > new Date();
        if (!isPremium) {
          return res.status(403).json({ success: false, error: 'premium_required', message: 'Winners is a Premium feature.' });
        }

        const monthKey = (typeof month === 'string' && /^\d{4}-\d{2}$/.test(month)) ? month : new Date().toISOString().slice(0,7);
        const topN = Math.max(1, Math.min(20, Number(limit) || 3));

        // Cache file under DATA_DIR/cache
        let cachePath;
        try {
          const baseDir = this.oauthXService?.db?.baseDir || process.env.DATA_DIR || '/var/data/dgo';
          cachePath = path.join(baseDir, 'cache', `kol-winners-${monthKey}.json`);
        } catch (_) {
          cachePath = path.join(__dirname, 'cache', `kol-winners-${monthKey}.json`);
        }

        // Attempt cache (10 min TTL)
        try {
          const raw = await fs.readFile(cachePath, 'utf8');
          const cached = JSON.parse(raw);
          const ttlMs = 10 * 60 * 1000;
          if (cached && cached.generatedAt && (Date.now() - new Date(cached.generatedAt).getTime()) < ttlMs) {
            return res.json({ success: true, month: monthKey, winners: cached.winners?.slice(0, topN) || [], generatedAt: cached.generatedAt, cached: true });
          }
        } catch (_) {}

        // Build data for computation
        const allCalls = await this.oauthXService.db.getAllKolCalls();
        const monthCalls = (allCalls || []).filter(c => {
          const d = c.calledAt || c.createdAt;
          if (!d) return false;
          return new Date(d).toISOString().slice(0,7) === monthKey;
        });

        // Current token data map
        const tokens = await this.getTokensFromCache();
        const tokenMap = new Map(tokens.filter(t => t.contractAddress).map(t => [t.contractAddress.toLowerCase(), t]));

        // Group by user
        const byUser = new Map();
        for (const c of monthCalls) {
          const uid = c.userId || c.user || null;
          if (!uid) continue;
          if (!byUser.has(uid)) byUser.set(uid, []);
          byUser.get(uid).push(c);
        }

        // Compute per-user metrics
        const results = [];
        for (const [userId, calls] of byUser.entries()) {
          const xs = [];
          for (const c of calls) {
            const ca = (c.token?.contractAddress || c.contractAddress || '').toLowerCase();
            const calledMC = Number(c.calledMc || c.calledMC || 0) || 0;
            const token = tokenMap.get(ca);
            const currentMC = Number(token?.jupiterData?.mcap || token?.marketCap || c.currentMC || 0) || 0;
            if (calledMC > 0 && currentMC > 0) xs.push(currentMC / calledMC);
          }
          if (xs.length === 0) continue;
          xs.sort((a,b)=>a-b);
          const medianX = xs.length % 2 ? xs[(xs.length-1)/2] : (xs[xs.length/2-1] + xs[xs.length/2]) / 2;
          const hitRate = xs.filter(v => v >= 2).length / xs.length;
          const scoreMonth = medianX * (1 + 0.1 * calls.length) * (0.75 + 0.25 * hitRate);
          // Enrich with user profile basics
          let userBasic = null;
          try { userBasic = await this.oauthXService.getUserById(userId); } catch (_) {}
          results.push({
            userId,
            displayName: userBasic?.displayName || userBasic?.username || `User${String(userId).slice(-4)}`,
            username: userBasic?.username || `user_${String(userId).slice(-4)}`,
            profileImage: userBasic?.profileImage || null,
            callCount: calls.length,
            medianX,
            hitRate,
            scoreMonth
          });
        }

        results.sort((a,b)=> b.scoreMonth - a.scoreMonth);
        const winners = results.slice(0, topN);

        const payload = { winners, generatedAt: new Date().toISOString() };
        try {
          await fs.mkdir(path.dirname(cachePath), { recursive: true });
          await fs.writeFile(cachePath, JSON.stringify(payload, null, 2));
        } catch (_) {}

        res.json({ success: true, month: monthKey, winners, generatedAt: payload.generatedAt, cached: false });
      } catch (e) {
        console.error('[🛡️ Enhanced Backend] ❌ Monthly winners error:', e.message);
        res.status(500).json({ success: false, error: 'Failed to compute monthly winners' });
      }
    });
    // KOL: Follow
    this.app.post('/api/kol/:userId/follow', async (req, res) => {
      try {
        const { userId } = req.params;
        const { sessionId } = req.body || {};
        const viewer = await this.oauthXService.getUserBySession(sessionId);
        if (!viewer) return res.status(401).json({ success: false, error: 'Invalid session' });
        const result = await this.oauthXService.db.followUser(viewer.id, userId);
        res.json({ success: true, result });
      } catch (e) {
        res.status(500).json({ success: false, error: 'Failed to follow user' });
      }
    });

    // KOL: Unfollow
    this.app.delete('/api/kol/:userId/follow', async (req, res) => {
      try {
        const { userId } = req.params;
        const { sessionId } = req.query;
        const viewer = await this.oauthXService.getUserBySession(sessionId);
        if (!viewer) return res.status(401).json({ success: false, error: 'Invalid session' });
        const result = await this.oauthXService.db.unfollowUser(viewer.id, userId);
        res.json({ success: true, result });
      } catch (e) {
        res.status(500).json({ success: false, error: 'Failed to unfollow user' });
      }
    });

    // === ENHANCED ML PREDICTIVE ANALYTICS ENDPOINTS ===
    
    // Initialize Enhanced Predictive Analytics Service
    this.enhancedPredictiveAnalytics = null;
    
    // DISABLED: Get comprehensive KOL analytics with LLM insights
    /*
    this.app.get('/api/ml/kol-analytics/:kolHandle', async (req, res) => {
      try {
        const { kolHandle } = req.params;
        
        if (!this.enhancedPredictiveAnalytics) {
          const { default: EnhancedPredictiveAnalyticsService } = await import('./services/EnhancedPredictiveAnalyticsService.js');
          this.enhancedPredictiveAnalytics = new EnhancedPredictiveAnalyticsService(this.kolService);
          await this.enhancedPredictiveAnalytics.initialize();
        }
        
        console.log(`🧠 [ENHANCED ML] Getting comprehensive analytics for @${kolHandle}`);
        
        const analytics = await this.enhancedPredictiveAnalytics.getKOLAnalytics(kolHandle);
        
        res.json({
          success: true,
          data: analytics,
          timestamp: new Date().toISOString()
        });
        
      } catch (error) {
        console.error(`❌ [ENHANCED ML] KOL analytics error for ${req.params.kolHandle}:`, error.message);
        res.status(500).json({
          success: false,
          error: 'Failed to get KOL analytics',
          message: error.message
        });
      }
    });
    */
    
    // DISABLED: Get comprehensive token analytics with LLM insights
    /*
    this.app.get('/api/ml/token-analytics/:coinSymbol', async (req, res) => {
      try {
        const { coinSymbol } = req.params;
        
        if (!this.enhancedPredictiveAnalytics) {
          const { default: EnhancedPredictiveAnalyticsService } = await import('./services/EnhancedPredictiveAnalyticsService.js');
          this.enhancedPredictiveAnalytics = new EnhancedPredictiveAnalyticsService(this.kolService);
          await this.enhancedPredictiveAnalytics.initialize();
        }
        
        console.log(`🧠 [ENHANCED ML] Getting comprehensive analytics for ${coinSymbol}`);
        
        const analytics = await this.enhancedPredictiveAnalytics.getTokenAnalytics(coinSymbol);
        
        res.json({
          success: true,
          data: analytics,
          timestamp: new Date().toISOString()
        });
        
      } catch (error) {
        console.error(`❌ [ENHANCED ML] Token analytics error for ${req.params.coinSymbol}:`, error.message);
        res.status(500).json({
          success: false,
          error: 'Failed to get token analytics',
          message: error.message
        });
      }
    });
    */
    
    // DISABLED: Get market-wide analytics with LLM insights
    /*
    this.app.get('/api/ml/market-analytics', async (req, res) => {
      try {
        if (!this.enhancedPredictiveAnalytics) {
          const { default: EnhancedPredictiveAnalyticsService } = await import('./services/EnhancedPredictiveAnalyticsService.js');
          this.enhancedPredictiveAnalytics = new EnhancedPredictiveAnalyticsService(this.kolService);
          await this.enhancedPredictiveAnalytics.initialize();
        }
        
        console.log(`🧠 [ENHANCED ML] Getting market-wide analytics`);
        
        const analytics = await this.enhancedPredictiveAnalytics.getMarketAnalytics();
        
        res.json({
          success: true,
          data: analytics,
          timestamp: new Date().toISOString()
        });
        
      } catch (error) {
        console.error(`❌ [ENHANCED ML] Market analytics error:`, error.message);
        res.status(500).json({
          success: false,
          error: 'Failed to get market analytics',
          message: error.message
        });
      }
    });
    */

    // DISABLED: AI-Powered Narrative Analysis
    /*
    this.app.post('/api/ml/narrative-analysis', async (req, res) => {
      try {
        const { posts } = req.body;
        
        if (!posts || !Array.isArray(posts) || posts.length === 0) {
          return res.status(400).json({
            success: false,
            error: 'No posts provided for analysis'
          });
        }

        console.log(`🧠 [NARRATIVE AI] Analyzing ${posts.length} posts for narrative detection`);

        // Initialize OpenAI service if not already done
        if (!this.openaiService) {
          const { default: OpenAIService } = await import('./openaiService.js');
          this.openaiService = new OpenAIService();
        }

        // Prepare posts for analysis
        const postsText = posts.map(post => 
          `KOL: ${post.kol_handle}\nContent: ${post.content}\n---`
        ).join('\n');

        // Define narrative categories
        const narrativeCategories = [
          'AI & Machine Learning',
          'DeFi & Yield Farming', 
          'Gaming & NFTs',
          'Memes & Community',
          'Layer 2 & Scaling',
          'Privacy & Security',
          'Real World Assets (RWA)',
          'Social & Web3',
          'Infrastructure & Tools',
          'Regulation & Compliance'
        ];

        // Create the prompt for narrative analysis
        const prompt = `Analyze the following KOL posts to identify trending narratives in the crypto space.

POSTS TO ANALYZE:
${postsText}

NARRATIVE CATEGORIES:
${narrativeCategories.join(', ')}

Please analyze these posts and provide:
1. The most trending narrative (from the categories above)
2. A "warming up" narrative that's emerging but not yet dominant
3. Confidence scores (0-1) for both narratives
4. Number of KOLs mentioning each narrative
5. Brief reasoning for your analysis

Look for:
- Current dominant narrative (most mentions, highest sentiment)
- Emerging narrative (growing mentions, early signals, new keywords)
- Cross-KOL correlation patterns
- Sentiment shifts and momentum changes

Respond in JSON format:
{
  "trendingNarrative": "current dominant category",
  "confidence": 0.85,
  "warmingUpNarrative": "emerging category",
  "warmingUpConfidence": 0.65,
  "kolCount": 3,
  "reasoning": "Brief explanation of both narratives"
}`;

        try {
          const response = await this.openaiService.generateCompletion(prompt, {
            model: 'gpt-4o-mini', // 🚀 COST OPTIMIZATION: 40x cheaper than gpt-4-turbo
            max_tokens: 500,
            temperature: 0.3
          });

          // Parse the AI response
          let analysis;
          try {
            analysis = JSON.parse(response);
          } catch (parseError) {
            console.warn('Failed to parse AI response, using fallback analysis');
            analysis = {
              trendingNarrative: 'AI & Machine Learning',
              confidence: 0.7,
              kolCount: Math.min(posts.length, 3),
              reasoning: 'AI analysis failed, using default narrative'
            };
          }

          // Validate the response
          if (!analysis.trendingNarrative || typeof analysis.confidence !== 'number') {
            throw new Error('Invalid AI response format');
          }

          console.log(`🧠 [NARRATIVE AI] Detected narrative: ${analysis.trendingNarrative} (${Math.round(analysis.confidence * 100)}% confidence)`);
          console.log(`🔥 [NARRATIVE AI] Warming up: ${analysis.warmingUpNarrative || 'None'} (${Math.round((analysis.warmingUpConfidence || 0) * 100)}% confidence)`);

          res.json({
            success: true,
            data: {
              trendingNarrative: analysis.trendingNarrative,
              confidence: analysis.confidence,
              warmingUpNarrative: analysis.warmingUpNarrative || 'None detected',
              warmingUpConfidence: analysis.warmingUpConfidence || 0,
              kolCount: analysis.kolCount || 1,
              reasoning: analysis.reasoning || 'AI-powered narrative detection',
              timestamp: new Date().toISOString()
            }
          });

        } catch (aiError) {
          console.warn('AI analysis failed, using fallback:', aiError.message);
          
          // Fallback to keyword-based analysis
          const fallbackAnalysis = await this.performFallbackNarrativeAnalysis(posts);
          
          res.json({
            success: true,
            data: fallbackAnalysis
          });
        }

      } catch (error) {
        console.error(`❌ [NARRATIVE AI] Analysis error:`, error.message);
        res.status(500).json({
          success: false,
          error: 'Failed to analyze narratives',
          message: error.message
        });
      }
    });

    // Fallback narrative analysis function
    this.performFallbackNarrativeAnalysis = async (posts) => {
      const narrativeKeywords = {
        'AI & Machine Learning': ['ai', 'artificial intelligence', 'machine learning', 'gpt', 'openai', 'chatgpt', 'claude', 'anthropic', 'llm'],
        'DeFi & Yield Farming': ['defi', 'yield farming', 'liquidity', 'staking', 'protocol', 'uniswap', 'aave', 'compound', 'lending'],
        'Gaming & NFTs': ['gaming', 'nft', 'metaverse', 'play-to-earn', 'gamefi', 'web3 gaming', 'blockchain game', 'nft gaming'],
        'Memes & Community': ['meme', 'doge', 'pepe', 'shiba', 'funny', 'meme coin', 'community token', 'community'],
        'Layer 2 & Scaling': ['layer 2', 'l2', 'rollup', 'arbitrum', 'optimism', 'polygon', 'scaling', 'sidechain'],
        'Privacy & Security': ['privacy', 'zero-knowledge', 'zk', 'anonymous', 'private', 'privacy coin', 'security'],
        'Real World Assets (RWA)': ['real world assets', 'rwa', 'tokenization', 'real estate', 'commodities', 'tangible assets'],
        'Social & Web3': ['social', 'social media', 'web3 social', 'decentralized social', 'social token', 'community'],
        'Infrastructure & Tools': ['infrastructure', 'tools', 'developer', 'api', 'sdk', 'infrastructure', 'tooling'],
        'Regulation & Compliance': ['regulation', 'compliance', 'legal', 'regulatory', 'sec', 'government', 'policy']
      };

      const narrativeCounts = {};
      
      posts.forEach(post => {
        const content = (post.content || '').toLowerCase();
        Object.entries(narrativeKeywords).forEach(([narrative, keywords]) => {
          keywords.forEach(keyword => {
            if (content.includes(keyword)) {
              narrativeCounts[narrative] = (narrativeCounts[narrative] || 0) + 1;
            }
          });
        });
      });

      const topNarrative = Object.entries(narrativeCounts)
        .sort(([,a], [,b]) => b - a)[0];

      if (topNarrative) {
        // Find second most common narrative for warming up
        const secondNarrative = Object.entries(narrativeCounts)
          .sort(([,a], [,b]) => b - a)[1];
        
        return {
          trendingNarrative: topNarrative[0],
          confidence: Math.min(topNarrative[1] * 0.2, 0.9),
          warmingUpNarrative: secondNarrative && secondNarrative[1] > 0 ? secondNarrative[0] : 'No emerging narrative',
          warmingUpConfidence: secondNarrative && secondNarrative[1] > 0 ? Math.min(secondNarrative[1] * 0.15, 0.7) : 0,
          kolCount: topNarrative[1],
          reasoning: `Keyword-based analysis detected ${topNarrative[1]} mentions for trending, ${secondNarrative ? secondNarrative[1] : 0} for warming up`,
          timestamp: new Date().toISOString()
        };
      } else {
        return {
          trendingNarrative: 'No clear narrative detected',
          confidence: 0.1,
          warmingUpNarrative: 'No emerging narrative',
          warmingUpConfidence: 0,
          kolCount: 0,
          reasoning: 'No narrative keywords found in posts',
          timestamp: new Date().toISOString()
        };
      }
    };

    // DISABLED: Comprehensive AI Insights API
    /*
    this.app.post('/api/ml/comprehensive-insights', async (req, res) => {
      try {
        const { analytics, predictions, visualizations, momentum, posts, kols } = req.body;
        
        if (!analytics || !predictions || !visualizations || !momentum) {
          return res.status(400).json({
            success: false,
            error: 'Missing required data for comprehensive analysis'
          });
        }

        console.log(`🧠 [COMPREHENSIVE AI] Analyzing comprehensive data for insights`);

        // Initialize OpenAI service if not already done
        if (!this.openaiService) {
          const { default: OpenAIService } = await import('./openaiService.js');
          this.openaiService = new OpenAIService();
        }

        // Prepare comprehensive data for AI analysis
        const analysisData = {
          analytics: {
            topKOL: analytics.topKOL,
            marketMomentum: analytics.marketMomentum
          },
          predictions: {
            trendingNarrative: predictions.trendingNarrative,
            warmingNarrative: predictions.warmingNarrative,
            nextCoin: predictions.nextCoin,
            momentumScore: predictions.momentumScore,
            viralPotential: predictions.viralPotential
          },
          visualizations: {
            timelineHeatmap: visualizations.timelineHeatmap,
            sentimentTrends: visualizations.sentimentTrends,
            influenceDecay: visualizations.influenceDecay
          },
          momentum: {
            topCoins: momentum.topCoins,
            totalCoins: momentum.totalCoins,
            timeframe: momentum.timeframe
          },
          context: {
            totalPosts: posts ? posts.length : 0,
            totalKOLs: kols ? kols.length : 0,
            recentActivity: posts ? posts.slice(0, 5).map(p => ({
              kol: p.kol_handle,
              sentiment: p.sentiment,
              coins: p.coins
            })) : []
          }
        };

        // Create comprehensive analysis prompt
        const prompt = `Analyze the following comprehensive KOL intelligence data and provide actionable insights and recommendations.

ANALYTICS DATA:
- Top KOL: ${analysisData.analytics.topKOL.name} (${analysisData.analytics.topKOL.handle})
- Alpha Score: ${analysisData.analytics.topKOL.alphaScore}
- Hit Rate: ${analysisData.analytics.topKOL.hitRate}
- Risk Score: ${analysisData.analytics.topKOL.riskScore}
- Market Trend: ${analysisData.analytics.marketMomentum.overallTrend}
- Hot Sectors: ${analysisData.analytics.marketMomentum.hotSectors}
- Risk Level: ${analysisData.analytics.marketMomentum.riskLevel}

PREDICTIONS DATA:
- Trending Narrative: ${analysisData.predictions.trendingNarrative}
- Warming Up Narrative: ${analysisData.predictions.warmingNarrative}
- Next Coin to Watch: ${analysisData.predictions.nextCoin}
- Momentum Score: ${analysisData.predictions.momentumScore}
- Viral Potential: ${analysisData.predictions.viralPotential}

VISUALIZATIONS DATA:
- Peak Activity Time: ${analysisData.visualizations.timelineHeatmap.peakActivity}
- Activity Pattern: ${analysisData.visualizations.timelineHeatmap.activityPattern}
- Current Sentiment: ${analysisData.visualizations.sentimentTrends.currentSentiment}
- Sentiment Trend: ${analysisData.visualizations.sentimentTrends.sentimentTrend}
- Current Influence: ${analysisData.visualizations.influenceDecay.currentInfluence}
- Influence Trend: ${analysisData.visualizations.influenceDecay.influenceTrend}

MOMENTUM DATA:
- Top Coins: ${analysisData.momentum.topCoins.map(c => `${c.coin} (${c.momentum})`).join(', ')}
- Total Coins Tracked: ${analysisData.momentum.totalCoins}
- Timeframe: ${analysisData.momentum.timeframe}h

CONTEXT:
- Total Posts: ${analysisData.context.totalPosts}
- Total KOLs: ${analysisData.context.totalKOLs}
- Recent Activity: ${JSON.stringify(analysisData.context.recentActivity)}

Please provide:
1. 3-5 key insights about the current market situation
2. 3-5 actionable recommendations for trading/positioning
3. Risk assessment and warnings
4. Opportunities to watch

Format as JSON:
{
  "insights": [
    {"icon": "trending-up", "color": "green", "text": "Insight text"},
    {"icon": "alert-triangle", "color": "yellow", "text": "Warning text"}
  ],
  "recommendations": [
    {"icon": "target", "color": "blue", "text": "Recommendation text"},
    {"icon": "eye", "color": "purple", "text": "Watch recommendation"}
  ]
}`;

        try {
          const response = await this.openaiService.generateCompletion(prompt, {
            model: 'gpt-4o-mini', // 🚀 COST OPTIMIZATION: 40x cheaper than gpt-4-turbo
            max_tokens: 1000,
            temperature: 0.4
          });

          // Parse the AI response
          let analysis;
          try {
            analysis = JSON.parse(response);
          } catch (parseError) {
            console.warn('Failed to parse AI insights response, using fallback');
            analysis = {
              insights: [
                { icon: 'zap', color: 'yellow', text: 'AI analysis completed with comprehensive data review' },
                { icon: 'trending-up', color: 'green', text: 'Market conditions analyzed across all metrics' },
                { icon: 'brain', color: 'purple', text: 'Cross-tab correlation analysis performed' }
              ],
              recommendations: [
                { icon: 'target', color: 'blue', text: 'Monitor trending narrative for opportunities' },
                { icon: 'shield', color: 'yellow', text: 'Maintain risk management based on current levels' },
                { icon: 'eye', color: 'green', text: 'Watch warming up narrative for early signals' }
              ]
            };
          }

          // Validate the response
          if (!analysis.insights || !analysis.recommendations) {
            throw new Error('Invalid AI insights response format');
          }

          console.log(`🧠 [COMPREHENSIVE AI] Generated ${analysis.insights.length} insights and ${analysis.recommendations.length} recommendations`);

          res.json({
            success: true,
            data: {
              insights: analysis.insights,
              recommendations: analysis.recommendations,
              timestamp: new Date().toISOString(),
              dataPoints: {
                analytics: Object.keys(analytics).length,
                predictions: Object.keys(predictions).length,
                visualizations: Object.keys(visualizations).length,
                momentum: Object.keys(momentum).length
              }
            }
          });

        } catch (aiError) {
          console.warn('AI comprehensive analysis failed, using fallback:', aiError.message);
          
          // Fallback insights based on data
          const fallbackInsights = generateFallbackInsights(analysisData);
          
          res.json({
            success: true,
            data: fallbackInsights
          });
        }

      } catch (error) {
        console.error(`❌ [COMPREHENSIVE AI] Analysis error:`, error.message);
        res.status(500).json({
          success: false,
          error: 'Failed to generate comprehensive insights',
          message: error.message
        });
      }
    });

    // Fallback comprehensive insights function
    function generateFallbackInsights(data) {
      const insights = [];
      const recommendations = [];

      // Generate insights based on available data
      if (data.analytics.topKOL.name !== 'Unknown') {
        insights.push({
          icon: 'crown',
          color: 'yellow',
          text: `${data.analytics.topKOL.name} is your top performer with ${data.analytics.topKOL.alphaScore} alpha score`
        });
      }

      if (data.predictions.trendingNarrative !== '--') {
        insights.push({
          icon: 'trending-up',
          color: 'green',
          text: `${data.predictions.trendingNarrative} narrative is trending with high confidence`
        });
      }

      if (data.predictions.warmingNarrative !== '--' && data.predictions.warmingNarrative !== 'None detected') {
        insights.push({
          icon: 'zap',
          color: 'blue',
          text: `${data.predictions.warmingNarrative} narrative is warming up - watch for early signals`
        });
      }

      if (data.visualizations.sentimentTrends.currentSentiment > 0.3) {
        insights.push({
          icon: 'smile',
          color: 'green',
          text: 'Market sentiment is bullish with positive momentum'
        });
      } else if (data.visualizations.sentimentTrends.currentSentiment < -0.3) {
        insights.push({
          icon: 'frown',
          color: 'red',
          text: 'Market sentiment is bearish with negative momentum'
        });
      }

      // Generate recommendations
      if (data.predictions.nextCoin !== '--' && data.predictions.nextCoin !== 'None detected') {
        recommendations.push({
          icon: 'target',
          color: 'green',
          text: `Watch ${data.predictions.nextCoin} closely - showing strong momentum signals`
        });
      }

      if (data.analytics.marketMomentum.riskLevel === 'High') {
        recommendations.push({
          icon: 'shield',
          color: 'red',
          text: 'High risk environment detected - consider reducing position sizes'
        });
      }

      if (data.predictions.viralPotential === 'High') {
        recommendations.push({
          icon: 'zap',
          color: 'purple',
          text: 'High viral potential detected - prepare for potential market movements'
        });
      }

      recommendations.push({
        icon: 'eye',
        color: 'blue',
        text: 'Monitor cross-KOL correlation for consensus signals'
      });

      return {
        insights: insights.length > 0 ? insights : [
          { icon: 'info', color: 'gray', text: 'Add more KOLs and data for personalized insights' }
        ],
        recommendations: recommendations.length > 0 ? recommendations : [
          { icon: 'plus', color: 'blue', text: 'Start tracking KOLs to get actionable recommendations' }
        ],
        timestamp: new Date().toISOString()
      };
    }
    
    // Get enhanced KOL performance predictions
    this.app.get('/api/ml/kol-predictions/:kolHandle', async (req, res) => {
      try {
        const { kolHandle } = req.params;
        
        if (!this.enhancedPredictiveAnalytics) {
          const { default: EnhancedPredictiveAnalyticsService } = await import('./services/EnhancedPredictiveAnalyticsService.js');
          this.enhancedPredictiveAnalytics = new EnhancedPredictiveAnalyticsService(this.kolService);
          await this.enhancedPredictiveAnalytics.initialize();
        }
        
        console.log(`🧠 [ENHANCED ML] Getting performance predictions for @${kolHandle}`);
        
        const kol = this.oauthXService.db.getKOLs().find(k => k.handle === kolHandle);
        if (!kol) {
          return res.status(404).json({
            success: false,
            error: 'KOL not found',
            message: `KOL @${kolHandle} not found in database`
          });
        }
        
        const prediction = await this.enhancedPredictiveAnalytics.enhancedKOLPredictor.predict(kol);
        
        res.json({
          success: true,
          data: prediction,
          timestamp: new Date().toISOString()
        });
        
      } catch (error) {
        console.error(`❌ [ENHANCED ML] KOL prediction error for ${req.params.kolHandle}:`, error.message);
        res.status(500).json({
          success: false,
          error: 'Failed to get KOL predictions',
          message: error.message
        });
      }
    });
    
    // Get enhanced token momentum forecasts
    this.app.get('/api/ml/token-momentum/:coinSymbol', async (req, res) => {
      try {
        const { coinSymbol } = req.params;
        
        if (!this.enhancedPredictiveAnalytics) {
          const { default: EnhancedPredictiveAnalyticsService } = await import('./services/EnhancedPredictiveAnalyticsService.js');
          this.enhancedPredictiveAnalytics = new EnhancedPredictiveAnalyticsService(this.kolService);
          await this.enhancedPredictiveAnalytics.initialize();
        }
        
        console.log(`🧠 [ENHANCED ML] Getting momentum forecast for ${coinSymbol}`);
        
        // Get historical data (simplified for demo)
        const historicalPrices = await this.hybridPriceService.getHistoricalPrices(coinSymbol, '1D', 30);
        const kolMentions = this.oauthXService.db.getPosts().filter(p => p.coins.includes(coinSymbol));
        const sentimentData = kolMentions.map(p => ({ timestamp: p.created_at, sentiment: p.sentiment }));
        
        const forecast = await this.enhancedPredictiveAnalytics.enhancedMomentumForecaster.forecastMomentum(
          coinSymbol, 
          historicalPrices, 
          kolMentions, 
          sentimentData
        );
        
        res.json({
          success: true,
          data: forecast,
          timestamp: new Date().toISOString()
        });
        
      } catch (error) {
        console.error(`❌ [ENHANCED ML] Token momentum error for ${req.params.coinSymbol}:`, error.message);
        res.status(500).json({
          success: false,
          error: 'Failed to get token momentum',
          message: error.message
        });
      }
    });
    
    // Get enhanced early warning signals
    this.app.get('/api/ml/early-warnings', async (req, res) => {
      try {
        if (!this.enhancedPredictiveAnalytics) {
          const { default: EnhancedPredictiveAnalyticsService } = await import('./services/EnhancedPredictiveAnalyticsService.js');
          this.enhancedPredictiveAnalytics = new EnhancedPredictiveAnalyticsService(this.kolService);
          await this.enhancedPredictiveAnalytics.initialize();
        }
        
        console.log(`🧠 [ENHANCED ML] Getting early warning signals`);
        
        const signals = await this.enhancedPredictiveAnalytics.enhancedEarlyWarningDetector.getEarlyWarningSignals();
        
        res.json({
          success: true,
          data: signals,
          timestamp: new Date().toISOString()
        });
        
      } catch (error) {
        console.error(`❌ [ENHANCED ML] Early warning signals error:`, error.message);
        res.status(500).json({
          success: false,
          error: 'Failed to get early warning signals',
          message: error.message
        });
      }
    });
    
    // =============================
    // KOL DATA API ENDPOINTS (for KOL Intelligence Hub)
    // =============================
    
    // DISABLED: Get all KOLs
    /*
    this.app.get('/api/kol/kols', async (req, res) => {
      try {
        const kols = await this.kolService.getKOLs();
        res.json({
          success: true,
          data: kols || []
        });
      } catch (error) {
        console.error('❌ Error fetching KOLs:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to fetch KOLs'
        });
      }
    });
    */

    // DISABLED: Get all KOL posts
    /*
    this.app.get('/api/kol/posts', async (req, res) => {
      try {
        const posts = await this.kolService.getPosts();
        res.json({
          success: true,
          data: posts || []
        });
      } catch (error) {
        console.error('❌ Error fetching KOL posts:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to fetch KOL posts'
        });
      }
    });
    */

    // Get coin data for KOL Intelligence Hub
    this.app.get('/api/kol/coin-data', async (req, res) => {
      try {
        // This would typically fetch coin metadata, logos, etc.
        // For now, return empty object as placeholder
        res.json({
          success: true,
          data: {}
        });
      } catch (error) {
        console.error('❌ Error fetching coin data:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to fetch coin data'
        });
      }
    });

    // Get alpha scores for KOLs
    this.app.get('/api/kol/alpha-scores', async (req, res) => {
      try {
        // This would typically calculate alpha scores for KOLs
        // For now, return empty array as placeholder
        res.json({
          success: true,
          data: []
        });
      } catch (error) {
        console.error('❌ Error fetching alpha scores:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to fetch alpha scores'
        });
      }
    });

    // =============================
    // CACHED ENHANCED ANALYTICS API ENDPOINTS
    // =============================
    
    // DISABLED: Get cached KOL Performance Analytics
    /*
    this.app.get('/api/cached/kol-performance', async (req, res) => {
      try {
        const cachedData = this.enhancedAnalyticsCache.getCachedAnalytics('KOL_PERFORMANCE');
        
        if (!cachedData) {
          return res.status(404).json({
            success: false,
            error: 'KOL Performance analytics not available',
            message: 'Analytics are being processed, please try again in a few minutes'
          });
        }
        
        res.json({
          success: true,
          data: cachedData,
          cached: true,
          processedAt: cachedData.processedAt
        });
        
      } catch (error) {
        console.error('❌ [CACHED ANALYTICS] KOL Performance error:', error.message);
        res.status(500).json({
          success: false,
          error: 'Failed to get KOL Performance analytics',
          message: error.message
        });
      }
    });
    */
    
    // DISABLED: Get cached Market Momentum Analytics
    /*
    this.app.get('/api/cached/market-momentum', async (req, res) => {
      try {
        const cachedData = this.enhancedAnalyticsCache.getCachedAnalytics('MARKET_MOMENTUM');
        
        if (!cachedData) {
          return res.status(404).json({
            success: false,
            error: 'Market Momentum analytics not available',
            message: 'Analytics are being processed, please try again in a few minutes'
          });
        }
        
        res.json({
          success: true,
          data: cachedData,
          cached: true,
          processedAt: cachedData.processedAt
        });
        
      } catch (error) {
        console.error('❌ [CACHED ANALYTICS] Market Momentum error:', error.message);
        res.status(500).json({
          success: false,
          error: 'Failed to get Market Momentum analytics',
          message: error.message
        });
      }
    });
    */
    
    // Get cached Predictions Analytics
    this.app.get('/api/cached/predictions', async (req, res) => {
      try {
        const cachedData = this.enhancedAnalyticsCache.getCachedAnalytics('PREDICTIONS');
        
        if (!cachedData) {
          return res.status(404).json({
            success: false,
            error: 'Predictions analytics not available',
            message: 'Analytics are being processed, please try again in a few minutes'
          });
        }
        
        res.json({
          success: true,
          data: cachedData,
          cached: true,
          processedAt: cachedData.processedAt
        });
        
      } catch (error) {
        console.error('❌ [CACHED ANALYTICS] Predictions error:', error.message);
        res.status(500).json({
          success: false,
          error: 'Failed to get Predictions analytics',
          message: error.message
        });
      }
    });
    
    // Get cached Visualizations Data
    this.app.get('/api/cached/visualizations', async (req, res) => {
      try {
        const cachedData = this.enhancedAnalyticsCache.getCachedAnalytics('VISUALIZATIONS');
        
        if (!cachedData) {
          return res.status(404).json({
            success: false,
            error: 'Visualizations data not available',
            message: 'Analytics are being processed, please try again in a few minutes'
          });
        }
        
        res.json({
          success: true,
          data: cachedData,
          cached: true,
          processedAt: cachedData.processedAt
        });
        
      } catch (error) {
        console.error('❌ [CACHED ANALYTICS] Visualizations error:', error.message);
        res.status(500).json({
          success: false,
          error: 'Failed to get Visualizations data',
          message: error.message
        });
      }
    });
    
    // Get cached Comprehensive Insights
    this.app.get('/api/cached/insights', async (req, res) => {
      try {
        const cachedData = this.enhancedAnalyticsCache.getCachedAnalytics('INSIGHTS');
        
        if (!cachedData) {
          return res.status(404).json({
            success: false,
            error: 'Comprehensive insights not available',
            message: 'Analytics are being processed, please try again in a few minutes'
          });
        }
        
        res.json({
          success: true,
          data: cachedData,
          cached: true,
          processedAt: cachedData.processedAt
        });
        
      } catch (error) {
        console.error('❌ [CACHED ANALYTICS] Insights error:', error.message);
        res.status(500).json({
          success: false,
          error: 'Failed to get Comprehensive insights',
          message: error.message
        });
      }
    });
    
    // Get cache status and statistics
    this.app.get('/api/cached/status', async (req, res) => {
      try {
        const cacheStatus = this.enhancedAnalyticsCache.getCacheStatus();
        const isProcessing = this.enhancedAnalyticsCache.isProcessing;
        
        res.json({
          success: true,
          data: {
            cacheStatus,
            isProcessing,
            cacheTTL: this.enhancedAnalyticsCache.CACHE_TTL,
            processingInterval: this.enhancedAnalyticsCache.processingInterval ? 'active' : 'inactive'
          }
        });
        
      } catch (error) {
        console.error('❌ [CACHED ANALYTICS] Status error:', error.message);
        res.status(500).json({
          success: false,
          error: 'Failed to get cache status',
          message: error.message
        });
      }
    });
    
    // Force refresh specific analytics (admin endpoint)
    this.app.post('/api/cached/refresh/:type', async (req, res) => {
      try {
        const { type } = req.params;
        
        const result = await this.enhancedAnalyticsCache.refreshAnalytics(type);
        
        res.json({
          success: true,
          data: result,
          message: `${type} analytics refreshed successfully`
        });
        
      } catch (error) {
        console.error(`❌ [CACHED ANALYTICS] Refresh ${req.params.type} error:`, error.message);
        res.status(500).json({
          success: false,
          error: `Failed to refresh ${req.params.type} analytics`,
          message: error.message
        });
      }
    });
    
    // Get ML service metrics
    this.app.get('/api/ml/metrics', async (req, res) => {
      try {
        if (!this.enhancedPredictiveAnalytics) {
          return res.json({
            success: true,
            data: {
              initialized: false,
              message: 'Enhanced Predictive Analytics Service not initialized'
            }
          });
        }
        
        const metrics = this.enhancedPredictiveAnalytics.getMetrics();
        
        res.json({
          success: true,
          data: metrics,
          timestamp: new Date().toISOString()
        });
        
      } catch (error) {
        console.error(`❌ [ENHANCED ML] Metrics error:`, error.message);
        res.status(500).json({
          success: false,
          error: 'Failed to get ML metrics',
          message: error.message
        });
      }
    });

    // === AI ANALYSIS ENDPOINTS ===
    
    // Hype Trend Analysis endpoint (NO AI - just technical analysis)
    this.app.get('/api/hype-trend/:contract', async (req, res) => {
      try {
        const { contract } = req.params;
        const { range = '7d' } = req.query;
        
        console.log(`📊 Hype trend analysis request for ${contract} (${range})`);
        
        // Get token data first
        const tokens = await this.getTokensFromCache();
        const token = tokens.find(t => 
          t.contractAddress?.toLowerCase() === contract.toLowerCase() ||
          t.symbol?.toLowerCase() === contract.toLowerCase()
        );
        
        if (!token) {
          return res.json({
            success: false,
            error: 'Token not found',
            message: 'Token not found in our database'
          });
        }
        
        // Get hype data for the token
        const hypeData = await this.getHypeDataForAnalysis(contract, range);
        
        if (!hypeData || hypeData.length < 3) {
          return res.json({
            success: false,
            error: 'Insufficient hype data',
            message: 'Need at least 3 data points for trend analysis'
          });
        }
        
        // Perform ONLY hype trend analysis (NO AI)
        const analysisResult = this.hypeTrendAnalysis.analyzeHypeTrend(hypeData, range);
        
        // Structure the response to match frontend expectations (same as new endpoint)
        const response = {
          success: analysisResult.success,
          contractAddress: contract,
          symbol: token.symbol,
          range: range,
          timestamp: new Date().toISOString(),
          dataPoints: hypeData.length,
          
          // Core analysis data with fixed structure
          analysis: {
            // Technical indicators with adaptive Bayesian data
            technicalIndicators: {
              ewma: analysisResult.analysis?.technicalIndicators?.ewma,
              derivative: analysisResult.analysis?.technicalIndicators?.derivative,
              
              // ✅ ADAPTIVE BAYESIAN CHANGE POINTS - Fixed structure!
              changePoints: {
                length: analysisResult.analysis?.technicalIndicators?.changePoints?.changePoints?.length || 0,
                hasRecentChange: analysisResult.analysis?.technicalIndicators?.changePoints?.hasRecentChange || false,
                changeDirection: analysisResult.analysis?.technicalIndicators?.changePoints?.changeDirection || 'stable',
                recentChangePoint: analysisResult.analysis?.technicalIndicators?.changePoints?.recentChangePoint,
                adaptiveThreshold: analysisResult.analysis?.technicalIndicators?.changePoints?.adaptiveThreshold,
                allChangePoints: analysisResult.analysis?.technicalIndicators?.changePoints?.changePoints || []
              }
            },
            
            // Current regime and prediction
            currentRegime: analysisResult.analysis?.regime,
            prediction: analysisResult.analysis?.prediction,
            
            // Recommendation data
            recommendation: analysisResult.analysis?.recommendation,
            
            // Forecast data for the 6-12h timeline
            forecast: analysisResult.analysis?.forecast,
            
            // Legacy fields for compatibility
            regime: analysisResult.analysis?.regime,
            trend: analysisResult.analysis?.trend,
            direction: analysisResult.analysis?.direction,
            confidence: analysisResult.analysis?.confidence || 0
          },
          
          // Confidence and metadata
          confidence: analysisResult.analysis?.confidence || 0,
          metadata: {
            analysisVersion: '2.0-adaptive-bayesian-legacy',
            generatedAt: new Date().toISOString(),
            range,
            dataSource: hypeData.length > 0 && !hypeData[0].synthetic ? 'real_snapshots' : 'synthetic_data',
            dataQuality: hypeData.length > 20 ? 'excellent' : 
                        hypeData.length > 10 ? 'good' : 'moderate'
          }
        };
        
        console.log(`📊 Hype Trend Analysis completed for ${contract}: ${response.analysis.technicalIndicators.changePoints.length} change points, ${response.analysis.forecast?.length || 0} forecast points`);
        
        res.json(response);
        
      } catch (error) {
        console.error('❌ Hype trend analysis error:', error);
        res.status(500).json({
          success: false,
          error: 'Internal server error',
          message: 'Failed to analyze hype trend'
        });
      }
    });

    
    // Get AI social context analysis for a token
    this.app.get('/api/ai/social-context/:contract', async (req, res) => {
      try {
        const { contract } = req.params;
        const { sessionId, useCache = 'true' } = req.query;
        
        console.log(`🧠 AI social context request for ${contract}`);
        
        // Authentication and usage limit check
        let isPremium = false;
        let user = null;
        console.log(`🧠 AI Analysis - SessionId received: ${sessionId ? sessionId.slice(-8) + '...' : 'NONE'}`);
        
        if (sessionId) {
          try {
            user = await this.oauthXService.getUserBySession(sessionId);
            console.log(`🧠 AI Analysis - User lookup result:`, {
              found: !!user,
              username: user?.username,
              userId: user?.id
            });
            
            if (user) {
              // Properly check premium status using the same method as other endpoints
              const premiumStatus = await this.oauthXService.db.getPremiumStatus(user.id);
              isPremium = premiumStatus?.isPremium && 
                (!premiumStatus.expiresAt || new Date(premiumStatus.expiresAt) > new Date());
              
              console.log(`🧠 AI Analysis - Premium Status Details:`, {
                premiumStatus,
                isPremiumFlag: premiumStatus?.isPremium,
                expiresAt: premiumStatus?.expiresAt,
                isExpired: premiumStatus?.expiresAt ? new Date(premiumStatus.expiresAt) <= new Date() : 'no expiry',
                finalIsPremium: isPremium
              });
            }
            
            console.log(`🧠 AI Analysis - Final Premium Status: ${isPremium}`);
          } catch (err) {
            console.log(`🧠 AI Analysis - Failed to get user from sessionId: ${err.message}`);
            console.log(`🧠 AI Analysis - Error details:`, err);
            // Continue without premium features
          }
        } else {
          console.log(`🧠 AI Analysis - No sessionId provided, treating as non-premium`);
        }
        
        // Check usage limits for free users
        if (!isPremium && user) {
          const usageCount = await this.getAIUsageCount(user.id);
          if (usageCount >= 5) {
            return res.status(429).json({
              error: 'Usage limit exceeded',
              message: 'Free users are limited to 5 AI analyses per month. Upgrade to Premium for unlimited access.',
              usageCount: usageCount,
              limit: 5,
              isPremium: false
            });
          }
        }
        
        // Get token data
        const tokens = await this.getTokensFromCache();
        const token = tokens.find(t => 
          t.contractAddress?.toLowerCase() === contract.toLowerCase() ||
          t.symbol?.toLowerCase() === contract.toLowerCase()
        );
        
        if (!token) {
          return res.status(404).json({ 
            error: 'Token not found',
            message: 'Token not found in our database'
          });
        }
        
        // Check if we have sufficient data for analysis
        if (!token.twitterData && !token.jupiterData) {
          return res.status(400).json({
            error: 'Insufficient data',
            message: 'Token lacks social and market data for AI analysis'
          });
        }
        
        // Add call history data
        const callHistory = await this.getTokenCallHistory(contract);
        token.callHistory = callHistory;
        
        // Add holder insights data for enhanced AI analysis
        try {
          const holderInsights = await this.getHolderInsights(contract);
          if (holderInsights.success && holderInsights.data) {
            token.holderData = holderInsights.data;
            console.log(`📊 Added holder data to AI analysis for ${token.symbol}`);
          }
        } catch (error) {
          console.log(`⚠️ Could not fetch holder data for AI analysis: ${error.message}`);
        }
        
        // Add Moralis TokenAnalytics data for enhanced AI analysis
        try {
          const { default: TechnicalAnalysisService } = await import('./services/TechnicalAnalysisService.js');
          const techAnalysisService = new TechnicalAnalysisService();
          const moralisAnalytics = await techAnalysisService.getMoralisTokenAnalytics(contract);
          if (moralisAnalytics) {
            token.moralisAnalytics = moralisAnalytics;
            console.log(`📊 Added Moralis TokenAnalytics data to AI analysis for ${token.symbol}`);
          }
        } catch (error) {
          console.log(`⚠️ Could not fetch Moralis TokenAnalytics for AI analysis: ${error.message}`);
        }
        
        // Generate AI analysis
        const analysisOptions = {
          useCache: useCache === 'true',
          cacheExpiry: isPremium ? 3600000 : 7200000, // Premium: 1hr, Free: 2hr (much longer cache)
          model: isPremium ? 'gpt-4o-mini' : 'gpt-3.5-turbo', // 🚀 COST OPTIMIZATION: Premium users get gpt-4o-mini instead of gpt-4
          temperature: 0.7,
          identity: { contract, symbol: token?.symbol }
        };
        
        const analysis = await this.socialContextAI.analyzeSocialContext(token, analysisOptions);
        
        // Track usage for free users
        if (!isPremium && user) {
          await this.trackAIUsage(user.id, analysis.metadata?.analysisId);
        }
        
        // Add premium features and actionable recommendations
        if (isPremium) {
          analysis.premiumInsights = {
            detailedRiskAnalysis: true,
            advancedCatalysts: true,
            competitiveAnalysis: true,
            marketTimingSignals: true
          };
          
          // Add actionable recommendations for premium users
          analysis.actionableRecommendations = this.generateActionableRecommendations(analysis, token);
        } else {
          // Limit insights for free users
          if (analysis.keyInsights && analysis.keyInsights.length > 2) {
            analysis.keyInsights = analysis.keyInsights.slice(0, 2);
            analysis.keyInsights.push("Upgrade to Premium for more insights...");
          }
          
          // Basic recommendations for free users
          analysis.actionableRecommendations = this.generateBasicRecommendations(analysis, token);
        }
        
        // Get updated usage count for response
        const currentUsageCount = !isPremium && user ? await this.getAIUsageCount(user.id) : 0;
        
        // Debug: Log the analysis structure being returned
        console.log(`🔍 AI Analysis Response for ${token.symbol}:`, {
          sentiment: analysis.sentiment,
          confidence: analysis.confidence,
          keyInsights: analysis.keyInsights?.length || 0,
          aiAssessment: analysis.aiAssessment,
          riskAssessment: analysis.riskAssessment,
          recommendation: analysis.recommendation,
          catalysts: typeof analysis.catalysts,
          redFlags: typeof analysis.redFlags,
          recommendedActions: analysis.recommendedActions?.length || 0
        });

        res.json({
          success: true,
          analysis: analysis,
          tokenInfo: {
            symbol: token.symbol,
            name: token.name,
            contractAddress: token.contractAddress,
            currentPrice: token.jupiterData?.price || token.price,
            marketCap: token.jupiterData?.marketCap || token.marketCap
          },
          isPremium: isPremium,
          usageCount: currentUsageCount,
          usageLimit: 5,
          dataFreshness: analysis.metadata?.dataFreshness || 'unknown'
        });
        
      } catch (error) {
        console.error('[🧠 AI] ❌ Social context analysis error:', error.message);
        res.status(500).json({ 
          error: 'AI analysis failed',
          message: error.message,
          fallback: 'Try again in a few moments'
        });
      }
    });
    
    // Quick AI Analysis endpoint (faster, simplified)
    this.app.get('/api/ai/quick-analysis/:contract', async (req, res) => {
      try {
        const { contract } = req.params;
        const { sessionId } = req.query;
        
        console.log(`⚡ Quick AI analysis request for ${contract}`);
        
        // Get token data
        const tokens = await this.getTokensFromCache();
        const token = tokens.find(t => 
          t.contractAddress?.toLowerCase() === contract.toLowerCase() ||
          t.symbol?.toLowerCase() === contract.toLowerCase()
        );
        
        if (!token) {
          return res.status(404).json({ 
            error: 'Token not found',
            message: 'Token not found in our database'
          });
        }
        
        // Generate quick analysis without OpenAI
        const quickAnalysis = this.generateQuickAnalysis(token);
        
        res.json({
          success: true,
          analysis: quickAnalysis,
          tokenInfo: {
            symbol: token.symbol,
            name: token.name,
            contractAddress: token.contractAddress,
            currentPrice: token.jupiterData?.price || token.price,
            marketCap: token.jupiterData?.marketCap || token.marketCap
          },
          isQuickAnalysis: true,
          dataFreshness: 'real-time'
        });
        
      } catch (error) {
        console.error('[⚡ Quick AI] ❌ Quick analysis error:', error.message);
        res.status(500).json({ 
          error: 'Quick analysis failed',
          message: error.message,
          fallback: 'Try the full analysis instead'
        });
      }
    });

    // AI Analysis Feedback endpoint
    this.app.post('/api/ai/feedback/:contract', async (req, res) => {
      try {
        const { contract } = req.params;
        const { helpful, analysisId, feedback } = req.body;
        
        // Log feedback for training purposes
        console.log(`📊 AI Analysis Feedback for ${contract}:`, {
          analysisId,
          helpful,
          feedback,
          timestamp: new Date().toISOString(),
          userAgent: req.get('User-Agent')
        });
        
        // Store feedback in a simple format (you could expand this to a database)
        const feedbackData = {
          contract,
          analysisId,
          helpful,
          feedback,
          timestamp: new Date().toISOString(),
          ip: req.ip
        };
        
        // For now, just log it. In production, you'd store this in a database
        // and use it to improve the AI prompts and responses
        
        res.json({ 
          success: true, 
          message: 'Feedback recorded for AI training',
          feedbackId: `feedback_${Date.now()}`
        });
      } catch (error) {
        console.error('❌ Error recording AI feedback:', error);
        res.status(500).json({ error: 'Failed to record feedback' });
      }
    });

    // Get AI analysis metrics and status
    this.app.get('/api/ai/metrics', async (req, res) => {
      try {
        const socialMetrics = this.socialContextAI.getPerformanceMetrics();
        const openaiMetrics = this.socialContextAI.openaiService.getMetrics();
        
        res.json({
          success: true,
          metrics: {
            social: socialMetrics,
            openai: openaiMetrics,
            status: {
              socialAI: this.socialContextAI.isInitialized,
              openaiService: openaiMetrics.isInitialized
            }
          }
        });
      } catch (error) {
        console.error('[🧠 AI] ❌ Metrics error:', error.message);
        res.status(500).json({ error: 'Failed to get AI metrics' });
      }
    });
    
    // Record user feedback on AI analysis
    this.app.post('/api/ai/feedback', async (req, res) => {
      try {
        const { analysisId, feedback, sessionId } = req.body;
        
        if (!analysisId || !feedback) {
          return res.status(400).json({ error: 'Analysis ID and feedback required' });
        }
        
        // Optional: verify user session
        if (sessionId) {
          try {
            await this.oauthXService.getUserBySession(sessionId);
          } catch (err) {
            return res.status(401).json({ error: 'Invalid session' });
          }
        }
        
        // Record feedback
        this.socialContextAI.recordUserFeedback(analysisId, feedback);
        
        res.json({
          success: true,
          message: 'Feedback recorded successfully'
        });
        
      } catch (error) {
        console.error('[🧠 AI] ❌ Feedback error:', error.message);
        res.status(500).json({ error: 'Failed to record feedback' });
      }
    });

    // Priority boost endpoints for near real-time updates
    this.app.post('/api/tokens/boost-priority', async (req, res) => {
      try {
        const { contractAddress, durationMs = 3600000 } = req.body; // Default 1 hour boost
        
        if (!contractAddress) {
          return res.status(400).json({ error: 'Contract address is required' });
        }
        
        await this.priorityQueue.boostTokenPriority(contractAddress, durationMs);
        res.json({ 
          success: true, 
          message: `Token ${contractAddress.substring(0, 8)} boosted to HIGH priority`,
          durationMinutes: Math.round(durationMs / 60000)
        });
      } catch (error) {
        console.error('[🛡️ Enhanced Backend] ❌ Priority boost error:', error.message);
        res.status(500).json({ error: 'Failed to boost token priority' });
      }
    });

    this.app.get('/api/tokens/priority-stats', async (req, res) => {
      try {
        const tokens = await this.getTokensFromCache();
        const stats = this.priorityQueue.getPriorityStats(tokens);
        res.json({ success: true, data: stats });
      } catch (error) {
        console.error('[🛡️ Enhanced Backend] ❌ Priority stats error:', error.message);
        res.status(500).json({ error: 'Failed to get priority stats' });
      }
    });

    // Internal import endpoint for discovery microservices (secured via X-Internal-Token)
    this.app.post('/api/internal/discovery/import', async (req, res) => {
      try {
        const internalToken = process.env.INTERNAL_TOKEN || process.env.DISCOVERY_INTERNAL_TOKEN;
        const providedToken = req.headers['x-internal-token'] || req.query.token;

        if (!internalToken) {
          return res.status(503).json({ success: false, error: 'Internal import not configured (no INTERNAL_TOKEN)' });
        }
        if (!providedToken || providedToken !== internalToken) {
          return res.status(403).json({ success: false, error: 'Forbidden' });
        }

        const { source = 'jup-discovery', category = 'unknown', interval = '5m', tokens: candidates } = req.body || {};
        if (!Array.isArray(candidates)) {
          return res.status(400).json({ success: false, error: 'Invalid payload: tokens[] required' });
        }

        console.log(`[🔍 Discovery Import] Received ${candidates.length} candidates from ${source} (${category}/${interval})`);
        if (candidates.length > 0) {
          const sampleSymbols = candidates.slice(0, 5).map(c => c.symbol || 'UNKNOWN').join(', ');
          console.log(`[🔍 Discovery Import] Sample tokens: ${sampleSymbols}${candidates.length > 5 ? '...' : ''}`);
        }

        const stableSymbols = new Set(['SOL', 'JUP', 'WETH', 'WSOL', 'WBTC', 'USDC','USDT','DAI','FRAX','PYUSD','BNSOL', 'JLP', 'JupSOL']);
        // Recently-seen TTL (15m) to avoid spam inserts/logs for same contract
        const recentFile = path.join(this.oauthXService?.db?.baseDir || process.env.DATA_DIR || '/var/data/dgo', 'cache', 'recent-seen-contracts.json');
        let recentMap = {};
        try { const raw = await fs.readFile(recentFile, 'utf8'); recentMap = JSON.parse(raw || '{}'); } catch (_) {}
        const nowMs = Date.now();
        const ttlMs = 15 * 60 * 1000;
        const nowIso = new Date().toISOString();

        // Load current cache
        const tokens = await this.getTokensFromCache();
        const byAddress = new Map(tokens.filter(t => t.contractAddress).map(t => [t.contractAddress.toLowerCase(), t]));

        let inserted = 0;
        let updated = 0;
        let boosted = 0;
        let skipped = 0;

        // Normalize and merge
        for (const c of candidates) {
          try {
            const contract = (c.contractAddress || c.address || c.mint || '').toString();
            const symbol = (c.symbol || '').toUpperCase();
            const name = c.name || symbol || 'Unknown Token';

            if (!contract || contract.length < 10) { skipped++; continue; }
            if (stableSymbols.has(symbol)) { skipped++; continue; }
            if (!c.graduatedAt) { skipped++; continue; }
            // TTL suppression
            const lower = contract.toLowerCase();
            const lastSeen = recentMap[lower] || 0;
            if (nowMs - lastSeen < ttlMs) { skipped++; continue; }
            
            // Robust suspicious filter: check multiple possible locations/encodings of isSus
            if (this.isSuspiciousToken(c)) {
              console.log(`[🔍 Discovery Import] 🚫 Skipping suspicious token: ${symbol} (audit flagged isSus)`);
              skipped++;
              continue;
            }

            const key = contract.toLowerCase();

            const jupInfo = {
              price: c.price ?? c.uiPrice ?? c.currentPrice ?? c.priceUsd ?? null,
              mcap: c.mcap ?? c.marketCap ?? null,
              liquidity: c.liquidity ?? c.liq ?? null,
              volume1h: c.volume1h ?? (c.volume && (c.volume['1h'] || c.volume.h1)) ?? null,
              trades1h: c.trades1h ?? (c.trades && (c.trades['1h'] || c.trades.h1)) ?? null,
              change1hPct: c.change1hPct ?? (c.priceChange && (c.priceChange['1h'] || c.priceChange.h1)) ?? null,
              holders: c.holders ?? c.holderCount ?? null,
              graduatedAt: c.graduatedAt,
              audit: c.audit || null, // Store audit information for reference
              updatedAt: nowIso,
              sourceCategory: category,
              sourceInterval: interval
            };

            if (byAddress.has(key)) {
              // Update existing
              const existing = byAddress.get(key);
              existing.symbol = existing.symbol || symbol;
              existing.name = existing.name || name;
              existing.contractAddress = existing.contractAddress || contract;
              existing.source = existing.source || 'jupiter';
              existing.stage = existing.stage || 'jupiter';
              existing.lastDiscoveredAt = nowIso;
              existing.discoveredVia = existing.discoveredVia || [];
              if (Array.isArray(existing.discoveredVia)) {
                existing.discoveredVia.push({ source, category, interval, at: nowIso });
              }
              existing.jupiterData = { ...(existing.jupiterData || {}), ...jupInfo };
              // Ensure suspicious tokens never leak through updates
              if (this.isSuspiciousToken(existing)) {
                console.log(`[🔍 Discovery Import] 🚫 Update blocked (suspicious): ${symbol}`);
                skipped++;
                continue;
              }
              updated++;
            } else {
              // Insert new minimal token
              const newToken = {
                symbol: symbol || 'UNKNOWN',
                name,
                contractAddress: contract,
                source: 'jupiter',
                stage: 'jupiter',
                createdAt: nowIso,
                lastDiscoveredAt: nowIso,
                discoveredVia: [{ source, category, interval, at: nowIso }],
                hasJupiterData: true,
                jupiterData: jupInfo
              };
              if (this.isSuspiciousToken(newToken)) {
                console.log(`[🔍 Discovery Import] 🚫 Insert blocked (suspicious): ${symbol}`);
                skipped++;
                continue;
              }
              tokens.push(newToken);
              byAddress.set(key, newToken);
              inserted++;
              recentMap[lower] = nowMs;
              console.log(`[🔍 Discovery Import] ➕ New token: ${symbol} (${name}) - MC: $${jupInfo.mcap ? (jupInfo.mcap/1000000).toFixed(1) + 'M' : 'N/A'}`);
            }

            // Boost priority for near real-time updates
            try {
              await this.priorityQueue.boostTokenPriority(contract, 30 * 60 * 1000);
              boosted++;
            } catch (boostErr) {
              // Non-fatal
              console.warn('[🎯 PriorityQueue] Boost failed for', contract.substring(0, 8), boostErr.message);
            }
          } catch (_err) {
            skipped++;
          }
        }

        // Save updated cache if any changes
        if (inserted > 0 || updated > 0) {
          // Debug: Check if any target tokens were imported
          const targetTokens = [
            'HyvavV2Cs387fCEHv6CELe7RZ1NnHT8ADSsBZwS3XTML',
            '9SkYDKwdYDF4cRCgKVivBne8u8RoAV9RycsrL69D1s2X',
            'B1NYxvHT9XM11zLRKWykUApLev2a5Uo6sT8ykFKSzDd3',
            '4QTAvmonFdYBsC797WWkQLPr67pfBGy4ia3arnt9SEd1',
            'EMZGT8niJdNcNrSFHXExUrGKvAuVQ2KWi1oyrY4XMnH6'
          ];
          
          const foundTargets = tokens.filter(t => targetTokens.includes(t.contractAddress));
          if (foundTargets.length > 0) {
            console.log(`🚨 [DISCOVERY IMPORT] TARGET TOKENS FOUND IN CACHE:`, foundTargets.map(t => ({
              symbol: t.symbol,
              address: t.contractAddress,
              source: t._source || 'unknown',
              category: t._category || 'unknown',
              interval: t._interval || 'unknown',
              launchpad: t.jupiterData?.launchpad,
              graduatedAt: t.jupiterData?.graduatedAt,
              organicScore: t.jupiterData?.organicScore
            })));
          }
          
          await this.saveTokensToCache(tokens);
          
          // 🚀 AUTOMATIC PIPELINE PROCESSING for Jup-service imports
          console.log(`[🔍 Discovery Import] 🚀 Triggering automatic pipeline processing for ${inserted} new + ${updated} updated tokens`);
          
          try {
            // Trigger processing for new tokens (they need full pipeline)
            if (inserted > 0) {
              console.log(`[🔍 Discovery Import] 📊 Processing ${inserted} new tokens through full pipeline (Twitter → Scoring → Saving)`);
              await this.tokenProcessor.processNewTokensFromJupService();
            }
            
            // For updated tokens, just boost their priority for Twitter/scoring updates
            if (updated > 0) {
              console.log(`[🔍 Discovery Import] ⚡ ${updated} existing tokens updated - priority boosted for Twitter/scoring refresh`);
            }
          } catch (processingError) {
            console.error(`[🔍 Discovery Import] ⚠️ Pipeline processing failed:`, processingError.message);
            // Don't fail the import if processing fails
          }
        }
        // Persist recent-seen TTL file (prune old)
        try {
          const pruned = {};
          for (const [k, v] of Object.entries(recentMap)) {
            if (nowMs - v < ttlMs) pruned[k] = v;
          }
          await fs.writeFile(recentFile, JSON.stringify(pruned, null, 2));
        } catch (_) {}

        return res.json({ success: true, stats: { inserted, updated, boosted, skipped, total: candidates.length } });
      } catch (error) {
        console.error('[🛡️ Enhanced Backend] ❌ Internal discovery import error:', error.message);
        res.status(500).json({ success: false, error: 'Failed to import discovery tokens' });
      }
    });

    // ========================================
    // 🔥 FUEL TOKEN ENDPOINTS
    // ========================================

    // Get fueled tokens
    this.app.get('/api/tokens/fuel', async (req, res) => {
      try {
        console.log('[🛡️ Enhanced Backend] 🔥 Getting fueled tokens...');
        
        const fueledTokens = await this.getFueledTokens();
        
        console.log(`[🛡️ Enhanced Backend] ✅ Returning ${fueledTokens.length} fueled tokens`);
        res.json(fueledTokens);
        
      } catch (error) {
        console.error('[🛡️ Enhanced Backend] ❌ Error getting fueled tokens:', error);
        res.status(500).json({ error: 'Failed to get fueled tokens' });
      }
    });

    // Simplified x402 Payment Endpoint (backend handles everything via facilitator)
    this.app.post('/api/x402/pay/:nonce', async (req, res) => {
      try {
        const { nonce } = req.params;
        
        console.log('[🛡️ x402] 💳 Processing payment for nonce:', nonce);

        const payment = this.twitterMentionService.x402Service.getPendingPayment(nonce);
        
        if (!payment) {
          return res.status(404).json({ 
            success: false,
            error: 'Payment not found or has expired' 
          });
        }

        // Check if expired
        if (payment.expiresAt < Date.now()) {
          return res.status(410).json({ 
            success: false,
            error: 'Payment link has expired' 
          });
        }

        // For now, simulate payment success
        // In production, this would integrate with PayAI facilitator to handle the actual payment
        console.log('[🛡️ x402] ⚠️ DEMO MODE: Simulating payment success');
        
        const txHash = 'demo_' + Date.now();
        
        // Update payment status
        this.twitterMentionService.x402Service.markPaymentCompleted(nonce, txHash);

        // Apply fuel to token
        const token = await this.databaseService.getTokenByAddress(payment.contractAddress);
        if (token) {
          await this.fuelService.applyFuel(token, payment.fuelType);
          console.log(`[🛡️ x402] ✅ Fuel ${payment.fuelType} applied to ${payment.tokenSymbol}`);

          // Post Twitter confirmation
          if (payment.originalTweetId) {
            await this.twitterAutoPostService.postFuelConfirmation(
              token,
              payment.fuelType,
              { handle: payment.userHandle },
              payment.originalTweetId,
              txHash
            );
          }

          // Public announcement for high tiers
          if (payment.fuelType === '500x' || payment.fuelType === '1000x') {
            const announcement = `🔥 MASSIVE ${payment.fuelType.toUpperCase()} FUEL APPLIED!\n\n$${payment.tokenSymbol} just got boosted by @${payment.userHandle}\n\nThis token is now trending HARD on degen-oracle.com 🚀\n\n#DegenMode #SolanaAlpha`;
            await this.oauthXService.postTweet(announcement);
          }
        }

        res.json({
          success: true,
          tokenSymbol: payment.tokenSymbol,
          fuelType: payment.fuelType,
          transactionHash: txHash,
          status: 'completed'
        });

      } catch (error) {
        console.error('[🛡️ x402] ❌ Error processing payment:', error);
        res.status(500).json({ success: false, error: 'Payment processing error' });
      }
    });

    // x402 AI Liquid Staking Router Endpoints
    // Execute Strategy Endpoint (returns 402 Payment Required)
    this.app.get('/api/x402/execute-strategy/:strategyId', async (req, res) => {
      try {
        const { strategyId } = req.params;
        const xPaymentHeader = this.x402PaymentHandler.extractPayment(req.headers);
        
        console.log('[🧠 x402 AI Router] 💳 Strategy execution requested for strategy:', strategyId);
        
        // Get strategy from enhanced jup-discovery background worker
        console.log('[🧠 x402 AI Router] Getting strategy from enhanced jup-discovery background worker...');
        
        // Since jup-discovery is a background worker, we'll create a mock strategy for now
        // In production, this would be retrieved from database or via direct module integration
        console.log('[🧠 x402 AI Router] Creating mock strategy for testing (background worker pattern)');
        
        // For testing purposes, create a mock strategy
        const strategy = {
          id: strategyId,
          name: 'AI Generated Strategy',
          type: 'basic',
          expectedYield: 6.2,
          currentYield: 5.1,
          improvement: 1.1,
          riskScore: 4.8,
          allocation: [
            {
              symbol: 'jitoSOL',
              name: 'Jito Staked SOL',
              percentage: 50,
              amount: 28.25,
              apr: 5.8,
              riskScore: 3.2,
              reasoning: 'High APR with low risk'
            }
          ],
          actions: [
            {
              type: 'swap',
              from: 'SOL',
              to: 'jitoSOL',
              amount: 28.25,
              reasoning: 'Convert unstacked SOL to high-yield LST'
            }
          ],
          risks: ['Validator slashing risk', 'Liquidity risk'],
          benefits: ['Higher yield', 'Diversified exposure'],
          cost: 1.20,
          generatedAt: new Date().toISOString()
        };
        
        // Determine payment amount based on strategy type
        const paymentAmount = strategy.type === 'basic' ? 1.20 : 2.00;
        
        // Create payment requirements (needed for both 402 response and payment verification)
        if (!this.x402PaymentHandler) {
          console.log('[🧠 x402 AI Router] ❌ x402PaymentHandler not initialized');
          return res.status(500).json({ 
            success: false, 
            error: 'Payment handler not initialized' 
          });
        }
        
        let paymentRequirements;
        try {
          const routeConfig = {
            price: {
              amount: (BigInt(Math.round(paymentAmount * 1e6))).toString(),
              asset: {
                address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
                decimals: 6
              }
            },
            network: 'solana',
            config: {
              resource: `https://api.degen-oracle.com/api/x402/execute-strategy/${strategyId}`,
              description: `${strategy.name} - AI Liquid Staking Optimization`,
              maxTimeoutSeconds: 300,
              mimeType: 'application/json'
            }
          };
          
          paymentRequirements = await this.x402PaymentHandler.createPaymentRequirements(routeConfig);
          console.log('[🧠 x402 AI Router] ✅ Payment requirements created successfully');
        } catch (createError) {
          console.log('[🧠 x402 AI Router] ❌ Failed to create payment requirements:', createError.message);
          return res.status(500).json({ 
            success: false, 
            error: 'Failed to create payment requirements',
            message: createError.message 
          });
        }
        
        // If no X-PAYMENT header, return 402 Payment Required
        if (!xPaymentHeader) {
          console.log('[🧠 x402 AI Router] 💰 Returning 402 Payment Required for strategy execution');
          
          const response402 = this.x402PaymentHandler.create402Response(paymentRequirements);
          return res.status(response402.status).json(response402.body);
        }
        
        // Verify and settle payment
        console.log('[🧠 x402 AI Router] 🔍 Verifying payment...');
        const verifyResult = await this.x402PaymentHandler.verifyPayment(xPaymentHeader, paymentRequirements);
        if (verifyResult !== true) {
          console.log('[🧠 x402 AI Router] ❌ Payment verification failed');
          return res.status(402).json({ 
            success: false, 
            error: 'Payment verification failed' 
          });
        }
        
        console.log('[🧠 x402 AI Router] 💰 Settling payment...');
        const settleResult = await this.x402PaymentHandler.settlePayment(xPaymentHeader, paymentRequirements);
        if (settleResult !== true) {
          console.log('[🧠 x402 AI Router] ❌ Payment settlement failed');
          return res.status(500).json({ 
            success: false, 
            error: 'Payment settlement failed' 
          });
        }
        
        console.log('[🧠 x402 AI Router] ✅ Payment successful, returning strategy and transactions');
        
        // Payment successful - return strategy with transactions
        res.json({
          success: true,
          strategy: strategy,
          transactions: strategy.transactions || [],
          payment: {
            amount: paymentAmount,
            currency: 'USDC',
            status: 'completed',
            transactionHash: `payai_${strategyId.substring(0, 16)}`
          },
          execution: {
            readyToExecute: true,
            singleTransaction: true,
            requiresSignature: true
          }
        });
        
      } catch (error) {
        console.error('[🧠 x402 AI Router] ❌ Strategy execution error:', error.message);
        res.status(500).json({ 
          success: false, 
          error: 'Strategy execution error',
          message: error.message 
        });
      }
    });

    // x402 Merchant Resource Endpoint (returns 402 Payment Required)
    // This is the endpoint the x402 SDK calls to initiate payment
    // Now using PayAI official @payai/x402-solana SDK
    this.app.get('/api/x402/fuel/:nonce', async (req, res) => {
      try {
        const { nonce } = req.params;
        const xPaymentHeader = this.x402PaymentHandler.extractPayment(req.headers);
        
        console.log('[🛡️ x402 PayAI SDK] 💳 Merchant resource requested for nonce:', nonce);
        console.log('[🛡️ x402 PayAI SDK] X-PAYMENT header:', xPaymentHeader ? 'Present' : 'Not present');

        // Get pending payment
        const payment = this.twitterMentionService.x402Service.getPendingPayment(nonce);
        
        if (!payment) {
          return res.status(404).json({ 
            error: 'Payment not found or has expired' 
          });
        }

        // Check if expired
        if (payment.expiresAt < Date.now()) {
          return res.status(410).json({ 
            error: 'Payment link has expired' 
          });
        }

        // If no X-PAYMENT header, return 402 Payment Required
        if (!xPaymentHeader) {
          console.log('[🛡️ x402 PayAI SDK] 💰 Generating 402 Payment Required...');
          
          // Convert USDC amount to atomic units (6 decimals)
          const amountLamports = (BigInt(Math.round(payment.amount * 1e6))).toString();
          
          // Create payment requirements using PayAI SDK
          const routeConfig = {
            price: {
              amount: amountLamports,
              asset: {
                address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC mainnet
                decimals: 6
              }
            },
            network: 'solana',
            config: {
              resource: `https://api.degen-oracle.com/api/x402/fuel/${nonce}`,
              description: `${payment.fuelType} Fuel for ${payment.tokenSymbol} (Twitter x402)`,
              maxTimeoutSeconds: 300,
              mimeType: 'application/json'
            }
          };
          
          const paymentRequirements = await this.x402PaymentHandler.createPaymentRequirements(routeConfig);
          const response402 = this.x402PaymentHandler.create402Response(paymentRequirements);
          
          console.log('[🛡️ x402 PayAI SDK] ✅ Returning 402 with payment requirements');
          
          return res.status(response402.status).json(response402.body);
        }

        // If X-PAYMENT header is present, verify and settle the payment
        console.log('[🛡️ x402 PayAI SDK] ✅ X-PAYMENT header present, verifying payment...');
        
        try {
          // Recreate payment requirements for verification
          const amountLamports = (BigInt(Math.round(payment.amount * 1e6))).toString();
          
          const routeConfig = {
            price: {
              amount: amountLamports,
              asset: {
                address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
                decimals: 6
              }
            },
            network: 'solana',
            config: {
              resource: `https://api.degen-oracle.com/api/x402/fuel/${nonce}`,
              description: `${payment.fuelType} Fuel for ${payment.tokenSymbol} (Twitter x402)`,
              maxTimeoutSeconds: 300,
              mimeType: 'application/json'
            }
          };
          
          const paymentRequirements = await this.x402PaymentHandler.createPaymentRequirements(routeConfig);

          // Verify payment using PayAI SDK
          console.log('[🛡️ x402 PayAI SDK] 📡 Verifying with PayAI facilitator...');
          const verifyResult = await this.x402PaymentHandler.verifyPayment(xPaymentHeader, paymentRequirements);

          console.log('[🛡️ x402 PayAI SDK] 📋 Verify result:', verifyResult);

          // SDK returns boolean: true = valid, false = invalid
          if (verifyResult !== true) {
            console.log('[🛡️ x402 PayAI SDK] ❌ Payment verification failed');
            return res.status(402).json({
              error: 'Payment verification failed',
              details: { isValid: verifyResult }
            });
          }
          
          console.log('[🛡️ x402 PayAI SDK] ✅ Payment verified!');

          // Settle payment using PayAI SDK
          console.log('[🛡️ x402 PayAI SDK] 💰 Settling payment...');
          const settleResult = await this.x402PaymentHandler.settlePayment(xPaymentHeader, paymentRequirements);

          console.log('[🛡️ x402 PayAI SDK] 📋 Settlement result:', settleResult);

          // SDK returns boolean: true = settled, false = failed
          if (settleResult !== true) {
            console.log('[🛡️ x402 PayAI SDK] ❌ Payment settlement failed');
            return res.status(500).json({
              error: 'Payment settlement failed',
              details: { settled: settleResult }
            });
          }

          console.log('[🛡️ x402 PayAI SDK] ✅ Payment settled successfully!');

          // Payment successful! Apply fuel
          // Note: SDK returns boolean, not transaction hash
          const txHash = 'payai_' + nonce.substring(0, 16); // Generate reference ID
          console.log('[🛡️ x402 PayAI SDK] 💚 Payment successful! Reference:', txHash);

          // Update payment status
          this.twitterMentionService.x402Service.completePayment(nonce);

          // Apply fuel to token
          const tokens = await this.getTokensFromCache();
          const token = tokens.find(t => 
            t.contractAddress?.toLowerCase() === payment.contractAddress?.toLowerCase()
          );
          
          if (token) {
            await this.applyFuelToToken(payment.contractAddress, payment.fuelType);
            console.log(`[🛡️ x402 PayAI SDK] ✅ Fuel ${payment.fuelType} applied to ${payment.tokenSymbol}`);

            // Post Twitter confirmation
            if (payment.originalTweetId) {
              await this.twitterAutoPostService.postFuelConfirmation(
                token,
                payment.fuelType,
                { handle: payment.userHandle },
                payment.originalTweetId,
                txHash
              );
            }

            // Public announcement for high tiers
            if (payment.fuelType === '500x' || payment.fuelType === '1000x') {
              const announcement = `🔥 MASSIVE ${payment.fuelType.toUpperCase()} FUEL APPLIED!\n\n$${payment.tokenSymbol} just got boosted by @${payment.userHandle}\n\nThis token is now trending HARD on degen-oracle.com 🚀\n\n#DegenMode #SolanaAlpha`;
              await this.oauthXService.postTweet(announcement);
            }
          }

          // Build settlement response for X-PAYMENT-RESPONSE header (x402 spec)
          const settlementResponse = {
            success: true,
            transaction: txHash,
            network: 'solana',
            payer: payment.userHandle
          };
          
          // Encode settlement response to base64 (x402 format)
          const xPaymentResponse = Buffer.from(JSON.stringify(settlementResponse)).toString('base64');
          
          // Return the resource with X-PAYMENT-RESPONSE header (payment confirmed)
          res.setHeader('X-PAYMENT-RESPONSE', xPaymentResponse);
          res.json({
            delivered: true,
            resourceId: nonce,
            message: 'Payment verified, delivering resource',
            tokenSymbol: payment.tokenSymbol,
            fuelType: payment.fuelType,
            transactionHash: txHash,
            status: 'completed'
          });

        } catch (verifyError) {
          console.error('[🛡️ x402 PayAI SDK] ❌ Error verifying/settling payment:', {
            message: verifyError.message,
            stack: verifyError.stack
          });
          
          return res.status(500).json({
            error: 'Payment processing error',
            details: verifyError.message
          });
        }

      } catch (error) {
        console.error('[🛡️ x402 PayAI SDK] ❌ Error in merchant resource endpoint:', error);
        res.status(500).json({ error: 'Server error' });
      }
    });

    // Apply fuel to token
    // Get x402 payment details by nonce (for payment page)
    this.app.get('/api/x402/payment-details/:nonce', async (req, res) => {
      try {
        const { nonce } = req.params;
        
        console.log('[🛡️ x402] 📄 Fetching payment details for nonce:', nonce);

        const payment = this.twitterMentionService.x402Service.getPendingPayment(nonce);
        
        if (!payment) {
          return res.status(404).json({ 
            success: false, 
            error: 'Payment not found or has expired' 
          });
        }

        // Check if expired
        if (payment.expiresAt < Date.now()) {
          return res.status(410).json({ 
            success: false, 
            error: 'Payment link has expired' 
          });
        }

        const priceInfo = this.twitterMentionService.x402Service.getFuelPrice(payment.fuelType);

        res.json({
          success: true,
          nonce: payment.nonce,
          tokenSymbol: payment.tokenSymbol,
          contractAddress: payment.contractAddress,
          fuelType: payment.fuelType,
          userHandle: payment.userHandle,
          amount: payment.amount,
          originalPrice: priceInfo.usd,
          discount: '90%',
          currency: 'USDC',
          network: 'Solana',
          payTo: this.twitterMentionService.x402Service.payToAddress,
          expiresAt: payment.expiresAt,
          status: payment.status,
          createdAt: payment.createdAt
        });

      } catch (error) {
        console.error('[🛡️ x402] ❌ Error fetching payment details:', error);
        res.status(500).json({ success: false, error: 'Server error' });
      }
    });

    // Proxy PayAI facilitator /supported endpoint (to avoid CORS)
    this.app.get('/api/x402/supported', async (req, res) => {
      try {
        console.log('[🛡️ x402] 📡 Proxying /supported request to PayAI facilitator...');

        // Forward to PayAI facilitator
        const facilitatorResponse = await axios.get('https://facilitator.payai.network/supported', {
          headers: {
            'Content-Type': 'application/json'
          }
        });

        console.log('[🛡️ x402] ✅ Facilitator supported networks:', facilitatorResponse.data);

        // Return the facilitator response
        res.json(facilitatorResponse.data);

      } catch (error) {
        console.error('[🛡️ x402] ❌ Error proxying /supported request:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
          error: error.message
        });
      }
    });

    // Proxy PayAI facilitator /settle endpoint (to avoid CORS)
    this.app.post('/api/x402/settle', async (req, res) => {
      try {
        const { paymentPayload, paymentRequirements } = req.body;
        
        console.log('[🛡️ x402] 📡 Proxying /settle request to PayAI facilitator...');
        console.log('[🛡️ x402] Payment payload:', JSON.stringify(paymentPayload, null, 2));
        console.log('[🛡️ x402] Payment requirements:', JSON.stringify(paymentRequirements, null, 2));

        // Forward to PayAI facilitator
        const facilitatorResponse = await axios.post('https://facilitator.payai.network/settle', {
          paymentPayload,
          paymentRequirements
        }, {
          headers: {
            'Content-Type': 'application/json'
          }
        });

        console.log('[🛡️ x402] ✅ Facilitator response:', facilitatorResponse.data);

        // Return the facilitator response
        res.json(facilitatorResponse.data);

      } catch (error) {
        console.error('[🛡️ x402] ❌ Error proxying /settle request:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
          success: false,
          errorReason: error.response?.data?.errorReason || error.message
        });
      }
    });

    // x402 Fuel Payment Webhook (from PayAI facilitator)
    this.app.post('/api/x402/fuel-payment-webhook', async (req, res) => {
      try {
        const paymentData = req.body;
        
        console.log('[🛡️ x402] 🔔 Received x402 fuel payment webhook:', paymentData);

        // Extract payment metadata
        const nonce = paymentData.nonce || paymentData.metadata?.nonce;
        const tokenSymbol = paymentData.metadata?.tokenSymbol;
        const contractAddress = paymentData.metadata?.contractAddress;
        const fuelType = paymentData.metadata?.fuelType;
        const userHandle = paymentData.metadata?.userHandle;
        const transactionHash = paymentData.transactionHash || paymentData.txHash;

        if (!nonce || !tokenSymbol || !contractAddress || !fuelType) {
          console.error('[🛡️ x402] ❌ Missing required payment metadata');
          return res.status(400).json({ error: 'Missing payment metadata' });
        }

        // Verify this is a valid pending payment
        const pendingPayment = this.twitterMentionService.x402Service.getPendingPayment(nonce);
        
        if (!pendingPayment) {
          console.error('[🛡️ x402] ❌ Payment nonce not found or already processed');
          return res.status(404).json({ error: 'Payment not found' });
        }

        // Apply fuel to token
        const fuelResult = await this.applyFuelToToken(contractAddress, fuelType);
        
        if (!fuelResult.success) {
          console.error('[🛡️ x402] ❌ Failed to apply fuel:', fuelResult.error);
          return res.status(500).json({ error: 'Failed to apply fuel' });
        }

        // Mark payment as completed
        this.twitterMentionService.x402Service.completePayment(nonce);

        // Record earning (90% discounted price)
        const pricing = this.twitterMentionService.x402Service.getFuelPrice(fuelType);
        if (pricing) {
          try {
            await this.oauthXService.db.addEarning({
              type: 'fuel_x402',
              category: fuelType,
              amount: pricing.discountedUsd,
              currency: 'USDC',
              userId: 'twitter_' + userHandle,
              username: userHandle,
              contractAddress: contractAddress,
              isGuest: true,
              source: 'twitter_x402',
              discount: '90%',
              originalPrice: pricing.usd,
              transactionHash: transactionHash,
              createdAt: new Date().toISOString()
            });
            console.log(`[🛡️ x402] ✅ Recorded earning: ${fuelType} - $${pricing.discountedUsd} USDC from @${userHandle}`);
          } catch (earningError) {
            console.error(`[🛡️ x402] ❌ Failed to record earning:`, earningError.message);
          }
        }

        // Send confirmation reply with image to the original tweet
        try {
          const originalTweetId = pendingPayment.originalTweetId;
          
          if (originalTweetId) {
            // Use TwitterAutoPostService to generate image and post as reply
            const user = { username: userHandle };
            await this.twitterAutoPostService.postFuelConfirmation(
              fuelResult.token, 
              fuelType, 
              user, 
              originalTweetId,
              transactionHash
            );
            console.log(`[🛡️ x402] ✅ Posted confirmation reply with image to tweet ${originalTweetId}`);
          } else {
            // Fallback: post standalone confirmation if no original tweet ID
            const confirmationReply = `@${userHandle} ✅ Payment confirmed! ${fuelType} Fuel applied to $${tokenSymbol} 🔥

TX: ${transactionHash.substring(0, 12)}...
Boost active for 12 hours!

Thanks for using x402 payments on Twitter! 🚀`;

            await this.twitterMentionService.twitterService.oauthXService.postTweet(
              this.twitterMentionService.twitterService.dgnOracleUserId,
              confirmationReply
            );
            
            console.log(`[🛡️ x402] ✅ Posted confirmation tweet to @${userHandle} (no original tweet ID)`);
          }
        } catch (replyError) {
          console.error(`[🛡️ x402] ❌ Failed to post confirmation reply:`, replyError.message);
        }

        // Auto-post PUBLIC announcement for high-tier fuels (500x and 1000x)
        if (fuelType === '500x' || fuelType === '1000x') {
          try {
            const user = { username: userHandle };
            await this.twitterAutoPostService.postFuelAnnouncement(fuelResult.token, fuelType, user);
            console.log(`[🛡️ x402] ✅ Auto-posted ${fuelType} public announcement`);
          } catch (twitterError) {
            console.error(`[🛡️ x402] ❌ Failed to auto-post:`, twitterError.message);
          }
        }

        res.json({
          success: true,
          message: 'Fuel applied successfully',
          token: fuelResult.token,
          fuelType,
          transactionHash
        });

      } catch (error) {
        console.error('[🛡️ x402] ❌ Webhook processing error:', error);
        res.status(500).json({ error: 'Webhook processing failed' });
      }
    });

    // x402 AI Liquid Staking Router Payment Webhook
    this.app.post('/api/x402/ai-router-payment-webhook', async (req, res) => {
      try {
        const paymentData = req.body;
        
        console.log('[🧠 x402 AI Router] 🔔 Received AI Router payment webhook:', paymentData);

        // Extract payment metadata
        const strategyId = paymentData.metadata?.strategyId;
        const strategyType = paymentData.metadata?.strategyType;
        const userWallet = paymentData.metadata?.userWallet;
        const transactionHash = paymentData.transactionHash || paymentData.txHash;
        const paymentAmount = paymentData.amount || (strategyType === 'basic' ? 1.20 : 2.00);

        if (!strategyId || !strategyType || !userWallet) {
          console.error('[🧠 x402 AI Router] ❌ Missing required metadata');
          return res.status(400).json({ 
            success: false, 
            error: 'Missing required metadata: strategyId, strategyType, userWallet' 
          });
        }

        console.log(`[🧠 x402 AI Router] 💰 Processing payment: ${strategyType} strategy for ${userWallet}`);

        // Record earning for AI Router service
        try {
          await this.oauthXService.db.addEarning({
            type: 'ai_router_x402',
            category: `${strategyType}_strategy`,
            amount: paymentAmount,
            currency: 'USDC',
            description: `AI Liquid Staking Router - ${strategyType} strategy execution`,
            userWallet: userWallet,
            strategyId: strategyId,
            transactionHash: transactionHash,
            createdAt: new Date().toISOString()
          });
          console.log(`[🧠 x402 AI Router] ✅ Recorded earning: ${strategyType} strategy - $${paymentAmount} USDC from ${userWallet}`);
        } catch (earningError) {
          console.error(`[🧠 x402 AI Router] ❌ Failed to record earning:`, earningError.message);
        }

        // Log successful payment
        console.log(`[🧠 x402 AI Router] ✅ AI Router payment processed successfully`);
        console.log(`  - Strategy ID: ${strategyId}`);
        console.log(`  - Strategy Type: ${strategyType}`);
        console.log(`  - User Wallet: ${userWallet}`);
        console.log(`  - Amount: $${paymentAmount} USDC`);
        console.log(`  - Transaction Hash: ${transactionHash}`);
        
        res.json({ 
          success: true, 
          message: 'AI Router payment webhook processed successfully',
          strategyId: strategyId,
          amount: paymentAmount
        });
        
      } catch (error) {
        console.error('[🧠 x402 AI Router] ❌ Webhook processing error:', error);
        res.status(500).json({ 
          success: false, 
          error: 'AI Router webhook processing failed',
          message: error.message 
        });
      }
    });

    this.app.post('/api/tokens/fuel', async (req, res) => {
      try {
        const { contractAddress, fuelType, sessionId } = req.body;
        
        console.log(`[🛡️ Enhanced Backend] 🔥 Applying ${fuelType} fuel to token: ${contractAddress}`);
        
        if (!contractAddress || !fuelType) {
          return res.status(400).json({ error: 'Contract address and fuel type are required' });
        }

        // Get user if sessionId provided
        let user = null;
        if (sessionId) {
          user = await this.oauthXService.getUserBySession(sessionId);
          if (user) {
            console.log(`[🛡️ Enhanced Backend] 🔥 Fuel request from user: ${user.username} (${user.id})`);
          }
        }

        const result = await this.applyFuelToToken(contractAddress, fuelType);
        
        if (result.success) {
          // Update user stats if user is authenticated
          if (user) {
            const statsUpdateResult = await this.updateUserStats(user.id, 'tokensFueled', 1);
            
            if (statsUpdateResult === null) {
              console.error(`[🛡️ Enhanced Backend] ❌ Failed to update tokensFueled stat for user ${user.username}`);
              // Continue with the response but log the error
            } else {
              console.log(`[🛡️ Enhanced Backend] ✅ Successfully updated tokensFueled stat for user ${user.username}: ${statsUpdateResult}`);
            }

            // Update totalSpent based on fuel type
            const fuelPrices = {
              '10x': 45.00,
              '50x': 195.00,
              '500x': 695.00,
              '1000x': 995.00
            };
            
            const fuelPrice = fuelPrices[fuelType];
            if (fuelPrice) {
              const totalSpentResult = await this.updateUserStats(user.id, 'totalSpent', fuelPrice);
              if (totalSpentResult === null) {
                console.error(`[🛡️ Enhanced Backend] ❌ Failed to update totalSpent stat for user ${user.username}`);
              } else {
                console.log(`[🛡️ Enhanced Backend] ✅ Successfully updated totalSpent stat for user ${user.username}: +$${fuelPrice} (total: $${totalSpentResult})`);
              }
            }
          }

          // ALWAYS record earning for admin panel (both logged-in users and guests)
          const fuelPrices = {
            '10x': 45.00,
            '50x': 195.00,
            '500x': 695.00,
            '1000x': 995.00
          };
          
          const fuelPrice = fuelPrices[fuelType];
          if (fuelPrice) {
            try {
              await this.oauthXService.db.addEarning({
                type: 'fuel',
                category: fuelType,
                amount: fuelPrice,
                currency: 'USD',
                userId: user ? user.id : 'guest',
                username: user ? user.username : 'guest',
                contractAddress: contractAddress,
                isGuest: !user, // Flag to identify guest payments
                createdAt: new Date().toISOString()
              });
              console.log(`[🛡️ Enhanced Backend] ✅ Recorded fuel earning: ${fuelType} - $${fuelPrice} from ${user ? user.username : 'GUEST'}`);
            } catch (earningError) {
              console.error(`[🛡️ Enhanced Backend] ❌ Failed to record fuel earning:`, earningError.message);
            }
          }
          
          // Auto-post to @dgnoracle for high-tier fuels (500x and 1000x)
          if (fuelType === '500x' || fuelType === '1000x') {
            try {
              console.log(`[🛡️ Enhanced Backend] 🐦 Auto-posting ${fuelType} fuel to @dgnoracle...`);
              await this.twitterAutoPostService.postFuelAnnouncement(result.token, fuelType, user);
            } catch (twitterError) {
              console.error(`[🛡️ Enhanced Backend] ❌ Failed to auto-post to Twitter:`, twitterError.message);
              // Don't fail the fuel application if Twitter post fails - just log it
            }
          }
          
          res.json({ success: true, message: result.message, token: result.token });
        } else {
          res.status(400).json({ success: false, error: result.error });
        }
        
      } catch (error) {
        console.error('[🛡️ Enhanced Backend] ❌ Error applying fuel:', error);
        res.status(500).json({ error: 'Failed to apply fuel' });
      }
    });

    // Remove fuel from token
    this.app.delete('/api/tokens/fuel/:contractAddress', async (req, res) => {
      try {
        const { contractAddress } = req.params;
        
        console.log(`[🛡️ Enhanced Backend] 🗑️ Removing fuel from token: ${contractAddress}`);
        
        if (!contractAddress) {
          return res.status(400).json({ error: 'Contract address is required' });
        }

        const result = await this.removeFuelFromToken(contractAddress);
        
        if (result.success) {
          res.json({ success: true, message: result.message });
        } else {
          res.status(400).json({ success: false, error: result.error });
        }
        
      } catch (error) {
        console.error('[🛡️ Enhanced Backend] ❌ Error removing fuel:', error);
        res.status(500).json({ error: 'Failed to remove fuel from token' });
      }
    });

    // User token listing endpoint
    this.app.post('/api/user/tokens/list', async (req, res) => {
      try {
        const { sessionId, contractAddress, symbol, name, socialLinks } = req.body;
        
        console.log(`[🛡️ Enhanced Backend] 📝 Token listing request received:`, {
          sessionId: sessionId ? 'present' : 'missing',
          contractAddress,
          symbol,
          name,
          socialLinks: socialLinks ? 'present' : 'missing'
        });
        
        if (!sessionId) {
          console.log(`[🛡️ Enhanced Backend] ❌ No sessionId provided`);
          return res.status(401).json({ 
            success: false, 
            error: 'Authentication required' 
          });
        }

        const user = await this.oauthXService.getUserBySession(sessionId);
        if (!user) {
          console.log(`[🛡️ Enhanced Backend] ❌ Invalid session: ${sessionId}`);
          return res.status(401).json({
            success: false,
            error: 'Invalid session'
          });
        }

        console.log(`[🛡️ Enhanced Backend] 📝 Token listing request from user: ${user.username} (${user.id})`);
        console.log(`[🛡️ Enhanced Backend] 📝 Token: ${symbol} (${contractAddress})`);

        // Update user stats with enhanced error handling
        const statsUpdateResult = await this.updateUserStats(user.id, 'tokensListed', 1);
        
        if (statsUpdateResult === null) {
          console.error(`[🛡️ Enhanced Backend] ❌ Failed to update tokensListed stat for user ${user.username}`);
          // Continue with the response but log the error
          // Don't fail the entire request just because stats update failed
        } else {
          console.log(`[🛡️ Enhanced Backend] ✅ Successfully updated tokensListed stat for user ${user.username}: ${statsUpdateResult}`);
        }

        // Update totalSpent for token listing ($95.00)
        const totalSpentResult = await this.updateUserStats(user.id, 'totalSpent', 95.00);
        if (totalSpentResult === null) {
          console.error(`[🛡️ Enhanced Backend] ❌ Failed to update totalSpent stat for user ${user.username}`);
        } else {
          console.log(`[🛡️ Enhanced Backend] ✅ Successfully updated totalSpent stat for user ${user.username}: +$95.00 (total: $${totalSpentResult})`);
        }

        // Record earning for admin panel
        try {
          await this.oauthXService.db.addEarning({
            type: 'listing',
            category: 'token_listing',
            amount: 95.00,
            currency: 'USD',
            userId: user.id,
            contractAddress: contractAddress,
            symbol: symbol,
            createdAt: new Date().toISOString()
          });
          console.log(`[🛡️ Enhanced Backend] ✅ Recorded token listing earning: $95.00 from ${user.username} for ${symbol}`);
        } catch (earningError) {
          console.error(`[🛡️ Enhanced Backend] ❌ Failed to record token listing earning:`, earningError.message);
        }

        // Get current user stats for response
        const currentTokensListed = await this.getUserStat(user.id, 'tokensListed');
        console.log(`[🛡️ Enhanced Backend] 📊 Current tokensListed for ${user.username}: ${currentTokensListed}`);

        res.json({ 
          success: true, 
          message: `Token ${symbol} listing request recorded successfully`,
          userStats: {
            tokensListed: currentTokensListed || 0
          }
        });
        
      } catch (error) {
        console.error('[🛡️ Enhanced Backend] ❌ Error processing token listing:', error);
        console.error('[🛡️ Enhanced Backend] ❌ Error details:', {
          message: error.message,
          stack: error.stack,
          body: req.body
        });
        res.status(500).json({ 
          success: false,
          error: 'Failed to process token listing' 
        });
      }
    });

    // Push Notification Subscription Endpoints
    this.app.post('/api/push/subscribe', async (req, res) => {
      try {
        const { subscription, userAgent } = req.body;
        
        if (!subscription || !subscription.endpoint) {
          return res.status(400).json({ 
            success: false, 
            error: 'Invalid subscription data' 
          });
        }

        // Check if device is mobile
        const isMobile = this.pushNotificationService.isMobileDevice(userAgent || req.headers['user-agent'] || '');
        
        if (!isMobile) {
          return res.status(400).json({ 
            success: false, 
            error: 'Push notifications are only available for mobile devices' 
          });
        }

        console.log(`[🛡️ Enhanced Backend] 📱 Mobile push subscription request from: ${userAgent?.substring(0, 50)}...`);

        const result = await this.pushNotificationService.subscribeDevice(subscription);
        
        if (result.success) {
          res.json({ 
            success: true, 
            message: 'Mobile device subscribed to push notifications successfully' 
          });
        } else {
          res.status(400).json(result);
        }
        
      } catch (error) {
        console.error('[🛡️ Enhanced Backend] ❌ Error subscribing to push notifications:', error);
        res.status(500).json({ 
          success: false,
          error: 'Failed to subscribe to push notifications' 
        });
      }
    });

    this.app.post('/api/push/unsubscribe', async (req, res) => {
      try {
        const { endpoint } = req.body;
        
        if (!endpoint) {
          return res.status(400).json({ 
            success: false, 
            error: 'Endpoint is required' 
          });
        }

        console.log(`[🛡️ Enhanced Backend] 📱 Mobile push unsubscription request`);

        const result = await this.pushNotificationService.unsubscribeDevice(endpoint);
        res.json(result);
        
      } catch (error) {
        console.error('[🛡️ Enhanced Backend] ❌ Error unsubscribing from push notifications:', error);
        res.status(500).json({ 
          success: false,
          error: 'Failed to unsubscribe from push notifications' 
        });
      }
    });

    this.app.get('/api/push/stats', async (req, res) => {
      try {
        const stats = await this.pushNotificationService.getStats();
        res.json({ success: true, stats });
      } catch (error) {
        console.error('[🛡️ Enhanced Backend] ❌ Error getting push notification stats:', error);
        res.status(500).json({ 
          success: false,
          error: 'Failed to get push notification stats' 
        });
      }
    });

    // Get bonding tokens (for Trenches filter) - Read from backend cache
    this.app.get('/api/tokens/bonding', async (req, res) => {
      try {
        const { limit = 500, proximityLevel } = req.query;
        
        console.log(`[🛡️ Enhanced Backend] 🚨 Getting bonding tokens from backend cache (limit: ${limit}, proximity: ${proximityLevel || 'all'})...`);
        
        // Read from backend cache file
        const fs = await import('fs/promises');
        const path = await import('path');
        
        const cacheFile = '/var/data/PreBonded-BackendCache.json';
        
        try {
          const cacheData = await fs.readFile(cacheFile, 'utf8');
          const parsedData = JSON.parse(cacheData);
          
          if (!parsedData.tokens || !Array.isArray(parsedData.tokens)) {
            return res.json({
              success: true,
              tokens: [],
              count: 0,
              totalCount: 0,
              proximityLevel: proximityLevel || 'all',
              source: 'backend-cache',
              message: 'No bonding tokens found in backend cache'
            });
          }
          
          let filteredTokens = parsedData.tokens;
          
          // Filter by proximity level if specified
          if (proximityLevel) {
            filteredTokens = parsedData.tokens.filter(token => 
              token.graduationProximity === proximityLevel
            );
          }
          
          // Apply limit
          const limitedTokens = filteredTokens.slice(0, parseInt(limit));
          
          console.log(`✅ [Bonding Tokens] Retrieved ${limitedTokens.length} tokens from backend cache`);
          
          res.json({
            success: true,
            tokens: limitedTokens,
            count: limitedTokens.length,
            totalCount: parsedData.tokens.length,
            proximityLevel: proximityLevel || 'all',
            source: 'backend-cache',
            lastUpdated: parsedData.timestamp
          });
          
        } catch (fileError) {
          console.log(`⚠️ [Bonding Tokens] Backend cache file not found: ${fileError.message}`);
          res.json({
            success: true,
            tokens: [],
            count: 0,
            totalCount: 0,
            proximityLevel: proximityLevel || 'all',
            source: 'backend-cache',
            message: 'Backend cache not available yet - waiting for Jupiter Service data'
          });
        }
        
      } catch (error) {
        console.error('❌ Failed to get bonding tokens from backend cache:', error.message);
        res.status(500).json({
          success: false,
          error: 'Failed to get bonding tokens from backend cache'
        });
      }
    });

    // Get complete token data by contract address
    this.app.get('/api/tokens/:contract', async (req, res) => {
      try {
        const { contract } = req.params;

        console.log(`[🛡️ Enhanced Backend] 📊 Getting complete token data for: ${contract}`);

        // Get tokens from cache
        const tokens = await this.getTokensFromCache();

        // Find the token by contract address
        const token = tokens.find(t =>
          t.contractAddress?.toLowerCase() === contract.toLowerCase() ||
          t.address?.toLowerCase() === contract.toLowerCase()
        );

        if (!token) {
          return res.status(404).json({ success: false, error: 'Token not found' });
        }

        res.json({ success: true, token: token });

      } catch (error) {
        console.error('[🛡️ Enhanced Backend] ❌ Get token error:', error.message);
        res.status(500).json({ success: false, error: 'Failed to get token data' });
      }
    });

    this.app.get('/api/tokens/:contract/mcap-chart', async (req, res) => {
      try {
        const { contract } = req.params;
        const { calledAt } = req.query;

        if (!calledAt) {
          return res.status(400).json({ error: 'Missing calledAt parameter' });
        }
        
        const chartData = await this.mcapService.getKolCallMcapChart(contract, calledAt);
        res.json({ success: true, data: chartData });
      } catch (error) {
        console.error('[🛡️ Enhanced Backend] ❌ Get mcap chart error:', error.message);
        res.status(500).json({ error: 'Failed to fetch chart data' });
      }
    });


    // Holder Insights API Endpoints
    this.app.get('/api/tokens/:contract/holders/top', async (req, res) => {
      try {
        const { contract } = req.params;
        const { limit = 20, supply } = req.query;
        
        console.log(`[🛡️ Enhanced Backend] 📊 Fetching top holders for: ${contract}`);
        
        const { default: TopHoldersService } = await import('./services/TopHoldersService.js');
        const topHoldersService = new TopHoldersService();
        
        const totalSupply = supply ? parseFloat(supply) : null;
        const result = await topHoldersService.getFormattedTopHolders(contract, totalSupply, parseInt(limit));
        
        if (result.success) {
          res.json({ success: true, data: result });
        } else {
          res.status(400).json({ success: false, error: result.error });
        }
      } catch (error) {
        console.error('[🛡️ Enhanced Backend] ❌ Get top holders error:', error.message);
        res.status(500).json({ success: false, error: 'Failed to fetch top holders data' });
      }
    });

    this.app.get('/api/tokens/:contract/holders/stats', async (req, res) => {
      try {
        const { contract } = req.params;
        
        console.log(`[🛡️ Enhanced Backend] 📈 Fetching holder stats for: ${contract}`);
        
        const { default: HolderStatsService } = await import('./services/HolderStatsService.js');
        const { default: TopHoldersService } = await import('./services/TopHoldersService.js');
        
        const holderStatsService = new HolderStatsService();
        const topHoldersService = new TopHoldersService();
        
        // Get top holders data for enhanced analysis
        const topHoldersResult = await topHoldersService.getFormattedTopHolders(contract, null, 100);
        const topHoldersData = topHoldersResult.success ? topHoldersResult : null;
        
        const result = await holderStatsService.getFormattedHolderStats(contract, topHoldersData);
        
        if (result.success) {
          // Add holder health score
          const healthScore = holderStatsService.calculateHolderHealth(result);
          result.healthScore = healthScore;
          
          res.json({ success: true, data: result });
        } else {
          res.status(400).json({ success: false, error: result.error });
        }
      } catch (error) {
        console.error('[🛡️ Enhanced Backend] ❌ Get holder stats error:', error.message);
        res.status(500).json({ success: false, error: 'Failed to fetch holder stats data' });
      }
    });

    this.app.get('/api/tokens/:contract/holders/timeseries', async (req, res) => {
      try {
        const { contract } = req.params;
        const { days = 7 } = req.query;
        
        console.log(`[🛡️ Enhanced Backend] 📊 Fetching holder timeseries for: ${contract} (${days}d)`);
        
        const { default: HolderTimeseriesService } = await import('./services/HolderTimeseriesService.js');
        const timeseriesService = new HolderTimeseriesService();
        
        // Get holder change analysis (multiple timeframes)
        const changeAnalysis = await timeseriesService.getHolderChangeAnalysis(contract);
        
        // Get holder flow analysis (daily changes over time)
        const flowAnalysis = await timeseriesService.getHolderFlow(contract, parseInt(days));
        
        if (changeAnalysis.success || flowAnalysis.success) {
          const result = {
            holderChanges: changeAnalysis.success ? changeAnalysis.holderChanges : null,
            currentHolders: changeAnalysis.success ? changeAnalysis.currentHolders : null,
            holderFlow: flowAnalysis.success ? flowAnalysis : null,
            lastUpdated: new Date().toISOString()
          };
          
          res.json({ success: true, data: result });
        } else {
          res.status(400).json({ 
            success: false, 
            error: changeAnalysis.error || flowAnalysis.error 
          });
        }
      } catch (error) {
        console.error('[🛡️ Enhanced Backend] ❌ Get holder timeseries error:', error.message);
        res.status(500).json({ success: false, error: 'Failed to fetch holder timeseries data' });
      }
    });

    this.app.get('/api/tokens/:contract/holders/insights', async (req, res) => {
      try {
        const { contract } = req.params;
        const { supply, force } = req.query;
        
        console.log(`[🛡️ Enhanced Backend] 🔍 Fetching complete holder insights for: ${contract}`);
        
        // Import all holder services and cache service
        const { default: TopHoldersService } = await import('./services/TopHoldersService.js');
        const { default: HolderStatsService } = await import('./services/HolderStatsService.js');
        const { default: HolderTimeseriesService } = await import('./services/HolderTimeseriesService.js');
        const { default: HolderCacheService } = await import('./services/HolderCacheService.js');
        
        const topHoldersService = new TopHoldersService();
        const holderStatsService = new HolderStatsService();
        const timeseriesService = new HolderTimeseriesService();
        const cacheService = new HolderCacheService();
        
        const totalSupply = supply ? parseFloat(supply) : null;
        
        // Check cache first (unless force refresh is requested)
        if (!force) {
          const cachedInsights = await cacheService.getCachedData(contract, 'insights');
          if (cachedInsights) {
            console.log(`✅ Returning cached holder insights for ${contract}`);
            return res.json({ 
              success: true, 
              data: cachedInsights.data,
              cached: true,
              cachedAt: cachedInsights.cachedAt
            });
          }
        }
        
        // Cache miss or force refresh - fetch fresh data
        console.log(`🔄 Fetching fresh holder insights for ${contract}`);
        
        // Fetch top holders first, then use that data for stats calculation
        const topHoldersResult = await topHoldersService.getFormattedTopHolders(contract, totalSupply, 20);
        
        // Fetch other data in parallel
        const [holderStatsResult, timeseriesResult] = await Promise.allSettled([
          holderStatsService.getFormattedHolderStats(contract, topHoldersResult.success ? topHoldersResult : null),
          timeseriesService.getHolderChangeAnalysis(contract)
        ]);
        
        // Process results
        const insights = {
          topHolders: topHoldersResult.success ? topHoldersResult : null,
          holderStats: holderStatsResult.status === 'fulfilled' && holderStatsResult.value.success ? 
            holderStatsResult.value : null,
          holderChanges: timeseriesResult.status === 'fulfilled' && timeseriesResult.value.success ? 
            timeseriesResult.value.holderChanges : null,
          currentHolders: timeseriesResult.status === 'fulfilled' && timeseriesResult.value.success ? 
            timeseriesResult.value.currentHolders : null,
          holderFlowData: timeseriesResult.status === 'fulfilled' && timeseriesResult.value.success ? 
            timeseriesResult.value.holderFlowData : null
        };
        
        // Generate mock acquisition data (since Moralis doesn't provide this)
        if (insights.currentHolders) {
          insights.holdersByAcquisition = timeseriesService.generateMockAcquisitionData(insights.currentHolders);
        }
        
        // Calculate overall health score if we have stats
        if (insights.holderStats) {
          insights.healthScore = holderStatsService.calculateHolderHealth(insights.holderStats);
        }
        
        insights.lastUpdated = new Date().toISOString();
        
        // Cache the results for 24 hours
        await cacheService.setCachedData(contract, 'insights', insights);
        
        res.json({ 
          success: true, 
          data: insights,
          cached: false,
          fetchedAt: new Date().toISOString()
        });
      } catch (error) {
        console.error('[🛡️ Enhanced Backend] ❌ Get holder insights error:', error.message);
        res.status(500).json({ success: false, error: 'Failed to fetch holder insights data' });
      }
    });

    // Technical Analysis endpoint
    this.app.post('/api/tokens/:contract/technical-analysis', async (req, res) => {
      let responseSent = false;
      
      // Set a timeout for the entire request
      const requestTimeout = setTimeout(() => {
        if (!responseSent && !res.headersSent) {
          responseSent = true;
          console.error(`⏰ Technical analysis request timeout for ${req.params.contract}`);
          res.status(503).json({ 
            success: false, 
            error: 'Technical analysis request timeout - service temporarily unavailable' 
          });
        }
      }, 30000); // 30 second timeout
      
      try {
        const { contract } = req.params;
        const { timeframe = '1D', force = false, chartData: frontendChartData } = req.body;
        
        console.log(`[🛡️ Enhanced Backend] 📊 Fetching technical analysis for: ${contract} (${timeframe})`);
        console.log(`[🛡️ Enhanced Backend] 📊 Chart data points: ${frontendChartData ? frontendChartData.length : 0}`);
        
        if (!contract) {
          clearTimeout(requestTimeout);
          if (!responseSent) {
            responseSent = true;
            return res.status(400).json({ 
              success: false, 
              error: 'Contract address is required' 
            });
          }
        }
        
        const { default: TechnicalAnalysisService } = await import('./services/TechnicalAnalysisService.js');
        const techAnalysisService = new TechnicalAnalysisService();
        
        let chartData = null;
        
        // Use frontend chart data if provided, otherwise fetch from backend
        if (frontendChartData) {
          try {
            chartData = frontendChartData; // Already parsed from JSON body
            console.log(`📊 Using frontend chart data: ${chartData.length} points for pattern detection`);
          } catch (error) {
            console.log(`⚠️ Failed to parse frontend chart data: ${error.message}`);
          }
        }
        
        if (!chartData && timeframe !== '1D') {
          try {
            chartData = await this.hybridPriceService.getPriceChart(contract, timeframe, 100);
            console.log(`📊 Fetched backend chart data: ${chartData.length} points`);
          } catch (error) {
            console.log(`⚠️ Could not fetch chart data for ${timeframe}, using default: ${error.message}`);
          }
        }
        
        const analysis = await techAnalysisService.getTechnicalAnalysis(contract, chartData);
        
        if (!analysis.success) {
          clearTimeout(requestTimeout);
          if (!responseSent) {
            responseSent = true;
            return res.status(500).json({
              success: false,
              error: analysis.error || 'Failed to generate technical analysis'
            });
          }
        }
        
        console.log(`✅ Technical analysis completed for ${contract}`);
        clearTimeout(requestTimeout);
        if (!responseSent) {
          responseSent = true;
          res.json(analysis);
        }
        
      } catch (error) {
        clearTimeout(requestTimeout);
        console.error(`❌ Technical analysis error for ${req.params.contract}:`, error);
        
        // Don't send response if timeout already sent one
        if (!responseSent && !res.headersSent) {
          responseSent = true;
          res.status(500).json({
            success: false,
            error: error.message || 'Internal server error'
          });
        }
      }
    });

    // Token Analytics endpoint
    this.app.get('/api/tokens/:contract/analytics', async (req, res) => {
      try {
        const { contract } = req.params;
        
        console.log(`[🛡️ Enhanced Backend] 📊 Fetching token analytics for: ${contract}`);
        
        if (!contract) {
          return res.status(400).json({ 
            success: false, 
            error: 'Contract address is required' 
          });
        }
        
        const { default: TechnicalAnalysisService } = await import('./services/TechnicalAnalysisService.js');
        const techAnalysisService = new TechnicalAnalysisService();
        
        try {
          const analytics = await techAnalysisService.getMoralisTokenAnalytics(contract);
          res.json({ success: true, data: analytics });
        } catch (error) {
          console.error(`❌ Token analytics error for ${contract}:`, error);
          res.status(500).json({
            success: false,
            error: error.message || 'Failed to fetch token analytics'
          });
        }
        
      } catch (error) {
        console.error(`❌ Token analytics endpoint error:`, error);
        res.status(500).json({
          success: false,
          error: error.message || 'Internal server error'
        });
      }
    });

    // Holder cache management endpoints
    this.app.get('/api/tokens/holders/cache/stats', async (req, res) => {
      try {
        console.log('[🛡️ Enhanced Backend] 📊 Getting holder cache stats');
        
        const { default: HolderCacheService } = await import('./services/HolderCacheService.js');
        const cacheService = new HolderCacheService();
        
        const stats = await cacheService.getCacheStats();
        res.json({ success: true, data: stats });
      } catch (error) {
        console.error('[🛡️ Enhanced Backend] ❌ Get cache stats error:', error.message);
        res.status(500).json({ success: false, error: 'Failed to get cache stats' });
      }
    });

    this.app.delete('/api/tokens/:contract/holders/cache', async (req, res) => {
      try {
        const { contract } = req.params;
        console.log(`[🛡️ Enhanced Backend] 🗑️ Clearing holder cache for: ${contract}`);
        
        const { default: HolderCacheService } = await import('./services/HolderCacheService.js');
        const cacheService = new HolderCacheService();
        
        const deletedCount = await cacheService.clearTokenCache(contract);
        res.json({ success: true, deletedFiles: deletedCount });
      } catch (error) {
        console.error('[🛡️ Enhanced Backend] ❌ Clear token cache error:', error.message);
        res.status(500).json({ success: false, error: 'Failed to clear token cache' });
      }
    });

    this.app.delete('/api/tokens/holders/cache/expired', async (req, res) => {
      try {
        console.log('[🛡️ Enhanced Backend] 🗑️ Clearing expired holder cache');
        
        const { default: HolderCacheService } = await import('./services/HolderCacheService.js');
        const cacheService = new HolderCacheService();
        
        const deletedCount = await cacheService.clearExpiredCache();
        res.json({ success: true, deletedFiles: deletedCount });
      } catch (error) {
        console.error('[🛡️ Enhanced Backend] ❌ Clear expired cache error:', error.message);
        res.status(500).json({ success: false, error: 'Failed to clear expired cache' });
      }
    });

    // Add paid token (legacy endpoint)
    this.app.post('/api/tokens/paid', async (req, res) => {
      try {
        const { symbol, name, contractAddress } = req.body;
        
        if (!symbol || !name) {
          return res.status(400).json({ error: 'Symbol and name are required' });
        }
        
        console.log(`[🛡️ Enhanced Backend] 💰 Adding paid token: ${symbol} (${name})`);
        
        await this.tokenProcessor.addPaidToken({
          symbol: symbol.toUpperCase(),
          name,
          contractAddress,
          isPaid: true,
          timestamp: new Date().toISOString()
        });
        
        res.json({ success: true, message: 'Paid token added to processing queue' });
        
      } catch (error) {
        console.error('[🛡️ Enhanced Backend] ❌ Error adding paid token:', error);
        res.status(500).json({ error: 'Failed to add paid token' });
      }
    });

    // Add paid token with optional social links (new endpoint)
    this.app.post('/api/tokens/add-paid-token', async (req, res) => {
      try {
        const { tokenData, paymentData, socialLinks } = req.body;

        if (!tokenData || !tokenData.symbol || !tokenData.name) {
          return res.status(400).json({ error: 'Token data with symbol and name are required' });
        }

        // Validate payment if payment data is provided
        if (paymentData && !paymentData.validated) {
          console.log('🔐 Validating payment data...');

          const validationResult = await this.helioService.validatePayment(
            paymentData.paymentId,
            paymentData
          );

          if (!validationResult.isValid) {
            return res.status(400).json({
              error: 'Payment validation failed. Please ensure payment was completed successfully.'
            });
          }

          console.log('✅ Payment validation successful');
        } else if (!paymentData) {
          console.log('⚠️ No payment data provided - this may be a test or admin operation');
        }
        
        console.log(`[🛡️ Enhanced Backend] 💰 Adding paid token with socials: ${tokenData.symbol} (${tokenData.name})`);
        
        // Process paid token IMMEDIATELY in parallel
        const processedToken = await this.tokenProcessor.addPaidToken({
          symbol: tokenData.symbol.toUpperCase(),
          name: tokenData.name,
          contractAddress: tokenData.contractAddress,
          isPaid: true,
          timestamp: new Date().toISOString(),
          paymentData: paymentData
        });
        
        console.log(`✅ Paid token ${processedToken.symbol} processed immediately!`);
        
        // If social links are provided, save them
        if (socialLinks && Object.values(socialLinks).some(link => link && link.trim())) {
          try {
            const { default: UpdateTokenService } = await import('./updateTokenService.js');
            const updateService = new UpdateTokenService();
            
            // Use a system user ID for token listing social links
            const systemUserId = 'system_list_token';
            
            await updateService.updateTokenSocials(
              tokenData.symbol.toUpperCase(),
              socialLinks,
              systemUserId,
              paymentData
            );
            
            console.log(`✅ Social links saved for ${tokenData.symbol}`);
          } catch (socialError) {
            console.error('⚠️ Failed to save social links (token still added):', socialError.message);
          }
        }
        
        res.json({ 
          success: true, 
          message: `Token ${processedToken.symbol} processed immediately and is now live!`,
          token: {
            symbol: processedToken.symbol,
            name: processedToken.name,
            contractAddress: processedToken.contractAddress,
            isPaid: true,
            stage: processedToken.stage,
            mentions: processedToken.mentions || 0,
            communityScore: processedToken.communityScore || 5,
            hasTwitterData: !!processedToken.twitterData,
            hasJupiterData: !!processedToken.jupiterData,
            socialLinks: socialLinks || null,
            processingTime: 'Instant (Paid Priority)'
          },
          socialLinksAdded: !!socialLinks
        });
        
      } catch (error) {
        console.error('[🛡️ Enhanced Backend] ❌ Error adding paid token:', error);
        res.status(500).json({ error: 'Failed to add paid token' });
      }
    });

    // Get processing status
    this.app.get('/api/processing/status', (req, res) => {
      const status = this.tokenProcessor.getProcessingStatus();
      res.json(status);
    });

    // Start processing manually
    this.app.post('/api/processing/start', async (req, res) => {
      try {
        if (this.tokenProcessor.isProcessing) {
          return res.json({ success: false, message: 'Processing already in progress' });
        }
        
        console.log('[🛡️ Enhanced Backend] 🚀 Manual processing start requested');
        await this.tokenProcessor.startProcessing();
        
        res.json({ success: true, message: 'Processing started' });
        
      } catch (error) {
        console.error('[🛡️ Enhanced Backend] ❌ Error starting processing:', error);
        res.status(500).json({ error: 'Failed to start processing' });
      }
    });

    // Stop processing
    this.app.post('/api/processing/stop', (req, res) => {
      try {
        console.log('[🛡️ Enhanced Backend] 🛑 Manual processing stop requested');
        this.tokenProcessor.stopProcessing();
        
        res.json({ success: true, message: 'Processing stopped' });
        
      } catch (error) {
        console.error('[🛡️ Enhanced Backend] ❌ Error stopping processing:', error);
        res.status(500).json({ error: 'Failed to stop processing' });
      }
    });

    // Force refresh all tokens (preserves existing)
    this.app.post('/api/tokens/refresh-all', async (req, res) => {
      try {
        console.log('[🛡️ Enhanced Backend] 🔄 Force refresh all tokens requested');
        
        // Preserve existing tokens and add new ones
        await this.preserveCacheAndRefresh();
        
        res.json({ success: true, message: 'Full refresh started - existing tokens preserved' });
        
      } catch (error) {
        console.error('[🛡️ Enhanced Backend] ❌ Error refreshing tokens:', error);
        res.status(500).json({ error: 'Failed to refresh tokens' });
      }
    });

    // Clear cache completely (for debugging - use with caution!)
    this.app.post('/api/tokens/clear-cache', async (req, res) => {
      try {
        console.log('[🛡️ Enhanced Backend] 🚨 CACHE CLEAR REQUESTED - INVESTIGATING WHO IS CALLING THIS!');
        console.log('[🛡️ Enhanced Backend] 📍 Request IP:', req.ip || req.connection.remoteAddress);
        console.log('[🛡️ Enhanced Backend] 📍 User Agent:', req.get('User-Agent'));
        console.log('[🛡️ Enhanced Backend] 📍 Referer:', req.get('Referer'));
        console.log('[🛡️ Enhanced Backend] 📍 Request Headers:', JSON.stringify(req.headers, null, 2));
        console.log('[🛡️ Enhanced Backend] 📍 Request Body:', JSON.stringify(req.body, null, 2));
        console.log('[🛡️ Enhanced Backend] 🗑️ Complete cache clear requested');
        
        // Clear cache and restart processing
        await this.clearCache();
        await this.tokenProcessor.startProcessing();
        
        res.json({ success: true, message: 'Cache cleared and processing restarted' });
        
      } catch (error) {
        console.error('[🛡️ Enhanced Backend] ❌ Error clearing cache:', error);
        res.status(500).json({ error: 'Failed to clear cache' });
      }
    });

    // ========================================
    // 🛠️ ADMIN API DASHBOARD ENDPOINTS
    // ========================================

    // Admin: Add token for FREE (bypass payment) - CONTRACT ADDRESS ONLY
    this.app.post('/api/admin/tokens/add-free', adminApiAuth, async (req, res) => {
      try {
        const { symbol, name, contractAddress, socialLinks } = req.body;

        // CONTRACT ADDRESS IS NOW REQUIRED, symbol and name are optional
        if (!contractAddress) {
          return res.status(400).json({ error: 'Contract address is required' });
        }

        console.log(`[🛡️ Admin] 🆓 Adding FREE token by CA: ${contractAddress}`);

        // Use provided symbol/name or let Jupiter API fill them in
        const tokenData = {
          symbol: symbol ? symbol.trim().toUpperCase() : 'UNKNOWN',
          name: name ? name.trim() : 'Unknown Token',
          contractAddress: contractAddress.trim(),
          isPaid: false,
          isAdmin: true
        };

        console.log(`[🛡️ Admin] 📝 Using data: ${tokenData.symbol} (${tokenData.name}) - CA: ${tokenData.contractAddress}`);

        // Process admin token IMMEDIATELY (same as paid) - will fetch from Jupiter
        const processedToken = await this.tokenProcessor.addPaidToken(tokenData);
        
        // Add social links if provided (use processed token's symbol)
        if (socialLinks && Object.keys(socialLinks).length > 0) {
          const updateService = (await import('./updateTokenService.js')).default;
          await updateService.updateTokenSocials(processedToken.symbol, socialLinks, 'admin_free_add', {
            type: 'free_admin_add',
            amount: 0,
            currency: 'FREE'
          });
          console.log(`[🛡️ Admin] 📱 Added social links for ${processedToken.symbol}`);
        }
        
        res.json({ 
          success: true, 
          message: `Token ${processedToken.symbol} processed immediately and is now live!`,
          token: {
            symbol: processedToken.symbol,
            name: processedToken.name,
            contractAddress: processedToken.contractAddress,
            isPaid: false,
            isAdmin: true,
            stage: processedToken.stage,
            mentions: processedToken.mentions || 0,
            communityScore: processedToken.communityScore || 5,
            hasTwitterData: !!processedToken.twitterData,
            hasJupiterData: !!processedToken.jupiterData,
            processingTime: 'Instant (Admin Priority)'
          }
        });
        
      } catch (error) {
        console.error('[🛡️ Admin] ❌ Error adding free token:', error);
        res.status(500).json({ error: 'Failed to add free token' });
      }
    });

    // Public: Add token from Jupiter search (no auth required)
    this.app.post('/api/tokens/add-from-search', async (req, res) => {
      try {
        const { symbol, name, contractAddress } = req.body;

        // CONTRACT ADDRESS IS REQUIRED
        if (!contractAddress) {
          return res.status(400).json({ error: 'Contract address is required' });
        }

        console.log(`🔍 [Public Search] Adding token by CA: ${contractAddress}`);

        // Use provided symbol/name or let Jupiter API fill them in
        const tokenData = {
          symbol: symbol ? symbol.trim().toUpperCase() : 'UNKNOWN',
          name: name ? name.trim() : 'Unknown Token',
          contractAddress: contractAddress.trim(),
          isPaid: false,
          isAdmin: false
        };

        console.log(`🔍 [Public Search] Using data: ${tokenData.symbol} (${tokenData.name}) - CA: ${tokenData.contractAddress}`);

        // Process token IMMEDIATELY - will fetch from Jupiter
        const processedToken = await this.tokenProcessor.addPaidToken(tokenData);
        
        res.json({ 
          success: true, 
          message: `Token ${processedToken.symbol} processed immediately and is now live!`,
          token: {
            symbol: processedToken.symbol,
            name: processedToken.name,
            contractAddress: processedToken.contractAddress,
            isPaid: false,
            isAdmin: false,
            stage: processedToken.stage,
            mentions: processedToken.mentions || 0,
            communityScore: processedToken.communityScore || 5,
            hasTwitterData: !!processedToken.twitterData,
            hasJupiterData: !!processedToken.jupiterData,
            processingTime: 'Instant (Public Search)'
          }
        });
        
      } catch (error) {
        console.error('🔍 [Public Search] ❌ Error adding token:', error);
        res.status(500).json({ error: error.message || 'Failed to add token' });
      }
    });

    // Admin: Delete token from database
    this.app.delete('/api/admin/tokens/:symbol', async (req, res) => {
      try {
        const { symbol } = req.params;
        
        console.log(`[🛡️ Admin] 🗑️ Deleting token: ${symbol}`);
        
        // Remove from tokens cache
        const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');
        const cachePath = path.join(dataDir, 'cache', 'tokens-cache.json');
        const data = await fs.readFile(cachePath, 'utf8');
        const tokens = JSON.parse(data);
        
        const originalLength = tokens.length;
        const filteredTokens = tokens.filter(t => t.symbol !== symbol.toUpperCase());
        
        if (filteredTokens.length === originalLength) {
          return res.status(404).json({ error: `Token ${symbol} not found` });
        }
        
        // 🛡️ ATOMIC WRITE: Save updated cache
        const tempPath = cachePath + '.tmp';
        const jsonData = JSON.stringify(filteredTokens, null, 2);
        
        try {
          // 🚨 CRITICAL FIX: Ensure cache directory exists before atomic write
          const cacheDir = path.dirname(cachePath);
          await fs.mkdir(cacheDir, { recursive: true });
          
          await fs.writeFile(tempPath, jsonData, 'utf8');
          await fs.rename(tempPath, cachePath);
        } catch (error) {
          // Cleanup temp file if it exists
          try {
            await fs.unlink(tempPath);
          } catch (_) {}
          throw error;
        }
        
        // Remove from Twitter metrics
        try {
          const twitterCachePath = path.join(__dirname, 'cache', 'twitter_metrics.json');
          const twitterData = JSON.parse(await fs.readFile(twitterCachePath, 'utf8'));
          
          // Find and remove Twitter data entries for this token
          const keysToDelete = Object.keys(twitterData).filter(key => 
            key.startsWith(symbol.toUpperCase() + '_')
          );
          
          keysToDelete.forEach(key => delete twitterData[key]);
          
          await fs.writeFile(twitterCachePath, JSON.stringify(twitterData, null, 2));
          console.log(`[🛡️ Admin] 🐦 Removed Twitter data for ${symbol}`);
        } catch (twitterError) {
          console.log(`[🛡️ Admin] ⚠️ No Twitter data found for ${symbol}`);
        }
        
        // Remove from socials cache
        try {
          const socialsPath = path.join(__dirname, 'cache', 'socials-cache.json');
          const socialsData = JSON.parse(await fs.readFile(socialsPath, 'utf8'));
          
          if (socialsData[symbol.toUpperCase()]) {
            delete socialsData[symbol.toUpperCase()];
            await fs.writeFile(socialsPath, JSON.stringify(socialsData, null, 2));
            console.log(`[🛡️ Admin] 📱 Removed social links for ${symbol}`);
          }
        } catch (socialsError) {
          console.log(`[🛡️ Admin] ⚠️ No social data found for ${symbol}`);
        }
        
        res.json({ 
          success: true, 
          message: `Token ${symbol} deleted successfully`,
          deletedCount: originalLength - filteredTokens.length
        });
        
      } catch (error) {
        console.error('[🛡️ Admin] ❌ Error deleting token:', error);
        res.status(500).json({ error: 'Failed to delete token' });
      }
    });

    // Admin: Delete token from database (by contract address)
    this.app.delete('/api/admin/tokens/contract/:contractAddress', async (req, res) => {
      try {
        const { contractAddress } = req.params;
        
        console.log(`[🛡️ Admin] 🗑️ Deleting token by contract: ${contractAddress}`);
        
        // Remove from tokens cache
        const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');
        const cachePath = path.join(dataDir, 'cache', 'tokens-cache.json');
        const data = await fs.readFile(cachePath, 'utf8');
        const tokens = JSON.parse(data);
        
        const originalLength = tokens.length;
        const tokenToDelete = tokens.find(t => t.contractAddress === contractAddress);
        
        if (!tokenToDelete) {
          return res.status(404).json({ error: `Token with contract ${contractAddress} not found` });
        }
        
        const symbol = tokenToDelete.symbol;
        const filteredTokens = tokens.filter(t => t.contractAddress !== contractAddress);
        
        // 🛡️ ATOMIC WRITE: Save updated cache
        const tempPath = cachePath + '.tmp';
        const jsonData = JSON.stringify(filteredTokens, null, 2);
        
        try {
          // 🚨 CRITICAL FIX: Ensure cache directory exists before atomic write
          const cacheDir = path.dirname(cachePath);
          await fs.mkdir(cacheDir, { recursive: true });
          
          await fs.writeFile(tempPath, jsonData, 'utf8');
          await fs.rename(tempPath, cachePath);
        } catch (error) {
          // Cleanup temp file if it exists
          try {
            await fs.unlink(tempPath);
          } catch (_) {}
          throw error;
        }
        
        // Remove from Twitter metrics
        try {
          const twitterCachePath = path.join(__dirname, 'cache', 'twitter_metrics.json');
          const twitterData = JSON.parse(await fs.readFile(twitterCachePath, 'utf8'));
          
          // Find and remove Twitter data entries for this token
          const keysToDelete = Object.keys(twitterData).filter(key => 
            key.startsWith(symbol.toUpperCase() + '_')
          );
          
          keysToDelete.forEach(key => delete twitterData[key]);
          
          await fs.writeFile(twitterCachePath, JSON.stringify(twitterData, null, 2));
          console.log(`[🛡️ Admin] 🐦 Removed Twitter data for ${symbol} (${contractAddress})`);
        } catch (twitterError) {
          console.log(`[🛡️ Admin] ⚠️ No Twitter data found for ${symbol}`);
        }
        
        // Remove from socials cache
        try {
          const socialsPath = path.join(__dirname, 'cache', 'socials-cache.json');
          const socialsData = JSON.parse(await fs.readFile(socialsPath, 'utf8'));
          
          if (socialsData[symbol.toUpperCase()]) {
            delete socialsData[symbol.toUpperCase()];
            await fs.writeFile(socialsPath, JSON.stringify(socialsData, null, 2));
            console.log(`[🛡️ Admin] 📱 Removed social links for ${symbol} (${contractAddress})`);
          }
        } catch (socialsError) {
          console.log(`[🛡️ Admin] ⚠️ No social data found for ${symbol}`);
        }
        
        console.log(`[🛡️ Admin] ✅ Successfully deleted token: ${symbol} (${contractAddress})`);
        
        res.json({ 
          success: true, 
          message: `Token ${symbol} with contract ${contractAddress.substring(0, 8)}...${contractAddress.substring(-8)} deleted successfully`,
          deletedCount: originalLength - filteredTokens.length,
          deletedToken: {
            symbol: symbol,
            name: tokenToDelete.name,
            contractAddress: contractAddress
          }
        });
        
      } catch (error) {
        console.error('[🛡️ Admin] ❌ Error deleting token by contract:', error);
        res.status(500).json({ error: 'Failed to delete token by contract address' });
      }
    });

    // Admin: Search tokens in database
    this.app.get('/api/admin/tokens/search', adminApiAuth, async (req, res) => {
      try {
        const { q, limit = 50 } = req.query;
        
        console.log(`[🛡️ Admin] 🔍 Searching tokens: "${q}"`);
        
        const tokens = await this.getTokensFromCache();
        
        // Apply enhanced deduplication to ensure no duplicates in search results
        const deduplicatedTokens = this.tokenProcessor.deduplicateTokens(tokens);
        console.log(`[🛡️ Admin] 🔄 Deduplicated search pool: ${tokens.length} → ${deduplicatedTokens.length} tokens`);
        
        let results = deduplicatedTokens;
        
        if (q) {
          const query = q.toLowerCase();
          results = deduplicatedTokens.filter(token => 
            token.symbol.toLowerCase().includes(query) ||
            token.name.toLowerCase().includes(query) ||
            (token.contractAddress && token.contractAddress.toLowerCase().includes(query))
          );
        }
        
        // Filter out tokens without valid contract addresses
        results = results.filter(token => 
          token.contractAddress && 
          token.contractAddress !== null && 
          token.contractAddress.length > 10
        );
        
        // Limit results
        results = results.slice(0, parseInt(limit));
        
        res.json({
          success: true,
          query: q || 'all',
          totalFound: results.length,
          limit: parseInt(limit),
          tokens: results.map(token => ({
            symbol: token.symbol,
            name: token.name,
            contractAddress: token.contractAddress,
            stage: token.stage,
            mentions: token.mentions || 0,
            communityScore: token.communityScore || 0,
            hasTwitterData: !!token.twitterData,
            hasSocials: !!token.socials,
            lastUpdated: token.lastUpdated
          }))
        });
        
      } catch (error) {
        console.error('[🛡️ Admin] ❌ Error searching tokens:', error);
        res.status(500).json({ error: 'Failed to search tokens' });
      }
    });

    // Admin: Fuel tokens (boost processing priority)
    this.app.post('/api/admin/tokens/fuel', adminApiAuth, async (req, res) => {
      try {
        const { symbols } = req.body;
        
        if (!symbols || !Array.isArray(symbols)) {
          return res.status(400).json({ error: 'Symbols array is required' });
        }
        
        console.log(`[🛡️ Admin] ⛽ Fueling tokens: ${symbols.join(', ')}`);
        
        const results = [];
        
        for (const symbol of symbols) {
          try {
            // Ensure social data service is initialized
            if (!this.tokenProcessor.socialDataService) {
              const { default: EnhancedSocialDataService } = await import('./enhancedSocialDataService.js');
              this.tokenProcessor.socialDataService = new EnhancedSocialDataService();
              await this.tokenProcessor.socialDataService.initialize();
            }
            
            // Force refresh Twitter data for this token
            const socialService = this.tokenProcessor.socialDataService;
            
            // Find token data
            const tokens = await this.getTokensFromCache();
            const token = tokens.find(t => t.symbol === symbol.toUpperCase());
            
            if (!token) {
              results.push({ symbol, success: false, error: 'Token not found' });
              continue;
            }
            
            // Prepare metadata for smart projection (market cap + volume)
            const metadata = token.jupiterData ? {
              marketCap: token.jupiterData.marketCap || token.jupiterData.mcap || null,
              volume24h: token.jupiterData.volume24h || 
                         token.jupiterData.v24hUSD || 
                         token.jupiterData.stats24h?.volume ||
                         ((token.jupiterData.stats24h?.buyVolume || 0) + (token.jupiterData.stats24h?.sellVolume || 0) || null) ||
                         (token.jupiterData.volume1h ? token.jupiterData.volume1h * 24 : null) ||
                         null
            } : null;
            
            // Force refresh Twitter data WITH metadata
            const twitterData = await socialService.forceImmediateRefresh(symbol, token.name, false, metadata);
            
            results.push({ 
              symbol, 
              success: true, 
              mentions: twitterData.mentions, // Raw sample
              displayMentions: twitterData.displayMentions, // Projected
              engagement: twitterData.engagement?.total || 0
            });
            
          } catch (error) {
            results.push({ symbol, success: false, error: error.message });
          }
        }
        
        res.json({
          success: true,
          message: `Fueled ${results.filter(r => r.success).length}/${symbols.length} tokens`,
          results
        });
        
      } catch (error) {
        console.error('[🛡️ Admin] ❌ Error fueling tokens:', error);
        res.status(500).json({ error: 'Failed to fuel tokens' });
      }
    });

    // Admin: Manual Twitter refresh for specific token
    this.app.post('/api/admin/tokens/:symbol/refresh-twitter', adminApiAuth, async (req, res) => {
      try {
        const { symbol } = req.params; // may be a symbol or a contract address
        console.log(`[🛡️ Admin] 🐦 Manual Twitter refresh for identifier: ${symbol}`);
        
        // Load raw tokens from cache (not the filtered/merged ones)
        const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');
        const cachePath = path.join(dataDir, 'cache', 'tokens-cache.json');
        let rawTokens = [];
        try {
          const data = await fs.readFile(cachePath, 'utf8');
          rawTokens = JSON.parse(data);
        } catch (error) {
          return res.status(404).json({ error: 'Token cache not found' });
        }
        
        // Find token by symbol (case-insensitive) or by contract address
        const identifier = symbol.trim();
        const upperSym = identifier.toUpperCase();
        const token = rawTokens.find(t => (
          (t.symbol && t.symbol.toUpperCase() === upperSym) ||
          (t.contractAddress && (t.contractAddress === identifier || t.contractAddress.toLowerCase() === identifier.toLowerCase()))
        ));
        
        if (!token) {
          // Debug: Show similar symbols
          const similarTokens = rawTokens
            .filter(t => t.symbol && t.symbol.toUpperCase().includes(upperSym.substring(0, 3)))
            .map(t => t.symbol)
            .slice(0, 5);
          
          return res.status(404).json({ 
            error: `Token ${symbol} not found`,
            hint: similarTokens.length > 0 ? `Similar tokens: ${similarTokens.join(', ')}` : 'No similar tokens found',
            totalTokens: rawTokens.length
          });
        }
        
        // Ensure social data service is initialized
        if (!this.tokenProcessor.socialDataService) {
          const { default: EnhancedSocialDataService } = await import('./enhancedSocialDataService.js');
          this.tokenProcessor.socialDataService = new EnhancedSocialDataService();
          await this.tokenProcessor.socialDataService.initialize();
        }
        
        // Get social data service
        const socialService = this.tokenProcessor.socialDataService;
        
        // Prepare metadata for smart projection (market cap + volume)
        const metadata = token.jupiterData ? {
          marketCap: token.jupiterData.marketCap || token.jupiterData.mcap || null,
          volume24h: token.jupiterData.volume24h || 
                     token.jupiterData.v24hUSD || 
                     token.jupiterData.stats24h?.volume ||
                     ((token.jupiterData.stats24h?.buyVolume || 0) + (token.jupiterData.stats24h?.sellVolume || 0) || null) ||
                     (token.jupiterData.volume1h ? token.jupiterData.volume1h * 24 : null) ||
                     null
        } : null;
        
        console.log(`[🛡️ Admin] 📊 Metadata for ${token.symbol}: mcap=$${metadata?.marketCap ? (metadata.marketCap/1e6).toFixed(1) : '?'}M, vol=$${metadata?.volume24h ? (metadata.volume24h/1e6).toFixed(2) : '?'}M`);
        
        // Force refresh Twitter data with admin bypass (ignores 5-day cooldown)
        const lookupSymbol = token.symbol || upperSym;
        const twitterData = await socialService.forceImmediateRefresh(lookupSymbol, token.name, true, metadata);
        
        // Update token with new Twitter data
        token.twitterData = twitterData;
        token.twitterTimestamp = new Date().toISOString();
        
        // 🚨 CRITICAL: Load social links for community score bonus
        try {
          const { default: UpdateTokenService } = await import('./updateTokenService.js');
          const updateService = new UpdateTokenService();
          const tokenSocials = await updateService.getTokenSocials(token.symbol);
          token.socials = tokenSocials?.socials || null;
          
          if (token.socials) {
            const socialCount = Object.keys(token.socials).filter(key => 
              token.socials[key] && token.socials[key] !== 'not_found' && token.socials[key] !== ''
            ).length;
            console.log(`[🛡️ Admin] 🌐 Loaded ${socialCount} social links for ${token.symbol}:`, Object.keys(token.socials).filter(k => token.socials[k] && token.socials[k] !== 'not_found'));
          } else {
            console.log(`[🛡️ Admin] ⚠️ No social links found for ${token.symbol}`);
          }
        } catch (error) {
          console.log(`[🛡️ Admin] ❌ Could not load social links for ${token.symbol}:`, error.message);
        }
        
        // Recalculate community health score with new Twitter data using ENHANCED method
        token.communityHealthScore = this.calculateCommunityHealthScore(twitterData, token.socials, token.jupiterData);
        token.communityScore = token.communityHealthScore; // Ensure both fields are set
        
        // Recalculate overall score
        token.overallScore = this.tokenProcessor.calculateEnhancedOverallScore(token);
        token.score = token.overallScore; // Ensure both fields are set
        
        // Take hype snapshot after score recalculation
        await this.takeHypeSnapshot(token);
        
        // Save updated tokens back to raw cache
        const updatedTokens = rawTokens.map(t => (t.symbol && t.symbol.toUpperCase() === (token.symbol || '').toUpperCase()) ? token : t);
        await this.saveTokensToCache(updatedTokens);
        
        
        res.json({
          success: true,
          message: `Twitter data refreshed for ${token.symbol}`,
          token: {
            symbol: token.symbol,
            name: token.name,
            twitterData: {
              mentions: twitterData.mentions,
              displayMentions: twitterData.displayMentions,
              mentions24h: twitterData.mentions24h,
              followers: twitterData.followers,
              engagement: twitterData.engagement,
              officialHandle: twitterData.officialHandle,
              recentMentions: twitterData.recentMentions?.length || 0,
              projection: metadata ? `${twitterData.mentions} sample → ${twitterData.displayMentions} projected` : 'no metadata'
            },
            communityScore: token.communityHealthScore,
            overallScore: token.overallScore
          }
        });
        
      } catch (error) {
        console.error('[🛡️ Admin] ❌ Error refreshing Twitter data:', error);
        res.status(500).json({ error: 'Failed to refresh Twitter data' });
      }
    });

    // Twitter search endpoints (direct integration)
    this.app.get('/api/twitter/search', async (req, res) => {
      try {
        const { q, count = 20 } = req.query;

        if (!q) {
          return res.status(400).json({
            success: false,
            error: 'Query parameter "q" is required'
          });
        }

        // Ensure social data service is initialized
        if (!this.tokenProcessor.socialDataService) {
          const { default: EnhancedSocialDataService } = await import('./enhancedSocialDataService.js');
          this.tokenProcessor.socialDataService = new EnhancedSocialDataService();
          await this.tokenProcessor.socialDataService.initialize();
        }

        const socialService = this.tokenProcessor.socialDataService;

        // Use the social service to search Twitter
        const searchResult = await socialService.searchTwitter(q, parseInt(count));

        res.json({
          success: true,
          query: q,
          count: searchResult.tweets?.length || 0,
          tweets: searchResult.tweets || [],
          source: 'backend_integration'
        });

      } catch (error) {
        console.error('[🛡️ Backend] ❌ Twitter search error:', error);
        res.status(500).json({
          success: false,
          error: 'Twitter search failed',
          details: error.message
        });
      }
    });

    this.app.get('/api/twitter/user/:username/tweets', async (req, res) => {
      try {
        const { username } = req.params;
        const { count = 20 } = req.query;

        // Ensure social data service is initialized
        if (!this.tokenProcessor.socialDataService) {
          const { default: EnhancedSocialDataService } = await import('./enhancedSocialDataService.js');
          this.tokenProcessor.socialDataService = new EnhancedSocialDataService();
          await this.tokenProcessor.socialDataService.initialize();
        }

        const socialService = this.tokenProcessor.socialDataService;

        // Use the social service to get user tweets
        const userTweets = await socialService.getUserTweets(username, parseInt(count));

        res.json({
          success: true,
          username,
          count: userTweets.tweets?.length || 0,
          tweets: userTweets.tweets || [],
          source: 'backend_integration'
        });

      } catch (error) {
        console.error('[🛡️ Backend] ❌ User tweets error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to get user tweets',
          details: error.message
        });
      }
    });

    this.app.get('/api/twitter/mentions/:handle', async (req, res) => {
      try {
        const { handle } = req.params;
        const { count = 10 } = req.query;

        // Ensure social data service is initialized
        if (!this.tokenProcessor.socialDataService) {
          const { default: EnhancedSocialDataService } = await import('./enhancedSocialDataService.js');
          this.tokenProcessor.socialDataService = new EnhancedSocialDataService();
          await this.tokenProcessor.socialDataService.initialize();
        }

        const socialService = this.tokenProcessor.socialDataService;

        // Use the social service to search mentions
        const mentionsResult = await socialService.searchMentions(handle, parseInt(count));

        res.json({
          success: true,
          handle,
          count: mentionsResult.mentions?.length || 0,
          mentions: mentionsResult.mentions || [],
          source: 'backend_integration'
        });

      } catch (error) {
        console.error('[🛡️ Backend] ❌ Mentions search error:', error);
        res.status(500).json({
          success: false,
          error: 'Mentions search failed',
          details: error.message
        });
      }
    });

    // Admin: Get Twitter API status and rate limits
    this.app.get('/api/admin/twitter/status', adminApiAuth, async (req, res) => {
      try {
        // Ensure social data service is initialized
        if (!this.tokenProcessor.socialDataService) {
          const { default: EnhancedSocialDataService } = await import('./enhancedSocialDataService.js');
          this.tokenProcessor.socialDataService = new EnhancedSocialDataService();
          await this.tokenProcessor.socialDataService.initialize();
        }
        
        const socialService = this.tokenProcessor.socialDataService;
        
        // Check if service and method exist
        if (!socialService || typeof socialService.getRateLimitStatus !== 'function') {
          return res.json({
            success: true,
            twitter: {
              isRateLimited: false,
              rateLimitUntil: 0,
              requests: {
                hourly: "0/500",
                daily: "0/2000"
              },
              lastReset: {
                hour: "Not available",
                day: "Not available"
              },
              status: "Service not initialized"
            }
          });
        }
        
        const rateLimitStatus = socialService.getRateLimitStatus();
        
        res.json({
          success: true,
          twitter: {
            isRateLimited: rateLimitStatus.isRateLimited,
            rateLimitUntil: rateLimitStatus.rateLimitUntil,
            requests: {
              hourly: `${rateLimitStatus.hourlyRequests}/${rateLimitStatus.hourlyLimit}`,
              daily: `${rateLimitStatus.dailyRequests}/${rateLimitStatus.dailyLimit}`
            },
            lastReset: {
              hour: new Date(rateLimitStatus.lastHourReset).toLocaleString(),
              day: new Date(rateLimitStatus.lastDayReset).toLocaleString()
            }
          }
        });
        
      } catch (error) {
        console.error('[🛡️ Admin] ❌ Error getting Twitter status:', error);
        res.status(500).json({ error: 'Failed to get Twitter status' });
      }
    });

    // === Twitter Refresh ALL (Queued + Rate-limit aware) ===
    this.twitterRefreshJob = this.twitterRefreshJob || { running: false };

    const ensureSocialService = async () => {
      if (!this.tokenProcessor.socialDataService) {
        const { default: EnhancedSocialDataService } = await import('./enhancedSocialDataService.js');
        this.tokenProcessor.socialDataService = new EnhancedSocialDataService();
        await this.tokenProcessor.socialDataService.initialize();
      }
      return this.tokenProcessor.socialDataService;
    };

    this._runTwitterRefreshWorker = this._runTwitterRefreshWorker || (async () => {
      const job = this.twitterRefreshJob;
      if (!job.running) return;
      const socialService = await ensureSocialService();

      try {
        // If queue empty, finish
        if (!job.queue || job.queue.length === 0) {
          job.running = false;
          console.log('[🛡️ Admin] ✅ Twitter refresh queue completed');
          return;
        }

        // Check rate limits
        let canProceed = true;
        if (typeof socialService.getRateLimitStatus === 'function') {
          const rl = socialService.getRateLimitStatus();
          if (rl?.isRateLimited) {
            canProceed = false;
            job.nextRunDelayMs = Math.max(rl.rateLimitUntil - Date.now(), 60_000);
          } else if (rl?.hourlyRequests >= rl?.hourlyLimit - 5) {
            canProceed = false;
            job.nextRunDelayMs = 60_000; // wait a minute
          }
        }

        if (!canProceed) {
          const delay = job.nextRunDelayMs || 60_000;
          setTimeout(this._runTwitterRefreshWorker, delay);
          return;
        }

        // Process next token
        const item = job.queue.shift();
        if (!item) {
          setTimeout(this._runTwitterRefreshWorker, 250); // small yield
          return;
        }

          // Check 24-hour cooldown before refreshing
          const token = job.tokensArray && item.index != null ? job.tokensArray[item.index] : null;
          const needsRefresh = !token || this.tokenProcessor.shouldRefreshTwitterData(token);

          if (!needsRefresh) {
            console.log(`[🛡️ Admin] ⏰ Skipping ${item.symbol} (within 24h cooldown)`);
            job.skipped = (job.skipped || 0) + 1;
            job.processed++;
            // Schedule next item processing
            setTimeout(this._runTwitterRefreshWorker, 250);
            return;
          }

          try {
            // Prepare metadata for smart projection (market cap + volume)
            const metadata = token?.jupiterData ? {
              marketCap: token.jupiterData.marketCap || token.jupiterData.mcap || null,
              volume24h: token.jupiterData.volume24h || 
                         token.jupiterData.v24hUSD || 
                         token.jupiterData.stats24h?.volume ||
                         ((token.jupiterData.stats24h?.buyVolume || 0) + (token.jupiterData.stats24h?.sellVolume || 0) || null) ||
                         (token.jupiterData.volume1h ? token.jupiterData.volume1h * 24 : null) ||
                         null
            } : null;
            
            const twitterData = await socialService.forceImmediateRefresh(item.symbol, item.name, false, metadata);

            // Update cache entry
          if (job.tokensArray && item.index != null && job.tokensArray[item.index]) {
            const token = job.tokensArray[item.index];
            token.twitterData = twitterData;
            token.communityHealthScore = this.calculateCommunityHealthScore(twitterData, token.socials, token.jupiterData);
            token.communityScore = token.communityHealthScore;
            token.overallScore = this.tokenProcessor.calculateEnhancedOverallScore(token);
            token.score = token.overallScore;

            // Take hype snapshot after score recalculation
            await this.takeHypeSnapshot(token);

            // Only apply 24h cooldown if we got fresh data
            const dataFreshness = twitterData._dataFreshness || 'unknown';
            if (dataFreshness === 'fresh') {
              token.twitterTimestamp = new Date().toISOString();
              console.log(`[🛡️ Admin] ✅ Fresh data for ${item.symbol} (72h cooldown applied)`);
            } else {
              console.log(`[🛡️ Admin] ⚠️ ${dataFreshness.replace('_', ' ').toUpperCase()} data for ${item.symbol} (no cooldown applied)`);
            }
          }

          job.success++;

          // Track recently refreshed tokens and next eligible time (24h cooldown by default)
          try {
            const cooldownMs = this.twitterRefreshJob?.cooldownWindowMs || (24 * 60 * 60 * 1000);
            const refreshedAtIso = (job.tokensArray && item.index != null && job.tokensArray[item.index]?.twitterTimestamp)
              ? job.tokensArray[item.index].twitterTimestamp
              : new Date().toISOString();
            const nextEligibleAtIso = new Date(Date.parse(refreshedAtIso) + cooldownMs).toISOString();
            job.recentRefreshed = job.recentRefreshed || [];
            job.recentRefreshed.unshift({
              symbol: item.symbol,
              name: item.name,
              index: item.index,
              refreshedAt: refreshedAtIso,
              nextEligibleAt: nextEligibleAtIso
            });
            if (job.recentRefreshed.length > 50) job.recentRefreshed.length = 50;
          } catch (_) { /* noop */ }
          } catch (err) {
          job.errors++;
          job.lastError = err.message;
          console.warn(`[🛡️ Admin] ⚠️ Refresh failed for ${item.symbol}: ${err.message}`);
        }

        job.processed++;
        job.lastUpdated = Date.now();

        // Persist every 25 tokens
        if (job.processed % 25 === 0 && job.tokensArray) {
          try { await this.saveTokensToCache(job.tokensArray); } catch {}
        }

        // Rate limiting aligned to 60 req / 15 min (per app & per user)
        // Base: 15s between tokens (4 req/min) => 60 req in 15 min
        let delayMs = job.baseDelayMs || 15_000;

        // Safety batch cooldowns
        // After every 50 tokens, cool down 5 minutes to leave headroom
        if (job.processed % 50 === 0) {
          delayMs = 5 * 60 * 1000; // 5 minutes
          console.log(`[🛡️ Admin] 🛑 Cooldown: 5-minute break after ${job.processed} tokens (rate limit protection)`);
        }
        // After every 10 tokens (but not 50), short 60s cooldown to smooth bursts
        else if (job.processed % 10 === 0) {
          delayMs = 60 * 1000; // 60 seconds
          console.log(`[🛡️ Admin] ⏸️ Short cooldown: 60-second break after ${job.processed} tokens`);
        }

        setTimeout(this._runTwitterRefreshWorker, delayMs);

      } catch (err) {
        console.error('[🛡️ Admin] Worker error:', err);
        setTimeout(this._runTwitterRefreshWorker, 5000);
      }
    });

    // Start queued refresh
    this.app.post('/api/admin/twitter/refresh-all/start', adminApiAuth, async (req, res) => {
      try {
        const socialService = await ensureSocialService();

        // Load tokens
        const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');
        const cachePath = path.join(dataDir, 'cache', 'tokens-cache.json');
        const rawData = await fs.readFile(cachePath, 'utf8');
        const tokens = JSON.parse(rawData) || [];

        const queue = [];
        const tokensToRemove = [];
        
        tokens.forEach((t, idx) => {
          if (t?.symbol && t?.name) {
            // 🚨 QUALITY FILTER: Check if token meets quality criteria
            const hasLaunchpad = t.jupiterData?.launchpad && t.jupiterData.launchpad !== '';
            const hasOrganicScore = t.jupiterData?.organicScore && t.jupiterData.organicScore > 0;
            const hasGraduatedAt = t.jupiterData?.graduatedAt && t.jupiterData.graduatedAt !== '';
            
            // Only process if at least ONE quality criteria is present (not all missing)
            if (!hasLaunchpad && !hasOrganicScore && !hasGraduatedAt) {
              tokensToRemove.push(t);
              return; // Skip this token
            }
            
            queue.push({ symbol: t.symbol, name: t.name, index: idx });
          }
        });
        
        // Remove low-quality tokens from cache if any were found
        if (tokensToRemove.length > 0) {
          console.log(`[🛡️ Enhanced Backend] 🗑️ Twitter refresh removing ${tokensToRemove.length} low-quality tokens from cache`);
          
          const tokensToKeep = tokens.filter(token => 
            !tokensToRemove.some(removed => removed.contractAddress === token.contractAddress)
          );
          
          // Save the cleaned cache
          await this.saveTokensToCache(tokensToKeep);
          console.log(`[🛡️ Enhanced Backend] ✅ Cache cleaned: ${tokens.length} → ${tokensToKeep.length} tokens`);
          
          // Update the tokens array for the rest of the function
          tokens.splice(0, tokens.length, ...tokensToKeep);
        }

        this.twitterRefreshJob = {
          running: true,
          startedAt: Date.now(),
          lastUpdated: Date.now(),
          total: queue.length,
          processed: 0,
          success: 0,
          errors: 0,
          queue,
          tokensArray: tokens,
          baseDelayMs: 1500,
          lastError: null
        };

        console.log(`[🛡️ Admin] 🐦 Queued refresh for ${queue.length} tokens`);
        setTimeout(this._runTwitterRefreshWorker, 250);

        res.json({ success: true, message: 'Twitter refresh started', total: queue.length });
      } catch (error) {
        console.error('[🛡️ Admin] ❌ Start queue failed:', error);
        res.status(500).json({ success: false, error: 'Failed to start refresh' });
      }
    });

    // Job status
    this.app.get('/api/admin/twitter/refresh-all/status', adminApiAuth, (req, res) => {
      const job = this.twitterRefreshJob || { running: false };
      
      // Calculate next break info (aligned to new policy)
      let nextBreakInfo = null;
      if (job.running && (job.processed || job.processed === 0)) {
        const mod50 = job.processed % 50;
        const mod10 = job.processed % 10;
        const until50 = mod50 === 0 ? 0 : (50 - mod50);
        const until10 = mod10 === 0 ? 0 : (10 - mod10);

        if (until50 === 0 && job.processed > 0) {
          nextBreakInfo = "Taking 5-minute break now";
        } else if (until10 === 0 && job.processed > 0) {
          nextBreakInfo = "Taking 60-second break now";
        } else if (until10 <= until50) {
          nextBreakInfo = `${until10} tokens until 60-second break`;
        } else {
          nextBreakInfo = `${until50} tokens until 5-minute break`;
        }
      }
      
      res.json({
        success: true,
        running: !!job.running,
        total: job.total || 0,
        processed: job.processed || 0,
        successCount: job.success || 0,
        errorCount: job.errors || 0,
        skippedCount: job.skipped || 0,
        queueRemaining: job.queue ? job.queue.length : 0,
        startedAt: job.startedAt || null,
        lastUpdated: job.lastUpdated || null,
        lastError: job.lastError || null,
        recentRefreshed: job.recentRefreshed || [],
        rateLimitInfo: {
          baseDelay: "15 seconds between tokens",
          batchBreaks: "60s break every 10 tokens, 5min break every 50 tokens",
          nextBreak: nextBreakInfo,
          cooldown: "24 hours between refreshes"
        }
      });
    });

    // Stop job
    this.app.post('/api/admin/twitter/refresh-all/stop', adminApiAuth, (req, res) => {
      if (this.twitterRefreshJob) this.twitterRefreshJob.running = false;
      res.json({ success: true, message: 'Twitter refresh stopped' });
    });

    // === NEW: Twitter API Usage Management ===
    
    // Get Twitter API usage statistics
    this.app.get('/api/admin/twitter/usage', adminApiAuth, async (req, res) => {
      try {
        // Ensure social data service is initialized
        if (!this.tokenProcessor.socialDataService) {
          const { default: EnhancedSocialDataService } = await import('./enhancedSocialDataService.js');
          this.tokenProcessor.socialDataService = new EnhancedSocialDataService();
          await this.tokenProcessor.socialDataService.initialize();
        }
        const socialService = this.tokenProcessor.socialDataService;
        if (!socialService?.twitterApiManager) {
          return res.status(500).json({ error: 'Twitter API Manager not available' });
        }
        
        const stats = await socialService.twitterApiManager.getUsageStats();
        const recommendations = this.getTwitterUsageRecommendations(stats || {});
        
        res.json({
          success: true,
          usage: stats,
          recommendations
        });
        
      } catch (error) {
        console.error('[🛡️ Admin] ❌ Error getting Twitter usage:', error);
        res.status(500).json({ error: 'Failed to get Twitter usage stats' });
      }
    });
    
    // Reset Twitter API monthly counter
    this.app.post('/api/admin/twitter/reset-counter', adminApiAuth, async (req, res) => {
      try {
        const socialService = this.tokenProcessor?.socialDataService;
        if (!socialService?.twitterApiManager) {
          return res.status(500).json({ error: 'Twitter API Manager not available' });
        }
        
        const result = await socialService.twitterApiManager.resetMonthlyCounter();
        
        console.log('[🛡️ Admin] 🔄 Twitter API monthly counter reset by admin');
        
        res.json({
          success: true,
          message: 'Monthly Twitter API counter reset to 0',
          result
        });
        
      } catch (error) {
        console.error('[🛡️ Admin] ❌ Error resetting Twitter counter:', error);
        res.status(500).json({ error: 'Failed to reset Twitter counter' });
      }
    });

    // Admin endpoint for AI prediction cache statistics
    this.app.get('/api/admin/ai-predictions/stats', adminApiAuth, async (req, res) => {
      try {
        const stats = this.aiHypePrediction.getCacheStats();
        
        res.json({
          success: true,
          stats: {
            ...stats,
            cacheTimeout: '24 hours',
            lastCleanup: 'on_startup'
          },
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('[🛡️ Enhanced Backend] ❌ Error getting AI prediction stats:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to get AI prediction statistics',
          details: error.message
        });
      }
    });

    // Admin endpoint to clean expired AI prediction cache
    this.app.post('/api/admin/ai-predictions/clean', adminApiAuth, async (req, res) => {
      try {
        await this.aiHypePrediction.cleanExpiredCache();
        const stats = this.aiHypePrediction.getCacheStats();
        
        res.json({
          success: true,
          message: 'Expired AI prediction cache entries cleaned',
          stats,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('[🛡️ Enhanced Backend] ❌ Error cleaning AI prediction cache:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to clean AI prediction cache',
          details: error.message
        });
      }
    });

    // Admin endpoint to clear ALL AI prediction cache (force fresh predictions)
    this.app.post('/api/admin/ai-predictions/clear-all', adminApiAuth, async (req, res) => {
      try {
        // Clear the in-memory cache
        this.aiHypePrediction.predictionCache.clear();
        
        // Clear the cache file
        try {
          await fs.unlink(this.aiHypePrediction.predictionCacheFile);
          console.log('[🛡️ Enhanced Backend] 🗑️ Cleared AI prediction cache file');
        } catch (fileError) {
          console.log('[🛡️ Enhanced Backend] ⚠️ Cache file not found or already cleared');
        }
        
        const stats = this.aiHypePrediction.getCacheStats();
        
        res.json({
          success: true,
          message: 'ALL AI prediction cache cleared - next predictions will be fresh',
          stats,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('[🛡️ Enhanced Backend] ❌ Error clearing AI prediction cache:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to clear AI prediction cache',
          details: error.message
        });
      }
    });
    
    // Emergency mode controls
    this.app.post('/api/admin/twitter/emergency-mode/:action', adminApiAuth, async (req, res) => {
      try {
        const { action } = req.params; // 'activate' or 'deactivate'
        
        const socialService = this.tokenProcessor?.socialDataService;
        if (!socialService?.twitterApiManager) {
          return res.status(500).json({ error: 'Twitter API Manager not available' });
        }
        
        if (action === 'activate') {
          await socialService.twitterApiManager.activateEmergencyMode();
          res.json({ success: true, message: 'Emergency mode activated - all Twitter refreshes blocked' });
        } else if (action === 'deactivate') {
          await socialService.twitterApiManager.deactivateEmergencyMode();
          res.json({ success: true, message: 'Emergency mode deactivated - Twitter refreshes resumed' });
        } else {
          res.status(400).json({ error: 'Invalid action. Use "activate" or "deactivate"' });
        }
        
      } catch (error) {
        console.error('[🛡️ Admin] ❌ Error controlling emergency mode:', error);
        res.status(500).json({ error: 'Failed to control emergency mode' });
      }
    });

    // Admin: Recalculate all token scores (no API calls)
    this.app.post('/api/admin/recalculate-all-scores', adminApiAuth, async (req, res) => {
      try {
        console.log('[🛡️ Admin] 🧮 RECALCULATING ALL TOKEN SCORES...');
        
        // Load tokens from cache
        const tokensPath = path.join(process.cwd(), 'cache', 'tokens-cache.json');
        let rawTokens;
        
        try {
          const tokensData = await fs.readFile(tokensPath, 'utf8');
          rawTokens = JSON.parse(tokensData);
        } catch (error) {
          return res.status(404).json({ error: 'Token cache not found' });
        }
        
        if (!Array.isArray(rawTokens) || rawTokens.length === 0) {
          return res.status(404).json({ error: 'No tokens found in cache' });
        }
        
        console.log(`[🛡️ Admin] 📊 Found ${rawTokens.length} tokens to recalculate`);
        
        let successCount = 0;
        let errorCount = 0;
        const errors = [];
        
        // Process each token
        for (let i = 0; i < rawTokens.length; i++) {
          const token = rawTokens[i];
          
          try {
            // Only recalculate if token has the necessary data
            if (token.jupiterData) {
              // Recalculate overall score using existing data (no API calls)
              const newOverallScore = await this.tokenProcessor.calculateEnhancedOverallScore(token);
              
              // Update scores
              token.overallScore = newOverallScore;
              token.enhancedScore = newOverallScore;
              token.score = newOverallScore; // Legacy field
              token.lastCalculated = new Date().toISOString();
              
              successCount++;
              
              // Log progress every 50 tokens
              if ((i + 1) % 50 === 0) {
                console.log(`[🛡️ Admin] 📈 Progress: ${i + 1}/${rawTokens.length} tokens processed`);
              }
            } else {
              console.log(`[🛡️ Admin] ⚠️ Skipping ${token.symbol} - missing Jupiter data`);
            }
            
          } catch (error) {
            errorCount++;
            const errorMsg = `${token.symbol}: ${error.message}`;
            errors.push(errorMsg);
            console.error(`[🛡️ Admin] ❌ Error recalculating ${token.symbol}:`, error.message);
          }
        }
        
        // Save updated tokens back to cache
        try {
          await fs.writeFile(tokensPath, JSON.stringify(rawTokens, null, 2));
          console.log('[🛡️ Admin] 💾 Updated token cache saved successfully');
        } catch (saveError) {
          console.error('[🛡️ Admin] ❌ Error saving updated cache:', saveError);
          return res.status(500).json({ error: 'Failed to save updated scores' });
        }
        
        const summary = {
          success: true,
          message: 'Score recalculation completed',
          stats: {
            totalTokens: rawTokens.length,
            successfulRecalculations: successCount,
            errors: errorCount,
            skipped: rawTokens.length - successCount - errorCount
          },
          errors: errors.slice(0, 10) // Show first 10 errors if any
        };
        
        console.log(`[🛡️ Admin] ✅ RECALCULATION COMPLETE: ${successCount}/${rawTokens.length} successful`);
        
        res.json(summary);
        
      } catch (error) {
        console.error('[🛡️ Admin] ❌ Error during score recalculation:', error);
        res.status(500).json({ error: 'Failed to recalculate scores' });
      }
    });

    // Admin: Restart backend
    this.app.post('/api/admin/restart/backend', adminApiAuth, (req, res) => {
      try {
        console.log('[🛡️ Admin] 🔄 BACKEND RESTART REQUESTED');
        
        res.json({
          success: true,
          message: 'Backend restart initiated - server will restart in 3 seconds'
        });
        
        // Restart after sending response
        setTimeout(() => {
          console.log('[🛡️ Admin] 🚨 RESTARTING BACKEND NOW...');
          process.exit(0); // Exit process - PM2 or nodemon will restart it
        }, 3000);
        
      } catch (error) {
        console.error('[🛡️ Admin] ❌ Error restarting backend:', error);
        res.status(500).json({ error: 'Failed to restart backend' });
      }
    });

    // Admin: Restart frontend (placeholder - requires frontend implementation)
    this.app.post('/api/admin/restart/frontend', adminApiAuth, (req, res) => {
      try {
        console.log('[🛡️ Admin] 🔄 FRONTEND RESTART REQUESTED');
        
        // This would need to be implemented based on your frontend setup
        // For now, just return instructions
        res.json({
          success: true,
          message: 'Frontend restart not implemented - please restart manually',
          instructions: [
            'Stop your frontend server (Ctrl+C)',
            'Run: npm start or yarn start',
            'Or use PM2: pm2 restart frontend'
          ]
        });
        
      } catch (error) {
        console.error('[🛡️ Admin] ❌ Error restarting frontend:', error);
        res.status(500).json({ error: 'Failed to restart frontend' });
      }
    });

    // Admin: Get comprehensive system status
    
    // === LOG ACCESS ENDPOINTS ===
    
    // Admin: Get recent server logs
    this.app.get('/api/admin/logs/recent', adminApiAuth, async (req, res) => {
      try {
        const { lines = 100, level = 'all' } = req.query;
        const logLines = parseInt(lines);
        
        // Get recent logs from file system
        const logs = await this.getRecentLogs(logLines, level);
        
        res.json({
          success: true,
          logs: logs,
          count: logs.length,
          requestedLines: logLines,
          level: level,
          timestamp: new Date().toISOString()
        });
        
      } catch (error) {
        console.error('[🛡️ Admin] ❌ Error getting recent logs:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to get recent logs',
          details: error.message
        });
      }
    });
    
    // Debug endpoint to check log file path and contents
    this.app.get('/api/admin/logs/debug', adminApiAuth, async (req, res) => {
      try {
        const logFile = '/var/data/logs/app.log';
        
        // Check if log file exists
        let fileExists = false;
        let fileSize = 0;
        let fileContent = '';
        
        try {
          const stats = await fs.stat(logFile);
          fileExists = true;
          fileSize = stats.size;
          fileContent = await fs.readFile(logFile, 'utf8');
        } catch (error) {
          fileExists = false;
        }
        
        res.json({
          success: true,
          logFile: logFile,
          fileExists: fileExists,
          fileSize: fileSize,
          fileContent: fileContent,
          dataDir: '/var/data',
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: 'Failed to debug logs',
          message: error.message
        });
      }
    });

    // Better Stack logs query endpoint for troubleshooting (ClickHouse HTTP API)
    this.app.get('/api/admin/logs/betterstack', adminApiAuth, async (req, res) => {
      try {
        const { 
          sourceId = 't458780_dgo_backend', 
          startTime, 
          endTime, 
          level, 
          limit = 100,
          query 
        } = req.query;

        const username = process.env.BETTER_STACK_USERNAME;
        const password = process.env.BETTER_STACK_PASSWORD;
        
        if (!username || !password) {
          return res.status(400).json({
            success: false,
            error: 'Better Stack credentials not configured',
            message: 'Please set BETTER_STACK_USERNAME and BETTER_STACK_PASSWORD environment variables'
          });
        }

        // Build ClickHouse SQL query
        let sqlQuery = `SELECT dt, raw FROM (
          SELECT dt, raw FROM remote(${sourceId}_logs)
          UNION ALL 
          SELECT dt, raw FROM s3Cluster(primary, ${sourceId}_s3)
            WHERE _row_type = 1
        )`;

        // Add filters
        const conditions = [];
        if (level) {
          conditions.push(`JSONExtract(raw, 'level', 'Nullable(String)') = '${level.toUpperCase()}'`);
        }
        if (query) {
          conditions.push(`raw LIKE '%${query}%'`);
        }
        if (startTime && endTime) {
          conditions.push(`dt BETWEEN toDateTime64(${startTime}, 0, 'UTC') AND toDateTime64(${endTime}, 0, 'UTC')`);
        }

        if (conditions.length > 0) {
          sqlQuery += ` WHERE ${conditions.join(' AND ')}`;
        }

        sqlQuery += ` ORDER BY dt DESC LIMIT ${limit} FORMAT JSONEachRow`;

        const response = await axios.post('https://eu-nbg-2-connect.betterstackdata.com?output_format_pretty_row_numbers=0', sqlQuery, {
          headers: {
            'Content-Type': 'plain/text'
          },
          auth: {
            username: username,
            password: password
          },
          timeout: 30000
        });

        // Parse JSONEachRow format (one JSON object per line)
        const logs = response.data.trim().split('\n').map(line => {
          try {
            return JSON.parse(line);
          } catch (e) {
            return { raw: line, dt: new Date().toISOString() };
          }
        });

        res.json({
          success: true,
          logs: logs,
          query: {
            sourceId,
            startTime,
            endTime,
            level,
            limit,
            query,
            sqlQuery
          },
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        logger.error('Better Stack logs query failed:', error.message);
        res.status(500).json({
          success: false,
          error: 'Failed to query Better Stack logs',
          message: error.response?.data || error.message,
          details: error.response?.status || null
        });
      }
    });

    // Better Stack sources endpoint
    this.app.get('/api/admin/logs/betterstack/sources', adminApiAuth, async (req, res) => {
      try {
        const username = process.env.BETTER_STACK_USERNAME;
        const password = process.env.BETTER_STACK_PASSWORD;
        
        if (!username || !password) {
          return res.status(400).json({
            success: false,
            error: 'Better Stack credentials not configured',
            message: 'Please set BETTER_STACK_USERNAME and BETTER_STACK_PASSWORD environment variables'
          });
        }

        // Query to get available sources
        const sqlQuery = `SELECT DISTINCT table FROM system.tables WHERE database LIKE 't%' FORMAT JSONEachRow`;

        const response = await axios.post('https://eu-nbg-2-connect.betterstackdata.com?output_format_pretty_row_numbers=0', sqlQuery, {
          headers: {
            'Content-Type': 'plain/text'
          },
          auth: {
            username: username,
            password: password
          },
          timeout: 10000
        });

        // Parse JSONEachRow format
        const sources = response.data.trim().split('\n').map(line => {
          try {
            return JSON.parse(line);
          } catch (e) {
            return { table: line };
          }
        });

        res.json({
          success: true,
          sources: sources,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        logger.error('Better Stack sources query failed:', error.message);
        res.status(500).json({
          success: false,
          error: 'Failed to query Better Stack sources',
          message: error.response?.data || error.message
        });
      }
    });
    
    // Admin: Get error logs only
    this.app.get('/api/admin/logs/errors', adminApiAuth, async (req, res) => {
      try {
        const { lines = 50 } = req.query;
        const logLines = parseInt(lines);
        
        const errorLogs = this.getRecentLogs(logLines, 'error');
        
        res.json({
          success: true,
          logs: errorLogs,
          count: errorLogs.length,
          requestedLines: logLines,
          level: 'error',
          timestamp: new Date().toISOString()
        });
        
      } catch (error) {
        console.error('[🛡️ Admin] ❌ Error getting error logs:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to get error logs',
          details: error.message
        });
      }
    });
    
    // Admin: Get system logs (startup, deployment, etc.)
    this.app.get('/api/admin/logs/system', adminApiAuth, async (req, res) => {
      try {
        const { lines = 100 } = req.query;
        const logLines = parseInt(lines);
        
        const systemLogs = this.getRecentLogs(logLines, 'system');
        
        res.json({
          success: true,
          logs: systemLogs,
          count: systemLogs.length,
          requestedLines: logLines,
          level: 'system',
          timestamp: new Date().toISOString()
        });
        
      } catch (error) {
        console.error('[🛡️ Admin] ❌ Error getting system logs:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to get system logs',
          details: error.message
        });
      }
    });
    
    // Admin: Get processing logs
    this.app.get('/api/admin/logs/processing', adminApiAuth, async (req, res) => {
      try {
        const { lines = 100 } = req.query;
        const logLines = parseInt(lines);
        
        const processingLogs = this.getRecentLogs(logLines, 'processing');
        
        res.json({
          success: true,
          logs: processingLogs,
          count: processingLogs.length,
          requestedLines: logLines,
          level: 'processing',
          timestamp: new Date().toISOString()
        });
        
      } catch (error) {
        console.error('[🛡️ Admin] ❌ Error getting processing logs:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to get processing logs',
          details: error.message
        });
      }
    });
    
    // Admin: Get database logs
    this.app.get('/api/admin/logs/database', adminApiAuth, async (req, res) => {
      try {
        const { lines = 100 } = req.query;
        const logLines = parseInt(lines);
        
        const databaseLogs = this.getRecentLogs(logLines, 'database');
        
        res.json({
          success: true,
          logs: databaseLogs,
          count: databaseLogs.length,
          requestedLines: logLines,
          level: 'database',
          timestamp: new Date().toISOString()
        });
        
      } catch (error) {
        console.error('[🛡️ Admin] ❌ Error getting database logs:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to get database logs',
          details: error.message
        });
      }
    });
    
    // Admin: Export logs to file
    this.app.get('/api/admin/logs/export', adminApiAuth, async (req, res) => {
      try {
        const { lines = 1000, level = 'all', format = 'json' } = req.query;
        const logLines = parseInt(lines);
        
        const logs = this.getRecentLogs(logLines, level);
        
        if (format === 'txt') {
          const logText = logs.map(log => `[${log.timestamp}] ${log.level}: ${log.message}`).join('\n');
          res.setHeader('Content-Type', 'text/plain');
          res.setHeader('Content-Disposition', `attachment; filename="server-logs-${new Date().toISOString().split('T')[0]}.txt"`);
          res.send(logText);
        } else {
          res.json({
            success: true,
            logs: logs,
            count: logs.length,
            requestedLines: logLines,
            level: level,
            format: format,
            timestamp: new Date().toISOString()
          });
        }
        
      } catch (error) {
        console.error('[🛡️ Admin] ❌ Error exporting logs:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to export logs',
          details: error.message
        });
      }
    });
    
    // Jupiter API Endpoints
    this.app.get('/api/jupiter/health', async (req, res) => {
      try {
        const { default: jupiterApiService } = await import('./jupiterApiService.js');
        const isHealthy = await jupiterApiService.healthCheck();

        res.json({
          success: true,
          service: 'Jupiter API',
          healthy: isHealthy,
          timestamp: new Date().toISOString(),
          baseURL: jupiterApiService.baseURL,
          cacheSize: jupiterApiService.cache.size
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });

    this.app.get('/api/jupiter/info', async (req, res) => {
      try {
        const { default: jupiterApiService } = await import('./jupiterApiService.js');
        const info = jupiterApiService.getServiceInfo();

        res.json({
          success: true,
          ...info,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });

    this.app.get('/api/jupiter/test/:contractAddress', async (req, res) => {
      try {
        const { contractAddress } = req.params;
        const { default: jupiterApiService } = await import('./jupiterApiService.js');

        console.log(`🧪 Testing Jupiter API with contract: ${contractAddress}`);
        const tokenData = await jupiterApiService.getTokenDetails(contractAddress);

        if (tokenData) {
          res.json({
            success: true,
            contractAddress,
            tokenData,
            timestamp: new Date().toISOString()
          });
        } else {
          res.status(404).json({
            success: false,
            contractAddress,
            error: 'Token not found in Jupiter API',
            timestamp: new Date().toISOString()
          });
        }
      } catch (error) {
        console.error('❌ Jupiter API test error:', error);
        res.status(500).json({
          success: false,
          contractAddress: req.params.contractAddress,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });

    // Clear Jupiter cache endpoint
    this.app.post('/api/jupiter/clear-cache', async (req, res) => {
      try {
        console.log('🧹 Clearing Jupiter API cache...');
        this.jupiterService.clearCache();
        res.json({
          success: true,
          message: 'Jupiter cache cleared successfully',
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('❌ Error clearing Jupiter cache:', error);
        res.status(500).json({
          success: false,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });

    this.app.post('/api/admin/jupiter/refresh-all', adminApiAuth, async (req, res) => {
      try {
        console.log('🔄 Starting Jupiter refresh for all tokens (with batch processing)...');

        const tokens = await this.getTokensFromCache();
        const paidTokens = tokens.filter(token => token.isPaid);

        if (paidTokens.length === 0) {
          return res.json({
            success: true,
            message: 'No paid tokens found to refresh',
            totalTokens: tokens.length,
            paidTokens: 0
          });
        }

        console.log(`🚀 Processing ${paidTokens.length} paid tokens in batches of up to 100...`);

        // Process tokens in batches of 100 (Jupiter's limit)
        const batchSize = 100;
        const results = [];
        let successCount = 0;
        let errorCount = 0;
        let batchCount = 0;

        for (let i = 0; i < paidTokens.length; i += batchSize) {
          const batchTokens = paidTokens.slice(i, i + batchSize);
          const contractAddresses = batchTokens.map(t => t.contractAddress).filter(addr => addr);
          batchCount++;

          console.log(`🔄 Processing batch ${batchCount}/${Math.ceil(paidTokens.length/batchSize)}: ${contractAddresses.length} contracts`);

          try {
            // Use batch Jupiter API call
            const { default: jupiterApiService } = await import('./jupiterApiService.js');
            const batchJupiterData = await jupiterApiService.getBatchTokenDetails(contractAddresses);

            // Process each token in the batch
            for (let j = 0; j < batchTokens.length; j++) {
              const token = batchTokens[j];
              const jupiterData = batchJupiterData[j];

              try {
                let updatedToken;

                if (jupiterData) {
                  console.log(`✅ Jupiter data found for ${token.symbol}`);
                  // Update token with Jupiter data
                  updatedToken = await this.tokenProcessor.processPaidTokenImmediately({
                    ...token,
                    contractAddress: token.contractAddress
                  });

                  if (updatedToken) {
                    // Merge Jupiter data into the token
                    updatedToken.jupiterData = jupiterData;
                    updatedToken.hasJupiterData = true;
                  }
                } else {
                  console.log(`⚠️ No Jupiter data for ${token.symbol}`);
                  // Still process token but mark as no Jupiter data
                  updatedToken = await this.tokenProcessor.processPaidTokenImmediately({
                    ...token,
                    contractAddress: token.contractAddress
                  });
                }

                if (updatedToken) {
                  // CRITICAL FIX: Update the token in the main tokens array
                  const tokenIndex = tokens.findIndex(t => t.contractAddress === token.contractAddress);
                  if (tokenIndex !== -1) {
                    tokens[tokenIndex] = { 
                      ...tokens[tokenIndex], 
                      ...updatedToken,
                      jupiterTimestamp: new Date().toISOString() // Track when Jupiter data was updated
                    };
                    console.log(`💾 Updated ${token.symbol} in cache with fresh Jupiter data`);
                  }
                  
                  results.push({
                    symbol: token.symbol,
                    contractAddress: token.contractAddress,
                    success: true,
                    hasJupiterData: !!jupiterData
                  });
                  successCount++;
                } else {
                  results.push({
                    symbol: token.symbol,
                    contractAddress: token.contractAddress,
                    success: false,
                    error: 'Failed to process token'
                  });
                  errorCount++;
                }

              } catch (tokenError) {
                console.error(`❌ Error processing ${token.symbol}:`, tokenError.message);
                results.push({
                  symbol: token.symbol,
                  contractAddress: token.contractAddress,
                  success: false,
                  error: tokenError.message
                });
                errorCount++;
              }
            }

            // Rate limiting delay between batches (3 seconds)
            if (i + batchSize < paidTokens.length) {
              console.log(`⏱️ Waiting 3 seconds before next batch...`);
              await new Promise(resolve => setTimeout(resolve, 3000));
            }

          } catch (batchError) {
            console.error(`❌ Error processing batch ${batchCount}:`, batchError.message);

            // Mark all tokens in this batch as failed
            for (const token of batchTokens) {
              results.push({
                symbol: token.symbol,
                contractAddress: token.contractAddress,
                success: false,
                error: `Batch error: ${batchError.message}`
              });
              errorCount++;
            }
          }
        }

        // Save updated tokens to cache
        await this.saveTokensToCache(tokens);

        res.json({
          success: true,
          message: `Jupiter batch refresh completed for ${paidTokens.length} paid tokens (${batchCount} batches)`,
          totalTokens: tokens.length,
          paidTokens: paidTokens.length,
          batchCount,
          successCount,
          errorCount,
          results,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        console.error('❌ Jupiter refresh all error:', error);
        res.status(500).json({
          success: false,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });

    this.app.post('/api/admin/jupiter/refresh/:contractAddress', adminApiAuth, async (req, res) => {
      try {
        const { contractAddress } = req.params;

        console.log(`🔄 Refreshing Jupiter data for contract: ${contractAddress}`);

        // Find the token in cache
        const tokens = await this.getTokensFromCache();
        const token = tokens.find(t => t.contractAddress?.toLowerCase() === contractAddress.toLowerCase());

        if (!token) {
          return res.status(404).json({
            success: false,
            error: 'Token not found',
            contractAddress
          });
        }

        // Process token with Jupiter data
        const updatedToken = await this.tokenProcessor.processPaidTokenImmediately({
          ...token,
          contractAddress: token.contractAddress
        });

        if (updatedToken) {
          // Update token in cache
          const tokenIndex = tokens.findIndex(t => t.contractAddress?.toLowerCase() === contractAddress.toLowerCase());
          if (tokenIndex !== -1) {
            tokens[tokenIndex] = updatedToken;
            await this.saveTokensToCache(tokens);
          }

          res.json({
            success: true,
            message: `Successfully refreshed Jupiter data for ${updatedToken.symbol}`,
            token: {
              symbol: updatedToken.symbol,
              name: updatedToken.name,
              contractAddress: updatedToken.contractAddress,
              hasJupiterData: !!updatedToken.jupiterData,
              price: updatedToken.price,
              marketCap: updatedToken.marketCap,
              organicScore: updatedToken.jupiterData?.organicScore
            },
            timestamp: new Date().toISOString()
          });
        } else {
          res.status(500).json({
            success: false,
            error: 'Failed to refresh Jupiter data',
            contractAddress
          });
        }

      } catch (error) {
        console.error('❌ Jupiter refresh single error:', error);
        res.status(500).json({
          success: false,
          error: error.message,
          contractAddress: req.params.contractAddress,
          timestamp: new Date().toISOString()
        });
      }
    });

    // Hype Analysis Testing Endpoint
    this.app.get('/api/test/hype-analysis', async (req, res) => {
      try {
        const { HypeAnalysisTestEndpoint } = await import('./test-hype-endpoint.js');
        const testEndpoint = new HypeAnalysisTestEndpoint();
        
        console.log('🧪 Running Hype Analysis Test in Production...');
        const results = await testEndpoint.testHypeAnalysis();
        
        res.json({
          success: true,
          message: 'Hype Analysis Test completed',
          results,
          timestamp: new Date().toISOString()
        });
        
      } catch (error) {
        console.error('❌ Hype Analysis Test failed:', error);
        res.status(500).json({
          success: false,
          error: 'Hype Analysis Test failed',
          details: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });

    // Hype Prediction Service Specific Test
    this.app.get('/api/test/hype-prediction', async (req, res) => {
      try {
        const { HypePredictionTestEndpoint } = await import('./test-hype-prediction-only.js');
        const testEndpoint = new HypePredictionTestEndpoint();
        
        console.log('🤖 Running AI Hype Prediction Service Test...');
        const results = await testEndpoint.testHypePredictionService();
        
        res.json({
          success: true,
          message: 'AI Hype Prediction Service Test completed',
          results,
          timestamp: new Date().toISOString()
        });
        
      } catch (error) {
        console.error('❌ AI Hype Prediction Service Test failed:', error);
        res.status(500).json({
          success: false,
          error: 'AI Hype Prediction Service Test failed',
          details: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });

    // Bayesian Change-Point Detection Debug Test
    this.app.get('/api/test/bayesian-debug', async (req, res) => {
      try {
        const { BayesianDebugTestEndpoint } = await import('./test-bayesian-debug.js');
        const testEndpoint = new BayesianDebugTestEndpoint();
        
        console.log('🔍 Running Bayesian Change-Point Detection Debug...');
        const results = await testEndpoint.debugBayesianDetection();
        
        res.json({
          success: true,
          message: 'Bayesian Debug Test completed',
          results,
          timestamp: new Date().toISOString()
        });
        
      } catch (error) {
        console.error('❌ Bayesian Debug Test failed:', error);
        res.status(500).json({
          success: false,
          error: 'Bayesian Debug Test failed',
          details: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });

    // Forecast Calculation Debug Test
    this.app.get('/api/test/forecast-debug', async (req, res) => {
      try {
        const testEndpoint = new ForecastDebugEndpoint();
        
        console.log('📊 Running Forecast Calculation Debug...');
        const result = await testEndpoint.debugForecastCalculation();
        
        res.json({
          success: true,
          message: 'Forecast Debug Test completed',
          result,
          timestamp: new Date().toISOString()
        });
        
      } catch (error) {
        console.error('❌ Forecast Debug Test failed:', error);
        res.status(500).json({
          success: false,
          error: 'Forecast Debug Test failed',
          details: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });

    // Call Milestones Debug Test
    this.app.get('/api/test/call-milestones/:callId', async (req, res) => {
      try {
        const { callId } = req.params;
        const debugEndpoint = new CallMilestonesDebugEndpoint();
        
        console.log(`🔍 Debugging call milestones for ID: ${callId}`);
        const result = await debugEndpoint.debugCallMilestones(callId);
        
        res.json({
          success: true,
          message: 'Call Milestones Debug completed',
          result,
          timestamp: new Date().toISOString()
        });
        
      } catch (error) {
        console.error('❌ Call Milestones Debug failed:', error);
        res.status(500).json({
          success: false,
          error: 'Call Milestones Debug failed',
          details: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });

    // Debug endpoint to check milestone posts for specific calls
    this.app.get('/api/debug/milestone-posts/:callId', async (req, res) => {
      try {
        const { callId } = req.params;
        console.log(`🔍 Debugging milestone posts for call ${callId}`);
        
        // Get all users and search for the call
        const userIndex = await this.oauthXService.db.readJsonFile(
          this.oauthXService.db.getGlobalFile('users-index.json'), 
          {}
        );
        
        let foundCall = null;
        let foundUserId = null;
        
        for (const userId of Object.keys(userIndex)) {
          try {
            const calls = await this.oauthXService.db.getKolCalls(userId);
            const call = calls.find(c => c.id === callId);
            if (call) {
              foundCall = call;
              foundUserId = userId;
              break;
            }
          } catch (error) {
            console.warn(`Failed to get calls for user ${userId}:`, error.message);
          }
        }
        
        if (!foundCall) {
          return res.json({
            success: false,
            error: 'Call not found',
            callId: callId
          });
        }
        
        res.json({
          success: true,
          callId: callId,
          userId: foundUserId,
          call: {
            id: foundCall.id,
            symbol: foundCall.token?.symbol,
            currentMultiplier: foundCall.currentMultiplier,
            athMultiplier: foundCall.athMultiplier,
            calledAt: foundCall.calledAt,
            lastUpdated: foundCall.lastUpdated,
            milestonePosts: foundCall.milestonePosts || [],
            milestonePostsLength: foundCall.milestonePosts ? foundCall.milestonePosts.length : 0
          }
        });
        
      } catch (error) {
        console.error('❌ Debug milestone posts error:', error.message);
        res.status(500).json({ error: 'Debug failed: ' + error.message });
      }
    });

    // AI Chat Endpoint - Moralis AI with user context
    this.app.post('/api/ai/chat', async (req, res) => {
      try {
        const { sessionId, prompt, conversationHistory } = req.body;
        
        if (!sessionId || !prompt) {
          return res.status(400).json({
            success: false,
            error: 'Missing sessionId or prompt'
          });
        }

        // Validate user session
        const user = await this.oauthXService.getUserBySession(sessionId);
        if (!user) {
          return res.status(401).json({
            success: false,
            error: 'Invalid session'
          });
        }

        console.log(`🤖 AI Chat request from user ${user.id}: "${prompt.substring(0, 100)}..."`);

        // Call AI chat service with user context
        const aiResponse = await this.aiChatService.chat(
          user.id,
          prompt,
          conversationHistory || []
        );

        res.json({
          success: true,
          response: aiResponse.response,
          dataUsed: aiResponse.dataUsed || false,
          hasUserData: aiResponse.hasUserData || false,
          timestamp: aiResponse.timestamp
        });

      } catch (error) {
        console.error('❌ AI Chat error:', error);
        res.status(500).json({
          success: false,
          error: 'AI Chat failed',
          details: error.message,
          fallbackResponse: {
            content: "I'm having trouble connecting to my AI brain right now 🧠 Please try again in a moment!",
            hasUserData: false,
            dataSourcesUsed: []
          }
        });
      }
    });

    // ========================================
    // 🧠 AI CHAT HISTORY MANAGEMENT ENDPOINTS
    // ========================================

    // Save chat history
    this.app.post('/api/ai/chat/save', async (req, res) => {
      try {
        const { sessionId, chatHistory, title } = req.body;
        
        if (!sessionId || !chatHistory) {
          return res.status(400).json({
            success: false,
            error: 'Missing sessionId or chatHistory'
          });
        }

        // Validate user session
        const user = await this.oauthXService.getUserBySession(sessionId);
        if (!user) {
          return res.status(401).json({
            success: false,
            error: 'Invalid session'
          });
        }

        console.log(`💾 Saving chat history for user ${user.id}: ${chatHistory.length} messages`);

        // Save chat history
        const savedHistory = await this.aiChatService.saveChatHistory(user.id, chatHistory, title);

        res.json({
          success: true,
          history: savedHistory,
          message: 'Chat history saved successfully'
        });

      } catch (error) {
        console.error('❌ Save chat history error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to save chat history',
          details: error.message
        });
      }
    });

    // Get chat histories
    this.app.get('/api/ai/chat/histories', async (req, res) => {
      try {
        const { sessionId } = req.query;
        
        if (!sessionId) {
          return res.status(400).json({
            success: false,
            error: 'Missing sessionId'
          });
        }

        // Validate user session
        const user = await this.oauthXService.getUserBySession(sessionId);
        if (!user) {
          return res.status(401).json({
            success: false,
            error: 'Invalid session'
          });
        }

        // Get chat histories
        const histories = await this.aiChatService.getChatHistories(user.id);

        res.json({
          success: true,
          histories: histories
        });

      } catch (error) {
        console.error('❌ Get chat histories error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to get chat histories',
          details: error.message
        });
      }
    });

    // Load specific chat history
    this.app.get('/api/ai/chat/history/:historyId', async (req, res) => {
      try {
        const { sessionId } = req.query;
        const { historyId } = req.params;
        
        if (!sessionId) {
          return res.status(400).json({
            success: false,
            error: 'Missing sessionId'
          });
        }

        // Validate user session
        const user = await this.oauthXService.getUserBySession(sessionId);
        if (!user) {
          return res.status(401).json({
            success: false,
            error: 'Invalid session'
          });
        }

        // Load chat history
        const history = await this.aiChatService.loadChatHistory(user.id, historyId);

        res.json({
          success: true,
          history: history
        });

      } catch (error) {
        console.error('❌ Load chat history error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to load chat history',
          details: error.message
        });
      }
    });

    // Update chat history
    this.app.put('/api/ai/chat/history/:historyId', async (req, res) => {
      try {
        const { sessionId, messages } = req.body;
        const { historyId } = req.params;
        
        if (!sessionId) {
          return res.status(400).json({
            success: false,
            error: 'Missing sessionId'
          });
        }

        if (!messages || !Array.isArray(messages)) {
          return res.status(400).json({
            success: false,
            error: 'Missing or invalid messages array'
          });
        }

        // Validate user session
        const user = await this.oauthXService.getUserBySession(sessionId);
        if (!user) {
          return res.status(401).json({
            success: false,
            error: 'Invalid session'
          });
        }

        // Update the chat history
        const updatedHistory = await this.aiChatService.updateChatHistory(user.id, historyId, messages);

        res.json({
          success: true,
          history: updatedHistory
        });

      } catch (error) {
        console.error('❌ Update chat history error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to update chat history',
          details: error.message
        });
      }
    });

    // Delete chat history
    this.app.delete('/api/ai/chat/history/:historyId', async (req, res) => {
      try {
        const { sessionId } = req.query;
        const { historyId } = req.params;
        
        if (!sessionId) {
          return res.status(400).json({
            success: false,
            error: 'Missing sessionId'
          });
        }

        // Validate user session
        const user = await this.oauthXService.getUserBySession(sessionId);
        if (!user) {
          return res.status(401).json({
            success: false,
            error: 'Invalid session'
          });
        }

        // Delete chat history
        const remainingHistories = await this.aiChatService.deleteChatHistory(user.id, historyId);

        res.json({
          success: true,
          histories: remainingHistories,
          message: 'Chat history deleted successfully'
        });

      } catch (error) {
        console.error('❌ Delete chat history error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to delete chat history',
          details: error.message
        });
      }
    });

    // Get personalized suggestions
    this.app.get('/api/ai/suggestions', async (req, res) => {
      try {
        const { sessionId } = req.query;
        
        if (!sessionId) {
          return res.status(400).json({
            success: false,
            error: 'Missing sessionId'
          });
        }

        // Validate user session
        const user = await this.oauthXService.getUserBySession(sessionId);
        if (!user) {
          return res.status(401).json({
            success: false,
            error: 'Invalid session'
          });
        }

        // Get personalized suggestions
        const suggestions = await this.aiChatService.generatePersonalizedSuggestions(user.id);

        res.json({
          success: true,
          suggestions: suggestions
        });

      } catch (error) {
        console.error('❌ Get suggestions error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to get suggestions',
          details: error.message
        });
      }
    });

    // EAGLE Hype Analysis Debug Test
    this.app.get('/api/test/eagle-hype', async (req, res) => {
      try {
        const { EagleHypeDebugTest } = await import('./test-eagle-hype.js');
        const testEndpoint = new EagleHypeDebugTest();
        
        console.log('🦅 Running EAGLE Hype Analysis Debug...');
        const results = await testEndpoint.debugEagleHype();
        
        res.json({
          success: true,
          message: 'EAGLE Hype Debug Test completed',
          results,
          timestamp: new Date().toISOString()
        });
        
      } catch (error) {
        console.error('❌ EAGLE Hype Debug Test failed:', error);
        res.status(500).json({
          success: false,
          error: 'EAGLE hype debug test failed',
          details: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });

    // Simple Adaptive Bayesian Test
    this.app.get('/api/test/adaptive-simple', async (req, res) => {
      try {
        const { default: HypeTrendAnalysis } = await import('./hypeTrendAnalysis.js');
        
        // Test data - MEMEPUTER-like stable data with upturn
        const testScores = [
          7.096, 7.096, 7.096, 7.096, 7.096, 7.096, 7.096, 7.096, 7.096, 7.096,
          7.096, 7.096, 7.096, 7.096, 7.096, 7.696, 7.696, 7.696, 7.696, 7.696
        ];
        const testMentions = new Array(20).fill(16);
        
        console.log('🧪 Testing Adaptive Bayesian Change-Point Detection...');
        
        const trendAnalysis = new HypeTrendAnalysis();
        const results = trendAnalysis.detectChangePoints(testScores, testMentions);
        
        const testResults = {
          testData: {
            scores: testScores,
            mentions: testMentions,
            variance: testScores.reduce((acc, val, i, arr) => {
              const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
              return acc + Math.pow(val - mean, 2);
            }, 0) / (testScores.length - 1)
          },
          adaptiveResults: results,
          success: results.changePoints && results.changePoints.length > 0,
          changePointsFound: results.changePoints ? results.changePoints.length : 0,
          adaptiveThreshold: results.adaptiveThreshold,
          summary: {
            oldSystemWouldFind: 0, // Fixed threshold 1.5 would find 0
            newSystemFound: results.changePoints ? results.changePoints.length : 0,
            improvement: results.changePoints && results.changePoints.length > 0 ? 'SUCCESS' : 'FAILED'
          }
        };
        
        res.json({
          success: true,
          message: 'Adaptive Bayesian Test completed',
          results: testResults,
          timestamp: new Date().toISOString()
        });
        
      } catch (error) {
        console.error('❌ Adaptive Bayesian Test failed:', error);
        res.status(500).json({
          success: false,
          error: 'Adaptive Bayesian Test failed',
          details: error.message,
          stack: error.stack,
          timestamp: new Date().toISOString()
        });
      }
    });

    // ========================================
    // 🎯 HYPE OVER TIME ORACLE AI ANALYSIS
    // ========================================

    // Hype Trend Analysis with Adaptive Bayesian Change-Point Detection
    this.app.get('/api/hype-trend/:contractAddress', async (req, res) => {
      try {
        const { contractAddress } = req.params;
        const { range = '7d', sessionId } = req.query;
        
        console.log(`🧠 Hype Trend Analysis requested for ${contractAddress} (${range})`);
        
        // Validate session for premium features
        if (!sessionId) {
          return res.status(401).json({
            success: false,
            error: 'Authentication required'
          });
        }

        const user = await this.oauthXService.getUserBySession(sessionId);
        if (!user) {
          return res.status(401).json({
            success: false,
            error: 'Invalid session'
          });
        }

        // Check premium status
        const premiumStatus = await this.oauthXService.db.getPremiumStatus(user.id);
        const isPremium = premiumStatus?.isPremium && new Date(premiumStatus.expiresAt) > new Date();
        
        if (!isPremium) {
          return res.status(403).json({
            success: false,
            error: 'premium_required',
            message: 'Hype Over Time Oracle AI is a Premium feature. Upgrade to access advanced trend analysis.'
          });
        }

        // Fetch hype snapshots
        const since = this.calculateSinceTimestamp(range);
        const hypeSnapshots = await this.hypeSnapshotService.getSnapshots(contractAddress, since);
        
        if (!hypeSnapshots || hypeSnapshots.length < 3) {
          return res.json({
            success: false,
            error: 'insufficient_data',
            message: `Insufficient hype data for analysis. Need at least 3 data points, got ${hypeSnapshots?.length || 0}.`,
            analysis: null
          });
        }

        // Perform comprehensive hype trend analysis
        const trendAnalysis = new (await import('./hypeTrendAnalysis.js')).default();
        const analysisResult = trendAnalysis.analyzeHypeTrend(hypeSnapshots, range);
        
        // Get token data for AI prediction
        const tokens = await this.getTokensFromCache();
        const tokenData = tokens.find(t => 
          t.contractAddress?.toLowerCase() === contractAddress.toLowerCase()
        );

        let aiPrediction = null;
        
        // Generate AI prediction if we have sufficient data
        if (analysisResult.success && tokenData) {
          try {
            const aiPredictionService = new (await import('./aiHypePredictionService.js')).default();
            await aiPredictionService.initializeCache();
            
            aiPrediction = await aiPredictionService.getPrediction(
              contractAddress,
              tokenData,
              hypeSnapshots,
              range,
              analysisResult
            );
          } catch (aiError) {
            console.error('❌ AI Prediction failed:', aiError);
            // Continue without AI prediction
          }
        }

        // Structure response to match frontend expectations
        const response = {
          success: true,
          contractAddress,
          symbol: tokenData?.symbol || 'Unknown',
          range,
          timestamp: new Date().toISOString(),
          dataPoints: hypeSnapshots.length,
          
          // Core analysis data
          analysis: {
            // Technical indicators with adaptive Bayesian data
            technicalIndicators: {
              ewma: analysisResult.analysis?.technicalIndicators?.ewma,
              derivative: analysisResult.analysis?.technicalIndicators?.derivative,
              
              // ✅ ADAPTIVE BAYESIAN CHANGE POINTS - This is what frontend needs!
              changePoints: {
                length: analysisResult.analysis?.technicalIndicators?.changePoints?.changePoints?.length || 0,
                hasRecentChange: analysisResult.analysis?.technicalIndicators?.changePoints?.hasRecentChange || false,
                changeDirection: analysisResult.analysis?.technicalIndicators?.changePoints?.changeDirection || 'stable',
                recentChangePoint: analysisResult.analysis?.technicalIndicators?.changePoints?.recentChangePoint,
                adaptiveThreshold: analysisResult.analysis?.technicalIndicators?.changePoints?.adaptiveThreshold,
                allChangePoints: analysisResult.analysis?.technicalIndicators?.changePoints?.changePoints || []
              }
            },
            
            // Current regime and prediction
            currentRegime: analysisResult.analysis?.regime,
            prediction: analysisResult.analysis?.prediction,
            
            // Forecast data for the 6-12h timeline
            forecast: analysisResult.analysis?.forecast,
            
            // AI-generated insights (if available)
            aiInsights: aiPrediction
          },
          
          // Confidence and metadata
          confidence: analysisResult.confidence || 0,
          metadata: {
            analysisVersion: '2.0-adaptive-bayesian',
            generatedAt: new Date().toISOString(),
            range,
            dataQuality: hypeSnapshots.length > 20 ? 'excellent' : 
                        hypeSnapshots.length > 10 ? 'good' : 'moderate'
          }
        };

        console.log(`✅ Hype Trend Analysis completed for ${contractAddress}: ${response.analysis.technicalIndicators.changePoints.length} change points detected`);
        
        res.json(response);
        
      } catch (error) {
        console.error('❌ Hype Trend Analysis failed:', error);
        res.status(500).json({
          success: false,
          error: 'Hype trend analysis failed',
          details: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });


    // Jupiter API Testing Endpoints
    this.app.get('/api/jupiter/test-known', async (req, res) => {
      try {
        const { default: jupiterApiService } = await import('./jupiterApiService.js');
        const isWorking = await jupiterApiService.testKnownToken();

        res.json({
          success: isWorking,
          message: isWorking ? 'Jupiter API is working correctly' : 'Jupiter API test failed',
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });

    this.app.get('/api/jupiter/raw/:contractAddress', async (req, res) => {
      try {
        const { contractAddress } = req.params;
        const { default: jupiterApiService } = await import('./jupiterApiService.js');

        console.log(`🔍 Getting raw Jupiter API data for ${contractAddress}`);
        const rawData = await jupiterApiService.getRawJupiterData(contractAddress);

        res.json({
          success: true,
          contractAddress,
          ...rawData,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          contractAddress: req.params.contractAddress,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });

    // Jupiter API Management
    this.app.post('/api/admin/jupiter/clear-cache', adminApiAuth, async (req, res) => {
      try {
        const { default: jupiterApiService } = await import('./jupiterApiService.js');
        jupiterApiService.clearCache();

        // Also reset rate limiting stats
        jupiterApiService.requestCount = 0;
        jupiterApiService.errorCount = 0;
        jupiterApiService.lastErrorTime = null;
        jupiterApiService.rateLimitDelay = 3000; // Reset to default

        res.json({
          success: true,
          message: 'Jupiter API cache and rate limiting stats cleared',
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });

    // Jupiter API Batch Refresh for specific contracts
    this.app.post('/api/admin/jupiter/refresh-batch', adminApiAuth, async (req, res) => {
      try {
        const { contractAddresses } = req.body;

        if (!contractAddresses || !Array.isArray(contractAddresses) || contractAddresses.length === 0) {
          return res.status(400).json({
            success: false,
            error: 'contractAddresses must be a non-empty array',
            timestamp: new Date().toISOString()
          });
        }

        if (contractAddresses.length > 100) {
          return res.status(400).json({
            success: false,
            error: 'Maximum 100 contract addresses allowed per batch',
            timestamp: new Date().toISOString()
          });
        }

        console.log(`🚀 Batch refreshing Jupiter data for ${contractAddresses.length} specific contracts...`);

        const { default: jupiterApiService } = await import('./jupiterApiService.js');
        const batchJupiterData = await jupiterApiService.getBatchTokenDetails(contractAddresses);

        const results = [];
        let successCount = 0;
        let errorCount = 0;

        for (let i = 0; i < contractAddresses.length; i++) {
          const contractAddress = contractAddresses[i];
          const jupiterData = batchJupiterData[i];

          try {
            if (jupiterData) {
              console.log(`✅ Jupiter data found for ${contractAddress.substring(0, 8)}: ${jupiterData.symbol}`);
              results.push({
                contractAddress,
                success: true,
                symbol: jupiterData.symbol,
                name: jupiterData.name,
                price: jupiterData.usdPrice,
                marketCap: jupiterData.mcap,
                hasJupiterData: true
              });
              successCount++;
            } else {
              console.log(`⚠️ No Jupiter data for ${contractAddress.substring(0, 8)}`);
              results.push({
                contractAddress,
                success: true,
                hasJupiterData: false,
                message: 'Token not found in Jupiter API'
              });
              successCount++; // Still successful, just no data
            }
          } catch (error) {
            console.error(`❌ Error processing ${contractAddress.substring(0, 8)}:`, error.message);
            results.push({
              contractAddress,
              success: false,
              error: error.message
            });
            errorCount++;
          }
        }

        res.json({
          success: true,
          message: `Batch Jupiter refresh completed for ${contractAddresses.length} contracts`,
          totalContracts: contractAddresses.length,
          successCount,
          errorCount,
          results,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        console.error('❌ Jupiter batch refresh error:', error);
        res.status(500).json({
          success: false,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });

    // EMERGENCY: Cache restore endpoint
    this.app.post('/api/admin/cache/emergency-restore', adminApiAuth, async (req, res) => {
      try {
        console.log('🚨 EMERGENCY CACHE RESTORE REQUESTED');
        
        const { tokens, source = 'local-backup' } = req.body;
        
        if (!Array.isArray(tokens) || tokens.length === 0) {
          return res.status(400).json({
            success: false,
            error: 'Invalid payload: tokens array required'
          });
        }
        
        console.log(`🔄 Restoring ${tokens.length} tokens from ${source}...`);
        
        // Backup current cache first
        const cachePath = this.persistentCachePath;
        const backupPath = cachePath.replace('.json', `-backup-${Date.now()}.json`);
        
        try {
          const currentData = await fs.readFile(cachePath, 'utf8');
          await fs.writeFile(backupPath, currentData);
          console.log(`✅ Current cache backed up to: ${backupPath}`);
        } catch (error) {
          console.log(`⚠️ No existing cache to backup: ${error.message}`);
        }
        
        // Load current tokens (if any) to merge with restored tokens
        let existingTokens = [];
        try {
          const data = await fs.readFile(cachePath, 'utf8');
          existingTokens = JSON.parse(data);
          console.log(`📊 Found ${existingTokens.length} existing tokens to merge`);
        } catch (error) {
          console.log(`📊 No existing tokens found, starting fresh`);
        }
        
        // Merge logic: prioritize restored tokens, keep unique existing ones
        const restoredMap = new Map();
        tokens.forEach(token => {
          if (token.contractAddress) {
            restoredMap.set(token.contractAddress.toLowerCase(), token);
          } else if (token.symbol) {
            restoredMap.set(`symbol:${token.symbol.toUpperCase()}`, token);
          }
        });
        
        const existingMap = new Map();
        existingTokens.forEach(token => {
          const key = token.contractAddress 
            ? token.contractAddress.toLowerCase()
            : `symbol:${token.symbol?.toUpperCase()}`;
          
          if (key && !restoredMap.has(key)) {
            existingMap.set(key, token);
          }
        });
        
        // Combine restored + unique existing
        const finalTokens = [
          ...tokens,
          ...Array.from(existingMap.values())
        ];
        
        // Add restore metadata
        const restoreTimestamp = new Date().toISOString();
        finalTokens.forEach(token => {
          if (!token._restoreInfo) {
            token._restoreInfo = {
              restoredAt: restoreTimestamp,
              source: source,
              emergencyRestore: true
            };
          }
        });
        
        // Save to production cache
        await this.saveTokensToCache(finalTokens);
        
        console.log(`✅ EMERGENCY RESTORE COMPLETE: ${finalTokens.length} tokens saved`);
        
        res.json({
          success: true,
          message: `Emergency restore completed successfully`,
          restored: {
            totalTokens: finalTokens.length,
            restoredTokens: tokens.length,
            existingKept: existingTokens.length,
            backupPath: backupPath,
            timestamp: restoreTimestamp
          }
        });
        
      } catch (error) {
        console.error('❌ Emergency restore failed:', error);
        res.status(500).json({
          success: false,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });

    // ===== ENHANCED BACKUP SYSTEM API ENDPOINTS =====
    
    // Get comprehensive backup status
    this.app.get('/api/admin/backup/status', adminApiAuth, async (req, res) => {
      try {
        if (!this.backupIntegration) {
          return res.status(503).json({
            success: false,
            error: 'Enhanced Backup System not initialized',
            timestamp: new Date().toISOString()
          });
        }

        const status = await this.backupIntegration.getStatus();
        res.json({
          success: true,
          timestamp: new Date().toISOString(),
          backup: status
        });
      } catch (error) {
        console.error('❌ Enhanced backup status failed:', error);
        res.status(500).json({
          success: false,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });

    // List all available snapshots
    this.app.get('/api/admin/backup/snapshots', adminApiAuth, async (req, res) => {
      try {
        if (!this.backupIntegration) {
          return res.status(503).json({
            success: false,
            error: 'Enhanced Backup System not initialized'
          });
        }

        const snapshots = await this.backupIntegration.getBackupService().listSnapshots();
        res.json({
          success: true,
          snapshots,
          total: snapshots.length,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('❌ List snapshots failed:', error);
        res.status(500).json({
          success: false,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });

    // Create manual snapshot
    this.app.post('/api/admin/backup/create', adminApiAuth, async (req, res) => {
      try {
        if (!this.backupIntegration) {
          return res.status(503).json({
            success: false,
            error: 'Enhanced Backup System not initialized'
          });
        }

        const { reason = 'Manual admin snapshot' } = req.body;
        const snapshot = await this.backupIntegration.createContextualBackup(reason);
        
        res.json({
          success: true,
          message: 'Enhanced snapshot created successfully',
          snapshot: {
            id: snapshot.snapshotId,
            timestamp: snapshot.timestamp,
            fileCount: snapshot.stats.fileCount,
            size: snapshot.stats.totalSize,
            duration: snapshot.duration
          },
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('❌ Manual snapshot creation failed:', error);
        res.status(500).json({
          success: false,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });

    // Restore from specific snapshot
    this.app.post('/api/admin/backup/restore', adminApiAuth, async (req, res) => {
      try {
        if (!this.backupIntegration) {
          return res.status(503).json({
            success: false,
            error: 'Enhanced Backup System not initialized'
          });
        }

        const { snapshotId } = req.body;
        if (!snapshotId) {
          return res.status(400).json({
            success: false,
            error: 'snapshotId is required'
          });
        }

        console.log(`🔄 Admin requested restoration from snapshot: ${snapshotId}`);
        const result = await this.backupIntegration.restoreWithRestart(snapshotId);
        
        res.json({
          success: true,
          message: 'Restoration completed successfully',
          restored: {
            snapshotId,
            timestamp: result.timestamp,
            fileCount: result.stats.fileCount,
            size: result.stats.totalSize
          },
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('❌ Snapshot restoration failed:', error);
        res.status(500).json({
          success: false,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });

    // Cache-only restore endpoint (restores only tokens-cache.json)
    this.app.post('/api/admin/backup/restore-cache', adminApiAuth, async (req, res) => {
      try {
        const { snapshotId } = req.body;
        
        if (!snapshotId) {
          return res.status(400).json({
            success: false,
            error: 'snapshotId is required'
          });
        }

        console.log(`🔄 Admin requested cache-only restoration from snapshot: ${snapshotId}`);
        
        // Find the snapshot directory
        const snapshotDir = path.join(this.backupIntegration.getBackupService().localCacheDir, snapshotId);
        
        if (!fsSync.existsSync(snapshotDir)) {
          return res.status(404).json({
            success: false,
            error: `Snapshot not found: ${snapshotId}`
          });
        }

        // Find tokens-cache.json in the snapshot
        const snapshotCachePath = path.join(snapshotDir, 'cache', 'tokens-cache.json');
        
        if (!fsSync.existsSync(snapshotCachePath)) {
          return res.status(404).json({
            success: false,
            error: 'tokens-cache.json not found in snapshot'
          });
        }

        // Read the snapshot cache data
        const snapshotCacheData = await fs.readFile(snapshotCachePath, 'utf8');
        const snapshotTokens = JSON.parse(snapshotCacheData);
        
        console.log(`📊 Found ${snapshotTokens.length} tokens in snapshot cache`);

        // Save to current cache (overwrite existing)
        await this.saveTokensToCache(snapshotTokens);
        
        console.log(`✅ Cache-only restore completed: ${snapshotTokens.length} tokens restored`);
        
        res.json({
          success: true,
          message: 'Cache-only restoration completed successfully',
          restored: {
            snapshotId,
            tokensRestored: snapshotTokens.length,
            timestamp: new Date().toISOString()
          }
        });
      } catch (error) {
        console.error('❌ Cache-only restoration failed:', error);
        res.status(500).json({
          success: false,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });

    // Get backup system health
    this.app.get('/api/admin/backup/health', adminApiAuth, async (req, res) => {
      try {
        if (!this.backupIntegration) {
          return res.status(503).json({
            success: false,
            error: 'Enhanced Backup System not initialized'
          });
        }

        const health = await this.backupIntegration.getBackupService().performHealthCheck();
        res.json({
          success: true,
          health,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('❌ Backup health check failed:', error);
        res.status(500).json({
          success: false,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });

    // Force cleanup old snapshots
    this.app.post('/api/admin/backup/cleanup', adminApiAuth, async (req, res) => {
      try {
        if (!this.backupIntegration) {
          return res.status(503).json({
            success: false,
            error: 'Enhanced Backup System not initialized'
          });
        }

        await this.backupIntegration.getBackupService().cleanupOldSnapshots();
        const snapshots = await this.backupIntegration.getBackupService().listSnapshots();
        
        res.json({
          success: true,
          message: 'Cleanup completed successfully',
          remainingSnapshots: snapshots.length,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('❌ Backup cleanup failed:', error);
        res.status(500).json({
          success: false,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });

    // Start/Stop backup service
    this.app.post('/api/admin/backup/service/:action', adminApiAuth, async (req, res) => {
      try {
        const { action } = req.params; // 'start' or 'stop'
        
        if (!this.backupIntegration) {
          return res.status(503).json({
            success: false,
            error: 'Enhanced Backup System not initialized'
          });
        }

        if (action === 'start') {
          // 🛡️ PREVENT MULTIPLE STARTS: Check if already running
          const status = await this.backupIntegration.getStatus();
          if (status.backup?.isRunning) {
            res.json({
              success: true,
              message: 'Enhanced Backup Service is already running',
              timestamp: new Date().toISOString()
            });
          } else {
            await this.backupIntegration.start();
            res.json({
              success: true,
              message: 'Enhanced Backup Service started',
              timestamp: new Date().toISOString()
            });
          }
        } else if (action === 'stop') {
          await this.backupIntegration.stop();
          res.json({
            success: true,
            message: 'Enhanced Backup Service stopped',
            timestamp: new Date().toISOString()
          });
        } else {
          res.status(400).json({
            success: false,
            error: 'Invalid action. Use "start" or "stop"'
          });
        }
      } catch (error) {
        console.error(`❌ Backup service ${req.params.action} failed:`, error);
        res.status(500).json({
          success: false,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });

    // DIAGNOSTIC: Cache investigation endpoint
    this.app.get('/api/admin/cache/diagnostic', adminApiAuth, async (req, res) => {
      try {
        console.log('🔍 PRODUCTION CACHE DIAGNOSTIC REQUESTED');
        
        const cachePath = this.persistentCachePath;
        const baseDir = this.oauthXService?.db?.baseDir || process.env.DATA_DIR || '/var/data/dgo';
        
        // Check file system state
        const fsStats = {};
        try {
          const stats = await fs.stat(cachePath);
          fsStats.exists = true;
          fsStats.size = stats.size;
          fsStats.modified = stats.mtime;
          fsStats.created = stats.birthtime;
        } catch (error) {
          fsStats.exists = false;
          fsStats.error = error.message;
        }
        
        // Check directory structure
        const dirCheck = {};
        try {
          const cacheDir = path.dirname(cachePath);
          const files = await fs.readdir(cacheDir);
          dirCheck.cacheDir = cacheDir;
          dirCheck.files = files;
        } catch (error) {
          dirCheck.error = error.message;
        }
        
        // Load and analyze cache content
        let cacheAnalysis = {};
        try {
          const data = await fs.readFile(cachePath, 'utf8');
          const tokens = JSON.parse(data);
          
          const stages = {};
          const sources = {};
          const dates = [];
          
          tokens.forEach(token => {
            const stage = token.stage || 'undefined';
            const source = token.source || 'undefined';
            stages[stage] = (stages[stage] || 0) + 1;
            sources[source] = (sources[source] || 0) + 1;
            
            if (token.createdAt) dates.push(new Date(token.createdAt));
            if (token.lastDiscoveredAt) dates.push(new Date(token.lastDiscoveredAt));
          });
          
          dates.sort((a, b) => a - b);
          
          cacheAnalysis = {
            totalTokens: tokens.length,
            stages,
            sources,
            oldestToken: dates[0]?.toISOString(),
            newestToken: dates[dates.length - 1]?.toISOString(),
            sampleTokens: tokens.slice(0, 5).map(t => ({
              symbol: t.symbol,
              stage: t.stage,
              source: t.source,
              created: t.createdAt,
              discovered: t.lastDiscoveredAt
            }))
          };
        } catch (error) {
          cacheAnalysis.error = error.message;
        }
        
        res.json({
          success: true,
          timestamp: new Date().toISOString(),
          environment: {
            DATA_DIR: process.env.DATA_DIR,
            NODE_ENV: process.env.NODE_ENV,
            baseDir,
            cachePath
          },
          filesystem: fsStats,
          directory: dirCheck,
          cache: cacheAnalysis,
          renderInfo: {
            instanceId: process.env.RENDER_INSTANCE_ID,
            serviceId: process.env.RENDER_SERVICE_ID,
            deployId: process.env.RENDER_GIT_COMMIT
          }
        });
        
      } catch (error) {
        console.error('❌ Cache diagnostic failed:', error);
        res.status(500).json({ 
          success: false, 
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });

    this.app.get('/api/admin/system/status', adminApiAuth, async (req, res) => {
      try {
        const processingStatus = this.tokenProcessor.getProcessingStatus();
        const tokens = await this.getTokensFromCache();
        
        // Count tokens by stage
        const tokenStats = {
          total: tokens.length,
          completed: tokens.filter(t => t.stage === 'completed').length,
          processing: tokens.filter(t => t.stage === 'processing').length,
          withTwitterData: tokens.filter(t => t.twitterData).length,
          withSocials: tokens.filter(t => t.socials).length
        };
        
        // Get Twitter API status
        let twitterStatus = {
          isRateLimited: false,
          hourlyRequests: 0,
          hourlyLimit: 500,
          dailyRequests: 0,
          dailyLimit: 2000
        };
        
        try {
          // Ensure social data service is initialized
          if (!this.tokenProcessor.socialDataService) {
            const { default: EnhancedSocialDataService } = await import('./enhancedSocialDataService.js');
            this.tokenProcessor.socialDataService = new EnhancedSocialDataService();
            await this.tokenProcessor.socialDataService.initialize();
          }
          
          const socialService = this.tokenProcessor.socialDataService;
          
          // Check if service and method exist before calling
          if (socialService && typeof socialService.getRateLimitStatus === 'function') {
            twitterStatus = socialService.getRateLimitStatus();
          } else {
            console.log('[🛡️ Admin] ⚠️ Twitter service method not available');
          }
        } catch (socialError) {
          console.log('[🛡️ Admin] ⚠️ Twitter service not available:', socialError.message);
        }
        
        res.json({
          success: true,
          system: {
            backend: 'Enhanced Backend v3.0',
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            timestamp: new Date().toISOString()
          },
          processing: processingStatus,
          tokens: tokenStats,
          twitter: {
            isRateLimited: twitterStatus.isRateLimited,
            hourlyRequests: `${twitterStatus.hourlyRequests}/${twitterStatus.hourlyLimit}`,
            dailyRequests: `${twitterStatus.dailyRequests}/${twitterStatus.dailyLimit}`
          }
        });
        
      } catch (error) {
        console.error('[🛡️ Admin] ❌ Error getting system status:', error);
        res.status(500).json({ error: 'Failed to get system status' });
      }
    });


    // ========================================
    // 📅 DAILY TWEET SERVICE ENDPOINTS
    // ========================================

    // Start Daily Tweet Service
    this.app.post('/api/admin/daily-tweets/start', adminApiAuth, async (req, res) => {
      try {
        const { 
          useLLM = true, 
          mode = 'random', // 'random' or 'fixed'
          hour, 
          minute,
          minPosts,
          maxPosts,
          activeStart,
          activeEnd,
          minHoursBetween
        } = req.body;

        if (!this.dailyTweetService) {
          return res.status(503).json({
            success: false,
            error: 'Daily Tweet Service not initialized (OpenAI may not be available)'
          });
        }

        // Set mode (random or fixed)
        this.dailyTweetService.setMode(mode);

        // Configure random mode if provided
        if (mode === 'random') {
          const randomConfig = {};
          if (minPosts !== undefined) randomConfig.minPosts = minPosts;
          if (maxPosts !== undefined) randomConfig.maxPosts = maxPosts;
          if (activeStart !== undefined) randomConfig.activeStart = activeStart;
          if (activeEnd !== undefined) randomConfig.activeEnd = activeEnd;
          if (minHoursBetween !== undefined) randomConfig.minHoursBetween = minHoursBetween;
          
          if (Object.keys(randomConfig).length > 0) {
            this.dailyTweetService.setRandomConfig(randomConfig);
          }
        }

        // Update fixed schedule time if provided
        if (mode === 'fixed' && hour !== undefined && minute !== undefined) {
          this.dailyTweetService.setScheduledTime(parseInt(hour), parseInt(minute));
        }

        // Start the service
        this.dailyTweetService.start(useLLM);

        res.json({
          success: true,
          message: 'Daily Tweet Service started',
          mode: this.dailyTweetService.randomMode ? 'random' : 'fixed',
          randomConfig: this.dailyTweetService.randomMode ? {
            postsPerDay: this.dailyTweetService.postsPerDay,
            activeHours: this.dailyTweetService.activeHours,
            minHoursBetween: this.dailyTweetService.minHoursBetweenPosts
          } : null,
          scheduledTime: !this.dailyTweetService.randomMode ? this.dailyTweetService.scheduledTime : null,
          useLLM,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('[🛡️ Admin] ❌ Failed to start Daily Tweet Service:', error.message);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Stop Daily Tweet Service
    this.app.post('/api/admin/daily-tweets/stop', adminApiAuth, (req, res) => {
      try {
        if (!this.dailyTweetService) {
          return res.status(503).json({
            success: false,
            error: 'Daily Tweet Service not initialized'
          });
        }

        this.dailyTweetService.stop();

        res.json({
          success: true,
          message: 'Daily Tweet Service stopped',
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('[🛡️ Admin] ❌ Failed to stop Daily Tweet Service:', error.message);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // ==================== Twitter Mention Service Routes ====================
    
    // Get mention service status
    this.app.get('/api/admin/twitter/mentions/status', adminApiAuth, async (req, res) => {
      try {
        if (!this.twitterMentionService) {
          return res.json({
            success: false,
            initialized: false,
            message: 'Twitter Mention Service not initialized'
          });
        }

        const status = {
          success: true,
          initialized: true,
          isRunning: this.twitterMentionService.isRunning,
          checkIntervalMinutes: this.twitterMentionService.checkIntervalMinutes,
          repliedCount: this.twitterMentionService.repliedMentions.size,
          lastCheckedMentionId: this.twitterMentionService.lastCheckedMentionId || null
        };
        res.json(status);
      } catch (error) {
        console.error('[🛡️ Admin] ❌ Mention status error:', error.message);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Start mention service
    this.app.post('/api/admin/twitter/mentions/start', adminApiAuth, async (req, res) => {
      try {
        if (!this.twitterMentionService) {
          return res.status(503).json({
            success: false,
            error: 'Twitter Mention Service not initialized'
          });
        }

        await this.twitterMentionService.start();
        res.json({ success: true, message: 'Mention service started' });
      } catch (error) {
        console.error('[🛡️ Admin] ❌ Failed to start mention service:', error.message);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Stop mention service
    this.app.post('/api/admin/twitter/mentions/stop', adminApiAuth, async (req, res) => {
      try {
        if (!this.twitterMentionService) {
          return res.status(503).json({
            success: false,
            error: 'Twitter Mention Service not initialized'
          });
        }

        this.twitterMentionService.stop();
        res.json({ success: true, message: 'Mention service stopped' });
      } catch (error) {
        console.error('[🛡️ Admin] ❌ Failed to stop mention service:', error.message);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Manually check mentions now
    this.app.post('/api/admin/twitter/mentions/check', adminApiAuth, async (req, res) => {
      try {
        if (!this.twitterMentionService) {
          return res.status(503).json({
            success: false,
            error: 'Twitter Mention Service not initialized'
          });
        }

        await this.twitterMentionService.checkMentions();
        res.json({ 
          success: true, 
          message: 'Checked mentions'
        });
      } catch (error) {
        console.error('[🛡️ Admin] ❌ Failed to check mentions:', error.message);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Post a promotional tweet immediately (for testing)
    this.app.post('/api/admin/daily-tweets/post-now', adminApiAuth, async (req, res) => {
      try {
        const { useLLM = true, contentType = 'random' } = req.body;

        if (!this.dailyTweetService) {
          return res.status(503).json({
            success: false,
            error: 'Daily Tweet Service not initialized (OpenAI may not be available)'
          });
        }

        console.log(`[🛡️ Admin] 📤 Post Now request - contentType: ${contentType}`);
        const result = await this.dailyTweetService.postNow(contentType);

        res.json({
          success: result.success,
          message: result.success ? 'Tweet posted successfully' : 'Failed to post tweet',
          tweetId: result.tweetId,
          content: result.content,
          error: result.error,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('[🛡️ Admin] ❌ Failed to post promotional tweet:', error.message);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Manual post endpoint
    this.app.post('/api/admin/daily-tweets/manual-post', adminApiAuth, async (req, res) => {
      try {
        const { text, media } = req.body;

        if (!text || !text.trim()) {
          return res.status(400).json({
            success: false,
            error: 'Tweet text is required'
          });
        }

        if (text.length > 280) {
          return res.status(400).json({
            success: false,
            error: 'Tweet text exceeds 280 characters'
          });
        }

        // Validate media if provided
        if (media && media.length > 0) {
          if (!Array.isArray(media)) {
            return res.status(400).json({
              success: false,
              error: 'Media must be an array of URLs'
            });
          }

          if (media.length > 4) {
            return res.status(400).json({
              success: false,
              error: 'Maximum 4 media items allowed per tweet'
            });
          }

          // Validate each media URL
          for (const mediaItem of media) {
            if (!mediaItem.url || typeof mediaItem.url !== 'string') {
              return res.status(400).json({
                success: false,
                error: 'Each media item must have a valid URL'
              });
            }

            const urlPattern = /^https?:\/\/.+/i;
            if (!urlPattern.test(mediaItem.url)) {
              return res.status(400).json({
                success: false,
                error: 'Media URLs must start with http:// or https://'
              });
            }
          }
        }

        console.log(`[🛡️ Admin] 📝 Manual post request: "${text.substring(0, 50)}..."`);
        if (media && media.length > 0) {
          console.log(`[🛡️ Admin] 📷 With ${media.length} media item(s)`);
        }

        // Check if daily tweet service is initialized
        if (!this.dailyTweetService || !this.dailyTweetService.tweetPostingService) {
          return res.status(503).json({
            success: false,
            error: 'Tweet posting service not initialized. Please try again in a moment.'
          });
        }

        // Post the tweet using appropriate TweetAPI service method
        let tweetResult;
        if (media && media.length > 0) {
          const mediaUrls = media.map(item => item.url);
          tweetResult = await this.dailyTweetService.tweetPostingService.postTweetWithMedia(text.trim(), mediaUrls);
        } else {
          tweetResult = await this.dailyTweetService.tweetPostingService.postTweet(text.trim());
        }

        if (!tweetResult.success) {
          return res.status(500).json({
            success: false,
            error: tweetResult.error || 'Failed to post tweet'
          });
        }

        // Store in Opinion DB for intelligence tracking
        if (this.opinionDatabase) {
          try {
            const opinionData = {
              text: text.trim(),
              marketContext: 'DGO insight',
              sentiment: 'neutral',
              tweetId: tweetResult.tweet_id,
              type: 'insight',
              timestamp: new Date().toISOString()
            };

            // Add image URLs if media was included
            if (media && media.length > 0) {
              opinionData.images = media.map(item => ({
                url: item.url,
                format: this.getImageFormatFromUrl(item.url),
                storedAt: new Date().toISOString(),
                tweetId: tweetResult.tweet_id
              }));
            }

            await this.opinionDatabase.storeOpinion(opinionData);
            console.log(`[🛡️ Admin] 💾 Manual post stored in Opinion DB as insight`);
            if (media && media.length > 0) {
              console.log(`[🛡️ Admin] 📷 Image URLs stored for future DALL-E integration`);
            }
          } catch (error) {
            console.error('[🛡️ Admin] ❌ Failed to store manual post in Opinion DB:', error.message);
            // Don't fail the request if Opinion DB storage fails
          }
        }

        res.json({
          success: true,
          tweet_id: tweetResult.tweet_id,
          url: tweetResult.url,
          text: tweetResult.text,
          author: tweetResult.author,
          created_at: tweetResult.created_at,
          media_count: tweetResult.media_count || 0,
          message: 'Manual tweet posted successfully and stored in Opinion DB'
        });

      } catch (error) {
        console.error('[🛡️ Admin] ❌ Manual post error:', error.message);
        res.status(500).json({ 
          success: false, 
          error: error.message 
        });
      }
    });

    // Get Daily Tweet Service status
    this.app.get('/api/admin/daily-tweets/status', adminApiAuth, (req, res) => {
      try {
        if (!this.dailyTweetService) {
          return res.json({
            initialized: false,
            running: false,
            message: 'Daily Tweet Service not initialized (OpenAI may not be available)'
          });
        }

        // Use stored nextPostTime to avoid recalculating (which changes the random time)
        const nextPost = this.dailyTweetService.nextPostTime;

        res.json({
          initialized: true,
          running: this.dailyTweetService.isRunning,
          mode: this.dailyTweetService.randomMode ? 'random' : 'fixed',
          randomConfig: this.dailyTweetService.randomMode ? {
            postsPerDay: this.dailyTweetService.postsPerDay,
            activeHours: this.dailyTweetService.activeHours,
            minHoursBetween: this.dailyTweetService.minHoursBetweenPosts
          } : null,
          scheduledTime: !this.dailyTweetService.randomMode ? this.dailyTweetService.scheduledTime : null,
          todayStats: {
            postsToday: this.dailyTweetService.todayPostCount,
            targetPosts: this.dailyTweetService.todayTargetPosts || null,
            recentPosts: this.dailyTweetService.recentPosts.map(p => ({
              timestamp: new Date(p.timestamp).toISOString(),
              tweetId: p.tweetId,
              url: `https://twitter.com/dgnoracle/status/${p.tweetId}`
            }))
          },
          nextPostAt: nextPost,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('[🛡️ Admin] ❌ Failed to get Daily Tweet Service status:', error.message);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // ========================================
    // 🔍 CRYPTO ACCOUNT TRACKING ENDPOINTS
    // ========================================

    // Start crypto account tracking
    this.app.post('/api/admin/crypto-tracking/start', adminApiAuth, async (req, res) => {
      try {
        if (!this.twitterMentionService) {
          return res.status(503).json({
            success: false,
            error: 'Twitter Mention Service not initialized'
          });
        }

        await this.twitterMentionService.start();
        
        res.json({
          success: true,
          message: 'Crypto account tracking started via unified WebSocket',
          accounts: this.twitterMentionService.getTrackedAccounts()
        });

      } catch (error) {
        console.error('[🛡️ Admin] ❌ Failed to start crypto tracking:', error.message);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Stop crypto account tracking
    this.app.post('/api/admin/crypto-tracking/stop', adminApiAuth, async (req, res) => {
      try {
        if (!this.twitterMentionService) {
          return res.status(503).json({
            success: false,
            error: 'Twitter Mention Service not initialized'
          });
        }

        await this.twitterMentionService.stop();
        
        res.json({
          success: true,
          message: 'Crypto account tracking stopped'
        });

      } catch (error) {
        console.error('[🛡️ Admin] ❌ Failed to stop crypto tracking:', error.message);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get crypto tracking status
    this.app.get('/api/admin/crypto-tracking/status', adminApiAuth, (req, res) => {
      try {
        if (!this.twitterMentionService) {
          return res.status(503).json({
            success: false,
            error: 'Twitter Mention Service not initialized'
          });
        }

        const isRunning = this.twitterMentionService.isRunning;
        const trackedAccounts = this.twitterMentionService.getTrackedAccounts();
        const dbStats = this.cryptoTrackingDatabase.getStats();
        
        res.json({
          success: true,
          isRunning: isRunning,
          isConnected: isRunning, // WebSocket connection status
          totalTweets: dbStats.totalTweets,
          accounts: trackedAccounts,
          sentimentCounts: dbStats.sentimentCounts,
          topicCounts: dbStats.topicCounts,
          lastTweet: dbStats.newestTweet
        });

      } catch (error) {
        console.error('[🛡️ Admin] ❌ Failed to get crypto tracking status:', error.message);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get tracked tweets
    this.app.get('/api/admin/crypto-tracking/tweets', adminApiAuth, (req, res) => {
      try {
        const { sentiment, topic, limit = 50 } = req.query;
        
        if (!this.cryptoTrackingDatabase) {
          return res.status(503).json({
            success: false,
            error: 'Crypto Tracking Database not initialized'
          });
        }

        const searchCriteria = {
          sentiment: sentiment,
          topics: topic ? [topic] : undefined,
          limit: parseInt(limit)
        };

        const tweets = this.cryptoTrackingDatabase.searchTrackedTweets(searchCriteria);
        
        res.json({
          success: true,
          tweets: tweets,
          count: tweets.length,
          filters: { sentiment, topic, limit }
        });

      } catch (error) {
        console.error('[🛡️ Admin] ❌ Failed to get crypto tracking tweets:', error.message);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get database statistics
    this.app.get('/api/admin/crypto-tracking/database/stats', adminApiAuth, (req, res) => {
      try {
        if (!this.cryptoTrackingDatabase) {
          return res.status(503).json({
            success: false,
            error: 'Crypto Tracking Database not initialized'
          });
        }

        const stats = this.cryptoTrackingDatabase.getStats();
        
        res.json({
          success: true,
          stats: stats
        });

      } catch (error) {
        console.error('[🛡️ Admin] ❌ Failed to get crypto tracking database stats:', error.message);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Cleanup duplicate tweets
    this.app.post('/api/admin/crypto-tracking/database/cleanup', adminApiAuth, async (req, res) => {
      try {
        if (!this.cryptoTrackingDatabase) {
          return res.status(503).json({
            success: false,
            error: 'Crypto Tracking Database not initialized'
          });
        }

        const result = await this.cryptoTrackingDatabase.cleanupDuplicates();
        
        res.json({
          success: true,
          message: `Cleanup completed: ${result.duplicatesRemoved} duplicates removed, ${result.uniqueTweets} unique tweets remaining`,
          result: result
        });

      } catch (error) {
        console.error('[🛡️ Admin] ❌ Failed to cleanup crypto tracking database:', error.message);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Clear all tweets permanently
    this.app.post('/api/admin/crypto-tracking/database/clear-all', adminApiAuth, async (req, res) => {
      try {
        if (!this.cryptoTrackingDatabase) {
          return res.status(503).json({
            success: false,
            error: 'Crypto Tracking Database not initialized'
          });
        }

        const result = await this.cryptoTrackingDatabase.clearAllData();
        
        res.json({
          success: true,
          message: result.message,
          result: result
        });

      } catch (error) {
        console.error('[🛡️ Admin] ❌ Failed to clear all crypto tracking data:', error.message);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Clear all tracked accounts permanently
    this.app.post('/api/admin/crypto-tracking/accounts/clear-all', adminApiAuth, async (req, res) => {
      try {
        if (!this.twitterMentionService) {
          return res.status(503).json({
            success: false,
            error: 'Twitter Mention Service not initialized'
          });
        }

        const result = await this.twitterMentionService.clearAllTrackedAccounts();
        
        res.json({
          success: result.success,
          message: result.message,
          result: result
        });

      } catch (error) {
        console.error('[🛡️ Admin] ❌ Failed to clear all tracked accounts:', error.message);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Search tracked tweets
    this.app.get('/api/admin/crypto-tracking/database/search', adminApiAuth, (req, res) => {
      try {
        const { 
          sentiment, 
          topics, 
          author, 
          timeframe, 
          minConfidence, 
          startDate, 
          endDate, 
          limit = 50 
        } = req.query;
        
        if (!this.cryptoTrackingDatabase) {
          return res.status(503).json({
            success: false,
            error: 'Crypto Tracking Database not initialized'
          });
        }

        const criteria = {
          sentiment,
          topics: topics ? topics.split(',') : undefined,
          author,
          timeframe,
          minConfidence: minConfidence ? parseFloat(minConfidence) : undefined,
          startDate,
          endDate,
          limit: parseInt(limit)
        };

        const results = this.cryptoTrackingDatabase.searchTrackedTweets(criteria);
        
        res.json({
          success: true,
          tweets: results,
          count: results.length,
          criteria: criteria
        });

      } catch (error) {
        console.error('[🛡️ Admin] ❌ Failed to search crypto tracking database:', error.message);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get sentiment trends
    this.app.get('/api/admin/crypto-tracking/sentiment-trends', adminApiAuth, (req, res) => {
      try {
        const { days, hours } = req.query;
        
        // Convert hours to days if provided
        let daysToUse = days ? parseInt(days) : (hours ? Math.ceil(parseInt(hours) / 24) : 1);
        
        // If hours is provided and less than 24, use hours directly
        if (hours && parseInt(hours) < 24) {
          daysToUse = parseInt(hours) / 24; // Convert to fractional days
        }
        
        if (!this.cryptoTrackingDatabase) {
          return res.status(503).json({
            success: false,
            error: 'Crypto Tracking Database not initialized'
          });
        }

        const trends = this.cryptoTrackingDatabase.getSentimentTrends(daysToUse);
        
        res.json({
          success: true,
          trends: trends,
          timeframe: hours ? `${hours} hours` : `${daysToUse} days`
        });

      } catch (error) {
        console.error('[🛡️ Admin] ❌ Failed to get sentiment trends:', error.message);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get account metrics
    this.app.get('/api/admin/crypto-tracking/account/:username/metrics', adminApiAuth, (req, res) => {
      try {
        const { username } = req.params;
        
        if (!this.cryptoTrackingDatabase) {
          return res.status(503).json({
            success: false,
            error: 'Crypto Tracking Database not initialized'
          });
        }

        const metrics = this.cryptoTrackingDatabase.getAccountMetrics(username);
        
        res.json({
          success: true,
          metrics: metrics
        });

      } catch (error) {
        console.error('[🛡️ Admin] ❌ Failed to get account metrics:', error.message);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Add crypto account to tracking
    this.app.post('/api/admin/crypto-tracking/add-account', adminApiAuth, async (req, res) => {
      try {
        const { username, displayName, tier } = req.body;
        
        if (!username) {
          return res.status(400).json({
            success: false,
            error: 'Username is required'
          });
        }

        if (!this.twitterMentionService) {
          return res.status(503).json({
            success: false,
            error: 'Twitter Mention Service not initialized'
          });
        }

        console.log(`[🛡️ Admin] ➕ Adding crypto account @${username} to tracking...`);
        
        const result = await this.twitterMentionService.addCryptoAccount(username, displayName || username, tier || 'tier1');
        
        res.json({
          success: result.success,
          message: result.message
        });

      } catch (error) {
        console.error('[🛡️ Admin] ❌ Failed to add crypto account:', error.message);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Remove crypto account from tracking
    this.app.post('/api/admin/crypto-tracking/remove-account', adminApiAuth, async (req, res) => {
      try {
        const { username } = req.body;
        
        if (!username) {
          return res.status(400).json({
            success: false,
            error: 'Username is required'
          });
        }

        if (!this.twitterMentionService) {
          return res.status(503).json({
            success: false,
            error: 'Twitter Mention Service not initialized'
          });
        }

        console.log(`[🛡️ Admin] ➖ Removing crypto account @${username} from tracking...`);
        
        const result = await this.twitterMentionService.removeCryptoAccount(username);
        
        res.json({
          success: result.success,
          message: result.message
        });

      } catch (error) {
        console.error('[🛡️ Admin] ❌ Failed to remove crypto account:', error.message);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get tracked accounts list
    this.app.get('/api/admin/crypto-tracking/accounts', adminApiAuth, (req, res) => {
      try {
        if (!this.twitterMentionService) {
          return res.status(503).json({
            success: false,
            error: 'Twitter Mention Service not initialized'
          });
        }

        const accounts = this.twitterMentionService.getTrackedAccounts();
        
        res.json({
          success: true,
          accounts: accounts
        });

      } catch (error) {
        console.error('[🛡️ Admin] ❌ Failed to get tracked accounts:', error.message);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // ===== PUBLIC TRENDING TOPICS ENDPOINTS =====
    
    /**
     * Get latest trending topics (public endpoint)
     */
    this.app.get('/api/topics/trending', async (req, res) => {
      try {
        const { limit = 20, category, days = 7 } = req.query;
        
        if (!this.topicTrendingDatabase) {
          return res.status(503).json({
            success: false,
            error: 'Topic Trending Database not initialized'
          });
        }

        let topics;
        if (category) {
          topics = this.topicTrendingDatabase.getTrendingTopicsByCategory(category, parseInt(limit));
        } else {
          topics = this.topicTrendingDatabase.getTrendingTopicsByTimeframe(parseInt(days), parseInt(limit));
        }

        res.json({
          success: true,
          data: topics,
          meta: {
            limit: parseInt(limit),
            category: category || 'all',
            days: parseInt(days),
            total: topics.length
          }
        });

      } catch (error) {
        console.error('❌ [PUBLIC TOPICS] Error getting trending topics:', error.message);
        res.status(500).json({
          success: false,
          error: 'Failed to fetch trending topics'
        });
      }
    });

    /**
     * Get trending topics by category (public endpoint)
     */
    this.app.get('/api/topics/categories', async (req, res) => {
      try {
        const { limit = 10 } = req.query;
        
        if (!this.topicTrendingDatabase) {
          return res.status(503).json({
            success: false,
            error: 'Topic Trending Database not initialized'
          });
        }

        const categories = this.topicTrendingDatabase.getTopCategories(parseInt(limit));

        res.json({
          success: true,
          data: categories,
          meta: {
            limit: parseInt(limit),
            total: categories.length
          }
        });

      } catch (error) {
        console.error('❌ [PUBLIC TOPICS] Error getting categories:', error.message);
        res.status(500).json({
          success: false,
          error: 'Failed to fetch topic categories'
        });
      }
    });

    /**
     * Get trending statistics (public endpoint)
     */
    this.app.get('/api/topics/statistics', async (req, res) => {
      try {
        if (!this.topicTrendingDatabase) {
          return res.status(503).json({
            success: false,
            error: 'Topic Trending Database not initialized'
          });
        }

        const stats = this.topicTrendingDatabase.getTrendingStatistics();

        res.json({
          success: true,
          data: stats
        });

      } catch (error) {
        console.error('❌ [PUBLIC TOPICS] Error getting statistics:', error.message);
        res.status(500).json({
          success: false,
          error: 'Failed to fetch topic statistics'
        });
      }
    });

    // ===== ADMIN TOP TOPICS ANALYSIS ENDPOINTS =====
    
    /**
     * Analyze trending topics from tracked tweets
     */
    this.app.post('/api/admin/top-topics/analyze', adminApiAuth, async (req, res) => {
      try {
        const { timeframe = '7d', limit = 50 } = req.body;
        
        if (!this.topicAnalysisService || !this.cryptoTrackingDatabase) {
          return res.status(503).json({
            success: false,
            error: 'Topic Analysis services not initialized'
          });
        }

        console.log(`🔥 [TOP TOPICS] Starting trending topics analysis (${timeframe})`);
        
        // Get tweets from the specified timeframe
        const tweets = await this.cryptoTrackingDatabase.getTweetsByTimeframe(timeframe);
        
        if (tweets.length === 0) {
          return res.json({
            success: true,
            message: 'No tweets found for analysis',
            analysis: {
              timeframe,
              totalTweets: 0,
              topics: [],
              analyzedAt: new Date().toISOString()
            }
          });
        }

        // Analyze trending topics
        const trendingTopics = await this.topicAnalysisService.analyzeTrendingTopics(tweets, timeframe);
        
        // Store the analysis
        const analysis = {
          timeframe,
          totalTweets: tweets.length,
          topics: trendingTopics.slice(0, limit)
        };
        
        await this.topicTrendingDatabase.storeTrendingTopics(analysis);
        
        console.log(`✅ [TOP TOPICS] Analysis complete: ${trendingTopics.length} topics identified`);
        
        res.json({
          success: true,
          analysis: {
            ...analysis,
            analyzedAt: new Date().toISOString()
          }
        });

      } catch (error) {
        console.error('[🛡️ Admin] ❌ Failed to analyze trending topics:', error.message);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    /**
     * Get latest trending topics
     */
    this.app.get('/api/admin/top-topics/latest', adminApiAuth, (req, res) => {
      try {
        const { limit = 20, category, days = 7 } = req.query;
        
        if (!this.topicTrendingDatabase) {
          return res.status(503).json({
            success: false,
            error: 'Topic Trending Database not initialized'
          });
        }

        // Get topics from the last N days
        const topics = this.topicTrendingDatabase.getTrendingTopicsByTimeframe(parseInt(days), parseInt(limit));
        
        res.json({
          success: true,
          topics,
          timeframe: `${days} days`,
          total: topics.length
        });

      } catch (error) {
        console.error('[🛡️ Admin] ❌ Failed to get latest trending topics:', error.message);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    /**
     * Get trending topics by category
     */
    this.app.get('/api/admin/top-topics/categories', adminApiAuth, (req, res) => {
      try {
        const { limit = 10 } = req.query;
        
        if (!this.topicTrendingDatabase) {
          return res.status(503).json({
            success: false,
            error: 'Topic Trending Database not initialized'
          });
        }

        const categories = this.topicTrendingDatabase.getTopCategories(parseInt(limit));
        
        res.json({
          success: true,
          categories,
          totalCategories: categories.length
        });

      } catch (error) {
        console.error('[🛡️ Admin] ❌ Failed to get trending categories:', error.message);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    /**
     * Get topic trend over time
     */
    this.app.get('/api/admin/top-topics/trend/:topic', adminApiAuth, (req, res) => {
      try {
        const { topic } = req.params;
        const { days = 7 } = req.query;
        
        if (!this.topicTrendingDatabase) {
          return res.status(503).json({
            success: false,
            error: 'Topic Trending Database not initialized'
          });
        }

        const trend = this.topicTrendingDatabase.getTopicTrend(topic, parseInt(days));
        
        res.json({
          success: true,
          topic,
          trend,
          timeframe: `${days} days`,
          dataPoints: trend.length
        });

      } catch (error) {
        console.error('[🛡️ Admin] ❌ Failed to get topic trend:', error.message);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    /**
     * Get topic insights using AI
     */
    this.app.get('/api/admin/top-topics/insights/:topic', adminApiAuth, async (req, res) => {
      try {
        const { topic } = req.params;
        const { timeframe = '7d' } = req.query;
        
        if (!this.topicAnalysisService || !this.topicTrendingDatabase) {
          return res.status(503).json({
            success: false,
            error: 'Topic Analysis services not initialized'
          });
        }

        // Check if we have cached insights
        let insights = this.topicTrendingDatabase.getTopicInsights(topic);
        
        // If no cached insights or they're older than 1 hour, generate new ones
        if (!insights || this.isInsightStale(insights.generatedAt)) {
          console.log(`🔍 [TOP TOPICS] Generating fresh insights for: ${topic}`);
          insights = await this.topicAnalysisService.getTopicInsights(topic, timeframe);
          
          if (insights) {
            await this.topicTrendingDatabase.storeTopicInsights(topic, insights);
          }
        } else {
          console.log(`📋 [TOP TOPICS] Using cached insights for: ${topic}`);
        }
        
        res.json({
          success: true,
          topic,
          insights: insights || null,
          cached: insights && !this.isInsightStale(insights.generatedAt)
        });

      } catch (error) {
        console.error('[🛡️ Admin] ❌ Failed to get topic insights:', error.message);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    /**
     * Search topics
     */
    this.app.get('/api/admin/top-topics/search', adminApiAuth, (req, res) => {
      try {
        const { q, limit = 20 } = req.query;
        
        if (!q) {
          return res.status(400).json({
            success: false,
            error: 'Search query is required'
          });
        }
        
        if (!this.topicTrendingDatabase) {
          return res.status(503).json({
            success: false,
            error: 'Topic Trending Database not initialized'
          });
        }

        const results = this.topicTrendingDatabase.searchTopics(q, parseInt(limit));
        
        res.json({
          success: true,
          query: q,
          results,
          totalResults: results.length
        });

      } catch (error) {
        console.error('[🛡️ Admin] ❌ Failed to search topics:', error.message);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    /**
     * Get topic correlations
     */
    this.app.get('/api/admin/top-topics/correlations/:topic', adminApiAuth, (req, res) => {
      try {
        const { topic } = req.params;
        const { limit = 10 } = req.query;
        
        if (!this.topicTrendingDatabase) {
          return res.status(503).json({
            success: false,
            error: 'Topic Trending Database not initialized'
          });
        }

        const correlations = this.topicTrendingDatabase.getTopicCorrelations(topic, parseInt(limit));
        
        res.json({
          success: true,
          topic,
          correlations,
          totalCorrelations: correlations.length
        });

      } catch (error) {
        console.error('[🛡️ Admin] ❌ Failed to get topic correlations:', error.message);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    /**
     * Get trending statistics
     */
    this.app.get('/api/admin/top-topics/statistics', adminApiAuth, (req, res) => {
      try {
        if (!this.topicTrendingDatabase) {
          return res.status(503).json({
            success: false,
            error: 'Topic Trending Database not initialized'
          });
        }

        const statistics = this.topicTrendingDatabase.getTrendingStatistics();
        
        res.json({
          success: true,
          statistics
        });

      } catch (error) {
        console.error('[🛡️ Admin] ❌ Failed to get trending statistics:', error.message);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // ========================================
    // 🌐 PUBLIC TRENDING TOPICS ENDPOINTS (No Auth Required)
    // ========================================

    /**
     * Get latest trending topics (public endpoint)
     */
    this.app.get('/api/trending-topics/latest', async (req, res) => {
      try {
        const { limit = 20, category, days = 7, hours, forceRefresh = false } = req.query;
        
        // 🎯 NEW: Force refresh if requested
        if (forceRefresh === 'true') {
          console.log('[🌐 Public] 🔄 Force refreshing trending topics...');
          await this.runTrendingTopicsAnalysis();
        }
        
        if (!this.topicTrendingDatabase) {
          return res.status(503).json({
            success: false,
            error: 'Topic Trending Database not initialized'
          });
        }

        let topics;
        
        // 🎯 NEW: Support hours-based filtering for dynamic updates
        if (hours) {
          // Calculate time cutoff based on hours
          const cutoffTime = new Date(Date.now() - parseInt(hours) * 60 * 60 * 1000);
          
          // Get ALL posts from KOLService
          const allPosts = this.kolService?.getPosts() || [];
          
          // Filter posts within the hours window
          const recentPosts = allPosts.filter(post => 
            new Date(post.created_at) >= cutoffTime
          );
          
          console.log(`[🌐 Public] Filtering ${recentPosts.length} posts from last ${hours} hours`);
          
          // Count topics
          const topicCounts = {};
          recentPosts.forEach(post => {
            if (post.topics && Array.isArray(post.topics)) {
              post.topics.forEach(topic => {
                topicCounts[topic] = (topicCounts[topic] || 0) + 1;
              });
            }
          });
          
          // Convert to trending topics format with freshness
          topics = Object.entries(topicCounts)
            .map(([topic, count]) => ({
              topic,
              frequency: count,
              lastSeen: new Date().toISOString()
            }))
            .sort((a, b) => b.frequency - a.frequency)
            .slice(0, parseInt(limit));
        } else if (category) {
          topics = this.topicTrendingDatabase.getTrendingTopicsByCategory(category, parseInt(limit));
        } else {
          topics = this.topicTrendingDatabase.getTrendingTopicsByTimeframe(parseInt(days), parseInt(limit));
        }
        
        res.json({
          success: true,
          topics,
          timeframe: hours ? `${hours} hours` : `${days} days`,
          category: category || 'all',
          total: topics.length,
          lastUpdated: new Date().toISOString()
        });

      } catch (error) {
        console.error('[🌐 Public] ❌ Failed to get trending topics:', error.message);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    /**
     * Get trending topics by category (public endpoint)
     */
    this.app.get('/api/trending-topics/categories', (req, res) => {
      try {
        const { limit = 10 } = req.query;
        
        if (!this.topicTrendingDatabase) {
          return res.status(503).json({
            success: false,
            error: 'Topic Trending Database not initialized'
          });
        }

        const categories = this.topicTrendingDatabase.getTopCategories(parseInt(limit));
        
        res.json({
          success: true,
          categories,
          total: categories.length
        });

      } catch (error) {
        console.error('[🌐 Public] ❌ Failed to get trending categories:', error.message);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    /**
     * Get topic trend over time (public endpoint)
     */
    this.app.get('/api/trending-topics/trend/:topic', (req, res) => {
      try {
        const { topic } = req.params;
        const { days = 7 } = req.query;
        
        if (!this.topicTrendingDatabase) {
          return res.status(503).json({
            success: false,
            error: 'Topic Trending Database not initialized'
          });
        }

        const trend = this.topicTrendingDatabase.getTopicTrend(topic, parseInt(days));
        
        res.json({
          success: true,
          topic,
          trend,
          timeframe: `${days} days`
        });

      } catch (error) {
        console.error('[🌐 Public] ❌ Failed to get topic trend:', error.message);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    /**
     * Search topics (public endpoint)
     */
    this.app.get('/api/trending-topics/search', (req, res) => {
      try {
        const { q, limit = 20 } = req.query;
        
        if (!q) {
          return res.status(400).json({
            success: false,
            error: 'Query parameter "q" is required'
          });
        }
        
        if (!this.topicTrendingDatabase) {
          return res.status(503).json({
            success: false,
            error: 'Topic Trending Database not initialized'
          });
        }

        const results = this.topicTrendingDatabase.searchTopics(q, parseInt(limit));
        
        res.json({
          success: true,
          query: q,
          results,
          total: results.length
        });

      } catch (error) {
        console.error('[🌐 Public] ❌ Failed to search topics:', error.message);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    /**
     * Manual trigger for trending topics analysis (public endpoint for testing)
     */
    this.app.post('/api/trending-topics/analyze', async (req, res) => {
      try {
        console.log('[🌐 Public] 🔥 Manual trending topics analysis triggered');
        await this.runTrendingTopicsAnalysis();
        
        res.json({
          success: true,
          message: 'Trending topics analysis completed successfully'
        });

      } catch (error) {
        console.error('[🌐 Public] ❌ Manual trending topics analysis failed:', error.message);
        res.status(500).json({ 
          success: false, 
          error: error.message 
        });
      }
    });

    // ========================================
    // 🎯 PREDICTION ACCURACY ANALYSIS ENDPOINTS (DISABLED - UNUSED & COSTLY)
    // ========================================
    
    // REMOVED: All prediction endpoints disabled to save costs
    // These services were not being used and caused unnecessary OpenAI API calls
    /*

    // Get prediction accuracy for specific author
    this.app.get('/api/admin/prediction-accuracy/:username', adminApiAuth, async (req, res) => {
      try {
        const { username } = req.params;
        
        if (!this.predictionTrackingDatabase) {
          return res.status(503).json({
            success: false,
            error: 'Prediction Tracking Database not initialized'
          });
        }

        const predictions = this.predictionTrackingDatabase.getPredictionsByAuthor(username);
        const accuracyMetrics = this.accuracyCalculationService.calculateAuthorAccuracy(predictions);
        const accuracyReport = this.accuracyCalculationService.generateAccuracyReport(predictions);
        
        res.json({
          success: true,
          username,
          accuracyMetrics,
          accuracyReport,
          predictions: predictions.slice(0, 20) // Last 20 predictions
        });

      } catch (error) {
        console.error('[🛡️ Admin] ❌ Failed to get prediction accuracy:', error.message);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Get top performers by prediction accuracy
    this.app.get('/api/admin/prediction-accuracy/top-performers', adminApiAuth, (req, res) => {
      try {
        const { limit = 10 } = req.query;
        
        if (!this.predictionTrackingDatabase) {
          return res.status(503).json({
            success: false,
            error: 'Prediction Tracking Database not initialized'
          });
        }

        const topPerformers = this.predictionTrackingDatabase.getTopPerformers(parseInt(limit));
        
        res.json({
          success: true,
          topPerformers,
          total: topPerformers.length
        });

      } catch (error) {
        console.error('[🛡️ Admin] ❌ Failed to get top performers:', error.message);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Get prediction statistics
    this.app.get('/api/admin/prediction-accuracy/statistics', adminApiAuth, (req, res) => {
      try {
        if (!this.predictionTrackingDatabase) {
          return res.status(503).json({
            success: false,
            error: 'Prediction Tracking Database not initialized'
          });
        }

        const statistics = this.predictionTrackingDatabase.getStatistics();
        
        res.json({
          success: true,
          statistics
        });

      } catch (error) {
        console.error('[🛡️ Admin] ❌ Failed to get prediction statistics:', error.message);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Get active predictions
    this.app.get('/api/admin/prediction-accuracy/active', adminApiAuth, (req, res) => {
      try {
        if (!this.predictionTrackingDatabase) {
          return res.status(503).json({
            success: false,
            error: 'Prediction Tracking Database not initialized'
          });
        }

        const activePredictions = this.predictionTrackingDatabase.getActivePredictions();
        
        res.json({
          success: true,
          activePredictions,
          total: activePredictions.length
        });

      } catch (error) {
        console.error('[🛡️ Admin] ❌ Failed to get active predictions:', error.message);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Get completed predictions
    this.app.get('/api/admin/prediction-accuracy/completed', adminApiAuth, (req, res) => {
      try {
        const { limit = 50 } = req.query;
        
        if (!this.predictionTrackingDatabase) {
          return res.status(503).json({
            success: false,
            error: 'Prediction Tracking Database not initialized'
          });
        }

        const completedPredictions = this.predictionTrackingDatabase.getCompletedPredictions(parseInt(limit));
        
        res.json({
          success: true,
          completedPredictions,
          total: completedPredictions.length
        });

      } catch (error) {
        console.error('[🛡️ Admin] ❌ Failed to get completed predictions:', error.message);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Manually check prediction accuracy (for testing)
    this.app.post('/api/admin/prediction-accuracy/check/:predictionId', adminApiAuth, async (req, res) => {
      try {
        const { predictionId } = req.params;
        
        if (!this.predictionTrackingDatabase || !this.priceMonitoringService) {
          return res.status(503).json({
            success: false,
            error: 'Services not initialized'
          });
        }

        // Get prediction
        const predictions = this.predictionTrackingDatabase.predictions;
        const prediction = predictions.find(p => p.id === predictionId);
        
        if (!prediction) {
          return res.status(404).json({
            success: false,
            error: 'Prediction not found'
          });
        }

        // Check accuracy
        const accuracyCheck = await this.priceMonitoringService.checkPredictionAccuracy(prediction);
        
        if (!accuracyCheck) {
          return res.status(500).json({
            success: false,
            error: 'Failed to check prediction accuracy'
          });
        }

        // Update prediction
        const updatedPrediction = await this.predictionTrackingDatabase.updatePredictionCheck(predictionId, accuracyCheck);
        
        res.json({
          success: true,
          prediction: updatedPrediction,
          accuracyCheck
        });

      } catch (error) {
        console.error('[🛡️ Admin] ❌ Failed to check prediction accuracy:', error.message);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // ========================================
    // 🤖 AI-POWERED ACCURACY ANALYSIS ENDPOINTS
    // ========================================

    // Get AI-powered accuracy insights
    this.app.get('/api/admin/prediction-accuracy/ai-insights', adminApiAuth, async (req, res) => {
      try {
        if (!this.aiAccuracyAnalysisService || !this.predictionTrackingDatabase) {
          return res.status(503).json({
            success: false,
            error: 'AI Accuracy Analysis Service not initialized'
          });
        }

        const predictions = this.predictionTrackingDatabase.predictions;
        
        if (!predictions || predictions.length === 0) {
          return res.json({
            success: false,
            error: 'No predictions available yet. Predictions will appear as tweets are analyzed.',
            totalPredictions: 0
          });
        }

        const insights = await this.aiAccuracyAnalysisService.generateAccuracyInsights(predictions);
        
        if (!insights) {
          return res.json({
            success: false,
            error: 'Unable to generate insights at this time',
            totalPredictions: predictions.length
          });
        }
        
        res.json({
          success: true,
          insights,
          totalPredictions: predictions.length,
          generatedAt: new Date().toISOString()
        });

      } catch (error) {
        console.error('[🛡️ Admin] ❌ Failed to get AI accuracy insights:', error.message);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Analyze specific prediction outcome with AI
    this.app.get('/api/admin/prediction-accuracy/ai-analysis/:predictionId', adminApiAuth, async (req, res) => {
      try {
        const { predictionId } = req.params;
        
        if (!this.aiAccuracyAnalysisService || !this.predictionTrackingDatabase) {
          return res.status(503).json({
            success: false,
            error: 'AI Accuracy Analysis Service not initialized'
          });
        }

        const predictions = this.predictionTrackingDatabase.predictions;
        const prediction = predictions.find(p => p.id === predictionId);
        
        if (!prediction) {
          return res.status(404).json({
            success: false,
            error: 'Prediction not found'
          });
        }

        const analysis = await this.aiAccuracyAnalysisService.analyzePredictionOutcome(prediction);
        
        res.json({
          success: true,
          predictionId,
          analysis,
          generatedAt: new Date().toISOString()
        });

      } catch (error) {
        console.error('[🛡️ Admin] ❌ Failed to analyze prediction outcome:', error.message);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Get AI-powered recommendations for author
    this.app.get('/api/admin/prediction-accuracy/ai-recommendations/:username', adminApiAuth, async (req, res) => {
      try {
        const { username } = req.params;
        
        if (!this.aiAccuracyAnalysisService || !this.predictionTrackingDatabase) {
          return res.status(503).json({
            success: false,
            error: 'AI Accuracy Analysis Service not initialized'
          });
        }

        const predictions = this.predictionTrackingDatabase.getPredictionsByAuthor(username);
        
        if (!predictions || predictions.length === 0) {
          return res.json({
            success: false,
            error: `No predictions found for @${username} yet. Predictions will appear as their tweets are analyzed.`
          });
        }

        const recommendations = await this.aiAccuracyAnalysisService.generateAccuracyRecommendations(predictions);
        
        if (!recommendations) {
          return res.json({
            success: false,
            error: 'Unable to generate recommendations at this time'
          });
        }
        
        res.json({
          success: true,
          username,
          recommendations,
          totalPredictions: predictions.length,
          generatedAt: new Date().toISOString()
        });

      } catch (error) {
        console.error('[🛡️ Admin] ❌ Failed to get AI recommendations:', error.message);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });
    */ // END REMOVED PREDICTION ENDPOINTS

    // ========================================
    // 💰 CT MOMENTUM (CRYPTO TWITTER) ENDPOINTS
    // ========================================

    // Get top tokens by momentum
    this.app.get('/api/admin/ct-momentum/top-tokens', adminApiAuth, async (req, res) => {
      try {
        const { limit = 20, timeframe = '24h' } = req.query;
        
        console.log(`💰 [CT MOMENTUM] Request for top tokens: limit=${limit}, timeframe=${timeframe}`);
        
        if (!this.cryptoTrackingDatabase) {
          console.error('❌ [CT MOMENTUM] CryptoTrackingDatabase not initialized');
          return res.status(503).json({
            success: false,
            error: 'Crypto Tracking Database not initialized'
          });
        }

        if (!this.cryptoTrackingDatabase.ctMomentumDatabase) {
          console.error('❌ [CT MOMENTUM] CTMomentumDatabase not initialized');
          return res.status(503).json({
            success: false,
            error: 'CT Momentum Database not initialized'
          });
        }

        const topTokens = this.cryptoTrackingDatabase.ctMomentumDatabase.getTopTokens(
          parseInt(limit),
          timeframe
        );
        
        console.log(`✅ [CT MOMENTUM] Returning ${topTokens.length} tokens`);
        
        res.json({
          success: true,
          timeframe,
          tokens: topTokens,
          total: topTokens.length,
          analyzedAt: new Date().toISOString()
        });

      } catch (error) {
        console.error('[🛡️ Admin] ❌ Failed to get top tokens:', error.message);
        console.error('Stack:', error.stack);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Get detailed token momentum
    this.app.get('/api/admin/ct-momentum/token/:symbol', adminApiAuth, async (req, res) => {
      try {
        const { symbol } = req.params;
        const { timeframe = '7d' } = req.query;
        
        if (!this.cryptoTrackingDatabase || !this.cryptoTrackingDatabase.ctMomentumDatabase) {
          return res.status(503).json({
            success: false,
            error: 'CT Momentum service not initialized'
          });
        }

        const tokenMomentum = this.cryptoTrackingDatabase.ctMomentumDatabase.getTokenMomentum(
          symbol,
          timeframe
        );
        
        if (!tokenMomentum) {
          return res.json({
            success: false,
            error: `No momentum data found for $${symbol.toUpperCase()}`
          });
        }
        
        res.json({
          success: true,
          momentum: tokenMomentum
        });

      } catch (error) {
        console.error('[🛡️ Admin] ❌ Failed to get token momentum:', error.message);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Get CT Momentum statistics
    this.app.get('/api/admin/ct-momentum/stats', adminApiAuth, (req, res) => {
      try {
        if (!this.cryptoTrackingDatabase || !this.cryptoTrackingDatabase.ctMomentumDatabase) {
          return res.status(503).json({
            success: false,
            error: 'CT Momentum service not initialized'
          });
        }

        const stats = this.cryptoTrackingDatabase.ctMomentumDatabase.getStats();
        
        res.json({
          success: true,
          stats
        });

      } catch (error) {
        console.error('[🛡️ Admin] ❌ Failed to get CT Momentum stats:', error.message);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // ========================================
    // 📈 PRICE CHART ENDPOINTS
    // ========================================

    // ✅ DISABLED: Old Hybrid Price Service (REST API) - using gRPC EnhancedHybridPriceService instead
    // this.hybridPriceService = new HybridPriceService();
    
    // Initialize Enhanced Hybrid Price Service (Deployment-Safe gRPC Alternative)
    this.enhancedHybridPriceService = new EnhancedHybridPriceService();
    
    // 🚀 NEW: Auto-start gRPC monitoring for PROBITY
    console.log('🔌 [AUTO-START] Starting gRPC monitoring for PROBITY...');
    this.enhancedHybridPriceService.initializeAsync().catch(error => {
        console.error('❌ [AUTO-START] Failed to start gRPC monitoring:', error.message);
    });
    
    // Initialize Real-Time Token Monitor
    this.realTimeTokenMonitor = null; // Will be initialized after RealTimePriceService
    
    // Initialize Token Cache Watcher
    this.tokenCacheWatcher = null; // Will be initialized after RealTimeTokenMonitor
    
    // Initialize Pre-Bonding Moralis Service (standalone, no chart infrastructure)
    this.preBondingMoralisService = new PreBondingMoralisService();
    
    // Initialize Real-Time Price Service
    this.realTimePriceService = null; // Will be initialized after server starts
    
    // Initialize Hybrid Chart Service (Professional Architecture)
    try {
      console.log('⚡ Initializing Hybrid Chart Service...');
      console.log(`   Environment check:`);
      console.log(`   - HELIUS_API_KEY: ${process.env.HELIUS_API_KEY ? '✅ Set' : '❌ Missing'}`);
      console.log(`   - MORALIS_API_KEY: ${process.env.MORALIS_API_KEY ? '✅ Set' : '❌ Missing'}`);
      console.log(`   - NODE_ENV: ${process.env.NODE_ENV || 'undefined'}`);
      
      this.hybridChartService = new HybridChartService(
        process.env.HELIUS_API_KEY,
        process.env.MORALIS_API_KEY
      );
      console.log('✅ Hybrid Chart Service initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize Hybrid Chart Service:', error.message);
      console.error('Stack:', error.stack);
      console.error('⚠️ Backend will continue without chart services');
      this.hybridChartService = null; // Set to null so endpoints can handle gracefully
    }

    // Schedule bonding token validation to run every 5 minutes
    this.scheduleBondingValidation = () => {
      if (!this.bondingValidationService) {
        console.log('⚠️ Bonding validation service not available, skipping scheduling');
        return;
      }
      
      console.log('⏰ Scheduling bonding token validation every 5 minutes');
      
      // Run validation immediately on startup
      setTimeout(async () => {
        try {
          console.log('🚀 Running initial bonding token validation...');
          await this.bondingValidationService.runValidation();
        } catch (error) {
          console.error('❌ Initial bonding validation failed:', error.message);
        }
      }, 30000); // Wait 30 seconds after startup
      
      // Schedule to run every 5 minutes (300000 ms)
      setInterval(async () => {
        try {
          console.log('⏰ Running scheduled bonding token validation...');
          const result = await this.bondingValidationService.runValidation();
          console.log(`✅ Bonding validation completed: ${result.valid} valid, ${result.invalid} removed`);
        } catch (error) {
          console.error('❌ Scheduled bonding validation failed:', error.message);
        }
      }, 300000); // 5 minutes
    };

    // Initialize Bonding Token Validation Service
    try {
      console.log('🔍 Initializing Bonding Token Validation Service...');
      this.bondingValidationService = new BondingTokenValidationService();
      console.log('✅ Bonding Token Validation Service initialized successfully');
      
      // Schedule validation to run every hour
      this.scheduleBondingValidation();
      
    } catch (error) {
      console.error('❌ Failed to initialize Bonding Token Validation Service:', error.message);
      console.error('⚠️ Backend will continue without bonding validation');
      this.bondingValidationService = null;
    }

    // Listen for real-time price updates from background worker
    process.on('tokenPriceUpdate', async (data) => {
      try {
        const { tokenMint, newPrice, timestamp } = data;
        console.log(`💰 Real-time price update: ${tokenMint.substring(0, 8)} = $${newPrice}`);
        
        // Update token cache with new price
        await this.updateTokenPriceInCache(tokenMint, newPrice);
        
      } catch (error) {
        console.error('❌ Failed to handle price update:', error.message);
      }
    });

    // Method to update token price in cache
    this.updateTokenPriceInCache = async (tokenMint, newPrice) => {
      try {
        const tokens = await this.getTokensFromCache();
        const tokenIndex = tokens.findIndex(t => 
          t.contractAddress?.toLowerCase() === tokenMint.toLowerCase() ||
          t.mint?.toLowerCase() === tokenMint.toLowerCase()
        );
        
        if (tokenIndex !== -1) {
          const token = tokens[tokenIndex];
          
          // Update current price
          token.currentPrice = newPrice;
          token.price = newPrice;
          
          // Update Jupiter data if available
          if (token.jupiterData) {
            token.jupiterData.usdPrice = newPrice;
          }
          
          // Calculate new price change percentage
          const oldPrice = token.previousPrice || token.currentPrice;
          if (oldPrice && oldPrice > 0) {
            const priceChange = ((newPrice - oldPrice) / oldPrice) * 100;
            
            // Update price change in Jupiter stats
            if (token.jupiterData?.stats24h) {
              token.jupiterData.stats24h.priceChange = priceChange;
            }
            
            // Store previous price for next calculation
            token.previousPrice = oldPrice;
          }
          
          // Save updated tokens
          await this.saveTokensToCache(tokens);
          
          console.log(`✅ Updated token cache: ${token.symbol} = $${newPrice} (${tokenIndex})`);
        }
      } catch (error) {
        console.error('❌ Failed to update token cache:', error.message);
      }
    };

    // Get historical price data for a token (Helius + Moralis)
    this.app.get('/api/tokens/:contract/price-chart', async (req, res) => {
      try {
        console.log(`🔍 [PRICE-CHART] Endpoint reached for contract: ${req.params.contract}`);
        console.log(`🔍 [PRICE-CHART] Query params:`, req.query);
        
        const { contract } = req.params;
        const { timeframe = '5MIN', limit, before, after, preBonding } = req.query;

        if (!contract) {
          return res.status(400).json({ 
            success: false, 
            error: 'Contract address is required' 
          });
        }

        const parsedLimit = limit ? parseInt(limit) : null;
        const beforeTime = before ? parseInt(before) : null;
        const afterTime = after ? parseInt(after) : null;
        const isPreBonding = preBonding === 'true';

        if (isPreBonding) {
          console.log(`📊 [PRE-BONDING-CHART] Fetching ${timeframe} Moralis-only data for ${contract.substring(0, 8)}...`);
        } else {
          console.log(`📊 [HYBRID-CHART] Fetching ${timeframe} data for ${contract.substring(0, 8)}...`);
          console.log(`📊 [HYBRID-CHART] Params: limit=${parsedLimit}, before=${beforeTime}, after=${afterTime}`);
        }

        let chartData;
        
        // For pre-bonding tokens, use standalone Moralis service (NO chart infrastructure)
        if (isPreBonding) {
          // Use standalone PreBondingMoralisService - no database, no workers, no WebSocket
          const moralisData = await this.preBondingMoralisService.getChartData(
            contract,
            timeframe,
            parsedLimit || 100,
            beforeTime,
            afterTime
          );
          
          chartData = {
            ohlcv: moralisData || [],
            dataSource: 'moralis-standalone',
            dataSourceStats: {
              moralis: moralisData ? moralisData.length : 0
            }
          };
        } else if (beforeTime || afterTime) {
          // Time-filtered request
          chartData = await this.hybridChartService.getChartDataWithTimeRange(
            contract, 
            timeframe, 
            beforeTime, 
            afterTime
          );
        } else {
          // Regular request
          chartData = await this.hybridChartService.getChartData(
            contract, 
            timeframe, 
            parsedLimit
          );
        }

        if (!chartData || !chartData.ohlcv || chartData.ohlcv.length === 0) {
          return res.status(404).json({
            success: false,
            error: 'No chart data available',
            message: 'No price data found for this token and timeframe'
          });
        }

        console.log(`📊 [HYBRID-CHART] ✅ Success: ${chartData.ohlcv.length} candles from ${chartData.dataSource}`);

        res.json({
          success: true,
          contract: contract,
          timeframe: timeframe,
          data: chartData.ohlcv,
          count: chartData.ohlcv.length,
          metadata: {
            timeframe,
            count: chartData.ohlcv.length,
            dataSource: chartData.dataSource,
            dataSourceStats: chartData.dataSourceStats,
            timestamp: new Date().toISOString()
          }
        });

      } catch (error) {
        console.error('[🛡️ Enhanced Backend] ❌ Hybrid chart error:', error.message);
        res.status(500).json({
          success: false,
          error: 'Failed to fetch chart data',
          message: error.message
        });
      }
    });

    // Get current price for a token (Helius + Moralis)
    this.app.get('/api/tokens/:contract/current-price', async (req, res) => {
      try {
        const { contract } = req.params;

        if (!contract) {
          return res.status(400).json({ 
            success: false, 
            error: 'Contract address is required' 
          });
        }

        console.log(`📊 [HYBRID-PRICE] Getting current price for ${contract.substring(0, 8)}...`);

        // Get current price using hybrid chart service
        const priceData = await this.hybridChartService.getCurrentPrice(contract);

        console.log(`📊 [HYBRID-PRICE] ✅ Success: ${priceData.price.toFixed(8)} SOL from ${priceData.dataSource}`);

        res.json({
          success: true,
          contract: contract,
          price: priceData.price,
          timestamp: priceData.timestamp,
          volume: priceData.volume,
          dataSource: priceData.dataSource,
          dataSourceStats: priceData.dataSourceStats,
          fetchedAt: new Date().toISOString()
        });

      } catch (error) {
        console.error('[🛡️ Enhanced Backend] ❌ Hybrid price error:', error.message);
        res.status(500).json({
          success: false,
          error: 'Failed to fetch current price',
          message: error.message
        });
      }
    });

    // DEPRECATED: Hybrid Price Service endpoint for TokenDetail modal (redirects to gRPC)
    this.app.get('/api/tokens/:contract/hybrid-price', async (req, res) => {
      try {
        const { contract } = req.params;
        const connectionId = req.headers['x-connection-id'] || req.ip || 'unknown';
        
        console.log(`🔄 [DEPRECATED] Redirecting hybrid-price to realtime-data for: ${contract} (conn: ${connectionId})`);
        
        if (!contract) {
          return res.status(400).json({ 
            success: false, 
            error: 'Contract address is required' 
          });
        }

        // Redirect to the new gRPC endpoint
        if (!this.enhancedHybridPriceService) {
          return res.status(503).json({
            success: false,
            error: 'EnhancedHybridPriceService not available'
          });
        }

        // Get real-time data from gRPC system
        const realTimeData = await this.enhancedHybridPriceService.getRealTimeTokenData(contract);
        
        if (!realTimeData) {
          return res.status(404).json({
            success: false,
            error: 'Token not found in real-time monitoring'
          });
        }
        
        console.log(`✅ [REDIRECT] Successfully fetched gRPC data for ${contract}:`, {
          price: realTimeData.price,
          liquidity: realTimeData.liquidity,
          source: realTimeData.source,
          swaps: realTimeData.recentSwaps.length
        });

        res.json({
          success: true,
          data: realTimeData,
          connectionId: connectionId,
          timestamp: new Date().toISOString(),
          source: 'gRPC (redirected from hybrid-price)'
        });

      } catch (error) {
        console.error(`❌ [REDIRECT] Error fetching gRPC data for ${req.params.contract}:`, error.message);
        res.status(500).json({
          success: false,
          error: 'Failed to fetch real-time data',
          details: error.message
        });
      }
    });

    // 🚀 NEW: Hybrid Price Service stats endpoint
    // NEW: Real-time gRPC data endpoint for TokenDetail
    this.app.get('/api/tokens/:contract/realtime-data', async (req, res) => {
      try {
        const { contract } = req.params;
        const connectionId = req.headers['x-connection-id'] || req.ip || 'unknown';
        
        console.log(`🔍 [RealTime] Fetching gRPC data for: ${contract} (conn: ${connectionId})`);
        
        if (!contract) {
          return res.status(400).json({ 
            success: false, 
            error: 'Contract address is required' 
          });
        }

        if (!this.enhancedHybridPriceService) {
          return res.status(503).json({
            success: false,
            error: 'EnhancedHybridPriceService not available'
          });
        }

        // Get real-time data from gRPC system
        const realTimeData = await this.enhancedHybridPriceService.getRealTimeTokenData(contract);
        
        if (!realTimeData) {
          return res.status(404).json({
            success: false,
            error: 'Token not found in real-time monitoring'
          });
        }
        
        console.log(`✅ [RealTime] Successfully fetched gRPC data for ${contract}:`, {
          price: realTimeData.price,
          liquidity: realTimeData.liquidity,
          source: realTimeData.source,
          swaps: realTimeData.recentSwaps.length
        });

        res.json({
          success: true,
          data: realTimeData,
          connectionId: connectionId,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        console.error(`❌ [RealTime] Error fetching gRPC data for ${req.params.contract}:`, error.message);
        res.status(500).json({
          success: false,
          error: 'Failed to fetch real-time data',
          details: error.message
        });
      }
    });

    this.app.get('/api/hybrid-price/stats', (req, res) => {
      try {
        const stats = this.hybridPriceService.getConnectionStats();
        res.json({
          success: true,
          stats: {
            ...stats,
            cacheSize: this.hybridPriceService.priceCache.size,
            pendingRequests: this.hybridPriceService.pendingRequests.size
          }
        });
      } catch (error) {
        console.error('❌ [HybridPrice] Error getting stats:', error.message);
        res.status(500).json({ success: false, error: 'Failed to get stats' });
      }
    });

    // ✅ NEW: Real-time tooltip data endpoint for bubble map
    this.app.get('/api/tokens/:contract/tooltip-data', async (req, res) => {
      try {
        const { contract } = req.params;
        
        if (!contract) {
          return res.status(400).json({ 
            success: false, 
            error: 'Contract address is required' 
          });
        }

        // ✅ CRITICAL FIX: Use the CORRECT instance from RealTimeTokenMonitor
        const priceService = this.realTimeTokenMonitor?.hybridPriceService || this.enhancedHybridPriceService;
        
        if (!priceService) {
          return res.status(503).json({
            success: false,
            error: 'EnhancedHybridPriceService not available'
          });
        }

        const tooltipData = priceService.getRealTimeTooltipData(contract);
        
        if (!tooltipData) {
          return res.status(404).json({
            success: false,
            error: 'Token not found in real-time monitoring'
          });
        }

        res.json({
          success: true,
          data: tooltipData,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        console.error(`❌ [TooltipData] Error fetching tooltip data for ${req.params.contract}:`, error.message);
        res.status(500).json({
          success: false,
          error: 'Failed to fetch tooltip data',
          details: error.message
        });
      }
    });

    // ✅ NEW: Real-time ranking data endpoint
    this.app.get('/api/tokens/ranking/realtime', async (req, res) => {
      try {
        // ✅ CRITICAL FIX: Use the CORRECT instance from RealTimeTokenMonitor
        const priceService = this.realTimeTokenMonitor?.hybridPriceService || this.enhancedHybridPriceService;
        
        if (!priceService) {
          console.error(`❌ [RankingData] No price service available!`);
          return res.status(503).json({
            success: false,
            error: 'EnhancedHybridPriceService not available'
          });
        }

        // ✅ NEW: Get full token cache with Overall Score
        const allTokens = await this.getTokensFromCache();
        console.log(`📊 [RankingData] Loaded ${allTokens.length} tokens from cache`);
        
        // ✅ NEW: Get real-time metrics for monitored tokens
        const realTimeMetrics = new Map();
        if (priceService.poolAddresses) {
          for (const [tokenAddress] of priceService.poolAddresses.entries()) {
            const tooltipData = priceService.getRealTimeTooltipData(tokenAddress);
            if (tooltipData) {
              realTimeMetrics.set(tokenAddress, tooltipData);
            }
          }
        }
        console.log(`📊 [RankingData] Found ${realTimeMetrics.size} tokens with real-time data`);
        
        // ✅ NEW: Merge cache tokens with real-time metrics
        const rankings = allTokens.map(token => {
          const address = token.contractAddress || token.tokenAddress;
          const realTimeData = realTimeMetrics.get(address);
          
          // Get Jupiter data for fallback
          const jupiter24h = token.jupiterData?.stats24h || {};
          const jupiter5m = token.jupiterData?.stats5m || {};
          const jupiter1h = token.jupiterData?.stats1h || {};
          const jupiter6h = token.jupiterData?.stats6h || {};
          
          // Calculate safe sums for Jupiter stats
          const jupiterVolume24h = (jupiter24h.buyVolume || 0) + (jupiter24h.sellVolume || 0);
          const jupiterTxns24h = (jupiter24h.numBuys || 0) + (jupiter24h.numSells || 0);
          
          return {
            ...token,
            // Override with real-time data if available
            price: realTimeData?.price || token.jupiterData?.price || token.jupiterData?.usdPrice || token.price || 0,
            volume24h: realTimeData?.volume24h || jupiterVolume24h || 0,
            txns24h: realTimeData?.txns24h || jupiterTxns24h || 0,
            makers24h: realTimeData?.makers24h || jupiter24h.numTraders || 0,
            priceChange5m: realTimeData?.priceChange5m || jupiter5m.priceChange || 0,
            priceChange1h: realTimeData?.priceChange1h || jupiter1h.priceChange || 0,
            priceChange6h: realTimeData?.priceChange6h || jupiter6h.priceChange || 0,
            priceChange24h: realTimeData?.priceChange24h || token.jupiterData?.priceChange24h || 0,
            marketCap: realTimeData?.marketCap || token.marketCap || token.jupiterData?.mcap || 0,
            liquidity: realTimeData?.liquidity || token.liquidity || token.jupiterData?.liquidity || 0,
            isLive: !!realTimeData,
            // ✅ CRITICAL: Preserve Overall Score for sorting
            overallScore: token.overallScore || token.score || 0,
            rank: 0 // Will be set after sorting
          };
        });
        
        // ✅ CRITICAL: Sort by Overall Score (not volume!)
        rankings.sort((a, b) => {
          const scoreA = a.overallScore || 0;
          const scoreB = b.overallScore || 0;
          if (scoreB !== scoreA) {
            return scoreB - scoreA;
          }
          return (b.marketCap || 0) - (a.marketCap || 0);
        });
        
        // Assign ranks
        rankings.forEach((token, index) => {
          token.rank = index + 1;
        });
        
        console.log(`📊 [RankingData] Returning ${rankings.length} tokens ranked by Overall Score`);
        
        res.json({
          success: true,
          data: rankings,
          count: rankings.length,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        console.error(`❌ [RankingData] Error fetching ranking data:`, error.message);
        console.error(`❌ [RankingData] Stack:`, error.stack);
        res.status(500).json({
          success: false,
          error: 'Failed to fetch ranking data',
          details: error.message
        });
      }
    });

    // 🚀 NEW: Connection cleanup endpoint
    this.app.post('/api/hybrid-price/cleanup', (req, res) => {
      try {
        const { tokenAddress, connectionId } = req.body;
        
        if (tokenAddress && connectionId) {
          this.hybridPriceService.removeConnection(tokenAddress, connectionId);
          res.json({ success: true, message: 'Connection removed' });
        } else {
          res.status(400).json({ success: false, error: 'Token address and connection ID required' });
        }
      } catch (error) {
        console.error('❌ [HybridPrice] Error cleaning up connection:', error.message);
        res.status(500).json({ success: false, error: 'Failed to cleanup connection' });
      }
    });

    // 🚀 NEW: Hybrid Price Service WebSocket subscription management
    this.app.post('/api/hybrid-price/subscribe', async (req, res) => {
      try {
        const { tokenAddress } = req.body;
        
        if (!tokenAddress) {
          return res.status(400).json({ 
            success: false, 
            error: 'Token address is required' 
          });
        }

        if (this.enhancedHybridPriceService) {
          // ✅ CRITICAL FIX: Use EnhancedHybridPriceService (gRPC) instead of old HybridPriceService (REST)
          const subscribed = await this.enhancedHybridPriceService.ensureTokenMonitoring(tokenAddress);
          
          res.json({
            success: true,
            subscribed,
            tokenAddress,
            message: subscribed ? 'Subscribed to gRPC token price updates' : 'Failed to subscribe to this token'
          });
        } else {
          res.status(503).json({
            success: false,
            error: 'EnhancedHybridPriceService not available'
          });
        }
      } catch (error) {
        console.error('❌ Error subscribing to token:', error.message);
        res.status(500).json({
          success: false,
          error: 'Failed to subscribe to token'
        });
      }
    });

    this.app.post('/api/hybrid-price/unsubscribe', (req, res) => {
      try {
        const { tokenAddress } = req.body;
        
        if (!tokenAddress) {
          return res.status(400).json({ 
            success: false, 
            error: 'Token address is required' 
          });
        }

        if (this.enhancedHybridPriceService) {
          // ✅ CRITICAL FIX: Use EnhancedHybridPriceService (gRPC) instead of old HybridPriceService (REST)
          const unsubscribed = this.enhancedHybridPriceService.unsubscribeFromToken(tokenAddress);
          
          res.json({
            success: true,
            unsubscribed,
            tokenAddress,
            message: unsubscribed ? 'Unsubscribed from gRPC token price updates' : 'Not subscribed to this token'
          });
        } else {
          res.status(503).json({
            success: false,
            error: 'EnhancedHybridPriceService not available'
          });
        }
      } catch (error) {
        console.error('❌ Error unsubscribing from token:', error.message);
        res.status(500).json({
          success: false,
          error: 'Failed to unsubscribe from token'
        });
      }
    });

    // 🚀 NEW: Hybrid Price Service WebSocket stats endpoint
    this.app.get('/api/hybrid-price/websocket-stats', (req, res) => {
      try {
        if (this.enhancedHybridPriceService) {
          // ✅ CRITICAL FIX: Use EnhancedHybridPriceService (gRPC) instead of old HybridPriceService (REST)
          const stats = this.enhancedHybridPriceService.getRealTimeStats();
          res.json({
            success: true,
            stats,
            service: 'EnhancedHybridPriceService (gRPC)'
          });
        } else {
          res.status(503).json({
            success: false,
            error: 'EnhancedHybridPriceService not available'
          });
        }
      } catch (error) {
        console.error('❌ Error getting WebSocket stats:', error.message);
        res.status(500).json({
          success: false,
          error: 'Failed to get WebSocket stats'
        });
      }
    });

    // Meteora SDK status endpoint
    this.app.get('/api/meteora-sdk/status', (req, res) => {
      try {
        if (this.enhancedHybridPriceService) {
          const status = {
            cpAmmInitialized: !!this.enhancedHybridPriceService.cpAmm,
            meteoraConnectionInitialized: !!this.enhancedHybridPriceService.meteoraConnection,
            timestamp: new Date().toISOString()
          };
          res.json({
            success: true,
            status,
            service: 'EnhancedHybridPriceService (gRPC)'
          });
        } else {
          res.status(503).json({
            success: false,
            error: 'EnhancedHybridPriceService not available'
          });
        }
      } catch (error) {
        console.error('❌ Error getting Meteora SDK status:', error.message);
        res.status(500).json({
          success: false,
          error: 'Failed to get Meteora SDK status'
        });
      }
    });

    // Get available timeframes for price charts
    this.app.get('/api/tokens/price-chart/timeframes', async (req, res) => {
      try {
        const timeframes = this.hybridPriceService.getAvailableTimeframes();
        
        res.json({
          success: true,
          timeframes: timeframes,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        console.error('[🛡️ Enhanced Backend] ❌ Timeframes error:', error.message);
        res.status(500).json({
          success: false,
          error: 'Failed to fetch timeframes',
          message: error.message
        });
      }
    });

    // ========================================
    // 🚨 BONDING TOKENS ENDPOINTS
    // ========================================

    // Get bonding tokens (for Trenches filter)
    // Internal import endpoint for bonding tokens from Jupiter Service
    this.app.post('/api/internal/bonding-tokens/import', async (req, res) => {
      try {
        const internalToken = process.env.INTERNAL_TOKEN || process.env.DISCOVERY_INTERNAL_TOKEN;
        const providedToken = req.headers['x-internal-token'] || req.query.token;

        if (!internalToken) {
          return res.status(503).json({ success: false, error: 'Internal import not configured (no INTERNAL_TOKEN)' });
        }
        if (!providedToken || providedToken !== internalToken) {
          return res.status(403).json({ success: false, error: 'Forbidden' });
        }

        const { tokens } = req.body || {};
        if (!Array.isArray(tokens)) {
          return res.status(400).json({ success: false, error: 'Invalid payload: tokens[] required' });
        }

        console.log(`[🔍 Bonding Import] Received ${tokens.length} bonding tokens from Jupiter Service`);

        // Store in backend cache file
        const fs = await import('fs/promises');
        const path = await import('path');
        
        const dataDir = '/var/data';
        const cacheFile = path.join(dataDir, 'PreBonded-BackendCache.json');
        
        // Ensure data directory exists
        try {
          await fs.mkdir(dataDir, { recursive: true });
        } catch (error) {
          // Directory might already exist
        }
        
        const cacheData = {
          timestamp: new Date().toISOString(),
          tokens: tokens,
          count: tokens.length,
          source: 'jupiter-service'
        };
        
        // 🚨 CRITICAL FIX: Use atomic write to prevent data loss
        const tempPath = cacheFile + '.tmp';
        const jsonData = JSON.stringify(cacheData, null, 2);
        
        try {
          // Ensure cache directory exists before atomic write
          const cacheDir = path.dirname(cacheFile);
          await fs.mkdir(cacheDir, { recursive: true });
          
          await fs.writeFile(tempPath, jsonData, 'utf8');
          await fs.rename(tempPath, cacheFile);
        } catch (error) {
          // Cleanup temp file if it exists
          try {
            await fs.unlink(tempPath);
          } catch (_) {}
          throw error;
        }
        
        console.log(`💾 [Bonding Import] Saved ${tokens.length} tokens to backend cache (atomic write)`);
        
        res.json({
          success: true,
          count: tokens.length,
          message: 'Bonding tokens imported successfully'
        });
        
      } catch (error) {
        console.error('❌ Bonding tokens import error:', error.message);
        res.status(500).json({
          success: false,
          error: 'Failed to import bonding tokens'
        });
      }
    });

    // Handle graduated tokens notification from Jupiter Service
    this.app.post('/api/internal/bonding-tokens/graduated', async (req, res) => {
      try {
        const internalToken = process.env.INTERNAL_TOKEN || process.env.DISCOVERY_INTERNAL_TOKEN;
        const providedToken = req.headers['x-internal-token'] || req.query.token;

        if (!internalToken) {
          return res.status(503).json({ success: false, error: 'Internal graduation handler not configured (no INTERNAL_TOKEN)' });
        }
        if (!providedToken || providedToken !== internalToken) {
          return res.status(403).json({ success: false, error: 'Forbidden' });
        }

        const { graduatedTokens, migratedTokens } = req.body || {};
        if (!Array.isArray(graduatedTokens)) {
          return res.status(400).json({ success: false, error: 'Invalid payload: graduatedTokens[] required' });
        }

        console.log(`🎓 [Graduation Handler] Received ${graduatedTokens.length} graduated tokens and ${migratedTokens?.length || 0} migrated tokens from Jupiter Service`);

        // Read backend bonding cache
        const fs = await import('fs/promises');
        const path = await import('path');
        
        const cacheFile = '/var/data/PreBonded-BackendCache.json';
        
        try {
          const cacheData = await fs.readFile(cacheFile, 'utf8');
          const parsedData = JSON.parse(cacheData);
          
          if (!parsedData.tokens || !Array.isArray(parsedData.tokens)) {
            return res.json({
              success: true,
              removedCount: 0,
              remainingCount: 0,
              message: 'No bonding tokens in backend cache'
            });
          }
          
          // Remove graduated tokens from backend cache
          const remainingTokens = parsedData.tokens.filter(token => 
            !graduatedTokens.includes(token.tokenAddress)
          );
          
          const removedCount = parsedData.tokens.length - remainingTokens.length;
          
          // Update backend cache
          const updatedCache = {
            ...parsedData,
            tokens: remainingTokens,
            count: remainingTokens.length,
            lastUpdated: new Date().toISOString(),
            graduatedTokens: graduatedTokens
          };
          
          await fs.writeFile(cacheFile, JSON.stringify(updatedCache, null, 2));
          console.log(`🎓 [Graduation Handler] Removed ${removedCount} graduated tokens from backend cache`);
          
          // Add migrated tokens to main token cache
          if (migratedTokens && migratedTokens.length > 0) {
            try {
              const mainCacheFile = '/var/data/dgo/cache/tokens-cache.json';
              let mainCacheData;
              
              try {
                const mainCacheContent = await fs.readFile(mainCacheFile, 'utf8');
                mainCacheData = JSON.parse(mainCacheContent);
              } catch (mainCacheError) {
                // Create new cache if it doesn't exist
                mainCacheData = [];
              }
              
              // Ensure it's an array
              if (!Array.isArray(mainCacheData)) {
                mainCacheData = [];
              }
              
              // Add migrated tokens to main cache
              const updatedMainCache = [...mainCacheData, ...migratedTokens];
              
              await fs.writeFile(mainCacheFile, JSON.stringify(updatedMainCache, null, 2));
              console.log(`🎓 [Graduation Handler] Added ${migratedTokens.length} migrated tokens to main cache`);
              
            } catch (mainCacheError) {
              console.error('❌ [Graduation Handler] Error updating main cache:', mainCacheError.message);
            }
          }
          
          res.json({
            success: true,
            removedCount: removedCount,
            remainingCount: remainingTokens.length,
            migratedCount: migratedTokens?.length || 0,
            graduatedTokens: graduatedTokens,
            message: 'Graduated tokens removed from backend cache and migrated tokens added to main cache'
          });
          
        } catch (fileError) {
          console.log(`⚠️ [Graduation Handler] Backend cache file not found: ${fileError.message}`);
          res.json({
            success: true,
            removedCount: 0,
            remainingCount: 0,
            message: 'Backend cache not available'
          });
        }
        
      } catch (error) {
        console.error('❌ Graduation handler error:', error.message);
        res.status(500).json({
          success: false,
          error: 'Failed to handle graduated tokens'
        });
      }
    });

    // Get bonding token details by address - Fetch from jupiter-service
    this.app.get('/api/tokens/:contract/bonding', async (req, res) => {
      try {
        const { contract } = req.params;
        
        console.log(`[🛡️ Enhanced Backend] 🚨 Getting bonding details from jupiter-service for: ${contract}...`);
        
        // Fetch from jupiter-service
        const jupiterServiceUrl = process.env.JUPITER_SERVICE_URL || 'http://localhost:3000';
        const apiUrl = `${jupiterServiceUrl}/api/bonding-tokens/${contract}/status`;
        
        const response = await fetch(apiUrl);
        const data = await response.json();
        
        if (!response.ok) {
          return res.status(response.status).json({
            success: false,
            error: data.error || 'Failed to fetch bonding details from jupiter-service'
          });
        }
        
        if (!data.success) {
          return res.status(404).json({
            success: false,
            error: 'Token not found in bonding curve'
          });
        }
        
        res.json({
          success: true,
          bondingData: data.data,
          source: 'jupiter-service'
        });
        
      } catch (error) {
        console.error('❌ Failed to get bonding token details from jupiter-service:', error.message);
        res.status(500).json({
          success: false,
          error: 'Failed to get bonding token details from jupiter-service'
        });
      }
    });

    // Manual bonding token validation endpoint
    this.app.post('/api/tokens/bonding/validate', async (req, res) => {
      try {
        if (!this.bondingValidationService) {
          return res.status(500).json({
            success: false,
            error: 'Bonding validation service not available'
          });
        }
        
        console.log('[🛡️ Enhanced Backend] 🔍 Manual bonding token validation requested');
        
        const result = await this.bondingValidationService.runValidation();
        
        res.json({
          success: true,
          message: 'Bonding token validation completed',
          data: result,
          timestamp: new Date().toISOString()
        });
        
      } catch (error) {
        console.error('[🛡️ Enhanced Backend] ❌ Manual bonding validation error:', error.message);
        res.status(500).json({
          success: false,
          error: 'Failed to run bonding validation',
          message: error.message
        });
      }
    });

    // Get bonding validation statistics
    this.app.get('/api/tokens/bonding/validation-stats', async (req, res) => {
      try {
        if (!this.bondingValidationService) {
          return res.status(500).json({
            success: false,
            error: 'Bonding validation service not available'
          });
        }
        
        const stats = await this.bondingValidationService.getValidationStats();
        
        res.json({
          success: true,
          data: stats,
          timestamp: new Date().toISOString()
        });
        
      } catch (error) {
        console.error('[🛡️ Enhanced Backend] ❌ Get validation stats error:', error.message);
        res.status(500).json({
          success: false,
          error: 'Failed to get validation stats',
          message: error.message
        });
      }
    });

    // Get bonding tokens statistics - Fetch from jupiter-service
    this.app.get('/api/tokens/bonding/stats', async (req, res) => {
      try {
        console.log(`[🛡️ Enhanced Backend] 📊 Getting bonding tokens statistics from jupiter-service...`);
        
        // Fetch from jupiter-service
        const jupiterServiceUrl = process.env.JUPITER_SERVICE_URL || 'http://localhost:3000';
        const apiUrl = `${jupiterServiceUrl}/api/bonding-tokens/stats`;
        
        const response = await fetch(apiUrl);
        const data = await response.json();
        
        if (!response.ok) {
          return res.status(response.status).json({
            success: false,
            error: data.error || 'Failed to fetch bonding statistics from jupiter-service'
          });
        }
        
        if (!data.success) {
          return res.status(500).json({
            success: false,
            error: data.error || 'Failed to get bonding statistics'
          });
        }
        
        res.json({
          success: true,
          stats: data.stats,
          source: 'jupiter-service'
        });
        
      } catch (error) {
        console.error('❌ Failed to get bonding statistics from jupiter-service:', error.message);
        res.status(500).json({
          success: false,
          error: 'Failed to get bonding statistics from jupiter-service'
        });
      }
    });

    // Get graduation alerts
    // Get graduation alerts - Fetch from jupiter-service
    this.app.get('/api/tokens/bonding/alerts', async (req, res) => {
      try {
        const { threshold = 95 } = req.query;
        
        console.log(`[🛡️ Enhanced Backend] 🚨 Getting graduation alerts from jupiter-service (threshold: ${threshold}%)...`);
        
        // Fetch from jupiter-service
        const jupiterServiceUrl = process.env.JUPITER_SERVICE_URL || 'http://localhost:3000';
        const apiUrl = `${jupiterServiceUrl}/api/bonding-tokens/alerts?threshold=${threshold}`;
        
        const response = await fetch(apiUrl);
        const data = await response.json();
        
        if (!response.ok) {
          return res.status(response.status).json({
            success: false,
            error: data.error || 'Failed to fetch graduation alerts from jupiter-service'
          });
        }
        
        if (!data.success) {
          return res.status(500).json({
            success: false,
            error: data.error || 'Failed to get graduation alerts'
          });
        }
        
        res.json({
          success: true,
          alerts: data.alerts,
          count: data.count,
          source: 'jupiter-service'
        });
        
      } catch (error) {
        console.error('❌ Failed to get graduation alerts from jupiter-service:', error.message);
        res.status(500).json({
          success: false,
          error: 'Failed to get graduation alerts from jupiter-service'
        });
      }
    });

    // Get Moralis service status
    this.app.get('/api/tokens/price-chart/status', async (req, res) => {
      try {
        if (this.enhancedHybridPriceService) {
          // ✅ CRITICAL FIX: Use EnhancedHybridPriceService (gRPC) instead of old HybridPriceService (REST)
          const stats = this.enhancedHybridPriceService.getRealTimeStats();
          
          res.json({
            success: true,
            service: 'EnhancedHybridPriceService (gRPC)',
            status: {
              connected: stats.connected,
              activeTokens: stats.activeTokens,
              totalUpdates: stats.totalUpdates,
              lastUpdate: stats.lastUpdate
            },
            timestamp: new Date().toISOString()
          });
        } else {
          res.status(503).json({
            success: false,
            error: 'EnhancedHybridPriceService not available'
          });
        }

      } catch (error) {
        console.error('[🛡️ Enhanced Backend] ❌ Price service status error:', error.message);
        res.status(500).json({
          success: false,
          error: 'Failed to fetch service status',
          message: error.message
        });
      }
    });

    // Real-time Transaction Endpoints
    
    // Get real-time transactions for a token (for TX table)
    this.app.get('/api/tokens/:contract/transactions', async (req, res) => {
      try {
        const { contract } = req.params;
        const { limit = 50, sinceTimestamp } = req.query;

        if (!contract) {
          return res.status(400).json({ 
            success: false, 
            error: 'Contract address is required' 
          });
        }

        console.log(`📊 [TX-TABLE] Fetching transactions for ${contract.substring(0, 8)}...`);

        // Get pool address for this token
        const poolAddress = await this.hybridChartService.fastChartService.chartDb.getPoolAddress(contract);
        
        if (!poolAddress) {
          return res.status(404).json({
            success: false,
            error: 'Pool address not found',
            message: 'No pool data available for this token'
          });
        }

        // Get recent swaps from database
        const swaps = await this.hybridChartService.fastChartService.chartDb.getRecentSwaps(
          poolAddress, 
          parseInt(limit),
          sinceTimestamp ? parseInt(sinceTimestamp) : null
        );

        console.log(`📊 [TX-TABLE] ✅ Found ${swaps.length} transactions`);

        res.json({
          success: true,
          contract: contract,
          poolAddress: poolAddress.substring(0, 8) + '...',
          transactions: swaps,
          count: swaps.length,
          metadata: {
            timestamp: new Date().toISOString(),
            source: 'database'
          }
        });

      } catch (error) {
        console.error(`❌ [TX-TABLE] Error fetching transactions:`, error.message);
        res.status(500).json({
          success: false,
          error: 'Failed to fetch transactions',
          message: error.message
        });
      }
    });

    // Get real-time WebSocket statistics
    this.app.get('/api/tokens/realtime-stats', async (req, res) => {
      try {
        const stats = this.hybridChartService.backgroundWorker.getRealTimeStats();
        
        res.json({
          success: true,
          data: stats,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        console.error(`❌ [REALTIME-STATS] Error:`, error.message);
        res.status(500).json({
          success: false,
          error: 'Failed to get real-time stats',
          message: error.message
        });
      }
    });

    // Get gRPC service status
    this.app.get('/api/grpc/status', async (req, res) => {
      try {
        const grpcStatus = {
          enhancedHybridPriceService: this.enhancedHybridPriceService ? this.enhancedHybridPriceService.getRealTimeStats() : null,
          realTimeTokenMonitor: this.realTimeTokenMonitor ? this.realTimeTokenMonitor.getMonitoringStats() : null,
          tokenCacheWatcher: this.tokenCacheWatcher ? 'active' : 'not initialized',
          timestamp: new Date().toISOString()
        };
        
        res.json({
          success: true,
          grpc: grpcStatus
        });

      } catch (error) {
        console.error(`❌ [GRPC-STATUS] Error:`, error.message);
        res.status(500).json({
          success: false,
          error: 'Failed to get gRPC status',
          message: error.message
        });
      }
    });

    // ✅ NEW: Get decoder statistics to verify usage in production
    this.app.get('/api/decoders/stats', async (req, res) => {
      try {
        // Try to get hybrid price service from either location
        const hybridPriceService = this.realTimeTokenMonitor?.hybridPriceService || this.enhancedHybridPriceService;
        
        if (!hybridPriceService) {
          return res.status(500).json({
            success: false,
            error: 'Hybrid price service not initialized'
          });
        }

        const decoderStats = hybridPriceService.getDecoderStats();
        
        res.json({
          success: true,
          data: {
            ...decoderStats,
            summary: {
              totalSwapsProcessed: decoderStats.totalDecoderUses,
              ammDecoderUsage: decoderStats.raydiumAMM.usage || 0,
              cpmmDecoderUsage: decoderStats.raydiumCPMM.usage || 0,
              ammDecoderActive: decoderStats.decoderActive.amm,
              cpmmDecoderActive: decoderStats.decoderActive.cpmm,
              ammCacheSize: decoderStats.raydiumAMM.cacheSize || 0,
              cpmmCacheSize: decoderStats.raydiumCPMM.cacheSize || 0,
              ammSuccessRate: decoderStats.raydiumAMM.successRate || 'N/A',
              cpmmSuccessRate: decoderStats.raydiumCPMM.successRate || 'N/A'
            },
            timestamp: new Date().toISOString()
          }
        });

      } catch (error) {
        console.error(`❌ [DECODER-STATS] Error:`, error.message);
        res.status(500).json({
          success: false,
          error: 'Failed to get decoder stats',
          message: error.message
        });
      }
    });

    // Test decoder with a known pool address
    this.app.post('/api/decoders/test', async (req, res) => {
      try {
        const { poolAddress, programId } = req.body;
        
        if (!poolAddress) {
          return res.status(400).json({
            success: false,
            error: 'poolAddress is required'
          });
        }

        // Try to get hybrid price service from either location
        const hybridPriceService = this.realTimeTokenMonitor?.hybridPriceService || this.enhancedHybridPriceService;
        
        if (!hybridPriceService) {
          return res.status(500).json({
            success: false,
            error: 'Hybrid price service not initialized'
          });
        }
        let decoder = null;
        let decoderType = null;
        
        // Determine which decoder to use based on program ID or pool
        if (programId === 'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C' || !programId) {
          decoder = hybridPriceService.raydiumCPMMDecoder;
          decoderType = 'CPMM';
        } else if (programId === '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8') {
          decoder = hybridPriceService.raydiumDecoder;
          decoderType = 'AMM';
        } else if (programId === 'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK') {
          decoder = hybridPriceService.raydiumCLMMDecoder;
          decoderType = 'CLMM';
        }

        if (!decoder) {
          return res.status(400).json({
            success: false,
            error: 'No decoder found or invalid programId',
            availablePrograms: [
              'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C (CPMM)',
              '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8 (AMM)',
              'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK (CLMM)'
            ]
          });
        }

        console.log(`🧪 [DECODER-TEST] Testing ${decoderType} decoder with pool: ${poolAddress.substring(0, 16)}...`);
        
        // Test decoding
        const startTime = Date.now();
        const poolData = await decoder.decodePoolState(poolAddress);
        const elapsed = Date.now() - startTime;
        
        const decoderStats = decoder.getMetrics();
        
        const result = {
          success: !!poolData,
          decoderType,
          poolAddress: poolAddress.substring(0, 16) + '...',
          elapsedMs: elapsed,
          poolData: poolData ? {
            hasToken0Vault: !!poolData.token0Vault,
            hasToken1Vault: !!poolData.token1Vault,
            hasToken0Mint: !!poolData.token0Mint,
            hasToken1Mint: !!poolData.token1Mint,
            // Show first 16 chars of vaults for verification
            token0Vault: poolData.token0Vault?.substring(0, 16) + '...',
            token1Vault: poolData.token1Vault?.substring(0, 16) + '...'
          } : null,
          decoderMetrics: decoderStats,
          timestamp: new Date().toISOString()
        };
        
        if (!poolData) {
          console.log(`❌ [DECODER-TEST] Failed to decode ${decoderType} pool: ${poolAddress.substring(0, 16)}...`);
        } else {
          console.log(`✅ [DECODER-TEST] Successfully decoded ${decoderType} pool: ${poolAddress.substring(0, 16)}...`);
        }
        
        res.json(result);

      } catch (error) {
        console.error(`❌ [DECODER-TEST] Error:`, error.message);
        res.status(500).json({
          success: false,
          error: 'Failed to test decoder',
          message: error.message,
          stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
      }
    });

    // Manually trigger gRPC connection
    this.app.post('/api/grpc/connect', async (req, res) => {
      try {
        if (!this.enhancedHybridPriceService) {
          return res.status(500).json({
            success: false,
            error: 'EnhancedHybridPriceService not initialized'
          });
        }

        console.log('🔌 [GRPC-CONNECT] Manually triggering gRPC connection...');
        await this.enhancedHybridPriceService.initializeGrpcClient();
        
        const stats = this.enhancedHybridPriceService.getRealTimeStats();
        
        res.json({
          success: true,
          message: 'gRPC connection triggered',
          stats: stats
        });

      } catch (error) {
        console.error(`❌ [GRPC-CONNECT] Error:`, error.message);
        res.status(500).json({
          success: false,
          error: 'Failed to connect gRPC',
          message: error.message
        });
      }
    });

    // Health check endpoint for debugging
    this.app.get('/api/health/chart-services', (req, res) => {
      const health = {
        timestamp: new Date().toISOString(),
        services: {
          hybridChartService: {
            available: !!this.hybridChartService,
            fastChartService: !!this.hybridChartService?.fastChartService,
            backgroundWorker: !!this.hybridChartService?.backgroundWorker,
            chartDb: !!this.hybridChartService?.fastChartService?.chartDb
          },
          hybridPriceService: {
            available: !!this.hybridPriceService
          },
          environment: {
            heliusApiKey: !!process.env.HELIUS_API_KEY,
            moralisApiKey: !!process.env.MORALIS_API_KEY,
            nodeEnv: process.env.NODE_ENV || 'undefined'
          }
        }
      };
      
      res.json(health);
    });

    // Real-time chart updates endpoint (for polling)
    this.app.get('/api/tokens/:contract/live-updates', (req, res, next) => {
      // Add CORS headers
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
      next();
    }, async (req, res) => {
      try {
        const { contract } = req.params;
        const { sinceTimestamp } = req.query;

        console.log(`📡 [LIVE-UPDATES] Fetching updates for ${contract.substring(0, 8)}...`);

        // Check if hybridChartService is available
        if (!this.hybridChartService) {
          console.error(`❌ [LIVE-UPDATES] hybridChartService not available`);
          return res.status(500).json({
            success: false,
            error: 'Chart service not available',
            message: 'Backend service not properly initialized'
          });
        }

        if (!this.hybridChartService.fastChartService) {
          console.error(`❌ [LIVE-UPDATES] fastChartService not available`);
          return res.status(500).json({
            success: false,
            error: 'Fast chart service not available',
            message: 'Chart service not properly initialized'
          });
        }

        if (!this.hybridChartService.fastChartService.chartDb) {
          console.error(`❌ [LIVE-UPDATES] chartDb not available`);
          return res.status(500).json({
            success: false,
            error: 'Chart database not available',
            message: 'Database service not properly initialized'
          });
        }

        // Get pool address for this token
        const poolAddress = await this.hybridChartService.fastChartService.chartDb.getPoolAddress(contract);
        
        if (!poolAddress) {
          return res.status(404).json({
            success: false,
            error: 'Pool address not found',
            message: 'No pool data available for this token'
          });
        }

        // Get recent swaps since the given timestamp
        const swaps = await this.hybridChartService.fastChartService.chartDb.getRecentSwaps(
          poolAddress, 
          50, // Limit to recent swaps
          sinceTimestamp ? parseInt(sinceTimestamp) : null
        );

        // Get latest candles for all timeframes
        const timeframes = ['1MIN', '5MIN', '15MIN', '1H', '4H', '1D'];
        const latestCandles = {};
        
        for (const timeframe of timeframes) {
          const candles = await this.hybridChartService.fastChartService.chartDb.getCandles(
            poolAddress, 
            timeframe, 
            1 // Just the latest candle
          );
          if (candles && candles.length > 0) {
            latestCandles[timeframe] = candles[0];
          }
        }

        console.log(`📡 [LIVE-UPDATES] ✅ Found ${swaps.length} new swaps, ${Object.keys(latestCandles).length} updated candles`);

        res.json({
          success: true,
          contract: contract,
          poolAddress: poolAddress.substring(0, 8) + '...',
          updates: {
            newSwaps: swaps,
            latestCandles: latestCandles,
            timestamp: new Date().toISOString()
          },
          metadata: {
            swapsCount: swaps.length,
            candlesCount: Object.keys(latestCandles).length,
            source: 'realtime'
          }
        });

      } catch (error) {
        console.error(`❌ [LIVE-UPDATES] Error:`, error.message);
        console.error(`❌ [LIVE-UPDATES] Stack:`, error.stack);
        res.status(500).json({
          success: false,
          error: 'Failed to get live updates',
          message: error.message,
          stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
      }
    });

    // Chart close notification endpoint
    this.app.post('/api/tokens/:contract/close-chart', (req, res, next) => {
      // Add CORS headers
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
      next();
    }, async (req, res) => {
      try {
        const { contract } = req.params;

        console.log(`📡 [CHART-CLOSE] User closing chart for ${contract.substring(0, 8)}...`);

        // Check if hybridChartService is available
        if (!this.hybridChartService) {
          console.error(`❌ [CHART-CLOSE] hybridChartService not available`);
          return res.status(500).json({
            success: false,
            error: 'Chart service not available',
            message: 'Backend service not properly initialized'
          });
        }

        if (!this.hybridChartService.fastChartService) {
          console.error(`❌ [CHART-CLOSE] fastChartService not available`);
          return res.status(500).json({
            success: false,
            error: 'Fast chart service not available',
            message: 'Chart service not properly initialized'
          });
        }

        if (!this.hybridChartService.fastChartService.chartDb) {
          console.error(`❌ [CHART-CLOSE] chartDb not available`);
          return res.status(500).json({
            success: false,
            error: 'Chart database not available',
            message: 'Database service not properly initialized'
          });
        }

        if (!this.hybridChartService.backgroundWorker) {
          console.error(`❌ [CHART-CLOSE] backgroundWorker not available`);
          return res.status(500).json({
            success: false,
            error: 'Background worker not available',
            message: 'Background worker not properly initialized'
          });
        }

        // Get pool address for this token
        const poolAddress = await this.hybridChartService.fastChartService.chartDb.getPoolAddress(contract);
        
        if (!poolAddress) {
          return res.status(404).json({
            success: false,
            error: 'Pool address not found',
            message: 'No pool data available for this token'
          });
        }

        // Stop real-time monitoring for this pool
        await this.hybridChartService.backgroundWorker.stopRealTimeMonitoring(poolAddress);

        console.log(`📡 [CHART-CLOSE] ✅ Stopped real-time monitoring for ${poolAddress.substring(0, 8)}`);

        res.json({
          success: true,
          contract: contract,
          poolAddress: poolAddress.substring(0, 8) + '...',
          message: 'Chart closed and WebSocket monitoring stopped',
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        console.error(`❌ [CHART-CLOSE] Error:`, error.message);
        console.error(`❌ [CHART-CLOSE] Stack:`, error.stack);
        res.status(500).json({
          success: false,
          error: 'Failed to close chart',
          message: error.message,
          stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
      }
    });

    // OPTIONS handler for CORS preflight
    this.app.options('/api/tokens/:contract/live-updates', (req, res) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
      res.sendStatus(200);
    });

    this.app.options('/api/tokens/:contract/close-chart', (req, res) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
      res.sendStatus(200);
    });

    // Professional Chart Architecture Endpoints
    
    // Get professional chart cache statistics
    this.app.get('/api/charts/professional/cache-stats', async (req, res) => {
      try {
        const cacheStats = this.hybridChartService.getCacheStats();
        
        res.json({
          success: true,
          data: cacheStats,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('[🛡️ Enhanced Backend] ❌ Cache stats error:', error.message);
        res.status(500).json({
          success: false,
          error: 'Failed to fetch cache statistics',
          message: error.message
        });
      }
    });

    // Force complete backfill for a token
    this.app.post('/api/charts/professional/backfill/:contract', async (req, res) => {
      try {
        const { contract } = req.params;
        
        if (!contract) {
          return res.status(400).json({ 
            success: false, 
            error: 'Contract address required' 
          });
        }
        
        console.log(`🔄 [PROFESSIONAL] Force backfill for ${contract.substring(0, 8)}`);
        
        const result = await this.hybridChartService.forceBackfill(contract);
        
        res.json({
          success: true,
          data: {
            pricePoints: result.priceData.length,
            buySellEvents: result.buySellData.length,
            contract: contract.substring(0, 8) + '...'
          },
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('[🛡️ Enhanced Backend] ❌ Force backfill error:', error.message);
        res.status(500).json({
          success: false,
          error: 'Failed to force backfill',
          message: error.message
        });
      }
    });

    // Clear cache for a specific token
    this.app.delete('/api/charts/professional/cache/:contract', async (req, res) => {
      try {
        const { contract } = req.params;
        
        if (!contract) {
          return res.status(400).json({ 
            success: false, 
            error: 'Contract address required' 
          });
        }
        
        console.log(`🗑️ [PROFESSIONAL] Clearing cache for ${contract.substring(0, 8)}`);
        
        this.hybridChartService.clearCache(contract);
        
        res.json({
          success: true,
          message: `Cache cleared for ${contract.substring(0, 8)}...`,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('[🛡️ Enhanced Backend] ❌ Clear cache error:', error.message);
        res.status(500).json({
          success: false,
          error: 'Failed to clear cache',
          message: error.message
        });
      }
    });

    // Clear all caches
    this.app.delete('/api/charts/professional/cache', async (req, res) => {
      try {
        console.log(`🗑️ [PROFESSIONAL] Clearing all caches`);
        
        this.hybridChartService.clearCache();
        
        res.json({
          success: true,
          message: 'All caches cleared',
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('[🛡️ Enhanced Backend] ❌ Clear all caches error:', error.message);
        res.status(500).json({
          success: false,
          error: 'Failed to clear all caches',
          message: error.message
        });
      }
    });

    // Get professional chart data source statistics
    this.app.get('/api/charts/professional/stats', async (req, res) => {
      try {
        const stats = this.hybridChartService.getDataSourceStats();
        
        res.json({
          success: true,
          data: stats,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('[🛡️ Enhanced Backend] ❌ Professional stats error:', error.message);
        res.status(500).json({
          success: false,
          error: 'Failed to fetch professional statistics',
          message: error.message
        });
      }
    });

    // Fast Chart Architecture endpoints

    // Get database statistics
    this.app.get('/api/charts/database/stats', async (req, res) => {
      try {
        const dbStats = await this.hybridChartService.getDatabaseStats();
        
        res.json({
          success: true,
          data: dbStats,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('[🛡️ Enhanced Backend] ❌ Database stats error:', error.message);
        res.status(500).json({
          success: false,
          error: 'Failed to get database statistics',
          message: error.message
        });
      }
    });

    // Get background worker status
    this.app.get('/api/charts/worker/status', async (req, res) => {
      try {
        const workerStatus = await this.hybridChartService.getWorkerStatus();
        
        res.json({
          success: true,
          data: workerStatus,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('[🛡️ Enhanced Backend] ❌ Worker status error:', error.message);
        res.status(500).json({
          success: false,
          error: 'Failed to get worker status',
          message: error.message
        });
      }
    });

    // Add token to background worker
    this.app.post('/api/charts/worker/add-token', async (req, res) => {
      try {
        const { tokenAddress } = req.body;
        
        if (!tokenAddress) {
          return res.status(400).json({
            success: false,
            error: 'Token address is required'
          });
        }

        console.log(`➕ [FAST-CHART] Adding token ${tokenAddress.substring(0, 8)} to background worker`);
        
        const result = await this.hybridChartService.addToken(tokenAddress);
        
        res.json({
          success: true,
          data: result,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('[🛡️ Enhanced Backend] ❌ Add token error:', error.message);
        res.status(500).json({
          success: false,
          error: 'Failed to add token to background worker',
          message: error.message
        });
      }
    });

    // Refresh token data
    this.app.post('/api/charts/refresh/:contract', async (req, res) => {
      try {
        const { contract } = req.params;
        
        console.log(`🔄 [FAST-CHART] Refreshing data for ${contract.substring(0, 8)}`);
        
        const result = await this.hybridChartService.refreshToken(contract);
        
        res.json({
          success: true,
          data: result,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('[🛡️ Enhanced Backend] ❌ Refresh error:', error.message);
        res.status(500).json({
          success: false,
          error: 'Failed to refresh token data',
          message: error.message
        });
      }
    });

    // Get recent transactions for a token
    this.app.get('/api/charts/:contract/transactions', async (req, res) => {
      try {
        const { contract } = req.params;
        const { limit = 10 } = req.query;
        
        const transactions = await this.hybridChartService.getRecentTransactions(contract, parseInt(limit));
        
        res.json({
          success: true,
          data: transactions,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('[🛡️ Enhanced Backend] ❌ Transactions error:', error.message);
        res.status(500).json({
          success: false,
          error: 'Failed to get recent transactions',
          message: error.message
        });
      }
    });

    // Get recent swaps for TX table
    this.app.get('/api/charts/swaps/:token', async (req, res) => {
      try {
        const { token } = req.params;
        const { limit = 50, since } = req.query;
        
        console.log(`📊 [SWAPS-API] Fetching swaps for ${token.substring(0, 8)}...`);
        console.log(`   Limit: ${limit}, Since: ${since || 'all'}`);
        
        // Get pool address for the token
        // First try from EnhancedHybridPriceService (for gRPC monitored tokens)
        let poolAddress = this.enhancedHybridPriceService?.poolAddresses.get(token);
        let useEnhancedHybrid = !!poolAddress;
        
        // Fallback to hybridChartService
        if (!poolAddress) {
          poolAddress = await this.hybridChartService.fastChartService.chartDb.getPoolAddress(token);
        }
        
        if (!poolAddress) {
          console.log(`⚠️ [SWAPS-API] No pool address found for ${token.substring(0, 8)}`);
          return res.json({
            success: true,
            swaps: [],
            source: 'none',
            lastUpdate: Date.now(),
            totalSwaps: 0,
            message: 'No pool address found - token may not be trading yet'
          });
        }
        
        // Get recent swaps from database - use EnhancedHybridPriceService if available
        const sinceTimestamp = since ? parseInt(since) / 1000 : null; // Convert ms to seconds
        let swaps = [];
        
        if (useEnhancedHybrid && this.enhancedHybridPriceService?.chartDatabase) {
          // ✅ FIX: Get swaps from token database by TOKEN ADDRESS, not pool address
          const tokenDb = this.enhancedHybridPriceService.chartDatabase.getTokenDatabase(token);
          
          // The database loads from file automatically when getTokenDatabase is called
          // No need to manually call loadTokenDatabaseFromFile here
          
          if (tokenDb && tokenDb.swaps) {
            for (const swap of tokenDb.swaps.values()) {
              swaps.push(swap);
            }
          }
          
          // Apply limit and sort
          if (sinceTimestamp) {
            swaps = swaps.filter(s => s.timestamp > sinceTimestamp);
          }
          swaps.sort((a, b) => b.timestamp - a.timestamp);
          swaps = swaps.slice(0, parseInt(limit));
          
          console.log(`✅ [SWAPS-API] Retrieved ${swaps.length} swaps from gRPC token database for ${token.substring(0, 8)}`);
        } else {
          // Fallback to hybridChartService
          swaps = await this.hybridChartService.fastChartService.chartDb.getRecentSwaps(
            poolAddress, 
            parseInt(limit), 
            sinceTimestamp
          );
          console.log(`✅ [SWAPS-API] Retrieved ${swaps.length} swaps from Helius database for ${token.substring(0, 8)}`);
        }
        
        // Format swaps for frontend
        const formattedSwaps = swaps.map(swap => ({
          signature: swap.signature,
          timestamp: swap.timestamp,
          type: swap.type,
          usdValue: swap.volumeUsd,
          tokenAmount: swap.tokenAmount,
          baseAmount: swap.baseAmount,
          baseToken: swap.baseToken,
          price: swap.price,
          maker: swap.maker,
          source: swap.source
        }));
        
        res.json({
          success: true,
          swaps: formattedSwaps,
          source: useEnhancedHybrid ? 'grpc_realtime' : 'helius',
          lastUpdate: Date.now(),
          totalSwaps: swaps.length,
          poolAddress: poolAddress.substring(0, 8) + '...'
        });
        
      } catch (error) {
        console.error('[🛡️ Enhanced Backend] ❌ Swaps API error:', error.message);
        res.status(500).json({
          success: false,
          error: 'Failed to get recent swaps',
          message: error.message
        });
      }
    });

    // Re-backfill existing tokens with raw swaps
    this.app.post('/api/charts/re-backfill', async (req, res) => {
      try {
        console.log('🔄 [RE-BACKFILL] Starting re-backfill of existing tokens...');
        
        await this.hybridChartService.backgroundWorker.reBackfillExistingTokens();
        
        res.json({
          success: true,
          message: 'Re-backfill completed successfully',
          timestamp: new Date().toISOString()
        });
        
      } catch (error) {
        console.error('[🛡️ Enhanced Backend] ❌ Re-backfill error:', error.message);
        res.status(500).json({
          success: false,
          error: 'Failed to re-backfill existing tokens',
          message: error.message
        });
      }
    });

    // Temporary Admin Endpoint for Testing
    this.app.post('/api/admin/revoke-premium', async (req, res) => {
      try {
        const { username, reason = 'Admin action' } = req.body;
        
        if (!username) {
          return res.status(400).json({ success: false, error: 'Username required' });
        }
        
        console.log(`🔧 [ADMIN] Revoking premium access for user: ${username}`);
        
        // Get all users to find the target user
        const allUsers = await this.oauthXService.db.getAllUsers();
        const targetUser = allUsers.find(user => 
          user.username && user.username.toLowerCase() === username.toLowerCase()
        );
        
        if (!targetUser) {
          return res.status(404).json({ 
            success: false, 
            error: `User "${username}" not found`,
            availableUsers: allUsers.map(u => u.username).filter(Boolean).slice(0, 10)
          });
        }
        
        // Get current premium status
        const currentPremium = await this.oauthXService.db.getPremiumStatus(targetUser.id);
        
        if (!currentPremium?.isPremium) {
          return res.json({ 
            success: true, 
            message: `User "${username}" is already non-premium`,
            currentStatus: currentPremium
          });
        }
        
        // Revoke premium access
        const revokedPremium = await this.oauthXService.db.setPremiumStatus(targetUser.id, {
          ...currentPremium,
          isPremium: false,
          subscriptionType: 'revoked_for_testing',
          updatedAt: new Date().toISOString(),
          revokedAt: new Date().toISOString(),
          revokedReason: reason
        });
        
        console.log(`✅ [ADMIN] Premium access revoked for ${username}`);
        
        res.json({
          success: true,
          message: `Premium access revoked for user "${username}"`,
          user: {
            id: targetUser.id,
            username: targetUser.username
          },
          previousStatus: {
            isPremium: currentPremium.isPremium,
            subscriptionType: currentPremium.subscriptionType,
            expiresAt: currentPremium.expiresAt
          },
          newStatus: {
            isPremium: revokedPremium.isPremium,
            subscriptionType: revokedPremium.subscriptionType,
            revokedAt: revokedPremium.revokedAt,
            revokedReason: revokedPremium.revokedReason
          }
        });
        
      } catch (error) {
        console.error('❌ [ADMIN] Error revoking premium access:', error.message);
        res.status(500).json({ 
          success: false, 
          error: 'Failed to revoke premium access',
          message: error.message
        });
      }
    });

    // Automated Token Cleanup Management Endpoints
    
    // Get automated cleanup status
    this.app.get('/api/cleanup/status', async (req, res) => {
      try {
        const status = await this.automatedCleanup.getStatus();
        
        res.json({
          success: true,
          service: 'Automated Token Cleanup',
          status: status,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        console.error('[🛡️ Enhanced Backend] ❌ Cleanup status error:', error.message);
        res.status(500).json({
          success: false,
          error: 'Failed to get cleanup status',
          message: error.message
        });
      }
    });

    // Force immediate cleanup
    this.app.post('/api/cleanup/force', async (req, res) => {
      try {
        console.log('[🛡️ Enhanced Backend] 🔧 Force cleanup requested');
        
        await this.automatedCleanup.forceCleanup();
        
        res.json({
          success: true,
          message: 'Force cleanup completed',
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        console.error('[🛡️ Enhanced Backend] ❌ Force cleanup error:', error.message);
        res.status(500).json({
          success: false,
          error: 'Failed to run force cleanup',
          message: error.message
        });
      }
    });

    // Update cleanup interval
    this.app.post('/api/cleanup/interval', async (req, res) => {
      try {
        const { hours } = req.body;
        
        if (!hours || typeof hours !== 'number' || hours < 1) {
          return res.status(400).json({
            success: false,
            error: 'Invalid hours parameter. Must be a number >= 1'
          });
        }

        this.automatedCleanup.setCleanupInterval(hours);
        
        res.json({
          success: true,
          message: `Cleanup interval updated to ${hours} hours`,
          interval: hours,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        console.error('[🛡️ Enhanced Backend] ❌ Update interval error:', error.message);
        res.status(500).json({
          success: false,
          error: 'Failed to update cleanup interval',
          message: error.message
        });
      }
    });


    // Portfolio Analysis endpoints (receives data from jup-discovery background worker)
    this.app.post('/api/portfolio/analyze', async (req, res) => {
      try {
        const { walletAddress, includeTokens = true, includeLSTs = true } = req.body;
        
        if (!walletAddress || walletAddress.length < 32) {
          return res.status(400).json({
            success: false,
            error: 'Invalid wallet address'
          });
        }
        
        console.log(`📊 [Portfolio API] Analyzing portfolio for ${walletAddress}`);
        
        // Check if we have cached data from jup-discovery microservice
        if (this.portfolioCache && this.portfolioCache.has(walletAddress)) {
          const cached = this.portfolioCache.get(walletAddress);
          const ageMinutes = (Date.now() - cached.timestamp) / (1000 * 60);
          
          if (ageMinutes < 5) { // Use cached data if less than 5 minutes old
            console.log(`📊 [Portfolio API] Using cached data (${ageMinutes.toFixed(1)} minutes old)`);
            return res.json({
              success: true,
              sol: cached.portfolioData.solBalance?.sol || 0,
              lsts: cached.portfolioData.lstHoldings?.map(lst => ({
                symbol: lst.symbol,
                amount: lst.amount,
                apr: lst.apr || 0
              })) || [],
              totalValue: cached.portfolioData.totalValue || 0,
              currentYield: cached.portfolioData.currentYield || 0,
              insights: cached.portfolioData.insights || [],
              timestamp: cached.portfolioData.timestamp || new Date().toISOString()
            });
          }
        }
        
        // Call twitter-service microservice for real portfolio data
        console.log(`📊 [Portfolio API] Calling twitter-service microservice for ${walletAddress}`);
        
        try {
          const twitterServiceUrl = process.env.TWITTER_SERVICE_URL || 'https://dgo-2.onrender.com';
          const response = await fetch(`${twitterServiceUrl}/api/portfolio/analyze`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
              walletAddress,
              includeTokens: true,
              includeLSTs: true
            })
          });
          
          if (response.ok) {
            const result = await response.json();
            console.log(`✅ [Portfolio API] Received real data from twitter-service for ${walletAddress}`);
            
            // Cache the real data
            if (!this.portfolioCache) {
              this.portfolioCache = new Map();
            }
            this.portfolioCache.set(walletAddress, {
              portfolioData: result,
              timestamp: Date.now()
            });
            
            // Return the real data
            return res.json(result);
          } else {
            console.warn(`⚠️ [Portfolio API] twitter-service returned ${response.status}, falling back to mock data`);
          }
        } catch (error) {
          console.warn(`⚠️ [Portfolio API] twitter-service call failed: ${error.message}, falling back to mock data`);
        }
        
        // Fallback to mock data if twitter-service is not available
        console.log(`📊 [Portfolio API] Using mock data for ${walletAddress}`);
        const mockPortfolio = {
          success: true,
          sol: 31.0,
          lsts: [
            { symbol: 'jitoSOL', amount: 5.2, apr: 5.8 },
            { symbol: 'mSOL', amount: 3.8, apr: 5.6 }
          ],
          totalValue: 40.0,
          currentYield: 4.2,
          insights: [],
          timestamp: new Date().toISOString()
        };
        
        res.json(mockPortfolio);
        
      } catch (error) {
        console.error(`❌ [Portfolio API] Analysis failed:`, error.message);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Strategy Generation endpoint (receives data from jup-discovery background worker)
    this.app.post('/api/strategy/generate', async (req, res) => {
      try {
        const { walletAddress, portfolioData, strategyType = 'basic', preferences = {} } = req.body;
        
        if (!walletAddress || walletAddress.length < 32) {
          return res.status(400).json({
            success: false,
            error: 'Invalid wallet address'
          });
        }
        
        console.log(`🧠 [Strategy API] Generating ${strategyType} strategy for ${walletAddress}`);
        
        // Call twitter-service microservice for real strategy generation
        try {
          const twitterServiceUrl = process.env.TWITTER_SERVICE_URL || 'https://dgo-2.onrender.com';
          const response = await fetch(`${twitterServiceUrl}/api/strategy/generate`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
              walletAddress,
              strategyType,
              userPreferences: preferences
            })
          });
          
          if (response.ok) {
            const result = await response.json();
            console.log(`✅ [Strategy API] Received real strategy from twitter-service for ${walletAddress}`);
            
            // Return the real strategy
            return res.json(result.strategy);
          } else {
            console.warn(`⚠️ [Strategy API] twitter-service returned ${response.status}, falling back to mock data`);
          }
        } catch (error) {
          console.warn(`⚠️ [Strategy API] twitter-service call failed: ${error.message}, falling back to mock data`);
        }
        
        // Fallback to mock data if twitter-service is not available
        console.log(`🧠 [Strategy API] Using mock data for ${walletAddress}`);
        const mockStrategy = {
          id: `strategy-${Date.now()}`,
          type: strategyType,
          currentYield: portfolioData?.currentYield || 4.2,
          expectedYield: strategyType === 'basic' ? 6.2 : 7.5,
          improvement: strategyType === 'basic' ? 2.0 : 3.3,
          riskScore: strategyType === 'basic' ? 4.8 : 6.5,
          allocation: [
            { symbol: 'jitoSOL', name: 'Jito Staked SOL', percentage: 50, amount: (portfolioData?.sol || 31) * 0.5, apr: 5.8, riskScore: 3.2, reasoning: 'High APR with low risk' },
            { symbol: 'mSOL', name: 'Marinade Staked SOL', percentage: 30, amount: (portfolioData?.sol || 31) * 0.3, apr: 5.6, riskScore: 2.8, reasoning: 'Diversified validator network' },
            { symbol: 'bSOL', name: 'BlazeStake SOL', percentage: 20, amount: (portfolioData?.sol || 31) * 0.2, apr: 5.9, riskScore: 3.5, reasoning: 'Community-driven with high yield' }
          ],
          actions: [
            { type: 'swap', from: 'SOL', to: 'jitoSOL', amount: (portfolioData?.sol || 31) * 0.5, reasoning: 'Convert unstacked SOL to high-yield LST' },
            { type: 'swap', from: 'SOL', to: 'mSOL', amount: (portfolioData?.sol || 31) * 0.3, reasoning: 'Diversify across validator networks' },
            { type: 'swap', from: 'SOL', to: 'bSOL', amount: (portfolioData?.sol || 31) * 0.2, reasoning: 'Add community-driven LST for higher yield' }
          ],
          risks: ['Validator slashing risk', 'Liquidity risk'],
          benefits: ['Higher yield', 'Diversified exposure', 'MEV rewards'],
          cost: strategyType === 'basic' ? 1.20 : 2.00,
          generatedAt: new Date().toISOString()
        };
        
        res.json(mockStrategy);
        
      } catch (error) {
        console.error(`❌ [Strategy API] Generation failed:`, error.message);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Internal endpoint for jup-discovery background worker to send portfolio data
    this.app.post('/api/internal/portfolio/import', async (req, res) => {
      try {
        const internalToken = process.env.INTERNAL_TOKEN || process.env.DISCOVERY_INTERNAL_TOKEN;
        const providedToken = req.headers['x-internal-token'] || req.query.token;

        if (!internalToken) {
          return res.status(503).json({ success: false, error: 'Internal import not configured (no INTERNAL_TOKEN)' });
        }
        if (!providedToken || providedToken !== internalToken) {
          return res.status(403).json({ success: false, error: 'Forbidden' });
        }

        const { walletAddress, portfolioData, strategyData } = req.body || {};
        
        console.log(`📊 [Portfolio Import] Received portfolio data for ${walletAddress}`);
        
        // Store the portfolio data in memory cache for the frontend to retrieve
        if (!this.portfolioCache) {
          this.portfolioCache = new Map();
        }
        
        this.portfolioCache.set(walletAddress, {
          portfolioData,
          strategyData,
          timestamp: Date.now()
        });
        
        res.json({
          success: true,
          message: `Portfolio data imported for ${walletAddress}`,
          timestamp: new Date().toISOString()
        });
        
      } catch (error) {
        console.error(`❌ [Portfolio Import] Import failed:`, error.message);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

  }

  setupImageUpload() {
    // Configure multer for image uploads
    const storage = multer.diskStorage({
      destination: async (req, file, cb) => {
        try {
          const uploadDir = process.env.DATA_DIR 
            ? path.join(process.env.DATA_DIR, 'uploads', 'images')
            : path.join(process.cwd(), 'data', 'uploads', 'images');
          
          await fs.mkdir(uploadDir, { recursive: true });
          cb(null, uploadDir);
        } catch (error) {
          cb(error);
        }
      },
      filename: (req, file, cb) => {
        // Generate unique filename with timestamp and hash
        const timestamp = Date.now();
        const hash = crypto.createHash('md5').update(file.originalname + timestamp).digest('hex').substring(0, 8);
        const ext = path.extname(file.originalname);
        cb(null, `${timestamp}_${hash}${ext}`);
      }
    });

    const upload = multer({
      storage: storage,
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
        files: 1 // Only one file at a time
      },
      fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
        if (allowedTypes.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new Error('Invalid file type. Only JPG, PNG, GIF, WebP images are allowed.'));
        }
      }
    });

    // Image upload endpoint
    this.app.post('/api/admin/upload-image', upload.single('image'), async (req, res) => {
      try {
        if (!req.file) {
          return res.status(400).json({
            success: false,
            error: 'No image file provided'
          });
        }

        // Generate public URL for the uploaded image (always use HTTPS for security)
        const host = req.get('host');
        const imageUrl = `https://${host}/uploads/images/${req.file.filename}`;

        console.log(`[🛡️ Admin] 📷 Image uploaded: ${req.file.originalname} -> ${imageUrl}`);

        res.json({
          success: true,
          imageUrl: imageUrl,
          filename: req.file.filename,
          originalName: req.file.originalname,
          size: req.file.size,
          mimetype: req.file.mimetype
        });

      } catch (error) {
        console.error('[🛡️ Admin] ❌ Image upload error:', error.message);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Serve uploaded images statically
    const uploadsPath = process.env.DATA_DIR 
      ? path.join(process.env.DATA_DIR, 'uploads')
      : path.join(process.cwd(), 'data', 'uploads');
    
    this.app.use('/uploads', express.static(uploadsPath));
    
    console.log('📁 [IMAGE UPLOAD] Static file serving configured for:', uploadsPath);
  }

  setupBackgroundTasks() {
    // Background tasks will be started from the start() method
    // No event listeners needed here since Express doesn't emit 'ready' events

    // Auto-restart token processing if it stops (every 2 minutes)
    setInterval(async () => {
      try {
        await this.autoRestartTokenProcessing();
      } catch (error) {
        console.error('[🛡️ Enhanced Backend] ❌ Auto-restart check failed:', error);
      }
    }, 2 * 60 * 1000); // Check every 2 minutes

    // Periodic cache refresh (every 10 minutes)
    setInterval(async () => {
      try {
        console.log('[🛡️ Enhanced Backend] 🔄 Periodic cache refresh...');
        await this.refreshCache();
      } catch (error) {
        console.error('[🛡️ Enhanced Backend] ❌ Periodic refresh failed:', error);
      }
    }, 10 * 60 * 1000);

    // Priority-based Jupiter data update (every 60 seconds - more frequent checks, but smart filtering)
    setInterval(async () => {
      try {
        console.log('[🛡️ Enhanced Backend] 🎯 Priority-based Jupiter data update...');
        await this.updateJupiterDataWithPriority();
      } catch (error) {
        console.error('[🛡️ Enhanced Backend] ❌ Priority Jupiter update failed:', error);
      }
    }, 60 * 1000);

    // Trending Topics Analysis (every 2 hours)
    setInterval(async () => {
      try {
        console.log('[🛡️ Enhanced Backend] 🔥 Running trending topics analysis...');
        await this.runTrendingTopicsAnalysis();
      } catch (error) {
        console.error('[🛡️ Enhanced Backend] ❌ Trending topics analysis failed:', error);
      }
    }, 2 * 60 * 60 * 1000); // Every 2 hours

    // Run initial trending topics analysis after 5 minutes
    setTimeout(async () => {
      try {
        console.log('[🛡️ Enhanced Backend] 🚀 Running initial trending topics analysis...');
        await this.runTrendingTopicsAnalysis();
      } catch (error) {
        console.error('[🛡️ Enhanced Backend] ❌ Initial trending topics analysis failed:', error);
      }
    }, 5 * 60 * 1000); // Wait 5 minutes after startup // Check every minute, but only update what needs updating based on priority
  }

  // ===== Trending Topics Analysis =====
  async runTrendingTopicsAnalysis() {
    try {
      if (!this.topicAnalysisService || !this.topicTrendingDatabase) {
        console.log('[🛡️ Enhanced Backend] ⚠️ Trending topics services not initialized, skipping analysis');
        return;
      }

      console.log('[🛡️ Enhanced Backend] 🔥 Starting trending topics analysis...');

      // Try CryptoTrackingDatabase first (if available)
      let recentPosts = [];
      
      if (this.cryptoTrackingDatabase) {
        try {
          const tweets = await this.cryptoTrackingDatabase.getTweetsByTimeframe('7d');
          console.log(`📊 [TRENDING TOPICS] Using CryptoTrackingDatabase: ${tweets.length} tweets`);
          
          // Convert tweets to posts format for consistent processing
          recentPosts = tweets.map(tweet => ({
            ...tweet,
            topics: tweet.topics || tweet.intelligence?.topics || []
          }));
        } catch (error) {
          console.warn('[🛡️ Enhanced Backend] Failed to get tweets from CryptoTrackingDatabase:', error.message);
        }
      }
      
      // Fallback to KOLService if available and CryptoTrackingDatabase is empty
      if (recentPosts.length === 0 && this.kolService) {
        try {
          const allPosts = this.kolService.getPosts();
          const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
          
          recentPosts = allPosts.filter(post => 
            new Date(post.created_at) >= sevenDaysAgo
          );
          console.log(`📊 [TRENDING TOPICS] Using KOLService: ${recentPosts.length} posts`);
        } catch (error) {
          console.warn('[🛡️ Enhanced Backend] Failed to get posts from KOLService:', error.message);
        }
      }
      
      if (!recentPosts || recentPosts.length === 0) {
        console.log('[🛡️ Enhanced Backend] ⚠️ No recent posts found for trending topics analysis');
        return;
      }

      console.log(`[🛡️ Enhanced Backend] 🔥 Analyzing ${recentPosts.length} posts for trending topics...`);

      // Extract topics from posts (they already have topics from analysis)
      const topicCounts = {};
      const topicAuthors = {}; // Track which authors discussed each topic
      let totalTopics = 0;
      
      recentPosts.forEach(post => {
        if (post.topics && post.topics.length > 0) {
          const author = post.author?.username || 'Unknown';
          post.topics.forEach(topic => {
            topicCounts[topic] = (topicCounts[topic] || 0) + 1;
            totalTopics++;
            
            // Track authors for each topic
            if (!topicAuthors[topic]) {
              topicAuthors[topic] = [];
            }
            if (!topicAuthors[topic].includes(author)) {
              topicAuthors[topic].push(author);
            }
          });
        }
      });

      // Convert to trending topics format
      const trendingTopics = Object.entries(topicCounts)
        .map(([topic, count]) => ({
          topic,
          count,
          percentage: ((count / totalTopics) * 100).toFixed(2),
          authors: topicAuthors[topic] || [], // Add authors list
          authorCount: topicAuthors[topic]?.length || 0,
          frequency: count,
          engagement: 0,
          sentiment: { positive: 0, negative: 0, neutral: 0, dominant: 'neutral' }
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 20); // Top 20 topics
      
      if (!trendingTopics || trendingTopics.length === 0) {
        console.log('[🛡️ Enhanced Backend] ⚠️ No trending topics found in analysis');
        return;
      }

      // Store the analysis results
      const analysis = {
        timeframe: '7d',
        totalPosts: recentPosts.length,
        totalTopics: totalTopics,
        topics: trendingTopics,
        analyzedAt: new Date().toISOString()
      };

      await this.topicTrendingDatabase.storeTrendingTopics(analysis);
      
      console.log(`[🛡️ Enhanced Backend] ✅ Trending topics analysis completed: ${trendingTopics.length} topics found`);
      
      // Log top 5 topics for visibility
      const topTopics = trendingTopics.slice(0, 5);
      console.log(`[🛡️ Enhanced Backend] 🔥 Top 5 trending topics:`, 
        topTopics.map(t => `${t.topic} (${t.count} mentions, ${t.percentage}%)`).join(', '));

    } catch (error) {
      console.error('[🛡️ Enhanced Backend] ❌ Trending topics analysis failed:', error.message);
      throw error;
    }
  }

  // ===== Social Context Cache Helpers =====
  async _loadSocialContextCache() {
    try {
      const raw = await fs.readFile(this.socialContextCachePath, 'utf8');
      const obj = JSON.parse(raw);
      this.socialContextCache = new Map(Object.entries(obj));
      console.log(`[🛡️ Enhanced Backend] 🧠 Loaded Social Context cache: ${this.socialContextCache.size} entries`);
    } catch (_) {
      // ignore
    }
  }

  async _saveSocialContextCache() {
    try {
      const obj = Object.fromEntries(this.socialContextCache.entries());
      await fs.writeFile(this.socialContextCachePath, JSON.stringify(obj, null, 2));
    } catch (e) {
      console.warn('[🛡️ Enhanced Backend] ⚠️ Failed saving Social Context cache:', e.message);
    }
  }

  _getSocialContextFromCache(contract, ttlMs) {
    try {
      const key = (contract || '').toLowerCase();
      const item = this.socialContextCache.get(key);
      if (!item) return null;
      const ts = Number(item.timestamp || 0);
      if (!Number.isFinite(ts) || Date.now() - ts > ttlMs) return null;
      return item;
    } catch (_) {
      return null;
    }
  }

  async _setSocialContextCache(contract, data) {
    try {
      const key = (contract || '').toLowerCase();
      this.socialContextCache.set(key, { timestamp: Date.now(), data });
      await this._saveSocialContextCache();
    } catch (_) {}
  }

  // Centralized function to take hype snapshots after score recalculation
  async takeHypeSnapshot(token) {
    try {
      if (!token.contractAddress) return;
      
      const mentions = token.mentions || token.twitterData?.mentions || 0;
      const followers = token.twitterData?.followers || 0;
      const engagement = (token.twitterData?.likes || 0) + (token.twitterData?.retweets || 0) + (token.twitterData?.replies || 0);
      const score = token.overallScore || token.enhancedScore || 0;
      const label = this.getHypeLabel(score);
      
      await this.hypeService.appendSnapshot(token.contractAddress, {
        score: score,
        label: label,
        mentions: mentions,
        twitterMentions: mentions,
        engagement: engagement,
        followers: followers,
        organicScore: token.jupiterData?.organicScore || token.organicScore || 0,
        volume24h: token.jupiterData?.volume24h || token.volume24h || 0,
        priceChange24h: token.jupiterData?.priceChange24h || token.priceChange24h || 0,
        communityHealthScore: token.communityHealthScore || 0,
        overallScore: score
      });
      
    } catch (snapErr) {
      console.log(`⚠️ Hype snapshot save failed for ${token.symbol}: ${snapErr.message}`);
    }
  }

  async getHypeDataForAnalysis(contractAddress, range = '7d') {
    try {
      console.log(`🧠 Getting hype data for analysis: ${contractAddress} (${range})`);
      
      // Get token from cache
      const tokens = await this.getTokensFromCache();
      const token = tokens.find(t => 
        t.contractAddress?.toLowerCase() === contractAddress.toLowerCase() ||
        t.symbol?.toLowerCase() === contractAddress.toLowerCase()
      );
      
      if (!token) {
        console.log(`🧠 Token not found for hype analysis: ${contractAddress}`);
        return [];
      }
      
      // First try to get real historical data from snapshots
      const ranges = { '1d': 1, '3d': 3, '7d': 7, '15d': 15, '30d': 30 };
      const days = ranges[range.toLowerCase()] || 7;
      const sinceMs = Date.now() - days * 24 * 60 * 60 * 1000;
      
      let realSnapshots = [];
      try {
        realSnapshots = await this.hypeService.getSnapshots(contractAddress, sinceMs);
        console.log(`🧠 Found ${realSnapshots.length} real hype snapshots for ${contractAddress}`);
      } catch (error) {
        console.log(`🧠 No real snapshots found for ${contractAddress}:`, error.message);
      }
      
      // If we have sufficient real data (at least 3 points), use it
      if (realSnapshots.length >= 3) {
        console.log(`🧠 Using ${realSnapshots.length} real hype data points for analysis`);
        return realSnapshots.map(snap => ({
          timestamp: snap.timestamp,
          score: snap.score || snap.communityHealthScore || 5,
          mentions: snap.mentions || snap.twitterMentions || 0,
          label: this.getHypeLabel(snap.score || snap.communityHealthScore || 5)
        }));
      }
      
      // Fallback: Generate synthetic data based on current token metrics
      console.log(`🧠 Insufficient real data (${realSnapshots.length} points), generating synthetic data for ${contractAddress}`);
      
      const now = Date.now();
      const hypeData = [];
      
      // Generate data points based on range
      const configs = {
        '1d': { points: 24, interval: 60 * 60 * 1000 }, // hourly for 1 day
        '3d': { points: 36, interval: 2 * 60 * 60 * 1000 }, // 2-hourly for 3 days  
        '7d': { points: 42, interval: 4 * 60 * 60 * 1000 }, // 4-hourly for 7 days
        '15d': { points: 45, interval: 8 * 60 * 60 * 1000 }, // 8-hourly for 15 days
        '30d': { points: 60, interval: 12 * 60 * 60 * 1000 } // 12-hourly for 30 days
      };
      
      const config = configs[range] || configs['7d'];
      const baseScore = token.communityHealthScore || token.score || token.overallScore || 5;
      const baseMentions = token.twitterData?.mentions || token.mentions || 10;
      
      // Generate historical data with token-specific patterns
      for (let i = 0; i < config.points; i++) {
        const timestamp = new Date(now - (config.points - i - 1) * config.interval);
        
        // Create token-specific trend based on actual metrics
        const progress = i / config.points;
        let trendFactor = 0;
        
        // Use token's actual performance to determine trend pattern
        const priceChange24h = token.jupiterData?.stats24h?.priceChange || token.priceChange24h || 0;
        const volumeChange24h = token.jupiterData?.stats24h?.volumeChange || token.volumeChange24h || 0;
        const holderChange = token.jupiterData?.holderChange || 0;
        
        // Different patterns based on token performance
        if (priceChange24h > 20 && volumeChange24h > 50) {
          // Explosive growth pattern
          trendFactor = Math.pow(progress, 2) * 2 - 1; // Exponential rise
        } else if (priceChange24h < -20) {
          // Decline pattern  
          trendFactor = -Math.pow(1 - progress, 2) * 1.5; // Exponential decline
        } else if (holderChange > 10) {
          // Steady growth pattern
          trendFactor = progress * 1.2 - 0.6; // Linear uptrend
        } else if (Math.abs(priceChange24h) < 5) {
          // Sideways/consolidation pattern
          trendFactor = Math.sin(progress * Math.PI * 4) * 0.2; // Small oscillations
        } else {
          // Volatile pattern
          trendFactor = Math.sin(progress * Math.PI * 6) * 0.8 + (Math.random() - 0.5) * 0.4;
        }
        
        const noise = (Math.random() - 0.5) * 0.8; // Reduced noise for cleaner patterns
        const score = Math.max(0, Math.min(10, baseScore + trendFactor + noise));
        const mentions = Math.max(0, baseMentions + Math.floor(trendFactor * 15 + noise * 8));
        
        hypeData.push({
          timestamp: timestamp.toISOString(),
          score: Math.round(score * 10) / 10,
          mentions: mentions,
          label: this.getHypeLabel(score),
          synthetic: true
        });
      }
      
      console.log(`🧠 Generated ${hypeData.length} synthetic hype data points for analysis`);
      return hypeData;
      
    } catch (error) {
      console.error('❌ Error getting hype data for analysis:', error);
      return [];
    }
  }

  getHypeLabel(score) {
    const numScore = parseFloat(score) || 0;
    
    // Match frontend statusUtils.js thresholds exactly
    if (numScore >= 9.0) return 'VIRAL';
    if (numScore >= 8.0) return 'TRENDING';  
    if (numScore >= 7.0) return 'BUILDING';
    if (numScore >= 5.0) return 'WAKING UP';
    return 'SLEEPING';
  }

  async reprocessTwitterDataInBackground() {
    try {
      console.log('🔄 [TwitterReprocess] Starting background Twitter data reprocessing...');
      
      // Load tokens from cache
      const dataDir = process.env.DATA_DIR || '/var/data/dgo';
      const cachePath = path.join(dataDir, 'cache', 'tokens-cache.json');
      
      console.log(`📂 [TwitterReprocess] Loading tokens from: ${cachePath}`);
      const cacheData = await fs.readFile(cachePath, 'utf8');
      const tokens = JSON.parse(cacheData);
      console.log(`✅ [TwitterReprocess] Loaded ${tokens.length} tokens from cache`);
      
      // Filter tokens that need Twitter data
      const tokensNeedingTwitterData = tokens.filter(token => {
        // Check if token has no Twitter data at all
        if (!token.twitterData) {
          return true;
        }
        
        // Check if Twitter data exists but has no tweets/mentions
        const hasTweets = token.twitterData.tweets && token.twitterData.tweets.length > 0;
        const hasMentions = token.twitterData.recentMentions && token.twitterData.recentMentions.length > 0;
        
        if (!hasTweets && !hasMentions) {
          return true;
        }
        
        // Check if Twitter data is very old (> 7 days)
        if (token.twitterTimestamp) {
          const lastUpdate = new Date(token.twitterTimestamp);
          const daysSinceUpdate = (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24);
          if (daysSinceUpdate > 7) {
            console.log(`⏰ [TwitterReprocess] ${token.symbol}: Twitter data is ${Math.floor(daysSinceUpdate)} days old, will refresh`);
            return true;
          }
        }
        
        return false;
      });
      
      console.log(`\n📊 [TwitterReprocess] Analysis Results:`);
      console.log(`   Total tokens: ${tokens.length}`);
      console.log(`   Tokens with Twitter data: ${tokens.length - tokensNeedingTwitterData.length}`);
      console.log(`   Tokens needing Twitter data: ${tokensNeedingTwitterData.length}\n`);
      
      if (tokensNeedingTwitterData.length === 0) {
        console.log('✅ [TwitterReprocess] All tokens already have Twitter data! Nothing to do.');
        return;
      }
      
      // Show sample of tokens to be processed
      console.log(`📋 [TwitterReprocess] Sample tokens to be processed:`);
      tokensNeedingTwitterData.slice(0, 10).forEach((token, i) => {
        const reason = !token.twitterData 
          ? 'No Twitter data' 
          : 'Empty tweets/mentions';
        console.log(`   ${i + 1}. ${token.symbol} (${token.contractAddress?.substring(0, 8)}...) - ${reason}`);
      });
      if (tokensNeedingTwitterData.length > 10) {
        console.log(`   ... and ${tokensNeedingTwitterData.length - 10} more`);
      }
      console.log('');
      
      console.log(`⚠️  [TwitterReprocess] This will fetch Twitter data for ${tokensNeedingTwitterData.length} tokens`);
      console.log(`⚠️  [TwitterReprocess] Estimated time: ${Math.ceil(tokensNeedingTwitterData.length * 30 / 60)} minutes (30s per token)`);
      console.log(`⚠️  [TwitterReprocess] Twitter API costs: ~$${(tokensNeedingTwitterData.length * 0.15).toFixed(2)} (TwitterAPI.io)\n`);
      
      // Initialize EnhancedTokenProcessor
      console.log('📊 [TwitterReprocess] Initializing EnhancedTokenProcessor...');
      const processor = new EnhancedTokenProcessor();
      await processor.initialize();
      console.log('✅ [TwitterReprocess] EnhancedTokenProcessor initialized\n');
      
      // Add tokens to processor queue
      console.log(`📥 [TwitterReprocess] Adding ${tokensNeedingTwitterData.length} tokens to processor queue...`);
      processor.processingQueue = tokensNeedingTwitterData;
      console.log(`✅ [TwitterReprocess] Tokens added to queue\n`);
      
      // Run through Twitter stage only (skip Jupiter - already have that data)
      console.log('🐦 [TwitterReprocess] Starting Twitter data fetching stage...');
      console.log('⏳ [TwitterReprocess] This may take a while...\n');
      
      const startTime = Date.now();
      await processor.processTwitterStage();
      const duration = Math.floor((Date.now() - startTime) / 1000);
      
      console.log(`\n✅ [TwitterReprocess] Twitter stage completed in ${Math.floor(duration / 60)}m ${duration % 60}s`);
      
      // Run through scoring stage to update scores with new Twitter data
      console.log('\n📊 [TwitterReprocess] Recalculating scores with new Twitter data...');
      await processor.processScoringStage();
      console.log('✅ [TwitterReprocess] Scoring stage completed');
      
      // Save updated tokens to cache
      console.log('\n💾 [TwitterReprocess] Saving updated tokens to cache...');
      await processor.saveFinalDatabase();
      console.log('✅ [TwitterReprocess] Tokens saved to cache');
      
      // Final stats
      console.log(`\n📊 [TwitterReprocess] Final Results:`);
      console.log(`   Tokens processed: ${tokensNeedingTwitterData.length}`);
      console.log(`   Time taken: ${Math.floor(duration / 60)}m ${duration % 60}s`);
      console.log(`   Average time per token: ${Math.floor(duration / tokensNeedingTwitterData.length)}s`);
      
      console.log('\n✅ [TwitterReprocess] Reprocessing completed successfully!');
      console.log('🎉 [TwitterReprocess] All tokens now have Twitter data and updated scores!\n');
      
    } catch (error) {
      console.error('❌ [TwitterReprocess] Reprocessing failed:', error.message);
      console.error(error.stack);
    }
  }

  async getTokensFromCache() {
    try {
      // ✅ CHECK MEMORY CACHE FIRST (but invalidate if it looks like old filtering logic)
      if (this.tokensCache.data && this.tokensCache.timestamp && 
          Date.now() - this.tokensCache.timestamp < this.tokensCache.TTL) {
        const cachedTokens = this.tokensCache.data;
        // If we have very few tokens (< 200), likely old filtering - force refresh
        if (cachedTokens.length < 200) {
          console.log(`[🛡️ Enhanced Backend] ⚠️ Memory cache has ${cachedTokens.length} tokens (likely old filtering), forcing refresh...`);
          this.tokensCache.timestamp = 0; // Force cache miss
        } else {
          console.log(`[🛡️ Enhanced Backend] 📦 Using cached tokens from memory (${cachedTokens.length} tokens)`);
          return cachedTokens;
        }
      }
      
      const cachePath = this.persistentCachePath;
      console.log(`[🛡️ Enhanced Backend] 🔍 Reading cache from: ${cachePath}`);
      
      // Check if file exists
      try {
        await fs.access(cachePath);
        console.log(`[🛡️ Enhanced Backend] ✅ Cache file exists at: ${cachePath}`);
      } catch (accessError) {
        console.log(`[🛡️ Enhanced Backend] ❌ Cache file NOT found at: ${cachePath}`);
        console.log(`[🛡️ Enhanced Backend] 🔍 DATA_DIR: ${process.env.DATA_DIR}`);
        console.log(`[🛡️ Enhanced Backend] 🔍 __dirname: ${__dirname}`);
        // Attempt automatic recovery from latest snapshot
        const restored = await this.attemptRestoreCacheFromLatestSnapshot(cachePath);
        if (!restored) {
          throw new Error(`Cache file not accessible: ${cachePath}`);
        }
      }
      
      const data = await fs.readFile(cachePath, 'utf8');
      const tokens = JSON.parse(data || '[]');

      // Apply image overrides for tokens with broken/custom images
      try {
        const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');
        const overridesPath = path.join(dataDir, 'cache', 'image-overrides.json');
        const overridesData = await fs.readFile(overridesPath, 'utf8');
        const imageOverrides = JSON.parse(overridesData || '{}');
        
        if (Object.keys(imageOverrides).length > 0) {
          tokens.forEach(token => {
            if (token.contractAddress && imageOverrides[token.contractAddress]) {
              if (!token.jupiterData) token.jupiterData = {};
              token.jupiterData.icon = imageOverrides[token.contractAddress];
            }
          });
          console.log(`[🛡️ Enhanced Backend] 🖼️ Applied ${Object.keys(imageOverrides).length} image overrides`);
        }
      } catch (overrideError) {
        // Silently fail if no overrides file exists
        if (overrideError.code !== 'ENOENT') {
          console.log(`[🛡️ Enhanced Backend] ⚠️ Image overrides error:`, overrideError.message);
        }
      }

      if (!Array.isArray(tokens) || tokens.length === 0) {
        console.log('[🛡️ Enhanced Backend] ⚠️ Cache is empty - attempting recovery from latest snapshot');
        const recovered = await this.attemptRestoreCacheFromLatestSnapshot(cachePath);
        if (recovered) {
          const recoveredData = await fs.readFile(cachePath, 'utf8');
          const recoveredTokens = JSON.parse(recoveredData || '[]');
          if (Array.isArray(recoveredTokens) && recoveredTokens.length > 0) {
            console.log(`[🛡️ Enhanced Backend] ✅ Auto-recovered ${recoveredTokens.length} tokens from latest snapshot`);
            return recoveredTokens;
          }
        }
      }

      console.log(`[🛡️ Enhanced Backend] 📊 Total tokens in cache: ${tokens.length}`);
      
      // Count tokens by stage
      const stageCount = {};
      tokens.forEach(token => {
        const stage = token.stage || 'undefined';
        stageCount[stage] = (stageCount[stage] || 0) + 1;
      });
      console.log(`[🛡️ Enhanced Backend] 📊 Tokens by stage:`, stageCount);

      // ✅ FIX: Return tokens from multiple stages, not just 'completed'
      // Include: completed, scoring, twitter, jupiter (stages with meaningful data)
      const validStages = ['completed', 'scoring', 'twitter', 'jupiter'];
      const validTokens = tokens.filter(t => {
        const stage = t.stage || 'undefined';
        const isValidStage = validStages.includes(stage);
        const hasContract = t.contractAddress && t.symbol;
        return isValidStage && hasContract;
      });
      
      console.log(`[🛡️ Enhanced Backend] 📊 Valid tokens (from stages: ${validStages.join(', ')}): ${validTokens.length}`);
      
      // Process tokens to ensure they have required fields
      const processedTokens = validTokens.map(token => {
        // If token is not completed, ensure it has basic fields
        if (token.stage !== 'completed') {
          return {
            ...token,
            price: token.jupiterData?.price || token.price || 0,
            marketCap: token.jupiterData?.mcap || token.marketCap || 0,
            volume24h: token.jupiterData?.volume1h ? token.jupiterData.volume1h * 24 : (token.volume24h || 0),
            score: token.score || token.overallScore || 5.0,
            _dataSource: token.stage === 'jupiter' ? 'jupiter-discovery' : token.stage
          };
        }
        return token;
      });

      // ✅ UPDATE MEMORY CACHE
      this.tokensCache.data = processedTokens;
      this.tokensCache.timestamp = Date.now();
      
      return processedTokens;

    } catch (error) {
      console.log('[🛡️ Enhanced Backend] ⚠️ No cache file found, starting fresh processing...');

      // Don't auto-start processing on cache miss to prevent duplicate API calls
      console.log('[🛡️ Enhanced Backend] 📝 Cache file not found, but not auto-starting processing (use manual trigger or wait for scheduled run)');

      return [];
    }
  }

  /**
   * Attempt to restore tokens-cache.json from the newest available snapshot
   */
  async attemptRestoreCacheFromLatestSnapshot(targetCachePath) {
    try {
      const candidate = await this.findLatestSnapshotCacheFile();
      if (!candidate) {
        console.log('[🛡️ Enhanced Backend] ⚠️ No snapshot cache file found for recovery');
        return false;
      }
      const targetDir = path.dirname(targetCachePath);
      await fs.mkdir(targetDir, { recursive: true });

      if (candidate.type === 'file') {
        const { snapshotCachePath, snapshotId } = candidate;
        const data = await fs.readFile(snapshotCachePath, 'utf8');
        await fs.writeFile(targetCachePath, data);
        console.log(`[🛡️ Enhanced Backend] 🔄 Restored cache from snapshot ${snapshotId}`);
      } else if (candidate.type === 'tar') {
        const { tarPath, snapshotId } = candidate;
        const extractedPath = await this.extractTokensCacheFromTar(tarPath);
        if (!extractedPath) throw new Error('Failed to extract tokens-cache.json from tar');
        const data = await fs.readFile(extractedPath, 'utf8');
        await fs.writeFile(targetCachePath, data);
        console.log(`[🛡️ Enhanced Backend] 🔄 Restored cache from tar snapshot ${snapshotId}`);
        try { await fs.rm(extractedPath, { force: true }); } catch (_) {}
      }
      return true;
    } catch (e) {
      console.warn('[🛡️ Enhanced Backend] ⚠️ Auto-recovery from snapshot failed:', e.message);
      return false;
    }
  }

  /**
   * Locate the newest snapshot's tokens-cache.json across known backup dirs
   */
  async findLatestSnapshotCacheFile() {
    // Use the imported fsSync
    const backupDirs = [];
    try {
      const dataDir = this.oauthXService?.db?.baseDir || process.env.DATA_DIR || '/var/data/dgo';
      const defaultBackups = path.join(path.dirname(dataDir), path.basename(dataDir) + '_backups');
      const envBackups = process.env.BACKUP_DIR || path.join(dataDir, 'backups');
      backupDirs.push(defaultBackups, envBackups, path.join(__dirname, 'local-backup-cache'));
    } catch (_) {}

    let newest = null;
    for (const dir of backupDirs) {
      try {
        const entries = fsSync.readdirSync(dir, { withFileTypes: true });
        // Prefer directory snapshots first
        const dirSnaps = entries.filter(d => d.isDirectory() && d.name.startsWith('snapshot_'));
        dirSnaps.sort((a, b) => b.name.localeCompare(a.name));
        for (const e of dirSnaps) {
          const snapshotId = e.name;
          const snapshotCache = path.join(dir, snapshotId, 'cache', 'tokens-cache.json');
          if (fsSync.existsSync(snapshotCache)) {
            newest = { type: 'file', snapshotCachePath: snapshotCache, snapshotId };
            break;
          }
        }
        // If none, look for tarballs
        if (!newest) {
          const tarSnaps = entries
            .filter(f => f.isFile() && /snapshot_.*\.(tar\.gz|tgz)$/i.test(f.name))
            .map(f => f.name)
            .sort((a, b) => b.localeCompare(a));
          if (tarSnaps.length > 0) {
            const tarName = tarSnaps[0];
            const tarPath = path.join(dir, tarName);
            const snapshotId = tarName.replace(/\.(tar\.gz|tgz)$/i, '');
            newest = { type: 'tar', tarPath, snapshotId };
          }
        }
        if (newest) break;
      } catch (_) {}
    }
    return newest;
  }

  /**
   * Extract cache/tokens-cache.json from a tar(.gz) snapshot to a temp file.
   */
  async extractTokensCacheFromTar(tarPath) {
    const { spawn } = await import('node:child_process');
    const os = await import('os');
    const tmpOut = path.join(os.tmpdir(), `tokens-cache-${Date.now()}.json`);
    // List entries to find the path to tokens-cache.json
    const listArgs = ['-tzf', tarPath];
    const listOutput = await new Promise((resolve, reject) => {
      let out = '';
      const p = spawn('tar', listArgs);
      p.stdout.on('data', d => out += d.toString());
      p.on('error', reject);
      p.on('close', code => code === 0 ? resolve(out) : reject(new Error(`tar -tzf exit ${code}`)));
    });
    const lines = listOutput.split(/\r?\n/).filter(Boolean);
    const entry = lines.find(l => /\/cache\/tokens-cache\.json$/.test(l));
    if (!entry) return null;
    // Extract just that entry to tmpOut
    await new Promise((resolve, reject) => {
      const p = spawn('tar', ['-xzf', tarPath, entry, '-O']);
      const fsOut = createWriteStream(tmpOut);
      p.stdout.pipe(fsOut);
      p.on('error', reject);
      p.on('close', code => code === 0 ? resolve() : reject(new Error(`tar extract exit ${code}`)));
    });
    return tmpOut;
  }

  /**
   * Get holder insights data for AI analysis (uses cache)
   */
  async getHolderInsights(contractAddress) {
    try {
      // Use the existing holder cache service
      const { default: HolderCacheService } = await import('./services/HolderCacheService.js');
      const holderCacheService = new HolderCacheService();
      
      // Get cached holder insights
      const cachedInsights = await holderCacheService.getCachedData(contractAddress, 'insights');
      
      if (cachedInsights) {
        console.log(`📊 Using cached holder data for AI analysis: ${contractAddress}`);
        return {
          success: true,
          data: cachedInsights
        };
      }
      
      // If not cached, fetch fresh data and cache it
      console.log(`📊 Fetching fresh holder data for AI analysis: ${contractAddress}`);
      const freshInsights = await this.fetchFreshHolderInsights(contractAddress);
      
      if (freshInsights.success) {
        // Cache the fresh data
        await holderCacheService.setCachedData(contractAddress, 'insights', freshInsights.data);
        console.log(`📊 Cached fresh holder data for future use: ${contractAddress}`);
      }
      
      return freshInsights;
    } catch (error) {
      console.error('Error getting holder insights:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Fetch fresh holder insights data (internal method)
   */
  async fetchFreshHolderInsights(contractAddress) {
    try {
      // Import holder services
      const { default: TopHoldersService } = await import('./services/TopHoldersService.js');
      const { default: HolderStatsService } = await import('./services/HolderStatsService.js');
      const { default: HolderTimeseriesService } = await import('./services/HolderTimeseriesService.js');
      
      const topHoldersService = new TopHoldersService();
      const holderStatsService = new HolderStatsService();
      const timeseriesService = new HolderTimeseriesService();
      
      // Fetch holder data in parallel
      const [topHoldersResult, holderStatsResult, timeseriesResult] = await Promise.allSettled([
        topHoldersService.getFormattedTopHolders(contractAddress, null, 20),
        holderStatsService.getFormattedHolderStats(contractAddress, null),
        timeseriesService.getHolderChangeAnalysis(contractAddress)
      ]);
      
      // Process results
      const holderData = {
        topHolders: topHoldersResult.status === 'fulfilled' && topHoldersResult.value.success ? 
          topHoldersResult.value : null,
        holderStats: holderStatsResult.status === 'fulfilled' && holderStatsResult.value.success ? 
          holderStatsResult.value : null,
        holderChanges: timeseriesResult.status === 'fulfilled' && timeseriesResult.value.success ? 
          timeseriesResult.value.holderChanges : null,
        currentHolders: timeseriesResult.status === 'fulfilled' && timeseriesResult.value.success ? 
          timeseriesResult.value.currentHolders : null,
        holderFlowData: timeseriesResult.status === 'fulfilled' && timeseriesResult.value.success ? 
          timeseriesResult.value.holderFlowData : null
      };
      
      return {
        success: true,
        data: holderData
      };
    } catch (error) {
      console.error('Error fetching fresh holder insights:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get call history statistics for a token
   */
  async getTokenCallHistory(contractAddress) {
    try {
      // Get all KOL calls for this token
      const allCalls = await this.oauthXService.db.getAllKolCalls();
      const tokenCalls = allCalls.filter(call => 
        call.contractAddress?.toLowerCase() === contractAddress.toLowerCase()
      );
      
      if (tokenCalls.length === 0) {
        return {
          totalCalls: 0,
          recentCalls: 0,
          successRate: 0,
          avgTimeTo2x: 'N/A'
        };
      }
      
      // Calculate recent calls (last 7 days)
      const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
      const recentCalls = tokenCalls.filter(call => 
        new Date(call.calledAt).getTime() > sevenDaysAgo
      ).length;
      
      // Calculate success rate (calls that hit 2x+)
      const successfulCalls = tokenCalls.filter(call => {
        const currentPrice = call.currentPrice || 0;
        const calledPrice = call.marketCap || 0;
        return calledPrice > 0 && (currentPrice / calledPrice) >= 2;
      });
      
      const successRate = tokenCalls.length > 0 
        ? (successfulCalls.length / tokenCalls.length) * 100 
        : 0;
      
      // Calculate average time to 2x for successful calls
      let avgTimeTo2x = 'N/A';
      if (successfulCalls.length > 0) {
        const times = successfulCalls
          .filter(call => call.athTimestamp && call.calledAt)
          .map(call => {
            const callTime = new Date(call.calledAt).getTime();
            const athTime = new Date(call.athTimestamp).getTime();
            return (athTime - callTime) / (1000 * 60 * 60); // Hours
          })
          .filter(time => time > 0 && time < 168); // Filter valid times (< 1 week)
        
        if (times.length > 0) {
          const avgHours = times.reduce((sum, time) => sum + time, 0) / times.length;
          if (avgHours < 24) {
            avgTimeTo2x = `${avgHours.toFixed(1)}h`;
          } else {
            avgTimeTo2x = `${(avgHours / 24).toFixed(1)}d`;
          }
        }
      }
      
      return {
        totalCalls: tokenCalls.length,
        recentCalls: recentCalls,
        successRate: Math.round(successRate),
        avgTimeTo2x: avgTimeTo2x
      };
      
    } catch (error) {
      console.error('[🧠 AI] ❌ Error getting token call history:', error.message);
      return {
        totalCalls: 0,
        recentCalls: 0,
        successRate: 0,
        avgTimeTo2x: 'N/A'
      };
    }
  }

  /**
   * Generate actionable recommendations for premium users
   */
  generateActionableRecommendations(analysis, token) {
    const recommendations = [];
    const sentiment = analysis.sentiment;
    const confidence = analysis.confidence;
    const communityScore = token.communityHealthScore || token.communityScore || 5;
    const mentions = token.twitterData?.mentions || 0;
    
    // High confidence bullish recommendations
    if (sentiment === 'Bullish' && confidence > 0.8) {
      recommendations.push({
        action: 'add_to_watchlist',
        priority: 'high',
        reason: 'This gem is showing diamond hands energy - add to watchlist to track the moon mission 🚀',
        icon: '⭐',
        tool: 'DeGen Oracle Watchlist'
      });
      
      if (communityScore > 7) {
        recommendations.push({
          action: 'track_hype_over_time',
          priority: 'high', 
          reason: 'Community is absolutely based - track momentum in Hype over Time for perfect entry timing',
          icon: '📈',
          tool: 'Hype over Time Analytics'
        });
      }
      
      if (mentions > 20 && communityScore > 6) {
        recommendations.push({
          action: 'make_kol_call',
          priority: 'high',
          reason: 'All signals bullish AF - this could be a 10x play. Make a KOL call before it moons!',
          icon: '🎯',
          tool: 'KOL Call Tracker'
        });
      }
    }
    
    // Medium confidence or neutral recommendations
    if (sentiment === 'Neutral' || (sentiment === 'Bullish' && confidence < 0.8)) {
      recommendations.push({
        action: 'monitor_closely',
        priority: 'medium',
        reason: 'Crab market vibes - wait for clearer signals before aping in',
        icon: '👀',
        tool: 'DeGen Oracle Watchlist'
      });
      
      if (communityScore > 6) {
        recommendations.push({
          action: 'add_to_watchlist',
          priority: 'medium',
          reason: 'Solid fundamentals but needs more confirmation - watchlist this gem',
          icon: '⭐',
          tool: 'DeGen Oracle Watchlist'
        });
      }
    }
    
    // Bearish recommendations
    if (sentiment === 'Bearish') {
      recommendations.push({
        action: 'avoid_or_wait',
        priority: 'high',
        reason: 'Major red flags detected - paper hands panic incoming. Wait for better entry or you might get rekt 📉',
        icon: '⚠️',
        tool: 'Risk Management'
      });
      
      if (confidence > 0.7) {
        recommendations.push({
          action: 'remove_from_watchlist',
          priority: 'medium',
          reason: 'Bearish AF - time to clean up your bags and focus on better plays',
          icon: '🗑️',
          tool: 'Portfolio Management'
        });
      }
    }
    
    return recommendations;
  }

  /**
   * Generate basic recommendations for free users
   */
  generateBasicRecommendations(analysis, token) {
    const recommendations = [];
    const sentiment = analysis.sentiment;
    
    if (sentiment === 'Bullish') {
      recommendations.push({
        action: 'add_to_watchlist',
        priority: 'medium',
        reason: 'Positive sentiment detected',
        icon: '⭐'
      });
    } else if (sentiment === 'Bearish') {
      recommendations.push({
        action: 'avoid_for_now',
        priority: 'medium', 
        reason: 'Negative sentiment suggests caution',
        icon: '⚠️'
      });
    } else {
      recommendations.push({
        action: 'monitor',
        priority: 'low',
        reason: 'Mixed signals - upgrade to Premium for detailed analysis',
        icon: '👀'
      });
    }
    
    return recommendations;
  }

  /**
   * Get AI usage count for a user (current month)
   */
  async getAIUsageCount(userId) {
    try {
      const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM format
      const usageFile = await this.oauthXService.db.getUserFile(userId, 'ai_usage.json');
      const usage = await this.oauthXService.db.readJsonFile(usageFile, {});
      
      return usage[currentMonth] || 0;
    } catch (error) {
      console.error('Error getting AI usage count:', error);
      return 0;
    }
  }

  /**
   * Track AI usage for a user
   */
  async trackAIUsage(userId, analysisId) {
    try {
      const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM format
      const usageFile = await this.oauthXService.db.getUserFile(userId, 'ai_usage.json');
      const usage = await this.oauthXService.db.readJsonFile(usageFile, {});
      
      // Increment usage count for current month
      usage[currentMonth] = (usage[currentMonth] || 0) + 1;
      
      // Keep track of analysis IDs for debugging
      if (!usage.analyses) usage.analyses = [];
      usage.analyses.push({
        id: analysisId,
        timestamp: new Date().toISOString(),
        month: currentMonth
      });
      
      // Keep only last 100 analyses to prevent file bloat
      if (usage.analyses.length > 100) {
        usage.analyses = usage.analyses.slice(-100);
      }
      
      await this.oauthXService.db.writeJsonFile(usageFile, usage);
      
      console.log(`📊 AI usage tracked for user ${userId}: ${usage[currentMonth]}/5 this month`);
    } catch (error) {
      console.error('Error tracking AI usage:', error);
    }
  }

  /**
   * Update user statistics with enhanced error handling and logging
   */
  async updateUserStats(userId, statName, increment = 1) {
    try {
      console.log(`📊 [updateUserStats] Starting update for user ${userId}, stat: ${statName}, increment: ${increment}`);
      
      const profileFile = await this.oauthXService.db.getUserFile(userId, 'profile.json');
      console.log(`📁 [updateUserStats] Profile file path: ${profileFile}`);
      
      const profile = await this.oauthXService.db.readJsonFile(profileFile, {});
      console.log(`📖 [updateUserStats] Current profile stats:`, profile.stats);
      
      // Initialize stats if they don't exist
      if (!profile.stats) {
        profile.stats = {
          tokensListed: 0,
          tokensFueled: 0,
          tokensUpdated: 0,
          totalSpent: {
            USD: 0,
            SOL: 0
          }
        };
        console.log(`🆕 [updateUserStats] Initialized new stats object for user ${userId}`);
      }
      
      // Store old value for logging
      const oldValue = profile.stats[statName] || 0;
      
      // Update the specific stat
      if (statName === 'totalSpent') {
        // Handle totalSpent as an object with USD and SOL
        if (typeof profile.stats.totalSpent === 'number') {
          // Migrate old format to new format
          profile.stats.totalSpent = {
            USD: profile.stats.totalSpent,
            SOL: 0
          };
        }
        
        // Determine currency based on context (premium = SOL, others = USD)
        const currency = increment <= 10 ? 'SOL' : 'USD'; // SOL amounts are typically < 10, USD amounts > 10
        
        if (!profile.stats.totalSpent[currency]) {
          profile.stats.totalSpent[currency] = 0;
        }
        
        profile.stats.totalSpent[currency] = (profile.stats.totalSpent[currency] || 0) + increment;
        console.log(`💰 [updateUserStats] Updated totalSpent ${currency}: ${oldValue} → ${profile.stats.totalSpent[currency]}`);
      } else {
        profile.stats[statName] = (profile.stats[statName] || 0) + increment;
      }
      
      // Update lastUpdated timestamp
      profile.lastUpdated = new Date().toISOString();
      
      if (statName === 'totalSpent') {
        console.log(`🔄 [updateUserStats] Updated ${statName}:`, profile.stats.totalSpent);
      } else {
        console.log(`🔄 [updateUserStats] Updating ${statName}: ${oldValue} → ${profile.stats[statName]}`);
      }
      
      // Save updated profile with retry logic
      let saveSuccess = false;
      let lastError = null;
      
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          await this.oauthXService.db.writeJsonFile(profileFile, profile);
          saveSuccess = true;
          console.log(`✅ [updateUserStats] Successfully saved profile on attempt ${attempt}`);
          break;
        } catch (saveError) {
          lastError = saveError;
          console.error(`❌ [updateUserStats] Save attempt ${attempt} failed:`, saveError.message);
          
          if (attempt < 3) {
            const delay = attempt * 1000; // 1s, 2s delays
            console.log(`⏳ [updateUserStats] Retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }
      
      if (!saveSuccess) {
        throw new Error(`Failed to save profile after 3 attempts. Last error: ${lastError?.message}`);
      }
      
      // Verify the save worked by reading back the file
      try {
        const verifyProfile = await this.oauthXService.db.readJsonFile(profileFile, {});
        let verifyValue;
        
        if (statName === 'totalSpent') {
          verifyValue = verifyProfile.stats?.totalSpent || { USD: 0, SOL: 0 };
        } else {
          verifyValue = verifyProfile.stats?.[statName] || 0;
        }
        
        let expectedValue;
        if (statName === 'totalSpent') {
          expectedValue = profile.stats.totalSpent;
        } else {
          expectedValue = profile.stats[statName];
        }
        
        if (JSON.stringify(verifyValue) !== JSON.stringify(expectedValue)) {
          console.error(`🚨 [updateUserStats] VERIFICATION FAILED! Expected:`, expectedValue, `Got:`, verifyValue);
          throw new Error(`Verification failed: expected ${JSON.stringify(expectedValue)}, got ${JSON.stringify(verifyValue)}`);
        } else {
          console.log(`✅ [updateUserStats] Verification successful: ${statName} =`, verifyValue);
        }
      } catch (verifyError) {
        console.error(`❌ [updateUserStats] Verification error:`, verifyError.message);
        // Don't throw here, the save might have worked but verification failed
      }
      
      if (statName === 'totalSpent') {
        console.log(`📊 [updateUserStats] Successfully updated ${statName} for user ${userId}:`, profile.stats.totalSpent);
        return profile.stats.totalSpent;
      } else {
        console.log(`📊 [updateUserStats] Successfully updated ${statName} for user ${userId}: ${profile.stats[statName]}`);
        return profile.stats[statName];
      }
      
    } catch (error) {
      console.error(`❌ [updateUserStats] Error updating user stats for ${userId}:`, error);
      console.error(`❌ [updateUserStats] Error details:`, {
        userId,
        statName,
        increment,
        errorMessage: error.message,
        errorStack: error.stack
      });
      return null;
    }
  }

  /**
   * Get user statistic
   */
  async getUserStat(userId, statName) {
    try {
      const profileFile = await this.oauthXService.db.getUserFile(userId, 'profile.json');
      const profile = await this.oauthXService.db.readJsonFile(profileFile, {});
      
      return profile.stats?.[statName] || 0;
    } catch (error) {
      console.error(`Error getting user stat ${statName} for ${userId}:`, error);
      return 0;
    }
  }

  async saveTokensToCache(tokens, retryCount = 0) {
    const lockPath = this.persistentCachePath + '.lock';
    let lockFile = null;
    
    try {
      const cachePath = this.persistentCachePath;
      
      // Ensure cache directory exists
      const cacheDir = path.dirname(cachePath);
      await fs.mkdir(cacheDir, { recursive: true });
      
      // 🛡️ ENHANCED FILE LOCKING: Create lock file to prevent concurrent access
      try {
        lockFile = await fs.open(lockPath, 'wx'); // Exclusive write lock
        console.log(`[🛡️ Enhanced Backend] 🔒 Acquired cache lock`);
      } catch (lockError) {
        if (lockError.code === 'EEXIST') {
          console.log(`[🛡️ Enhanced Backend] ⏳ Cache lock exists, waiting... (attempt ${retryCount + 1})`);
          
          // Check if lock file is stale (older than 5 minutes)
          try {
            const lockStats = await fs.stat(lockPath);
            const lockAge = Date.now() - lockStats.mtime.getTime();
            if (lockAge > 5 * 60 * 1000) { // 5 minutes
              console.log(`[🛡️ Enhanced Backend] 🗑️ Removing stale lock file (${Math.round(lockAge / 1000)}s old)`);
              await fs.unlink(lockPath);
              // Retry immediately after removing stale lock
              return this.saveTokensToCache(tokens, retryCount);
            }
          } catch (statError) {
            // Lock file doesn't exist anymore, retry
            return this.saveTokensToCache(tokens, retryCount);
          }
          
          // Wait for lock to be released (max 2 minutes with exponential backoff)
          const maxWaitTime = Math.min(120, 10 + (retryCount * 10)); // 10s, 20s, 30s, etc.
          for (let i = 0; i < maxWaitTime; i++) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            try {
              lockFile = await fs.open(lockPath, 'wx');
              break;
            } catch (_) {
              if (i === maxWaitTime - 1) {
                if (retryCount < 3) {
                  console.log(`[🛡️ Enhanced Backend] ⏳ Lock timeout, retrying in 5s... (${retryCount + 1}/3)`);
                  await new Promise(resolve => setTimeout(resolve, 5000));
                  return this.saveTokensToCache(tokens, retryCount + 1);
                } else {
                  throw new Error('Cache lock timeout - another process is writing');
                }
              }
            }
          }
        } else {
          throw lockError;
        }
      }
      
      // 🛡️ ATOMIC WRITE: Write to temporary file first, then rename
      const tempPath = cachePath + '.tmp';
      const jsonData = JSON.stringify(tokens, null, 2);
      
      // Write to temporary file
      await fs.writeFile(tempPath, jsonData, 'utf8');
      
      // Atomic rename (this is atomic on most file systems)
      await fs.rename(tempPath, cachePath);
      
      console.log(`[🛡️ Enhanced Backend] ✅ Saved ${tokens.length} tokens to cache (atomic write)`);
      
    } catch (error) {
      console.error('[🛡️ Enhanced Backend] ❌ Error saving tokens to cache:', error);
      
      // Cleanup temp file if it exists
      try {
        const tempPath = cachePath + '.tmp';
        await fs.unlink(tempPath);
      } catch (_) {}
      
      throw error;
    } finally {
      // 🛡️ RELEASE LOCK: Always release the lock
      if (lockFile) {
        try {
          await lockFile.close();
          await fs.unlink(lockPath);
          console.log(`[🛡️ Enhanced Backend] 🔓 Released cache lock`);
        } catch (_) {}
      }
    }
  }


  calculateCommunityHealthScore(twitterData, socialLinks = null, jupiterData = null) {
    if (!twitterData) return 0;

    let score = 2.0; // Lowered base score - tokens must earn their community score
    const maxScore = 10;

    // FINAL WEIGHTS: Mentions 55%, Engagement 35%, Followers 5%, Quality 5%
    // (Removed redundant Recent Activity scoring - prioritizes mention volume and engagement quality)

    // 1. Mentions score (55% weight) - PRIMARY importance for community buzz
    // 🚨 CRITICAL: Use displayMentions (projected) not raw mentions!
    const mentions = twitterData.displayMentions || twitterData.mentions || 0;
    
    // 🚨 TIERED SCORING: Scale properly with projected mention counts
    if (mentions >= 500) score += 3.5;        // 500+ = Maximum buzz
    else if (mentions >= 200) score += 3.0;   // 200+ = Massive buzz
    else if (mentions >= 100) score += 2.5;   // 100+ = Major buzz
    else if (mentions >= 50) score += 2.0;    // 50+ = Strong buzz
    else if (mentions >= 25) score += 1.5;    // 25+ = Good buzz
    else if (mentions >= 15) score += 1.0;    // 15+ = Moderate buzz
    else if (mentions >= 10) score += 0.6;    // 10+ = Some buzz
    else if (mentions >= 5) score += 0.3;     // 5+ = Minimal buzz

    // 2. Engagement score (35% weight) - Quality of community interaction
    const totalEngagement = (twitterData.likes || 0) + (twitterData.retweets || 0) + (twitterData.replies || 0);
    const engagementRate = mentions > 0 ? totalEngagement / mentions : 0;
    if (engagementRate > 10) score += 1.75;
    else if (engagementRate > 5) score += 1.4;
    else if (engagementRate > 2) score += 1.05;
    else if (engagementRate > 1) score += 0.7;
    else if (engagementRate > 0.5) score += 0.35;

    // 3. Follower score (5% weight) - Minor importance
    const followers = twitterData.followers || 0;
    if (followers > 10000) score += 0.25;
    else if (followers > 5000) score += 0.1875;
    else if (followers > 1000) score += 0.125;
    else if (followers > 500) score += 0.0625;

    // 4. Recent activity score - REMOVED (redundant with mentions)
    // This was counting the same tweets already weighted in mentions scoring

    // 4. Quality indicators (5% weight) - Basic legitimacy checks
    const hasOfficialAccount = twitterData.username ? 1.0 : 0;
    const hasRecentActivity = mentions > 0 ? 1.0 : 0;
    score += (hasOfficialAccount + hasRecentActivity) * 0.25;

    // 5. Social links bonus (BONUS points)
    if (socialLinks) {
      const socialCount = Object.values(socialLinks).filter(link => link && link !== 'not_found').length;
      if (socialCount >= 5) score += 1.0;      // All socials = +1.0 bonus
      else if (socialCount >= 3) score += 0.75; // Most socials = +0.75 bonus  
      else if (socialCount >= 2) score += 0.5; // Some socials = +0.5 bonus
    }

    // 6. Organic Score Penalties (NEW!) - Prevent inflated scores from suspicious activity
    if (jupiterData && jupiterData.organicScore !== undefined) {
      const organicScore = jupiterData.organicScore;
      
      // Balanced penalties for low organic scores
      if (organicScore === 0) {
        score -= 0.5; // Penalty for zero organic score
      } else if (organicScore < 20) {
        score -= 0.4; // Penalty for very low organic score
      } else if (organicScore < 40) {
        score -= 0.3; // Penalty for low organic score
      } else if (organicScore < 60) {
        score -= 0.2; // Small penalty for below-average organic score
      }
      // No penalty for organic scores >= 60
    }

    // 7. Low Volume High Engagement Penalty (NEW!) - Detect artificial engagement
    if (mentions > 0 && mentions <= 5) {
      const avgEngagementPerMention = totalEngagement / mentions;
      
      // If very few mentions but extremely high engagement per mention, it's suspicious
      if (avgEngagementPerMention > 15 && mentions <= 2) {
        score -= 1.5; // Major penalty for likely artificial engagement
      } else if (avgEngagementPerMention > 10 && mentions <= 3) {
        score -= 1.0; // Medium penalty for suspicious engagement patterns
      } else if (avgEngagementPerMention > 8 && mentions <= 5) {
        score -= 0.5; // Small penalty for potentially inflated engagement
      }
    }

    // 8. Minimum Activity Threshold (NEW!) - Require basic activity for decent scores
    if (mentions < 5) {
      score = Math.min(score, 4.0); // Cap score at 4.0 for tokens with <5 mentions
    }
    if (mentions < 2) {
      score = Math.min(score, 2.5); // Cap score at 2.5 for tokens with <2 mentions
    }

    return Math.max(0, Math.min(score, maxScore)); // Ensure score is between 0 and 10
  }

  async refreshCache() {
    try {
      const status = this.tokenProcessor.getProcessingStatus();
      
      if (status.processedCount > 0 && !status.isProcessing) {
        console.log('[🛡️ Enhanced Backend] 🔄 Starting cache refresh (skipTwitter=true)...');
        await this.tokenProcessor.startProcessing({ skipTwitter: true });
      }
      
    } catch (error) {
      console.error('[🛡️ Enhanced Backend] ❌ Cache refresh failed:', error);
    }
  }

  async updateJupiterData() {
    try {
      console.log('[🛡️ Enhanced Backend] 🚀 Starting Jupiter data update cycle...');
      
      // Load current tokens
      const tokens = await this.getTokensFromCache();
      if (!tokens || tokens.length === 0) {
        console.log('[🛡️ Enhanced Backend] ⚠️ No tokens found for Jupiter update');
        return;
      }
      
      // Filter tokens that need Jupiter data refresh (older than 30 minutes OR missing data)
      const now = new Date();
      const tokensToUpdate = tokens.filter(token => {
        // Must have contract address to fetch Jupiter data
        if (!token.contractAddress) return false;
        
        // Include tokens without Jupiter data OR without timestamp
        if (!token.jupiterData || !token.jupiterTimestamp) return true;
        
        // Include tokens older than 30 minutes (reduced from 1 hour)
        const timestamp = new Date(token.jupiterTimestamp);
        const ageMinutes = (now - timestamp) / (1000 * 60);
        return ageMinutes > 30; // Update if older than 30 minutes
      });
      
      if (tokensToUpdate.length === 0) {
        console.log('[🛡️ Enhanced Backend] ✅ All Jupiter data is current (< 30 minutes old)');
        return;
      }
      
      console.log(`[🛡️ Enhanced Backend] 🔄 Updating Jupiter data for ${tokensToUpdate.length} tokens...`);
      
      // Sort by priority: tokens without Jupiter data first, then by market cap
      // Update up to 50 tokens per cycle (increased from 20)
      const topTokens = tokensToUpdate
        .sort((a, b) => {
          // Prioritize tokens without Jupiter data
          const aHasData = !!a.jupiterData;
          const bHasData = !!b.jupiterData;
          if (aHasData !== bHasData) return aHasData ? 1 : -1;
          
          // Then sort by market cap
          return (b.jupiterData?.mcap || 0) - (a.jupiterData?.mcap || 0);
        })
        .slice(0, 100);
      
      let updated = 0;
      let errors = 0;
      
      // Process tokens in batches of 100 (Jupiter API limit)
      const batchSize = 100;
      for (let i = 0; i < topTokens.length; i += batchSize) {
        const batch = topTokens.slice(i, i + batchSize);
        const contractAddresses = batch.map(token => token.contractAddress);
        
        try {
          console.log(`[🛡️ Enhanced Backend] 🚀 Batch updating Jupiter data for ${batch.length} tokens (batch ${Math.floor(i/batchSize) + 1})...`);
          
          // Use Jupiter API batch endpoint
          const response = await axios.get(`https://lite-api.jup.ag/tokens/v2/search?query=${contractAddresses.join(',')}`, {
            timeout: 15000,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Accept': 'application/json'
            }
          });
          
          if (response.data && response.data.length > 0) {
            // Create a map of contract address to Jupiter data
            const jupiterMap = new Map();
            response.data.forEach(jupiterToken => {
              if (jupiterToken.id) {
                jupiterMap.set(jupiterToken.id, jupiterToken);
              }
            });
            
            // Update tokens with their corresponding Jupiter data
            batch.forEach(token => {
              const tokenIndex = tokens.findIndex(t => t.contractAddress === token.contractAddress);
              if (tokenIndex !== -1 && jupiterMap.has(token.contractAddress)) {
                const freshData = jupiterMap.get(token.contractAddress);
                tokens[tokenIndex].jupiterData = freshData;
                tokens[tokenIndex].jupiterTimestamp = new Date().toISOString();
                updated++;
                
                // Log significant changes
                const oldMcap = token.jupiterData?.mcap || 0;
                const newMcap = freshData.mcap || 0;
                if (oldMcap > 0 && Math.abs((newMcap - oldMcap) / oldMcap) > 0.05) {
                  const change = ((newMcap - oldMcap) / oldMcap * 100).toFixed(1);
                  console.log(`[🛡️ Enhanced Backend] 📊 ${token.symbol}: ${(oldMcap/1e6).toFixed(1)}M → ${(newMcap/1e6).toFixed(1)}M (${change}%)`);
                }
                
                console.log(`[🛡️ Enhanced Backend] ✅ Updated Jupiter data for ${token.symbol} (${token.contractAddress.substring(0, 8)})`);
              } else if (tokenIndex !== -1) {
                console.log(`[🛡️ Enhanced Backend] ⚠️ No Jupiter data found for ${token.symbol} (${token.contractAddress.substring(0, 8)})`);
                errors++;
              }
            });
          } else {
            errors += batch.length;
            console.log(`[🛡️ Enhanced Backend] ⚠️ No Jupiter data returned for batch of ${batch.length} tokens`);
          }
          
        } catch (error) {
          errors += batch.length;
          console.log(`[🛡️ Enhanced Backend] ❌ Failed to update Jupiter batch for ${batch.length} tokens: ${error.message}`);
        }
        
        // Rate limiting: wait 3 seconds between batches (reduced from individual 1s delays)
        if (i + batchSize < topTokens.length) {
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      }
      
      // 🛡️ ATOMIC WRITE: Save updated cache
      if (updated > 0) {
        const cachePath = path.join(__dirname, 'cache', 'tokens-cache.json');
        const tempPath = cachePath + '.tmp';
        const jsonData = JSON.stringify(tokens, null, 2);
        
        try {
          // 🚨 CRITICAL FIX: Ensure cache directory exists before atomic write
          const cacheDir = path.dirname(cachePath);
          await fs.mkdir(cacheDir, { recursive: true });
          
          await fs.writeFile(tempPath, jsonData, 'utf8');
          await fs.rename(tempPath, cachePath);
          console.log(`[🛡️ Enhanced Backend] ✅ Jupiter update complete: ${updated} tokens updated, ${errors} errors`);
        } catch (error) {
          // Cleanup temp file if it exists
          try {
            await fs.unlink(tempPath);
          } catch (_) {}
          throw error;
        }
        
        // Update KOL calls with new market cap data
        await this.updateKolCallsWithJupiterData(tokens);
      } else {
        console.log(`[🛡️ Enhanced Backend] ⚠️ No tokens updated: ${errors} errors`);
      }
      
    } catch (error) {
      console.error('[🛡️ Enhanced Backend] ❌ Jupiter update failed:', error);
    }
  }

  async updateKolCallsWithJupiterData(tokens) {
    try {
      console.log('[🛡️ Enhanced Backend] 🎯 Updating KOL calls with fresh Jupiter data...');
      
      // Get all KOL calls that need updates
      const callsToUpdate = await this.oauthXService.db.getAllKolCallsForMCUpdate();
      if (callsToUpdate.length === 0) {
        console.log('[🛡️ Enhanced Backend] ✅ No KOL calls to update');
        return;
      }
      
      // Create a map of contract address to current market cap, holder count, and liquidity
      const tokenDataMap = new Map();
      tokens.forEach(token => {
        if (token.contractAddress && token.jupiterData?.mcap) {
          tokenDataMap.set(token.contractAddress, {
            mcap: token.jupiterData.mcap,
            holderCount: token.jupiterData.holderCount || 0,
            liquidity: token.jupiterData.liquidity || null
          });
        }
      });
      
      let updated = 0;
      const userUpdates = new Map(); // Track updates per user
      
      for (const call of callsToUpdate) {
        const tokenData = tokenDataMap.get(call.contractAddress);
        if (tokenData) {
          const result = await this.oauthXService.db.updateKolCallMC(
            call.userId, 
            call.contractAddress, 
            tokenData.mcap, 
            tokenData.holderCount,
            tokenData.liquidity
          );
          if (result.updated > 0) {
            updated += result.updated;
            userUpdates.set(call.userId, (userUpdates.get(call.userId) || 0) + result.updated);
          }
        }
      }
      
      // Save market cap snapshots for charting
      console.log('[🛡️ Enhanced Backend] 📊 Saving market cap snapshots for charting...');
      let snapshotsSaved = 0;
      for (const [contractAddress, tokenData] of tokenDataMap) {
        try {
          await this.mcapService.saveMcapSnapshot(contractAddress, tokenData.mcap, tokenData.holderCount);
          snapshotsSaved++;
        } catch (error) {
          console.error(`[🛡️ Enhanced Backend] ❌ Failed to save mcap snapshot for ${contractAddress}:`, error.message);
        }
      }
      if (snapshotsSaved > 0) {
        console.log(`[🛡️ Enhanced Backend] ✅ Saved ${snapshotsSaved} market cap snapshots`);
      }
      
      if (updated > 0) {
        console.log(`[🛡️ Enhanced Backend] ✅ Updated ${updated} KOL calls across ${userUpdates.size} users`);
        for (const [userId, count] of userUpdates) {
          console.log(`[🛡️ Enhanced Backend]    User ${userId}: ${count} calls updated`);
        }
      } else {
        console.log('[🛡️ Enhanced Backend] ⚠️ No KOL calls updated (no matching tokens with fresh data)');
      }
      
    } catch (error) {
      console.error('[🛡️ Enhanced Backend] ❌ KOL calls update failed:', error);
    }
  }

  async updateJupiterDataWithPriority() {
    try {
      console.log('[🛡️ Enhanced Backend] 🎯 Starting priority-based Jupiter data update...');
      
      // Load current tokens
      const tokens = await this.getTokensFromCache();
      if (!tokens || tokens.length === 0) {
        console.log('[🛡️ Enhanced Backend] ⚠️ No tokens found for priority update');
        return;
      }
      
      // Get watchlist and KOL call tokens for priority calculation
      const watchlistTokens = await this.getActiveWatchlistTokens();
      const kolCallTokens = await this.getActiveKolCallTokens();
      
      // Get tokens that need updates based on priority system
      const tokensToUpdate = this.priorityQueue.getTokensForUpdate(tokens, watchlistTokens, kolCallTokens);
      
      if (tokensToUpdate.length === 0) {
        console.log('[🛡️ Enhanced Backend] ✅ No tokens need priority updates at this time');
        return;
      }

      // 🚨 QUALITY FILTER: Remove low-quality tokens from the update list AND from the main cache
      const qualityTokens = [];
      const removedTokens = [];
      
      tokensToUpdate.forEach(token => {
        const hasLaunchpad = token.jupiterData?.launchpad && token.jupiterData.launchpad !== '';
        const hasOrganicScore = token.jupiterData?.organicScore && token.jupiterData.organicScore > 0;
        const hasGraduatedAt = token.jupiterData?.graduatedAt && token.jupiterData.graduatedAt !== '';
        
        if (!hasLaunchpad && !hasOrganicScore && !hasGraduatedAt) {
          removedTokens.push(token);
        } else {
          qualityTokens.push(token);
        }
      });
      
      if (removedTokens.length > 0) {
        console.log(`[🛡️ Enhanced Backend] 🗑️ Removed ${removedTokens.length} low-quality tokens from cache`);
        
        // Remove these tokens from the main tokens array
        const tokensToKeep = tokens.filter(token => 
          !removedTokens.some(removed => removed.contractAddress === token.contractAddress)
        );
        
        // Save the cleaned cache
        await this.saveTokensToCache(tokensToKeep);
        console.log(`[🛡️ Enhanced Backend] ✅ Cache cleaned: ${tokens.length} → ${tokensToKeep.length} tokens`);
        
        // Update the tokens array for the rest of the function
        tokens.splice(0, tokens.length, ...tokensToKeep);
      }
      
      if (qualityTokens.length === 0) {
        console.log('[🛡️ Enhanced Backend] ✅ No quality tokens need priority updates at this time');
        return;
      }
      
      console.log(`[🛡️ Enhanced Backend] 🔄 Priority update: ${qualityTokens.length} tokens selected`);
      
      // Log priority breakdown
      const priorityBreakdown = qualityTokens.reduce((acc, token) => {
        acc[token.priority] = (acc[token.priority] || 0) + 1;
        return acc;
      }, {});
      console.log(`[🛡️ Enhanced Backend] 📊 Priority breakdown:`, priorityBreakdown);
      
      // Check rate limiting
      if (!this.priorityQueue.canMakeRequest()) {
        console.log('[🛡️ Enhanced Backend] ⏸️ Rate limit reached, skipping this cycle');
        return;
      }
      
      // Create old tokens map for change detection
      const oldTokensMap = new Map();
      tokens.forEach(token => {
        if (token.contractAddress) {
          oldTokensMap.set(token.contractAddress, { ...token });
        }
      });
      
      let updated = 0;
      let errors = 0;
      
      // Process tokens in batches of 100 (Jupiter API limit)
      const batchSize = 100;
      for (let i = 0; i < qualityTokens.length; i += batchSize) {
        const batch = qualityTokens.slice(i, i + batchSize);
        const contractAddresses = batch.map(token => token.contractAddress);
        
        try {
          console.log(`[🛡️ Enhanced Backend] 🚀 Priority batch ${Math.floor(i/batchSize) + 1}: ${batch.length} tokens (${batch.map(t => t.priority).join(', ')})...`);
          
          // Record request for rate limiting
          this.priorityQueue.recordRequest();
          
          // Use Jupiter API batch endpoint
          const response = await axios.get(`https://lite-api.jup.ag/tokens/v2/search?query=${contractAddresses.join(',')}`, {
            timeout: 15000,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Accept': 'application/json'
            }
          });
          
          if (response.data && response.data.length > 0) {
            // Create a map of contract address to Jupiter data
            const jupiterMap = new Map();
            response.data.forEach(jupiterToken => {
              if (jupiterToken.id) {
                jupiterMap.set(jupiterToken.id, jupiterToken);
              }
            });
            
            // 🚨 CRITICAL FIX: Update tokens with their corresponding Jupiter data
            const updatedTokensInBatch = [];
            batch.forEach(token => {
              const tokenIndex = tokens.findIndex(t => t.contractAddress === token.contractAddress);
              if (tokenIndex !== -1 && jupiterMap.has(token.contractAddress)) {
                const freshData = jupiterMap.get(token.contractAddress);
                
                // 🚨 QUALITY FILTER: Check if token meets quality criteria
                const hasLaunchpad = freshData.launchpad && freshData.launchpad !== '';
                const hasOrganicScore = freshData.organicScore && freshData.organicScore > 0;
                const hasGraduatedAt = freshData.graduatedAt && freshData.graduatedAt !== '';
                
                // Only update if at least ONE quality criteria is present (not all missing)
                if (!hasLaunchpad && !hasOrganicScore && !hasGraduatedAt) {
                  return; // Skip this token
                }
                
                
                // 🚨 CRITICAL FIX: Update the original token but preserve ALL existing data including Twitter
                const originalToken = tokens[tokenIndex];
                tokens[tokenIndex] = {
                  ...originalToken,  // Preserve ALL existing data (including Twitter data)
                  jupiterData: freshData,
                  jupiterTimestamp: new Date().toISOString()
                };
                
                updatedTokensInBatch.push(tokens[tokenIndex]);
                updated++;
                
                // Log significant changes for high priority tokens
                if (token.priority === 'HIGH') {
                  const oldMcap = token.jupiterData?.mcap || 0;
                  const newMcap = freshData.mcap || 0;
                  if (oldMcap > 0 && Math.abs((newMcap - oldMcap) / oldMcap) > 0.02) { // 2% threshold for high priority
                    const change = ((newMcap - oldMcap) / oldMcap * 100).toFixed(1);
                    console.log(`[🛡️ Enhanced Backend] 📊 HIGH: ${token.symbol}: ${(oldMcap/1e6).toFixed(1)}M → ${(newMcap/1e6).toFixed(1)}M (${change}%)`);
                  }
                }
                
              } else if (tokenIndex !== -1) {
                console.log(`[🛡️ Enhanced Backend] ⚠️ No Jupiter data for ${token.symbol} (${token.contractAddress.substring(0, 8)})`);
                errors++;
              }
            });
            
            // CRITICAL FIX: Recalculate community health scores for all tokens with fresh Jupiter data
            for (const updatedToken of updatedTokensInBatch) {
              try {
                // Recalculate community health score using cached Twitter data
                if (updatedToken.twitterData) {
                  await this.ensureSocialDataService();
                  const newCommunityScore = this.socialDataService.calculateCommunityHealthScore(updatedToken.twitterData);
                  updatedToken.communityHealthScore = newCommunityScore;
                  updatedToken.communityScore = newCommunityScore; // Ensure both fields are set
                  
                  // Recalculate overall score with fresh Jupiter data + recalculated community score
                  const newOverallScore = this.tokenProcessor.calculateEnhancedOverallScore(updatedToken);
                  updatedToken.overallScore = newOverallScore;
                  updatedToken.enhancedScore = newOverallScore;
                  updatedToken.scoringTimestamp = new Date().toISOString();
                  
                  // Take hype snapshot after score recalculation
                  await this.takeHypeSnapshot(updatedToken);
                  
                } else {
                  // Use baseline score for tokens without Twitter data
                  updatedToken.communityHealthScore = 2.0;
                  updatedToken.communityScore = 2.0;
                  const newOverallScore = this.tokenProcessor.calculateEnhancedOverallScore(updatedToken);
                  updatedToken.overallScore = newOverallScore;
                  updatedToken.enhancedScore = newOverallScore;
                  updatedToken.scoringTimestamp = new Date().toISOString();
                  
                  // Take hype snapshot after score recalculation
                  await this.takeHypeSnapshot(updatedToken);
                  
                  console.log(`[🛡️ Enhanced Backend] 🏆 ${updatedToken.priority}: ${updatedToken.symbol} - No Twitter data, Overall: ${newOverallScore.toFixed(2)}`);
                }
              } catch (scoreError) {
                console.error(`[🛡️ Enhanced Backend] ❌ Score recalculation failed for ${updatedToken.symbol}:`, scoreError.message);
              }
            }
            
            // Mark tokens as updated in priority queue
            await this.priorityQueue.markTokensUpdated(updatedTokensInBatch, oldTokensMap);
            
          } else {
            errors += batch.length;
            console.log(`[🛡️ Enhanced Backend] ⚠️ No Jupiter data returned for batch of ${batch.length} tokens`);
          }
          
        } catch (error) {
          errors += batch.length;
          console.log(`[🛡️ Enhanced Backend] ❌ Failed to update priority batch: ${error.message}`);
        }
        
        // Rate limiting: wait 3 seconds between batches
        if (i + batchSize < tokensToUpdate.length) {
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      }
      
      // Save updated cache with validation
      if (updated > 0) {
        // 🛡️ VALIDATE DATA before saving
        if (!Array.isArray(tokens)) {
          throw new Error('Tokens data is not an array - corruption detected');
        }
        
        if (tokens.length === 0) {
          throw new Error('Tokens array is empty - corruption detected');
        }
        
        // Validate token structure
        for (const token of tokens.slice(0, 10)) { // Check first 10 tokens
          if (!token.symbol || !token.name || !token.contractAddress) {
            throw new Error(`Invalid token structure detected: ${JSON.stringify(token)}`);
          }
        }
        
        console.log(`[🛡️ Enhanced Backend] 🔍 Data validation passed: ${tokens.length} tokens`);
        
        // Save with atomic write
        await this.saveTokensToCache(tokens);
        
        // 🛡️ VERIFY SAVE: Read back and validate
        const savedTokens = await this.getTokensFromCache();
        if (!savedTokens || savedTokens.length !== tokens.length) {
          throw new Error(`Cache verification failed: expected ${tokens.length}, got ${savedTokens?.length || 0}`);
        }
        
        console.log(`[🛡️ Enhanced Backend] ✅ Priority update complete: ${updated} tokens updated, ${errors} errors`);
        
        // Update KOL calls with new market cap data
        await this.updateKolCallsWithJupiterData(tokens);
        
        // Cleanup old priority data
        await this.priorityQueue.cleanupOldPriorities(tokens);
      } else {
        console.log(`[🛡️ Enhanced Backend] ⚠️ No tokens updated: ${errors} errors`);
      }
      
    } catch (error) {
      console.error('[🛡️ Enhanced Backend] ❌ Priority Jupiter update failed:', error);
    }
  }

  async ensureSocialDataService() {
    if (!this.socialDataService) {
      const { default: EnhancedSocialDataService } = await import('./enhancedSocialDataService.js');
      this.socialDataService = new EnhancedSocialDataService();
      await this.socialDataService.initialize();
    }
  }

  async getActiveWatchlistTokens() {
    try {
      // Get all unique contract addresses from all user watchlists
      const watchlistTokens = new Set();
      
      // Get all users from the database
      const allUsers = await this.oauthXService.db.getAllUsers();
      
      for (const user of allUsers) {
        try {
          const userWatchlist = await this.oauthXService.db.getUserWatchlist(user.id);
          if (userWatchlist && userWatchlist.length > 0) {
            userWatchlist.forEach(item => {
              if (item.contractAddress) {
                watchlistTokens.add(item.contractAddress);
              }
            });
          }
        } catch (error) {
          console.error(`[🛡️ Enhanced Backend] ⚠️ Failed to get watchlist for user ${user.id}:`, error.message);
        }
      }
      
      const result = Array.from(watchlistTokens);
      console.log(`[🛡️ Enhanced Backend] 📋 Found ${result.length} unique tokens in watchlists`);
      return result;
    } catch (error) {
      console.error('[🛡️ Enhanced Backend] ❌ Failed to get watchlist tokens:', error);
      return [];
    }
  }

  async getActiveKolCallTokens() {
    try {
      // Get contract addresses from recent KOL calls (last 30 days)
      const kolCallTokens = new Set();
      const thirtyDaysAgo = new Date(Date.now() - (30 * 24 * 60 * 60 * 1000));
      
      // Get all users from the database
      const allUsers = await this.oauthXService.db.getAllUsers();
      
      for (const user of allUsers) {
        try {
          const userKolCalls = await this.oauthXService.db.getKolCalls(user.id);
          if (userKolCalls && userKolCalls.length > 0) {
            userKolCalls.forEach(call => {
              if (call.token?.contractAddress && call.calledAt) {
                const callDate = new Date(call.calledAt);
                if (callDate >= thirtyDaysAgo) {
                  kolCallTokens.add(call.token.contractAddress);
                }
              }
            });
          }
        } catch (error) {
          console.error(`[🛡️ Enhanced Backend] ⚠️ Failed to get KOL calls for user ${user.id}:`, error.message);
        }
      }
      
      const result = Array.from(kolCallTokens);
      console.log(`[🛡️ Enhanced Backend] 📞 Found ${result.length} unique tokens with recent KOL calls`);
      return result;
    } catch (error) {
      console.error('[🛡️ Enhanced Backend] ❌ Failed to get KOL call tokens:', error);
      return [];
    }
  }

  async clearCache() {
    try {
      // 🛡️ ATOMIC WRITE: Use the same persistent cache path as the rest of the system
      const cachePath = this.persistentCachePath || path.join(process.env.DATA_DIR || '/var/data/dgo', 'cache', 'tokens-cache.json');
      const tempPath = cachePath + '.tmp';
      const jsonData = JSON.stringify([], null, 2);
      
      try {
        // 🚨 CRITICAL FIX: Ensure cache directory exists before atomic write
        const cacheDir = path.dirname(cachePath);
        await fs.mkdir(cacheDir, { recursive: true });
        
        await fs.writeFile(tempPath, jsonData, 'utf8');
        await fs.rename(tempPath, cachePath);
        console.log(`[🛡️ Enhanced Backend] 🗑️ Cache cleared at: ${cachePath}`);
      } catch (error) {
        // Cleanup temp file if it exists
        try {
          await fs.unlink(tempPath);
        } catch (_) {}
        throw error;
      }
      
      // Reset processor state
      this.tokenProcessor.processedTokens = [];
      this.tokenProcessor.processingQueue = [];
      
    } catch (error) {
      console.error('[🛡️ Enhanced Backend] ❌ Failed to clear cache:', error);
    }
  }

  async preserveCacheAndRefresh() {
    try {
      console.log('[🛡️ Enhanced Backend] 🔄 Preserving existing tokens and refreshing...');
      
      // Load existing tokens first
      const existingTokens = await this.getTokensFromCache();
      console.log(`[🛡️ Enhanced Backend] 📊 Preserving ${existingTokens.length} existing tokens`);
      
      // Reset processor state but keep existing tokens
      this.tokenProcessor.processedTokens = existingTokens;
      this.tokenProcessor.processingQueue = [];
      
      // Start processing to add new tokens
      await this.tokenProcessor.startProcessing();
      
      console.log('[🛡️ Enhanced Backend] ✅ Cache preserved and refresh started');
      
    } catch (error) {
      console.error('[🛡️ Enhanced Backend] ❌ Failed to preserve cache and refresh:', error);
    }
  }

  async autoRestartTokenProcessing() {
    try {
      // Check if token processing is running
      const processingStatus = this.tokenProcessor.getProcessingStatus();
      
      if (processingStatus.isProcessing) {
        // Processing is running, check if it's stuck
        const now = Date.now();
        const lastActivity = processingStatus.lastActivity || 0;
        const timeSinceLastActivity = now - lastActivity;
        
        // If no activity for more than 10 minutes, consider it stuck
        if (timeSinceLastActivity > 10 * 60 * 1000) {
          console.log('[🛡️ Enhanced Backend] ⚠️ Token processing appears stuck (no activity for 10+ minutes)');
          console.log('[🛡️ Enhanced Backend] 🔄 Restarting token processing...');
          
          // Stop current processing
          this.tokenProcessor.stopProcessing();
          
          // Wait a moment
          await new Promise(resolve => setTimeout(resolve, 5000));
          
          // Restart with preserved cache
          await this.preserveCacheAndRefresh();
          
          console.log('[🛡️ Enhanced Backend] ✅ Token processing restarted after being stuck');
        }
        return;
      }
      
      // Processing is not running, check if we have tokens
      const tokens = await this.getTokensFromCache();
      
      if (tokens.length === 0) {
        console.log('[🛡️ Enhanced Backend] ⚠️ No tokens in cache and processing not running');
        console.log('[🛡️ Enhanced Backend] 🚀 Starting fresh token processing...');
        
        // Start fresh processing
        await this.tokenProcessor.startProcessing();
        
        console.log('[🛡️ Enhanced Backend] ✅ Fresh token processing started');
      } else if (tokens.length < 100) {
        console.log('[🛡️ Enhanced Backend] ⚠️ Low token count and processing not running');
        console.log(`[🛡️ Enhanced Backend] 📊 Current tokens: ${tokens.length}, starting processing to add more...`);
        
        // Restart with preserved cache
        await this.preserveCacheAndRefresh();
        
        console.log('[🛡️ Enhanced Backend] ✅ Token processing restarted to add more tokens');
      } else {
        // We have enough tokens, but processing stopped - restart it
        console.log('[🛡️ Enhanced Backend] ⚠️ Token processing stopped but we have sufficient tokens');
        console.log(`[🛡️ Enhanced Backend] 📊 Current tokens: ${tokens.length}, restarting processing...`);
        
        // Restart with preserved cache
        await this.preserveCacheAndRefresh();
        
        console.log('[🛡️ Enhanced Backend] ✅ Token processing restarted');
      }
      
    } catch (error) {
      console.error('[🛡️ Enhanced Backend] ❌ Auto-restart failed:', error);
      
      // If auto-restart fails, try a simple restart
      try {
        console.log('[🛡️ Enhanced Backend] 🔄 Attempting simple restart after auto-restart failure...');
        await this.preserveCacheAndRefresh();
      } catch (restartError) {
        console.error('[🛡️ Enhanced Backend] ❌ Simple restart also failed:', restartError);
      }
    }
  }

  // ========================================
  // Enhanced KOL Trust System - Multi-Board Leaderboard
  async generateEnhancedLeaderboard(userCalls, currentTokenData = {}) {
    console.log('🏆 Generating Enhanced KOL Trust Leaderboard...');
    console.log(`📊 [Enhanced Leaderboard] Total users: ${Object.keys(userCalls).length}`);
    console.log(`📊 [Enhanced Leaderboard] Token data available: ${Object.keys(currentTokenData).length} tokens`);
    
    // Process all users with enhanced trust scoring
    const userTrustScores = await Promise.all(
      Object.entries(userCalls).map(async ([userId, calls]) => {
        try {
          console.log(`🔍 [Enhanced Leaderboard] Processing user ${userId} with ${calls?.length || 0} calls`);
          
          // Debug: Show sample call data
          if (calls && calls.length > 0) {
            const sampleCall = calls[0];
            console.log(`🔍 [Enhanced Leaderboard] Sample call for ${userId}:`, {
              contractAddress: sampleCall.contractAddress,
              tokenContractAddress: sampleCall.token?.contractAddress,
              calledMC: sampleCall.calledMc || sampleCall.calledMC,
              currentMC: sampleCall.currentMC,
              hasTokenData: !!currentTokenData[sampleCall.contractAddress || sampleCall.token?.contractAddress]
            });
          }
          
          const trustScore = this.kolTrustSystem.calculateKOLTrustScore(calls, currentTokenData);
          console.log(`📊 [Enhanced Leaderboard] Trust score for ${userId}:`, {
            trustScore: trustScore.trustScore,
            hitRate: trustScore.performance?.hitRate,
            consistency: trustScore.consistency?.score,
            riskManagement: trustScore.riskManagement?.score
          });
          
          // Get user data
          const user = await this.oauthXService.getUserById(userId);
          
          return {
            userId,
            username: user?.username,
            displayName: user?.displayName || user?.username,
            profileImage: user?.profileImage,
            verified: user?.verified,
            followersCount: user?.followersCount,
            ...trustScore
          };
        } catch (error) {
          console.error(`❌ Error processing user ${userId}:`, error.message);
          return {
            userId,
            username: `User${userId.slice(-4)}`,
            displayName: `User${userId.slice(-4)}`,
            ...this.kolTrustSystem.getDefaultScore()
          };
        }
      })
    );

    // Sort by trust score
    userTrustScores.sort((a, b) => b.trustScore - a.trustScore);
    
    // Add rankings
    userTrustScores.forEach((user, index) => {
      user.rank = index + 1;
    });

    // Generate different board views
    const boards = {
      main: userTrustScores, // Overall ranking
      elite: userTrustScores.filter(u => u.summary.trustLevel === 'Elite KOL'),
      expert: userTrustScores.filter(u => u.summary.trustLevel === 'Expert KOL'),
      trusted: userTrustScores.filter(u => u.summary.trustLevel === 'Trusted KOL'),
      rising: userTrustScores.filter(u => u.summary.trustLevel === 'Rising KOL'),
      developing: userTrustScores.filter(u => u.summary.trustLevel === 'Developing KOL'),
      
      // Specialized boards
      performance: [...userTrustScores].sort((a, b) => b.performance.score - a.performance.score),
      consistency: [...userTrustScores].sort((a, b) => b.consistency.score - a.consistency.score),
      riskManagement: [...userTrustScores].sort((a, b) => b.riskManagement.score - a.riskManagement.score),
      marketTiming: [...userTrustScores].sort((a, b) => b.marketTiming.score - a.marketTiming.score)
    };

    // Add board-specific rankings
    Object.keys(boards).forEach(boardName => {
      boards[boardName].forEach((user, index) => {
        user[`${boardName}Rank`] = index + 1;
      });
    });

    // Calculate board statistics
    const boardStats = {
      totalUsers: userTrustScores.length,
      eliteCount: boards.elite.length,
      expertCount: boards.expert.length,
      trustedCount: boards.trusted.length,
      risingCount: boards.rising.length,
      developingCount: boards.developing.length,
      avgTrustScore: userTrustScores.reduce((sum, u) => sum + u.trustScore, 0) / userTrustScores.length,
      generatedAt: new Date().toISOString()
    };

    console.log(`✅ Enhanced Leaderboard Generated:`, {
      totalUsers: boardStats.totalUsers,
      eliteKOLs: boardStats.eliteCount,
      expertKOLs: boardStats.expertCount,
      trustedKOLs: boardStats.trustedCount,
      avgTrustScore: boardStats.avgTrustScore.toFixed(1)
    });

    return {
      leaderboard: userTrustScores,
      boards,
      boardStats,
      generatedAt: boardStats.generatedAt
    };
  }

  // ========================================
  // Calculate user stats from KOL calls using enhanced KOL trust system
  async calculateUserStatsFromCalls(calls) {
    if (!calls || calls.length === 0) {
      return {
        totalCalls: 0,
        recentCalls30d: 0,
        hitRate: 0,
        medianX: 0
      };
    }

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
    
    // Filter calls from last 30 days
    const recentCalls = calls.filter(call => {
      const callDate = new Date(call.calledAt);
      return callDate >= thirtyDaysAgo;
    });

    // Get fresh token data for accurate calculations
    const tokens = await this.getTokensFromCache();
    const currentTokenData = {};
    tokens.forEach(token => {
      currentTokenData[token.contractAddress] = token;
    });

    // Use enhanced KOL trust system for accurate calculations
    const trustScore = this.kolTrustSystem.calculateKOLTrustScore(calls, currentTokenData);
    
    // Extract hit rate from enhanced system (convert from percentage to decimal)
    const hitRate = trustScore.performance?.hitRate ? trustScore.performance.hitRate / 100 : 0;
    
    // Calculate median X using fresh market cap data
    const xMultiples = calls.map(call => {
      const contractAddress = call.contractAddress || call.token?.contractAddress;
      const tokenData = currentTokenData[contractAddress] || {};
      const currentMC = tokenData?.mcap || tokenData?.marketCap || call.currentMC || call.currentMc || 0;
      const calledMC = call.calledMc || call.calledMC || 0;
      return calledMC > 0 ? currentMC / calledMC : 0;
    }).filter(x => x > 0);

    const sortedX = xMultiples.sort((a, b) => a - b);
    const medianX = sortedX.length > 0 ? sortedX[Math.floor(sortedX.length / 2)] : 0;

    console.log(`📊 User Stats Calculation: ${trustScore.performance?.profitableCalls || 0} hits / ${trustScore.performance?.totalCalls || 0} calls = ${(hitRate * 100).toFixed(1)}% hit rate`);

    return {
      totalCalls: calls.length,
      recentCalls30d: recentCalls.length,
      hitRate: hitRate,
      medianX: medianX
    };
  }

  // 🔥 FUEL TOKEN HELPER METHODS
  // ========================================

  async getFueledTokens() {
    try {
      // Use persistent DATA_DIR for fueled tokens (same as other persistent data)
      const baseDir = this.oauthXService?.db?.baseDir || process.env.DATA_DIR || '/var/data/dgo';
      const fueledTokensPath = path.join(baseDir, 'cache', 'fueled-tokens.json');
      
      // Check if file exists
      try {
        await fs.access(fueledTokensPath);
      } catch {
        // File doesn't exist, return empty array
        console.log('[🛡️ Enhanced Backend] 🔥 No fueled-tokens.json file found, returning empty array');
        return [];
      }

      const data = await fs.readFile(fueledTokensPath, 'utf8');
      const fueledTokens = JSON.parse(data);
      
      console.log(`[🛡️ Enhanced Backend] 🔥 Loaded ${fueledTokens.length} fueled tokens from file`);

      // Filter out expired tokens and handle stacked fuel applications
      const now = Date.now();
      const activeFueledTokens = [];
      const expiredTokens = []; // Track tokens that need recalculation
      let hasChanges = false;
      
      console.log(`[🛡️ Enhanced Backend] 🔥 Processing ${fueledTokens.length} fueled tokens, current time: ${new Date(now).toISOString()}`);

      for (const token of fueledTokens) {
        if (token.fuelApplications && Array.isArray(token.fuelApplications)) {
          // Handle stacked fuel - remove expired individual applications
          const activeApplications = token.fuelApplications.filter(app => {
            const expiryTime = new Date(app.expiresAt).getTime();
            return expiryTime > now;
          });

          if (activeApplications.length > 0) {
            // Recalculate stacked values with remaining active applications
            const totalFuelValue = activeApplications.reduce((total, app) => {
              const fuelValue = parseInt(app.fuelType.replace('x', ''));
              return total + fuelValue;
            }, 0);

            const totalBoostMultiplier = activeApplications.reduce((total, app) => {
              return total + (app.boostMultiplier - 1);
            }, 1);

            // Find the latest expiry time among active applications
            const latestExpiry = Math.max(...activeApplications.map(app => new Date(app.expiresAt).getTime()));

            // Update token with recalculated stacked values
            const updatedToken = {
              ...token,
              fuelType: `${totalFuelValue}x`,
              boostMultiplier: totalBoostMultiplier,
              fuelExpiry: new Date(latestExpiry).toISOString(),
              fuelApplications: activeApplications,
              remainingTime: latestExpiry - now
            };

            activeFueledTokens.push(updatedToken);

            // Mark as changed if we removed expired applications
            if (activeApplications.length !== token.fuelApplications.length) {
              hasChanges = true;
              // If some applications expired but token still has fuel, trigger recalculation
              expiredTokens.push({
                contractAddress: token.contractAddress,
                symbol: token.symbol,
                reason: 'partial_fuel_expiry'
              });
            }
          } else {
            // All applications expired, remove token entirely
            hasChanges = true;
            expiredTokens.push({
              contractAddress: token.contractAddress,
              symbol: token.symbol,
              reason: 'complete_fuel_expiry'
            });
          }
        } else {
          // Handle legacy format (single fuel application)
          const expiryTime = new Date(token.fuelExpiry).getTime();
          if (expiryTime > now) {
            activeFueledTokens.push({
              ...token,
              remainingTime: expiryTime - now
            });
          } else {
            hasChanges = true;
            expiredTokens.push({
              contractAddress: token.contractAddress,
              symbol: token.symbol,
              reason: 'legacy_fuel_expiry'
            });
          }
        }
      }

      // Update the file if we removed expired tokens or applications
      if (hasChanges) {
        await fs.writeFile(fueledTokensPath, JSON.stringify(activeFueledTokens, null, 2));
        console.log(`[🛡️ Enhanced Backend] 🔥 Updated fueled-tokens.json with ${activeFueledTokens.length} active tokens`);
      }

      // Recalculate scores for tokens with expired fuel (background process)
      if (expiredTokens.length > 0) {
        console.log(`[🛡️ Enhanced Backend] 🔄 Triggering recalculation for ${expiredTokens.length} tokens with expired fuel...`);
        
        // Process recalculations in the background to avoid blocking the response
        setImmediate(async () => {
          await this.recalculateExpiredFuelTokens(expiredTokens);
        });
      }

      return activeFueledTokens;

    } catch (error) {
      console.error('[🛡️ Enhanced Backend] ❌ Error getting fueled tokens:', error);
      return [];
    }
  }

  async applyFuelToToken(contractAddress, fuelType) {
    try {
      console.log(`[🛡️ Enhanced Backend] 🔥 Starting fuel application: ${fuelType} to ${contractAddress}`);
      
      // Load current tokens to check if token exists
      const tokens = await this.getTokensFromCache();
      const existingToken = tokens.find(t => 
        t.contractAddress && t.contractAddress.toLowerCase() === contractAddress.toLowerCase()
      );

      if (!existingToken) {
        return {
          success: false,
          error: 'Token not found in database. Please ensure the token has been listed first.'
        };
      }

      // Load current fueled tokens
      const fueledTokens = await this.getFueledTokens();
      
      // Check if token is already fueled
      const existingFueledToken = fueledTokens.find(ft => 
        ft.contractAddress && ft.contractAddress.toLowerCase() === contractAddress.toLowerCase()
      );

      // Fuel configuration (very subtle multipliers for balanced scoring)
      const fuelConfig = {
        '10x': { boost: 0.02, duration: 12 * 60 * 60 * 1000 }, // 12 hours, 1.02x multiplier (2% boost)
        '50x': { boost: 0.04, duration: 18 * 60 * 60 * 1000 }, // 18 hours, 1.04x multiplier (4% boost)
        '500x': { boost: 0.06, duration: 24 * 60 * 60 * 1000 }, // 24 hours, 1.06x multiplier (6% boost)
        '1000x': { boost: 0.08, duration: 24 * 60 * 60 * 1000 } // 24 hours, 1.08x multiplier (8% boost)
      };

      const config = fuelConfig[fuelType];
      const now = new Date();
      const expiryTime = new Date(now.getTime() + config.duration);

      if (existingFueledToken) {
        // Stack fuel on existing fueled token
        if (!existingFueledToken.fuelApplications) {
          // Convert old format to new stacking format
          existingFueledToken.fuelApplications = [{
            fuelType: existingFueledToken.fuelType,
            boostMultiplier: existingFueledToken.boostMultiplier,
            appliedAt: existingFueledToken.fuelApplied,
            expiresAt: existingFueledToken.fuelExpiry
          }];
        }
        
        // Add new fuel application to the stack
        existingFueledToken.fuelApplications.push({
          fuelType: fuelType,
          boostMultiplier: 1 + config.boost,
          appliedAt: now.toISOString(),
          expiresAt: expiryTime.toISOString()
        });
        
        // Calculate total stacked fuel
        const totalFuelValue = existingFueledToken.fuelApplications.reduce((total, app) => {
          const fuelValue = parseInt(app.fuelType.replace('x', ''));
          return total + fuelValue;
        }, 0);
        
        // Calculate total boost multiplier (additive)
        const totalBoostMultiplier = existingFueledToken.fuelApplications.reduce((total, app) => {
          return total + (app.boostMultiplier - 1); // Subtract 1 to get just the boost part
        }, 1); // Start with 1 (no boost)
        
        // Update main fields with stacked values
        existingFueledToken.fuelType = `${totalFuelValue}x`;
        existingFueledToken.boostMultiplier = totalBoostMultiplier;
        existingFueledToken.fuelApplied = now.toISOString(); // Latest application time
        existingFueledToken.fuelExpiry = expiryTime.toISOString(); // Latest expiry time
        existingFueledToken.originalScore = existingToken.overallScore || existingToken.score || 0;
        
        console.log(`[🛡️ Enhanced Backend] 🔥 Stacked fuel: ${fuelType} + existing = ${totalFuelValue}x (${totalBoostMultiplier.toFixed(2)}x multiplier)`);
      } else {
        // Add new fueled token with stacking structure
        const newFueledToken = {
          contractAddress: contractAddress,
          symbol: existingToken.symbol,
          name: existingToken.name,
          fuelType: fuelType,
          boostMultiplier: 1 + config.boost,
          originalScore: existingToken.overallScore || existingToken.score || 0,
          fuelApplied: now.toISOString(),
          fuelExpiry: expiryTime.toISOString(),
          fuelApplications: [{
            fuelType: fuelType,
            boostMultiplier: 1 + config.boost,
            appliedAt: now.toISOString(),
            expiresAt: expiryTime.toISOString()
          }]
        };
        fueledTokens.push(newFueledToken);
        
        console.log(`[🛡️ Enhanced Backend] 🔥 New fuel applied: ${fuelType} (${(1 + config.boost).toFixed(2)}x multiplier)`);
      }

      // Save fueled tokens
      const baseDir = this.oauthXService?.db?.baseDir || process.env.DATA_DIR || '/var/data/dgo';
      const fueledTokensPath = path.join(baseDir, 'cache', 'fueled-tokens.json');
      
      // Ensure cache directory exists
      const cacheDir = path.dirname(fueledTokensPath);
      try {
        await fs.access(cacheDir);
      } catch {
        await fs.mkdir(cacheDir, { recursive: true });
      }

      await fs.writeFile(fueledTokensPath, JSON.stringify(fueledTokens, null, 2));
      console.log(`[🛡️ Enhanced Backend] 🔥 Saved ${fueledTokens.length} fueled tokens to ${fueledTokensPath}`);

      console.log(`[🛡️ Enhanced Backend] 🔥 Fuel ${fuelType} applied to ${existingToken.symbol} (${contractAddress})`);

      // Immediately recalculate token with fresh Jupiter data (but keep existing Twitter data)
      console.log(`[🛡️ Enhanced Backend] 🔄 Triggering immediate recalculation for fueled token ${existingToken.symbol}...`);
      
      try {
        // Refresh Jupiter data for this specific token
        const freshJupiterData = await this.tokenProcessor.jupiterService.getTokenDetails(contractAddress);
        
        if (freshJupiterData) {
          // 🚨 QUALITY FILTER: Check if token meets quality criteria
          const hasLaunchpad = freshJupiterData.launchpad && freshJupiterData.launchpad !== '';
          const hasOrganicScore = freshJupiterData.organicScore && freshJupiterData.organicScore > 0;
          const hasGraduatedAt = freshJupiterData.graduatedAt && freshJupiterData.graduatedAt !== '';
          
          // Only update if at least ONE quality criteria is present (not all missing)
          if (!hasLaunchpad && !hasOrganicScore && !hasGraduatedAt) {
            
            return res.status(400).json({
              success: false,
              error: 'Token failed quality filter',
              message: 'Token is missing all quality criteria (launchpad, organicScore, graduatedAt)',
              details: {
                launchpad: freshJupiterData.launchpad || 'missing',
                organicScore: freshJupiterData.organicScore || 0,
                graduatedAt: freshJupiterData.graduatedAt || 'missing'
              }
            });
          }
          
          
          // Update the token with fresh Jupiter data
          existingToken.jupiterData = freshJupiterData;
          existingToken.jupiterTimestamp = new Date().toISOString();
          
          // Mark token as fueled for scoring purposes
          existingToken.isFueled = true;
          existingToken.fuelType = fuelType;
          existingToken.fuelApplied = now.toISOString();
          existingToken.fuelExpiry = expiryTime.toISOString();
          
          // Recalculate overall score using existing Twitter data (respecting 24hr rule)
          const newOverallScore = await this.tokenProcessor.calculateEnhancedOverallScore(existingToken);
          
          // Update the token's score
          existingToken.overallScore = newOverallScore;
          existingToken.score = newOverallScore; // Keep both for compatibility
          existingToken.lastCalculated = new Date().toISOString();
          
          // Take hype snapshot after score recalculation
          await this.takeHypeSnapshot(existingToken);
          
          // Save updated tokens to cache
          await this.saveTokensToCache(tokens);
          
          console.log(`[🛡️ Enhanced Backend] ✅ Token ${existingToken.symbol} recalculated: ${newOverallScore.toFixed(2)} (fresh Jupiter data, existing Twitter data)`);
        } else {
          console.log(`[🛡️ Enhanced Backend] ⚠️ Could not fetch fresh Jupiter data for ${existingToken.symbol}, using existing data`);
        }
      } catch (recalcError) {
        console.error(`[🛡️ Enhanced Backend] ❌ Error recalculating fueled token ${existingToken.symbol}:`, recalcError);
        // Don't fail the fuel application if recalculation fails
      }

      // Get the updated fueled token to show current stacked values
      const updatedFueledToken = existingFueledToken || fueledTokens[fueledTokens.length - 1];
      const currentFuelDisplay = updatedFueledToken.fuelType;
      
      // Return the FULL token with jupiterData and socials for Twitter handle extraction
      const fullTokenData = {
        ...existingToken,
        ...updatedFueledToken, // Merge fuel info on top
        jupiterData: existingToken.jupiterData, // Ensure Jupiter data is included
        socials: existingToken.socials // Ensure socials are included
      };
      
      return {
        success: true,
        message: `Fuel ${fuelType} applied successfully to ${existingToken.symbol}! Total fuel: ${currentFuelDisplay}. Boost will last ${Math.round(config.duration / (60 * 60 * 1000))} hours.`,
        token: fullTokenData
      };

    } catch (error) {
      console.error('[🛡️ Enhanced Backend] ❌ Error applying fuel:', error);
      return {
        success: false,
        error: 'Internal server error while applying fuel'
      };
    }
  }

  async removeFuelFromToken(contractAddress) {
    try {
      // Load current fueled tokens
      const fueledTokens = await this.getFueledTokens();
      
      // Find the fueled token to remove
      const fueledTokenIndex = fueledTokens.findIndex(ft => 
        ft.contractAddress && ft.contractAddress.toLowerCase() === contractAddress.toLowerCase()
      );

      if (fueledTokenIndex === -1) {
        return {
          success: false,
          error: 'Token is not currently fueled or fuel has already expired.'
        };
      }

      const fueledToken = fueledTokens[fueledTokenIndex];
      
      // Remove the fueled token from the array
      fueledTokens.splice(fueledTokenIndex, 1);

      // Save updated fueled tokens
      const baseDir = this.oauthXService?.db?.baseDir || process.env.DATA_DIR || '/var/data/dgo';
      const fueledTokensPath = path.join(baseDir, 'cache', 'fueled-tokens.json');
      
      // Ensure cache directory exists
      const cacheDir = path.dirname(fueledTokensPath);
      try {
        await fs.access(cacheDir);
      } catch {
        await fs.mkdir(cacheDir, { recursive: true });
      }

      await fs.writeFile(fueledTokensPath, JSON.stringify(fueledTokens, null, 2));

      console.log(`[🛡️ Enhanced Backend] 🗑️ Fuel removed from ${fueledToken.symbol} (${contractAddress})`);

      // Optionally recalculate the token's score without fuel boost
      try {
        const tokens = await this.getTokensFromCache();
        const existingToken = tokens.find(t => 
          t.contractAddress && t.contractAddress.toLowerCase() === contractAddress.toLowerCase()
        );

        if (existingToken) {
          console.log(`[🛡️ Enhanced Backend] 🔄 Recalculating ${existingToken.symbol} without fuel boost...`);
          
          // Refresh Jupiter data and recalculate score
          const freshJupiterData = await this.tokenProcessor.jupiterService.getTokenDetails(contractAddress);
          
          if (freshJupiterData) {
            // 🚨 QUALITY FILTER: Check if token meets quality criteria
            const hasLaunchpad = freshJupiterData.launchpad && freshJupiterData.launchpad !== '';
            const hasOrganicScore = freshJupiterData.organicScore && freshJupiterData.organicScore > 0;
            const hasGraduatedAt = freshJupiterData.graduatedAt && freshJupiterData.graduatedAt !== '';
            
            // Only update if at least ONE quality criteria is present (not all missing)
            if (!hasLaunchpad && !hasOrganicScore && !hasGraduatedAt) {
              
              // Mark token for removal
              existingToken._markedForRemoval = true;
              existingToken._removalReason = 'Missing all quality criteria: launchpad, organicScore, graduatedAt';
              return; // Skip this token
            }
            
            
            existingToken.jupiterData = freshJupiterData;
            existingToken.jupiterTimestamp = new Date().toISOString();
          }
          
          // Recalculate overall score without fuel boost
          const newOverallScore = await this.tokenProcessor.calculateEnhancedOverallScore(existingToken);
          
          existingToken.overallScore = newOverallScore;
          existingToken.score = newOverallScore;
          existingToken.lastCalculated = new Date().toISOString();
          
          // Take hype snapshot after score recalculation
          await this.takeHypeSnapshot(existingToken);
          
          // Save updated tokens to cache
          await this.saveTokensToCache(tokens);
          
          console.log(`[🛡️ Enhanced Backend] ✅ Token ${existingToken.symbol} recalculated without fuel: ${newOverallScore.toFixed(2)}`);
        }
      } catch (recalcError) {
        console.error(`[🛡️ Enhanced Backend] ❌ Error recalculating token after fuel removal:`, recalcError);
        // Don't fail the fuel removal if recalculation fails
      }

      return {
        success: true,
        message: `Fuel removed successfully from ${fueledToken.symbol}! Token score has been recalculated without fuel boost.`
      };

    } catch (error) {
      console.error('[🛡️ Enhanced Backend] ❌ Error removing fuel:', error);
      return {
        success: false,
        error: 'Internal server error while removing fuel'
      };
    }
  }

  async recalculateExpiredFuelTokens(expiredTokens) {
    try {
      console.log(`[🛡️ Enhanced Backend] 🔄 Recalculating ${expiredTokens.length} tokens with expired fuel...`);
      
      // Load current tokens from cache
      const tokens = await this.getTokensFromCache();
      let updatedCount = 0;
      
      for (const expiredToken of expiredTokens) {
        try {
          // Find the token in the main cache
          const existingToken = tokens.find(t => 
            t.contractAddress && t.contractAddress.toLowerCase() === expiredToken.contractAddress.toLowerCase()
          );

          if (existingToken) {
            console.log(`[🛡️ Enhanced Backend] 🔄 Recalculating ${expiredToken.symbol} (${expiredToken.reason})...`);
            
            // Refresh Jupiter data
            const freshJupiterData = await this.tokenProcessor.jupiterService.getTokenDetails(expiredToken.contractAddress);
            
            if (freshJupiterData) {
              // 🚨 QUALITY FILTER: Check if token meets quality criteria
              const hasLaunchpad = freshJupiterData.launchpad && freshJupiterData.launchpad !== '';
              const hasOrganicScore = freshJupiterData.organicScore && freshJupiterData.organicScore > 0;
              const hasGraduatedAt = freshJupiterData.graduatedAt && freshJupiterData.graduatedAt !== '';
              
              // Only update if at least ONE quality criteria is present (not all missing)
              if (!hasLaunchpad && !hasOrganicScore && !hasGraduatedAt) {
                
                // Mark token for removal
                existingToken._markedForRemoval = true;
                existingToken._removalReason = 'Missing all quality criteria: launchpad, organicScore, graduatedAt';
                continue; // Skip this token
              }
              
              
              existingToken.jupiterData = freshJupiterData;
              existingToken.jupiterTimestamp = new Date().toISOString();
            }
            
            // Recalculate overall score without fuel boost
            const newOverallScore = await this.tokenProcessor.calculateEnhancedOverallScore(existingToken);
            
            existingToken.overallScore = newOverallScore;
            existingToken.score = newOverallScore;
            existingToken.lastCalculated = new Date().toISOString();
            
            // Take hype snapshot after score recalculation
            await this.takeHypeSnapshot(existingToken);
            
            console.log(`[🛡️ Enhanced Backend] ✅ ${expiredToken.symbol} recalculated: ${newOverallScore.toFixed(2)} (fuel expired)`);
            updatedCount++;
            
            // Small delay to avoid overwhelming the system
            await new Promise(resolve => setTimeout(resolve, 100));
            
          } else {
            console.log(`[🛡️ Enhanced Backend] ⚠️ Token ${expiredToken.symbol} not found in main cache`);
          }
        } catch (tokenError) {
          console.error(`[🛡️ Enhanced Backend] ❌ Error recalculating ${expiredToken.symbol}:`, tokenError);
        }
      }
      
      // Save updated tokens to cache if any were updated
      if (updatedCount > 0) {
        await this.saveTokensToCache(tokens);
        console.log(`[🛡️ Enhanced Backend] ✅ Successfully recalculated ${updatedCount}/${expiredTokens.length} tokens with expired fuel`);
      }
      
    } catch (error) {
      console.error('[🛡️ Enhanced Backend] ❌ Error in bulk fuel expiry recalculation:', error);
    }
  }

  // Check if cached data is available
  async hasCachedData() {
    try {
      const cachePath = this.persistentCachePath;
      await fs.access(cachePath);
      const data = await fs.readFile(cachePath, 'utf8');
      const tokens = JSON.parse(data || '[]');
      return Array.isArray(tokens) && tokens.length > 0;
    } catch (error) {
      return false;
    }
  }

  // Preload cache to serve real data during startup
  async preloadCache() {
    try {
      console.log('📊 PRELOAD: Attempting to load cached tokens...');
      
      // Try to load cached data immediately
      const cachedTokens = await this.getTokensFromCache();
      
      if (cachedTokens && cachedTokens.length > 0) {
        console.log(`✅ PRELOAD: Successfully loaded ${cachedTokens.length} cached tokens`);
        console.log('🎯 PRELOAD: Real cached data will be served during startup');
        
        // Store in token processor for immediate availability
        this.tokenProcessor.processedTokens = cachedTokens;
        
        return true;
      } else {
        console.log('⚠️ PRELOAD: No cached data found - will serve empty data until processing completes');
        return false;
      }
      
    } catch (error) {
      console.log(`❌ PRELOAD: Failed to load cache: ${error.message}`);
      console.log('⚠️ PRELOAD: Will serve empty data until processing completes');
      return false;
    }
  }

  // 🚀 NEW: Initialize WebSocket server early for real-time updates
  async initializeWebSocketServer() {
    try {
      console.log('📡 Initializing WebSocket server...');
      
      const BackendWebSocketServer = (await import('./services/BackendWebSocketServer.js')).default;
      this.backendWebSocketServer = new BackendWebSocketServer(this.server);
      this.backendWebSocketServer.initialize();
      
      console.log('✅ WebSocket server initialized on /ws');
      
      // Now reinitialize EnhancedHybridPriceService with WebSocket server
      if (this.enhancedHybridPriceService) {
        console.log('🔄 Reinitializing EnhancedHybridPriceService with WebSocket server...');
        this.enhancedHybridPriceService.webSocketServer = this.backendWebSocketServer;
        
        // ✅ Start ranking broadcasts for real-time updates
        this.enhancedHybridPriceService.startRankingBroadcasts(30000); // 30 seconds
        console.log('📊 Started WebSocket ranking broadcasts');
      }
      
    } catch (error) {
      console.error('❌ Failed to initialize WebSocket server:', error.message);
    }
  }

  async initializeRealTimePriceService() {
    try {
      console.log('🚀 Initializing Real-Time Price Service...');
      
      // DISABLED: CoinVera WebSocket service removed - using gRPC instead
      console.log('⚠️ [RealTimePrice] CoinVera WebSocket service disabled - using gRPC EnhancedHybridPriceService instead');
      
      // Get the HTTP server instance from the running server
      const server = this.server;
      if (!server) {
        console.error('❌ Cannot initialize Real-Time Price Service: HTTP server not available');
        return;
      }
      
      console.log('📡 WebSocket server already initialized, proceeding with real-time services...');
      
      // 🚀 Initialize Enhanced Real-Time Services (gRPC-based)
      console.log('🚀 Initializing Enhanced Real-Time Services...');
      
      // Initialize Real-Time Token Monitor
      this.realTimeTokenMonitor = new RealTimeTokenMonitor(this.backendWebSocketServer);
      await this.realTimeTokenMonitor.initialize();
      await this.realTimeTokenMonitor.startMonitoring();
      
      // Initialize Token Cache Watcher
      const cachePath = path.join(process.cwd(), 'cache', 'tokens-cache.json');
      this.tokenCacheWatcher = new TokenCacheWatcher(cachePath, this.realTimeTokenMonitor);
      this.tokenCacheWatcher.on('newTokens', (newTokens) => {
        console.log(`🆕 [Backend] ${newTokens.length} new tokens detected and subscribed to real-time monitoring`);
      });
      this.tokenCacheWatcher.on('tokenSubscribed', (data) => {
        console.log(`🔌 [Backend] Token ${data.symbol} subscribed to real-time monitoring`);
      });
      await this.tokenCacheWatcher.startWatching();
      
      console.log('✅ Enhanced Real-Time Services initialized successfully');
      
    } catch (error) {
      console.error('❌ Failed to initialize Real-Time Price Service:', error.message);
      console.error('❌ Error stack:', error.stack);
      console.error('⚠️ Backend will continue without real-time price updates');
    }
  }

  async start() {
    try {
      // DISABLED: Initialize KOL Service (was making CoinAPI/CoinDesk calls)
      // await this.initializeKOLService();
      
      // Load KOL routes first
      await this.loadKOLRoutes();
      
      // PRELOAD CACHE: Load cached data immediately to serve real data during startup
      console.log('🚀 PRELOADING CACHE: Loading cached data before serving requests...');
      const cacheLoaded = await this.preloadCache();
      
      if (cacheLoaded) {
        console.log('✅ STARTUP: Real cached data is now available - no more mock data!');
      } else {
        console.log('⚠️ STARTUP: No cached data found - will serve empty data until processing completes');
      }
      
      await this.tokenProcessor.initialize();

      // Initialize Social Context AI
      console.log('🧠 Initializing Social Context AI...');
      try {
        await this.socialContextAI.initialize();
        console.log('✅ Social Context AI initialized successfully');
        
        // Initialize Daily Tweet Service with OpenAI
        console.log('📅 Initializing Daily Tweet Service...');
        this.dailyTweetService = new DailyTweetService(
          this.twitterAutoPostService,
          this.socialContextAI.openaiService
        );
        console.log('✅ Daily Tweet Service initialized');
        
        // Auto-restart if it was running before server restart
        await this.dailyTweetService.loadState();
        if (this.dailyTweetService.shouldAutoRestart) {
          console.log('🔄 Auto-restarting Daily Tweet Service from saved state...');
          this.dailyTweetService.start(true);
        }
        
        // Initialize Twitter Mention Service
        console.log('🐦 Initializing Twitter Mention Service...');
        this.twitterMentionService = new TwitterMentionService(
          this.twitterAutoPostService,
          this.socialContextAI.openaiService,
          this // Pass backend instance for cache access
        );
        console.log('✅ Twitter Mention Service initialized');
        
        // Auto-start mention tracking
        console.log('🚀 Starting Twitter Mention Service...');
        await this.twitterMentionService.start();
        console.log('✅ Twitter Mention Service started - monitoring @dgnoracle mentions every 10 minutes');
        
      } catch (error) {
        console.error('❌ Social Context AI failed to initialize:', error.message);
        console.warn('⚠️ Continuing with fallback analysis only...');
      }

      // Initialize Call Thesis Generator
      console.log('🧠 Initializing Call Thesis Generator...');
      try {
        await this.callThesisGenerator.initialize();
        console.log('✅ Call Thesis Generator initialized successfully');
      } catch (error) {
        console.error('❌ Call Thesis Generator failed to initialize:', error.message);
        console.warn('⚠️ Continuing with fallback thesis generation...');
      }

      // Start Milestone Tracker
      console.log('🎯 Starting Milestone Tracker...');
      try {
        this.milestoneTracker.start();
        console.log('✅ Milestone Tracker started successfully');
      } catch (error) {
        console.error('❌ Milestone Tracker failed to start:', error.message);
        console.warn('⚠️ Continuing without milestone tracking...');
      }

      // Initialize Automated Token Cleanup
      console.log('🤖 Initializing Automated Token Cleanup...');
      try {
        const chartDb = this.realTimeTokenMonitor?.hybridPriceService?.chartDatabase || this.enhancedHybridPriceService?.chartDatabase;
        await this.automatedCleanup.initialize(this.realTimeTokenMonitor, chartDb);
        console.log('✅ Automated Token Cleanup initialized successfully');
      } catch (error) {
        console.error('❌ Automated Token Cleanup failed to initialize:', error.message);
        console.warn('⚠️ Continuing without automated cleanup...');
      }

      // Initialize Holder Cache Cleanup
      console.log('🗂️ Initializing Holder Cache Cleanup...');
      try {
        const { default: HolderCacheService } = await import('./services/HolderCacheService.js');
        const cacheService = new HolderCacheService();
        
        // Initial cleanup of expired cache
        const deletedCount = await cacheService.clearExpiredCache();
        console.log(`✅ Holder Cache initialized - cleared ${deletedCount} expired files`);
        
        // Schedule automatic cleanup every 6 hours
        setInterval(async () => {
          try {
            const deleted = await cacheService.clearExpiredCache();
            if (deleted > 0) {
              console.log(`🗑️ Automatic holder cache cleanup: removed ${deleted} expired files`);
            }
          } catch (error) {
            console.error('❌ Automatic holder cache cleanup failed:', error.message);
          }
        }, 6 * 60 * 60 * 1000); // Every 6 hours
        
        console.log('✅ Holder Cache automatic cleanup scheduled (every 6 hours)');
      } catch (error) {
        console.error('❌ Holder Cache initialization failed:', error.message);
        console.warn('⚠️ Continuing without holder cache cleanup...');
      }
      // Start HTTP server first so /health is immediately available for platform health checks
      const host = '0.0.0.0';
      console.log(`[Startup] Binding server on ${host}:${this.port}`);
      this.app.get('/', (req, res) => res.redirect('/health'));
      this.server = this.app.listen(this.port, host, () => {
        const isProduction = process.env.NODE_ENV === 'production';
        const baseUrl = isProduction ? 'https://api.degen-oracle.com' : `http://localhost:${this.port}`;

        console.log(`🚀 Enhanced Backend running on ${baseUrl}`);
        console.log(`📊 Health check: ${baseUrl}/health`);
        console.log(`🔍 API Status: ${baseUrl}/api/status`);
        console.log(`🔗 API Tokens: ${baseUrl}/api/tokens`);
        console.log(`📱 Admin Dashboard: ${baseUrl}/admin-dashboard.html`);

        this.isRunning = true;
        
        // 🚀 Initialize WebSocket server immediately after HTTP server starts
        this.initializeWebSocketServer();
        
        // Initialize Real-Time Price Service after server starts
        try {
          this.initializeRealTimePriceService();
        } catch (error) {
          console.error('❌ Failed to initialize Real-Time Price Service:', error.message);
          console.error('⚠️ Backend will continue without real-time price updates');
        }

        // Defer Enhanced Backup System initialization so health checks pass quickly
        setTimeout(async () => {
          console.log('🔄 Initializing Enhanced Backup System...');
          try {
            this.backupIntegration = await createBackupIntegration(this.oauthXService?.db);
            
            // 🛡️ CHECK IF ALREADY RUNNING: Prevent multiple starts
            const status = await this.backupIntegration.getStatus();
            if (!status.backup?.isRunning) {
              await this.backupIntegration.start();
              console.log('✅ Enhanced Backup System started successfully');
              console.log('📸 Automatic snapshots: 24 per day (every 1 hour)');
              console.log('🕐 Retention: 10 snapshots max (10 hours)');
            } else {
              console.log('✅ Enhanced Backup System already running');
            }
          } catch (error) {
            console.error('❌ Enhanced Backup System failed to start:', error.message);
            console.warn('⚠️ Continuing without enhanced backups...');
          }
        }, 0);

        // Start monthly snapshot checking
        setTimeout(async () => {
          console.log('📸 Starting Monthly Snapshot Service...');
          try {
            this.startMonthlySnapshotChecking();
            console.log('✅ Monthly Snapshot Service started successfully');
            console.log('📅 Automatic snapshots: End of each month at 23:59');
          } catch (error) {
            console.error('❌ Monthly Snapshot Service failed to start:', error.message);
            console.warn('⚠️ Continuing without monthly snapshots...');
          }
        }, 1000);

        // Start token processing workflow after backend is ready
        // Delay more to ensure platform health checks pass before heavy work and allow kill switch via env
        const disableAutoStart = String(process.env.DISABLE_AUTO_START || '').trim() === '1';
        const startDelayMs = Number(process.env.START_PIPELINE_DELAY_MS || 12000); // default 12s
        if (disableAutoStart) {
          console.log('[🛡️ Enhanced Backend] ⏸️ Auto-start disabled via DISABLE_AUTO_START=1');
        } else {
          console.log(`[🛡️ Enhanced Backend] ⏱️ Scheduling pipeline auto-start in ${startDelayMs}ms...`);
          setTimeout(async () => {
            try {
              console.log('[🛡️ Enhanced Backend] 🚀 Backend ready, starting token processing...');
              const status = this.tokenProcessor.getProcessingStatus();
              if (status.processedCount === 0) {
                // Fresh installation - start full processing
                console.log('[🛡️ Enhanced Backend] 🆕 No tokens found, starting initial processing...');
                await this.tokenProcessor.startProcessing();
              } else {
                // Auto-start processing after reboot with existing tokens (skip Twitter to avoid API waste)
                console.log(`[🛡️ Enhanced Backend] 📊 Found ${status.processedCount} existing tokens`);
                console.log('[🛡️ Enhanced Backend] 🔄 Auto-starting processing pipeline after reboot (skipTwitter=true)...');
                await this.tokenProcessor.startProcessing({ skipTwitter: true });
              }
            } catch (error) {
              console.error('[🛡️ Enhanced Backend] ❌ Error starting token processing:', error);
            }
          }, startDelayMs);
        }
      });
      
    } catch (error) {
      console.error('❌ Failed to start Enhanced Backend:', error);
      process.exit(1);
    }
  }

  startMonthlySnapshotChecking() {
    // Check for snapshots every hour (much more efficient)
    setInterval(async () => {
      try {
        // Quick check if we're on the last day of month
        const now = new Date();
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const isLastDay = now.getMonth() !== tomorrow.getMonth();
        
        // Only do heavy calculations if we're on the last day
        if (!isLastDay) {
          return; // Skip expensive operations
        }
        
        // Check if it's near end of day (23:00-23:59)
        const isNearEndOfDay = now.getHours() >= 23;
        if (!isNearEndOfDay) {
          return; // Skip if not near end of day
        }
        
        console.log('📸 Last day of month detected, checking for snapshot...');
        
        // Get current leaderboard data (only when needed)
        const allKolCalls = await this.oauthXService.db.getAllKolCalls();
        const userCalls = {};
        allKolCalls.forEach(call => {
          if (!userCalls[call.userId]) {
            userCalls[call.userId] = [];
          }
          userCalls[call.userId].push(call);
        });

        const tokens = await this.getTokensFromCache();
        const currentTokenData = {};
        tokens.forEach(token => {
          currentTokenData[token.contractAddress] = token;
        });

        const leaderboardResult = await this.generateEnhancedLeaderboard(userCalls, currentTokenData);
        
        // Check if we should take a snapshot
        const snapshotTaken = await this.monthlySnapshotService.checkAndTakeSnapshot(leaderboardResult.leaderboard);
        
        if (snapshotTaken) {
          console.log('📸 Monthly snapshot taken successfully!');
        }
      } catch (error) {
        console.error('❌ Monthly snapshot check failed:', error.message);
      }
    }, 60 * 60 * 1000); // Check every hour instead of every minute
  }

  async stop() {
    try {
      console.log('[🛡️ Enhanced Backend] 🛑 Shutting down gracefully...');
      
      if (this.tokenProcessor.isProcessing) {
        this.tokenProcessor.stopProcessing();
      }
      
      this.isRunning = false;
      console.log('[🛡️ Enhanced Backend] ✅ Shutdown complete');
      
    } catch (error) {
      console.error('[🛡️ Enhanced Backend] ❌ Shutdown error:', error);
    }
  }

  // Helper method for Twitter usage recommendations
  getTwitterUsageRecommendations(stats) {
    const recommendations = [];
    
    if (stats.emergencyMode) {
      recommendations.push({
        type: 'critical',
        message: 'Emergency mode is active - all Twitter refreshes are blocked',
        action: 'Deactivate emergency mode only if you have confirmed API limit reset'
      });
    } else if (stats.usagePercent >= 90) {
      recommendations.push({
        type: 'critical',
        message: `Critically high usage: ${stats.usagePercent}% of monthly limit used`,
        action: 'Consider activating emergency mode to preserve remaining calls'
      });
    } else if (stats.usagePercent >= 80) {
      recommendations.push({
        type: 'warning',
        message: `High usage warning: ${stats.usagePercent}% of monthly limit used`,
        action: 'Monitor usage closely and reduce refresh frequency'
      });
    }
    
    if (stats.projectedMonthlyUsage > stats.monthlyLimit) {
      recommendations.push({
        type: 'warning',
        message: `Projected monthly usage (${stats.projectedMonthlyUsage}) exceeds limit`,
        action: 'Reduce daily refresh rate or activate emergency mode'
      });
    }
    
    // Tier-specific recommendations
    Object.entries(stats.tierUsage).forEach(([tier, usage]) => {
      const tierLimits = {
        CRITICAL: 500,
        IMPORTANT: 300,
        STANDARD: 200,
        ARCHIVE: 50
      };
      
      const limit = tierLimits[tier];
      const percent = (usage / limit) * 100;
      
      if (percent >= 90) {
        recommendations.push({
          type: 'warning',
          message: `${tier} tier at ${percent.toFixed(1)}% capacity (${usage}/${limit})`,
          action: `Reduce ${tier.toLowerCase()} tier refreshes`
        });
      }
    });
    
    if (recommendations.length === 0) {
      recommendations.push({
        type: 'info',
        message: 'Twitter API usage is within normal limits',
        action: 'Continue monitoring usage patterns'
      });
    }
    
    return recommendations;
  }

  /**
   * Get recent logs from log files (production-ready implementation)
   */
  async getRecentLogs(lines = 100, level = 'all') {
    try {
      // Winston log file path
      const logFile = '/var/data/logs/app.log';
      
      // Ensure log directory exists
      await fs.mkdir('/var/data/logs', { recursive: true });
      
      // Check if log file exists
      try {
        await fs.access(logFile);
      } catch {
        // Log file doesn't exist, return empty array
        return [];
      }
      
      // Read log file
      const logContent = await fs.readFile(logFile, 'utf8');
      const logLines = logContent.split('\n').filter(line => line.trim());
      
      // Parse log entries
      const logs = [];
      for (const line of logLines) {
        try {
          // Parse Winston JSON log format
          const logEntry = JSON.parse(line);
          logs.push({
            timestamp: logEntry.timestamp,
            level: logEntry.level,
            message: logEntry.message
          });
        } catch (parseError) {
          // Skip malformed log entries
          continue;
        }
      }
      
      // Filter logs by level
      let filteredLogs = logs;
      if (level !== 'all') {
        filteredLogs = logs.filter(log => {
          switch (level) {
            case 'error':
              return log.level === 'error' || log.message.includes('❌') || log.message.includes('Error');
            case 'system':
              return log.message.includes('🚀') || log.message.includes('🔄') || log.message.includes('✅') || 
                     log.message.includes('Initializing') || log.message.includes('Starting') || 
                     log.message.includes('Backend') || log.message.includes('Service');
            case 'processing':
              return log.message.includes('Processing') || log.message.includes('Token') || 
                     log.message.includes('Jupiter') || log.message.includes('Twitter') ||
                     log.message.includes('Stage') || log.message.includes('Queue');
            case 'database':
              return log.message.includes('Database') || log.message.includes('Cache') || 
                     log.message.includes('Save') || log.message.includes('Load') ||
                     log.message.includes('🗄️') || log.message.includes('💾');
            default:
              return true;
          }
        });
      }

      // Return the most recent logs
      return filteredLogs.slice(-lines);
      
    } catch (error) {
      console.error('[🛡️ Enhanced Backend] ❌ Error getting recent logs:', error);
      return [{
        timestamp: new Date().toISOString(),
        level: 'error',
        message: `Failed to get logs: ${error.message}`
      }];
    }
  }

  // Helper method to calculate since timestamp for different ranges
  calculateSinceTimestamp(range) {
    const now = Date.now();
    const ranges = {
      '1d': 24 * 60 * 60 * 1000,
      '3d': 3 * 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '15d': 15 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000
    };
    return now - (ranges[range] || ranges['7d']);
  }

  // Winston logger is now used instead of custom logging
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Received SIGINT, shutting down gracefully...');
  
  if (global.enhancedBackend) {
    await global.enhancedBackend.stop();
  }
  
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
  
  if (global.enhancedBackend) {
    await global.enhancedBackend.stop();
  }
  
  process.exit(0);
});

export default EnhancedBackend;

// Start the server
console.log('🚀 Starting Enhanced Backend Server...');
const server = new EnhancedBackend();
global.enhancedBackend = server;

// Start the server
server.start().catch(error => {
  console.error('❌ Failed to start Enhanced Backend:', error);
  process.exit(1);
});

