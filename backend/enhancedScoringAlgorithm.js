import EnhancedSocialDataService from './enhancedSocialDataService.js';

class EnhancedScoringAlgorithm {
  constructor() {
    this.socialService = new EnhancedSocialDataService();
    this.cache = new Map();
    this.cacheTimeout = 24 * 60 * 60 * 1000; // 24 hours
  }

  /**
   * 🎯 NEW ENHANCED SCORING ALGORITHM
   * Focused on real trading activity and community health
   */
  async calculateEnhancedOverallScore(tokenData, contractAddress, symbol, name) {
    try {
      console.log(`🎯 Calculating Enhanced Overall Score for ${symbol}...`);
      
      // Get cached community health score (24h cache)
      const communityHealth = await this.getCachedCommunityHealth(contractAddress, symbol, name);
      
      // Calculate all score components
      const components = {
        marketTier: this.calculateMarketTierScore(tokenData),
        volume1h: this.calculateVolume1hScore(tokenData),
        volume24h: this.calculateVolume24hScore(tokenData),
        priceChange6h: this.calculatePriceChange6hScore(tokenData),
        organicVolumeRatio: this.calculateOrganicVolumeRatio(tokenData),
        communityHealth: communityHealth,
        uniquenessFactor: this.calculateUniquenessFactor(symbol, tokenData)
      };

      // Apply weights as specified
      const weights = {
        marketTier: 0.05,        // 5%
        volume1h: 0.10,          // 10%
        volume24h: 0.15,         // 15%
        priceChange6h: 0.10,     // 10%
        organicVolumeRatio: 0.10, // 10%
        communityHealth: 0.45,    // 45% - The biggest factor!
        uniquenessFactor: 0.05    // 5%
      };

      // Calculate weighted base score
      let baseScore = 0;
      Object.keys(weights).forEach(component => {
        const score = components[component] || 0;
        const weight = weights[component];
        baseScore += score * weight;
        console.log(`   ${component}: ${score.toFixed(2)} × ${(weight * 100)}% = ${(score * weight).toFixed(3)}`);
      });

      console.log(`📊 Base Score: ${baseScore.toFixed(2)}/10`);

      // Apply fuel accelerator bonus if available
      const fuelBonus = this.calculateFuelBonus(tokenData);
      if (fuelBonus > 0) {
        console.log(`🚀 Fuel Bonus: +${fuelBonus.toFixed(2)}`);
        baseScore += fuelBonus;
      }

      // Ensure score stays within 0-10 range
      const finalScore = Math.min(10, Math.max(0, baseScore));

      console.log(`🏆 Final Enhanced Score for ${symbol}: ${finalScore.toFixed(2)}/10`);

      return {
        overallScore: finalScore,
        components: components,
        weights: weights,
        fuelBonus: fuelBonus,
        calculationTime: new Date().toISOString()
      };

    } catch (error) {
      console.error(`❌ Error calculating enhanced score for ${symbol}:`, error.message);
      return {
        overallScore: 5.0,
        components: {},
        weights: {},
        fuelBonus: 0,
        error: error.message,
        calculationTime: new Date().toISOString()
      };
    }
  }

  /**
   * Market Tier Score (5% weight)
   * Simplified tiers with less dramatic differences
   */
  calculateMarketTierScore(tokenData) {
    if (!tokenData) return 5.0;
    
    const marketCap = tokenData.marketCap || 0;
    
    // More balanced tier scoring
    if (marketCap >= 1000000000) return 9.0;      // $1B+ = Large cap
    else if (marketCap >= 500000000) return 8.0;  // $500M+ = Mid-large
    else if (marketCap >= 100000000) return 7.0;  // $100M+ = Mid cap
    else if (marketCap >= 50000000) return 6.0;   // $50M+ = Small-mid
    else if (marketCap >= 10000000) return 5.0;   // $10M+ = Small cap
    else if (marketCap >= 1000000) return 4.0;    // $1M+ = Micro cap
    else return 3.0; // <$1M = Nano cap
  }

