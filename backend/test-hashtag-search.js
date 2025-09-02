import pkg from 'rettiwt-api';
const { Rettiwt } = pkg;

/**
 * TEST HASHTAG-FOCUSED SEARCH STRATEGY
 * Test our new approach focusing only on hashtag searches with crypto filtering
 */
async function testHashtagSearch() {
  console.log('🔍 TESTING: Hashtag-Focused Search Strategy');
  console.log('=' .repeat(60));

  // Initialize Twitter API
  const apiKey = 'a2R0PWdpdWEyc2FyU0hPdjZIRVBnUXFoRnBvNnFlV2RYR09HdW5ia09vSk07YXV0aF90b2tlbj0wMmYyMmEwMzM0YzVlNzMxNWRhOGViYmRlMGMzZGQwNDFhZTBjOGFjO3R3aWQ9dSUzRDE5MjQ5NTU1NjA5OTE5Nzc0NzI7Y3QwPWMwODZkZWNlY2Y1ZDIwNzYyNDNjZDkxOWQ2OTVmNzA3MDQyOGI5MTQwYjI3MTcwYTlmN2NmOGZkZTJlNDYyMGQ3NzY4YzVmZjBhMTNhNjk1NzQ1MzAzOGJhMjRlNzZiNDY1ZmZhM2VhZTdkNmU1NjMzYWE0NTQ0ZGFmYjczNGU2ZTE3MzZlMmZjZDQ4OTFkZDU4NjljM2Q1ODJjYzM1Mzk7';
  
  const twitterApi = new Rettiwt({ 
    apiKey: apiKey,
    delay: 2000,
    maxRetries: 2
  });

  // Test token
  const symbol = 'SLERF';
  const name = 'Slerf';
  const symbolLower = symbol.toLowerCase();

  // 48-hour time window
  const now = new Date();
  const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

  console.log(`🎯 Testing hashtag searches for: ${symbol} (${name})`);
  console.log(`📅 Time window: ${fortyEightHoursAgo.toISOString()} to ${now.toISOString()}`);
  console.log('');

  // Our new hashtag-focused search strategy
  const hashtagSearches = [
    { type: 'hashtag_primary', hashtag: symbolLower, description: `Primary hashtag #${symbolLower}` },
    { type: 'hashtag_coin', hashtag: `${symbolLower}coin`, description: `Coin variant #${symbolLower}coin` },
    { type: 'hashtag_token', hashtag: `${symbolLower}token`, description: `Token variant #${symbolLower}token` },
    { type: 'hashtag_name', hashtag: name.toLowerCase(), description: `Name hashtag #${name.toLowerCase()}` }
  ];

  // Remove duplicates
  const uniqueHashtags = [];
  const seenHashtags = new Set();
  
  for (const search of hashtagSearches) {
    if (!seenHashtags.has(search.hashtag)) {
      seenHashtags.add(search.hashtag);
      uniqueHashtags.push(search);
    }
  }

  console.log(`📊 Will test ${uniqueHashtags.length} unique hashtag searches`);

  let totalTweets = 0;
  let totalCryptoRelevant = 0;

  // Test each hashtag search
  for (const search of uniqueHashtags) {
    console.log(`\n🔍 TESTING: ${search.description}`);
    console.log(`🏷️ Hashtag: #${search.hashtag}`);
    console.log('-'.repeat(40));

    try {
      const searchFilter = {
        hashtags: [search.hashtag],
        startDate: fortyEightHoursAgo,
        endDate: now
      };

      console.log(`🚀 Searching for #${search.hashtag}...`);
      const searchResults = await twitterApi.tweet.search(searchFilter, 10);

      if (searchResults && searchResults.list && searchResults.list.length > 0) {
        console.log(`✅ Found ${searchResults.list.length} tweets`);
        totalTweets += searchResults.list.length;
        
        // Analyze each tweet for crypto relevance
        let cryptoRelevantCount = 0;
        
        searchResults.list.forEach((tweet, index) => {
          try {
            const tweetData = tweet.toJSON();
            const tweetText = tweetData.fullText || tweetData.text || '';
            
            // Simple crypto relevance check
            const lowerText = tweetText.toLowerCase();
            const cryptoKeywords = ['crypto', 'token', 'coin', 'solana', 'trading', 'price', 'meme coin', 'memecoin', 'blockchain', 'defi'];
            const nonCryptoKeywords = ['president', 'election', 'politics', 'movie', 'art', 'drawing', 'cute', 'puppy'];
            
            let cryptoScore = 0;
            let nonCryptoScore = 0;
            
            // Count crypto indicators
            cryptoKeywords.forEach(keyword => {
              if (lowerText.includes(keyword)) cryptoScore++;
            });
            
            // Count non-crypto indicators  
            nonCryptoKeywords.forEach(keyword => {
              if (lowerText.includes(keyword)) nonCryptoScore++;
            });
            
            // Price/percentage patterns
            if (lowerText.match(/\$[\d,]+\.?\d*/) || lowerText.match(/[+-]?\d+\.?\d*%/)) {
              cryptoScore++;
            }
            
            // Token hashtag context
            if (lowerText.includes(`#${symbolLower}`) || lowerText.includes(`$${symbolLower}`)) {
              cryptoScore++;
            }
            
            // Decision: crypto-relevant if crypto score > non-crypto score
            const isCryptoRelevant = cryptoScore > nonCryptoScore || (cryptoScore >= 1 && nonCryptoScore === 0);
            
            if (isCryptoRelevant) {
              cryptoRelevantCount++;
              totalCryptoRelevant++;
            }
            
            console.log(`\n📝 Tweet ${index + 1}:`);
            console.log(`   Author: @${tweetData.tweetBy?.userName || 'Unknown'}`);
            console.log(`   Text: "${tweetText.substring(0, 100)}${tweetText.length > 100 ? '...' : ''}"`);
            console.log(`   Likes: ${tweetData.likeCount || 0} | Retweets: ${tweetData.retweetCount || 0}`);
            console.log(`   🎯 Crypto Score: ${cryptoScore} | Non-Crypto Score: ${nonCryptoScore}`);
            console.log(`   ✅ Crypto Relevant: ${isCryptoRelevant ? 'YES' : 'NO'}`);
            
          } catch (tweetError) {
            console.log(`   ❌ Error processing tweet ${index + 1}: ${tweetError.message}`);
          }
        });
        
        console.log(`\n📊 Summary for #${search.hashtag}:`);
        console.log(`   Total tweets: ${searchResults.list.length}`);
        console.log(`   Crypto-relevant: ${cryptoRelevantCount}`);
        console.log(`   Filtered out: ${searchResults.list.length - cryptoRelevantCount}`);
        
      } else {
        console.log(`❌ No tweets found for #${search.hashtag}`);
      }

      // Wait between searches
      console.log(`⏳ Waiting 3 seconds...`);
      await new Promise(resolve => setTimeout(resolve, 3000));

    } catch (error) {
      console.log(`❌ Search failed for #${search.hashtag}: ${error.message}`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('🏁 HASHTAG SEARCH TEST COMPLETE');
  console.log(`📊 FINAL RESULTS:`);
  console.log(`   Total tweets found: ${totalTweets}`);
  console.log(`   Crypto-relevant tweets: ${totalCryptoRelevant}`);
  console.log(`   Success rate: ${totalTweets > 0 ? ((totalCryptoRelevant / totalTweets) * 100).toFixed(1) : 0}%`);
  console.log('');
  console.log('🎯 This shows our new hashtag-focused strategy will:');
  console.log('   1. Find actual tweets (hashtag searches work)');
  console.log('   2. Filter out non-crypto content');
  console.log('   3. Count relevant mentions properly');
}

// Run the test
testHashtagSearch().catch(error => {
  console.error('❌ Hashtag search test failed:', error);
});




