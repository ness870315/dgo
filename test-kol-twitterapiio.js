/**
 * Test script for KOL Market Learning Service with TwitterAPI.io integration
 * 
 * This script tests:
 * 1. KOL Market Learning Service initialization
 * 2. TwitterAPI.io last_tweets endpoint integration
 * 3. Tweet processing and analysis
 */

import KOLMarketLearningService from './backend/services/KOLMarketLearningService.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function testKOLLearningService() {
  console.log('🧪 [TEST] Starting KOL Market Learning Service test...\n');

  try {
    // Initialize the service
    const kolService = new KOLMarketLearningService();
    await kolService.initialize();

    console.log('✅ [TEST] Service initialized successfully');
    console.log(`   KOLs loaded: ${kolService.kols.size}`);
    console.log(`   Posts in database: ${kolService.posts.length}`);
    console.log(`   Signals: ${kolService.signals.size}\n`);

    // Test fetching tweets for a specific KOL
    const testKOL = 'elonmusk'; // Using a well-known handle for testing
    
    console.log(`🔍 [TEST] Testing TwitterAPI.io integration with @${testKOL}...`);
    
    const tweets = await kolService.fetchKOLTweets(testKOL);
    
    if (tweets && tweets.length > 0) {
      console.log(`✅ [TEST] Successfully fetched ${tweets.length} tweets from @${testKOL}`);
      
      // Show sample tweet data
      const sampleTweet = tweets[0];
      console.log('\n📝 [TEST] Sample tweet data:');
      console.log(`   ID: ${sampleTweet.id}`);
      console.log(`   Text: ${sampleTweet.text.substring(0, 100)}...`);
      console.log(`   Created: ${sampleTweet.created_at}`);
      console.log(`   Likes: ${sampleTweet.likes}`);
      console.log(`   Retweets: ${sampleTweet.retweets}`);
      console.log(`   Author: ${sampleTweet.author?.username} (${sampleTweet.author?.followers} followers)`);
      console.log(`   Source: ${sampleTweet.source}`);
      
      // Test tweet processing
      console.log('\n🧠 [TEST] Testing tweet processing...');
      
      const kol = kolService.kols.get(testKOL) || {
        id: 'test_kol',
        handle: testKOL,
        influence_score: 100,
        segments: ['crypto', 'tech']
      };
      
      // Process the first tweet
      await kolService.processTweet(kol, tweets[0]);
      console.log('✅ [TEST] Tweet processing completed');
      
      // Test data extraction
      console.log('\n🔍 [TEST] Testing data extraction...');
      const extractedData = await kolService.extractTweetData(sampleTweet.text);
      console.log(`   Coins found: ${extractedData.coins.join(', ') || 'None'}`);
      console.log(`   Narratives: ${extractedData.narratives.join(', ') || 'None'}`);
      
      // Test stance detection
      console.log('\n🎯 [TEST] Testing stance detection...');
      const stance = await kolService.detectStance(sampleTweet.text);
      console.log(`   Stance: ${stance.score.toFixed(2)} (${stance.confidence.toFixed(2)} confidence)`);
      console.log(`   Reasoning: ${stance.reasoning}`);
      
    } else {
      console.log('⚠️ [TEST] No tweets fetched - this might be due to:');
      console.log('   - API rate limits');
      console.log('   - Invalid API key');
      console.log('   - Network issues');
      console.log('   - User not found or no recent tweets');
    }

    // Test monitoring cycle (dry run)
    console.log('\n🔄 [TEST] Testing monitoring cycle...');
    await kolService.runMonitoring();
    console.log('✅ [TEST] Monitoring cycle completed');

    // Test dashboard data generation
    console.log('\n📊 [TEST] Testing dashboard data generation...');
    const dashboardData = await kolService.getDashboardData(24);
    
    if (dashboardData) {
      console.log('✅ [TEST] Dashboard data generated successfully');
      console.log(`   Heatmap entries: ${dashboardData.heatmap.length}`);
      console.log(`   Momentum items: ${dashboardData.momentum.length}`);
      console.log(`   Leaderboard entries: ${dashboardData.leaderboard.length}`);
      console.log(`   Signals: ${dashboardData.signals.length}`);
    } else {
      console.log('⚠️ [TEST] No dashboard data generated');
    }

    console.log('\n🎉 [TEST] All tests completed successfully!');

  } catch (error) {
    console.error('❌ [TEST] Test failed:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

// Run the test
testKOLLearningService().catch(console.error);
