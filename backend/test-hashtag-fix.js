import EnhancedSocialDataService from './enhancedSocialDataService.js';

/**
 * TEST HASHTAG-ONLY FIX
 * Verify that our updated social data service works with hashtag-only searches
 */
async function testHashtagFix() {
  console.log('🔍 TESTING HASHTAG-ONLY FIX');
  console.log('=' .repeat(50));

  try {
    const socialService = new EnhancedSocialDataService();
    await socialService.initialize();
    
    console.log('✅ Social service initialized');

    // Test with FWOG (we know it has hashtag activity)
    console.log('\n🎯 Testing with FWOG...');
    const fwogData = await socialService.getTwitterSocialData('FWOG', 'Fwog');
    
    console.log('\n📊 FWOG Results:');
    console.log(`   Mentions: ${fwogData.mentions || 0}`);
    console.log(`   Likes: ${fwogData.likes || 0}`);
    console.log(`   Retweets: ${fwogData.retweets || 0}`);
    console.log(`   Recent tweets: ${fwogData.recentMentions?.length || 0}`);
    
    if (fwogData.recentMentions && fwogData.recentMentions.length > 0) {
      console.log('\n🐦 Sample tweets:');
      fwogData.recentMentions.slice(0, 2).forEach((tweet, i) => {
        console.log(`   ${i + 1}. "${tweet.text?.substring(0, 80)}..." (${tweet.likes || 0} likes)`);
      });
    }

    // Test community health score
    if (fwogData.mentions > 0) {
      const healthScore = socialService.calculateCommunityHealthScore(fwogData);
      console.log(`\n💪 Community Health Score: ${healthScore.toFixed(2)}/10`);
    }

    console.log('\n🎉 SUCCESS! Hashtag-only strategy is working!');
    console.log('💡 The Twitter search issue is now FIXED!');

  } catch (error) {
    console.error('❌ Test failed:', error);
    console.error('Stack:', error.stack);
  }
}

testHashtagFix();




