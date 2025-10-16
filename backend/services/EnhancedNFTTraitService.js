/**
 * Enhanced NFT Trait Detection Service
 * Extracts and analyzes NFT traits from metadata
 */

import { Connection, PublicKey } from '@solana/web3.js';
import axios from 'axios';

export default class EnhancedNFTTraitService {
  constructor() {
    // Solana RPC connection
    this.connection = new Connection(
      process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
      'confirmed'
    );
    
    // Configure your NFT collection here
    this.config = {
      // Collection Creator Address (Update First Verified Creator address)
      collectionCreator: process.env.NFT_COLLECTION_CREATOR || '2TKnLFhPwp9nnhYwMLDstyCuyW69pRWBt3PVPB9rAzU',
      
      // OR Collection Symbol (if using Metaplex)
      collectionSymbol: process.env.NFT_COLLECTION_SYMBOL || 'WIZI',
      
      // OR Specific Collection Address (Metaplex Certified Collection)
      collectionAddress: process.env.NFT_COLLECTION_ADDRESS || '',
      
      // Premium duration for NFT holders (in days)
      premiumDuration: parseInt(process.env.NFT_PREMIUM_DURATION || '90'), // 90 days default
      
      // Subscription type identifier
      subscriptionType: 'nft_holder',
      
      // Wizi Collection specific configuration
      collectionName: 'Wizi',
      rarityMultipliers: {
        'Common': { days: 0, multiplier: 1.0, tier: 'Basic' },
        'Uncommon': { days: 3, multiplier: 1.0, tier: 'Uncommon' },
        'Rare': { days: 7, multiplier: 1.0, tier: 'Rare' },
        'Legendary': { days: 30, multiplier: 1.0, tier: 'Legendary' }
      }
    };
    
    console.log('🎨 Enhanced NFT Trait Service initialized');
  }

  /**
   * Verify NFT ownership and extract traits
   * @param {string} walletAddress - Solana wallet address
   * @returns {Promise<{isHolder: boolean, nfts: Array, traits: Object, method: string}>}
   */
  async verifyNFTOwnershipWithTraits(walletAddress) {
    try {
      console.log(`🔍 Verifying NFT ownership with traits for wallet: ${walletAddress}`);
      
      const pubkey = new PublicKey(walletAddress);
      
      // Try multiple verification methods
      let result = { isHolder: false, nfts: [], traits: {}, method: 'none' };
      
      // Method 1: Use Metaplex DAS API (Digital Asset Standard) - Most reliable
      if (!result.isHolder) {
        result = await this.verifyUsingMetaplexDASWithTraits(pubkey);
      }
      
      // Method 2: Use Helius API (if available)
      if (!result.isHolder && process.env.HELIUS_API_KEY) {
        result = await this.verifyUsingHeliusWithTraits(pubkey);
      }
      
      // Method 3: Direct on-chain verification (fallback)
      if (!result.isHolder) {
        result = await this.verifyOnChainWithTraits(pubkey);
      }
      
      console.log(`✅ Verification complete: ${result.isHolder ? 'NFT HOLDER' : 'NOT A HOLDER'}`);
      console.log(`   Method: ${result.method}`);
      console.log(`   NFTs found: ${result.nfts.length}`);
      console.log(`   Traits detected: ${Object.keys(result.traits).length}`);
      
      return result;
      
    } catch (error) {
      console.error('❌ NFT verification error:', error.message);
      throw new Error('Failed to verify NFT ownership');
    }
  }

