#!/usr/bin/env node

// Simple script to reset the Twitter API 15K monthly counter

import axios from 'axios';

async function resetTwitterCounter() {
  try {
    console.log('🔄 Resetting Twitter API 15K monthly counter...');
    
    const response = await axios.post('http://localhost:4000/api/admin/twitter/reset-counter');
    
    if (response.data.success) {
      console.log('✅ SUCCESS:', response.data.message);
      console.log('📊 Counter reset to 0/15000');
    } else {
      console.error('❌ FAILED:', response.data.error || 'Unknown error');
    }
    
  } catch (error) {
    if (error.response) {
      console.error('❌ API Error:', error.response.data.error || error.response.statusText);
    } else if (error.code === 'ECONNREFUSED') {
      console.error('❌ Connection Error: Backend not running on localhost:4000');
      console.log('💡 Make sure the backend is running first');
    } else {
      console.error('❌ Network Error:', error.message);
    }
  }
}

// Run the reset
resetTwitterCounter();
