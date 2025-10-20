import WebSocket from 'ws';
import EventEmitter from 'events';

class CoinVeraWebSocketService extends EventEmitter {
  constructor() {
    super();
    this.apiKey = process.env.COINVERA_API_KEY || '26b2ed813ff6aa3751a43655164650a3a51e4571';
    this.wsUrl = process.env.COINVERA_WS_URL || 'wss://api.coinvera.io';
    this.ws = null;
    this.subscribedTokens = new Set();
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 5000;
    this.pingInterval = null;
    this.isConnected = false;
    
    // Validate API key
    if (!this.apiKey) {
      throw new Error('COINVERA_API_KEY environment variable is required');
    }
  }

  async connect() {
    return new Promise((resolve, reject) => {
      try {
        console.log('🔌 [CoinVera] Connecting to WebSocket...');
        
        this.ws = new WebSocket(this.wsUrl);
        
        this.ws.on('open', () => {
          console.log('✅ [CoinVera] WebSocket connected');
          this.isConnected = true;
          this.reconnectAttempts = 0;
          
          // Start ping interval
          this.pingInterval = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
              this.ws.ping();
            }
          }, 10000);
          
          resolve();
        });

        this.ws.on('message', (data) => {
          try {
            const message = JSON.parse(data);
            this.handleMessage(message);
          } catch (error) {
            console.error('❌ [CoinVera] Error parsing message:', error.message);
          }
        });

        this.ws.on('error', (error) => {
          console.error('❌ [CoinVera] WebSocket error:', error.message);
          this.isConnected = false;
          reject(error);
        });

        this.ws.on('close', (code, reason) => {
          console.log(`🔌 [CoinVera] WebSocket closed: ${code} - ${reason}`);
          this.isConnected = false;
          this.handleReconnect();
        });

        this.ws.on('pong', () => {
          // Pong received, connection is alive
        });

      } catch (error) {
        console.error('❌ [CoinVera] Connection error:', error.message);
        reject(error);
      }
    });
  }

  handleMessage(message) {
    if (message.type === 'priceUpdate' && message.data) {
      message.data.forEach(priceData => {
        const tokenAddress = priceData.token;
        
        // Emit price update event
        this.emit('priceUpdate', {
          tokenAddress,
          priceUsd: parseFloat(priceData.priceInUsd),
          priceSol: parseFloat(priceData.priceInSol),
          liquidity: parseFloat(priceData.liquidity),
          dex: priceData.dex,
          poolId: priceData.poolId,
          timestamp: Date.now()
        });
        
        console.log(`📈 [CoinVera] Price update for ${tokenAddress}: $${priceData.priceInUsd}`);
      });
    }
  }

  subscribeToToken(tokenAddress) {
    if (!this.isConnected || !this.ws) {
      console.error('❌ [CoinVera] WebSocket not connected');
      return false;
    }

    if (this.subscribedTokens.has(tokenAddress)) {
      console.log(`ℹ️ [CoinVera] Already subscribed to ${tokenAddress}`);
      return true;
    }

    const payload = {
      apiKey: this.apiKey,
      method: 'subscribePrice',
      tokens: [tokenAddress]
    };

    this.ws.send(JSON.stringify(payload));
    this.subscribedTokens.add(tokenAddress);
    
    console.log(`📤 [CoinVera] Subscribed to ${tokenAddress}`);
    return true;
  }

  unsubscribeFromToken(tokenAddress) {
    if (!this.isConnected || !this.ws) {
      console.error('❌ [CoinVera] WebSocket not connected');
      return false;
    }

    if (!this.subscribedTokens.has(tokenAddress)) {
      console.log(`ℹ️ [CoinVera] Not subscribed to ${tokenAddress}`);
      return true;
    }

    const payload = {
      apiKey: this.apiKey,
      method: 'unsubscribePrice',
      tokens: [tokenAddress]
    };

    this.ws.send(JSON.stringify(payload));
    this.subscribedTokens.delete(tokenAddress);
    
    console.log(`📤 [CoinVera] Unsubscribed from ${tokenAddress}`);
    return true;
  }

  handleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('❌ [CoinVera] Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    console.log(`🔄 [CoinVera] Attempting reconnection ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${this.reconnectDelay}ms...`);

    setTimeout(async () => {
      try {
        await this.connect();
        
        // Resubscribe to all tokens
        const tokensToResubscribe = Array.from(this.subscribedTokens);
        this.subscribedTokens.clear();
        
        for (const token of tokensToResubscribe) {
          this.subscribeToToken(token);
        }
        
        console.log('✅ [CoinVera] Reconnected and resubscribed to all tokens');
      } catch (error) {
        console.error('❌ [CoinVera] Reconnection failed:', error.message);
        this.handleReconnect();
      }
    }, this.reconnectDelay);
  }

  disconnect() {
    console.log('🔌 [CoinVera] Disconnecting WebSocket...');
    
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    this.isConnected = false;
    this.subscribedTokens.clear();
  }

  getSubscribedTokens() {
    return Array.from(this.subscribedTokens);
  }

  isTokenSubscribed(tokenAddress) {
    return this.subscribedTokens.has(tokenAddress);
  }
}

export default CoinVeraWebSocketService;
