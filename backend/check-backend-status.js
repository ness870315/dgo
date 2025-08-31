import axios from 'axios';

async function checkBackendStatus() {
  try {
    console.log('🔍 Checking backend status and Twitter data...');

    // Check backend health
    const healthResponse = await axios.get('http://localhost:4000/health');
    console.log('✅ Backend health:', healthResponse.data);

    // Get tokens
    const tokensResponse = await axios.get('http://localhost:4000/api/tokens');
    const tokens = tokensResponse.data.tokens || tokensResponse.data;

    console.log(`📊 Received ${tokens.length} tokens from backend`);

    if (tokens.length > 0) {
      // Check first token for Twitter data
      const firstToken = tokens[0];
      console.log(`\n📱 First token: ${firstToken.symbol} (${firstToken.name})`);

      if (firstToken.twitterData) {
        console.log('✅ Twitter data found!');
        console.log(`   - Mentions: ${firstToken.twitterData.mentions || 0}`);
        console.log(`   - 24h Mentions: ${firstToken.twitterData.mentions24h || 0}`);
        console.log(`   - Recent tweets: ${firstToken.twitterData.recentMentions?.length || 0}`);

        if (firstToken.twitterData.recentMentions?.length > 0) {
          console.log('\n🐦 Sample tweet:');
          const tweet = firstToken.twitterData.recentMentions[0];
          console.log(`   Author: @${tweet.author || tweet.tweetBy}`);
          console.log(`   Content: ${tweet.text || tweet.fullText}`);
          console.log(`   Likes: ${tweet.likes || 0}`);
        }
      } else {
        console.log('❌ No Twitter data found');
      }
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkBackendStatus();



