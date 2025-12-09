# x402 Agent-to-Agent API Integration

## Overview

The `/api/tokens/trending/ai-analysis` endpoint is now a **paid x402 endpoint** for agents. Agents can sign transactions programmatically and pay via the x402 protocol.

**Price:** $0.50 USDC per request

---

## How It Works

1. **Agent makes request** → Receives `402 Payment Required` with payment requirements
2. **Agent builds & signs transaction** → Creates USDC transfer transaction
3. **Agent includes X-PAYMENT header** → Retries request with signed transaction
4. **Server verifies & settles payment** → Returns AI analysis

---

## Example: Agent Integration

### Using PayAI SDK (Recommended)

```javascript
import { createX402Client } from '@payai/x402-solana/client';

// Your agent's wallet (programmatic wallet)
const agentWallet = {
  address: 'YOUR_AGENT_WALLET_ADDRESS',
  publicKey: YOUR_PUBLIC_KEY,
  signTransaction: async (tx) => {
    // Sign transaction with your agent's private key
    return await signTransactionWithPrivateKey(tx, YOUR_PRIVATE_KEY);
  }
};

// Create x402 client
const x402Client = createX402Client({
  wallet: agentWallet,
  network: 'solana',
  rpcUrl: 'https://api.mainnet-beta.solana.com'
});

// Make paid request - SDK handles everything!
const response = await x402Client.fetch(
  'https://api.degen-oracle.com/api/tokens/trending/ai-analysis?limit=10&format=json'
);

if (response.ok) {
  const analysis = await response.json();
  console.log('Analysis:', analysis);
} else {
  console.error('Error:', response.status, await response.text());
}
```

### Manual Integration (Without SDK)

```javascript
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { createTransferCheckedInstruction, getAssociatedTokenAddress } from '@solana/spl-token';

async function callPaidAPI() {
  const connection = new Connection('https://api.mainnet-beta.solana.com');
  const agentWallet = YOUR_AGENT_WALLET;
  
  // Step 1: Make initial request (will get 402)
  const response = await fetch(
    'https://api.degen-oracle.com/api/tokens/trending/ai-analysis?limit=10'
  );
  
  if (response.status !== 402) {
    throw new Error('Expected 402 Payment Required');
  }
  
  // Step 2: Parse payment requirements from 402 response
  const paymentData = await response.json();
  const { requirements } = paymentData;
  
  // Step 3: Build transaction
  const transaction = new Transaction();
  
  // Get USDC ATA addresses
  const usdcMint = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
  const fromATA = await getAssociatedTokenAddress(usdcMint, agentWallet.publicKey);
  const toATA = new PublicKey(requirements.payTo); // Merchant ATA
  
  // Add transfer instruction
  transaction.add(
    createTransferCheckedInstruction(
      fromATA,           // Source ATA
      usdcMint,          // USDC mint
      toATA,             // Destination ATA
      agentWallet.publicKey, // Owner
      BigInt(requirements.amount), // Amount (500,000 = $0.50)
      6                  // USDC decimals
    )
  );
  
  // Step 4: Sign transaction
  transaction.sign(agentWallet);
  
  // Step 5: Create X-PAYMENT header (base64 encoded transaction)
  const serializedTx = transaction.serialize({ requireAllSignatures: false });
  const xPaymentHeader = Buffer.from(serializedTx).toString('base64');
  
  // Step 6: Retry request with X-PAYMENT header
  const paidResponse = await fetch(
    'https://api.degen-oracle.com/api/tokens/trending/ai-analysis?limit=10',
    {
      headers: {
        'X-PAYMENT': xPaymentHeader
      }
    }
  );
  
  if (paidResponse.ok) {
    const analysis = await paidResponse.json();
    return analysis;
  } else {
    throw new Error(`Payment failed: ${paidResponse.status}`);
  }
}
```

---

## Payment Requirements

- **Amount:** 500,000 micro-USDC ($0.50)
- **Token:** USDC (EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v)
- **Network:** Solana Mainnet
- **Merchant ATA:** Automatically derived by PayAI facilitator

---

## Response Format

Once payment is verified, the endpoint returns the same AI analysis as before:

```json
{
  "success": true,
  "count": 10,
  "tokens": [
    {
      "rank": 1,
      "symbol": "TOKEN",
      "name": "Token Name",
      "summary": "AI-generated summary...",
      "priceFormatted": "$0.001234",
      "marketCapFormatted": "$1.23M",
      ...
    }
  ],
  "generatedAt": "2025-01-XX..."
}
```

---

## Error Handling

- **402 Payment Required:** Normal - agent needs to pay
- **402 Payment Verification Failed:** Transaction invalid or expired
- **500 Payment Settlement Failed:** Server error during settlement
- **500 Analysis Failed:** Payment succeeded but analysis generation failed

---

## Notes for Agents

1. **Wallet Requirements:** Agent must have USDC in their wallet (Associated Token Account)
2. **Transaction Fees:** PayAI facilitator covers transaction fees
3. **Timeout:** Payment must be completed within 5 minutes (300 seconds)
4. **Idempotency:** Same payment can be retried if verification fails (transaction is only settled once)

---

## Testing

Test the endpoint:

```bash
# First request (will get 402)
curl https://api.degen-oracle.com/api/tokens/trending/ai-analysis?limit=5

# Response: 402 Payment Required with payment requirements
```

Then use PayAI SDK or manual integration to complete the payment and retry with X-PAYMENT header.

