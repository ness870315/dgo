/**
 * Browser-compatible x402 Client for Solana
 * Matches PayAI x402 reference implementation
 * Version: 2.0.0
 */

console.log('[x402] 🔧 x402-browser-client.js loaded - Version 2.0.0');

class X402BrowserClient {
  constructor() {
    this.wallet = null;
    this.walletAdapter = null;
    this.facilitatorFeePayer = null; // Will be fetched from facilitator
  }

  /**
   * Fetch facilitator's fee payer address from /supported endpoint
   */
  async getFacilitatorFeePayer(network = 'solana') {
    try {
      console.log('[x402] 📡 Fetching facilitator info...');
      const response = await fetch('https://facilitator.payai.network/supported');
      const data = await response.json();
      
      // Find Solana entry
      const solanaEntry = data.kinds.find(k => 
        k.network === network && k.scheme === 'exact'
      );
      
      if (!solanaEntry || !solanaEntry.extra?.feePayer) {
        throw new Error(`Facilitator does not provide feePayer for network: ${network}`);
      }
      
      this.facilitatorFeePayer = solanaEntry.extra.feePayer;
      console.log('[x402] ✅ Facilitator fee payer:', this.facilitatorFeePayer);
      
      return this.facilitatorFeePayer;
    } catch (error) {
      console.error('[x402] ❌ Failed to fetch facilitator info:', error);
      throw error;
    }
  }

  /**
   * Connect to Solana wallet (Phantom, Solflare, Backpack)
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
   * Fetch with x402 payment handling
   * 1) Make request → get 402 with payment requirements
   * 2) Build & sign transaction → retry with X-PAYMENT header
   * @param {string} resourceUrl - The full URL to the paid resource
   * @param {object} options - Fetch options (optional)
   */
  async fetchWithPayment(resourceUrl, options = {}) {
    console.log('[x402] 🚀 Making initial request to:', resourceUrl);

    // First, get facilitator's fee payer address
    if (!this.facilitatorFeePayer) {
      await this.getFacilitatorFeePayer('solana');
    }

    // Step 1: Initial request (expect 402)
    const initialResponse = await fetch(resourceUrl);

    if (initialResponse.status !== 402) {
      // Already paid or other status
      return initialResponse.json();
    }

    console.log('[x402] 💰 Payment required (402), processing payment...');

    // Parse 402 response (accepts array format)
    const paymentInfo = await initialResponse.json();
    console.log('[x402] 📋 Payment info:', paymentInfo);

    if (!paymentInfo.accepts || !Array.isArray(paymentInfo.accepts)) {
      throw new Error('Invalid 402 response: missing accepts array');
    }

    // Find Solana requirements
    const requirements = paymentInfo.accepts.find(req => req.network === 'solana');
    if (!requirements) {
      throw new Error('No Solana payment requirements found');
    }

    console.log('[x402] 📋 Payment requirements:', requirements);

    // Step 2: Connect wallet if not connected
    if (!this.wallet) {
      await this.connectWallet();
    }

    // Step 3: Build and sign payment transaction
    const paymentPayload = await this.buildPaymentTransaction(requirements);
    
    // Step 4: Encode payment payload to base64 (x402 format)
    const xPaymentHeader = btoa(JSON.stringify(paymentPayload));
    
    console.log('[x402] 📡 Retrying request with X-PAYMENT header...');
    console.log('[x402] X-PAYMENT header length:', xPaymentHeader.length);
    
    // Step 5: Retry request with X-PAYMENT header (uppercase per spec)
    const paidResponse = await fetch(resourceUrl, {
      method: 'GET',
      headers: {
        'X-PAYMENT': xPaymentHeader,
        'Accept': 'application/json'
      }
    });

    if (!paidResponse.ok) {
      const errorData = await paidResponse.json().catch(() => ({}));
      throw new Error(`Payment failed: ${errorData.error || paidResponse.statusText}`);
    }

    // Step 6: Read X-PAYMENT-RESPONSE header (settlement details)
    const xPaymentResponse = paidResponse.headers.get('X-PAYMENT-RESPONSE');
    if (xPaymentResponse) {
      try {
        const settlementResponse = JSON.parse(atob(xPaymentResponse));
        console.log('[x402] 💰 Settlement response:', settlementResponse);
        console.log('[x402] 🔗 Transaction:', `https://solscan.io/tx/${settlementResponse.transaction}`);
      } catch (e) {
        console.warn('[x402] Failed to parse X-PAYMENT-RESPONSE:', e);
      }
    }

    console.log('[x402] ✅ Payment successful, resource delivered!');
    
    return paidResponse.json();
  }

