import fs from 'fs';
import axios from 'axios';

async function massRefreshJupiter() {
  try {
    console.log('🚀 Mass Jupiter Data Refresh Script');
    console.log('=====================================');
    
    // Load tokens cache
    const tokensCache = JSON.parse(fs.readFileSync('./cache/tokens-cache.json', 'utf8'));
    
    // Filter tokens that need refresh (older than 6 hours)
    const now = new Date();
    const tokensToRefresh = tokensCache.filter(token => {
      if (!token.jupiterData || !token.contractAddress) return false;
      
      if (!token.jupiterTimestamp) return true;
      
      const timestamp = new Date(token.jupiterTimestamp);
      const ageHours = (now - timestamp) / (1000 * 60 * 60);
      return ageHours > 6;
    });
    
    console.log(`📊 Total tokens needing refresh: ${tokensToRefresh.length}`);
    
    // Sort by market cap (highest first)
    const sortedTokens = tokensToRefresh.sort((a, b) => (b.jupiterData.mcap || 0) - (a.jupiterData.mcap || 0));
    
    let refreshed = 0;
    let errors = 0;
    let skipped = 0;
    const batchSize = 50; // Process 50 at a time
    
    console.log(`🎯 Processing in batches of ${batchSize} tokens...`);
    
    for (let i = 0; i < Math.min(sortedTokens.length, 100); i++) { // Limit to 100 tokens per run
      const token = sortedTokens[i];
      
      try {
        const progress = `[${i + 1}/${Math.min(sortedTokens.length, 100)}]`;
        process.stdout.write(`\r🔄 ${progress} Refreshing ${token.symbol}...`);
        
        const url = `https://lite-api.jup.ag/tokens/v2/search?query=${token.contractAddress}`;
        const response = await axios.get(url, {
          timeout: 8000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/json'
          }
        });
        
        if (response.data && response.data.length > 0) {
          const freshData = response.data[0];
          const oldMcap = token.jupiterData.mcap || 0;
          const newMcap = freshData.mcap || 0;
          
          // 🚨 QUALITY FILTER: Check if token meets quality criteria
          const hasLaunchpad = freshData.launchpad && freshData.launchpad !== '';
          const hasOrganicScore = freshData.organicScore && freshData.organicScore > 0;
          const hasGraduatedAt = freshData.graduatedAt && freshData.graduatedAt !== '';
          
          // Only update if at least ONE quality criteria is present (not all missing)
          if (!hasLaunchpad && !hasOrganicScore && !hasGraduatedAt) {
            
            // Mark token for removal by setting a flag
            const tokenIndex = tokensCache.findIndex(t => t.contractAddress === token.contractAddress);
            if (tokenIndex !== -1) {
              tokensCache[tokenIndex]._markedForRemoval = true;
              tokensCache[tokenIndex]._removalReason = 'Missing all quality criteria: launchpad, organicScore, graduatedAt';
            }
            continue;
          }
          
          
          // Update token data
          const tokenIndex = tokensCache.findIndex(t => t.contractAddress === token.contractAddress);
          if (tokenIndex !== -1) {
            tokensCache[tokenIndex].jupiterData = freshData;
            tokensCache[tokenIndex].jupiterTimestamp = new Date().toISOString();
          }
          
          refreshed++;
          
          // Log significant changes
          if (oldMcap > 0) {
            const changePercent = ((newMcap - oldMcap) / oldMcap * 100);
            if (Math.abs(changePercent) > 10) {
              console.log(`\n   📈 ${token.symbol}: ${(oldMcap/1e6).toFixed(1)}M → ${(newMcap/1e6).toFixed(1)}M (${changePercent.toFixed(1)}%)`);
            }
          }
        } else {
          errors++;
        }
        
        // Rate limiting - 1 second between requests
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        if (error.message.includes('429') || error.message.includes('rate limit')) {
          console.log(`\n⚠️ Rate limit hit at token ${i + 1}, waiting 30 seconds...`);
          await new Promise(resolve => setTimeout(resolve, 30000));
          i--; // Retry this token
          continue;
        }
        errors++;
      }
    }
    
    // 🧹 CLEANUP: Remove tokens marked for removal
    const originalCount = tokensCache.length;
    const filteredTokens = tokensCache.filter(token => !token._markedForRemoval);
    const removedCount = originalCount - filteredTokens.length;
    
    if (removedCount > 0) {
      console.log(`\n🧹 CLEANUP: Removing ${removedCount} tokens that failed quality filters`);
      tokensCache.splice(0, tokensCache.length, ...filteredTokens);
    }
    
    console.log('\n');
    
    // 🛡️ ATOMIC WRITE: Save updated cache
    if (refreshed > 0 || removedCount > 0) {
      const cachePath = './cache/tokens-cache.json';
      const tempPath = cachePath + '.tmp';
      const jsonData = JSON.stringify(tokensCache, null, 2);
      
      try {
        fs.writeFileSync(tempPath, jsonData, 'utf8');
        fs.renameSync(tempPath, cachePath);
        console.log('💾 Cache updated successfully');
      } catch (error) {
        // Cleanup temp file if it exists
        try {
          fs.unlinkSync(tempPath);
        } catch (_) {}
        throw error;
      }
    }
    
    console.log('\n📈 REFRESH SUMMARY:');
    console.log(`   ✅ Successfully refreshed: ${refreshed} tokens`);
    console.log(`   ❌ Errors: ${errors} tokens`);
    console.log(`   🧹 Removed: ${removedCount} tokens (quality filter)`);
    console.log(`   ⏳ Remaining tokens: ${tokensToRefresh.length - 100} (run again for more)`);
    
    // Show some updated high-value tokens
    console.log('\n🏆 TOP UPDATED TOKENS:');
    const updatedTokens = tokensCache
      .filter(t => t.jupiterTimestamp && new Date(t.jupiterTimestamp) > new Date(Date.now() - 3600000)) // Updated in last hour
      .sort((a, b) => (b.jupiterData.mcap || 0) - (a.jupiterData.mcap || 0))
      .slice(0, 10);
    
    updatedTokens.forEach(token => {
      console.log(`   ${token.symbol}: ${((token.jupiterData.mcap || 0) / 1e6).toFixed(1)}M mcap`);
    });
    
  } catch (error) {
    console.error('❌ Mass refresh error:', error.message);
  }
}

// Run the refresh
massRefreshJupiter();
