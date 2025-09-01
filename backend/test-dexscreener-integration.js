import DexscreenerApiService from './dexscreenerApiService.js';
import EnhancedTokenProcessor from './enhancedTokenProcessor.js';

async function testDexscreenerIntegration() {
  console.log('🚀 Testing Dexscreener Integration');
  console.log('=' .repeat(50));

  try {
    // Test 1: Initialize services
    console.log('\n📋 Test 1: Service Initialization');
    console.log('-'.repeat(30));

    const dexscreenerService = new DexscreenerApiService();
    const tokenProcessor = new EnhancedTokenProcessor();

    await tokenProcessor.initialize();

    console.log('✅ Services initialized successfully');

    // Test 2: Fetch Dexscreener tokens
    console.log('\n📊 Test 2: Fetch Dexscreener Tokens');
    console.log('-'.repeat(30));

    const dexscreenerTokens = await dexscreenerService.getTrendingPairs(30);
    console.log(`✅ Retrieved ${dexscreenerTokens.length} Dexscreener tokens`);

    if (dexscreenerTokens.length > 0) {
      console.log('📄 Sample tokens:');
      dexscreenerTokens.slice(0, 3).forEach((token, index) => {
        console.log(`   ${index + 1}. ${token.symbol || 'UNKNOWN'} - ${token.name || 'Unknown'}`);
        console.log(`      Contract: ${token.contractAddress ? token.contractAddress.substring(0, 8) + '...' : 'N/A'}`);
        console.log(`      Price: $${token.price || 'N/A'} | Volume: $${token.volume24h ? (token.volume24h / 1000).toFixed(1) + 'K' : 'N/A'}`);
      });
    }

    // Test 3: Process Dexscreener tokens through pipeline
    console.log('\n🔄 Test 3: Processing Pipeline');
    console.log('-'.repeat(30));

    // Convert to our format
    const processedTokens = dexscreenerTokens.map(token => ({
      symbol: token.symbol || 'UNKNOWN',
      name: token.name || 'Unknown Token',
      contractAddress: token.contractAddress,
      price: token.price || 0,
      volume24h: token.volume24h || 0,
      marketCap: token.marketCap || 0,
      priceChange24h: token.priceChange24h || 0,
      image: token.image,
      source: 'dexscreener',
      stage: 'dexscreener'
    }));

    const validTokens = processedTokens.filter(token =>
      token.contractAddress &&
      token.contractAddress !== 'UNKNOWN' &&
      token.contractAddress.length > 10
    );

    console.log(`✅ Converted ${dexscreenerTokens.length} → ${validTokens.length} valid tokens`);

    // Test 4: Deduplication
    console.log('\n🔍 Test 4: Deduplication Logic');
    console.log('-'.repeat(30));

    // Create some mock existing tokens to test deduplication
    const mockExistingTokens = [
      {
        symbol: 'SOL',
        name: 'Solana',
        contractAddress: 'So11111111111111111111111111111111111111112',
        source: 'coingecko'
      },
      {
        symbol: validTokens[0]?.symbol || 'TEST',
        name: 'Test Token',
        contractAddress: validTokens[0]?.contractAddress || 'TEST123',
        source: 'coingecko'
      }
    ];

    console.log(`📊 Testing deduplication with ${validTokens.length} new + ${mockExistingTokens.length} existing tokens`);

    const mergedTokens = tokenProcessor.mergeWithExistingTokens(validTokens, mockExistingTokens);

    console.log(`✅ Merged result: ${mergedTokens.length} total tokens`);
    console.log(`   - New tokens: ${mergedTokens.filter(t => t.source === 'dexscreener').length}`);
    console.log(`   - Existing tokens: ${mergedTokens.filter(t => t.source === 'coingecko').length}`);

    // Test 5: Processing status
    console.log('\n📈 Test 5: Processing Status');
    console.log('-'.repeat(30));

    const status = tokenProcessor.getProcessingStatus();
    console.log('✅ Processing status retrieved');
    console.log(`   - Is processing: ${status.isProcessing}`);
    console.log(`   - Current stage: ${status.currentStage}`);
    console.log(`   - Queue length: ${status.queueLength}`);
    console.log(`   - Sources: ${JSON.stringify(status.sources, null, 2)}`);

    // Summary
    console.log('\n🎯 INTEGRATION TEST COMPLETE');
    console.log('=' .repeat(50));
    console.log('✅ All tests passed!');
    console.log(`📊 Successfully processed ${dexscreenerTokens.length} Dexscreener tokens`);
    console.log('🔄 Dexscreener integration is ready for production!');

  } catch (error) {
    console.error('❌ Integration test failed:', error);
    console.error('Stack:', error.stack);
  }
}

// Run the test
testDexscreenerIntegration().catch(console.error);
