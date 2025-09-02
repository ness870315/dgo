// Debug the DOGE test case

const tweet = '$DOGE to the moon! Diamond hands! 💎🙌';
const symbol = 'DOGE';
const text = tweet.toLowerCase();
const symbolLower = symbol.toLowerCase();

console.log('🔍 Debugging DOGE Test Case:');
console.log('Original tweet:', tweet);
console.log('Lowercase text:', text);
console.log('Symbol:', symbolLower);
console.log('');

// Check cashtag
const cashtag = `$${symbolLower}`;
console.log('Looking for cashtag:', cashtag);
console.log('Contains cashtag:', text.includes(cashtag));
console.log('');

// Check crypto keywords
const cryptoKeywords = ['moon', 'diamond', 'hands', 'diamond hands'];
console.log('Crypto keywords found:');
cryptoKeywords.forEach(keyword => {
  if (text.includes(keyword)) {
    console.log(`  ✅ "${keyword}"`);
  }
});

// Check non-crypto keywords  
const nonCryptoKeywords = ['cute', 'puppy', 'adorable', 'sleeping'];
console.log('Non-crypto keywords found:');
let foundNonCrypto = false;
nonCryptoKeywords.forEach(keyword => {
  if (text.includes(keyword)) {
    console.log(`  ❌ "${keyword}"`);
    foundNonCrypto = true;
  }
});

if (!foundNonCrypto) {
  console.log('  (none)');
}

console.log('');
console.log('Expected result: CRYPTO RELEVANT (true)');
console.log('Reason: Contains cashtag $DOGE + crypto keywords (moon, diamond, hands)');




