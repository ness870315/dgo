import { Rettiwt, TweetFilter } from 'rettiwt-api';

/**
 * TEST SPECIFIC SEARCH METHODS
 * Find out exactly which TweetFilter parameters work and which don't
 */
async function testSearchMethods() {
  console.log('🔍 TESTING SPECIFIC RETTIWT SEARCH METHODS');
  console.log('=' .repeat(60));

  try {
    const rettiwt = new Rettiwt({
      apiKey: process.env.TWITTER_API_KEY
    });
    console.log('✅ Rettiwt initialized successfully');

    const testSymbol = 'FWOG';
    console.log(`\n🎯 Testing with symbol: ${testSymbol}`);
    console.log('-'.repeat(40));

    // Test each parameter individually
    const tests = [
      {
        name: 'Hashtags Only',
        filter: { hashtags: [testSymbol.toLowerCase()] },
        expected: 'SHOULD WORK (you said hashtags work)'
      },
      {
        name: 'Words Only',
        filter: { words: [testSymbol] },
        expected: 'MIGHT FAIL'
      },
      {
        name: 'Phrase Only',
        filter: { phrase: testSymbol },
        expected: 'MIGHT FAIL'
      },
      {
        name: 'Multiple Hashtags',
        filter: { hashtags: [testSymbol.toLowerCase(), `${testSymbol.toLowerCase()}coin`] },
        expected: 'SHOULD WORK'
      },
      {
        name: 'Mixed: Hashtags + Words',
        filter: { 
          hashtags: [testSymbol.toLowerCase()],
          words: [testSymbol]
        },
        expected: 'UNKNOWN'
      },
      {
        name: 'Cashtag as Word',
        filter: { words: [`$${testSymbol}`] },
        expected: 'MIGHT FAIL'
      }
    ];

    for (const test of tests) {
      console.log(`\n📱 ${test.name} (${test.expected}):`);
      
      try {
        const filter = new TweetFilter(test.filter);
        console.log(`   🔧 Filter: ${JSON.stringify(test.filter)}`);
        
        const results = await rettiwt.tweet.search(filter, 3);
        console.log(`   ✅ SUCCESS: ${results.list.length} tweets found`);
        
        if (results.list.length > 0) {
          const tweet = results.list[0];
          console.log(`   📝 Sample: "${tweet.fullText?.substring(0, 80)}..."`);
        }
        
      } catch (error) {
        console.log(`   ❌ FAILED: ${error.message}`);
      }
      
      // Small delay between tests
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log('\n🎯 SUMMARY:');
    console.log('   Based on results above, we can determine:');
    console.log('   • Which search parameters are allowed');
    console.log('   • Which combinations work');
    console.log('   • How to structure our main search logic');

  } catch (error) {
    console.error('❌ Test setup failed:', error);
  }
}

testSearchMethods();




