/**
 * SIMPLE ADAPTIVE BAYESIAN TEST
 * 
 * Quick test to verify the adaptive threshold system is working
 */

import HypeTrendAnalysis from './hypeTrendAnalysis.js';

// Test data - MEMEPUTER-like stable data with upturn
const testScores = [
  7.096, 7.096, 7.096, 7.096, 7.096, 7.096, 7.096, 7.096, 7.096, 7.096,
  7.096, 7.096, 7.096, 7.096, 7.096, 7.696, 7.696, 7.696, 7.696, 7.696
];

const testMentions = new Array(20).fill(16);

console.log('🧪 Testing Adaptive Bayesian Change-Point Detection...');
console.log('📊 Test Data:', {
  scores: testScores,
  mentions: testMentions,
  variance: testScores.reduce((acc, val, i, arr) => {
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    return acc + Math.pow(val - mean, 2);
  }, 0) / (testScores.length - 1)
});

const trendAnalysis = new HypeTrendAnalysis();

try {
  const results = trendAnalysis.detectChangePoints(testScores, testMentions);
  
  console.log('✅ Adaptive Bayesian Results:', JSON.stringify(results, null, 2));
  
  if (results.changePoints && results.changePoints.length > 0) {
    console.log('🎯 SUCCESS: Adaptive system detected', results.changePoints.length, 'change points!');
    console.log('📈 Change points:', results.changePoints.map(cp => ({
      index: cp.index,
      type: cp.type,
      score: cp.score.toFixed(3),
      significance: cp.significance?.toFixed(2)
    })));
  } else {
    console.log('❌ FAILED: No change points detected');
  }
  
  if (results.adaptiveThreshold) {
    console.log('🔧 Adaptive Threshold:', {
      threshold: results.adaptiveThreshold.threshold.toFixed(3),
      strategy: results.adaptiveThreshold.strategy,
      reasoning: results.adaptiveThreshold.reasoning
    });
  }
  
} catch (error) {
  console.error('❌ Test failed:', error);
}
