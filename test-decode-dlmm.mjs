import { Connection, PublicKey } from '@solana/web3.js';
import fetch from 'node-fetch';

const RPC_ENDPOINT = 'https://rpc.constant-k.com/?api-key=39facrmt-om2u-4al5-5k4h-g8pls2y5vhui';
const connection = new Connection(RPC_ENDPOINT, 'confirmed');

// VERDIS Meteora Dynamic AMM v2 pool (the one that failed)
const DLMM_POOL = 'FocDS3JcdafCX4nFkDZkw4sKwBv5jZm6WRGSZLjZpTdq';
const VERDIS_MINT = 'BpAiFPCqjvnz7ETKjxr6ZpEKKnGGBE7rNZUU7A7eBAGS';
const SOL_MINT = 'So11111111111111111111111111111111111111112';

console.log('🔍 INVESTIGATING METEORA DYNAMIC AMM V2 (DLMM) POOL\n');
console.log('='.repeat(80));
console.log(`Pool: ${DLMM_POOL}`);
console.log(`Token: VERDIS (${VERDIS_MINT})`);
console.log('='.repeat(80));

const poolPubkey = new PublicKey(DLMM_POOL);

// Step 1: Get the pool account itself
console.log('\n📊 STEP 1: Pool Account Info');
console.log('-'.repeat(80));
try {
  const accountInfo = await connection.getAccountInfo(poolPubkey);
  if (accountInfo) {
    console.log(`✅ Pool account exists`);
    console.log(`   Owner: ${accountInfo.owner.toBase58()}`);
    console.log(`   Lamports: ${accountInfo.lamports}`);
    console.log(`   Data Length: ${accountInfo.data.length} bytes`);
    console.log(`   Executable: ${accountInfo.executable}`);
    console.log(`   Rent Epoch: ${accountInfo.rentEpoch}`);
    
    // Try to decode some basic info
    console.log('\n   📝 Raw Data (first 200 bytes):');
    const dataHex = accountInfo.data.slice(0, 200).toString('hex');
    console.log(`   ${dataHex.match(/.{1,64}/g).join('\n   ')}`);
  } else {
    console.log('❌ Pool account not found');
  }
} catch (error) {
  console.log(`❌ Error: ${error.message}`);
}

// Step 2: Try to find associated accounts
console.log('\n\n📊 STEP 2: Token Accounts Owned by Pool');
console.log('-'.repeat(80));
try {
  const tokenAccounts = await connection.getParsedTokenAccountsByOwner(poolPubkey, {
    programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
  });
  
  console.log(`Found ${tokenAccounts.value.length} token accounts`);
  if (tokenAccounts.value.length === 0) {
    console.log('⚠️  This pool does not own token accounts directly!');
    console.log('   DLMM pools use a different structure...');
  }
} catch (error) {
  console.log(`❌ Error: ${error.message}`);
}

// Step 3: Get parsed account info
console.log('\n\n📊 STEP 3: Parsed Account Info');
console.log('-'.repeat(80));
try {
  const parsedInfo = await connection.getParsedAccountInfo(poolPubkey);
  if (parsedInfo.value) {
    console.log('✅ Parsed account info:');
    console.log(JSON.stringify(parsedInfo.value, null, 2));
  }
} catch (error) {
  console.log(`❌ Error: ${error.message}`);
}

// Step 4: Try to find Program Derived Addresses (PDAs)
console.log('\n\n📊 STEP 4: Looking for PDAs (Program Derived Addresses)');
console.log('-'.repeat(80));
console.log('DLMM pools typically use PDAs for reserves...\n');

// Meteora DLMM program ID
const METEORA_DLMM_PROGRAM = new PublicKey('LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo');

// Try common PDA seeds
const seeds = [
  ['reserve_x'],
  ['reserve_y'],
  ['bin_array'],
  ['oracle'],
  ['position'],
  ['token_x'],
  ['token_y']
];

