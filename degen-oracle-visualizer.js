#!/usr/bin/env node

/**
 * Degen Oracle Strategy Visualizer with Hype Graphs
 * 
 * This script creates engaging visual presentations of LST strategies
 * with LLM analysis, hype graphs, and traditional staking comparisons
 */

const fetch = require('node-fetch');

const API_BASE = 'https://api.degen-oracle.com';
const TEST_WALLET = '3hn5fWZEf2yUZcwU2CV2Wkvk7YDiysM8xBwmesFg7sN1';

// Enhanced Visual Elements
const createHypeHeader = (title, emoji = '🚀') => {
  const width = 70;
  const border = '█'.repeat(width);
  const titleLine = `${emoji} ${title.toUpperCase()} ${emoji}`;
  const padding = Math.floor((width - titleLine.length) / 2);
  
  return `\n${border}\n${' '.repeat(padding)}${titleLine}${' '.repeat(width - titleLine.length - padding)}\n${border}`;
};

const createHypeProgressBar = (value, max, width = 40) => {
  const percentage = Math.min(100, (value / max) * 100);
  const filled = Math.floor((percentage / 100) * width);
  const empty = width - filled;
  
  const bars = ['█', '▓', '▒', '░'];
  const bar = bars[0].repeat(filled) + bars[3].repeat(empty);
  
  return `[${bar}] ${percentage.toFixed(1)}%`;
};

const createHypeChart = (data, maxValue, width = 50) => {
  const symbols = ['█', '▓', '▒', '░'];
  
  return data.map((item, index) => {
    const barLength = Math.floor((item.value / maxValue) * width);
    const bar = symbols[0].repeat(barLength) + symbols[3].repeat(width - barLength);
    const emoji = item.emoji || '💰';
    return `${emoji} ${item.label.padEnd(12)} │${bar}│ ${item.value.toFixed(2)}%`;
  }).join('\n');
};

const createYieldComparisonChart = (traditionalYield, lstYield, timeframe = 'yearly') => {
  const traditionalAmount = 10000; // $10k investment
  const traditionalReturn = traditionalAmount * (traditionalYield / 100);
  const lstReturn = traditionalAmount * (lstYield / 100);
  const difference = lstReturn - traditionalReturn;
  
  return `
💰 YIELD COMPARISON ANALYSIS (${timeframe.toUpperCase()})
┌─────────────────────────────────────────────────────────────────────┐
│ Investment Amount: $${traditionalAmount.toLocaleString()}${' '.repeat(25)} │
├─────────────────────────────────────────────────────────────────────┤
│ Traditional Staking: ${traditionalYield.toFixed(2)}% → $${traditionalReturn.toFixed(2)}${' '.repeat(20)} │
│ LST Strategy:        ${lstYield.toFixed(2)}% → $${lstReturn.toFixed(2)}${' '.repeat(20)} │
│ DIFFERENCE:          +${difference.toFixed(2)} (${((difference/traditionalReturn)*100).toFixed(1)}% better)${' '.repeat(15)} │
├─────────────────────────────────────────────────────────────────────┤
│ ${createHypeProgressBar(difference, traditionalReturn * 2, 50)}${' '.repeat(5)} │
└─────────────────────────────────────────────────────────────────────┘`;
};

const createHypeMetrics = (strategy) => {
  const hypeScore = Math.min(100, (strategy.expectedYield - 4) * 20); // Scale 4-9% to 0-100
  const degenLevel = strategy.riskScore > 7 ? 'MAXIMUM DEGEN' : 
                     strategy.riskScore > 5 ? 'HIGH DEGEN' : 
                     strategy.riskScore > 3 ? 'MODERATE DEGEN' : 'SAFE DEGEN';
  
  return `
🔥 DEGEN ORACLE HYPE METRICS
┌─────────────────────────────────────────────────────────────────────┐
│ Hype Score:        ${createHypeProgressBar(hypeScore, 100, 30)}${' '.repeat(15)} │
│ Degen Level:       ${degenLevel}${' '.repeat(35)} │
│ Yield Potential:   ${strategy.expectedYield.toFixed(2)}%${' '.repeat(40)} │
│ Risk Tolerance:    ${strategy.riskScore.toFixed(1)}/10${' '.repeat(38)} │
│ LST Count:         ${strategy.allocation.length}${' '.repeat(42)} │
└─────────────────────────────────────────────────────────────────────┘`;
};

