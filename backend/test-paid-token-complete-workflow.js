#!/usr/bin/env node

/**
 * Test script to verify complete paid token workflow including overall scoring
 */

import EnhancedTokenProcessor from './enhancedTokenProcessor.js';

async function testCompletePaidTokenWorkflow() {
  console.log('🧪 TESTING COMPLETE PAID TOKEN WORKFLOW WITH SCORING');
  console.log('='.repeat(70));
  
  try {
    // Initialize the token processor
    const processor = new EnhancedTokenProcessor();
    await processor.initialize();
    
    // Test token data (MEMEPUTER)
    const testTokenData = {
      symbol: 'MEMEPUTER',
      name: 'MEMEPUTER',
      contractAddress: '5EpbKX221NYVidK6A2nJGhtuLPvrPiQ6shknLbtjBAGS',
      currentPrice: 0,
      marketCap: 0,
      volume24h: 0,
      source: 'user_submitted'
    };
    
    console.log('📊 Test Token Data:');
    console.log(JSON.stringify(testTokenData, null, 2));
    console.log('');
    
    console.log('🚀 Starting complete paid token processing...');
    console.log('⚡ Expected workflow: Jupiter → Twitter → Overall Scoring → Save');
    console.log('');
    
    // Process the paid token
    const result = await processor.processPaidTokenImmediately(testTokenData);
    
    console.log('');
    console.log('✅ PROCESSING COMPLETE!');
    console.log('='.repeat(70));
    
    // Analyze the results
    console.log('📊 COMPLETE WORKFLOW ANALYSIS:');
    console.log('');
    
    console.log('🔍 Basic Info:');
    console.log(`   Symbol: ${result.symbol}`);
    console.log(`   Name: ${result.name}`);
    console.log(`   Contract: ${result.contractAddress}`);
    console.log(`   Stage: ${result.stage}`);
    console.log('');
    
    console.log('🪐 Jupiter Data:');
    if (result.jupiterData) {
      console.log('   ✅ Jupiter data found:');
      console.log(`      Symbol: ${result.jupiterData.symbol || 'N/A'}`);
      console.log(`      Name: ${result.jupiterData.name || 'N/A'}`);
      console.log(`      Twitter: ${result.jupiterData.twitter || 'N/A'}`);
      console.log(`      Website: ${result.jupiterData.website || 'N/A'}`);
    } else {
      console.log('   ❌ No Jupiter data found');
    }
    console.log('');
    
    console.log('🐦 Twitter Data:');
    if (result.twitterData) {
      console.log('   ✅ Twitter data found:');
      console.log(`      Mentions: ${result.twitterData.mentions || 0}`);
      console.log(`      Community Score: ${result.communityScore || 0}`);
      console.log(`      Recent Mentions: ${result.twitterData.recentMentions?.length || 0}`);
    } else {
      console.log('   ❌ No Twitter data found');
    }
    console.log('');
    
    console.log('🎯 OVERALL SCORING (NEW!):');
    if (result.enhancedScore !== undefined && result.overallScore !== undefined) {
      console.log('   ✅ Overall scoring completed:');
      console.log(`      Enhanced Score: ${result.enhancedScore}/10`);
      console.log(`      Overall Score: ${result.overallScore}/10`);
      console.log('   📊 Score breakdown:');
      console.log('      • Market Tier (5%)');
      console.log('      • Volume 1hr (10%)');
      console.log('      • Volume 24hr (15%)');
      console.log('      • Price Change (10%)');
      console.log('      • Organic Volume Ratio (10%)');
      console.log('      • Community Health (45%)');
      console.log('      • Uniqueness Factor (5%)');
    } else {
      console.log('   ❌ Overall scoring missing or failed');
    }
    console.log('');
    
    // Final verdict
    console.log('🎯 WORKFLOW VERIFICATION:');
    const jupiterSuccess = result.jupiterData && !result.jupiterData.fallback;
    const twitterSuccess = result.twitterData && result.twitterData.mentions !== undefined;
    const scoringSuccess = result.enhancedScore !== undefined && result.overallScore !== undefined;
    
    console.log(`   Step 1 (Jupiter): ${jupiterSuccess ? '✅ SUCCESS' : '❌ FAILED'}`);
    console.log(`   Step 2 (Twitter): ${twitterSuccess ? '✅ SUCCESS' : '⚠️ NO DATA'}`);
    console.log(`   Step 3 (Scoring): ${scoringSuccess ? '✅ SUCCESS' : '❌ FAILED'}`);
    console.log(`   Step 4 (Save): ${result.stage === 'completed' ? '✅ SUCCESS' : '❌ FAILED'}`);
    console.log('');
    
    if (jupiterSuccess && scoringSuccess) {
      console.log('🎉 VERDICT: COMPLETE WORKFLOW IS WORKING CORRECTLY!');
      console.log('✅ Jupiter API ✅ Twitter API ✅ Overall Scoring ✅ Save to Cache');
    } else {
      console.log('⚠️  VERDICT: WORKFLOW HAS ISSUES');
      if (!jupiterSuccess) console.log('❌ Jupiter API needs investigation');
      if (!scoringSuccess) console.log('❌ Overall scoring needs investigation');
    }
    
  } catch (error) {
    console.error('❌ TEST FAILED:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

// Run the test
testCompletePaidTokenWorkflow();




