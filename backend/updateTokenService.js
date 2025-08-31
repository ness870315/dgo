import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class UpdateTokenService {
  constructor() {
    this.socialsCachePath = path.join(__dirname, 'cache', 'token-socials.json');
    this.tokensCachePath = path.join(__dirname, 'cache', 'tokens-cache.json');
    this.twitterCachePath = path.join(__dirname, 'cache', 'twitter_metrics.json');
    
    // Initialize socials cache if it doesn't exist
    this.initializeSocialsCache();
  }

  async initializeSocialsCache() {
    try {
      await fs.access(this.socialsCachePath);
    } catch (error) {
      // File doesn't exist, create it
      const initialData = {
        _metadata: {
          lastUpdated: new Date().toISOString(),
          totalUpdates: 0,
          version: '1.0.0'
        }
      };
      await fs.writeFile(this.socialsCachePath, JSON.stringify(initialData, null, 2));
      console.log('✅ Initialized token socials cache');
    }
  }

  /**
   * Update social links for a token
   */
  async updateTokenSocials(symbol, socials, userId, paymentData) {
    try {
      console.log(`🔄 Updating socials for token: ${symbol}`);
      console.log('📱 Social links:', socials);
      console.log('👤 User ID:', userId);
      console.log('💳 Payment data:', paymentData);

      // Validate required fields
      if (!symbol || !socials) {
        throw new Error('Symbol and socials are required');
      }

      // Validate social links format
      const validatedSocials = this.validateSocialLinks(socials);

      // Load current socials cache
      const socialsData = await this.loadSocialsCache();

      // Create social entry
      const socialEntry = {
        symbol: symbol.toUpperCase(),
        socials: validatedSocials,
        socialSources: this.determineSocialSources(validatedSocials),
        updatedBy: userId,
        updatedAt: new Date().toISOString(),
        paymentData: paymentData,
        status: 'active'
      };

      // Store in socials cache
      socialsData[symbol.toUpperCase()] = socialEntry;
      socialsData._metadata.lastUpdated = new Date().toISOString();
      socialsData._metadata.totalUpdates = (socialsData._metadata.totalUpdates || 0) + 1;

      // Save socials cache
      await fs.writeFile(this.socialsCachePath, JSON.stringify(socialsData, null, 2));

      // Update main tokens cache with social data
      await this.updateMainTokensCache(symbol, validatedSocials);

      // Trigger Twitter API update if Twitter handle was added
      if (validatedSocials.twitter && validatedSocials.twitter !== 'not_found') {
        await this.triggerTwitterUpdate(symbol, validatedSocials.twitter);
      }

      console.log(`✅ Successfully updated socials for ${symbol}`);
      
      return {
        success: true,
        symbol: symbol,
        socials: validatedSocials,
        message: `Social links updated successfully for ${symbol}`,
        communityScoreImpact: this.calculateSocialScoreBonus(validatedSocials)
      };

    } catch (error) {
      console.error(`❌ Error updating socials for ${symbol}:`, error);
      throw error;
    }
  }

  /**
   * Validate and clean social links
   */
  validateSocialLinks(socials) {
    const validated = {};
    
    // Twitter handle validation
    if (socials.twitter) {
      validated.twitter = this.validateTwitterHandle(socials.twitter);
    }

    // Discord validation
    if (socials.discord) {
      validated.discord = this.validateDiscordLink(socials.discord);
    }

    // Instagram validation
    if (socials.instagram) {
      validated.instagram = this.validateInstagramHandle(socials.instagram);
    }

    // TikTok validation
    if (socials.tiktok) {
      validated.tiktok = this.validateTikTokHandle(socials.tiktok);
    }

    // Website validation
    if (socials.website) {
      validated.website = this.validateWebsiteUrl(socials.website);
    }

    return validated;
  }

  validateTwitterHandle(handle) {
    if (!handle || handle === 'not_found') return 'not_found';
    
    // Remove @ symbol and clean
    const cleaned = handle.replace(/^@/, '').trim();
    
    // Validate Twitter handle format (3-15 characters, alphanumeric + underscore)
    if (!/^[a-zA-Z0-9_]{1,15}$/.test(cleaned)) {
      throw new Error('Invalid Twitter handle format');
    }
    
    return cleaned;
  }

  validateDiscordLink(discord) {
    if (!discord) return null;
    
    // Accept discord.gg links or server names
    if (discord.includes('discord.gg/') || discord.includes('discord.com/invite/')) {
      return discord;
    }
    
    // If it's just a server name, format it
    const cleaned = discord.replace(/^@/, '').trim();
    return cleaned;
  }

  validateInstagramHandle(handle) {
    if (!handle) return null;
    
    // Remove @ symbol and clean
    const cleaned = handle.replace(/^@/, '').trim();
    
    // Validate Instagram handle format
    if (!/^[a-zA-Z0-9_.]{1,30}$/.test(cleaned)) {
      throw new Error('Invalid Instagram handle format');
    }
    
    return cleaned;
  }

  validateTikTokHandle(handle) {
    if (!handle) return null;
    
    // Remove @ symbol and clean
    const cleaned = handle.replace(/^@/, '').trim();
    
    // Validate TikTok handle format
    if (!/^[a-zA-Z0-9_.]{2,24}$/.test(cleaned)) {
      throw new Error('Invalid TikTok handle format');
    }
    
    return cleaned;
  }

  validateWebsiteUrl(url) {
    if (!url) return null;
    
    // Add https:// if no protocol specified
    let cleanedUrl = url.trim();
    if (!/^https?:\/\//.test(cleanedUrl)) {
      cleanedUrl = 'https://' + cleanedUrl;
    }
    
    // Basic URL validation
    try {
      new URL(cleanedUrl);
      return cleanedUrl;
    } catch (error) {
      throw new Error('Invalid website URL format');
    }
  }

  /**
   * Determine source of each social link
   */
  determineSocialSources(socials) {
    const sources = {};
    
    Object.keys(socials).forEach(platform => {
      if (socials[platform] && socials[platform] !== 'not_found') {
        sources[platform] = 'user'; // All updates are user-provided
      }
    });
    
    return sources;
  }

  /**
   * Calculate community score bonus from social links
   */
  calculateSocialScoreBonus(socials) {
    let bonus = 0;
    const socialCount = Object.values(socials).filter(link => link && link !== 'not_found').length;
    
    if (socialCount >= 5) bonus = 3;      // All socials = +3
    else if (socialCount >= 3) bonus = 2; // Most socials = +2  
    else if (socialCount >= 2) bonus = 1; // Some socials = +1
    
    return {
      socialCount,
      bonus,
      description: `+${bonus} points for ${socialCount} social platform${socialCount !== 1 ? 's' : ''}`
    };
  }

  /**
   * Load socials cache
   */
  async loadSocialsCache() {
    try {
      const data = await fs.readFile(this.socialsCachePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.log('⚠️ Could not load socials cache, returning empty data');
      return {
        _metadata: {
          lastUpdated: new Date().toISOString(),
          totalUpdates: 0,
          version: '1.0.0'
        }
      };
    }
  }

  /**
   * Update main tokens cache with social data
   */
  async updateMainTokensCache(symbol, socials) {
    try {
      const tokensData = JSON.parse(await fs.readFile(this.tokensCachePath, 'utf8'));
      
      // Find token and update social data
      const tokenIndex = tokensData.findIndex(token => 
        token.symbol && token.symbol.toUpperCase() === symbol.toUpperCase()
      );
      
      if (tokenIndex !== -1) {
        tokensData[tokenIndex].socials = socials;
        tokensData[tokenIndex].socialSources = this.determineSocialSources(socials);
        tokensData[tokenIndex].socialsUpdatedAt = new Date().toISOString();
        
        // Update community score with social bonus
        const socialBonus = this.calculateSocialScoreBonus(socials);
        if (tokensData[tokenIndex].communityScore) {
          tokensData[tokenIndex].communityScore = Math.min(10, 
            tokensData[tokenIndex].communityScore + socialBonus.bonus
          );
        }
        
        await fs.writeFile(this.tokensCachePath, JSON.stringify(tokensData, null, 2));
        console.log(`✅ Updated main tokens cache for ${symbol}`);
      } else {
        console.log(`⚠️ Token ${symbol} not found in main cache`);
      }
    } catch (error) {
      console.error('❌ Error updating main tokens cache:', error);
    }
  }

  /**
   * Trigger Twitter API update with new handle
   */
  async triggerTwitterUpdate(symbol, twitterHandle) {
    try {
      console.log(`🐦 Triggering Twitter update for ${symbol} with handle: ${twitterHandle}`);
      
      // This would integrate with your existing Twitter service
      // For now, we'll just log the intent
      console.log(`📝 TODO: Update Twitter metrics for ${symbol} using handle @${twitterHandle}`);
      
      // You could call your existing Twitter service here:
      // await this.twitterService.updateTokenTwitterData(symbol, twitterHandle);
      
    } catch (error) {
      console.error('❌ Error triggering Twitter update:', error);
    }
  }

  /**
   * Get token social data
   */
  async getTokenSocials(symbol) {
    try {
      const socialsData = await this.loadSocialsCache();
      return socialsData[symbol.toUpperCase()] || null;
    } catch (error) {
      console.error(`❌ Error getting socials for ${symbol}:`, error);
      return null;
    }
  }

  /**
   * Get all tokens with social data
   */
  async getAllTokenSocials() {
    try {
      const socialsData = await this.loadSocialsCache();
      
      // Filter out metadata
      const tokens = Object.keys(socialsData)
        .filter(key => key !== '_metadata')
        .map(key => socialsData[key]);
      
      return tokens;
    } catch (error) {
      console.error('❌ Error getting all token socials:', error);
      return [];
    }
  }

  /**
   * Check if user can update token (for future rate limiting)
   */
  async canUserUpdateToken(userId, symbol) {
    // For now, allow all updates
    // Future: implement rate limiting, user permissions, etc.
    return {
      canUpdate: true,
      reason: 'Updates allowed for all authenticated users'
    };
  }
}

export default UpdateTokenService;
