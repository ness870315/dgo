import express from 'express';
import cors from 'cors';
import BondingTokensService from './BondingTokensService.js';

/**
 * BondingTokensAPI - API wrapper for BondingTokensService
 * 
 * Provides REST API endpoints for:
 * - Getting bonding tokens
 * - Monitoring graduation status
 * - Tracking pre-bonding tokens
 * - Getting graduation alerts
 */
class BondingTokensAPI {
    constructor() {
        this.app = express();
        this.port = process.env.PORT || 3004;
        this.bondingTokensService = null;
        
        this.setupMiddleware();
        this.initializeService();
        this.setupRoutes();
    }

    /**
     * Setup middleware
     */
    setupMiddleware() {
        this.app.use(cors());
        this.app.use(express.json());
        
        // Request logging
        this.app.use((req, res, next) => {
            console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
            next();
        });
    }

    /**
     * Initialize BondingTokensService
     */
    initializeService() {
        try {
            const moralisApiKey = process.env.MORALIS_API_KEY;
            
            if (!moralisApiKey) {
                console.error('❌ MORALIS_API_KEY not configured');
                return;
            }
            
            this.bondingTokensService = new BondingTokensService(moralisApiKey);
            console.log('✅ BondingTokensService initialized');
            
            // Start continuous monitoring
            this.startMonitoring();
            
        } catch (error) {
            console.error('❌ Failed to initialize BondingTokensService:', error.message);
        }
    }

    /**
     * Initialize method for consistency with other APIs
     */
    async initialize() {
        console.log('🚀 [BondingTokensAPI] Initializing...');
        // Service is already initialized in constructor
        console.log('✅ [BondingTokensAPI] Initialization complete');
    }

    /**
     * Start continuous monitoring
     */
    async startMonitoring() {
        if (!this.bondingTokensService) return;
        
        try {
            console.log('🔄 Starting continuous monitoring...');
            this.monitoring = await this.bondingTokensService.startContinuousMonitoring();
            console.log('✅ Continuous monitoring started');
        } catch (error) {
            console.error('❌ Failed to start monitoring:', error.message);
        }
    }

    /**
     * Setup API routes
     */
    setupRoutes() {
        // Health check
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'healthy',
                service: 'bonding-tokens',
                timestamp: new Date().toISOString(),
                monitoring: this.monitoring ? 'active' : 'inactive'
            });
        });

        // Get bonding tokens
        this.app.get('/api/bonding-tokens', async (req, res) => {
            try {
                const { limit = 50, forceRefresh = false } = req.query;
                
                if (!this.bondingTokensService) {
                    return res.status(503).json({
                        success: false,
                        error: 'BondingTokensService not initialized'
                    });
                }

                const result = await this.bondingTokensService.getBondingTokens(
                    parseInt(limit), 
                    forceRefresh === 'true'
                );

                res.json(result);

            } catch (error) {
                console.error('❌ Failed to get bonding tokens:', error.message);
                res.status(500).json({
                    success: false,
                    error: 'Failed to get bonding tokens'
                });
            }
        });

        // Get bonding status for specific token
        this.app.get('/api/bonding-tokens/:tokenAddress/status', async (req, res) => {
            try {
                const { tokenAddress } = req.params;
                
                if (!this.bondingTokensService) {
                    return res.status(503).json({
                        success: false,
                        error: 'BondingTokensService not initialized'
                    });
                }

                const result = await this.bondingTokensService.getBondingStatus(tokenAddress);
                res.json(result);

            } catch (error) {
                console.error('❌ Failed to get bonding status:', error.message);
                res.status(500).json({
                    success: false,
                    error: 'Failed to get bonding status'
                });
            }
        });

        // Get graduation alerts
        this.app.get('/api/bonding-tokens/alerts', async (req, res) => {
            try {
                const { threshold = 95 } = req.query;
                
                if (!this.bondingTokensService) {
                    return res.status(503).json({
                        success: false,
                        error: 'BondingTokensService not initialized'
                    });
                }

                const result = await this.bondingTokensService.getEnhancedGraduationAlerts(
                    parseInt(threshold)
                );

                res.json(result);

            } catch (error) {
                console.error('❌ Failed to get graduation alerts:', error.message);
                res.status(500).json({
                    success: false,
                    error: 'Failed to get graduation alerts'
                });
            }
        });

        // Get tokens by proximity level
        this.app.get('/api/bonding-tokens/by-proximity', async (req, res) => {
            try {
                const { proximityLevel } = req.query;
                
                if (!this.bondingTokensService) {
                    return res.status(503).json({
                        success: false,
                        error: 'BondingTokensService not initialized'
                    });
                }

                const result = await this.bondingTokensService.getTokensByProximityLevel(proximityLevel);
                res.json(result);

            } catch (error) {
                console.error('❌ Failed to get tokens by proximity:', error.message);
                res.status(500).json({
                    success: false,
                    error: 'Failed to get tokens by proximity'
                });
            }
        });

        // Get tracking statistics
        this.app.get('/api/bonding-tokens/stats', async (req, res) => {
            try {
                if (!this.bondingTokensService) {
                    return res.status(503).json({
                        success: false,
                        error: 'BondingTokensService not initialized'
                    });
                }

                const result = await this.bondingTokensService.getTrackingStats();
                res.json(result);

            } catch (error) {
                console.error('❌ Failed to get tracking stats:', error.message);
                res.status(500).json({
                    success: false,
                    error: 'Failed to get tracking stats'
                });
            }
        });

        // Track pre-bonding tokens
        this.app.post('/api/bonding-tokens/track', async (req, res) => {
            try {
                if (!this.bondingTokensService) {
                    return res.status(503).json({
                        success: false,
                        error: 'BondingTokensService not initialized'
                    });
                }

                const result = await this.bondingTokensService.trackPreBondingTokens();
                res.json(result);

            } catch (error) {
                console.error('❌ Failed to track pre-bonding tokens:', error.message);
                res.status(500).json({
                    success: false,
                    error: 'Failed to track pre-bonding tokens'
                });
            }
        });

        // Clear cache
        this.app.post('/api/bonding-tokens/clear-cache', async (req, res) => {
            try {
                if (!this.bondingTokensService) {
                    return res.status(503).json({
                        success: false,
                        error: 'BondingTokensService not initialized'
                    });
                }

                await this.bondingTokensService.clearCache();
                res.json({
                    success: true,
                    message: 'Cache cleared successfully'
                });

            } catch (error) {
                console.error('❌ Failed to clear cache:', error.message);
                res.status(500).json({
                    success: false,
                    error: 'Failed to clear cache'
                });
            }
        });

        // Error handling
        this.app.use((err, req, res, next) => {
            console.error('❌ API Error:', err.message);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        });
    }

    /**
     * Get Express router for integration with main service
     */
    getRouter() {
        return this.app;
    }

    /**
     * Start the API server
     */
    start() {
        this.app.listen(this.port, () => {
            console.log(`🚀 BondingTokensAPI running on port ${this.port}`);
            console.log(`📊 Health check: http://localhost:${this.port}/health`);
            console.log(`🔗 API docs: http://localhost:${this.port}/api/bonding-tokens`);
        });
    }

    /**
     * Stop the API server
     */
    stop() {
        if (this.monitoring) {
            this.monitoring.stop();
        }
        console.log('🛑 BondingTokensAPI stopped');
    }
}

export default BondingTokensAPI;
