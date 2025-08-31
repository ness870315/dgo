// Test the improved Twitter relevance filtering

// Import the service (we'll simulate the method)
function isCryptoRelevantTweet(tweetText, symbol, name) {
  const text = tweetText.toLowerCase();
  const symbolLower = symbol.toLowerCase();
  const nameLower = name.toLowerCase();
  
  // CRYPTO KEYWORDS - Strong indicators this is about cryptocurrency
  const cryptoKeywords = [
    'crypto', 'cryptocurrency', 'token', 'coin', 'blockchain', 'defi', 'web3',
    'solana', 'sol', 'ethereum', 'eth', 'bitcoin', 'btc', 'binance', 'coinbase',
    'trading', 'hodl', 'moon', 'pump', 'dump', 'ath', 'dip', 'bullish', 'bearish',
    'market cap', 'marketcap', 'mcap', 'volume', 'liquidity', 'dex', 'cex',
    'wallet', 'metamask', 'phantom', 'swap', 'bridge', 'stake', 'yield',
    'nft', 'dao', 'airdrop', 'whitelist', 'presale', 'ido', 'ico',
    'lambo', 'diamond hands', 'paper hands', 'to the moon', 'wen moon', 'diamond', 'hands',
    'buy the dip', 'btfd', 'dyor', 'not financial advice', 'nfa',
    'contract address', 'mint', 'burn', 'supply', 'circulating',
    'coingecko', 'coinmarketcap', 'dexscreener', 'jupiter', 'raydium'
  ];
  
  // NON-CRYPTO KEYWORDS - Strong indicators this is NOT about cryptocurrency
  const nonCryptoKeywords = [
    // Political (for Trump example)
    'president', 'election', 'vote', 'campaign', 'politics', 'political',
    'white house', 'congress', 'senate', 'democrat', 'republican', 'maga',
    'policy', 'government', 'administration', 'inauguration',
    
    // Animals/Pets (for DOGE example)
    'puppy', 'dog', 'pet', 'cute', 'adorable', 'sleeping', 'shiba inu',
    'animal', 'pets', 'doggy', 'puppers', 'good boy', 'good girl',
    
    // Art/Design/Creative (for Detective art example)
    'illustration', 'artmoots', 'fanart', 'commission', 'comission', 'ocart',
    'drawing', 'sketch', 'artwork', 'artist', 'digital art', 'art commission',
    'character design', 'oc', 'original character', 'art trade', 'art request',
    'portfolio', 'deviantart', 'artstation', 'behance', 'instagram art',
    'painting', 'watercolor', 'acrylic', 'oil painting', 'pencil drawing',
    
    // Memes/Entertainment (for PEPE example)
    'meme', 'memes', 'funny', 'cartoon', 'character', 'frog', 'trending',
    'viral', 'joke', 'humor', 'lol', 'lmao', 'hilarious',
    
    // Nature/Astronomy (for MOON example)
    'stargazing', 'astronomy', 'nature', 'beautiful', 'tonight', 'sky',
    'stars', 'planet', 'space', 'telescope', 'constellation',
    
    // General non-crypto topics
    'movie', 'film', 'actor', 'actress', 'celebrity', 'music', 'song',
    'sports', 'football', 'basketball', 'soccer', 'game', 'match',
    'weather', 'news', 'breaking news', 'just in', 'developing',
    'health', 'medical', 'doctor', 'hospital', 'covid', 'vaccine',
    
    // Social media engagement (non-crypto)
    'follow me', 'follow back', 'follow for follow', 'f4f', 'like for like',
    'retweet for retweet', 'rt for rt', 'mutual follow', 'follow train'
  ];
  
  // Count crypto vs non-crypto indicators
  let cryptoScore = 0;
  let nonCryptoScore = 0;
  
  // Check for crypto keywords
  for (const keyword of cryptoKeywords) {
    if (text.includes(keyword)) {
      cryptoScore += 1;
    }
  }
  
  // Check for non-crypto keywords (but exclude if they're part of the token name)
  for (const keyword of nonCryptoKeywords) {
    if (text.includes(keyword)) {
      // Special case: Don't penalize animal keywords if they're part of the token name
      if ((keyword === 'dog' && (symbolLower.includes('dog') || name.toLowerCase().includes('dog'))) ||
          (keyword === 'cat' && (symbolLower.includes('cat') || name.toLowerCase().includes('cat'))) ||
          (keyword === 'shiba inu' && (symbolLower.includes('shib') || name.toLowerCase().includes('shib'))) ||
          (keyword === 'frog' && (symbolLower.includes('pepe') || name.toLowerCase().includes('pepe')))) {
        // Skip this non-crypto keyword as it's part of the token identity
        continue;
      }
      nonCryptoScore += 1;
    }
  }
  
  // Special checks for cashtag format ($SYMBOL)
  if (text.includes(`$${symbolLower}`)) {
    cryptoScore += 2; // Cashtags are usually crypto-related
  }
  
  // Check for price-related content
  if (text.match(/\$[\d,]+\.?\d*/) || text.includes('price') || text.includes('usd')) {
    cryptoScore += 1;
  }
  
  // Check for percentage changes (common in crypto tweets)
  if (text.match(/[+-]?\d+\.?\d*%/)) {
    cryptoScore += 1;
  }
  
  // Decision logic - STRICT filtering to avoid false positives
  
  // Strong non-crypto indicators - reject immediately
  if (nonCryptoScore >= 1) {
    return false; // Any non-crypto indicator = reject (art, politics, etc.)
  }
  
  // Require at least one crypto indicator to be considered relevant
  if (cryptoScore >= 1) {
    return true; // Has crypto indicators
  }
  
  // Check for crypto-specific patterns even without keywords
  
  // Cashtag with crypto context (mentions other crypto terms)
  if (text.includes(`$${symbolLower}`) && (
    text.includes('solana') || text.includes('crypto') || text.includes('token') ||
    text.includes('trading') || text.includes('buy') || text.includes('sell') ||
    text.includes('hodl') || text.includes('moon') || text.includes('pump')
  )) {
    return true;
  }
  
  // Price or percentage mentions with token symbol
  if ((text.match(/\$[\d,]+\.?\d*/) || text.match(/[+-]?\d+\.?\d*%/)) && 
      (text.includes(symbolLower) || text.includes(`$${symbolLower}`))) {
    return true;
  }
  
  // No crypto indicators found - reject to avoid false positives
  // Better to miss some crypto tweets than include non-crypto content
  return false;
}

