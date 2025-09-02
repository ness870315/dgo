import EnhancedBackend from './enhancedBackend.js';

async function testBackendStartup() {
  try {
    console.log('Testing backend startup...');

    const backend = new EnhancedBackend();
    console.log('Backend instance created');

    await backend.initialize();
    console.log('Backend initialized');

    console.log('Test completed successfully');
  } catch (error) {
    console.error('Error during test:', error);
    console.error('Stack:', error.stack);
  }
}

testBackendStartup();





