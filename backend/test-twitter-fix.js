import axios from 'axios';

async function testTwitterFix() {
  try {
    console.log('🔍 Testing Twitter data after fix...');

    // Make request to backend
    const response = await axios.get('http://localhost:4000/api/tokens');
    const tokens = response.data.tokens || response.data;

    if (!Array.isArray(tokens) || tokens.length === 0) {
      console.log('❌ No tokens received from backend');
      return;
    }

    // Check first few tokens for Twitter data
    const testTokens = tokens.slice(0, 3);

    for (const token of testTokens) {
      console.log(`\n📊 Token: ${token.symbol} (${token.name})`);
      console.log('📱 Twitter Data:', JSON.stringify(token.twitterData, null, 2));

      // Check if Twitter data has the expected structure
      if (token.twitterData && !token.twitterData.error) {
        console.log('✅ Twitter data found:');
        console.log(`   - Total mentions: ${token.twitterData.mentions || 'N/A'}`);
        console.log(`   - 24h mentions: ${token.twitterData.mentions24h || 'N/A'}`);
        console.log(`   - Followers: ${token.twitterData.followers || 'N/A'}`);
        console.log(`   - Recent mentions: ${token.twitterData.recentMentions?.length || 0} tweets`);

        // Show first tweet if available
        if (token.twitterData.recentMentions && token.twitterData.recentMentions.length > 0) {
          const firstTweet = token.twitterData.recentMentions[0];
          console.log('\n🐦 First Tweet:');
          console.log(`   Author: @${firstTweet.author || firstTweet.tweetBy}`);
          console.log(`   Content: ${firstTweet.text || firstTweet.fullText}`);
          console.log(`   Likes: ${firstTweet.likes || 0}`);
          console.log(`   Retweets: ${firstTweet.retweets || 0}`);
        }
      } else if (token.twitterData?.error) {
        console.log('❌ Twitter data error:', token.twitterData.error);
      } else {
        console.log('❌ No Twitter data found in token');
      }
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testTwitterFix();







