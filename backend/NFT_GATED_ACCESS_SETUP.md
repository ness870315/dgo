# 🎨 NFT-Gated Access Setup Guide

## Overview
This feature allows users to get Premium access by connecting their Solana wallet and proving they own an NFT from your specified collection.

---

## 🚀 Quick Start

### 1. Configure Your NFT Collection

Add these environment variables to your `.env` file:

```bash
# Solana RPC URL (use a premium RPC for better performance)
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com

# Choose ONE of these verification methods:

# Option 1: Collection Creator Address (RECOMMENDED)
NFT_COLLECTION_CREATOR=YourCreatorAddressHere

# Option 2: Collection Symbol
NFT_COLLECTION_SYMBOL=YOURCOLLECTION

# Option 3: Certified Collection Address
NFT_COLLECTION_ADDRESS=YourCollectionAddressHere

# Premium Duration (in days)
NFT_PREMIUM_DURATION=90

# Optional: Helius API for better verification
HELIUS_API_KEY=your_helius_api_key_here
```

---

## 📋 Finding Your Collection Info

### Method 1: Collection Creator (Recommended)

1. Go to your collection on Magic Eden or Solscan
2. Click on any NFT from your collection
3. Look for "First Verified Creator" address
4. Copy that address to `NFT_COLLECTION_CREATOR`

**Example:**
```bash
# SMB (Solana Monkey Business)
NFT_COLLECTION_CREATOR=mdaoxg4DVGptU4WSpzGyVpK3zqsgn7Qzx5XNgWTcEA2

# DeGods
NFT_COLLECTION_CREATOR=9MynErYQ5Qi6obp4YwwdoDmXkZ1hYVtPUqYmJJ3rZ9Kn

# Okay Bears
NFT_COLLECTION_CREATOR=3saAedkM9o5g1u5DCqsuMZuC4GRqPB4TuMkvSsSVvGQ3
```

### Method 2: Collection Symbol

If your collection has a unique symbol:

```bash
NFT_COLLECTION_SYMBOL=DGNORACLE
```

### Method 3: Certified Collection

For Metaplex Certified Collections:

```bash
NFT_COLLECTION_ADDRESS=YourCertifiedCollectionNFTAddress
```

---

## 🔧 How It Works

### User Flow:
1. User visits Premium page
2. Clicks "Connect Phantom Wallet"
3. Approves wallet connection
4. Backend verifies NFT ownership
5. If holder → Premium activated automatically
6. If not → Error message shown

### Verification Methods (in order):
1. **Metaplex DAS API** - Fast, reliable (default RPC)
2. **Helius API** - Enhanced verification (if API key provided)
3. **On-Chain Direct** - Fallback method

---

## 🎯 Premium Access Details

### What NFT Holders Get:
- **Duration:** 90 days (configurable via `NFT_PREMIUM_DURATION`)
- **Subscription Type:** `nft_holder`
- **Auto-renewal:** No (one-time verification)
- **Stored Data:** Wallet address, NFT count, verification timestamp

### Database Fields:
```javascript
{
  isPremium: true,
  subscriptionType: 'nft_holder',
  expiresAt: '2025-12-05T00:00:00.000Z',
  durationDays: 90,
  walletAddress: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
  nftCount: 3,
  verifiedAt: '2025-10-06T00:00:00.000Z'
}
```

---

## 🔐 Security Features

### Wallet Verification:
- ✅ Uses Phantom's secure connection
- ✅ No private keys exposed
- ✅ Read-only verification
- ✅ On-chain proof

### Anti-Abuse:
- ✅ Wallet address stored (one wallet = one Premium)
- ✅ NFT ownership verified in real-time
- ✅ No manual approval needed
- ✅ Automatic expiration

---

## 🧪 Testing

### Test with Your Own Wallet:

1. Make sure you own an NFT from the configured collection
2. Visit: `https://degen-oracle.com/premium`
3. Click "Connect Phantom Wallet"
4. Approve connection
5. Should see: "✅ Premium activated! You own X NFT(s) from the collection."

### Test Without NFTs:

1. Use a wallet that doesn't own the NFTs
2. Should see: "❌ No NFTs found from the required collection"

---

## 📊 API Endpoint

### POST `/api/user/premium/verify-nft`

**Request:**
```json
{
  "sessionId": "user_session_id",
  "walletAddress": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"
}
```

**Success Response:**
```json
{
  "success": true,
  "isHolder": true,
  "nfts": [
    {
      "mint": "ABC123...",
      "name": "Collection NFT #123",
      "image": "https://..."
    }
  ],
  "message": "Premium activated! You own 3 NFT(s) from the collection.",
  "premium": {
    "isPremium": true,
    "expiresAt": "2025-12-05T00:00:00.000Z"
  }
}
```

**Error Response:**
```json
{
  "success": false,
  "error": "No NFTs found from the required collection",
  "isHolder": false
}
```

---

## 🎨 Frontend Component

The NFT verification UI is located at:
- **Component:** `frontend/src/components/NFTGatedAccess.js`
- **Integrated in:** `frontend/src/components/PremiumPage.js`

### Features:
- 👻 Phantom wallet integration
- 🔍 Real-time verification
- 🖼️ NFT display (shows owned NFTs)
- ✅ Success/error messages
- 🔄 Auto-reload after success

---

## 🚨 Troubleshooting

### "Phantom wallet not found"
- User needs to install Phantom: https://phantom.app/

### "No NFTs found"
- Verify collection configuration is correct
- Check if user actually owns NFTs from that collection
- Try using Helius API for better detection

### "Verification failed"
- Check RPC connection
- Verify environment variables are set
- Check backend logs for detailed error

### "Premium not activating"
- Check if user already has Premium from another source
- Verify database connection
- Check backend logs

---

## 🔗 Useful Links

- **Phantom Wallet:** https://phantom.app/
- **Helius API:** https://helius.xyz/
- **Metaplex Docs:** https://docs.metaplex.com/
- **Solana RPC Providers:** https://solana.com/rpc

---

## 💡 Tips

1. **Use Helius API** for best verification results
2. **Premium RPC** recommended for high traffic
3. **Test thoroughly** before going live
4. **Monitor logs** for verification issues
5. **Adjust duration** based on your tokenomics

---

## 🎯 Next Steps

1. Configure your collection in `.env`
2. Test with your own wallet
3. Deploy to production
4. Monitor verification success rate
5. Adjust settings as needed

**Need help?** Check the logs or reach out to support!
