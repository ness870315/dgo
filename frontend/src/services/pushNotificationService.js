/**
 * Mobile Push Notification Service
 * Handles push notification subscription and management for mobile users
 */
class PushNotificationService {
  constructor() {
    this.API_BASE = process.env.REACT_APP_API_BASE_URL || 'https://api.degen-oracle.com';
    this.isSupported = 'serviceWorker' in navigator && 'PushManager' in window;
    this.isSubscribed = false;
    this.subscription = null;
  }

  /**
   * Check if push notifications are supported and if device is mobile
   */
  isMobileDevice() {
    const userAgent = navigator.userAgent;
    const mobileRegex = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;
    return mobileRegex.test(userAgent);
  }

  /**
   * Request permission for push notifications
   */
  async requestPermission() {
    if (!this.isSupported) {
      throw new Error('Push notifications are not supported in this browser');
    }

    if (!this.isMobileDevice()) {
      throw new Error('Push notifications are only available on mobile devices');
    }

    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        console.log('📱 Push notification permission granted');
        return true;
      } else {
        console.log('📱 Push notification permission denied');
        return false;
      }
    } catch (error) {
      console.error('❌ Error requesting push notification permission:', error);
      throw error;
    }
  }

  /**
   * Subscribe to push notifications
   */
  async subscribe() {
    try {
      if (!this.isSupported) {
        throw new Error('Push notifications are not supported');
      }

      if (!this.isMobileDevice()) {
        throw new Error('Push notifications are only available on mobile devices');
      }

      // Request permission first
      const hasPermission = await this.requestPermission();
      if (!hasPermission) {
        throw new Error('Permission denied for push notifications');
      }

      // Get service worker registration
      const registration = await navigator.serviceWorker.ready;
      
      // Subscribe to push notifications
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this.urlBase64ToUint8Array(this.getVapidPublicKey())
      });

      console.log('📱 Push subscription created:', subscription);

      // Send subscription to server
      const response = await fetch(`${this.API_BASE}/api/push/subscribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          subscription: subscription,
          userAgent: navigator.userAgent
        })
      });

      const result = await response.json();
      
      if (result.success) {
        this.isSubscribed = true;
        this.subscription = subscription;
        console.log('📱 Successfully subscribed to push notifications');
        return { success: true, subscription };
      } else {
        throw new Error(result.error || 'Failed to subscribe to push notifications');
      }

    } catch (error) {
      console.error('❌ Error subscribing to push notifications:', error);
      throw error;
    }
  }

  /**
   * Unsubscribe from push notifications
   */
  async unsubscribe() {
    try {
      if (!this.subscription) {
        console.log('📱 No active subscription to unsubscribe');
        return { success: true };
      }

      // Unsubscribe from push manager
      const success = await this.subscription.unsubscribe();
      
      if (success) {
        // Notify server
        await fetch(`${this.API_BASE}/api/push/unsubscribe`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            endpoint: this.subscription.endpoint
          })
        });

        this.isSubscribed = false;
        this.subscription = null;
        console.log('📱 Successfully unsubscribed from push notifications');
        return { success: true };
      } else {
        throw new Error('Failed to unsubscribe from push notifications');
      }

    } catch (error) {
      console.error('❌ Error unsubscribing from push notifications:', error);
      throw error;
    }
  }

  /**
   * Check current subscription status
   */
  async checkSubscriptionStatus() {
    try {
      if (!this.isSupported) {
        return { supported: false, subscribed: false };
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      
      this.isSubscribed = !!subscription;
      this.subscription = subscription;
      
      return { 
        supported: true, 
        subscribed: this.isSubscribed,
        subscription: subscription 
      };

    } catch (error) {
      console.error('❌ Error checking subscription status:', error);
      return { supported: false, subscribed: false, error: error.message };
    }
  }

  /**
   * Show notification permission request UI
   */
  showPermissionRequest() {
    if (!this.isMobileDevice()) {
      return {
        show: false,
        message: 'Push notifications are only available on mobile devices'
      };
    }

    if (!this.isSupported) {
      return {
        show: false,
        message: 'Push notifications are not supported in this browser'
      };
    }

    return {
      show: true,
      message: 'Get notified when other users make KOL calls!',
      title: 'Enable Push Notifications',
      description: 'Stay updated with the latest KOL calls from the community'
    };
  }

  /**
   * Handle notification click
   */
  handleNotificationClick(event) {
    console.log('📱 Notification clicked:', event);
    
    if (event.notification.data && event.notification.data.url) {
      // Open the token page
      event.waitUntil(
        clients.openWindow(event.notification.data.url)
      );
    }
    
    event.notification.close();
  }

  /**
   * Handle notification close
   */
  handleNotificationClose(event) {
    console.log('📱 Notification closed:', event);
  }

  /**
   * Get VAPID public key (you'll need to generate this)
   */
  getVapidPublicKey() {
    // This should be your actual VAPID public key
    // For now, using a placeholder - you'll need to generate real VAPID keys
    return 'BEl62iUYgUivxIkv69yViEuiBIa40HI8F8jVvJ1wzUvxIkv69yViEuiBIa40HI8F8jVvJ1wzUvxIkv69yViEuiBIa40HI8F8jVvJ1wzUv';
  }

  /**
   * Convert VAPID key to Uint8Array
   */
  urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
      .replace(/-/g, '+')
      .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  /**
   * Get notification stats
   */
  async getStats() {
    try {
      const response = await fetch(`${this.API_BASE}/api/push/stats`);
      const result = await response.json();
      return result;
    } catch (error) {
      console.error('❌ Error getting push notification stats:', error);
      return { success: false, error: error.message };
    }
  }
}

export default new PushNotificationService();
