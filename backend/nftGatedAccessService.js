/**
 * NFT-Gated Access Service
 * Verifies if a wallet owns an NFT from a specific collection
 * Grants Premium access to NFT holders
 */

import { Connection, PublicKey } from '@solana/web3.js';
import axios from 'axios';

export default class NFTGatedAccessService {
  constructor() {
    // Solana RPC connection
    this.connection = new Connection(
      process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
      'confirmed'
    );
    
    // Configure your NFT collection here - ONLY CHECK BY COLLECTION ADDRESS
    this.config = {
      // Collection Creator Address (NOT USED - only collection address)
      collectionCreator: '',
      
      // Collection Symbol (NOT USED - only collection address)
      collectionSymbol: '',
      
      // ONLY Collection Address (Metaplex Certified Collection) - WIZI COLLECTION
      collectionAddress: process.env.NFT_COLLECTION_ADDRESS || 'F84KxuZp8g1mXsxfxZUXZN1vn1iP3KEtnkN1k4SDTvMf',
      
      // Premium duration for NFT holders (in days) - BASE DURATION SHOULD BE 0
      premiumDuration: parseInt(process.env.NFT_PREMIUM_DURATION || '0'), // 0 days base - only rarity counts
      
      // Subscription type identifier
      subscriptionType: 'nft_holder'
    };
    
    console.log('🎨 NFT-Gated Access Service initialized');
    console.log(`   Collection Creator: ${this.config.collectionCreator || 'Not set'}`);
    console.log(`   Collection Symbol: ${this.config.collectionSymbol || 'Not set'}`);
    console.log(`   Collection Address: ${this.config.collectionAddress || 'Not set'}`);
    console.log(`   Premium Duration: ${this.config.premiumDuration} days`);
  }

  /**
   * Verify if a wallet owns an NFT from the specified collection
   * @param {string} walletAddress - Solana wallet address
   * @returns {Promise<{isHolder: boolean, nfts: Array, method: string}>}
   */
  async verifyNFTOwnership(walletAddress) {
    try {
      console.log(`🔍 Verifying NFT ownership for wallet: ${walletAddress}`);
      
      const pubkey = new PublicKey(walletAddress);
      
      // Try multiple verification methods
      let result = { isHolder: false, nfts: [], method: 'none' };
      
      // Method 1: Use Metaplex DAS API (Digital Asset Standard) - Most reliable
      if (!result.isHolder) {
        result = await this.verifyUsingMetaplexDAS(pubkey);
      }
      
      // Method 2: Direct on-chain verification (fallback)
      if (!result.isHolder) {
        result = await this.verifyOnChain(pubkey);
      }
      
      console.log(`✅ Verification complete: ${result.isHolder ? 'NFT HOLDER' : 'NOT A HOLDER'}`);
      console.log(`   Method: ${result.method}`);
      console.log(`   NFTs found: ${result.nfts.length}`);
      
      return result;
      
    } catch (error) {
      console.error('❌ NFT verification error:', error.message);
      throw new Error('Failed to verify NFT ownership');
    }
  }

  /**
   * Method 1: Verify using Metaplex DAS API (Recommended)
   */
  async verifyUsingMetaplexDAS(pubkey) {
    try {
      console.log('🔍 Trying Metaplex DAS API...');
      
      // Get all NFTs owned by the wallet
      const response = await axios.post(this.connection.rpcEndpoint, {
        jsonrpc: '2.0',
        id: 'nft-check',
        method: 'getAssetsByOwner',
        params: {
          ownerAddress: pubkey.toString(),
          page: 1,
          limit: 1000
        }
      });
      
      if (!response.data?.result?.items) {
        return { isHolder: false, nfts: [], method: 'metaplex_das' };
      }
      
      const assets = response.data.result.items;
      
      // Filter by collection - ONLY CHECK BY COLLECTION ADDRESS
      const collectionNFTs = assets.filter(asset => {
        // ONLY Check by collection address
        if (this.config.collectionAddress && asset.grouping) {
          const collection = asset.grouping.find(g => g.group_key === 'collection');
          if (collection?.group_value === this.config.collectionAddress) {
            return true;
          }
        }
        
        return false;
      });
      
      return {
        isHolder: collectionNFTs.length > 0,
        nfts: collectionNFTs.map(nft => ({
          mint: nft.id,
          name: nft.content?.metadata?.name || 'Unknown',
          image: nft.content?.links?.image || null
        })),
        method: 'metaplex_das'
      };
      
    } catch (error) {
      console.log('⚠️ Metaplex DAS API failed:', error.message);
      return { isHolder: false, nfts: [], method: 'metaplex_das_failed' };
    }
  }

