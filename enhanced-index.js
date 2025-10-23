import EnhancedBackend from './backend/enhancedBackend.js';

console.log('🚀 Starting Enhanced Token Analysis System...');
console.log('📊 Version: Enhanced Backend v3.0');
console.log('🔧 Architecture: Staged Processing Pipeline');
console.log('⚡ Features: Rate Limited, Batch Processing, Real-time Updates');

async function main() {
  try {
    // Create and start the enhanced backend
    const backend = new EnhancedBackend();
    global.enhancedBackend = backend;
    
    console.log('🎯 Initializing Enhanced Backend...');
    await backend.start();
    
    console.log('✅ Enhanced Token Analysis System is running!');
    console.log('🌐 Backend: http://localhost:4000');
    console.log('📊 Health: http://localhost:4000/health');
    console.log('🔍 Status: http://localhost:4000/api/status');
    
  } catch (error) {
    console.error('❌ Failed to start Enhanced Token Analysis System:', error);
    process.exit(1);
  }
}

// Start the system
main().catch(console.error);








