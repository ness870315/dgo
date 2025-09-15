/**
 * Monitor push notification activity in production
 * This script will help you see what's happening with push notifications
 */
import PushNotificationService from './pushNotificationService.js';
import fs from 'fs/promises';

async function monitorPushActivity() {
  console.log('🔍 Monitoring Push Notification Activity...\n');

  const pushService = new PushNotificationService();

  // Check current state
  const stats = await pushService.getStats();
  const subscriptions = await pushService.getSubscriptions();
  const notifications = await pushService.getNotifications();

  console.log('📊 Current State:');
  console.log(`  Total Subscriptions: ${stats.totalSubscriptions}`);
  console.log(`  Active Subscriptions: ${stats.activeSubscriptions}`);
  console.log(`  Total Notifications Sent: ${stats.totalNotificationsSent}`);
  console.log(`  Last Notification: ${stats.lastNotification || 'None'}`);

  if (subscriptions.length > 0) {
    console.log('\n📱 Active Subscriptions:');
    subscriptions.forEach((sub, index) => {
      console.log(`  ${index + 1}. Endpoint: ${sub.endpoint.substring(0, 60)}...`);
      console.log(`     Active: ${sub.isActive}`);
      console.log(`     Subscribed: ${sub.subscribedAt}`);
      console.log(`     Last Seen: ${sub.lastSeen}`);
      console.log('');
    });
  }

  if (notifications.length > 0) {
    console.log('\n📈 Recent Notifications:');
    notifications.slice(-3).forEach((notif, index) => {
      console.log(`  ${index + 1}. ${notif.callData.tokenSymbol} by ${notif.callData.username}`);
      console.log(`     Sent: ${notif.sentCount}/${notif.totalCount} devices`);
      console.log(`     Time: ${notif.timestamp}`);
      console.log('');
    });
  }

  // Check if there are any recent KOL calls that should have triggered notifications
  console.log('🔍 Checking for recent KOL calls...');
  
  try {
    // This would check your actual KOL calls data
    // You might need to adjust this based on your data structure
    console.log('💡 To see push notifications working:');
    console.log('  1. Open the app on a mobile device');
    console.log('  2. Look for the push notification permission modal');
    console.log('  3. Grant permission when prompted');
    console.log('  4. Make a KOL call from any device');
    console.log('  5. Check if notification appears on mobile device');
    console.log('');
    console.log('📱 Mobile devices that can receive notifications:');
    console.log('  - Android phones/tablets with Chrome');
    console.log('  - iPhones/iPads with Safari');
    console.log('  - Other mobile browsers that support push notifications');
  } catch (error) {
    console.log('❌ Error checking KOL calls:', error.message);
  }

  console.log('\n✅ Monitoring complete!');
}

monitorPushActivity().catch(console.error);
