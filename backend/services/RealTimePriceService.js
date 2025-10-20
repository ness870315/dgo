import CoinVeraWebSocketService from './CoinVeraWebSocketService.js';
import BackendWebSocketServer from './BackendWebSocketServer.js';

class RealTimePriceService {
  constructor(server) {
    this.coinVeraService = new CoinVeraWebSocketService();
    this.backendWebSocketServer = new BackendWebSocketServer(server);
    this.isInitialized = false;
  }

  async initialize() {
    try {
      console.log('🚀 [RealTimePrice] Initializing real-time price service...');
      
      // Initialize backend WebSocket server only
      this.backendWebSocketServer.initialize();
      
      // Set up event handlers
      this.setupEventHandlers();
      
      this.isInitialized = true;
      console.log('✅ [RealTimePrice] Real-time price service initialized (CoinVera will connect on demand)');
      
    } catch (error) {
      console.error('❌ [RealTimePrice] Failed to initialize:', error.message);
      throw error;
    }
  }

  setupEventHandlers() {
    // Handle CoinVera price updates
    this.coinVeraService.on('priceUpdate', (priceData) => {
      console.log(`📈 [RealTimePrice] Broadcasting price update for ${priceData.tokenAddress}`);
      
      // Broadcast to all frontend clients subscribed to this token
      this.backendWebSocketServer.broadcastPriceUpdate(priceData.tokenAddress, {
        priceUsd: priceData.priceUsd,
        priceSol: priceData.priceSol,
        liquidity: priceData.liquidity,
        dex: priceData.dex,
        poolId: priceData.poolId,
        timestamp: priceData.timestamp
      });
    });

    // Handle frontend token subscriptions
    this.backendWebSocketServer.on('tokenSubscription', async ({ clientId, tokenAddress }) => {
      console.log(`📤 [RealTimePrice] Frontend client ${clientId} subscribed to ${tokenAddress}`);
      
      // Connect to CoinVera if not already connected
      if (!this.coinVeraService.isConnected) {
        try {
          console.log('🔌 [RealTimePrice] Connecting to CoinVera for first subscription...');
          await this.coinVeraService.connect();
          console.log('✅ [RealTimePrice] CoinVera connected successfully');
        } catch (error) {
          console.error('❌ [RealTimePrice] Failed to connect to CoinVera:', error.message);
          return;
        }
      }
      
      // Subscribe to CoinVera for this token if not already subscribed
      if (!this.coinVeraService.isTokenSubscribed(tokenAddress)) {
        this.coinVeraService.subscribeToToken(tokenAddress);
      }
    });

    // Handle frontend token unsubscriptions
    this.backendWebSocketServer.on('tokenUnsubscription', ({ clientId, tokenAddress }) => {
      console.log(`📤 [RealTimePrice] Frontend client ${clientId} unsubscribed from ${tokenAddress}`);
      
      // Check if any other frontend clients are still subscribed to this token
      const subscribers = this.backendWebSocketServer.tokenSubscriptions.get(tokenAddress);
      if (!subscribers || subscribers.size === 0) {
        // No more frontend clients subscribed, unsubscribe from CoinVera
        this.coinVeraService.unsubscribeFromToken(tokenAddress);
        console.log(`📤 [RealTimePrice] Unsubscribed from CoinVera for ${tokenAddress} (no more frontend clients)`);
        
        // If no tokens are subscribed, disconnect from CoinVera
        const allSubscribedTokens = this.coinVeraService.getSubscribedTokens();
        if (allSubscribedTokens.length === 0) {
          console.log('🔌 [RealTimePrice] No more tokens subscribed, disconnecting from CoinVera');
          this.coinVeraService.disconnect();
        }
      }
    });
  }

  // Public API methods
  subscribeToToken(tokenAddress) {
    if (!this.isInitialized) {
      console.error('❌ [RealTimePrice] Service not initialized');
      return false;
    }
    return this.coinVeraService.subscribeToToken(tokenAddress);
  }

  unsubscribeFromToken(tokenAddress) {
    if (!this.isInitialized) {
      console.error('❌ [RealTimePrice] Service not initialized');
      return false;
    }
    return this.coinVeraService.unsubscribeFromToken(tokenAddress);
  }

  getStats() {
    return {
      coinVera: {
        isConnected: this.coinVeraService.isConnected,
        subscribedTokens: this.coinVeraService.getSubscribedTokens()
      },
      backendWebSocket: this.backendWebSocketServer.getStats()
    };
  }

  async shutdown() {
    console.log('🛑 [RealTimePrice] Shutting down real-time price service...');
    
    if (this.coinVeraService) {
      this.coinVeraService.disconnect();
    }
    
    this.isInitialized = false;
    console.log('✅ [RealTimePrice] Real-time price service shutdown complete');
  }
}

export default RealTimePriceService;
