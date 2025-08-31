// Test relevance filtering for crypto tweets
import EnhancedSocialDataService from './enhancedSocialDataService.js';

async function testRelevanceFilter() {
  console.log('🔍 Testing Crypto Relevance Filter...\n');

  const socialService = new EnhancedSocialDataService();

  // Test tweets - mix of crypto and non-crypto
  const testTweets = [
    // CRYPTO-RELEVANT TWEETS (should PASS filter)
    {
      symbol: 'TRUMP',
      text: '$TRUMP just hit a new ATH! 🚀 This Solana meme coin is going to the moon! #crypto #solana',
      expected: true
    },
    {
      symbol: 'TRUMP',
      text: 'TRUMP token up 150% today! Buy the dip before it moons! Contract: 7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr',
      expected: true
    },
    {
      symbol: 'PEPE',
      text: '$PEPE holders diamond hands 💎🙌 This meme coin will make us all rich! #HODL #crypto',
      expected: true
    },
    {
      symbol: 'BONK',
      text: 'Just swapped some SOL for BONK on Jupiter. This Solana ecosystem is amazing! 🔥',
      expected: true
    },
    
    // NON-CRYPTO TWEETS (should FAIL filter)
    {
      symbol: 'TRUMP',
      text: 'Trump announces new policy on immigration. The president will speak at 3 PM today. #politics #news',
      expected: false
    },
    {
      symbol: 'TRUMP',
      text: 'Breaking: Trump wins election in landslide victory! Republicans celebrate across the nation. #election2024',
      expected: false
    },
    {
      symbol: 'PEPE',
      text: 'Pepe the frog memes are trending again! This cartoon character is so funny 😂 #memes #funny',
      expected: false
    },
    {
      symbol: 'DOGE',
      text: 'My doge is the cutest puppy ever! Look at this adorable Shiba Inu sleeping 🐕 #dogs #pets',
      expected: false
    },
    
    // EDGE CASES
    {
      symbol: 'TRUMP',
      text: 'Trump coin price prediction: $1 by end of year? What do you think? #investing',
      expected: true // Has "price" and "coin"
    },
    {
      symbol: 'MOON',
      text: 'Beautiful full moon tonight! Perfect for stargazing 🌙 #astronomy #nature',
      expected: false // Not crypto despite "moon"
    }
  ];

  console.log('🧪 Testing relevance filter with sample tweets:\n');

  let correctPredictions = 0;
  let totalTests = testTweets.length;

  for (let i = 0; i < testTweets.length; i++) {
    const test = testTweets[i];
    
    console.log(`\n📝 Test ${i + 1}: ${test.symbol}`);
    console.log(`   Tweet: "${test.text}"`);
    console.log(`   Expected: ${test.expected ? '✅ CRYPTO' : '❌ NON-CRYPTO'}`);
    
    const isRelevant = socialService.isCryptoRelevantTweet(test.text, test.symbol, test.symbol);
    console.log(`   Result: ${isRelevant ? '✅ CRYPTO' : '❌ NON-CRYPTO'}`);
    
    if (isRelevant === test.expected) {
      console.log(`   🎯 CORRECT!`);
      correctPredictions++;
    } else {
      console.log(`   ❌ WRONG! Expected ${test.expected}, got ${isRelevant}`);
    }
  }

  console.log(`\n📊 RESULTS:`);
  console.log(`   ✅ Correct: ${correctPredictions}/${totalTests} (${Math.round(correctPredictions/totalTests*100)}%)`);
  console.log(`   ❌ Wrong: ${totalTests - correctPredictions}/${totalTests}`);

  if (correctPredictions / totalTests >= 0.8) {
    console.log(`\n🎉 EXCELLENT! Filter accuracy is ${Math.round(correctPredictions/totalTests*100)}%`);
  } else if (correctPredictions / totalTests >= 0.6) {
    console.log(`\n⚠️ GOOD but needs improvement. Filter accuracy is ${Math.round(correctPredictions/totalTests*100)}%`);
  } else {
    console.log(`\n❌ POOR accuracy. Filter needs significant improvement: ${Math.round(correctPredictions/totalTests*100)}%`);
  }

  console.log(`\n💡 How this helps:`);
  console.log(`   🎯 Trump coin tweets: Only crypto-related Trump tweets counted`);
  console.log(`   🚫 Political tweets: Filtered out automatically`);
  console.log(`   📊 Accurate metrics: Community scores based on actual crypto activity`);
  console.log(`   🔍 Better insights: Social activity reflects real token interest`);
}

testRelevanceFilter().catch(console.error);

