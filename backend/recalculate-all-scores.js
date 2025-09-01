import axios from 'axios';
import EnhancedTokenProcessor from './enhancedTokenProcessor.js';
import fs from 'fs/promises';

/**
 * RECALCULATE ALL TOKEN SCORES
 * Fix the stale score issue by recalculating overall scores for all tokens
 * using their current Twitter data
 */
async function recalculateAllScores() {
  console.log('🔄 RECALCULATING ALL TOKEN SCORES');
  console.log('=' .repeat(50));

  try {
    // 1. Load current tokens from cache
    console.log('📡 Step 1: Loading tokens from cache...');
    const cacheData = await fs.readFile('./cache/tokens-cache.json', 'utf8');
    const tokens = JSON.parse(cacheData);
    
    console.log(`✅ Loaded ${tokens.length} tokens from cache`);

    // 2. Initialize token processor
    console.log('\n🔧 Step 2: Initializing token processor...');
    const processor = new EnhancedTokenProcessor();
    
    // 3. Recalculate scores for all tokens
    console.log('\n📊 Step 3: Recalculating scores...');
    console.log('===================================');
    
    let recalculated = 0;
    let errors = 0;
    const results = [];
    
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      console.log(`\n🔄 [${i + 1}/${tokens.length}] Processing ${token.symbol}...`);
      
      try {
        // Store old score for comparison
        const oldScore = token.overallScore || 0;
        const oldCommunityScore = token.communityHealthScore || 0;
        
        // CRITICAL: Recalculate community health score from fresh Twitter data
        if (token.twitterData) {
          const newCommunityScore = processor.calculateCommunityHealthScore(token.twitterData);
          token.communityHealthScore = newCommunityScore;
          token.communityScore = newCommunityScore; // Ensure both fields are set
          
          console.log(`   Community Health: ${oldCommunityScore.toFixed(2)} → ${newCommunityScore.toFixed(2)}`);
        } else {
          // For tokens without Twitter data, set to base score (2.0)
          const baseScore = 2.0;
          token.communityHealthScore = baseScore;
          token.communityScore = baseScore;
          
          console.log(`   Community Health: ${oldCommunityScore.toFixed(2)} → ${baseScore.toFixed(2)} (no Twitter data)`);
        }
        
        // Recalculate overall score using updated community health
        const newScore = processor.calculateEnhancedOverallScore(token);
        
        // Update token
        token.overallScore = newScore;
        token.enhancedScore = newScore;
        token.scoringTimestamp = new Date().toISOString();
        
        const change = newScore - oldScore;
        const changeStr = change > 0 ? `+${change.toFixed(2)}` : change.toFixed(2);
        
        console.log(`   Old Score: ${oldScore.toFixed(2)}`);
        console.log(`   New Score: ${newScore.toFixed(2)}`);
        console.log(`   Change: ${changeStr}`);
        
        results.push({
          symbol: token.symbol,
          oldScore: oldScore,
          newScore: newScore,
          change: change,
          communityHealth: token.communityHealthScore || 0,
          mentions: token.twitterData?.mentions || 0
        });
        
        recalculated++;
        
      } catch (error) {
        console.log(`   ❌ Error: ${error.message}`);
        errors++;
      }
    }
    
    // 4. Save updated tokens back to cache
    console.log('\n💾 Step 4: Saving updated scores...');
    await fs.writeFile('./cache/tokens-cache.json', JSON.stringify(tokens, null, 2));
    console.log('✅ Updated tokens saved to cache');
    
    // 5. Show summary
    console.log('\n📊 RECALCULATION SUMMARY');
    console.log('========================');
    console.log(`✅ Successfully recalculated: ${recalculated} tokens`);
    console.log(`❌ Errors: ${errors} tokens`);
    
    // 6. Show biggest changes
    console.log('\n🏆 TOP 10 BIGGEST SCORE INCREASES:');
    console.log('==================================');
    const topIncreases = results
      .filter(r => r.change > 0)
      .sort((a, b) => b.change - a.change)
      .slice(0, 10);
      
    topIncreases.forEach((result, index) => {
      console.log(`${index + 1}. ${result.symbol}: ${result.oldScore.toFixed(2)} → ${result.newScore.toFixed(2)} (+${result.change.toFixed(2)})`);
      console.log(`   Community Health: ${result.communityHealth.toFixed(1)}, Mentions: ${result.mentions}`);
    });
    
    console.log('\n📉 TOP 10 BIGGEST SCORE DECREASES:');
    console.log('==================================');
    const topDecreases = results
      .filter(r => r.change < 0)
      .sort((a, b) => a.change - b.change)
      .slice(0, 10);
      
    topDecreases.forEach((result, index) => {
      console.log(`${index + 1}. ${result.symbol}: ${result.oldScore.toFixed(2)} → ${result.newScore.toFixed(2)} (${result.change.toFixed(2)})`);
      console.log(`   Community Health: ${result.communityHealth.toFixed(1)}, Mentions: ${result.mentions}`);
    });
    
    // 7. Show tokens with fresh Twitter data
    console.log('\n🐦 TOKENS WITH FRESH TWITTER DATA (>10 mentions):');
    console.log('================================================');
    const freshTwitter = results
      .filter(r => r.mentions > 10)
      .sort((a, b) => b.mentions - a.mentions)
      .slice(0, 15);
      
    freshTwitter.forEach((result, index) => {
      console.log(`${index + 1}. ${result.symbol}: ${result.mentions} mentions, Score: ${result.newScore.toFixed(2)} (${result.change >= 0 ? '+' : ''}${result.change.toFixed(2)})`);
    });
    
    console.log('\n🎉 ALL TOKEN SCORES RECALCULATED!');
    console.log('The frontend will now show updated scores reflecting current Twitter activity.');
    
  } catch (error) {
    console.error('❌ Recalculation failed:', error);
    console.error('Stack:', error.stack);
  }
}

recalculateAllScores();
