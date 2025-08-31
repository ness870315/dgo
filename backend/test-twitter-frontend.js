import axios from 'axios';

async function testTwitterFrontend() {
  try {
    console.log('🔍 Testing Twitter data in frontend response...');

    // Make request to backend
    const response = await axios.get('http://localhost:4000/api/tokens');
    const tokens = response.data.tokens || response.data;

    if (!Array.isArray(tokens) || tokens.length === 0) {
      console.log('❌ No tokens received from backend');
      return;
    }

    // Check first token for Twitter data
    const firstToken = tokens[0];
    console.log(`\n📊 Token: ${firstToken.symbol} (${firstToken.name})`);
    console.log('📱 Twitter Data:', JSON.stringify(firstToken.twitterData, null, 2));

    // Check if Twitter data has the expected structure
    if (firstToken.twitterData) {
      console.log('✅ Twitter data found:');
      console.log(`   - Total mentions: ${firstToken.twitterData.mentions || 'N/A'}`);
      console.log(`   - 24h mentions: ${firstToken.twitterData.mentions24h || 'N/A'}`);
      console.log(`   - Followers: ${firstToken.twitterData.followers || 'N/A'}`);
      console.log(`   - Recent mentions: ${firstToken.twitterData.recentMentions?.length || 0} tweets`);

      // Show first tweet if available
      if (firstToken.twitterData.recentMentions && firstToken.twitterData.recentMentions.length > 0) {
        const firstTweet = firstToken.twitterData.recentMentions[0];
        console.log('\n🐦 First Tweet:');
        console.log(`   Author: @${firstTweet.author || firstTweet.tweetBy}`);
        console.log(`   Content: ${firstTweet.text || firstTweet.fullText}`);
        console.log(`   Likes: ${firstTweet.likes || 0}`);
        console.log(`   Retweets: ${firstTweet.retweets || 0}`);
      }
    } else {
      console.log('❌ No Twitter data found in token');
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testTwitterFrontend();