  /**
   * Volume 1hr Score (10% weight)
   * Rewards immediate trading activity
   */
  calculateVolume1hScore(tokenData) {
    if (!tokenData) return 5.0;
    
    const volume1h = tokenData.volume1h || 0;
    
    // Logarithmic scaling for 1h volume
    if (volume1h === 0) return 1.0;
    
    const logVolume = Math.log10(volume1h + 1);
    const score = Math.min(10, Math.max(1, logVolume * 2.5)); // Scale to 1-10
    
    return score;
  }

  /**
   * Volume 24hr Score (15% weight)
   * Rewards sustained trading activity
   */
  calculateVolume24hScore(tokenData) {
    if (!tokenData) return 5.0;
    
    const volume24h = tokenData.volume24h || 0;
    
    // Logarithmic scaling for 24h volume
    if (volume24h === 0) return 1.0;
    
    const logVolume = Math.log10(volume24h + 1);
    const score = Math.min(10, Math.max(1, logVolume * 2.2)); // Scale to 1-10
    
    return score;
  }

  /**
   * Price Change 6hrs Score (10% weight)
   * Rewards positive price movement
   */
  calculatePriceChange6hScore(tokenData) {
    if (!tokenData) return 5.0;
    
    const priceChange6h = tokenData.priceChange6h || 0;
    
    // Only reward positive changes, penalize negative
    if (priceChange6h > 0) {
      // Positive changes: 0% = 5, +50% = 10
      return Math.min(10, Math.max(5, 5 + (priceChange6h / 10)));
    } else {
      // Negative changes: 0% = 5, -50% = 0
      return Math.max(0, Math.min(5, 5 + (priceChange6h / 10)));
    }
  }

  /**
   * Organic Volume Ratio Score (10% weight)
   * Rewards more buying than selling
   */
  calculateOrganicVolumeRatio(tokenData) {
    if (!tokenData) return 5.0;
    
    const buyOrganic = tokenData.buyOrganicVolume24h || 0;
    const sellOrganic = tokenData.sellOrganicVolume24h || 0;
    
    if (buyOrganic === 0 && sellOrganic === 0) return 5.0;
    
    // Calculate ratio: higher buy volume = higher score
    const totalOrganic = buyOrganic + sellOrganic;
    if (totalOrganic === 0) return 5.0;
    
    const buyRatio = buyOrganic / totalOrganic;
    
    // Score: 100% buy = 10, 50% buy = 5, 0% buy = 0
    return buyRatio * 10;
  }

