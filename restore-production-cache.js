import fs from 'fs/promises';
import axios from 'axios';

async function emergencyRestore() {
  try {
    console.log('🚨 EMERGENCY PRODUCTION CACHE RESTORE');
    console.log('=====================================');
    
    // Load local cache
    const localCachePath = 'backend/cache/tokens-cache.json';
    console.log(`📂 Loading local cache from: ${localCachePath}`);
    
    const localData = await fs.readFile(localCachePath, 'utf8');
    const localTokens = JSON.parse(localData);
    
    console.log(`✅ Loaded ${localTokens.length} tokens from local cache`);
    console.log(`📊 Sample tokens: ${localTokens.slice(0, 3).map(t => t.symbol).join(', ')}...`);
    
    // Prepare payload
    const payload = {
      tokens: localTokens,
      source: 'local-development-backup'
    };
    
    console.log(`🚀 Uploading to production...`);
    
    // Upload to production
    const response = await axios.post(
      'https://dgo-backend.onrender.com/api/admin/cache/emergency-restore',
      payload,
      {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 60000 // 60 second timeout for large upload
      }
    );
    
    if (response.data.success) {
      console.log('✅ EMERGENCY RESTORE SUCCESSFUL!');
      console.log('================================');
      console.log(`📊 Total tokens restored: ${response.data.restored.totalTokens}`);
      console.log(`📊 From local backup: ${response.data.restored.restoredTokens}`);
      console.log(`📊 Existing kept: ${response.data.restored.existingKept}`);
      console.log(`📅 Restore timestamp: ${response.data.restored.timestamp}`);
      console.log(`💾 Backup saved to: ${response.data.restored.backupPath}`);
      console.log('');
      console.log('🎉 Production cache restored! Frontend should show tokens now.');
    } else {
      console.error('❌ Restore failed:', response.data.error);
    }
    
  } catch (error) {
    console.error('❌ Emergency restore failed:', error.message);
    
    if (error.response) {
      console.error('📊 Response status:', error.response.status);
      console.error('📊 Response data:', error.response.data);
    }
    
    if (error.code === 'ECONNREFUSED') {
      console.error('🔗 Connection refused - is the backend deployed and running?');
    }
    
    if (error.code === 'ENOTFOUND') {
      console.error('🔗 DNS error - check the backend URL');
    }
  }
}

// Run the restore
emergencyRestore();
