import PushNotificationService from './pushNotificationService.js';
import fs from 'fs/promises';
import path from 'path';

/**
 * Debug script for push notifications
 * This will help us understand what's happening with push notifications
 */
async function debugPushNotifications() {
  console.log('🔍 Starting Push Notification Debug...\n');

  try {
    const pushService = new PushNotificationService();
    
    // 1. Check if cache directory exists
    console.log('📁 Checking cache directory...');
    try {
      await fs.access('cache');
      console.log('✅ Cache directory exists');
    } catch (error) {
      console.log('❌ Cache directory does not exist, creating...');
      await fs.mkdir('cache', { recursive: true });
      console.log('✅ Cache directory created');
    }

    // 2. Check subscription file
    console.log('\n📱 Checking push subscriptions...');
    try {
      const subscriptions = await pushService.getSubscriptions();
      console.log(`📊 Total subscriptions: ${subscriptions.length}`);
      console.log(`📊 Active subscriptions: ${subscriptions.filter(s => s.isActive).length}`);
      
      if (subscriptions.length > 0) {
        console.log('\n📋 Subscription details:');
        subscriptions.forEach((sub, index) => {
          console.log(`  ${index + 1}. Endpoint: ${sub.endpoint.substring(0, 50)}...`);
          console.log(`     Active: ${sub.isActive}`);
          console.log(`     Subscribed: ${sub.subscribedAt}`);
          console.log(`     Last Seen: ${sub.lastSeen}`);
          console.log('');
        });
      } else {
        console.log('⚠️  No subscriptions found');
      }
    } catch (error) {
      console.log('❌ Error reading subscriptions:', error.message);
    }

    // 3. Check notification history
    console.log('📈 Checking notification history...');
    try {
      const notifications = await pushService.getNotifications();
      console.log(`📊 Total notifications sent: ${notifications.length}`);
      
      if (notifications.length > 0) {
        console.log('\n📋 Recent notifications:');
        notifications.slice(-5).forEach((notif, index) => {
          console.log(`  ${index + 1}. Call ID: ${notif.id}`);
          console.log(`     Token: ${notif.callData.tokenSymbol}`);
          console.log(`     User: ${notif.callData.username}`);
          console.log(`     Sent: ${notif.sentCount}/${notif.totalCount}`);
          console.log(`     Time: ${notif.timestamp}`);
          console.log('');
        });
      } else {
        console.log('⚠️  No notifications sent yet');
      }
    } catch (error) {
      console.log('❌ Error reading notifications:', error.message);
    }

    // 4. Check stats
    console.log('📊 Checking push notification stats...');
    try {
      const stats = await pushService.getStats();
      console.log('📈 Push Notification Stats:');
      console.log(`  Total Subscriptions: ${stats.totalSubscriptions}`);
      console.log(`  Active Subscriptions: ${stats.activeSubscriptions}`);
      console.log(`  Total Notifications Sent: ${stats.totalNotificationsSent}`);
      console.log(`  Last Notification: ${stats.lastNotification || 'None'}`);
    } catch (error) {
      console.log('❌ Error getting stats:', error.message);
    }

    // 5. Test mobile device detection
    console.log('\n📱 Testing mobile device detection...');
    const testUserAgents = [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 14_7_1 like Mac OS X) AppleWebKit/605.1.15',
      'Mozilla/5.0 (Linux; Android 11; SM-G991B) AppleWebKit/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
    ];

    testUserAgents.forEach((ua, index) => {
      const isMobile = pushService.isMobileDevice(ua);
      console.log(`  ${index + 1}. ${isMobile ? '📱 Mobile' : '💻 Desktop'}: ${ua.substring(0, 60)}...`);
    });

    // 6. Test notification creation
    console.log('\n🧪 Testing notification creation...');
    try {
      const testCallData = {
        id: 'test-call-123',
        user: {
          id: 'test-user-123',
          username: 'testuser',
          displayName: 'Test User'
        },
        token: {
          symbol: 'TEST',
          name: 'Test Token',
          contractAddress: 'test-contract-123',
          icon: '/icon-192x192.png'
        },
        calledMC: 1000000,
        thesis: 'This is a test call'
      };

      const notification = pushService.createKolCallNotification(testCallData);
      console.log('✅ Test notification created successfully:');
      console.log(`  Title: ${notification.title}`);
      console.log(`  Body: ${notification.body}`);
      console.log(`  Data: ${JSON.stringify(notification.data, null, 2)}`);
    } catch (error) {
      console.log('❌ Error creating test notification:', error.message);
    }

    console.log('\n✅ Push notification debug completed!');

  } catch (error) {
    console.error('❌ Debug failed:', error);
  }
}

// Run the debug
debugPushNotifications();
