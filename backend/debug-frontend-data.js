import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function debugFrontendData() {
  console.log('🔍 Debugging Frontend Data Structure...\n');
  
  try {
    const cachePath = path.join(__dirname, 'cache', 'tokens-cache.json');
    const cacheData = await fs.readFile(cachePath, 'utf8');
    const tokens = JSON.parse(cacheData);
    
    if (!Array.isArray(tokens) || tokens.length === 0) {
      console.log('📭 No tokens found in cache');
      return;
    }
    
    console.log(`📊 Analyzing ${tokens.length} tokens for frontend data structure...\n`);
    
    // Find tokens with Twitter data
    const tokensWithTwitterData = tokens.filter(t => t.twitterData);
    const tokensWithCommunityScore = tokens.filter(t => t.communityHealthScore !== undefined);
    const tokensWithTweets = tokens.filter(t => t.twitterData?.tweets && t.twitterData.tweets.length > 0);
    
    console.log(`✅ Tokens with twitterData: ${tokensWithTwitterData.length}`);
    console.log(`✅ Tokens with communityHealthScore: ${tokensWithCommunityScore.length}`);
    console.log(`✅ Tokens with tweets: ${tokensWithTweets.length}\n`);
    
    // Sample a few tokens to show their structure
    const sampleTokens = tokens.slice(0, 3);
    
    sampleTokens.forEach((token, index) => {
      console.log(`🔍 Sample Token ${index + 1}: ${token.symbol}`);
      console.log(`   Stage: ${token.stage}`);
      console.log(`   Has twitterData: ${!!token.twitterData}`);
      console.log(`   Has communityHealthScore: ${token.communityHealthScore !== undefined}`);
      
      if (token.twitterData) {
        console.log(`   Twitter Data Structure:`);
        console.log(`     mentions: ${token.twitterData.mentions}`);
        console.log(`     mentions24h: ${token.twitterData.mentions24h}`);
        console.log(`     likes: ${token.twitterData.likes}`);
        console.log(`     retweets: ${token.twitterData.retweets}`);
        console.log(`     followers: ${token.twitterData.followers}`);
        console.log(`     tweets: ${token.twitterData.tweets ? token.twitterData.tweets.length : 0} tweets`);
        console.log(`     communityHealth: ${token.twitterData.communityHealth}`);
      }
      
      if (token.communityHealthScore !== undefined) {
        console.log(`   communityHealthScore: ${token.communityHealthScore}`);
      }
      
      // Check what the frontend expects
      console.log(`   Frontend expects:`);
      console.log(`     token.twitterData?.mentions24h: ${token.twitterData?.mentions24h || 'MISSING'}`);
      console.log(`     token.twitterData?.mentions: ${token.twitterData?.mentions || 'MISSING'}`);
      console.log(`     token.communityHealthScore: ${token.communityHealthScore || 'MISSING'}`);
      console.log(`     token.twitterData?.tweets: ${token.twitterData?.tweets ? token.twitterData.tweets.length + ' tweets' : 'MISSING'}`);
      console.log('');
    });
    
    // Check for tokens that should have Twitter data but don't
    const tokensWithoutTwitterData = tokens.filter(t => !t.twitterData && t.stage === 'completed');
    if (tokensWithoutTwitterData.length > 0) {
      console.log(`🚨 ${tokensWithoutTwitterData.length} completed tokens are missing Twitter data:`);
      tokensWithoutTwitterData.slice(0, 5).forEach(token => {
        console.log(`   ${token.symbol} (stage: ${token.stage})`);
      });
      console.log('');
    }
    
    // Check for tokens with default/empty Twitter data
    const tokensWithDefaultTwitterData = tokens.filter(t => 
      t.twitterData && 
      t.twitterData.mentions === 0 && 
      t.twitterData.mentions24h === 0 && 
      t.twitterData.likes === 0
    );
    
    if (tokensWithDefaultTwitterData.length > 0) {
      console.log(`⚠️ ${tokensWithDefaultTwitterData.length} tokens have default/empty Twitter data:`);
      tokensWithDefaultTwitterData.slice(0, 5).forEach(token => {
        console.log(`   ${token.symbol} (mentions: ${token.twitterData.mentions}, stage: ${token.stage})`);
      });
      console.log('');
    }
    
    // Check for tokens with real Twitter data
    const tokensWithRealTwitterData = tokens.filter(t => 
      t.twitterData && 
      (t.twitterData.mentions > 0 || t.twitterData.likes > 0 || t.twitterData.followers > 0)
    );
    
    if (tokensWithRealTwitterData.length > 0) {
      console.log(`✅ ${tokensWithRealTwitterData.length} tokens have real Twitter data:`);
      tokensWithRealTwitterData.slice(0, 5).forEach(token => {
        console.log(`   ${token.symbol}: ${token.twitterData.mentions} mentions, ${token.twitterData.likes} likes, ${token.twitterData.followers} followers`);
      });
      console.log('');
    }
    
    console.log('📋 Summary for Frontend Display:');
    console.log(`   Tokens ready for frontend: ${tokens.filter(t => t.stage === 'completed').length}`);
    console.log(`   Tokens with mentions data: ${tokensWithTwitterData.length}`);
    console.log(`   Tokens with community scores: ${tokensWithCommunityScore.length}`);
    console.log(`   Tokens with tweet feeds: ${tokensWithTweets.length}`);
    
    // Check if the data structure matches what TokenDetails expects
    const frontendCompatibleTokens = tokens.filter(token => {
      return token.twitterData?.mentions !== undefined && 
             token.communityHealthScore !== undefined &&
             token.twitterData?.tweets !== undefined;
    });
    
    console.log(`   Frontend-compatible tokens: ${frontendCompatibleTokens.length}/${tokens.length}`);
    
    if (frontendCompatibleTokens.length < tokens.length) {
      console.log('\n🚨 ISSUE DETECTED: Some tokens are missing data expected by the frontend!');
      console.log('   This explains why mentions, community score, and tweets are not showing in Score Cards.');
    } else {
      console.log('\n✅ All tokens have the data structure expected by the frontend.');
      console.log('   The issue might be in the frontend component or API endpoint.');
    }
    
  } catch (error) {
    console.error('❌ Error debugging frontend data:', error.message);
  }
}

// Run the debug
debugFrontendData();
