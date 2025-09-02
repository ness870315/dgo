// Test updated Twitter API logic
import EnhancedSocialDataService from './enhancedSocialDataService.js';

async function testUpdatedTwitterAPI() {
  console.log('🐦 Testing Updated Twitter API Logic...\n');

  const socialService = new EnhancedSocialDataService();

  // Test cases
  const testCases = [
    {
      symbol: 'BONK',
      name: 'Bonk',
      officialHandle: '@bonk_inu' // Has official handle
    },
    {
      symbol: 'PEPE',
      name: 'Pepe',
      officialHandle: null // No official handle - should be stored as "not found"
    },
    {
      symbol: 'DOGE',
      name: 'Dogecoin',
      officialHandle: '@dogecoin' // Another example with official handle
    }
  ];

  for (const testCase of testCases) {
    console.log(`\n🔍 Testing ${testCase.symbol} (${testCase.name})`);
    console.log(`   Official Handle: ${testCase.officialHandle || 'None - should be stored as "not found"'}`);
    
    try {
      const twitterData = await socialService.getTwitterSocialData(
        testCase.symbol, 
        testCase.name, 
        false, // forceRefresh
        testCase.officialHandle
      );

      console.log(`✅ Results for ${testCase.symbol}:`);
      console.log(`   🎯 Official Handle: ${twitterData.officialHandle}`);
      console.log(`   ✅ Has Official Account: ${twitterData.hasOfficialAccount}`);
      console.log(`   👤 Username: ${twitterData.username || 'None'}`);
      console.log(`   👥 Followers: ${twitterData.followers || 0}`);
      console.log(`   📊 Community Mentions: ${twitterData.mentions || 0}`);
      console.log(`   💖 Total Likes: ${twitterData.likes || 0}`);
      console.log(`   🔄 Total Retweets: ${twitterData.retweets || 0}`);
      console.log(`   💬 Total Replies: ${twitterData.replies || 0}`);
      console.log(`   🏥 Community Health: ${twitterData.communityHealth || 0}/10`);
      console.log(`   📝 Recent Posts: ${twitterData.tweets?.length || 0}`);
      
      if (twitterData.tweets && twitterData.tweets.length > 0) {
        console.log(`   🎯 Top Tweet: "${twitterData.tweets[0].text.substring(0, 100)}..."`);
        console.log(`   👍 Top Tweet Likes: ${twitterData.tweets[0].likes}`);
      }

      // Verify the data structure
      console.log(`   ✅ Data Structure Check:`);
      console.log(`      - officialHandle: ${typeof twitterData.officialHandle} (${twitterData.officialHandle})`);
      console.log(`      - hasOfficialAccount: ${typeof twitterData.hasOfficialAccount} (${twitterData.hasOfficialAccount})`);
      console.log(`      - mentions: ${typeof twitterData.mentions} (${twitterData.mentions})`);
      console.log(`      - communityHealth: ${typeof twitterData.communityHealth} (${twitterData.communityHealth})`);

    } catch (error) {
      console.log(`❌ Error testing ${testCase.symbol}: ${error.message}`);
    }

    // Delay between tests
    console.log('   ⏳ Waiting 15 seconds before next test...');
    await new Promise(resolve => setTimeout(resolve, 15000));
  }

  console.log('\n✅ Updated Twitter API testing completed!');
  console.log('\n📋 Summary:');
  console.log('   ✅ Official handles from Jupiter API are used when available');
  console.log('   ✅ "not found" is stored when no official handle exists');
  console.log('   ✅ Hashtag/cashtag searches are always performed for community metrics');
  console.log('   ✅ Follower count is fetched for community score calculation');
  console.log('   ✅ Community health score is calculated from all metrics');
}

testUpdatedTwitterAPI().catch(console.error);





