import AutomatedTokenCleanup from './automatedTokenCleanup.js';

async function testAutomatedCleanup() {
  console.log('🧪 Testing Automated Token Cleanup...\n');
  
  try {
    const cleanup = new AutomatedTokenCleanup();
    
    // Test initialization
    console.log('1️⃣ Testing initialization...');
    await cleanup.initialize();
    console.log('✅ Initialization successful\n');
    
    // Test status check
    console.log('2️⃣ Testing status check...');
    const status = await cleanup.getStatus();
    console.log('📊 Current Status:', JSON.stringify(status, null, 2));
    console.log('✅ Status check successful\n');
    
    // Test force cleanup (this will actually run cleanup)
    console.log('3️⃣ Testing force cleanup...');
    console.log('⚠️ This will actually delete CRITICAL tokens!');
    console.log('Press Ctrl+C to cancel, or wait 5 seconds to continue...');
    
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    await cleanup.forceCleanup();
    console.log('✅ Force cleanup completed\n');
    
    // Test interval update
    console.log('4️⃣ Testing interval update...');
    cleanup.setCleanupInterval(12); // 12 hours
    console.log('✅ Interval updated to 12 hours\n');
    
    console.log('🎉 All tests completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

// Run the test
testAutomatedCleanup().catch(console.error);
