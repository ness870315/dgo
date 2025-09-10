#!/usr/bin/env node

/**
 * CHECK CACHE STATUS
 * Check the current status of the token cache and processing
 */

import fetch from 'node-fetch';
import fs from 'fs/promises';
import path from 'path';

const API_BASE = process.env.API_BASE_URL || 'https://api.degen-oracle.com';

async function checkCacheStatus() {
  console.log('🔍 CHECKING CACHE STATUS');
  console.log('=' .repeat(60));
  
  try {
    // Check API status
    console.log('📊 Checking API status...');
    const statusResponse = await fetch(`${API_BASE}/api/status`);
    const status = await statusResponse.json();
    
    console.log('API Status:', {
      success: status.success,
      tokenCount: status.tokenCount,
      processing: status.processing
    });
    
    // Check processing status
    console.log('📊 Checking processing status...');
    const processingResponse = await fetch(`${API_BASE}/api/processing/status`);
    const processing = await processingResponse.json();
    
    console.log('Processing Status:', processing);
    
    // Check tokens endpoint
    console.log('📊 Checking tokens endpoint...');
    const tokensResponse = await fetch(`${API_BASE}/api/tokens`);
    const tokens = await tokensResponse.json();
    
    console.log(`Tokens available via API: ${tokens.length}`);
    
    if (tokens.length < 100) {
      console.log('⚠️ WARNING: Very few tokens in cache!');
      console.log('🔧 SOLUTION: Run the token processing system');
      console.log('');
      console.log('To fix this, run:');
      console.log('1. node trigger-token-processing.js');
      console.log('2. Or manually call: POST /api/processing/start');
      console.log('3. Or force refresh: POST /api/processing/refresh');
    } else if (tokens.length < 1000) {
      console.log('⚠️ WARNING: Cache has some tokens but may be incomplete');
      console.log('💡 SUGGESTION: Consider running a full refresh');
    } else {
      console.log('✅ Cache appears to have sufficient tokens');
    }
    
    // Check local cache file if it exists
    try {
      const localCachePath = './cache/tokens-cache.json';
      const localData = await fs.readFile(localCachePath, 'utf8');
      const localTokens = JSON.parse(localData);
      console.log(`Local cache file has: ${localTokens.length} tokens`);
    } catch (error) {
      console.log('Local cache file not found or inaccessible');
    }
    
  } catch (error) {
    console.error('❌ Error checking cache status:', error.message);
  }
}

// Run the script
checkCacheStatus();