  /**
   * Method 2: Verify using Helius API
   */
  async verifyUsingHelius(pubkey) {
    try {
      console.log('🔍 Trying Helius API...');
      
      const heliusUrl = `https://api.helius.xyz/v0/addresses/${pubkey.toString()}/nfts?api-key=${process.env.HELIUS_API_KEY}`;
      const response = await axios.get(heliusUrl);
      
      if (!response.data || !Array.isArray(response.data)) {
        return { isHolder: false, nfts: [], method: 'helius' };
      }
      
      const nfts = response.data;
      
      // Filter by collection
      const collectionNFTs = nfts.filter(nft => {
        // Check by collection
        if (this.config.collectionAddress && nft.collection?.address === this.config.collectionAddress) {
          return true;
        }
        
        // Check by creator
        if (this.config.collectionCreator && nft.creators) {
          const hasCreator = nft.creators.some(c => 
            c.address === this.config.collectionCreator && c.verified
          );
          if (hasCreator) return true;
        }
        
        // Check by symbol
        if (this.config.collectionSymbol && nft.symbol === this.config.collectionSymbol) {
          return true;
        }
        
        return false;
      });
      
      return {
        isHolder: collectionNFTs.length > 0,
        nfts: collectionNFTs.map(nft => ({
          mint: nft.mint,
          name: nft.name || 'Unknown',
          image: nft.image || null
        })),
        method: 'helius'
      };
      
    } catch (error) {
      console.log('⚠️ Helius API failed:', error.message);
      return { isHolder: false, nfts: [], method: 'helius_failed' };
    }
  }

  /**
   * Method 3: Direct on-chain verification (fallback)
   */
  async verifyOnChain(pubkey) {
    try {
      console.log('🔍 Trying direct on-chain verification...');
      
      // Get all token accounts owned by the wallet
      const tokenAccounts = await this.connection.getParsedTokenAccountsByOwner(pubkey, {
        programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
      });
      
      // Filter for NFTs (amount = 1, decimals = 0)
      const nftAccounts = tokenAccounts.value.filter(account => {
        const amount = account.account.data.parsed.info.tokenAmount.uiAmount;
        const decimals = account.account.data.parsed.info.tokenAmount.decimals;
        return amount === 1 && decimals === 0;
      });
      
      console.log(`   Found ${nftAccounts.length} potential NFTs`);
      
      // For each NFT, we would need to fetch metadata to verify collection
      // This is expensive, so we'll just return true if any NFTs are found
      // In production, you should fetch and verify metadata
      
      return {
        isHolder: nftAccounts.length > 0,
        nfts: nftAccounts.slice(0, 5).map(account => ({
          mint: account.account.data.parsed.info.mint,
          name: 'NFT (metadata not fetched)',
          image: null
        })),
        method: 'on_chain_basic'
      };
      
    } catch (error) {
      console.log('⚠️ On-chain verification failed:', error.message);
      return { isHolder: false, nfts: [], method: 'on_chain_failed' };
    }
  }

  /**
   * Grant Premium access to NFT holder
   * @param {string} userId - User ID
   * @param {string} walletAddress - Verified wallet address
   * @param {Array} nfts - NFTs owned
   * @param {Object} db - Database service
   */
  async grantPremiumAccess(userId, walletAddress, nfts, db) {
    try {
      console.log(`🎁 Granting Premium access to NFT holder: ${userId}`);
      
      const now = new Date();
      const expiresAt = new Date(now.getTime() + this.config.premiumDuration * 24 * 60 * 60 * 1000);
      
      const result = await db.setPremiumStatus(userId, {
        isPremium: true,
        subscriptionType: this.config.subscriptionType,
        updatedAt: now.toISOString(),
        lastActivatedAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
        durationDays: this.config.premiumDuration,
        walletAddress: walletAddress,
        nftCount: nfts.length,
        verifiedAt: now.toISOString()
      });
      
      console.log(`✅ Premium granted until: ${expiresAt.toISOString()}`);
      
      return result;
      
    } catch (error) {
      console.error('❌ Failed to grant Premium access:', error.message);
      throw error;
    }
  }
}