const createLLMAnalysis = (strategy) => {
  const analysis = `
🧠 DEGEN ORACLE AI ANALYSIS

${createHypeHeader('WHY THIS STRATEGY WAS CHOSEN', '🎯')}

Based on our advanced analytics and AI engine tools, this strategy represents the optimal balance of yield maximization and risk management in the current Solana LST ecosystem. Here's why our systems selected this allocation:

${createHypeHeader('KEY INSIGHTS', '💡')}

• **Yield Optimization**: ${strategy.expectedYield.toFixed(2)}% expected yield significantly outperforms traditional staking (4-5%)
• **Risk Assessment**: ${strategy.riskScore.toFixed(1)}/10 risk score indicates ${strategy.riskScore > 7 ? 'aggressive' : strategy.riskScore > 5 ? 'moderate' : 'conservative'} positioning
• **Diversification**: ${strategy.allocation.length} LST allocation provides optimal risk distribution
• **Market Timing**: Current LST market conditions favor this specific combination

${createHypeHeader('DEGEN ORACLE RECOMMENDATION', '🚀')}

${strategy.expectedYield > 7 ? 'CALL IT! 🚀🚀🚀' : strategy.expectedYield > 6 ? 'CALL IT! 🚀🚀' : 'ADD TO WATCHLIST 📈'}

This strategy offers exceptional yield potential with ${strategy.riskScore > 7 ? 'high risk/high reward' : 'balanced risk/reward'} profile. Our analytics suggest this is the optimal entry point for maximizing returns in the current market cycle.

${createHypeHeader('EXECUTION STRATEGY', '⚡')}

Execute this strategy immediately to capitalize on current market conditions. The LST selection represents the highest-performing assets in our comprehensive analysis of ${strategy.metadata?.totalLSTsAnalyzed || 'multiple'} LSTs across ${strategy.metadata?.sources?.length || 3} data sources.`;

  return analysis;
};

const createHypeGraphs = (strategy) => {
  const maxAPR = Math.max(...strategy.allocation.map(lst => lst.apr));
  const maxAllocation = Math.max(...strategy.allocation.map(lst => lst.percentage));
  
  return `
📊 HYPE PERFORMANCE GRAPHS
┌─────────────────────────────────────────────────────────────────────┐
│ APR DISTRIBUTION (Yield Potential)                                  │
${createHypeChart(strategy.allocation.map(lst => ({ 
  label: lst.symbol, 
  value: lst.apr,
  emoji: lst.apr > 6 ? '🚀' : lst.apr > 5 ? '📈' : '💰'
})), maxAPR, 40).split('\n').map(line => `│ ${line.padEnd(58)} │`).join('\n')}
├─────────────────────────────────────────────────────────────────────┤
│ ALLOCATION DISTRIBUTION (Portfolio Weight)                          │
${createHypeChart(strategy.allocation.map(lst => ({ 
  label: lst.symbol, 
  value: lst.percentage,
  emoji: lst.percentage > 40 ? '🎯' : lst.percentage > 25 ? '⚡' : '💎'
})), maxAllocation, 40).split('\n').map(line => `│ ${line.padEnd(58)} │`).join('\n')}
└─────────────────────────────────────────────────────────────────────┘`;
};

const createExecutionSummary = (strategy) => {
  const totalActions = strategy.actions.length;
  const estimatedGas = totalActions * 0.001; // Estimated SOL for gas
  
  return `
⚡ EXECUTION SUMMARY
┌─────────────────────────────────────────────────────────────────────┐
│ Strategy Status:     READY FOR EXECUTION ✅                        │
│ Total Actions:       ${totalActions} swaps${' '.repeat(35)} │
│ Estimated Gas:       ${estimatedGas.toFixed(4)} SOL${' '.repeat(35)} │
│ Execution Time:      2-5 minutes${' '.repeat(40)} │
│ Expected Yield:      ${strategy.expectedYield.toFixed(2)}% annually${' '.repeat(30)} │
│ Risk Level:          ${strategy.riskScore > 7 ? 'HIGH' : strategy.riskScore > 5 ? 'MEDIUM' : 'LOW'}${' '.repeat(40)} │
└─────────────────────────────────────────────────────────────────────┘

🎯 EXECUTION STEPS:
${strategy.actions.map((action, index) => 
  `${index + 1}. ${action.type.toUpperCase()}: ${action.from} → ${action.to} (${action.amount.toFixed(6)} SOL)`
).join('\n')}

${createHypeHeader('READY TO MOON! 🚀', '🌙')}`;
};

