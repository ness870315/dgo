import { Connection, PublicKey } from '@solana/web3.js';

const RPC_ENDPOINT = 'https://rpc.constant-k.com/?api-key=39facrmt-om2u-4al5-5k4h-g8pls2y5vhui';
const connection = new Connection(RPC_ENDPOINT, 'confirmed');

// From the transaction analysis, these are the reserve accounts
const VERDIS_RESERVE = '8sDu5NXd9K9fKYB31mo3N5Z1XazdNXafFymEHTCH5DW7';
const SOL_RESERVE = '4NcGXPWpiN6uepnQRynhr4KjDhdWLoa4svhHWKAc3UQ6';
const DLMM_POOL = 'FocDS3JcdafCX4nFkDZkw4sKwBv5jZm6WRGSZLjZpTdq';

console.log('🔍 ANALYZING DLMM RESERVE ACCOUNTS\n');
console.log('='.repeat(80));
console.log(`Pool: ${DLMM_POOL}`);
console.log('='.repeat(80));

// Check VERDIS reserve
console.log('\n📊 VERDIS RESERVE ACCOUNT');
console.log('-'.repeat(80));
console.log(`Address: ${VERDIS_RESERVE}\n`);

try {
  const verdisInfo = await connection.getParsedAccountInfo(new PublicKey(VERDIS_RESERVE));
  if (verdisInfo.value && verdisInfo.value.data && verdisInfo.value.data.parsed) {
    const info = verdisInfo.value.data.parsed.info;
    console.log('✅ Token Account Info:');
    console.log(`   Mint: ${info.mint}`);
    console.log(`   Owner: ${info.owner}`);
    console.log(`   Amount: ${info.tokenAmount.uiAmount.toLocaleString()} tokens`);
    console.log(`   Decimals: ${info.tokenAmount.decimals}`);
    
    // Check if owner is the pool
    if (info.owner === DLMM_POOL) {
      console.log('   ✅ Owned by the DLMM pool!');
    } else {
      console.log(`   ⚠️  NOT owned by pool, owned by: ${info.owner}`);
    }
  }
} catch (error) {
  console.log(`❌ Error: ${error.message}`);
}

// Check SOL reserve
console.log('\n📊 SOL RESERVE ACCOUNT');
console.log('-'.repeat(80));
console.log(`Address: ${SOL_RESERVE}\n`);

try {
  const solInfo = await connection.getParsedAccountInfo(new PublicKey(SOL_RESERVE));
  if (solInfo.value && solInfo.value.data && solInfo.value.data.parsed) {
    const info = solInfo.value.data.parsed.info;
    console.log('✅ Token Account Info:');
    console.log(`   Mint: ${info.mint}`);
    console.log(`   Owner: ${info.owner}`);
    console.log(`   Amount: ${info.tokenAmount.uiAmount.toLocaleString()} SOL`);
    console.log(`   Decimals: ${info.tokenAmount.decimals}`);
    
    // Check if owner is the pool
    if (info.owner === DLMM_POOL) {
      console.log('   ✅ Owned by the DLMM pool!');
    } else {
      console.log(`   ⚠️  NOT owned by pool, owned by: ${info.owner}`);
    }
  }
} catch (error) {
  console.log(`❌ Error: ${error.message}`);
}

// Calculate price
console.log('\n📊 PRICE CALCULATION');
console.log('-'.repeat(80));

try {
  const verdisInfo = await connection.getParsedAccountInfo(new PublicKey(VERDIS_RESERVE));
  const solInfo = await connection.getParsedAccountInfo(new PublicKey(SOL_RESERVE));
  
  if (verdisInfo.value?.data?.parsed && solInfo.value?.data?.parsed) {
    const verdisAmount = verdisInfo.value.data.parsed.info.tokenAmount.uiAmount;
    const solAmount = solInfo.value.data.parsed.info.tokenAmount.uiAmount;
    
    const price = solAmount / verdisAmount;
    
    console.log(`VERDIS Reserve: ${verdisAmount.toLocaleString()} tokens`);
    console.log(`SOL Reserve: ${solAmount.toLocaleString()} SOL`);
    console.log(`Price: ${price.toFixed(10)} SOL per VERDIS`);
    
    // Compare with DexScreener/Jupiter
    console.log('\n💰 Comparing with market price...');
    const response = await fetch(`https://lite-api.jup.ag/tokens/v2/search?query=BpAiFPCqjvnz7ETKjxr6ZpEKKnGGBE7rNZUU7A7eBAGS`);
    const data = await response.json();
    if (data.length > 0) {
      const jupPrice = data[0].usdPrice;
      const solPriceResponse = await fetch('https://lite-api.jup.ag/tokens/v2/search?query=SOL');
      const solPriceData = await solPriceResponse.json();
      const solPrice = solPriceData.find(t => t.id === 'So11111111111111111111111111111111111111112')?.usdPrice || 0;
      
      const ourPriceUSD = price * solPrice;
      
      console.log(`Jupiter Price: $${jupPrice.toFixed(6)}`);
      console.log(`Our Price: $${ourPriceUSD.toFixed(6)}`);
      console.log(`Difference: ${((ourPriceUSD / jupPrice - 1) * 100).toFixed(2)}%`);
    }
  }
} catch (error) {
  console.log(`❌ Error: ${error.message}`);
}

// Test: How to find these reserves programmatically
console.log('\n\n📊 FINDING RESERVES PROGRAMMATICALLY');
console.log('-'.repeat(80));
console.log('Strategy: Get recent transaction and extract token accounts\n');

try {
  const poolPubkey = new PublicKey(DLMM_POOL);
  const signatures = await connection.getSignaturesForAddress(poolPubkey, { limit: 1 });
  
  if (signatures.length > 0) {
    const tx = await connection.getParsedTransaction(signatures[0].signature, {
      maxSupportedTransactionVersion: 0
    });
    
    if (tx && tx.meta && tx.meta.postTokenBalances) {
      console.log('✅ Found token accounts from recent transaction:');
      
      const tokenAccounts = new Map();
      
      tx.meta.postTokenBalances.forEach(balance => {
        const accountIndex = balance.accountIndex;
        const account = tx.transaction.message.accountKeys[accountIndex];
        const pubkey = typeof account === 'object' && account.pubkey ? account.pubkey.toBase58() : account.toBase58();
        
        if (!tokenAccounts.has(balance.mint)) {
          tokenAccounts.set(balance.mint, []);
        }
        tokenAccounts.get(balance.mint).push({
          pubkey,
          amount: balance.uiTokenAmount.uiAmount
        });
      });
      
      console.log('\nToken accounts by mint:');
      for (const [mint, accounts] of tokenAccounts.entries()) {
        console.log(`\n  Mint: ${mint.substring(0, 20)}...`);
        accounts.forEach(acc => {
          console.log(`    ${acc.pubkey.substring(0, 44)}... (${acc.amount.toLocaleString()})`);
        });
      }
      
      console.log('\n✅ Strategy: Extract token accounts from the pool\'s first transaction!');
    }
  }
} catch (error) {
  console.log(`❌ Error: ${error.message}`);
}

console.log('\n' + '='.repeat(80));
console.log('🏁 ANALYSIS COMPLETE');
console.log('='.repeat(80));

import fetch from 'node-fetch';

