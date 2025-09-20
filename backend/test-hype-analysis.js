#!/usr/bin/env node

/**
 * HYPE OVER TIME ORACLE AI ANALYSIS TEST
 * 
 * This script tests what data is available for Hype Over Time analysis
 * using Memeputer as the test token.
 * 
 * Test Token: MEMEPUTER
 * Contract: 5EpbKX221NYVidK6A2nJGhtuLPvrPiQ6shknLbtjBAGS
 */

import HypeSnapshotService from './hypeSnapshotService.js';
import HypeTrendAnalysis from './hypeTrendAnalysis.js';
import AIHypePredictionService from './aiHypePredictionService.js';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test configuration
const TEST_CONFIG = {
  contractAddress: '5EpbKX221NYVidK6A2nJGhtuLPvrPiQ6shknLbtjBAGS', // MEMEPUTER
  symbol: 'MEMEPUTER',
  name: 'memeputer',
  timeRanges: ['1d', '3d', '7d', '15d', '30d']
};

class HypeAnalysisTest {
  constructor() {
    this.hypeService = new HypeSnapshotService();
    this.trendAnalysis = new HypeTrendAnalysis();
    this.aiPrediction = new AIHypePredictionService();
  }

  async initialize() {
    console.log('🔄 Initializing Hype Analysis Test...');
    await this.aiPrediction.initialize();
    console.log('✅ Services initialized');
  }

  /**
   * Test 1: Check what hype snapshots exist for Memeputer
   */
  async testHypeSnapshots() {
    console.log('\n📊 === HYPE SNAPSHOTS TEST ===');
    console.log(`Testing contract: ${TEST_CONFIG.contractAddress}`);
    console.log(`Token: ${TEST_CONFIG.symbol} (${TEST_CONFIG.name})`);
    
    try {
      // Get all snapshots
      const allSnapshots = await this.hypeService.getSnapshots(TEST_CONFIG.contractAddress);
      console.log(`\n📈 Total snapshots found: ${allSnapshots.length}`);
      
      if (allSnapshots.length === 0) {
        console.log('⚠️ No hype snapshots found for MEMEPUTER');
        console.log('💡 This means we need to generate some test data or check if the token has been tracked');
        return null;
      }

      // Show recent snapshots
      const recentSnapshots = allSnapshots.slice(-10);
      console.log(`\n🔍 Recent ${recentSnapshots.length} snapshots:`);
      recentSnapshots.forEach((snapshot, index) => {
        console.log(`  ${index + 1}. ${snapshot.timestamp} | Score: ${snapshot.score} | Mentions: ${snapshot.mentions} | Label: ${snapshot.label || 'N/A'}`);
      });

      // Analyze data structure
      if (allSnapshots.length > 0) {
        const sample = allSnapshots[0];
        console.log(`\n🔍 Sample snapshot structure:`);
        console.log(JSON.stringify(sample, null, 2));
      }

      // Test different time ranges
      console.log(`\n⏰ Testing different time ranges:`);
      for (const range of TEST_CONFIG.timeRanges) {
        const rangeMs = this.parseTimeRange(range);
        const sinceMs = Date.now() - rangeMs;
        const rangeSnapshots = await this.hypeService.getSnapshots(TEST_CONFIG.contractAddress, sinceMs);
        console.log(`  ${range}: ${rangeSnapshots.length} snapshots`);
      }

      return allSnapshots;
      
    } catch (error) {
      console.error('❌ Error testing hype snapshots:', error);
      return null;
    }
  }

  /**
   * Test 2: Analyze hype trends using the trend analysis service
   */
  async testTrendAnalysis(hypeData) {
    console.log('\n🧠 === TREND ANALYSIS TEST ===');
    
    if (!hypeData || hypeData.length < 3) {
      console.log('⚠️ Insufficient data for trend analysis (need at least 3 points)');
      return null;
    }

    try {
      for (const range of ['7d', '15d', '30d']) {
        console.log(`\n📈 Analyzing ${range} trend:`);
        
        const rangeMs = this.parseTimeRange(range);
        const sinceMs = Date.now() - rangeMs;
        const rangeData = hypeData.filter(d => new Date(d.timestamp).getTime() >= sinceMs);
        
        if (rangeData.length < 3) {
          console.log(`  ⚠️ Insufficient data for ${range} analysis (${rangeData.length} points)`);
          continue;
        }

        const analysis = this.trendAnalysis.analyzeHypeTrend(rangeData, range);
        console.log(`  ✅ Analysis completed for ${range}:`);
        console.log(`    - Current Regime: ${analysis.analysis?.regime || 'Unknown'}`);
        console.log(`    - Trend Direction: ${analysis.analysis?.signals?.join(', ') || 'No signals'}`);
        console.log(`    - Confidence: ${analysis.analysis?.confidence || 0}%`);
        console.log(`    - EWMA Score: ${analysis.analysis?.technicalIndicators?.ewmaScore || 'N/A'}`);
        console.log(`    - Score Derivative: ${analysis.analysis?.technicalIndicators?.scoreDerivative || 'N/A'}`);
      }

      return true;
      
    } catch (error) {
      console.error('❌ Error in trend analysis:', error);
      return null;
    }
  }

