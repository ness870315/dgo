import pkg from 'rettiwt-api';
const { Rettiwt } = pkg;

/**
 * SIMPLE TEST: Which search types actually work?
 * Based on your observation that hashtag searches work but others don't
 */
async function testSimpleSearchTypes() {
  console.log('🔍 TESTING SIMPLE SEARCH TYPES');
  console.log('=' .repeat(50));

  try {
    const rettiwt = new Rettiwt({
      apiKey: process.env.TWITTER_API_KEY
    });
    console.log('✅ Rettiwt initialized');

    const testSymbol = 'FWOG';
    console.log(`\n🎯 Testing with: ${testSymbol}`);

    // Test 1: Hashtag search (you said this works)
    console.log('\n📱 TEST 1: Hashtag Search (should work)');
    try {
      const hashtagResults = await rettiwt.tweet.search({ 
        hashtags: [testSymbol.toLowerCase()] 
      }, 3);
      console.log(`✅ Hashtag search: ${hashtagResults.list?.length || 0} results`);
    } catch (error) {
      console.log(`❌ Hashtag search failed: ${error.message}`);
    }

    // Test 2: Words search (might fail)
    console.log('\n📝 TEST 2: Words Search (might fail)');
    try {
      const wordsResults = await rettiwt.tweet.search({ 
        words: [testSymbol] 
      }, 3);
      console.log(`✅ Words search: ${wordsResults.list?.length || 0} results`);
    } catch (error) {
      console.log(`❌ Words search failed: ${error.message}`);
    }

    // Test 3: Phrase search (might fail)
    console.log('\n💬 TEST 3: Phrase Search (might fail)');
    try {
      const phraseResults = await rettiwt.tweet.search({ 
        phrase: testSymbol 
      }, 3);
      console.log(`✅ Phrase search: ${phraseResults.list?.length || 0} results`);
    } catch (error) {
      console.log(`❌ Phrase search failed: ${error.message}`);
    }

    console.log('\n🎯 CONCLUSION:');
    console.log('If only hashtag searches work, we should update our main service');
    console.log('to use ONLY hashtag-based searches with multiple variations!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testSimpleSearchTypes();




