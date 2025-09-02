import pkg from 'rettiwt-api';
const { Rettiwt, TweetSearchOptions } = pkg;

/**
 * TEST EXACT RETTIWT USAGE
 * Using the EXACT same pattern as the original CLI code:
 * new TweetSearchOptions(options).toTweetFilter()
 */
async function testExactRettiwt() {
  console.log('🔍 TESTING: EXACT Rettiwt API Usage (CLI Pattern)');
  console.log('=' .repeat(70));

  // Initialize Twitter API
  const apiKey = 'a2R0PWdpdWEyc2FyU0hPdjZIRVBnUXFoRnBvNnFlV2RYR09HdW5ia09vSk07YXV0aF90b2tlbj0wMmYyMmEwMzM0YzVlNzMxNWRhOGViYmRlMGMzZGQwNDFhZTBjOGFjO3R3aWQ9dSUzRDE5MjQ5NTU1NjA5OTE5Nzc0NzI7Y3QwPWMwODZkZWNlY2Y1ZDIwNzYyNDNjZDkxOWQ2OTVmNzA3MDQyOGI5MTQwYjI3MTcwYTlmN2NmOGZkZTJlNDYyMGQ3NzY4YzVmZjBhMTNhNjk1NzQ1MzAzOGJhMjRlNzZiNDY1ZmZhM2VhZTdkNmU1NjMzYWE0NTQ0ZGFmYjczNGU2ZTE3MzZlMmZjZDQ4OTFkZDU4NjljM2Q1ODJjYzM1Mzk7';
  
  const rettiwt = new Rettiwt({ 
    apiKey: apiKey,
    delay: 2000,
    maxRetries: 2
  });

  console.log('✅ Rettiwt API initialized');
  console.log('🎯 Using EXACT CLI pattern: new TweetSearchOptions(options).toTweetFilter()');
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

    // Define search strategies using EXACT CLI option names
    const searchStrategies = [
      {
        name: 'Words: Single Word',
        options: {
          words: symbolLower, // -w, --words
        },
        description: `--words ${symbolLower}`
      },
      {
        name: 'Words: Multiple',
        options: {
          words: `${symbolLower},crypto`, // Comma-separated as per CLI
        },
        description: `--words ${symbolLower},crypto`
      },
      {
        name: 'Phrase: Exact Match',
        options: {
          phrase: `${name} crypto`, // -p, --phrase
        },
        description: `--phrase "${name} crypto"`
      },
      {
        name: 'Hashtags: Single',
        options: {
          hashtags: symbolLower, // -h, --hashtags
        },
        description: `--hashtags ${symbolLower}`
      },
      {
        name: 'Hashtags: Multiple',
        options: {
          hashtags: `${symbolLower},crypto`, // Multiple hashtags
        },
        description: `--hashtags ${symbolLower},crypto`
      },
      {
        name: 'Optional Words',
        options: {
          optionalWords: `${symbolLower},${name},crypto,token`, // --optional-words
        },
        description: `--optional-words ${symbolLower},${name},crypto,token`
      },
      {
        name: 'Exclude Words',
        options: {
          words: symbolLower,
          excludeWords: 'politics,sports,news', // --exclude-words
        },
        description: `--words ${symbolLower} --exclude-words politics,sports,news`
      },
      {
        name: 'From Users',
        options: {
          from: 'elonmusk,VitalikButerin', // -f, --from
        },
        description: `--from elonmusk,VitalikButerin`
      },
      {
        name: 'Mentions',
        options: {
          mentions: `${symbolLower}`, // -m, --mentions
        },
        description: `--mentions ${symbolLower}`
      },
      {
        name: 'Min Likes',
        options: {
          words: symbolLower,
          minLikes: 10, // -l, --min-likes
        },
        description: `--words ${symbolLower} --min-likes 10`
      },
      {
        name: 'Top Tweets',
        options: {
          words: symbolLower,
          top: true, // --top
        },
        description: `--words ${symbolLower} --top`
      },
      {
        name: 'Only Original',
        options: {
          words: symbolLower,
          onlyOriginal: true, // --only-original
        },
        description: `--words ${symbolLower} --only-original`
      },
      {
        name: 'Time Range',
        options: {
          words: symbolLower,
          start: yesterday.toISOString(), // -s, --start
          end: now.toISOString(), // -e, --end
        },
        description: `--words ${symbolLower} --start ${yesterday.toISOString().substring(0,10)} --end ${now.toISOString().substring(0,10)}`
      }
    ];

    let tokenSuccessCount = 0;
    let tokenTweetCount = 0;

    // Test each search strategy
    for (const strategy of searchStrategies) {
      console.log(`\n🔍 ${strategy.name}`);
      console.log(`📝 CLI Equivalent: ${strategy.description}`);
      console.log(`🔧 Options Object: ${JSON.stringify(strategy.options)}`);
      console.log('-'.repeat(40));

      try {
        // Use EXACT same pattern as CLI code
        console.log(`🏗️ Creating TweetSearchOptions...`);
        const tweetSearchOptions = new TweetSearchOptions(strategy.options);
        console.log(`✅ TweetSearchOptions created`);

        console.log(`🔄 Converting to TweetFilter...`);
        const tweetFilter = tweetSearchOptions.toTweetFilter();
        console.log(`✅ TweetFilter created via toTweetFilter()`);

        // Execute search using EXACT CLI pattern
        console.log(`🚀 Executing search with converted TweetFilter...`);
        const tweets = await rettiwt.tweet.search(
          tweetFilter,
          3, // count
          undefined // cursor
        );

        if (tweets && tweets.list && tweets.list.length > 0) {
          console.log(`✅ SUCCESS: Found ${tweets.list.length} tweets`);
          tokenSuccessCount++;
          tokenTweetCount += tweets.list.length;
          totalSuccessfulSearches++;
          totalTweetsFound += tweets.list.length;
          
          // Analyze tweets
          let cryptoRelevantCount = 0;
          
          tweets.list.forEach((tweet, index) => {
            try {
              const tweetData = tweet.toJSON();
              const tweetText = tweetData.fullText || tweetData.text || '';
              
              // Enhanced crypto relevance analysis
              const lowerText = tweetText.toLowerCase();
              const cryptoKeywords = ['crypto', 'token', 'coin', 'solana', 'trading', 'price', 'meme', 'blockchain'];
              const hasCryptoTerms = cryptoKeywords.some(keyword => lowerText.includes(keyword));
              
              // Check for cashtag patterns
              const hasCashtag = /\$[A-Z]{2,10}/i.test(tweetText);
              const hasTargetCashtag = tweetText.toLowerCase().includes(`$${symbolLower}`);
              
              const isCryptoRelevant = hasCryptoTerms || hasCashtag || hasTargetCashtag;
              
              if (isCryptoRelevant) cryptoRelevantCount++;
              
              console.log(`\n   📝 Tweet ${index + 1}:`);
              console.log(`      Author: @${tweetData.tweetBy?.userName || 'Unknown'}`);
              console.log(`      Text: "${tweetText.substring(0, 100)}${tweetText.length > 100 ? '...' : ''}"`);
              console.log(`      Engagement: ${tweetData.likeCount || 0}❤️ ${tweetData.retweetCount || 0}🔄`);
              console.log(`      Created: ${tweetData.createdAt || 'Unknown'}`);
              console.log(`      Crypto-relevant: ${isCryptoRelevant ? '✅' : '❌'}`);
              
            } catch (tweetError) {
              console.log(`   ❌ Error processing tweet: ${tweetError.message}`);
            }
          });
          
          console.log(`\n   📊 Summary: ${cryptoRelevantCount}/${tweets.list.length} crypto-relevant tweets`);
          
        } else {
          console.log(`❌ No tweets found`);
          if (tweets?.error) {
            console.log(`   Error: ${tweets.error}`);
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
        
        // Show more detailed error info
        if (error.stack) {
          const stackLines = error.stack.split('\n');
          console.log(`   Stack: ${stackLines[1] || 'No stack trace'}`);
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
  console.log('🏁 EXACT RETTIWT CLI PATTERN TEST COMPLETE');
  console.log('='.repeat(70));
  
  console.log(`\n📊 OVERALL RESULTS:`);
  console.log(`   Total successful searches: ${totalSuccessfulSearches}`);
  console.log(`   Total tweets found: ${totalTweetsFound}`);
  console.log(`   Tokens tested: ${testTokens.length}`);
  
  const totalSearches = testTokens.length * 13; // 13 strategies per token
  const overallSuccessRate = ((totalSuccessfulSearches / totalSearches) * 100).toFixed(1);
  console.log(`   Overall success rate: ${overallSuccessRate}%`);

  console.log(`\n🎯 CONCLUSIONS:`);
  
  if (totalSuccessfulSearches === 0) {
    console.log('   🚨 CRITICAL: Even exact CLI pattern doesn\'t work');
  } else {
    console.log('   ✅ SUCCESS: Exact CLI pattern works!');
    console.log('   🎉 BREAKTHROUGH: new TweetSearchOptions(options).toTweetFilter() is the key!');
  }

  if (totalTweetsFound > 0) {
    console.log(`   🚀 IMPLEMENTATION: Update enhancedSocialDataService.js to use this exact pattern`);
  }

  console.log('\n💡 This uses the EXACT same code pattern as the original Rettiwt CLI');
}

// Run the exact test
testExactRettiwt().catch(error => {
  console.error('❌ Exact Rettiwt test failed:', error);
  console.error('Full error:', error.stack);
});