  /**
   * Test 3: Generate AI predictions using the AI service
   */
  async testAIPrediction(hypeData) {
    console.log('\n🤖 === AI PREDICTION TEST ===');
    
    if (!hypeData || hypeData.length < 5) {
      console.log('⚠️ Insufficient data for AI prediction (need at least 5 points)');
      return null;
    }

    try {
      // Create mock token data
      const tokenData = {
        symbol: TEST_CONFIG.symbol,
        name: TEST_CONFIG.name,
        contractAddress: TEST_CONFIG.contractAddress,
        marketCap: 1000000, // Mock market cap
        price: 0.001, // Mock price
        volume24h: 50000 // Mock volume
      };

      for (const range of ['7d', '15d']) {
        console.log(`\n🧠 Generating AI prediction for ${range}:`);
        
        const rangeMs = this.parseTimeRange(range);
        const sinceMs = Date.now() - rangeMs;
        const rangeData = hypeData.filter(d => new Date(d.timestamp).getTime() >= sinceMs);
        
        if (rangeData.length < 5) {
          console.log(`  ⚠️ Insufficient data for ${range} AI prediction (${rangeData.length} points)`);
          continue;
        }

        // First get trend analysis
        const trendAnalysis = this.trendAnalysis.analyzeHypeTrend(rangeData, range);
        
        // Then get AI prediction
        const prediction = await this.aiPrediction.getPrediction(
          TEST_CONFIG.contractAddress,
          tokenData,
          rangeData,
          range,
          trendAnalysis
        );

        console.log(`  ✅ AI Prediction for ${range}:`);
        console.log(`    - Trend Summary: ${prediction.trendSummary || 'N/A'}`);
        console.log(`    - Momentum Direction: ${prediction.momentumDirection || 'N/A'}`);
        console.log(`    - Momentum Strength: ${prediction.momentumStrength || 'N/A'}`);
        console.log(`    - Confidence: ${prediction.prediction?.confidence || 0}`);
        console.log(`    - Target Score: ${prediction.prediction?.targetScore || 'N/A'}`);
        console.log(`    - Timeframe: ${prediction.prediction?.timeframe || 'N/A'}`);
        console.log(`    - Recommendation: ${prediction.recommendation || 'N/A'}`);
        
        if (prediction.catalysts && prediction.catalysts.length > 0) {
          console.log(`    - Catalysts: ${prediction.catalysts.slice(0, 2).join(', ')}`);
        }
        
        if (prediction.risks && prediction.risks.length > 0) {
          console.log(`    - Risks: ${prediction.risks.slice(0, 2).join(', ')}`);
        }
      }

      return true;
      
    } catch (error) {
      console.error('❌ Error in AI prediction:', error);
      console.error('Error details:', error.message);
      return null;
    }
  }

  /**
   * Test 4: Check what data structure we need for the Oracle AI
   */
  async testDataStructure() {
    console.log('\n🏗️ === DATA STRUCTURE ANALYSIS ===');
    
    console.log('📋 Required data for Hype Over Time Oracle AI:');
    console.log('');
    console.log('1. HYPE SNAPSHOTS (HypeSnapshotService):');
    console.log('   - timestamp: ISO string');
    console.log('   - score: number (0-10)');
    console.log('   - mentions: number');
    console.log('   - label: string (Viral, Trending, Building, etc.)');
    console.log('');
    console.log('2. TREND ANALYSIS (HypeTrendAnalysis):');
    console.log('   - EWMA (Exponential Weighted Moving Average)');
    console.log('   - Derivatives (Rate of Change)');
    console.log('   - Bayesian Change-Point Detection');
    console.log('   - Regime Classification');
    console.log('');
    console.log('3. AI PREDICTION (AIHypePredictionService):');
    console.log('   - Uses GPT-4 for trend prediction');
    console.log('   - Generates momentum direction & strength');
    console.log('   - Provides confidence levels');
    console.log('   - Suggests catalysts and risks');
    console.log('');
    console.log('4. ORACLE AI INTEGRATION POINTS:');
    console.log('   - Frontend: New "Hype Over Time" button/modal');
    console.log('   - Backend: New API endpoint for hype analysis');
    console.log('   - AI Engine: Combine trend + prediction data');
    console.log('   - UI: Charts showing hype timeline + predictions');
  }

  /**
   * Helper: Parse time range to milliseconds
   */
  parseTimeRange(range) {
    const unit = range.slice(-1);
    const value = parseInt(range.slice(0, -1));
    
    switch (unit) {
      case 'd': return value * 24 * 60 * 60 * 1000;
      case 'h': return value * 60 * 60 * 1000;
      case 'm': return value * 60 * 1000;
      default: return 7 * 24 * 60 * 60 * 1000; // Default 7 days
    }
  }

  /**
   * Main test runner
   */
  async runTests() {
    console.log('🚀 HYPE OVER TIME ORACLE AI ANALYSIS TEST');
    console.log('==========================================');
    
    try {
      await this.initialize();
      
      // Test 1: Hype Snapshots
      const hypeData = await this.testHypeSnapshots();
      
      // Test 2: Trend Analysis
      if (hypeData && hypeData.length > 0) {
        await this.testTrendAnalysis(hypeData);
        
        // Test 3: AI Prediction
        await this.testAIPrediction(hypeData);
      }
      
      // Test 4: Data Structure
      await this.testDataStructure();
      
      console.log('\n✅ All tests completed!');
      console.log('\n📋 SUMMARY:');
      console.log(`- Token: ${TEST_CONFIG.symbol} (${TEST_CONFIG.contractAddress})`);
      console.log(`- Snapshots: ${hypeData ? hypeData.length : 0} found`);
      console.log('- Services: HypeSnapshotService, HypeTrendAnalysis, AIHypePredictionService');
      console.log('- Ready for Oracle AI integration');
      
    } catch (error) {
      console.error('❌ Test failed:', error);
      process.exit(1);
    }
  }
}

// Run the test
const test = new HypeAnalysisTest();
test.runTests().catch(console.error);
