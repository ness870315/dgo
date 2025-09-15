/**
 * Test mobile detection and push notification flow
 */
import PushNotificationService from './pushNotificationService.js';

const pushService = new PushNotificationService();

// Test different user agents
const testCases = [
  {
    name: 'iPhone Safari',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1'
  },
  {
    name: 'Android Chrome',
    userAgent: 'Mozilla/5.0 (Linux; Android 11; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Mobile Safari/537.36'
  },
  {
    name: 'iPad Safari',
    userAgent: 'Mozilla/5.0 (iPad; CPU OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1'
  },
  {
    name: 'Desktop Chrome',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
  }
];

console.log('📱 Testing Mobile Detection for Push Notifications\n');

testCases.forEach((testCase, index) => {
  const isMobile = pushService.isMobileDevice(testCase.userAgent);
  const isSupported = pushService.isSupported;
  
  console.log(`${index + 1}. ${testCase.name}:`);
  console.log(`   Mobile: ${isMobile ? '✅ Yes' : '❌ No'}`);
  console.log(`   Supported: ${isSupported ? '✅ Yes' : '❌ No'}`);
  console.log(`   Should Show Modal: ${isMobile && isSupported ? '✅ Yes' : '❌ No'}`);
  console.log(`   User Agent: ${testCase.userAgent.substring(0, 80)}...`);
  console.log('');
});

// Test the permission request logic
console.log('🔍 Testing Permission Request Logic:\n');

const testPermissionRequest = () => {
  const isMobile = pushService.isMobileDevice();
  const isSupported = pushService.isSupported;
  
  console.log(`Current Environment:`);
  console.log(`  Mobile: ${isMobile ? '✅ Yes' : '❌ No'}`);
  console.log(`  Supported: ${isSupported ? '✅ Yes' : '❌ No'}`);
  
  if (isMobile && isSupported) {
    const request = pushService.showPermissionRequest();
    console.log(`  Should Show Request: ${request.show ? '✅ Yes' : '❌ No'}`);
    console.log(`  Message: ${request.message}`);
  } else {
    console.log(`  Should Show Request: ❌ No (${isMobile ? 'Not supported' : 'Not mobile'})`);
  }
};

testPermissionRequest();