for (const seed of seeds) {
  try {
    const [pda, bump] = PublicKey.findProgramAddressSync(
      [Buffer.from(seed[0]), poolPubkey.toBuffer()],
      METEORA_DLMM_PROGRAM
    );
    
    const accountInfo = await connection.getAccountInfo(pda);
    if (accountInfo) {
      console.log(`✅ Found PDA for seed "${seed[0]}":`);
      console.log(`   Address: ${pda.toBase58()}`);
      console.log(`   Bump: ${bump}`);
      console.log(`   Owner: ${accountInfo.owner.toBase58()}`);
      console.log(`   Data Length: ${accountInfo.data.length} bytes`);
      
      // Check if it's a token account
      if (accountInfo.owner.toBase58() === 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') {
        console.log(`   🪙 This is a TOKEN ACCOUNT!`);
        const parsedToken = await connection.getParsedAccountInfo(pda);
        if (parsedToken.value && parsedToken.value.data && parsedToken.value.data.parsed) {
          const info = parsedToken.value.data.parsed.info;
          console.log(`      Mint: ${info.mint}`);
          console.log(`      Amount: ${info.tokenAmount.uiAmount}`);
        }
      }
      console.log('');
    }
  } catch (error) {
    // PDA not found, continue
  }
}

// Step 5: Get all accounts owned by the DLMM program related to this pool
console.log('\n📊 STEP 5: Scanning for Related Accounts');
console.log('-'.repeat(80));
console.log('Searching for accounts that might be related to this pool...\n');

try {
  // Get signature for this pool to see recent transactions
  const signatures = await connection.getSignaturesForAddress(poolPubkey, { limit: 5 });
  
  if (signatures.length > 0) {
    console.log(`✅ Found ${signatures.length} recent transactions\n`);
    
    // Get the most recent transaction to see what accounts it uses
    const tx = await connection.getParsedTransaction(signatures[0].signature, {
      maxSupportedTransactionVersion: 0
    });
    
    if (tx && tx.transaction) {
      console.log('📝 Most Recent Transaction:');
      console.log(`   Signature: ${signatures[0].signature}`);
      console.log(`   Slot: ${signatures[0].slot}`);
      console.log('\n   Accounts involved:');
      
      const accountKeys = tx.transaction.message.accountKeys;
      accountKeys.forEach((key, i) => {
        const pubkey = typeof key === 'object' && key.pubkey ? key.pubkey.toBase58() : key.toBase58();
        const writable = typeof key === 'object' && key.writable !== undefined ? key.writable : false;
        console.log(`   ${i + 1}. ${pubkey} ${writable ? '(writable)' : '(readonly)'}`);
      });
      
      // Check for token balance changes
      if (tx.meta && tx.meta.postTokenBalances && tx.meta.preTokenBalances) {
        console.log('\n   💰 Token Balance Changes:');
        tx.meta.postTokenBalances.forEach((post, i) => {
          const pre = tx.meta.preTokenBalances.find(p => p.accountIndex === post.accountIndex);
          if (pre) {
            const change = post.uiTokenAmount.uiAmount - pre.uiTokenAmount.uiAmount;
            if (Math.abs(change) > 0.000001) {
              const account = accountKeys[post.accountIndex];
              const pubkey = typeof account === 'object' && account.pubkey ? account.pubkey.toBase58() : account.toBase58();
              console.log(`      Account ${post.accountIndex} (${pubkey.substring(0, 20)}...)`);
              console.log(`         Mint: ${post.mint.substring(0, 20)}...`);
              console.log(`         Change: ${change > 0 ? '+' : ''}${change.toFixed(6)}`);
            }
          }
        });
      }
    }
  } else {
    console.log('⚠️  No recent transactions found');
  }
} catch (error) {
  console.log(`❌ Error: ${error.message}`);
}

console.log('\n' + '='.repeat(80));
console.log('🏁 INVESTIGATION COMPLETE');
console.log('='.repeat(80));