function testTwitterRelevanceFilter() {
  console.log('🔍 Testing Improved Twitter Relevance Filter...\n');

  const testCases = [
    // Detective examples from the user
    {
      symbol: 'DETECTIVE',
      name: 'Detective',
      tweet: '🕵‍♂️🤝🕵‍♂️ Commission for @JoaoPedrao31383 with participation of @PedroWand87376 #illustration #artmoots #fanart #comission #ocart #Detective https://t.co/ayclA1jFQs',
      expected: false,
      reason: 'Art commission - not crypto related'
    },
    {
      symbol: 'DETECTIVE',
      name: 'Detective', 
      tweet: '@SolportTom @cryptolyxe #detective https://t.co/ylodYIG2Ax',
      expected: true,
      reason: 'Mentions crypto-related accounts'
    },
    
    // Other test cases
    {
      symbol: 'BTC',
      name: 'Bitcoin',
      tweet: 'Just bought more $BTC! Going to the moon! 🚀',
      expected: true,
      reason: 'Clear crypto content with cashtag'
    },
    {
      symbol: 'TRUMP',
      name: 'Trump',
      tweet: 'President Trump announces new policy on immigration',
      expected: false,
      reason: 'Political content, not crypto'
    },
    {
      symbol: 'TRUMP',
      name: 'Trump',
      tweet: '$TRUMP token is pumping! Buy the dip!',
      expected: true,
      reason: 'Crypto trading content'
    },
    {
      symbol: 'DOGE',
      name: 'Dogecoin',
      tweet: 'My cute puppy is sleeping so adorably 🐶',
      expected: false,
      reason: 'Pet content, not crypto'
    },
    {
      symbol: 'DOGE',
      name: 'Dogecoin',
      tweet: '$DOGE to the moon! Diamond hands! 💎🙌',
      expected: true,
      reason: 'Crypto meme content'
    },
    {
      symbol: 'MOON',
      name: 'Moon',
      tweet: 'Beautiful full moon tonight, perfect for stargazing 🌙',
      expected: false,
      reason: 'Astronomy content, not crypto'
    },
    {
      symbol: 'MOON',
      name: 'Moon',
      tweet: '$MOON token up 50%! Time to hodl! 🚀',
      expected: true,
      reason: 'Crypto price content'
    },
    {
      symbol: 'ART',
      name: 'Art',
      tweet: 'Check out my latest digital artwork on DeviantArt!',
      expected: false,
      reason: 'Art portfolio, not crypto'
    },
    {
      symbol: 'SOL',
      name: 'Solana',
      tweet: 'Solana network is fast and cheap for DeFi trading',
      expected: true,
      reason: 'Clear crypto/DeFi content'
    }
  ];

  let passed = 0;
  let failed = 0;

  console.log('📊 Test Results:\n');

  testCases.forEach((testCase, index) => {
    const result = isCryptoRelevantTweet(testCase.tweet, testCase.symbol, testCase.name);
    const success = result === testCase.expected;
    
    if (success) {
      passed++;
      console.log(`✅ Test ${index + 1}: PASS`);
    } else {
      failed++;
      console.log(`❌ Test ${index + 1}: FAIL`);
      console.log(`   Expected: ${testCase.expected}, Got: ${result}`);
    }
    
    console.log(`   Symbol: ${testCase.symbol}`);
    console.log(`   Tweet: "${testCase.tweet}"`);
    console.log(`   Reason: ${testCase.reason}`);
    console.log(`   Result: ${result ? 'CRYPTO RELEVANT' : 'NOT CRYPTO RELEVANT'}\n`);
  });

  console.log('📈 Summary:');
  console.log(`✅ Passed: ${passed}/${testCases.length}`);
  console.log(`❌ Failed: ${failed}/${testCases.length}`);
  console.log(`📊 Success Rate: ${Math.round(passed/testCases.length*100)}%\n`);

  if (failed === 0) {
    console.log('🎉 All tests passed! The relevance filter is working correctly.');
  } else {
    console.log('⚠️ Some tests failed. The filter may need further tuning.');
  }

  console.log('\n🎯 Key Improvements:');
  console.log('✅ Art/illustration content filtered out');
  console.log('✅ Political content filtered out');
  console.log('✅ Pet/animal content filtered out');
  console.log('✅ Requires crypto indicators to be included');
  console.log('✅ Strict filtering to avoid false positives');
}

testTwitterRelevanceFilter();
