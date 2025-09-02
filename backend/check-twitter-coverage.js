import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function checkTwitterCoverage() {
  console.log('🐦 Checking Twitter API Coverage...\n');
  
  try {
    const cachePath = path.join(__dirname, 'cache', 'tokens-cache.json');
    const cacheData = await fs.readFile(cachePath, 'utf8');
    const tokens = JSON.parse(cacheData);
    
    if (!Array.isArray(tokens) || tokens.length === 0) {
      console.log('📭 No tokens found in cache');
      return;
    }
    
    console.log(`📊 Total tokens in cache: ${tokens.length}`);
    
    // Analyze Twitter data coverage
    const tokensWithTwitterData = tokens.filter(t => t.twitterData && t.twitterData.mentions !== undefined);
    const tokensWithoutTwitterData = tokens.filter(t => !t.twitterData || t.twitterData.mentions === undefined);
    const tokensWithDefaultTwitterData = tokens.filter(t => 
      t.twitterData && 
      t.twitterData.mentions === 0 && 
      t.twitterData.mentions24h === 0 && 
      t.twitterData.likes === 0 && 
      t.twitterData.retweets === 0
    );
    const tokensWithRealTwitterData = tokens.filter(t => 
      t.twitterData && 
      (t.twitterData.mentions > 0 || t.twitterData.mentions24h > 0 || t.twitterData.likes > 0)
    );
    
    console.log(`✅ Tokens WITH Twitter data: ${tokensWithTwitterData.length}`);
    console.log(`❌ Tokens WITHOUT Twitter data: ${tokensWithoutTwitterData.length}`);
    console.log(`🔄 Tokens with DEFAULT Twitter data (all zeros): ${tokensWithDefaultTwitterData.length}`);
    console.log(`🎯 Tokens with REAL Twitter data (non-zero): ${tokensWithRealTwitterData.length}`);
    
    // Check Twitter timestamps
    const tokensWithTwitterTimestamp = tokens.filter(t => t.twitterTimestamp);
    console.log(`⏰ Tokens with Twitter timestamp: ${tokensWithTwitterTimestamp.length}`);
    
    // Show stage distribution
    const stageDistribution = {};
    tokens.forEach(token => {
      const stage = token.stage || 'unknown';
      stageDistribution[stage] = (stageDistribution[stage] || 0) + 1;
    });
    
    console.log('\n📊 Stage Distribution:');
    Object.entries(stageDistribution).forEach(([stage, count]) => {
      console.log(`   ${stage}: ${count} tokens`);
    });
    
    // Show sample tokens without Twitter data
    if (tokensWithoutTwitterData.length > 0) {
      console.log('\n⚠️ Sample tokens WITHOUT Twitter data:');
      tokensWithoutTwitterData.slice(0, 5).forEach((token, index) => {
        console.log(`   ${index + 1}. ${token.symbol} (${token.name}) - Stage: ${token.stage || 'unknown'}`);
      });
    }
    
    // Show sample tokens with real Twitter data
    if (tokensWithRealTwitterData.length > 0) {
      console.log('\n✅ Sample tokens WITH real Twitter data:');
      tokensWithRealTwitterData.slice(0, 5).forEach((token, index) => {
        const mentions = token.twitterData.mentions || 0;
        const mentions24h = token.twitterData.mentions24h || 0;
        const likes = token.twitterData.likes || 0;
        console.log(`   ${index + 1}. ${token.symbol}: ${mentions} mentions, ${mentions24h} mentions24h, ${likes} likes`);
      });
    }
    
    // Calculate coverage percentage
    const coveragePercentage = ((tokensWithTwitterData.length / tokens.length) * 100).toFixed(1);
    const realDataPercentage = ((tokensWithRealTwitterData.length / tokens.length) * 100).toFixed(1);
    
    console.log(`\n📈 Twitter Coverage Summary:`);
    console.log(`   Overall Coverage: ${coveragePercentage}% (${tokensWithTwitterData.length}/${tokens.length})`);
    console.log(`   Real Data Coverage: ${realDataPercentage}% (${tokensWithRealTwitterData.length}/${tokens.length})`);
    
    if (tokensWithoutTwitterData.length > 0) {
      console.log(`\n🚨 ISSUE DETECTED: ${tokensWithoutTwitterData.length} tokens are missing Twitter data!`);
      console.log(`   This suggests the Twitter stage is not processing all tokens.`);
    }
    
    if (tokensWithDefaultTwitterData.length > tokensWithRealTwitterData.length) {
      console.log(`\n⚠️ WARNING: More tokens have default Twitter data than real data.`);
      console.log(`   This might indicate Twitter API issues or rate limiting.`);
    }
    
  } catch (error) {
    console.error('❌ Error checking Twitter coverage:', error.message);
  }
}

// Run the check
checkTwitterCoverage();




