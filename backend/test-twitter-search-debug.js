import pkg from 'rettiwt-api';
const { Rettiwt } = pkg;

/**
 * DEBUG TWITTER SEARCH - NO FILTERS
 * This will show us exactly what tweets we get for different search types
 */
async function debugTwitterSearch() {
  console.log('🔍 DEBUG: Testing Twitter Search WITHOUT Filters');
  console.log('=' .repeat(60));

  // Initialize Twitter API
  const apiKey = 'a2R0PWdpdWEyc2FyU0hPdjZIRVBnUXFoRnBvNnFlV2RYR09HdW5ia09vSk07YXV0aF90b2tlbj0wMmYyMmEwMzM0YzVlNzMxNWRhOGViYmRlMGMzZGQwNDFhZTBjOGFjO3R3aWQ9dSUzRDE5MjQ5NTU1NjA5OTE5Nzc0NzI7Y3QwPWMwODZkZWNlY2Y1ZDIwNzYyNDNjZDkxOWQ2OTVmNzA3MDQyOGI5MTQwYjI3MTcwYTlmN2NmOGZkZTJlNDYyMGQ3NzY4YzVmZjBhMTNhNjk1NzQ1MzAzOGJhMjRlNzZiNDY1ZmZhM2VhZTdkNmU1NjMzYWE0NTQ0ZGFmYjczNGU2ZTE3MzZlMmZjZDQ4OTFkZDU4NjljM2Q1ODJjYzM1Mzk7';
  
  const twitterApi = new Rettiwt({ 
    apiKey: apiKey,
    delay: 2000,
    maxRetries: 2
  });

  // Test token - let's use SLERF since we know it had issues
  const symbol = 'SLERF';
  const name = 'Slerf';
  const symbolLower = symbol.toLowerCase();

  // 48-hour time window
  const now = new Date();
  const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

  console.log(`🎯 Testing searches for: ${symbol} (${name})`);
  console.log(`📅 Time window: ${fortyEightHoursAgo.toISOString()} to ${now.toISOString()}`);
  console.log('');

  // Define all search types we want to test
  const searchTests = [
    {
      name: 'Name + Crypto',
      filter: { query: `${name} crypto OR ${name} token OR ${name} coin` },
      description: 'Search for "Slerf crypto OR Slerf token OR Slerf coin"'
    },
    {
      name: 'Symbol + Crypto', 
      filter: { query: `${symbolLower} crypto OR ${symbolLower} token OR ${symbolLower} coin` },
      description: 'Search for "slerf crypto OR slerf token OR slerf coin"'
    },
    {
      name: 'Hashtag',
      filter: { hashtags: [symbolLower] },
      description: 'Search for #slerf hashtag'
    },
    {
      name: 'Symbol + Solana',
      filter: { query: `${symbolLower} solana OR ${symbolLower} SOL` },
      description: 'Search for "slerf solana OR slerf SOL"'
    },
    {
      name: 'Name + Solana',
      filter: { query: `${name} solana OR ${name} SOL` },
      description: 'Search for "Slerf solana OR Slerf SOL"'
    },
    {
      name: 'Just Symbol',
      filter: { query: symbolLower },
      description: 'Search for just "slerf"'
    },
    {
      name: 'Just Name',
      filter: { query: name },
      description: 'Search for just "Slerf"'
    }
  ];

  // Test each search type
  for (const test of searchTests) {
    console.log(`\n🔍 TEST: ${test.name}`);
    console.log(`📝 Description: ${test.description}`);
    console.log(`🔧 Filter: ${JSON.stringify(test.filter)}`);
    console.log('-'.repeat(50));

    try {
      // Add time window to filter
      const searchFilter = {
        ...test.filter,
        startDate: fortyEightHoursAgo,
        endDate: now
      };

      console.log(`🚀 Executing search...`);
      const searchResults = await twitterApi.tweet.search(searchFilter, 10); // Limit to 10 tweets per test

      if (searchResults && searchResults.list && searchResults.list.length > 0) {
        console.log(`✅ Found ${searchResults.list.length} tweets`);
        
        // Show each tweet
        searchResults.list.forEach((tweet, index) => {
          try {
            const tweetData = tweet.toJSON();
            const tweetText = tweetData.fullText || tweetData.text || '';
            
            console.log(`\n📝 Tweet ${index + 1}:`);
            console.log(`   Author: @${tweetData.tweetBy?.userName || 'Unknown'}`);
            console.log(`   Text: "${tweetText}"`);
            console.log(`   Likes: ${tweetData.likeCount || 0}`);
            console.log(`   Retweets: ${tweetData.retweetCount || 0}`);
            console.log(`   Created: ${tweetData.createdAt || 'Unknown'}`);
            
            // Quick crypto relevance check (manual)
            const lowerText = tweetText.toLowerCase();
            const hasCryptoWords = lowerText.includes('crypto') || lowerText.includes('token') || 
                                 lowerText.includes('coin') || lowerText.includes('solana') ||
                                 lowerText.includes('trading') || lowerText.includes('price') ||
                                 lowerText.includes('$') || lowerText.includes('%');
            
            console.log(`   🎯 Likely Crypto-Related: ${hasCryptoWords ? 'YES' : 'NO'}`);
            
          } catch (tweetError) {
            console.log(`   ❌ Error processing tweet ${index + 1}: ${tweetError.message}`);
          }
        });
        
      } else {
        console.log(`❌ No tweets found`);
        if (searchResults?.error) {
          console.log(`   Error: ${searchResults.error}`);
        }
      }

      // Wait between searches to avoid rate limits
      console.log(`⏳ Waiting 5 seconds before next search...`);
      await new Promise(resolve => setTimeout(resolve, 5000));

    } catch (error) {
      console.log(`❌ Search failed: ${error.message}`);
      console.log(`   Error type: ${error.constructor.name}`);
      if (error.code) {
        console.log(`   Error code: ${error.code}`);
      }
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('🏁 DEBUG COMPLETE');
  console.log('📊 Summary: Review the results above to see:');
  console.log('   1. Which search types return results');
  console.log('   2. What kind of tweets we\'re getting');
  console.log('   3. Which ones are actually crypto-related');
  console.log('   4. What filters we need to build');
}

// Run the debug test
debugTwitterSearch().catch(error => {
  console.error('❌ Debug test failed:', error);
});




