const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;

// Import services
const EnhancedHybridPriceService = require('./services/EnhancedHybridPriceService.js');

class EnhancedBackend {
    constructor() {
        this.app = express();
        this.port = process.env.PORT || 3000;
        this.priceService = null;
        this.realTimeTokenMonitor = null;
        this.tokenCacheWatcher = null;
        
        this.setupMiddleware();
        this.setupRoutes();
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
                mode: 'commonjs'
            });
        });

        // API status
        this.app.get('/api/status', (req, res) => {
            res.json({
                status: 'running',
                mode: 'commonjs',
                services: {
                    priceService: this.priceService ? this.priceService.getStatus() : 'not initialized',
                    realTimeMonitor: this.realTimeTokenMonitor ? 'running' : 'not initialized',
                    tokenCacheWatcher: this.tokenCacheWatcher ? 'running' : 'not initialized'
                }
            });
        });

        // gRPC status (simplified)
        this.app.get('/api/grpc/status', (req, res) => {
            res.json({
                status: 'disabled',
                mode: 'commonjs',
                message: 'gRPC services disabled in CommonJS mode'
            });
        });

        // Token price endpoint
        this.app.get('/api/token/:address/price', async (req, res) => {
            try {
                const { address } = req.params;
                if (!this.priceService) {
                    return res.status(503).json({ error: 'Price service not initialized' });
                }

                const price = await this.priceService.getTokenPrice(address);
                if (price === null) {
                    return res.status(404).json({ error: 'Price not found' });
                }

                res.json({ address, price, timestamp: new Date().toISOString() });
            } catch (error) {
                console.error('Error fetching token price:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });

        // SOL price endpoint
        this.app.get('/api/sol/price', async (req, res) => {
            try {
                if (!this.priceService) {
                    return res.status(503).json({ error: 'Price service not initialized' });
                }

                const price = await this.priceService.getSolPrice();
                res.json({ price, timestamp: new Date().toISOString() });
            } catch (error) {
                console.error('Error fetching SOL price:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });

        // POST endpoint for jupiter-service to send backfilled swaps
        this.app.post('/api/swap-backfill/store', async (req, res) => {
            try {
                const { tokenAddress, swaps } = req.body;
                
                if (!tokenAddress || !Array.isArray(swaps)) {
                    return res.status(400).json({ 
                        success: false, 
                        error: 'Missing tokenAddress or swaps array' 
                    });
                }

                console.log(`📊 [Backend] Receiving ${swaps.length} backfilled swaps for ${tokenAddress.substring(0, 8)}...`);

                // Store swaps in ChartDatabase
                if (this.priceService && this.priceService.chartDatabase) {
                    await this.priceService.chartDatabase.storeSwaps(swaps);
                    console.log(`✅ [Backend] Stored ${swaps.length} swaps for ${tokenAddress.substring(0, 8)}`);
                    
                    res.json({
                        success: true,
                        message: `Stored ${swaps.length} swaps`,
                        tokenAddress
                    });
                } else {
                    res.status(503).json({ 
                        success: false, 
                        error: 'ChartDatabase not initialized' 
                    });
                }

            } catch (error) {
                console.error('Error storing backfilled swaps:', error);
                res.status(500).json({ 
                    success: false, 
                    error: 'Internal server error' 
                });
            }
        });
    }

    async initializeServices() {
        try {
            console.log('🚀 [EnhancedBackend] Initializing services...');
            
            // Initialize price service
            this.priceService = new EnhancedHybridPriceService();
            await this.priceService.initializeAsync();
            
            console.log('✅ [EnhancedBackend] Services initialized successfully');
            
        } catch (error) {
            console.error('❌ [EnhancedBackend] Failed to initialize services:', error.message);
        }
    }

    async start() {
        try {
            console.log('🚀 [EnhancedBackend] Starting server...');
            
            // Initialize services
            await this.initializeServices();
            
            // Start server
            this.app.listen(this.port, () => {
                console.log(`✅ [EnhancedBackend] Server running on port ${this.port}`);
                console.log(`🌐 [EnhancedBackend] Health check: http://localhost:${this.port}/health`);
                console.log(`📊 [EnhancedBackend] API status: http://localhost:${this.port}/api/status`);
            });
            
        } catch (error) {
            console.error('❌ [EnhancedBackend] Failed to start server:', error.message);
            process.exit(1);
        }
    }
}

// Start the server
const server = new EnhancedBackend();
server.start().catch(error => {
    console.error('❌ Critical error:', error);
    process.exit(1);
});