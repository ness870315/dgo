import pkg from 'rettiwt-api';
const { Rettiwt } = pkg;

/**
 * TEST ORIGINAL APPROACH
 * Use the exact same structure as our current code but simplified
 * to see if the issue is with the approach or something else
 */
async function testOriginalApproach() {
  console.log('🔍 TESTING ORIGINAL APPROACH - SIMPLIFIED');
  console.log('=' .repeat(60));

  try {
    // Use the NEW API key you provided
    const apiKey = "a2R0PWdpdWEyc2FyU0hPdjZIRVBnUXFoRnBvNnFlV2RYR09HdW5ia09vSk07YXV0aF90b2tlbj1iZTUxNzc1N2U1NTQ4YjcxMmRlY2ExYjVjZDdlMWEzNTUyYjc4ODNmO2N0MD1iMmI2ZGUwMGRmMjFkZDQ1ZTQwNmVlZTM3NWYxZDc2ZjM5NDNjMThkMWE2OGE4ZjgwZWFkMGIyYTBhZTJiMTFmMmFmYTFmMDc3MjE2MTI5OWVkNzgyNzA5MzEzNzMyZmYwM2UyYjQ5MThmMDMzNmExN2YyYjA4YTI2ZmYwMTdkZDgyY2E0ODM2YTc0NmIyMWM1YjVmMjU5OGY0YWE1NWMxO3R3aWQ9dSUzRDE5MjQ5NTU1NjA5OTE5Nzc0NzI7";
    
    const rettiwt = new Rettiwt({ 
      apiKey: apiKey,
      delay: 2000,
      maxRetries: 2
    });
    console.log('✅ Rettiwt initialized with NEW API key');

    const symbol = 'FWOG';
    const symbolLower = symbol.toLowerCase();
    
    // Test the EXACT search terms from our current implementation
    const searchTerms = [
      // Hashtag searches (you said these work)
      { type: 'hashtag_primary', value: `#${symbolLower}`, filter: { hashtags: [symbolLower] } },
      { type: 'hashtag_coin', value: `#${symbolLower}coin`, filter: { hashtags: [`${symbolLower}coin`] } },
      
      // Words searches (might fail)
      { type: 'words_symbol', value: `${symbolLower}`, filter: { words: [symbolLower] } },
      
      // Phrase searches (might fail)  
      { type: 'phrase_crypto', value: `"${symbol} crypto"`, filter: { phrase: `${symbol} crypto` } }
    ];

    console.log(`\n🎯 Testing with symbol: ${symbol}`);
    console.log(`📊 Will test ${searchTerms.length} search types`);

    for (const searchTerm of searchTerms) {
      console.log(`\n🔍 Testing: "${searchTerm.value}" (${searchTerm.type})`);
      console.log(`   🔧 Filter:`, JSON.stringify(searchTerm.filter));
      
      try {
        // Use the exact same search call as our current implementation
        const searchResults = await rettiwt.tweet.search(searchTerm.filter, 5);
        
        if (searchResults && searchResults.list && searchResults.list.length > 0) {
          console.log(`   ✅ SUCCESS: Found ${searchResults.list.length} tweets`);
          
          // Show first tweet
          const firstTweet = searchResults.list[0];
          const tweetData = firstTweet.toJSON();
          const tweetText = tweetData.fullText || tweetData.text || '';
          console.log(`   📝 Sample: "${tweetText.substring(0, 80)}..."`);
          
        } else {
          console.log(`   ⚠️ No results found (but no error)`);
        }
        
      } catch (error) {
        console.log(`   ❌ FAILED: ${error.message}`);
      }
      
      // Small delay between searches
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    console.log('\n🎯 ANALYSIS:');
    console.log('   • Which search types work with the NEW API key?');
    console.log('   • Is the issue with specific search parameters?');
    console.log('   • Or is it a broader API restriction?');

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testOriginalApproach();




