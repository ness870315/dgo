import fs from 'fs/promises';
import path from 'path';

async function analyzeCache() {
  try {
    const cachePath = path.join('cache', 'tokens-cache.json');
    const data = await fs.readFile(cachePath, 'utf8');
    const tokens = JSON.parse(data);

    console.log(`Total tokens: ${tokens.length}`);

    let withCoinGeckoId = 0;
    let withContractAddress = 0;
    let withJupiterData = 0;
    let completedTokens = 0;

    tokens.forEach(token => {
      if (token.coinGeckoId) withCoinGeckoId++;
      if (token.contractAddress) withContractAddress++;
      if (token.jupiterData) withJupiterData++;
      if (token.stage === 'completed') completedTokens++;
    });

    console.log(`Tokens with coinGeckoId: ${withCoinGeckoId}`);
    console.log(`Tokens with contractAddress: ${withContractAddress}`);
    console.log(`Tokens with jupiterData: ${withJupiterData}`);
    console.log(`Tokens marked as completed: ${completedTokens}`);

    // Check some tokens that should have Jupiter data but don't
    const sampleTokens = tokens.filter(t => t.coinGeckoId && !t.contractAddress).slice(0, 5);
    console.log('\nSample tokens with coinGeckoId but no contractAddress:');
    sampleTokens.forEach(token => {
      console.log(`- ${token.symbol} (${token.coinGeckoId})`);
    });

  } catch (error) {
    console.error('Error analyzing cache:', error.message);
  }
}

analyzeCache();