  /**
   * Build and sign Solana payment transaction
   * Creates a v0 VersionedTransaction with:
   * - Fee payer = facilitator (from requirements.extra.feePayer)
   * - Single transferChecked instruction (USDC from user ATA → merchant ATA)
   * - User signs (partial signature)
   */
  async buildPaymentTransaction(requirements) {
    const {
      network,
      asset: usdcMint,
      payTo: payToAddress,
      amount,                 // preferred for scheme: "exact"
      maxAmountRequired,      // some facilitators use this name
      extra
    } = requirements;

    if (network !== 'solana' && network !== 'solana-devnet') {
      throw new Error(`Unsupported network: ${network}. This client only supports Solana.`);
    }

    console.log('[x402] 🔨 Building Solana payment transaction...');
    console.log('[x402] 📋 Requirements:', { usdcMint, payToAddress, amount, maxAmountRequired, extra });

    // 1) Pick the amount string safely
    const amountStr = (typeof amount === 'string' ? amount : maxAmountRequired);
    if (!amountStr || !/^\d+$/.test(amountStr)) {
      throw new Error(`Invalid amount in 402: got "${amountStr}". Expected base units as a string (e.g., "100000" for 0.10 USDC).`);
    }
    const amountBI = BigInt(amountStr);

    // 2) Pick the correct RPC by network
    const rpcUrl = network === 'solana-devnet' 
      ? 'https://api.devnet.solana.com'
      : 'https://mainnet.helius-rpc.com/?api-key=e20ea2f4-232f-484e-be1e-e41b698a7850';
    
    const connection = new solanaWeb3.Connection(rpcUrl, 'confirmed');
    
    // 3) Validate inputs
    if (!payToAddress) throw new Error('Missing payTo in 402.');
    if (!usdcMint) throw new Error('Missing asset (USDC mint) in 402.');

    // 4) USDC mint sanity for each network
    const MAINNET_USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
    const DEVNET_USDC = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'; // common devnet USDC
    if (network === 'solana' && usdcMint !== MAINNET_USDC) {
      console.warn('[x402] asset != mainnet USDC mint; ensure this is intended:', usdcMint);
    }
    if (network === 'solana-devnet' && usdcMint !== DEVNET_USDC) {
      console.warn('[x402] asset != devnet USDC mint; ensure this is intended:', usdcMint);
    }
    
    // Get recent blockhash
    const { blockhash } = await connection.getLatestBlockhash();
    console.log('[x402] ✅ Got blockhash:', blockhash);
    
    // Parse addresses
    const userPubkey = this.wallet;
    const usdcMintPk = new solanaWeb3.PublicKey(usdcMint);
    
    // ===== DEFINE TOKEN PROGRAM IDs =====
    const TOKEN_PROGRAM_ID = new solanaWeb3.PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
    const ASSOCIATED_TOKEN_PROGRAM_ID = new solanaWeb3.PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
    
    // payToAddress is already the merchant's USDC ATA (precomputed on backend)
    // No need to derive - use it directly
    const destination = new solanaWeb3.PublicKey(payToAddress);
    
    // Derive user's USDC ATA
    const userATA = solanaWeb3.PublicKey.findProgramAddressSync(
      [userPubkey.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), usdcMintPk.toBuffer()],
      ASSOCIATED_TOKEN_PROGRAM_ID
    )[0];
    
    console.log('[x402] 📍 User ATA:', userATA.toBase58());
    console.log('[x402] 📍 Destination (merchant USDC ATA from backend):', destination.toBase58());
    console.log('[x402] 💸 Fee payer (from facilitator):', this.facilitatorFeePayer);
    console.log('[x402] 💸 Token sender (user):', userPubkey.toBase58());
    
    // Build TransferChecked instruction (discriminator 12)
    // Layout: [discriminator: u8, amount: u64 LE, decimals: u8]
    const transferData = new Uint8Array(17);
    transferData[0] = 12; // TransferChecked
    
    // Amount (u64 little-endian)
    for (let i = 0; i < 8; i++) {
      transferData[1 + i] = Number((amountBI >> BigInt(i * 8)) & BigInt(0xFF));
    }
    
    // Decimals (USDC has 6 decimals)
    transferData[9] = 6;
    
    // TransferChecked keys: [source, mint, destination, owner]
    const transferInstruction = new solanaWeb3.TransactionInstruction({
      keys: [
        { pubkey: userATA, isSigner: false, isWritable: true },      // source
        { pubkey: usdcMintPk, isSigner: false, isWritable: false },  // mint
        { pubkey: destination, isSigner: false, isWritable: true },  // destination (EXACTLY requirements.payTo)
        { pubkey: userPubkey, isSigner: true, isWritable: false }    // owner (SIGNER)
      ],
      programId: TOKEN_PROGRAM_ID,
      data: transferData
    });
    
    // ✅ Use facilitator as fee payer (as per x402 spec)
    // Facilitator will co-sign during settlement
    const facilitatorPk = new solanaWeb3.PublicKey(this.facilitatorFeePayer);
    
