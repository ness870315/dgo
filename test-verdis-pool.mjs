import fetch from 'node-fetch';
import { Connection, PublicKey } from '@solana/web3.js';

const MORALIS_API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJub25jZSI6IjM1MDZiMzhjLTY5ZjUtNDkxZi1hYWZiLWZiMWU1OTkwZjE0YyIsIm9yZ0lkIjoiMzg5MzI4IiwidXNlcklkIjoiNDAwMDYwIiwidHlwZUlkIjoiNzBiNTgxMTItMGQ2MS00NmFlLWI2ODgtNGNmNWRkOWQ0MjExIiwidHlwZSI6IlBST0pFQ1QiLCJpYXQiOjE3NjA5MDEyNjQsImV4cCI6NDkxNjY2MTI2NH0.BMO8_NLNDwFvWE-3nFM4A7aLrTbDqfrHeb-Yptt1018';
const RPC_ENDPOINT = 'https://rpc.constant-k.com/?api-key=39facrmt-om2u-4al5-5k4h-g8pls2y5vhui';
const mint = 'BpAiFPCqjvnz7ETKjxr6ZpEKKnGGBE7rNZUU7A7eBAGS';

const connection = new Connection(RPC_ENDPOINT, 'confirmed');

console.log('🔍 Investigating VERDIS token...\n');
console.log(`Mint: ${mint}\n`);

// Check Jupiter
console.log('📡 Checking Jupiter API...');
const jupResponse = await fetch(`https://lite-api.jup.ag/tokens/v2/search?query=${mint}`);
const jupData = await jupResponse.json();

if (jupData.length > 0) {
  const token = jupData[0];
  console.log(`✅ Found in Jupiter:`);
  console.log(`   Name: ${token.name}`);
  console.log(`   Symbol: ${token.symbol}`);
  console.log(`   Decimals: ${token.decimals}`);
  console.log(`   CircSupply: ${token.circSupply?.toLocaleString() || 'N/A'}`);
  console.log(`   Price: $${token.usdPrice?.toFixed(6) || 'N/A'}`);
  console.log(`   GraduatedPool: ${token.graduatedPool || 'N/A'}`);
} else {
  console.log('❌ Not found in Jupiter');
}

// Check Moralis
console.log('\n📡 Checking Moralis API...');
const moralisResponse = await fetch(`https://solana-gateway.moralis.io/token/mainnet/${mint}/pairs`, {
  headers: { 'X-API-Key': MORALIS_API_KEY }
});

if (!moralisResponse.ok) {
  console.log(`❌ Moralis error: ${moralisResponse.status}`);
} else {
  const moralisData = await moralisResponse.json();
  
  if (moralisData.pairs && moralisData.pairs.length > 0) {
    console.log(`✅ Found ${moralisData.pairs.length} pairs\n`);
    
    const activePairs = moralisData.pairs
      .filter(p => !p.inactivePair)
      .sort((a, b) => (b.liquidityUsd || 0) - (a.liquidityUsd || 0));
    
    console.log(`Active pairs with highest liquidity:\n`);
    for (let i = 0; i < Math.min(5, activePairs.length); i++) {
      const pair = activePairs[i];
      console.log(`${i + 1}. ${pair.exchangeName} - ${pair.pairLabel}`);
      console.log(`   Pool Address: ${pair.pairAddress}`);
      console.log(`   Liquidity: $${(pair.liquidityUsd / 1000).toFixed(2)}K`);
      console.log(`   Volume 24h: $${(pair.volume24hrUsd / 1000).toFixed(2)}K`);
      console.log(`   Quote Token: ${pair.quoteToken}`);
      
      // Try to inspect this pool
      console.log(`   🔍 Inspecting pool accounts...`);
      try {
        const poolPubkey = new PublicKey(pair.pairAddress);
        const poolAccounts = await connection.getParsedTokenAccountsByOwner(poolPubkey, {
          programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
        });
        
        console.log(`   ✅ Found ${poolAccounts.value.length} token accounts:`);
        poolAccounts.value.forEach(acc => {
          const mint = acc.account.data.parsed.info.mint;
          const amount = acc.account.data.parsed.info.tokenAmount.uiAmount;
          console.log(`      - ${acc.pubkey.toBase58().substring(0, 20)}... Mint: ${mint.substring(0, 20)}... Amount: ${amount?.toLocaleString()}`);
        });
      } catch (error) {
        console.log(`   ❌ Error inspecting pool: ${error.message}`);
      }
      console.log('');
    }
  } else {
    console.log('❌ No pairs found');
  }
}

