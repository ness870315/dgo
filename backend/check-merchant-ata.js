/**
 * Check if Merchant USDC ATA exists on Solana Mainnet
 * 
 * This script:
 * 1. Derives the merchant's USDC ATA address
 * 2. Checks if it exists on mainnet
 * 3. If not, shows how to create it
 * 
 * Run: node backend/check-merchant-ata.js
 */

import { Connection, PublicKey, Keypair, VersionedTransaction, TransactionMessage } from '@solana/web3.js';
import { 
  getAssociatedTokenAddress, 
  getAccount, 
  createAssociatedTokenAccountInstruction,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID
} from '@solana/spl-token';
import fs from 'fs';

// ===== CONFIGURATION =====
const RPC_URL = process.env.SOLANA_MAINNET_RPC || 'https://mainnet.helius-rpc.com/?api-key=e20ea2f4-232f-484e-be1e-e41b698a7850';
const USDC_MAINNET = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const MERCHANT_WALLET = new PublicKey('3hn5fWZEf2yUZcwU2CV2Wkvk7YDiysM8xBwmesFg7sN1');

// Path to merchant keypair (if you want to auto-create)
const MERCHANT_KEYPAIR_PATH = process.env.MERCHANT_KEYPAIR_PATH || './merchant-keypair.json';

async function checkMerchantATA() {
  console.log('🔍 Checking Merchant USDC ATA on Solana Mainnet...\n');
  console.log('📍 Merchant Wallet:', MERCHANT_WALLET.toBase58());
  console.log('💰 USDC Mint:', USDC_MAINNET.toBase58());
  console.log('🌐 RPC:', RPC_URL.split('?')[0] + '...\n');

  const connection = new Connection(RPC_URL, 'confirmed');

  try {
    // Derive the ATA address
    const ata = await getAssociatedTokenAddress(
      USDC_MAINNET,
      MERCHANT_WALLET,
      false, // allowOwnerOffCurve
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    console.log('✅ Derived USDC ATA:', ata.toBase58());
    console.log('🔗 Solscan:', `https://solscan.io/account/${ata.toBase58()}\n`);

    // Try to fetch the account
    try {
      const accountInfo = await getAccount(connection, ata);
      
      console.log('✅ ATA EXISTS on mainnet!');
      console.log('   Owner:', accountInfo.owner.toBase58());
      console.log('   Mint:', accountInfo.mint.toBase58());
      console.log('   Balance:', Number(accountInfo.amount) / 1e6, 'USDC');
      console.log('\n✅ All good! Merchant can receive USDC payments.\n');
      
      return { exists: true, address: ata.toBase58(), balance: Number(accountInfo.amount) / 1e6 };
    } catch (err) {
      if (err.message.includes('could not find account')) {
        console.log('❌ ATA DOES NOT EXIST on mainnet!\n');
        console.log('📝 You need to create it before accepting payments.\n');
        
        // Check if we have the merchant keypair to auto-create
        if (fs.existsSync(MERCHANT_KEYPAIR_PATH)) {
          console.log('🔑 Found merchant keypair, attempting to create ATA...\n');
          await createMerchantATA(connection, ata);
        } else {
          console.log('⚠️  Merchant keypair not found at:', MERCHANT_KEYPAIR_PATH);
          console.log('\n📋 To create the ATA, run this from a wallet with SOL:\n');
          showCreationInstructions(ata);
        }
        
        return { exists: false, address: ata.toBase58() };
      }
      throw err;
    }
  } catch (error) {
    console.error('❌ Error checking ATA:', error.message);
    process.exit(1);
  }
}

async function createMerchantATA(connection, ata) {
  try {
    // Load merchant keypair
    const keypairData = JSON.parse(fs.readFileSync(MERCHANT_KEYPAIR_PATH, 'utf-8'));
    const merchantKeypair = Keypair.fromSecretKey(Uint8Array.from(keypairData));
    
    console.log('🔨 Creating USDC ATA for merchant...');
    
    // Check SOL balance
    const balance = await connection.getBalance(merchantKeypair.publicKey);
    console.log('💰 Merchant SOL balance:', balance / 1e9, 'SOL');
    
    if (balance < 0.002 * 1e9) {
      console.log('❌ Insufficient SOL! Need at least 0.002 SOL for rent + fees.');
      console.log('   Send SOL to:', merchantKeypair.publicKey.toBase58());
      return;
    }
    
    // Create the ATA
    const ix = createAssociatedTokenAccountInstruction(
      merchantKeypair.publicKey, // payer
      ata, // ata address
      MERCHANT_WALLET, // owner
      USDC_MAINNET, // mint
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    
    const { blockhash } = await connection.getLatestBlockhash();
    const msg = new TransactionMessage({
      payerKey: merchantKeypair.publicKey,
      recentBlockhash: blockhash,
      instructions: [ix],
    }).compileToV0Message();
    
    const tx = new VersionedTransaction(msg);
    tx.sign([merchantKeypair]);
    
    console.log('📤 Sending transaction...');
    const signature = await connection.sendTransaction(tx, { skipPreflight: false });
    
    console.log('⏳ Confirming...');
    await connection.confirmTransaction(signature, 'confirmed');
    
    console.log('✅ ATA CREATED successfully!');
    console.log('   Signature:', signature);
    console.log('   ATA Address:', ata.toBase58());
    console.log('   🔗 View on Solscan:', `https://solscan.io/tx/${signature}\n`);
    
  } catch (error) {
    console.error('❌ Error creating ATA:', error.message);
    console.log('\n📋 Manual creation instructions:\n');
    showCreationInstructions(ata);
  }
}

function showCreationInstructions(ata) {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('Option 1: Use Phantom Wallet (Easiest)');
  console.log('════════════════════════════════════════════════════════════════');
  console.log('1. Open Phantom with merchant wallet:', MERCHANT_WALLET.toBase58());
  console.log('2. Go to: https://solscan.io/account/' + USDC_MAINNET.toBase58());
  console.log('3. Click "Send" and enter 0 USDC to yourself');
  console.log('4. This will auto-create your USDC ATA\n');
  
  console.log('════════════════════════════════════════════════════════════════');
  console.log('Option 2: Use SPL Token CLI');
  console.log('════════════════════════════════════════════════════════════════');
  console.log('spl-token create-account EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v \\');
  console.log('  --owner', MERCHANT_WALLET.toBase58(), '\n');
  
  console.log('════════════════════════════════════════════════════════════════');
  console.log('Option 3: Manual Script (Node.js)');
  console.log('════════════════════════════════════════════════════════════════');
  console.log('1. Save your merchant private key to:', MERCHANT_KEYPAIR_PATH);
  console.log('2. Format: [1,2,3,...] (array of 64 numbers)');
  console.log('3. Re-run this script: node backend/check-merchant-ata.js\n');
  
  console.log('Expected ATA Address:', ata.toBase58());
  console.log('════════════════════════════════════════════════════════════════\n');
}

// Run the check
checkMerchantATA()
  .then((result) => {
    if (result.exists) {
      console.log('🎉 Ready to accept x402 payments!');
    } else {
      console.log('⚠️  Create the ATA before accepting payments.');
    }
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Fatal error:', err);
    process.exit(1);
  });

