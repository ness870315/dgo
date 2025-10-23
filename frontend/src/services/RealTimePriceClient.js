class RealTimePriceClient {
  constructor() {
    this.ws = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 3000;
    this.subscribedTokens = new Set();
    this.eventListeners = new Map();
    this.pingInterval = null;
    // Use the same API base URL as other services
    const API_BASE = process.env.REACT_APP_API_BASE_URL || 'https://api.degen-oracle.com';
    this.baseUrl = API_BASE.replace('https://', 'wss://').replace('http://', 'ws://') + '/ws';
  }

  connect() {
    return new Promise((resolve, reject) => {
      try {
        console.log('🔌 [RealTimePrice] Connecting to backend WebSocket...');
        
        this.ws = new WebSocket(this.baseUrl);
        
        this.ws.onopen = () => {
          console.log('✅ [RealTimePrice] Connected to backend WebSocket');
          this.isConnected = true;
          this.reconnectAttempts = 0;
          
          // Start ping interval
          this.pingInterval = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
              this.ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
            }
          }, 30000);
          
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            this.handleMessage(message);
          } catch (error) {
            console.error('❌ [RealTimePrice] Error parsing message:', error.message);
          }
        };

        this.ws.onerror = (error) => {
          console.error('❌ [RealTimePrice] WebSocket error:', error);
          this.isConnected = false;
          reject(error);
        };

        this.ws.onclose = (event) => {
          console.log(`🔌 [RealTimePrice] WebSocket closed: ${event.code} - ${event.reason}`);
          this.isConnected = false;
          this.handleReconnect();
        };

      } catch (error) {
        console.error('❌ [RealTimePrice] Connection error:', error.message);
        reject(error);
      }
    });
  }

  handleMessage(message) {
    switch (message.type) {
      case 'connected':
        console.log(`✅ [RealTimePrice] Server confirmed connection: ${message.clientId}`);
        break;
        
      case 'priceUpdate':
        this.handlePriceUpdate(message);
        break;
        
      case 'subscriptionConfirmed':
        console.log(`✅ [RealTimePrice] Subscribed to ${message.tokenAddress}`);
        break;
        
      case 'unsubscriptionConfirmed':
        console.log(`✅ [RealTimePrice] Unsubscribed from ${message.tokenAddress}`);
        break;
        
      case 'pong':
        // Pong received, connection is alive
        break;
        
      case 'error':
        console.error('❌ [RealTimePrice] Server error:', message.message);
        break;
        
      default:
        console.log('ℹ️ [RealTimePrice] Unknown message type:', message.type);
    }
  }

  handlePriceUpdate(message) {
    const { tokenAddress, data } = message;
    
    // Emit price update event for this token
    this.emit('priceUpdate', {
      tokenAddress,
      priceUsd: data.priceUsd,
      priceSol: data.priceSol,
      liquidity: data.liquidity,
      dex: data.dex,
      poolId: data.poolId,
      timestamp: data.timestamp
    });
    
    console.log(`📈 [RealTimePrice] Price update for ${tokenAddress}: $${data.priceUsd}`);
  }

  subscribeToToken(tokenAddress) {
    if (!this.isConnected || !this.ws) {
      console.error('❌ [RealTimePrice] WebSocket not connected');
      return false;
    }

    if (this.subscribedTokens.has(tokenAddress)) {
      console.log(`ℹ️ [RealTimePrice] Already subscribed to ${tokenAddress}`);
      return true;
    }

    const message = {
      type: 'subscribeToken',
      tokenAddress
    };

    this.ws.send(JSON.stringify(message));
    this.subscribedTokens.add(tokenAddress);
    
    console.log(`📤 [RealTimePrice] Subscribing to ${tokenAddress}`);
    return true;
  }

  unsubscribeFromToken(tokenAddress) {
    if (!this.isConnected || !this.ws) {
      console.error('❌ [RealTimePrice] WebSocket not connected');
      return false;
    }

    if (!this.subscribedTokens.has(tokenAddress)) {
      console.log(`ℹ️ [RealTimePrice] Not subscribed to ${tokenAddress}`);
      return true;
    }

    const message = {
      type: 'unsubscribeToken',
      tokenAddress
    };

    this.ws.send(JSON.stringify(message));
    this.subscribedTokens.delete(tokenAddress);
    
    console.log(`📤 [RealTimePrice] Unsubscribing from ${tokenAddress}`);
    return true;
  }

  handleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('❌ [RealTimePrice] Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    console.log(`🔄 [RealTimePrice] Attempting reconnection ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${this.reconnectDelay}ms...`);

    setTimeout(() => {
      this.connect().then(() => {
        // Resubscribe to all tokens
        const tokensToResubscribe = Array.from(this.subscribedTokens);
        this.subscribedTokens.clear();
        
        for (const token of tokensToResubscribe) {
          this.subscribeToToken(token);
        }
        
        console.log('✅ [RealTimePrice] Reconnected and resubscribed to all tokens');
      }).catch((error) => {
        console.error('❌ [RealTimePrice] Reconnection failed:', error.message);
        this.handleReconnect();
      });
    }, this.reconnectDelay);
  }

  disconnect() {
    console.log('🔌 [RealTimePrice] Disconnecting WebSocket...');
    
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

  // Event emitter methods
  on(event, callback) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event).push(callback);
  }

  off(event, callback) {
    if (this.eventListeners.has(event)) {
      const listeners = this.eventListeners.get(event);
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  emit(event, data) {
    if (this.eventListeners.has(event)) {
      this.eventListeners.get(event).forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`❌ [RealTimePrice] Error in event listener for ${event}:`, error.message);
        }
      });
    }
  }

  getSubscribedTokens() {
    return Array.from(this.subscribedTokens);
  }

  isTokenSubscribed(tokenAddress) {
    return this.subscribedTokens.has(tokenAddress);
  }
}

export default RealTimePriceClient;
