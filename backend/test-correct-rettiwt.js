import pkg from 'rettiwt-api';
const { Rettiwt } = pkg;

/**
 * TEST CORRECT RETTIWT USAGE
 * Using the proper parameter structure from the original Rettiwt code
 */
async function testCorrectRettiwt() {
  console.log('🔍 TESTING: Correct Rettiwt API Usage');
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

  console.log(`🎯 Testing CORRECT Rettiwt parameters for: ${symbol} (${name})`);
  console.log(`📅 Time window: ${fortyEightHoursAgo.toISOString()} to ${now.toISOString()}`);
  console.log('');

  // Test the CORRECT Rettiwt parameter structure
  const correctSearches = [
    {
      name: 'Phrase Search - Crypto',
      filter: { phrase: `${name} crypto` },
      description: `Exact phrase "${name} crypto"`
    },
    {
      name: 'Phrase Search - Token', 
      filter: { phrase: `${name} token` },
      description: `Exact phrase "${name} token"`
    },
    {
      name: 'Words Search - Symbol',
      filter: { words: [symbolLower] },
      description: `Contains word "${symbolLower}"`
    },
    {
      name: 'Words Search - Name',
      filter: { words: [name] },
      description: `Contains word "${name}"`
    },
    {
      name: 'Words Search - Multiple',
      filter: { words: [symbolLower, 'crypto'] },
      description: `Contains words "${symbolLower}" and "crypto"`
    },
    {
      name: 'Hashtags Search',
      filter: { hashtags: [symbolLower] },
      description: `Hashtag #${symbolLower}`
    },
    {
      name: 'Combined Search',
      filter: { words: [symbolLower], hashtags: ['crypto'] },
      description: `Word "${symbolLower}" + hashtag #crypto`
    }
  ];

  let successfulSearches = [];
  let totalTweets = 0;

  // Test each correct search method
  for (const search of correctSearches) {
    console.log(`\n🔍 TESTING: ${search.name}`);
    console.log(`📝 Description: ${search.description}`);
    console.log(`🔧 Filter: ${JSON.stringify(search.filter)}`);
    console.log('-'.repeat(40));

    try {
      // Add time constraints to the filter
      const searchFilter = {
        ...search.filter,
        start: fortyEightHoursAgo.toISOString(),
        end: now.toISOString()
      };

      console.log(`🚀 Searching with correct parameters...`);
      const searchResults = await twitterApi.tweet.search(searchFilter, 5); // 5 tweets max

      if (searchResults && searchResults.list && searchResults.list.length > 0) {
        console.log(`✅ SUCCESS: Found ${searchResults.list.length} tweets`);
        successfulSearches.push(search.name);
        totalTweets += searchResults.list.length;
        
        // Show tweets found
        searchResults.list.forEach((tweet, index) => {
          try {
            const tweetData = tweet.toJSON();
            const tweetText = tweetData.fullText || tweetData.text || '';
            
            console.log(`\n📝 Tweet ${index + 1}:`);
            console.log(`   Author: @${tweetData.tweetBy?.userName || 'Unknown'}`);
            console.log(`   Text: "${tweetText.substring(0, 100)}${tweetText.length > 100 ? '...' : ''}"`);
            console.log(`   Likes: ${tweetData.likeCount || 0} | Retweets: ${tweetData.retweetCount || 0}`);
            
            // Quick crypto relevance check
            const lowerText = tweetText.toLowerCase();
            const hasCryptoTerms = lowerText.includes('crypto') || lowerText.includes('token') || 
                                 lowerText.includes('coin') || lowerText.includes('solana') ||
                                 lowerText.includes('meme') || lowerText.includes('trading');
            console.log(`   🎯 Crypto-related: ${hasCryptoTerms ? 'YES' : 'NO'}`);
            
          } catch (tweetError) {
            console.log(`   ❌ Error processing tweet ${index + 1}: ${tweetError.message}`);
          }
        });
        
      } else {
        console.log(`❌ No tweets found`);
        if (searchResults?.error) {
          console.log(`   API Error: ${searchResults.error}`);
        }
      }

      // Wait between searches
      console.log(`⏳ Waiting 3 seconds...`);
      await new Promise(resolve => setTimeout(resolve, 3000));

    } catch (error) {
      console.log(`❌ Search failed: ${error.message}`);
      if (error.response?.status) {
        console.log(`   HTTP Status: ${error.response.status}`);
      }
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('🏁 CORRECT RETTIWT USAGE TEST COMPLETE');
  console.log(`📊 RESULTS:`);
  console.log(`   Successful search methods: ${successfulSearches.length}/${correctSearches.length}`);
  console.log(`   Total tweets found: ${totalTweets}`);
  
  if (successfulSearches.length > 0) {
    console.log(`\n✅ WORKING METHODS:`);
    successfulSearches.forEach(method => console.log(`   - ${method}`));
    console.log(`\n🎯 SUCCESS! The correct Rettiwt parameters work!`);
  } else {
    console.log(`\n❌ No methods worked - there may be a deeper API issue`);
  }
  
  console.log('\n💡 This confirms whether using correct Rettiwt parameters fixes our search issues');
}

// Run the test
testCorrectRettiwt().catch(error => {
  console.error('❌ Correct Rettiwt test failed:', error);
});




