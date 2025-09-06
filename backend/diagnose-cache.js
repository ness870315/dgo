import fs from 'fs/promises';
import path from 'path';

async function diagnoseCacheState() {
  try {
    // Check both possible cache locations
    const locations = [
      '/var/data/dgo/cache/tokens-cache.json',  // Production persistent
      path.join(process.cwd(), 'backend/cache/tokens-cache.json'),  // Local fallback
      path.join(process.cwd(), 'cache/tokens-cache.json')  // Alternative local
    ];

    console.log('🔍 CACHE DIAGNOSIS REPORT');
    console.log('========================');
    console.log(`📅 Timestamp: ${new Date().toISOString()}`);
    console.log(`📂 Current working directory: ${process.cwd()}`);
    console.log(`🌍 DATA_DIR environment: ${process.env.DATA_DIR || 'NOT SET'}`);
    console.log('');

    for (const location of locations) {
      console.log(`📍 Checking: ${location}`);
      
      try {
        await fs.access(location);
        const data = await fs.readFile(location, 'utf8');
        const tokens = JSON.parse(data);
        
        console.log(`  ✅ File exists: ${tokens.length} total tokens`);
        
        // Analyze by stage
        const stages = {};
        const sources = {};
        const recent = [];
        
        tokens.forEach(token => {
          const stage = token.stage || 'undefined';
          const source = token.source || 'undefined';
          stages[stage] = (stages[stage] || 0) + 1;
          sources[source] = (sources[source] || 0) + 1;
          
          // Collect recent tokens (last 24 hours)
          const created = new Date(token.createdAt || token.lastDiscoveredAt || 0);
          const now = new Date();
          if (now - created < 24 * 60 * 60 * 1000) {
            recent.push({
              symbol: token.symbol,
              stage: token.stage,
              source: token.source,
              created: token.createdAt || token.lastDiscoveredAt
            });
          }
        });
        
        console.log(`  📊 Stages:`, stages);
        console.log(`  📊 Sources:`, sources);
        console.log(`  📊 Recent tokens (24h): ${recent.length}`);
        
        if (recent.length > 0) {
          console.log(`  🆕 Sample recent tokens:`);
          recent.slice(0, 5).forEach(t => {
            console.log(`    - ${t.symbol}: stage=${t.stage}, source=${t.source}, created=${t.created}`);
          });
        }
        
        // Check for data integrity issues
        const withoutSymbol = tokens.filter(t => !t.symbol).length;
        const withoutStage = tokens.filter(t => !t.stage).length;
        const withJupiterData = tokens.filter(t => t.jupiterData).length;
        const withTwitterData = tokens.filter(t => t.twitterData).length;
        
        console.log(`  🔍 Data integrity:`);
        console.log(`    - Missing symbol: ${withoutSymbol}`);
        console.log(`    - Missing stage: ${withoutStage}`);
        console.log(`    - With Jupiter data: ${withJupiterData}`);
        console.log(`    - With Twitter data: ${withTwitterData}`);
        
      } catch (error) {
        console.log(`  ❌ Cannot access: ${error.message}`);
      }
      
      console.log('');
    }
    
    console.log('🔍 DIAGNOSIS COMPLETE');
    console.log('====================');
    
  } catch (error) {
    console.error('❌ Diagnosis failed:', error.message);
  }
}

diagnoseCacheState();
