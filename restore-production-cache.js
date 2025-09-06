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
    
    // Split into batches to avoid payload size limits
    const batchSize = 5; // 5 tokens per batch (Render has strict limits)
    const batches = [];
    for (let i = 0; i < localTokens.length; i += batchSize) {
      batches.push(localTokens.slice(i, i + batchSize));
    }
    
    console.log(`🔄 Splitting into ${batches.length} batches of ${batchSize} tokens each...`);
    
    let totalRestored = 0;
    let totalExisting = 0;
    
    // Upload batches sequentially
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      console.log(`🚀 Uploading batch ${i + 1}/${batches.length} (${batch.length} tokens)...`);
      
      const payload = {
        tokens: batch,
        source: `local-development-backup-batch-${i + 1}`
      };
      
      try {
        const response = await axios.post(
          'https://dgo-1-kmw9.onrender.com/api/admin/cache/emergency-restore',
          payload,
          {
            headers: {
              'Content-Type': 'application/json'
            },
            timeout: 30000 // 30 second timeout per batch
          }
        );
        
        if (response.data.success) {
          console.log(`✅ Batch ${i + 1} successful: ${response.data.restored.totalTokens} total tokens in cache`);
          totalRestored += response.data.restored.restoredTokens;
          totalExisting = response.data.restored.existingKept;
        } else {
          console.error(`❌ Batch ${i + 1} failed:`, response.data.error);
        }
        
        // Small delay between batches
        if (i < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
      } catch (error) {
        console.error(`❌ Batch ${i + 1} failed:`, error.message);
        if (error.response) {
          console.error(`📊 Status: ${error.response.status}`);
        }
      }
    }
    
    console.log('');
    console.log('✅ EMERGENCY RESTORE COMPLETE!');
    console.log('===============================');
    console.log(`📊 Total tokens restored: ${totalRestored}`);
    console.log(`📊 Existing tokens kept: ${totalExisting}`);
    console.log('🎉 Production cache restored! Frontend should show tokens now.');
    
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
