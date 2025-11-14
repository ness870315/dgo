/**
 * Test: AI-Powered Trending Tokens Analysis
 * 
 * This test demonstrates the new API that combines:
 * - Trending token data from our system
 * - Perplexity real-time news/catalyst discovery
 * - OpenAI human-readable summaries
 */

import fetch from 'node-fetch';

const API_BASE = 'https://api.degen-oracle.com';

async function testTrendingAIAnalysis() {
  console.log('🚀 Testing AI-Powered Trending Tokens Analysis...\n');
  console.log('='.repeat(80));
  
  try {
    // Test 1: JSON format (default)
    console.log('\n📊 TEST 1: JSON Format (Top 5 tokens)\n');
    
    const jsonResponse = await fetch(`${API_BASE}/api/tokens/trending/ai-analysis?limit=5`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (!jsonResponse.ok) {
      throw new Error(`HTTP ${jsonResponse.status}: ${jsonResponse.statusText}`);
    }
    
    const jsonData = await jsonResponse.json();
    
    console.log(`✅ Success: ${jsonData.count} tokens analyzed`);
    console.log(`⏰ Generated at: ${jsonData.generatedAt}\n`);
    
    // Display each token
    jsonData.tokens.forEach(token => {
      console.log(`${token.rank}. ${token.symbol} (${token.name})`);
      console.log(`   💰 Price: ${token.priceFormatted} (${token.priceChange24hFormatted})`);
      console.log(`   📊 Market Cap: ${token.marketCapFormatted} | Volume: ${token.volume24hFormatted}`);
      console.log(`   💧 Liquidity: ${token.liquidityFormatted} | Score: ${token.overallScore}/10`);
      console.log(`   🐦 Twitter Mentions: ${token.twitterMentions} | Holders: ${token.holders}`);
      console.log(`   `);
      console.log(`   📝 ${token.summary}`);
      
      if (token.citations && token.citations.length > 0) {
        console.log(`   📚 Sources: ${token.citations.length} citations`);
      }
      
      console.log('');
    });
    
    console.log('='.repeat(80));
    
    // Test 2: Text format (human-readable report)
    console.log('\n📄 TEST 2: Text Format (Top 3 tokens)\n');
    
    const textResponse = await fetch(`${API_BASE}/api/tokens/trending/ai-analysis?limit=3&format=text`, {
      method: 'GET'
    });
    
    if (!textResponse.ok) {
      throw new Error(`HTTP ${textResponse.status}: ${textResponse.statusText}`);
    }
    
    const textReport = await textResponse.text();
    console.log(textReport);
    
    console.log('='.repeat(80));
    console.log('\n✅ All tests completed successfully!\n');
    
    // API Usage Examples
    console.log('📖 API USAGE EXAMPLES:\n');
    console.log('1. Get top 10 trending tokens with AI analysis (JSON):');
    console.log(`   GET ${API_BASE}/api/tokens/trending/ai-analysis?limit=10\n`);
    
    console.log('2. Get top 5 trending tokens as text report:');
    console.log(`   GET ${API_BASE}/api/tokens/trending/ai-analysis?limit=5&format=text\n`);
    
    console.log('3. Production URL:');
    console.log(`   GET https://api.degen-oracle.com/api/tokens/trending/ai-analysis?limit=10\n`);
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Run the test
testTrendingAIAnalysis();

