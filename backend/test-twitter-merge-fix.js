import axios from 'axios';

async function testTwitterMergeFix() {
  try {
    console.log('🔍 Testing Twitter data merge fix...');

    // Make request to backend API
    const response = await axios.get('http://localhost:4000/api/tokens');
    const tokens = response.data.tokens || response.data;

    if (!Array.isArray(tokens) || tokens.length === 0) {
      console.log('❌ No tokens received from backend');
      return;
    }

    console.log(`📊 Received ${tokens.length} tokens from backend`);

    // Check first few tokens for Twitter data
    const testTokens = tokens.slice(0, 5);
    let tokensWithTwitter = 0;

    for (const token of testTokens) {
      console.log(`\n📊 Token: ${token.symbol} (${token.name})`);
      
      if (token.twitterData) {
        tokensWithTwitter++;
        console.log('✅ Twitter data found:');
        console.log(`   - Mentions: ${token.mentions || 0}`);
        console.log(`   - 24h Mentions: ${token.mentions24h || 0}`);
        console.log(`   - Community Score: ${token.communityScore || 0}`);
        console.log(`   - Tweets: ${token.tweets?.length || 0}`);
        console.log(`   - Followers: ${token.twitterData.followers || 0}`);

        // Show first tweet if available
        if (token.tweets && token.tweets.length > 0) {
          const firstTweet = token.tweets[0];
          console.log('\n🐦 First Tweet:');
          console.log(`   Author: @${firstTweet.author}`);
          console.log(`   Content: ${firstTweet.text.substring(0, 100)}...`);
          console.log(`   Likes: ${firstTweet.likes || 0}`);
        }
      } else {
        console.log('❌ No Twitter data found');
        console.log(`   - Mentions: ${token.mentions || 0}`);
        console.log(`   - Community Score: ${token.communityScore || 0}`);
      }
    }

    console.log(`\n📈 Summary: ${tokensWithTwitter}/${testTokens.length} tokens have Twitter data`);

    // Test PENGU specifically
    const penguToken = tokens.find(t => t.symbol === 'PENGU');
    if (penguToken) {
      console.log('\n🐧 PENGU Token Test:');
      console.log(`   - Has twitterData: ${!!penguToken.twitterData}`);
      console.log(`   - Mentions: ${penguToken.mentions || 0}`);
      console.log(`   - Community Score: ${penguToken.communityScore || 0}`);
      console.log(`   - Tweets: ${penguToken.tweets?.length || 0}`);
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testTwitterMergeFix();
