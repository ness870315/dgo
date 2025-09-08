#!/usr/bin/env node

// Direct file system reset of Twitter API counter (works without backend running)

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function resetTwitterCounterDirect() {
  try {
    console.log('🔄 Resetting Twitter API 15K monthly counter (direct file access)...');
    
    const usageFile = path.join(__dirname, 'cache', 'twitter-api-usage.json');
    
    // Create fresh usage data
    const freshUsage = {
      monthly: 0,
      daily: 0,
      hourly: 0,
      monthStart: new Date().toISOString().substring(0, 7), // YYYY-MM
      dayStart: new Date().toISOString().substring(0, 10),  // YYYY-MM-DD
      hourStart: new Date().toISOString().substring(0, 13)  // YYYY-MM-DDTHH
    };
    
    // Ensure cache directory exists
    const cacheDir = path.join(__dirname, 'cache');
    try {
      await fs.mkdir(cacheDir, { recursive: true });
    } catch (err) {
      // Directory already exists
    }
    
    // Write fresh usage data
    await fs.writeFile(usageFile, JSON.stringify(freshUsage, null, 2));
    
    console.log('✅ SUCCESS: Twitter API counter reset to 0/15000');
    console.log(`📊 Monthly: ${freshUsage.monthly}/15000`);
    console.log(`📅 Month start: ${freshUsage.monthStart}`);
    console.log(`📁 File: ${usageFile}`);
    
  } catch (error) {
    console.error('❌ FAILED to reset counter:', error.message);
  }
}

// Run the reset
resetTwitterCounterDirect();
