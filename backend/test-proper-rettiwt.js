import pkg from 'rettiwt-api';
const { Rettiwt, TweetFilter } = pkg;

/**
 * TEST PROPER RETTIWT USAGE
 * Using TweetFilter and proper parameter structure from original Rettiwt code
 */
async function testProperRettiwt() {
  console.log('🔍 TESTING: PROPER Rettiwt API Usage with TweetFilter');
  console.log('=' .repeat(70));

  // Initialize Twitter API
  const apiKey = 'a2R0PWdpdWEyc2FyU0hPdjZIRVBnUXFoRnBvNnFlV2RYR09HdW5ia09vSk07YXV0aF90b2tlbj0wMmYyMmEwMzM0YzVlNzMxNWRhOGViYmRlMGMzZGQwNDFhZTBjOGFjO3R3aWQ9dSUzRDE5MjQ5NTU1NjA5OTE5Nzc0NzI7Y3QwPWMwODZkZWNlY2Y1ZDIwNzYyNDNjZDkxOWQ2OTVmNzA3MDQyOGI5MTQwYjI3MTcwYTlmN2NmOGZkZTJlNDYyMGQ3NzY4YzVmZjBhMTNhNjk1NzQ1MzAzOGJhMjRlNzZiNDY1ZmZhM2VhZTdkNmU1NjMzYWE0NTQ0ZGFmYjczNGU2ZTE3MzZlMmZjZDQ4OTFkZDU4NjljM2Q1ODJjYzM1Mzk7';
  
  const rettiwt = new Rettiwt({ 
    apiKey: apiKey,
    delay: 2000,
    maxRetries: 2
  });

  console.log('✅ Rettiwt API initialized with TweetFilter support');
  console.log('');

  // Test tokens
  const testTokens = [
    { symbol: 'SLERF', name: 'Slerf' },
    { symbol: 'BITCOIN', name: 'Bitcoin' }
  ];

  // Time constraints
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  console.log(`📅 Search window: ${yesterday.toISOString()} to ${now.toISOString()}`);
  console.log('');

  let totalSuccessfulSearches = 0;
  let totalTweetsFound = 0;

  // Test each token
  for (const token of testTokens) {
    const { symbol, name } = token;
    const symbolLower = symbol.toLowerCase();

    console.log(`\n🎯 TESTING TOKEN: ${symbol} (${name})`);
    console.log('='.repeat(50));

    // Define search strategies using PROPER TweetFilter structure
    const searchStrategies = [
      {
        name: 'Words: Single Word',
        filterOptions: {
          words: symbolLower, // Comma-separated string as per CLI
        },
        description: `Words containing "${symbolLower}"`
      },
      {
        name: 'Words: Multiple Words',
        filterOptions: {
          words: `${symbolLower},crypto`, // Comma-separated
        },
        description: `Words containing "${symbolLower}" and "crypto"`
      },
      {
        name: 'Words: Token Variants',
        filterOptions: {
          words: `${symbolLower},token,coin`, // Multiple crypto terms
        },
        description: `Words containing "${symbolLower}", "token", or "coin"`
      },
      {
        name: 'Phrase: Exact Match',
        filterOptions: {
          phrase: `${name} crypto`, // Exact phrase
        },
        description: `Exact phrase "${name} crypto"`
      },
      {
        name: 'Hashtags: Primary',
        filterOptions: {
          hashtags: symbolLower, // Hashtag without #
        },
        description: `Hashtag #${symbolLower}`
      },
      {
        name: 'Hashtags: Multiple',
        filterOptions: {
          hashtags: `${symbolLower},crypto,solana`, // Multiple hashtags
        },
        description: `Hashtags #${symbolLower}, #crypto, #solana`
      },
      {
        name: 'Optional Words: Flexible',
        filterOptions: {
          optionalWords: `${symbolLower},${name},crypto,token`, // Any of these words
        },
        description: `Optional words: ${symbolLower}, ${name}, crypto, token`
      },
      {
        name: 'Combined: Words + Hashtags',
        filterOptions: {
          words: symbolLower,
          hashtags: 'crypto',
        },
        description: `Word "${symbolLower}" + hashtag #crypto`
      },
      {
        name: 'Exclude Non-Crypto',
        filterOptions: {
          words: symbolLower,
          excludeWords: 'politics,sports,movie', // Exclude non-crypto content
        },
        description: `Word "${symbolLower}" excluding politics/sports/movie`
      },
      {
        name: 'Top Tweets',
        filterOptions: {
          words: symbolLower,
          top: true, // Get top tweets instead of latest
        },
        description: `Top tweets containing "${symbolLower}"`
      }
    ];

    let tokenSuccessCount = 0;
    let tokenTweetCount = 0;

    // Test each search strategy
    for (const strategy of searchStrategies) {
      console.log(`\n🔍 ${strategy.name}`);
      console.log(`📝 ${strategy.description}`);
      console.log(`🔧 Filter Options: ${JSON.stringify(strategy.filterOptions)}`);
      console.log('-'.repeat(30));

      try {
        // Create TweetFilter with time constraints
        const filterOptions = {
          ...strategy.filterOptions,
          start: yesterday.toISOString(),
          end: now.toISOString()
        };

        console.log(`🔧 Full Filter: ${JSON.stringify(filterOptions)}`);

        // Create TweetFilter instance
        const tweetFilter = new TweetFilter(filterOptions);
        console.log(`✅ TweetFilter created successfully`);

        // Execute search using proper TweetFilter
        console.log(`🚀 Executing search with TweetFilter...`);
        const searchResults = await rettiwt.tweet.search(tweetFilter, 3); // 3 tweets max

        if (searchResults && searchResults.list && searchResults.list.length > 0) {
          console.log(`✅ SUCCESS: Found ${searchResults.list.length} tweets`);
          tokenSuccessCount++;
          tokenTweetCount += searchResults.list.length;
          totalSuccessfulSearches++;
          totalTweetsFound += searchResults.list.length;
          
          // Analyze tweets
          let cryptoRelevantCount = 0;
          
          searchResults.list.forEach((tweet, index) => {
            try {
              const tweetData = tweet.toJSON();
              const tweetText = tweetData.fullText || tweetData.text || '';
              
              // Enhanced crypto relevance analysis
              const lowerText = tweetText.toLowerCase();
              const cryptoKeywords = ['crypto', 'token', 'coin', 'solana', 'trading', 'price', 'meme', 'blockchain', 'defi'];
              const hasCryptoTerms = cryptoKeywords.some(keyword => lowerText.includes(keyword));
              
              // Check for cashtag patterns
              const hasCashtag = /\$[A-Z]{2,10}/i.test(tweetText);
              const hasTargetCashtag = tweetText.toLowerCase().includes(`$${symbolLower}`);
              
              // Check for price patterns
              const hasPricePattern = /\$[\d,]+\.?\d*/.test(tweetText) || /[+-]?\d+\.?\d*%/.test(tweetText);
              
              const isCryptoRelevant = hasCryptoTerms || hasCashtag || hasTargetCashtag || hasPricePattern;
              
              if (isCryptoRelevant) cryptoRelevantCount++;
              
              console.log(`\n   📝 Tweet ${index + 1}:`);
              console.log(`      Author: @${tweetData.tweetBy?.userName || 'Unknown'}`);
              console.log(`      Text: "${tweetText.substring(0, 100)}${tweetText.length > 100 ? '...' : ''}"`);
              console.log(`      Engagement: ${tweetData.likeCount || 0}❤️ ${tweetData.retweetCount || 0}🔄`);
              console.log(`      Created: ${tweetData.createdAt || 'Unknown'}`);
              console.log(`      Crypto-relevant: ${isCryptoRelevant ? '✅' : '❌'}`);
              
              // Show relevance reasons
              if (isCryptoRelevant) {
                const reasons = [];
                if (hasCryptoTerms) reasons.push('crypto keywords');
                if (hasCashtag) reasons.push('cashtag pattern');
                if (hasTargetCashtag) reasons.push(`$${symbolLower}`);
                if (hasPricePattern) reasons.push('price/percentage');
                console.log(`      Reasons: ${reasons.join(', ')}`);
              }
              
            } catch (tweetError) {
              console.log(`   ❌ Error processing tweet: ${tweetError.message}`);
            }
          });
          
          console.log(`\n   📊 Summary: ${cryptoRelevantCount}/${searchResults.list.length} crypto-relevant tweets`);
          
        } else {
          console.log(`❌ No tweets found`);
          if (searchResults?.error) {
            console.log(`   Error: ${searchResults.error}`);
          }
        }

        // Rate limiting delay
        await new Promise(resolve => setTimeout(resolve, 3000));

      } catch (error) {
        console.log(`❌ Search failed: ${error.message}`);
        console.log(`   Error type: ${error.constructor.name}`);
        if (error.response?.status) {
          console.log(`   HTTP Status: ${error.response.status}`);
        }
        if (error.stack) {
          console.log(`   Stack trace: ${error.stack.split('\n')[1]}`);
        }
      }
    }

    // Token summary
    console.log(`\n📊 ${symbol} SUMMARY:`);
    console.log(`   Successful searches: ${tokenSuccessCount}/${searchStrategies.length}`);
    console.log(`   Total tweets found: ${tokenTweetCount}`);
    console.log(`   Success rate: ${((tokenSuccessCount / searchStrategies.length) * 100).toFixed(1)}%`);
  }

  // Overall results
  console.log('\n' + '='.repeat(70));
  console.log('🏁 PROPER RETTIWT TWEETFILTER TEST COMPLETE');
  console.log('='.repeat(70));
  
  console.log(`\n📊 OVERALL RESULTS:`);
  console.log(`   Total successful searches: ${totalSuccessfulSearches}`);
  console.log(`   Total tweets found: ${totalTweetsFound}`);
  console.log(`   Tokens tested: ${testTokens.length}`);
  
  const totalSearches = testTokens.length * 10; // 10 strategies per token
  const overallSuccessRate = ((totalSuccessfulSearches / totalSearches) * 100).toFixed(1);
  console.log(`   Overall success rate: ${overallSuccessRate}%`);

  console.log(`\n🎯 CONCLUSIONS:`);
  
  if (totalSuccessfulSearches === 0) {
    console.log('   🚨 CRITICAL: TweetFilter approach doesn\'t work - API issue');
  } else if (totalSuccessfulSearches < 5) {
    console.log('   ⚠️ LIMITED: Only some TweetFilter methods work');
  } else {
    console.log('   ✅ SUCCESS: TweetFilter approach works!');
    console.log('   🎉 BREAKTHROUGH: We can now use proper Rettiwt API structure!');
  }

  if (totalTweetsFound > 0) {
    console.log(`   🚀 NEXT STEP: Update enhancedSocialDataService.js to use TweetFilter`);
  }

  console.log('\n💡 This test shows the correct way to use Rettiwt with TweetFilter');
}

// Run the proper test
testProperRettiwt().catch(error => {
  console.error('❌ Proper Rettiwt test failed:', error);
  console.error('Full error:', error.stack);
});




