/**
 * Re-analyze existing tweets with AI
 */

import KOLService from './backend/services/KOLService.js';

async function reanalyzeTweets() {
  try {
    console.log('🔄 [REANALYZE] Starting re-analysis of existing tweets...');
    
    const service = new KOLService();
    await service.initialize();
    
    console.log(`📊 [REANALYZE] Found ${service.posts.length} posts to analyze`);
    
    let analyzed = 0;
    for (const post of service.posts) {
      // Skip if already has analysis
      if (post.coins && post.sentiment !== undefined) {
        console.log(`⏭️  [REANALYZE] Skipping ${post.id} (already analyzed)`);
        continue;
      }
      
      console.log(`🤖 [REANALYZE] Analyzing: "${post.text.substring(0, 50)}..."`);
      
      // Analyze tweet
      const analysis = await service.analyzeTweet(post.text);
      
      // Update post
      post.coins = analysis.coins;
      post.sentiment = analysis.sentiment;
      post.narratives = analysis.narratives;
      
      analyzed++;
      
      if (analysis.coins.length > 0) {
        console.log(`   ✅ Found: ${analysis.coins.join(', ')} | Sentiment: ${analysis.sentiment > 0 ? '📈' : analysis.sentiment < 0 ? '📉' : '➡️'}`);
      }
    }
    
    // Save updated posts
    await service.saveData();
    
    console.log(`\n✅ [REANALYZE] Complete! Analyzed ${analyzed} tweets`);
    console.log(`📊 [REANALYZE] Total posts: ${service.posts.length}`);
    
  } catch (error) {
    console.error('❌ [REANALYZE] Error:', error.message);
  }
}

reanalyzeTweets();
