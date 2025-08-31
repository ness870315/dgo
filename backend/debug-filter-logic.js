// Debug the exact filter logic for the DOGE case

function debugCryptoFilter(tweetText, symbol, name) {
  const text = tweetText.toLowerCase();
  const symbolLower = symbol.toLowerCase();
  
  console.log('🔍 Step-by-step filter analysis:');
  console.log('Tweet:', tweetText);
  console.log('Text (lowercase):', text);
  console.log('Symbol:', symbolLower);
  console.log('');
  
  // CRYPTO KEYWORDS
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
  
  // NON-CRYPTO KEYWORDS
  const nonCryptoKeywords = [
    'president', 'election', 'vote', 'campaign', 'politics', 'political',
    'white house', 'congress', 'senate', 'democrat', 'republican', 'maga',
    'policy', 'government', 'administration', 'inauguration',
    'puppy', 'dog', 'pet', 'cute', 'adorable', 'sleeping', 'shiba inu',
    'animal', 'pets', 'doggy', 'puppers', 'good boy', 'good girl',
    'illustration', 'artmoots', 'fanart', 'commission', 'comission', 'ocart',
    'drawing', 'sketch', 'artwork', 'artist', 'digital art', 'art commission'
  ];
  
  // Count scores
  let cryptoScore = 0;
  let nonCryptoScore = 0;
  
  console.log('📊 Crypto keywords found:');
  for (const keyword of cryptoKeywords) {
    if (text.includes(keyword)) {
      cryptoScore += 1;
      console.log(`  ✅ "${keyword}"`);
    }
  }
  console.log(`Crypto score: ${cryptoScore}`);
  console.log('');
  
  console.log('❌ Non-crypto keywords found:');
  for (const keyword of nonCryptoKeywords) {
    if (text.includes(keyword)) {
      // Special case: Don't penalize animal keywords if they're part of the token name
      if ((keyword === 'dog' && (symbolLower.includes('dog') || name.toLowerCase().includes('dog'))) ||
          (keyword === 'cat' && (symbolLower.includes('cat') || name.toLowerCase().includes('cat'))) ||
          (keyword === 'shiba inu' && (symbolLower.includes('shib') || name.toLowerCase().includes('shib'))) ||
          (keyword === 'frog' && (symbolLower.includes('pepe') || name.toLowerCase().includes('pepe')))) {
        console.log(`  ⚠️ "${keyword}" (ignored - part of token name)`);
        continue;
      }
      nonCryptoScore += 1;
      console.log(`  ❌ "${keyword}"`);
    }
  }
  console.log(`Non-crypto score: ${nonCryptoScore}`);
  console.log('');
  
  // Special checks
  console.log('🔍 Special checks:');
  
  // Cashtag check
  const cashtag = `$${symbolLower}`;
  if (text.includes(cashtag)) {
    cryptoScore += 2;
    console.log(`  ✅ Cashtag "${cashtag}" found (+2 points)`);
  }
  
  // Price check
  if (text.match(/\$[\d,]+\.?\d*/) || text.includes('price') || text.includes('usd')) {
    cryptoScore += 1;
    console.log(`  ✅ Price-related content found (+1 point)`);
  }
  
  // Percentage check
  if (text.match(/[+-]?\d+\.?\d*%/)) {
    cryptoScore += 1;
    console.log(`  ✅ Percentage found (+1 point)`);
  }
  
  console.log(`Final crypto score: ${cryptoScore}`);
  console.log(`Final non-crypto score: ${nonCryptoScore}`);
  console.log('');
  
  // Decision logic
  console.log('🎯 Decision logic:');
  
  if (nonCryptoScore >= 1) {
    console.log(`❌ REJECTED: Non-crypto score (${nonCryptoScore}) >= 1`);
    return false;
  }
  
  if (cryptoScore >= 1) {
    console.log(`✅ ACCEPTED: Crypto score (${cryptoScore}) >= 1`);
    return true;
  }
  
  console.log('❌ REJECTED: No crypto indicators found');
  return false;
}

// Test the DOGE case
const result = debugCryptoFilter('$DOGE to the moon! Diamond hands! 💎🙌', 'DOGE', 'Dogecoin');
console.log('');
console.log('🎯 Final Result:', result ? 'CRYPTO RELEVANT' : 'NOT CRYPTO RELEVANT');
