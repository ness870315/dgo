#!/usr/bin/env node

/**
 * Fixed LST Data System with Proper Symbol Mapping
 * 
 * This script fixes the symbol mapping issues discovered in the INF investigation
 */

const fetch = require('node-fetch');

class FixedLSTDataSystem {
  constructor() {
    this.sources = {
      sanctumExtra: 'https://extra-api.sanctum.so/v1',
      compass: 'https://solanacompass.com/api/v1/lsts',
      github: 'https://raw.githubusercontent.com/igneous-labs/sanctum-lst-list/master/sanctum-lst-list.toml'
    };
    this.symbolMapping = new Map(); // Will be populated with correct mappings
  }

  async fetchSanctumExtraLSTs() {
    console.log('🔍 Fetching Sanctum Extra LSTs...');
    
    try {
      const response = await fetch(`${this.sources.sanctumExtra}/lsts`, {
        timeout: 10000,
        headers: {
          'User-Agent': 'LST-Router/1.0',
          'Accept': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        const lsts = data.lsts || [];
        console.log(`✅ Sanctum Extra: ${lsts.length} LSTs fetched`);
        return lsts;
      } else {
        console.log(`❌ Sanctum Extra failed: ${response.status}`);
        return [];
      }
    } catch (error) {
      console.log(`❌ Sanctum Extra error: ${error.message}`);
      return [];
    }
  }

  async fetchSanctumExtraAPYTVL(lstSymbols) {
    console.log(`🔍 Fetching APY/TVL for ${lstSymbols.length} LSTs...`);
    
    try {
      // Fetch APY data
      const apyUrl = `${this.sources.sanctumExtra}/apy/latest?${lstSymbols.map(lst => `lst=${lst}`).join('&')}`;
      const apyResponse = await fetch(apyUrl, {
        timeout: 15000,
        headers: {
          'User-Agent': 'LST-Router/1.0',
          'Accept': 'application/json'
        }
      });
      
      // Fetch TVL data
      const tvlUrl = `${this.sources.sanctumExtra}/tvl/current?${lstSymbols.map(lst => `lst=${lst}`).join('&')}`;
      const tvlResponse = await fetch(tvlUrl, {
        timeout: 15000,
        headers: {
          'User-Agent': 'LST-Router/1.0',
          'Accept': 'application/json'
        }
      });
      
      let apyData = {};
      let tvlData = {};
      
      if (apyResponse.ok) {
        const apyResult = await apyResponse.json();
        apyData = apyResult.apys || {};
        console.log(`✅ APY data: ${Object.keys(apyData).length} LSTs`);
      }
      
      if (tvlResponse.ok) {
        const tvlResult = await tvlResponse.json();
        tvlData = tvlResult.tvls || {};
        console.log(`✅ TVL data: ${Object.keys(tvlData).length} LSTs`);
      }
      
      return { apyData, tvlData };
    } catch (error) {
      console.log(`❌ APY/TVL fetch error: ${error.message}`);
      return { apyData: {}, tvlData: {} };
    }
  }

  async fetchCompassLSTs(maxPages = 15) {
    console.log('🔍 Fetching Solana Compass LSTs...');
    
    let allLSTs = [];
    let page = 1;
    let hasMore = true;
    
    while (hasMore && page <= maxPages) {
      try {
        const url = `${this.sources.compass}?limit=100&page=${page}&sort=totalLamports&order=desc`;
        const response = await fetch(url, {
          timeout: 10000,
          headers: {
            'User-Agent': 'LST-Router/1.0',
            'Accept': 'application/json'
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          const lsts = data.data || [];
          
          if (lsts.length > 0) {
            allLSTs = allLSTs.concat(lsts);
            console.log(`   📄 Page ${page}: ${lsts.length} LSTs (Total: ${allLSTs.length})`);
            
            if (lsts.length < 100) {
              hasMore = false;
            } else {
              page++;
            }
          } else {
            hasMore = false;
          }
        } else {
          hasMore = false;
        }
        
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        console.log(`   ❌ Page ${page} error: ${error.message}`);
        hasMore = false;
      }
    }
    
    console.log(`✅ Compass: ${allLSTs.length} LSTs fetched`);
    return allLSTs;
  }

  async fetchSanctumGitHubLSTs() {
    console.log('🔍 Fetching Sanctum GitHub LSTs...');
    
    try {
      const response = await fetch(this.sources.github, {
        timeout: 10000,
        headers: {
          'User-Agent': 'LST-Router/1.0',
          'Accept': 'text/plain'
        }
      });
      
      if (response.ok) {
        const data = await response.text();
        const lines = data.split('\n');
        const lsts = [];
        
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (line.includes('symbol = ')) {
            const symbol = line.split('symbol = ')[1].replace(/"/g, '').trim();
            const mint = lines[i-1]?.split('mint = ')[1]?.replace(/"/g, '').trim() || '';
            const name = lines[i-2]?.split('name = ')[1]?.replace(/"/g, '').trim() || symbol;
            const logoUri = lines[i+1]?.split('logo_uri = ')[1]?.replace(/"/g, '').trim() || '';
            
            lsts.push({
              symbol,
              mint,
              name,
              logoUri,
              source: 'github'
            });
          }
        }
        
        console.log(`✅ GitHub: ${lsts.length} LSTs fetched`);
        return lsts;
      } else {
        console.log(`❌ GitHub failed: ${response.status}`);
        return [];
      }
    } catch (error) {
      console.log(`❌ GitHub error: ${error.message}`);
      return [];
    }
  }

  async getFixedLSTData() {
    console.log('🔄 Fetching fixed LST data with proper symbol mapping...');
    
    try {
      // Fetch from all sources
      const [sanctumLSTs, compassLSTs, githubLSTs] = await Promise.all([
        this.fetchSanctumExtraLSTs(),
        this.fetchCompassLSTs(15),
        this.fetchSanctumGitHubLSTs()
      ]);
      
      console.log(`📊 Raw data: Sanctum=${sanctumLSTs.length}, Compass=${compassLSTs.length}, GitHub=${githubLSTs.length}`);
      
      // Create symbol mapping from Sanctum Extra LST list
      const symbolMapping = new Map();
      sanctumLSTs.forEach(lst => {
        if (lst.symbol && lst.mint) {
          symbolMapping.set(lst.symbol, {
            mint: lst.mint,
            name: lst.name,
            logoUri: lst.logo_uri,
            decimals: lst.decimals,
            tokenProgram: lst.token_program,
            pool: lst.pool
          });
        }
      });
      
      console.log(`📊 Symbol mapping created: ${symbolMapping.size} mappings`);
      
      // Get APY/TVL data for all symbols from Sanctum Extra
      const allSymbols = Array.from(symbolMapping.keys());
      const { apyData, tvlData } = await this.fetchSanctumExtraAPYTVL(allSymbols);
      
      // Also get APY/TVL for known high-yield LSTs that might not be in the list
      const additionalSymbols = ['INF', 'pwrsol', 'laineSOL', 'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So'];
      const { apyData: additionalApy, tvlData: additionalTvl } = await this.fetchSanctumExtraAPYTVL(additionalSymbols);
      
      // Merge additional data
      Object.assign(apyData, additionalApy);
      Object.assign(tvlData, additionalTvl);
      
      console.log(`📊 Combined APY data: ${Object.keys(apyData).length} LSTs`);
      console.log(`📊 Combined TVL data: ${Object.keys(tvlData).length} LSTs`);
      
      // Process and combine the data with proper symbol mapping
      const fixedLSTs = this.combineFixedLSTData(sanctumLSTs, compassLSTs, githubLSTs, apyData, tvlData, symbolMapping);
      
      console.log(`✅ Fixed LST data ready: ${fixedLSTs.length} LSTs`);
      return fixedLSTs;
      
    } catch (error) {
      console.error('❌ Failed to fetch fixed LST data:', error.message);
      return this.getFallbackLSTData();
    }
  }

  combineFixedLSTData(sanctumLSTs, compassLSTs, githubLSTs, apyData, tvlData, symbolMapping) {
    console.log('🔧 Combining fixed LST data with proper symbol mapping...');
    
    const lstMap = new Map();
    const processedLSTs = [];
    
    // Process all LSTs with APY/TVL data
    console.log('   Processing LSTs with APY/TVL data...');
    
    // Get all unique symbols from APY/TVL data
    const allSymbols = new Set([...Object.keys(apyData), ...Object.keys(tvlData)]);
    
    allSymbols.forEach(symbol => {
      try {
        const apy = apyData[symbol] ? apyData[symbol] * 100 : 6.0; // Convert to percentage
        const tvlLamports = tvlData[symbol] ? parseInt(tvlData[symbol]) : 0;
        const tvlSOL = tvlLamports / 1e9;
        const tvlUSD = tvlSOL * 190; // Current SOL price
        
        // Get metadata from symbol mapping
        const metadata = symbolMapping.get(symbol) || {};
        
        const enhancedLST = {
          symbol: symbol,
          mint: metadata.mint || '',
          name: metadata.name || symbol,
          apr: apy,
          tvlUSD: tvlUSD,
          tvlSOL: tvlSOL,
          decentralization: 0.8, // Default
          validatorCount: 100, // Default
          slippageBps: Math.max(5, Math.min(50, 50 - Math.log10(tvlSOL + 1) * 4)),
          verified: true,
          paused: false,
          recentSlash: false,
          source: 'sanctum_extra',
          mevEnabled: symbol.toLowerCase().includes('jito') || 
                     symbol.toLowerCase().includes('jup') ||
                     symbol.toLowerCase().includes('lido'),
          riskScore: Math.max(1, 10 - (Math.log10(tvlSOL + 1) * 4)),
          liquidityScore: Math.min(10, Math.log10(tvlSOL + 1)),
          logoUri: metadata.logoUri,
          decimals: metadata.decimals,
          tokenProgram: metadata.tokenProgram,
          pool: metadata.pool,
          sources: ['sanctum_extra'],
          lastUpdated: new Date().toISOString()
        };
        
        lstMap.set(symbol, enhancedLST);
      } catch (error) {
        console.log(`   ⚠️ Error processing LST ${symbol}: ${error.message}`);
      }
    });
    
    console.log(`   LSTs with APY/TVL data processed: ${lstMap.size}`);
    
    // Process Compass LSTs (add any missing ones)
    console.log('   Processing Compass LSTs...');
    let compassAdded = 0;
    compassLSTs.forEach(lst => {
      try {
        const token = lst.token || {};
        const symbol = token.symbol;
        
        if (!symbol || lstMap.has(symbol)) return;
        
        const tvlSOL = lst.totalLamports ? lst.totalLamports / 1e9 : 0;
        const tvlUSD = tvlSOL * 190;
        
        // Calculate APR
        const epochFee = lst.epoch_fee || {};
        const feeNumerator = epochFee.numerator || 6;
        const feeDenominator = epochFee.denominator || 100;
        const baseAPR = 6.5;
        
        let netAPR = baseAPR;
        if (feeDenominator > 0) {
          netAPR = baseAPR * (1 - feeNumerator / feeDenominator);
        }
        
        const validatorCount = lst.validatorsCount || 1;
        const decentralization = Math.min(0.95, validatorCount / 1000);
        const tvlScore = Math.min(10, Math.log10(tvlSOL + 1));
        const riskScore = Math.max(1, 10 - (decentralization * 6 + tvlScore * 4));
        
        const newLST = {
          symbol: symbol,
          mint: token.address || '',
          name: token.name || symbol,
          apr: Math.max(4.0, Math.min(8.0, netAPR)),
          tvlUSD: tvlUSD,
          tvlSOL: tvlSOL,
          decentralization: decentralization,
          validatorCount: validatorCount,
          slippageBps: Math.max(5, Math.min(50, 50 - tvlScore * 4)),
          verified: token.isVerified || false,
          paused: lst.paused || false,
          recentSlash: lst.recentSlash || false,
          source: 'compass',
          mevEnabled: symbol.toLowerCase().includes('jito') || 
                     symbol.toLowerCase().includes('jup') ||
                     symbol.toLowerCase().includes('lido'),
          riskScore: riskScore,
          liquidityScore: Math.min(10, tvlScore),
          sources: ['compass'],
          lastUpdated: new Date().toISOString()
        };
        
        if (tvlSOL >= 100) { // Minimum 100 SOL TVL
          lstMap.set(symbol, newLST);
          compassAdded++;
        }
      } catch (error) {
        console.log(`   ⚠️ Error processing Compass LST: ${error.message}`);
      }
    });
    
    console.log(`   Compass LSTs added: ${compassAdded}`);
    
    // Convert to array and sort by TVL
    const fixedLSTs = Array.from(lstMap.values());
    fixedLSTs.sort((a, b) => b.tvlSOL - a.tvlSOL);
    
    console.log(`✅ Fixed LSTs: ${fixedLSTs.length} total`);
    return fixedLSTs;
  }

  getFallbackLSTData() {
    console.log('⚠️ Using fallback LST data');
    return [
      {
        symbol: "jitoSOL",
        mint: "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn",
        name: "Jito Staked SOL",
        apr: 6.7,
        tvlUSD: 1200000000,
        tvlSOL: 6300000,
        decentralization: 0.90,
        validatorCount: 2000,
        slippageBps: 5,
        verified: true,
        paused: false,
        recentSlash: false,
        source: "fallback",
        mevEnabled: true,
        riskScore: 3.4,
        liquidityScore: 9.5,
        sources: ["fallback"],
        lastUpdated: new Date().toISOString()
      }
    ];
  }

  async generateFixedStrategy(walletAddress, strategyType = 'basic') {
    const lstData = await this.getFixedLSTData();
    
    console.log(`🎯 Generating fixed ${strategyType} strategy from ${lstData.length} LSTs...`);
    
    // Filter LSTs by criteria
    const eligibleLSTs = lstData.filter(lst => 
      lst.tvlSOL >= 1000 && // Minimum 1000 SOL TVL
      lst.apr >= 5.0 && // Minimum 5% APR
      !lst.paused && // Not paused
      !lst.recentSlash && // No recent slashes
      lst.verified // Verified contract
    );
    
    console.log(`📊 Eligible LSTs: ${eligibleLSTs.length}/${lstData.length}`);
    
    // Sort by expected yield (APR + MEV bonus)
    const sortedLSTs = eligibleLSTs.sort((a, b) => {
      const aYield = a.apr + (a.mevEnabled ? 0.1 : 0);
      const bYield = b.apr + (b.mevEnabled ? 0.1 : 0);
      return bYield - aYield;
    });
    
    // Generate strategy
    let selectedLSTs = [];
    let weights = [];
    
    if (strategyType === 'basic') {
      selectedLSTs = sortedLSTs.slice(0, 3);
      weights = [0.5, 0.3, 0.2];
    } else if (strategyType === 'advanced') {
      selectedLSTs = sortedLSTs.slice(0, 8);
      weights = [0.25, 0.2, 0.15, 0.12, 0.1, 0.08, 0.06, 0.04];
    }
    
    // Calculate strategy metrics
    const expectedYield = selectedLSTs.reduce((sum, lst, index) => {
      const mevBonus = lst.mevEnabled ? 0.1 : 0;
      return sum + ((lst.apr + mevBonus) * weights[index]);
    }, 0);
    
    const riskScore = selectedLSTs.reduce((sum, lst, index) => 
      sum + (lst.riskScore * weights[index]), 0);
    
    const strategy = {
      id: `fixed_strategy_${Date.now()}`,
      name: `Fixed ${strategyType.charAt(0).toUpperCase() + strategyType.slice(1)} Strategy`,
      type: strategyType,
      expectedYield: expectedYield,
      riskScore: riskScore,
      allocation: selectedLSTs.map((lst, index) => ({
        symbol: lst.symbol,
        weight: weights[index],
        percentage: weights[index] * 100,
        amount: 1.0 * weights[index],
        apr: lst.apr,
        expectedYield: lst.apr + (lst.mevEnabled ? 0.1 : 0),
        source: lst.source,
        sources: lst.sources,
        tvlUSD: lst.tvlUSD,
        tvlSOL: lst.tvlSOL,
        decentralization: lst.decentralization,
        mevEnabled: lst.mevEnabled,
        riskScore: lst.riskScore,
        validatorCount: lst.validatorCount,
        logoUri: lst.logoUri
      })),
      actions: selectedLSTs.map((lst, index) => ({
        type: "swap",
        from: "SOL",
        to: lst.symbol,
        amount: 1.0 * weights[index],
        reasoning: `Convert ${(weights[index] * 100).toFixed(1)}% to ${lst.symbol} for ${lst.apr.toFixed(2)}% APR${lst.mevEnabled ? ' + MEV rewards' : ''} (${lst.tvlSOL.toFixed(0)} SOL TVL)`
      })),
      source: "fixed_multi_source",
      insights: [
        {
          type: "fixed_analysis",
          priority: "high",
          title: "Fixed LST Analysis",
          description: `Strategy generated from ${lstData.length} LSTs with proper symbol mapping (${eligibleLSTs.length} eligible)`,
          recommendation: "Fixed symbol mapping ensures accurate LST analysis"
        },
        {
          type: "yield_optimization",
          priority: "high",
          title: "Maximum Yield Optimization",
          description: `Expected yield: ${expectedYield.toFixed(2)}% from ${selectedLSTs.length} LSTs`,
          recommendation: "Fixed analysis ensures maximum yield selection"
        }
      ],
      metadata: {
        totalLSTsAnalyzed: lstData.length,
        eligibleLSTs: eligibleLSTs.length,
        selectedLSTs: selectedLSTs.length,
        mevEnabledCount: selectedLSTs.filter(lst => lst.mevEnabled).length,
        averageTVL: selectedLSTs.reduce((sum, lst) => sum + lst.tvlSOL, 0) / selectedLSTs.length,
        sources: ['sanctum_extra', 'compass'],
        lastUpdated: new Date().toISOString()
      }
    };
    
    return strategy;
  }
}

// Test the fixed LST data system
async function testFixedLSTSystem() {
  console.log('🚀 FIXED LST DATA SYSTEM TEST');
  console.log('=============================');
  console.log('Testing fixed LST data with proper symbol mapping\n');
  
  const system = new FixedLSTDataSystem();
  
  try {
    // Test 1: Fetch fixed LST data
    console.log('1️⃣ Testing Fixed LST Data Fetching...');
    const lstData = await system.getFixedLSTData();
    
    console.log(`✅ Fixed LST Data: ${lstData.length} LSTs`);
    
    // Show top LSTs
    console.log('\n📊 Top 10 LSTs by TVL:');
    lstData.slice(0, 10).forEach((lst, index) => {
      console.log(`${index + 1}. ${lst.symbol}: ${lst.apr.toFixed(2)}% APR, ${lst.tvlSOL.toFixed(0)} SOL TVL`);
    });
    
    // Check if INF is now in the top LSTs
    const infLST = lstData.find(lst => lst.symbol === 'INF');
    if (infLST) {
      console.log(`\n🎯 INF LST Found: ${infLST.symbol} - ${infLST.apr.toFixed(2)}% APR, ${infLST.tvlSOL.toFixed(0)} SOL TVL`);
      const infRank = lstData.findIndex(lst => lst.symbol === 'INF') + 1;
      console.log(`   Rank: #${infRank} out of ${lstData.length} LSTs`);
    } else {
      console.log(`\n❌ INF LST still not found`);
    }
    
    // Test 2: Generate fixed strategy
    console.log('\n2️⃣ Testing Fixed Strategy Generation...');
    const basicStrategy = await system.generateFixedStrategy('test_wallet', 'basic');
    
    console.log(`✅ Fixed Basic Strategy: ${basicStrategy.name}`);
    console.log(`   Expected Yield: ${basicStrategy.expectedYield.toFixed(2)}%`);
    console.log(`   Risk Score: ${basicStrategy.riskScore.toFixed(1)}/10`);
    console.log(`   LSTs Analyzed: ${basicStrategy.metadata.totalLSTsAnalyzed}`);
    console.log(`   Eligible LSTs: ${basicStrategy.metadata.eligibleLSTs}`);
    console.log(`   Selected LSTs: ${basicStrategy.metadata.selectedLSTs}`);
    
    console.log('\n📈 Fixed Strategy Allocation:');
    basicStrategy.allocation.forEach((lst, index) => {
      console.log(`${index + 1}. ${lst.symbol}: ${lst.percentage.toFixed(1)}% (${lst.expectedYield.toFixed(2)}% yield, ${lst.tvlSOL.toFixed(0)} SOL TVL)`);
    });
    
    // Check if INF is in the strategy
    const infInStrategy = basicStrategy.allocation.find(lst => lst.symbol === 'INF');
    if (infInStrategy) {
      console.log(`\n🎯 INF is in the strategy: ${infInStrategy.percentage.toFixed(1)}% allocation`);
    } else {
      console.log(`\n❌ INF is not in the strategy`);
    }
    
    console.log('\n📊 FIXED ANALYSIS SUMMARY:');
    console.log('==========================');
    console.log(`✅ Total LSTs Available: ${lstData.length}`);
    console.log(`✅ INF LST Found: ${infLST ? 'Yes' : 'No'}`);
    console.log(`✅ INF Rank: ${infLST ? lstData.findIndex(lst => lst.symbol === 'INF') + 1 : 'N/A'}`);
    console.log(`✅ Basic Strategy Yield: ${basicStrategy.expectedYield.toFixed(2)}%`);
    console.log(`✅ INF in Strategy: ${infInStrategy ? 'Yes' : 'No'}`);
    
    if (infLST) {
      console.log(`\n🎉 SUCCESS: INF LST is now properly included!`);
      console.log(`   INF APY: ${infLST.apr.toFixed(2)}%`);
      console.log(`   INF TVL: ${infLST.tvlSOL.toFixed(0)} SOL`);
      console.log(`   INF Rank: #${lstData.findIndex(lst => lst.symbol === 'INF') + 1}`);
    } else {
      console.log(`\n❌ ISSUE: INF LST still not found`);
    }
    
  } catch (error) {
    console.error('❌ Fixed LST system test failed:', error.message);
  }
}

testFixedLSTSystem().catch(console.error);
