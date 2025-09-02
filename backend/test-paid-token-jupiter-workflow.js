#!/usr/bin/env node

/**
 * Test script to verify that paid tokens go through Jupiter API correctly
 */

import EnhancedTokenProcessor from './enhancedTokenProcessor.js';

async function testPaidTokenJupiterWorkflow() {
  console.log('🧪 TESTING PAID TOKEN JUPITER WORKFLOW');
  console.log('=' .repeat(60));
  
  try {
    // Initialize the token processor
    const processor = new EnhancedTokenProcessor();
    await processor.initialize();
    
    // Test token data (MEMEPUTER from your example)
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
    
    console.log('🚀 Starting paid token processing...');
    console.log('⚡ This should go through ALL stages: CoinGecko → Jupiter → Twitter → Scoring');
    console.log('');
    
    // Process the paid token
    const result = await processor.processPaidTokenImmediately(testTokenData);
    
    console.log('');
    console.log('✅ PROCESSING COMPLETE!');
    console.log('=' .repeat(60));
    
    // Analyze the results
    console.log('📊 FINAL RESULTS ANALYSIS:');
    console.log('');
    
    console.log('🔍 Basic Info:');
    console.log(`   Symbol: ${result.symbol}`);
    console.log(`   Name: ${result.name}`);
    console.log(`   Contract: ${result.contractAddress}`);
    console.log(`   Stage: ${result.stage}`);
    console.log('');
    
    console.log('🪙 CoinGecko Data:');
    if (result.coinGeckoId) {
      console.log(`   ✅ CoinGecko ID: ${result.coinGeckoId}`);
      console.log(`   ✅ Price: $${result.currentPrice}`);
      console.log(`   ✅ Market Cap: $${result.marketCap?.toLocaleString()}`);
    } else {
      console.log('   ❌ No CoinGecko data found');
    }
    console.log('');
    
    console.log('🪐 Jupiter Data:');
    if (result.jupiterData) {
      console.log('   ✅ Jupiter data found:');
      console.log(`      Symbol: ${result.jupiterData.symbol || 'N/A'}`);
      console.log(`      Name: ${result.jupiterData.name || 'N/A'}`);
      console.log(`      Twitter: ${result.jupiterData.twitter || 'N/A'}`);
      console.log(`      Website: ${result.jupiterData.website || 'N/A'}`);
      console.log(`      Decimals: ${result.jupiterData.decimals || 'N/A'}`);
    } else {
      console.log('   ❌ No Jupiter data found');
    }
    console.log('');
    
    console.log('🐦 Twitter Data:');
    if (result.twitterData) {
      console.log('   ✅ Twitter data found:');
      console.log(`      Mentions: ${result.twitterData.mentions || 0}`);
      console.log(`      Community Score: ${result.communityScore || 0}`);
      console.log(`      Official Handle: ${result.jupiterData?.twitter || 'None'}`);
    } else {
      console.log('   ❌ No Twitter data found');
    }
    console.log('');
    
    // Check if Jupiter API was actually called
    console.log('🎯 JUPITER API VERIFICATION:');
    if (result.jupiterData && !result.jupiterData.fallback) {
      console.log('   ✅ SUCCESS: Jupiter API was called and returned data');
      console.log('   ✅ Token went through complete workflow: CoinGecko → Jupiter → Twitter');
    } else if (result.jupiterData && result.jupiterData.fallback) {
      console.log('   ⚠️  WARNING: Jupiter API was called but returned fallback data');
      console.log('   ⚠️  This might indicate the token is not in Jupiter\'s database');
    } else {
      console.log('   ❌ ERROR: Jupiter API was not called or failed completely');
      console.log('   ❌ This indicates a problem with the workflow');
    }
    console.log('');
    
    console.log('📋 WORKFLOW SUMMARY:');
    console.log(`   Stage 1 (CoinGecko): ${result.coinGeckoId ? '✅ SUCCESS' : '⚠️ NO DATA'}`);
    console.log(`   Stage 2 (Jupiter): ${result.jupiterData ? '✅ SUCCESS' : '❌ FAILED'}`);
    console.log(`   Stage 3 (Twitter): ${result.twitterData ? '✅ SUCCESS' : '⚠️ NO DATA'}`);
    console.log(`   Stage 4 (Scoring): ${result.communityScore ? '✅ SUCCESS' : '⚠️ DEFAULT'}`);
    console.log('');
    
    // Final verdict
    if (result.jupiterData && !result.jupiterData.fallback) {
      console.log('🎉 VERDICT: JUPITER API WORKFLOW IS WORKING CORRECTLY!');
    } else {
      console.log('⚠️  VERDICT: JUPITER API WORKFLOW NEEDS INVESTIGATION');
    }
    
  } catch (error) {
    console.error('❌ TEST FAILED:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

// Run the test
testPaidTokenJupiterWorkflow();




