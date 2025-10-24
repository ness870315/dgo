import { EventEmitter } from 'events';

class WebSocketService extends EventEmitter {
  constructor() {
    super();
    this.ws = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000; // Start with 1 second
    this.subscribedTokens = new Set();
    this.heartbeatInterval = null;
    this.heartbeatTimeout = null;
  }

  connect() {
    if (this.isConnected || this.ws) {
      return;
    }

    // Use the same API base URL as other services
    const API_BASE = process.env.REACT_APP_API_BASE_URL || 'https://api.degen-oracle.com';
    const wsUrl = API_BASE.replace('https://', 'wss://').replace('http://', 'ws://') + '/ws';

    console.log('🔌 [WebSocketService] Connecting to:', wsUrl);

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('✅ [WebSocketService] Connected to WebSocket server');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.reconnectDelay = 1000;
        
        // Start heartbeat
        this.startHeartbeat();
        
        // Re-subscribe to all tokens
        this.resubscribeToAllTokens();
        
        this.emit('connected');
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          this.handleMessage(message);
        } catch (error) {
          console.error('❌ [WebSocketService] Error parsing message:', error);
        }
      };

      this.ws.onclose = (event) => {
        console.log('🔌 [WebSocketService] Connection closed:', event.code, event.reason);
        this.isConnected = false;
        this.stopHeartbeat();
        
        this.emit('disconnected', { code: event.code, reason: event.reason });
        
        // Attempt to reconnect if not a clean close
        if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = (error) => {
        console.error('❌ [WebSocketService] WebSocket error:', error);
        this.emit('error', error);
      };

    } catch (error) {
      console.error('❌ [WebSocketService] Failed to create WebSocket:', error);
      this.emit('error', error);
    }
  }

  disconnect() {
    if (this.ws) {
      this.stopHeartbeat();
      this.ws.close(1000, 'Client disconnecting');
      this.ws = null;
    }
    this.isConnected = false;
    this.subscribedTokens.clear();
  }

  startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      if (this.isConnected) {
        this.send({ type: 'ping' });
        
        // Set timeout for pong response
        this.heartbeatTimeout = setTimeout(() => {
          console.warn('⚠️ [WebSocketService] Heartbeat timeout, reconnecting...');
          this.disconnect();
          this.connect();
        }, 5000);
      }
    }, 30000); // Send ping every 30 seconds
  }

  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout);
      this.heartbeatTimeout = null;
    }
  }

  scheduleReconnect() {
    this.reconnectAttempts++;
    const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), 30000);
    
    console.log(`🔄 [WebSocketService] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    
    setTimeout(() => {
      if (!this.isConnected) {
        this.connect();
      }
    }, delay);
  }

  send(message) {
    if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn('⚠️ [WebSocketService] Cannot send message, WebSocket not connected');
    }
  }

  handleMessage(message) {
    switch (message.type) {
      case 'connected':
        console.log('✅ [WebSocketService] Server confirmed connection:', message.clientId);
        this.emit('serverConnected', message);
        break;
        
      case 'pong':
        // Clear heartbeat timeout
        if (this.heartbeatTimeout) {
          clearTimeout(this.heartbeatTimeout);
          this.heartbeatTimeout = null;
        }
        break;
        
      case 'priceUpdate':
        console.log('📈 [WebSocketService] Price update received for:', message.tokenAddress);
        this.emit('priceUpdate', {
          tokenAddress: message.tokenAddress,
          priceData: message.data,
          timestamp: message.timestamp
        });
        break;
        
      case 'swapUpdate':
        console.log('🔄 [WebSocketService] Swap update received for:', message.tokenAddress);
        this.emit('swapUpdate', {
          tokenAddress: message.tokenAddress,
          swapData: message.data,
          timestamp: message.timestamp
        });
        break;
        
      case 'subscriptionConfirmed':
        console.log('✅ [WebSocketService] Subscription confirmed for:', message.tokenAddress);
        this.emit('subscriptionConfirmed', message);
        break;
        
      case 'unsubscriptionConfirmed':
        console.log('✅ [WebSocketService] Unsubscription confirmed for:', message.tokenAddress);
        this.emit('unsubscriptionConfirmed', message);
        break;
        
      case 'error':
        console.error('❌ [WebSocketService] Server error:', message.message);
        this.emit('serverError', message);
        break;
        
      default:
        console.log('ℹ️ [WebSocketService] Unknown message type:', message.type);
    }
  }

  subscribeToToken(tokenAddress) {
    if (!tokenAddress) {
      console.error('❌ [WebSocketService] Token address is required');
      return false;
    }

    if (!this.isConnected) {
      console.warn('⚠️ [WebSocketService] Not connected, will subscribe when connected');
      this.subscribedTokens.add(tokenAddress);
      return false;
    }

    this.send({
      type: 'subscribeToken',
      tokenAddress
    });

    this.subscribedTokens.add(tokenAddress);
    console.log('📤 [WebSocketService] Subscribed to token:', tokenAddress);
    return true;
  }

  unsubscribeFromToken(tokenAddress) {
    if (!tokenAddress) {
      console.error('❌ [WebSocketService] Token address is required');
      return false;
    }

    if (!this.isConnected) {
      console.warn('⚠️ [WebSocketService] Not connected, removing from local subscriptions');
      this.subscribedTokens.delete(tokenAddress);
      return false;
    }

    this.send({
      type: 'unsubscribeToken',
      tokenAddress
    });

    this.subscribedTokens.delete(tokenAddress);
    console.log('📤 [WebSocketService] Unsubscribed from token:', tokenAddress);
    return true;
  }

  resubscribeToAllTokens() {
    if (this.subscribedTokens.size > 0) {
      console.log(`🔄 [WebSocketService] Re-subscribing to ${this.subscribedTokens.size} tokens`);
      
      this.subscribedTokens.forEach(tokenAddress => {
        this.send({
          type: 'subscribeToken',
          tokenAddress
        });
      });
    }
  }

  getStats() {
    return {
      isConnected: this.isConnected,
      subscribedTokens: Array.from(this.subscribedTokens),
      reconnectAttempts: this.reconnectAttempts,
      maxReconnectAttempts: this.maxReconnectAttempts
    };
  }
}

// Create a singleton instance
const websocketService = new WebSocketService();

export default websocketService;
