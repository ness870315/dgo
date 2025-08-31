import fs from 'fs/promises';
import path from 'path';

async function checkPenguScore() {
  try {
    console.log('🔍 Checking PENGU Community Score...\n');
    
    // Check Twitter metrics
    const twitterPath = path.join(process.cwd(), 'cache', 'twitter_metrics.json');
    const twitterData = JSON.parse(await fs.readFile(twitterPath, 'utf8'));
    
    // Find PENGU in Twitter data
    let penguTwitter = null;
    if (Array.isArray(twitterData)) {
      penguTwitter = twitterData.find(t => t.symbol === 'PENGU');
    } else if (twitterData.PENGU) {
      penguTwitter = twitterData.PENGU;
    } else {
      // Check if it's an object with symbol keys
      penguTwitter = Object.values(twitterData).find(t => t.symbol === 'PENGU');
    }
    
    if (penguTwitter) {
      console.log('🐧 PENGU Twitter Data Found:');
      console.log('- Symbol:', penguTwitter.symbol);
      console.log('- Mentions:', penguTwitter.mentions);
      console.log('- Community Score:', penguTwitter.communityScore);
      console.log('- Community Health Score:', penguTwitter.communityHealthScore);
      
      if (penguTwitter.tweets) {
        console.log('- Tweets Count:', penguTwitter.tweets.length);
        console.log('- Sample Tweet:', penguTwitter.tweets[0]?.text?.substring(0, 100) + '...');
      }
      
      if (penguTwitter.engagement) {
        console.log('- Engagement:', JSON.stringify(penguTwitter.engagement, null, 2));
      }
      
      console.log('\n📊 Full PENGU Twitter Object:');
      console.log(JSON.stringify(penguTwitter, null, 2));
    } else {
      console.log('❌ PENGU not found in Twitter data');
      console.log('Available symbols:', Object.keys(twitterData).slice(0, 10));
    }
    
    // Check main tokens cache
    const tokensPath = path.join(process.cwd(), 'cache', 'tokens-cache.json');
    const tokensData = JSON.parse(await fs.readFile(tokensPath, 'utf8'));
    const penguToken = tokensData.find(t => t.symbol === 'PENGU');
    
    if (penguToken) {
      console.log('\n🎯 PENGU in Main Cache:');
      console.log('- Symbol:', penguToken.symbol);
      console.log('- Name:', penguToken.name);
      console.log('- Mentions:', penguToken.mentions);
      console.log('- Community Score:', penguToken.communityScore);
      console.log('- Community Health Score:', penguToken.communityHealthScore);
      console.log('- Has Twitter Data:', !!penguToken.twitterData);
    }
    
  } catch (error) {
    console.error('❌ Error checking PENGU score:', error.message);
  }
}

checkPenguScore();
