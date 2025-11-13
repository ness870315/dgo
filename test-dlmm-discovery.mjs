import { Connection, PublicKey } from '@solana/web3.js';

const RPC_ENDPOINT = 'https://rpc.constant-k.com/?api-key=39facrmt-om2u-4al5-5k4h-g8pls2y5vhui';
const connection = new Connection(RPC_ENDPOINT, 'confirmed');

/**
 * Discover reserve accounts for a DLMM pool by analyzing recent transactions
 */
async function discoverDLMMReserves(poolAddress, tokenMint, quoteMint) {
  console.log(`\n🔍 Discovering DLMM reserves for pool: ${poolAddress}`);
  console.log(`   Token Mint: ${tokenMint}`);
  console.log(`   Quote Mint: ${quoteMint}\n`);
  
  try {
    const poolPubkey = new PublicKey(poolAddress);
    
    // Get recent transactions (try up to 10 to find a swap)
    const signatures = await connection.getSignaturesForAddress(poolPubkey, { limit: 10 });
    
    if (signatures.length === 0) {
      console.log('❌ No transactions found for this pool');
      return null;
    }
    
    console.log(`✅ Found ${signatures.length} recent transactions`);
    
    // Try each transaction until we find one with token balances
    for (let i = 0; i < signatures.length; i++) {
      const tx = await connection.getParsedTransaction(signatures[i].signature, {
        maxSupportedTransactionVersion: 0
      });
      
      if (!tx || !tx.meta || !tx.meta.postTokenBalances || tx.meta.postTokenBalances.length === 0) {
        continue;
      }
      
      console.log(`\n📝 Analyzing transaction ${i + 1}/${signatures.length}: ${signatures[i].signature.substring(0, 20)}...`);
      
      // Group token accounts by mint
      const accountsByMint = new Map();
      
      tx.meta.postTokenBalances.forEach(balance => {
        const accountIndex = balance.accountIndex;
        const account = tx.transaction.message.accountKeys[accountIndex];
        const pubkey = typeof account === 'object' && account.pubkey ? account.pubkey.toBase58() : account.toBase58();
        
        if (!accountsByMint.has(balance.mint)) {
          accountsByMint.set(balance.mint, []);
        }
        
        accountsByMint.get(balance.mint).push({
          pubkey,
          amount: balance.uiTokenAmount.uiAmount,
          decimals: balance.uiTokenAmount.decimals
        });
      });
      
      // Find the reserve accounts (largest balance for each mint)
      const tokenReserve = accountsByMint.get(tokenMint)?.sort((a, b) => b.amount - a.amount)[0];
      const quoteReserve = accountsByMint.get(quoteMint)?.sort((a, b) => b.amount - a.amount)[0];
      
      if (tokenReserve && quoteReserve) {
        console.log(`\n✅ Found reserve accounts!`);
        console.log(`   Token Reserve: ${tokenReserve.pubkey}`);
        console.log(`      Amount: ${tokenReserve.amount.toLocaleString()} tokens`);
        console.log(`   Quote Reserve: ${quoteReserve.pubkey}`);
        console.log(`      Amount: ${quoteReserve.amount.toLocaleString()}`);
        
        const price = quoteReserve.amount / tokenReserve.amount;
        console.log(`   Price: ${price.toFixed(10)} quote per token`);
        
        return {
          poolTokenAccount: tokenReserve.pubkey,
          poolQuoteAccount: quoteReserve.pubkey,
          tokenReserve: tokenReserve.amount,
          quoteReserve: quoteReserve.amount,
          price,
          tokenDecimals: tokenReserve.decimals,
          quoteDecimals: quoteReserve.decimals
        };
      }
    }
    
    console.log('\n❌ Could not find reserve accounts in any transaction');
    return null;
    
  } catch (error) {
    console.error(`❌ Error discovering reserves: ${error.message}`);
    return null;
  }
}

// Test with VERDIS DLMM pool
console.log('🎯 TESTING DLMM RESERVE DISCOVERY\n');
console.log('='.repeat(80));

const VERDIS_DLMM_POOL = 'FocDS3JcdafCX4nFkDZkw4sKwBv5jZm6WRGSZLjZpTdq';
const VERDIS_MINT = 'BpAiFPCqjvnz7ETKjxr6ZpEKKnGGBE7rNZUU7A7eBAGS';
const SOL_MINT = 'So11111111111111111111111111111111111111112';

const result = await discoverDLMMReserves(VERDIS_DLMM_POOL, VERDIS_MINT, SOL_MINT);

if (result) {
  console.log('\n' + '='.repeat(80));
  console.log('✅ SUCCESS - Reserve accounts discovered!');
  console.log('='.repeat(80));
  console.log('\nThese accounts can now be monitored via gRPC for real-time swaps!');
} else {
  console.log('\n' + '='.repeat(80));
  console.log('❌ FAILED - Could not discover reserves');
  console.log('='.repeat(80));
}

