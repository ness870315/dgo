// Test Twitter API with official handles
import EnhancedSocialDataService from './enhancedSocialDataService.js';

async function testTwitterHandles() {
  console.log('🐦 Testing Twitter API with Official Handles...\n');

  const socialService = new EnhancedSocialDataService();

  // Test cases
  const testCases = [
    {
      symbol: 'BONK',
      name: 'Bonk',
      officialHandle: '@bonk_inu' // Example official handle
    },
    {
      symbol: 'PEPE',
      name: 'Pepe',
      officialHandle: null // No official handle - should fallback to hashtag search
    }
  ];

  for (const testCase of testCases) {
    console.log(`\n🔍 Testing ${testCase.symbol} (${testCase.name})`);
    console.log(`   Official Handle: ${testCase.officialHandle || 'None - using fallback'}`);
    
    try {
      const twitterData = await socialService.getTwitterSocialData(
        testCase.symbol, 
        testCase.name, 
        false, // forceRefresh
        testCase.officialHandle
      );

      console.log(`✅ Results for ${testCase.symbol}:`);
      console.log(`   📊 Mentions: ${twitterData.mentions || 0}`);
      console.log(`   👥 Followers: ${twitterData.followers || 0}`);
      console.log(`   💖 Total Likes: ${twitterData.likes || 0}`);
      console.log(`   🔄 Total Retweets: ${twitterData.retweets || 0}`);
      console.log(`   💬 Total Replies: ${twitterData.replies || 0}`);
      console.log(`   📝 Recent Posts: ${twitterData.recentMentions?.length || 0}`);
      
      if (twitterData.recentMentions && twitterData.recentMentions.length > 0) {
        console.log(`   🎯 Top Tweet: "${twitterData.recentMentions[0].text.substring(0, 100)}..."`);
      }

    } catch (error) {
      console.log(`❌ Error testing ${testCase.symbol}: ${error.message}`);
    }

    // Delay between tests
    console.log('   ⏳ Waiting 10 seconds before next test...');
    await new Promise(resolve => setTimeout(resolve, 10000));
  }

  console.log('\n✅ Twitter handle testing completed!');
}

testTwitterHandles().catch(console.error);





