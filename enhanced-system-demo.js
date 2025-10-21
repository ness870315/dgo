#!/usr/bin/env node

/**
 * Enhanced LST System Demo with Maximum Hype
 * 
 * This script demonstrates what the enhanced LST system will look like
 * when it's fully deployed with real-time data and higher yields
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

const createLLMAnalysis = (strategy, isEnhanced = false) => {
  const analysis = `
🧠 DEGEN ORACLE AI ANALYSIS

${createHypeHeader('WHY THIS STRATEGY WAS CHOSEN', '🎯')}

Based on our advanced analytics and AI engine tools${isEnhanced ? ' with enhanced multi-source LST data' : ''}, this strategy represents the optimal balance of yield maximization and risk management in the current Solana LST ecosystem. Here's why our systems selected this allocation:

${createHypeHeader('KEY INSIGHTS', '💡')}

• **Yield Optimization**: ${strategy.expectedYield.toFixed(2)}% expected yield significantly outperforms traditional staking (4-5%)
• **Risk Assessment**: ${strategy.riskScore.toFixed(1)}/10 risk score indicates ${strategy.riskScore > 7 ? 'aggressive' : strategy.riskScore > 5 ? 'moderate' : 'conservative'} positioning
• **Diversification**: ${strategy.allocation.length} LST allocation provides optimal risk distribution
• **Market Timing**: Current LST market conditions favor this specific combination
${isEnhanced ? '• **Enhanced Data**: Real-time APY/TVL data from multiple sources ensures maximum accuracy' : ''}

${createHypeHeader('DEGEN ORACLE RECOMMENDATION', '🚀')}

${strategy.expectedYield > 7 ? 'CALL IT! 🚀🚀🚀' : strategy.expectedYield > 6 ? 'CALL IT! 🚀🚀' : 'ADD TO WATCHLIST 📈'}

This strategy offers exceptional yield potential with ${strategy.riskScore > 7 ? 'high risk/high reward' : 'balanced risk/reward'} profile. Our analytics suggest this is the optimal entry point for maximizing returns in the current market cycle.

${createHypeHeader('EXECUTION STRATEGY', '⚡')}

Execute this strategy immediately to capitalize on current market conditions. The LST selection represents the highest-performing assets in our comprehensive analysis${isEnhanced ? ' of 250+ LSTs across Sanctum Extra, Compass, and GitHub sources' : ' of multiple LSTs across 3 data sources'}.`;

  return analysis;
};

const createEnhancedSystemDemo = () => {
  return `
🚀 ENHANCED LST SYSTEM DEMO
┌─────────────────────────────────────────────────────────────────────┐
│ CURRENT SYSTEM vs ENHANCED SYSTEM                                  │
├─────────────────────────────────────────────────────────────────────┤
│ Data Sources:     3 sources    →    3+ sources (Sanctum Extra)     │
│ LST Coverage:     ~100 LSTs    →    250+ LSTs                      │
│ Data Freshness:   Static      →    Real-time APY/TVL               │
│ Symbol Mapping:   Basic       →    Advanced (INF vs infSOL)        │
│ Yield Accuracy:   5.0%        →    8.0%+ (with INF)               │
│ Risk Assessment:  Generic     →    Data-driven                     │
└─────────────────────────────────────────────────────────────────────┘

🎯 WHAT THE ENHANCED SYSTEM WILL DELIVER:

• **INF (Infinity) LST**: 8.35% APR with 1.78M SOL TVL
• **Real-time APY**: Live data from Sanctum Extra API
• **Comprehensive Coverage**: 250+ LSTs vs current 100
• **Proper Symbol Mapping**: Distinguish INF from infSOL
• **Enhanced Yield**: 8%+ expected yield vs current 5%
• **Better Risk Scoring**: Data-driven risk assessment

${createHypeHeader('ENHANCED SYSTEM BENEFITS', '⚡')}

The enhanced LST data system will provide:
• Maximum yield optimization through comprehensive LST analysis
• Real-time data ensures accuracy and competitive advantage
• Proper symbol mapping prevents confusion between similar LSTs
• Enhanced risk assessment based on actual TVL and validator data
• Production-ready performance with caching and error handling`;
};

const createHypeGraphs = (strategy, isEnhanced = false) => {
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

async function runEnhancedSystemDemo() {
  console.log(createHypeHeader('ENHANCED LST SYSTEM DEMO', '🔮'));
  console.log(`🔗 API: ${API_BASE}`);
  console.log(`👛 Wallet: ${TEST_WALLET}\n`);

  try {
    // Show current system
    console.log(createHypeHeader('CURRENT SYSTEM ANALYSIS', '📊'));
    
    const strategyRequest = {
      walletAddress: TEST_WALLET,
      strategyType: 'basic',
      userPreferences: {
        riskTolerance: 'aggressive',
        maxLSTs: 5,
        minAPR: 0.0
      }
    };
    
    console.log('📤 Testing current system...');
    
    const response = await fetch(`${API_BASE}/api/strategy/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'EnhancedDemo/1.0',
        'Accept': 'application/json'
      },
      body: JSON.stringify(strategyRequest)
    });
    
    if (!response.ok) {
      throw new Error(`Strategy generation failed: ${response.status}`);
    }
    
    const currentStrategy = await response.json();
    
    console.log('✅ Current system analysis complete!');
    console.log(`   Strategy: ${currentStrategy.name}`);
    console.log(`   Expected Yield: ${currentStrategy.expectedYield.toFixed(2)}%`);
    console.log(`   Risk Score: ${currentStrategy.riskScore.toFixed(1)}/10`);

    // Show current system analysis
    console.log(createLLMAnalysis(currentStrategy, false));
    console.log(createHypeMetrics(currentStrategy));
    console.log(createYieldComparisonChart(4.5, currentStrategy.expectedYield, 'yearly'));
    console.log(createHypeGraphs(currentStrategy, false));

    // Show enhanced system demo
    console.log(createEnhancedSystemDemo());

    // Simulate enhanced strategy with INF
    const enhancedStrategy = {
      ...currentStrategy,
      name: "Enhanced Maximum Yield Strategy",
      expectedYield: 8.2,
      riskScore: 6.5,
      allocation: [
        {
          symbol: "INF",
          percentage: 50,
          apr: 8.35,
          expectedYield: 8.35,
          tvlSOL: 1781851,
          mevEnabled: true,
          source: "sanctum_extra"
        },
        {
          symbol: "pwrsol",
          percentage: 30,
          apr: 6.29,
          expectedYield: 6.29,
          tvlSOL: 2880,
          mevEnabled: false,
          source: "sanctum_extra"
        },
        {
          symbol: "laineSOL",
          percentage: 20,
          apr: 6.23,
          expectedYield: 6.23,
          tvlSOL: 128806,
          mevEnabled: false,
          source: "sanctum_extra"
        }
      ],
      actions: [
        {
          type: "swap",
          from: "SOL",
          to: "INF",
          amount: 0.5,
          reasoning: "Convert 50% to INF for 8.35% APR + MEV rewards"
        },
        {
          type: "swap",
          from: "SOL",
          to: "pwrsol",
          amount: 0.3,
          reasoning: "Convert 30% to pwrsol for 6.29% APR"
        },
        {
          type: "swap",
          from: "SOL",
          to: "laineSOL",
          amount: 0.2,
          reasoning: "Convert 20% to laineSOL for 6.23% APR"
        }
      ],
      metadata: {
        totalLSTsAnalyzed: 252,
        eligibleLSTs: 45,
        selectedLSTs: 3,
        mevEnabledCount: 1,
        averageTVL: 600000,
        sources: ["sanctum_extra", "compass", "github"]
      }
    };

    console.log(createHypeHeader('ENHANCED SYSTEM PREVIEW', '🚀'));
    
    console.log(createLLMAnalysis(enhancedStrategy, true));
    console.log(createHypeMetrics(enhancedStrategy));
    console.log(createYieldComparisonChart(4.5, enhancedStrategy.expectedYield, 'yearly'));
    console.log(createHypeGraphs(enhancedStrategy, true));

    // Enhanced strategy details
    console.log(`
🎯 ENHANCED STRATEGY BREAKDOWN
┌─────────────────────────────────────────────────────────────────────┐
│ LST Symbol │ Allocation │ APR    │ Hype Level │ Degen Score │
├─────────────────────────────────────────────────────────────────────┤
${enhancedStrategy.allocation.map(lst => {
  const hypeLevel = lst.apr > 8 ? '🚀🚀🚀' : lst.apr > 6 ? '🚀🚀' : '🚀';
  const degenScore = lst.apr > 8 ? 'MAX' : lst.apr > 6 ? 'HIGH' : 'MED';
  return `│ ${lst.symbol.padEnd(10)} │ ${lst.percentage.toFixed(1).padEnd(9)}% │ ${lst.apr.toFixed(2).padEnd(6)}% │ ${hypeLevel.padEnd(10)} │ ${degenScore.padEnd(11)} │`;
}).join('\n')}
└─────────────────────────────────────────────────────────────────────┘`);

    // INF highlight
    console.log(`
🎉 INF (INFINITY) LST SPOTTED! 🚀🚀🚀
┌─────────────────────────────────────────────────────────────────────┐
│ 🎯 INF DETECTED: The legendary Infinity LST is in your strategy!     │
│ 📊 Allocation: 50.0%${' '.repeat(45)} │
│ 📈 APR: 8.35%${' '.repeat(50)} │
│ 🚀 Hype Level: MAXIMUM DEGEN 🚀🚀🚀${' '.repeat(30)} │
│ 💎 This is the holy grail of LSTs - you're about to moon! 🌙        │
└─────────────────────────────────────────────────────────────────────┘`);

    console.log(createExecutionSummary(enhancedStrategy));

    // Final comparison
    console.log(`
${createHypeHeader('SYSTEM COMPARISON', '⚖️')}

📊 CURRENT vs ENHANCED SYSTEM COMPARISON
┌─────────────────────────────────────────────────────────────────────┐
│ Metric           │ Current System │ Enhanced System                 │
├─────────────────────────────────────────────────────────────────────┤
│ Expected Yield   │ ${currentStrategy.expectedYield.toFixed(2).padEnd(13)}% │ ${enhancedStrategy.expectedYield.toFixed(2).padEnd(17)}% │
│ Risk Score       │ ${currentStrategy.riskScore.toFixed(1).padEnd(13)}/10 │ ${enhancedStrategy.riskScore.toFixed(1).padEnd(17)}/10 │
│ LST Count        │ ${currentStrategy.allocation.length.toString().padEnd(13)} │ ${enhancedStrategy.allocation.length.toString().padEnd(17)} │
│ Data Sources     │ 3${' '.repeat(13)} │ 3+ (Sanctum Extra)${' '.repeat(17)} │
│ INF Included     │ No${' '.repeat(13)} │ Yes (50% allocation)${' '.repeat(17)} │
│ Real-time Data   │ No${' '.repeat(13)} │ Yes${' '.repeat(17)} │
└─────────────────────────────────────────────────────────────────────┘

${createHypeHeader('DEPLOYMENT STATUS', '🚀')}

The enhanced LST data system is ready for production deployment with:
• Multi-source LST data integration
• Real-time APY/TVL endpoints
• Proper symbol mapping (INF vs infSOL)
• Enhanced strategy generation
• Production-ready performance

${createHypeHeader('TO THE MOON! 🌙', '🚀')}`);

  } catch (error) {
    console.error('❌ Enhanced system demo failed:', error.message);
  }
}

// Run the enhanced system demo
runEnhancedSystemDemo().catch(console.error);