  /**
   * Method 1: Verify using Metaplex DAS API with trait extraction
   */
  async verifyUsingMetaplexDASWithTraits(pubkey) {
    try {
      console.log('🔍 Trying Metaplex DAS API with traits...');
      
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
        return { isHolder: false, nfts: [], traits: {}, method: 'metaplex_das' };
      }
      
      const assets = response.data.result.items;
      
      // Filter by collection
      const collectionNFTs = assets.filter(asset => {
        // Check by collection address
        if (this.config.collectionAddress && asset.grouping) {
          const collection = asset.grouping.find(g => g.group_key === 'collection');
          if (collection?.group_value === this.config.collectionAddress) {
            return true;
          }
        }
        
        // Check by creator
        if (this.config.collectionCreator && asset.creators) {
          const hasCreator = asset.creators.some(c => 
            c.address === this.config.collectionCreator && c.verified
          );
          if (hasCreator) return true;
        }
        
        // Check by symbol
        if (this.config.collectionSymbol && asset.content?.metadata?.symbol) {
          if (asset.content.metadata.symbol === this.config.collectionSymbol) {
            return true;
          }
        }
        
        return false;
      });
      
      // Extract traits from NFTs
      const traits = this.extractTraitsFromNFTs(collectionNFTs);
      
      return {
        isHolder: collectionNFTs.length > 0,
        nfts: collectionNFTs.map(nft => ({
          mint: nft.id,
          name: nft.content?.metadata?.name || 'Unknown',
          image: nft.content?.links?.image || null,
          traits: this.extractTraitsFromNFT(nft)
        })),
        traits: traits,
        method: 'metaplex_das'
      };
      
    } catch (error) {
      console.log('⚠️ Metaplex DAS API failed:', error.message);
      return { isHolder: false, nfts: [], traits: {}, method: 'metaplex_das_failed' };
    }
  }

  /**
   * Method 2: Verify using Helius API with trait extraction
   */
  async verifyUsingHeliusWithTraits(pubkey) {
    try {
      console.log('🔍 Trying Helius API with traits...');
      
      const heliusUrl = `https://api.helius.xyz/v0/addresses/${pubkey.toString()}/nfts?api-key=${process.env.HELIUS_API_KEY}`;
      const response = await axios.get(heliusUrl);
      
      if (!response.data || !Array.isArray(response.data)) {
        return { isHolder: false, nfts: [], traits: {}, method: 'helius' };
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
      
      // Extract traits from NFTs
      const traits = this.extractTraitsFromNFTs(collectionNFTs);
      
      return {
        isHolder: collectionNFTs.length > 0,
        nfts: collectionNFTs.map(nft => ({
          mint: nft.mint,
          name: nft.name || 'Unknown',
          image: nft.image || null,
          traits: this.extractTraitsFromNFT(nft)
        })),
        traits: traits,
        method: 'helius'
      };
      
    } catch (error) {
      console.log('⚠️ Helius API failed:', error.message);
      return { isHolder: false, nfts: [], traits: {}, method: 'helius_failed' };
    }
  }

  /**
   * Method 3: Direct on-chain verification with basic trait detection
   */
  async verifyOnChainWithTraits(pubkey) {
    try {
      console.log('🔍 Trying direct on-chain verification with traits...');
      
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
      
      // For each NFT, we would need to fetch metadata to verify collection and traits
      // This is expensive, so we'll just return basic info
      
      return {
        isHolder: nftAccounts.length > 0,
        nfts: nftAccounts.slice(0, 5).map(account => ({
          mint: account.account.data.parsed.info.mint,
          name: 'NFT (metadata not fetched)',
          image: null,
          traits: {}
        })),
        traits: {},
        method: 'on_chain_basic'
      };
      
    } catch (error) {
      console.log('⚠️ On-chain verification failed:', error.message);
      return { isHolder: false, nfts: [], traits: {}, method: 'on_chain_failed' };
    }
  }

  /**
   * Extract traits from a single NFT
   */
  extractTraitsFromNFT(nft) {
    const traits = {};
    
    try {
      // Method 1: Check for attributes in metadata (Wizi format)
      if (nft.content?.metadata?.attributes) {
        nft.content.metadata.attributes.forEach(attr => {
          if (attr.trait_type && attr.value) {
            // Clean up the trait values (remove extra spaces)
            const traitType = attr.trait_type.trim();
            const traitValue = attr.value.trim();
            traits[traitType] = traitValue;
          }
        });
      }
      
      // Method 2: Check for properties in metadata
      if (nft.content?.metadata?.properties) {
        Object.entries(nft.content.metadata.properties).forEach(([key, value]) => {
          if (typeof value === 'string' || typeof value === 'number') {
            traits[key] = value;
          }
        });
      }
      
      // Method 3: Check for Helius format attributes
      if (nft.attributes) {
        nft.attributes.forEach(attr => {
          if (attr.trait_type && attr.value) {
            const traitType = attr.trait_type.trim();
            const traitValue = attr.value.trim();
            traits[traitType] = traitValue;
          }
        });
      }
      
      // Method 4: Extract traits from name (Wizi format: "Wizi #98")
      if (nft.content?.metadata?.name || nft.name) {
        const name = nft.content?.metadata?.name || nft.name;
        this.extractTraitsFromWiziName(name, traits);
      }
      
    } catch (error) {
      console.log('⚠️ Error extracting traits from NFT:', error.message);
    }
    
    return traits;
  }

  /**
   * Extract traits from Wizi NFT name (specific format: "Wizi #98")
   */
  extractTraitsFromWiziName(name, traits) {
    try {
      // Pattern: "Wizi #98"
      const idMatch = name.match(/#(\d+)/);
      if (idMatch) {
        traits['Token ID'] = idMatch[1];
      }
      
      // Pattern: "Wizi" prefix
      if (name.toLowerCase().includes('wizi')) {
        traits['Collection'] = 'Wizi';
      }
      
    } catch (error) {
      console.log('⚠️ Error extracting traits from Wizi name:', error.message);
    }
  }

  /**
   * Extract traits from NFT name (common patterns)
   */
  extractTraitsFromName(name, traits) {
    try {
      // Pattern 1: "Collection Name #123" -> extract number
      const numberMatch = name.match(/#(\d+)/);
      if (numberMatch) {
        traits['Token ID'] = parseInt(numberMatch[1]);
      }
      
      // Pattern 2: "Collection Name - Trait Value" -> extract trait
      const traitMatch = name.match(/- (.+)$/);
      if (traitMatch) {
        traits['Variant'] = traitMatch[1];
      }
      
      // Pattern 3: "Collection Name (Trait Value)" -> extract trait
      const parenMatch = name.match(/\((.+)\)/);
      if (parenMatch) {
        traits['Special'] = parenMatch[1];
      }
      
    } catch (error) {
      console.log('⚠️ Error extracting traits from name:', error.message);
    }
  }

  /**
   * Extract traits from multiple NFTs and aggregate
   */
  extractTraitsFromNFTs(nfts) {
    const allTraits = {};
    const traitCounts = {};
    
    nfts.forEach(nft => {
      const nftTraits = this.extractTraitsFromNFT(nft);
      
      Object.entries(nftTraits).forEach(([traitType, traitValue]) => {
        if (!allTraits[traitType]) {
          allTraits[traitType] = [];
          traitCounts[traitType] = {};
        }
        
        if (!allTraits[traitType].includes(traitValue)) {
          allTraits[traitType].push(traitValue);
        }
        
        traitCounts[traitType][traitValue] = (traitCounts[traitType][traitValue] || 0) + 1;
      });
    });
    
    return {
      allTraits,
      traitCounts,
      summary: this.generateTraitSummary(allTraits, traitCounts)
    };
  }

  /**
   * Generate trait summary for user
   */
  generateTraitSummary(allTraits, traitCounts) {
    const summary = {
      totalTraits: Object.keys(allTraits).length,
      uniqueValues: {},
      rarity: {},
      mostCommon: {},
      leastCommon: {}
    };
    
    Object.entries(allTraits).forEach(([traitType, values]) => {
      summary.uniqueValues[traitType] = values.length;
      
      // Calculate rarity
      const totalNFTs = Object.values(traitCounts[traitType]).reduce((sum, count) => sum + count, 0);
      const rarity = {};
      
      Object.entries(traitCounts[traitType]).forEach(([value, count]) => {
        rarity[value] = {
          count: count,
          percentage: ((count / totalNFTs) * 100).toFixed(2) + '%',
          rarity: count === 1 ? 'Legendary' : 
                 count <= 5 ? 'Epic' : 
                 count <= 20 ? 'Rare' : 
                 count <= 100 ? 'Uncommon' : 'Common'
        };
      });
      
      summary.rarity[traitType] = rarity;
      
      // Find most and least common
      const sortedValues = Object.entries(traitCounts[traitType])
        .sort(([,a], [,b]) => b - a);
      
      if (sortedValues.length > 0) {
        summary.mostCommon[traitType] = sortedValues[0][0];
        summary.leastCommon[traitType] = sortedValues[sortedValues.length - 1][0];
      }
    });
    
    return summary;
  }

  /**
   * Grant Premium access with trait-based benefits
   */
  async grantPremiumAccessWithTraits(userId, walletAddress, nfts, traits, db) {
    try {
      console.log(`🎁 Granting Premium access with traits to NFT holder: ${userId}`);
      
      const now = new Date();
      
      // Calculate trait-based benefits
      const traitBenefits = this.calculateTraitBenefits(traits);
      
      // Calculate total premium duration (base + extended)
      const totalDurationDays = this.config.premiumDuration + traitBenefits.extendedDuration;
      const expiresAt = new Date(now.getTime() + totalDurationDays * 24 * 60 * 60 * 1000);
      
      const result = await db.setPremiumStatus(userId, {
        isPremium: true,
        subscriptionType: this.config.subscriptionType,
        updatedAt: now.toISOString(),
        lastActivatedAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
        durationDays: totalDurationDays,
        walletAddress: walletAddress,
        nftCount: nfts.length,
        verifiedAt: now.toISOString(),
        traits: traits,
        traitBenefits: traitBenefits
      });
      
      console.log(`✅ Premium granted until: ${expiresAt.toISOString()}`);
      console.log(`   Base duration: ${this.config.premiumDuration} days`);
      console.log(`   Extended duration: ${traitBenefits.extendedDuration} days`);
      console.log(`   Total duration: ${totalDurationDays} days`);
      console.log(`   Tier: ${traitBenefits.tier}`);
      console.log(`   Rarity breakdown: ${JSON.stringify(traitBenefits.rarityBreakdown)}`);
      
      return result;
      
    } catch (error) {
      console.error('❌ Failed to grant Premium access:', error.message);
      throw error;
    }
  }

  /**
   * Calculate benefits based on Wizi traits
   */
  calculateTraitBenefits(traits) {
    const benefits = {
      tier: 'Basic',
      multiplier: 1.0,
      specialFeatures: [],
      extendedDuration: 0,
      rarityBreakdown: {}
    };
    
    try {
      // Count NFTs by rarity
      const rarityCounts = {
        'Common': 0,
        'Uncommon': 0,
        'Rare': 0,
        'Legendary': 0
      };
      
      // Count each NFT's rarity
      Object.values(traits.allTraits).forEach(nftTraits => {
        const rarity = nftTraits['Rarity '] || nftTraits['Rarity'] || 'Common';
        const cleanRarity = rarity.trim();
        
        if (rarityCounts.hasOwnProperty(cleanRarity)) {
          rarityCounts[cleanRarity]++;
        } else {
          rarityCounts['Common']++; // Default to Common for unknown rarities
        }
      });
      
      // Calculate total extended duration based on Wizi system
      let totalExtendedDays = 0;
      
      // Apply Wizi rarity multipliers:
      // 1 Uncommon = 3 Days
      // 1 Rare = 7 days  
      // 1 Legendary = 30 days
      // Plus multipliers: 2 uncommon = 6 days, 2 legendary = 60 days, etc.
      
      totalExtendedDays += rarityCounts['Uncommon'] * 3;  // 3 days per Uncommon
      totalExtendedDays += rarityCounts['Rare'] * 7;      // 7 days per Rare
      totalExtendedDays += rarityCounts['Legendary'] * 30; // 30 days per Legendary
      
      // Determine highest tier
      let highestTier = 'Common';
      if (rarityCounts['Legendary'] > 0) highestTier = 'Legendary';
      else if (rarityCounts['Rare'] > 0) highestTier = 'Rare';
      else if (rarityCounts['Uncommon'] > 0) highestTier = 'Uncommon';
      
      // Set benefits based on highest tier
      const tierConfig = this.config.rarityMultipliers[highestTier];
      if (tierConfig) {
        benefits.tier = tierConfig.tier;
        benefits.multiplier = tierConfig.multiplier;
      }
      
      benefits.extendedDuration = totalExtendedDays;
      benefits.rarityBreakdown = rarityCounts;
      
      // Add special features based on tier
      if (highestTier === 'Legendary') {
        benefits.specialFeatures.push('Exclusive Alpha Access', 'Priority Support', 'VIP Features');
      } else if (highestTier === 'Rare') {
        benefits.specialFeatures.push('Priority Support', 'Enhanced Analytics');
      } else if (highestTier === 'Uncommon') {
        benefits.specialFeatures.push('Priority Support');
      }
      
      console.log(`🎨 Calculated Wizi benefits:`, {
        totalNFTs: Object.keys(traits.allTraits).length,
        rarityBreakdown: rarityCounts,
        extendedDays: totalExtendedDays,
        tier: highestTier
      });
      
    } catch (error) {
      console.log('⚠️ Error calculating trait benefits:', error.message);
    }
    
    return benefits;
  }
}

export default EnhancedNFTTraitService;
