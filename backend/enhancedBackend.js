import express from 'express';
import cors from 'cors';
import axios from 'axios';
import crypto from 'crypto';
import EnhancedTokenProcessor from './enhancedTokenProcessor.js';
import HelioPaymentService from './helioPaymentService.js';
import OAuthXService from './oauthXService.js';
import fs from 'fs/promises';
import path from 'path';
import HypeSnapshotService from './hypeSnapshotService.js';
import McapSnapshotService from './mcapSnapshotService.js';
import BirdEyeTrendingService from './birdEyeTrendingService.js';
import PriorityQueueService from './priorityQueueService.js';
import LeaderboardScoringEngine from './leaderboardScoringEngine.js';
import SocialContextAI from './socialContextAI.js';
import { createBackupIntegration } from './backupIntegration.js';
import HypeTrendAnalysis from './hypeTrendAnalysis.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class EnhancedBackend {
  // Determine if a token should be excluded due to suspicious audit flags
  isSuspiciousToken(token) {
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
  constructor() {
    this.app = express();
    this.port = process.env.PORT || 4000;
    this.tokenProcessor = new EnhancedTokenProcessor();
    this.hypeService = new HypeSnapshotService();
    this.mcapService = new McapSnapshotService();
    this.birdeyeService = new BirdEyeTrendingService();
    this.helioService = new HelioPaymentService();
    this.oauthXService = new OAuthXService();
    this.priorityQueue = new PriorityQueueService();
    this.leaderboardEngine = new LeaderboardScoringEngine();
    this.socialContextAI = new SocialContextAI();
    this.hypeTrendAnalysis = new HypeTrendAnalysis();
    this.backupIntegration = null; // Will be initialized in setupServices()
    // Persistent cache path for tokens-cache.json under DATA_DIR
    try {
      const baseDir = this.oauthXService?.db?.baseDir || process.env.DATA_DIR || '/var/data/dgo';
      this.persistentCachePath = path.join(baseDir, 'cache', 'tokens-cache.json');
      console.log(`[🛡️ Enhanced Backend] 🔧 Persistent cache path set to: ${this.persistentCachePath}`);
      console.log(`[🛡️ Enhanced Backend] 🔧 Base directory: ${baseDir}`);
      console.log(`[🛡️ Enhanced Backend] 🔧 DATA_DIR env: ${process.env.DATA_DIR}`);
    } catch (error) {
      // Fallback to local (non-persistent) path only if necessary
      this.persistentCachePath = path.join(__dirname, 'cache', 'tokens-cache.json');
      console.log(`[🛡️ Enhanced Backend] ⚠️ Fallback to local cache path: ${this.persistentCachePath}`);
      console.log(`[🛡️ Enhanced Backend] ⚠️ Fallback reason:`, error.message);
    }
    this.isRunning = false;
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupBackgroundTasks();
    
    // Enhanced backup system is now initialized in start() method
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
          'http://localhost:3000', // for development
          'http://localhost:4000'  // for development
        ];
        
        // Allow any Cloudflare Pages subdomain for dgo-20l.pages.dev
        const cloudflarePattern = /^https:\/\/[a-f0-9]+\.dgo-20l\.pages\.dev$/;
        
        if (allowedOrigins.includes(origin) || cloudflarePattern.test(origin)) {
          callback(null, true);
        } else {
          console.log('🚫 CORS blocked origin:', origin);
          callback(new Error('Not allowed by CORS'));
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
    };

    this.app.use(cors(corsOptions));
    this.app.use(express.json());

    // Handle preflight requests
    this.app.options('*', cors(corsOptions));

    // Serve static files from public directory (for admin dashboard)
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
        console.error('[🛡️ Enhanced Backend] ❌ Status endpoint error:', error);
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
        const { sessionId, receipt, paylinkId: clientPaylinkId } = req.body;
        if (!sessionId) return res.status(400).json({ success: false, error: 'Missing sessionId' });
        const user = await this.oauthXService.getUserBySession(sessionId);
        if (!user) return res.status(401).json({ success: false, error: 'Invalid session' });

        // Determine plan by paylinkId (monthly vs yearly)
        const envMonthly = process.env.HELIO_MONTHLY_PAYLINK_ID || '68b8ed60cf71471addc8adb6';
        const envYearly = process.env.HELIO_YEARLY_PAYLINK_ID || null;
        const receiptPaylinkId = receipt?.paylinkId || receipt?.paylink?.id || clientPaylinkId || null;

        let planType = 'monthly';
        let durationDays = 30;
        if (envYearly && receiptPaylinkId && String(receiptPaylinkId) === String(envYearly)) {
          planType = 'yearly';
          durationDays = 365; // Yearly plan (assumed 20% discount handled by Helio)
        }

        // Persist premium status for the selected duration
        const now = new Date();
        const expiresAt = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);
        const result = await this.oauthXService.db.setPremiumStatus(user.id, {
          isPremium: true,
          subscriptionType: `helio_${planType}`,
          receipt: receipt || null,
          paylinkId: receiptPaylinkId || null,
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
        } catch (e) {
          console.error('[🛡️ Enhanced Backend] ⚠️ Failed to record earning:', e.message);
        }

        res.json({ success: true, premium: result });
      } catch (error) {
        console.error('[🛡️ Enhanced Backend] ❌ Activate premium failed:', error.message);
        res.status(500).json({ success: false, error: 'Failed to activate premium' });
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
    this.app.get('/api/admin/users/stats', async (req, res) => {
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

    this.app.get('/api/admin/users', async (req, res) => {
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

    // Admin: Upgrade a user to premium bypassing payment
    this.app.post('/api/admin/users/:id/upgrade', async (req, res) => {
      try {
        const { id } = req.params;
        const { durationDays = 30, subscriptionType = 'admin_grant' } = req.body || {};
        const now = new Date();
        const expiresAt = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);
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

    // Admin: Earnings endpoints
    this.app.get('/api/admin/earnings/summary', async (req, res) => {
      try {
        const summary = await this.oauthXService.db.getEarningsSummary();
        res.json({ success: true, summary });
      } catch (error) {
        console.error('[🛡️ Enhanced Backend] ❌ Earnings summary failed:', error.message);
        res.status(500).json({ success: false, error: 'Failed to get earnings summary' });
      }
    });

    this.app.get('/api/admin/earnings', async (req, res) => {
      try {
        const list = await this.oauthXService.db.getEarnings();
        res.json({ success: true, earnings: list });
      } catch (error) {
        console.error('[🛡️ Enhanced Backend] ❌ Earnings list failed:', error.message);
        res.status(500).json({ success: false, error: 'Failed to get earnings list' });
      }
    });

    // Admin: Referral codes
    this.app.get('/api/admin/referrals', async (req, res) => {
      try {
        const list = await this.oauthXService.db.listReferralCodes();
        res.json({ success: true, referrals: list });
      } catch (e) {
        console.error('[🛡️ Enhanced Backend] ❌ List referrals error:', e.message);
        res.status(500).json({ error: 'Failed to list referral codes' });
      }
    });

    this.app.post('/api/admin/referrals', async (req, res) => {
      try {
        const { ownerUserId = 'admin', code, maxUses = 30 } = req.body || {};
        const created = await this.oauthXService.db.createReferralCode({ ownerUserId, code, maxUses });
        res.json({ success: true, referral: created });
      } catch (e) {
        console.error('[🛡️ Enhanced Backend] ❌ Create referral error:', e.message);
        res.status(500).json({ error: 'Failed to create referral code' });
      }
    });

    // Get all tokens
    this.app.get('/api/tokens', async (req, res) => {
      try {
        console.log('[🛡️ Enhanced Backend] 📊 API request for tokens received...');

        const tokens = await this.getTokensFromCache();

        if (tokens.length === 0) {
          console.log('[🛡️ Enhanced Backend] ⚠️ No tokens found in cache');
          res.json([]);
          return;
        }

        // Exclude suspicious or rugged tokens from API output as an extra safety layer
        tokens = tokens.filter(t => !this.isSuspiciousToken(t) && !this.isRuggedToken(t));

        // Apply enhanced deduplication to ensure no duplicates are served
        const deduplicatedTokens = this.tokenProcessor.deduplicateTokens(tokens);
        console.log(`[🛡️ Enhanced Backend] 🔄 Deduplicated API response: ${tokens.length} → ${deduplicatedTokens.length} tokens`);

        // Filter out tokens without valid contract addresses
        const validTokens = deduplicatedTokens.filter(token => 
          token.contractAddress && 
          token.contractAddress !== null && 
          token.contractAddress.length > 10
        );
        
        console.log(`[🛡️ Enhanced Backend] ✅ Returning ${validTokens.length} valid tokens (filtered out ${deduplicatedTokens.length - validTokens.length} without contracts)`);
        res.json(validTokens);

      } catch (error) {
        console.error('[🛡️ Enhanced Backend] ❌ Error fetching tokens:', error);
        res.status(500).json({ error: 'Failed to fetch tokens' });
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
        
        // Check authentication for premium limits
        if (sessionId) {
          const user = await this.oauthXService.getUserBySession(sessionId);
          if (user) {
            const premiumStatus = await this.oauthXService.db.getPremiumStatus(user.id);
            const isPremium = premiumStatus?.isPremium && new Date(premiumStatus.expiresAt) > new Date();
            
            if (!isPremium) {
              const viewsThisMonth = await this.oauthXService.db.addHypeViewUsage(user.id, contract);
              if (viewsThisMonth > 5) {
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
        const snaps = await this.hypeService.getSnapshots(contract, sinceMs);
        res.json({ contract, range: `${days}d`, data: snaps });
      } catch (error) {
        console.error('[🛡️ Enhanced Backend] ❌ Hype snapshots error:', error.message);
        res.status(500).json({ error: 'Failed to fetch hype snapshots' });
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

    // Get BirdEye trending tokens (test endpoint)
    this.app.get('/api/tokens/birdeye-trending', async (req, res) => {
      try {
        console.log('[🛡️ Enhanced Backend] 🐦 Getting BirdEye trending tokens...');
        const { limit, offset, sort_by, sort_type } = req.query;
        const tokens = await this.birdeyeService.fetchTrending({
          limit: limit ? Number(limit) : undefined,
          offset: offset ? Number(offset) : undefined,
          sort_by,
          sort_type
        });
        // Extra safety: filter suspicious/rugged tokens from BirdEye trending output
        const filtered = (tokens || []).filter(t => {
          // Try to map minimal fields into a shape consumable by isRuggedToken
          const mapped = {
            jupiterData: {
              stats24h: { priceChange: typeof t.priceChange24h === 'number' ? t.priceChange24h : undefined },
              stats6h: { priceChange: typeof t.priceChange6h === 'number' ? t.priceChange6h : undefined },
              liquidity: typeof t.liquidity === 'number' ? t.liquidity : undefined
            }
          };
          return !this.isSuspiciousToken(t) && !this.isRuggedToken(mapped);
        });
        console.log(`[🛡️ Enhanced Backend] ✅ BirdEye trending returned ${tokens.length} tokens → ${filtered.length} after filters`);
        res.json(filtered);
      } catch (error) {
        console.error('[🛡️ Enhanced Backend] ❌ BirdEye trending error:', error);
        res.status(500).json({ error: 'Failed to fetch BirdEye trending tokens' });
      }
    });

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

        // Redirect to frontend with session
        const frontendUrl = process.env.FRONTEND_URL || 'https://degen-oracle.com';
        res.redirect(`${frontendUrl}/?auth=success&sessionId=${sessionId}`);
        
      } catch (error) {
        console.error('❌ OAuth X callback error:', error);
        const frontendUrl = process.env.FRONTEND_URL || 'https://degen-oracle.com';
        res.redirect(`${frontendUrl}/?auth=error&message=${encodeURIComponent(error.message)}`);
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
            stats: user.stats
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
        const { sessionId, tokenData } = req.body;
        
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

        const watchlist = await this.oauthXService.addToWatchlist(user.id, tokenData);
        
        res.json({
          success: true,
          watchlist: watchlist,
          message: `${tokenData.symbol} added to watchlist`
        });
        
      } catch (error) {
        console.error('❌ Add to watchlist error:', error);
        res.status(500).json({ 
          success: false, 
          error: 'Failed to add to watchlist' 
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
        const { sessionId, token } = req.body; // token: { symbol, name, contractAddress }
        if (!sessionId || !token?.contractAddress) {
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

        const saved = await this.oauthXService.db.addKolCall(user.id, {
          token: {
            symbol: token.symbol,
            name: token.name,
            contractAddress: token.contractAddress
          },
          calledMc: calledMC,
          currentMC: calledMC, // Same as called MC at time of call
          calledPrice: price,
          holderCount: holderCount,
          calledAt: new Date().toISOString()
        });

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

        res.json({ success: true, call: saved });
      } catch (error) {
        console.error('[🛡️ Enhanced Backend] ❌ Add KOL call error:', error.message);
        res.status(500).json({ error: 'Failed to save KOL call' });
      }
    });

    this.app.get('/api/user/kol-calls', async (req, res) => {
      try {
        const { sessionId } = req.query;
        const user = await this.oauthXService.getUserBySession(sessionId);
        if (!user) return res.status(401).json({ error: 'Invalid session' });
        const calls = await this.oauthXService.db.getKolCalls(user.id);
        res.json({ success: true, calls: calls || [] });
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

        // Generate leaderboard using advanced scoring
        const leaderboardResult = this.leaderboardEngine.generateLeaderboard(userCalls, currentTokenData);

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
          globalStats: leaderboardResult.globalStats,
          generatedAt: leaderboardResult.generatedAt
        });
      } catch (error) {
        console.error('[🛡️ Enhanced Backend] ❌ Leaderboard error:', error.message);
        res.status(500).json({ error: 'Failed to fetch leaderboard' });
      }
    });

    // === AI ANALYSIS ENDPOINTS ===
    
    // Hype Trend Analysis endpoint
    this.app.get('/api/ai/hype-analysis/:contract', async (req, res) => {
      try {
        const { contract } = req.params;
        const { range = '7d', sessionId } = req.query;
        
        console.log(`🧠 Hype Analysis request for ${contract} (${range})`);
        
        // Get user for premium check
        let user = null;
        let isPremium = false;
        
        if (sessionId) {
          try {
            user = await this.oauthXService.getUserBySession(sessionId);
            if (user) {
              const premiumStatus = await this.oauthXService.db.getPremiumStatus(user.id);
              isPremium = premiumStatus?.isPremium &&
                (!premiumStatus.expiresAt || new Date(premiumStatus.expiresAt) > new Date());
            }
          } catch (err) {
            console.log(`🧠 Hype Analysis - Failed to get user: ${err.message}`);
          }
        }
        
        // Premium feature gate
        if (!isPremium) {
          return res.status(403).json({
            success: false,
            error: 'Premium feature required',
            message: 'Hype trend analysis is available for Premium users only'
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
        
        // Perform hype trend analysis
        const analysis = this.hypeTrendAnalysis.analyzeHypeTrend(hypeData, range);
        
        console.log(`🧠 Hype Analysis completed for ${contract}: ${analysis.success ? 'SUCCESS' : 'FAILED'}`);
        
        res.json(analysis);
        
      } catch (error) {
        console.error('❌ Hype analysis error:', error);
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
        
        // Generate AI analysis
        const analysisOptions = {
          useCache: useCache === 'true',
          cacheExpiry: isPremium ? 900000 : 1800000, // Premium: 15min, Free: 30min
          model: isPremium ? 'gpt-4' : 'gpt-3.5-turbo',
          temperature: 0.7,
          identity: { contract: identifier, symbol: token?.symbol }
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
          socialMomentum: analysis.socialMomentum,
          riskAssessment: analysis.riskAssessment,
          recommendation: analysis.recommendation,
          catalysts: typeof analysis.catalysts,
          redFlags: typeof analysis.redFlags
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

        const stableSymbols = new Set(['SOL', 'JUP', 'WETH', 'WSOL', 'WBTC', 'USDC']);
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
          await this.saveTokensToCache(tokens);
        }

        return res.json({ success: true, stats: { inserted, updated, boosted, skipped, total: candidates.length } });
      } catch (error) {
        console.error('[🛡️ Enhanced Backend] ❌ Internal discovery import error:', error.message);
        res.status(500).json({ success: false, error: 'Failed to import discovery tokens' });
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

    // Force refresh all tokens
    this.app.post('/api/tokens/refresh-all', async (req, res) => {
      try {
        console.log('[🛡️ Enhanced Backend] 🔄 Force refresh all tokens requested');
        
        // Clear cache and restart processing
        await this.clearCache();
        await this.tokenProcessor.startProcessing();
        
        res.json({ success: true, message: 'Full refresh started' });
        
      } catch (error) {
        console.error('[🛡️ Enhanced Backend] ❌ Error refreshing tokens:', error);
        res.status(500).json({ error: 'Failed to refresh tokens' });
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

    // Apply fuel to token
    this.app.post('/api/tokens/fuel', async (req, res) => {
      try {
        const { contractAddress, fuelType } = req.body;
        
        console.log(`[🛡️ Enhanced Backend] 🔥 Applying ${fuelType} fuel to token: ${contractAddress}`);
        
        if (!contractAddress || !fuelType) {
          return res.status(400).json({ 
            error: 'Contract address and fuel type are required' 
          });
        }

        // Validate fuel type
        const validFuelTypes = ['10x', '50x', '500x', '1000x'];
        if (!validFuelTypes.includes(fuelType)) {
          return res.status(400).json({ 
            error: 'Invalid fuel type. Must be one of: ' + validFuelTypes.join(', ') 
          });
        }

        const result = await this.applyFuelToToken(contractAddress, fuelType);
        
        if (result.success) {
          console.log(`[🛡️ Enhanced Backend] ✅ Fuel applied successfully: ${result.message}`);
          res.json({ 
            success: true, 
            message: result.message,
            token: result.token
          });
        } else {
          console.log(`[🛡️ Enhanced Backend] ❌ Failed to apply fuel: ${result.error}`);
          res.status(400).json({ 
            error: result.error 
          });
        }
        
      } catch (error) {
        console.error('[🛡️ Enhanced Backend] ❌ Error applying fuel:', error);
        res.status(500).json({ error: 'Failed to apply fuel to token' });
      }
    });

    // Remove fuel from token
    this.app.delete('/api/tokens/fuel/:contractAddress', async (req, res) => {
      try {
        const { contractAddress } = req.params;
        
        console.log(`[🛡️ Enhanced Backend] 🗑️ Removing fuel from token: ${contractAddress}`);
        
        if (!contractAddress) {
          return res.status(400).json({ 
            error: 'Contract address is required' 
          });
        }

        const result = await this.removeFuelFromToken(contractAddress);
        
        if (result.success) {
          console.log(`[🛡️ Enhanced Backend] ✅ Fuel removed successfully: ${result.message}`);
          res.json({ 
            success: true, 
            message: result.message
          });
        } else {
          console.log(`[🛡️ Enhanced Backend] ❌ Failed to remove fuel: ${result.error}`);
          res.status(400).json({ 
            error: result.error 
          });
        }
        
      } catch (error) {
        console.error('[🛡️ Enhanced Backend] ❌ Error removing fuel:', error);
        res.status(500).json({ error: 'Failed to remove fuel from token' });
      }
    });

    // ========================================
    // 🛠️ ADMIN API DASHBOARD ENDPOINTS
    // ========================================

    // Admin: Add token for FREE (bypass payment) - CONTRACT ADDRESS ONLY
    this.app.post('/api/admin/tokens/add-free', async (req, res) => {
      try {
        const { symbol, name, contractAddress, socialLinks } = req.body;

        // CONTRACT ADDRESS IS NOW REQUIRED, symbol and name are optional
        if (!contractAddress) {
          return res.status(400).json({ error: 'Contract address is required' });
        }

        console.log(`[🛡️ Admin] 🆓 Adding FREE token by CA: ${contractAddress}`);

        // Use provided symbol/name or let Jupiter API fill them in
        const tokenData = {
          symbol: symbol ? symbol.toUpperCase() : 'UNKNOWN',
          name: name || 'Unknown Token',
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
        
        // Save updated cache
        await fs.writeFile(cachePath, JSON.stringify(filteredTokens, null, 2));
        
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
        
        // Save updated cache
        await fs.writeFile(cachePath, JSON.stringify(filteredTokens, null, 2));
        
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
    this.app.get('/api/admin/tokens/search', async (req, res) => {
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
    this.app.post('/api/admin/tokens/fuel', async (req, res) => {
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
            
            // Force refresh Twitter data
            const twitterData = await socialService.forceImmediateRefresh(symbol, token.name);
            
            results.push({ 
              symbol, 
              success: true, 
              mentions: twitterData.mentions,
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
    this.app.post('/api/admin/tokens/:symbol/refresh-twitter', async (req, res) => {
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
          return res.status(404).json({ error: `Token ${symbol} not found` });
        }
        
        // Ensure social data service is initialized
        if (!this.tokenProcessor.socialDataService) {
          const { default: EnhancedSocialDataService } = await import('./enhancedSocialDataService.js');
          this.tokenProcessor.socialDataService = new EnhancedSocialDataService();
          await this.tokenProcessor.socialDataService.initialize();
        }
        
        // Get social data service
        const socialService = this.tokenProcessor.socialDataService;
        
        // Force refresh Twitter data with admin bypass
        const lookupSymbol = token.symbol || upperSym;
        const twitterData = await socialService.forceImmediateRefresh(lookupSymbol, token.name, true);
        
        // Update token with new Twitter data
        token.twitterData = twitterData;
        token.twitterTimestamp = new Date().toISOString();
        
        // Recalculate community health score with new Twitter data using ENHANCED method
        token.communityHealthScore = this.calculateCommunityHealthScore(twitterData, token.socials, token.jupiterData);
        token.communityScore = token.communityHealthScore; // Ensure both fields are set
        
        // Recalculate overall score
        token.overallScore = this.tokenProcessor.calculateEnhancedOverallScore(token);
        token.score = token.overallScore; // Ensure both fields are set
        
        // Save updated tokens back to raw cache
        const updatedTokens = rawTokens.map(t => (t.symbol && t.symbol.toUpperCase() === (token.symbol || '').toUpperCase()) ? token : t);
        await this.saveTokensToCache(updatedTokens);
        
        console.log(`[🛡️ Admin] ✅ Twitter data updated for ${symbol}: ${twitterData.mentions} mentions, Community Score: ${token.communityHealthScore.toFixed(2)}, Overall Score: ${token.overallScore.toFixed(2)}`);
        
        res.json({
          success: true,
          message: `Twitter data refreshed for ${token.symbol}`,
          token: {
            symbol: token.symbol,
            name: token.name,
            twitterData: {
              mentions: twitterData.mentions,
              mentions24h: twitterData.mentions24h,
              followers: twitterData.followers,
              engagement: twitterData.engagement,
              officialHandle: twitterData.officialHandle,
              recentMentions: twitterData.recentMentions?.length || 0
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
    this.app.get('/api/admin/twitter/status', async (req, res) => {
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
            const twitterData = await socialService.forceImmediateRefresh(item.symbol, item.name);

            // Update cache entry
          if (job.tokensArray && item.index != null && job.tokensArray[item.index]) {
            const token = job.tokensArray[item.index];
            token.twitterData = twitterData;
            token.communityHealthScore = this.calculateCommunityHealthScore(twitterData, token.socials, token.jupiterData);
            token.communityScore = token.communityHealthScore;
            token.overallScore = this.tokenProcessor.calculateEnhancedOverallScore(token);
            token.score = token.overallScore;

            // Only apply 24h cooldown if we got fresh data
            const dataFreshness = twitterData._dataFreshness || 'unknown';
            if (dataFreshness === 'fresh') {
              token.twitterTimestamp = new Date().toISOString();
              console.log(`[🛡️ Admin] ✅ Fresh data for ${item.symbol} (24h cooldown applied)`);
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
    this.app.post('/api/admin/twitter/refresh-all/start', async (req, res) => {
      try {
        const socialService = await ensureSocialService();

        // Load tokens
        const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');
        const cachePath = path.join(dataDir, 'cache', 'tokens-cache.json');
        const rawData = await fs.readFile(cachePath, 'utf8');
        const tokens = JSON.parse(rawData) || [];

        const queue = [];
        tokens.forEach((t, idx) => {
          if (t?.symbol && t?.name) queue.push({ symbol: t.symbol, name: t.name, index: idx });
        });

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
    this.app.get('/api/admin/twitter/refresh-all/status', (req, res) => {
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
    this.app.post('/api/admin/twitter/refresh-all/stop', (req, res) => {
      if (this.twitterRefreshJob) this.twitterRefreshJob.running = false;
      res.json({ success: true, message: 'Twitter refresh stopped' });
    });

    // === NEW: Twitter API Usage Management ===
    
    // Get Twitter API usage statistics
    this.app.get('/api/admin/twitter/usage', async (req, res) => {
      try {
        const socialService = this.tokenProcessor?.socialDataService;
        if (!socialService?.twitterApiManager) {
          return res.status(500).json({ error: 'Twitter API Manager not available' });
        }
        
        const stats = socialService.twitterApiManager.getUsageStats();
        
        res.json({
          success: true,
          usage: stats,
          recommendations: this.getTwitterUsageRecommendations(stats)
        });
        
      } catch (error) {
        console.error('[🛡️ Admin] ❌ Error getting Twitter usage:', error);
        res.status(500).json({ error: 'Failed to get Twitter usage stats' });
      }
    });
    
    // Emergency mode controls
    this.app.post('/api/admin/twitter/emergency-mode/:action', async (req, res) => {
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
    this.app.post('/api/admin/recalculate-all-scores', async (req, res) => {
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
    this.app.post('/api/admin/restart/backend', (req, res) => {
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
    this.app.post('/api/admin/restart/frontend', (req, res) => {
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

    this.app.post('/api/admin/jupiter/refresh-all', async (req, res) => {
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

    this.app.post('/api/admin/jupiter/refresh/:contractAddress', async (req, res) => {
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
    this.app.post('/api/admin/jupiter/clear-cache', async (req, res) => {
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
    this.app.post('/api/admin/jupiter/refresh-batch', async (req, res) => {
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
    this.app.post('/api/admin/cache/emergency-restore', async (req, res) => {
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
    this.app.get('/api/admin/backup/status', async (req, res) => {
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
    this.app.get('/api/admin/backup/snapshots', async (req, res) => {
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
    this.app.post('/api/admin/backup/create', async (req, res) => {
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
    this.app.post('/api/admin/backup/restore', async (req, res) => {
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

    // Get backup system health
    this.app.get('/api/admin/backup/health', async (req, res) => {
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
    this.app.post('/api/admin/backup/cleanup', async (req, res) => {
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
    this.app.post('/api/admin/backup/service/:action', async (req, res) => {
      try {
        const { action } = req.params; // 'start' or 'stop'
        
        if (!this.backupIntegration) {
          return res.status(503).json({
            success: false,
            error: 'Enhanced Backup System not initialized'
          });
        }

        if (action === 'start') {
          await this.backupIntegration.start();
          res.json({
            success: true,
            message: 'Enhanced Backup Service started',
            timestamp: new Date().toISOString()
          });
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
    this.app.get('/api/admin/cache/diagnostic', async (req, res) => {
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

    this.app.get('/api/admin/system/status', async (req, res) => {
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
  }

  setupBackgroundTasks() {
    // Background tasks will be started from the start() method
    // No event listeners needed here since Express doesn't emit 'ready' events

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
    }, 60 * 1000); // Check every minute, but only update what needs updating based on priority
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
      
      // Generate mock hype data based on token's current metrics
      // In a real implementation, this would fetch from a time-series database
      const now = Date.now();
      const hypeData = [];
      
      // Generate data points based on range
      const ranges = {
        '1d': { points: 24, interval: 60 * 60 * 1000 }, // hourly for 1 day
        '3d': { points: 36, interval: 2 * 60 * 60 * 1000 }, // 2-hourly for 3 days  
        '7d': { points: 42, interval: 4 * 60 * 60 * 1000 }, // 4-hourly for 7 days
        '15d': { points: 45, interval: 8 * 60 * 60 * 1000 }, // 8-hourly for 15 days
        '30d': { points: 60, interval: 12 * 60 * 60 * 1000 } // 12-hourly for 30 days
      };
      
      const config = ranges[range] || ranges['7d'];
      const baseScore = token.score || token.overallScore || 5;
      const baseMentions = token.twitterData?.mentions || token.mentions || 10;
      
      // Generate historical data with some trend and noise
      for (let i = 0; i < config.points; i++) {
        const timestamp = new Date(now - (config.points - i - 1) * config.interval);
        
        // Add trend and random variation
        const trendFactor = Math.sin((i / config.points) * Math.PI * 2) * 0.3; // Sine wave trend
        const noise = (Math.random() - 0.5) * 1.5; // Random noise
        const score = Math.max(0, Math.min(10, baseScore + trendFactor + noise));
        const mentions = Math.max(0, baseMentions + Math.floor(trendFactor * 20 + noise * 10));
        
        // Determine label based on score
        let label = 'Sleeping';
        if (score >= 8) label = 'Viral';
        else if (score >= 6) label = 'Trending';
        else if (score >= 4) label = 'Building';
        
        hypeData.push({
          timestamp: timestamp.toISOString(),
          score: Math.round(score * 10) / 10,
          mentions: mentions,
          label: label
        });
      }
      
      console.log(`🧠 Generated ${hypeData.length} hype data points for analysis`);
      return hypeData;
      
    } catch (error) {
      console.error('❌ Error getting hype data for analysis:', error);
      return [];
    }
  }

  async getTokensFromCache() {
    try {
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
        throw new Error(`Cache file not accessible: ${cachePath}`);
      }
      
      const data = await fs.readFile(cachePath, 'utf8');
      const tokens = JSON.parse(data);

      console.log(`[🛡️ Enhanced Backend] 📊 Total tokens in cache: ${tokens.length}`);
      
      // Count tokens by stage
      const stageCount = {};
      tokens.forEach(token => {
        const stage = token.stage || 'undefined';
        stageCount[stage] = (stageCount[stage] || 0) + 1;
      });
      console.log(`[🛡️ Enhanced Backend] 📊 Tokens by stage:`, stageCount);

      // Filter only completed tokens
      const completedTokens = tokens.filter(t => t.stage === 'completed');
      console.log(`[🛡️ Enhanced Backend] 📊 Completed tokens: ${completedTokens.length}`);

      // 🔧 FALLBACK: If no completed tokens, serve jupiter-stage tokens with basic data
      if (completedTokens.length === 0) {
        const jupiterTokens = tokens.filter(t => t.stage === 'jupiter' && t.contractAddress && t.symbol);
        console.log(`[🛡️ Enhanced Backend] 📊 Fallback to Jupiter tokens: ${jupiterTokens.length}`);
        
        if (jupiterTokens.length > 0) {
          // Start processing in background but serve tokens immediately
          if (!this.tokenProcessor.isProcessing) {
            console.log('[🛡️ Enhanced Backend] 🔄 Starting background processing while serving Jupiter tokens...');
            setTimeout(() => {
              console.log('[🛡️ Enhanced Backend] 🚀 Triggering token processor...');
              this.tokenProcessor.startProcessing();
            }, 1000);
          }
          
          // Return Jupiter tokens with minimal processing
          return jupiterTokens.map(token => ({
            ...token,
            // Ensure basic fields are present
            price: token.jupiterData?.price || token.price || 0,
            marketCap: token.jupiterData?.mcap || token.marketCap || 0,
            volume24h: token.jupiterData?.volume1h ? token.jupiterData.volume1h * 24 : 0,
            score: token.score || token.overallScore || 5.0,
            // Mark as fallback data
            _fallbackData: true,
            _dataSource: 'jupiter-discovery'
          }));
        }
        
        // No tokens at all - start processing
        if (!this.tokenProcessor.isProcessing) {
          console.log('[🛡️ Enhanced Backend] 🔄 No tokens found, starting fresh processing...');
          setTimeout(() => {
            console.log('[🛡️ Enhanced Backend] 🚀 Triggering token processor...');
            this.tokenProcessor.startProcessing();
          }, 1000);
        }
      }

      return completedTokens;

    } catch (error) {
      console.log('[🛡️ Enhanced Backend] ⚠️ No cache file found, starting fresh processing...');

      // Start processing if cache doesn't exist
      if (!this.tokenProcessor.isProcessing) {
        setTimeout(() => {
          this.tokenProcessor.startProcessing();
        }, 1000); // Small delay to ensure backend is fully ready
      }

      return [];
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

  async saveTokensToCache(tokens) {
    try {
      const cachePath = this.persistentCachePath;
      
      // Ensure cache directory exists
      const cacheDir = path.dirname(cachePath);
      await fs.mkdir(cacheDir, { recursive: true });
      
      // Save tokens to cache file
      await fs.writeFile(cachePath, JSON.stringify(tokens, null, 2), 'utf8');
      console.log(`[🛡️ Enhanced Backend] ✅ Saved ${tokens.length} tokens to cache`);
      
    } catch (error) {
      console.error('[🛡️ Enhanced Backend] ❌ Error saving tokens to cache:', error);
      throw error;
    }
  }

  async mergeTwitterData(tokens) {
    try {
      const twitterCachePath = path.join(__dirname, 'cache', 'twitter_metrics.json');
      const twitterData = await fs.readFile(twitterCachePath, 'utf8');
      const twitterMetrics = JSON.parse(twitterData);

      console.log(`[🛡️ Enhanced Backend] 🐦 Merging Twitter data for ${tokens.length} tokens...`);

      // Merge Twitter data with tokens
      const tokensWithTwitter = tokens.map(token => {
        const twitterKey = `${token.symbol}_${token.name}`;
        const twitterInfo = twitterMetrics[twitterKey];

        if (twitterInfo && twitterInfo.data) {
          // Calculate community health score from Twitter metrics and social links
          const communityHealthScore = this.calculateCommunityHealthScore(twitterInfo.data, token.socials, token.jupiterData);

          return {
            ...token,
            twitterData: twitterInfo.data,
            mentions: twitterInfo.data.mentions || 0,
            mentions24h: twitterInfo.data.mentions24h || 0,
            communityScore: communityHealthScore,
            communityHealthScore: communityHealthScore,
            tweets: twitterInfo.data.recentMentions || [],
            lastTwitterUpdate: twitterInfo.timestamp || new Date().toISOString()
          };
        }

        // Return token without Twitter data if not found
        return {
          ...token,
          mentions: 0,
          mentions24h: 0,
          communityScore: 0,
          communityHealthScore: 0,
          tweets: []
        };
      });

      const tokensWithTwitterCount = tokensWithTwitter.filter(t => t.twitterData).length;
      console.log(`[🛡️ Enhanced Backend] ✅ Twitter data merged: ${tokensWithTwitterCount}/${tokens.length} tokens have Twitter data`);

      return tokensWithTwitter;

    } catch (error) {
      console.log('[🛡️ Enhanced Backend] ⚠️ No Twitter cache found, returning tokens without Twitter data');
      // Return tokens with empty Twitter data if cache doesn't exist
      return tokens.map(token => ({
        ...token,
        mentions: 0,
        mentions24h: 0,
        communityScore: 0,
        communityHealthScore: 0,
        tweets: []
      }));
    }
  }

  calculateCommunityHealthScore(twitterData, socialLinks = null, jupiterData = null) {
    if (!twitterData) return 0;

    let score = 2.0; // Lowered base score - tokens must earn their community score
    const maxScore = 10;

    // FINAL WEIGHTS: Mentions 55%, Engagement 35%, Followers 5%, Quality 5%
    // (Removed redundant Recent Activity scoring - prioritizes mention volume and engagement quality)

    // 1. Mentions score (55% weight) - PRIMARY importance for community buzz
    const mentions = twitterData.mentions || 0;
    if (mentions > 100) score += 2.75;
    else if (mentions > 50) score += 2.2;
    else if (mentions > 20) score += 1.65;
    else if (mentions > 10) score += 1.1;
    else if (mentions > 5) score += 0.55;

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
        console.log('[🛡️ Enhanced Backend] 🔄 Starting cache refresh...');
        await this.tokenProcessor.startProcessing();
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
      
      // Save updated cache
      if (updated > 0) {
        const cachePath = path.join(__dirname, 'cache', 'tokens-cache.json');
        await fs.writeFile(cachePath, JSON.stringify(tokens, null, 2));
        console.log(`[🛡️ Enhanced Backend] ✅ Jupiter update complete: ${updated} tokens updated, ${errors} errors`);
        
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
      
      console.log(`[🛡️ Enhanced Backend] 🔄 Priority update: ${tokensToUpdate.length} tokens selected`);
      
      // Log priority breakdown
      const priorityBreakdown = tokensToUpdate.reduce((acc, token) => {
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
      for (let i = 0; i < tokensToUpdate.length; i += batchSize) {
        const batch = tokensToUpdate.slice(i, i + batchSize);
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
            
            // Update tokens with their corresponding Jupiter data
            const updatedTokensInBatch = [];
            batch.forEach(token => {
              const tokenIndex = tokens.findIndex(t => t.contractAddress === token.contractAddress);
              if (tokenIndex !== -1 && jupiterMap.has(token.contractAddress)) {
                const freshData = jupiterMap.get(token.contractAddress);
                tokens[tokenIndex].jupiterData = freshData;
                tokens[tokenIndex].jupiterTimestamp = new Date().toISOString();
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
                
                console.log(`[🛡️ Enhanced Backend] ✅ ${token.priority}: ${token.symbol} (${token.contractAddress.substring(0, 8)})`);
              } else if (tokenIndex !== -1) {
                console.log(`[🛡️ Enhanced Backend] ⚠️ No Jupiter data for ${token.symbol} (${token.contractAddress.substring(0, 8)})`);
                errors++;
              }
            });
            
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
      
      // Save updated cache
      if (updated > 0) {
        await this.saveTokensToCache(tokens);
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
      const cachePath = path.join(__dirname, 'cache', 'tokens-cache.json');
      await fs.writeFile(cachePath, JSON.stringify([], null, 2));
      console.log('[🛡️ Enhanced Backend] 🗑️ Cache cleared');
      
      // Reset processor state
      this.tokenProcessor.processedTokens = [];
      this.tokenProcessor.processingQueue = [];
      
    } catch (error) {
      console.error('[🛡️ Enhanced Backend] ❌ Failed to clear cache:', error);
    }
  }

  // ========================================
  // 🔥 FUEL TOKEN HELPER METHODS
  // ========================================

  async getFueledTokens() {
    try {
      const fueledTokensPath = path.join(__dirname, 'cache', 'fueled-tokens.json');
      
      // Check if file exists
      try {
        await fs.access(fueledTokensPath);
      } catch {
        // File doesn't exist, return empty array
        return [];
      }

      const data = await fs.readFile(fueledTokensPath, 'utf8');
      const fueledTokens = JSON.parse(data);

      // Filter out expired tokens and handle stacked fuel applications
      const now = Date.now();
      const activeFueledTokens = [];
      const expiredTokens = []; // Track tokens that need recalculation
      let hasChanges = false;

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
        '50x': { boost: 0.04, duration: 12 * 60 * 60 * 1000 }, // 1.04x multiplier (4% boost)
        '500x': { boost: 0.06, duration: 12 * 60 * 60 * 1000 }, // 1.06x multiplier (6% boost)
        '1000x': { boost: 0.08, duration: 12 * 60 * 60 * 1000 } // 1.08x multiplier (8% boost)
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
      const fueledTokensPath = path.join(__dirname, 'cache', 'fueled-tokens.json');
      
      // Ensure cache directory exists
      const cacheDir = path.dirname(fueledTokensPath);
      try {
        await fs.access(cacheDir);
      } catch {
        await fs.mkdir(cacheDir, { recursive: true });
      }

      await fs.writeFile(fueledTokensPath, JSON.stringify(fueledTokens, null, 2));

      console.log(`[🛡️ Enhanced Backend] 🔥 Fuel ${fuelType} applied to ${existingToken.symbol} (${contractAddress})`);

      // Immediately recalculate token with fresh Jupiter data (but keep existing Twitter data)
      console.log(`[🛡️ Enhanced Backend] 🔄 Triggering immediate recalculation for fueled token ${existingToken.symbol}...`);
      
      try {
        // Refresh Jupiter data for this specific token
        const freshJupiterData = await this.tokenProcessor.jupiterService.getTokenDetails(contractAddress);
        
        if (freshJupiterData) {
          // Update the token with fresh Jupiter data
          existingToken.jupiterData = freshJupiterData;
          existingToken.jupiterTimestamp = new Date().toISOString();
          
          // Recalculate overall score using existing Twitter data (respecting 24hr rule)
          const newOverallScore = await this.tokenProcessor.calculateEnhancedOverallScore(existingToken);
          
          // Update the token's score
          existingToken.overallScore = newOverallScore;
          existingToken.score = newOverallScore; // Keep both for compatibility
          existingToken.lastCalculated = new Date().toISOString();
          
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
      
      return {
        success: true,
        message: `Fuel ${fuelType} applied successfully to ${existingToken.symbol}! Total fuel: ${currentFuelDisplay}. Boost will last 12 hours.`,
        token: updatedFueledToken
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
      const fueledTokensPath = path.join(__dirname, 'cache', 'fueled-tokens.json');
      
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
            existingToken.jupiterData = freshJupiterData;
            existingToken.jupiterTimestamp = new Date().toISOString();
          }
          
          // Recalculate overall score without fuel boost
          const newOverallScore = await this.tokenProcessor.calculateEnhancedOverallScore(existingToken);
          
          existingToken.overallScore = newOverallScore;
          existingToken.score = newOverallScore;
          existingToken.lastCalculated = new Date().toISOString();
          
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
              existingToken.jupiterData = freshJupiterData;
              existingToken.jupiterTimestamp = new Date().toISOString();
            }
            
            // Recalculate overall score without fuel boost
            const newOverallScore = await this.tokenProcessor.calculateEnhancedOverallScore(existingToken);
            
            existingToken.overallScore = newOverallScore;
            existingToken.score = newOverallScore;
            existingToken.lastCalculated = new Date().toISOString();
            
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

  async start() {
    try {
      await this.tokenProcessor.initialize();

      // Initialize Enhanced Backup System
      console.log('🔄 Initializing Enhanced Backup System...');
      try {
        this.backupIntegration = await createBackupIntegration(this.oauthXService?.db);
        await this.backupIntegration.start();
        console.log('✅ Enhanced Backup System started successfully');
        console.log('📸 Automatic snapshots: 5 per day (every 4.8 hours)');
        console.log('🕐 Retention: 48 hours (10 snapshots max)');
      } catch (error) {
        console.error('❌ Enhanced Backup System failed to start:', error.message);
        console.warn('⚠️ Continuing without enhanced backups...');
      }

      this.app.listen(this.port, () => {
        const isProduction = process.env.NODE_ENV === 'production';
        const baseUrl = isProduction ? 'https://api.degen-oracle.com' : `http://localhost:${this.port}`;

        console.log(`🚀 Enhanced Backend running on ${baseUrl}`);
        console.log(`📊 Health check: ${baseUrl}/health`);
        console.log(`🔍 API Status: ${baseUrl}/api/status`);
        console.log(`🔗 API Tokens: ${baseUrl}/api/tokens`);
        console.log(`📱 Admin Dashboard: ${baseUrl}/admin-dashboard.html`);

        this.isRunning = true;

        // Start token processing workflow after backend is ready
        setTimeout(async () => {
          try {
            console.log('[🛡️ Enhanced Backend] 🚀 Backend ready, starting token processing...');
            
            // Check if we need to start processing
            const status = this.tokenProcessor.getProcessingStatus();
            if (status.processedCount === 0) {
              console.log('[🛡️ Enhanced Backend] 🆕 No tokens found, starting initial processing...');
              await this.tokenProcessor.startProcessing();
            } else {
              console.log(`[🛡️ Enhanced Backend] 📊 Found ${status.processedCount} existing tokens`);
              console.log('[🛡️ Enhanced Backend] 🔄 Starting processing to fetch NEW coins with proper rate limiting...');
              await this.tokenProcessor.startProcessing();
            }
          } catch (error) {
            console.error('[🛡️ Enhanced Backend] ❌ Error starting token processing:', error);
          }
        }, 2000); // Wait 2 seconds for everything to be ready
      });
      
    } catch (error) {
      console.error('❌ Failed to start Enhanced Backend:', error);
      process.exit(1);
    }
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

