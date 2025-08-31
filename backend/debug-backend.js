import axios from 'axios';

async function debugBackend() {
  try {
    console.log('🔍 Debugging backend status...');

    // Try to get the backend status
    const response = await axios.get('http://localhost:4000/api/tokens', {
      timeout: 5000
    });

    console.log('✅ Backend is responding');
    console.log('📊 Response status:', response.status);
    console.log('📊 Response data type:', typeof response.data);
    console.log('📊 Response data keys:', Object.keys(response.data || {}));

    if (response.data && response.data.tokens) {
      console.log('📊 Tokens count:', response.data.tokens.length);
    } else if (Array.isArray(response.data)) {
      console.log('📊 Direct tokens array length:', response.data.length);
    } else {
      console.log('📊 Response data:', JSON.stringify(response.data, null, 2));
    }

  } catch (error) {
    console.error('❌ Backend debug failed:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.log('🔄 Backend might not be running on port 4000');
    }
  }
}

debugBackend();



