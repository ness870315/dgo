/**
 * Debug script to check how KOLs are stored
 */

import KOLMarketLearningService from './backend/services/KOLMarketLearningService.js';

async function debugKOLStorage() {
  try {
    console.log('🔍 [DEBUG] Initializing KOL service...');
    const service = new KOLMarketLearningService();
    await service.initialize();
    
    console.log(`📊 [DEBUG] Total KOLs: ${service.kols.size}`);
    console.log('📋 [DEBUG] KOL keys and handles:');
    
    for (const [key, kol] of service.kols) {
      console.log(`  Key: "${key}" | Handle: "${kol.handle}" | Match: ${key === kol.handle}`);
    }
    
    // Test the duplicate check logic
    const testHandle = 'theunipcs';
    console.log(`\n🧪 [DEBUG] Testing duplicate check for: "${testHandle}"`);
    
    const existingKol = Array.from(service.kols.keys()).find(key => 
      key.toLowerCase() === testHandle.toLowerCase()
    );
    
    console.log(`🔍 [DEBUG] Found existing KOL: ${existingKol || 'None'}`);
    
    // Test with @ prefix
    const testHandleWithAt = '@theunipcs';
    const normalizedHandle = testHandleWithAt.startsWith('@') ? testHandleWithAt.slice(1) : testHandleWithAt;
    console.log(`🧪 [DEBUG] Testing with @ prefix: "${testHandleWithAt}" -> normalized: "${normalizedHandle}"`);
    
    const existingKolWithAt = Array.from(service.kols.keys()).find(key => 
      key.toLowerCase() === normalizedHandle.toLowerCase()
    );
    
    console.log(`🔍 [DEBUG] Found existing KOL (with @): ${existingKolWithAt || 'None'}`);
    
  } catch (error) {
    console.error('❌ [DEBUG] Error:', error.message);
  }
}

debugKOLStorage();