import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Mobile Push Notification Service
 * Handles push notifications for mobile users when KOL calls are made
 */
class PushNotificationService {
  constructor() {
    this.subscriptionsFile = path.join(__dirname, 'cache', 'push-subscriptions.json');
    this.notificationsFile = path.join(__dirname, 'cache', 'push-notifications.json');
    this.ensureCacheDir();
  }

  async ensureCacheDir() {
    try {
      await fs.mkdir(path.dirname(this.subscriptionsFile), { recursive: true });
    } catch (error) {
      // Directory already exists
    }
  }

  /**
   * Subscribe a mobile device to push notifications
   */
  async subscribeDevice(subscriptionData) {
    try {
      const subscriptions = await this.getSubscriptions();
      
      // Check if device is already subscribed
      const existingIndex = subscriptions.findIndex(sub => 
        sub.endpoint === subscriptionData.endpoint
      );
      
      if (existingIndex >= 0) {
        // Update existing subscription
        subscriptions[existingIndex] = {
          ...subscriptionData,
          subscribedAt: subscriptions[existingIndex].subscribedAt,
          lastSeen: new Date().toISOString(),
          isActive: true
        };
        console.log('📱 Updated existing push subscription');
      } else {
        // Add new subscription
        subscriptions.push({
          ...subscriptionData,
          subscribedAt: new Date().toISOString(),
          lastSeen: new Date().toISOString(),
          isActive: true
        });
        console.log('📱 Added new push subscription');
      }
      
      await this.saveSubscriptions(subscriptions);
      return { success: true, message: 'Device subscribed successfully' };
      
    } catch (error) {
      console.error('❌ Error subscribing device:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Unsubscribe a mobile device
   */
  async unsubscribeDevice(endpoint) {
    try {
      const subscriptions = await this.getSubscriptions();
      const filteredSubscriptions = subscriptions.filter(sub => sub.endpoint !== endpoint);
      
      if (filteredSubscriptions.length < subscriptions.length) {
        await this.saveSubscriptions(filteredSubscriptions);
        console.log('📱 Device unsubscribed successfully');
        return { success: true, message: 'Device unsubscribed successfully' };
      } else {
        return { success: false, error: 'Device not found' };
      }
    } catch (error) {
      console.error('❌ Error unsubscribing device:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send push notification to all mobile subscribers
   */
  async sendKolCallNotification(callData) {
    try {
      const subscriptions = await this.getSubscriptions();
      const activeSubscriptions = subscriptions.filter(sub => sub.isActive);
      
      if (activeSubscriptions.length === 0) {
        console.log('📱 No active mobile subscriptions found');
        return { success: true, sent: 0 };
      }

      console.log(`📱 Sending KOL call notification to ${activeSubscriptions.length} mobile devices`);

      const notificationPayload = this.createKolCallNotification(callData);
      const results = [];

      for (const subscription of activeSubscriptions) {
        try {
          const result = await this.sendNotificationToDevice(subscription, notificationPayload);
          results.push({ subscription: subscription.endpoint, success: result.success });
          
          if (result.success) {
            console.log(`✅ Notification sent to device: ${subscription.endpoint.substring(0, 50)}...`);
          } else {
            console.log(`❌ Failed to send to device: ${subscription.endpoint.substring(0, 50)}...`);
          }
        } catch (error) {
          console.error(`❌ Error sending to device ${subscription.endpoint}:`, error.message);
          results.push({ subscription: subscription.endpoint, success: false, error: error.message });
        }
      }

      const successCount = results.filter(r => r.success).length;
      console.log(`📱 Notification results: ${successCount}/${activeSubscriptions.length} successful`);

      // Store notification for analytics
      await this.storeNotification(callData, results);

      return { 
        success: true, 
        sent: successCount, 
        total: activeSubscriptions.length,
        results 
      };

    } catch (error) {
      console.error('❌ Error sending KOL call notifications:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Create notification payload for KOL call
   */
  createKolCallNotification(callData) {
    const { user, token, calledMC, thesis } = callData;
    
    return {
      title: `🚀 New KOL Call: $${token.symbol}`,
      body: `${user.displayName || user.username} called $${token.symbol} at $${this.formatMarketCap(calledMC)}`,
      icon: '/icon-192x192.png',
      badge: '/icon-192x192.png',
      image: token.icon || '/icon-512x512.png',
      data: {
        type: 'kol_call',
        callId: callData.id,
        tokenSymbol: token.symbol,
        tokenContract: token.contractAddress,
        userId: user.id,
        username: user.username,
        calledMC: calledMC,
        url: `https://degen-oracle.com/token/${token.contractAddress}`,
        timestamp: new Date().toISOString()
      },
      actions: [
        {
          action: 'view',
          title: 'View Token',
          icon: '/icon-192x192.png'
        },
        {
          action: 'dismiss',
          title: 'Dismiss',
          icon: '/icon-192x192.png'
        }
      ],
      requireInteraction: true,
      vibrate: [200, 100, 200],
      tag: `kol_call_${callData.id}`,
      renotify: true
    };
  }

  /**
   * Send notification to a specific device
   */
  async sendNotificationToDevice(subscription, payload) {
    try {
      const response = await fetch(subscription.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `key=${subscription.serverKey || 'YOUR_VAPID_KEY'}`,
          'TTL': '86400' // 24 hours
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        return { success: true };
      } else {
        console.error(`Push notification failed: ${response.status} ${response.statusText}`);
        return { success: false, error: `HTTP ${response.status}` };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Get all active subscriptions
   */
  async getSubscriptions() {
    try {
      const data = await fs.readFile(this.subscriptionsFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      return [];
    }
  }

  /**
   * Save subscriptions to file
   */
  async saveSubscriptions(subscriptions) {
    await fs.writeFile(this.subscriptionsFile, JSON.stringify(subscriptions, null, 2));
  }

  /**
   * Store notification for analytics
   */
  async storeNotification(callData, results) {
    try {
      const notifications = await this.getNotifications();
      notifications.push({
        id: callData.id,
        timestamp: new Date().toISOString(),
        callData: {
          userId: callData.user.id,
          username: callData.user.username,
          tokenSymbol: callData.token.symbol,
          tokenContract: callData.token.contractAddress,
          calledMC: callData.calledMC
        },
        results: results,
        sentCount: results.filter(r => r.success).length,
        totalCount: results.length
      });

      // Keep only last 100 notifications
      if (notifications.length > 100) {
        notifications.splice(0, notifications.length - 100);
      }

      await fs.writeFile(this.notificationsFile, JSON.stringify(notifications, null, 2));
    } catch (error) {
      console.error('❌ Error storing notification:', error);
    }
  }

  /**
   * Get notification history
   */
  async getNotifications() {
    try {
      const data = await fs.readFile(this.notificationsFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      return [];
    }
  }

  /**
   * Format market cap for display
   */
  formatMarketCap(mcap) {
    if (mcap >= 1000000000) {
      return `$${(mcap / 1000000000).toFixed(1)}B`;
    } else if (mcap >= 1000000) {
      return `$${(mcap / 1000000).toFixed(1)}M`;
    } else if (mcap >= 1000) {
      return `$${(mcap / 1000).toFixed(1)}K`;
    } else {
      return `$${mcap.toFixed(0)}`;
    }
  }

  /**
   * Check if device is mobile (backend version)
   */
  isMobileDevice(userAgent) {
    const mobileRegex = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;
    return mobileRegex.test(userAgent);
  }

  /**
   * Check if push notifications are supported (always false in backend)
   */
  get isSupported() {
    return false; // Backend doesn't support push notifications directly
  }

  /**
   * Get subscription stats
   */
  async getStats() {
    try {
      const subscriptions = await this.getSubscriptions();
      const notifications = await this.getNotifications();
      
      return {
        totalSubscriptions: subscriptions.length,
        activeSubscriptions: subscriptions.filter(s => s.isActive).length,
        totalNotificationsSent: notifications.length,
        lastNotification: notifications.length > 0 ? notifications[notifications.length - 1].timestamp : null
      };
    } catch (error) {
      console.error('❌ Error getting push notification stats:', error);
      return { error: error.message };
    }
  }
}

export default PushNotificationService;
