/**
 * Test script to simulate mobile subscription and KOL call notification
 */
import PushNotificationService from './pushNotificationService.js';

async function testPushNotificationFlow() {
  console.log('🧪 Testing Push Notification Flow...\n');

  const pushService = new PushNotificationService();

  // 1. Simulate a mobile device subscription
  console.log('📱 Simulating mobile device subscription...');
  
  const mockSubscription = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/test-endpoint-123',
    keys: {
      p256dh: 'test-p256dh-key',
      auth: 'test-auth-key'
    }
  };

  const subscriptionResult = await pushService.subscribeDevice(mockSubscription);
  console.log('Subscription result:', subscriptionResult);

  // 2. Check subscriptions
  console.log('\n📊 Checking subscriptions...');
  const subscriptions = await pushService.getSubscriptions();
  console.log(`Total subscriptions: ${subscriptions.length}`);

  // 3. Simulate a KOL call notification
  console.log('\n🚀 Simulating KOL call notification...');
  
  const mockCallData = {
    id: 'test-call-456',
    user: {
      id: 'user-123',
      username: 'testuser',
      displayName: 'Test User'
    },
    token: {
      symbol: 'PEPE',
      name: 'Pepe Token',
      contractAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      icon: '/icon-192x192.png'
    },
    calledMC: 5000000,
    thesis: 'This is a test KOL call for debugging'
  };

  const notificationResult = await pushService.sendKolCallNotification(mockCallData);
  console.log('Notification result:', notificationResult);

  // 4. Check notification history
  console.log('\n📈 Checking notification history...');
  const notifications = await pushService.getNotifications();
  console.log(`Total notifications: ${notifications.length}`);
  
  if (notifications.length > 0) {
    const lastNotification = notifications[notifications.length - 1];
    console.log('Last notification:', {
      id: lastNotification.id,
      token: lastNotification.callData.tokenSymbol,
      user: lastNotification.callData.username,
      sent: lastNotification.sentCount,
      total: lastNotification.totalCount
    });
  }

  // 5. Check stats
  console.log('\n📊 Final stats:');
  const stats = await pushService.getStats();
  console.log(stats);

  console.log('\n✅ Test completed!');
}

testPushNotificationFlow().catch(console.error);
