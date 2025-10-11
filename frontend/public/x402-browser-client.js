/**
 * Browser-compatible x402 Client for Solana
 * Adapted from x402-fetch for use with Phantom/Solflare wallets
 */

class X402BrowserClient {
  constructor() {
    this.wallet = null;
    this.walletAdapter = null;
  }

  /**
   * Connect to Solana wallet (Phantom, Solflare, Backpack, etc.)
   */
  async connectWallet() {
    console.log('[x402] 🔗 Connecting to Solana wallet...');
    
    // Auto-detect available wallet
    let provider = null;
    let walletName = '';

    if (window.solana && window.solana.isPhantom) {
      provider = window.solana;
      walletName = 'Phantom';
    } else if (window.solflare) {
      provider = window.solflare;
      walletName = 'Solflare';
    } else if (window.backpack) {
      provider = window.backpack;
      walletName = 'Backpack';
    } else {
      throw new Error('No Solana wallet detected. Please install Phantom, Solflare, or Backpack.');
    }

    console.log(`[x402] 💼 Connecting to ${walletName}...`);
    
    const resp = await provider.connect();
    this.wallet = resp.publicKey;
    this.walletAdapter = provider;
    
    console.log(`[x402] ✅ Connected to ${walletName}:`, this.wallet.toString());
    
    return {
      publicKey: this.wallet.toString(),
      walletName
    };
  }

  /**
   * Wrap fetch with x402 payment handling
   * Similar to wrapFetchWithPayment from x402-fetch
   */
  async fetchWithPayment(url, options = {}) {
    console.log('[x402] 🚀 Making request to:', url);
    
    // Make initial request
    const response = await fetch(url, options);
    
    // Check if payment is required (402 status)
    if (response.status !== 402) {
      console.log('[x402] ✅ No payment required, returning response');
      return response;
    }

    console.log('[x402] 💰 Payment required (402), processing payment...');
    
    // Parse payment requirements from 402 response
    const paymentData = await response.json();
    const paymentRequirements = paymentData.paymentRequirements;
    
    if (!paymentRequirements) {
      throw new Error('Invalid 402 response: missing paymentRequirements');
    }

    console.log('[x402] 📋 Payment requirements:', paymentRequirements);

    // Ensure wallet is connected
    if (!this.wallet || !this.walletAdapter) {
      await this.connectWallet();
    }

    // Build and sign payment transaction
    const paymentPayload = await this.buildPaymentTransaction(paymentRequirements);
    
    // Encode payment payload to base64 (x402 format)
    const xPaymentHeader = btoa(JSON.stringify(paymentPayload));
    
    console.log('[x402] 📡 Retrying request with X-PAYMENT header...');
    
    // Retry request with X-PAYMENT header
    const paidResponse = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'X-PAYMENT': xPaymentHeader
      }
    });

    if (!paidResponse.ok) {
      const errorData = await paidResponse.json().catch(() => ({}));
      throw new Error(`Payment failed: ${errorData.error || paidResponse.statusText}`);
    }

    console.log('[x402] ✅ Payment successful, resource delivered!');
    
    return paidResponse;
  }

  /**
   * Build and sign Solana payment transaction
   */
  async buildPaymentTransaction(requirements) {
    console.log('[x402] 🔨 Building Solana payment transaction...');
    
    const {
      network,
      maxAmountRequired,
      asset,
      payTo,
      extra
    } = requirements;

    // Verify this is Solana
    if (network !== 'solana' && network !== 'solana-devnet') {
      throw new Error(`Unsupported network: ${network}. This client only supports Solana.`);
    }

    // Get RPC connection
    const rpcUrl = network === 'solana-devnet' 
      ? 'https://api.devnet.solana.com'
      : 'https://mainnet.helius-rpc.com/?api-key=e20ea2f4-232f-484e-be1e-e41b698a7850';
    
    const connection = new solanaWeb3.Connection(rpcUrl, 'confirmed');
    
    // Get recent blockhash
    const { blockhash } = await connection.getLatestBlockhash();
    console.log('[x402] ✅ Got blockhash:', blockhash);
    
    // Build SPL Token transfer instruction (USDC)
    const fromPubkey = this.wallet;
    const toPubkey = new solanaWeb3.PublicKey(payTo);
    const usdcMint = new solanaWeb3.PublicKey(asset);
    const amount = BigInt(maxAmountRequired);
    
    const TOKEN_PROGRAM_ID = new solanaWeb3.PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
    const ASSOCIATED_TOKEN_PROGRAM_ID = new solanaWeb3.PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
    
    // Calculate Associated Token Accounts
    const findATA = (wallet, mint) => {
      return solanaWeb3.PublicKey.findProgramAddressSync(
        [wallet.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
        ASSOCIATED_TOKEN_PROGRAM_ID
      )[0];
    };
    
    const fromATA = findATA(fromPubkey, usdcMint);
    const toATA = findATA(toPubkey, usdcMint);
    
    console.log('[x402] 📍 From ATA:', fromATA.toBase58());
    console.log('[x402] 📍 To ATA:', toATA.toBase58());
    
    // Build TransferChecked instruction (SPL Token Program)
    const transferData = new Uint8Array(17);
    transferData[0] = 12; // TransferChecked discriminator
    
    // Amount (u64 LE)
    for (let i = 0; i < 8; i++) {
      transferData[1 + i] = Number((amount >> BigInt(i * 8)) & BigInt(0xFF));
    }
    
    // Decimals (u8) - USDC has 6 decimals
    transferData[9] = 6;
    
    const transferInstruction = new solanaWeb3.TransactionInstruction({
      keys: [
        { pubkey: fromATA, isSigner: false, isWritable: true },
        { pubkey: usdcMint, isSigner: false, isWritable: false },
        { pubkey: toATA, isSigner: false, isWritable: true },
        { pubkey: fromPubkey, isSigner: true, isWritable: false }
      ],
      programId: TOKEN_PROGRAM_ID,
      data: transferData
    });
    
    // Determine fee payer
    // If facilitator provides feePayer, use it; otherwise user pays
    const feePayer = extra?.feePayer 
      ? new solanaWeb3.PublicKey(extra.feePayer)
      : fromPubkey;
    
    console.log('[x402] 💸 Fee payer:', feePayer.toBase58());
    
    // Create v0 transaction
    const messageV0 = new solanaWeb3.TransactionMessage({
      payerKey: feePayer,
      recentBlockhash: blockhash,
      instructions: [transferInstruction]
    }).compileToV0Message();
    
    const transaction = new solanaWeb3.VersionedTransaction(messageV0);
    
    console.log('[x402] 🔐 Requesting wallet signature...');
    
    // Sign with wallet
    const signedTx = await this.walletAdapter.signTransaction(transaction);
    
    // Serialize the signed transaction
    const serialized = signedTx.serialize();
    const base64Tx = btoa(String.fromCharCode.apply(null, serialized));
    
    console.log('[x402] ✅ Transaction signed successfully');
    
    // Return payment payload in x402 format
    return {
      x402Version: 1,
      scheme: requirements.scheme || 'exact',
      network: network,
      payload: {
        transaction: base64Tx
      }
    };
  }
}

// Export for use in HTML
window.X402BrowserClient = X402BrowserClient;

