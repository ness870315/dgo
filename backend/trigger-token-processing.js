#!/usr/bin/env node

/**
 * TRIGGER TOKEN PROCESSING
 * Triggers the token processing system to populate the persistent cache
 */

import fetch from 'node-fetch';

const API_BASE = process.env.API_BASE_URL || 'https://api.degen-oracle.com';

async function triggerTokenProcessing() {
  console.log('🚀 TRIGGERING TOKEN PROCESSING');
  console.log('=' .repeat(60));
  
  try {
    // Check current processing status
    console.log('📊 Checking current processing status...');
    const statusResponse = await fetch(`${API_BASE}/api/processing/status`);
    const status = await statusResponse.json();
    
    console.log('Current status:', status);
    
    if (status.isProcessing) {
      console.log('⚠️ Processing is already running');
      return;
    }
    
    // Check current token count
    console.log('📊 Checking current token count...');
    const tokensResponse = await fetch(`${API_BASE}/api/tokens`);
    const tokens = await tokensResponse.json();
    console.log(`Current tokens in cache: ${tokens.length}`);
    
    if (tokens.length > 1000) {
      console.log('✅ Cache already has sufficient tokens');
      return;
    }
    
    // Start processing
    console.log('🚀 Starting token processing...');
    const startResponse = await fetch(`${API_BASE}/api/processing/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    
    const startResult = await startResponse.json();
    console.log('Start result:', startResult);
    
    if (startResult.success) {
      console.log('✅ Token processing started successfully!');
      console.log('⏳ Processing will take several minutes to complete...');
      console.log('📊 Monitor progress at: /api/processing/status');
    } else {
      console.log('❌ Failed to start processing:', startResult.message);
    }
    
  } catch (error) {
    console.error('❌ Error triggering token processing:', error.message);
  }
}

// Run the script
triggerTokenProcessing();