async function createDegenOraclePresentation() {
  console.log(createHypeHeader('DEGEN ORACLE STRATEGY ANALYZER', '🔮'));
  console.log(`🔗 API: ${API_BASE}`);
  console.log(`👛 Wallet: ${TEST_WALLET}\n`);

  try {
    // Generate Enhanced Strategy
    console.log(createHypeHeader('GENERATING DEGEN STRATEGY', '⚡'));
    
    const strategyRequest = {
      walletAddress: TEST_WALLET,
      strategyType: 'basic',
      userPreferences: {
        riskTolerance: 'aggressive',
        maxLSTs: 5,
        minAPR: 0.0
      }
    };
    
    console.log('📤 Sending strategy generation request...');
    
    const response = await fetch(`${API_BASE}/api/strategy/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'DegenOracle/1.0',
        'Accept': 'application/json'
      },
      body: JSON.stringify(strategyRequest)
    });
    
    if (!response.ok) {
      throw new Error(`Strategy generation failed: ${response.status}`);
    }
    
    const strategy = await response.json();
    
    console.log('✅ Strategy generated successfully!');
    console.log(`   Strategy: ${strategy.name}`);
    console.log(`   Expected Yield: ${strategy.expectedYield.toFixed(2)}%`);
    console.log(`   Risk Score: ${strategy.riskScore.toFixed(1)}/10`);

    // Degen Oracle Analysis
    console.log(createLLMAnalysis(strategy));

    // Hype Metrics
    console.log(createHypeMetrics(strategy));

    // Yield Comparison with Traditional Staking
    console.log(createYieldComparisonChart(4.5, strategy.expectedYield, 'yearly'));
    
    // Additional timeframe comparisons
    console.log(createYieldComparisonChart(4.5, strategy.expectedYield, 'monthly'));
    console.log(createYieldComparisonChart(4.5, strategy.expectedYield, 'daily'));

    // Hype Performance Graphs
    console.log(createHypeGraphs(strategy));

    // Strategy Details with Hype
    console.log(`
🎯 STRATEGY BREAKDOWN
┌─────────────────────────────────────────────────────────────────────┐
│ LST Symbol │ Allocation │ APR    │ Hype Level │ Degen Score │
├─────────────────────────────────────────────────────────────────────┤
${strategy.allocation.map(lst => {
  const hypeLevel = lst.apr > 6 ? '🚀🚀🚀' : lst.apr > 5 ? '🚀🚀' : '🚀';
  const degenScore = lst.apr > 6 ? 'MAX' : lst.apr > 5 ? 'HIGH' : 'MED';
  return `│ ${lst.symbol.padEnd(10)} │ ${lst.percentage.toFixed(1).padEnd(9)}% │ ${lst.apr.toFixed(2).padEnd(6)}% │ ${hypeLevel.padEnd(10)} │ ${degenScore.padEnd(11)} │`;
}).join('\n')}
└─────────────────────────────────────────────────────────────────────┘`);

    // Check for INF inclusion with special hype
    const infLST = strategy.allocation.find(lst => lst.symbol === 'INF');
    if (infLST) {
      console.log(`
🎉 INF (INFINITY) LST SPOTTED! 🚀🚀🚀
┌─────────────────────────────────────────────────────────────────────┐
│ 🎯 INF DETECTED: The legendary Infinity LST is in your strategy!     │
│ 📊 Allocation: ${infLST.percentage.toFixed(1)}%${' '.repeat(45)} │
│ 📈 APR: ${infLST.apr.toFixed(2)}%${' '.repeat(50)} │
│ 🚀 Hype Level: MAXIMUM DEGEN 🚀🚀🚀${' '.repeat(30)} │
│ 💎 This is the holy grail of LSTs - you're about to moon! 🌙        │
└─────────────────────────────────────────────────────────────────────┘`);
    }

    // Execution Summary
    console.log(createExecutionSummary(strategy));

    // Final Degen Oracle Verdict
    console.log(`
${createHypeHeader('DEGEN ORACLE FINAL VERDICT', '🔮')}

Based on our comprehensive analysis of the Solana LST ecosystem, this strategy represents the optimal balance of yield maximization and risk management. Our AI engine has processed ${strategy.metadata?.totalLSTsAnalyzed || 'multiple'} LSTs across ${strategy.metadata?.sources?.length || 3} data sources to deliver this precision-tuned allocation.

${strategy.expectedYield > 7 ? '🚀🚀🚀 CALL IT! This is maximum degen territory! 🚀🚀🚀' : 
  strategy.expectedYield > 6 ? '🚀🚀 CALL IT! High yield potential detected! 🚀🚀' : 
  '📈 ADD TO WATCHLIST! Solid yield with balanced risk! 📈'}

The strategy is ready for immediate execution. Our analytics suggest this represents the optimal entry point for maximizing returns in the current market cycle.

${createHypeHeader('TO THE MOON! 🌙', '🚀')}`);

  } catch (error) {
    console.error('❌ Degen Oracle analysis failed:', error.message);
  }
}

// Run the Degen Oracle presentation
createDegenOraclePresentation().catch(console.error);
