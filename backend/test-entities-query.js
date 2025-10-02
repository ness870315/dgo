// Test Twitter API v2 entities approach for hashtags/cashtags
import axios from 'axios';

const TWITTER_SERVICE_URL = 'https://api.degen-oracle.com';
const symbol = 'LOOK';
const symbolUpper = symbol.toUpperCase();

// Calculate yesterday at 00:00:00 UTC
const now = new Date();
const yesterday = new Date(now);
yesterday.setUTCDate(yesterday.getUTCDate() - 1);
yesterday.setUTCHours(0, 0, 0, 0);
const startTime = yesterday.toISOString();

const testQueries = [
  {
    name: 'Hashtag with has:hashtags',
    query: `has:hashtags #${symbolUpper} -is:retweet lang:en`
  },
  {
    name: 'Cashtag only',
    query: `$${symbolUpper} -is:retweet lang:en`
  },
  {
    name: 'Combined hashtag OR cashtag',
    query: `(#${symbolUpper} OR $${symbolUpper}) -is:retweet lang:en`
  },
  {
    name: 'Hashtag OR cashtag with lowercase',
    query: `(#${symbolUpper} OR $${symbolUpper} OR #${symbolUpper.toLowerCase()} OR $${symbolUpper.toLowerCase()}) -is:retweet lang:en`
  }
];

async function testQuery(testCase) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`Testing: ${testCase.name}`);
  console.log(`Query: ${testCase.query}`);
  console.log(`${'='.repeat(80)}`);
  
  try {
    const response = await axios.get(`${TWITTER_SERVICE_URL}/api/twitter/search`, {
      params: {
        q: testCase.query,
        count: 8,
        start_time: startTime
      },
      timeout: 30000
    });
    
    if (response.data.success) {
      const tweets = response.data.tweets || [];
      console.log(`✅ Found ${tweets.length} tweets`);
      
      if (tweets.length > 0) {
        const strictRegex = new RegExp(`(\\$|#)${symbol}`, 'i');
        let validCount = 0;
        
        console.log(`\nTweets:`);
        tweets.forEach((tweet, i) => {
          const text = tweet.text;
          const matches = strictRegex.test(text);
          if (matches) validCount++;
          
          console.log(`\n  ${i + 1}. ${matches ? '✅ VALID' : '❌ FILTERED'}`);
          console.log(`     ${text.substring(0, 100)}...`);
        });
        
        const validPercent = tweets.length > 0 ? ((validCount / tweets.length) * 100).toFixed(1) : 0;
        console.log(`\n📊 Valid tweets: ${validCount}/${tweets.length} (${validPercent}%)`);
        
        return { success: true, count: tweets.length, validCount, tweets };
      } else {
        console.log('⚠️ No tweets found');
        return { success: true, count: 0, validCount: 0, tweets: [] };
      }
    } else {
      console.log(`❌ FAILED: ${response.data.detail || 'Unknown error'}`);
      return { success: false, error: response.data.detail };
    }
  } catch (error) {
    console.log(`❌ ERROR: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function runTests() {
  console.log('\n🧪 TWITTER API v2 ENTITIES TEST FOR $LOOK');
  console.log(`Twitter Service: ${TWITTER_SERVICE_URL}`);
  console.log(`Symbol: ${symbol}`);
  console.log(`Start Time: ${startTime}`);
  
  const results = [];
  
  for (const testCase of testQueries) {
    const result = await testQuery(testCase);
    results.push({ name: testCase.name, ...result });
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  
  console.log(`\n\n${'='.repeat(80)}`);
  console.log('📊 SUMMARY OF ALL TESTS');
  console.log(`${'='.repeat(80)}`);
  
  results.forEach((result, i) => {
    console.log(`\n${i + 1}. ${result.name}`);
    console.log(`   Status: ${result.success ? '✅ SUCCESS' : '❌ FAILED'}`);
    console.log(`   Total Tweets: ${result.count || 0}`);
    console.log(`   Valid Tweets (with $LOOK/#LOOK): ${result.validCount || 0}`);
    if (result.count > 0) {
      const validPercent = ((result.validCount / result.count) * 100).toFixed(1);
      console.log(`   Success Rate: ${validPercent}%`);
    }
  });
  
  // Find best option
  const validResults = results.filter(r => r.success && r.validCount > 0);
  if (validResults.length > 0) {
    const best = validResults.reduce((a, b) => 
      b.validCount > a.validCount ? b : a
    );
    
    console.log(`\n\n🏆 BEST QUERY: ${best.name}`);
    console.log(`   Found: ${best.validCount} valid tweets (${((best.validCount / best.count) * 100).toFixed(1)}% success rate)`);
    console.log(`   Total: ${best.count} tweets returned`);
  } else {
    console.log(`\n\n❌ NO SUCCESSFUL QUERIES - None found valid tweets with $LOOK or #LOOK`);
  }
  
  console.log(`\n${'='.repeat(80)}\n`);
}

runTests().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});

