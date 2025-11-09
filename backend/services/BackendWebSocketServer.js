import { WebSocketServer, WebSocket } from 'ws';
import EventEmitter from 'events';

class BackendWebSocketServer extends EventEmitter {
  constructor(server) {
    super();
    this.server = server;
    this.wss = null;
    this.clients = new Map(); // Map of client ID to WebSocket
    this.tokenSubscriptions = new Map(); // Map of tokenAddress to Set of client IDs
    this.clientTokenSubscriptions = new Map(); // Map of client ID to Set of tokenAddresses
  }

  initialize() {
    this.wss = new WebSocketServer({ 
      server: this.server,
      path: '/ws'
    });

    this.wss.on('connection', (ws, req) => {
      const clientId = this.generateClientId();
      this.clients.set(clientId, ws);
      
      console.log(`🔌 [BackendWS] Client connected: ${clientId}`);
      
      // Send welcome message
      this.sendToClient(clientId, {
        type: 'connected',
        clientId,
        timestamp: Date.now()
      });

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data);
          this.handleClientMessage(clientId, message);
        } catch (error) {
          console.error('❌ [BackendWS] Error parsing client message:', error.message);
          this.sendToClient(clientId, {
            type: 'error',
            message: 'Invalid message format',
            timestamp: Date.now()
          });
        }
      });

      ws.on('close', () => {
        console.log(`🔌 [BackendWS] Client disconnected: ${clientId}`);
        this.handleClientDisconnect(clientId);
      });

      ws.on('error', (error) => {
        console.error(`❌ [BackendWS] Client error ${clientId}:`, error.message);
        this.handleClientDisconnect(clientId);
      });
    });

    console.log('✅ [BackendWS] WebSocket server initialized on /ws');
  }

  generateClientId() {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  handleClientMessage(clientId, message) {
    switch (message.type) {
      case 'subscribeToken':
        this.handleTokenSubscription(clientId, message.tokenAddress);
        break;
      case 'unsubscribeToken':
        this.handleTokenUnsubscription(clientId, message.tokenAddress);
        break;
      case 'ping':
        this.sendToClient(clientId, { type: 'pong', timestamp: Date.now() });
        break;
      default:
        console.log(`ℹ️ [BackendWS] Unknown message type from ${clientId}:`, message.type);
    }
  }

  handleTokenSubscription(clientId, tokenAddress) {
    if (!tokenAddress) {
      this.sendToClient(clientId, {
        type: 'error',
        message: 'Token address required for subscription',
        timestamp: Date.now()
      });
      return;
    }

    // Add client to token subscription
    if (!this.tokenSubscriptions.has(tokenAddress)) {
      this.tokenSubscriptions.set(tokenAddress, new Set());
    }
    this.tokenSubscriptions.get(tokenAddress).add(clientId);

    // Add token to client subscription
    if (!this.clientTokenSubscriptions.has(clientId)) {
      this.clientTokenSubscriptions.set(clientId, new Set());
    }
    this.clientTokenSubscriptions.get(clientId).add(tokenAddress);

    console.log(`📤 [BackendWS] Client ${clientId} subscribed to ${tokenAddress}`);
    
    this.sendToClient(clientId, {
      type: 'subscriptionConfirmed',
      tokenAddress,
      timestamp: Date.now()
    });

    // 🚀 NEW: Emit event to send recent swaps to this client
    this.emit('tokenSubscription', { clientId, tokenAddress, sendRecentSwaps: true });
  }

  handleTokenUnsubscription(clientId, tokenAddress) {
    if (!tokenAddress) {
      this.sendToClient(clientId, {
        type: 'error',
        message: 'Token address required for unsubscription',
        timestamp: Date.now()
      });
      return;
    }

    // Remove client from token subscription
    if (this.tokenSubscriptions.has(tokenAddress)) {
      this.tokenSubscriptions.get(tokenAddress).delete(clientId);
      if (this.tokenSubscriptions.get(tokenAddress).size === 0) {
        this.tokenSubscriptions.delete(tokenAddress);
      }
    }

    // Remove token from client subscription
    if (this.clientTokenSubscriptions.has(clientId)) {
      this.clientTokenSubscriptions.get(clientId).delete(tokenAddress);
      if (this.clientTokenSubscriptions.get(clientId).size === 0) {
        this.clientTokenSubscriptions.delete(clientId);
      }
    }

    console.log(`📤 [BackendWS] Client ${clientId} unsubscribed from ${tokenAddress}`);
    
    this.sendToClient(clientId, {
      type: 'unsubscriptionConfirmed',
      tokenAddress,
      timestamp: Date.now()
    });

    // Emit event for external services
    this.emit('tokenUnsubscription', { clientId, tokenAddress });
  }

  handleClientDisconnect(clientId) {
    // Remove client from all token subscriptions
    if (this.clientTokenSubscriptions.has(clientId)) {
      const subscribedTokens = Array.from(this.clientTokenSubscriptions.get(clientId));
      
      for (const tokenAddress of subscribedTokens) {
        this.handleTokenUnsubscription(clientId, tokenAddress);
      }
    }

    // Clean up client data
    this.clients.delete(clientId);
    this.clientTokenSubscriptions.delete(clientId);
  }

  sendToClient(clientId, message) {
    const client = this.clients.get(clientId);
    if (client && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  }

  broadcastToTokenSubscribers(tokenAddress, message) {
    const subscribers = this.tokenSubscriptions.get(tokenAddress);
    if (subscribers && subscribers.size > 0) {
      console.log(`📡 [BackendWS] Broadcasting to ${subscribers.size} subscribers for ${tokenAddress.slice(0, 8)}...`);
      subscribers.forEach(clientId => {
        this.sendToClient(clientId, {
          ...message,
          tokenAddress,
          timestamp: Date.now()
        });
      });
    } else {
      // Log when there are no subscribers (every 100th broadcast to reduce noise)
      if (Math.random() < 0.01) {
        console.log(`⚠️ [BackendWS] No subscribers for ${tokenAddress.slice(0, 8)}... (token not being watched)`);
      }
    }
  }

  broadcastPriceUpdate(tokenAddress, priceData) {
    this.broadcastToTokenSubscribers(tokenAddress, {
      type: 'priceUpdate',
      data: priceData
    });
  }

  broadcastSwapUpdate(tokenAddress, swapData) {
    this.broadcastToTokenSubscribers(tokenAddress, {
      type: 'swapUpdate',
      data: swapData
    });
  }

  /**
   * Broadcast message to ALL connected clients (no subscription filtering)
   * This is used for periodic full state updates (DEXScreener-style)
   */
  broadcast(message) {
    const messageStr = JSON.stringify(message);
    let sentCount = 0;
    
    this.clients.forEach((clientInfo, clientId) => {
      // Safety check: clientInfo might be undefined if client disconnected
      if (!clientInfo || !clientInfo.ws) {
        console.warn(`⚠️ [BackendWS] Client ${clientId} has no valid connection, removing`);
        this.clients.delete(clientId);
        return;
      }
      
      if (clientInfo.ws.readyState === WebSocket.OPEN) {
        try {
          clientInfo.ws.send(messageStr);
          sentCount++;
        } catch (error) {
          console.error(`❌ [BackendWS] Failed to send to client ${clientId}:`, error.message);
        }
      }
    });
    
    // Log every 10th broadcast to reduce noise
    if (Math.random() < 0.1) {
      console.log(`📡 [BackendWS] Broadcasted ${message.type} to ${sentCount}/${this.clients.size} clients`);
    }
  }

  // 🚀 NEW: Send recent swaps to a specific client (for late joiners)
  sendRecentSwapsToClient(clientId, tokenAddress, recentSwaps) {
    if (!recentSwaps || recentSwaps.length === 0) {
      console.log(`📊 [BackendWS] No recent swaps to send for ${tokenAddress.substring(0, 8)}...`);
      return;
    }

    console.log(`📊 [BackendWS] Sending ${recentSwaps.length} recent swaps to client ${clientId} for ${tokenAddress.substring(0, 8)}...`);
    
    this.sendToClient(clientId, {
      type: 'recentSwaps',
      tokenAddress,
      swaps: recentSwaps,
      count: recentSwaps.length,
      timestamp: Date.now()
    });
  }

  // ✅ NEW: Broadcast tooltip data update
  broadcastTooltipUpdate(tokenAddress, tooltipData) {
    this.broadcastToTokenSubscribers(tokenAddress, {
      type: 'tooltipUpdate',
      data: tooltipData
    });
  }

  // ✅ NEW: Broadcast price update for a specific token (real-time)
  broadcastPriceUpdate(tokenAddress, priceData) {
    this.broadcastToTokenSubscribers(tokenAddress, {
      type: 'priceUpdate',
      tokenAddress,
      priceData
    });
  }

  // ✅ NEW: Broadcast ranking data update to all clients
  broadcastRankingUpdate(rankings) {
    const message = {
      type: 'rankingUpdate',
      rankings: rankings,
      timestamp: Date.now()
    };

    // Broadcast to all connected clients
    this.clients.forEach((client, clientId) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(message));
      }
    });

    console.log(`📊 [BackendWS] Broadcasted ranking update to ${this.clients.size} clients`);
  }

  getStats() {
    return {
      totalClients: this.clients.size,
      totalTokenSubscriptions: this.tokenSubscriptions.size,
      subscribedTokens: Array.from(this.tokenSubscriptions.keys())
    };
  }
}

export default BackendWebSocketServer;
