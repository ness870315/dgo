import express from 'express';
import cors from 'cors';
import axios from 'axios';
import EnhancedTokenProcessor from './enhancedTokenProcessor.js';
import HelioPaymentService from './helioPaymentService.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class EnhancedBackend {
  constructor() {
    this.app = express();
    this.port = process.env.PORT || 4000;
    this.tokenProcessor = new EnhancedTokenProcessor();
    this.helioService = new HelioPaymentService();
    this.isRunning = false;
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupBackgroundTasks();
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
    this.app.get('/api/status', (req, res) => {
      const status = this.tokenProcessor.getProcessingStatus();
      res.json({
        success: true,
        backend: 'Enhanced Backend v3.0',
        timestamp: new Date().toISOString(),
        processing: status,
        cache: {
          totalTokens: status.processedCount,
          queueLength: status.queueLength
        }
      });
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

        console.log(`[🛡️ Enhanced Backend] ✅ Returning ${tokens.length} tokens`);
        res.json(tokens);

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
        const cachePath = path.join(__dirname, 'cache', 'tokens-cache.json');
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

    // Admin: Search tokens in database
    this.app.get('/api/admin/tokens/search', async (req, res) => {
      try {
        const { q, limit = 50 } = req.query;
        
        console.log(`[🛡️ Admin] 🔍 Searching tokens: "${q}"`);
        
        const tokens = await this.getTokensFromCache();
        
        let results = tokens;
        
        if (q) {
          const query = q.toLowerCase();
          results = tokens.filter(token => 
            token.symbol.toLowerCase().includes(query) ||
            token.name.toLowerCase().includes(query) ||
            (token.contractAddress && token.contractAddress.toLowerCase().includes(query))
          );
        }
        
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
        const { symbol } = req.params;
        
        console.log(`[🛡️ Admin] 🐦 Manual Twitter refresh for: ${symbol}`);
        
        // Load raw tokens from cache (not the filtered/merged ones)
        const cachePath = path.join(__dirname, 'cache', 'tokens-cache.json');
        let rawTokens = [];
        try {
          const data = await fs.readFile(cachePath, 'utf8');
          rawTokens = JSON.parse(data);
        } catch (error) {
          return res.status(404).json({ error: 'Token cache not found' });
        }
        
        // Find token in raw cache
        const token = rawTokens.find(t => t.symbol === symbol.toUpperCase());
        
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
        
        // Force refresh Twitter data
        const twitterData = await socialService.forceImmediateRefresh(symbol, token.name);
        
        // Update token with new Twitter data
        token.twitterData = twitterData;
        token.twitterTimestamp = new Date().toISOString();
        
        // Recalculate community health score with new Twitter data using ENHANCED method
        token.communityHealthScore = socialService.calculateCommunityHealthScore(twitterData);
        token.communityScore = token.communityHealthScore; // Ensure both fields are set
        
        // Recalculate overall score
        token.overallScore = this.tokenProcessor.calculateEnhancedOverallScore(token);
        token.score = token.overallScore; // Ensure both fields are set
        
        // Save updated tokens back to raw cache
        const updatedTokens = rawTokens.map(t => t.symbol === symbol.toUpperCase() ? token : t);
        await this.saveTokensToCache(updatedTokens);
        
        console.log(`[🛡️ Admin] ✅ Twitter data updated for ${symbol}: ${twitterData.mentions} mentions, Community Score: ${token.communityHealthScore.toFixed(2)}, Overall Score: ${token.overallScore.toFixed(2)}`);
        
        res.json({
          success: true,
          message: `Twitter data refreshed for ${symbol}`,
          token: {
            symbol: symbol.toUpperCase(),
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

    // Periodic Jupiter data update (every 5 minutes)
    setInterval(async () => {
      try {
        console.log('[🛡️ Enhanced Backend] 🚀 Periodic Jupiter data update...');
        await this.updateJupiterData();
      } catch (error) {
        console.error('[🛡️ Enhanced Backend] ❌ Jupiter update failed:', error);
      }
    }, 5 * 60 * 1000);
  }

  async getTokensFromCache() {
    try {
      const cachePath = path.join(__dirname, 'cache', 'tokens-cache.json');
      const data = await fs.readFile(cachePath, 'utf8');
      const tokens = JSON.parse(data);

      // Filter only completed tokens
      const completedTokens = tokens.filter(t => t.stage === 'completed');

      // 🔧 FIX: Don't merge Twitter data on every API call - it should only happen during proper workflow
      // Twitter data should already be merged during the processing pipeline
      
      // Check if we need to start processing (only if no tokens exist)
      if (completedTokens.length === 0 && !this.tokenProcessor.isProcessing) {
        console.log('[🛡️ Enhanced Backend] 🔄 No completed tokens found, starting processing...');
        setTimeout(() => {
          this.tokenProcessor.startProcessing();
        }, 1000);
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

  async saveTokensToCache(tokens) {
    try {
      const cachePath = path.join(__dirname, 'cache', 'tokens-cache.json');
      
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
          const communityHealthScore = this.calculateCommunityHealthScore(twitterInfo.data, token.socials);

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

  calculateCommunityHealthScore(twitterData, socialLinks = null) {
    if (!twitterData) return 0;

    let score = 5.0; // Base score to match Enhanced Social Data Service
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

    // 6. Social links bonus (BONUS points) - NEW!
    if (socialLinks) {
      const socialCount = Object.values(socialLinks).filter(link => link && link !== 'not_found').length;
      if (socialCount >= 5) score += 1.0;      // All socials = +1.0 bonus
      else if (socialCount >= 3) score += 0.75; // Most socials = +0.75 bonus  
      else if (socialCount >= 2) score += 0.5; // Some socials = +0.5 bonus
    }

    return Math.min(score, maxScore);
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
      
      // Filter tokens that need Jupiter data refresh (older than 1 hour)
      const now = new Date();
      const tokensToUpdate = tokens.filter(token => {
        if (!token.jupiterData || !token.contractAddress) return false;
        
        if (!token.jupiterTimestamp) return true; // No timestamp = needs update
        
        const timestamp = new Date(token.jupiterTimestamp);
        const ageHours = (now - timestamp) / (1000 * 60 * 60);
        return ageHours > 1; // Update if older than 1 hour
      });
      
      if (tokensToUpdate.length === 0) {
        console.log('[🛡️ Enhanced Backend] ✅ All Jupiter data is current (< 1 hour old)');
        return;
      }
      
      console.log(`[🛡️ Enhanced Backend] 🔄 Updating Jupiter data for ${tokensToUpdate.length} tokens...`);
      
      // Sort by market cap and update top 20 tokens per cycle
      const topTokens = tokensToUpdate
        .sort((a, b) => (b.jupiterData?.mcap || 0) - (a.jupiterData?.mcap || 0))
        .slice(0, 20);
      
      let updated = 0;
      let errors = 0;
      
      for (const token of topTokens) {
        try {
          const response = await axios.get(`https://lite-api.jup.ag/tokens/v2/search?query=${token.contractAddress}`, {
            timeout: 8000,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Accept': 'application/json'
            }
          });
          
          if (response.data && response.data.length > 0) {
            const freshData = response.data[0];
            
            // Update token in cache
            const tokenIndex = tokens.findIndex(t => t.contractAddress === token.contractAddress);
            if (tokenIndex !== -1) {
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
            }
          } else {
            errors++;
          }
          
          // Rate limiting
          await new Promise(resolve => setTimeout(resolve, 1000));
          
        } catch (error) {
          console.log(`[🛡️ Enhanced Backend] ❌ Failed to update ${token.symbol}: ${error.message}`);
          errors++;
        }
      }
      
      // Save updated cache
      if (updated > 0) {
        const cachePath = path.join(__dirname, 'cache', 'tokens-cache.json');
        await fs.writeFile(cachePath, JSON.stringify(tokens, null, 2));
        console.log(`[🛡️ Enhanced Backend] ✅ Jupiter update complete: ${updated} tokens updated, ${errors} errors`);
      } else {
        console.log(`[🛡️ Enhanced Backend] ⚠️ No tokens updated: ${errors} errors`);
      }
      
    } catch (error) {
      console.error('[🛡️ Enhanced Backend] ❌ Jupiter update failed:', error);
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
        const freshJupiterData = await this.tokenProcessor.jupiterService.getTokenData(contractAddress);
        
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
          const freshJupiterData = await this.tokenProcessor.jupiterService.getTokenData(contractAddress);
          
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
            const freshJupiterData = await this.tokenProcessor.jupiterService.getTokenData(expiredToken.contractAddress);
            
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

