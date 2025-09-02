import pkg from 'rettiwt-api';
const { Rettiwt, TweetSearchOptions } = pkg;

/**
 * TEST RETTIWT API CAPABILITIES
 * Check what search methods and filters actually work with our API key
 */
async function testRettiwtCapabilities() {
  console.log('🔍 TESTING: Rettiwt API Capabilities & Limitations');
  console.log('=' .repeat(70));

  // Initialize with our API key
  const apiKey = 'a2R0PWdpdWEyc2FyU0hPdjZIRVBnUXFoRnBvNnFlV2RYR09HdW5ia09vSk07YXV0aF90b2tlbj0wMmYyMmEwMzM0YzVlNzMxNWRhOGViYmRlMGMzZGQwNDFhZTBjOGFjO3R3aWQ9dSUzRDE5MjQ5NTU1NjA5OTE5Nzc0NzI7Y3QwPWMwODZkZWNlY2Y1ZDIwNzYyNDNjZDkxOWQ2OTVmNzA3MDQyOGI5MTQwYjI3MTcwYTlmN2NmOGZkZTJlNDYyMGQ3NzY4YzVmZjBhMTNhNjk1NzQ1MzAzOGJhMjRlNzZiNDY1ZmZhM2VhZTdkNmU1NjMzYWE0NTQ0ZGFmYjczNGU2ZTE3MzZlMmZjZDQ4OTFkZDU4NjljM2Q1ODJjYzM1Mzk7';
  
  const twitterApi = new Rettiwt({ 
    apiKey: apiKey,
    delay: 2000,
    maxRetries: 2
  });

  console.log('✅ Rettiwt API initialized');
  console.log(`🔑 API Key: ${apiKey.substring(0, 20)}...`);
  console.log('');

  // Time window for searches
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  console.log(`📅 Search window: ${yesterday.toISOString()} to ${now.toISOString()}`);
  console.log('');

  // Test different search filter combinations
  const searchTests = [
    {
      name: 'Basic Query Search',
      filter: { query: 'crypto' },
      description: 'Simple text query for "crypto"'
    },
    {
      name: 'Hashtag Search',
      filter: { hashtags: ['bitcoin'] },
      description: 'Hashtag search for #bitcoin'
    },
    {
      name: 'Query with OR operator',
      filter: { query: 'bitcoin OR ethereum' },
      description: 'Query with OR operator'
    },
    {
      name: 'Query with quotes',
      filter: { query: '"meme coin"' },
      description: 'Quoted phrase search'
    },
    {
      name: 'From user search',
      filter: { from: ['elonmusk'] },
      description: 'Tweets from specific user'
    },
    {
      name: 'Words array',
      filter: { words: ['solana'] },
      description: 'Words array filter'
    },
    {
      name: 'Combined filters',
      filter: { query: 'solana', hashtags: ['crypto'] },
      description: 'Query + hashtag combination'
    }
  ];

  let workingMethods = [];
  let failingMethods = [];

  // Test each search method
  for (const test of searchTests) {
    console.log(`\n🔍 TEST: ${test.name}`);
    console.log(`📝 Description: ${test.description}`);
    console.log(`🔧 Filter: ${JSON.stringify(test.filter)}`);
    console.log('-'.repeat(50));

    try {
      // Add time constraints
      const searchFilter = {
        ...test.filter,
        startDate: yesterday,
        endDate: now
      };

      console.log(`🚀 Executing search...`);
      const searchResults = await twitterApi.tweet.search(searchFilter, 3); // Just 3 tweets for testing

      if (searchResults && searchResults.list && searchResults.list.length > 0) {
        console.log(`✅ SUCCESS: Found ${searchResults.list.length} tweets`);
        workingMethods.push(test.name);
        
        // Show first tweet as example
        const firstTweet = searchResults.list[0].toJSON();
        const tweetText = firstTweet.fullText || firstTweet.text || '';
        console.log(`📝 Sample tweet: "${tweetText.substring(0, 80)}..."`);
        console.log(`👤 Author: @${firstTweet.tweetBy?.userName || 'Unknown'}`);
        
      } else {
        console.log(`❌ FAILED: No results returned`);
        failingMethods.push(test.name);
        
        if (searchResults?.error) {
          console.log(`   Error details: ${searchResults.error}`);
        }
      }

      // Wait between tests to avoid rate limits
      console.log(`⏳ Waiting 3 seconds...`);
      await new Promise(resolve => setTimeout(resolve, 3000));

    } catch (error) {
      console.log(`❌ FAILED: ${error.message}`);
      failingMethods.push(test.name);
      
      console.log(`   Error type: ${error.constructor.name}`);
      if (error.code) {
        console.log(`   Error code: ${error.code}`);
      }
      if (error.response?.status) {
        console.log(`   HTTP Status: ${error.response.status}`);
      }
    }
  }

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('📊 RETTIWT API CAPABILITIES SUMMARY');
  console.log('='.repeat(70));
  
  console.log(`\n✅ WORKING METHODS (${workingMethods.length}):`);
  workingMethods.forEach(method => console.log(`   - ${method}`));
  
  console.log(`\n❌ FAILING METHODS (${failingMethods.length}):`);
  failingMethods.forEach(method => console.log(`   - ${method}`));
  
  console.log('\n🎯 CONCLUSIONS:');
  if (workingMethods.length === 0) {
    console.log('   🚨 NO search methods work - API key or service issue');
  } else if (workingMethods.includes('Hashtag Search') && !workingMethods.includes('Basic Query Search')) {
    console.log('   🎯 Only hashtag searches work - API limitation confirmed');
  } else if (workingMethods.includes('Basic Query Search')) {
    console.log('   ✅ Query searches should work - investigate our implementation');
  }
  
  console.log('\n💡 RECOMMENDATIONS:');
  if (workingMethods.includes('Hashtag Search')) {
    console.log('   - Focus on hashtag-based searches');
    console.log('   - Use multiple hashtag variations per token');
  }
  if (workingMethods.includes('From user search')) {
    console.log('   - Official account searches are available');
  }
  if (workingMethods.length > 0) {
    console.log('   - Combine working methods for comprehensive coverage');
  }
}

// Run the test
testRettiwtCapabilities().catch(error => {
  console.error('❌ Rettiwt capabilities test failed:', error);
});




