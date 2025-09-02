import { Rettiwt, TweetFilter } from 'rettiwt-api';

/**
 * WORKING RETTIWT TEST - Using TweetFilter directly
 * Based on the actual package exports we discovered
 */
async function testWorkingRettiwt() {
  console.log('🎯 WORKING RETTIWT TEST - Using TweetFilter Directly');
  console.log('=' .repeat(60));

  try {
    // Initialize Rettiwt
    const rettiwt = new Rettiwt({
      apiKey: process.env.TWITTER_API_KEY
    });
    console.log('✅ Rettiwt initialized successfully');

    // Test tokens
    const testTokens = ['FWOG', 'SLERF', 'NUB'];

    for (const symbol of testTokens) {
      console.log(`\n🔍 Testing searches for ${symbol}:`);
      console.log('-'.repeat(40));

      // Test 1: Direct TweetFilter with hashtags
      try {
        console.log(`📱 Test 1: Hashtag search (#${symbol.toLowerCase()})`);
        const hashtagFilter = new TweetFilter({
          hashtags: [symbol.toLowerCase()]
        });
        
        const hashtagResults = await rettiwt.tweet.search(hashtagFilter, 5);
        console.log(`   ✅ Hashtag results: ${hashtagResults.list.length} tweets`);
        
        if (hashtagResults.list.length > 0) {
          const tweet = hashtagResults.list[0];
          console.log(`   📝 Sample: "${tweet.fullText?.substring(0, 100)}..."`);
        }
      } catch (error) {
        console.log(`   ❌ Hashtag search failed: ${error.message}`);
      }

      // Test 2: Direct TweetFilter with words
      try {
        console.log(`📝 Test 2: Words search (${symbol})`);
        const wordsFilter = new TweetFilter({
          words: [symbol]
        });
        
        const wordsResults = await rettiwt.tweet.search(wordsFilter, 5);
        console.log(`   ✅ Words results: ${wordsResults.list.length} tweets`);
        
        if (wordsResults.list.length > 0) {
          const tweet = wordsResults.list[0];
          console.log(`   📝 Sample: "${tweet.fullText?.substring(0, 100)}..."`);
        }
      } catch (error) {
        console.log(`   ❌ Words search failed: ${error.message}`);
      }

      // Test 3: Direct TweetFilter with phrase
      try {
        console.log(`💬 Test 3: Phrase search ("${symbol}")`);
        const phraseFilter = new TweetFilter({
          phrase: symbol
        });
        
        const phraseResults = await rettiwt.tweet.search(phraseFilter, 5);
        console.log(`   ✅ Phrase results: ${phraseResults.list.length} tweets`);
        
        if (phraseResults.list.length > 0) {
          const tweet = phraseResults.list[0];
          console.log(`   📝 Sample: "${tweet.fullText?.substring(0, 100)}..."`);
        }
      } catch (error) {
        console.log(`   ❌ Phrase search failed: ${error.message}`);
      }

      // Test 4: Cashtag search (if supported)
      try {
        console.log(`💰 Test 4: Cashtag search ($${symbol})`);
        const cashtagFilter = new TweetFilter({
          words: [`$${symbol}`]
        });
        
        const cashtagResults = await rettiwt.tweet.search(cashtagFilter, 5);
        console.log(`   ✅ Cashtag results: ${cashtagResults.list.length} tweets`);
        
        if (cashtagResults.list.length > 0) {
          const tweet = cashtagResults.list[0];
          console.log(`   📝 Sample: "${tweet.fullText?.substring(0, 100)}..."`);
        }
      } catch (error) {
        console.log(`   ❌ Cashtag search failed: ${error.message}`);
      }

      // Small delay between tokens
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log('\n🎉 TEST COMPLETE!');
    console.log('💡 Now we know which search methods work and can update our main code!');

  } catch (error) {
    console.error('❌ Test failed:', error);
    console.error('Stack:', error.stack);
  }
}

testWorkingRettiwt();




