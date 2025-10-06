const https = require('https');

const contractAddress = 'EokRU9T5biRKBArWervpYdeG1kmLLQUet3CJnaW8pump';
const url = `https://api.degen-oracle.com/api/tokens?search=${contractAddress}`;

https.get(url, (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      const token = json.tokens?.[0] || json[0];
      
      if (!token) {
        console.log('Token not found');
        return;
      }
      
      console.log('\n🔍 TOKEN ANALYSIS FOR:', token.symbol, '-', token.name);
      console.log('Contract:', token.contractAddress);
      console.log('\n📊 OVERALL SCORE:', token.overallScore || token.score || 'N/A');
      console.log('\n💰 MARKET DATA:');
      console.log('  Market Cap:', token.jupiterData?.mcap || token.marketCap || 'N/A');
      console.log('  Price:', token.jupiterData?.price || token.price || 'N/A');
      console.log('  24h Change:', token.jupiterData?.priceChange24h || 'N/A');
      console.log('  Liquidity:', token.jupiterData?.liquidityUsd || 'N/A');
      
      console.log('\n🐦 TWITTER DATA:');
      console.log('  Mentions:', token.twitterData?.mentions || token.mentions || 'N/A');
      console.log('  Display Mentions:', token.twitterData?.displayMentions || token.displayMentions || 'N/A');
      console.log('  Sentiment:', token.twitterData?.sentiment || 'N/A');
      
      console.log('\n📈 SCORING BREAKDOWN:');
      console.log('  Market Cap Score:', token.marketCapScore || 'N/A');
      console.log('  Liquidity Score:', token.liquidityScore || 'N/A');
      console.log('  Twitter Score:', token.twitterScore || 'N/A');
      console.log('  Sentiment Score:', token.sentimentScore || 'N/A');
      console.log('  Community Health:', token.communityHealthScore || 'N/A');
      console.log('  Social Links Score:', token.socialLinksScore || 'N/A');
      
      console.log('\n🔥 FUEL STATUS:');
      console.log('  Is Fueled:', token.isFueled || false);
      console.log('  Fuel Type:', token.fuelType || 'None');
      
      console.log('\n⚠️ AUDIT FLAGS:');
      console.log('  Freeze Authority:', token.audit?.freezeAuthority || 'N/A');
      console.log('  Mint Authority:', token.audit?.mintAuthority || 'N/A');
      console.log('  Top 10 Holders:', token.audit?.top10HolderPercent || 'N/A');
      
    } catch (e) {
      console.error('Error parsing JSON:', e.message);
    }
  });
}).on('error', (e) => {
  console.error('Request error:', e.message);
});