  /**
   * Cached Community Health Score (45% weight)
   * Uses 24-hour cache for performance
   */
  async getCachedCommunityHealth(contractAddress, symbol, name) {
    const cacheKey = `community_health_${contractAddress}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      console.log(`🟢 Using cached community health for ${symbol}`);
      return cached.score;
    }

    console.log(`🔄 Fetching fresh community health for ${symbol}...`);
    
    try {
      // Get comprehensive social data including Twitter metrics
      const socialData = await this.socialService.getComprehensiveSocialData(
        contractAddress, 
        symbol, 
        name,
        false // Don't force refresh
      );

      // Calculate community health based on multiple factors
      let communityScore = 5.0; // Base score
      
      // Twitter metrics (if available)
      if (socialData.twitterMetrics) {
        const twitter = socialData.twitterMetrics;
        
        // Follower count impact
        if (twitter.followers > 1000000) communityScore += 2.0;
        else if (twitter.followers > 100000) communityScore += 1.5;
        else if (twitter.followers > 10000) communityScore += 1.0;
        else if (twitter.followers > 1000) communityScore += 0.5;
        
        // Engagement impact
        if (twitter.engagement?.calculatedScore) {
          communityScore += Math.min(2, twitter.engagement.calculatedScore / 5);
        }
        
        // Recent mentions impact
        if (twitter.recentMentions?.length > 0) {
          communityScore += Math.min(1, twitter.recentMentions.length / 10);
        }
      }

      // Data source diversity bonus
      const sourceCount = socialData.dataSources?.total || 0;
      if (sourceCount >= 4) communityScore += 1.5;
      else if (sourceCount >= 3) communityScore += 1.0;
      else if (sourceCount >= 2) communityScore += 0.5;

      // Ensure score stays within 0-10 range
      const finalScore = Math.min(10, Math.max(0, communityScore));
      
      // Cache the result
      this.cache.set(cacheKey, {
        score: finalScore,
        timestamp: Date.now()
      });

      console.log(`✅ Community health calculated: ${finalScore.toFixed(2)}/10`);
      return finalScore;

    } catch (error) {
      console.error(`❌ Error calculating community health:`, error.message);
      return 5.0; // Fallback score
    }
  }

  /**
   * Uniqueness Factor Score (5% weight)
   * Based on symbol characteristics and data availability
   */
  calculateUniquenessFactor(symbol, tokenData) {
    if (!symbol) return 5.0;
    
    let uniqueness = 5.0; // Base score
    
    // Symbol characteristics
    const symbolLength = symbol.length;
    if (symbolLength <= 3) uniqueness += 2.0;      // Very short = premium
    else if (symbolLength <= 5) uniqueness += 1.0; // Short = premium
    else if (symbolLength >= 10) uniqueness -= 1.0; // Very long = less premium
    
    // Check for numbers and special characters
    const hasNumbers = /\d/.test(symbol);
    const hasSpecialChars = /[^a-zA-Z0-9]/.test(symbol);
    
    if (hasNumbers) uniqueness -= 0.5;          // Numbers = less premium
    if (hasSpecialChars) uniqueness -= 0.5;     // Special chars = less premium
    
    // Data availability bonus
    if (tokenData?.jupiterData) uniqueness += 0.5;
    if (tokenData?.socialData) uniqueness += 0.5;
    
    // Ensure score stays within 0-10 range
    return Math.min(10, Math.max(0, uniqueness));
  }

  /**
   * Fuel Accelerator Bonus
   * Dynamic bonus for trending/fueled tokens
   */
  calculateFuelBonus(tokenData) {
    if (!tokenData) return 0;
    
    let fuelBonus = 0;
    
    // Check for fuel data (if available)
    if (tokenData.fuel && tokenData.fuel.length > 0) {
      fuelBonus += Math.min(2, tokenData.fuel.length * 0.5); // Up to 2 points for fuel
    }
    
    // Volume spike bonus
    const volume24h = tokenData.volume24h || 0;
    const marketCap = tokenData.marketCap || 1;
    const volumeRatio = volume24h / marketCap;
    
    if (volumeRatio > 0.5) fuelBonus += 1.0;      // High volume spike
    else if (volumeRatio > 0.2) fuelBonus += 0.5; // Moderate volume spike
    
    // Price momentum bonus
    const priceChange6h = tokenData.priceChange6h || 0;
    if (priceChange6h > 20) fuelBonus += 1.0;     // Strong positive momentum
    else if (priceChange6h > 10) fuelBonus += 0.5; // Moderate positive momentum
    
    return Math.min(3, fuelBonus); // Cap at 3 points
  }

  /**
   * Get algorithm information
   */
  getAlgorithmInfo() {
    return {
      name: 'Enhanced Trading-Focused Scoring Algorithm',
      version: '2.0.0',
      description: 'Focuses on real trading activity, community health, and organic volume ratios',
      weights: {
        marketTier: '5% - Market cap tier classification',
        volume1h: '10% - 1-hour trading volume',
        volume24h: '15% - 24-hour trading volume', 
        priceChange6h: '10% - 6-hour price change (positive)',
        organicVolumeRatio: '10% - Buy vs Sell organic volume ratio',
        communityHealth: '45% - Cached community health (24h)',
        uniquenessFactor: '5% - Symbol uniqueness and data availability'
      },
      features: [
        '24-hour community health caching',
        'Organic volume ratio analysis',
        'Fuel accelerator bonus system',
        'Real-time trading activity focus',
        'Balanced market tier scoring'
      ]
    };
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
    console.log('🧹 Enhanced scoring cache cleared');
  }
}

export default EnhancedScoringAlgorithm;




