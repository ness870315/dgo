import fs from 'fs/promises';
import path from 'path';
import EnhancedScoringAlgorithm from './enhancedScoringAlgorithm.js';

class ScoringAnalyzer {
  constructor() {
    this.scoringAlgorithm = new EnhancedScoringAlgorithm();
    this.dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
  }

  async analyzeToken(contractAddress, symbol) {
    console.log(`\n🔍 Analyzing token: ${symbol} (${contractAddress})`);
    
    try {
      // Load token data from cache
      const cachePath = path.join(this.dataDir, 'cache', 'tokens.json');
      const tokensData = await fs.readFile(cachePath, 'utf8');
      const tokens = JSON.parse(tokensData);
      
      const token = tokens.find(t => 
        t.contractAddress?.toLowerCase() === contractAddress.toLowerCase() ||
        t.symbol?.toUpperCase() === symbol.toUpperCase()
      );
      
      if (!token) {
        console.log(`❌ Token not found in database`);
        return null;
      }
      
      console.log(`📊 Token Data:`);
      console.log(`   Symbol: ${token.symbol}`);
      console.log(`   Name: ${token.name}`);
      console.log(`   Market Cap: $${(token.marketCap || 0).toLocaleString()}`);
      console.log(`   Volume 1h: $${(token.volume1h || 0).toLocaleString()}`);
      console.log(`   Volume 24h: $${(token.volume24h || 0).toLocaleString()}`);
      console.log(`   Volume Change 1h: ${token.volumeChange1h || 0}%`);
      console.log(`   Volume Change 24h: ${token.volumeChange24h || 0}%`);
      console.log(`   Current Score: ${token.overallScore || 'N/A'}`);
      
      // Calculate score components
      const scoreResult = await this.scoringAlgorithm.calculateEnhancedOverallScore(
        token, 
        contractAddress, 
        symbol, 
        token.name
      );
      
      console.log(`\n🎯 Score Breakdown:`);
      console.log(`   Market Tier (5%): ${scoreResult.components.marketTier?.toFixed(2) || 'N/A'}`);
      console.log(`   Volume 1h (15%): ${scoreResult.components.volume1h?.toFixed(2) || 'N/A'}`);
      console.log(`   Volume 24h (20%): ${scoreResult.components.volume24h?.toFixed(2) || 'N/A'}`);
      console.log(`   Price Change 6h (10%): ${scoreResult.components.priceChange6h?.toFixed(2) || 'N/A'}`);
      console.log(`   Organic Volume Ratio (10%): ${scoreResult.components.organicVolumeRatio?.toFixed(2) || 'N/A'}`);
      console.log(`   Community Health (35%): ${scoreResult.components.communityHealth?.toFixed(2) || 'N/A'}`);
      console.log(`   Uniqueness Factor (5%): ${scoreResult.components.uniquenessFactor?.toFixed(2) || 'N/A'}`);
      console.log(`   Fuel Bonus: ${scoreResult.fuelBonus?.toFixed(2) || 'N/A'}`);
      console.log(`   Final Score: ${scoreResult.overallScore?.toFixed(2) || 'N/A'}`);
      
      // Analyze the problem
      console.log(`\n🚨 Problem Analysis:`);
      if (scoreResult.components.volume1h === 0 && scoreResult.components.volume24h === 0) {
        console.log(`   ❌ Volume scores are 0 - this should result in very low overall score`);
      }
      
      if (scoreResult.components.communityHealth > 7) {
        console.log(`   ⚠️ High community health (${scoreResult.components.communityHealth?.toFixed(2)}) is compensating for poor volume`);
        console.log(`   💡 Community health has 35% weight - this is the main issue!`);
      }
      
      if (scoreResult.components.marketTier < 4) {
        console.log(`   ⚠️ Low market cap tier (${scoreResult.components.marketTier?.toFixed(2)}) - should be penalized more`);
      }
      
      return scoreResult;
      
    } catch (error) {
      console.error(`❌ Error analyzing token:`, error.message);
      return null;
    }
  }

  async analyzeScoringIssues() {
    console.log(`🔍 Analyzing Scoring Issues for Problematic Tokens\n`);
    
    // Analyze the two problematic tokens
    const tokens = [
      {
        contractAddress: '9UeRjJakMEEBJCdRmdW9qjAC2o8AVCkj6ycskWRvpump',
        symbol: 'PUMP',
        description: 'Token with -100% volume change, 5.3K mcap, but 7.7 score'
      },
      {
        contractAddress: 'DqWtuxjDY2gAqAweJKNeJne5HbarbXLZnaDUe92nBAGS',
        symbol: 'BAGS',
        description: 'Token with -93% volume change, 43K mcap, but 6.3 score'
      }
    ];
    
    for (const token of tokens) {
      console.log(`\n${'='.repeat(80)}`);
      console.log(`📋 ${token.description}`);
      console.log(`${'='.repeat(80)}`);
      
      await this.analyzeToken(token.contractAddress, token.symbol);
    }
    
    console.log(`\n${'='.repeat(80)}`);
    console.log(`🎯 RECOMMENDATIONS:`);
    console.log(`${'='.repeat(80)}`);
    console.log(`1. 🚨 CRITICAL: Community Health weight (35%) is too high`);
    console.log(`   - Tokens with good social metrics get high scores despite terrible volume`);
    console.log(`   - Should reduce to 15-20% maximum`);
    console.log(``);
    console.log(`2. 🔧 Volume penalties need to be more severe:`);
    console.log(`   - -50% volume change should result in 0 score, not just penalty`);
    console.log(`   - -90%+ volume change should result in immediate disqualification`);
    console.log(``);
    console.log(`3. 🗑️ Add automatic deletion criteria:`);
    console.log(`   - Volume change < -90% AND market cap < $10K = delete`);
    console.log(`   - Volume change < -95% AND market cap < $50K = delete`);
    console.log(`   - Zero volume for 24+ hours = delete`);
    console.log(``);
    console.log(`4. ⚖️ Rebalance weights:`);
    console.log(`   - Volume 1h: 25% (up from 15%)`);
    console.log(`   - Volume 24h: 30% (up from 20%)`);
    console.log(`   - Community Health: 15% (down from 35%)`);
    console.log(`   - Market Tier: 10% (up from 5%)`);
  }
}

// Run the analysis
const analyzer = new ScoringAnalyzer();
analyzer.analyzeScoringIssues().catch(console.error);
