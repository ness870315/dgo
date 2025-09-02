import fs from 'fs/promises';
import path from 'path';

async function investigateJupiterMarketCap() {
  try {
    console.log('🔍 INVESTIGATING JUPITER MARKET CAP ISSUE\n');

    // Load tokens from backend cache
    const tokensPath = path.join('backend', 'cache', 'tokens-cache.json');
    const tokensData = await fs.readFile(tokensPath, 'utf8');
    const tokens = JSON.parse(tokensData);

    // Target tokens to analyze
    const targetTokens = ['NUB', 'FWOG', 'GIGA', 'UFD'];
    
    console.log(`📊 Analyzing Jupiter data structure for Market Cap issues...\n`);

    for (const targetSymbol of targetTokens) {
      const token = tokens.find(t => t.symbol === targetSymbol);
      
      if (!token) {
        console.log(`❌ ${targetSymbol}: Not found in cache\n`);
        continue;
      }

      console.log(`🎯 ===== ${targetSymbol} JUPITER DATA ANALYSIS =====`);
      
      if (token.jupiterData) {
        console.log(`✅ Has Jupiter Data - Full Object Structure:`);
        console.log(JSON.stringify(token.jupiterData, null, 2));
        
        console.log(`\n📊 Market Cap Analysis:`);
        console.log(`   • jupiterData.marketCap: ${token.jupiterData.marketCap}`);
        console.log(`   • jupiterData.market_cap: ${token.jupiterData.market_cap}`);
        console.log(`   • jupiterData.fdv: ${token.jupiterData.fdv}`);
        console.log(`   • jupiterData.mc: ${token.jupiterData.mc}`);
        
        console.log(`\n💰 Price & Supply Analysis:`);
        console.log(`   • Price: ${token.jupiterData.usdPrice || token.jupiterData.price}`);
        console.log(`   • Total Supply: ${token.jupiterData.totalSupply || token.jupiterData.total_supply}`);
        console.log(`   • Circulating Supply: ${token.jupiterData.circSupply || token.jupiterData.circulating_supply}`);
        
        // Calculate market cap manually if possible
        const price = token.jupiterData.usdPrice || token.jupiterData.price;
        const totalSupply = token.jupiterData.totalSupply || token.jupiterData.total_supply;
        const circSupply = token.jupiterData.circSupply || token.jupiterData.circulating_supply;
        
        if (price && totalSupply) {
          const calculatedMarketCap = price * totalSupply;
          console.log(`\n🧮 Manual Market Cap Calculation:`);
          console.log(`   • Price × Total Supply = ${price} × ${totalSupply} = $${calculatedMarketCap.toLocaleString()}`);
        }
        
        if (price && circSupply) {
          const calculatedCircMarketCap = price * circSupply;
          console.log(`   • Price × Circulating Supply = ${price} × ${circSupply} = $${calculatedCircMarketCap.toLocaleString()}`);
        }
        
        console.log(`\n🔍 All Jupiter Data Keys:`);
        console.log(`   Available keys: ${Object.keys(token.jupiterData).join(', ')}`);
        
      } else {
        console.log(`❌ No Jupiter Data found`);
      }
      
      console.log(`\n${'='.repeat(80)}\n`);
    }

    // Also check a few other tokens to see if this is a widespread issue
    console.log(`🔍 CHECKING OTHER TOKENS FOR COMPARISON:\n`);
    
    const otherTokens = tokens.slice(0, 5).filter(t => !targetTokens.includes(t.symbol));
    
    for (const token of otherTokens) {
      console.log(`📊 ${token.symbol} (${token.name}):`);
      if (token.jupiterData) {
        console.log(`   • marketCap: ${token.jupiterData.marketCap}`);
        console.log(`   • fdv: ${token.jupiterData.fdv}`);
        console.log(`   • price: ${token.jupiterData.usdPrice || token.jupiterData.price}`);
        console.log(`   • Keys: ${Object.keys(token.jupiterData).slice(0, 10).join(', ')}...`);
      } else {
        console.log(`   • No Jupiter data`);
      }
      console.log('');
    }

  } catch (error) {
    console.error('❌ Error investigating Jupiter market cap:', error.message);
  }
}

investigateJupiterMarketCap();




