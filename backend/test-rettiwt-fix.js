import pkg from 'rettiwt-api';
const { Rettiwt } = pkg;

/**
 * COMPREHENSIVE TEST: Rettiwt Parameter Fix
 * Test if using correct parameter structure fixes our Twitter search issues
 */
async function testRettiwtFix() {
  console.log('🔍 TESTING: Rettiwt Parameter Structure Fix');
  console.log('=' .repeat(70));

  // Initialize Twitter API
  const apiKey = 'a2R0PWdpdWEyc2FyU0hPdjZIRVBnUXFoRnBvNnFlV2RYR09HdW5ia09vSk07YXV0aF90b2tlbj0wMmYyMmEwMzM0YzVlNzMxNWRhOGViYmRlMGMzZGQwNDFhZTBjOGFjO3R3aWQ9dSUzRDE5MjQ5NTU1NjA5OTE5Nzc0NzI7Y3QwPWMwODZkZWNlY2Y1ZDIwNzYyNDNjZDkxOWQ2OTVmNzA3MDQyOGI5MTQwYjI3MTcwYTlmN2NmOGZkZTJlNDYyMGQ3NzY4YzVmZjBhMTNhNjk1NzQ1MzAzOGJhMjRlNzZiNDY1ZmZhM2VhZTdkNmU1NjMzYWE0NTQ0ZGFmYjczNGU2ZTE3MzZlMmZjZDQ4OTFkZDU4NjljM2Q1ODJjYzM1Mzk7';
  
  const twitterApi = new Rettiwt({ 
    apiKey: apiKey,
    delay: 2000,
    maxRetries: 2
  });

  console.log('✅ Rettiwt API initialized');
  console.log('');

  // Test tokens - let's test multiple tokens to be thorough
  const testTokens = [
    { symbol: 'SLERF', name: 'Slerf' },
    { symbol: 'FWOG', name: 'Fwog' },
    { symbol: 'BITCOIN', name: 'Bitcoin' } // Known active token for comparison
  ];

  // 48-hour time window
  const now = new Date();
  const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

  console.log(`📅 Search window: ${fortyEightHoursAgo.toISOString()} to ${now.toISOString()}`);
  console.log('');

  let totalSuccessfulSearches = 0;
  let totalTweetsFound = 0;

  // Test each token
  for (const token of testTokens) {
    const { symbol, name } = token;
    const symbolLower = symbol.toLowerCase();

    console.log(`\n🎯 TESTING TOKEN: ${symbol} (${name})`);
    console.log('='.repeat(50));

    // Define search strategies using CORRECT Rettiwt parameters
    const searchStrategies = [
      {
        name: 'Phrase: Name + Crypto',
        filter: { phrase: `${name} crypto` },
        description: `Exact phrase "${name} crypto"`
      },
      {
        name: 'Phrase: Name + Token',
        filter: { phrase: `${name} token` },
        description: `Exact phrase "${name} token"`
      },
      {
        name: 'Phrase: Name + Solana',
        filter: { phrase: `${name} solana` },
        description: `Exact phrase "${name} solana"`
      },
      {
        name: 'Words: Symbol Only',
        filter: { words: [symbolLower] },
        description: `Contains word "${symbolLower}"`
      },
      {
        name: 'Words: Name Only',
        filter: { words: [name] },
        description: `Contains word "${name}"`
      },
      {
        name: 'Words: Symbol + Crypto',
        filter: { words: [symbolLower, 'crypto'] },
        description: `Contains "${symbolLower}" AND "crypto"`
      },
      {
        name: 'Hashtag: Primary',
        filter: { hashtags: [symbolLower] },
        description: `Hashtag #${symbolLower}`
      },
      {
        name: 'Hashtag: Coin Variant',
        filter: { hashtags: [`${symbolLower}coin`] },
        description: `Hashtag #${symbolLower}coin`
      },
      {
        name: 'Cashtag: Phrase Search',
        filter: { phrase: `$${symbol}` },
        description: `Exact phrase "$${symbol}"`
      },
      {
        name: 'Cashtag: Words Search',
        filter: { words: [`$${symbol}`] },
        description: `Contains word "$${symbol}"`
      },
      {
        name: 'Cashtag: Words Lowercase',
        filter: { words: [`$${symbolLower}`] },
        description: `Contains word "$${symbolLower}"`
      },
      {
        name: 'Cashtag + Crypto Words',
        filter: { words: [`$${symbolLower}`, 'crypto'] },
        description: `Contains "$${symbolLower}" AND "crypto"`
      },
      {
        name: 'Cashtag + Solana Words',
        filter: { words: [`$${symbolLower}`, 'solana'] },
        description: `Contains "$${symbolLower}" AND "solana"`
      }
    ];

    let tokenSuccessCount = 0;
    let tokenTweetCount = 0;

    // Test each search strategy for this token
    for (const strategy of searchStrategies) {
      console.log(`\n🔍 ${strategy.name}`);
      console.log(`📝 ${strategy.description}`);
      console.log(`🔧 Filter: ${JSON.stringify(strategy.filter)}`);
      console.log('-'.repeat(30));

      try {
        // Add time constraints
        const searchFilter = {
          ...strategy.filter,
          start: fortyEightHoursAgo.toISOString(),
          end: now.toISOString()
        };

        console.log(`🚀 Executing search...`);
        const searchResults = await twitterApi.tweet.search(searchFilter, 3); // Limit to 3 tweets

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
              
              // Enhanced crypto relevance analysis (including cashtags)
              const lowerText = tweetText.toLowerCase();
              const cryptoKeywords = ['crypto', 'token', 'coin', 'solana', 'trading', 'price', 'meme', 'blockchain', 'defi', 'pump', 'moon'];
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
              console.log(`      Text: "${tweetText.substring(0, 80)}${tweetText.length > 80 ? '...' : ''}"`);
              console.log(`      Engagement: ${tweetData.likeCount || 0}❤️ ${tweetData.retweetCount || 0}🔄`);
              console.log(`      Crypto-relevant: ${isCryptoRelevant ? '✅' : '❌'}`);
              
              // Show what made it crypto-relevant
              if (isCryptoRelevant) {
                const reasons = [];
                if (hasCryptoTerms) reasons.push('crypto keywords');
                if (hasCashtag) reasons.push('cashtag pattern');
                if (hasTargetCashtag) reasons.push(`target cashtag $${symbolLower}`);
                if (hasPricePattern) reasons.push('price pattern');
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
        await new Promise(resolve => setTimeout(resolve, 2000));

      } catch (error) {
        console.log(`❌ Search failed: ${error.message}`);
        if (error.response?.status) {
          console.log(`   HTTP Status: ${error.response.status}`);
        }
        if (error.code) {
          console.log(`   Error Code: ${error.code}`);
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
  console.log('🏁 RETTIWT PARAMETER FIX TEST COMPLETE');
  console.log('='.repeat(70));
  
  console.log(`\n📊 OVERALL RESULTS:`);
  console.log(`   Total successful searches: ${totalSuccessfulSearches}`);
  console.log(`   Total tweets found: ${totalTweetsFound}`);
  console.log(`   Tokens tested: ${testTokens.length}`);
  
  const totalSearches = testTokens.length * 13; // 13 strategies per token (8 original + 5 cashtag)
  const overallSuccessRate = ((totalSuccessfulSearches / totalSearches) * 100).toFixed(1);
  console.log(`   Overall success rate: ${overallSuccessRate}%`);

  console.log(`\n🎯 CONCLUSIONS:`);
  
  if (totalSuccessfulSearches === 0) {
    console.log('   🚨 CRITICAL: No search methods work - deeper API issue');
    console.log('   💡 Recommendation: Check API key, network, or service status');
  } else if (totalSuccessfulSearches < 5) {
    console.log('   ⚠️ LIMITED: Only some search methods work');
    console.log('   💡 Recommendation: Use only working methods in production');
  } else {
    console.log('   ✅ SUCCESS: Multiple search methods work!');
    console.log('   💡 Recommendation: Implement all working methods for comprehensive coverage');
  }

  if (totalTweetsFound > 0) {
    console.log(`   🎉 FIXED: We can now find tweets using correct Rettiwt parameters!`);
    console.log(`   🚀 Next step: Update the main service to use working search methods`);
  } else {
    console.log(`   ❌ ISSUE: Still no tweets found - investigate further`);
  }

  console.log('\n💡 Use these results to update enhancedSocialDataService.js with working search methods');
}

// Run the comprehensive test
testRettiwtFix().catch(error => {
  console.error('❌ Rettiwt fix test failed:', error);
  console.error('Stack trace:', error.stack);
});
