import express from 'express';
import cors from 'cors';
import EnhancedTokenProcessor from './enhancedTokenProcessor.js';
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
    this.isRunning = false;
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupBackgroundTasks();
  }

  setupMiddleware() {
    this.app.use(cors());
    this.app.use(express.json());
    this.app.use(express.static('public'));
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
    // 🛠️ ADMIN API DASHBOARD ENDPOINTS
    // ========================================

    // Admin: Add token for FREE (bypass payment)
    this.app.post('/api/admin/tokens/add-free', async (req, res) => {
      try {
        const { symbol, name, contractAddress, socialLinks } = req.body;
        
        if (!symbol || !name) {
          return res.status(400).json({ error: 'Symbol and name are required' });
        }
        
        console.log(`[🛡️ Admin] 🆓 Adding FREE token: ${symbol} (${name})`);
        
        // Process admin token IMMEDIATELY (same as paid)
        const processedToken = await this.tokenProcessor.addPaidToken({
          symbol: symbol.toUpperCase(),
          name,
          contractAddress: contractAddress || null,
          isPaid: false,
          isAdmin: true
        });
        
        // Add social links if provided
        if (socialLinks && Object.keys(socialLinks).length > 0) {
          const updateService = (await import('./updateTokenService.js')).default;
          await updateService.updateTokenSocials(symbol, socialLinks, 'admin_free_add', {
            type: 'free_admin_add',
            amount: 0,
            currency: 'FREE'
          });
          console.log(`[🛡️ Admin] 📱 Added social links for ${symbol}`);
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
            const twitterData = await socialService.forceRefreshToken(symbol, token.name);
            
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
        
        // Find token data
        const tokens = await this.getTokensFromCache();
        const token = tokens.find(t => t.symbol === symbol.toUpperCase());
        
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
        const twitterData = await socialService.forceRefreshToken(symbol, token.name);
        
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
            }
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
    // Start token processing when backend starts
    this.app.on('ready', async () => {
      console.log('[🛡️ Enhanced Backend] 🚀 Backend ready, starting token processing...');
      await this.tokenProcessor.initialize();
      
      // Check if we need to start processing
      const status = this.tokenProcessor.getProcessingStatus();
      if (status.processedCount === 0) {
        console.log('[🛡️ Enhanced Backend] 🆕 No tokens found, starting initial processing...');
        await this.tokenProcessor.startProcessing();
      } else {
        console.log(`[🛡️ Enhanced Backend] 📊 Found ${status.processedCount} existing tokens`);
      }
    });

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

      // Load Twitter data and merge it with tokens
      const tokensWithTwitter = await this.mergeTwitterData(completedTokens);

      // Check if tokens are missing Jupiter data
      const tokensWithoutJupiter = tokensWithTwitter.filter(t => !t.jupiterData);

      // If tokens exist but many don't have Jupiter data, trigger processing
      if (tokensWithTwitter.length > 0 && tokensWithoutJupiter.length > 50 && !this.tokenProcessor.isProcessing) {
        console.log(`[🛡️ Enhanced Backend] 🔄 Found ${tokensWithoutJupiter.length} tokens without Jupiter data, starting processing...`);
        setTimeout(() => {
          this.tokenProcessor.startProcessing();
        }, 1000); // Small delay to ensure backend is fully ready
      }

      // If no completed tokens found, trigger processing
      if (tokensWithTwitter.length === 0 && !this.tokenProcessor.isProcessing) {
        console.log('[🛡️ Enhanced Backend] 🔄 No completed tokens found, starting processing...');
        setTimeout(() => {
          this.tokenProcessor.startProcessing();
        }, 1000); // Small delay to ensure backend is fully ready
      }

      return tokensWithTwitter;

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

    // NEW WEIGHTS: Mentions 5%, Engagement 30%, Followers 5%, Recent Activity 50%, Quality 10%

    // 1. Mentions score (5% weight) - Reduced importance
    const mentions = twitterData.mentions || 0;
    if (mentions > 100) score += 0.5;
    else if (mentions > 50) score += 0.4;
    else if (mentions > 20) score += 0.3;
    else if (mentions > 10) score += 0.2;
    else if (mentions > 5) score += 0.1;

    // 2. Engagement score (30% weight) - Increased importance
    const totalEngagement = (twitterData.likes || 0) + (twitterData.retweets || 0) + (twitterData.replies || 0);
    const engagementRate = mentions > 0 ? totalEngagement / mentions : 0;
    if (engagementRate > 10) score += 3.0;
    else if (engagementRate > 5) score += 2.4;
    else if (engagementRate > 2) score += 1.8;
    else if (engagementRate > 1) score += 1.2;
    else if (engagementRate > 0.5) score += 0.6;

    // 3. Follower score (5% weight) - Reduced importance
    const followers = twitterData.followers || 0;
    if (followers > 10000) score += 0.5;
    else if (followers > 5000) score += 0.375;
    else if (followers > 1000) score += 0.25;
    else if (followers > 500) score += 0.125;

    // 4. Recent activity score (50% weight) - MAJOR increase in importance
    const recentMentions = twitterData.recentMentions?.length || 0;
    if (recentMentions > 20) score += 5.0;
    else if (recentMentions > 10) score += 3.75;
    else if (recentMentions > 5) score += 2.5;
    else if (recentMentions > 2) score += 1.25;

    // 5. Quality indicators (10% weight) - Same as before
    const hasOfficialAccount = twitterData.username ? 1.0 : 0;
    const hasRecentActivity = mentions > 0 ? 1.0 : 0;
    score += (hasOfficialAccount + hasRecentActivity) * 0.5;

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
      // This would update Jupiter data for existing tokens
      // For now, just log the action
      console.log('[🛡️ Enhanced Backend] 🚀 Jupiter data update cycle');
      
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

  async start() {
    try {
      await this.tokenProcessor.initialize();

      this.app.listen(this.port, () => {
        console.log(`🚀 Enhanced Backend running on http://localhost:${this.port}`);
        this.isRunning = true;

        // Check if we need to start processing
        setTimeout(async () => {
          try {
            const tokens = await this.getTokensFromCache();
            if (tokens.length === 0) {
              console.log('[🛡️ Enhanced Backend] 🚀 No tokens in cache, starting fresh processing...');
            }
          } catch (error) {
            console.log('[🛡️ Enhanced Backend] 🚀 Cache not found, starting fresh processing...');
          }
        }, 2000); // Wait 2 seconds for everything to be ready

        // Emit ready event
        this.app.emit('ready');
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

