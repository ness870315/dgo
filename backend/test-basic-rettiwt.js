import pkg from 'rettiwt-api';
const { Rettiwt, TweetSearchOptions } = pkg;

/**
 * BASIC RETTIWT TEST
 * Test the most basic functionality to see what's wrong
 */
async function testBasicRettiwt() {
  console.log('🔍 BASIC RETTIWT TEST - Debugging Fundamental Issues');
  console.log('=' .repeat(60));

  const apiKey = 'a2R0PWdpdWEyc2FyU0hPdjZIRVBnUXFoRnBvNnFlV2RYR09HdW5ia09vSk07YXV0aF90b2tlbj0wMmYyMmEwMzM0YzVlNzMxNWRhOGViYmRlMGMzZGQwNDFhZTBjOGFjO3R3aWQ9dSUzRDE5MjQ5NTU1NjA5OTE5Nzc0NzI7Y3QwPWMwODZkZWNlY2Y1ZDIwNzYyNDNjZDkxOWQ2OTVmNzA3MDQyOGI5MTQwYjI3MTcwYTlmN2NmOGZkZTJlNDYyMGQ3NzY4YzVmZjBhMTNhNjk1NzQ1MzAzOGJhMjRlNzZiNDY1ZmZhM2VhZTdkNmU1NjMzYWE0NTQ0ZGFmYjczNGU2ZTE3MzZlMmZjZDQ4OTFkZDU4NjljM2Q1ODJjYzM1Mzk7';
  
  console.log('🔑 API Key Analysis:');
  console.log(`   Length: ${apiKey.length} characters`);
  console.log(`   Preview: ${apiKey.substring(0, 30)}...`);
  
  // Try to decode the API key
  try {
    const decoded = Buffer.from(apiKey, 'base64').toString('utf-8');
    console.log(`   Decoded preview: ${decoded.substring(0, 50)}...`);
    console.log(`   Contains auth_token: ${decoded.includes('auth_token')}`);
    console.log(`   Contains ct0: ${decoded.includes('ct0')}`);
  } catch (error) {
    console.log(`   ❌ Could not decode API key: ${error.message}`);
  }

  console.log('\n🏗️ Initializing Rettiwt...');
  
  try {
    const rettiwt = new Rettiwt({ 
      apiKey: apiKey,
      delay: 1000,
      maxRetries: 1
    });
    console.log('✅ Rettiwt instance created successfully');
  } catch (error) {
    console.log(`❌ Failed to create Rettiwt instance: ${error.message}`);
    return;
  }

  const rettiwt = new Rettiwt({ 
    apiKey: apiKey,
    delay: 1000,
    maxRetries: 1
  });

  console.log('\n🧪 Testing TweetSearchOptions...');
  
  try {
    console.log('Creating empty TweetSearchOptions...');
    const emptyOptions = new TweetSearchOptions({});
    console.log('✅ Empty TweetSearchOptions created');
    
    console.log('Creating simple TweetSearchOptions...');
    const simpleOptions = new TweetSearchOptions({ words: 'bitcoin' });
    console.log('✅ Simple TweetSearchOptions created');
    
    console.log('Converting to TweetFilter...');
    const tweetFilter = simpleOptions.toTweetFilter();
    console.log('✅ TweetFilter conversion successful');
    console.log(`TweetFilter type: ${typeof tweetFilter}`);
    console.log(`TweetFilter content: ${JSON.stringify(tweetFilter, null, 2)}`);
    
  } catch (error) {
    console.log(`❌ TweetSearchOptions test failed: ${error.message}`);
    console.log(`Error stack: ${error.stack}`);
    return;
  }

  console.log('\n🔍 Testing VERY basic searches...');

  // Test 1: Simplest possible search
  console.log('\n📍 TEST 1: Simplest hashtag search (we know this worked before)');
  try {
    const hashtagOptions = new TweetSearchOptions({ hashtags: 'bitcoin' });
    const hashtagFilter = hashtagOptions.toTweetFilter();
    
    console.log('🚀 Executing hashtag search...');
    const hashtagResult = await rettiwt.tweet.search(hashtagFilter, 1);
    
    if (hashtagResult && hashtagResult.list && hashtagResult.list.length > 0) {
      console.log('✅ SUCCESS: Hashtag search works!');
      const tweet = hashtagResult.list[0].toJSON();
      console.log(`   Sample tweet: "${(tweet.fullText || tweet.text || '').substring(0, 50)}..."`);
    } else {
      console.log('❌ FAILED: Even hashtag search doesn\'t work now');
      console.log(`   Result: ${JSON.stringify(hashtagResult, null, 2)}`);
    }
  } catch (error) {
    console.log(`❌ Hashtag search failed: ${error.message}`);
    console.log(`   Error type: ${error.constructor.name}`);
    if (error.response) {
      console.log(`   HTTP Status: ${error.response.status}`);
      console.log(`   Response: ${JSON.stringify(error.response.data, null, 2)}`);
    }
  }

  await new Promise(resolve => setTimeout(resolve, 3000));

  // Test 2: Simple words search
  console.log('\n📍 TEST 2: Simple words search');
  try {
    const wordsOptions = new TweetSearchOptions({ words: 'bitcoin' });
    const wordsFilter = wordsOptions.toTweetFilter();
    
    console.log('🚀 Executing words search...');
    const wordsResult = await rettiwt.tweet.search(wordsFilter, 1);
    
    if (wordsResult && wordsResult.list && wordsResult.list.length > 0) {
      console.log('✅ SUCCESS: Words search works!');
      const tweet = wordsResult.list[0].toJSON();
      console.log(`   Sample tweet: "${(tweet.fullText || tweet.text || '').substring(0, 50)}..."`);
    } else {
      console.log('❌ FAILED: Words search doesn\'t work');
      console.log(`   Result: ${JSON.stringify(wordsResult, null, 2)}`);
    }
  } catch (error) {
    console.log(`❌ Words search failed: ${error.message}`);
    if (error.response) {
      console.log(`   HTTP Status: ${error.response.status}`);
    }
  }

  await new Promise(resolve => setTimeout(resolve, 3000));

  // Test 3: Try without TweetSearchOptions (direct object)
  console.log('\n📍 TEST 3: Direct object (old method)');
  try {
    console.log('🚀 Executing direct object search...');
    const directResult = await rettiwt.tweet.search({ hashtags: ['bitcoin'] }, 1);
    
    if (directResult && directResult.list && directResult.list.length > 0) {
      console.log('✅ SUCCESS: Direct object method works!');
    } else {
      console.log('❌ FAILED: Direct object method doesn\'t work');
    }
  } catch (error) {
    console.log(`❌ Direct object search failed: ${error.message}`);
  }

  console.log('\n' + '='.repeat(60));
  console.log('🏁 BASIC TEST COMPLETE');
  console.log('\n🎯 DIAGNOSIS:');
  console.log('If ALL tests failed:');
  console.log('  - API key might be expired/invalid');
  console.log('  - Rettiwt service might be down');
  console.log('  - Network/firewall issues');
  console.log('  - Twitter API changes broke Rettiwt');
  console.log('\nIf only some tests failed:');
  console.log('  - Specific parameter formats are broken');
  console.log('  - Need to find which method still works');
  console.log('\n💡 Next steps based on results above...');
}

testBasicRettiwt().catch(error => {
  console.error('❌ Basic test crashed:', error);
});




