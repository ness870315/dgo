#!/usr/bin/env node

/**
 * Test script for TwitterAPI.io Search Service Integration
 * Tests the new advanced_search endpoint integration
 */

import TwitterAPIioSearchService from './backend/services/TwitterAPIioSearchService.js';

async function testTwitterAPIioSearch() {
  console.log('🧪 Testing TwitterAPI.io Search Service Integration\n');
  
  // Check if API key is available
  const apiKey = process.env.TWITTERAPIIO_API_KEY;
  if (!apiKey) {
    console.error('❌ TWITTERAPIIO_API_KEY environment variable is required');
    console.log('   Please set it in your .env file or environment');
    process.exit(1);
  }
  
  try {
    // Initialize the service
    console.log('🔧 Initializing TwitterAPI.io Search Service...');
    const searchService = new TwitterAPIioSearchService(apiKey);
    
    // Test 1: Service Health Check
    console.log('\n📊 Test 1: Service Health Check');
    const health = await searchService.getServiceHealth();
    console.log('   Health Status:', health.available ? '✅ Healthy' : '❌ Unhealthy');
    console.log('   Message:', health.message);
    console.log('   Test Query:', health.testQuery);
    console.log('   Test Count:', health.testCount);
    
    if (!health.available) {
      console.error('❌ Service health check failed. Cannot continue tests.');
      return;
    }
    
    // Test 2: Token Mention Search
    console.log('\n🔍 Test 2: Token Mention Search ($WIZI)');
    const tokenSearch = await searchService.searchTokenMentions('WIZI', 10);
    console.log('   Success:', tokenSearch.success ? '✅' : '❌');
    console.log('   Tweet Count:', tokenSearch.count);
    console.log('   Source:', tokenSearch.source);
    
    if (tokenSearch.success && tokenSearch.tweets.length > 0) {
      const sampleTweet = tokenSearch.tweets[0];
      console.log('   Sample Tweet:');
      console.log(`     ID: ${sampleTweet.id}`);
      console.log(`     Text: "${sampleTweet.text?.substring(0, 100)}..."`);
      console.log(`     Author: @${sampleTweet.author?.userName}`);
      console.log(`     Type: ${sampleTweet.type}`);
      console.log(`     Likes: ${sampleTweet.likeCount}`);
      console.log(`     Retweets: ${sampleTweet.retweetCount}`);
      
      // Test transformation
      console.log('\n🔄 Test 3: Data Transformation');
      const transformedTweet = searchService.transformSearchTweet(sampleTweet);
      console.log('   Transformation successful:', transformedTweet ? '✅' : '❌');
      if (transformedTweet) {
        console.log(`   Transformed ID: ${transformedTweet.id}`);
        console.log(`   Transformed User: @${transformedTweet.user?.screen_name}`);
        console.log(`   Transformed Likes: ${transformedTweet.favorite_count}`);
      }
    }
    
    // Test 4: User Mention Search
    console.log('\n👤 Test 4: User Mention Search (@dgnoracle)');
    const userSearch = await searchService.searchUserMentions('dgnoracle', 5);
    console.log('   Success:', userSearch.success ? '✅' : '❌');
    console.log('   Tweet Count:', userSearch.count);
    console.log('   Source:', userSearch.source);
    
    // Test 5: Usage Statistics
    console.log('\n📈 Test 5: Usage Statistics');
    const stats = await searchService.getUsageStats();
    console.log('   Service:', stats.service);
    console.log('   Status:', stats.status);
    console.log('   Pricing:', stats.pricing);
    console.log('   Features:', stats.features?.length || 0);
    
    console.log('\n✅ All tests completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

// Run the test
testTwitterAPIioSearch().catch(console.error);
