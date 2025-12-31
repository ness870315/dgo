/**
 * Test the Technical Analysis API Endpoint
 */

import fetch from 'node-fetch';

const API_BASE_URL = 'http://localhost:3001';
const FARTCOIN_MINT = '9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump';

async function testTAEndpoint() {
  console.log(`\n================================================================================`);
  console.log(`🧪 Testing Technical Analysis API Endpoint`);
  console.log(`================================================================================\n`);
  
  try {
    const url = `${API_BASE_URL}/api/technical-analysis/analyze?contract=${FARTCOIN_MINT}&timeframe=1h&depth=standard`;
    
    console.log(`📡 Sending GET request to:`);
    console.log(`   ${url}`);
    console.log(`   Contract: ${FARTCOIN_MINT.substring(0, 8)}...`);
    console.log(`   Timeframe: 1h`);
    console.log(`   Depth: standard\n`);
    
    const startTime = Date.now();
    
    const response = await fetch(url);
    
    const elapsed = Date.now() - startTime;
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error: ${response.status} - ${errorText}`);
    }
    
    const data = await response.json();
    
    console.log(`✅ Response received in ${elapsed}ms\n`);
    console.log(`================================================================================`);
    console.log(`📊 TECHNICAL ANALYSIS REPORT`);
    console.log(`================================================================================\n`);
    
    // Display token info
    console.log(`🪙 TOKEN:`);
    console.log(`   Name: ${data.token.name} (${data.token.symbol})`);
    console.log(`   Address: ${data.token.address.substring(0, 16)}...`);
    console.log(`   Price: $${data.token.price.toFixed(6)}`);
    console.log(`   Market Cap: $${data.token.marketCap.toLocaleString()}`);
    console.log(`   24h Volume: $${data.token.volume24h.toLocaleString()}\n`);
    
    // Display indicators
    console.log(`📈 TECHNICAL INDICATORS:`);
    console.log(`   RSI (14): ${data.technical_indicators.rsi.value?.toFixed(2) || 'N/A'} (${data.technical_indicators.rsi.signal})`);
    console.log(`   MACD: ${data.technical_indicators.macd.value?.toFixed(6) || 'N/A'} (${data.technical_indicators.macd.crossover})`);
    console.log(`   Bollinger: ${data.technical_indicators.bollinger.position} ${data.technical_indicators.bollinger.squeeze ? '⚠️ SQUEEZE!' : ''}`);
    console.log(`   EMAs: ${data.technical_indicators.ema.trend} alignment`);
    console.log(`   Volume: ${data.technical_indicators.volume.spike ? '🔥 SPIKE!' : 'Normal'} (${data.technical_indicators.volume.ratio.toFixed(2)}x avg)\n`);
    
    // Display support/resistance
    console.log(`🎯 SUPPORT & RESISTANCE:`);
    if (data.support_resistance.resistance.length > 0) {
      console.log(`   Resistance: ${data.support_resistance.resistance.map(r => `$${r.toFixed(6)}`).join(', ')}`);
    }
    console.log(`   Current: $${data.support_resistance.current_price.toFixed(6)}`);
    if (data.support_resistance.support.length > 0) {
      console.log(`   Support: ${data.support_resistance.support.map(s => `$${s.toFixed(6)}`).join(', ')}`);
    }
    console.log();
    
    // Display trading strategy
    console.log(`💡 TRADING STRATEGY:`);
    console.log(`   Signal: ${data.trading_strategy.signal} (${data.trading_strategy.confidence * 100}% confidence)`);
    console.log(`   Oracle Verdict: ${data.trading_strategy.oracle_verdict.action} ${data.trading_strategy.oracle_verdict.emoji}`);
    console.log(`   Position Size: ${data.trading_strategy.oracle_verdict.position_size}`);
    console.log(`   Timeframe: ${data.trading_strategy.oracle_verdict.timeframe}\n`);
    
    console.log(`📝 ONE-LINER:`);
    console.log(`   ${data.trading_strategy.ai_summary.one_liner}\n`);
    
    console.log(`🎭 ORACLE VERDICT:`);
    console.log(`   ${data.trading_strategy.oracle_verdict.summary}\n`);
    
    console.log(`💰 ENTRY STRATEGY:`);
    console.log(`   Aggressive: $${data.trading_strategy.entry_strategy.aggressive_entry.price.toFixed(6)} (${data.trading_strategy.entry_strategy.aggressive_entry.size})`);
    console.log(`   Conservative: $${data.trading_strategy.entry_strategy.conservative_entry.price.toFixed(6)} (${data.trading_strategy.entry_strategy.conservative_entry.size})\n`);
    
    console.log(`🛡️ EXIT STRATEGY:`);
    console.log(`   Stop Loss: $${data.trading_strategy.exit_strategy.stop_loss.price.toFixed(6)} (${data.trading_strategy.exit_strategy.stop_loss.percentage}%)`);
    data.trading_strategy.exit_strategy.take_profit_levels.forEach(tp => {
      console.log(`   ${tp.level}: $${tp.price.toFixed(6)} (+${tp.percentage}%) - ${tp.action}`);
    });
    console.log(`   Risk/Reward: ${data.trading_strategy.risk_reward.ratio}\n`);
    
    console.log(`🔑 KEY CATALYSTS:`);
    data.trading_strategy.ai_summary.key_catalysts.forEach(catalyst => {
      console.log(`   • ${catalyst}`);
    });
    console.log();
    
    console.log(`⚠️ RISKS:`);
    data.trading_strategy.ai_summary.risks.forEach(risk => {
      console.log(`   • ${risk}`);
    });
    console.log();
    
    console.log(`================================================================================`);
    console.log(`✅ TEST PASSED - API is working correctly!`);
    console.log(`================================================================================\n`);
    
    // Show full JSON for debugging
    if (process.argv.includes('--json')) {
      console.log(`\n📄 FULL JSON RESPONSE:\n`);
      console.log(JSON.stringify(data, null, 2));
    }
    
  } catch (error) {
    console.error(`\n❌ TEST FAILED:`, error.message);
    console.error(`\nStack trace:`, error.stack);
    process.exit(1);
  }
}

testTAEndpoint();
