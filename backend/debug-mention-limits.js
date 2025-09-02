import EnhancedSocialDataService from './enhancedSocialDataService.js';

/**
 * DEBUG MENTION LIMITS
 * Investigate why we're getting max 24-25 mentions even for popular tokens
 */
async function debugMentionLimits() {
  console.log('🔍 DEBUGGING MENTION LIMITS');
  console.log('=' .repeat(50));

  try {
    const socialService = new EnhancedSocialDataService();
    await socialService.initialize();
    
    console.log('✅ Social service initialized');

    // Test with a popular token
    const testToken = 'FWOG';
    console.log(`\n🎯 Testing with ${testToken}...`);
    
    // Enable more detailed logging by temporarily modifying the search
    console.log('\n📊 DETAILED BREAKDOWN:');
    
    // Force fresh search (bypass cache)
    const result = await socialService.getTwitterSocialData(testToken, 'Fwog', true);
    
    console.log('\n📈 FINAL RESULTS:');
    console.log(`   Total Mentions: ${result.mentions}`);
    console.log(`   Recent Tweets Stored: ${result.recentMentions?.length || 0}`);
    console.log(`   Total Likes: ${result.likes}`);
    console.log(`   Total Retweets: ${result.retweets}`);
    
    console.log('\n🔍 ANALYSIS:');
    console.log('   • Are we hitting the 50 tweets per search limit?');
    console.log('   • Are most tweets being filtered out by crypto relevance?');
    console.log('   • Is the Twitter API returning fewer tweets than requested?');
    console.log('   • Are we processing all tweets correctly?');
    
    // Check the raw search results by looking at the debug logs above
    console.log('\n💡 Look at the debug logs above to see:');
    console.log('   - How many tweets each search returned');
    console.log('   - How many were filtered out as non-crypto');
    console.log('   - The final mention count accumulation');

  } catch (error) {
    console.error('❌ Debug failed:', error);
  }
}

debugMentionLimits();