    const messageV0 = new solanaWeb3.TransactionMessage({
      payerKey: facilitatorPk, // Facilitator pays gas (gasless for user!)
      recentBlockhash: blockhash,
      instructions: [transferInstruction]
    }).compileToV0Message();
    
    const transaction = new solanaWeb3.VersionedTransaction(messageV0);
    
    // DEBUG: Check transaction BEFORE signing
    console.log('[x402] 🔐 Transaction BEFORE wallet signs:');
    console.log('[x402] 📊 Instruction count BEFORE:', transaction.message.compiledInstructions.length);
    transaction.message.compiledInstructions.forEach((ix, i) => {
      console.log(`[x402]   Instruction ${i}: Program Index ${ix.programIdIndex}`);
    });
    
    console.log('[x402] 🔐 Requesting wallet signature...');
    console.log('[x402] ℹ️  Facilitator as feePayer (gasless for user!)');
    console.log('[x402] 💸 Fee payer (facilitator):', facilitatorPk.toBase58());
    console.log('[x402] 💸 Token sender (user):', userPubkey.toBase58());
    
    // Sign with wallet (user signs, facilitator co-signs during settlement)
    const signedTx = await this.walletAdapter.signTransaction(transaction);
    
    // DEBUG: Check transaction AFTER signing
    console.log('[x402] ✅ Transaction AFTER wallet signs:');
    console.log('[x402] 📊 Instruction count AFTER:', signedTx.message.compiledInstructions.length);
    signedTx.message.compiledInstructions.forEach((ix, i) => {
      const programPubkey = signedTx.message.staticAccountKeys[ix.programIdIndex];
      console.log(`[x402]   Instruction ${i}: Program ${programPubkey.toBase58()}`);
    });
    
    // 🔧 CRITICAL FIX: Phantom adds extra instructions (compute budget, analytics)
    // PayAI's "exact" scheme requires EXACTLY 1 instruction (the TransferChecked)
    // We need to strip the extras and rebuild the transaction with only our instruction
    let serialized;
    
    if (signedTx.message.compiledInstructions.length > 1) {
      console.log('[x402] ⚠️  Phantom added extra instructions! Stripping to only TransferChecked...');
      
      // Find the TransferChecked instruction (SPL Token program)
      const tokenProgramId = TOKEN_PROGRAM_ID.toBase58();
      const transferIxIndex = signedTx.message.compiledInstructions.findIndex(ix => {
        const programPk = signedTx.message.staticAccountKeys[ix.programIdIndex];
        return programPk.toBase58() === tokenProgramId && ix.data[0] === 12; // TransferChecked discriminator
      });
      
      if (transferIxIndex === -1) {
        throw new Error('Could not find TransferChecked instruction in signed transaction');
      }
      
      console.log(`[x402] ✅ Found TransferChecked at index ${transferIxIndex}`);
      
      // Rebuild transaction with ONLY the TransferChecked instruction
      const cleanMessageV0 = new solanaWeb3.TransactionMessage({
        payerKey: userPubkey,
        recentBlockhash: blockhash,
        instructions: [transferInstruction] // Original clean instruction
      }).compileToV0Message();
      
      const cleanTransaction = new solanaWeb3.VersionedTransaction(cleanMessageV0);
      
      // Copy the signature from Phantom's signed transaction
      cleanTransaction.signatures[0] = signedTx.signatures[0];
      
      console.log('[x402] ✅ Rebuilt transaction with 1 instruction + Phantom signature');
      console.log('[x402] 📊 Final instruction count:', cleanTransaction.message.compiledInstructions.length);
      
      // Serialize the clean transaction
      serialized = cleanTransaction.serialize();
      console.log('[x402] 📦 Serialized clean transaction:', serialized.length, 'bytes');
    } else {
      // No extra instructions, use as-is
      console.log('[x402] ✅ Transaction is clean (1 instruction)');
      serialized = signedTx.serialize();
      console.log('[x402] 📦 Serialized transaction:', serialized.length, 'bytes');
    }
    
    // Use Buffer for proper base64 encoding (avoid btoa limitations)
    let base64Tx;
    if (typeof Buffer !== 'undefined') {
      base64Tx = Buffer.from(serialized).toString('base64');
    } else {
      // Fallback to btoa if Buffer not available
      base64Tx = btoa(String.fromCharCode.apply(null, serialized));
    }
    
    console.log('[x402] ✅ Transaction signed successfully');
    
    // Return payment payload in x402 format
    return {
      x402Version: 1,
      scheme: 'exact',
      network: network,
      payload: {
        transactionBase64: base64Tx // Use 'transactionBase64' not 'transaction' for PayAI
      }
    };
  }
}
